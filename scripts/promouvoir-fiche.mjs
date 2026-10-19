#!/usr/bin/env node
// =====================================================================
// scripts/promouvoir-fiche.mjs — après « APPROUVER LA FICHE » : le dossier généré approuvé entre dans data/hub-matiere/isoles.json.
//
//   node scripts/promouvoir-fiche.mjs FR-2026-0115            # plan : dit si la promotion est permise, n'écrit rien
//   node scripts/promouvoir-fiche.mjs FR-2026-0115 --ecrire   # écrit isoles.json (puis : project-evenements, QA, commit, PR — circuit habituel)
//
// Lecture seule sur Neon (table reviews). Refus par défaut : voir lib/promouvoir-fiche.mjs.
// =====================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { dossierGeneree } from './lib/fiche-page.mjs';
import { decider, inscrire } from './lib/promouvoir-fiche.mjs';

const A = process.argv.slice(2);
const ids = A.filter((a) => /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+|PARIS-\d+)$/.test(a));
const ECRIRE = A.includes('--ecrire');
if (!ids.length) { console.error('usage : promouvoir-fiche.mjs <case_id>… [--ecrire]'); process.exit(2); }

const racine = (f) => new URL(`../${f}`, import.meta.url);
const lire = (f) => JSON.parse(readFileSync(racine(f), 'utf8'));
const cases = lire('data/cases.json').cases;
const holds = new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id));
const hubs = readdirSync(racine('data/hub-matiere/')).filter((f) => f.endsWith('.json') && f !== 'isoles.json').map((f) => lire(`data/hub-matiere/${f}`));
let isoles = lire('data/hub-matiere/isoles.json');
const { sql } = connecter();

let ecrit = 0;
for (const id of ids) {
  const revues = await sql`select reviewed_by, decision::text decision, comment from reviews where case_id = ${id} and comment like '[Fiche approuvée %' order by reviewed_at`;
  const r = decider({ id, generee: dossierGeneree(id), revues, isoles, hubs, cases, holds });
  console.log(`· ${id} : ${r.ok ? `promotion PERMISE (empreinte ${r.hash}${r.remplace ? `, remplace la version approuvée ${r.remplace}` : ''})` : `refusée — ${r.motif}${r.hash ? ` (empreinte ${r.hash})` : ''}`}`);
  if (!r.ok || !ECRIRE) continue;
  isoles = inscrire(isoles, id, r.dossier, r.hash);
  ecrit++;
}
if (ECRIRE && ecrit) { writeFileSync(racine('data/hub-matiere/isoles.json'), JSON.stringify(isoles, null, 2) + '\n'); console.log(`✅ ${ecrit} dossier(s) écrit(s) dans data/hub-matiere/isoles.json — la page se publie par le circuit habituel.`); }
