// =====================================================================
// scripts/import-cases.mjs
// Importe des affaires depuis un CSV dans Supabase.
//
// Pipeline : CSV → validation → dédoublonnage → géocodage → INSERT cases + sources
//
// Usage :
//   node scripts/import-cases.mjs                        # importe data/import-batch.csv
//   node scripts/import-cases.mjs --file=mon-fichier.csv # fichier custom
//   node scripts/import-cases.mjs --dry-run              # valide sans insérer
//   node scripts/import-cases.mjs --skip-geocode         # saute le géocodage
// =====================================================================

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Config ---
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const SKIP_GEO = args.has('--skip-geocode');
const fileArg = [...args].find(a => a.startsWith('--file='));
const CSV_PATH = fileArg
  ? resolve(ROOT, fileArg.replace('--file=', ''))
  : resolve(ROOT, 'data/import-batch.csv');

// --- Supabase ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  console.error('   Lancer avec : node --env-file=.env.local scripts/import-cases.mjs');
  process.exit(1);
}

const supabaseHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// --- Enums valides ---
const ENUMS = {
  type_structure: ['crèche', 'maternelle', 'élémentaire', 'collège', 'lycée', 'périscolaire', 'centre de loisirs', 'internat', 'autre'],
  role_mis_en_cause: ['enseignant', 'animateur périscolaire', 'ATSEM', 'direction', 'personnel de crèche', 'parent', 'tiers', 'intervenant extérieur', 'autre'],
  type_affaire: ['viol', 'agression sexuelle', 'atteinte sexuelle', 'images pédocriminelles', 'violences sexuelles', 'mixte', 'à qualifier'],
  statut_judiciaire: ['plainte', 'enquête', 'mise en examen', 'procès', 'condamnation non définitive', 'condamnation définitive', 'relaxe / non-lieu / classement', 'à qualifier'],
  statut_des_faits: ['allégué', 'retenu par jugement non définitif', 'établi judiciairement', 'non établi', 'mixte'],
  enfants: ['1 enfant', 'plusieurs enfants', 'non précisé'],
};

// --- CSV parser (simple, gère les guillemets) ---
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  function parseLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

// --- Validation d'une ligne ---
function validate(row, index) {
  const errors = [];
  const warn = [];

  // Champs obligatoires
  if (!row.etablissement) errors.push('etablissement manquant');
  if (!row.commune) errors.push('commune manquant');
  if (!row.url1) errors.push('url1 manquant');

  // Validation URL
  for (const field of ['url1', 'url2']) {
    if (row[field] && !row[field].startsWith('http')) {
      errors.push(`${field} n'est pas une URL valide`);
    }
  }

  // Validation enums
  for (const [field, valid] of Object.entries(ENUMS)) {
    const val = row[field];
    if (val && !valid.includes(val)) {
      errors.push(`${field}="${val}" invalide. Valeurs : ${valid.join(', ')}`);
    }
  }

  // Warnings (non bloquants)
  if (!row.departement) warn.push('departement manquant (sera déduit si possible)');
  if (!row.url2) warn.push('url2 manquant — score recoupement potentiellement 0');
  if (!row.type_structure) warn.push('type_structure manquant — défaut "autre"');
  if (!row.statut_judiciaire) warn.push('statut_judiciaire manquant — défaut "à qualifier"');

  return { errors, warn };
}

