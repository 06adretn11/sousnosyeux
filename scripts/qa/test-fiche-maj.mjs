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
  assert.ok(v.includes('absente(s) de la page servie'), 'la confirmation exige le contenu approuvé, pas seulement les attributs data-*');
  assert.ok(src('scripts/proposer-fiche.mjs').includes('changementsFiche') && src('scripts/promouvoir-fiche.mjs').includes('--depuis-propositions'));
});

console.log(`\n${n} contrôles : OK`);
