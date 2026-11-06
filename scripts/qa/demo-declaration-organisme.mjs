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
import { chargerContexteHub, classer, passages, faitsDeclares, aliasOrganismes, chargerRegistre } from '../lib/sources-suivies.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NM = join(ROOT, 'web/node_modules');
if (!existsSync(NM)) { console.error('web/node_modules introuvable'); process.exit(2); }
mkdirSync(join(homedir(), 'sny-demo'), { recursive: true });
const TMP = mkdtempSync(join(homedir(), 'sny-demo', 'decl-'));
const lire = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const SOURCE = { media: "L'Enfant Bleu", url: 'https://enfantbleu.org/violences-dans-le-periscolaire-comment-lenfant-bleu-accompagne-les-collectivites/', publie_le: '2026-07-21' };
const registre = chargerRegistre(join(ROOT, 'data/associations-watchlist.json'));
const organisme = registre.organismes.find((o) => o.id === 'enfant-bleu');
const dirHubs = join(ROOT, 'data/hub-matiere');
const contexteHub = chargerContexteHub(readdirSync(dirHubs).filter((f) => f.endsWith('.json')).map((f) => join(dirHubs, f)), join(ROOT, 'data/evenements.json'));
const casesPub = lire('data/cases.json').cases;
const fichePOC05 = casesPub.find((c) => c.case_id === 'POC-05');
const corpsA = readFileSync(join(ROOT, 'fixtures/sources-suivies/A-enfant-bleu-2026-07-21.txt'), 'utf8').replace(/\r\n/g, '\n');
const cls = classer({ doc: { titre: 'Violences dans le périscolaire', corps: corpsA, url: SOURCE.url }, page: { type: 'document' }, organisme,
  fiches: casesPub.map((c) => ({ case_id: c.case_id, etablissement: c.etablissement, commune: c.commune, departement: c.departement, role_mis_en_cause: c.role_mis_en_cause, statut_judiciaire: c.statut_judiciaire, sources_dates: (c.sources || []).map((x) => x.publication_date).filter(Boolean) })) });
assert.deepEqual(cls.case_ids, ['POC-05']);
const [FAIT] = faitsDeclares({ passages: passages(cls.zone, fichePOC05, { alias: aliasOrganismes(registre.organismes) }), organisme, emetteur: "L'Enfant Bleu", nature: 'PUBLICATION_PROPRE', publie_le: SOURCE.publie_le, fiche: fichePOC05, contexte: contexteHub });
assert.ok(FAIT && FAIT.ajustements_inconnues?.length === 2, 'fait et ajustements produits par le code');
const LIBELLE = FAIT.libelle_public;
const AVANT_D = FAIT.ajustements_inconnues.find((a) => a.cible === 'dossier'), AVANT_T = FAIT.ajustements_inconnues.find((a) => a.cible === 'transversale');
const AUTRE_INCONNUE = 'Les motifs ne sont connus que par la presse : le jugement n\'est pas public.';

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
const fait = { id: 'decl-test-0001', case_id: 'POC-05', nature: 'mobilisation', libelle: LIBELLE, realisation: 'réalisée', portee: 'établissement', acteur: "L'Enfant Bleu", territoire: null, date: null, periode: null, source: SOURCE, event_id: null, etablissement: 'École maternelle Alphonse-Baudin', ajustements: FAIT.ajustements_inconnues };

