// =====================================================================
// scripts/lib/chronologie.mjs — repère temporel et ordre chronologique des fiches.
//
// UNE seule règle, partagée par le Déroulé, « Paroles et réactions » et les listes de sources
// (web/src/components/Chronologie.astro, Paroles.astro, FicheUnique.astro, Dossier.astro) et par les contrôles QA.
// Fonctions pures, sans dépendance : importables par Astro (build) comme par node (tests).
//
// HIÉRARCHIE du repère d'un élément (la donnée écrite n'est JAMAIS modifiée : tout se décide à l'affichage,
// donc l'empreinte approuvée d'un dossier ne change pas et une nouvelle génération conserve le résultat) :
//
//   1. date de l'ÉVÉNEMENT établie (date_nature « evenement » ou « approximative ») → cette date, à sa précision réelle
//      (jour, mois, année) ; « approximative » → « Vers … » ;
//   2. sinon, date de PUBLICATION de la source citée par l'élément (source.publie_le) → « Information datée du … »
//      (ou « Propos rapportés dans un article du … » pour une prise de parole). Ce n'est JAMAIS présenté comme
//      la date des faits : le libellé le dit et la nature du repère reste « information » ;
//   3. sinon, aucune date exploitable → « Date non établie » (exception honnête, classée en dernier).
//
// Le repli s'appuie sur la source CITÉE par l'élément (celle qui porte le texte attribué, « Selon X, … »). Les références
// complémentaires d'une étape (« Aussi : … ») corroborent l'étape ; elles ne prouvent pas qu'elles contiennent CET élément :
// leur date ne sert pas de repère. Aucune date de mise à jour, de collecte ou d'import n'est jamais utilisée.
//
// ORDRE : croissant (plus ancien d'abord). Une date partielle se classe au DÉBUT de sa période (« 2026-07 » avant
// « 2026-07-06 », « 2026 » avant « 2026-01 ») : convention simple et stable, qui n'affirme aucun ordre précis entre
// événements que les sources ne départagent pas, et n'ajoute aucun jour fictif à l'AFFICHAGE. Les éléments sans date
// viennent après les datés. Égalité ou incertitude → ordre d'écriture conservé (tri stable, départage par rang).
// =====================================================================

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const RE_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** « 2026-07-06 » | « 2026-07 » | « 2026 » → { annee, mois, jour, precision } ; toute autre chaîne (ou valeur absurde) → null. */
export function analyserDate(s) {
  if (typeof s !== 'string') return null;
  const m = RE_DATE.exec(s.trim());
  if (!m) return null;
  const annee = Number(m[1]), mois = m[2] ? Number(m[2]) : null, jour = m[3] ? Number(m[3]) : null;
  if (annee < 1900 || annee > 2100) return null;
  if (mois !== null && (mois < 1 || mois > 12)) return null;
  if (jour !== null && (jour < 1 || jour > new Date(Date.UTC(annee, mois, 0)).getUTCDate())) return null; // jour réel du mois (pas de 31 février)
  return { annee, mois, jour, precision: jour !== null ? 'jour' : mois !== null ? 'mois' : 'annee' };
}

/** « 2026-07-06 » → « 6 juillet 2026 » · « 2026-07 » → « juillet 2026 » · « 2026 » → « 2026 ». Jamais de jour fictif. */
export function dateFr(s) {
  const d = analyserDate(s);
  if (!d) return null;
  if (d.precision === 'jour') return `${d.jour} ${MOIS[d.mois - 1]} ${d.annee}`;
  if (d.precision === 'mois') return `${MOIS[d.mois - 1]} ${d.annee}`;
  return String(d.annee);
}

/** Clé de classement « AAAA-MM-JJ » ; la partie inconnue vaut 00 (début de période). Date absente ou invalide → null. */
export function cleDate(s) {
  const d = analyserDate(s);
  if (!d) return null;
  const p = (n) => String(n ?? 0).padStart(2, '0');
  return `${d.annee}-${p(d.mois)}-${p(d.jour)}`;
}

const maj = (t) => t.charAt(0).toLocaleUpperCase('fr') + t.slice(1);
const ARTICLES_SANS_DATE = new Set(['article', 'inconnue']);

/**
 * Repère temporel d'un élément { date, date_nature, source:{publie_le} } (entrée de déroulé, prise de parole, carte de réaction).
 * @param {object} e
 * @param {{ parole?: boolean }} [opt]  parole : libellé « Propos rapportés dans un article … » au lieu de « Information datée … »
 * @returns {{ nature: 'evenement'|'approximative'|'information'|'aucune', prefixe: string, valeur: string|null, libelle: string,
 *             date: string|null, precision: string|null, cle: string|null, sansDateEvenement: boolean }}
 */
export function repere(e, opt = {}) {
  const nature = e?.date_nature ?? null;
  // Date d'ÉVÉNEMENT : seulement si l'élément ne la déclare pas « article » / « inconnue » (l'ancienne convention : une date marquée « article » EST une date de parution).
  const dEv = !ARTICLES_SANS_DATE.has(nature) ? analyserDate(e?.date) : null;
  if (dEv) {
    const valeur = dateFr(e.date);
    const approx = nature === 'approximative';
    return { nature: approx ? 'approximative' : 'evenement', prefixe: approx ? 'Vers' : '', valeur: approx ? valeur : maj(valeur),
      libelle: approx ? `Vers ${valeur}` : maj(valeur), date: e.date, precision: dEv.precision, cle: cleDate(e.date), sansDateEvenement: false };
  }
  // Repli : publication de la source citée ; à défaut, une `date` marquée « article » (c'est alors une date de parution, jamais des faits).
  const pub = analyserDate(e?.source?.publie_le) ? e.source.publie_le : (nature === 'article' && analyserDate(e?.date) ? e.date : null);
  if (pub) {
    const dp = analyserDate(pub);
    const valeur = dateFr(pub);
    const prefixe = opt.parole
      ? (dp.precision === 'jour' ? 'Propos rapportés dans un article du' : 'Propos rapportés dans un article de')
      : (dp.precision === 'jour' ? 'Information datée du' : 'Information datée de');
    return { nature: 'information', prefixe, valeur, libelle: `${prefixe} ${valeur}`, date: pub, precision: dp.precision, cle: cleDate(pub), sansDateEvenement: true };
  }
  return { nature: 'aucune', prefixe: '', valeur: null, libelle: 'Date non établie', date: null, precision: null, cle: null, sansDateEvenement: true };
}

/** Tri chronologique ascendant, STABLE : datés (par clé, puis rang d'écriture), puis sans date (rang d'écriture). `cleDe(x)` → clé ou null. */
export function trierParCle(items, cleDe) {
  return items
    .map((x, i) => ({ x, i, k: cleDe(x) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k === null ? 1 : b.k === null ? -1 : a.k < b.k ? -1 : 1))
    .map((o) => o.x);
}

/** Déroulé / paroles : ordre chronologique selon le repère (événement, sinon information). */
export const trierChrono = (items, opt = {}) => trierParCle(items, (e) => repere(e, opt).cle);

/** Références (articles) : ordre de publication ascendant ; sans date de publication exploitable en dernier. `dateDe(s)` → publie_le / publication_date. */
export const trierSources = (liste, dateDe) => trierParCle(liste, (s) => cleDate(dateDe(s)));
