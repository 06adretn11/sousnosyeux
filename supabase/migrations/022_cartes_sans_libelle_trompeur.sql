-- =====================================================================
-- 022 — Cartes publiques : pas de libellé judiciaire que les sources ne démontrent pas (GO de l'éditeur du 24/10/2026).
--
-- Deux UPDATE gardés par la valeur actuelle (idempotents), sur des valeurs EXISTANTES de l'enum (aucune nouvelle catégorie) :
--   · FR-2026-0036 (Chat Perché) : « plainte » → « à qualifier » : aucune plainte déposée n'est rapportée pour cet établissement
--     (celle de la famille concerne Joyeuse Tribu ; celle du groupe est seulement annoncée).
--   · FR-2026-0043 (Annonay) : « condamnation non définitive » → « à qualifier » : l'appel et le caractère définitif ne sont pas documentés ;
--     la condamnation reste dite, sans ce qualificatif, dans la fiche.
-- FR-2026-0045 (Saint-Valéry) : aucune donnée à changer — son bloc d'état validé porte déjà finalité « inconnue » ; c'est l'affichage du site qui cesse
--     d'écrire « non définitive » dans ce cas (web/src/pages/index.astro, web/src/lib/etat-wording.ts).
--
-- Retour arrière (non exécuté) :
--   update cases set statut_judiciaire = 'plainte' where case_id = 'FR-2026-0036' and statut_judiciaire = 'à qualifier';
--   update cases set statut_judiciaire = 'condamnation non définitive' where case_id = 'FR-2026-0043' and statut_judiciaire = 'à qualifier';
-- =====================================================================

update cases set statut_judiciaire = 'à qualifier'
 where case_id = 'FR-2026-0036' and statut_judiciaire = 'plainte';

update cases set statut_judiciaire = 'à qualifier'
 where case_id = 'FR-2026-0043' and statut_judiciaire = 'condamnation non définitive';
