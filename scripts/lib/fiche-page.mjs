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

const DATA = new URL('../../data/', import.meta.url);
const lire = (f) => JSON.parse(readFileSync(new URL(f, DATA), 'utf8'));
export const MEDIAS_PAYANTS = ['Mediapart', 'Libération'];

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

const urlsDe = (d) => {
  const vus = new Map();
  const ajoute = (s) => { if (s?.url && !MEDIAS_PAYANTS.includes(s.media) && !vus.has(s.url)) vus.set(s.url, { url: s.url, media: s.media, d: s.publie_le ?? null }); };
  for (const e of d.deroule || []) ajoute(e.source);
  for (const r of [...(d.reactions || []), ...(d.paroles || [])]) ajoute(r.source);
  return [...vus.values()];
};

/**
 * Payload de la proposition (new_case_proposals.payload). Tout est DÉRIVÉ des données : rien n'est saisi à la main.
 * @param {{c:object, dossier:{hub:string|null,d:object,verifie_le:string}, sourcesNeon:string[], nbEvenements:number, previewBase:string, hubTitre?:string}} o
 */
export function payloadFiche({ c, dossier, sourcesNeon, nbEvenements, previewBase, hubTitre = null, generation = null }) {
  const d = dossier.d;
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
  const diff = [`+ page /affaires/${c.case_id.toLowerCase()}`, 'Home : la carte de l’affaire ne change pas ; un bouton « Fiche → » est ajouté'];
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
      preview_url: previewBase ? `${previewBase}/brouillons/revue/${c.case_id.toLowerCase()}/` : null,
      diff_public: diff, verifie_le: dossier.verifie_le,
      // Présent seulement pour une fiche PRODUITE par le circuit de génération : l'humain approuve en sachant qu'elle est automatique.
      ...(generation ? { generation: resumeGeneration(generation) } : {}),
    },
  };
}

export const cleDedupFiche = (case_id) => `fiche|${case_id}`;

/** La fiche est publique si la dernière approbation d'Adrien porte l'empreinte du dossier ACTUEL. Les événements Neon ne font pas partie de l'empreinte : un UPDATE validé ne retire jamais une fiche. */
export function empreinteApprouvee(revues, id, dossier) {
  const h = ficheApprouvee(revues, id);
  return h && dossier && hashDossier(dossier.d) === h ? h : null;
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
    attention: g.attention.filter((a) => a.niveau !== 'mineur').concat(g.attention.filter((a) => a.niveau === 'mineur')).slice(0, 6).map((a) => ({ niveau: a.niveau, texte: a.texte.slice(0, 240) })),
  };
}
