#!/usr/bin/env node
// =====================================================================
// scripts/telegram-v0.mjs — SNY Telegram V0
//
//   node scripts/telegram-v0.mjs info <cle>       message INFORMATION, sans bouton
//   node scripts/telegram-v0.mjs decision <cle>  message DECISION, 3 boutons
//   node scripts/telegram-v0.mjs poll [secondes]  reçoit les clics (long polling)
//   node scripts/telegram-v0.mjs recevoir         traite UNE fois les clics en attente (CI) ; journalise chaque passage et chaque clic
//   node scripts/telegram-v0.mjs test-clic        envoie un bouton de TEST (aucune donnée éditoriale) ; son clic est retrouvé par « diagnostic »
//   node scripts/telegram-v0.mjs diagnostic       bot, webhook, clics en attente chez Telegram, dernières lignes du journal (lecture seule)
//
// <cle> = préfixe hexadécimal de proposal_id (8 caractères).
// Secrets lus dans .env.local : TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID.
// Le token n'est jamais affiché ni journalisé (il fait partie de l'URL de l'API :
// aucune erreur réseau n'est donc relayée telle quelle).
// VALIDATE n'écrit que state_proposals.decision. Aucune publication, ici ni ailleurs.
// =====================================================================
import { connecter } from './lib/neon.mjs';
import { messageDecision, boutons, modeCreation } from './lib/discovery-messages.mjs';
import { VERS_DB, NC_VERS_DB, ACTION_NC, ESSAIS_MAX, decoderCallback, boutonValable, schemaBoucle, journaliser, essaisDe, dernierAConfirmer } from './lib/telegram-clics.mjs';
import { evenementDejaValide } from './lib/routage-veille.mjs';
import { detecterInstitutionnel } from './lib/evenement-institutionnel.mjs';

const { sql } = connecter(); // charge aussi .env.local dans process.env
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED = Number(process.env.TELEGRAM_ALLOWED_USER_ID);
if (!TOKEN || !Number.isInteger(ALLOWED)) {
  console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_ALLOWED_USER_ID manquants dans .env.local');
  process.exit(1);
}

async function tg(method, body = {}) {
  let r;
  try {
    r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Telegram ${method} : erreur réseau`);
  }
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method} : ${j.description || r.status}`);
  return j.result;
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : 'date inconnue');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function charger(cle) {
  if (!/^[0-9a-f]{8}$/.test(cle || '')) throw new Error('clé attendue : 8 caractères hexadécimaux');
  const r = await sql`
    select p.proposal_id, p.case_id, p.statut_avant::text avant, p.statut_propose::text apres,
           p.event_date::text ed, c.statut_judiciaire::text courant,
           p.analysis_action, p.facts, p.decision::text decision, p.payload->>'rattachement' rat,
           c.etablissement, c.commune, a.media, a.publication_date, a.publication_date::text pd, a.url
      from state_proposals p
      join cases c using (case_id)
      left join articles a using (article_id)
     where p.proposal_id::text like ${cle + '%'}`;
  if (r.length !== 1) throw new Error(`clé ${cle} : ${r.length} proposition(s) trouvée(s)`);
  return r[0];
}

const citation = (p) => {
  const f = Array.isArray(p.facts) ? p.facts.find((x) => x?.evidence?.length) : null;
  return f ? cut(String(f.evidence[0]).replace(/\s+/g, ' '), 220) : null;
};

