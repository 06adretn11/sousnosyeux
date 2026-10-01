#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-routage.mjs
//
// Contre-exemples OBLIGATOIRES de MAINTENANCE LOOP #2. Chaque cas est un
// titre RÉEL du backlog (rapports de veille des 25/09 et 30/09/2026) —
// aucun titre inventé — et chaque test défend une garde :
//
//   le titre décide où regarder, la source décide ce qui est vrai.
//
//   node scripts/qa/test-routage.mjs
//
// Aucun réseau, aucun Neon, aucun LLM.
// =====================================================================

import {
  construireContexte, router, actes, acteprimaire, clusteriser, requetesVeille,
  claimDejaEtabli, estRegression, cleClaim, lireCleClaim, requetePreuve, ROUTAGE_VERSION,
  suffisance, entreeCache, entreeDepuisBase, evenementDejaValide,
} from '../lib/routage-veille.mjs';

// --- affaires (structure du corpus réel) -------------------------------
const F = {
  VOLTAIRE: { case_id: 'POC-08', etablissement: 'École maternelle Voltaire', commune: 'Paris 11e', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'plainte' },
  BAUDIN: { case_id: 'POC-05', etablissement: 'École maternelle Alphonse-Baudin', commune: 'Paris 11e', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'procès' },
  TITON: { case_id: 'POC-09', etablissement: 'École Titon', commune: 'Paris 11e', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'relaxe / non-lieu / classement' },
  SERVAN: { case_id: 'POC-07', etablissement: 'École maternelle Servan', commune: 'Paris 11e', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'mise en examen' },
  STDOM: { case_id: 'FR-2026-0005', etablissement: 'École maternelle Saint-Dominique', commune: 'Paris 7e', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'mise en examen' },
  NEUILLY: { case_id: 'FR-2026-0022', etablissement: 'Institution Saint-Dominique', commune: 'Neuilly-sur-Seine', role_mis_en_cause: 'enseignant', statut_judiciaire: 'enquête' },
  BETHARRAM: { case_id: 'FR-2026-9999', etablissement: 'Collège Notre-Dame de Bétharram', commune: 'Lestelle-Bétharram', role_mis_en_cause: 'enseignant', statut_judiciaire: 'enquête' },
  VOLONTAIRES: { case_id: 'POC-10', etablissement: 'École Volontaires', commune: 'Paris 15e', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'enquête' },
  GAP: { case_id: 'FR-2026-0032', etablissement: 'Collège-lycée Saint-Joseph', commune: 'Gap', role_mis_en_cause: 'enseignant', statut_judiciaire: 'condamnation non définitive' },
  AQUEDUC: { case_id: 'FR-2026-0001', etablissement: 'École Aqueduc', commune: 'Paris 10e', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'procès' },
  SAINTVAL: { case_id: 'FR-2026-0045', etablissement: 'Collège Jehan le Povremoyne', commune: 'Saint-Valéry-en-Caux', role_mis_en_cause: 'surveillant', statut_judiciaire: 'procès' },
  ARESQUIERS: { case_id: 'FR-2026-0027', etablissement: 'École maternelle Les Aresquiers', commune: 'Vic-la-Gardiole', role_mis_en_cause: 'ATSEM', statut_judiciaire: 'mise en examen' },
  QUARTIER: { case_id: 'FR-2026-0033', etablissement: 'Collège de Quartier-Français', commune: 'Sainte-Suzanne', role_mis_en_cause: 'enseignant', statut_judiciaire: 'mise en examen' },
  MONTPELLIER_AUTRE: { case_id: 'FR-2026-8888', etablissement: 'École Jean-Jaurès', commune: 'Montpellier', role_mis_en_cause: 'animateur', statut_judiciaire: 'enquête' },
};

