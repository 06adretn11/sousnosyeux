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
export const NC_VERS_DB = Object.freeze({ VALIDATE: 'ACCEPT', CREATE: 'ACCEPT', ATTACH: 'ACCEPT', REVIEW: 'REVIEW_REQUIRED', REJECT: 'REJECT' });
export const ACTION_NC = Object.freeze({ VALIDATE: 'CREATE', CREATE: 'CREATE', ATTACH: 'ATTACH', REVIEW: null, REJECT: null });

const RE_NC = /^sny:NC:(VALIDATE|CREATE|ATTACH|REVIEW|REJECT):([0-9a-f]{8})$/;
const RE_ETAT = /^sny:(VALIDATE|REVIEW|REJECT):([0-9a-f]{8})$/;
const RE_TEST = /^sny:TEST:([0-9a-f]{8})$/;

/** @returns {{type:'NC'|'ETAT'|'TEST', action:string|null, cle:string} | null} */
export function decoderCallback(data) {
  const s = String(data || '');
  let m;
  if ((m = RE_NC.exec(s))) return { type: 'NC', action: m[1], cle: m[2] };
  if ((m = RE_ETAT.exec(s))) return { type: 'ETAT', action: m[1], cle: m[2] };
  if ((m = RE_TEST.exec(s))) return { type: 'TEST', action: null, cle: m[1] };
  return null;
}

/**
 * Un bouton positif n'est valable que pour ce que SON message proposait.
 * ATTACH exige un candidat de rattachement (`payload.attach`) ; CREATE/VALIDATE exige une fiche à créer (`payload.fiche`).
 * REVIEW / REJECT sont toujours valables.
 */
export function boutonValable(action, payload) {
  if (action === 'REVIEW' || action === 'REJECT') return true;
  if (action === 'ATTACH') return !!payload?.attach?.case_id;
  if (action === 'VALIDATE' || action === 'CREATE') return !!payload?.fiche;
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
    _schema = {
      journal: t.length > 0,
      action: c.some((x) => x.table_name === 'new_case_proposals'),
      realisation: c.some((x) => x.table_name === 'case_events'),
    };
  } catch { _schema = { journal: false, action: false, realisation: false }; }
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
