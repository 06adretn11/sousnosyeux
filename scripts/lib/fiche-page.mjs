// =====================================================================
// scripts/lib/fiche-page.mjs — la fiche individuelle d'une affaire PUBLIQUE : matière, empreinte, payload de la proposition « APPROUVER LA FICHE ».
//
// Une seule mémoire : la matière éditoriale est le dossier de data/hub-matiere/*.json (hub ou `isoles`), les événements validés viennent
// de Neon (data/evenements.json). L'approbation porte sur l'EMPREINTE du dossier : si le dossier change après l'approbation, la page
// cesse d'être publiable jusqu'à une nouvelle approbation (échec fermé). Les événements Neon ajoutés ensuite, eux, sont déjà couverts :
// c'est une mise à jour dans le périmètre approuvé.
// Fonctions pures (testées sans base ni réseau) ; seule la lecture des fichiers de données touche le disque.
// =====================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { comparerEtapes, comparerReactions, refsEtape } from './fiche-acquis.mjs';

const DATA = new URL('../../data/', import.meta.url);
const lire = (f) => JSON.parse(readFileSync(new URL(f, DATA), 'utf8'));
export const MEDIAS_PAYANTS = ['Mediapart', 'Libération'];
export const REVUE_GENEREE_BASE = 'https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees';

/** Dossier éditorial d'une affaire : celui de son hub, sinon celui des affaires isolées. */
export function dossierFiche(id) {
  for (const f of readdirSync(new URL('hub-matiere/', DATA)).filter((x) => x.endsWith('.json'))) {
    const m = lire(`hub-matiere/${f}`);
    if (m.dossiers?.[id]) return { hub: f === 'isoles.json' ? null : f.replace('.json', ''), d: m.dossiers[id], verifie_le: m.dossiers[id].verifie_le ?? m._meta?.redige_le };
  }
  return null;
}

/** Empreinte stable (clés triées) d'un dossier : 16 premiers caractères du sha256. */
export function hashDossier(d) {
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  return createHash('sha256').update(JSON.stringify(canon(d))).digest('hex').slice(0, 16);
}

/** Revue d'approbation : « [Fiche approuvée 1a2b3c4d] FR-2026-0042 hash=<16 hex> » — dernière par affaire. */
export const REVUE_FICHE = /^\[Fiche approuvée [0-9a-f]{8}\] (\S+) hash=([0-9a-f]{16})/;
export function ficheApprouvee(revues, id) {
  const r = (revues || []).filter((x) => /^Adrien/.test(x.reviewed_by || '') && x.decision === 'validé' && REVUE_FICHE.test(x.comment || '') && REVUE_FICHE.exec(x.comment)[1] === id).pop();
  return r ? REVUE_FICHE.exec(r.comment)[2] : null;
}

/** TOUTES les empreintes que la revue d'Adrien a approuvées pour cette affaire (une approbation plus récente n'en révoque aucune). */
export function empreintesApprouvees(revues, id) {
  return [...new Set((revues || []).filter((x) => /^Adrien/.test(x.reviewed_by || '') && x.decision === 'validé' && REVUE_FICHE.test(x.comment || '') && REVUE_FICHE.exec(x.comment)[1] === id).map((x) => REVUE_FICHE.exec(x.comment)[2]))];
}

export const urlsDe = (d) => {
  const vus = new Map();
  const ajoute = (s) => { if (s?.url && !MEDIAS_PAYANTS.includes(s.media) && !vus.has(s.url)) vus.set(s.url, { url: s.url, media: s.media, d: s.publie_le ?? null }); };
  // Les références COMPLÉMENTAIRES d'une étape sont des sources de la fiche au même titre que la principale : une source devenue secondaire n'est pas une source retirée.
  for (const e of d.deroule || []) { ajoute(e.source); for (const s of e.sources_complementaires || []) ajoute(s); }
  for (const r of [...(d.reactions || []), ...(d.paroles || [])]) ajoute(r.source);
  return [...vus.values()];
};

