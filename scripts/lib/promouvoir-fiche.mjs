// =====================================================================
// scripts/lib/promouvoir-fiche.mjs — étape finale du circuit : un dossier GÉNÉRÉ et APPROUVÉ (empreinte) devient la matière éditoriale de la fiche.
//
// Fonction PURE : elle décide, elle n'écrit rien. Refus par défaut (échec fermé) : la promotion n'a lieu que si
//   - la fiche générée existe, est proposable (READY / A_REVOIR) et son empreinte est celle du dossier à promouvoir ;
//   - la DERNIÈRE approbation d'Adrien (revue « [Fiche approuvée …] ») porte exactement cette empreinte ;
//   - l'affaire est publique, hors HOLD, et n'a pas déjà un dossier (jamais d'écrasement d'une rédaction humaine) ;
// Le dossier est écrit à l'identique : son empreinte dans data/hub-matiere/isoles.json est celle qui a été approuvée, donc la page devient
// publique par le circuit existant (projection → QA → déploiement), sans second GO.
// =====================================================================
import { hashDossier, ficheApprouvee } from './fiche-page.mjs';

/**
 * @param {{id:string, generee:object|null, revues:object[], isoles:{dossiers:object}, hubs?:Record<string,object>[], cases:{case_id:string}[], holds:Set<string>}} o
 * @returns {{ok:boolean, motif?:string, hash?:string, dossier?:object}}
 */
export function decider({ id, generee, revues, isoles, hubs = [], cases, holds }) {
  if (!generee?.proposable) return { ok: false, motif: 'FICHE_GENEREE_ABSENTE_OU_NON_PROPOSABLE' };
  if (!cases.some((c) => c.case_id === id)) return { ok: false, motif: 'AFFAIRE_NON_PUBLIQUE' };
  if (holds.has(id)) return { ok: false, motif: 'HOLD' };
  if ([isoles, ...hubs].some((m) => m?.dossiers?.[id])) return { ok: false, motif: 'DOSSIER_DEJA_PRESENT_PAS_D_ECRASEMENT' };
  const hash = hashDossier(generee.d);
  const approuve = ficheApprouvee(revues, id);
  if (!approuve) return { ok: false, motif: 'AUCUNE_APPROBATION', hash };
  if (approuve !== hash) return { ok: false, motif: 'EMPREINTE_APPROUVEE_DIFFERENTE', hash };
  return { ok: true, hash, dossier: generee.d };
}

/** Ajoute le dossier à `isoles` (copie) et vérifie que l'empreinte écrite est celle approuvée. */
export function inscrire(isoles, id, dossier, hash) {
  const suite = { ...isoles, dossiers: { ...isoles.dossiers, [id]: dossier } };
  if (hashDossier(JSON.parse(JSON.stringify(suite.dossiers[id]))) !== hash) throw new Error('empreinte altérée par l’écriture');
  return suite;
}
