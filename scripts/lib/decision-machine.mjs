// =====================================================================
// scripts/lib/decision-machine.mjs — une décision MACHINE n'est pas le choix de l'éditeur.
//
// Une proposition REMPLACÉE, un doublon consolidé ou une reprise reçoivent une décision (REJECT) signée par un agent, pour que leur bouton réponde « déjà
// décidée » sans rien approuver ni rejeter à la place d'Adrien. Le MARQUEUR est `decided_by` (colonne existante) : jamais un nouveau statut ni une migration.
// Tout consommateur qui lit `decision = 'REJECT'` doit distinguer un refus de l'éditeur (apprentissage, déduplication, « une décision humaine n'est pas
// rejouée ») d'une invalidation technique (le signal, ses sources et ses preuves restent réutilisables).
// =====================================================================
export const MACHINE_RE = /non humain|^syst[èe]me|\bagent\b/i;
/** Signature de la décision machine qui REMPLACE une proposition (bouton rendu inerte « déjà décidée », sans approuver ni rejeter à la place de l'éditeur). */
export const DECIDEUR_MACHINE = 'consolidation Discovery 09/11/2026 (agent, non humain)';
/** `decided_by` désigne-t-il un agent plutôt qu'une personne ? */
export const estDecisionMachine = (decidedBy) => MACHINE_RE.test(String(decidedBy || ''));
