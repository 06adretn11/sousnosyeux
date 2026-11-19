// =====================================================================
// scripts/lib/relais-instagram.mjs — RELAIS SOCIAL, MODE REVIEW : le canal INSTAGRAM, branché sur le même circuit que X / Facebook SANS le modifier.
//
//   Nouveauté approuvée → contrôles (T0 global, point de départ Instagram, fraîcheur, fiche servie) → légende V4.1 (dérivée du post Facebook contrôlé) → VISUEL 1080×1350
//   → image hébergée (URL publique stable, empreinte du CONTENU) → PROPOSITION Telegram Instagram (visuel + légende exacts) → GO Instagram → recontrôle → Buffer → journal
//
// INDÉPENDANCE : une proposition Instagram est SA propre ligne (`<événement>#instagram:<empreinte>`), avec SES boutons (GO Instagram / Refuser) et sa décision (`GO_I`).
// Un GO X / Facebook ne vaut jamais GO Instagram (contrôle « canaux autorisés ⊂ canaux proposés » d'enregistrerDecision) et inversement ; aucun code X / Facebook n'est modifié.
// Aucune base, aucun réseau, aucun secret ici : tout est INJECTÉ (port, rendu, hébergement, Buffer, Telegram) — le même code tourne en production et dans les tests (mocks).
//
// GARANTIES (démontrées par scripts/qa/test-relais-instagram.mjs)
//   · rien ne part sans GO Instagram : le seul appel qui écrit chez Buffer (diffuserCanal) n'est atteint QUE depuis publierInstagram, pour une proposition `GO_I` dont l'identité
//     — événement + fiche approuvée + sources + légende + spécification du visuel + EMPREINTE DU CONTENU de l'image + URL — est INCHANGÉE au moment de l'envoi ;
//   · zéro historique : l'événement doit être ≥ T0 global ET ≥ point de départ d'Instagram (ligne 2 de relais_social_config, immuable) ; SEULE exception : UN événement nommé
//     (SNY_INSTAGRAM_AMORCAGE), qui passe quand même tous les autres contrôles (T0 global, source < 7 j, fiche approuvée et servie, aucun retrait) ;
//   · un événement n'est diffusé qu'UNE fois sur Instagram : le journal est tenu sur la clé de l'événement (pas sur celle de la proposition) ;
//   · silence, refus, expiration, clic rejoué, image altérée ou injoignable ⇒ zéro publication.
// =====================================================================
import { composerEvenement, evaluerCandidat, controlerFraicheur, controlerPareFeu, esc, sha256, jsonCanonique, motifsPublics, cleBase, VALIDITE_PROPOSITION_H } from './relais-social.mjs';
import { verifierPost, rendre } from './social-editorial.mjs';
import { versInstagram } from './social-editorial.mjs';
import { cleEvenement, ageJours, FENETRE_SOURCE_JOURS } from './diffusion-sociale.mjs';
import { diffuserCanal } from './diffusion-flux.mjs';
import { specVisuel, verifierVisuel, htmlVisuel, empreinteSpec, empreinteImage, pngDimensions, GABARIT_VISUEL, LARGEUR, HAUTEUR } from './instagram-visuel.mjs';

export const CANAL_INSTAGRAM = 'instagram';
export const LIMITE_LEGENDE = 2200;     // plafond Instagram
export const LIMITE_OCTETS_IMAGE = 5 * 1024 * 1024;   // plafond d'une image X via Buffer (le plus strict des trois réseaux)
export const LIMITE_ALT = 1000;          // plafond d'un texte alternatif (X)
export const MAX_PROPOSITIONS_PAR_PASSAGE = 3;
const HEURE = 36e5;
const dateOuNull = (d) => { if (d == null || d === '') return null; const x = d instanceof Date ? d : new Date(d); return Number.isNaN(x.getTime()) ? null : x; };
export const cleEvenementDe = (c) => (c.type === 'new_case' ? cleEvenement('new_case', c.case_id) : cleEvenement('case_update', c.case_id, c.statut_apres));
export const cleProposition = (base, contenu) => `${base}#instagram:${contenu.slice(0, 8)}`;

