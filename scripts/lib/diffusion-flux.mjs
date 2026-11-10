// =====================================================================
// scripts/lib/diffusion-flux.mjs — le circuit d'UNE diffusion (un événement × un canal) : réserver → créer → réconcilier → suivre → retirer.
// Dépendances INJECTÉES (journal, client Buffer, alerte) : testé avec des mocks, sans réseau ni base. Aucun secret ici, aucun log.
//
// GARANTIES
//   · une seule diffusion par (événement, canal) : la ligne du journal est RÉSERVÉE avant tout appel (clé primaire) ; un rejeu ou un passage concurrent la retrouve ;
//   · réponse incertaine (timeout, 5xx, 429) ⇒ la ligne reste « reserve » ; au passage suivant on RELIT l'état distant avant toute répétition ;
//     createPost n'est répété que si la lecture distante a RÉUSSI, n'a rien trouvé, et que le délai de grâce est écoulé ;
//   · un refus définitif de Buffer ⇒ « echec » (jamais retenté automatiquement) ; l'échec d'un canal n'arrête jamais les autres (chaque appel est isolé par l'appelant) ;
//   · « soumis » (Buffer a accepté) ≠ « programme » (en file) ≠ « envoye » (status sent) ≠ « verifie » (permalien distant relu).
// =====================================================================
import { ErreurBuffer } from './buffer.mjs';
import { etatDepuisBuffer, signatureTexte, GRACE_REESSAI_MIN } from './diffusion-sociale.mjs';

const MIN = 6e4;
export const ABANDON_RESERVE_H = 24;

/**
 * Journal attendu : lire(key, canal) → ligne|null · reserver(ligne) → true si INSÉRÉE, false si elle existait · maj(key, canal, patch) · lignesOuvertes() → lignes soumis|programme|envoye|reserve.
 * Buffer attendu : creerPost · lirePost · trouverPost · supprimerPost (voir lib/buffer.mjs).
 */
export async function diffuserCanal({ ev, canal, texte, channelId, imageUrl = null, lien = null, ledger, buffer, now, delaiMin = 15, alerter = async () => {} }) {
  const row = await ledger.lire(ev.event_key, canal);
  if (row) return row.etat === 'reserve' ? reconcilierReserve({ row, canal, channelId, imageUrl, lien, ledger, buffer, now, delaiMin, alerter }) : { canal, action: 'deja', etat: row.etat };
  const inseree = await ledger.reserver({ event_key: ev.event_key, canal, type_event: ev.type, case_id: ev.case_id, texte });
  if (!inseree) return { canal, action: 'deja', etat: 'reserve' }; // un autre passage vient de la réserver
  return creer({ ev, canal, texte, channelId, imageUrl, lien, ledger, buffer, now, delaiMin });
}

async function creer({ ev, canal, texte, channelId, imageUrl, lien, ledger, buffer, now, delaiMin }) {
  const dueAt = new Date(now.getTime() + delaiMin * MIN).toISOString();
  try {
    const post = await buffer.creerPost({ channelId, canal, texte, dueAt, imageUrl, avecLienFacebook: canal === 'facebook' ? lien : null });
    const e = etatDepuisBuffer(post);
    await ledger.maj(ev.event_key, canal, { etat: e.etat === 'programme' ? 'programme' : 'soumis', buffer_post_id: post.id, soumis_at: now });
    return { canal, action: 'cree', etat: e.etat === 'programme' ? 'programme' : 'soumis', dueAt };
  } catch (e) {
    const cause = e instanceof ErreurBuffer ? e : new ErreurBuffer('incertain', 'erreur inattendue');
    if (cause.kind === 'refus') { await ledger.maj(ev.event_key, canal, { etat: 'echec', erreur: cause.message.slice(0, 300) }); return { canal, action: 'echec', erreur: cause.message }; }
    await ledger.maj(ev.event_key, canal, { erreur: `réponse incertaine : ${cause.message}`.slice(0, 300) });
    return { canal, action: 'incertain', erreur: cause.message }; // la ligne reste « reserve » : réconciliation au prochain passage
  }
}

