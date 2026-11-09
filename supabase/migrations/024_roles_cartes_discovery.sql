-- =====================================================================
-- 024 — Rôle de la personne mise en cause (carte) de quatre affaires PUBLIÉES créées par Discovery : « autre » → fonction établie par les sources.
--
-- ⚠️ PRÉPARÉE, NON APPLIQUÉE : en attente du GO éditorial d'Adrien sur CETTE version (lot « lot-roles-2026-11-09 », voir
-- docs/industrialisation/LOT_ROLES_09_11.json et LOT_ROLES_09_11_APERCU.diff). Aucune écriture n'a été faite sur Neon pour ces quatre affaires.
--
-- Cause : à la création, le champ « rôle » est retombé au repli neutre (« autre ») alors que les passages cités par les sources vérifiées de l'affaire
-- établissent la fonction (le repli peut venir d'une liste renvoyée par le modèle ou d'une valeur invalide : sorties brutes non conservées, cause non
-- démontrée — sans incidence : la valeur juste est directement étayée). Catégories EXISTANTES de l'énumération ; convention du corpus : un animateur d'un
-- centre de loisirs ou d'un accueil périscolaire = « animateur périscolaire » (5 + 12 cartes), un instituteur / professeur des écoles = « enseignant ».
--
-- Chaque UPDATE est GARDÉ par la valeur actuelle ET par l'état publié : une seconde exécution ne modifie rien, et rien n'est écrit si la carte a bougé.
--
-- Effet public APRÈS application, et seulement après projection limitée à ces quatre affaires :
--   node --env-file=.env.local scripts/project-public.mjs --modifier FR-2026-0133,FR-2026-0137,FR-2026-0139,FR-2026-0143
--   → data/cases.json : exactement quatre lignes « role_mis_en_cause » changent (aperçu immuable : LOT_ROLES_09_11_APERCU.diff) ;
--   → carte : ligne de liste (« commune · type · rôle ») et popup « Rôle mis en cause » ; ni la position, ni la couleur, ni les filtres, ni l'état judiciaire,
--     ni la fiche individuelle (empreintes approuvées = servies, inchangées) ne bougent.
-- ⚠ Ne PAS lancer `project-public.mjs` sans --modifier : l'artefact a 11 retards de projection étrangers à ce lot (sources ajoutées), qu'il absorberait.
--
-- Appliquer (depuis l'arbre de travail d'Adrien, où le script existe) :
--   node scripts/apply-migration.mjs supabase/migrations/024_roles_cartes_discovery.sql --dry-run
--   node scripts/apply-migration.mjs supabase/migrations/024_roles_cartes_discovery.sql
--
-- Retour arrière (non exécuté) :
--   update cases set role_mis_en_cause = 'autre' where case_id in ('FR-2026-0133','FR-2026-0137','FR-2026-0139','FR-2026-0143') and role_mis_en_cause <> 'autre';
-- =====================================================================

update cases set role_mis_en_cause = 'animateur périscolaire'::role_mis_en_cause
 where case_id = 'FR-2026-0133' and publication_status = 'publiée' and role_mis_en_cause = 'autre';

update cases set role_mis_en_cause = 'enseignant'::role_mis_en_cause
 where case_id = 'FR-2026-0137' and publication_status = 'publiée' and role_mis_en_cause = 'autre';

update cases set role_mis_en_cause = 'animateur périscolaire'::role_mis_en_cause
 where case_id = 'FR-2026-0139' and publication_status = 'publiée' and role_mis_en_cause = 'autre';

update cases set role_mis_en_cause = 'animateur périscolaire'::role_mis_en_cause
 where case_id = 'FR-2026-0143' and publication_status = 'publiée' and role_mis_en_cause = 'autre';

-- Contrôle attendu après application (lecture seule) :
--   select case_id, role_mis_en_cause from cases where case_id in ('FR-2026-0133','FR-2026-0137','FR-2026-0139','FR-2026-0143') order by 1;
--   → animateur périscolaire · enseignant · animateur périscolaire · animateur périscolaire
