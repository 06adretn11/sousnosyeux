// =====================================================================
// scripts/lib/buffer.mjs — client minimal de l'API GraphQL de Buffer (https://api.buffer.com). Aucune dépendance. `fetch` injectable (tests = mocks, JAMAIS le réseau).
//
// Référence : https://developers.buffer.com (guides getting-started, posts-and-scheduling, api-limits ; types CreatePostInput, PostsInput, DeletePostInput).
// Buffer n'offre AUCUNE clé d'idempotence sur createPost : l'idempotence est tenue par le journal SNY (réservation avant l'appel) + `trouverPost` (réconciliation).
//
// Deux sortes d'échec, qui ne se traitent JAMAIS pareil :
//   kind 'refus'     Buffer a répondu et REFUSE (erreur de mutation, 4xx hors 429, erreur GraphQL de validation) : définitif, rien n'a été créé.
//   kind 'incertain' on ne sait pas si l'action a eu lieu (timeout, réseau, 5xx, 429, réponse illisible) : RÉCONCILIER avant toute répétition.
// La clé d'API ne figure dans aucun message d'erreur (purge défensive) ; aucun log n'est écrit ici.
//
// ÉTAT DE LA VÉRIFICATION : écrit d'après la documentation publique, testé avec des mocks. Les formes exactes de la connexion `posts` et du sous-objet `error`
// n'ont PAS pu être confirmées sans clé d'API : `diffuser-social.mjs --verifier-connexion` les exerce en LECTURE SEULE avant toute activation.
// =====================================================================

export class ErreurBuffer extends Error {
  constructor(kind, message, status = null) { super(message); this.name = 'ErreurBuffer'; this.kind = kind; this.status = status; }
}

const SORTIE_POST = 'id status dueAt sentAt externalLink channelId text';

