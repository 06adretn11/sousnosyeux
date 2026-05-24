-- =====================================================================
-- sousnosyeux — Seed MVP : 17 affaires score >= 8/10
-- À exécuter APRÈS schema.sql, dans le SQL Editor Supabase.
-- Idempotent : utilise ON CONFLICT pour pouvoir re-jouer le script.
-- =====================================================================

-- ---------- INSERT cases ----------

insert into cases (case_id, etablissement, commune, departement, type_structure, role_mis_en_cause, type_affaire, statut_judiciaire, statut_des_faits, enfants_concernes_public, fiabilite_info_10, publication_status, commentaire_validation) values
('POC-02', 'École maternelle Charlie-Chaplin', 'La Courneuve', 'Seine-Saint-Denis', 'maternelle', 'enseignant', 'agression sexuelle', 'condamnation non définitive', 'retenu par jugement non définitif', 'plusieurs enfants', 8, 'candidate', 'Source presse fiable. Condamnation pour agressions sexuelles sur trois fillettes. À vérifier : appel.'),
('POC-03', 'École élémentaire Jules-Vallès', 'Plaisir', 'Yvelines', 'élémentaire', 'enseignant', 'agression sexuelle', 'condamnation non définitive', 'retenu par jugement non définitif', 'plusieurs enfants', 8, 'candidate', 'Source nationale fiable. Condamnation pour attouchements sur deux élèves. À vérifier : appel.'),
('POC-04', 'École Émeriau', 'Paris 15e', 'Paris', 'périscolaire', 'intervenant extérieur', 'agression sexuelle', 'mise en examen', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Article dédié. Mise en examen, instruction en cours, plusieurs plaintes.'),
('POC-05', 'École maternelle Alphonse-Baudin', 'Paris 11e', 'Paris', 'périscolaire', 'animateur périscolaire', 'mixte', 'procès', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Source fiable centrée sur le dossier. À vérifier : décision finale.'),
('POC-06', 'École maternelle Bullourde', 'Paris 11e', 'Paris', 'périscolaire', 'animateur périscolaire', 'mixte', 'mise en examen', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Source fiable. Mise en examen rapportée. Wording prudent obligatoire.'),
('POC-07', 'École maternelle Servan', 'Paris 11e', 'Paris', 'périscolaire', 'animateur périscolaire', 'violences sexuelles', 'mise en examen', 'allégué', 'plusieurs enfants', 9, 'candidate', 'Source nationale fiable, récente, statut clair. Mise en examen + détention provisoire.'),
('POC-08', 'École maternelle Voltaire', 'Paris 11e', 'Paris', 'périscolaire', 'animateur périscolaire', 'viol', 'plainte', 'allégué', '1 enfant', 8, 'candidate', 'Article dédié. Signalement et plainte. Réserve forte : faits allégués.'),
('POC-09', 'École Titon', 'Paris 11e', 'Paris', 'périscolaire', 'animateur périscolaire', 'mixte', 'procès', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Source service public. Cinq procès programmés. À suivre : décision finale.'),
('POC-10', 'École Volontaires', 'Paris 15e', 'Paris', 'périscolaire', 'animateur périscolaire', 'mixte', 'enquête', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Source de synthèse utile. Idéalement compléter par article dédié.'),
('PARIS-001', 'École maternelle Saint-Dominique', 'Paris 7e', 'Paris', 'périscolaire', 'tiers', 'mixte', 'enquête', 'allégué', 'plusieurs enfants', 8, 'candidate', '16 personnes placées en garde à vue. Wording extrêmement prudent.'),
('PARIS-004', 'École maternelle Paul-Dubois', 'Paris 3e', 'Paris', 'périscolaire', 'animateur périscolaire', 'agression sexuelle', 'enquête', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Article dédié très documenté. Instruction ouverte en 2019.'),
('PARIS-006', 'École maternelle Parmentier', 'Paris 11e', 'Paris', 'périscolaire', 'animateur périscolaire', 'viol', 'plainte', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Deuxième plainte pour viol aggravé. Réserve forte.'),
('PARIS-007', 'École maternelle Reuilly', 'Paris 12e', 'Paris', 'périscolaire', 'animateur périscolaire', 'agression sexuelle', 'enquête', 'allégué', '1 enfant', 8, 'candidate', 'Article dédié. Enquête administrative ouverte, suspension, signalement parquet.'),
('PARIS-008', 'École maternelle Boulard', 'Paris 14e', 'Paris', 'périscolaire', 'animateur périscolaire', 'mixte', 'enquête', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Article dédié. Trois agents suspendus après signalements.'),
('PARIS-009', 'École maternelle Faidherbe', 'Paris 11e', 'Paris', 'périscolaire', 'animateur périscolaire', 'mixte', 'enquête', 'allégué', 'non précisé', 8, 'candidate', 'Suspension animateur après signalement, puis deuxième suspension.'),
('PARIS-010', 'École maternelle Grands-Champs', 'Paris 20e', 'Paris', 'maternelle', 'tiers', 'agression sexuelle', 'enquête', 'allégué', 'plusieurs enfants', 8, 'candidate', 'Source Le Parisien/AFP. Compagnon d''une institutrice mis en cause.'),
('PARIS-011', 'École Léon Schwartzenberg', 'Paris 10e', 'Paris', 'périscolaire', 'animateur périscolaire', 'violences sexuelles', 'plainte', 'allégué', 'non précisé', 8, 'candidate', 'Signalement parents, suspension animateur, plainte déposée.')
on conflict (case_id) do update set
  etablissement = excluded.etablissement,
  commune = excluded.commune,
  departement = excluded.departement,
  type_structure = excluded.type_structure,
  role_mis_en_cause = excluded.role_mis_en_cause,
  type_affaire = excluded.type_affaire,
  statut_judiciaire = excluded.statut_judiciaire,
  statut_des_faits = excluded.statut_des_faits,
  enfants_concernes_public = excluded.enfants_concernes_public,
  fiabilite_info_10 = excluded.fiabilite_info_10,
  commentaire_validation = excluded.commentaire_validation,
  updated_at = now();

-- ---------- INSERT sources ----------
-- On supprime d'abord les sources existantes pour ces cases (re-import propre)

delete from sources where case_id in (
  'POC-02','POC-03','POC-04','POC-05','POC-06','POC-07','POC-08','POC-09','POC-10',
  'PARIS-001','PARIS-004','PARIS-006','PARIS-007','PARIS-008','PARIS-009','PARIS-010','PARIS-011'
);

insert into sources (case_id, url, media, publication_date, source_type, is_primary) values
('POC-02', 'https://www.ouest-france.fr/faits-divers/agression-sexuelle/un-enseignant-de-maternelle-condamne-en-seine-saint-denis-pour-agressions-sexuelles-sur-trois-fillettes-feb57662-2c3a-11f1-9163-025005abf8da', 'Ouest-France', null, 'presse', true),
('POC-03', 'https://www.lemonde.fr/societe/article/2024/12/06/un-enseignant-d-ecole-elementaire-des-yvelines-condamne-a-de-la-prison-ferme-pour-des-attouchements-sur-deux-eleves_6432690_3224.html', 'Le Monde', '2024-12-06', 'presse', true),
('POC-04', 'https://www.20minutes.fr/societe/4202824-20260223-violences-periscolaire-paris-parents-revoltes-enquete-mairie-ecole-emeriau', '20 Minutes', '2026-02-23', 'presse', true),
('POC-05', 'https://www.liberation.fr/societe/education/une-chaine-de-dysfonctionnements-et-des-enfants-sans-protection-un-animateur-du-periscolaire-parisien-juge-pour-agressions-sexuelles-20251125_KYKFOAXRE5B3XM7TNWYMO6FPEI/', 'Libération', '2025-11-25', 'presse', true),
('POC-06', 'https://www.lefigaro.fr/faits-divers/un-animateur-scolaire-mis-en-examen-pour-agressions-sexuelles-sur-des-enfants-de-maternelle-20260206', 'Le Figaro', '2026-02-06', 'presse', true),
('POC-07', 'https://www.lemonde.fr/societe/article/2026/05/12/violences-sexuelles-dans-le-periscolaire-a-paris-un-animateur-d-une-ecole-maternelle-ecroue_6688265_3224.html', 'Le Monde', '2026-05-12', 'presse', true),
('POC-08', 'https://www.leparisien.fr/paris-75/paris-un-animateur-periscolaire-suspendu-pour-un-viol-sur-un-enfant-de-trois-ans-27-03-2026-RC37EXX6FRCSPLA2SQC6PL2HKI.php', 'Le Parisien', '2026-03-27', 'presse', true),
('POC-09', 'https://france3-regions.franceinfo.fr/paris-ile-de-france/paris/cinq-proces-deja-programmes-dans-l-affaire-du-periscolaire-a-paris-3355093.html', 'France 3', null, 'presse', true),
('POC-10', 'https://www.elle.fr/Societe/News/Violences-sexuelles-dans-le-periscolaire-quelles-sont-les-ecoles-parisiennes-les-plus-touchees-4459600', 'ELLE', null, 'presse', true),
('PARIS-001', 'https://www.msn.com/fr-fr/actualite/france/violences-dans-le-p%C3%A9riscolaire-16-personnes-de-l-%C3%A9cole-saint-dominique-interpell%C3%A9es-et-plac%C3%A9es-en-garde/ar-AA23DX3R', 'MSN / reprise presse', '2026-05-20', 'presse', true),
('PARIS-004', 'https://www.20minutes.fr/paris/4202456-20260220-violences-sexuelles-periscolaire-passe-ecole-maternelle-paul-dubois-paris', '20 Minutes', '2026-02-20', 'presse', true),
('PARIS-006', 'https://www.lefigaro.fr/faits-divers/paris-une-nouvelle-plainte-pour-viol-aggrave-deposee-contre-un-animateur-de-maternelle-20251119', 'Le Figaro', '2025-11-19', 'presse', true),
('PARIS-007', 'https://www.20minutes.fr/faits_divers/faits-divers-paris/4174086-20250919-paris-animateur-ecole-maternelle-suspendu-apres-soupcons-agression-sexuelle', '20 Minutes', '2025-09-19', 'presse', true),
('PARIS-008', 'https://www.leparisien.fr/paris-75/paris-trois-animateurs-ecartes-dune-maternelle-apres-des-soupcons-de-violences-sexuelles-les-parents-se-sentent-trahis-11-03-2026-LNLFZH5QCJGERBX7QFERMSZDAI.php', 'Le Parisien', '2026-03-11', 'presse', true),
('PARIS-009', 'https://www.leparisien.fr/faits-divers/paris-une-deuxieme-animatrice-suspendue-a-lecole-faidherbe-a-la-suite-de-violences-20-11-2025-DDEF6ZI34NEQTCU3JO2HN7ZTNE.php', 'Le Parisien', '2025-11-20', 'presse', true),
('PARIS-010', 'https://www.leparisien.fr/paris-75/paris-trois-hommes-dont-deux-animateurs-periscolaires-interpelles-pour-agressions-sexuelles-sur-douze-enfants-a-lecole-20-03-2026-JPKBOBEW5BBTZEMR6FDSHUOOVY.php', 'Le Parisien', '2026-03-20', 'presse', true),
('PARIS-011', 'https://www.leparisien.fr/faits-divers/violences-sexuelles-dans-le-periscolaire-un-animateur-suspendu-dans-une-ecole-du-xe-arrondissement-parisien-19-02-2026-BZNN3S43QZEBBAEVMJ6VXFFMP4.php', 'Le Parisien', '2026-02-19', 'presse', true);

-- ---------- VÉRIFICATION ----------

select count(*) as nb_cases from cases;
-- attendu : 17

select count(*) as nb_sources from sources;
-- attendu : 17 (1 source primaire par fiche pour le MVP)

select case_id, etablissement, fiabilite_info_10, publication_status from cases order by case_id;
