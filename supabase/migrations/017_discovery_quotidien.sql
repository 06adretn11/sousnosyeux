-- =====================================================================
-- 017 — Mémoire du run Discovery quotidien
--
-- Additive, idempotente.
--
-- discovery_signaux : un titre de presse n'est traité qu'UNE fois (déduplication persistante).
--   baseline  vu à l'armement (watermark) : jamais notifiable
--   ecarte    examiné, sans suite (hors périmètre, déjà connu, citation non retrouvée…)
--   attente   crédible mais non recoupé : réexaminé à chaque run jusqu'à expiration
--   propose   a donné une proposition (new_case_proposals)
--   expire    resté en attente au-delà de la fenêtre
-- Aucun contenu d'article : un titre, un média, une date (déjà publics).
--
-- discovery_etat : clé/valeur. `watermark` = date d'armement.
-- =====================================================================
create table if not exists discovery_signaux (
  cle          text primary key,
  titre        text not null,
  media        text,
  published    date,
  first_seen   timestamptz not null default now(),
  last_checked timestamptz,
  statut       text not null check (statut in ('baseline', 'ecarte', 'attente', 'propose', 'expire')),
  motif        text,
  proposal_id  uuid references new_case_proposals(proposal_id)
);
create index if not exists discovery_signaux_statut on discovery_signaux (statut);

create table if not exists discovery_etat (
  cle    text primary key,
  valeur text not null,
  maj    timestamptz not null default now()
);

alter table discovery_signaux add column if not exists urls jsonb;
