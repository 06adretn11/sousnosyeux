// UNE RELECTURE ENRICHIT LES ACQUIS, ELLE NE LES REMPLACE PAS (défaut du 06/11/2026 : des mises à jour de fiches proposaient d'effacer des sources, étapes et positions validées).
// Aucun réseau, aucun Neon, aucun modèle : données synthétiques + rejeu des aperçus RÉELS figés (fixtures/maintenance-sans-perte/).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conserverAcquis, comparerEtapes, urlsReferences } from '../lib/fiche-acquis.mjs';
import { changementsFiche, payloadFiche, hashDossier, urlsDe } from '../lib/fiche-page.mjs';
import { messageFiche } from '../lib/discovery-messages.mjs';
import { decider } from '../lib/promouvoir-fiche.mjs';
import { extraireReactions } from '../lib/evenement-institutionnel.mjs';
import { qualifier, typeCorrige } from '../lib/fiche-composer.mjs';
import { apercuVersDossier } from './lib/apercu-vers-dossier.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const U = (k) => `https://media-${k}.example/article-${k}`;
const ref = (k, media = `Média ${k}`, d = '2026-01-10') => ({ media, url: U(k), publie_le: d, acces: 'libre' });
const etape = (type, date, texte, k, extra = {}) => ({ date, date_nature: date ? 'evenement' : 'article', type, acteur: null, texte, source: ref(k), ...extra });
const lue = (k, o = {}) => ({ url: U(k), media: `Média ${k}`, acces: 'libre', pertinence: 'CETTE_AFFAIRE', ...o });
const inaccessible = (k, motif = 'HTTP 402') => ({ url: U(k), media: `Média ${k}`, acces: 'inaccessible', motif });

const SIT = (titre, suite) => ({ decision: { label: 'Décision', titre, cat: 'red', texte: `Selon Média A, ${titre}.` }, suite: { label: 'Suite · recours', titre: suite, cat: 'blue' } });
const APPROUVE = {
  etat_actuel: ['Selon Média A, un animateur a été condamné le 22 janvier 2026.', 'Un appel est rapporté (Média B) : la décision n’est pas définitive.'], appel: true,
  deroule: [
    etape('mise_en_examen', '2025-03-14', 'Selon le parquet, un animateur du périscolaire a été mis en examen le 14 mars 2025 pour agressions sexuelles.', 'a'),
    etape('decision', '2026-01-22', 'Selon Média A, le tribunal correctionnel a condamné l’animateur le 22 janvier 2026 à six ans de prison ferme.', 'a', { sources_complementaires: [ref('b', 'Média B')] }),
    etape('decision', '2026-04-23', 'Selon Média B, l’animateur a été libéré et placé sous contrôle judiciaire le 23 avril 2026 en attendant son procès en appel.', 'b'),
    etape('appel', null, 'Selon Média B, l’animateur a fait appel de sa condamnation, le procès en appel étant programmé en novembre.', 'b'),
  ],
  inconnues: ['Le caractère définitif de la décision n’est pas documenté.'], reactions: [], statut_affiche: 'condamnation non définitive',
  situation: SIT('Condamnation', 'Appel rapporté'),
};
const clone = (o) => JSON.parse(JSON.stringify(o));

