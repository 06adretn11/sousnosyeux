// Tests du contrat AUTO_APPLICABLE et du libellé public standard. Aucune base, aucun réseau.
//   node scripts/qa/test-appliquer-contrat.mjs
import assert from 'node:assert/strict';
import { classer } from '../lib/appliquer-contrat.mjs';
import { libellePublic } from '../lib/etat-affaire.mjs';

const holds = new Set(['HOLDED']);
const base = () => ({
  case_id: 'X-1', aa: 'STATE_CHANGE', av: 'plainte', ap: 'enquête', courant: 'plainte',
  ed: null, article_id: 'ART-1', applied_event_id: null,
  facts: [{ event_type: 'enquête', resulting_state: 'enquête', evidence: ['L’enquête est ouverte.'], event_date: null }],
});
const avec = (patch, facts) => { const p = { ...base(), ...patch }; if (facts) p.facts = facts; return p; };
let n = 0;
const test = (nom, fn) => { fn(); n++; console.log('  ✓ ' + nom); };

// --- AUTO -------------------------------------------------------------
test('changement d’état simple (plainte → enquête) : AUTO', () => assert.equal(classer(base(), holds).auto, true));
test('condamnation datée, date du fait = event_date : AUTO', () =>
  assert.equal(classer(avec({ av: 'procès', courant: 'procès', ap: 'condamnation non définitive', ed: '2026-03-03' },
    [{ event_type: 'décision', resulting_state: 'condamnation non définitive', evidence: ['a été condamné'], event_date: '2026-03-03' }]), holds).auto, true));

// --- NON AUTO : tout ce qui doit rester humain --------------------------
test('HOLD → NON', () => assert.equal(classer(avec({ case_id: 'HOLDED' }), holds).auto, false));
test('appel (voie_de_recours) → NON', () =>
  assert.equal(classer(avec({ av: 'relaxe / non-lieu / classement', courant: 'relaxe / non-lieu / classement', ap: 'relaxe / non-lieu / classement' },
    [{ event_type: 'voie_de_recours', resulting_state: 'relaxe / non-lieu / classement', evidence: ['appel'] }]), holds).auto, false));
test('enrichissement sans changement d’état → NON', () =>
  assert.equal(classer(avec({ aa: 'ENRICHMENT', ap: null }), holds).auto, false));
test('multi-événements (2 faits) → NON', () => {
  const f = base().facts[0];
  assert.equal(classer(avec({}, [f, { ...f }]), holds).auto, false);
});
test('aucun fait structuré → NON', () => assert.equal(classer(avec({}, []), holds).auto, false));
test('evidence vide → NON', () =>
  assert.equal(classer(avec({}, [{ event_type: 'enquête', resulting_state: 'enquête', evidence: [] }]), holds).auto, false));
test('resulting_state ≠ statut_propose → NON', () =>
  assert.equal(classer(avec({}, [{ event_type: 'enquête', resulting_state: 'plainte', evidence: ['x'] }]), holds).auto, false));
test('event_type incohérent avec l’état (mobilisation) → NON', () =>
  assert.equal(classer(avec({}, [{ event_type: 'mobilisation', resulting_state: 'enquête', evidence: ['x'] }]), holds).auto, false));
test('fiche déjà passée à un autre état (proposition périmée) → NON', () =>
  assert.equal(classer(avec({ courant: 'mise en examen' }), holds).auto, false));
test('article absent → NON', () => assert.equal(classer(avec({ article_id: null }), holds).auto, false));
test('date du fait ≠ event_date → NON', () =>
  assert.equal(classer(avec({ ed: '2026-01-02' }, [{ event_type: 'enquête', resulting_state: 'enquête', evidence: ['x'], event_date: '2026-01-01' }]), holds).auto, false));
test('déjà appliquée → NON (hors replay)', () => assert.equal(classer(avec({ applied_event_id: 'e1' }), holds).auto, false));

// --- Libellé public : une mention PAR état -------------------------------
const MISE = 'mise en examen';
test('enquête : jamais « mise en examen », mention propre à l’enquête', () => {
  const l = libellePublic('enquête');
  assert.ok(!l.toLowerCase().includes(MISE), l);
  assert.ok(l.includes('L’ouverture d’une enquête ne préjuge pas de la culpabilité.'), l);
});
test('plainte et procès : pas de mention « mise en examen » non plus', () => {
  assert.ok(!libellePublic('plainte').toLowerCase().includes(MISE));
  assert.ok(!libellePublic('procès').toLowerCase().includes(MISE));
});
test('mise en examen : mention conservée', () =>
  assert.ok(libellePublic('mise en examen').includes('La mise en examen ne vaut pas culpabilité.')));
test('libellés standard : ajoutent seulement la formule, aucun détail factuel', () => {
  for (const s of ['plainte', 'enquête', 'mise en examen', 'procès', 'condamnation non définitive', 'condamnation définitive', 'relaxe / non-lieu / classement']) {
    const l = libellePublic(s);
    assert.ok(l.startsWith('Une source publique rapporte'), s);
    assert.ok(!/\d/.test(l), `chiffre dans le libellé « ${s} »`);
  }
});
test('état inconnu → null (rien d’inventé)', () => assert.equal(libellePublic('n’importe quoi'), null));

console.log(`\n  ${n} tests OK`);
