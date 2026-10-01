-- =====================================================================
-- Migration 010 — `case_checks.engine` : révoquer la mémoire au bon grain
--
-- CIBLE : Neon (base `neondb`, branche `migration-clean`).
--
-- DÉFAUT MESURÉ le 24/09/2026. La migration 008 a rendu la mémoire
-- d'examen révocable par `primitive_version`. Insuffisant : le moteur de
-- compréhension peut changer SANS que la version de la primitive bouge —
-- c'est précisément le cas quand on passe du déterministe `rules` à un
-- modèle. Constaté en exécutant le cycle avec `--moteur openai/gpt-5-nano` :
-- les 12 articles déjà examinés par `rules` restaient marqués « vus » et
-- n'étaient pas réexaminés par le nouveau moteur.
--
-- Une mémoire d'examen n'a de sens que rapportée à CE QUI A EXAMINÉ.
--
-- 100 % additive, idempotente.
-- =====================================================================

alter table case_checks add column if not exists engine text;

comment on column case_checks.engine is
  'Moteur ayant examiné les contenus de `vus` : « rules » ou identifiant '
  'du modèle. Couplé à `primitive_version`, il permet de faire revenir '
  'des articles quand le moteur change — sans quoi une mauvaise lecture '
  'resterait définitive.';
