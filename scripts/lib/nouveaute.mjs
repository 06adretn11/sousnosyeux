// =====================================================================
// scripts/lib/nouveaute.mjs — comparer des FAITS (pas des articles) à la mémoire de l'affaire. Fonctions PURES, aucun modèle.
//
// Catégories FONCTIONNELLES (aucun enum, aucune table) : STATE_CHANGE · CASE_ENRICHMENT · TERRITORIAL_ENRICHMENT · SOURCE_ONLY · NO_ACTION.
// Un article redécouvert, un état identique, un fait déjà consigné ne produisent JAMAIS de décision : seul un fait NOUVEAU appelle un clic.
// =====================================================================
import { memeMesure, mesureDeLibelle, MESURES_PROCEDURALES } from './mesures-procedurales.mjs';
const JOUR = 864e5;
const jour = (d) => String(d || '').slice(0, 10);
const ts = (d) => Date.parse(jour(d));
/**
 * Deux faits sont-ils LE MÊME fait ? Même libellé fermé ET dates qui ne se contredisent pas (jour/jour, mois/jour, mois/mois ; une date absente d'un côté ne contredit rien).
 * Déduplication au niveau du FAIT, pas de l'URL ni du couple (libellé, date exacte) : « un appel a été formé » sans date et le même daté du 18/11 sont un seul fait.
 */
export function memeFait(a, b) {
  if (!a?.libelle_public || !b?.libelle_public) return false;
  // Même FAIT sous deux libellés fermés d'une même famille (« interpellée » / « placée en garde à vue » ; « un appel a été formé » / « le parquet a fait appel »).
  if (a.libelle_public !== b.libelle_public && !memeMesure(a.mesure || mesureDeLibelle(a.libelle_public), b.mesure || mesureDeLibelle(b.libelle_public))) return false;
  const ja = a.event_date ? jour(a.event_date) : null, jb = b.event_date ? jour(b.event_date) : null, pa = a.event_period || null, pb = b.event_period || null;
  if (ja && jb) return ja === jb;
  if (pa && jb) return jb.slice(0, 7) === pa;
  if (ja && pb) return ja.slice(0, 7) === pb;
  if (pa && pb) return pa === pb;
  return true;
}
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
  // Un acte procédural à libellé fermé se compare par MESURE (famille) et non par type : une remise en liberté n'est pas « déjà connue » parce qu'une détention du même jour
  // est consignée, et un appel de la défense n'est pas « déjà connu » parce que celui du parquet l'est.
  const mesureFait = fait.mesure && MESURES_PROCEDURALES.includes(fait.mesure) ? fait.mesure : mesureDeLibelle(fait.libelle_public);
  // Mémoire en libellés FERMÉS : comparaison par famille de mesure. Événements rédigés à la main (libellé hors table) : repli historique par TYPE (+ jour), sinon un appel
  // consigné à la main « Appel formé par le parquet… » serait redemandé et réécrit.
  const memes = mesureFait
    ? memoire.filter((e) => { const m = mesureDeLibelle(e.libelle_public); return m ? memeMesure(mesureFait, m) : TYPE(e.event_type) === t; })
    : memoire.filter((e) => TYPE(e.event_type) === t);
  // Le libellé public est FERMÉ : deux rassemblements de jours différents portent le même texte. Il n'identifie donc un fait que si les dates ne se
  // CONTREDISENT pas (jour/jour, mois/jour, mois/mois) ; sans date de part et d'autre, le libellé suffit (une mesure annoncée puis rappelée).
  const jf = fait.event_date ? jour(fait.event_date) : null, pf = fait.event_period || null;
  const contredit = (e) => { const je = e.event_date ? jour(e.event_date) : null, pe = e.event_period || null;
    if (jf && je) return jf !== je; if (pf && je) return je.slice(0, 7) !== pf; if (jf && pe) return jf.slice(0, 7) !== pe; if (pf && pe) return pf !== pe; return false; };
  // Un acte procédural SANS date n'est « connu » que par un événement lui-même sans date ou daté dans les 10 jours qui précèdent la publication (ci-dessous) :
  // « un appel a été formé » sans date n'est pas le second appel d'un événement vieux d'un an. Sans date de publication, un événement SANS date suffit.
  const procSansDate = !!mesureFait && !jf && !pf;
  if (!procSansDate && fait.libelle_public && memoire.some((e) => e.libelle_public === fait.libelle_public && !contredit(e))) return true;
  if (!memes.length) return false;
  if (procSansDate && memes.some((e) => !e.event_date)) return true;
  if (fait.event_date) return memes.some((e) => jour(e.event_date) === jour(fait.event_date));
  if (fait.event_period) return memes.some((e) => jour(e.event_date).slice(0, 7) === fait.event_period);
  const pub = ts(pubDate);
  if (Number.isNaN(pub)) return false;
  return memes.some((e) => { const j = (pub - ts(e.event_date)) / JOUR; return !e.event_date || (j >= 0 && j <= 10); });
}

/**
 * Un fait de portée TERRITOIRE (un rassemblement de parents de deux écoles du même quartier) appartient à tout le territoire : s'il est déjà consigné pour une AUTRE affaire de la même commune,
 * le proposer à nouveau pour sa voisine dupliquerait la même information dans le Hub (cas BFMTV du 10/07/2026 : le rassemblement du 9 juillet devant l'école Baudin, déjà consigné pour Baudin,
 * redevenait « nouveau » dès que l'article était lu pour Titon). Comparaison STRICTE : même type ET même jour explicite ; un fait sans date n'est jamais écarté par la mémoire d'une voisine.
 * @param {{event_type:string, event_date?:string|null}} fait
 * @param {{event_type:string, event_date?:string|null}[]} memoireVoisines  événements consignés pour les autres affaires de la même commune
 */
export function dejaConnuChezVoisines(fait, memoireVoisines = []) {
  if (!fait?.event_date) return false;
  const t = TYPE(fait.event_type);
  return memoireVoisines.some((e) => TYPE(e.event_type) === t && jour(e.event_date) === jour(fait.event_date));
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