// --- Génération du case_id ---
// Format : FR-YYYY-NNNN (année en cours + compteur séquentiel)
let caseCounter = 0;
async function getNextCaseId() {
  if (caseCounter === 0) {
    // Chercher le dernier case_id existant en base
    const year = new Date().getFullYear();
    const prefix = `FR-${year}-`;
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cases?case_id=like.${prefix}*&select=case_id&order=case_id.desc&limit=1`,
      { headers: supabaseHeaders }
    );
    const data = await res.json();
    if (data.length > 0) {
      const last = data[0].case_id;
      const num = parseInt(last.split('-')[2], 10);
      caseCounter = num;
    }
  }
  caseCounter++;
  const year = new Date().getFullYear();
  return `FR-${year}-${String(caseCounter).padStart(4, '0')}`;
}

// --- Géocodage (réutilise la logique de geocode.mjs) ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'sousnosyeux-importer/0.1 (https://github.com/06adretn11/sousnosyeux)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parisPostcode(commune) {
  const m = /^Paris (\d{1,2})(?:er|e)?$/i.exec(commune);
  if (!m) return null;
  return '750' + String(m[1]).padStart(2, '0');
}

function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '')
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

const ARR_CENTROIDS = {
  'Paris 1er': [2.3365, 48.8595], 'Paris 2e': [2.3438, 48.8678],
  'Paris 3e': [2.3622, 48.8629], 'Paris 4e': [2.3576, 48.8544],
  'Paris 5e': [2.3500, 48.8443], 'Paris 6e': [2.3329, 48.8489],
  'Paris 7e': [2.3120, 48.8559], 'Paris 8e': [2.3133, 48.8722],
  'Paris 9e': [2.3387, 48.8769], 'Paris 10e': [2.3601, 48.8761],
  'Paris 11e': [2.3796, 48.8590], 'Paris 12e': [2.4214, 48.8400],
  'Paris 13e': [2.3625, 48.8323], 'Paris 14e': [2.3268, 48.8331],
  'Paris 15e': [2.2985, 48.8417], 'Paris 16e': [2.2618, 48.8635],
  'Paris 17e': [2.3068, 48.8870], 'Paris 18e': [2.3473, 48.8927],
  'Paris 19e': [2.3838, 48.8870], 'Paris 20e': [2.3984, 48.8634],
};

async function geocode(row) {
  const { etablissement, commune, adresse } = row;
  const postcode = parisPostcode(commune);

  // 1) Annuaire éducation
  try {
    const params = new URLSearchParams({ q: etablissement, limit: '5' });
    if (postcode) params.set('where', `code_postal="${postcode}"`);
    else params.set('where', `nom_commune like "${commune.toUpperCase()}"`);
    const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?${params}`;
    const data = await fetchJson(url);
    const results = data.results || [];
    const target = normalize(etablissement);
    let best = null;
    for (const r of results) {
      const score = similarity(normalize(r.nom_etablissement || ''), target);
      if (!best || score > best.score) best = { r, score };
    }
    if (best && best.score >= 0.35 && typeof best.r.latitude === 'number') {
      return { lat: best.r.latitude, lng: best.r.longitude, source: 'annuaire-education', score: best.score };
    }
  } catch (e) { /* continue */ }

  await sleep(120);

  // 2) BAN — adresse si disponible, sinon nom + commune
  try {
    const q = adresse || `${etablissement} ${commune}`;
    const params = new URLSearchParams({ q, limit: '1' });
    if (postcode) params.set('postcode', postcode);
    else params.set('city', commune);
    const url = `https://api-adresse.data.gouv.fr/search/?${params}`;
    const data = await fetchJson(url);
    const f = data.features?.[0];
    if (f && (f.properties?.score ?? 0) >= 0.4) {
      const [lng, lat] = f.geometry.coordinates;
      return { lat, lng, source: 'ban', score: f.properties.score };
    }
  } catch (e) { /* continue */ }

  await sleep(120);

  // 3) BAN — nom propre seul (préfixe école retiré)
  try {
    const stripped = etablissement.replace(/^(école\s+(maternelle|élémentaire|primaire)?|groupe\s+scolaire|collège|lycée)\s+/i, '').trim();
    const params = new URLSearchParams({ q: `${stripped} ${commune}`, limit: '1' });
    if (postcode) params.set('postcode', postcode);
    else params.set('city', commune);
    const url = `https://api-adresse.data.gouv.fr/search/?${params}`;
    const data = await fetchJson(url);
    const f = data.features?.[0];
    if (f && (f.properties?.score ?? 0) >= 0.3) {
      const [lng, lat] = f.geometry.coordinates;
      return { lat, lng, source: 'ban', score: f.properties.score };
    }
  } catch (e) { /* continue */ }

  // 4) Centroïde arrondissement Paris
  const centroid = ARR_CENTROIDS[commune];
  if (centroid) {
    return { lat: centroid[1], lng: centroid[0], source: 'centroid-arr', score: 0 };
  }

  // 5) Centroïde commune via BAN
  try {
    await sleep(120);
    const url = `https://api-adresse.data.gouv.fr/search/?${new URLSearchParams({ q: commune, type: 'municipality', limit: '1' })}`;
    const data = await fetchJson(url);
    const f = data.features?.[0];
    if (f) {
      const [lng, lat] = f.geometry.coordinates;
      return { lat, lng, source: 'ban-commune', score: f.properties?.score ?? 0 };
    }
  } catch (e) { /* continue */ }

  return null;
}

