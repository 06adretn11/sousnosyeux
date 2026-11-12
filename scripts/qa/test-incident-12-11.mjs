#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-incident-12-11.mjs — incidents du 12/11/2026 (doublon Discovery · alerte Maintenance), rejoués sur des DONNÉES SYNTHÉTIQUES
// (le dépôt est public : aucun nom réel, aucune affaire réelle, aucune page de presse reproduite).
//
//   Discovery — deux propositions « direction » / « enseignant » pour la même école, validées à deux minutes d'intervalle → deux fiches publiées.
//     1. même affaire validée deux fois → UNE seule affaire ; 2. rejeu et concurrence → aucune double création ;
//     3. même établissement, affaires distinctes → séparation ; 4. correspondance ambiguë → revue explicite.
//   Maintenance — deux faits d'une page de presse (une mobilisation « Montreuil », une mesure « Paris ») annoncés sous un seul territoire et vers un Hub et une
//     fiche, alors que les deux phrases venaient d'ARTICLES RECOMMANDÉS en bas de page.
//     5. territoires différents → aucune propagation croisée ; 6. mesure parisienne transversale → Hub du 11e, qualifiée ; 7. preuve ou portée insuffisante →
//     aucune projection ; 8. destinations affichées = calcul réel de la projection.
//
// Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { readFileSync } from 'node:fs';
import { comparerSignaux, rolesCompatibles } from '../lib/rapprochement-garde.mjs';
import { verifierCreation, candidatsPertinents, payloadDeAffaire } from '../lib/garde-creation.mjs';
import { independantes, verifier, faitsContestes, resumeNeutre, sansNombreDEnfants, coupeMot } from '../lib/qualifier-signal.mjs';
import { messageDecision, messageEnrichissement } from '../lib/discovery-messages.mjs';
import { suiteClicNouvelle } from '../lib/telegram-clics.mjs';
import { extraireCorps } from '../lib/corps-article.mjs';
import { extraireReactions, separerParPortee, planSeulementEnContexte } from '../lib/evenement-institutionnel.mjs';
import { estFaitDeTerritoireNomme } from '../lib/pistes.mjs';
import { destinationsDe, pagesParFait, pagesSiValide, construireMatiere, territoireDansHub } from '../lib/destinations.mjs';

