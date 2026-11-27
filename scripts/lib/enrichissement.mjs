// =====================================================================
// scripts/lib/enrichissement.mjs — composition PURE d'un enrichissement rédigé de fiche (testée sans base ni réseau).
//
//   composerEnrichissement({ approuve, patch }) → { ok, refus[], dossier?, ajouts?, base, apres? }
//
// La matière (data/fiches-enrichissements/<ID>.json) s'applique à UNE version approuvée précise (`base_hash`) : si le dossier approuvé a changé, REFUS
// (jamais d'écrasement d'une version approuvée par une matière rédigée sur une autre). Étapes et acteurs sont validés ; aucun modèle n'est appelé.
// =====================================================================
import { hashDossier } from './fiche-page.mjs';
import { validerActeurs, compterPoints, CATEGORIE_DOCUMENT } from './acteurs-terrain.mjs';

export const TYPES_ADMIS = Object.freeze(['rencontre', 'courrier']);

export function composerEnrichissement({ approuve, patch }) {
  const refus = [];
  if (!approuve?.d) return { ok: false, refus: ['aucun dossier approuvé pour cette affaire'] };
  if (!patch || typeof patch !== 'object') return { ok: false, refus: ['aucune matière d’enrichissement'] };
  const base = hashDossier(approuve.d);
  if (patch.base_hash !== base) return { ok: false, base, refus: [`la matière a été rédigée pour la version ${patch.base_hash ?? '?'}, la version approuvée est ${base} : à refaire à partir de la version approuvée`] };

  for (const [i, e] of (patch.deroule_ajouts || []).entries()) {
    const n = `étape ${i + 1}`;
    if (!TYPES_ADMIS.includes(e?.type)) refus.push(`${n} : type « ${e?.type} » non admis pour un enrichissement rédigé (${TYPES_ADMIS.join(', ')})`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e?.date ?? '') || e?.date_nature !== 'evenement') refus.push(`${n} : date d'événement complète et date_nature « evenement » exigées`);
    if (!String(e?.texte ?? '').trim() || String(e.texte).length > 700) refus.push(`${n} : texte vide ou de plus de 700 caractères`);
    if (!/^Selon |^Le collectif /.test(e?.texte ?? '')) refus.push(`${n} : le texte doit être attribué (« Selon… » ou « Le collectif… »)`);
    if (!/^https:\/\/\S+$/.test(e?.source?.url ?? '') || !e?.source?.media) refus.push(`${n} : source https avec média exigée`);
    if (e?.source?.categorie !== CATEGORIE_DOCUMENT) refus.push(`${n} : la source d'une étape de ce type est un document d'acteur (categorie « ${CATEGORIE_DOCUMENT} »)`);
  }
  refus.push(...validerActeurs(patch.acteurs_de_terrain));
  if (!(patch.deroule_ajouts || []).length && !compterPoints(patch.acteurs_de_terrain)) refus.push('matière vide');
  if (refus.length) return { ok: false, base, refus };

  const dossier = structuredClone(approuve.d);
  const deja = new Set((dossier.deroule || []).map((e) => `${e.date}|${e.type}`));
  const ajouts = (patch.deroule_ajouts || []).filter((e) => !deja.has(`${e.date}|${e.type}`));
  dossier.deroule = [...(dossier.deroule || []), ...ajouts];
  if (patch.acteurs_de_terrain) dossier.acteurs_de_terrain = patch.acteurs_de_terrain;
  return { ok: true, refus: [], dossier, ajouts, base, apres: hashDossier(dossier) };
}
