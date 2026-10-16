// =====================================================================
// scripts/lib/nouveaute.mjs — comparer des FAITS (pas des articles) à la mémoire de l'affaire. Fonctions PURES, aucun modèle.
//
// Catégories FONCTIONNELLES (aucun enum, aucune table) : STATE_CHANGE · CASE_ENRICHMENT · TERRITORIAL_ENRICHMENT · SOURCE_ONLY · NO_ACTION.
// Un article redécouvert, un état identique, un fait déjà consigné ne produisent JAMAIS de décision : seul un fait NOUVEAU appelle un clic.
// =====================================================================
const JOUR = 864e5;
const jour = (d) => String(d || '').slice(0, 10);
const ts = (d) => Date.parse(jour(d));
/** Types voisins : le modèle écrit « réaction_publique », la mémoire « mobilisation ». */
const TYPE = (t) => (t === 'réaction_publique' ? 'mobilisation' : t);

/**
 * Un fait (type + date/période) est-il DÉJÀ dans la mémoire (événements consignés ou faits validés) ?
 *   - même libellé public → connu ;
 *   - même type ET même jour → connu ; période (AAAA-MM) → connu si un événement du même type tombe dans ce mois ;
 *   - fait SANS date : connu si un événement du même type est daté dans les 10 jours qui précèdent la publication
 *     (un article de rappel ne rapporte pas un second événement) ; jamais « connu » sur un type absent de la mémoire.
 * @param {{event_type:string, event_date?:string|null, event_period?:string|null, libelle_public?:string}} fait
 * @param {{event_type:string, event_date?:string|null, libelle_public?:string}[]} memoire
 */
export function dejaConnu(fait, memoire = [], { pubDate = null } = {}) {
  const t = TYPE(fait.event_type);
  const memes = memoire.filter((e) => TYPE(e.event_type) === t);
  if (fait.libelle_public && memoire.some((e) => e.libelle_public === fait.libelle_public)) return true;
  if (!memes.length) return false;
  if (fait.event_date) return memes.some((e) => jour(e.event_date) === jour(fait.event_date));
  if (fait.event_period) return memes.some((e) => jour(e.event_date).slice(0, 7) === fait.event_period);
  const pub = ts(pubDate);
  if (Number.isNaN(pub)) return false;
  return memes.some((e) => { const j = (pub - ts(e.event_date)) / JOUR; return !e.event_date || (j >= 0 && j <= 10); });
}

/**
 * @param {{statutAvant:string, statutPropose:string|null, faitJudiciaireConnu:boolean, reactionsNouvelles:{portee:string}[], sourceNouvelle:boolean}} o
 * @returns {{categorie:'STATE_CHANGE'|'CASE_ENRICHMENT'|'TERRITORIAL_ENRICHMENT'|'SOURCE_ONLY'|'NO_ACTION', clic:boolean}}
 */
export function categorieNouveaute({ statutAvant, statutPropose, faitJudiciaireConnu = false, reactionsNouvelles = [], sourceNouvelle = false }) {
  if (statutPropose && statutPropose !== statutAvant && !faitJudiciaireConnu) return { categorie: 'STATE_CHANGE', clic: true };
  if (reactionsNouvelles.some((r) => r.portee !== 'territoire')) return { categorie: 'CASE_ENRICHMENT', clic: true };
  if (reactionsNouvelles.length) return { categorie: 'TERRITORIAL_ENRICHMENT', clic: true };
  return sourceNouvelle ? { categorie: 'SOURCE_ONLY', clic: false } : { categorie: 'NO_ACTION', clic: false };
}