// Contrat V0.1 : une preuve affichée sous un bouton doit établir l'ÉVÉNEMENT
// qui justifie l'état proposé, pas seulement les faits allégués.
// (POC-08 : la 1re citation décrivait le viol allégué, l'enquête n'était que dans la 4e.)
const ETABLIT = {
  'plainte': /plainte/i,
  'enquête': /enqu[êe]te|garde à vue|information judiciaire/i,
  'mise en examen': /mis(e|es)? en examen/i,
  'procès': /proc[èe]s|comparaî|comparu|jugé|renvoy[ée]|audience/i,
  'condamnation non définitive': /condamn/i,
  'condamnation définitive': /condamn/i,
  'relaxe / non-lieu / classement': /relax|non-lieu|classé|classement/i,
};
/** La citation (parmi toutes celles des faits) qui établit statut_propose, ou null. */
function preuveDe(p) {
  const re = ETABLIT[p.apres];
  if (!re || !Array.isArray(p.facts)) return null;
  for (const f of p.facts) {
    if (f?.resulting_state && f.resulting_state !== p.apres) continue;
    const e = (f?.evidence || []).find((s) => re.test(s));
    if (e) return cut(String(e).replace(/\s+/g, ' '), 320);
  }
  return null;
}
const entete = (p) =>
  `<b>${esc(p.etablissement)}</b> — ${esc(p.commune)}\n${esc(p.media || 'source inconnue')} · ${jour(p.publication_date)}` +
  (/^https?:\/\//.test(p.url || '') ? `\n<a href="${esc(p.url).replace(/"/g, '&quot;')}">Ouvrir l’article</a>` : '');

let dernierAvecBoutons = false;
async function envoyer(text, reply_markup) {
  dernierAvecBoutons = !!reply_markup;
  if (process.env.SNY_DRY) { console.log((reply_markup ? '[BOUTONS] ' : '[sans bouton] ') + text + '\n'); return null; }
  const m = await tg('sendMessage', { chat_id: ALLOWED, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup });
  console.log(`envoyé (message_id ${m.message_id})`);
  return m.message_id;
}

async function info(cle) {
  const p = await charger(cle);
  const q = citation(p);
  const corps = p.analysis_action === 'STATE_CHANGE'
    ? `Évolution évoquée, mais la source ne l’établit pas assez : aucun changement proposé (état : ${esc(p.avant)}).`
    : `Nouvel article traité.\nAucun changement de la fiche (état : ${esc(p.avant)}).`;
  return envoyer(`🔄 <b>MAINTENANCE</b> · 📰 ${entete(p)}\n\n${corps}` + (q ? `\n\n« ${esc(q)} »` : ''));
}

const boutonsEtat = (k) => ({
  inline_keyboard: [[
    { text: '✅ VALIDATE', callback_data: `sny:VALIDATE:${k}` },
    { text: '🟡 REVIEW', callback_data: `sny:REVIEW:${k}` },
    { text: '⛔ REJECT', callback_data: `sny:REJECT:${k}` },
  ]],
});

const JOUR = 864e5;
/** Deux propositions (même affaire, même état cible) rapportent-elles le MÊME fait ? Date écrite égale, ou publications à ≤ 3 jours quand une date manque. */
function memeFaitSoumis(p, q) {
  if (p.ed && q.ed) return p.ed === q.ed;
  const proche = (pub, ed) => pub && ed && Date.parse(pub) - Date.parse(ed) >= 0 && Date.parse(pub) - Date.parse(ed) <= 3 * JOUR;
  if (p.ed && !q.ed) return proche(q.pd, p.ed);
  if (!p.ed && q.ed) return proche(p.pd, q.ed);
  return !!(p.pd && q.pd && Math.abs(Date.parse(p.pd) - Date.parse(q.pd)) <= 3 * JOUR);
}

/**
 * Un même FAIT rapporté par deux articles ne se décide qu'UNE fois. Cas réel (09/10/2026, FR-2026-0004) : la condamnation du
 * 15/09 était déjà consignée, et deux nouveaux articles « de mardi » ont chacun déclenché une demande d'arbitrage.
 * Lève une erreur (la proposition est alors écartée du flux, sans message) si le fait est déjà consigné ou déjà soumis.
 */
async function verifierFaitInedit(p) {
  const evs = await sql`select case_id, event_type::text event_type, event_date::text event_date, statut_apres::text statut_apres
                          from case_events where case_id = ${p.case_id}`;
  const deja = evenementDejaValide(evs, p.case_id, p.apres, p.ed, p.pd);
  if (deja) throw new Error(`fait déjà consigné (${deja.event_type} du ${String(deja.event_date).slice(0, 10)}) : aucune nouvelle demande d’arbitrage`);
  const soeurs = await sql`
    select left(q.proposal_id::text, 8) k, q.event_date::text ed, a.publication_date::text pd
      from state_proposals q left join articles a on a.article_id = q.article_id
     where q.case_id = ${p.case_id} and q.statut_propose = ${p.apres}::statut_judiciaire and q.proposal_id <> ${p.proposal_id}
       and q.decision is null
       and exists (select 1 from telegram_envois t where t.kind = 'decision' and t.cle = q.proposal_id::text)`;
  const meme = soeurs.find((q) => memeFaitSoumis(p, q));
  if (meme) throw new Error(`même fait déjà soumis à décision (${meme.k}) : une seule demande d’arbitrage`);
}

async function decision(cle) {
  const p = await charger(cle);
  if (p.decision) throw new Error(`déjà décidée (${p.decision}) — rien envoyé`);
  if (p.avant !== p.courant) throw new Error(`proposition périmée (fiche : ${p.courant}, proposition partie de : ${p.avant}) — rien envoyé`);
  await verifierFaitInedit(p);
  const q = preuveDe(p);
  if (!q) {
    // Preuve insuffisante pour un changement d'état : l'article reste dans le flux, sans bouton.
    console.log('preuve ne suffisant pas à établir ' + p.apres + ' → message INFORMATION, pas de bouton');
    return info(cle);
  }
  return envoyer(
    `🔄 <b>MAINTENANCE</b> · ⚖️ ${entete(p)}\n\nNOUVELLE ÉVOLUTION\n${esc(p.avant)} → <b>${esc(p.apres)}</b>` +
      `\n\nPreuve :\n« ${esc(q)} »` +
      `\n\nSNY a besoin de ta validation.`,
    boutonsEtat(cle),
  );
}

// --- événement institutionnel (hors état judiciaire) -------------------
const citationsDe = (p) => (Array.isArray(p.facts) ? p.facts.flatMap((f) => f?.evidence || []) : []);

/**
 * ENRICHMENT dont la citation porte une réaction ou une mesure d'institution (mairie, rectorat, préfecture…) : décision avec
 * boutons. VALIDATE consigne un événement institutionnel (annoncé ou réalisé) — jamais une transition judiciaire.
 * Sans fait institutionnel net : message d'information, comme avant.
 */
async function decisionInstitutionnelle(cle) {
  const p = await charger(cle);
  if (p.decision) throw new Error(`déjà décidée (${p.decision}) — rien envoyé`);
  const inst = p.rat === 'OK' ? detecterInstitutionnel(citationsDe(p)) : null;
  if (!inst) return info(cle);
  const [deja] = await sql`select 1 x from case_events where case_id = ${p.case_id} and libelle_public = ${inst.libelle_public} limit 1`;
  if (deja) throw new Error('mesure déjà consignée pour cette affaire : aucune nouvelle demande');
  const soeurs = await sql`
    select q.facts from state_proposals q
     where q.case_id = ${p.case_id} and q.proposal_id <> ${p.proposal_id} and q.decision is null and q.analysis_action = 'ENRICHMENT'
       and exists (select 1 from telegram_envois t where t.kind = 'decision' and t.cle = q.proposal_id::text)`;
  if (soeurs.some((q) => detecterInstitutionnel(citationsDe(q))?.libelle_public === inst.libelle_public)) throw new Error('même mesure déjà soumise à décision : une seule demande');
  return envoyer(
    `🔄 <b>MAINTENANCE</b> · 🏛 ${entete(p)}\n\nÉVÉNEMENT INSTITUTIONNEL\n(sans effet sur l’état judiciaire : ${esc(p.courant)})` +
      `\n<b>${esc(inst.libelle_public)}</b>\nMesure ${esc(inst.realisation)}.` +
      `\n\nPreuve :\n« ${esc(cut(inst.citation, 320))} »` +
      `\n\nSNY a besoin de ta validation.`,
    boutonsEtat(cle),
  );
}

// --- nouvelle affaire potentielle (NEW_CASE_DISCOVERY V0) ---------------
// Même mécanique que decision() : le clic n'écrit QUE la décision (CREATE → ACCEPT).
// La fiche est créée plus tard, par scripts/appliquer-nouvelles-affaires.mjs.
// Discovery : VALIDATE (nouvelle affaire) ou ATTACH (rapprochement) → ACCEPT ; CREATE = ancien nom de VALIDATE, accepté
// pour ne casser aucun bouton déjà envoyé. Un bouton positif n'est valable que pour ce que SON message proposait
// (telegram-clics.mjs : boutonValable) ; le CHOIX (ATTACH | CREATE) est enregistré dans `action`.

async function nouvelle(cle) {
  if (!/^[0-9a-f]{8}$/.test(cle || '')) throw new Error('clé attendue : 8 caractères hexadécimaux');
  const r = await sql`select proposal_id::text pid, payload, decision::text decision, recommendation
                        from new_case_proposals where proposal_id::text like ${cle + '%'}`;
  if (r.length !== 1) throw new Error(`clé ${cle} : ${r.length} proposition(s) trouvée(s)`);
  if (r[0].decision) throw new Error(`déjà décidée (${r[0].decision}) — rien envoyé`);
  const k = r[0].pid.slice(0, 8);
  // Fail closed : un message qui offre RAPPROCHER et CRÉER exige la colonne `action` (migration 019). Sans elle, le choix
  // de l'humain ne pourrait pas être enregistré fidèlement : on n'envoie pas.
  if (r[0].payload?.attach && !(await schemaBoucle(sql)).action) {
    throw new Error('migration 019 non appliquée : message comparatif (RAPPROCHER / CRÉER) non envoyé');
  }
  if (modeCreation(r[0].recommendation, r[0].payload || {}) === 'PENDING' && !(await schemaBoucle(sql)).pending) {
    throw new Error('migration 020 non appliquée : bouton « CRÉER (preuves à compléter) » indisponible, message non envoyé');
  }
  const mid = await envoyer(messageDecision(r[0].payload, r[0].recommendation), boutons(r[0].recommendation, k, r[0].payload));
  if (!process.env.SNY_DRY) await sql`insert into telegram_envois (kind, cle, message_id) values ('decision', ${r[0].pid}, ${mid}) on conflict do nothing`;
  return mid;
}

// notifierNouvelles : envoie, une seule fois, les propositions Discovery pas encore décidées. Aucun envoi s'il n'y en a pas.
async function notifierNouvelles(max = 5) {
  const rows = await sql`
    select left(p.proposal_id::text, 8) k from new_case_proposals p
     where p.decision is null and not exists (select 1 from telegram_envois t where t.cle = p.proposal_id::text)
     order by p.created_at`;
  let envoyes = 0;
  for (const r of rows) {
    if (envoyes >= max) break;
    try { await nouvelle(r.k); envoyes++; } catch (e) { console.log(`proposition ${r.k} non envoyée : ${e.message}`); }
  }
  console.log(`notifier-nouvelles : ${envoyes} envoyé(s), ${rows.length - envoyes} en attente (plafond ${max}/run)`);
}

/** Accusé de réception : ce qui est enregistré, ce qui vient ensuite, et ce qui ne se fait JAMAIS tout seul (publier). */
// « Décision exécutée » arrive dans un second message (appliquée / bloquée avec motif) ; la publication d'une NOUVELLE affaire reste
// soumise à ton GO. Par webhook l'application suit dans la minute ; par relève périodique, au prochain passage.
const SUITE = process.env.SNY_WEBHOOK === '1'
  ? '\nApplication en base en cours : tu recevras « Appliqué » ou « Non appliqué » avec le motif. Nouvelle affaire : publication jamais automatique.'
  : '\nÉtape suivante : application en base (au prochain passage). Nouvelle affaire : publication jamais automatique.';
const LIBELLE_ACTION = { VALIDATE: 'VALIDER', CREATE: 'CRÉER', ATTACH: 'RAPPROCHER', PENDING: 'CRÉER (preuves à compléter)', REVIEW: 'REVIEW (mis de côté, rien créé)', REJECT: 'REJETER' };

async function accuser(cb, texte) {
  // La décision est déjà en base : un accusé qui échoue (clic ancien traité en différé par le job périodique)
  // ne doit pas faire échouer le traitement.
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Décision enregistrée.' }).catch(() => {});
  await tg('sendMessage', { chat_id: ALLOWED, text: texte, parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
}

/** @returns {Promise<string>} issue : enregistree | double_clic | introuvable | bouton_invalide */
async function clicNouvelle(cb, d, cle) {
  const [pr] = await sql`select proposal_id::text pid, payload, recommendation, decision::text decision
                           from new_case_proposals where proposal_id::text like ${cle + '%'}`;
  if (!pr) {
    console.log(`clé inconnue sur ${cle} : aucune écriture`);
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Proposition introuvable.' }).catch(() => {});
    return 'introuvable';
  }
  const S = await schemaBoucle(sql);
  // Avant la migration 019, seuls les boutons « historiques » existent : ATTACH sur un rapprochement, VALIDATE sur le reste.
  const valable = d === 'PENDING' && !S.pending ? false : S.action ? boutonValable(d, pr.payload) : (NC_VERS_DB[d] !== 'ACCEPT' || (pr.recommendation === 'ATTACH_EXISTING') === (d === 'ATTACH'));
  if (!valable) {
    console.log(`bouton non valable pour ce message sur ${cle} : aucune écriture`);
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Action non valable pour ce message.' }).catch(() => {});
    return 'bouton_invalide';
  }
  const action = ACTION_NC[d];
  const cible = action === 'ATTACH' ? pr.payload?.attach?.case_id ?? null : null;
  const maj = S.action
    ? await sql`
        update new_case_proposals
           set decision = ${NC_VERS_DB[d]}::proposal_decision, decided_by = 'Adrien (Telegram)',
               decided_at = now(), decision_comment = ${'Bouton Telegram : ' + d}, action = ${action},
               attach_case_id = coalesce(${cible}, attach_case_id)
         where proposal_id = ${pr.pid}::uuid and decision is null
        returning decision::text`
    : await sql`
        update new_case_proposals
           set decision = ${NC_VERS_DB[d]}::proposal_decision, decided_by = 'Adrien (Telegram)',
               decided_at = now(), decision_comment = ${'Bouton Telegram : ' + d}
         where proposal_id = ${pr.pid}::uuid and decision is null
        returning decision::text`;
  if (maj.length) {
    console.log(`nouvelle affaire : décision ${d} → ${NC_VERS_DB[d]} enregistrée sur ${cle}`);
    const quoi = pr.payload?.etablissement ? `${esc(pr.payload.etablissement)} — ${esc(pr.payload.commune)}` : esc(pr.payload?.commune || cle);
    await accuser(cb, `✅ <b>Décision enregistrée : ${LIBELLE_ACTION[d]}</b>\n${quoi} (${cle})` + (NC_VERS_DB[d] === 'ACCEPT' ? SUITE : '\nAucune écriture sur les fiches.'));
    return 'enregistree';
  }
  const [cur] = await sql`select decision::text d from new_case_proposals where proposal_id = ${pr.pid}::uuid`;
  console.log(`double clic sur ${cle} : déjà ${cur?.d}, aucune écriture`);
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Déjà enregistrée (${cur?.d}).` }).catch(() => {});
  return 'double_clic';
}

/** Test contrôlé : prouve que Telegram → SNY fonctionne, sans toucher à aucune donnée éditoriale. */
async function testClic() {
  const nonce = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (process.env.SNY_DRY) { console.log('[à blanc] test ' + nonce); return; }
  const m = await tg('sendMessage', {
    chat_id: ALLOWED, parse_mode: 'HTML',
    text: '🧪 <b>SNY — test de réception</b>\nAppuie sur le bouton ci-dessous. Cela ne modifie aucune affaire : il sert uniquement à vérifier que ton clic arrive jusqu’à SNY.',
    reply_markup: { inline_keyboard: [[{ text: '🧪 Je clique', callback_data: `sny:TEST:${nonce}` }]] },
  });
  await journaliser(sql, { kind: 'test_envoye', cle: nonce, resultat: 'ok', details: { message_id: m.message_id } });
  console.log(`test envoyé (réf. ${nonce}). Clique, puis : node scripts/telegram-v0.mjs recevoir  →  node scripts/telegram-v0.mjs diagnostic`);
}

/** @returns {Promise<string>} issue (journalisée par l'appelant) */
async function clic(cb, update_id = null) {
  // Contrôle utilisateur ET chat : tout autre émetteur est ignoré en silence.
  if (cb.from?.id !== ALLOWED || cb.message?.chat?.id !== ALLOWED) {
    console.log('clic ignoré : émetteur non autorisé');
    await journaliser(sql, { kind: 'clic_ignore', update_id, resultat: 'émetteur non autorisé' });
    return 'ignore';
  }
  const t = decoderCallback(cb.data);
  if (!t) { await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Action inconnue.' }).catch(() => {}); await journaliser(sql, { kind: 'clic', update_id, resultat: 'action_inconnue' }); return 'action_inconnue'; }
  if (t.type === 'TEST') {
    await journaliser(sql, { kind: 'test_recu', update_id, cle: t.cle, resultat: 'ok' });
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Test reçu.' }).catch(() => {});
    await tg('sendMessage', { chat_id: ALLOWED, text: `🧪 Test reçu (réf. ${t.cle}) : ton clic est bien arrivé jusqu’à SNY. Aucune donnée éditoriale modifiée.` }).catch(() => {});
    console.log(`test reçu (réf. ${t.cle})`);
    return 'test_recu';
  }
  let issue;
  if (t.type === 'NC') issue = await clicNouvelle(cb, t.action, t.cle);
  else issue = await clicEtat(cb, t.action, t.cle);
  await journaliser(sql, { kind: 'clic', update_id, cle: t.cle, action: t.action, resultat: issue });
  return issue;
}

/** Clic Maintenance (state_proposals). */
async function clicEtat(cb, d, cle) {
  const p = await charger(cle).catch(() => null);
  if (!p) { await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Proposition introuvable.' }).catch(() => {}); return 'introuvable'; }
  // Idempotence : la clause « decision is null » rend le second clic sans effet.
  const maj = await sql`
    update state_proposals
       set decision = ${VERS_DB[d]}::proposal_decision, decided_by = 'Adrien (Telegram)',
           decided_at = now(), decision_comment = ${'Bouton Telegram : ' + d}
     where proposal_id = ${p.proposal_id} and decision is null
    returning decision::text`;
  if (maj.length) {
    console.log(`décision ${d} → ${VERS_DB[d]} enregistrée sur ${cle}`);
    const quoi = p.analysis_action === 'STATE_CHANGE' && p.apres ? `${p.avant} → ${p.apres}` : 'événement institutionnel (état judiciaire inchangé)';
    await accuser(cb, `✅ <b>Décision enregistrée : ${LIBELLE_ACTION[d]}</b>\n${esc(p.etablissement)} — ${esc(p.commune)} : ${esc(quoi)} (${cle})` + (VERS_DB[d] === 'ACCEPT' ? SUITE : '\nAucune écriture sur la fiche.'));
    return 'enregistree';
  }
  const [cur] = await sql`select decision::text d from state_proposals where proposal_id = ${p.proposal_id}`;
  console.log(`double clic sur ${cle} : déjà ${cur.d}, aucune écriture`);
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Déjà enregistrée (${cur.d}).` }).catch(() => {});
  return 'double_clic';
}

// --- mode autonome (GitHub Actions) ------------------------------------
// notifier : envoie, une seule fois par proposition, la matière traitée par la maintenance.
//   STATE_CHANGE établi par une citation → décision (boutons) ; le reste → information.
//   Ne sont pas envoyés : NO_CHANGE, propositions sans aucune citation, propositions périmées.
async function notifier(max = 10) {
  const rows = await sql`
    select left(p.proposal_id::text, 8) k, p.proposal_id::text pid, p.analysis_action aa,
           p.statut_propose::text ap, p.facts
      from state_proposals p
     where p.decision is null
       and not exists (select 1 from telegram_envois t where t.cle = p.proposal_id::text)
     order by p.created_at desc`;
  let envoyes = 0, ecartes = 0, bruit = 0;
  for (const r of rows) {
    if (envoyes >= max) break;
    const utile = r.aa !== 'NO_CHANGE' && Array.isArray(r.facts) && r.facts.some((f) => f?.evidence?.length);
    if (!utile) { bruit++; continue; } // déchet technique : jamais envoyé, réexaminé au prochain cycle sans coût
    let mid;
    try {
      mid = r.aa === 'STATE_CHANGE' && r.ap ? await decision(r.k)
        : r.aa === 'ENRICHMENT' ? await decisionInstitutionnelle(r.k) // décision si une mesure d'institution est établie, sinon information
        : await info(r.k);
    } catch (e) {
      // périmée / ambiguë : on le note pour ne plus la reconsidérer, sans message
      console.log(`écartée ${r.k} : ${e.message}`);
      await sql`insert into telegram_envois (kind, cle) values ('info', ${r.pid}) on conflict do nothing`;
      ecartes++;
      continue;
    }
    if (process.env.SNY_DRY) { envoyes++; continue; } // à blanc : rien n'est mémorisé
    // decision() retombe sur info() sans bouton si la preuve ne suffit pas : on note ce qui a VRAIMENT été envoyé.
    await sql`insert into telegram_envois (kind, cle, message_id)
              values (${dernierAvecBoutons ? 'decision' : 'info'}, ${r.pid}, ${mid}) on conflict do nothing`;
    envoyes++;
  }
  console.log(`notifier : ${envoyes} envoyé(s), ${ecartes} écarté(s), ${bruit} sans matière utile, ${rows.length - envoyes - ecartes - bruit} en attente (plafond ${max}/cycle)`);
}


async function poll(secondes = 600) {
  const fin = Date.now() + secondes * 1000;
  let offset = 0;
  console.log(`écoute des clics pendant ${secondes} s…`);
  while (Date.now() < fin) {
    const ups = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['callback_query'] });
    for (const u of ups) {
      offset = u.update_id + 1;
      if (u.callback_query) await clic(u.callback_query, u.update_id).catch((e) => console.error(e.message));
    }
  }
}