let ko = 0;
const test = (nom, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}`); if (!cond) ko++; };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

// --- fabriques synthétiques ---------------------------------------------------------------------------------------------------------
const U = { a: 'https://presse-a.example/ecole-test-1', b: 'https://presse-b.example/ecole-test-2', c: 'https://presse-c.example/ecole-test-3', d: 'https://presse-d.example/autre-4' };
const prop = ({ commune = 'Ville-Test', etab = 'école maternelle Les Tilleuls', role = 'enseignant', urls, personnes = 1, structure = 'maternelle', stade = 'enquête' }) => ({
  commune, etablissement: etab, etablissement_nomme: !/non nomm/i.test(etab), structure, stade_minimal: stade, personnes, periode_faits: null,
  fiche: { departement: 'Test', role_mis_en_cause: role, crit_etablissement_nomme: !/non nomm/i.test(etab), type_structure: structure, type_affaire: 'agression sexuelle' },
  articles: urls.map((u) => ({ url: u, media: u, published: '2026-11-11' })),
  evidence: urls.map((u) => ({ url: u, media: u, quote: `Citation de ${u} suffisamment longue pour compter.`, published: '2026-11-11' })),
  unknowns: [],
});
// Une affaire de la base : celle qu'une première proposition a créée (ses sources + le payload d'origine).
const casDe = (id, p, extra = {}) => ({ case_id: id, etablissement: p.etablissement, commune: p.commune, departement: p.fiche.departement, type_structure: p.fiche.type_structure,
  role: p.fiche.role_mis_en_cause, publication_status: 'publiée', created_at: '2026-11-12T13:59:26Z', urls: p.articles.map((a) => a.url), origine: p, ...extra });
const EMISE = '2026-11-12T13:44:56Z';

console.log('1. Deux propositions de la MÊME affaire, validées successivement → une seule affaire');
const P1 = prop({ role: 'enseignant', urls: [U.a, U.b] });                    // créée en premier (« enseignant »)
const P2 = prop({ role: 'direction', urls: [U.c, U.b, U.a] });                // 24 s plus tard : « direction », pages partagées avec P1
const K1 = casDe('FR-2026-0900', P1);
test('« direction » / « enseignant » : rôles compatibles (le directeur d’une maternelle enseigne), jamais une contradiction', rolesCompatibles('direction', 'enseignant') && rolesCompatibles('enseignant', 'direction'));
test('animateur périscolaire / enseignant : toujours une contradiction (invariant Aqueduc)', !rolesCompatibles('animateur périscolaire', 'enseignant'));
test('émission : P1 et P2 sont jugées « même affaire » (établissement, 1 personne, page citée en commun) — avant, la seule contradiction était le rôle', comparerSignaux(P1, P2).verdict === 'meme');
test('rôles compatibles SANS page commune → ambigu, jamais fusionné automatiquement', comparerSignaux(P1, prop({ role: 'direction', urls: [U.d] })).verdict === 'ambigu');
test('rôles compatibles, nombre de personnes différent → distinct', comparerSignaux(P1, prop({ role: 'direction', urls: [U.a], personnes: 2 })).verdict === 'distinct');
const g = verifierCreation({ payload: P2, candidats: candidatsPertinents([K1], P2, EMISE) });
test('application : la fiche créée entre-temps par la proposition sœur est vue → rattachement, AUCUNE seconde création', g.decision === 'rattacher' && g.case_id === 'FR-2026-0900');
test('application sans fiche sœur → création normale', verifierCreation({ payload: P2, candidats: [] }).decision === 'creer');

console.log('\n2. Rejeu et concurrence → aucune double création');
const a = src('scripts/appliquer-nouvelles-affaires.mjs');
test('la garde est posée AVANT l’écriture et seulement pour une création (ni rejet, ni reprise d’une fiche déjà créée)', a.includes('if (!rejet && !r.created_case_id) {') && a.indexOf('controlerCreation(r, p, f)') < a.indexOf('with nxt as ('));
test('écriture conditionnée à l’état vu par le contrôle : aucune fiche apparue entre-temps (plus grand numéro inchangé)', a.includes('where (${maxVu}::int is null or nxt.m = ${maxVu}::int)'));
test('la proposition n’est JAMAIS marquée appliquée si rien n’a été écrit', a.includes('and applied_at is null and exists (select 1 from c)'));
test('une base modifiée pendant le contrôle → rien n’est écrit, contrôle refait au passage suivant', a.includes('la base a changé pendant le contrôle'));
test('rejeu d’une proposition déjà créée : jamais une seconde fiche (created_case_id)', a.includes('if (!r.created_case_id) try { cree = await sql`'));
test('même affaire certaine : sources rattachées, created_case_id = l’affaire existante, AUCUNE publication déclenchée par ce chemin',
  (() => { const bloc = a.slice(a.indexOf("g.decision === 'rattacher'"), a.indexOf("g.decision === 'revue'")); return bloc.includes('rattacherSources(sql, {') && bloc.includes('created_case_id = ${cible}') && !bloc.includes('publierGo'); })());
test('workflows : une seule exécution à la fois (même groupe de concurrence) pour tous les consommateurs de décisions', ['sny-clics', 'sny-cycle', 'sny-discovery', 'sny-telegram'].every((w) => /group: sny-telegram/.test(src(`.github/workflows/${w}.yml`))));
// Simulation séquentielle : la 2e proposition est contrôlée APRÈS la création de la 1re (même exécution, ou exécution suivante).
const base = [];
const traiter = (p, emise) => { const d = verifierCreation({ payload: p, candidats: candidatsPertinents(base, p, emise) }); if (d.decision === 'creer') base.push(casDe(`FR-2026-09${base.length + 1}0`, p, { created_at: '2026-11-12T13:59:26Z' })); return d.decision; };
test('deux propositions émises ensemble, appliquées l’une après l’autre : creer puis rattacher → UNE seule affaire en base', traiter(P1, EMISE) === 'creer' && traiter(P2, EMISE) === 'rattacher' && base.length === 1);
test('rejeu de la 2e (déjà rattachée) : toujours rattacher, jamais creer', traiter(P2, EMISE) === 'rattacher' && base.length === 1);