// --- Dédoublonnage : vérifier si un cas similaire existe déjà ---
async function checkDuplicate(etablissement, commune, role_mis_en_cause) {
  // Vérifie en base : même établissement + même commune + même rôle = doublon.
  // Permet 2 affaires différentes au même établissement si le rôle diffère
  // (ex: Aqueduc — 1 animateur + 1 enseignant = 2 affaires distinctes).
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?etablissement=eq.${encodeURIComponent(etablissement)}&commune=eq.${encodeURIComponent(commune)}&role_mis_en_cause=eq.${encodeURIComponent(role_mis_en_cause)}&select=case_id,etablissement,commune`,
    { headers: supabaseHeaders }
  );
  const data = await res.json();
  return data.length > 0 ? data[0] : null;
}

// --- Scoring automatique basé sur les données disponibles ---
function autoScore(row) {
  const crit_source_fiable = !!(row.url1 && row.media1);
  const crit_article_recent = !!(row.date1 && isRecent(row.date1));
  const crit_etablissement_nomme = !!(row.etablissement && !row.etablissement.toLowerCase().includes('non nommé'));
  const crit_statut_clair = !!(row.statut_judiciaire && row.statut_judiciaire !== 'à qualifier');
  const crit_recoupement = !!(row.url2 && row.media2);

  return { crit_source_fiable, crit_article_recent, crit_etablissement_nomme, crit_statut_clair, crit_recoupement };
}

function isRecent(dateStr) {
  if (!dateStr) return false;
  const d = new Date(normalizeDate(dateStr) || dateStr);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  return d >= twoYearsAgo;
}

// Convertit les dates partielles en format YYYY-MM-DD valide pour Postgres.
// "2026" → "2026-01-01", "2026-03" → "2026-03-01", "2026-03-20" → inchangé.
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.trim();
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null; // format inconnu → on ne force pas
}

// --- INSERT dans Supabase ---
async function insertCase(caseData) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cases`, {
    method: 'POST',
    headers: supabaseHeaders,
    body: JSON.stringify(caseData),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`INSERT cases failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function insertSource(sourceData) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sources`, {
    method: 'POST',
    headers: supabaseHeaders,
    body: JSON.stringify(sourceData),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`INSERT sources failed: ${res.status} ${err}`);
  }
  return res.json();
}

