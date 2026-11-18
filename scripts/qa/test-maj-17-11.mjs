#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-maj-17-11.mjs — retours « À revoir » du 17/11/2026 sur deux mises à jour de fiches publiées, rejoués sur des DONNÉES SYNTHÉTIQUES (dépôt public :
// aucune page de presse reproduite, aucun nom réel).
//
//   1. une mobilisation ANNONCÉE « ce lundi soir » dans un article du dimanche est datée du lundi SUIVANT (et non six jours avant la parution) ;
//   2. un bouton « fermer » collé au titre par une page web n'est jamais lu comme « la structure a été fermée » ;
//   3. la reprise après un « À revoir » : cible une affaire, ne touche qu'une proposition DÉCIDÉE par l'éditeur (jamais un ACCEPT), une seule fois, sans rien approuver.
//
// Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { readFileSync } from 'node:fs';
import { dateEcrite, extraireReactions } from '../lib/evenement-institutionnel.mjs';
import { selectionnerMisesAJour } from '../lib/fiche-miseajour.mjs';

let ko = 0;
const test = (nom, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}`); if (!cond) ko++; };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

// ---- 1. jour de semaine d'un fait annoncé -------------------------------------------------------------------------------------------------------
// 2026-11-15 est un dimanche ; 2026-11-16 le lundi suivant ; 2026-11-09 le lundi précédent.
test('« ce lundi soir » sans marque d’avenir, article du dimanche : le lundi PRÉCÉDENT (comportement historique conservé)', dateEcrite('Le conseil s’est tenu ce lundi soir.', '2026-11-15').date === '2026-11-09');
test('« ce lundi soir » pour un fait ANNONCÉ : le lundi SUIVANT', dateEcrite('Des parents se mobilisent ce lundi soir devant la mairie.', '2026-11-15', { avenir: true }).date === '2026-11-16');
test('un verbe d’avenir (« sera organisée ce lundi ») date aussi vers l’avant ; « lundi dernier » reste un passé', dateEcrite('Une réunion sera organisée ce lundi.', '2026-11-15').date === '2026-11-16' && dateEcrite('Une réunion a eu lieu lundi dernier.', '2026-11-15', { avenir: true }).date === '2026-11-09');
test('le jour même (article du lundi, fait annoncé « ce lundi soir ») : la parution elle-même, pas sept jours plus tard', dateEcrite('Des parents se mobilisent ce lundi soir.', '2026-11-16', { avenir: true }).date === '2026-11-16');
test('un jour écrit en toutes lettres reste prioritaire sur le jour de semaine', dateEcrite('Un rassemblement a eu lieu le 12 novembre 2026, ce jeudi.', '2026-11-15', { avenir: true }).date === '2026-11-12');
const OPTS = { etablissement: 'centre de loisirs de Ville-Test', anneeRef: '2026-11-15', lieAffaire: true, commune: 'Ville-Test' };
const annonce = extraireReactions('Des parents d’élèves se mobilisent ce lundi soir devant la mairie de Ville-Test, près de la ville voisine.', OPTS);
test('extracteur : la mobilisation annoncée « ce lundi soir » (article du dimanche) porte la date du lundi suivant', annonce.length > 0 && annonce.every((f) => f.realisation === 'annoncée' && f.event_date === '2026-11-16'));

// ---- 2. chrome de page lu comme une mesure ----------------------------------------------------------------------------------------------------
const CORPS = '⛈️ Alerte météo : orages et inondations ce mercredi sur plusieurs départements fermer Actu Normandie Calvados Ville-Test Enfants agressés au centre de loisirs de Ville-Test : les parents manifestent et demandent des comptes à la maire Les parents d’enfants du centre de loisirs ont manifesté au conseil municipal de Ville-Test ce lundi 16 novembre 2026. Ils interrogent la responsabilité éventuelle de la mairie.';
const faits = extraireReactions(CORPS, { ...OPTS, anneeRef: '2026-11-17' });
test('un bouton « fermer » suivi du fil d’Ariane n’est PAS une fermeture de structure (aucun fait « structure fermée »)', !faits.some((f) => f.mesure === 'fermeture_structure'));
test('…et la vraie phrase de l’article (rassemblement du 16 novembre) est conservée, réalisée, datée', faits.some((f) => f.nature === 'mobilisation' && f.realisation === 'réalisée' && f.event_date === '2026-11-16'));
test('une vraie fermeture rapportée par l’article reste reconnue (la correction ne supprime pas les faits établis)', extraireReactions('La mairie de Ville-Test a fermé le centre de loisirs jusqu’à nouvel ordre.', OPTS).some((f) => f.mesure === 'fermeture_structure'));

// ---- 3. reprise après « À revoir » -----------------------------------------------------------------------------------------------------------
const reprise = src('scripts/reprendre-sans-perte.mjs'), wf = src('.github/workflows/sny-reprise.yml');
test('reprise : l’option --apres-revue cible UNE affaire (--case obligatoire) et ne reprend qu’une proposition décidée « À revoir » par l’éditeur (décision non machine)', /--apres-revue/.test(reprise) && /APRES_REVUE && !SEULS/.test(reprise) && /REVIEW_REQUIRED/.test(reprise) && /estDecisionMachine/.test(reprise));
test('reprise : une seule fois par proposition (clé d’idempotence), jamais d’ACCEPT ni de REJECT posé à la place de l’éditeur sur une proposition décidée', /reprise-sans-perte:\$\{id\}:\$\{derniere\.pid\.slice\(0, 8\)\}/.test(reprise) && !/decision = 'ACCEPT'/.test(reprise));
test('workflow : entrée « affaires » + option après revue, saisie validée, aucune écriture sans « ecrire »', /apres_revue/.test(wf) && /FR-2026-\[0-9\]\[0-9\]\[0-9\]\[0-9\]/.test(wf) && /if: \$\{\{ inputs\.ecrire \}\}/.test(wf));

// ---- sélection : tous types d'analyses du lot lors d'une reprise après revue ------------------------------------------------------------------
const V = { deroule: [{ type: 'plainte', date: null, texte: 'Selon Média, une plainte est déposée.', source: { media: 'Média', url: 'https://m.example/1', publie_le: '2026-10-07' } }] };
const ligne = (o = {}) => ({ k: 'k1', case_id: 'FR-X-0001', url: 'https://m.example/reaction', media: 'Média', pd: '2026-11-17', rat: 'OK', decision: null, decideur: null, facts: [{ event_type: 'réaction publique', evidence: ['Les parents ont manifesté.'] }], ...o });
const ctx = { publie: new Map([['FR-X-0001', { d: V }]]), approuvee: () => true, holds: new Set(), deja: new Set() };
const sel = (l, o = {}) => selectionnerMisesAJour({ lignes: [l], ...ctx, ...o });
test('sélection courante : une réaction publique (parents au conseil municipal) ne déclenche pas de mise à jour judiciaire (frontière inchangée)', sel(ligne()).groupes.length === 0 && sel(ligne()).ecartees[0].motif === 'AUCUN_EVENEMENT_JUDICIAIRE');
test('reprise après revue (tousTypes) : l’article du lot est TRANSMIS à la génération (ses gardes décident ce qui entre) ; refus de l’éditeur, source payante, rattachement douteux restent écartés', sel(ligne(), { tousTypes: true }).groupes.length === 1
  && sel(ligne({ decision: 'REJECT', decideur: 'Adrien (Telegram)' }), { tousTypes: true }).ecartees[0].motif === 'REFUSEE_PAR_L_EDITEUR'
  && sel(ligne({ media: 'Mediapart' }), { tousTypes: true }).ecartees[0].motif === 'SOURCE_PAYANTE'
  && sel(ligne({ rat: 'DOUTEUX' }), { tousTypes: true }).ecartees[0].motif === 'RATTACHEMENT_INSUFFISANT');
// ---- une proposition renvoyée en revue / remplacée ne peut plus être approuvée ------------------------------------------------------------------
const tel = src('scripts/telegram-v0.mjs');
test('approbation accidentelle impossible : le clic sur une fiche (new_case_proposals) n’écrit que sur une proposition SANS décision (une proposition « À revoir » ou remplacée répond « déjà décidée »)',
  (tel.match(/update new_case_proposals\s+set decision = \$\{NC_VERS_DB\[d\]\}[^`]*?where proposal_id = \$\{pr\.pid\}::uuid and decision is null/g) || []).length === 2);

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log('\nContrôles retours « À revoir » 17/11 : OK');
