// =====================================================================
// scripts/lib/signaux-actes.mjs — le SIGNAL d'un acte vu mais non retenu comme fait (règle opérationnelle, voir acte-procedural.mjs)
//
// Quand une citation dit un acte (appel, détention, remise en liberté, garde à vue…) sans qu'un fait établi en sorte, l'information ne disparaît pas : elle est CONSIGNÉE avec la
// proposition (state_proposals.payload.ecartee). Fonction PURE, aucun nom, aucune citation : un code d'acte et un état.
//   nie        « n'a pas fait appel »
//   ecarte     refusé, demandé, envisagé, « pourrait faire appel » (jamais un acte accompli)
//   rappele    rappel d'un acte ancien / discours rapporté
//   incertain  acte AFFIRMÉ qui n'a produit aucun fait (sujet, date ou stade impossibles à établir sans deviner)
// =====================================================================
import { actesDetail, aplat } from './routage-veille.mjs';
import { MESURES_PROCEDURALES } from './mesures-procedurales.mjs';

/** acte (routage-veille) → familles de mesure qu'un fait retenu peut porter. */
const FAMILLE = {
  APPEL_FORME: ['appel', 'appel_parquet', 'appel_défense'],
  ECROU: ['detention_provisoire'],
  REMISE_LIBERTE: ['remise_en_liberte', 'remise_en_liberte_controle'],
  INTERPELLATION: ['garde_a_vue', 'interpellation'],
};

/**
 * @param {string[]} citations  citations littérales de la proposition
 * @param {{mesure?:string}[]} retenus  faits effectivement produits (detecterActesProcéduraux, mesures institutionnelles…)
 * @returns {{acte:string, etat:'nie'|'ecarte'|'rappele'|'incertain'}[]}  dédoublonné, ordre stable
 */
export function signauxNonRetenus(citations, retenus = []) {
  const mesures = new Set(retenus.map((f) => f?.mesure).filter(Boolean));
  const vus = new Map();
  const noter = (acte, etat) => { const k = `${acte}|${etat}`; if (!vus.has(k)) vus.set(k, { acte, etat }); };
  for (const c of citations || []) {
    const d = actesDetail(String(c || ''));
    // « n'exclut pas de faire appel », « n'est pas exclu » : double négation = POSSIBILITÉ (écartée), jamais « nié » (le signal garde le sens de la phrase).
    const possible = /\bn'(?:exclut|exclue?|ecarte|ferme)\w*\s+pas\b|\bn'est\s+pas\s+exclu|\bne\s+(?:l'|)(?:exclut|ecarte)\w*\s+pas\b/.test(aplat(String(c || '')));
    for (const a of d.nies) if (FAMILLE[a]) noter(a, possible ? 'ecarte' : 'nie');
    for (const a of d.ecartes) if (FAMILLE[a]) noter(a, 'ecarte');
    for (const a of d.rappeles) if (FAMILLE[a]) noter(a, 'rappele');
    // Un acte AFFIRMÉ dont aucune famille de mesure n'a été retenue : le signal existe, le fait n'est pas assez sûr.
    for (const a of d.affirmes) if (FAMILLE[a] && !FAMILLE[a].some((m) => mesures.has(m) && MESURES_PROCEDURALES.includes(m))) noter(a, 'incertain');
  }
  return [...vus.values()];
}
