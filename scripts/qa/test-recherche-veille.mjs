#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-recherche-veille.mjs — requêtes de veille et échecs de recherche visibles (audit du 21/11/2026)
//
//   · le substitut « commune non précisée » ne part jamais dans la recherche ;
//   · repli sur les mots distinctifs sans guillemets : seulement quand le libellé a un nom, jamais pour un libellé anonyme ;
//   · veille exécutée pour de bon avec un FAUX fetch : échec ≠ flux vide ≠ résultats ; reprise bornée à l'échec ; disjoncteur ;
//     aucune recherche réussie → sortie non nulle.
//
// Affaires et réponses SYNTHÉTIQUES. Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requetesVeille, titreDeRepli } from '../lib/routage-veille.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let ok = 0, ko = 0;
const test = (nom, fn) => { try { fn(); ok++; console.log(`  ✔ ${nom}`); } catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); } };
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
console.log('\n  requêtes de veille et échecs de recherche\n');

test('1. substitut de commune : « commune non précisée » ne part jamais dans la requête', () => {
  const q = requetesVeille({ etablissement: 'Collège non nommé, Essonne', commune: 'commune non précisée', statut_judiciaire: 'procès' });
  vrai(!/pr[ée]cis/i.test(q.avant + q.ouverte), `placeholder envoyé : ${q.avant}`);
});
test('2. repli : mots distinctifs, sans guillemets sur le nom, commune sans arrondissement', () => {
  const q = requetesVeille({ etablissement: 'Collège-lycée Saint-Jean-de-Passy', commune: 'Paris 16e', statut_judiciaire: 'condamnation non définitive' });
  vrai(q.avant.includes('"Collège-lycée Saint-Jean-de-Passy"'), 'la requête « avant » garde le libellé exact');
  vrai(/^saint jean passy paris \(/.test(q.repli) && !/^"/.test(q.repli), `repli=${q.repli}`);
});
test('3. repli pertinent pour un centre de loisirs (mots génériques écartés)', () => {
  const q = requetesVeille({ etablissement: 'Centre de loisirs Théophile Gautier', commune: 'Courbevoie', statut_judiciaire: 'enquête' });
  vrai(/^theophile gautier courbevoie \(/.test(q.repli.normalize('NFD').replace(/[̀-ͯ]/g, '')), `repli=${q.repli}`);
});
test('4. libellé anonyme ou générique : AUCUN repli (rien de distinctif à chercher)', () => {
  vrai(requetesVeille({ etablissement: 'Collège non nommé, Essonne', commune: 'commune non précisée', statut_judiciaire: 'procès' }).repli === null, 'repli pour un nom anonyme');
  vrai(requetesVeille({ etablissement: 'Structures périscolaires de Morigny-Champigny', commune: 'Morigny-Champigny', statut_judiciaire: 'enquête' }).repli === null, 'repli pour un libellé générique');
});

test('4b. repli : un titre qui ne nomme pas l’affaire est écarté (bruit mesuré le 23/11 : « Père Jacques Hamel », « vol de carburant »)', () => {
  const q = requetesVeille({ etablissement: 'Accueil de loisirs Jardin des petits', commune: 'Sotteville-lès-Rouen', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur périscolaire' });
  vrai(!titreDeRepli('Père Jacques Hamel (1930-2016) - Église catholique en France', 'distinctif', q.repliCtx), 'bruit gardé');
  vrai(!titreDeRepli('Près de Rouen. Vol de carburant : deux individus interpellés dans une station-service', 'distinctif', q.repliCtx), 'bruit gardé');
  const p = requetesVeille({ etablissement: 'Collège-lycée Saint-Jean-de-Passy', commune: 'Paris 16e', statut_judiciaire: 'condamnation non définitive', role_mis_en_cause: 'direction' });
  vrai(titreDeRepli('Procès de l’ancien directeur de Saint-Jean-de-Passy : la peine requise - Le Monde', 'distinctif', p.repliCtx), 'titre pertinent écarté');
});
test('4c. repli commune : la commune ET le rôle dans le titre (cas FR-2026-0143) ; jamais pour Paris/Lyon/Marseille ni une commune à arrondissement', () => {
  const q = requetesVeille({ etablissement: 'Centre de loisirs Théophile Gautier', commune: 'Courbevoie', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur périscolaire' });
  vrai(/^courbevoie animateur periscolaire when:45d$/.test(q.repliCommune.normalize('NFD').replace(/[̀-ͯ]/g, '')), `repliCommune=${q.repliCommune}`);
  vrai(titreDeRepli('« Certains ne pensent plus qu’à ça » : à Courbevoie, l’angoisse des parents après la suspension d’un animateur', 'commune', q.repliCtx), 'titre pertinent écarté');
  vrai(!titreDeRepli('Courbevoie : le conseil municipal vote le budget', 'commune', q.repliCtx), 'titre sans rôle gardé');
  vrai(!titreDeRepli('Un animateur suspendu à Nanterre', 'commune', q.repliCtx), 'autre commune gardée');
  for (const commune of ['Paris 11e', 'Lyon 3e', 'Marseille 5e', 'Paris']) vrai(requetesVeille({ etablissement: 'École X', commune, statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur périscolaire' }).repliCommune === null, `repli commune pour ${commune}`);
});

// --- veille exécutée avec un faux fetch ------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'sny-veille-'));
const cases = { cases: [
  { case_id: 'T-ALPHA', etablissement: 'École Exemple Alpha', commune: 'Exemple-sur-Mer', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur', sources: [] },
  { case_id: 'T-BETA', etablissement: 'École Exemple Beta', commune: 'Exemple-sur-Mer', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur', sources: [] },
  { case_id: 'T-GAMMA', etablissement: 'École Exemple Gamma', commune: 'Exemple-sur-Mer', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur', sources: [] },
  { case_id: 'T-DELTA', etablissement: 'École Exemple Delta', commune: 'Exemple-sur-Mer', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur', sources: [] },
  { case_id: 'T-EPSILON', etablissement: 'École Exemple Epsilon', commune: 'Exemple-sur-Mer', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur', sources: [{ media: 'Presse Exemple', publication_date: '2026-11-16', url: 'https://www.example-presse.fr/epsilon' }] },
  { case_id: 'T-ZETA', etablissement: 'École Exemple Zeta', commune: 'Exemple-sur-Mer', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur', sources: [{ media: 'Presse Exemple', publication_date: '2026-11-20', url: 'https://www.example-presse.fr/zeta' }] },
] };
writeFileSync(join(dir, 'cases.json'), JSON.stringify(cases));
const lancer = (mode, extra = [], env = {}) => {
  const sortie = join(dir, `rapport-${mode}.json`);
  const r = spawnSync(process.execPath, ['--import', pathToFileURLStr(join(ROOT, 'scripts/qa/fixtures/fake-fetch-veille.mjs')), join(ROOT, 'scripts/watch-updates.mjs'), '--json', '--no-context', ...extra],
    { env: { ...process.env, ...env, SNY_FAKE_MODE: mode,SNY_WATCH_CASES: join(dir, 'cases.json'), SNY_WATCH_REPORT: sortie, SNY_DELAI_RECHERCHE_MS: '0' }, encoding: 'utf8', cwd: ROOT, timeout: 60000 });
  let rapport = null; try { rapport = JSON.parse(readFileSync(sortie, 'utf8')); } catch { /* pas de rapport */ }
  return { code: r.status, out: r.stdout + r.stderr, rapport };
};
function pathToFileURLStr(p) { return 'file:///' + p.replace(/\\/g, '/').replace(/^\//, ''); }

const mixte = lancer('mixte');
const par = (id) => mixte.rapport?.results.find((x) => x.case_id === id);
test('5. succès : résultats → etat_recherche RESULTATS, sans repli', () => {
  vrai(par('T-ALPHA')?.etat_recherche === 'RESULTATS' && par('T-ALPHA').repli === false, JSON.stringify(par('T-ALPHA')));
});
test('6. échec transitoire : UNE reprise bornée à cette affaire, puis succès', () => {
  vrai(par('T-BETA')?.etat_recherche === 'RESULTATS' && !par('T-BETA').error, JSON.stringify(par('T-BETA')));
});
test('7. flux vide aux requêtes quotées : le REPLI est utilisé et rapporte', () => {
  const g = par('T-GAMMA'); vrai(g?.repli === true && g.n_flux === 1 && g.etat_recherche === 'RESULTATS', JSON.stringify(g));
});
test('7b. recherche MAIGRE (1 article déjà cité) : le repli ramène le fait nouveau (cas FR-2026-0143)', () => {
  const e = par('T-EPSILON'); vrai(e?.repli === true && e.new_articles.length === 1 && /NOUVEAU/.test(e.new_articles[0].title), JSON.stringify(e));
});
test('7c. recherche RICHE (4 résultats) : PAS de repli — jamais un repli à chaque absence de nouveauté', () => {
  const z = par('T-ZETA'); vrai(z?.repli === false && z.n_flux === 4, JSON.stringify(z));
});
test('8. échec définitif : ERREUR consignée, jamais « rien de nouveau » ; la veille n’échoue pas pour autant (succès partiel)', () => {
  const d = par('T-DELTA'); vrai(d?.etat_recherche === 'ERREUR' && d.error && d.new_articles.length === 0, JSON.stringify(d));
  vrai(mixte.code === 0, `code de sortie ${mixte.code} en échec partiel`);
  vrai(mixte.rapport.searches_failed === 1, `searches_failed=${mixte.rapport.searches_failed}`);
});
const bas = lancer('down');
test('9. service indisponible : disjoncteur (affaires restantes « non tentées »), aucune recherche réussie → sortie 2', () => {
  vrai(bas.code === 2, `code=${bas.code}\n${bas.out.slice(-300)}`);
  vrai(bas.rapport.results.every((x) => x.etat_recherche === 'ERREUR'), 'une affaire n’est pas en ERREUR');
});
test('10. un flux vide n’est pas une erreur : etat FLUX_VIDE, compteur dédié', () => {
  const vide = lancer('mixte', []);   // T-ALPHA..DELTA ; FLUX_VIDE absent du lot mixte → vérifié par le compteur
  vrai(typeof vide.rapport.flux_vides === 'number', 'compteur flux_vides absent');
});
test('11. flux vides en rafale (limitation silencieuse type 12/10) : au-delà de 8 affaires d’affilée, DEGRADATION_SUSPECTEE (ni « rien trouvé », ni panne établie)', () => {
  const douze = { cases: Array.from({ length: 12 }, (_, i) => ({ case_id: `T-V${i}`, etablissement: `École Exemple Vide${i}`, commune: 'Exemple-sur-Mer', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur', sources: [] })) };
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(douze));
  const compte = join(dir, 'compte-vide.json');
  const v = lancer('vide', [], { SNY_FAKE_COMPTE: compte });
  const etats = v.rapport.results.map((x) => x.etat_recherche);
  vrai(etats.filter((e) => e === 'FLUX_VIDE').length === 8 && etats.filter((e) => e === 'DEGRADATION_SUSPECTEE').length === 4 && !etats.includes('ERREUR'), JSON.stringify(etats));
  // Quatre états DISTINCTS dans le rapport : les 8 premiers flux vides sont des tentatives RÉUSSIES (« rien trouvé »), jamais comptés comme échecs ; la suspicion n'est pas une erreur technique.
  vrai(v.rapport.flux_vides === 8 && v.rapport.degradations_suspectees === 4 && v.rapport.searches_failed === 0, JSON.stringify({ f: v.rapport.flux_vides, d: v.rapport.degradations_suspectees, e: v.rapport.searches_failed }));
  // La rafale ARRÊTE la veille (les affaires restantes ne sont pas cherchées) et le passage sort INCOMPLET (code 3) : le jour n'est pas consigné, un créneau suivant reprend.
  vrai(v.code === 3, `code ${v.code} : une rafale de flux vides est un passage incomplet`);
  // Pas de repli pendant la rafale : 3 affaires × 4 requêtes (avant, ouverte, 2 replis) puis 6 × 2 requêtes ; la 9e déclenche l'arrêt. Avant correction : 60 requêtes pour 20 affaires.
  const { total } = JSON.parse(readFileSync(compte, 'utf8'));
  vrai(total <= 26, `${total} requêtes pour 9 affaires cherchées`);
});
test('11b. service qui se dégrade (1 affaire OK puis 503) : disjoncteur, code 3 (passage incomplet) et non 0', () => {
  const dix = { cases: Array.from({ length: 10 }, (_, i) => ({ case_id: `T-A${i}`, etablissement: `École Exemple ${i === 0 ? 'Alpha' : 'Omega' + i}`, commune: 'Exemple-sur-Mer', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur', sources: [] })) };
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(dix));
  const v = lancer('ok-puis-503');
  vrai(v.code === 3, `code ${v.code} : 9 recherches sur 10 en échec ne sont pas un passage valide`);
  vrai(v.rapport.results[0].etat_recherche === 'RESULTATS' && v.rapport.results.slice(1).every((x) => x.etat_recherche === 'ERREUR'), 'états inattendus');
  vrai(/passage incomplet/.test(v.out), 'le passage incomplet n’est pas dit dans la sortie');
});
test('11c. --cases sans valeur, vide ou mal formé : erreur explicite (jamais un lot vide silencieux ni un TypeError)', () => {
  for (const extra of [['--cases'], ['--cases', '--no-context'], ['--cases', ' , '], ['--cases', 'T-ALPHA;rm -rf']]) {
    const v = lancer('mixte', extra);
    vrai(v.code === 1 && /--cases attend/.test(v.out) && !/TypeError/.test(v.out), `${extra.join(' ')} → code ${v.code}\n${v.out.slice(-200)}`);
  }
});
test('11d. repli commune : jamais sur un rôle générique (« autre », « tiers »), et seul un titre qui DIT une affaire est gardé', () => {
  for (const role of ['autre', 'tiers', 'parent', 'direction']) vrai(requetesVeille({ etablissement: 'École X', commune: 'Bordeaux', statut_judiciaire: 'enquête', role_mis_en_cause: role }).repliCommune === null, `repli pour le rôle « ${role} »`);
  const q = requetesVeille({ etablissement: 'École X', commune: 'Courbevoie', statut_judiciaire: 'enquête', role_mis_en_cause: 'animateur périscolaire' });
  vrai(!titreDeRepli('Les animateurs de Courbevoie en grève', 'commune', q.repliCtx), 'grève prise pour l’affaire');
  vrai(!titreDeRepli('Courbevoie : un animateur recrute pour la rentrée', 'commune', q.repliCtx), 'offre d’emploi prise pour l’affaire');
  vrai(titreDeRepli('À Courbevoie, un animateur périscolaire suspendu après une plainte', 'commune', q.repliCtx), 'vrai titre écarté');
});
test('12. lot BORNÉ (--cases) : seules les affaires nommées sont cherchées, une affaire hors stock n’est jamais ajoutée', () => {
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(cases));
  const b = lancer('mixte', ['--cases', 'T-ALPHA,T-ZETA,T-INCONNUE']);
  const ids = b.rapport.results.map((x) => x.case_id).sort().join(',');
  vrai(ids === 'T-ALPHA,T-ZETA', `affaires cherchées : ${ids}`);
});
rmSync(dir, { recursive: true, force: true });

console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
