#!/usr/bin/env node
// =====================================================================
// scripts/reconcilier-publication.mjs — une affaire VALIDÉE par l'éditeur ne reste jamais silencieusement hors du site.
//
//   node scripts/reconcilier-publication.mjs                  # plan : état de chaque affaire, AUCUNE écriture
//   node scripts/reconcilier-publication.mjs --ecrire         # publie (Neon) et projette (data/cases.json) ce qui est READY
//   node scripts/reconcilier-publication.mjs --site           # + compare l'artefact au site RÉELLEMENT servi (exit 1 si PENDING_DEPLOYMENT)
//   options : --ids a,b (se limite à ces affaires : sélection, jamais une liste de rattrapage) · --max N (défaut 5 : plafond d'affaires publiées par passage ; le reste reste READY et passe au suivant)
//
// C'est la SOUDURE entre ce qui existe déjà — pas un nouveau système :
//   décision humaine (reviews, écrites par appliquer-nouvelles-affaires / Decision Pack)
//     → garde-fous (lib/publication-gates.mjs = HOLD, fiabilité, statut, sources, doublon…)
//     → point de carte (lib/geocoder-commune.mjs, centre de commune, JAMAIS inventé, marqué « approximatif »)
//     → publier-affaire.mjs (statut Neon `publiée`, revue de GO consignée)   [existant]
//     → project-public.mjs --ajouter <id> (n'ajoute QUE cette entrée à l'artefact)   [existant]
//     → QA + commit + vérification du site : étapes du workflow (sny-telegram, sny-clics)   [existants]
//
// ÉTATS (recalculés à chaque passage depuis Neon + artefact + site : aucun état à stocker, donc rejouable sans effet de bord) :
//   READY               validée, garde-fous passés, point de carte disponible → sera publiée
//   BLOCKED             une raison explicite et réessayable (la raison disparaît → le passage suivant publie, sans nouvelle validation)
//   NEEDS_PROJECTION    `publiée` dans Neon mais absente de l'artefact (push échoué, QA refusée, passage interrompu) → reprojetée
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
import { etatPublication } from './lib/publication-gates.mjs';
import { geocoderCommune } from './lib/geocoder-commune.mjs';
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

// --- 1. état de chaque affaire -------------------------------------------------------------------------------------------------
const etats = new Map(); // case_id → { etat, raisons, geo? }
const depuis = process.env.SNY_PUBLICATION_DEPUIS ? new Date(process.env.SNY_PUBLICATION_DEPUIS) : null; // activation de l'autonomie (arriéré exclu)
for (const c of cases) {
  c.lieu = CI ? '' : ` — ${c.etablissement} (${c.commune})`;
  const e = etatPublication(c, { revues: revuesDe.get(c.case_id), sources: sourcesDe.get(c.case_id), holds, autres: cases.filter((o) => o.case_id !== c.case_id), artefact, depuis });
  if (e) etats.set(c.case_id, e);
}

// --- 2. point de carte des READY sans coordonnées (centre de commune, jamais inventé) ------------------------------------------
for (const c of cases.filter((x) => etats.get(x.case_id)?.etat === 'READY')) {
  if (c.lat !== null && c.lng !== null) { etats.get(c.case_id).geo = null; continue; }
  try {
    const g = await geocoderCommune(c.commune, c.departement);
    if (g) etats.get(c.case_id).geo = g;
    else etats.set(c.case_id, { alerter: true, etat: 'BLOCKED', raisons: ['localisation non établie de façon fiable (commune ambiguë, composée ou inconnue) : aucun point inventé'] });
  } catch {
    etats.set(c.case_id, { etat: 'BLOCKED', raisons: ['service de géocodage injoignable : réessayé au prochain passage'] });
  }
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

// --- 4. rapport ---------------------------------------------------------------------------------------------------------------
const nom = (id) => (cases.find((c) => c.case_id === id)?.lieu ?? '');
const comptes = {};
for (const [id, e] of etats) {
  comptes[e.etat] = (comptes[e.etat] || 0) + 1;
  const montrer = !['IN_ARTEFACT', 'PUBLISHED_VERIFIED'].includes(e.etat);
  if (montrer) console.log(`· ${id.padEnd(13)} ${e.etat.padEnd(20)}${e.raisons.join(' ; ')}${e.geo ? ` [point ${e.geo.source}]` : ''}${nom(id)}`);
}
console.log(`états : ${Object.entries(comptes).map(([k, v]) => `${k}=${v}`).join(' · ') || 'aucune affaire validée en attente'}`);

// --- 4b. une affaire validée mais BLOQUÉE ne reste pas silencieuse : un message Telegram, une seule fois par raison -----------------------
if (ECRIRE && !IDS) {
  const { prevenirUneFois, esc } = await import('./lib/prevenir.mjs');
  const { createHash } = await import('node:crypto');
  for (const [id, e] of etats) {
    if (e.etat !== 'BLOCKED' || !e.alerter) continue;
    const h = createHash('sha256').update(e.raisons.join('|')).digest('hex').slice(0, 8);
    const texte = ['⏸ <b>Validée mais NON publiée</b> — ' + esc(id), ...e.raisons.map(esc), 'Réessayé à chaque passage : dès que la raison disparaît, la publication suit sans nouvelle validation.'].join('\n');
    await prevenirUneFois(sql, { cle: `pub:${id}`, resultat: `bloquee:${h}`, texte });
  }
}

// --- 5. publication ----------------------------------------------------------------------------------------------------------
const ajoutees = [];
const refusees = [];
if (ECRIRE) {
  const prets = [...etats].filter(([id, e]) => e.etat === 'READY' && (!IDS || IDS.has(id))).map(([id]) => id);
  const reprojeter = [...etats].filter(([id, e]) => e.etat === 'NEEDS_PROJECTION' && (!IDS || IDS.has(id))).map(([id]) => id);
  const lot = [...prets, ...reprojeter].slice(0, MAX);
  if (prets.length + reprojeter.length > lot.length) console.log(`plafond ${MAX} atteint : ${prets.length + reprojeter.length - lot.length} affaire(s) reste(nt) READY pour le passage suivant`);
  const avantTexte = readFileSync('data/cases.json', 'utf8');
  const node = (args) => execFileSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const raison = (err) => String(err.stderr || err.message).split('\n').find((l) => l.trim() && !/Warning|trace-warnings/.test(l)) || 'échec';
  const enBase = []; // publiées (ou déjà publiées) dans Neon : à projeter EN UN SEUL lot (project-public repart du committé à chaque appel)
  for (const id of lot) {
    const e = etats.get(id);
    try {
      if (e.etat === 'READY') {
        const date = new Date().toISOString().slice(0, 10);
        const args = ['scripts/publier-affaire.mjs', id, '--ecrire', '--go', `Publication automatique SNY ${date} : décision humaine de validation déjà consignée, garde-fous et contrôles passés (aucun second GO)`];
        if (e.geo) args.push('--coords', `${e.geo.lat},${e.geo.lng}`, '--coords-source', `API Adresse (BAN), centre de commune, ${date}`, '--geocode-source', e.geo.source);
        node(args);
        console.log(`✅ ${id} : publiée dans Neon`);
      }
      enBase.push(id);
    } catch (err) {
      refusees.push(id);
      console.error(`❌ ${id} : ${raison(err)}`);
    }
  }
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
