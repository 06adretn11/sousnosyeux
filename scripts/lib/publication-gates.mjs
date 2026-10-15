// =====================================================================
// scripts/lib/publication-gates.mjs — EXAMEN d'une candidate validée + état de réconciliation d'une affaire. Fonctions PURES.
//
// Aucun raisonnement éditorial nouveau : ce sont les garde-fous déjà en vigueur (publier-affaire.mjs, QA, HOLD), réunis en un
// seul endroit pour que la décision soit identique à chaque passage et testable sans base ni réseau.
//   evaluerPublication → { etat: 'NON_VALIDEE' | 'READY' | 'BLOCKED', raisons } : READY = « éligible, examinée » — JAMAIS une autorisation.
// Une validation de CRÉATION (VALIDATE / CREATE) ne vaut JAMAIS GO de publication : seul l'acte existant de publier-affaire.mjs --go
// (revue « [Publication AAAA-MM-JJ] GO d'Adrien : … ») est une autorisation explicite (voir goPublication).
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
  const decisives = humaines.filter((r) => r.decision === 'retirer' || r.decision === 'à corriger'
    || (r.decision === 'validé' && REVUE_VALIDATION.test(r.comment || '')));
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

// GO PUBLICATION explicite = la revue que publier-affaire.mjs --go consigne : « [Publication AAAA-MM-JJ] GO d'Adrien : « <mot> » ».
// Le texte « Publication automatique SNY » est celui qu'une automatisation s'était écrit à elle-même : jamais une autorisation.
export const REVUE_GO_PUBLICATION = /^\[Publication \d{4}-\d{2}-\d{2}\] GO d'Adrien : « (?!Publication automatique SNY)/;

/** Dernier GO publication explicite d'Adrien, postérieur à `depuis` (activation) quand elle est fournie ; sinon null. */
export function goPublication(revues = [], depuis = null) {
  const go = revues.filter((r) => /^Adrien/.test(r.reviewed_by || '') && r.decision === 'validé' && REVUE_GO_PUBLICATION.test(r.comment || '')
    && (!depuis || new Date(r.reviewed_at) >= depuis));
  return go[go.length - 1] || null;
}

/**
 * État de réconciliation d'UNE affaire, depuis Neon + artefact. Fonction PURE (testée sans base ni réseau).
 *   ctx = { revues, sources, holds:Set, autres:[...], artefact:Map<case_id, entrée>, depuis?:Date }
 *   → null (rien à dire : candidate non validée) | { etat: HOLD | BLOCKED | NO_GO | IN_ARTEFACT | NEEDS_PROJECTION | AWAITING_GO, raisons }
 * Une candidate n'est JAMAIS publiée ici (AWAITING_GO = examinée, attend un GO). Une affaire sous HOLD, retirée ou sans GO explicite n'est
 * JAMAIS projetée, même présente dans `cases_public`.
 */
export function etatPublication(c, ctx) {
  if (c.publication_status === 'publiée') {
    if (ctx.holds?.has(c.case_id)) return { etat: 'HOLD', raisons: ['gelée : aucune mutation publique automatique'] };
    const dansArtefact = ctx.artefact?.get(c.case_id);
    if (dansArtefact) return avecPoint(dansArtefact)
      ? { etat: 'IN_ARTEFACT', raisons: [] }
      : { etat: 'BLOCKED', raisons: ['dans l’artefact sans coordonnées : le front ne l’affiche pas'] };
    const raisons = [];
    if ((ctx.revues || []).some((r) => r.decision === 'retirer')) raisons.push('une revue « retirer » existe');
    if (!(c.fiabilite_info_10 >= 8)) raisons.push(`publiée en base mais fiabilité ${c.fiabilite_info_10} < 8 : jamais projetée`);
    if (c.lat === null || c.lng === null) raisons.push('aucune coordonnée');
    if (raisons.length) return { etat: 'BLOCKED', raisons };
    if (!goPublication(ctx.revues, ctx.depuis)) return { etat: 'NO_GO', raisons: ['publiée en base sans GO publication explicite (postérieur à l’activation) : jamais projetée'] };
    return { etat: 'NEEDS_PROJECTION', raisons: [] };
  }
  const g = evaluerPublication(c, ctx);
  if (g.etat === 'NON_VALIDEE') {
    // Une validation de création qui n'est PAS d'Adrien (ex. « Claude — règle conditionnelle ») ne vaut pas validation, mais elle ne doit pas
    // non plus disparaître : sans cette branche l'affaire sortait de tous les états, silencieusement.
    const attribuee = (ctx.revues || []).some((r) => r.decision === 'validé' && REVUE_VALIDATION.test(r.comment || '') && !REVUE_HUMAINE.test(r.reviewed_by || ''));
    return attribuee ? { etat: 'DECISION_CONFLICT', raisons: ['validation de création attribuée à un autre auteur qu’Adrien : à confirmer par Adrien'] } : null;
  }
  return g.etat === 'READY' ? { etat: 'AWAITING_GO', raisons: ['examinée, éligible : attend un GO publication explicite'] } : g;
}

