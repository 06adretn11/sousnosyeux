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
/** Étape du déroulé qui porte un acte procédural (types du dossier éditorial : garde_a_vue, appel, audience, renvoi ; la détention se lit dans le texte de l'étape). */
const PROCEDURAL = {
  garde_a_vue: (e) => e.type === 'garde_a_vue', interpellation: (e) => e.type === 'garde_a_vue',
  appel_parquet: (e) => e.type === 'appel', appel_défense: (e) => e.type === 'appel', appel: (e) => e.type === 'appel',
  audience_annoncee: (e) => e.type === 'audience' || e.type === 'renvoi',
  detention_provisoire: (e) => /d[ée]tention provisoire|[ée]crou/i.test(e.texte || ''),
};
/** « 2026-09 » contient « 2026-09-25 » ; deux jours différents sont deux faits. Une date absente d'un côté ne départage rien. */
const datesCompatibles = (a, b) => !a || !b || String(a).startsWith(String(b)) || String(b).startsWith(String(a));

/**
 * L'étape du déroulé qui porte déjà ce fait, ou null.
 * @param {{deroule?:object[]}} dossier  dossier éditorial de la fiche (data/hub-matiere)
 * @param {{mesure:string, realisation?:string|null, event_date?:string|null}} fait
 */
export function etapeDejaPublie(dossier, { mesure, realisation = null, event_date = null }) {
  if (!mesure) return null;
  // ACTE PROCÉDURAL DATÉ (audience annoncée, garde à vue, appel, détention) : déjà publié quand le déroulé porte une étape du même genre AU MÊME JOUR. Un fait SANS date n'est jamais tenu pour publié
  // (une seconde garde à vue, un second appel sont d'autres faits) : doute = à décider. Cas FR-2026-0114 (rejeu du 23/11/2026) : l'audience du 22/02/2027, déjà dans la fiche approuvée, était « nouvelle ».
  if (PROCEDURAL[mesure]) {
    if (!event_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(event_date))) return null;
    return (dossier?.deroule || []).find((e) => e.date && PROCEDURAL[mesure](e) && datesCompatibles(event_date, e.date)) ?? null;
  }
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
  // Une PAROLE est déjà publiée si la fiche porte la même déclaration (extrait mot pour mot, à la ponctuation d'apostrophe près) : un article qui ne dit rien de plus n'est, au plus, qu'une source à rattacher.
  if (fait?.nature === 'parole') {
    const plat = (t) => String(t || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
    const cites = (fait.parole?.citations || []).map((c) => plat(c.texte)).filter(Boolean);
    const dedans = (dossier?.reactions || []).concat(dossier?.paroles || []).find((r) => (r.citations || []).some((c) => cites.some((t) => plat(c.texte).includes(t.slice(0, 80)) || t.includes(plat(c.texte).slice(0, 80)))));
    return dedans ? { etape: dedans, sourceDejaRattachee: sourceDejaReferencee(dossier, urlArticle) } : null;
  }
  const etape = etapeDejaPublie(dossier, fait);
  return etape ? { etape, sourceDejaRattachee: sourceDejaReferencee(dossier, urlArticle) } : null;
}
