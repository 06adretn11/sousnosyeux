#!/usr/bin/env node
// Telegram « PUBLIER » — contrat : PUBLIER = GO explicite exécuté par publier-affaire.mjs ; REJECT conserve l'affaire ; REVIEW ne publie rien ;
// jamais de coordonnée inventée ; jamais « publié » avant le site servi. Aucun réseau, aucune base.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { localisationDe, payloadPublication, argsPublierAffaire, cleDedup, motifRefus } from '../lib/proposition-publication.mjs';
import { messagePublication, boutons } from '../lib/discovery-messages.mjs';
import { boutonValable, decoderCallback } from '../lib/telegram-clics.mjs';
import { REVUE_GO_PUBLICATION } from '../lib/publication-gates.mjs';
import { DATA_RE } from '../../workers/telegram-webhook/worker.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const c = { case_id: 'FR-2026-9001', etablissement: 'Centre de loisirs X', commune: 'Ville', statut_judiciaire: 'enquête', fiabilite_info_10: 10,
  crit_source_fiable: true, crit_article_recent: true, crit_etablissement_nomme: true, crit_statut_clair: true, crit_recoupement: false, lat: null, lng: null };
const examen = { etat: 'AWAITING_GO', raisons: [] };
const sources = [{ media: 'Média A', url: 'https://www.exemple.fr/a', d: '2026-10-01' }, { media: 'Média B', url: 'https://www.exemple.fr/b', d: '2026-10-02' }];
const geo = { lat: 44.123456, lng: 1.654321, source: 'ban-commune' };
const pAppr = payloadPublication({ c, examen, sources, loc: localisationDe(c, geo), resume: 'Selon la presse, une enquête est ouverte.' });
const pDoc = payloadPublication({ c: { ...c, lat: '43.5', lng: '-1.4' }, examen, sources, loc: localisationDe({ ...c, lat: '43.5', lng: '-1.4' }), resume: null });
const pNone = payloadPublication({ c, examen, sources, loc: localisationDe(c, null) });

console.log('\n  TELEGRAM PUBLIER — contrat\n  ' + '─'.repeat(70));

// --- localisation : jamais inventée ------------------------------------------------------------------------------------------------
t('coordonnées déjà en base, sans précision → localisation DOCUMENTÉE', () => assert.equal(localisationDe({ ...c, lat: '43.5', lng: '-1.4' }).type, 'documentee'));
t('coordonnées en base marquées geocode_source → APPROXIMATIVE (jamais présentée comme précise)', () => assert.equal(localisationDe({ ...c, lat: 43.5, lng: -1.4, geocode_source: 'ban-commune' }).type, 'approximative'));
t('aucune coordonnée + centre de commune exact → APPROXIMATIVE, signalée', () => assert.equal(localisationDe(c, geo).type, 'approximative'));
t('aucune coordonnée, aucun centre fiable → null : rien d’inventé', () => assert.equal(localisationDe(c, null), null));
t('sans localisation, la proposition n’est PAS publiable (pas de bouton PUBLIER)', () => {
  assert.equal(pNone.publication.publiable, false);
  assert.deepEqual(boutons('REVIEW', 'abcdef12', pNone).inline_keyboard.flat().map((b) => b.callback_data.split(':')[2]), ['REVIEW', 'REJECT']);
});
t('une candidate non examinée (BLOCKED) n’est pas publiable', () => assert.equal(payloadPublication({ c, examen: { etat: 'BLOCKED', raisons: ['HOLD'] }, loc: localisationDe(c, geo) }).publication.publiable, false));

// --- message synthétique ---------------------------------------------------------------------------------------------------------------
t('le message porte établissement, commune, état judiciaire, preuves, sources et précision de localisation', () => {
  const m = messagePublication(pAppr).replace(/<\/?b>/g, '');
  for (const x of ['Centre de loisirs X', 'Ville', '« enquête »', 'recoupement ✗', 'source fiable ✓', 'https://www.exemple.fr/a', 'https://www.exemple.fr/b', 'APPROXIMATIVE']) assert.ok(m.includes(x), x);
});
t('localisation documentée dite documentée ; absente dite impossible', () => {
  assert.ok(messagePublication(pDoc).includes('documentée'));
  assert.ok(/Aucune localisation fiable/.test(messagePublication(pNone)));
});
t('le message n’affiche AUCUNE coordonnée précise', () => assert.ok(!/44\.1234|1\.6543|43\.5|-1\.4/.test(messagePublication(pAppr) + messagePublication(pDoc))));
t('le message ne dit jamais « publié » : il propose', () => assert.ok(!/déjà publiée|a été publiée|est publiée/i.test(messagePublication(pAppr))));

