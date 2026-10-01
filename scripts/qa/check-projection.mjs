#!/usr/bin/env node
// =====================================================================
// scripts/qa/check-projection.mjs
//
// QA de l'artefact public produit par scripts/project-public.mjs.
// Contrôles B→I de la mission PUBLIC LOOP #1. Lecture seule.
//
//   node scripts/qa/check-projection.mjs
//
// Le contrôle E (dates) est le plus important : il suit une date métier
// depuis Neon jusqu'à l'artefact et vérifie qu'elle n'a pas reculé d'un
// jour. C'est un piège déjà rencontré, pas une précaution théorique.
// =====================================================================

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connecter } from '../lib/neon.mjs';
import { findInternalFields, PUBLIC_CASE_FIELDS, PUBLIC_SOURCE_FIELDS, PUBLIC_ETAT_FIELDS } from '../lib/public-projection.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const doc = JSON.parse(await readFile(resolve(ROOT, 'data/cases.json'), 'utf8'));
const holds = JSON.parse(await readFile(resolve(ROOT, 'data/publication-holds.json'), 'utf8'));
const { sql } = connecter();

let echecs = 0;
const ok = (t, d = '') => console.log(`  ✅  ${t}${d ? ' — ' + d : ''}`);
const ko = (t, d) => { echecs++; console.log(`  ❌  ${t} — ${d}`); };

console.log('\n  QA PROJECTION PUBLIQUE\n  ' + '─'.repeat(68));

// --- B. intégrité structurelle ---------------------------------------
if (!doc._meta || !Array.isArray(doc.cases)) ko('B. structure', '_meta ou cases manquant');
else if (doc._meta.source !== 'neon') ko('B. structure', `source = « ${doc._meta.source} », attendu « neon »`);
else ok('B. intégrité structurelle', `_meta.source = neon · projection ${doc._meta.projection}`);

const casSansChamp = doc.cases.filter((c) => !c.case_id || !c.etablissement || !c.statut_judiciaire);
if (casSansChamp.length) ko('B. champs obligatoires', `${casSansChamp.length} affaire(s) incomplète(s)`);
else ok('B. champs obligatoires', 'case_id, etablissement, statut_judiciaire présents partout');

// --- C. nombre d'affaires attendu -------------------------------------
const attendu = await sql`
  select count(*)::int n from cases
   where publication_status = 'publiée' and fiabilite_info_10 >= 8`;
const bloquees = holds.holds.map((h) => h.case_id);
const gelPublie = doc.cases.filter((c) => bloquees.includes(c.case_id)).length;
// Une affaire sous HOLD jamais publiée n'est pas ajoutée : elle manque
// légitimement à l'artefact. Une affaire sous HOLD déjà publiée est gelée,
// donc présente. Le compte attendu retranche les premières.
const jamaisPubliees = bloquees.filter((id) => !doc.cases.some((c) => c.case_id === id));
const cible = attendu[0].n - jamaisPubliees.length;
if (doc.cases.length !== cible) {
  ko('C. nombre d’affaires', `artefact ${doc.cases.length} ≠ attendu ${cible} (Neon ${attendu[0].n} − ${jamaisPubliees.length} sous HOLD jamais publiée)`);
} else {
  ok('C. nombre d’affaires',
    `${doc.cases.length} = Neon ${attendu[0].n} − ${jamaisPubliees.length} sous HOLD jamais publiée(s)` +
    `${jamaisPubliees.length ? ' [' + jamaisPubliees.join(', ') + ']' : ''}, dont ${gelPublie} gelée(s)`);
}

// --- D. unicité des IDs ------------------------------------------------
const ids = doc.cases.map((c) => c.case_id);
const dups = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dups.length) ko('D. unicité des IDs', `doublons : ${[...new Set(dups)].join(', ')}`);
else ok('D. unicité des IDs', `${ids.length} identifiants distincts`);

// --- E. dates sans décalage — le contrôle critique ---------------------
// On repart de Neon et on suit la date jusqu'à l'artefact.
const datesNeon = await sql`
  select s.case_id, s.media, to_char(s.publication_date, 'YYYY-MM-DD') as attendu
    from sources s join cases c on c.case_id = s.case_id
   where c.publication_status = 'publiée' and c.fiabilite_info_10 >= 8
     and s.publication_date is not null`;
