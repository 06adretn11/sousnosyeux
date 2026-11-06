#!/usr/bin/env node
// =====================================================================
// scripts/reprendre-sans-perte.mjs — REPRISE de l'encours après la correction « une relecture enrichit les acquis, elle ne les remplace pas » (06/11/2026).
//
//   node scripts/reprendre-sans-perte.mjs                  # PLAN : inventaire seulement (aucune écriture, aucun modèle, aucun envoi)
//   node scripts/reprendre-sans-perte.mjs --ecrire         # régénère les mises à jour de fiches défectueuses (version approuvée + relecture) ; requalifie les faits territoriaux
//   --case FR-2026-0002[,FR-2026-0001…]   limite aux affaires listées · --limite N   (défaut 10 régénérations de fiches par passage)
//
// DEUX reprises, avec les mécanismes existants (rien de nouveau) :
//   A. MISES À JOUR DE FICHES (new_case_proposals, payload.page.mise_a_jour) dont le diff proposait de retirer des étapes ou des sources.
//      La dernière proposition par affaire est regardée ; si elle retirait quelque chose (ou si un passage précédent l'avait fait), la candidate est REGÉNÉRÉE par
//      generer-fiche (qui fusionne désormais avec la version approuvée : lib/fiche-acquis.mjs) puis reproposée par proposer-fiche — une nouvelle empreinte, un nouveau message.
//   B. FAITS TERRITORIAUX / MOBILISATIONS (state_proposals « +reactions », version antérieure à .q3, sans décision) : chaque fait est requalifié À PARTIR DE SA PROPRE PREUVE
//      avec l'extracteur corrigé. Fait modifié → proposition corrigée sous la version `.q3+reactions` (clé d'idempotence distincte) ; fait que sa preuve n'établit plus → « à qualifier » (REVIEW machine), aucune approbation demandée.
// Une proposition remplacée n'est JAMAIS approuvée ni rejetée à la place de l'éditeur : elle reçoit une décision MACHINE « SUPERSEDED » (décideur non humain), son ancien bouton devient
// inerte (« déjà décidée »). Les REVIEW d'Adrien sont conservées telles quelles (historique intact). Logs publics : compteurs et identifiants techniques seulement.
// =====================================================================
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { connecter } from './lib/neon.mjs';
import { dossierFiche, dossierGeneree, changementsFiche, empreinteApprouvee, hashDossier } from './lib/fiche-page.mjs';
import { selectionnerMisesAJour } from './lib/fiche-miseajour.mjs';
import { extraireReactions } from './lib/evenement-institutionnel.mjs';
import { journaliser } from './lib/telegram-clics.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const val = (f) => (A.includes(f) ? A[A.indexOf(f) + 1] : null);
const SEULS = val('--case') ? new Set(val('--case').split(',')) : null;
const LIMITE = Number(val('--limite') || 10);
const MACHINE = 'reprise sans perte 06/11/2026 (agent, non humain)';
const racine = (f) => new URL(`../${f}`, import.meta.url);
const lire = (f) => JSON.parse(readFileSync(racine(f), 'utf8'));
const holds = new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id));
const publiques = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const { sql } = connecter();
const node = process.execPath;
const script = (f) => fileURLToPath(new URL(`./${f}`, import.meta.url));
const exec = (f, args) => { try { return { ok: true, out: execFileSync(node, [script(f), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000 }) }; } catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; } };

/** Décision MACHINE (jamais attribuée à l'éditeur) : rend l'ancien bouton inerte sans rien approuver ni rejeter à sa place sur le fond. */
async function superseder(table, pid, decision, commentaire) {
  if (!ECRIRE) return;
  if (table === 'new_case_proposals') await sql`update new_case_proposals set decision = ${decision}::proposal_decision, decided_by = ${MACHINE}, decided_at = now(), decision_comment = ${commentaire}, applied_at = now() where proposal_id = ${pid}::uuid and decision is null`;
  else await sql`update state_proposals set decision = ${decision}::proposal_decision, decided_by = ${MACHINE}, decided_at = now(), decision_comment = ${commentaire} where proposal_id = ${pid}::uuid and decision is null`;
}

