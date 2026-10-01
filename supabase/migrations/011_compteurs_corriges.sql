-- =====================================================================
-- Migration 011 — deux angles morts des compteurs par affaire
--
-- CIBLE : Neon (base `neondb`, branche `migration-clean`).
--
-- DÉFAUTS MESURÉS le 24/09/2026, migration 009 :
--
--  1. `pending_human_review_count` filtrait sur `statut_propose is not
--     null`. Une analyse conclue AMBIGUOUS — c'est-à-dire précisément le
--     cas qui RÉCLAME un humain — ne propose aucun état et n'apparaissait
--     donc dans aucun compteur d'attente. Le seul signal d'abstention du
--     système était invisible.
--
--  2. La vue exposait `last_checked_at` sans `resultat`. Sur un cycle où
--     56 affaires sont challengées et 0 article ouvert, les 56 recevaient
--     une date de vérification fraîche : couverture apparente, examen
--     nul. `case_checks.resultat` porte déjà `NON_EXAMINE` depuis la
--     migration 008 ; il suffisait de le remonter.
--
-- 100 % additive : `create or replace view`, aucune donnée touchée.
-- =====================================================================

create or replace view case_maintenance_counters as
select
  c.case_id,
  c.etablissement,
  c.commune,
  c.statut_judiciaire::text                                as statut_fiche,
  c.publication_status::text                               as publication,

  (select max(k.checked_at) from case_checks k where k.case_id = c.case_id)
                                                           as last_checked_at,
  coalesce((select sum(k.n_resultats)::int from case_checks k where k.case_id = c.case_id), 0)
                                                           as search_results_count,
  coalesce((select sum(k.n_candidats)::int from case_checks k where k.case_id = c.case_id), 0)
                                                           as new_results_count,
  coalesce((select sum(k.n_bloques)::int   from case_checks k where k.case_id = c.case_id), 0)
                                                           as source_access_blocked_count,

  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.analysis_action is not null)
                                                           as articles_examined_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.analysis_action = 'NO_CHANGE')
                                                           as no_change_count,
  (select coalesce(sum(jsonb_array_length(p.facts)), 0)::int from state_proposals p
     where p.case_id = c.case_id)                          as facts_extracted_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.analysis_action = 'ENRICHMENT')
                                                           as enrichment_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.statut_propose is not null)
                                                           as state_change_proposals_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.analysis_action = 'AMBIGUOUS')
                                                           as ambiguous_count,
  -- Inclut désormais les abstentions, qui n'ont pas d'état proposé.
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.decision is null
       and (p.statut_propose is not null or p.analysis_action = 'AMBIGUOUS'))
                                                           as pending_human_review_count,
  (select max(p.decided_at) from state_proposals p
     where p.case_id = c.case_id and p.decision = 'ACCEPT')
                                                           as last_validated_change_at,

  -- Ajoutées EN FIN de vue : `create or replace view` interdit d'insérer
  -- une colonne au milieu, et les migrations SNY s'interdisent les DROP.
  --
  -- `last_result` dit si le dernier challenge a réellement examiné
  -- quelque chose. Sans lui, 56 affaires peuvent afficher une date de
  -- vérification fraîche alors qu'aucun article n'a pu être ouvert.
  (select k.resultat from case_checks k where k.case_id = c.case_id
     order by k.checked_at desc limit 1)                   as last_result,
  (select k.engine from case_checks k where k.case_id = c.case_id
     order by k.checked_at desc limit 1)                   as last_engine
from cases c;

comment on view case_maintenance_counters is
  'Traitement reçu par chaque affaire. `last_result` = NON_EXAMINE '
  'signale une couverture apparente sans examen réel : une affaire peut '
  'avoir une date de vérification fraîche sans qu''aucun article n''ait '
  'pu être ouvert.';
