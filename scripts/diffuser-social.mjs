#!/usr/bin/env node
// =====================================================================
// scripts/diffuser-social.mjs — RELAIS SOCIAL, MODE REVIEW (Buffer → X, Facebook). Aucun appel de modèle. JAMAIS Instagram.
//
//   node scripts/diffuser-social.mjs                        PLAN (défaut) : événements éligibles et raisons de silence ; AUCUNE écriture, AUCUN Telegram, AUCUN Buffer
//   node scripts/diffuser-social.mjs --ecrire               passage du relais : propositions Telegram → GO social recontrôlés → Buffer → suivi / retraits (idempotent, rejouable)
//   node scripts/diffuser-social.mjs --etat                 synthèse : activation, T0, propositions, décisions, journal
//   node scripts/diffuser-social.mjs --appliquer-migration  applique 025 + 026 (additives, idempotentes)
//   node scripts/diffuser-social.mjs --autotest-ecriture    exerce les requêtes d'écriture sur une ligne jetable (supprimée), sans Telegram ni Buffer
//   node scripts/diffuser-social.mjs --controle-stock       LECTURE SEULE : l'historique de production, évalué avec un T0 = maintenant, ne produit AUCUNE proposition
//   node scripts/diffuser-social.mjs --initialiser-t0 --confirmer   fixe T0 (horloge de la base, UNE fois, immuable) après avoir rejoué le contrôle du stock
//   node scripts/diffuser-social.mjs --exclure-montpellier  enregistre l'exclusion des deux publications manuelles de FR-2026-0146 (X, Facebook)
//   node scripts/diffuser-social.mjs --inventaire-buffer    LECTURE SEULE : posts SNY présents dans Buffer (X, Facebook) et posts en attente
//   node scripts/diffuser-social.mjs --verifier-connexion | --sonder-api    LECTURE SEULE : clé, canaux, schéma de l'API
//
// ACTIVATION (réversible) : variables GitHub SNY_DIFFUSION_ACTIVE=1 ET SNY_DIFFUSION_MODE=review ET SNY_DIFFUSION_DEPUIS = témoin égal au T0 de la base.
// COUPE-CIRCUIT : SNY_DIFFUSION_ACTIVE=0 (ou toute autre valeur) ⇒ rien n'est proposé ni publié. Il n'existe AUCUN mode automatique dans ce code : tout post exige un GO social Telegram.
// Secrets : BUFFER_API_KEY, TELEGRAM_BOT_TOKEN. Variables : BUFFER_ORGANIZATION_ID, BUFFER_CHANNEL_X, BUFFER_CHANNEL_FACEBOOK, SNY_DIFFUSION_CANAUX (défaut « x,facebook »).
// Dépôt public ⇒ logs publics : identifiants d'affaire, canaux et issues seulement — ni nom, ni lieu, ni texte, ni clé.
// Code de sortie 1 seulement sur erreur technique (l'étape est `continue-on-error` : jamais bloquante pour la publication sur SNY).
// =====================================================================
import { readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { ecartsSite } from './lib/ecarts-site.mjs';
import { prevenir } from './lib/prevenir.mjs';
import { clientBuffer, ErreurBuffer } from './lib/buffer.mjs';
import { REQUETE_INTROSPECTION, comparerAuSchema, informations } from './lib/buffer-sonde.mjs';
import { dossierFiche } from './lib/fiche-page.mjs';
import { CANAUX } from './lib/diffusion-sociale.mjs';
import { portNeon, ledgerNeon } from './lib/relais-social-db.mjs';
import { verifierActivation, executerCycle, proposerNouveautes, evaluerCandidat, decouperInstructions, instructionDestructrice, empreinteTexte, CANAUX_RELAIS } from './lib/relais-social.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const CI = !!process.env.CI;
const SITE = (process.env.SNY_SITE_URL || 'https://sousnosyeux.org').replace(/\/$/, '');
const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const env = (k) => (process.env[k] || '').trim();
const log = (m) => console.log(m);

const CANAUX_ACTIFS = (env('SNY_DIFFUSION_CANAUX') || 'x,facebook').split(',').map((c) => c.trim()).filter((c) => CANAUX_RELAIS.includes(c));
const CANAL_ID = { x: env('BUFFER_CHANNEL_X'), facebook: env('BUFFER_CHANNEL_FACEBOOK') };
const DELAI_MIN = Math.min(120, Math.max(5, Number(env('SNY_DIFFUSION_DELAI_MIN')) || 15));
const MODES_ECRITURE = ['--ecrire', '--initialiser-t0', '--exclure-montpellier', '--autotest-ecriture', '--appliquer-migration'];

// COUPE-CIRCUIT AVANT TOUT ACCÈS : une passe d'écriture du cycle ne touche ni la base, ni Buffer, ni Telegram si le relais n'est pas explicitement en mode REVIEW.
if (ECRIRE && (env('SNY_DIFFUSION_ACTIVE') !== '1' || env('SNY_DIFFUSION_MODE') !== 'review')) {
  console.log('relais social INACTIF (SNY_DIFFUSION_ACTIVE ≠ 1 ou SNY_DIFFUSION_MODE ≠ review) : rien n’est proposé, rien n’est publié, rien n’est écrit');
  process.exit(0);
}

const { sql } = connecter();
const port = portNeon(sql);
const ledger = ledgerNeon(sql);
const tablePresente = async () => (await sql`select to_regclass('public.diffusions_sociales') is not null as ok`)[0].ok;

// --- --appliquer-migration : 025 (journal) puis 026 (relais REVIEW). Additives, idempotentes ; toute instruction destructrice est REFUSÉE avant exécution. -------------
if (A.includes('--appliquer-migration')) {
  for (const f of ['025_diffusions_sociales.sql', '026_relais_social_review.sql']) {
    const instructions = decouperInstructions(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));
    if (instructions.some(instructionDestructrice)) { console.error(`migration ${f} refusée : instruction destructrice`); process.exit(2); }
    for (const [i, ins] of instructions.entries()) { await sql.query(ins); log(`${f} : instruction ${i + 1}/${instructions.length} appliquée`); }
  }
  log(`tables du relais présentes : ${await port.tablesPresentes()}`);
  process.exit(0);
}

