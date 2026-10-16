// =====================================================================
// scripts/lib/matiere-validee.mjs — la MÉMOIRE UNIQUE des informations validées, lue par toutes les surfaces (fiche, Hub, diagnostic).
//
// UNE information = UN fait structuré dans `state_proposals.facts` (nature, libellé fermé, acteur, date/période, portée, réalisation, citation),
// validé UNE fois (decision = ACCEPT). Aucune copie par surface :
//   portée « affaire » / « établissement » → écrite AUSSI en `case_events` à la validation (c'est la ligne que project-evenements projette
//                                           vers la fiche et le Hub) ; le fait garde le lien (applied_event_id) : période, acteur, citation ;
//   portée « territoire »                  → reste dans `state_proposals` (case_events exige une affaire et ne porte pas de portée) ; ce lecteur
//                                           la rend à un Hub ou à un futur diagnostic territorial, et en rappel attribué dans une fiche.
// Fonctions de lecture seule ; la DESTINATION est une question de lecture, jamais une seconde validation.
// =====================================================================
import { createHash } from 'node:crypto';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Où une information est-elle utile au lecteur ? (destination ≠ portée) */
export function surfacesDe(item) {
  return item.portee === 'territoire'
    ? { fiche: 'rappel attribué (« mesure de la collectivité, non propre à cet établissement »)', hub: 'matière du territoire' }
    : { fiche: 'détail de l’affaire (déroulé, réactions)', hub: 'contribue à la synthèse du territoire' };
}

/**
 * Informations VALIDÉES (ACCEPT), uniques, avec leur provenance.
 * @param sql   client Neon
 * @param {{case_id?:string, commune?:string, departement?:string}} filtre  une affaire OU un périmètre (commune / département)
 * @returns {Promise<object[]>} items : { proposal_id, case_id, nature, mesure, libelle, realisation, portee, acteur, territoire, date, periode, citation, source, applied_event_id }
 */
export async function lireMatiereValidee(sql, { case_id = null, commune = null, departement = null } = {}) {
  const rows = await sql`
    select p.proposal_id::text proposal_id, p.case_id, p.applied_event_id::text applied_event_id, f.fait, c.commune, c.departement, a.media, a.url, a.publication_date::text publie_le
      from state_proposals p
      join cases c using (case_id)
      left join articles a on a.article_id = p.article_id
      cross join lateral jsonb_array_elements(p.facts) as f(fait)
     where p.decision = 'ACCEPT' and f.fait ? 'libelle_public'
     order by p.decided_at, p.proposal_id`;
  const items = rows.map((r) => ({
    // Identité STABLE du fait (affaire + libellé fermé + jour ou période : deux rassemblements de jours différents sont deux faits) : ne change pas au rejeu, n'expose aucun identifiant interne.
    id: createHash('sha1').update(`${r.case_id}|${r.fait.libelle_public}|${r.fait.event_date ?? r.fait.event_period ?? ""}`).digest('hex').slice(0, 12),
    proposal_id: r.proposal_id, case_id: r.case_id, nature: r.fait.nature || 'mesure', mesure: r.fait.mesure, libelle: r.fait.libelle_public,
    realisation: r.fait.realisation ?? 'inconnue', portee: r.fait.portee || 'établissement', acteur: r.fait.acteur_nomme || r.fait.acteur || null, territoire: r.fait.territoire || null,
    date: r.fait.event_date || null, periode: r.fait.event_period || null, citation: (r.fait.evidence || [])[0] || null,
    source: r.url ? { media: r.media, url: r.url, publie_le: r.publie_le } : null, applied_event_id: r.applied_event_id, event_id: r.applied_event_id, _commune: r.commune, _dep: r.departement,
  }));
  // Une information validée plusieurs fois (deux articles, même libellé, même affaire, MÊME jour ou période) ne compte qu'une fois : la plus ancienne fait foi.
  // Deux événements de jours différents au libellé identique (deux rassemblements) sont deux faits.
  const vus = new Set();
  const uniques = items.filter((i) => { const k = `${i.case_id}|${i.libelle}|${i.date ?? i.periode ?? ''}`; if (vus.has(k)) return false; vus.add(k); return true; });
  return uniques.filter((i) => (case_id ? i.case_id === case_id : true)
    && (commune ? norm(i._commune) === norm(commune) || (i.territoire && norm(i.territoire) === norm(commune)) : true)
    && (departement ? norm(i._dep) === norm(departement) || (i.territoire && norm(i.territoire) === norm(departement)) : true))
    .map(({ _commune, _dep, ...i }) => i);
}

/**
 * Matière à restituer dans la FICHE d'une affaire : les informations de CETTE affaire (rattachement explicite par la source), dont ses rappels
 * territoriaux attribués. Jamais les informations d'une autre affaire du même département. Aucune écriture, aucune ressaisie.
 */
export async function matierePourFiche(sql, c) {
  const siennes = await lireMatiereValidee(sql, { case_id: c.case_id });
  return { propres: siennes.filter((i) => i.portee !== 'territoire'), rappelTerritorial: siennes.filter((i) => i.portee === 'territoire') };
}
