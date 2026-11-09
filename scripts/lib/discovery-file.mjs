// =====================================================================
// scripts/lib/discovery-file.mjs — la FILE d'un passage Discovery : quels signaux sont qualifiés, dans quel ordre, sous le plafond.
//
// Fonction PURE (aucun réseau, aucune base, aucun modèle), appelée par discovery-quotidien.mjs ET par ses tests : la sélection testée est la
// sélection exécutée.
//
// RÈGLE (09/11/2026). Les signaux jamais vus passent d'abord. Ensuite viennent les signaux « en attente de recoupement », examinés dans l'ordre
// de leur DERNIER EXAMEN (le moins récent d'abord, puis le plus ancien) : chaque dossier reçoit son tour, aucun n'est évincé indéfiniment par
// les mêmes huit objets, et un dossier qui vient d'être examiné (inchangé, ou en échec technique — son examen est alors consigné) ne repasse
// qu'après tous les autres. Avant : ordre de première apparition → les huit plus anciens occupaient le plafond à chaque passage ; des signaux
// restaient 15 jours sans un seul examen (mesuré le 09/11/2026 : 45 histoires en file, 8 qualifiées par passage).
// Le plafond (8 histoires qualifiées par passage) et le délai d'expiration (21 jours) ne changent pas.
// =====================================================================
import { aplatir } from './capteurs.mjs';

export const ATTENTE_JOURS = 21;
const mots = (s) => new Set(aplatir(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / ((a.size + b.size - i) || 1); };
const ms = (d) => (d == null ? null : new Date(d).getTime());

/**
 * @param {{candidatsNeufs:object[], attente:{cle:string, titre:string, first_seen:any, last_checked?:any, urls?:any}[], maintenant?:number, attenteJours?:number}} o
 * @returns {{expires:object[], aReexaminer:object[], file:object[], grappes:{t:Set<string>, rep:object, membres:object[]}[]}}
 */
export function composerFile({ candidatsNeufs, attente, maintenant = Date.now(), attenteJours = ATTENTE_JOURS }) {
  const expires = attente.filter((r) => maintenant - ms(r.first_seen) > attenteJours * 864e5);
  const aReexaminer = attente
    .filter((r) => !expires.includes(r))
    .filter((r) => !candidatsNeufs.some((c) => c.cle === r.cle))
    // dernier examen le plus ancien d'abord (jamais examiné = 0), puis première apparition, puis clé : ordre total, donc déterministe
    .sort((a, b) => (ms(a.last_checked) ?? 0) - (ms(b.last_checked) ?? 0) || ms(a.first_seen) - ms(b.first_seen) || (a.cle < b.cle ? -1 : 1));
  const file = [...candidatsNeufs, ...aReexaminer.map((r) => ({ ...r, urls: r.urls || [], requalif: true }))];
  // Grappes : une histoire = une qualification (un titre par histoire : similarité de mots ≥ 0,5).
  const grappes = [];
  for (const s of file) {
    const t = mots(s.titre);
    const gr = grappes.find((x) => jaccard(x.t, t) >= 0.5);
    if (gr) gr.membres.push(s); else grappes.push({ t, rep: s, membres: [s] });
  }
  // Les URL directes de tous les membres servent à la qualification de l'histoire.
  for (const gr of grappes) gr.rep = { ...gr.rep, urls: gr.membres.flatMap((m) => m.urls || []) };
  return { expires, aReexaminer, file, grappes };
}
