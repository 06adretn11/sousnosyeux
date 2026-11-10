// =====================================================================
// scripts/qa/test-diffuser-script.mjs — le VRAI scripts/diffuser-social.mjs, exécuté de bout en bout contre une base, un Buffer, un site et un Telegram SIMULÉS
// (scripts/qa/fixtures/diffusion-mock.mjs). Aucune publication réelle, aucun accès réseau : tout appel sortant imprévu fait échouer le test.
// Données réelles utilisées : data/cases.json (une affaire diffusable est choisie dans l'artefact). Date figée, donc indépendant du jour d'exécution.
// Usage : node scripts/qa/test-diffuser-script.mjs
// =====================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { STATUTS_DIFFUSABLES, dateSourceNouvelleAffaire } from '../lib/diffusion-sociale.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`  ${cond ? '✅' : '❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };
const racine = fileURLToPath(new URL('../../', import.meta.url));
const mock = pathToFileURL(join(racine, 'scripts/qa/fixtures/diffusion-mock.mjs')).href;
const CLE = 'CLE-FACTICE-NE-DOIT-JAMAIS-APPARAITRE';

const cases = JSON.parse(readFileSync(join(racine, 'data/cases.json'), 'utf8')).cases;
const cas = cases.find((c) => STATUTS_DIFFUSABLES.has(c.statut_judiciaire) && typeof c.lat === 'number' && dateSourceNouvelleAffaire(c));
const dateSource = dateSourceNouvelleAffaire(cas);
const NOW = new Date(Date.parse(`${dateSource}T00:00:00Z`) + 36 * 36e5); // 1,5 jour après la source la plus récente
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString();
const DEPUIS = iso(-24 * 36e5);
const revue = (reviewed_at) => ({ case_id: cas.case_id, reviewed_by: 'Adrien (GO publication)', decision: 'validé', comment: '[Publication 2026-11-11] GO d\'Adrien : « Telegram PUBLIER 1a2b3c4d »', reviewed_at });
const base = { revues: [revue(iso(-1 * 36e5))], cases: [{ case_id: cas.case_id, ps: 'publiée' }], envoi: iso(-2 * 36e5) };

function lancer(scenario, { etat, actif = '1', now = NOW, depuis = DEPUIS, args = ['--ecrire'] } = {}) {
  const r = spawnSync(process.execPath, ['--import', mock, 'scripts/diffuser-social.mjs', ...args], {
    cwd: racine, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, CI: '1', NEON_DATABASE_URL: 'postgresql://u:p@ep-test.aws.neon.tech/neondb?sslmode=require', BUFFER_API_KEY: CLE, BUFFER_ORGANIZATION_ID: 'org1', BUFFER_CHANNEL_X: 'chX', BUFFER_CHANNEL_FACEBOOK: 'chF',
      SNY_DIFFUSION_ACTIVE: actif, SNY_DIFFUSION_DEPUIS: depuis, TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_ALLOWED_USER_ID: '1',
      SNY_TEST_STATE: etat, SNY_TEST_SCENARIO: JSON.stringify(scenario), SNY_TEST_NOW: now.toISOString() },
  });
  const sortie = `${r.stdout}\n${r.stderr}`;
  return { code: r.status, sortie, etat: (() => { try { return JSON.parse(readFileSync(etat, 'utf8')); } catch { return { ledger: [], posts: [], telegram: [], appels: [] }; } })() };
}
const dossier = mkdtempSync(join(tmpdir(), 'sny-diff-'));
let n = 0; const nouvelEtat = () => join(dossier, `etat-${++n}.json`);
const creations = (e) => e.appels.filter((a) => a === 'createPost').length;

console.log(`affaire de test : ${cas.case_id} (statut « ${cas.statut_judiciaire} », source la plus récente ${dateSource}), date figée ${NOW.toISOString()}`);

