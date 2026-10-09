#!/usr/bin/env node
// =====================================================================
// scripts/appliquer-nouvelles-affaires.mjs
//
// Décision humaine Discovery → Neon. Applique les propositions que l'humain a TRANCHÉES (clic Telegram),
// une seule fois (`applied_at`), jamais une proposition sans décision.
//
//   VALIDATE / CREATE         → fiche `candidate` + sources + revue « validé » (publiable SUR GO)
//   CREATE_PENDING_EVIDENCE   → fiche `candidate` + sources + revue « à corriger » SEULE (réexamen à +30 jours) : le garde-fou de
//                               publication existant la rend NON publiable ; ce qui manque est consigné dans la revue ;
//                               la Maintenance la surveille (stock = publiées + réexamens planifiés)
//   REVIEW (= HOLD)           → AUCUNE écriture : ni fiche, ni rattachement, ni état (la proposition reste, décision consignée)
//   REJECT    (NEW / REVIEW)  → fiche `retirée` + revue « retirer » : mémoire du rejet, jamais re-proposée
//   ATTACH    (RAPPROCHER)    → sources ajoutées à l'affaire existante, rapprochement consigné ; si le signal porte un
//                               événement institutionnel (mesure d'une mairie, d'un rectorat…), il est consigné aussi
//                               (case_events, `realisation` annoncée | réalisée) — JAMAIS de changement d'état judiciaire
//   CREATE    (CRÉER)         → comme VALIDATE : nouvelle fiche candidate (y compris quand le moteur proposait un rapprochement)
//   REVIEW / REJECT (avec candidat de rattachement) → rien à écrire dans les fiches ; la décision est consignée
//
// Le CHOIX de l'humain est lu dans `action` (migration 019) ; sans cette colonne, il se déduit de la recommandation, comme avant.
// Garde-fou à l'application : un rapprochement validé n'est JAMAIS écrit s'il contredit la localisation du signal (cas
// d’une proposition déjà envoyée avant le garde-fou : signal d’un département, affaire visée d’un autre). Refus consigné, une seule alerte, aucune écriture.
//
//   node scripts/appliquer-nouvelles-affaires.mjs            # liste ce qui serait appliqué (aucune écriture)
//   node scripts/appliquer-nouvelles-affaires.mjs --ecrire   # applique
//
// Une fiche créée n'est JAMAIS publiée ici (`publication_status` ∈ candidate | retirée) : publier est un acte distinct.
// Une seule instruction SQL (CTE) par fiche : tout ou rien. Dépôt public ⇒ en CI, ni nom ni lieu dans les logs.
// =====================================================================
import { connecter } from './lib/neon.mjs';
import { rattacherSources } from './lib/rattacher-sources.mjs';
import { niveauGeo } from './lib/rapprochement-garde.mjs';
import { schemaBoucle } from './lib/telegram-clics.mjs';
import { preuvesDe } from './lib/preuves.mjs';
import { prevenir, prevenirUneFois, phrasePublication, esc } from './lib/prevenir.mjs';

const ECRIRE = process.argv.includes('--ecrire');
const CI = !!process.env.CI;
const { sql } = connecter();
const S = await schemaBoucle(sql);

const dues = S.action
  ? await sql`
      select proposal_id::text pid, recommendation, attach_case_id, decision::text decision, payload, action
        from new_case_proposals
       where decision is not null and applied_at is null order by created_at`
  : await sql`
      select proposal_id::text pid, recommendation, attach_case_id, decision::text decision, payload, null::text as action
        from new_case_proposals
       where decision is not null and applied_at is null order by created_at`;
console.log(`${dues.length} décision(s) à appliquer${ECRIRE ? '' : ' (à blanc : aucune écriture)'}`);

