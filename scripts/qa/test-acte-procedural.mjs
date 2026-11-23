#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-acte-procedural.mjs — actes procéduraux sans changement de statut : fait structuré, libellé fermé, pas de faux fait
// (audit du 21/11/2026). Phrases synthétiques ou génériques : aucun nom de personne, aucun identifiant d'affaire.
//
//   node scripts/qa/test-acte-procedural.mjs      Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { detecterActesProcéduraux, libelleProcedural, MESURES_PROCEDURALES } from '../lib/acte-procedural.mjs';
import { memeFait, dejaConnu } from '../lib/nouveaute.mjs';
import { faitsStructures, planReactions } from '../lib/evenement-institutionnel.mjs';
import { classerEcartee } from '../lib/rejeu-ecartees.mjs';
import { dejaPublie } from '../lib/fait-deja-publie.mjs';

let ok = 0, ko = 0;
const test = (nom, fn) => { try { fn(); ok++; console.log(`  ✔ ${nom}`); } catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); } };
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
const mesures = (cites, o = {}) => detecterActesProcéduraux(cites, o).map((f) => f.mesure);
console.log('\n  actes procéduraux — fait décidable, libellé fermé, aucun faux fait\n');

const PRESENTE = 'Un animateur de la commune a été présenté à un juge d’instruction, jeudi 19 novembre 2026, à l’issue de sa garde à vue démarrée mardi.';
const PAS_MEE = 'Le juge n’a pas mis en examen le trentenaire, au vu des premiers éléments recueillis.';

