// =====================================================================
// scripts/lib/telegram-clics.mjs — ce qu'un clic Telegram veut dire, et la trace qu'il laisse.
//
// Partie PURE (decoderCallback, regles) : aucun réseau, aucune base — testée dans scripts/qa/test-boucle.mjs.
// Partie JOURNAL (journaliser, schemaBoucle) : best-effort. Si la migration 019 n'est pas appliquée, tout continue
// comme avant (le code se déploie AVANT la migration) ; le journal est une aide au diagnostic, jamais une condition.
//
// POURQUOI UN JOURNAL. Les 43 passages CI observés du 05 au 09/10/2026 ont tous répondu « 0 clic traité » alors que des
// clics avaient été donnés : impossible, depuis les logs publics, de dire si Telegram n'a rien reçu, si un autre bot a
// répondu, ou si un clic a été perdu. Chaque passage et chaque clic laissent désormais une ligne (jamais de contenu).
// =====================================================================

export const VERS_DB = Object.freeze({ VALIDATE: 'ACCEPT', REVIEW: 'REVIEW_REQUIRED', REJECT: 'REJECT' });
// Discovery : VALIDATE (nouvelle affaire) = CREATE (ancien nom, conservé pour ne casser aucun bouton déjà envoyé) ;
// ATTACH (rapprochement). Le CHOIX est enregistré dans `action` : ce qu'un humain a décidé ne se déduit pas de la recommandation.
// PENDING = CREATE_PENDING_EVIDENCE : nouvelle affaire crédible mais preuves insuffisantes → candidate EXPLICITEMENT non publiable
// (revue « à corriger », jamais « validé »), avec ce qui manque. REVIEW = HOLD : n'écrit JAMAIS une fiche ni un rattachement.
export const NC_VERS_DB = Object.freeze({ VALIDATE: 'ACCEPT', CREATE: 'ACCEPT', ATTACH: 'ACCEPT', PENDING: 'ACCEPT', REVIEW: 'REVIEW_REQUIRED', REJECT: 'REJECT' });
export const ACTION_NC = Object.freeze({ VALIDATE: 'CREATE', CREATE: 'CREATE', ATTACH: 'ATTACH', PENDING: 'CREATE_PENDING', REVIEW: null, REJECT: null });

/**
 * « Étape suivante » de l'accusé d'un clic POSITIF sur une proposition de nouvelle affaire. Ce que le message promet doit être ce que le clic a fait :
 *   · VALIDER ET PUBLIER (publication_directe) : le clic PORTE le GO de publication — l'accusé ne dit jamais « publication jamais automatique » ;
 *     il dit que l'autorisation est reçue et que la publication suit APRÈS contrôles (doublon, preuves, localisation), « publié » n'étant annoncé qu'après
 *     lecture du site servi ;
 *   · création documentaire (VALIDATE sans GO, CRÉER en attente de preuves) : la publication reste soumise à un GO explicite ;
 *   · rapprochement : ce n'est pas une nouvelle affaire, aucune phrase sur la publication.
 * @param {{action:string|null, directe:boolean, webhook:boolean}} o  action = `ACTION_NC[bouton]`
 */
export function suiteClicNouvelle({ action, directe, webhook }) {
  const application = webhook
    ? '\nApplication en base en cours : tu recevras « Appliqué » ou « Non appliqué » avec le motif.'
    : '\nÉtape suivante : application en base (au prochain passage).';
  if (action === 'ATTACH') return application;
  if (action === 'CREATE' && directe) {
    return `${application}\nAutorisation de publication reçue (VALIDER ET PUBLIER) : l’affaire est créée, puis publiée après les contrôles habituels (doublon, preuves, localisation). « Publié et vérifié » ne t’est annoncé qu’après lecture du site servi ; si un contrôle bloque, tu en reçois le motif.`;
  }
  return `${application} Nouvelle affaire : sa publication exige un GO explicite.`;
}

/**
 * Accusé d'un clic sur une proposition de PAGE (fiche individuelle ou mise à jour de fiche) ou de MISE À JOUR d'un Hub déjà publié — l'affaire / le Hub est DÉJÀ public :
 * jamais « nouvelle affaire », jamais « sa publication exige un GO » (ce clic EST le GO de CETTE version), « rien publié » dit ce qui reste en ligne.
 * @returns {{libelle:string, suite:string, ecriture:string}|null}  null = autre type de proposition (accusé historique)
 */
