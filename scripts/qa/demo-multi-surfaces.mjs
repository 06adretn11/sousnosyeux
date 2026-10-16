#!/usr/bin/env node
// =====================================================================
// scripts/qa/demo-multi-surfaces.mjs — DÉMONSTRATION sur données ISOLÉES : une information validée change-t-elle RÉELLEMENT les pages publiques ?
//
//   node scripts/qa/demo-multi-surfaces.mjs [--garder]
//
// Pour chaque scénario : copie isolée de web/ et data/ dans un dossier temporaire (jamais le dépôt), injection de faits de TEST (libellé
// « [TEST SNY — fictif] », source fictive) dans la projection, VRAIE construction Astro, puis comparaison du texte des pages construites
// avec la construction de référence. Aucune écriture dans le dépôt, aucune base, aucun réseau, aucun Telegram.
// Nécessite web/node_modules (dépendances déjà installées). Non branché sur run-all : construction Astro ≈ 10 s par scénario.
// =====================================================================
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { construireMatiere } from '../lib/destinations.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NODE_MODULES = [join(ROOT, 'web/node_modules'), 'C:/Users/adrien.etienne/OneDrive - Cdiscount/Documents/sousnosyeux/web/node_modules'].find(existsSync);
if (!NODE_MODULES) { console.error('web/node_modules introuvable : démonstration impossible'); process.exit(2); }
mkdirSync(join(homedir(), 'sny-demo'), { recursive: true });
const TMP = mkdtempSync(join(homedir(), 'sny-demo', 'run-')); // chemin long (jamais un nom court 8.3 : vite l'échoue à travers la jonction node_modules)
const TEST = '[TEST SNY — fictif] ';
const SRC = { media: 'Source de test', url: 'https://test.invalid/article-fictif', publie_le: '2026-10-14' };
const lire = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));

/** Copie isolée du site : web/ (sans node_modules ni dist) + data/, avec évenements.json modifié. */
function preparer(nom, modifier) {
  const dir = join(TMP, nom); mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'web'), join(dir, 'web'), { recursive: true, filter: (p) => !/[\\/](node_modules|dist|\.astro)([\\/]|$)/.test(p) });
  cpSync(join(ROOT, 'data'), join(dir, 'data'), { recursive: true });
  symlinkSync(NODE_MODULES, join(dir, 'web/node_modules'), 'junction');
  if (modifier) { const ev = lire('data/evenements.json'); modifier(ev); writeFileSync(join(dir, 'data/evenements.json'), JSON.stringify(ev, null, 2) + '\n'); }
  return dir;
}
function construire(dir) {
  execFileSync(process.execPath, [join(dir, 'web/node_modules/astro/astro.js'), 'build'], { cwd: join(dir, 'web'), stdio: 'pipe' });
  return join(dir, 'web/dist');
}
const fichiers = (d, base = d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? fichiers(p, base) : [p.slice(base.length + 1).replace(/\\/g, '/')]; });
const html = (d) => fichiers(d).filter((f) => f.endsWith('.html'));
const texte = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, '\n').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const empreinte = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');
const REFERENCE = construire(preparer('reference', null));

/** Faits de test → matière projetée par la VRAIE fonction de destination, dans le contexte réel des fichiers. */
function contexte(ev) {
  const cases = lire('data/cases.json').cases;
  const hubs = Object.fromEntries(['paris-11e', 'bordeaux-gironde', 'hautes-alpes'].map((h) => [h, { publie: true, groupes: lire(`data/hub-matiere/${h}.json`).reponses.map((g) => g.titre) }]));
  return { publiques: new Set(cases.map((c) => c.case_id)), holds: new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id)), approuvees: new Set(Object.keys(ev.fiches_approuvees)),
    cases: new Map(cases.map((c) => [c.case_id, { commune: c.commune, departement: c.departement, etablissement: c.etablissement }])), hubs };
}
const fait = (o) => ({ nature: 'mobilisation', realisation: 'réalisée', portee: 'établissement', acteur: 'parents, enseignants', territoire: null, date: '2026-10-14', periode: null, source: SRC, event_id: null, ...o, libelle: TEST + o.libelle });
const projeter = (ev, faits) => { const r = construireMatiere(faits, contexte(ev)); ev.matiere = r.matiere; return r; };

