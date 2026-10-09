#!/usr/bin/env node
// =====================================================================
// scripts/appliquer-decisions.mjs
//
// Applique le LOT DE VALIDATION #1 — les neuf décisions rendues par Adrien
// le 25/09/2026. Rien d'autre. Ce script n'analyse rien, n'appelle aucun
// modèle, ne publie rien : il transcrit des décisions humaines.
//
//   node scripts/appliquer-decisions.mjs --dry-run
//   node scripts/appliquer-decisions.mjs
//
// IDEMPOTENT par construction : chaque écriture est précédée d'une
// recherche de son équivalent. Un événement est identifié par
// (case_id, event_type, event_date, article_id).
//
// CE QUI N'EST PAS FAIT, ET POURQUOI
// ----------------------------------
// - `statut_des_faits` n'est jamais touché. Adrien a validé des états
//   JUDICIAIRES ; ce champ est un autre axe, qu'il n'a pas arbitré.
// - `libelle_public` ne porte jamais le nom de la personne mise en cause
//   ni de détail de gestes. La colonne s'appelle « public » : elle est
//   soumise au contrat éditorial. La preuve complète, elle, reste
//   intégralement dans `state_proposals.facts` — rien n'est supprimé de
//   la mémoire. C'est le principe PREUVE ≠ PUBLICATION.
// - FR-2026-0004 ne mute PAS son état global : le HOLD reste actif.
// =====================================================================

import { connecter } from './lib/neon.mjs';
import { writeFileSync } from 'node:fs';

const { sql } = connecter();
const DRY = process.argv.includes('--dry-run');
const PAR = 'Adrien (lot de validation #1, 25/09/2026)';
const PAR_AGENT = 'consolidation lot #1 (agent, non humain)';

const journal = [];
const dire = (s) => { journal.push(s); console.log(s); };

// --- helpers ---------------------------------------------------------
/** Insère un événement s'il n'existe pas déjà. Idempotent. */
async function evenement({ case_id, event_type, event_date, statut_apres, libelle_public, article_id }) {
  // La clé d'identité est le FAIT, pas la source. Première version keyée
  // sur article_id : elle a créé un second événement « relaxe du 16/06 »
  // sur POC-09 alors qu'un événement identique existait déjà depuis un
  // autre article. Un même fait rapporté par deux sources reste un fait.
  // (Quand la date est inconnue, on retombe sur la source, faute de mieux.)
  const deja = event_date
    ? await sql`
        select event_id from case_events
         where case_id = ${case_id} and event_type = ${event_type}::case_event_type
           and event_date = ${event_date}::date
           and statut_apres is not distinct from ${statut_apres}::statut_judiciaire`
    : await sql`
        select event_id from case_events
         where case_id = ${case_id} and event_type = ${event_type}::case_event_type
           and event_date is null and article_id is not distinct from ${article_id}`;
  if (deja.length) { dire(`      = événement déjà présent (${event_type}) ${String(deja[0].event_id).slice(0, 8)}`); return deja[0].event_id; }
  if (DRY) { dire(`      + [dry] événement ${event_type} ${event_date || 'sans date'}`); return null; }
  const [r] = await sql`
    insert into case_events (case_id, event_type, event_date, statut_apres, libelle_public, article_id)
    values (${case_id}, ${event_type}::case_event_type, ${event_date}::date,
            ${statut_apres}::statut_judiciaire, ${libelle_public}, ${article_id})
    returning event_id`;
  dire(`      + événement ${event_type} ${event_date || 'sans date'} → ${String(r.event_id).slice(0, 8)}`);
  return r.event_id;
}

/** Met l'état de la fiche à jour, seulement s'il change. Idempotent. */
async function etat(case_id, vers) {
  const [c] = await sql`select statut_judiciaire::text s from cases where case_id = ${case_id}`;
  if (c.s === vers) { dire(`      = état déjà « ${vers} »`); return false; }
  if (DRY) { dire(`      ~ [dry] état ${c.s} → ${vers}`); return true; }
  await sql`update cases set statut_judiciaire = ${vers}::statut_judiciaire, updated_at = now() where case_id = ${case_id}`;
  dire(`      ~ état ${c.s} → ${vers}`);
  return true;
}

