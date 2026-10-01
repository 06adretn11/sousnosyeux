-- =====================================================================
-- Migration 008 — `case_checks` : rendre la mémoire révocable et honnête
--
-- CIBLE : Neon (base `neondb`, branche `migration-clean`).
--
-- POURQUOI, trois défauts mesurés le 24/09/2026 sur la migration 007 :
--
--  1. MÉMOIRE IRRÉVOCABLE. `vus` ne portait pas la version de la primitive
--     qui avait conclu. Or le moteur `rules` de `etat-affaire` s'est révélé
--     défaillant sur de la prose de presse réelle : sur `FR-2026-0029`, le
--     corps porte « a été jugé ce mardi 3 mars 2026 » et « écoper de
--     24 mois de prison », et la primitive n'extrait AUCUN événement. Cet
--     article a été mémorisé comme examiné : réparer le moteur ne le
--     ferait jamais revenir. Une mémoire d'examen doit être révocable
--     quand l'examinateur change.
--
--  2. `resultat` MENTEUR. L'énum n'offrait que NO_NEW_INFORMATION et
--     NOUVEAUTE_DETECTEE. Une affaire dont tous les candidats sont restés
--     bloqués faute d'URL éditeur était écrite NOUVEAUTE_DETECTEE alors
--     qu'aucun corps n'avait été lu. Mesuré : 21 affaires sur 24.
--     D'où `NON_EXAMINE`.
--
--  3. `n_deja_vus` AGRÉGEAIT TROIS CHOSES — déjà-vus, doublons et
--     non-pertinents — sous un nom qui n'en désigne qu'une.
--
-- Propriétés : 100 % additive, idempotente, rejouable. Aucun DROP.
-- =====================================================================

-- ---------- 1) Révocabilité ----------

alter table case_checks
  add column if not exists primitive_version text;

comment on column case_checks.primitive_version is
  'Version de la primitive qui a examiné les contenus de `vus`. Permet de '
  'révoquer une mémoire d''examen produite par un moteur depuis corrigé : '
  'un `vus` écrit par une version obsolète ne doit plus faire écran.';


-- ---------- 2) Un résultat qui ne ment pas ----------

do $$ begin
  alter table case_checks drop constraint if exists case_checks_resultat_check;
exception when undefined_object then null; end $$;

alter table case_checks
  add constraint case_checks_resultat_check
  check (resultat in ('NO_NEW_INFORMATION', 'NOUVEAUTE_DETECTEE', 'NON_EXAMINE'));

comment on column case_checks.resultat is
  'NO_NEW_INFORMATION : des contenus ont été lus, aucun n''apporte de '
  'nouveauté. NOUVEAUTE_DETECTEE : au moins un contenu lu apporte une '
  'nouveauté. NON_EXAMINE : des candidats existaient mais aucun n''a pu '
  'être ouvert (source inaccessible). Aucune des trois ne signifie '
  '« rien ne s''est passé ».';


-- ---------- 3) Des compteurs qui désignent ce qu'ils nomment ----------

alter table case_checks add column if not exists n_doublons       integer not null default 0;
alter table case_checks add column if not exists n_non_pertinents integer not null default 0;
alter table case_checks add column if not exists n_bloques        integer not null default 0;

comment on column case_checks.n_deja_vus is
  'Contenus écartés parce que déjà examinés lors d''un cycle antérieur. '
  'N''agrège plus les doublons ni les non-pertinents : ils ont leurs '
  'propres colonnes.';
