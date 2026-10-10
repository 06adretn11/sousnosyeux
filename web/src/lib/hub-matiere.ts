// =====================================================================
// web/src/lib/hub-matiere.ts — matière éditoriale d'un hub.
//
// Deux emplacements, une seule forme :
//   data/hub-matiere/<hub>.json  → matière PUBLIABLE (affaires publiques) ;
//   data/hub-prive/<hub>.json    → matière sur affaires VALIDÉES MAIS NON
//                                  PUBLIÉES. Ignoré par Git (dépôt public !).
//                                  Ne peut exister que sur ce poste.
//
// Un hub rendu avec de la matière privée est un rendu LOCAL : la page
// l'affiche en toutes lettres et refuse de le masquer. `noindex` n'est
// pas un mécanisme de confidentialité.
//
// Forme d'une « entrée » (chronologie, réponse) :
//   { date, date_nature, type, acteur?, texte, source:{media,url,publie_le,acces} }
// date_nature : 'evenement' | 'approximative' | 'article' | 'inconnue'
//   — seule 'evenement' autorise à afficher la date comme celle de l'événement.
// =====================================================================

import { dateLongue } from './etat-wording';

const publics = import.meta.glob('../../../data/hub-matiere/*.json', { eager: true });
const prives = import.meta.glob('../../../data/hub-prive/*.json', { eager: true });

const parId = (mods: Record<string, any>) =>
  Object.fromEntries(Object.entries(mods).map(([p, m]) => [p.split('/').pop()!.replace('.json', ''), m.default ?? m]));
const P = parId(publics);
const V = parId(prives);

export function chargerHub(id: string): { matiere: any; prive: any | null } {
  if (!P[id]) throw new Error(`[hub-matiere] data/hub-matiere/${id}.json introuvable`);
  return { matiere: P[id], prive: V[id] ?? null };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-06-16 » → « 16 juin 2026 » · « 2026-06 » → « juin 2026 » · approx → « vers … » · sinon « date non établie ». */
export function libelleDate(date: string | null | undefined, nature: string | null | undefined): string {
  if (!date || nature === 'article' || nature === 'inconnue') return 'Date non établie';
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!m) return 'Date non établie';
  const txt = m[3] ? dateLongue(date) : `${MOIS[Number(m[2]) - 1]} ${m[1]}`;
  return nature === 'approximative' ? `Vers ${txt}` : txt[0].toUpperCase() + txt.slice(1);
}

export const TYPE_LABELS: Record<string, string> = {
  fait_rapporte: 'Faits rapportés', signalement: 'Signalement', plainte: 'Plainte', enquete: 'Enquête',
  garde_a_vue: 'Garde à vue', mise_en_examen: 'Mise en examen', renvoi: 'Renvoi', audience: 'Audience',
  decision: 'Décision', appel: 'Appel', mesure_etablissement: 'Mesure de l’établissement',
  mesure_collectivite: 'Mesure de la collectivité', mesure_etat: 'Mesure de l’État',
  communication_parquet: 'Parquet', prise_de_parole: 'Prise de parole', mobilisation: 'Mobilisation',
  contexte: 'Contexte', contradiction: 'Contradiction',
};
