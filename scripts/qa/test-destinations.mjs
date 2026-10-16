#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-destinations.mjs — de l'information VALIDÉE à la mise à jour automatique des PAGES EXISTANTES.
// Une information, une validation, des destinations CALCULÉES (fiche approuvée, Hub publié) ; jamais une page créée, jamais une affaire
// non publique / gelée exposée, jamais une portée devinée par proximité départementale. Données SYNTHÉTIQUES.
// (La preuve que les PAGES changent réellement : scripts/qa/demo-multi-surfaces.mjs, vraie construction Astro.)
// =====================================================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { destinationsDe, construireMatiere, territoireDansHub, communeDansTerritoire } from '../lib/destinations.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const GROUPES_PARIS = ['Justice', 'Ville de Paris et mairie du 11e', 'Parlement', 'Familles, avocats, syndicats, associations'];
const ctx = (o = {}) => ({
  publiques: new Set(['P-11', 'P-11B', 'P-10', 'G-1', 'ISO']), holds: new Set(['P-HOLD']), approuvees: new Set(['P-11', 'ISO']),
  cases: new Map([['P-11', { commune: 'Paris 11e', departement: 'Paris', etablissement: 'École A' }], ['P-11B', { commune: 'Paris 11e', departement: 'Paris', etablissement: 'École B2' }], ['P-10', { commune: 'Paris 10e', departement: 'Paris', etablissement: 'École B' }],
    ['G-1', { commune: 'Cenon', departement: 'Gironde', etablissement: 'École C' }], ['ISO', { commune: 'Delle', departement: 'Territoire de Belfort', etablissement: 'Collège D' }],
    ['P-HOLD', { commune: 'Paris 15e', departement: 'Paris', etablissement: 'École E' }], ['R-1', { commune: 'Villeurbanne', departement: 'Rhône', etablissement: 'École F' }], ['L-1', { commune: 'Lyon', departement: 'Rhône', etablissement: 'École G' }]]),
  hubs: { 'paris-11e': { publie: true, groupes: GROUPES_PARIS }, 'bordeaux-gironde': { publie: true, groupes: ['Justice', 'Ville de Bordeaux et Éducation nationale'] }, 'hautes-alpes': { publie: true, groupes: ['Justice'] } }, ...o,
});
const fait = (o) => ({ id: 'f1', case_id: 'P-11', nature: 'mobilisation', portee: 'établissement', libelle: 'Selon la presse, des parents ont tenu un rassemblement.', realisation: 'réalisée', acteur: 'parents', territoire: null, date: '2026-10-14', periode: null, source: { media: 'M', url: 'https://m.example/a', publie_le: '2026-10-14' }, ...o });

