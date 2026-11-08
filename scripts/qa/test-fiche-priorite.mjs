// Priorité des approbations de fiche (lot A, 08/11/2026) : une approbation SUPPLANTÉE ne remplace jamais le contenu autorisé le plus récent.
//   - sélection : on cherche d'abord la dernière approbation valide, puis les propositions qui la portent (jamais « la dernière ACCEPT par decided_at ») ;
//   - GO de lot (revues sans proposition) = dernière autorisation sans pouvoir être candidate : conservation, ou refus motivé si le contenu manque ;
//   - retrait / HOLD / affaire non publique / chronologie ambiguë / empreinte non conforme : refus ;
//   - relecture : une autorisation changée entre le calcul et l'écriture ⇒ abandon ; push refusé après changement d'un chemin sensible ⇒ abandon (script réel, dépôts temporaires).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashDossier } from '../lib/fiche-page.mjs';
import { derniereApprobation, decider, evaluerPromotions, confirmerPlan, inscrire } from '../lib/promouvoir-fiche.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const ID = 'FR-T-7';
const A = { etat_actuel: ['version A (01/11, GO de lot)'], deroule: [], inconnues: [], statut_affiche: 'enquête' };
const B = { ...A, etat_actuel: ['version B (02/11, ancien clic)'] };
const C = { ...A, etat_actuel: ['version C (plus récente)'] };
const h = (d) => hashDossier(d);
const rev = (d, at, o = {}) => ({ reviewed_by: 'Adrien (Telegram, fiche)', decision: 'validé', comment: `[Fiche approuvée 1a2b3c4d] ${ID} hash=${h(d)}`, reviewed_at: at, ...o });
const retrait = (at) => ({ reviewed_by: 'Adrien (Telegram)', decision: 'retirer', comment: 'retrait', reviewed_at: at });
const prop = (d, id8, at, o = {}) => ({ id: ID, id8, decided_at: at, dossier: d, declare: h(d), precedent: null, ...o });
const base = (o = {}) => ({ hubs: [], cases: [{ case_id: ID }], holds: new Set(), statuts: new Map([[ID, 'publiée']]), isoles: { dossiers: {} }, ...o });
const ev = (revues, propositions, o = {}) => evaluerPromotions({ propositions, revuesParAffaire: new Map([[ID, revues]]), ...base(o) });

const T1 = '2026-11-01T10:00:00.000000', T2 = '2026-11-02T10:00:00.000000', T3 = '2026-11-03T10:00:00.000000';

t('derniereApprobation · la dernière par instant d’enregistrement, quel que soit l’ordre reçu', () => {
  const d = derniereApprobation([rev(B, T2), rev(A, T1)], ID); assert.equal(d.hash, h(B)); assert.equal(d.ambigu, false);
  assert.equal(derniereApprobation([], ID), null);
});
t('derniereApprobation · mêmes critères de validité qu’avant (Adrien, « validé », bonne affaire)', () => {
  assert.equal(derniereApprobation([rev(A, T1), rev(B, T2, { reviewed_by: 'import-script' })], ID).hash, h(A));
  assert.equal(derniereApprobation([rev(A, T1), rev(B, T2, { decision: 'à corriger' })], ID).hash, h(A));
  assert.equal(derniereApprobation([rev(A, T1), rev(B, T2, { comment: `[Fiche approuvée 1a2b3c4d] AUTRE-1 hash=${h(B)}` })], ID).hash, h(A));
});
t('derniereApprobation · deux empreintes différentes au même instant : ambigu (on ne choisit pas)', () => {
  const d = derniereApprobation([rev(A, T1), rev(B, T1)], ID); assert.equal(d.ambigu, true); assert.equal(d.hashes.length, 2);
  assert.equal(derniereApprobation([rev(A, T1), rev(A, T1)], ID).ambigu, false, 'même empreinte approuvée deux fois : pas d’ambiguïté');
});

