// =====================================================================
// scripts/lib/business-discovery.mjs — lecture Instagram Business Discovery (parcours Facebook Login), LECTURE SEULE.
//
// Périmètre volontairement minimal : construire la requête, classer la réponse, normaliser des publications.
// Aucune écriture, aucun accès à un média tiers par son identifiant, aucune base, aucune proposition.
// Ni dédoublonnage ni pagination automatique ici : ils viennent APRÈS une première lecture réelle réussie.
//
// Le jeton n'entre jamais dans un journal, une sortie ou un message d'erreur : `masquer` est appliqué partout.
// Référence : developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
// Vérifié dans la documentation le 23/11/2026 : jeton utilisateur Facebook avec instagram_basic, instagram_manage_insights, pages_read_engagement ;
//  ads_read seulement si le rôle sur la Page vient de Business Manager ; curseurs before/after sans URL next ; GET d'un média tiers refusé ; liste des codes de quota.
// NON vérifié (à confirmer par le premier appel réel) : syntaxe media.limit(n).after(curseur), limite maximale de page, forme des curseurs,
//  limit=100 sur me/accounts, correspondance des codes d'erreur hors quota.
// =====================================================================
import { createHash } from 'node:crypto';

export const BUSINESS_DISCOVERY_VERSION = 'business-discovery-0.1.0';
/** Version Graph indiquée par la documentation consultée le 23/11/2026. À reconfirmer avant chaque campagne. */
export const GRAPH_VERSION_DEFAUT = 'v27.0';
export const CHAMPS_MEDIA = 'id,caption,timestamp,permalink,media_type';

const RE_PSEUDO = /^[A-Za-z0-9._]{1,30}$/; // pseudo Instagram ; refuse toute accolade, parenthèse ou espace (le pseudo est inséré dans une expression de champs)
const RE_ID = /^\d{5,25}$/;
const RE_VERSION = /^v\d{1,3}\.\d{1,2}$/;

export function validerPseudo(p) {
  const s = String(p ?? '').trim().replace(/^@/, '');
  if (!RE_PSEUDO.test(s)) throw new Error('pseudo invalide');
  return s;
}
export function validerIdNumerique(id) {
  const s = String(id ?? '').trim();
  if (!RE_ID.test(s)) throw new Error('identifiant numérique invalide');
  return s;
}

/** Retire toute trace d'un jeton d'un texte (valeur exacte fournie, paramètre access_token, en-tête Bearer, longues chaînes de type jeton). */
export function masquer(texte, jeton = null) {
  let s = String(texte ?? '');
  if (jeton && jeton.length >= 8) s = s.split(jeton).join('[JETON]');
  return s
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[JETON]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{10,}/g, 'Bearer [JETON]')
    .replace(/\bEA[A-Za-z0-9]{40,}\b/g, '[JETON]');
}

/**
 * Requête GET Business Discovery. Retourne le chemin et les paramètres SANS jeton ; l'appelant ajoute le jeton au dernier moment.
 * - sans `medias` : identité du compte observé (id, username, media_count) — test d'accès ;
 * - avec `medias` : expansion media.limit(n)[.after(curseur)]{champs}. Pas d'accès direct aux médias tiers.
 */
export function construireRequete({ igUserId, pseudo, medias = false, limite = 10, apres = null, version = GRAPH_VERSION_DEFAUT }) {
  if (!RE_VERSION.test(version)) throw new Error('version Graph invalide');
  const id = validerIdNumerique(igUserId);
  const cible = validerPseudo(pseudo);
  let interieur = 'id,username,media_count';
  if (medias) {
    const n = Math.max(1, Math.min(Number.parseInt(limite, 10) || 10, 50));
    let edge = `media.limit(${n})`;
    if (apres) {
      if (!/^[A-Za-z0-9_=+/:.-]{4,1000}$/.test(String(apres))) throw new Error('curseur invalide');
      edge += `.after(${apres})`;
    }
    interieur += `,${edge}{${CHAMPS_MEDIA}}`;
  }
  return { version, chemin: `/${id}`, params: { fields: `business_discovery.username(${cible}){${interieur}}` } };
}

