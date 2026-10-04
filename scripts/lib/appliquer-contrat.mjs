// =====================================================================
// scripts/lib/appliquer-contrat.mjs — le contrat AUTO_APPLICABLE
//
// Fonction PURE : aucune base, aucun réseau, aucun modèle. Elle ne fait que
// vérifier que tout ce qu'il faudrait écrire est explicitement porté par la
// proposition validée. Le moindre doute → NOT_APPLICABLE_AUTOMATICALLY.
// =====================================================================

// event_type admis par état : le couple est explicite ou la proposition n'est pas automatique.
// `voie_de_recours`, `mesure_procédurale`, `mobilisation` n'y figurent jamais.
export const TYPE_ADMIS = {
  'plainte': ['plainte'],
  'enquête': ['enquête'],
  'mise en examen': ['mise_en_examen'],
  'condamnation non définitive': ['décision'],
  'condamnation définitive': ['décision'],
  'relaxe / non-lieu / classement': ['décision'],
};

/**
 * @param p  { aa, av, ap, ed, article_id, facts, applied_event_id, courant, case_id }
 *           (ed = event_date en texte ISO ou null)
 * @param holds  Set des case_id sous HOLD
 * @param opts   { replay } — en replay, une proposition déjà appliquée n'est pas « périmée »
 * @returns { auto: boolean, raisons: string[] }
 */
export function classer(p, holds, { replay = false } = {}) {
  const non = [];
  const f = Array.isArray(p.facts) && p.facts.length === 1 ? p.facts[0] : null;
  if (p.aa !== 'STATE_CHANGE') non.push(`analysis_action=${p.aa ?? 'null'} (changement d’état non porté)`);
  if (!p.ap) non.push('statut_propose absent');
  if (!f) non.push(`${Array.isArray(p.facts) ? p.facts.length : 0} fait(s) au lieu d’un seul`);
  if (f) {
    if (f.resulting_state !== p.ap) non.push(`resulting_state=${f.resulting_state} ≠ statut_propose`);
    if (!(TYPE_ADMIS[p.ap] || []).includes(f.event_type)) non.push(`event_type « ${f.event_type} » non admis pour « ${p.ap} »`);
    if (!f.evidence?.length) non.push('evidence vide');
    if (f.event_date && p.ed && f.event_date !== p.ed) non.push(`date du fait ${f.event_date} ≠ event_date ${p.ed}`);
  }
  if (!p.article_id) non.push('article absent');
  if (!p.applied_event_id && p.av !== p.courant) non.push(`fiche en « ${p.courant} », proposition partie de « ${p.av} » (périmée)`);
  if (holds.has(p.case_id)) non.push('HOLD actif sur la fiche');
  if (p.applied_event_id && !replay) non.push('déjà appliquée');
  return { auto: non.length === 0, raisons: non };
}
