// =====================================================================
// scripts/sonde-business-discovery.mjs — preuve de lecture Instagram Business Discovery (LECTURE SEULE, appels bornés).
//
// Étapes (GET uniquement, sans relance) :
//   1. identifiants SNY : me/accounts → PAGE_ID?fields=instagram_business_account → IG_ID?fields=id,username ; le pseudo doit être celui attendu ;
//   2. contrôle technique (bluebottle) ; s'il n'est pas lisible, on s'arrête (les cibles ne seraient pas interprétables) ;
//   3. cibles : profil, et avec --medias un lot de publications (+ pages suivantes avec --pages-suivantes N).
// PLAFOND TOTAL de 12 appels RÉSEAU, tenu dans un compteur persistant (data/preuves-business-discovery/compteur-appels.json) décrémenté AVANT chaque appel :
//   il survit à un plantage, à la suppression d'une preuve et au changement de dossier de sortie. Une seule exécution à la fois (verrou).
// La preuve est écrite même si l'exécution est interrompue. Elle dit si les réponses viennent du réseau ou d'une simulation.
//
// Jeton : META_GRAPH_TOKEN dans .env.local (ignoré par Git, vérifié ; seule cette variable est lue), ou variable d'environnement, ou --fichier-jeton (hors dépôt, hors OneDrive).
//   Jamais en argument, jamais affiché.
// TLS : l'outil refuse de tourner si NODE_TLS_REJECT_UNAUTHORIZED=0 (le jeton ne part jamais sans validation de certificat).
//   Derrière un proxy d'inspection TLS, fournir l'autorité de l'entreprise via NODE_EXTRA_CA_CERTS.
// Code de sortie : 0 = lecture menée à terme ; 2 = arrêt (panne d'accès, quota, identité, contrôle, plafond) ; 1 = échec avant tout appel.
// Usage :
//   node scripts/sonde-business-discovery.mjs --medias --pages-suivantes 1
// =====================================================================
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, realpathSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, basename, resolve, relative, isAbsolute, join, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BUSINESS_DISCOVERY_VERSION, GRAPH_VERSION_DEFAUT, PERMISSIONS_BASE, construireRequete, urlAvecJeton, classerReponse, classerErreur, normaliserPublications, masquer,
  fusionnerPublications, stockDepuisPreuves, PERMISSIONS_UNIFIED, requeteMoi, requeteComptesAssignes, typeJetonUnified, extraireComptesAssignes,
  validerPseudo, validerIdNumerique, validerJeton, requeteComptes, requetePage, requeteIdentite, extrairePages, extraireIgDePage, identiteConforme,
} from './lib/business-discovery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE_DEFAUT = join(ROOT, 'data', 'preuves-business-discovery');
const CONTROLE = 'bluebottle'; // exemple Meta, hors périmètre éditorial SNY
const CIBLES_DEFAUT = ['leursvoixnotrecombat40', 'sosperiscolaire']; // lot d'essai, pas un plafond de veille
export const PLAFOND_TOTAL = 12;
const PSEUDO_SNY = 'sousnosyeux_org';

