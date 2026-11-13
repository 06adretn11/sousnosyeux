-- =====================================================================
-- 026 — Relais social, mode REVIEW : T0 verrouillé, propositions validées par GO social, exclusions.
--
-- Additive et idempotente. Aucune instruction destructrice sur les données existantes (les triggers d'immuabilité ne s'appliquent qu'aux deux
-- tables créées ici). Le code qui les utilise se déploie AVANT elle et reste INERTE tant qu'elles sont absentes.
--
-- relais_social_config       UNE ligne (id = 1) : T0 = instant UTC de mise en service du mode REVIEW, lu sur l'horloge de la base (jamais d'une variable).
--                            Immuable : un UPDATE, un DELETE ou un TRUNCATE sont refusés par trigger. Reculer T0 « silencieusement » est donc impossible,
--                            un redéploiement ou un rejeu ne le touche pas, une correction de configuration ne rouvre jamais l'historique.
-- relais_social_propositions UNE proposition par événement (event_key unique) : textes exacts X / Facebook, empreinte de l'identité validée
--                            (affaire + événement + version approuvée + sources + texte + URLs, par canal), décision humaine (GO social), issue.
-- relais_social_exclusions   (event_key, canal) à ne JAMAIS rediffuser : publications faites hors circuit (ex. Montpellier, publiée à la main le 12/11/2026).
--                            Ce n'est PAS un journal d'envoi : aucun faux statut « publié par le relais ».
-- =====================================================================
create table if not exists relais_social_config (
  id         smallint    primary key default 1 check (id = 1),
  t0         timestamptz not null default now(),
  mode       text        not null check (mode = 'review'),
  provenance text        not null,
  created_at timestamptz not null default now()
);

create or replace function relais_social_config_immuable() returns trigger language plpgsql as $$
begin
  raise exception 'relais_social_config est immuable : T0 ne se modifie ni ne se supprime';
end $$;

do $$ begin
  create trigger relais_social_config_no_update before update or delete on relais_social_config
    for each row execute function relais_social_config_immuable();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger relais_social_config_no_truncate before truncate on relais_social_config
    for each statement execute function relais_social_config_immuable();
exception when duplicate_object then null; end $$;

create table if not exists relais_social_propositions (
  proposal_id        uuid        primary key default gen_random_uuid(),
  event_key          text        not null unique,
  case_id            text        not null,
  type_event         text        not null check (type_event in ('new_case', 'case_update')),
  identite           jsonb       not null,   -- l'ensemble validé (affaire, événement, version approuvée, sources, textes, URLs, empreintes par canal)
  texte_x            text,
  texte_facebook     text,
  canaux_proposes    text[]      not null,
  empreinte_x        text,
  empreinte_facebook text,
  expire_at          timestamptz not null,
  decision           text        check (decision in ('GO_XF', 'GO_F', 'GO_X', 'REFUS', 'EXPIREE')),
  canaux_autorises   text[],
  decided_at         timestamptz,
  resolution         text,                   -- null = en attente ; 'publie' | 'obsolete: …' | 'bloque: …' | 'refuse' | 'expiree'
  resolved_at        timestamptz,
  telegram_message_id bigint,
  notif_programme_at timestamptz,
  notif_publie_at    timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists idx_relais_social_prop_case on relais_social_propositions (case_id);

create table if not exists relais_social_exclusions (
  event_key       text        not null,
  canal           text        not null check (canal in ('x', 'facebook')),
  motif           text        not null,
  empreinte_texte text,                      -- sha256 du texte réellement publié (si retrouvé dans Buffer), pour exclure aussi un texte identique
  permalien       text,
  created_at      timestamptz not null default now(),
  primary key (event_key, canal)
);

comment on table relais_social_config is 'T0 du relais social (mode REVIEW). Une ligne, immuable (trigger).';
comment on table relais_social_propositions is 'Propositions Telegram du relais social : une par événement ; le GO social porte sur l''identité enregistrée (empreintes).';
comment on table relais_social_exclusions is 'Publications faites hors circuit : (événement, canal) jamais rediffusés. Pas un journal d''envoi.';