/**
 * Ce que change une VERSION CANDIDATE par rapport à la dernière version publique. Une étape est un FAIT (comparerEtapes : même type de fait, dates
 * compatibles, texte proche ou acte procédural du même jour — jamais « même source, même date » seul), pas un triplet (source, type, date) :
 *   · même fait, formulation ou source principale différente  → « reformulée » (jamais un ajout ET un retrait) ; une source devenue secondaire est « conservée » ;
 *   · contenu déjà porté par une étape existante               → une RÉFÉRENCE de plus, pas un fait nouveau ;
 *   · fait absent de l'autre côté                              → ajouté / retiré (les retraits sont listés au même titre que les ajouts) ;
 *   · deux étapes ressemblant à plusieurs : AMBIGU, ni ajout ni retrait.
 */
export function changementsFiche(precedent, nouveau) {
  const A = precedent?.deroule || [], C = nouveau?.deroule || [];
  const cmp = comparerEtapes(A, C);
  const vue = (e) => ({ texte: e.texte, media: e.source?.media ?? null, url: e.source?.url ?? null, date: e.date ?? null, publie_le: e.source?.publie_le ?? null });
  const ajoutees = cmp.ajoutees.map((j) => vue(C[j])), retirees = cmp.retirees.map((i) => vue(A[i]));
  const reformulees = cmp.paires.filter((p) => A[p.i].texte !== C[p.j].texte).length;
  const devenues_secondaires = cmp.paires.filter((p) => A[p.i].source?.url !== C[p.j].source?.url && refsEtape(C[p.j]).some((r) => r.url === A[p.i].source?.url)).map((p) => ({ media: A[p.i].source?.media ?? null, url: A[p.i].source?.url }));
  const up = new Set(urlsDe(precedent || {}).map((s) => s.url)), un = new Set(urlsDe(nouveau || {}).map((s) => s.url));
  const sources_nouvelles = urlsDe(nouveau || {}).filter((s) => !up.has(s.url)), sources_retirees = urlsDe(precedent || {}).filter((s) => !un.has(s.url));
  const rx = comparerReactions(precedent?.reactions || [], nouveau?.reactions || []);
  const etat_change = JSON.stringify(precedent?.situation ?? null) !== JSON.stringify(nouveau?.situation ?? null) || JSON.stringify(precedent?.etat_actuel ?? null) !== JSON.stringify(nouveau?.etat_actuel ?? null);
  return { ajoutees, retirees, reformulees, devenues_secondaires, sources_nouvelles, sources_retirees,
    ambigus: cmp.ambigus.map((x) => ({ avant: vue(A[x.i]), apres: vue(C[x.j]) })),
    reactions_ajoutees: rx.ajoutees.length, reactions_retirees: rx.retirees.length, etat_change,
    inconnues_changees: JSON.stringify(precedent?.inconnues || []) !== JSON.stringify(nouveau?.inconnues || []),
    // Seule une MATIÈRE nouvelle ou perdue justifie une décision : un changement de disponibilité technique (source relue ou non, reformulation équivalente) n'en est pas un.
    substantiel: !!(ajoutees.length || retirees.length || sources_nouvelles.length || sources_retirees.length || rx.ajoutees.length || rx.retirees.length || etat_change || cmp.ambigus.length) };
}

/**
 * Payload de la proposition (new_case_proposals.payload). Tout est DÉRIVÉ des données : rien n'est saisi à la main.
 * @param {{c:object, dossier:{hub:string|null,d:object,verifie_le:string}, sourcesNeon:string[], nbEvenements:number, previewBase:string, hubTitre?:string}} o
 */
