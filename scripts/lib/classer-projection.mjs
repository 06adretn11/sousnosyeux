// =====================================================================
// scripts/lib/classer-projection.mjs — que faire d'UNE affaire que publier-evolutions voudrait reprojeter ?
//
// Cas fondateur (11/10/2026, FR-2026-0115 Tarnos) : « publiée » en base, éligible, mais pas encore dans l'artefact public (sa
// publication est un acte distinct, publier-affaire). Une décision récente (RAPPROCHER du 09/10) la faisait reprojeter en
// `--modifier`, que project-public refuse pour une affaire absente de l'artefact → étape en échec, QA/publication des AUTRES
// évolutions sautées. Trois cas, trois traitements :
//   EN_ATTENTE : absente de l'artefact → rien à modifier ; sa publication reste un acte éditorial. Ni erreur, ni échec.
//   CONFLIT    : sur le site mais plus projetable (retirée, sous le seuil, sous HOLD) → JAMAIS de retrait silencieux : signalée,
//                arbitrage humain demandé. Ne fait pas échouer les décisions indépendantes.
//   TECHNIQUE  : toute autre erreur de la projection → échec réel de l'étape.
// =====================================================================

/** @returns {'EN_ATTENTE'|'CONFLIT'|'TECHNIQUE'|'A_PROJETER'} */
export function classerProjection({ dansArtefact, erreur = null }) {
  if (!dansArtefact) return 'EN_ATTENTE';
  if (!erreur) return 'A_PROJETER';
  return /plus projetable/.test(String(erreur)) ? 'CONFLIT' : 'TECHNIQUE';
}

export const texteConflit = (id) =>
  `⚠️ Arbitrage requis : ${id} figure sur le site public mais n’est plus projetable (retirée, sous le seuil de fiabilité ou sous HOLD). ` +
  'Rien n’a été retiré ni modifié : elle reste affichée tant que tu n’as pas tranché (la retirer, ou rétablir ses critères).';