// ---------------------------------------------------------------------
// POINT DE DÉPART D'INSTAGRAM. PURE.
// La nouveauté, pour Instagram, est le dernier geste humain : approbation de la fiche (nouvelle affaire) ou décision de l'événement (évolution). Elle doit suivre le point de
// départ du canal. (Les autres horodatages — découverte, création, enregistrement — restent contrôlés par rapport au T0 GLOBAL, par evaluerCandidat.)
// ---------------------------------------------------------------------
export function apresPointDepart(c, t0Instagram) {
  const t = dateOuNull(t0Instagram);
  if (!t) return false;
  const apres = (d) => { const x = dateOuNull(d); return !!x && x >= t; };
  return c.type === 'new_case' ? apres(c.fiche_approuvee_at) : apres(c.decide_at) && apres(c.evenement_enregistre_at);
}

/** Activation d'Instagram = activation GLOBALE du relais + ligne 2 (point de départ du canal) posée, cohérente (≥ T0 global, ≤ maintenant) + canal configuré. Tout doute ⇒ inactif. */
export function verifierActivationInstagram({ activation, igRow, now, canalConfigure }) {
  const r = [];
  if (!activation?.actif) r.push('relais social inactif (coupe-circuit, mode ou T0 global non vérifié)');
  if (!canalConfigure) r.push('canal Instagram non configuré (SNY_DIFFUSION_CANAUX et BUFFER_CHANNEL_INSTAGRAM)');
  const t0 = dateOuNull(igRow?.t0);
  if (!igRow) r.push('point de départ Instagram absent : non initialisé (--initialiser-t0-instagram)');
  else if (!t0) r.push('point de départ Instagram illisible');
  else {
    if (igRow.mode !== 'review') r.push('point de départ Instagram enregistré pour un autre mode');
    if (activation?.t0 && t0 < activation.t0) r.push('point de départ Instagram antérieur au T0 global : incohérent');
    if (t0.getTime() > now.getTime() + 5 * 6e4) r.push('point de départ Instagram dans le futur : incohérent');
  }
  return { actif: r.length === 0, t0: r.length === 0 ? t0 : null, raisons: r };
}

// ---------------------------------------------------------------------
// COMPOSITION : légende (V4.1, dérivée du post Facebook contrôlé) + spécification du visuel + contrôles. PURE.
// ---------------------------------------------------------------------
/** @returns {{ok:boolean, motifs:string[], texte?:string, post?:object, spec?:object, specHash?:string, source?:object, reserves?:string[], controles?:object[], comp:object}} */
export function composerInstagram(c, compo) {
  const comp = composerEvenement(c, compo);
  const { pilote: r, M, entree } = comp;
  const motifs = [];
  if (r.etat === 'BLOQUE') return { ok: false, motifs: r.motifs, comp };
  if (r.facebook?.etat !== 'OK') return { ok: false, motifs: r.facebook?.motifs || ['composition impossible'], comp };
  const post = { paragraphes: versInstagram(r.facebook.paragraphes) };
  post.texte = rendre(post.paragraphes);
  const verif = verifierPost(post, 'instagram', M, compo.site, compo.redirections);
  if (!verif.ok) motifs.push(...verif.controles.filter((k) => !k.ok).map((k) => `contrôle V4.1 « ${k.nom} » : ${k.detail || 'échec'}`));
  const attention = [...r.attention, ...(r.facebook.attention || [])];
  motifs.push(...attention.filter((a) => /source liée/.test(a)));
  const source = r.sourcePrincipale ? M.sources.get(r.sourcePrincipale.url) ?? r.sourcePrincipale : null;
  motifs.push(...controlerFraicheur({ source, dateFait: comp.dateFait, now: compo.now }));
  if ([...post.texte].length > LIMITE_LEGENDE) motifs.push(`légende de ${[...post.texte].length} caractères (> ${LIMITE_LEGENDE}, plafond Instagram)`);
  if (/\.\.\.|…\s*$/.test(post.texte)) motifs.push('légende tronquée');
  const spec = specVisuel(c.type, post, entree?.statut_judiciaire ?? null);
  const vv = verifierVisuel(spec, post, c.type, entree);
  if (!vv.ok) motifs.push(...vv.controles.filter((k) => !k.ok).map((k) => `contrôle du visuel « ${k.nom} » : ${k.detail || 'échec'}`));
  if (motifs.length) return { ok: false, motifs: [...new Set(motifs)], comp };
  const reserves = [...attention.filter((a) => !/source liée/.test(a)), ...(comp.dateFait ? [] : ['date du fait non établie : seule la date de l’article fait foi — ancienneté à apprécier'])];
  return { ok: true, motifs: [], texte: post.texte, post, spec, specHash: empreinteSpec(spec), source: { media: source.media, url: source.url, publie_le: source.publie_le ?? null }, reserves,
    controles: [...verif.controles, ...vv.controles], comp };
}