// --- Main ---
async function main() {
  console.log(`📂 Lecture de ${CSV_PATH}...\n`);

  const raw = await readFile(CSV_PATH, 'utf8');
  const rows = parseCSV(raw);

  if (rows.length === 0) {
    console.log('⚠️  Aucune ligne trouvée dans le CSV.');
    return;
  }

  // Retirer la ligne d'exemple si elle existe
  const filteredRows = rows.filter(r => r.etablissement !== 'École maternelle Example');

  console.log(`📋 ${filteredRows.length} lignes à traiter\n`);

  const report = { imported: 0, skipped_dup: 0, skipped_err: 0, geocoded: 0, geo_failed: 0 };

  for (let i = 0; i < filteredRows.length; i++) {
    const row = filteredRows[i];
    const label = `[${i + 1}/${filteredRows.length}] ${row.etablissement || '???'} (${row.commune || '???'})`;

    // Validation
    const { errors, warn } = validate(row, i);
    if (errors.length > 0) {
      console.log(`❌ ${label}`);
      errors.forEach(e => console.log(`   ERREUR : ${e}`));
      report.skipped_err++;
      continue;
    }
    if (warn.length > 0) {
      warn.forEach(w => console.log(`   ⚠️  ${w}`));
    }

    // Dédoublonnage
    const dup = await checkDuplicate(row.etablissement, row.commune, row.role_mis_en_cause || 'autre');
    if (dup) {
      console.log(`⏭️  ${label} — DOUBLON de ${dup.case_id}`);
      report.skipped_dup++;
      continue;
    }

    // Géocodage
    let geo = null;
    if (!SKIP_GEO) {
      process.stdout.write(`📍 ${label} — géocodage... `);
      geo = await geocode(row);
      if (geo) {
        console.log(`${geo.source} (score=${Math.round(geo.score * 100) / 100})`);
        report.geocoded++;
      } else {
        console.log('ÉCHEC');
        report.geo_failed++;
      }
    } else {
      console.log(`📝 ${label}`);
    }

    // Scoring auto
    const scoring = autoScore(row);
    const fiabilite = (scoring.crit_source_fiable ? 2 : 0)
      + (scoring.crit_article_recent ? 2 : 0)
      + (scoring.crit_etablissement_nomme ? 2 : 0)
      + (scoring.crit_statut_clair ? 2 : 0)
      + (scoring.crit_recoupement ? 2 : 0);

    if (DRY) {
      console.log(`   [dry-run] score=${fiabilite}/10 (${Object.entries(scoring).filter(([, v]) => v).map(([k]) => k.replace('crit_', '')).join(', ')})`);
      report.imported++;
      continue;
    }

    // Génération case_id
    const case_id = await getNextCaseId();

    // INSERT case
    const caseData = {
      case_id,
      etablissement: row.etablissement,
      commune: row.commune,
      departement: row.departement || null,
      adresse: row.adresse || null,
      type_structure: row.type_structure || 'autre',
      role_mis_en_cause: row.role_mis_en_cause || 'autre',
      type_affaire: row.type_affaire || 'à qualifier',
      statut_judiciaire: row.statut_judiciaire || 'à qualifier',
      statut_des_faits: row.statut_des_faits || 'allégué',
      enfants_concernes_public: row.enfants || 'non précisé',
      fiabilite_info_10: fiabilite,
      publication_status: 'candidate',
      commentaire_validation: row.resume_faits || null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      ...scoring,
    };

    try {
      await insertCase(caseData);
    } catch (e) {
      console.log(`   ❌ ${e.message}`);
      report.skipped_err++;
      continue;
    }

    // INSERT sources
    const sourcesToInsert = [];
    if (row.url1) {
      sourcesToInsert.push({
        case_id,
        url: row.url1,
        media: row.media1 || 'inconnu',
        publication_date: normalizeDate(row.date1),
        source_type: 'presse',
        is_primary: true,
      });
    }
    if (row.url2) {
      sourcesToInsert.push({
        case_id,
        url: row.url2,
        media: row.media2 || 'inconnu',
        publication_date: normalizeDate(row.date2),
        source_type: 'presse',
        is_primary: false,
      });
    }

    for (const src of sourcesToInsert) {
      try {
        await insertSource(src);
      } catch (e) {
        console.log(`   ⚠️  Source non insérée : ${e.message}`);
      }
    }

    console.log(`   ✅ ${case_id} — score ${fiabilite}/10 — ${caseData.publication_status}`);
    report.imported++;
  }

  // --- Rapport ---
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RAPPORT D\'IMPORT');
  console.log('═══════════════════════════════════════');
  console.log(`  Importées    : ${report.imported}`);
  console.log(`  Doublons     : ${report.skipped_dup}`);
  console.log(`  Erreurs      : ${report.skipped_err}`);
  console.log(`  Géocodées    : ${report.geocoded}`);
  console.log(`  Géo. échec   : ${report.geo_failed}`);
  console.log('═══════════════════════════════════════');

  if (DRY) {
    console.log('\n[dry-run] Aucune donnée insérée en base.');
  } else {
    console.log('\n✅ Import terminé.');
    console.log('👉 Prochaine étape : ouvrir le dashboard Supabase, filtrer sur publication_status = "candidate"');
    console.log('   et valider les fiches (checkboxes scoring + passage en "publiée").');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