console.log('\n  DESTINATIONS — calculées, jamais devinées');
t('fiche + Hub : une information d’affaire (fiche approuvée, Hub dont le périmètre contient l’affaire) → UNE information, deux surfaces', () => {
  const d = destinationsDe(fait(), ctx()); assert.equal(d.fiche, 'P-11'); assert.deepEqual(d.hubs, [{ hub: 'paris-11e', groupe: 'Familles, avocats, syndicats, associations' }]);
});
t('fiche seule : affaire isolée (aucun Hub) mais fiche approuvée', () => { const d = destinationsDe(fait({ case_id: 'ISO' }), ctx()); assert.equal(d.fiche, 'ISO'); assert.deepEqual(d.hubs, []); });
t('Hub seul : affaire publique du périmètre sans fiche approuvée ; une affaire d’un autre arrondissement n’est pas dans le périmètre du Hub 11e', () => { assert.deepEqual(destinationsDe(fait({ case_id: 'P-10' }), ctx()).hubs, []); const d = destinationsDe(fait({ case_id: 'P-11B' }), ctx()); assert.equal(d.fiche, null); assert.equal(d.hubs.length, 1); });
t('aucune page : affaire non publique → rien (l’information reste en mémoire, aucune page créée)', () => { const d = destinationsDe(fait({ case_id: 'CANDIDATE' }), ctx()); assert.deepEqual(d, { fiche: null, hubs: [], bloques: [] }); });
t('affaire sous HOLD : jamais exposée, ni fiche ni Hub, même via une information territoriale', () => {
  assert.deepEqual(destinationsDe(fait({ case_id: 'P-HOLD' }), ctx()).hubs, []);
  assert.deepEqual(destinationsDe(fait({ case_id: 'P-HOLD', nature: 'mesure', portee: 'territoire', territoire: 'Paris' }), ctx()), { fiche: null, hubs: [], bloques: [] });
});
t('mesure territoriale « Ville de Paris » rattachée à Aqueduc-like (Paris 10e) : Hub Paris oui ; fiche d’origine seulement si approuvée ET commune dans la portée', () => {
  const f = fait({ case_id: 'P-10', nature: 'mesure', portee: 'territoire', territoire: 'Paris', acteur: 'Ville de Paris' });
  const d = destinationsDe(f, ctx()); assert.deepEqual(d.hubs, [{ hub: 'paris-11e', groupe: 'Ville de Paris et mairie du 11e' }]); assert.equal(d.fiche, null);
  assert.equal(destinationsDe(fait({ ...f, case_id: 'P-11' }), ctx()).fiche, 'P-11');                       // fiche approuvée, commune ⊂ Paris : rappel attribué
});
t('aucune AUTRE fiche n’est modifiée : une mesure territoriale rattachée à P-10 ne touche pas la fiche approuvée P-11', () => {
  const d = destinationsDe(fait({ case_id: 'P-10', nature: 'mesure', portee: 'territoire', territoire: 'Paris' }), ctx()); assert.notEqual(d.fiche, 'P-11');
});

console.log('\n  PORTÉE NÉGATIVE — la source décide, jamais la proximité départementale');
const dep = new Map([['lyon', 'Rhône'], ['villeurbanne', 'Rhône'], ['bordeaux', 'Gironde'], ['cenon', 'Gironde'], ['paris', 'Paris']]);
t('Villeurbanne n’est ni dans Paris, ni en Gironde, ni dans les Hautes-Alpes ; Lyon non plus', () => {
  for (const z of [{ ville: 'paris' }, { departement: 'Gironde' }, { departement: 'Hautes-Alpes' }]) { assert.equal(territoireDansHub('Villeurbanne', z, dep), false); assert.equal(territoireDansHub('Lyon', z, dep), false); }
});
t('Paris et Paris 11e ⊂ Hub Paris ; Bordeaux ⊂ Gironde (commune connue) ; inconnu → échec fermé', () => {
  assert.equal(territoireDansHub('Paris', { ville: 'paris' }, dep), true); assert.equal(territoireDansHub('Paris 11e', { ville: 'paris' }, dep), true);
  assert.equal(territoireDansHub('Bordeaux', { departement: 'Gironde' }, dep), true); assert.equal(territoireDansHub('Commune-Inconnue', { departement: 'Gironde' }, dep), false);
});
t('une mesure municipale de Villeurbanne n’apparaît NI à Lyon NI dans un Hub existant NI sur une affaire sans lien démontré', () => {
  const c = ctx({ publiques: new Set(['P-11', 'G-1', 'R-1', 'L-1']), approuvees: new Set(['G-1', 'L-1', 'R-1']) });
  const mesure = (case_id) => fait({ case_id, nature: 'mesure', portee: 'territoire', territoire: 'Villeurbanne', acteur: 'Ville de Villeurbanne' });
  assert.deepEqual(destinationsDe(mesure('L-1'), c), { fiche: null, hubs: [], bloques: [] });      // affaire de Lyon : commune ∉ Villeurbanne
  assert.deepEqual(destinationsDe(mesure('G-1'), c), { fiche: null, hubs: [], bloques: [] });      // affaire de Gironde : aucun lien démontré
  assert.equal(destinationsDe(mesure('R-1'), c).fiche, 'R-1');                                      // affaire de Villeurbanne approuvée : rappel attribué
  assert.deepEqual(destinationsDe(mesure('R-1'), c).hubs, []);                                      // aucun Hub ne couvre Villeurbanne : aucune page créée
});
t('communeDansTerritoire : Paris ⊃ Paris 10e ; Lyon ⊅ Cenon ; le département nommé par la source contient ses communes', () => {
  assert.equal(communeDansTerritoire('Paris 10e', 'Paris'), true); assert.equal(communeDansTerritoire('Cenon', 'Lyon', 'Gironde'), false); assert.equal(communeDansTerritoire('Cenon', 'Gironde', 'Gironde'), true);
});

