#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-resolver.mjs
//
// Oracle de non-régression du resolver. Quelques cas discriminants, pas
// des dizaines de fixtures.
//
//   A — MATCH évident
//   B — NO_MATCH évident
//   C — FAIDHERBE : même établissement, affaires distinctes → pas de fusion
//   D — même commune + même rôle, établissement différent → pas de MATCH
//   E — décision KEEP_SEPARATE persistée → respectée
//
// Les fiches sont celles du corpus réel (structure), les corps d'articles
// sont ÉCRITS POUR LE TEST et volontairement fictifs : aucun nom de
// personne, aucune URL réelle. Ils n'ont pas vocation à être importés.
//
//   node scripts/qa/test-resolver.mjs
//
// Aucun accès réseau, aucun accès Neon, aucun LLM.
// =====================================================================

import { resoudre, RESOLVER_VERSION } from '../lib/resolver.mjs';

// --- fiches (structure identique au corpus réel) ----------------------
const VIGEE = { case_id: 'FR-2026-0004', etablissement: 'École Vigée Lebrun', commune: 'Paris 15e', role_mis_en_cause: 'animateur périscolaire' };
const VOLONTAIRES = { case_id: 'POC-10', etablissement: 'École Volontaires', commune: 'Paris 15e', role_mis_en_cause: 'animateur périscolaire' };
const EMERIAU = { case_id: 'POC-04', etablissement: 'École Émeriau', commune: 'Paris 15e', role_mis_en_cause: 'intervenant extérieur' };
const FAID_A = { case_id: 'PARIS-009', etablissement: 'École maternelle Faidherbe', commune: 'Paris 11e', role_mis_en_cause: 'animateur périscolaire' };
const FAID_B = { case_id: 'FR-2026-0023', etablissement: 'École maternelle Faidherbe', commune: 'Paris 11e', role_mis_en_cause: 'animateur périscolaire' };

const cas = [
  {
    id: 'A-match-evident',
    quoi: 'établissement + commune + rôle concordent, une seule affaire',
    index: [VIGEE, VOLONTAIRES, EMERIAU],
    corps: "Le tribunal correctionnel de Paris a condamné un animateur périscolaire de l'école Vigée-Lebrun, dans le XVe arrondissement, pour agressions sexuelles sur neuf enfants.",
    attendu: { resolution_status: 'MATCH', matched_case_id: 'FR-2026-0004', requires_human_review: false },
  },
  {
    id: 'B-no-match-evident',
    quoi: 'article hors sujet : aucune affaire ne se rattache',
    index: [VIGEE, VOLONTAIRES, EMERIAU],
    corps: "Le conseil municipal de Bordeaux a voté la rénovation de trois gymnases et la création d'une piste cyclable le long des quais.",
    attendu: { resolution_status: 'NO_MATCH', matched_case_id: null, requires_human_review: false },
  },
  {
    id: 'C-faidherbe-pas-de-fusion',
    quoi: 'DEUX affaires distinctes au même établissement → jamais de fusion automatique',
    index: [FAID_A, FAID_B],
    corps: "Une nouvelle audience s'est tenue concernant l'école maternelle Faidherbe, dans le 11e arrondissement de Paris, où un animateur périscolaire est mis en cause.",
    attendu: { resolution_status: 'POSSIBLE_MATCH', matched_case_id: null, requires_human_review: true },
  },
  {
    id: 'D-meme-commune-meme-role-autre-etablissement',
    quoi: 'commune et rôle identiques mais établissement différent → pas de MATCH',
    index: [VIGEE, VOLONTAIRES],
    corps: "Un animateur périscolaire exerçant dans le XVe arrondissement de Paris a été suspendu après un signalement. L'établissement concerné n'a pas été précisé par le parquet.",
    attendu: { resolution_status: 'NO_MATCH', matched_case_id: null },
  },
  {
    id: 'E-keep-separate-respecte',
    quoi: 'un KEEP_SEPARATE humain écarte l’affaire malgré des indices concordants',
    index: [VIGEE, VOLONTAIRES, EMERIAU],
    corps: "Le tribunal correctionnel de Paris a condamné un animateur périscolaire de l'école Vigée-Lebrun, dans le XVe arrondissement, pour agressions sexuelles sur neuf enfants.",
    arbitrages: { attach: new Set(), separate: new Set(['FR-2026-0004']) },
    attendu: { resolution_status: 'NO_MATCH', matched_case_id: null },
  },
  {
    id: 'F-attach-humain-prime',
    quoi: 'un ATTACH humain l’emporte même si le texte seul serait ambigu',
    index: [FAID_A, FAID_B],
    corps: "Une nouvelle audience s'est tenue concernant l'école maternelle Faidherbe, dans le 11e arrondissement de Paris, où un animateur périscolaire est mis en cause.",
    arbitrages: { attach: new Set(['FR-2026-0023']), separate: new Set() },
    attendu: { resolution_status: 'MATCH', matched_case_id: 'FR-2026-0023', requires_human_review: false },
  },
];

// --- exécution ---------------------------------------------------------
console.log(`\n  ORACLE RESOLVER — ${RESOLVER_VERSION}\n  ${'─'.repeat(72)}`);
let echecs = 0;
let llmTotal = 0;

for (const c of cas) {
  const r = resoudre({
    candidate: { title: '', excerpt: '' },
    index: c.index,
    corps: c.corps,
    arbitrages: c.arbitrages || null,
  });
  llmTotal += r.llm_calls;

  const ecarts = Object.entries(c.attendu)
    .filter(([k, v]) => r[k] !== v)
    .map(([k, v]) => `${k}: attendu ${JSON.stringify(v)}, obtenu ${JSON.stringify(r[k])}`);

  if (ecarts.length) {
    echecs++;
    console.log(`\n  ❌  ${c.id}`);
    console.log(`      ${c.quoi}`);
    ecarts.forEach((e) => console.log(`      ✗ ${e}`));
  } else {
    console.log(`\n  ✅  ${c.id}`);
    console.log(`      ${c.quoi}`);
    console.log(`      → ${r.resolution_status}${r.matched_case_id ? ' · ' + r.matched_case_id : ''}` +
      `${r.requires_human_review ? ' · revue humaine requise' : ''}`);
  }
  if (r.conflicts.length) r.conflicts.forEach((x) => console.log(`      ⚠ ${x}`));
  console.log(`      examinées : ${r.detail.map((d) => d.case_id + '=' + d.rattachement).join(' · ')}`);
}

console.log(`\n  ${'─'.repeat(72)}`);
console.log(`  ${cas.length - echecs}/${cas.length} cas conformes · ${echecs} échec(s)`);
console.log(`  instrumentation : ${llmTotal} appel(s) LLM · tokens not_measured\n`);
process.exit(echecs ? 1 : 0);
