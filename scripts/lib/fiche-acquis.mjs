// =====================================================================
// scripts/lib/fiche-acquis.mjs — UNE RELECTURE ENRICHIT LES ACQUIS, ELLE NE LES REMPLACE PAS. Fonctions PURES (aucun réseau, aucune base, aucun modèle).
//
// Le défaut corrigé ici (06/11/2026) : `generer-fiche` reconstruisait le dossier à partir des SEULES sources lues avec succès pendant le passage courant,
// puis `changementsFiche` listait comme « retirés » tout ce que cette relecture ne reproduisait pas. Un article payant (402), bloqué (403), mal parsé ou
// simplement absent de la sortie du modèle faisait donc proposer l'effacement d'étapes, de sources et de positions déjà validées.
//
// Contrat (une seule règle, pas de moteur) :
//   · la candidate = version APPROUVÉE + ce que la relecture apporte. Une étape approuvée que la relecture ne reproduit pas est CONSERVÉE ;
//   · elle n'est retirée que sur une cause établie et visible : la garde de sensibilité (nom, âge, nombre d'enfants) ; une contradiction de date ou de
//     décision n'est jamais tranchée en silence : elle est signalée (le circuit éditorial décide) ;
//   · une meilleure source peut devenir la référence principale sans effacer les autres : les références s'ajoutent, elles ne se remplacent pas ;
//   · la date d'un événement déjà étayée ne régresse pas ; la date de parution n'est jamais une date d'événement ;
//   · l'état procédural ne régresse pas (pas d'appel perdu, pas de « définitif » déduit d'une absence d'article) ;
//   · un appariement ambigu conserve les deux versions et le dit ; « même source, même date » ne suffit jamais à fusionner.
// Une relecture qui n'apporte rien d'éditorial rend EXACTEMENT la version approuvée : pas de nouvelle empreinte, pas de nouvelle demande de GO.
// =====================================================================
import { jaccard, jetons } from './fiche-composer.mjs';
import { nomsPresents, RE_NOMBRE_ENFANTS, RE_AGE_MIS_EN_CAUSE, RE_AGE_ENFANT } from './fiche-extraction.mjs';
import { canonique } from './preuve-claim.mjs';

// ---- identités d'étapes -------------------------------------------------------------------------------------------------
const famille = (t) => (/^mesure_|^suspension/.test(t || '') ? 'mesure' : t === 'requisitions' ? 'audience' : t);
// Étiquettes « souples » : un même fait est volontiers étiqueté autrement d'un article à l'autre (mêmes familles que la composition).
const SOUPLES = new Set(['garde_a_vue', 'plainte', 'signalement', 'enquete', 'communication_parquet', 'fait_rapporte', 'contexte']);
const PROCEDURAL = new Set(['plainte', 'garde_a_vue', 'mise_en_examen', 'audience', 'decision', 'appel', 'renvoi']);
const UNIQUES = new Set(['garde_a_vue', 'mise_en_examen', 'enquete', 'renvoi']);
const ORDRE_TYPE = ['fait_rapporte', 'signalement', 'plainte', 'enquete', 'garde_a_vue', 'mise_en_examen', 'mesure_etablissement', 'mesure_collectivite', 'mesure_etat', 'communication_parquet', 'renvoi', 'audience', 'decision', 'appel', 'contexte'];

const url = (s) => canonique(s?.url || '');
export const refsEtape = (e) => [e?.source, ...(e?.sources_complementaires || [])].filter((s) => s?.url);
/** Toutes les références (principale + complémentaires) d'un ensemble d'étapes, dédoublonnées par URL canonique. */
export const urlsReferences = (etapes) => [...new Set((etapes || []).flatMap((e) => refsEtape(e).map(url)))];
const annonce = (e) => /^Mesure annoncée/i.test(e?.texte || '');
const evenementiel = (e) => !!e?.date && e.date_nature !== 'article' && e.date_nature !== 'inconnue';
/** Part (0..1) des mots significatifs de `de` qui figurent dans `dans`. */
export const couverture = (de, dans) => { const A = jetons(de), B = jetons(dans); if (!A.size) return 1; let i = 0; for (const x of A) if (B.has(x)) i++; return i / A.size; };