console.log('\n3. Même établissement, affaires distinctes → séparation préservée');
const Pa = prop({ etab: 'école élémentaire Les Chênes', role: 'animateur périscolaire', structure: 'élémentaire', urls: [U.a] });
const Pe = prop({ etab: 'école élémentaire Les Chênes', role: 'enseignant', structure: 'élémentaire', urls: [U.d] });
test('même école, animateur / enseignant, pages différentes → verdict distinct → création', comparerSignaux(Pa, Pe).verdict === 'distinct' && verifierCreation({ payload: Pe, candidats: candidatsPertinents([casDe('FR-2026-0901', Pa)], Pe, EMISE) }).decision === 'creer');
test('même école, même rôle, même article… mais nombre de personnes différent → création (deux procédures)', verifierCreation({ payload: prop({ urls: [U.a], personnes: 2 }), candidats: [casDe('FR-2026-0902', prop({ urls: [U.a], personnes: 1 }))] }).decision === 'creer');
test('autre établissement nommé dans la même commune → création, même créé après l’émission', verifierCreation({ payload: P1, candidats: candidatsPertinents([casDe('FR-2026-0903', prop({ etab: 'école maternelle Les Acacias', urls: [U.d] }))], P1, EMISE) }).decision === 'creer');
test('une affaire plus ancienne qui ne cite aucune page de la proposition n’est pas remise en cause (déjà examinée à l’émission)', candidatsPertinents([casDe('FR-2026-0010', prop({ urls: [U.d] }), { created_at: '2026-10-01T10:00:00Z' })], P1, EMISE).length === 0);
test('décision antérieure de maintien séparé : respectée (l’affaire écartée n’est jamais rapprochée)', verifierCreation({ payload: P2, candidats: [K1], exclus: ['FR-2026-0900'] }).decision === 'creer');
test('CRÉER choisi par l’éditeur contre un candidat de rattachement = maintien séparé (le contrôle exclut ce candidat)', a.includes("r.action === 'CREATE' ? [r.attach_case_id, p.attach?.case_id]"));

console.log('\n4. Correspondance ambiguë → revue explicite (ni création, ni rattachement)');
const Pamb = prop({ etab: 'école maternelle Les Tilleuls', role: 'autre', urls: [U.d] });
const gamb = verifierCreation({ payload: Pamb, candidats: candidatsPertinents([casDe('FR-2026-0904', prop({ role: 'autre', urls: [U.a] }))], Pamb, EMISE) });
test('même établissement, rôle non précisé, aucune page commune, fiche créée depuis l’émission → revue', gamb.decision === 'revue');
test('même affaire APPARENTE sans page citée en commun → revue (jamais un rattachement sur critères faibles)', verifierCreation({ payload: prop({ urls: [U.d] }), candidats: [casDe('FR-2026-0905', prop({ urls: [U.a] }))] }).decision === 'revue');
test('deux affaires existantes également compatibles → revue (aucune fusion par transitivité)', verifierCreation({ payload: P2, candidats: [casDe('FR-2026-0906', P1), casDe('FR-2026-0907', P1)] }).decision === 'revue');
test('une affaire RETIRÉE qui correspond n’est jamais la cible d’un rattachement automatique → revue', verifierCreation({ payload: P2, candidats: [casDe('FR-2026-0908', P1, { publication_status: 'retirée' })] }).decision === 'revue');
test('la revue est dite une seule fois, sans écriture de fiche, avec l’arbitrage attendu', a.includes("resultat: 'revue_doublon'") && a.includes('Aucune fiche créée, aucun rattachement'));

console.log('\n   Message d’accusé du clic « VALIDER ET PUBLIER » (Discovery)');
const sd = suiteClicNouvelle({ action: 'CREATE', directe: true, webhook: true });
test('le clic qui PORTE le GO ne dit pas « publication jamais automatique » : l’autorisation est reçue, la publication suit après contrôles', !/jamais automatique/.test(sd) && /Autorisation de publication reçue/.test(sd) && /après les contrôles/.test(sd) && /site servi/.test(sd));
test('création documentaire (sans GO) : la publication exige un GO explicite', /GO explicite/.test(suiteClicNouvelle({ action: 'CREATE', directe: false, webhook: false })));
test('rapprochement : aucune phrase sur la « nouvelle affaire »', !/Nouvelle affaire/.test(suiteClicNouvelle({ action: 'ATTACH', directe: false, webhook: true })));
test('l’accusé du clic Maintenance ne parle plus de « nouvelle affaire »', !/jamais automatique/.test(src('scripts/telegram-v0.mjs')) && src('scripts/telegram-v0.mjs').includes('suiteClicNouvelle({ action, directe'));

