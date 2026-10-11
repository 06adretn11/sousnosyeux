#!/usr/bin/env node
// Publication autonome — intégration : un GO éditorial validé + éligible aboutit à la publication ; tout le reste n'en déclenche aucune.
// Aucun réseau, aucune base (la simulation de concurrence utilise un dépôt git local jetable).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { etatPublication } from '../lib/publication-gates.mjs';
import { ecartsSite } from '../lib/ecarts-site.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const lire = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));

const DEPUIS = new Date('2026-10-11T14:19:00Z');
const base = { case_id: 'FR-2026-9001', publication_status: 'candidate', fiabilite_info_10: 10, statut_judiciaire: 'enquête', crit_statut_clair: true,
  etablissement: 'Centre de loisirs X', commune: 'Ville', departement: 'Dep', type_structure: 'centre de loisirs', role_mis_en_cause: 'animateur',
  enfants_concernes_public: 'non précisé', lat: 44.1, lng: 1.2 };
const apres = '2026-10-12T08:00:00Z', avant = '2026-10-06T08:00:00Z';
const go = (quand = apres) => ({ reviewed_by: 'Adrien (Telegram, Discovery)', decision: 'validé', comment: '[Discovery-auto:ab12cd34] VALIDATE — résumé', reviewed_at: quand });
const ctx = (o = {}) => ({ revues: [go()], sources: [{ url: 'https://www.exemple.fr/article-1', media: 'Média' }], holds: new Set(), autres: [], artefact: new Map(), depuis: DEPUIS, ...o });
const etat = (c = {}, o = {}) => etatPublication({ ...base, ...c }, ctx(o));

console.log('\n  PUBLICATION AUTONOME — intégration\n  ' + '─'.repeat(70));

t('GO + éligibilité → READY (publiée au prochain passage)', () => assert.equal(etat()?.etat, 'READY'));
t('absence de GO → aucune publication, aucune alerte', () => assert.equal(etat({}, { revues: [] }), null));
t('GO d’un tiers (pas Adrien) → aucune publication', () => assert.equal(etat({}, { revues: [{ ...go(), reviewed_by: 'import-script' }] }), null));
t('rattachement de sources (RAPPROCHER) ≠ GO de publication', () => assert.equal(etat({}, { revues: [{ ...go(), comment: '[Discovery-auto:ab12cd34] RAPPROCHER — 1 article' }] }), null));
t('validation ANTÉRIEURE à l’activation (arriéré « CRÉER, non publiée ») → jamais publiée', () => assert.equal(etat({}, { revues: [go(avant)] }), null));
t('HOLD + GO → BLOCKED, jamais READY', () => assert.equal(etat({}, { holds: new Set(['FR-2026-9001']) }).etat, 'BLOCKED'));
t('revue « retirer » → BLOCKED, jamais READY', () => assert.equal(etat({}, { revues: [go(), { reviewed_by: 'Adrien', decision: 'retirer', comment: '', reviewed_at: apres }] }).etat, 'BLOCKED'));
t('une affaire bloquée n’empêche pas les autres (états indépendants)', () => {
  const lot = [etat({ case_id: 'A' }, { holds: new Set(['A']) }), etat({ case_id: 'B' }), etat({ case_id: 'C', fiabilite_info_10: 4 })];
  assert.deepEqual(lot.map((e) => e.etat), ['BLOCKED', 'READY', 'BLOCKED']);
});

// Déjà dans l'artefact → aucune duplication ; publiée + HOLD (cases_public) → jamais reprojetée.
const artefact = new Map([['FR-2026-0115', { case_id: 'FR-2026-0115', lat: 43.5, lng: -1.4 }], ['FR-2026-0133', { case_id: 'FR-2026-0133', lat: 49.2, lng: -0.4 }]]);
const publiee = (id, extra = {}) => ({ ...base, case_id: id, publication_status: 'publiée', ...extra });
t('déjà dans l’artefact → IN_ARTEFACT (ni READY ni NEEDS_PROJECTION : aucune duplication)', () => {
  assert.equal(etatPublication(publiee('FR-2026-0115'), ctx({ artefact })).etat, 'IN_ARTEFACT');
});
t('Tarnos (0115) et Rots (0133) déjà en ligne → aucune action', () => {
  for (const id of ['FR-2026-0115', 'FR-2026-0133']) assert.equal(etatPublication(publiee(id), ctx({ artefact })).etat, 'IN_ARTEFACT');
});
t('publiée en base mais absente de l’artefact → NEEDS_PROJECTION (rattrapage d’un passage interrompu)', () => assert.equal(etatPublication(publiee('FR-2026-9100'), ctx()).etat, 'NEEDS_PROJECTION'));
t('FR-2026-0048 et FR-2026-0049 : HOLD réels → exclues, même « publiées » en base (cases_public)', () => {
  const holds = new Set((lire('data/publication-holds.json').holds || []).map((h) => h.case_id));
  for (const id of ['FR-2026-0048', 'FR-2026-0049']) {
    assert.ok(holds.has(id), `${id} doit être dans publication-holds.json`);
    assert.equal(etatPublication(publiee(id), ctx({ holds })).etat, 'HOLD');
  }
});
t('publiée en base mais fiabilité < 8 → BLOCKED, jamais projetée', () => assert.equal(etatPublication(publiee('FR-2026-9101', { fiabilite_info_10: 4 }), ctx()).etat, 'BLOCKED'));

