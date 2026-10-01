#!/usr/bin/env node
// =====================================================================
// scripts/project-public.mjs
//
// PROJECTION DÉTERMINISTE : Neon (mémoire validée) → artefact public.
//
//   Neon                                     (source de vérité)
//     → SELECT liste blanche + to_char()     (aucun `select *`)
//     → normalisation                        (types, ordre, dates)
//     → data/cases.json                      (artefact compilé)
//     → build Astro → Cloudflare             (inchangé)
//
// L'artefact n'est PLUS une mémoire : c'est un produit compilé. Rien ne
// doit être édité à la main dedans — toute modification manuelle sera
// écrasée au prochain passage, et c'est l'effet recherché.
//
// Propriétés exigées : déterministe · rejouable · idempotente · sans LLM ·
// sans aucun raisonnement éditorial nouveau.
//
//   node scripts/project-public.mjs --diff      # diff métier, n'écrit rien
//   node scripts/project-public.mjs --dry-run   # idem, plus verbeux
//   node scripts/project-public.mjs             # écrit si le contenu change
//
// Remplace `sync-data.mjs` (Supabase) sur le seul chemin de publication.
// Les autres writers Supabase restent en dette, cf. rapport §15.
// =====================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connecter } from './lib/neon.mjs';
import {
  projectCase, projectSource, assertNoInternalFields,
  PUBLIC_CASE_FIELDS, PUBLIC_SOURCE_FIELDS,
} from './lib/public-projection.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CASES_PATH = resolve(ROOT, 'data/cases.json');
const HOLDS_PATH = resolve(ROOT, 'data/publication-holds.json');

const DIFF_ONLY = process.argv.includes('--diff');
const DRY = process.argv.includes('--dry-run') || DIFF_ONLY;

const SEUIL = 8;

// ---------------------------------------------------------------------
// Normalisation — chaque règle répare un écart de transport observé
// ---------------------------------------------------------------------

/**
 * Les colonnes `numeric` de Postgres arrivent en CHAÎNE via le driver
 * (« 48.851742 »), là où PostgREST rendait un nombre. Sans coercition,
 * la bascule Supabase → Neon produirait un diff sur les 53 affaires
 * existantes alors qu'aucune coordonnée n'a bougé.
 */
const nombre = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * Les dates métier ne passent JAMAIS par `toISOString()` : une colonne
 * `date` lue en UTC+2 recule d'un jour (2026-06-16 → 2026-06-15). Elles
 * sont formatées par `to_char(..., 'YYYY-MM-DD')` côté SQL et arrivent
 * donc déjà en texte. Cette fonction ne fait que refuser tout ce qui
 * ressemblerait à un objet Date ayant échappé à la règle.
 */
function dateTexte(v, contexte) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  throw new Error(
    `date non formatée par SQL dans ${contexte} : ${JSON.stringify(v)}. ` +
    'Toute date métier doit sortir de Postgres via to_char(...,\'YYYY-MM-DD\').',
  );
}

// ---------------------------------------------------------------------
// HOLD éditorial — garde-fou de granularité (mission §7)
// ---------------------------------------------------------------------
async function chargerHolds() {
  if (!existsSync(HOLDS_PATH)) return { holds: [] };
  return JSON.parse(await readFile(HOLDS_PATH, 'utf8'));
}

