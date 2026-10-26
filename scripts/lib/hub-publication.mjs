// =====================================================================
// scripts/lib/hub-publication.mjs — du dossier de revue d'un Hub à sa page publique, sans qu'un agent touche au code. Fonctions PURES.
//
//   PRÉPARER (clic)  → preparer-hub : dossier de revue (hub-brouillon) + MATIÈRE composée (ce module) data/hub-matiere/<slug>.json
//   PUBLIER (clic)   → new_case_proposals { hub_publication: {slug, hash} } ACCEPT = GO éditorial de CETTE matière (empreinte)
//   projection       → project-evenements : `hubs_approuves` dans data/evenements.json — SEULEMENT si l'empreinte de la matière COURANTE est approuvée
//   front            → /territoires/<slug>/ généré pour tout Hub approuvé (gabarit commun), vérifié par verifier-site, confirmé sur Telegram
//
// Le même schéma que les fiches individuelles : approbation = empreinte du contenu (échec fermé : matière modifiée ⇒ plus publique tant qu'elle n'est
// pas ré-approuvée). La matière est COMPOSÉE, jamais rédigée : affaires publiques non gelées, événements validés avec leur source, ce que l'on sait et ce
// que l'on ne sait pas. Ce qui ne peut pas être composé de façon fiable (dossier détaillé d'une affaire) est DIT dans la page, jamais inventé.
// =====================================================================
import { empreinte, slugTerritoire, urlBrouillon, MEDIAS_PAYANTS } from './hub-brouillon.mjs';

export const CHEMIN_MATIERE = (slug) => `data/hub-matiere/${slug}.json`;
// Titres de blocs : ils doivent rester reconnus par destinations.mjs (BLOC) pour que les informations validées ultérieures s'y projettent sans blocage.
export const GROUPE_INSTITUTIONS = 'Collectivités et institutions';
export const GROUPE_FAMILLES = 'Familles et associations';
export const hashMatiere = (m) => empreinte(m);

const jj = (d) => String(d || '').slice(0, 10);

/**
 * Matière d'un Hub composée depuis les données validées (même forme que data/hub-matiere/landes.json).
 * @param {{slug:string, titre:string, departement:string}} territoire
 * @param {object[]} cases  affaires PUBLIQUES du territoire (artefact public)
 * @param {object[]} evenements  événements validés {case_id, type, date, libelle, realisation, source}
 * @param {Set<string>} holds  affaires gelées : jamais intégrées (leur existence n'est pas détaillée)
 * @param {Set<string>} dossiersExistants  affaires dont un dossier éditorial existe déjà ailleurs (lu par le gabarit, jamais recopié)
 */
