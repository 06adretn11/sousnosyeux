#!/usr/bin/env node
// =====================================================================
// scripts/proposer-fiche.mjs — prépare la proposition « FICHE INDIVIDUELLE À APPROUVER » d'une affaire PUBLIQUE.
//
//   node scripts/proposer-fiche.mjs POC-09 FR-2026-0042            # plan : affiche le message, aucune écriture
//   node scripts/proposer-fiche.mjs POC-09 --ecrire                # crée la ligne new_case_proposals (NE L'ENVOIE PAS)
//   puis l'envoi : node scripts/telegram-v0.mjs nouvelle <8 premiers caractères du proposal_id>   (ou notifier-nouvelles)
//
// Réutilise le circuit « PUBLIER ? » : table new_case_proposals, Worker Telegram, journal, idempotence. Le bouton positif (callback VALIDATE)
// est « APPROUVER LA FICHE » : GO éditorial de la PAGE, jamais publication de l'affaire. Une proposition par fiche et par empreinte de dossier.
// =====================================================================
import { readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { dossierFiche, dossierGeneree, payloadFiche, cleDedupFiche, hashDossier } from './lib/fiche-page.mjs';
import { messageFiche } from './lib/discovery-messages.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const GENEREE = A.includes('--generee');   // dossier produit par scripts/generer-fiche.mjs (data/fiches-generees/), au lieu de data/hub-matiere/
const SIMULER = A.includes('--simuler');   // aucune connexion à Neon : montre le message tel qu'il partirait ; incompatible avec --ecrire
const ids = A.filter((a) => /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+|PARIS-\d+)$/.test(a));
if (SIMULER && ECRIRE) { console.error('--simuler et --ecrire sont incompatibles'); process.exit(2); }
const PREVIEW = process.env.SNY_PREVIEW_BASE || null; // une base d’aperçu doit être joignable depuis Telegram ; sinon captures jointes
if (!ids.length) { console.error('usage : proposer-fiche.mjs <case_id>… [--ecrire]'); process.exit(2); }

const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const cases = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const evenements = lire('data/evenements.json').affaires;
const HUBS = { 'paris-11e': 'Paris 11e', 'bordeaux-gironde': 'Bordeaux / Gironde', 'hautes-alpes': 'Hautes-Alpes', 'landes': 'Landes' };
const sql = SIMULER ? null : connecter().sql;

for (const id of ids) {
  const c = cases.get(id);
  const dossier = GENEREE ? dossierGeneree(id) : dossierFiche(id);
  if (!c || !dossier) { console.log(`· ${id} : pas de fiche possible (absente de l’artefact public ou sans dossier${GENEREE ? ' généré — lancer scripts/generer-fiche.mjs' : ''})`); continue; }
  // Une fiche générée BLOQUÉE ou sans enrichissement n'est jamais proposée : la qualification est une garde, pas une étiquette.
  if (GENEREE && !dossier.proposable) { console.log(`· ${id} : fiche générée NON PROPOSABLE (qualification ${dossier.generation.qualification} : ${dossier.generation.blocages.map((x) => x.code).join(', ') || 'pas d’enrichissement'})`); continue; }
  const b = sql ? (await sql`select publication_status::text ps from cases where case_id = ${id}`)[0] : { ps: 'publiée' };
  if (b?.ps !== 'publiée') { console.log(`· ${id} : l’affaire n’est pas publique dans Neon — jamais de fiche`); continue; }
  const sourcesNeon = sql ? (await sql`select url from sources where case_id = ${id}`).map((r) => r.url) : (c.sources || []).map((s) => s.url);
  const payload = payloadFiche({ c, dossier, sourcesNeon, nbEvenements: (evenements[id] || []).length, previewBase: PREVIEW, hubTitre: HUBS[dossier.hub], generation: GENEREE ? dossier.generation : null });
  const cle = `${cleDedupFiche(id)}|${hashDossier(dossier.d)}`;
  const [deja] = sql ? await sql`select proposal_id::text pid, decision::text d from new_case_proposals where dedup_key = ${cle}` : [];
  console.log(`· ${id} — ${c.etablissement} : empreinte ${payload.page.hash}${deja ? ` — DÉJÀ PROPOSÉE (${deja.pid.slice(0, 8)}, décision : ${deja.d ?? 'en attente'})` : ''}`);
  if (!ECRIRE) { console.log(messageFiche(payload).replace(/<\/?b>/g, '').split('\n').map((l) => '    ' + l).join('\n')); continue; }
  if (deja) continue;
  const [ins] = await sql`insert into new_case_proposals (dedup_key, recommendation, attach_case_id, payload) values (${cle}, 'REVIEW', null, ${JSON.stringify(payload)}::jsonb) returning proposal_id::text pid`;
  console.log(`  ✅ proposition créée ${ins.pid.slice(0, 8)} — non envoyée : node scripts/telegram-v0.mjs nouvelle ${ins.pid.slice(0, 8)}`);
}