// =====================================================================  A. mises à jour de fiches
console.log('— A. mises à jour de fiches —');
const props = await sql`
  select p.proposal_id::text pid, p.decision::text decision, p.created_at, p.payload->'page'->>'case_id' case_id, p.payload->'page'->>'hash' hash,
         p.payload->'page'->'mise_a_jour' maj, p.payload->'page'->'sources_a_rattacher' srcs
    from new_case_proposals p where p.payload->'page' ? 'mise_a_jour' order by p.created_at`;
const parAffaire = new Map();
for (const p of props) { if (SEULS && !SEULS.has(p.case_id)) continue; (parAffaire.get(p.case_id) || parAffaire.set(p.case_id, []).get(p.case_id)).push(p); }
const defectueuse = (p) => (p.maj?.retirees?.length || 0) + (p.maj?.sources_retirees?.length || 0) > 0;
const aReprendre = [];
for (const [id, l] of parAffaire) {
  const derniere = l[l.length - 1];
  const decidee = derniere.decision && derniere.decision !== 'REVIEW_REQUIRED';           // ACCEPT / REJECT : l'éditeur (ou la reprise) a tranché
  const deja = (await sql`select 1 x from telegram_journal where kind = 'application' and cle = ${`reprise-sans-perte:${id}:${derniere.pid.slice(0, 8)}`} limit 1`).length > 0;
  if (decidee || deja || !defectueuse(derniere)) continue;
  aReprendre.push({ id, derniere, enAttente: l.filter((p) => !p.decision) });
}
console.log(`mises à jour de fiches : ${parAffaire.size} affaire(s) avec proposition · ${aReprendre.length} défectueuse(s) à reprendre${aReprendre.length ? ` : ${aReprendre.map((x) => `${x.id} (${x.derniere.decision ?? 'en attente'})`).join(', ')}` : ''}`);