// Build en échec : le site servi ne montre pas l'affaire → écart → jamais « publié et vérifié » (verifier-site n'annonce que sans écart).
const page = (cases) => `<html><script type="application/json" id="cases-data">${JSON.stringify(cases)}</script></html>`;
const attendu = new Map([['FR-2026-9001', { case_id: 'FR-2026-9001', statut_judiciaire: 'enquête', sources: [{ url: 'https://x.fr/a' }] }]]);
t('build en échec (affaire absente du site servi) → écart, donc PAS annoncée « publiée »', () => assert.deepEqual(ecartsSite(page([]), ['FR-2026-9001'], attendu), ['FR-2026-9001 : absente du site']));
t('page illisible / site injoignable → jamais « vérifié »', () => assert.ok(ecartsSite('<html></html>', ['FR-2026-9001'], attendu).length > 0));
t('build réussi (affaire présente et conforme) → aucun écart', () => assert.deepEqual(ecartsSite(page([{ case_id: 'FR-2026-9001', statut_judiciaire: 'enquête', source_url: 'https://x.fr/a' }]), ['FR-2026-9001'], attendu), []));

// Deux publications simultanées : le serveur git sert d'arbitre, aucune fiche d'autrui n'est écrasée.
t('deux publications simultanées → aucune perte de fiche (push refusé ⇒ rebase ou échec franc, jamais d’écrasement)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sny-conc-'));
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(tmp, 'init', '-q', '--bare', '--initial-branch=main', 'origin.git');
    const cloner = (nom) => { git(tmp, 'clone', '-q', 'origin.git', nom); git(join(tmp, nom), 'config', 'user.email', 'a@b.c'); git(join(tmp, nom), 'config', 'user.name', nom); return join(tmp, nom); };
    const seed = cloner('seed'); mkdirSync(join(seed, 'data'));
    const ecrire = (d, ids) => writeFileSync(join(d, 'data/cases.json'), JSON.stringify({ cases: ids.map((id) => ({ case_id: id, etablissement: 'x', sources: [] })) }, null, 2) + '\n');
    ecrire(seed, ['FR-2026-0001', 'FR-2026-0100']);
    git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'base'); git(seed, 'push', '-q', 'origin', 'HEAD:main');
    const A = cloner('A'), B = cloner('B');
    ecrire(A, ['FR-2026-0001', 'FR-2026-0100', 'FR-2026-0115']); git(A, 'commit', '-qam', 'pub 0115');
    ecrire(B, ['FR-2026-0001', 'FR-2026-0100', 'FR-2026-0133']); git(B, 'commit', '-qam', 'pub 0133');
    git(A, 'push', '-q', 'origin', 'HEAD:main');
    let b = 'pousse';
    try { git(B, 'push', '-q', 'origin', 'HEAD:main'); } catch { /* refusé : non fast-forward, attendu */ }
    try { git(B, 'pull', '--rebase', '-q', 'origin', 'main'); git(B, 'push', '-q', 'origin', 'HEAD:main'); } catch { b = 'conflit'; try { git(B, 'rebase', '--abort'); } catch { /* */ } }
    console.log('    (second publieur : ' + (b === 'pousse' ? 'rebase réussi, deux fiches conservées' : 'conflit git, échec franc — recalculé au passage suivant') + ')');
    const final = JSON.parse(git(tmp, '--git-dir=origin.git', 'show', 'main:data/cases.json')).cases.map((c) => c.case_id);
    assert.ok(final.includes('FR-2026-0115'), 'la fiche du premier publieur ne doit JAMAIS être perdue');
    assert.ok(final.includes('FR-2026-0001') && final.includes('FR-2026-0100'), 'les fiches existantes ne doivent pas être perdues');
    // Si le rebase a abouti, les deux sont là ; sinon le second a échoué franchement et sera recalculé au prochain passage (NEEDS_PROJECTION).
    if (b === 'pousse') assert.ok(final.includes('FR-2026-0133'));
    else assert.ok(!final.includes('FR-2026-0133'), 'échec franc : rien d’inventé');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
t('les deux workflows partagent UN groupe de concurrence (jamais deux publications en même temps)', () => {
  const g = (f) => /concurrency:\s*\n\s*group:\s*(\S+)\s*\n\s*cancel-in-progress:\s*false/.exec(readFileSync(new URL(`../../.github/workflows/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  assert.ok(g('sny-telegram.yml') && g('sny-clics.yml'));
  assert.equal(g('sny-telegram.yml')[1], g('sny-clics.yml')[1]);
});
t('les deux workflows réconcilient, avec le seuil d’activation, AVANT la QA ; l’alerte connaît l’étape', () => {
  for (const f of ['sny-telegram.yml', 'sny-clics.yml']) {
    const y = readFileSync(new URL(`../../.github/workflows/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(y.includes('scripts/reconcilier-publication.mjs --ecrire') && y.includes('SNY_PUBLICATION_DEPUIS'));
    assert.ok(y.indexOf('reconcilier-publication.mjs --ecrire') < y.indexOf('scripts/qa/run-all.mjs'), 'la QA précède la publication, après la réconciliation');
    assert.ok(y.indexOf('scripts/qa/run-all.mjs') < y.indexOf('git push origin HEAD:main'), 'QA avant push');
  }
  assert.ok(readFileSync(new URL('../../.github/workflows/sny-telegram.yml', import.meta.url), 'utf8').includes('OUTCOME_reconcile'));
});

console.log(`\n  ${n} contrôles : OK\n`);
