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

const r = classerEchecClic({ enregistrer: 'success', simples: 'success', discovery: 'success', projection: 'success', reconcile: 'failure' });
test('… réconciliation : décision appliquée, réessai automatique annoncé', r.decisionAppliquee === true && /réconciliation de la publication/.test(r.texte) && /prochain passage/.test(r.texte) && !/ÉCHOUÉ/.test(r.texte));
// 16/11/2026 (FR-2026-0148 / FR-2026-0144) : QA en échec puis site servi non conforme. L'alerte nomme l'objet, le contrôle, l'état de la décision, la portée de « rien publié », la reprise.
const CTX = { objets: [{ id: 'FR-2026-0144', nature: 'approbation de la page', cle: 'fe3f3ae8', decision: 'ACCEPT' }], controles: ['S07 : X BLOQUE · Facebook BLOQUE — CONFORME / BLOQUE'], ecartsSite: ['fiche FR-2026-0144  FICHE_PENDING_DEPLOYMENT  fiche FR-2026-0144 : HTTP 404'], enregistreA: 'enregistrée à 11:16' };
const RUN_1611 = { enregistrer: 'success', simples: 'success', discovery: 'success', projection: 'success', reconcile: 'success', qa: 'failure', publier: 'skipped', verifier: 'skipped', controle: 'failure' };
const q = classerEchecClic(RUN_1611, CTX);
test('alerte du 16/11 : la fiche et la proposition sont nommées', /FR-2026-0144/.test(q.texte) && /fe3f3ae8/.test(q.texte) && /approbation de la page/.test(q.texte));
test('… l’étape en échec ET le contrôle en cause sont nommés', /QA avant publication/.test(q.texte) && /S07/.test(q.texte) && /HTTP 404/.test(q.texte));
test('… blocage présenté comme tel (pas « étape secondaire » seule)', /Publication BLOQUÉE/.test(q.texte));
test('… décision déjà enregistrée : état dit, jamais « à refaire »', /enregistrée et appliquée \(enregistrée à 11:16\)/.test(q.texte) && /ne re-clique pas/.test(q.texte));
test('… « rien publié » est borné à CE passage, les pages en ligne restent', /ce passage n’a rien publié/.test(q.texte) && /pages déjà en ligne restent telles quelles/.test(q.texte));
test('… reprise annoncée parce qu’elle existe (sny-clics), avec sa limite', /Reprise : le prochain passage planifié de sny-clics/.test(q.texte) && /échouera de nouveau tant que la cause n’est pas corrigée/.test(q.texte));
const v = classerEchecClic({ enregistrer: 'success', simples: 'success', discovery: 'success', publier: 'success', controle: 'failure' }, CTX);
test('contrôle du site servi seul en échec → « NON VÉRIFIÉE », jamais « Publié et vérifié » annoncé', /Publication NON VÉRIFIÉE/.test(v.texte) && !/Publication BLOQUÉE/.test(v.texte) && /aucun « Publié et vérifié » n’est annoncé/.test(v.texte));
test('contexte HTML sûr : un contrôle contenant < ou & est échappé', /a &lt; b &amp; c/.test(classerEchecClic(RUN_1611, { ...CTX, controles: ['a < b & c'] }).texte));
test('sans contexte : message toujours valide (aucun « undefined »)', !/undefined/.test(classerEchecClic(RUN_1611).texte));
console.log(ko ? `\n  ❌ ${ko} échec(s)\n` : '\n  ✅ tous les tests passent\n');
process.exit(ko ? 1 : 0);
