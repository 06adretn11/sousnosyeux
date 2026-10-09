-- =====================================================================
-- 019 — Fermer la boucle Discovery / Maintenance / Décision / Mémoire
--
-- Additive et idempotente. Aucune instruction destructrice. Le code qui l'utilise se déploie AVANT elle et
-- détecte sa présence (scripts/lib/telegram-clics.mjs : schemaBoucle) : tant qu'elle n'est pas appliquée, tout
-- fonctionne comme avant, sans journal.
--
-- 1. telegram_journal — une ligne par PASSAGE de réception et par CLIC (jamais de contenu éditorial, jamais de secret).
--    Raison : 43 passages CI ont répondu « 0 clic traité » sans qu'on puisse dire pourquoi (rien reçu ? autre bot ?
--    clic perdu ?). Les logs d'un dépôt public ne montrent que des compteurs ; ce journal, lui, est privé.
-- 2. new_case_proposals.action — CE QUE l'humain a choisi (ATTACH = rapprocher, CREATE = nouvelle affaire).
--    Avant, la recommandation du moteur tenait lieu de choix : impossible d'offrir « rapprocher OU créer » sur un même
--    message sans écrire la mauvaise chose.
-- 3. case_events.realisation — « annoncée » ou « réalisée », pour les événements institutionnels (mesure annoncée ≠
--    mesure mise en œuvre). NULL pour tout événement judiciaire. case_events reste append-only : colonne nullable, pas de UPDATE.
-- =====================================================================

create table if not exists telegram_journal (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  kind        text not null check (kind in ('passage', 'clic', 'clic_echec', 'clic_ignore', 'test_envoye', 'test_recu', 'application')),
  update_id   bigint,
  cle         text,
  action      text,
  resultat    text,
  details     jsonb
);
create index if not exists idx_telegram_journal_at on telegram_journal (at desc);
create index if not exists idx_telegram_journal_update on telegram_journal (update_id) where update_id is not null;

comment on table telegram_journal is
  'Trace technique de la réception des clics Telegram (passages, clics, échecs, tests). Aucun contenu éditorial : '
  'ids techniques et issue seulement. Sert à répondre à « mon clic a-t-il été reçu, enregistré, appliqué ? ».';

alter table new_case_proposals add column if not exists action text;
do $$ begin
  alter table new_case_proposals add constraint new_case_proposals_action_check check (action is null or action in ('ATTACH', 'CREATE'));
exception when duplicate_object then null; end $$;
comment on column new_case_proposals.action is
  'Choix humain sur une décision ACCEPT : ATTACH (rapprocher des sources d''une affaire existante) ou CREATE (nouvelle affaire). '
  'NULL pour REVIEW / REJECT et pour les décisions antérieures à 019 (déduit alors de la recommandation).';

alter table case_events add column if not exists realisation text;
do $$ begin
  alter table case_events add constraint case_events_realisation_check check (realisation is null or realisation in ('annoncée', 'réalisée'));
exception when duplicate_object then null; end $$;
comment on column case_events.realisation is
  'Événements institutionnels seulement : « annoncée » (intention, plan, promesse) ou « réalisée » (mesure effectivement mise en œuvre, '
  'établie par une citation). NULL pour un événement judiciaire.';
