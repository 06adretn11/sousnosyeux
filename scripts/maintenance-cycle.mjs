#!/usr/bin/env node
// =====================================================================
// scripts/maintenance-cycle.mjs
//
// Chaîne de maintenance : relie la veille existante à la qualification
// existante. Ne réinvente ni l'une ni l'autre.
//
//   watch-updates.mjs → [ CE SCRIPT ] → etat-affaire / DeepSeek → state_proposals
//                            │
//                            └──────────────────────────────────→ case_checks
//
// DEUX MODES.
//
//  ● par défaut — PAR CLAIM (MAINTENANCE LOOP #2)
//      résultats bruts
//        → routage prudent   (lib/routage-veille : titre = où regarder, jamais quoi croire)
//        → claims candidats  (regroupement sûr des redites)
//        → recherche de PREUVE par claim (lib/preuve-claim : établissement + commune +
//          acte, première source lisible qui nomme l'un et l'autre et énonce l'autre)
//        → compréhension (pipeline existant : contrat v2, gardes appel / finalité /
//          citation littérale, + garde de régression)
//        → propositions, sous validation humaine.
//      On ne cherche PLUS à résoudre l'URL Google News d'origine.
//
//  ● `--legacy` — l'ancien chemin (une URL à résoudre par fait, pont manuel
//      `data/maintenance-urls.json`). Conservé pour comparer AVANT/APRÈS sur
//      un même rapport de veille.
//
// Aucune écriture dans `cases`. `--dry-run` : entonnoir seul, 0 écriture en base
// (les pages et le modèle sont tout de même lus).
//
// Usage :
//   node scripts/maintenance-cycle.mjs --dry-run --moteur <modèle> --contrat v2
//   node scripts/maintenance-cycle.mjs --rapport <watch-report.json> --etat-du-rapport
//        └─ rejoue un rapport figé avec l'état judiciaire tel qu'il était DANS le rapport
//   --ignorer-connus   ne pas écarter les claims déjà couverts par `case_events`
//   --sans-memoire     rejeu : ignorer `case_checks.vus` (titres et claims mémorisés)
//   --sans-preuve      s'arrêter aux claims (aucune recherche, aucun modèle)
//   --legacy           ancien chemin
//   --case FR-2026-0029
//
// Sur poste Cdiscount : NODE_TLS_REJECT_UNAUTHORIZED=0.
// =====================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connecter } from './lib/neon.mjs';
import { extraireCorps } from './lib/corps-article.mjs';
import { etatAffaire, fingerprint, PRIMITIVE_VERSION } from './lib/etat-affaire.mjs';
import { comprendre, evidenceLitterale, contratVersion } from './lib/comprendre-source.mjs';
import { assurerArticle, enregistrerProposition } from './lib/persist-etat-affaire.mjs';
import {
  ROUTAGE_VERSION, construireContexte, router, clusteriser, cleClaim, lireCleClaim,
  claimDejaEtabli, requetePreuve, actes, estRegression, STAGE_ACTE, jetonsEtab, racineCommune,
  suffisance, entreeCache, entreeDepuisBase, evenementDejaValide,
} from './lib/routage-veille.mjs';
import { trouverSources, canonique } from './lib/preuve-claim.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = process.argv.slice(2);
const DRY = A.includes('--dry-run');
const LEGACY = A.includes('--legacy');
const SANS_PREUVE = A.includes('--sans-preuve');
const IGNORER_CONNUS = A.includes('--ignorer-connus');
const SANS_MEMOIRE = A.includes('--sans-memoire'); // rejeu : ni titres déjà vus, ni claims mémorisés
const ETAT_DU_RAPPORT = A.includes('--etat-du-rapport');
const val = (flag) => (A.includes(flag) ? A[A.indexOf(flag) + 1] : null);
const ONLY = val('--case');
const RAPPORT = val('--rapport');
// `rules` = déterministe local. Toute autre valeur = modèle OpenRouter.
// Mesuré sur `docs/industrialisation/gold-set-v1.json` : rules 4/12,
// gpt-5-nano 9/12. Le défaut reste `rules` tant que la décision n'est pas
// prise par un humain — ce script ne bascule pas de moteur tout seul.
const MOTEUR = val('--moteur') || 'rules';

// Contrat de compréhension. `--contrat v2` charge celui qui a été FIGÉ
// et mesuré en SOURCE_UNDERSTANDING #2 — importé, jamais recopié, pour
// qu'il n'existe qu'un seul texte de prompt et une seule empreinte.
const CONTRAT_V2 = val('--contrat') === 'v2';
const CONTRAT = CONTRAT_V2
  ? await import('./lib/source-understanding-contract.mjs')
  : null;

const UA = 'sousnosyeux-observatoire/0.1 (experimentation; contact@sousnosyeux.org)';
const DELAI_SANS_PREUVE_JOURS = 7; // un claim sans preuve est réessayé au bout d'une semaine

// --- clés stables -----------------------------------------------------
// L'identifiant Google News change d'un run à l'autre pour un même
// article : il ne peut pas servir de clé de mémoire. Le couple
// (titre normalisé, domaine éditeur) est stable.
const norm = (s) => (s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+-\s+[^-]*$/, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const domaine = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '?'; } };
const cle = (a) => `${norm(a.title)}|${domaine(a.source_domain || a.url || '')}`;

// --- entrées ----------------------------------------------------------
const rapport = JSON.parse(readFileSync(RAPPORT ? resolve(ROOT, RAPPORT) : resolve(ROOT, 'data/watch-report.json'), 'utf8'));
const pontPath = resolve(ROOT, 'data/maintenance-urls.json');
const pont = existsSync(pontPath) ? JSON.parse(readFileSync(pontPath, 'utf8')) : {};

const { sql } = connecter();

const fiches = await sql`
  select c.case_id, c.etablissement, c.commune, c.departement,
         c.type_structure::text as type_structure,
         c.role_mis_en_cause::text as role_mis_en_cause,
         c.type_affaire::text as type_affaire,
         c.statut_judiciaire::text as statut_judiciaire,
         c.enfants_concernes_public::text as enfants_concernes_public,
         (select json_agg(json_build_object('media', s.media, 'publication_date', s.publication_date, 'url', s.url))
            from sources s where s.case_id = c.case_id) as sources
  from cases c`;
const parId = new Map(fiches.map((f) => [f.case_id, f]));

// AFFAIRES SŒURS : même établissement, même commune, affaires distinctes (Aqueduc animateur /
// enseignant ; Saint-Dominique 7e). Mesuré au premier run réel : le verdict de l'animateur
// d'Aqueduc a produit trois propositions « condamnation » sur la fiche de l'ENSEIGNANT. Une
// source qui nomme l'établissement ne départage plus : le rôle doit être confirmé, et si les
// deux affaires ont le même rôle, plus rien ne peut trancher sans un humain (aucune fusion).
const cleEtab = (f) => `${jetonsEtab(f.etablissement, { saint: true }).join(' ')}|${racineCommune(f.commune)}`;
const parEtab = new Map();
for (const f of fiches) parEtab.set(cleEtab(f), [...(parEtab.get(cleEtab(f)) || []), f]);
const soeursDe = (f) => (parEtab.get(cleEtab(f)) || []).filter((x) => x.case_id !== f.case_id);

