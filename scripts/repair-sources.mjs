// =====================================================================
// scripts/repair-sources.mjs
// Rattrapage : relit le CSV et insère les sources manquantes pour
// les affaires déjà importées (FR-2026-xxxx).
// À lancer une seule fois après le bug des dates partielles.
//
// Usage :
//   node --env-file=.env.local scripts/repair-sources.mjs
// =====================================================================

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSV_PATH = resolve(ROOT, 'data/import-batch.csv');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  process.exit(1);
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.trim();
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  function parseLine(line) {
    const fields = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; }
      else current += ch;
    }
    fields.push(current.trim());
    return fields;
  }
  const hdrs = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    hdrs.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

async function main() {
  console.log('🔧 Rattrapage des sources manquantes...\n');

  // 1) Lire les cases FR-2026-* depuis Supabase
  const casesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?case_id=like.FR-2026-*&select=case_id,etablissement,commune,role_mis_en_cause`,
    { headers }
  );
  const cases = await casesRes.json();
  console.log(`  ${cases.length} affaires FR-2026-* en base\n`);

  // 2) Lire les sources existantes
  const caseIds = cases.map(c => c.case_id);
  const sourcesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sources?case_id=in.(${caseIds.map(id => `"${id}"`).join(',')})&select=case_id,url`,
    { headers }
  );
  const existingSources = await sourcesRes.json();
  const existingUrls = new Set(existingSources.map(s => `${s.case_id}|${s.url}`));
  console.log(`  ${existingSources.length} sources déjà en base\n`);

  // 3) Lire le CSV
  const raw = await readFile(CSV_PATH, 'utf8');
  const rows = parseCSV(raw);

  // 4) Pour chaque ligne CSV, trouver le case_id correspondant et insérer les sources manquantes
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.etablissement) continue;

    // Trouver le case correspondant
    const match = cases.find(c =>
      c.etablissement === row.etablissement &&
      c.commune === row.commune &&
      c.role_mis_en_cause === (row.role_mis_en_cause || 'autre')
    );
    if (!match) continue;

    const sourcesToInsert = [];

    if (row.url1 && !existingUrls.has(`${match.case_id}|${row.url1}`)) {
      sourcesToInsert.push({
        case_id: match.case_id,
        url: row.url1,
        media: row.media1 || 'inconnu',
        publication_date: normalizeDate(row.date1),
        source_type: 'presse',
        is_primary: true,
      });
    }

    if (row.url2 && !existingUrls.has(`${match.case_id}|${row.url2}`)) {
      sourcesToInsert.push({
        case_id: match.case_id,
        url: row.url2,
        media: row.media2 || 'inconnu',
        publication_date: normalizeDate(row.date2),
        source_type: 'presse',
        is_primary: false,
      });
    }

    for (const src of sourcesToInsert) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/sources`, {
          method: 'POST', headers, body: JSON.stringify(src),
        });
        if (!res.ok) {
          const err = await res.text();
          console.log(`  ❌ ${match.case_id} ${src.url.slice(0, 60)}... → ${err}`);
        } else {
          console.log(`  ✅ ${match.case_id} — ${src.media} (${src.is_primary ? 'primaire' : 'secondaire'})`);
          inserted++;
        }
      } catch (e) {
        console.log(`  ❌ ${match.case_id} → ${e.message}`);
      }
    }

    if (sourcesToInsert.length === 0) skipped++;
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Sources insérées : ${inserted}`);
  console.log(`  Déjà OK          : ${skipped}`);
  console.log(`═══════════════════════════════════════`);
}

main().catch(e => { console.error(e); process.exit(1); });
