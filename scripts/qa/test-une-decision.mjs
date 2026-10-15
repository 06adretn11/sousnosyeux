#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-une-decision.mjs — « une décision humaine, une suite opérationnelle ».
//   1. Doctrine judiciaire : le stade est établi par les CITATIONS (jamais par le nombre d'articles) ; suspension et plainte ≠ enquête.
//   2. Un clic unique « VALIDER ET PUBLIER » : proposé seulement si les garde-fous le laisseraient passer ; chaîne simulée sans écriture.
//   3. Aucun GO redemandé ; un GO conservé quand une garde bloque.
// Aucun réseau, aucune base. Les dossiers sont SYNTHÉTIQUES (dépôt public).
// =====================================================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stadeCite, stadeEtabli, stadePubliable } from '../lib/stade-judiciaire.mjs';
import { evaluerPublication, etatPublication, categorieDiagnostic, goPublication } from '../lib/publication-gates.mjs';
import { dossierPublication, verifier } from '../lib/qualifier-signal.mjs';
import { messageDecision, boutons } from '../lib/discovery-messages.mjs';
import { ecartsSite } from '../lib/ecarts-site.mjs';

let n = 0; const t = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('\n  DOCTRINE JUDICIAIRE — le stade est établi par les citations');
const SUSP = 'Le professionnel a été suspendu à titre conservatoire, a précisé la municipalité.';
const PLAINTE = 'Une famille a porté plainte pour des faits de violence sexuelle contre un animateur.';
const ADMIN = 'Une enquête administrative a été diligentée sans délais par la Ville.';
const ENQ_NON_ATTRIBUEE = 'Une enquête judiciaire est ainsi en cours, en plus de l’enquête administrative.';
const ENQ = 'L’enquête a été ouverte vendredi, a expliqué la procureure adjointe, et le suspect a été placé en garde à vue lundi.';
const INFO = 'Le parquet a ouvert une information judiciaire pour agressions sexuelles sur mineurs.';
const MEE = 'Un homme de 40 ans a été mis en examen mercredi et placé en détention provisoire.';
const CONDAMNE = 'Le tribunal correctionnel l’a condamné à 24 mois de prison dont 12 avec sursis.';
await t('suspension seule → aucune procédure citée', () => { assert.equal(stadeCite([SUSP]), null); assert.equal(stadeEtabli('enquête', [SUSP]).ok, false); assert.equal(stadePubliable(stadeEtabli('enquête', [SUSP]).stade), false); });
await t('plainte seule → reste « plainte », ne devient JAMAIS « enquête »', () => { const s = stadeEtabli('enquête', [PLAINTE]); assert.equal(s.ok, false); assert.equal(s.stade, 'plainte'); assert.equal(stadePubliable(s.stade), false); });
await t('enquête administrative ≠ enquête judiciaire', () => assert.equal(stadeCite([ADMIN, SUSP]), null));
await t('« enquête judiciaire en cours » sans autorité ni acte → non établie', () => assert.equal(stadeEtabli('enquête', [ENQ_NON_ATTRIBUEE]).ok, false));
await t('enquête confirmée (autorité + acte) → établie, publiable', () => { const s = stadeEtabli('enquête', [PLAINTE, ENQ]); assert.equal(s.ok, true); assert.equal(stadePubliable(s.stade), true); });
await t('information judiciaire (acte concret) → enquête établie', () => assert.equal(stadeEtabli('enquête', [INFO]).ok, true));
await t('mise en examen confirmée → établie ; « mise en examen » annoncée sans citation → ramenée', () => {
  assert.equal(stadeEtabli('mise en examen', [MEE]).ok, true);
  assert.equal(stadeEtabli('mise en examen', [ENQ]).stade, 'enquête');
});
await t('décision judiciaire (condamnation) citée → établie', () => assert.equal(stadeEtabli('condamnation non définitive', [CONDAMNE]).ok, true));
await t('procédure non établie malgré PLUSIEURS articles : le nombre de sources ne compense jamais', () => {
  const cinq = [PLAINTE, SUSP, ADMIN, PLAINTE.replace('famille', 'deuxième famille'), SUSP.replace('professionnel', 'agent')];
  assert.equal(stadeEtabli('enquête', cinq).ok, false); assert.equal(stadePubliable(stadeEtabli('enquête', cinq).stade), false);
});
await t('verifier() applique la doctrine : stade ramené, réserve consignée dans l’ambiguïté', () => {
  const corps = `Une famille a porté plainte pour des faits graves à l’école Les Lilas de Lyon. ${SUSP}`;
  const page = { url: 'https://media-a.example/a', media: 'A', published: '2026-10-01', corps };
  const rep = { est_affaire: true, commune: 'Lyon', departement: 'Rhône', etablissement: 'École Les Lilas', type_structure: 'maternelle', role_mis_en_cause: 'animateur périscolaire',
    type_affaire: 'violences sexuelles', statut_judiciaire: 'enquête', statut_des_faits: 'allégué', enfants_concernes_public: 'non précisé',
    resume: 'Selon la presse, une plainte a été déposée et un agent a été suspendu dans une école.', dernier_evenement: '2026-10-01', ambiguite: null,
    preuves: [{ url: page.url, citation: 'Une famille a porté plainte pour des faits graves à l’école Les Lilas de Lyon.' }] };
  const v = verifier(rep, [page]);
  assert.equal(v.ok, true); assert.equal(v.c.statut_judiciaire, 'plainte'); assert.match(v.c.ambiguite, /non établi par les citations/);
});

