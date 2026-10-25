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
import { argsPublierAffaire, motifRefus } from './lib/proposition-publication.mjs';
import { execFileSync } from 'node:child_process';

const ECRIRE = process.argv.includes('--ecrire');
const CI = !!process.env.CI;
const { sql } = connecter();
const S = await schemaBoucle(sql);

const dues = S.action
  ? await sql`
      select proposal_id::text pid, recommendation, attach_case_id, decision::text decision, payload, action, created_case_id
        from new_case_proposals
       where decision is not null and applied_at is null order by created_at`
  : await sql`
      select proposal_id::text pid, recommendation, attach_case_id, decision::text decision, payload, null::text as action, created_case_id
        from new_case_proposals
       where decision is not null and applied_at is null order by created_at`;

/**
 * GO de publication : exécuté par publier-affaire.mjs (SES contrôles, SA transaction, SA revue « GO d'Adrien ») — aucune seconde logique.
 * @returns {{etat:'ok'|'refus'|'technique', motif?:string}} refus = garde-fou DÉTERMINISTE (définitif) ; technique = réessayable au prochain passage.
 */
async function publierGo({ cid, id8, loc, go }) {
  const [kc] = await sql`select lat, lng from cases where case_id = ${cid}`;
  try {
    const args = argsPublierAffaire({ case_id: cid, id8, dbLat: kc?.lat, dbLng: kc?.lng, loc, date: new Date().toISOString().slice(0, 10), go });
    execFileSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return { etat: 'ok' };
  } catch (e) {
    const { motif, definitif } = motifRefus(e.stderr || e.message);
    return { etat: definitif ? 'refus' : 'technique', motif };
  }
}
console.log(`${dues.length} décision(s) à appliquer${ECRIRE ? '' : ' (à blanc : aucune écriture)'}`);

let creees = 0, rattachees = 0, notees = 0, refusees = 0, publiees = 0;
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

  // --- HUB (proposition « PRÉPARER LE HUB ») ----------------------------------------------------------------------------------
  // PRÉPARER = produire un dossier de revue consultable (scripts/preparer-hub.mjs : écriture → dépôt sur main → annonce avec le lien), jamais
  // publier. Un ACCEPT n'est donc PAS clos ici : la proposition reste « à appliquer » tant que le dossier n'est pas consultable (preuve, pas
  // promesse). REJECT : consigné, rien préparé. Aucune écriture dans `cases`, aucun HOLD touché.
  if (p.hub) {
    if (accepte) { console.log('  Hub accepté : préparation du brouillon confiée à preparer-hub.mjs (rien publié)'); continue; }
    console.log('  Hub refusé : rien préparé');
    if (ECRIRE) await sql`update new_case_proposals set applied_at = now(), decision_comment = left(coalesce(decision_comment, '') || ' · Hub refusé : rien préparé', 500)
                           where proposal_id = ${r.pid}::uuid and applied_at is null`;
    notees++;
    continue;
  }

  // --- FICHE INDIVIDUELLE (proposition « APPROUVER LA FICHE ») -------------------------------------------------------------------
  // APPROUVER = GO éditorial de la PAGE, jamais publication de l'affaire (elle doit déjà être publique). Écrit : les sources lues pour la
  // fiche sont rattachées à l'affaire (lib/rattacher-sources, idempotent) + une revue « [Fiche approuvée] » portant l'empreinte du dossier.
  // La page devient publique par la chaîne existante (project-evenements → QA → commit → build → vérification du site). REJECT : page écartée.
  if (p.page) {
    const cid = p.page.case_id;
    const clore = (note) => sql`update new_case_proposals set applied_at = now(), decision_comment = left(coalesce(decision_comment, '') || ${note}, 500)
                              where proposal_id = ${r.pid}::uuid and applied_at is null`;
    if (!accepte) { console.log('  fiche refusée : page écartée, affaire inchangée'); if (ECRIRE) await clore(' · fiche refusée'); notees++; continue; }
    const [kc] = await sql`select publication_status::text ps from cases where case_id = ${cid}`;
    if (kc?.ps !== 'publiée') {
      console.log('  REFUS DÉFINITIF : l’affaire n’est pas publique, aucune fiche approuvée');
      if (ECRIRE) await clore(' · approbation refusée : affaire non publique');
      notees++; continue;
    }
    const srcs = (p.page.sources_a_rattacher || []).map((s) => ({ url: s.url, media: s.media, d: s.d || null }));
    if (!ECRIRE) { console.log(`  approuverait la fiche ${cid} (empreinte ${p.page.hash}) + ${srcs.length} source(s) à rattacher`); continue; }
    const o = await rattacherSources(sql, { case_id: cid, sources: srcs, par: 'Adrien (Telegram, fiche)', balise: `[Fiche-sources:${id8}]`,
      commentaire: 'Sources lues pour la fiche individuelle, rattachées avec l’approbation de la page. Aucun changement d’état.' });
    const [dejaApp] = await sql`select 1 x from reviews where case_id = ${cid} and comment like ${'[Fiche approuvée ' + id8 + ']%'}`;
    if (!dejaApp) await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${cid}, 'Adrien (Telegram, fiche)', 'validé', ${`[Fiche approuvée ${id8}] ${cid} hash=${p.page.hash}`})`;
    await sql`update new_case_proposals set applied_at = now() where proposal_id = ${r.pid}::uuid and applied_at is null`;
    console.log(`  fiche ${cid} approuvée (${o.ajoutees ?? 0} source(s) rattachée(s))`);
    await prevenir(`📄 <b>Fiche approuvée</b> — ${esc(cid)} (${id8})
