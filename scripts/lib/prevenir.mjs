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
