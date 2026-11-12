#!/usr/bin/env node
// =====================================================================
// scripts/qa/concurrence-postgres.mjs — la création d'une fiche est-elle ATOMIQUE sous concurrence ? Preuve avec le VRAI PostgreSQL.
//
// Pas dans run-all (il exige un PostgreSQL local jetable) : à lancer à la main, contre une base ISOLÉE sur la machine locale.
//
//   SNY_PG_ISO_URL=postgresql://sny@127.0.0.1:55432/iso  SNY_PG_MODULE=<dossier node_modules de « pg »>  node scripts/qa/concurrence-postgres.mjs
//
// Garde-fous : refuse toute URL qui n'est pas 127.0.0.1 / localhost (jamais Neon, jamais la production). La base est celle du dépôt
// (supabase/schema.sql + migrations/*.sql appliqués à une base vide) ; le script y crée des affaires de test, qu'il ne reprend jamais ailleurs.
//
// La requête éprouvée n'est PAS réécrite ici : elle est extraite telle quelle de scripts/appliquer-nouvelles-affaires.mjs (le bloc `cree = await sql…`).
// =====================================================================
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const URL_PG = process.env.SNY_PG_ISO_URL || '';
if (!/^postgres(ql)?:\/\/[^/@]*@?(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG)) { console.error('REFUS : SNY_PG_ISO_URL doit désigner une base locale (127.0.0.1 / localhost)'); process.exit(2); }
const { Client } = createRequire(`${process.env.SNY_PG_MODULE}/`)('pg');

// --- la vraie requête de création -------------------------------------------------------------------------------------------------
const src = readFileSync(new URL('../appliquer-nouvelles-affaires.mjs', import.meta.url), 'utf8');
const debut = src.indexOf('if (!r.created_case_id) try { cree = await sql`');
const fin = src.indexOf('returning created_case_id`;', debut) + 'returning created_case_id`;'.length;
assert.ok(debut > 0 && fin > debut, 'bloc de création introuvable');
const bloc = src.slice(debut, fin).replace('if (!r.created_case_id) try { cree = await ', 'return ');
const fabrique = new Function('sql', 'r', 'etab', 'p', 'f', 'pubStatus', 'note', 'revue', 'prochain', 'direct', 'sources', 'maxVu', bloc);
const capture = (strings, ...values) => ({ text: strings.reduce((t, s, i) => t + s + (i < values.length ? `$${i + 1}` : ''), ''), values });
const F = { departement: 'Test', type_structure: 'maternelle', role_mis_en_cause: 'direction', type_affaire: 'agression sexuelle', statut_judiciaire: 'enquête', statut_des_faits: 'allégué', enfants_concernes_public: 'plusieurs enfants',
  crit_source_fiable: true, crit_article_recent: true, crit_etablissement_nomme: true, crit_statut_clair: true, crit_recoupement: true };
const requete = (pid, maxVu, n = 1) => fabrique(capture, { pid }, `école test ${n}`, { commune: 'Ville-Test' }, F, 'candidate', 'note', 'validé', null, false,
  [{ url: `https://x.example/${pid}`, media: 'X', d: '2026-11-11', p: true }], maxVu);

const nouveau = async () => { const c = new Client({ connectionString: URL_PG }); await c.connect(); return c; };
const admin = await nouveau();
let ko = 0;
const test = async (nom, f) => { try { await f(); console.log(`  ✓ ${nom}`); } catch (e) { ko++; console.log(`  ✗ ${nom}\n      ${e.message.split('\n')[0]}`); } };

async function remise(nbProps) {
  await admin.query('truncate cases cascade');
  await admin.query(`insert into cases (case_id, etablissement, commune, departement, type_structure, role_mis_en_cause, type_affaire, statut_judiciaire, statut_des_faits, enfants_concernes_public, fiabilite_info_10, publication_status)
                     values ('FR-2026-0100', 'base', 'Ville-Test', 'Test', 'maternelle', 'autre', 'à qualifier', 'enquête', 'allégué', 'non précisé', 0, 'candidate')`);
  const ids = [];
  for (let i = 0; i < nbProps; i++) {
    const r = await admin.query(`insert into new_case_proposals (dedup_key, recommendation, payload, decision, decided_by, decided_at) values ($1, 'NEW_CASE_CANDIDATE', '{}'::jsonb, 'ACCEPT', 'test', now()) returning proposal_id::text pid`, [`cle-${Date.now()}-${i}-${Math.random()}`]);
    ids.push(r.rows[0].pid);
  }
  return ids;
}
const etat = async () => ({
  cases: (await admin.query(`select case_id from cases where case_id <> 'FR-2026-0100' order by 1`)).rows.map((x) => x.case_id),
  sources: (await admin.query('select count(*)::int n from sources')).rows[0].n,
  revues: (await admin.query('select count(*)::int n from reviews')).rows[0].n,
  props: (await admin.query('select proposal_id::text pid, created_case_id, applied_at from new_case_proposals')).rows,
});
const lancer = async (c, q) => { try { const r = await c.query(q.text, q.values); return { ok: true, lignes: r.rowCount }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; } };

