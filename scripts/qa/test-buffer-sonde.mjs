// =====================================================================
// scripts/qa/test-buffer-sonde.mjs — la sonde de schéma Buffer sait ÉCHOUER (introspection simulée : aucun réseau, aucune clé).
// Le schéma de référence reprend ce que l'introspection réelle a montré le 10/11/2026 ; chaque mutation du schéma doit produire un ❌ ciblé.
// Usage : node scripts/qa/test-buffer-sonde.mjs
// =====================================================================
import { comparerAuSchema, informations, typeEnTexte } from '../lib/buffer-sonde.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };

const ref = (name, kind = 'SCALAR') => ({ kind, name, ofType: null });
const nn = (t) => ({ kind: 'NON_NULL', name: null, ofType: t });
const liste = (t) => ({ kind: 'LIST', name: null, ofType: t });
const f = (name, type, args = []) => ({ name, type, args });
const obj = (name, fields, extra = {}) => ({ kind: 'OBJECT', name, fields, ...extra });
const inp = (name, inputFields) => ({ kind: 'INPUT_OBJECT', name, inputFields });
const en = (name, valeurs) => ({ kind: 'ENUM', name, enumValues: valeurs.map((v) => ({ name: v })) });
const S = ref('String'); const ID = ref('ID');

function schemaReference() {
  const types = [
    obj('Mutation', [
      f('createPost', ref('PostActionPayload', 'UNION'), [f('input', nn(ref('CreatePostInput', 'INPUT_OBJECT')))]),
      f('deletePost', ref('DeletePostPayload', 'UNION'), [f('input', nn(ref('DeletePostInput', 'INPUT_OBJECT')))]),
    ]),
    obj('Query', [
      f('post', ref('Post', 'OBJECT'), [f('input', nn(ref('PostInput', 'INPUT_OBJECT')))]),
      f('posts', ref('PostsResults', 'OBJECT'), [f('first', ref('Int')), f('input', nn(ref('PostsInput', 'INPUT_OBJECT')))]),
    ]),
    inp('CreatePostInput', [
      f('channelId', nn(ID)), f('text', S), f('schedulingType', nn(ref('SchedulingType', 'ENUM'))), f('mode', nn(ref('ShareMode', 'ENUM'))),
      f('dueAt', ref('DateTime')), f('assets', nn(liste(nn(ref('AssetInput', 'INPUT_OBJECT'))))), f('metadata', ref('PostInputMetaData', 'INPUT_OBJECT')),
    ]),
    en('SchedulingType', ['automatic', 'notification']),
    en('ShareMode', ['addToQueue', 'customScheduled', 'shareNext', 'shareNow']),
    inp('AssetInput', [f('image', ref('ImageAssetInput', 'INPUT_OBJECT'))]),
    inp('ImageAssetInput', [f('url', nn(S))]),
    inp('PostInputMetaData', [f('facebook', ref('FacebookPostMetadataInput', 'INPUT_OBJECT')), f('instagram', ref('InstagramPostMetadataInput', 'INPUT_OBJECT'))]),
    inp('FacebookPostMetadataInput', [f('type', nn(S)), f('linkAttachment', ref('LinkAttachmentInput', 'INPUT_OBJECT'))]),
    inp('LinkAttachmentInput', [f('url', nn(S))]),
    inp('InstagramPostMetadataInput', [f('type', nn(S)), f('shouldShareToFeed', ref('Boolean'))]),
    { kind: 'UNION', name: 'PostActionPayload', possibleTypes: [{ name: 'PostActionSuccess' }, { name: 'NotFoundError' }, { name: 'LimitReachedError' }] },
    obj('PostActionSuccess', [f('post', nn(ref('Post', 'OBJECT')))]),
    { kind: 'INTERFACE', name: 'MutationError', fields: [f('message', nn(S))], possibleTypes: [{ name: 'NotFoundError' }, { name: 'LimitReachedError' }, { name: 'VoidMutationError' }] },
    obj('NotFoundError', [f('message', nn(S))]),
    obj('LimitReachedError', [f('message', nn(S))]),
    obj('VoidMutationError', [f('message', nn(S))]),
    { kind: 'UNION', name: 'DeletePostPayload', possibleTypes: [{ name: 'DeletePostSuccess' }, { name: 'VoidMutationError' }] },
    inp('DeletePostInput', [f('id', nn(ID))]),
    inp('PostInput', [f('id', nn(ID))]),
    obj('Post', ['id', 'status', 'dueAt', 'sentAt', 'externalLink', 'channelId', 'text'].map((n) => f(n, n === 'status' ? nn(ref('PostStatus', 'ENUM')) : S))),
    en('PostStatus', ['draft', 'error', 'needs_approval', 'scheduled', 'sending', 'sent']),
    inp('PostsInput', [f('organizationId', nn(ID)), f('filter', ref('PostsFiltersInput', 'INPUT_OBJECT'))]),
    inp('PostsFiltersInput', [f('channelIds', liste(nn(ID))), f('dueAt', ref('DateTimeComparator', 'INPUT_OBJECT')), f('createdAt', ref('DateTimeComparator', 'INPUT_OBJECT'))]),
    inp('DateTimeComparator', [f('start', ref('DateTime')), f('end', ref('DateTime'))]),
    obj('PostsResults', [f('edges', liste(nn(ref('PostsEdge', 'OBJECT'))))]),
    obj('PostsEdge', [f('node', nn(ref('Post', 'OBJECT')))]),
    obj('Channel', ['id', 'service', 'displayName', 'isDisconnected', 'isLocked', 'isQueuePaused'].map((n) => f(n, S))),
  ];
  return { __schema: { queryType: { name: 'Query' }, mutationType: { name: 'Mutation' }, types } };
}

