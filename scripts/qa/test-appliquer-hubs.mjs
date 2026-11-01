// Contrat d'application des versions finales aux dossiers de Hub (scripts/lib/hub-application.mjs, docs/industrialisation/appliquer-hubs-01-11.mjs, go-lot-24-10.mjs).
// Démontre : empreinte exacte, refus sur modification concurrente, cumul de plusieurs lignes d'un même Hub, exception sans effet sur le contenu public, rien d'autre écrit.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { verifierLigneHub, appliquerAuxHubs } from '../lib/hub-application.mjs';
import { hashDossier } from '../lib/fiche-page.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const dossier = (texte) => ({ statut_affiche: 'enquête', etat_actuel: [texte], deroule: [{ date: null, date_nature: 'article', type: 'enquete', texte, source: { media: 'M', url: 'https://x/a', publie_le: '2026-01-01' } }], inconnues: [] });
const hubs = () => ({
  'paris-11e.json': { _meta: { hub_id: 'paris-11e' }, ordre: ['A', 'B', 'C'], reponses: [{ titre: 'Collectivités', items: [1, 2] }], dossiers: { A: dossier('A v0'), B: dossier('B v0'), C: dossier('C v0') } },
  'landes.json': { _meta: { hub_id: 'landes' }, ordre: ['D'], reponses: [], dossiers: { D: dossier('D v0') } },
});
const ligne = (id, v1, v0, h = hubs()) => ({ id, finale: dossier(v1), hashAutorise: hashDossier(dossier(v1)), hashAvant: hashDossier(dossier(v0)) });

