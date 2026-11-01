#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-confirmation-enrichissement.mjs — le message de CONFIRMATION d'un enrichissement suit l'issue RÉELLE, pas le statut « publiée ».
// Défaut constaté (clic Soyaux, 16/10/2026) : « La fiche est publiée en base ; data/cases.json reste à régénérer » pour une mobilisation documentaire.
//   1. validé et conservé, aucune page modifiée  → persistance, sans promesse de publication
//   2. validé et publié                           → « Publié et vérifié » après le site servi, avec l'URL des pages
//   3. validé mais publication bloquée            → motif exact, sans nouveau GO
//   4. nouvelle affaire                           → circuit et messages existants inchangés
// =====================================================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phrasePublication, phraseEnrichissement, texteConservee, texteBloquee, texteVerifie } from '../lib/prevenir.mjs';
import { construireMatiere } from '../lib/destinations.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MAUVAIS = /publiée en base|régénérer|data\/cases\.json/;

console.log('\n  1. VALIDÉ ET CONSERVÉ — aucune page modifiée');
t('à l’application : persistance seulement, aucune promesse de publication, plus de « fiche publiée en base »', () => {
  const m = phraseEnrichissement(); assert.ok(!MAUVAIS.test(m)); assert.match(m, /conservée en mémoire/); assert.match(m, /Aucune publication n’est promise/);
});
t('confirmation de projection sans page : « Aucune page publique n’est modifiée », information disponible pour une future fiche / un Hub, pas de GO demandé', () => {
  const m = texteConservee({ id: 'x', case_id: 'FR-2026-0137', etablissement: 'école Les Tilleuls', libelle: 'Selon la presse, des parents ont tenu un rassemblement.' });
  assert.ok(!MAUVAIS.test(m)); assert.match(m, /Aucune page publique n’est modifiée/); assert.match(m, /future fiche ou un Hub/); assert.match(m, /Aucune publication n’est en cours/); assert.ok(!/GO/.test(m));
});
const CTX = (o = {}) => ({ publiques: new Set(['PUB', 'PUB-FICHE', 'G-1']), holds: new Set(), approuvees: new Set(['PUB-FICHE']),
  cases: new Map([['PUB', { commune: 'Soyaux', departement: 'Charente', etablissement: 'École A' }], ['PUB-FICHE', { commune: 'Delle', departement: 'Territoire de Belfort', etablissement: 'Collège D' }], ['G-1', { commune: 'Cenon', departement: 'Gironde', etablissement: 'École C' }]]),
  hubs: { 'paris-11e': { publie: true, groupes: ['Justice'] }, 'bordeaux-gironde': { publie: true, groupes: ['Justice', 'Ville de Bordeaux et Éducation nationale'] }, 'hautes-alpes': { publie: true, groupes: ['Justice'] } }, ...o });
const fait = (o) => ({ id: 'f', case_id: 'PUB', nature: 'mobilisation', portee: 'établissement', libelle: 'Selon la presse, des parents ont tenu un rassemblement.', realisation: 'réalisée', acteur: 'parents', territoire: null, date: '2026-10-15', periode: null, source: { media: 'M', url: 'https://m.example/a' }, etablissement: 'École A', ...o });
t('l’issue vient de la PROJECTION réelle : une affaire PUBLIÉE sans fiche approuvée ni Hub → « conservée » (le statut publiée ne décide rien)', () => {
  const r = construireMatiere([fait()], CTX()); assert.equal(r.matiere.length, 0); assert.equal(r.bloques.length, 0); assert.deepEqual(r.conservees.map((x) => x.case_id), ['PUB']);
});
t('affaire non publique : conservée aussi (mémoire), jamais projetée ; le même fait avec fiche approuvée n’est PAS « conservé » mais projeté', () => {
  assert.equal(construireMatiere([fait({ case_id: 'CANDIDATE' })], CTX()).conservees.length, 1);
  const r = construireMatiere([fait({ case_id: 'PUB-FICHE' })], CTX()); assert.equal(r.matiere.length, 1); assert.equal(r.conservees.length, 0);
});

