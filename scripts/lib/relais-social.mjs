// =====================================================================
// scripts/lib/relais-social.mjs — RELAIS SOCIAL, MODE REVIEW : le seul chemin qui mène du « nouveau fait approuvé » à un post X / Facebook.
//
//   Nouveauté validée → contrôles (T0, fraîcheur, page servie) → composition V4.1 → PROPOSITION Telegram → GO social (un clic) → recontrôle → Buffer → journal
//
// Aucune base, aucun réseau, aucun secret ici : tout est INJECTÉ (port de données, client Buffer, notifieur) — le même code est exécuté par scripts/diffuser-social.mjs
// (production) et par les tests (mocks). AUCUN appel de modèle. Le composeur est le V4.1 (scripts/lib/social-editorial.mjs), jamais l'ancien gabarit générique.
//
// GARANTIES (démontrées par scripts/qa/test-relais-social.mjs)
//   · rien ne part sans GO social : le seul appel qui écrit chez Buffer (diffuserCanal) n'est atteint QUE depuis publierDecisions, pour une proposition dont la décision
//     humaine est GO_* et dont l'identité (affaire + événement + version approuvée + sources + texte + URLs, par canal) est INCHANGÉE au moment de l'envoi ;
//   · zéro historique : tout horodatage nécessaire (découverte, création, approbation de fiche, proposition, décision, événement) doit être ≥ T0 ; absent ⇒ échec fermé ;
//   · T0 vient de la base (table immuable), jamais d'une variable ; absent / incohérent / non confirmé par son témoin ⇒ aucune proposition ;
//   · source < 7 jours, accès constaté (libre ou validé), fait non plus ancien que 7 jours avant l'article ; sinon blocage ;
//   · silence, expiration, bouton obsolète, clic rejoué ⇒ zéro publication ; une décision n'est enregistrée qu'une fois.
// =====================================================================
import { createHash } from 'node:crypto';
import { matiereApprouvee, composerPilote, verifierPost, longueurX } from './social-editorial.mjs';
import { cleEvenement, evolutionSignificative, ageJours, FENETRE_SOURCE_JOURS, STATUTS_DIFFUSABLES, lienDiffusion } from './diffusion-sociale.mjs';
import { diffuserCanal } from './diffusion-flux.mjs';

export const CANAUX_RELAIS = Object.freeze(['x', 'facebook']); // JAMAIS Instagram
export const MODE_REVIEW = 'review';
export const T0_PLANCHER = '2026-11-13T00:00:00Z';              // aucune mise en service ne peut être antérieure à la mission
export const VALIDITE_PROPOSITION_H = 48;
const HEURE = 36e5;

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
/** Empreinte d'un texte publié, insensible aux espaces (Buffer normalise parfois les sauts de ligne) : sert aux exclusions. */
export const empreinteTexte = (t) => sha256(String(t ?? '').replace(/\s+/g, ' ').trim());
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
export const jsonCanonique = (v) => JSON.stringify(canon(v));
const dateOuNull = (d) => { if (d == null || d === '') return null; const x = d instanceof Date ? d : new Date(d); return Number.isNaN(x.getTime()) ? null : x; };

// ---------------------------------------------------------------------
// MIGRATION : découpage des instructions (guillemets, $$ et commentaires respectés) + refus de toute instruction destructrice.
// ---------------------------------------------------------------------
export function decouperInstructions(texte) {
  const s = String(texte);
  const out = []; let cur = '', quote = false, dollar = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!quote && !dollar && c === '-' && s[i + 1] === '-') { while (i < s.length && s[i] !== '\n') i++; cur += '\n'; continue; }
    if (!quote && s.startsWith('$$', i)) { dollar = !dollar; cur += '$$'; i++; continue; }
    if (!dollar && c === '\'') quote = !quote;
    if (c === ';' && !quote && !dollar) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** Une migration additive ne contient ni DROP, ni TRUNCATE, ni DELETE FROM, ni UPDATE, ni ALTER … DROP en tête d'instruction. */
export const instructionDestructrice = (ins) => /^\s*(drop\b|truncate\b|delete\s+from\b|update\b|alter\s+table\s+\S+\s+drop\b)/i.test(ins);

// ---------------------------------------------------------------------
// ACTIVATION : coupe-circuit, T0 verrouillé en base, témoin de configuration. Tout doute ⇒ inactif (échec fermé).
// ---------------------------------------------------------------------
/**
 * @param {{env:object, t0Row:{t0:Date|string, mode:string}|null, now:Date}} a
 * @returns {{actif:boolean, t0:Date|null, raisons:string[]}}
 */
