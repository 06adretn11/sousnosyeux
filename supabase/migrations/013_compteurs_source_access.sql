-- =====================================================================
-- Migration 013 — compteurs d'accès aux sources, par affaire
--
-- CIBLE : Neon (base `neondb`, branche `migration-clean`).
--
-- POURQUOI. Les compteurs existants disaient combien de résultats une
-- affaire avait reçus et combien d'articles avaient été analysés, mais
-- rien sur l'étape intermédiaire — le passage du résultat de veille au
-- document réellement lisible. Or c'est là qu'est la perte dominante :
-- mesuré le 25/09/2026, 126 documents du backlog sur 126 arrivent avec
-- une URL Google News opaque, et seuls 25 % relèvent d'un éditeur
-- directement résolvable.
--
-- Sans ces colonnes, une affaire « avec beaucoup de résultats et aucun
-- document » ne se distingue pas d'une affaire « sans résultat ». Les
-- deux sont aveugles, mais pour des raisons opposées.
--
-- `source_resolutions.case_ids` est un tableau JSON : un document vaut
-- pour toutes les affaires qu'il concerne, sans être résolu plusieurs
-- fois.
--
-- Colonnes ajoutées EN FIN de vue : `create or replace view` interdit
-- d'insérer au milieu, et les migrations SNY s'interdisent les DROP.
-- 100 % additive.
-- =====================================================================

create or replace view case_source_access as
select
  c.case_id,
  c.etablissement,
  c.commune,
  c.statut_judiciaire::text  as statut_fiche,
  c.publication_status::text as publication,

  -- Résultats détectés par la veille (toutes campagnes cumulées).
  coalesce((select sum(k.n_resultats)::int from case_checks k where k.case_id = c.case_id), 0)
                                                     as results_detected,

  (select count(*)::int from source_resolutions s
     where s.case_ids ? c.case_id)                   as documents_au_backlog,
  (select count(*)::int from source_resolutions s
     where s.case_ids ? c.case_id and s.publisher_url is not null)
                                                     as publisher_urls_resolved,
  (select count(*)::int from source_resolutions s
     where s.case_ids ? c.case_id and s.fetch_status is not null
       and s.fetch_status <> 'NOT_FOUND')            as documents_fetched,
  (select count(*)::int from source_resolutions s
     where s.case_ids ? c.case_id and s.fetch_status = 'USABLE')
                                                     as documents_usable,
  (select count(*)::int from source_resolutions s
     where s.case_ids ? c.case_id
       and s.fetch_status in ('AUTH_OU_ROBOTS', 'ARTICLE_REMOVED', 'FETCH_ERROR',
                              'JS_OU_CONSENT', 'CONTENT_TOO_THIN'))
                                                     as documents_unreachable,
  (select count(*)::int from source_resolutions s
     where s.case_ids ? c.case_id and s.fetch_status = 'NOT_FOUND')
                                                     as documents_not_resolved,

  -- Le média réellement lu n'est pas toujours celui que la veille avait
  -- remonté : la substitution « même fait » doit rester visible.
  (select count(*)::int from source_resolutions s
     where s.case_ids ? c.case_id and s.resolution_family like 'MEME_FAIT%')
                                                     as documents_par_substitution
from cases c;

comment on view case_source_access is
  'Passage du résultat de veille au document lisible, par affaire. Sert à '
  'distinguer une affaire sans résultat d''une affaire noyée de résultats '
  'dont aucun n''est accessible — les deux sont aveugles, pour des '
  'raisons opposées. `documents_par_substitution` compte les documents '
  'lus chez un autre média que celui remonté par la veille.';