// Contexte de routage : tous les établissements connus (pour savoir qu'un titre
// parle d'ailleurs), les sources connues (chronologie), les événements validés.
const ctx = construireContexte({
  fiches,
  etablissements: await sql`select case_id, etablissement, commune from case_establishments`,
  derniereSource: new Map(fiches.map((f) => [f.case_id,
    (f.sources || []).map((s) => s.publication_date).filter(Boolean).map((d) => String(d).slice(0, 10)).sort().pop() || null])),
  // `--ignorer-connus` (rejeu d'un rapport figé) : les événements validés APRÈS le rapport ne
  // doivent pas dater l'état — ce serait utiliser l'avenir pour exclure du passé.
  evenements: IGNORER_CONNUS ? [] : await sql`select case_id, event_type::text as event_type, event_date::text as event_date,
                               statut_apres::text as statut_apres from case_events`,
});

// MÉMOIRE RÉVOCABLE. On ne retient que les examens conduits par la version
// COURANTE de la primitive. Un `vus` écrit par une version depuis corrigée
// ne doit plus faire écran : sinon réparer le moteur ne ferait jamais
// revenir les articles qu'il avait mal lus (cas `FR-2026-0029`, où le
// corps porte la condamnation et la primitive n'extrait rien).
// Le grain de révocation est (version de primitive, MOTEUR) : changer de
// moteur doit faire revenir les articles, sinon une mauvaise lecture
// resterait définitive. Mesuré : sans le filtre sur `engine`, les 12
// articles lus par `rules` ne repassaient jamais devant le modèle.
const checks = await sql`
  select case_id, vus, checked_at from case_checks
  where primitive_version is not distinct from ${PRIMITIVE_VERSION}
    and engine is not distinct from ${MOTEUR}`;
const dejaVus = new Map();
const claimsMemorises = new Map();
for (const c of SANS_MEMOIRE ? [] : checks) {
  if (!dejaVus.has(c.case_id)) dejaVus.set(c.case_id, new Set());
  for (const v of (c.vus || [])) {
    const cl = lireCleClaim(v);
    if (cl) {
      // « SANS_PREUVE » est réessayable : il expire. ETABLI / REJETE font écran.
      if ((cl.verdict === 'SANS_PREUVE' || cl.verdict === 'REVIEW_REQUIRED') && Date.now() - Date.parse(c.checked_at) > DELAI_SANS_PREUVE_JOURS * 864e5) continue;
      if (!claimsMemorises.has(cl.case_id)) claimsMemorises.set(cl.case_id, []);
      claimsMemorises.get(cl.case_id).push(cl);
    } else dejaVus.get(c.case_id).add(v);
  }
}

// Analyses déjà produites, par (affaire, article, empreinte, moteur).
// On garde aussi les faits et le rattachement : une analyse RÉUTILISÉE doit passer le
// même test de suffisance qu'une analyse neuve (citation littérale + acte du claim),
// sinon un vieux « STATE_CHANGE » ferait preuve pour n'importe quel claim.
const analysesFaites = new Map(
  (await sql`select case_id, article_id, content_fingerprint, engine, analysis_action,
                    facts, statut_propose, event_date::text as event_date,
                    payload->>'rattachement' as rattachement, payload->>'_claim' as claim,
                    payload->'_evidence' as ev, payload->>'_evidence_invalide' as evinv
             from state_proposals where analysis_action is not null`)
    .map((a) => [`${a.case_id}|${a.article_id}|${a.content_fingerprint}|${a.engine}`, entreeDepuisBase(a)]));

// ARBITRAGES HUMAINS PERSISTÉS. Un rattachement (affaire, article) déjà accepté par un humain
// (`state_proposals.decision = ACCEPT`, décideur non machine) n'est jamais redemandé : il remplace
// l'avis du modèle sur le rattachement. Aucune exception codée en dur — c'est la décision rendue
// le 25/09/2026 (ex. FR-2026-0027, « rattachement accepté humainement pour CE cas ») qui parle.
// Ce sont des DÉCISIONS, pas de la mémoire de cycle : `--sans-memoire` ne les ignore pas.
const arbitresPar = new Map();
for (const d of await sql`select p.case_id, a.url from state_proposals p join articles a using (article_id)
                          where p.decision = 'ACCEPT' and p.decided_by not ilike '%agent%' and a.url is not null`) {
  if (!arbitresPar.has(d.case_id)) arbitresPar.set(d.case_id, new Set());
  arbitresPar.get(d.case_id).add(canonique(d.url));
}
// Sources DÉJÀ examinées et fermées (HTTP 4xx) : `source_resolutions` (migration 012) les
// mémorise, réessayables au bout de 14 jours. Aucune table nouvelle.
const DELAI_ECHEC_JOURS = 14;
const echecsConnus = new Map(
  (SANS_MEMOIRE ? [] : await sql`select publisher_url, fetch_status, checked_at from source_resolutions
                                 where resolution_method = 'RECHERCHE_PAR_CLAIM' and fetch_status like 'HTTP 4%'`)
    .filter((e) => Date.now() - Date.parse(e.checked_at) < DELAI_ECHEC_JOURS * 864e5)
    .map((e) => [e.publisher_url, e.fetch_status]));
async function noterEchec(url, motif, case_id) {
  if (DRY) return;
  // La mémoire ne doit jamais tuer le cycle : une écriture ratée se dit, elle n'arrête rien.
  try {
    await sql`
    insert into source_resolutions (doc_key, case_ids, publisher_domain, publisher_url, resolution_method,
                                    fetch_status, failure_reason, checked_at)
    values (${'url|' + url}, ${JSON.stringify([case_id])}, ${domaine(url)}, ${url}, 'RECHERCHE_PAR_CLAIM',
            ${motif}, ${motif}, now())
    on conflict (doc_key) do update set fetch_status = excluded.fetch_status,
      failure_reason = excluded.failure_reason, checked_at = now(),
      case_ids = (select jsonb_agg(distinct v) from jsonb_array_elements(source_resolutions.case_ids || excluded.case_ids) v)`;
  } catch (e) { console.error(`  ! mémoire source non écrite (${String(e.message).slice(0, 80)})`); }
}
const SORTIE_DE_ACTION = { NO_CHANGE: 'NO_CHANGE', ENRICHMENT: 'NEW_SOURCE_NO_STATE_CHANGE',
  STATE_CHANGE: 'STATE_CHANGE_CANDIDATE', AMBIGUOUS: 'AMBIGUOUS' };