console.log('PostgreSQL', (await admin.query('show server_version')).rows[0].server_version, '— base isolée locale');

console.log('\nEntrelacement le plus défavorable (déterministe) : deux applications qui ont toutes deux passé la garde (même numéro vu = 100) AVANT qu’aucune n’écrive');
await test('A1 · deux propositions DIFFÉRENTES : la seconde, bloquée par la première, échoue (clé primaire) — UNE seule fiche, aucune écriture partielle', async () => {
  const [p1, p2] = await remise(2);
  const c1 = await nouveau(), c2 = await nouveau();
  await c1.query('begin');
  const r1 = await lancer(c1, requete(p1, 100, 1));                         // snapshot 1, insère FR-2026-0101 (non validé)
  const enAttente = lancer(c2, requete(p2, 100, 2));                        // snapshot 2 : voit encore 100 → vise le MÊME numéro, attend le verrou d'index
  await new Promise((r) => setTimeout(r, 400));
  await c1.query('commit');
  const r2 = await enAttente;
  await c1.end(); await c2.end();
  const e = await etat();
  assert.ok(r1.ok && r1.lignes === 1, 'la première écrit');
  assert.ok(!r2.ok && r2.code === '23505', `la seconde échoue par violation d’unicité, reçu : ${r2.code || 'succès'}`);
  assert.deepEqual(e.cases, ['FR-2026-0101'], 'une seule fiche créée');
  assert.equal(e.sources, 1); assert.equal(e.revues, 1, 'aucune source ni revue orpheline de la seconde');
  assert.equal(e.props.filter((x) => x.applied_at).length, 1, 'seule la proposition qui a créé est marquée appliquée');
  assert.equal(e.props.filter((x) => x.pid === p2)[0].created_case_id, null, 'la perdante n’est rattachée à aucune fiche : elle sera recontrôlée (et rattachée) au passage suivant');
});
await test('A2 · MÊME proposition appliquée deux fois en même temps (rejeu) : UNE seule fiche', async () => {
  const [p1] = await remise(1);
  const c1 = await nouveau(), c2 = await nouveau();
  await c1.query('begin');
  const r1 = await lancer(c1, requete(p1, 100));
  const enAttente = lancer(c2, requete(p1, 100));
  await new Promise((r) => setTimeout(r, 400));
  await c1.query('commit');
  const r2 = await enAttente;
  await c1.end(); await c2.end();
  const e = await etat();
  assert.ok(r1.ok && !r2.ok && r2.code === '23505');
  assert.deepEqual(e.cases, ['FR-2026-0101']); assert.equal(e.sources, 1); assert.equal(e.revues, 1);
});
await test('A3 · la seconde démarre APRÈS la validation de la première avec un numéro périmé : rien n’est écrit, la proposition reste due (pas marquée appliquée)', async () => {
  const [p1, p2] = await remise(2);
  const c = await nouveau();
  assert.ok((await lancer(c, requete(p1, 100, 1))).ok);
  const r2 = await lancer(c, requete(p2, 100, 2));                          // maxVu = 100 alors que la base est à 101
  await c.end();
  const e = await etat();
  assert.ok(r2.ok && r2.lignes === 0, 'aucune ligne écrite ni mise à jour');
  assert.deepEqual(e.cases, ['FR-2026-0101']);
  const perdante = e.props.find((x) => x.pid === p2);
  assert.equal(perdante.applied_at, null, 'la proposition n’est PAS marquée appliquée : elle sera recontrôlée'); assert.equal(perdante.created_case_id, null);
});
await test('A4 · numéro à jour : l’écriture a lieu et la proposition est marquée', async () => {
  const [p1] = await remise(1);
  const c = await nouveau();
  assert.ok((await lancer(c, requete(p1, 100))).ok);
  await c.end();
  const e = await etat();
  assert.deepEqual(e.cases, ['FR-2026-0101']); assert.ok(e.props[0].applied_at && e.props[0].created_case_id === 'FR-2026-0101');
});

