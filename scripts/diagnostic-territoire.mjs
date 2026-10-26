#!/usr/bin/env node
// =====================================================================
// scripts/diagnostic-territoire.mjs — réévalue l'intérêt des Hubs à chaque modification de la mémoire. Lecture seule sur Neon.
//
//   node scripts/diagnostic-territoire.mjs                 # plan : tous les territoires, aucune écriture, aucun envoi
//   node scripts/diagnostic-territoire.mjs --ecrire        # journalise l'instantané ; notifie (Telegram) SEULEMENT si changement significatif
//   node scripts/diagnostic-territoire.mjs --territoire gironde   (filtre)
//   node scripts/diagnostic-territoire.mjs --territoire landes --proposer --ecrire   (re)propose « PRÉPARER LE HUB » sans attendre un changement
// Nouveau Hub : la proposition est une ligne de new_case_proposals (boutons PRÉPARER LE HUB / REVIEW / REJECT), exécutée par preparer-hub.mjs.
// Instantané précédent : telegram_journal (kind « application », cle « diag:<territoire> », details = compteurs). Aucune table nouvelle.
// Premier passage d'un territoire = base de référence, jamais de notification. Une affaire sans département n'est comptée nulle part.
// =====================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connecter } from './lib/neon.mjs';
import { payloadProposition } from './lib/hub-brouillon.mjs';
import { HUBS_PERIMETRES, diagnostiquer, instantane, messageDiagnostic } from './lib/diagnostic-territoire.mjs';
import { evaluerPublication } from './lib/publication-gates.mjs';
import { journaliser } from './lib/telegram-clics.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const PROPOSER = A.includes('--proposer'); // avec --territoire : (re)propose le Hub même sans changement depuis l'instantané (idempotent : une proposition par périmètre)
const FILTRE = A.includes('--territoire') ? A[A.indexOf('--territoire') + 1].toLowerCase() : null;
const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
// Affaires couvertes par un Hub : celles de ses dossiers ET celles de son `ordre` (un Hub composé n'a pas de dossier rédigé pour chaque affaire).
const hubDossiers = (h) => { const m = lire(`data/hub-matiere/${h}.json`); return new Set([...Object.keys(m.dossiers || {}), ...(m.ordre || [])]); };
const REACTIONS = ['réponse_institutionnelle', 'mobilisation', 'suspension'];

const { sql } = connecter();

/** États courants de tous les territoires (une seule lecture de Neon). `hubsOverride` : dossiers de Hub simulés (rejeu « avant »). */
export async function etatsTerritoires({ hubsOverride = null, retirerPubliques = [] } = {}) {
  const publiees = new Set(lire('data/cases.json').cases.map((c) => c.case_id).filter((id) => !retirerPubliques.includes(id)));
  const cases = await sql`select case_id, departement, commune, publication_status::text publication_status, fiabilite_info_10, statut_judiciaire::text statut_judiciaire,
      etablissement, type_structure::text type_structure, role_mis_en_cause::text role_mis_en_cause, enfants_concernes_public::text enfants_concernes_public, crit_statut_clair
      from cases where publication_status in ('candidate', 'publiée')`;
  const revues = await sql`select case_id, reviewed_by, decision::text decision, comment from reviews order by reviewed_at`;
  const sources = await sql`select case_id, url, media from sources`;
  const events = await sql`select case_id, event_type::text t from case_events`;
  const review = await sql`select payload->'fiche'->>'departement' dep from new_case_proposals where decision = 'REVIEW_REQUIRED' and payload ? 'fiche'`;
  const par = (rows) => rows.reduce((m, r) => ((m.get(r.case_id) || m.set(r.case_id, []).get(r.case_id)).push(r), m), new Map());
  const rv = par(revues), sr = par(sources), ev = par(events);
  const territoires = {};
  const ajouter = (nom, hub, test) => {
    const dossiers = hub ? (hubsOverride?.[hub] ?? hubDossiers(hub)) : null;
    const dans = cases.filter(test);
    const pub = dans.filter((c) => c.publication_status === 'publiée' && publiees.has(c.case_id));
    const cand = dans.filter((c) => (c.publication_status === 'candidate' || retirerPubliques.includes(c.case_id))
      && evaluerPublication({ ...c, publication_status: 'candidate' }, { revues: rv.get(c.case_id), sources: sr.get(c.case_id), holds: new Set(), autres: [] }).etat !== 'NON_VALIDEE');
    territoires[nom] = { hub, publiques: pub.map((c) => c.case_id), horsHub: dossiers ? pub.filter((c) => !dossiers.has(c.case_id)).map((c) => c.case_id) : [],
      candidatesValidees: cand.length, reviewNonPublic: 0, evenements: pub.reduce((n, c) => n + (ev.get(c.case_id) || []).length, 0),
      avecMatiere: pub.filter((c) => (ev.get(c.case_id) || []).length).length,
      reactions: pub.reduce((n, c) => n + (ev.get(c.case_id) || []).filter((x) => REACTIONS.includes(x.t)).length, 0),
      sources: pub.reduce((n, c) => n + (sr.get(c.case_id) || []).length, 0), _dep: dans[0]?.departement ?? null, residuel: nom === 'paris-hors-11e' };
  };
  for (const [h, p] of Object.entries(HUBS_PERIMETRES)) ajouter(h, h, p.test);
  const deptsHub = new Set(Object.values(HUBS_PERIMETRES).map((p) => p.zone.departement).filter(Boolean));   // tout Hub (rédigé ou composé/approuvé) à périmètre départemental
  for (const d of new Set(cases.map((c) => c.departement).filter(Boolean))) {
    if (deptsHub.has(d)) continue;
    if (d === 'Paris') ajouter('paris-hors-11e', null, (c) => c.departement === 'Paris' && c.commune !== 'Paris 11e');
    else ajouter(d.toLowerCase(), null, (c) => c.departement === d);
  }
  for (const t of Object.values(territoires)) t.reviewNonPublic = review.filter((r) => r.dep && t._dep && r.dep === t._dep).length;
  return territoires;
}