/** Enregistre la décision humaine sur la proposition. Idempotent. */
async function decider(prefixe, verdict, commentaire, par = PAR, event_id = null) {
  const [p] = await sql`select proposal_id, decision from state_proposals where proposal_id::text like ${prefixe + '%'}`;
  if (!p) { dire(`      ! proposition ${prefixe} introuvable`); return; }
  if (p.decision) { dire(`      = décision déjà enregistrée (${p.decision})`); return; }
  if (DRY) { dire(`      + [dry] décision ${verdict} sur ${prefixe}`); return; }
  await sql`
    update state_proposals
       set decision = ${verdict}::proposal_decision, decided_by = ${par},
           decided_at = now(), decision_comment = ${commentaire},
           applied_event_id = ${event_id}
     where proposal_id = ${p.proposal_id}`;
  dire(`      + décision ${verdict} sur ${prefixe} (${par.split(' (')[0]})`);
}

/** Rattache un établissement supplémentaire. Idempotent. */
async function etablissement(case_id, nom, commune, role, article_id) {
  const deja = await sql`select 1 from case_establishments where case_id=${case_id} and etablissement=${nom} and commune=${commune}`;
  if (deja.length) { dire(`      = établissement déjà rattaché : ${nom}`); return; }
  if (DRY) { dire(`      + [dry] établissement ${role} : ${nom}`); return; }
  await sql`insert into case_establishments (case_id, etablissement, commune, role, article_id)
            values (${case_id}, ${nom}, ${commune}, ${role}, ${article_id})`;
  dire(`      + établissement ${role} : ${nom}`);
}

const art = async (p) => (await sql`select article_id from state_proposals where proposal_id::text like ${p + '%'}`)[0]?.article_id ?? null;