// ---------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------
export async function projeter(sql) {
  const colonnes = PUBLIC_CASE_FIELDS.filter((f) => !['geocode_source', 'verified_at'].includes(f));

  // `to_char` sur toute colonne date : la seule défense fiable contre J-1.
  const cases = await sql`
    select case_id, etablissement, commune, departement,
           type_structure::text   as type_structure,
           role_mis_en_cause::text as role_mis_en_cause,
           type_affaire::text     as type_affaire,
           statut_judiciaire::text as statut_judiciaire,
           statut_des_faits::text  as statut_des_faits,
           enfants_concernes_public::text as enfants_concernes_public,
           lat, lng
      from cases
     where publication_status = 'publiée'
       and fiabilite_info_10 >= ${SEUIL}
     order by case_id`;

  const ids = cases.map((c) => c.case_id);
  const sources = ids.length
    ? await sql`
    select case_id, url, media,
           to_char(publication_date, 'YYYY-MM-DD') as publication_date,
           source_type::text as source_type, is_primary, archive_url
      from sources
     where case_id = any(${ids})
     order by case_id, is_primary desc, media`
    : [];

  // --- Synthèse d'état : dérivée, jamais saisie -------------------------
  //
  // L'ÉTAT COURANT d'une affaire est son dernier événement validé. Sa
  // finalité et sa suite procédurale ne vivent pas dans `case_events` :
  // elles vivent dans la proposition ACCEPTÉE qui a produit l'événement,
  // reliée par `applied_event_id`. On les dérive plutôt que de les
  // dupliquer — le contrat interdit de créer un champ quand une structure
  // existante porte déjà l'information.
  const etats = ids.length
    ? await sql`
    select e.case_id, e.recorded_at::text as recorded_at,
           to_char(e.event_date, 'YYYY-MM-DD') as date,
           e.event_type::text                  as type_evenement,
           e.statut_apres::text                as statut,
           p.finalite,
           p.surveillance,
           a.media                             as source_media,
           to_char(a.publication_date, 'YYYY-MM-DD') as source_date,
           a.url                               as source_url
      from case_events e
      left join state_proposals p
             on p.applied_event_id = e.event_id and p.decision = 'ACCEPT'
      left join articles a on a.article_id = e.article_id
     where e.case_id = any(${ids})
     order by e.case_id, e.event_date nulls last, e.recorded_at`
    : [];

  // --- Établissements concernés (une affaire, N écoles) -----------------
  // N'existe que pour les affaires qui en portent plusieurs (FR-2026-0005 :
  // un service périscolaire commun à trois écoles). L'absence de ligne signifie
  // « `cases.etablissement` fait foi » ; le champ est alors omis, pas vide.
  const etablissements = ids.length
    ? await sql`
    select case_id, etablissement, commune, role
      from case_establishments
     where case_id = any(${ids})
     order by case_id, (role = 'principal') desc, etablissement`
    : [];

  return { cases, sources, etats, etablissements, colonnes };
}

/**
 * Construit le bloc `etat` d'une affaire à partir de ses événements validés.
 * Renvoie `null` si l'affaire n'en porte aucun — elle garde alors son rendu
 * actuel, inchangé.
 */
// Événements qui ne DATENT PAS l'état judiciaire : ils l'accompagnent ou le corrigent.
//   · `rectification` — correction de la mémoire elle-même (jamais un fait à afficher) ;
//   · `mobilisation`, `réponse_institutionnelle` — enrichissements de hub, distincts de l'état ;
//   · `retrait` — décision de présentation, portée par `publication_status`.
// `voie_de_recours` et `mesure_procédurale` ne changent pas l'état mais le QUALIFIENT :
// ils sont lus séparément (finalité, suites).
const HORS_ETAT = new Set(['rectification', 'mobilisation', 'réponse_institutionnelle', 'retrait']);
const SANS_CHANGER_L_ETAT = new Set(['voie_de_recours', 'mesure_procédurale']);

