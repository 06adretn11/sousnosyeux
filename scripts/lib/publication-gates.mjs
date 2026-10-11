// =====================================================================
// scripts/lib/publication-gates.mjs — une affaire VALIDÉE par l'éditeur peut-elle devenir publique SANS second GO ? Fonction PURE.
//
// Aucun raisonnement éditorial nouveau : ce sont les garde-fous déjà en vigueur (publier-affaire.mjs, QA, HOLD), réunis en un
// seul endroit pour que la décision soit identique à chaque passage et testable sans base ni réseau.
//   → { etat: 'NON_VALIDEE' | 'READY' | 'BLOCKED', raisons: [...] }
// NON_VALIDEE = aucune décision humaine de création : ni publiée, ni signalée comme bloquée (ce n'est pas un oubli).
// Les `raisons` ne contiennent jamais de nom ni de lieu (les logs CI d'un dépôt public sont publics).
// =====================================================================

// Revue qui vaut DÉCISION DE CRÉER/VALIDER l'affaire : Decision Pack (« VALIDATED — … ») ou clic Telegram (« [Discovery-auto:…] VALIDATE|CREATE »).
// Un rattachement de sources (« RAPPROCHER », « ATTACH », « RATTACHER ») ne décide PAS de la publication de la fiche.
export const REVUE_VALIDATION = /^(?:\[Discovery-auto:[0-9a-f]{8}\]\s+(?:VALIDATE|CREATE)\b|VALIDATED\b)/;
const REVUE_HUMAINE = /^Adrien/;

/**
 * @param {object} c        ligne cases (case_id, publication_status, fiabilite_info_10, lat, lng, statut_judiciaire, commune, departement,
 *                          etablissement, type_structure, role_mis_en_cause, enfants_concernes_public, crit_statut_clair)
 * @param {object} ctx      { revues: [{reviewed_by, decision, comment}] (ordre chronologique), sources: [{url, media}],
 *                            holds: Set<case_id>, autres: [{case_id, commune, type_structure, role_mis_en_cause}] }
 */
export function evaluerPublication(c, ctx) {
  if (c.publication_status !== 'candidate') return { etat: 'NON_VALIDEE', raisons: ['pas une candidate'] };
  const revues = ctx.revues || [];
  const humaines = revues.filter((r) => REVUE_HUMAINE.test(r.reviewed_by || ''));
  // `ctx.depuis` : seules les validations POSTÉRIEURES à l'activation de l'autonomie valent GO de publication. Les validations
  // antérieures étaient des « CRÉER (candidate, non publiée) » : elles ne sont jamais publiées par ce mécanisme (arriéré).
  const apresSeuil = (r) => !ctx.depuis || new Date(r.reviewed_at) >= ctx.depuis;
  const decisives = humaines.filter((r) => r.decision === 'retirer' || r.decision === 'à corriger'
    || (r.decision === 'validé' && REVUE_VALIDATION.test(r.comment || '') && apresSeuil(r)));
  const derniere = decisives[decisives.length - 1];
  if (!derniere) return { etat: 'NON_VALIDEE', raisons: ['aucune décision humaine de validation'] };

  const raisons = [];
  if (derniere.decision !== 'validé') raisons.push(`dernière décision humaine : « ${derniere.decision} »`);
  if (revues.some((r) => r.decision === 'retirer')) raisons.push('une revue « retirer » existe');
  if (ctx.holds?.has(c.case_id)) raisons.push('sous HOLD de publication');
  if (!(c.fiabilite_info_10 >= 8)) raisons.push(`fiabilité ${c.fiabilite_info_10} < 8`);
  if (!c.statut_judiciaire || c.statut_judiciaire === 'à qualifier' || c.crit_statut_clair === false) raisons.push('statut judiciaire non établi');
  if (!c.etablissement) raisons.push('établissement absent');
  if (!c.enfants_concernes_public) raisons.push('mention « enfants concernés » absente');
  const srcs = (ctx.sources || []).filter((s) => /^https?:\/\/[^\s.]+\.[^\s]+$/.test(s.url || '') && !/\.\.\.$|…$/.test(s.url) && s.media);
  if (!srcs.length) raisons.push('aucune source exploitable rattachée');
  const dup = (ctx.autres || []).filter((o) => o.case_id !== c.case_id && o.commune === c.commune
    && o.type_structure === c.type_structure && o.role_mis_en_cause === c.role_mis_en_cause);
  if (dup.length) raisons.push(`doublon possible avec ${dup.map((d) => d.case_id).join(', ')}`);
  return raisons.length ? { etat: 'BLOCKED', raisons } : { etat: 'READY', raisons: [] };
}

const avecPoint = (c) => typeof c.lat === 'number' && typeof c.lng === 'number';

/**
 * État de réconciliation d'UNE affaire, depuis Neon + artefact. Fonction PURE (testée sans base ni réseau).
 *   ctx = { revues, sources, holds:Set, autres:[...], artefact:Map<case_id, entrée>, depuis?:Date }
 *   → null (rien à dire : non validée) | { etat: HOLD|BLOCKED|IN_ARTEFACT|NEEDS_PROJECTION|READY, raisons, alerter? }
 * Une affaire sous HOLD, retirée ou sans GO n'est JAMAIS READY, même présente dans `cases_public`.
 */
export function etatPublication(c, ctx) {
  if (c.publication_status === 'publiée') {
    if (ctx.holds?.has(c.case_id)) return { etat: 'HOLD', raisons: ['gelée : aucune mutation publique automatique'] };
    const dansArtefact = ctx.artefact?.get(c.case_id);
    if (dansArtefact) return avecPoint(dansArtefact)
      ? { etat: 'IN_ARTEFACT', raisons: [] }
      : { etat: 'BLOCKED', raisons: ['dans l’artefact sans coordonnées : le front ne l’affiche pas'] };
    const raisons = [];
    if (!(c.fiabilite_info_10 >= 8)) raisons.push(`publiée en base mais fiabilité ${c.fiabilite_info_10} < 8 : jamais projetée`);
    if (c.lat === null || c.lng === null) raisons.push('aucune coordonnée');
    return raisons.length ? { etat: 'BLOCKED', raisons } : { etat: 'NEEDS_PROJECTION', raisons: [] };
  }
  const g = evaluerPublication(c, ctx);
  if (g.etat === 'NON_VALIDEE') return null;
  // Une affaire validée mais bloquée est SIGNALÉE (une fois) ; « à corriger » / « retirer » sont des décisions humaines voulues : pas d'alerte.
  return g.etat === 'BLOCKED' && !g.raisons[0].startsWith('dernière décision humaine') ? { ...g, alerter: true } : g;
}
