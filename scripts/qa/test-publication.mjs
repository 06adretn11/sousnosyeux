// Publication autonome — contre-exemples : chaque garde-fou sait REFUSER, et le point de carte n'est jamais inventé.
import assert from 'node:assert/strict';
import { evaluerPublication } from '../lib/publication-gates.mjs';

const base = { case_id: 'FR-2026-9001', publication_status: 'candidate', fiabilite_info_10: 10, statut_judiciaire: 'enquête', crit_statut_clair: true,
  etablissement: 'Centre de loisirs X', commune: 'Ville', departement: 'Dep', type_structure: 'centre de loisirs', role_mis_en_cause: 'animateur',
  enfants_concernes_public: 'non précisé' };
const validee = { reviewed_by: 'Adrien (Telegram, Discovery)', decision: 'validé', comment: '[Discovery-auto:ab12cd34] VALIDATE — résumé' };
const ctx = (o = {}) => ({ revues: [validee], sources: [{ url: 'https://www.exemple.fr/article-1', media: 'Média' }], holds: new Set(), autres: [], ...o });
const etat = (c = {}, o = {}) => evaluerPublication({ ...base, ...c }, ctx(o));
let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

t('CREATE validé, tout en règle → READY', () => assert.equal(etat().etat, 'READY'));
t('Decision Pack « VALIDATED » → READY', () => assert.equal(etat({}, { revues: [{ ...validee, reviewed_by: 'Adrien (Decision Pack #1)', comment: 'VALIDATED — x' }] }).etat, 'READY'));
t('HOLD → BLOCKED', () => assert.equal(etat({}, { holds: new Set(['FR-2026-9001']) }).etat, 'BLOCKED'));
t('REVIEW (aucune décision de validation) → NON_VALIDEE, jamais publiée', () => assert.equal(etat({}, { revues: [] }).etat, 'NON_VALIDEE'));
t('revue d\'un tiers (pas Adrien) → NON_VALIDEE', () => assert.equal(etat({}, { revues: [{ ...validee, reviewed_by: 'import-script' }] }).etat, 'NON_VALIDEE'));
t('rattachement de sources (RAPPROCHER/ATTACH) ≠ décision de publier', () => assert.equal(etat({}, { revues: [{ ...validee, comment: '[Discovery-auto:ab12cd34] RAPPROCHER — 1 article' }, { ...validee, comment: '[Attach:x] ATTACH décidé' }] }).etat, 'NON_VALIDEE'));
t('validée puis « à corriger » → BLOCKED', () => assert.equal(etat({}, { revues: [validee, { reviewed_by: 'Adrien (x)', decision: 'à corriger', comment: 'preuves' }] }).etat, 'BLOCKED'));
t('« à corriger » puis re-validée → READY (réessayable sans nouvelle intervention technique)', () => assert.equal(etat({}, { revues: [{ reviewed_by: 'Adrien (x)', decision: 'à corriger', comment: 'preuves' }, validee] }).etat, 'READY'));
t('une revue « retirer » → BLOCKED', () => assert.equal(etat({}, { revues: [validee, { reviewed_by: 'Adrien', decision: 'retirer', comment: '' }] }).etat, 'BLOCKED'));
t('fiabilité 7 → BLOCKED', () => assert.equal(etat({ fiabilite_info_10: 7 }).etat, 'BLOCKED'));
t('statut « à qualifier » → BLOCKED', () => assert.equal(etat({ statut_judiciaire: 'à qualifier' }).etat, 'BLOCKED'));
t('aucune source → BLOCKED', () => assert.equal(etat({}, { sources: [] }).etat, 'BLOCKED'));
t('URL tronquée (hallucination) → BLOCKED', () => assert.equal(etat({}, { sources: [{ url: 'https://www.exemple.fr/article...', media: 'M' }] }).etat, 'BLOCKED'));
t('doublon évident (même commune, structure, rôle) → BLOCKED', () => assert.equal(etat({}, { autres: [{ ...base, case_id: 'FR-2026-0001' }] }).etat, 'BLOCKED'));
t('déjà publiée → NON_VALIDEE (rejeu : rien à faire)', () => assert.equal(etat({ publication_status: 'publiée' }).etat, 'NON_VALIDEE'));
t('les raisons ne contiennent ni nom ni lieu', () => assert.ok(!/Ville|Centre de loisirs X/.test(etat({ fiabilite_info_10: 3 }, { autres: [{ ...base, case_id: 'FR-2026-0001' }] }).raisons.join(' '))));

console.log(`\n${n} contrôles de publication autonome : OK`);