export function verifierActivation({ env, t0Row, now, plancher = T0_PLANCHER }) {
  const r = [];
  if (String(env.SNY_DIFFUSION_ACTIVE ?? '').trim() !== '1') r.push('coupe-circuit : SNY_DIFFUSION_ACTIVE ≠ 1 — rien n’est proposé ni publié');
  if (String(env.SNY_DIFFUSION_MODE ?? '').trim() !== MODE_REVIEW) r.push('mode REVIEW non sélectionné (SNY_DIFFUSION_MODE ≠ review) — aucun autre mode n’existe dans ce code');
  let t0 = null;
  if (!t0Row) r.push('T0 absent : non initialisé (relais-social --initialiser-t0)');
  else {
    t0 = dateOuNull(t0Row.t0);
    if (t0Row.mode !== MODE_REVIEW) r.push('T0 enregistré pour un autre mode');
    if (!t0) r.push('T0 illisible');
    else {
      if (t0.getTime() > now.getTime() + 5 * 6e4) r.push('T0 dans le futur : incohérent');
      if (t0.getTime() < Date.parse(plancher)) r.push(`T0 antérieur au plancher ${plancher} : incohérent`);
      const temoin = dateOuNull(String(env.SNY_DIFFUSION_DEPUIS ?? '').trim());
      if (!temoin || Math.floor(temoin.getTime() / 1000) !== Math.floor(t0.getTime() / 1000)) r.push('témoin SNY_DIFFUSION_DEPUIS absent ou différent du T0 en base : configuration non vérifiable');
    }
  }
  return { actif: r.length === 0, t0: r.length === 0 ? t0 : (dateOuNull(t0Row?.t0) ?? null), raisons: r };
}

// ---------------------------------------------------------------------
// ÉLIGIBILITÉ avant composition (horodatages ≥ T0, état, page servie, exclusions, doublons). PURE.
// ---------------------------------------------------------------------
const apresT0 = (nom, d, t0, r) => { const x = dateOuNull(d); if (!x) r.push(`${nom} : horodatage absent — échec fermé`); else if (x < t0) r.push(`${nom} antérieur(e) à T0 : historique, jamais diffusé`); };

/**
 * @param {object} c candidat (voir lireCandidats) · @param {object} ctx { t0, now, holds:Set, entree, ficheHash, servi, ficheServie:{status,hash}|null, proposition:boolean, ledger:boolean, exclusions:Set<canal> }
 * @returns {{ok:boolean, raisons:string[]}} (les raisons ne contiennent ni nom ni lieu : logs publics)
 */
export function evaluerCandidat(c, ctx) {
  const r = [];
  if (!['new_case', 'case_update'].includes(c.type)) return { ok: false, raisons: ['type d’événement hors périmètre (déclaration, correction, source ajoutée…)'] };
  if (!ctx.t0) return { ok: false, raisons: ['T0 non vérifié : aucune proposition'] };
  if (c.type === 'new_case') {
    apresT0('découverte', c.decouverte_at, ctx.t0, r);
    apresT0('création de l’affaire', c.cree_at, ctx.t0, r);
    apresT0('approbation de la fiche', c.fiche_approuvee_at, ctx.t0, r);
  } else {
    apresT0('proposition de maintenance', c.propose_at, ctx.t0, r);
    apresT0('approbation de l’événement', c.decide_at, ctx.t0, r);
    apresT0('enregistrement de l’événement', c.evenement_enregistre_at, ctx.t0, r);
    if (!evolutionSignificative(c.statut_avant, c.statut_apres)) r.push('évolution non significative (statut inchangé, en recul ou ambigu)');
    if (!c.event_id) r.push('événement non identifié');
  }
  if (c.ps !== 'publiée') r.push('affaire non publiée ou retirée');
  if (c.retire) r.push('revue « retirer » enregistrée');
  if (ctx.holds?.has(c.case_id)) r.push('sous HOLD de publication');
  const e = ctx.entree;
  if (!e) r.push('absente de l’artefact public');
  else {
    if (!STATUTS_DIFFUSABLES.has(e.statut_judiciaire)) r.push('statut judiciaire ambigu ou non diffusable (relaxe, classement, non précisé : décision éditoriale spécifique requise)');
    if (c.type === 'case_update' && e.statut_judiciaire !== c.statut_apres) r.push('le statut public n’est pas celui de l’évolution approuvée');
  }
  if (!ctx.ficheHash) r.push('aucune fiche individuelle approuvée pour cette affaire');
  if (ctx.servi !== true) r.push('page d’accueil non servie à l’identique de la projection');
  if (!ctx.ficheServie || ctx.ficheServie.status !== 200) r.push('fiche individuelle non servie en HTTP 200');
  else if (!ctx.ficheHash || ctx.ficheServie.hash !== ctx.ficheHash) r.push('version servie de la fiche ≠ version approuvée');
  if (ctx.proposition) r.push('événement déjà proposé (doublon social)');
  if (ctx.ledger) r.push('événement déjà diffusé (journal de diffusion)');
  return { ok: r.length === 0, raisons: r };
}

