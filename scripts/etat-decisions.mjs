#!/usr/bin/env node
// =====================================================================
// scripts/etat-decisions.mjs — où en est CHAQUE décision, de Telegram jusqu'au site ? (LECTURE SEULE)
//
//   node scripts/etat-decisions.mjs                    # décisions envoyées depuis 14 jours + toutes celles en attente
//   node scripts/etat-decisions.mjs --depuis 2026-10-01 [--json]
//
// Quatre états, jamais confondus :
//   EN ATTENTE   demande envoyée sur Telegram, aucun clic enregistré
//   ENREGISTRÉE  le clic est en base (decision), l'application n'a pas encore tourné — ou elle est BLOQUÉE (raison dite)
//   APPLIQUÉE    ce que la décision commande est écrit en base (événement / sources / fiche) — ou CONSIGNÉE (rien à écrire)
//   PUBLICATION  non publiée (candidate : GO requis) · publiée en base mais NON projetée · projetée dans data/cases.json
//
// Aucune écriture, aucun message, aucun réseau hors Neon. Les raisons de blocage viennent du MÊME contrat que l'applicateur.
// =====================================================================
import { readFileSync, existsSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { classer } from './lib/appliquer-contrat.mjs';
import { niveauGeo } from './lib/rapprochement-garde.mjs';
import { evenementDejaValide } from './lib/routage-veille.mjs';
import { detecterInstitutionnel } from './lib/evenement-institutionnel.mjs';

const A = process.argv.slice(2);
const JSONOUT = A.includes('--json');
const depuis = A.includes('--depuis') ? A[A.indexOf('--depuis') + 1] : new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
const { sql } = connecter();

const holds = new Set(JSON.parse(readFileSync(new URL('../data/publication-holds.json', import.meta.url), 'utf8')).holds.map((h) => h.case_id));
const casesJson = new URL('../data/cases.json', import.meta.url);
const projetees = new Set(existsSync(casesJson) ? (JSON.parse(readFileSync(casesJson, 'utf8')).cases || JSON.parse(readFileSync(casesJson, 'utf8'))).map((c) => c.case_id || c.id) : []);

/** Où en est la fiche côté publication ? */
const publication = async (case_id) => {
  if (!case_id) return '—';
  const [c] = await sql`select publication_status::text ps from cases where case_id = ${case_id}`;
  if (!c) return '—';
  if (c.ps === 'publiée') return projetees.has(case_id) ? 'publiée et projetée (vérifier le déploiement du site)' : 'publiée en base, NON projetée dans data/cases.json (à projeter puis déployer)';
  if (c.ps === 'candidate') return 'candidate, non publiée (GO explicite requis)';
  return c.ps;
};

const lignes = [];

// --- Maintenance (state_proposals) -----------------------------------------
const sp = await sql`
  select p.proposal_id, left(p.proposal_id::text, 8) k, p.case_id, p.analysis_action aa, p.statut_avant::text av, p.statut_propose::text ap,
         p.event_date::text ed, p.article_id, p.facts, p.applied_event_id, p.decision::text decision, p.decided_at,
         p.payload->>'rattachement' rat, c.statut_judiciaire::text courant, c.etablissement,
         (select a.publication_date::text from articles a where a.article_id = p.article_id) pd,
         t.sent_at envoye
    from state_proposals p
    join cases c using (case_id)
    join telegram_envois t on t.kind = 'decision' and t.cle = p.proposal_id::text
   where t.sent_at >= ${depuis}::date or p.decision is null
   order by t.sent_at`;
for (const p of sp) {
  const l = { cle: p.k, type: 'maintenance', affaire: p.case_id, objet: p.ap ? `${p.av} → ${p.ap}` : 'événement institutionnel', choix: p.decision || '—' };
  if (!p.decision) { l.etat = 'EN ATTENTE'; l.detail = 'demande envoyée, aucun clic enregistré'; }
  else if (p.decision === 'REVIEW_REQUIRED') { l.etat = 'HOLD'; l.detail = 'mis de côté : aucune écriture, intervention humaine ultérieure'; }
  else if (p.decision !== 'ACCEPT') { l.etat = 'APPLIQUÉE (consignée)'; l.detail = `${p.decision} : aucune écriture attendue sur la fiche`; }
  else if (p.applied_event_id) { l.etat = 'APPLIQUÉE'; l.detail = 'événement écrit / rattaché'; }
  else {
    const evs = await sql`select event_id, case_id, event_type::text event_type, event_date::text event_date, statut_apres::text statut_apres from case_events where case_id = ${p.case_id}`;
    const inst = p.aa === 'ENRICHMENT' && p.rat === 'OK' ? detecterInstitutionnel((p.facts || []).flatMap((x) => x?.evidence || [])) : null;
    const deja = p.aa === 'STATE_CHANGE' && p.ap ? evenementDejaValide(evs, p.case_id, p.ap, p.ed, p.pd) : null;
    if (inst) { l.etat = 'ENREGISTRÉE'; l.detail = 'application automatique au prochain passage (événement institutionnel)'; }
    else if (deja) { l.etat = 'ENREGISTRÉE'; l.detail = 'application automatique au prochain passage (fait déjà consigné : preuve rattachée)'; }
    else {
      const non = classer({ aa: p.aa, av: p.av, ap: p.ap, ed: p.ed, article_id: p.article_id, facts: p.facts, applied_event_id: p.applied_event_id, courant: p.courant, case_id: p.case_id }, holds).raisons;
      l.etat = non.length ? 'BLOQUÉE' : 'ENREGISTRÉE';
      l.detail = non.length ? non.join(' ; ') : 'application automatique au prochain passage';
    }
  }
  l.publication = await publication(p.case_id);
  lignes.push(l);
}

// --- Discovery (new_case_proposals) ----------------------------------------
const nc = await sql`
  select left(n.proposal_id::text, 8) k, n.recommendation, n.attach_case_id, n.decision::text decision, n.payload, n.created_case_id, n.applied_at, t.sent_at envoye
    from new_case_proposals n
    join telegram_envois t on t.kind = 'decision' and t.cle = n.proposal_id::text
   where t.sent_at >= ${depuis}::date or n.decision is null
   order by t.sent_at`;
const aAction = (await sql`select 1 x from information_schema.columns where table_name = 'new_case_proposals' and column_name = 'action'`).length > 0;
const actions = aAction ? new Map((await sql`select left(proposal_id::text, 8) k, action from new_case_proposals`).map((r) => [r.k, r.action])) : new Map();
for (const n of nc) {
  const p = n.payload;
  const action = n.decision === 'ACCEPT' ? (actions.get(n.k) ?? (n.recommendation === 'ATTACH_EXISTING' ? 'ATTACH' : 'CREATE')) : null;
  const l = { cle: n.k, type: 'discovery', affaire: n.created_case_id || n.attach_case_id || `${p.commune}`, objet: p.attach ? 'rapprochement / création' : 'nouvelle affaire', choix: n.decision ? `${n.decision}${action ? ' · ' + action : ''}` : '—' };
  if (!n.decision) { l.etat = 'EN ATTENTE'; l.detail = 'demande envoyée, aucun clic enregistré'; }
  else if (n.decision === 'REVIEW_REQUIRED') { l.etat = 'HOLD'; l.detail = 'mis de côté : ni création ni rattachement, intervention humaine ultérieure'; }
  else if (n.applied_at) { l.etat = 'APPLIQUÉE'; l.detail = n.created_case_id ? `fiche ${n.created_case_id} créée${action === 'CREATE_PENDING' ? ' EN ATTENTE DE PREUVES (non publiable)' : ''}` : action === 'ATTACH' ? 'sources rattachées' : 'décision consignée (aucune écriture de fiche)'; }
  else if (action === 'ATTACH') {
    const [kc] = await sql`select commune, departement from cases where case_id = ${n.attach_case_id || p.attach?.case_id}`;
    const geo = kc ? niveauGeo({ commune: p.commune, departement: p.fiche?.departement }, { commune: kc.commune, departement: kc.departement }) : { niveau: 'bloquant', raison: 'affaire cible introuvable' };
    if (geo.niveau === 'bloquant') { l.etat = 'BLOQUÉE'; l.detail = `contradiction géographique : ${geo.raison} — l'applicateur refusera d'écrire`; }
    else { l.etat = 'ENREGISTRÉE'; l.detail = 'application automatique au prochain passage'; }
  } else { l.etat = 'ENREGISTRÉE'; l.detail = 'application automatique au prochain passage'; }
  l.publication = await publication(n.created_case_id || (action === 'ATTACH' ? n.attach_case_id : null));
  lignes.push(l);
}

if (JSONOUT) { console.log(JSON.stringify(lignes, null, 1)); process.exit(0); }
console.log(`\nDécisions envoyées depuis le ${depuis} (et toutes celles en attente) — ${lignes.length}\n`);
for (const l of lignes) {
  console.log(`${l.cle}  ${l.type.padEnd(11)} ${String(l.affaire).padEnd(14)} ${l.objet}`);
  console.log(`          choix : ${l.choix}  →  ${l.etat}${l.detail ? ' — ' + l.detail : ''}`);
  console.log(`          publication : ${l.publication}`);
}
const n = (e) => lignes.filter((l) => l.etat.startsWith(e)).length;
console.log(`\n${n('EN ATTENTE')} en attente · ${n('ENREGISTRÉE')} enregistrée(s) à appliquer · ${n('APPLIQUÉE')} appliquée(s) · ${n('BLOQUÉE')} bloquée(s) · ${n('HOLD')} en HOLD\n`);
process.exit(0);
