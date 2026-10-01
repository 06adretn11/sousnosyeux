-- =====================================================================
-- Migration 007 — `case_checks` : mémoire des vérifications de maintenance
--
-- CIBLE : Neon (base `neondb`, branche `migration-clean`).
--
-- POURQUOI UNE TABLE, ET PAS UNE TABLE EXISTANTE
--
--   · `reviews` — écartée. Son contrat est la validation éditoriale
--     HUMAINE : `reviewed_by` et `decision` (enum `review_decision`) y sont
--     NOT NULL. Un challenge machine n'a ni relecteur ni décision
--     éditoriale. L'y écrire supposerait d'inventer les deux et
--     corromprait la traçabilité des validations humaines, qui est
--     précisément ce que `reviews` doit garantir.
--
--   · `state_proposals` — écartée. `article_id` y est NOT NULL : une
--     vérification qui ne trouve rien n'a, par définition, aucun article à
--     lui rattacher. C'est exactement le cas qu'il faut mémoriser.
--
--   · `articles` — écartée. Son contrat est « registre des articles LUS ».
--     Un titre vu dans un flux RSS n'a pas été lu. Y verser les contenus
--     seulement aperçus rendrait `content_fingerprint` mensonger.
--
-- CE QUE CETTE TABLE PORTE, ET RIEN D'AUTRE : une affaire a été
-- challengée, à telle date, sur tel périmètre, ces contenus-là avaient
-- déjà été examinés, et voici ce qu'on a conclu. Elle ne porte aucun
-- workflow, aucun état métier, aucune décision.
--
-- Propriétés : 100 % additive, idempotente, rejouable.
-- =====================================================================

create table if not exists case_checks (
  check_id     uuid primary key default gen_random_uuid(),
  case_id      text not null references cases(case_id) on delete cascade,
  checked_at   timestamptz not null default now(),

  -- Le périmètre réellement interrogé. Sans lui, `NO_NEW_INFORMATION`
  -- ne veut rien dire : on ignore ce qui a été regardé.
  strategy     text not null,

  n_resultats  integer not null default 0,
  n_deja_vus   integer not null default 0,
  n_candidats  integer not null default 0,

  -- `NO_NEW_INFORMATION` signifie « aucune information nouvelle
  -- pertinente identifiée dans le périmètre `strategy` à cette date ».
  -- Jamais « rien ne s'est passé ».
  resultat     text not null
                 check (resultat in ('NO_NEW_INFORMATION', 'NOUVEAUTE_DETECTEE')),

  -- Empreintes des contenus examinés, pour que le cycle suivant ne les
  -- réexamine pas. C'est la seule chose qui rend la mémoire utile plutôt
  -- que décorative.
  vus          jsonb not null default '[]'::jsonb,

  created_at   timestamptz not null default now()
);

create index if not exists idx_case_checks_case
  on case_checks(case_id, checked_at desc);

comment on table case_checks is
  'Mémoire des vérifications de maintenance. Une ligne = une affaire '
  'challengée à une date sur un périmètre donné. `resultat` = '
  'NO_NEW_INFORMATION signifie « rien trouvé dans ce périmètre », jamais '
  '« rien ne s''est passé ».';

comment on column case_checks.vus is
  'Empreintes des contenus déjà examinés (titre normalisé + domaine). '
  'Lues au cycle suivant pour ne pas repayer l''examen.';