console.log('\n   Fidélité des résumés et des sources (Discovery)');
const T = (t) => ({ corps: t });
const longue = (n) => `Phrase originale numéro ${n} suffisamment longue pour compter dans la comparaison des textes entre les pages.`;
const midi = T([1, 2, 3, 4].map(longue).join(' ') + ' Selon nos informations, une enquête est ouverte.');
const actu = T([5, 6, 7, 8].map(longue).join(' ') + ' Selon des informations recueillies par la rédaction, une enquête est ouverte.');
const relais = T('Le directeur a été placé en garde à vue, selon plusieurs médias locaux. Une enquête est ouverte à la suite du signalement d’une mère.');
test('deux articles à information originale = 2 sources indépendantes', independantes([midi, actu]) === 2);
test('un article qui dit tenir l’information « de plusieurs médias locaux » est un relais : trois éditeurs, DEUX origines', independantes([midi, actu, relais]) === 2);
test('un relais seul compte pour une (jamais zéro)', independantes([relais]) === 1);
const lignes = messageDecision({ ...prop({ urls: [U.a, U.b, U.c] }), commune: 'Ville-Test', resume: 'Selon la presse, une enquête est ouverte.', medias: 3, independantes: 2, dernier_evenement: '2026-11-09', recommendation: 'NEW_CASE_CANDIDATE' }, 'NEW_CASE_CANDIDATE');
test('le message ne confond pas éditeurs et origines : « 3 éditeur(s) · 2 source(s) indépendante(s) — les autres éditeurs reprennent ou relaient »', /3 éditeur\(s\) · 2 source\(s\) indépendante\(s\) — les autres éditeurs reprennent ou relaient/.test(lignes));
const ambig = 'Les articles divergent sur la procédure : un média indique que le mis en cause n’a été ni entendu ni placé en garde à vue, tandis qu’un autre rapporte son interpellation et son placement en garde à vue le 9 novembre.';
const resumeContesté = 'Selon la presse, un agent d’une école maternelle de Ville-Test a été interpellé et placé en garde à vue, suspecté d’agressions sur une douzaine d’enfants.';
test('un acte de procédure à la fois CONTESTÉ par la réserve et AFFIRMÉ par le résumé est repéré', faitsContestes(resumeContesté, ambig).join() === 'garde à vue,interpellation');
test('sans divergence déclarée, rien n’est neutralisé', faitsContestes(resumeContesté, 'établissement non confirmé').length === 0);
const pagesV = [{ url: U.a, media: 'A', published: '2026-11-11', corps: 'Le directeur de l’école maternelle Les Tilleuls à Ville-Test est soupçonné. Une enquête préliminaire est ouverte au service de police judiciaire. '.repeat(2) }];
const rep = { est_affaire: true, commune: 'Ville-Test', departement: 'Test', etablissement: 'école maternelle Les Tilleuls', type_structure: 'maternelle', role_mis_en_cause: 'direction', type_affaire: 'agression sexuelle', statut_judiciaire: 'enquête',
  statut_des_faits: 'allégué', enfants_concernes_public: 'plusieurs enfants', nombre_personnes_mises_en_cause: 1, resume: resumeContesté, dernier_evenement: '2026-11-09', ambiguite: ambig,
  preuves: [{ url: U.a, citation: 'Une enquête préliminaire est ouverte au service de police judiciaire.' }] };
const v = verifier(rep, pagesV, '2026-11-12');
test('verifier : le résumé qui affirmait un fait contesté est remplacé par une formulation neutre bâtie sur les champs vérifiés', v.ok && !/garde à vue|interpell/.test(v.c.resume.replace(/\(garde à vue, interpellation\)/, '')) && /Les sources divergent/.test(v.c.resume) && v.c.resume_neutralise.length === 2);
test('verifier : la divergence reste affichée, entière (jamais coupée au milieu d’un mot)', v.c.ambiguite === ambig);
test('le nombre d’enfants (« une douzaine d’enfants », « 22 enfants ») n’apparaît jamais dans un résumé', sansNombreDEnfants('soupçonné sur une douzaine d’enfants, et 22 enfants entendus') === 'soupçonné sur plusieurs enfants, et plusieurs enfants entendus');
test('une réserve longue est abrégée à un mot entier, avec ellipse', /\p{L}…$/u.test(coupeMot(ambig, 120)) && coupeMot(ambig, 120).length <= 120 && coupeMot('court', 120) === 'court');
test('le message annonce un résumé volontairement neutre et ne tronque pas la divergence', /Résumé volontairement neutre/.test(messageDecision({ ...prop({ urls: [U.a, U.b] }), resume: resumeNeutre({ commune: 'Ville-Test', type_structure: 'maternelle', statut_judiciaire: 'enquête' }, ['garde à vue']), avertissement: ambig, resume_neutralise: ['garde à vue'], medias: 2, independantes: 2 }, 'NEW_CASE_CANDIDATE')) && messageDecision({ ...prop({ urls: [U.a, U.b] }), resume: 'x'.repeat(40), avertissement: ambig, medias: 2, independantes: 2 }, 'NEW_CASE_CANDIDATE').includes('le 9 novembre.'));
const msgVoisines = messageDecision({ ...prop({ urls: [U.a, U.b] }), resume: 'Selon la presse, une enquête est ouverte à Ville-Test.', medias: 2, independantes: 2,
  possible_matches_sny: [{ case_id: 'FR-2026-0126', etablissement: 'école maternelle Les Acacias', role: 'animateur périscolaire', statut: 'enquête' }, { case_id: 'FR-2026-0127', etablissement: 'école maternelle Les Tilleuls', role: 'animateur périscolaire', statut: 'enquête' }] }, 'NEW_CASE_CANDIDATE');