/** Contenu validé (hors image) : légende + spécification du visuel + gabarit. Sert de clé de proposition et de comparaison au recontrôle. */
export const contenuDe = (ig) => sha256(jsonCanonique({ texte: ig.texte, spec_hash: ig.specHash ?? ig.spec_hash, gabarit: GABARIT_VISUEL }));

/** IDENTITÉ IMMUABLE : affaire + événement + version approuvée + sources + légende + spécification + empreinte du contenu de l'image + URL + canal. */
export function identiteInstagram(c, ig, image) {
  const base = { case_id: c.case_id, event_key: cleEvenementDe(c), type: c.type, event_id: c.event_id ?? null, statut_apres: c.statut_apres ?? null, fiche_hash: ig.comp.fiche_hash };
  const bloc = { texte: ig.texte, source: ig.source, spec: ig.spec, spec_hash: ig.specHash, gabarit: GABARIT_VISUEL, contenu: contenuDe(ig), image };
  return { ...base, canal: CANAL_INSTAGRAM, canaux: { instagram: { ...bloc, empreinte: sha256(jsonCanonique({ ...base, canal: CANAL_INSTAGRAM, texte: bloc.texte, source: bloc.source, spec_hash: bloc.spec_hash,
    gabarit: GABARIT_VISUEL, image_sha256: image.sha256, image_url: image.url })) } } };
}

// ---------------------------------------------------------------------
// IMAGE : rendu → hébergement → relecture DISTANTE (c'est cette relecture, pas le rendu local, qui prouve que Buffer verra bien ces octets). Échec ⇒ silence.
// ---------------------------------------------------------------------
/** @param {{rendre:Function, publier:Function, lire:Function}} imageDeps */
export async function produireImage(spec, c, imageDeps) {
  const { png } = await imageDeps.rendre({ html: htmlVisuel(spec) });
  const sha = empreinteImage(png);
  const { url } = await imageDeps.publier({ chemin: `ig/${c.case_id.toLowerCase()}/${sha.slice(0, 16)}.png`, png });
  return controlerImageDistante({ url, attendu: sha, imageDeps });
}
/** Relit l'URL publique : HTTP 200, type image/png, 1080×1350, octets dont l'empreinte est CELLE attendue. @returns {Promise<{url,sha256,largeur,hauteur,octets}>} throws Error */
export async function controlerImageDistante({ url, attendu, imageDeps }) {
  if (!/^https:\/\/[^\s]+$/.test(String(url))) throw new Error('URL du média non HTTPS');
  const r = await imageDeps.lire(url);
  if (r.status !== 200) throw new Error(`média injoignable (HTTP ${r.status})`);
  if (!/^image\/png\b/i.test(String(r.contentType || ''))) throw new Error(`type de média inattendu (${String(r.contentType).slice(0, 40)})`);
  const d = pngDimensions(r.png);
  if (!d || d.largeur !== LARGEUR || d.hauteur !== HAUTEUR) throw new Error('format du média inattendu (attendu 1080×1350)');
  if (r.png.length > LIMITE_OCTETS_IMAGE) throw new Error(`média trop lourd (${Math.round(r.png.length / 1024)} Ko > 5 Mo, plafond de X)`);
  const sha = empreinteImage(r.png);
  if (attendu && sha !== attendu) throw new Error('empreinte du média distant différente de celle validée');
  return { url, sha256: sha, largeur: d.largeur, hauteur: d.hauteur, octets: r.png.length };
}

/**
 * TEXTE ALTERNATIF du visuel, tiré de la spécification VALIDÉE (jamais d'appel de modèle) : lieu, libellé, faits, réserves, sources — le contexte n'est ajouté que s'il tient.
 * Au-delà de LIMITE_ALT sans le contexte : null (aucun texte alternatif plutôt qu'un texte coupé).
 */
export function texteAlternatif(spec) {
  const lieu = `${spec.commune}${spec.departement ? ` (${spec.departement})` : ''}`;
  const tete = `Carte Sous nos yeux — ${spec.kicker}. ${lieu}, ${spec.etablissement} : ${spec.libelle}${spec.qualif ? ` pour ${spec.qualif}` : ''}.`;
  for (const ctx of [spec.contexte, []]) {
    const t = [tete, ...spec.faits, ...ctx, ...spec.reserves, ...spec.sources].join(' ');
    if ([...t].length <= LIMITE_ALT) return t;
  }
  return null;
}

