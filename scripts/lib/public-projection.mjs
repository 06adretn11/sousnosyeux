// =====================================================================
// scripts/lib/public-projection.mjs
//
// Autorité unique de la projection publique.
// Tout artefact destiné au dépôt public, au build ou au navigateur passe
// par ici. Aucun `select=*` sur le chemin public.
//
// Référence : docs/industrialisation/DATA_CONTRACT_V0.md §9
// =====================================================================

/** Liste blanche — colonnes d'une affaire exposables publiquement. */
export const PUBLIC_CASE_FIELDS = Object.freeze([
  'case_id',
  'etablissement',
  'commune',
  'departement',
  'type_structure',
  'role_mis_en_cause',
  'type_affaire',
  'statut_judiciaire',
  'statut_des_faits',
  'enfants_concernes_public',
  'lat',
  'lng',
  // Avertissement de précision affiché à l'utilisateur (« localisation
  // approximative »). Public et légitime, mais la colonne n'existe pas
  // encore en base : l'avertissement est aujourd'hui inerte.
  'geocode_source',
  'verified_at',
  // Synthèse d'état — CONTRAT HOME.
  //
  // Bloc DÉRIVÉ, jamais saisi : il se reconstitue entièrement depuis
  // `case_events` (l'événement validé), la proposition acceptée qui l'a
  // produit (`state_proposals` via `applied_event_id`) et le registre
  // `articles`. Aucune colonne n'a été ajoutée à Neon pour l'obtenir.
  //
  // Il n'existe que pour les affaires portant au moins un événement
  // validé. Les autres gardent exactement le rendu actuel.
  'etat',
  // Établissements concernés quand une affaire en touche plusieurs
  // (`case_establishments`). Omis pour les affaires mono-établissement :
  // l'absence signifie « `etablissement` fait foi ».
  'etablissements',
]);

/** Liste blanche — sous-champs du bloc `etat`. */
export const PUBLIC_ETAT_FIELDS = Object.freeze([
  'statut',
  'date',
  'type_evenement',
  'finalite',
  'suites',
  'sources',
]);

/** Liste blanche — colonnes d'une source exposables publiquement. */
export const PUBLIC_SOURCE_FIELDS = Object.freeze([
  'url',
  'media',
  'publication_date',
  'source_type',
  'is_primary',
  'access_status',
  'archive_url',
]);

/**
 * Liste noire explicite. Redondante avec la liste blanche — c'est voulu :
 * la liste blanche protège contre l'oubli, la liste noire contre le
 * renommage accidentel d'un champ interne en champ « qui a l'air public ».
 */
export const INTERNAL_FIELDS = Object.freeze([
  'commentaire_validation',
  'fiabilite_info_10',
  'crit_source_fiable',
  'crit_article_recent',
  'crit_etablissement_nomme',
  'crit_statut_clair',
  'crit_recoupement',
  'publication_status',
  'adresse',
  'next_review_at',
  'justifying_quote',
  'source_tier',
  'reviewed_by',
  'comment',
  'merged_into',
  'created_at',
  'updated_at',
  'recorded_at',
]);

export class PublicProjectionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PublicProjectionError';
    this.details = details;
  }
}

function pick(row, allowed) {
  const out = {};
  for (const f of allowed) {
    if (Object.hasOwn(row, f)) out[f] = row[f];
  }
  return out;
}

/**
 * Projette une ligne `cases` vers sa forme publique.
 * @param {object} row ligne brute (peut contenir des champs internes)
 * @returns {object} objet ne contenant que des champs de la liste blanche
 */
export function projectCase(row) {
  if (row === null || typeof row !== 'object') {
    throw new PublicProjectionError('projectCase attend un objet', { row });
  }
  return pick(row, PUBLIC_CASE_FIELDS);
}

/** Projette une ligne `sources` vers sa forme publique. */
export function projectSource(row) {
  if (row === null || typeof row !== 'object') {
    throw new PublicProjectionError('projectSource attend un objet', { row });
  }
  return pick(row, PUBLIC_SOURCE_FIELDS);
}

/**
 * Parcourt récursivement une structure et renvoie les chemins où un champ
 * interne apparaît. Ne jette pas : sert aussi bien au contrôle qu'au rapport.
 * @returns {Array<{path: string, field: string}>}
 */
export function findInternalFields(value, path = '$') {
  const hits = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findInternalFields(v, `${path}[${i}]`)));
    return hits;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (INTERNAL_FIELDS.includes(k)) hits.push({ path: `${path}.${k}`, field: k });
      hits.push(...findInternalFields(v, `${path}.${k}`));
    }
  }
  return hits;
}

/**
 * Garde-fou terminal : jette si la structure contient un champ interne.
 * À appeler juste avant toute écriture d'artefact public.
 */
export function assertNoInternalFields(value, label = 'artefact public') {
  const hits = findInternalFields(value);
  if (hits.length > 0) {
    const uniq = [...new Set(hits.map((h) => h.field))].join(', ');
    throw new PublicProjectionError(
      `${label} : ${hits.length} champ(s) interne(s) détecté(s) — ${uniq}`,
      { hits }
    );
  }
  return value;
}

/**
 * Champs de la liste blanche qui n'existent **pas encore** dans le schéma
 * déployé (ils arrivent avec la migration 004, non appliquée).
 * Les demander à PostgREST aujourd'hui renverrait une erreur 400.
 */
export const PENDING_CASE_FIELDS = Object.freeze(['verified_at', 'geocode_source']);
export const PENDING_SOURCE_FIELDS = Object.freeze(['access_status']);

const without = (list, pending) => list.filter((f) => !pending.includes(f));

/** Colonnes à demander à PostgREST pour les affaires (jamais `*`). */
export const CASE_SELECT = without(PUBLIC_CASE_FIELDS, PENDING_CASE_FIELDS).join(',');

/** Colonnes à demander à PostgREST pour les sources (jamais `*`). */
export const SOURCE_SELECT = [
  'case_id',
  ...without(PUBLIC_SOURCE_FIELDS, PENDING_SOURCE_FIELDS),
].join(',');