test('1. présenté au juge sans mise en examen (cas déclencheur) : garde à vue + « pas de mise en examen » proposés', () => {
  const m = mesures([PRESENTE, PAS_MEE], { pubDate: '2026-11-20', courant: 'enquête' });
  vrai(m.includes('garde_a_vue') && m.includes('presentation_sans_mise_en_examen'), `mesures=${m}`);
  vrai(!m.includes('interpellation') && !m.includes('non_mise_en_examen'), 'le plus précis doit remplacer le plus général');
});
test('1b. toujours en garde à vue, aucune mise en examen à ce stade : PAS de « présenté à un juge » (faux fait évité)', () => {
  const m = mesures(['À ce stade, l’homme est toujours en garde à vue ; aucune mise en examen n’a été confirmée par le parquet.'], { courant: 'enquête' });
  vrai(!m.includes('presentation_sans_mise_en_examen') && m.includes('non_mise_en_examen'), `mesures=${m}`);
});
test('1c. dates : le jour écrit est celui de la PRÉSENTATION ; la garde à vue n’est pas datée par cette phrase (jamais la date d’un autre événement)', () => {
  const f = detecterActesProcéduraux([PRESENTE, PAS_MEE], { pubDate: '2026-11-20', courant: 'enquête' });
  const gav = f.find((x) => x.mesure === 'garde_a_vue'), pres = f.find((x) => x.mesure === 'presentation_sans_mise_en_examen');
  vrai(gav.event_date === null && gav.event_period === null, `garde à vue datée à tort : ${gav.event_date}`);
  vrai(pres.event_date === '2026-11-19' && pres.evidence.length === 2, `présentation : ${pres.event_date} / ${pres.evidence.length} preuves`);
});
test('1d. une DEMANDE de remise en liberté n’est pas une remise en liberté ; la levée d’une garde à vue n’est pas un placement (faux faits trouvés à la revue du 23/11)', () => {
  vrai(!mesures(['L’animateur comparaissait lundi devant la chambre de l’instruction pour demander sa remise en liberté.'], { courant: 'mise en examen' }).includes('remise_en_liberte'), 'demande prise pour une remise en liberté');
  vrai(mesures(['La chambre de l’instruction a ordonné sa remise en liberté sous contrôle judiciaire.'], { courant: 'mise en examen' }).includes('remise_en_liberte_controle'), 'vraie remise en liberté perdue');
  vrai(!mesures(['La procureure a annoncé la levée de la garde à vue de l’agent, visé par trois plaintes.'], { courant: 'enquête' }).includes('garde_a_vue'), 'levée de garde à vue prise pour un placement');
});
test('1e. dates : le jour écrit À CÔTÉ de l’acte, jamais le premier de la phrase ; une plage ne date pas l’appel', () => {
  const d = (cites, o, m) => detecterActesProcéduraux(cites, o).find((f) => f.mesure === m)?.event_date ?? null;
  vrai(d(['L’enseignant interpellé lundi à l’école a été placé en détention provisoire ce mercredi.'], { pubDate: '2026-10-14', courant: 'enquête' }, 'detention_provisoire') === '2026-10-14', 'détention datée du lundi d’interpellation');
  vrai(d(['L’animateur, placé en garde à vue mardi, a été mis en examen et écroué jeudi soir.'], { pubDate: '2025-11-28', courant: 'enquête' }, 'detention_provisoire') === '2025-11-27', 'détention datée du mardi');
  vrai(d(['Il fait appel de la peine. Du 16 au 18 novembre 2026, il sera donc rejugé en appel.'], { pubDate: '2026-11-12', courant: 'condamnation non définitive' }, 'appel') === null, 'plage de procès prise pour la date de l’appel');
  vrai(d(['Le parquet a fait appel le 12 mars de la relaxe prononcée en février.'], { pubDate: '2026-03-14', courant: 'relaxe / non-lieu / classement' }, 'appel_parquet') === '2026-03-12', 'date voisine de l’appel perdue');
});
test('2. le fait est structuré et décidable par le circuit existant (faitsStructures)', () => {
  const f = detecterActesProcéduraux([PRESENTE, PAS_MEE], { pubDate: '2026-11-20', courant: 'enquête' });
  vrai(faitsStructures(f).length === f.length && f.length > 0, 'faits non décidables');
  const fait = f.find((x) => x.mesure === 'presentation_sans_mise_en_examen');
  vrai(fait.event_type === 'mesure_procédurale' && fait.nature === 'acte_procédural' && fait.portee === 'établissement' && fait.evidence.length >= 1, JSON.stringify(fait));
});
test('3. « aucune mise en examen ni placement en détention provisoire » : la détention n’est PAS proposée (faux fait évité)', () => {
  const m = mesures(['À ce stade, aucune mise en examen ni placement en détention provisoire n’a été confirmé pour l’homme interpellé.'], { courant: 'enquête' });
  vrai(!m.includes('detention_provisoire'), `faux fait : ${m}`);
});
test('4. rappel d’un acte ancien : « avait été placé en garde à vue » n’est pas un fait nouveau', () => {
  vrai(!mesures(['L’ancien surveillant, qui avait été placé en garde à vue en 2024, vient d’être renvoyé devant le tribunal correctionnel.'], { courant: 'enquête' }).includes('garde_a_vue'), 'rappel proposé');
});
test('5. stade : une garde à vue est l’histoire d’une affaire déjà « mise en examen », pas son actualité', () => {
  vrai(mesures(['Seize personnes ont été placées en garde à vue cette semaine à l’école.'], { courant: 'enquête' }).includes('garde_a_vue'), 'garde à vue perdue à l’enquête');
  vrai(!mesures(['Seize personnes ont été placées en garde à vue cette semaine à l’école.'], { courant: 'mise en examen' }).includes('garde_a_vue'), 'garde à vue proposée à un stade dépassé');
});
test('6. appel : auteur seulement s’il est écrit ; annoncé ≠ formé ; « cour d’appel » n’est pas un appel', () => {
  const p = detecterActesProcéduraux(['Le parquet de Paris a fait appel de la relaxe prononcée mardi.'], { courant: 'relaxe / non-lieu / classement' })[0];
  vrai(p.mesure === 'appel_parquet' && p.realisation === 'réalisée', JSON.stringify(p));
  const a = detecterActesProcéduraux(['L’avocat de la défense fera appel de la condamnation, a-t-il annoncé.'], { courant: 'condamnation non définitive' })[0];
  vrai(a.mesure === 'appel_défense' && a.realisation === 'annoncée', JSON.stringify(a));
  vrai(!mesures(['L’affaire sera examinée devant la cour d’appel de Rouen.'], { courant: 'condamnation non définitive' }).includes('appel'), '« cour d’appel » prise pour un appel formé');
  vrai(detecterActesProcéduraux(['Un appel a été interjeté contre le jugement rendu en juin.'], {})[0].mesure === 'appel', 'appel sans auteur');
});
test('7. audience annoncée : seulement datée en jour complet et à venir', () => {
  const f = detecterActesProcéduraux(['L’homme sera jugé le 7 décembre 2026 par le tribunal correctionnel.'], { pubDate: '2026-11-12', courant: 'mise en examen' });
  vrai(f.length === 1 && f[0].mesure === 'audience_annoncee' && f[0].event_date === '2026-12-07' && /7 décembre 2026/.test(f[0].libelle_public), JSON.stringify(f));
  vrai(!mesures(['L’homme sera jugé prochainement par le tribunal correctionnel.'], { pubDate: '2026-11-12' }).includes('audience_annoncee'), 'audience sans date proposée');
  vrai(!mesures(['L’homme sera jugé le 7 mars 2026 par le tribunal correctionnel.'], { pubDate: '2026-11-12' }).includes('audience_annoncee'), 'date passée proposée comme annonce');
});
test('8. un changement de STATUT reste au circuit STATE_CHANGE : condamnation, mise en examen affirmée, relaxe ne sont pas des actes procéduraux', () => {
  vrai(mesures(['L’enseignant a été condamné à trois ans de prison par le tribunal correctionnel.']).length === 0, 'condamnation proposée comme acte');
  vrai(mesures(['Un animateur a été mis en examen pour viols sur mineur.']).length === 0, 'mise en examen proposée comme acte');
});
test('9. libellés fermés : « Selon la presse… », aucun nom, aucun texte de la citation', () => {
  for (const m of MESURES_PROCEDURALES) for (const r of ['réalisée', 'annoncée']) {
    const l = libelleProcedural(m, r, '2026-12-07'); if (!l) continue;
    vrai(/^Selon la presse, /.test(l) && !/[A-ZÉ][a-zéèê]+\s+[A-ZÉ][a-zéèê]+/.test(l.slice(18)), `libellé hors table : ${l}`);
  }
});
test('10. déduplication au NIVEAU DU FAIT : sans date ≡ daté (même libellé) ; deux dates différentes ≠', () => {
  const a = { libelle_public: 'X', event_date: null }, b = { libelle_public: 'X', event_date: '2026-11-18' }, c = { libelle_public: 'X', event_date: '2026-11-25' };
  vrai(memeFait(a, b) && memeFait(b, a), 'sans date ≢ daté');
  vrai(!memeFait(b, c), 'deux jours différents confondus');
  vrai(memeFait({ libelle_public: 'X', event_period: '2026-11' }, b), 'période ⊃ jour');
});
test('11. un fait déjà dans la mémoire n’est pas redemandé (planReactions sur case_events)', () => {
  const f = detecterActesProcéduraux(['Le parquet de Paris a fait appel de la relaxe prononcée le 16 juin.'], { courant: 'relaxe / non-lieu / classement' });
  const memoire = [{ event_type: 'voie_de_recours', event_date: null, libelle_public: f[0].libelle_public }];
  vrai(planReactions(f, memoire).neufs.length === 0, 'fait déjà consigné redemandé');
});
test('12. une détention déjà dite dans le libellé d’une mise en examen consignée n’est pas un second événement', () => {
  const cite = 'Le suspect a été mis en examen et placé en détention provisoire le 30 avril.';
  const sans = mesures([cite], { courant: 'mise en examen' });
  vrai(sans.includes('detention_provisoire'), 'détention perdue sans mémoire');
  const avec = mesures([cite], { courant: 'mise en examen', memoire: [{ event_type: 'mise_en_examen', event_date: '2026-04-30', libelle_public: 'Deux animateurs mis en examen et placés en détention provisoire.' }] });
  vrai(!avec.includes('detention_provisoire'), 'détention déjà consignée redemandée');
});
test('13. deux citations d’un même acte = UN fait (deux preuves au plus)', () => {
  const f = detecterActesProcéduraux(['Seize personnes ont été placées en garde à vue mercredi à l’école.', 'Les seize personnes sont toujours en garde à vue ce jeudi.'], { courant: 'enquête' });
  vrai(f.length === 1 && f[0].evidence.length === 2, JSON.stringify(f.map((x) => [x.mesure, x.evidence.length])));
});
test('14. rejeu : classement au niveau du fait (nouveau / sans apport / rattachement douteux)', () => {
  const base = { case_id: 'X', aa: 'ENRICHMENT', rat: 'OK', courant: 'enquête', pd: '2026-11-20', url: null };
  const nouveau = classerEcartee({ ...base, facts: [{ evidence: [PRESENTE, PAS_MEE] }] }, {});
  vrai(nouveau.classe === 'NOUVEAU' && nouveau.faits.length === 2, JSON.stringify(nouveau));
  vrai(classerEcartee({ ...base, facts: [{ evidence: ['Une enquête a été ouverte et plusieurs plaintes ont été déposées par des parents de l’école.'] }] }, {}).classe === 'SANS_APPORT', 'plaintes au stade enquête');
  vrai(classerEcartee({ ...base, rat: 'DOUTEUX', facts: [{ evidence: [PRESENTE] }] }, {}).classe === 'RATTACHEMENT', 'rattachement douteux proposé');
  const soumis = nouveau.faits;
  vrai(classerEcartee({ ...base, facts: [{ evidence: [PRESENTE, PAS_MEE] }] }, { soumis }).classe === 'DEJA_SOUMIS', 'même fait déjà soumis non reconnu');
});