const derniere = new Map([
  ['POC-05', '2026-05-27'], ['POC-09', '2026-06-16'], ['POC-10', '2026-03-16'], ['FR-2026-0032', '2025-11-26'],
  ['FR-2026-0001', '2026-07-01'], ['FR-2026-0045', '2025-09-17'],
]);
const ctx = construireContexte({
  fiches: Object.values(F),
  etablissements: [
    { case_id: 'FR-2026-0005', etablissement: 'École Rapp', commune: 'Paris 7e' },
    { case_id: 'FR-2026-0005', etablissement: 'École La Rochefoucauld', commune: 'Paris 7e' },
  ],
  derniereSource: derniere,
  evenements: [
    { case_id: 'POC-05', event_type: 'décision', event_date: '2026-07-07', statut_apres: 'relaxe / non-lieu / classement' },
    { case_id: 'POC-05', event_type: 'voie_de_recours', event_date: '2026-07-08', statut_apres: 'relaxe / non-lieu / classement' },
    { case_id: 'POC-09', event_type: 'voie_de_recours', event_date: null, statut_apres: 'relaxe / non-lieu / classement' },
  ],
});
const R = (fiche, titre, published) => router({ titre, published, fiche, ctx });

// --- mini-runner -------------------------------------------------------
let ok = 0, ko = 0;
const test = (nom, fn) => {
  try { fn(); ok++; console.log(`  ✔ ${nom}`); }
  catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); }
};
const eq = (a, b, msg = '') => { if (a !== b) throw new Error(`${msg} attendu « ${b} », obtenu « ${a} »`); };
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
const continue_ = (x) => x.route === 'POTENTIAL_UPDATE' || x.route === 'UNCERTAIN';

console.log(`\n  routage ${ROUTAGE_VERSION}\n`);

// ---- 1. Voltaire / Montpellier : rejeté SANS LECTURE ------------------
test('1. Voltaire (Paris 11e) vs « ex-animateur de Montpellier » → WRONG_SCOPE_CERTAIN', () => {
  const x = R(F.VOLTAIRE, 'Un ex-animateur scolaire de Montpellier soupçonné de viol et d’agressions sexuelles sur une quinzaine de fillettes - midilibre.fr', '2026-04-02');
  eq(x.route, 'WRONG_SCOPE_CERTAIN');
});
test('1b. …mais « cour d’appel de Montpellier » n’est PAS une localité des faits (Vic-la-Gardiole)', () => {
  const x = R(F.ARESQUIERS, 'La cour d’appel de Montpellier accepte la remise en liberté de l’ATSEM soupçonnée de viols', '2025-08-14');
  vrai(continue_(x), `exclu à tort : ${x.route}`);
});
test('1c. …et « jugé à Rouen » n’exclut pas Saint-Valéry (Rouen = tribunal, pas les faits)', () => {
  const x = R(F.SAINTVAL, 'À Rouen, l’ancien surveillant condamné à 6 ans de prison pour 27 agressions sexuelles sur des mineurs - Paris Normandie', '2025-09-17');
  vrai(continue_(x), `un VRAI verdict a été exclu : ${x.route} ${x.regle}`);
});

// ---- 2. Réquisitions ≠ verdict ---------------------------------------
test('2. réquisitions Baudin : REQUISITION, jamais VERDICT_CONDAMNATION', () => {
  const t = 'Violences dans le périscolaire à Paris : trois ans de prison, dont un ferme, requis contre un ex-animateur suspecté d’agressions sexuelles sur des enfants - CNews';
  const a = actes(t);
  vrai(a.includes('REQUISITION'), `actes=${a}`);
  vrai(!a.includes('VERDICT_CONDAMNATION'), 'réquisitions prises pour un verdict');
  eq(acteprimaire(a), 'REQUISITION');
  const q = requetePreuve({ fiche: F.BAUDIN, claim: { acte: 'REQUISITION', items: [{ titre: t }] } }).join(' ');
  vrai(!/condamn/i.test(q), 'la requête de preuve cherche une condamnation pour des réquisitions');
});
test('2b. « relaxé alors que le parquet avait requis » : le verdict est l’information', () => {
  eq(acteprimaire(actes('Relaxé alors que le parquet avait requis 18 mois de prison avec sursis')), 'VERDICT_RELAXE');
});
test('2c. « 3 ans de prison » seul : peine NON qualifiée, jamais exclue comme historique', () => {
  const x = R(F.SAINTVAL, 'Agressions sexuelles sur mineurs à Saint-Valery-en-Caux. "Des peines pas à la hauteur" : prison ferme pour l’ancien surveillant - tendanceouest.com', '2025-09-17');
  vrai(continue_(x), x.route);
  vrai(actes('prison ferme pour l’ancien surveillant').includes('PEINE_NON_QUALIFIEE'));
});

