// =====================================================================
// scripts/lib/rejeu-ecartees.mjs — rejeu HORS PRODUCTION d'une proposition écartée par le notifier (audit du 21/11/2026)
//
// Fonction PURE. Pour chaque proposition écartée sans message, dit POURQUOI, au niveau du FAIT (jamais de l'URL seule) :
//   NOUVEAU            un fait sûr, jamais consigné ni soumis → serait proposé à l'éditeur (décision arbitrable)
//   DEJA_CONSIGNE      le fait est déjà dans la mémoire de l'affaire (case_events ou information validée) ou dans la fiche publiée
//   DEJA_SOUMIS        le même fait (libellé + date/période) attend déjà une décision de l'éditeur
//   RATTACHEMENT       rattachement du modèle ≠ OK : pas de preuve suffisante pour proposer
//   SANS_APPORT        aucun acte ni mesure reconnu dans les citations : rien à consigner
//   PERIMEE            changement d'état dont l'état de départ n'est plus celui de la fiche
// Aucune écriture, aucun réseau, aucun modèle.
// =====================================================================
import { detecterInstitutionnel, faitsStructures, planReactions } from './evenement-institutionnel.mjs';
import { detecterActesProcéduraux, faitDeInstitutionnel } from './acte-procedural.mjs';
import { dejaPublie } from './fait-deja-publie.mjs';
import { memeFait } from './nouveaute.mjs';
import { actesDetail } from './routage-veille.mjs';

const citations = (facts) => (Array.isArray(facts) ? facts.flatMap((f) => f?.evidence || []) : []);

/**
 * @param {object} p  { case_id, aa, rat, facts, pd, url, avant, apres, courant }
 * @param {{memoire:object[], soumis:Set<string>, dossier:object|null}} ctx
 *        memoire : faits connus {event_type,event_date,event_period,libelle_public} ; soumis : clés de faits en attente de décision ; dossier : fiche publiée
 * @returns {{classe:string, faits:object[], motif:string}}
 */
export function classerEcartee(p, { memoire = [], soumis = new Set(), dossier = null } = {}) {
  if (p.aa === 'STATE_CHANGE') {
    if (p.avant && p.courant && p.avant !== p.courant) return { classe: 'PERIMEE', faits: [], motif: `fiche : ${p.courant} ≠ départ ${p.avant}` };
    return { classe: 'DEJA_SOUMIS', faits: [], motif: 'changement d’état déjà soumis ou consigné (circuit STATE_CHANGE, non modifié)' };
  }
  let faits = faitsStructures(p.facts);
  if (!faits.length) {
    const cites = citations(p.facts);
    const inst = detecterInstitutionnel(cites);
    faits = [...detecterActesProcéduraux(cites, { pubDate: p.pd, courant: p.courant, memoire }), ...(inst ? [faitDeInstitutionnel(inst, p.ed ?? null)] : [])];
  }
  if (!faits.length) {
    const d = actesDetail(citations(p.facts).join(' . '));
    const vus = [...d.affirmes, ...d.rappeles.map((a) => `${a} (rappel)`), ...d.nies.map((a) => `${a} (nié)`)];
    return { classe: 'SANS_APPORT', faits: [], motif: vus.length ? `acte(s) ${vus.join('+')} : stade déjà atteint (${p.courant}), rappel ou acte sans fait consignable` : 'aucun acte procédural ni mesure reconnus dans les citations vérifiées' };
  }
  if (p.rat !== 'OK') return { classe: 'RATTACHEMENT', faits, motif: `rattachement du modèle : ${p.rat ?? 'absent'}` };
  const { neufs } = planReactions(faits, memoire);
  if (!neufs.length) return { classe: 'DEJA_CONSIGNE', faits, motif: 'même fait (type + date/période ou libellé) déjà dans la mémoire de l’affaire' };
  const publies = neufs.filter((f) => dejaPublie(dossier, f, p.url));
  if (publies.length === neufs.length) return { classe: 'DEJA_CONSIGNE', faits: neufs, motif: 'le fait figure déjà dans la fiche publiée' };
  const restants = neufs.filter((f) => !publies.includes(f));
  const attente = [...soumis];   // faits en attente de décision {libelle_public, event_date, event_period}
  const pasSoumis = restants.filter((f) => !attente.some((s) => memeFait(f, s)));
  if (!pasSoumis.length) return { classe: 'DEJA_SOUMIS', faits: restants, motif: 'même fait déjà soumis à décision (autre article)' };
  return { classe: 'NOUVEAU', faits: pasSoumis, motif: 'fait nouveau, sûr, non consigné, non soumis' };
}
