// =====================================================================
// scripts/qa/test-sonde-business-discovery.mjs — le déroulé de la sonde, avec un `fetch` SIMULÉ (aucun réseau, aucun vrai jeton).
// Prouve : plafond d'appels persistant et réservé AVANT l'appel, arrêt sur panne d'accès, identité vérifiée avant toute lecture de cible,
// contrôle obligatoire, aucun jeton écrit, GET seulement, refus des chemins de jeton dangereux, preuve toujours étiquetée « simule ».
// Ne prouve PAS que Meta répond ainsi : ces réponses sont construites d'après la documentation. Les pseudos de cibles sont FICTIFS.
// Usage : node scripts/qa/test-sonde-business-discovery.mjs
// =====================================================================
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { normaliserPublications } from '../lib/business-discovery.mjs';
import { executer, options, lireJeton, lireJetonDansEnvLocal, VARIABLE_JETON } from '../sonde-business-discovery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };

const JETON = 'EAAB' + 'q'.repeat(70);
const IG = '17841400000000001'; const PAGE = '100000000000001';
const rep = (status, corps) => ({ status, json: async () => corps });
const publi = (i) => ({ id: `9000${i}`, caption: `Texte ${i}`, timestamp: '2026-11-20T10:00:00+0000', permalink: `https://www.instagram.com/p/AAA${i}/`, media_type: 'IMAGE' });

const dossier = join(ROOT, 'data', 'preuves-business-discovery', `_test-${process.pid}`);
const compteur = join(dossier, 'compteur.json');
const lireCompteurTest = () => JSON.parse(readFileSync(compteur, 'utf8')).appels_reseau;

/** Graph simulé. `v` modifie un comportement ; `appels` collecte (méthode, corps, chemin, champs) sans jeton. */
function graph(v = {}) {
  const appels = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url); const chemin = u.pathname.replace(/^\/v\d+\.\d+/, ''); const fields = u.searchParams.get('fields');
    appels.push({ methode: init.method, corps: init.body, hote: u.hostname, chemin, fields, compteurALAppel: existsSync(compteur) ? lireCompteurTest() : null });
    if (v.auth) return rep(400, { error: { code: 190, type: 'OAuthException', message: `Invalid OAuth access token ${u.searchParams.get('access_token')}` } });
    if (chemin === '/me') return v.nonUnified ? rep(400, { error: { code: 100, message: 'nonexisting field (client_business_id)' } }) : rep(200, { client_business_id: '123456789012', id: '999000111222' });
    if (chemin === '/me/assigned_instagram_accounts') return rep(200, { data: v.sansSny ? [{ id: '17841400000000002', username: 'autre_compte' }] : [{ id: '17841400000000002', username: 'autre_compte' }, { id: IG, username: 'SousNosYeux_org' }], ...(v.listePartielle ? { paging: { next: 'https://x', cursors: { after: 'QVFI' } } } : {}) });
    if (chemin === '/me/accounts') return rep(200, { data: [{ id: PAGE, name: 'SousNosYeux' }, { id: '100000000000002', name: 'Autre page' }] });
    if (chemin === `/${PAGE}`) return rep(200, { instagram_business_account: { id: IG }, id: PAGE });
    if (chemin === `/${IG}` && fields === 'id,username') return rep(200, { id: IG, username: v.pseudo ?? 'sousnosyeux_org' });
    if (chemin === `/${IG}`) {
      const m = /username\(([^)]+)\)/.exec(fields)[1];
      if (m === 'bluebottle' && v.controleKo) return rep(400, { error: { code: 100, message: 'refus générique' } });
      if (m === 'cible_b') return rep(400, { error: { code: 100, message: 'refus générique' } });
      const avecMedias = /media\.limit/.test(fields); const apres = /\.after\(/.test(fields);
      const curseur = v.curseurPiege ? 'QVFI)piege' : 'QVFIUjk';
      const bd = { id: '5', username: m, media_count: 3, ...(avecMedias ? { media: { data: [publi(apres ? 3 : 1), ...(apres ? [] : [publi(2)])], ...(apres ? {} : { paging: { cursors: { after: curseur, before: 'QVFIUjA' } } }) } } : {}) };
      return rep(200, { business_discovery: bd, id: IG });
    }
    return rep(404, { error: { code: 100, message: 'inattendu' } });
  };
  return { fetchImpl, appels };
}