if (process.argv[1]?.endsWith('diagnostic-territoire.mjs')) {
  const { prevenir } = await import('./lib/prevenir.mjs');
  const etats = await etatsTerritoires();
  let notifies = 0, base = 0;
  for (const [nom, e] of Object.entries(etats)) {
    if (FILTRE && nom !== FILTRE) continue;
    const [pre] = await sql`select details from telegram_journal where kind = 'application' and cle = ${'diag:' + nom} order by id desc limit 1`;
    const prev = pre?.details?.instantane ?? null;
    const d = diagnostiquer(e, prev);
    const bouge = prev && JSON.stringify(prev) !== JSON.stringify(instantane(e));
    if (!prev) base++;
    if (d.decision !== 'NO_ACTION' || FILTRE) console.log(`· ${nom.padEnd(22)} ${d.decision.padEnd(22)} ${prev ? (d.significatif ? 'NOTIFIER' : 'sans changement significatif') : 'base de référence'} — ${d.pourquoi.join(' ; ')}`);
    if (!ECRIRE) continue;
    // NOUVEAU HUB : jamais un message sans bouton. Une proposition DÉCIDABLE (PRÉPARER LE HUB / REVIEW / REJECT) est écrite dans
    // new_case_proposals (clé de dédoublonnage = périmètre) puis envoyée par le circuit Discovery ; si elle ne peut pas l'être, le signal reste
    // interne (instantané non journalisé : il sera reconsidéré au prochain passage), aucun message d'information n'est envoyé à la place.
    if (d.decision === 'PROPOSER_NOUVEAU_HUB' && (d.significatif || (PROPOSER && FILTRE))) {
      try {
        const { payload, cle } = payloadProposition(nom, e, d);
        const [ins] = await sql`insert into new_case_proposals (dedup_key, recommendation, attach_case_id, payload)
                                values (${cle}, 'REVIEW', null, ${JSON.stringify(payload)}::jsonb) on conflict (dedup_key) do nothing returning proposal_id::text pid`;
        const [pr] = ins ? [ins] : await sql`select proposal_id::text pid, decision::text d from new_case_proposals where dedup_key = ${cle}`;
        console.log(`  proposition de Hub ${ins ? 'créée' : `déjà existante (décision : ${pr.d ?? 'en attente'})`} : ${pr.pid.slice(0, 8)}`);
        if (ins) {
          // Envoi immédiat (une seule fois : telegram_envois) ; à défaut, le prochain « notifier-nouvelles » l'enverra.
          try { execFileSync(process.execPath, [fileURLToPath(new URL('./telegram-v0.mjs', import.meta.url)), 'nouvelle', pr.pid.slice(0, 8)], { stdio: 'inherit' }); } catch { console.log('  envoi différé au prochain passage'); }
          notifies++;
        }
      } catch (err) { console.log(`  ⚠ proposition de Hub non écrite (${String(err.message).slice(0, 100)}) : signal conservé en interne, aucun message envoyé`); continue; }
    } else if (d.significatif && d.decision !== 'PROPOSER_NOUVEAU_HUB') { await prevenir(messageDiagnostic(nom, e, d)); notifies++; }
    if (!prev || bouge) await journaliser(sql, { kind: 'application', cle: 'diag:' + nom, resultat: 'diagnostic', details: { instantane: instantane(e), decision: d.decision } });
  }
  console.log(`diagnostic territorial : ${Object.keys(etats).length} territoire(s), ${base} base(s) de référence, ${notifies} notification(s)${ECRIRE ? '' : ' (plan : rien écrit, rien envoyé)'}`);
}
