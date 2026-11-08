// Mise à jour d'une fiche DÉJÀ publiée par un événement judiciaire sans changement de statut : sélection, changements, message, promotion, parcours raccordé.
// Aucun réseau, aucun Neon, aucun modèle ; données synthétiques.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changementsFiche, payloadFiche, hashDossier } from '../lib/fiche-page.mjs';
import { selectionnerMisesAJour } from '../lib/fiche-miseajour.mjs';
import { messageFiche } from '../lib/discovery-messages.mjs';
import { decider } from '../lib/promouvoir-fiche.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

const U1 = 'https://media-a.example/1', U2 = 'https://media-b.example/2', U3 = 'https://media-c.example/3';
const etape = (type, date, texte, url, media = 'Média') => ({ date, date_nature: date ? 'evenement' : 'article', type, acteur: null, texte, source: { media, url, publie_le: '2026-01-10', acces: 'libre' } });
const V1 = { deroule: [etape('mise_en_examen', '2026-01-08', 'Selon le parquet, un animateur a été mis en examen.', U1), etape('plainte', null, 'Selon Média, des familles ont porté plainte.', U1)], inconnues: ['Suite inconnue.'] };
const AJOUT = etape('audience', null, 'Selon Média B (article du 12 janvier), l’animateur a comparu devant la chambre de l’instruction.', U2, 'Média B');
const V2 = { ...V1, deroule: [...V1.deroule, AJOUT] };
const C = { case_id: 'FR-X-0001', commune: 'Ville-Test', etablissement: 'École Test', statut_judiciaire: 'mise en examen' };

t('événement nouveau → étape ajoutée + source nouvelle, substantiel ; l’historique n’est pas présenté comme nouveau', () => {
  const ch = changementsFiche(V1, V2);
  assert.equal(ch.ajoutees.length, 1); assert.equal(ch.retirees.length, 0); assert.equal(ch.sources_nouvelles.length, 1); assert.equal(ch.substantiel, true);
});
t('version inchangée ou simple reformulation (même source, même type, même date) → aucun changement substantiel (pas de reproposition)', () => {
  assert.equal(changementsFiche(V1, JSON.parse(JSON.stringify(V1))).substantiel, false);
  const reform = { ...V1, deroule: V1.deroule.map((e, i) => (i ? { ...e, texte: 'Des familles auraient porté plainte, selon Média.' } : e)) };
  const ch = changementsFiche(V1, reform); assert.equal(ch.substantiel, false); assert.equal(ch.reformulees, 1);
});
t('une étape ou une source PERDUE par la candidate est listée (jamais perdue en silence)', () => {
  const moins = { ...V1, deroule: [V1.deroule[0]] };
  const ch = changementsFiche(V1, moins); assert.equal(ch.retirees.length, 1); assert.equal(ch.substantiel, true);
  const sansSource = { ...V2, deroule: [V2.deroule[0], V2.deroule[2]] };
  assert.equal(changementsFiche(V2, sansSource).retirees.length, 1);
});

