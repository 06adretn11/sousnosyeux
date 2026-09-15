// =====================================================================
// scripts/scan-maintenance.mjs
//
// Scanner d'entretien — porte 4. EN OBSERVATION UNIQUEMENT.
//
// Ce script est déterministe, borné et en lecture seule :
//   · aucun accès réseau ;
//   · aucune écriture dans Supabase ;
//   · aucun scheduler, aucun cron, aucun bot ;
//   · les seuls fichiers écrits sont le rapport et l'état du scanner.
//
// Idempotence : une alerte est identifiée par une empreinte stable
// (règle + cible + éléments déclencheurs). Un second passage sans
// changement ne recrée PAS l'alerte : elle reste « inchangée », avec
// sa date de première détection.
//
// Usage :
//   node scripts/scan-maintenance.mjs
//   node scripts/scan-maintenance.mjs --corpus fixtures/cycles/c1.json \
//                                     --state .scan-state.json --quiet
// =====================================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { checkCase, ruleDuplicates, deriveCounters } from './qa/lib/rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const QUIET = process.argv.includes('--quiet');

const CORPUS = resolve(ROOT, arg('--corpus', 'data/cases.json'));
const STATE = resolve(ROOT, arg('--state', 'data/maintenance-state.json'));
const REPORT_JSON = resolve(ROOT, arg('--report', 'data/maintenance-report.json'));
const REPORT_MD = resolve(ROOT, arg('--report-md', 'docs/industrialisation/MAINTENANCE_REPORT.md'));
const TODAY = new Date(arg('--today', new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');

/** Empreinte stable d'une alerte : ne dépend d'aucun horodatage. */
const fingerprint = (f) =>
  createHash('sha256').update([f.rule, f.case_id, f.evidence ?? ''].join('|')).digest('hex').slice(0, 16);

/** Priorité de revue. Les issues favorables passent devant tout le reste. */
const PRIORITE = {
  R5_relaxe_encore_publiee: 1,
  R7_issue_favorable: 1,
  R7_transition_regressive: 2,
  R3_echeance_depassee: 3,
  R3_echeance_sans_date: 3,
  R9_doublon_probable: 4,
  R4_source_primaire_sans_date: 5,
  R4_source_primaire_non_admissible: 5,
  R4_url_invalide: 5,
  R4_url_tronquee: 5,
  R4_source_indisponible_sans_archive: 6,
  R4_source_secondaire_non_admissible: 6,
  R6_fiche_perimee: 7,
  R7_statut_divergent: 7,
  R5_verified_at_absent: 8,
};
const prioriteDe = (rule) => PRIORITE[rule] ?? 9;

const LIBELLE_PRIORITE = {
  1: 'P1 — issue favorable ou contradictoire (traiter en premier)',
  2: 'P2 — transition régressive',
  3: 'P3 — échéance dépassée',
  4: 'P4 — doublon probable',
  5: 'P5 — défaut de source bloquant',
  6: 'P6 — source dégradée',
  7: 'P7 — fraîcheur / cohérence',
  8: 'P8 — traçabilité de revue',
  9: 'P9 — autre',
};

// ── Analyse ────────────────────────────────────────────────────────
const doc = JSON.parse(await readFile(CORPUS, 'utf8'));
const cases = doc.cases;

const findings = [...cases.flatMap((c) => checkCase(c, TODAY)), ...ruleDuplicates(cases)].map((f) => ({
  ...f,
  fingerprint: fingerprint(f),
  priorite: prioriteDe(f.rule),
}));

// ── État précédent et diff ─────────────────────────────────────────
let previous = { alertes: {} };
try {
  previous = JSON.parse(await readFile(STATE, 'utf8'));
} catch { /* premier passage */ }

const now = TODAY.toISOString().slice(0, 10);
const actuelles = {};
const nouvelles = [];
const inchangees = [];

for (const f of findings) {
  const ancien = previous.alertes?.[f.fingerprint];
  if (ancien) {
    actuelles[f.fingerprint] = { ...ancien, last_seen: now, occurrences: (ancien.occurrences ?? 1) + 1 };
    inchangees.push(f);
  } else {
    actuelles[f.fingerprint] = {
      rule: f.rule,
      case_id: f.case_id,
      severity: f.severity,
      first_seen: now,
      last_seen: now,
      occurrences: 1,
    };
    nouvelles.push(f);
  }
}

const resolues = Object.entries(previous.alertes ?? {})
  .filter(([fp]) => !actuelles[fp])
  .map(([fp, a]) => ({ ...a, fingerprint: fp, resolved_at: now }));

// ── Rapport machine ────────────────────────────────────────────────
const rapport = {
  generated_at: now,
  corpus: arg('--corpus', 'data/cases.json'),
  mode: 'observation',
  mutations: 0,
  total_affaires: cases.length,
  compteurs: deriveCounters(cases),
  resume: {
    total: findings.length,
    bloquants: findings.filter((f) => f.severity === 'bloquant').length,
    alertes: findings.filter((f) => f.severity === 'alerte').length,
    nouvelles: nouvelles.length,
    inchangees: inchangees.length,
    resolues: resolues.length,
  },
  par_priorite: Object.fromEntries(
    [...new Set(findings.map((f) => f.priorite))].sort().map((p) => [
      p,
      { libelle: LIBELLE_PRIORITE[p], count: findings.filter((f) => f.priorite === p).length },
    ])
  ),
  findings: findings.sort((a, b) => a.priorite - b.priorite || a.rule.localeCompare(b.rule)),
  resolues,
};

await mkdir(dirname(REPORT_JSON), { recursive: true });
await writeFile(REPORT_JSON, JSON.stringify(rapport, null, 2) + '\n');
await writeFile(STATE, JSON.stringify({ updated_at: now, alertes: actuelles }, null, 2) + '\n');

// ── Rapport humain ─────────────────────────────────────────────────
const md = [];
md.push('# Rapport d’entretien — sousnosyeux');
md.push('');
md.push(`_Généré le ${now} · mode **observation** · ${rapport.mutations} mutation · corpus \`${rapport.corpus}\`_`);
md.push('');
md.push('> Ce rapport ne modifie rien. Il liste ce qu’un validateur humain doit trancher.');
md.push('');
md.push('| | |');
md.push('|---|---|');
md.push(`| Affaires analysées | ${rapport.total_affaires} |`);
md.push(`| Constats bloquants | **${rapport.resume.bloquants}** |`);
md.push(`| Alertes | ${rapport.resume.alertes} |`);
md.push(`| Nouvelles depuis le dernier passage | **${rapport.resume.nouvelles}** |`);
md.push(`| Inchangées | ${rapport.resume.inchangees} |`);
md.push(`| Résolues depuis le dernier passage | ${rapport.resume.resolues} |`);
md.push('');

if (resolues.length) {
  md.push('## ✅ Résolues depuis le dernier passage');
  md.push('');
  md.push('| Règle | Cible |');
  md.push('|---|---|');
  for (const r of resolues) md.push(`| \`${r.rule}\` | \`${r.case_id}\` |`);
  md.push('');
}

md.push('## File de revue, par priorité');
md.push('');
const parP = new Map();
for (const f of rapport.findings) {
  if (!parP.has(f.priorite)) parP.set(f.priorite, []);
  parP.get(f.priorite).push(f);
}
for (const [p, list] of [...parP.entries()].sort((a, b) => a[0] - b[0])) {
  md.push(`### ${LIBELLE_PRIORITE[p]} — ${list.length}`);
  md.push('');
  md.push('| | Règle | Cible | Constat | État |');
  md.push('|---|---|---|---|---|');
  for (const f of list) {
    const etat = nouvelles.includes(f) ? '🆕 nouvelle' : 'inchangée';
    md.push(
      `| ${f.severity === 'bloquant' ? '🔴' : '🟠'} | \`${f.rule}\` | \`${f.case_id}\` | ` +
      `${f.message}${f.evidence ? ` — \`${f.evidence}\`` : ''} | ${etat} |`
    );
  }
  md.push('');
}

md.push('## Ce que ce scanner ne voit pas');
md.push('');
md.push('- la disponibilité réelle des URL (aucun accès réseau) ;');
md.push('- les noms de personnes non détectables par motif ;');
md.push('- l’exactitude judiciaire d’une affirmation ;');
md.push('- une évolution non encore reflétée dans le corpus : le scanner observe `data/cases.json`,');
md.push('  pas la presse. Il ne remplace pas la veille (`scripts/watch-updates.mjs`).');
md.push('');

await mkdir(dirname(REPORT_MD), { recursive: true });
await writeFile(REPORT_MD, md.join('\n'));

// ── Sortie console ─────────────────────────────────────────────────
if (!QUIET) {
  console.log(`Scanner d'entretien — mode observation, ${rapport.mutations} mutation\n`);
  console.log(`  corpus        : ${rapport.corpus} (${rapport.total_affaires} affaires)`);
  console.log(`  constats      : ${rapport.resume.total} (${rapport.resume.bloquants} bloquants, ${rapport.resume.alertes} alertes)`);
  console.log(`  nouvelles     : ${rapport.resume.nouvelles}`);
  console.log(`  inchangées    : ${rapport.resume.inchangees}`);
  console.log(`  résolues      : ${rapport.resume.resolues}`);
  console.log(`\n  → ${REPORT_JSON.replace(ROOT, '.')}`);
  console.log(`  → ${REPORT_MD.replace(ROOT, '.')}`);
}

// Le scanner observe : il ne fait jamais échouer un build.
process.exit(0);
