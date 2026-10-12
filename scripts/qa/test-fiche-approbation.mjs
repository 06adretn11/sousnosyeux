// Fiche individuelle — pas de page sans approbation ; l'approbation porte sur l'empreinte du dossier ; APPROUVER ≠ PUBLIER l'affaire.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ficheApprouvee, hashDossier, payloadFiche, dossierFiche, REVUE_FICHE } from '../lib/fiche-page.mjs';
import { boutonValable } from '../lib/telegram-clics.mjs';
import { boutons, messageFiche, messageDecision } from '../lib/discovery-messages.mjs';
import { detecterInstitutionnel } from '../lib/evenement-institutionnel.mjs';

const lire = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const c = lire('data/cases.json').cases.find((x) => x.case_id === 'POC-09');
const dossier = dossierFiche('POC-09');
const p = payloadFiche({ c, dossier, sourcesNeon: [], nbEvenements: 2, previewBase: 'http://localhost:4331', hubTitre: 'Paris 11e' });
const R = (comment, by = 'Adrien (Telegram, fiche)', decision = 'validé') => ({ reviewed_by: by, decision, comment });

t('une revue d’approbation valide uniquement pour son affaire et son empreinte', () => {
  const h = hashDossier(dossier.d);
  assert.equal(ficheApprouvee([R(`[Fiche approuvée 1a2b3c4d] POC-09 hash=${h}`)], 'POC-09'), h);
  assert.equal(ficheApprouvee([R(`[Fiche approuvée 1a2b3c4d] POC-09 hash=${h}`)], 'POC-05'), null);
});
t('revue d’un tiers, ou « à corriger », n’approuve rien', () => {
  const h = hashDossier(dossier.d);
  assert.equal(ficheApprouvee([R(`[Fiche approuvée 1a2b3c4d] POC-09 hash=${h}`, 'import-script')], 'POC-09'), null);
  assert.equal(ficheApprouvee([R(`[Fiche approuvée 1a2b3c4d] POC-09 hash=${h}`, 'Adrien (x)', 'à corriger')], 'POC-09'), null);
});
t('dossier modifié après approbation → empreinte différente (la page cesse d’être publique)', () => {
  const h = hashDossier(dossier.d);
  assert.notEqual(hashDossier({ ...dossier.d, faits: dossier.d.faits + ' (modifié)' }), h);
  assert.equal(hashDossier(JSON.parse(JSON.stringify(dossier.d))), h, 'empreinte stable (ordre des clés indifférent)');
});
t('la proposition porte aperçu, diff, sources, inconnues, empreinte ; rien de privé', () => {
  const x = p.page;
  assert.ok(x.preview_url.endsWith('/brouillons/affaires/poc-09/') && x.hash && x.diff_public.length && x.inconnues.length && x.sources_directes.length);
  assert.ok(!/Nicolas|Chalumeau/.test(JSON.stringify(p)), 'nom propre');
});
t('boutons : APPROUVER (callback VALIDATE) + REVIEW + REJECT ; jamais le bouton PUBLIER d’une affaire', () => {
  const b = boutons('REVIEW', 'abcd1234', p).inline_keyboard.flat();
  assert.deepEqual(b.map((x) => x.callback_data), ['sny:NC:VALIDATE:abcd1234', 'sny:NC:REVIEW:abcd1234', 'sny:NC:REJECT:abcd1234']);
  assert.ok(/APPROUVER LA FICHE/.test(b[0].text) && !/PUBLIER/.test(b.map((x) => x.text).join(' ')));
});
t('boutonValable : seul VALIDATE est positif pour une fiche ; ATTACH/CREATE refusés', () => {
  assert.equal(boutonValable('VALIDATE', p), true);
  for (const a of ['ATTACH', 'CREATE', 'PENDING']) assert.equal(boutonValable(a, p), false);
  assert.equal(boutonValable('VALIDATE', { page: {} }), false, 'sans empreinte : refusé');
});
t('le message annonce « FICHE INDIVIDUELLE À APPROUVER », l’aperçu, le diff, et que ce n’est pas la publication de l’affaire', () => {
  const m = messageDecision(p, 'REVIEW');
  for (const re of [/FICHE INDIVIDUELLE À APPROUVER/, /Aperçu : http/, /Diff de publication/, /Éléments nouveaux/, /Inconnues/, /Ce n’est pas la publication de l’affaire/]) assert.match(m, re);
  assert.equal(m, messageFiche(p));
});
t('prise de parole d’employeur : libellé fermé, sans état judiciaire, realisation NULL (« X a dit Y » ≠ « Y »)', () => {
  const d = detecterInstitutionnel(["l'association a immédiatement pris les mesures relevant de sa responsabilité d'employeur et de gestionnaire à cette date"]);
  assert.equal(d.event_type, 'réponse_institutionnelle'); assert.equal(d.realisation, null);
  assert.match(d.libelle_public, /Position de l’employeur, non vérifiée par ailleurs/);
  assert.equal(detecterInstitutionnel(['le maire est choqué par ces faits graves']), null, 'un acteur sans mesure ne suffit pas');
});
t('REVUE_FICHE ne reconnaît pas une revue d’affaire (« GO publication », « RAPPROCHER »)', () => {
  for (const s of ["[Publication 2026-10-11] GO d'Adrien : « x »", '[Discovery-auto:ab12cd34] RAPPROCHER — 1 article']) assert.ok(!REVUE_FICHE.test(s));
});
console.log(`\n${n} contrôles approbation de fiche : OK`);
