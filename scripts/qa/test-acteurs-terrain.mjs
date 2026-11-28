// Bloc « Acteur de terrain » et enrichissement rédigé d'une fiche : validation, jamais une source de l'affaire, jamais un fait, empreinte, message, application sûre.
// Sans base ni réseau.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validerActeurs, sourcesActeurs, compterPoints, AVERTISSEMENT, GENRES, CATEGORIE_DOCUMENT } from '../lib/acteurs-terrain.mjs';
import { composerEnrichissement } from '../lib/enrichissement.mjs';
import { urlsDe, changementsFiche, payloadFiche, hashDossier } from '../lib/fiche-page.mjs';
import { messageFiche } from '../lib/discovery-messages.mjs';
import { rendreMarkdown } from '../lib/fiche-rendu.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const lire = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const json = (f) => JSON.parse(lire(f));
const patch = json('data/fiches-enrichissements/FR-2026-0048.json');

const src = { cr: { media: 'Collectif', libelle: 'compte rendu', url: 'https://exemple.org/cr', publie_le: null, categorie: CATEGORIE_DOCUMENT } };
const acteur = (o = {}) => ({ acteur: 'Collectif X', nature: 'collectif', presentation: 'Collectif local.', sources: src,
  groupes: [{ genre: 'demande', titre: 'Ce que le collectif demande', points: [{ src: 'cr', texte: 'Un audit de l’application des directives.' }] }], ...o });
const pb = (a) => validerActeurs([a]);

t('la matière réelle de FR-2026-0048 est conforme (aucun problème de validation)', () => {
  assert.deepEqual(validerActeurs(patch.acteurs_de_terrain), []);
  assert.equal(compterPoints(patch.acteurs_de_terrain), 25);
});
t('un acteur minimal est conforme ; null / absence = aucun problème', () => {
  assert.deepEqual(pb(acteur()), []);
  assert.deepEqual(validerActeurs(null), []);
  assert.deepEqual(validerActeurs(undefined), []);
});
t('refus : présentation, source, URL, catégorie, paramètre de suivi, date de publication', () => {
  assert.ok(pb(acteur({ presentation: '' })).some((x) => /presentation/.test(x)));
  assert.ok(pb(acteur({ sources: {} })).some((x) => /aucune source/.test(x)));
  assert.ok(pb(acteur({ sources: { cr: { ...src.cr, url: 'http://exemple.org/x' } } })).some((x) => /https/.test(x)));
  assert.ok(pb(acteur({ sources: { cr: { ...src.cr, categorie: undefined } } })).some((x) => /categorie/.test(x)));
  assert.ok(pb(acteur({ sources: { cr: { ...src.cr, url: 'https://exemple.org/x?fbclid=abc' } } })).some((x) => /fbclid/.test(x)));
  assert.ok(pb(acteur({ sources: { cr: { ...src.cr, publie_le: '17/07/2026' } } })).some((x) => /date de publication/.test(x)));
});
t('refus : genre inconnu, point sans source connue, point trop long, « limites » invalide', () => {
  const g = (o) => acteur({ groupes: [{ genre: 'demande', titre: 'T', points: [{ src: 'cr', texte: 'Un texte.' }], ...o }] });
  assert.ok(pb(g({ genre: 'verite' })).some((x) => /genre inconnu/.test(x)));
  assert.ok(pb(g({ points: [{ src: 'zz', texte: 'Un texte.' }] })).some((x) => /inconnue/.test(x)));
  assert.ok(pb(g({ points: [{ src: 'cr', texte: 'x'.repeat(421) }] })).some((x) => /420/.test(x)));
  assert.ok(pb(acteur({ limites: ['ok', ''] })).some((x) => /limites/.test(x)));
});
t('refus : nom de personne, nombre exact d’enfants, qualification pénale attribuée', () => {
  const p = (texte) => acteur({ groupes: [{ genre: 'constat', titre: 'T', points: [{ src: 'cr', texte }] }] });
  assert.ok(pb(p('Selon Mme Dupont, rien n’a été fait.')).some((x) => /nom de personne/.test(x)));
  assert.ok(pb(p('Le collectif évoque trois enfants concernés.')).some((x) => /nombre exact/.test(x)));
  assert.ok(pb(p('Une agression sexuelle commise par un animateur.')).some((x) => /qualification pénale/.test(x)));
  // Les nombres d'agents, de contrats ou de suspensions ne sont pas des nombres d'enfants.
  assert.deepEqual(pb(p('Il compare 250 agents formés à près de 3 000 agents à former, et 14 suspensions depuis 2024.')), []);
});
t('genres : demande ≠ constat ≠ annonce rapportée ≠ question ouverte, libellés imposés ; avertissement fixe', () => {
  assert.deepEqual(Object.keys(GENRES), ['demande', 'constat', 'annonce_rapportee', 'question_ouverte']);
  assert.match(AVERTISSEMENT, /ni des faits établis ni la position de SousNosYeux/);
});
t('un document d’acteur n’est JAMAIS une source de l’affaire : exclu de urlsDe (donc de la mémoire et de la carte), étape comprise', () => {
  const d = { deroule: [
    { date: '2026-07-03', type: 'rencontre', texte: 'Le collectif…', source: { media: 'Collectif', url: 'https://exemple.org/cr', categorie: CATEGORIE_DOCUMENT } },
    { date: '2026-04-10', type: 'mise_en_examen', texte: 'Selon le parquet…', source: { media: 'Actu.fr', url: 'https://actu.fr/x' } }] };
  assert.deepEqual(urlsDe(d).map((s) => s.url), ['https://actu.fr/x']);
  assert.deepEqual(sourcesActeurs([acteur()]).map((s) => s.url), ['https://exemple.org/cr']);
});