/** Deux étapes peuvent-elles décrire le même jour ? Une date de parution n'est pas une date d'événement : elle ne départage rien. */
function datesCompatibles(a, b) {
  if (!evenementiel(a) || !evenementiel(b)) return true;
  const [x, y] = [a.date, b.date];
  return x === y || x.startsWith(y) || y.startsWith(x);   // « 2019-03 » contient « 2019-03-14 » ; deux jours différents d'un même mois sont deux faits
}

/**
 * @returns {{score:number}|null} null = pas le même fait. Jamais « même source, même date » seul : il faut le même type de fait ET (un texte proche
 * OU un acte procédural du même jour avec un peu de vocabulaire commun OU un acte unique dans l'affaire partageant une source).
 */
export function identite(a, b) {
  const sim = jaccard(a.texte, b.texte);
  // Une mesure ANNONCÉE et sa mise en œuvre sont deux faits — sauf si les deux phrases disent la même chose (seul le préfixe « Mesure annoncée » change) : alors c'est UN fait, et la
  // qualification divergente est signalée à l'éditeur au lieu d'être tranchée (voir conserverAcquis).
  if (annonce(a) !== annonce(b) && sim < 0.6) return null;
  const souples = SOUPLES.has(a.type) && SOUPLES.has(b.type);
  if (famille(a.type) !== famille(b.type) && !(souples && Math.max(couverture(a.texte, b.texte), couverture(b.texte, a.texte)) >= 0.6)) return null;
  // Deux jours d'événement différents = deux faits, SAUF une phrase quasi identique pour un acte procédural : c'est le même acte daté différemment (divergence à signaler, jamais tranchée en silence).
  if (!datesCompatibles(a, b)) return a.type === b.type && PROCEDURAL.has(a.type) && sim >= 0.7 ? { score: sim, divergence: true } : null;
  const ra = refsEtape(a).map(url), rb = new Set(refsEtape(b).map(url));
  const partage = ra.some((u) => rb.has(u));
  const memeJour = evenementiel(a) && evenementiel(b) && a.date === b.date;
  const memeType = a.type === b.type;
  const ok = sim >= 0.34
    || (memeType && memeJour && PROCEDURAL.has(a.type) && (sim >= 0.15 || Math.max(couverture(a.texte, b.texte), couverture(b.texte, a.texte)) >= 0.45))
    || (memeType && UNIQUES.has(a.type) && (partage || sim >= 0.15))
    || (memeType && partage && sim >= 0.2)
    || (souples && !memeType && Math.max(couverture(a.texte, b.texte), couverture(b.texte, a.texte)) >= 0.6 && sim >= 0.2);
  return ok ? { score: sim + (partage ? 0.2 : 0) + (memeJour ? 0.1 : 0) } : null;
}

/**
 * Compare deux déroulés SANS rien décider : une étape = un fait. Appariement un-à-un, glouton par score ; si une étape a deux candidates quasi
 * équivalentes, aucune n'est appariée (`ambigus`) — conserver l'information vaut mieux qu'une fusion arbitraire.
 * @returns {{paires:{i:number,j:number,score:number}[], absorbees:{j:number,i:number}[], regroupees:{i:number,j:number}[], retirees:number[], ajoutees:number[], ambigus:{i:number,j:number}[]}}
 */