t('source précédemment étayée devenue illisible (402) ou absente de la sélection : étapes, sources et faits conservés, aucune relecture prétendue', () => {
  // La relecture n'a pu lire que Média A (reformulé) ; Média B est payant (402) ; l'appel et la libération ne sont donc pas ressortis.
  const candidat = { ...clone(APPROUVE), deroule: [APPROUVE.deroule[0], { ...APPROUVE.deroule[1], texte: 'Selon Média A, le tribunal a condamné l’animateur le 22 janvier 2026 à six ans de prison ferme.', sources_complementaires: undefined }], situation: SIT('Condamnation', 'Aucun appel rapporté'), appel: false, etat_actuel: ['Selon Média A, un animateur a été condamné.'] };
  const m = conserverAcquis({ precedent: APPROUVE, candidat, sources: [lue('a'), inaccessible('b')], noms: [] });
  const urls = urlsReferences(m.dossier.deroule);
  assert.ok(urls.includes(U('b')), 'la source illisible reste citée');
  assert.equal(m.dossier.deroule.length, 4, 'aucune étape perdue');
  assert.equal(m.journal.retirees.length, 0);
  assert.deepEqual(m.journal.non_relues.map((s) => s.url).sort(), [U('b')]);
  assert.match(m.journal.non_relues[0].motif, /402/);                       // dit « non relue », jamais « relue »
  assert.ok(m.journal.conservees.every((x) => x.raison === 'NON_RELUE'));
  const ch = changementsFiche(APPROUVE, m.dossier);
  assert.equal(ch.retirees.length, 0); assert.equal(ch.sources_retirees.length, 0); assert.equal(ch.substantiel, false);
  assert.equal(hashDossier(m.dossier), hashDossier(APPROUVE), 'rien d’éditorial de nouveau : empreinte inchangée, aucune nouvelle demande de GO');
  // source absente de la sélection (jamais rencontrée à ce passage) : même résultat, motif distinct
  const m2 = conserverAcquis({ precedent: APPROUVE, candidat, sources: [lue('a')], noms: [] });
  assert.match(m2.journal.non_relues[0].motif, /absente de la sélection/);
});

t('nouvelle source + reformulation : enrichissement sans faux retrait ni doublon ; la source devenue secondaire n’est pas « retirée »', () => {
  const candidat = { ...clone(APPROUVE), deroule: [
    etape('mise_en_examen', '2025-03-14', 'Selon le parquet, un animateur du périscolaire a été mis en examen le 14 mars 2025 pour agressions sexuelles.', 'a'),
    // même fait (22/01), formulation plus complète portée par une NOUVELLE source C, qui devient la référence principale
    etape('decision', '2026-01-22', 'Selon Média C, le tribunal correctionnel a condamné l’animateur le 22 janvier 2026 à six ans de prison ferme, avec interdiction définitive d’exercer auprès de mineurs.', 'c', { sources_complementaires: [ref('a', 'Média A')] }),
  ] };
  const m = conserverAcquis({ precedent: APPROUVE, candidat, sources: [lue('a'), lue('b'), lue('c')], noms: [] });
  const condamnation = m.dossier.deroule.filter((e) => e.type === 'decision' && e.date === '2026-01-22');
  assert.equal(condamnation.length, 1, 'un seul fait, pas de doublon');
  assert.equal(condamnation[0].source.url, U('c'));
  assert.deepEqual(urlsReferences(condamnation).sort(), [U('a'), U('b'), U('c')].sort(), 'toutes les références restent consultables');
  assert.equal(m.journal.enrichies.length, 1);
  const ch = changementsFiche(APPROUVE, m.dossier);
  assert.equal(ch.retirees.length, 0); assert.equal(ch.ajoutees.length, 0);
  assert.deepEqual(ch.sources_nouvelles.map((s) => s.url), [U('c')]); assert.equal(ch.sources_retirees.length, 0);
  assert.ok(ch.devenues_secondaires.length === 1 && ch.devenues_secondaires[0].url === U('a'));
  // l'ancien calcul (source principale seule) annonçait « Média A retirée » : urlsDe compte désormais les références complémentaires
  assert.ok(urlsDe(m.dossier).some((s) => s.url === U('a')));
});

