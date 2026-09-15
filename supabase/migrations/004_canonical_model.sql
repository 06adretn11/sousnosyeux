-- =====================================================================
-- Migration 004 — Modèle canonique minimal (événements, affirmations, hubs)
--
-- ⚠️ NON APPLIQUÉE. Écrite pendant la porte 2, jamais exécutée contre
--    la base de production. Rollback : 004_rollback.sql
--
-- Propriétés :
--   · 100 % ADDITIVE — aucun DROP, aucun ALTER de colonne existante,
--     aucune contrainte NOT NULL ni CHECK sur une colonne existante ;
--   · idempotente — `if not exists` partout, rejouable sans effet ;
--   · la vue `cases_public` existante n'est pas touchée : une vue
--     `cases_public_v2` est ajoutée à côté, pour permettre une bascule
--     et un retour en arrière du front sans migration inverse.
--
-- Les invariants décrits dans DATA_CONTRACT_V0.md sont volontairement
-- contrôlés HORS BASE (scripts/qa/) tant qu'ils ne sont pas vérifiés sur
-- les données réelles. Les imposer au moteur avant de les avoir observés
-- rendrait la base non écrivable.
-- =====================================================================

-- ---------- 1) ENUMS additionnels ----------

do $$ begin
  create type case_event_type as enum (
    'plainte', 'enquête', 'garde_à_vue', 'mise_en_examen', 'suspension',
    'audience', 'délibéré', 'décision', 'réponse_institutionnelle',
    'rectification', 'retrait'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type source_tier as enum ('primaire_admissible', 'secondaire', 'non_admissible');
exception when duplicate_object then null; end $$;

do $$ begin
  create type access_status as enum ('ok', 'indisponible', 'paywall', 'erreur');
exception when duplicate_object then null; end $$;

do $$ begin
  create type hub_status as enum ('draft', 'review', 'published', 'retired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type release_outcome as enum ('succes', 'echec', 'rollback');
exception when duplicate_object then null; end $$;

do $$ begin
  create type claim_sensitivity as enum ('sensible', 'contextuel');
exception when duplicate_object then null; end $$;

-- ---------- 2) Colonnes additives sur `cases` ----------

alter table cases
  add column if not exists resume_public text,
  add column if not exists verified_at date,
  add column if not exists next_review_at date,
  add column if not exists merged_into text;

comment on column cases.resume_public is
  'Résumé destiné au public. Remplace l''usage de commentaire_validation comme résumé : '
  'commentaire_validation redevient une note de revue strictement interne.';
comment on column cases.verified_at is
  'Dernière relecture humaine de la source ET de la fiche. Obligatoire pour une fiche publiée.';
comment on column cases.next_review_at is
  'Échéance de revue dérivée du statut judiciaire (EDITORIAL_CONTRACT_V0 §5.2).';
comment on column cases.merged_into is
  'Affaire survivante en cas de fusion de doublons. La ligne fusionnée passe en publication_status=retirée '
  'et n''est jamais supprimée physiquement.';

-- FK auto-référentielle ajoutée séparément (tolère les lignes existantes).
do $$ begin
  alter table cases
    add constraint cases_merged_into_fkey
    foreign key (merged_into) references cases(case_id);
exception when duplicate_object then null; end $$;

create index if not exists idx_cases_verified_at on cases(verified_at);
create index if not exists idx_cases_next_review on cases(next_review_at);
create index if not exists idx_cases_merged_into on cases(merged_into);

-- ---------- 3) Colonnes additives sur `sources` ----------

alter table sources
  add column if not exists source_tier source_tier,
  add column if not exists access_status access_status;

comment on column sources.source_tier is
  'Admissibilité éditoriale. Une source primaire doit être primaire_admissible (EDITORIAL_CONTRACT_V0 §4).';
comment on column sources.access_status is
  'Accessibilité du lien. Un lien mort est affiché comme tel, jamais masqué.';

-- ---------- 4) case_events — append-only ----------

create table if not exists case_events (
  event_id uuid primary key default gen_random_uuid(),
  case_id text not null references cases(case_id) on delete cascade,
  event_date date,
  event_type case_event_type not null,
  statut_apres statut_judiciaire,
  libelle_public text,
  source_id uuid references sources(source_id),
  recorded_at timestamptz not null default now()
);

create index if not exists idx_case_events_case on case_events(case_id, event_date);
create index if not exists idx_case_events_future on case_events(event_date)
  where event_date is not null;

comment on table case_events is
  'Append-only. Jamais UPDATE ni DELETE : une erreur se corrige par un événement de type rectification. '
  'La règle est appliquée par les triggers ci-dessous.';

-- Append-only appliqué par le moteur, pas par convention.
create or replace function forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Table % : append-only (% interdit). Corriger par un nouvel événement.',
    tg_table_name, tg_op;
end $$;

drop trigger if exists trg_case_events_no_update on case_events;
create trigger trg_case_events_no_update
  before update or delete on case_events
  for each row execute function forbid_mutation();

-- ---------- 5) claims — affirmation ↔ source ↔ passage ----------

create table if not exists claims (
  claim_id uuid primary key default gen_random_uuid(),
  case_id text not null references cases(case_id) on delete cascade,
  event_id uuid references case_events(event_id),
  claim_text text not null,
  source_id uuid references sources(source_id),
  justifying_quote text,
  sensitivity claim_sensitivity not null default 'sensible',
  verified_at date,
  created_at timestamptz not null default now()
);