if (ECRIRE) {
  const ids = aReprendre.map((x) => x.id).slice(0, LIMITE);
  const lignes = ids.length ? await sql`
    select p.proposal_id::text k, p.case_id, a.url, a.media, a.publication_date::text pd, p.payload->>'rattachement' rat, p.decision::text decision, p.facts
      from state_proposals p join articles a using (article_id)
     where p.analysis_action = 'ENRICHMENT' and p.created_at > now() - interval '75 days' and p.case_id = any(${ids}) order by p.created_at` : [];
  const revues = ids.length ? await sql`select case_id, reviewed_by, decision::text decision, comment from reviews where case_id = any(${ids}) and comment like '[Fiche approuvée %' order by reviewed_at` : [];
  for (const x of aReprendre.slice(0, LIMITE)) {
    const pub = dossierFiche(x.id);
    const approuvee = !!(pub && empreinteApprouvee(revues.filter((r) => r.case_id === x.id), x.id, pub));
    if (!pub || !approuvee || holds.has(x.id) || !publiques.has(x.id)) { console.log(`  · ${x.id} : version publique absente, non approuvée, sous HOLD ou affaire non publique — rien à reprendre`); continue; }
    // Sources à intégrer : celles de l'ancienne proposition + celles des analyses récentes (sélection existante, sans le filtre « déjà traitée »).
    const sel = selectionnerMisesAJour({ lignes: lignes.filter((l) => l.case_id === x.id), publie: new Map([[x.id, pub]]), approuvee: () => true, holds, deja: new Set() });
    const extra = new Map();
    for (const s of [...(x.derniere.maj?.sources_nouvelles || []), ...(x.derniere.srcs || []), ...sel.groupes.flatMap((g) => g.sources.map((s) => ({ url: s.url, media: s.media, d: s.publication_date })))]) if (s?.url) extra.set(s.url, { url: s.url, media: s.media ?? null, publication_date: s.publication_date ?? s.d ?? null });
    const dir = mkdtempSync(join(tmpdir(), 'sny-reprise-'));
    const fichier = join(dir, 'extra.json'); writeFileSync(fichier, JSON.stringify({ [x.id]: [...extra.values()] }));
    const gen = exec('generer-fiche.mjs', [x.id, '--sources-extra', fichier, '--docs']); rmSync(dir, { recursive: true, force: true });
    const cand = gen.ok ? dossierGeneree(x.id) : null;
    const note = (resultat, details = {}) => journaliser(sql, { kind: 'application', cle: `reprise-sans-perte:${x.id}:${x.derniere.pid.slice(0, 8)}`, resultat, details });
    if (!cand) { console.log(`  ⚠ ${x.id} : génération en erreur — rien proposé, à rejouer`); continue; }
    if (!cand.proposable) { console.log(`  ⚠ ${x.id} : candidate non proposable (${cand.generation.qualification}) — version publique conservée`); await note('non_proposable', { qualification: cand.generation.qualification }); continue; }
    const ch = changementsFiche(pub.d, cand.d);
    let remplacement = null;
    if (!ch.substantiel) console.log(`  · ${x.id} : la relecture n’apporte rien d’éditorial (version approuvée inchangée) — plus rien à proposer`);
    else {
      const prop = exec('proposer-fiche.mjs', [x.id, '--generee', '--ecrire']);
      remplacement = /proposition créée|DÉJÀ PROPOSÉE/.test(prop.out) ? hashDossier(cand.d) : null;
      console.log(`  ${remplacement ? '✅' : '⚠'} ${x.id} : +${ch.ajoutees.length} −${ch.retirees.length} · ${ch.sources_nouvelles.length} source(s) nouvelle(s), ${ch.sources_retirees.length} retirée(s) · ${/DÉJÀ PROPOSÉE/.test(prop.out) ? 'déjà proposée' : remplacement ? 'proposition corrigée créée (envoi par notifier-nouvelles)' : 'proposition NON créée'}`);
    }
    // Les propositions encore SANS décision sont remplacées (ou rendues sans objet) ; celles qui ont reçu un REVIEW de l'éditeur ne sont pas touchées.
    for (const p of x.enAttente) await superseder('new_case_proposals', p.pid, 'REJECT', remplacement ? `SUPERSEDED — remplacée par la version corrigée ${remplacement} (une relecture n’efface pas les acquis)` : 'SUPERSEDED — sans objet : la version corrigée n’apporte rien d’éditorial');
    await note(remplacement ? 'reproposee' : 'sans_apport', { remplacee_par: remplacement, en_attente_remplacees: x.enAttente.length });
  }
}

// =====================================================================  B. faits territoriaux / mobilisations
console.log('— B. faits territoriaux et mobilisations —');
const enAttente = await sql`
  select p.proposal_id::text pid, p.case_id, p.primitive_version, p.facts, a.publication_date::text pd, c.etablissement, c.commune
    from state_proposals p join cases c using (case_id) left join articles a using (article_id)
   where p.analysis_action = 'ENRICHMENT' and p.primitive_version like '%+reactions' and p.primitive_version not like '%.q3+reactions' and p.decision is null order by p.created_at`;