let creees = 0, rattachees = 0, notees = 0, refusees = 0;
for (const r of dues) {
  const p = r.payload;
  const id8 = r.pid.slice(0, 8);
  const balise = `[Discovery-auto:${id8}]`;
  // Ce que l'humain a CHOISI. Avant la migration 019 : déduit de la recommandation (comportement historique).
  const accepte = r.decision === 'ACCEPT';
  const action = accepte ? (r.action ?? (r.recommendation === 'ATTACH_EXISTING' ? 'ATTACH' : 'CREATE')) : null;
  const quoi = `${r.recommendation} · ${r.decision}${action ? ' · ' + action : ''}`;
  console.log(CI ? `· ${id8} ${quoi}` : `· ${id8} ${quoi} — ${p.commune} · ${p.etablissement || p.attach?.etablissement || 'non nommé'}`);

  // --- REVIEW = HOLD : n'écrit JAMAIS une fiche, un rattachement ou un état --------------------------------------------------
  // Avant (09/10/2026) un REVIEW sur une proposition « nouvelle affaire » CRÉAIT une candidate « à corriger » : une affaire née d'un
  // simple « je ne peux pas arbitrer » (doublon probable d'une affaire connue). Désormais : décision consignée, signal conservé
  // (proposition et signaux intacts), intervention humaine ultérieure. « Créer en attente de preuves » est une action DISTINCTE.
  if (r.decision === 'REVIEW_REQUIRED') {
    console.log('  HOLD : mis de côté, aucune fiche ni rattachement écrits');
    if (ECRIRE) await sql`update new_case_proposals set applied_at = now() where proposal_id = ${r.pid}::uuid and applied_at is null`;
    notees++;
    continue;
  }

  // --- rapprochement ---------------------------------------------------------
  // (a) RAPPROCHER ; (b) REVIEW / REJECT sur une proposition qui portait un candidat de rattachement.
  if (action === 'ATTACH' || (!accepte && (p.attach || r.recommendation === 'ATTACH_EXISTING'))) {
    if (accepte) {
      const cible = r.attach_case_id || p.attach?.case_id;
      const [kc] = await sql`select commune, departement, publication_status::text pub from cases where case_id = ${cible}`;
      if (!kc) { console.log(`  REFUS : affaire ${cible} introuvable — aucune écriture`); refusees++; continue; }
      // Garde-fou : un rapprochement n'est jamais écrit contre la localisation du signal.
      const geo = niveauGeo({ commune: p.commune, departement: p.fiche?.departement }, { commune: kc.commune, departement: kc.departement });
      if (geo.niveau === 'bloquant') {
        console.log(`  REFUS : contradiction géographique entre le signal et ${cible} — aucune écriture (à rejeter ou à créer comme nouvelle affaire)`);
        refusees++;
        if (ECRIRE) await prevenirUneFois(sql, { cle: id8, resultat: 'refus_geo', texte: `⚠️ <b>Rapprochement NON appliqué</b> (${id8})\nLe signal (${esc(p.commune)}) contredit l’affaire ${esc(cible)} (${esc(kc.commune)}) : ${esc(geo.raison)}.\nAucune écriture. Choisis REJETER, ou CRÉER si c’est une nouvelle affaire (nouveau message nécessaire).` });
        continue;
      }
      const sources = p.attach.nouvelles.map((s) => ({ url: s.url, media: s.media, d: s.d || p.date_source || null }));
      const inst = p.institutionnel && p.institutionnel.libelle_public ? p.institutionnel : null;
      if (!ECRIRE) { console.log(`  rattacherait ${sources.length} source(s) à ${cible}${inst ? ` + événement institutionnel (${inst.mesure}, ${inst.realisation})` : ''}`); continue; }
      const o = await rattacherSources(sql, {
        case_id: cible, sources, par: 'Adrien (Telegram, Discovery)', balise,
        commentaire: `RAPPROCHER — ${sources.length} article(s) rattaché(s) à cette affaire sur décision de l'éditeur. Aucun changement d'état ni d'établissement.`,
      });
      // Événement institutionnel : fait structuré, état judiciaire INCHANGÉ. Identité (affaire, libellé) : pas de doublon.
      let evInst = false;
      if (inst) {
        const [deja] = await sql`select 1 x from case_events where case_id = ${cible} and libelle_public = ${inst.libelle_public} limit 1`;
        const [src] = await sql`select source_id from sources where case_id = ${cible} and url = ${inst.url} limit 1`;
        if (deja) console.log('  = mesure institutionnelle déjà consignée : aucun doublon');
        else if (!src) console.log('  ! événement institutionnel non consigné : sa source n’est pas rattachée à l’affaire');
        else {
          if (S.realisation) await sql`insert into case_events (case_id, event_date, event_type, statut_apres, libelle_public, source_id, realisation)
                                       values (${cible}, null, ${inst.event_type}::case_event_type, null, ${inst.libelle_public}, ${src.source_id}, ${inst.realisation})`;
          else await sql`insert into case_events (case_id, event_date, event_type, statut_apres, libelle_public, source_id)
                         values (${cible}, null, ${inst.event_type}::case_event_type, null, ${inst.libelle_public}, ${src.source_id})`;
          evInst = true;
          console.log(`  + événement institutionnel (${inst.mesure}, ${inst.realisation}) — état judiciaire inchangé`);
        }
      }
      await sql`update new_case_proposals set applied_at = now() where proposal_id = ${r.pid}::uuid and applied_at is null`;
      console.log(`  ${cible} : ${o.ajoutees} source(s) ajoutée(s)`);
      await prevenir(`📌 <b>Appliqué en base</b> — rapprochement\n${esc(cible)} : ${o.ajoutees} source(s) ajoutée(s)${evInst ? `\nÉvénement institutionnel consigné : ${esc(inst.libelle_public)} (${inst.realisation})` : ''}\nÉtat judiciaire inchangé. ${phrasePublication(kc.pub)}`);
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
  // CRÉER → revue « validé » (publiable SUR GO). CRÉER EN ATTENTE DE PREUVES → revue « à corriger » SEULE : le garde-fou de
  // publication existant (publier-affaire.mjs : « aucune revue validé d'Adrien ») la rend NON publiable, et la Maintenance la
  // surveille (réexamen planifié). Aucun nouvel état : `candidate` + revue.
  const enAttente = action === 'CREATE_PENDING';
  const revue = rejet ? 'retirer' : enAttente ? 'à corriger' : 'validé';
  const pubStatus = rejet ? 'retirée' : 'candidate';
  const manques = enAttente ? preuvesDe(p, r.recommendation).manques : [];
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
  const note = enAttente
    ? `${balise} CREATE_PENDING_EVIDENCE — NON PUBLIABLE tant que les preuves manquent : ${manques.join(' ; ') || 'à confirmer'} — ${p.resume}`
    : `${balise} ${rejet ? 'REJECT' : 'VALIDATE'} — ${p.resume}`;

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
  if (cree.length) {
    creees++;
    // Mesure d'institution rapportée avec les faits (mairie qui suspend l'agent, plan d'encadrement…) : consignée avec la fiche,
    // état judiciaire INCHANGÉ. La nouvelle fiche n'a encore aucun événement : pas de doublon possible.
    const inst = !rejet && p.institutionnel?.libelle_public ? p.institutionnel : null;
    if (inst) {
      const [src] = await sql`select source_id from sources where case_id = ${cree[0].created_case_id} and url = ${inst.url} limit 1`;
      if (src) {
        if (S.realisation) await sql`insert into case_events (case_id, event_date, event_type, statut_apres, libelle_public, source_id, realisation)
                                     values (${cree[0].created_case_id}, null, ${inst.event_type}::case_event_type, null, ${inst.libelle_public}, ${src.source_id}, ${inst.realisation})`;
        else await sql`insert into case_events (case_id, event_date, event_type, statut_apres, libelle_public, source_id)
                       values (${cree[0].created_case_id}, null, ${inst.event_type}::case_event_type, null, ${inst.libelle_public}, ${src.source_id})`;
        console.log(`  + événement institutionnel (${inst.mesure}, ${inst.realisation}) — état judiciaire inchangé`);
      }
    }
    await prevenir(`📌 <b>Appliqué en base</b> — ${rejet ? 'affaire écartée (mémoire du rejet)' : enAttente ? 'nouvelle affaire créée EN ATTENTE DE PREUVES' : 'nouvelle affaire créée'}\n${esc(cree[0].created_case_id)} — ${esc(etab)} (${esc(p.commune)}), ${pubStatus}${enAttente ? `, réexamen planifié à +30 jours.\nNON PUBLIABLE — manque : ${esc(manques.join(' ; ') || 'à confirmer')}` : ''}.\n${rejet ? 'Elle ne sera pas reproposée.' : enAttente ? 'La publication reste interdite tant que ces preuves ne sont pas réunies.' : phrasePublication('candidate')}`);
  }
}
console.log(`appliqué : ${creees} fiche(s) créée(s), ${rattachees} rattachement(s), ${notees} décision(s) consignée(s) sans écriture de fiche, ${refusees} refusée(s)`);
process.exit(0);
