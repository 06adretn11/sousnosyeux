#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-declaration-organisme.mjs — d'une publication d'organisme suivi à une information DÉCIDABLE, puis à la page existante.
// Raccord éditorial complété après le 1er cycle actif (proposition f1daa077 : jugée utile, mais sans décision possible).
//   publication → rattachement par le texte → fait structuré (libellé fermé, attribué) → demande de décision → application → projection
// Aucun réseau, aucune base, aucun modèle. Documents publics (fixture) et affaires publiques du dépôt ; états de test explicitement artificiels.
// Avec SNY_APERCU=<fichier.json> : écrit la prévisualisation (message de décision, destinations, texte exact).
// =====================================================================
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import {
  chargerRegistre, classer, passages, faitsDeclares, aliasOrganismes, actionContinuite, aSolliciter, complementDecision, natureDocument, chargerContexteHub,
} from '../lib/sources-suivies.mjs';
import { faitsStructures, planReactions } from '../lib/evenement-institutionnel.mjs';
import { messageEnrichissement } from '../lib/discovery-messages.mjs';
import { lireMatiereValidee } from '../lib/matiere-validee.mjs';
import { construireMatiere, pagesSiValide } from '../lib/destinations.mjs';

let n = 0; const t = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const lire = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const texte = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const src = (f) => texte(f);

const registre = chargerRegistre(new URL('../../data/associations-watchlist.json', import.meta.url));
const org = (id) => registre.organismes.find((o) => o.id === id);
const casesPub = lire('data/cases.json').cases;
const fiches = casesPub.map((c) => ({ case_id: c.case_id, etablissement: c.etablissement, commune: c.commune, departement: c.departement, role_mis_en_cause: c.role_mis_en_cause,
  statut_judiciaire: c.statut_judiciaire, sources_dates: (c.sources || []).map((s) => s.publication_date).filter(Boolean) }));