const ligne = (o = {}) => ({ k: 'k1', case_id: 'FR-X-0001', url: U3, media: 'Média C', pd: '2026-01-12', rat: 'OK', decision: null, facts: [{ event_type: 'audience', evidence: ['…'] }], ...o });
const ctx = (o = {}) => ({ publie: new Map([['FR-X-0001', { d: V1 }]]), approuvee: () => true, holds: new Set(), deja: new Set(), ...o });
const motif = (l, o) => selectionnerMisesAJour({ lignes: [l], ...ctx(o) }).ecartees[0]?.motif ?? null;
t('événement judiciaire nouveau, rattaché, sans changement de statut → candidate retenue (avec la source à intégrer)', () => {
  const s = selectionnerMisesAJour({ lignes: [ligne()], ...ctx() });
  assert.equal(s.groupes.length, 1); assert.deepEqual(s.groupes[0].sources, [{ url: U3, media: 'Média C', publication_date: '2026-01-12' }]);
});
t('source déjà dans la fiche / déjà traitée / rejetée → aucune proposition supplémentaire', () => {
  assert.equal(motif(ligne({ url: U1 })), 'SOURCE_DEJA_DANS_LA_FICHE');
  assert.equal(motif(ligne(), { deja: new Set(['k1']) }), 'DEJA_TRAITEE');
  assert.equal(motif(ligne({ decision: 'REJECT' })), 'REFUSEE_PAR_L_EDITEUR');
});
t('rattachement insuffisant, HOLD, fiche absente ou version publique non approuvée → blocage respecté', () => {
  assert.equal(motif(ligne({ rat: 'DOUTEUX' })), 'RATTACHEMENT_INSUFFISANT');
  assert.equal(motif(ligne(), { holds: new Set(['FR-X-0001']) }), 'HOLD');
  assert.equal(motif(ligne(), { publie: new Map() }), 'PAS_DE_FICHE_PUBLIQUE');
  assert.equal(motif(ligne(), { approuvee: () => false }), 'VERSION_PUBLIQUE_NON_APPROUVEE');
});
t('ni mesure d’institution, ni suspension, ni réaction publique, ni source payante ne déclenchent une mise à jour judiciaire', () => {
  for (const f of [{ event_type: 'réponse_institutionnelle', evidence: ['x'] }, { event_type: 'suspension', evidence: ['x'] }, { event_type: 'réaction_publique', evidence: ['x'] }, { event_type: 'audience', mesure: 'plan_formation', evidence: ['x'] }, { event_type: 'audience', evidence: [] }]) assert.equal(motif(ligne({ facts: [f] })), 'AUCUN_EVENEMENT_JUDICIAIRE');
  assert.equal(motif(ligne({ media: 'Mediapart' })), 'SOURCE_PAYANTE');
});
t('rejeu : deux analyses de la même affaire se regroupent en UNE candidate ; une affaire non retenue n’en produit aucune', () => {
  const s = selectionnerMisesAJour({ lignes: [ligne(), ligne({ k: 'k2', url: 'https://media-d.example/4' }), ligne({ k: 'k3', case_id: 'FR-X-0002' })], ...ctx() });
  assert.equal(s.groupes.length, 1); assert.deepEqual(s.groupes[0].ks, ['k1', 'k2']);
});

const dossier = (d) => ({ hub: null, d, verifie_le: '2026-10-27', generation: { qualification: 'READY', sources: [], ecartes: [], attention: [] } });
t('message : première publication = création (+ page, bouton Fiche) ; version suivante = MISE À JOUR avec ses changements réels', () => {
  const creation = messageFiche(payloadFiche({ c: C, dossier: dossier(V1), sourcesNeon: [U1], nbEvenements: 0, previewBase: null }));
  assert.match(creation, /FICHE INDIVIDUELLE À APPROUVER/); assert.match(creation, /\+ page \/affaires\/fr-x-0001/); assert.match(creation, /Fiche →/);
  const maj = messageFiche(payloadFiche({ c: C, dossier: dossier(V2), precedent: dossier(V1), sourcesNeon: [U1], nbEvenements: 0, previewBase: null, generation: { qualification: 'READY', sources: [], ecartes: [], attention: [] } }));
  assert.match(maj, /MISE À JOUR DE FICHE À APPROUVER/); assert.doesNotMatch(maj, /\+ page|Fiche →|FICHE INDIVIDUELLE/);
  assert.match(maj, /reste EN LIGNE/); assert.match(maj, /chambre de l’instruction/); assert.match(maj, /Nouvelle source : Média B/);
  assert.ok(maj.includes(hashDossier(V1)) && maj.includes(hashDossier(V2)), 'les deux empreintes sont dites');
  assert.doesNotMatch(maj, /Selon le parquet, un animateur a été mis en examen/, 'une étape inchangée n’est pas présentée comme nouvelle');
});
t('la proposition porte le dossier candidat : l’empreinte du payload est celle du dossier (aperçu = empreinte soumise)', () => {
  const p = payloadFiche({ c: C, dossier: dossier(V2), precedent: dossier(V1), sourcesNeon: [], nbEvenements: 0, previewBase: null, generation: { qualification: 'READY', sources: [], ecartes: [], attention: [] } });
  assert.equal(p.page.hash, hashDossier(p.page.dossier)); assert.equal(p.page.mise_a_jour.precedent_hash, hashDossier(V1));
});