// --- Recouvrement entre deux propositions du MÊME épisode (rejeu du 23/11, FR-2026-0133) : deux presses, deux jours, un seul fait « pas de mise en examen » ---
const EPISODE_A = ['Un animateur de la commune, près de Caen, a été présenté à un juge d’instruction, jeudi 19 novembre 2026, à l’issue de sa garde à vue démarrée mardi.', 'Le juge n’a pas mis en examen le trentenaire, au vu des premiers éléments recueillis.'];
const EPISODE_B = ['L’animateur, mis en cause pour violences sexuelles sur des enfants, n’a finalement pas été mis en examen par le juge d’instruction le 19 novembre 2026.', 'Le procureur annonce qu’il fait appel.'];
test('7. même épisode, deux sources : « présenté à un juge, pas mis en examen » et « n’a pas été mis en examen » sont UN fait ; l’appel annoncé du parquet reste l’apport DISTINCT', () => {
  const a = detecterActesProcéduraux(EPISODE_A, { pubDate: '2026-11-20', courant: 'enquête' }), b = detecterActesProcéduraux(EPISODE_B, { pubDate: '2026-11-20', courant: 'enquête' });
  const pres = a.find((f) => f.mesure === 'presentation_sans_mise_en_examen'), nonMee = b.find((f) => f.mesure === 'non_mise_en_examen'), appel = b.find((f) => f.mesure === 'appel_parquet');
  vrai(pres && nonMee && appel, `${a.map((f) => f.mesure)} / ${b.map((f) => f.mesure)}`);
  vrai(memeFait(pres, nonMee), 'la non-mise en examen de la seconde source recouvre la présentation au juge de la première (même jour, même épisode)');
  vrai(!memeFait(pres, appel) && appel.realisation === 'annoncée', 'l’appel annoncé est un fait distinct, jamais retiré avec le recouvrement');
  // Ce que voit l’éditeur : le fait déjà soumis par la première proposition n’est pas redemandé ; seul l’appel reste (une proposition n’est pas supprimée pour une partie redondante).
  const restants = b.filter((f) => !a.some((s) => memeFait(f, s)));
  vrai(restants.length === 1 && restants[0].mesure === 'appel_parquet', `restants : ${restants.map((f) => f.mesure)}`);
});

