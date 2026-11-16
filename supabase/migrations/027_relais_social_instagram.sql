-- =====================================================================
-- 027 — Relais social : Instagram (mode REVIEW). ADDITIVE et idempotente ; aucune table nouvelle, aucune donnée touchée.
--
-- Deux CONTRAINTES CHECK élargies (c'est la seule raison de cette migration : sans elles, la base refuse la nouvelle valeur) :
--   · relais_social_propositions.decision  accepte aussi 'GO_I' (GO Instagram). Les GO X / Facebook existants ne changent pas.
--   · relais_social_config.id             accepte aussi 2 : la ligne 2 est le T0 PROPRE à Instagram (même table, mêmes triggers d'immuabilité que la ligne 1, qui reste
--                                         le T0 global du relais REVIEW et n'est ni lue ni modifiée par ce code). Insérer la ligne 2 n'est pas une mise à jour : le trigger
--                                         d'immuabilité (UPDATE / DELETE / TRUNCATE) continue de la protéger une fois posée.
-- Le journal diffusions_sociales (025) autorise déjà le canal 'instagram'. Le code qui utilise ces valeurs reste inerte tant que le canal n'est pas activé.
-- =====================================================================
alter table relais_social_propositions drop constraint if exists relais_social_propositions_decision_check;
alter table relais_social_propositions add constraint relais_social_propositions_decision_check
  check (decision in ('GO_XF', 'GO_F', 'GO_X', 'GO_I', 'REFUS', 'EXPIREE'));

alter table relais_social_config drop constraint if exists relais_social_config_id_check;
alter table relais_social_config add constraint relais_social_config_id_check check (id in (1, 2));

comment on table relais_social_config is 'T0 du relais social (mode REVIEW). Ligne 1 = T0 global X / Facebook ; ligne 2 = T0 propre à Instagram. Lignes immuables (trigger).';
