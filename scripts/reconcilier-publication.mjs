#!/usr/bin/env node
// =====================================================================
// scripts/reconcilier-publication.mjs — exécute, sans intervention manuelle, la SUITE d'une publication DÉJÀ AUTORISÉE.
//
//   node scripts/reconcilier-publication.mjs                  # plan : état de chaque affaire, AUCUNE écriture
//   node scripts/reconcilier-publication.mjs --ecrire         # projette (data/cases.json) ce qui est autorisé et pas encore dans l'artefact
//   node scripts/reconcilier-publication.mjs --site           # + compare l'artefact au site RÉELLEMENT servi (exit 1 si PENDING_DEPLOYMENT)
//   options : --ids a,b (sélection, jamais une liste de rattrapage) · --max N (défaut 5 : plafond d'affaires projetées par passage)
//
// CONTRAT (jamais d'autorisation implicite) :
//   CREATE / VALIDATE Discovery → candidate dans Neon, JAMAIS publiée.   CREATE_PENDING_EVIDENCE → candidate non publiable.
//   ATTACH → rattachement, aucune autorisation de publier.               REVIEW / HOLD → aucune publication.
//   GO PUBLICATION = l'acte EXISTANT de publier-affaire.mjs --go : il bascule la fiche en `publiée` ET consigne la revue
//   « [Publication AAAA-MM-JJ] GO d'Adrien : … » (reviewed_by « Adrien … ») dans la même instruction. Ce script ne publie JAMAIS une
//   candidate et n'écrit JAMAIS de GO : il exécute ce qui suit un GO.
//
//   GO publication (Neon `publiée`) → [ce script] projection ciblée (project-public --ajouter, lot) → QA → commit → push → build
//   Cloudflare → vérification du site servi : étapes du workflow (sny-telegram, sny-clics).
//
// ÉTATS (recalculés à chaque passage depuis Neon + artefact + site : rien à stocker, rejouable sans effet de bord) :
//   AWAITING_GO         candidate validée et éligible : EXAMINÉE, attend un GO publication explicite (aucune action)
//   BLOCKED             candidate (ou publiée) bloquée, raison explicite ; n'empêche jamais les autres
//   NEEDS_PROJECTION    `publiée` avec GO publication explicite mais absente de l'artefact (push échoué, QA refusée) → reprojetée
//   NO_GO               `publiée` en base SANS GO publication explicite (postérieur à SNY_PUBLICATION_DEPUIS) → jamais projetée
//   PENDING_DEPLOYMENT  dans l'artefact mais pas (ou pas à l'identique) sur le site servi
//   PUBLISHED_VERIFIED  dans l'artefact ET conforme sur le site servi
//   HOLD                gelée : aucune nouvelle exposition, aucun retrait
//
// Sortie GitHub Actions : change=true|false · ids=<affaires ajoutées à l'artefact> · pending=<affaires non servies>.
// Dépôt public ⇒ en CI, ni nom ni lieu dans les logs (identifiants et raisons génériques seulement).
// =====================================================================
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { etatPublication, categorieDiagnostic, goPublication, REVUE_VALIDATION } from './lib/publication-gates.mjs';
import { geocoderCommune } from './lib/geocoder-commune.mjs';
import { localisationDe } from './lib/proposition-publication.mjs';
import { ecartsSite } from './lib/ecarts-site.mjs';

const A = process.argv.slice(2);
const ID = /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+)$/;
const ECRIRE = A.includes('--ecrire');
const IDS = A.includes('--ids') ? new Set(A[A.indexOf('--ids') + 1].split(',').filter((i) => ID.test(i))) : null;
const SITE_CTRL = A.includes('--site');
const MAX = Number(A.includes('--max') ? A[A.indexOf('--max') + 1] : 5);
const CI = !!process.env.CI;
const SITE = process.env.SNY_SITE_URL || 'https://sousnosyeux.org';
const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));

const { sql } = connecter();
const holds = new Set((lire('data/publication-holds.json').holds || []).map((h) => h.case_id));
const artefact = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const avecPoint = (c) => typeof c.lat === 'number' && typeof c.lng === 'number';

const cases = await sql`
  select case_id, etablissement, commune, departement, type_structure::text type_structure, role_mis_en_cause::text role_mis_en_cause,
         statut_judiciaire::text statut_judiciaire, enfants_concernes_public::text enfants_concernes_public,
         publication_status::text publication_status, fiabilite_info_10, crit_statut_clair, lat, lng
    from cases where publication_status in ('candidate', 'publiée') order by case_id`;
