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
  // `repere_source` (relecture documentée, data/chronologie-reperes.json) : une source ANTÉRIEURE qui rapporte effectivement le même fait date l'information ; le texte reste attribué à `source`.
  const srcRepere = analyserDate(e?.repere_source?.publie_le) ? e.repere_source : null;
  const pub = srcRepere ? srcRepere.publie_le : analyserDate(e?.source?.publie_le) ? e.source.publie_le : (nature === 'article' && analyserDate(e?.date) ? e.date : null);
  if (pub) {
    const dp = analyserDate(pub);
    const valeur = dateFr(pub);
    const prefixe = opt.parole
      ? (dp.precision === 'jour' ? 'Propos rapportés dans un article du' : 'Propos rapportés dans un article de')
      : (dp.precision === 'jour' ? 'Information datée du' : 'Information datée de');
    return { nature: 'information', prefixe, valeur, libelle: `${prefixe} ${valeur}`, date: pub, precision: dp.precision, cle: cleDate(pub), sansDateEvenement: true, sourceRepere: srcRepere };
  }
  return { nature: 'aucune', prefixe: '', valeur: null, libelle: 'Date non établie', date: null, precision: null, cle: null, sansDateEvenement: true };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// RELECTURES DOCUMENTÉES (data/chronologie-reperes.json) — appliquées à l'AFFICHAGE, jamais écrites dans les dossiers approuvés
// (l'empreinte approuvée d'un dossier porte sur le fichier de matière : elle ne bouge pas, aucune fiche n'est dépubliée).
//   reperes[]      { case_id, texte (début EXACT du texte de l'étape), repere_source:{media,url,publie_le} | date + date_nature:'evenement', motif }
//   paroles[]      { case_id, acteur, cle (début de a_propos, sinon paraphrase, sinon contexte), date, date_nature:'evenement', motif }
//   publications[] { url, publie_le, stockee, motif } : date de parution lue sur la page elle-même, différente de celle conservée.
// Un renseignement qui ne correspond plus à aucun élément (dossier réécrit) est IGNORÉ à l'affichage et fait échouer le test QA.
// ---------------------------------------------------------------------------------------------------------------------------------
const cleTexte = (e) => String(e?.texte ?? '');
export const correspondEtape = (e, r) => cleTexte(e).startsWith(r.texte);

/**
 * Défauts d'une relecture d'ÉTAPE face à l'étape du dossier servi qui lui correspond (liste vide = conforme). Règle de cohérence, jamais de refus d'un contenu autorisé :
 *  - une date explicite IDENTIQUE à celle que le dossier porte désormais est REDONDANTE (la rédaction a repris la date que la relecture documentait), pas fautive ;
 *  - seule une date DIFFÉRENTE est un défaut : la relecture l'écraserait en silence à l'affichage.
 * Cas réel (24/11/2026, Rots) : la nouvelle version approuvée datait elle-même « début octobre » → 2026-10, comme la relecture ; le contrôle bloquait la publication entière.
 */
export function defautsRelectureEtape(r, e) {
  const d = [];
  if (r.repere_source) {
    if (!(e.sources_complementaires ?? []).some((s) => s.url === r.repere_source.url)) d.push('source de repère absente des références de l’étape');
    if (!(cleDate(r.repere_source.publie_le) < cleDate(e.source?.publie_le))) d.push('la source de repère n’est pas antérieure à la source citée');
  } else {
    if (!analyserDate(r.date) || r.date_nature !== 'evenement') d.push(`date explicite invalide (${r.date})`);
    if (analyserDate(e.date) && !['article', 'inconnue'].includes(e.date_nature) && e.date !== r.date) d.push(`l’étape porte déjà une date d’événement DIFFÉRENTE (${e.date} ≠ ${r.date})`);
  }
  if (!r.motif) d.push('motif manquant');
  return d;
}
export const correspondParole = (p, r) => p?.acteur === r.acteur && String(p?.a_propos ?? p?.paraphrase ?? p?.contexte ?? '').startsWith(r.cle);

/** Date de parution corrigée d'une source (par adresse) ; sans correction : la date conservée. */
export const publicationCorrigee = (table, url, date) => (table?.publications ?? []).find((x) => x.url === url)?.publie_le ?? date;

/** Applique les relectures à UN dossier { deroule, reactions, paroles } : retourne un nouveau dossier (l'original n'est pas modifié). */
export function appliquerRelectures(caseId, dossier, table) {
  if (!dossier || !table) return dossier;
  const pubs = table.publications ?? [];
  const src = (s) => (s && pubs.length ? { ...s, publie_le: publicationCorrigee(table, s.url, s.publie_le) } : s);
  const etapes = (table.reperes ?? []).filter((r) => r.case_id === caseId);
  const paroles = (table.paroles ?? []).filter((r) => r.case_id === caseId);
  if (!etapes.length && !paroles.length && !pubs.length) return dossier;
  const deroule = (dossier.deroule ?? []).map((e) => {
    let out = { ...e, source: src(e.source), ...(e.sources_complementaires ? { sources_complementaires: e.sources_complementaires.map(src) } : {}) };
    const r = etapes.find((x) => correspondEtape(e, x));
    if (r?.date) out = { ...out, date: r.date, date_nature: r.date_nature ?? 'evenement' };
    if (r?.repere_source) out = { ...out, repere_source: r.repere_source };
    return out;
  });
  const lisse = (liste) => (liste ?? []).map((p) => {
    const r = paroles.find((x) => correspondParole(p, x));
    return { ...p, source: src(p.source), ...(r?.date ? { date: r.date, date_nature: r.date_nature ?? 'evenement' } : {}) };
  });
  return { ...dossier, deroule, ...(dossier.reactions ? { reactions: lisse(dossier.reactions) } : {}), ...(dossier.paroles ? { paroles: lisse(dossier.paroles) } : {}) };
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

// Défauts de chronologie d'UN dossier tel que rendu (relectures appliquées) : une seule définition, lue par la QA du corpus ET par la garde de promotion/d'envoi.
// Une prise de parole ou une étape SANS date établie n'est pas un défaut (« Date non établie », en dernier) ; une date mal lue, un repli non explicite, un tri qui perd ou désordonne en sont.
export function defautsChronologie(d) {
  const out = [];
  const etapes = d?.deroule ?? [];
  const paroles = [...(d?.reactions ?? []), ...(d?.paroles ?? [])];
  for (const e of etapes) {
    const r = repere(e);
    if (ARTICLES_SANS_DATE.has(e.date_nature) && (r.nature === 'evenement' || r.nature === 'approximative')) out.push(`date « ${e.date_nature} » lue comme date d'événement`);
    if (r.nature === 'aucune' && analyserDate(e.source?.publie_le)) out.push('« Date non établie » alors que la source porte une publication');
    if (r.nature === 'information' && !/^Information datée d[eu] /.test(r.libelle)) out.push(`libellé de repli non explicite (${r.libelle})`);
  }
  const sansPerte = (avant, apres) => apres.length === avant.length && avant.every((x) => apres.includes(x));
  const croissant = (items, opt) => { let prec = null, vuSans = false; for (const e of items) { const k = repere(e, opt).cle; if (k === null) vuSans = true; else { if (vuSans) return false; if (prec !== null && k < prec) return false; prec = k; } } return true; };
  const te = trierChrono(etapes), tp = trierChrono(paroles, { parole: true });
  if (!sansPerte(etapes, te) || !sansPerte(paroles, tp)) out.push('le tri a perdu ou dupliqué un élément');
  if (!croissant(te) || !croissant(tp, { parole: true })) out.push('tri non croissant');
  return out;
}