// =====================================================================
// APPLICATION GÉNÉRIQUE — matérialise un ACCEPT humain, sans raisonner.
//   node scripts/appliquer-decisions.mjs --generique --dry-run [--replay]
//   node scripts/appliquer-decisions.mjs --generique
// --replay (lecture seule) : rejoue le contrat sur les ACCEPT DÉJÀ appliqués et
// compare à ce qui a été écrit à la main — c'est le test du contrat.
//
// L'exécuteur ne cherche rien, n'appelle aucun modèle, ne complète rien.
// AUTO_APPLICABLE seulement si TOUT ce qui doit être écrit est porté par la
// proposition : 1 fait, event_type + resulting_state cohérents avec statut_propose,
// evidence non vide, article, fiche encore dans statut_avant, aucun HOLD.
// Le libellé public n'est PAS porté par la proposition : c'est la table de
// formulation standard du contrat éditorial (libellePublic), jamais du texte libre.
// Tout le reste → NOT_APPLICABLE_AUTOMATICALLY, aucune écriture.
if (process.argv.includes('--generique')) {
  const REPLAY = process.argv.includes('--replay');
  if (REPLAY && !DRY) { console.error('--replay exige --dry-run'); process.exit(1); }
  const { libellePublic } = await import('./lib/etat-affaire.mjs');
  const { readFileSync } = await import('node:fs');
  const holds = new Set(JSON.parse(readFileSync(new URL('../data/publication-holds.json', import.meta.url), 'utf8')).holds.map((h) => h.case_id));
  const { classer } = await import('./lib/appliquer-contrat.mjs');
  const { evenementDejaValide } = await import('./lib/routage-veille.mjs');
  const { detecterInstitutionnel } = await import('./lib/evenement-institutionnel.mjs');
  const { schemaBoucle } = await import('./lib/telegram-clics.mjs');
  const { prevenir, prevenirUneFois, phrasePublication, esc } = await import('./lib/prevenir.mjs');
  const S = await schemaBoucle(sql);
  const rows = await sql`
    select p.proposal_id, left(p.proposal_id::text, 8) k, p.case_id, p.analysis_action aa,
           p.statut_avant::text av, p.statut_propose::text ap, p.event_date::text ed, p.article_id,
           p.facts, p.applied_event_id, c.statut_judiciaire::text courant,
           p.payload->>'rattachement' rat, c.etablissement, c.commune, c.publication_status::text pub,
           (select a.publication_date::text from articles a where a.article_id = p.article_id) pd,
           e.event_type::text e_type, e.event_date::text e_date, e.statut_apres::text e_apres, e.libelle_public e_lib
      from state_proposals p
      join cases c using (case_id)
      left join case_events e on e.event_id = p.applied_event_id
     where p.decision = 'ACCEPT' and (${REPLAY} or p.applied_event_id is null)
     order by p.decided_at`;
  dire(`\n=== APPLICATION GÉNÉRIQUE${REPLAY ? ' — REPLAY (lecture seule)' : ''}${DRY ? ' (DRY-RUN)' : ''} — ${rows.length} ACCEPT${REPLAY ? '' : ' non appliqués'}\n`);

  let auto = 0, special = 0;
  for (const p of rows) {
    const f = Array.isArray(p.facts) && p.facts.length === 1 ? p.facts[0] : null;

    // --- (a) ÉVÉNEMENT INSTITUTIONNEL validé (ENRICHMENT) : réaction ou mesure d'une institution, JAMAIS une transition. ---
    // Libellé public tiré d'une table fermée ; la citation reste en mémoire privée. Identité de l'événement : (affaire, libellé)
    // — la même mesure, au même stade (annoncée / réalisée), rapportée par un second article, n'est pas un second événement.
    if (!REPLAY && p.aa === 'ENRICHMENT') {
      const inst = p.rat === 'OK' ? detecterInstitutionnel((Array.isArray(p.facts) ? p.facts : []).flatMap((x) => x?.evidence || [])) : null;
      if (inst) {
        auto++;
        dire(`  ${p.k} | ${p.case_id} | ENRICHMENT institutionnel | AUTO_APPLICABLE`);
        dire(`      écriture prévue : événement ${inst.event_type} (${inst.mesure}, ${inst.realisation}) · état judiciaire INCHANGÉ (${p.courant}) · libellé « ${inst.libelle_public} »`);
        if (!DRY) {
          const [deja] = await sql`select event_id from case_events where case_id = ${p.case_id} and libelle_public = ${inst.libelle_public} limit 1`;
          let ev = deja?.event_id ?? null;
          if (ev) dire(`      = mesure déjà consignée (${String(ev).slice(0, 8)}) : preuve rattachée, aucun doublon`);
          else {
            const [r] = S.realisation
              ? await sql`insert into case_events (case_id, event_date, event_type, statut_apres, libelle_public, article_id, realisation)
                          values (${p.case_id}, ${p.ed}, ${inst.event_type}::case_event_type, null, ${inst.libelle_public}, ${p.article_id}, ${inst.realisation}) returning event_id`
              : await sql`insert into case_events (case_id, event_date, event_type, statut_apres, libelle_public, article_id)
                          values (${p.case_id}, ${p.ed}, ${inst.event_type}::case_event_type, null, ${inst.libelle_public}, ${p.article_id}) returning event_id`;
            ev = r.event_id;
            dire(`      + événement ${inst.event_type} → ${String(ev).slice(0, 8)}${S.realisation ? '' : ' (colonne realisation absente : migration 019 non appliquée)'}`);
          }
          await sql`update state_proposals set applied_event_id = ${ev} where proposal_id = ${p.proposal_id} and decision = 'ACCEPT' and applied_event_id is null`;
          await prevenir(`📌 <b>Appliqué en base</b> — ${esc(p.etablissement)} — ${esc(p.commune)}\nÉvénement institutionnel consigné : ${esc(inst.libelle_public)} (${inst.realisation}). L’état judiciaire ne change pas (${esc(p.courant)}).\n${phrasePublication(p.pub)}`);
        }
        continue;
      }
    }

    // --- (b) FAIT DÉJÀ CONSIGNÉ : la même condamnation rapportée par un second article n'est ni un second événement ni une
    // seconde transition. La preuve (cet article) est rattachée à l'événement existant ; rien d'autre n'est écrit. Valable même
    // sous HOLD : on n'écrit rien sur `cases`. (FR-2026-0004 : fait du 15/09 validé le 25/09, deux articles « de mardi » le 09/10.)
    if (!REPLAY && p.aa === 'STATE_CHANGE' && p.ap && !p.applied_event_id) {
      const evs = await sql`select event_id, case_id, event_type::text event_type, event_date::text event_date, statut_apres::text statut_apres from case_events where case_id = ${p.case_id}`;
      const deja = evenementDejaValide(evs, p.case_id, p.ap, p.ed, p.pd);
      if (deja) {
        auto++;
        dire(`  ${p.k} | ${p.case_id} | ${p.av} → ${p.ap} (STATE_CHANGE) | FAIT_DEJA_CONSIGNE`);
        dire(`      écriture prévue : preuve rattachée à l'événement ${String(deja.event_id).slice(0, 8)} (${deja.event_type} du ${String(deja.event_date).slice(0, 10)}${deja.rapproche_par_publication ? ', rapproché par la date de publication' : ''}) · aucun nouvel événement · aucune transition · aucune écriture sur la fiche`);
        if (!DRY) {
          await sql`update state_proposals set applied_event_id = ${deja.event_id} where proposal_id = ${p.proposal_id} and decision = 'ACCEPT' and applied_event_id is null`;
          await prevenir(`📌 <b>Appliqué en base</b> — ${esc(p.etablissement)} — ${esc(p.commune)}\nCe fait (${esc(p.ap)}) était déjà consigné : la source est rattachée à l’événement existant, sans doublon ni nouvelle transition.\n${phrasePublication(p.pub)}`);
        }
        continue;
      }
    }

    const non = classer(p, holds, { replay: REPLAY }).raisons;

    const ecriture = p.ap && f
      ? `état ${p.courant} → ${p.ap} ; événement ${f.event_type} ${p.ed || 'sans date'} (${p.article_id}) ; libellé « ${libellePublic(p.ap)} »`
      : '(rien)';
    const verdict = non.length ? 'NOT_APPLICABLE_AUTOMATICALLY' : 'AUTO_APPLICABLE';
    non.length ? special++ : auto++;
    dire(`  ${p.k} | ${p.case_id} | ${p.av} → ${p.ap ?? '∅'} (${p.aa ?? 'null'}) | ${verdict}`);
    dire(`      écriture prévue : ${non.length ? 'aucune' : ecriture}`);
    if (non.length) dire(`      raison(s) : ${non.join(' ; ')}`);
    if (REPLAY && p.applied_event_id) {
      const meme = f && p.e_type === f.event_type && p.e_date === p.ed && p.e_apres === p.ap;
      dire(`      déjà écrit à la main : ${p.e_type} ${p.e_date || 'sans date'} → ${p.e_apres} · type/date/état ${meme ? 'IDENTIQUES' : 'DIFFÈRENT'} · libellé ${p.e_lib === libellePublic(p.ap) ? 'identique au standard' : 'rédigé à la main (≠ standard)'}`);
    }

    if (!non.length && !DRY) {
      await etat(p.case_id, p.ap);
      const ev = await evenement({ case_id: p.case_id, event_type: f.event_type, event_date: p.ed, statut_apres: p.ap, libelle_public: libellePublic(p.ap), article_id: p.article_id });
      await sql`update state_proposals set applied_event_id = ${ev} where proposal_id = ${p.proposal_id} and decision = 'ACCEPT' and applied_event_id is null`;
      await prevenir(`📌 <b>Appliqué en base</b> — ${esc(p.etablissement)} — ${esc(p.commune)}\nÉtat judiciaire : ${esc(p.courant)} → <b>${esc(p.ap)}</b> (événement consigné).\n${phrasePublication(p.pub)}`);
    }
    // Un ACCEPT que l'automate ne peut PAS appliquer ne doit pas rester muet : on le dit UNE fois, avec la raison.
    if (non.length && !DRY && !REPLAY) {
      await prevenirUneFois(sql, { cle: p.k, resultat: 'bloquee', texte: `⚠️ <b>Décision enregistrée mais NON appliquée</b> — ${esc(p.etablissement)} — ${esc(p.commune)}\nRaison : ${esc(non.join(' ; ').slice(0, 300))}\nAucune écriture n’a été faite : à traiter à la main (ou à revoir).` });
    }
  }
  dire(`\n  ${auto} AUTO_APPLICABLE / ${special} HUMAN_OR_SPECIAL_CASE\n`);
  process.exit(0);
}

