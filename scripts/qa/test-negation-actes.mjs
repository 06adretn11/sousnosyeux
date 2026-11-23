#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-negation-actes.mjs — sens des actes : négation, portée, rappel (audit du 21/11/2026)
//
// Un acte NIÉ ou RAPPELÉ n'est jamais un acte énoncé. Phrases synthétiques ou génériques (aucun nom de personne,
// aucun identifiant d'affaire) ; le cas déclencheur est la formulation de presse « n'a pas été mis en examen ».
//
//   node scripts/qa/test-negation-actes.mjs        Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { actes, actesDetail, suffisance } from '../lib/routage-veille.mjs';

let ok = 0, ko = 0;
const test = (nom, fn) => {
  try { fn(); ok++; console.log(`  ✔ ${nom}`); }
  catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); }
};
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
const a = (t) => actes(t);
console.log('\n  sens des actes — négation, portée, rappel\n');

test('1. « n’a pas été mis en examen » : acte nié, jamais affirmé', () => {
  const d = actesDetail('Soupçons de violences à X : l’animateur n’a pas été mis en examen');
  vrai(!d.affirmes.includes('MISE_EN_EXAMEN') && d.nies.includes('MISE_EN_EXAMEN'), JSON.stringify(d));
});
test('2. « le juge n’a pas mis en examen le trentenaire » (sujet = le juge)', () => {
  vrai(!a('Le juge n’a pas mis en examen le trentenaire, au vu des premiers éléments').includes('MISE_EN_EXAMEN'), 'lu comme une mise en examen');
});
test('3. « présenté au juge sans mise en examen »', () => {
  vrai(!a('Présenté à un juge d’instruction jeudi, l’homme est reparti sans mise en examen').includes('MISE_EN_EXAMEN'), 'lu comme une mise en examen');
});
test('4. « aucune mise en examen n’a été prononcée » et « pas de mise en examen »', () => {
  vrai(!a('À ce stade, aucune mise en examen n’a été prononcée').includes('MISE_EN_EXAMEN'), 'aucune');
  vrai(!a('Il n’y a pas de mise en examen à ce stade').includes('MISE_EN_EXAMEN'), 'pas de');
});
test('5. négatif PUIS positif : « n’a pas été condamné mais a été mis en examen »', () => {
  const d = actesDetail('L’homme n’a pas été condamné mais a été mis en examen');
  vrai(d.affirmes.includes('MISE_EN_EXAMEN'), 'la mise en examen affirmée est perdue');
  vrai(!d.affirmes.includes('VERDICT_CONDAMNATION') && d.nies.includes('VERDICT_CONDAMNATION'), 'la condamnation niée est affirmée');
});
test('6. négation d’un acte, affirmation d’un autre : « pas mis en examen, le parquet fait appel »', () => {
  const l = a('Soupçons de violences : l’animateur n’a pas été mis en examen, le procureur fait appel');
  vrai(l.includes('APPEL_FORME') && !l.includes('MISE_EN_EXAMEN'), `actes=${l}`);
});
test('7. la négation ne porte pas sur un verbe intermédiaire : « n’a pas contesté la condamnation »', () => {
  vrai(a('Il n’a pas contesté la condamnation prononcée mardi').includes('VERDICT_CONDAMNATION'), 'condamnation perdue à tort');
});
test('8. « ni détention provisoire » nie la détention, pas la mise en examen qui précède', () => {
  const d = actesDetail('Mis en examen, il n’a fait l’objet ni de détention provisoire ni d’un mandat de dépôt');
  vrai(d.affirmes.includes('MISE_EN_EXAMEN') && !d.affirmes.includes('ECROU'), JSON.stringify(d));
});
test('9. rappel d’un acte ancien dans un article récent : jamais un acte nouveau', () => {
  const d = actesDetail('Six mois après la mise en examen d’un animateur de centre de loisirs, douze enfants sont désormais concernés');
  vrai(!d.affirmes.includes('MISE_EN_EXAMEN') && d.rappeles.includes('MISE_EN_EXAMEN'), JSON.stringify(d));
});
test('10. « avait été mis en examen » rappelle ; « vient d’être condamné » affirme', () => {
  const d = actesDetail('L’ancien surveillant, qui avait été mis en examen en 2024, vient d’être condamné');
  vrai(d.affirmes.includes('VERDICT_CONDAMNATION') && d.rappeles.includes('MISE_EN_EXAMEN') && !d.affirmes.includes('MISE_EN_EXAMEN'), JSON.stringify(d));
});
test('11. régression : formulations affirmatives inchangées', () => {
  vrai(a('Un animateur mis en examen et placé en détention provisoire').includes('MISE_EN_EXAMEN'), 'mise en examen');
  vrai(a('Un animateur mis en examen et placé en détention provisoire').includes('ECROU'), 'détention');
  vrai(a('L’enseignant condamné à trois ans de prison').includes('VERDICT_CONDAMNATION'), 'condamnation');
  vrai(a('Le parquet fait appel de la relaxe').includes('APPEL_FORME'), 'appel');
  vrai(a('Non-lieu pour l’ancien directeur').includes('VERDICT_RELAXE'), 'non-lieu');
});
test('12. une citation qui NIE l’acte n’établit pas un claim de cet acte (suffisance)', () => {
  const s = suffisance({ moteur: 'deepseek', rattachement: 'OK', evidence: ['le juge n’a pas mis en examen le trentenaire, au vu des premiers éléments recueillis'], acte: 'MISE_EN_EXAMEN', dateOk: true });
  vrai(s.acteEtabli === false && s.suffisante === false, JSON.stringify(s));
});
test('13. « classé sans suite » reste un classement ; « sans suite » dans « pas de classement sans suite » est nié', () => {
  vrai(a('L’affaire a été classée sans suite').includes('VERDICT_RELAXE'), 'classement');
  vrai(!a('Il n’y a pas eu de classement sans suite').includes('VERDICT_RELAXE'), 'classement nié');
});

console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
