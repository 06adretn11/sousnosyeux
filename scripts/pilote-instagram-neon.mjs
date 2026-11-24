// =====================================================================
// scripts/pilote-instagram-neon.mjs — migration 028 (pistes à qualifier) et essai du pilote Instagram : vérifications contre la base, SANS rien modifier hors application explicite.
//
//   verifier-migration   exécute la migration 028 + des assertions + des insertions d'essai dans UNE transaction qui s'ANNULE toujours (erreur volontaire finale) :
//                        la base n'est pas modifiée (la table reste absente si elle l'était) ; prouve que 028 accepte une piste SANS affaire ET SANS territoire.
//   appliquer-migration  applique 028 (additive, idempotente ; toute instruction destructrice est refusée), puis rejoue la vérification ci-dessus sur la table réelle.
//   empreinte <fichier>  enregistre l'état de la base (lignes par table, compteurs d'écriture) — lecture seule.
//   comparer <fichier>   compare l'état actuel à l'empreinte : AUCUNE écriture ne doit apparaître (preuve qu'un --dry-run ne modifie pas Neon).
//   resume-apercu <fichier>  résume l'aperçu du cycle SANS texte, ni adresse, ni pseudo : pour des journaux publics.
//
// Dépôt public ⇒ journaux publics : compteurs, dates, destinations ; jamais de légende, d'adresse, de pseudo, de jeton ni de ligne de base.
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { decouperInstructions, instructionDestructrice } from './lib/relais-social.mjs';
import { verifications, insertionInvalide, issueInsertionInvalide, verdictTransaction, comparerEmpreintes, resumerApercu } from './lib/pilote-instagram-neon.mjs';

const [mode, arg] = process.argv.slice(2);
const log = (m) => console.log(m);
const MIGRATION = new URL('../supabase/migrations/028_pistes_a_qualifier.sql', import.meta.url);
const migration = () => decouperInstructions(readFileSync(MIGRATION, 'utf8'));
const executer = (sql, instructions) => sql.transaction(instructions.map((i) => sql.query(i)));

async function etatTable(sql) {
  const present = (await sql`select to_regclass('public.pistes_a_qualifier') is not null as ok`)[0].ok;
  const residus = present ? (await sql`select count(*)::int n from pistes_a_qualifier where piste_id like 'verif-%'`)[0].n : 0;
  return { present, residus };
}

async function verifier(sql, { avecMigration }) {
  const avant = await etatTable(sql);
  let erreur = null;
  try { await executer(sql, [...(avecMigration ? migration() : []), ...verifications()]); } catch (e) { erreur = e; }
  const verdict = verdictTransaction(erreur);
  // Une destination hors vocabulaire doit être REFUSÉE par la contrainte CHECK (transaction séparée, annulée de toute façon).
  let e2 = null; try { await executer(sql, [...(avecMigration ? migration() : []), ...insertionInvalide()]); } catch (e) { e2 = e; }
  const refus = issueInsertionInvalide(e2);
  const apres = await etatTable(sql); // APRÈS les deux transactions
  return { ...verdict, refus, table_avant: avant.present, table_apres: apres.present, residus: apres.residus, inchangee: avant.present === apres.present && apres.residus === 0 };
}

async function empreinte(sql) {
  const tables = (await sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`).map((t) => t.table_name);
  const compteurs = Object.fromEntries((await sql`select relname, n_tup_ins::bigint ins, n_tup_upd::bigint upd, n_tup_del::bigint del from pg_stat_user_tables where schemaname = 'public'`).map((r) => [r.relname, [Number(r.ins), Number(r.upd), Number(r.del)]]));
  const lignes = {};
  for (const t of tables) lignes[t] = Number((await sql.query(`select count(*)::bigint n from "${t.replace(/"/g, '')}"`))[0].n);
  return { le: new Date().toISOString(), tables: tables.length, lignes, compteurs };
}

try {
  const { sql } = connecter();
  if (mode === 'verifier-migration' || mode === 'appliquer-migration') {
    if (migration().some(instructionDestructrice)) { console.error('migration 028 refusée : instruction destructrice'); process.exit(2); }
    if (mode === 'appliquer-migration') {
      const instructions = migration();
      for (const [i, ins] of instructions.entries()) { await sql.query(ins); log(`028 : instruction ${i + 1}/${instructions.length} appliquée`); }
    }
    const v = await verifier(sql, { avecMigration: mode === 'verifier-migration' });
    log(`vérification : ${v.ok ? 'RÉUSSIE' : 'ÉCHEC'} — ${v.detail}`);
    log(`piste SANS affaire ni territoire acceptée : ${v.ok ? 'oui' : 'non établi'} · destination hors vocabulaire : ${v.refus === 'refusee' ? 'refusée (CHECK)' : `NON REFUSÉE (${v.refus})`}`);
    log(`table avant : ${v.table_avant ? 'présente' : 'absente'} · après : ${v.table_apres ? 'présente' : 'absente'} · lignes d'essai restantes : ${v.residus}`);
    if (mode === 'verifier-migration') log(`base ${v.inchangee ? 'INCHANGÉE par la vérification' : 'MODIFIÉE (anomalie)'}`);
    if (mode === 'appliquer-migration') {
      const cols = (await sql`select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'pistes_a_qualifier' order by ordinal_position`).map((c) => `${c.column_name}${c.is_nullable === 'YES' ? '?' : ''}`);
      log(`colonnes (« ? » = nullable) : ${cols.join(', ')}`);
    }
    process.exit(v.ok && v.refus === 'refusee' && v.residus === 0 && (mode === 'appliquer-migration' || v.inchangee) ? 0 : 1);
  } else if (mode === 'empreinte') {
    const e = await empreinte(sql); writeFileSync(arg, JSON.stringify(e)); log(`empreinte : ${e.tables} tables, ${Object.values(e.lignes).reduce((a, b) => a + b, 0)} lignes au total`);
  } else if (mode === 'comparer') {
    const avant = JSON.parse(readFileSync(arg, 'utf8')); await new Promise((r) => setTimeout(r, 12000)); // les compteurs de Postgres sont asynchrones
    const apres = await empreinte(sql);
    const diff = comparerEmpreintes(avant, apres);
    log(`comparaison (${avant.le} → ${apres.le}) : ${diff.length ? `MODIFICATION DÉTECTÉE\n  ${diff.join('\n  ')}` : 'AUCUNE écriture : lignes et compteurs d\'écriture identiques sur toutes les tables'}`);
    process.exit(diff.length ? 1 : 0);
  } else if (mode === 'resume-apercu') {
    for (const l of resumerApercu(JSON.parse(readFileSync(arg, 'utf8')))) log(l);
  } else { console.error('usage : verifier-migration | appliquer-migration | empreinte <fichier> | comparer <fichier> | resume-apercu <fichier>'); process.exit(64); }
} catch (e) { console.error(`échec : ${String(e?.message || e).slice(0, 200)}`); process.exit(1); }