dire(`\n=== LOT DE VALIDATION #1 — application${DRY ? ' (DRY-RUN)' : ''}\n`);

// --- 1. FR-2026-0029 Chauny — VALIDATE sans réserve -------------------
dire('  1. FR-2026-0029 — Collège Saint-Charles, Chauny');
{
  const a = await art('799854cc');
  await etat('FR-2026-0029', 'condamnation non définitive');
  const ev = await evenement({
    case_id: 'FR-2026-0029', event_type: 'décision', event_date: '2026-03-03',
    statut_apres: 'condamnation non définitive',
    libelle_public: 'Condamnation à 24 mois de prison, dont 18 avec sursis probatoire. Délai d’appel de dix jours ouvert à la date de la source.',
    article_id: a,
  });
  await decider('799854cc', 'ACCEPT', 'VALIDATE sans réserve. Changement d’état et source conservés.', PAR, ev);
}

// --- 2. FR-2026-0001 Aqueduc — VALIDATE -------------------------------
dire('  2. FR-2026-0001 — École Aqueduc, Paris 10e');
{
  const a = await art('c15fa11e');
  await etat('FR-2026-0001', 'condamnation non définitive');
  const ev = await evenement({
    case_id: 'FR-2026-0001', event_type: 'décision', event_date: '2026-07-10',
    statut_apres: 'condamnation non définitive',
    libelle_public: 'Condamnation à 18 mois de prison avec sursis par le tribunal correctionnel de Paris.',
    article_id: a,
  });
  await decider('c15fa11e', 'ACCEPT',
    'VALIDATE. Source CNEWS jugée suffisamment qualitative. PREUVE ≠ PUBLICATION : les éléments précis '
    + '(identité, description des faits) restent intégralement en mémoire dans state_proposals.facts ; '
    + 'ils ne sont pas repris dans libelle_public, soumis au contrat éditorial.', PAR, ev);
  await decider('68e1c263', 'REJECT', 'DUPLICATE — même condamnation, regroupée sous c15fa11e. '
    + 'Page CNEWS datée du 26/06 mise à jour après publication avec le verdict du 10/07.', PAR_AGENT);
  await decider('3a965a04', 'REJECT', 'SUPERSEDED — annonçait le délibéré du 10/07 ; la décision est rendue '
    + 'et portée par c15fa11e. Conservée pour la traçabilité.', PAR_AGENT);
}

