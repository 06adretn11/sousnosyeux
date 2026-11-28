#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-recherche-complementaire.mjs — une affaire repérée par UN SEUL article est corroborée par une recherche PAR ENTITÉS.
// Cas réel (28/11/2026, Saint-Genès La Salle, Bordeaux) : un titre (Charente Libre, reprise AFP) → recherche par titre, ± 20 jours → 1 page, 1 éditeur,
// « recoupement insuffisant ». Une recherche par nom d'établissement en trouvait douze pages, huit éditeurs.
// Textes et noms : synthétiques. Aucun réseau, aucune base, aucun modèle (tout est injecté).
// =====================================================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluer } from '../lib/qualifier-signal.mjs';
import { rechercheComplementaire, requetesComplementaires } from '../lib/recherche-complementaire.mjs';
import { messageDecision } from '../lib/discovery-messages.mjs';

let n = 0;
const t = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const ETAB = 'École élémentaire Exemple-Testbeuf';
const PAGES = {
  a: { url: 'https://www.journal-a.fr/justice/proces-exemple', media: 'Journal A', published: '2026-11-26',
    corps: 'À Ville-Exemple, un ancien enseignant de l’école élémentaire Exemple-Testbeuf comparaît à partir de lundi devant la cour criminelle pour des viols présumés sur des élèves. Selon la dépêche, plusieurs dizaines de victimes présumées ont été identifiées par les enquêteurs.' },
  b: { url: 'https://www.journal-b.fr/faits-divers/exemple-testbeuf-renvoi', media: 'Journal B', published: '2026-01-08',
    corps: 'Les juges d’instruction de Ville-Exemple ont ordonné le renvoi devant la cour criminelle de l’ancien professeur des écoles de l’établissement Exemple-Testbeuf, mis en examen en 2023 pour des agressions sexuelles sur mineurs. L’avocat des parties civiles évoque un procès à la fin de l’année.' },
  c: { url: 'https://www.radio-c.fr/actualite/proces-exemple-testbeuf', media: 'Radio C', published: '2026-11-23',
    corps: 'Le procès de l’ancien enseignant de l’école Exemple-Testbeuf à Ville-Exemple doit s’ouvrir devant la cour criminelle ; il est accusé de viols et d’agressions sexuelles, des dizaines de victimes ayant été identifiées pendant l’instruction menée par la juge.' },
  d: { url: 'https://www.quotidien-d.fr/societe/exemple-testbeuf-enquete', media: 'Quotidien D', published: '2025-04-09',
    corps: 'Deux ans après les premiers signalements à Ville-Exemple, l’information judiciaire visant l’ex-enseignant de l’école Exemple-Testbeuf est toujours en cours ; l’homme est mis en examen pour viols et reste en détention provisoire selon son conseil.' },
  autre: { url: 'https://www.journal-e.fr/ailleurs/autre-ville', media: 'Journal E', published: '2026-11-25',
    corps: 'À Autre-Ville, une école a été fermée trois jours après une alerte à la bombe ; aucune victime n’est à déplorer et l’enquête se poursuit sur les agressions verbales constatées.' },
};
const signal = { cle: 'aaaaaaaaaaaaaaaaaaaa', titre: 'Un ancien instituteur jugé pour des viols à Ville-Exemple', media: 'Journal A', published: '2026-11-26', urls: [] };
const reponse = (cles) => ({
  est_affaire: true, commune: 'Ville-Exemple', departement: 'Exemple', etablissement: ETAB, type_structure: 'élémentaire', role_mis_en_cause: 'enseignant',
  type_affaire: 'viol', statut_judiciaire: 'procès', statut_des_faits: 'allégué', enfants_concernes_public: 'plusieurs enfants', nombre_personnes_mises_en_cause: 1, periode_des_faits: null,
  resume: 'Selon la presse, un ancien enseignant comparaît devant la cour criminelle.', dernier_evenement: '2026-11-30',
  preuves: cles.map((k) => ({ url: PAGES[k].url, citation: PAGES[k].corps.split('. ')[0].replace(/\.$/, '').slice(0, 150) })), ambiguite: null,
});
const geocoder = async () => ({ lat: 44.8, lng: -0.6, source: 'ban-commune' });
const sqlVide = async () => [];
const pagesFn = async () => ({ pages: [PAGES.a], erreurs: [] });
/** Modèle figé : une page → preuve A seule ; plusieurs pages → preuves de chaque page présente. */
const modele = (appels, { autreCommune = false } = {}) => async ({ article }) => {
  appels.push(article.body.length);
  const presentes = ['a', 'b', 'c', 'd', 'autre'].filter((k) => article.body.includes(`url: ${PAGES[k].url}`));
  const r = reponse(presentes.filter((k) => k !== 'autre'));
  if (autreCommune && presentes.length > 1) r.commune = 'Autre-Ville';
  return { reponse: r, cout: { cout_usd: 0.01 } };
};
const lancer = (o) => evaluer({ sql: sqlVide, index: [], signal, modele: 'fixture', cache: new Map(), contexte: { analyses: [], dry: false }, pagesFn, geocoder, ...o });