/** Compréhension par modèle, au même contrat de sortie que la primitive. */
async function viaModele({ fiche, article, modele, F }) {
  const { reponse, cout } = await comprendre({ fiche, article, modele, contrat: CONTRAT });
  F.appels_llm++;
  F.input_tokens += cout.input_tokens || 0;
  F.output_tokens += cout.output_tokens || 0;
  F.cout_usd += cout.cout_usd || 0;
  if (!reponse) throw new Error('JSON illisible rendu par le modèle');

  const inventees = evidenceLitterale(reponse, article.body);
  if (inventees.length) F.evidence_inventee++;

  // ---------------------------------------------------------------
  // GARDES DÉTERMINISTES — posées avant que quoi que ce soit atteigne
  // l'humain. Elles ne corrigent pas le modèle, elles rabattent ses
  // sorties vers l'abstention.
  // ---------------------------------------------------------------
  const gardes = [];
  const verifiees = (reponse.evidence || []).filter((e) => !inventees.includes(e));

  // GARDE A — APPEL. Mesuré en SOURCE_UNDERSTANDING #2 : sur l'article
  // de Vic-la-Gardiole, le modèle lit « la COUR D'APPEL a ordonné la
  // remise en liberté » et en déduit qu'un appel a été interjeté. Il
  // confond la juridiction avec la voie de recours. `appeal: YES`
  // n'est donc retenu que si une citation littérale porte un acte
  // d'interjection, et non le seul nom de la juridiction.
  // Première version trop étroite : elle ne couvrait pas l'imparfait, et
  // a dégradé à tort un appel réellement établi (« le parquet a annoncé
  // qu'il FAISAIT appel de cette relaxe », POC-09, premier cycle réel).
  // Le radical `fai\w*` couvre fait / faisait / faisant / faire.
  // La négative écarte « faire appel À » — recourir à quelqu'un — qui
  // n'est pas une voie de recours.
  // Éprouvée sur 12 formulations réelles : experiments/maintenance-2/test-garde-appel.mjs
  const ACTE_APPEL = /\b(?:fai\S*|f(?:ont|era|eront))\s+(?:un\s+)?appel(?!\s+(?:à|aux|au)\s)|\binterjet\S*\s+(?:un\s+)?appel\b|\bappel\s+(?:a été|est|avait été)\s+interjeté\b|\bse\s+pourvoi\S*/i;
  if (reponse.appeal === 'YES' && !verifiees.some((e) => ACTE_APPEL.test(e))) {
    gardes.push('GARDE_A_APPEL — « appel » non adossé à un acte d\'interjection cité : ramené à UNKNOWN');
    reponse.appeal = 'UNKNOWN';
  }

  // GARDE B — FINALITÉ. Pour ce premier cycle, aucun caractère
  // définitif n'est accepté automatiquement : la finalité n'est pas une
  // information de presse (SOURCE_EVIDENCE #1). UNKNOWN est une sortie
  // correcte.
  if (reponse.finality === 'DEFINITIVE') {
    gardes.push('GARDE_B_FINALITE — caractère définitif proposé : jamais accepté automatiquement, ramené à UNKNOWN');
    reponse.finality = 'UNKNOWN';
  }

  // EVIDENCE_INVALID — une proposition sans une seule citation
  // retrouvée mot pour mot ne doit pas atteindre l'humain comme preuve.
  const evidenceInvalide = (reponse.evidence || []).length > 0 && verifiees.length === 0;
  if (evidenceInvalide) gardes.push('EVIDENCE_INVALID — aucune citation retrouvée littéralement dans la source');

  // GARDE C — RÉGRESSION. Un article récent qui RACONTE une enquête ancienne
  // ne rouvre pas l'état : une proposition dont l'état cible est plus en
  // arrière que l'état courant n'est jamais une proposition de changement,
  // c'est une ambiguïté. Une régression n'est admise que si l'événement et
  // sa chronologie sont établis — ce que ce garde ne peut pas juger : il
  // rabat donc vers l'humain.
  // Vaut aussi pour AMBIGUOUS : une proposition « ambiguë » qui porterait quand même un état cible
  // en arrière (mesuré : Aqueduc, « procès » → « enquête ») resterait lisible comme une régression.
  const regression = ['STATE_CHANGE', 'AMBIGUOUS'].includes(reponse.expected_action)
    && estRegression(fiche.statut_judiciaire, reponse.resulting_state);
  if (regression) gardes.push(`GARDE_C_REGRESSION — « ${fiche.statut_judiciaire} » → « ${reponse.resulting_state} » : régression non établie, ramenée à AMBIGUOUS`);

  // Le modèle ne respecte pas toujours le schéma : observé `event_date`
  // à "UNKNOWN" au lieu de null, ce que Postgres refuse. On n'accepte
  // qu'une date ISO ; tout le reste devient null. Ne jamais faire
  // confiance à la forme de la réponse, seulement à son contenu.
  const dateISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
  const etat = (v) => (v && v !== 'UNKNOWN' && v !== 'null' ? v : null);

  // Une evidence invalide bloque la proposition : on retombe sur une
  // demande de relecture, jamais sur un changement d'état.
  const change = !evidenceInvalide && !regression
    && (reponse.expected_action === 'STATE_CHANGE' || reponse.expected_action === 'AMBIGUOUS');
  return {
    case_id: fiche.case_id,
    article_id: article.article_id,
    content_fingerprint: article.content_fingerprint,
    version: CONTRAT_V2 ? CONTRAT.CONTRAT_VERSION : contratVersion(),
    _gardes: gardes,
    _evidence_invalide: evidenceInvalide,
    _claim: reponse.claim || null,
    _scope: reponse.scope || null,
    _evidence: verifiees,
    rattachement: reponse.relevant_to_case === false ? 'NON_RATTACHABLE'
      : (reponse.relevant_to_case === 'AMBIGU' ? 'DOUTEUX' : 'OK'),
    CURRENT_STATE: { statut_judiciaire: fiche.statut_judiciaire },
    PROPOSED_CHANGE: change && etat(reponse.resulting_state) ? { vers: reponse.resulting_state } : 'NO_CHANGE',
    statut_propose: change ? etat(reponse.resulting_state) : null,
    EVENT_DATE: dateISO(reponse.event_date),
    SOURCE_DATE: article.publication_date || null,
    transition: null,
    // Le contrat v2 rend DEFINITIVE / NON_DEFINITIVE / UNKNOWN ; la
    // colonne n'accepte que definitive / non_definitive / inconnue.
    // Traduction au seul point de contact avec la base — ni le contrat
    // figé ni le schéma ne sont touchés.
    finalite: { DEFINITIVE: 'definitive', NON_DEFINITIVE: 'non_definitive', UNKNOWN: 'inconnue' }[reponse.finality]
      ?? etat(reponse.finality),
    surveillance: reponse.appeal === 'YES' ? [{ code: 'APPEL_EN_COURS', motif: 'appel rapporté par la source' }] : [],
    inconnues: reponse.appeal === 'UNKNOWN' ? ['finalité de la décision inconnue'] : [],
    RATIONALE: `${reponse.expected_action} — ${modele} · ${(reponse.evidence || []).slice(0, 2).join(' | ') || 'sans citation'}`,
    REQUIRES_HUMAN_REVIEW: true,
    review_reasons: [...(inventees.length ? ['citation non littérale rendue par le modèle'] : []),
      ...gardes.filter((g) => g.startsWith('GARDE_C') || g.startsWith('EVIDENCE_INVALID'))],
    NEW_EVIDENCE: { events: dateISO(reponse.event_date) ? [{ event_type: reponse.event_type, event_date: dateISO(reponse.event_date) }] : [] },
    _action_modele: regression ? 'AMBIGUOUS' : reponse.expected_action,
    // Un « fait » adossé à une citation fabriquée n'est pas un fait. La
    // migration 009 documente `facts` comme portant des citations
    // littérales : le code doit l'appliquer, pas seulement le promettre.
    // On ne conserve que les citations retrouvées mot pour mot dans le
    // corps, et on n'écrit aucun fait s'il n'en reste aucune.
    _facts: (() => {
      if (!reponse.event_type) return [];
      const verifiees = (reponse.evidence || []).filter((e) => !inventees.includes(e));
      if (!verifiees.length) return [];
      return [{
        event_type: reponse.event_type, event_date: dateISO(reponse.event_date),
        resulting_state: etat(reponse.resulting_state), finality: etat(reponse.finality),
        appeal: reponse.appeal, evidence: verifiees,
      }];
    })(),
  };
}

