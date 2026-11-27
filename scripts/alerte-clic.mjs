// Étape « Alerter » de sny-telegram : lit les `outcome` des étapes (env OUTCOME_<clé>) et prévient l'éditeur avec la bonne classification.
// Contexte (best-effort, jamais une condition) : les clics enregistrés pendant ce run (objet = fiche / proposition), les contrôles QA en échec et les écarts du site servi
// (journaux des étapes, fichiers QA_LOG / CONTROLE_LOG). Aucune donnée personnelle : identifiants d'affaire et empreintes seulement.
import { readFileSync } from 'node:fs';
import { classerEchecClic } from './lib/alerte-clic.mjs';
import { createHash } from 'node:crypto';
import { prevenir } from './lib/prevenir.mjs';

const cles = ['enregistrer', 'simples', 'discovery', 'projection', 'qa', 'publier', 'verifier', 'reconcile', 'controle'];
const outcomes = Object.fromEntries(cles.map((k) => [k, process.env['OUTCOME_' + k]]));

const lignes = (f) => { try { return readFileSync(f, 'utf8').split(/\r?\n/); } catch { return []; } };
const nettoie = (s) => s.replace(/\u001b\[[0-9;]*m/g, '').replace(/^\s*(?:[❌✗·]\s*)+/u, '').trim();
const ctx = { objets: [], controles: [], ecartsSite: [], enregistreA: null };

if (process.env.QA_LOG) ctx.controles = lignes(process.env.QA_LOG).filter((l) => /❌|✗/u.test(l)).map(nettoie).slice(0, 3);
if (process.env.CONTROLE_LOG) { ctx.ecartsSiteTous = lignes(process.env.CONTROLE_LOG).filter((l) => /FICHE_PENDING_DEPLOYMENT\s{2,}|^· fiche \S+\s+HTTP|MISMATCH|NOT_SERVED/.test(l)).map(nettoie); ctx.ecartsSite = ctx.ecartsSiteTous.slice(0, 3); }

try {
  if (process.env.NEON_DATABASE_URL) {
    const { connecter } = await import('./lib/neon.mjs');
    const { sql } = connecter();
    // L'objet de l'alerte est ce que le clic de CE run a décidé (update_id du déclencheur) — jamais les derniers clics de la demi-heure (clics d'autres runs, REJECT / REVIEW sans publication) : audit du 26/11/2026.
    let updateId = null;
    try { updateId = JSON.parse(process.env.UPDATE_JSON || '{}').update_id ?? null; } catch { /* entrée illisible : aucun objet nommé */ }
    const clics = Number.isInteger(updateId) ? await sql`select cle, action, at from telegram_journal where kind = 'clic' and update_id = ${updateId} limit 1` : [];
    for (const c of clics) {
      const [p] = await sql`select payload, decision::text decision from new_case_proposals where proposal_id::text like ${c.cle + '%'} limit 1`;
      let o = null;
      if (p?.payload?.page) o = { id: p.payload.page.case_id, caseId: p.payload.page.case_id, nature: p.payload.page.mise_a_jour ? 'approbation de la mise à jour de la page' : 'approbation de la page', cle: c.cle, decision: p.decision };
      else if (p?.payload?.hub_publication) o = { id: `Hub ${p.payload.hub_publication.titre}`, nature: 'publication du Hub', cle: c.cle, decision: p.decision };
      else if (p?.payload) o = { id: p.payload.etablissement ? `${p.payload.etablissement} (${p.payload.commune})` : String(p.payload.commune || c.cle), nature: 'proposition', cle: c.cle, decision: p.decision };
      else { const [s] = await sql`select case_id, decision::text decision from state_proposals where proposal_id::text like ${c.cle + '%'} limit 1`; if (s) o = { id: s.case_id, caseId: s.case_id, nature: 'proposition d’état', cle: c.cle, decision: s.decision }; }
      if (o) ctx.objets.push(o);
    }
    if (clics[0]) ctx.enregistreA = `enregistrée à ${new Date(clics[0].at).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`;
  }
} catch { /* le contexte est une aide : sans lui, l'alerte garde sa classification */ }

const { texte } = classerEchecClic(outcomes, ctx);
// Un MÊME échec (mêmes étapes en échec, mêmes contrôles QA, mêmes écarts du site) n'est dit qu'une fois par fenêtre de 6 h : les passages suivants échouent de la même façon sans nouveau message
// (27/11 : quatre messages quasi identiques pour une seule cause). Une cause différente, ou la même après la fenêtre, est dite.
const signature = createHash('sha256').update(JSON.stringify({ o: outcomes, c: ctx.controles, e: ctx.ecartsSiteTous ?? ctx.ecartsSite })).digest('hex').slice(0, 16);
let sqlAlerte = null, doublon = false;
try {
  if (process.env.NEON_DATABASE_URL) {
    const { connecter } = await import('./lib/neon.mjs'); sqlAlerte = connecter().sql;
    doublon = (await sqlAlerte`select 1 from telegram_journal where kind = 'alerte' and cle = ${'alerte:' + signature} and at > now() - interval '6 hours' limit 1`).length > 0;
  }
} catch { /* sans journal : on prévient (jamais de silence par défaut) */ }
if (doublon) console.log('même échec déjà signalé dans les 6 dernières heures : aucun nouveau message');
else if (await prevenir(texte) && sqlAlerte) { try { const { journaliser } = await import('./lib/telegram-clics.mjs'); await journaliser(sqlAlerte, { kind: 'alerte', cle: 'alerte:' + signature, resultat: 'envoyee' }); } catch { /* journal absent : tant pis */ } }
