#!/usr/bin/env node
// Non-régression : une erreur technique POSTÉRIEURE à une application métier réussie n'est jamais présentée comme l'échec de la décision.
// Séquence exacte du run sny-telegram du 11/10/2026 (clic ATTACH sur 2e159d7b) — aucun réseau, aucune base.
import { classerEchecClic } from '../lib/alerte-clic.mjs';

let ko = 0;
const test = (nom, cond) => { if (cond) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}`); } };

// Étapes 1-3 réussies, étape 4 (projection d'une AUTRE affaire) en échec, 5-7 sautées.
const RUN_TERRA_AMATA = { enregistrer: 'success', simples: 'success', discovery: 'success', projection: 'failure', qa: 'skipped', publier: 'skipped', verifier: 'skipped' };
const a = classerEchecClic(RUN_TERRA_AMATA);
test('application réussie + projection en échec → décision présentée comme APPLIQUÉE', a.decisionAppliquee === true && /bien été enregistrée et appliquée/.test(a.texte));
test('… jamais « ÉCHOUÉ » ni « n’a PAS été appliquée »', !/ÉCHOUÉ|PAS été appliquée/.test(a.texte));
test('… aucune invitation à recliquer (seulement « ne re-clique pas »)', !/Tu peux re-cliquer|Dis-le-moi, ou re-clique/.test(a.texte) && /ne re-clique pas/.test(a.texte));
test('… seule l’étape secondaire en cause est nommée, avec sa conséquence réelle', /projection des évolutions/.test(a.texte) && /site public n’a pas été modifié/.test(a.texte) && !/QA avant|vérification du site/.test(a.texte));
test('idempotent : même entrée, même message', classerEchecClic(RUN_TERRA_AMATA).texte === a.texte);

// La décision n'a pas été appliquée : l'alerte d'échec est conservée, avec le motif réel.
const b = classerEchecClic({ enregistrer: 'success', simples: 'success', discovery: 'failure' });
test('application en échec → alerte d’échec conservée', b.decisionAppliquee === false && /PAS été appliquée/.test(b.texte));
test('… avec l’étape réelle en cause et l’invitation à recliquer', /application de la décision à Neon/.test(b.texte) && /re-cliquer/.test(b.texte));
test('clic non enregistré → alerte d’échec (étape « enregistrement »)', /enregistrement du clic/.test(classerEchecClic({ enregistrer: 'failure' }).texte));
test('étape métier annulée/sautée → jamais présentée comme appliquée', classerEchecClic({ enregistrer: 'success', simples: 'success', discovery: 'cancelled' }).decisionAppliquee === false);

// Autres étapes secondaires : conséquence propre à chacune.
test('publication échouée → « le site n’a pas été mis à jour »', /le site n’a pas été mis à jour/.test(classerEchecClic({ enregistrer: 'success', simples: 'success', discovery: 'success', projection: 'success', qa: 'success', publier: 'failure' }).texte));
test('vérification échouée → publication faite, à contrôler', /publication a eu lieu/.test(classerEchecClic({ enregistrer: 'success', simples: 'success', discovery: 'success', projection: 'success', qa: 'success', publier: 'success', verifier: 'failure' }).texte));

console.log(ko ? `\n  ❌ ${ko} échec(s)\n` : '\n  ✅ tous les tests passent\n');
process.exit(ko ? 1 : 0);