// --- entonnoir --------------------------------------------------------
const F = {
  affaires: 0, bruts: 0, deja_vus: 0, doublons: 0, non_pertinents: 0,
  candidats: 0, corroborants: 0, representants: 0,
  url_non_resolue: 0, fetch_echoue: 0, qualifies: 0,
  NO_CHANGE: 0, NEW_SOURCE_NO_STATE_CHANGE: 0, STATE_CHANGE_CANDIDATE: 0,
  AMBIGUOUS: 0, SOURCE_ACCESS_BLOCKED: 0, SOURCE_REVIEW_REQUIRED: 0,
  propositions_ecrites: 0, propositions_deja_presentes: 0,
  appels_llm: 0, fetches: 0, octets: 0,
  analyses_ecrites: 0, analyses_reutilisees: 0, evidence_inventee: 0,
  input_tokens: 0, output_tokens: 0, cout_usd: 0,
  // --- mode par claim ---
  routage_version: ROUTAGE_VERSION,
  POTENTIAL_UPDATE: 0, CONTEXT_ONLY: 0, WRONG_SCOPE_CERTAIN: 0,
  HISTORICAL_OR_ALREADY_KNOWN_CERTAIN: 0, UNCERTAIN: 0,
  continuent: 0, claims: 0, claims_deja_verifies: 0, claims_deja_etablis: 0, claims_a_prouver: 0,
  recherches_preuve: 0, claims_avec_candidat: 0, claims_preuve_suffisante: 0,
  claims_lus_sans_preuve: 0, claims_sans_source: 0, claims_stop_sans_preuve: 0,
  decisions_deja_prises: 0, claims_ambiguite_nouvelle: 0, claims_arbitre_preuve: 0,
  claims_changement_etat: 0, claims_depasses: 0, claims_meme_document: 0, pages_deja_inaccessibles: 0, garde_regression: 0, regression_evitee: 0, docs_lus_par_modele: 0,
};
const detail = [];
const t0 = Date.now();
const cacheDocs = new Map();       // url → page lue, partagé entre claims et affaires
const cacheAnalyses = new Map();   // (affaire|url) → sortie, un même document ne paie qu'une lecture

/**
 * Qualifie UNE source pour UNE affaire. Le corps est déjà lu (`page`) ou
 * récupéré ici. Factorisé pour servir les deux modes sans dupliquer les gardes.
 * @returns {object} { sortie, suffisante, acte_etabli, ...détail }
 */
// Un document établit CE claim seulement si l'événement qu'il date tombe dans la fenêtre du
// claim (−30 j / +10 j : un article rappelle un fait récent, il n'annonce pas le passé
// lointain). Sans elle, une recherche par acte « établissait » le verdict d'un autre jour :
// l'audience du 26/06 par le verdict du 10/07, une plainte du 18/06 par la détention du 22/05.
// Sans date écrite, ou sans fenêtre, on ne peut pas juger : la condition tombe.
const JOUR_MS = 864e5;
const dateCoherente = (eventDate, fenetre) => {
  if (!eventDate || !fenetre?.debut) return true;
  const e = Date.parse(eventDate);
  return e >= Date.parse(fenetre.debut) - 30 * JOUR_MS && e <= Date.parse(fenetre.fin || fenetre.debut) + 10 * JOUR_MS;
};

