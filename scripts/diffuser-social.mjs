#!/usr/bin/env node
// =====================================================================
// scripts/diffuser-social.mjs — relais social (Buffer → X, Facebook, Instagram) des nouveautés APPROUVÉES et SERVIES. Aucun appel de modèle.
//
//   node scripts/diffuser-social.mjs                       PLAN (défaut) : événements éligibles et raisons, AUCUN appel Buffer, AUCUNE écriture
//   node scripts/diffuser-social.mjs --ecrire              diffuse (si activée), réconcilie, suit, retire — idempotent, rejouable
//   node scripts/diffuser-social.mjs --verifier-connexion  LECTURE SEULE : clé, organisation, canaux, requête de réconciliation (à lancer avant l'activation)
//   node scripts/diffuser-social.mjs --sonder-api         LECTURE SEULE : confronte le client Buffer au schéma réel (introspection) + 3 sondes sans effet (identifiants inexistants) — aucune publication
//   node scripts/diffuser-social.mjs --appliquer-migration  applique supabase/migrations/025_diffusions_sociales.sql (additive, idempotente) — action manuelle du workflow sny-diffusion
//   node scripts/diffuser-social.mjs --etat                synthèse du journal (compteurs par canal et par état)
//
// ACTIVATION (réversible, aucune publication historique) : variables GitHub SNY_DIFFUSION_ACTIVE=1 et SNY_DIFFUSION_DEPUIS=<instant ISO de mise en service>.
// Tout événement dont le GO (ou le message d'approbation) précède SNY_DIFFUSION_DEPUIS est inéligible : pas de backfill. SNY_DIFFUSION_ACTIVE ≠ 1 ⇒ rien n'est publié.
// Secrets : BUFFER_API_KEY. Variables : BUFFER_ORGANIZATION_ID, BUFFER_CHANNEL_X, BUFFER_CHANNEL_FACEBOOK, BUFFER_CHANNEL_INSTAGRAM, SNY_DIFFUSION_CANAUX (défaut « x,facebook »).
// Dépôt public ⇒ logs publics : identifiants d'affaire, canaux et issues seulement — ni nom, ni lieu, ni texte, ni clé.
// Sortie GitHub Actions : aucune. Code de sortie 1 seulement sur erreur technique (jamais bloquant pour la publication : l'étape est `continue-on-error`).
// =====================================================================
import { readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { goPublication } from './lib/publication-gates.mjs';
import { ecartsSite } from './lib/ecarts-site.mjs';
import { prevenir } from './lib/prevenir.mjs';
import { clientBuffer, ErreurBuffer } from './lib/buffer.mjs';
import { REQUETE_INTROSPECTION, comparerAuSchema, informations } from './lib/buffer-sonde.mjs';
import { diffuserCanal, suivreLigne, retirerLigne, reconcilierSansCreer } from './lib/diffusion-flux.mjs';
import { CANAUX, evaluerEvenement, composerMessage, lienDiffusion, cleEvenement, dateSourceNouvelleAffaire } from './lib/diffusion-sociale.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const CI = !!process.env.CI;
const SITE = (process.env.SNY_SITE_URL || 'https://sousnosyeux.org').replace(/\/$/, '');
const IMAGE_INSTAGRAM = `${SITE}/og-sousnosyeux.png`; // visuel neutre existant (aucune photo, aucun nom), URL publique stable
const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const env = (k) => (process.env[k] || '').trim();

const ACTIVE = env('SNY_DIFFUSION_ACTIVE') === '1';
const depuis = env('SNY_DIFFUSION_DEPUIS') ? new Date(env('SNY_DIFFUSION_DEPUIS')) : null;
const depuisValide = depuis && !Number.isNaN(depuis.getTime()) && depuis.getTime() <= Date.now() + 5 * 6e4 ? depuis : null;
const CANAUX_ACTIFS = (env('SNY_DIFFUSION_CANAUX') || 'x,facebook').split(',').map((c) => c.trim()).filter((c) => CANAUX.includes(c));
const CANAL_ID = { x: env('BUFFER_CHANNEL_X'), facebook: env('BUFFER_CHANNEL_FACEBOOK'), instagram: env('BUFFER_CHANNEL_INSTAGRAM') };
const DELAI_MIN = Math.min(120, Math.max(5, Number(env('SNY_DIFFUSION_DELAI_MIN')) || 15));

const { sql } = connecter();

// --- journal (Neon) -------------------------------------------------------------------------------------------------------------
const tablePresente = async () => (await sql`select to_regclass('public.diffusions_sociales') is not null as ok`)[0].ok;
const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
const ledger = {
  lire: async (k, c) => (await sql`select * from diffusions_sociales where event_key = ${k} and canal = ${c}`)[0] || null,
  reserver: async (l) => (await sql`insert into diffusions_sociales (event_key, canal, type_event, case_id, etat, texte) values (${l.event_key}, ${l.canal}, ${l.type_event}, ${l.case_id}, 'reserve', ${l.texte}) on conflict do nothing returning event_key`).length === 1,
  maj: async (k, c, p) => sql`update diffusions_sociales set etat = coalesce(${p.etat ?? null}, etat), buffer_post_id = coalesce(${p.buffer_post_id ?? null}, buffer_post_id),
      soumis_at = coalesce(${iso(p.soumis_at)}::timestamptz, soumis_at), envoye_at = coalesce(${iso(p.envoye_at)}::timestamptz, envoye_at),
      permalien = coalesce(${p.permalien ?? null}, permalien), erreur = coalesce(${p.erreur ?? null}, erreur), updated_at = now() where event_key = ${k} and canal = ${c}`,
};

// --- --appliquer-migration : migration 025 (additive, idempotente, aucune instruction destructrice) ---------------------------------------------
if (A.includes('--appliquer-migration')) {
  const texte = readFileSync(new URL('../supabase/migrations/025_diffusions_sociales.sql', import.meta.url), 'utf8');
  const sansCommentaires = texte.replace(/^--.*$/gm, '');
  if (/\b(drop|truncate|delete)\b/i.test(sansCommentaires)) { console.error('migration refusée : instruction destructrice'); process.exit(2); }
  const instructions = sansCommentaires.split(/;[ \t]*\r?\n/).map((x) => x.trim()).filter(Boolean);
  for (const [i, ins] of instructions.entries()) { await sql.query(ins); console.log(`instruction ${i + 1}/${instructions.length} appliquée`); }
  console.log(`journal présent : ${await tablePresente()}`);
  process.exit(0);
}

// --- --etat : synthèse du journal (aucun contenu) -------------------------------------------------------------------------------------
if (A.includes('--etat')) {
  if (!(await tablePresente())) { console.log('journal absent (migration 025 non appliquée) : aucune diffusion n’a jamais eu lieu'); process.exit(0); }
  const l = await sql`select canal, etat, type_event, count(*)::int n, min(created_at)::date premier, max(created_at)::date dernier from diffusions_sociales group by 1, 2, 3 order by 1, 2, 3`;
  console.log(`diffusion ${ACTIVE ? 'ACTIVÉE' : 'désactivée'} · depuis ${depuisValide ? depuisValide.toISOString() : '(non datée)'} · canaux : ${CANAUX_ACTIFS.join(', ') || 'aucun'}`);
  for (const x of l) console.log(`  ${x.canal.padEnd(9)} ${x.type_event.padEnd(11)} ${x.etat.padEnd(18)} ${String(x.n).padStart(3)}  (${x.premier} → ${x.dernier})`);
  if (!l.length) console.log('  (aucune ligne : « prêt et testé, publication réelle non encore observée »)');
  process.exit(0);
}

// --- --sonder-api : LECTURE SEULE (introspection) + sondes sur des identifiants INEXISTANTS : rien ne peut être créé, publié ni supprimé -------------------------
if (A.includes('--sonder-api')) {
  if (!env('BUFFER_API_KEY')) { console.log('❌ clé d’API absente'); process.exit(1); }
  const b = clientBuffer({ cle: env('BUFFER_API_KEY'), organisationId: env('BUFFER_ORGANIZATION_ID') });
  let bon = true;
  const ligne = (cond, nom, detail = '') => { if (!cond) bon = false; console.log(`${cond ? '✅' : '❌'} ${nom}${detail ? ` — ${detail}` : ''}`); };
  let schema;
  try { schema = await b.requete(REQUETE_INTROSPECTION); } catch (e) { console.log(`❌ introspection impossible : ${e.message}`); process.exit(1); }
  for (const c of comparerAuSchema(schema)) ligne(c.ok, c.nom, c.detail);
  for (const i of informations(schema)) console.log(`ℹ️ ${i}`);

  // Sondes : un identifiant qui n'existe pas ne peut rien créer ni supprimer. Elles prouvent que la clé est acceptée par les chemins d'écriture (autre chose qu'un refus d'authentification).
  const INEXISTANT = '000000000000000000000000';
  const authent = (m) => /unauthor|forbidden|permission|authenticat|invalid (api )?(key|token)|scope/i.test(String(m));
  try {
    await b.supprimerPost(INEXISTANT);
    ligne(false, 'sonde deletePost : réponse inattendue (succès sur un identifiant inexistant)');
  } catch (e) {
    ligne(e instanceof ErreurBuffer && e.kind === 'refus' && !authent(e.message), 'sonde deletePost (identifiant inexistant) : chemin d’annulation joignable, refus métier typé', e.message);
  }
  try { const p = await b.lirePost(INEXISTANT); ligne(p === null, 'sonde post (identifiant inexistant) : introuvable = null', String(p)); }
  catch (e) { ligne(e instanceof ErreurBuffer && e.kind === 'refus' && !authent(e.message), 'sonde post (identifiant inexistant) : refus métier typé, pas d’échec d’authentification', e.message); }
  try {
    const p = await b.creerPost({ channelId: INEXISTANT, canal: 'x', texte: 'sonde sans effet', dueAt: new Date(Date.now() + 30 * 864e5).toISOString() });
    ligne(false, 'sonde createPost : un post a été créé sur un canal inexistant (ANORMAL) — suppression tentée');
    try { await b.supprimerPost(p.id); } catch { /* signalé ci-dessus */ }
  } catch (e) {
    ligne(e instanceof ErreurBuffer && e.kind === 'refus' && !authent(e.message), 'sonde createPost (canal inexistant) : chemin de création joignable, refus métier typé, rien créé', e.message);
  }
  console.log(bon ? 'schéma et permissions conformes aux hypothèses du client (aucun post créé, publié ni supprimé)' : 'ÉCART démontré : corriger les ❌ avant d’activer');
  process.exit(bon ? 0 : 1);
}

// --- --verifier-connexion : LECTURE SEULE ---------------------------------------------------------------------------------------------
if (A.includes('--verifier-connexion')) {
  const rap = [];
  const ok = (nom, cond, detail = '') => { rap.push(cond); console.log(`${cond ? '✅' : '❌'} ${nom}${detail ? ` — ${detail}` : ''}`); };
  ok('clé d’API présente (BUFFER_API_KEY)', !!env('BUFFER_API_KEY'));
  ok('organisation configurée (BUFFER_ORGANIZATION_ID)', !!env('BUFFER_ORGANIZATION_ID'));
  if (env('BUFFER_API_KEY') && !env('BUFFER_ORGANIZATION_ID')) {
    // Aide à l'activation : identifiants opaques seulement (inutilisables sans la clé), ni nom ni compte.
    try {
      for (const org of await clientBuffer({ cle: env('BUFFER_API_KEY') }).organisations()) {
        console.log(`ℹ️ organisation ${org} — canaux : ${(await clientBuffer({ cle: env('BUFFER_API_KEY'), organisationId: org }).canaux()).map((c) => `${c.service}=${c.id}`).join(', ') || 'aucun'}`);
      }
    } catch (e) { console.log(`ℹ️ liste des organisations impossible : ${e.message}`); }
  }
  ok('journal présent (migration 025)', await tablePresente());
  if (env('BUFFER_API_KEY') && env('BUFFER_ORGANIZATION_ID')) {
    const b = clientBuffer({ cle: env('BUFFER_API_KEY'), organisationId: env('BUFFER_ORGANIZATION_ID') });
    try {
      const canaux = await b.canaux();
      ok('API Buffer joignable, canaux listés', true, `${canaux.length} canal(aux) dans l’organisation`);
      const SERVICE = { x: 'twitter', facebook: 'facebook', instagram: 'instagram' };
      for (const c of CANAUX) {
        if (!CANAL_ID[c]) { console.log(`➖ ${c} : non configuré (désactivé)`); continue; }
        const k = canaux.find((x) => x.id === CANAL_ID[c]);
        ok(`canal ${c} : connu`, !!k);
        if (k) { ok(`canal ${c} : service ${SERVICE[c]}`, k.service === SERVICE[c], k.service); ok(`canal ${c} : connecté, non verrouillé, file active`, !k.isDisconnected && !k.isLocked && !k.isQueuePaused, `isDisconnected=${k.isDisconnected} isLocked=${k.isLocked} isQueuePaused=${k.isQueuePaused}`); }
      }
      const premier = CANAUX.find((c) => CANAL_ID[c]);
      if (premier) {
        try { await b.trouverPost({ channelId: CANAL_ID[premier], signature: 'utm_content=verification-sans-effet', depuis: new Date(Date.now() - 864e5).toISOString() }); ok('requête de réconciliation (posts) acceptée par Buffer', true); }
        catch (e) { ok('requête de réconciliation (posts) acceptée par Buffer', false, e.message); }
      }
    } catch (e) { ok('API Buffer joignable', false, e.message); }
  }
  console.log(rap.every(Boolean) ? '\nprêt à activer (aucune publication n’a été faite par cette vérification)' : '\nNON prêt : corriger les ❌ avant d’activer');
  process.exit(rap.every(Boolean) ? 0 : 1);
}

// --- données publiques et mémoire --------------------------------------------------------------------------------------------------
if (ECRIRE && !ACTIVE) { console.log('diffusion sociale DÉSACTIVÉE (SNY_DIFFUSION_ACTIVE ≠ 1) : rien n’est publié, rien n’est écrit'); process.exit(0); }
const artefact = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const holds = new Set((lire('data/publication-holds.json').holds || []).map((h) => h.case_id));
const fichesApprouvees = new Set(Object.keys(lire('data/evenements.json').fiches_approuvees || {}));
const now = new Date();
const log = (m) => console.log(m);
const alerter = async (texte) => { if (ECRIRE) await prevenir(texte); };

let wording;
try { wording = await import('../web/src/lib/etat-wording.ts'); } catch { console.error('formulation officielle du site illisible : silence'); process.exit(ECRIRE ? 1 : 0); }
const phraseDe = (entree) => {
  const p = (entree.sources || [])[0];
  const src = wording.sourceAffichee(entree.etat ?? null, p ? { media: p.media, date: p.publication_date, url: p.url } : null);
  const lignes = wording.phrasesEtat(entree.statut_judiciaire, entree.etat ?? null, src);
  // Phrase d'état + (si le site la porte) mention de présomption / non-définitivité : les mêmes mots que la fiche.
  return { phrase: lignes[0], mention: lignes.slice(1).join(' ') || null };
};

const journalPresent = await tablePresente();
if (ECRIRE && !journalPresent) { console.log('journal absent (migration 025 non appliquée) : diffusion DÉSACTIVÉE'); process.exit(0); }

// --- 1. événements candidats (depuis Neon) ---------------------------------------------------------------------------------------------
const evenements = [];
if (depuisValide) {
  const dep = depuisValide.toISOString();
  // Nouvelles affaires : GO publication explicite postérieur à l'activation + message d'approbation envoyé après l'activation (donc porteur de la portée « relais social »).
  const ids = (await sql`select distinct case_id from reviews where reviewed_at >= ${dep}::timestamptz and decision = 'validé'`).map((r) => r.case_id);
  if (ids.length) {
    const cases = await sql`select case_id, publication_status::text ps from cases where case_id = any(${ids}::text[])`;
    const revues = await sql`select case_id, reviewed_by, decision::text decision, comment, reviewed_at from reviews where case_id = any(${ids}::text[]) order by reviewed_at`;
    for (const c of cases) {
      const rv = revues.filter((r) => r.case_id === c.case_id);
      const go = goPublication(rv, depuisValide);
      if (!go) continue;
      const id8 = /Telegram (?:VALIDER ET )?PUBLIER ([0-9a-f]{8})/.exec(go.comment || '')?.[1];
      const [envoi] = id8 ? await sql`select sent_at from telegram_envois where kind = 'decision' and cle like ${id8 + '%'} order by sent_at limit 1` : [];
      const entree = artefact.get(c.case_id) || null;
      evenements.push({ type: 'new_case', case_id: c.case_id, event_key: cleEvenement('new_case', c.case_id), go_at: new Date(go.reviewed_at), envoi_at: envoi ? new Date(envoi.sent_at) : null,
        source_date: dateSourceNouvelleAffaire(entree), ps: c.ps, retire: rv.some((r) => r.decision === 'retirer') });
    }
  }
  // Évolutions : clic Telegram VALIDATE sur une proposition d'état, appliquée, postérieure à l'activation.
  const evo = await sql`
    select p.proposal_id::text pid, p.case_id, p.statut_avant::text avant, p.statut_propose::text apres, p.decided_at, a.publication_date::text pd,
           c.publication_status::text ps, t.sent_at,
           exists (select 1 from reviews r where r.case_id = p.case_id and r.decision = 'retirer') retire
      from state_proposals p join cases c using (case_id) left join articles a on a.article_id = p.article_id
      left join telegram_envois t on t.kind = 'decision' and t.cle = p.proposal_id::text
     where p.decision = 'ACCEPT' and p.decided_by ilike '%Telegram%' and p.applied_event_id is not null and p.decided_at >= ${dep}::timestamptz
       and p.statut_propose is not null and p.statut_avant is distinct from p.statut_propose`;
  for (const p of evo) {
    evenements.push({ type: 'case_update', case_id: p.case_id, event_key: cleEvenement('case_update', p.case_id, p.apres), go_at: new Date(p.decided_at), envoi_at: p.sent_at ? new Date(p.sent_at) : null,
      statut_avant: p.avant, statut_apres: p.apres, source_date: p.pd, ps: p.ps, retire: p.retire });
  }
}

// --- 2. site servi (une lecture) ------------------------------------------------------------------------------------------------------
let htmlAccueil = null;
try { const r = await fetch(`${SITE}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } }); if (r.ok) htmlAccueil = await r.text(); } catch { /* site injoignable : rien n'est servi */ }
const serviA = (id) => htmlAccueil !== null && ecartsSite(htmlAccueil, [id], artefact).length === 0;
async function ficheServie(id) {
  if (!fichesApprouvees.has(id)) return false;
  try { return (await fetch(`${SITE}/affaires/${id.toLowerCase()}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } })).ok; } catch { return false; }
}