const SCENARIOS = [
  { nom: 'Cas 1 — fiche existante seule', attendu: ['affaires/fr-2026-0042/index.html'],
    faits: [fait({ id: 'test-s1', case_id: 'FR-2026-0042', libelle: 'Selon la presse, des parents ont tenu un rassemblement.' })] },
  { nom: 'Cas 2 — Hub existant seul (mesure territoriale, Ville de Paris)', attendu: ['territoires/paris-11e/index.html'],
    faits: [fait({ id: 'test-s2', case_id: 'POC-05', nature: 'mesure', portee: 'territoire', territoire: 'Paris', acteur: 'Ville de Paris', date: null, periode: '2025-11', libelle: 'Selon la presse, la collectivité a annoncé un plan de formation de ses agents au contact des enfants.' })] },
  { nom: 'Cas 2b — Aqueduc réel (Paris 10e) : la mesure de la Ville de Paris garde son attribution municipale', attendu: ['territoires/paris-11e/index.html'],
    faits: [fait({ id: 'test-s2b', case_id: 'FR-2026-0002', nature: 'mesure', portee: 'territoire', territoire: 'Paris', acteur: 'Ville de Paris', date: null, periode: '2025-11', libelle: 'Selon la presse, la collectivité a annoncé un plan de formation de ses agents au contact des enfants.' })],
    controle: (dist) => {
      // HTML RÉEL du Hub : l'élément ajouté est dans le bloc municipal, attribué à la Ville de Paris, portée « Paris » ; jamais propre à Aqueduc ni à la mairie du 11e.
      const page = readFileSync(join(dist, 'territoires/paris-11e/index.html'), 'utf8');
      const i = page.indexOf('[TEST SNY — fictif]'); assert.ok(i > 0, 'élément présent');
      const li = page.slice(page.lastIndexOf('<li', i), page.indexOf('</li>', i) + 5);
      const section = page.slice(page.lastIndexOf('<section', i), page.indexOf('</section>', i));
      assert.match(section, /<h3[^>]*>Ville de Paris et mairie du 11e<\/h3>/, 'bloc municipal existant');
      assert.match(li, /<span class="acteur"[^>]*>Ville de Paris<\/span>/, 'acteur : la Ville de Paris');
      assert.match(li, /Portée : Paris, non propre à une école/, 'portée territoriale explicite');
      assert.match(li, /Novembre 2025/, 'période relative correcte, jour non inventé');
      assert.ok(!/Aqueduc|mairie du 11e|11e arrondissement/i.test(li), 'jamais présentée comme propre à Aqueduc ni à la mairie du 11e');
      console.log('  HTML réel (Hub Paris 11e) : ' + li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260));
    } },
  { nom: 'Cas 3 — une information, deux surfaces (fiche ET Hub)', attendu: ['affaires/poc-09/index.html', 'territoires/paris-11e/index.html'],
    faits: [fait({ id: 'test-s3', case_id: 'POC-09', event_id: 'ev-test-s3', libelle: 'Selon la presse, des parents ont tenu un rassemblement.' })],
    evenement: { case_id: 'POC-09', event: { event_id: 'ev-test-s3', date: '2026-10-14', type: 'mobilisation', statut: null, libelle: TEST + 'Selon la presse, des parents ont tenu un rassemblement.', realisation: 'réalisée', source: SRC } } },
  { nom: 'Cas 4 + 5 — aucune page / portée négative (candidate, HOLD, Villeurbanne, Lyon)', attendu: [],
    faits: [fait({ id: 'test-s4a', case_id: 'FR-2026-0136', libelle: 'Selon la presse, des parents ont tenu un rassemblement.' }),                       // candidate : aucune fiche, aucun Hub
      fait({ id: 'test-s4b', case_id: 'FR-2026-0004', libelle: 'Selon la presse, des parents ont tenu un rassemblement.' }),                       // sous HOLD
      fait({ id: 'test-s5a', case_id: 'FR-2026-0121', nature: 'mesure', portee: 'territoire', territoire: 'Villeurbanne', acteur: 'Ville de Villeurbanne', date: null, periode: '2026-10', libelle: 'Selon la presse, la collectivité a annoncé un plan de formation de ses agents au contact des enfants.' }),
      fait({ id: 'test-s5b', case_id: 'FR-2026-0114', nature: 'mesure', portee: 'territoire', territoire: 'Lyon', acteur: 'Ville de Lyon', date: null, periode: '2026-10', libelle: 'Selon la presse, la collectivité a annoncé un plan de formation de ses agents au contact des enfants.' })] },
];