// ---- 3. Audience ≠ verdict ; demande ≠ mesure ; juridiction ≠ appel ---
test('3. audience/procès ≠ verdict', () => {
  const a = actes('Le procès d’un animateur du périscolaire s’ouvre à Paris - BFM');
  vrai(a.includes('AUDIENCE') && !a.some((x) => x.startsWith('VERDICT')), `actes=${a}`);
});
test('3b. DEMANDE de remise en liberté ≠ remise en liberté', () => {
  const a = actes('l’assistante d’école maternelle mise en examen pour viols demande sa remise en liberté');
  vrai(a.includes('DEMANDE_LIBERTE') && !a.includes('REMISE_LIBERTE'), `actes=${a}`);
  const b = actes('l’Atsem remise en liberté, voici les obligations qu’elle devra respecter');
  vrai(b.includes('REMISE_LIBERTE') && !b.includes('DEMANDE_LIBERTE'), `actes=${b}`);
});
test('3b2. un corps qui rappelle la DEMANDE et rapporte la MESURE énonce les deux (Vic-la-Gardiole)', () => {
  const a = actes('La cour d’appel de Montpellier a accepté de remettre en liberté l’ATSEM, qui avait fait une demande de remise en liberté le 12 août.');
  vrai(a.includes('REMISE_LIBERTE') && a.includes('DEMANDE_LIBERTE'), `actes=${a}`);
  vrai(!actes('l’ATSEM demande sa remise en liberté').includes('REMISE_LIBERTE'), 'une demande seule ne vaut pas mesure');
});
test('3c. COUR D’APPEL (juridiction) ≠ APPEL FORMÉ', () => {
  const a = actes('la cour d’appel de Montpellier a accepté de remettre en liberté l’ATSEM');
  vrai(a.includes('COUR_APPEL') && !a.includes('APPEL_FORME'), `actes=${a}`);
  vrai(!actes('il a dû faire appel à un avocat commis d’office').includes('APPEL_FORME'), '« faire appel à » pris pour un recours');
  vrai(actes('le parquet de Paris fait appel de la relaxe d’un animateur').includes('APPEL_FORME'));
});

// ---- 4. Chronologie : ne jamais éliminer sur la seule date -----------
test('4. article RÉCENT sur une ancienne enquête : chronologie non établie → continue', () => {
  // Gap est déjà condamné (26/11/2025). Un article d’août 2026 « fait l’objet d’une enquête »
  // est postérieur à l’état connu : rien ne prouve qu’il soit historique.
  const x = R(F.GAP, 'Un enseignant de Gap fait l’objet d’une enquête pour corruption de mineurs - 20minutes.fr', '2026-08-01');
  vrai(continue_(x), `exclu à tort : ${x.route}`);
});
test('4b. même titre, publié AVANT l’état connu → HISTORICAL_OR_ALREADY_KNOWN_CERTAIN', () => {
  const x = R(F.GAP, 'Un enseignant de Gap fait l’objet d’une enquête pour corruption de mineurs - 20minutes.fr', '2025-05-19');
  eq(x.route, 'HISTORICAL_OR_ALREADY_KNOWN_CERTAIN');
});
test('4c. article ANCIEN sans aucun acte : la date seule n’élimine jamais', () => {
  const x = R(F.SAINTVAL, 'Culpabilité confirmée pour l’ancien principal du collège de Saint-Valery-en-Caux - Paris Normandie', '2025-04-25');
  vrai(continue_(x), `éliminé sur la seule date : ${x.route}`);
});
test('4d. article ANCIEN portant un acte avancé (page mise à jour après publication) : continue', () => {
  // L’annonce du délibéré, datée du 26/06, a été mise à jour avec le verdict du 10/07 (CNEWS, Aqueduc).
  const x = R(F.AQUEDUC, 'Agression sexuelle dans une école parisienne : le tribunal rend sa décision ce vendredi - cnews.fr', '2026-06-26');
  vrai(continue_(x), `exclu à tort : ${x.route}`);
});
test('4e. « suites », « après », « nouvelle » : jamais historique', () => {
  const x = R(F.NEUILLY, 'Violences à l’école : quelles suites judiciaires après les plaintes d’anciens élèves d’institutions catholiques - ici.fr', '2025-11-21');
  vrai(continue_(x), x.route);
});