// ---------------------------------------------------------------------
// FRAÎCHEUR du fait et de la source (après composition : la source citée par CHAQUE canal). PURE.
// ---------------------------------------------------------------------
const ACCES_VALIDE = ['libre', 'événement validé', 'information validée'];
/** @returns {string[]} raisons de blocage (vide = frais) */
export function controlerFraicheur({ source, dateFait, now }) {
  const r = [];
  if (!source?.url) return ['source de l’affirmation introuvable'];
  const age = ageJours(source.publie_le, now);
  if (age === null) r.push('date de l’article absente ou ambiguë : silence');
  else if (age < -1) r.push('date de l’article dans le futur : silence');
  else if (age >= FENETRE_SOURCE_JOURS) r.push(`article publié il y a ${Math.floor(age)} jours (≥ ${FENETRE_SOURCE_JOURS}) : information non récente`);
  if (!ACCES_VALIDE.includes(source.acces)) r.push('article non lu en entier par SNY (accès partiel ou non constaté) : source insuffisante');
  if (dateFait) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(dateFait));
    const ecart = m && source.publie_le ? (Date.parse(`${String(source.publie_le).slice(0, 10)}T00:00:00Z`) - Date.parse(`${m[1]}T00:00:00Z`)) / 864e5 : null;
    if (ecart === null) r.push('date du fait illisible : silence');
    else if (ecart > FENETRE_SOURCE_JOURS) r.push(`fait daté ${Math.floor(ecart)} jours avant l’article : republication d’un fait ancien`);
    else if (ecart < -1) r.push('fait postérieur à l’article : incohérence de dates');
  }
  return r;
}

// ---------------------------------------------------------------------
// COMPOSITION V4.1 + contrôleur indépendant + garde-fous du relais (accès, fraîcheur). Les textes d'ici sont CEUX de Telegram et de Buffer.
// ---------------------------------------------------------------------
/** compo = { cases:Map, ev:object (evenements.json), redirections:object, wording:object, dossierFiche:(id)=>…, site:string, now:Date } */
export function composerEvenement(c, compo) {
  const entree = compo.cases.get(c.case_id) ?? null;
  const famille = c.type === 'new_case' ? 'nouvelle_affaire' : 'evolution';
  const scenario = { famille, case_id: c.case_id, ...(c.type === 'case_update' ? { event_id: c.event_id } : {}) };
  const M = matiereApprouvee({ entree, dossier: compo.dossierFiche(c.case_id), empreinteApprouvee: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
    evenements: compo.ev.affaires?.[c.case_id] ?? [], matiere: (compo.ev.matiere || []).filter((m) => m.case_id === c.case_id), wording: compo.wording });
  const r = composerPilote({ scenario, M, publiques: compo.cases, site: compo.site, redirections: compo.redirections });
  const evt = c.type === 'case_update' ? (M.evenements || []).find((x) => x.event_id === c.event_id) ?? null : null;
  const dateFait = c.type === 'case_update' ? evt?.date : entree?.etat?.date ?? null;
  const canaux = {};
  for (const canal of CANAUX_RELAIS) {
    const p = r[canal];
    const motifs = [];
    if (r.etat === 'BLOQUE') motifs.push(...r.motifs);
    else if (p.etat !== 'OK') motifs.push(...(p.motifs || ['composition impossible']));
    else {
      const verif = verifierPost(p, canal, M, compo.site, compo.redirections);
      if (!verif.ok) motifs.push(...verif.controles.filter((k) => !k.ok).map((k) => `contrôle V4.1 « ${k.nom} » : ${k.detail || 'échec'}`));
      const attention = [...r.attention, ...(p.attention || [])];
      const bloquantes = attention.filter((a) => /source liée/.test(a));
      motifs.push(...bloquantes);
      const source = canal === 'x' ? p.source : r.sourcePrincipale;
      motifs.push(...controlerFraicheur({ source: source ? M.sources.get(source.url) ?? source : null, dateFait, now: compo.now }));
      if (!motifs.length) {
        const liens = (p.texte.match(/https?:\/\/\S+/g) || []);
        canaux[canal] = { ok: true, texte: p.texte, longueur: canal === 'x' ? longueurX(p.texte) : [...p.texte].length, urls: liens, source: { media: source.media, url: source.url, publie_le: source.publie_le ?? null },
          reserves: [...attention.filter((a) => !/source liée/.test(a)), ...(dateFait ? [] : ['date du fait non établie : seule la date de l’article fait foi — ancienneté à apprécier'])], repli: !!p.repli };
        continue;
      }
    }
    canaux[canal] = { ok: false, motifs: [...new Set(motifs)] };
  }
  const lienSny = (canal) => lienDiffusion({ site: compo.site, case_id: c.case_id, type: c.type, statut: evt?.statut ?? c.statut_apres ?? null, canal, fiche: !!M.empreinte });
  return { famille, M, canaux, evt, entree, fiche_hash: M.empreinte, lien: { x: lienSny('x'), facebook: lienSny('facebook') } };
}

