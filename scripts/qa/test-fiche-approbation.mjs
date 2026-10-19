// Fiche individuelle — pas de page sans approbation ; l'approbation porte sur l'empreinte du dossier ; APPROUVER ≠ PUBLIER l'affaire.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ficheApprouvee, hashDossier, payloadFiche, dossierFiche, REVUE_FICHE, empreinteApprouvee } from '../lib/fiche-page.mjs';
import { boutonValable } from '../lib/telegram-clics.mjs';
import { boutons, messageFiche, messageDecision } from '../lib/discovery-messages.mjs';
import { decider, inscrire } from '../lib/promouvoir-fiche.mjs';
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
  assert.ok(x.preview_url.endsWith('/brouillons/revue/poc-09/') && x.hash && x.diff_public.length && x.inconnues.length && x.sources_directes.length);
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
t('sans base d’aperçu joignable : jamais d’URL localhost, le message annonce des captures jointes', () => {
  const q = payloadFiche({ c, dossier, sourcesNeon: [], nbEvenements: 2, previewBase: null, hubTitre: 'Paris 11e' });
  assert.equal(q.page.preview_url, null);
  const m = messageFiche(q);
  assert.match(m, /captures de la page jointes/); assert.ok(!/localhost|127\.0\.0\.1/.test(m));
});
t('UPDATE validé (données isolées) : la fiche approuvée reste publique ; seul un changement ÉDITORIAL du dossier la retire', () => {
  const h = hashDossier(dossier.d);
  const revues = [R(`[Fiche approuvée 1a2b3c4d] POC-09 hash=${h}`)];
  assert.equal(empreinteApprouvee(revues, 'POC-09', dossier), h, 'approuvée, dossier inchangé');
  // un événement de plus dans Neon (data/evenements.json) ne touche pas le dossier : l’empreinte est la même
  const evenements = lire('data/evenements.json'); const avant = JSON.stringify(dossier.d);
  evenements.affaires['POC-09'] = [...(evenements.affaires['POC-09'] || []), { event_id: 'isole', type: 'décision', date: '2026-12-01' }];
  assert.equal(JSON.stringify(dossier.d), avant);
  assert.equal(empreinteApprouvee(revues, 'POC-09', dossier), h, 'après un UPDATE validé : toujours publique, sans nouvelle approbation');
  assert.equal(empreinteApprouvee(revues, 'POC-09', { ...dossier, d: { ...dossier.d, faits: 'réécrit' } }), null, 'dossier réécrit : plus publique');
});
t('génériques : les trois fiches V1 produisent le même gabarit de proposition, sans condition sur l’identifiant', () => {
  const cs = lire('data/cases.json').cases;
  for (const id of ['POC-09', 'FR-2026-0042', 'FR-2026-0114']) {
    const q = payloadFiche({ c: cs.find((x) => x.case_id === id), dossier: dossierFiche(id), sourcesNeon: [], nbEvenements: 0, previewBase: null });
    assert.ok(q.page.hash && q.page.sources_directes.length && q.page.inconnues.length && q.page.nouveautes.some((n) => /réaction/.test(n)), id);
    assert.ok(q.page.diff_public.some((l) => /Fiche →/.test(l)), id);
  }
});

// ---------------- remplacement d'une fiche PUBLIÉE (V1 → V2) : la page ne tombe jamais entre l'approbation et la promotion ----------------
{
  const V1 = { etat_actuel: ['v1'], deroule: [], inconnues: [], statut_affiche: 'enquête' };
  const V2 = { ...V1, etat_actuel: ['v2'], situation: { decision: { titre: 'x' } } };
  const V1bis = { ...V1, etat_actuel: ['v1 modifiée sans approbation'] };
  const h = (d) => hashDossier(d);
  const R = (d, by = 'Adrien (Telegram, fiche)', dec = 'validé') => ({ reviewed_by: by, decision: dec, comment: `[Fiche approuvée 1a2b3c4d] FR-T-9 hash=${h(d)}` });
  const sert = (revues, d) => empreinteApprouvee(revues, 'FR-T-9', d ? { d } : null); // ce que la projection publie : l'empreinte du dossier SERVI, ou rien
  const ctx = (o = {}) => ({ id: 'FR-T-9', generee: { d: V2, proposable: true }, revues: [R(V1), R(V2)], isoles: { dossiers: { 'FR-T-9': V1 } }, hubs: [], cases: [{ case_id: 'FR-T-9' }], holds: new Set(), ...o });

  t('remplacement · aucune approbation → jamais publique (première publication)', () => { assert.equal(sert([], V1), null); assert.equal(sert([R(V1, 'import-script')], V1), null); assert.equal(sert([R(V1, 'Adrien (x)', 'à corriger')], V1), null); });
  t('remplacement · V1 approuvée et dans le dossier → V1 servie', () => { assert.equal(sert([R(V1)], V1), h(V1)); });
  t('remplacement · V2 approuvée mais non promue : V1 reste servie, reprojections répétées stables (pas de 404, pas d’alternance)', () => {
    const revues = [R(V1), R(V2)];
    for (let i = 0; i < 3; i++) assert.equal(sert(revues, V1), h(V1));
  });
  t('remplacement · promotion V2 : permise (elle remplace une version approuvée), V2 servie, rejouage idempotent', () => {
    const d = decider(ctx()); assert.equal(d.ok, true); assert.equal(d.remplace, h(V1)); assert.equal(d.hash, h(V2));
    const apres = inscrire({ dossiers: { 'FR-T-9': V1 } }, 'FR-T-9', d.dossier, d.hash);
    assert.equal(sert([R(V1), R(V2)], apres.dossiers['FR-T-9']), h(V2));
    assert.equal(decider(ctx({ isoles: apres })).motif, 'DEJA_PROMUE', 'rejouer la promotion ne fait rien');
    assert.equal(sert([R(V1), R(V2)], apres.dossiers['FR-T-9']), h(V2), 'reprojection répétée : stable');
  });
  t('remplacement · promotion ou déploiement interrompu : le dossier committé reste V1, donc V1 reste servie', () => {
    assert.equal(sert([R(V1), R(V2)], ctx().isoles.dossiers['FR-T-9']), h(V1));
  });
  t('remplacement · refus de V2 (aucune revue écrite) : V1 reste servie, V2 non promouvable', () => {
    assert.equal(sert([R(V1)], V1), h(V1));
    assert.equal(decider(ctx({ revues: [R(V1)] })).motif, 'EMPREINTE_APPROUVEE_DIFFERENTE');
  });
  t('remplacement · intégrité : un dossier modifié SANS approbation n’est pas servi (échec fermé) ; jamais d’écrasement d’une rédaction non approuvée', () => {
    assert.equal(sert([R(V1), R(V2)], V1bis), null);
    assert.equal(decider(ctx({ isoles: { dossiers: { 'FR-T-9': V1bis } } })).motif, 'DOSSIER_DEJA_PRESENT_PAS_D_ECRASEMENT');
    assert.equal(decider(ctx({ hubs: [{ dossiers: { 'FR-T-9': V1 } }] })).motif, 'DOSSIER_DEJA_PRESENT_PAS_D_ECRASEMENT', 'un dossier de Hub n’est jamais remplacé');
  });
  t('remplacement · HOLD et affaire retirée gardent la priorité : promotion refusée', () => {
    assert.equal(decider(ctx({ holds: new Set(['FR-T-9']) })).motif, 'HOLD');
    assert.equal(decider(ctx({ cases: [] })).motif, 'AFFAIRE_NON_PUBLIQUE');
  });
}
console.log(`\n${n} contrôles approbation de fiche : OK`);
