#!/usr/bin/env node
// =====================================================================
// scripts/appliquer-correction.mjs — applique à Neon une CORRECTION DE DONNÉES versionnée (supabase/migrations/NNN_xxx.sql), depuis la CI.
//
//   node scripts/appliquer-correction.mjs 029_fr_2026_0048_correction_et_go.sql [--affaire FR-2026-0048]                    # plan : aucune écriture
//   node scripts/appliquer-correction.mjs 029_fr_2026_0048_correction_et_go.sql --affaire FR-2026-0048 --ecrire --confirmation GO-029
//
// Garde-fous : lib/correction-donnees.mjs (INSERT/UPDATE gardés sur cases, sources, reviews ; jamais de DELETE, DROP, ALTER ; jamais publication_status).
// Écriture dans UNE transaction. Ce script ne publie rien : l'exposition publique reste la projection (reconcilier-publication → project-public).
// Dépôt public ⇒ journaux publics : compteurs et valeurs de champs PUBLICS de l'affaire seulement ; jamais d'URL, de commentaire ni de nom.
// =====================================================================
import { readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { validerNom, confirmationValide, preparer } from './lib/correction-donnees.mjs';

const A = process.argv.slice(2);
const nom = A.find((a) => !a.startsWith('--') && /\.sql$/.test(a));
const val = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const ECRIRE = A.includes('--ecrire');
const AFFAIRE = val('--affaire');
const log = (m) => console.log(m);

const v = validerNom(nom);
if (!v.ok) { console.error(`refusé : ${v.raison}`); process.exit(2); }
if (AFFAIRE !== null && !/^FR-\d{4}-\d{4}$/.test(AFFAIRE)) { console.error('refusé : --affaire attend FR-AAAA-NNNN'); process.exit(2); }
if (ECRIRE && !confirmationValide(val('--confirmation'), v.numero)) { console.error(`refusé : confirmation attendue GO-${v.numero}`); process.exit(2); }

const texte = readFileSync(new URL(`../supabase/migrations/${nom}`, import.meta.url), 'utf8');
const p = preparer(texte);
log(`${nom} : ${p.instructions.length} instruction(s) — ${p.resume.insert} insert, ${p.resume.update} update`);
if (!p.ok) { console.error(`REFUS :\n  · ${p.refus.join('\n  · ')}`); process.exit(2); }

const { sql } = connecter();

async function etat() {
  if (!AFFAIRE) return null;
  const [c] = await sql`select role_mis_en_cause::text role, type_affaire::text type_affaire, statut_judiciaire::text statut, statut_des_faits::text faits,
                               enfants_concernes_public::text enfants, publication_status::text publication, fiabilite_info_10 fiabilite from cases where case_id = ${AFFAIRE}`;
  if (!c) return { absente: true };
  const [s] = await sql`select count(*)::int n, count(*) filter (where is_primary)::int principales, count(*) filter (where access_checked_at is not null)::int verifiees from sources where case_id = ${AFFAIRE}`;
  const [g] = await sql`select count(*)::int n from reviews where case_id = ${AFFAIRE} and comment like '[Publication %] GO d''Adrien : %'`;
  return { ...c, sources: s.n, sources_principales: s.principales, sources_verifiees: s.verifiees, go_publication: g.n };
}

const avant = await etat();
if (avant) log(`AVANT : ${JSON.stringify(avant)}`);
if (!ECRIRE) { log('plan seulement (aucune écriture)'); process.exit(0); }

await sql.transaction(p.instructions.map((i) => sql.query(i)));
log(`✅ ${p.instructions.length} instruction(s) appliquée(s) dans une transaction`);
const apres = await etat();
if (apres) log(`APRÈS : ${JSON.stringify(apres)}`);
process.exit(0);
