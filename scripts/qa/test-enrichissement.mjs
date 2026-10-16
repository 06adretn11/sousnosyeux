#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-enrichissement.mjs — de l'ARTICLE à l'enrichissement multi-surfaces : on compare des FAITS, une information est
// extraite, validée et stockée UNE fois, puis lue par la fiche ET le Hub selon sa portée.
// Trois verticales (états identiques / mobilisation / mesure territoriale à date relative) + témoins. Données SYNTHÉTIQUES (dépôt public).
// Aucun réseau, aucune base, aucun modèle.
// =====================================================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extraireReactions, dateEcrite, planReactions } from '../lib/evenement-institutionnel.mjs';
import { dejaConnu, categorieNouveaute } from '../lib/nouveaute.mjs';
import { lireMatiereValidee, matierePourFiche, surfacesDe } from '../lib/matiere-validee.mjs';
import { messageEnrichissement } from '../lib/discovery-messages.mjs';

let n = 0; const t = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const ECOLE = 'École maternelle Les Tilleuls';
const AUTRE = 'École élémentaire Les Chênes';

console.log('\n  VERTICALE A — un état identique et un fait déjà connu ne produisent aucune décision');
// Mémoire de l'affaire (jugée) : relaxe le 07/07, appel du parquet le 08/07, rassemblement de parents le 09/07.
const MEMOIRE = [
  { event_type: 'décision', event_date: '2026-07-07', libelle_public: 'Relaxe prononcée.' },
  { event_type: 'voie_de_recours', event_date: '2026-07-08', libelle_public: 'Appel du parquet.' },
  { event_type: 'mobilisation', event_date: '2026-07-09', libelle_public: 'Rassemblement de parents devant l’école.' },
];
await t('« relaxe → relaxe » avec un rappel d’appel déjà consigné : fait connu, aucun clic (NO_ACTION)', () => {
  const fait = { event_type: 'voie_de_recours', event_date: null };           // l'article du 10/07 rappelle l'appel, sans date
  assert.equal(dejaConnu(fait, MEMOIRE, { pubDate: '2026-07-10' }), true);
  const c = categorieNouveaute({ statutAvant: 'relaxe / non-lieu / classement', statutPropose: 'relaxe / non-lieu / classement', faitJudiciaireConnu: true });
  assert.deepEqual(c, { categorie: 'NO_ACTION', clic: false });
});
await t('même état avant/après : jamais STATE_CHANGE, même si le fait n’est pas connu', () =>
  assert.equal(categorieNouveaute({ statutAvant: 'enquête', statutPropose: 'enquête', faitJudiciaireConnu: false }).categorie, 'NO_ACTION'));
await t('un état réellement différent ET un fait nouveau → STATE_CHANGE (clic)', () =>
  assert.deepEqual(categorieNouveaute({ statutAvant: 'enquête', statutPropose: 'mise en examen' }), { categorie: 'STATE_CHANGE', clic: true }));
await t('rappel d’un fait ANCIEN daté d’un autre jour → pas « connu » : un second événement distinct reste possible', () =>
  assert.equal(dejaConnu({ event_type: 'voie_de_recours', event_date: '2026-09-01' }, MEMOIRE, { pubDate: '2026-09-02' }), false));
await t('type absent de la mémoire → jamais « connu » (rien n’est effacé par défaut)', () =>
  assert.equal(dejaConnu({ event_type: 'audience', event_date: null }, MEMOIRE, { pubDate: '2026-07-10' }), false));
await t('la mobilisation déjà consignée (même type, jour proche) n’est pas reproposée : nouvelle SOURCE ≠ nouveau FAIT', () => {
  const rx = extraireReactions('Jeudi 9 juillet, des parents se sont rassemblés devant l’école maternelle Les Tilleuls pour contester la relaxe.', { etablissement: ECOLE, anneeRef: '2026-07-10' });
  assert.equal(rx.length, 1);
  assert.equal(rx.filter((x) => !dejaConnu(x, MEMOIRE, { pubDate: '2026-07-10' })).length, 0);
  assert.deepEqual(categorieNouveaute({ statutAvant: 'x', statutPropose: null, reactionsNouvelles: [], sourceNouvelle: true }), { categorie: 'SOURCE_ONLY', clic: false });
});
await t('article sans nouveauté → NO_ACTION, aucun clic', () => assert.equal(categorieNouveaute({ statutAvant: 'x', statutPropose: null }).clic, false));
await t('garde dans le cycle : « ETAT_IDENTIQUE » et « FAIT_DEJA_CONNU » branchés avant toute persistance', () => {
  const s = src('scripts/maintenance-cycle.mjs');
  assert.ok(s.includes('out.statut_propose === fiche.statut_judiciaire') && s.includes('FAIT_DEJA_CONNU') && s.includes("out._action_modele = 'NO_CHANGE'"));
});

