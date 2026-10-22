// =====================================================================
// Corrections éditoriales du lot #1 (retours de relecture du 21/10/2026) — TRACE REPRODUCTIBLE, pas un outil du circuit.
//
// Chaque version corrigée part de la version RELUE (empreinte indiquée) et n'y applique que des corrections sourcées :
//   - chaque ajout est vérifié contre le texte de l'article (cache disque .cache/fiches/pages) : citation littérale présente, sinon refus ;
//   - chaque retrait / requalification est consigné dans `generation.corrections` avec son motif ;
//   - la version relue est archivée à côté (data/fiches-generees/versions/<ID>.<empreinte>.json) et référencée (`generation.version_precedente`).
// Aucune écriture Neon, aucun envoi, aucune approbation : le dossier corrigé a une NOUVELLE empreinte, à approuver par le circuit existant.
//
//   node docs/industrialisation/fiches-generees/v4/appliquer-corrections-lot1.mjs [ID …]      (défaut : toutes)
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { lireDocument } from '../../../../scripts/lib/fiche-sources.mjs';
import { hashDossier } from '../../../../scripts/lib/fiche-page.mjs';
import { rendreMarkdown } from '../../../../scripts/lib/fiche-rendu.mjs';
import { liberationPosterieure } from '../../../../scripts/lib/fiche-composer.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '../../../../');
const GEN = join(RACINE, 'data/fiches-generees/');
const cases = JSON.parse(readFileSync(join(RACINE, 'data/cases.json'), 'utf8')).cases;
const ORIGINE = 'retour de relecture humaine du 21/10/2026';
const ORDRE_TYPE = ['fait_rapporte', 'signalement', 'plainte', 'enquete', 'garde_a_vue', 'mise_en_examen', 'mesure_etablissement', 'mesure_collectivite', 'mesure_etat', 'communication_parquet', 'renvoi', 'audience', 'decision', 'appel', 'contexte'];
const norm = (s) => String(s).replace(/[’‘]/g, "'").replace(/[«»“”]/g, '"').replace(/\s+/g, ' ').toLowerCase();

const cacheDocs = new Map();
async function texte(url) { if (!cacheDocs.has(url)) cacheDocs.set(url, (await lireDocument(url)).corps || ''); return cacheDocs.get(url); }
/** Refuse toute citation absente du texte de l'article. */
async function verifier(url, citations) {
  const t = norm(await texte(url));
  if (!t) throw new Error(`article illisible : ${url}`);
  for (const c of citations) if (!t.includes(norm(c))) throw new Error(`citation absente de ${url} : « ${c} »`);
}

// ---- sources utilisées (urls complètes) ----
const U = {
  F3_ARA: 'https://france3-regions.franceinfo.fr/auvergne-rhone-alpes/rhone/lyon/soupcons-de-violences-sexuelles-dans-deux-creches-lyonnaises-people-baby-de-nouveau-dans-la-tourmente-3173124.html',
  MEDIACITES: 'https://www.mediacites.fr/enquete/lyon/2025/06/17/creches-peoplebaby-de-nouveau-mis-en-cause-a-lyon-apres-des-accusations-de-violences-sexuelles-sur-des-enfants/',
  LYON_CAPITALE: 'https://www.lyoncapitale.fr/actualite/le-groupe-people-baby-encore-epingle-a-lyon-le-salarie-d-une-creche-suspecte-de-comportement-inapproprie',
  ICI_REZE: 'https://www.ici.fr/pays-de-la-loire/loire-atlantique-44/reze/reze-l-ex-animateur-periscolaire-soupconne-d-agressions-sexuelles-sera-rejuge-en-novembre-a-rennes-8058661',
  ML_2026: 'https://www.midilibre.fr/2026/09/09/viols-a-lecole-de-vic-la-gardiole-un-an-apres-la-mise-en-cause-de-latsem-limpatience-des-familles-et-la-prudence-des-experts-13532491.php',
};
const SRC = {
  F3_ARA: { media: 'France 3 Régions', url: U.F3_ARA, publie_le: '2025-06-18', acces: 'libre' },
  MEDIACITES: { media: 'Médiacités', url: U.MEDIACITES, publie_le: '2025-06-17', acces: 'libre' },
  LYON_CAPITALE: { media: 'Lyon capitale', url: U.LYON_CAPITALE, publie_le: '2025-06-20', acces: 'libre' },
  ICI_REZE: { media: 'ICI', url: U.ICI_REZE, publie_le: '2026-06-09', acces: 'libre' },
  ML_2026: { media: 'Midi Libre', url: U.ML_2026, publie_le: '2026-09-09', acces: 'libre' },
};

