// =====================================================================
// scripts/lib/proposition-publication.mjs — « PUBLIER ? » : la proposition de publication d'une candidate EXAMINÉE (fonctions PURES).
//
// Une proposition est une ligne `new_case_proposals` (recommendation REVIEW, payload.publication) : le Worker Telegram, le journal des
// clics, l'idempotence (`decision is null`, `applied_at`) et les accusés EXISTENT déjà. Boutons : PUBLIER (callback VALIDATE) · REVIEW · REJECT.
//   PUBLIER = GO éditorial explicite : exécuté par publier-affaire.mjs (ses contrôles, sa transaction) — jamais par une seconde logique SQL.
//   REJECT  = refus de publier : revue « à corriger », l'affaire est CONSERVÉE (candidate).     REVIEW = HOLD : rien n'est écrit.
// Aucune coordonnée n'est inventée : point documenté (déjà en base) ou point APPROXIMATIF explicitement signalé (centre de commune, API Adresse).
// =====================================================================

export const cleDedup = (case_id) => `publication|${case_id}`;
const nombre = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * Précision de la localisation d'une candidate.
 * @param {{lat,lng,geocode_source?}} c   ligne cases
 * @param {{lat:number,lng:number,source:string}|null} geo   centre de commune trouvé par l'API Adresse (nom ET département exacts), sinon null
 * @returns {{type:'documentee'|'approximative', lat:number, lng:number, source?:string}|null}  null = aucune localisation fiable → non publiable
 */
export function localisationDe(c, geo = null) {
  const lat = nombre(c.lat), lng = nombre(c.lng);
  if (lat !== null && lng !== null) return c.geocode_source ? { type: 'approximative', lat, lng, source: c.geocode_source } : { type: 'documentee', lat, lng };
  if (geo) return { type: 'approximative', lat: geo.lat, lng: geo.lng, source: geo.source };
  return null;
}

/** Payload de la proposition. `publiable` = examinée ET localisée : sans cela, le bouton PUBLIER n'existe pas. */
export function payloadPublication({ c, examen, sources = [], loc, resume = null }) {
  const crit = { source_fiable: !!c.crit_source_fiable, article_recent: !!c.crit_article_recent, etablissement_nomme: !!c.crit_etablissement_nomme,
    statut_clair: !!c.crit_statut_clair, recoupement: !!c.crit_recoupement };
  return {
    version: 'proposition-publication-1',
    commune: c.commune, etablissement: c.etablissement, resume,
    publication: {
      case_id: c.case_id, publiable: examen?.etat === 'AWAITING_GO' && !!loc,
      statut_judiciaire: c.statut_judiciaire, fiabilite: c.fiabilite_info_10, criteres: crit,
      sources: sources.slice(0, 4).map((s) => ({ media: s.media, url: s.url, d: s.d ?? null })),
      localisation: loc,
      bloque: examen?.etat === 'AWAITING_GO' ? (loc ? null : 'aucune localisation fiable (commune ambiguë, composée ou inconnue)') : (examen?.raisons || []).join(' ; '),
    },
  };
}

/**
 * Arguments (liste, jamais de shell) de publier-affaire.mjs pour exécuter le GO. Les coordonnées ne sont passées que si la fiche n'en a pas
 * (publier-affaire refuse d'écraser) ; un point approximatif porte TOUJOURS sa précision (--geocode-source).
 */
export function argsPublierAffaire({ case_id, id8, dbLat, dbLng, loc, date, go = `Telegram PUBLIER ${id8}` }) {
  const args = ['scripts/publier-affaire.mjs', case_id, '--ecrire', '--go', go];
  if (nombre(dbLat) === null || nombre(dbLng) === null) {
    if (!loc) throw new Error('aucune localisation fiable : publication refusée');
    args.push('--coords', `${loc.lat},${loc.lng}`, '--coords-source', loc.type === 'approximative' ? `API Adresse (BAN), centre de commune, ${date}` : `coordonnées documentées, ${date}`);
    if (loc.type === 'approximative') args.push('--geocode-source', loc.source);
  }
  return args;
}

/**
 * Lecture d'un échec de publier-affaire.mjs. `definitif` : un garde-fou (« REFUS — … ») est une décision DÉTERMINISTE de ses contrôles
 * (fiabilité, revue, HOLD, retrait, coordonnées) : inutile de la retenter à chaque passage. Toute autre erreur (réseau, base) reste réessayée.
 * `motif` : les seules raisons, sans l'en-tête « REFUS — n garde-fou(s) ».
 */
export function motifRefus(sortie) {
  const lignes = String(sortie || '').split('\n');
  const raisons = lignes.filter((l) => /^\s*·\s/.test(l)).map((l) => l.replace(/^\s*·\s*/, '').trim());
  const sansLocalisation = lignes.some((l) => /aucune localisation fiable/.test(l));
  return {
    definitif: lignes.some((l) => /^REFUS\b/.test(l.trim())) || sansLocalisation,
    motif: (raisons.length ? raisons.join(' ; ') : sansLocalisation ? 'aucune localisation fiable' : 'contrôle de publication refusé').slice(0, 300),
  };
}