async function qualifierSource({ r, fiche, c, url, mediaLu, page = null, acte = null, fenetre = null, arbitre = false }) {
  let corps = '';
  if (page?.ok) corps = page.corps;
  else {
    try {
      F.fetches++;
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) });
      const html = await res.text();
      F.octets += Buffer.byteLength(html);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ({ corps } = extraireCorps(html));
      if (!corps) throw new Error('structure de page non reconnue');
    } catch (e) {
      F.fetch_echoue++; F.SOURCE_ACCESS_BLOCKED++;
      return { cle: c.cle, titre: c.title, url, sortie: 'SOURCE_ACCESS_BLOCKED', motif: String(e.message), bloque: true };
    }
  }

  const article = {
    article_id: 'ART-' + fingerprint(url).slice(0, 10),
    media: mediaLu || c.media || domaine(c.source_domain || ''),
    publication_date: c.published || null,
    url,
    body: corps,
    content_fingerprint: fingerprint(corps),
  };

  // MÉMOIRE D'ANALYSE. Une analyse est identifiée par
  // (affaire, article, empreinte de contenu, moteur). Si elle existe
  // déjà, on ne la repaie pas — c'est tout l'objet du second cycle.
  // Si l'empreinte change, l'article a été modifié : réanalyse.
  const cleAnalyse = `${r.case_id}|${article.article_id}|${article.content_fingerprint}|${MOTEUR}`;
  if (analysesFaites.has(cleAnalyse)) {
    F.analyses_reutilisees++;
    const prev = analysesFaites.get(cleAnalyse);
    const s = SORTIE_DE_ACTION[prev.analysis_action] || 'AMBIGUOUS';
    F[s]++;
    const { acteEtabli, suffisante } = suffisance({
      moteur: MOTEUR, rattachement: prev.rattachement, evidence: prev.evidence, evidenceInvalide: prev.evidence_invalide,
      acte, dateOk: dateCoherente(prev.event_date, fenetre), arbitre,
    });
    return {
      cle: c.cle, titre: c.title, url, media: article.media, published: c.published, sortie: s, reutilisee: true,
      rattachement: prev.rattachement, statut_propose: prev.statut_propose, event_date: prev.event_date,
      claim_modele: prev.claim, evidence: prev.evidence, acte_etabli: acteEtabli, suffisante, arbitre,
    };
  }

  // Un document lent ou un modèle qui ne répond pas ne doit pas tuer
  // le cycle : constaté sur ce premier run réel, un seul TimeoutError
  // non capturé a emporté les 56 affaires après 6 min. Le candidat
  // sort en SOURCE_REVIEW_REQUIRED et le cycle continue.
  let out;
  try {
    out = MOTEUR === 'rules'
      ? await etatAffaire({ fiche, article, engine: 'rules' })
      : await viaModele({ fiche, article, modele: MOTEUR, F });
  } catch (e) {
    F.SOURCE_REVIEW_REQUIRED++;
    return {
      cle: c.cle, titre: c.title, media: c.media, domaine: domaine(c.source_domain || c.url || ''),
      published: c.published, url, sortie: 'SOURCE_REVIEW_REQUIRED',
      motif: e.name === 'TimeoutError' ? 'MODELE_TIMEOUT' : `ERREUR:${String(e.message).slice(0, 60)}`,
    };
  }
  // Une sœur de même rôle : rien ne départage les deux fiches. La proposition d'état est retirée,
  // l'analyse reste (AMBIGUOUS) avec sa raison — c'est l'humain qui rattache (invariant Faidherbe).
  const memeRole = soeursDe(fiche).filter((x) => x.role_mis_en_cause === fiche.role_mis_en_cause);
  if (memeRole.length && out.statut_propose) {
    out.review_reasons = [...(out.review_reasons || []), `AFFAIRE_SOEUR — même établissement, même commune, même rôle que ${memeRole.map((x) => x.case_id).join(', ')} : rattachement à trancher par un humain`];
    out.statut_propose = null; out.PROPOSED_CHANGE = 'NO_CHANGE'; out._action_modele = 'AMBIGUOUS';
  }
  // Un fait DÉJÀ validé par un humain (`case_events`) n'est pas redemandé : même état cible, même date
  // écrite. Mesuré au run réel : 3 propositions « condamnation du 15/09 » sur FR-2026-0004, fait validé
  // le 25/09 (fiche sous HOLD, donc l'état global n'a pas bougé).
  const dejaTranche = evenementDejaValide(ctx.evenements, fiche.case_id, out.statut_propose, out.EVENT_DATE, article.publication_date);
  if (dejaTranche) {
    out.review_reasons = [...(out.review_reasons || []), `DECISION_HUMAINE_EXISTANTE — ${dejaTranche.event_type} du ${String(dejaTranche.event_date).slice(0, 10)} déjà validé`
      + (dejaTranche.rapproche_par_publication ? ' (date du fait non écrite : rapproché par la date de publication)' : '')];
    out.statut_propose = null; out.PROPOSED_CHANGE = 'NO_CHANGE'; out._action_modele = 'ENRICHMENT';
    F.decisions_deja_prises++;
  }
  F.qualifies++;
  F.docs_lus_par_modele += MOTEUR === 'rules' ? 0 : 1;
  // `viaModele` compte ses propres appels ; la primitive expose les siens.
  F.appels_llm += out.instrumentation?.llm_calls || 0;
  if (out._gardes?.some((g) => g.startsWith('GARDE_C'))) F.garde_regression++;

  // La catégorie B n'était pas atteignable : aucune branche ne la
  // produisait, si bien que son 0 était tautologique. Elle l'est
  // désormais — un article qui ne change pas l'état mais pose une
  // surveillance, une inconnue ou un événement daté a une valeur
  // documentaire propre (échéance, recours, réponse institutionnelle).
  const aGarder = (out.surveillance || []).length
    || (out.inconnues || []).length
    || (out.NEW_EVIDENCE?.events || []).some((e) => e.event_date);

  let sortie;
  if (out._action_modele) {
    // Le modèle rend directement la catégorie métier ; on la traduit
    // sans la réinterpréter, sauf pour le vocabulaire de l'entonnoir.
    sortie = { NO_CHANGE: 'NO_CHANGE', ENRICHMENT: 'NEW_SOURCE_NO_STATE_CHANGE',
      STATE_CHANGE: 'STATE_CHANGE_CANDIDATE', AMBIGUOUS: 'AMBIGUOUS' }[out._action_modele] || 'AMBIGUOUS';
  } else if (out.rattachement === 'NON_RATTACHABLE') sortie = 'NO_CHANGE';
  else if (out.PROPOSED_CHANGE === 'NO_CHANGE') {
    sortie = aGarder ? 'NEW_SOURCE_NO_STATE_CHANGE' : 'NO_CHANGE';
  } else if (out.rattachement === 'DOUTEUX') sortie = 'AMBIGUOUS';
  else sortie = 'STATE_CHANGE_CANDIDATE';
  F[sortie]++;

  // --- garde-fou de fiabilité ---------------------------------------
  // Le moteur `rules` a été validé sur des corps d'articles RECONSTITUÉS
  // (`fixtures/articles/README.md`), pas sur de la prose de presse
  // réelle. Premier passage sur corps réels, le 24/09/2026 : 5
  // qualifications justes sur 12 — faux négatif sur Chauny (le corps
  // porte « jugé ce mardi 3 mars 2026 » et « 24 mois de prison », la
  // primitive conclut NO_CHANGE), transition régressive erronée sur Gap,
  // relaxe lue comme « procès » sur Baudin.
  //
  // Tant que cette fiabilité n'est pas rétablie, AUCUNE proposition ne
  // sort d'ici sans revue humaine, quel que soit l'avis de la primitive.
  if (out.REQUIRES_HUMAN_REVIEW !== true) {
    out.REQUIRES_HUMAN_REVIEW = true;
    out.review_reasons = [...(out.review_reasons || []),
      'moteur `rules` non validé sur corps de presse réels (5/12 justes au cycle du 24/09/2026) — revue obligatoire'];
  }

  // `state_proposals` porte des propositions de CHANGEMENT D'ÉTAT. Un
  // enrichissement sans changement d'état n'en est pas une : l'y écrire
  // avec un `statut_propose` nul détournerait son contrat. Il reste dans
  // l'artefact expérimental tant qu'aucune structure existante ne
  // convient — et aucune ne convient aujourd'hui.
  // TOUTE analyse est persistée, y compris NO_CHANGE : « cet article a
  // été lu et ne change rien » est un fait à mémoriser, pas une absence
  // de ligne. C'est ce qui évite de le repayer au cycle suivant.
  const ACTION = { NO_CHANGE: 'NO_CHANGE', NEW_SOURCE_NO_STATE_CHANGE: 'ENRICHMENT',
    STATE_CHANGE_CANDIDATE: 'STATE_CHANGE', AMBIGUOUS: 'AMBIGUOUS' }[sortie];
  // MÉMOIRE DANS LE RUN. Deux claims d'une même affaire qui aboutissent au même document ne
  // paient qu'une lecture. Mesuré au premier run réel : 105 appels modèle, dont 40 relisaient un
  // document déjà analysé quelques minutes plus tôt (l'insertion tombait sur « déjà présente »).
  analysesFaites.set(cleAnalyse, entreeCache(out, ACTION));
  if (!DRY) {
    await assurerArticle(sql, article);
    const p = await enregistrerProposition(sql, {
      ...out, article_id: article.article_id,
      version: out.version || PRIMITIVE_VERSION,
      engine: MOTEUR, analysis_action: ACTION, facts: out._facts || [],
    });
    if (p.deja_presente) F.propositions_deja_presentes++;
    else if (ACTION === 'STATE_CHANGE' || ACTION === 'AMBIGUOUS') F.propositions_ecrites++;
    else F.analyses_ecrites++;
  }

  // SUFFISANCE (doctrine SOURCE_EVIDENCE) : la source est rattachée par le
  // modèle, au moins une citation est retrouvée MOT POUR MOT, et cette
  // citation énonce l'acte du claim. Décidé sur la citation, jamais sur le titre.
  const evidence = out._evidence || [];
  const { acteEtabli, suffisante } = suffisance({
    moteur: MOTEUR, rattachement: out.rattachement, evidence, evidenceInvalide: out._evidence_invalide,
    acte, dateOk: dateCoherente(out.EVENT_DATE, fenetre), arbitre,
  });

  return {
    cle: c.cle, titre: c.title, url, media: article.media, published: c.published,
    sortie, rattachement: out.rattachement, corroborants: c.corroborants || [],
    statut_avant: out.CURRENT_STATE?.statut_judiciaire || null,
    statut_propose: out.statut_propose, event_date: out.EVENT_DATE,
    finalite: out.finalite, transition: out.transition,
    claim_modele: out._claim || null, evidence,
    gardes: out._gardes || [],
    requires_human_review: out.REQUIRES_HUMAN_REVIEW,
    review_reasons: out.review_reasons, rationale: out.RATIONALE,
    suffisante, acte_etabli: acteEtabli,
  };
}

