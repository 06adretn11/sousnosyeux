-- =====================================================================
-- 029 — FR-2026-0048 (école maternelle Bénézet, Toulouse) : correction de la fiche et GO de publication d'Adrien (26/11/2026).
--
-- Origine : relecture de la ligne telle qu'elle est en base, contre la documentation rassemblée par Adrien (copies d'articles fournies le 26/11/2026).
--   · role_mis_en_cause « enseignant » → « animateur périscolaire » : toutes les sources parlent d'un animateur du CLAE (centre de loisirs associé à
--     l'école), agent de la mairie ; aucune ne parle d'un enseignant.
--   · type_affaire « viol » → « mixte » : mise en examen le 9 avril 2026 pour « viol sur mineure par personne ayant autorité » ET « atteintes sexuelles »
--     (actu.fr, avec l'AFP, d'après le parquet). Convention du corpus : plusieurs qualifications = « mixte ».
--   · statut_judiciaire « mise en examen » et statut_des_faits « allégué » : CONFIRMÉS, non modifiés (détention provisoire ; « conteste les faits » ;
--     Mediacités 06/07/2026 : « présumé innocent à ce stade »). Aucune issue de procédure n'est inférée.
--   · enfants_concernes_public « plusieurs enfants » : conservé. Aucun nombre n'est écrit nulle part ici ni dans les sources ajoutées.
--   · sources : la source principale devient actu.fr (17/03 et 10/04, parquet et AFP) à la place d'un magazine ; Le Parisien et Le Nouveau Détective restent
--     en sources secondaires ; Mediacités (06/07/2026) ajoutée pour l'état le plus récent connu. access_checked_at n'est renseigné que pour les pages lues
--     par Adrien (copies fournies) ; Le Nouveau Détective n'a pas été lu : sa date de contrôle reste vide.
--   · MEDIACITÉS EST PARTIELLEMENT EN ACCÈS PAYANT : seul le chapeau et le début de l'article sont libres. Si la règle « jamais de source payante » doit s'appliquer
--     aussi aux fiches, retirer cette ligne (voir ROLLBACK) : les autres sources suffisent à établir la mise en examen et la détention.
--
-- Cette migration est la SEULE écriture : elle n'expose rien par elle-même. La fiche n'entre sur la carte que par la projection (reconcilier-publication
-- → project-public), qui exige un GO explicite d'Adrien en base (ci-dessous) ET la levée du HOLD (data/publication-holds.json, même PR).
--
-- Toutes les instructions sont GARDÉES (valeur actuelle, absence de la ligne) : une seconde exécution ne modifie rien.
-- Appliquer : coller ce fichier dans l'éditeur SQL de la console Neon. Dernière vérification en bas (lecture seule).
-- =====================================================================

update cases
   set role_mis_en_cause = 'animateur périscolaire'::role_mis_en_cause,
       type_affaire      = 'mixte'::type_affaire,
       commentaire_validation = 'Animateur du centre de loisirs (CLAE) associé à l''école, agent municipal : mis en examen le 9 avril 2026 pour viol sur mineure par personne ayant autorité et atteintes sexuelles, placé en détention provisoire, il conteste les faits (actu.fr/AFP, d''après le parquet). Information judiciaire ouverte ; plusieurs plaintes selon le parquet (Mediacités, 06/07/2026). Corrigé le 26/11/2026 : rôle « animateur périscolaire » (et non « enseignant »), type « mixte ». Dernier fait documenté : 06/07/2026 ; aucune issue de procédure connue.'
 where case_id = 'FR-2026-0048'
   and role_mis_en_cause = 'enseignant'::role_mis_en_cause
   and type_affaire = 'viol'::type_affaire;

-- Source principale : une seule par affaire (index unique partiel). On retire d'abord l'ancienne, seulement si la nouvelle n'existe pas encore.
update sources
   set is_primary = false
 where case_id = 'FR-2026-0048'
   and is_primary
   and url like 'https://www.lenouveaudetective.com/%'
   and not exists (select 1 from sources where case_id = 'FR-2026-0048'
                    and url = 'https://actu.fr/occitanie/toulouse_31555/toulouse-poursuivi-pour-viol-et-atteintes-sexuelles-sur-des-enfants-l-animateur-d-un-centre-de-loisirs-mis-en-examen_64128097.html');

