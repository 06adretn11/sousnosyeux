// =====================================================================
// scripts/lib/promouvoir-fiche.mjs — étape finale du circuit : un dossier GÉNÉRÉ et APPROUVÉ (empreinte) devient la matière éditoriale de la fiche.
//
// Fonctions PURES : elles décident, elles n'écrivent rien. Refus par défaut (échec fermé) : la promotion n'a lieu que si
//   - la fiche générée existe, est proposable (READY / A_REVOIR) et son empreinte est celle du dossier à promouvoir ;
//   - une approbation d'Adrien (revue « [Fiche approuvée …] ») porte exactement cette empreinte ;
//   - cette empreinte est celle de la DERNIÈRE approbation valide de l'affaire : une proposition dépassée par une autorisation plus récente
//     n'est jamais promue, QUEL QUE SOIT le dossier présent (récent, ancien, discordant ou absent) ;
//   - l'affaire est publique, hors HOLD, sans retrait non levé (une approbation de fiche ne lève ni un HOLD ni un retrait) ; un dossier déjà présent
//     n'est remplacé QUE s'il est lui-même un dossier approuvé (V1 → V2) : jamais d'écrasement d'une rédaction non approuvée, jamais dans un Hub ;
// Le dossier est écrit à l'identique : son empreinte dans data/hub-matiere/isoles.json est celle qui a été approuvée, donc la page devient
// publique par le circuit existant (projection → QA → déploiement), sans second GO.
//
// PRIORITÉ DES APPROBATIONS (lot A du 08/11/2026). Les critères de validité d'une revue de fiche sont INCHANGÉS (revue d'Adrien, `validé`,
// « [Fiche approuvée <id8>] <ID> hash=<empreinte> ») ; seule leur priorité est corrigée. `reviews.reviewed_at` et `new_case_proposals.decided_at` sont des
// instants d'ENREGISTREMENT (insertion de la revue, traitement du clic par la CI), pas la chronologie des consentements : on compare des revues entre elles
// (même table, même horloge). Un GO de lot (ids-go-*.json) n'écrit que des revues, sans proposition : il est donc la dernière autorisation sans pouvoir
// être sélectionné comme candidat — d'où « le dossier attendu est déjà présent » (conservation) ou « absent » (refus, restauration depuis le dépôt).
// =====================================================================
import { hashDossier, empreintesApprouvees, REVUE_FICHE } from './fiche-page.mjs';
import { derniereDecision } from './publication-gates.mjs';

const approbationValide = (x, id) => /^Adrien/.test(x.reviewed_by || '') && x.decision === 'validé' && REVUE_FICHE.test(x.comment || '') && REVUE_FICHE.exec(x.comment)[1] === id;

/**
 * Dernière approbation de fiche valide de l'affaire (mêmes critères que `empreintesApprouvees`) : { hash, instant, ambigu, hashes } ou null.
 * Ordre : `reviewed_at` quand toutes les approbations en portent (chaîne ISO UTC), sinon l'ordre reçu (les requêtes trient déjà par `reviewed_at`).
 * `ambigu` : plusieurs empreintes DIFFÉRENTES au même instant — la chronologie ne les départage pas, on ne choisit pas.
 */
export function derniereApprobation(revues, id) {
  const a = (revues || []).map((x, i) => ({ x, i })).filter(({ x }) => approbationValide(x, id));
  if (!a.length) return null;
  const instant = (x) => (x.reviewed_at ? String(x.reviewed_at) : null);
  const tous = a.every(({ x }) => instant(x));
  const tri = tous ? [...a].sort((p, q) => (instant(p.x) < instant(q.x) ? -1 : instant(p.x) > instant(q.x) ? 1 : p.i - q.i)) : a;
  const dernier = tri[tri.length - 1];
  const hashDe = ({ x }) => REVUE_FICHE.exec(x.comment)[2];
  const memeInstant = tous ? tri.filter(({ x }) => instant(x) === instant(dernier.x)) : [dernier];
  const hashes = [...new Set(memeInstant.map(hashDe))];
  return { hash: hashDe(dernier), instant: instant(dernier.x), ambigu: hashes.length > 1, hashes };
}

/**
 * @param {{id:string, generee:object|null, revues:object[], toutesRevues?:object[]|null, isoles:{dossiers:object}, hubs?:Record<string,object>[], cases:{case_id:string}[], holds:Set<string>}} o
 *   `revues` : revues de l'affaire (seules les approbations de fiche valides comptent) ; `toutesRevues` : TOUTES les revues de l'affaire, ordre chronologique
 *   (pour le retrait) ; `generee.declare` : empreinte déclarée par la proposition (`payload.page.hash`).
 * @returns {{ok:boolean, motif?:string, hash?:string, dossier?:object, reference?:string, instant?:string}}
 */
