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
import evenementsDoc from '../../../data/evenements.json';

const publics = import.meta.glob('../../../data/hub-matiere/*.json', { eager: true });
const prives = import.meta.glob('../../../data/hub-prive/*.json', { eager: true });
// Dernière version APPROUVÉE d'un Hub composé (écrite par project-evenements au moment du GO « PUBLIER LE HUB ») : c'est elle qui est servie, pas le brouillon.
const approuves = import.meta.glob('../../../data/hub-approuve/*.json', { eager: true });

const parId = (mods: Record<string, any>) =>
  Object.fromEntries(Object.entries(mods).map(([p, m]) => [p.split('/').pop()!.replace('.json', ''), m.default ?? m]));
const P = parId(publics);
const V = parId(prives);
const A = parId(approuves);

// MATIÈRE VALIDÉE (data/evenements.json → `matiere`, projetée depuis Neon) : une information validée UNE fois, dont les destinations ont été
// calculées à la projection. Ici, aucune décision : seul l'ajout dans un bloc EXISTANT désigné (`groupe`) ; l'angle et l'introduction du Hub
// ne sont jamais réécrits, aucune rubrique n'est créée.
const MATIERE: any[] = (evenementsDoc as any).matiere ?? [];
export const matiereHub = (id: string): any[] => MATIERE.filter((m) => (m.destinations?.hubs ?? []).some((h: any) => h.hub === id));
const periodeOuDate = (m: any) => ({ date: m.date ?? m.periode ?? null, date_nature: m.date || m.periode ? 'evenement' : 'inconnue' });
const acteurLisible = (m: any): string => {
  if (m.nature === 'mobilisation') {
    const t = String(m.acteur ?? '').split(', ').filter(Boolean).sort().reverse().join(' et ');
    return t ? t[0].toUpperCase() + t.slice(1) : 'Collectif';
  }
  // Les acteurs de la projection sont normalisés (sans accent) : on les rend lisibles sans rien inventer.
  const LISIBLE: Record<string, string> = { municipalite: 'Municipalité', mairie: 'Mairie', maire: 'Maire', academie: 'Académie', prefecture: 'Préfecture', prefet: 'Préfet', 'education nationale': 'Éducation nationale', rectorat: 'Rectorat', 'conseil municipal': 'Conseil municipal' };
  return m.acteur && !/^(la ville|collectivite|la commune)$/i.test(m.acteur) ? (LISIBLE[m.acteur] ?? m.acteur) : 'Collectivité';
};
/** Carte du bloc « réponses » d'un Hub (contrat Reponses). */
export const carteReponse = (m: any) => ({
  ...periodeOuDate(m), acteur: acteurLisible(m),
  texte: m.portee === 'territoire' ? `${m.libelle} Portée : ${m.territoire ?? 'territoire'}, non propre à une école.` : `${m.libelle}${m.etablissement ? ` (${m.etablissement})` : ''}${m.territoire ? ` Étendue de la mesure : ${m.territoire}, non limitée à cet établissement.` : ''}`,
  source: m.source ? { ...m.source, acces: 'libre' } : null,
});
/** Carte de la rubrique « Paroles et réactions » d'une fiche (contrat Paroles compact) : jamais de citation inventée, position attribuée au média. */
export const carteReaction = (m: any) => ({
  ...periodeOuDate(m), acteur: acteurLisible(m), qualite: m.nature === 'mobilisation' ? 'Mobilisation' : 'Mesure annoncée ou conduite',
  attribution: 'POSITION_ATTRIBUEE', portee: 'affaire', rappel_territorial: m.portee === 'territoire',
  ...(m.portee === 'territoire' ? { a_propos: `Mesure à portée territoriale (${m.territoire ?? 'territoire'}), non propre à cet établissement` }
    : m.territoire ? { a_propos: `Réponse liée à cette affaire ; étendue de la mesure : ${m.territoire}, non limitée à cet établissement` } : {}),
  paraphrase: m.libelle, source: m.source ? { ...m.source, acces: 'libre' } : null,
});

export function chargerHub(id: string): { matiere: any; prive: any | null } {
  const m = A[id] ?? P[id];
  if (!m) throw new Error(`[hub-matiere] data/hub-matiere/${id}.json introuvable`);
  const ajouts = matiereHub(id);
  if (!ajouts.length || !m.reponses) return { matiere: m, prive: V[id] ?? null };
  const reponses = m.reponses.map((g: any) => ({ ...g, items: inserer(g.items, ajouts.filter((x) => x.destinations.hubs.some((h: any) => h.hub === id && h.groupe === g.titre) && !g.items.some((i: any) => String(i.texte).startsWith(x.libelle))).map(carteReponse)) }));
  return { matiere: { ...m, reponses }, prive: V[id] ?? null };
}

// Une information validée prend sa place chronologique dans le bloc (date d'événement, sinon date de parution) ; l'ordre écrit du bloc n'est jamais modifié.
const cleChrono = (i: any): string => i.date ?? i.source?.publie_le ?? '';
function inserer(items: any[], cartes: any[]): any[] {
  const out = [...items];
  for (const x of [...cartes].sort((a, b) => cleChrono(a).localeCompare(cleChrono(b)))) {
    const k = cleChrono(x);
    const i = k ? out.findIndex((y) => cleChrono(y) > k) : -1;
    out.splice(i < 0 ? out.length : i, 0, x);
  }
  return out;
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