async function reconcilierReserve({ row, canal, channelId, imageUrl, lien, ledger, buffer, now, delaiMin, alerter }) {
  const age = now.getTime() - new Date(row.created_at).getTime();
  if (age > ABANDON_RESERVE_H * 60 * MIN) {
    await ledger.maj(row.event_key, canal, { etat: 'echec', erreur: `réponse restée incertaine plus de ${ABANDON_RESERVE_H} h : abandon, aucune republication automatique` });
    await alerter(`⚠️ <b>Diffusion sociale abandonnée</b> (${canal}, ${row.case_id}) : l’état distant est resté inconnu plus de ${ABANDON_RESERVE_H} h. Vérifier dans Buffer qu’aucun post n’existe.`);
    return { canal, action: 'abandon' };
  }
  let trouve;
  try { trouve = await buffer.trouverPost({ channelId, signature: signatureTexte(row.texte), depuis: new Date(new Date(row.created_at).getTime() - 5 * MIN).toISOString() }); }
  catch { return { canal, action: 'attente', raison: 'lecture de l’état distant impossible : rien n’est répété' }; }
  if (trouve) {
    const e = etatDepuisBuffer(trouve);
    await ledger.maj(row.event_key, canal, { etat: ['programme', 'envoye', 'verifie', 'echec'].includes(e.etat) ? e.etat : 'soumis', buffer_post_id: trouve.id, soumis_at: row.soumis_at || now,
      ...(e.permalien ? { permalien: e.permalien } : {}), ...(e.erreur ? { erreur: e.erreur } : {}) });
    return { canal, action: 'reconcilie', etat: e.etat };
  }
  if (age < GRACE_REESSAI_MIN * MIN) return { canal, action: 'attente', raison: 'aucun post retrouvé, délai de grâce non écoulé' };
  // Lecture réussie, rien trouvé, délai écoulé : le createPost n'a pas eu lieu. UNE nouvelle création, journalisée.
  return creer({ ev: { event_key: row.event_key, type: row.type_event, case_id: row.case_id }, canal, texte: row.texte, channelId, imageUrl, lien, ledger, buffer, now, delaiMin });
}

/** Suivi d'une ligne ouverte : Buffer a-t-il programmé / envoyé / refusé ? Met le journal à jour ; alerte en cas d'échec distant. */
export async function suivreLigne({ row, ledger, buffer, now, alerter = async () => {} }) {
  if (!row.buffer_post_id) return { action: 'rien' };
  let post;
  try { post = await buffer.lirePost(row.buffer_post_id); } catch { return { action: 'attente' }; }
  const e = etatDepuisBuffer(post);
  if (!e.etat) {
    await ledger.maj(row.event_key, row.canal, { etat: 'echec', erreur: e.erreur });
    await alerter(`⚠️ <b>Diffusion sociale : post introuvable dans Buffer</b> (${row.canal}, ${row.case_id}). Vérifier s’il a été supprimé à la main.`);
    return { action: 'echec', erreur: e.erreur };
  }
  if (e.etat === row.etat && !(e.permalien && !row.permalien)) return { action: 'inchange', etat: row.etat };
  await ledger.maj(row.event_key, row.canal, { etat: e.etat, ...(e.permalien ? { permalien: e.permalien } : {}), ...(e.envoye_at ? { envoye_at: e.envoye_at } : {}), ...(e.erreur ? { erreur: e.erreur } : {}) });
  if (e.etat === 'echec') await alerter(`⚠️ <b>Diffusion sociale en échec</b> (${row.canal}, ${row.case_id}) : ${e.erreur}`);
  return { action: 'maj', etat: e.etat };
}

/**
 * Retrait / blocage d'une affaire diffusée (B7) : interrompt ce qui n'est pas encore publié, identifie ce qui l'est, alerte avec les liens.
 * Buffer ne supprime PAS un post déjà publié sur le réseau : ce cas est dit, jamais simulé.
 */