// ---------------------------------------------------------------------
// VISUEL PARTAGÉ X · Facebook · Instagram : UN visuel par événement et version éditoriale (même spécification ⇒ même fichier, même URL). Aucun second générateur.
// ---------------------------------------------------------------------
/** Images déjà validées dans des propositions (X / Facebook : identite.image ; Instagram : identite.canaux.instagram). */
export function imagesDeProps(props) {
  return (props || []).flatMap((p) => [p.identite?.image, p.identite?.canaux?.instagram ? { ...p.identite.canaux.instagram.image, spec_hash: p.identite.canaux.instagram.spec_hash, gabarit: p.identite.canaux.instagram.gabarit } : null])
    .filter((i) => i?.url && i.sha256 && i.spec_hash);
}
/** Réutilise une image déjà hébergée ET relue à l'identique pour la même spécification ; sinon rend et héberge. throws Error */
export async function produireOuReutiliser(spec, specHash, c, imageDeps, existantes = []) {
  for (const e of existantes) {
    if (e.spec_hash !== specHash || e.gabarit !== GABARIT_VISUEL) continue;
    try { return await controlerImageDistante({ url: e.url, attendu: e.sha256, imageDeps }); } catch { /* absente ou altérée : on passe à la suivante, puis au rendu */ }
  }
  return produireImage(spec, c, imageDeps);
}
/**
 * Visuel d'un événement pour X / Facebook : composition Instagram (PURE : mêmes contrôles de la légende et du visuel), puis image (rendu, hébergement, relecture distante).
 * Indisponible ⇒ { ok:false, motifs } : aucun canal ne part sans image. ecrire=false : aucun rendu (plan).
 * @returns {Promise<{ok:boolean, motifs?:string[], spec?:object, spec_hash?:string, gabarit?:string, alt?:string|null, image?:object|null}>}
 */
export async function visuelPartage({ c, compo, imageDeps, ecrire, existantes = [] }) {
  const ig = composerInstagram(c, compo);
  if (!ig.ok) return { ok: false, motifs: ig.motifs.map((m) => `visuel : ${m}`) };
  const v = { ok: true, spec: ig.spec, spec_hash: ig.specHash, gabarit: GABARIT_VISUEL, alt: texteAlternatif(ig.spec), image: null };
  if (!ecrire) return v;
  if (!imageDeps) return { ok: false, motifs: ['visuel : rendu et hébergement non configurés'] };
  try { return { ...v, image: await produireOuReutiliser(ig.spec, ig.specHash, c, imageDeps, existantes) }; }
  catch (e) { return { ok: false, motifs: [`visuel indisponible : ${String(e.message).slice(0, 160)}`] }; }
}
/**
 * Recontrôle, juste avant l'envoi, du visuel VALIDÉ par le GO : la spécification recomposée est celle de la proposition ET le fichier est toujours servi à l'identique.
 * @returns {Promise<{motif?:string, image?:object, alt?:string|null}>} motif = « obsolete: … » | « bloque: … »
 */
export async function recontroleVisuel({ c, compo, stock, imageDeps }) {
  if (!stock?.url || !stock?.sha256 || !stock?.spec_hash) return { motif: 'obsolete: proposition antérieure au visuel partagé (aucune image validée par le GO)' };
  const ig = composerInstagram(c, compo);
  if (!ig.ok) return { motif: `bloque: le visuel n’est plus composable (${ig.motifs.join(' ; ').slice(0, 160)})` };
  if (ig.specHash !== stock.spec_hash || stock.gabarit !== GABARIT_VISUEL) return { motif: 'obsolete: le visuel validé a changé (spécification ou gabarit)' };
  if (!imageDeps) return { motif: 'bloque: contrôle de l’image impossible (hébergement non configuré)' };
  try { return { image: await controlerImageDistante({ url: stock.url, attendu: stock.sha256, imageDeps }), alt: texteAlternatif(ig.spec) }; }
  catch (e) { return { motif: `bloque: le visuel validé n’est plus servi à l’identique (${String(e.message).slice(0, 120)})` }; }
}