export function comparerEtapes(avant = [], apres = []) {
  const toutes = [];
  avant.forEach((a, i) => apres.forEach((c, j) => { const r = identite(a, c); if (r) toutes.push({ i, j, score: r.score, divergence: !!r.divergence }); }));
  toutes.sort((p, q) => q.score - p.score);
  const usedI = new Set(), usedJ = new Set(), paires = [], ambigus = [];
  for (const p of toutes) {
    if (usedI.has(p.i) || usedJ.has(p.j)) continue;
    // Ambiguïté = UNE étape de la relecture qui ressemble à plusieurs faits DISTINCTS de la version approuvée. Plusieurs étapes de la relecture qui décrivent un même fait approuvé
    // (doublons de la candidate) ne sont pas une ambiguïté : la meilleure s'apparie, les autres deviennent des références ou des ajouts.
    const alt = toutes.filter((q) => q.j === p.j && q.i !== p.i && !usedI.has(q.i) && jaccard(avant[p.i].texte, avant[q.i].texte) < 0.6);
    if (alt.some((q) => p.score - q.score < 0.06)) { ambigus.push({ i: p.i, j: p.j }); usedI.add(p.i); usedJ.add(p.j); continue; }
    paires.push(p); usedI.add(p.i); usedJ.add(p.j);
  }
  const pasAppariees = (n, used) => Array.from({ length: n }, (_, k) => k).filter((k) => !used.has(k));
  const nonI = pasAppariees(avant.length, usedI), nonJ = pasAppariees(apres.length, usedJ);
  // Une étape nouvelle dont le contenu est déjà porté par une étape existante (même famille, dates compatibles) n'est PAS un fait nouveau : c'est une référence de plus.
  const absorbees = [], regroupees = [], doublons = [];
  const peutEtre = (x, y) => (famille(x.type) === famille(y.type) || (SOUPLES.has(x.type) && SOUPLES.has(y.type))) && datesCompatibles(x, y) && (annonce(x) === annonce(y) || jaccard(x.texte, y.texte) >= 0.6);
  // Une étape GÉNÉRIQUE (« faits rapportés », « contexte ») dont le contenu est déjà dit par une étape plus précise n'est qu'une référence de plus, quel que soit le type de l'étape précise.
  const GENERIQUES = new Set(['fait_rapporte', 'contexte']);
  const lie = (x, y) => peutEtre(x, y) || ((GENERIQUES.has(x.type) || GENERIQUES.has(y.type)) && datesCompatibles(x, y) && (annonce(x) === annonce(y) || jaccard(x.texte, y.texte) >= 0.6));
  const dit = (c, a) => couverture(c.texte, a.texte) >= (peutEtre(a, c) ? 0.6 : 0.8);
  const doublonDe = (x, y) => lie(x, y) && (jaccard(x.texte, y.texte) >= 0.5 || couverture(y.texte, x.texte) >= 0.8);
  const ajoutees = [];
  const unionAvant = avant.map((a) => a.texte).join(' ');
  for (const j of nonJ) {
    const c = apres[j];
    const i = avant.findIndex((a) => lie(a, c) && dit(c, a));
    if (i >= 0) { absorbees.push({ j, i }); continue; }
    // Même fait qu'une étape DÉJÀ appariée de la relecture (la relecture le dit deux fois) : une référence de plus pour l'étape approuvée correspondante.
    const p = paires.find((q) => doublonDe(apres[q.j], c));
    if (p) { absorbees.push({ j, i: p.i }); continue; }
    // Étape générique sans date d'événement, déjà dite pour l'essentiel par l'ensemble des étapes approuvées : référence de l'étape qui la porte le mieux.
    if (GENERIQUES.has(c.type) && !evenementiel(c) && couverture(c.texte, unionAvant) >= 0.7) {
      const meilleure = avant.map((a, k) => [k, couverture(c.texte, a.texte)]).sort((x, y) => y[1] - x[1])[0];
      if (meilleure && meilleure[1] >= 0.3) { absorbees.push({ j, i: meilleure[0] }); continue; }
    }
    // Doublon INTERNE à la relecture (le même fait écrit deux fois, avec ou sans « Mesure annoncée ») : une seule étape, la seconde n'apporte qu'une référence.
    const jDeja = ajoutees.find((k) => doublonDe(apres[k], c));
    if (jDeja !== undefined) { doublons.push({ j, de: jDeja }); continue; }
    ajoutees.push(j);
  }
  const retirees = [];
  for (const i of nonI) {
    const j = apres.findIndex((c) => peutEtre(avant[i], c) && couverture(avant[i].texte, c.texte) >= 0.8);
    if (j >= 0) regroupees.push({ i, j }); else retirees.push(i);
  }
  return { paires, absorbees, regroupees, doublons, retirees, ajoutees, ambigus };
}