export function options(argv) {
  const o = { cibles: [], medias: false, version: GRAPH_VERSION_DEFAUT, pagesSuivantes: 0, pseudoSny: PSEUDO_SNY, permissions: null };
  let permissionsDonnees = false;
  const valeur = (i) => { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) throw new Error(`valeur manquante pour ${argv[i]}`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--medias') o.medias = true;
    else if (a === '--ig-user-id') o.igUserId = valeur(i++);
    else if (a === '--cible') o.cibles.push(valeur(i++));
    else if (a === '--fichier-jeton') o.fichierJeton = valeur(i++);
    else if (a === '--env-local') o.envLocal = valeur(i++);
    else if (a === '--parcours') o.parcours = valeur(i++);
    else if (a === '--etape') o.etape = valeur(i++);
    else if (a === '--reutiliser-identite') o.reutiliserIdentite = true;
    else if (a === '--reutiliser-controle') o.reutiliserControle = true;
    else if (a === '--version') o.version = valeur(i++);
    else if (a === '--pages-suivantes') o.pagesSuivantes = Number.parseInt(valeur(i++), 10);
    else if (a === '--permissions-declarees') { o.permissions = valeur(i++); permissionsDonnees = true; }
    else if (a === '--sortie') o.sortie = valeur(i++);
    else throw new Error('option inconnue'); // l'argument n'est jamais recopié : il pourrait être un jeton collé par erreur
  }
  o.parcours = o.parcours ?? 'unified'; o.etape = o.etape ?? 'complet';
  if (!['unified', 'facebook'].includes(o.parcours)) throw new Error('--parcours : unified ou facebook');
  if (!['identification', 'complet'].includes(o.etape)) throw new Error('--etape : identification ou complet');
  if (!permissionsDonnees) o.permissions = (o.parcours === 'unified' ? PERMISSIONS_UNIFIED : PERMISSIONS_BASE).join(',');
  if (!Number.isInteger(o.pagesSuivantes) || o.pagesSuivantes < 0 || o.pagesSuivantes > 3) throw new Error('--pages-suivantes entre 0 et 3');
  return o;
}