// ---------------------------------------------------------------------
// TELEGRAM. PURE.
// ---------------------------------------------------------------------
const jourFr = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'date inconnue');
export function affichageDe(c, ig, site) {
  const e = ig.comp.entree, evt = ig.comp.evt;
  return { etablissement: e.etablissement, commune: e.commune, evenement: c.type === 'new_case' ? 'Nouvelle affaire' : `Évolution judiciaire : ${c.statut_avant ?? '?'} → ${c.statut_apres}${evt?.date ? ` (${jourFr(evt.date)})` : ''}`,
    fiche: `${site}/affaires/${c.case_id.toLowerCase()}/`, reserves: ig.reserves, controles: ig.controles.length };
}
export function messagePropositionInstagram({ id8, ident, affichage, expire_at, now, amorcage }) {
  const ig = ident.canaux.instagram, a = affichage, src = ig.source;
  const age = ageJours(src.publie_le, now);
  const o = (n) => (n < 1024 ? `${n} o` : `${Math.round(n / 1024)} Ko`);
  let t = `📸 <b>RELAIS SOCIAL — proposition INSTAGRAM</b> (${id8})\n<b>${esc(a.etablissement)} — ${esc(a.commune)}</b>\n${esc(a.evenement)}\n`
    + (amorcage ? '🧪 <b>Première publication contrôlée</b> : exception d’amorçage, limitée à CET événement et au canal Instagram — ce n’est pas une réouverture de l’historique.\n' : '')
    + `Source : ${esc(src.media)}, ${jourFr(src.publie_le)}${age != null ? ` (il y a ${Math.max(0, Math.floor(age))} j)` : ''} — ${esc(src.url)}\n`
    + `Fiche SNY : ${esc(a.fiche)}\n`
    + `Contrôles : T0 global ✓ · ${amorcage ? 'amorçage nommé' : 'point de départ Instagram'} ✓ · fiche approuvée et servie (empreinte ${esc(ident.fiche_hash)}) ✓ · légende V4.1 + vérificateur ✓ · contrôleur du visuel ✓ · source &lt; ${FENETRE_SOURCE_JOURS} j lue ✓ · image hébergée et relue (${ig.image.largeur}×${ig.image.hauteur}, ${o(ig.image.octets)}, empreinte ${esc(ig.image.sha256.slice(0, 12))}) ✓`
    + (a.reserves?.length ? `\n⚠️ Réserves : ${esc(a.reserves.join(' ; ').slice(0, 500))}` : '')
    + `\n\n<b>Visuel</b> (envoyé dans le message précédent) : ${esc(ig.image.url)}\n<b>Légende Instagram</b> (${[...ig.texte].length} car.)\n<pre>${esc(ig.texte)}</pre>\n`
    + `\nValable jusqu’au ${new Date(expire_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Le GO porte sur CE visuel et CETTE légende, exactement : si l’un d’eux, la fiche, une source ou l’URL de l’image change, il ne vaut plus. Rien n’est publié sans ton clic ; la publication est programmée avec un délai d’annulation.`;
  if (t.length > 4000) t = t.replace(/\n⚠️ Réserves : [^\n]*/, '\n⚠️ Réserves : voir la fiche et le contrôleur (liste trop longue pour ce message)');
  return t;
}
export const boutonsInstagram = (id8) => ({ inline_keyboard: [[{ text: '✅ GO Instagram', callback_data: `sny:SG:I:${id8}` }, { text: '⛔ Refuser Instagram', callback_data: `sny:SG:R:${id8}` }]] });
export const legendePhoto = (ident) => `Visuel Instagram exact — ${ident.canaux.instagram.image.largeur}×${ident.canaux.instagram.image.hauteur}, empreinte ${ident.canaux.instagram.image.sha256.slice(0, 12)}`;