// --- boutons : Worker inchangé, idempotence par la proposition ---------------------------------------------------------------------------
t('boutons PUBLIER / REVIEW / REJECT ; callbacks valides pour le Worker EXISTANT (aucun redéploiement) et ≤ 64 octets', () => {
  const b = boutons('REVIEW', 'abcdef12', pAppr).inline_keyboard.flat();
  assert.deepEqual(b.map((x) => x.text), ['📢 PUBLIER', '🟡 REVIEW', '⛔ REJECT']);
  for (const x of b) { assert.ok(DATA_RE.test(x.callback_data), x.callback_data); assert.ok(Buffer.byteLength(x.callback_data) <= 64); assert.ok(decoderCallback(x.callback_data)); }
});
t('PUBLIER n’est valable que pour une proposition de publication PUBLIABLE', () => {
  assert.equal(boutonValable('VALIDATE', pAppr), true);
  assert.equal(boutonValable('VALIDATE', pNone), false);
});
t('une proposition de publication n’accepte ni ATTACH, ni CREATE, ni PENDING ; REVIEW/REJECT toujours', () => {
  for (const a of ['ATTACH', 'CREATE', 'PENDING']) assert.equal(boutonValable(a, pAppr), false, a);
  assert.equal(boutonValable('REVIEW', pNone), true); assert.equal(boutonValable('REJECT', pNone), true);
});
t('non-régression : une proposition de création ordinaire garde ses boutons (VALIDATE exige une fiche)', () => {
  assert.equal(boutonValable('VALIDATE', { fiche: { x: 1 } }), true);
  assert.equal(boutonValable('VALIDATE', {}), false);
  assert.equal(boutonValable('ATTACH', { attach: { case_id: 'FR-2026-0001' } }), true);
});
t('une proposition par candidate (dedup) : aucun doublon', () => assert.equal(cleDedup('FR-2026-9001'), 'publication|FR-2026-9001'));