insert into sources (case_id, url, media, publication_date, source_type, is_primary, access_checked_at)
select 'FR-2026-0048',
       'https://actu.fr/occitanie/toulouse_31555/toulouse-poursuivi-pour-viol-et-atteintes-sexuelles-sur-des-enfants-l-animateur-d-un-centre-de-loisirs-mis-en-examen_64128097.html',
       'Actu.fr', date '2026-04-10', 'presse'::source_type, true, timestamptz '2026-11-26 00:00:00+00'
 where not exists (select 1 from sources where case_id = 'FR-2026-0048'
                    and url = 'https://actu.fr/occitanie/toulouse_31555/toulouse-poursuivi-pour-viol-et-atteintes-sexuelles-sur-des-enfants-l-animateur-d-un-centre-de-loisirs-mis-en-examen_64128097.html');

insert into sources (case_id, url, media, publication_date, source_type, is_primary, access_checked_at)
select 'FR-2026-0048',
       'https://actu.fr/occitanie/toulouse_31555/suspicions-d-attouchements-sur-des-enfants-dans-un-centre-de-loisirs-a-toulouse-une-enquete-ouverte_64004873.html',
       'Actu.fr', date '2026-03-17', 'presse'::source_type, false, timestamptz '2026-11-26 00:00:00+00'
 where not exists (select 1 from sources where case_id = 'FR-2026-0048'
                    and url = 'https://actu.fr/occitanie/toulouse_31555/suspicions-d-attouchements-sur-des-enfants-dans-un-centre-de-loisirs-a-toulouse-une-enquete-ouverte_64004873.html');

insert into sources (case_id, url, media, publication_date, source_type, is_primary, access_checked_at)
select 'FR-2026-0048',
       'https://www.mediacites.fr/enquete/toulouse/2026/07/06/agressions-sexuelles-sur-mineurs-une-dizaine-de-plaintes-contre-un-animateur-dans-une-ecole-de-toulouse/',
       'Mediacités', date '2026-07-06', 'presse'::source_type, false, timestamptz '2026-11-26 00:00:00+00'
 where not exists (select 1 from sources where case_id = 'FR-2026-0048'
                    and url = 'https://www.mediacites.fr/enquete/toulouse/2026/07/06/agressions-sexuelles-sur-mineurs-une-dizaine-de-plaintes-contre-un-animateur-dans-une-ecole-de-toulouse/');

-- Le Parisien : lu par Adrien, on date le contrôle d'accès.
update sources
   set access_checked_at = timestamptz '2026-11-26 00:00:00+00'
 where case_id = 'FR-2026-0048'
   and url like 'https://www.leparisien.fr/haute-garonne-31/apres-la-suspension-dun-animateur-%'
   and access_checked_at is null;

-- GO de publication d'Adrien, consigné tel qu'il l'a donné (format attendu par lib/publication-gates.mjs : REVUE_GO_PUBLICATION).
insert into reviews (case_id, reviewed_by, decision, comment)
select 'FR-2026-0048', 'Adrien (GO publication)', 'validé'::review_decision,
       $go$[Publication 2026-11-26] GO d'Adrien : « produis la fiche sur cette base et publie, je validerai en production » · rôle et qualification corrigés, sources actu.fr (17/03, 10/04) et Mediacités (06/07) ajoutées$go$
 where exists (select 1 from cases where case_id = 'FR-2026-0048' and publication_status = 'publiée'::publication_status)
   and not exists (select 1 from reviews where case_id = 'FR-2026-0048'
                    and comment like '[Publication 2026-11-26] GO d''Adrien : %');

-- Contrôle attendu après application (lecture seule) :
--   select case_id, role_mis_en_cause, type_affaire, statut_judiciaire, statut_des_faits, enfants_concernes_public, publication_status, fiabilite_info_10 from cases where case_id = 'FR-2026-0048';
--     → animateur périscolaire · mixte · mise en examen · allégué · plusieurs enfants · publiée · 10
--   select media, publication_date, is_primary, access_checked_at is not null as verifiee from sources where case_id = 'FR-2026-0048' order by publication_date;
--     → 4 ou 5 lignes (Actu.fr 17/03, Actu.fr 10/04 principale, Le Parisien, Le nouveau detective 14/04, Mediacités 06/07)
--   select reviewed_by, decision, left(comment, 60) from reviews where case_id = 'FR-2026-0048' order by reviewed_at desc limit 1;

-- ROLLBACK (non exécuté ; à lancer à la main, en connaissance de cause) :
--   update cases set role_mis_en_cause = 'enseignant'::role_mis_en_cause, type_affaire = 'viol'::type_affaire where case_id = 'FR-2026-0048';
--   delete from reviews where case_id = 'FR-2026-0048' and comment like '[Publication 2026-11-26] GO d''Adrien : %';
--   delete from sources where case_id = 'FR-2026-0048' and url like 'https://www.mediacites.fr/%';          -- retirer seulement Mediacités (source partiellement payante)