// ---------------------------------------------------------------------
// PHASE 1 — PROPOSER. Silence si rien d'éligible (aucune recherche historique pour « remplir »).
// deps = { port, compo, activation, holds, igRow, canalConfigure, amorcage:string|null, ledger, envoyer, envoyerPhoto, image:{rendre,publier,lire}, log, ecrire, servi, ficheServie }
// ---------------------------------------------------------------------
export async function proposerInstagram(deps) {
  const { port, compo, activation, holds, ledger, log, ecrire } = deps;
  const bilan = { candidats: 0, proposees: 0, bloquees: 0, envoyees: 0, hors_perimetre: 0 };
  const act = verifierActivationInstagram({ activation, igRow: deps.igRow, now: compo.now, canalConfigure: deps.canalConfigure });
  if (!act.actif) { log(`instagram inactif : ${act.raisons.join(' ; ')}`); return bilan; }
  const now = compo.now;
  const candidats = await port.candidats(activation.t0);
  bilan.candidats = candidats.length;
  for (const c of candidats) {
    const base = cleEvenementDe(c);
    const amorcage = !!deps.amorcage && deps.amorcage === base;
    if (!amorcage && !apresPointDepart(c, act.t0)) { bilan.hors_perimetre++; continue; }
    if (bilan.proposees >= MAX_PROPOSITIONS_PAR_PASSAGE) { log('· plafond de propositions par passage atteint : suite au prochain passage'); break; }
    const props = await port.propositionsInstagramDeEvenement(base);
    const ouverte = props.find((p) => !p.decision && new Date(p.expire_at) > now);
    if (props.some((p) => p.decision === 'GO_I' || p.decision === 'REFUS')) continue;             // décidé : jamais reproposé
    if (await ledger.lire(base, CANAL_INSTAGRAM)) continue;                                          // déjà diffusé (ou en cours) sur Instagram : une seule fois par événement
    if (ouverte) {                                                                                    // proposition en attente de clic : on ne fait que renvoyer le message s'il n'est pas parti
      if (ecrire && ouverte.telegram_message_id == null) bilan.envoyees += await envoyer({ prop: ouverte, deps, now }) ? 1 : 0;
      continue;
    }
    const ctx = { t0: activation.t0, now, holds, entree: compo.cases.get(c.case_id) ?? null, ficheHash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
      servi: deps.servi(c.case_id), ficheServie: await deps.ficheServie(c.case_id), proposition: false, ledger: false };
    const v = evaluerCandidat({ ...c, event_key: base }, ctx);
    if (!v.ok) { bilan.bloquees++; log(`· instagram ${c.type} ${c.case_id} : SILENCE — ${motifsPublics(v.raisons.join(' ; '))}`); continue; }
    const pf = controlerPareFeu({ event_key: base, canal: CANAL_INSTAGRAM, diffusions: await port.diffusionsDeAffaire(c.case_id, new Date(now.getTime() - 36 * HEURE)), now });
    if (pf.length) { bilan.bloquees++; log(`· instagram ${c.type} ${c.case_id} : SILENCE — ${motifsPublics(pf.join(' ; '))}`); continue; }
    const ig = composerInstagram({ ...c, event_key: base }, compo);
    if (!ig.ok) { bilan.bloquees++; log(`· instagram ${c.type} ${c.case_id} : SILENCE — ${motifsPublics(ig.motifs.join(' ; '))}`); continue; }
    const contenu = contenuDe(ig);
    if (props.some((p) => p.identite?.canaux?.instagram?.contenu === contenu)) continue;            // même contenu déjà proposé (expiré, obsolète) : jamais reproposé à l'identique
    if (!ecrire) { log(`· instagram ${c.type} ${c.case_id} : ÉLIGIBLE${amorcage ? ' (amorçage)' : ''} — plan, ni rendu, ni enregistrement, ni envoi`); continue; }
    let image;
    try { image = await produireOuReutiliser(ig.spec, ig.specHash, c, deps.image, imagesDeProps(await port.propositionsDeEvenement(base))); }
    catch (e) { bilan.bloquees++; log(`· instagram ${c.type} ${c.case_id} : SILENCE — visuel impossible (${motifsPublics(e.message)})`); continue; }
    const ident = identiteInstagram({ ...c, event_key: base }, ig, image);
    ident.affichage = affichageDe(c, ig, compo.site);
    ident.amorcage = amorcage;
    const cree = await port.creerProposition({ event_key: cleProposition(base, contenu), case_id: c.case_id, type_event: c.type, identite: ident, texte_x: null, texte_facebook: null, canaux_proposes: [CANAL_INSTAGRAM],
      empreinte_x: null, empreinte_facebook: null, expire_at: new Date(now.getTime() + VALIDITE_PROPOSITION_H * HEURE) });
    if (!cree) continue;                                                                             // un autre passage vient de la créer
    bilan.proposees++;
    log(`· instagram ${c.type} ${c.case_id} : proposition créée${amorcage ? ' (amorçage)' : ''}`);
    bilan.envoyees += await envoyer({ prop: cree, deps, now }) ? 1 : 0;
  }
  log(`instagram : ${bilan.candidats} candidat(s) après T0 global, ${bilan.hors_perimetre} antérieur(s) au point de départ du canal (ignorés), ${bilan.proposees} proposition(s) créée(s), ${bilan.bloquees} silence(s)`);
  return bilan;
}

