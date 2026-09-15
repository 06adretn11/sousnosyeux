-- =====================================================================
-- supabase/tests/004_invariants.sql
--
-- Vérifie les invariants de la migration 004 sur une base ÉPHÉMÈRE.
-- Ne jamais exécuter contre la production.
--
-- Usage (voir docs/industrialisation/GATE_2_REPORT.md) :
--   psql -d sny_test -v ON_ERROR_STOP=1 -f supabase/tests/004_invariants.sql
--
-- Chaque test lève une exception s'il échoue : le script s'arrête et
-- psql renvoie un code non nul.
-- =====================================================================

\set QUIET on
\timing off

create or replace function t_assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if cond then
    raise notice '  OK   %', label;
  else
    raise exception 'ECHEC: %', label;
  end if;
end $$;

-- ---------- Jeu d'essai minimal ----------

insert into cases (
  case_id, etablissement, commune, departement, type_structure,
  role_mis_en_cause, type_affaire, statut_judiciaire, statut_des_faits,
  enfants_concernes_public, fiabilite_info_10, publication_status,
  commentaire_validation, resume_public, verified_at
) values
  ('T-PUB',   'Ecole Test A', 'Ville-Test', 'Testiere', 'maternelle',
   'animateur périscolaire', 'agression sexuelle', 'mise en examen', 'allégué',
   'plusieurs enfants', 10, 'publiée', 'NOTE INTERNE NE DOIT PAS SORTIR',
   'Une source publique rapporte une mise en examen.', current_date),
  ('T-RELAXE','Ecole Test B', 'Ville-Test', 'Testiere', 'maternelle',
   'animateur périscolaire', 'agression sexuelle', 'relaxe / non-lieu / classement', 'non établi',
   'non précisé', 10, 'publiée', 'NOTE INTERNE', 'Classement sans suite.', current_date),
  ('T-QUAL',  'Ecole Test C', 'Ville-Test', 'Testiere', 'maternelle',
   'animateur périscolaire', 'à qualifier', 'à qualifier', 'allégué',
   'non précisé', 10, 'publiée', 'NOTE INTERNE', 'A qualifier.', current_date),
  ('T-MERGED','Ecole Test A bis', 'Ville-Test', 'Testiere', 'maternelle',
   'animateur périscolaire', 'agression sexuelle', 'mise en examen', 'allégué',
   'plusieurs enfants', 10, 'publiée', 'NOTE INTERNE', 'Doublon fusionne.', current_date)
on conflict (case_id) do nothing;

update cases set merged_into = 'T-PUB' where case_id = 'T-MERGED';

insert into sources (case_id, url, media, publication_date, source_type, is_primary, source_tier, access_status)
values ('T-PUB', 'https://exemple-fictif.test/a', 'Le Quotidien Fictif', current_date - 10,
        'presse', true, 'primaire_admissible', 'ok')
on conflict do nothing;

-- ---------- T1 : la vue publique v2 exclut ce qu'elle doit exclure ----------

do $$
declare n int;
begin
  raise notice 'T1 — filtrage de cases_public_v2';
  select count(*) into n from cases_public_v2 where case_id = 'T-PUB';
  perform t_assert(n = 1, 'une fiche publiable est exposée');

  select count(*) into n from cases_public_v2 where case_id = 'T-RELAXE';
  perform t_assert(n = 0, 'une relaxe / non-lieu / classement est exclue');

  select count(*) into n from cases_public_v2 where case_id = 'T-QUAL';
  perform t_assert(n = 0, 'un statut « à qualifier » est exclu');

  select count(*) into n from cases_public_v2 where case_id = 'T-MERGED';
  perform t_assert(n = 0, 'une fiche fusionnée (merged_into) est exclue');
end $$;

-- ---------- T2 : aucun champ interne dans la vue publique ----------

do $$
declare fuite text;
begin
  raise notice 'T2 — absence de champ interne dans cases_public_v2';
  select string_agg(column_name, ', ') into fuite
  from information_schema.columns
  where table_name = 'cases_public_v2'
    and column_name in (
      'commentaire_validation','fiabilite_info_10','publication_status','adresse',
      'next_review_at','crit_source_fiable','crit_article_recent',
      'crit_etablissement_nomme','crit_statut_clair','crit_recoupement','merged_into'
    );
  perform t_assert(fuite is null, 'aucune colonne interne exposée (trouvé: ' || coalesce(fuite,'aucune') || ')');
end $$;

-- ---------- T3 : case_events est réellement append-only ----------

do $$
declare ev uuid; bloque boolean;
begin
  raise notice 'T3 — append-only sur case_events';
  insert into case_events (case_id, event_date, event_type, statut_apres, libelle_public)
  values ('T-PUB', current_date - 5, 'mise_en_examen', 'mise en examen',
          'Une source publique rapporte une mise en examen.')
  returning event_id into ev;
  perform t_assert(ev is not null, 'insertion d''un événement autorisée');

  bloque := false;
  begin
    update case_events set libelle_public = 'modifie' where event_id = ev;
  exception when others then bloque := true;
  end;
  perform t_assert(bloque, 'UPDATE refusé par le moteur');

  bloque := false;
  begin
    delete from case_events where event_id = ev;
  exception when others then bloque := true;
  end;
  perform t_assert(bloque, 'DELETE refusé par le moteur');
end $$;

-- ---------- T4 : unicité du hash de version ----------

do $$
declare dup boolean := false;
begin
  raise notice 'T4 — unicité (hub_id, payload_hash)';
  insert into local_hubs (hub_id, zone_label, zone_kind) values ('t-hub', 'Zone Test', 'commune')
    on conflict do nothing;
  insert into content_versions (hub_id, payload, payload_hash) values ('t-hub', '{"a":1}', 'deadbeef');
  begin
    insert into content_versions (hub_id, payload, payload_hash) values ('t-hub', '{"a":1}', 'deadbeef');
  exception when unique_violation then dup := true;
  end;
  perform t_assert(dup, 'un même payload_hash ne peut être enregistré deux fois pour un hub');
end $$;

-- ---------- T5 : merged_into est contraint ----------

do $$
declare ko boolean := false;
begin
  raise notice 'T5 — intégrité référentielle de merged_into';
  begin
    update cases set merged_into = 'CASE-INEXISTANTE' where case_id = 'T-MERGED';
  exception when foreign_key_violation then ko := true;
  end;
  perform t_assert(ko, 'merged_into ne peut pointer vers une affaire inexistante');
end $$;

-- ---------- T6 : compatibilité avec l'existant ----------

do $$
declare n int;
begin
  raise notice 'T6 — compatibilité ascendante';
  select count(*) into n from information_schema.views where table_name = 'cases_public';
  perform t_assert(n = 1, 'l''ancienne vue cases_public existe toujours (bascule réversible)');

  select count(*) into n from cases where resume_public is null and publication_status = 'publiée';
  perform t_assert(true, 'fiches publiées sans resume_public : ' || n || ' (colonne nullable, aucun blocage)');
end $$;

drop function t_assert(boolean, text);

\echo ''
\echo '004_INVARIANTS_PASSED'