// --- 3. FR-2026-0045 Saint-Valéry — VALIDATE l'état seulement ---------
dire('  3. FR-2026-0045 — Collège Jehan-le-Povremoyne, Saint-Valéry-en-Caux');
{
  const a = await art('055c8381');
  await etat('FR-2026-0045', 'condamnation non définitive');
  // Le libellé s'arrête à ce que l'evidence soutient : ni le nombre de
  // victimes ni la liste des chefs, qui ne figuraient dans aucune citation.
  const ev = await evenement({
    case_id: 'FR-2026-0045', event_type: 'décision', event_date: '2025-09-17',
    statut_apres: 'condamnation non définitive',
    libelle_public: 'Condamnation à six ans de prison ferme par le tribunal correctionnel de Rouen.',
    article_id: a,
  });
  await decider('055c8381', 'ACCEPT',
    'VALIDATE sans réserve sur le changement d’état. La mention « 24 victimes » et la liste des chefs, '
    + 'présentes dans le claim du modèle mais absentes de toute evidence, ne sont PAS persistées comme fait. '
    + 'L’evidence reste l’autorité documentaire.', PAR, ev);
}

// --- 4. POC-05 Baudin — relaxe + appel + mobilisation, distincts ------
dire('  4. POC-05 — École maternelle Alphonse-Baudin, Paris 11e');
{
  const a = await art('f11880fd');
  await etat('POC-05', 'relaxe / non-lieu / classement');
  // Trois objets distincts issus d'une même source validée.
  await evenement({
    case_id: 'POC-05', event_type: 'décision', event_date: '2026-07-07',
    statut_apres: 'relaxe / non-lieu / classement',
    libelle_public: 'Relaxe prononcée par le tribunal correctionnel des chefs d’agressions sexuelles sur mineurs.',
    article_id: a,
  });
  const evAppel = await evenement({
    case_id: 'POC-05', event_type: 'voie_de_recours', event_date: '2026-07-08',
    statut_apres: 'relaxe / non-lieu / classement',
    libelle_public: 'Appel du parquet de Paris contre la relaxe. La décision n’est pas définitive.',
    article_id: a,
  });
  await evenement({
    case_id: 'POC-05', event_type: 'mobilisation', event_date: '2026-07-09',
    statut_apres: null,
    libelle_public: 'Rassemblement d’environ une centaine de parents devant l’école pour contester la relaxe.',
    article_id: a,
  });
  await decider('f11880fd', 'ACCEPT',
    'VALIDATE : relaxe, appel = YES, finalité = NON_DEFINITIVE. L’appel est tenu pour une information '
    + 'essentielle de l’état judiciaire. La mobilisation des parents est validée séparément comme '
    + 'enrichissement de hub — elle n’est jamais mêlée à l’état judiciaire.', PAR, evAppel);
  await decider('ddc0c99a', 'REJECT', 'DUPLICATE — même relaxe, regroupée sous f11880fd (seule à porter l’appel).', PAR_AGENT);
  await decider('4b350da1', 'REJECT', 'DUPLICATE — même relaxe, regroupée sous f11880fd.', PAR_AGENT);
}