console.log('\nA. Nouvelle affaire approuvée + servie → un post par canal actif, rejeu sans doublon');
{
  const f = nouvelEtat();
  const r1 = lancer(base, { etat: f });
  verifie('sortie 0', r1.code === 0, r1.sortie.slice(-400));
  verifie('2 createPost (X, Facebook), aucun Instagram (canal non configuré)', creations(r1.etat) === 2 && r1.etat.posts.length === 2, JSON.stringify(r1.etat.appels));
  verifie('posts AUTOMATIQUES programmés dans le futur (marge d’annulation)', r1.etat.posts.every((p) => p.schedulingType === 'automatic' && p.mode === 'customScheduled' && new Date(p.dueAt) > NOW), JSON.stringify(r1.etat.posts.map((p) => [p.schedulingType, p.mode, p.dueAt])));
  verifie('journal : 2 lignes « programme » avec l’identifiant Buffer', r1.etat.ledger.length === 2 && r1.etat.ledger.every((l) => l.etat === 'programme' && l.buffer_post_id), JSON.stringify(r1.etat.ledger.map((l) => [l.canal, l.etat])));
  verifie('texte X : établissement, commune, phrase du site, UTM, ancre vers la fiche', (() => { const x = r1.etat.posts.find((p) => p.channelId === 'chX').text; return x.includes(cas.etablissement) && x.includes(cas.commune) && /Selon .+, /.test(x) && x.includes('utm_source=x') && x.includes(`#affaire-${cas.case_id.toLowerCase()}`); })(), r1.etat.posts[0]?.text);
  verifie('journaux publics : ni lieu, ni nom, ni clé', !r1.sortie.includes(cas.etablissement) && !r1.sortie.includes(cas.commune) && !r1.sortie.includes(CLE), r1.sortie.slice(0, 300));
  const r2 = lancer(base, { etat: f });
  verifie('rejeu identique (mêmes données) : aucun createPost de plus', creations(r2.etat) === 2 && r2.etat.ledger.length === 2, JSON.stringify(r2.etat.appels));
  // Buffer annonce l'envoi : le passage suivant constate « envoye » puis « verifie » (permalien relu).
  const e = r2.etat; for (const p of e.posts) { p.status = 'sent'; p.externalLink = `https://reseau.test/${p.id}`; }
  const f2 = nouvelEtat(); const { writeFileSync } = await import('node:fs'); writeFileSync(f2, JSON.stringify(e));
  const r3 = lancer(base, { etat: f2 });
  verifie('Buffer annonce « sent » + permalien : journal « verifie », toujours aucun doublon', r3.etat.ledger.every((l) => l.etat === 'verifie' && l.permalien) && creations(r3.etat) === 2, JSON.stringify(r3.etat.ledger.map((l) => [l.canal, l.etat])));
}

console.log('\nB. Diffusion désactivée (défaut) ou journal absent → rien');
{
  const f = nouvelEtat(); const r = lancer(base, { etat: f, actif: '0' });
  verifie('SNY_DIFFUSION_ACTIVE ≠ 1 : sortie 0, aucun appel Buffer, aucun journal', r.code === 0 && r.etat.appels.length === 0 && r.etat.ledger.length === 0 && /DÉSACTIVÉE/.test(r.sortie), r.sortie.slice(-300));
  const g = nouvelEtat(); const s = lancer({ ...base, sansJournal: true }, { etat: g });
  verifie('migration 025 non appliquée : diffusion désactivée, aucun appel Buffer', s.code === 0 && s.etat.appels.length === 0 && /migration 025/.test(s.sortie), s.sortie.slice(-300));
  const h = nouvelEtat(); const p = lancer(base, { etat: h, args: [] });
  verifie('mode PLAN (par défaut) : éligible dit, rien envoyé, rien écrit', p.code === 0 && /ÉLIGIBLE/.test(p.sortie) && p.etat.appels.length === 0 && p.etat.ledger.length === 0, p.sortie.slice(-300));
}

console.log('\nC. Sans GO postérieur à l’activation / stock historique → zéro diffusion');
{
  let f = nouvelEtat(); let r = lancer({ ...base, revues: [] }, { etat: f });
  verifie('aucune revue après l’activation : rien', creations(r.etat) === 0 && r.etat.ledger.length === 0, r.sortie.slice(-200));
  f = nouvelEtat(); r = lancer({ ...base, revues: [revue(iso(-48 * 36e5))] }, { etat: f });
  verifie('GO antérieur à l’activation (pas de rétroactivité)', creations(r.etat) === 0, r.sortie.slice(-200));
  f = nouvelEtat(); r = lancer({ ...base, envoi: iso(-48 * 36e5) }, { etat: f });
  verifie('message d’approbation antérieur à l’activation (sans la portée « relais social »)', creations(r.etat) === 0, r.sortie.slice(-200));
  f = nouvelEtat(); r = lancer({ ...base, revues: [{ ...revue(iso(-36e5)), comment: 'GO oral, publication manuelle' }] }, { etat: f });
  verifie('publication manuelle sans GO Telegram consigné : rien', creations(r.etat) === 0, r.sortie.slice(-200));
}

