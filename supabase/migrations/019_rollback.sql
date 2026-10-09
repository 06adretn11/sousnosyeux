-- =====================================================================
-- Rollback de la migration 019.
--
-- ⚠️ NON APPLIQUÉ. Fourni pour que 019 ne soit jamais un aller simple (même convention que 004_rollback.sql).
--    Volontairement refusé par scripts/apply-migration.mjs (instructions destructrices) : à exécuter à la main, en connaissance de cause.
--
-- Ce que 019 a ajouté — et donc tout ce que ce rollback peut faire perdre :
--   · telegram_journal              : trace technique des passages et des clics (aucune donnée éditoriale) ;
--   · new_case_proposals.action     : le CHOIX humain RAPPROCHER / CRÉER des décisions prises depuis 019 ;
--   · case_events.realisation       : « annoncée » / « réalisée » des événements institutionnels écrits depuis 019.
-- Aucune donnée antérieure à 019 n'est touchée : 019 n'a modifié aucune ligne existante.
--
-- ⛔ AVANT de l'exécuter : relancer le code SANS 019 (revenir au commit 33ea7ec). Le code de 019 détecte l'absence des colonnes
--    (schemaBoucle) et se replie, mais les décisions déjà prises avec `action = ATTACH` perdraient leur choix : vérifier d'abord
--    `select count(*) from new_case_proposals where action is not null and applied_at is null` = 0.
-- =====================================================================
drop table if exists telegram_journal;
alter table new_case_proposals drop constraint if exists new_case_proposals_action_check;
alter table new_case_proposals drop column if exists action;
alter table case_events drop constraint if exists case_events_realisation_check;
alter table case_events drop column if exists realisation;
