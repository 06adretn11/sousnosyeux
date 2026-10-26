// Hubs futurs sans agent : proposition → aperçu consultable → décision de publication → page générée par le gabarit commun → front vérifié → confirmation.
// Ces contrôles démontrent chaque raccord ; le Hub Landes (rédigé) n'est pas concerné.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composerMatiereHub, payloadPublication, hubsApprouves, hashMatiere, GROUPE_INSTITUTIONS, GROUPE_FAMILLES } from '../lib/hub-publication.mjs';
import { decoderCallback, boutonValable } from '../lib/telegram-clics.mjs';
import { boutons, messageDecision } from '../lib/discovery-messages.mjs';
import { destinationsDe } from '../lib/destinations.mjs';
import { enregistrerHub, HUBS_PERIMETRES } from '../lib/diagnostic-territoire.mjs';
import { texteVerifie } from '../lib/prevenir.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

const aff = (id, commune, statut, srcs) => ({ case_id: id, etablissement: `École de ${commune}`, commune, departement: 'Testland', type_structure: 'école', role_mis_en_cause: 'enseignant', type_affaire: 'violences', statut_judiciaire: statut,
  statut_des_faits: 'allégué', enfants_concernes_public: 'non précisé', lat: 44, lng: -1, geocode_source: 'ban-commune', sources: srcs.map(([media, url, d]) => ({ url, media, publication_date: d, source_type: 'presse', is_primary: false })) });
const CASES = [aff('FR-X-0001', 'Alpha', 'mise en examen', [['Sud Ouest', 'https://so.fr/1', '2026-07-06']]), aff('FR-X-0002', 'Beta', 'procès', [['ICI', 'https://ici.fr/2', '2026-09-25'], ['Mediapart', 'https://mp.fr/3', '2026-09-26']]), aff('FR-X-0003', 'Gamma', 'enquête', [['La Dépêche', 'https://ld.fr/4', '2026-10-01']])];
const EV = [
  { case_id: 'FR-X-0001', type: 'réponse_institutionnelle', date: null, libelle: 'Selon la presse, la collectivité a annoncé un plan d’action.', realisation: 'annoncée', source: { media: 'ici', url: 'https://ici.fr/e1', publication_date: '2026-10-07' } },
  { case_id: 'FR-X-0002', type: 'mobilisation', date: '2026-09-30', libelle: 'Selon la presse, des parents ont tenu un rassemblement.', realisation: 'réalisée', source: { media: 'Le Parisien', url: 'https://lp.fr/e2', publication_date: '2026-10-01' } },
  { case_id: 'FR-X-0002', type: 'mobilisation', date: null, libelle: 'PAYANT', realisation: 'réalisée', source: { media: 'Libération', url: 'https://liberation.fr/x', publication_date: '2026-10-01' } },
  { case_id: 'FR-X-0099', type: 'mobilisation', date: null, libelle: 'AUTRE AFFAIRE', realisation: 'réalisée', source: null },
];
const TERR = { slug: 'testland', titre: 'Testland', departement: 'Testland' };
const compose = (o = {}) => composerMatiereHub({ territoire: TERR, cases: CASES, evenements: EV, holds: new Set(), dossiersExistants: new Set(['FR-X-0001']), genere_le: '2026-10-26', ...o });

