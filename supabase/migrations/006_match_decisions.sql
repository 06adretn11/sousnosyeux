-- =====================================================================
-- 006 — Mémoire des arbitrages de rapprochement
--
-- Strictement additive. Une seule table, aucune colonne modifiée ailleurs.
--
-- POURQUOI : le resolver rapproche une observation du monde extérieur
-- d'une affaire connue. Quand il hésite, un humain tranche. Sans mémoire
-- de cet arbitrage, le cycle suivant repose la même question, indéfiniment
-- — et, pire, un `KEEP_SEPARATE` déjà prononcé pourrait être contredit par
-- une inférence automatique ultérieure.
--
-- CE QUE CE N'EST PAS : un système de résolution d'entités. Il n'y a ni
-- score, ni clustering, ni identité d'établissement. Une ligne = « pour
-- cette observation et cette affaire, un humain a dit oui ou non ».
--
-- L'invariant du projet reste entier :
--     CASE_IDENTITY ≠ ESTABLISHMENT_IDENTITY
-- Cette table arbitre des couples (observation, affaire). Jamais des
-- établissements entre eux.
-- =====================================================================

create table if not exists match_decisions (
  decision_id     uuid primary key default gen_random_uuid(),

  -- L'observation telle que l'observatoire l'a identifiée (empreinte d'URL).
  -- Texte libre volontairement : l'observatoire est expérimental et vit
  -- hors Neon. On garde le lien, pas une clé étrangère vers un journal
  -- qui n'est pas une table.
  observation_id  text not null,

  -- L'article du registre, quand l'observation y a été consignée.
  article_id      text references articles(article_id),

  case_id         text not null references cases(case_id) on delete cascade,

  verdict         text not null check (verdict in ('ATTACH', 'KEEP_SEPARATE')),

  decided_by      text not null,
  reason          text,
  created_at      timestamptz not null default now()
);

-- Un couple (observation, affaire) n'est arbitré qu'une fois.
create unique index if not exists uq_match_decisions_couple
  on match_decisions(observation_id, case_id);

create index if not exists idx_match_decisions_case
  on match_decisions(case_id);

-- Append-only, comme `case_events` : on corrige par une nouvelle ligne
-- sur un nouveau couple, jamais en réécrivant un arbitrage rendu.
do $$
begin
  create trigger trg_match_decisions_no_update
    before update or delete on match_decisions
    for each row execute function forbid_mutation();
exception when duplicate_object then null;
end $$;

comment on table match_decisions is
  'Arbitrage humain du rapprochement entre une observation du monde '
  'extérieur et une affaire connue. ATTACH = cette observation concerne '
  'cette affaire. KEEP_SEPARATE = elle ne la concerne pas, malgré les '
  'indices convergents. Append-only ; prioritaire sur toute inférence '
  'automatique ultérieure.';