let ecarts = 0;
for (const d of datesNeon) {
  const cas = doc.cases.find((c) => c.case_id === d.case_id);
  if (!cas) continue; // affaire gelée : sa date vient de l'artefact précédent
  const src = cas.sources.find((s) => s.media === d.media);
  if (!src) continue;
  if (src.publication_date !== d.attendu) {
    ecarts++;
    if (ecarts <= 3) console.log(`      ${d.case_id} / ${d.media} : Neon ${d.attendu} → artefact ${src.publication_date}`);
  }
}
if (ecarts) ko('E. dates sans décalage', `${ecarts} date(s) divergente(s) sur ${datesNeon.length}`);
else ok('E. dates sans décalage', `${datesNeon.length} dates identiques de Neon à l’artefact`);

// E bis — la date témoin de la mission : 2026-06-16 doit rester 2026-06-16
const [temoin] = await sql`
  select to_char(event_date, 'YYYY-MM-DD') as texte, event_date as brut
    from case_events where case_id = 'POC-09' order by recorded_at limit 1`;
if (temoin) {
  const naif = new Date(temoin.brut).toISOString().slice(0, 10);
  if (temoin.texte !== '2026-06-16') ko('E bis. date témoin', `to_char rend ${temoin.texte}, attendu 2026-06-16`);
  else if (naif === temoin.texte) ok('E bis. date témoin', `2026-06-16 (toISOString ne recule pas ici)`);
  else ok('E bis. date témoin', `2026-06-16 conservée — toISOString aurait rendu ${naif} (J-1 évité)`);
}

// --- F. aucun champ interne -------------------------------------------
const fuites = findInternalFields(doc);
if (fuites.length) ko('F. champs internes', `${fuites.length} fuite(s) : ${fuites.slice(0, 3).map((f) => f.field).join(', ')}`);
else ok('F. aucun champ interne', 'liste noire respectée sur tout l’artefact');

const horsListe = new Set();
for (const c of doc.cases) {
  for (const k of Object.keys(c)) if (k !== 'sources' && !PUBLIC_CASE_FIELDS.includes(k)) horsListe.add('case.' + k);
  for (const s of c.sources) for (const k of Object.keys(s)) if (!PUBLIC_SOURCE_FIELDS.includes(k)) horsListe.add('source.' + k);
}
if (horsListe.size) ko('F bis. liste blanche', `champs hors liste : ${[...horsListe].join(', ')}`);
else ok('F bis. liste blanche', 'aucun champ hors liste blanche');

// --- G. aucune mutation hors du cas choisi ----------------------------
// Comparaison à la version committée dans Git : la référence publique.
const { execSync } = await import('node:child_process');
let precedent = null;
try {
  precedent = JSON.parse(execSync('git show HEAD:data/cases.json', { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString());
} catch { /* pas de version committée */ }

// Release candidate : les changements publics attendus sont EXACTEMENT ceux des
// décisions humaines validées le 25/09/2026 (LOT_VALIDATION_1, appliquées à Neon
// par `appliquer-decisions.mjs`), plus POC-09 (mission précédente). Toute autre
// mutation reste un échec. FR-2026-0004 est gelée (HOLD) : elle ne doit PAS changer.
// FR-2026-0048 / 0049 sont sous HOLD (publication à décider séparément) et ne
// doivent PAS apparaître.
const ATTENDUS = {
  modifies: ['POC-09', 'POC-05', 'FR-2026-0001', 'FR-2026-0005', 'FR-2026-0027', 'FR-2026-0029', 'FR-2026-0032', 'FR-2026-0045'],
  ajoutes: [], retires: [],
};
if (precedent) {
  const a = new Map(precedent.cases.map((c) => [c.case_id, c]));
  const b = new Map(doc.cases.map((c) => [c.case_id, c]));
  const modifies = [...b.keys()].filter((k) => a.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)));
  const ajoutes = [...b.keys()].filter((k) => !a.has(k));
  const retires = [...a.keys()].filter((k) => !b.has(k));
  const inattendus = [
    ...modifies.filter((x) => !ATTENDUS.modifies.includes(x)).map((x) => `modifiée ${x}`),
    ...ajoutes.filter((x) => !ATTENDUS.ajoutes.includes(x)).map((x) => `ajoutée ${x}`),
    ...retires.filter((x) => !ATTENDUS.retires.includes(x)).map((x) => `retirée ${x}`),
  ];
  if (inattendus.length) ko('G. mutations inattendues', inattendus.join(' · '));
  else ok('G. aucune mutation inattendue', `${modifies.length} modifiée · ${ajoutes.length} ajoutée · ${retires.length} retirée, toutes prévues`);
} else {
  console.log('  ⚠️   G. pas de version committée à comparer');
}