function synthetiserEtat(evenements, case_id) {
  if (!evenements.length) return null;

  // 1. RECTIFICATION HONORÉE. POC-09 porte deux fois « relaxe du 16/06 » (deux
  //    sources, un fait) et un événement `rectification` qui le dit : « seul le
  //    plus ancien fait foi ». On applique ce que la rectification énonce —
  //    même fait (type, date, statut) ⇒ le plus ancien seul subsiste — et on ne
  //    la rend jamais comme état.
  const parAnciennete = [...evenements].sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));
  const vus = new Set();
  const uniques = parAnciennete.filter((e) => {
    if (HORS_ETAT.has(e.type_evenement)) return false;
    const k = `${e.type_evenement}|${e.date || 'nd'}|${e.statut || 'nd'}`;
    if (vus.has(k)) return false;
    vus.add(k);
    return true;
  });
  const chrono = [...uniques].sort((a, b) =>
    (a.date || '9999').localeCompare(b.date || '9999') || String(a.recorded_at).localeCompare(String(b.recorded_at)));

  // 2. L'ÉTAT est daté par le dernier événement qui le CHANGE — pas par le dernier
  //    événement tout court (sinon une mobilisation de parents, sans statut ni
  //    source, effaçait l'état, la finalité et la source de POC-05).
  const porteursDEtat = chrono.filter((e) => e.statut && !SANS_CHANGER_L_ETAT.has(e.type_evenement));
  const dernier = porteursDEtat[porteursDEtat.length - 1]
    || chrono.filter((e) => e.statut)[chrono.filter((e) => e.statut).length - 1];
  if (!dernier) return null;

  // 3. RECOURS. Une voie de recours postérieure (ou non datée) à la décision
  //    retenue la rend non définitive : « relaxe » ne doit pas se lire comme acquise.
  const recours = chrono.filter((e) => e.type_evenement === 'voie_de_recours'
    && (!e.date || !dernier.date || e.date >= dernier.date));

  const suites = [...new Set([
    ...(Array.isArray(dernier.surveillance) ? dernier.surveillance : []).map((s) => s && s.code).filter(Boolean),
    ...recours.flatMap((e) => (Array.isArray(e.surveillance) ? e.surveillance : []).map((s) => s && s.code).filter(Boolean)),
    ...(recours.length ? ['APPEL_EN_COURS'] : []),
  ])];

  // Une source n'est listée que si elle soutient l'état affiché : c'est
  // l'article de l'événement, pas la bibliographie de l'affaire.
  const porteuse = dernier.source_media ? dernier : recours.find((e) => e.source_media);
  const sources = porteuse
    ? [{
        media: porteuse.source_media,
        date: dateTexte(porteuse.source_date, `etat/${case_id}`),
        url: porteuse.source_url || null,
      }]
    : [];

  // Quand AUCUN événement ne change l'état (FR-2026-0027 : seule une remise en liberté
  // est validée, la mise en examen date du 31/07), la date de l'événement disponible
  // n'est PAS celle de l'état : l'afficher ferait dire « mise en examen le 14 août ».
  // L'état reste énoncé, sans date.
  const datePropre = !SANS_CHANGER_L_ETAT.has(dernier.type_evenement);

  return {
    statut: dernier.statut,
    date: datePropre ? dateTexte(dernier.date, `etat/${case_id}`) : null,
    type_evenement: datePropre ? dernier.type_evenement : null,
    finalite: recours.length ? 'non_definitive' : (dernier.finalite || null),
    suites,
    sources,
  };
}

// ---------------------------------------------------------------------
function construire(cases, sources, etats, etablissements, holds, avant) {
  const bloques = new Map(holds.holds.map((h) => [h.case_id, h]));
  const dejaPublie = new Map((avant?.cases || []).map((c) => [c.case_id, c]));

  // HOLD = GEL, jamais retrait.
  //
  // Une affaire sous HOLD garde EXACTEMENT ce qui est déjà publié et
  // n'absorbe aucune mise à jour. La retirer de la carte serait une
  // mutation publique — précisément ce que le garde-fou doit empêcher.
  // Une affaire sous HOLD jamais publiée n'est pas ajoutée non plus.
  const retenues = [];
  const gelees = [];
  for (const c of cases) {
    if (!bloques.has(c.case_id)) { retenues.push(c); continue; }
    if (dejaPublie.has(c.case_id)) gelees.push(c);
  }

  const parCas = {};
  for (const s of sources) {
    if (bloques.has(s.case_id)) continue;
    const projete = projectSource({
      ...s,
      publication_date: dateTexte(s.publication_date, `sources/${s.case_id}`),
    });
    // `archive_url` est publiable, mais il vaut `null` pour 100 % des
    // sources. L'émettre ajouterait un champ vide à 94 sources et noierait
    // le changement métier réel sous 52 lignes de bruit. On ne l'émet que
    // lorsqu'il porte une valeur — décision de forme, pas d'éditorial.
    if (projete.archive_url === null || projete.archive_url === undefined) delete projete.archive_url;
    (parCas[s.case_id] ||= []).push(projete);
  }

  const doc = {
    _meta: {
      project: 'sousnosyeux',
      version: 'projection',
      seuil_publication: SEUIL,
      total_cases: retenues.length,
      source: 'neon',
      note: 'Artefact COMPILÉ depuis Neon par scripts/project-public.mjs. Ne pas éditer à la main.',
      projection: 'public-whitelist-v0',
    },
    cases: [
      ...retenues.map((c) => {
        const etat = synthetiserEtat(etats.filter((e) => e.case_id === c.case_id), c.case_id);
        const etabs = etablissements.filter((e) => e.case_id === c.case_id)
          .map(({ etablissement, commune, role }) => ({ etablissement, commune, role }));
        return {
          ...projectCase({ ...c, lat: nombre(c.lat), lng: nombre(c.lng),
            ...(etat ? { etat } : {}), ...(etabs.length > 1 ? { etablissements: etabs } : {}) }),
          sources: parCas[c.case_id] || [],
        };
      }),
      // les gelées reprennent leur entrée publiée telle quelle
      ...gelees.map((c) => dejaPublie.get(c.case_id)),
    ].sort((a, b) => a.case_id.localeCompare(b.case_id)),
  };
  doc._meta.total_cases = doc.cases.length;

  assertNoInternalFields(doc, 'data/cases.json');
  return { doc, gelees, bloques };
}

