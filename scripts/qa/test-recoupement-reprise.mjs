#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-recoupement-reprise.mjs — règle A (reprise d'un fait judiciaire), bloc qualité du message Discovery, confirmation signée du recoupement.
// Cas réel (20/11/2026, Beauvais) : trois éditeurs dont Le Figaro reprennent une mise en examen ; qualité 6/10 (recoupement + établissement non nommé).
// Textes : paraphrases synthétiques. Aucun réseau, aucune base, aucun modèle.
// =====================================================================
import { readFileSync } from 'node:fs';
import { recoupementParReprise, MIN_EDITEURS_REPRISE } from '../lib/recoupement-reprise.mjs';
import { messageDecision, blocQualite } from '../lib/discovery-messages.mjs';
import { preuvesDe } from '../lib/preuves.mjs';

let ko = 0;
const test = (nom, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}`); if (!cond) ko++; };
const lire = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

const pages = [{ corps: 'Le parquet a indiqué que l’animateur a été mis en examen jeudi et placé en détention provisoire.' }, { corps: 'texte' }, { corps: 'texte' }];
const trois = ['lefigaro.fr', 'sudouest.fr', 'bienpublic.com'];

console.log('\nRègle A — recoupement par reprise');
test('3 éditeurs dont une référence, mise en examen, parquet cité → reconnu', recoupementParReprise({ domaines: trois, pages, statut: 'mise en examen' }).ok);
test('« www. » et casse ne changent rien', recoupementParReprise({ domaines: ['www.LeFigaro.fr', 'sudouest.fr', 'bienpublic.com'], pages, statut: 'mise en examen' }).ok);
test('2 éditeurs seulement → refusé', !recoupementParReprise({ domaines: trois.slice(0, 2), pages, statut: 'mise en examen' }).ok && MIN_EDITEURS_REPRISE === 3);
test('3 éditeurs sans titre de référence → refusé', !recoupementParReprise({ domaines: ['blog-a.fr', 'blog-b.fr', 'blog-c.fr'], pages, statut: 'mise en examen' }).ok);
test('plainte seule → refusé (ce n’est pas une procédure établie)', !recoupementParReprise({ domaines: trois, pages, statut: 'plainte' }).ok);
test('stade à qualifier → refusé', !recoupementParReprise({ domaines: trois, pages, statut: 'à qualifier' }).ok);
test('aucune autorité citée (fait seulement allégué) → refusé', !recoupementParReprise({ domaines: trois, pages: [{ corps: 'Des parents racontent ce qu’ils ont vu.' }], statut: 'mise en examen' }).ok);
test('domaine imitant une référence (lefigaro.fr.example.com) → pas une référence', !recoupementParReprise({ domaines: ['lefigaro.fr.example.com', 'a.fr', 'b.fr'], pages, statut: 'mise en examen' }).ok);
test('sous-domaine d’une référence (france3-regions.franceinfo.fr) → reconnu comme référence', recoupementParReprise({ domaines: ['france3-regions.franceinfo.fr', 'a.fr', 'b.fr'], pages, statut: 'mise en examen' }).ok);
test('le motif affiché ne parle ni de seuil ni de score', !/seuil|score/.test(recoupementParReprise({ domaines: trois, pages, statut: 'mise en examen' }).motif));

console.log('\nCâblage dans le qualificateur');
const q = lire('scripts/lib/qualifier-signal.mjs');
test('le critère recoupement tient compte de la règle A (indepRetenu), pas seulement du compte d’origines', /crit_recoupement: indepRetenu >= 2/.test(q));
test('le compte d’origines reste VRAI et affiché (independantes: indep)', /independantes: indep, medias: domaines\.size/.test(q));
test('la règle n’est évaluée que si le compte d’origines est insuffisant', /const reprise = indep < 2 \? recoupementParReprise/.test(q));

console.log('\nMessage Discovery — bloc qualité');
const fiche6 = { crit_source_fiable: true, crit_article_recent: true, crit_statut_clair: true, crit_recoupement: false, crit_etablissement_nomme: false };
const base = { commune: 'Ville', etablissement_nomme: false, structure: 'périscolaire', resume: 'Selon la presse, un animateur a été mis en examen.', stade_minimal: 'mise en examen', fiche: fiche6, independantes: 1, medias: 3, articles: [{ media: 'Le Figaro', url: 'https://lefigaro.fr/a' }] };
const b = blocQualite(base).join('\n');
test('score 6/10 et seuil affichés', /Qualité 6\/10 \(publiable dès 8\)/.test(b));
test('le doute de FOND (recoupement) est séparé du doute d’IDENTIFICATION (établissement)', /Doute de FOND : recoupement/.test(b) && /Doute d’IDENTIFICATION : établissement non nommé/.test(b));
test('l’établissement non nommé n’est PAS présenté comme un doute de fond', !/FOND[^\n]*établissement/.test(b));
test('une proposition entièrement conforme le dit', /Aucun doute sur les cinq critères/.test(blocQualite({ ...base, fiche: { ...fiche6, crit_recoupement: true, crit_etablissement_nomme: true } }).join('\n')));
test('un ancien payload sans critères n’ajoute rien (aucune régression)', blocQualite({ commune: 'X' }).length === 0);
const m = messageDecision({ ...base, avertissement: 'les médias reprennent la même dépêche (une seule source indépendante)' }, 'REVIEW');
test('le message complet porte le bloc qualité', /📊 Qualité 6\/10/.test(m));
test('le bouton « en attente de preuves » dit à quoi sert REVIEW (ajuster la règle) et le délai de 7 jours', /réexamen dans 7 jours/.test(m) && /ajuster la règle/.test(m));
const mR = messageDecision({ ...base, fiche: { ...fiche6, crit_recoupement: true }, recoupement_reprise: '3 éditeurs dont un titre de référence reprennent un fait judiciaire attribué à une autorité' }, 'NEW_CASE_CANDIDATE');
test('quand la règle A joue, le message le DIT (ce ne sont pas deux origines indépendantes)', /Recoupement RECONNU par la règle de reprise \(ce ne sont pas deux origines indépendantes\)/.test(mR));
const p8 = preuvesDe({ fiche: { ...fiche6, crit_recoupement: true } });
test('avec la règle A, la fiabilité remonte à 8/10 : seul l’établissement manque, comme les 8 affaires déjà publiées sans nom', p8.fiabilite === 8 && p8.suffisantes);
test('sans la règle A, 6/10 reste NON suffisant (le seuil n’a pas bougé)', !preuvesDe({ fiche: fiche6 }).suffisantes);

console.log('\nRéexamen');
const ap = lire('scripts/appliquer-nouvelles-affaires.mjs');
test('réexamen d’une candidate « en attente de preuves » à 7 jours (et plus 30)', /DELAI_REEXAMEN_JOURS = 7/.test(ap) && !/30 \* 864e5/.test(ap));

console.log('\nConfirmation signée du recoupement (scripts/confirmer-recoupement.mjs)');
const c = lire('scripts/confirmer-recoupement.mjs');
test('--ecrire exige --go', /ECRIRE && \(!GO/.test(c));
test('refuse hors candidate, critère non faux, < 3 éditeurs, retirer, HOLD', /attendu : candidate/.test(c) && /rien à confirmer/.test(c) && /au moins 3 requis/.test(c) && /revue « retirer »/.test(c) && /sous HOLD/.test(c));
test('ne rattrape pas une affaire qui échoue sur plusieurs critères (seuil vérifié APRÈS correction)', /apres < SEUIL_PUBLICATION/.test(c));
test('n’écrit que crit_recoupement + une revue VALIDATED signée, en une instruction rejouable', (c.match(/update cases set/g) || []).length === 1 && /crit_recoupement = true/.test(c) && /crit_recoupement is not true/.test(c) && /VALIDATED — critère/.test(c));
test('ne publie pas : aucun passage à « publiée »', !/set publication_status/.test(c) && !/publication_status = 'publiée'/.test(c));
const wf = lire('.github/workflows/sny-confirmer-recoupement.yml');
test('workflow : déclenchement manuel seul, plan par défaut, permissions en lecture', /workflow_dispatch/.test(wf) && !/schedule:/.test(wf) && /default: false/.test(wf) && /contents: read/.test(wf));
const steps = wf.split('steps:')[1];
test('workflow : les saisies ne sont jamais interpolées dans une commande (variables d’environnement seulement)', !/\$\{\{\s*inputs\./.test(steps));

console.log(ko ? `\n${ko} échec(s)` : '\ntout est vert');
process.exit(ko ? 1 : 0);