// ---- réactions (paroles attribuées) ------------------------------------------------------------------------------------
const texteReaction = (r) => [...(r.citations || []).map((c) => c.texte), r.paraphrase].filter(Boolean).join(' ');
const memeActeur = (a, b) => { const A = jetons(a), B = jetons(b); if (!A.size || !B.size) return String(a).toLowerCase() === String(b).toLowerCase(); let i = 0; for (const x of A) if (B.has(x)) i++; return i / Math.min(A.size, B.size) >= 0.5; };
export const memeReaction = (a, b) => memeActeur(a.acteur, b.acteur) && (jaccard(texteReaction(a), texteReaction(b)) >= 0.5 || (!!a.source?.url && url(a.source) === url(b.source) && jaccard(texteReaction(a), texteReaction(b)) >= 0.2));
export function comparerReactions(avant = [], apres = []) {
  const prises = new Set(), paires = [];
  apres.forEach((c, j) => { const i = avant.findIndex((a, k) => !prises.has(k) && memeReaction(a, c)); if (i >= 0) { prises.add(i); paires.push({ i, j }); } });
  const pj = new Set(paires.map((p) => p.j));
  return { paires, retirees: avant.map((_, i) => i).filter((i) => !prises.has(i)), ajoutees: apres.map((_, j) => j).filter((j) => !pj.has(j)) };
}

// ---- état procédural -----------------------------------------------------------------------------------------------------
const plat0 = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const rangEtat = (sit) => { const t = plat0(sit?.decision?.titre).trim(); return /^(condamnation|relaxe|non.lieu|classement|acquittement)/.test(t) ? 5 : /^(proces|audience)/.test(t) ? 4 : /^mise en examen/.test(t) ? 3 : /^(enquete|garde a vue)/.test(t) ? 2 : /^plainte/.test(t) ? 1 : 0; };
export const rangSuite = (s) => { const t = plat0(s?.titre).trim(); return /^aucun|non documente|a documenter|^audience|^issue/.test(t) ? 0 : /definitive/.test(t) ? 3 : /appel rapporte/.test(t) ? 2 : /appel annonce/.test(t) ? 1 : 0; };
const TYPES_DU_RANG = { 5: ['decision'], 4: ['audience'], 3: ['mise_en_examen'], 2: ['enquete', 'garde_a_vue'], 1: ['plainte'] };
const dateEtat = (etapes, rang) => (etapes || []).filter((e) => (TYPES_DU_RANG[rang] || []).includes(e.type) && e.date_nature === 'evenement' && e.date).map((e) => e.date).sort().pop() ?? null;

/** Quel état judiciaire fait foi dans la version fusionnée ? L'état approuvé, sauf si la relecture établit PLUS (rang supérieur, ou décision plus récente). */
function choisirEtat(A, C, deroule, bilan, attention) {
  const champs = (d) => ({ etat_actuel: d.etat_actuel, synthese: d.synthese, situation: d.situation });
  // Dossier approuvé sans blocs de situation (rédaction ancienne) : ses phrases d'état restent ; la relecture ne les remplace que si elles n'existent pas.
  if (!A.situation) { const aEtat = !!(A.etat_actuel?.length || A.synthese); return { ...(aEtat ? champs(A) : champs(C)), appel: !!(A.appel || (!aEtat && C.appel)) }; }
  if (!C.situation) { bilan.etat = 'approuve_conserve'; return { ...champs(A), appel: !!A.appel }; }
  const rA = rangEtat(A.situation), rC = rangEtat(C.situation);
  const dA = dateEtat(A.deroule, rA) ?? '', dC = dateEtat(C.deroule, rC) ?? '';
  const candidateGagne = rC > rA || (rC === rA && rC > 0 && dC > dA);
  const P = candidateGagne ? champs(C) : champs(A);
  bilan.etat = candidateGagne ? 'candidate' : rC < rA ? 'approuve_conserve_regression' : 'approuve_conserve';
  if (rC < rA) attention.push({ niveau: 'mineur', code: 'ETAT_APPROUVE_CONSERVE', texte: `La relecture n’établit qu’un état plus faible (« ${C.situation.decision?.titre} ») que la version approuvée (« ${A.situation.decision?.titre} ») : l’état approuvé est conservé.` });
  // Suite (recours) : jamais de régression (un appel rapporté ne disparaît pas), jamais de « définitif » déduit d'une absence d'article.
  const sA = A.situation.suite, sC = C.situation.suite, kA = rangSuite(sA), kC = rangSuite(sC);
  const conflit = (kA === 3 && kC === 2) || (kA === 2 && kC === 3);
  let suiteDe = null;
  if (conflit) { attention.push({ niveau: 'majeur', code: 'SUITE_CONTRADICTOIRE', texte: `Une version rapporte « ${sA.titre} », la relecture « ${sC.titre} » : contradiction non tranchée automatiquement (la version approuvée est conservée).` }); suiteDe = 'A'; }
  else if (kC > kA) suiteDe = 'C'; else if (kA > kC) suiteDe = 'A'; else suiteDe = candidateGagne ? 'C' : 'A';
  const depuisSuite = suiteDe === 'C' ? C : A;
  const source = candidateGagne ? 'C' : 'A';
  if (suiteDe !== source && depuisSuite.situation?.suite) {
    P.situation = { ...P.situation, suite: depuisSuite.situation.suite };
    if (depuisSuite.etat_actuel?.[1]) P.etat_actuel = [P.etat_actuel?.[0], depuisSuite.etat_actuel[1]].filter(Boolean);
    if (depuisSuite.synthese?.ouvert) P.synthese = { ...(P.synthese || {}), ouvert: depuisSuite.synthese.ouvert };
    bilan.suite = suiteDe === 'A' ? 'suite_approuvee_conservee' : 'suite_candidate';
  }
  return { ...P, appel: conflit ? !!A.appel : !!(A.appel || C.appel) };
}