console.log('\n  VERTICALE B — une mobilisation nouvelle, validable et conservable');
const SOY = `Une centaine d'enseignants et de parents d'élèves se sont réunis ce jeudi dans la cour de l'école maternelle Les Tilleuls. © Radio Test - Prénom Nom Ils ont demandé de la transparence après l'interpellation de l'instituteur.`;
const rxB = extraireReactions(`Parents et enseignants rassemblés à l'école - ICI\n${SOY}`, { etablissement: ECOLE, anneeRef: '2026-10-15', autres: [AUTRE] });
const mob = rxB[0];
await t('mobilisation détectée : nature, acteurs collectifs, date établie (« ce jeudi » + date de publication), établissement, réalisée', () => {
  assert.equal(rxB.length, 1); assert.equal(mob.event_type, 'mobilisation'); assert.deepEqual([...mob.acteurs].sort(), ['enseignants', 'parents']);
  assert.equal(mob.event_date, '2026-10-15'); assert.equal(mob.portee, 'établissement'); assert.equal(mob.realisation, 'réalisée');
});
await t('le titre et la phrase du corps = UN SEUL rassemblement (pas de duplication), la phrase qui nomme l’établissement fait foi', () => {
  assert.equal(rxB.length, 1); assert.match(mob.evidence[0], /cour de l'école maternelle Les Tilleuls/);
});
await t('libellé public FERMÉ : aucune parole de parent, aucun nom, aucun crédit photo dans les citations', () => {
  assert.match(mob.libelle_public, /^Selon la presse, des parents et des enseignants ont tenu un rassemblement\.$/);
  assert.ok(!/©|Prénom|Radio Test/.test(JSON.stringify(mob.evidence)));
});
await t('nouveauté : CASE_ENRICHMENT → un clic', () => assert.deepEqual(categorieNouveaute({ statutAvant: 'mise en examen', statutPropose: null, reactionsNouvelles: rxB }), { categorie: 'CASE_ENRICHMENT', clic: true }));
await t('message « ENRICHISSEMENT PROPOSÉ » : nouveau, qui/quand, source, portée, utilisation, décision — sans promesse de mise à jour publique', () => {
  const m = messageEnrichissement({ etablissement: ECOLE, commune: 'Ville-Test', courant: 'mise en examen', media: 'ICI', publication_date: '2026-10-15', url: 'https://media.example/article' }, rxB, false);
  for (const s of ['ENRICHISSEMENT PROPOSÉ', 'Ce qui est nouveau', 'Qui / quand', '15/10/2026', 'Source', 'https://media.example/article', 'Portée', 'établissement', 'Utilisation possible', 'fiche individuelle', 'Hub', 'VALIDATE', 'REVIEW', 'REJECT']) assert.ok(m.includes(s), s);
  assert.match(m, /aucune mise à jour publique immédiate/);
});
await t('mémoire persistable puis RÉCUPÉRABLE par une future fiche et un Hub (affaire sans fiche individuelle incluse), sans ressaisie', async () => {
  const fait = { ...mob, libelle_public: mob.libelle_public };
  const sql = fakeSql([{ proposal_id: 'p1', case_id: 'FR-2026-9001', applied_event_id: 'e1', fait, commune: 'Ville-Test', departement: 'Test', media: 'ICI', url: 'https://media.example/article', publie_le: '2026-10-15' }]);
  const pourFiche = await matierePourFiche(sql, { case_id: 'FR-2026-9001', departement: 'Test' });
  assert.equal(pourFiche.propres.length, 1); assert.equal(pourFiche.propres[0].source.url, 'https://media.example/article'); assert.equal(pourFiche.propres[0].citation, mob.evidence[0]);
  const pourHub = await lireMatiereValidee(sql, { commune: 'Ville-Test' });
  assert.equal(pourHub.length, 1); assert.equal(pourHub[0].proposal_id, pourFiche.propres[0].proposal_id);   // LA MÊME information, lue deux fois
  assert.match(surfacesDe(pourHub[0]).fiche, /détail de l’affaire/); assert.match(surfacesDe(pourHub[0]).hub, /synthèse/);
});

console.log('\n  VERTICALE C — une mesure territoriale, datée sans être inventée, jamais attribuée à l’école');
const JDD = `En novembre dernier, la Ville de Paris a annoncé la mise en place d'un plan de lutte contre les violences sexistes et sexuelles dans les écoles, comprenant notamment un renforcement de la formation des animateurs.`;
const rxC = extraireReactions(`À l'école Les Tilleuls, un professeur a été interpellé. ${JDD}`, { etablissement: ECOLE, anneeRef: '2026-03-21' });
await t('« en novembre dernier » dans un article de MARS 2026 → novembre 2025 (jamais novembre 2026) ; le jour n’est pas inventé', () => {
  assert.equal(rxC.length, 1); assert.equal(rxC[0].event_period, '2025-11'); assert.equal(rxC[0].event_date, null);
});
await t('acteur NOMMÉ et territoire tels qu’écrits ; mesure annoncée ; portée TERRITOIRE (aucune attribution à l’école)', () => {
  assert.equal(rxC[0].acteur_nomme, 'Ville de Paris'); assert.equal(rxC[0].territoire, 'Paris'); assert.equal(rxC[0].realisation, 'annoncée'); assert.equal(rxC[0].portee, 'territoire');
  const m = messageEnrichissement({ etablissement: ECOLE, commune: 'Paris 10e', courant: 'enquête', media: 'JDD', publication_date: '2026-03-21', url: 'https://media.example/jdd' }, rxC, true);
  assert.match(m, /Territoire : Paris/); assert.match(m, /non propre à cet établissement/); assert.match(m, /novembre 2025/); assert.ok(!/<b>École maternelle Les Tilleuls<\/b>/.test(m));
});
await t('dates relatives : « prochain » = futur ; sans date de publication = rien (jamais deviné) ; jour de semaine relatif à la publication', () => {
  assert.equal(dateEcrite('en novembre prochain', '2026-03-21').periode, '2026-11');
  assert.deepEqual(dateEcrite('en novembre dernier', null), { date: null, periode: null });
  assert.deepEqual(dateEcrite('en novembre dernier', '2026'), { date: null, periode: null });
  assert.equal(dateEcrite('ce jeudi', '2026-10-15').date, '2026-10-15'); assert.equal(dateEcrite('mardi dernier', '2026-10-15').date, '2026-10-13');
  assert.equal(dateEcrite('le 12 novembre', '2026-03-21').date, '2025-11-12');
});
await t('une mesure territoriale : UNE information ; la fiche de l’affaire d’origine en reçoit le rappel attribué, une AUTRE affaire du même territoire n’est PAS modifiée ; le Hub la lit', async () => {
  const fait = { ...rxC[0] };
  const sql = fakeSql([{ proposal_id: 'p2', case_id: 'FR-2026-9002', applied_event_id: null, fait, commune: 'Paris 10e', departement: 'Paris', media: 'JDD', url: 'https://media.example/jdd', publie_le: '2026-03-21' }]);
  const origine = await matierePourFiche(sql, { case_id: 'FR-2026-9002', departement: 'Paris' });
  assert.equal(origine.propres.length, 0); assert.equal(origine.rappelTerritorial.length, 1); assert.equal(origine.rappelTerritorial[0].portee, 'territoire');
  assert.match(surfacesDe(origine.rappelTerritorial[0]).fiche, /non propre à cet établissement/); assert.match(surfacesDe(origine.rappelTerritorial[0]).hub, /matière du territoire/);
  const autre = await matierePourFiche(sql, { case_id: 'FR-2026-9003', departement: 'Paris' });          // une AUTRE affaire de Paris : jamais modifiée « arbitrairement »
  assert.equal(autre.propres.length + autre.rappelTerritorial.length, 0);
  const hub = await lireMatiereValidee(sql, { departement: 'Paris' });                                    // un Hub : le même fait
  assert.equal(hub.length, 1); assert.equal(hub[0].periode, '2025-11'); assert.equal(hub[0].acteur, 'Ville de Paris'); assert.match(hub[0].id, /^[0-9a-f]{12}$/);
});
await t('territoire SANS Hub : l’information reste lisible pour un futur diagnostic, aucun Hub créé', async () => {
  const sql = fakeSql([{ proposal_id: 'p3', case_id: 'FR-2026-9004', fait: { ...rxC[0], territoire: 'Ville-Sans-Hub' }, commune: 'Ville-Sans-Hub', departement: 'Test', applied_event_id: null }]);
  assert.equal((await lireMatiereValidee(sql, { commune: 'Ville-Sans-Hub' })).length, 1);
  assert.ok(!src('scripts/lib/matiere-validee.mjs').includes('insert into'), 'lecture seule : aucune écriture');
});

console.log('\n  TÉMOINS');
await t('réaction nouvelle sur une affaire déjà JUGÉE → CASE_ENRICHMENT (l’état « condamnation » ne change pas)', () => {
  const rx = extraireReactions('Des parents se sont réunis devant l’école maternelle Les Tilleuls après le jugement.', { etablissement: ECOLE, anneeRef: '2026-09-02' });
  assert.equal(categorieNouveaute({ statutAvant: 'condamnation non définitive', statutPropose: null, reactionsNouvelles: rx }).categorie, 'CASE_ENRICHMENT');
});
await t('article multi-affaires : une phrase qui nomme deux établissements n’est PAS rattachée à un seul (portée territoire)', () => {
  const rx = extraireReactions(`Des parents des écoles Les Tilleuls et Les Chênes se sont rassemblés hier devant la mairie.`, { etablissement: ECOLE, anneeRef: '2026-10-15', autres: [AUTRE] });
  assert.equal(rx[0].portee, 'territoire');
});
await t('déclaration ANNONCÉE mais non réalisée → « annoncée » (jamais « réalisée »)', () => {
  const rx = extraireReactions('Les parents annoncent un rassemblement samedi devant l’école maternelle Les Tilleuls.', { etablissement: ECOLE, anneeRef: '2026-10-15' });
  assert.equal(rx[0].realisation, 'annoncée'); assert.match(rx[0].libelle_public, /ont annoncé un rassemblement/);
});
await t('deux sources sur une MÊME mobilisation : un seul fait ; une fois validée, la seconde source ne reproduit pas la demande', () => {
  const a = extraireReactions('Des parents se sont rassemblés ce jeudi devant l’école maternelle Les Tilleuls.', { etablissement: ECOLE, anneeRef: '2026-10-15' })[0];
  const b = extraireReactions('Une soixantaine de parents se sont réunis jeudi devant l’école maternelle Les Tilleuls.', { etablissement: ECOLE, anneeRef: '2026-10-16' })[0];
  assert.equal(a.libelle_public, b.libelle_public);
  const memoire = [{ event_type: 'mobilisation', event_date: a.event_date, libelle_public: a.libelle_public }];
  assert.equal(dejaConnu(b, memoire, { pubDate: '2026-10-16' }), true);
});
await t('proposition déjà validée : les libellés validés ne sont jamais redemandés (planReactions)', () => {
  const p = planReactions(rxB, new Set(rxB.map((x) => x.libelle_public))); assert.equal(p.neufs.length, 0);
});
await t('aucune date inventée : sans indication de date, event_date ET event_period restent null', () => {
  const rx = extraireReactions('Des parents se sont rassemblés devant l’école maternelle Les Tilleuls pour demander des explications.', { etablissement: ECOLE, anneeRef: null });
  assert.equal(rx[0].event_date, null); assert.equal(rx[0].event_period, null);
});
await t('rejeu idempotent', () => assert.deepEqual(extraireReactions(`Parents et enseignants rassemblés à l'école - ICI\n${SOY}`, { etablissement: ECOLE, anneeRef: '2026-10-15', autres: [AUTRE] }), rxB));
await t('Telegram : une information déjà consignée/validée ou déjà soumise, ou une source seule, ne produit AUCUN message ; une portée territoire a ses boutons', () => {
  const s = src('scripts/telegram-v0.mjs');
  assert.ok(s.includes('aucune information nouvelle à décider (source seule) : aucun message') && s.includes('même information déjà soumise à décision') && s.includes("q.decision = 'ACCEPT'"));
  assert.ok(s.includes('messageEnrichissement(p, neufs, !propres.length), boutonsEtat(cle)'));
});
await t('application : une portée territoire n’est jamais écrite comme événement de l’affaire ; mobilisation/mesure d’établissement → case_events (projetée par project-evenements)', () => {
  const a = src('scripts/appliquer-decisions.mjs');
  assert.ok(a.includes("x.portee !== 'territoire'") && a.includes('insert into case_events'));
  assert.ok(src('scripts/project-evenements.mjs').includes("e.event_type::text <> 'rectification'"), 'les événements validés (mobilisation incluse) sont projetés vers fiche et Hub');
});

await t('DEUX mobilisations distinctes (jours différents) d’une même affaire : deux faits dans un article, jamais fusionnées ni tenues pour « connues » entre articles', async () => {
  const rx = extraireReactions('Des parents se sont rassemblés le 9 juillet devant l’école maternelle Les Tilleuls. Des parents se sont de nouveau rassemblés le 20 juillet devant l’école maternelle Les Tilleuls.', { etablissement: ECOLE, anneeRef: '2026-07-21' });
  assert.deepEqual(rx.map((x) => x.event_date), ['2026-07-09', '2026-07-20']); assert.equal(rx[0].libelle_public, rx[1].libelle_public);       // même libellé FERMÉ, deux faits
  const memoire = [{ event_type: 'mobilisation', event_date: '2026-07-09', libelle_public: rx[0].libelle_public }];
  assert.equal(dejaConnu(rx[0], memoire, { pubDate: '2026-07-21' }), true); assert.equal(dejaConnu(rx[1], memoire, { pubDate: '2026-07-21' }), false);
  assert.deepEqual(planReactions(rx, memoire).neufs.map((x) => x.event_date), ['2026-07-20']);
  const sql = fakeSql([{ proposal_id: 'a', case_id: 'FR-2026-9001', applied_event_id: 'e1', fait: rx[0], commune: 'V', departement: 'T' }, { proposal_id: 'b', case_id: 'FR-2026-9001', applied_event_id: 'e2', fait: rx[1], commune: 'V', departement: 'T' }]);
  const lus = await lireMatiereValidee(sql, { case_id: 'FR-2026-9001' });
  assert.equal(lus.length, 2);                                                                                                        // mémoire : deux faits distincts
});
await t('UNE mobilisation reprise par deux sources : un seul fait (article, mémoire validée, lecteur) — même jour, même libellé', async () => {
  const a = extraireReactions('Des parents se sont rassemblés ce jeudi devant l’école maternelle Les Tilleuls.', { etablissement: ECOLE, anneeRef: '2026-10-15' })[0];
  const b = extraireReactions('Une soixantaine de parents se sont réunis jeudi devant l’école maternelle Les Tilleuls.', { etablissement: ECOLE, anneeRef: '2026-10-16' })[0];
  assert.equal(a.event_date, '2026-10-15'); assert.equal(b.event_date, '2026-10-15'); assert.equal(a.libelle_public, b.libelle_public);
  assert.equal(dejaConnu(b, [{ event_type: 'mobilisation', event_date: a.event_date, libelle_public: a.libelle_public }], { pubDate: '2026-10-16' }), true);
  const sql = fakeSql([{ proposal_id: 'a', case_id: 'FR-2026-9001', applied_event_id: 'e1', fait: a, commune: 'V', departement: 'T' }, { proposal_id: 'b', case_id: 'FR-2026-9001', applied_event_id: null, fait: b, commune: 'V', departement: 'T' }]);
  assert.equal((await lireMatiereValidee(sql, { case_id: 'FR-2026-9001' })).length, 1);
});
await t('mobilisation d’un jour sans date reprise sans date : un seul fait ; une mesure annoncée puis rappelée sans date reste un seul fait (libellé)', () => {
  const m = { event_type: 'réponse_institutionnelle', event_date: null, event_period: null, libelle_public: 'Selon la presse, la collectivité a annoncé un plan de formation de ses agents au contact des enfants.' };
  assert.equal(dejaConnu(m, [{ event_type: 'réponse_institutionnelle', event_date: null, libelle_public: m.libelle_public }]), true);
});

console.log(`\n  ${n} contrôles : OK\n`);

/** Faux client SQL (gabarit étiqueté) : renvoie des lignes de state_proposals ACCEPT déjà jointes. */
function fakeSql(lignes) { return async () => lignes.map((l) => ({ ...l, fait: l.fait })); }
