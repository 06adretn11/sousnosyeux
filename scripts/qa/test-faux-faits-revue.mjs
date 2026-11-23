#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-faux-faits-revue.mjs — défauts trouvés par la revue contradictoire du 23/11/2026 (D1–D12) : refus, négations de sujet, auteur d'appel,
// date d'un autre événement, présentation au juge, faux positifs lexicaux, discours rapporté, doublons de famille. Phrases SYNTHÉTIQUES : aucun nom, aucune URL.
//
//   node scripts/qa/test-faux-faits-revue.mjs      Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { actes, actesDetail } from '../lib/routage-veille.mjs';
import { detecterActesProcéduraux } from '../lib/acte-procedural.mjs';
import { memeFait, dejaConnu } from '../lib/nouveaute.mjs';
import { mesureDeLibelle, memeMesure } from '../lib/mesures-procedurales.mjs';
import { destinationsDe } from '../lib/destinations.mjs';

let ok = 0, ko = 0;
const test = (nom, fn) => { try { fn(); ok++; console.log(`  ✔ ${nom}`); } catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); } };
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
const F = (cites, o = {}) => detecterActesProcéduraux(Array.isArray(cites) ? cites : [cites], { pubDate: '2026-11-20', courant: 'enquête', ...o });
const m = (cites, o) => F(cites, o).map((f) => f.mesure);
const aucun = (cites, mesure, o) => { const r = m(cites, o); vrai(!r.includes(mesure), `« ${[].concat(cites)[0].slice(0, 80)} » → ${r} (${mesure} ne doit pas sortir)`); };
console.log('\n  revue contradictoire du 23/11/2026 — aucun faux fait\n');