/** Construit l'URL complète avec jeton. À ne jamais journaliser. */
export function urlAvecJeton(req, jeton) {
  const u = new URL(`https://graph.facebook.com/${req.version}${req.chemin}`);
  for (const [k, v] of Object.entries(req.params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', jeton);
  return u;
}

const QUOTA = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]); // liste « rate limiting » de la documentation Graph (23/11/2026)
const AUTH = new Set([190, 102, 104]); // 190 = jeton ; 102/104 = session/signature : conventions Graph NON citées par les pages consultées
const TRANSITOIRE = new Set([1, 2]); // erreurs « inconnue/service » signalées comme transitoires par Graph en général : jamais relancées ici

/**
 * Classe une réponse (statut HTTP + corps JSON déjà décodé, ou undefined si non JSON / sans réponse). Sépare :
 *   succes · partiel · vide · incoherent · erreur_auth · erreur_permission · quota · erreur_transitoire · erreur_cible_ou_requete · erreur_reseau · erreur_inconnue.
 * Seuls les codes de QUOTA viennent de la documentation consultée ; les autres correspondances sont des conventions Graph à CONFIRMER par observation réelle.
 * `erreur_cible_ou_requete` ne conclut JAMAIS « compte personnel » : une erreur générique ne le prouve pas.
 * Un statut HTTP non 2xx n'est jamais un succès, avec ou sans objet `error` et même si le corps n'est pas du JSON.
 */
export function classerErreur(httpStatus, corps) {
  const err = corps && typeof corps === 'object' ? corps.error : null;
  if (err) {
    const code = Number(err.code); const sub = err.error_subcode != null ? Number(err.error_subcode) : null;
    const base = { code, sous_code: sub, type: err.type ? String(err.type).slice(0, 40) : null, message_meta: err.message ? masquer(String(err.message).slice(0, 300)) : null }; // message de Meta : utile au diagnostic, masqué (l'écriture de la preuve masque en plus le jeton exact)
    if (AUTH.has(code) || httpStatus === 401) return { statut: 'erreur_auth', ...base, detail: 'jeton expiré, révoqué ou invalide' };
    if (QUOTA.has(code) || httpStatus === 429) return { statut: 'quota', ...base, detail: 'limite d\'appels atteinte' };
    if (code === 10 || (code >= 200 && code <= 299)) return { statut: 'erreur_permission', ...base, detail: 'permission ou rôle manquant' };
    if (TRANSITOIRE.has(code) || err.is_transient === true) return { statut: 'erreur_transitoire', ...base, detail: 'erreur signalée comme transitoire ; non relancée' };
    if (code === 100 || code === 110 || code === 24) return { statut: 'erreur_cible_ou_requete', ...base, detail: 'requête refusée : cause non établie (cible, paramètre ou accès)' };
    return { statut: 'erreur_inconnue', ...base, detail: 'erreur non classée' };
  }
  if (httpStatus === 401) return { statut: 'erreur_auth', detail: 'HTTP 401 sans détail' };
  if (httpStatus === 429) return { statut: 'quota', detail: 'HTTP 429 sans détail' };
  if (httpStatus === 0) return { statut: 'erreur_reseau', detail: 'aucune réponse' };
  if (httpStatus >= 500) return { statut: 'erreur_reseau', detail: `HTTP ${httpStatus}` };
  if (httpStatus < 200 || httpStatus >= 300) return { statut: 'erreur_inconnue', detail: `HTTP ${httpStatus} sans objet error` };
  if (corps === undefined) return { statut: 'erreur_inconnue', detail: 'réponse 2xx non décodable' };
  return null; // 2xx décodé sans erreur : à l'appelant d'interpréter le corps
}

/**
 * @param {{ medias?: boolean, suite?: boolean }} opts  medias : un lot de publications était demandé ; suite : page obtenue par curseur.
 */
