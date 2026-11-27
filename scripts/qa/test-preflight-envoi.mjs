// Contrôles AVANT ENVOI sur Telegram (27/11/2026) : ce qui ne peut pas aboutir n'est jamais soumis à décision.
//   node scripts/qa/test-preflight-envoi.mjs
// Incidents : PARIS-006 (« suspension » pour l'état « enquête »), POC-05 (« voie de recours » après relaxe), FR-0047 (parole sans date → QA de chronologie bloquait TOUTE la publication),
// 3 demandes de création de fiche pour des pages déjà approuvées, 2 mises à jour construites sur la même version (valider l'une périme l'autre).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defautsStructurels } from '../lib/appliquer-contrat.mjs';

const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

const fait = (over) => ({ resulting_state: 'enquête', event_type: 'enquête', evidence: ['Une enquête est ouverte.'], ...over });
const prop = (ap, f, over = {}) => ({ aa: 'STATE_CHANGE', ap, av: 'plainte', facts: [f], ed: null, case_id: 'X', ...over });

t('une proposition d’état applicable ne porte aucun défaut structurel', () => {
  assert.deepEqual(defautsStructurels(prop('enquête', fait())), []);
  assert.deepEqual(defautsStructurels(prop('mise en examen', fait({ resulting_state: 'mise en examen', event_type: 'mise_en_examen' }))), []);
});
t('PARIS-006 : « suspension » n’est pas admis pour « enquête » → jamais soumise', () => {
  const d = defautsStructurels(prop('enquête', fait({ event_type: 'suspension' })));
  assert.ok(d.some((x) => /event_type « suspension » non admis pour « enquête »/.test(x)), d.join(' | '));
});
t('POC-05 : « voie de recours » n’est pas admis pour « relaxe / non-lieu / classement » → jamais soumise', () => {
  const d = defautsStructurels(prop('relaxe / non-lieu / classement', fait({ resulting_state: 'relaxe / non-lieu / classement', event_type: 'voie_de_recours' }), { av: 'relaxe / non-lieu / classement' }));
  assert.ok(d.some((x) => /voie_de_recours/.test(x)), d.join(' | '));
});
t('plusieurs faits, evidence vide ou état résultant différent : défauts structurels', () => {
  assert.ok(defautsStructurels({ ...prop('enquête', fait()), facts: [fait(), fait()] }).some((x) => /au lieu d’un seul/.test(x)));
  assert.ok(defautsStructurels(prop('enquête', fait({ evidence: [] }))).some((x) => /evidence vide/.test(x)));
  assert.ok(defautsStructurels(prop('enquête', fait({ resulting_state: 'plainte' }))).some((x) => /resulting_state/.test(x)));
});

t('câblage : décision d’état, création périmée, mises à jour concurrentes, parole sans date — et refus définitif non réévalué', () => {
  const s = src('scripts/telegram-v0.mjs');
  assert.match(s, /defautsStructurels\(\{ aa: 'STATE_CHANGE'/); assert.match(s, /non applicable automatiquement/);
  assert.match(s, /proposition de création périmée \(la fiche individuelle existe déjà\)/);
  assert.match(s, /mise à jour concurrente déjà soumise/);
  assert.match(s, /périmée\|concurrente/, 'refus définitif : marqueur, pas de réévaluation à chaque passage');
  assert.match(s, /r\.aa === 'ENRICHMENT' \|\| r\.aa === 'STATE_CHANGE'/, 'trace du motif aussi pour un changement d’état écarté');
});
console.log(`\n${n} contrôles avant envoi : OK`);
