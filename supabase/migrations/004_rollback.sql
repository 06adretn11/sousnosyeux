-- =====================================================================
-- Rollback de la migration 004.
--
-- ⚠️ NON APPLIQUÉ. Fourni pour que 004 ne soit jamais un aller simple.
--
-- Ordre : dépendances d'abord (releases → content_versions → hub_cases
-- → local_hubs), puis claims → case_events, puis colonnes, puis types.
--
-- ⛔ DESTRUCTIF si 004 a été appliquée ET que des données ont été
--    écrites dans les nouvelles tables. À n'exécuter que sur une base
--    où 004 vient d'être appliquée et où rien n'a encore été saisi.
-- =====================================================================

-- ---------- Vues ----------
drop view if exists maintenance_queue;
drop view if exists cases_public_v2;
-- `cases_public` (v1) n'a jamais été touchée par 004 : rien à restaurer.

-- ---------- Tables (ordre inverse des dépendances) ----------
drop table if exists releases;
drop table if exists content_versions;
drop table if exists hub_cases;
drop table if exists local_hubs cascade;   -- cascade : FK depuis reviews.hub_id
drop table if exists claims;

drop trigger if exists trg_case_events_no_update on case_events;
drop table if exists case_events;
drop function if exists forbid_mutation();

-- ---------- Colonnes additives ----------
alter table reviews
  drop column if exists hub_id,
  drop column if exists payload_hash;

alter table sources
  drop column if exists source_tier,
  drop column if exists access_status;

alter table cases
  drop constraint if exists cases_merged_into_fkey;

drop index if exists idx_cases_verified_at;
drop index if exists idx_cases_next_review;
drop index if exists idx_cases_merged_into;

-- ⚠️ `resume_public` peut contenir du contenu saisi manuellement.
--    Décommenter uniquement après export.
-- alter table cases drop column if exists resume_public;
alter table cases
  drop column if exists verified_at,
  drop column if exists next_review_at,
  drop column if exists merged_into;

-- ---------- Types ----------
drop type if exists claim_sensitivity;
drop type if exists release_outcome;
drop type if exists hub_status;
drop type if exists access_status;
drop type if exists source_tier;
drop type if exists case_event_type;
