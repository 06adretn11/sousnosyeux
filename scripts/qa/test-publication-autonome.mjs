#!/usr/bin/env node
// Publication autonome — contrat : l'autorisation éditoriale n'est JAMAIS automatisée, son exécution l'est entièrement.
//   CREATE/VALIDATE = candidate · CREATE_PENDING = non publiable · ATTACH = rattachement · REVIEW/HOLD = rien · GO PUBLICATION = publier.
// Aucun réseau, aucune base (la simulation de concurrence utilise un dépôt git local jetable).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { etatPublication, goPublication, categorieDiagnostic } from '../lib/publication-gates.mjs';
import { ecartsSite } from '../lib/ecarts-site.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lire = (f) => JSON.parse(src(f));

const DEPUIS = new Date('2026-10-11T14:19:00Z');
const apres = '2026-10-12T08:00:00Z', avant = '2026-10-06T08:00:00Z';
const base = { case_id: 'FR-2026-9001', publication_status: 'candidate', fiabilite_info_10: 10, statut_judiciaire: 'enquête', crit_statut_clair: true,
  etablissement: 'Centre de loisirs X', commune: 'Ville', departement: 'Dep', type_structure: 'centre de loisirs', role_mis_en_cause: 'animateur',
  enfants_concernes_public: 'non précisé', lat: 44.1, lng: 1.2 };
const R = (comment, decision = 'validé', by = 'Adrien (Telegram, Discovery)', quand = apres) => ({ reviewed_by: by, decision, comment, reviewed_at: quand });
const CREATE = (q) => R('[Discovery-auto:ab12cd34] VALIDATE — résumé', 'validé', 'Adrien (Telegram, Discovery)', q);
const GO = (q = apres) => R("[Publication 2026-10-12] GO d'Adrien : « publie cette affaire »", 'validé', 'Adrien (GO publication)', q);
const ctx = (o = {}) => ({ revues: [CREATE()], sources: [{ url: 'https://www.exemple.fr/article-1', media: 'Média' }], holds: new Set(), autres: [], artefact: new Map(), depuis: DEPUIS, ...o });
const cand = (c = {}, o = {}) => etatPublication({ ...base, ...c }, ctx(o));
const publiee = (c = {}, o = {}) => etatPublication({ ...base, publication_status: 'publiée', ...c }, ctx({ revues: [CREATE(), GO()], ...o }));

console.log('\n  PUBLICATION AUTONOME — contrat\n  ' + '─'.repeat(70));

// --- une validation n'est jamais un GO -----------------------------------------------------------------------------------------
t('CREATE/VALIDATE Discovery → candidate examinée : AWAITING_GO, JAMAIS une publication', () => assert.equal(cand().etat, 'AWAITING_GO'));
t('… même une validation POSTÉRIEURE à l’activation n’autorise rien', () => assert.equal(cand({}, { revues: [CREATE(apres)] }).etat, 'AWAITING_GO'));
t('… et une validation ANCIENNE (arriéré) non plus', () => assert.equal(cand({}, { revues: [CREATE(avant)] }).etat, 'AWAITING_GO'));
t('CREATE_PENDING_EVIDENCE (« à corriger ») → BLOCKED : candidate non publiable', () => assert.equal(cand({}, { revues: [R('preuves manquantes', 'à corriger')] }).etat, 'BLOCKED'));
t('ATTACH / RAPPROCHER seul → rien (pas même examinée)', () => assert.equal(cand({}, { revues: [R('[Discovery-auto:ab12cd34] RAPPROCHER — 1 article')] }), null));
t('REVIEW / aucune décision → rien', () => assert.equal(cand({}, { revues: [] }), null));
t('HOLD sur une candidate validée → BLOCKED', () => assert.equal(cand({}, { holds: new Set(['FR-2026-9001']) }).etat, 'BLOCKED'));
t('le réconciliateur ne publie JAMAIS une candidate et n’écrit JAMAIS de GO (aucun appel à publier-affaire, aucune écriture de revue)', () => {
  const r = src('scripts/reconcilier-publication.mjs').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/publier-affaire/.test(r) && !/insert into reviews/i.test(r) && !/update cases/i.test(r) && !/--go\b/.test(r));
});

