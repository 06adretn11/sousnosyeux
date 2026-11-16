// =====================================================================
// scripts/lib/hub-maj.mjs — MISE À JOUR d'un Hub composé DÉJÀ publié : de « matière nouvelle » (diagnostic territorial) à une proposition DÉCIDABLE. Fonctions PURES.
//
// Avant (16/11/2026) : le diagnostic envoyait « TERRITOIRE · ENRICHIR_HUB » avec des compteurs (+1 source, 3 affaires, …), sans le changement proposé ni bouton.
// Maintenant : la matière du Hub est RECOMPOSÉE depuis l'état courant (même composeur que la préparation) ; si son empreinte diffère de la version approuvée,
// la différence EST la proposition : affaire et source nouvelles, ce qui change dans le dossier territorial, aperçu consultable, et quatre actions
// (Voir la proposition · Approuver cette version · À revoir · Écarter la proposition). Le GO porte sur l'empreinte ; le Hub publié ne change pas avant.
// =====================================================================

const txt = (v) => (v == null ? '' : String(v));
const norm = (v) => txt(v).replace(/\s+/g, ' ').trim();

/** Rubriques comparables d'une matière composée (celles que le composeur écrit). */
function rubriques(m) {
  const r = {};
  r['Chapeau'] = norm(m?.reperes?.chapeau);
  r['Limite'] = norm(m?.reperes?.limite);
  for (const q of m?.recherches || []) r[`Recherche · ${norm(q.question)}`] = norm(q.resultat);
  for (const g of m?.reponses || []) r[`Réponses · ${norm(g.titre)}`] = (g.items || []).map((i) => `${norm(i.date || 'sans date')} ${norm(i.texte)}`).join(' | ');
  r['Affaires'] = (m?.ordre || []).join(', ');
  return r;
}

/** Différences lisibles entre la matière approuvée (publiée) et la matière recomposée. @returns {{rubrique:string, avant:string, apres:string}[]} */
export function changementsHub(avant, apres) {
  const a = rubriques(avant), b = rubriques(apres);
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return cles.filter((k) => (a[k] ?? '') !== (b[k] ?? '')).map((k) => ({ rubrique: k, avant: a[k] ?? '', apres: b[k] ?? '' }));
}

/**
 * Bloc `mise_a_jour` porté par la proposition « PUBLIER LE HUB » d'un Hub déjà publié.
 * @param {{hashPublie:string, changements:object[], affaires:{case_id:string, etablissement?:string, commune?:string}[], sources:{case_id:string, media:string, url:string, publication_date?:string}[], informations:string[]}} o
 */
export function blocMiseAJour({ hashPublie, changements, affaires = [], sources = [], informations = [] }) {
  return {
    hash_publie: hashPublie,
    changements: changements.map((c) => ({ rubrique: c.rubrique, avant: c.avant.slice(0, 900), apres: c.apres.slice(0, 900) })),
    affaires: affaires.map((a) => ({ case_id: a.case_id, etablissement: a.etablissement ?? null, commune: a.commune ?? null })),
    sources: sources.map((s) => ({ case_id: s.case_id, media: s.media, url: s.url, publie_le: s.publication_date ? String(s.publication_date).slice(0, 10) : null })),
    informations,
  };
}

/** Faut-il proposer ? Oui seulement si la matière recomposée a une empreinte ≠ version publiée (et qu'il y a au moins un changement lisible). */
export const aProposer = ({ hashPublie, hashRecomposee, changements }) => !!hashPublie && hashRecomposee !== hashPublie && changements.length > 0;

/** Extrait lisible d'une différence : le contexte commun est abrégé, seul le segment modifié est montré (« …texte [avant → après] texte… »). */
export function diffCourt(avant, apres, contexte = 45) {
  const a = txt(avant), b = txt(apres);
  if (a === b) return '(aucune différence)';
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0; while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  // Frontières de MOTS : jamais « affaire » coupé en « affaire »/« s ».
  while (p > 0 && a[p - 1] !== ' ') p--;
  while (s > 0 && a[a.length - s] !== ' ') s--;
  const ctxAvant = a.slice(Math.max(0, p - contexte), p), ctxApres = a.slice(a.length - s, a.length - s + contexte);
  const segA = a.slice(p, a.length - s), segB = b.slice(p, b.length - s);
  if (!segA && !segB) return '(aucune différence)';
  const tete = p > contexte ? '…' : '', queue = s > contexte ? '…' : '';
  const dit = (x) => (x ? `« ${x.length > 260 ? x.slice(0, 259) + '…' : x} »` : '(rien)');
  return `${tete}${ctxAvant}[${dit(segA)} → ${dit(segB)}]${ctxApres}${queue}`;
}
