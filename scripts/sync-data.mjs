// =====================================================================
// scripts/sync-data.mjs
// Synchronise Supabase → data/cases.json
//
// Récupère toutes les affaires publiées (vue cases_public) et leurs
// sources, puis écrit le fichier JSON utilisé par le front Astro.
//
// Usage :
//   node --env-file=.env.local scripts/sync-data.mjs
//   node --env-file=.env.local scripts/sync-data.mjs --dry-run
// =====================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CASES_PATH = resolve(ROOT, 'data/cases.json');

const DRY = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  console.error('   node --env-file=.env.local scripts/sync-data.mjs');
  process.exit(1);
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
};

async function main() {
  console.log('🔄 Synchronisation Supabase → data/cases.json\n');

  // 1) Récupérer les affaires publiées avec score >= 8
  const casesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?publication_status=eq.publiée&fiabilite_info_10=gte.8&select=*&order=case_id`,
    { headers }
  );
  if (!casesRes.ok) throw new Error(`Cases: HTTP ${casesRes.status} ${await casesRes.text()}`);
  const cases = await casesRes.json();

  // 2) Récupérer toutes les sources des affaires publiées
  const caseIds = cases.map(c => c.case_id);
  let allSources = [];
  if (caseIds.length > 0) {
    const sourcesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sources?case_id=in.(${caseIds.map(id => `"${id}"`).join(',')})&select=*&order=case_id,is_primary.desc`,
      { headers }
    );
    if (!sourcesRes.ok) throw new Error(`Sources: HTTP ${sourcesRes.status} ${await sourcesRes.text()}`);
    allSources = await sourcesRes.json();
  }

  // 3) Grouper les sources par case_id
  const sourcesByCase = {};
  for (const s of allSources) {
    if (!sourcesByCase[s.case_id]) sourcesByCase[s.case_id] = [];
    sourcesByCase[s.case_id].push({
      url: s.url,
      media: s.media,
      publication_date: s.publication_date,
      source_type: s.source_type,
      is_primary: s.is_primary,
    });
  }

  // 4) Construire le JSON de sortie
  const output = {
    _meta: {
      project: 'sousnosyeux',
      version: 'sync',
      generated_at: new Date().toISOString().split('T')[0],
      seuil_publication: 8,
      total_cases: cases.length,
      source: 'supabase',
      note: 'Généré automatiquement par scripts/sync-data.mjs depuis Supabase.',
    },
    cases: cases.map(c => ({
      case_id: c.case_id,
      etablissement: c.etablissement,
      commune: c.commune,
      departement: c.departement,
      type_structure: c.type_structure,
      role_mis_en_cause: c.role_mis_en_cause,
      type_affaire: c.type_affaire,
      statut_judiciaire: c.statut_judiciaire,
      statut_des_faits: c.statut_des_faits,
      enfants_concernes_public: c.enfants_concernes_public,
      fiabilite_info_10: c.fiabilite_info_10,
      commentaire_validation: c.commentaire_validation,
      sources: sourcesByCase[c.case_id] || [],
      lat: c.lat,
      lng: c.lng,
      geocode_source: null, // pas stocké en base, sera regéocodé si besoin
      geocode_score: null,
    })),
  };

  // 5) Comparer avec l'existant
  let existingCount = 0;
  try {
    const existing = JSON.parse(await readFile(CASES_PATH, 'utf8'));
    existingCount = existing.cases?.length ?? 0;
  } catch { /* fichier inexistant */ }

  const diff = output.cases.length - existingCount;
  const diffLabel = diff > 0 ? `+${diff}` : diff === 0 ? '=' : `${diff}`;

  console.log(`📊 Supabase : ${output.cases.length} affaires publiées (${diffLabel} vs JSON actuel)`);
  console.log('');

  // Lister les affaires
  for (const c of output.cases) {
    const geo = c.lat !== null ? '📍' : '⚠️ ';
    const srcCount = c.sources.length;
    console.log(`  ${geo} ${c.case_id} — ${c.etablissement} (${c.commune}) — score ${c.fiabilite_info_10}/10 — ${srcCount} source(s)`);
  }

  if (DRY) {
    console.log(`\n[dry-run] Aucun fichier modifié.`);
    return;
  }

  // 6) Écrire le fichier
  await writeFile(CASES_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`\n✅ Écrit : ${CASES_PATH}`);
  console.log('👉 Prochaine étape : git add data/cases.json && git commit && git push');
}

main().catch(e => { console.error(e); process.exit(1); });