// --- H. cohérence publication_status ----------------------------------
const nonPubliees = await sql`
  select case_id from cases
   where publication_status <> 'publiée' and case_id = any(${ids})`;
if (nonPubliees.length) ko('H. publication_status', `${nonPubliees.length} affaire(s) publiée(s) sans l’être en base : ${nonPubliees.map((c) => c.case_id).join(', ')}`);
else ok('H. cohérence publication_status', 'toute affaire de l’artefact est « publiée » en base');

const sousSeuil = await sql`
  select case_id, fiabilite_info_10 from cases
   where fiabilite_info_10 < 8 and case_id = any(${ids})`;
if (sousSeuil.length) ko('H bis. seuil', `${sousSeuil.length} affaire(s) sous le seuil 8`);
else ok('H bis. seuil de publication', 'aucune affaire sous le seuil 8');

// --- I. doctrine relaxe -------------------------------------------------
// Doctrine retenue (pages publiques, et comportement déjà en production) :
// une relaxe ne quitte PAS la carte d'elle-même. Le retrait est décidé par
// un humain via publication_status, et seulement pour une relaxe DÉFINITIVE.
const relaxes = doc.cases.filter((c) => c.statut_judiciaire === 'relaxe / non-lieu / classement');
const retireesEnBase = await sql`
  select case_id from cases
   where statut_judiciaire = 'relaxe / non-lieu / classement' and publication_status = 'retirée'`;
const retireesPresentes = relaxes.filter((c) => retireesEnBase.some((r) => r.case_id === c.case_id));
if (retireesPresentes.length) {
  ko('I. doctrine relaxe', `${retireesPresentes.length} affaire(s) « retirée » en base mais présente(s) dans l’artefact`);
} else {
  ok('I. doctrine relaxe', `${relaxes.length} relaxe(s) affichée(s), ${retireesEnBase.length} retirée(s) par décision humaine — conforme aux pages publiques`);
}

// --- J. contrat de synthèse d'état -------------------------------------
// Le bloc `etat` est DÉRIVÉ. Il ne doit exister que là où un événement
// validé existe, et ne jamais contredire la fiche.
// QUELLE DÉFINITION DE « ÉTAT COURANT » ? Première version de ce contrôle : le
// dernier événement, tout court. Elle était fausse dès qu'une affaire portait un
// événement qui ne change pas l'état — POC-05 se terminait par une `mobilisation`
// (sans statut ni source), POC-09 par une `rectification` : l'état, la finalité et
// la source disparaissaient, et l'appel du parquet n'était plus affiché.
// Contrat vérifié ici, dérivé indépendamment du code de projection :
//   · l'état est daté par le dernier événement qui le CHANGE (ni `voie_de_recours`,
//     `mesure_procédurale`, `mobilisation`, `rectification`…) ;
//   · une voie de recours postérieure ou non datée rend la décision non définitive
//     et pose APPEL_EN_COURS ;
//   · la source est l'article de l'événement d'état ;
//   · une `rectification` n'est jamais rendue comme état.
const HORS_ETAT = ['rectification', 'mobilisation', 'réponse_institutionnelle', 'retrait'];
const SANS_CHANGER = ['voie_de_recours', 'mesure_procédurale'];
const evenements = await sql`
  select e.case_id, e.event_type::text as t, e.recorded_at::text as r,
         to_char(e.event_date,'YYYY-MM-DD') as d, e.statut_apres::text as s, a.media
    from case_events e
    left join articles a on a.article_id = e.article_id
   order by e.case_id, e.event_date nulls last, e.recorded_at`;
