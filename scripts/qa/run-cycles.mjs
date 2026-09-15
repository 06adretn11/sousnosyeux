// =====================================================================
// scripts/qa/run-cycles.mjs
//
// Porte 4 — exécute des cycles d'entretien simulés sur fixtures et
// vérifie trois propriétés :
//
//   1. IDEMPOTENCE  — un second passage sans changement ne recrée pas
//                     les mêmes alertes actives ;
//   2. RÉSOLUTION   — une correction / un retrait / une fusion fait
//                     disparaître les alertes correspondantes ;
//   3. CONTRADICTION — une information défavorable à la présentation
//                     initiale remonte en priorité 1.
//
// Lecture seule sur les fixtures. Les artefacts sont écrits dans un
// dossier de travail jetable.
//
// Usage : node scripts/qa/run-cycles.mjs
// =====================================================================

import { readFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORK = resolve(ROOT, '.scan-cycles');
const TODAY = '2026-09-15';

await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });

let failures = 0;
const fail = (m) => { failures++; console.log(`  ❌ ${m}`); };
const ok = (m) => console.log(`  ✅ ${m}`);

function scan(corpus, label) {
  const report = resolve(WORK, `${label}.json`);
  const r = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'scripts/scan-maintenance.mjs'),
      '--corpus', `fixtures/cycles/${corpus}.json`,
      '--state', '.scan-cycles/state.json',
      '--report', `.scan-cycles/${label}.json`,
      '--report-md', `.scan-cycles/${label}.md`,
      '--today', TODAY,
      '--quiet',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(`scan ${label} a échoué : ${r.stderr}`);
  return report;
}

const lire = async (p) => JSON.parse(await readFile(p, 'utf8'));

console.log(`Cycles d'entretien simulés — date de référence ${TODAY}\n`);

// ── Cycle 1 : état initial ─────────────────────────────────────────
console.log('Cycle 1 — état initial');
const r1 = await lire(scan('c1', 'cycle-1'));
console.log(`  ${r1.resume.total} constat(s) · ${r1.resume.nouvelles} nouvelle(s) · ${r1.resume.resolues} résolue(s)`);
if (r1.resume.nouvelles === r1.resume.total && r1.resume.total > 0) {
  ok(`premier passage : les ${r1.resume.total} constats sont nouveaux`);
} else {
  fail(`premier passage incohérent (nouvelles=${r1.resume.nouvelles}, total=${r1.resume.total})`);
}
const relaxe = r1.findings.find((f) => f.rule === 'R5_relaxe_encore_publiee');
relaxe ? ok(`relaxe encore publiée détectée (${relaxe.case_id}, priorité ${relaxe.priorite})`)
       : fail('relaxe encore publiée NON détectée');
const dup1 = r1.findings.find((f) => f.rule === 'R9_doublon_probable');
dup1 ? ok(`doublon détecté (${dup1.case_id})`) : fail('doublon NON détecté');

// ── Cycle 2 : IDEMPOTENCE ──────────────────────────────────────────
console.log('\nCycle 2 — même corpus, aucun changement (idempotence)');
const r2 = await lire(scan('c1', 'cycle-2'));
console.log(`  ${r2.resume.total} constat(s) · ${r2.resume.nouvelles} nouvelle(s) · ${r2.resume.resolues} résolue(s)`);
if (r2.resume.nouvelles === 0) ok('aucune alerte recréée — idempotence vérifiée');
else fail(`${r2.resume.nouvelles} alerte(s) recréée(s) à l'identique`);
if (r2.resume.resolues === 0) ok('aucune alerte faussement résolue');
else fail(`${r2.resume.resolues} alerte(s) faussement résolue(s)`);
if (r2.resume.total === r1.resume.total) ok(`total stable (${r2.resume.total})`);
else fail(`total instable : ${r1.resume.total} → ${r2.resume.total}`);

// ── Cycle 3 : RÉSOLUTION ───────────────────────────────────────────
console.log('\nCycle 3 — correction, retrait et fusion appliqués');
const r3 = await lire(scan('c2', 'cycle-3'));
console.log(`  ${r3.resume.total} constat(s) · ${r3.resume.nouvelles} nouvelle(s) · ${r3.resume.resolues} résolue(s)`);
const reglesResolues = r3.resolues.map((r) => r.rule);
for (const attendu of ['R5_relaxe_encore_publiee', 'R4_source_primaire_sans_date', 'R9_doublon_probable']) {
  reglesResolues.includes(attendu)
    ? ok(`${attendu} résolue après intervention`)
    : fail(`${attendu} NON résolue — résolues : ${reglesResolues.join(', ') || 'aucune'}`);
}
if (r3.findings.some((f) => f.rule === 'R5_relaxe_encore_publiee')) {
  fail('la fiche retirée déclenche encore une alerte de retrait');
} else {
  ok('la fiche retirée ne déclenche plus aucune alerte de retrait');
}

// ── Cycle 4 : INFORMATION CONTRADICTOIRE ───────────────────────────
console.log('\nCycle 4 — information contradictoire sur une fiche jusque-là saine');
const r4 = await lire(scan('c3', 'cycle-4'));
console.log(`  ${r4.resume.total} constat(s) · ${r4.resume.nouvelles} nouvelle(s) · ${r4.resume.resolues} résolue(s)`);
const favorable = r4.findings.find((f) => f.rule === 'R7_issue_favorable');
if (favorable) {
  ok(`issue favorable détectée sur ${favorable.case_id}`);
  favorable.priorite === 1
    ? ok('classée en priorité 1 — traitée avant tout le reste')
    : fail(`classée en priorité ${favorable.priorite}, attendu 1`);
  r4.findings.filter((f) => f.rule === 'R7_issue_favorable').every((f) => r4.resume.nouvelles > 0)
    ? ok('remontée comme NOUVELLE alerte, pas noyée dans l’existant')
    : fail('non remontée comme nouvelle');
} else {
  fail('issue favorable NON détectée');
}

// ── Vérification finale : aucune mutation ──────────────────────────
console.log('\nContrôle de non-mutation');
for (const [label, r] of [['c1', r1], ['c2', r3], ['c3', r4]]) {
  r.mutations === 0 && r.mode === 'observation'
    ? ok(`${label} — mode observation, 0 mutation`)
    : fail(`${label} — mode ${r.mode}, ${r.mutations} mutation(s)`);
}

console.log('');
if (failures === 0) {
  console.log('CYCLES_PASSED — idempotence, résolution et priorité aux issues favorables vérifiées.');
  process.exit(0);
}
console.log(`CYCLES_FAILED — ${failures} écart(s).`);
process.exit(1);
