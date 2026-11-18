// JSON inséré dans le HTML (set:html) — une donnée ne peut jamais fermer la balise <script>, et JSON.parse la restitue à l'identique.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { jsonPourScript } from '../lib/json-script.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

const synthetique = {
  a: 'x</script><img src=x onerror=alert(1)>',
  b: '<!-- commentaire --> <SCRIPT>',
  c: 'Été à l’école — « l’établissement » œuf ç ñ 日本 😀 & " \' \\ \n tab\t',
  d: [1, null, true, { '</script>': '<' }],
};

t('une fermeture de balise script reste une donnée (aucun « < » dans la sortie)', () => {
  const s = jsonPourScript(synthetique);
  assert.ok(!s.includes('<'), 'aucun < brut');
  assert.ok(!/<\/script/i.test(s));
});
t('JSON.parse restitue exactement la donnée (accents, guillemets, retours, clés, imbrication)', () => {
  assert.deepEqual(JSON.parse(jsonPourScript(synthetique)), synthetique);
});
t('une donnée sans « < » est inchangée par rapport à JSON.stringify', () => {
  const v = { ville: 'Montpellier', n: 3, ok: true };
  assert.equal(jsonPourScript(v), JSON.stringify(v));
});
t('aucun set:html={JSON.stringify(...)} brut ne subsiste dans web/src', () => {
  const fichiers = [];
  const marche = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? marche(p) : /\.astro$/.test(p) && fichiers.push(p); } };
  marche(new URL('../../web/src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const fautifs = fichiers.filter((f) => /set:html=\{\s*JSON\.stringify/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(fautifs, []);
});
console.log(`\n${n} contrôles JSON dans le HTML : OK`);