// --- le GO publication explicite (acte existant de publier-affaire --go) ----------------------------------------------------------
t('GO explicite (revue « [Publication …] GO d’Adrien ») = autorisation', () => assert.ok(goPublication([GO()], DEPUIS)));
t('publiée avec GO explicite, absente de l’artefact → NEEDS_PROJECTION (la suite s’exécute seule)', () => assert.equal(publiee().etat, 'NEEDS_PROJECTION'));
t('publiée SANS GO explicite (statut changé sans autorisation) → NO_GO, jamais projetée', () => assert.equal(publiee({}, { revues: [CREATE()] }).etat, 'NO_GO'));
t('GO « Publication automatique SNY » (auto-généré) ≠ GO d’Adrien → NO_GO', () => assert.equal(publiee({}, { revues: [R("[Publication 2026-10-11] GO d'Adrien : « Publication automatique SNY 2026-10-11 : décision humaine de validation déjà consignée (aucun second GO) »", 'validé', 'Adrien (GO publication)')] }).etat, 'NO_GO'));
t('GO ANTÉRIEUR à l’activation (historique protégé) → NO_GO', () => assert.equal(publiee({}, { revues: [GO(avant)] }).etat, 'NO_GO'));
t('GO d’un tiers → NO_GO', () => assert.equal(publiee({}, { revues: [{ ...GO(), reviewed_by: 'import-script' }] }).etat, 'NO_GO'));
t('GO + HOLD → HOLD (rien)', () => assert.equal(publiee({}, { holds: new Set(['FR-2026-9001']) }).etat, 'HOLD'));
t('GO + revue « retirer » → BLOCKED (rien)', () => assert.equal(publiee({}, { revues: [GO(), R('', 'retirer')] }).etat, 'BLOCKED'));
t('GO mais fiabilité < 8 → BLOCKED', () => assert.equal(publiee({ fiabilite_info_10: 4 }).etat, 'BLOCKED'));
t('une affaire bloquée n’empêche pas les autres (états indépendants)', () => {
  const lot = [publiee({ case_id: 'A' }, { holds: new Set(['A']) }), publiee({ case_id: 'B' }), publiee({ case_id: 'C', fiabilite_info_10: 4 })];
  assert.deepEqual(lot.map((e) => e.etat), ['HOLD', 'NEEDS_PROJECTION', 'BLOCKED']);
});

// --- déjà en ligne / exclues -------------------------------------------------------------------------------------------------------
const artefact = new Map([['FR-2026-0115', { case_id: 'FR-2026-0115', lat: 43.5, lng: -1.4 }], ['FR-2026-0133', { case_id: 'FR-2026-0133', lat: 49.2, lng: -0.4 }]]);
t('déjà dans l’artefact → IN_ARTEFACT (aucune duplication)', () => assert.equal(publiee({ case_id: 'FR-2026-0115' }, { artefact }).etat, 'IN_ARTEFACT'));
t('Tarnos (0115) et Rots (0133) déjà en ligne → aucune action, quelle que soit leur revue', () => {
  for (const id of ['FR-2026-0115', 'FR-2026-0133']) assert.equal(publiee({ case_id: id }, { artefact, revues: [CREATE()] }).etat, 'IN_ARTEFACT');
});
t('FR-2026-0048 et FR-2026-0049 : HOLD réels → exclues, même « publiées » en base (cases_public) et même avec un GO', () => {
  const holds = new Set((lire('data/publication-holds.json').holds || []).map((h) => h.case_id));
  for (const id of ['FR-2026-0048', 'FR-2026-0049']) { assert.ok(holds.has(id)); assert.equal(publiee({ case_id: id }, { holds }).etat, 'HOLD'); }
});

