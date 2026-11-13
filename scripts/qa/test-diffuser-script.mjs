// =====================================================================
// scripts/qa/test-diffuser-script.mjs — le VRAI scripts/diffuser-social.mjs, exécuté EN PROCESSUS contre une base, un Buffer, un site et un Telegram SIMULÉS
// (scripts/qa/fixtures/diffusion-mock.mjs). Il prouve le COUPE-CIRCUIT : sans mode REVIEW explicite, sans tables, sans T0 vérifié, le script ne fait AUCUN appel
// d'écriture (ni Buffer, ni Telegram) et sort proprement. La logique de proposition / GO / publication est testée par test-relais-social.mjs (mêmes fonctions).
// Aucun accès réseau : tout appel sortant imprévu fait échouer le test. Usage : node scripts/qa/test-diffuser-script.mjs
// =====================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`  ${cond ? '✅' : '❌'} ${nom}${cond ? '' : ' — ' + String(detail).slice(0, 300)}`); if (!cond) ko++; };
const racine = fileURLToPath(new URL('../../', import.meta.url));
const mock = pathToFileURL(join(racine, 'scripts/qa/fixtures/diffusion-mock.mjs')).href;
const CLE = 'CLE-FACTICE-NE-DOIT-JAMAIS-APPARAITRE';
const NOW = new Date('2026-11-13T12:00:00Z');
const T0 = '2026-11-13T06:00:00.000Z';
const dossier = mkdtempSync(join(tmpdir(), 'sny-diff-'));
let n = 0;

function lancer(scenario, { actif = '1', mode = 'review', depuis = '2026-11-13T06:00:00Z', args = ['--ecrire'] } = {}) {
  const etat = join(dossier, `etat-${++n}.json`);
  const r = spawnSync(process.execPath, ['--import', mock, 'scripts/diffuser-social.mjs', ...args], {
    cwd: racine, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, CI: '1', NEON_DATABASE_URL: 'postgresql://u:p@ep-test.aws.neon.tech/neondb?sslmode=require', BUFFER_API_KEY: CLE, BUFFER_ORGANIZATION_ID: 'org1', BUFFER_CHANNEL_X: 'chX', BUFFER_CHANNEL_FACEBOOK: 'chF',
      SNY_DIFFUSION_ACTIVE: actif, SNY_DIFFUSION_MODE: mode, SNY_DIFFUSION_DEPUIS: depuis, TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_ALLOWED_USER_ID: '1',
      SNY_TEST_STATE: etat, SNY_TEST_SCENARIO: JSON.stringify(scenario), SNY_TEST_NOW: NOW.toISOString() },
  });
  const sortie = `${r.stdout}\n${r.stderr}`;
  let e = { ledger: [], posts: [], telegram: [], appels: [] }; try { e = JSON.parse(readFileSync(etat, 'utf8')); } catch { /* aucun appel : pas d'état */ }
  return { code: r.status, sortie, etat: e, ecritures: e.appels.filter((a) => ['createPost', 'deletePost'].includes(a)).length };
}

console.log('A. Coupe-circuit : aucun appel sortant, sortie propre');
{
  let r = lancer({}, { actif: '0' });
  verifie('SNY_DIFFUSION_ACTIVE=0 : sortie 0, ni Buffer ni Telegram, ni base', r.code === 0 && r.etat.appels.length === 0 && r.etat.telegram.length === 0 && /INACTIF/.test(r.sortie), r.sortie.slice(-300));
  r = lancer({}, { actif: '' });
  verifie('SNY_DIFFUSION_ACTIVE absent : idem', r.code === 0 && r.etat.appels.length === 0 && /INACTIF/.test(r.sortie), r.sortie.slice(-300));
  r = lancer({}, { mode: '' });
  verifie('SNY_DIFFUSION_MODE absent : idem — aucun mode par défaut', r.code === 0 && r.etat.appels.length === 0 && r.etat.telegram.length === 0 && /INACTIF/.test(r.sortie), r.sortie.slice(-300));
  r = lancer({}, { mode: 'auto' });
  verifie('mode « auto » : refusé, aucun appel (la diffusion automatique n’existe pas)', r.code === 0 && r.etat.appels.length === 0 && /INACTIF/.test(r.sortie), r.sortie.slice(-300));
  r = lancer({ sansJournal: true });
  verifie('tables absentes (migrations non appliquées) : relais désactivé, aucun appel Buffer', r.code === 0 && r.etat.appels.length === 0 && /absentes/.test(r.sortie), r.sortie.slice(-300));
  r = lancer({});
  verifie('tables présentes mais T0 absent : INACTIF, aucun appel Buffer ni Telegram', r.code === 0 && r.etat.appels.length === 0 && r.etat.telegram.length === 0 && /T0 absent/.test(r.sortie), r.sortie.slice(-300));
  r = lancer({ t0: T0 }, { depuis: '' });
  verifie('T0 en base mais témoin de configuration absent : INACTIF', r.code === 0 && r.etat.appels.length === 0 && /témoin/.test(r.sortie), r.sortie.slice(-300));
  r = lancer({ t0: T0 }, { depuis: '2026-11-01T00:00:00Z' });
  verifie('témoin reculé (correction de configuration) : INACTIF, aucun rattrapage', r.code === 0 && r.etat.appels.length === 0 && /témoin/.test(r.sortie), r.sortie.slice(-300));
}

console.log('\nB. Relais actif sans nouveauté : silence (aucune recherche historique pour « remplir »)');
{
  const r = lancer({ t0: T0 });
  verifie('actif, aucun événement après T0 : sortie 0, AUCUNE écriture Buffer, aucun Telegram', r.code === 0 && r.ecritures === 0 && r.etat.telegram.length === 0 && /0 candidat/.test(r.sortie), r.sortie.slice(-300));
  verifie('journaux publics : ni lieu, ni clé', !r.sortie.includes(CLE));
  const p = lancer({ t0: T0 }, { args: [] });
  verifie('mode PLAN (par défaut) : aucune écriture, aucun message', p.code === 0 && p.etat.appels.filter((a) => a !== 'channels').length === 0 && p.etat.telegram.length === 0, p.sortie.slice(-300));
}

rmSync(dossier, { recursive: true, force: true });
console.log(ko ? `\n❌ ${ko} vérification(s) en échec` : '\n✅ script de diffusion : coupe-circuit et silence démontrés en processus (base, Buffer, site, Telegram simulés)');
process.exit(ko ? 1 : 0);