test('8. fait procédural DATÉ déjà dans le déroulé de la fiche publiée : « déjà publié » (cas FR-2026-0114, audience du 22/02/2027) ; sans date ou un autre jour : à décider', () => {
  const dossier = { deroule: [{ type: 'garde_a_vue', date: '2026-08-26', texte: 'L’animateur est replacé en garde à vue.' }, { type: 'audience', date: '2027-02-22', texte: 'Date fixée pour l’audience.' }, { type: 'decision', date: '2026-09-02', texte: 'L’animateur est placé en détention provisoire.' }] };
  const f = (mesure, event_date) => ({ mesure, event_date, realisation: 'annoncée' });
  vrai(dejaPublie(dossier, f('audience_annoncee', '2027-02-22'), 'https://exemple.invalid/a') !== null, 'audience du même jour = déjà publiée');
  vrai(dejaPublie(dossier, f('audience_annoncee', '2027-03-01'), 'https://exemple.invalid/a') === null, 'une autre date d’audience est un autre fait');
  vrai(dejaPublie(dossier, f('garde_a_vue', null), 'https://exemple.invalid/a') === null, 'une garde à vue SANS date n’est jamais tenue pour publiée');
  vrai(dejaPublie(dossier, f('garde_a_vue', '2026-09-30'), 'https://exemple.invalid/a') === null && dejaPublie(dossier, f('garde_a_vue', '2026-08-26'), 'https://exemple.invalid/a') !== null, 'garde à vue : même jour seulement');
  vrai(dejaPublie(dossier, f('detention_provisoire', '2026-09-02'), 'https://exemple.invalid/a') !== null, 'détention lue dans le texte de l’étape du même jour');
  vrai(dejaPublie(dossier, f('appel_parquet', '2026-09-05'), 'https://exemple.invalid/a') === null, 'aucun appel dans le déroulé : à décider');
});

console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
