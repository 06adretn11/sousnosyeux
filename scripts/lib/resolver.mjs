// =====================================================================
// scripts/lib/resolver.mjs
//
// LA SOUDURE : candidat de l'observatoire → affaire connue.
//
//   CANDIDATE + KNOWN_CASE_INDEX
//     → MATCH | POSSIBLE_MATCH | NO_MATCH
//
// Le resolver NE MODIFIE AUCUNE AFFAIRE. Il répond à une seule question :
// « de quelle affaire déjà connue ce signal parle-t-il, si tant est
// qu'il parle de l'une d'elles ? »
//
// ---------------------------------------------------------------------
// INVARIANT STRUCTUREL — le piège Faidherbe
//
//     CASE_IDENTITY ≠ ESTABLISHMENT_IDENTITY
//
// Deux affaires distinctes peuvent partager établissement, commune et
// rôle (PARIS-009 et FR-2026-0023, rue Faidherbe). Le resolver ne
// fusionne donc JAMAIS sur ces seuls critères : dès que plusieurs
// affaires se rattachent également bien, il rend POSSIBLE_MATCH et
// demande un humain. Perdre du temps humain est réparable ; fusionner
// deux affaires réelles ne l'est pas.
// ---------------------------------------------------------------------
//
// DÉTERMINISTE D'ABORD : aucun LLM n'est appelé ici, jamais. Le resolver
// s'appuie sur `rattacher()` — déjà validé par la primitive etat-affaire
// et sa suite de tests — et se contente d'arbitrer entre ses verdicts.
// =====================================================================

import { rattacher, datesCompletes } from './etat-affaire.mjs';

export const RESOLVER_VERSION = 'resolver-0.2.0';
export const STATUTS = Object.freeze(['MATCH', 'POSSIBLE_MATCH', 'NO_MATCH']);

/**
 * Index des affaires potentiellement pertinentes.
 *
 * On ne charge pas les 129 affaires : on borne par le territoire quand le
 * candidat en expose un. C'est une optimisation de coût, jamais un filtre
 * de correction — un territoire absent élargit, il n'exclut pas.
 *
 * @param {object} sql  client Neon
 * @param {object} candidate
 * @returns {Promise<Array>} fiches minimales
 */
export async function construireIndex(sql, candidate = {}) {
  const codes = candidate.territoire_apparent?.valeurs || [];
  const communes = candidate.commune_hints || [];

  // `departement` du corpus est un libellé ('Paris', 'Somme'), pas un code.
  const libelles = codes.map((c) => CODE_VERS_LIBELLE[c]).filter(Boolean);

  // `sources_dates` : dates de publication des sources de l'affaire (texte ISO, colonne `date` — pas de décalage de fuseau).
  // Elles alimentent le départage chronologique ; une affaire sans source reste simplement « indéterminée ».
  if (!libelles.length && !communes.length) {
    return sql`select case_id, etablissement, commune, departement,
                      role_mis_en_cause::text, statut_judiciaire::text,
                      coalesce((select json_agg(s.publication_date::text order by s.publication_date)
                                from sources s where s.case_id = cases.case_id and s.publication_date is not null), '[]'::json) as sources_dates
               from cases`;
  }
  return sql`select case_id, etablissement, commune, departement,
                    role_mis_en_cause::text, statut_judiciaire::text,
                    coalesce((select json_agg(s.publication_date::text order by s.publication_date)
                              from sources s where s.case_id = cases.case_id and s.publication_date is not null), '[]'::json) as sources_dates
             from cases
             where departement = any(${libelles})
                or commune = any(${communes})`;
}

/** Codes INSEE → libellé de département tel que le corpus l'écrit. */
export const CODE_VERS_LIBELLE = Object.freeze({
  '02': 'Aisne', '59': 'Nord', '60': 'Oise', '62': 'Pas-de-Calais',
  '75': 'Paris', '80': 'Somme',
});

/**
 * Arbitrages humains déjà rendus pour cette observation.
 * @returns {Promise<{attach: Set<string>, separate: Set<string>}>}
 */
