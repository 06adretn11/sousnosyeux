import { fichePubliee } from './fiche';
// =====================================================================
// web/src/lib/revue.ts — BUILD DE REVUE uniquement (SNY_DRAFTS=1).
//
// Les trois fiches de revue (Titon, Delle, Cenon) ne sont atteignables que dans le build de revue.
// Dans le build public (déploiement), REVUE_ACTIVE vaut false : aucune route, aucun lien vers une fiche brouillon.
// La liste est EXPLICITE : jamais « toutes les affaires ».
// =====================================================================
export const REVUE_ACTIVE: boolean = import.meta.env.SNY_DRAFTS === '1' || process.env.SNY_DRAFTS === '1';
export const FICHES_REVUE: string[] = ['POC-09', 'FR-2026-0042', 'FR-2026-0114'];

/** URL de la fiche de revue d'une affaire, ou null (build public, ou affaire hors revue). */
export const urlFicheRevue = (id: string): string | null =>
  REVUE_ACTIVE && FICHES_REVUE.includes(id) ? `/brouillons/revue/${id.toLowerCase()}/` : null;

/** Lien vers la fiche d'une affaire : la page PUBLIQUE si la fiche est approuvée, sinon (build de revue seulement) la page de revue, sinon rien. */
export const urlFiche = (id: string): string | null => (fichePubliee(id) ? `/affaires/${id.toLowerCase()}/` : urlFicheRevue(id));
