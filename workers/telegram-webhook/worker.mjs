// =====================================================================
// workers/telegram-webhook/worker.mjs — réception événementielle des clics Telegram (Cloudflare Worker).
//
//   Telegram ──webhook──▶ ce Worker ──▶ (1) accusé IMMÉDIAT au clic  (2) déclenche le workflow GitHub `sny-telegram`
//                                                                      qui enregistre + applique (logique Neon EXISTANTE)
//
// POURQUOI. La relève GitHub Actions planifiée passe toutes les 5 à 6 h : l'éditeur clique et ne sait pas si c'est pris en compte.
// Un cron de 10 min ne donnerait pas non plus d'accusé instantané. Un webhook, si.
//
// SÉCURITÉ (moindre privilège)
//   · authenticité : en-tête X-Telegram-Bot-Api-Secret-Token comparé en temps constant ; sinon 403, rien n'est exécuté ;
//   · seul l'éditeur, dans SON chat, déclenche quoi que ce soit ; données de bouton validées par motif strict (≤ 64 octets) ;
//   · AUCUN accès base : le Worker ne détient ni NEON_DATABASE_URL ni droit d'écriture éditoriale. Ses secrets : jeton du bot,
//     secret du webhook, identifiant de l'éditeur, et un jeton GitHub à portée minimale (Actions : écriture, ce seul dépôt) ;
//   · idempotence : Telegram réessaie un webhook qui n'a pas répondu 200 ; le workflow ignore toute mise à jour déjà journalisée
//     et la clause « decision is null » garde le second clic ;
//   · honnêteté : « reçue » n'est annoncé que si le déclenchement a réussi ; sinon 500 (Telegram réessaie) et accusé d'échec.
//   · le Worker ne journalise rien d'éditorial (ni contenu, ni identifiants dans les logs).
//
// Exclusivité Telegram : une fois le webhook posé, getUpdates ne fonctionne plus ; `telegram-v0.mjs recevoir` le détecte et ne lit rien.
// =====================================================================

export const DATA_RE = /^sny:(?:NC:(?:VALIDATE|CREATE|ATTACH|PENDING|REVIEW|REJECT)|(?:VALIDATE|REVIEW|REJECT)|TEST):[0-9a-f]{8}$/;
const TAILLE_MAX = 8192;

/** Comparaison en temps constant (longueurs égales exigées). */
export function egal(a, b) {
  const x = new TextEncoder().encode(String(a ?? ''));
  const y = new TextEncoder().encode(String(b ?? ''));
  if (!x.length || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export default {
  /** `fetchImpl` : injectable pour les tests ; en production, le `fetch` du runtime. */
  async fetch(request, env, ctx, fetchImpl = fetch) {
    if (request.method !== 'POST') return new Response('SNY telegram webhook', { status: 200 });
    if (!egal(request.headers.get('X-Telegram-Bot-Api-Secret-Token'), env.TELEGRAM_WEBHOOK_SECRET)) return new Response('forbidden', { status: 403 });
    const brut = await request.text();
    if (brut.length > TAILLE_MAX) return new Response('trop gros', { status: 413 });
    let u;
    try { u = JSON.parse(brut); } catch { return new Response('requête illisible', { status: 400 }); }

    const cb = u?.callback_query;
    const editeur = Number(env.TELEGRAM_ALLOWED_USER_ID);
    // Tout ce qui n'est pas un clic de l'éditeur dans son chat est ignoré (200 : Telegram ne doit pas réessayer).
    if (!Number.isInteger(u?.update_id) || !cb || cb.from?.id !== editeur || cb.message?.chat?.id !== editeur || !DATA_RE.test(String(cb.data))) {
      return new Response('ignoré', { status: 200 });
    }

    // (1) déclencher l'enregistrement + l'application (workflow existant, secrets Neon côté GitHub uniquement)
    const update = JSON.stringify({ update_id: u.update_id, callback_query: { id: cb.id, data: cb.data, from: { id: cb.from.id }, message: { message_id: cb.message.message_id, chat: { id: cb.message.chat.id } } } });
    // Trois tentatives (0 / 0,3 / 0,9 s) : un à-coup de l'API GitHub ne doit pas coûter un clic. Si tout échoue : 500, Telegram REJOUE.
    let ok = false;
    for (const attente of [0, 300, 900]) {
      if (attente) await new Promise((res) => setTimeout(res, attente));
      try {
        const r = await fetchImpl(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/sny-telegram.yml/dispatches`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sny-telegram-webhook', 'content-type': 'application/json' },
          body: JSON.stringify({ ref: 'main', inputs: { update } }),
        });
        ok = r.status === 204;
      } catch { ok = false; }
      if (ok) break;
    }

    // (2) accusé IMMÉDIAT et HONNÊTE : « Clic reçu » (transmis à GitHub, DURABLE dans la file du workflow) — jamais « Décision enregistrée » :
    // seul Neon, côté workflow, peut le dire une fois l'écriture confirmée.
    const texte = ok ? 'Clic reçu ✓ — enregistrement en cours' : '⚠ Clic NON transmis — Telegram va réessayer';
    const post = (methode, corps) => fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${methode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
    try { await post('answerCallbackQuery', { callback_query_id: cb.id, text: texte }); } catch { /* l'accusé ne doit pas faire échouer la réponse au webhook */ }
    // Trace persistante dans le chat (le toast disparaît) : action et clé seulement, aucun contenu éditorial.
    if (ok) {
      const [, action, cle] = /^sny:(?:NC:)?([A-Z]+):([0-9a-f]{8})$/.exec(cb.data) || [];
      try { await post('sendMessage', { chat_id: editeur, text: `📥 Clic reçu : ${action} (${cle}). Enregistrement en cours — tu recevras la confirmation une fois la décision écrite.` }); } catch { /* idem */ }
    }
    return new Response(ok ? 'transmis' : 'échec de transmission', { status: ok ? 200 : 500 });
  },
};
