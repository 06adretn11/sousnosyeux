# Chronologie des fiches — repère temporel et ordre (repasse du 23/11/2026, finition incluse)

Mandat : supprimer les « Date non établie » superflues du Déroulé et ordonner chronologiquement Déroulé, Paroles et réactions, Sources, sur toutes les fiches publiées, et rendre la règle durable. GO global d'Adrien pour ce lot (datation étayée, présentation, classement) ; aucun contenu, statut, HOLD ou brouillon modifié. Base : PR 151 (règle et tri) ; finition : relecture des sources (cette PR).

## Règle (code : `scripts/lib/chronologie.mjs`, partagé par le site et les contrôles QA)

1. **Date de l'événement établie** (`date_nature` evenement / approximative) → cette date, à sa précision réelle (jour, mois, année ; « Vers … » si approximative). Aucun jour fictif affiché.
2. **Sinon, date de publication de la source citée par l'élément** (`source.publie_le`) → « Information datée du … » (Déroulé) ou « Propos rapportés dans un article du … » (Paroles). Jamais présentée comme la date des faits : la ligne source ajoute « date des faits non établie ».
3. **Sinon** → « Date non établie » (+ « aucune date de publication exploitable »), classé en dernier.
4. **Relecture documentée** (`data/chronologie-reperes.json`, finition du 23/11) : (a) une **source antérieure** qui rapporte effectivement le même fait date l'information (« Information datée du … » + « première publication connue de ce fait : <source> ») — le texte reste attribué à la source d'origine ; (b) une **date d'événement explicite** du texte ou du contexte approuvé est lue à la précision réellement écrite ; (c) une **date de parution** lue sur la page elle-même remplace la date conservée quand elles diffèrent.

Principes : le texte n'est jamais lu par la machine pour y trouver une date (la relecture ci-dessous est humaine, cas par cas) ; une mesure annoncée pour une date future n'est jamais datée comme réalisée ; un jour de semaine relatif (« mardi », « ce mercredi ») n'est pas converti en date ; une date ambiguë ou contradictoire reste incertaine ; aucune date de mise à jour, de collecte ou d'import n'est utilisée.