t('appel et contrôle judiciaire déjà étayés : pas de régression, pas de « définitif » déduit d’une absence d’article', () => {
  const candidat = { ...clone(APPROUVE), deroule: [APPROUVE.deroule[0], APPROUVE.deroule[1]], situation: SIT('Condamnation', 'Aucun appel rapporté'), appel: false,
    etat_actuel: ['Selon Média A, un animateur a été condamné le 22 janvier 2026.', 'Appel et caractère définitif non documentés.'] };
  const m = conserverAcquis({ precedent: APPROUVE, candidat, sources: [lue('a'), inaccessible('b', 'HTTP 403')], noms: [] });
  assert.ok(m.dossier.deroule.some((e) => e.type === 'appel'), 'l’appel reste');
  assert.ok(m.dossier.deroule.some((e) => e.type === 'decision' && e.date === '2026-04-23' && /contrôle judiciaire/.test(e.texte)), 'la libération sous contrôle judiciaire reste, avec sa date');
  assert.equal(m.dossier.appel, true);
  assert.equal(m.dossier.situation.suite.titre, 'Appel rapporté');
  assert.ok(!JSON.stringify(m.dossier).includes('devenue définitive'));
  // contradiction : la relecture rapporte « définitif », la version approuvée un appel → jamais tranché automatiquement
  const c2 = { ...clone(APPROUVE), situation: SIT('Condamnation', 'Décision devenue définitive'), appel: false };
  const m2 = conserverAcquis({ precedent: APPROUVE, candidat: c2, sources: [lue('a'), lue('b')], noms: [] });
  assert.equal(m2.dossier.situation.suite.titre, 'Appel rapporté');
  assert.ok(m2.attention.some((a) => a.code === 'SUITE_CONTRADICTOIRE' && a.niveau === 'majeur'));
  assert.equal(qualifier({ blocages: [], attention: m2.attention, etapes: 4, reactions: 0 }), 'A_REVOIR', 'une contradiction empêche READY');
  // appel NOUVEAU rapporté par la relecture : l'information gagne (suite candidate), sans effacer le reste
  const sansAppel = { ...clone(APPROUVE), deroule: APPROUVE.deroule.slice(0, 3), situation: SIT('Condamnation', 'Aucun appel rapporté'), appel: false, etat_actuel: ['Selon Média A, un animateur a été condamné.'] };
  const c3 = { ...clone(APPROUVE), deroule: [...sansAppel.deroule, etape('appel', null, 'Selon Média D, l’animateur a fait appel de sa condamnation à six ans de prison ferme.', 'd')], situation: SIT('Condamnation', 'Appel rapporté'), appel: true };
  const m3 = conserverAcquis({ precedent: sansAppel, candidat: c3, sources: [lue('a'), lue('b'), lue('d')], noms: [] });
  assert.equal(m3.dossier.situation.suite.titre, 'Appel rapporté'); assert.equal(m3.dossier.appel, true);
  assert.ok(m3.dossier.deroule.some((e) => e.type === 'appel'));
});

t('protection d’une personne ou correction justifiée : l’élément sensible n’est pas ressuscité par la fusion, et le retrait est motivé et visible', () => {
  const sensible = { ...clone(APPROUVE), deroule: [...clone(APPROUVE).deroule, etape('fait_rapporte', null, 'Selon Média E, une fillette de 4 ans a raconté les faits.', 'e'), etape('mise_en_examen', '2025-05-02', 'Selon Média E, Jean Dupont a été mis en examen le 2 mai 2025.', 'e')] };
  const candidat = clone(APPROUVE);
  const m = conserverAcquis({ precedent: sensible, candidat, sources: [lue('a'), lue('e')], noms: ['Jean Dupont'] });
  assert.equal(m.journal.retirees.length, 2);
  assert.ok(m.journal.retirees.every((r) => /^GARDE_SENSIBILITE/.test(r.motif)));
  assert.ok(m.attention.some((a) => a.code === 'ETAPE_APPROUVEE_RETIREE_SENSIBLE' && a.niveau === 'majeur'));
  assert.ok(!/Dupont|fillette de 4 ans/.test(JSON.stringify(m.dossier)));
  // rejeu : la version corrigée devient la version approuvée ; la relecture suivante ne ramène rien
  const m2 = conserverAcquis({ precedent: m.dossier, candidat, sources: [lue('a'), lue('e')], noms: ['Jean Dupont'] });
  assert.ok(!/Dupont|fillette de 4 ans/.test(JSON.stringify(m2.dossier))); assert.equal(m2.journal.retirees.length, 0);
});