console.log('\n  Requêtes par entités');
await t('les requêtes partent de l’établissement et de la commune, jamais du titre du signal ; pas de mot générique « autre »', () => {
  const qs = requetesComplementaires({ etablissement: ETAB, commune: 'Ville-Exemple', role_mis_en_cause: 'autre', type_affaire: 'viol', statut_judiciaire: 'procès' });
  assert.ok(qs.length >= 2 && qs.length <= 3);
  assert.ok(qs.every((q) => q.includes('Exemple-Testbeuf') && q.includes('Ville-Exemple')));
  assert.ok(qs.every((q) => !/\bautre\b/.test(q)) && qs.some((q) => /procès/.test(q)));
  assert.deepEqual(requetesComplementaires({ etablissement: null, commune: 'Ville-Exemple' }), []);
});

console.log('\n  Filtrage des pages');
await t('seules les pages RELUES qui nomment l’établissement ET la commune ET parlent de faits sont gardées ; un éditeur = une page ; déjà lues exclues', async () => {
  const resultats = [PAGES.a, PAGES.b, PAGES.c, { ...PAGES.c, url: 'https://www.radio-c.fr/actualite/autre-page', titre: 'Exemple-Testbeuf bis' }, PAGES.autre,
    { url: 'https://www.journal-f.fr/meteo', media: 'Journal F', published: '2026-11-20', corps: 'Météo à Ville-Exemple près de l’école Exemple-Testbeuf : grand soleil toute la semaine, rien à signaler.' }]
    .map((p) => ({ ...p, titre: p.titre || 'Exemple-Testbeuf à Ville-Exemple', extrait: '' }));
  const lues = [];
  const r = await rechercheComplementaire({
    c: { etablissement: ETAB, commune: 'Ville-Exemple', role_mis_en_cause: 'enseignant', type_affaire: 'viol', statut_judiciaire: 'procès' },
    dejaLues: [PAGES.a],
    rechercherFn: async () => resultats,
    lireFn: async (url) => { lues.push(url); const p = resultats.find((x) => x.url === url); return { ok: true, corps: p.corps, publie_le: p.published }; },
  });
  const domaines = r.pages.map((p) => new URL(p.url).hostname.replace(/^www\./, '')).sort();
  assert.deepEqual(domaines, ['journal-b.fr', 'radio-c.fr']);                 // A déjà lue ; 2e page de radio-c ignorée ; « autre » sans l’établissement ; météo sans faits
  assert.ok(!lues.includes(PAGES.a.url), 'une page déjà lue n’est pas relue');
  assert.ok(r.candidats >= 3 && r.requetes.length >= 2);
});
await t('sans établissement nommé : aucune recherche, aucun réseau', async () => {
  let appels = 0;
  const r = await rechercheComplementaire({ c: { etablissement: 'École non nommée', commune: 'Ville-Exemple' }, rechercherFn: async () => { appels++; return []; } });
  assert.equal(appels, 0); assert.deepEqual(r.pages, []);
});
await t('une panne de recherche est consignée, pas propagée', async () => {
  const r = await rechercheComplementaire({ c: { etablissement: ETAB, commune: 'Ville-Exemple' }, rechercherFn: async () => { throw new Error('Bing HTTP 503'); } });
  assert.deepEqual(r.pages, []); assert.ok(r.erreurs.length >= 1);
});

