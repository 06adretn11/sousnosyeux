// Garde-fous de la correction de données appliquée à Neon par la CI (sny-correction-donnees). Sans base ni réseau.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validerNom, confirmationValide, jugerInstruction, preparer } from '../lib/correction-donnees.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const lire = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

t('nom : seul un fichier NNN_xxx.sql sans chemin est admis', () => {
  assert.deepEqual(validerNom('029_fr_2026_0048_correction_et_go.sql'), { ok: true, numero: '029' });
  for (const mauvais of ['../029_x.sql', 'supabase/migrations/029_xxx.sql', '29_xxx.sql', '029_XXX.sql', '029_xxx.sql; drop', '029_xxx.sql\n', '', null, undefined]) assert.equal(validerNom(mauvais).ok, false, String(mauvais));
});
t('confirmation : exactement GO-NNN du fichier', () => {
  assert.ok(confirmationValide('GO-029', '029'));
  for (const c of ['go-029', 'GO-028', 'GO-029 ', '029', '', null, undefined]) assert.ok(!confirmationValide(c, '029'), String(c));
});
t('instructions admises : insert et update gardés sur cases, sources, reviews', () => {
  assert.equal(jugerInstruction("insert into sources (case_id, url) select 'X', 'u' where not exists (select 1)").ok, true);
  assert.equal(jugerInstruction("update cases set role_mis_en_cause = 'animateur périscolaire'::role_mis_en_cause where case_id = 'FR-2026-0048'").ok, true);
  assert.equal(jugerInstruction("  UPDATE   sources\n set is_primary = false where case_id = 'X'").ok, true);
});
t('refus : delete, drop, truncate, alter, create, grant, copy, with, select', () => {
  for (const ins of ["delete from sources where case_id = 'X'", 'drop table cases', 'truncate reviews', 'alter table cases add column x int', 'create table x (a int)', 'grant all on cases to public', "copy cases to '/tmp/x'", 'with a as (delete from cases returning 1) select 1', 'select * from cases'])
    assert.equal(jugerInstruction(ins).ok, false, ins);
});
t('refus : update sans WHERE, table hors liste, publication_status assigné', () => {
  assert.equal(jugerInstruction("update cases set type_affaire = 'viol'::type_affaire").ok, false);
  assert.equal(jugerInstruction("update hubs set x = 1 where id = 1").ok, false);
  assert.equal(jugerInstruction("insert into pistes_a_qualifier (a) values (1)").ok, false);
  assert.equal(jugerInstruction("update cases set publication_status = 'publiée' where case_id = 'FR-2026-0048'").ok, false);
  // la colonne dans la clause WHERE n'est pas une assignation
  assert.equal(jugerInstruction("update cases set type_affaire = 'viol'::type_affaire where case_id = 'X' and publication_status = 'publiée'::publication_status").ok, true);
});
t('un fichier qui mêle une instruction refusée est refusé en entier (tout ou rien)', () => {
  const p = preparer("update cases set type_affaire = 'viol'::type_affaire where case_id = 'X';\ndelete from sources where case_id = 'X';");
  assert.equal(p.ok, false); assert.ok(p.refus.some((r) => /instruction 2/.test(r)));
  assert.equal(preparer('').ok, false);
  assert.equal(preparer(Array.from({ length: 31 }, () => "update cases set type_affaire = 'viol'::type_affaire where case_id = 'X';").join('\n')).ok, false);
});
t('la migration 029 est acceptée : 7 instructions attendues (4 insertions, 3 mises à jour), aucune instruction refusée, découpage sain', () => {
  const p = preparer(lire('supabase/migrations/029_fr_2026_0048_correction_et_go.sql'));
  assert.deepEqual(p.refus, []);
  assert.equal(p.ok, true);
  assert.equal(p.instructions.length, 7);
  assert.deepEqual(p.resume, { insert: 4, update: 3 });
  // aucune instruction n'a avalé la suivante : chacune commence par insert ou update (un « ; » dans un texte entre guillemets est légitime)
  for (const ins of p.instructions) assert.ok(/^(insert into|update) /i.test(ins));
  assert.ok(p.instructions.some((i) => /GO d''Adrien/.test(i)));
});
t('029 : aucun nombre d’enfants ni nom de personne dans le fichier ; le rôle corrigé est celui du modèle', () => {
  const s = lire('supabase/migrations/029_fr_2026_0048_correction_et_go.sql');
  assert.ok(!/\bManuel\b/.test(s), 'nom de la personne mise en cause');
  assert.ok(!/\b\d+\s+(enfants|victimes)\b/i.test(s), 'nombre exact d’enfants');
  assert.ok(/'animateur périscolaire'::role_mis_en_cause/.test(s));
});
t('workflow : manuel seulement, saisies par variables d’environnement, aucun secret affiché', () => {
  const y = lire('.github/workflows/sny-correction-donnees.yml');
  assert.ok(/^on:\n  workflow_dispatch:/m.test(y) && !/schedule:|push:|pull_request/.test(y), 'déclenchement manuel uniquement');
  assert.ok(!/\$\{\{\s*inputs\./.test(y.split('steps:')[1]), 'aucune saisie interpolée dans une commande');
  assert.ok(/NEON_DATABASE_URL: \$\{\{ secrets\.NEON_DATABASE_URL \}\}/.test(y));
  assert.ok(/concurrency:\n  group: sny-telegram/.test(y));
});
console.log(`\n  ${n} contrôles : OK`);
