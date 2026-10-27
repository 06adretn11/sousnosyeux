#!/usr/bin/env node
// =====================================================================
// scripts/proposer-mises-a-jour-fiches.mjs — un événement judiciaire NOUVEAU et étayé, sans changement de statut, met à jour la fiche publiée.
//
//   node scripts/proposer-mises-a-jour-fiches.mjs                  # plan : sélection seule (aucun modèle, aucune écriture, aucun envoi)
//   node scripts/proposer-mises-a-jour-fiches.mjs --ecrire         # génère la candidate, écrit l'aperçu et la proposition (l'envoi reste celui de « notifier-nouvelles »)
//   --case FR-2026-0011   une seule affaire · --limite N   (défaut 2 affaires par passage)
//
// Chaîne (rien de nouveau, tout est réutilisé) :
//   analyses ENRICHMENT de la Maintenance (state_proposals) → sélection pure (lib/fiche-miseajour) → generer-fiche (source apportée) →
//   changements vs version publique (lib/fiche-page) → proposer-fiche --generee (aperçu + proposition « mise à jour » APPROUVER) → clic →
//   promouvoir-fiche --depuis-propositions → project-evenements → QA → push → vérification du site servi → confirmation.
// La version publique reste en ligne : une candidate invalide ou sans changement substantiel n'écrit rien de public (le blocage est dit une fois).
// Sortie GitHub Actions : `change=true` si un aperçu a été écrit (à déposer sur main AVANT l'envoi de la proposition).
// =====================================================================
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { connecter } from './lib/neon.mjs';
import { dossierFiche, dossierGeneree, changementsFiche, empreinteApprouvee } from './lib/fiche-page.mjs';
import { selectionnerMisesAJour } from './lib/fiche-miseajour.mjs';
import { journaliser } from './lib/telegram-clics.mjs';
import { prevenirUneFois } from './lib/prevenir.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const val = (f) => (A.includes(f) ? A[A.indexOf(f) + 1] : null);
const SEUL = val('--case');
const LIMITE = Number(val('--limite') || 2);
const racine = (f) => new URL(`../${f}`, import.meta.url);
const lire = (f) => JSON.parse(readFileSync(racine(f), 'utf8'));
const holds = new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id));
const { sql } = connecter();

const lignes = await sql`
  select p.proposal_id::text k, p.case_id, a.url, a.media, a.publication_date::text pd, p.payload->>'rattachement' rat, p.decision::text decision, p.facts
  from state_proposals p join articles a using (article_id)
  where p.analysis_action = 'ENRICHMENT' and p.created_at > now() - interval '21 days'
  order by p.created_at`;
const dejaTraitees = new Set((await sql`select cle from telegram_journal where kind = 'application' and cle like 'maj-fiche:%'`).map((r) => r.cle.slice('maj-fiche:'.length)));
const ids = [...new Set(lignes.map((l) => l.case_id))].filter((id) => !SEUL || id === SEUL);
const revues = ids.length ? await sql`select case_id, reviewed_by, decision::text decision, comment from reviews where case_id = any(${ids}) and comment like '[Fiche approuvée %' order by reviewed_at` : [];
const publie = new Map(ids.map((id) => [id, dossierFiche(id)]).filter(([, d]) => d));
const approuvee = (id) => !!empreinteApprouvee(revues.filter((r) => r.case_id === id), id, publie.get(id));

const { groupes, ecartees } = selectionnerMisesAJour({ lignes: lignes.filter((l) => ids.includes(l.case_id)), publie, approuvee, holds, deja: dejaTraitees });
const motifs = ecartees.reduce((m, e) => m.set(e.motif, (m.get(e.motif) || 0) + 1), new Map());
console.log(`mises à jour de fiches : ${lignes.length} analyse(s) d'enrichissement récentes · ${groupes.length} affaire(s) retenue(s) · écartées : ${[...motifs].map(([m, n]) => `${m} ×${n}`).join(', ') || 'aucune'}`);
for (const g of groupes) console.log(`  · ${g.case_id} : ${g.sources.length} source(s) nouvelle(s) à intégrer`);
const sortie = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
sortie('change', 'false');
if (!ECRIRE || !groupes.length) process.exit(0);

const node = process.execPath;
const script = (f) => fileURLToPath(new URL(`./${f}`, import.meta.url));
// Dépôt public => logs publics : la sortie des scripts (titres, URL d'articles) n'est jamais réaffichée.
const exec = (f, args) => { try { return { ok: true, out: execFileSync(node, [script(f), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 }) }; } catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; } };
const note = async (g, resultat, details) => { for (const k of g.ks) await journaliser(sql, { kind: 'application', cle: `maj-fiche:${k}`, resultat, details }); };
let ecrites = 0;
for (const g of groupes.slice(0, LIMITE)) {
  const dir = mkdtempSync(join(tmpdir(), 'sny-extra-'));
  const extra = join(dir, 'extra.json');
  writeFileSync(extra, JSON.stringify({ [g.case_id]: g.sources }));
  const gen = exec('generer-fiche.mjs', [g.case_id, '--sources-extra', extra, '--docs']);
  rmSync(dir, { recursive: true, force: true });
  const cand = gen.ok ? dossierGeneree(g.case_id) : null;
  if (!cand?.proposable) {
    const q = cand?.generation?.qualification ?? (gen.ok ? 'ABSENTE' : 'ERREUR DE GÉNÉRATION');
    console.log(`  ⚠ ${g.case_id} : candidate non proposable (${q}) — version publique conservée`);
    await prevenirUneFois(sql, { cle: `maj-fiche-bloquee:${g.ks[0]}`, resultat: 'bloquee', texte: `⚠️ <b>Mise à jour de fiche non proposée</b> — ${g.case_id}\nUne source nouvelle a été trouvée, mais la version candidate n’est pas publiable (${q}). La version publique reste en ligne ; rien n’a été modifié.` });
    await note(g, 'bloquee', { qualification: q });
    continue;
  }
  const ch = changementsFiche(publie.get(g.case_id).d, cand.d);
  if (!ch.substantiel) { console.log(`  · ${g.case_id} : aucun changement substantiel — rien à proposer`); await note(g, 'sans_changement', {}); continue; }
  const prop = exec('proposer-fiche.mjs', [g.case_id, '--generee', '--ecrire']);
  console.log(`  ${prop.ok && /proposition créée|DÉJÀ PROPOSÉE/.test(prop.out) ? '✅' : '⚠'} ${g.case_id} : +${ch.ajoutees.length} étape(s), −${ch.retirees.length}, ${ch.sources_nouvelles.length} source(s) nouvelle(s) · ${/DÉJÀ PROPOSÉE/.test(prop.out) ? 'déjà proposée' : /proposition créée/.test(prop.out) ? 'proposition créée (envoi par notifier-nouvelles)' : 'proposition NON créée'}`);
  if (prop.ok && /proposition créée/.test(prop.out)) ecrites++;
  await note(g, prop.ok ? 'proposee' : 'erreur', { ajoutees: ch.ajoutees.length, retirees: ch.retirees.length });
}
if (ecrites) sortie('change', 'true');