console.log('\n  GARDE DE PUBLICATION — la doctrine rejoint les garde-fous existants');
const base = { case_id: 'FR-2026-9001', publication_status: 'candidate', fiabilite_info_10: 10, statut_judiciaire: 'enquête', crit_statut_clair: true, etablissement: 'Centre X', commune: 'Ville',
  type_structure: 'centre de loisirs', role_mis_en_cause: 'animateur périscolaire', enfants_concernes_public: 'non précisé', lat: 44.1, lng: 1.2 };
const VAL = { reviewed_by: 'Adrien (Telegram, Discovery)', decision: 'validé', comment: '[Discovery-auto:ab12cd34] VALIDATE — résumé', reviewed_at: '2026-10-15T08:00:00Z' };
const GO = (id8 = 'ab12cd34') => ({ reviewed_by: 'Adrien (GO publication)', decision: 'validé', comment: `[Publication 2026-10-15] GO d'Adrien : « Telegram VALIDER ET PUBLIER ${id8} »`, reviewed_at: '2026-10-15T08:00:05Z' });
const ctx = (o = {}) => ({ revues: [VAL], sources: [{ url: 'https://www.exemple.fr/a-1', media: 'Média' }], holds: new Set(), autres: [], artefact: new Map(), ...o });
await t('plainte seule → BLOCKED (procédure non établie), jamais AWAITING_GO', () => {
  const g = evaluerPublication({ ...base, statut_judiciaire: 'plainte' }, ctx());
  assert.equal(g.etat, 'BLOCKED'); assert.ok(g.raisons.some((r) => /procédure policière ou judiciaire non établie/.test(r)));
});
await t('enquête et mise en examen → éligibles sous les conditions habituelles', () => {
  assert.equal(evaluerPublication(base, ctx()).etat, 'READY'); assert.equal(evaluerPublication({ ...base, statut_judiciaire: 'mise en examen' }, ctx()).etat, 'READY');
});
await t('publier-affaire refuse un stade non établi (même garde, même source de vérité)', () => {
  const s = src('scripts/publier-affaire.mjs'); assert.ok(s.includes("import { stadePubliable } from './lib/stade-judiciaire.mjs'") && s.includes('procédure policière ou judiciaire non établie'));
});

console.log('\n  UN CLIC : « VALIDER ET PUBLIER »');
const fiche = { departement: 'Test', type_structure: 'centre de loisirs', role_mis_en_cause: 'animateur périscolaire', type_affaire: 'violences sexuelles', statut_judiciaire: 'enquête',
  statut_des_faits: 'allégué', enfants_concernes_public: 'non précisé', crit_source_fiable: true, crit_article_recent: true, crit_etablissement_nomme: true, crit_statut_clair: true, crit_recoupement: true };