const rev = (d) => [{ reviewed_by: 'Adrien (Telegram, fiche)', decision: 'validé', comment: `[Fiche approuvée aaaaaaaa] FR-X-0001 hash=${hashDossier(d)}` }];
const iso = (d) => ({ dossiers: d ? { 'FR-X-0001': d } : {} });
const base = { id: 'FR-X-0001', hubs: [], cases: [{ case_id: 'FR-X-0001' }], holds: new Set() };
t('promotion après le clic : la V2 approuvée remplace la V1 publique, à l’identique ; la V1 reste servie tant que la V2 n’est pas promue', () => {
  const r = decider({ ...base, generee: { proposable: true, d: V2 }, revues: [...rev(V1), ...rev(V2)], isoles: iso(V1) });
  assert.equal(r.ok, true); assert.equal(r.hash, hashDossier(V2)); assert.equal(r.remplace, hashDossier(V1));
});
t('promotion : sans clic positif sur CETTE empreinte, dossier altéré, HOLD ou rejeu → refus (version publique intacte, aucun doublon)', () => {
  assert.equal(decider({ ...base, generee: { proposable: true, d: V2 }, revues: rev(V1), isoles: iso(V1) }).motif, 'EMPREINTE_APPROUVEE_DIFFERENTE');
  assert.equal(decider({ ...base, generee: { proposable: true, d: V2 }, revues: [], isoles: iso(V1) }).motif, 'AUCUNE_APPROBATION');
  assert.equal(decider({ ...base, generee: { proposable: true, d: V2 }, revues: rev(V2), isoles: iso(V2) }).motif, 'DEJA_PROMUE');
  assert.equal(decider({ ...base, holds: new Set(['FR-X-0001']), generee: { proposable: true, d: V2 }, revues: rev(V2), isoles: iso(V1) }).motif, 'HOLD');
});
t('parcours raccordé : sélection → candidate → proposition → promotion → projection → vérification du CONTENU servi (workflows et scripts)', () => {
  const clics = src('.github/workflows/sny-clics.yml'), tel = src('.github/workflows/sny-telegram.yml');
  const maj = src('.github/workflows/sny-maj-fiches.yml');
  assert.ok(maj.includes('proposer-mises-a-jour-fiches.mjs --ecrire') && maj.indexOf('proposer-mises-a-jour-fiches') < maj.indexOf('git add docs/industrialisation/fiches-generees') && maj.indexOf('git add docs/industrialisation/fiches-generees') < maj.indexOf('notifier-nouvelles'), 'proposition créée, aperçu déposé, PUIS envoi');
  assert.ok(/group:\s*sny-maj-fiches/.test(maj) && !/group:\s*sny-telegram/.test(maj) && !/getUpdates|recevoir/.test(maj), 'groupe de concurrence propre : la génération ne fait pas attendre les clics');
  assert.ok(!clics.includes('proposer-mises-a-jour-fiches'), 'aucune génération longue dans le workflow des clics');
  for (const w of [clics, tel]) {
    assert.ok(w.includes('promouvoir-fiche.mjs --depuis-propositions --ecrire') && w.indexOf('promouvoir-fiche.mjs') < w.indexOf('project-evenements.mjs'), 'promotion avant projection');
    assert.ok(w.includes('data/hub-matiere/isoles.json'), 'le dossier promu est commité');
  }
  assert.ok(!/contents:\s*write/.test(src('.github/workflows/sny-cycle.yml')), 'sny-cycle ne reçoit aucun droit d’écriture');
  const v = src('scripts/verifier-site.mjs');
  assert.ok(v.includes('ecartsFichePure') && src('scripts/lib/ecarts-site.mjs').includes('absente(s) de la page servie'), 'la confirmation exige le contenu approuvé, pas seulement les attributs data-*');
  assert.ok(src('scripts/proposer-fiche.mjs').includes('changementsFiche') && src('scripts/promouvoir-fiche.mjs').includes('--depuis-propositions'));
});

