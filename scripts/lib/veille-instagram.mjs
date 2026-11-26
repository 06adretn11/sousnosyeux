// =====================================================================
// scripts/lib/veille-instagram.mjs — comptes Instagram professionnels suivis par la veille « sources suivies » (PILOTE, désactivé par défaut).
//
// Rôle : lire, par Business Discovery (lecture seule), les dernières publications des comptes du registre, dans un BUDGET D'APPELS PAR CYCLE,
// et les rendre au parcours existant (`parcourirSources`) comme des documents déjà lus. Rien d'autre : ni classement, ni proposition, ni écriture ici.
// Le classement, le rattachement PAR LE TEXTE, la mémoire (`source_resolutions`) et les propositions sont ceux de la chaîne existante.
//
// Doctrine appliquée :
//   · un seul budget par cycle (défaut 4 appels) : une première page par compte, puis des pages supplémentaires SEULEMENT quand la dernière page lue
//     ne contient aucune publication déjà connue (l'historique couvert n'est pas atteint) ; au plafond, l'historique non couvert est DIT ;
//   · dédoublonnage par identifiant de publication (dans le cycle) et par permalien en mémoire (entre cycles) ;
//   · une panne d'accès (jeton, quota) est une panne : jamais « aucune nouvelle » ;
//   · les témoignages anonymes sensibles sont ÉCARTÉS avant toute lecture, classement ou conservation de leur texte (seul un marqueur sans texte est gardé) ;
//   · légende seule : images, vidéos, commentaires et messages ne sont pas lus ; une légende ne prouve ni un fait ni une étape judiciaire.
// Le jeton (META_GRAPH_TOKEN) n'est jamais journalisé ; aucune relance ; TLS toujours validé.
// =====================================================================
import { readFileSync } from 'node:fs';
import {
  GRAPH_VERSION_DEFAUT, construireRequete, urlAvecJeton, classerReponse, normaliserPublications, validerJeton, validerIdNumerique, validerPseudo,
} from './business-discovery.mjs';

export const VERSION_VEILLE_INSTAGRAM = 'veille-instagram-0.1.0';
export const BUDGET_CYCLE_DEFAUT = 4;
export const BUDGET_CYCLE_MAX = 80; // mesuré le 26/11/2026 : une page de 25 publications par appel, ~0,4 à 2 s, usage annoncé par Meta ~0,25 % du quota par appel ; 80 laisse de la marge pour ~60 comptes + pages d'historique

/** Configuration du pilote : `_meta.instagram` du registre. Absente ou incomplète ⇒ pilote inutilisable (jamais de valeur par défaut pour l'identifiant). */
export function chargerConfigInstagram(chemin) {
  const brut = JSON.parse(readFileSync(chemin, 'utf8'));
  const c = Array.isArray(brut) ? null : brut._meta?.instagram;
  if (!c) return null;
  const budget = c.budget_appels_par_cycle ?? BUDGET_CYCLE_DEFAUT;
  if (!Number.isInteger(budget) || budget < 1 || budget > BUDGET_CYCLE_MAX) throw new Error(`budget_appels_par_cycle invalide (1 à ${BUDGET_CYCLE_MAX})`);
  const taille = c.taille_page ?? 10;
  if (!Number.isInteger(taille) || taille < 1 || taille > 50) throw new Error('taille_page invalide (1 à 50)');
  return { ig_user_id: validerIdNumerique(c.ig_user_id), version: c.version_graph || GRAPH_VERSION_DEFAUT, budget, taille_page: taille, parcours: c.parcours || 'unified' };
}

// ---------------------------------------------------------------------
// Écarts : témoignages anonymes sensibles
// ---------------------------------------------------------------------
/**
 * Un témoignage anonyme (« Témoignage » en tête de légende, souvent suivi d'un récit entre guillemets) n'est ni lu, ni classé, ni conservé :
 * anonyme, non localisé, parfois très sensible. Ne se confond pas avec « appel à témoins » ni avec la légende d'un collectif qui parle d'un témoignage.
 * @returns {string|null} motif d'écart
 */