export function classerReponse(httpStatus, corps, { medias = false, suite: pageSuivante = false } = {}) {
  const e = classerErreur(httpStatus, corps);
  if (e) return e;
  const bd = corps?.business_discovery;
  if (!bd || typeof bd !== 'object') return { statut: 'erreur_inconnue', detail: 'réponse sans business_discovery' };
  const mc = Number.isInteger(bd.media_count) ? bd.media_count : null;
  if (!medias) return { statut: 'succes', portee: 'profil', media_count: mc };
  if (!bd.media || typeof bd.media !== 'object') return { statut: 'erreur_inconnue', detail: 'publications demandées, bloc media absent' };
  const items = bd.media.data;
  if (!Array.isArray(items)) return { statut: 'erreur_inconnue', detail: 'bloc media sans liste' };
  if (items.length === 0) {
    if (pageSuivante) return { statut: 'succes', portee: 'publications', n: 0, media_count: mc, detail: 'page suivante vide' };
    if (mc === 0) return { statut: 'vide', portee: 'profil', media_count: 0, detail: 'le compte déclare 0 publication' };
    if (mc > 0) return { statut: 'incoherent', portee: 'profil', media_count: mc, detail: 'media_count > 0 mais aucune publication renvoyée : restriction ou troncature non établie' };
    return { statut: 'vide', portee: 'profil', media_count: null, detail: 'aucune publication renvoyée, media_count absent : non confirmé' };
  }
  const incomplets = items.filter((m) => !m?.id || !m?.permalink || !m?.timestamp).length;
  const curseur = Boolean(bd.media.paging?.cursors?.after);
  // La présence d'un curseur « after » n'établit pas qu'une page suivante existe (Meta ne fournit pas d'URL next) : à vérifier en la lisant.
  if (incomplets > 0 || curseur) return { statut: 'partiel', portee: 'publications', n: items.length, incomplets, curseur_suivant_present: curseur };
  return { statut: 'succes', portee: 'publications', n: items.length };
}

/** Jeton : un seul mot, format plausible. Le message d'erreur ne reprend jamais la valeur. */
export function validerJeton(j) {
  const s = String(j ?? '').trim();
  if (!/^[A-Za-z0-9_-]{20,2048}$/.test(s)) throw new Error('format de jeton inattendu (une seule ligne, sans espace)');
  return s;
}

// ---------------------------------------------------------------------
// Découverte des identifiants SNY (documentés : me/accounts, PAGE_ID?fields=instagram_business_account, IG_ID?fields=id,username).
// Permissions utiles : pages_show_list pour me/accounts ; instagram_basic, instagram_manage_insights, pages_read_engagement pour Business Discovery ;
// ads_read SEULEMENT si le rôle sur la Page vient de Business Manager (condition documentée par Meta).
// ---------------------------------------------------------------------
export const PERMISSIONS_BASE = ['pages_show_list', 'instagram_basic', 'instagram_manage_insights', 'pages_read_engagement'];

function requeteSimple(chemin, fields, version, extra = {}) {
  if (!RE_VERSION.test(version)) throw new Error('version Graph invalide');
  return { version, chemin, params: { fields, ...extra } };
}
export function requeteComptes({ version = GRAPH_VERSION_DEFAUT, apres = null } = {}) {
  if (apres && !/^[A-Za-z0-9_=+/:.-]{4,1000}$/.test(String(apres))) throw new Error('curseur invalide');
  return requeteSimple('/me/accounts', 'id,name', version, { limit: '100', ...(apres ? { after: String(apres) } : {}) });
}
export function requetePage(pageId, { version = GRAPH_VERSION_DEFAUT } = {}) {
  return requeteSimple(`/${validerIdNumerique(pageId)}`, 'instagram_business_account', version);
}
export function requeteIdentite(igUserId, { version = GRAPH_VERSION_DEFAUT } = {}) {
  return requeteSimple(`/${validerIdNumerique(igUserId)}`, 'id,username', version);
}

