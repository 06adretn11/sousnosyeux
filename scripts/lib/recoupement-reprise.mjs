// =====================================================================
// scripts/lib/recoupement-reprise.mjs — RÈGLE A (20/11/2026) : un fait judiciaire repris par plusieurs éditeurs dont un titre de référence.
//
// Cas réel (Beauvais, mise en examen d'un animateur périscolaire) : Le Figaro, Sud Ouest et Le Bien Public publient la même dépêche.
// La règle de recoupement (`independantes`) la compte pour UNE origine — à raison, contre une paraphrase de blog ou un relais déclaré —
// et le critère « recoupement » tombait, privant l'affaire de publication alors que le fait est public, judiciaire et relayé par la
// presse de référence.
//
// RÈGLE : le recoupement est reconnu (jamais « deux origines » prétendues : le message le dit) quand TOUT est réuni —
//   1. au moins 3 éditeurs distincts (un éditeur ne se recoupe pas lui-même) ;
//   2. au moins un titre de référence parmi eux (liste fermée ci-dessous) ;
//   3. le stade judiciaire est une procédure établie (stadePubliable : mise en examen, procès, condamnation… — ni plainte seule, ni suspension) ;
//   4. au moins une page attribue le fait à une AUTORITÉ (parquet, procureur, magistrat, police, gendarmerie, mairie…) : un fait allégué
//      sans autorité nommée n'est pas concerné.
// Cela ne change NI le seuil de publication (8/10), NI les autres critères (établissement nommé, article récent, source fiable, statut clair).
// Fonction PURE.
// =====================================================================
import { stadePubliable } from './stade-judiciaire.mjs';

/** Titres de référence (domaines). Liste fermée, volontairement courte : on l'étend par décision, pas par heuristique. */
export const TITRES_DE_REFERENCE = Object.freeze([
  'lefigaro.fr', 'lemonde.fr', 'leparisien.fr', 'liberation.fr', 'lexpress.fr', 'lepoint.fr', '20minutes.fr',
  'ouest-france.fr', 'sudouest.fr', 'ladepeche.fr', 'laprovence.com', 'lavoixdunord.fr', 'ledauphine.com', 'leprogres.fr',
  'midilibre.fr', 'nicematin.com', 'dna.fr', 'estrepublicain.fr', 'lanouvellerepublique.fr', 'courrier-picard.fr',
  'francetvinfo.fr', 'franceinfo.fr', 'france3-regions.franceinfo.fr', 'ici.fr', 'francebleu.fr', 'bfmtv.com', 'tf1info.fr', 'afp.com',
]);
export const MIN_EDITEURS_REPRISE = 3;

const aplat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const AUTORITE = /\b(procureur|procureure|parquet|magistrat\w*|juge d'instruction|juge des libertes|gendarmerie|gendarmes?|police|commissariat|maire|mairie|la ville|rectorat|prefecture)\b/;
const estReference = (d) => TITRES_DE_REFERENCE.some((r) => d === r || d.endsWith('.' + r));

/**
 * @param {{domaines:string[], pages:{corps?:string}[], statut:string}} o
 * @returns {{ok:boolean, motif:string}}  `motif` : la raison, en clair (affichée à l'éditeur ; jamais de nom ni de lieu).
 */
export function recoupementParReprise({ domaines = [], pages = [], statut = '' }) {
  const d = [...new Set(domaines.map((x) => String(x || '').toLowerCase().replace(/^www\./, '')).filter(Boolean))];
  if (d.length < MIN_EDITEURS_REPRISE) return { ok: false, motif: `${d.length} éditeur(s) : au moins ${MIN_EDITEURS_REPRISE} requis` };
  if (!d.some(estReference)) return { ok: false, motif: 'aucun titre de référence parmi les éditeurs' };
  if (!stadePubliable(statut)) return { ok: false, motif: 'procédure judiciaire non établie (plainte seule, suspension ou stade à qualifier)' };
  if (!pages.some((p) => AUTORITE.test(aplat(p.corps)))) return { ok: false, motif: 'aucune autorité (parquet, police, mairie…) citée comme source du fait' };
  return { ok: true, motif: `${d.length} éditeurs dont un titre de référence reprennent un fait judiciaire attribué à une autorité` };
}