// ---- machinerie ----
function charger(id) {
  // Idempotent : on repart TOUJOURS de la version relue archivée (jamais d'une version déjà corrigée).
  const archives = existsSync(join(GEN, 'versions')) ? readdirSync(join(GEN, 'versions')).filter((x) => x.startsWith(`${id}.`)) : [];
  const f = archives.length ? join(GEN, 'versions', archives[0]) : join(GEN, `${id}.json`);
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return { j, d: structuredClone(j.dossier), g: structuredClone(j.generation), avant: hashDossier(j.dossier), corrections: [], preuves: [] };
}
const evt = (x) => ({ date: null, date_nature: 'article', acteur: null, ...x });
async function ajouterEtape(c, e, citations, motif) {
  await verifier(e.source.url, citations);
  c.d.deroule.push(e);
  c.corrections.push({ operation: 'ajout_etape', cible: e.texte, motif, origine: ORIGINE, preuves: citations.map((ci) => ({ media: e.source.media, url: e.source.url, citation: ci })) });
  c.preuves.push({ ref: `ajout:${e.type}`, texte: e.texte, preuves: citations.map((ci) => ({ url: e.source.url, media: e.source.media, citation: ci })) });
}
function retirerEtapes(c, pred, motif) {
  if (!c.d.deroule.some(pred)) throw new Error(`aucune étape à retirer pour : ${motif}`);
  for (const e of c.d.deroule.filter(pred)) c.corrections.push({ operation: 'retrait_etape', cible: e.texte, motif, origine: ORIGINE });
  c.d.deroule = c.d.deroule.filter((e) => !pred(e));
}
function retirerReactions(c, pred, motif) {
  for (const r of c.d.reactions.filter(pred)) c.corrections.push({ operation: 'retrait_reaction', cible: `${r.acteur} — « ${r.citations[0].texte} »`, motif, origine: ORIGINE });
  c.d.reactions = c.d.reactions.filter((r) => !pred(r));
}
async function ajouterReaction(c, r, motif) {
  await verifier(r.source.url, [r.citations[0].texte]);
  c.d.reactions.push({ portee: 'affaire', attribution: 'POSITION_ATTRIBUEE', validation: 'POSITION_ATTRIBUEE', date_nature: 'article', etabli: `Établi : propos rapportés par ${r.source.media}. Une prise de parole n’établit pas son contenu.`, ...r, date: r.source.publie_le });
  c.corrections.push({ operation: 'ajout_reaction', cible: `${r.acteur} — « ${r.citations[0].texte} »`, motif, origine: ORIGINE, preuves: [{ media: r.source.media, url: r.source.url, citation: r.citations[0].texte }] });
}
const ajouterSource = (c, s, raison) => { if (!c.g.sources.some((x) => x.url === s.url)) c.g.sources.push({ url: s.url, media: s.media, publication_date: s.publie_le, origine: 'fournie', acces: 'libre', pertinence: 'CETTE_AFFAIRE', raison }); };
const tri = (e) => e.date || e.source?.publie_le || '';