t('même établissement, deux affaires : aucun fait n’est transféré de l’une à l’autre (types et dates distincts ne s’apparient pas) ; « cette procédure » sans désigner une affaire ne rattache rien', () => {
  const animateur = { deroule: [etape('renvoi', '2026-06-02', 'Selon Média A, un animateur de l’école a été renvoyé devant le tribunal correctionnel le 2 juin 2026.', 'a')] };
  const professeur = { deroule: [etape('garde_a_vue', '2026-03-20', 'Selon Média A, un professeur de l’école a été placé en garde à vue le 20 mars 2026.', 'a')] };
  assert.equal(comparerEtapes(animateur.deroule, professeur.deroule).paires.length, 0);
  const m = conserverAcquis({ precedent: animateur, candidat: professeur, sources: [lue('a')], noms: [] });
  assert.equal(m.dossier.deroule.length, 2, 'les deux faits coexistent : ni fusion, ni perte');
  assert.ok(m.dossier.deroule.some((e) => e.type === 'renvoi'));
  // lien à la procédure : refusé s'il y a des affaires sœurs au même établissement (cas Aqueduc)
  const B = 'Le collectif #MeTooEcole, fondé après cette affaire, a manifesté devant le tribunal de Paris vers 12 h 30, en soutien « aux petites victimes et aux familles » qui subissent cette procédure.';
  const o = { etablissement: 'École maternelle Alphonse-Baudin', anneeRef: '2026-05-27', autres: [], lieAffaire: true, commune: 'Paris 11e' };
  assert.equal(extraireReactions(B, o)[0].portee, 'établissement');
  assert.equal(extraireReactions(B, { ...o, soeursMemeEtablissement: true })[0].portee, 'territoire');
});

t('fait territorial (cas Alphonse-Baudin) : le libellé correspond à la preuve, rien n’est inventé, le territoire et la portée sont justifiés', () => {
  const o = { etablissement: 'École maternelle Alphonse-Baudin', anneeRef: '2026-05-27', autres: [], lieAffaire: true, commune: 'Paris 11e' };
  const A = 'La révélation de cette affaire a marqué le début de la mobilisation des parents d’élèves sur les problèmes du périscolaire et déclenché une cascade de signalements à travers Paris.';
  const [a] = extraireReactions(A, o);
  assert.equal(a.mesure, 'mobilisation'); assert.notEqual(a.mesure, 'rassemblement');
  assert.equal(a.libelle_public, 'Selon la presse, des parents se sont mobilisés.');
  assert.ok(!/rassemblement/.test(a.libelle_public) && !/annoncé/.test(a.libelle_public));
  assert.equal(a.realisation, 'réalisée'); assert.equal(a.event_date, null); assert.equal(a.event_period, null, 'la date de parution n’est jamais la date de l’événement');
  assert.equal(a.territoire, 'Paris'); assert.equal(a.portee, 'territoire'); assert.equal(a.lien, 'origine');
  const B = 'Le collectif #MeTooEcole, fondé après cette affaire, a manifesté devant le tribunal de Paris vers 12 h 30, en soutien « aux petites victimes et aux familles » qui subissent cette procédure.';
  const [b] = extraireReactions(B, o);
  assert.equal(b.mesure, 'rassemblement'); assert.equal(b.realisation, 'réalisée', '« a manifesté » est un fait accompli, pas un rassemblement annoncé');
  assert.equal(b.libelle_public, 'Selon la presse, un collectif ou une association a tenu un rassemblement.');
  assert.equal(b.portee, 'établissement'); assert.equal(b.lien, 'procédure'); assert.equal(b.territoire, 'Paris'); assert.equal(b.event_date, null);
  // une mobilisation annoncée reste annoncée ; « mobilisation » seul n'est jamais un rassemblement
  const [c] = extraireReactions('Les parents d’élèves annoncent une mobilisation devant l’école samedi prochain.', { ...o, anneeRef: '2026-05-20' });
  assert.ok(c && c.realisation === 'annoncée');
});

