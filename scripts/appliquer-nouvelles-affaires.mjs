#!/usr/bin/env node
// =====================================================================
// scripts/appliquer-nouvelles-affaires.mjs
//
// Décision humaine Discovery → Neon. Applique les propositions que l'humain a TRANCHÉES (clic Telegram),
// une seule fois (`applied_at`), jamais une proposition sans décision.
//
//   VALIDATE  (NEW / REVIEW)  → fiche `candidate` + sources + revue « validé »
//   REVIEW    (NEW / REVIEW)  → fiche `candidate` + sources + revue « à corriger » avec réexamen à +30 jours :
//                               la Maintenance la surveille (stock = publiées + réexamens planifiés) et ne
//                               re-sollicite que sur élément matériel nouveau
//   REJECT    (NEW / REVIEW)  → fiche `retirée` + revue « retirer » : mémoire du rejet, jamais re-proposée
//   ATTACH    (ATTACH)        → sources ajoutées à l'affaire existante, rapprochement consigné
//   REVIEW / REJECT (ATTACH)  → rien à écrire dans les fiches ; la décision est consignée, l'article ne revient pas
//
//   node scripts/appliquer-nouvelles-affaires.mjs            # liste ce qui serait appliqué (aucune écriture)
//   node scripts/appliquer-nouvelles-affaires.mjs --ecrire   # applique
//
// Une fiche créée n'est JAMAIS publiée ici (`publication_status` ∈ candidate | retirée) : publier est un acte distinct.
// Une seule instruction SQL (CTE) par fiche : tout ou rien. Dépôt public ⇒ en CI, ni nom ni lieu dans les logs.
// =====================================================================
import { connecter } from './lib/neon.mjs';
import { rattacherSources } from './lib/rattacher-sources.mjs';

const ECRIRE = process.argv.includes('--ecrire');
const CI = !!process.env.CI;
const { sql } = connecter();

const dues = await sql`
  select proposal_id::text pid, recommendation, attach_case_id, decision::text decision, payload
    from new_case_proposals
   where decision is not null and applied_at is null order by created_at`;
console.log(`${dues.length} décision(s) à appliquer${ECRIRE ? '' : ' (à blanc : aucune écriture)'}`);

let creees = 0, rattachees = 0, notees = 0;
for (const r of dues) {
  const p = r.payload;
  const id8 = r.pid.slice(0, 8);
  const balise = `[Discovery-auto:${id8}]`;
  const quoi = `${r.recommendation} · ${r.decision}`;
  console.log(CI ? `· ${id8} ${quoi}` : `· ${id8} ${quoi} — ${p.commune} · ${p.etablissement || p.attach?.etablissement || 'non nommé'}`);

  // --- rapprochement ---------------------------------------------------------
  if (r.recommendation === 'ATTACH_EXISTING') {
    if (r.decision === 'ACCEPT') {
      const sources = p.attach.nouvelles.map((s) => ({ url: s.url, media: s.media, d: s.d || p.date_source || null }));
      if (!ECRIRE) { console.log(`  rattacherait ${sources.length} source(s) à ${r.attach_case_id}`); continue; }
      const o = await rattacherSources(sql, {
        case_id: r.attach_case_id, sources, par: 'Adrien (Telegram, Discovery)', balise,
        commentaire: `ATTACH — ${sources.length} article(s) rapproché(s) de cette affaire (même commune, mêmes faits). Aucun changement d'état ni d'établissement.`,
      });
      await sql`update new_case_proposals set applied_at = now() where proposal_id = ${r.pid}::uuid and applied_at is null`;
      console.log(`  ${r.attach_case_id} : ${o.ajoutees} source(s) ajoutée(s)`);
      rattachees++;
    } else {
      if (ECRIRE) await sql`update new_case_proposals set applied_at = now() where proposal_id = ${r.pid}::uuid and applied_at is null`;
      notees++;
    }
    continue;
  }

  // --- nouvelle affaire ---------------------------------------------------------
  const f = p.fiche;
  const rejet = r.decision === 'REJECT';
  const revue = rejet ? 'retirer' : r.decision === 'ACCEPT' ? 'validé' : 'à corriger';
  const pubStatus = rejet ? 'retirée' : 'candidate';
  const nomme = p.etablissement_nomme !== false && p.etablissement;
  const etab = nomme ? p.etablissement : `${f.type_structure} non nommée`;
  const vus = new Set();
  const sources = [];
  for (const a of [...(p.articles || []), ...(p.evidence || [])]) {
    if (!a.url || vus.has(a.url)) continue;
    vus.add(a.url);
    sources.push({ url: a.url, media: a.media, d: a.published || p.date_source || null, p: sources.length === 0 });
  }
  if (!ECRIRE) { console.log(`  créerait ${pubStatus} · ${sources.length} source(s) · revue ${revue}`); continue; }
  const prochain = revue === 'à corriger' ? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) : null;
  const note = `${balise} ${r.decision === 'ACCEPT' ? 'VALIDATE' : r.decision === 'REJECT' ? 'REJECT' : 'REVIEW'} — ${p.resume}`;

  const cree = await sql`
    with nxt as (
      select 'FR-2026-' || lpad((coalesce(max(substring(case_id from 9)::int), 0) + 1)::text, 4, '0') id
        from cases where case_id ~ '^FR-2026-[0-9]{4}$'),
    c as (
      insert into cases (case_id, etablissement, commune, departement, type_structure, role_mis_en_cause,
                         type_affaire, statut_judiciaire, statut_des_faits, enfants_concernes_public,
                         fiabilite_info_10, publication_status, commentaire_validation,
                         crit_source_fiable, crit_article_recent, crit_etablissement_nomme, crit_statut_clair, crit_recoupement)
      select nxt.id, ${etab}, ${p.commune}, ${f.departement}, ${f.type_structure}::type_structure,
             ${f.role_mis_en_cause}::role_mis_en_cause, ${f.type_affaire}::type_affaire,
             ${f.statut_judiciaire}::statut_judiciaire, ${f.statut_des_faits}::statut_des_faits,
             ${f.enfants_concernes_public}::enfants_concernes_public,
             0, ${pubStatus}::publication_status, ${note},
             ${f.crit_source_fiable}, ${f.crit_article_recent}, ${f.crit_etablissement_nomme}, ${f.crit_statut_clair}, ${f.crit_recoupement}
        from nxt
      returning case_id),
    s as (
      insert into sources (case_id, url, media, publication_date, source_type, is_primary)
      select c.case_id, x.url, x.media, x.d::date, 'presse', x.p
        from c, jsonb_to_recordset(${JSON.stringify(sources)}::jsonb) as x(url text, media text, d text, p boolean)
      returning 1),
    rv as (
      insert into reviews (case_id, reviewed_by, decision, comment, next_review_at)
      select c.case_id, 'Adrien (Telegram, Discovery)', ${revue}::review_decision, ${note}, ${prochain}::date from c
      returning 1)
    update new_case_proposals set created_case_id = (select case_id from c), applied_at = now()
     where proposal_id = ${r.pid}::uuid and applied_at is null
    returning created_case_id`;
  console.log(cree.length ? `  ${cree[0].created_case_id} (${pubStatus}, non publiée)` : '  rien écrit (déjà appliquée)');
  creees++;
}
console.log(`appliqué : ${creees} fiche(s) créée(s), ${rattachees} rattachement(s), ${notees} décision(s) consignée(s) sans écriture de fiche`);
process.exit(0);
