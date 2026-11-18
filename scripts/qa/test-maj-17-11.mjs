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
import { dateEcrite, dateDuCorps, extraireReactions } from '../lib/evenement-institutionnel.mjs';
import { selectionnerMisesAJour } from '../lib/fiche-miseajour.mjs';
import { messageEnrichissement } from '../lib/discovery-messages.mjs';
import { libelleParole } from '../lib/social-editorial.mjs';
import { portNeon } from '../lib/relais-social-db.mjs';
import { evaluerCandidat } from '../lib/relais-social.mjs';
import { cleEvenement } from '../lib/diffusion-sociale.mjs';

let ko = 0;
const test = (nom, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}`); if (!cond) ko++; };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

// ---- 1. jour de semaine d'un fait annoncé -------------------------------------------------------------------------------------------------------
// 2026-11-15 est un dimanche ; 2026-11-16 le lundi suivant ; 2026-11-09 le lundi précédent.
test('« ce lundi soir » au passé, article du dimanche : le lundi PRÉCÉDENT (comportement historique conservé)', dateEcrite('Le conseil s’est tenu ce lundi soir.', '2026-11-15').date === '2026-11-09');
test('« ce lundi soir » pour un fait ANNONCÉ, référence = dimanche : date AMBIGUË → inconnue (jamais reculée de six jours, jamais avancée par défaut)', dateEcrite('Des parents se mobilisent ce lundi soir devant la mairie.', '2026-11-15', { avenir: true }).date === null);
test('un verbe d’avenir (« sera organisée ce lundi ») reste ambigu ; « lundi dernier » reste un passé', dateEcrite('Une réunion sera organisée ce lundi.', '2026-11-15').date === null && dateEcrite('Une réunion a eu lieu lundi dernier.', '2026-11-15', { avenir: true }).date === '2026-11-09');
test('le jour même (référence = lundi, fait annoncé « ce lundi soir ») : cette date', dateEcrite('Des parents se mobilisent ce lundi soir.', '2026-11-16', { avenir: true }).date === '2026-11-16');
test('un jour écrit en toutes lettres reste prioritaire sur le jour de semaine', dateEcrite('Un rassemblement a eu lieu le 12 novembre 2026, ce jeudi.', '2026-11-15', { avenir: true }).date === '2026-11-12');
test('date de parution ÉCRITE dans le corps (« Diffusé le lundi 16 novembre 2026 ») : prime sur la métadonnée (15/11) à moins d’une semaine ; ignorée au-delà ; absente → null', dateDuCorps('Diffusé le lundi 16 novembre 2026 à 6h32', '2026-11-15') === '2026-11-16' && dateDuCorps('Publié le dimanche 15 novembre 2026 à 18h00', '2026-11-15') === '2026-11-15' && dateDuCorps('Diffusé le lundi 16 novembre 2026', '2026-09-01') === null && dateDuCorps('Un article sans date.', '2026-11-15') === null);
const OPTS = { etablissement: 'centre de loisirs de Ville-Test', anneeRef: '2026-11-15', lieAffaire: true, commune: 'Ville-Test' };
const PHRASE = 'Des parents d’élèves se mobilisent ce lundi soir devant la mairie de Ville-Test, près de la ville voisine.';
const sansDate = extraireReactions(PHRASE, OPTS), avecDate = extraireReactions(`Diffusé le lundi 16 novembre 2026 à 6h32\n\n${PHRASE}`, OPTS);
test('extracteur : métadonnée du dimanche seule → fait conservé SANS date (incertitude gardée) ; avec « Diffusé le lundi 16 novembre 2026 » dans le corps → 16 novembre', sansDate.length > 0 && sansDate.every((f) => f.realisation === 'annoncée' && f.event_date === null) && avecDate.length > 0 && avecDate.every((f) => f.event_date === '2026-11-16'));

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

// ---- relais social : évolutions tirées d'une mise à jour de fiche APPROUVÉE (procès/appel annoncés, parole de parent) --------------------------------
const T0 = new Date('2026-11-13T12:38:56Z');
const fauxSql = (lignes) => Object.assign(async (chaines) => (/from new_case_proposals p join cases c on c.case_id = p.payload/.test(chaines.join(' ')) ? lignes : []), { query: async () => [] });
const LIGNE = { pid: 'p1', case_id: 'FR-X-0001', hash: 'abcdef0123456789', decided_at: new Date('2026-11-18T10:00:00Z'), approuvee_at: new Date('2026-11-18T10:01:00Z'), ps: 'publiée', retire: false,
  maj: { reactions_ajoutees: 1, ajoutees: [{ type: 'audience', date: '2026-11-16', texte: 'Selon ICI, le procès en appel est programmé du 16 au 18 novembre 2026.', media: 'ICI', url: 'https://m.example/a', publie_le: '2026-11-15' }, { type: 'plainte', texte: 'x' }, { type: 'appel', date: null, texte: 'Un appel.' }] },
  dossier: { reactions: [{ acteur: 'Le maire', citations: [{ texte: 'a' }] }, { acteur: 'Une mère d’enfant concerné', citations: [{ texte: 'Nos enfants n’ont pas été protégés par l’institution' }] }] } };
const cands = await portNeon(fauxSql([LIGNE])).candidats(T0);
test('candidats : une étape d’audience/appel nouvelle et une parole de parent d’une fiche approuvée deviennent des évolutions « sans changement de statut » ; une plainte ou la parole d’un maire non', cands.length === 3 && cands.filter((c) => c.sous_type === 'fiche_evolution').length === 2 && cands.filter((c) => c.sous_type === 'fiche_temoignage').length === 1 && cands.every((c) => c.type === 'case_update' && c.fiche_hash === LIGNE.hash));
test('clés d’événement distinctes par élément et par version (aucun doublon social, aucune migration : type_event reste case_update)', new Set(cands.map((c) => cleEvenement('case_update', c.case_id, c.statut_apres))).size === 3);
const ctxR = (o = {}) => ({ t0: T0, now: new Date('2026-11-18T12:00:00Z'), holds: new Set(), entree: { statut_judiciaire: 'condamnation non définitive' }, ficheHash: LIGNE.hash, servi: true, ficheServie: { status: 200, hash: LIGNE.hash }, proposition: false, ledger: false, exclusions: new Set(), ...o });
const ev = cands.find((c) => c.sous_type === 'fiche_evolution');
test('éligibilité : version approuvée après T0, servie, hash identique → éligible', evaluerCandidat(ev, ctxR()).ok === true);
test('éligibilité : version approuvée AVANT T0, ou plus la version courante, ou non servie, ou affaire retirée → silence', !evaluerCandidat({ ...ev, fiche_approuvee_at: new Date('2026-11-01T00:00:00Z') }, ctxR()).ok
  && !evaluerCandidat(ev, ctxR({ ficheHash: 'autrehash' })).ok && !evaluerCandidat(ev, ctxR({ ficheServie: { status: 404, hash: null } })).ok && !evaluerCandidat({ ...ev, retire: true }, ctxR()).ok && !evaluerCandidat({ ...ev, fiche_approuvee_at: null }, ctxR()).ok);
test('un type hors périmètre (correction, source ajoutée) reste refusé', !evaluerCandidat({ ...ev, type: 'correction' }, ctxR()).ok);
const rg = src('scripts/lib/relais-social.mjs');
test('composition : audience annoncée dont la date est atteinte → aucune rédaction automatique (ni « à venir » ni « tenu ») ; parole de parent → famille declaration_victime (REVUE_HUMAINE)', /audience annoncée dont la date est atteinte|date annoncée atteinte/.test(rg) && /sous === 'fiche_temoignage' \? 'declaration_victime'/.test(rg));

// ---- correction de date déjà publiée : avant / après / extrait dits dans la proposition ---------------------------------------------------------------
const fc = { event_type: 'mobilisation', nature: 'mobilisation', mesure: 'mobilisation', realisation: 'annoncée', portee: 'établissement', acteur: 'parents', libelle_public: 'Selon la presse, des parents ont annoncé une mobilisation.', event_date: '2026-11-16',
  evidence: ['Des parents d’élèves se mobilisent ce lundi soir devant la mairie.'], correction: { avant: '2026-11-09', apres: '2026-11-16', extrait: 'Diffusé le lundi 16 novembre 2026 à 6h32', suite: 'Si VALIDATE : correction, pas ajout.' } };
const pc = { etablissement: 'centre de loisirs', commune: 'Ville-Test', courant: 'enquête', media: 'ici', publication_date: '2026-11-15', url: 'https://m.example/x' };
const msgc = messageEnrichissement(pc, [fc], false).replace(/<\/?[bc][a-z]*>/g, '');
test('proposition de correction : l’avant, l’après et l’extrait justificatif sont dits avant la décision ; une information sans correction ne les porte pas', /CORRECTION DE DATE d’une information déjà publiée : avant « 09\/11\/2026 » → après « 16\/11\/2026 »/.test(msgc) && /Justification : « Diffusé le lundi 16 novembre 2026 à 6h32 »/.test(msgc)
  && !/CORRECTION DE DATE/.test(messageEnrichissement(pc, [{ ...fc, correction: undefined }], false)));

// ---- libellé d'une prise de parole à attribution générique ----------------------------------------------------------------------------------------
test('libellé : « prise de parole d’une mère… » — jamais « de Une mère » ; un nom propre reste intact', libelleParole('Une mère d’enfant concerné') === 'prise de parole d’une mère d’enfant concerné' && libelleParole('Un père d’enfant concerné') === 'prise de parole d’un père d’enfant concerné' && libelleParole('Dorothée Pitois') === 'prise de parole de Dorothée Pitois');

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log('\nContrôles retours « À revoir » 17/11 : OK');
