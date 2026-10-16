// =====================================================================
// scripts/lib/prevenir.mjs — prévenir l'éditeur (Telegram) de ce qui vient d'être APPLIQUÉ en base.
//
// Distingue enfin trois états que l'accusé de clic confondait : décision ENREGISTRÉE (accusé du clic), décision
// APPLIQUÉE en base (ce message), publication EFFECTUÉE ou en attente de GO (dit explicitement ici).
//
// Best-effort : un échec d'envoi ne fait JAMAIS échouer l'application (elle est déjà écrite). Jamais appelé à blanc.
// Dépôt public ⇒ logs publics : cette fonction n'écrit rien dans les logs. Le message ne part que vers la conversation de
// l'éditeur (TELEGRAM_ALLOWED_USER_ID) ; le token n'est jamais affiché.
// =====================================================================
import { schemaBoucle, journaliser } from './telegram-clics.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** Ce que la suite dit de la publication, selon l'état de la fiche. */
export function phrasePublication(pub) {
  if (pub === 'publiée') return 'La fiche est publiée en base ; la projection du site (data/cases.json) reste à régénérer et déployer.';
  if (pub === 'candidate') return 'Fiche candidate, non publiée : la publication exige un GO explicite.';
  return 'Aucune publication.';
}

/**
 * ENRICHISSEMENT validé (mobilisation, mesure, réaction) — messages selon l'issue RÉELLE, jamais selon le statut « publiée » de l'affaire :
 *   à l'application        : persistance seulement, aucune promesse de publication (la projection n'a pas encore tourné) ;
 *   projection sans page   : conservé en mémoire, aucune page modifiée (fiche approuvée / Hub absents) ;
 *   projection bloquée     : motif exact, validation conservée, aucun nouveau GO ;
 *   pages modifiées        : message « Publié et vérifié » de verifier-site, avec l'URL de chaque page.
 * Une NOUVELLE affaire garde phrasePublication et ses messages (appliquer-nouvelles-affaires).
 */
export const phraseEnrichissement = () => 'Décision enregistrée : l’information est conservée en mémoire. Aucune publication n’est promise par ce message ; si une page publique est concernée, une confirmation suivra après vérification du site, sinon vous serez prévenu qu’aucune page n’est modifiée.';
export function texteConservee(f) {
  return `📌 <b>Enrichissement validé et conservé</b> — ${esc(f.etablissement || f.case_id)}\n${esc(f.libelle)}\n<b>Aucune page publique n’est modifiée</b> : aucune fiche approuvée ni Hub publié n’est concerné. L’information reste disponible pour une future fiche ou un Hub, sans nouvelle validation. Aucune publication n’est en cours.`;
}
export function texteBloquee(b) {
  return `⚠️ <b>Enrichissement validé mais NON intégré aux pages</b> — ${esc(b.etablissement || b.case_id || b.id)}\n${esc(b.libelle || '')}\nMotif : ${esc(b.raison)}\nLa validation est conservée ; aucune page n’a été modifiée. Aucun nouveau GO n’est demandé : une revue ciblée de la page est nécessaire.`;
}
export function texteVerifie({ ids = [], fiches = [], hubs = [], site }) {
  const pages = [...fiches.map((f) => `${site}/affaires/${String(f).toLowerCase()}/`), ...hubs.map((h) => `${site}/territoires/${h}/`)];
  const tout = [...ids, ...fiches.map((f) => `fiche ${f}`), ...hubs.map((h) => `Hub ${h}`)].join(', ');
  return `🌐 <b>Publié et vérifié sur le site</b> — ${tout}\nLe site public affiche l’état validé (${site}).${pages.length ? `\nPages actualisées :\n${pages.join('\n')}` : ''}`;
}

/** @returns {Promise<boolean>} true si le message est parti */
export async function prevenir(texte) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = Number(process.env.TELEGRAM_ALLOWED_USER_ID);
  if (!token || !Number.isInteger(chat) || process.env.SNY_DRY) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texte, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return (await r.json()).ok === true;
  } catch { return false; }
}

/**
 * Prévient UNE seule fois par (clé, issue) — le job de clics tourne souvent, un blocage persistant ne doit pas inonder le chat.
 * Sans journal (migration 019 absente) : on ne prévient pas pour une issue répétable (« bloquée »), faute de mémoire.
 */
export async function prevenirUneFois(sql, { cle, resultat, texte }) {
  const S = await schemaBoucle(sql);
  if (!S.journal) return false;
  const [deja] = await sql`select 1 x from telegram_journal where kind = 'application' and cle = ${cle} and resultat = ${resultat} limit 1`;
  if (deja) return false;
  const ok = await prevenir(texte);
  await journaliser(sql, { kind: 'application', cle, resultat, details: { envoye: ok } });
  return ok;
}