**Ordre** : ascendant (plus ancien d'abord). Date partielle classée au début de sa période (« 2026-07 » avant « 2026-07-06 », « 2026 » avant « 2026-01 »), sans jour affiché. Sans date en dernier. Égalité → ordre d'écriture (tri stable). Sources : ordre de publication ; sans date en dernier, « (non datée) » ; références « Aussi » triées de même.

## Où c'est appliqué

| Rendu | Fichier |
|---|---|
| Déroulé (fiches **et** Hubs) : repère, tri, « Aussi » trié, source de repère | `web/src/components/Chronologie.astro` |
| Paroles et réactions (fiches) : repère + tri | `web/src/components/Paroles.astro` |
| Sources et inconnues (fiche) ; Sources de la fiche (Hub) | `FicheUnique.astro`, `Dossier.astro` |
| Réponses publiques de Hub : même libellé de repli (ordre rédactionnel conservé) | `Reponses.astro`, `web/src/lib/hub-matiere.ts` |
| Relectures documentées appliquées à l'affichage | `chargerHub` (`hub-matiere.ts`) → `appliquerRelectures` (`scripts/lib/chronologie.mjs`) |
| Signalement de génération `DATES_NON_ECRITES` | `scripts/lib/fiche-composer.mjs` |

Les dossiers (`data/hub-matiere`, `data/hub-approuve`, `data/evenements.json`) ne sont **pas** modifiés : les relectures vivent dans `data/chronologie-reperes.json` et s'appliquent à l'affichage (`chargerHubBrut`, qui porte l'empreinte approuvée, n'est pas touché ; les 62 empreintes `data-dossier` des fiches servies sont identiques avant/après). Toute génération future — nouvelle fiche, rejeu des projections, `appliquer-hubs` — passe par le même rendu. Une relecture dont l'étape n'existe plus à l'identique (dossier réécrit) est ignorée à l'affichage et fait échouer `test-chronologie.mjs` : elle est à refaire. Aucun appel OpenRouter, aucune notification, aucun GO.

## Contrôles

`node scripts/qa/test-chronologie.mjs [--dist web/dist | --site https://sousnosyeux.org]` (bloquant dans `scripts/qa/run-all.mjs`) : tests ciblés (précisions, repli, date « article » ≠ événement, tri stable sans perte, source de repère, relectures), correspondance de chaque relecture avec exactement un élément du dossier servi, couverture du corpus, et — avec `--dist` / `--site` — ordre et libellés du HTML produit ou servi (Déroulé, Paroles, Sources ; le contrôle des sources échoue si la liste est introuvable).

## Ce qui est vérifié dans les sources, et ce qui repose sur une convention

- **Vérifié dans les sources (relecture du 23/11/2026)** : les 37 étapes ci-dessous (lecture du texte des articles, pas de mots-clés), les 10 dates explicites et 2 paroles datées, la parution ICI Rots.
- **Repose sur la convention `publie_le`** : les 275 autres étapes des fiches datées par repli (295 « Information datée » au total, dont 20 dotées d’une source de repère relue). Leur repère est la date de publication enregistrée pour la source citée ; elle n'a pas été re-vérifiée page par page. `publie_le` ne distingue ni publication initiale ni mise à jour : un repère issu d'une mise à jour ne peut pas être signalé comme tel par la donnée seule.
- **Conflits de date constatés** : ICI Rots — page « Publié le lundi 16 novembre 2026 à 6h32 », date conservée 15/11 → corrigée à l'affichage (`publications`). Commons Média (FR-2026-0005) — date conservée 01/02/2026, métadonnées de la page 16/02/2026 : non tranché signalé, non corrigé ; l'étape correspondante est conservée. À confirmer dans Neon (hors périmètre de ce lot).

## Relecture des 37 étapes à source complémentaire antérieure

Règle appliquée : source antérieure retenue seulement si elle rapporte **le même fait** avec les éléments nécessaires de la proposition (sens, événement, personne, nuances) ; partielle, autre événement ou non concluante → repère conservé ; inaccessible sans extrait fiable → conservé et limite indiquée. Résultat : **20 corrigées, 13 conservées, 4 non vérifiables**.

| N° | Fiche | Étape | Source citée | Résultat | Justification |
|---|---|---|---|---|---|
| 1 | FR-2026-0114 | « Selon le communiqué du parquet de Bordeaux repri… » | France 3 Nouvelle-Aquitaine 21/09/2026 | conservé | ICI Gironde (19/09) rapporte le classement sans suite du second animateur, mais la proposition est attribuée au communiqué du parquet de Bordeaux repris par France 3 (communiqué publié le 21/09) : l’article antérieur n’en contient qu’une partie. |
| 2 | FR-2026-0115 | « Selon Sud Ouest, un dépôt de plainte a été enreg… » | Sud Ouest 09/07/2026 | non vérifiable | Sud Ouest du 06/07 : page inaccessible (délai dépassé) ; aucun extrait conservé. Un article sur la garde à vue ne dit probablement pas la connaissance de la plainte par la mairie avant le conseil municipal, mais ce n’est pas vérifié. |
| 3 | FR-2026-0115 | « Selon Sud Ouest, le centre de loisirs de Tarnos… » | Sud Ouest 13/09/2026 | conservé | Sud Ouest du 06/07 (inaccessible) : le fait (second animateur écarté « quelques jours avant la rentrée ») est postérieur à cette date de parution, l’article ne peut pas le contenir. |
| 4 | POC-02 | « Selon Ouest-France, dans le cadre de l'enquête,… » | Ouest-France 30/03/2026 | **corrigé** → Le Parisien 17/12/2025 | Le Parisien (17/12/2025) : « les enquêteurs se rendent à l’école pour entendre la vingtaine d’enfants de la classe » — même fait. |
| 5 | FR-2026-0124 | « Selon Le Figaro, les investigations ont été conf… » | Le Figaro 16/06/2026 | **corrigé** → Le Parisien 09/06/2026 | Le Parisien (09/06) : des officiers de la brigade territoriale de protection de la famille des Hauts-de-Seine mènent les auditions à l’école — même brigade, même enquête. |
| 6 | FR-2026-0139 | « Selon ici, une enquête a été ouverte pour des su… » | ici 16/10/2026 | conservé | Dernières Nouvelles d’Alsace (15/10) : animateur suspendu et plainte, mais ni l’enquête ouverte ni la brigade des mineurs. |
| 7 | FR-2026-0028 | « Selon Le Progrès, les familles des victimes supp… » | Le Progrès 30/04/2026 | conservé | Dauphiné Libéré (13/03/2025) : premiers faits de janvier 2025 ; l’information des familles des victimes supplémentaires (avril 2026) est un autre événement. |
| 8 | FR-2026-0046 | « Selon ICI, l'ancien animateur périscolaire de Re… » | ICI 09/06/2026 | non vérifiable | La Nouvelle République (24/04) : accès refusé (HTTP 403) ; aucun extrait conservé. |
| 9 | FR-2026-0046 | « Selon ICI, après sa condamnation, l'animateur a… » | ici 15/11/2026 | conservé | ICI (09/06) dit l’appel de la peine de six ans, pas les deux mois de détention ni le contrôle judiciaire actuel : l’article antérieur n’en contient qu’une partie. |
| 10 | FR-2026-0123 | « Selon TF1 Info, une enquête administrative a été… » | TF1 Info 12/02/2026 | **corrigé** → 20 Minutes 11/02/2026 | 20 Minutes (11/02) : « Une enquête administrative a été lancée » (communiqué de la mairie) — même fait ; le texte reste attribué à TF1 Info. |
| 11 | FR-2026-0123 | « Selon Nice-Matin, l'animateur du centre de loisi… » | Nice-Matin 03/10/2026 | **corrigé** → TF1 Info 12/02/2026 | TF1 Info (12/02) : l’homme de 40 ans « a été mis en examen mercredi à Nice » des mêmes chefs (agressions sexuelles, viols sur mineures de moins de 15 ans, par personne ayant autorité, harcèlement sexuel) et placé en détention — même fait. |
| 12 | FR-2026-0123 | « Selon 20 Minutes, trois plaintes avaient été dép… » | 20 Minutes 07/10/2026 | **corrigé** → Le Parisien 11/02/2026 | Le Parisien (11/02) : « Visé par trois plaintes », animateur du centre de loisirs de l’école maternelle Terra Amata — même fait (même texte dans 20 Minutes le 11/02). |
| 13 | FR-2026-0123 | « Selon Le Parisien, un animateur travaillant dans… » | Le Parisien 08/10/2026 | **corrigé** → Le Parisien 11/02/2026 | Le Parisien (11/02) : l’animateur du centre de loisirs de l’école Terra Amata « placé en garde à vue lundi » (propos de la procureure adjointe) — même fait. |
| 14 | FR-2026-0123 | « Selon France 3 Provence-Alpes-Côte d’Azur, la vi… » | Le Parisien 08/10/2026 | **corrigé** → France 3 Régions 02/10/2026 | France 3 Régions (02/10) : directeur de l’enfance suspendu trois mois et mis à la retraite anticipée, blâme, directrice suspendue deux mois, rappel à l’ordre — mêmes sanctions, même média que l’attribution. |
| 15 | FR-2026-0036 | « Selon Lyon Capitale, le groupe People & Baby dev… » | Lyon capitale 20/06/2025 | **corrigé** → France 3 Régions 18/06/2025 | France 3 Régions (18/06/2025) : « La direction, elle, annonce vouloir porter plainte contre le salarié » — même fait ; le texte reste attribué à Lyon Capitale. |
| 16 | FR-2026-0036 | « Selon France 3 Régions, aucun des parents rencon… » | France 3 Régions 18/06/2025 | non vérifiable | Médiacités (17/06/2025) : article d’abonnement, corps tronqué ; la phrase attribuée à Médiacités n’y figure pas dans la partie lisible. |
| 17 | FR-2026-0035 | « Selon Magic Maman, People & Baby avait informé l… » | Magic Maman 20/06/2025 | **corrigé** → France 3 Régions 18/06/2025 | France 3 Régions (18/06/2025) : People&Baby « affirme avoir signalé les faits à la PMI et à la CRIP » — même fait (présenté comme l’affirmation du groupe) ; le texte reste attribué à Magic Maman. |
| 18 | FR-2026-0035 | « Selon Magic Maman, à la suite d'un nouveau signa… » | Magic Maman 20/06/2025 | conservé | France 3 Régions (18/06/2025) ne dit que l’intention de porter plainte ; « a porté plainte » (Magic Maman) n’y figure pas : l’article antérieur n’en contient qu’une partie. |
| 19 | FR-2026-0035 | « Selon Magic Maman, une enquête de la brigade de… » | Magic Maman 20/06/2025 | **corrigé** → France 3 Régions 18/06/2025 | France 3 Régions (18/06/2025) : « l’enquête préliminaire, confiée à la brigade des mineurs » — même fait ; le texte reste attribué à Magic Maman. |
| 20 | FR-2026-0120 | « Selon BFMTV Lyon, l'animateur du centre périscol… » | BFMTV Lyon 02/07/2026 | **corrigé** → Le Parisien 11/06/2026 | Le Parisien (11/06) : « Le fonctionnaire a été suspendu par la mairie de Charly » — même fait ; le texte reste attribué à BFMTV Lyon. |
| 21 | FR-2026-0133 | « Selon france3-regions.franceinfo, un animateur d… » | france3-regions.franceinfo 16/11/2026 | conservé | ICI (page lue) est publié le lundi 16/11 à 6h32 (la date conservée, 15/11, est contredite par la page) : pas antérieur à France 3 (16/11). |
| 22 | FR-2026-0133 | « Selon les parents mobilisés, des signalements de… » | Actu.fr 17/11/2026 | **corrigé** → ici 16/11/2026 | ICI (page : « Publié le lundi 16 novembre 2026 à 6h32 ») : les familles reprochent à la municipalité d’avoir eu connaissance de premiers faits « dès le printemps » — même fait ; le texte reste attribué à Actu.fr (17/11). Date prise sur la page, non sur la date conservée (15/11). |
| 23 | FR-2026-0005 | « Selon la Ville de Paris, différents signalements… » | CNEWS 16/02/2026 | conservé | Commons Média : même fait, mais date de la page (16/02) contredisant la date conservée (01/02) : antériorité non établie. |
| 24 | FR-2026-0005 | « Le parquet de Paris a indiqué que les investigat… » | franceinfo 22/05/2026 | conservé | Journal du Dimanche (20/05) : brigade de protection des mineurs en charge, enquêtes préliminaires ; pas les juges d’instruction : autre stade de la procédure. |
| 25 | FR-2026-0024 | « Selon Le Parisien et Le Figaro, l’animateur avai… » | Le Parisien 22/05/2026 | **corrigé** → Le Figaro 18/05/2026 | Le Figaro (18/05) : « avait déjà fait l’objet d’une plainte en 2024 » à l’école Belzunce, « selon nos confrères du Parisien » — même fait, source citée dans l’attribution. |
| 26 | FR-2026-0029 | « Selon MidiLibre, l’enseignant avait été placé en… » | MidiLibre 08/01/2026 | **corrigé** → Le Parisien 07/01/2026 | Le Parisien (07/01) : « initialement placé lundi soir en garde à vue pour viol », faits requalifiés en agressions sexuelles et corruption de mineure — même fait. |
| 27 | FR-2026-0029 | « Selon le procureur de Laon, l’enseignant du coll… » | MidiLibre 08/01/2026 | **corrigé** → lamontagne.fr 07/01/2026 | La Montagne / AFP (07/01) : « sera jugé le 3 mars pour agressions sexuelles sur l’une de ses élèves, a annoncé mercredi le procureur de Laon » — même fait. |
| 28 | FR-2026-0044 | « Selon LyonMag, jugé pour agression sexuelle sur… » | LyonMag 04/12/2025 | non vérifiable | Le Progrès (03/12/2025) : article d’abonnement tronqué (titre « cinq ans de prison ») ; sursis, mandat de dépôt différé et interdiction ne sont pas lisibles. |
| 29 | FR-2026-0047 | « Selon L’indépendant, la mère de l’enfant a dépos… » | L’indépendant 30/09/2025 | **corrigé** → Ladepeche.fr 29/09/2025 | La Dépêche (29/09/2025) : « La mère de famille a directement porté plainte » — même fait ; le texte reste attribué à L’Indépendant. |
| 30 | FR-2026-0113 | « Placés en garde à vue, les deux agents sont ente… » | France 3 Nouvelle-Aquitaine 02/07/2026 | conservé | Le Figaro (01/07) dit les gardes à vue et perquisitions, pas la levée des gardes à vue ni l’exploitation du matériel par l’office anti-cybercriminalité (France 3) ; la date de l’étape est volontairement dite incertaine. |
| 31 | FR-2026-0113 | « Selon le parquet de Bordeaux, cité par France 3… » | France 3 Nouvelle-Aquitaine 02/07/2026 | **corrigé** → Le Figaro 01/07/2026 | Le Figaro (01/07) : « Sept plaintes ont été déposées par leurs parents, selon le parquet de Bordeaux » — même fait, Le Figaro figure dans l’attribution. (Page marquée modifiée le 02/07 : rien ne montre que ce passage y a été ajouté.) |
| 32 | FR-2026-0116 | « Selon le parquet cité par Sud Ouest, l’enseignan… » | Sud Ouest 29/09/2026 | conservé | ICI Gascogne (25/09) : le contrôle judiciaire n’apparaît que dans un paragraphe ajouté après la publication (« a-t-on appris ce mardi », page toujours marquée mise à jour le 25/09) : mise à jour, non antédatée ; la source citée (Sud Ouest 29/09) reste le repère. |
| 33 | FR-2026-0137 | « Selon le procureur de la République d'Angoulême,… » | ici 14/10/2026 | conservé | Charente Libre (13/10) rapporte la démarche des mères, non la déclaration du procureur d’Angoulême à laquelle le texte est attribué (publiée le 14/10). |
| 34 | FR-2026-0137 | « Selon ici, une enquête administrative a été lanc… » | ici 14/10/2026 | conservé | Charente Libre (13/10) : « enquête administrative » déclenchée, sans l’objet (circonstances précises, autres écoles) rapporté par ici. |
| 35 | POC-03 | « Selon Europe 1, le professeur était suspendu de… » | Europe 1 05/12/2024 | **corrigé** → Le Parisien 21/06/2024 | Le Parisien (21/06/2024) : le professeur « est mis à pied par sa hiérarchie » après le signalement — même fait ; le texte reste attribué à Europe 1. |
| 36 | FR-2026-0144 | « Selon Tendance Ouest, une enquête menée par la p… » | Tendance Ouest 10/11/2026 | **corrigé** → Actu.fr 06/11/2026 | Actu.fr (06/11) : enquête ouverte « pilotée depuis le commissariat de Rouen » contre un animateur périscolaire de l’école Marcel-Touchard — même fait. |
| 37 | FR-2026-0144 | « La Ville de Saint-Aubin-lès-Elbeuf indique avoir… » | Tendance Ouest 10/11/2026 | **corrigé** → Actu.fr 06/11/2026 | Actu.fr (06/11) : l’animateur « actuellement suspendu de ses fonctions » (courriel de la commune aux parents) — même fait ; le texte reste attribué à Tendance Ouest. |

Remarque sur les mises à jour : plusieurs pages antérieures retenues portent une date de modification d'un jour après leur publication (France 3 Régions 18→19/06/2025, Le Parisien 11→12/02/2026, Le Figaro 01→02/07/2026). Rien ne montre que les passages retenus y ont été ajoutés après coup ; les cas Le Parisien/20 Minutes (même texte le 11/02) et TF1 (12/02, même jour) sont confirmés par une seconde page. Pour France 3 Régions (06/2025) et Le Figaro (07/2026), la date de publication est conservée sans preuve d'ajout ultérieur.

## Dates d'événement récupérées dans les textes (10 étapes, 2 paroles)

| Fiche | Date retenue | Fondement |
|---|---|---|
| FR-2026-0043 | 01/07/2025 | Texte : l’enseignant « à la barre du tribunal correctionnel de Privas, mardi 1er juillet » (mardi 1er juillet 2025 : jour de la semaine concordant avec la parution du 01/07/2025). |
| FR-2026-0046 | 01/2026 | Texte : « lors du jugement rendu en janvier » ; le dossier date la condamnation du 22 janvier 2026 (étape France 3 Régions). Précision retenue : le mois. |
| FR-2026-0133 | 09/2026 | Texte : investigations « ont débuté fin septembre » (parution du 07/10/2026). Précision retenue : le mois. |
| FR-2026-0133 | 09/2026 | Texte : « Fin septembre, plusieurs familles ont déposé plainte » (parution de novembre 2026). Précision retenue : le mois. |
| FR-2026-0133 | 10/2026 | Texte : « Début octobre, le parquet de Caen a confirmé l’ouverture d’une enquête » (parution de novembre 2026). Précision retenue : le mois. |
| FR-2026-0149 | 10/2026 | Texte : enquête préliminaire « ouverte début octobre » (parution du 19/11/2026). Précision retenue : le mois. |
| FR-2026-0005 | 05/2025 | Texte : plainte « déposée en mai 2025 ». Précision retenue : le mois. |
| FR-2026-0005 | 20/05/2026 | Texte : gardes à vue de 16 personnes « ce mercredi matin » (JDD du 20/05/2026) ; l’étape voisine du dossier cite « les gardes à vue du 20 mai ». |
| FR-2026-0023 | 06/12/2025 | Texte : « samedi (le samedi précédant l’article du lundi 8 décembre) » : samedi 6 décembre 2025, déduction écrite dans le texte approuvé. |
| POC-06 | 13/11/2025 | Texte : plainte « annoncée à l’AFP le 13 novembre » par l’avocat : date de l’ANNONCE (le texte ne dit pas la date du dépôt). |
| FR-2026-0046 (2 paroles de l'avocat général) | 21/04/2026 | Contexte : propos tenus « lors de l'audience d'appel du 21 avril 2026 » (France 3 Régions). |

Non converties (repère d'information conservé) : mesures **annoncées** pour une date future (15/07/2026 Tarnos, 17/11 Rots, 07/12 Landes, prévisions « novembre » / « juin 2027 »), **jours de semaine relatifs** (« mardi », « ce mercredi », « jeudi » : FR-2026-0005, 0119, 0137, 0142, 0149…), **dates contradictoires** (FR-2026-0021 : « ce jeudi » vs « le 11 février » ; FR-2026-0113 : 30/06 vs mercredi), **annonce ≠ événement** (FR-2026-0142 : mise en examen annoncée le 02/07, date de la mise en examen non écrite), périodes de faits (FR-2026-0011, 0025, POC-03), parole à date non écrite (FR-2026-0115, 0114, 0005, 0119).

## Publication initiale et mise à jour

- Cas démontré : ICI Gascogne (Mées, FR-2026-0116) — la page, publiée et « mise à jour » le 25/09/2026 à 17h54, contient un dernier paragraphe « a-t-on appris ce mardi » (contrôle judiciaire) postérieur à cette date. Aucune étape du dossier ne tire sa date de ce paragraphe (la décision est citée à Sud Ouest, 29/09) : aucune antidatation à corriger ; la relecture n°32 conserve la source citée.
- Aucun autre cas démontré d'information ajoutée après la publication initiale parmi les étapes relues. Pas de mécanisme supplémentaire (le modèle ne porte pas la date de mise à jour).

## Cas non datables et limites résiduelles

- **Fiches** : 0 étape et 0 prise de parole sans repère.
- **Hub Paris 11e** (bloc « réponses », hors fiches) : 1 entrée « Date non établie » (page de suivi d'Innocence en Danger, sans date) ; même page « (non datée) » dans les sources de FR-2026-0047.
- **Non vérifiables (4)** : n°2 (Sud Ouest 06/07/2026, page inaccessible), n°8 (La Nouvelle République, HTTP 403), n°16 (Médiacités, abonnés), n°28 (Le Progrès, abonnés).
- Les étapes « conservées » pour attribution distincte (n°1, 18, 30, 33, 34…) pourraient être datées plus tôt pour un fait voisin mais pas pour la proposition telle qu'attribuée : choix délibéré.
- Mise à jour de `publie_le` dans Neon (ICI Rots, Commons Média) : hors périmètre ; la correction ICI Rots est faite à l'affichage.
