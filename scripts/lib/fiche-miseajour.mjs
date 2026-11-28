// =====================================================================
// scripts/lib/fiche-miseajour.mjs — quels enrichissements de la Maintenance valent une MISE À JOUR de fiche ? Fonction PURE (aucun réseau, aucune base).
//
// Le maillon manquant : un événement judiciaire nouveau et étayé, SANS changement de statut, ne produisait qu'une information sans bouton ; la fiche
// publiée ne bougeait jamais. Ici on ne décide que de la SÉLECTION ; la génération (generer-fiche), l'aperçu, la proposition (proposer-fiche), le clic,
// la promotion et la vérification du site sont ceux qui existent déjà.
// =====================================================================
import { urlsDe, MEDIAS_PAYANTS } from './fiche-page.mjs';
import { estDecisionMachine } from './decision-machine.mjs';

/** Types d'événement de la PROCÉDURE judiciaire (une suspension, une mobilisation, une réaction publique ou une réponse d'institution n'en sont pas). */
export const TYPES_JUDICIAIRES = new Set(['plainte', 'enquête', 'garde_à_vue', 'mise_en_examen', 'audience', 'délibéré', 'décision', 'voie_de_recours', 'mesure_procédurale']);
/** Un fait de la proposition est un événement JUDICIAIRE étayé : citation littérale + type de procédure. */
export const faitJudiciaire = (f) => !!f && !f.mesure && Array.isArray(f.evidence) && f.evidence.length > 0 && TYPES_JUDICIAIRES.has(f.event_type);

/**
 * @param {{lignes:{k:string, case_id:string, url:string|null, media:string|null, pd:string|null, rat:string|null, decision:string|null, facts:object[]}[],
 *          publie:Map<string,{d:object}>, approuvee:(id:string)=>boolean, holds:Set<string>, deja:Set<string>}} o
 * @returns {{groupes:{case_id:string, sources:{url:string,media:string|null,publication_date:string|null}[], ks:string[]}[], ecartees:{k:string, motif:string}[]}}
 */
export function selectionnerMisesAJour({ lignes, publie, approuvee, holds, deja, tousTypes = false }) {
  const ecartees = [], par = new Map();
  for (const l of lignes) {
    const ecarte = (motif) => ecartees.push({ k: l.k, case_id: l.case_id, motif });
    if (deja.has(l.k)) { ecarte('DEJA_TRAITEE'); continue; }
    // Une décision MACHINE (proposition remplacée, doublon consolidé) n'est pas le refus de l'éditeur : l'article reste écarté (la proposition qui la remplace
    // porte ses faits) mais le motif ne le présente jamais comme un désaccord éditorial.
    if (l.decision === 'REJECT') { ecarte(estDecisionMachine(l.decideur) ? 'INVALIDEE_PAR_DECISION_MACHINE' : 'REFUSEE_PAR_L_EDITEUR'); continue; }
    if (l.rat !== 'OK') { ecarte('RATTACHEMENT_INSUFFISANT'); continue; }
    if (holds.has(l.case_id)) { ecarte('HOLD'); continue; }
    const pub = publie.get(l.case_id);
    if (!pub) { ecarte('PAS_DE_FICHE_PUBLIQUE'); continue; }
    if (!approuvee(l.case_id)) { ecarte('VERSION_PUBLIQUE_NON_APPROUVEE'); continue; }
    // tousTypes : REPRISE après un « À revoir » de l'éditeur — toute analyse rattachée du lot (réaction, mobilisation, déclaration…) est TRANSMISE à la génération, dont les gardes (pertinence,
    // citation littérale, acteurs publiables) décident ce qui entre ; hors de ce cas, seul un événement de procédure déclenche une mise à jour.
    // Une matière ACCEPTÉE par l'éditeur (parole, réaction, mesure) n'a aucune autre voie vers la fiche : le GO ne l'écrit pas (elle reste dans state_proposals.facts).
    // Audit du 28/11/2026 : 18 enrichissements acceptés sans effet, écartés AUCUN_EVENEMENT_JUDICIAIRE. Elle déclenche une VERSION CANDIDATE (le GO sur la parole n'approuve
    // pas la fiche : la nouvelle version repasse par sa propre proposition) ; sa source peut déjà être listée (la parole, elle, n'y est pas forcément).
    const accepteeParEditeur = l.decision === 'ACCEPT' && !estDecisionMachine(l.decideur);
    if (!tousTypes && !accepteeParEditeur && !(l.facts || []).some(faitJudiciaire)) { ecarte('AUCUN_EVENEMENT_JUDICIAIRE'); continue; }
    if (!l.url) { ecarte('SOURCE_SANS_ADRESSE'); continue; }
    if (MEDIAS_PAYANTS.includes(l.media)) { ecarte('SOURCE_PAYANTE'); continue; }
    if (!accepteeParEditeur && urlsDe(pub.d).some((s) => s.url === l.url)) { ecarte('SOURCE_DEJA_DANS_LA_FICHE'); continue; }
    const g = par.get(l.case_id) || par.set(l.case_id, { case_id: l.case_id, sources: [], ks: [] }).get(l.case_id);
    g.ks.push(l.k);
    if (!g.sources.some((s) => s.url === l.url)) g.sources.push({ url: l.url, media: l.media, publication_date: l.pd });
  }
  return { groupes: [...par.values()], ecartees };
}