Autorisation de la PAGE enregistrée en base ; l’affaire n’est pas modifiée. Projection, QA, déploiement et vérification du site suivent ; « publiée et vérifiée » n’est annoncé qu’après lecture du site servi.`);
    publiees++;
    continue;
  }

  // --- PUBLICATION d'une candidate (proposition « PUBLIER ? ») ---------------------------------------------------------------
  // PUBLIER = GO éditorial explicite : exécuté par publier-affaire.mjs (SES contrôles, SA transaction, SA revue « GO d'Adrien ») — aucune
  // seconde logique SQL ici. REJECT = refus de publier : revue « à corriger », l'affaire est CONSERVÉE. REVIEW (HOLD) est traité plus haut.
  // La suite (projection, QA, push, build, vérification du site) est le travail du réconciliateur ; « publié » n'est annoncé que par verifier-site.
  if (p.publication) {
    const cid = p.publication.case_id;
    if (!accepte) {
      console.log('  refus de publier : revue « à corriger » consignée, affaire conservée');
      if (ECRIRE) {
        await sql`insert into reviews (case_id, reviewed_by, decision, comment)
                  values (${cid}, 'Adrien (Telegram, publication)', 'à corriger', ${`[Publication refusée ${id8}] Proposition de publication refusée par l'éditeur : la fiche reste candidate (non supprimée).`})`;
        await sql`update new_case_proposals set applied_at = now() where proposal_id = ${r.pid}::uuid and applied_at is null`;
      }
      notees++;
      continue;
    }
    if (!ECRIRE) { console.log('  publierait via publier-affaire.mjs (GO Telegram)'); continue; }
    const o = await publierGo({ cid, id8, loc: p.publication.localisation });
    if (o.etat !== 'ok') {
      console.log(`  REFUS : ${o.motif}`);
      refusees++;
      await prevenirUneFois(sql, { cle: id8, resultat: 'refus_publication', texte: `⚠️ <b>Publication NON effectuée</b> — ${esc(cid)} (${id8})\n${esc(o.motif)}\nRien n’a été publié ; l’affaire reste candidate.` });
      // Garde-fou permanent : la décision de l'éditeur reste TRACÉE (ACCEPT, decided_by/at) et le refus est consigné ; plus de nouvelle tentative.
      if (o.etat === 'refus') {
        await sql`update new_case_proposals set applied_at = now(), decision_comment = left(coalesce(decision_comment, '') || ${' · publication refusée par les contrôles : ' + o.motif}, 500)
                   where proposal_id = ${r.pid}::uuid and applied_at is null`;
        console.log('  refus DÉFINITIF consigné : aucune nouvelle tentative');
        refusees--; notees++;
      }
      continue;
    }
    await sql`update new_case_proposals set applied_at = now() where proposal_id = ${r.pid}::uuid and applied_at is null`;
    console.log('  GO publication appliqué (publier-affaire)');
    await prevenir(`🗳 <b>GO publication appliqué</b> — ${esc(cid)} (${id8})\nAutorisation enregistrée en base : l’affaire n’est PAS encore visible. Projection, QA, déploiement et vérification du site suivent ; « Publié et vérifié » ne sera annoncé qu’après lecture du site servi.`);
    publiees++;
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
  // « VALIDER ET PUBLIER » : le clic vaut confirmation ET GO publication (le message l'énonce). Même chaîne ensuite : publier-affaire
  // (ses contrôles), réconciliation, projection, QA, déploiement, vérification du site. Un échec technique ne perd rien : la fiche existe
  // (created_case_id) et la publication est REPRISE au passage suivant, jamais une seconde création ni une seconde demande.
  const direct = accepte && !rejet && !enAttente && action === 'CREATE' && !!p.publication_directe;
  if (!ECRIRE) { console.log(`  ${r.created_case_id ? 'reprendrait la publication de ' + r.created_case_id : 'créerait'} ${pubStatus} · ${sources.length} source(s) · revue ${revue}${direct ? ' + GO publication (VALIDER ET PUBLIER)' : ''}`); continue; }
  const prochain = revue === 'à corriger' ? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) : null;
  const note = enAttente
    ? `${balise} CREATE_PENDING_EVIDENCE — NON PUBLIABLE tant que les preuves manquent : ${manques.join(' ; ') || 'à confirmer'} — ${p.resume}`
    : `${balise} ${rejet ? 'REJECT' : 'VALIDATE'} — ${p.resume}`;

  const cree = r.created_case_id ? [] : await sql`
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
    update new_case_proposals set created_case_id = (select case_id from c), applied_at = case when ${direct} then null else now() end
     where proposal_id = ${r.pid}::uuid and applied_at is null
    returning created_case_id`;
  console.log(cree.length ? `  ${cree[0].created_case_id} (${pubStatus}, non publiée)` : r.created_case_id ? `  ${r.created_case_id} déjà créée : reprise de la publication` : '  rien écrit (déjà appliquée)');
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
    await prevenir(`📌 <b>Appliqué en base</b> — ${rejet ? 'affaire écartée (mémoire du rejet)' : enAttente ? 'nouvelle affaire créée EN ATTENTE DE PREUVES' : 'nouvelle affaire créée'}\n${esc(cree[0].created_case_id)} — ${esc(etab)} (${esc(p.commune)}), ${pubStatus}${enAttente ? `, réexamen planifié à +30 jours.\nNON PUBLIABLE — manque : ${esc(manques.join(' ; ') || 'à confirmer')}` : ''}.\n${rejet ? 'Elle ne sera pas reproposée.' : enAttente ? 'La publication reste interdite tant que ces preuves ne sont pas réunies.' : direct ? 'GO publication enregistré par ce même clic (VALIDER ET PUBLIER) : exécution en cours.' : phrasePublication('candidate')}`);
  }
  // --- GO publication porté par le clic unique ---------------------------------------------------------------------------------
  const cid = r.created_case_id || cree[0]?.created_case_id;
  if (direct && cid) {
    const o = await publierGo({ cid, id8, loc: p.publication_directe.localisation, go: `Telegram VALIDER ET PUBLIER ${id8}` });
    if (o.etat === 'ok') {
      await sql`update new_case_proposals set applied_at = now() where proposal_id = ${r.pid}::uuid and applied_at is null`;
      console.log('  GO publication appliqué (VALIDER ET PUBLIER)');
      await prevenir(`🗳 <b>GO publication appliqué</b> — ${esc(cid)} (${id8})\nAutorisation enregistrée en base : l’affaire n’est PAS encore visible. Projection, QA, déploiement et vérification du site suivent ; « Publié et vérifié » ne sera annoncé qu’après lecture du site servi.`);
      publiees++;
    } else if (o.etat === 'refus') {
      // La décision d'Adrien reste tracée ; la publication est bloquée par un garde-fou déterministe : correction factuelle, pas un nouveau GO.
      await sql`update new_case_proposals set applied_at = now(), decision_comment = left(coalesce(decision_comment, '') || ${' · publication refusée par les contrôles : ' + o.motif}, 500)
                 where proposal_id = ${r.pid}::uuid and applied_at is null`;
      console.log(`  REFUS DÉFINITIF : ${o.motif}`);
      await prevenirUneFois(sql, { cle: id8, resultat: 'refus_publication', texte: `⚠️ <b>Publication NON effectuée</b> — ${esc(cid)} (${id8})\n${esc(o.motif)}\nTon GO est conservé ; l’affaire reste candidate : une correction factuelle est nécessaire, pas un nouveau GO.` });
      notees++;
    } else {
      console.log(`  échec technique, réessayé au prochain passage : ${o.motif}`);
      refusees++;
    }
  }
}
console.log(`appliqué : ${creees} fiche(s) créée(s), ${rattachees} rattachement(s), ${notees} décision(s) consignée(s) sans écriture de fiche, ${refusees} refusée(s) · ${publiees} GO publication appliqué(s)`);
process.exit(0);
