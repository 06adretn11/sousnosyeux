#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-sources-suivies.mjs — raccord des publications d'organismes suivis (lib/sources-suivies.mjs). Aucun réseau, aucune base.
// Documents SYNTHÉTIQUES et explicitement artificiels ; les essais sur documents réels (corpus A–H du 05/11/2026) sont consignés dans
// docs/industrialisation/VEILLE_ASSOCIATIVE_1.md.
// =====================================================================
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  chargerRegistre, cleDocument, empreinteSubstance, comparer, aRelire, memoireFichier, natureDocument, dateEntete, classer, passages,
  apercuInformation, divergencesContact, zonePertinente, liensIndex, lireDocument, complementDe,
} from '../lib/sources-suivies.mjs';

let n = 0; const t = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const REG = new URL('../../data/associations-watchlist.json', import.meta.url);

// Affaires SYNTHÉTIQUES (aucune affaire réelle).
const FICHES = [
  { case_id: 'T-11A', etablissement: 'École maternelle Tilleuls', commune: 'Paris 11e', departement: 'Paris', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'relaxe / non-lieu / classement' },
  { case_id: 'T-11B', etablissement: 'École maternelle Peupliers', commune: 'Paris 11e', departement: 'Paris', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'mise en examen' },
  { case_id: 'T-LD', etablissement: 'Centre de loisirs des Pins', commune: 'Ondres', departement: 'Landes', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'mise en examen' },
];
const doc = (titre, ...p) => ({ titre, corps: [titre, ...p].join('\n\n'), url: 'https://asso.example/un-article-de-test/' });
const ORG = { id: 'asso', nom: 'Association Test', portee: 'nationale', suivi: { domaines: ['asso.example'] } };

console.log('\n  REGISTRE');
await t('registre de production : 18 entrées (15 du kit + 3 historiques conservées), identités uniques, chaque page a un type et un émetteur', () => {
  const r = chargerRegistre(REG);
  assert.equal(r.organismes.length, 18);
  assert.equal(new Set(r.organismes.map((o) => o.id)).size, 18);
  for (const id of ['enfant-bleu', 'colosse', 'adavem-jp40', 'ose-paris', 'innocence-en-danger', 'fcpe-paris', 'fcpe-33', 'pav75', 'victaid', 'mediavic05', 'metooecole',
    'mouvenfants', 'francas33', 'sos-periscolaire', 'couples-et-familles-tarnos', 'cdp-enfance', 'cvm', 'une-vie']) assert.ok(r.organismes.some((o) => o.id === id), id);
  for (const p of r.pages) { assert.ok(['index', 'service', 'document'].includes(p.type), p.url); assert.ok(p.emetteur, p.url); }
  assert.equal(r.organismes.find((o) => o.id === 'couples-et-familles-tarnos').suivi.pages.length, 0, 'identité non résolue : aucune URL inventée');
});
await t('page commune à deux organismes (paris.fr : OSE + PAV) lue UNE fois, émise par la Ville', () => {
  const r = chargerRegistre(REG);
  const p = r.pages.filter((x) => x.url.includes('paris.fr/pages/violences-sexuelles'));
  assert.equal(p.length, 1); assert.deepEqual(p[0].organismes.sort(), ['ose-paris', 'pav75']); assert.equal(p[0].emetteur, 'Ville de Paris');
});
await t('identités : fiches France Victimes id=17/23/57/67 distinctes ; Mouv’Enfants avec et sans www distincts', () => {
  const ids = [17, 23, 57, 67].map((i) => cleDocument(`https://www.france-victimes.fr/index.php/component/association/?id=${i}&view=fiche&utm_source=x`));
  assert.equal(new Set(ids).size, 4); assert.ok(!ids[0].includes('utm_source'));
  assert.notEqual(cleDocument('https://mouvenfants.fr/actualites'), cleDocument('https://www.mouvenfants.fr/actualites'));
});