// --- build en échec : jamais « publié » -------------------------------------------------------------------------------------------
const page = (cases) => `<html><script type="application/json" id="cases-data">${JSON.stringify(cases)}</script></html>`;
const attendu = new Map([['FR-2026-9001', { case_id: 'FR-2026-9001', statut_judiciaire: 'enquête', sources: [{ url: 'https://x.fr/a' }] }]]);
t('build en échec (affaire absente du site servi) → écart, donc PAS annoncée « publiée »', () => assert.deepEqual(ecartsSite(page([]), ['FR-2026-9001'], attendu), ['FR-2026-9001 : absente du site']));
t('page illisible / site injoignable → jamais « vérifié »', () => assert.ok(ecartsSite('<html></html>', ['FR-2026-9001'], attendu).length > 0));
t('build réussi → aucun écart', () => assert.deepEqual(ecartsSite(page([{ case_id: 'FR-2026-9001', statut_judiciaire: 'enquête', source_url: 'https://x.fr/a' }]), ['FR-2026-9001'], attendu), []));

// --- concurrence --------------------------------------------------------------------------------------------------------------------
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
    const final = JSON.parse(git(tmp, '--git-dir=origin.git', 'show', 'main:data/cases.json')).cases.map((c) => c.case_id);
    assert.ok(final.includes('FR-2026-0115') && final.includes('FR-2026-0001') && final.includes('FR-2026-0100'), 'aucune fiche existante ou déjà poussée ne doit être perdue');
    if (b === 'pousse') assert.ok(final.includes('FR-2026-0133'));
    else assert.ok(!final.includes('FR-2026-0133'), 'échec franc : rien d’inventé ; l’affaire reste `publiée` en base → NEEDS_PROJECTION au passage suivant');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
t('les deux workflows partagent UN groupe de concurrence (jamais deux publications en même temps)', () => {
  const g = (f) => /concurrency:\s*\n\s*group:\s*(\S+)\s*\n\s*cancel-in-progress:\s*false/.exec(src(`.github/workflows/${f}`));
  assert.ok(g('sny-telegram.yml') && g('sny-clics.yml') && g('sny-telegram.yml')[1] === g('sny-clics.yml')[1]);
});
t('les deux workflows : suite autorisée → QA → push ; seuil d’activation ; alerte informée de l’étape', () => {
  for (const f of ['sny-telegram.yml', 'sny-clics.yml']) {
    const y = src(`.github/workflows/${f}`);
    assert.ok(y.includes('scripts/reconcilier-publication.mjs --ecrire') && y.includes('SNY_PUBLICATION_DEPUIS'));
    assert.ok(y.indexOf('reconcilier-publication.mjs --ecrire') < y.indexOf('scripts/qa/run-all.mjs') && y.indexOf('scripts/qa/run-all.mjs') < y.indexOf('git push origin HEAD:main', y.indexOf('scripts/qa/run-all.mjs')));
  }
  assert.ok(src('.github/workflows/sny-telegram.yml').includes('OUTCOME_reconcile'));
});


// --- aucune validation ne disparaît : chaque affaire validée a une catégorie de diagnostic explicite ------------------------------
const diag = (c = {}, o = {}) => categorieDiagnostic({ ...base, ...c }, ctx(o));
console.log('\n  DIAGNOSTIC — aucune affaire validée ne disparaît silencieusement\n  ' + '─'.repeat(70));
t('validation de création attribuée à un autre qu’Adrien → DECISION_CONFLICT (jamais silencieuse, jamais proposée)', () => {
  const o = { revues: [R('VALIDATED — règle conditionnelle', 'validé', 'Claude — règle conditionnelle d’Adrien')] };
  assert.equal(cand({}, o).etat, 'DECISION_CONFLICT');
  assert.equal(diag({}, o).categorie, 'DECISION_CONFLICT');
});
t('candidate jamais validée → hors entonnoir (NON_VALIDEE), pas un conflit', () => assert.equal(diag({}, { revues: [] }).categorie, 'NON_VALIDEE'));
t('un simple rattachement (RAPPROCHER) n’est ni une validation ni un conflit', () =>
  assert.equal(diag({}, { revues: [R('[Discovery-auto:ab12cd34] RAPPROCHER — 2 article(s)', 'validé', 'Claude (script)')] }).categorie, 'NON_VALIDEE'));
