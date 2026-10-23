-- =====================================================================
-- 021 — Corrections de DONNÉES issues de la relecture humaine des 20 fiches (23/10/2026).
--
-- ⚠️ PRÉPARÉE, NON APPLIQUÉE : en attente du GO d'Adrien. Aucune écriture n'a été faite sur Neon.
--
-- Trois corrections, chacune GARDÉE par la valeur actuelle (idempotente : une seconde exécution ne modifie rien) :
--   1. FR-2026-0008 — sources.media « Wikipédia » → « France Culture » (l'URL est radiofrance.fr/franceculture/…, page lue : France Culture, Radio France).
--   2. FR-2026-0046 — cases.etablissement « Deux écoles maternelles non nommées » → « École maternelle du Chêne-Creux », type_structure périscolaire → maternelle
--      (convention du corpus : une école maternelle nommée = « maternelle », ex. FR-2026-0005/0006/0007/0124). Preuve : France 3 Régions, La Nouvelle République, ICI.
--      L'école d'Ouche-Dinier (avertissement de 2018) est un CONTEXTE historique, pas une seconde affaire.
--   3. FR-2026-0025 — cases.etablissement « École Saint-Martin-de-France » → « Collège-lycée Saint-Martin-de-France », type_structure internat → collège
--      (convention : « Collège-lycée Saint-Jean-de-Passy » = collège). Preuve : franceinfo, 15/02/2024 (« collège-lycée Saint-Martin de France, à Pontoise »).
--      Les faits de 2001 et la procédure ne sont PAS touchés : ils vivent dans la fiche, pas dans ces champs.
--
-- Non modifié volontairement : role_mis_en_cause (« direction » pour 0025 : fonction exacte en 2001 non établie par les sources), statut_judiciaire, état, publication_status.
-- Effet public APRÈS application : seulement à la prochaine projection (node --env-file=.env.local scripts/sync-data.mjs → data/cases.json → QA → déploiement).
--
-- Appliquer (depuis l'arbre de travail d'Adrien, où le script existe) :
--   node scripts/apply-migration.mjs supabase/migrations/021_corrections_donnees_relecture_20.sql --dry-run
--   node scripts/apply-migration.mjs supabase/migrations/021_corrections_donnees_relecture_20.sql
-- Annuler (à la main, non exécuté) : voir le bloc ROLLBACK en bas de ce fichier.
-- =====================================================================

update sources
   set media = 'France Culture'
 where source_id = '7bdb07d4-1a16-4957-a94c-a27d0ef87469'
   and case_id = 'FR-2026-0008'
   and media = 'Wikipédia'
   and url like 'https://www.radiofrance.fr/franceculture/%';

update cases
   set etablissement = 'École maternelle du Chêne-Creux',
       type_structure = 'maternelle'::type_structure
 where case_id = 'FR-2026-0046'
   and etablissement = 'Deux écoles maternelles non nommées'
   and type_structure = 'périscolaire'::type_structure;

update cases
   set etablissement = 'Collège-lycée Saint-Martin-de-France',
       type_structure = 'collège'::type_structure
 where case_id = 'FR-2026-0025'
   and etablissement = 'École Saint-Martin-de-France'
   and type_structure = 'internat'::type_structure;

-- Contrôle attendu après application (lecture seule) :
--   select case_id, etablissement, type_structure from cases where case_id in ('FR-2026-0046','FR-2026-0025');
--   select media from sources where case_id = 'FR-2026-0008' order by media;   -- France Culture, Le Parisien

-- ROLLBACK (non exécuté ; à lancer à la main, en connaissance de cause) :
--   update sources set media = 'Wikipédia' where source_id = '7bdb07d4-1a16-4957-a94c-a27d0ef87469' and media = 'France Culture';
--   update cases set etablissement = 'Deux écoles maternelles non nommées', type_structure = 'périscolaire'::type_structure where case_id = 'FR-2026-0046';
--   update cases set etablissement = 'École Saint-Martin-de-France', type_structure = 'internat'::type_structure where case_id = 'FR-2026-0025';
