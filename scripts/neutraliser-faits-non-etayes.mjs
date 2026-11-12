#!/usr/bin/env node
// =====================================================================
// scripts/neutraliser-faits-non-etayes.mjs — rendre INAPPLICABLE une proposition Maintenance dont les faits ne sont pas étayés par leur article.
//
//   node --env-file=.env.local scripts/neutraliser-faits-non-etayes.mjs --pid 5cda4e18,b205036e --raison "<pourquoi, ≥ 30 caractères>" [--ecrire]
//
// Mécanisme EXISTANT (celui de scripts/reprendre-sans-perte.mjs, lib/decision-machine.mjs) — aucun statut, aucune colonne, aucune migration :
//   · proposition SANS décision (bouton encore actif) → décision MACHINE « REVIEW_REQUIRED » (« À QUALIFIER »), signée d'un agent non humain, raison conservée :
//     l'ancien bouton répond « déjà décidée » (clicEtat n'écrit que `where decision is null`) ; rien n'est approuvé NI rejeté à la place de l'éditeur ;
//   · proposition DÉJÀ décidée par un humain (REVIEW, REJECT…) → décision, auteur et date INTACTS ; seule une NOTE est ajoutée à son commentaire (raison conservée).
// Une décision ACCEPT n'est jamais touchée (refus). Sans --ecrire : plan seulement.
// =====================================================================
import { connecter } from './lib/neon.mjs';

const A = process.argv.slice(2);
const val = (n) => (A.includes(n) ? A[A.indexOf(n) + 1] : null);
const ECRIRE = A.includes('--ecrire');
const PIDS = (val('--pid') || '').split(',').filter((x) => /^[0-9a-f]{8}$/.test(x));
const RAISON = val('--raison') || '';
if (!PIDS.length || RAISON.length < 30) { console.error('usage : --pid <8 hex>[,…] --raison "<≥ 30 caractères>" [--ecrire]'); process.exit(2); }
const MACHINE = 'neutralisation de faits non étayés 12/11/2026 (agent, non humain)';
const NOTE = '[note agent 12/11/2026]';
const { sql } = connecter();

for (const pid of PIDS) {
  const lignes = await sql`select proposal_id::text pid, case_id, decision::text decision, decided_by, analysis_action from state_proposals where proposal_id::text like ${pid + '%'}`;
  if (lignes.length !== 1) { console.log(`· ${pid} : ${lignes.length} proposition(s) trouvée(s) — ignorée`); continue; }
  const p = lignes[0];
  if (p.decision === 'ACCEPT') { console.log(`· ${pid} : REFUS — décision ACCEPT, jamais touchée par cet outil`); continue; }
  const mode = p.decision ? `décision humaine ${p.decision} conservée (${p.decided_by}) : NOTE seulement` : 'sans décision : décision machine « À QUALIFIER » (bouton rendu inerte)';
  console.log(`· ${pid} ${p.case_id} ${p.analysis_action} — ${mode}${ECRIRE ? '' : ' (plan)'}`);
  if (!ECRIRE) continue;
  if (!p.decision) {
    const o = await sql`update state_proposals set decision = 'REVIEW_REQUIRED'::proposal_decision, decided_by = ${MACHINE}, decided_at = now(), decision_comment = ${('À QUALIFIER — ' + RAISON).slice(0, 500)}
                         where proposal_id = ${p.pid}::uuid and decision is null returning proposal_id`;
    console.log(o.length ? '  ✅ bouton rendu inerte, raison conservée' : '  · décidée entre-temps : rien écrit');
  } else {
    const o = await sql`update state_proposals set decision_comment = left(coalesce(decision_comment, '') || ${` · ${NOTE} ${RAISON}`}, 500)
                         where proposal_id = ${p.pid}::uuid and decision is not null and decision <> 'ACCEPT' and coalesce(decision_comment, '') not like ${'%' + NOTE + '%'} returning proposal_id`;
    console.log(o.length ? '  ✅ note ajoutée (décision, auteur et date intacts)' : '  · note déjà présente : rien écrit');
  }
}
process.exit(0);
