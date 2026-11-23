// =====================================================================
// scripts/lib/reprise-bornee.mjs — décision du garde-fou quotidien, FONCTION PURE (testée hors base).
//
// Un passage de la veille peut sortir INCOMPLET (code 3 : service dégradé, rafale de flux vides, plus de la moitié des recherches sans résultat). Le passage du jour n'est alors
// PAS consigné et le créneau suivant reprend — borné aux affaires non examinées (--sauter-reussies-du-jour). Sans plafond, chaque créneau de la journée (≈ 24 déclenchements
// planifiés + les relais) relancerait des recherches contre un service qui ne répond pas : la reprise est donc plafonnée à REPRISES_MAX passages incomplets par jour (UTC).
// Au plafond, les créneaux suivants du jour ne font rien ; le lendemain repart d'un stock entier. Aucun contenu, aucune URL : un compteur et une date.
// =====================================================================
export const REPRISES_MAX = 3;
export const FENETRE_UTC = { debut: 5, fin: 19 };

/** « 2026-11-23:2 » → 2 pour le jour demandé ; 0 pour un autre jour ou une valeur illisible (fail-safe : un compteur corrompu ne bloque jamais). */
export function incompletsDuJour(valeur, jour) {
  const m = /^(\d{4}-\d{2}-\d{2}):(\d{1,3})$/.exec(String(valeur ?? ''));
  return m && m[1] === jour ? Number(m[2]) : 0;
}
export const valeurIncompletsApres = (valeur, jour) => `${jour}:${incompletsDuJour(valeur, jour) + 1}`;

/**
 * @param {{dernierPassage:string|null, valeurIncomplets:string|null, jour:string, heureUtc:number, max?:number}} o
 * @returns {{skip:boolean, raison:'deja_passe'|'hors_fenetre'|'reprises_epuisees'|'travaille', incomplets:number}}
 */
export function decisionGarde({ dernierPassage, valeurIncomplets = null, jour, heureUtc, max = REPRISES_MAX }) {
  const incomplets = incompletsDuJour(valeurIncomplets, jour);
  if (dernierPassage === jour) return { skip: true, raison: 'deja_passe', incomplets };
  if (!(heureUtc >= FENETRE_UTC.debut && heureUtc < FENETRE_UTC.fin)) return { skip: true, raison: 'hors_fenetre', incomplets };
  if (incomplets >= max) return { skip: true, raison: 'reprises_epuisees', incomplets };
  return { skip: false, raison: 'travaille', incomplets };
}
