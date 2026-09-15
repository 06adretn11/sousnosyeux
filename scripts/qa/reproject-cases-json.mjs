// =====================================================================
// scripts/qa/reproject-cases-json.mjs
//
// Repasse data/cases.json à travers la projection publique.
// Sert à purger un export produit AVANT la mise en place de la liste
// blanche, sans avoir besoin d'un accès Supabase.
//
// Usage :
//   node scripts/qa/reproject-cases-json.mjs --dry-run
//   node scripts/qa/reproject-cases-json.mjs
// =====================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  projectCase,
  projectSource,
  findInternalFields,
  assertNoInternalFields,
} from '../lib/public-projection.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CASES_PATH = resolve(ROOT, 'data/cases.json');
const DRY = process.argv.includes('--dry-run');

const doc = JSON.parse(await readFile(CASES_PATH, 'utf8'));

const before = findInternalFields(doc);
const byField = {};
for (const h of before) byField[h.field] = (byField[h.field] || 0) + 1;

const out = {
  _meta: { ...doc._meta, projection: 'public-whitelist-v0' },
  cases: doc.cases.map((c) => ({
    ...projectCase(c),
    sources: (c.sources || []).map(projectSource),
  })),
};

assertNoInternalFields(out, 'data/cases.json (reprojection)');

console.log(`Champs internes trouvés avant reprojection : ${before.length}`);
for (const [f, n] of Object.entries(byField)) console.log(`  - ${f} × ${n}`);
console.log(`Affaires : ${doc.cases.length} → ${out.cases.length}`);

if (DRY) {
  console.log('[dry-run] Aucun fichier modifié.');
} else {
  await writeFile(CASES_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✅ Réécrit : ${CASES_PATH}`);
}
