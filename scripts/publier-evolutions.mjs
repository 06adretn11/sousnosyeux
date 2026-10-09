#!/usr/bin/env node
// =====================================================================
// scripts/publier-evolutions.mjs — Neon → site, pour les évolutions VALIDÉES d'affaires DÉJÀ publiques. Aucun raisonnement éditorial.
//
//   node scripts/publier-evolutions.mjs            # projette (écrit data/cases.json si une entrée publique change)
//   node scripts/publier-evolutions.mjs --dry-run  # liste les affaires concernées, n'écrit rien
//
// CE QUE ÇA FAIT. Pour chaque affaire `publiée` dont une décision de l'éditeur (clic Telegram) a été APPLIQUÉE dans les 7 derniers
// jours — évolution d'état, événement institutionnel, sources rattachées — lance `project-public.mjs --modifier <id>` : la
// projection existante, déterministe, qui ne touche QUE cette affaire (les retards d'autres affaires ne sont jamais absorbés) et
// qui respecte les HOLD (une affaire gelée garde son état public). Idempotent : rejoué, il ne change rien.
//
// CE QUE ÇA NE FAIT PAS. Publier une NOUVELLE affaire (publier-affaire.mjs, GO explicite), retirer, ou modifier une entrée sans
// décision humaine appliquée. Le commit, la QA et la vérification du site sont les étapes suivantes du workflow.
//
// Sortie GitHub Actions : change=true|false · ids=<affaires dont l'entrée publique a changé>.
// =====================================================================
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { connecter } from './lib/neon.mjs';

const DRY = process.argv.includes('--dry-run');
const ID = /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+)$/;
const { sql } = connecter();

const evol = await sql`
  select distinct p.case_id from state_proposals p join cases c using (case_id)
   where p.decision = 'ACCEPT' and p.decided_by ilike '%Telegram%' and p.applied_event_id is not null
     and p.decided_at > now() - interval '7 days' and c.publication_status = 'publiée'`;
const att = await sql`
  select distinct n.attach_case_id case_id from new_case_proposals n join cases c on c.case_id = n.attach_case_id
   where n.decision = 'ACCEPT' and n.applied_at is not null and n.applied_at > now() - interval '7 days'
     and n.attach_case_id is not null and c.publication_status = 'publiée'`;
const ids = [...new Set([...evol, ...att].map((r) => r.case_id))].filter((i) => ID.test(i)).sort();
console.log(`${ids.length} affaire(s) publiée(s) avec une décision appliquée récente`);

const empreinte = () => createHash('sha256').update(readFileSync('data/cases.json')).digest('hex');
const changees = [];
for (const id of ids) {
  if (DRY) { console.log(`· ${id} (à blanc)`); continue; }
  const avant = empreinte();
  try { execFileSync(process.execPath, ['scripts/project-public.mjs', '--modifier', id], { stdio: 'pipe' }); }
  catch (e) { console.error(`· ${id} : projection refusée (${String(e.stderr || e.message).split('\n')[0].slice(0, 120)})`); process.exitCode = 1; continue; }
  const change = empreinte() !== avant;
  console.log(`· ${id} : ${change ? 'entrée publique MISE À JOUR' : 'inchangée (NO_PUBLIC_CHANGE ou affaire gelée par HOLD)'}`);
  if (change) changees.push(id);
}
const sortie = process.env.GITHUB_OUTPUT;
if (sortie) appendFileSync(sortie, `change=${changees.length > 0}\nids=${changees.join(',')}\n`);
console.log(`projection : ${changees.length} entrée(s) publique(s) modifiée(s)`);
process.exit(process.exitCode || 0);
