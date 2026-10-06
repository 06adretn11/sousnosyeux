-- =====================================================================
-- 016 — Propositions de NOUVELLE affaire / de RAPPROCHEMENT (Discovery quotidien)
--
-- Additive, idempotente. Une table, aucune colonne ajoutée ailleurs.
--
-- POURQUOI UNE TABLE À PART. `state_proposals` porte le changement d'état
-- d'une affaire CONNUE : sa clé étrangère `case_id` interdit de proposer
-- une affaire qui n'existe pas encore. Une proposition de création n'a,
-- par définition, pas de case_id : elle le reçoit au clic VALIDATE.
--
-- `decision` réutilise `proposal_decision` : VALIDATE / ATTACH (Telegram) → ACCEPT,
-- REVIEW → REVIEW_REQUIRED, REJECT → REJECT. Le clic n'écrit QUE la décision ;
-- la fiche est créée (ou les sources rattachées) plus tard, par
-- scripts/appliquer-nouvelles-affaires.mjs, comme pour state_proposals.
-- La fiche créée est toujours `publication_status = 'candidate'` : créer n'est pas publier.
--
-- recommendation :
--   NEW_CASE_CANDIDATE  une affaire absente de la base          → boutons VALIDATE / REVIEW / REJECT
--   REVIEW              signal ambigu avec une affaire connue     → boutons VALIDATE / REVIEW / REJECT
--   ATTACH_EXISTING     nouveau signal sur une affaire connue     → boutons ATTACH / REVIEW / REJECT
--                       (attach_case_id = l'affaire visée)
-- =====================================================================
create table if not exists new_case_proposals (
  proposal_id      uuid primary key default gen_random_uuid(),
  -- Une même école ne se propose qu'une fois (commune|établissement|rôle, normalisés).
  dedup_key        text not null unique,
  recommendation   text not null check (recommendation in ('NEW_CASE_CANDIDATE', 'REVIEW', 'ATTACH_EXISTING')),
  attach_case_id   text references cases(case_id),
  payload          jsonb not null,
  decision         proposal_decision,
  decided_by       text,
  decided_at       timestamptz,
  decision_comment text,
  created_case_id  text references cases(case_id),
  applied_at       timestamptz,
  created_at       timestamptz not null default now()
);

comment on table new_case_proposals is
  'Candidats à la création d''une affaire (ou à un rattachement), issus de la découverte presse. '
  'applied_at reste NULL tant que la décision humaine n''a pas été appliquée à Neon.';