// --- le cas de la régression du 02/11 : l'ancienne proposition (A) a un decided_at plus RÉCENT que la proposition de la dernière approbation (B) ---
t('sélection · ancienne ACCEPT plus récente en decided_at mais approbation supplantée → écartée, consignée, jamais promue ; la bonne est promue', () => {
  const revues = [rev(A, T1), rev(B, T2)];
  const { lignes, plan } = ev(revues, [prop(B, 'bbbbbbbb', T2), prop(A, 'aaaaaaaa', T3)], { isoles: { dossiers: { [ID]: A } } });
  assert.ok(lignes.some((l) => /SUPPLANTEE_PAR_AUTORISATION_PLUS_RECENTE/.test(l) && l.includes('aaaaaaaa')), 'refus de l’ancien candidat consigné');
  assert.equal(plan.length, 1); assert.equal(plan[0].hash, h(B)); assert.equal(plan[0].remplace, h(A));
});
t('sélection · dossier présent conforme à la dernière approbation : conservé, l’ancienne ACCEPT n’écrase rien', () => {
  const { lignes, plan } = ev([rev(A, T1), rev(B, T2)], [prop(A, 'aaaaaaaa', T3)], { isoles: { dossiers: { [ID]: B } } });
  assert.equal(plan.length, 0);
  assert.ok(lignes.some((l) => /SUPPLANTEE/.test(l)) && lignes.some((l) => /conservé/.test(l)), lignes.join('\n'));
});
t('GO de lot (revue sans proposition) · dernière autorisation : contenu présent conforme ⇒ conservation, aucun écrasement par l’ancien clic', () => {
  // clic B (proposition), puis GO de lot qui autorise A : seule la proposition de B existe.
  const { lignes, plan } = ev([rev(B, T1), rev(A, T2)], [prop(B, 'bbbbbbbb', T1)], { isoles: { dossiers: { [ID]: A } } });
  assert.equal(plan.length, 0); assert.ok(lignes.some((l) => /conservé/.test(l)));
});
t('GO de lot · contenu autorisé ABSENT du dossier présent et d’aucune proposition ⇒ refus motivé (restauration depuis le dépôt), jamais l’ancien ACCEPT', () => {
  const { lignes, plan } = ev([rev(B, T1), rev(A, T2)], [prop(B, 'bbbbbbbb', T1)], { isoles: { dossiers: { [ID]: B } } });
  assert.equal(plan.length, 0);
  assert.ok(lignes.some((l) => /SUPPLANTEE/.test(l) && l.includes('bbbbbbbb')) && lignes.some((l) => /CONTENU_AUTORISE_ABSENT/.test(l)), lignes.join('\n'));
});
t('sélection · journalisation du refus AVANT l’exclusion : la sélection devenue vide ne l’efface pas', () => {
  const { lignes } = ev([rev(B, T1), rev(A, T2)], [prop(B, 'bbbbbbbb', T1)], { isoles: { dossiers: {} } });
  assert.ok(lignes[0].includes('SUPPLANTEE') && lignes[0].includes('bbbbbbbb'));
});
t('sélection · plusieurs anciennes propositions : une ligne pour l’ancien choix + un nombre, pas une ligne par proposition', () => {
  const { lignes } = ev([rev(A, T1), rev(B, T2), rev(C, T3)], [prop(A, 'aaaaaaaa', T1), prop(B, 'bbbbbbbb', T2), prop(C, 'cccccccc', T3)], { isoles: { dossiers: { [ID]: B } } });
  assert.equal(lignes.filter((l) => /SUPPLANTEE/.test(l)).length, 0, 'l’ancien choix (la dernière ACCEPT par decided_at) est C, retenu : rien à consigner');
  assert.equal(lignes.filter((l) => /refusée/.test(l)).length, 0);
});
t('sélection · première promotion normale (une approbation, une proposition) : permise', () => {
  const { plan } = ev([rev(A, T1)], [prop(A, 'aaaaaaaa', T1)]);
  assert.equal(plan.length, 1); assert.equal(plan[0].hash, h(A));
});
t('sélection · mise à jour approuvée sur la version dont elle part : permise ; base périmée : refusée (garde existante conservée)', () => {
  const ok = ev([rev(A, T1), rev(B, T2)], [prop(B, 'bbbbbbbb', T2, { precedent: h(A) })], { isoles: { dossiers: { [ID]: A } } });
  assert.equal(ok.plan.length, 1);
  const ko = ev([rev(A, T1), rev(B, T2)], [prop(B, 'bbbbbbbb', T2, { precedent: h(C) })], { isoles: { dossiers: { [ID]: A } } });
  assert.equal(ko.plan.length, 0); assert.ok(ko.lignes.some((l) => /BASE_PERIMEE/.test(l)));
});
t('refus · retrait non levé, HOLD, affaire non publique (statut Neon ou artefact), chronologie ambiguë', () => {
  const props = [prop(B, 'bbbbbbbb', T2)];
  assert.ok(ev([rev(A, T1), rev(B, T2), retrait('2026-11-04T10:00:00.000000')], props).lignes.some((l) => /RETRAIT_NON_LEVE/.test(l)));
  assert.ok(ev([rev(A, T1), rev(B, T2)], props, { holds: new Set([ID]) }).lignes.some((l) => /HOLD/.test(l)));
  assert.ok(ev([rev(A, T1), rev(B, T2)], props, { statuts: new Map([[ID, 'retirée']]) }).lignes.some((l) => /AFFAIRE_NON_PUBLIQUE/.test(l)));
  assert.ok(ev([rev(A, T1), rev(B, T2)], props, { cases: [] }).lignes.some((l) => /AFFAIRE_NON_PUBLIQUE/.test(l)));
  const amb = ev([rev(A, T1), rev(B, T1)], [prop(A, 'aaaaaaaa', T1), prop(B, 'bbbbbbbb', T2)]);
  assert.equal(amb.plan.length, 0); assert.ok(amb.lignes.some((l) => /CHRONOLOGIE_INDETERMINEE/.test(l)));
});
t('refus · une approbation postérieure au retrait relance la décision humaine « retirer » seulement si elle est la dernière décision decisive', () => {
  // retrait puis nouvelle approbation de fiche : l'approbation n'est pas une décision qui lève le retrait (même règle qu'avant) → refus
  assert.equal(decider({ id: ID, generee: { d: B, proposable: true }, revues: [rev(B, T2)], toutesRevues: [retrait(T1), rev(B, T2)], ...base() }).motif, 'RETRAIT_NON_LEVE');
});
t('refus · empreinte déclarée par la proposition ≠ empreinte du contenu porté', () => {
  const r = ev([rev(B, T2)], [prop(B, 'bbbbbbbb', T2, { declare: h(A) })]);
  assert.equal(r.plan.length, 0); assert.ok(r.lignes.some((l) => /EMPREINTE_NON_CONFORME/.test(l)));
});
t('refus · dossier de Hub présent : jamais d’écrasement ; dossier non approuvé présent : jamais d’écrasement', () => {
  assert.ok(ev([rev(B, T2)], [prop(B, 'bbbbbbbb', T2)], { hubs: [{ dossiers: { [ID]: A } }] }).lignes.some((l) => /DOSSIER_DEJA_PRESENT/.test(l)));
  assert.ok(ev([rev(B, T2)], [prop(B, 'bbbbbbbb', T2)], { isoles: { dossiers: { [ID]: C } } }).lignes.some((l) => /DOSSIER_DEJA_PRESENT/.test(l)));
});
t('rejouable : mêmes entrées ⇒ mêmes sorties ; promouvoir puis rejouer ⇒ rien de plus', () => {
  const e = [rev(A, T1), rev(B, T2)], p = [prop(B, 'bbbbbbbb', T2), prop(A, 'aaaaaaaa', T3)];
  const r1 = ev(e, p, { isoles: { dossiers: { [ID]: A } } }), r2 = ev(e, p, { isoles: { dossiers: { [ID]: A } } });
  assert.deepEqual(r1.lignes, r2.lignes);
  const apres = inscrire({ dossiers: { [ID]: A } }, ID, r1.plan[0].dossier, r1.plan[0].hash);
  assert.equal(ev(e, p, { isoles: apres }).plan.length, 0);
});

