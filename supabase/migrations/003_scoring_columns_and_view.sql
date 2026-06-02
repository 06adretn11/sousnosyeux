-- =====================================================================
-- Migration 003 — Colonnes de scoring détaillé + vue enrichie avec sources
-- Objectif : rendre le scoring visible dans le dashboard Supabase
--            + exposer lat/lng et source primaire dans la vue publique
-- =====================================================================

-- ---------- 1) Colonnes scoring détaillé ----------
-- 5 critères × 2 points = fiabilite_info_10
-- Affichés comme booléens dans le Table Editor Supabase (checkboxes)

alter table cases
  add column if not exists crit_source_fiable boolean,
  add column if not exists crit_article_recent boolean,
  add column if not exists crit_etablissement_nomme boolean,
  add column if not exists crit_statut_clair boolean,
  add column if not exists crit_recoupement boolean;

comment on column cases.crit_source_fiable is 'Critère scoring : source fiable et identifiable (2 pts)';
comment on column cases.crit_article_recent is 'Critère scoring : article récent ou mis à jour (2 pts)';
comment on column cases.crit_etablissement_nomme is 'Critère scoring : établissement explicitement nommé (2 pts)';
comment on column cases.crit_statut_clair is 'Critère scoring : statut judiciaire clair (2 pts)';
comment on column cases.crit_recoupement is 'Critère scoring : source institutionnelle citée ou recoupement possible (2 pts)';

-- ---------- 2) Trigger : auto-calcul fiabilite_info_10 ----------
-- Quand les 5 critères sont renseignés, le score se calcule automatiquement.
-- Si un critère est NULL (cas legacy), le score reste inchangé.

create or replace function compute_fiabilite()
returns trigger language plpgsql as $$
begin
  -- Ne recalculer que si au moins un critère est non-null
  if new.crit_source_fiable is not null
     or new.crit_article_recent is not null
     or new.crit_etablissement_nomme is not null
     or new.crit_statut_clair is not null
     or new.crit_recoupement is not null
  then
    new.fiabilite_info_10 :=
      coalesce(new.crit_source_fiable::int, 0) * 2 +
      coalesce(new.crit_article_recent::int, 0) * 2 +
      coalesce(new.crit_etablissement_nomme::int, 0) * 2 +
      coalesce(new.crit_statut_clair::int, 0) * 2 +
      coalesce(new.crit_recoupement::int, 0) * 2;
  end if;
  return new;
end $$;

drop trigger if exists trg_cases_compute_fiabilite on cases;
create trigger trg_cases_compute_fiabilite
  before insert or update on cases
  for each row execute function compute_fiabilite();

-- ---------- 3) Colonne adresse (optionnelle, pour le géocodage) ----------

alter table cases
  add column if not exists adresse text;

comment on column cases.adresse is 'Adresse de l''établissement si connue (aide au géocodage)';

-- ---------- 4) Vue publique enrichie ----------
-- Remplace la vue existante pour ajouter :
--   - lat/lng (déjà dans table depuis migration 001)
--   - source primaire (url, media, date) via JOIN sur sources

drop view if exists cases_public;

create view cases_public as
select
  c.case_id,
  c.etablissement,
  c.commune,
  c.departement,
  c.type_structure,
  c.role_mis_en_cause,
  c.type_affaire,
  c.statut_judiciaire,
  c.statut_des_faits,
  c.enfants_concernes_public,
  c.fiabilite_info_10,
  c.lat,
  c.lng,
  s.url   as source_url,
  s.media as source_media,
  s.publication_date as source_date
from cases c
left join sources s on s.case_id = c.case_id and s.is_primary = true
where c.publication_status = 'publiée'
  and c.fiabilite_info_10 >= 8;

grant select on cases_public to anon, authenticated;

-- ---------- 5) Table contributions (formulaire public, phase 8) ----------
-- Pré-créée pour être prête quand le formulaire sera développé.

create table if not exists contributions (
  contribution_id uuid primary key default gen_random_uuid(),
  etablissement text not null,
  commune text not null,
  departement text,
  url1 text not null,
  url2 text,
  commentaire text,
  email_contributeur text,
  statut text not null default 'a_valider' check (statut in ('a_valider', 'traitee', 'rejetee')),
  created_at timestamptz not null default now()
);

alter table contributions enable row level security;

-- Le public peut insérer mais pas lire/modifier/supprimer
create policy "contributions_insert_anon"
  on contributions for insert to anon
  with check (true);

-- Aucune policy SELECT/UPDATE/DELETE pour anon → les contributions
-- ne sont visibles que via service_role (dashboard Supabase)