// ---------------------------------------------------------------------
// IDENTITÉ IMMUABLE : affaire + événement + version approuvée + sources + texte + URLs + canal → empreinte. PURE.
// ---------------------------------------------------------------------
export function identiteDe(c, comp) {
  const base = { case_id: c.case_id, event_key: c.event_key, type: c.type, event_id: c.event_id ?? null, statut_apres: c.statut_apres ?? null, fiche_hash: comp.fiche_hash };
  const parCanal = {};
  for (const canal of CANAUX_RELAIS) {
    const k = comp.canaux[canal];
    if (!k?.ok) continue;
    parCanal[canal] = { texte: k.texte, urls: k.urls, source: k.source, empreinte: sha256(jsonCanonique({ ...base, canal, texte: k.texte, urls: k.urls, source: k.source })) };
  }
  return { ...base, canaux: parCanal, liens: comp.lien };
}

// ---------------------------------------------------------------------
// MESSAGE TELEGRAM DE PROPOSITION. PURE. Contient les deux textes INTÉGRAUX, tels qu'ils partiront.
// ---------------------------------------------------------------------
export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const jourFr = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'date inconnue');
export function messageProposition({ id8, c, comp, ident, expire_at, site, now }) {
  const e = comp.entree;
  const fb = ident.canaux.facebook, x = ident.canaux.x;
  const src = (fb ?? x).source;
  const age = ageJours(src.publie_le, now);
  const evenement = c.type === 'new_case' ? 'Nouvelle affaire' : `Évolution judiciaire : ${esc(c.statut_avant ?? '?')} → ${esc(c.statut_apres)}${comp.evt?.date ? ` (${jourFr(comp.evt.date)})` : ''}`;
  const reserves = [...new Set([...(comp.canaux.facebook?.reserves ?? []), ...(comp.canaux.x?.reserves ?? [])])];
  const bloques = CANAUX_RELAIS.filter((k) => !comp.canaux[k]?.ok).map((k) => `${k === 'x' ? 'X' : 'Facebook'} BLOQUÉ : ${esc((comp.canaux[k]?.motifs || []).join(' ; ').slice(0, 300))}`);
  let t = `📣 <b>RELAIS SOCIAL — proposition</b> (${id8})\n<b>${esc(e.etablissement)} — ${esc(e.commune)}</b>\n${evenement}\n`
    + `Source : ${esc(src.media)}, ${jourFr(src.publie_le)}${age != null ? ` (il y a ${Math.max(0, Math.floor(age))} j)` : ''} — ${esc(src.url)}\n`
    + `Fiche SNY : ${site}/affaires/${esc(c.case_id.toLowerCase())}/\n`
    + `Contrôles : T0 ✓ · fiche approuvée et servie (empreinte ${esc(comp.fiche_hash)}) ✓ · composeur ${esc('V4.1')} + vérificateur ✓ · source < ${FENETRE_SOURCE_JOURS} j lue ✓`
    + (reserves.length ? `\n⚠️ Réserves : ${esc(reserves.join(' ; ').slice(0, 500))}` : '') + (bloques.length ? `\n🚫 ${bloques.join('\n🚫 ')}` : '') + '\n';
  if (fb) t += `\n<b>Facebook</b> (${[...fb.texte].length} car.)\n<pre>${esc(fb.texte)}</pre>\n`;
  if (x) t += `\n<b>X</b> (${longueurX(x.texte)}/280 car., URL = 23)\n<pre>${esc(x.texte)}</pre>\n`;
  t += `\nValable jusqu’au ${new Date(expire_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Rien n’est publié sans ton clic ; le texte et la source sont revérifiés juste avant l’envoi, et la publication est programmée avec un délai d’annulation.`;
  // L'API Telegram refuse plus de 4096 caractères : on abrège les réserves (jamais les textes des posts, jamais les contrôles bloquants).
  if (t.length > 4000) t = t.replace(/\n⚠️ Réserves : [^\n]*/, '\n⚠️ Réserves : voir la fiche et le contrôleur (liste trop longue pour ce message)');
  return t;
}
export function boutonsProposition(id8, canaux) {
  const l = [];
  if (canaux.includes('x') && canaux.includes('facebook')) l.push([{ text: '✅ GO X + Facebook', callback_data: `sny:SG:XF:${id8}` }]);
  const seuls = [];
  if (canaux.includes('facebook')) seuls.push({ text: 'GO Facebook seul', callback_data: `sny:SG:F:${id8}` });
  if (canaux.includes('x')) seuls.push({ text: 'GO X seul', callback_data: `sny:SG:X:${id8}` });
  if (seuls.length) l.push(seuls);
  l.push([{ text: '⛔ Refuser', callback_data: `sny:SG:R:${id8}` }]);
  return { inline_keyboard: l };
}

