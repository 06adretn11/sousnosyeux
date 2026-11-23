#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-reprise-bornee.mjs — décision du garde-fou quotidien : fenêtre, passage du jour, reprise PLAFONNÉE (fonction pure, aucune base)
//   node scripts/qa/test-reprise-bornee.mjs
// Le chemin SQL complet (case_checks → --sauter-reussies-du-jour → garde-quotidien) est exercé hors dépôt sur une base locale isolée : docs/industrialisation/LOT_CORRECTIF_MAINTENANCE_23_11.md §6.
// =====================================================================
import { decisionGarde, incompletsDuJour, valeurIncompletsApres, REPRISES_MAX } from '../lib/reprise-bornee.mjs';

let ok = 0, ko = 0;
const test = (nom, fn) => {
  try { fn(); ok++; console.log(`  ✔ ${nom}`); }
  catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); }
};
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
console.log('\n  garde-fou quotidien — reprise plafonnée\n');
const J = '2026-11-23';

test('1. pas encore passé, dans la fenêtre, aucun passage incomplet : le créneau travaille', () => {
  vrai(decisionGarde({ dernierPassage: '2026-11-22', jour: J, heureUtc: 9 }).raison === 'travaille', 'devrait travailler');
});
test('2. déjà passé aujourd’hui (passage complet consigné) : le créneau ne fait rien', () => {
  vrai(decisionGarde({ dernierPassage: J, jour: J, heureUtc: 9 }).raison === 'deja_passe', 'devrait être ignoré');
});
test('3. hors fenêtre (nuit) : rien', () => {
  vrai(decisionGarde({ dernierPassage: null, jour: J, heureUtc: 3 }).raison === 'hors_fenetre' && decisionGarde({ dernierPassage: null, jour: J, heureUtc: 19 }).skip, 'fenêtre 05h–19h UTC');
});
test('4. des passages incomplets en dessous du plafond : la reprise continue', () => {
  let v = null;
  for (let i = 1; i < REPRISES_MAX; i++) {
    v = valeurIncompletsApres(v, J);
    const d = decisionGarde({ dernierPassage: null, valeurIncomplets: v, jour: J, heureUtc: 10 });
    vrai(!d.skip && d.incomplets === i, `après ${i} passage(s) : ${JSON.stringify(d)}`);
  }
});
test('5. au plafond : les créneaux suivants du même jour ne relancent plus la veille', () => {
  let v = null;
  for (let i = 0; i < REPRISES_MAX; i++) v = valeurIncompletsApres(v, J);
  const d = decisionGarde({ dernierPassage: null, valeurIncomplets: v, jour: J, heureUtc: 10 });
  vrai(d.skip && d.raison === 'reprises_epuisees' && d.incomplets === REPRISES_MAX, JSON.stringify(d));
  // 40 déclenchements de plus ne changent rien : la décision ne dépend que du compteur (jamais incrémenté par un créneau ignoré).
  for (let i = 0; i < 40; i++) vrai(decisionGarde({ dernierPassage: null, valeurIncomplets: v, jour: J, heureUtc: 10 }).skip, 'un créneau a repris malgré le plafond');
});
test('6. le lendemain : le compteur d’hier ne compte plus', () => {
  const hier = valeurIncompletsApres(valeurIncompletsApres(valeurIncompletsApres(null, '2026-11-22'), '2026-11-22'), '2026-11-22');
  vrai(incompletsDuJour(hier, J) === 0 && !decisionGarde({ dernierPassage: '2026-11-22', valeurIncomplets: hier, jour: J, heureUtc: 10 }).skip, 'le plafond d’hier bloque aujourd’hui');
});
test('7. compteur absent, vide ou corrompu : jamais un blocage (fail-safe vers « travaille »)', () => {
  for (const v of [null, '', 'n’importe quoi', '2026-11-23:abc', '2026-11-23:99999']) vrai(!decisionGarde({ dernierPassage: null, valeurIncomplets: v, jour: J, heureUtc: 10 }).skip, `valeur ${v}`);
});
test('8. un passage complet consigné prime sur le compteur (la reprise réussie clôt le jour)', () => {
  let v = null; for (let i = 0; i < 2; i++) v = valeurIncompletsApres(v, J);
  vrai(decisionGarde({ dernierPassage: J, valeurIncomplets: v, jour: J, heureUtc: 10 }).raison === 'deja_passe', 'jour clos');
});

console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