t('matière composée : affaires publiques non gelées, jamais de dossier inventé, manque DIT dans les limites', () => {
  const m = compose({ holds: new Set(['FR-X-0003']) });
  assert.deepEqual(m.ordre, ['FR-X-0001', 'FR-X-0002']); assert.deepEqual(m.dossiers, {}); assert.equal(m._meta.genere_auto, true);
  const dossier = m.recherches.find((r) => /Dossier éditorial/.test(r.question)).resultat;
  assert.match(dossier, /absent pour 1 affaire\(s\) sur 2 \(FR-X-0002\)/);
  assert.match(m.reperes.limite, /1 affaire\(s\) sur 2/);
  assert.match(m.reperes.chapeau, /ne relie|ne sont réunies/); assert.match(m.reperes.chapeau, /présomption d’innocence/);
});
t('une affaire gelée n\'est ni intégrée ni détaillée (seul un décompte anonyme), et ses événements non plus', () => {
  const m = compose({ holds: new Set(['FR-X-0001']) });
  assert.ok(!JSON.stringify(m).includes('FR-X-0001') && !m.reponses.some((g) => g.items.some((i) => i.texte.includes('plan d’action'))));
  assert.match(JSON.stringify(m.recherches), /1 non intégrée\(s\)/);
  assert.throws(() => compose({ holds: new Set(CASES.map((c) => c.case_id)) }), /aucune affaire publique non gelée/);
});
t('réponses : institutions et mobilisations validées dans les blocs reconnus par la projection ; média payant et autre affaire écartés', () => {
  const m = compose();
  const g = Object.fromEntries(m.reponses.map((x) => [x.titre, x.items]));
  assert.deepEqual(Object.keys(g), [GROUPE_INSTITUTIONS, GROUPE_FAMILLES]);
  assert.equal(g[GROUPE_INSTITUTIONS].length, 1); assert.equal(g[GROUPE_FAMILLES].length, 1);
  assert.ok(!JSON.stringify(m).includes('PAYANT') && !JSON.stringify(m).includes('AUTRE AFFAIRE'));
  assert.equal(g[GROUPE_FAMILLES][0].date, '2026-09-30'); assert.equal(g[GROUPE_FAMILLES][0].date_nature, 'evenement');
  assert.equal(g[GROUPE_INSTITUTIONS][0].date_nature, 'inconnue', 'jamais une date inventée');
});
t('les blocs composés accueillent les informations validées ultérieures sans blocage (même règle que les Hubs rédigés)', () => {
  enregistrerHub('testland', 'Testland', 'Testland');
  assert.ok(HUBS_PERIMETRES.testland);
  const m = compose();
  const ctx = { publiques: new Set(['FR-X-0001']), holds: new Set(), approuvees: new Set(), cases: new Map([['FR-X-0001', { commune: 'Alpha', departement: 'Testland' }]]), hubs: { testland: { publie: true, groupes: m.reponses.map((g) => g.titre) } } };
  for (const nature of ['mesure', 'mobilisation']) { const d = destinationsDe({ case_id: 'FR-X-0001', nature, portee: 'affaire', territoire: null }, ctx); assert.deepEqual(d.bloques, []); assert.equal(d.hubs[0]?.hub, 'testland'); }
  delete HUBS_PERIMETRES.testland;
});
t('rejeu : mêmes données → même matière et même empreinte ; une donnée de plus → autre empreinte (nouvelle approbation requise)', () => {
  assert.equal(hashMatiere(compose()), hashMatiere(compose()));
  assert.notEqual(hashMatiere(compose({ evenements: EV.slice(0, 1) })), hashMatiere(compose()));
});

const PUB = payloadPublication({ slug: 'testland', titre: 'Testland', hash: hashMatiere(compose()), ids: ['FR-X-0002', 'FR-X-0001'] });
t('proposition « PUBLIER LE HUB » : bouton décodable, valable seulement pour VALIDATE, message = lien d\'aperçu + empreinte + ce que fait le bouton', () => {
  const kb = boutons('REVIEW', 'abcd1234', PUB.payload).inline_keyboard.flat();
  const b = kb.find((x) => /PUBLIER LE HUB/.test(x.text));
  assert.deepEqual(decoderCallback(b.callback_data), { type: 'NC', action: 'VALIDATE', cle: 'abcd1234' });
  assert.equal(boutonValable('VALIDATE', PUB.payload), true);
  for (const a of ['CREATE', 'ATTACH', 'PENDING']) assert.equal(boutonValable(a, PUB.payload), false);
  assert.equal(boutonValable('VALIDATE', { hub_publication: { slug: 'x' } }), false, 'sans empreinte : non valable');
  const m = messageDecision(PUB.payload, 'REVIEW');
  for (const s of ['HUB À PUBLIER', 'docs/industrialisation/hub-drafts/testland.md', PUB.payload.hub_publication.hash, '/territoires/testland/', 'sans autre intervention', 'ne sera pas publiée sans nouveau GO']) assert.ok(m.includes(s), s);
});
t('une proposition de publication par (Hub, empreinte) : clé stable, nouvelle seulement si la matière change ; ids triés', () => {
  const again = payloadPublication({ slug: 'testland', titre: 'Testland', hash: PUB.payload.hub_publication.hash, ids: ['FR-X-0001', 'FR-X-0002'] });
  assert.equal(again.cle, PUB.cle); assert.deepEqual(again.payload.hub_publication.publiques, ['FR-X-0001', 'FR-X-0002']);
  assert.notEqual(payloadPublication({ slug: 'testland', titre: 'Testland', hash: 'f'.repeat(16), ids: [] }).cle, PUB.cle);
});