// ---------------------------------------------------------------------
// DÉCISION HUMAINE (clic Telegram) : enregistrée UNE fois, jamais plus large que ce qui a été proposé.
// ---------------------------------------------------------------------
export const ACTIONS_SOCIALES = Object.freeze({ XF: { decision: 'GO_XF', canaux: ['x', 'facebook'] }, F: { decision: 'GO_F', canaux: ['facebook'] }, X: { decision: 'GO_X', canaux: ['x'] }, R: { decision: 'REFUS', canaux: [] } });
/**
 * @param {{port:object, action:string, cle:string, now:Date, actif:boolean}} a
 * @returns {Promise<{issue:'enregistree'|'double_clic'|'introuvable'|'bouton_invalide'|'expiree'|'inactif', proposition?:object, decision?:string}>}
 */
export async function enregistrerDecision({ port, action, cle, now, actif }) {
  const a = ACTIONS_SOCIALES[action];
  if (!a || !/^[0-9a-f]{8}$/.test(cle || '')) return { issue: 'bouton_invalide' };
  const p = await port.propositionParCle(cle);
  if (!p) return { issue: 'introuvable' };
  if (p.decision) return { issue: 'double_clic', proposition: p, decision: p.decision };
  if (!actif && a.canaux.length) return { issue: 'inactif', proposition: p };
  if (a.canaux.some((k) => !(p.canaux_proposes || []).includes(k))) return { issue: 'bouton_invalide', proposition: p };
  if (dateOuNull(p.expire_at) && now.getTime() > dateOuNull(p.expire_at).getTime()) {
    await port.decider(p.proposal_id, { decision: 'EXPIREE', canaux: [], now, resolution: 'expiree' });
    return { issue: 'expiree', proposition: p };
  }
  const ok = await port.decider(p.proposal_id, { decision: a.decision, canaux: a.canaux, now, resolution: a.decision === 'REFUS' ? 'refuse' : null });
  return ok ? { issue: 'enregistree', proposition: p, decision: a.decision } : { issue: 'double_clic', proposition: p };
}

// ---------------------------------------------------------------------
// PHASE 1 — PROPOSER : événements éligibles → UNE proposition Telegram chacun. Silence si rien d'éligible (aucune recherche historique pour « remplir »).
// ---------------------------------------------------------------------
/**
 * deps = { port, compo, activation:{actif,t0}, holds:Set, canauxConfigures:string[], envoyer:(texte, markup)=>Promise<number|null>, log, ecrire:boolean, ficheServie:(id)=>Promise<{status,hash}|null>, servi:(id)=>boolean }
 */