export function accuseVersion(payload, d) {
  const page = payload?.page, hub = payload?.hub_publication;
  const maj = !!(page?.mise_a_jour || hub?.mise_a_jour);
  if (!page && !(hub && maj)) return null;
  const objet = page ? (maj ? 'mise à jour de la page' : 'fiche') : 'Hub';
  const empreinte = (page || hub).hash;
  const libelle = {
    VALIDATE: page ? (maj ? 'MISE À JOUR APPROUVÉE' : 'FICHE APPROUVÉE') + ' (GO pour cette version)' : 'VERSION DU HUB APPROUVÉE (GO pour cette version)',
    REVIEW: `À REVOIR (rien publié : ${page ? (maj ? 'la version en ligne ne change pas' : 'la page n’existe pas encore') : 'le Hub en ligne ne change pas'})`,
    REJECT: `${page ? 'PAGE ÉCARTÉE' : 'PROPOSITION ÉCARTÉE'} (rien publié : ${page ? (maj ? 'la version en ligne ne change pas' : 'l’affaire reste publique, sans fiche') : 'le Hub et ses affaires ne changent pas'})`,
  }[d];
  const suite = `\nCe clic vaut GO pour CETTE version (${objet}, empreinte ${empreinte}) et aucune autre : ${page ? 'l’affaire est déjà publique, sa carte ne change pas' : 'le Hub est déjà publié, les affaires ne changent pas'}. ` +
    'Projection, QA, déploiement puis vérification du CONTENU servi suivent : « Publié et vérifié » ne t’est annoncé qu’après cette lecture. ' +
    'Si une étape bloque, tu reçois l’objet, l’étape et la conséquence ; ta décision reste enregistrée (aucun nouveau clic) et le passage suivant reprend.';
  return { libelle, suite, ecriture: '\nAucune écriture sur les pages : la version actuellement en ligne reste en place.' };
}

const RE_NC = /^sny:NC:(VALIDATE|CREATE|ATTACH|PENDING|REVIEW|REJECT):([0-9a-f]{8})$/;
const RE_ETAT = /^sny:(VALIDATE|REVIEW|REJECT):([0-9a-f]{8})$/;
const RE_TEST = /^sny:TEST:([0-9a-f]{8})$/;
// Relais social (mode REVIEW) : GO X + Facebook (XF), GO Facebook seul (F), GO X seul (X), Refuser (R). Une proposition = une clé de 8 caractères.
const RE_SG = /^sny:SG:(XF|F|X|R):([0-9a-f]{8})$/;

/** @returns {{type:'NC'|'ETAT'|'TEST'|'SG', action:string|null, cle:string} | null} */
export function decoderCallback(data) {
  const s = String(data || '');
  let m;
  if ((m = RE_NC.exec(s))) return { type: 'NC', action: m[1], cle: m[2] };
  if ((m = RE_ETAT.exec(s))) return { type: 'ETAT', action: m[1], cle: m[2] };
  if ((m = RE_TEST.exec(s))) return { type: 'TEST', action: null, cle: m[1] };
  if ((m = RE_SG.exec(s))) return { type: 'SG', action: m[1], cle: m[2] };
  return null;
}

/**
 * Un bouton positif n'est valable que pour ce que SON message proposait.
 * ATTACH exige un candidat de rattachement (`payload.attach`) ; CREATE/VALIDATE exige une fiche à créer (`payload.fiche`).
 * REVIEW / REJECT sont toujours valables.
 */
