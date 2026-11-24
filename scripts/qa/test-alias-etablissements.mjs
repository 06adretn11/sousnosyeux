// =====================================================================
// scripts/qa/test-alias-etablissements.mjs — alias propre d'établissement (FR-2026-0115 : « centre de loisirs de Tarnos »), signal « rattachement à confirmer »,
// contre-exemples de faux rattachements, classement thématique des publications d'un compte.
// ⚠ Les légendes ci-dessous sont des PARAPHRASES FICTIVES de ce qu'écrit un collectif : aucun texte réel de tiers. Aucun réseau, aucune base.
// Usage : node scripts/qa/test-alias-etablissements.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerAlias, enrichirFiches, verifierAlias, expressionPresente } from '../lib/alias-etablissements.mjs';
import { resoudre } from '../lib/resolver.mjs';
import { classer, passages, apercuInformation, aSolliciter } from '../lib/sources-suivies.mjs';
import { postVersDocument } from '../lib/veille-instagram.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };

const brut = JSON.parse(readFileSync(join(ROOT, 'data', 'cases.json'), 'utf8'));
const reelles = Array.isArray(brut) ? brut : (brut.cases || brut.affaires);
const alias = chargerAlias(join(ROOT, 'data', 'alias-etablissements.json'));
const fiches = enrichirFiches(reelles, alias);
const tarnos = fiches.find((f) => f.case_id === 'FR-2026-0115');
const nue = reelles.find((f) => f.case_id === 'FR-2026-0115'); // sans alias : ce que voient Discovery et la Maintenance

console.log('A. Registre d\'alias : une structure, une affaire');
verifie('l\'alias de FR-2026-0115 est « centre de loisirs de Tarnos » ; la fiche enrichie le porte, la fiche brute non', alias.get('FR-2026-0115')?.join() === 'centre de loisirs de Tarnos' && tarnos.etablissement_alias?.length === 1 && nue.etablissement_alias === undefined);
const pb = verifierAlias(alias, reelles);
verifie(`aucune des ${reelles.length} fiches (autres que FR-2026-0115) ne se rapproche de l'alias (établissement + commune)`, pb.length === 0, pb.join(' | '));
verifie('contre-exemples : alias d\'une autre commune, trop court, ou fiche absente ⇒ problèmes détectés', verifierAlias(new Map([['FR-2026-0115', ['centre de loisirs de Cenon']]]), reelles).length > 0 && verifierAlias(new Map([['FR-2026-0115', ['Tarnos']]]), reelles).length > 0 && verifierAlias(new Map([['FR-9999-0001', ['centre de loisirs de Tarnos']]]), reelles).length > 0);
const cenon = reelles.find((f) => f.case_id === 'FR-2026-0114');
verifie('contre-exemple : l\'alias de la fiche de Cenon (« centre de loisirs de Cenon ») serait refusé pour Tarnos et ne désignerait pas Tarnos', cenon && !expressionPresente('le centre de loisirs de Cenon', 'centre de loisirs de Tarnos') && expressionPresente('Le Centre de loisirs de Tarnos, ouvert', 'centre de loisirs de Tarnos'));
const doublon = [...reelles, { ...nue, case_id: 'FR-TEST-DOUBLON', etablissement: 'Centre de loisirs de Tarnos (annexe)' }];
verifie('contre-exemple : une SECONDE fiche à Tarnos au nom voisin rend l\'alias ambigu ⇒ détecté par la vérification', verifierAlias(alias, doublon).some((p) => /FR-TEST-DOUBLON/.test(p)), verifierAlias(alias, doublon).join('|'));