t('proposition ancienne, empreinte et clic : une mise à jour n’est promue que sur la version dont elle est partie ; un ancien bouton ne peut ni approuver un autre contenu ni écraser une version plus récente', () => {
  const V1 = { deroule: [etape('plainte', null, 'Selon Média A, des familles ont porté plainte.', 'a')], inconnues: [] };
  const V2 = { ...V1, deroule: [...V1.deroule, etape('audience', '2026-02-01', 'Selon Média B, l’audience s’est tenue le 1er février 2026.', 'b')] };
  const V2bis = { ...V1, deroule: [...V1.deroule, etape('audience', '2026-02-01', 'Selon Média C, une audience s’est tenue le 1er février 2026 devant le tribunal.', 'c')] };
  const approb = (d, id8) => ({ reviewed_by: 'Adrien (Telegram, fiche)', decision: 'validé', comment: `[Fiche approuvée ${id8}] FR-X-0001 hash=${hashDossier(d)}` });
  const base = { id: 'FR-X-0001', cases: [{ case_id: 'FR-X-0001' }], holds: new Set(), hubs: [] };
  // V2 approuvée et promue ; V2bis (autre proposition, partie de V1) approuvée ensuite → refus : elle écraserait V2 sans la contenir
  const r1 = decider({ ...base, generee: { d: V2bis, proposable: true, precedent_hash: hashDossier(V1) }, revues: [approb(V1, 'aaaaaaaa'), approb(V2, 'bbbbbbbb'), approb(V2bis, 'cccccccc')], isoles: { dossiers: { 'FR-X-0001': V2 } } });
  assert.equal(r1.ok, false); assert.equal(r1.motif, 'BASE_PERIMEE');
  // la même mise à jour sur SA base : promue
  const r2 = decider({ ...base, generee: { d: V2, proposable: true, precedent_hash: hashDossier(V1) }, revues: [approb(V1, 'aaaaaaaa'), approb(V2, 'bbbbbbbb')], isoles: { dossiers: { 'FR-X-0001': V1 } } });
  assert.equal(r2.ok, true); assert.equal(r2.remplace, hashDossier(V1));
  // sans approbation de CETTE empreinte : refus (une approbation ne vaut que pour l'empreinte qu'elle porte)
  const r3 = decider({ ...base, generee: { d: V2bis, proposable: true, precedent_hash: hashDossier(V1) }, revues: [approb(V1, 'aaaaaaaa'), approb(V2, 'bbbbbbbb')], isoles: { dossiers: { 'FR-X-0001': V1 } } });
  assert.equal(r3.ok, false); assert.equal(r3.motif, 'EMPREINTE_APPROUVEE_DIFFERENTE');
  // envoi : une proposition de mise à jour périmée n'est jamais envoyée ; la clé de proposition porte l'empreinte
  assert.match(src('scripts/telegram-v0.mjs'), /mise_a_jour\?\.precedent_hash[\s\S]{0,200}proposition de mise à jour périmée/);
  assert.match(src('scripts/lib/fiche-page.mjs'), /`fiche\|\$\{case_id\}`/);
  assert.match(src('scripts/proposer-fiche.mjs'), /cleDedupFiche\(id\)\}\|\$\{hashDossier\(dossier\.d\)\}/);
  // une décision déjà prise (REVIEW compris) rend l'ancien bouton inerte : jamais réécrite (clause decision is null)
  assert.match(src('scripts/telegram-v0.mjs'), /where proposal_id = \$\{pr\.pid\}::uuid and decision is null/);
});

t('rejeu identique et projection finale : stabilité éditoriale, aucune nouvelle demande de GO ; les références complémentaires restent consultables sur la page', () => {
  const candidat = { ...clone(APPROUVE), deroule: [APPROUVE.deroule[0], etape('decision', '2026-01-22', 'Selon Média C, le tribunal correctionnel a condamné l’animateur le 22 janvier 2026 à six ans de prison ferme, avec interdiction définitive d’exercer auprès de mineurs.', 'c')] };
  const s = [lue('a'), lue('b'), lue('c')];
  const m1 = conserverAcquis({ precedent: APPROUVE, candidat, sources: s, noms: [] });
  assert.equal(m1.journal.inchange, false);
  // la version fusionnée devient la version approuvée ; le MÊME passage rejoué n'apporte plus rien
  const m2 = conserverAcquis({ precedent: m1.dossier, candidat, sources: s, noms: [] });
  assert.equal(m2.journal.inchange, true); assert.equal(hashDossier(m2.dossier), hashDossier(m1.dossier));
  assert.equal(changementsFiche(m1.dossier, m2.dossier).substantiel, false);
  // un passage dont les sources ne sont plus lisibles ne change rien non plus
  const m3 = conserverAcquis({ precedent: m1.dossier, candidat, sources: [inaccessible('a'), inaccessible('b'), inaccessible('c')], noms: [] });
  assert.equal(hashDossier(m3.dossier), hashDossier(m1.dossier));
  // projection : la page publique affiche les références complémentaires (chronologie + liste des sources)
  assert.match(src('web/src/components/Chronologie.astro'), /sources_complementaires/);
  assert.match(src('web/src/components/FicheUnique.astro'), /sources_complementaires/);
  assert.match(src('scripts/lib/fiche-page.mjs'), /sources_complementaires/);
});