test('affaires voisines : « autre établissement » seulement si les deux noms sont écrits et distincts ; même établissement dit comme tel', /FR-2026-0126 — autre établissement/.test(msgVoisines) && /FR-2026-0127 — même établissement, rôle ou procédure à comparer/.test(msgVoisines));

console.log('\n   Corps d’article : recommandations, commentaires et styles ne sont pas l’article');
const PAGE = `<html><head><title>Titre de l’article</title><style>.a{color:red} @font-face{font-family:x}</style><script type="application/ld+json">{"datePublished":"2026-09-24T08:00:00+02:00"}</script></head><body>
<article><div class="fig-content-body"><p class="fig-paragraph">Un intervenant d’une école maternelle privée a été mis en examen et écroué jeudi pour des faits visant plusieurs élèves de l’établissement.</p>
<p class="fig-paragraph">La direction de l’école a signalé les faits au procureur dès qu’elle a eu connaissance de la plainte déposée par un parent d’élève.</p></div></article>
<ul class="comments-list"><li><p class="site-comment__text">Commentaire de lecteur sans rapport avec les faits, suffisamment long pour dépasser la limite de soixante caractères.</p></li></ul>
<section id="next" class="site-article-next">
<article class="card ranking-profile-container suggested"><figure><div class="img-wrap"><img src="x.jpg"/></div></figure><div class="legend">Légende</div>
<p class="ranking-profile-standfirst">DÉCRYPTAGE - Un autre procès, dans une autre ville : les parents sont appelés à se mobiliser ce jeudi à Ville-Voisine pour une autre affaire.</p></article>
<article class="card ranking-profile-container suggested"><div><div>x</div></div><p class="ranking-profile-standfirst">Présentée par le maire comme l’une des mesures phare de son plan d’action, la convention citoyenne a rendu ses conclusions le 23 juin.</p></article>
</section></body></html>`;
const lu = extraireCorps(PAGE, 'https://presse.example/article-20260924');
test('le corps contient l’article', /mis en examen et écroué/.test(lu.corps) && /signalé les faits au procureur/.test(lu.corps));
test('les « articles recommandés » (cartes avec <div> internes), même enchaînés, sont exclus du corps', !/Ville-Voisine|convention citoyenne|plan d’action/.test(lu.corps));
test('les commentaires de lecteurs sont exclus', !/Commentaire de lecteur/.test(lu.corps));
test('feuilles de style et scripts ne sont jamais du texte d’article', !/font-face|color:red/.test(lu.corps));
test('la date de publication reste lue (JSON-LD de la page brute)', lu.publie_le === '2026-09-24');
test('« À lire aussi » reste une piste (lien associé), jamais une preuve', (() => { const l = extraireCorps('<html><body><p class="x">Un article assez long pour être retenu comme paragraphe du corps de la page de presse en cours de lecture.</p><div class="read-more"><p><a href="/autre">Un autre article lié, à lire aussi pour comprendre le contexte complet de cette affaire</a> et son contexte.</p></div></body></html>', 'https://presse.example/x'); return /autre article lié/.test(l.liens_associes.map((x) => x.titre).join()) && !/autre article lié/.test(l.corps); })());