const rapport = {};
try {
  const ref = construire(preparer('reference', null));
  const refFiche = page(ref, 'affaires/poc-05'), refHub = page(ref, 'territoires/paris-11e');
  assert.ok(refFiche && refHub, 'pages de référence présentes');
  assert.ok(!refFiche.includes(LIBELLE) && !refHub.includes(LIBELLE), 'référence : le texte est absent');
  assert.ok(refFiche.includes(AVANT_D.avant) && refHub.includes(AVANT_T.avant) && refFiche.includes(AUTRE_INCONNUE), 'référence : inconnues d’origine présentes');

  // Scénario 1 : ACCEPT (matière projetée) → présent dans la fiche ET le Hub, état judiciaire inchangé.
  const accepte = construire(preparer('accepte', (dir, ev) => { ev.matiere = construireMatiere([fait], contexte(ev, new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id)))).matiere; }));
  const f1 = page(accepte, 'affaires/poc-05'), h1 = page(accepte, 'territoires/paris-11e');
  assert.ok(f1.includes(LIBELLE), 'fiche : texte approuvé présent'); assert.ok(h1.includes(LIBELLE), 'Hub : texte approuvé présent');
  assert.ok(/relax/i.test(f1), 'fiche : l’issue favorable reste dite'); assert.ok(/relax/i.test(h1), 'Hub : l’issue favorable reste dite');
  // inconnue ajustée (portion stricte) : la phrase obsolète disparaît, sa version ajustée apparaît, les AUTRES inconnues restent
  assert.ok(f1.includes(AVANT_D.apres) && !f1.includes(AVANT_D.avant), 'fiche : inconnue ajustée');
  assert.ok(h1.includes(AVANT_T.apres) && !h1.includes(AVANT_T.avant), 'Hub : inconnue transversale ajustée');
  assert.ok(!h1.includes(AVANT_D.avant), 'Hub : la phrase obsolète du dossier a disparu aussi');
  assert.ok(f1.includes(AUTRE_INCONNUE) && h1.includes(AUTRE_INCONNUE), 'les autres inconnues restent');
  assert.ok(f1.includes('non confirmée indépendamment') && f1.includes('ne précise pas la procédure visée'), 'limites d’attribution conservées dans le rendu');
  rapport.accepte = { fiche: true, hub: true, inconnues_ajustees: FAIT.ajustements_inconnues, extrait_fiche: f1.slice(Math.max(0, f1.indexOf(LIBELLE) - 160), f1.indexOf(LIBELLE) + LIBELLE.length + 120), extrait_hub: h1.slice(Math.max(0, h1.indexOf(LIBELLE) - 160), h1.indexOf(LIBELLE) + LIBELLE.length + 120) };

  // Scénario 2 : HOLD sur l'affaire → matière vide → aucune page ne change.
  const hold = construire(preparer('hold', (dir, ev) => { ev.matiere = construireMatiere([fait], contexte(ev, new Set(['POC-05']))).matiere; }));
  assert.ok(!page(hold, 'affaires/poc-05').includes(LIBELLE) && !page(hold, 'territoires/paris-11e').includes(LIBELLE));
  assert.ok(page(hold, 'affaires/poc-05').includes(AVANT_D.avant) && page(hold, 'territoires/paris-11e').includes(AVANT_T.avant), 'HOLD : inconnues inchangées');
  rapport.hold = { fiche: false, hub: false };

  // Scénario 3 : refus / REVIEW / aucune décision → la matière n'est jamais projetée (seul ACCEPT l'alimente) → pages identiques à la référence.
  rapport.sans_decision = { fiche_identique: page(ref, 'affaires/poc-05') === refFiche, hub_identique: page(ref, 'territoires/paris-11e') === refHub };
  assert.ok(rapport.sans_decision.fiche_identique && rapport.sans_decision.hub_identique);
  console.log('✓ ACCEPT : déclaration + inconnues ajustées (fiche POC-05, Hub Paris 11e), issue favorable et autres inconnues préservées\n✓ HOLD : aucune page ne change (déclaration ET inconnues)\n✓ sans ACCEPT : pages identiques à la référence');
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ note: 'Démonstration isolée (copie de web/ et data/), construction Astro réelle ; rien écrit dans le dépôt ni en production.', libelle: LIBELLE, ...rapport }, null, 1));
} finally { rmSync(TMP, { recursive: true, force: true }); }