console.log('\nCourse réelle : 2 puis 6 applications simultanées, 40 manches (autocommit, entrelacement laissé à PostgreSQL)');
for (const k of [2, 6]) {
  await test(`B${k} · ${k} propositions différentes, mêmes numéro vu : à chaque manche au plus UNE fiche, jamais de doublon de numéro, aucune écriture partielle`, async () => {
    let creations = 0, echecs23505 = 0, vides = 0;
    for (let manche = 0; manche < 40; manche++) {
      const ids = await remise(k);
      const clients = await Promise.all(ids.map(() => nouveau()));
      const res = await Promise.all(ids.map((id, i) => lancer(clients[i], requete(id, 100, i))));
      await Promise.all(clients.map((c) => c.end()));
      const e = await etat();
      assert.equal(e.cases.length, 1, `manche ${manche} : ${e.cases.length} fiche(s) créée(s)`);
      assert.equal(e.sources, 1); assert.equal(e.revues, 1);
      assert.equal(e.props.filter((x) => x.applied_at).length, 1);
      assert.equal(res.filter((x) => x.ok && x.lignes > 0).length, 1, 'exactement une application a écrit');
      assert.ok(res.filter((x) => !x.ok).every((x) => x.code === '23505'), 'les autres échouent par unicité, jamais autrement');
      creations++; echecs23505 += res.filter((x) => !x.ok).length; vides += res.filter((x) => x.ok && x.lignes === 0).length;
    }
    console.log(`      ${creations} manches · ${echecs23505} échec(s) d’unicité · ${vides} application(s) sans écriture (numéro périmé)`);
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Ancien bouton Telegram : une proposition Maintenance déjà décidée (REVIEW humain) ou neutralisée (décision machine) est INAPPLICABLE.
// Les instructions éprouvées sont extraites telles quelles de scripts/telegram-v0.mjs (clic) et scripts/neutraliser-faits-non-etayes.mjs.
// ---------------------------------------------------------------------------------------------------------------------------------
console.log('\nAncien bouton VALIDATE d’une proposition Maintenance (état réel de la base)');
const tg = readFileSync(new URL('../telegram-v0.mjs', import.meta.url), 'utf8');
const dC = tg.indexOf('const maj = await sql`\n    update state_proposals') >= 0 ? tg.indexOf('const maj = await sql`\n    update state_proposals') : tg.indexOf('const maj = await sql`\r\n    update state_proposals');
const fC = tg.indexOf('returning decision::text`;', dC) + 'returning decision::text`;'.length;
assert.ok(dC > 0 && fC > dC, 'instruction de clic Maintenance introuvable');
const fabClic = new Function('sql', 'VERS_DB', 'd', 'p', tg.slice(dC, fC).replace('const maj = await ', 'return '));
const VERS_DB = { VALIDATE: 'ACCEPT', REVIEW: 'REVIEW_REQUIRED', REJECT: 'REJECT' };
const neu = readFileSync(new URL('../neutraliser-faits-non-etayes.mjs', import.meta.url), 'utf8');
const extraire = (debut, finMarque, retire, remplace) => { const i = neu.indexOf(debut); const j = neu.indexOf(finMarque, i) + finMarque.length; assert.ok(i > 0 && j > i, 'instruction de neutralisation introuvable'); return neu.slice(i, j).replace(retire, remplace); };
const fabMachine = new Function('sql', 'MACHINE', 'RAISON', 'p', extraire("await sql`update state_proposals set decision = 'REVIEW_REQUIRED'", 'returning proposal_id`', 'await sql', 'return sql').replace(/^const o = /, ''));
const fabNote = new Function('sql', 'NOTE', 'RAISON', 'p', extraire('await sql`update state_proposals set decision_comment', 'returning proposal_id`', 'await sql', 'return sql').replace(/^const o = /, ''));
const nouvelleProp = async (decision, par, commentaire) => {
  await admin.query(`insert into articles (article_id, media, url, content_fingerprint) values ('ART-test', 'X', 'https://x.example/t', 'fp') on conflict do nothing`);
  const r = await admin.query(`insert into state_proposals (case_id, article_id, content_fingerprint, primitive_version, rationale, payload, analysis_action, facts, decision, decided_by, decided_at, decision_comment)
    values ('FR-2026-0100', 'ART-test', 'fp' || gen_random_uuid()::text, 'v', 'r', '{}'::jsonb, 'ENRICHMENT', '[{"libelle_public":"x"}]'::jsonb, $1::proposal_decision, $2, case when $1::text is null then null else '2026-11-12T11:17:02Z'::timestamptz end, $3) returning proposal_id::text pid`, [decision, par, commentaire]);
  return r.rows[0].pid;
};
const ligne = async (pid) => (await admin.query('select decision::text d, decided_by, decided_at, decision_comment c from state_proposals where proposal_id = $1::uuid', [pid])).rows[0];
const sqlPg = (strings, ...values) => { const q = capture(strings, ...values); return admin.query(q.text, q.values).then((r) => r.rows); };
await admin.query('truncate cases cascade'); await admin.query('truncate articles cascade');
await admin.query(`insert into cases (case_id, etablissement, commune, departement, type_structure, role_mis_en_cause, type_affaire, statut_judiciaire, statut_des_faits, enfants_concernes_public, fiabilite_info_10, publication_status)
                   values ('FR-2026-0100', 'base', 'Ville-Test', 'Test', 'maternelle', 'autre', 'à qualifier', 'enquête', 'allégué', 'non précisé', 0, 'candidate')`);
const RAISON = 'les faits cités viennent d’articles recommandés en bas de page, non de l’article : non étayés';
const MACHINE = 'neutralisation de faits non étayés 12/11/2026 (agent, non humain)', NOTE = '[note agent 12/11/2026]';
await test('témoin · une proposition SANS décision est bien décidée par le clic VALIDATE (le contrôle est réel)', async () => {
  const pid = await nouvelleProp(null, null, null);
  const o = await fabClic(sqlPg, VERS_DB, 'VALIDATE', { proposal_id: pid });
  assert.equal(o.length, 1); assert.equal((await ligne(pid)).d, 'ACCEPT');
});
await test('REVIEW humain (cas 5cda4e18) : le clic VALIDATE d’un ancien message ne change RIEN (0 ligne), le REVIEW reste', async () => {
  const pid = await nouvelleProp('REVIEW_REQUIRED', 'Adrien (Telegram)', 'Bouton Telegram : REVIEW');
  const avant = await ligne(pid);
  const o = await fabClic(sqlPg, VERS_DB, 'VALIDATE', { proposal_id: pid });
  const apres = await ligne(pid);
  assert.equal(o.length, 0); assert.deepEqual(apres, avant); assert.equal(apres.d, 'REVIEW_REQUIRED');
});
await test('même REVIEW + note de neutralisation : décision, auteur et date INTACTS, raison conservée, idempotent ; le clic reste sans effet', async () => {
  const pid = await nouvelleProp('REVIEW_REQUIRED', 'Adrien (Telegram)', 'Bouton Telegram : REVIEW');
  const avant = await ligne(pid);
  const n1 = await fabNote(sqlPg, NOTE, RAISON, { pid });
  const n1b = await fabNote(sqlPg, NOTE, RAISON, { pid });
  const apres = await ligne(pid);
  assert.equal(n1.length, 1); assert.equal(n1b.length, 0, 'une seule note');
  assert.equal(apres.d, avant.d); assert.equal(apres.decided_by, avant.decided_by); assert.equal(apres.decided_at.getTime(), avant.decided_at.getTime());
  assert.ok(apres.c.startsWith('Bouton Telegram : REVIEW') && apres.c.includes(RAISON));
  assert.equal((await fabClic(sqlPg, VERS_DB, 'VALIDATE', { proposal_id: pid })).length, 0);
});
await test('proposition SANS décision neutralisée (cas b205036e) : décision MACHINE « à qualifier », raison conservée, ancien bouton VALIDATE / REJECT sans effet', async () => {
  const pid = await nouvelleProp(null, null, null);
  const o = await fabMachine(sqlPg, MACHINE, RAISON, { pid });
  assert.equal(o.length, 1);
  const l = await ligne(pid);
  assert.equal(l.d, 'REVIEW_REQUIRED'); assert.equal(l.decided_by, MACHINE); assert.ok(l.c.includes(RAISON));
  assert.equal((await fabClic(sqlPg, VERS_DB, 'VALIDATE', { proposal_id: pid })).length, 0);
  assert.equal((await fabClic(sqlPg, VERS_DB, 'REJECT', { proposal_id: pid })).length, 0);
  assert.equal((await ligne(pid)).d, 'REVIEW_REQUIRED', 'la machine n’a ni approuvé ni rejeté sur le fond');
});
await test('une proposition ACCEPT n’est jamais touchée par la note', async () => {
  const pid = await nouvelleProp('ACCEPT', 'Adrien (Telegram)', 'Bouton Telegram : VALIDATE');
  assert.equal((await fabNote(sqlPg, NOTE, RAISON, { pid })).length, 0);
  assert.equal((await ligne(pid)).c, 'Bouton Telegram : VALIDATE');
});
await test('seules les propositions ACCEPT sont appliquées ou projetées (jamais REVIEW / REJECT / machine)', async () => {
  const ad = readFileSync(new URL('../appliquer-decisions.mjs', import.meta.url), 'utf8'), mv = readFileSync(new URL('../lib/matiere-validee.mjs', import.meta.url), 'utf8');
  assert.ok(ad.includes("where p.decision = 'ACCEPT'") && mv.includes("where p.decision = 'ACCEPT'"));
});

await admin.end();
console.log(ko ? `\n${ko} échec(s)` : '\nOK — la création est atomique sous concurrence (PostgreSQL réel)');
process.exit(ko ? 1 : 0);
