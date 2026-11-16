#!/usr/bin/env node
// =====================================================================
// scripts/proposer-premieres-fiches.mjs — la PREMIÈRE fiche individuelle d'une nouveauté que le relais social attend (RELAIS REVIEW).
//
//   node scripts/proposer-premieres-fiches.mjs                  # plan : sélection seule (aucun modèle, aucune écriture, aucun envoi)
//   node scripts/proposer-premieres-fiches.mjs --ecrire         # génère le dossier, écrit l'aperçu et la proposition « APPROUVER LA FICHE » (l'envoi reste « notifier-nouvelles »)
//   --case FR-2026-0148   une seule affaire · --limite N   (défaut 2 affaires par passage)
//
// POURQUOI. Le relais social n'avance un événement qu'avec une fiche individuelle APPROUVÉE et SERVIE. Les mises à jour de fiches déjà approuvées sont automatiques
// (proposer-mises-a-jour-fiches.mjs) ; la PREMIÈRE fiche ne l'était pas : une nouvelle affaire (FR-2026-0148) ou une évolution sur une affaire sans fiche (FR-2026-0144)
// attendait une génération manuelle, pendant que la fenêtre de 7 jours de sa source se refermait.
//
// PÉRIMÈTRE (volontairement étroit : pas de génération en masse du stock historique) : les événements que le relais jugerait nouveaux (portNeon.candidats(T0) : tous
// leurs horodatages ≥ T0), affaires publiées, ni HOLD ni retrait, SANS fiche approuvée, sans proposition de fiche en attente, source de moins de 7 jours.
// Chaîne réutilisée telle quelle : generer-fiche (LLM déjà en place, gardes d'extraction) → proposer-fiche --generee → proposition Telegram (clic humain obligatoire).
// Rien n'est publié par ce script ; une fiche non proposable est dite UNE fois sur Telegram (jamais de silence technique).
// Sortie GitHub Actions : `change=true` si un aperçu a été écrit (à déposer sur main AVANT l'envoi de la proposition).
// =====================================================================
import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connecter } from './lib/neon.mjs';
import { dossierGeneree } from './lib/fiche-page.mjs';
import { portNeon } from './lib/relais-social-db.mjs';
import { verifierActivation } from './lib/relais-social.mjs';
import { FENETRE_SOURCE_JOURS, ageJours } from './lib/diffusion-sociale.mjs';
import { journaliser } from './lib/telegram-clics.mjs';
import { prevenirUneFois } from './lib/prevenir.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const val = (f) => (A.includes(f) ? A[A.indexOf(f) + 1] : null);
const SEUL = val('--case');
const LIMITE = Number(val('--limite') || 2);
const RETENTE_H = 24; // une fiche non proposable n'est regénérée qu'une fois par jour (nouvelles sources possibles), jamais en boucle
const racine = (f) => new URL(`../${f}`, import.meta.url);
const lire = (f) => JSON.parse(readFileSync(racine(f), 'utf8'));
const sortie = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
sortie('change', 'false');

const { sql } = connecter();
const port = portNeon(sql);
const now = new Date();
if (!(await port.tablesPresentes())) { console.log('premières fiches : tables du relais absentes — rien'); process.exit(0); }
const activation = verifierActivation({ env: process.env, t0Row: await port.t0(), now });
if (!activation.actif) { console.log(`premières fiches : relais inactif (${activation.raisons[0]}) — rien`); process.exit(0); }

const cases = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const ev = lire('data/evenements.json');
const holds = new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id));
const candidats = (await port.candidats(activation.t0)).filter((c) => !SEUL || c.case_id === SEUL);

