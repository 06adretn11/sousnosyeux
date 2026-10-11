#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-departage.mjs
//
// Oracle du départage par les sources et la chronologie (resolver-0.2.0).
//
// Cas fondateur (11/10/2026) : un article sur une affaire ouverte en février 2026 sortait 11 candidates « partielles »
// (menu de navigation du site compris), dont des affaires de 2022-2023 ; le message concluait « ambiguïté » et tronquait la
// liste à 4, sans la bonne affaire. Les fixtures ci-dessous reproduisent la STRUCTURE de ce cas — textes écrits pour le test,
// aucun nom de personne, aucune URL réelle.
//
//   node scripts/qa/test-departage.mjs        (aucun réseau, aucune base, aucun LLM)
// =====================================================================

import { resoudre, dateOrigine, departager } from '../lib/resolver.mjs';

let ko = 0;
const test = (nom, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${nom}`);
  else { ko++; console.log(`  ✗ ${nom}${detail ? ' — ' + detail : ''}`); }
};

// --- fiches (structure du corpus) ---------------------------------------
const F = (case_id, etablissement, commune, role, sources_dates) =>
  ({ case_id, etablissement, commune, departement: 'X', role_mis_en_cause: role, statut_judiciaire: 'enquête', ...(sources_dates ? { sources_dates } : {}) });

const NICE_ANCIENNE = F('T-ANCIENNE', 'École élémentaire non nommée', 'Nice', 'animateur périscolaire', ['2022-03-22', '2022-03-22']);
const NICE_NOMMEE = F('T-NOMMEE', "Centre de loisirs de l'école maternelle Beau-Rivage", 'Nice', 'animateur périscolaire', ['2026-02-11', '2026-10-03']);
const STRASBOURG = F('T-STRASBOURG', 'Centre de loisirs non nommé', 'Strasbourg', 'animateur périscolaire', ['2023-05-03']);
const LILLE = F('T-LILLE', 'Centre de loisirs non nommé', 'Lille', 'animateur périscolaire', ['2022-10-12']);

// Texte : un menu de navigation (villes) puis un article d'octobre 2026 sur une affaire ouverte en février 2026.
const MENU = 'Actualité Faits divers Paris Lyon Marseille Nantes Toulouse Rennes Strasbourg Montpellier Nice Lille Bordeaux Précédent Suivant';
const ARTICLE_ANNEE = `Nice : douze victimes dans un centre de loisirs. ${MENU} L’affaire avait éclaté au début de l’année 2026 après le signalement d’un médecin. Trois plaintes avaient été déposées contre un animateur du centre de loisirs de l’école maternelle Beau-Rivage, à Nice.`;
const ARTICLE_JOUR = 'Nice : l’affaire débute le 6 février 2026, avec le dépôt de plainte de trois familles visant un animateur périscolaire. Un animateur périscolaire est en détention provisoire.';

console.log('\n  ORACLE DÉPARTAGE\n  ' + '─'.repeat(72));

// --- A. dateOrigine ------------------------------------------------------
console.log('\n  A — début de l’affaire daté par l’article');
test('jour complet : « L’affaire débute le 6 février 2026 »', dateOrigine(ARTICLE_JOUR)?.date === '2026-02-06');
test('année seule (borne basse) : « éclaté au début de l’année 2026 »', dateOrigine(ARTICLE_ANNEE)?.date === '2026-01-01');
test('mois + année : « signalement en mars 2025 »', dateOrigine('Le signalement a eu lieu en mars 2025 dans une école.')?.date === '2025-03-01');
test('une nouvelle plainte n’est PAS un début d’affaire', dateOrigine('Une nouvelle plainte a été déposée le 12 septembre 2026.') === null);
test('un réquisitoire supplétif n’est PAS un début d’affaire', dateOrigine('Un réquisitoire supplétif a été pris : dépôt de plainte du 1er octobre 2026.') === null);
test('une audience qui « débute » n’est PAS un début d’affaire', dateOrigine('L’audience débute le 3 novembre 2026 devant le tribunal.') === null);
test('aucune date → null', dateOrigine('L’affaire avait éclaté après un signalement.') === null);
test('la plus ancienne date d’origine l’emporte', dateOrigine('Le signalement date du 4 mars 2025. Le dépôt de plainte a eu lieu le 9 avril 2025.')?.date === '2025-03-04');

// --- B. departager (une affaire contre un début d’affaire) ---------------
console.log('\n  B — verdict chronologique par affaire');
const orig = { date: '2026-02-06', phrase: '…' };
test('sources toutes antérieures de plus de 30 j → exclue', departager(NICE_ANCIENNE, orig).verdict === 'exclue');
test('sources postérieures au début → compatible', departager(NICE_NOMMEE, orig).verdict === 'compatible');
test('dernière source dans la marge de 30 j → NON exclue', departager(F('M', 'x', 'y', 'z', ['2026-01-20']), orig).verdict === 'compatible');
test('sans date de source → indéterminée (jamais exclue)', departager(F('N', 'x', 'y', 'z'), orig).verdict === 'indeterminee');
test('sans début daté → indéterminée', departager(NICE_ANCIENNE, null).verdict === 'indeterminee');

// --- C. resoudre : le cas fondateur --------------------------------------
console.log('\n  C — cas fondateur : affaire 2026, candidates 2022/2023 et une affaire connue de 2026');
for (const [nom, corps] of [['début en « année »', ARTICLE_ANNEE], ['début en jour complet', ARTICLE_JOUR + ' ' + MENU]]) {
  const r = resoudre({ candidate: {}, index: [NICE_ANCIENNE, NICE_NOMMEE, STRASBOURG, LILLE], corps });
  const restantes = r.detail.filter((d) => d.rattachement !== 'NON_RATTACHABLE').map((d) => d.case_id);
  test(`${nom} : l’affaire de 2022 n’est plus candidate`, !restantes.includes('T-ANCIENNE'), restantes.join(','));
  test(`${nom} : les affaires de 2022/2023 hors commune non plus`, !restantes.includes('T-LILLE') && !restantes.includes('T-STRASBOURG'), restantes.join(','));
  test(`${nom} : l’exclusion est tracée (départage.verdicts)`, r.departage?.verdicts?.some((v) => v.case_id === 'T-ANCIENNE' && v.verdict === 'exclue'));
  test(`${nom} : la raison cite les deux dates`, /2022-03-22/.test(JSON.stringify(r.departage)) && /2026-/.test(JSON.stringify(r.departage)));
  test(`${nom} : jamais de MATCH automatique`, r.resolution_status !== 'MATCH');
  test(`${nom} : 0 appel LLM`, r.llm_calls === 0);
}

// Les lignes de preuve restent propres à leur affaire : un appelant qui retient UNE cible n'hérite pas des manques d'une autre.
{
  const r = resoudre({ candidate: {}, index: [NICE_NOMMEE, F('T-AUTRE', 'École non nommée', 'Nice', 'animateur périscolaire', ['2026-03-01'])], corps: ARTICLE_ANNEE });
  const lignes = [...r.evidence, ...r.conflicts];
  test('chaque ligne de preuve/manque est préfixée par son affaire (« <id> — »)', lignes.length > 0 && lignes.every((l) => /^T-[A-Z]+ — /.test(l)), JSON.stringify(lignes));
  test('l’exclusion de l’affaire ancienne n’est PAS dans les preuves des autres', !JSON.stringify(r.evidence).includes('T-ANCIENNE'));
  test('chaque verdict porte la commune (pour nommer les voisines écartées)', (resoudre({ candidate: {}, index: [NICE_ANCIENNE, NICE_NOMMEE], corps: ARTICLE_ANNEE }).departage?.verdicts || []).every((v) => v.commune));
}

// --- D. non-régression : sans sources datées, comportement inchangé ------
console.log('\n  D — sans dates de sources : comportement 0.1 inchangé');
const SANS = (f) => { const { sources_dates, ...reste } = f; return reste; };
const rSans = resoudre({ candidate: {}, index: [SANS(NICE_ANCIENNE), SANS(NICE_NOMMEE)], corps: ARTICLE_ANNEE });
test('sans sources : aucune exclusion, rien de « départage » dans la sortie', !rSans.departage);
test('sans sources : les deux restent candidates', rSans.detail.filter((d) => d.rattachement !== 'NON_RATTACHABLE').length >= 1);

// --- E. Faidherbe : deux affaires au même établissement -------------------
console.log('\n  E — Faidherbe : même établissement, la chronologie ne fusionne jamais seule');
const FA = F('FA', 'École maternelle Faidherbe', 'Paris 11e', 'animateur périscolaire', ['2024-05-10']);
const FB = F('FB', 'École maternelle Faidherbe', 'Paris 11e', 'animateur périscolaire', ['2026-03-01']);
const corpsFaid = 'École maternelle Faidherbe, Paris 11e : l’affaire a éclaté en mars 2026 avec le dépôt de plainte de familles contre un animateur périscolaire.';
const rF = resoudre({ candidate: {}, index: [FA, FB], corps: corpsFaid });
test('affaire de 2024 écartée, celle de 2026 seule survivante', rF.matched_case_id === 'FB', JSON.stringify(rF.detail));
test('survivant unique issu d’un départage → POSSIBLE_MATCH, pas MATCH', rF.resolution_status === 'POSSIBLE_MATCH');
test('… avec revue humaine obligatoire', rF.requires_human_review === true);
const FB2 = F('FB2', 'École maternelle Faidherbe', 'Paris 11e', 'animateur périscolaire', ['2026-03-05']);
const rF2 = resoudre({ candidate: {}, index: [FB, FB2], corps: corpsFaid });
test('deux affaires compatibles : l’ambiguïté RESTE (aucune fusion)', rF2.resolution_status === 'POSSIBLE_MATCH' && rF2.matched_case_id === null);
// Une OK seule n'est jamais exclue, même si sa chronologie paraît contredite.
const rSeule = resoudre({ candidate: {}, index: [FA], corps: corpsFaid });
test('une affaire seule à se rattacher pleinement n’est PAS exclue', rSeule.resolution_status === 'MATCH' && rSeule.matched_case_id === 'FA');

console.log('\n  ' + '─'.repeat(72));
console.log(ko ? `  ❌ ${ko} échec(s)\n` : '  ✅ tous les tests passent\n');
process.exit(ko ? 1 : 0);