t('approbation = empreinte de la matière COURANTE : GO sur l\'empreinte actuelle → public ; matière modifiée depuis → non public ; Hub rédigé jamais concerné', () => {
  const m = compose(); const h = hashMatiere(m);
  assert.deepEqual(hubsApprouves([{ slug: 'testland', hash: h }], { testland: m }), { testland: { hash: h, titre: 'Testland' } });
  assert.deepEqual(hubsApprouves([{ slug: 'testland', hash: h }], { testland: compose({ evenements: [] }) }), {}, 'matière modifiée : le GO ne couvre plus');
  assert.deepEqual(hubsApprouves([{ slug: 'testland', hash: 'a'.repeat(16) }], { testland: m }), {}, 'GO sur une autre empreinte');
  assert.deepEqual(hubsApprouves([{ slug: 'landes', hash: h }], { landes: { _meta: { hub_id: 'landes', titre: 'Landes' } } }), {}, 'un Hub rédigé a sa propre page');
  assert.deepEqual(hubsApprouves([{ slug: 'testland', hash: h }], { testland: null }), {}, 'matière absente');
  assert.equal(JSON.stringify(hubsApprouves([{ slug: 'testland', hash: h }, { slug: 'testland', hash: h }], { testland: m })), JSON.stringify(hubsApprouves([{ slug: 'testland', hash: h }], { testland: m })), 'GO rejoué : aucune duplication');
});
t('confirmation : le message « Publié et vérifié » donne le lien du Hub et les informations réellement affichées avec leur portée', () => {
  const m = texteVerifie({ hubs: ['testland'], site: 'https://sousnosyeux.org', infos: [{ libelle: 'Selon la presse, des parents ont tenu un rassemblement.', portee: 'territoire', territoire: 'Paris' }] });
  for (const s of ['Hub testland', 'https://sousnosyeux.org/territoires/testland/', 'des parents ont tenu un rassemblement', 'portée : Paris', 'non propre à une affaire']) assert.ok(m.includes(s), s);
});

t('parcours raccordé dans les workflows : préparer → déposer (matière + dossier) → annoncer/proposer ; décision appliquée AVANT la projection ; projection → vérification des Hubs → confirmation', () => {
  for (const w of ['sny-clics', 'sny-telegram']) {
    const y = src(`.github/workflows/${w}.yml`);
    const i = (s) => { const k = y.indexOf(s); assert.ok(k >= 0, `${w} : ${s}`); return k; };
    assert.ok(i('appliquer-nouvelles-affaires.mjs --ecrire') < i('project-evenements.mjs'), 'le GO est appliqué avant la projection');
    assert.ok(i('project-evenements.mjs') < i('scripts/qa/run-all.mjs') && i('scripts/qa/run-all.mjs') < i('git push origin HEAD:main'));
    assert.ok(i('--hubs $HUBS') > i('git push origin HEAD:main') && y.includes('steps.evenements.outputs.hubs'), 'vérification des Hubs après le push');
    assert.ok(i('preparer-hub.mjs --ecrire') < i('git add docs/industrialisation/hub-drafts data/hub-matiere') && i('git add docs/industrialisation/hub-drafts data/hub-matiere') < i('preparer-hub.mjs --annoncer'));
  }
  const a = src('scripts/appliquer-nouvelles-affaires.mjs'); assert.ok(a.includes('p.hub_publication') && a.indexOf('p.hub_publication') < a.indexOf('if (p.page)'));
  const p = src('scripts/project-evenements.mjs'); assert.ok(p.includes('hubs_approuves') && p.includes('hubsApprouves(') && p.includes('hubsChanges'));
  const f = src('web/src/pages/territoires/[hub].astro'); assert.ok(f.includes('hubs_approuves') && f.includes('HubGenerique'));
  assert.ok(src('scripts/verifier-site.mjs').includes('texteVerifie({ ids, fiches, hubs, site: SITE, infos })'));
});

console.log(`\n${n} contrôles : OK`);
