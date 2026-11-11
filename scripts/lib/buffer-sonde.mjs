// =====================================================================
// scripts/lib/buffer-sonde.mjs — LECTURE SEULE : confronte ce que scripts/lib/buffer.mjs suppose de l'API GraphQL de Buffer au schéma RÉEL (introspection).
// Pure : prend la réponse d'introspection, renvoie des constats {ok, nom, detail}. Aucune écriture, aucun appel réseau ici (le client l'injecte).
// Le schéma d'une API est public : l'imprimer dans un journal public n'expose rien (ni clé, ni compte, ni contenu).
// =====================================================================

export const REQUETE_INTROSPECTION = `query { __schema {
  queryType { name } mutationType { name }
  types { kind name
    fields { name args { name type { ...T } } type { ...T } }
    inputFields { name type { ...T } }
    enumValues { name }
    possibleTypes { name } } } }
fragment T on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }`;

/** `[ID!]!` à partir d'une référence de type imbriquée. */
export function typeEnTexte(t) {
  if (!t) return '?';
  if (t.kind === 'NON_NULL') return `${typeEnTexte(t.ofType)}!`;
  if (t.kind === 'LIST') return `[${typeEnTexte(t.ofType)}]`;
  return t.name;
}
const nomNu = (t) => (t?.ofType ? nomNu(t.ofType) : t?.name);

/** Index du schéma : nom → type. */
export function indexer(introspection) {
  const types = introspection?.__schema?.types || [];
  const par = new Map(types.map((t) => [t.name, t]));
  return { par, schema: introspection?.__schema || {} };
}

const champs = (t) => (t?.fields || t?.inputFields || []);
const champDe = (t, nom) => champs(t).find((f) => f.name === nom);

/**
 * Constats : chaque hypothèse du client Buffer SNY contre le schéma. `ok:false` = écart démontré (à corriger avant d'activer).
 * @returns {{ok:boolean, nom:string, detail?:string}[]}
 */
