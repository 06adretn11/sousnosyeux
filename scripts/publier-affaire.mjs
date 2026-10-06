#!/usr/bin/env node
// =====================================================================
// scripts/publier-affaire.mjs — rend UNE affaire publiable dans Neon.
//
//   node scripts/publier-affaire.mjs FR-2026-0113 [--coords lat,lng --coords-source "<origine>"]          # plan, aucune écriture
//   node scripts/publier-affaire.mjs FR-2026-0113 --coords … --coords-source … --ecrire --go "<mot d'Adrien>"
//
// C'est LA mutation qui fait passer une fiche de `candidate` à `publiée` (cases.publication_status). Elle ne publie pas
// à elle seule : le site public lit data/cases.json, produit par scripts/project-public.mjs puis déployé par un push sur main.
//
// Garde-fous (tous vérifiés avant d'écrire, sinon refus) :
//   · la fiche existe, est `candidate`, fiabilité ≥ 8 ;
//   · une revue « validé » d'Adrien existe (Decision Pack ou clic VALIDATE), aucune revue « retirer » ;
//   · la fiche n'est pas sous HOLD (data/publication-holds.json) ;
//   · des coordonnées existent (en base ou fournies) : le front n'affiche pas une fiche sans coordonnées ;
//   · --ecrire exige --go : le GO d'Adrien est consigné dans la revue, tel qu'il l'a donné.
// Une seule instruction SQL, rejouable sans effet (la clause `publication_status = 'candidate'`).
// =====================================================================
import { readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';

const A = process.argv.slice(2);
const id = A.find((a) => /^[A-Z]+-\d{4}-\d{4}$|^POC-\d+$/.test(a));
const val = (n) => (A.includes(n) ? A[A.indexOf(n) + 1] : null);
const ECRIRE = A.includes('--ecrire');
const GO = val('--go');
const COORDS = val('--coords');
const COORDS_SOURCE = val('--coords-source');
if (!id) { console.error('usage : publier-affaire.mjs <case_id> [--coords lat,lng --coords-source …] [--ecrire --go "…"]'); process.exit(2); }
if (ECRIRE && !GO) { console.error('--ecrire exige --go "<GO explicite d’Adrien>" : sans GO consigné, aucune publication'); process.exit(2); }

const { sql } = connecter();
const refus = [];
const [c] = await sql`select case_id, etablissement, commune, publication_status::text ps, fiabilite_info_10 f, lat, lng from cases where case_id = ${id}`;
if (!c) { console.error(`${id} introuvable`); process.exit(1); }

if (c.ps === 'publiée') { console.log(`${id} — déjà publiée en base → NO_PUBLIC_CHANGE (rien à écrire)`); process.exit(0); }
if (c.ps !== 'candidate') refus.push(`statut « ${c.ps} » (attendu : candidate)`);
if (!(c.f >= 8)) refus.push(`fiabilité ${c.f} < 8`);
const revues = await sql`select reviewed_by, decision::text d, comment from reviews where case_id = ${id}`;
if (!revues.some((r) => r.d === 'validé' && /^Adrien/.test(r.reviewed_by))) refus.push('aucune revue « validé » d’Adrien');
if (revues.some((r) => r.d === 'retirer')) refus.push('une revue « retirer » existe');
const holds = JSON.parse(readFileSync(new URL('../data/publication-holds.json', import.meta.url), 'utf8')).holds || [];
if (holds.some((h) => h.case_id === id)) refus.push('sous HOLD de publication');

let lat = c.lat === null ? null : Number(c.lat);
let lng = c.lng === null ? null : Number(c.lng);
if (COORDS) {
  const [la, ln] = COORDS.split(',').map(Number);
  if (!(la >= 41 && la <= 52 && ln >= -6 && ln <= 10)) refus.push(`coordonnées hors de la France métropolitaine : ${COORDS}`);
  if (lat !== null && (lat !== la || lng !== ln)) refus.push('la fiche porte déjà d’autres coordonnées : refus de les écraser');
  lat = la; lng = ln;
}
if (lat === null || lng === null) refus.push('aucune coordonnée : le front n’afficherait pas la fiche');
if (COORDS && !COORDS_SOURCE) refus.push('--coords exige --coords-source (origine traçable des coordonnées)');

console.log(`${id} — ${c.etablissement} (${c.commune})`);
console.log(`  AVANT : publication_status = ${c.ps} · coordonnées = ${c.lat ?? 'null'},${c.lng ?? 'null'} · fiabilité ${c.f}`);
console.log(`  APRÈS : publication_status = publiée · coordonnées = ${lat},${lng}`);
if (refus.length) { console.error(`\nREFUS — ${refus.length} garde-fou(s) :\n  · ${refus.join('\n  · ')}`); process.exit(1); }
if (!ECRIRE) { console.log('\nplan seulement (aucune écriture)'); process.exit(0); }

const note = `[Publication ${new Date().toISOString().slice(0, 10)}] GO d'Adrien : « ${GO} »` + (COORDS ? ` · coordonnées ${lat},${lng} (${COORDS_SOURCE})` : '');
const r = await sql`
  with maj as (
    update cases set publication_status = 'publiée', lat = ${lat}, lng = ${lng}
     where case_id = ${id} and publication_status = 'candidate'
    returning case_id)
  insert into reviews (case_id, reviewed_by, decision, comment)
  select case_id, 'Adrien (GO publication)', 'validé', ${note} from maj
  returning case_id`;
console.log(r.length ? `\n✅ ${id} : publiée (Neon). Reste : projection, QA, déploiement.` : '\nrien écrit (déjà publiée)');
process.exit(0);