export function boutonValable(action, payload) {
  if (action === 'REVIEW' || action === 'REJECT') return true;
  // Proposition de PUBLICATION : seul « PUBLIER » (callback VALIDATE) est positif, et seulement si elle est publiable. Ni rattachement ni création.
  // Proposition de FICHE : seul « APPROUVER » (callback VALIDATE) est positif ; ni rattachement, ni création, ni publication d'affaire.
  // Proposition de HUB : seul « PRÉPARER LE HUB » (callback VALIDATE) est positif — il prépare un brouillon, il ne publie rien.
  if (payload?.hub_publication) return action === 'VALIDATE' && !!payload.hub_publication.hash && !!payload.hub_publication.slug;
  if (payload?.hub) return action === 'VALIDATE' && !!payload.hub.slug;
  if (payload?.page) return action === 'VALIDATE' && !!payload.page.hash;
  if (payload?.publication) return action === 'VALIDATE' && payload.publication.publiable === true;
  if (action === 'ATTACH') return !!payload?.attach?.case_id;
  if (action === 'VALIDATE' || action === 'CREATE' || action === 'PENDING') return !!payload?.fiche;
  return false;
}

/** Nombre d'essais au-delà duquel un clic qui échoue toujours est abandonné (journalisé) au lieu de bloquer la file. */
export const ESSAIS_MAX = 3;
/** Telegram ne conserve les mises à jour que 24 h : au-delà, inutile de les retenir. */
export const AGE_MAX_H = 23;

/**
 * Jusqu'où confirmer (offset) après un passage ? On ne confirme JAMAIS un clic dont le traitement a échoué (il serait perdu
 * en silence), sauf s'il est déjà tenté ESSAIS_MAX fois ou près d'expirer chez Telegram.
 * @param {{update_id:number, ok:boolean, essais:number, age_h:number}[]} traites dans l'ordre d'arrivée
 * @returns {number|null} dernier update_id à confirmer, ou null
 */
export function dernierAConfirmer(traites) {
  let dernier = null;
  for (const t of traites) {
    if (!t.ok && t.essais < ESSAIS_MAX && t.age_h < AGE_MAX_H) break; // on s'arrête : il sera rejoué au prochain passage
    dernier = t.update_id;
  }
  return dernier;
}

// --- journal (best-effort) ---------------------------------------------
let _schema = null;
/** Quelles parties de la migration 019 sont présentes ? (une seule requête par processus) */
export async function schemaBoucle(sql) {
  if (_schema) return _schema;
  try {
    const t = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name = 'telegram_journal'`;
    const c = await sql`select table_name, column_name from information_schema.columns where table_schema = 'public'
                          and ((table_name = 'new_case_proposals' and column_name = 'action') or (table_name = 'case_events' and column_name = 'realisation'))`;
    // migration 020 : la contrainte de `action` admet-elle CREATE_PENDING ?
    const k = await sql`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'new_case_proposals_action_check'`;
    _schema = {
      journal: t.length > 0,
      action: c.some((x) => x.table_name === 'new_case_proposals'),
      realisation: c.some((x) => x.table_name === 'case_events'),
      pending: k.some((x) => /CREATE_PENDING/.test(x.d)),
    };
  } catch { _schema = { journal: false, action: false, realisation: false, pending: false }; }
  return _schema;
}

/** Une ligne de journal. Jamais de contenu éditorial, jamais de secret : kind, ids techniques, issue. */
export async function journaliser(sql, { kind, update_id = null, cle = null, action = null, resultat = null, details = null }) {
  const s = await schemaBoucle(sql);
  if (!s.journal) return false;
  try {
    await sql`insert into telegram_journal (kind, update_id, cle, action, resultat, details)
              values (${kind}, ${update_id}, ${cle}, ${action}, ${resultat}, ${details ? JSON.stringify(details) : null}::jsonb)`;
    return true;
  } catch { return false; }
}

/**
 * Combien de fois ce clic a-t-il déjà été tenté sans succès ?
 * Sans journal (migration 019 absente) on ne PEUT PAS compter : on rend ESSAIS_MAX, c'est-à-dire « ne bloque pas la file » —
 * un clic qui échoue en boucle ne doit pas empêcher tous les suivants (comportement antérieur, signalé dans les logs).
 */
export async function essaisDe(sql, update_id) {
  const s = await schemaBoucle(sql);
  if (!s.journal || update_id == null) return ESSAIS_MAX;
  try {
    const [r] = await sql`select count(*)::int n from telegram_journal where kind = 'clic_echec' and update_id = ${update_id}`;
    return r?.n || 0;
  } catch { return 0; }
}