const lancer = async (v, argv = ['--medias', '--cible', 'cible_a', '--cible', 'cible_b'], { jeton = JETON, sortie = dossier, env = {} } = {}) => {
  const g = graph(v); const lignes = []; const o = options(['--sortie', sortie, ...(argv.includes('--parcours') ? [] : ['--parcours', 'facebook']), ...argv]); o.compteur = compteur;
  const avant = {}; for (const [k, val] of Object.entries(env)) { avant[k] = process.env[k]; process.env[k] = val; }
  let erreur = null; let resultat = null;
  try { resultat = await executer(o, jeton, { fetchImpl: g.fetchImpl, log: (l) => lignes.push(l) }); } catch (e) { erreur = e; }
  for (const [k, val] of Object.entries(avant)) { if (val === undefined) delete process.env[k]; else process.env[k] = val; }
  return { ...g, lignes, erreur, resultat };
};
const preuves = (d = dossier) => readdirSync(d).filter((n) => /^preuve-/.test(n)).sort().map((n) => ({ n, texte: readFileSync(join(d, n), 'utf8') }));
const repartir = () => { rmSync(dossier, { recursive: true, force: true }); mkdirSync(dossier, { recursive: true }); };
const dossierB = `${dossier}-b`;

try {
  // 1. déroulé complet
  repartir();
  let r = await lancer();
  verifie('déroulé complet : comptes, page, identité, contrôle, 2 profils, 1 lot = 7 appels (la cible refusée n\'a pas de lot)', r.appels.length === 7, String(r.appels.length));
  verifie('uniquement des GET (ni verbe, ni corps) vers graph.facebook.com', r.appels.every((a) => a.methode === undefined && a.corps === undefined && a.hote === 'graph.facebook.com'));
  verifie('l\'identité est vérifiée AVANT toute requête business_discovery', r.appels.findIndex((a) => /business_discovery/.test(a.fields ?? '')) > r.appels.findIndex((a) => a.fields === 'id,username'));
  verifie('le compteur est inscrit AVANT chaque appel (1, 2, … 7 vus à l\'envoi)', r.appels.every((a, i) => a.compteurALAppel === i + 1), JSON.stringify(r.appels.map((a) => a.compteurALAppel)));
  let p = JSON.parse(preuves()[0].texte);
  verifie('preuve : identifiants vérifiés, contrôle lisible, cibles interprétables, appels comptés', p.identifiants.verifie === true && p.controle === 'succes' && p.cibles_interpretables === true && p.appels_effectues === 7 && lireCompteurTest() === 7);
  verifie('preuve étiquetée « simule » (jamais présentée comme lecture réelle)', p.source_reponses === 'simule');
  verifie('erreur générique de la cible : « cible_ou_requete », jamais « compte personnel »', (() => { const l = p.journal.find((x) => x.cible === 'cible_b'); return l.statut === 'erreur_cible_ou_requete' && !/personnel/i.test(JSON.stringify(l)); })());
  verifie('publications lues ; curseur « after » signalé, sans affirmer qu\'il reste des publications', p.publications.length === 2 && p.curseur_suivant_present.cible_a === true && !JSON.stringify(p).includes('suite_possible'));
  verifie('AUCUN jeton dans la preuve ni dans la sortie console', ![preuves()[0].texte, ...r.lignes].some((t) => t.includes(JETON.slice(0, 20))));
  verifie('aucune page étrangère dans la preuve (une seule Page candidate sondée, pas de liste des Pages)', !preuves()[0].texte.includes('Autre page') && !r.appels.some((a) => a.chemin === '/100000000000002'));
  verifie('code de sortie : lecture menée à terme ⇒ pas d\'arrêt', r.resultat.arret === null);

  // 2. plafond : 7 comptés ; 2e exécution avec identifiant fourni = 5 appels (identité, contrôle, profil, lot, page suivante) ⇒ 12
  r = await lancer({}, ['--medias', '--pages-suivantes', '1', '--ig-user-id', IG, '--cible', 'cible_a', '--cible', 'cible_b']);
  verifie('2e exécution : identifiant fourni (pas de me/accounts), identité revérifiée, page suivante lue', !r.appels.some((a) => a.chemin === '/me/accounts') && r.appels[0].fields === 'id,username' && JSON.parse(preuves()[1].texte).publications.some((x) => x.id_post === '90003'));
  verifie('plafond total : 12 atteint pile, jamais dépassé', lireCompteurTest() === 12 && r.appels.length === 5, `${lireCompteurTest()} / ${r.appels.length}`);
  r = await lancer();
  verifie('plafond atteint : échec explicite, AUCUN appel réseau', r.erreur && /plafond total/.test(r.erreur.message) && r.appels.length === 0);
  rmSync(dossierB, { recursive: true, force: true });
  r = await lancer({}, ['--medias'], { sortie: dossierB });
  verifie('changer de dossier de sortie ne redonne pas d\'appels (compteur indépendant des preuves)', r.erreur && /plafond total/.test(r.erreur.message) && r.appels.length === 0);
  for (const f of preuves()) rmSync(join(dossier, f.n));
  r = await lancer();
  verifie('supprimer les preuves ne remet pas le compteur à zéro', r.erreur && /plafond total/.test(r.erreur.message) && r.appels.length === 0);

  // 3. compteur illisible / preuve invalide : fail closed
  repartir(); writeFileSync(compteur, '{pas du json', 'utf8');
  r = await lancer();
  verifie('compteur illisible : plafond considéré atteint, aucun appel', r.appels.length === 0 && r.erreur && /plafond total/.test(r.erreur.message));
  repartir(); writeFileSync(join(dossier, 'preuve-2026-01-01.json'), JSON.stringify({ outil: 'x', appels_effectues: 'beaucoup' }), 'utf8');
  r = await lancer();
  verifie('preuve réelle au champ invalide (non numérique) : comptée comme plafond atteint', r.appels.length === 0 && r.erreur && /plafond total/.test(r.erreur.message));
  repartir(); writeFileSync(join(dossier, 'preuve-2026-01-01.json'), JSON.stringify({ outil: 'x', appels_effectues: 4 }), 'utf8');
  r = await lancer();
  verifie('compteur absent mais preuve réelle antérieure (4 appels) : ces appels sont comptés', r.appels.length === 7 && lireCompteurTest() === 11, `${r.appels.length}`);

  // 4. panne d'accès : un seul appel, arrêt ; le jeton cité par le message Meta n'est pas recopié ; la preuve est écrite
  repartir();
  r = await lancer({ auth: true });
  p = JSON.parse(preuves()[0].texte);
  verifie('jeton invalide : arrêt après 1 appel, erreur_auth, pas de relance, arrêt signalé à l\'appelant', r.appels.length === 1 && p.arret === 'erreur_auth' && r.resultat.arret === 'erreur_auth');
  verifie('panne d\'accès : aucune publication, aucun « vide »', p.publications.length === 0 && !p.journal.some((l) => l.statut === 'vide'));
  verifie('le message Meta contenant le jeton n\'est pas écrit', !preuves()[0].texte.includes(JETON.slice(0, 20)) && !r.lignes.join('\n').includes(JETON.slice(0, 20)));

  // 5. identité non conforme ; 6. contrôle non concluant ; 7. curseur piégé
  repartir();
  r = await lancer({ pseudo: 'un_autre_compte' });
  p = JSON.parse(preuves()[0].texte);
  verifie('pseudo SNY non conforme : arrêt, aucune requête business_discovery', p.arret === 'identite_non_verifiee' && !r.appels.some((a) => /business_discovery/.test(a.fields ?? '')) && p.identifiants.verifie === false);
  repartir();
  r = await lancer({ controleKo: true });
  p = JSON.parse(preuves()[0].texte);
  verifie('contrôle technique non lisible : arrêt, cibles non lues, verdicts déclarés non interprétables', p.arret === 'controle_non_concluant' && p.cibles_interpretables === false && !r.appels.some((a) => /cible_/.test(a.fields ?? '')));
  repartir();
  r = await lancer({ curseurPiege: true }, ['--medias', '--pages-suivantes', '2', '--cible', 'cible_a']);
  p = JSON.parse(preuves()[0].texte);
  verifie('curseur refusé avant envoi : pagination arrêtée avec une ligne de journal, aucune exception, publications déjà lues conservées', !r.erreur && p.journal.some((l) => l.statut === 'requete_non_construite') && p.publications.length === 2);

  // 8. verrou, TLS, jeton vide
  repartir(); writeFileSync(`${compteur}.lock`, '', 'utf8');
  r = await lancer();
  verifie('exécution concurrente (verrou présent) : refus, aucun appel, verrou conservé', r.appels.length === 0 && r.erreur && /autre exécution/.test(r.erreur.message) && existsSync(`${compteur}.lock`));
  repartir();
  r = await lancer({}, undefined, { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } });
  verifie('NODE_TLS_REJECT_UNAUTHORIZED=0 : refus avant tout appel', r.appels.length === 0 && r.erreur && /TLS|certificat/.test(r.erreur.message));
  r = await lancer({}, undefined, { jeton: '' });
  verifie('jeton vide : échec avant tout appel réseau', r.erreur && r.appels.length === 0);
  verifie('le verrou est retiré après une exécution normale', !existsSync(`${compteur}.lock`));

  // 9. chemins du fichier de jeton et options
  const refuse = (opts, env = {}) => { const o = options(opts); const av = {}; for (const [k, v] of Object.entries(env)) { av[k] = process.env[k]; process.env[k] = v; } try { lireJeton(o); return false; } catch (e) { return !e.message.includes('EAAB'); } finally { for (const [k, v] of Object.entries(av)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
  verifie('fichier de jeton dans le dépôt refusé', refuse(['--fichier-jeton', join(ROOT, 'README.md')]));
  verifie('fichier de jeton en chemin UNC refusé', refuse(['--fichier-jeton', '\\\\localhost\\C$\\x\\jeton.txt']));
  verifie('fichier de jeton dans un dossier OneDrive (nom ou variable d\'environnement) refusé', refuse(['--fichier-jeton', 'C:\\Users\\x\\OneDrive - Cdiscount\\jeton.txt']) && refuse(['--fichier-jeton', join(tmpdir(), 'jeton-test.txt')], { OneDrive: tmpdir() }));
  const tmp = join(tmpdir(), `sny-jeton-test-${process.pid}.txt`);
  writeFileSync(tmp, `${JETON}\n`, 'utf8');
  verifie('fichier de jeton hors dépôt et hors OneDrive : lu, espaces de fin retirés', lireJeton(options(['--fichier-jeton', tmp])) === JETON);
  writeFileSync(tmp, `${JETON}\nsecond jeton`, 'utf8');
  verifie('fichier de jeton à deux lignes refusé', refuse(['--fichier-jeton', tmp]));
  rmSync(tmp, { force: true });
  verifie('option sans valeur refusée (pas de repli silencieux sur la variable d\'environnement)', (() => { try { options(['--fichier-jeton']); return false; } catch { return true; } })() && (() => { try { options(['--version', '--medias']); return false; } catch { return true; } })());
  verifie('argument inconnu : refusé sans être recopié dans le message', (() => { try { options([`--${JETON}`]); return false; } catch (e) { return !e.message.includes('EAAB'); } })());

  // 9bis. Unified Login (jeton système) : type vérifié par me?fields=client_business_id, identité par me/assigned_instagram_accounts, jamais me/accounts
  repartir();
  const U = ['--parcours', 'unified', '--cible', 'cible_a', '--cible', 'cible_b'];
  r = await lancer({}, ['--etape', 'identification', ...U]);
  p = JSON.parse(preuves()[0].texte);
  verifie('Unified, étape identification : 2 appels seulement (type du jeton, comptes assignés), aucune lecture de cible', r.appels.length === 2 && r.appels[0].chemin === '/me' && r.appels[0].fields === 'client_business_id' && r.appels[1].chemin === '/me/assigned_instagram_accounts' && r.appels[1].fields === 'id,username');
  verifie('Unified : ni me/accounts ni appel de Page, et aucune requête business_discovery à ce stade', !r.appels.some((a) => a.chemin === '/me/accounts' || a.chemin === `/${PAGE}` || /business_discovery/.test(a.fields ?? '')));
  verifie('Unified : type confirmé, compte SNY trouvé dans la liste (casse ignorée), preuve étiquetée simulée et parcours « unified-login »', p.type_jeton === 'type_unified_confirme' && p.identifiants.verifie && p.identifiants.ig_user_id === IG && p.parcours === 'unified-login' && p.etape === 'identification' && p.source_reponses === 'simule' && r.resultat.arret === null);
  verifie('Unified : la preuve ne conserve ni l\'identifiant de portefeuille ni les autres comptes assignés', !preuves()[0].texte.includes('123456789012') && !preuves()[0].texte.includes('autre_compte') && p.journal.some((l) => l.etape === 'comptes_assignes' && l.nombre_comptes === 2));
  verifie('Unified : permissions déclarées par défaut = famille instagram_* (pas de pages_*), ads_read absente', p.permissions_declarees === 'instagram_basic,instagram_manage_insights');
  repartir();
  r = await lancer({}, ['--medias', ...U]);
  verifie('Unified, parcours complet : 6 appels (type, comptes assignés, contrôle, profil, lot, profil refusé) sur l\'identifiant trouvé', r.appels.length === 6 && r.appels.slice(2).every((a) => a.chemin === `/${IG}`), String(r.appels.length));
  repartir();
  r = await lancer({ nonUnified: true }, U);
  p = JSON.parse(preuves()[0].texte);
  verifie('jeton dont client_business_id est refusé : arrêt « type_jeton_non_confirme » après 1 appel, comptes assignés non appelés', r.appels.length === 1 && p.arret === 'type_jeton_non_confirme' && p.type_jeton !== 'type_unified_confirme');
  repartir();
  r = await lancer({ sansSny: true }, U);
  p = JSON.parse(preuves()[0].texte);
  verifie('compte SNY absent des comptes assignés : arrêt explicite, aucune lecture de cible, 2 appels', p.arret === 'compte_sny_absent_des_comptes_assignes' && r.appels.length === 2);
  repartir();
  r = await lancer({ sansSny: true, listePartielle: true }, U);
  verifie('liste de comptes assignés partielle et compte absent : « liste_partielle », jamais « absent » définitif', JSON.parse(preuves()[0].texte).arret === 'compte_sny_absent_liste_partielle');
  repartir();
  r = await lancer({ auth: true }, U);
  verifie('Unified, jeton refusé : 1 appel puis arrêt erreur_auth', r.appels.length === 1 && r.resultat.arret === 'erreur_auth');
  repartir();
  writeFileSync(join(dossier, 'preuve-2026-11-23T00-00-00-000Z.json'), JSON.stringify({ source_reponses: 'reseau', parcours: 'unified-login', type_jeton: 'type_unified_confirme', appels_effectues: 2, identifiants: { ig_user_id: IG, username: 'sousnosyeux_org', verifie: true } }), 'utf8');
  r = await lancer({}, ['--medias', '--reutiliser-identite', ...U]);
  p = JSON.parse(preuves().at(-1).texte);
  verifie('--reutiliser-identite : aucun appel d\'identification, 4 appels (contrôle, profil, lot, profil refusé) sur l\'identifiant d\'une preuve RÉELLE antérieure', r.appels.length === 4 && !r.appels.some((a) => a.chemin === '/me' || a.chemin === '/me/assigned_instagram_accounts') && p.journal.some((l) => l.statut === 'identite_reutilisee'), String(r.appels.length));
  repartir();
  writeFileSync(join(dossier, 'preuve-2026-11-23T00-00-00-000Z.json'), JSON.stringify({ source_reponses: 'simule', parcours: 'unified-login', type_jeton: 'type_unified_confirme', appels_effectues: 2, identifiants: { ig_user_id: IG, username: 'sousnosyeux_org', verifie: true } }), 'utf8');
  r = await lancer({}, ['--medias', '--reutiliser-identite', ...U]);
  verifie('--reutiliser-identite ignore une preuve simulée et refait l\'identification', r.appels[0]?.chemin === '/me');
  // 9ter. contrôle réutilisé et rejeu contre des preuves RÉELLES antérieures
  const preuveReelle = (nom, extra) => writeFileSync(join(dossier, nom), JSON.stringify({ source_reponses: 'reseau', parcours: 'unified-login', type_jeton: 'type_unified_confirme', appels_effectues: 2, identifiants: { ig_user_id: IG, username: 'sousnosyeux_org', verifie: true }, ...extra }), 'utf8');
  repartir();
  preuveReelle('preuve-2026-11-23T10-00-00-000Z.json', { date: '2026-11-23T10:00:00.000Z', controle: 'succes' });
  r = await lancer({}, ['--parcours', 'unified', '--medias', '--reutiliser-identite', '--reutiliser-controle', '--pages-suivantes', '1', '--cible', 'cible_a']);
  verifie('--reutiliser-controle : aucun appel de contrôle ; 3 appels (profil, lot, page suivante) ; contrôle marqué réutilisé', r.appels.length === 3 && !r.appels.some((a) => /bluebottle/.test(a.fields ?? '')) && JSON.parse(preuves().at(-1).texte).controle === 'succes_run_precedent', String(r.appels.length));
  repartir();
  preuveReelle('preuve-2026-11-23T10-00-00-000Z.json', { date: '2026-11-23T10:00:00.000Z', controle: 'succes' });
  preuveReelle('preuve-2026-11-23T11-00-00-000Z.json', { date: '2026-11-23T11:00:00.000Z', controle: 'erreur_permission' });
  r = await lancer({}, ['--parcours', 'unified', '--medias', '--reutiliser-identite', '--reutiliser-controle', '--cible', 'cible_a']);
  verifie('un échec de contrôle postérieur à un succès annule la réutilisation (le contrôle est refait)', r.appels.some((a) => /bluebottle/.test(a.fields ?? '')));
  repartir();
  const rows = normaliserPublications({ business_discovery: { username: 'cible_a', media: { data: [publi(1), publi(2)] } } }, { collecteLe: '2026-11-23T10:00:00.000Z' });
  preuveReelle('preuve-2026-11-23T10-00-00-000Z.json', { date: '2026-11-23T10:00:00.000Z', controle: 'succes', publications: rows });
  r = await lancer({}, ['--parcours', 'unified', '--medias', '--reutiliser-identite', '--reutiliser-controle', '--cible', 'cible_a']);
  p = JSON.parse(preuves().at(-1).texte);
  verifie('rejeu contre une preuve réelle : mêmes publications ⇒ 0 nouvelle, 2 identiques, 0 modifiée', p.bilan_rejeu.nouvelles === 0 && p.bilan_rejeu.identiques === 2 && p.bilan_rejeu.legende_modifiee === 0, JSON.stringify(p.bilan_rejeu));
  const exp = JSON.parse(readFileSync(join(dossier, 'export-publications.json'), 'utf8'));
  verifie('export : une ligne par publication (aucun doublon), portée « légende seule », preuve simulée non exportée', exp.publications.length === 2 && exp.portee_lecture === 'legende_seule' && new Set(exp.publications.map((x) => x.id_post)).size === 2);
  verifie('parcours par défaut = unified ; valeurs inconnues refusées ; --etape validée', options([]).parcours === 'unified' && options([]).etape === 'complet' && options(['--parcours', 'facebook']).permissions.includes('pages_show_list') && ['--parcours', '--etape'].every((k) => { try { options([k, 'x']); return false; } catch { return true; } }));

  // 10. jeton lu dans .env.local (convention du dépôt) : seule META_GRAPH_TOKEN est lue, le fichier doit être ignoré par Git
  const depot = join(tmpdir(), `sny-envlocal-${process.pid}`);
  rmSync(depot, { recursive: true, force: true }); mkdirSync(depot, { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: depot, stdio: 'ignore' });
  git('init', '-q');
  const env = join(depot, '.env.local');
  const refuseEnv = (f) => { try { lireJetonDansEnvLocal(f); return false; } catch (e) { return !e.message.includes('EAAB') && !e.message.includes('SECRET'); } };
  writeFileSync(env, `NEON_DATABASE_URL=postgres://SECRET\n${VARIABLE_JETON}="${JETON}"\nOPENROUTER_API_KEY=SECRET\n`, 'utf8');
  verifie('.env.local NON ignoré par Git : refus de lire (même avec la variable présente)', refuseEnv(env));
  writeFileSync(join(depot, '.gitignore'), '.env.local\n', 'utf8');
  verifie('.env.local ignoré par Git : META_GRAPH_TOKEN lu (guillemets retirés), aucune autre variable renvoyée', lireJetonDansEnvLocal(env) === JETON);
  writeFileSync(env, `OPENROUTER_API_KEY=SECRET\n`, 'utf8');
  verifie('variable absente : erreur nommant la variable, sans valeur', (() => { try { lireJetonDansEnvLocal(env); return false; } catch (e) { return e.message.includes(VARIABLE_JETON) && !e.message.includes('SECRET'); } })());
  writeFileSync(env, `${VARIABLE_JETON}=\n`, 'utf8');
  verifie('variable vide : refus (format de jeton)', refuseEnv(env));
  writeFileSync(env, `${VARIABLE_JETON}=ancien-jeton-trop-court\n${VARIABLE_JETON}=${JETON}\n`, 'utf8');
  verifie('plusieurs lignes : la dernière fait foi', lireJetonDansEnvLocal(env) === JETON);
  writeFileSync(env, `${VARIABLE_JETON}=${JETON}\n`, 'utf8'); git('add', '-f', '.env.local');
  verifie('.env.local SUIVI par Git (même ignoré) : refus', refuseEnv(env));
  const horsDepot = join(tmpdir(), `sny-horsdepot-${process.pid}`); mkdirSync(horsDepot, { recursive: true });
  writeFileSync(join(horsDepot, '.env.local'), `${VARIABLE_JETON}=${JETON}\n`, 'utf8');
  verifie('dossier qui n\'est pas un dépôt Git : refus (fail closed)', refuseEnv(join(horsDepot, '.env.local')));
  writeFileSync(join(depot, 'autre.txt'), `${VARIABLE_JETON}=${JETON}\n`, 'utf8');
  verifie('un fichier qui ne s\'appelle pas .env… est refusé', refuseEnv(join(depot, 'autre.txt')));
  verifie('la variable d\'environnement prime sur .env.local ; --fichier-jeton prime sur les deux', (() => { process.env[VARIABLE_JETON] = 'V'.repeat(30); try { return lireJeton(options(['--env-local', env])) === 'V'.repeat(30); } finally { delete process.env[VARIABLE_JETON]; } })());
  verifie('nom exact de la variable : META_GRAPH_TOKEN', VARIABLE_JETON === 'META_GRAPH_TOKEN');
  rmSync(depot, { recursive: true, force: true }); rmSync(horsDepot, { recursive: true, force: true });
} finally { rmSync(dossier, { recursive: true, force: true }); rmSync(dossierB, { recursive: true, force: true }); }

console.log(ko ? `\n${ko} échec(s)` : '\nTous les contrôles passent (fetch SIMULÉ).');
process.exit(ko ? 1 : 0);