const alias = aliasOrganismes(registre.organismes);
const DIR_HUBS = new URL('../../data/hub-matiere/', import.meta.url);
const contexte = chargerContexteHub(readdirSync(DIR_HUBS).filter((f) => f.endsWith('.json')).map((f) => new URL(f, DIR_HUBS).pathname.replace(/^\/([A-Za-z]:)/, '$1')), new URL('../../data/evenements.json', DIR_HUBS).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const fichePOC05 = casesPub.find((c) => c.case_id === 'POC-05');

// Document A : publication réelle de L'Enfant Bleu (21/07/2026), extrait public minimal. Date de publication fournie par la page.
const A = { titre: 'Violences dans le périscolaire | L\'Enfant Bleu accompagne les collectivités', corps: texte('fixtures/sources-suivies/A-enfant-bleu-2026-07-21.txt'),
  url: 'https://enfantbleu.org/violences-dans-le-periscolaire-comment-lenfant-bleu-accompagne-les-collectivites/' };
const PUB_A = '2026-07-21';
const nature = natureDocument(A, { url: 'https://enfantbleu.org/category/actualite/', type: 'index', emetteur: "L'Enfant Bleu" }, org('enfant-bleu'));

console.log('\n  REQUALIFICATION — ce que dit la publication, et ce qu\'elle ne dit pas');
const cls = classer({ doc: A, page: { type: 'document' }, organisme: org('enfant-bleu'), fiches });
const ps = passages(cls.zone, fiches.find((f) => f.case_id === 'POC-05'), { alias });
await t('rattachement par le TEXTE : établissement + commune + rôle → UNE affaire (POC-05), jamais par le siège de l\'organisme', () => {
  assert.equal(cls.destination, 'AFFAIRE'); assert.deepEqual(cls.case_ids, ['POC-05']); assert.equal(cls.resolution, 'MATCH');
});
await t('passage probant : la phrase qui nomme l\'école et l\'acte de l\'association — pas le titre, pas la phrase sur Paris', () => {
  assert.match(ps[0].texte, /école Alphonse Baudin.*constituée partie civile/); assert.equal(ps[0].emplacement, 'paragraphe 2');
  assert.ok(ps.every((p) => !/^Violences dans le périscolaire/.test(p.texte)));
});
const faits = faitsDeclares({ passages: ps, organisme: org('enfant-bleu'), emetteur: "L'Enfant Bleu", nature: nature.nature, publie_le: PUB_A, fiche: fichePOC05, contexte });
await t('UN fait décidable : acteur = l\'organisme, libellé FERMÉ « Selon L\'Enfant Bleu… », citation littérale, date de démarche NON inventée', () => {
  assert.equal(faits.length, 1); const f = faits[0];
  assert.equal(f.mesure, 'declaration_partie_civile'); assert.equal(f.acteur, "L'Enfant Bleu"); assert.equal(f.portee, 'établissement');
  assert.equal(f.event_date, null); assert.equal(f.event_period, null); assert.equal(f.publication_date, PUB_A);
  assert.equal(f.libelle_public, 'Selon L’Enfant Bleu, l’association s’est constituée partie civile dans l’affaire de École maternelle Alphonse-Baudin (Paris 11e), ouverte par la suspension d’un animateur en avril 2025 ; la publication ne précise pas la procédure visée. Déclaration de l’association, non confirmée indépendamment.');
  assert.ok(A.corps.includes(f.evidence[0]), 'citation littérale');
});
await t('issue favorable préservée : le libellé ne dit ni jugement, ni appel, ni stade, ni culpabilité ; aucun nom ni nombre d\'enfants', () => {
  const l = faits[0].libelle_public;
  assert.doesNotMatch(l, /relax|condamn|jug|appel|procès|audience|coupable|des enfants|victimes/i);
});
await t('la phrase sur la Ville de Paris (Convention citoyenne) n\'est pas un fait de POC-05 : aucun fait structuré pour elle', () => {
  assert.equal(faits.length, 1); assert.ok(!faits.some((f) => /Convention citoyenne/.test(JSON.stringify(f))));
});
await t('PORTÉE EXPLICITE : le libellé nomme le contexte attesté (école + suspension d’un animateur en avril 2025), ne dit pas « dans cette affaire » seul, n’associe pas la démarche au jugement', () => {
  const l = faits[0].libelle_public;
  assert.match(l, /dans l’affaire de École maternelle Alphonse-Baudin \(Paris 11e\), ouverte par la suspension d’un animateur en avril 2025/); assert.match(l, /ne précise pas la procédure visée/);
  assert.equal(faits[0].contexte_atteste.mois, '2025-04'); assert.ok(contexte.dates.get('POC-05')[0].startsWith('2025-04'), 'origine de la chronologie de POC-05 = avril 2025');
});
await t('ancrage de la portée : mois absent, mois d’une ÉTAPE ultérieure, ou chronologie plus étroite que la source → aucun fait (reste une information)', () => {
  const faire = (texte, ctx = contexte, fiche = fichePOC05) => faitsDeclares({ passages: [{ texte, emplacement: 'paragraphe 2' }], organisme: org('enfant-bleu'), emetteur: "L'Enfant Bleu", nature: 'PUBLICATION_PROPRE', publie_le: PUB_A, fiche, contexte: ctx });
  const base = 'les parents de l’école Alphonse Baudin apprenaient la suspension d’un animateur, une affaire dans laquelle l’Enfant Bleu s’est constituée partie civile.';
  assert.equal(faire('En avril 2025, ' + base).length, 1);
  assert.equal(faire('À l’époque, ' + base).length, 0, 'sans mois ni année');
  assert.equal(faire('En juillet 2026, ' + base).length, 0, 'mois d’une étape (jugement), pas l’origine de l’affaire');
  const etroite = { ...contexte, dates: new Map([...contexte.dates, ['POC-05', ['2026-05-26', '2026-07-07']]]) };
  assert.equal(faire('En avril 2025, ' + base, etroite).length, 0, 'fiche dont la chronologie ne contient pas ce contexte');
  assert.equal(faire('En avril 2025, ' + base, { ...contexte, dates: new Map() }).length, 0, 'sans chronologie : fail closed');
});
await t('INCONNUE ajustée, portion STRICTE : deux phrases exactes du Hub Paris 11e (dossier POC-05 + inconnues transversales) ; les autres inconnues ne sont pas touchées', () => {
  const aj = faits[0].ajustements_inconnues; assert.equal(aj.length, 2);
  const dossier = lire('data/hub-matiere/paris-11e.json'); const d = aj.find((a) => a.cible === 'dossier'), tr = aj.find((a) => a.cible === 'transversale');
  assert.ok(dossier.dossiers['POC-05'].inconnues.includes(d.avant) && dossier.inconnues_transversales.includes(tr.avant), 'texte AVANT exact présent dans le fichier');
  assert.equal(d.avant, "Une constitution de partie civile d'associations est évoquée ailleurs ; elle n'est pas confirmée par les articles relus.");
  assert.equal(d.apres, 'Une constitution de partie civile est déclarée par L’Enfant Bleu dans une publication du 21 juillet 2026 (déclaration non confirmée indépendamment ; procédure concernée non précisée) ; pour d’autres associations, elle est évoquée ailleurs et n’est pas confirmée par les articles relus.');
  assert.match(tr.apres, /^Une constitution de partie civile de l’association L['’]Enfant Bleu est évoquée dans d’autres sources ; le communiqué \(PDF\) n’a pas pu être relu : seule la déclaration de l’association du 21 juillet 2026 est reprise \(attribuée, sans confirmation indépendante\)\.$/);
  assert.ok(![d.avant, tr.avant].some((x) => x === 'Les motifs ne sont connus que par la presse : le jugement n’est pas public.'));
  assert.ok(dossier.dossiers['POC-05'].inconnues.filter((x) => x !== d.avant).length === 4, 'les 4 autres inconnues du dossier restent');
});
await t('inconnue déjà réécrite depuis (texte différent) → aucun ajustement, l’information reste décidable', () => {
  const ctx2 = { ...contexte, dossiers: new Map([...contexte.dossiers, ['POC-05', { hub: 'paris-11e', inconnues: ['Autre formulation déjà réécrite.'] }]]), transversales: new Map([...contexte.transversales, ['paris-11e', []]]) };
  const f = faitsDeclares({ passages: ps, organisme: org('enfant-bleu'), emetteur: "L'Enfant Bleu", nature: 'PUBLICATION_PROPRE', publie_le: PUB_A, fiche: fichePOC05, contexte: ctx2 });
  assert.equal(f.length, 1); assert.equal(f[0].ajustements_inconnues, undefined);
});
await t('même établissement, procédure indéterminée (deux affaires du même établissement et du même rôle) → RATTACHEMENT_SUSPENDU, aucun fait', () => {
  const doubles = [...fiches.filter((f) => f.case_id === 'POC-05'), { ...fiches.find((f) => f.case_id === 'POC-05'), case_id: 'T-SOEUR' }];
  const c = classer({ doc: A, page: { type: 'document' }, organisme: org('enfant-bleu'), fiches: doubles });
  assert.equal(c.destination, 'RATTACHEMENT_SUSPENDU'); assert.deepEqual(c.case_ids, []); assert.deepEqual(c.suspendus.sort(), ['POC-05', 'T-SOEUR']);
});
await t('seul le nom de l\'école ne suffit pas : sans commune ni rôle concordants, aucun rattachement', () => {
  const c = classer({ doc: { ...A, corps: 'Titre\n\nL’école Alphonse Baudin a accueilli notre atelier de sensibilisation, auquel l’Enfant Bleu s’est associée.' }, page: { type: 'document' }, organisme: org('enfant-bleu'), fiches });
  assert.notEqual(c.destination, 'AFFAIRE'); assert.deepEqual(c.case_ids, []);
});

console.log('\n  VOCABULAIRE FERMÉ — jamais d\'attribution forcée');
await t('une reprise de presse, un article de presse référencé, un repli : pas de fait décidable (l\'émetteur n\'est pas l\'organisme)', () => {
  for (const nat of ['REPRISE_PRESSE', 'ARTICLE_PRESSE_REFERENCE', 'REPLI', 'PAGE_SERVICE'])
    assert.deepEqual(faitsDeclares({ passages: ps, organisme: org('enfant-bleu'), emetteur: 'x', nature: nat, publie_le: PUB_A, fiche: fichePOC05, contexte }), [], nat);
});
await t('le sujet de l\'acte doit être l\'organisme : « des parents se sont constitués partie civile » ou une autre association → aucun fait', () => {
  const autre = [{ texte: 'Les parents de l’école Alphonse Baudin se sont constitués partie civile.', emplacement: 'paragraphe 3' }];
  assert.deepEqual(faitsDeclares({ passages: autre, organisme: org('enfant-bleu'), emetteur: "L'Enfant Bleu", nature: 'PUBLICATION_PROPRE', publie_le: PUB_A, fiche: fichePOC05, contexte }), []);
  const asso = [{ texte: 'L’association Innocence en Danger s’est constituée partie civile à l’école Alphonse Baudin.', emplacement: 'paragraphe 3' }];
  assert.deepEqual(faitsDeclares({ passages: asso, organisme: org('enfant-bleu'), emetteur: "L'Enfant Bleu", nature: 'PUBLICATION_PROPRE', publie_le: PUB_A, fiche: fichePOC05, contexte }), []);
});
await t('règle GÉNÉRALE (aucune exception d\'organisme, d\'URL ou d\'affaire) : même vocabulaire, autre organisme du registre, autre affaire de test', () => {
  const f2 = [{ case_id: 'T-9', etablissement: 'École maternelle des Tilleuls', commune: 'Ville-Test', departement: 'Test', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'mise en examen', sources_dates: [] }];
  const d = { titre: 'Notre action', corps: 'Notre action\n\nÀ l’école maternelle des Tilleuls de Ville-Test, un animateur périscolaire a été mis en cause en mars 2026 ; l’association Colosse aux pieds d’argile s’est constituée partie civile aux côtés des familles.',
    url: 'https://colosse.fr/notre-action-test/' };
  const c = classer({ doc: d, page: { type: 'document' }, organisme: org('colosse'), fiches: f2 });
  assert.equal(c.destination, 'AFFAIRE');
  const p2 = passages(c.zone, f2[0], { alias });
  const ctxT = { dates: new Map([['T-9', ['2026-03-12', '2026-06-01']]]), dossiers: new Map(), transversales: new Map() };
  const f = faitsDeclares({ passages: p2, organisme: org('colosse'), emetteur: "Colosse aux pieds d'argile", nature: 'PUBLICATION_PROPRE', publie_le: '2026-10-01', fiche: f2[0], contexte: ctxT });
  assert.equal(f.length, 1); assert.match(f[0].libelle_public, /^Selon Colosse aux pieds d’argile, l’association s’est constituée partie civile dans l’affaire de École maternelle des Tilleuls \(Ville-Test\), datée de mars 2026/);
  assert.equal(f[0].ajustements_inconnues, undefined, 'aucun dossier : aucune inconnue à ajuster');
});
await t('routage d\'un document d\'un AUTRE organisme du corpus (Colosse, 31/08 — position nationale) : aucun fait, aucun traitement par URL', () => {
  const d = { titre: 'Questionnaire sur les violences sexuelles : donner la parole aux enfants ne suffit pas',
    corps: 'Questionnaire sur les violences sexuelles : donner la parole aux enfants ne suffit pas\n\nRecueillir la parole des enfants ne suffit pas : il faut former les adultes et protéger les enfants victimes de violences sexuelles.', url: 'https://colosse.fr/questionnaire-test/' };
  const c = classer({ doc: d, page: { type: 'document' }, organisme: org('colosse'), fiches });
  assert.equal(c.destination, 'POSITION_GENERALE'); assert.deepEqual(faitsDeclares({ passages: [], organisme: org('colosse'), emetteur: 'Colosse', nature: 'PUBLICATION_PROPRE', publie_le: null, fiche: fichePOC05, contexte }), []);
  assert.ok(!/enfantbleu|POC-05|colosse\.fr/.test(src('scripts/lib/sources-suivies.mjs').split('export function faitsDeclares')[1].split('/** Contacts publics')[0]), 'aucune exception codée');
});

console.log('\n  DÉCISION — ce que voit le réviseur');
const neufs = planReactions(faitsStructures(faits), []).neufs;
const pageCtx = () => {
  const ev = lire('data/evenements.json');
  const hubs = Object.fromEntries(['paris-11e', 'bordeaux-gironde', 'hautes-alpes', 'landes'].map((h) => [h, { publie: true, groupes: lire(`data/hub-matiere/${h}.json`).reponses.map((g) => g.titre), items: Object.fromEntries(lire(`data/hub-matiere/${h}.json`).reponses.map((g) => [g.titre, g.items])) }]));
  return { publiques: new Set(casesPub.map((c) => c.case_id)), holds: new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id)), approuvees: new Set(Object.keys(ev.fiches_approuvees)),
    cases: new Map(casesPub.map((c) => [c.case_id, { commune: c.commune, departement: c.departement, etablissement: c.etablissement }])), hubs };
};
const _unused = 0;
const faitPourPages = (o = {}) => ({ case_id: 'POC-05', nature: 'mobilisation', portee: 'établissement', territoire: null, date: null, ...o });
const pages = pagesSiValide([faitPourPages()], pageCtx());
const decl = { emetteur: "L'Enfant Bleu", nature: 'PUBLICATION_PROPRE', ajustements: faits[0].ajustements_inconnues, rattachement_motif: 'établissement, commune et rôle concordent pour une seule affaire — rattachement par le texte (établissement, commune et rôle) ; la publication ne précise ni la procédure ni son étape.' };
const limite = "Publication de L'Enfant Bleu du 2026-07-21 : elle documente ce que son auteur déclare ; elle n'établit ni les faits dénoncés ni une étape judiciaire. Rattrapage documentaire : publication du 2026-07-21, découverte par SNY le 2026-11-06 ; à confronter aux sources plus récentes.";
const message = messageEnrichissement({ etablissement: 'École maternelle Alphonse-Baudin', commune: 'Paris 11e', courant: 'relaxe / non-lieu / classement', media: "L'Enfant Bleu", publication_date: PUB_A, url: A.url }, neufs, false, pages)
  + complementDecision({ decl, limite, publication_date: PUB_A, proposal_id: 'f1daa077-0de6-4c9b-a1b8-b23a68a891e8', information_envoyee_le: '2026-11-06T10:01:58Z' });
await t('message de décision : contenu exact, passage probant, émetteur, date de publication ≠ date de la démarche, rattachement, limites, pages concernées, 3 actions', () => {
  for (const s of ['ENRICHISSEMENT PROPOSÉ', 'état judiciaire inchangé (relaxe / non-lieu / classement)', 'Selon L’Enfant Bleu, l’association s’est constituée partie civile dans l’affaire de École maternelle Alphonse-Baudin (Paris 11e), ouverte par la suspension d’un animateur en avril 2025', 'école Alphonse Baudin', 'Inconnue(s) ajustée(s) si VALIDATE', 'Avant :', 'Après :', 'pour d’autres associations', 'L&#39;Enfant Bleu'.replace('&#39;', "'"),
    '21/07/2026', 'date non établie', 'Rattachement', 'ne précise ni la procédure ni son étape', 'Pages concernées si VALIDATE', 'fiche POC-05', 'Hub', 'Familles, avocats, syndicats, associations',
    'Suite de l’information du', 'VALIDATE', 'REVIEW', 'REJECT'])
    assert.ok(message.includes(s), `absent : ${s}`);
  assert.ok(message.length < 4000, 'sous la limite Telegram (4096)');
});
await t('emplacement : fiche POC-05 (approuvée) et le bloc EXISTANT « Familles, avocats, syndicats, associations » du Hub Paris 11e — aucune page créée, aucun autre Hub', () => {
  assert.equal(pages.length, 2); assert.ok(pages.some((x) => /^fiche POC-05/.test(x))); assert.ok(pages.some((x) => /Hub .*Paris 11e.*Familles, avocats, syndicats, associations/.test(x)));
});
await t('déduplication : une fois le libellé connu de l\'affaire, plus aucune demande (nouvelle publication du même apport ≠ nouvelle information)', () => {
  assert.equal(planReactions(faitsStructures(faits), [{ event_type: 'mobilisation', event_date: null, libelle_public: faits[0].libelle_public }]).neufs.length, 0);
});

console.log('\n  CONTINUITÉ — la proposition f1daa077 garde son identité');
await t('proposition sans décision, simple information → REPRENDRE sur place (même proposal_id) ; décidée, déjà décidable ou inexistante → pas de doublon', () => {
  const info = { decision: null, facts: [{ event_type: 'declaration_organisme', evidence: ['x'] }] };
  assert.equal(actionContinuite({ existante: info, decidable: true }), 'REPRENDRE');
  assert.equal(actionContinuite({ existante: info, decidable: false }), 'DEJA_PRESENTE');
  assert.equal(actionContinuite({ existante: { ...info, decision: 'REJECT' }, decidable: true }), 'DEJA_PRESENTE');
  assert.equal(actionContinuite({ existante: { decision: null, facts: faits }, decidable: true }), 'DEJA_PRESENTE');
  assert.equal(actionContinuite({ existante: null, decidable: true }), 'CREER');
});
await t('sollicitation : UNE demande, identifiée comme la suite ; jamais de répétition, jamais après un refus d\'envoyer, jamais pour un autre moteur', () => {
  const base = { engine: 'sources-suivies', decidable: true };
  assert.equal(aSolliciter({ ...base, envois: [] }), true);                                 // jamais envoyée
  assert.equal(aSolliciter({ ...base, envois: ['info:true'] }), true);                      // information envoyée : suite
  assert.equal(aSolliciter({ ...base, envois: ['info:true', 'decision:true'] }), false);    // demande déjà envoyée : une seule fois
  assert.equal(aSolliciter({ ...base, envois: ['info:true', 'info:false'] }), false);       // suite écartée (marqueur sans message)
  assert.equal(aSolliciter({ ...base, decidable: false, envois: ['info:true'] }), false);   // pas décidable : l'information suffit
  assert.equal(aSolliciter({ engine: 'deepseek/x', decidable: true, envois: ['info:true'] }), false);   // autre moteur : comportement historique
  assert.equal(aSolliciter({ ...base, decision: 'ACCEPT', envois: [] }), false);            // décidée : plus de demande
  assert.equal(aSolliciter({ engine: 'deepseek/x', envois: [] }), true);                    // historique : jamais envoyée → envoyée
});
await t('câblage : le cycle reprend sur place (UPDATE … where decision is null), le notificateur filtre par aSolliciter, la demande dit « Suite de l’information »', () => {
  const mc = src('scripts/maintenance-cycle.mjs'), tg = src('scripts/telegram-v0.mjs');
  assert.ok(mc.includes("S.actionContinuite(") && /update state_proposals\s+set facts[\s\S]{0,400}where proposal_id = \$\{exist\.pid\}::uuid and decision is null/.test(mc));
  assert.ok(tg.includes('aSolliciter({ decision: null') && tg.includes('complementDecision(') && tg.includes("#suite"));
  assert.ok(tg.includes("r.decl && !(Array.isArray(r.facts) && r.facts.some((f) => f?.libelle_public)) ? await info(r.k)"), 'information seule seulement sans fait décidable');
});

console.log('\n  APPLICATION ET PROJECTION — jamais sans approbation, jamais sous HOLD');
const ligneAcceptee = { proposal_id: 'p-test', case_id: 'POC-05', applied_event_id: 'e-test', fait: faits[0], commune: 'Paris 11e', departement: 'Paris', etablissement: 'École maternelle Alphonse-Baudin',
  media: "L'Enfant Bleu", url: A.url, publie_le: PUB_A };
const fakeSql = async () => [ligneAcceptee];
await t('le circuit d\'application existant reconnaît le fait (faitsStructures) : événement « mobilisation » de l\'affaire, état judiciaire INCHANGÉ, libellé = libellé fermé', () => {
  const a = src('scripts/appliquer-decisions.mjs');
  assert.equal(faitsStructures(faits).length, 1); assert.equal(faits[0].event_type, 'mobilisation');
  assert.ok(a.includes('faitsStructures(p.facts)') && a.includes("p.aa === 'ENRICHMENT'") && a.includes("where p.decision = 'ACCEPT'") && a.includes('statut_apres, libelle_public') );
  assert.ok(/insert into case_events \(case_id, event_date, event_type, statut_apres, libelle_public, article_id\)\s+values \(\$\{p\.case_id\}, \$\{inst\.ed\}, \$\{inst\.event_type\}::case_event_type, null,/.test(a), 'statut_apres = null : aucun changement d\'état fictif');
});
await t('seule une décision ACCEPT alimente la matière publique (refus, REVIEW, absence de décision : rien) ', () => {
  assert.match(src('scripts/lib/matiere-validee.mjs'), /where p\.decision = 'ACCEPT' and f\.fait \? 'libelle_public'/);
});
const validee = await lireMatiereValidee(fakeSql, {});
const { matiere } = construireMatiere(validee.map((v) => ({ id: v.id, case_id: v.case_id, nature: v.nature, libelle: v.libelle, realisation: v.realisation, portee: v.portee, acteur: v.acteur, territoire: v.territoire, date: v.date, periode: v.periode, source: v.source, event_id: v.event_id, etablissement: v.etablissement, ajustements: v.ajustements })), pageCtx());
await t('ACCEPT → matière projetée : texte exact validé, source = la publication, deux destinations existantes (fiche approuvée + bloc de Hub), aucune citation exposée', () => {
  assert.equal(matiere.length, 1); const m = matiere[0];
  assert.equal(m.libelle, faits[0].libelle_public); assert.deepEqual(m.ajustements, faits[0].ajustements_inconnues); assert.equal(m.source.url, A.url); assert.equal(m.source.publie_le, PUB_A); assert.equal(m.date, null);
  assert.equal(m.destinations.fiche, 'POC-05'); assert.deepEqual(m.destinations.hubs, [{ hub: 'paris-11e', groupe: 'Familles, avocats, syndicats, associations' }]);
  assert.ok(!JSON.stringify(m).includes('constituée partie civile. Depuis'), 'la citation reste en mémoire privée');
});
await t('HOLD sur l\'affaire → aucune projection ; fiche non approuvée → seulement le Hub ; affaire non publique → rien', () => {
  const base = pageCtx(); const f = [{ id: 'x', case_id: 'POC-05', nature: 'mobilisation', libelle: 'L', realisation: 'réalisée', portee: 'établissement', acteur: 'a', source: {}, etablissement: 'E' }];
  assert.equal(construireMatiere(f, { ...base, holds: new Set([...base.holds, 'POC-05']) }).matiere.length, 0);
  const sansFiche = construireMatiere(f, { ...base, approuvees: new Set() }).matiere[0]; assert.equal(sansFiche.destinations.fiche, null); assert.equal(sansFiche.destinations.hubs.length, 1);
  assert.equal(construireMatiere(f, { ...base, publiques: new Set() }).matiere.length, 0);
});
await t('le raccord n\'ajoute aucun front : pas de nouveau script, cron, registre, table ni canal', () => {
  const wf = src('.github/workflows/sny-cycle.yml'); assert.equal((wf.match(/schedule:/g) || []).length, 1);
});

if (process.env.SNY_APERCU) {
  writeFileSync(process.env.SNY_APERCU, JSON.stringify({
    note: 'Prévisualisation — ÉTAT ISOLÉ : rien n’est écrit en production. Message tel que le notificateur le composerait pour la proposition f1daa077 après reprise.',
    rattachement: { destination: cls.destination, case_ids: cls.case_ids, motif: cls.motif, resolution: cls.resolution },
    passages_probants: ps, fait_propose: faits[0], pages_concernees_si_validee: pages,
    message_telegram: message, matiere_apres_ACCEPT: matiere[0],
  }, null, 1));
}
console.log(`\n  ${n} vérifications — raccord éditorial des déclarations d'organismes conforme\n`);