export function composerMatiereHub({ territoire, cases, evenements = [], holds = new Set(), dossiersExistants = new Set(), genere_le }) {
  if (slugTerritoire(territoire?.slug) !== territoire?.slug || !territoire.slug) throw new Error('territoire : identifiant invalide');
  const retenues = cases.filter((c) => !holds.has(c.case_id));
  if (!retenues.length) throw new Error('aucune affaire publique non gelée dans ce territoire : rien à composer');
  const nGelees = cases.length - retenues.length;
  const ids = retenues.map((c) => c.case_id);
  const parId = new Map(retenues.map((c) => [c.case_id, c]));
  const communes = [...new Set(retenues.map((c) => c.commune))];
  const statuts = {};
  for (const c of retenues) statuts[c.statut_judiciaire] = (statuts[c.statut_judiciaire] || 0) + 1;
  const evs = evenements.filter((e) => parId.has(e.case_id) && e.libelle && !(e.source && MEDIAS_PAYANTS.includes(e.source.media)));
  const carte = (e) => ({ date: e.date || null, date_nature: e.date ? 'evenement' : 'inconnue', acteur: parId.get(e.case_id).commune, texte: e.libelle,
    source: e.source?.url ? { media: e.source.media, url: e.source.url, publie_le: jj(e.source.publication_date) || null, acces: 'libre' } : null });
  const manquants = ids.filter((id) => !dossiersExistants.has(id));
  const n = retenues.length;
  return {
    _meta: {
      hub_id: territoire.slug, titre: territoire.titre, perimetre: { departement: territoire.departement }, genere_auto: true, redige_le: genere_le,
      statut: 'matière COMPOSÉE automatiquement : publiable seulement après le GO « PUBLIER LE HUB » portant sur son empreinte.',
      methode: 'composée sans rédaction depuis les affaires publiques non gelées (data/cases.json) et les événements validés (Neon) ; aucune phrase n’est écrite à la main ; ce qui manque est dit dans « Limites ».',
    },
    reperes: {
      titre: `${territoire.titre} : ${n} affaire${n > 1 ? 's' : ''} rapportée${n > 1 ? 's' : ''} par la presse`,
      chapeau: `${n} affaire${n > 1 ? 's' : ''} publique${n > 1 ? 's' : ''} dans ${communes.length} commune${communes.length > 1 ? 's' : ''} (${communes.join(', ')}) : ${Object.entries(statuts).map(([k, v]) => `${v} × ${k}`).join(' · ')}. Rien, dans les sources lues, ne relie ces affaires ; elles ne sont réunies ici que par le territoire. Les personnes mises en cause bénéficient de la présomption d’innocence.`,
      limite: `Page composée automatiquement depuis les fiches publiques et les événements validés, sans rédaction éditoriale${manquants.length ? ` : le déroulé détaillé n’est repris que pour ${n - manquants.length} affaire(s) sur ${n}` : ''}. Les informations non validées ne figurent pas ici.`,
    },
    ordre: ids,
    dossiers: {},
    reponses: [
      { titre: GROUPE_INSTITUTIONS, items: evs.filter((e) => ['suspension', 'réponse_institutionnelle'].includes(e.type)).map(carte) },
      { titre: GROUPE_FAMILLES, items: evs.filter((e) => e.type === 'mobilisation').map(carte) },
    ],
    recherches: [
      { question: 'Dossier éditorial détaillé (déroulé daté et sourcé)', resultat: manquants.length ? `absent pour ${manquants.length} affaire(s) sur ${n} (${manquants.join(', ')}) : seuls l’état, les sources et les événements validés sont affichés` : `disponible pour les ${n} affaires` },
      { question: 'Réponses institutionnelles et mobilisations validées', resultat: evs.filter((e) => ['suspension', 'réponse_institutionnelle', 'mobilisation'].includes(e.type)).length ? `${evs.filter((e) => ['suspension', 'réponse_institutionnelle', 'mobilisation'].includes(e.type)).length} dans la mémoire, affichée(s) ci-dessus` : 'aucune dans la mémoire à ce jour' },
      ...(nGelees ? [{ question: 'Affaires du territoire en revue éditoriale', resultat: `${nGelees} non intégrée(s) à cette page` }] : []),
    ],
  };
}

/** Proposition « PUBLIER LE HUB » (new_case_proposals.payload) : une par (Hub, empreinte de la matière) ; un rejeu ne crée rien. */
export function payloadPublication({ slug, titre, hash, ids }) {
  return {
    payload: { version: 'proposition-hub-publication-1', commune: titre, etablissement: null,
      hub_publication: { slug, titre, hash, publiques: [...ids].sort(), apercu: urlBrouillon(slug), page: `/territoires/${slug}/` } },
    cle: `hubpub|${slug}|${hash}`,
  };
}

/**
 * Hubs APPROUVÉS pour publication : l'empreinte de la matière COURANTE doit avoir reçu un GO (ACCEPT). Matière modifiée depuis ⇒ non publique.
 * Seuls les Hubs composés automatiquement (`_meta.genere_auto`) passent par ici : les Hubs rédigés à la main ont leur propre page.
 * @param {{slug:string, hash:string}[]} decisions  propositions de publication ACCEPT
 * @param {Record<string, object|null>} matieres  matière courante par slug
 * @returns {Record<string, {hash:string, titre:string}>}
 */
export function hubsApprouves(decisions, matieres) {
  const out = {};
  for (const d of decisions) {
    const m = matieres[d.slug];
    if (!m?._meta?.genere_auto || m._meta.hub_id !== d.slug) continue;
    if (hashMatiere(m) === d.hash) out[d.slug] = { hash: d.hash, titre: m._meta.titre };
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