t('ligne de Hub : version finale à l’empreinte du manifeste, dossier du Hub = version publique attendue → à écrire ; déjà égal → déjà appliquée', () => {
  const l = ligne('A', 'A v1', 'A v0');
  assert.equal(verifierLigneHub({ finale: l.finale, hubDossier: dossier('A v0'), hashAutorise: l.hashAutorise, hashAvant: l.hashAvant }).etat, 'a_ecrire');
  assert.equal(verifierLigneHub({ finale: l.finale, hubDossier: dossier('A v1'), hashAutorise: l.hashAutorise, hashAvant: l.hashAvant }).etat, 'deja_appliquee');
});
t('refus : version finale absente, empreinte différente du manifeste, dossier absent du Hub, empreinte « avant » absente (échec fermé)', () => {
  const l = ligne('A', 'A v1', 'A v0');
  assert.equal(verifierLigneHub({ finale: null, hubDossier: dossier('A v0'), hashAutorise: l.hashAutorise, hashAvant: l.hashAvant }).motif, 'VERSION_FINALE_ABSENTE');
  assert.equal(verifierLigneHub({ finale: dossier('A v1 modifiée'), hubDossier: dossier('A v0'), hashAutorise: l.hashAutorise, hashAvant: l.hashAvant }).motif, 'EMPREINTE_FINALE_DIFFERENTE_DU_MANIFESTE');
  assert.equal(verifierLigneHub({ finale: l.finale, hubDossier: null, hashAutorise: l.hashAutorise, hashAvant: l.hashAvant }).motif, 'DOSSIER_ABSENT_DU_HUB');
  assert.equal(verifierLigneHub({ finale: l.finale, hubDossier: dossier('A v0'), hashAutorise: l.hashAutorise, hashAvant: undefined }).motif, 'EMPREINTE_AVANT_ABSENTE_DU_MANIFESTE');
});
t('modification concurrente : si le dossier du Hub n’est plus la version publique attendue, il n’est PAS écrasé ; les autres lignes continuent', () => {
  const h = hubs(); h['paris-11e.json'].dossiers.A = dossier('A modifié entretemps par un autre travail');
  const r = appliquerAuxHubs({ hubs: h, lignes: [ligne('A', 'A v1', 'A v0'), ligne('B', 'B v1', 'B v0')] });
  assert.equal(r.rapport.find((x) => x.id === 'A').motif, 'MODIFICATION_CONCURRENTE_DU_DOSSIER_DU_HUB');
  assert.deepEqual(r.hubs['paris-11e.json'].dossiers.A, dossier('A modifié entretemps par un autre travail'));
  assert.deepEqual(r.hubs['paris-11e.json'].dossiers.B, dossier('B v1'));
});
t('plusieurs corrections autorisées dans un même Hub se cumulent (et dans plusieurs Hubs)', () => {
  const r = appliquerAuxHubs({ hubs: hubs(), lignes: [ligne('A', 'A v1', 'A v0'), ligne('B', 'B v1', 'B v0'), ligne('D', 'D v1', 'D v0')] });
  assert.deepEqual(r.hubs['paris-11e.json'].dossiers.A, dossier('A v1')); assert.deepEqual(r.hubs['paris-11e.json'].dossiers.B, dossier('B v1'));
  assert.deepEqual(r.hubs['landes.json'].dossiers.D, dossier('D v1')); assert.deepEqual(r.hubs['paris-11e.json'].dossiers.C, dossier('C v0'));
  assert.deepEqual(r.modifies.sort(), ['landes.json', 'paris-11e.json']);
});
t('exception : l’affaire exclue garde EXACTEMENT son contenu public, y compris quand d’autres affaires du même Hub sont corrigées', () => {
  const avant = hubs();
  const r = appliquerAuxHubs({ hubs: avant, lignes: [ligne('A', 'A v1', 'A v0'), ligne('B', 'B v1', 'B v0')], sauf: new Set(['B']) });
  assert.deepEqual(r.hubs['paris-11e.json'].dossiers.B, hubs()['paris-11e.json'].dossiers.B);
  assert.equal(hashDossier(r.hubs['paris-11e.json'].dossiers.B), hashDossier(dossier('B v0')));
  assert.deepEqual(r.hubs['paris-11e.json'].dossiers.A, dossier('A v1'));
  assert.equal(r.rapport.find((x) => x.id === 'B').etat, 'exception');
});
t('rien d’autre n’est écrit : réponses, repères, ordre, autres dossiers inchangés ; l’entrée n’est pas mutée', () => {
  const avant = hubs(); const r = appliquerAuxHubs({ hubs: avant, lignes: [ligne('A', 'A v1', 'A v0')] });
  const { dossiers: dApres, ...resteApres } = r.hubs['paris-11e.json']; const { dossiers: dAvant, ...resteAvant } = hubs()['paris-11e.json'];
  assert.deepEqual(resteApres, resteAvant); assert.deepEqual(r.hubs['landes.json'], hubs()['landes.json']);
  assert.deepEqual(avant, hubs(), 'les Hubs passés en entrée ne sont pas modifiés');
  assert.deepEqual(Object.keys(dApres), Object.keys(dAvant));
});
t('une affaire isolée (dossier absent de tous les Hubs) n’est jamais traitée ici (circuit promouvoir-fiche)', () => {
  const r = appliquerAuxHubs({ hubs: hubs(), lignes: [ligne('Z', 'Z v1', 'Z v0')] });
  assert.equal(r.rapport.length, 0); assert.deepEqual(r.modifies, []);
});
t('go-lot lit `_hub_avant` AVANT de le retirer des lignes et applique le même contrôle de version ; l’application ne dépend pas du retrait de la clé', () => {
  const go = readFileSync(new URL('../../docs/industrialisation/go-lot-24-10.mjs', import.meta.url), 'utf8');
  assert.match(go, /HUB_AVANT = autorisees\._hub_avant/); assert.match(go, /verifierLigneHub\(\{[^}]*hashAvant: HUB_AVANT\[id\]/);
  assert.ok(go.indexOf('HUB_AVANT = autorisees._hub_avant') < go.indexOf('delete autorisees._hub_avant'));
  const ap = readFileSync(new URL('../../docs/industrialisation/appliquer-hubs-01-11.mjs', import.meta.url), 'utf8');
  assert.match(ap, /hashAvant: avant\[id\]/); assert.match(ap, /appliquerAuxHubs/);
});
// Contrôle du lot réel : chaque ligne du manifeste = dossier final suivi à l'empreinte exacte, aperçu à la même empreinte, Hub encore à la version publique attendue.
const MAN = new URL('../../docs/industrialisation/ids-go-correction-01-11.json', import.meta.url);
if (existsSync(MAN)) {
  const man = JSON.parse(readFileSync(MAN, 'utf8')); const avant = man._hub_avant ?? {};
  const ids = Object.keys(man).filter((k) => !k.startsWith('_'));
  const hubsReels = Object.fromEntries(readdirSync(new URL('../../data/hub-matiere/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(new URL(`../../data/hub-matiere/${f}`, import.meta.url), 'utf8'))]));
  t(`lot réel : ${ids.length} lignes — dossier final = empreinte du manifeste = empreinte écrite dans l’aperçu`, () => {
    for (const id of ids) {
      const f = JSON.parse(readFileSync(new URL(`../../docs/industrialisation/dossiers-finaux/${id}.json`, import.meta.url), 'utf8'));
      assert.equal(hashDossier(f), man[id], `${id} : empreinte du dossier final`);
      assert.ok(readFileSync(new URL(`../../docs/industrialisation/fiches-generees/${id}.md`, import.meta.url), 'utf8').includes('`' + man[id] + '`'), `${id} : l’aperçu porte l’empreinte du manifeste`);
    }
  });
  t('lot réel : toute ligne dont le dossier vit dans un Hub a une empreinte « avant » ; le Hub est encore la version publique attendue (ou déjà la version finale appliquée) — aucun Hub modifié avant le GO', () => {
    for (const id of ids) {
      const hub = Object.entries(hubsReels).find(([k, h]) => k !== 'isoles.json' && h.dossiers?.[id]);
      if (!hub) continue;
      assert.ok(avant[id], `${id} : empreinte « avant » absente`);
      const h = hashDossier(hub[1].dossiers[id]);
      assert.ok(h === avant[id] || h === man[id], `${id} : le dossier du Hub (${h}) n’est ni la version attendue (${avant[id]}) ni la version finale (${man[id]})`);
    }
  });
}
console.log(`\n${n} contrôles : OK`);