// ---------------------------------------------------------------------
// Diff métier — pas un diff JSON
// ---------------------------------------------------------------------
const CHAMPS_SUIVIS = PUBLIC_CASE_FIELDS.filter((f) => !['lat', 'lng', 'geocode_source', 'verified_at'].includes(f));

/** Rend le bloc `etat` lisible dans un diff métier. */
function resumeEtat(e) {
  if (!e) return 'aucune synthèse d’état';
  const bouts = [e.statut];
  if (e.date) bouts.push(`daté du ${e.date}`);
  if (e.finalite) bouts.push(e.finalite);
  if (e.suites?.length) bouts.push(`suite: ${e.suites.join('+')}`);
  if (e.sources?.length) bouts.push(`source: ${e.sources.map((s) => s.media).join(', ')}`);
  return bouts.join(' · ');
}

function diffMetier(avant, apres) {
  const a = new Map((avant?.cases || []).map((c) => [c.case_id, c]));
  const b = new Map(apres.cases.map((c) => [c.case_id, c]));
  const ajouts = [...b.keys()].filter((k) => !a.has(k));
  const retraits = [...a.keys()].filter((k) => !b.has(k));
  const modifs = [];

  for (const [id, apresCas] of b) {
    const avantCas = a.get(id);
    if (!avantCas) continue;
    const champs = [];
    for (const f of CHAMPS_SUIVIS) {
      if (JSON.stringify(avantCas[f]) !== JSON.stringify(apresCas[f])) {
        // `etat` est un objet : le rendre lisible plutôt que « [object Object] ».
        if (f === 'etat') {
          champs.push({ champ: 'etat', de: resumeEtat(avantCas[f]), vers: resumeEtat(apresCas[f]) });
        } else if (f === 'etablissements') {
          const noms = (l) => (l ? l.map((e) => e.etablissement).join(' · ') : 'mono-établissement');
          champs.push({ champ: f, de: noms(avantCas[f]), vers: noms(apresCas[f]) });
        } else {
          champs.push({ champ: f, de: avantCas[f], vers: apresCas[f] });
        }
      }
    }
    const sa = JSON.stringify(avantCas.sources || []);
    const sb = JSON.stringify(apresCas.sources || []);
    if (sa !== sb) champs.push({ champ: 'sources', de: `${(avantCas.sources || []).length} source(s)`, vers: `${apresCas.sources.length} source(s)` });
    const geoA = [avantCas.lat, avantCas.lng].join(',');
    const geoB = [apresCas.lat, apresCas.lng].join(',');
    if (geoA !== geoB) champs.push({ champ: 'coordonnées', de: geoA, vers: geoB });
    if (champs.length) modifs.push({ case_id: id, etablissement: apresCas.etablissement, champs });
  }
  return { ajouts: ajouts.map((id) => b.get(id)), retraits: retraits.map((id) => a.get(id)), modifs };
}