console.log('\n  BLOCAGE EXPLICITE — jamais une insertion forcée');
t('aucun bloc existant approprié (mobilisation dans un Hub sans bloc « familles ») → blocage nommé, rien d’ajouté', () => {
  const d = destinationsDe(fait({ case_id: 'G-1' }), ctx({ approuvees: new Set() })); assert.deepEqual(d.hubs, []); assert.match(d.bloques[0], /bordeaux-gironde.*aucun bloc existant/);
});

console.log('\n  PROJECTION — une seule information, pas de fuite, rejeu identique');
t('seules les informations avec destination sont projetées ; pas de citation, pas d’identifiant interne ; triées ; stables', () => {
  const faits = [fait({ id: 'b', case_id: 'P-11' }), fait({ id: 'a', case_id: 'CANDIDATE' }), fait({ id: 'c', case_id: 'ISO' })];
  const r1 = construireMatiere(faits, ctx()), r2 = construireMatiere([...faits].reverse(), ctx());
  assert.deepEqual(r1.matiere.map((m) => m.id), ['b', 'c']); assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  for (const m of r1.matiere) { assert.ok(!('citation' in m) && !('proposal_id' in m)); assert.deepEqual(Object.keys(m).sort(), ['acteur', 'case_id', 'date', 'destinations', 'etablissement', 'event_id', 'id', 'libelle', 'nature', 'periode', 'portee', 'realisation', 'source', 'territoire']); }
});
t('une information territoriale ne porte pas d’établissement (jamais présentée comme propre à une école)', () => {
  const m = construireMatiere([fait({ case_id: 'P-10', nature: 'mesure', portee: 'territoire', territoire: 'Paris' })], ctx()).matiere[0]; assert.ok(!('etablissement' in m) || m.etablissement === undefined);
});

console.log('\n  RACCORDEMENT — pages et chaîne existantes, rien de nouveau');
t('project-evenements : la projection existante porte la matière ; sorties fiches ET hubs ; blocage notifié UNE fois', () => {
  const s = src('scripts/project-evenements.mjs');
  assert.ok(s.includes('construireMatiere') && s.includes('matiere }') && s.includes('hubs=') && s.includes('prevenirUneFois'));
  assert.ok(s.includes("select e.case_id, e.event_id::text event_id"), 'case_events toujours projetés comme avant');
});
t('pages : la matière s’ajoute AUX blocs existants (Paroles et réactions ; réponses d’un Hub) ; aucune rubrique créée ; introduction/angle intouchés', () => {
  const h = src('web/src/lib/hub-matiere.ts'); const f = src('web/src/lib/fiche.ts');
  assert.ok(h.includes('m.reponses.map((g: any) => ({ ...g, items: [...g.items,') && !h.includes('titre: '), 'ajout dans un groupe existant, jamais un nouveau groupe');
  assert.ok(f.includes('reactions: [...(d?.reactions ?? []), ...cartes]') && f.includes('dejaCartes'));
  assert.ok(!src('web/src/components/FicheUnique.astro').includes('Contexte territorial'), 'template V1 : aucun bloc ajouté');
});
t('une fiche déjà approuvée ne demande AUCUNE nouvelle approbation : l’empreinte porte sur le dossier éditorial, pas sur la matière projetée', () => {
  const p = src('scripts/lib/fiche-page.mjs');
  const h = p.slice(p.indexOf('export function hashDossier'), p.indexOf('/** Revue d'));                  // l'empreinte ne dépend que du dossier passé en argument
  assert.ok(h.includes('hashDossier(d)') && !/evenements|matiere/.test(h));
  assert.ok(p.includes('hashDossier(dossier.d) === h'), 'approbation = empreinte du dossier éditorial seul');
});
t('vérification du site : fiches ET Hubs (data-matiere + libellé présent) ; Telegram nomme les pages ; mêmes workflows (aucun scheduler)', () => {
  const v = src('scripts/verifier-site.mjs');
  assert.ok(v.includes('--hubs') && v.includes('data-matiere') && v.includes('absente de la page servie') && v.includes('Hub ${h}'));
  for (const w of ['sny-clics', 'sny-telegram']) { const y = src(`.github/workflows/${w}.yml`); assert.ok(y.includes('--hubs $HUBS') && y.includes('steps.evenements.outputs.hubs')); }
});
t('Telegram : le blocage est signalé précisément (« Information validée NON intégrée »), la validation est conservée', () => {
  assert.ok(src('scripts/project-evenements.mjs').includes('Information validée NON intégrée') && src('scripts/project-evenements.mjs').includes('Elle reste conservée en mémoire'));
});