const echecs = (schema) => comparerAuSchema(schema).filter((c) => !c.ok).map((c) => c.nom);
const modifie = (fn) => { const s = schemaReference(); fn(s.__schema.types, (n) => s.__schema.types.find((t) => t.name === n)); return s; };

console.log('\nSonde de schéma Buffer — le schéma réel observé est conforme, chaque écart est détecté');
const base = echecs(schemaReference());
verifie('schéma de référence (observé le 10/11/2026) : aucun écart', base.length === 0, base.join(' ; '));

const cas = [
  ['filtre de date inexistant (l’ancien « startDate » n’existe pas) → écart', (T) => { T('PostsFiltersInput').inputFields = [f('channelIds', liste(nn(ID)))]; }, 'filtre de date'],
  ['schedulingType sans « automatic » → écart', (T) => { T('SchedulingType').enumValues = [{ name: 'notification' }]; }, 'automatic'],
  ['mode sans « customScheduled » → écart', (T) => { T('ShareMode').enumValues = [{ name: 'shareNow' }]; }, 'customScheduled'],
  ['une erreur de createPost qui n’implémente pas MutationError → écart', (T) => { T('PostActionPayload').possibleTypes.push({ name: 'RestProxyError' }); }, 'MutationError'],
  ['deletePost sans VoidMutationError → écart', (T) => { T('DeletePostPayload').possibleTypes = [{ name: 'DeletePostSuccess' }]; }, 'deletePost renvoie'],
  ['statut « sent » disparu → écart', (T) => { T('PostStatus').enumValues = [{ name: 'scheduled' }, { name: 'error' }]; }, 'Post.status'],
  ['Post.externalLink disparu → écart', (T) => { T('Post').fields = T('Post').fields.filter((x) => x.name !== 'externalLink'); }, 'Post.externalLink'],
  ['mutation createPost disparue → écart', (T) => { T('Mutation').fields = T('Mutation').fields.filter((x) => x.name !== 'createPost'); }, 'createPost'],
];
for (const [nom, fn, mot] of cas) {
  const e = echecs(modifie((t, T) => fn(T)));
  verifie(nom, e.some((x) => x.includes(mot)), `écarts relevés : ${e.join(' ; ') || 'aucun'}`);
}
verifie('introspection vide ou illisible : échec, jamais conforme', echecs({}).length > 5 && echecs(null).length > 5);

console.log('\nAffichage');
verifie('typeEnTexte : [ID!]! et Channel!', typeEnTexte(nn(liste(nn(ID)))) === '[ID!]!' && typeEnTexte(nn(ref('Channel', 'OBJECT'))) === 'Channel!');
verifie('informations : décrit les filtres de posts et leurs comparateurs de dates', informations(schemaReference()).join(' ').includes('PostsFiltersInput') && informations(schemaReference()).join(' ').includes('DateTimeComparator'));

console.log(ko ? `\n❌ ${ko} vérification(s) en échec` : '\n✅ sonde de schéma Buffer : toutes les vérifications passent');
process.exit(ko ? 1 : 0);