/** Dernière décision humaine qui décide (retirer / à corriger / validation de création), ou null. */
export function derniereDecision(revues = []) {
  const d = revues.filter((r) => REVUE_HUMAINE.test(r.reviewed_by || '') && (r.decision === 'retirer' || r.decision === 'à corriger'
    || (r.decision === 'validé' && REVUE_VALIDATION.test(r.comment || ''))));
  return d.length ? d[d.length - 1].decision : null;
}

/**
 * CATÉGORIE DE DIAGNOSTIC d'une affaire (jamais persistée) : où en est-elle, et que faut-il d'Adrien ? Fonction PURE.
 *   ctx = ctx d'etatPublication + { proposition: null | { decision: null|'ACCEPT'|'REJECT'|'REVIEW_REQUIRED' } (proposition « PUBLIER ? » de l'affaire),
 *                                   localisable: boolean|null (null = non évalué), servie: boolean|null (null = site non contrôlé) }
 * @returns {{ categorie: 'AWAITING_GO'|'MISSING_PROPOSAL'|'BLOCKED'|'GO_STUCK'|'REVIEW'|'HOLD'|'REJECT'|'DECISION_CONFLICT'|'PUBLIC'|'NON_VALIDEE', raisons: string[], action: string }}
 */
export function categorieDiagnostic(c, ctx) {
  const rec = (categorie, raisons = [], action = '') => ({ categorie, raisons, action });
  if (c.publication_status === 'retirée') return rec('REJECT', ['affaire retirée'], 'aucune');
  const e = etatPublication(c, ctx);
  if (!e) return rec('NON_VALIDEE');
  if (e.etat === 'HOLD') return rec('HOLD', e.raisons, 'lever le HOLD (décision d’Adrien) ou laisser');
  if (e.etat === 'DECISION_CONFLICT') return rec('DECISION_CONFLICT', e.raisons, 'Adrien confirme ou infirme la validation');
  if (e.etat === 'NO_GO') return rec('DECISION_CONFLICT', e.raisons, 'Adrien confirme la publication (GO) ou la retire');
  if (e.etat === 'NEEDS_PROJECTION') return rec('GO_STUCK', ['GO enregistré, absente de l’artefact public'], 'relancer la réconciliation (automatique)');
  if (e.etat === 'IN_ARTEFACT') return ctx.servie === false
    ? rec('GO_STUCK', ['dans l’artefact mais pas (ou pas à l’identique) sur le site servi'], 'vérifier le build Cloudflare')
    : rec('PUBLIC');
  if (e.etat === 'BLOCKED') {
    const d = derniereDecision(ctx.revues);
    if (d === 'à corriger') return rec('REVIEW', e.raisons, 'réexamen (Maintenance) puis nouvelle validation');
    if (d === 'retirer') return rec('REJECT', e.raisons, 'aucune');
    if (e.raisons.some((r) => /HOLD/.test(r))) return rec('HOLD', e.raisons, 'lever le HOLD (décision d’Adrien) ou laisser');
    return rec('BLOCKED', e.raisons, 'corriger la cause du blocage');
  }
  // AWAITING_GO : examinée, éligible
  const p = ctx.proposition;
  if (p?.decision === 'ACCEPT') return rec('GO_STUCK', ['GO donné sur la proposition, affaire encore candidate'], 'relancer la réconciliation / publier-affaire');
  if (p?.decision === 'REVIEW_REQUIRED') return rec('REVIEW', ['proposition de publication mise en réexamen'], 'réexamen (Maintenance)');
  if (p && p.decision === null) return rec('AWAITING_GO', e.raisons, 'Adrien : GO publication sur la proposition active');
  if (ctx.localisable === false) return rec('BLOCKED', ['aucune localisation fiable (commune ambiguë, composée ou inconnue)'], 'fournir un point de carte documenté');
  return rec('MISSING_PROPOSAL', ['validée et éligible, aucune proposition « PUBLIER ? » active'], 'proposer-publication.mjs --ids <id> --ecrire (envoie ensuite une proposition : GO d’Adrien)');
}