export async function chargerArbitrages(sql, observation_id) {
  if (!observation_id) return { attach: new Set(), separate: new Set() };
  let lignes = [];
  try {
    lignes = await sql`
      select case_id, verdict from match_decisions
      where observation_id = ${observation_id}`;
  } catch (e) {
    // La table 006 peut ne pas être appliquée : on le dit, on ne masque pas.
    if (!/match_decisions/.test(String(e.message))) throw e;
    return { attach: new Set(), separate: new Set(), indisponible: true };
  }
  return {
    attach: new Set(lignes.filter((l) => l.verdict === 'ATTACH').map((l) => l.case_id)),
    separate: new Set(lignes.filter((l) => l.verdict === 'KEEP_SEPARATE').map((l) => l.case_id)),
  };
}

/**
 * Examen d'UNE affaire connue contre UN texte.
 *
 * `rattacher()` exige que TOUS les jetons du nom d'établissement figurent dans le texte. C'est juste pour
 * une affaire NOMMÉE. Pour une affaire ANONYME (« Centre périscolaire de Charly (non nommé) », « École non
 * nommée ») c'est fatal : le jeton « nommé » ne figure dans aucun article, donc l'affaire ne pouvait JAMAIS
 * être reconnue — et ressortait comme NOUVELLE (rejeu du Decision Pack #1 : 3 histoires sur 20 ; 0 des 6 affaires
 * publiées « non nommées » n'a jamais ramené un seul résultat à la veille).
 *
 * REPLI, réservé aux affaires anonymes et jamais automatique : commune ET rôle concordent → `DOUTEUX`
 * (POSSIBLE_MATCH → REVIEW), jamais `OK`. « Même commune + même rôle » ne suffit pas à rattacher ; il suffit
 * à dire « une affaire existe peut-être déjà ici, un humain doit trancher ».
 *
 * Pour une affaire NOMMÉE dont le nom est absent de l'article, le statut ne change PAS (NON_RATTACHABLE : l'article
 * peut nommer un autre établissement — invariant Faidherbe). Mais l'affaire est signalée comme VOISINE
 * (même commune + même rôle) : c'est la couche de décision qui en tire un REVIEW plutôt qu'une création.
 */
const ANONYME = /non nomm|non pr[ée]cis/i;
function examiner(fiche, texte) {
  const strict = rattacher(fiche, texte);
  if (strict.rattachement !== 'NON_RATTACHABLE') return strict;
  const commune = String(fiche.commune || '').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (commune.length < 4 || /pr[ée]cis/i.test(commune)) return strict;
  // La commune doit figurer dans le TITRE ou le début de l'article (900 car.) : sur la page entière, elle
  // apparaît aussi dans les liens « à lire aussi » et fabrique de faux voisins (mesuré : une affaire de
  // Vendée « voisine » d'une affaire nantaise anonyme). Rôle : UN mot suffit (« personnel de crèche » ≠ le
  // mot « personnel » que l'AFP n'écrit jamais) — le résultat reste plafonné à DOUTEUX.
  const tete = String(texte || '').slice(0, 900);
  const communeDansLaTete = rattacher({ ...fiche, etablissement: commune, role_mis_en_cause: '' }, tete).rattachement !== 'NON_RATTACHABLE';
  const mots = String(fiche.role_mis_en_cause || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length > 4);
  const normTexte = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const roleUnMot = mots.some((w) => normTexte.includes(w));
  if (!communeDansLaTete || !roleUnMot) return strict;
  if (ANONYME.test(fiche.etablissement || '')) {
    return {
      rattachement: 'DOUTEUX',
      signaux: [`repli (affaire anonyme) : commune « ${commune} » et rôle concordent — jamais automatique`],
      manquants: [`établissement « ${fiche.etablissement} » non retrouvé dans le corps`],
    };
  }
  return { ...strict, voisin: true };
}

