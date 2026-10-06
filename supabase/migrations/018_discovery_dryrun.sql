-- 018 — trace des exécutions à blanc de Discovery (diagnostic uniquement).
-- Un run `--dry-run` lancé avec SNY_DIAG_NEON=1 y dépose les propositions qu'il AURAIT faites, pour qu'on puisse
-- les relire en privé : le dépôt est public, donc les logs CI n'affichent que des compteurs.
-- Aucune autre table n'est lue à partir de celle-ci ; additive, idempotente.
create table if not exists discovery_dryrun (
  id             bigserial primary key,
  run_at         timestamptz not null default now(),
  recommendation text not null,
  payload        jsonb not null
);
