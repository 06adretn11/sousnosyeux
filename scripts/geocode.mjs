// =====================================================================
// scripts/geocode.mjs
// Géocode les 17 fiches de data/cases.json.
//
// Stratégie en cascade :
//   1) data.education.gouv.fr — annuaire-education
//      (contient les écoles publiques + privées avec coordonnées GPS)
//   2) BAN (api-adresse.data.gouv.fr) — fallback fuzzy sur nom + commune
//   3) Centroïde de l'arrondissement parisien — dernier recours
//
// Sorties :
//   - data/cases.json enrichi avec lat/lng/geocode_source/geocode_score
//   - supabase/migrations/002_geocode_data.sql avec les UPDATE
//
// Usage :
//   node scripts/geocode.mjs            # tous les cas
//   node scripts/geocode.mjs --force    # re-géocode même ceux déjà géocodés
//   node scripts/geocode.mjs --dry-run  # n'écrit pas les fichiers
// =====================================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CASES_PATH = resolve(ROOT, 'data/cases.json');
const MIGRATION_PATH = resolve(ROOT, 'supabase/migrations/002_geocode_data.sql');

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const DRY = args.has('--dry-run');

// Centroïdes approximatifs des arrondissements parisiens (mairie d'arrondissement).
// Utilisés en dernier recours — le clustering masquera les imprécisions.
const ARR_CENTROIDS = {
  'Paris 1er':  [2.3365, 48.8595], 'Paris 2e':  [2.3438, 48.8678],
  'Paris 3e':   [2.3622, 48.8629], 'Paris 4e':  [2.3576, 48.8544],
  'Paris 5e':   [2.3500, 48.8443], 'Paris 6e':  [2.3329, 48.8489],
  'Paris 7e':   [2.3120, 48.8559], 'Paris 8e':  [2.3133, 48.8722],
  'Paris 9e':   [2.3387, 48.8769], 'Paris 10e': [2.3601, 48.8761],
  'Paris 11e':  [2.3796, 48.8590], 'Paris 12e': [2.4214, 48.8400],
  'Paris 13e':  [2.3625, 48.8323], 'Paris 14e': [2.3268, 48.8331],
  'Paris 15e':  [2.2985, 48.8417], 'Paris 16e': [2.2618, 48.8635],
  'Paris 17e':  [2.3068, 48.8870], 'Paris 18e': [2.3473, 48.8927],
  'Paris 19e':  [2.3838, 48.8870], 'Paris 20e': [2.3984, 48.8634],
};