// --- --etat : synthèse (aucun contenu) ------------------------------------------------------------------------------------------------
if (A.includes('--etat')) {
  const now = new Date();
  const presentes = await port.tablesPresentes();
  const activation = verifierActivation({ env: process.env, t0Row: presentes ? await port.t0() : null, now });
  log(`relais social : ${activation.actif ? 'ACTIF (mode REVIEW)' : 'INACTIF'} · T0 ${activation.t0 ? activation.t0.toISOString() : '(non initialisé)'} · canaux : ${CANAUX_ACTIFS.join(', ') || 'aucun'}`);
  if (!activation.actif) for (const r of activation.raisons) log(`  - ${r}`);
  if (!presentes) { log('tables absentes (migrations 025/026 non appliquées) : aucune diffusion n’a jamais eu lieu'); process.exit(0); }
  const s = await port.synthese();
  log('propositions (décision · type) :'); for (const x of s.propositions) log(`  ${String(x.etat).padEnd(12)} ${x.type_event.padEnd(12)} ${x.n}`);
  log('résolutions :'); for (const x of s.resolutions) log(`  ${x.res.padEnd(12)} ${x.n}`);
  log('journal de diffusion (canal · état) :'); for (const x of s.diffusions) log(`  ${x.canal.padEnd(9)} ${x.etat.padEnd(18)} ${x.n}`);
  log(`exclusions : ${s.exclusions.length ? s.exclusions.map((x) => `${x.event_key}/${x.canal}`).join(', ') : 'aucune'}`);
  if (!s.propositions.length && !s.diffusions.length) log('  (aucune ligne : « prêt, aucune proposition encore émise »)');
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

  // Réconciliation réelle (filtre createdAt.start) sur les canaux configurés : lecture seule, doit être acceptée.
  for (const c of CANAUX.filter((x) => CANAL_ID[x])) {
    try { const t = await b.trouverPost({ channelId: CANAL_ID[c], signature: 'utm_content=sonde-sans-effet', depuis: new Date(Date.now() - 864e5).toISOString() }); ligne(t === null, `réconciliation ${c} : requête (createdAt.start) acceptée, aucun post de sonde`); }
    catch (e) { ligne(false, `réconciliation ${c} : requête refusée`, e.message); }
  }
  // Limites du plan (nombres seulement) : la file de publications programmées est-elle compatible avec nos besoins ?
  try {
    const d = await b.requete('query { account { organizations { limits { channels scheduledPosts } } } }');
    for (const o of d.account?.organizations || []) console.log(`ℹ️ limites du plan : ${o.limits.channels} canaux, ${o.limits.scheduledPosts} publications programmées`);
  } catch (e) { console.log(`ℹ️ limites du plan illisibles : ${e.message}`); }

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
  // Aucune sonde de CRÉATION : le relais n'appelle createPost que depuis une proposition portant un GO social (voir relais-social.mjs, test-relais-social.mjs).
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

// --- données publiques et contexte de composition (V4.1) ------------------------------------------------------------------------------
const now = new Date();
const artefact = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const holds = new Set((lire('data/publication-holds.json').holds || []).map((h) => h.case_id));
let wording = null;
async function composition() {
  if (!wording) wording = await import('../web/src/lib/etat-wording.ts'); // formulation officielle du site
  return { cases: artefact, ev: lire('data/evenements.json'), redirections: lire('data/redirections-affaires.json').redirections ?? {}, wording, dossierFiche, site: SITE, now };
}
// Site servi : lu une seule fois, à la demande (aucun accès réseau s'il n'y a aucun candidat).
let htmlAccueil;
const accueil = async () => { if (htmlAccueil === undefined) { htmlAccueil = null; try { const r = await fetch(`${SITE}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } }); if (r.ok) htmlAccueil = await r.text(); } catch { /* injoignable : rien n'est servi */ } } return htmlAccueil; };
async function ficheServie(id) {
  try {
    const r = await fetch(`${SITE}/affaires/${id.toLowerCase()}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    const html = r.ok ? await r.text() : '';
    return { status: r.status, hash: /data-dossier="([0-9a-f]+)"/.exec(html)?.[1] ?? null };
  } catch { return null; }
}
async function envoyerTelegram(texte, markup) {
  const token = env('TELEGRAM_BOT_TOKEN'), chat = Number(env('TELEGRAM_ALLOWED_USER_ID'));
  if (!token || !Number.isInteger(chat)) throw new Error('Telegram non configuré');
  if (process.env.SNY_DRY) { log(texte); return null; }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: texte, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram : ${String(j.description || r.status).slice(0, 80)}`);
  return j.result?.message_id ?? null;
}

// --- --inventaire-buffer : LECTURE SEULE -----------------------------------------------------------------------------------------------
async function inventaireBuffer(depuisIso) {
  if (!env('BUFFER_API_KEY') || !env('BUFFER_ORGANIZATION_ID')) throw new Error('BUFFER_API_KEY / BUFFER_ORGANIZATION_ID absents');
  const b = clientBuffer({ cle: env('BUFFER_API_KEY'), organisationId: env('BUFFER_ORGANIZATION_ID') });
  const sortie = {};
  for (const c of CANAUX_RELAIS) {
    if (!CANAL_ID[c]) { log(`➖ ${c} : canal non configuré`); sortie[c] = []; continue; }
    sortie[c] = await b.listerPosts({ channelId: CANAL_ID[c], depuis: depuisIso });
  }
  return sortie;
}
const idUtm = (t) => /utm_content=([a-z0-9-]+)/.exec(String(t))?.[1] ?? '(sans identifiant SNY)';
if (A.includes('--inventaire-buffer')) {
  const inv = await inventaireBuffer(new Date(Date.now() - 45 * 864e5).toISOString());
  let enAttente = 0;
  for (const c of CANAUX_RELAIS) {
    log(`canal ${c} : ${inv[c].length} post(s) depuis 45 jours`);
    for (const p of inv[c]) {
      const attente = ['scheduled', 'sending', 'draft', 'needs_approval'].includes(p.status);
      if (attente) enAttente++;
      log(`  ${attente ? '⏳' : '·'} ${p.status.padEnd(14)} ${idUtm(p.text).padEnd(28)} prévu ${p.dueAt ?? '—'} · envoyé ${p.sentAt ?? '—'} · ${p.externalLink ?? 'sans permalien'} · empreinte ${empreinteTexte(p.text).slice(0, 12)}`);
    }
  }
  log(enAttente ? `⚠️ ${enAttente} post(s) EN ATTENTE dans Buffer (programmés / brouillons) : à examiner avant l’activation` : '✅ aucun post en attente dans Buffer (ni programmé, ni brouillon, ni en approbation)');
  process.exit(0);
}

// --- --exclure-montpellier : les deux publications manuelles du 12/11/2026 (FR-2026-0146) ne seront JAMAIS réémises ---------------------------------------------
if (A.includes('--exclure-montpellier')) {
  const EVT = 'new_case|FR-2026-0146', UTM = 'fr-2026-0146';
  let inv = null;
  try { inv = await inventaireBuffer(new Date(Date.now() - 45 * 864e5).toISOString()); } catch (e) { log(`inventaire Buffer impossible (${String(e.message).slice(0, 80)}) : exclusion par événement seulement`); }
  for (const c of CANAUX_RELAIS) {
    const trouves = (inv?.[c] || []).filter((p) => idUtm(p.text) === UTM && p.status !== 'error');
    const p = trouves.find((x) => x.status === 'sent') ?? trouves[0] ?? null;
    log(`${c} : ${p ? `publication retrouvée dans Buffer (statut ${p.status}, ${p.externalLink ?? 'sans permalien'}, empreinte ${empreinteTexte(p.text).slice(0, 12)})` : 'AUCUN post FR-2026-0146 retrouvé dans Buffer (publication hors Buffer ou hors fenêtre) : exclusion par événement'}`);
    const neuf = await port.exclure({ event_key: EVT, canal: c, motif: 'publié à la main le 12/11/2026 (déclaré par l’éditeur) : hors circuit, jamais réémis', empreinte_texte: p ? empreinteTexte(p.text) : null, permalien: p?.externalLink ?? null });
    log(`  exclusion ${c} : ${neuf ? 'enregistrée' : 'déjà présente'}`);
  }
  process.exit(0);
}

// --- --autotest-ecriture : les requêtes d'ÉCRITURE du port s'exécutent bien en production, sur une ligne jetable supprimée aussitôt ---------------------------------
if (A.includes('--autotest-ecriture')) {
  const ev = `autotest|${Date.now()}`;
  let ok = true;
  const verif = (nom, c) => { if (!c) ok = false; log(`${c ? '✅' : '❌'} ${nom}`); };
  try {
    const cree = await port.creerProposition({ event_key: ev, case_id: 'AUTOTEST', type_event: 'new_case', identite: { autotest: true }, texte_x: 'x', texte_facebook: 'f', canaux_proposes: ['x', 'facebook'], empreinte_x: 'a', empreinte_facebook: 'b', expire_at: new Date(Date.now() + 36e5) });
    verif('création de proposition', !!cree?.proposal_id);
    verif('doublon refusé (event_key unique)', (await port.creerProposition({ event_key: ev, case_id: 'AUTOTEST', type_event: 'new_case', identite: {}, texte_x: null, texte_facebook: null, canaux_proposes: ['x'], empreinte_x: null, empreinte_facebook: null, expire_at: new Date() })) === null);
    const cle = String(cree.proposal_id).slice(0, 8);
    verif('lecture par clé de 8 caractères', (await port.propositionParCle(cle))?.event_key === ev);
    verif('réclamation d’envoi unique', (await port.reclamerEnvoi(cree.proposal_id)) === true && (await port.reclamerEnvoi(cree.proposal_id)) === false);
    await port.noterEnvoi(cree.proposal_id, 1);
    verif('décision enregistrée une seule fois', (await port.decider(cree.proposal_id, { decision: 'GO_F', canaux: ['facebook'], now: new Date(), resolution: null })) === true && (await port.decider(cree.proposal_id, { decision: 'GO_XF', canaux: ['x', 'facebook'], now: new Date(), resolution: null })) === false);
    const relue = await port.propositionParCle(cle);
    verif('décision et canaux autorisés relus', relue.decision === 'GO_F' && relue.canaux_autorises?.join() === 'facebook');
    verif('listée parmi les GO à publier', (await port.propositionsAvecGo()).some((p) => p.event_key === ev));
    await port.resoudre(cree.proposal_id, 'autotest');
    verif('listes de suivi et exclusions lisibles', Array.isArray(await port.lignesOuvertes()) && (await port.exclusionsDe(ev)) instanceof Set && (await port.empreinteTexteExclue('x', 'zz')) === false && (await port.ledgerDe(ev)) === false);
    // Immuabilité de T0 : les triggers existent ; si T0 est posé, une mise à jour NEUTRE (t0 = t0) doit être REFUSÉE (le trigger se déclenche même sans changement de valeur).
    const trig = (await sql`select tgname from pg_trigger where tgrelid = 'relais_social_config'::regclass and not tgisinternal`).map((r) => r.tgname);
    verif('triggers d’immuabilité de T0 présents (UPDATE/DELETE et TRUNCATE)', trig.includes('relais_social_config_no_update') && trig.includes('relais_social_config_no_truncate'));
    if ((await sql`select 1 x from relais_social_config where id = 1`).length) {
      let refuse = false;
      try { await sql`update relais_social_config set t0 = t0 where id = 1`; } catch { refuse = true; }
      verif('T0 posé : toute mise à jour est refusée par la base', refuse);
    } else log('➖ T0 non encore posé : refus d’UPDATE à revérifier après l’initialisation');
  } finally { await sql`delete from relais_social_propositions where event_key like 'autotest|%'`; }
  log(ok ? 'requêtes d’écriture conformes (ligne jetable supprimée)' : 'ÉCART : corriger avant d’activer');
  process.exit(ok ? 0 : 1);
}

// --- --controle-stock : l'HISTORIQUE de production, jugé avec un T0 = maintenant, ne doit produire AUCUNE proposition (lecture seule) -------------------------------
// La sélection SQL filtre déjà sur T0 : pour que le contrôle ne soit pas une tautologie, on charge TOUS les candidats depuis l'origine (T0 = 1970), puis on les juge avec
// le vrai évaluateur sous un T0 posé à l'instant de la base. Chacun doit être refusé, et le plan complet (composition comprise) ne doit trouver aucun éligible.
async function controleStock() {
  if (!(await port.tablesPresentes())) { log('tables du relais absentes : appliquer les migrations d’abord'); return false; }
  const t0 = await port.maintenantBase();
  const histo = await port.candidats(new Date(0));
  const compo = await composition();
  const sansProposition = { ...port, candidats: async () => histo };
  let eligibles = 0, bloques = 0;
  const motifs = new Map();
  for (const c of histo) {
    const v = evaluerCandidat(c, { t0, now: compo.now, holds, entree: artefact.get(c.case_id) ?? null, ficheHash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null, servi: true, ficheServie: { status: 200, hash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null }, proposition: false, ledger: false, exclusions: new Set() });
    if (v.ok) eligibles++; else { bloques++; for (const r of v.raisons) motifs.set(r.replace(/\(.*/, '').trim(), (motifs.get(r.replace(/\(.*/, '').trim()) || 0) + 1); }
  }
  log(`stock : ${histo.length} événement(s) candidat(s) depuis l’origine · ${bloques} refusé(s) avec T0 = ${t0.toISOString()} · ${eligibles} éligible(s) au niveau de l’évaluateur`);
  for (const [m, n] of [...motifs].sort((a, b) => b[1] - a[1]).slice(0, 8)) log(`    ${String(n).padStart(3)} × ${m}`);
  // Plan complet (composition, exclusions) sous le même T0, avec servi/ficheServie forcés à « vrai » : on cherche à PRENDRE EN DÉFAUT le filtre T0, pas la page servie.
  const sortiePlan = [];
  const b = await proposerNouveautes({ port: sansProposition, compo, activation: { actif: true, t0, raisons: [] }, holds, canauxConfigures: CANAUX_RELAIS, envoyer: async () => { throw new Error('envoi interdit en contrôle'); }, log: (m) => sortiePlan.push(m), ecrire: false, servi: () => true, ficheServie: async (id) => ({ status: 200, hash: compo.ev.fiches_approuvees?.[id]?.hash ?? null }) });
  const eligiblesPlan = sortiePlan.filter((l) => /ÉLIGIBLE/.test(l)).length;
  const [prop] = await sql`select count(*)::int n from relais_social_propositions`;
  const [go] = await sql`select count(*)::int n from relais_social_propositions where decision in ('GO_XF', 'GO_F', 'GO_X') and resolution is null`;
  log(`plan complet : ${b.candidats} candidat(s), ${eligiblesPlan} éligible(s) · propositions déjà en base : ${prop.n} · GO en attente d’exécution : ${go.n}`);
  const bon = eligibles === 0 && eligiblesPlan === 0 && go.n === 0;
  log(bon ? '✅ ZÉRO événement historique susceptible de générer une proposition sociale' : '❌ des événements passent le filtre T0 : NE PAS ACTIVER, corriger la cause');
  return bon;
}
if (A.includes('--controle-stock')) process.exit((await controleStock()) ? 0 : 1);

// --- --initialiser-t0 : UNE seule fois, horloge de la base, immuable ; seulement si le contrôle du stock est au vert -------------------------------------------------
if (A.includes('--initialiser-t0')) {
  if (!A.includes('--confirmer')) { console.error('refusé : --confirmer requis (GO de mise en service)'); process.exit(2); }
  if (!(await port.tablesPresentes())) { console.error('tables absentes : appliquer les migrations d’abord'); process.exit(1); }
  const deja = await port.t0();
  if (deja) { log(`T0 déjà initialisé (${new Date(deja.t0).toISOString()}, ${deja.provenance}) : INCHANGÉ — il ne se modifie jamais`); process.exit(0); }
  if (!(await controleStock())) { console.error('contrôle du stock en échec : T0 NON initialisé'); process.exit(1); }
  const provenance = `horloge de la base Neon · ${process.env.GITHUB_RUN_ID ? `run GitHub ${process.env.GITHUB_RUN_ID}` : 'exécution locale'} · ${String(process.env.GITHUB_SHA || '').slice(0, 7)}`;
  const t0 = await port.initialiserT0(provenance);
  if (!t0) { log('T0 initialisé entre-temps par un autre passage : INCHANGÉ'); process.exit(0); }
  log(`T0 = ${t0.toISOString()} (${provenance})`);
  log(`TEMOIN_T0=${t0.toISOString().replace(/\.\d+Z$/, 'Z')}`);
  process.exit(0);
}

// --- PLAN (défaut) et --ecrire : un passage complet du relais -------------------------------------------------------------------------------
if (!(await port.tablesPresentes())) { log('tables du relais absentes (migrations 025/026 non appliquées) : relais DÉSACTIVÉ, rien n’est proposé ni publié'); process.exit(0); }
const activation = verifierActivation({ env: process.env, t0Row: await port.t0(), now });
const compo = await composition();
const buffer = ECRIRE && activation.actif && env('BUFFER_API_KEY') && env('BUFFER_ORGANIZATION_ID') ? clientBuffer({ cle: env('BUFFER_API_KEY'), organisationId: env('BUFFER_ORGANIZATION_ID') }) : null;
if (ECRIRE && activation.actif && !buffer) { console.error('BUFFER_API_KEY ou BUFFER_ORGANIZATION_ID absent : relais impossible'); process.exit(1); }
const alerter = async (texte) => { if (ECRIRE) await prevenir(texte); };
// servi() est synchrone dans l'évaluateur : la page d'accueil est lue avant la boucle (une seule requête), seulement s'il y a un candidat potentiel.
if (activation.actif) await accueil();
const resultat = await executerCycle({
  port, compo, activation, holds, ecrire: ECRIRE, log, alerter, buffer, ledger,
  canauxConfigures: CANAUX_ACTIFS.filter((c) => CANAL_ID[c]), channelIds: CANAL_ID, delaiMin: DELAI_MIN,
  envoyer: envoyerTelegram, servi: (id) => htmlAccueil !== null && ecartsSite(htmlAccueil, [id], artefact).length === 0, ficheServie,
});
if (CI && !ECRIRE) log('plan : aucune écriture, aucun message, aucun appel Buffer');
process.exitCode = resultat.erreurs ? 1 : 0;