const revues = await sql`select case_id, reviewed_by, decision::text decision, comment, reviewed_at from reviews order by reviewed_at`;
const sources = await sql`select case_id, url, media from sources`;
const parCas = (rows) => rows.reduce((m, r) => ((m.get(r.case_id) || m.set(r.case_id, []).get(r.case_id)).push(r), m), new Map());
const revuesDe = parCas(revues), sourcesDe = parCas(sources);
// Proposition « PUBLIER ? » de chaque affaire (une seule par affaire : dedup `publication|<id>`).
const propositionDe = new Map((await sql`select substr(dedup_key, 13) case_id, decision::text decision from new_case_proposals where dedup_key like 'publication|%'`)
  .map((r) => [r.case_id, { decision: r.decision }]));

/** Localisation fiable de la candidate : { loc } ; `connu:false` si l'API Adresse est en panne (« introuvable » ≠ « panne » : on ne conclut rien). */
async function localiser(c) {
  let geo = null;
  if (c.lat === null || c.lng === null) {
    try { geo = await geocoderCommune(c.commune, c.departement); } catch { return { loc: null, connu: false }; }
  }
  return { loc: localisationDe(c, geo), connu: true };
}

// --- 1. état de chaque affaire -------------------------------------------------------------------------------------------------
const etats = new Map(); // case_id → { etat, raisons, geo? }
const depuis = process.env.SNY_PUBLICATION_DEPUIS ? new Date(process.env.SNY_PUBLICATION_DEPUIS) : null; // activation de l'autonomie (arriéré exclu)
for (const c of cases) {
  c.lieu = CI ? '' : ` — ${c.etablissement} (${c.commune})`;
  const ctxC = { revues: revuesDe.get(c.case_id), sources: sourcesDe.get(c.case_id), holds, autres: cases.filter((o) => o.case_id !== c.case_id), artefact, depuis, proposition: propositionDe.get(c.case_id) ?? null };
  const e = etatPublication(c, ctxC);
  if (!e) continue;
  // « Éligible » ne suffit pas à être vue : sans proposition « PUBLIER ? » active, l'affaire n'attend personne. Elle est dite MISSING_PROPOSAL
  // (état de diagnostic, rien n'est stocké) au lieu de se confondre avec une affaire dont la proposition attend un GO.
  if (e.etat === 'AWAITING_GO' && !ctxC.proposition) { const l = await localiser(c); ctxC.localisable = l.connu ? !!l.loc : null; }
  const d = e.etat === 'AWAITING_GO' ? categorieDiagnostic(c, ctxC) : null;
  etats.set(c.case_id, d && ['MISSING_PROPOSAL', 'BLOCKED'].includes(d.categorie) ? { etat: d.categorie, raisons: d.raisons } : e);
}

