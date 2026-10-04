#!/usr/bin/env node
// =====================================================================
// scripts/telegram-v0.mjs — SNY Telegram V0
//
//   node scripts/telegram-v0.mjs info <cle>       message INFORMATION, sans bouton
//   node scripts/telegram-v0.mjs decision <cle>  message DECISION, 3 boutons
//   node scripts/telegram-v0.mjs poll [secondes]  reçoit les clics (long polling)
//
// <cle> = préfixe hexadécimal de proposal_id (8 caractères).
// Secrets lus dans .env.local : TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID.
// Le token n'est jamais affiché ni journalisé (il fait partie de l'URL de l'API :
// aucune erreur réseau n'est donc relayée telle quelle).
// VALIDATE n'écrit que state_proposals.decision. Aucune publication, ici ni ailleurs.
// =====================================================================
import { connecter } from './lib/neon.mjs';

const { sql } = connecter(); // charge aussi .env.local dans process.env
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED = Number(process.env.TELEGRAM_ALLOWED_USER_ID);
if (!TOKEN || !Number.isInteger(ALLOWED)) {
  console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_ALLOWED_USER_ID manquants dans .env.local');
  process.exit(1);
}

const VERS_DB = { VALIDATE: 'ACCEPT', REVIEW: 'REVIEW_REQUIRED', REJECT: 'REJECT' };

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
           c.statut_judiciaire::text courant,
           p.analysis_action, p.facts, p.decision::text decision,
           c.etablissement, c.commune, a.media, a.publication_date, a.url
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
  return envoyer(`📰 <b>SNY</b> · ${entete(p)}\n\n${corps}` + (q ? `\n\n« ${esc(q)} »` : ''));
}

async function decision(cle) {
  const p = await charger(cle);
  if (p.decision) throw new Error(`déjà décidée (${p.decision}) — rien envoyé`);
  if (p.avant !== p.courant) throw new Error(`proposition périmée (fiche : ${p.courant}, proposition partie de : ${p.avant}) — rien envoyé`);
  const q = preuveDe(p);
  if (!q) {
    // Preuve insuffisante pour un changement d'état : l'article reste dans le flux, sans bouton.
    console.log('preuve ne suffisant pas à établir ' + p.apres + ' → message INFORMATION, pas de bouton');
    return info(cle);
  }
  const k = cle;
  return envoyer(
    `⚖️ <b>SNY</b> · ${entete(p)}\n\nNOUVELLE ÉVOLUTION\n${esc(p.avant)} → <b>${esc(p.apres)}</b>` +
      `\n\nPreuve :\n« ${esc(q)} »` +
      `\n\nSNY a besoin de ta validation.`,
    {
      inline_keyboard: [[
        { text: '✅ VALIDATE', callback_data: `sny:VALIDATE:${k}` },
        { text: '🟡 REVIEW', callback_data: `sny:REVIEW:${k}` },
        { text: '⛔ REJECT', callback_data: `sny:REJECT:${k}` },
      ]],
    },
  );
}

async function clic(cb) {
  // Contrôle utilisateur ET chat : tout autre émetteur est ignoré en silence.
  if (cb.from?.id !== ALLOWED || cb.message?.chat?.id !== ALLOWED) {
    console.log('clic ignoré : émetteur non autorisé');
    return;
  }
  const m = /^sny:(VALIDATE|REVIEW|REJECT):([0-9a-f]{8})$/.exec(cb.data || '');
  if (!m) { await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Action inconnue.' }); return; }
  const [, d, cle] = m;
  const p = await charger(cle).catch(() => null);
  if (!p) { await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Proposition introuvable.' }); return; }
  // Idempotence : la clause « decision is null » rend le second clic sans effet.
  const maj = await sql`
    update state_proposals
       set decision = ${VERS_DB[d]}::proposal_decision, decided_by = 'Adrien (Telegram)',
           decided_at = now(), decision_comment = ${'Bouton Telegram : ' + d}
     where proposal_id = ${p.proposal_id} and decision is null
    returning decision::text`;
  if (maj.length) {
    console.log(`décision ${d} → ${VERS_DB[d]} enregistrée sur ${cle}`);
    // La décision est déjà en base : un accusé qui échoue (clic ancien traité en différé
    // par le job périodique) ne doit pas faire échouer le traitement.
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Décision enregistrée.' }).catch(() => {});
    await tg('sendMessage', { chat_id: ALLOWED, text: `Décision enregistrée : ${d} (${cle}).` }).catch(() => {});
  } else {
    const [cur] = await sql`select decision::text d from state_proposals where proposal_id = ${p.proposal_id}`;
    console.log(`double clic sur ${cle} : déjà ${cur.d}, aucune écriture`);
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Déjà enregistrée (${cur.d}).` }).catch(() => {});
  }
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
      mid = r.aa === 'STATE_CHANGE' && r.ap ? await decision(r.k) : await info(r.k);
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
      if (u.callback_query) await clic(u.callback_query).catch((e) => console.error(e.message));
    }
  }
}

// recevoir : traite UNE fois les clics en attente chez Telegram (sans long polling, sans poste allumé).
// Telegram conserve les clics non confirmés ; on les confirme (offset) après traitement.
// Rejeu sans danger : la décision est gardée par « decision is null ».
async function recevoir() {
  const ups = await tg('getUpdates', { timeout: 0, allowed_updates: ['callback_query'] });
  let n = 0;
  for (const u of ups) {
    if (u.callback_query) { await clic(u.callback_query).catch((e) => console.error('clic non traité : ' + e.message)); n++; }
  }
  if (ups.length) await tg('getUpdates', { offset: ups[ups.length - 1].update_id + 1, timeout: 0, limit: 1 });
  console.log(`recevoir : ${n} clic(s) traité(s)`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'info') await info(arg);
  else if (cmd === 'decision') await decision(arg);
  else if (cmd === 'poll') await poll(Number(arg) || 600);
  else if (cmd === 'notifier') await notifier(Number(arg) || 10);
  else if (cmd === 'recevoir') await recevoir();
  else console.error('usage : info <cle> | decision <cle> | poll [s] | notifier [max] | recevoir');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
process.exit(0);