/** Recalcule ce qui dérive du déroulé : tri, comptes, « N articles lus », points d'attention chiffrés. */
function recalculer(c) {
  if (!c.ordreManuel) c.d.deroule.sort((a, b) => tri(a).localeCompare(tri(b)) || ORDRE_TYPE.indexOf(a.type) - ORDRE_TYPE.indexOf(b.type));
  const docsLus = c.g.sources.filter((s) => s.acces === 'libre' && s.pertinence === 'CETTE_AFFAIRE');
  const lus = [...new Set(docsLus.map((s) => s.media))];
  c.d.inconnues = c.d.inconnues.map((x) => (/^Le dossier ne repose que sur \d+ article/.test(x) ? `Le dossier ne repose que sur ${docsLus.length} article${docsLus.length > 1 ? 's' : ''} lu${docsLus.length > 1 ? 's' : ''} (${lus.join(', ')}).` : x));
  const sansDate = c.d.deroule.filter((e) => e.date_nature === 'article').length;
  for (const a of c.g.attention) if (a.code === 'DATES_NON_ECRITES') a.texte = a.texte.replace(/^\d+ étape\(s\)/, `${sansDate} étape(s)`);
  c.g.attention = c.g.attention.filter((a) => !(a.code === 'SOURCE_UNIQUE' && docsLus.length > 1) && !(a.code === 'DATES_NON_ECRITES' && !sansDate));
  c.g.stats = { ...c.g.stats, sources_pertinentes: docsLus.length, sources_contributrices: docsLus.length, etapes: c.d.deroule.length, reactions: c.d.reactions.length, inconnues: c.d.inconnues.length };
}
function ecrire(c, id, { qualification } = {}) {
  recalculer(c);
  const apres = hashDossier(c.d);
  if (apres === c.avant) throw new Error(`${id} : aucune modification effective`);
  if (qualification) c.g.qualification = qualification;
  c.g.version_precedente = { empreinte: c.avant, qualification: c.j.generation.qualification, rendu: `docs/industrialisation/fiches-generees/${existsSync(join(RACINE, `docs/industrialisation/fiches-generees/${id}.md`)) ? '' : 'v3/'}${id}.md` };
  c.g.corrections = c.corrections;
  c.g.corrige_le = '2026-10-22';
  c.g.stats.empreinte = apres;
  c.g.trace = [...c.g.trace, ...c.preuves];
  mkdirSync(join(GEN, 'versions'), { recursive: true });
  const archive = join(GEN, 'versions', `${id}.${c.avant}.json`);
  if (!existsSync(archive)) copyFileSync(join(GEN, `${id}.json`), archive);
  const sortie = { version: 'fiche-generee-1', case_id: id, dossier: c.d, generation: c.g };
  writeFileSync(join(GEN, `${id}.json`), JSON.stringify(sortie, null, 2));
  const carte = cases.find((x) => x.case_id === id);
  writeFileSync(join(GEN, `${id}.revue.md`), rendreMarkdown({ c: carte, dossier: c.d, generation: c.g }, { complet: true }));
  const rendu = rendreMarkdown({ c: carte, dossier: c.d, generation: c.g }, { complet: false });
  writeFileSync(join(GEN, `${id}.public.md`), rendu);
  writeFileSync(join(ICI, `${id}.md`), rendu);
  console.log(`✓ ${id} : ${c.avant} → ${apres} · ${c.corrections.length} correction(s) · ${c.g.qualification}`);
}
/** Ordre de lecture explicite quand aucune étape n'a de date écrite (le tri par parution mélangerait les articles). */
function ordonner(c, motifs) {
  const rang = (e) => { const i = motifs.findIndex((m) => m.test(e.texte)); if (i < 0) throw new Error(`étape sans rang : ${e.texte.slice(0, 60)}`); return i; };
  c.d.deroule.sort((a, b) => rang(a) - rang(b));
  c.ordreManuel = true;
}
const ligneSuite = (c, ligne) => { const l = c.d.situation?.suite; if (l) l.lignes = [...(l.lignes || []), ligne]; };