let ok = 0;
for (const s of SCENARIOS) {
  console.log(`\n=== ${s.nom}`);
  const dir = preparer(s.nom.replace(/\W+/g, '-').slice(0, 24), (ev) => {
    if (s.evenement) (ev.affaires[s.evenement.case_id] ||= []).push(s.evenement.event);
    const r = projeter(ev, s.faits);
    console.log(`  projection : ${r.matiere.length} information(s) publique(s) sur ${s.faits.length} fait(s) de test ; ${r.bloques.length} blocage(s)`);
    for (const m of r.matiere) console.log(`    · ${m.id} → fiche ${m.destinations.fiche ?? '—'} · hubs ${m.destinations.hubs.map((h) => `${h.hub} / ${h.groupe}`).join(', ') || '—'}`);
  });
  const dist = construire(dir);
  const changees = html(dist).filter((f) => empreinte(join(dist, f)) !== empreinte(join(REFERENCE, f)));
  const nouvelles = html(dist).filter((f) => !existsSync(join(REFERENCE, f)));
  console.log(`  pages modifiées : ${changees.join(', ') || 'aucune'} · pages nouvelles : ${nouvelles.join(', ') || 'aucune'}`);
  assert.deepEqual(changees.sort(), [...s.attendu].sort(), 'seules les pages concernées changent');
  assert.deepEqual(nouvelles, [], 'aucune nouvelle page');
  for (const f of changees) {
    const avant = texte(readFileSync(join(REFERENCE, f), 'utf8')), apres = texte(readFileSync(join(dist, f), 'utf8'));
    const ajoutees = apres.filter((l) => !avant.includes(l)), retirees = avant.filter((l) => !apres.includes(l));
    console.log(`  ── ${f} : +${ajoutees.length} ligne(s) de texte, −${retirees.length}`);
    for (const l of ajoutees) console.log(`     + ${l.slice(0, 150)}`);
    assert.equal(retirees.length, 0, 'rien n’est retiré : état judiciaire, chronologie et blocs existants inchangés');
    assert.ok(ajoutees.every((l) => /TEST SNY|Source de test|Mobilisation|Mesure|Parents|Ville de Paris|Collectivité|Portée|portée|novembre 2025|14 octobre 2026|Position attribuée|À propos|Réalisée|Réponses|Paroles/i.test(l)), 'seul le contenu de l’information est ajouté');
    const occurrences = apres.filter((l) => l.includes('[TEST SNY — fictif] Selon la presse')).length;
    assert.ok(occurrences >= 1);
    if (s.evenement && f.startsWith('affaires/')) assert.equal(occurrences, 1, 'une fiche : l’information apparaît UNE fois (pas aussi dans le déroulé)');
  }
  if (s.controle) s.controle(dist);
  // Rejeu idempotent : même projection → mêmes octets → aucune modification.
  const ev1 = lire('data/evenements.json'); const ev2 = lire('data/evenements.json');
  projeter(ev1, s.faits); projeter(ev2, s.faits);
  assert.equal(JSON.stringify(ev1.matiere), JSON.stringify(ev2.matiere), 'rejeu : projection identique');
  ok++;
}
console.log(`\n${ok}/${SCENARIOS.length} scénarios : OK — seules les pages concernées changent, rien n'est retiré, aucune page créée, rejeu identique.`);
if (!process.argv.includes('--garder')) rmSync(TMP, { recursive: true, force: true });
else console.log(`(copies conservées : ${TMP})`);