// ── Vérification du site servi (lot C) ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Données DÉJÀ approuvées du dépôt (aucune fausse affaire, aucun faux clic) ; le site « servi » est un petit serveur local qui rend ce que le dépôt annonce.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { analyserArguments, ecartsFiche } from '../lib/ecarts-site.mjs';
import { fichesConcernees } from '../lib/pages-concernees.mjs';
import { verifierFichesCourantes } from '../lib/verifier-fiches.mjs';
import { dossierFiche } from '../lib/fiche-page.mjs';

const lireData = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}`, import.meta.url), 'utf8'));
const CASES = lireData('cases.json').cases, EVT = lireData('evenements.json');
const [IDA, IDB] = ['FR-2026-0115', 'FR-2026-0116'];                           // deux fiches approuvées réelles
assert.ok(EVT.fiches_approuvees[IDA] && EVT.fiches_approuvees[IDB], 'deux fiches approuvées de référence présentes dans le dépôt');
const ta = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };

t('arguments : le PREMIER identifiant positionnel est traité (défaut du 06/11 : indice 0 exclu sans option)', () => {
  assert.deepEqual(analyserArguments(['FR-2026-0143']).ids, ['FR-2026-0143']);
  assert.deepEqual(analyserArguments(['FR-2026-0143', 'POC-09']).ids, ['FR-2026-0143', 'POC-09']);
  assert.deepEqual(analyserArguments([]).ids, []);
  const m = analyserArguments(['--fiches', 'POC-09,FR-2026-0042', '--hubs', 'landes,paris-11e']);
  assert.deepEqual([m.ids, m.fiches, m.hubs], [[], ['POC-09', 'FR-2026-0042'], ['landes', 'paris-11e']], 'les valeurs des options ne sont pas des identifiants');
  const x = analyserArguments(['FR-2026-0001', '--fiches', 'POC-09', 'FR-2026-0002', '--sans-telegram']);
  assert.deepEqual([x.ids, x.fiches, x.telegram], [['FR-2026-0001', 'FR-2026-0002'], ['POC-09'], false], 'identifiants avant et après une option : tous traités');
  assert.deepEqual(analyserArguments(['--hubs', 'landes', 'FR-2026-0003']).ids, ['FR-2026-0003']);
});

const page = (id, { dossier = dossierFiche(id).d, evt = EVT, sansEmpreinte = false } = {}) => {
  const n = (evt.affaires?.[id] || []).length, mat = (evt.matiere || []).filter((x) => x.destinations?.fiche === id);
  return `<article data-fiche="${id}" data-evenements="${n}" data-matiere="${mat.length}"${sansEmpreinte ? '' : ` data-dossier="${hashDossier(dossier)}"`}>`
    + (dossier.deroule || []).map((e) => `<p>${e.texte}</p>`).join('') + mat.map((x) => `<p>${x.libelle}</p>`).join('') + '</article>';
};
const ancienDossier = (id) => { const d = JSON.parse(JSON.stringify(dossierFiche(id).d)); d.deroule[0].texte = `Version précédente — ${d.deroule[0].texte}`; return d; };

t('fiche servie : la version autorisée est confirmée ; une version précédente encore servie, ou sans empreinte, ne l’est jamais', () => {
  const dossier = dossierFiche(IDA).d;
  assert.deepEqual(ecartsFiche(page(IDA), IDA, { evenements: EVT, dossier }), [], 'version autorisée servie ⇒ conforme');
  const ancien = ecartsFiche(page(IDA, { dossier: ancienDossier(IDA) }), IDA, { evenements: EVT, dossier });
  assert.ok(ancien.some((e) => /dossier servi .* dossier autorisé/.test(e)), 'empreinte différente ⇒ non vérifiée');
  assert.ok(ecartsFiche(page(IDA, { sansEmpreinte: true }), IDA, { evenements: EVT, dossier }).some((e) => /sans empreinte de dossier/.test(e)), 'page antérieure à l’empreinte ⇒ non vérifiée');
  assert.ok(ecartsFiche(page(IDA), IDB, { evenements: EVT, dossier: dossierFiche(IDB).d }).length > 0, 'la page d’une autre affaire n’est pas confirmée');
  // Champ du dossier absent du déroulé (hors des 50 premiers caractères d’étape) : couvert par l’empreinte, pas seulement par le texte des étapes.
  const d2 = JSON.parse(JSON.stringify(dossier)); d2.inconnues = [...(d2.inconnues || []), 'Une inconnue modifiée.'];
  assert.ok(ecartsFiche(page(IDA), IDA, { evenements: EVT, dossier: d2 }).some((e) => /dossier servi/.test(e)), 'un champ public modifié hors déroulé est détecté par l’empreinte');
});

t('projection : une empreinte de fiche approuvée DIFFÉRENTE transmet la fiche au contrôle du servi, même déjà publiée et sans événement modifié', () => {
  const fiches = { A: { hash: 'bbbbbbbbbbbbbbbb' }, B: { hash: 'cccccccccccccccc' } };
  const ancien = { fiches_approuvees: { A: { hash: 'aaaaaaaaaaaaaaaa' }, B: { hash: 'cccccccccccccccc' } }, affaires: {} };
  assert.deepEqual(fichesConcernees({ ancien, fiches, parAffaire: {}, touchees: [] }), ['A'], 'A : empreinte changée ⇒ concernée ; B inchangée ⇒ non');
  assert.deepEqual(fichesConcernees({ ancien: { fiches_approuvees: {}, affaires: {} }, fiches, parAffaire: {}, touchees: [] }), ['A', 'B'], 'nouvellement approuvées');
  assert.deepEqual(fichesConcernees({ ancien: { fiches_approuvees: { ...fiches }, affaires: {} }, fiches, parAffaire: {}, touchees: [] }), [], 'rien de changé ⇒ aucune');
});

await ta('scénario complet : mise à jour projetée → ancien contenu servi (200) → passage SANS changement qui reprend → seule la nouvelle version est vérifiée', async () => {
  const dossierNouveau = dossierFiche(IDA).d, dossierAncien = ancienDossier(IDA);
  let servi = page(IDA, { dossier: dossierAncien });                                   // le build n'a pas encore déployé la nouvelle version
  const lirePage = async () => ({ ok: true, status: 200, html: servi });
  const ctx = { ids: [IDA], evenements: EVT, dossierDe: () => dossierNouveau, lirePage };
  // 1. la projection transmet la fiche ; 2. le site répond 200 avec l'ancien contenu : non vérifiée
  assert.deepEqual(fichesConcernees({ ancien: { fiches_approuvees: { [IDA]: { hash: hashDossier(dossierAncien) } } }, fiches: { [IDA]: { hash: hashDossier(dossierNouveau) } }, parAffaire: {}, touchees: [] }), [IDA]);
  const r1 = await verifierFichesCourantes(ctx);
  assert.deepEqual([r1.conformes, r1.enAttente.map((x) => x.id)], [[], [IDA]], 'ancien contenu servi ⇒ non vérifiée');
  // 3. un passage ultérieur n'a plus rien à projeter (liste vide) mais reprend la vérification : toujours non vérifiée tant que l'ancien est servi
  const r2 = await verifierFichesCourantes(ctx);
  assert.deepEqual(r2.enAttente.map((x) => x.id), [IDA]);
  // 4. le contenu attendu est désormais servi : seule cette version devient vérifiée
  servi = page(IDA, { dossier: dossierNouveau });
  const r3 = await verifierFichesCourantes(ctx);
  assert.deepEqual([r3.conformes, r3.enAttente], [[IDA], []]);
  // L'attendu supplanté : la version intermédiaire servie n'est jamais déclarée publiée ; c'est le NOUVEL attendu qui est contrôlé.
  const r4 = await verifierFichesCourantes({ ...ctx, dossierDe: () => dossierAncien });
  assert.deepEqual(r4.enAttente.map((x) => x.id), [IDA], 'une autre version attendue ⇒ la page servie (nouvelle) ne confirme pas l’ancienne attente');
  // Site injoignable / HTTP 404 : jamais « vérifié ».
  assert.equal((await verifierFichesCourantes({ ...ctx, lirePage: async () => { throw new Error('réseau'); } })).conformes.length, 0);
  assert.equal((await verifierFichesCourantes({ ...ctx, lirePage: async () => ({ ok: false, status: 404 }) })).conformes.length, 0);
  // Reprise sans écriture : relancée sur une version déjà conforme, la vérification est sans état (aucune écriture, résultat identique).
  assert.deepEqual(await verifierFichesCourantes(ctx), r3);
});

// CLI réelle (chemin de traitement des arguments inclus) contre un « site » local fait des données approuvées du dépôt.
const siteLocal = async (rendu) => {
  const requetes = [];
  const serveur = http.createServer((req, res) => {
    requetes.push(req.url.split('?')[0]);
    const u = req.url.split('?')[0];
    const m = /^\/affaires\/([^/]+)\/$/.exec(u);
    if (u === '/') { res.setHeader('content-type', 'text/html'); res.end(rendu.accueil()); }
    else if (m) { res.setHeader('content-type', 'text/html'); res.end(rendu.fiche(m[1].toUpperCase())); }
    else if (/^\/territoires\/([a-z0-9-]+)\/$/.test(u)) { res.setHeader('content-type', 'text/html'); res.end(rendu.hub(/^\/territoires\/([a-z0-9-]+)\//.exec(u)[1])); }
    else { res.statusCode = 404; res.end(''); }
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${serveur.address().port}`, requetes, fermer: () => new Promise((ok) => serveur.close(ok)) };
};
const accueil = (modif = {}) => () => `<script type="application/json" id="cases-data">${JSON.stringify(CASES.map((c) => ({ case_id: c.case_id, statut_judiciaire: modif[c.case_id] ?? c.statut_judiciaire, source_url: c.sources?.[0]?.url ?? '', etat: c.etat ?? null })))}</script>`;
const hubPage = (h) => { const it = (EVT.matiere || []).filter((x) => (x.destinations?.hubs || []).some((g) => g.hub === h)); return `<main data-matiere="${it.length}">${it.map((x) => `<p>${x.libelle}</p>`).join('')}</main>`; };
const lancer = (args, url) => new Promise((ok) => {
  const p = spawn(process.execPath, ['scripts/verifier-site.mjs', ...args, '--sans-telegram'], { cwd: new URL('../../', import.meta.url), env: { ...process.env, SNY_SITE_URL: url, SNY_VERIF_ESSAIS: '1' } });
  let out = '', err = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); p.on('close', (code) => ok({ code, out, err }));
});