/** Envoi Telegram : le visuel EXACT d'abord, puis la proposition (légende intégrale + boutons). Réclamation atomique : une seule fois. Échec ⇒ rendu, nouvel essai au passage suivant. */
async function envoyer({ prop, deps, now }) {
  const { port, log, compo } = deps;
  const id8 = String(prop.proposal_id).slice(0, 8);
  const ident = prop.identite;
  if (!ident?.canaux?.instagram?.image?.url) { log(`· proposition ${id8} : identité incomplète, rien envoyé`); return false; }
  if (!(await port.reclamerEnvoi(prop.proposal_id))) return false;
  try {
    await deps.envoyerPhoto(ident.canaux.instagram.image.url, legendePhoto(ident));
    const mid = await deps.envoyer(messagePropositionInstagram({ id8, ident, affichage: ident.affichage, expire_at: prop.expire_at, now: now ?? compo.now, amorcage: !!ident.amorcage }), boutonsInstagram(id8));
    await port.noterEnvoi(prop.proposal_id, mid);
    log(`· proposition ${id8} (${prop.case_id}) envoyée sur Telegram (visuel + légende)`);
    return true;
  } catch (e) {
    await port.libererEnvoi(prop.proposal_id);
    log(`· proposition ${id8} : envoi Telegram impossible (${String(e.message).slice(0, 80)}) — nouvel essai au prochain passage`);
    return false;
  }
}

// ---------------------------------------------------------------------
// PHASE 2 — PUBLIER : uniquement les propositions GO_I, après recontrôle COMPLET (éligibilité, légende, visuel, empreinte du contenu de l'image distante).
// deps (en plus) = { buffer, channelId, delaiMin, alerter }
// ---------------------------------------------------------------------
export async function publierInstagram(deps) {
  const { port, compo, activation, holds, ledger, log, ecrire, buffer, channelId, delaiMin = 15, alerter } = deps;
  const bilan = { go: 0, publiees: 0, obsoletes: 0, bloquees: 0 };
  if (!activation.actif || !ecrire) return bilan;
  // Silence = zéro publication : une proposition sans décision et expirée est refermée ici aussi (le passage X / Facebook le fait déjà : la clause « decision is null » rend le doublon sans effet).
  for (const p of await port.propositionsExpirees(compo.now)) await port.decider(p.proposal_id, { decision: 'EXPIREE', canaux: [], now: compo.now, resolution: 'expiree' });
  const aTraiter = await port.propositionsInstagramAvecGo();
  if (!aTraiter.length) return bilan;
  const now = compo.now;
  const candidats = await port.candidats(activation.t0);
  for (const p of aTraiter) {
    bilan.go++;
    const id8 = String(p.proposal_id).slice(0, 8);
    const base = cleBase(p.event_key);
    const stock = p.identite?.canaux?.instagram;
    const ligne = await ledger.lire(base, CANAL_INSTAGRAM);
    let bloque = null;
    if (!ligne || ligne.etat === 'reserve') {                      // « reserve » = réponse incertaine : diffuserCanal la réconcilie, après recontrôle
      if (!stock?.image?.url || !stock?.texte || !stock?.spec_hash) bloque = 'obsolete: identité enregistrée incomplète';
      else if (!channelId || !deps.canalConfigure) bloque = 'bloque: canal Instagram non configuré';
      else {
        const c = candidats.find((x) => cleEvenementDe(x) === base);
        if (!c) bloque = 'obsolete: événement introuvable ou modifié depuis la proposition';
        else {
          const cc = { ...c, event_key: base };
          const v = evaluerCandidat(cc, { t0: activation.t0, now, holds, entree: compo.cases.get(c.case_id) ?? null, ficheHash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
            servi: deps.servi(c.case_id), ficheServie: await deps.ficheServie(c.case_id), proposition: false, ledger: false });
          const pf = v.ok ? controlerPareFeu({ event_key: base, canal: CANAL_INSTAGRAM, diffusions: await port.diffusionsDeAffaire(c.case_id, new Date(now.getTime() - 36 * HEURE)), now }) : [];
          if (!v.ok) bloque = `bloque: ${v.raisons.join(' ; ')}`;
          else if (pf.length) bloque = `bloque: ${pf.join(' ; ')}`;
          else {
            const ig = composerInstagram(cc, compo);
            if (!ig.ok) bloque = `bloque: Instagram n’est plus publiable (${ig.motifs.join(' ; ').slice(0, 200)})`;
            else if (ig.texte !== stock.texte || ig.specHash !== stock.spec_hash || stock.gabarit !== GABARIT_VISUEL || ig.comp.fiche_hash !== p.identite.fiche_hash
              || sha256(jsonCanonique(ig.source)) !== sha256(jsonCanonique(stock.source))) bloque = 'obsolete: l’ensemble validé (affaire, événement, version approuvée, sources, légende, visuel) a changé';
            else {
              try {
                const image = await controlerImageDistante({ url: stock.image.url, attendu: stock.image.sha256, imageDeps: deps.image });
                const rec = identiteInstagram(cc, ig, image).canaux.instagram.empreinte;
                if (rec !== stock.empreinte) bloque = 'obsolete: l’empreinte de l’ensemble (légende + visuel + URL) ne correspond plus à celle validée';
              } catch (e) { bloque = `bloque: le visuel validé n’est plus servi à l’identique (${String(e.message).slice(0, 120)})`; }
            }
          }
        }
      }
    }
    if (bloque) {
      // Un GO périmé n'autorise rien : il portait sur UN ensemble (légende + visuel + URL), pas sur « Instagram » en général.
      await port.resoudre(p.proposal_id, bloque);
      if (bloque.startsWith('obsolete')) bilan.obsoletes++; else bilan.bloquees++;
      await alerter(`🛑 <b>GO Instagram non exécuté</b> (${id8}) : ${esc(bloque.replace(/^(obsolete|bloque): /, ''))}. Aucune publication. Le GO donné ne vaut plus ; une nouvelle proposition sera faite si l’événement reste éligible.`);
      log(`· proposition ${id8} [instagram] : ${motifsPublics(bloque)}`);
      continue;
    }
    let incertain = false;
    try {
      const r = await diffuserCanal({ ev: { event_key: base, type: p.type_event, case_id: p.case_id }, canal: CANAL_INSTAGRAM, texte: stock?.texte ?? ligne?.texte, channelId, imageUrl: stock?.image?.url ?? null, lien: null, ledger, buffer, now, delaiMin, alerter });
      log(`· proposition ${id8} [instagram] : ${r.action}${r.etat ? ` (${r.etat})` : ''}`);
      if (r.action === 'echec') await alerter(`⚠️ <b>Diffusion Instagram refusée par Buffer</b> (${id8}) : ${esc(r.erreur)}`);
      if (['incertain', 'attente'].includes(r.action)) incertain = true;
    } catch (e) { incertain = true; log(`· proposition ${id8} [instagram] : erreur technique isolée (${String(e.message).slice(0, 80)})`); }
    const l = await ledger.lire(base, CANAL_INSTAGRAM);
    const parti = !!l && l.etat !== 'reserve';
    if (!incertain && parti) { await port.resoudre(p.proposal_id, 'publie'); bilan.publiees++; }
    if (parti && !p.notif_programme_at) {
      await port.noterNotif(p.proposal_id, 'programme');
      await alerter(`🕒 <b>Publication Instagram programmée</b> (${id8}) : envoi dans ~${delaiMin} min. Annulable avant l’envoi si la fiche est retirée ; sinon, aucune action requise.`);
    }
  }
  return bilan;
}