// --- 5. POC-09 Titon — relaxe déjà en place + appel -------------------
dire('  5. POC-09 — École Titon, Paris 11e');
{
  const a = await art('7cda64d3');
  await etat('POC-09', 'relaxe / non-lieu / classement'); // déjà en place
  await evenement({
    case_id: 'POC-09', event_type: 'décision', event_date: '2026-06-16',
    statut_apres: 'relaxe / non-lieu / classement',
    libelle_public: 'Relaxe prononcée par le tribunal correctionnel de Paris.',
    article_id: a,
  });
  // Date de l'appel non établie par CETTE source : elle écrit « ce
  // mercredi » sans donner de quantième. On ne la reconstruit pas.
  const evAppel = await evenement({
    case_id: 'POC-09', event_type: 'voie_de_recours', event_date: null,
    statut_apres: 'relaxe / non-lieu / classement',
    libelle_public: 'Appel du parquet de Paris contre la relaxe. La décision n’est pas définitive. '
      + 'Date de l’appel non établie par cette source (« ce mercredi »).',
    article_id: a,
  });
  await decider('7cda64d3', 'ACCEPT',
    'VALIDATE : état relaxe, appel = YES, finalité = NON_DEFINITIVE. L’existence de l’appel est conservée '
    + 'explicitement comme événement distinct.', PAR, evAppel);
}

// --- 6. FR-2026-0004 Vigée-Lebrun — fait validé, HOLD actif -----------
dire('  6. FR-2026-0004 — École Vigée-Lebrun, Paris 15e  [HOLD ACTIF]');
{
  const a = await art('87a90d03');
  // AUCUNE mutation de l'état global : c'est tout l'objet du HOLD.
  const ev = await evenement({
    case_id: 'FR-2026-0004', event_type: 'décision', event_date: '2026-09-15',
    statut_apres: 'condamnation non définitive',
    libelle_public: 'Condamnation d’un ancien animateur à cinq ans de prison, dont quatre avec sursis, '
      + 'par le tribunal correctionnel de Paris. Fait validé ; l’état global de la fiche reste inchangé '
      + 'tant que la granularité de l’affaire n’est pas tranchée.',
    article_id: a,
  });
  await decider('87a90d03', 'ACCEPT',
    'VALIDATE le fait documentaire uniquement. HOLD CASE_GRANULARITY_REVIEW maintenu actif : '
    + 'validation du fait ≠ autorisation de modifier l’état global de la fiche. Aucune mutation de cases.', PAR, ev);
}

