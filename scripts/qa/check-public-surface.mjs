// =====================================================================
// scripts/qa/check-public-surface.mjs
//
// G10 — aucune fuite de champ interne, de secret ou de prototype dans
// un artefact public.
//
// Surfaces contrôlées :
//   1. data/cases.json                 (suivi par Git, dépôt PUBLIC)
//   2. web/dist/**                     (ce qui est servi par Cloudflare)
//   3. web/public/**, web/src/pages/** (ce qui rejoindra le build)
//
// Usage : node scripts/qa/check-public-surface.mjs
// =====================================================================

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INTERNAL_FIELDS, findInternalFields } from '../lib/public-projection.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const problems = [];
const notes = [];
const add = (sev, msg, ev) => problems.push({ sev, msg, ev });

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// ── 1) data/cases.json ─────────────────────────────────────────────
const casesPath = resolve(ROOT, 'data/cases.json');
try {
  const doc = JSON.parse(await readFile(casesPath, 'utf8'));
  const hits = findInternalFields(doc);
  if (hits.length) {
    const uniq = [...new Set(hits.map((h) => h.field))];
    add('bloquant', `data/cases.json expose ${hits.length} champ(s) interne(s)`, uniq.join(', '));
  } else {
    notes.push(`data/cases.json — ${doc.cases.length} affaires, 0 champ interne`);
  }
} catch (e) {
  add('bloquant', 'data/cases.json illisible', e.message);
}

// ── 2) artefacts servis et sources du build ────────────────────────
const SURFACES = ['web/dist', 'web/public', 'web/src'];
const TEXT_EXT = /\.(html|js|mjs|cjs|css|json|astro|txt|xml|svg|map)$/i;

// Motifs de secret. Volontairement étroits : un faux positif qui bloque
// un build légitime finit par faire désactiver le contrôle.
const SECRET_PATTERNS = [
  { id: 'jwt_supabase', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'service_role_literal', re: /service_role["'\s:=]+[A-Za-z0-9._-]{20,}/ },
  { id: 'supabase_url_avec_cle', re: /supabase\.co[^\s"']*apikey=[A-Za-z0-9._-]{20,}/ },
];

let scanned = 0;
for (const surface of SURFACES) {
  const files = await walk(resolve(ROOT, surface));
  for (const f of files) {
    if (!TEXT_EXT.test(f)) continue;
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    let content;
    try {
      content = await readFile(f, 'utf8');
    } catch {
      continue;
    }
    scanned++;

    for (const field of INTERNAL_FIELDS) {
      // Recherche en contexte de clé JSON/JS pour éviter de matcher une
      // simple mention du mot dans une page de méthodologie.
      const re = new RegExp(`["']?${field}["']?\\s*[:=]`, 'g');
      if (re.test(content)) {
        add('bloquant', `champ interne « ${field} » présent dans un artefact public`, rel);
      }
    }

    for (const p of SECRET_PATTERNS) {
      const m = content.match(p.re);
      if (m) add('bloquant', `secret probable (${p.id}) dans un artefact public`, `${rel} — ${m[0].slice(0, 24)}…`);
    }
  }
}
notes.push(`${scanned} fichier(s) texte scanné(s) dans ${SURFACES.join(', ')}`);

// ── 3) le prototype ne doit rejoindre aucune surface publique ──────
const protoFiles = await walk(resolve(ROOT, 'prototypes'));
const protoNames = new Set(protoFiles.map((f) => relative(resolve(ROOT, 'prototypes'), f).replace(/\\/g, '/')));
for (const surface of SURFACES) {
  const files = await walk(resolve(ROOT, surface));
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    if (/prototypes?\//i.test(rel) || /reconstruction/i.test(rel)) {
      add('bloquant', 'un fichier de prototype a rejoint une surface publique', rel);
    }
  }
}
notes.push(`prototypes/ — ${protoNames.size} fichier(s), aucun dans une surface publique`);

// ── 4) brouillons de hub ───────────────────────────────────────────
const distFiles = await walk(resolve(ROOT, 'web/dist'));
const draftHubs = distFiles.filter((f) => /[\\/]_?hubs?[\\/]/i.test(f));
if (draftHubs.length) {
  add(
    'bloquant',
    `${draftHubs.length} brouillon(s) de hub présent(s) dans web/dist — le build par défaut ne doit en produire aucun`,
    draftHubs.map((f) => relative(ROOT, f)).join(', ')
  );
} else {
  notes.push('web/dist — aucun brouillon de hub');
}

// ── Verdict ────────────────────────────────────────────────────────
console.log('G10 — surface publique\n');
for (const n of notes) console.log(`  ✅ ${n}`);
for (const p of problems) console.log(`  ❌ [${p.sev}] ${p.msg}${p.ev ? ` — ${p.ev}` : ''}`);
console.log('');

if (problems.length === 0) {
  console.log('G10_PASSED');
  process.exit(0);
}
console.log(`G10_FAILED — ${problems.length} problème(s)`);
process.exit(1);