export async function proposerNouveautes(deps) {
  const { port, compo, activation, holds, canauxConfigures, envoyer, log, ecrire } = deps;
  const bilan = { candidats: 0, proposees: 0, bloquees: 0, envoyees: 0 };
  if (!activation.actif) { log(`relais social inactif : ${activation.raisons.join(' ; ')}`); return bilan; }
  const now = compo.now;
  const candidats = await port.candidats(activation.t0);
  bilan.candidats = candidats.length;
  for (const c of candidats) {
    c.event_key = c.type === 'new_case' ? cleEvenement('new_case', c.case_id) : cleEvenement('case_update', c.case_id, c.statut_apres);
    const prop = await port.propositionParEvenement(c.event_key);
    // Proposition déjà créée : on ne la recrée jamais ; on ne fait qu'envoyer le message si l'envoi n'a pas eu lieu (reprise après panne).
    if (prop) {
      if (ecrire && !prop.decision && prop.telegram_message_id == null && new Date(prop.expire_at) > now) bilan.envoyees += await envoyerProposition({ prop, deps, c }) ? 1 : 0;
      continue;
    }
    const exclus = await port.exclusionsDe(c.event_key);
    const ctx = { t0: activation.t0, now, holds, entree: compo.cases.get(c.case_id) ?? null, ficheHash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
      servi: deps.servi(c.case_id), ficheServie: await deps.ficheServie(c.case_id), proposition: false, ledger: await port.ledgerDe(c.event_key), exclusions: exclus };
    const v = evaluerCandidat(c, ctx);
    if (!v.ok) { bilan.bloquees++; log(`· ${c.type} ${c.case_id} : SILENCE — ${v.raisons.join(' ; ')}`); continue; }
    const comp = composerEvenement(c, compo);
    for (const k of CANAUX_RELAIS) {
      if (exclus.has(k) && comp.canaux[k]?.ok) comp.canaux[k] = { ok: false, motifs: ['publication déjà faite hors circuit sur ce canal (exclusion définitive)'] };
      if (comp.canaux[k]?.ok && !canauxConfigures.includes(k)) comp.canaux[k] = { ok: false, motifs: ['canal non configuré'] };
      if (comp.canaux[k]?.ok && await port.empreinteTexteExclue(k, empreinteTexte(comp.canaux[k].texte))) comp.canaux[k] = { ok: false, motifs: ['texte identique à une publication déjà faite (exclusion)'] };
    }
    const proposables = CANAUX_RELAIS.filter((k) => comp.canaux[k]?.ok);
    if (!proposables.length) { bilan.bloquees++; log(`· ${c.type} ${c.case_id} : SILENCE — aucun canal publiable : ${CANAUX_RELAIS.map((k) => `${k}: ${(comp.canaux[k]?.motifs || []).join(' ; ').slice(0, 160)}`).join(' | ')}`); continue; }
    const ident = identiteDe(c, comp);
    log(`· ${c.type} ${c.case_id} : ÉLIGIBLE (${proposables.join(' + ')})${ecrire ? '' : ' — plan, rien enregistré ni envoyé'}`);
    if (!ecrire) continue;
    const expire_at = new Date(now.getTime() + VALIDITE_PROPOSITION_H * HEURE);
    const cree = await port.creerProposition({ event_key: c.event_key, case_id: c.case_id, type_event: c.type, identite: ident, texte_x: ident.canaux.x?.texte ?? null, texte_facebook: ident.canaux.facebook?.texte ?? null,
      canaux_proposes: proposables, empreinte_x: ident.canaux.x?.empreinte ?? null, empreinte_facebook: ident.canaux.facebook?.empreinte ?? null, expire_at });
    if (!cree) continue; // un autre passage vient de la créer
    bilan.proposees++;
    bilan.envoyees += await envoyerProposition({ prop: cree, deps, c, comp, ident }) ? 1 : 0;
  }
  log(`${bilan.candidats} candidat(s) après T0, ${bilan.proposees} proposition(s) créée(s), ${bilan.bloquees} silence(s)`);
  return bilan;
}

async function envoyerProposition({ prop, deps, c, comp = null, ident = null }) {
  const { port, compo, envoyer, log } = deps;
  const id8 = String(prop.proposal_id).slice(0, 8);
  const reconstruit = ident ?? prop.identite;
  const cp = comp ?? composerEvenement(c, compo);
  // Le message reprend le texte ENREGISTRÉ (celui du GO), pas une recomposition éventuellement différente.
  if (!(await port.reclamerEnvoi(prop.proposal_id))) return false;
  const texte = messageProposition({ id8, c, comp: cp, ident: reconstruit, expire_at: prop.expire_at, site: compo.site, now: compo.now });
  try {
    const mid = await envoyer(texte, boutonsProposition(id8, prop.canaux_proposes));
    await port.noterEnvoi(prop.proposal_id, mid);
    log(`· proposition ${id8} (${c.case_id}) envoyée sur Telegram`);
    return true;
  } catch (e) {
    await port.libererEnvoi(prop.proposal_id);
    log(`· proposition ${id8} : envoi Telegram impossible (${String(e.message).slice(0, 80)}) — nouvel essai au prochain passage`);
    return false;
  }
}

// ---------------------------------------------------------------------
// PHASE 2 — PUBLIER : uniquement les propositions dotées d'un GO social, après recontrôle de l'éligibilité ET de l'identité.
// ---------------------------------------------------------------------
/**
 * deps (en plus de proposerNouveautes) = { buffer, ledger, channelIds:{x,facebook}, delaiMin, alerter:(texte)=>Promise }
 */
