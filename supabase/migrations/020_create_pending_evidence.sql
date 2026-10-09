-- =====================================================================
-- 020 — CREATE_PENDING_EVIDENCE
--
-- Additive, idempotente. Une seule chose : la contrainte de `new_case_proposals.action` admet une troisième valeur,
-- CREATE_PENDING (nouvelle affaire crédible mais preuves insuffisantes → candidate EXPLICITEMENT non publiable).
--
-- Ce n'est PAS un nouveau statut judiciaire ni un nouvel état de fiche : la fiche créée est une `candidate` avec une revue
-- « à corriger » (jamais « validé »). Le garde-fou de publication existant (scripts/publier-affaire.mjs : « aucune revue
-- validé d'Adrien » → REFUS) l'empêche de passer en `publiée`, et la Maintenance la surveille (réexamen planifié).
-- Remplace la contrainte posée par 019 ; aucune ligne existante n'est modifiée (les valeurs ATTACH / CREATE / NULL restent valides).
-- =====================================================================
alter table new_case_proposals drop constraint if exists new_case_proposals_action_check;
do $$ begin
  alter table new_case_proposals add constraint new_case_proposals_action_check
    check (action is null or action in ('ATTACH', 'CREATE', 'CREATE_PENDING'));
exception when duplicate_object then null; end $$;
comment on column new_case_proposals.action is
  'Choix humain sur une décision ACCEPT : ATTACH (rapprocher), CREATE (nouvelle affaire suffisamment documentée) ou CREATE_PENDING '
  '(nouvelle affaire en attente de preuves : candidate non publiable). NULL pour REVIEW (HOLD) / REJECT et avant 019.';
