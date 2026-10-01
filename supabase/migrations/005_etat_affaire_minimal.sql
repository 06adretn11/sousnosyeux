-- =====================================================================
-- Migration 005 — socle minimal de la primitive `etat-affaire`
--
-- CIBLE : Neon (base `neondb`, branche `migration-clean`).
--   Le dossier s'appelle encore `supabase/migrations/` pour la continuité
--   de numérotation (001→004 y sont). La base Supabase d'origine n'existe
--   plus — voir docs/industrialisation/PREFLIGHT_NEON.md. Renommer le
--   dossier est une dette assumée, pas l'objet de cette migration.
--
-- Propriétés :
--   · 100 % ADDITIVE — aucun DROP, aucun ALTER de colonne existante ;
--   · idempotente — `if not exists` partout, rejouable sans effet ;
--   · sous-ensemble compatible de 004 : `case_event_type` et `case_events`
--     y sont repris à l'identique, donc 004 reste applicable après 005.
--
-- Ce que 005 ajoute au-delà de 004, et pourquoi :
--   · `articles`           — le registre ART-00X. 004 ne l'avait pas :
--                            l'autopsie le listait comme artefact manquant.
--   · `state_proposals`    — la proposition produite par la primitive ET la
--                            décision humaine rendue dessus. 004 n'a rien
--                            pour ça : `reviews` porte une revue de fiche,
--                            pas l'arbitrage d'un changement d'état sourcé.
--
-- Ce que 005 n'ajoute PAS, volontairement : `claims`, `local_hubs`,
-- `hub_cases`, `content_versions`, `releases`. Ils appartiennent à 004 et
-- ne servent pas la démonstration verticale.
-- =====================================================================

-- ---------- 1) Type d'événement (identique à 004) ----------

do $$ begin
  create type case_event_type as enum (
    'plainte', 'enquête', 'garde_à_vue', 'mise_en_examen', 'suspension',
    'audience', 'délibéré', 'décision', 'réponse_institutionnelle',
    'rectification', 'retrait'
  );
exception when duplicate_object then null; end $$;


-- ---------- 2) articles — registre des sources lues ----------

create table if not exists articles (
  article_id            text primary key,
  media                 text not null,
  publication_date      date,
  url                   text,
  url_exposante         boolean not null default false,
  source_ref            jsonb,
  content_fingerprint   text not null,
  eligibility_status    text not null default 'LU_PAR_OUTILLAGE',
  reviewed_by           text,
  reviewed_at           timestamptz,
  supported_claims      jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now()
);

comment on table articles is
  'Registre des articles lus. `url` peut être NULL quand le slug énonce une '
  'information que le contrat éditorial interdit de publier : `url_exposante` '
  'vaut alors true et `source_ref` porte de quoi retrouver la source.';

comment on column articles.content_fingerprint is
  'Empreinte du corps au moment de la lecture. Une divergence signale que '
  'l''article a changé depuis : la proposition qui en découle est à rejouer.';


-- ---------- 3) case_events — état factuel, append-only ----------

-- Repris de 004, à une colonne près : `article_id`. 004 ne connaissait que
-- `source_id` (FK vers `sources`), or un article du registre n'est pas
-- toujours une source enregistrée de l'affaire. Sans ce lien, un événement
-- issu de la primitive serait « non sourcé » au sens de R7. La colonne est
-- nullable et additive : 004 reste applicable après 005 (`if not exists`).
create table if not exists case_events (
  event_id      uuid primary key default gen_random_uuid(),
  case_id       text not null references cases(case_id) on delete cascade,
  event_date    date,
  event_type    case_event_type not null,
  statut_apres  statut_judiciaire,
  libelle_public text,
  source_id     uuid references sources(source_id),
  article_id    text references articles(article_id),
  recorded_at   timestamptz not null default now()
);

-- Si 004 a été appliquée avant 005, la colonne n'existe pas : on l'ajoute.
alter table case_events add column if not exists article_id text;

do $$ begin
  alter table case_events
    add constraint case_events_article_id_fkey
    foreign key (article_id) references articles(article_id);
exception when duplicate_object then null; end $$;

-- Un événement doit être rattachable à une source, d'une façon ou d'une autre.
do $$ begin
  alter table case_events
    add constraint case_events_sourced
    check (source_id is not null or article_id is not null);