console.log('B. Résolveur : l\'alias nomme l\'établissement, jamais plus');
const txt = {
  role: 'Un animateur périscolaire du centre de loisirs de Tarnos a été mis en examen ; les familles de Tarnos demandent des réponses.',
  sansRole: 'Après les faits survenus au centre de loisirs de Tarnos, les familles demandent des réponses et un signalement de chaque difficulté.',
  epars: 'Le centre de loisirs a fermé. Une réunion publique a eu lieu à Tarnos pour les parents.',
  cenon: 'Après les faits survenus au centre de loisirs de Cenon, les familles demandent des réponses.',
  pissot: 'La maison de quartier du Pissot, à Tarnos, accueille les enfants le soir : programme et inscriptions.',
};
const statut = (texte, liste = fiches) => resoudre({ candidate: { title: '' }, index: liste, corps: texte });
verifie('alias + commune + rôle ⇒ rattachement PLEIN (MATCH) à FR-2026-0115', (() => { const r = statut(txt.role); return r.resolution_status === 'MATCH' && r.matched_case_id === 'FR-2026-0115'; })());
verifie('alias + commune, SANS rôle ⇒ DOUTEUX (POSSIBLE_MATCH, revue humaine), signal « alias d\'établissement » conservé', (() => { const r = statut(txt.sansRole); return r.resolution_status === 'POSSIBLE_MATCH' && r.requires_human_review === true && r.evidence.some((e) => /alias d'établissement/.test(e)); })());
verifie('contre-exemple : « centre de loisirs » et « Tarnos » dans des phrases séparées (pas l\'expression) ⇒ aucun rattachement', statut(txt.epars).resolution_status === 'NO_MATCH');
verifie('contre-exemple : centre de loisirs d\'une AUTRE commune (Cenon) ⇒ pas rattaché à Tarnos', !statut(txt.cenon).evidence.some((e) => /FR-2026-0115/.test(e)) && statut(txt.cenon).matched_case_id !== 'FR-2026-0115');
verifie('contre-exemple : maison de quartier du Pissot (autre structure de Tarnos) ⇒ aucun rattachement', statut(txt.pissot).resolution_status === 'NO_MATCH');
verifie('SANS le champ d\'alias (Discovery, Maintenance : fiches brutes), la même légende ne se rattache pas : l\'alias n\'agit que dans la veille « sources suivies »', statut(txt.sansRole, reelles.map((f) => ({ ...f }))).resolution_status === 'NO_MATCH');

console.log('C. Publications d\'un compte : signal « à confirmer », jamais une affaire forcée');
const page = { url: 'https://www.instagram.com/compte_fictif/', type: 'instagram', compte: 'compte_fictif', emetteur: 'Compte fictif (Instagram)' };
const orga = { id: 'org-fictif', nom: 'Collectif fictif', alias: ['Collectif fictif'], suivi: { domaines: ['instagram.com'] }, portee: 'inconnue' };
const doc = (legende, id = 'x1') => postVersDocument({ id_post: id, url: `https://www.instagram.com/p/${id}/`, publie_le: '2026-11-16T10:00:00+0000', legende });
const classe = (legende, liste = fiches, extraction = true) => { const d = doc(legende); if (!extraction) d.extraction = 'html'; return classer({ doc: d, page: { ...page, type: 'document' }, organisme: orga, fiches: liste }); };
const appel = '📣 APPEL À TÉMOINS — Votre enfant a fréquenté le centre de loisirs de Tarnos ? Vous avez vu des signes qui vous ont interrogés ? Notre collectif est là pour vous écouter, vous pouvez effectuer un signalement.';
let c = classe(appel);
verifie('légende qui nomme « centre de loisirs de Tarnos » avec le thème (signalement, appel à témoins) ⇒ AFFAIRE_A_CONFIRMER : AUCUN case_id, le candidat est « suspendu »', c.destination === 'AFFAIRE_A_CONFIRMER' && c.case_ids.length === 0 && c.suspendus.join() === 'FR-2026-0115', JSON.stringify(c));
c = classe('Programme des vacances au centre de loisirs de Tarnos : inscriptions ouvertes, ateliers cuisine et sorties à la plage.');
verifie('contre-exemple : même nom d\'établissement, mais programme sans thème ⇒ PAS de signal (rattachement suspendu consigné, aucune notification)', c.destination === 'RATTACHEMENT_SUSPENDU', c.destination);
c = classe('Un animateur périscolaire du centre de loisirs de Tarnos a été mis en examen : nous restons mobilisés, violences sur mineurs.');
verifie('alias + rôle ⇒ AFFAIRE (rattachement plein, par le texte)', c.destination === 'AFFAIRE' && c.case_ids.join() === 'FR-2026-0115', JSON.stringify(c));
c = classe(appel, [...fiches, { ...tarnos, case_id: 'FR-TEST-0200', etablissement: 'Centre de loisirs municipal de Tarnos (second dossier)' }]);
verifie('contre-exemple : deux affaires portent l\'alias ⇒ AUCUN signal « à confirmer » (rattachement suspendu, arbitrage humain)', c.destination === 'RATTACHEMENT_SUSPENDU' && c.suspendus.length === 2, JSON.stringify(c));
c = classe(appel, fiches, false);
verifie('le signal « à confirmer » est réservé aux publications d\'un COMPTE : un document HTML ordinaire reste « rattachement suspendu »', c.destination === 'RATTACHEMENT_SUSPENDU', c.destination);
c = classe('Après les faits survenus au centre de loisirs de Cenon, un signalement a été fait par les familles du collectif.');
verifie('contre-exemple : autre commune (Cenon), même thème ⇒ jamais rattaché à Tarnos', c.case_ids.join() !== 'FR-2026-0115' && !c.suspendus.includes('FR-2026-0115'), JSON.stringify(c));
c = classe('Le centre de loisirs a fermé et la réunion s\'est tenue à Tarnos : signalement et plainte des familles.');
verifie('contre-exemple : nom de la structure absent (mots épars « centre de loisirs » … « Tarnos ») ⇒ aucun rattachement ni signal', c.destination !== 'AFFAIRE' && c.destination !== 'AFFAIRE_A_CONFIRMER' && c.suspendus.length === 0, JSON.stringify(c));
verifie('les passages probants nomment la structure par son alias (légende en un bloc, sansTitre)', passages(doc(appel).corps, tarnos, { alias: [], sansTitre: true }).some((p) => p.nomme_etablissement && /centre de loisirs de Tarnos/i.test(p.texte)));

console.log('D. « Hors périmètre » erronés : classés par le thème, sans affaire');
const paraphrases = {
  'appel à témoins (sans nom de structure)': '📣 APPEL À TÉMOINS\n\nSi vous avez des informations, vous pouvez nous contacter ; vos échanges seront accueillis avec respect.',
  'refus de plainte': '📣 LE REFUS DE PLAINTE : UN PARCOURS PARFOIS DIFFICILE\n\nPlusieurs familles disent avoir eu du mal à déposer plainte.',
  'après le signalement': '❤️ APRÈS LE SIGNALEMENT, LES FAMILLES ONT BESOIN D\'ÊTRE ACCOMPAGNÉES.\n\nLes démarches ne font souvent que commencer.',
};
// Sans terme du thème (violences, protection de l'enfance, plainte, signalement, centre de loisirs…) un appel à témoins n'est qu'une position générale (garde thématique des pistes) ; jamais « hors périmètre », jamais un rattachement.
const attendu = { 'appel à témoins (sans nom de structure)': 'POSITION_GENERALE', 'refus de plainte': 'POSITION_GENERALE', 'après le signalement': 'POSITION_GENERALE' };
for (const [nom, l] of Object.entries(paraphrases)) { const r = classe(l); verifie(`« ${nom} » : plus « hors périmètre » ; ${attendu[nom]}, aucun rattachement`, r.destination === attendu[nom] && r.case_ids.length === 0 && r.suspendus.length === 0, r.destination); }
verifie('appel à témoins AVEC le thème (violences sur des enfants) ⇒ piste à qualifier, sans aucun rattachement', (() => { const r = classe('📣 APPEL À TÉMOINS : des violences sur des enfants ont été signalées, contactez-nous.'); return r.destination === 'PISTE_A_QUALIFIER' && r.case_ids.length === 0 && r.suspendus.length === 0; })());
verifie('contre-exemples : incendie, dons et remerciements restent hors périmètre', ['Incendie ce matin dans le gymnase : les pompiers sont intervenus.', 'Merci à toutes et à tous pour votre soutien et vos messages.', 'Faites un don pour notre course solidaire de dimanche.'].every((l) => classe(l).destination === 'HORS_PERIMETRE'));
verifie('le motif « hors périmètre » ne prétend plus un jugement sur le fond', /aucun terme de la thématique/.test(classe('Merci à toutes et à tous.').motif) && !/sans lien avec les violences/.test(classe('Merci à toutes et à tous.').motif));

console.log('E. Signal EXAMINABLE : ce que reçoit l\'éditeur');
const ps = passages(doc(appel).corps, tarnos, { alias: [], sansTitre: true });
verifie('la publication « à confirmer » porte au moins une citation (passage nommant la structure) : condition d\'envoi de la notification', ps.length >= 1 && ps[0].texte.length > 20);
const message = apercuInformation({ etablissement: tarnos.etablissement, commune: tarnos.commune, media: 'Compte fictif (Instagram)', publication_date: '2026-11-16', url: 'https://www.instagram.com/p/x1/', avant: tarnos.statut_judiciaire, citation: ps[0]?.texte, limite: 'Publication d\'un compte : déclaration non vérifiée.', emetteur: 'Compte fictif (Instagram)', aConfirmer: true });
verifie('message d\'information : « RATTACHEMENT À CONFIRMER » en tête, structure et commune, lien de la publication, citation, attribution', /RATTACHEMENT À CONFIRMER/.test(message) && message.includes('Centre de loisirs municipal de Tarnos') && message.includes('https://www.instagram.com/p/x1/') && /Déclaration du compte \(attribuée, non vérifiée\)/.test(message) && message.includes('« '));
verifie('le message ne dit PAS « rattachée à cette affaire », ne propose aucun changement, ne promet aucun bouton ; le statut judiciaire est rappelé inchangé', !/rattachée à cette affaire/.test(message) && /ne change aucun statut judiciaire/.test(message) && /Aucun bouton/.test(message) && message.includes(tarnos.statut_judiciaire));
verifie('le message ordinaire (rattachement établi) reste inchangé', /rattachée à cette affaire/.test(apercuInformation({ etablissement: 'X', commune: 'Y', media: 'M', publication_date: '2026-11-16', url: 'https://x.test/', avant: 'enquête', citation: 'c', limite: 'l', emetteur: 'E' })));
// Le chemin jusqu'à la notification, dans le code existant (contrat d'interface : pas de base ici)
const cycle = readFileSync(join(ROOT, 'scripts', 'maintenance-cycle.mjs'), 'utf8'); const tg = readFileSync(join(ROOT, 'scripts', 'telegram-v0.mjs'), 'utf8');
verifie('le cycle écrit, pour AFFAIRE_A_CONFIRMER, une PROPOSITION (state_proposals, moteur sources-suivies, ENRICHMENT, revue humaine requise) avec rattachement DOUTEUX et sans changement d\'état', /d\.destination === 'AFFAIRE_A_CONFIRMER'/.test(cycle) && /rattachement: aConfirmer \? 'DOUTEUX' : 'OK'/.test(cycle) && /PROPOSED_CHANGE: 'NO_CHANGE'/.test(cycle) && /REQUIRES_HUMAN_REVIEW: true/.test(cycle) && /statut_propose: null/.test(cycle));
verifie('la notification existante (notifier) sélectionne cette proposition : sans décision, avec citation (utile), payload « declaration » ⇒ info() sans bouton, avec l\'indicateur « à confirmer » transmis au message', /const utile = r\.aa !== 'NO_CHANGE' && Array\.isArray\(r\.facts\) && r\.facts\.some\(\(f\) => f\?\.evidence\?\.length\)/.test(tg) && /r\.decl && !\(Array\.isArray\(r\.facts\) && r\.facts\.some\(\(f\) => f\?\.libelle_public\)\) \? await info\(r\.k\)/.test(tg) && /aConfirmer: p\.decl\.rattachement_a_confirmer === true/.test(tg));
verifie('la proposition « à confirmer » n\'a AUCUN fait décidable (pas de libelle_public) ⇒ jamais de bouton VALIDATE ; une première information n\'est sollicitée qu\'une fois', aSolliciter({ decision: null, engine: 'sources-suivies', decidable: false, envois: [] }) === true && aSolliciter({ decision: null, engine: 'sources-suivies', decidable: false, envois: ['info:true'] }) === false && /const declares = \(comp \|\| ig\) \? \[\]/.test(cycle));
verifie('l\'alias n\'est lu que par l\'étape « sources suivies » du cycle (fiches enrichies), par aucun script de Discovery ni de Maintenance', (cycle.match(/enrichirFiches\(/g) || []).length === 1 && !/alias-etablissements/.test(readFileSync(join(ROOT, 'scripts', 'discovery-quotidien.mjs'), 'utf8')) && /fiches: fichesSuivies/.test(cycle) && /new Map\(fichesSuivies\.map/.test(cycle));

console.log(ko ? `\n${ko} échec(s)` : '\nTous les contrôles passent (légendes FICTIVES).');
process.exit(ko ? 1 : 0);