await ta('CLI : aucun identifiant ⇒ sortie 2 « rien à vérifier », rien n’est demandé au site, aucune preuve de publication', async () => {
  const s = await siteLocal({ accueil: accueil(), fiche: (id) => page(id), hub: hubPage });
  const r = await lancer([], s.url); await s.fermer();
  assert.equal(r.code, 2); assert.ok(r.err.includes('rien à vérifier')); assert.ok(!/site conforme|vérification de/.test(r.out)); assert.equal(s.requetes.length, 0);
});
await ta('CLI : un seul identifiant est EFFECTIVEMENT vérifié (la cause du run du 06/11) ; plusieurs : tous, le premier compris', async () => {
  const s = await siteLocal({ accueil: accueil(), fiche: (id) => page(id), hub: hubPage });
  const un = await lancer([IDB], s.url);
  assert.equal(un.code, 0, un.err); assert.ok(un.out.includes(`vérification de : ${IDB}`) && un.out.includes('site conforme')); assert.ok(s.requetes.includes('/'));
  const deux = await lancer([IDA, IDB], s.url);
  assert.equal(deux.code, 0, deux.err); assert.ok(deux.out.includes(`vérification de : ${IDA}, ${IDB}`));
  await s.fermer();
  // Le PREMIER identifiant est réellement comparé : un écart sur lui seul fait échouer la vérification (jamais un faux « conforme »).
  const t2 = await siteLocal({ accueil: accueil({ [IDA]: 'plainte (écart de test)' }), fiche: (id) => page(id), hub: hubPage });
  const ecart = await lancer([IDA, IDB], t2.url); await t2.fermer();
  assert.equal(ecart.code, 1); assert.ok(ecart.err.includes(IDA) && !ecart.err.includes(`${IDB} :`), 'l’écart porte sur le premier identifiant, pas sur le second');
});
await ta('CLI : options --fiches / --hubs combinées avec des identifiants ; une fiche servie à l’ancienne version échoue', async () => {
  const s = await siteLocal({ accueil: accueil(), fiche: (id) => page(id), hub: hubPage });
  const r = await lancer([IDA, '--fiches', IDB, '--hubs', 'landes'], s.url);
  assert.equal(r.code, 0, r.err); assert.ok(r.out.includes(`vérification de : ${IDA}, fiche ${IDB}, Hub landes`));
  assert.ok(s.requetes.includes('/') && s.requetes.includes(`/affaires/${IDB.toLowerCase()}/`) && s.requetes.includes('/territoires/landes/'), 'les trois familles sont réellement demandées');
  await s.fermer();
  const t3 = await siteLocal({ accueil: accueil(), fiche: (id) => page(id, { dossier: ancienDossier(id) }), hub: hubPage });
  const ancien = await lancer(['--fiches', `${IDA},${IDB}`], t3.url); await t3.fermer();
  assert.equal(ancien.code, 1); assert.ok(/dossier servi/.test(ancien.err), 'l’ancienne version servie n’est pas confirmée');
});
t('raccord : le passage planifié revérifie les fiches approuvées courantes (liste de modifications vide incluse) et la projection utilise la condition d’empreinte', () => {
  const r = src('scripts/reconcilier-publication.mjs');
  assert.ok(r.includes('verifierFichesCourantes') && r.includes('FICHE_PENDING_DEPLOYMENT') && r.includes('fiches_approuvees'), 'le contrôle du servi porte aussi sur les fiches approuvées');
  assert.ok(src('scripts/project-evenements.mjs').includes('fichesConcernees({'), 'la projection transmet les fiches dont l’empreinte change');
  for (const w of ['sny-clics', 'sny-telegram']) assert.ok(/reconcilier-publication\.mjs --site/.test(src(`.github/workflows/${w}.yml`)), `${w} : contrôle du site servi à chaque passage`);
  assert.ok(src('web/src/components/FicheUnique.astro').includes('data-dossier={empreinte}'), 'la page expose l’empreinte du dossier servi');
});

console.log(`\n${n} contrôles : OK`);