// --- exécution : publier-affaire, jamais une seconde logique SQL --------------------------------------------------------------------------
t('PUBLIER → publier-affaire.mjs en liste d’arguments, GO consigné au format reconnu comme GO publication explicite', () => {
  const a = argsPublierAffaire({ case_id: 'FR-2026-9001', id8: 'abcdef12', dbLat: 43.5, dbLng: -1.4, loc: pDoc.publication.localisation, date: '2026-10-12' });
  assert.deepEqual(a.slice(0, 4), ['scripts/publier-affaire.mjs', 'FR-2026-9001', '--ecrire', '--go']);
  const note = `[Publication 2026-10-12] GO d'Adrien : « ${a[4]} »`; // tel que publier-affaire.mjs le consigne
  assert.ok(REVUE_GO_PUBLICATION.test(note), note);
});
t('coordonnées déjà en base → non repassées (publier-affaire refuse d’écraser)', () => assert.ok(!argsPublierAffaire({ case_id: 'X', id8: 'a', dbLat: 43.5, dbLng: -1.4, loc: pDoc.publication.localisation, date: 'd' }).includes('--coords')));
t('point approximatif → coordonnées ET précision (--geocode-source) toujours passées ensemble', () => {
  const a = argsPublierAffaire({ case_id: 'X', id8: 'a', dbLat: null, dbLng: null, loc: pAppr.publication.localisation, date: '2026-10-12' });
  assert.ok(a.includes('--coords') && a.includes('--coords-source') && a.includes('--geocode-source') && a[a.indexOf('--geocode-source') + 1] === 'ban-commune');
});
t('aucune localisation → refus avant toute écriture', () => assert.throws(() => argsPublierAffaire({ case_id: 'X', id8: 'a', dbLat: null, dbLng: null, loc: null, date: 'd' })));
t('l’application : un seul appel à publier-affaire (liste d’arguments), AUCUNE écriture de statut ni de GO dans le handler', () => {
  const s = src('scripts/appliquer-nouvelles-affaires.mjs');
  const bloc = s.slice(s.indexOf('if (p.publication) {'), s.indexOf('// --- rapprochement'));
  // L'exécution du GO vit dans UNE fonction (publierGo), partagée avec « VALIDER ET PUBLIER » : un seul appel, en liste d'arguments.
  const helper = s.slice(s.indexOf('async function publierGo'), s.indexOf('async function publierGo') + 900);
  assert.ok(/execFileSync\(process\.execPath, args/.test(helper) && /argsPublierAffaire/.test(helper) && /publierGo\(/.test(bloc));
  assert.equal((s.match(/execFileSync\(/g) || []).length, 1, 'un seul appel à publier-affaire');
  assert.ok(!/update cases|publication_status|GO d'Adrien|delete from/i.test(bloc), 'pas de SQL de publication dupliqué');
});
t('REJECT : revue « à corriger » (jamais « retirer », jamais de suppression) ; REVIEW : rien d’écrit (HOLD existant)', () => {
  const s = src('scripts/appliquer-nouvelles-affaires.mjs');
  const bloc = s.slice(s.indexOf('if (p.publication) {'), s.indexOf('// --- rapprochement'));
  assert.ok(/'à corriger'/.test(bloc) && !/retirer/.test(bloc) && !/delete from/i.test(bloc));
  assert.ok(s.indexOf("r.decision === 'REVIEW_REQUIRED'") < s.indexOf('if (p.publication) {'), 'REVIEW est traité (sans effet) avant toute publication');
});
t('idempotence : l’application ne retient que applied_at is null ; publier-affaire ne touche que les candidates', () => {
  assert.ok(/applied_at is null/.test(src('scripts/appliquer-nouvelles-affaires.mjs')));
  assert.ok(/publication_status = 'candidate'/.test(src('scripts/publier-affaire.mjs')));
});

// --- refus permanent : tracé, jamais retenté ; message lisible --------------------------------------------------------------------------------
const SORTIE_REELLE = ['FR-2026-0129 — X (Y)', '  AVANT : publication_status = candidate', '', 'REFUS — 2 garde-fou(s) :', '  · fiabilité 4 < 8', '  · aucune revue « validé » d’Adrien'].join('\n');
t('refus de contrôle (sortie réelle du 12/10) → motif propre, sans « : ; » ni en-tête, et DÉFINITIF', () => {
  const r = motifRefus(SORTIE_REELLE);
  assert.equal(r.motif, 'fiabilité 4 < 8 ; aucune revue « validé » d’Adrien');
  assert.equal(r.definitif, true);
});
t('erreur technique (réseau, base) → NON définitif : réessayée au passage suivant', () => {
  assert.equal(motifRefus('TypeError: fetch failed').definitif, false);
  assert.equal(motifRefus('').definitif, false);
});
t('aucune localisation fiable → définitif, motif lisible', () => assert.deepEqual(motifRefus('Error: aucune localisation fiable : publication refusée'), { definitif: true, motif: 'aucune localisation fiable' }));
t('refus définitif : applied_at posé et motif AJOUTÉ à decision_comment — la décision (ACCEPT, decided_by/at) n’est jamais effacée', () => {
  const s = src('scripts/appliquer-nouvelles-affaires.mjs');
  const bloc = s.slice(s.indexOf("if (o.etat === 'refus') {"), s.indexOf('continue;', s.indexOf("if (o.etat === 'refus') {")));
  assert.ok(/applied_at = now\(\)/.test(bloc) && /decision_comment = left\(coalesce\(decision_comment/.test(bloc));
  assert.ok(!/decision\s*=|decided_by\s*=|decided_at\s*=|delete from/i.test(bloc));
});

// --- « publié » seulement après le site servi ---------------------------------------------------------------------------------------------
t('« Publié et vérifié » n’est émis QUE par verifier-site.mjs (après lecture du site servi)', () => {
  const dossier = new URL('../', import.meta.url);
  const emetteurs = [];
  for (const f of [...readdirSync(dossier), ...readdirSync(new URL('lib/', dossier)).map((x) => 'lib/' + x)].filter((x) => x.endsWith('.mjs'))) {
    if (/🌐 <b>Publié et vérifié/.test(readFileSync(new URL(f, dossier), 'utf8'))) emetteurs.push(f);
  }
  assert.deepEqual(emetteurs, ['verifier-site.mjs']);
});
t('l’accusé et le message d’application ne disent pas « publié » : autorisation enregistrée, pas encore visible', () => {
  const s = src('scripts/appliquer-nouvelles-affaires.mjs');
  assert.ok(/n’est PAS encore visible/.test(s));
});

console.log(`\n  ${n} contrôles : OK\n`);