// --- relecture ---
t('relecture · confirmerPlan : même affaire et même empreinte ⇒ gardé ; autorisation retirée, remplacée ou devenue ambiguë ⇒ abandonné', () => {
  const prevu = [{ id: 'X-1', hash: 'h1' }, { id: 'X-2', hash: 'h2' }, { id: 'X-3', hash: 'h3' }];
  const r = confirmerPlan(prevu, [{ id: 'X-1', hash: 'h1' }, { id: 'X-2', hash: 'AUTRE' }]);
  assert.deepEqual(r.gardes.map((p) => p.id), ['X-1']); assert.deepEqual(r.abandonnes, ['X-2', 'X-3']);
  assert.deepEqual(confirmerPlan([], [{ id: 'X-1', hash: 'h1' }]), { gardes: [], abandonnes: [] });
});
t('relecture · une nouvelle approbation arrivée entre le calcul et l’écriture ⇒ abandon (puis, au passage suivant, la bonne version)', () => {
  const props = [prop(B, 'bbbbbbbb', T2)], isoles = { dossiers: { [ID]: A } };
  const avant = ev([rev(A, T1), rev(B, T2)], props, { isoles }).plan;
  const relu = ev([rev(A, T1), rev(B, T2), rev(C, T3)], [...props, prop(C, 'cccccccc', T3)], { isoles }).plan;
  const r = confirmerPlan(avant, relu); assert.deepEqual(r.abandonnes, [ID]); assert.equal(r.gardes.length, 0);
});
t('relecture · retrait ou HOLD apparu entre le calcul et l’écriture ⇒ abandon', () => {
  const props = [prop(B, 'bbbbbbbb', T2)], revues = [rev(A, T1), rev(B, T2)], isoles = { dossiers: { [ID]: A } };
  const avant = ev(revues, props, { isoles }).plan;
  assert.deepEqual(confirmerPlan(avant, ev([...revues, retrait(T3)], props, { isoles }).plan).abandonnes, [ID]);
  assert.deepEqual(confirmerPlan(avant, ev(revues, props, { isoles, holds: new Set([ID]) }).plan).abandonnes, [ID]);
  assert.deepEqual(confirmerPlan(avant, ev(revues, props, { isoles, statuts: new Map([[ID, 'retirée']]) }).plan).abandonnes, [ID]);
});