// ---- 5. Garde de régression ------------------------------------------
test('5. un état cible en arrière n’est jamais un changement d’état', () => {
  vrai(estRegression('condamnation non définitive', 'enquête'), 'condamnation → enquête doit être une régression');
  vrai(estRegression('procès', 'mise en examen'));
  vrai(!estRegression('procès', 'relaxe / non-lieu / classement'), 'procès → relaxe est une avancée');
  vrai(!estRegression('condamnation non définitive', 'relaxe / non-lieu / classement'), 'même rang : latéral, revue humaine de toute façon');
  vrai(!estRegression('enquête', 'condamnation non définitive'));
});

// ---- 6. Titon : l'appel est cherché, et distinct de la relaxe --------
test('6. Titon (relaxe) : la requête « en avant » porte « appel » et la requête ouverte tourne', () => {
  const q = requetesVeille(F.TITON);
  vrai(/appel/.test(q.avant) && /"fait appel"/.test(q.avant), q.avant);
  vrai(!/animateur/.test(q.avant), 'le rôle rétrécit la requête (mesuré sur Titon)');
  vrai(q.ouverte.includes('École Titon') && !/appel/.test(q.ouverte), q.ouverte);
});
test('6b. Titon : « le parquet fait appel de la relaxe » → claim APPEL, distinct de la relaxe', () => {
  const items = [
    { titre: 'Pourquoi l’animateur périscolaire jugé […] à l’école Titon à Paris a été relaxé - franceinfo', published: '2026-06-17' },
    { titre: 'Périscolaire à Paris : le parquet fait appel de la relaxe de l’ex-animateur de l’école Titon - Le Parisien', published: '2026-06-17' },
    { titre: 'Périscolaire à Paris : « Qu’allons-nous dire à nos enfants ? », après la relaxe de l’animateur de l’école Titon - Le Parisien', published: '2026-06-16' },
  ].map((i) => { const a = actes(i.titre); return { ...i, actes: a, primaire: acteprimaire(a) }; });
  const claims = clusteriser(items);
  const par = Object.fromEntries(claims.map((c) => [c.acte, c.items.length]));
  eq(par.APPEL_FORME, 1, 'claim appel');
  eq(par.VERDICT_RELAXE, 2, 'claim relaxe (2 redites)');
  eq(claims.length, 2, 'nombre de claims');
});
test('6c. Titon : l’appel est déjà connu (événement sans date) → claim déjà établi, pas repayé', () => {
  const cl = { acte: 'APPEL_FORME', debut: '2026-06-17', fin: '2026-06-17' };
  vrai(claimDejaEtabli({ case_id: 'POC-09', claim: cl, evenements: ctx.evenements }), 'appel connu non reconnu');
  eq(claimDejaEtabli({ case_id: 'FR-2026-0001', claim: cl, evenements: ctx.evenements }), null, 'un appel inconnu ne doit pas être « établi »');
});

