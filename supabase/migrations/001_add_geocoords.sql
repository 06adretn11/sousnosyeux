-- =====================================================================
-- Migration 001 — Géocodage
-- Ajoute lat/lng à cases + expose ces colonnes via la vue publique.
-- Idempotent : peut être rejouée sans casser un état existant.
-- =====================================================================

alter table cases
  add column if not exists lat numeric,
  add column if not exists lng numeric;

-- Sanity-check : si on stocke des coordonnées, qu'elles soient plausibles.
-- (NULL autorisé tant que toutes les fiches ne sont pas géocodées.)
alter table cases
  drop constraint if exists cases_lat_range,
  drop constraint if exists cases_lng_range;

alter table cases
  add constraint cases_lat_range check (lat is null or (lat between -90 and 90)),
  add constraint cases_lng_range check (lng is null or (lng between -180 and 180));

create index if not exists idx_cases_geo on cases(lat, lng);

-- Recréer la vue publique pour exposer lat/lng.
drop view if exists cases_public;

create view cases_public as
select
  case_id, etablissement, commune, departement,
  type_structure, role_mis_en_cause, type_affaire,
  statut_judiciaire, statut_des_faits, enfants_concernes_public,
  fiabilite_info_10, lat, lng
from cases
where publication_status = 'publiée'
  and fiabilite_info_10 >= 8;

grant select on cases_public to anon, authenticated;