t('demande de parents ≠ mesure : une demande étiquetée « mesure » redevient un fait rapporté (pas de « mesure annoncée », pas de doublon)', () => {
  assert.equal(typeCorrige({ type: 'mesure_etablissement', acteur: 'parents d’élèves de l’école maternelle Alexandre Copello' }), 'fait_rapporte');
  assert.equal(typeCorrige({ type: 'mesure_collectivite', acteur: 'mairie de Marseille' }), 'mesure_collectivite');
  assert.equal(typeCorrige({ type: 'mesure_etablissement', acteur: 'Éducation nationale et mairie de Marseille' }), 'mesure_etablissement');
});

t('message Telegram : retraits et points à trancher en tête (jamais tronqués), ajouts résumés, références et sources non relues dites, effet concret de l’approbation, lien attaché à l’empreinte', () => {
  const c = { case_id: 'FR-X-0001', commune: 'Ville-Test', etablissement: 'École Test', statut_judiciaire: 'condamnation non définitive' };
  const grande = (k) => Array.from({ length: 14 }, (_, i) => etape('contexte', `2026-03-${String(i + 1).padStart(2, '0')}`, `Selon Média ${k}, un fait distinct numéro ${i + 1} a été rapporté avec assez de mots pour occuper la place disponible dans le message envoyé.`, k));
  const candidat = { ...clone(APPROUVE), deroule: [...APPROUVE.deroule, ...grande('f')] };
  const precedentSensible = { ...clone(APPROUVE), deroule: [...APPROUVE.deroule, etape('fait_rapporte', null, 'Selon Média E, une fillette de 4 ans a raconté les faits.', 'e')] };
  const m = conserverAcquis({ precedent: precedentSensible, candidat, sources: [lue('a'), inaccessible('b'), lue('f'), lue('e')], noms: [] });
  const generation = { qualification: 'A_REVOIR', contrat: 'x', modele: 'm', genere_le: '2026-11-06', blocages: [], attention: m.attention, ecartes: [], sources: [lue('a'), inaccessible('b'), lue('f')], acquis: { ...m.journal, precedent_hash: hashDossier(precedentSensible) } };
  const p = payloadFiche({ c, dossier: { hub: null, d: m.dossier, verifie_le: '2026-11-06' }, sourcesNeon: [U('a')], nbEvenements: 0, previewBase: null, generation, precedent: { hub: null, d: precedentSensible } });
  const msg = messageFiche(p);
  assert.ok(msg.length <= 4096, `message trop long (${msg.length})`);
  assert.match(msg, /Retiré ou à trancher/); assert.match(msg, /Motif : GARDE_SENSIBILITE/);
  assert.ok(msg.indexOf('Retiré ou à trancher') < msg.indexOf('Ajouté'), 'les retraits précèdent les ajouts');
  assert.match(msg, /autre\(s\) : voir l’aperçu complet/);
  assert.match(msg, /non relues à ce passage \(aucune relecture n’est prétendue\) : Média B \(HTTP 402\)/);
  assert.match(msg, /Effet de l’approbation[\s\S]*page \/affaires\/fr-x-0001\//);
  assert.match(p.page.preview_url, new RegExp(`/versions/FR-X-0001-${hashDossier(m.dossier)}\\.md$`), 'le lien désigne la version exacte (empreinte dans le nom)');
  assert.match(msg, new RegExp(`CETTE version \\(empreinte ${hashDossier(m.dossier)}\\)`));
  // aucune perte : le message le dit, sans « retiré » mensonger
  const sansPerte = payloadFiche({ c, dossier: { hub: null, d: { ...clone(APPROUVE), deroule: [...APPROUVE.deroule, etape('audience', '2026-06-01', 'Selon Média G, l’audience d’appel s’est tenue le 1er juin 2026.', 'g')] }, verifie_le: 'x' }, sourcesNeon: [], nbEvenements: 0, previewBase: null, generation: { ...generation, acquis: { ...m.journal, retirees: [], non_relues: [], conservees: [], references_ajoutees: [], precedent_hash: hashDossier(APPROUVE) }, attention: [] }, precedent: { hub: null, d: APPROUVE } });
  assert.match(messageFiche(sansPerte), /Aucune étape, source ni position de la version approuvée n’est retirée/);
  // fiche d'un Hub : l'effet réel est dit (aucune page modifiée automatiquement)
  const hub = payloadFiche({ c, dossier: { hub: null, d: m.dossier, verifie_le: 'x' }, sourcesNeon: [], nbEvenements: 0, previewBase: null, generation, precedent: { hub: 'paris-11e', d: APPROUVE }, hubTitre: 'Paris 11e' });
  assert.match(messageFiche(hub), /ne modifie AUCUNE page automatiquement/);
});

t('qualification : une perte inexpliquée, une contradiction ou un appariement ambigu empêchent READY ; une relecture sans apport rend la version approuvée', () => {
  assert.equal(qualifier({ blocages: [], attention: [{ niveau: 'majeur', code: 'APPARIEMENT_AMBIGU', texte: '' }], etapes: 5, reactions: 0 }), 'A_REVOIR');
  assert.equal(qualifier({ blocages: [], attention: [{ niveau: 'mineur', code: 'ETAPES_APPROUVEES_CONSERVEES', texte: '' }], etapes: 5, reactions: 0 }), 'READY');
  const m = conserverAcquis({ precedent: APPROUVE, candidat: clone(APPROUVE), sources: [lue('a'), lue('b')], noms: [] });
  assert.equal(m.journal.inchange, true); assert.equal(hashDossier(m.dossier), hashDossier(APPROUVE));
  // dates : la date d'événement déjà étayée ne régresse pas quand la relecture ne la restitue pas ; la parution n'est jamais la date de l'événement
  const sansDate = { ...clone(APPROUVE), deroule: APPROUVE.deroule.map((e) => ({ ...e, date: null, date_nature: 'article' })) };
  const m2 = conserverAcquis({ precedent: APPROUVE, candidat: sansDate, sources: [lue('a'), lue('b')], noms: [] });
  assert.deepEqual(m2.dossier.deroule.map((e) => e.date), APPROUVE.deroule.map((e) => e.date));
  assert.ok(m2.dossier.deroule.every((e, i) => e.date_nature === APPROUVE.deroule[i].date_nature));
  // date divergente : conservée telle quelle et signalée (contradiction non tranchée)
  const autreDate = { ...clone(APPROUVE), deroule: [APPROUVE.deroule[0], { ...APPROUVE.deroule[1], date: '2026-02-05' }] };
  const m3 = conserverAcquis({ precedent: APPROUVE, candidat: autreDate, sources: [lue('a'), lue('b')], noms: [] });
  assert.equal(m3.dossier.deroule.find((e) => /condamné l’animateur le 22 janvier/.test(e.texte))?.date, '2026-01-22');
  assert.ok(m3.attention.some((a) => a.code === 'DATE_DIVERGENTE_APRES_RELECTURE'));
});

// ---- rejeu des VRAIS cas (aperçus de candidate figés, versions approuvées figées) ---------------------------------------------------------------------------------
const FIXTURES = ['FR-2026-0002', 'FR-2026-0001', 'FR-2026-0047', 'FR-2026-0045', 'FR-2026-0046', 'FR-2026-0005', 'POC-07', 'FR-2026-0113'];
const reel = (id) => {
  const dir = new URL('../../fixtures/maintenance-sans-perte/', import.meta.url);
  const A = JSON.parse(readFileSync(new URL(`${id}.approuve.json`, dir), 'utf8'));
  const ap = apercuVersDossier(readFileSync(new URL(`${id}.apercu.md`, dir), 'utf8'));
  return { A, ap, m: conserverAcquis({ precedent: A, candidat: ap.dossier, sources: ap.sources, noms: [] }) };
};
t('cas réels (6 fiches signalées + 2 autres en attente) : aucune étape, source ni position approuvée n’est plus retirée ; aucune date d’événement ne régresse', () => {
  for (const id of FIXTURES) {
    const { A, ap, m } = reel(id);
    const avant = changementsFiche(A, ap.dossier), apres = changementsFiche(A, m.dossier);
    assert.equal(apres.retirees.length, 0, `${id} : retraits`); assert.equal(apres.sources_retirees.length, 0, `${id} : sources retirées`); assert.equal(apres.reactions_retirees, 0, `${id} : positions retirées`);
    assert.ok(avant.retirees.length + avant.sources_retirees.length > 0 || id === 'FR-2026-0002', `${id} : le défaut d'origine est bien reproduit sans fusion`);
    for (const e of A.deroule.filter((x) => x.date && x.date_nature === 'evenement')) assert.ok(m.dossier.deroule.some((x) => x.date === e.date), `${id} : date ${e.date} conservée`);
    for (const e of A.deroule) assert.ok(urlsReferences(m.dossier.deroule).includes(urlsReferences([e])[0]), `${id} : référence principale conservée`);
  }
});
t('cas réel FR-2026-0002 (Aqueduc, enseignant) : la relecture ne retrouve ni Le Monde (402) ni Le Parisien (403) ni la garde à vue ; la version approuvée reste intacte, rien n’est proposé', () => {
  const { A, m } = reel('FR-2026-0002');
  assert.equal(hashDossier(m.dossier), hashDossier(A));
  assert.equal(changementsFiche(A, m.dossier).substantiel, false);
  assert.ok(urlsReferences(m.dossier.deroule).some((u) => /lemonde\.fr/.test(u)) && urlsReferences(m.dossier.deroule).some((u) => /leparisien\.fr/.test(u)));
  assert.equal(m.dossier.situation.decision.titre, 'Enquête');                                   // l'état « garde à vue » n'est pas perdu
});
t('cas réel FR-2026-0046 (Rezé) : libération sous contrôle judiciaire et préparation de l’appel conservées ; l’interpellation du 14 mars 2019 n’est ni ajoutée ni retirée ; l’appel rapporté par la relecture est repris ; la source jugée d’une autre affaire est à trancher, pas effacée', () => {
  const { A, ap, m } = reel('FR-2026-0046');
  assert.ok(m.dossier.deroule.some((e) => e.date === '2026-04-23' && /contrôle judiciaire/.test(e.texte)));
  assert.ok(m.dossier.deroule.some((e) => /procès en appel/.test(e.texte)));
  const ch = changementsFiche(A, m.dossier);
  assert.ok(![...ch.ajoutees, ...ch.retirees].some((e) => /14 mars 2019/.test(e.texte)));
  assert.equal(m.dossier.situation.suite.titre, 'Appel rapporté');
  assert.ok(m.attention.some((a) => a.code === 'SOURCE_RELUE_AUTRE_AFFAIRE' && a.niveau === 'majeur'));
  assert.equal(qualifier({ blocages: [], attention: m.attention, etapes: m.dossier.deroule.length, reactions: 0 }), 'A_REVOIR');
  assert.ok(ap.dossier.deroule.length < m.dossier.deroule.length);
});
t('cas réel FR-2026-0047 (Copello) : Radio France reste une référence (secondaire), les dates ne se perdent pas, les demandes de parents ne se dédoublent pas', () => {
  const { A, m } = reel('FR-2026-0047');
  assert.ok(urlsReferences(m.dossier.deroule).some((u) => /radiofrance\.fr/.test(u)));
  const controle = m.dossier.deroule.filter((e) => /contrôle judiciaire/.test(e.texte) && e.date === '2025-09-18');
  assert.equal(controle.length, 1, 'le contrôle judiciaire garde sa date');
  assert.equal(m.dossier.situation.decision.titre, 'Condamnation'); assert.equal(A.situation.decision.titre, 'Condamnation');
  assert.equal(m.dossier.deroule.filter((e) => /parents d'élèves .*demandent la mise en place de procédures claires/.test(e.texte)).length, 1, 'une seule demande, jamais « mesure annoncée »');
});

console.log(`\n${n} contrôles acquis (relecture ≠ effacement) : OK`);