// recevoir : traite UNE fois les clics en attente chez Telegram (sans long polling, sans poste allumé).
// Telegram conserve les clics non confirmés ; on les confirme (offset) APRÈS traitement réussi.
// Rejeu sans danger : la décision est gardée par « decision is null ».
//
// DEUX CORRECTIONS par rapport à la version précédente :
//   1. un clic dont le traitement ÉCHOUE n'est plus confirmé (il était perdu en silence : erreur capturée puis offset avancé).
//      Il est rejoué au passage suivant, au plus ESSAIS_MAX fois (journalisé), puis abandonné pour ne pas bloquer la file ;
//   2. chaque passage laisse une ligne de journal (nb reçus, nb en attente chez Telegram, bot) : « 0 clic » devient
//      explicable (rien reçu ? webhook actif ? autre bot ?). Logs publics : compteurs seulement.
async function recevoir() {
  let pending = null, bot = null, webhook = false;
  try { const w = await tg('getWebhookInfo'); pending = w.pending_update_count ?? null; webhook = !!w.url; } catch { /* diagnostic seulement */ }
  try { bot = (await tg('getMe')).username ?? null; } catch { /* idem */ }
  if (webhook) {
    // EXCLUSIVITÉ Telegram : avec un webhook, getUpdates échoue (409) et deux consommateurs se voleraient les clics. Les clics
    // arrivent alors par le webhook (sny-telegram.yml → `traiter`) : ce passage ne lit rien, il le dit et laisse une trace.
    console.log('webhook actif : les clics arrivent par le webhook (aucune lecture getUpdates) · ' + (pending ?? '?') + ' en attente chez Telegram');
    await journaliser(sql, { kind: 'passage', resultat: 'webhook_actif', details: { pending_avant: pending, bot, webhook: true } });
    return;
  }

  const ups = await tg('getUpdates', { timeout: 0, allowed_updates: ['callback_query'] });
  const traites = [];
  let n = 0;
  for (const u of ups) {
    if (!u.callback_query) { traites.push({ update_id: u.update_id, ok: true, essais: 0, age_h: 0 }); continue; }
    n++;
    const essais = await essaisDe(sql, u.update_id);
    try {
      await clic(u.callback_query, u.update_id);
      traites.push({ update_id: u.update_id, ok: true, essais, age_h: 0 });
    } catch (e) {
      console.error(`clic non traité (${essais + 1 < ESSAIS_MAX ? 'sera rejoué' : 'abandonné : essais épuisés ou journal absent'}) : ` + String(e.message).slice(0, 120));
      await journaliser(sql, { kind: 'clic_echec', update_id: u.update_id, resultat: String(e.message).slice(0, 160) });
      traites.push({ update_id: u.update_id, ok: false, essais: essais + 1, age_h: 0 });
    }
  }
  const dernier = dernierAConfirmer(traites);
  if (dernier != null) await tg('getUpdates', { offset: dernier + 1, timeout: 0, limit: 1 });
  const rejoues = traites.filter((t) => dernier == null || t.update_id > dernier).length; // non confirmés : Telegram les redonnera
  await journaliser(sql, { kind: 'passage', resultat: `recus=${ups.length} clics=${n}`, details: { pending_avant: pending, bot, webhook, recus: ups.length, clics: n, confirme_jusqua: dernier, a_rejouer: rejoues } });
  console.log(`recevoir : ${n} clic(s) traité(s)` + (pending != null ? ` · ${pending} en attente chez Telegram avant lecture` : '') + (rejoues ? ` · ${rejoues} à rejouer` : ''));
}

