// =====================================================================
// scripts/lib/garde-creation.mjs — « cette affaire existe-t-elle déjà ? », posé AU MOMENT de la création, contre l'état ACTUEL de la base.
//
// Fonctions PURES : aucune base, aucun réseau, aucun modèle. Le chargement des candidats est fait par l'appelant (appliquer-nouvelles-affaires.mjs).
//
// POURQUOI. Une proposition est qualifiée au moment de l'ÉMISSION (rapprochement avec les affaires connues, propositions jumelles). Entre l'émission
// et l'application du clic humain, la base change : une proposition sœur peut avoir été validée puis créée. Cas réel (12/11/2026, Montpellier) :
// deux propositions émises à 24 secondes d'écart pour la même école, validées à deux minutes d'intervalle, appliquées l'une après l'autre → deux
// fiches publiées pour une affaire. Rien, à l'application, ne relisait la base : la seconde création ignorait la première.
//
// DOCTRINE (celle de rapprochement-garde.mjs, inchangée) :
//   · le nom et la commune d'un établissement ne suffisent jamais à fusionner (un même établissement peut porter plusieurs affaires) ;
//   · une contradiction étayée (autre établissement nommé, autre rôle précis incompatible, autre nombre de personnes) = affaire DISTINCTE → création ;
//   · « même affaire » CERTAINE = verdict « même » de comparerSignaux ET au moins UNE PAGE CITÉE EN COMMUN (le même article fonde les deux) ;
//   · tout le reste qui n'est pas contredit (même affaire sans page commune, ambigu) = REVUE EXPLICITE : ni création, ni rattachement ;
//   · plusieurs affaires certaines = ambiguïté (jamais de fusion par transitivité) = REVUE ;
//   · une décision antérieure de maintien séparé (`exclus`) est respectée.
// =====================================================================
import { comparerSignaux } from './rapprochement-garde.mjs';
import { canonique } from './preuve-claim.mjs';

const NON_NOMME = /non nomm|non pr[ée]cis/i;

/**
 * Une affaire de la base, mise sous la forme d'un payload de proposition (comparerSignaux compare deux payloads).
 * `origine` : payload de la proposition qui a créé l'affaire (porte le nombre de personnes et la période des faits), s'il existe.
 */
export function payloadDeAffaire(k) {
  const o = k.origine || {};
  const nomme = !!k.etablissement && !NON_NOMME.test(k.etablissement);
  return {
    commune: k.commune, etablissement: k.etablissement, etablissement_nomme: nomme,
    fiche: { departement: k.departement, role_mis_en_cause: k.role, type_structure: k.type_structure, crit_etablissement_nomme: nomme },
    personnes: o.personnes ?? null, periode_faits: o.periode_faits ?? null,
    evidence: (k.urls || []).filter(Boolean).map((url) => ({ url })),
  };
}

/** Pages citées par une proposition : ses articles ET ses preuves (comparerSignaux ne lit que les preuves — ici on veut aussi les articles lus). */
const pagesDe = (p) => new Set([...(p.articles || []), ...(p.evidence || [])].map((x) => canonique(String(x?.url || ''))).filter(Boolean));

/**
 * Quelles affaires de la base méritent d'être confrontées à la proposition ? Seulement celles que le moteur d'ÉMISSION n'a pas pu voir ou a déjà
 * rapprochées : (1) créées APRÈS l'émission de la proposition (la base a changé depuis) ; (2) qui citent déjà une page de la proposition.
 * Une affaire plus ancienne qui ne cite aucune de ses pages a été examinée à l'émission (résolveur, voisines, avertissement affiché à l'humain) : la
 * remettre en cause ici ferait revenir en revue toute création dans une commune qui compte d'autres affaires.
 * @param {object[]} lignes  affaires de la commune / du département (avec `created_at`, `urls`)
 * @param {string|Date|null} emisA  date d'émission de la proposition
 */
export function candidatsPertinents(lignes, payload, emisA) {
  const miennes = pagesDe(payload);
  const t = emisA ? new Date(emisA).getTime() : NaN;
  return (lignes || []).filter((k) => (!Number.isNaN(t) && new Date(k.created_at).getTime() > t)
    || (k.urls || []).some((u) => miennes.has(canonique(String(u)))));
}

/**
 * @param {object} o
 * @param {object} o.payload    payload de la proposition qui va créer une affaire
 * @param {object[]} o.candidats affaires de la base à confronter : { case_id, etablissement, commune, departement, type_structure, role, publication_status, urls[], origine? }
 * @param {Iterable<string>} [o.exclus]  affaires que l'humain a explicitement choisi de NE PAS rapprocher (maintien séparé)
 * @returns {{decision:'creer'|'rattacher'|'revue', case_id?:string, motif:string, examens:{case_id:string, verdict:string, pagesCommunes:number, motif:string}[]}}
 */
export function verifierCreation({ payload, candidats, exclus = [] }) {
  const ecartes = new Set(exclus);
  const miennes = pagesDe(payload);
  const examens = [];
  for (const k of candidats || []) {
    if (ecartes.has(k.case_id)) continue;
    const cmp = comparerSignaux(payload, payloadDeAffaire(k));
    const pagesCommunes = [...pagesDe(payloadDeAffaire(k))].filter((u) => miennes.has(u)).length;
    examens.push({ case_id: k.case_id, publication_status: k.publication_status, verdict: cmp.verdict, pagesCommunes, motif: cmp.motif });
  }
  const retenus = examens.filter((e) => e.verdict !== 'distinct');
  if (!retenus.length) return { decision: 'creer', motif: examens.length ? 'aucune affaire existante ne correspond (contradictions étayées ou affaires distinctes)' : 'aucune affaire candidate', examens };
  // Certaine : même affaire ET page commune ET affaire non retirée (une affaire retirée n'est jamais la cible d'un rattachement automatique).
  const certaines = retenus.filter((e) => e.verdict === 'meme' && e.pagesCommunes > 0 && e.publication_status !== 'retirée');
  if (certaines.length === 1 && retenus.length === 1) {
    return { decision: 'rattacher', case_id: certaines[0].case_id, motif: `même affaire que ${certaines[0].case_id} : ${certaines[0].motif}`, examens };
  }
  const liste = retenus.map((e) => e.case_id).join(', ');
  return {
    decision: 'revue',
    motif: certaines.length > 1
      ? `plusieurs affaires existantes semblent identiques (${liste}) : aucune fusion par transitivité`
      : `affaire(s) existante(s) possiblement identique(s) (${liste}) sans preuve suffisante : ${retenus[0].motif}`,
    examens,
  };
}
