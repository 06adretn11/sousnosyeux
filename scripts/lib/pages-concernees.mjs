// Pages de fiche à faire vérifier sur le site servi après une projection (pur, testé sans base ni réseau).
//
// Une fiche est « concernée » (donc transmise à scripts/verifier-site.mjs --fiches, avec l'attente du déploiement) dès que SA VERSION PUBLIQUE change :
// nouvellement approuvée, empreinte de dossier approuvée DIFFÉRENTE (mise à jour ou restauration, même si l'affaire était déjà publiée),
// événement validé modifié, ou information validée qui la touche.
/**
 * @param {{ancien: {fiches_approuvees?: Record<string,{hash:string}>, affaires?: Record<string,any[]>}, fiches: Record<string,{hash:string}>,
 *          parAffaire: Record<string,any[]>, touchees: {destinations:{fiche?:string}}[]}} o
 * @returns {string[]}
 */
export function fichesConcernees({ ancien, fiches, parAffaire, touchees }) {
  return Object.keys(fiches).filter((id) =>
    !ancien.fiches_approuvees?.[id]
    || ancien.fiches_approuvees[id].hash !== fiches[id].hash
    || JSON.stringify(ancien.affaires?.[id] ?? []) !== JSON.stringify(parAffaire[id] ?? [])
    || touchees.some((m) => m.destinations.fiche === id));
}
