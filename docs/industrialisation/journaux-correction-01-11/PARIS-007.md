# Journal — PARIS-007 (école maternelle Reuilly, Paris 12e) — publiée

**Statut final : MISE À JOUR PRÊTE** (texte compatible avec carte inchangée ET carte alignée). Empreinte : `d73547b2edf3aac7` (dépôt) → `3be78ddd221254cd`.

## Preuve de l'état de la carte (Neon, lecture seule)
- `cases.statut_judiciaire = 'enquête'`, `commentaire_validation` : « Article dédié. Enquête administrative ouverte, suspension, signalement parquet. » (import 25/05/2026) : le mot « enquête » de la carte vient d'une **enquête administrative**.
- `case_events` : 0 ; `reviews` : approbation de fiche du 24/10/2026 (« Aucun changement d'état ») seulement.
- `state_proposals` : 1 proposition ENRICHMENT (deepseek, `statut_propose` null, `finalite` « inconnue », décision null) : elle ne propose aucun changement d'état ; elle cite la même enquête administrative.
- FR-2026-0007 (« Reuilly II », carte « enquête », 2 sources dont Linfo.re) : même article 20 Minutes, aucun événement ni review ; consolidation vers PARIS-007 déjà prévue au GO.
⇒ Aucune preuve d'enquête pénale ouverte en base ni dans la source lue.

## Observations des rapports
- P1-07 contradiction « Enquête » / « aucune procédure judiciaire » : **encore présente** → synthèse réécrite sans « aucune procédure judiciaire » : « la Ville de Paris a lancé une enquête administrative (non judiciaire)… la direction des affaires scolaires a promis aux parents qu'un signalement serait transmis au parquet sans délai. L'ouverture d'une enquête judiciaire n'est pas rapportée par les sources lues. » Le signalement reste au futur (promesse), comme dans la citation de la Dasco.
- Préfixes « mesure annoncée » sur les réunions : **encore présente** pour la réunion du 17 septembre 2025 (l'article la rapporte comme tenue : « Une réunion a été organisée le 17 septembre dernier ») → préfixe retiré. L'étape de la réunion de septembre 2025 avec l'équipe d'animation n'avait pas de préfixe : inchangée (l'article écrit « se décide à organiser une réunion »).
- Retrait du terrain (préfixe « Mesure annoncée… » sur une mesure que le courrier de la Dasco rapporte comme accomplie : « a été retiré du terrain ») : **encore présente** → attribution au courrier conservée, préfixe retiré.
- Étape administrative typée « Enquête » : **encore présente** → « Mesure de la collectivité ».

## Changements exacts
- synthese.decision / etat_actuel[0] (voir plus haut) ; statut_libelle « Enquête administrative » (statut_affiche reste « enquête » = carte).
- Étape enquête administrative : type enquete → mesure_collectivite ; texte « (non judiciaire) ».
- Réunion du 17/09/2025 : « Mesure annoncée… une réunion a été organisée… » → « une réunion avec les parents a été organisée le 17 septembre 2025 ; ils y ont exprimé le souhait qu'une enquête pénale soit déclenchée » ; placée avant la promesse de signalement.
- Promesse de signalement : ajout « (promesse : la transmission n'est pas rapportée par les sources lues) ».
- Retrait du terrain : « Selon le courrier de la Dasco cité par 20 Minutes, l'animateur « a été retiré du terrain » à partir d'août 2025… ».
- inconnues[0] : « Ni plainte ni enquête judiciaire ne sont rapportées par les sources lues… la transmission d'un signalement au parquet est seulement promise aux parents, sans confirmation. »

## Preuves
(20 Minutes 19/09/2025, https://www.20minutes.fr/faits_divers/faits-divers-paris/4174086-20250919-paris-animateur-ecole-maternelle-suspendu-apres-soupcons-agression-sexuelle)
- « Une réunion a été organisée le 17 septembre dernier, lors de laquelle les parents ont exprimé leur souhait qu'une enquête pénale soit déclenchée. »
- « "Un signalement sera transmis au parquet sans délai", leur a promis la direction des affaires scolaires. »
- « Une enquête administrative a été lancée au même moment, explique la missive, qui porte "à la fois sur les faits remontés en octobre 2023 et sur la gestion du signalement". »
- « C'est seulement à partir de ce moment-là que l'animateur "a été retiré du terrain", détaille le courrier de la Dasco » (août 2025).

## Limites et réserves substantielles
- Source unique (20 Minutes). **Linfo.re (qui sera déplacée de FR-2026-0007) est une reprise de 20 Minutes, non indépendante, et date la réunion avec les parents du 12 septembre 2025 (20 Minutes : 17 septembre)** : ne pas importer cette date ; garder 17 septembre.
- Le texte du dossier (« 1 article lu ») devra être mis à jour par le coordinateur au rattachement de Linfo.re (reprise : toujours 1 article indépendant).

## Proposition de carte
PARIS-007 (et la fusion FR-2026-0007 → PARIS-007) : `statut_judiciaire` « enquête » → « à qualifier » ; preuve : ci-dessus (enquête administrative + signalement promis ; aucun acte judiciaire rapporté). Wording (popup) : « Selon 20 Minutes, des faits ont été signalés ; la qualification reste à préciser. » Hypothèse B rend le texte le plus cohérent ; A reste acceptable grâce à la pastille « Enquête administrative ». Si B : changer `statut_affiche` en « à qualifier » dans le dossier.

## Revue de clôture et relecture du rendu
- revue du lot : statut_affiche aligné sur la carte proposée (« à qualifier ») ; champ non rendu par le gabarit, libellé « Enquête administrative » inchangé
