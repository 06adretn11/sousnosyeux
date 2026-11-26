#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-paroles-attribuees.mjs — les paroles attribuées d'une source lue alimentent le circuit existant (cas BFMTV Baudin–Titon, 23/11/2026)
//
// Texte SYNTHÉTIQUE qui reprend la STRUCTURE de l'article réel (deux écoles voisines, avocates, porte-parole, parents anonymisés par prénom d'emprunt à astérisque, une personne mise en
// cause désignée par prénom + initiale, une déclaration sans attribution) : aucun nom réel, aucun extrait de l'article.
//   node scripts/qa/test-paroles-attribuees.mjs        Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { extraireParoles } from '../lib/paroles-attribuees.mjs';
import { dejaConnu, dejaConnuChezVoisines, memeFait } from '../lib/nouveaute.mjs';
import { dejaPublie } from '../lib/fait-deja-publie.mjs';

let ok = 0, ko = 0;
const test = (nom, fn) => {
  try { fn(); ok++; console.log(`  ✔ ${nom}`); }
  catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); }
};
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
console.log('\n  paroles attribuées — locuteur, anonymat, rattachement, identité\n');

const ARTICLE = `"La colère des parents des écoles Tournesol et Bellevue après deux relaxes"

Une manifestation devant l'école maternelle Tournesol, à Ville-Exemple, après la relaxe de l'ancien animateur Paul X. - Photo d'agence

Alors que plusieurs procès se sont tenus, les parents d'élèves des écoles Tournesol et Bellevue ont appris deux relaxes. Réunis jeudi 9 juillet, ils ont exprimé leur colère.

"Nous croyons en la justice, mais cette décision nous révolte, c'est une erreur grave", dénoncent les avocates Me Alix Marin et Jo Lenoir. "Un enfant ne simule pas. Les corps de ces enfants ont parlé. Pour ces huit enfants, cette décision est une violence de plus. Ces enfants méritent d'être crus."

Paul X., 36 ans, était poursuivi pour agressions sexuelles sur huit enfants scolarisés à l'école Tournesol.

Une motivation qui heurte les parents: "Je n'ai jamais reparlé à mon fils de tout ça. On se sent trahis, ridiculisés de s'être battus autant de temps", déplore Camille*, la maman de l'un des enfants ayant dénoncé des violences de la part de Paul X.

"Ces parents ne se connaissaient pas et ont été réunis par le malheur, et cette solidarité, on l'a retournée contre eux", dénonce de son côté Dominique Roche, du collectif #Ensemble, qui pointe la victimisation secondaire.

"On est heureux qu'il y ait un appel, mais l'appel ne concerne pas notre enfant", témoigne Sacha*, père d'une enfant ayant porté plainte.

"Pour nous, c'est un coup de grâce. On s'est sentis achevés. Le coup est rude."

Noémie, maman d'une élève scolarisée à l'école Bellevue, se joint à leur peine. Elle-même a vu l'animateur dénoncé par sa fille être relaxé en juin.

"Alors qu'un casseur écope de dix mois de prison, ces hommes qui ont altéré la vie de nos enfants sont relaxés", prononce-t-elle lors d'une prise de parole. Le parquet a également fait appel de la relaxe de l'animateur de l'école Bellevue.`;

const BASE = { anneeRef: '2026-07-10', commune: 'Ville-Exemple 11e' };
const TOURNESOL = { ...BASE, etablissement: 'École maternelle Tournesol', autres: ['École Bellevue'], caseId: 'T-1' };
const BELLEVUE = { ...BASE, etablissement: 'École Bellevue', autres: ['École maternelle Tournesol'], caseId: 'T-2' };
const REGISTRE = [{ alias: ['Alix Marin', 'Jo Lenoir'], affaires_rattachees: ['T-1'], qualite_registre: 'avocates de familles de l’école Tournesol (sources indépendantes)' }];
const acteurs = (r) => r.faits.map((f) => f.acteur);