/** Dossiers synchronisés : variables OneDrive de Windows + toute composante de chemin « OneDrive ». */
function dossiersSynchronises() {
  return ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer'].map((k) => process.env[k]).filter(Boolean).map((p) => { try { return realpathSync(p); } catch { return resolve(p); } });
}
function reel(chemin) { // chemin résolu (liens, jonctions, noms courts 8.3), même si le fichier n'existe pas encore : on résout le plus proche ancêtre existant
  let c = resolve(chemin); const reste = [];
  while (!existsSync(c) && dirname(c) !== c) { reste.unshift(c.slice(dirname(c).length + 1)); c = dirname(c); }
  return join(realpathSync(c), ...reste);
}
const dedans = (enfant, parent) => { const r = relative(parent, enfant); return r === '' || (!r.startsWith('..' + sep) && r !== '..' && !isAbsolute(r)); };
function refuserSiDansDepotOuSynchronise(chemin, nom, { depotInterdit }) {
  if (/^\\\\/.test(chemin) || /^\/\//.test(chemin)) throw new Error(`${nom} : chemin réseau/UNC refusé`);
  const r = reel(chemin);
  if (depotInterdit && dedans(r, reel(ROOT))) throw new Error(`${nom} doit être HORS du dépôt`);
  if (/onedrive/i.test(r) || dossiersSynchronises().some((d) => dedans(r, d))) throw new Error(`${nom} ne doit pas être dans un dossier synchronisé (OneDrive)`);
  return r;
}

export const VARIABLE_JETON = 'META_GRAPH_TOKEN';

/**
 * Lit UNIQUEMENT META_GRAPH_TOKEN dans un fichier .env.local (aucune autre variable n'est chargée : pas de clé Neon, Supabase ou OpenRouter dans ce processus).
 * Le fichier doit être ignoré ET non suivi par Git (git check-ignore, exécuté sans shell) ; sinon refus. La valeur n'est jamais recopiée dans un message.
 */
export function lireJetonDansEnvLocal(chemin) {
  const f = resolve(chemin);
  if (!/^\.env(\..+)?$/.test(basename(f))) throw new Error('le fichier d\'environnement doit s\'appeler .env.local (ou .env)');
  if (!existsSync(f)) throw new Error('fichier .env.local introuvable');
  try { execFileSync('git', ['check-ignore', '-q', '--', f], { cwd: dirname(f), stdio: 'ignore' }); }
  catch { throw new Error('.env.local n\'est pas confirmé comme ignoré par Git (ou le dossier n\'est pas un dépôt) : refus de lire un jeton'); }
  const valeurs = readFileSync(f, 'utf8').split(/\r?\n/)
    .map((l) => new RegExp(`^\\s*(?:export\\s+)?${VARIABLE_JETON}\\s*=\\s*(.*?)\\s*$`).exec(l)?.[1])
    .filter((v) => v !== undefined);
  if (!valeurs.length) throw new Error(`${VARIABLE_JETON} absente de ${basename(f)}`);
  const brut = valeurs[valeurs.length - 1];
  return validerJeton(/^(["']).*\1$/.test(brut) ? brut.slice(1, -1) : brut);
}

/** `.env.local` du dépôt, ou celui du checkout principal quand on tourne dans un worktree (qui n'en a pas). */
function envLocalParDefaut() {
  const candidats = [join(ROOT, '.env.local')];
  try {
    const commun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (commun) candidats.push(join(dirname(commun), '.env.local'));
  } catch { /* pas de git : seul le dépôt courant est cherché */ }
  return candidats.find((c) => existsSync(c)) ?? null;
}

/** Ordre : --fichier-jeton, puis variable d'environnement, puis --env-local, puis .env.local découvert. Jamais en argument, jamais affiché. */
export function lireJeton(o) {
  if (o.fichierJeton) {
    const chemin = refuserSiDansDepotOuSynchronise(o.fichierJeton, 'le fichier de jeton', { depotInterdit: true });
    if (!existsSync(chemin)) throw new Error('fichier de jeton introuvable');
    return validerJeton(readFileSync(chemin, 'utf8'));
  }
  if (process.env[VARIABLE_JETON]) return validerJeton(process.env[VARIABLE_JETON]);
  const env = o.envLocal || envLocalParDefaut();
  if (!env) throw new Error(`jeton absent : renseigner ${VARIABLE_JETON} dans .env.local`);
  return lireJetonDansEnvLocal(env);
}

// ---- compteur persistant et verrou ----
function lireCompteur(chemin) {
  if (!existsSync(chemin)) return 0;
  try { const n = JSON.parse(readFileSync(chemin, 'utf8')).appels_reseau; if (Number.isInteger(n) && n >= 0) return n; } catch { /* illisible */ }
  return PLAFOND_TOTAL; // fail closed
}
function sommePreuves(dossier) { // filet : une preuve supprimée du compteur ne le remet pas à zéro ; un champ invalide compte comme plafond atteint
  let s = 0;
  if (!existsSync(dossier)) return 0;
  for (const f of readdirSync(dossier).filter((n) => /^preuve-.*\.json$/.test(n))) {
    try { const p = JSON.parse(readFileSync(join(dossier, f), 'utf8')); if (p.source_reponses === 'simule') continue; const n = p.appels_effectues; s += Number.isInteger(n) && n >= 0 ? n : PLAFOND_TOTAL; } catch { s += PLAFOND_TOTAL; }
  }
  return s;
}
function dernierIdentifiantVerifie(dossier, parcours = null) {
  let ig = null;
  if (!existsSync(dossier)) return null;
  for (const f of readdirSync(dossier).filter((n) => /^preuve-.*\.json$/.test(n)).sort()) {
    try { const p = JSON.parse(readFileSync(join(dossier, f), 'utf8')); if (p.source_reponses !== 'simule' && (!parcours || (p.parcours === parcours && (parcours !== 'unified-login' || p.type_jeton === 'type_unified_confirme'))) && p.identifiants?.verifie && /^\d{5,25}$/.test(String(p.identifiants.ig_user_id))) ig = p.identifiants; } catch { /* ignorée */ }
  }
  return ig;
}

/** Preuves décodées du dossier (celles qui ne se lisent pas sont ignorées ici ; le plafond, lui, les compte comme dépensées). */
function lirePreuves(dossier) {
  if (!existsSync(dossier)) return [];
  const sortieLue = [];
  for (const f of readdirSync(dossier).filter((n) => /^preuve-.*\.json$/.test(n)).sort()) { try { sortieLue.push(JSON.parse(readFileSync(join(dossier, f), 'utf8'))); } catch { /* ignorée */ } }
  return sortieLue;
}
/** Le DERNIER contrôle technique réellement exécuté (parcours Unified) a-t-il réussi ? Un échec postérieur à un succès annule la réutilisation. */
function dernierControleReel(dossier) {
  const executes = lirePreuves(dossier).filter((p) => p.source_reponses !== 'simule' && p.parcours === 'unified-login' && p.controle && !['non_execute', 'succes_run_precedent'].includes(p.controle));
  return executes.length > 0 && executes[executes.length - 1].controle === 'succes';
}

async function appeler(req, jeton, { timeoutMs = 20000, fetchImpl = fetch } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(urlAvecJeton(req, jeton), { signal: ctl.signal, redirect: 'error' });
    let corps; try { corps = await r.json(); } catch { corps = undefined; }
    return { http: r.status, corps };
  } catch { return { http: 0, corps: undefined }; } finally { clearTimeout(t); }
}

export async function executer(o, jeton, { fetchImpl = fetch, log = console.log } = {}) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('NODE_TLS_REJECT_UNAUTHORIZED=0 refusé : le jeton ne doit pas partir sans validation de certificat (utiliser NODE_EXTRA_CA_CERTS)');
  validerJeton(jeton);
  const cibles = (o.cibles.length ? o.cibles : CIBLES_DEFAUT).map(validerPseudo);
  const pseudoSny = validerPseudo(o.pseudoSny);
  const sortie = refuserSiDansDepotOuSynchronise(o.sortie || SORTIE_DEFAUT, 'la sortie', { depotInterdit: false });
  if (!dedans(sortie, reel(join(ROOT, 'data')))) throw new Error('la sortie doit rester dans data/');
  const reseau = fetchImpl === fetch;
  const fichierCompteur = o.compteur || join(SORTIE_DEFAUT, 'compteur-appels.json');
  mkdirSync(dirname(fichierCompteur), { recursive: true }); mkdirSync(sortie, { recursive: true });

  let verrou;
  try { verrou = openSync(`${fichierCompteur}.lock`, 'wx'); } catch { throw new Error('une autre exécution est en cours (ou verrou résiduel : supprimer le fichier .lock après vérification)'); }
  const collecteLe = new Date().toISOString();
  const journal = []; let appels = 0; let arret = null; const publications = []; const suites = {};
  let identifiants = { ig_user_id: null, page_id: null, username: null, verifie: false }; let controle = 'non_execute'; let typeJeton = 'non_verifie';
  let compteurAvant = Math.max(lireCompteur(fichierCompteur), sommePreuves(sortie));
  const debut = compteurAvant;
  if (compteurAvant >= PLAFOND_TOTAL) { closeSync(verrou); unlinkSync(`${fichierCompteur}.lock`); throw new Error(`plafond total de ${PLAFOND_TOTAL} appels atteint (${compteurAvant} déjà comptés)`); }

  try {
    /** Un appel : réservé et écrit dans le compteur AVANT l'envoi ; null si arrêt décidé ou plafond atteint. */
    const faire = async (etape, cible, requete, classeur) => {
      if (arret) return null;
      if (compteurAvant >= PLAFOND_TOTAL) { arret = 'plafond_appels'; return null; }
      compteurAvant++; appels++;
      writeFileSync(fichierCompteur, JSON.stringify({ appels_reseau: compteurAvant, maj: new Date().toISOString() }), 'utf8');
      const { http, corps } = await appeler(requete, jeton, { fetchImpl });
      const classe = classeur(http, corps);
      journal.push({ etape, cible, http, ...classe });
      if (classe.statut === 'erreur_auth' || classe.statut === 'quota') arret = classe.statut; // jamais de relance : panne d'accès, pas « aucune nouvelle »
      return { classe, corps };
    };
    const classeSimple = (http, corps) => classerErreur(http, corps) ?? { statut: 'succes' };

    // 1a. Unified Login : jeton système (SUAT). `me` ne renvoie PAS un compte Instagram : type vérifié par client_business_id, puis me/assigned_instagram_accounts.
    //     Aucun me/accounts ni Page dans ce parcours.
    const reprise = o.parcours === 'unified' && o.reutiliserIdentite ? dernierIdentifiantVerifie(sortie, 'unified-login') : null;
    if (reprise) { identifiants = { ig_user_id: reprise.ig_user_id, page_id: null, username: reprise.username, verifie: true }; typeJeton = 'type_unified_confirme_run_precedent'; journal.push({ etape: 'identite', statut: 'identite_reutilisee', detail: 'type du jeton et compte vérifiés par une preuve réelle antérieure (aucun appel)' }); }
    else if (o.parcours === 'unified') {
      const t = await faire('type_jeton', 'me', requeteMoi('client_business_id', { version: o.version }),
        (h, c) => classerErreur(h, c) ?? (typeJetonUnified(c) ? { statut: 'type_unified_confirme', client_business_id_present: true } : { statut: 'type_non_confirme', detail: 'client_business_id absent de la réponse' }));
      typeJeton = t?.classe.statut ?? 'non_verifie';
      if (t && !arret && t.classe.statut !== 'type_unified_confirme') arret = 'type_jeton_non_confirme';
      if (!arret) {
        const c = await faire('comptes_assignes', 'me/assigned_instagram_accounts', requeteComptesAssignes({ version: o.version }), classeSimple);
        if (c?.classe.statut === 'succes') {
          const { ok, comptes, suite } = extraireComptesAssignes(c.corps);
          const trouve = comptes.find((x) => x.username.toLowerCase() === pseudoSny.toLowerCase());
          if (!ok) { arret = 'reponse_comptes_assignes_inexploitable'; journal.push({ etape: 'comptes_assignes', statut: 'erreur_inconnue', detail: 'réponse sans liste de comptes' }); }
          else if (trouve) { identifiants = { ig_user_id: trouve.id, page_id: null, username: trouve.username, verifie: true }; journal.push({ etape: 'comptes_assignes', statut: 'identite_conforme', attendu: pseudoSny, nombre_comptes: comptes.length }); }
          else { arret = suite ? 'compte_sny_absent_liste_partielle' : 'compte_sny_absent_des_comptes_assignes'; journal.push({ etape: 'comptes_assignes', statut: 'compte_non_trouve', attendu: pseudoSny, nombre_comptes: comptes.length, liste_partielle: suite }); }
        }
      }
    } else {
    // 1b. Facebook Login (jeton utilisateur Facebook) : me/accounts → Page → identité
    const anterieur = o.igUserId ? null : dernierIdentifiantVerifie(sortie);
    const candidatsIg = [];
    if (o.igUserId) candidatsIg.push({ ig: validerIdNumerique(o.igUserId), page: null });
    else if (anterieur) candidatsIg.push({ ig: anterieur.ig_user_id, page: anterieur.page_id ?? null });
    else {
      const c = await faire('comptes', 'me/accounts', requeteComptes({ version: o.version }), classeSimple);
      const { ok, pages, suite } = c?.classe.statut === 'succes' ? extrairePages(c.corps) : { ok: false, pages: [], suite: null };
      if (c?.classe.statut === 'succes' && !ok) { arret = 'reponse_comptes_inexploitable'; journal.push({ etape: 'comptes', statut: 'erreur_inconnue', detail: 'réponse sans liste de Pages' }); }
      if (ok && suite) journal.push({ etape: 'comptes', statut: 'partiel', detail: 'liste de Pages incomplète (curseur suivant présent)' });
      const nom = pages.filter((p) => /sous\s*nos\s*yeux|\bsny\b/i.test(p.name));
      const candidates = nom.length ? nom : (pages.length <= 3 ? pages : []);
      if (ok && !candidates.length) { arret = 'page_sny_introuvable'; journal.push({ etape: 'comptes', statut: 'page_non_identifiee', nombre_pages: pages.length }); }
      for (const p of candidates) {
        if (arret) break;
        const r = await faire('page', p.id, requetePage(p.id, { version: o.version }), classeSimple);
        const ig = r?.classe.statut === 'succes' ? extraireIgDePage(r.corps) : null;
        if (r?.classe.statut === 'succes' && !ig) journal.push({ etape: 'page', cible: p.id, statut: 'sans_compte_instagram_visible', detail: 'aucun instagram_business_account renvoyé : lien absent ou accès manquant, non distingués' });
        if (ig) candidatsIg.push({ ig, page: p.id });
      }
    }
    // Identité : une vérification par candidat jusqu'à correspondance avec le pseudo attendu.
    for (const cand of candidatsIg) {
      if (arret || identifiants.verifie) break;
      const r = await faire('identite', cand.ig, requeteIdentite(cand.ig, { version: o.version }), classeSimple);
      if (r?.classe.statut !== 'succes') continue;
      const conforme = identiteConforme(r.corps, pseudoSny);
      journal.push({ etape: 'identite', cible: cand.ig, statut: conforme ? 'identite_conforme' : 'identite_non_conforme', attendu: pseudoSny, obtenu: r.corps?.username ? String(r.corps.username).slice(0, 40) : null });
      if (conforme) identifiants = { ig_user_id: cand.ig, page_id: cand.page, username: String(r.corps.username), verifie: true };
    }
    if (!identifiants.verifie && !arret) arret = candidatsIg.length ? 'identite_non_verifiee' : 'identifiant_instagram_introuvable';
    }
    if (!identifiants.verifie && !arret) arret = 'identite_non_verifiee';

    // 2. Contrôle, 3. cibles (sautés avec --etape identification : on s'arrête pour examiner le type de jeton et l'identité)
    if (identifiants.verifie && !arret && o.etape === 'complet') {
      const lire = async (pseudo, medias, apres = null) => {
        let requete;
        try { requete = construireRequete({ igUserId: identifiants.ig_user_id, pseudo, medias, apres, version: o.version }); }
        catch { journal.push({ etape: medias ? 'publications' : 'profil', cible: pseudo, statut: 'requete_non_construite', detail: 'curseur ou paramètre refusé avant envoi ; aucun appel' }); return null; }
        const r = await faire(medias ? 'publications' : 'profil', pseudo, requete, (h, c) => classerReponse(h, c, { medias, suite: Boolean(apres) }));
        if (r?.corps && medias) publications.push(...normaliserPublications(r.corps, { collecteLe }));
        return r;
      };
      if (o.reutiliserControle && o.parcours === 'unified' && dernierControleReel(sortie)) {
        controle = 'succes_run_precedent'; // contrôle déjà réussi dans une preuve RÉELLE avec ce parcours : aucun appel
        journal.push({ etape: 'controle', cible: CONTROLE, statut: 'controle_reutilise', detail: 'contrôle technique réussi par une preuve réelle antérieure (aucun appel)' });
      } else { const c = await lire(CONTROLE, false); controle = c?.classe.statut ?? 'non_execute'; }
      if (!controle.startsWith('succes') && !arret) arret = 'controle_non_concluant'; // sans contrôle lisible, les verdicts de cibles ne seraient pas interprétables
      for (const cible of cibles) {
        if (arret) break;
        const r = await lire(cible, false);
        if (!(r && ['succes', 'partiel'].includes(r.classe.statut) && o.medias)) continue;
        let m = await lire(cible, true);
        const apres = (x) => x?.corps?.business_discovery?.media?.paging?.cursors?.after ?? null;
        for (let i = 0; i < o.pagesSuivantes && apres(m); i++) m = await lire(cible, true, apres(m));
        suites[cible] = m ? Boolean(apres(m)) : null; // null = lot non lu
      }
    }
  } finally {
    // Rejeu : ce lot comparé aux publications déjà lues dans les preuves RÉELLES antérieures (le stock se reconstruit, il n'est jamais saisi à la main).
    const avantRejeu = fusionnerPublications(stockDepuisPreuves(lirePreuves(sortie)), publications);
    const bilanRejeu = { deja_connues_avant_ce_lot: avantRejeu.stock.size - avantRejeu.nouvelles, nouvelles: avantRejeu.nouvelles, identiques: avantRejeu.identiques, legende_modifiee: avantRejeu.modifiees, doublons_dans_le_lot: avantRejeu.doublons_dans_le_lot };
    const preuve = {
      outil: BUSINESS_DISCOVERY_VERSION, date: collecteLe, version_graph: o.version, parcours: o.parcours === 'unified' ? 'unified-login' : 'facebook-login',
      etape: o.etape, type_jeton: o.parcours === 'unified' ? typeJeton : 'non_applicable',
      source_reponses: reseau ? 'reseau' : 'simule', // une preuve « simule » ne compte jamais comme lecture réelle
      permissions_declarees: o.permissions, // la sonde ne lit pas les permissions du jeton : valeur déclarée par l'opérateur
      appels_effectues: appels, compteur_avant: debut, compteur_apres: compteurAvant, plafond_total: PLAFOND_TOTAL, arret,
      identifiants, controle, cibles_interpretables: controle.startsWith('succes'), journal, curseur_suivant_present: suites, bilan_rejeu: bilanRejeu, publications,
      limites: 'Lecture datée de cette exécution ; légende seule ; images, vidéos et commentaires non lus ; ordre de réponse non garanti ; un curseur « after » ne prouve pas qu\'il reste des publications ; résultat valable pour ces cibles à cette date.',
    };
    const fichier = join(sortie, `preuve-${collecteLe.replace(/[:.]/g, '-')}.json`);
    try { writeFileSync(fichier, masquer(JSON.stringify(preuve, null, 2), jeton), 'utf8'); } catch { /* le compteur reste la référence */ }
    try { writeFileSync(join(sortie, 'export-publications.json'), JSON.stringify({ genere_le: collecteLe, source: 'preuves RÉELLES du dossier (source_reponses ≠ simule)', portee_lecture: 'legende_seule', publications: [...stockDepuisPreuves(lirePreuves(sortie)).values()].map(({ empreintes, ...e }) => ({ ...e, legende_modifiee_depuis_premiere_lecture: empreintes.length > 1 })) }, null, 2), 'utf8'); } catch { /* l'export se régénère depuis les preuves */ }
    try { closeSync(verrou); unlinkSync(`${fichierCompteur}.lock`); } catch { /* verrou déjà retiré */ }
    if (publications.length) log(`rejeu : ${bilanRejeu.nouvelles} nouvelle(s), ${bilanRejeu.identiques} identique(s), ${bilanRejeu.legende_modifiee} légende(s) modifiée(s), ${bilanRejeu.doublons_dans_le_lot} doublon(s) dans le lot`);
    for (const l of journal) log(`${String(l.cible ?? '').padEnd(26)} ${String(l.etape).padEnd(13)} ${l.http != null ? `HTTP ${String(l.http).padEnd(3)} ` : ''}${l.statut}${l.code ? ` (code ${l.code})` : ''}`);
    log(`${appels} appel(s), ${compteurAvant}/${PLAFOND_TOTAL} cumulés${arret ? ` — arrêt : ${arret}` : ''} — source : ${preuve.source_reponses} — preuve : ${relative(ROOT, fichier)}`);
  }
  return { appels, arret, controle, identifiants, publications };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const o = options(process.argv.slice(2));
    const r = await executer(o, lireJeton(o));
    process.exitCode = r.arret ? 2 : 0;
  } catch (e) { console.error(`Échec : ${masquer(e?.message || 'erreur')}`); process.exitCode = 1; }
}