console.log('\n   Doublon réconcilié : l’ancienne adresse est préservée (alias d’ancre), rien n’est supprimé');
{
  const idx = src('web/src/pages/index.astro').replace(/\r\n/g, '\n');
  const red = JSON.parse(src('data/redirections-affaires.json'));
  const cases = JSON.parse(src('data/cases.json')).cases.map((c) => c.case_id.toLowerCase());
  const cons = src('scripts/consolider-doublon.mjs');
  test('la page d’accueil lit l’alias et réécrit le fragment vers l’affaire conservée (sans nouvelle entrée d’historique, seulement si l’ancienne ancre n’existe plus)', idx.includes("id=\"redirections-affaires\"") && idx.includes("history.replaceState(null, '', `#affaire-${alias}`)") && idx.includes("!document.getElementById(`affaire-${id.toLowerCase()}`)"));
  test('chaque alias mène à une affaire PUBLIQUE et ne désigne jamais une affaire encore publique', Object.entries(red.redirections).every(([ancien, cible]) => cases.includes(cible) && !cases.includes(ancien)));
  test('le script de consolidation ne supprime rien : réaffectation, retrait (pas de delete), revues, note sur la proposition, alias', !/\bdelete\s+from\b|\bdrop\b|\btruncate\b/i.test(cons) && cons.includes("publication_status = 'retirée'") && cons.includes('insert into reviews') && cons.includes('decision_comment') && cons.includes('redirections'));
  test('refus d’une consolidation entre communes différentes ou vers une fiche non publique (échec fermé)', cons.includes('communes différentes') && cons.includes('n’est pas publique'));
}

console.log('\nMaintenance — des faits de portées différentes ne se décident pas ensemble');
const OPTS = { etablissement: 'école privée Les Tilleuls', anneeRef: '2026-09-24', lieAffaire: true, commune: 'Paris 10e' };
test('une remise de conclusions « présentée comme mesure de son plan d’action » n’est pas l’annonce d’un plan', extraireReactions('Présentée par le maire de Paris comme l’une des mesures phare de son plan d’action contre les violences aux enfants, la convention citoyenne a rendu ses conclusions le 23 juin.', OPTS).length === 0
  && planSeulementEnContexte('la convention citoyenne a rendu ses conclusions le 23 juin, mesure de son plan d’action'));
test('une vraie annonce de plan reste reconnue (la correction ne supprime pas les faits établis)', extraireReactions('Le maire de Paris a annoncé un plan d’action pour renforcer l’encadrement des enfants dans les écoles de la Ville.', OPTS).some((f) => f.mesure === 'plan_action_encadrement'));
test('une phrase qui nomme deux territoires (« le 7e arrondissement parisien et Montreuil ») n’en attribue aucun : territoire non établi', extraireReactions('Les parents sont appelés à se mobiliser ce jeudi dans le 7e arrondissement parisien et à Montreuil.', OPTS).every((f) => !f.territoire));
const F = (o) => ({ event_type: 'mobilisation', nature: 'mobilisation', mesure: 'mobilisation', portee: 'territoire', realisation: 'annoncée', evidence: ['x'], libelle_public: 'Selon la presse, des parents ont annoncé une mobilisation.', ...o });
const groupes = separerParPortee([F({ territoire: 'Montreuil' }), F({ nature: 'mesure', mesure: 'plan_action_encadrement', territoire: 'Paris' }), F({ portee: 'établissement', territoire: null })]);
test('un fait d’affaire, un fait « Montreuil », un fait « Paris » : TROIS décisions, ordre déterministe (l’affaire d’abord)', groupes.length === 3 && groupes[0].cle === 'affaire' && groupes[1].cle === 'territoire|montreuil' && groupes[2].cle === 'territoire|paris');
test('deux faits du même territoire restent une seule décision', separerParPortee([F({ territoire: 'Paris' }), F({ territoire: 'paris', mesure: 'petition' })]).length === 1);
test('la Maintenance écrit UNE proposition par portée (suffixe d’empreinte pour les suivantes, clé du premier groupe inchangée)', src('scripts/maintenance-cycle.mjs').includes('separerParPortee(reactions)') && src('scripts/maintenance-cycle.mjs').includes('${base.content_fingerprint}~${i + 1}'));