// ---- 7. Convergence sans démultiplication ----------------------------
test('7. plusieurs articles Volontaires (mêmes plaintes, même semaine) → UN claim', () => {
  const t = [
    ['Paris : déjà changé d’école maternelle pour des signalements, un animateur visé par trois plaintes pour viols - parismatch.com', '2026-03-10'],
    ['Périscolaire à Paris : un animateur d’une école du XVe visé par trois plaintes pour viol sur mineur - Le Parisien', '2026-03-10'],
    ['Paris : un animateur périscolaire visé par plusieurs plaintes pour viols sur mineurs - Le Figaro', '2026-03-11'],
  ].map(([titre, published]) => { const a = actes(titre); return { titre, published, actes: a, primaire: acteprimaire(a) }; });
  const claims = clusteriser(t);
  eq(claims.length, 1, 'redites non regroupées');
  eq(claims[0].items.length, 3);
});
test('7b. deux ACTES différents le même jour ne fusionnent jamais (relaxe 07/07, appel 08/07)', () => {
  const t = [['Un animateur relaxé « au bénéfice du doute » - Le Monde', '2026-07-07'],
    ['le parquet fait appel de la relaxe d’un ex-animateur de l’école maternelle Alphonse-Baudin - Le Monde', '2026-07-08'],
    ['Un animateur relaxé pour agressions sexuelles - ici.fr', '2026-07-08']]
    .map(([titre, published]) => { const a = actes(titre); return { titre, published, actes: a, primaire: acteprimaire(a) }; });
  const claims = clusteriser(t);
  eq(claims.length, 2);
  vrai(claims.some((c) => c.acte === 'APPEL_FORME' && c.items.length === 1));
  vrai(claims.some((c) => c.acte === 'VERDICT_RELAXE' && c.items.length === 2));
});
test('7c. même acte mais deux dates éloignées (> 5 jours) → deux claims', () => {
  const t = [['Six animateurs suspendus en quelques jours - Le Parisien', '2026-02-07'], ['Neuf animateurs suspendus - TF1 Info', '2026-02-16']]
    .map(([titre, published]) => { const a = actes(titre); return { titre, published, actes: a, primaire: acteprimaire(a) }; });
  eq(clusteriser(t).length, 2);
});
test('7d. deux titres SANS acte ne fusionnent pas (on garde séparé)', () => {
  const t = [['« Un scandale absolu » : à Paris, un animateur périscolaire face au « mur du silence » - rmc.bfmtv.com', '2026-03-12'],
    ['Lenteur des procédures et réponses limitées - lejdd.fr', '2026-03-12']]
    .map(([titre, published]) => ({ titre, published, actes: [], primaire: null }));
  eq(clusteriser(t).length, 2);
});

