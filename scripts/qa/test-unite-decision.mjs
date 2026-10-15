#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-unite-decision.mjs — « une affaire, une décision » (Discovery) et « ce qui est réellement nouveau » (Maintenance).
//
// Cas réels du 15/10/2026, REJOUÉS SUR DES DONNÉES SYNTHÉTIQUES (le dépôt est public : aucune affaire candidate n'y figure) :
//   - trois articles sur une même école → trois propositions NEW_CASE (Discovery)
//   - un article de mairie qui rappelle un fait judiciaire et annonce des mesures → une seule proposition d'état, mesures perdues (Maintenance)
//
// Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { memeAffaire, fusionner, decisionJumelle, chercherJumelle } from '../lib/qualifier-signal.mjs';
import { extraireReactions, dateEcrite, planReactions, moisFr } from '../lib/evenement-institutionnel.mjs';

let ko = 0;
const test = (nom, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}`); if (!cond) ko++; };

// --- fabrique de propositions synthétiques ----------------------------------------------------
const URL = { a: 'https://media-a.example/art-1', b: 'https://media-b.example/art-2', c: 'https://media-c.example/art-3', d: 'https://media-d.example/art-4', e: 'https://media-e.example/art-5' };
const prop = ({ commune = 'Ville-Test', etab = 'École maternelle Les Tilleuls', role = 'autre', urls, stade = 'mise en examen', indep = 1 }) => ({
  commune, etablissement: etab, etablissement_nomme: !!etab && !/non nomm/i.test(etab), structure: 'maternelle', stade_minimal: stade,
  dernier_evenement: '2026-10-14', independantes: indep, medias: urls.length,
  fiche: { departement: 'Test', role_mis_en_cause: role, crit_etablissement_nomme: !!etab && !/non nomm/i.test(etab), type_structure: 'maternelle', crit_recoupement: indep >= 2 },
  articles: urls.map((u) => ({ url: u, media: u, published: '2026-10-14' })),
  evidence: urls.map((u) => ({ url: u, media: u, quote: `Citation de ${u} suffisamment longue pour compter.`, published: '2026-10-14' })),
  unknowns: [],
});

console.log('Discovery — une affaire, une proposition');
// Soyaux rejoué : P1 (3 sources, nommée), P2 (2 sources, nommée autrement, 1 page commune), P3 (non nommée, 1 page commune)
const P1 = prop({ urls: [URL.a, URL.b, URL.c], indep: 2 });
const P2 = prop({ etab: 'École Les Tilleuls', urls: [URL.d, URL.b] });
const P3 = prop({ etab: 'structure non nommée', urls: [URL.b, URL.e], stade: 'mise en examen' });
test('P1 et P2 : même commune + page commune + même établissement → même affaire', memeAffaire(P1, P2).ok);
test('P1 et P3 (non nommée) : même affaire', memeAffaire(P1, P3).ok);
let ouverte = P1;
for (const x of [P2, P3]) ouverte = fusionner(ouverte, x);
test('3 propositions initiales → 1 unité décisionnelle', ouverte.regroupes === 3);
test('aucune source perdue (5 articles distincts, 5 preuves)', ouverte.articles.length === 5 && ouverte.evidence.length === 5);
test('médias recomptés sur l’ensemble des sources', ouverte.medias === 5);
test('indépendance jamais additionnée (max, pas somme)', ouverte.independantes === 2);
test('l’établissement NOMMÉ est conservé', ouverte.etablissement === 'École maternelle Les Tilleuls' && ouverte.fiche.crit_etablissement_nomme === true);

// Établissement non nommé d'abord, nommé ensuite : le nom l'emporte.
const U = fusionner(prop({ etab: 'structure non nommée', urls: [URL.a, URL.b] }), prop({ etab: 'École Les Tilleuls', urls: [URL.b, URL.c] }));
test('« non nommée » puis nommée → l’établissement devient nommé', U.etablissement === 'École Les Tilleuls' && U.fiche.crit_etablissement_nomme === true && U.etablissement_nomme === true);

// Divergences : consignées, jamais tranchées en silence.
const DIV = fusionner(P1, prop({ urls: [URL.b, URL.d], stade: 'enquête' }));
test('stade rapporté différemment → divergence consignée, stade de la proposition conservé', DIV.unknowns.some((u) => /différemment/.test(u)) && DIV.stade_minimal === 'mise en examen');
const NOM = fusionner(P1, prop({ etab: 'École maternelle Les Tilleuls (annexe)', urls: [URL.b, URL.d] }));
test('dénomination différente → inconnue consignée', NOM.unknowns.some((u) => /dénomination/.test(u)));

// Rejeu idempotent : refusionner la même proposition ne change rien.
const R1 = fusionner(ouverte, P3), R2 = fusionner(R1, P3);
test('rejeu idempotent (mêmes sources, même compteur)', JSON.stringify(R1) === JSON.stringify(R2) && R1.regroupes === ouverte.regroupes);

console.log('Discovery — ne jamais fusionner sans preuve');
test('deux affaires dans une même commune, aucune page commune → 2 propositions', !memeAffaire(P1, prop({ etab: 'Collège Les Chênes', urls: [URL.d, URL.e] })).ok);
test('même commune, page commune, mais deux établissements NOMMÉS différemment → distincts', !memeAffaire(P1, prop({ etab: 'École élémentaire Les Chênes', urls: [URL.b, URL.e] })).ok);
test('même établissement, deux procédures (rôles précis différents) → distinctes', !memeAffaire(prop({ role: 'enseignant', urls: [URL.a, URL.b] }), prop({ role: 'animateur périscolaire', urls: [URL.b, URL.c] })).ok);
test('même établissement, un rôle précis et un « autre » → pas de conflit', memeAffaire(prop({ role: 'enseignant', urls: [URL.a, URL.b] }), prop({ role: 'autre', urls: [URL.b, URL.c] })).ok);
test('communes différentes, page commune (article multi-affaires) → distinctes', !memeAffaire(P1, prop({ commune: 'Autre-Ville', urls: [URL.b, URL.c] })).ok);
test('page lue mais citée par une seule des deux (pas une preuve) → distinctes', !memeAffaire(P1, { ...prop({ urls: [URL.d, URL.e] }), articles: [{ url: URL.b }, { url: URL.d }] }).ok);

console.log('Discovery — proposition jumelle déjà décidée');
const ligne = (o) => ({ pid: 'p', recommendation: 'NEW_CASE_CANDIDATE', payload: P1, decision: null, applied_at: null, created_case_id: null, ...o });
test('jumelle ouverte → fusion', decisionJumelle(ligne({}), new Set()).action === 'fusion');
test('jumelle en REVIEW_REQUIRED, non appliquée → fusion (toujours en attente d’un humain)', decisionJumelle(ligne({ decision: 'REVIEW_REQUIRED' }), new Set()).action === 'fusion');
test('jumelle validée et fiche créée → rattachement à CETTE fiche (jamais une seconde création)', (() => { const d = decisionJumelle(ligne({ decision: 'ACCEPT', applied_at: 'x', created_case_id: 'FR-9' }), new Set(['FR-9'])); return d.action === 'rattacher' && d.case_id === 'FR-9'; })());
test('jumelle validée, fiche pas encore créée → attente, rien n’est écrasé', decisionJumelle(ligne({ decision: 'ACCEPT' }), new Set()).action === 'attente');
test('jumelle rejetée → écartée (une décision humaine n’est pas rejouée)', decisionJumelle(ligne({ decision: 'REJECT', applied_at: 'x' }), new Set()).action === 'ecarte');
test('jumelle validée ET appliquée mais fiche absente de l’index → attente, pas de doublon', decisionJumelle(ligne({ decision: 'ACCEPT', applied_at: 'x', created_case_id: 'FR-9' }), new Set()).action === 'attente');
{
  const fakeSql = async () => [ligne({ pid: 'old' }), ligne({ pid: 'autre', payload: prop({ etab: 'Collège Les Chênes', urls: [URL.d, URL.e] }) })];
  const j = await chercherJumelle(fakeSql, P2);
  test('chercherJumelle rend la proposition qui partage une page', j?.row.pid === 'old');
  const aucune = await chercherJumelle(async () => [ligne({ pid: 'autre', payload: prop({ etab: 'Collège Les Chênes', urls: [URL.d, URL.e] }) })], P1);
  test('chercherJumelle rend null s’il n’y a aucune preuve d’identité', aucune === null);
}

console.log('Maintenance — dates écrites');
test('« en juin 2026 » → période 2026-06, JAMAIS un jour inventé', (() => { const d = dateEcrite('En juin 2026, un animateur avait été mis en examen', '2026'); return d.date === null && d.periode === '2026-06'; })());
test('« depuis juillet » → période de l’année de publication', dateEcrite('terminée depuis juillet pour tous', '2026').periode === '2026-07');
test('« le 12 octobre » + année de publication → date complète', dateEcrite('présenté le 12 octobre au conseil', '2026').date === '2026-10-12');
test('mois sans année et sans année de référence → rien (jamais deviné)', (() => { const d = dateEcrite('en juin', null); return d.date === null && d.periode === null; })());
test('« 2026-06 » s’affiche « juin 2026 »', moisFr('2026-06') === 'juin 2026' && moisFr('n/a') === '');

console.log('Maintenance — réponses publiques d’un article de mairie');
const ARTICLE = [
  'Le maire de Ville-Test a présenté le plan municipal de lutte contre les violences dans les écoles.',
  'En juin 2026, un animateur de l\'école Les Tilleuls avait été mis en examen, soupçonné d\'agressions sexuelles sur trois élèves.',
  'La municipalité avait diligenté un audit interne, concédant des défauts d\'organisation.',
  'Une commission indépendante sera installée dans les semaines à venir. Elle auditera les processus mis en place par la commune.',
  'Un plan de formation de tous les agents de la Ville au contact des enfants sera mis en place en 2027.',
  'La mairie a mis en place une cellule d\'écoute à l\'école Les Tilleuls pour les familles.',
].join(' ');
const R = extraireReactions(ARTICLE, { etablissement: 'École maternelle Les Tilleuls', anneeRef: '2026' });
const par = (m) => R.find((x) => x.mesure === m);
test('audit interne reconnu, réalisé', par('controle_inspection')?.realisation === 'réalisée');
test('commission indépendante reconnue (acteur dans la phrase suivante), annoncée', par('commission_independante')?.realisation === 'annoncée');
test('plan de formation reconnu, annoncé', par('plan_formation')?.realisation === 'annoncée');
test('politique municipale → portée TERRITOIRE (pas un événement de l’établissement)', ['controle_inspection', 'commission_independante', 'plan_formation'].every((m) => par(m)?.portee === 'territoire'));
test('mesure qui nomme l’établissement → portée ÉTABLISSEMENT', par('information_familles')?.portee === 'établissement');
test('le fait judiciaire rappelé n’est PAS une réaction', !R.some((x) => /mis en examen/.test(x.evidence.join(' '))));
test('chaque réaction porte son libellé public (table fermée) et sa citation', R.every((x) => /^Selon la presse/.test(x.libelle_public) && x.evidence.length >= 1));
test('aucun nom de personne dans les libellés publics', R.every((x) => !/Daligand|maire/.test(x.libelle_public)));
test('rejeu idempotent', JSON.stringify(extraireReactions(ARTICLE, { etablissement: 'École maternelle Les Tilleuls', anneeRef: '2026' })) === JSON.stringify(R));
test('article sans information institutionnelle → rien', extraireReactions('Un animateur a été mis en examen en juin 2026 pour des faits visant des élèves de l\'école Les Tilleuls.', { etablissement: 'Les Tilleuls' }).length === 0);
test('mesure d’un acteur non institutionnel (employeur privé, collectif) → rien', extraireReactions('Un collectif de parents réclame un audit et une commission indépendante dans les écoles.', {}).length === 0);

console.log('Maintenance — nouveauté par rapport à la mémoire');
const connus = new Set([par('controle_inspection').libelle_public]);
const plan = planReactions(R, connus);
test('une mesure déjà consignée n’est pas reproposée', !plan.neufs.some((x) => x.mesure === 'controle_inspection') && plan.neufs.length === R.length - 1);
test('une information judiciaire déjà connue n’empêche pas les réponses nouvelles du même article', plan.neufs.length > 0);
test('territoire et établissement séparés (jamais fusionnés en une décision)', plan.propres.every((x) => x.portee !== 'territoire') && plan.territoire.every((x) => x.portee === 'territoire') && plan.propres.length + plan.territoire.length === plan.neufs.length);
test('tout déjà connu → plus rien à proposer', planReactions(R, new Set(R.map((x) => x.libelle_public))).neufs.length === 0);

console.log(ko ? `\n${ko} échec(s)` : '\nOK');
process.exit(ko ? 1 : 0);