// Contexte de projection synthétique : Hub « Paris 11e » publié (blocs existants), une affaire de Paris 10e à fiche approuvée, une affaire sous HOLD, une affaire non publique.
const ctx = {
  publiques: new Set(['FR-P10', 'FR-HOLD']), holds: new Set(['FR-HOLD']), approuvees: new Set(['FR-P10']),
  cases: new Map([['FR-P10', { commune: 'Paris 10e', departement: 'Paris', etablissement: 'école privée Les Tilleuls' }], ['FR-HOLD', { commune: 'Paris 10e', departement: 'Paris', etablissement: 'école X' }], ['FR-CAND', { commune: 'Paris 10e', departement: 'Paris', etablissement: 'école Y' }]]),
  hubs: { 'paris-11e': { publie: true, groupes: ['Familles et associations', 'Ville de Paris et mairie du 11e'], items: {} } },
};
const mesureParis = { id: 'm1', case_id: 'FR-P10', nature: 'mesure', portee: 'territoire', territoire: 'Paris', libelle: 'l', date: '2026-06-23' };
const mobMontreuil = { id: 'm2', case_id: 'FR-P10', nature: 'mobilisation', portee: 'territoire', territoire: 'Montreuil', libelle: 'l', date: '2026-09-24' };
const mobSept = { id: 'm3', case_id: 'FR-P10', nature: 'mobilisation', portee: 'territoire', territoire: 'Paris 7e', libelle: 'l', date: '2026-09-24' };
const mobSansTerr = { id: 'm4', case_id: 'FR-P10', nature: 'mobilisation', portee: 'territoire', territoire: null, libelle: 'l', date: '2026-09-24' };
const mobOnze = { id: 'm5', case_id: 'FR-P10', nature: 'mobilisation', portee: 'territoire', territoire: 'Paris 11e', libelle: 'l', date: '2026-09-24' };
console.log('5. Faits de territoires différents : aucune propagation croisée');
const dM = destinationsDe(mobMontreuil, ctx), d7 = destinationsDe(mobSept, ctx);
test('« Montreuil » : ni le Hub Paris 11e, ni la fiche d’une affaire de Paris 10e (la provenance n’est pas la portée)', dM.hubs.length === 0 && dM.fiche === null);
test('« Paris 7e » : ni le Hub du 11e, ni la fiche — une mobilisation dans le 7e ne concerne pas le 11e sans preuve de ce lien', d7.hubs.length === 0 && d7.fiche === null && !territoireDansHub('Paris 7e', { ville: 'paris', arrondissement: 11 }, new Map()));
test('« Paris 11e » : le Hub du 11e (son arrondissement)', destinationsDe(mobOnze, ctx).hubs.some((h) => h.hub === 'paris-11e') && territoireDansHub('Paris 11e', { ville: 'paris', arrondissement: 11 }, new Map()));
console.log('\n6. Mesure parisienne réellement transversale : rattachement possible au Hub du 11e, correctement qualifié');
const dP = destinationsDe(mesureParis, ctx);
test('mesure de « Paris » (toute la Ville) : Hub Paris 11e, dans le bloc existant « Ville de Paris et mairie du 11e », et fiche de l’affaire parisienne approuvée', dP.hubs.length === 1 && dP.hubs[0].hub === 'paris-11e' && dP.hubs[0].groupe === 'Ville de Paris et mairie du 11e' && dP.fiche === 'FR-P10');
test('l’absence de l’affaire d’origine du Hub du 11e (affaire du 10e) n’exclut pas une mesure applicable à toute la Ville', territoireDansHub('Paris', { ville: 'paris', arrondissement: 11 }, new Map()));
console.log('\n7. Preuve ou portée insuffisante : aucune projection injustifiée');
test('territoire non établi par la source → aucune destination (jamais déduite de la fiche d’où l’on est parti)', destinationsDe(mobSansTerr, ctx).hubs.length === 0 && destinationsDe(mobSansTerr, ctx).fiche === null);
test('affaire non publique ou sous HOLD → aucune destination pour un fait propre', destinationsDe({ ...mesureParis, case_id: 'FR-CAND', portee: 'établissement' }, ctx).fiche === null && destinationsDe({ ...mesureParis, case_id: 'FR-HOLD', portee: 'établissement' }, ctx).hubs.length === 0);
console.log('\n   Phrase à plusieurs territoires : prudence ≠ disparition (revue explicite, rien de rattaché)');
{
  const multi = extraireReactions('Les parents sont appelés à se mobiliser ce jeudi dans le 7 e arrondissement parisien et à Montreuil.', OPTS);
  const f = multi[0];
  test('le fait n’est PAS abandonné : il garde la liste des territoires nommés, sans en retenir un seul', multi.length === 1 && !f.territoire && f.territoires.join() === 'Paris 7e,Montreuil');
  test('reçu via un article lié (piste), il reste retenu : proposé à l’éditeur, jamais supprimé en silence', estFaitDeTerritoireNomme(f) && !estFaitDeTerritoireNomme({ ...f, territoires: undefined }));
  test('aucune destination déduite (ni Hub, ni fiche) : aucun mauvais rattachement', destinationsDe({ ...f, case_id: 'FR-P10', nature: 'mobilisation', libelle: 'l' }, ctx).hubs.length === 0 && destinationsDe({ ...f, case_id: 'FR-P10', nature: 'mobilisation', libelle: 'l' }, ctx).fiche === null);
  const pf1 = pagesParFait([{ ...f, case_id: 'FR-P10', nature: 'mobilisation' }], ctx, 'https://site.example')[0];
  test('l’éditeur est prévenu : « plusieurs territoires nommés », aucune page déduite, décision à lui', pf1.pages.length === 0 && /plusieurs territoires \(Paris 7e, Montreuil\)/.test(pf1.aucune) && /reste proposé à votre décision/.test(pf1.aucune));
  const m = messageEnrichissement({ etablissement: 'école privée Les Tilleuls', commune: 'Paris 10e', courant: 'mise en examen', media: 'Presse', publication_date: '2026-09-24', url: 'https://presse.example/a' }, [f], true, [], pagesParFait([{ ...f, case_id: 'FR-P10', nature: 'mobilisation' }], ctx).map((x) => x));
  test('le message dit « plusieurs territoires nommés (Paris 7e · Montreuil) — aucun n’est retenu seul »', /plusieurs territoires nommés \(Paris 7e · Montreuil\) — aucun n’est retenu seul/.test(m));
}

