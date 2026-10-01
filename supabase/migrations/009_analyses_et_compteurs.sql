-- =====================================================================
-- Migration 009 — mémoire des ANALYSES et compteurs par affaire
--
-- CIBLE : Neon (base `neondb`, branche `migration-clean`).
--
-- ---------------------------------------------------------------------
-- 1) POURQUOI PAS UNE NOUVELLE TABLE « analyses »
-- ---------------------------------------------------------------------
-- Le mandat distingue SEARCH_RESULT / ARTICLE / FACT / PROPOSAL /
-- CASE_STATE. Quatre de ces cinq objets existent déjà :
--   SEARCH_RESULT -> `case_checks.vus`  (migrations 007/008)
--   ARTICLE       -> `articles`
--   PROPOSAL      -> `state_proposals`
--   CASE_STATE    -> `cases` + `case_events`
--
-- Reste FACT. Or l'identité naturelle d'une analyse est exactement celle
-- que `state_proposals` porte déjà :
--     (case_id, article_id, content_fingerprint, primitive_version)
-- — une affaire, un article, une version de contenu, une version de
-- moteur. Créer une seconde table à la même clé produirait deux files
-- concurrentes et deux vérités.
--
-- `statut_propose` y est DÉJÀ nullable : la table sait donc représenter
-- « cet article a été lu et ne change rien ». Ce que 009 ajoute, c'est
-- de le rendre EXPLICITE et interrogeable, au lieu de le déduire d'un
-- NULL.
--
-- Extension de contrat assumée, pas détournement : la table devient
-- « analyse d'un article pour une affaire, et décision humaine rendue
-- dessus ». La clé d'identité ne bouge pas.
--
-- ---------------------------------------------------------------------
-- 2) POURQUOI `engine` EST INDISPENSABLE
-- ---------------------------------------------------------------------
-- `primitive_version` ne dit que « 0.1.0 ». Mesuré le 24/09/2026 sur un
-- gold set de prose réelle : le moteur déterministe rend 4 bonnes actions
-- sur 12, un petit modèle en rend 9. Le jour où le moteur change, il faut
-- pouvoir révoquer les analyses produites par l'ancien — donc savoir
-- LEQUEL les a produites. Sans cette colonne, la mémoire n'est pas
-- révocable et une mauvaise analyse est définitive.
--
-- 100 % additive, idempotente, rejouable. Aucun DROP de donnée.
-- =====================================================================

-- ---------- 1) Ce qui a produit l'analyse ----------

alter table state_proposals add column if not exists engine text;

comment on column state_proposals.engine is
  'Moteur ayant produit l''analyse : « rules » pour le déterministe, '
  'sinon l''identifiant du modèle (ex. « openai/gpt-5-nano »). Couplé à '
  '`primitive_version`, il rend la mémoire d''analyse révocable.';


-- ---------- 2) Ce que l'analyse a conclu ----------

alter table state_proposals add column if not exists analysis_action text;

do $$ begin
  alter table state_proposals
    add constraint state_proposals_analysis_action_check
    check (analysis_action is null or analysis_action in
      ('NO_CHANGE', 'ENRICHMENT', 'STATE_CHANGE', 'AMBIGUOUS', 'SOURCE_ACCESS_BLOCKED'));
exception when duplicate_object then null; end $$;

comment on column state_proposals.analysis_action is
  'Conclusion de l''analyse. NO_CHANGE signifie « article lu, il '
  'n''apporte rien à cette affaire » — un fait négatif qu''il faut '
  'mémoriser pour ne pas le repayer, pas une absence de ligne.';


-- ---------- 3) Les faits extraits ----------

alter table state_proposals add column if not exists facts jsonb not null default '[]'::jsonb;

comment on column state_proposals.facts is
  'Faits structurés extraits de l''article (type, date, citation '
  'littérale). Distincts de la proposition : un fait peut être vrai sans '
  'entraîner de changement d''état. Aucun wording public ici.';


-- ---------- 4) Compteurs par affaire ----------

-- Ni dashboard ni UI : une vue lisible en SQL, qui répond à
-- « cette affaire reçoit-elle le traitement attendu ? ».
create or replace view case_maintenance_counters as
select
  c.case_id,
  c.etablissement,
  c.commune,
  c.statut_judiciaire::text                                as statut_fiche,
  c.publication_status::text                               as publication,

  (select max(k.checked_at) from case_checks k where k.case_id = c.case_id)
                                                           as last_checked_at,
  coalesce((select sum(k.n_resultats)::int from case_checks k where k.case_id = c.case_id), 0)
                                                           as search_results_count,
  coalesce((select sum(k.n_candidats)::int from case_checks k where k.case_id = c.case_id), 0)
                                                           as new_results_count,
  coalesce((select sum(k.n_bloques)::int   from case_checks k where k.case_id = c.case_id), 0)
                                                           as source_access_blocked_count,

  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.analysis_action is not null)
                                                           as articles_examined_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.analysis_action = 'NO_CHANGE')
                                                           as no_change_count,
  (select coalesce(sum(jsonb_array_length(p.facts)), 0)::int from state_proposals p
     where p.case_id = c.case_id)                          as facts_extracted_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.analysis_action = 'ENRICHMENT')
                                                           as enrichment_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.statut_propose is not null)
                                                           as state_change_proposals_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.analysis_action = 'AMBIGUOUS')
                                                           as ambiguous_count,
  (select count(*)::int from state_proposals p
     where p.case_id = c.case_id and p.decision is null and p.statut_propose is not null)
                                                           as pending_human_review_count,
  (select max(p.decided_at) from state_proposals p
     where p.case_id = c.case_id and p.decision = 'ACCEPT')
                                                           as last_validated_change_at
from cases c;

comment on view case_maintenance_counters is
  'Traitement reçu par chaque affaire. Sert à détecter : affaire jamais '
  'challengée (last_checked_at nul), pipeline bloqué '
  '(source_access_blocked_count élevé et articles_examined_count nul), '
  'bruit anormal (search_results_count élevé sans examen), backlog non '
  'examiné (new_results_count >> articles_examined_count).';
