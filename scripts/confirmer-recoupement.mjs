#!/usr/bin/env node
// =====================================================================
// scripts/confirmer-recoupement.mjs — l'éditeur confirme, après lecture des articles, le critère « recoupement » d'une candidate.
//
//   node scripts/confirmer-recoupement.mjs FR-2026-0149 --motif "<ta lecture>"                       # plan, aucune écriture
//   node scripts/confirmer-recoupement.mjs FR-2026-0149 --motif "<ta lecture>" --ecrire --go "<mot d'Adrien>"
//
// POURQUOI. Le critère « recoupement » est calculé par une heuristique (familles de dépêches). Quand l'éditeur a LU les articles et juge le
// recoupement suffisant (ex. trois éditeurs dont un titre de référence reprennent un fait judiciaire), il le dit ici : le critère passe à vrai,
// avec sa revue signée. Le SEUIL (8/10) et les quatre autres critères ne bougent pas : ce n'est PAS une dérogation au seuil, c'est la correction
// tracée d'un critère jugé par un humain. Une affaire qui a deux critères en défaut après cela reste non publiable.
//
// Garde-fous (tous vérifiés avant d'écrire, sinon refus) :
//   · la fiche existe, est `candidate`, et son critère recoupement est aujourd'hui FAUX (rien à confirmer sinon) ;
//   · au moins 3 sources d'éditeurs DISTINCTS sont rattachées (un éditeur ne se recoupe pas lui-même) ;
//   · aucune revue « retirer », pas de HOLD ;
//   · après correction, la fiabilité atteint le seuil (≥ 8) : ce script ne rattrape pas une affaire qui échoue sur plusieurs critères ;
//   · le motif est écrit (20 à 400 caractères) et --ecrire exige --go : ta lecture est consignée telle que donnée.
// Une seule instruction SQL (mise à jour + revue), rejouable sans effet (la clause `crit_recoupement is not true`).
// La revue écrite est une validation de création d'Adrien (« VALIDATED — … ») : l'affaire devient éligible à la proposition « PUBLIER ? »
// (proposer-publication.mjs) ; la PUBLICATION reste un GO distinct.
// =====================================================================
import { readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { SEUIL_PUBLICATION } from './lib/preuves.mjs';

const A = process.argv.slice(2);
const id = A.find((a) => /^FR-\d{4}-\d{4}$/.test(a));
const val = (n) => (A.includes(n) ? A[A.indexOf(n) + 1] : null);
const MOTIF = val('--motif'), GO = val('--go'), ECRIRE = A.includes('--ecrire');
if (!id) { console.error('usage : confirmer-recoupement.mjs <FR-AAAA-NNNN> --motif "…" [--ecrire --go "…"]'); process.exit(2); }
if (!MOTIF || MOTIF.length < 20 || MOTIF.length > 400) { console.error('--motif exige 20 à 400 caractères : ta lecture des articles, en clair'); process.exit(2); }
if (ECRIRE && (!GO || GO.length > 400)) { console.error('--ecrire exige --go "<ton mot>" (400 caractères au plus) : sans GO consigné, aucune écriture'); process.exit(2); }

const { sql } = connecter();
const refus = [];
const [c] = await sql`select case_id, publication_status::text ps, fiabilite_info_10 f, crit_source_fiable, crit_article_recent, crit_etablissement_nomme, crit_statut_clair, crit_recoupement from cases where case_id = ${id}`;
if (!c) { console.error(`${id} introuvable`); process.exit(1); }
if (c.ps !== 'candidate') refus.push(`statut « ${c.ps} » (attendu : candidate)`);
if (c.crit_recoupement !== false) refus.push('le critère recoupement n’est pas faux : rien à confirmer');
const [{ n }] = await sql`select count(distinct lower(regexp_replace(coalesce(media, ''), '[[:space:]]+', ' ', 'g')))::int n from sources where case_id = ${id} and coalesce(media, '') <> ''`;
if (n < 3) refus.push(`${n} éditeur(s) distinct(s) rattaché(s) : au moins 3 requis`);
const revues = await sql`select decision::text d from reviews where case_id = ${id}`;
if (revues.some((r) => r.d === 'retirer')) refus.push('une revue « retirer » existe');
const holds = JSON.parse(readFileSync(new URL('../data/publication-holds.json', import.meta.url), 'utf8')).holds || [];
if (holds.some((h) => h.case_id === id)) refus.push('sous HOLD de publication');
const apres = 2 * [c.crit_source_fiable, c.crit_article_recent, c.crit_etablissement_nomme, c.crit_statut_clair, true].filter(Boolean).length;
if (apres < SEUIL_PUBLICATION) refus.push(`fiabilité après correction : ${apres}/10 < ${SEUIL_PUBLICATION} (d’autres critères sont en défaut : ce script ne les rattrape pas)`);

console.log(`${id} — recoupement : faux → vrai (confirmé par l'éditeur) · fiabilité ${c.f} → ${apres}/10 · ${n} éditeur(s) distinct(s)`);
if (refus.length) { console.error(`\nREFUS — ${refus.length} garde-fou(s) :\n  · ${refus.join('\n  · ')}`); process.exit(1); }
if (!ECRIRE) { console.log('\nplan seulement (aucune écriture)'); process.exit(0); }

const note = `VALIDATED — critère « recoupement » confirmé par l'éditeur après lecture des articles (calcul automatique : faux) : ${MOTIF} · [Correction ${new Date().toISOString().slice(0, 10)}] « ${GO} »`;
const r = await sql`
  with maj as (
    update cases set crit_recoupement = true
     where case_id = ${id} and publication_status = 'candidate' and crit_recoupement is not true
    returning case_id)
  insert into reviews (case_id, reviewed_by, decision, comment)
  select case_id, 'Adrien (confirmation du recoupement)', 'validé', ${note} from maj
  returning case_id`;
console.log(r.length ? `\n✅ ${id} : recoupement confirmé, revue signée. Reste : proposer-publication (GO de publication distinct).` : '\nrien écrit (déjà confirmé)');
process.exit(0);