console.log('\n8. Cohérence : destinations affichées = calcul réel de la projection');
const tous = [mesureParis, mobMontreuil, mobSept, mobSansTerr, mobOnze];
const pf = pagesParFait(tous, ctx, 'https://site.example');
const reel = tous.map((f) => construireMatiere([{ ...f, source: { url: 'u' } }], ctx));
test('pour chaque fait : « des pages sont annoncées » ⇔ « la projection retient ce fait »', pf.every((x, i) => (x.pages.length > 0) === (reel[i].matiere.length > 0)));
test('chaque fait sans page dit POURQUOI (jamais « rien » sans raison)', pf.filter((x) => !x.pages.length).every((x) => typeof x.aucune === 'string' && x.aucune.length > 20));
test('la liste à plat (compatibilité) est l’union des pages de chaque fait', JSON.stringify(pagesSiValide(tous, ctx, 'https://site.example')) === JSON.stringify([...new Set(pf.flatMap((x) => x.pages))]));
const neufs = [{ ...F({ territoire: 'Montreuil', event_date: '2026-09-24', acteur: 'parents', evidence: ['Phrase de preuve de la mobilisation à Montreuil, longue et terminée.'] }) },
  { ...F({ nature: 'mesure', mesure: 'plan_action_encadrement', territoire: 'Paris', event_date: '2026-06-23', acteur: 'maire', libelle_public: 'Selon la presse, la collectivité a annoncé un plan d’action.', evidence: ['Phrase de preuve du plan de la Ville de Paris, longue et terminée.'] }) }];
const msg = messageEnrichissement({ etablissement: 'école privée Les Tilleuls', commune: 'Paris 10e', courant: 'mise en examen', media: 'Presse', publication_date: '2026-09-24', url: 'https://presse.example/a' }, neufs, true, null, pagesParFait(neufs.map((f) => ({ ...f, case_id: 'FR-P10' })), ctx, 'https://site.example'));
test('message mixte : chaque fait porte SA portée et SES pages ; aucun en-tête « Territoire : Montreuil » pour l’ensemble', !/Territoire : Montreuil/.test(msg) && /PORTÉES DIFFÉRENTES/.test(msg) && /1\. .*[\s\S]*Portée : territoire « Montreuil »[\s\S]*Aucune page publique/.test(msg) && /2\. [\s\S]*Portée : territoire « Paris »[\s\S]*Hub Paris 11e|2\. [\s\S]*Portée : territoire « Paris »[\s\S]*Hub paris-11e/.test(msg));
test('la provenance est dite comme telle (ni portée, ni destination) et l’état judiciaire n’est pas concerné', /Provenance seulement/.test(msg) && /l’état judiciaire de l’affaire n’est pas concerné/.test(msg));
test('aucune publication immédiate promise : seule la conservation en mémoire est prévue au clic', /aucune mise à jour publique immédiate n’est promise/.test(msg));
const msgUn = messageEnrichissement({ etablissement: 'école privée Les Tilleuls', commune: 'Paris 10e', courant: 'mise en examen', media: 'Presse', publication_date: '2026-09-24', url: 'https://presse.example/a' }, [neufs[1]], true, pagesSiValide([{ ...mesureParis }], ctx, 'https://site.example'));
test('message à un seul territoire : format d’origine conservé, avec la précision « le clic lui-même ne publie rien »', /Territoire : Paris/.test(msgUn) && /le clic lui-même ne publie rien/.test(msgUn));

console.log(ko ? `\n${ko} échec(s)` : '\nOK');
process.exit(ko ? 1 : 0);