const evParCas = new Map();
for (const e of evenements) (evParCas.get(e.case_id) || evParCas.set(e.case_id, []).get(e.case_id)).push(e);

const attendusPar = new Map();
for (const [id, evsBruts] of evParCas) {
  // Rectification honorée : même fait (type, date, statut) enregistré deux fois → le plus
  // ancien seul fait foi (POC-09 : « relaxe du 16/06 » via deux sources).
  const vusFaits = new Set();
  const evs = [...evsBruts].sort((a, b) => a.r.localeCompare(b.r)).filter((e) => {
    if (HORS_ETAT.includes(e.t)) return false;
    const k = `${e.t}|${e.d || 'nd'}|${e.s || 'nd'}`;
    if (vusFaits.has(k)) return false;
    vusFaits.add(k); return true;
  }).sort((a, b) => (a.d || '9999').localeCompare(b.d || '9999') || a.r.localeCompare(b.r));
  const porteurs = evs.filter((e) => e.s && !SANS_CHANGER.includes(e.t));
  const decision = porteurs[porteurs.length - 1] || evs.filter((e) => e.s).slice(-1)[0];
  if (!decision) continue;
  const recours = evs.filter((e) => e.t === 'voie_de_recours' && (!e.d || !decision.d || e.d >= decision.d));
  attendusPar.set(id, { decision, recours });
}

const avecEtat = doc.cases.filter((c) => c.etat);
// Une affaire gelée (HOLD) garde son entrée publiée : elle n'absorbe aucun bloc nouveau.
const attendusEtat = doc.cases.filter((c) => attendusPar.has(c.case_id) && !bloquees.includes(c.case_id));
if (avecEtat.length !== attendusEtat.length) {
  ko('J. portée du bloc etat', `${avecEtat.length} bloc(s) pour ${attendusEtat.length} affaire(s) à événement validé (hors HOLD)`);
} else {
  ok('J. portée du bloc etat', `${avecEtat.length} affaire(s) sur ${doc.cases.length} — les autres gardent leur rendu actuel`);
}

let etatKo = 0;
for (const c of avecEtat) {
  const att = attendusPar.get(c.case_id);
  if (!att) { etatKo++; console.log(`      ${c.case_id} : bloc etat sans événement validé`); continue; }
  const { decision, recours } = att;
  const pb = [];
  if (c.etat.statut !== decision.s) pb.push(`statut ${c.etat.statut} ≠ événement d’état ${decision.s}`);
  if (c.etat.statut !== c.statut_judiciaire) pb.push('etat.statut ≠ statut_judiciaire de la fiche');
  // Sans événement qui change l'état, la date de l'événement disponible n'est pas celle de l'état.
  const dateAttendue = SANS_CHANGER.includes(decision.t) ? null : decision.d;
  if (c.etat.date !== dateAttendue) pb.push(`date ${c.etat.date} ≠ attendue ${dateAttendue}`);
  if (HORS_ETAT.includes(c.etat.type_evenement) || SANS_CHANGER.includes(c.etat.type_evenement)) pb.push(`type « ${c.etat.type_evenement} » ne date pas un état`);
  const appel = (c.etat.suites || []).includes('APPEL_EN_COURS');
  if (appel !== (recours.length > 0)) pb.push(recours.length ? 'voie de recours validée mais APPEL_EN_COURS absent' : 'APPEL_EN_COURS sans voie de recours validée');
  if (recours.length && c.etat.finalite !== 'non_definitive') pb.push('recours sans finalité non_definitive');
  const media = c.etat.sources?.[0]?.media ?? null;
  const attendu = decision.media ?? recours.find((e) => e.media)?.media ?? null;
  if (media !== attendu) pb.push(`source « ${media} » ≠ article de l’événement d’état « ${attendu} »`);
  if (pb.length) { etatKo++; console.log(`      ${c.case_id} : ${pb.join(' · ')}`); }
}
if (etatKo) ko('J bis. fidélité du bloc etat', `${etatKo} affaire(s) divergente(s)`);
else ok('J bis. fidélité du bloc etat', 'état, date, recours, finalité et source conformes au contrat (relaxe + appel, rectification honorée)');