console.log('\n  RÉCUPÉRABLE — la matière territoriale validée ne dépend pas de l’état public de l’affaire support');
t('une information territoriale validée reste LISIBLE (mémoire) quand l’affaire support est candidate, retirée ou sous HOLD ; elle n’est exposée sur aucune page', async () => {
  const { lireMatiereValidee } = await import('../lib/matiere-validee.mjs');
  const fait0 = fait({ nature: 'mesure', portee: 'territoire', territoire: 'Paris', acteur: 'Ville de Paris', date: null, periode: '2025-11' });
  for (const support of ['CANDIDATE', 'P-HOLD', 'RETIREE']) {
    const sql = async () => [{ proposal_id: 'p', case_id: support, applied_event_id: null, fait: { nature: 'mesure', portee: 'territoire', territoire: 'Paris', acteur_nomme: 'Ville de Paris', event_period: '2025-11', libelle_public: fait0.libelle, mesure: 'plan_formation', evidence: ['citation privée'] }, commune: 'Paris 10e', departement: 'Paris', media: 'M', url: 'https://m.example/a', publie_le: '2026-03-21' }];
    const lus = await lireMatiereValidee(sql, { departement: 'Paris' });
    assert.equal(lus.length, 1); assert.equal(lus[0].periode, '2025-11');                                   // récupérable pour un futur Hub / diagnostic
    assert.deepEqual(destinationsDe({ ...fait0, case_id: support }, ctx()), { fiche: null, hubs: [], bloques: [] });   // mais jamais exposée via une affaire non publique
  }
});
t('la lecture ne filtre ni sur publication_status ni sur applied_at ; l’application d’une portée territoire n’écrit RIEN (la décision ACCEPT et le fait restent la mémoire)', () => {
  const r = src('scripts/lib/matiere-validee.mjs');
  assert.ok(r.includes("p.decision = 'ACCEPT'") && !/publication_status|applied_at|applied_event_id is/.test(r.slice(r.indexOf('export async function lireMatiereValidee'), r.indexOf('const items'))));
  const a = src('scripts/appliquer-decisions.mjs'); const bloc = a.slice(a.indexOf("if (p.rat === 'OK' && structures.length && !insts.length)"), a.indexOf('if (insts.length)'));
  assert.ok(bloc.includes('continue;') && !/insert|update/i.test(bloc), 'portée territoriale : aucune écriture à l’application');
});
t('l’affaire support devenue publique plus tard : la même information apparaît alors (destinations recalculées), sans nouvelle validation', () => {
  const f1 = fait({ case_id: 'LATE', nature: 'mesure', portee: 'territoire', territoire: 'Paris', acteur: 'Ville de Paris' });
  const avant = ctx(), apres = ctx({ publiques: new Set([...avant.publiques, 'LATE']), cases: new Map([...avant.cases, ['LATE', { commune: 'Paris 10e', departement: 'Paris', etablissement: 'École L' }]]) });
  assert.deepEqual(destinationsDe(f1, avant).hubs, []); assert.equal(destinationsDe(f1, apres).hubs.length, 1);
});

console.log(`\n  ${n} contrôles : OK\n`);
