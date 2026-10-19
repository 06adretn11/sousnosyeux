// Génération des fiches — gardes d'extraction (citation entière, dates écrites, quantités, issue, nom, nombre d'enfants, appel/finalité),
// composition (état contredit ou non étayé ⇒ jamais READY), qualification, compatibilité avec la proposition Telegram. Aucun réseau, aucune base.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recupererCitation, citationPresente, dateAttestee, quantitesNonAttestees, issuesNonAttestees, verifier, nomsPresents, sembleAnnoncee } from '../lib/fiche-extraction.mjs';
import { composer, attribue } from '../lib/fiche-composer.mjs';
import { payloadFiche, dossierGeneree, hashDossier } from '../lib/fiche-page.mjs';
import { messageFiche } from '../lib/discovery-messages.mjs';
import { boutonValable } from '../lib/telegram-clics.mjs';
import { requetesDecouverte, affairesSoeurs } from '../lib/fiche-sources.mjs';
import { rendreMarkdown } from '../lib/fiche-rendu.mjs';
import { decider, inscrire } from '../lib/promouvoir-fiche.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const CORPS = `Le tribunal correctionnel de Rouen a condamné mardi l'enseignant à quatre ans de prison dont un an avec sursis, le 4 décembre 2025. Le parquet avait requis cinq ans. La rectrice a déclaré : « Nous avons suspendu l'enseignant dès le signalement et nous accompagnons les familles ». Le prévenu, Jean Dupont, 45 ans, conteste. Trois élèves avaient porté plainte. Le rectorat va mettre en place une cellule d'écoute dans les prochaines semaines.`;
const PUB = '2025-12-05';
const base = (o = {}) => ({ pertinence: 'CETTE_AFFAIRE', pertinence_raison: 'même lycée et même commune', personnes_mises_en_cause_nommees: ['Jean Dupont'], faits_rapportes: [], evenements: [], issue_judiciaire: null, declarations: [], lacunes_declarees: [], ...o });
const evt = (o) => ({ type: 'decision', acteur: 'Tribunal correctionnel de Rouen', realisation: 'non_applicable', portee: 'affaire', date: null, citation_date: null, ...o });

// ---------------- primitives ----------------
t('citation : entière, accents/apostrophes neutralisés ; tronquée-puis-fabriquée refusée', () => {
  assert.ok(citationPresente(CORPS, 'condamné mardi l’enseignant à quatre ans de prison dont un an avec sursis'));
  assert.ok(!citationPresente(CORPS, 'condamné mardi l’enseignant à quatre ans de prison dont trois ans fermes et une amende'), 'début vrai, fin fabriquée');
  assert.ok(!citationPresente(CORPS, 'court'), 'trop courte pour prouver quoi que ce soit');
});
t('date : écrite (jour+mois+année) acceptée ; « mardi » refusée ; année absente tolérée seulement près de la parution ; année contraire refusée', () => {
  assert.ok(dateAttestee('2025-12-04', 'le 4 décembre 2025', PUB));
  assert.ok(!dateAttestee('2025-12-02', 'condamné mardi', PUB), 'jour relatif : pas une date écrite');
  assert.ok(dateAttestee('2025-12-04', 'le 4 décembre', PUB));
  assert.ok(!dateAttestee('2023-12-04', 'le 4 décembre', PUB), 'année déduite trop loin de la parution');
  assert.ok(!dateAttestee('2024-12-04', 'le 4 décembre 2025', PUB));
  assert.ok(dateAttestee('2025-12', 'en décembre 2025', PUB));
  assert.ok(dateAttestee('2025-03-04', 'le 04/03/2025', PUB));
});
t('quantités : une peine du texte doit figurer dans la citation (un an ≠ trois ans)', () => {
  assert.deepEqual(quantitesNonAttestees('quatre ans de prison dont un an avec sursis', 'quatre ans de prison dont un an avec sursis'), []);
  assert.deepEqual(quantitesNonAttestees('quatre ans de prison dont trois ans fermes', 'quatre ans de prison dont un an avec sursis'), ['3']);
  assert.deepEqual(quantitesNonAttestees('4 ans de prison', 'quatre ans de prison'), [], 'chiffre ≡ lettres');
});
t('issue : « condamné » ne peut pas sortir d’une citation de relaxe (l’erreur irréparable)', () => {
  assert.deepEqual(issuesNonAttestees('le tribunal a condamné l’enseignant', 'le tribunal a relaxé l’enseignant'), ['condamnation']);
  assert.deepEqual(issuesNonAttestees('le tribunal a relaxé l’enseignant', 'le tribunal a relaxé l’enseignant'), []);
  assert.deepEqual(issuesNonAttestees('la condamnation est définitive', 'condamné à deux ans'), ['definitif']);
});
t('mesure : une citation qui annonce ne peut être « réalisée »', () => {
  assert.ok(sembleAnnoncee('Le rectorat va mettre en place une cellule d’écoute'));
  assert.ok(!sembleAnnoncee('Le rectorat a suspendu l’enseignant'));
});

// ---------------- vérification d'une réponse de modèle ----------------
const v = (rep) => verifier(rep, { corps: CORPS, publieLe: PUB });
t('élément à citation inventée : écarté avec sa raison, jamais conservé', () => {
  const r = v(base({ evenements: [evt({ texte: 'Le tribunal a condamné l’enseignant à dix ans.', citation: 'condamné l’enseignant à dix ans de prison ferme avec mandat de dépôt' })] }));
  assert.equal(r.evenements.length, 0); assert.equal(r.ecartes[0].raison, 'CITATION_ABSENTE_DU_CORPS');
});
t('quantité non attestée / issue inversée : écartées', () => {
  const r1 = v(base({ evenements: [evt({ texte: 'Condamné à quatre ans dont trois ans fermes.', citation: 'condamné mardi l\'enseignant à quatre ans de prison dont un an avec sursis' })] }));
  assert.match(r1.ecartes[0].raison, /^QUANTITE_NON_ATTESTEE/);
  const r2 = v(base({ evenements: [evt({ texte: 'Le tribunal a relaxé l’enseignant.', citation: 'condamné mardi l\'enseignant à quatre ans de prison dont un an avec sursis' })] }));
  assert.match(r2.ecartes[0].raison, /^ISSUE_NON_ATTESTEE\(relaxe\)/);
});
t('nom du mis en cause, nombre exact d’enfants : écartés (texte rédigé)', () => {
  const a = v(base({ faits_rapportes: [{ portee: 'affaire', texte: 'Jean Dupont conteste les faits.', citation: 'Le prévenu, Jean Dupont, 45 ans, conteste' }] }));
  assert.equal(a.faits.length, 0); assert.equal(a.ecartes[0].raison, 'NOM_MIS_EN_CAUSE');
  const b = v(base({ faits_rapportes: [{ portee: 'affaire', texte: 'Trois élèves avaient porté plainte.', citation: 'Trois élèves avaient porté plainte' }] }));
  assert.equal(b.faits.length, 0); assert.equal(b.ecartes[0].raison, 'NOMBRE_EXACT_ENFANTS');
  const c = v(base({ faits_rapportes: [{ portee: 'affaire', texte: 'Plusieurs élèves avaient porté plainte.', citation: 'Trois élèves avaient porté plainte' }] }));
  assert.equal(c.faits.length, 1, '« plusieurs » est la forme autorisée ; la citation interne n’est pas publiée');
});
t('date non écrite : l’événement est conservé mais SANS date d’événement ; réquisitions jamais « décision »', () => {
  const r = v(base({ evenements: [
    evt({ texte: 'Le tribunal a condamné l’enseignant à quatre ans de prison dont un an avec sursis.', date: '2025-12-02', citation_date: 'condamné mardi', citation: 'condamné mardi l\'enseignant à quatre ans de prison dont un an avec sursis' }),
    evt({ texte: 'Le parquet avait requis cinq ans.', citation: 'Le parquet avait requis cinq ans' }),
  ] }));
  assert.equal(r.evenements[0].date, null); assert.equal(r.evenements[0].date_nature, 'article');
  assert.ok(r.ecartes.some((e) => e.raison === 'DATE_NON_ECRITE_DANS_LA_SOURCE'));
  assert.equal(r.evenements[1].type, 'audience', 'réquisitions → audience, pas décision');
});
t('mesure annoncée : « réalisée » rabaissée en « annoncée »', () => {
  const r = v(base({ evenements: [evt({ type: 'mesure_etablissement', acteur: 'Rectorat', realisation: 'realisee', texte: 'Le rectorat met en place une cellule d’écoute.', citation: 'Le rectorat va mettre en place une cellule d\'écoute dans les prochaines semaines' })] }));
  assert.equal(r.evenements[0].realisation, 'annoncee');
});
t('appel / caractère définitif : un acte écrit, jamais un nom de juridiction ni une absence', () => {
  const ij = { nature: 'condamnation', date: null, citation_date: null, citation: 'condamné mardi l\'enseignant à quatre ans de prison dont un an avec sursis' };
  const a = v(base({ issue_judiciaire: { ...ij, appel: 'OUI', citation_appel: 'La cour d\'appel de Rouen', definitive: 'OUI', citation_definitive: 'Le parquet avait requis cinq ans' } }));
  assert.equal(a.issue.appel, 'INCONNU'); assert.equal(a.issue.definitive, 'INCONNU');
  assert.ok(a.ecartes.some((e) => e.raison === 'APPEL_NON_ETABLI_PAR_ACTE') && a.ecartes.some((e) => e.raison === 'FINALITE_NON_ETABLIE_PAR_LE_TEXTE'));
  const b = v(base({ issue_judiciaire: { ...ij, nature: 'relaxe', appel: 'INCONNU', definitive: 'INCONNU' } }));
  assert.equal(b.issue, null, 'nature « relaxe » absente de la citation de la décision');
});
t('déclarations : institution nommée conservée ; parent / témoin / citation inventée écartés', () => {
  const r = v(base({ declarations: [
    { acteur: 'La rectrice', type_acteur: 'education_nationale', a_propos: 'suspension', portee: 'affaire', citation: 'Nous avons suspendu l\'enseignant dès le signalement et nous accompagnons les familles' },
    { acteur: 'Une mère', type_acteur: 'parent', a_propos: 'ressenti', portee: 'affaire', citation: 'Nous avons suspendu l\'enseignant dès le signalement et nous accompagnons les familles' },
    { acteur: 'Le maire', type_acteur: 'collectivite', a_propos: 'x', portee: 'affaire', citation: 'Nous allons tout faire pour que cela ne se reproduise jamais plus à Rouen' },
  ] }));
  assert.equal(r.declarations.length, 1); assert.deepEqual(r.ecartes.map((e) => e.raison.replace(/\(.*\)/, '')), ['ACTEUR_NON_PUBLIABLE', 'CITATION_ABSENTE_DU_CORPS']);
});
t('portée : une autre affaire ou un territoire sont classés à part (pas dans la fiche) ; une portée absente est écartée (échec fermé)', () => {
  const cit = "condamné mardi l'enseignant à quatre ans de prison dont un an avec sursis";
  const r = v(base({ evenements: [
    evt({ texte: 'Le tribunal a condamné l’enseignant à quatre ans de prison dont un an avec sursis.', citation: cit, portee: 'autre_affaire' }),
    evt({ texte: 'Le parquet avait requis cinq ans.', citation: 'Le parquet avait requis cinq ans', portee: 'territoire' }),
    evt({ texte: 'Le parquet avait requis cinq ans.', citation: 'Le parquet avait requis cinq ans', portee: undefined }),
    evt({ texte: 'Le parquet avait requis cinq ans.', citation: 'Le parquet avait requis cinq ans', portee: 'etablissement' }),
  ] }));
  assert.deepEqual(r.hors_perimetre.map((h) => h.portee), ['autre_affaire', 'territoire']);
  assert.deepEqual(r.ecartes.map((e) => e.raison), ['PORTEE_NON_ETABLIE']); assert.equal(r.evenements.length, 1);
});
t('déclaration : le propos doit être entre guillemets dans la source (discours indirect refusé)', () => {
  const corps = 'La rectrice a reconnu un échec collectif dans cette affaire de périscolaire. Elle a déclaré : « Nous avons failli à notre devoir de protection des enfants ».';
  const d = (citation) => ({ acteur: 'La rectrice', type_acteur: 'education_nationale', a_propos: 'x', portee: 'affaire', citation });
  const r = verifier(base({ declarations: [d('a reconnu un échec collectif dans cette affaire de périscolaire'), d('Nous avons failli à notre devoir de protection des enfants')] }), { corps, publieLe: PUB });
  assert.equal(r.declarations.length, 1); assert.equal(r.ecartes[0].raison, 'PROPOS_NON_ENTRE_GUILLEMETS');
});
t('document d’une autre affaire ou ambigu : rien n’est extrait', () => {
  for (const p of ['AUTRE_AFFAIRE', 'AFFAIRE_SOEUR', 'AMBIGU']) {
    const r = v(base({ pertinence: p, faits_rapportes: [{ texte: 'x', citation: 'condamné mardi l\'enseignant' }], evenements: [evt({ texte: 'condamné', citation: 'condamné mardi l\'enseignant' })] }));
    assert.equal(r.evenements.length + r.faits.length, 0);
  }
  assert.equal(v(null).pertinence, 'AMBIGU', 'réponse illisible → ambigu, jamais pertinent');
});

// ---------------- composition & qualification ----------------
const carte = (statut = 'condamnation non définitive') => ({ case_id: 'FR-TEST-0001', etablissement: 'Lycée Test', commune: 'Rouen', type_structure: 'lycée', role_mis_en_cause: 'enseignant', type_affaire: 'atteinte sexuelle', statut_judiciaire: statut });
const doc = (media = 'France 3', url = 'https://exemple.test/a', date = '2025-12-05', acces = 'libre', origine = 'memoire') => ({ media, url, publication_date: date, acces, origine, motif: acces === 'libre' ? undefined : '403' });
const vv = (o = {}) => ({ pertinence: 'CETTE_AFFAIRE', pertinence_raison: '', noms: ['Jean Dupont'], faits: [], evenements: [], issue: null, declarations: [], lacunes: [], ecartes: [], ...o });
const E = (o) => ({ portee: 'affaire', type: 'decision', acteur: 'Tribunal', texte: 'Le tribunal de Rouen a condamné l’enseignant à quatre ans de prison.', date: '2025-12-04', date_nature: 'evenement', realisation: 'non_applicable', citation: 'condamné à quatre ans', ...o });
const ISSUE = (o = {}) => ({ nature: 'condamnation', date: '2025-12-04', date_nature: 'evenement', appel: 'INCONNU', definitive: 'INCONNU', citation: 'condamné à quatre ans', citation_appel: null, citation_definitive: null, ...o });
const ext = (d, x) => ({ doc: d, v: vv(x) });
const riche = [
  ext(doc('France 3', 'https://x.test/1', '2025-12-05'), { faits: [{ texte: 'Selon la presse, un enseignant était poursuivi pour atteintes sexuelles.', citation: 'c' }], issue: ISSUE(), evenements: [
    E(), E({ type: 'plainte', acteur: 'Famille', texte: 'Une plainte est déposée.', date: '2024-03-04', citation: 'p' }), E({ type: 'mesure_etablissement', acteur: 'Rectorat', texte: 'Le rectorat suspend l’enseignant.', date: null, date_nature: 'article', realisation: 'realisee', citation: 's' })],
    declarations: [{ acteur: 'La rectrice', type_acteur: 'education_nationale', a_propos: 'suspension', citation: 'Nous avons suspendu l’enseignant' }] }),
  ext(doc('ICI', 'https://x.test/2', '2025-12-05'), { issue: ISSUE(), evenements: [E({ texte: 'Le tribunal de Rouen a condamné l’enseignant à quatre ans de prison, selon ICI.' })] }),
];
t('affaire riche, état cohérent : READY, déroulé daté trié, décision corroborée, réaction attribuée, inconnues calculées', () => {
  const r = composer({ c: carte(), extractions: riche, aujourdhui: '2026-10-18' });
  assert.equal(r.qualification, 'READY', JSON.stringify(r.blocages));
  const d = r.dossier;
  assert.deepEqual(d.deroule.map((e) => e.type), ['plainte', 'decision', 'mesure_etablissement'], 'plainte (2024) → décision (4 déc.) → mesure sans date écrite, rangée à sa date de parution (5 déc.)');
  assert.equal(d.deroule.filter((e) => e.type === 'decision').length, 1, 'une décision rapportée par deux sources = une entrée');
  assert.equal(d.deroule.find((e) => e.type === 'decision').sources_complementaires.length, 1);
  assert.equal(d.reactions[0].attribution, 'POSITION_ATTRIBUEE'); assert.ok(d.reactions[0].source.url);
  assert.ok(d.inconnues.some((i) => /Appel et caractère définitif/.test(i)));
  assert.equal(d.statut_affiche, 'condamnation non définitive'); assert.equal(d.appel, false);
  assert.match(d.etat_actuel[0], /^Le tribunal|^Selon/);
  for (const e of d.deroule) assert.ok(e.source.url && e.source.media, 'chaque étape porte sa source');
});
t('mesure sans confirmation de réalisation : annoncée comme telle ; échéance future : « À venir »', () => {
  const r = composer({ c: carte(), aujourdhui: '2026-10-18', extractions: [ext(doc(), { issue: ISSUE(), evenements: [E(), E({ type: 'mesure_etablissement', acteur: 'Rectorat', texte: 'Le rectorat met en place une cellule d’écoute.', date: null, date_nature: 'article', realisation: 'annoncee', citation: 'va' }), E({ type: 'audience', texte: 'L’audience d’appel est fixée au 16 novembre.', date: '2026-11-16', citation: 'a' })] })] });
  assert.ok(r.dossier.deroule.some((e) => /^Mesure annoncée, sans confirmation/.test(e.texte)));
  assert.ok(r.dossier.deroule.some((e) => /^À venir : /.test(e.texte)));
  assert.ok(r.attention.some((a) => a.code === 'ECHEANCE_A_VENIR'));
});
t('ÉTAT CONTRADICTOIRE entre sources (condamné / relaxé, non ordonnables) → BLOQUE', () => {
  const r = composer({ c: carte(), extractions: [ext(doc(), { issue: ISSUE({ date: null, date_nature: 'article' }) }), ext(doc('Autre', 'https://x.test/9'), { issue: ISSUE({ nature: 'relaxe', date: null, date_nature: 'article' }) })] });
  assert.equal(r.qualification, 'BLOQUE'); assert.ok(r.blocages.some((b) => b.code === 'STATUT_CONTRADICTOIRE'));
});
t('carte « relaxe/non-lieu/classement » sans décision de relaxe lue → BLOQUE (R5) ; avec la décision → pas de blocage', () => {
  const sans = composer({ c: carte('relaxe / non-lieu / classement'), extractions: riche });
  assert.ok(sans.blocages.some((b) => b.code === 'ETAT_NON_ETAYE' || b.code === 'ETAT_CARTE_PERIME_OU_CONTREDIT'));
  const avec = composer({ c: carte('relaxe / non-lieu / classement'), extractions: [ext(doc(), { issue: ISSUE({ nature: 'relaxe' }), evenements: [E({ texte: 'Le tribunal a relaxé l’enseignant.', citation: 'relaxé' }), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] })] });
  assert.ok(!avec.blocages.length, JSON.stringify(avec.blocages));
});
t('carte en retard sur les sources (mise en examen → condamnation lue) → BLOQUE avec proposition à la Maintenance, état de la carte non modifié', () => {
  const r = composer({ c: carte('mise en examen'), extractions: riche });
  assert.equal(r.qualification, 'BLOQUE'); assert.deepEqual([r.proposition_etat.de, r.proposition_etat.vers], ['mise en examen', 'condamnation non définitive']);
  assert.equal(r.dossier.statut_affiche, 'mise en examen');
});
t('« condamnation définitive » sur la carte sans finalité écrite → BLOQUE ; finalité écrite → plus de blocage sur ce point', () => {
  assert.ok(composer({ c: carte('condamnation définitive'), extractions: riche }).blocages.length);
  const ok = composer({ c: carte('condamnation définitive'), extractions: [ext(doc(), { issue: ISSUE({ definitive: 'OUI', citation_definitive: 'décision définitive' }), evenements: [E(), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] })] });
  assert.ok(!ok.blocages.length, JSON.stringify(ok.blocages));
});
t('appel rapporté par un acte : la fiche le dit, la décision reste non définitive', () => {
  const r = composer({ c: carte(), extractions: [ext(doc(), { issue: ISSUE({ appel: 'OUI', citation_appel: 'ont fait appel' }), evenements: [E(), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] })] });
  assert.equal(r.dossier.appel, true); assert.match(r.dossier.etat_actuel[1], /appel est rapporté/); assert.equal(r.qualification, 'READY');
});
t('aucune source lisible, ou sous HOLD → BLOQUE ; source pauvre (< 2 étapes, aucune parole) → PAS_D_ENRICHISSEMENT', () => {
  assert.ok(composer({ c: carte(), extractions: [ext(doc('Le Parisien', 'https://x.test/p', '2025-12-04', 'inaccessible'), {})] }).blocages.some((b) => b.code === 'AUCUNE_SOURCE_LISIBLE_ET_PERTINENTE'));
  assert.ok(composer({ c: carte(), extractions: riche, holds: new Set(['FR-TEST-0001']) }).blocages.some((b) => b.code === 'HOLD'));
  const pauvre = composer({ c: carte('plainte'), extractions: [ext(doc(), { evenements: [E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] })] });
  assert.equal(pauvre.qualification, 'PAS_D_ENRICHISSEMENT');
});
t('document ambigu ou d’une affaire sœur : non utilisé, signalé ; il ne nourrit pas la fiche', () => {
  const r = composer({ c: carte(), extractions: [...riche, ext(doc('Sœur', 'https://x.test/s'), { pertinence: 'AFFAIRE_SOEUR', evenements: [E({ texte: 'Autre', citation: 'x' })] }), ext(doc('Flou', 'https://x.test/f'), { pertinence: 'AMBIGU' })] });
  assert.equal(r.dossier.deroule.length, 3); assert.ok(r.attention.some((a) => a.code === 'DOC_IDENTITE_AMBIGUE'));
  assert.equal(r.qualification, 'A_REVOIR', 'une identité ambiguë est un point majeur : jamais READY sans regard humain');
});
t('divergence de chiffres entre deux sources : signalée, qualification A_REVOIR', () => {
  const r = composer({ c: carte(), extractions: [
    ext(doc('A', 'https://x.test/a'), { issue: ISSUE({ citation: 'quatre ans dont un an avec sursis' }), evenements: [E({ texte: 'Le tribunal a condamné l’enseignant à quatre ans de prison dont un an avec sursis.', citation: 'quatre ans dont un an avec sursis' }), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] }),
    ext(doc('B', 'https://x.test/b'), { issue: ISSUE({ citation: 'quatre ans dont trois ans ferme' }), evenements: [E({ texte: 'Le tribunal a condamné l’enseignant à quatre ans de prison dont trois ans fermes.', citation: 'quatre ans dont trois ans ferme' })] }),
  ] });
  assert.ok(r.attention.some((a) => a.code === 'DIVERGENCE_ENTRE_SOURCES'), JSON.stringify(r.attention.map((a) => a.code)));
  assert.equal(r.qualification, 'A_REVOIR'); assert.ok(r.dossier.inconnues.some((i) => /Divergence entre sources/.test(i)));
});
t('garde finale : un nom de mis en cause qui aurait franchi les gardes bloque la fiche', () => {
  const r = composer({ c: carte(), extractions: [ext(doc(), { noms: ['Jean Dupont'], issue: ISSUE(), evenements: [E({ texte: 'Le tribunal a condamné Jean Dupont.' }), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] })] });
  assert.ok(r.blocages.some((b) => b.code === 'NOM_MIS_EN_CAUSE_DANS_LA_FICHE'));
});
t('attribution : une phrase sans sujet institutionnel est attribuée au média ; un nom propre initial garde sa majuscule', () => {
  assert.equal(attribue('Anne Hidalgo a été entendue au Sénat', 'Le Parisien'), 'Selon Le Parisien, Anne Hidalgo a été entendue au Sénat');
  assert.equal(attribue('l’enseignant a été condamné', 'France 3'), 'Selon France 3, l’enseignant a été condamné');
  assert.equal(attribue('Le tribunal a condamné l’enseignant', 'France 3'), 'Le tribunal a condamné l’enseignant');
});
t('même acte, même jour écrit, deux sources → UNE entrée (la phrase la plus complète), l’autre en corroboration', () => {
  const a = ext(doc('A', 'https://x.test/a'), { issue: ISSUE(), evenements: [E({ type: 'audience', texte: 'Le prévenu s’est exprimé à l’audience.', date: '2025-11-03', citation: 'a' })] });
  const b = ext(doc('B', 'https://x.test/b'), { evenements: [E({ type: 'audience', texte: 'À l’audience, le prévenu a reconnu les faits tout en disant ne pas s’en souvenir.', date: '2025-11-03', citation: 'b' })] });
  const r = composer({ c: carte(), extractions: [a, b] });
  const au = r.dossier.deroule.filter((e) => e.type === 'audience');
  assert.equal(au.length, 1); assert.match(au[0].texte, /reconnu les faits/); assert.equal(au[0].sources_complementaires.length, 1);
});
t('aucun contenu fabriqué : une source qui n’apporte rien produit des blocs VIDES, pas du remplissage', () => {
  const r = composer({ c: carte('enquête'), extractions: [ext(doc(), {})] });
  assert.deepEqual([r.dossier.deroule.length, r.dossier.reactions.length, r.dossier.faits], [0, 0, undefined]);
  assert.equal(r.qualification, 'PAS_D_ENRICHISSEMENT');
});

// ---------------- compatibilité avec la proposition « APPROUVER LA FICHE » ----------------
const TYPES_PAGE = ['fait_rapporte', 'signalement', 'plainte', 'enquete', 'garde_a_vue', 'mise_en_examen', 'renvoi', 'audience', 'decision', 'appel', 'mesure_etablissement', 'mesure_collectivite', 'mesure_etat', 'communication_parquet', 'prise_de_parole', 'mobilisation', 'contexte', 'contradiction'];
t('le dossier généré a la forme des dossiers de data/hub-matiere (types connus de la page, sources libres, réactions attribuées)', () => {
  const r = composer({ c: carte(), extractions: riche, aujourdhui: '2026-10-18' });
  for (const e of r.dossier.deroule) { assert.ok(TYPES_PAGE.includes(e.type), e.type); assert.equal(e.source.acces, 'libre'); assert.ok(['evenement', 'approximative', 'article', 'inconnue'].includes(e.date_nature)); }
  for (const x of r.dossier.reactions) { assert.ok(['PAROLE_ETABLIE', 'POSITION_ATTRIBUEE'].includes(x.validation) && x.portee === 'affaire' && x.acteur && x.source.url); }
  assert.ok(Array.isArray(r.dossier.etat_actuel) && Array.isArray(r.dossier.inconnues));
});
t('proposition Telegram : message annonce fiche automatique, qualification et points d’attention ; bouton APPROUVER valable ; hash = empreinte du dossier', () => {
  const c = carte();
  const r = composer({ c, extractions: [...riche, ext(doc('Flou', 'https://x.test/f'), { pertinence: 'AMBIGU' })] });
  const generation = { contrat: 'x', modele: 'm', genere_le: '2026-10-18', qualification: r.qualification, blocages: r.blocages, attention: r.attention, ecartes: r.ecartes, sources: [{ acces: 'libre', pertinence: 'CETTE_AFFAIRE' }, { acces: 'libre', pertinence: 'AMBIGU' }] };
  const p = payloadFiche({ c, dossier: { hub: null, d: r.dossier, verifie_le: '2026-10-18' }, sourcesNeon: [], nbEvenements: 0, previewBase: null, generation });
  assert.equal(p.page.hash, hashDossier(r.dossier));
  const m = messageFiche(p);
  for (const re of [/FICHE INDIVIDUELLE À APPROUVER/, /PRODUITE AUTOMATIQUEMENT · qualification A_REVOIR/, /Points d’attention/, /Inconnues/, /Ce n’est pas la publication de l’affaire/]) assert.match(m, re);
  assert.equal(boutonValable('VALIDATE', p), true);
  assert.ok(!/Dupont/.test(JSON.stringify(p) + m));
});
t('un dossier généré BLOQUÉ n’est jamais proposable ; fichier d’une autre version ou d’une autre affaire ignoré', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sny-fiches-'));
  const w = (id, o) => writeFileSync(join(dir, `${id}.json`), JSON.stringify(o));
  const g = (q) => ({ genere_le: '2026-10-18', qualification: q, blocages: [], attention: [], ecartes: [], sources: [] });
  w('FR-A', { version: 'fiche-generee-1', case_id: 'FR-A', dossier: {}, generation: g('BLOQUE') });
  w('FR-B', { version: 'fiche-generee-1', case_id: 'FR-B', dossier: {}, generation: g('READY') });
  w('FR-C', { version: 'autre', case_id: 'FR-C', dossier: {}, generation: g('READY') });
  const u = pathToFileURL(dir + '/');
  assert.equal(dossierGeneree('FR-A', u).proposable, false);
  assert.equal(dossierGeneree('FR-B', u).proposable, true);
  assert.equal(dossierGeneree('FR-C', u), null);
  assert.equal(dossierGeneree('FR-B', pathToFileURL(mkdtempSync(join(tmpdir(), 'sny-vide-')) + '/')), null);
});
t('rendu public : ni extrait littéral ni détail des éléments écartés ; rendu complet : traçabilité', () => {
  const c = carte();
  const r = composer({ c, extractions: [ext(doc(), { noms: ['Jean Dupont'], issue: ISSUE({ citation: 'CITATION-SECRETE' }), evenements: [E({ citation: 'CITATION-SECRETE' }), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })], ecartes: [{ element: 'declaration', raison: 'NOM_MIS_EN_CAUSE', extrait: 'Jean Dupont' }] })] });
  const generation = { contrat: 'x', modele: 'm', genere_le: '2026-10-18', qualification: r.qualification, blocages: r.blocages, attention: r.attention, ecartes: r.ecartes, trace: r.trace, stats: r.stats, cout: { appels: 0, cache: 0, input_tokens: 0, output_tokens: 0, cout_usd: null }, sources: [{ url: 'https://exemple.test/a', media: 'France 3', acces: 'libre', origine: 'memoire', pertinence: 'CETTE_AFFAIRE' }] };
  const pub = rendreMarkdown({ c, dossier: r.dossier, generation }, { complet: false });
  assert.ok(!/CITATION-SECRETE|Dupont/.test(pub)); assert.match(pub, /Inconnues et limites documentaires/);
  assert.match(rendreMarkdown({ c, dossier: r.dossier, generation }, { complet: true }), /CITATION-SECRETE/);
});

t('une « issue » qui n’en est pas une (remise en liberté) ne remplace pas l’état tiré des événements ; l’état « mise en examen » reste établi', () => {
  const r0 = v(base({ issue_judiciaire: { nature: 'autre', date: null, citation_date: null, citation: "condamné mardi l'enseignant à quatre ans de prison dont un an avec sursis", appel: 'INCONNU', definitive: 'INCONNU' } }));
  assert.equal(r0.issue, null); assert.match(r0.ecartes[0].raison, /^NATURE_HORS_ISSUES_RETENUES/);
  const r = composer({ c: carte('mise en examen'), extractions: [ext(doc(), { issue: null, evenements: [E({ type: 'mise_en_examen', texte: 'Le juge a mis en examen l’animateur.', date: '2026-07-10', citation: 'm' }), E({ type: 'garde_a_vue', texte: 'L’animateur a été placé en garde à vue.', date: '2026-07-06', citation: 'g' })] })] });
  assert.ok(!r.blocages.length, JSON.stringify(r.blocages));
});
t('décision sans phrase extraite : phrase structurée (nature + date), jamais la citation brute (âge, nom, nombre d’enfants)', () => {
  const r = composer({ c: carte(), extractions: [ext(doc(), { issue: ISSUE({ citation: 'Le sexagénaire a été condamné par trois élèves CITATION-BRUTE' }), evenements: [E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' }), E({ type: 'audience', texte: 'L’audience s’est tenue.', date: '2025-11-03' })] })] });
  assert.match(r.dossier.etat_actuel[0], /^Selon France 3, une condamnation est rapportée \(décision du 4 décembre 2025\)\.$/);
  assert.ok(!/CITATION-BRUTE|sexagénaire/.test(JSON.stringify(r.dossier)));
});

t('âge du mis en cause (même par tranche) et nombre de familles plaignantes : écartés ; « plusieurs familles » autorisé', () => {
  const corps = "Un homme d'une trentaine d'années a été mis en examen. Quatorze familles ont déposé plainte. Plusieurs familles se sont regroupées.";
  const f = (texte, citation) => ({ portee: 'affaire', texte, citation });
  const r = verifier(base({ faits_rapportes: [f("Un homme d'une trentaine d'années a été mis en examen.", "Un homme d'une trentaine d'années a été mis en examen"), f('Quatorze familles ont déposé plainte.', 'Quatorze familles ont déposé plainte'), f('Plusieurs familles se sont regroupées.', 'Plusieurs familles se sont regroupées')] }), { corps, publieLe: PUB });
  assert.deepEqual(r.ecartes.map((e) => e.raison), ['AGE_MIS_EN_CAUSE', 'NOMBRE_EXACT_ENFANTS']); assert.equal(r.faits.length, 1);
});
t('sans décision : la phrase d’état est celle de l’étape qui fait l’état (mise en examen), pas la dernière mentionnée ; citations → attention « à relire »', () => {
  const r = composer({ c: carte('mise en examen'), extractions: [ext(doc(), { evenements: [E({ type: 'mise_en_examen', texte: 'Le juge a mis en examen l’animateur.', date: '2026-07-10', citation: 'm' }), E({ type: 'enquete', texte: 'L’enquête se poursuit.', date: null, date_nature: 'article', citation: 'e' })], declarations: [{ acteur: 'Le maire', type_acteur: 'collectivite', a_propos: 'x', citation: 'Il y aura un avant et un après dans cette commune' }] })] });
  assert.match(r.dossier.etat_actuel[0], /mis en examen/); assert.ok(r.attention.some((a) => a.code === 'CITATIONS_A_RELIRE'));
});

t('doublons : une mesure rapportée sous deux étiquettes = un fait ; une déclaration qui répète le déroulé est écartée ; deux déclarations par acteur au plus', () => {
  const D = (acteur, citation) => ({ acteur, type_acteur: 'parquet', a_propos: 'x', portee: 'affaire', citation });
  const r = composer({ c: carte('mise en examen'), extractions: [
    ext(doc('A', 'https://x.test/a'), { evenements: [E({ type: 'mise_en_examen', texte: 'Le juge a mis en examen l’animateur.', date: '2026-07-10', citation: 'm' }), E({ type: 'mesure_etablissement', acteur: 'Rectorat', texte: 'Le rectorat a suspendu l’enseignant en mars.', date: null, date_nature: 'article', realisation: 'realisee', citation: 's' })],
      declarations: [D('La procureure', 'Le juge a mis en examen l’animateur aujourd’hui même'), D('La procureure', 'De nombreuses auditions ont été menées dans ce dossier'), D('La procureure', 'Les investigations se poursuivent pour identifier toutes les victimes'), D('La procureure', 'Un signalement a été adressé par la direction académique en mars')] }),
    ext(doc('B', 'https://x.test/b'), { evenements: [E({ type: 'mesure_etat', acteur: 'Éducation nationale', texte: 'L’enseignant a été suspendu en mars par le rectorat.', date: null, date_nature: 'article', realisation: 'realisee', citation: 's2' })] }),
  ] });
  assert.equal(r.dossier.deroule.filter((e) => /^mesure_/.test(e.type)).length, 1);
  assert.equal(r.dossier.reactions.length, 2);
  assert.deepEqual(r.ecartes.map((e) => e.raison), ['DECLARATION_REDONDANTE_AVEC_LE_DEROULE', 'ACTEUR_DEJA_REPRESENTE']);
});

t('âge d’un enfant et propos sur un proche de victime : écartés ; deux mesures distinctes d’un même article ne fusionnent pas', () => {
  const corps = "Le parquet précise : « la mère d'une fillette de 5 ans s'inquiétait pour sa fille ». Plaintes de parents de fillettes âgées de 4 et 5 ans. « Le service reste ouvert à toutes les familles concernées » a dit le maire.";
  const r = verifier(base({ faits_rapportes: [{ portee: 'affaire', texte: 'Des parents de fillettes âgées de 4 et 5 ans ont porté plainte.', citation: 'Plaintes de parents de fillettes âgées de 4 et 5 ans' }], declarations: [
    { acteur: 'Le parquet', type_acteur: 'parquet', a_propos: 'x', portee: 'affaire', citation: "la mère d'une fillette de 5 ans s'inquiétait pour sa fille" },
    { acteur: 'Le maire', type_acteur: 'collectivite', a_propos: 'x', portee: 'affaire', citation: 'Le service reste ouvert à toutes les familles concernées' }] }), { corps, publieLe: PUB });
  assert.deepEqual(r.ecartes.map((e) => e.raison), ['AGE_ENFANT', 'PROCHE_DE_VICTIME']); assert.equal(r.declarations.length, 1);
  const m = (texte, c) => E({ type: 'mesure_collectivite', acteur: 'Mairie', texte, date: null, date_nature: 'article', realisation: 'realisee', citation: c });
  const c = composer({ c: carte('mise en examen'), extractions: [ext(doc(), { evenements: [m('La mairie a organisé une réunion publique avec les parents.', 'a'), m('La mairie a mis en place une cellule d’écoute pour les parents.', 'b'), E({ type: 'mise_en_examen', texte: 'Le juge a mis en examen l’animateur.', date: '2026-07-10', citation: 'm' })] })] });
  assert.equal(c.dossier.deroule.filter((e) => /^mesure_/.test(e.type)).length, 2);
});

// ---------------- synthèse visuelle, mesures, citations récupérées ----------------
const SIT = (r) => r.dossier.situation;
t('synthèse : condamnation → bloc rouge « Condamnation » (date + autorité), suite « Aucun appel rapporté » ; relaxe → vert ; appel rapporté → orange', () => {
  const cond = composer({ c: carte(), extractions: [ext(doc(), { issue: ISSUE(), evenements: [E({ acteur: 'Tribunal correctionnel de Rouen' }), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] })] });
  assert.deepEqual([SIT(cond).decision.titre, SIT(cond).decision.cat, SIT(cond).decision.meta, SIT(cond).suite.titre, SIT(cond).suite.cat], ['Condamnation', 'red', '4 décembre 2025 · Tribunal correctionnel de Rouen', 'Aucun appel rapporté', 'blue']);
  const rel = composer({ c: carte('relaxe / non-lieu / classement'), extractions: [ext(doc(), { issue: ISSUE({ nature: 'relaxe' }), evenements: [E({ texte: 'Le tribunal a relaxé l’enseignant.', citation: 'relaxé' }), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] })] });
  assert.deepEqual([SIT(rel).decision.titre, SIT(rel).decision.cat], ['Relaxe', 'green']);
  assert.ok(SIT(rel).suite.lignes[0].includes('ne mentionne de recours') && !/non définitive/.test(JSON.stringify(SIT(rel))), 'pas de « non définitive » appliqué à une relaxe ou un classement');
  const app = composer({ c: carte(), extractions: [ext(doc(), { issue: ISSUE({ appel: 'OUI', citation_appel: 'ont fait appel' }), evenements: [E(), E({ type: 'plainte', texte: 'Une plainte est déposée.', date: '2024-03-04' })] })] });
  assert.deepEqual([SIT(app).suite.titre, SIT(app).suite.cat], ['Appel rapporté', 'orange']);
});
t('synthèse : une mise en examen n’est jamais présentée comme une condamnation ; sans décision → « Aucune décision rendue » + présomption d’innocence ; audience future → « Prochaine étape »', () => {
  const mee = composer({ c: carte('mise en examen'), aujourdhui: '2026-10-18', extractions: [ext(doc(), { evenements: [E({ type: 'mise_en_examen', acteur: 'parquet de Rennes', texte: 'Le juge a mis en examen l’animateur.', date: '2026-07-10', citation: 'm' }), E({ type: 'garde_a_vue', texte: 'L’animateur a été placé en garde à vue.', date: '2026-07-06', citation: 'g' })] })] });
  assert.deepEqual([SIT(mee).decision.titre, SIT(mee).decision.cat, SIT(mee).decision.meta, SIT(mee).suite.titre], ['Mise en examen', 'blue', '10 juillet 2026 · Parquet de Rennes', 'Aucune décision rendue']);
  assert.ok(!/condamn/i.test(JSON.stringify(SIT(mee))) && SIT(mee).suite.lignes.some((l) => /présumée innocente/.test(l)));
  const fut = composer({ c: carte('mise en examen'), aujourdhui: '2026-10-18', extractions: [ext(doc(), { evenements: [E({ type: 'mise_en_examen', texte: 'Le juge a mis en examen l’animateur.', date: '2026-07-10', citation: 'm' }), E({ type: 'audience', texte: 'Le procès est fixé au 22 février.', date: '2027-02-22', citation: 'p' })] })] });
  assert.deepEqual([SIT(fut).suite.label, SIT(fut).suite.titre], ['Prochaine étape', 'Audience le 22 février 2027']);
});
t('synthèse : date omise si les sources divergent ; aucune mesure connue → aucune ligne de mesure ; aucun état établi → aucun bloc', () => {
  const div = composer({ c: carte('mise en examen'), extractions: [ext(doc('A', 'https://x.test/a'), { evenements: [E({ type: 'mise_en_examen', texte: 'Le juge a mis en examen l’animateur.', date: '2026-09-22', citation: 'm' })] }), ext(doc('B', 'https://x.test/b'), { evenements: [E({ type: 'mise_en_examen', texte: 'L’animateur a été mis en examen par le juge.', date: '2026-09-21', citation: 'n' })] })] });
  assert.ok(!/2026/.test(SIT(div).decision.meta ?? ''));
  assert.ok(!(SIT(div).suite.lignes || []).some((l) => /Mesure/.test(l)));
  const rien = composer({ c: carte('enquête'), extractions: [ext(doc(), {})] });
  assert.equal(rien.dossier.situation, undefined);
});
t('synthèse : une mesure documentée apparaît en ligne distincte de la décision ; une mesure annoncée est dite annoncée', () => {
  const r = composer({ c: carte(), extractions: [ext(doc(), { issue: ISSUE(), evenements: [E(), E({ type: 'mesure_etablissement', acteur: 'Rectorat', texte: 'Le rectorat a suspendu l’enseignant en mars.', date: null, date_nature: 'article', realisation: 'realisee', citation: 's' }), E({ type: 'mesure_collectivite', acteur: 'Mairie', texte: 'La mairie va ouvrir une cellule d’écoute.', date: null, date_nature: 'article', realisation: 'annoncee', citation: 'c' })] })] });
  const l = SIT(r).suite.lignes.join(' | ');
  assert.match(l, /Mesure institutionnelle \(distincte de la décision judiciaire\) : le rectorat a suspendu/); assert.match(l, /Mesure annoncée, sans confirmation/);
});
t('mesures : même mot-clé (mis à pied / suspendu), même réalisation → un seul fait ; annonce ≠ mise en œuvre → deux faits ; mots-clés différents → deux faits', () => {
  const m = (texte, realisation, date = null) => E({ type: 'mesure_collectivite', acteur: 'Mairie', texte, date, date_nature: date ? 'evenement' : 'article', realisation, citation: 'x' });
  const n = (...evs) => composer({ c: carte('mise en examen'), extractions: [ext(doc(), { evenements: [E({ type: 'mise_en_examen', texte: 'Le juge a mis en examen l’animateur.', date: '2026-07-10', citation: 'm' }), ...evs] })] }).dossier.deroule.filter((e) => /^mesure_/.test(e.type)).length;
  assert.equal(n(m('L’animateur a été mis à pied à titre conservatoire le 28 juin.', 'realisee', '2026-06-28'), m('L’animateur a été suspendu quand l’affaire a éclaté en juin.', 'realisee')), 1);
  assert.equal(n(m('L’animateur a été suspendu.', 'realisee'), m('La mairie annonce la suspension de l’animateur.', 'annoncee')), 2);
  assert.equal(n(m('L’animateur a été suspendu.', 'realisee'), m('La mairie a ouvert une cellule d’écoute.', 'realisee')), 2);
});
t('citation récupérée : la phrase de la source désignée par un ancrage est retenue si elle soutient le texte ; sinon refus', () => {
  const corps = "La mairie a publié un communiqué. Elle y annonce la suspension d'un animateur du centre de loisirs dès vendredi. Le conseil se réunira plus tard.";
  const cit = "Elle y annonce la suspension d'un animateur du centre de loisirs dès vendredi, après avoir reçu les parents";
  assert.equal(recupererCitation(corps, cit, "Selon Sud Ouest, la mairie annonce la suspension d'un animateur du centre de loisirs."), "Elle y annonce la suspension d'un animateur du centre de loisirs dès vendredi.");
  assert.equal(recupererCitation(corps, cit, "Selon Sud Ouest, la mairie a licencié le directeur et fermé définitivement l'école."), null, 'texte non soutenu par la phrase');
  assert.equal(recupererCitation(corps, "Le préfet a ordonné la fermeture immédiate de tous les centres de loisirs du département", 'Le préfet a ordonné la fermeture de tous les centres.'), null, 'ancrage absent de la source');
  const r = verifier(base({ evenements: [evt({ type: 'mesure_etablissement', realisation: 'realisee', texte: "Selon Sud Ouest, la mairie annonce la suspension d'un animateur du centre de loisirs.", citation: cit, acteur: 'Mairie' })] }), { corps, publieLe: PUB });
  assert.equal(r.evenements.length, 1); assert.equal(r.recuperees, 1); assert.equal(r.evenements[0].realisation, 'annoncee'); assert.ok(corps.includes(r.evenements[0].citation));
});

// ---------------- promotion après approbation ----------------
const D1 = { etat_actuel: ['x'], deroule: [], inconnues: [], statut_affiche: 'enquête' };
const gen = (d = D1, proposable = true) => ({ d, proposable });
const rev = (h, by = 'Adrien (Telegram, fiche)', dec = 'validé') => [{ reviewed_by: by, decision: dec, comment: `[Fiche approuvée 1a2b3c4d] FR-T-1 hash=${h}` }];
const ctx = (o = {}) => ({ id: 'FR-T-1', generee: gen(), revues: rev(hashDossier(D1)), isoles: { dossiers: {} }, hubs: [], cases: [{ case_id: 'FR-T-1' }], holds: new Set(), ...o });
t('promotion : permise seulement si l’approbation d’Adrien porte l’empreinte exacte du dossier généré', () => {
  const r = decider(ctx()); assert.equal(r.ok, true); assert.equal(r.hash, hashDossier(D1));
  assert.equal(decider(ctx({ revues: [] })).motif, 'AUCUNE_APPROBATION');
  assert.equal(decider(ctx({ revues: rev('0000000000000000') })).motif, 'EMPREINTE_APPROUVEE_DIFFERENTE');
  assert.equal(decider(ctx({ revues: rev(hashDossier(D1), 'import-script') })).motif, 'AUCUNE_APPROBATION', 'un tiers n’approuve rien');
  assert.equal(decider(ctx({ revues: rev(hashDossier(D1), 'Adrien (x)', 'à corriger') })).motif, 'AUCUNE_APPROBATION');
});
t('promotion : fiche non proposable, affaire non publique, HOLD, dossier déjà présent (jamais d’écrasement) → refus', () => {
  assert.equal(decider(ctx({ generee: gen(D1, false) })).motif, 'FICHE_GENEREE_ABSENTE_OU_NON_PROPOSABLE');
  assert.equal(decider(ctx({ generee: null })).motif, 'FICHE_GENEREE_ABSENTE_OU_NON_PROPOSABLE');
  assert.equal(decider(ctx({ cases: [] })).motif, 'AFFAIRE_NON_PUBLIQUE');
  assert.equal(decider(ctx({ holds: new Set(['FR-T-1']) })).motif, 'HOLD');
  assert.equal(decider(ctx({ isoles: { dossiers: { 'FR-T-1': {} } } })).motif, 'DOSSIER_DEJA_PRESENT_PAS_D_ECRASEMENT');
  assert.equal(decider(ctx({ hubs: [{ dossiers: { 'FR-T-1': {} } }] })).motif, 'DOSSIER_DEJA_PRESENT_PAS_D_ECRASEMENT');
});
t('promotion : le dossier inscrit garde l’empreinte approuvée, les autres dossiers sont intacts', () => {
  const avant = { _meta: { a: 1 }, dossiers: { AUTRE: { x: 1 } } };
  const apres = inscrire(avant, 'FR-T-1', D1, hashDossier(D1));
  assert.equal(hashDossier(apres.dossiers['FR-T-1']), hashDossier(D1)); assert.deepEqual(apres.dossiers.AUTRE, { x: 1 }); assert.equal(apres._meta.a, 1);
  assert.equal(avant.dossiers['FR-T-1'], undefined, 'entrée non mutée');
  assert.throws(() => inscrire(avant, 'FR-T-1', D1, '0000000000000000'));
});

// ---------------- découverte & identité ----------------
t('requêtes de découverte : sans guillemets ni arrondissement ; structure non nommée → description ; commune inconnue → aucune requête', () => {
  const q = requetesDecouverte({ etablissement: 'École Aqueduc', commune: 'Paris 10e', role_mis_en_cause: 'animateur', type_structure: 'école', type_affaire: 'x' });
  assert.ok(q.every((x) => !/["«]/.test(x) && !/10e/.test(x)) && /Aqueduc Paris/.test(q[0]));
  assert.ok(requetesDecouverte({ etablissement: 'Lycée non nommé', commune: 'Rouen', role_mis_en_cause: 'enseignant', type_structure: 'lycée', type_affaire: 'atteinte sexuelle' })[0].startsWith('lycée Rouen enseignant'));
  assert.deepEqual(requetesDecouverte({ etablissement: 'Collège non nommé', commune: 'commune non précisée', role_mis_en_cause: 'x', type_structure: 'collège', type_affaire: 'x' }), []);
});
t('affaires sœurs : même commune (arrondissements confondus) ou même structure', () => {
  const toutes = [{ case_id: 'A', etablissement: 'École Aqueduc', commune: 'Paris 10e' }, { case_id: 'B', etablissement: 'École Aqueduc', commune: 'Paris 10e' }, { case_id: 'C', etablissement: 'École Boulard', commune: 'Paris 14e' }, { case_id: 'D', etablissement: 'Lycée Test', commune: 'Rouen' }];
  assert.deepEqual(affairesSoeurs(toutes[0], toutes).map((x) => x.case_id), ['B', 'C']);
  assert.deepEqual(affairesSoeurs(toutes[3], toutes), []);
});
console.log(`\n${n} contrôles génération de fiches : OK`);