/** @param {{cle:string, organisationId:string, fetchImpl?:Function, timeoutMs?:number, endpoint?:string}} o */
export function clientBuffer({ cle, organisationId = null, fetchImpl = globalThis.fetch, timeoutMs = 20000, endpoint = 'https://api.buffer.com' }) {
  if (!cle) throw new ErreurBuffer('refus', 'clé d’API Buffer absente');
  const purge = (s) => String(s ?? '').split(cle).join('***').slice(0, 300);

  async function requete(query, variables = {}) {
    let r;
    try {
      r = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cle}` },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) { throw new ErreurBuffer('incertain', `réseau ou délai dépassé (${purge(e?.name)})`); }
    if (r.status === 429) throw new ErreurBuffer('incertain', 'limite de débit Buffer atteinte (429) : nouvel essai au prochain passage', 429);
    if (r.status >= 500) throw new ErreurBuffer('incertain', `erreur serveur Buffer (HTTP ${r.status})`, r.status);
    let corps;
    try { corps = await r.json(); } catch { throw new ErreurBuffer(r.ok ? 'incertain' : 'refus', `réponse illisible (HTTP ${r.status})`, r.status); }
    if (!r.ok) throw new ErreurBuffer('refus', `refus Buffer (HTTP ${r.status}) : ${purge(corps?.errors?.[0]?.message)}`, r.status);
    if (corps?.errors?.length) {
      const c = corps.errors[0];
      // Une limite de débit peut revenir en 200 avec extensions.code : elle n'a rien consommé, on réessaiera.
      if (c?.extensions?.code === 'RATE_LIMIT_EXCEEDED') throw new ErreurBuffer('incertain', 'limite de débit Buffer atteinte', 429);
      throw new ErreurBuffer('refus', `erreur GraphQL : ${purge(c?.message)}`, r.status);
    }
    if (!corps?.data) throw new ErreurBuffer('incertain', 'réponse sans données', r.status);
    return corps.data;
  }

  return {
    requete,

    /** Lecture seule : identifiants des organisations du compte (activation : retrouver BUFFER_ORGANIZATION_ID). */
    async organisations() {
      const d = await requete('query { account { organizations { id } } }');
      return (d.account?.organizations || []).map((o) => o.id);
    },

    /** Lecture seule : canaux de l'organisation (diagnostic d'activation). Aucune donnée personnelle conservée. */
    async canaux() {
      const d = await requete('query($input: ChannelsInput!){ channels(input:$input){ id service displayName isDisconnected isLocked isQueuePaused } }', { input: { organizationId: organisationId } });
      return d.channels || [];
    },

    /**
     * Crée UNE publication AUTOMATIQUE (schedulingType 'automatic', jamais 'notification') programmée à `dueAt` (marge d'annulation B7).
     * @returns {{id:string, status:string, dueAt:string|null}}   throws ErreurBuffer
     */
    async creerPost({ channelId, canal, texte, dueAt, imageUrl = null, avecLienFacebook = null }) {
      const input = { channelId, text: texte, schedulingType: 'automatic', mode: 'customScheduled', dueAt, assets: [] };
      if (canal === 'facebook') input.metadata = { facebook: { type: 'post', ...(avecLienFacebook ? { linkAttachment: { url: avecLienFacebook } } : {}) } };
      if (canal === 'instagram') {
        if (!imageUrl) throw new ErreurBuffer('refus', 'Instagram exige une image à URL publique stable');
        input.assets = [{ image: { url: imageUrl } }];
        input.metadata = { instagram: { type: 'post', shouldShareToFeed: true } };
      }
      const d = await requete(`mutation($input: CreatePostInput!){ createPost(input:$input){ __typename ... on PostActionSuccess { post { ${SORTIE_POST} } } ... on MutationError { message } } }`, { input });
      const p = d.createPost;
      if (p?.post?.id) return p.post;
      if (p?.__typename === 'MutationError' || p?.message) throw new ErreurBuffer('refus', `refus de création : ${purge(p.message)}`);
      throw new ErreurBuffer('incertain', 'réponse de création non reconnue');
    },

    /** État distant d'un post. null = introuvable. */
    async lirePost(id) {
      const d = await requete(`query($input: PostInput!){ post(input:$input){ ${SORTIE_POST} } }`, { input: { id } });
      return d.post || null;
    },

    /**
     * Réconciliation après réponse incertaine : retrouve un post de ce canal dont le texte contient `signature` (voir signatureTexte : l'identifiant d'événement du lien, ou le texte entier).
     * Une lecture qui échoue LÈVE : « je n'ai pas pu regarder » n'est jamais « il n'existe pas ».
     */
    async trouverPost({ channelId, signature, depuis }) {
      const d = await requete(`query($input: PostsInput!){ posts(first: 100, input: $input){ edges { node { ${SORTIE_POST} } } } }`,
        { input: { organizationId: organisationId, filter: { channelIds: [channelId], createdAt: { start: depuis } } } });
      const noeuds = (d.posts?.edges || []).map((e) => e?.node).filter(Boolean);
      const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
      // `utm_content=fr-2026-0144` ne doit pas reconnaître `utm_content=fr-2026-0144-enquete` (autre événement de la même affaire) : le jeton se termine là.
      const motif = new RegExp(`${signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9-])`);
      return noeuds.find((n) => n.channelId === channelId && motif.test(norm(n.text))) || null;
    },

    /** Annule un post PAS ENCORE publié. Un post déjà envoyé ne se supprime pas du réseau : voir le journal (retire_apres_envoi) et la procédure manuelle. */
    async supprimerPost(id) {
      const d = await requete('mutation($input: DeletePostInput!){ deletePost(input:$input){ __typename ... on VoidMutationError { message } } }', { input: { id } });
      const p = d.deletePost;
      if (p?.__typename === 'VoidMutationError' || p?.message) throw new ErreurBuffer('refus', `suppression refusée : ${purge(p.message)}`);
      return true;
    },
  };
}