export async function publierDecisions(deps) {
  const { port, compo, activation, holds, canauxConfigures, log, ecrire, buffer, ledger, channelIds, delaiMin = 15, alerter } = deps;
  const bilan = { go: 0, publiees: 0, obsoletes: 0, bloquees: 0, expirees: 0 };
  if (!activation.actif || !ecrire) return bilan;
  const now = compo.now;
  // Silence = zéro publication : une proposition sans décision et expirée est refermée, jamais publiée.
  for (const p of await port.propositionsExpirees(now)) { await port.decider(p.proposal_id, { decision: 'EXPIREE', canaux: [], now, resolution: 'expiree' }); bilan.expirees++; log(`· proposition ${String(p.proposal_id).slice(0, 8)} expirée sans GO : aucun envoi`); }
  const aTraiter = await port.propositionsAvecGo();
  if (!aTraiter.length) return bilan;
  const candidats = await port.candidats(activation.t0);
  for (const p of aTraiter) {
    bilan.go++;
    const id8 = String(p.proposal_id).slice(0, 8);
    const autorises = (p.canaux_autorises || []).filter((k) => CANAUX_RELAIS.includes(k) && p.canaux_proposes.includes(k));
    const dejaCrees = [];
    for (const k of autorises) { const l = await ledger.lire(p.event_key, k); if (l && l.etat !== 'reserve') dejaCrees.push(k); } // une ligne « reserve » = réponse incertaine : réconciliée par diffuserCanal, après recontrôle
    const aCreer = autorises.filter((k) => !dejaCrees.includes(k));
    let bloque = null;
    if (aCreer.length) {
      // Recontrôle COMPLET : même événement, mêmes horodatages, page servie, source récente, composition et empreinte identiques.
      const c = candidats.find((x) => (x.type === 'new_case' ? cleEvenement('new_case', x.case_id) : cleEvenement('case_update', x.case_id, x.statut_apres)) === p.event_key);
      if (!c) bloque = 'obsolete: événement introuvable ou modifié depuis la proposition';
      else {
        c.event_key = p.event_key;
        const v = evaluerCandidat(c, { t0: activation.t0, now, holds, entree: compo.cases.get(c.case_id) ?? null, ficheHash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
          servi: deps.servi(c.case_id), ficheServie: await deps.ficheServie(c.case_id), proposition: false, ledger: false, exclusions: await port.exclusionsDe(p.event_key) });
        if (!v.ok) bloque = `bloque: ${v.raisons.join(' ; ')}`;
        else {
          const comp = composerEvenement(c, compo);
          const ident = identiteDe(c, comp);
          const exclus = await port.exclusionsDe(p.event_key);
          for (const k of aCreer) {
            if (exclus.has(k)) bloque = `bloque: publication déjà faite hors circuit sur ${k}`;
            else if (!canauxConfigures.includes(k) || !channelIds[k]) bloque = `bloque: canal ${k} non configuré`;
            else if (!comp.canaux[k]?.ok) bloque = `bloque: ${k} n’est plus publiable (${(comp.canaux[k]?.motifs || []).join(' ; ').slice(0, 200)})`;
            else if (ident.canaux[k].empreinte !== (k === 'x' ? p.empreinte_x : p.empreinte_facebook) || ident.canaux[k].texte !== (k === 'x' ? p.texte_x : p.texte_facebook)) bloque = `obsolete: l’ensemble validé (affaire, événement, version approuvée, sources, texte, URLs) a changé pour ${k}`;
            if (bloque) break;
          }
        }
      }
    }
    if (bloque) {
      // Un GO périmé n'autorise rien : ni ce canal ni l'autre (le GO portait sur UN ensemble).
      await port.resoudre(p.proposal_id, bloque);
      if (bloque.startsWith('obsolete')) bilan.obsoletes++; else bilan.bloquees++;
      await alerter(`🛑 <b>GO social non exécuté</b> (${id8}) : ${esc(bloque.replace(/^(obsolete|bloque): /, ''))}. Aucune publication. Le GO donné ne vaut plus ; une nouvelle proposition sera faite si l’événement reste éligible.`);
      log(`· proposition ${id8} : ${bloque}`);
      continue;
    }
    let incertain = false;
    for (const k of aCreer) {
      const texte = k === 'x' ? p.texte_x : p.texte_facebook;
      try {
        const r = await diffuserCanal({ ev: { event_key: p.event_key, type: p.type_event, case_id: p.case_id }, canal: k, texte, channelId: channelIds[k], imageUrl: null, lien: p.identite?.liens?.[k] ?? null, ledger, buffer, now, delaiMin, alerter });
        log(`· proposition ${id8} [${k}] : ${r.action}${r.etat ? ` (${r.etat})` : ''}`);
        if (r.action === 'echec') await alerter(`⚠️ <b>Diffusion sociale refusée par Buffer</b> (${k}, ${id8}) : ${esc(r.erreur)}`);
        if (['incertain', 'attente'].includes(r.action)) incertain = true;
      } catch (e) { incertain = true; log(`· proposition ${id8} [${k}] : erreur technique isolée (${String(e.message).slice(0, 80)})`); }
    }
    const lignes = [];
    for (const k of autorises) lignes.push(await ledger.lire(p.event_key, k));
    const tout = lignes.every((l) => l && l.etat !== 'reserve');
    if (!incertain && tout) { await port.resoudre(p.proposal_id, 'publie'); bilan.publiees++; }
    if (tout && !p.notif_programme_at) {
      await port.noterNotif(p.proposal_id, 'programme');
      await alerter(`🕒 <b>Publication programmée</b> (${id8}) : ${autorises.map((k) => (k === 'x' ? 'X' : 'Facebook')).join(' + ')}, envoi dans ~${delaiMin} min. Annulable avant l’envoi si la fiche est retirée ; sinon, aucune action requise.`);
    }
  }
  return bilan;
}