// =====================================================================
const CORRECTIONS = {
  // ------------------------------------------------------------------ Tarnos : état non actualisé (une seule ligne)
  async 'FR-2026-0115'() {
    const c = charger('FR-2026-0115');
    const lib = liberationPosterieure(c.d.etat_actuel[0], c.d.deroule);
    if (!lib) throw new Error('0115 : aucune libération à rapporter');
    c.d.etat_actuel.push(`Évolution rapportée : ${lib.texte}`);
    c.d.synthese = { ...c.d.synthese, ouvert: c.d.etat_actuel[1] };
    c.d.situation.suite.lignes = [`Évolution rapportée : ${lib.texte}`, ...c.d.situation.suite.lignes];
    c.corrections.push({ operation: 'ligne_etat', cible: c.d.etat_actuel[0], apres: c.d.etat_actuel[1], motif: 'La phrase d’état (« écroué ») ne disait pas que la chambre de l’instruction a ensuite remis l’animateur en liberté sous contrôle judiciaire (étape déjà présente dans la chronologie) ; même règle que la correction du moteur (liberationPosterieure).', origine: 'contrôle de la fiche relue sans réserve (aucun changement demandé) — un seul écart factuel relevé' });
    ecrire(c, 'FR-2026-0115');
  },

  // ------------------------------------------------------------------ Rezé : avertissement de 2018 = contexte ; procès en appel annoncé
  async 'FR-2026-0046'() {
    const c = charger('FR-2026-0046');
    const i = c.d.deroule.findIndex((e) => /avertissement en 2018/.test(e.texte));
    if (i < 0) throw new Error('0046 : étape « avertissement » absente');
    const e = c.d.deroule[i];
    await verifier(e.source.url, ['avait fait l’objet d’un avertissement en 2018', 'Il avait été muté dans une autre école']);
    const avant = e.texte;
    c.d.deroule[i] = { ...e, type: 'contexte', acteur: null, date: null, date_nature: 'article',
      texte: 'Selon La Nouvelle République, l\'animateur avait fait l\'objet d\'un avertissement en 2018 alors qu\'il travaillait dans une école maternelle d\'Ouche-Dinier, puis avait été muté dans une autre école, avant son interpellation en mars 2019.' };
    c.corrections.push({ operation: 'requalification', cible: avant, apres: c.d.deroule[i].texte, motif: 'Un avertissement de 2018 est antérieur à l’affaire jugée : contexte historique, pas une mesure prise par l’établissement après les faits. Retiré des « Mesures institutionnelles ».', origine: ORIGINE, preuves: [{ media: e.source.media, url: e.source.url, citation: 'avait fait l’objet d’un avertissement en 2018 … Il avait été muté dans une autre école' }] });
    ajouterSource(c, SRC.ICI_REZE, 'Source ajoutée à la relecture (vérification ciblée de l’actualité judiciaire) : ICI, 9 juin 2026.');
    await ajouterEtape(c, evt({ type: 'audience', acteur: 'cour d\'appel de Rennes', texte: 'Selon ICI, le procès en appel est programmé les 16, 17 et 18 novembre devant la cour d\'appel de Rennes, selon l\'avocat de la défense (information publiée le 9 juin 2026).', source: SRC.ICI_REZE }),
      ['Le procès est prévu les 16, 17 et 18 novembre devant la cour d\'appel de Rennes', 'fait savoir à ICI Loire Océan son avocat'], 'Vérification ciblée : date du procès en appel (la source n’écrit pas l’année ; la date de parution est affichée).');
    ligneSuite(c, 'Prochaine étape rapportée : le procès en appel est programmé les 16, 17 et 18 novembre devant la cour d\'appel de Rennes (selon ICI, 9 juin 2026).');
    ecrire(c, 'FR-2026-0046');
  },

  // ------------------------------------------------------------------ La Courneuve : réactions antérieures à la condamnation
  async 'POC-02'() {
    const c = charger('POC-02');
    retirerReactions(c, (r) => /le renvoi du procès/.test(r.a_propos), 'Réaction du 17 décembre 2025 sur le renvoi du procès (« regrette que le procès n’ait pas pu se tenir ») : dépassée, le procès a eu lieu et la condamnation a été rendue le 27 mars 2026.');
    const r = c.d.reactions.find((x) => /absence de signalement antérieur/.test(x.a_propos));
    if (!r) throw new Error('POC-02 : réaction attendue absente');
    const avant = r.qualite;
    r.qualite = 'propos rapportés par Le Parisien le 17 décembre 2025, avant le procès et la condamnation du 27 mars 2026 (contexte historique)';
    c.corrections.push({ operation: 'requalification_reaction', cible: `${r.acteur} — « ${r.citations[0].texte} »`, apres: r.qualite, motif: `Conservée pour sa valeur historique (position de la défense avant le procès), mais datée explicitement et non présentée comme réaction à la condamnation (était : « ${avant} »).`, origine: ORIGINE });
    ecrire(c, 'POC-02');
  },

  // ------------------------------------------------------------------ Saint-Martin-de-France : faits de 2001 ≠ mise en examen de 2024
  async 'FR-2026-0025'() {
    const c = charger('FR-2026-0025');
    const avant = c.d.situation.decision.meta;
    c.d.situation.decision.meta = 'Mise en examen le 14 février 2024 · pour des faits datant de 2001';
    c.corrections.push({ operation: 'metadonnee', cible: `situation.decision.meta = « ${avant} »`, apres: c.d.situation.decision.meta, motif: 'Le bloc ne datait que la mise en examen (14 février 2024) : il lisait comme si les faits dataient de 2024. Les faits (2001) sont maintenant énoncés à côté. Établissement : collège-lycée (déjà écrit ainsi dans la phrase de situation).', origine: ORIGINE,
      preuves: [{ media: 'France info', url: c.d.deroule.find((e) => e.type === 'mise_en_examen').source.url, citation: 'faits datant de 2001 commis dans le collège-lycée Saint-Martin de France' }] });
    await verifier(c.d.deroule.find((e) => e.type === 'mise_en_examen').source.url, ['faits datant de 2001']);
    ecrire(c, 'FR-2026-0025');
  },

  // ------------------------------------------------------------------ Chat Perché : matière lisible (France 3, Lyon Capitale, Médiacités), affaires distinctes séparées
  async 'FR-2026-0036'() {
    const c = charger('FR-2026-0036');
    for (const s of [SRC.F3_ARA, SRC.MEDIACITES]) ajouterSource(c, s, 'Source lisible ajoutée à la relecture : l’article du Progrès est inaccessible au pipeline (403) ; les mêmes informations sont relayées par ce média accessible.');
    // base : la mise à pied « annoncée » et « immédiate » étaient deux étapes pour un seul fait → une étape réalisée (France 3 + Lyon Capitale) et une annonce (non-réintégration)
    retirerEtapes(c, (e) => /mis à pied et, selon People & Baby, ne sera pas réintégré/.test(e.texte), 'Doublon avec la mise à pied immédiate : remplacé par deux étapes distinctes (mise à pied/suspension réalisée ; non-réintégration annoncée).');
    retirerEtapes(c, (e) => /a été immédiatement mis à pied\.$/.test(e.texte), 'Fusionnée dans l’étape de suspension (France 3 Régions, corroborée par Lyon Capitale).');
    await ajouterEtape(c, evt({ type: 'mesure_etablissement', acteur: 'People&Baby', texte: 'Selon France 3 Régions, après un nouvel incident survenu début juin à la crèche Chat Perché, une nouvelle procédure disciplinaire est engagée et le salarié est à nouveau suspendu ; selon Lyon Capitale, il a été immédiatement mis à pied.', source: SRC.F3_ARA, sources_complementaires: [SRC.LYON_CAPITALE] }),
      ['Or début juin, un nouvel incident survient.', 'Une nouvelle procédure disciplinaire est engagée et le salarié à nouveau suspendu.'], 'Mise en œuvre de la mesure : suspension / mise à pied et procédure disciplinaire (retour : « mise à pied et procédure disciplinaire »).');
    await verifier(U.LYON_CAPITALE, ['Immédiatement mis à pied']);
    await ajouterEtape(c, evt({ type: 'mesure_etablissement', acteur: 'groupe People & Baby', texte: 'Mesure annoncée, sans confirmation de sa réalisation dans les sources lues : selon Lyon Capitale, People & Baby a précisé que le salarié ne sera pas réintégré dans une crèche du groupe.', source: SRC.LYON_CAPITALE }),
      ['ne sera pas réintégré dans une crèche du groupe'], 'Non-réintégration annoncée (retour : mesures immédiates), distincte de la mise à pied.');
    await ajouterEtape(c, evt({ type: 'contexte', acteur: 'People&Baby', texte: 'Selon France 3 Régions, début avril, le salarié, mis en cause en février à la crèche Joyeuse Tribu, a été affecté à la crèche Chat Perché (Lyon 3e), avant les faits rapportés ici.', source: SRC.F3_ARA, sources_complementaires: [SRC.MEDIACITES] }),
      ['Début avril, le salarié est affecté dans une autre crèche lyonnaise du groupe, Chat Perché'], 'Signalement antérieur et lien entre les deux crèches (retour : contexte inter-affaires).');
    await ajouterEtape(c, evt({ type: 'fait_rapporte', acteur: 'People & Baby', texte: 'Selon Lyon Capitale, People & Baby assure qu\'aucune responsabilité seul avec un enfant n\'avait été donnée au salarié après sa reprise de fonction.', source: SRC.LYON_CAPITALE }),
      ['aucune responsabilité seul avec un enfant'], 'Mesures d’encadrement rapportées (retour : encadrement renforcé). Le détail « exclu des changes et de la sieste » n’est lisible dans aucune source accessible : non repris.');
    await ajouterEtape(c, evt({ type: 'mesure_etablissement', acteur: 'crèche Chat Perché', texte: 'Selon France 3 Régions, la crèche a organisé en urgence une réunion le 16 juin pour informer les parents.', source: SRC.F3_ARA }),
      ['Lors d’une réunion organisée en urgence par la crèche le 16 juin dernier, pour informer les parents'], 'Réaction de l’établissement auprès des familles.');
    await ajouterEtape(c, evt({ type: 'fait_rapporte', texte: 'Selon France 3 Régions, aucun des parents rencontrés par Médiacités n\'avait été informé des soupçons ayant conduit à la précédente mise à pied du salarié.', source: SRC.F3_ARA, sources_complementaires: [SRC.MEDIACITES] }),
      ['aucun des parents rencontrés par Médiacités n’avait été informé des soupçons ayant conduit à la précédente mise à pied du salarié'], 'Information des familles (contestée par le gestionnaire : voir la réaction attribuée).');
    // Contexte : l'affaire distincte de la crèche Joyeuse Tribu (Lyon 6e), séparée et étiquetée
    await ajouterEtape(c, evt({ type: 'contexte', acteur: null, texte: 'Affaire distincte (crèche Joyeuse Tribu, Lyon 6e, traitée dans une fiche séparée) : selon Lyon Capitale, le même salarié avait déjà été mis en cause en février alors qu\'il travaillait dans cette crèche, et une famille avait porté plainte.', source: SRC.LYON_CAPITALE, sources_complementaires: [SRC.F3_ARA] }),
      ['ce même salarié avait déjà été mis en cause alors qu\'il travaillait dans la crèche La Joyeuse Tribu (Lyon 6e)', 'Une famille avait porté plainte'], 'Lien documentaire avec Joyeuse Tribu, sans mélanger les affaires (étape de contexte étiquetée « affaire distincte »).');
    await ajouterEtape(c, evt({ type: 'contexte', acteur: 'direction du groupe People&Baby', texte: 'Affaire distincte (crèche Joyeuse Tribu) : selon France 3 Régions, la direction du groupe affirme avoir signalé les faits à la PMI et à la CRIP et indique que l\'enquête préliminaire confiée à la brigade des mineurs aurait été classée sans suite, faute d\'éléments constitutifs d\'une infraction (information de source unique : le gestionnaire).', source: SRC.F3_ARA, sources_complementaires: [SRC.LYON_CAPITALE] }),
      ['People&Baby affirme avoir signalé les faits à la Protection maternelle et infantile (PMI) et à la CRIP', 'aurait été classée sans suite faute'], 'Signalement antérieur, PMI / cellule départementale (CRIP) et enquête antérieure : attribués au gestionnaire, rattachés à l’affaire distincte.');
    // plainte annoncée : source complémentaire
    const plainte = c.d.deroule.find((e) => e.type === 'plainte');
    await verifier(U.F3_ARA, ['La direction, elle, annonce vouloir porter plainte contre le salarié']);
    plainte.sources_complementaires = [SRC.F3_ARA];
    c.corrections.push({ operation: 'source_complementaire', cible: plainte.texte, motif: 'Plainte annoncée du groupe contre le salarié : corroborée par France 3 Régions (« La direction annonce vouloir porter plainte »). Reste une annonce, non un dépôt.', origine: ORIGINE, preuves: [{ media: 'France 3 Régions', url: U.F3_ARA, citation: 'La direction, elle, annonce vouloir porter plainte contre le salarié' }] });
    // réactions du gestionnaire
    const REACTION = (a_propos, citation) => ({ acteur: 'People&Baby (groupe gestionnaire des crèches)', qualite: 'propos rapportés par France 3 Régions', a_propos, citations: [{ texte: citation, pour: a_propos }], source: SRC.F3_ARA });
    await ajouterReaction(c, REACTION('l\'affectation puis la reprise de fonction du salarié', 'l’enquête interne et l\'enquête de police aient débouché sur un classement sans suite, le salarié a été réintégré sous strict encadrement et dans des conditions sécurisées, après concertation avec les autorités compétentes'), 'Réactions du gestionnaire (retour). Le « classement sans suite » cité concerne l’affaire distincte de Joyeuse Tribu : il est attribué au gestionnaire.');
    await ajouterReaction(c, REACTION('l\'information des familles de la crèche', 'les familles de la crèche ont été informées de manière systématique et régulière'), 'Réaction du gestionnaire, à lire avec l’étape « aucun des parents rencontrés par Médiacités… ».');
    // l'état : la « plainte » du groupe est annoncée, pas déposée ; la carte « plainte » n'est pas étayée pour cet établissement
    c.d.situation.decision.titre = 'Plainte annoncée';
    c.corrections.push({ operation: 'metadonnee', cible: 'situation.decision.titre = « Plainte »', apres: 'Plainte annoncée', motif: 'Aucune plainte déposée n’est rapportée pour cet établissement (celle de la famille concerne Joyeuse Tribu ; celle du groupe est annoncée) : le bloc dit « annoncée » ; la carte « plainte » est à arbitrer par la Maintenance.', origine: ORIGINE });
    c.g.attention.unshift({ niveau: 'majeur', code: 'ETAT_CARTE_PLAINTE_NON_ETAYE', texte: 'La carte affiche « plainte » : les sources lues ne rapportent aucune plainte déposée pour la crèche Chat Perché (la plainte de la famille concerne Joyeuse Tribu ; celle du groupe contre le salarié est annoncée). État à arbitrer par la Maintenance, pas par la fiche.' });
    ordonner(c, [/accusations de comportements inappropriés/, /un signalement a été fait/, /Protection maternelle et infantile/, /nouvelle procédure disciplinaire/, /ne sera pas réintégré/, /devrait déposer plainte/, /réunion le 16 juin/, /aucun des parents rencontrés/, /aucune responsabilité seul/, /début avril/, /Lyon Capitale, le même salarié/, /direction du groupe affirme/]);
    ecrire(c, 'FR-2026-0036', { qualification: 'A_REVOIR' });
  },

  // ------------------------------------------------------------------ Vic-la-Gardiole : hiérarchiser, actualiser
  async 'FR-2026-0027'() {
    const c = charger('FR-2026-0027');
    ajouterSource(c, SRC.ML_2026, 'Source ajoutée à la relecture (recherche d’une évolution judiciaire récente) : Midi Libre, 9 septembre 2026.');
    const est = (re) => (e) => re.test(e.texte);
    retirerEtapes(c, est(/^Selon Midi Libre, .{0,5}employée .{0,60}écrouée à la prison de Nîmes\.$/), 'Doublon de l’écrou du 29 juillet (étape « décision » plus complète).');
    retirerEtapes(c, est(/rectorat annonce le remplacement de toute l'équipe pédagogique/), 'Doublon : le remplacement de l’équipe est retenu à sa date (fin août 2025, « a décidé »).');
    retirerEtapes(c, est(/le bureau du procureur a précisé les faits visés dans un communiqué/), 'Étape sans contenu : un communiqué sans ce qu’il dit.');
    retirerEtapes(c, est(/rentrée scolaire du lundi 1er septembre/), 'Étape secondaire : la rentrée n’établit aucun fait de l’affaire.');
    retirerEtapes(c, est(/France Victimes/), 'Étape secondaire : propos d’un gendarme sur place, non datés.');
    retirerEtapes(c, est(/placée en détention provisoire à la maison d'arrêt de Nîmes \(Gard\) depuis fin juillet/), 'Doublon de l’écrou du 29 juillet.');
    retirerEtapes(c, est(/placée en détention provisoire après sa mise en examen/), 'Doublon de la mise en examen et de l’écrou.');
    retirerEtapes(c, est(/a été remise en liberté en attendant les conclusions de l'enquête/), 'Doublon de la décision du 14 août 2025 (cour d’appel).');
    retirerEtapes(c, est(/de nombreuses plaintes pour viols et agressions sexuelles aggravées ont été déposées/), 'Étape vague, non datée ; la suite de l’instruction est désormais documentée (Midi Libre, 9 septembre 2026).');
    // faits importants à conserver ou à rétablir
    const GAV = { type: 'garde_a_vue', date: '2025-07-28', date_nature: 'evenement', acteur: null, texte: 'Selon Ladepeche.fr, l\'enquête s\'est poursuivie « en toute discrétion », conduisant à une nouvelle garde à vue le 28 juillet.', source: { media: 'Ladepeche.fr', url: c.g.sources.find((s) => s.media === 'Ladepeche.fr').url, publie_le: '2025-08-01', acces: 'libre' } };
    await ajouterEtape(c, GAV, ['conduisant à une nouvelle garde à vue le 28 juillet', 'placée une première fois en garde à vue le 4 juillet'], 'Deux gardes à vue distinctes (4 et 28 juillet) : la « divergence de dates » signalée était un faux signal.');
    c.d.inconnues = c.d.inconnues.filter((x) => !/Divergence entre sources — (garde à vue|mise en examen)/.test(x));
    await ajouterEtape(c, evt({ type: 'audience', date: '2026-01', date_nature: 'approximative', acteur: 'parquet de Montpellier', texte: 'Selon Midi Libre, en janvier 2026, dans un réquisitoire supplétif, le parquet de Montpellier a identifié de nouvelles victimes potentielles.', source: SRC.ML_2026 }),
      ['en janvier 2026, dans un réquisitoire supplétif, le parquet de Montpellier a identifié'], 'Évolution judiciaire récente (le nombre exact d’enfants n’est pas repris).');
    await ajouterEtape(c, evt({ type: 'enquete', acteur: 'juge d\'instruction', texte: 'Selon Midi Libre, à la date de l\'article (9 septembre 2026), la mise en cause, placée sous contrôle judiciaire depuis le 14 août 2025, n\'avait pas encore été entendue par le juge d\'instruction au sujet de ces nouvelles victimes potentielles, en vue ou non de nouvelles mises en examen.', source: SRC.ML_2026 }),
      ['toujours pas été entendue par le juge instructeur en vue ou non de nouvelles mises en examen', 'remise en liberté sous contrôle judiciaire le 14 août 2025'], 'Dernier état rapporté de l’instruction.');
    await ajouterEtape(c, evt({ type: 'enquete', acteur: 'juge d\'instruction', texte: 'Selon Midi Libre, les expertises psychologiques des enfants concernés ont été rendues au fil de l\'année, les dernières récemment, à l\'été.', source: SRC.ML_2026 }),
      ['elles ont été rendues au fil de l\'année et les dernières tout récemment cet été'], 'Délai de l’instruction expliqué par les expertises (information du journal ; les appréciations d’un « proche du dossier » anonyme ne sont pas reprises).');
    // réactions : retirer le moins informatif, ajouter l'équilibre défense / parties civiles à jour
    retirerReactions(c, (r) => r.acteur === 'mairie de Vic-la-Gardiole', 'Absence de réponse de la mairie : aucune information sur l’affaire.');
    retirerReactions(c, (r) => /Ce dossier vient à peine de commencer/.test(r.citations[0].texte), 'Propos du 12 août 2025 sans contenu factuel, dépassé par la suite de la procédure.');
    const R = (acteur, a_propos, texte) => ({ acteur, qualite: 'propos rapportés par Midi Libre', a_propos, citations: [{ texte, pour: a_propos }], source: SRC.ML_2026 });
    await ajouterReaction(c, R('Me Rémi Bertrand, avocat de la défense', 'l\'absence de nouvelle convocation de la mise en cause', 'Elle n\'a toujours pas été convoquée pour un deuxième interrogatoire'), 'Position actuelle de la défense (Midi Libre, 9 septembre 2026).');
    await ajouterReaction(c, R('Me Florian Medico, avocat de parties civiles', 'les délais de la procédure', 'Mes clients font preuve de patience et de confiance en l\'institution judiciaire malgré les délais qui leur sont difficilement supportables'), 'Position actuelle des parties civiles (Midi Libre, 9 septembre 2026).');
    // état : remise en liberté
    const lib = liberationPosterieure(c.d.etat_actuel[0], c.d.deroule);
    if (!lib) throw new Error('0027 : libération absente');
    c.d.etat_actuel.push(`Évolution rapportée : ${lib.texte}`);
    c.d.synthese = { ...c.d.synthese, ouvert: c.d.etat_actuel[1] };
    ligneSuite(c, `Évolution rapportée : ${lib.texte}`);
    c.d.situation.suite.lignes.unshift(c.d.situation.suite.lignes.pop());
    c.corrections.push({ operation: 'ligne_etat', cible: c.d.etat_actuel[0], apres: c.d.etat_actuel[1], motif: 'La phrase d’état disait « placée en détention provisoire » alors que la cour d’appel a ordonné la remise en liberté sous contrôle judiciaire le 14 août 2025.', origine: ORIGINE });
    ecrire(c, 'FR-2026-0027');
  },
};

const demandees = process.argv.slice(2);
for (const [id, f] of Object.entries(CORRECTIONS)) if (!demandees.length || demandees.includes(id)) await f();
void pathToFileURL;