const c = { commune: 'Ville', etablissement: 'Centre X', type_structure: 'centre de loisirs', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'enquête', enfants_concernes_public: 'non précisé', ambiguite: null };
const ev = [{ url: 'https://media-a.example/a', media: 'A', quote: ENQ }, { url: 'https://media-b.example/b', media: 'B', quote: INFO }];
const GEO = async () => ({ lat: 44.1, lng: 1.2, source: 'ban-commune' });
const dossier = (o = {}) => dossierPublication({ c, fiche, nomme: true, evidence: ev, indep: 2, recommendation: 'NEW_CASE_CANDIDATE', voisins: [], geocoder: GEO, ...o });
await t('dossier complet → bouton unique proposé, localisation qualifiée « approximative » + réserves', async () => {
  const d = await dossier(); assert.ok(d.directe); assert.equal(d.directe.localisation.type, 'approximative'); assert.ok(d.directe.reserves.some((r) => /approximative/.test(r)));
});
await t('stade insuffisant (plainte seule) → aucun bouton « publier » (il serait refusé)', async () => {
  const d = await dossier({ c: { ...c, statut_judiciaire: 'plainte' } }); assert.equal(d.directe, undefined); assert.ok(d.non.some((r) => /procédure policière ou judiciaire/.test(r)));
});
await t('doublon non résolu / identité non résolue / localisation introuvable / ambiguïté → pas de bouton unique', async () => {
  assert.ok((await dossier({ voisins: [{ case_id: 'FR-2026-0001', role: 'animateur périscolaire' }] })).non.some((r) => /doublon/.test(r)));
  assert.ok((await dossier({ nomme: false, fiche: { ...fiche, crit_etablissement_nomme: false }, voisins: [{ case_id: 'FR-2026-0002', role: 'enseignant' }] })).non.some((r) => /identité non résolue/.test(r)));
  assert.ok((await dossier({ geocoder: async () => null })).non.some((r) => /localisation/.test(r)));
  assert.ok((await dossier({ geocoder: async () => { throw new Error('API HTTP 503'); } })).non.some((r) => /localisation/.test(r)));
  assert.ok((await dossier({ recommendation: 'REVIEW' })).non.length);
});
await t('fiabilité insuffisante (recoupement ET nom absents) → pas de bouton unique', async () => {
  const d = await dossier({ nomme: false, fiche: { ...fiche, crit_etablissement_nomme: false, crit_recoupement: false }, indep: 1 });
  assert.ok(d.non.some((r) => /fiabilité/.test(r)));
});
const payloadBase = { commune: 'Ville', etablissement: 'Centre X', etablissement_nomme: true, structure: 'centre de loisirs', resume: 'Selon la presse, une enquête a été ouverte.', fiche, medias: 2, independantes: 2,
  dernier_evenement: '2026-10-14', articles: ev.map((e) => ({ url: e.url, media: e.media, published: '2026-10-14' })), evidence: ev, possible_matches_sny: [] };
const payloadDirect = { ...payloadBase, publication_directe: { localisation: { type: 'approximative', lat: 44.1, lng: 1.2, source: 'ban-commune' }, reserves: ['localisation approximative : centre de commune (API Adresse)'] } };
await t('message : le contrat du bouton est énoncé (confirme + autorise + accepte localisation et réserves)', () => {
  const m = messageDecision(payloadDirect, 'NEW_CASE_CANDIDATE');
  assert.match(m, /VALIDER ET PUBLIER/); assert.match(m, /je confirme cette affaire/); assert.match(m, /j’autorise sa publication/); assert.match(m, /localisation/); assert.match(m, /Réserves/);
});
await t('boutons : « 📢 VALIDER ET PUBLIER » (callback VALIDATE inchangé) / REVIEW / REJECT ; sans dossier complet : « ✅ VALIDATE »', () => {
  const b = boutons('NEW_CASE_CANDIDATE', 'ab12cd34', payloadDirect).inline_keyboard.flat();
  assert.ok(b[0].text.includes('VALIDER ET PUBLIER') && b[0].callback_data === 'sny:NC:VALIDATE:ab12cd34'); assert.equal(b.length, 3);
  const nb = boutons('NEW_CASE_CANDIDATE', 'ab12cd34', { ...payloadBase, non_publiable: ['procédure non établie'] }).inline_keyboard.flat();
  assert.ok(nb[0].text.includes('VALIDATE') && !nb[0].text.includes('PUBLIER'));
});
await t('affaire non publiable : validation documentaire, le message dit pourquoi (aucun bouton « publier »)', () => {
  const m = messageDecision({ ...payloadBase, non_publiable: ['procédure policière ou judiciaire non établie (plainte seule)'] }, 'NEW_CASE_CANDIDATE');
  assert.match(m, /SANS publication/); assert.match(m, /Publication non proposée/); assert.ok(!/VALIDER ET PUBLIER/.test(m));
});
await t('jamais un bouton « publier » sous une création « preuves à compléter »', () => {
  const faible = { ...payloadDirect, fiche: { ...fiche, crit_recoupement: false }, medias: 1, independantes: 1 };
  assert.ok(!/VALIDER ET PUBLIER/.test(JSON.stringify(boutons('REVIEW', 'ab12cd34', faible))));
});
await t('chaîne simulée sur un dossier témoin (aucune écriture de production) : clic → validation + GO → projetable → site conforme', () => {
  // 1. le clic crée la candidate avec la revue « VALIDATE » (appliquer-nouvelles-affaires) ; 2. publier-affaire consigne le GO « VALIDER ET PUBLIER ».
  const candidate = { ...base };
  assert.equal(etatPublication(candidate, ctx({ revues: [VAL] })).etat, 'AWAITING_GO');
  const publiee = { ...base, publication_status: 'publiée' };
  const revues = [VAL, GO()];
  assert.ok(goPublication(revues), 'le GO du clic unique est un GO explicite');
  assert.equal(etatPublication(publiee, ctx({ revues })).etat, 'NEEDS_PROJECTION');               // 3. publiable : le réconciliateur la projette
  const artefact = new Map([[base.case_id, { ...base, sources: [{ url: 'https://media-a.example/a' }], etat: null }]]);
  assert.equal(etatPublication(publiee, ctx({ revues, artefact })).etat, 'IN_ARTEFACT');           // 4. projetée
  const html = `<script id="cases-data" type="application/json">${JSON.stringify([{ case_id: base.case_id, statut_judiciaire: 'enquête', source_url: 'https://media-a.example/a', etat: null }])}</script>`;
  assert.deepEqual(ecartsSite(html, [base.case_id], artefact), []);                                  // 5. vérification du site servi (simulée)
  assert.equal(categorieDiagnostic(publiee, ctx({ revues, artefact, servie: true })).categorie, 'PUBLIC');
});

