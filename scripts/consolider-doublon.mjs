#!/usr/bin/env node
// =====================================================================
// scripts/consolider-doublon.mjs — réconcilier DEUX fiches qui décrivent UNE affaire (doublon démontré), sans rien supprimer.
//
//   node --env-file=.env.local scripts/consolider-doublon.mjs --garde FR-2026-0146 --retire FR-2026-0147 --motif "…" [--ecrire]
//
// Même convention que docs/industrialisation/consolidations-30-10.mjs (PARIS-009, PARIS-010…) :
//   · la fiche CONSERVÉE (canonique) est la plus ancienne et reste publique, inchangée dans son contenu ;
//   · les sources de la fiche retirée qui ne figurent pas déjà sur la canonique sont RÉAFFECTÉES (même ligne, autre affaire) : aucune source perdue ;
//   · la fiche en double passe à « retirée » (aucune suppression : l'affaire, ses sources restantes, ses revues et sa proposition d'origine restent en base) ;
//   · chaque écriture laisse une revue ; la proposition d'origine garde son identité, sa décision et sa date (seule une note de réconciliation est ajoutée) ;
//   · l'ancienne adresse est préservée par data/redirections-affaires.json (alias lu par la page d'accueil : /#affaire-<ancien id> → /#affaire-<id conservé>).
// Aucune approbation humaine n'est créée : le contenu rattaché est celui que l'éditeur a VALIDÉ (clic sur la proposition d'origine) ; la revue le dit.
//
// Refus (échec fermé) : une des deux fiches introuvable ou retirée ; communes différentes ; la fiche conservée n'est pas publique.
// Sans --ecrire : plan seulement, aucune écriture.
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';

const A = process.argv.slice(2);
const val = (n) => (A.includes(n) ? A[A.indexOf(n) + 1] : null);
const ECRIRE = A.includes('--ecrire');
const GARDE = val('--garde'), RETIRE = val('--retire'), MOTIF = val('--motif');
const ID = /^(?:FR-\d{4}-\d{4}|PARIS-\d{3}|POC-\d{2})$/;
if (!ID.test(GARDE || '') || !ID.test(RETIRE || '') || GARDE === RETIRE || !MOTIF || MOTIF.length < 30) {
  console.error('usage : --garde <id> --retire <id> --motif "<démonstration de l’identité, ≥ 30 caractères>" [--ecrire]'); process.exit(2);
}
const PAR = 'Agent Claude (réconciliation d’un doublon, mandat de l’éditeur du 12/11/2026 — pas un clic Telegram)';
const REDIRECTIONS = new URL('../data/redirections-affaires.json', import.meta.url);
const { sql } = connecter();

const [g] = await sql`select case_id, commune, publication_status::text ps, etablissement from cases where case_id = ${GARDE}`;
const [r] = await sql`select case_id, commune, publication_status::text ps, etablissement from cases where case_id = ${RETIRE}`;
if (!g || !r) { console.error('REFUS : fiche introuvable'); process.exit(1); }
if (g.commune !== r.commune) { console.error('REFUS : communes différentes — ce n’est pas démontré comme un doublon'); process.exit(1); }
if (g.ps !== 'publiée') { console.error(`REFUS : la fiche conservée ${GARDE} n’est pas publique (${g.ps})`); process.exit(1); }
if (r.ps === 'retirée') console.log(`· ${RETIRE} est déjà retirée : seules les étapes restantes seront rejouées`);

const sg = await sql`select url from sources where case_id = ${GARDE}`;
const dejaSurGarde = new Set(sg.map((x) => x.url));
const sr = await sql`select source_id, url, media, is_primary from sources where case_id = ${RETIRE} order by publication_date, url`;
const aDeplacer = sr.filter((s) => !dejaSurGarde.has(s.url));
const communes = sr.filter((s) => dejaSurGarde.has(s.url));
console.log(`${RETIRE} → ${GARDE}${ECRIRE ? '' : ' (plan : aucune écriture)'}`);
for (const s of aDeplacer) console.log(`  source réaffectée : ${s.media} → ${s.url.slice(0, 90)}`);
for (const s of communes) console.log(`  source déjà sur ${GARDE} : ${s.media} (la ligne reste sous ${RETIRE}, historique conservé)`);