/** Pages gérées : [{ id, name }], plus l'indication qu'il en reste (curseur `after`). Corps inattendu ⇒ erreur, jamais « aucune Page ». */
export function extrairePages(corps) {
  if (!corps || !Array.isArray(corps.data)) return { ok: false, pages: [], suite: null };
  const pages = corps.data.filter((p) => p && RE_ID.test(String(p.id))).map((p) => ({ id: String(p.id), name: String(p.name ?? '').slice(0, 80) }));
  return { ok: true, pages, suite: corps.paging?.cursors?.after && corps.paging?.next ? String(corps.paging.cursors.after) : null };
}
/** Identifiant Instagram lié à une Page (champ instagram_business_account.id) ; absent si la Page n'a pas de compte lié ou si l'accès manque. */
export function extraireIgDePage(corps) {
  const id = corps?.instagram_business_account?.id;
  return id && RE_ID.test(String(id)) ? String(id) : null;
}
// ---------------------------------------------------------------------
// Parcours « Instagram API with Unified Login » (documentation lue le 23/11/2026, pages Unified Login : accueil, get-started, authentication, permissions).
//  · jeton = « Business Integration System User Access Token » (SUAT) appartenant au portefeuille du client, pas à la personne qui s'est connectée ;
//  · hôte graph.facebook.com (pas graph.instagram.com, réservé à Instagram Login) ; exemples en v27.0 ;
//  · `/me` renvoie l'utilisateur système, PAS un compte Instagram : `me?fields=client_business_id` puis `me/assigned_instagram_accounts?fields=id,username`
//    (permission instagram_basic) donnent les identifiants ; aucun me/accounts, aucune Page ;
//  · permissions du parcours : famille instagram_* et Facebook Login for Business ; pages_show_list et pages_read_engagement n'y sont PAS listées ;
//  · aucun point d'inspection de jeton n'est décrit dans ces pages : le type est établi par la réponse de `me?fields=client_business_id` (inférence : un jeton
//    utilisateur Facebook n'a pas ce champ), jamais par un appel non documenté.
// NON documenté par les pages Unified Login : le support de Business Discovery et ses permissions. Seule la page Business Discovery du parcours Facebook Login
// dit que la fonction marche « aussi » avec Unified Login. Le premier appel réel tranche ; en cas de refus, aucune permission n'est présumée.
// ---------------------------------------------------------------------
export const PERMISSIONS_UNIFIED = ['instagram_basic', 'instagram_manage_insights'];

export function requeteMoi(fields, { version = GRAPH_VERSION_DEFAUT } = {}) {
  if (!/^[a-z_,]{1,60}$/.test(fields)) throw new Error('champs invalides');
  return requeteSimple('/me', fields, version);
}
export function requeteComptesAssignes({ version = GRAPH_VERSION_DEFAUT } = {}) {
  return requeteSimple('/me/assigned_instagram_accounts', 'id,username', version);
}
/** Type du jeton d'après `me?fields=client_business_id` : seul un identifiant de portefeuille confirme un jeton système Unified Login. L'identifiant n'est pas conservé. */
export function typeJetonUnified(corps) {
  const cb = corps && typeof corps === 'object' ? corps.client_business_id : null;
  return Boolean(cb) && /^\d{5,25}$/.test(String(cb));
}
/** Comptes Instagram assignés : [{ id, username }] ; corps inattendu ⇒ ok:false (jamais « aucun compte »). `suite` : un curseur de page suivante existe. */
export function extraireComptesAssignes(corps) {
  if (!corps || !Array.isArray(corps.data)) return { ok: false, comptes: [], suite: false };
  const comptes = corps.data.filter((c) => c && RE_ID.test(String(c.id)) && typeof c.username === 'string').map((c) => ({ id: String(c.id), username: c.username.slice(0, 40) }));
  return { ok: true, comptes, suite: Boolean(corps.paging?.next) };
}