// =====================================================================
// BOUCLE PAR AFFAIRE
// =====================================================================
for (const r of rapport.results) {
  if (ONLY && r.case_id !== ONLY) continue;
  const base = parId.get(r.case_id);
  if (!base) { detail.push({ case_id: r.case_id, note: 'absente de Neon' }); continue; }
  // Rejeu d'un rapport figé : l'état est celui que la veille avait vu.
  const fiche = ETAT_DU_RAPPORT && r.statut_judiciaire ? { ...base, statut_judiciaire: r.statut_judiciaire } : base;

  F.affaires++;
  const bruts = r.new_articles || [];
  F.bruts += bruts.length;

  const vus = dejaVus.get(r.case_id) || new Set();
  const dansCeRun = new Set();
  const datesSources = (fiche.sources || []).map((s) => s.publication_date).filter(Boolean).sort();
  const plusAncienne = datesSources[0] ? String(datesSources[0]).slice(0, 10) : null;

  const candidats = [];

  // MÉMOIRE ET RECALL. Un contenu n'entre dans `vus` que s'il a réellement
  // été EXAMINÉ : qualifié par la primitive (ou couvert par un claim établi).
  // Un candidat resté sans preuve n'a rien reçu du tout — le mémoriser le
  // ferait disparaître silencieusement au cycle suivant. Les exclusions de
  // ROUTAGE ne sont jamais mémorisées : elles se recalculent, gratuitement.
  const vusCeRun = [];
  let nDejaVus = 0, nDoublons = 0, nNonPertinents = 0, nBloques = 0;

  for (const a of bruts) {
    const k = cle(a);

    if (vus.has(k)) { F.deja_vus++; nDejaVus++; vusCeRun.push(k); continue; }
    if (dansCeRun.has(k)) { F.doublons++; nDoublons++; vusCeRun.push(k); continue; }
    dansCeRun.add(k);

    // Ancienne exclusion : antérieur à la toute première source connue ET
    // sans terme d'évolution. Elle jugeait sur la DATE seule — une date de
    // publication n'est pas une date d'événement (page datée du 26/06 mise à
    // jour avec le verdict du 10/07). Remplacée, en mode par claim, par le
    // routage (acte + stade + chronologie).
    if (LEGACY && plusAncienne && a.published && a.published < plusAncienne && !a.evolution) {
      F.non_pertinents++; nNonPertinents++; vusCeRun.push(k); continue;
    }
    candidats.push({ ...a, cle: k });
  }
  F.candidats += candidats.length;

  const sorties = [];

  if (LEGACY) {
    // --- regroupement des redites (ancien chemin) ----------------------
    // Regroupe par (transition suggérée, semaine calée sur 1970). Deux
    // défauts connus : la semaine scinde une redite à cheval sur deux
    // semaines, et le représentant est choisi par date, pas par valeur
    // probante. Conservé tel quel pour la comparaison.
    const semaine = (d) => (d ? Math.floor(Date.parse(d) / 6048e5) : 'nd');
    const groupes = new Map();
    for (const c of candidats) {
      const g = c.evolution ? `${c.evolution.suggests}|${semaine(c.published)}` : `__solo__|${c.cle}`;
      if (!groupes.has(g)) groupes.set(g, []);
      groupes.get(g).push(c);
    }
    const representants = [];
    for (const [, membres] of groupes) {
      membres.sort((x, y) => String(x.published || '').localeCompare(String(y.published || '')));
      const [tete, ...reste] = membres;
      tete.corroborants = reste.map((m) => ({ media: m.media, published: m.published, titre: m.title, cle: m.cle }));
      F.corroborants += reste.length;
      representants.push(tete);
    }
    F.representants += representants.length;

    for (const c of representants) {
      // Le pont accepte une URL nue, ou { url, media } quand la source
      // réellement récupérable n'est pas le média que Google News a mis en
      // tête du groupe. C'est le média RÉELLEMENT lu qui est consigné.
      const p = pont[c.cle] || null;
      const url = typeof p === 'string' ? p : (p && p.url) || null;
      const mediaLu = (p && typeof p === 'object' && p.media) || null;
      if (!url) {
        F.url_non_resolue++; F.SOURCE_ACCESS_BLOCKED++; nBloques++;
        sorties.push({ cle: c.cle, titre: c.title, media: c.media, domaine: domaine(c.source_domain || ''),
          published: c.published, evolution: c.evolution || null, corroborants: c.corroborants || [],
          sortie: 'SOURCE_ACCESS_BLOCKED', motif: 'URL_NON_RESOLUE' });
        continue;
      }
      const s = await qualifierSource({ r, fiche, c, url, mediaLu });
      if (s.bloque) nBloques++;
      else vusCeRun.push(c.cle);
      sorties.push(s);
    }
  } else {
    // -----------------------------------------------------------------
    // 1. ROUTAGE — le titre décide où regarder, jamais ce qui est vrai
    // -----------------------------------------------------------------
    const continuent = [];
    const ecartes = [];
    for (const c of candidats) {
      const x = router({ titre: c.title, published: c.published, fiche, ctx });
      F[x.route]++;
      const item = { ...c, titre: c.title, route: x.route, regle: x.regle, actes: x.actes, primaire: x.primaire, raisons: x.raisons };
      if (x.route === 'POTENTIAL_UPDATE' || x.route === 'UNCERTAIN') { continuent.push(item); F.continuent++; }
      else { ecartes.push(item); nNonPertinents++; }
    }

    // -----------------------------------------------------------------
    // 2. CLAIMS — regroupement sûr, puis mémoire et événements validés
    // -----------------------------------------------------------------
    const claims = clusteriser(continuent);
    F.claims += claims.length;
    const memo = claimsMemorises.get(r.case_id) || [];
    const trois = 3 * 864e5;
    const aProuver = [];
    for (const cl of claims) {
      const dejaVerifie = memo.find((m) => m.acte === cl.acte && m.debut !== 'nd' && cl.debut
        && Date.parse(cl.debut) <= Date.parse(m.fin) + trois && Date.parse(cl.fin) >= Date.parse(m.debut) - trois);
      if (dejaVerifie) { F.claims_deja_verifies++; cl.statut = `DEJA_VERIFIE_${dejaVerifie.verdict}`; continue; }
      const connu = IGNORER_CONNUS ? null : claimDejaEtabli({ case_id: r.case_id, claim: cl, evenements: ctx.evenements });
      if (connu) { F.claims_deja_etablis++; cl.statut = 'DEJA_ETABLI'; cl.evenement_connu = `${connu.event_type} ${connu.event_date || 'sans date'}`; continue; }
      aProuver.push(cl);
    }
    F.claims_a_prouver += aProuver.length;

    // -----------------------------------------------------------------
    // 3. PREUVE PAR CLAIM — première source suffisante, puis on s'arrête
    // -----------------------------------------------------------------
    const clesParClaim = new Map();
    for (const cl of claims) {
      const s = { acte: cl.acte, debut: cl.debut, fin: cl.fin, redites: cl.items.length,
        titres: cl.items.map((i) => `${i.published} ${i.title}`).slice(0, 4), statut: cl.statut || null,
        evenement_connu: cl.evenement_connu || null };
      clesParClaim.set(s, cl.items.map((i) => i.cle));
      if (!aProuver.includes(cl)) { sorties.push({ claim: s }); continue; }
      if (SANS_PREUVE) { sorties.push({ claim: s, sortie: 'CLAIM_NON_PROUVE_PAR_CHOIX' }); continue; }

      const tete = cl.items[0];
      const requetes = requetePreuve({ fiche, claim: cl });
      let essai = null;

      // Un pont manuel reste prioritaire : il a été fourni par un humain.
      const p = cl.items.map((i) => pont[i.cle]).find(Boolean) || null;
      let cands = [];
      {
        // Le pont manuel n'est plus un court-circuit : ses adresses sont CONTRÔLÉES comme toutes les autres.
        const imposes = p ? [{ url: typeof p === 'string' ? p : p.url, media: (typeof p === 'object' && p.media) || tete.media }] : null;
        essai = await trouverSources({ fiche, claim: cl, requetes, cache: cacheDocs, F, echecsConnus, noterEchec,
          exigerRole: soeursDe(fiche).length > 0, imposes, arbitres: arbitresPar.get(r.case_id) });
        cands = essai.candidats;
        s.via = p ? 'PONT_MANUEL_CONTROLE' : 'RECHERCHE_PAR_CLAIM';
        s.requetes = essai.requetes; s.resultats_vus = essai.vus; s.pages_ouvertes = essai.ouvertes;
        s.rejets = essai.rejets.map((x) => `${x.motif} ${x.url.slice(0, 70)}`);
        if (essai.erreurs.length) s.erreurs = essai.erreurs;
      }
      // Une page qui NOMME l'établissement mais dont le rôle n'est pas confirmé (affaire sœur) n'est pas
      // « sans source » : c'est une ambiguïté jamais arbitrée, à rendre à un humain (REVIEW_REQUIRED).
      const ambigueSoeur = (essai?.rejets || []).some((x) => x.motif === 'AFFAIRE_SOEUR_ROLE_NON_CONFIRME');
      if (!cands.length) {
        nBloques++;
        if (ambigueSoeur) {
          F.claims_ambiguite_nouvelle++;
          s.sortie = 'REVIEW_REQUIRED'; s.motif = 'AFFAIRE_SOEUR_JAMAIS_ARBITREE'; s.verdict = 'REVIEW_REQUIRED';
        } else {
          F.claims_sans_source++;
          s.sortie = 'SOURCE_REVIEW_REQUIRED'; s.motif = 'AUCUNE_SOURCE_LISIBLE_NOMMANT_ETABLISSEMENT_ET_COMMUNE';
          s.verdict = 'SANS_PREUVE';
        }
        sorties.push({ claim: s });
        continue;
      }
      F.claims_avec_candidat++;

      // On essaie les candidats dans l'ordre ; on s'arrête à la première
      // source SUFFISANTE. Une source rejetée par le modèle (autre affaire,
      // acte absent de ses citations) est mémorisée comme analyse et l'on
      // passe à la suivante — sans jamais en exiger deux par principe.
      let retenue = null;
      const essais = [];
      for (const cd of cands.slice(0, 3)) {
        const c = { ...tete, cle: tete.cle, title: tete.title, media: cd.media, published: cd.published || tete.published, corroborants: cl.items.slice(1).map((m) => ({ media: m.media, published: m.published, titre: m.title })) };
        const q = await qualifierSource({ r, fiche, c, url: cd.url, mediaLu: cd.media, page: cd.page, acte: cl.acte, fenetre: { debut: cl.debut, fin: cl.fin }, arbitre: cd.arbitre === true });
        essais.push({ url: cd.url, media: cd.media, sortie: q.sortie, rattachement: q.rattachement, suffisante: !!q.suffisante, acte_etabli: q.acte_etabli, motif: q.motif || null });
        if (q.suffisante) { retenue = q; break; }
      }
      s.essais = essais;
      if (retenue) {
        F.claims_preuve_suffisante++;
        if (retenue.arbitre) F.claims_arbitre_preuve++;
        if (retenue.sortie === 'STATE_CHANGE_CANDIDATE' || retenue.sortie === 'AMBIGUOUS') F.claims_changement_etat++;
        s.sortie = retenue.sortie; s.preuve = retenue; s.verdict = 'ETABLI';
        for (const i of cl.items) vusCeRun.push(i.cle);
      } else if (ambigueSoeur || essais.some((e) => e.rattachement === 'DOUTEUX')) {
        // Source lue, rattachement douteux et jamais arbitré : on ne tranche pas, on rend à l'humain.
        F.claims_ambiguite_nouvelle++; nBloques++;
        s.sortie = 'REVIEW_REQUIRED'; s.motif = 'RATTACHEMENT_DOUTEUX_JAMAIS_ARBITRE'; s.verdict = 'REVIEW_REQUIRED';
      } else {
        F.claims_lus_sans_preuve++; nBloques++;
        s.sortie = 'SOURCE_REVIEW_REQUIRED'; s.motif = 'SOURCES_LUES_NON_SUFFISANTES';
        s.verdict = 'SANS_PREUVE';
      }
      sorties.push({ claim: s });
      process.stderr.write(`  · ${r.case_id} ${cl.acte} (${cl.items.length}) → ${s.verdict || s.sortie}\n`);
    }

    // CONVERGENCE PAR LA PREUVE. Une source lue pour un claim peut énoncer, dans ses citations
    // littérales, l'acte d'un AUTRE claim de la même affaire (l'article de l'appel qui rappelle la
    // relaxe, et inversement). Ce claim n'a alors pas besoin d'une recherche de plus : la même
    // citation l'établit. Même conditions que pour une preuve propre — rattachement, citation
    // retrouvée mot pour mot, acte énoncé dans la citation, date cohérente avec la fenêtre.
    const preuves = sorties.filter((x) => x.claim?.preuve).map((x) => x.claim.preuve);
    for (const x of sorties) {
      const c = x.claim;
      if (!c || c.verdict !== 'SANS_PREUVE' || c.acte === 'NON_QUALIFIE') continue;
      const p = preuves.find((e) => e.rattachement === 'OK' && (e.evidence || []).length > 0
        && actes(e.evidence.join(' ')).includes(c.acte) && dateCoherente(e.event_date, { debut: c.debut, fin: c.fin }));
      if (!p) continue;
      if (c.motif === 'AUCUNE_SOURCE_LISIBLE_NOMMANT_ETABLISSEMENT_ET_COMMUNE') F.claims_sans_source--; else F.claims_lus_sans_preuve--;
      c.verdict = 'ETABLI'; c.via = 'MEME_DOCUMENT'; c.preuve = p; c.sortie = p.sortie; c.motif = null;
      F.claims_preuve_suffisante++; F.claims_meme_document++; nBloques--;
      if (p.sortie === 'STATE_CHANGE_CANDIDATE' || p.sortie === 'AMBIGUOUS') F.claims_changement_etat++;
      for (const k of clesParClaim.get(c) || []) vusCeRun.push(k);
    }

    // CLAIMS DÉPASSÉS. Un claim d'un stade procédural inférieur, sans preuve propre, dont un
    // claim ÉTABLI de stade supérieur pour la même affaire date de la même période ou d'après
    // (l'audience et la peine d'un procès que son verdict établit) n'est plus une question
    // ouverte : il n'est pas prouvé, il est dépassé. Il ne compte pas comme « sans preuve »
    // et ne valide rien — il cesse simplement d'être à chercher. Le stade est celui de l'acte.
    const etablis = sorties.filter((x) => x.claim?.verdict === 'ETABLI').map((x) => x.claim);
    for (const x of sorties) {
      const c = x.claim;
      if (!c || c.verdict !== 'SANS_PREUVE' || STAGE_ACTE[c.acte] == null) continue;
      const depasse = etablis.find((e) => STAGE_ACTE[e.acte] != null && STAGE_ACTE[e.acte] > STAGE_ACTE[c.acte]
        && c.fin && e.fin && Date.parse(e.fin) >= Date.parse(c.fin) - 864e5);
      if (depasse) {
        c.verdict = 'DEPASSE'; c.depasse_par = `${depasse.acte} ${depasse.debut}`;
        F.claims_depasses++; nBloques--;
        if (c.motif === 'AUCUNE_SOURCE_LISIBLE_NOMMANT_ETABLISSEMENT_ET_COMMUNE') F.claims_sans_source--;
        else F.claims_lus_sans_preuve--;
      }
    }

    // Mémoire de claim : établi (fait écran), sans preuve (expire au bout de 7 jours).
    for (const x of sorties) {
      if (x.claim?.verdict) vusCeRun.push(`${cleClaim(r.case_id, { acte: x.claim.acte, debut: x.claim.debut, fin: x.claim.fin })}|${x.claim.verdict}`);
    }
    if (ecartes.length) sorties.push({ ecartes: ecartes.map((e) => ({ route: e.route, regle: e.regle, published: e.published, titre: e.title, raisons: e.raisons })) });
  }

  // Un résultat qui ne ment pas. Une affaire dont rien n'a été lu n'a PAS
  // été examinée : l'écrire NOUVEAUTE_DETECTEE ou NO_NEW_INFORMATION serait faux.
  const lus = LEGACY
    ? sorties.filter((s) => s.sortie !== 'SOURCE_ACCESS_BLOCKED')
    : sorties.filter((s) => s.claim?.preuve).map((s) => ({ sortie: s.claim.sortie }));
  const attenduLire = LEGACY ? candidats.length : sorties.filter((s) => s.claim && (s.claim.via || s.claim.sortie)).length;
  const resultat = lus.length === 0
    ? (attenduLire ? 'NON_EXAMINE' : 'NO_NEW_INFORMATION')
    : (lus.some((s) => s.sortie !== 'NO_CHANGE') ? 'NOUVEAUTE_DETECTEE' : 'NO_NEW_INFORMATION');
  const strategie = [r.query, r.query_open].filter(Boolean).join(' | ') || '(requête non consignée par la veille)';

  if (!DRY) {
    await sql`
      insert into case_checks (
        case_id, strategy, primitive_version, engine, n_resultats,
        n_deja_vus, n_doublons, n_non_pertinents, n_candidats, n_bloques,
        resultat, vus)
      values (
        ${r.case_id}, ${strategie}, ${PRIMITIVE_VERSION}, ${MOTEUR}, ${bruts.length},
        ${nDejaVus}, ${nDoublons}, ${nNonPertinents}, ${candidats.length}, ${nBloques},
        ${resultat}, ${JSON.stringify(vusCeRun)})`;
  }

  if (bruts.length || candidats.length) {
    detail.push({ case_id: r.case_id, etablissement: fiche.etablissement,
      statut: fiche.statut_judiciaire, bruts: bruts.length,
      candidats: candidats.length, sorties });
  }
}