// --- 3. site réellement servi --------------------------------------------------------------------------------------------------
let enAttenteSite = [];
let siteVerifie = new Set();
if (SITE_CTRL) {
  const ids = [...artefact.values()].filter(avecPoint).map((c) => c.case_id);
  try {
    const r = await fetch(`${SITE}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const ecarts = ecartsSite(html, ids, artefact);
    enAttenteSite = ids.filter((id) => ecarts.some((e) => e.startsWith(`${id} :`)));
    if (ecarts.some((e) => !ID.test(e.split(' ')[0]))) enAttenteSite = ids; // page illisible : rien n'est vérifié
    siteVerifie = new Set(ids.filter((id) => !enAttenteSite.includes(id)));
  } catch {
    enAttenteSite = ids; // un site injoignable ne vaut jamais « vérifié »
  }
  for (const id of enAttenteSite) etats.set(id, { etat: 'PENDING_DEPLOYMENT', raisons: ['dans l’artefact mais absent ou différent sur le site servi'] });
  for (const id of siteVerifie) if (etats.get(id)?.etat === 'IN_ARTEFACT') etats.set(id, { etat: 'PUBLISHED_VERIFIED', raisons: [] });
}

// --- 3b. ENTONNOIR (diagnostic, lecture seule) ----------------------------------------------------------------------------------
//   node scripts/reconcilier-publication.mjs --funnel [--site] [--json]
// VALIDATED → ELIGIBLE → PUBLICATION_PROPOSED → GO → NEON_PUBLISHED → PROJECTED → SERVED_VERIFIED. Chaque affaire est comptée UNE fois, au dernier stade
// atteint ; les catégories (AWAITING_GO, MISSING_PROPOSAL, BLOCKED, GO_STUCK, REVIEW, HOLD, REJECT, DECISION_CONFLICT) sont des diagnostics, jamais stockées.
// « legacy » = publiée avant l'autonomie, sans proposition ni GO explicite consignés : valable tant qu'elle n'est pas remplacée ou invalidée.
if (A.includes('--funnel')) {
  const toutes = await sql`select case_id, etablissement, commune, departement, type_structure::text type_structure, role_mis_en_cause::text role_mis_en_cause,
         statut_judiciaire::text statut_judiciaire, enfants_concernes_public::text enfants_concernes_public, publication_status::text publication_status,
         fiabilite_info_10, crit_statut_clair, lat, lng, geocode_source from cases order by case_id`;
  const STADES = ['VALIDATED', 'ELIGIBLE', 'PUBLICATION_PROPOSED', 'GO', 'NEON_PUBLISHED', 'PROJECTED', 'SERVED_VERIFIED'];
  const lignes = [];
  for (const c of toutes) {
    const rv = revuesDe.get(c.case_id) || [];
    const prop = propositionDe.get(c.case_id) ?? null;
    const ctxC = { revues: rv, sources: sourcesDe.get(c.case_id), holds, autres: toutes.filter((o) => o.case_id !== c.case_id && o.publication_status !== 'retirée'), artefact, depuis,
      proposition: prop, localisable: null, servie: SITE_CTRL ? siteVerifie.has(c.case_id) : null };
    let loc = null;
    if (c.publication_status === 'candidate') {
      const l = await localiser(c);
      loc = l.loc; ctxC.localisable = l.connu ? !!l.loc : null;
    }
    const d = categorieDiagnostic(c, ctxC);
    if (d.categorie === 'NON_VALIDEE') continue;
    if (c.publication_status === 'retirée' && !rv.some((r) => r.decision === 'validé' && REVUE_VALIDATION.test(r.comment || ''))) continue; // retirée sans avoir jamais été validée : hors entonnoir
    const pub = c.publication_status === 'publiée', art = artefact.get(c.case_id);
    const go = goPublication(rv);
    const stade = d.categorie === 'REJECT' || d.categorie === 'DECISION_CONFLICT' ? 0
      : pub && art && avecPoint(art) && siteVerifie.has(c.case_id) ? 6 : pub && art && avecPoint(art) ? 5 : pub ? 4
      : d.categorie === 'GO_STUCK' ? 3 : d.categorie === 'AWAITING_GO' ? 2 : d.categorie === 'MISSING_PROPOSAL' ? 1 : 0;
    const validation = rv.filter((r) => r.decision === 'validé' && REVUE_VALIDATION.test(r.comment || '')).pop();
    lignes.push({ id: c.case_id, etablissement: c.etablissement, commune: c.commune, validation: validation ? `${validation.reviewed_at?.toISOString?.().slice(0, 10) ?? ''} · ${validation.reviewed_by}` : (pub ? 'legacy (publiée avant l’autonomie)' : 'aucune'),
      statut: c.statut_judiciaire, fiabilite: c.fiabilite_info_10, sources: (sourcesDe.get(c.case_id) || []).length,
      localisation: pub ? (art && avecPoint(art) ? 'point publié' : 'aucun point publié') : loc ? loc.type : 'AUCUNE', go: go ? 'GO explicite' : pub ? 'legacy' : 'non',
      proposition: prop ? (prop.decision || 'active') : pub ? 'legacy' : 'aucune', categorie: d.categorie, blocage: d.raisons.join(' ; '), action: d.action, stade: STADES[stade] });
  }
  const parStade = Object.fromEntries(STADES.map((s) => [s, lignes.filter((l) => l.stade === s).length]));
  const atteint = (i) => lignes.filter((l) => STADES.indexOf(l.stade) >= i || (l.stade === 'VALIDATED' && i === 0)).length;
  if (A.includes('--json')) console.log(JSON.stringify({ stades: parStade, lignes }, null, 1));
  else {
    console.log('ENTONNOIR (chaque affaire comptée une fois, au dernier stade atteint ; sortie = ce qui ne passe pas au stade suivant)');
    STADES.forEach((s, i) => console.log(`  ${s.padEnd(22)} atteint=${String(atteint(i)).padStart(3)}  arrêtées ici=${String(parStade[s]).padStart(3)}`));
    const cats = {}; for (const l of lignes.filter((x) => x.categorie !== 'PUBLIC')) cats[l.categorie] = (cats[l.categorie] || 0) + 1;
    console.log(`  dont publiées « legacy » (sans GO explicite consigné) : ${lignes.filter((l) => l.go === 'legacy').length} · avec GO explicite : ${lignes.filter((l) => l.go === 'GO explicite').length}`);
    console.log(`  hors du public :${Object.entries(cats).map(([k, v]) => `${k}=${v}`).join(' · ') || 'aucune'}`);
    for (const l of lignes.filter((x) => x.categorie !== 'PUBLIC')) console.log(`· ${l.id.padEnd(13)} ${l.categorie.padEnd(17)} ${CI ? '' : `${l.etablissement} (${l.commune}) · `}${l.blocage || '—'} → ${l.action}`);
  }
  process.exit(0);
}

// --- 4. rapport ---------------------------------------------------------------------------------------------------------------
const nom = (id) => (cases.find((c) => c.case_id === id)?.lieu ?? '');
const comptes = {};
for (const [id, e] of etats) {
  comptes[e.etat] = (comptes[e.etat] || 0) + 1;
  const montrer = !['IN_ARTEFACT', 'PUBLISHED_VERIFIED'].includes(e.etat);
  if (montrer) console.log(`· ${id.padEnd(13)} ${e.etat.padEnd(20)}${e.raisons.join(' ; ')}${nom(id)}`);
}
console.log(`états : ${Object.entries(comptes).map(([k, v]) => `${k}=${v}`).join(' · ') || 'rien à signaler'}`);

// --- 5. projection de ce qui est déjà publié avec GO ---------------------------------------------------------------------------
const ajoutees = [];
const refusees = [];
if (ECRIRE) {
  const reprojeter = [...etats].filter(([id, e]) => e.etat === 'NEEDS_PROJECTION' && (!IDS || IDS.has(id))).map(([id]) => id);
  const lot = reprojeter.slice(0, MAX);
  if (reprojeter.length > lot.length) console.log(`plafond ${MAX} atteint : ${reprojeter.length - lot.length} affaire(s) restent à projeter au passage suivant`);
  const avantTexte = readFileSync('data/cases.json', 'utf8');
  const node = (args) => execFileSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const raison = (err) => String(err.stderr || err.message).split('\n').find((l) => l.trim() && !/Warning|trace-warnings/.test(l)) || 'échec';
  const enBase = []; // à projeter EN UN SEUL lot (project-public repart du committé à chaque appel)
  enBase.push(...lot); // déjà `publiée` dans Neon sur GO explicite : rien à écrire en base ici
  if (enBase.length) {
    try { console.log(node(['scripts/project-public.mjs', '--ajouter', enBase.join(',')]).split('\n').filter((l) => /^\s+[!=]|NO_PUBLIC_CHANGE|écrit/.test(l)).join('\n')); ajoutees.push(...enBase); }
    catch (err) { refusees.push(...enBase); console.error(`❌ projection refusée (${enBase.join(', ')}) : ${raison(err)}`); }
  }
  // Seules les affaires attendues ont pu changer : sinon on restaure l'artefact et on s'arrête (rien n'est commité).
  const apres = JSON.parse(readFileSync('data/cases.json', 'utf8')).cases, avant = JSON.parse(avantTexte).cases;
  const avantMap = new Map(avant.map((c) => [c.case_id, JSON.stringify(c)]));
  const nouvelles = new Set(apres.map((c) => c.case_id).filter((i) => !avantMap.has(i)));
  for (let i = ajoutees.length - 1; i >= 0; i--) if (!nouvelles.has(ajoutees[i])) ajoutees.splice(i, 1); // NO_PUBLIC_CHANGE : rien d'ajouté
  const intrus = apres.filter((c) => !nouvelles.has(c.case_id) && avantMap.get(c.case_id) !== JSON.stringify(c)).map((c) => c.case_id)
    .concat(avant.filter((c) => !apres.some((x) => x.case_id === c.case_id)).map((c) => c.case_id));
  if (intrus.length) {
    console.error(`❌ l’artefact a changé pour d’autres affaires que celles publiées (${intrus.join(', ')}) : restauré, aucune publication projetée`);
    execFileSync('git', ['checkout', '--', 'data/cases.json']);
    ajoutees.length = 0;
    process.exitCode = 1;
  }
}
if (refusees.length) process.exitCode = 1;

const pending = SITE_CTRL ? enAttenteSite : [];
if (pending.length) { console.error(`PENDING_DEPLOYMENT : ${pending.length} affaire(s) dans l’artefact non conforme(s) sur le site servi`); process.exitCode = 1; }
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `change=${ajoutees.length > 0}\nids=${ajoutees.join(',')}\npending=${pending.join(',')}\n`);
console.log(`réconciliation : ${ajoutees.length} affaire(s) ajoutée(s) à l’artefact${ECRIRE ? '' : ' (plan : aucune écriture)'}`);
