-- =====================================================================
-- sousnosyeux — Schéma Supabase MVP
-- Base : Postgres / Supabase (eu-west-1)
-- =====================================================================

-- ---------- ENUMS (listes fermées du brief §6) ----------

create type type_structure as enum (
  'crèche', 'maternelle', 'élémentaire', 'collège', 'lycée',
  'périscolaire', 'centre de loisirs', 'internat', 'autre'
);

create type role_mis_en_cause as enum (
  'enseignant', 'animateur périscolaire', 'ATSEM', 'direction',
  'personnel de crèche', 'parent', 'tiers', 'intervenant extérieur', 'autre'
);

create type type_affaire as enum (
  'viol', 'agression sexuelle', 'atteinte sexuelle',
  'images pédocriminelles', 'violences sexuelles', 'mixte', 'à qualifier'
);

create type statut_judiciaire as enum (
  'plainte', 'enquête', 'mise en examen', 'procès',
  'condamnation non définitive', 'condamnation définitive',
  'relaxe / non-lieu / classement', 'à qualifier'
);

create type statut_des_faits as enum (
  'allégué', 'retenu par jugement non définitif',
  'établi judiciairement', 'non établi', 'mixte'
);

create type enfants_concernes_public as enum (
  '1 enfant', 'plusieurs enfants', 'non précisé'
);

create type publication_status as enum (
  'candidate', 'validée', 'publiée', 'retirée'
);

create type source_type as enum (
  'presse', 'institution', 'justice'
);

create type review_decision as enum (
  'validé', 'à corriger', 'retirer'
);

-- ---------- TABLE cases ----------

create table cases (
  case_id text primary key,
  etablissement text not null,
  commune text not null,
  departement text not null,
  type_structure type_structure not null,
  role_mis_en_cause role_mis_en_cause not null,
  type_affaire type_affaire not null,
  statut_judiciaire statut_judiciaire not null,
  statut_des_faits statut_des_faits not null,
  enfants_concernes_public enfants_concernes_public not null,
  fiabilite_info_10 smallint not null check (fiabilite_info_10 between 0 and 10),
  publication_status publication_status not null default 'candidate',
  commentaire_validation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cases_publication on cases(publication_status);
create index idx_cases_departement on cases(departement);
create index idx_cases_fiabilite on cases(fiabilite_info_10);

-- ---------- TABLE sources ----------

create table sources (
  source_id uuid primary key default gen_random_uuid(),
  case_id text not null references cases(case_id) on delete cascade,
  url text not null,
  media text not null,
  publication_date date,
  source_type source_type not null default 'presse',
  is_primary boolean not null default false,
  access_checked_at timestamptz,
  archive_url text,
  created_at timestamptz not null default now()
);

create index idx_sources_case on sources(case_id);
create unique index idx_sources_one_primary on sources(case_id) where is_primary;

-- ---------- TABLE reviews ----------

create table reviews (
  review_id uuid primary key default gen_random_uuid(),
  case_id text not null references cases(case_id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  reviewed_by text not null,
  decision review_decision not null,
  comment text,
  next_review_at date,
  created_at timestamptz not null default now()
);

create index idx_reviews_case on reviews(case_id);
create index idx_reviews_next on reviews(next_review_at);

-- ---------- Trigger updated_at ----------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_cases_updated_at
  before update on cases
  for each row execute function set_updated_at();

-- ---------- VUE publique (carte) ----------
-- Expose uniquement les affaires publiées avec score >= 8.
-- Pas de commentaire_validation (réservé à l'édition).

create view cases_public as
select
  case_id, etablissement, commune, departement,
  type_structure, role_mis_en_cause, type_affaire,
  statut_judiciaire, statut_des_faits, enfants_concernes_public,
  fiabilite_info_10
from cases
where publication_status = 'publiée'
  and fiabilite_info_10 >= 8;

-- ---------- ROW LEVEL SECURITY ----------

alter table cases enable row level security;
alter table sources enable row level security;
alter table reviews enable row level security;

-- Lecture publique anonyme : uniquement via la vue (filtrée).
-- Aucune policy SELECT sur cases / sources / reviews pour le rôle anon.
-- L'édition se fait via service_role (côté admin) qui bypasse RLS.

-- Exposer la vue cases_public en lecture anonyme :
grant select on cases_public to anon, authenticated;
