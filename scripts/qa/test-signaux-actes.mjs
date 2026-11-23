#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-signaux-actes.mjs — règle opérationnelle : aucun fait incertain inscrit comme établi, mais le SIGNAL est conservé (lib/signaux-actes.mjs)
// Phrases synthétiques ; aucun réseau, aucun Neon, aucun modèle.   node scripts/qa/test-signaux-actes.mjs
// =====================================================================
import { detecterActesProcéduraux } from '../lib/acte-procedural.mjs';
import { signauxNonRetenus } from '../lib/signaux-actes.mjs';

let ok = 0, ko = 0;
const test = (nom, fn) => {
  try { fn(); ok++; console.log(`  ✔ ${nom}`); }
  catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); }
};
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
const lire = (c) => { const f = detecterActesProcéduraux([c], { pubDate: '2026-11-20' }); return { faits: f, signaux: signauxNonRetenus([c], f) }; };
console.log('\n  signal conservé quand le fait est incertain\n');

test('1. « Il a fait appel » dans une phrase qui porte son contexte : fait au libellé le plus pauvre (« un appel a été formé »), ni auteur ni date inventés', () => {
  const r = lire('Condamné en janvier à six ans de prison, l’homme a toujours clamé son innocence. Il a fait appel.');
  vrai(r.faits.length === 1 && r.faits[0].mesure === 'appel' && r.faits[0].event_date === null && r.signaux.length === 0, JSON.stringify(r));
});
test('2. « Il a fait appel. » SEUL (16 caractères, pas de contexte) : AUCUN fait, mais le signal « acte affirmé, non retenu » est conservé', () => {
  const r = lire('Il a fait appel.');
  vrai(r.faits.length === 0 && r.signaux.length === 1 && r.signaux[0].acte === 'APPEL_FORME' && r.signaux[0].etat === 'incertain', JSON.stringify(r));
});
test('3. acte NIÉ : aucun fait, signal « nie »', () => {
  const r = lire('Il n’a pas fait appel de la décision rendue mardi par le tribunal.');
  vrai(r.faits.length === 0 && r.signaux[0]?.etat === 'nie', JSON.stringify(r));
});
test('4. acte ENVISAGÉ (« pourrait », « n’exclut pas ») : aucun fait, signal « ecarte » — jamais « nié »', () => {
  for (const c of ['Le parquet pourrait faire appel de la relaxe, a indiqué le procureur ce mardi.', 'Son avocat n’exclut pas de faire appel de la décision rendue mardi.']) {
    const r = lire(c);
    vrai(r.faits.length === 0 && r.signaux[0]?.etat === 'ecarte', `${c} → ${JSON.stringify(r)}`);
  }
});
test('5. acte RAPPELÉ (ancien) : aucun fait, signal « rappele »', () => {
  const r = lire('Il avait fait appel en 2024, sans succès, avant sa condamnation définitive à Rennes.');
  vrai(r.faits.length === 0 && r.signaux[0]?.etat === 'rappele', JSON.stringify(r));
});
test('6. fait retenu : aucun signal parasite', () => {
  const r = lire('Le suspect a été placé en détention provisoire dans la nuit de jeudi à vendredi.');
  vrai(r.faits.length === 1 && r.signaux.length === 0, JSON.stringify(r));
});
test('7. aucune citation, aucun acte : aucun signal (jamais de bruit)', () => {
  vrai(signauxNonRetenus([], []).length === 0 && signauxNonRetenus(['Une centaine de parents se sont rassemblés devant l’école ce jeudi.'], []).length === 0, 'signal inattendu');
});
test('8. un signal ne porte ni nom, ni citation : seulement un code d’acte et un état', () => {
  const s = signauxNonRetenus(['Il n’a pas fait appel de la décision rendue mardi par le tribunal.'], []);
  vrai(s.every((x) => Object.keys(x).sort().join() === 'acte,etat'), JSON.stringify(s));
});

console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