export async function retirerLigne({ row, motif, channelId, ledger, buffer, alerter }) {
  if (['annule', 'echec', 'retire_apres_envoi'].includes(row.etat)) return { action: 'rien', etat: row.etat };
  if (['envoye', 'verifie'].includes(row.etat)) return dejaPublie({ row, motif, ledger, alerter });
  let id = row.buffer_post_id;
  if (!id && row.etat === 'reserve') {
    // On ne sait pas si un post existe : on le cherche avant de conclure.
    try {
      const t = await buffer.trouverPost({ channelId, signature: signatureTexte(row.texte), depuis: new Date(new Date(row.created_at).getTime() - 5 * MIN).toISOString() });
      if (!t) { await ledger.maj(row.event_key, row.canal, { etat: 'annule', erreur: `annulée avant création (${motif})` }); return { action: 'annule' }; }
      id = t.id;
      if (t.status === 'sent') { await ledger.maj(row.event_key, row.canal, { buffer_post_id: id, permalien: t.externalLink || null }); return dejaPublie({ row: { ...row, permalien: t.externalLink || null }, motif, ledger, alerter }); }
    } catch {
      await alerter(`⚠️ <b>Retrait en attente</b> (${row.canal}, ${row.case_id}) : l’état distant n’a pas pu être lu ; nouvel essai au prochain passage. Motif : ${motif}.`);
      return { action: 'attente' };
    }
  }
  // Relecture AVANT suppression : un post déjà parti ne se « supprime » pas, il se signale (et on n'envoie pas d'ordre de suppression inutile).
  try {
    const avant = await buffer.lirePost(id);
    if (avant?.status === 'sent') return dejaPublie({ row: { ...row, permalien: avant.externalLink || row.permalien || null }, motif, ledger, alerter });
  } catch { /* lecture impossible : on tente l'annulation, puis on relit */ }
  try {
    await buffer.supprimerPost(id);
    await ledger.maj(row.event_key, row.canal, { etat: 'annule', buffer_post_id: id, erreur: `annulée avant envoi (${motif})` });
    await alerter(`🛑 <b>Diffusion sociale annulée avant envoi</b> (${row.canal}, ${row.case_id}). Motif : ${motif}.`);
    return { action: 'annule' };
  } catch {
    // Refus ou panne : le post est peut-être parti entre-temps. On relit avant de conclure.
    try {
      const post = await buffer.lirePost(id);
      if (post?.status === 'sent') { await ledger.maj(row.event_key, row.canal, { permalien: post.externalLink || null }); return dejaPublie({ row: { ...row, permalien: post.externalLink || null }, motif, ledger, alerter }); }
    } catch { /* inconnu */ }
    await alerter(`🚨 <b>Annulation IMPOSSIBLE à confirmer</b> (${row.canal}, ${row.case_id}) : le post est peut-être programmé ou publié. Ouvrir Buffer et le supprimer à la main. Motif : ${motif}.`);
    return { action: 'echec_annulation' };
  }
}

async function dejaPublie({ row, motif, ledger, alerter }) {
  await ledger.maj(row.event_key, row.canal, { etat: 'retire_apres_envoi', erreur: `déjà publiée : suppression MANUELLE requise sur le réseau (${motif})` });
  await alerter(`🚨 <b>URGENT — publication sociale déjà envoyée pour une affaire retirée ou bloquée</b> (${row.canal}, ${row.case_id}).\nMotif : ${motif}.\n${row.permalien ? `Lien du post : ${row.permalien}` : 'Lien du post inconnu : le retrouver dans le compte du réseau.'}\nBuffer ne peut pas supprimer un post déjà publié : le supprimer directement sur le réseau (procédure : docs/industrialisation/DIFFUSION_SOCIALE.md §7).`);
  return { action: 'retire_apres_envoi' };
}

/**
 * Réservation « reserve » dont l'événement n'est plus candidat (source vieillie, page plus servie…) : on RETROUVE le post s'il existe, on ne CRÉE jamais.
 * Rien trouvé après le délai de grâce ⇒ « echec » (aucune diffusion n'a eu lieu) ; lecture impossible ⇒ on attend ; > 24 h ⇒ abandon alerté.
 */
export async function reconcilierSansCreer({ row, channelId, ledger, buffer, now, alerter = async () => {} }) {
  const age = now.getTime() - new Date(row.created_at).getTime();
  if (age > ABANDON_RESERVE_H * 60 * MIN) {
    await ledger.maj(row.event_key, row.canal, { etat: 'echec', erreur: `réponse restée incertaine plus de ${ABANDON_RESERVE_H} h : abandon` });
    await alerter(`⚠️ <b>Diffusion sociale abandonnée</b> (${row.canal}, ${row.case_id}) : l’état distant est resté inconnu plus de ${ABANDON_RESERVE_H} h. Vérifier dans Buffer qu’aucun post n’existe.`);
    return { action: 'abandon' };
  }
  let trouve;
  try { trouve = await buffer.trouverPost({ channelId, signature: signatureTexte(row.texte), depuis: new Date(new Date(row.created_at).getTime() - 5 * MIN).toISOString() }); }
  catch { return { action: 'attente' }; }
  if (trouve) {
    const e = etatDepuisBuffer(trouve);
    await ledger.maj(row.event_key, row.canal, { etat: ['programme', 'envoye', 'verifie', 'echec'].includes(e.etat) ? e.etat : 'soumis', buffer_post_id: trouve.id, ...(e.permalien ? { permalien: e.permalien } : {}), ...(e.erreur ? { erreur: e.erreur } : {}) });
    return { action: 'reconcilie', etat: e.etat };
  }
  if (age < GRACE_REESSAI_MIN * MIN) return { action: 'attente' };
  await ledger.maj(row.event_key, row.canal, { etat: 'echec', erreur: 'création non confirmée et événement plus éligible : aucune diffusion' });
  return { action: 'non_cree' };
}