export function decider({ id, generee, revues, toutesRevues = null, isoles, hubs = [], cases, holds }) {
  if (!generee?.proposable) return { ok: false, motif: 'FICHE_GENEREE_ABSENTE_OU_NON_PROPOSABLE' };
  if (!cases.some((c) => c.case_id === id)) return { ok: false, motif: 'AFFAIRE_NON_PUBLIQUE' };
  if (holds.has(id)) return { ok: false, motif: 'HOLD' };
  // Un retrait non levé par le circuit existant (dernière décision humaine « retirer ») bloque la promotion, même après une nouvelle approbation de fiche.
  if (toutesRevues && derniereDecision(toutesRevues) === 'retirer') return { ok: false, motif: 'RETRAIT_NON_LEVE' };
  if (hubs.some((m) => m?.dossiers?.[id])) return { ok: false, motif: 'DOSSIER_DEJA_PRESENT_PAS_D_ECRASEMENT' };
  const hash = hashDossier(generee.d);
  // Le contenu de la proposition doit être celui que l'approbation a désigné (hash déclaré à la proposition, recopié dans la revue).
  if (generee.declare && generee.declare !== hash) return { ok: false, motif: 'EMPREINTE_NON_CONFORME', hash };
  const approuvees = empreintesApprouvees(revues, id);
  if (!approuvees.length) return { ok: false, motif: 'AUCUNE_APPROBATION', hash };
  if (!approuvees.includes(hash)) return { ok: false, motif: 'EMPREINTE_APPROUVEE_DIFFERENTE', hash };
  const der = derniereApprobation(revues, id);
  if (der.ambigu) return { ok: false, motif: 'CHRONOLOGIE_INDETERMINEE', hash, reference: der.hashes.join('|'), instant: der.instant };
  if (der.hash !== hash) return { ok: false, motif: 'SUPPLANTEE_PAR_AUTORISATION_PLUS_RECENTE', hash, reference: der.hash, instant: der.instant };
  const present = isoles?.dossiers?.[id];
  if (present) {
    const h0 = hashDossier(present);
    if (h0 === hash) return { ok: false, motif: 'DEJA_PROMUE', hash };
    if (!approuvees.includes(h0)) return { ok: false, motif: 'DOSSIER_DEJA_PRESENT_PAS_D_ECRASEMENT', hash };
    // Une MISE À JOUR n'est promue que sur la version dont elle est partie : sinon un ancien bouton (ou une proposition obsolète) remplacerait une version plus récente sans la contenir.
    if (generee.precedent_hash && generee.precedent_hash !== h0) return { ok: false, motif: 'BASE_PERIMEE', hash };
    return { ok: true, hash, dossier: generee.d, remplace: h0 };
  }
  return { ok: true, hash, dossier: generee.d };
}

/**
 * SÉLECTION + DÉCISION pour des propositions ACCEPT portant un dossier (`--depuis-propositions`). Pur : mêmes entrées ⇒ même sortie, rejouable.
 * On détermine D'ABORD l'empreinte de la dernière approbation valide de chaque affaire, PUIS on cherche les propositions qui la portent — jamais « la
 * dernière ACCEPT par decided_at ». Le refus de chaque ancien candidat est consigné AVANT son exclusion (une sélection devenue vide ne l'efface pas).
 * Aucune proposition ne porte l'empreinte attendue : dossier présent conforme ⇒ conservation sans écriture ; contenu attendu absent ⇒ refus motivé,
 * jamais la promotion d'un ancien ACCEPT à sa place (la source approuvée d'un GO de lot est dans le dépôt, pas dans la base).
 * @param {{propositions: {id:string, id8:string, decided_at:string, dossier:object, declare?:string|null, precedent?:string|null}[],
 *          revuesParAffaire: Map<string, object[]>, statuts?: Map<string,string>|null, isoles:{dossiers:object}, hubs?:object[], cases:{case_id:string}[], holds:Set<string>}} o
 * @returns {{lignes: string[], plan: {id:string, hash:string, dossier:object, remplace?:string}[]}}
 */