/** Après suivi du journal : une confirmation unique, avec le permalien Instagram, quand la publication est réellement partie (état envoyé / vérifié — jamais « accepté par Buffer »). */
export async function confirmerInstagram({ port, ledger, alerter }) {
  let n = 0;
  for (const p of await port.propositionsAConfirmer()) {
    if (!(p.canaux_autorises || []).includes(CANAL_INSTAGRAM)) continue;
    const l = await ledger.lire(cleBase(p.event_key), CANAL_INSTAGRAM);
    if (!l || !['envoye', 'verifie'].includes(l.etat)) continue;
    await port.noterNotif(p.proposal_id, 'publie');
    await alerter(`📸 <b>Publié sur Instagram</b> (${String(p.proposal_id).slice(0, 8)}) : ${l.permalien ? esc(l.permalien) : 'envoyé (permalien non encore disponible)'}`);
    n++;
  }
  return n;
}

/** Un passage Instagram : proposer → publier les GO recontrôlés → confirmer. (Le suivi et les retraits des lignes ouvertes du journal sont faits par suivreEtRetirer, commun aux trois canaux.) */
export async function cycleInstagram(deps) {
  const propositions = await proposerInstagram(deps);
  if (!deps.ecrire) return { propositions };
  const publications = await publierInstagram(deps);
  const confirmees = await confirmerInstagram(deps);
  return { propositions, publications, confirmees };
}