// ---------------------------------------------------------------------
// DÉPARTAGE PAR LES SOURCES ET LA CHRONOLOGIE
//
// Plusieurs candidates « partielles » ne sont pas une ambiguïté tant qu'on n'a pas regardé ce que l'on sait d'elles.
// Cas fondateur (11/10/2026) : un article sur une affaire ouverte en février 2026 sortait 11 candidates, dont une affaire
// de 2022 et une de 2023 — leurs propres sources sont antérieures au début de l'affaire décrite : elles ne peuvent pas
// être la même. Le message disait « ambiguïté » et tronquait la liste, la bonne affaire (déjà en base) en tête de rien.
//
// Règle (déterministe, aucun réseau) : l'article dit quand l'affaire a COMMENCÉ (plainte, signalement, révélation).
// Une affaire dont la source la plus récente est antérieure à ce début de plus de MARGE_JOURS jours ne peut pas être
// celle-là. Rien d'autre n'est exclu : sans date de source ou sans début daté, l'affaire reste candidate (« indéterminée »).
// Exclure n'est jamais rattacher : un survivant unique reste un POSSIBLE_MATCH soumis à un humain.
// ---------------------------------------------------------------------
export const MARGE_JOURS = 30;

const MOIS_NUM = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
// Verbes/noms qui posent le COMMENCEMENT d'une affaire…
const RE_ORIGINE = /(affaire\s+(?:a\s+|avait\s+)?(?:d[ée]but|[ée]clat|r[ée]v[ée]l)|\b(?:d[ée]p[ôo]t de plaintes?|plaintes? (?:avai(?:en)?t [ée]t[ée] |ont [ée]t[ée] |est |sont )?d[ée]pos[ée]e?s?|signalement)\b)/i;
// … sauf quand la phrase parle d'un développement (nouvelle plainte, supplétif, audience, jugement, appel) : sa date n'est pas le début.
const RE_DEVELOPPEMENT = /(nouvell|nouveaux|suppl[ée]tif|seconde?\b|deuxi[èe]me|autres? plaintes?|audience|d[ée]lib[ée]r|jugement|condamn|relax|requis|renvoy|appel|proc[èe]s)/i;

const jours = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

/** Date la plus ancienne d'une phrase : jour complet, sinon mois + année, sinon année seule (borne basse). */
function datePhrase(p) {
  const completes = datesCompletes(p);
  if (completes.length) return [...completes].sort()[0];
  const mm = [...p.matchAll(new RegExp('\\b(' + Object.keys(MOIS_NUM).join('|') + ')\\s+(20\\d{2})\\b', 'gi'))]
    .map((m) => `${m[2]}-${String(MOIS_NUM[m[1].toLowerCase()]).padStart(2, '0')}-01`).sort();
  if (mm.length) return mm[0];
  const an = [...p.matchAll(/\b(20\d{2})\b/g)].map((m) => `${m[1]}-01-01`).sort();
  return an[0] || null;
}

/**
 * Début de l'affaire décrit par un article : la plus ancienne date portée par une phrase « d'origine ».
 * @returns {{date:string, phrase:string}|null}
 */
export function dateOrigine(texte) {
  const trouvees = [];
  for (const p of String(texte || '').split(/(?<=[.!?])\s+|\n+/)) {
    if (!RE_ORIGINE.test(p) || RE_DEVELOPPEMENT.test(p)) continue;
    const date = datePhrase(p);
    if (date) trouvees.push({ date, phrase: p.replace(/\s+/g, ' ').trim().slice(0, 160) });
  }
  return trouvees.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null;
}

/**
 * Examen chronologique d'une affaire contre le début de l'affaire décrite.
 * @returns {{case_id:string, verdict:'exclue'|'compatible'|'indeterminee', raison:string}}
 */
export function departager(fiche, origine) {
  const ds = (fiche.sources_dates || []).filter(Boolean).map(String).sort();
  if (!origine) return { case_id: fiche.case_id, verdict: 'indeterminee', raison: 'aucun début d’affaire daté dans l’article' };
  if (!ds.length) return { case_id: fiche.case_id, verdict: 'indeterminee', raison: 'aucune source datée enregistrée pour cette affaire' };
  const derniere = ds[ds.length - 1];
  if (jours(derniere, origine.date) > MARGE_JOURS) {
    return {
      case_id: fiche.case_id, verdict: 'exclue',
      raison: `sa source la plus récente (${derniere}) est antérieure au début de l’affaire décrite (${origine.date})`,
    };
  }
  return {
    case_id: fiche.case_id, verdict: 'compatible',
    raison: `chronologie compatible : sources du ${ds[0]} au ${derniere}, début de l’affaire décrite ${origine.date}`,
  };
}

