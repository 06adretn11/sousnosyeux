// =====================================================================
// scripts/lib/preuves.mjs — une nouvelle affaire est-elle SUFFISAMMENT documentée ? Et sinon, que manque-t-il ?
//
// Fonction PURE. S'appuie sur les cinq critères éditoriaux déjà calculés à la qualification (fiche.crit_*, × 2 pts = fiabilité) et
// sur le SEUIL DE PUBLICATION EXISTANT (fiabilité ≥ 8, décision verrouillée du projet) : aucun nouveau critère, aucun nouveau seuil.
//   · suffisantes  = fiabilité ≥ 8 (au plus UN critère en défaut)  → bouton CRÉER (publiable SUR GO) ;
//   · sinon        = preuves à compléter                            → bouton CRÉER (preuves à compléter) : candidate NON publiable.
// `manques` liste tout critère en défaut (informatif même quand les preuves sont suffisantes).
// =====================================================================

const CRITERES = [
  ['crit_recoupement', 'recoupement insuffisant : une seule source indépendante'],
  ['crit_etablissement_nomme', 'établissement non nommé par la presse'],
  ['crit_statut_clair', 'statut judiciaire à qualifier'],
  ['crit_source_fiable', 'source jugée insuffisamment fiable'],
  ['crit_article_recent', 'article ancien'],
];
export const SEUIL_PUBLICATION = 8;

/** @returns {{suffisantes:boolean, manques:string[], fiabilite:number}} */
export function preuvesDe(payload, recommendation = null) {
  const f = payload?.fiche || {};
  const manques = CRITERES.filter(([k]) => f[k] === false).map(([, t]) => t);
  const fiabilite = 2 * (CRITERES.length - manques.length);
  // Le moteur a aussi pu juger le signal ambigu (affaire voisine, dépêches identiques) sans qu'un critère tombe : on le dit.
  if (!manques.length && recommendation === 'REVIEW' && payload?.avertissement) manques.push(String(payload.avertissement).slice(0, 160));
  return { suffisantes: fiabilite >= SEUIL_PUBLICATION, manques, fiabilite };
}