// ---- 8. L'ambiguïté CONTINUE -----------------------------------------
test('8. titre dégénéré (Sainte-Suzanne) : jamais éliminé', () => {
  const x = R(F.QUARTIER, 'Sainte-Rose - lequotidien.re', '2026-04-15');
  vrai(continue_(x), `${x.route} ${x.regle}`);
});
test('8b. « après Bétharram, une plainte […] Hauts-de-Seine » : un autre dossier cité en RÉFÉRENCE n’exclut pas', () => {
  const x = R(F.NEUILLY, 'Hauts-de-Seine : après Bétharram, une plainte déposée contre le surveillant « Cheval » - Le Figaro', '2025-04-08');
  vrai(continue_(x), `${x.route} ${x.regle}`);
});
test('8c. le titre nomme notre commune ET une autre localité → continue', () => {
  const x = R(F.SAINTVAL, 'Un ancien surveillant du collège de Saint-Valery-en-Caux jugé à Rouen - ici.fr', '2025-09-15');
  vrai(continue_(x), x.route);
});
test('8d. « l’affaire de l’école Saint-Dominique » sous Servan (même arrondissement voisin) → WRONG_SCOPE_CERTAIN', () => {
  const x = R(F.SERVAN, 'Violences physiques et sexuelles dans le périscolaire à Paris : vaste opération policière dans l’affaire de l’école Saint-Dominique - Le Monde.fr', '2026-05-20');
  eq(x.route, 'WRONG_SCOPE_CERTAIN');
});
test('8e. …mais sous Saint-Dominique lui-même (et ses écoles rattachées, Rapp) → continue', () => {
  vrai(continue_(R(F.STDOM, 'Coup de filet dans le périscolaire à Paris : 16 personnes en garde à vue dans l’affaire de l’école Saint-Dominique - RTL', '2026-05-20')));
  vrai(continue_(R(F.STDOM, 'Interpellations à l’école Rapp à Paris : seize personnes en garde à vue', '2026-05-20')));
});
test('8f. synthèse portant un verdict (« condamné … que révèle le scandale ») : continue', () => {
  const x = R(F.VOLONTAIRES, 'Animateur périscolaire à Paris condamné pour violences sexuelles : que révèle le scandale ? - Ohmymag', '2026-09-16');
  vrai(continue_(x), `${x.route} ${x.regle}`);
});
test('8f2. « Première peine de prison ferme dans le scandale du périscolaire » (verdict Vigée-Lebrun) : continue', () => {
  const x = R(F.VOLONTAIRES, 'Première peine de prison ferme dans le scandale du périscolaire à Paris - 20minutes.fr', '2026-09-15');
  vrai(continue_(x), `${x.route} ${x.regle}`);
});
test('8f3. « un lycée près de Toulouse » : une localité de RÉFÉRENCE n’exclut pas Saint-Gaudens', () => {
  const F2 = { case_id: 'FR-2026-0030', etablissement: 'Lycée Bagatelle', commune: 'Saint-Gaudens', role_mis_en_cause: 'proviseur adjoint', statut_judiciaire: 'mise en examen' };
  const c2 = construireContexte({ fiches: [F2, { case_id: 'X', etablissement: 'École Y', commune: 'Toulouse' }] });
  const x = router({ titre: 'L’ex-proviseur adjoint d’un lycée près de Toulouse soupçonné de viol sur une élève - ouest-france.fr', published: '2026-01-20', fiche: F2, ctx: c2 });
  vrai(x.route !== 'WRONG_SCOPE_CERTAIN', `${x.route} ${x.regle}`);
});
test('8f4. « Scandale dans une maternelle à Paris » : un mot du dossier suffit à continuer', () => {
  const x = R(F.VOLTAIRE, 'Scandale dans une maternelle à Paris : la mesure stricte exigée par Ségolène Royal sur le périscolaire', '2026-03-28');
  vrai(continue_(x), `${x.route} ${x.regle}`);
});
test('8g. vraie synthèse sans acte décisif → CONTEXT_ONLY', () => {
  eq(R(F.VOLTAIRE, 'Violences sexuelles dans le périscolaire à Paris : que contient le plan d’action à 20 millions d’euros présenté par Emmanuel Grégoire - midilibre.fr', '2026-04-03').route, 'CONTEXT_ONLY');
});
test('8h. bruit sans aucun mot du dossier (menu, foot) → CONTEXT_ONLY ; « Sainte-Rose - lequotidien.re » non', () => {
  eq(R(F.SAINTVAL, '« Un menu avec nos deux univers » : deux chefs imaginent un menu éphémère pour des restaurants de Seine-Maritime - Actu.fr', '2026-09-30').route, 'CONTEXT_ONLY');
});

// ---- 9. Mémoire de claim ---------------------------------------------
test('9. clé de claim : aller-retour, avec et sans verdict', () => {
  const k = cleClaim('POC-05', { acte: 'VERDICT_RELAXE', debut: '2026-07-07', fin: '2026-07-10' });
  eq(lireCleClaim(k).acte, 'VERDICT_RELAXE');
  eq(lireCleClaim(k + '|ETABLI').verdict, 'ETABLI');
  eq(lireCleClaim('lyon 6e|domaine.fr'), null, 'une clé de titre ne doit pas être prise pour un claim');
});

