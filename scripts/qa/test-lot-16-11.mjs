// Lot du 16/11/2026 : accusé de réception d'une approbation de page d'affaire DÉJÀ publique, et mise à jour décidable d'un Hub déjà publié (demande « ENRICHIR_HUB »).
// Aucun réseau, aucune base, aucune approbation réelle : fonctions pures et lecture du code des workflows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accuseVersion, decoderCallback, boutonValable } from '../lib/telegram-clics.mjs';
import { changementsHub, aProposer, blocMiseAJour, diffCourt } from '../lib/hub-maj.mjs';
import { composerMatiereHub, payloadPublication, hashMatiere } from '../lib/hub-publication.mjs';
import { boutons, messageDecision } from '../lib/discovery-messages.mjs';
import { enregistrerHub, HUBS_PERIMETRES } from '../lib/diagnostic-territoire.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

// ---------------- accusé d'une approbation de page d'une affaire déjà publique ----------------
const PAGE_MAJ = { page: { case_id: 'FR-2026-0144', hash: 'e47dda459e3b6ea2', mise_a_jour: { precedent_hash: 'abc' } } };
const PAGE_NEUVE = { page: { case_id: 'FR-2026-0148', hash: '2475039d967d01bb' } };
t('page approuvée : l’accusé ne dit jamais « nouvelle affaire » ni « publication exige un GO » ; il dit que ce clic EST le GO de CETTE version', () => {
  for (const p of [PAGE_MAJ, PAGE_NEUVE]) {
    const a = accuseVersion(p, 'VALIDATE');
    assert.ok(a && !/Nouvelle affaire|exige un GO/.test(a.suite + a.libelle));
    assert.match(a.suite, /vaut GO pour CETTE version/); assert.ok(a.suite.includes(p.page.hash));
    assert.match(a.suite, /déjà publique, sa carte ne change pas/);
    assert.match(a.suite, /« Publié et vérifié » ne t’est annoncé qu’après cette lecture/);
    assert.match(a.suite, /aucun nouveau clic/);
  }
});
t('« rien publié » dit son périmètre : la version en ligne reste ; une fiche neuve dit « la page n’existe pas encore »', () => {
  assert.match(accuseVersion(PAGE_MAJ, 'REVIEW').libelle, /rien publié : la version en ligne ne change pas/);
  assert.match(accuseVersion(PAGE_MAJ, 'REJECT').libelle, /la version en ligne ne change pas/);
  assert.match(accuseVersion(PAGE_NEUVE, 'REVIEW').libelle, /la page n’existe pas encore/);
  assert.match(accuseVersion(PAGE_MAJ, 'VALIDATE').libelle, /MISE À JOUR APPROUVÉE/); assert.match(accuseVersion(PAGE_NEUVE, 'VALIDATE').libelle, /FICHE APPROUVÉE/);
});
t('accusé historique conservé pour les autres propositions (nouvelle affaire, Hub à publier pour la 1re fois)', () => {
  assert.equal(accuseVersion({ etablissement: 'X' }, 'VALIDATE'), null);
  assert.equal(accuseVersion({ hub_publication: { slug: 's', hash: 'h' } }, 'VALIDATE'), null);
});