/** Après suivi du journal : une confirmation unique, avec les permaliens disponibles, quand chaque canal autorisé est parti. */
export async function confirmerPublications({ port, ledger, alerter }) {
  let n = 0;
  for (const p of await port.propositionsAConfirmer()) {
    const lignes = [];
    for (const k of p.canaux_autorises || []) lignes.push(await ledger.lire(p.event_key, k));
    if (!lignes.length || !lignes.every((l) => l && ['envoye', 'verifie'].includes(l.etat))) continue;
    await port.noterNotif(p.proposal_id, 'publie');
    await alerter(`📣 <b>Publié</b> (${String(p.proposal_id).slice(0, 8)}) :\n${lignes.map((l) => `• ${l.canal === 'x' ? 'X' : 'Facebook'} : ${l.permalien ? esc(l.permalien) : 'envoyé (permalien non encore disponible)'}`).join('\n')}`);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------
// SUIVI ET RETRAITS des lignes ouvertes du journal (Buffer) : annulation avant envoi si la fiche est retirée, alerte prioritaire si déjà publié.
// ---------------------------------------------------------------------
import { suivreLigne, retirerLigne, reconcilierSansCreer } from './diffusion-flux.mjs';
export async function suivreEtRetirer({ port, compo, holds, buffer, ledger, channelIds, alerter, log }) {
  let erreurs = 0;
  const now = compo.now;
  const ouvertes = await port.lignesOuvertes();
  const etats = new Map((await port.etatsAffaires([...new Set(ouvertes.map((r) => r.case_id))])).map((e) => [e.case_id, e]));
  for (const row of ouvertes) {
    try {
      const e = etats.get(row.case_id);
      const motif = !e || e.ps !== 'publiée' ? 'affaire retirée' : e.retire ? 'revue « retirer »' : holds.has(row.case_id) ? 'HOLD de publication' : !compo.cases.has(row.case_id) ? 'absente de l’artefact public' : null;
      if (motif) { const r = await retirerLigne({ row, motif, channelId: channelIds[row.canal], ledger, buffer, alerter }); log(`· retrait ${row.case_id} [${row.canal}] : ${r.action}`); continue; }
      if (row.etat === 'reserve') { const r = await reconcilierSansCreer({ row, channelId: channelIds[row.canal], ledger, buffer, now, alerter }); log(`· réconciliation ${row.case_id} [${row.canal}] : ${r.action}`); continue; }
      if (row.etat !== 'verifie') { const r = await suivreLigne({ row, ledger, buffer, now, alerter }); if (r.action !== 'inchange' && r.action !== 'rien') log(`· suivi ${row.case_id} [${row.canal}] : ${r.action}${r.etat ? ` (${r.etat})` : ''}`); }
    } catch (e) { erreurs++; log(`· suivi/retrait ${row.case_id} [${row.canal}] : erreur technique isolée (${String(e.message).slice(0, 80)})`); }
  }
  return erreurs;
}

/**
 * UN passage complet du relais (c'est ce que `diffuser-social.mjs --ecrire` exécute, et ce que les tests exécutent) :
 * proposer les nouveautés éligibles → publier les GO sociaux recontrôlés → suivre / retirer → confirmer. Inactif ⇒ rien, sans toucher ni Buffer ni Telegram.
 */
export async function executerCycle(deps) {
  const { activation, log } = deps;
  if (!activation.actif) { log(`relais social INACTIF : ${activation.raisons.join(' ; ')}`); return { actif: false }; }
  const propositions = await proposerNouveautes(deps);
  if (!deps.ecrire) return { actif: true, propositions };
  const publications = await publierDecisions(deps);
  const erreurs = await suivreEtRetirer(deps);
  const confirmees = await confirmerPublications(deps);
  return { actif: true, propositions, publications, erreurs, confirmees };
}