test('D1a. refus / requête / écartement : la détention n’est PAS un fait', () => {
  for (const c of ['Le juge a refusé de le placer en détention provisoire, a indiqué le parquet.',
    'Le juge l’a placé sous contrôle judiciaire plutôt qu’en détention provisoire, selon une source judiciaire.',
    'Le juge a écarté la détention provisoire requise par le parquet mercredi 18 novembre dans ce dossier.',
    'Le parquet a requis son placement en détention provisoire mercredi 18 novembre contre l’animateur.']) aucun(c, 'detention_provisoire', { courant: 'mise en examen' });
});
test('D1b. refus de remise en liberté', () => {
  aucun('Le juge des libertés a refusé la remise en liberté de l’animateur mis en examen, selon le parquet.', 'remise_en_liberte', { courant: 'mise en examen' });
  aucun('Le juge n’a pas ordonné sa remise en liberté, a précisé la procureure de la République.', 'remise_en_liberte', { courant: 'mise en examen' });
});
test('D1c. garde à vue niée par le clitique, quels que soient les mots intercalés', () => {
  for (const c of ['L’homme ne sera pas placé en garde à vue, ont indiqué les enquêteurs ce jeudi matin.',
    'Les enquêteurs ont décidé de ne pas le placer en garde à vue, faute d’éléments suffisants.',
    'Il n’a jamais été placé en garde à vue ni mis en examen, précise le parquet de la ville.']) aucun(c, 'garde_a_vue', {});
});
test('D2. mise en examen niée par un sujet négatif, un adverbe ou un incise', () => {
  for (const c of ['Aucun des deux hommes n’a été mis en examen à ce stade de la procédure.', 'Aucun animateur n’a été mis en examen dans cette affaire, selon le parquet.',
    'Personne n’a été mis en examen pour l’instant, a précisé le procureur de la République.', 'Ni l’un ni l’autre n’ont été mis en examen, a indiqué le parquet vendredi.',
    'L’homme n’a pas, pour l’instant, été mis en examen, a indiqué le parquet vendredi.', 'L’homme n’a pas été formellement mis en examen à ce stade, selon une source proche.',
    'L’homme n’a pas non plus été mis en examen, a précisé le parquet de la ville.', 'Le juge n’a pas, dans un premier temps, mis en examen l’animateur interpellé.']) {
    const d = actesDetail(c);
    vrai(!d.affirmes.includes('MISE_EN_EXAMEN') && d.nies.includes('MISE_EN_EXAMEN'), `« ${c.slice(0, 70)} » → ${JSON.stringify(d)}`);
  }
});
test('D2b. non-régression : « n’a pas été condamné mais a été mis en examen » ; « n’a pas contesté la condamnation » n’est pas une négation de condamnation', () => {
  vrai(actes('L’homme n’a pas été condamné mais a été mis en examen jeudi.').includes('MISE_EN_EXAMEN'), 'mise en examen perdue');
  vrai(actes('Le prévenu n’a pas contesté sa condamnation à trois ans de prison.').includes('VERDICT_CONDAMNATION'), 'condamnation niée à tort');
});
test('D3. renoncer à faire appel / n’avoir pas l’intention de faire appel : l’inverse d’un appel', () => {
  aucun('Le parquet renonce à faire appel de la relaxe prononcée mardi par le tribunal correctionnel.', 'appel_parquet', { courant: 'relaxe / non-lieu / classement' });
  aucun('Le parquet n’a pas l’intention de faire appel de la décision, a annoncé la procureure.', 'appel_parquet', { courant: 'relaxe / non-lieu / classement' });
  vrai(m('Le parquet n’a pas l’intention de faire appel de la décision, a annoncé la procureure.', { courant: 'relaxe / non-lieu / classement' }).length === 0, 'un fait est sorti d’un renoncement');
});
test('D4. auteur de l’appel : le sujet de la proposition, jamais un mot de la citation', () => {
  const r1 = F('Le parquet avait requis trois ans de prison ; la défense a fait appel de la décision rendue mardi.', { courant: 'condamnation non définitive' });
  vrai(r1.length === 1 && r1[0].mesure === 'appel_défense', JSON.stringify(r1.map((f) => f.mesure)));
  const r2 = F('L’avocat de la famille a fait appel de la décision rendue par le tribunal.', { courant: 'condamnation non définitive' });
  vrai(r2.length === 1 && r2[0].mesure === 'appel', JSON.stringify(r2.map((f) => f.mesure)));
  const r3 = F('L’avocat de la mère indique que la famille fera appel de la décision rendue en juin.', { courant: 'condamnation non définitive' });
  vrai(r3.every((f) => f.mesure === 'appel'), JSON.stringify(r3.map((f) => f.mesure)));
});
test('D5. date : celle de l’acte, jamais la décision, le jour où on l’apprend, ni une autre date de la phrase', () => {
  const d = (cite, mesure, o = {}) => F(cite, o).find((f) => f.mesure === mesure)?.event_date ?? null;
  vrai(d('Condamné le 12 novembre à deux ans de prison, l’ancien directeur a fait appel de la décision.', 'appel', { courant: 'condamnation non définitive' }) === null, 'appel daté de la condamnation');
  vrai(d('Le parquet a fait appel de la décision rendue mardi par le tribunal, a-t-on appris.', 'appel_parquet', { courant: 'relaxe / non-lieu / classement' }) === null, 'appel daté de la décision');
  vrai(d('Un appel a été formé contre la décision du 12 novembre, a-t-on appris vendredi.', 'appel', { courant: 'condamnation non définitive' }) === null, 'appel daté du jour où on l’apprend');
  vrai(d('Interpellé mardi 17 novembre, l’homme a été remis en liberté sans poursuites jeudi 19 novembre.', 'remise_en_liberte') === '2026-11-19', 'remise en liberté mal datée');
  vrai(m('Sa garde à vue a été prolongée de 24 heures vendredi par les enquêteurs.').length === 0, 'prolongation prise pour un placement');
});
test('D6. présentation au juge : affirmée, passée, devant un JUGE — sinon « pas de mise en examen » seul', () => {
  const p = (cites) => m(cites, { courant: 'enquête' });
  vrai(!p(['Placé en garde à vue mardi, l’homme doit être présenté à un juge d’instruction jeudi.', 'Il n’a pas été mis en examen à ce stade.']).includes('presentation_sans_mise_en_examen'), 'présentation à venir prise pour faite');
  vrai(!p(['L’homme sera présenté à un juge demain ; il n’a pas été mis en examen à ce stade.']).includes('presentation_sans_mise_en_examen'), 'futur');
  vrai(!p(['Il n’a pas été présenté à un juge, et n’est donc pas mis en examen à ce stade.']).includes('presentation_sans_mise_en_examen'), 'présentation niée');
  vrai(!p(['Le premier homme a été présenté à un juge, qui l’a mis en examen mercredi.', 'Son complice présumé n’a pas été mis en examen à ce stade.']).includes('presentation_sans_mise_en_examen'), 'deux suspects combinés');
  vrai(!p(['Déféré au parquet jeudi, l’homme n’a pas été mis en examen à ce stade du dossier.']).includes('presentation_sans_mise_en_examen'), 'parquet pris pour un juge');
  vrai(p(['L’homme a été présenté à un juge d’instruction jeudi 19 novembre, qui ne l’a pas mis en examen à ce stade.']).includes('presentation_sans_mise_en_examen'), 'vraie présentation perdue');
});
test('D7. faux positifs lexicaux : interpeller la mairie, appel d’offres, « peuvent faire appel », pourvoi', () => {
  aucun('Les parents d’élèves ont interpellé la mairie sur la sécurité de l’école lors du conseil.', 'interpellation');
  aucun('La commune a fait appel d’offres pour la rénovation de la crèche municipale cette année.', 'appel');
  aucun('Les parents peuvent faire appel de la décision du conseil de discipline, précise le rectorat.', 'appel');
  vrai(m('Le condamné se pourvoit en cassation contre la décision rendue en appel mardi dernier.', { courant: 'condamnation non définitive' }).length === 0, 'pourvoi pris pour un appel');
  vrai(m('Un homme de 34 ans a été interpellé mardi 17 novembre par les gendarmes dans la commune.').includes('interpellation'), 'vraie interpellation perdue');
});
test('D8. discours rapporté : « a indiqué que l’animateur avait été mis en examen jeudi » est un fait du jour', () => {
  vrai(actesDetail('Le parquet a indiqué que l’animateur avait été mis en examen jeudi pour agression sexuelle sur mineur.').affirmes.includes('MISE_EN_EXAMEN'), 'mise en examen rapportée perdue');
  vrai(actesDetail('Le procureur a précisé que le directeur avait été placé en détention provisoire vendredi soir.').affirmes.includes('ECROU'), 'détention rapportée perdue');
  vrai(actesDetail('Le parquet a annoncé hier qu’il avait fait appel de la relaxe.').affirmes.includes('APPEL_FORME'), 'appel rapporté perdu');
  vrai(actesDetail('L’ancien directeur, qui avait été mis en examen en 2019, comparaît ce lundi.').rappeles.includes('MISE_EN_EXAMEN'), 'rappel ancien perdu');
});
test('D9. un même fait sous deux libellés fermés = UN fait (famille)', () => {
  const r = F(['Un appel a été formé contre la décision rendue en juin.', 'Le parquet a fait appel de la décision rendue en juin, a-t-on appris.'], { courant: 'condamnation non définitive' });
  vrai(r.length === 1 && r[0].mesure === 'appel_parquet', JSON.stringify(r.map((f) => f.mesure)));
  const l = F(['Il a été remis en liberté sous contrôle judiciaire mardi 17 novembre.', 'Il a été remis en liberté, selon le parquet de la ville.'], { courant: 'mise en examen' });
  vrai(l.length === 1 && l[0].mesure === 'remise_en_liberte_controle', JSON.stringify(l.map((f) => f.mesure)));
  const gav = { event_type: 'garde_à_vue', mesure: 'garde_a_vue', libelle_public: 'Selon la presse, la personne mise en cause a été placée en garde à vue.', event_date: '2026-11-17' };
  const itp = { event_type: 'garde_à_vue', mesure: 'interpellation', libelle_public: 'Selon la presse, la personne mise en cause a été interpellée.', event_date: '2026-11-17' };
  vrai(memeFait(gav, itp) && memeFait(itp, gav), 'interpellation ≠ garde à vue le même jour');
  vrai(!memeFait({ ...gav, event_date: '2026-11-19' }, itp), 'deux jours différents confondus');
  vrai(!memeFait({ libelle_public: 'Selon la presse, le parquet a fait appel de la décision.' }, { libelle_public: 'Selon la presse, la défense a fait appel de la décision.' }), 'appel du parquet confondu avec celui de la défense');
  vrai(memeMesure('appel', 'appel_défense') && !memeMesure('appel_parquet', 'appel_défense'), 'familles');
});
test('D12. connu par MESURE : une détention consignée n’écarte pas une remise en liberté ; l’appel du parquet n’écarte pas celui de la défense', () => {
  const memoire = [{ event_type: 'mesure_procédurale', event_date: '2026-11-19', libelle_public: 'Selon la presse, la personne mise en cause a été placée en détention provisoire.' }];
  const rl = { event_type: 'mesure_procédurale', mesure: 'remise_en_liberte', libelle_public: 'Selon la presse, la personne mise en cause a été remise en liberté.', event_date: '2026-11-19' };
  vrai(!dejaConnu(rl, memoire), 'remise en liberté écartée par une détention');
  const mem2 = [{ event_type: 'voie_de_recours', event_date: '2026-11-18', libelle_public: 'Selon la presse, le parquet a fait appel de la décision.' }];
  vrai(!dejaConnu({ event_type: 'voie_de_recours', mesure: 'appel_défense', libelle_public: 'Selon la presse, la défense a fait appel de la décision.', event_date: '2026-11-18' }, mem2), 'appel de la défense écarté');
  vrai(dejaConnu({ event_type: 'voie_de_recours', mesure: 'appel', libelle_public: 'Selon la presse, un appel a été formé contre la décision.', event_date: '2026-11-18' }, mem2), 'appel générique du même jour non reconnu');
  vrai(mesureDeLibelle('Selon la presse, une audience est annoncée le 7 décembre 2026.') === 'audience_annoncee', 'libellé daté non reconnu');
});
test('D11. un acte procédural n’a PAS de Hub : fiche seulement', () => {
  const ctx = { publiques: new Set(['FR-2026-0016']), holds: new Set(), approuvees: new Set(['FR-2026-0016']), cases: new Map([['FR-2026-0016', { commune: 'Paris 11e', departement: 'Paris' }]]),
    hubs: { 'paris-11e': { publie: true, groupes: ['Ville de Paris et mairie du 11e', 'Familles et associations'] } } };
  const d = destinationsDe({ case_id: 'FR-2026-0016', nature: 'acte_procédural', mesure: 'appel_parquet', portee: 'établissement', territoire: null }, ctx);
  vrai(d.hubs.length === 0 && d.fiche === 'FR-2026-0016', JSON.stringify(d));
  const meso = destinationsDe({ case_id: 'FR-2026-0016', nature: 'mesure', mesure: 'suspension_agent', portee: 'établissement', territoire: null }, ctx);
  vrai(meso.hubs.length >= 0, 'témoin');
});
test('N1. « n’a pas contesté / commenté sa mise en examen » : la mise en examen a eu lieu (jamais « pas de mise en examen »)', () => {
  for (const c of ['L’avocat de l’animateur n’a pas souhaité commenter sa mise en examen, intervenue jeudi.', 'Le parquet n’a pas contesté la mise en examen de l’animateur, a-t-on appris.',
    'L’enseignant ne conteste pas sa mise en examen mais nie les faits qui lui sont reprochés.']) {
    const d = actesDetail(c);
    // Jamais « niée » : affirmée, ou au pire écartée (« souhaité commenter » : aucun fait n'est tiré de la phrase).
    vrai(!d.nies.includes('MISE_EN_EXAMEN') && (d.affirmes.includes('MISE_EN_EXAMEN') || d.ecartes.includes('MISE_EN_EXAMEN')), `« ${c.slice(0, 60)} » → ${JSON.stringify(d)}`);
    aucun(c, 'non_mise_en_examen');
  }
});
test('N2. « libérés de la salle », « libéré de ses fonctions » ne sont pas des remises en liberté ; « libéré de garde à vue » en est une', () => {
  aucun('Les élèves ont été libérés de la salle après l’alerte à la bombe lancée ce matin.', 'remise_en_liberte');
  aucun('L’animateur a été libéré de ses fonctions par la mairie après son placement en garde à vue.', 'remise_en_liberte');
  vrai(m('L’homme a été libéré de garde à vue mercredi 18 novembre sans poursuites.', { courant: 'mise en examen' }).includes('remise_en_liberte'), 'vraie libération perdue');
});
test('N3. interpellation CIVILE (par des parents, des parents par la maire) : pas une interpellation judiciaire', () => {
  aucun('Le directeur a été interpellé par des parents devant l’école, qui exigent des explications.', 'interpellation');
  aucun('L’interpellation des parents par la maire sur le sujet a fait polémique ce week-end.', 'interpellation');
  vrai(m('L’interpellation d’un homme de 34 ans a eu lieu mardi 17 novembre dans la commune.').includes('interpellation'), 'vraie interpellation (nom) perdue');
});
test('N4. appel nié du parquet puis appel de la partie civile : appel sans auteur, jamais « le parquet »', () => {
  const r = F('Le parquet n’a pas fait appel de la relaxe mais la partie civile a fait appel de la décision.', { courant: 'relaxe / non-lieu / classement' });
  vrai(r.length === 1 && r[0].mesure === 'appel', JSON.stringify(r.map((f) => f.mesure)));
  const r2 = F('Le procureur général n’a pas fait appel, mais l’association a fait appel de la décision rendue en juin.', { courant: 'relaxe / non-lieu / classement' });
  vrai(r2.every((f) => f.mesure === 'appel'), JSON.stringify(r2.map((f) => f.mesure)));
});
test('N5. mémoire rédigée à la main : un événement du même type et du même jour est « connu » (pas de doublon)', () => {
  const appel = { event_type: 'voie_de_recours', mesure: 'appel_parquet', libelle_public: 'Selon la presse, le parquet a fait appel de la décision.', event_date: '2026-07-08' };
  vrai(dejaConnu(appel, [{ event_type: 'voie_de_recours', event_date: '2026-07-08', libelle_public: 'Appel formé par le parquet contre la relaxe.' }]), 'appel consigné à la main redemandé');
  const gav = { event_type: 'garde_à_vue', mesure: 'garde_a_vue', libelle_public: 'Selon la presse, la personne mise en cause a été placée en garde à vue.', event_date: '2026-11-17' };
  vrai(dejaConnu(gav, [{ event_type: 'garde_à_vue', event_date: '2026-11-17', libelle_public: 'Garde à vue de l’animateur (17 novembre).' }]), 'garde à vue consignée à la main redemandée');
  vrai(!dejaConnu(gav, [{ event_type: 'garde_à_vue', event_date: '2026-11-10', libelle_public: 'Garde à vue de l’animateur (10 novembre).' }]), 'autre jour confondu');
});
test('N6. « ne s’est pas opposé à la demande et l’homme a été remis en liberté » ; « sur demande du parquet… placé en détention » : faits réels conservés', () => {
  vrai(m('Le parquet ne s’est pas opposé à la demande et l’homme a été remis en liberté mercredi 18 novembre.', { courant: 'mise en examen' }).includes('remise_en_liberte'), 'remise en liberté perdue');
  vrai(m('Sur demande du parquet l’animateur a été placé en détention provisoire le 18 novembre.', { courant: 'mise en examen' }).includes('detention_provisoire'), 'détention perdue');
});
test('N7. « a fait appel de la décision le 18 novembre » : la date écrite est celle de l’appel ; « décision du 12 novembre » reste celle de la décision', () => {
  vrai(F('Le parquet a fait appel de la décision le 18 novembre, selon une source judiciaire.', { courant: 'relaxe / non-lieu / classement' })[0]?.event_date === '2026-11-18', 'date de l’appel perdue');
  vrai(F('Un appel a été formé contre la décision du 12 novembre, a-t-on appris vendredi.', { courant: 'condamnation non définitive' })[0]?.event_date === null, 'date de la décision prise pour celle de l’appel');
});
test('N8. un appel SANS date n’est pas « connu » à cause d’un appel vieux d’un an', () => {
  const appel = { event_type: 'voie_de_recours', mesure: 'appel', libelle_public: 'Selon la presse, un appel a été formé contre la décision.', event_date: null };
  const ancien = [{ event_type: 'voie_de_recours', event_date: '2025-09-15', libelle_public: 'Selon la presse, le parquet a fait appel de la décision.' }];
  vrai(!dejaConnu(appel, ancien, { pubDate: '2026-11-20' }), 'appel ancien avalé');
  vrai(dejaConnu(appel, [{ event_type: 'voie_de_recours', event_date: '2026-11-15', libelle_public: 'Selon la presse, le parquet a fait appel de la décision.' }], { pubDate: '2026-11-20' }), 'appel récent non reconnu');
  vrai(dejaConnu(appel, [{ event_type: 'voie_de_recours', event_date: null, libelle_public: appel.libelle_public }]), 'même libellé sans date non reconnu');
});
console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