// --- publier-projection.sh : le VRAI script, sur des dépôts temporaires (origine locale) ---
const SH = new URL('../publier-projection.sh', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sh = (cwd, cmd, env = {}) => execFileSync('sh', ['-c', cmd], { cwd, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function monter() {
  const dir = mkdtempSync(join(tmpdir(), 'sny-pub-'));
  const origine = join(dir, 'origine.git'), a = join(dir, 'a'), b = join(dir, 'b');
  git(dir, 'init', '--bare', '-b', 'main', origine);
  git(dir, 'clone', origine, a);
  for (const w of [a]) { git(w, 'config', 'user.name', 't'); git(w, 'config', 'user.email', 't@t'); git(w, 'config', 'commit.gpgsign', 'false'); }
  mkdirSync(join(a, 'data/hub-matiere'), { recursive: true }); mkdirSync(join(a, 'docs'));
  for (const f of ['data/cases.json', 'data/evenements.json', 'data/hub-matiere/isoles.json', 'docs/a.md']) writeFileSync(join(a, f), 'v0\n');
  git(a, 'add', '.'); git(a, 'commit', '-m', 'base'); git(a, 'push', 'origin', 'HEAD:main');
  git(dir, 'clone', origine, b);
  git(b, 'config', 'user.name', 'u'); git(b, 'config', 'user.email', 'u@u'); git(b, 'config', 'commit.gpgsign', 'false');
  return { dir, origine, a, b };
}
const env = (dir, extra = {}) => ({ SNY_REMOTE: 'origin', SNY_BRANCH: 'main', GITHUB_OUTPUT: join(dir, 'out.txt'), RECON_IDS: '', FICHES: ID, GIT_TERMINAL_PROMPT: '0', ...extra });
const sortieDe = (dir) => (existsSync(join(dir, 'out.txt')) ? readFileSync(join(dir, 'out.txt'), 'utf8') : '');

t('publier-projection · push accepté : abandon=false, commit présent sur l’origine', () => {
  const { dir, origine, a } = monter();
  try {
    writeFileSync(join(a, 'data/hub-matiere/isoles.json'), 'v1\n');
    sh(a, `sh "${SH}"`, env(dir));
    assert.match(sortieDe(dir), /abandon=false/);
    assert.equal(git(origine, 'show', 'main:data/hub-matiere/isoles.json'), 'v1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
t('publier-projection · push refusé, main n’a touché que docs/ : rebase puis push (rien de sensible n’a bougé)', () => {
  const { dir, origine, a, b } = monter();
  try {
    writeFileSync(join(b, 'docs/a.md'), 'autre\n'); git(b, 'commit', '-am', 'docs'); git(b, 'push', 'origin', 'HEAD:main');
    writeFileSync(join(a, 'data/hub-matiere/isoles.json'), 'v1\n');
    sh(a, `sh "${SH}"`, env(dir));
    assert.match(sortieDe(dir), /abandon=false/);
    assert.equal(git(origine, 'show', 'main:data/hub-matiere/isoles.json'), 'v1');
    assert.equal(git(origine, 'show', 'main:docs/a.md'), 'autre');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
t('publier-projection · push refusé, main a modifié isoles.json (autre promotion) : ABANDON — résultat ancien non rejoué, arbre remis sur main, aucun force-push', () => {
  const { dir, origine, a, b } = monter();
  try {
    writeFileSync(join(b, 'data/hub-matiere/isoles.json'), 'restauration-plus-recente\n'); git(b, 'commit', '-am', 'restauration'); git(b, 'push', 'origin', 'HEAD:main');
    const tete = git(origine, 'rev-parse', 'main');
    writeFileSync(join(a, 'data/hub-matiere/isoles.json'), 'resultat-ancienne-logique\n');
    sh(a, `sh "${SH}"`, env(dir));
    assert.match(sortieDe(dir), /abandon=true/);
    assert.equal(git(origine, 'rev-parse', 'main'), tete, 'main inchangé par le passage abandonné');
    assert.equal(git(origine, 'show', 'main:data/hub-matiere/isoles.json'), 'restauration-plus-recente');
    assert.equal(readFileSync(join(a, 'data/hub-matiere/isoles.json'), 'utf8').trim(), 'restauration-plus-recente', 'arbre local remis sur main');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
t('publier-projection · push refusé, main a modifié le code de promotion (scripts/) : ABANDON', () => {
  const { dir, origine, a, b } = monter();
  try {
    mkdirSync(join(b, 'scripts'), { recursive: true }); writeFileSync(join(b, 'scripts/promouvoir-fiche.mjs'), 'nouveau code\n'); git(b, 'add', '.'); git(b, 'commit', '-m', 'garde'); git(b, 'push', 'origin', 'HEAD:main');
    writeFileSync(join(a, 'data/evenements.json'), 'v1\n');
    sh(a, `sh "${SH}"`, env(dir));
    assert.match(sortieDe(dir), /abandon=true/);
    assert.equal(git(origine, 'show', 'main:data/evenements.json'), 'v0');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
t('publier-projection · rien à publier et main a avancé : pas d’abandon, aucun push', () => {
  const { dir, origine, a, b } = monter();
  try {
    writeFileSync(join(b, 'data/cases.json'), 'v2\n'); git(b, 'commit', '-am', 'autre'); git(b, 'push', 'origin', 'HEAD:main');
    const tete = git(origine, 'rev-parse', 'main');
    sh(a, `sh "${SH}"`, env(dir));
    assert.match(sortieDe(dir), /abandon=false/); assert.equal(git(origine, 'rev-parse', 'main'), tete);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- circuit : les deux workflows appellent le même script, relisent avant de publier, et ne vérifient pas ce qui a été abandonné ---
t('workflows · relecture finale avant publication, script partagé, aucune vérification d’un passage abandonné', () => {
  for (const f of ['sny-telegram', 'sny-clics']) {
    const y = readFileSync(new URL(`../../.github/workflows/${f}.yml`, import.meta.url), 'utf8');
    const iPromo = y.indexOf('promouvoir-fiche.mjs --depuis-propositions --ecrire'), iFin = y.indexOf('promouvoir-fiche.mjs --controle-final'), iPub = y.indexOf('sh scripts/publier-projection.sh'), iQa = y.indexOf('scripts/qa/run-all.mjs');
    assert.ok(iPromo > 0 && iQa > iPromo && iFin > iQa && iPub > iFin, `${f} : promotion → QA → relecture finale → publication`);
    // (les étapes « aperçu de Hub » plus bas ne déposent que docs/ : leur rebase reste sans effet sur une décision de fiche)
    const segment = y.slice(iFin, y.indexOf('verifier-site.mjs'));
    assert.ok(!/git pull --rebase/.test(segment) && !/git push/.test(segment), `${f} : plus de push ni de rebase aveugle dans l’étape de publication`);
    assert.ok(/steps\.publier\.outputs\.abandon != 'true'/.test(y) && /ABANDONNEES: \$\{\{ steps\.finale\.outputs\.abandonnes \}\}/.test(y), `${f} : vérification conditionnée`);
  }
});
console.log(`\n${n} contrôles priorité des approbations : OK`);