// ---------------- mise à jour d'un Hub composé déjà publié ----------------
const aff = (id, commune, statut) => ({ case_id: id, etablissement: `École de ${commune}`, commune, departement: 'Testland', statut_judiciaire: statut });
const TERR = { slug: 'testland', titre: 'Testland', departement: 'Testland' };
const compose = (statut, dossiers) => composerMatiereHub({ territoire: TERR, cases: [aff('FR-X-0001', 'Alpha', 'condamnation non définitive'), aff('FR-X-0002', 'Beta', statut)], evenements: [], holds: new Set(), dossiersExistants: new Set(dossiers), genere_le: '2026-11-10' });
const AVANT = compose('enquête', ['FR-X-0001']);
const APRES = compose('mise en examen', ['FR-X-0001', 'FR-X-0002']);
t('même état → aucune proposition (rien n’est demandé à l’éditeur)', () => {
  assert.equal(hashMatiere(compose('enquête', ['FR-X-0001'])), hashMatiere(AVANT));
  assert.deepEqual(changementsHub(AVANT, compose('enquête', ['FR-X-0001'])), []);
  assert.equal(aProposer({ hashPublie: hashMatiere(AVANT), hashRecomposee: hashMatiere(AVANT), changements: [] }), false);
});
const CH = changementsHub(AVANT, APRES);
t('changement d’état + fiche désormais disponible → rubriques changées lisibles, proposition justifiée', () => {
  const r = CH.map((c) => c.rubrique);
  assert.ok(r.includes('Chapeau') && r.includes('Limite') && r.some((x) => /^Recherche/.test(x)), r.join(','));
  assert.match(CH.find((c) => c.rubrique === 'Chapeau').apres, /1 × mise en examen/);
  assert.equal(aProposer({ hashPublie: hashMatiere(AVANT), hashRecomposee: hashMatiere(APRES), changements: CH }), true);
  assert.equal(aProposer({ hashPublie: null, hashRecomposee: hashMatiere(APRES), changements: CH }), false, 'sans version publiée connue : échec fermé');
});
const MAJ = blocMiseAJour({ hashPublie: hashMatiere(AVANT), changements: CH, affaires: [{ case_id: 'FR-X-0002', etablissement: 'École de Beta', commune: 'Beta' }],
  sources: [{ case_id: 'FR-X-0002', media: 'sweetfm', url: 'https://sweet.test/a', publication_date: '2026-11-12' }], informations: ['FR-X-0002 : état publié « mise en examen » au 12 novembre 2026, selon sweetfm'] });