// --- 3. éligibilité + diffusion ---------------------------------------------------------------------------------------------------------
const buffer = ECRIRE && env('BUFFER_API_KEY') && env('BUFFER_ORGANIZATION_ID') ? clientBuffer({ cle: env('BUFFER_API_KEY'), organisationId: env('BUFFER_ORGANIZATION_ID') }) : null;
const canaux = CANAUX_ACTIFS.filter((c) => CANAL_ID[c]);
if (ECRIRE && !buffer) { console.error('BUFFER_API_KEY ou BUFFER_ORGANIZATION_ID absent : diffusion impossible'); process.exit(1); }
let erreurs = 0;
const traites = new Set(); // (événement|canal) déjà réconciliés ou créés par diffuserCanal pendant ce passage
let eligibles = 0;
for (const ev of evenements) {
  const entree = artefact.get(ev.case_id) || null;
  const verdict = evaluerEvenement(ev, { now, depuis: depuisValide, holds, publication_status: ev.ps, retire: ev.retire, entree, servi: serviA(ev.case_id) });
  if (!verdict.ok) { log(`· ${ev.type} ${ev.case_id} : SILENCE — ${verdict.raisons.join(' ; ')}`); continue; }
  eligibles++;
  const fiche = await ficheServie(ev.case_id);
  const ph = phraseDe(entree);
  for (const canal of canaux) {
    const lien = canal === 'instagram' ? null : lienDiffusion({ site: SITE, case_id: ev.case_id, type: ev.type, statut: ev.statut_apres, canal, fiche });
    const m = composerMessage({ type: ev.type, canal, entree, ph, lien });
    if (m.erreur) { log(`· ${ev.type} ${ev.case_id} [${canal}] : SILENCE — ${m.erreur}`); continue; }
    if (!ECRIRE) { log(`· ${ev.type} ${ev.case_id} [${canal}] : ÉLIGIBLE (plan, rien envoyé)${CI ? '' : `\n${m.texte}\n`}`); continue; }
    try {
      const r = await diffuserCanal({ ev, canal, texte: m.texte, channelId: CANAL_ID[canal], imageUrl: IMAGE_INSTAGRAM, lien, ledger, buffer, now, delaiMin: DELAI_MIN, alerter });
      traites.add(`${ev.event_key}|${canal}`);
      log(`· ${ev.type} ${ev.case_id} [${canal}] : ${r.action}${r.etat ? ` (${r.etat})` : ''}`);
      if (r.action === 'echec') { erreurs++; await alerter(`⚠️ <b>Diffusion sociale refusée</b> (${canal}, ${ev.case_id}) : ${r.erreur}`); }
    } catch (e) { erreurs++; log(`· ${ev.type} ${ev.case_id} [${canal}] : erreur technique isolée (${String(e.message).slice(0, 80)})`); }
  }
}
log(`${evenements.length} événement(s) candidat(s) depuis l’activation, ${eligibles} éligible(s)`);

