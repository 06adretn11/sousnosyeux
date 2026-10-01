-- =====================================================================
-- 014 — Ce que le premier lot de décisions humaines a cassé dans le modèle.
--
-- Additive et idempotente. Trois manques, chacun démontré par UNE décision
-- réellement rendue par Adrien le 25/09/2026 — aucun ajout par anticipation.
--
-- 1. case_event_type ne savait pas dire « appel ».
--    POC-05 et POC-09 : Adrien a validé `appel = YES` comme information
--    ESSENTIELLE de l'état judiciaire. Aucune valeur de l'énumération ne
--    l'exprimait. `décision` aurait été un contresens : une voie de recours
--    n'est pas un jugement, et la confondre avec un jugement est exactement
--    l'erreur que le projet refuse.
--
-- 2. case_event_type ne savait pas dire « remise en liberté ».
--    FR-2026-0027 : événement procédural NON TERMINAL, la mise en examen
--    étant maintenue. Le classer en `décision` aurait laissé croire à une
--    issue. `mesure_procédurale` porte l'acte sans préjuger du fond.
--
-- 3. case_event_type ne savait pas dire « mobilisation ».
--    POC-05 : Adrien a validé la mobilisation des parents comme
--    enrichissement de hub, explicitement DISTINCT de l'état judiciaire.
--    `réponse_institutionnelle` ne convient pas : des parents ne sont pas
--    une institution.
--
-- 4. Une affaire ne pouvait concerner qu'UN établissement.
--    FR-2026-0005 : la source décrit un service périscolaire accueillant
--    les enfants de Saint-Dominique, Rapp et La Rochefoucauld. Décision
--    d'Adrien : chaque école touchée doit pouvoir l'afficher. Créer trois
--    affaires aurait triplé la preuve et l'événement pour un seul fait.
--    `case_establishments` porte la relation sans toucher à `cases`.
--
-- Ce que cette migration ne fait PAS : aucune règle de publication, aucune
-- reprise des affaires historiques, aucune colonne d'état supplémentaire.
-- =====================================================================

-- --- 1/2/3 — valeurs d'événement manquantes -------------------------
-- ADD VALUE IF NOT EXISTS est idempotent et ne réécrit pas le type.
alter type case_event_type add value if not exists 'voie_de_recours';
alter type case_event_type add value if not exists 'mesure_procédurale';
alter type case_event_type add value if not exists 'mobilisation';

-- --- 4 — une affaire, N établissements ------------------------------
create table if not exists case_establishments (
  case_id       text        not null references cases(case_id) on delete cascade,
  etablissement text        not null,
  commune       text        not null,
  -- `principal` = l'établissement porté par `cases.etablissement`, conservé
  -- tel quel pour ne rien casser en aval. `concerné` = les autres écoles
  -- que la source rattache au même fait.
  role          text        not null default 'concerné'
                check (role in ('principal', 'concerné')),
  -- D'où vient le rattachement : jamais une relation sans sa preuve.
  article_id    text        references articles(article_id),
  recorded_at   timestamptz not null default now(),
  primary key (case_id, etablissement, commune)
);

comment on table case_establishments is
  'Établissements concernés par une affaire lorsqu''elle en touche plusieurs. '
  'Posée pour FR-2026-0005 (service périscolaire commun à trois écoles du 7e). '
  'N''est PAS peuplée pour les affaires mono-établissement : l''absence de '
  'ligne signifie « cases.etablissement fait foi », pas « non renseigné ».';
