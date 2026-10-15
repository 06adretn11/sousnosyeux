// Diagnostic territorial — le diagnostic ÉVOLUE avec la mémoire, et ne fait pas de bruit.
import assert from 'node:assert/strict';
import { diagnostiquer, instantane, messageDiagnostic } from '../lib/diagnostic-territoire.mjs';

const T = (o = {}) => ({ hub: 'bordeaux-gironde', publiques: ['FR-2026-0113', 'FR-2026-0114'], horsHub: [], candidatesValidees: 0, reviewNonPublic: 0, evenements: 3, reactions: 0, sources: 8, ...o });
let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

t('premier passage : base de référence, jamais de notification', () => assert.equal(diagnostiquer(T({ horsHub: ['FR-2026-0113'] }), null).significatif, false));
t('Frida-Kahlo AVANT intégration (publique, absente du Hub) → INTEGRER_HUB', () => {
  const e = T({ horsHub: ['FR-2026-0113'] }); const d = diagnostiquer(e, instantane(T()));
  assert.equal(d.decision, 'INTEGRER_HUB'); assert.equal(d.significatif, true); assert.match(d.pourquoi[0], /FR-2026-0113/);
});
t('Frida-Kahlo APRÈS intégration, rien d’autre → NO_ACTION, aucune notification', () => { const d = diagnostiquer(T(), instantane(T())); assert.equal(d.decision, 'NO_ACTION'); assert.equal(d.significatif, false); });
t('Cenon : publication d’une affaire du périmètre (+1 publique) → ENRICHIR_HUB', () => {
  const avant = instantane(T({ publiques: ['FR-2026-0113'], candidatesValidees: 1, sources: 4 }));
  const d = diagnostiquer(T(), avant); assert.equal(d.decision, 'ENRICHIR_HUB'); assert.equal(d.significatif, true); assert.ok(d.pourquoi.some((p) => /affaire\(s\) publique/.test(p)));
});
t('réaction institutionnelle SANS changement d’état judiciaire (+1 événement/réaction) → ENRICHIR_HUB', () => {
  const d = diagnostiquer(T({ evenements: 4, reactions: 1 }), instantane(T()));
  assert.equal(d.decision, 'ENRICHIR_HUB'); assert.ok(d.pourquoi.some((p) => /réaction/.test(p)));
});
t('Territoire sans Hub : 3 affaires publiques documentées (chronologie validée) → PROPOSER_NOUVEAU_HUB, notifié seulement quand le territoire bouge', () => {
  const e = { hub: null, publiques: ['a', 'b', 'c'], horsHub: [], candidatesValidees: 0, reviewNonPublic: 0, evenements: 3, reactions: 0, avecMatiere: 3, sources: 6 };
  assert.equal(diagnostiquer(e, null).decision, 'PROPOSER_NOUVEAU_HUB');
  assert.equal(diagnostiquer(e, instantane(e)).significatif, false);
  assert.equal(diagnostiquer({ ...e, publiques: ['a', 'b', 'c', 'd'], sources: 8 }, instantane(e)).significatif, true);
});
t('moins de 3 affaires, aucun Hub → NO_ACTION', () => assert.equal(diagnostiquer({ hub: null, publiques: ['a', 'b'], horsHub: [], candidatesValidees: 0, reviewNonPublic: 0, evenements: 0, reactions: 0, sources: 2 }, null).decision, 'NO_ACTION'));
t('REVIEW non publique en plus dans un Hub à jour → REVIEW', () => assert.equal(diagnostiquer(T({ reviewNonPublic: 1 }), instantane(T())).decision, 'REVIEW'));
t('le message dit pourquoi maintenant, la décision attendue, et que rien n’est publié', () => {
  const e = T({ horsHub: ['FR-2026-0113'] }); const m = messageDiagnostic('bordeaux-gironde', e, diagnostiquer(e, instantane(T())));
  assert.match(m, /Pourquoi maintenant/); assert.match(m, /Décision attendue/); assert.match(m, /Rien n’est publié automatiquement/);
});
// --- un volume ne fait pas un Hub : une proposition exige une matière documentaire et un territoire compréhensible ------------------------
const SANS = (o = {}) => ({ hub: null, publiques: ['a', 'b'], horsHub: [], candidatesValidees: 0, reviewNonPublic: 0, evenements: 0, reactions: 0, avecMatiere: 0, sources: 4, ...o });
t('Paris hors 11e : 18 affaires publiques, territoire RÉSIDUEL → aucune proposition (le volume ne démontre rien)', () => {
  const e = SANS({ publiques: Array.from({ length: 18 }, (_, i) => 'p' + i), evenements: 6, reactions: 2, avecMatiere: 5, residuel: true });
  assert.equal(diagnostiquer(e, null).decision, 'NO_ACTION'); assert.equal(diagnostiquer(e, instantane(SANS())).significatif, false);
});
t('territoire dense SANS matière contextuelle (0 événement, 0 réaction) → aucune proposition', () => assert.equal(diagnostiquer(SANS({ publiques: ['a', 'b', 'c', 'd', 'e', 'f'] }), null).decision, 'NO_ACTION'));
t('Hautes-Alpes : deux affaires seulement, mais une matière judiciaire documentée → PROPOSER_NOUVEAU_HUB (sans seuil de volume)', () => {
  const d = diagnostiquer(SANS({ evenements: 3, avecMatiere: 2 }), null);
  assert.equal(d.decision, 'PROPOSER_NOUVEAU_HUB'); assert.match(d.pourquoi[0], /chronologie validée sur 2/);
});
t('l’événement d’UNE seule affaire (matière de fiche) ne fait pas un territoire → aucune proposition', () => assert.equal(diagnostiquer(SANS({ evenements: 1, avecMatiere: 1 }), null).decision, 'NO_ACTION'));
t('Bordeaux : des déclarations institutionnelles suffisent à justifier un angle territorial', () => assert.equal(diagnostiquer(SANS({ reactions: 2 }), null).decision, 'PROPOSER_NOUVEAU_HUB'));
t('une seule affaire, même riche → aucune proposition (pas de territoire)', () => assert.equal(diagnostiquer(SANS({ publiques: ['a'], evenements: 4, reactions: 2 }), null).decision, 'NO_ACTION'));
t('ni les candidates validées ni le volume n’ouvrent un Hub (ancienne règle « atteignent 3 » supprimée)', () => assert.equal(diagnostiquer(SANS({ publiques: ['a', 'b'], candidatesValidees: 3 }), instantane(SANS())).decision, 'NO_ACTION'));
t('INTEGRER_HUB reste possible : une affaire nouvellement publiée appartient à un Hub existant', () => assert.equal(diagnostiquer(T({ horsHub: ['FR-2026-0140'] }), instantane(T())).decision, 'INTEGRER_HUB'));
t('la proposition de nouveau Hub dit l’angle, la matière, l’apport et l’action attendue', () => {
  const e = SANS({ evenements: 3, reactions: 1, avecMatiere: 2 }); const m = messageDiagnostic('hautes-alpes', e, diagnostiquer(e, null));
  assert.match(m, /Pourquoi maintenant/); assert.match(m, /chronologie et les réponses publiques/); assert.match(m, /Décision attendue/);
});
console.log(`\n${n} contrôles diagnostic territorial : OK`);