/** Le compte interrogé est-il bien celui attendu ? Comparaison exacte (casse ignorée) du pseudo renvoyé. */
export function identiteConforme(corps, pseudoAttendu) {
  return Boolean(corps?.username) && String(corps.username).toLowerCase() === String(pseudoAttendu).toLowerCase() && RE_ID.test(String(corps.id));
}

/**
 * Publications normalisées pour l'export (sans rattachement : celui-ci vient du registre, jamais d'ici).
 * `portee_lecture` vaut toujours `legende_seule` : ni image, ni vidéo, ni commentaires n'ont été lus.
 * Aucun compteur de réactions n'est demandé ni conservé.
 */
export function normaliserPublications(corps, { collecteLe = new Date().toISOString() } = {}) {
  const bd = corps?.business_discovery;
  const auteur = bd?.username ? String(bd.username) : null;
  const items = Array.isArray(bd?.media?.data) ? bd.media.data : [];
  return items.filter((m) => m && m.id).map((m) => ({
    auteur,
    id_post: String(m.id),
    url: m.permalink ? String(m.permalink) : null,
    publie_le: m.timestamp ? String(m.timestamp) : null,
    collecte_le: collecteLe,
    legende: typeof m.caption === 'string' ? m.caption : null, // absente = signal à examiner, pas une erreur
    type_media: m.media_type ? String(m.media_type) : null,
    portee_lecture: 'legende_seule',
    empreinte_legende: typeof m.caption === 'string' ? createHash('sha256').update(m.caption.normalize('NFC')).digest('hex').slice(0, 16) : null,
  }));
}

// ---------------------------------------------------------------------
// Rejeu : fusion des publications lues avec celles DÉJÀ lues (dédoublonnage par identifiant, détection d'une légende modifiée).
// Le stock n'est jamais une seconde source de vérité : il se reconstruit à partir des preuves RÉELLES, dans l'ordre chronologique.
// ---------------------------------------------------------------------
/**
 * @param {Map<string, object>} stock  id_post → entrée (dernière ligne + premiere_collecte, derniere_collecte, empreintes[])
 * @param {object[]} lignes  lignes de normaliserPublications (peuvent contenir des doublons internes : même id dans deux pages)
 * @returns {{ stock: Map, nouvelles: number, identiques: number, modifiees: number, doublons_dans_le_lot: number }}
 */
export function fusionnerPublications(stock, lignes) {
  const sortie = new Map([...stock].map(([k, v]) => [k, { ...v, empreintes: [...v.empreintes] }]));
  const vus = new Set(); let nouvelles = 0; let identiques = 0; let modifiees = 0; let doublons = 0;
  for (const l of lignes) {
    if (!l?.id_post) continue;
    if (vus.has(l.id_post)) { doublons++; continue; }
    vus.add(l.id_post);
    const e = sortie.get(l.id_post);
    if (!e) { sortie.set(l.id_post, { ...l, premiere_collecte: l.collecte_le, derniere_collecte: l.collecte_le, empreintes: [l.empreinte_legende] }); nouvelles++; continue; }
    const change = e.empreintes[e.empreintes.length - 1] !== l.empreinte_legende;
    sortie.set(l.id_post, { ...e, ...l, premiere_collecte: e.premiere_collecte, derniere_collecte: l.collecte_le, empreintes: change ? [...e.empreintes, l.empreinte_legende] : e.empreintes });
    if (change) modifiees++; else identiques++;
  }
  return { stock: sortie, nouvelles, identiques, modifiees, doublons_dans_le_lot: doublons };
}

/** Reconstruit le stock à partir de preuves déjà décodées (objets), en ignorant celles qui ne viennent pas du réseau. Ordre : date de la preuve. */
export function stockDepuisPreuves(preuves) {
  let stock = new Map();
  for (const p of [...preuves].filter((x) => x && x.source_reponses !== 'simule' && Array.isArray(x.publications)).sort((a, b) => String(a.date).localeCompare(String(b.date)))) stock = fusionnerPublications(stock, p.publications).stock;
  return stock;
}
