// =====================================================================
// scripts/qa/self-test.mjs
//
// Prouve que chaque règle SAIT ÉCHOUER.
// Un contrôle qui ne se déclenche jamais ne vaut rien : ce harnais
// compare, pour chaque fixture, les règles attendues et les règles
// réellement déclenchées, dans les DEUX sens (manquantes ET en trop).
//
// Usage : node scripts/qa/self-test.mjs
// Sortie : code 0 si tout concorde, 1 sinon.
// =====================================================================

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkCase, ruleDuplicates } from './lib/rules.mjs';
import { findInternalFields, projectCase, projectSource } from '../lib/public-projection.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const doc = JSON.parse(await readFile(resolve(ROOT, 'fixtures/editorial/cases.json'), 'utf8'));
const TODAY = new Date(`${doc._meta.today_reference}T00:00:00Z`);

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ❌ ${msg}`); };
const ok = (msg) => console.log(`  ✅ ${msg}`);

console.log(`Corpus de fixtures : ${doc.cases.length} fiches · date de référence ${doc._meta.today_reference}\n`);

// ── 1) Règles par fiche ────────────────────────────────────────────
console.log('1) Règles par fiche');
const perCase = new Map();
for (const c of doc.cases) {
  const findings = checkCase(c, TODAY);
  perCase.set(c.case_id, findings);
  const got = new Set(findings.map((f) => f.rule));
  const expected = new Set(c._expect || []);

  const manquantes = [...expected].filter((r) => !got.has(r));
  const enTrop = [...got].filter((r) => !expected.has(r));

  if (c._expect_clean && got.size > 0) {
    fail(`${c.case_id} — attendue sans constat, obtenu : ${[...got].join(', ')}`);
    continue;
  }
  if (manquantes.length) fail(`${c.case_id} — règles NON déclenchées : ${manquantes.join(', ')}`);
  if (enTrop.length) fail(`${c.case_id} — règles inattendues : ${enTrop.join(', ')}`);
  if (!manquantes.length && !enTrop.length) {
    ok(`${c.case_id} — ${expected.size} règle(s) attendue(s), ${expected.size} déclenchée(s)`);
  }
}

// ── 2) Règles par corpus : doublons ────────────────────────────────
console.log('\n2) Détection de doublons (corpus)');
const dups = ruleDuplicates(doc.cases);
const dupIds = dups.map((d) => d.case_id);
const attenduDup = 'FIX-06a-doublon/FIX-06b-doublon';
if (dupIds.includes(attenduDup)) {
  ok(`paire ${attenduDup} détectée (${dups.find((d) => d.case_id === attenduDup).severity})`);
} else {
  fail(`paire ${attenduDup} NON détectée — trouvé : ${dupIds.join(' ; ') || 'rien'}`);
}
// FIX-07 et FIX-08 partagent l'établissement mais pas la commune : pas un doublon.
if (dupIds.some((id) => id.includes('FIX-07') && id.includes('FIX-08'))) {
  fail('faux positif : FIX-07/FIX-08 (communes différentes) signalés comme doublons');
} else {
  ok('aucun faux positif sur FIX-07/FIX-08 (même établissement, communes différentes)');
}

// ── 3) Projection publique ─────────────────────────────────────────
// Une fixture est un enregistrement CANONIQUE : elle contient
// légitimement des champs internes (publication_status, justifying_quote…).
// Ce qui doit être propre, c'est sa PROJECTION publique.
console.log('\n3) Projection publique');

// 3a) Le détecteur détecte-t-il ? (sur l'enregistrement brut)
for (const c of doc.cases.filter((x) => x._expect_projection)) {
  const hits = [...new Set(findInternalFields(c).map((h) => h.field))];
  const manquants = c._expect_projection.filter((f) => !hits.includes(f));
  if (manquants.length) fail(`${c.case_id} — champs internes NON détectés : ${manquants.join(', ')}`);
  else ok(`${c.case_id} — détecteur : ${c._expect_projection.join(', ')} repéré(s) dans l'enregistrement brut`);
}

// 3b) La projection nettoie-t-elle ? (sur TOUTES les fixtures, y compris
//     celle qui contient volontairement une fuite)
let projectionSale = 0;
for (const c of doc.cases) {
  const projete = { ...projectCase(c), sources: (c.sources || []).map(projectSource) };
  const hits = [...new Set(findInternalFields(projete).map((h) => h.field))];
  if (hits.length) {
    projectionSale++;
    fail(`${c.case_id} — la projection publique laisse passer : ${hits.join(', ')}`);
  }
}
if (projectionSale === 0) {
  ok(`projection publique propre sur les ${doc.cases.length} fixtures (dont FIX-10 qui contient une fuite volontaire)`);
}

// ── 4) Couverture : chaque règle implémentée est-elle éprouvée ? ───
console.log('\n4) Couverture des règles');
const declenchees = new Set();
for (const f of [...perCase.values()].flat()) declenchees.add(f.rule);
for (const d of dups) declenchees.add(d.rule);
console.log(`  règles distinctes éprouvées par le corpus : ${declenchees.size}`);
console.log(`  ${[...declenchees].sort().join('\n  ')}`);

// ── Verdict ────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log('SELF_TEST_PASSED — chaque règle éprouvée se déclenche sur le défaut attendu, et sur lui seul.');
  process.exit(0);
} else {
  console.log(`SELF_TEST_FAILED — ${failures} écart(s).`);
  process.exit(1);
}