/** Plus récente date de source connue de l'affaire (carte publique + sources d'événements validés). */
const fraicheur = (id) => [...(cases.get(id)?.sources || []).map((s) => s.publication_date), ...(ev.affaires?.[id] || []).map((e) => e.source?.publie_le)]
  .map((d) => String(d || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() ?? null;

const retenues = [], ecartees = new Map();
const ecarte = (id, motif) => { ecartees.set(id, motif); };
for (const c of candidats) {
  if (retenues.some((r) => r.case_id === c.case_id) || ecartees.has(c.case_id)) continue;
  if (c.ps !== 'publiée' || c.retire) { ecarte(c.case_id, 'affaire non publiée ou retirée'); continue; }
  if (holds.has(c.case_id)) { ecarte(c.case_id, 'HOLD'); continue; }
  if (!cases.has(c.case_id)) { ecarte(c.case_id, 'absente de l’artefact public (projection en attente)'); continue; }
  if (ev.fiches_approuvees?.[c.case_id]) { ecarte(c.case_id, 'fiche déjà approuvée'); continue; }
  const age = ageJours(fraicheur(c.case_id), now);
  if (age === null || age >= FENETRE_SOURCE_JOURS) { ecarte(c.case_id, `source de plus de ${FENETRE_SOURCE_JOURS} jours ou non datée : le relais ne la relaierait plus`); continue; }
  if ((await sql`select 1 x from reviews where case_id = ${c.case_id} and comment like '[Fiche approuvée %' limit 1`).length) { ecarte(c.case_id, 'fiche approuvée, promotion en cours'); continue; }
  if ((await sql`select 1 x from new_case_proposals where payload->'page'->>'case_id' = ${c.case_id} and decision is null limit 1`).length) { ecarte(c.case_id, 'proposition de fiche déjà en attente de clic'); continue; }
  if ((await sql`select 1 x from telegram_journal where kind = 'application' and cle = ${'premiere-fiche:' + c.case_id} and resultat in ('bloquee', 'erreur') and at > now() - ${RETENTE_H + ' hours'}::interval limit 1`).length) { ecarte(c.case_id, `déjà tentée il y a moins de ${RETENTE_H} h`); continue; }
  retenues.push({ case_id: c.case_id, type: c.type, restant: FENETRE_SOURCE_JOURS - age });
}
retenues.sort((a, b) => a.restant - b.restant); // la fenêtre qui se referme le plus tôt d'abord
const motifs = [...ecartees.values()].reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
console.log(`premières fiches : ${candidats.length} événement(s) candidat(s) du relais · ${retenues.length} affaire(s) sans fiche retenue(s) · écartées : ${[...motifs].map(([m, n]) => `${m} ×${n}`).join(', ') || 'aucune'}`);
for (const r of retenues) console.log(`  · ${r.case_id} (${r.type}) : fenêtre de source restante ≈ ${r.restant.toFixed(1)} j`);
if (!ECRIRE || !retenues.length) process.exit(0);

const node = process.execPath;
const script = (f) => fileURLToPath(new URL(`./${f}`, import.meta.url));
// Dépôt public ⇒ logs publics : la sortie des scripts (titres, URL d'articles) n'est jamais réaffichée.
const exec = (f, args) => { try { return { ok: true, out: execFileSync(node, [script(f), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 }) }; } catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; } };
const note = (id, resultat, details = {}) => journaliser(sql, { kind: 'application', cle: `premiere-fiche:${id}`, resultat, details });
let ecrites = 0;
for (const r of retenues.slice(0, LIMITE)) {
  const gen = exec('generer-fiche.mjs', [r.case_id, '--docs']);
  const cand = gen.ok ? dossierGeneree(r.case_id) : null;
  if (!cand?.proposable) {
    const q = cand?.generation?.qualification ?? (gen.ok ? 'ABSENTE' : 'ERREUR DE GÉNÉRATION');
    console.log(`  ⚠ ${r.case_id} : fiche non proposable (${q})`);
    await prevenirUneFois(sql, { cle: `premiere-fiche-bloquee:${r.case_id}`, resultat: 'bloquee', texte: `⚠️ <b>Première fiche non proposée</b> — ${r.case_id}\nLe relais social attend la fiche de cette nouveauté, mais la génération n’a pas abouti à une fiche publiable (${q}). Aucune publication ; la génération sera retentée dans ${RETENTE_H} h si de nouvelles sources apparaissent.` });
    await note(r.case_id, 'bloquee', { qualification: q });
    continue;
  }
  const prop = exec('proposer-fiche.mjs', [r.case_id, '--generee', '--ecrire']);
  const creee = prop.ok && /proposition créée/.test(prop.out);
  console.log(`  ${creee || (prop.ok && /DÉJÀ PROPOSÉE/.test(prop.out)) ? '✅' : '⚠'} ${r.case_id} : ${creee ? 'proposition de fiche créée (envoi par notifier-nouvelles)' : /DÉJÀ PROPOSÉE/.test(prop.out) ? 'déjà proposée' : 'échec de la proposition'}`);
  if (creee) ecrites++;
  await note(r.case_id, prop.ok ? 'proposee' : 'erreur');
}
if (ecrites) sortie('change', 'true');
