// =====================================================================
// scripts/lib/fait-deja-publie.mjs — le fait proposé figure-t-il DÉJÀ dans la fiche publiée ?
//
// Cas réel (20/11/2026, FR-2026-0133, Rots) : la maintenance a demandé à l'éditeur de VALIDER un « événement institutionnel »
// (suspension de l'animateur) alors que la fiche publiée portait déjà cette suspension (étape « mesure de l'établissement »,
// ici 7 octobre) — et référençait déjà l'article du 15 novembre parmi les sources de l'étape. Le garde-fou ne regardait que
// `case_events` (comparaison de LIBELLÉS) : le libellé générique de la table fermée n'est jamais celui de la phrase rédigée
// dans la fiche, donc le fait déjà publié passait pour nouveau.
//
// Règle : un article qui ne dit rien de plus que la fiche n'est PAS une information à décider. Il est, au plus, une source à
// rattacher. Fonction PURE (aucune base, aucun réseau).
// =====================================================================
import { mesuresDeTexte, realisationDe } from './evenement-institutionnel.mjs';
import { urlsReferences } from './fiche-acquis.mjs';

/** Types d'étape du déroulé qui portent une mesure d'institution. */
const TYPES_MESURE = new Set(['mesure_etablissement', 'mesure_collectivite']);
const annoncee = (e) => /^Mesure annoncée/i.test(e?.texte || '');
/** « 2026-09 » contient « 2026-09-25 » ; deux jours différents sont deux faits. Une date absente d'un côté ne départage rien. */
const datesCompatibles = (a, b) => !a || !b || String(a).startsWith(String(b)) || String(b).startsWith(String(a));

/**
 * L'étape du déroulé qui porte déjà ce fait, ou null.
 * @param {{deroule?:object[]}} dossier  dossier éditorial de la fiche (data/hub-matiere)
 * @param {{mesure:string, realisation?:string|null, event_date?:string|null}} fait
 */
export function etapeDejaPublie(dossier, { mesure, realisation = null, event_date = null }) {
  if (!mesure) return null;
  for (const e of dossier?.deroule || []) {
    if (!TYPES_MESURE.has(e.type) || !mesuresDeTexte(e.texte).includes(mesure)) continue;
    // Une CONFIRMATION de réalisation n'est pas déjà publiée quand la fiche ne dit la mesure qu'annoncée : c'est une information nouvelle.
    if (realisation === 'réalisée' && (annoncee(e) || realisationDe(e.texte) !== 'réalisée')) continue;
    if (!datesCompatibles(event_date, e.date)) continue;
    return e;
  }
  return null;
}

/** L'URL de l'article est-elle déjà référencée quelque part dans la fiche (étapes, sources complémentaires, réactions, paroles) ? */
export function sourceDejaReferencee(dossier, urlArticle) {
  const u = urlsReferences([{ source: { url: urlArticle || '' } }])[0];
  if (!u) return false;
  return urlsReferences([...(dossier?.deroule || []), ...(dossier?.reactions || []), ...(dossier?.paroles || [])]).includes(u);
}

/**
 * @returns {null | { etape:object, sourceDejaRattachee:boolean }}  null = fait absent de la fiche (information à décider comme avant).
 * Sinon : fait déjà publié ; `sourceDejaRattachee` dit s'il reste quelque chose à faire (rattacher l'article) ou rien du tout.
 */
export function dejaPublie(dossier, fait, urlArticle) {
  const etape = etapeDejaPublie(dossier, fait);
  return etape ? { etape, sourceDejaRattachee: sourceDejaReferencee(dossier, urlArticle) } : null;
}