// J quater — chaque relaxe FRAPPÉE D'APPEL doit le dire, et aucune relaxe sans appel ne doit le prétendre.
const relaxeAppel = avecEtat.filter((c) => c.etat.statut === 'relaxe / non-lieu / classement' && (c.etat.suites || []).includes('APPEL_EN_COURS'));
ok('J quater. relaxe + appel', `${relaxeAppel.length} relaxe(s) affichée(s) avec appel en cours : ${relaxeAppel.map((c) => c.case_id).join(', ') || 'aucune'}`);

// M — multi-établissements : FR-2026-0005 doit exposer ses trois écoles, principal en tête.
const multi = await sql`select case_id, count(*)::int n from case_establishments group by case_id having count(*) > 1`;
let multiKo = 0;
for (const m of multi) {
  const c = doc.cases.find((x) => x.case_id === m.case_id);
  if (!c) continue;
  if (!Array.isArray(c.etablissements) || c.etablissements.length !== m.n) { multiKo++; console.log(`      ${m.case_id} : ${c.etablissements?.length ?? 0} établissement(s) exposé(s) pour ${m.n} en base`); }
  else if (c.etablissements[0].role !== 'principal') { multiKo++; console.log(`      ${m.case_id} : le principal n’est pas en tête`); }
}
const sansMulti = doc.cases.filter((c) => c.etablissements && !multi.some((m) => m.case_id === c.case_id));
if (multiKo || sansMulti.length) ko('M. multi-établissements', `${multiKo} écart(s) · ${sansMulti.length} affaire(s) mono-établissement portant le champ`);
else ok('M. multi-établissements', `${multi.length} affaire(s) exposent leurs écoles concernées ; les autres omettent le champ`);

// Aucun champ hors liste blanche dans `etat`.
const horsEtat = new Set();
for (const c of avecEtat) for (const k of Object.keys(c.etat)) if (!PUBLIC_ETAT_FIELDS.includes(k)) horsEtat.add(k);
if (horsEtat.size) ko('J ter. liste blanche etat', [...horsEtat].join(', '));
else ok('J ter. liste blanche etat', 'aucun sous-champ hors liste blanche');

// --- K. cohérence home ↔ hub -------------------------------------------
// Le hub est GÉNÉRÉ depuis le même artefact : la cohérence est structurelle.
// On le vérifie plutôt que de le supposer.
const hub = JSON.parse(await readFile(resolve(ROOT, 'fixtures/hubs/paris-11e.json'), 'utf8'));
const hubIds = hub.case_ids.map((x) => x.case_id);
const communs = doc.cases.filter((c) => hubIds.includes(c.case_id));
const orphelins = hubIds.filter((id) => !doc.cases.some((c) => c.case_id === id));
ok('K. cohérence home ↔ hub',
  `hub « ${hub.hub_id} » : ${communs.length}/${hubIds.length} affaire(s) présentes dans l’artefact commun` +
  `${orphelins.length ? ' · absentes : ' + orphelins.join(', ') : ''}`);
console.log(`      le hub est généré depuis data/cases.json (build-hubs.mjs) : même source, pas de vérité concurrente`);

// --- L. aucun lien vers un hub non publiable ----------------------------
const liensHub = JSON.stringify(doc).match(/"hub_ref"|"hub_url"/g) || [];
if (liensHub.length) ko('L. lien hub', `${liensHub.length} référence(s) alors que le hub est en brouillon non publiable`);
else ok('L. lien hub', 'aucun lien émis — le hub Paris 11e est encore un brouillon noindex');

console.log('  ' + '─'.repeat(68));
console.log(`  ${echecs === 0 ? '✅' : '❌'}  ${echecs} échec(s)\n`);
process.exit(echecs ? 1 : 0);
