// Fiabilité de la chaîne (27/11/2026) : reprise automatique, cœur de rythme, alertes non répétées, demandes inapplicables retirées sans perdre l'information.
//   node scripts/qa/test-fiabilite-27-11.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../../workers/telegram-webhook/worker.mjs';
import { defautsStructurels } from '../lib/appliquer-contrat.mjs';

const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
let n = 0; const t = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };

await t('cœur de rythme : le Worker relance sny-clics (main, reprise 0) à chaque déclenchement planifié, une erreur réseau ne lève pas', async () => {
  const appels = [];
  const ok = await worker.scheduled({}, { GITHUB_REPO: 'o/r', GITHUB_TOKEN: 'x' }, { waitUntil: () => {} }, async (url, o) => { appels.push({ url, o }); return { status: 204 }; });
  assert.equal(ok, true); assert.equal(appels.length, 1);
  assert.match(appels[0].url, /repos\/o\/r\/actions\/workflows\/sny-clics\.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(appels[0].o.body), { ref: 'main', inputs: { reprise: '0' } });
  assert.equal(await worker.scheduled({}, { GITHUB_REPO: 'o/r', GITHUB_TOKEN: 'x' }, null, async () => { throw new Error('réseau'); }), false);
  assert.match(src('workers/telegram-webhook/wrangler.jsonc'), /"crons": \["\*\/30 \* \* \* \*"\]/);
});
await t('reprise automatique : une publication abandonnée relance sny-clics, bornée à 3 (compteur transmis), permission actions: write', async () => {
  for (const w of ['sny-clics', 'sny-telegram']) {
    const y = src(`.github/workflows/${w}.yml`);
    assert.match(y, /steps\.publier\.outputs\.abandon == 'true' && fromJSON\(github\.event\.inputs\.reprise \|\| '0'\) < 3/, w);
    assert.match(y, /gh workflow run sny-clics\.yml --ref main -f reprise=\$\(\(REPRISE \+ 1\)\)/, w);
    assert.match(y, /actions: write/, w);
  }
  assert.match(src('.github/workflows/sny-clics.yml'), /inputs:\s+reprise:/);
});
await t('alerte : un même échec (mêmes étapes, mêmes contrôles, mêmes écarts) n’est dit qu’une fois par fenêtre de 6 h', async () => {
  const a = src('scripts/alerte-clic.mjs');
  assert.match(a, /interval '6 hours'/); assert.match(a, /alerte:' \+ signature/); assert.match(a, /aucun nouveau message/);
  assert.match(a, /else if \(await prevenir\(texte\)/, 'journalisé seulement si le message est parti (jamais de silence par défaut)');
});
await t('demande d’état inapplicable (audience annoncée, voie de recours, suspension) : retirée de la demande avec ses boutons, demandes sœurs rouvertes, trace conservée', async () => {
  const s = src('scripts/appliquer-decisions.mjs');
  assert.match(s, /DEMANDES INAPPLICABLES/); assert.match(s, /NON_PORTE_PAR_LE_CONTRAT/); assert.match(s, /retirerBoutons\(o\.mid\)/);
  assert.match(s, /même fait déjà soumis%/, 'les sœurs écartées par cette demande redeviennent examinables');
  assert.match(src('scripts/lib/prevenir.mjs'), /export async function retirerBoutons/);
  assert.match(src('scripts/telegram-v0.mjs'), /q\.decision is null and q\.payload->'ecartee' is null/, 'une demande retirée ne compte plus comme « déjà soumise »');
  // les cas réels du 27/11 sont bien reconnus comme inapplicables
  const fait = (et, rs) => ({ resulting_state: rs, event_type: et, evidence: ['x'] });
  assert.ok(defautsStructurels({ aa: 'STATE_CHANGE', ap: 'procès', av: 'enquête', facts: [fait('audience', 'procès')], ed: null, case_id: 'X' }).length > 0, 'audience annoncée (FR-0144)');
  assert.ok(defautsStructurels({ aa: 'STATE_CHANGE', ap: 'relaxe / non-lieu / classement', av: 'relaxe / non-lieu / classement', facts: [fait('voie_de_recours', 'relaxe / non-lieu / classement')], ed: null, case_id: 'X' }).length > 0, 'voie de recours (POC-05)');
});
await t('acte déjà consigné (même type, ±3 jours) : source rattachée à l’événement existant, jamais « décision NON appliquée »', async () => {
  const s = src('scripts/appliquer-decisions.mjs');
  assert.match(s, /acte déjà consigné/); assert.match(s, /Math\.abs\(Date\.parse\(e\.event_date\) - ref\) <= 3 \* 86400000/);
  assert.match(s, /resultat: 'conservee'/);
});
console.log(`\n${n} contrôles fiabilité 27/11 : OK`);
