// =====================================================================
// web/src/lib/territoires.ts — prévisualisations « 3 hubs réels ».
//
// Source UNIQUE : data/cases.json, l'artefact public compilé depuis Neon.
// Aucune candidate, REVIEW ou affaire sous HOLD n'y figure, et ce module
// REFUSE (échec de build) une sélection qui contiendrait une affaire
// listée dans data/publication-holds.json ou absente de l'artefact.
//
// Les sélections sont EXPLICITES (listes de case_id dans chaque page) :
// aucune requête géographique implicite au rendu.
// =====================================================================

import casesDoc from '../../../data/cases.json';
import holdsDoc from '../../../data/publication-holds.json';

export const memoireCompileeLe: string = (casesDoc as any)._meta.generated_at;

const holds = new Set((holdsDoc as any).holds.map((h: any) => h.case_id));

/**
 * Hub COMPOSÉ publié : sa version approuvée peut citer une affaire devenue gelée (HOLD) ou retirée depuis. Une protection de publication l'emporte sur
 * le maintien de la version : ces affaires sont ÉCARTÉES de l'affichage (jamais d'erreur de build, jamais de contenu devenu interdit).
 */
export const idsAffichables = (ids: string[]): string[] => ids.filter((id) => !holds.has(id) && (casesDoc as any).cases.some((x: any) => x.case_id === id));

export function casesParIds(ids: string[]): any[] {
  return ids.map((id) => {
    if (holds.has(id)) throw new Error(`[territoires] ${id} est sous HOLD : jamais affichable`);
    const c = (casesDoc as any).cases.find((x: any) => x.case_id === id);
    if (!c) throw new Error(`[territoires] ${id} absente de l'artefact public`);
    return c;
  });
}

/**
 * Décision verrouillée (CLAUDE.md §3, « Paywall dans les hubs ») : un hub ne cite
 * que des articles librement accessibles. Ces médias restent sur la fiche de la
 * carte ; ils ne sont ni cités ni liés dans les vues territoriales.
 */
export const MEDIAS_PAYANTS = ['Mediapart', 'Libération'];
export const libre = (media: string) => !MEDIAS_PAYANTS.includes(media);

export const STATUT_LABELS: Record<string, string> = {
  'plainte': 'Plainte',
  'enquête': 'Enquête',
  'mise en examen': 'Mise en examen',
  'procès': 'Procès',
  'condamnation non définitive': 'Condamnation non définitive',
  'condamnation définitive': 'Condamnation définitive',
  'relaxe / non-lieu / classement': 'Relaxe / non-lieu / classement',
  'à qualifier': 'À qualifier',
};

export const statutCat = (s: string): 'red' | 'blue' | 'orange' | 'green' =>
  ['condamnation définitive', 'condamnation non définitive'].includes(s) ? 'red'
  : ['mise en examen', 'enquête', 'procès'].includes(s) ? 'blue'
  : ['plainte', 'à qualifier'].includes(s) ? 'orange'
  : 'green';

/** L'état courant d'une fiche : l'état validé s'il existe, sinon le statut de la fiche. */
export const statutCourant = (c: any): string => c.etat?.statut ?? c.statut_judiciaire;

/** Source la plus récente PAR DATE DE PUBLICATION. Ce n'est pas la date d'un événement. */
export function derniereSource(c: any): { media: string; date: string | null; url: string | null } | null {
  const toutes = [
    ...(c.etat?.sources ?? []).map((s: any) => ({ media: s.media, date: s.date ?? null, url: s.url ?? null })),
    ...(c.sources ?? []).filter((s: any) => libre(s.media)).map((s: any) => ({ media: s.media, date: s.publication_date ?? null, url: s.url ?? null })),
  ];
  const datees = toutes.filter((s) => s.date).sort((a, b) => b.date!.localeCompare(a.date!));
  return datees[0] ?? toutes[0] ?? null;
}