export function payloadFiche({ c, dossier, sourcesNeon, nbEvenements, previewBase, hubTitre = null, generation = null, precedent = null }) {
  const d = dossier.d;
  const ch = precedent ? changementsFiche(precedent.d, d) : null;
  const directes = urlsDe(d);
  const connues = new Set(sourcesNeon);
  const aRattacher = directes.filter((s) => !connues.has(s.url));
  const reactions = [...(d.reactions || []), ...(d.paroles || [])].filter((r) => (r.portee ?? 'affaire') === 'affaire');
  const nouveautes = [
    d.faits ? 'faits tels que rapportés (sans nom, sans nombre d’enfants)' : null,
    `déroulé de ${(d.deroule || []).length} étape(s) daté(s) et sourcé(s)${dossier.hub ? ' (même rédaction que le Hub)' : ''}`,
    reactions.length ? `${reactions.length} réaction(s) directement liée(s), attribuée(s)` : null,
    (d.inconnues || []).length ? `${d.inconnues.length} inconnue(s)` : null,
  ].filter(Boolean);
  const diff = ch
    ? [`Page /affaires/${c.case_id.toLowerCase()} : MISE À JOUR (la page existe déjà ; la version publique reste en ligne tant que celle-ci n’est pas approuvée)`]
    : [`+ page /affaires/${c.case_id.toLowerCase()}`, 'Home : la carte de l’affaire ne change pas ; un bouton « Fiche → » est ajouté'];
  if (dossier.hub) diff.push(Array.isArray(d.apercu_types)
    ? `Hub ${hubTitre ?? dossier.hub} : bloc de l’affaire réduit à un aperçu + lien « Consulter le dossier complet »`
    : `Hub ${hubTitre ?? dossier.hub} : inchangé`);
  if (aRattacher.length) diff.push(`+ ${aRattacher.length} source(s) rattachée(s) à l’affaire dans la mémoire`);
  return {
    version: 'proposition-fiche-1',
    commune: c.commune, etablissement: c.etablissement,
    page: {
      case_id: c.case_id, hash: hashDossier(d), hub: dossier.hub,
      statut_judiciaire: d.statut_libelle ?? c.etat?.statut ?? c.statut_judiciaire,
      resume: (d.etat_actuel || []).slice(0, 2),
      nouveautes, sources_directes: directes.slice(0, 6), sources_a_rattacher: aRattacher,
      inconnues: (d.inconnues || []).slice(0, 4), nb_evenements_neon: nbEvenements,
      // Sans base d’aperçu accessible depuis Telegram (jamais localhost), pas d’URL : l’aperçu est joint au message sous forme de captures.
      // Fiche générée : pas de page d'aperçu (le dossier n'est pas encore dans data/hub-matiere) ; la lecture se fait sur le rendu Markdown du dépôt, qui porte la même empreinte.
      // Le lien porte l'EMPREINTE dans son nom (`versions/<ID>-<empreinte>.md`) : il désigne la version exacte soumise, même quand une version suivante remplace `<ID>.md` sur main.
      preview_url: previewBase ? `${previewBase}/brouillons/revue/${c.case_id.toLowerCase()}/` : generation ? `${REVUE_GENEREE_BASE}/versions/${c.case_id}-${hashDossier(d)}.md` : null,
      diff_public: diff, verifie_le: dossier.verifie_le,
      // Mise à jour d'une page déjà publiée : ce qui change réellement depuis la dernière version publique (jamais tout l'historique comme nouveau).
      // Les retraits portent leur MOTIF (ceux que la fusion avec la version approuvée a écartés pour une cause établie) ; un retrait sans motif est dit tel quel.
      ...(ch ? { mise_a_jour: {
        precedent_hash: hashDossier(precedent.d), ajoutees: ch.ajoutees.slice(0, 6),
        // Retraits = ce que la comparaison des deux versions ne retrouve pas + les retraits MOTIVÉS de la fusion (étape ou position écartée par une garde : elle n'est plus dans la version, donc invisible au diff).
        retirees: [...ch.retirees.map((e) => ({ ...e, motif: generation?.acquis?.retirees?.find((r) => String(r.texte).slice(0, 120) === String(e.texte).slice(0, 120))?.motif ?? null })),
          ...(generation?.acquis?.retirees || []).filter((r) => !ch.retirees.some((e) => String(e.texte).slice(0, 120) === String(r.texte).slice(0, 120))).map((r) => ({ texte: r.texte, media: r.media ?? null, url: null, date: null, publie_le: null, motif: r.motif }))].slice(0, 6),
        reformulees: ch.reformulees, devenues_secondaires: ch.devenues_secondaires.slice(0, 4), sources_nouvelles: ch.sources_nouvelles.slice(0, 4), sources_retirees: ch.sources_retirees.slice(0, 4),
        reactions_ajoutees: ch.reactions_ajoutees, reactions_retirees: ch.reactions_retirees, etat_change: ch.etat_change,
        references_ajoutees: (generation?.acquis?.references_ajoutees || []).slice(0, 6), conservees: generation?.acquis?.conservees?.length ?? 0, non_relues: (generation?.acquis?.non_relues || []).slice(0, 6),
        // Effet CONCRET d'une approbation : la fiche d'un Hub n'est pas promue automatiquement (le Hub se modifie par `appliquer-hubs`, empreinte exacte) ; une fiche isolée l'est (promouvoir-fiche).
        effet: precedent.hub
          ? { pages: [`Hub « ${hubTitre ?? precedent.hub} » : le dossier de cette affaire y est rédigé`], precision: 'Approuver enregistre votre GO mais ne modifie AUCUNE page automatiquement : un dossier de Hub ne s’applique que par la procédure dédiée (appliquer-hubs).' }
          : { pages: [`page /affaires/${c.case_id.toLowerCase()}/ : la version approuvée est remplacée par celle-ci`, 'carte, Hubs, autres fiches : inchangés'], precision: 'Après votre GO : projection, QA, déploiement, puis vérification du site servi.' } } } : {}),
      // Dossier candidat (public par nature : c'est ce qui sera publié, sans extraits) : permet la promotion après le clic sans la copie locale du générateur.
      ...(generation ? { dossier: d } : {}),
      // Présent seulement pour une fiche PRODUITE par le circuit de génération : l'humain approuve en sachant qu'elle est automatique.
      ...(generation ? { generation: resumeGeneration(generation) } : {}),
    },
  };
}