console.log('\n  Dans le qualificateur (evaluer)');
await t('SANS recherche complémentaire : un seul article → en attente de recoupement (ancien comportement, aucun réseau par surprise)', async () => {
  const appels = [];
  const r = await lancer({ comprendreFn: modele(appels) });
  assert.equal(r.statut, 'attente'); assert.equal(appels.length, 1);
});
await t('AVEC : l’affaire repérée par un seul article est corroborée, l’extraction est refaite sur l’ensemble, le coût est additionné, la recherche est consignée', async () => {
  const appels = []; let vu = null;
  const r = await lancer({
    comprendreFn: modele(appels),
    complementerFn: async (o) => { vu = o; return { pages: [PAGES.b, PAGES.c, PAGES.d], requetes: ['q1', 'q2'], candidats: 7, erreurs: [] }; },
  });
  assert.equal(r.statut, 'propose', r.motif);
  assert.equal(appels.length, 2, 'extraction refaite une fois, sur les pages réunies');
  assert.equal(vu.c.etablissement, ETAB); assert.equal(vu.dejaLues.length, 1);
  const p = r.proposition.payload;
  assert.equal(p.medias, 4); assert.ok(p.independantes >= 2); assert.equal(p.fiche.crit_recoupement, true);
  assert.deepEqual(p.recherche_complementaire, { requetes: 2, candidats: 7, pages_retenues: 3, adoptee: true });
  assert.ok(Math.abs(r.cout.cout_usd - 0.02) < 1e-9);
  assert.equal(r.proposition.recommendation, 'NEW_CASE_CANDIDATE');
});
await t('la reprise décrit une AUTRE commune : le premier passage est conservé, rien n’est joint', async () => {
  const appels = [];
  const r = await lancer({ comprendreFn: modele(appels, { autreCommune: true }), complementerFn: async () => ({ pages: [PAGES.autre], requetes: ['q'], candidats: 1, erreurs: [] }) });
  assert.equal(r.statut, 'attente');                                           // toujours un seul éditeur : le dossier n'est pas gonflé
  assert.equal(appels.length, 2);
});
await t('recherche sans résultat : le dossier attend, comme avant', async () => {
  const r = await lancer({ comprendreFn: modele([]), complementerFn: async () => ({ pages: [], requetes: ['q1', 'q2'], candidats: 0, erreurs: [] }) });
  assert.equal(r.statut, 'attente');
});
await t('une recherche qui lève une exception ne fait pas tomber le signal', async () => {
  const r = await lancer({ comprendreFn: modele([]), complementerFn: async () => { throw new Error('réseau'); } });
  assert.equal(r.statut, 'attente');
});
await t('câblage : active par défaut sur le chemin de production seulement (pagesFn par défaut), jamais pour un pagesFn injecté', () => {
  const q = src('scripts/lib/qualifier-signal.mjs');
  assert.match(q, /const complementer = complementerFn \|\| \(pagesFn === chercherPages \? rechercheComplementaire : null\)/);
  assert.match(q, /if \(indep1 < 2 && estNommeEtab\(v\.c\.etablissement\)\)/);
});

console.log('\n  Message Discovery');
await t('la recherche menée est DITE (trouvée ou non) ; « un seul éditeur » n’est plus dit « reprennent la même dépêche »', () => {
  const base = { commune: 'Ville-Exemple', etablissement: ETAB, etablissement_nomme: true, structure: 'élémentaire', resume: 'Selon la presse, un ancien enseignant comparaît.', stade_minimal: 'procès',
    fiche: { crit_source_fiable: true, crit_article_recent: true, crit_statut_clair: true, crit_recoupement: false, crit_etablissement_nomme: true }, independantes: 1, medias: 1,
    articles: [{ media: 'Journal A', url: PAGES.a.url }], possible_matches_sny: [{ case_id: 'FR-2026-0001' }, { case_id: 'FR-2026-0002' }, { case_id: 'FR-2026-0001' }, { case_id: 'FR-2026-0002' }] };
  const vide = messageDecision({ ...base, recherche_complementaire: { requetes: 3, candidats: 2, pages_retenues: 0, adoptee: false } }, 'REVIEW').replace(/<\/?b>/g, '');
  assert.match(vide, /Recherche complémentaire effectuée \(3 requête\(s\)/);
  assert.match(vide, /recoupement : un seul éditeur/); assert.doesNotMatch(vide, /reprennent la même dépêche/);
  const ok = messageDecision({ ...base, medias: 4, independantes: 3, fiche: { ...base.fiche, crit_recoupement: true }, recherche_complementaire: { requetes: 3, candidats: 9, pages_retenues: 3, adoptee: true } }, 'NEW_CASE_CANDIDATE').replace(/<\/?b>/g, '');
  assert.match(ok, /3 page\(s\) d’éditeurs de plus relue\(s\) et jointe\(s\)/);
  assert.equal((vide.match(/FR-2026-0001/g) || []).length, 1, 'une affaire connue n’est citée qu’une fois');
});

console.log(`\n${n} vérifications : toutes réussies.`);