/**
 * Un clic reçu PAR WEBHOOK (Cloudflare Worker → repository_dispatch → sny-telegram.yml). La mise à jour arrive dans
 * UPDATE_JSON ; l'authenticité est déjà contrôlée par le Worker (secret_token de Telegram) ET re-contrôlée ici (clic() ne
 * traite que l'éditeur, dans SON chat). IDEMPOTENT : une mise à jour déjà journalisée n'est jamais rejouée (Telegram ré-essaie
 * un webhook qui n'a pas répondu 200) ; la clause « decision is null » garde en plus le second clic sur la même décision.
 */
async function traiter() {
  let u;
  try { u = JSON.parse(process.env.UPDATE_JSON || ''); } catch { throw new Error('UPDATE_JSON absent ou illisible'); }
  const cb = u?.callback_query;
  if (!Number.isInteger(u?.update_id) || !cb || typeof cb.data !== 'string' || cb.data.length > 64) throw new Error('mise à jour invalide : rien traité');
  const S = await schemaBoucle(sql);
  if (S.journal) {
    const [deja] = await sql`select 1 x from telegram_journal where kind in ('clic', 'clic_ignore', 'test_recu') and update_id = ${u.update_id} limit 1`;
    if (deja) { console.log('mise à jour déjà traitée : aucune action'); return; }
  }
  // DURABLE : le webhook a déjà répondu 200 à Telegram, qui ne rejouera PLUS ce clic. Une panne passagère de Neon ne doit donc pas le
  // perdre : trois tentatives (clic() est idempotent) ; si tout échoue, l'éditeur est PRÉVENU (jamais de perte silencieuse) et le job
  // est rouge. Le callback complet reste lisible dans l'entrée du run GitHub (inputs.update) pour un rejeu ou un diagnostic.
  let derniere;
  for (const attenteMs of [0, 3000, 10000]) {
    if (attenteMs) await new Promise((r) => setTimeout(r, attenteMs));
    try {
      const issue = await clic(cb, u.update_id);
      console.log(`traiter : issue ${issue}`);
      return;
    } catch (e) { derniere = e; console.error('traiter : tentative échouée : ' + String(e.message).slice(0, 120)); }
  }
  await tg('sendMessage', { chat_id: ALLOWED, text: `⚠️ Ton clic (${cb.data.replace(/^sny:/, '')}) a été reçu mais NON enregistré (base indisponible). Re-clique sur le bouton, ou dis-le-moi : le détail est dans le run GitHub.` }).catch(() => {});
  throw derniere;
}