t('VALIDATE éligible sans proposition → MISSING_PROPOSAL, avec l’action attendue', () => {
  const d = diag({}, { proposition: null, localisable: true });
  assert.equal(d.categorie, 'MISSING_PROPOSAL'); assert.ok(/proposer-publication/.test(d.action));
});
t('proposition existante non décidée → AWAITING_GO (aucune duplication : une seule ligne par affaire)', () =>
  assert.equal(diag({}, { proposition: { decision: null }, localisable: true }).categorie, 'AWAITING_GO'));
t('éligible mais sans localisation fiable → BLOCKED explicite (jamais MISSING_PROPOSAL)', () => {
  const d = diag({ lat: null, lng: null }, { proposition: null, localisable: false });
  assert.equal(d.categorie, 'BLOCKED'); assert.ok(/localisation/.test(d.raisons[0]));
});
t('API d’adresse en panne (localisable inconnu) → on ne conclut pas à un blocage', () => assert.equal(diag({}, { proposition: null, localisable: null }).categorie, 'MISSING_PROPOSAL'));
t('GO donné sur la proposition mais candidate encore → GO_STUCK (reprise)', () => assert.equal(diag({}, { proposition: { decision: 'ACCEPT' } }).categorie, 'GO_STUCK'));
t('publiée avec GO, absente de l’artefact → GO_STUCK (reprise de projection)', () => {
  const d = categorieDiagnostic({ ...base, publication_status: 'publiée' }, ctx({ revues: [CREATE(), GO()] }));
  assert.equal(d.categorie, 'GO_STUCK');
});
t('dans l’artefact mais pas sur le site servi → GO_STUCK ; site non contrôlé ou conforme → PUBLIC (NO_ACTION)', () => {
  const art = new Map([['FR-2026-9001', { ...base }]]);
  const c = { ...base, publication_status: 'publiée' };
  assert.equal(categorieDiagnostic(c, ctx({ revues: [CREATE(), GO()], artefact: art, servie: false })).categorie, 'GO_STUCK');
  assert.equal(categorieDiagnostic(c, ctx({ revues: [CREATE(), GO()], artefact: art, servie: true })).categorie, 'PUBLIC');
  assert.equal(categorieDiagnostic(c, ctx({ revues: [CREATE(), GO()], artefact: art, servie: null })).categorie, 'PUBLIC');
});
t('HOLD → HOLD (candidate comme publiée) ; REVIEW (« à corriger ») → REVIEW ; retirer → REJECT', () => {
  assert.equal(diag({}, { holds: new Set(['FR-2026-9001']) }).categorie, 'HOLD');
  assert.equal(diag({}, { revues: [CREATE(), R('REVIEW — à reprendre', 'à corriger')] }).categorie, 'REVIEW');
  assert.equal(diag({}, { revues: [CREATE(), R('Retirée', 'retirer')] }).categorie, 'REJECT');
  assert.equal(categorieDiagnostic({ ...base, publication_status: 'retirée' }, ctx()).categorie, 'REJECT');
});
t('doublon possible → BLOCKED (cause explicite)', () => {
  const d = diag({}, { autres: [{ case_id: 'FR-2026-9002', commune: 'Ville', type_structure: 'centre de loisirs', role_mis_en_cause: 'animateur' }], localisable: true });
  assert.equal(d.categorie, 'BLOCKED'); assert.ok(/doublon/.test(d.raisons.join(' ')));
});
t('rejeu : le diagnostic est une fonction pure (même entrée, même sortie)', () => {
  const o = { proposition: null, localisable: true };
  assert.deepEqual(diag({}, o), diag({}, o));
});
t('la validation ancienne (arriéré) reste visible : MISSING_PROPOSAL, pas oubliée', () =>
  assert.equal(diag({}, { revues: [CREATE(avant)], proposition: null, localisable: true }).categorie, 'MISSING_PROPOSAL'));

console.log(`\n  ${n} contrôles : OK\n`);
