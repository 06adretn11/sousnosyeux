// =====================================================================
// scripts/lib/fiche-miseajour.mjs — quels enrichissements de la Maintenance valent une MISE À JOUR de fiche ? Fonction PURE (aucun réseau, aucune base).
//
// Le maillon manquant : un événement judiciaire nouveau et étayé, SANS changement de statut, ne produisait qu'une information sans bouton ; la fiche
// publiée ne bougeait jamais. Ici on ne décide que de la SÉLECTION ; la génération (generer-fiche), l'aperçu, la proposition (proposer-fiche), le clic,
// la promotion et la vérification du site sont ceux qui existent déjà.
// =====================================================================
import { urlsDe, MEDIAS_PAYANTS } from './fiche-page.mjs';

/** Types d'événement de la PROCÉDURE judiciaire (une suspension, une mobilisation, une réaction publique ou une réponse d'institution n'en sont pas). */
export const TYPES_JUDICIAIRES = new Set(['plainte', 'enquête', 'garde_à_vue', 'mise_en_examen', 'audience', 'délibéré', 'décision', 'voie_de_recours', 'mesure_procédurale']);
/** Un fait de la proposition est un événement JUDICIAIRE étayé : citation littérale + type de procédure. */
export const faitJudiciaire = (f) => !!f && !f.mesure && Array.isArray(f.evidence) && f.evidence.length > 0 && TYPES_JUDICIAIRES.has(f.event_type);

/**
 * @param {{lignes:{k:string, case_id:string, url:string|null, media:string|null, pd:string|null, rat:string|null, decision:string|null, facts:object[]}[],
 *          publie:Map<string,{d:object}>, approuvee:(id:string)=>boolean, holds:Set<string>, deja:Set<string>}} o
 * @returns {{groupes:{case_id:string, sources:{url:string,media:string|null,publication_date:string|null}[], ks:string[]}[], ecartees:{k:string, motif:string}[]}}
 */
export function selectionnerMisesAJour({ lignes, publie, approuvee, holds, deja }) {
  const ecartees = [], par = new Map();
  for (const l of lignes) {
    const ecarte = (motif) => ecartees.push({ k: l.k, case_id: l.case_id, motif });
    if (deja.has(l.k)) { ecarte('DEJA_TRAITEE'); continue; }
    if (l.decision === 'REJECT') { ecarte('REFUSEE_PAR_L_EDITEUR'); continue; }
    if (l.rat !== 'OK') { ecarte('RATTACHEMENT_INSUFFISANT'); continue; }
    if (holds.has(l.case_id)) { ecarte('HOLD'); continue; }
    const pub = publie.get(l.case_id);
    if (!pub) { ecarte('PAS_DE_FICHE_PUBLIQUE'); continue; }
    if (!approuvee(l.case_id)) { ecarte('VERSION_PUBLIQUE_NON_APPROUVEE'); continue; }
    if (!(l.facts || []).some(faitJudiciaire)) { ecarte('AUCUN_EVENEMENT_JUDICIAIRE'); continue; }
    if (!l.url) { ecarte('SOURCE_SANS_ADRESSE'); continue; }
    if (MEDIAS_PAYANTS.includes(l.media)) { ecarte('SOURCE_PAYANTE'); continue; }
    if (urlsDe(pub.d).some((s) => s.url === l.url)) { ecarte('SOURCE_DEJA_DANS_LA_FICHE'); continue; }
    const g = par.get(l.case_id) || par.set(l.case_id, { case_id: l.case_id, sources: [], ks: [] }).get(l.case_id);
    g.ks.push(l.k);
    if (!g.sources.some((s) => s.url === l.url)) g.sources.push({ url: l.url, media: l.media, publication_date: l.pd });
  }
  return { groupes: [...par.values()], ecartees };
}