// ---- garde de sensibilité (mêmes motifs que la composition) --------------------------------------------------------------
function sensible(texte, noms) {
  const t = String(texte || '');
  if (RE_AGE_ENFANT.test(t)) return 'âge d’un enfant';
  if (RE_AGE_MIS_EN_CAUSE.test(t)) return 'âge du mis en cause';
  if (RE_NOMBRE_ENFANTS.test(t)) return 'nombre exact d’enfants';
  if (nomsPresents(t, noms).length) return 'nom d’une personne mise en cause';
  return null;
}

// ---- dates : jamais de régression ----------------------------------------------------------------------------------------
function fusionDate(a, c) {
  if (!evenementiel(c)) return { date: a.date, date_nature: a.date_nature };                 // la nouvelle lecture ne restitue pas la date : l'acquis reste
  if (!evenementiel(a)) return { date: c.date, date_nature: c.date_nature, gain: true };      // la date manquait (ou n'était qu'une parution)
  if (a.date === c.date) return { date: a.date, date_nature: a.date_nature };
  if (c.date.startsWith(a.date)) return { date: c.date, date_nature: c.date_nature, gain: true };   // plus précise, compatible
  if (a.date.startsWith(c.date)) return { date: a.date, date_nature: a.date_nature };
  return { date: a.date, date_nature: a.date_nature, conflit: { avant: a.date, apres: c.date } };
}

const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const clef = (e) => e.date || e.source?.publie_le || '';
const rangType = (t) => { const k = ORDRE_TYPE.indexOf(t); return k < 0 ? 99 : k; };

/**
 * Fusionne la candidate (relecture du passage courant) avec la version APPROUVÉE.
 * @param {{precedent:object, candidat:object, sources?:{url:string, acces?:string, motif?:string, ecarte?:string, pertinence?:string}[], noms?:string[]}} o
 *   precedent : dossier approuvé en ligne · candidat : dossier composé par le passage courant · sources : generation.sources (état de lecture de chaque source)
 * @returns {{dossier:object, journal:object, attention:{niveau:string, code:string, texte:string}[]}}
 */
