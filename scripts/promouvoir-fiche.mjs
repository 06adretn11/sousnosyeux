#!/usr/bin/env node
// =====================================================================
// scripts/promouvoir-fiche.mjs — après « APPROUVER LA FICHE » : le dossier généré approuvé entre dans data/hub-matiere/isoles.json.
//
//   node scripts/promouvoir-fiche.mjs FR-2026-0115            # plan : dit si la promotion est permise, n'écrit rien
//   node scripts/promouvoir-fiche.mjs FR-2026-0115 --ecrire   # écrit isoles.json (puis : project-evenements, QA, commit, PR — circuit habituel)
//   node scripts/promouvoir-fiche.mjs --depuis-propositions [--ecrire]     # circuit de la CI (sny-telegram, sny-clics)
//   node scripts/promouvoir-fiche.mjs --controle-final        # relecture des autorisations JUSTE AVANT le commit/push de la CI
//
// Lecture seule sur Neon (tables reviews, new_case_proposals, cases). Refus par défaut : voir lib/promouvoir-fiche.mjs.
//
// SÉLECTION (--depuis-propositions) : sans copie locale du générateur (CI), le dossier approuvé est celui que la PROPOSITION a porté (payload.page.dossier).
// On détermine D'ABORD l'empreinte de la dernière approbation valide de l'affaire, PUIS les propositions ACCEPT qui la portent : une proposition dépassée par une
// autorisation plus récente est refusée (consignée avant son exclusion), quel que soit le dossier présent. Aucune proposition ne porte l'empreinte attendue :
// dossier présent conforme ⇒ conservation sans écriture ; contenu attendu absent ⇒ refus motivé (un GO de lot n'écrit que des revues : sa source est dans le dépôt).
//
// RELECTURE : l'état qui détermine la décision (approbations, candidats, retrait, statut en base) est relu et la décision recalculée (1) juste avant l'écriture
// d'isoles.json et (2) dans l'étape --controle-final, après QA et au plus près du commit. Une autorisation devenue différente ⇒ abandon de l'écriture concernée.
// Ce n'est pas une transaction distribuée entre Git et Neon : la fenêtre résiduelle va de la dernière relecture au push (commit + push, quelques secondes).
// =====================================================================
import { readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connecter } from './lib/neon.mjs';
import { dossierGeneree, hashDossier } from './lib/fiche-page.mjs';
import { decider, inscrire, evaluerPromotions, confirmerPlan } from './lib/promouvoir-fiche.mjs';

const A = process.argv.slice(2);
let ids = A.filter((a) => /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+|PARIS-\d+)$/.test(a));
const ECRIRE = A.includes('--ecrire');
const DEPUIS_PROPOSITIONS = A.includes('--depuis-propositions');
const CONTROLE_FINAL = A.includes('--controle-final');
if (!ids.length && !DEPUIS_PROPOSITIONS && !CONTROLE_FINAL) { console.error('usage : promouvoir-fiche.mjs <case_id>… | --depuis-propositions [--ecrire] | --controle-final'); process.exit(2); }

const racine = (f) => new URL(`../${f}`, import.meta.url);
const lire = (f) => JSON.parse(readFileSync(racine(f), 'utf8'));
const cases = lire('data/cases.json').cases;
const holds = new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id));
const hubs = readdirSync(racine('data/hub-matiere/')).filter((f) => f.endsWith('.json') && f !== 'isoles.json').map((f) => lire(`data/hub-matiere/${f}`));
let isoles = lire('data/hub-matiere/isoles.json');
const { sql } = connecter();
const sortie = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

/** État qui détermine la décision, relu à chaque appel : propositions ACCEPT à dossier, TOUTES les revues de ces affaires (approbations, retrait), statut en base. */
async function lireEtat() {
  const propositions = await sql`select payload->'page'->>'case_id' id, left(proposal_id::text, 8) id8,
      to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') decided_at, payload->'page'->'dossier' dossier,
      payload->'page'->>'hash' declare, payload->'page'->'mise_a_jour'->>'precedent_hash' precedent
    from new_case_proposals where decision = 'ACCEPT' and payload->'page' ? 'dossier' order by 1, 3`;
  const aff = [...new Set(propositions.map((p) => p.id))];
  const revues = aff.length ? await sql`select case_id, reviewed_by, decision::text decision, comment,
      to_char(reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') reviewed_at from reviews where case_id = any(${aff}) order by reviewed_at, review_id` : [];
  const statuts = aff.length ? await sql`select case_id, publication_status::text statut from cases where case_id = any(${aff})` : [];
  const revuesParAffaire = new Map();
  for (const r of revues) revuesParAffaire.set(r.case_id, [...(revuesParAffaire.get(r.case_id) || []), r]);
  return { propositions, revuesParAffaire, statuts: new Map(statuts.map((s) => [s.case_id, s.statut])) };
}

