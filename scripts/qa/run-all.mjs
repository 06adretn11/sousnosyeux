// =====================================================================
// scripts/qa/run-all.mjs
//
// Enchaîne les contrôles QA dans l'ordre imposé par QA_GATES_V0 §3.5 :
// d'abord ce qui protège d'un dommage irréversible (fuite, donnée
// interdite), ensuite ce qui protège d'une erreur corrigeable.
//
// Usage :
//   node scripts/qa/run-all.mjs
//   node scripts/qa/run-all.mjs --strict   (échoue aussi sur le corpus réel)
// =====================================================================

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STRICT = process.argv.includes('--strict');

const ETAPES = [
  {
    nom: 'G10 — surface publique (fuite de champ interne, secret, prototype)',
    script: 'scripts/qa/check-public-surface.mjs',
    bloquant: true,
  },
  {
    nom: 'Auto-test des règles (chaque règle sait échouer)',
    script: 'scripts/qa/self-test.mjs',
    bloquant: true,
  },
  {
    nom: 'Cycles d’entretien simulés (idempotence, résolution, contradiction)',
    script: 'scripts/qa/run-cycles.mjs',
    bloquant: true,
  },
  {
    nom: 'Corpus réel (data/cases.json)',
    script: 'scripts/qa/check-corpus.mjs',
    bloquant: STRICT,
    note: 'Non bloquant par défaut : les constats portent sur des données réelles publiées, '
      + 'dont la correction est réservée à une décision humaine.',
  },
];

let echecs = 0;
const resume = [];

for (const e of ETAPES) {
  console.log(`\n${'─'.repeat(72)}\n▶ ${e.nom}\n${'─'.repeat(72)}`);
  const r = spawnSync(process.execPath, [resolve(ROOT, e.script)], { cwd: ROOT, stdio: 'inherit' });
  const ok = r.status === 0;
  if (!ok && e.bloquant) echecs++;
  resume.push({ nom: e.nom, ok, bloquant: e.bloquant, note: e.note });
}

console.log(`\n${'═'.repeat(72)}\nRÉCAPITULATIF QA\n${'═'.repeat(72)}`);
for (const r of resume) {
  const etat = r.ok ? '✅ PASSED' : r.bloquant ? '❌ FAILED' : '⚠️  CONSTATS';
  console.log(`  ${etat}  ${r.nom}`);
  if (r.note && !r.ok) console.log(`           ${r.note}`);
}

console.log('');
if (echecs === 0) {
  console.log('QA_PASSED — aucun contrôle bloquant en échec.');
  process.exit(0);
}
console.log(`QA_FAILED — ${echecs} contrôle(s) bloquant(s) en échec.`);
process.exit(1);