export function conserverAcquis({ precedent, candidat, sources = [], noms = [] }) {
  const A = precedent || {}, C = candidat || {};
  const attention = [];
  const J = { conservees: [], enrichies: [], retirees: [], references_ajoutees: [], devenues_secondaires: [], non_relues: [], dates_corrigees: [], divergences: [], ambigues: [], reactions_conservees: 0, reactions_ajoutees: 0 };
  const lecture = (u) => { const s = sources.find((x) => canonique(x.url) === canonique(u)); return s ? { lue: s.acces === 'libre' && !s.ecarte, motif: s.acces !== 'libre' ? (s.motif || 'inaccessible') : s.ecarte ? 'écartée avant lecture' : null, pertinence: s.pertinence } : { lue: false, motif: 'absente de la sélection de ce passage', pertinence: undefined }; };
  const EA = A.deroule || [], EC = C.deroule || [];
  const cmp = comparerEtapes(EA, EC);
  const sortie = EA.map((e) => ({ ...e }));          // base : la version approuvée, dans son ordre
  const parA = new Map();                              // index approuvé → étape de sortie
  // Les objets de référence d'origine sont conservés TELS QUELS (aucune normalisation) : une relecture sans apport rend exactement la version approuvée.
  const unir = (principale, ...listes) => { const vus = new Set([url(principale)]); const autres = []; for (const s of listes.flat()) if (s?.url && !vus.has(url(s))) { vus.add(url(s)); autres.push(s); } return autres; };
  const poser = (out, autres) => { const avant = (out.sources_complementaires || []).map(url).join('|'); if (autres.map(url).join('|') === avant) return; if (autres.length) out.sources_complementaires = autres; else delete out.sources_complementaires; };

  EA.forEach((e, i) => parA.set(i, sortie[i]));
  const orig = new Map();                              // étape de sortie → { i : étape approuvée d'origine, j : étape de la relecture qui la porte } (re-indexation de la traçabilité)
  sortie.forEach((e, k) => orig.set(e, { i: k, j: null }));
  const parJ = new Map();
  const nouvelleEtape = (c, j) => { const n = { ...c, _nouvelle: true }; orig.set(n, { i: null, j }); parJ.set(j, n); sortie.push(n); return n; };

  // 1. paires : même fait → l'acquis est conservé ; la relecture n'apporte que ce qu'elle ajoute vraiment
  for (const { i, j } of cmp.paires) {
    const a = EA[i], c = EC[j], out = parA.get(i);
    orig.get(out).j = j;
    if (annonce(a) !== annonce(c)) attention.push({ niveau: 'majeur', code: 'MESURE_ANNONCEE_OU_REALISEE_A_TRANCHER', texte: `Même mesure, qualifiée différemment (« ${annonce(a) ? 'annoncée' : 'non qualifiée d’annoncée'} » dans la version approuvée, « ${annonce(c) ? 'annoncée' : 'non qualifiée d’annoncée'} » dans la relecture) : « ${String(a.texte).slice(0, 80)} » — la version approuvée est conservée, à trancher par l’éditeur.` });
    const couvC = couverture(c.texte, a.texte), couvA = couverture(a.texte, c.texte);
    const richer = a.texte !== c.texte && couvC < 0.8 && couvA >= 0.8;
    const divergent = a.texte !== c.texte && couvC < 0.8 && couvA < 0.8;
    const d = fusionDate(a, c);
    out.date = d.date; out.date_nature = d.date_nature;
    if (d.conflit) { J.divergences.push({ type: a.type, ...d.conflit, texte: a.texte }); attention.push({ niveau: 'majeur', code: 'DATE_DIVERGENTE_APRES_RELECTURE', texte: `« ${String(a.texte).slice(0, 90)} » : la version approuvée date l’événement du ${d.conflit.avant}, la relecture (${c.source?.media}) du ${d.conflit.apres} : contradiction non tranchée automatiquement, la date approuvée est conservée.` }); }
    if (richer) { out.texte = c.texte; out.type = SOUPLES.has(c.type) && SOUPLES.has(a.type) ? c.type : a.type; if (c.acteur) out.acteur = c.acteur; out.source = c.source; J.enrichies.push({ avant: a.texte, apres: c.texte, source: c.source?.media }); }
    const primaire = out.source;
    const autres = unir(primaire, [a.source], a.sources_complementaires || [], [c.source], c.sources_complementaires || []);
    for (const s of autres) if (!refsEtape(a).some((r) => url(r) === url(s))) J.references_ajoutees.push({ etape: String(out.texte).slice(0, 80), media: s.media, url: s.url });
    if (url(a.source) !== url(primaire)) J.devenues_secondaires.push({ media: a.source?.media, url: a.source?.url });
    poser(out, autres);
    if (divergent) { nouvelleEtape(c, j); J.ambigues.push({ code: 'DETAIL_DIVERGENT', avant: a.texte, apres: c.texte }); attention.push({ niveau: 'mineur', code: 'DETAIL_DIVERGENT', texte: `Même fait, deux formulations portant chacune un détail propre (« ${String(a.texte).slice(0, 70)} » / « ${String(c.texte).slice(0, 70)} ») : les deux sont conservées.` }); }
  }
  // 2. étapes de la candidate absorbées : une référence de plus pour l'étape qui porte déjà le contenu
  for (const { j, i } of cmp.absorbees) {
    const c = EC[j], out = parA.get(i);
    const autres = unir(out.source, out.sources_complementaires || [], [c.source], c.sources_complementaires || []);
    for (const s of autres) if (!refsEtape(out).some((r) => url(r) === url(s))) J.references_ajoutees.push({ etape: String(out.texte).slice(0, 80), media: s.media, url: s.url });
    poser(out, autres);
  }
  // 3. étapes approuvées non reproduites : CONSERVÉES (une relecture qui ne les retrouve pas ne les infirme pas), sauf garde de sensibilité
  const aEnlever = new Set();
  // (les étapes « regroupées » dans une étape de la relecture sont conservées elles aussi : seule la comparaison de deux versions les tient pour reformulées)
  for (const i of [...cmp.retirees, ...cmp.regroupees.map((x) => x.i), ...cmp.ambigus.map((x) => x.i)]) {
    const a = EA[i];
    const motifSensible = sensible(a.texte, noms);
    if (motifSensible) { aEnlever.add(i); J.retirees.push({ texte: a.texte, media: a.source?.media, motif: `GARDE_SENSIBILITE : ${motifSensible}` }); attention.push({ niveau: 'majeur', code: 'ETAPE_APPROUVEE_RETIREE_SENSIBLE', texte: `Une étape de la version approuvée contient ${motifSensible} : elle n’est pas reconduite (« ${String(a.texte).slice(0, 80)} »).` }); continue; }
    const refs = refsEtape(a).map((r) => ({ ...r, ...lecture(r.url) }));
    const relues = refs.filter((r) => r.lue);
    const autreAffaire = refs.filter((r) => r.lue && ['AFFAIRE_SOEUR', 'AUTRE_AFFAIRE', 'HORS_SUJET'].includes(r.pertinence));
    J.conservees.push({ texte: a.texte, type: a.type, date: a.date ?? null, source: a.source?.media, raison: relues.length ? 'RELUE_SANS_REPRISE' : 'NON_RELUE' });
    if (autreAffaire.length === refs.length && refs.length) { J.ambigues.push({ code: 'SOURCE_RELUE_AUTRE_AFFAIRE', texte: a.texte }); attention.push({ niveau: 'majeur', code: 'SOURCE_RELUE_AUTRE_AFFAIRE', texte: `Toutes les sources d’une étape approuvée ont été relues et jugées d’une autre affaire (« ${String(a.texte).slice(0, 80)} ») : étape conservée, à trancher par l’éditeur (un rattachement ne se retire pas sur une seule lecture).` }); }
  }
  for (const x of cmp.ambigus) { J.ambigues.push({ code: 'APPARIEMENT_AMBIGU', avant: EA[x.i].texte, apres: EC[x.j].texte }); attention.push({ niveau: 'majeur', code: 'APPARIEMENT_AMBIGU', texte: `Une étape de la relecture (« ${String(EC[x.j].texte).slice(0, 70)} ») ressemble à plusieurs étapes approuvées : aucune fusion, tout est conservé.` }); }
  // 4. étapes nouvelles de la candidate (même absorbées-ambiguës) : ajoutées
  const nouvelles = [...cmp.ajoutees, ...cmp.ambigus.map((x) => x.j)];
  for (const j of nouvelles) nouvelleEtape(EC[j], j);
  for (const { j, de } of cmp.doublons) {                       // doublon interne de la relecture : sa source n'est qu'une référence de l'étape déjà ajoutée
    const n = parJ.get(de), c = EC[j];
    if (n) { const autres = unir(n.source, n.sources_complementaires || [], [c.source], c.sources_complementaires || []); if (autres.length) n.sources_complementaires = autres; }
  }
  // 5. ordre : l'ordre approuvé est conservé ; chaque nouvelle étape s'insère à sa place chronologique (date de l'événement, à défaut parution)
  let deroule = sortie.filter((e, k) => !(k < EA.length && aEnlever.has(k)));
  const sans = (e) => { const { _nouvelle, ...r } = e; orig.set(r, orig.get(e)); return r; };
  const base = deroule.filter((e) => !e._nouvelle), neuves = deroule.filter((e) => e._nouvelle).map(sans);
  const dr = base.slice();
  for (const e of neuves) { const k = dr.findIndex((x) => clef(x) > clef(e) || (clef(x) === clef(e) && rangType(x.type) > rangType(e.type))); if (k < 0) dr.push(e); else dr.splice(k, 0, e); }
  deroule = dr;
  const origines = deroule.map((e) => orig.get(e));
  const sourcesNonRelues = new Map();
  for (const e of deroule) for (const r of refsEtape(e)) { const l = lecture(r.url); if (!l.lue && !sourcesNonRelues.has(url(r))) sourcesNonRelues.set(url(r), { media: r.media, url: r.url, motif: l.motif }); }
  J.non_relues = [...sourcesNonRelues.values()];

  // 6. réactions : positions attribuées conservées (attribution inchangée), nouvelles positions ajoutées
  const RA = A.reactions || [], RC = C.reactions || [];
  const cr = comparerReactions(RA, RC);
  const reactions = [], originesReactions = [];
  RA.forEach((r, i) => {
    const m = sensible(texteReaction(r), noms);
    if (m) { J.retirees.push({ texte: texteReaction(r).slice(0, 120), media: r.source?.media, motif: `GARDE_SENSIBILITE : ${m}` }); attention.push({ niveau: 'majeur', code: 'REACTION_APPROUVEE_RETIREE_SENSIBLE', texte: `Une position de la version approuvée contient ${m} : elle n’est pas reconduite.` }); return; }
    reactions.push(r); originesReactions.push({ i, j: cr.paires.find((p) => p.i === i)?.j ?? null });
    if (cr.retirees.includes(i)) J.reactions_conservees++;
  });
  for (const j of cr.ajoutees) if (reactions.length < Math.max(8, RA.length + 2)) { reactions.push(RC[j]); originesReactions.push({ i: null, j }); J.reactions_ajoutees++; }

  // 7. état judiciaire, faits, inconnues
  const etat = choisirEtat({ ...A, deroule: EA }, { ...C, deroule: EC }, deroule, J, attention);
  const COMPTE = /(?:ne repose que sur|repose sur) \d+ articles?/i;
  const EXPLICATION_ISSUE = /^(?:Appel|Recours|Aucun jugement|Issue de la procédure)/;
  const mesure = deroule.some((e) => /^mesure_/.test(e.type));
  const etatDeC = J.etat === 'candidate';
  const lignesA = (A.inconnues || []).filter((l) => !(etatDeC && EXPLICATION_ISSUE.test(l)));
  const lignesC = (C.inconnues || []).filter((l) => !COMPTE.test(l) && !(mesure && /^Mesures prises par l’établissement/.test(l)) && !(!etatDeC && EXPLICATION_ISSUE.test(l)) && !lignesA.some((x) => jaccard(x, l) >= 0.5));
  // Aucune clé fantôme : un champ n'est posé que s'il existait déjà dans la version approuvée ou s'il porte de la matière.
  const dossier = { ...A, deroule };
  const poserSi = (k, v, vide) => { if (v === undefined) return; if (k in A || !vide) dossier[k] = v; };
  poserSi('etat_actuel', etat.etat_actuel, !etat.etat_actuel?.length);
  poserSi('appel', etat.appel, !etat.appel);
  poserSi('reactions', reactions, !reactions.length);
  poserSi('inconnues', [...lignesA, ...lignesC], !lignesA.length && !lignesC.length);
  poserSi('statut_affiche', C.statut_affiche ?? A.statut_affiche, false);
  if (A.faits || C.faits) dossier.faits = A.faits ?? C.faits;
  for (const k of ['synthese', 'situation']) { if (etat[k]) dossier[k] = etat[k]; else if (!(k in A)) delete dossier[k]; }
  // Nombre de sources de la relecture : une décoration de la composition, pas un fait ; si la version approuvée n'en porte pas, on n'en invente pas.
  if (J.references_ajoutees.length || nouvelles.length) attention.push({ niveau: 'mineur', code: 'COMPTE_DE_SOURCES_A_RELIRE', texte: 'Des références ont été ajoutées : le compte d’articles lus mentionné dans « Ce que l’on ne sait pas » (s’il existe) est celui de la rédaction précédente.' });
  if (J.conservees.length) attention.push({ niveau: 'mineur', code: 'ETAPES_APPROUVEES_CONSERVEES', texte: `${J.conservees.length} étape(s) approuvée(s) non reproduite(s) par la relecture sont conservées (${J.conservees.filter((x) => x.raison === 'NON_RELUE').length} dont les sources n’ont pas été relues).` });
  J.inchange = canon(dossier) === canon(A);
  return { dossier, journal: J, attention, origines, originesReactions };
}