export const cleDedupFiche = (case_id) => `fiche|${case_id}`;

/**
 * La fiche est publique si le dossier ACTUEL a été approuvé par Adrien — une approbation, pas forcément la dernière : approuver une V2 n'ôte pas à
 * la V1 en ligne le droit d'être servie tant que la V2 n'est pas dans le dossier (sinon la page tombe en 404 entre l'approbation et la promotion).
 * Un dossier modifié SANS approbation reste NON public (échec fermé). Les événements Neon ne font pas partie de l'empreinte : un UPDATE validé ne retire jamais une fiche.
 * Retrait : HOLD et affaire retirée (hors de l'artefact public) gardent leur priorité, ailleurs dans la chaîne.
 */
export function empreinteApprouvee(revues, id, dossier) {
  const h = dossier ? hashDossier(dossier.d) : null;
  return h && empreintesApprouvees(revues, id).includes(h) ? h : null;
}

/**
 * Dossier PRODUIT par le circuit de génération (scripts/generer-fiche.mjs), pas encore dans data/hub-matiere : même forme que `dossierFiche`,
 * plus la qualification. Source : data/fiches-generees/<ID>.json (ignoré par Git). Une fiche BLOQUÉE ou sans enrichissement n'est jamais proposée.
 */
export function dossierGeneree(id, dossiersDir = new URL('fiches-generees/', DATA)) {
  let f;
  try { f = JSON.parse(readFileSync(new URL(`${id}.json`, dossiersDir), 'utf8')); } catch { return null; }
  if (f.version !== 'fiche-generee-1' || f.case_id !== id) return null;
  return { hub: null, d: f.dossier, verifie_le: f.generation.genere_le, generation: f.generation, proposable: ['READY', 'A_REVOIR'].includes(f.generation.qualification) };
}

/** Résumé de génération porté par la proposition : qualification, points d'attention, mesures — ce que l'humain doit savoir avant d'approuver. */
export function resumeGeneration(g) {
  return {
    qualification: g.qualification, contrat: g.contrat, modele: g.modele,
    sources_lues: g.sources.filter((s) => s.acces === 'libre' && s.pertinence === 'CETTE_AFFAIRE').length, sources_total: g.sources.length,
    elements_ecartes: g.ecartes.length,
    ...(g.acquis ? { acquis: { conservees: g.acquis.conservees.length, references_ajoutees: g.acquis.references_ajoutees.length, retirees: g.acquis.retirees.length, non_relues: g.acquis.non_relues.length, inchange: g.acquis.inchange } } : {}),
    attention: g.attention.filter((a) => a.niveau !== 'mineur').concat(g.attention.filter((a) => a.niveau === 'mineur')).slice(0, 6).map((a) => ({ niveau: a.niveau, texte: a.texte.slice(0, 240) })),
  };
}