export function comparerAuSchema(introspection) {
  const { par, schema } = indexer(introspection);
  const r = [];
  const ok = (nom, cond, detail = '') => r.push({ ok: !!cond, nom, detail });
  const T = (n) => par.get(n);

  const mut = T(schema.mutationType?.name);
  const req = T(schema.queryType?.name);

  // --- createPost ------------------------------------------------------------------------------------------------------------------
  const cp = champDe(mut, 'createPost');
  ok('mutation createPost existe', cp);
  ok('createPost(input: CreatePostInput!)', cp && nomNu(champDe({ fields: cp.args }, 'input')?.type) === 'CreatePostInput', cp ? typeEnTexte(champDe({ fields: cp.args }, 'input')?.type) : '');
  const entree = T('CreatePostInput');
  for (const f of ['channelId', 'text', 'schedulingType', 'mode', 'dueAt', 'assets', 'metadata']) ok(`CreatePostInput.${f}`, champDe(entree, f), champDe(entree, f) ? typeEnTexte(champDe(entree, f).type) : 'absent');
  const enumValeurs = (champ) => (T(nomNu(champDe(entree, champ)?.type))?.enumValues || []).map((v) => v.name);
  const sched = enumValeurs('schedulingType');
  const mode = enumValeurs('mode');
  ok('schedulingType accepte « automatic » (publication sans validation humaine)', sched.includes('automatic'), `valeurs : ${sched.join(', ')}`);
  ok('mode accepte « customScheduled » (heure de publication choisie = fenêtre d’annulation)', mode.includes('customScheduled'), `valeurs : ${mode.join(', ')}`);
  const sortie = T(nomNu(cp?.type));
  const membres = (sortie?.possibleTypes || []).map((p) => p.name);
  // PostActionPayload est une UNION : le succès + des erreurs typées. Le client lit `... on MutationError { message }` : valide seulement si toutes les erreurs implémentent MutationError.
  const erreurs = new Set((T('MutationError')?.possibleTypes || []).map((p) => p.name));
  const horsInterface = membres.filter((m) => m !== 'PostActionSuccess' && !erreurs.has(m));
  ok('createPost : un succès (PostActionSuccess) + des erreurs qui implémentent toutes MutationError', membres.includes('PostActionSuccess') && horsInterface.length === 0, `${sortie?.name} : ${membres.join(' | ')}${horsInterface.length ? ` — hors MutationError : ${horsInterface.join(', ')}` : ''}`);
  ok('PostActionSuccess.post', champDe(T('PostActionSuccess'), 'post'));
  ok('MutationError.message', champDe(T('MutationError'), 'message'));

  // Métadonnées par réseau (Facebook : lien joint ; Instagram : image + partage au fil).
  const meta = T(nomNu(champDe(entree, 'metadata')?.type));
  const fb = T(nomNu(champDe(meta, 'facebook')?.type));
  ok('metadata.facebook.type', champDe(fb, 'type'), fb ? fb.name : 'absent');
  ok('metadata.facebook.linkAttachment.url', champDe(T(nomNu(champDe(fb, 'linkAttachment')?.type)), 'url'));
  const ig = T(nomNu(champDe(meta, 'instagram')?.type));
  ok('metadata.instagram.type et shouldShareToFeed', champDe(ig, 'type') && champDe(ig, 'shouldShareToFeed'), ig ? ig.name : 'absent');
  const actif = T(nomNu(champDe(entree, 'assets')?.type));
  ok('assets[].image.url (visuel Instagram)', champDe(T(nomNu(champDe(actif, 'image')?.type)), 'url'), actif ? actif.name : 'absent');

  // --- post (lecture d'un post) et posts (réconciliation) ----------------------------------------------------------------------------
  const post = T('Post');
  for (const f of ['id', 'status', 'dueAt', 'sentAt', 'externalLink', 'channelId', 'text']) ok(`Post.${f}`, champDe(post, f), champDe(post, f) ? typeEnTexte(champDe(post, f).type) : 'absent');
  const statuts = (T(nomNu(champDe(post, 'status')?.type))?.enumValues || []).map((v) => v.name);
  ok('Post.status contient sent, scheduled, error (statuts lus par le suivi)', ['sent', 'scheduled', 'error'].every((s) => statuts.includes(s)), `valeurs : ${statuts.join(', ')}`);
  ok('query post(input: PostInput{id})', champDe(req, 'post') && champDe(T('PostInput'), 'id'));
  const lp = champDe(req, 'posts');
  ok('query posts(first, input: PostsInput)', lp && champDe({ fields: lp.args }, 'first') && champDe({ fields: lp.args }, 'input'), lp ? lp.args.map((a) => `${a.name}:${typeEnTexte(a.type)}`).join(', ') : 'absent');
  const pi = T('PostsInput');
  ok('PostsInput.organizationId', champDe(pi, 'organizationId'));
  const filtre = T(nomNu(champDe(pi, 'filter')?.type));
  ok('PostsInput.filter.channelIds et un filtre de date (createdAt ou dueAt)', champDe(filtre, 'channelIds') && (champDe(filtre, 'createdAt') || champDe(filtre, 'dueAt')), filtre ? `${filtre.name} : ${champs(filtre).map((f) => f.name).join(', ')}` : 'absent');
  const connexion = T(nomNu(lp?.type));
  const aretes = T(nomNu(champDe(connexion, 'edges')?.type));
  ok('posts → edges { node }', champDe(aretes, 'node'), connexion ? connexion.name : 'absent');

  // --- deletePost ---------------------------------------------------------------------------------------------------------------------
  const dp = champDe(mut, 'deletePost');
  ok('mutation deletePost existe', dp);
  ok('DeletePostInput.id', champDe(T('DeletePostInput'), 'id'));
  const sd = T(nomNu(dp?.type));
  const md = (sd?.possibleTypes || []).map((p) => p.name);
  ok('deletePost renvoie un succès ou VoidMutationError', md.includes('VoidMutationError'), `${sd?.name} : ${md.join(' | ')}`);
  ok('VoidMutationError.message', champDe(T('VoidMutationError'), 'message'));

  // --- canaux ---------------------------------------------------------------------------------------------------------------------------
  const ch = T('Channel');
  for (const f of ['id', 'service', 'displayName', 'isDisconnected', 'isLocked', 'isQueuePaused']) ok(`Channel.${f}`, champDe(ch, f));
  return r;
}

/** Lignes d'information (non bloquantes) : types utiles pour décider de la suite (filtres de posts, limites de plan, erreurs typées). */
export function informations(introspection) {
  const { par } = indexer(introspection);
  const noms = (n) => champs(par.get(n)).map((f) => `${f.name}:${typeEnTexte(f.type)}`).join(', ');
  const lignes = [];
  for (const n of ['PostsInput', 'PostsFiltersInput', 'PostsResults', 'OrganizationLimits', 'PostPublishingError', 'LimitReachedError', 'InvalidInputError', 'MutationError']) lignes.push(`${n} → ${par.has(n) ? noms(n) : 'type absent'}`);
  // Types de comparaison des filtres de date / statut, résolus dynamiquement.
  for (const f of ['createdAt', 'dueAt', 'status']) {
    const t = par.get(nomNu(champDe(par.get('PostsFiltersInput'), f)?.type));
    if (t) lignes.push(`${t.name} (${t.kind}) → ${t.kind === 'ENUM' ? (t.enumValues || []).map((v) => v.name).join(', ') : noms(t.name)}`);
  }
  return lignes;
}
