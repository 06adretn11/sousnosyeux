-- =====================================================================
-- 023 — FR-2026-0043 (Annonay) : la condamnation est documentée ; la carte la dit (« Condamné »), sans « non définitive ».
--
-- Remplace la moitié « Annonay » de 022 (« à qualifier » masquait une condamnation établie). Valeur EXISTANTE de l'enum, UPDATE gardé et idempotent.
-- Le qualificatif « non définitive » n'est plus écrit par le site que si un appel est en cours ou si la finalité « non_definitive » est validée
-- (web/src/pages/index.astro, web/src/lib/etat-wording.ts) : la carte affiche donc « Condamné » (même représentation que Saint-Valéry).
--
-- Retour arrière (non exécuté) :
--   update cases set statut_judiciaire = 'à qualifier' where case_id = 'FR-2026-0043' and statut_judiciaire = 'condamnation non définitive';
-- =====================================================================

update cases set statut_judiciaire = 'condamnation non définitive'
 where case_id = 'FR-2026-0043' and statut_judiciaire = 'à qualifier';