// --- composition : application sûre -----------------------------------------------------------------------------------------------------------------
const approuve = { hub: null, d: { situation: { decision: { titre: 'Mise en examen' } }, deroule: [{ date: '2026-04-09', date_nature: 'evenement', type: 'mise_en_examen', texte: 'Selon le parquet…', source: { media: 'Actu.fr', url: 'https://actu.fr/x', publie_le: '2026-04-10' } }], reactions: [], inconnues: ['Aucun jugement.'] } };
const p0 = { ...patch, base_hash: hashDossier(approuve.d) };
t('enrichissement : ajoute les étapes et le bloc, sans toucher à la version approuvée (situation, étapes, sources, inconnues identiques)', () => {
  const r = composerEnrichissement({ approuve, patch: p0 });
  assert.equal(r.ok, true, r.refus.join(' | '));
  assert.equal(r.ajouts.length, 2);
  assert.equal(r.dossier.deroule.length, 3);
  assert.deepEqual(r.dossier.situation, approuve.d.situation);
  assert.deepEqual(r.dossier.deroule[0], approuve.d.deroule[0]);
  assert.deepEqual(r.dossier.inconnues, approuve.d.inconnues);
  assert.notEqual(r.apres, r.base);
  assert.equal(approuve.d.acteurs_de_terrain, undefined, 'le dossier approuvé n’est pas modifié en place');
});
t('enrichissement : REFUS si la version approuvée a changé (base périmée) — jamais d’écrasement', () => {
  const autre = structuredClone(approuve); autre.d.inconnues = ['Autre.'];
  const r = composerEnrichissement({ approuve: autre, patch: p0 });
  assert.equal(r.ok, false); assert.match(r.refus[0], /à refaire à partir de la version approuvée/);
});
t('enrichissement : rejouable (étapes déjà présentes non dupliquées) ; refus d’un type d’étape non admis, d’une étape non attribuée, d’une source de presse', () => {
  const une = composerEnrichissement({ approuve, patch: p0 });
  const rejoue = composerEnrichissement({ approuve: { hub: null, d: une.dossier }, patch: { ...p0, base_hash: hashDossier(une.dossier) } });
  assert.equal(rejoue.ok, true); assert.equal(rejoue.ajouts.length, 0); assert.equal(rejoue.apres, rejoue.base);
  const mauvais = (e) => composerEnrichissement({ approuve, patch: { ...p0, deroule_ajouts: [{ ...p0.deroule_ajouts[0], ...e }] } });
  assert.ok(mauvais({ type: 'mise_en_examen' }).refus.some((x) => /non admis/.test(x)));
  assert.ok(mauvais({ texte: 'Une réunion a eu lieu.' }).refus.some((x) => /attribué/.test(x)));
  assert.ok(mauvais({ source: { media: 'Actu.fr', url: 'https://actu.fr/y' } }).refus.some((x) => /document d'acteur/.test(x)));
  assert.ok(mauvais({ date: '2026-07', date_nature: 'approximative' }).refus.some((x) => /date d'événement complète/.test(x)));
});

// --- empreinte, mise à jour, message, rendu -----------------------------------------------------------------------------------------------------------
const candidat = composerEnrichissement({ approuve, patch: p0 }).dossier;
t('empreinte : le bloc change l’empreinte du dossier ; une mise à jour avec bloc est SUBSTANTIELLE (sinon « rien à proposer »)', () => {
  assert.notEqual(hashDossier(candidat), hashDossier(approuve.d));
  const ch = changementsFiche(approuve.d, candidat);
  assert.equal(ch.substantiel, true); assert.equal(ch.acteurs_changes, true); assert.equal(ch.acteurs_points_apres - ch.acteurs_points_avant, 25);
  assert.equal(ch.sources_nouvelles.length, 0, 'aucune source de presse nouvelle : les documents du collectif ne sont pas des sources de l’affaire');
  assert.equal(changementsFiche(candidat, candidat).substantiel, false);
});
const c = { case_id: 'FR-2026-0048', etablissement: 'Ecole maternelle Benezet', commune: 'Toulouse', statut_judiciaire: 'mise en examen', type_structure: 'maternelle', role_mis_en_cause: 'animateur périscolaire' };
const generation = { qualification: 'A_REVOIR', contrat: 'enrichissement-redige-1', modele: 'aucun', sources: [], ecartes: [], attention: [{ niveau: 'majeur', code: 'ENRICHISSEMENT_REDIGE', texte: 'Matière rédigée.' }] };
const payload = payloadFiche({ c, dossier: { hub: null, d: candidat, verifie_le: '2026-11-27' }, precedent: { hub: null, d: approuve.d }, sourcesNeon: ['https://actu.fr/x'], nbEvenements: 0, previewBase: null, generation });
t('proposition : aucune source rattachée à la mémoire ; le bloc est annoncé ; l’aperçu porte l’empreinte exacte', () => {
  assert.deepEqual(payload.page.sources_a_rattacher, []);
  assert.ok(payload.page.nouveautes.some((x) => /Acteur de terrain.*25 point/.test(x)));
  assert.equal(payload.page.mise_a_jour.acteurs_changes, true); assert.equal(payload.page.mise_a_jour.acteurs_points, 25);
  assert.match(payload.page.preview_url, new RegExp(`FR-2026-0048-${hashDossier(candidat)}\\.md$`));
});
t('message Telegram : dit ce que le bloc ajoute, « jamais présentés comme des faits » ; l’effet ne touche ni la carte ni les autres fiches', () => {
  const m = messageFiche({ ...payload, etablissement: c.etablissement, commune: c.commune });
  assert.match(m, /Acteur de terrain/); assert.match(m, /25 point\(s\) ajouté\(s\)/); assert.match(m, /jamais présentés comme des faits/);
  assert.match(m, /carte, Hubs, autres fiches : inchangés/);
});
t('rendu de revue : section « Acteur de terrain » avec l’avertissement fixe, chaque point daté de sa source, limites dites', () => {
  const md = rendreMarkdown({ c, dossier: candidat, generation: { ...generation, blocages: [], stats: { sources_pertinentes: 0 }, trace: [], hors_perimetre: [], cout: { appels: 0, usd: 0 } } }, { complet: false });
  assert.ok(md.includes('## Acteur de terrain')); assert.ok(md.includes(AVERTISSEMENT));
  assert.match(md, /Limite : Ces propos sont tirés de documents rédigés par le collectif/);
  assert.match(md, /\*\*Ce que la mairie aurait indiqué lors de la réunion\*\*/);
});
t('la page : composant unique, avertissement lu dans la constante, bloc placé après le déroulé et avant les sources, jamais dans les sources de la carte', () => {
  const f = lire('web/src/components/FicheUnique.astro'), a = lire('web/src/components/ActeurTerrain.astro');
  assert.ok(f.indexOf('<ActeurTerrain') > f.indexOf('<Chronologie') && f.indexOf('<ActeurTerrain') < f.indexOf('id="sources"'));
  assert.ok(a.includes('AVERTISSEMENT') && a.includes('GENRES'));
  assert.ok(!/case_id|FR-2026/.test(a), 'aucune branche par affaire');
  assert.ok(lire('web/src/lib/hub-matiere.ts').includes("rencontre: 'Rencontre', courrier: 'Courrier'"));
});
t('workflow : « enrichir » exige « case », saisies par variable d’environnement, jamais de publication, aperçu déposé AVANT l’envoi', () => {
  const y = lire('.github/workflows/sny-maj-fiches.yml');
  // « enrichir » exclut les autres voies (premières fiches, mises à jour, reprise ciblée « regenerer ») : une seule voie par passage.
  assert.ok(y.includes('if: ${{ inputs.enrichir == true }}') && y.includes('if: ${{ inputs.enrichir != true && inputs.regenerer != true }}') && y.includes('if: ${{ inputs.regenerer == true && inputs.enrichir != true }}'));
  assert.ok(y.includes('node scripts/enrichir-fiche.mjs "$CAS" --ecrire') && y.includes('node scripts/proposer-fiche.mjs "$CAS" --generee --ecrire'));
  assert.ok(y.includes("steps.enrichir.outputs.change == 'true'"));
  assert.ok(y.indexOf("Déposer l'aperçu sur main") < y.indexOf("Envoyer la proposition"), 'aperçu déposé avant l’envoi');
  for (const corps of y.split('run: |').slice(1)) assert.ok(!/\$\{\{ inputs\./.test(corps.split('\n      - ')[0]), 'aucune saisie dans un corps de commande');
});
console.log(`\n  ${n} contrôles : OK`);