// --- 4. retraits puis suivi des lignes ouvertes --------------------------------------------------------------------------------------------
if (ECRIRE) {
  const ouvertes = await sql`select * from diffusions_sociales where etat in ('reserve', 'soumis', 'programme', 'envoye', 'verifie') and created_at > now() - interval '30 days'`;
  const ids = [...new Set(ouvertes.map((r) => r.case_id))];
  const etats = ids.length ? await sql`select c.case_id, c.publication_status::text ps, exists (select 1 from reviews r where r.case_id = c.case_id and r.decision = 'retirer') retire from cases c where c.case_id = any(${ids}::text[])` : [];
  const parId = new Map(etats.map((e) => [e.case_id, e]));
  for (const row of ouvertes) {
    try {
      const e = parId.get(row.case_id);
      const motif = !e || e.ps !== 'publiée' ? 'affaire retirée' : e.retire ? 'revue « retirer »' : holds.has(row.case_id) ? 'HOLD de publication' : !artefact.has(row.case_id) ? 'absente de l’artefact public' : null;
      if (motif) { const r = await retirerLigne({ row, motif, channelId: CANAL_ID[row.canal], ledger, buffer, alerter }); log(`· retrait ${row.case_id} [${row.canal}] : ${r.action}`); continue; }
      if (row.etat === 'reserve') {
        // Réservation non résolue : si l'événement est encore éligible, diffuserCanal l'a déjà réconciliée ci-dessus ; sinon on retrouve le post sans jamais en créer un.
        if (!traites.has(`${row.event_key}|${row.canal}`)) { const r = await reconcilierSansCreer({ row, channelId: CANAL_ID[row.canal], ledger, buffer, now, alerter }); log(`· réconciliation ${row.case_id} [${row.canal}] : ${r.action}`); }
        continue;
      }
      if (row.etat !== 'verifie') { const r = await suivreLigne({ row, ledger, buffer, now, alerter }); if (r.action !== 'inchange' && r.action !== 'rien') log(`· suivi ${row.case_id} [${row.canal}] : ${r.action}${r.etat ? ` (${r.etat})` : ''}`); }
    } catch (e) { erreurs++; log(`· suivi/retrait ${row.case_id} [${row.canal}] : erreur technique isolée (${String(e.message).slice(0, 80)})`); }
  }
}
process.exitCode = erreurs ? 1 : 0;