const cles = (e) => String(e || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(?:ecole|maternelle|elementaire|primaire|college|lycee)\b/g, '').replace(/\s+/g, ' ').trim();
const toutes = await sql`select case_id, etablissement, commune from cases where publication_status = 'publiée'`;
let modifiees = 0, aQualifier = 0, inchangees = 0;
for (const p of enAttente) {
  if (SEULS && !SEULS.has(p.case_id)) continue;
  const faits = Array.isArray(p.facts) ? p.facts : [];
  const mobs = faits.filter((f) => f?.nature === 'mobilisation' && f.evidence?.length);
  if (!mobs.length) continue;
  const autres = toutes.filter((c) => c.case_id !== p.case_id && c.commune === p.commune).map((c) => c.etablissement);
  const soeurs = toutes.some((c) => c.case_id !== p.case_id && c.commune === p.commune && cles(c.etablissement) && cles(c.etablissement) === cles(p.etablissement));
  // Requalification À PARTIR DE LA PREUVE seule : la ou les phrases citées. Aucun article relu, aucun modèle.
  const nouveaux = [], perdus = [];
  for (const f of mobs) {
    const r = extraireReactions(f.evidence.join('\n\n'), { etablissement: p.etablissement, anneeRef: p.pd, autres, titre: '', lieAffaire: true, commune: p.commune, soeursMemeEtablissement: soeurs });
    if (!r.length) perdus.push(f); else nouveaux.push(...r.map((x) => ({ ...x, resulting_state: null, finality: null, appeal: 'UNKNOWN' })));
  }
  const identique = (a, b) => ['libelle_public', 'realisation', 'portee', 'territoire', 'lien', 'event_date', 'event_period'].every((k) => (a[k] ?? null) === (b[k] ?? null));
  const change = perdus.length > 0 || nouveaux.length !== mobs.length || nouveaux.some((n) => !mobs.some((o) => identique(o, n)));
  if (!change) { inchangees++; continue; }
  console.log(`  · ${p.case_id} (${p.pid.slice(0, 8)}) : ${mobs.length} fait(s) de mobilisation · ${nouveaux.length} requalifié(s), ${perdus.length} que sa preuve n’établit plus`);
  if (!nouveaux.length) {                                                  // plus rien d'établi : à qualifier, aucune approbation demandée
    await superseder('state_proposals', p.pid, 'REVIEW_REQUIRED', 'À QUALIFIER — le fait proposé ne correspond pas à sa preuve (aucun fait établi par la phrase citée) ; aucune approbation demandée');
    aQualifier++; continue;
  }
  modifiees++;
  if (!ECRIRE) continue;
  const autresFaits = faits.filter((f) => !(f?.nature === 'mobilisation' && f.evidence?.length));
  const corriges = [...autresFaits, ...nouveaux];
  const version = String(p.primitive_version).replace(/(?:\.q\d+)?\+reactions$/, '.q3+reactions');
  const j = JSON.stringify(corriges);
  const ins = await sql`
    insert into state_proposals (case_id, article_id, content_fingerprint, primitive_version, statut_avant, statut_propose, event_date, source_date, transition, finalite, rationale, surveillance, inconnues, payload, requires_human_review, engine, analysis_action, facts)
    select case_id, article_id, content_fingerprint, ${version}, statut_avant, statut_propose, event_date, source_date, transition, finalite,
           ${`ENRICHMENT institutionnel — ${corriges.map((x) => `${x.mesure} (${x.realisation}, ${x.portee})`).join(' ; ')}`}, surveillance, inconnues,
           jsonb_set(jsonb_set(payload, '{facts}', ${j}::jsonb), '{_facts}', ${j}::jsonb), requires_human_review, engine, analysis_action, ${j}::jsonb
      from state_proposals where proposal_id = ${p.pid}::uuid
    on conflict (case_id, article_id, content_fingerprint, primitive_version) do nothing returning proposal_id::text pid`;
  await superseder('state_proposals', p.pid, 'REJECT', `SUPERSEDED — remplacée par la version corrigée ${ins[0]?.pid?.slice(0, 8) ?? '(déjà existante)'} : le libellé ne correspondait pas à la preuve`);
}
console.log(`faits territoriaux : ${enAttente.length} proposition(s) en attente d'une version antérieure · ${modifiees} à corriger${ECRIRE ? ' (corrigées et remplacées)' : ''} · ${aQualifier} à qualifier (preuve insuffisante) · ${inchangees} inchangée(s)`);
if (!ECRIRE) console.log('PLAN seulement : rien n’a été écrit. Relancer avec --ecrire pour appliquer.');