console.log('\n  2. VALIDÉ ET PUBLIÉ — notification après vérification du site, URL des pages');
t('« Publié et vérifié » nomme chaque page actualisée avec son URL (fiche + Hub)', () => {
  const m = texteVerifie({ fiches: ['FR-2026-0042'], hubs: ['paris-11e'], site: 'https://sousnosyeux.org' });
  assert.match(m, /Publié et vérifié/); assert.ok(m.includes('fiche FR-2026-0042') && m.includes('Hub paris-11e'));
  assert.ok(m.includes('https://sousnosyeux.org/affaires/fr-2026-0042/') && m.includes('https://sousnosyeux.org/territoires/paris-11e/')); assert.ok(!MAUVAIS.test(m));
});
t('lot important (60 cartes, 58 fiches, 4 Hubs) : le message reste sous la limite de 4096 caractères de l’API Telegram, avec décompte et Hubs', () => {
  const fiches = Array.from({ length: 58 }, (_, i) => `FR-2026-${String(i + 1).padStart(4, '0')}`);
  const m = texteVerifie({ ids: fiches.slice(0, 60), fiches, hubs: ['paris-11e', 'landes'], site: 'https://sousnosyeux.org' });
  assert.ok(m.length < 4096 && /58 fiche\(s\)/.test(m) && m.includes('https://sousnosyeux.org/territoires/landes/') && /Publié et vérifié/.test(m));
});
t('seul verifier-site (après lecture du site servi) annonce « publié et vérifié » ; le message passe par texteVerifie', () => {
  const v = src('scripts/verifier-site.mjs'); assert.ok(v.includes('texteVerifie({ ids, fiches, hubs, site: SITE, infos })'));
});

console.log('\n  3. VALIDÉ MAIS BLOQUÉ — motif exact, sans nouveau GO');
t('le message porte le motif EXACT de la projection, dit que la validation est conservée et qu’aucun GO n’est redemandé', () => {
  const r = construireMatiere([fait({ case_id: 'G-1', etablissement: 'École C' })], CTX({ approuvees: new Set() }));
  assert.equal(r.bloques.length, 1); assert.equal(r.conservees.length, 0);                       // bloqué ≠ conservé sans page
  const m = texteBloquee(r.bloques[0]); assert.ok(m.includes(r.bloques[0].raison)); assert.match(m, /aucun bloc existant/); assert.match(m, /validation est conservée/); assert.match(m, /Aucun nouveau GO/);
  assert.ok(!MAUVAIS.test(m));
});

console.log('\n  4. NOUVELLE AFFAIRE — circuit et messages existants conservés');
t('phrasePublication inchangée (publiée / candidate / autre) et toujours utilisée par la création et le rapprochement d’affaires', () => {
  assert.match(phrasePublication('publiée'), /publiée en base/); assert.match(phrasePublication('candidate'), /GO explicite/); assert.equal(phrasePublication('retirée'), 'Aucune publication.');
  const a = src('scripts/appliquer-nouvelles-affaires.mjs'); assert.ok(a.includes('phrasePublication(\'candidate\')') && a.includes('phrasePublication(kc.pub)'));
});
t('l’application d’un enrichissement n’emploie plus phrasePublication (statut publiée) ; l’état judiciaire reste dit inchangé', () => {
  const d = src('scripts/appliquer-decisions.mjs'); const bloc = d.slice(d.indexOf('ENRICHMENT institutionnel | AUTO_APPLICABLE'), d.indexOf('// --- (b) FAIT DÉJÀ CONSIGNÉ'));
  assert.ok(bloc.includes('phraseEnrichissement()') && !bloc.includes('phrasePublication(') && bloc.includes('L’état judiciaire ne change pas'));
});
t('la projection notifie chaque issue UNE fois (clé par fait), sans identifiant interne ni écriture de page', () => {
  const p = src('scripts/project-evenements.mjs');
  assert.ok(p.includes("matiere:conservee:${f.id}") && p.includes('texteConservee(f)') && p.includes('texteBloquee(b)') && p.includes('prevenirUneFois'));
});

console.log(`\n  ${n} contrôles : OK\n`);