// Code postal Paris à partir de "Paris 15e" → "75015".
function parisPostcode(commune) {
  const m = /^Paris (\d{1,2})(?:er|e)?$/.exec(commune);
  if (!m) return null;
  return '750' + String(m[1]).padStart(2, '0');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'sousnosyeux-geocoder/0.1 (https://github.com/06adretn11/sousnosyeux)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

// --- 1) annuaire-education -----------------------------------------------
// API Opendatasoft v2.1 — recherche full-text sur nom_etablissement + filtre commune.
async function tryAnnuaireEducation(c) {
  const postcode = parisPostcode(c.commune);
  // Le champ commune dans le dataset est en majuscules ("PARIS 15E ARRONDISSEMENT").
  // On préfère filtrer sur le code postal quand on l'a (plus fiable).
  const params = new URLSearchParams({
    q: c.etablissement,
    limit: '5',
  });
  if (postcode) {
    params.set('where', `code_postal="${postcode}"`);
  } else {
    params.set('where', `nom_commune like "${c.commune.toUpperCase()}"`);
  }
  const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?${params}`;

  try {
    const data = await fetchJson(url);
    const results = data.results || [];
    if (results.length === 0) return null;

    // Match approximatif sur le nom : on garde le plus long préfixe commun en mots significatifs.
    const target = normalize(c.etablissement);
    let best = null;
    for (const r of results) {
      const name = r.nom_etablissement || '';
      const score = similarity(normalize(name), target);
      if (!best || score > best.score) best = { r, score };
    }
    if (!best || best.score < 0.35) return null;

    const lat = best.r.latitude;
    const lng = best.r.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng, source: 'annuaire-education', score: round(best.score, 2), match: best.r.nom_etablissement };
  } catch (e) {
    console.warn(`  annuaire-education erreur: ${e.message}`);
    return null;
  }
}

// --- 2) BAN --------------------------------------------------------------
// Strip "École maternelle / élémentaire / ..." pour récupérer le nom propre,
// car BAN match mieux sur "Bullourde" que sur "École maternelle Bullourde".
function stripSchoolPrefix(name) {
  return name.replace(/^(école\s+(maternelle|élémentaire|primaire)?|groupe\s+scolaire|collège|lycée)\s+/i, '').trim();
}

async function tryBanQuery(q, postcode, commune, minScore) {
  const params = new URLSearchParams({ q, limit: '1' });
  if (postcode) params.set('postcode', postcode);
  else if (commune) params.set('city', commune);
  const url = `https://api-adresse.data.gouv.fr/search/?${params}`;
  const data = await fetchJson(url);
  const f = data.features?.[0];
  if (!f) return null;
  const score = f.properties?.score ?? 0;
  if (score < minScore) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { lat, lng, source: 'ban', score: round(score, 2), match: f.properties?.label };
}

async function tryBan(c) {
  const postcode = parisPostcode(c.commune);
  const stripped = stripSchoolPrefix(c.etablissement);

  try {
    // 1er essai : nom complet + commune, seuil normal.
    let r = await tryBanQuery(`${c.etablissement} ${c.commune}`, postcode, c.commune, 0.4);
    if (r) return r;

    // 2e essai : nom propre seul + commune, seuil plus permissif
    // (le contexte commune/postcode joue déjà le rôle de filtre fort).
    await sleep(120);
    r = await tryBanQuery(`${stripped} ${c.commune}`, postcode, c.commune, 0.3);
    if (r) return r;

    return null;
  } catch (e) {
    console.warn(`  BAN erreur: ${e.message}`);
    return null;
  }
}

// --- 3a) Centroïde commune via BAN (pour villes hors Paris) -------------
async function tryBanCommune(c) {
  // Requête sur la commune seule : on récupère le centroïde de la ville.
  const url = `https://api-adresse.data.gouv.fr/search/?${new URLSearchParams({ q: c.commune, type: 'municipality', limit: '1' })}`;
  try {
    const data = await fetchJson(url);
    const f = data.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    return { lat, lng, source: 'ban-commune', score: round(f.properties?.score ?? 0, 2), match: f.properties?.label };
  } catch (e) {
    console.warn(`  BAN commune erreur: ${e.message}`);
    return null;
  }
}

// --- 3b) Centroïde arrondissement Paris ---------------------------------
function tryCentroid(c) {
  const coords = ARR_CENTROIDS[c.commune];
  if (!coords) return null;
  const [lng, lat] = coords;
  return { lat, lng, source: 'centroid-arr', score: 0, match: c.commune };
}

// --- Utilitaires ---------------------------------------------------------
function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '')   // accents (combining marks)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(ecole|maternelle|elementaire|college|lycee|groupe|scolaire)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  const wa = new Set(a.split(' ').filter(w => w.length > 2));
  const wb = new Set(b.split(' ').filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

const round = (n, p) => Math.round(n * 10 ** p) / 10 ** p;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Main ----------------------------------------------------------------
async function main() {
  const raw = await readFile(CASES_PATH, 'utf8');
  const doc = JSON.parse(raw);
  const cases = doc.cases;

  console.log(`Géocodage de ${cases.length} fiches...\n`);

  const report = { 'annuaire-education': 0, ban: 0, 'centroid-arr': 0, 'ban-commune': 0, skipped: 0, failed: 0 };
  const updates = [];

  for (const c of cases) {
    const alreadyDone = typeof c.lat === 'number' && typeof c.lng === 'number';
    if (alreadyDone && !FORCE) {
      console.log(`· ${c.case_id} ${c.etablissement} — déjà géocodé (${c.geocode_source ?? 'n/a'})`);
      report.skipped++;
      updates.push({ case_id: c.case_id, lat: c.lat, lng: c.lng });
      continue;
    }

    process.stdout.write(`· ${c.case_id} ${c.etablissement} (${c.commune}) ... `);

    let result = await tryAnnuaireEducation(c);
    if (!result) {
      await sleep(120);
      result = await tryBan(c);
    }
    if (!result) result = tryCentroid(c);
    if (!result) { await sleep(120); result = await tryBanCommune(c); }

    if (!result) {
      console.log('ÉCHEC');
      report.failed++;
      continue;
    }

    c.lat = result.lat;
    c.lng = result.lng;
    c.geocode_source = result.source;
    c.geocode_score = result.score;
    c.geocode_match = result.match;
    report[result.source]++;
    console.log(`${result.source} score=${result.score} → ${result.match}`);
    updates.push({ case_id: c.case_id, lat: result.lat, lng: result.lng });

    await sleep(150); // courtoisie API
  }

  // --- Rapport ---
  console.log('\n--- Rapport ---');
  for (const [k, v] of Object.entries(report)) console.log(`  ${k}: ${v}`);

  if (DRY) {
    console.log('\n[dry-run] Aucun fichier modifié.');
    return;
  }

  // --- Écriture cases.json ---
  await writeFile(CASES_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`\nÉcrit : ${CASES_PATH}`);

  // --- Migration SQL ---
  const sql = [
    '-- =====================================================================',
    '-- Migration 002 — Coordonnées géographiques des 17 fiches MVP',
    '-- Générée par scripts/geocode.mjs',
    `-- Générée le ${new Date().toISOString()}`,
    '-- =====================================================================',
    '',
    ...updates.map(u =>
      `update cases set lat = ${u.lat}, lng = ${u.lng} where case_id = '${u.case_id}';`
    ),
    '',
  ].join('\n');
  await mkdir(dirname(MIGRATION_PATH), { recursive: true });
  await writeFile(MIGRATION_PATH, sql, 'utf8');
  console.log(`Écrit : ${MIGRATION_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
