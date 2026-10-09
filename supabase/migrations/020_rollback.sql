-- =====================================================================
-- Rollback de la migration 020 (CREATE_PENDING_EVIDENCE).  ⚠️ NON APPLIQUÉ — à exécuter à la main, en connaissance de cause.
--
-- Rétablit la contrainte de 019 (ATTACH | CREATE | NULL). PRÉCONDITION : aucune ligne ne porte `action = 'CREATE_PENDING'`, sinon la
-- contrainte est refusée. Vérifier : select count(*) from new_case_proposals where action = 'CREATE_PENDING';
-- S'il y en a : les repasser à 'CREATE' n'est PAS neutre (la fiche créée est une candidate « à corriger », pas « validée ») ; les laisser
-- et ne rétablir la contrainte qu'après décision humaine. Le code détecte l'absence de CREATE_PENDING (schemaBoucle.pending) et ne
-- propose plus le bouton « CRÉER (preuves à compléter) ».
-- =====================================================================
alter table new_case_proposals drop constraint if exists new_case_proposals_action_check;
alter table new_case_proposals add constraint new_case_proposals_action_check check (action is null or action in ('ATTACH', 'CREATE'));