console.log('\n  MÉMOIRE ET EMPREINTE');
const base = doc('Une publication', 'L’association a présenté le 3 mars son rapport sur le recueil de la parole des enfants dans les écoles et les accueils de loisirs.', 'Elle demande une formation obligatoire des animateurs.');
await t('changement de gabarit (dons, lettre d’information, compteur) : même empreinte ; correction de texte : empreinte différente', () => {
  const gabarit = { ...base, corps: base.corps + '\n\nFaire un don : votre don est déductible à 66 % de votre impôt.\n\nInscrivez-vous à notre newsletter.\n\n12 345 678 appels' };
  const corrige = { ...base, corps: base.corps.replace('obligatoire', 'facultative') };
  assert.equal(empreinteSubstance(gabarit.corps), empreinteSubstance(base.corps));
  assert.notEqual(empreinteSubstance(corrige.corps), empreinteSubstance(base.corps));
});
await t('deux lectures identiques → INCHANGE ; texte corrigé → MODIFIE ; jamais lu → NOUVEAU', () => {
  const e = empreinteSubstance(base.corps);
  assert.equal(comparer({ empreinte: e }, null), 'NOUVEAU');
  assert.equal(comparer({ empreinte: e }, { content_fingerprint: e }), 'INCHANGE');
  assert.equal(comparer({ empreinte: 'autre' }, { content_fingerprint: e }), 'MODIFIE');
});
await t('cadence : page de service relue au plus une fois par semaine ; un échec est retenté au cycle suivant', () => {
  const page = { cadence: 'hebdomadaire' }, now = Date.parse('2026-11-10T00:00:00Z');
  assert.equal(aRelire(page, { fetch_status: 'OK', checked_at: '2026-11-05T00:00:00Z' }, now), false);
  assert.equal(aRelire(page, { fetch_status: 'OK', checked_at: '2026-11-02T00:00:00Z' }, now), true);
  assert.equal(aRelire(page, { fetch_status: 'HTTP 503', checked_at: '2026-11-09T00:00:00Z' }, now), true);
});
await t('échec de lecture : incident consigné, empreinte, destination et date du dernier succès CONSERVÉES', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sny-mem-'));
  try {
    const m = memoireFichier(join(dir, 'm.json'));
    m.noterSucces({ doc_key: 'suivie|https://a.example/x', resolution_method: 'SOURCE_SUIVIE/AFFAIRE', content_fingerprint: 'abc', case_ids: ['T-11A'], maintenant: '2026-11-05T10:00:00Z' });
    m.noterEchec({ doc_key: 'suivie|https://a.example/x', fetch_status: 'HTTP 502', failure_reason: 'HTTP 502', maintenant: '2026-11-06T10:00:00Z' });
    const r = m.get('suivie|https://a.example/x');
    assert.equal(r.content_fingerprint, 'abc'); assert.equal(r.resolution_method, 'SOURCE_SUIVIE/AFFAIRE'); assert.equal(r.resolved_at, '2026-11-05T10:00:00Z');
    assert.equal(r.fetch_status, 'HTTP 502'); assert.equal(r.checked_at, '2026-11-06T10:00:00Z');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
await t('page vide / application JavaScript → échec visible (jamais « aucune actualité ») ; contrôle anti-robot nommé comme tel', async () => {
  const rep = (corps, status = 200) => async () => new Response(corps, { status, headers: { 'content-type': 'text/html' } });
  const vide = await lireDocument('https://x.example/', { fetchImpl: rep('<html><body><div id="app"></div></body></html>') });
  assert.equal(vide.ok, false); assert.match(vide.motif, /PAGE_VIDE/);
  const waf = await lireDocument('https://x.example/', { fetchImpl: rep('<html>Security check — Tiger Protect</html>', 503) });
  assert.equal(waf.ok, false); assert.match(waf.motif, /BLOCAGE_ANTI_ROBOT/);
});

console.log('\n  NATURE, DATES, ORIGINE');
await t('reprise de presse : origine conservée (une seule origine, pas de corroboration) ; article externe → émetteur = le média', () => {
  const r = natureDocument({ url: 'https://asso.example/revue/', corps: 'Revue\n\nArticle paru dans Le Parisien, le 20 mai 2026 : un texte.' }, { url: 'https://asso.example/index/', type: 'index' }, ORG);
  assert.equal(r.nature, 'REPRISE_PRESSE'); assert.equal(r.origine_presse, 'Le Parisien');
  const e = natureDocument({ url: 'https://media.example/article', corps: 'x' }, null, ORG);
  assert.equal(e.nature, 'ARTICLE_PRESSE_REFERENCE'); assert.equal(e.emetteur, 'media.example');
});
await t('date d’en-tête : « Paris, le 12 mai 2026 » en début de ligne ; jamais la date d’un autre texte cité dans une phrase', () => {
  assert.equal(dateEntete('Communiqué de presse\nParis, le 12 mai 2026\nTitre'), '2026-05-12');
  assert.equal(dateEntete('Revue. Article paru dans Le Parisien, le 20 mai 2026 : extrait.'), null);
});

console.log('\n  CLASSEMENT (aucun modèle)');
await t('publication nommant l’établissement + commune + rôle → AFFAIRE (une seule) ; passages sans le titre', () => {
  const d = doc('Notre action dans le périscolaire', 'En avril, à l’école maternelle Tilleuls, dans le 11e arrondissement de Paris, un animateur périscolaire a été suspendu ; l’association s’est constituée partie civile.');
  const c = classer({ doc: d, page: { type: 'document' }, organisme: ORG, fiches: FICHES });
  assert.equal(c.destination, 'AFFAIRE'); assert.deepEqual(c.case_ids, ['T-11A']);
  const ps = passages(c.zone, FICHES[0], { alias: ['association test'] });
  assert.ok(ps.length >= 1 && ps.every((p) => !/^Notre action/.test(p.texte)));
});
await t('communiqué sans nom d’école (commune + rôle + fait) → RATTACHEMENT_SUSPENDU, aucun lien inventé', () => {
  const d = doc('Communiqué', 'Des familles signalent des faits présumés d’agressions sexuelles dans une école maternelle du 11e arrondissement de Paris ; plusieurs parents déposent plainte contre un animateur périscolaire.');
  const c = classer({ doc: d, page: { type: 'document' }, organisme: ORG, fiches: FICHES });
  assert.equal(c.destination, 'RATTACHEMENT_SUSPENDU'); assert.deepEqual(c.case_ids, []); assert.deepEqual(c.suspendus.sort(), ['T-11A', 'T-11B']);
});
await t('« Paris » seul (une course de Dax à Paris) ne suspend aucune affaire d’arrondissement', () => {
  const d = doc('Le défi', 'Le président traversera la France à vélo, de Dax à Paris, pour sensibiliser aux violences faites aux enfants, y compris dans le périscolaire et auprès des animateurs.');
  const c = classer({ doc: d, page: { type: 'document' }, organisme: { ...ORG, nom: 'Colosse test', portee: 'nationale' }, fiches: FICHES });
  assert.notEqual(c.destination, 'RATTACHEMENT_SUSPENDU'); assert.equal(c.destination, 'POSITION_GENERALE');
});
await t('position nationale d’un organisme dont le siège est dans les Landes : aucune portée landaise (POSITION_GENERALE)', () => {
  const d = doc('Questionnaire sur les violences sexuelles', 'Recueillir la parole des enfants ne suffit pas : il faut former les adultes et protéger les enfants victimes de violences.');
  const c = classer({ doc: d, page: { type: 'document' }, organisme: { ...ORG, portee: 'nationale', siege: 'Landes' }, fiches: FICHES });
  assert.equal(c.destination, 'POSITION_GENERALE'); assert.deepEqual(c.case_ids, []);
});
await t('activité sans lien (incendie) → HORS_PERIMETRE ; filtre d’organisme (recrutement) → HORS_PERIMETRE motivé', () => {
  const f = classer({ doc: doc('Mobilisés pour les sinistrés', 'Le service a accueilli les familles sinistrées après l’incendie. L’institut œuvre aussi pour la protection de l’enfance.'), page: { type: 'document' }, organisme: ORG, fiches: FICHES });
  assert.equal(f.destination, 'HORS_PERIMETRE');
  const r = classer({ doc: { ...doc('L’association recrute une alternante', 'Poste à pourvoir.'), url: 'https://asso.example/lassociation-recrute-une-alternante/' }, page: { type: 'document' },
    organisme: { ...ORG, suivi: { ...ORG.suivi, filtre: { exclure: ['recrut'] } } }, fiches: FICHES });
  assert.equal(r.destination, 'HORS_PERIMETRE'); assert.match(r.motif, /filtre/);
});
await t('page de service sans affaire → RESSOURCE (révision documentaire, aucun événement d’affaire)', () => {
  const c = classer({ doc: doc('Nous contacter', 'Accueil du lundi au vendredi sur rendez-vous, au siège de l’association.'), page: { type: 'service' }, organisme: ORG, fiches: FICHES });
  assert.equal(c.destination, 'RESSOURCE');
});
await t('émetteur COMMUNAL : le document porte sa commune ; une association nationale, jamais', () => {
  const d = doc('PV', 'texte');
  assert.match(zonePertinente(d, { portee: 'communale:Ondres' }), /^Commune de Ondres\./);
  assert.doesNotMatch(zonePertinente(d, { portee: 'nationale' }), /Commune de/);
});
await t('preuve complémentaire : un passage qui cite un organisme déjà rapporté pour l’affaire n’est pas un nouvel événement', () => {
  const c = complementDe({ url: 'https://ville.example/pv.pdf', passagesTexte: 'L’association Test et l’ADAVEM ont été sollicitées.', alias: ['association test', 'adavem'],
    faits: [{ texte: 'La Ville a sollicité l’ADAVEM.', url: 'https://media.example/a', media: 'Média', publie_le: '2026-07-09' }] });
  assert.equal(c.type, 'PREUVE_COMPLEMENTAIRE'); assert.equal(c.ref.media, 'Média');
});

console.log('\n  ÉCHÉANCE DES DOCUMENTS CONNUS');
await t('document connu : relu au plus 1×/semaine ; sa réapparition dans un index ne repousse JAMAIS l’échéance ; une correction à URL constante est réexaminée à l’échéance', async () => {
  const { parcourirSources } = await import('../lib/sources-suivies.mjs');
  const registre = { organismes: [{ id: 'o', nom: 'Organisme Test', suivi: { pages: [] } }], pages: [{ url: 'https://o.example/index/', type: 'index', cadence: 'quotidienne', emetteur: 'O', organismes: ['o'] }] };
  const DOC = 'https://o.example/un-document-de-test-assez-long/';
  let version = 'texte initial du document de test sur le recueil de la parole des enfants et la protection de l’enfance dans les écoles et accueils de loisirs.';
  const lire = async (url) => (url.endsWith('/index/')
    ? { ok: true, url, url_finale: url, titre: 'Index', corps: 'Index des publications de l’organisme de test, sans autre contenu que la liste des documents publiés ci-dessous pour les essais.', liens: [{ url: DOC, titre: 'Un document' }], extraction: 'paragraphes' }
    : { ok: true, url, url_finale: url, titre: 'Un document', corps: 'Un document\n\n' + version, publie_le: '2026-10-01', liens: [], extraction: 'paragraphes' });
  const dir = mkdtempSync(join(tmpdir(), 'sny-ech-')); const m = memoireFichier(join(dir, 'm.json'));
  const cycle = async (iso) => {
    const r = await parcourirSources({ registre, memoire: m, fiches: FICHES, lire, lireRss: async () => ({ ok: false, items: [] }), maintenant: iso });
    for (const d of r.docs) {
      if (d.issue === 'NOUVEAU' || d.issue === 'MODIFIE') m.noterSucces({ doc_key: cleDocument(d.url), resolution_method: 'SOURCE_SUIVIE/' + d.destination, content_fingerprint: d.empreinte, case_ids: [], maintenant: iso });
      else if (d.issue === 'INCHANGE') m.toucher(cleDocument(d.url), iso);
    }
    return { docs: r.docs.filter((d) => d.url === DOC), requetes: r.requetes };
  };
  try {
    const j0 = await cycle('2026-11-01T10:00:00Z'); assert.equal(j0.docs[0].issue, 'NOUVEAU');
    const echeance = Date.parse(m.get(cleDocument(DOC)).checked_at) + 7 * 864e5;
    for (const j of ['2026-11-02T10:00:00Z', '2026-11-04T10:00:00Z', '2026-11-07T10:00:00Z']) {      // l’index relie le document tous les jours
      const r = await cycle(j); assert.equal(r.docs[0].issue, 'CONNU_RECENT', j); assert.equal(Date.parse(m.get(cleDocument(DOC)).checked_at) + 7 * 864e5, echeance, 'échéance inchangée');
    }
    version = version.replace('recueil de la parole', 'recueil des témoignages');   // correction substantielle, MÊME URL
    const r8 = await cycle('2026-11-08T10:00:00Z'); assert.equal(r8.docs[0].issue, 'MODIFIE', 'réexaminé à l’échéance');
    assert.equal((await cycle('2026-11-09T10:00:00Z')).docs[0].issue, 'CONNU_RECENT', 'nouvelle échéance = +7 j');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
await t('un document rattaché à une affaire est relu à chaque cycle (continuité de sa proposition) ; un échec conserve le dernier état réussi', async () => {
  const { parcourirSources } = await import('../lib/sources-suivies.mjs');
  const DOC = 'https://o.example/rattache-a-une-affaire/';
  const registre = { organismes: [{ id: 'o', nom: 'O', suivi: { pages: [] } }], pages: [{ url: 'https://o.example/index/', type: 'index', cadence: 'quotidienne', emetteur: 'O', organismes: ['o'] }] };
  let echec = false;
  const lire = async (url) => (url.endsWith('/index/') ? { ok: true, url, url_finale: url, titre: 'I', corps: 'Index de test des publications de l’organisme, sans autre contenu que la liste des documents publiés ci-dessous.', liens: [{ url: DOC, titre: 'D' }] }
    : echec ? { ok: false, url, motif: 'HTTP 502' } : { ok: true, url, url_finale: url, titre: 'D', corps: 'D\n\nUn texte de test suffisamment long pour être lu, sans rapport avec une affaire connue de la base de test.', liens: [] });
  const dir = mkdtempSync(join(tmpdir(), 'sny-ech2-')); const m = memoireFichier(join(dir, 'm.json'));
  m.noterSucces({ doc_key: cleDocument(DOC), resolution_method: 'SOURCE_SUIVIE/AFFAIRE', content_fingerprint: 'x', case_ids: ['T-11A'], maintenant: '2026-11-01T10:00:00Z' });
  try {
    const r = await parcourirSources({ registre, memoire: m, fiches: FICHES, lire, lireRss: async () => ({ ok: false, items: [] }), maintenant: '2026-11-02T10:00:00Z' });
    assert.notEqual(r.docs.find((d) => d.url === DOC).issue, 'CONNU_RECENT', 'rattaché : relu le lendemain');
    echec = true;
    const r2 = await parcourirSources({ registre, memoire: m, fiches: FICHES, lire, lireRss: async () => ({ ok: false, items: [] }), maintenant: '2026-11-03T10:00:00Z' });
    assert.equal(r2.docs.find((d) => d.url === DOC).issue, 'ECHEC'); assert.equal(m.get(cleDocument(DOC)).content_fingerprint, 'x', 'dernier état réussi conservé');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log('\n  SORTIES');
await t('message Telegram : information SANS bouton, attribuée, « aucun changement de la fiche », limite affichée', () => {
  const m = apercuInformation({ etablissement: 'École T', commune: 'Paris 11e', media: 'Association Test', publication_date: '2026-07-21', url: 'https://asso.example/a',
    avant: 'relaxe / non-lieu / classement', citation: 'Une phrase.', limite: 'Publication de Association Test : elle n’établit ni les faits dénoncés ni une étape judiciaire.', emetteur: 'Association Test' });
  assert.match(m, /Aucun changement de la fiche \(état : relaxe/); assert.match(m, /Publication de Association Test rattachée/); assert.doesNotMatch(m, /VALIDATE|REJECT|callback/);
});
await t('divergence de contacts entre pages d’un organisme : signalée, adresses nominatives masquées ; page d’un tiers partagée exclue', () => {
  const p = (url, corps, organismes = ['m']) => ({ type: 'service', url, emetteur: 'E', organismes, doc: { corps } });
  const d = divergencesContact([p('https://m.example/contact', 'Écrire à contact@m.example'), p('https://reseau.example/fiche', 'Écrire à jean.dupont@fai.example'), p('https://ville.example/p', 'x@ville.example', ['m', 'n'])]);
  assert.equal(d.length, 1); assert.deepEqual(d[0].pages.map((x) => x.adresses).flat(), ['contact@m.example', '…@fai.example']);
});
await t('index : liens du même site, hors navigation, dons, contact et catégories', () => {
  const html = '<nav><a href="/a-propos-de-nous-et-plus">Nav</a></nav><main><a href="/un-article-assez-long/">Un article</a><a href="/category/actu/">Cat</a><a href="/faire-un-don/">Don</a>'
    + '<a href="https://autre.example/un-article-de-presse/">Presse</a><a href="/wp-content/uploads/cp.pdf">CP</a></main>';
  const l = liensIndex(html, 'https://asso.example/actualites/');
  assert.deepEqual(l.map((x) => x.url), ['https://asso.example/un-article-assez-long/', 'https://asso.example/wp-content/uploads/cp.pdf']);
  assert.equal(liensIndex(html, 'https://asso.example/actualites/', { externes: true }).filter((x) => x.externe).length, 1);
});
await t('le raccord n’écrit ni `cases`, ni projection publique, ni décision : aucune requête de ce type dans le module', () => {
  const src = readFileSync(new URL('../lib/sources-suivies.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(?:update|insert into)\s+(?:cases|case_events|reviews|state_proposals)\b/i);
  assert.doesNotMatch(src, /publication-holds|project-public|data\/cases\.json/);
});

console.log(`\n  ${n} vérifications — sources suivies conformes\n`);