export function ecarterPublication(caption) {
  const texte = String(caption || '').normalize('NFC');
  // Première ligne utile : ni vide, ni hashtags seuls. Lettres espacées (« T É M O I G N A G E ») recollées.
  const ligne = (texte.split(/\n+/).map((l) => l.trim()).find((l) => l && !/^(?:#\S+\s*)+$/.test(l)) || '').replace(/^[^\p{L}]+/u, '');
  const debut = (/^(?:\p{L}\s){5,}/u.test(ligne) ? ligne.replace(/(?<=\p{L})\s(?=\p{L}(?:\s|$))/gu, '') : ligne).slice(0, 60);
  if (/^(?:nouveau |un |le |notre |ce |mon )?(?:t[eé]moignages?|r[eé]cits? d|parole d|paroles d|verbatim|t[eé]moin\b)/iu.test(debut)) return 'TEMOIGNAGE_ANONYME';
  // Filet en échec fermé : récit à la première personne entre guillemets, dans les premiers mots, sans amorce « témoignage » (parent ou agent qui raconte).
  const tete = texte.slice(0, 300);
  if (/(?:^|[^\p{L}])(?:mon|ma|mes)\s+(?:fils|fille|enfant|enfants|petit|petite|bébé|gamin|gamine)\b/iu.test(tete) && /[«"“]/.test(tete)) return 'RECIT_PREMIERE_PERSONNE';
  return null;
}

/** Première ligne utile de la légende (sans emojis ni ponctuation de tête), bornée. */
export function titreDe(caption) {
  const ligne = String(caption || '').split(/\n+/).map((l) => l.replace(/^[^\p{L}\p{N}]+/u, '').trim()).find((l) => l.length > 0) || '';
  return ligne.length > 140 ? `${ligne.slice(0, 139)}…` : ligne;
}

/** Document au format de `lireDocument` (déjà lu : aucune requête à instagram.com). Écarté ⇒ aucun texte. */
export function postVersDocument(post) {
  const motif = ecarterPublication(post.legende);
  const date = post.publie_le ? String(post.publie_le).slice(0, 10) : null;
  const base = { ok: true, url: post.url, url_finale: post.url, publie_le: date, extraction: 'instagram-business-discovery', portee_lecture: 'legende_seule', id_post: post.id_post };
  return motif ? { ...base, titre: '', corps: '', ecarte: motif } : { ...base, titre: titreDe(post.legende), corps: String(post.legende || '') };
}

// ---------------------------------------------------------------------
// Lecture bornée : première page par compte, pages supplémentaires selon le besoin
// ---------------------------------------------------------------------
/**
 * @param {{ comptes: {page:object, pseudo:string}[], connu: (permalien:string)=>boolean,
 *           appeler: (pseudo:string, apres:string|null)=>Promise<{classe:object, corps:object, http?:number}>,
 *           budget?: number, collecteLe?: string }} o
 * @returns {{ appels: number, budget: number, arret: string|null, comptes: object[] }}
 */
export async function lireComptes({ comptes, connu, appeler, budget = BUDGET_CYCLE_DEFAUT, collecteLe = new Date().toISOString() }) {
  if (!Number.isInteger(budget) || budget < 1 || budget > BUDGET_CYCLE_MAX) throw new Error('budget invalide');
  const etats = comptes.map((c) => ({ page: c.page, pseudo: validerPseudo(c.pseudo), posts: [], ids: new Set(), curseur: null, pages_lues: 0, appels: 0, ok: false, motif: 'NON_LU:BUDGET', http: null, besoin_suite: false, plus_ancien_lu: null, sans_permalien: 0 }));
  let appels = 0; let arret = null;

  const lirePage = async (e) => {
    if (arret || appels >= budget) return;
    appels++; e.appels++;
    let r;
    try { r = await appeler(e.pseudo, e.curseur); } catch { r = { classe: { statut: 'erreur_reseau' }, corps: undefined, http: 0 }; }
    const { classe } = r; e.http = r.http ?? null;
    if (classe.statut === 'erreur_auth' || classe.statut === 'quota' || classe.statut === 'erreur_permission') { // permission manquante : globale, inutile d'essayer les autres comptes
      arret = classe.statut;
      // Panne d'accès : les comptes DÉJÀ lus gardent leurs publications ; ceux qui ne l'étaient pas sont en panne, pas « sans nouveauté ».
      if (!e.pages_lues) { e.ok = false; e.motif = `ACCES:${classe.statut}${classe.code ? `:${classe.code}` : ''}`; } else e.incident_suite = classe.statut;
      return; // besoin_suite conservé : l'historique non lu reste signalé
    }
    if (!['succes', 'partiel'].includes(classe.statut)) {
      if (!e.pages_lues) { e.ok = false; e.motif = `LECTURE:${classe.statut}${classe.code ? `:${classe.code}` : ''}`; } else e.incident_suite = classe.statut;
      e.interrompu = true; return; // jamais de relance ; besoin_suite conservé
    }
    const lignes = normaliserPublications(r.corps, { collecteLe });
    const nouvelles = lignes.filter((l) => !e.ids.has(l.id_post)); // dédoublonnage par identifiant de publication
    const avecUrl = nouvelles.filter((l) => l.url); e.sans_permalien += nouvelles.length - avecUrl.length; // sans permalien : ni mémoire ni document possibles, comptées
    const inconnues = avecUrl.filter((l) => !connu(l.url));
    for (const l of nouvelles) { e.ids.add(l.id_post); e.posts.push(l); }
    e.ok = true; e.motif = null; e.pages_lues++;
    e.curseur = r.corps?.business_discovery?.media?.paging?.cursors?.after || null;
    const dates = e.posts.map((p) => p.publie_le).filter(Boolean).sort();
    e.plus_ancien_lu = dates[0] ? dates[0].slice(0, 10) : null;
    // Historique non atteint : un curseur existe ET aucune publication de cette page n'était déjà connue.
    e.besoin_suite = Boolean(e.curseur) && avecUrl.length > 0 && inconnues.length === avecUrl.length;
    // Page non vide, curseur présent, mais rien de nouveau (identifiants déjà vus) : pagination incohérente, jamais « historique couvert ».
    if (e.curseur && lignes.length > 0 && nouvelles.length === 0) { e.pagination_incoherente = true; e.interrompu = true; }
  };

  for (const e of etats) await lirePage(e); // phase 1 : une première page par compte
  while (!arret && appels < budget) { // phase 2 : pages supplémentaires, en priorité là où l'historique lu est le moins profond
    const candidats = etats.filter((e) => e.ok && e.besoin_suite && !e.interrompu).sort((a, b) => String(b.plus_ancien_lu).localeCompare(String(a.plus_ancien_lu)));
    if (!candidats.length) break;
    await lirePage(candidats[0]);
  }
  return {
    appels, budget, arret,
    comptes: etats.map((e) => ({
      page: e.page, pseudo: e.pseudo, ok: e.ok, motif: !e.ok && e.motif === 'NON_LU:BUDGET' && arret ? `ACCES:${arret}` : e.motif, http: e.http, posts: e.posts, pages_lues: e.pages_lues, appels: e.appels, plus_ancien_lu: e.plus_ancien_lu, incident_suite: e.incident_suite || null,
      // Au plafond (ou sur panne) avec un curseur et une dernière page entièrement nouvelle : l'historique plus ancien n'a PAS été couvert. Dit, jamais silencieux.
      historique_non_couvert: e.ok && Boolean(e.curseur) && (e.besoin_suite || Boolean(e.pagination_incoherente)),
      sans_permalien: e.sans_permalien, pagination_incoherente: Boolean(e.pagination_incoherente),
    })),
  };
}

// ---------------------------------------------------------------------
// Appel réel (une seule tentative par appel, aucune relance)
// ---------------------------------------------------------------------
/** @returns {(pseudo:string, apres:string|null)=>Promise<{classe:object, corps:object|undefined, http:number}>} */
export function appelerReel({ igUserId, jeton, version = GRAPH_VERSION_DEFAUT, limite = 10, fetchImpl = fetch, timeoutMs = 20000 }) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('NODE_TLS_REJECT_UNAUTHORIZED=0 refusé : le jeton ne doit pas partir sans validation de certificat');
  validerJeton(jeton); validerIdNumerique(igUserId);
  return async (pseudo, apres) => {
    const requete = construireRequete({ igUserId, pseudo, medias: true, limite, apres, version });
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(urlAvecJeton(requete, jeton), { signal: ctl.signal, redirect: 'error' });
      let corps; try { corps = await r.json(); } catch { corps = undefined; }
      return { classe: classerReponse(r.status, corps, { medias: true, suite: Boolean(apres) }), corps, http: r.status };
    } catch { return { classe: classerReponse(0, undefined, { medias: true }), corps: undefined, http: 0 }; } finally { clearTimeout(t); }
  };
}

/** Garde du registre : un alias trop générique ou partagé confondrait deux organismes (ex. un collectif local et un collectif auditionné ailleurs). */
const ALIAS_GENERIQUES = /^(?:le |la |les |un |une )?(?:collectif|association|collectif de (?:familles|parents|riverains)(?: de [^,;]+)?|parents|familles|mobilisation|comite)\s*$/i;
export function verifierAliasDistincts(organismes) {
  const vus = new Map(); const problemes = [];
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const o of organismes) {
    for (const a of [o.nom, ...(o.alias || [])].filter(Boolean)) {
      const n = norm(a);
      if (ALIAS_GENERIQUES.test(a.trim())) problemes.push(`alias trop générique : « ${a} » (${o.id})`);
      if (vus.has(n) && vus.get(n) !== o.id) problemes.push(`alias partagé : « ${a} » (${o.id} / ${vus.get(n)})`);
      vus.set(n, o.id);
    }
  }
  return problemes;
}

/** Lecteur de remplacement quand le pilote est demandé mais inutilisable (jeton ou configuration absents) : chaque compte est EN PANNE, jamais « sans nouveauté ». */
export function lecteurEnPanne(motif, budget = 0) {
  return async ({ comptes }) => ({
    appels: 0, budget, arret: motif,
    comptes: comptes.map((c) => ({ page: c.page, pseudo: c.pseudo, ok: false, motif: `ACCES:${motif}`, http: null, posts: [], pages_lues: 0, appels: 0, plus_ancien_lu: null, incident_suite: null, historique_non_couvert: false })),
  });
}