create index if not exists idx_claims_case on claims(case_id);

comment on table claims is
  'Une affirmation sensible sans source_id ni justifying_quote n''est pas publiable. '
  'Empêche qu''un article de synthèse serve de justificatif à des affirmations qu''il n''énonce pas.';

-- ---------- 6) local_hubs / hub_cases ----------

create table if not exists local_hubs (
  hub_id text primary key,
  zone_label text not null,
  zone_kind text not null,
  status hub_status not null default 'draft',
  verified_at date,
  template_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hub_cases (
  hub_id text not null references local_hubs(hub_id) on delete cascade,
  case_id text not null references cases(case_id) on delete cascade,
  position smallint,
  included_at timestamptz not null default now(),
  excluded_at timestamptz,
  primary key (hub_id, case_id)
);

comment on table hub_cases is
  'Sélection EXPLICITE des affaires d''un hub. Jamais une requête géographique implicite : '
  'l''appartenance d''une affaire à un hub est une décision éditoriale tracée.';

do $$ begin
  create trigger trg_local_hubs_updated_at
    before update on local_hubs
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ---------- 7) content_versions ----------

create table if not exists content_versions (
  version_id uuid primary key default gen_random_uuid(),
  hub_id text not null references local_hubs(hub_id) on delete cascade,
  payload jsonb not null,
  payload_hash text not null,
  template_version text,
  rules_version text,
  rendered_at timestamptz not null default now()
);

create unique index if not exists idx_content_versions_hash on content_versions(hub_id, payload_hash);

comment on column content_versions.payload_hash is
  'SHA-256 du payload canonicalisé. C''est CE hash qui est approuvé, jamais « le hub ». '
  'Si le payload change d''un octet, l''approbation est caduque.';

-- ---------- 8) reviews — extension ----------
-- La table existe depuis schema.sql mais n'a jamais été écrite.

alter table reviews
  add column if not exists hub_id text references local_hubs(hub_id),
  add column if not exists payload_hash text;

-- `case_id` est NOT NULL depuis schema.sql : on ne peut pas l'assouplir
-- de façon additive. Une revue de hub s'enregistre donc avec un case_id
-- sentinelle tant que cette contrainte n'est pas revue explicitement.
comment on column reviews.hub_id is
  'Revue portant sur un hub. ⚠️ cases.case_id est NOT NULL dans schema.sql : rendre reviews '
  'polymorphe exige une migration NON additive, volontairement différée (décision requise).';
comment on column reviews.payload_hash is
  'Hash exact validé. Aucune bascule vers publication_status=publiée sans review validé sur le hash courant.';

-- ---------- 9) releases ----------

create table if not exists releases (
  release_id uuid primary key default gen_random_uuid(),
  version_id uuid not null references content_versions(version_id),
  commit_sha text,
  pr_url text,
  deployed_at timestamptz,
  live_check_at timestamptz,
  live_check_status text,
  outcome release_outcome,
  rollback_of uuid references releases(release_id),
  created_at timestamptz not null default now()
);

-- ---------- 10) Vue publique v2 (liste blanche explicite) ----------
-- L'ancienne vue `cases_public` est CONSERVÉE : la bascule du front est
-- réversible sans migration inverse.

create or replace view cases_public_v2 as
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
  c.resume_public,
  c.verified_at,
  c.lat,
  c.lng,
  s.url               as source_url,
  s.media             as source_media,
  s.publication_date  as source_date,
  s.access_status     as source_access_status,
  s.archive_url       as source_archive_url
from cases c
left join sources s on s.case_id = c.case_id and s.is_primary = true
where c.publication_status = 'publiée'
  and c.fiabilite_info_10 >= 8
  and c.merged_into is null
  and c.statut_judiciaire not in ('relaxe / non-lieu / classement', 'à qualifier');

comment on view cases_public_v2 is
  'Projection publique par liste blanche. Différences avec cases_public : exclut les fiches '
  'fusionnées (merged_into), exclut les issues favorables (relaxe/non-lieu/classement) et les '
  'statuts « à qualifier », expose resume_public et verified_at. Aucun champ interne.';

grant select on cases_public_v2 to anon, authenticated;

-- ---------- 11) Vue d'entretien (usage interne) ----------

create or replace view maintenance_queue as
select
  c.case_id,
  c.statut_judiciaire,
  c.publication_status,
  c.verified_at,
  c.next_review_at,
  (select min(e.event_date) from case_events e
    where e.case_id = c.case_id and e.event_date > current_date) as prochaine_echeance,
  (select count(*) from case_events e
    where e.case_id = c.case_id and e.event_date < current_date
      and e.event_type in ('audience', 'délibéré')) as echeances_echues
from cases c
where c.publication_status = 'publiée';

-- Vue d'exploitation interne : pas de grant à anon.

-- ---------- 12) RLS sur les nouvelles tables ----------

alter table case_events     enable row level security;
alter table claims          enable row level security;
alter table local_hubs      enable row level security;
alter table hub_cases       enable row level security;
alter table content_versions enable row level security;
alter table releases        enable row level security;

-- Aucune policy pour `anon` : lecture publique uniquement via cases_public_v2.