const [dejaFait] = await sql`select 1 x from reviews where case_id = ${RETIRE} and comment like '[Réconciliation %'`;
if (!ECRIRE) { console.log(dejaFait ? '  (réconciliation déjà consignée)' : '  → déplacerait les sources, retirerait la fiche en double, consignerait deux revues, ajouterait l’alias d’adresse'); process.exit(0); }

if (!dejaFait) {
  const ids = aDeplacer.map((s) => s.source_id);
  if (ids.length) {
    // Index unique « une seule source primaire par affaire » : les lignes déplacées deviennent secondaires (la canonique a déjà sa primaire).
    await sql`update sources set case_id = ${GARDE}, is_primary = false where source_id = any(${ids}::uuid[])`;
    const [reste] = await sql`select 1 x from sources where case_id = ${RETIRE} and is_primary`;
    if (!reste) await sql`update sources set is_primary = true where source_id = (select source_id from sources where case_id = ${RETIRE} order by publication_date limit 1)`;
  }
  await sql`update cases set publication_status = 'retirée', updated_at = now() where case_id = ${RETIRE} and publication_status <> 'retirée'`;
  const quoi = `${aDeplacer.length} source(s) réaffectée(s)${communes.length ? `, ${communes.length} déjà présente(s) sur ${GARDE}` : ''}`;
  await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${RETIRE}, ${PAR}, 'retirer',
    ${`[Réconciliation ${new Date().toISOString().slice(0, 10)}] doublon établi de ${GARDE} : ${MOTIF}. Affaire, sources restantes, revues et proposition d’origine CONSERVÉES pour la traçabilité (${quoi}) ; fiche conservée : ${GARDE}. Ancienne adresse préservée par data/redirections-affaires.json.`})`;
  await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${GARDE}, ${PAR}, 'validé',
    ${`[Réconciliation ${new Date().toISOString().slice(0, 10)}] fiche conservée : ${RETIRE} décrivait la même affaire (${MOTIF}). ${quoi}. Aucun contenu nouveau, aucune nouvelle approbation : les sources rattachées sont celles que l’éditeur a validées (clic sur la proposition d’origine de ${RETIRE}, avec GO de publication) ; état judiciaire, établissement, rôle et nombre d’enfants de ${GARDE} inchangés.`})`;
  // Trace sur la proposition d'origine de la fiche retirée : identité, décision, auteur et date INTACTES ; une note seulement.
  await sql`update new_case_proposals set decision_comment = left(coalesce(decision_comment, '') || ${` · affaire créée ${RETIRE} réconciliée avec ${GARDE} (doublon établi)`}, 500)
             where created_case_id = ${RETIRE} and coalesce(decision_comment, '') not like '%réconciliée avec%'`;
  console.log(`  ✅ ${RETIRE} retirée (rien supprimé), ${quoi}, deux revues consignées`);
} else console.log('  · réconciliation déjà consignée en base');

// Alias d'adresse (artefact du dépôt, lu par le site) : idempotent.
let doc;
try { doc = JSON.parse(readFileSync(REDIRECTIONS, 'utf8')); } catch { doc = { _meta: { note: 'Anciens identifiants d’affaires (doublons réconciliés) → affaire conservée. Lu par la page d’accueil : /#affaire-<ancien> mène à /#affaire-<conservé>. Compilé par scripts/consolider-doublon.mjs.' }, redirections: {} }; }
doc.redirections[RETIRE.toLowerCase()] = GARDE.toLowerCase();
writeFileSync(REDIRECTIONS, JSON.stringify(doc, null, 2) + '\n');
console.log(`  ✅ alias d’adresse : #affaire-${RETIRE.toLowerCase()} → #affaire-${GARDE.toLowerCase()}`);
process.exit(0);