test('1. Tournesol : les parents anonymisés et la porte-parole sont repris TELS QUE LE MÉDIA LES ÉCRIT (astérisque, qualité), rattachés à l’établissement', () => {
  const r = extraireParoles(ARTICLE, { ...TOURNESOL, registre: REGISTRE });
  const c = r.faits.find((f) => f.acteur === 'Camille*'), s = r.faits.find((f) => f.acteur === 'Sacha*'), d = r.faits.find((f) => f.acteur === 'Dominique Roche');
  vrai(c && s && d, `locuteurs : ${acteurs(r)}`);
  vrai(c.parole.qualite === 'la maman de l’un des enfants ayant dénoncé des violences'.replace('’', "'") || /maman de l'un des enfants ayant dénoncé des violences$/.test(c.parole.qualite), `qualité : ${c.parole.qualite}`);
  vrai(s.parole.qualite === 'père d\'une enfant ayant porté plainte' && d.parole.qualite === 'du collectif #Ensemble', `${s.parole.qualite} / ${d.parole.qualite}`);
  vrai([c, s, d].every((f) => f.portee === 'établissement' && f.nature === 'parole' && f.mesure === 'parole_attribuee'), 'portée / nature');
  vrai(/astérisque/.test(c.parole.contexte), 'l’astérisque du média est signalé, pas expliqué');
});
test('2. la force du propos est préservée MOT POUR MOT (aucune paraphrase) ; l’extrait est littéral dans l’article', () => {
  const r = extraireParoles(ARTICLE, { ...TOURNESOL, registre: REGISTRE });
  const c = r.faits.find((f) => f.acteur === 'Camille*');
  vrai(/On se sent trahis, ridiculisés de s'être battus autant de temps/.test(c.parole.citations[0].texte), c.parole.citations[0].texte);
  for (const f of r.faits) for (const x of f.parole.citations) vrai(ARTICLE.includes(x.texte.split(' […] ')[0]), `extrait non littéral : ${x.texte.slice(0, 50)}`);
  vrai(/^Parole attribuée — Camille\*/.test(c.libelle_public) && c.evidence.length >= 1, c.libelle_public.slice(0, 60));
});
test('3. la personne mise en cause (prénom + initiale) n’est JAMAIS reprise : la qualité est coupée avant elle', () => {
  const r = extraireParoles(ARTICLE, { ...TOURNESOL, registre: REGISTRE });
  const toutes = JSON.stringify(r.faits);
  vrai(!/Paul X\./.test(toutes) && !/ X\b/.test(toutes.replace(/Me Alix/g, '')), 'nom d’une personne mise en cause dans un fait');
});
test('4. une déclaration qui porte le NOMBRE d’enfants : cette phrase est écartée, les autres restent mot pour mot ; « un enfant » (générique) n’est pas un nombre', () => {
  const r = extraireParoles(ARTICLE, { ...TOURNESOL, registre: REGISTRE });
  const a = r.faits.filter((f) => /avocates/.test(f.acteur)).map((f) => f.parole.citations.map((c) => c.texte).join(' '));
  vrai(a.length === 2 && !a.some((t) => /huit/.test(t)), JSON.stringify(a));
  vrai(a.some((t) => /^Un enfant ne simule pas\./.test(t)) && a.some((t) => /méritent d'être crus/.test(t)), `extraits : ${JSON.stringify(a)}`);
});
test('5. les avocates : l’article ne dit pas pour quelle école ; le REGISTRE des acteurs (preuve hors de l’article) les rattache à Tournesol, et à elle seule', () => {
  const t = extraireParoles(ARTICLE, { ...TOURNESOL, registre: REGISTRE }), b = extraireParoles(ARTICLE, { ...BELLEVUE, registre: REGISTRE });
  vrai(t.faits.filter((f) => /avocates/.test(f.acteur)).every((f) => f.portee === 'établissement' && /registre/.test(f.parole.rattachement)), 'Tournesol : rattachement par le registre');
  vrai(!b.faits.some((f) => /avocates/.test(f.acteur)), 'les avocates ne sont pas attribuées à Bellevue');
  vrai(/registre des acteurs/.test(t.faits.find((f) => /avocates/.test(f.acteur)).parole.contexte), 'le contexte dit d’où vient le rattachement');
});
test('6. sans registre, des avocates dont l’article parle des DEUX écoles : portée commune (territoire), jamais devinée', () => {
  const r = extraireParoles(ARTICLE, { ...TOURNESOL, registre: [] });
  const av = r.faits.find((f) => /avocates/.test(f.acteur));
  vrai(av.portee === 'territoire' && av.territoire === 'Ville-Exemple 11e', `${av.portee} ${av.territoire}`);
});
test('7. Bellevue : « prononce-t-elle » renvoie à la maman NOMMÉE en tête du paragraphe précédent (qualité telle qu’écrite) ; les paroles de Tournesol ne lui sont pas attribuées', () => {
  const r = extraireParoles(ARTICLE, { ...BELLEVUE, registre: REGISTRE });
  vrai(acteurs(r).join() === 'Noémie', `locuteurs : ${acteurs(r)}`);
  const n = r.faits[0];
  vrai(/^maman d'une élève scolarisée à l'école Bellevue/.test(n.parole.qualite) && n.portee === 'établissement', `${n.parole.qualite} / ${n.portee}`);
  vrai(/prise de parole/.test(n.parole.contexte), 'la circonstance indiquée est conservée');
});
test('8. une déclaration SANS attribution est bloquée avec un motif précis (jamais attribuée à un locuteur deviné) ; un titre-promo entre guillemets aussi', () => {
  const r = extraireParoles(ARTICLE, { ...TOURNESOL, registre: REGISTRE });
  vrai(r.bloques.some((b) => /locuteur non indiqué/.test(b.motif) && /coup de grâce/.test(b.extrait)), JSON.stringify(r.bloques));
  vrai(!r.faits.some((f) => /coup de grâce/.test(JSON.stringify(f.parole.citations))), 'déclaration sans attribution proposée');
});
test('9. une personne mise en cause nommée dans la déclaration ou la qualité : fait BLOQUÉ avec motif', () => {
  const t = 'Titre\n\n"Je n’oublierai jamais ce que Paul X. a fait à notre petit garçon dans cette école Tournesol", confie Robin*, un père d’élève.';
  const r = extraireParoles(t, { ...TOURNESOL, registre: [] });
  vrai(r.faits.length === 0 && r.bloques.some((b) => /personne mise en cause/.test(b.motif)), JSON.stringify(r));
});
test('10. source SANS réaction exploitable (aucune déclaration, guillemets d’ironie, titre) : AUCUN fait, aucune proposition artificielle', () => {
  const sans = 'Titre de l’article\n\nUn animateur de l’école maternelle Tournesol a été placé en garde à vue mardi. La mairie a annoncé « une enquête interne » et un "plan" de formation.\n\nLe parquet n’a pas communiqué.';
  const r = extraireParoles(sans, { ...TOURNESOL, registre: [] });
  vrai(r.faits.length === 0 && r.bloques.length === 0, JSON.stringify(r));
});
test('11. identité : un fait déjà consigné/validé (même libellé) n’est pas reproposé ; deux paroles DIFFÉRENTES le même jour sont deux faits, jamais « le même type »', () => {
  const r = extraireParoles(ARTICLE, { ...TOURNESOL, registre: REGISTRE });
  const [a, b] = r.faits;
  vrai(dejaConnu(a, [{ event_type: 'parole', libelle_public: a.libelle_public }]), 'même libellé = connu');
  vrai(!dejaConnu(a, [{ event_type: 'parole', event_date: '2026-07-09', libelle_public: b.libelle_public }]), 'une autre parole n’est pas la même');
  vrai(!dejaConnu(a, [{ event_type: 'mobilisation', event_date: '2026-07-09', libelle_public: 'Rassemblement.' }]), 'un rassemblement n’est pas une parole');
  vrai(memeFait(a, { ...a }) && !memeFait(a, b), 'memeFait : même libellé seulement');
  vrai(dejaConnuChezVoisines(a, [{ event_type: 'parole', libelle_public: a.libelle_public }]) && !dejaConnuChezVoisines(a, [{ event_type: 'parole', event_date: a.event_date, libelle_public: b.libelle_public }]), 'voisines : libellé seulement');
});
test('12. une parole déjà dans la fiche publiée (même extrait) n’est pas une information à décider : au plus une source à rattacher', () => {
  const r = extraireParoles(ARTICLE, { ...TOURNESOL, registre: REGISTRE });
  const f = r.faits.find((x) => x.acteur === 'Camille*');
  const dossier = { reactions: [{ acteur: 'Camille*', citations: [{ texte: f.parole.citations[0].texte }], source: { url: 'https://exemple.invalid/a' } }] };
  vrai(dejaPublie(dossier, f, 'https://exemple.invalid/b')?.sourceDejaRattachee === false && dejaPublie(dossier, f, 'https://exemple.invalid/a')?.sourceDejaRattachee === true, 'déjà publiée');
  vrai(dejaPublie({ reactions: [] }, f, 'https://exemple.invalid/b') === null, 'absente de la fiche : à décider');
});

// ---- audit du 26/11/2026 : blocs de titres de la page et extraits inclus ----
const TITRES = ['Agressions sexuelles dans le périscolaire : la colère monte à Noyant-Villages', 'audio Enseigner les œuvres classiques nuit-elle à l’attrait de la littérature chez les jeunes ?',
  'Luis Enrique après l’hécatombe de blessures au PSG : "On va se mettre à pleurer ? Non"', '"Cela fait 20 ans qu’on nous ponctionne et la dette s’aggrave !", s’indigne une maire', 'Google accusé d’avoir coupé 250 000 arbres sans autorisation en Finlande',
  'Le pape François raconte avoir vu le diable 3 fois dans sa vie', 'Ni solide, ni liquide : voici le supersolide, un nouvel état de la matière'];
const PAGE_AVEC_TITRES = `"Colère à Ville-Exemple"

Un animateur de l'école maternelle Tournesol, à Ville-Exemple, a été suspendu. La mairie a réagi.

"Nous avons été alertés et nous avons agi aussitôt", explique la maire de Ville-Exemple.

${TITRES.join('\n\n')}`;
test('page franceinfo : une citation dans un BLOC DE TITRES (à lire aussi) n’est jamais une parole de l’article (Luis Enrique, 24/11/2026)', () => {
  const r = extraireParoles(PAGE_AVEC_TITRES, { ...TOURNESOL });
  vrai(!acteurs(r).some((a) => /Luis Enrique|maire\b.*ponctionne|Finlande/i.test(a)) && !r.faits.some((x) => /On va se mettre à pleurer|ponctionne/.test(x.parole.citations[0].texte)), 'aucune parole issue du bloc de titres : ' + JSON.stringify(acteurs(r)));
  vrai(r.faits.some((x) => /Nous avons été alertés/.test(x.parole.citations[0].texte)), 'la parole de l’article reste extraite');
});
test('… une liste de témoignages (phrases terminées par un point) n’est JAMAIS prise pour un bloc de titres', () => {
  const liste = `"Témoignages"

Ville-Exemple, école maternelle Tournesol : les parents s'expriment.

"Je suis inquiète pour mon enfant et je veux des réponses à Tournesol.", déplore Léa*, maman d'une élève.

"Nous voulons que la mairie agisse vite pour l'école Tournesol.", déplore Marc*, papa d'un élève.

"On ne dort plus depuis la suspension à l'école Tournesol.", déplore Inès*, maman.

"Les enfants posent des questions sur l'école Tournesol.", déplore Paul*, papa.

"Nous attendons un point d'étape de la mairie sur Tournesol.", déplore Sam*, papa.`;
  const r = extraireParoles(liste, { ...TOURNESOL });
  vrai(r.faits.length >= 3, 'les témoignages de la liste sont conservés : ' + r.faits.length);
});
test('même déclaration coupée autrement dans le même article : on garde la plus complète (Parmentier, « vraie bombe », 24/11/2026)', () => {
  const art = `"Plainte à l'école Tournesol"

Une plainte vise un animateur de l'école maternelle Tournesol à Ville-Exemple.

"Ça a été une vraie bombe dans notre vie", confie la maman qui a porté plainte, à France Inter.

"Une vraie bombe dans notre vie", répète la mère sur France Inter.`;
  const r = extraireParoles(art, { ...TOURNESOL });
  vrai(r.faits.length === 1 && /Ça a été une vraie bombe/.test(r.faits[0].parole.citations[0].texte), 'une seule proposition, la plus complète : ' + r.faits.map((x) => x.parole.citations[0].texte).join(' / '));
});

console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
