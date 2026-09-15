// =====================================================================
// scripts/qa/check-corpus.mjs
//
// Applique les règles éditoriales déterministes au corpus RÉEL
// (data/cases.json). Lecture seule — ne modifie jamais les données.
//
// Usage :
//   node scripts/qa/check-corpus.mjs
//   node scripts/qa/check-corpus.mjs --json
// =====================================================================

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkCase, ruleDuplicates, deriveCounters } from './lib/rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const AS_JSON = process.argv.includes('--json');
const TODAY = new Date();

const doc = JSON.parse(await readFile(resolve(ROOT, 'data/cases.json'), 'utf8'));
const cases = doc.cases;

const findings = [...cases.flatMap((c) => checkCase(c, TODAY)), ...ruleDuplicates(cases)];

const bloquants = findings.filter((f) => f.severity === 'bloquant');
const alertes = findings.filter((f) => f.severity === 'alerte');

if (AS_JSON) {
  console.log(JSON.stringify({ generated_at: TODAY.toISOString(), total: cases.length, findings }, null, 2));
  process.exit(bloquants.length ? 1 : 0);
}

const counters = deriveCounters(cases);

console.log(`Corpus réel : ${cases.length} affaires (data/cases.json, généré le ${doc._meta?.generated_at ?? '?'})\n`);

const groupe = (list) => {
  const m = new Map();
  for (const f of list) {
    if (!m.has(f.rule)) m.set(f.rule, []);
    m.get(f.rule).push(f);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};

console.log(`BLOQUANTS — ${bloquants.length}`);
for (const [rule, list] of groupe(bloquants)) {
  console.log(`\n  ${rule} (${list.length})`);
  for (const f of list) console.log(`    · ${f.case_id} — ${f.message}${f.evidence ? ` [${f.evidence}]` : ''}`);
}

console.log(`\n\nALERTES — ${alertes.length}`);
for (const [rule, list] of groupe(alertes)) {
  console.log(`\n  ${rule} (${list.length})`);
  const apercu = list.slice(0, 6);
  for (const f of apercu) console.log(`    · ${f.case_id} — ${f.message}${f.evidence ? ` [${f.evidence}]` : ''}`);
  if (list.length > apercu.length) console.log(`    … et ${list.length - apercu.length} autre(s)`);
}

console.log('\n\nCompteurs dérivés du corpus');
console.log(`  affaires        : ${counters.affaires}`);
console.log(`  établissements  : ${counters.etablissements}`);
console.log(`  par statut      : ${JSON.stringify(counters.par_statut)}`);
console.log(`  dernière vérif. : ${counters.derniere_verif ?? '— (aucun verified_at en base)'}`);

// Portée réelle des règles sur ce corpus : à dire explicitement, sinon un
// « 0 constat » se lit à tort comme « 0 problème ».
console.log('\nPortée des règles sur ce corpus');
const avecTexte = cases.filter((c) => c.resume_public || c.libelle_public).length;
const avecEvents = cases.filter((c) => (c.events || []).length).length;
const avecClaims = cases.filter((c) => (c.claims || []).length).length;
const avecVerif = cases.filter((c) => c.verified_at).length;
console.log(`  R1 (information interdite) : ${avecTexte}/${cases.length} fiches portent un texte public → non exerçable`);
console.log(`  R3 (échéance dépassée)     : ${avecEvents}/${cases.length} fiches portent des événements → non exerçable`);
console.log(`  R8 (affirmations sourcées) : ${avecClaims}/${cases.length} fiches portent des claims → non exerçable`);
console.log(`  R6 (péremption)            : ${avecVerif}/${cases.length} fiches portent verified_at → non exerçable`);
console.log('  Un « 0 constat » sur ces règles signifie « pas de surface à contrôler »,');
console.log('  pas « aucun défaut ». Ces surfaces arrivent avec la migration 004.');

console.log('');
console.log(bloquants.length === 0 ? 'CORPUS_CHECK_PASSED' : `CORPUS_CHECK_FAILED — ${bloquants.length} constat(s) bloquant(s)`);
process.exit(bloquants.length ? 1 : 0);