// ---------------------------------------------------------------------
async function main() {
  const { sql, host } = connecter();
  console.log(`\n  PROJECTION PUBLIQUE — Neon → data/cases.json`);
  console.log(`  source : ${host}${DIFF_ONLY ? '  ·  DIFF SEUL' : DRY ? '  ·  DRY-RUN' : ''}\n`);

  const holds = await chargerHolds();

  // Référence « déjà publié » = l'artefact COMMITTÉ, pas le fichier de
  // travail. Se référer au fichier local ferait qu'un HOLD posé après une
  // exécution ne prendrait jamais effet : l'affaire à geler y figurerait
  // déjà, écrite par la passe précédente, et serait gelée « telle quelle ».
  const { execSync } = await import('node:child_process');
  let publie = null;
  try {
    publie = JSON.parse(execSync('git show HEAD:data/cases.json', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString());
  } catch { /* pas de version committée */ }

  // Le diff, lui, se compare au fichier de travail : c'est ce que l'on
  // s'apprête à écrire.
  let avant = null;
  try { avant = JSON.parse(await readFile(CASES_PATH, 'utf8')); } catch { /* absent */ }

  const { cases, sources, etats, etablissements } = await projeter(sql);
  const { doc, gelees } = construire(cases, sources, etats, etablissements, holds, publie || avant);

  const d = diffMetier(avant, doc);
  const inchange = avant
    && JSON.stringify({ ...avant, _meta: null }) === JSON.stringify({ ...doc, _meta: null });

  console.log(`  affaires projetées   ${doc.cases.length}   (Neon : publiée & fiabilité ≥ ${SEUIL})`);
  console.log(`  sources projetées    ${Object.values(doc.cases).reduce((n, c) => n + c.sources.length, 0)}`);
  if (gelees.length) {
    console.log(`  gelées par HOLD      ${gelees.length}  (état public conservé, aucune mise à jour absorbée)`);
    for (const c of gelees) {
      const h = holds.holds.find((x) => x.case_id === c.case_id);
      console.log(`     ❄ ${c.case_id} — ${c.etablissement} · ${h.raison.slice(0, 110)}…`);
    }
  } else {
    console.log(`  gelées par HOLD      0`);
  }

  console.log(`\n  ── DIFF MÉTIER ──────────────────────────────────────────────────`);
  if (inchange) {
    console.log('  NO_PUBLIC_CHANGE — l’artefact est déjà conforme à Neon.\n');
  } else {
    if (!d.ajouts.length && !d.retraits.length && !d.modifs.length) {
      console.log('  aucun changement métier (seules les métadonnées diffèrent)');
    }
    for (const m of d.modifs) {
      console.log(`\n  ~ ${m.case_id} — ${m.etablissement}`);
      for (const c of m.champs) console.log(`      ${c.champ} : « ${c.de} » → « ${c.vers} »`);
    }
    for (const c of d.ajouts) {
      console.log(`\n  + ${c.case_id} — ${c.etablissement} (${c.commune})`);
      console.log(`      statut ${c.statut_judiciaire} · ${c.sources.length} source(s)`);
    }
    for (const c of d.retraits) {
      console.log(`\n  - ${c.case_id} — ${c.etablissement} (${c.commune})  [RETIRÉE DE LA CARTE]`);
    }
    console.log(`\n  total : ${d.modifs.length} modifiée(s) · ${d.ajouts.length} ajoutée(s) · ${d.retraits.length} retirée(s)`);
  }

  if (DRY) { console.log('\n  (rien écrit)\n'); return; }

  if (inchange) {
    console.log('  artefact inchangé — pas de réécriture, pas de churn.\n');
    return;
  }

  doc._meta.generated_at = new Date().toISOString().slice(0, 10);
  await writeFile(CASES_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`\n  ✅ écrit : data/cases.json\n`);
}

await main();