let ecrit = 0;
if (CONTROLE_FINAL) {
  // Dossiers modifiés dans l'arbre de travail par la promotion de CE passage (comparés au dernier commit) : toujours autorisés à la relecture ?
  const avant = JSON.parse(execFileSync('git', ['show', 'HEAD:data/hub-matiere/isoles.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const modifies = Object.keys(isoles.dossiers).filter((id) => !avant.dossiers[id] || hashDossier(avant.dossiers[id]) !== hashDossier(isoles.dossiers[id]));
  if (!modifies.length) { console.log('contrôle final : aucun dossier de fiche modifié dans ce passage'); process.exit(0); }
  const { plan } = evaluerPromotions({ ...(await lireEtat()), isoles: avant, hubs, cases, holds });
  const { abandonnes } = confirmerPlan(modifies.map((id) => ({ id, hash: hashDossier(isoles.dossiers[id]) })), plan);
  if (abandonnes.length) {
    // Retour à l'état déjà validé (dernier commit) pour les deux fichiers que la promotion a fait évoluer ; le reste du passage (événements, autres fiches) est recalculé
    // au prochain passage. Les étapes de publication/vérification lisent `abandonnes` pour ne pas annoncer ce qui n'est plus publié.
    execFileSync('git', ['checkout', 'HEAD', '--', 'data/hub-matiere/isoles.json', 'data/evenements.json']);
    sortie('abandonnes', abandonnes.join(','));
    console.log(`· ${abandonnes.join(', ')} : ETAT_MODIFIE_PENDANT_TRAITEMENT — écriture abandonnée à la relecture finale (isoles.json et evenements.json restaurés) ; recalcul au prochain passage`);
  } else console.log(`contrôle final : ${modifies.length} dossier(s) modifié(s) toujours autorisé(s) (${modifies.join(', ')})`);
  process.exit(0);
}

if (DEPUIS_PROPOSITIONS) {
  const { lignes, plan } = evaluerPromotions({ ...(await lireEtat()), isoles, hubs, cases, holds });
  for (const l of lignes) console.log(l);          // refus des anciens candidats inclus : consignés AVANT toute exclusion, même si la sélection est vide
  if (ECRIRE && plan.length) {
    // Dernière relecture avant l'écriture : même décision recalculée sur l'état courant de Neon.
    const relu = evaluerPromotions({ ...(await lireEtat()), isoles, hubs, cases, holds }).plan;
    const { gardes, abandonnes } = confirmerPlan(plan, relu);
    for (const id of abandonnes) console.log(`· ${id} : écriture abandonnée — ETAT_MODIFIE_PENDANT_TRAITEMENT (autorisation différente à la relecture ; recalcul au prochain passage)`);
    for (const p of gardes) { isoles = inscrire(isoles, p.id, p.dossier, p.hash); ecrit++; }
  }
} else {
  for (const id of ids) {
    const revues = await sql`select reviewed_by, decision::text decision, comment,
        to_char(reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') reviewed_at from reviews where case_id = ${id} order by reviewed_at, review_id`;
    const r = decider({ id, generee: dossierGeneree(id), revues, toutesRevues: revues, isoles, hubs, cases, holds });
    console.log(`· ${id} : ${r.ok ? `promotion PERMISE (empreinte ${r.hash}${r.remplace ? `, remplace la version approuvée ${r.remplace}` : ''})` : `refusée — ${r.motif}${r.hash ? ` (empreinte ${r.hash})` : ''}`}`);
    if (!r.ok || !ECRIRE) continue;
    isoles = inscrire(isoles, id, r.dossier, r.hash);
    ecrit++;
  }
}
if (ECRIRE && ecrit) { writeFileSync(racine('data/hub-matiere/isoles.json'), JSON.stringify(isoles, null, 2) + '\n'); console.log(`✅ ${ecrit} dossier(s) écrit(s) dans data/hub-matiere/isoles.json — la page se publie par le circuit habituel.`); }