/**
 * ÉCART D'ÉTAT : un changement d'état ACCEPTÉ par l'éditeur et APPLIQUÉ (case_events.statut_apres, donc la carte) sur une affaire dont la fiche APPROUVÉE
 * affiche encore l'état antérieur. Ni `selectionnerMisesAJour` (analyses ENRICHMENT seulement) ni proposer-premieres-fiches (affaires SANS fiche) ne le voyaient :
 * FR-2026-0146 (Montpellier) — GO du 27/11 appliqué, carte « mise en examen », fiche « enquête » depuis le 13/11, source déjà listée (SOURCE_DEJA_DANS_LA_FICHE).
 * La source apportée à la génération est l'article de l'événement appliqué (même mécanisme que les premières fiches) ; aucun état n'est déduit ici.
 * Un essai bloqué n'est retenté qu'après `retenteH` heures (nouvelles sources, générateur corrigé) ; une proposition faite n'est jamais refaite pour le même événement.
 * @param {{cartes:Map<string,string>, publie:Map<string,{d:object}>, evenements:{event_id:string, case_id:string, statut_apres:string, url:string|null, media:string|null, pd:string|null}[],
 *          approuvee:(id:string)=>boolean, holds:Set<string>, essais:Map<string,{resultat:string, at:Date}>, now?:Date, retenteH?:number}} o
 */
export function selectionnerEcartsEtat({ cartes, publie, evenements, approuvee, holds, essais, now = new Date(), retenteH = 24 }) {
  const groupes = [], ecartees = [];
  for (const [id, pub] of publie) {
    const carte = cartes.get(id), fiche = pub.d?.statut_affiche;
    if (!carte || !fiche || carte === fiche) continue;
    const ecarte = (motif) => ecartees.push({ k: `etat:${id}`, case_id: id, motif });
    if (holds.has(id)) { ecarte('HOLD'); continue; }
    if (!approuvee(id)) { ecarte('VERSION_PUBLIQUE_NON_APPROUVEE'); continue; }
    const evs = evenements.filter((e) => e.case_id === id && e.statut_apres === carte);
    if (!evs.length) { ecarte('ECART_ETAT_SANS_EVENEMENT_APPLIQUE'); continue; }
    const k = `etat:${evs.map((e) => e.event_id).sort().join('+')}`;
    const essai = essais.get(k);
    if (essai && (!['bloquee', 'erreur', 'delai'].includes(essai.resultat) || now - new Date(essai.at) < retenteH * 3600e3)) { ecarte('DEJA_TRAITEE'); continue; }
    const sources = [];
    for (const e of evs) if (e.url && !MEDIAS_PAYANTS.includes(e.media) && !sources.some((s) => s.url === e.url)) sources.push({ url: e.url, media: e.media, publication_date: e.pd });
    if (!sources.length) { ecarte('ECART_ETAT_SANS_SOURCE_LISIBLE'); continue; }
    groupes.push({ case_id: id, sources, ks: [k], ecart: { fiche, carte } });
  }
  return { groupes, ecartees };
}