export function evaluerPromotions({ propositions, revuesParAffaire, statuts = null, isoles, hubs = [], cases, holds }) {
  const lignes = [], plan = [];
  const parAffaire = new Map();
  for (const p of propositions) parAffaire.set(p.id, [...(parAffaire.get(p.id) || []), p]);
  const court = (h) => String(h ?? '').slice(0, 16);
  for (const [id, props] of parAffaire) {
    const toutes = revuesParAffaire.get(id) || [];
    // Retrait détecté dans la base avant sa projection publique : l'affaire n'est plus promouvable.
    if (statuts && statuts.has(id) && statuts.get(id) !== 'publiée') { lignes.push(`· ${id} : refusée — AFFAIRE_NON_PUBLIQUE (statut en base « ${statuts.get(id)} »)`); continue; }
    const der = derniereApprobation(toutes, id);
    const candidats = props.map((p) => ({ ...p, hash: hashDossier(p.dossier) }));
    if (der?.ambigu) { lignes.push(`· ${id} : refusée — CHRONOLOGIE_INDETERMINEE (approbations d'empreintes différentes au même instant : ${der.hashes.join(', ')})`); continue; }
    const retenus = [], ecartes = [];
    for (const p of candidats) (der && p.hash !== der.hash ? ecartes : retenus).push(p);
    // Refus des anciens candidats, consignés AVANT leur exclusion : l'ancienne sélection (la dernière ACCEPT par decided_at) quand elle est écartée, avec le nombre
    // des propositions plus anciennes écartées avec elle. Une ancienne proposition dépassée depuis longtemps par une chaîne d'approbations ne remplit pas les journaux.
    const ancienChoix = [...candidats].sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)))[0];
    if (ecartes.includes(ancienChoix)) {
      const autres = ecartes.length - 1;
      lignes.push(`· ${id} : refusée — SUPPLANTEE_PAR_AUTORISATION_PLUS_RECENTE (proposition ${ancienChoix.id8}, empreinte ${court(ancienChoix.hash)} ; dernière approbation ${court(der.hash)} enregistrée le ${String(der.instant ?? 'instant inconnu').slice(0, 19)} UTC${autres ? ` ; ${autres} proposition(s) plus ancienne(s) écartée(s) de même` : ''})`);
    }
    const choisi = [...retenus].sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)))[0];
    if (choisi) {
      const r = decider({ id, generee: { d: choisi.dossier, proposable: true, precedent_hash: choisi.precedent ?? null, declare: choisi.declare ?? null }, revues: toutes, toutesRevues: toutes, isoles, hubs, cases, holds });
      if (!r.ok && r.motif === 'DEJA_PROMUE') { if (ecartes.length) lignes.push(`· ${id} : dossier présent conforme à la dernière approbation ${court(r.hash)} — conservé, aucun ancien candidat promu`); continue; }
      lignes.push(`· ${id} : ${r.ok ? `promotion PERMISE (empreinte ${r.hash}${r.remplace ? `, remplace la version approuvée ${r.remplace}` : ''})` : `refusée — ${r.motif}${r.hash ? ` (empreinte ${r.hash})` : ''}`}`);
      if (r.ok) plan.push({ id, hash: r.hash, dossier: r.dossier, ...(r.remplace ? { remplace: r.remplace } : {}) });
      continue;
    }
    // Aucune proposition ne porte l'empreinte attendue (ou plus aucune approbation).
    if (hubs.some((m) => m?.dossiers?.[id]) || !der) continue;                 // dossier de Hub : jamais promu ici ; sans approbation : déjà dit par le chemin ordinaire
    const present = isoles?.dossiers?.[id];
    if (present && hashDossier(present) === der.hash) { lignes.push(`· ${id} : dossier présent conforme à la dernière approbation ${court(der.hash)} — conservé, aucun ancien candidat promu`); continue; }
    lignes.push(`· ${id} : refusée — CONTENU_AUTORISE_ABSENT (dernière approbation ${court(der.hash)} enregistrée le ${String(der.instant ?? 'instant inconnu').slice(0, 19)} UTC ; dossier présent ${present ? court(hashDossier(present)) : 'absent'} ; restauration depuis le dépôt requise, aucun ancien ACCEPT promu)`);
  }
  return { lignes, plan };
}

/**
 * RELECTURE : confronte ce qu'on s'apprête à écrire (`prevu`, calculé à l'instant T) au plan recalculé sur l'état relu (`relu`). Une écriture n'est gardée que si la
 * relecture autorise TOUJOURS le même dossier (même affaire, même empreinte). Tout le reste — autorisation retirée, remplacée, devenue ambiguë, affaire retirée ou
 * mise sous HOLD entre-temps — est abandonné : l'état n'est jamais « réparé » à la volée, il est recalculé au passage suivant.
 * @param {{id:string, hash:string}[]} prevu  @param {{id:string, hash:string}[]} relu
 * @returns {{gardes: object[], abandonnes: string[]}}
 */
export function confirmerPlan(prevu, relu) {
  const autorise = new Map((relu || []).map((p) => [p.id, p.hash]));
  const gardes = prevu.filter((p) => autorise.get(p.id) === p.hash);
  return { gardes, abandonnes: prevu.filter((p) => !gardes.includes(p)).map((p) => p.id) };
}

/** Ajoute le dossier à `isoles` (copie) et vérifie que l'empreinte écrite est celle approuvée. */
export function inscrire(isoles, id, dossier, hash) {
  const suite = { ...isoles, dossiers: { ...isoles.dossiers, [id]: dossier } };
  if (hashDossier(JSON.parse(JSON.stringify(suite.dossiers[id]))) !== hash) throw new Error('empreinte altérée par l’écriture');
  return suite;
}