/**
 * Résout un candidat contre un index d'affaires connues.
 *
 * @param {object}   candidate  observation normalisée (contrat capteur-v0.1)
 * @param {Array}    index      fiches minimales
 * @param {string}   corps      texte de l'article — titre+extrait si rien de mieux
 * @param {object}   arbitrages {attach:Set, separate:Set} décisions humaines
 * @returns {object} résolution
 */
export function resoudre({ candidate, index, corps, arbitrages = null }) {
  const t0 = Date.now();
  const arb = arbitrages || { attach: new Set(), separate: new Set() };
  const texte = corps && corps.length > 40
    ? corps
    : `${candidate.title || ''} ${candidate.excerpt || ''}`;

  const examens = index.map((fiche) => ({
    case_id: fiche.case_id,
    fiche,
    ...examiner(fiche, texte),
  }));

  // --- 1. Un arbitrage humain prime sur toute inférence -----------------
  const attaches = examens.filter((e) => arb.attach.has(e.case_id));
  if (attaches.length === 1) {
    return sortie({
      resolution_status: 'MATCH',
      matched_case_id: attaches[0].case_id,
      evidence: ['arbitrage humain antérieur : ATTACH', ...attaches[0].signaux],
      conflicts: [],
      requires_human_review: false,
      reason: 'rattachement déjà tranché par un humain pour cette observation',
      examens, t0,
    });
  }

  // --- 1 bis. Départage par les sources et la chronologie ----------------
  // Une candidate « douteuse » dont les sources sont antérieures au début de l'affaire décrite est écartée. Une candidate
  // « OK » ne l'est que si plusieurs « OK » se disputent l'article (invariant Faidherbe : c'est là que la chronologie sert) —
  // jamais une affaire seule à se rattacher pleinement.
  const origine = dateOrigine(texte);
  const enLice = examens.filter((e) => !arb.separate.has(e.case_id) && (e.rattachement === 'OK' || e.rattachement === 'DOUTEUX'));
  const nbOk = enLice.filter((e) => e.rattachement === 'OK').length;
  const verdicts = enLice.map((e) => ({ ...departager(e.fiche, origine), commune: e.fiche.commune, rattachement: e.rattachement }));
  const exclues = verdicts.filter((v) => v.verdict === 'exclue' && (v.rattachement === 'DOUTEUX' || nbOk > 1));
  const idsExclus = new Set(exclues.map((v) => v.case_id));
  const okExclues = exclues.filter((v) => v.rattachement === 'OK');
  // Les exclues ressortent « non rattachables » : les appelants (qualifier-signal) ne les listent plus comme candidates.
  const vus = examens.map((e) => (idsExclus.has(e.case_id) ? { ...e, rattachement: 'NON_RATTACHABLE', voisin: false } : e));
  const dp = exclues.length ? { departage: { origine, verdicts: verdicts.map(({ rattachement, ...v }) => v) } } : {};
  // Chaque ligne de preuve reste PROPRE à son affaire (préfixe « <id> — ») : un appelant qui retient une cible ne doit pas
  // hériter des indices ou des manques d'une autre candidate. Les exclusions, elles, sont dans `departage` (et la ligne NO_MATCH).
  const chrono = (ids) => (exclues.length
    ? verdicts.filter((v) => ids.includes(v.case_id) && v.verdict === 'compatible').map((v) => `${v.case_id} — ${v.raison}`)
    : []);
  const noteExclusions = exclues.map((v) => `${v.case_id} écartée par la chronologie : ${v.raison}`);

  // Les affaires écartées par un humain sortent de la délibération.
  const retenus = examens.filter((e) => !arb.separate.has(e.case_id) && !idsExclus.has(e.case_id));
  const ecartes = examens.filter((e) => arb.separate.has(e.case_id));

  const ok = retenus.filter((e) => e.rattachement === 'OK');
  const douteux = retenus.filter((e) => e.rattachement === 'DOUTEUX');

  const noteArbitrage = ecartes.length
    ? [`${ecartes.length} affaire(s) écartée(s) par arbitrage humain : ${ecartes.map((e) => e.case_id).join(', ')}`]
    : [];

  // --- 2. Plusieurs affaires se rattachent → JAMAIS de fusion -----------
  if (ok.length > 1) {
    return sortie({
      resolution_status: 'POSSIBLE_MATCH',
      matched_case_id: null,
      evidence: [...noteArbitrage, ...ok.flatMap((e) => e.signaux.map((s) => `${e.case_id} — ${s}`)), ...chrono(ok.map((e) => e.case_id))],
      conflicts: [
        `${ok.length} affaires se rattachent également bien : ${ok.map((e) => e.case_id).join(', ')}`,
        'même établissement n’implique pas même affaire (invariant Faidherbe)',
      ],
      requires_human_review: true,
      reason: 'ambiguïté réelle entre plusieurs affaires connues — aucune fusion automatique',
      examens: vus, t0, ...dp,
    });
  }

  // --- 3. Exactement une affaire se rattachement pleinement -------------
  if (ok.length === 1) {
    const gagnant = ok[0];
    // Un DOUTEUX concurrent partageant l'établissement reste une alerte.
    const concurrents = douteux.filter((e) => e.signaux.some((s) => s.startsWith('établissement')));
    // Un survivant unique APRÈS exclusion chronologique de rivales « OK » est une déduction, pas un rattachement plein :
    // POSSIBLE_MATCH, soumis à un humain (jamais de fusion automatique issue d'un départage).
    const parDepartage = okExclues.length > 0;
    return sortie({
      resolution_status: parDepartage ? 'POSSIBLE_MATCH' : 'MATCH',
      matched_case_id: gagnant.case_id,
      evidence: [...noteArbitrage, ...gagnant.signaux, ...chrono([gagnant.case_id])],
      conflicts: concurrents.length
        ? [`affaire(s) proche(s) non exclue(s) : ${concurrents.map((e) => e.case_id).join(', ')}`]
        : [],
      requires_human_review: concurrents.length > 0 || parDepartage,
      reason: parDepartage
        ? 'une seule affaire reste compatible après examen des sources et de la chronologie — à confirmer par un humain'
        : concurrents.length
          ? 'un seul rattachement complet, mais une affaire voisine partage l’établissement'
          : 'établissement, commune et rôle concordent pour une seule affaire',
      examens: vus, t0, ...dp,
    });
  }

  // --- 4. Indices convergents mais incomplets ---------------------------
  if (douteux.length) {
    return sortie({
      resolution_status: 'POSSIBLE_MATCH',
      matched_case_id: douteux.length === 1 ? douteux[0].case_id : null,
      evidence: [...noteArbitrage, ...douteux.flatMap((e) => e.signaux.map((s) => `${e.case_id} — ${s}`)), ...chrono(douteux.map((e) => e.case_id))],
      conflicts: douteux.flatMap((e) => e.manquants.map((m) => `${e.case_id} — ${m}`)),
      requires_human_review: true,
      reason: exclues.length && douteux.length === 1
        ? 'une seule affaire reste compatible après examen des sources et de la chronologie ; des éléments d’identification manquent'
        : 'rattachement partiel : des éléments d’identification manquent',
      examens: vus, t0, ...dp,
    });
  }

  // --- 5. Rien ----------------------------------------------------------
  return sortie({
    resolution_status: 'NO_MATCH',
    matched_case_id: null,
    evidence: [...noteArbitrage, ...noteExclusions],
    conflicts: [],
    requires_human_review: false,
    reason: index.length
      ? `aucune des ${index.length} affaires examinées ne se rattache`
      : 'index vide : aucune affaire connue sur ce territoire',
    examens: vus, t0, ...dp,
  });
}

function sortie({ examens, t0, ...r }) {
  return {
    ...r,
    resolver_version: RESOLVER_VERSION,
    llm_calls: 0,
    duree_ms: Date.now() - t0,
    examines: examens.length,
    detail: examens.map((e) => ({ case_id: e.case_id, rattachement: e.rattachement })),
    // affaires NOMMÉES dont le nom manque à l'article mais dont commune + rôle concordent (voir examiner)
    voisins: examens.filter((e) => e.voisin).map((e) => e.case_id),
  };
}