// --- sortie -----------------------------------------------------------
const duree = Date.now() - t0;
const ligne = (k, v) => console.log(`  ${String(k).padEnd(38)} ${v}`);
const tiret = () => console.log(`  ${'─'.repeat(64)}`);
console.log(`\n  Cycle de maintenance ${LEGACY ? '— LEGACY ' : '— PAR CLAIM '}${DRY ? '— DRY RUN (aucune écriture)' : ''}`);
tiret();
ligne('affaires challengées', F.affaires);
ligne('RESULTATS_BRUTS', F.bruts);
ligne('  − DEJA_VUS', F.deja_vus);
ligne('  − DOUBLONS', F.doublons);
if (LEGACY) {
  ligne('  − NON_PERTINENTS_CERTAINS (date seule)', F.non_pertinents);
  ligne('= CANDIDATS_A_QUALIFIER', F.candidats);
  ligne('  − CORROBORANTS (même fait)', F.corroborants);
  ligne('= FAITS_A_QUALIFIER', F.representants);
  ligne('    dont URL non résolue', F.url_non_resolue);
  ligne('    dont récupération échouée', F.fetch_echoue);
  ligne('    qualifiés par la primitive', F.qualifies);
} else {
  ligne('= A ROUTER', F.candidats);
  ligne('  · WRONG_SCOPE_CERTAIN', F.WRONG_SCOPE_CERTAIN);
  ligne('  · CONTEXT_ONLY', F.CONTEXT_ONLY);
  ligne('  · HISTORICAL_OR_ALREADY_KNOWN_CERTAIN', F.HISTORICAL_OR_ALREADY_KNOWN_CERTAIN);
  ligne('  · POTENTIAL_UPDATE', F.POTENTIAL_UPDATE);
  ligne('  · UNCERTAIN (continue)', F.UNCERTAIN);
  ligne('= CONTINUENT (POTENTIAL + UNCERTAIN)', F.continuent);
  ligne('→ CLAIMS DISTINCTS', F.claims);
  ligne('  − déjà vérifiés (mémoire)', F.claims_deja_verifies);
  ligne('  − déjà établis (case_events validés)', F.claims_deja_etablis);
  ligne('= CLAIMS À PROUVER', F.claims_a_prouver);
  ligne('    recherches de preuve (requêtes)', F.recherches_preuve);
  ligne('    sans source lisible qui nomme l\'affaire', F.claims_sans_source);
  ligne('    avec ≥1 source candidate', F.claims_avec_candidat);
  ligne('    lus par le modèle, aucune source suffisante', F.claims_lus_sans_preuve);
  ligne('    établis par la citation d’un autre claim', F.claims_meme_document);
  ligne('    dépassés par un claim établi ultérieur', F.claims_depasses);
  ligne('    ► PREUVE SUFFISANTE', F.claims_preuve_suffisante);
  ligne('        dont rattachement arbitré par un humain', F.claims_arbitre_preuve);
  tiret();
  ligne('PREUVE TROUVÉE', F.claims_preuve_suffisante - F.claims_arbitre_preuve);
  ligne('AMBIGUÏTÉ DÉJÀ ARBITRÉE', F.claims_deja_etablis + F.claims_arbitre_preuve);
  ligne('AMBIGUÏTÉ NOUVELLE (REVIEW_REQUIRED)', F.claims_ambiguite_nouvelle);
  ligne('SANS PREUVE', F.claims_sans_source + F.claims_lus_sans_preuve);
  ligne('(dépassés par un claim établi)', F.claims_depasses);
  ligne('        dont changement d\'état proposé', F.claims_changement_etat);
  ligne('    régressions rabattues (garde C)', F.garde_regression);
}
tiret();
for (const k of ['NO_CHANGE', 'NEW_SOURCE_NO_STATE_CHANGE', 'STATE_CHANGE_CANDIDATE', 'AMBIGUOUS', 'SOURCE_ACCESS_BLOCKED', 'SOURCE_REVIEW_REQUIRED']) ligne(k, F[k]);
tiret();
ligne('propositions écrites', F.propositions_ecrites);
ligne('propositions déjà présentes', F.propositions_deja_presentes);
ligne('moteur', MOTEUR);
ligne('appels LLM', F.appels_llm);
ligne('documents lus par le modèle', F.docs_lus_par_modele);
ligne('propositions écartées : fait déjà validé', F.decisions_deja_prises);
ligne('analyses réutilisées', F.analyses_reutilisees);
ligne('analyses NO_CHANGE écrites', F.analyses_ecrites);
ligne('citations non littérales', F.evidence_inventee);
ligne('tokens in/out', F.input_tokens + ' / ' + F.output_tokens);
ligne('coût réel', `$${F.cout_usd.toFixed(6)}`);
ligne('pages récupérées', `${F.fetches} (${Math.round(F.octets / 1024)} Kio)`);
ligne('pages connues inaccessibles (non rouvertes)', F.pages_deja_inaccessibles);
ligne('durée', `${duree} ms`);
console.log('');

// Le funnel était écrasé à chaque cycle : les chiffres du cycle 1
// n'étaient plus relisibles après le cycle 2. Une copie horodatée est
// conservée pour que la comparaison entre cycles reste vérifiable.
const corps = JSON.stringify(
  { genere_le: new Date().toISOString(), mode: LEGACY ? 'legacy' : 'claim', dry_run: DRY, etat_du_rapport: ETAT_DU_RAPPORT,
    rapport: RAPPORT || 'data/watch-report.json', primitive_version: PRIMITIVE_VERSION, moteur: MOTEUR,
    entonnoir: F, duree_ms: duree, detail },
  null, 1);
const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
const archive = `data/maintenance-archive/funnel-${LEGACY ? 'legacy' : 'claim'}-${horodatage}.json`;
if (!DRY) writeFileSync(resolve(ROOT, 'data/maintenance-funnel.json'), corps);
mkdirSync(dirname(resolve(ROOT, archive)), { recursive: true });
writeFileSync(resolve(ROOT, archive), corps);
console.log(`  → ${DRY ? '' : 'data/maintenance-funnel.json  ·  '}archive : ${archive}\n`);
