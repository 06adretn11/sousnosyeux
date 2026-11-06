#!/usr/bin/env node
// =====================================================================
// scripts/qa/demo-declaration-organisme.mjs — DÉMONSTRATION isolée : le texte approuvé d'une déclaration d'organisme apparaît-il, tel quel,
// dans la fiche et le Hub existants — et seulement après ACCEPT, hors HOLD ?
//   node scripts/qa/demo-declaration-organisme.mjs [fichier-sortie.json]
// Copie isolée de web/ + data/ dans ~/sny-demo (jamais le dépôt), matière injectée dans data/evenements.json de la COPIE, VRAIE construction Astro,
// comparaison avec la construction de référence. Aucune base, aucun réseau, aucun Telegram. Non branché sur run-all (≈ 10 s par construction).
// =====================================================================
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { construireMatiere } from '../lib/destinations.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NM = join(ROOT, 'web/node_modules');
if (!existsSync(NM)) { console.error('web/node_modules introuvable'); process.exit(2); }
mkdirSync(join(homedir(), 'sny-demo'), { recursive: true });
const TMP = mkdtempSync(join(homedir(), 'sny-demo', 'decl-'));
const lire = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const LIBELLE = 'Selon L’Enfant Bleu, l’association s’est constituée partie civile dans cette affaire ; la procédure concernée n’est pas précisée. Déclaration de l’association, non vérifiée par ailleurs.';
const SOURCE = { media: "L'Enfant Bleu", url: 'https://enfantbleu.org/violences-dans-le-periscolaire-comment-lenfant-bleu-accompagne-les-collectivites/', publie_le: '2026-07-21' };

function preparer(nom, modifier) {
  const dir = join(TMP, nom); mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'web'), join(dir, 'web'), { recursive: true, filter: (p) => !/[\\/](node_modules|dist|\.astro)([\\/]|$)/.test(p) });
  cpSync(join(ROOT, 'data'), join(dir, 'data'), { recursive: true });
  symlinkSync(NM, join(dir, 'web/node_modules'), 'junction');
  if (modifier) { const ev = lire('data/evenements.json'); modifier(dir, ev); writeFileSync(join(dir, 'data/evenements.json'), JSON.stringify(ev, null, 2) + '\n'); }
  return dir;
}
const construire = (dir) => { execFileSync(process.execPath, [join(dir, 'web/node_modules/astro/astro.js'), 'build'], { cwd: join(dir, 'web'), stdio: 'pipe' }); return join(dir, 'web/dist'); };
const page = (dist, p) => { const f = join(dist, p, 'index.html'); return existsSync(f) ? readFileSync(f, 'utf8').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ') : null; };
const contexte = (ev, holds) => {
  const cases = lire('data/cases.json').cases;
  const hubs = Object.fromEntries(['paris-11e', 'bordeaux-gironde', 'hautes-alpes', 'landes'].map((h) => [h, { publie: true, groupes: lire(`data/hub-matiere/${h}.json`).reponses.map((g) => g.titre) }]));
  return { publiques: new Set(cases.map((c) => c.case_id)), holds, approuvees: new Set(Object.keys(ev.fiches_approuvees)),
    cases: new Map(cases.map((c) => [c.case_id, { commune: c.commune, departement: c.departement, etablissement: c.etablissement }])), hubs };
};
const fait = { id: 'decl-test-0001', case_id: 'POC-05', nature: 'mobilisation', libelle: LIBELLE, realisation: 'réalisée', portee: 'établissement', acteur: "L'Enfant Bleu", territoire: null, date: null, periode: null, source: SOURCE, event_id: null, etablissement: 'École maternelle Alphonse-Baudin' };

const rapport = {};
try {
  const ref = construire(preparer('reference', null));
  const refFiche = page(ref, 'affaires/poc-05'), refHub = page(ref, 'territoires/paris-11e');
  assert.ok(refFiche && refHub, 'pages de référence présentes');
  assert.ok(!refFiche.includes(LIBELLE) && !refHub.includes(LIBELLE), 'référence : le texte est absent');

  // Scénario 1 : ACCEPT (matière projetée) → présent dans la fiche ET le Hub, état judiciaire inchangé.
  const accepte = construire(preparer('accepte', (dir, ev) => { ev.matiere = construireMatiere([fait], contexte(ev, new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id)))).matiere; }));
  const f1 = page(accepte, 'affaires/poc-05'), h1 = page(accepte, 'territoires/paris-11e');
  assert.ok(f1.includes(LIBELLE), 'fiche : texte approuvé présent'); assert.ok(h1.includes(LIBELLE), 'Hub : texte approuvé présent');
  assert.ok(f1.includes('relaxe') || /relax/i.test(f1), 'fiche : l’issue favorable reste dite');
  rapport.accepte = { fiche: true, hub: true, extrait_fiche: f1.slice(Math.max(0, f1.indexOf(LIBELLE) - 160), f1.indexOf(LIBELLE) + LIBELLE.length + 120), extrait_hub: h1.slice(Math.max(0, h1.indexOf(LIBELLE) - 160), h1.indexOf(LIBELLE) + LIBELLE.length + 120) };

  // Scénario 2 : HOLD sur l'affaire → matière vide → aucune page ne change.
  const hold = construire(preparer('hold', (dir, ev) => { ev.matiere = construireMatiere([fait], contexte(ev, new Set(['POC-05']))).matiere; }));
  assert.ok(!page(hold, 'affaires/poc-05').includes(LIBELLE) && !page(hold, 'territoires/paris-11e').includes(LIBELLE));
  rapport.hold = { fiche: false, hub: false };

  // Scénario 3 : refus / REVIEW / aucune décision → la matière n'est jamais projetée (seul ACCEPT l'alimente) → pages identiques à la référence.
  rapport.sans_decision = { fiche_identique: page(ref, 'affaires/poc-05') === refFiche, hub_identique: page(ref, 'territoires/paris-11e') === refHub };
  assert.ok(rapport.sans_decision.fiche_identique && rapport.sans_decision.hub_identique);
  console.log('✓ ACCEPT : texte approuvé dans la fiche POC-05 et le Hub Paris 11e (blocs existants)\n✓ HOLD : aucune page ne change\n✓ sans ACCEPT : pages identiques à la référence');
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ note: 'Démonstration isolée (copie de web/ et data/), construction Astro réelle ; rien écrit dans le dépôt ni en production.', libelle: LIBELLE, ...rapport }, null, 1));
} finally { rmSync(TMP, { recursive: true, force: true }); }