/** Diagnostic en lecture seule : où en est la chaîne Telegram → SNY ? (aucun secret, aucun contenu éditorial) */
async function diagnostic() {
  const me = await tg('getMe');
  const w = await tg('getWebhookInfo');
  console.log(`bot : @${me.username}`);
  console.log(`webhook : ${w.url ? 'ACTIF (getUpdates ne reçoit rien)' : 'aucun'} · en attente chez Telegram : ${w.pending_update_count} · dernière erreur : ${w.last_error_message || 'aucune'}`);
  const S = await schemaBoucle(sql);
  if (!S.journal) { console.log('journal : migration 019 non appliquée (pas de trace des passages)'); }
  else {
    const l = await sql`select to_char(at at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') t, kind, coalesce(action, '') a, coalesce(cle, '') c, coalesce(resultat, '') r,
                               details->>'bot' bot, details->>'pending_avant' pend from telegram_journal order by id desc limit 12`;
    console.log('journal (12 dernières lignes) :');
    for (const x of l) console.log(`  ${x.t}  ${x.kind.padEnd(11)} ${x.a.padEnd(9)} ${x.c.padEnd(9)} ${x.r}${x.kind === 'passage' ? `  [bot @${x.bot ?? '?'}, en attente avant : ${x.pend ?? '?'}]` : ''}`);
  }
  const [a] = await sql`select count(*)::int n from state_proposals where decision is null and exists (select 1 from telegram_envois t where t.kind = 'decision' and t.cle = state_proposals.proposal_id::text)`;
  const [b] = await sql`select count(*)::int n from new_case_proposals where decision is null and exists (select 1 from telegram_envois t where t.kind = 'decision' and t.cle = new_case_proposals.proposal_id::text)`;
  console.log(`décisions envoyées et sans réponse : ${a.n} maintenance · ${b.n} discovery`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'info') await info(arg);
  else if (cmd === 'decision') await decision(arg);
  else if (cmd === 'nouvelle') await nouvelle(arg);
  else if (cmd === 'poll') await poll(Number(arg) || 600);
  else if (cmd === 'notifier') await notifier(Number(arg) || 10);
  else if (cmd === 'notifier-nouvelles') await notifierNouvelles(Number(arg) || 5);
  else if (cmd === 'recevoir') await recevoir();
  else if (cmd === 'traiter') await traiter();
  else if (cmd === 'test-clic') await testClic();
  else if (cmd === 'diagnostic') await diagnostic();
  else console.error('usage : info <cle> | decision <cle> | nouvelle <cle> | poll [s] | notifier [max] | notifier-nouvelles [max] | recevoir | test-clic | diagnostic');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
process.exit(0);