console.log('\nD. Source trop ancienne, page non servie, affaire retirée → zéro diffusion');
{
  let f = nouvelEtat(); let r = lancer(base, { etat: f, now: new Date(NOW.getTime() + 10 * 864e5), depuis: new Date(NOW.getTime() - 864e5).toISOString() });
  verifie('source de plus de 7 jours : silence', creations(r.etat) === 0 && /> 7/.test(r.sortie), r.sortie.slice(-200));
  f = nouvelEtat(); r = lancer({ ...base, siteStatut: { [cas.case_id]: 'autre statut' } }, { etat: f });
  verifie('site servant une autre version : silence', creations(r.etat) === 0 && /servie/.test(r.sortie), r.sortie.slice(-200));
  f = nouvelEtat(); r = lancer({ ...base, cases: [{ case_id: cas.case_id, ps: 'retirée' }] }, { etat: f });
  verifie('affaire retirée en base : silence', creations(r.etat) === 0, r.sortie.slice(-200));
}

console.log('\nE. Échec d’un canal → l’autre est publié ; Buffer en panne → réservation puis réconciliation, sans doublon');
{
  let f = nouvelEtat(); let r = lancer({ ...base, refus: ['chX'] }, { etat: f });
  verifie('X refusé : « echec » consigné, Facebook programmé', r.etat.ledger.find((l) => l.canal === 'x')?.etat === 'echec' && r.etat.ledger.find((l) => l.canal === 'facebook')?.etat === 'programme' && r.code === 1, JSON.stringify(r.etat.ledger.map((l) => [l.canal, l.etat])) + r.code);
  const r2 = lancer({ ...base, refus: ['chX'] }, { etat: f });
  verifie('rejeu : l’échec définitif n’est pas retenté', creations(r2.etat) === creations(r.etat), JSON.stringify(r2.etat.appels));
  f = nouvelEtat(); r = lancer({ ...base, bufferEnPanne: true }, { etat: f });
  verifie('Buffer en panne (503) : lignes « reserve », aucun faux échec', r.etat.ledger.length === 2 && r.etat.ledger.every((l) => l.etat === 'reserve'), JSON.stringify(r.etat.ledger.map((l) => [l.canal, l.etat])));
  const apres = lancer(base, { etat: f, now: new Date(NOW.getTime() + 30 * 6e4), depuis: DEPUIS });
  verifie('Buffer rétabli, délai de grâce écoulé : UNE création par canal, pas deux', apres.etat.posts.length === 2 && apres.etat.ledger.every((l) => l.etat === 'programme'), JSON.stringify(apres.etat.ledger.map((l) => [l.canal, l.etat])));
}

console.log('\nF. Retrait après programmation → posts annulés + alerte');
{
  const f = nouvelEtat(); const r1 = lancer(base, { etat: f });
  verifie('préparation : 2 posts programmés', r1.etat.posts.length === 2);
  const r2 = lancer({ ...base, statutNeon: { [cas.case_id]: 'retirée' } }, { etat: f });
  verifie('affaire retirée : les 2 posts sont supprimés chez Buffer, journal « annule »', r2.etat.posts.length === 0 && r2.etat.ledger.every((l) => l.etat === 'annule'), JSON.stringify(r2.etat.ledger.map((l) => [l.canal, l.etat])));
  verifie('alerte Telegram d’annulation envoyée', r2.etat.telegram.length === 2 && r2.etat.telegram.every((t) => /annulée avant envoi/.test(t)), JSON.stringify(r2.etat.telegram));
  const g = nouvelEtat(); const s1 = lancer(base, { etat: g });
  const { writeFileSync } = await import('node:fs'); const e = s1.etat; for (const p of e.posts) { p.status = 'sent'; p.externalLink = `https://reseau.test/${p.id}`; } const g2 = nouvelEtat(); writeFileSync(g2, JSON.stringify(e));
  const s2 = lancer({ ...base, statutNeon: { [cas.case_id]: 'retirée' } }, { etat: g2 });
  verifie('retrait APRÈS envoi : aucune suppression simulée, « retire_apres_envoi », alerte URGENT avec les liens', s2.etat.ledger.every((l) => l.etat === 'retire_apres_envoi') && s2.etat.appels.filter((a) => a === 'deletePost').length === 0 && s2.etat.telegram.filter((t) => /URGENT/.test(t) && /reseau\.test/.test(t)).length === 2, JSON.stringify(s2.etat.telegram.map((t) => t.slice(0, 60))));
}

rmSync(dossier, { recursive: true, force: true });
console.log(ko ? `\n❌ ${ko} vérification(s) en échec` : '\n✅ script de diffusion : exécution de bout en bout conforme (base, Buffer, site, Telegram simulés)');
process.exit(ko ? 1 : 0);