const { payload, cle } = payloadPublication({ slug: 'testland', titre: 'Testland', hash: hashMatiere(APRES), ids: APRES.ordre, miseAJour: MAJ });
const proposition = (cleLue = cle) => ({ payload, cle: cleLue });
t('le message nomme l’affaire, la source nouvelle (liée), l’information étayée, le changement avant → après, l’aperçu et les empreintes', () => {
  const m = messageDecision(payload, 'REVIEW');
  assert.match(m, /MISE À JOUR DU HUB · Testland/); assert.match(m, /ENRICHIR_HUB/);
  assert.match(m, /Affaire concernée<\/b> : FR-X-0002 — École de Beta \(Beta\)/);
  assert.match(m, /Source nouvelle[^]*sweetfm, 2026-11-12 \(FR-X-0002\) → https:\/\/sweet\.test\/a/);
  assert.match(m, /Information nouvelle étayée[^]*mise en examen/);
  assert.match(m, /Ce que cela change dans le dossier territorial[^]*Chapeau<\/b> : [^\n]*« enquête\.? » → « mise en examen\.? »/);
  assert.match(m, new RegExp(`<code>${hashMatiere(APRES)}</code>`)); assert.match(m, new RegExp(`<code>${hashMatiere(AVANT)}</code>`));
  assert.match(m, /Voir la proposition/); assert.ok(m.includes(payload.hub_publication.apercu));
  assert.ok(m.length <= 4000 && !/undefined/.test(m));
});
t('quatre actions explicites ; callbacks existants (VALIDATE / REVIEW / REJECT), lien d’aperçu en bouton URL', () => {
  const k = boutons('REVIEW', 'ab12cd34', payload).inline_keyboard;
  assert.deepEqual(k.flat().map((b) => b.text), ['👁 Voir la proposition', '✅ Approuver cette version', '🟡 À revoir', '⛔ Écarter la proposition']);
  assert.equal(k[0][0].url, payload.hub_publication.apercu); assert.ok(!k[0][0].callback_data);
  assert.deepEqual(k[1].map((b) => decoderCallback(b.callback_data).action), ['VALIDATE', 'REVIEW', 'REJECT']);
  assert.ok(k[1].every((b) => b.callback_data.length <= 64 && decoderCallback(b.callback_data).cle === 'ab12cd34'));
  for (const a of ['VALIDATE', 'REVIEW', 'REJECT']) assert.equal(boutonValable(a, payload), true);
  assert.equal(boutonValable('CREATE', payload), false, 'aucun bouton ne crée une affaire ni ne rattache une source depuis ce message');
  assert.equal(boutonValable('ATTACH', payload), false);
});
t('l’approbation porte sur CETTE empreinte : la proposition d’une autre empreinte a une autre clé de dédoublonnage', () => {
  const autre = payloadPublication({ slug: 'testland', titre: 'Testland', hash: 'ffffffffffffffff', ids: APRES.ordre, miseAJour: MAJ });
  assert.notEqual(autre.cle, cle); assert.equal(cle, `hubpub|testland|${hashMatiere(APRES)}`);
});
t('accusé d’une mise à jour de Hub : GO de CETTE version ; À revoir / Écarter ne publient rien et ne suppriment ni Hub ni affaire', () => {
  assert.match(accuseVersion(payload, 'VALIDATE').libelle, /VERSION DU HUB APPROUVÉE/);
  assert.match(accuseVersion(payload, 'VALIDATE').suite, /le Hub est déjà publié, les affaires ne changent pas/);
  assert.match(accuseVersion(payload, 'REVIEW').libelle, /le Hub en ligne ne change pas/);
  assert.match(accuseVersion(payload, 'REJECT').libelle, /le Hub et ses affaires ne changent pas/);
});
t('proposition de PREMIÈRE publication d’un Hub : message et boutons historiques inchangés', () => {
  const p = payloadPublication({ slug: 'testland', titre: 'Testland', hash: hashMatiere(APRES), ids: APRES.ordre });
  assert.ok(!p.payload.hub_publication.mise_a_jour);
  assert.match(messageDecision(p.payload, 'REVIEW'), /HUB À PUBLIER/);
  assert.deepEqual(boutons('REVIEW', 'ab12cd34', p.payload).inline_keyboard[0].map((b) => b.text), ['🗺 PUBLIER LE HUB', '🟡 REVIEW', '⛔ REJECT']);
});
t('diffCourt : montre le segment modifié, jamais tout le texte', () => {
  const d = diffCourt('3 affaires : 2 × condamnation · 1 × enquête. Rien ne relie ces affaires.', '3 affaires : 2 × condamnation · 1 × mise en examen. Rien ne relie ces affaires.');
  assert.match(d, /« enquête\.? » → « mise en examen\.? »/); assert.equal(diffCourt('a', 'a'), '(aucune différence)');
});
t('diagnostic : un Hub composé déjà publié est marqué `compose` ; un Hub rédigé ne l’est pas', () => {
  enregistrerHub('testland-compose', 'Testland', 'Testland');
  assert.equal(HUBS_PERIMETRES['testland-compose'].compose, true);
  assert.ok(!HUBS_PERIMETRES['paris-11e'].compose);
  const d = src('scripts/diagnostic-territoire.mjs');
  assert.match(d, /\['INTEGRER_HUB', 'ENRICHIR_HUB'\]\.includes\(d\.decision\) && HUBS_PERIMETRES\[nom\]\?\.compose/);
});

// ---------------- câblage : la mise à jour du Hub et l'alerte enrichie sont bien appelées par les workflows ----------------
t('workflows : preparer-hub --maj (écrire + annoncer) dans sny-clics ET sny-telegram ; QA et site servi journalisés pour l’alerte', () => {
  for (const f of ['.github/workflows/sny-clics.yml', '.github/workflows/sny-telegram.yml']) {
    const y = src(f);
    assert.match(y, /preparer-hub\.mjs --ecrire --maj/); assert.match(y, /preparer-hub\.mjs --annoncer --maj/);
  }
  const tg = src('.github/workflows/sny-telegram.yml');
  assert.match(tg, /run-all\.mjs 2>&1 \| tee "\$RUNNER_TEMP\/qa\.log"/); assert.match(tg, /--site 2>&1 \| tee "\$RUNNER_TEMP\/controle\.log"/);
  assert.match(tg, /QA_LOG: \$\{\{ runner\.temp \}\}\/qa\.log/); assert.match(tg, /set -o pipefail/);
});

console.log(`\n${n} contrôles lot 16/11 : OK`);