// --- 7. FR-2026-0005 Saint-Dominique — multi-établissements ----------
dire('  7. FR-2026-0005 — Saint-Dominique / Rapp / La Rochefoucauld, Paris 7e');
{
  const a = await art('275d28c3');
  await etat('FR-2026-0005', 'mise en examen');
  const ev = await evenement({
    case_id: 'FR-2026-0005', event_type: 'mise_en_examen', event_date: '2026-05-22',
    statut_apres: 'mise en examen',
    libelle_public: 'Deux animateurs mis en examen pour des faits à caractère sexuel et placés en détention '
      + 'provisoire. L’enquête vise un service périscolaire commun à trois écoles du 7e arrondissement.',
    article_id: a,
  });
  // Une seule affaire, un seul événement, une seule preuve — trois écoles.
  await etablissement('FR-2026-0005', 'École maternelle Saint-Dominique', 'Paris 7e', 'principal', a);
  await etablissement('FR-2026-0005', 'École Rapp', 'Paris 7e', 'concerné', a);
  await etablissement('FR-2026-0005', 'École La Rochefoucauld', 'Paris 7e', 'concerné', a);
  await decider('275d28c3', 'ACCEPT',
    'VALIDATE. Une affaire peut concerner N établissements : les trois écoles sont rattachées par '
    + 'case_establishments, sans dupliquer ni l’affaire, ni l’événement, ni la preuve.', PAR, ev);
  await decider('158a9c67', 'REJECT', 'DUPLICATE — même mise en examen, regroupée sous 275d28c3 '
    + '(source parquet plutôt que récit d’enquête).', PAR_AGENT);
}

// --- 8. FR-2026-0027 Vic-la-Gardiole — enrichissement -----------------
dire('  8. FR-2026-0027 — École maternelle Les Aresquiers, Vic-la-Gardiole');
{
  const a = await art('b5e8cbbb');
  // État principal INCHANGÉ : la mise en examen est maintenue.
  const ev = await evenement({
    case_id: 'FR-2026-0027', event_type: 'mesure_procédurale', event_date: '2025-08-14',
    statut_apres: 'mise en examen',
    libelle_public: 'Remise en liberté sous contrôle judiciaire ordonnée par la cour d’appel de Montpellier. '
      + 'La mise en examen est maintenue : l’état de l’affaire ne change pas.',
    article_id: a,
  });
  await decider('b5e8cbbb', 'ACCEPT',
    'VALIDATE l’enrichissement. État principal inchangé (mise en examen). Rattachement accepté '
    + 'humainement pour CE cas : la justification (commune sans autre maternelle) ne vaut pas règle générale '
    + 'et n’est appliquée nulle part ailleurs.', PAR, ev);
}

// --- 9. FR-2026-0032 Gap — condamnation, sans les chefs --------------
dire('  9. FR-2026-0032 — Collège-lycée Saint-Joseph, Gap');
{
  const a = await art('1419e918');
  await etat('FR-2026-0032', 'condamnation non définitive'); // déjà en place
  // Le libellé porte la date et le quantum, validés. Pas les chefs : le
  // périmètre exact de la condamnation reste incertain, et l'incertitude
  // est conservée telle quelle.
  const ev = await evenement({
    case_id: 'FR-2026-0032', event_type: 'décision', event_date: '2025-11-26',
    statut_apres: 'condamnation non définitive',
    libelle_public: 'Condamnation à trois ans de prison avec sursis par le tribunal correctionnel de Gap. '
      + 'Périmètre exact des chefs retenus non établi par cette source.',
    article_id: a,
  });
  await decider('1419e918', 'ACCEPT',
    'VALIDATE : condamnation, date, quantum. Les chefs POURSUIVIS ne sont pas transformés en chefs RETENUS : '
    + 'une autre source (Le Dauphiné, payante, non lue) rapporte des relaxes partielles. L’incertitude est conservée.', PAR, ev);
}

// --- NO_CHANGE, aucune décision humaine requise ----------------------
dire('  ·  POC-07 — rattachement refusé par le modèle');
await decider('86e63d46', 'REJECT',
  'NO_CHANGE — article portant sur Baudin routé à tort vers POC-07 (Servan) par la veille. '
  + 'Rattachement refusé par le moteur. Conservé pour la traçabilité.', PAR_AGENT);

if (!DRY) {
  writeFileSync('experiments/decisions-1/journal-application.txt', journal.join('\n'));
  dire('\n  journal → experiments/decisions-1/journal-application.txt');
}
dire('');
process.exit(0);