console.log('\n  AUCUN DEUXIÈME GO');
await t('GO donné (clic unique) mais publication encore bloquée → GO_STUCK, jamais MISSING_PROPOSAL (donc jamais redemandé)', () => {
  const d = categorieDiagnostic({ ...base }, ctx({ proposition: { decision: 'ACCEPT' }, localisable: true }));
  assert.equal(d.categorie, 'GO_STUCK');
});
await t('un échec de déploiement n’efface pas le GO : publiée + GO + absente du site → GO_STUCK (reprise), GO intact', () => {
  const revues = [VAL, GO()]; const artefact = new Map([[base.case_id, { ...base }]]);
  assert.equal(categorieDiagnostic({ ...base, publication_status: 'publiée' }, ctx({ revues, artefact, servie: false })).categorie, 'GO_STUCK');
  assert.ok(goPublication(revues));
});
await t('un GO existant et un défaut judiciaire découvert → publication bloquée, GO conservé (correction factuelle, pas un nouveau GO)', () => {
  const revues = [VAL, GO()]; const cand = { ...base, statut_judiciaire: 'plainte' };
  assert.equal(evaluerPublication(cand, ctx({ revues })).etat, 'BLOCKED'); assert.ok(goPublication(revues));
});
await t('le proposeur ne redemande jamais un GO déjà donné (clic unique ou GO consigné) ; la réconciliation le voit', () => {
  const p = src('scripts/proposer-publication.mjs');
  assert.ok(p.includes("payload ? 'publication_directe'") && p.includes('goDonne.has(c.case_id) || goPublication(rv)'));
  assert.ok(src('scripts/reconcilier-publication.mjs').includes("payload ? 'publication_directe'"));
});
await t('une reprise ne produit ni seconde création ni seconde décision : created_case_id court-circuite la création, applied_at reste ouvert jusqu’au GO', () => {
  const a = src('scripts/appliquer-nouvelles-affaires.mjs');
  assert.ok(a.includes('const cree = r.created_case_id ? [] : await sql'));
  assert.ok(a.includes('applied_at = case when ${direct} then null else now() end'));
  assert.ok(a.includes('Telegram VALIDER ET PUBLIER') && a.includes('const direct = accepte && !rejet && !enAttente && action === \'CREATE\' && !!p.publication_directe'));
  assert.ok(a.includes("o.etat === 'refus'") && a.includes('Ton GO est conservé'));
});
await t('VALIDATE ≠ PUBLIER reste vrai SANS dossier complet : aucune publication sans publication_directe', () => {
  const a = src('scripts/appliquer-nouvelles-affaires.mjs');
  assert.ok(a.includes('if (direct && cid)') && !/direct\s*=\s*true/.test(a));
});

console.log(`\n  ${n} contrôles : OK\n`);
