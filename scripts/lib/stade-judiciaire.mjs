// =====================================================================
// scripts/lib/stade-judiciaire.mjs — le stade judiciaire est-il ÉTABLI par ce que la presse cite ? Fonctions PURES.
//
// DOCTRINE (15/10/2026). Une suspension (même « à titre conservatoire ») ou une enquête ADMINISTRATIVE ne prouve aucune procédure policière
// ou judiciaire ; une plainte seule ne prouve pas l'ouverture d'une enquête. Une affaire n'est publiable qu'avec une procédure policière ou
// judiciaire DOCUMENTÉE. Le nombre d'articles ne compense jamais l'absence de preuve du stade : seules comptent les citations.
//
//   plainte < enquête < mise en examen < procès < condamnation                (relaxe : issue distincte, exige son marqueur)
//   enquête établie = un acte concret (garde à vue, interpellation, perquisition, information judiciaire, saisine d'un juge d'instruction)
//                     OU le mot « enquête » ATTRIBUÉ à une autorité (parquet, procureur, police, gendarmerie, brigade, justice).
//                     « Une enquête judiciaire est en cours » sans autorité nommée n'établit pas l'enquête.
// =====================================================================

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/&[a-z]+;/g, ' ');
// L'enquête administrative / interne n'est PAS une procédure judiciaire : elle est retirée avant toute recherche de marqueur.
const ADMINISTRATIVE = /enquetes?\s+(?:administrative|interne|disciplinaire)s?|audit\s+interne|suspendu\w*|suspension\w*|conservatoire/g;
const ACTE = /garde a vue|gardee? a vue|interpell\w+|perquisition\w*|information judiciaire|juge d'instruction|deferre\w*|ecroue\w*|incarcere\w*|detention provisoire|controle judiciaire/;
const AUTORITE = /parquet|procureur|procureure|police|gendarmerie|brigade|commissariat|justice|magistrat|saisi/;

const RANG = { 'plainte': 1, 'enquête': 2, 'mise en examen': 3, 'procès': 4, 'condamnation non définitive': 5, 'condamnation définitive': 5, 'relaxe / non-lieu / classement': 5 };
/** Stades publiables : une procédure policière ou judiciaire existe (plainte seule : non). */
export const STADES_PUBLIABLES = new Set(['enquête', 'mise en examen', 'procès', 'condamnation non définitive', 'condamnation définitive', 'relaxe / non-lieu / classement']);
export const stadePubliable = (statut) => STADES_PUBLIABLES.has(statut);

/** Stade le plus avancé QUE LES CITATIONS ÉTABLISSENT (une citation = une phrase de presse). null si aucune procédure n'est citée. */
export function stadeCite(citations = []) {
  let best = null;
  const note = (s) => { if (!best || RANG[s] > RANG[best]) best = s; };
  for (const brut of citations) {
    const t = norm(brut);
    const sans = t.replace(ADMINISTRATIVE, ' ');
    if (/relax\w+|non-lieu|classe\w* sans suite/.test(sans)) note('relaxe / non-lieu / classement');
    if (/condamn\w+/.test(sans)) note('condamnation non définitive');
    if (/renvoye\w* devant|proces\b|comparu\w*|comparait|audience|tribunal correctionnel|cour d'assises|juge\w* (?:pour|le)/.test(sans)) note('procès');
    if (/mis(?:e|es)? en examen|mise en examen/.test(sans)) note('mise en examen');
    if (ACTE.test(sans) || (/enquete/.test(sans) && AUTORITE.test(sans))) note('enquête');
    if (/plainte/.test(sans)) note('plainte');
  }
  return best;
}

/**
 * Le stade annoncé est-il établi ? Sinon : le stade que les citations établissent réellement (jamais plus haut).
 * @returns {{ok:boolean, stade:string, raison:string|null}}
 */
export function stadeEtabli(annonce, citations) {
  const cite = stadeCite(citations);
  if (annonce === 'à qualifier' || !RANG[annonce]) return { ok: true, stade: annonce, raison: null };
  if (cite && RANG[cite] >= RANG[annonce]) return { ok: true, stade: annonce, raison: null };
  return { ok: false, stade: cite || 'à qualifier', raison: `stade « ${annonce} » non établi par les citations (${cite ? `elles établissent « ${cite} »` : 'aucune procédure policière ou judiciaire citée'})` };
}