// ---- 10. Cache : fraîche == en cache, sur la DÉCISION MÉTIER ----------
// Défaut démontré : le cache ne gardait que `facts`, vide quand le modèle ne rend pas d'`event_type`,
// alors que les citations vérifiées existent — l'analyse réutilisée était jugée insuffisante.
const FRAICHES = [
  { nom: 'citation vérifiée, event_type absent (facts vides)', out: { rattachement: 'OK', _evidence: ['le tribunal a condamné X à 18 mois de prison'], _facts: [], EVENT_DATE: '2026-07-10', statut_propose: null }, acte: 'VERDICT_CONDAMNATION', dateOk: true },
  { nom: 'citation vérifiée, facts renseignés', out: { rattachement: 'OK', _evidence: ['le parquet a fait appel de la relaxe'], _facts: [{ evidence: ['le parquet a fait appel de la relaxe'] }], EVENT_DATE: null }, acte: 'APPEL_FORME', dateOk: true },
  { nom: 'citation inventée (evidence invalide)', out: { rattachement: 'OK', _evidence: ['x condamné'], _evidence_invalide: true, _facts: [] }, acte: 'VERDICT_CONDAMNATION', dateOk: true },
  { nom: 'rattachement douteux, non arbitré', out: { rattachement: 'DOUTEUX', _evidence: ['mise en examen de l’ATSEM'], _facts: [] }, acte: 'MISE_EN_EXAMEN', dateOk: true },
  { nom: 'acte absent de la citation', out: { rattachement: 'OK', _evidence: ['le procès s’ouvre mardi'], _facts: [] }, acte: 'VERDICT_CONDAMNATION', dateOk: true },
  { nom: 'date incohérente avec la fenêtre', out: { rattachement: 'OK', _evidence: ['condamné le 10 juillet'], _facts: [], EVENT_DATE: '2026-07-10' }, acte: 'VERDICT_CONDAMNATION', dateOk: false },
];
for (const f of FRAICHES) {
  for (const arbitre of [false, true]) {
    test(`10. fresh == cached — ${f.nom}${arbitre ? ' [arbitré]' : ''}`, () => {
      const args = { moteur: 'm', acte: f.acte, dateOk: f.dateOk, arbitre };
      const fraiche = suffisance({ ...args, rattachement: f.out.rattachement, evidence: f.out._evidence, evidenceInvalide: !!f.out._evidence_invalide });
      // chemin 1 : cache du run
      const e1 = entreeCache(f.out, 'ENRICHMENT');
      const c1 = suffisance({ ...args, rattachement: e1.rattachement, evidence: e1.evidence, evidenceInvalide: e1.evidence_invalide });
      // chemin 2 : relu depuis `state_proposals` (facts + payload)
      const e2 = entreeDepuisBase({ analysis_action: 'ENRICHMENT', facts: f.out._facts, ev: f.out._evidence, evinv: String(!!f.out._evidence_invalide), rattachement: f.out.rattachement });
      const c2 = suffisance({ ...args, rattachement: e2.rattachement, evidence: e2.evidence, evidenceInvalide: e2.evidence_invalide });
      eq(c1.suffisante, fraiche.suffisante, 'cache du run');
      eq(c2.suffisante, fraiche.suffisante, 'relu de la base');
      eq(c1.acteEtabli, fraiche.acteEtabli, 'acte');
    });
  }
}
test('10b. une décision humaine remplace le rattachement du modèle — et lui seul', () => {
  const base = { moteur: 'm', rattachement: 'DOUTEUX', evidence: ['la cour d’appel a ordonné la remise en liberté de l’ATSEM'], acte: 'REMISE_LIBERTE', dateOk: true };
  eq(suffisance(base).suffisante, false, 'sans arbitrage');
  eq(suffisance({ ...base, arbitre: true }).suffisante, true, 'avec arbitrage');
  eq(suffisance({ ...base, arbitre: true, evidence: [] }).suffisante, false, 'sans citation, l’arbitrage ne suffit pas');
  eq(suffisance({ ...base, arbitre: true, dateOk: false }).suffisante, false, 'date incohérente, l’arbitrage ne suffit pas');
});

test('11. un fait déjà validé par un humain n’est pas redemandé (même état, même date écrite)', () => {
  const ev = [{ case_id: 'FR-2026-0004', event_type: 'décision', event_date: '2026-09-15', statut_apres: 'condamnation non définitive' }];
  vrai(evenementDejaValide(ev, 'FR-2026-0004', 'condamnation non définitive', '2026-09-15'), 'fait validé non reconnu');
  eq(evenementDejaValide(ev, 'FR-2026-0004', 'condamnation non définitive', '2026-09-16'), null, 'autre date : conservé');
  eq(evenementDejaValide(ev, 'FR-2026-0004', 'condamnation non définitive', null), null, 'sans date écrite : conservé');
  eq(evenementDejaValide(ev, 'FR-2026-0001', 'condamnation non définitive', '2026-09-15'), null, 'autre affaire : conservé');
  eq(evenementDejaValide(ev, 'FR-2026-0004', 'relaxe / non-lieu / classement', '2026-09-15'), null, 'autre état : conservé');
});

console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