exception when duplicate_object then null; end $$;

create index if not exists idx_case_events_case on case_events(case_id, event_date);

-- Append-only : un fait consigné ne se réécrit pas. On le corrige en
-- consignant un fait postérieur.
create or replace function forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Table % : append-only (% interdit). Corriger par un nouvel événement.',
    tg_table_name, tg_op;
end $$;

do $$ begin
  create trigger trg_case_events_no_update
    before update or delete on case_events
    for each row execute function forbid_mutation();
exception when duplicate_object then null; end $$;


-- ---------- 4) state_proposals — proposition sourcée et décision rendue ----------

do $$ begin
  create type proposal_decision as enum ('ACCEPT', 'REJECT', 'REVIEW_REQUIRED');
exception when duplicate_object then null; end $$;

create table if not exists state_proposals (
  proposal_id         uuid primary key default gen_random_uuid(),

  -- Identité naturelle : une affaire, un article, une empreinte de contenu,
  -- une version de primitive. C'est elle qui porte l'idempotence.
  case_id             text not null references cases(case_id) on delete cascade,
  article_id          text not null references articles(article_id),
  content_fingerprint text not null,
  primitive_version   text not null,

  -- Ce que la primitive a produit (le fait proposé, jamais une présentation).
  statut_avant        statut_judiciaire,
  statut_propose      statut_judiciaire,
  event_date          date,
  source_date         date,
  transition          text,
  finalite            text check (finalite in ('definitive','non_definitive','inconnue')),
  rationale           text not null,
  surveillance        jsonb not null default '[]'::jsonb,
  inconnues           jsonb not null default '[]'::jsonb,
  payload             jsonb not null,
  requires_human_review boolean not null default true,

  -- Ce que l'humain a décidé. NULL tant que rien n'est décidé.
  decision            proposal_decision,
  decided_by          text,
  decided_at          timestamptz,
  decision_comment    text,

  -- Trace de l'effet : l'événement écrit lorsque la décision est ACCEPT.
  applied_event_id    uuid references case_events(event_id),

  created_at          timestamptz not null default now()
);

-- Idempotence : rejouer la même primitive sur le même article et la même
-- affaire ne crée pas une seconde proposition.
create unique index if not exists uq_state_proposals_identite
  on state_proposals(case_id, article_id, content_fingerprint, primitive_version);

create index if not exists idx_state_proposals_a_decider
  on state_proposals(case_id) where decision is null;

comment on table state_proposals is
  'Proposition de changement d''état produite par la primitive `etat-affaire`, '
  'et décision humaine rendue dessus. Une ligne = un couple (affaire, article) '
  'pour une empreinte de contenu et une version de primitive données.';

comment on column state_proposals.finalite is
  'FAIT judiciaire : la décision est-elle définitive. Ce n''est PAS une règle '
  'd''affichage — le retrait d''une fiche est décidé ailleurs, par le contrat '
  'éditorial, à partir de ce fait.';


-- ---------- 5) Vue de relecture ----------

-- L'état courant relu : ce que dit la fiche, et ce que dit le dernier
-- événement consigné. Les deux sont montrés séparément — R7 contrôle leur
-- divergence, cette vue ne la masque pas.
create or replace view case_state_current as
select
  c.case_id,
  c.etablissement,
  c.commune,
  c.statut_judiciaire                     as statut_fiche,
  e.statut_apres                          as statut_dernier_evenement,
  e.event_date                            as date_dernier_evenement,
  e.event_type                            as type_dernier_evenement,
  e.libelle_public                        as libelle_dernier_evenement,
  e.recorded_at                           as consigne_le,
  e.article_id                            as source_dernier_evenement,
  (select count(*) from case_events x where x.case_id = c.case_id)          as nb_evenements,
  (select count(*) from state_proposals p
     where p.case_id = c.case_id and p.decision is null)                    as propositions_en_attente
from cases c
left join lateral (
  select * from case_events ce
  where ce.case_id = c.case_id
  order by ce.event_date desc nulls last, ce.recorded_at desc
  limit 1
) e on true;

comment on view case_state_current is
  'Relecture de l''état d''une affaire. `statut_fiche` et '
  '`statut_dernier_evenement` sont exposés côte à côte : leur divergence est '
  'une information, pas un défaut à masquer.';
