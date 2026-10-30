# Revue globale du stock — dossier unique de décision (30/10/2026)

*État recalculé le 30/10/2026 à partir de `main` (30cfeaa + la PR de cette revue) et de Neon : **65 cartes publiques** (PARIS-009 retirée le 29/10 reste retirée ; l'ancien « 66 / 34 » n'est plus utilisé). Rien n'est publié, approuvé ni fusionné par ce dossier : il prépare **un seul GO collectif avec exceptions** (sections A à D) ; les trois corrections de carte demandées sur Telegram sont à part (section G).*

Manifeste exécutable après le GO : [`ids-go-lot-stock-27-10.json`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/ids-go-lot-stock-27-10.json) (script [`go-lot-24-10.mjs`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/go-lot-24-10.mjs) `--liste=ids-go-lot-stock-27-10.json --ecrire`) · consolidations et réaffectations de sources : [`consolidations-30-10.mjs`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/consolidations-30-10.mjs) (`--ecrire --go=JJ/MM/AAAA`).

**Règle de lecture.** Un GO couvre exactement les empreintes et changements listés : toute version modifiée ensuite sort du GO. Une exception retire sa ligne ; rien d'autre ne change. Tous les aperçus cités sont sur `main` une fois cette PR fusionnée (checks verts), avec l'empreinte exacte du manifeste.

## 0. Ce que vous décidez (en une fois)

| # | Décision | Contenu | Ma recommandation |
|---|---|---|---|
| 1 | **GO collectif — lot de fiches** (section A) | 7 créations de page + 2 mises à jour, aux empreintes exactes, avec leurs rattachements de sources | **Approuver**, éventuellement hors 0137 si vous voulez la relire d'abord |
| 2 | **GO — consolidations et corrections de données** (section D1) | 3 doublons établis (PARIS-001 → 0005, PARIS-008 → 0008, PARIS-010 → 0003) ; réaffectation de 2 sources vers FR-2026-0005 ; **carte FR-2026-0005 « enquête » → « mise en examen »** (décision déjà prise par vous le 25/09, jamais projetée) | **Approuver** |
| 3 | FR-2026-0024 (section D2) | Carte « relaxe / non-lieu / classement » : le classement n'est établi qu'au conditionnel | **Passer la carte à « plainte »** (ou la conserver : à votre choix) |
| 4 | Projection de 9 cartes déjà approuvées (section D3) | Sources déjà rattachées en base, absentes des cartes publiques (aucun état ne change) | Oui (optionnel) |
| 5 | Telegram (section G) | 3 messages reçus : 2 avec boutons (FR-2026-0003, 0047), 1 information sans bouton (FR-2026-0013) | Voir G |
| — | **Action de votre côté, une seule** : la clé OpenRouter a atteint **son propre plafond de 30 $** (section H) | Débloque les régénérations (0007, 0026, POC-03, 0005, 0029) et la Maintenance/Discovery de demain | Relever le plafond de la clé |

## A. Lot recommandé pour approbation (7 créations · 2 mises à jour)

Corrections documentaires faites le 30/10 (détail section C) : les fiches ont été relues contre les articles pour ce que vous avez signalé ; **cinq empreintes ont changé** (0001, 0021, 0044, 0122, 0137) : seules les nouvelles sont dans le manifeste.

### A1. Créations de fiche (page `/affaires/<id>/` + bouton « Fiche → » ; l'état de carte ne change pas)

| Fiche | Affaire · carte | Ce qui est publié (différence avec l'existant : aucune page individuelle aujourd'hui) | Sources réellement utilisées · limites | Rattachements (sources ajoutées à la carte) | Aperçu | Empreinte |
|---|---|---|---|---|---|---|
| FR-2026-0001 | École Aqueduc, Paris 10e (animateur) · « condamnation non définitive » | Condamnation du 10/07/2026 (18 mois avec sursis, atteinte sexuelle), contrôle judiciaire, charge jugée. **Corrigé** : l'AFP (Figaro 20/03, franceinfo 09/07) est cité pour ce qu'il établit (école et animateur ; contrôle judiciaire et charge) ; le **Courrier des Stratèges reste seul pour la convocation par procès-verbal et les interdictions** et est attribué comme tel ; « audience prévue en juin » retiré (dépassé) ; « faits » réécrits à partir de l'AFP. | CNEWS (26/06, 10/07), franceinfo (09/07), Figaro (20/03), Courrier des Stratèges, Parisien (20/03). Libération du 06/11/2025 non lue (403) et Figaro du 07/11/2025 : procédure de l'**enseignant** (FR-2026-0002), non utilisés ; JDD du 21/03 (multi-affaires) rattaché mais non cité. Date des faits non établie ; appel inconnu. | 4 : CNEWS (26/06), CNEWS (10/07), franceinfo (09/07), Le Figaro (20/03/2026) | [FR-2026-0001](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0001.md) | `41441fdf3b952e23` |
| FR-2026-0021 | Établissement non nommé, Les Mureaux · « mise en examen » | Mise en examen et contrôle judiciaire (février 2025). **Corrigé** : la Gazette (relais) écrit « le 11 février » alors que **Le Parisien, source d'origine, écrit « ce jeudi »** : la date n'est plus affirmée, la divergence est écrite et attribuée. | Le Parisien (14/02/2025, lead libre) ; la Gazette relaie le Parisien : **pas une confirmation indépendante**. Recherche ciblée (2 requêtes web) : aucune autre source ni source institutionnelle. 3 étapes, suite inconnue. | aucun | [FR-2026-0021](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0021.md) | `ce6e55035bf36fc4` |
| FR-2026-0022 | Institution Saint-Dominique, Neuilly-sur-Seine · « enquête » | Enquête préliminaire du parquet de Nanterre (France 3, 04/2025). Dossier **inchangé** ; fonction identifiante neutralisée. | France 3, 20 Minutes. Le Parisien du 20/05/2026 = école Saint-Dominique **Paris 7e** (autre affaire) : sa ligne `sources` publique est **réaffectée à FR-2026-0005 (D1)** ; Libération du 23/09/2025 : non lue, hors sujet. Dossier d'avril 2025, aucune suite. | 1 : 20 Minutes (18/04/2025) | [FR-2026-0022](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0022.md) | `d3ec303bfecf8a27` |
| FR-2026-0033 | Collège de Quartier-Français, Sainte-Suzanne · « mise en examen » | Six étapes, inchangées (relues sans défaut). | Linfo.re, Zinfos974 (01/04/2026). **Clicanoo (07/04/2026) relu : il nomme la commune et « un collège », pas l'établissement ; la commune compte deux collèges** → non utilisé, motif précisé. Suite inconnue. | aucun | [FR-2026-0033](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0033.md) | `45db2b6de5bbc8fd` |
| FR-2026-0044 | Établissement professionnel non nommé, Charentay · « condamnation non définitive » | Procès du 02/12/2025 et condamnation. **Corrigé** : accusation et « plusieurs mois » attribués au **Progrès** (passage libre) ; LyonMag conservé pour l'année des faits et le verdict (seul passage lisible disant « jugé et condamné »). | Le Progrès (paywall après le chapeau), LyonMag. Les 4 articles du 13-14/10 (CNEWS, Dauphiné, Charente Libre, Parisien) = **Soyaux (FR-2026-0137)**, reclassés « autre affaire » ; L'Alsace (02/07) = Orange, autre affaire. Aucune association « Charentay » n'existait en base. Limite : LyonMag donne la peine (5 ans dont la moitié avec sursis), non reprise dans la fiche. | aucun | [FR-2026-0044](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0044.md) | `c6c544e7ae14ca26` |
| FR-2026-0122 | École maternelle privée Saint-Laurent, Paris 10e · « mise en examen » | Mise en examen et écrou du 24/09/2026. **Corrigé** : garde à vue du 22/09 : **Le Parisien (information d'origine) et Le Télégramme ajoutés** ; la Montagne = reprise du Parisien (non citée). | Le Monde, Figaro, L'Indépendant, Midi Libre/AFP, JDD, Parisien, Télégramme : chacun nomme l'école du Xe. **Le Monde du 04/04/2026 = Saint-Dominique 7e → autre affaire, jamais utilisé pour Saint-Laurent.** | 3 : Le Dauphiné Libéré (24/09), JDD (22/09), L'Indépendant (25/09) | [FR-2026-0122](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0122.md) | `a79e82a521edf9dd` |
| FR-2026-0137 | École maternelle Julie-Victoire Daubié, Soyaux · « mise en examen » | Garde à vue du 12/10, présentation au juge, détention provisoire du 14/10. **Citation « C'est un séisme ! Honte sur notre institution ! »** : l'attribution à la directrice est établie par Sud Ouest (« a déclaré la directrice de l'établissement »), **mais elle précise parler « en tant que femme, maman et citoyenne » et que sa parole « n'engageait pas l'école »** : cette réserve est ajoutée à la citation. | 12 articles lus ; CNEWS, Dauphiné, Parisien du 14/10 = reprises du parquet, vérifiés comme étant Soyaux, non cités. Sud Ouest partiel (abonnés). 32 étapes avec redondances. Cette citation était rangée par erreur sous 0122 dans la demande : elle vit dans la fiche 0137. | 7 sources de presse | [FR-2026-0137](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0137.md) | `2a586cb2adcb9fb0` |

**Recommandations par fiche** : 0001, 0022, 0033, 0044, 0122 : approuver. **0021 : approuver en version sobre** (source d'origine unique et divergence de date écrite) ; l'alternative est REVIEW. **0137 : approuver** ; si vous préférez ne pas publier la citation de la directrice, retirez la ligne : la fiche change alors d'empreinte (régénération du rendu, pas du fond).

### A2. Mises à jour de fiches déjà publiées (la version actuelle reste en ligne jusqu'au GO)

Décisions vérifiées le 30/10 : aucune nouvelle approbation ni proposition depuis le 27/10 (POC-10 : version approuvée `b6c0d06e…`, POC-04 : `301b5f3d…`) ; les versions ci-dessous diffèrent, elles restent donc à décider.

| Fiche | Changement exact | Limite | Rattachement | Aperçu | Empreinte |
|---|---|---|---|---|---|
| POC-10 Volontaires | +2 étapes (Le Parisien, 10/03/2026) : plainte des parents d'un enfant de l'école « à la mi-février » ; animateur « actuellement suspendu » à cette date. Parcours antérieur non repris. | Informations de mars 2026. | +1 : Le Parisien (10/03/2026) | [POC-10](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-10.md) | `c300e67bbd798e1a` |
| POC-04 Émeriau | +2 étapes (Le Parisien, 12/10/2023) : interpellation le 4 octobre 2023, mise en examen et contrôle judiciaire ; au moins cinq signalements et plaintes. L'étape « vers octobre 2023 » est fusionnée dans l'étape datée. | Fonction non reprise (« un agent »). | +1 : Le Parisien (12/10/2023) | [POC-04](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-04.md) | `3ac5a2ffa8c2081b` |

## B. Situation unique de chacune des 65 cartes

| Situation principale | Nb | Affaires |
|---|---:|---|
| Fiche individuelle déjà approuvée et publiée, **inchangée** | 30 | les 32 approuvées sauf POC-04 et POC-10 |
| Fiche approuvée publiée, **mise à jour proposée** (A2) | 2 | POC-04, POC-10 |
| Bloc dans un **Hub public** (aucune page `/affaires/<id>/` : ce n'est pas une anomalie) | 11 | Paris 11e : FR-2026-0016, 0023, PARIS-006, POC-05, POC-06, POC-07, POC-08 · Hautes-Alpes : 0031, 0032 · Bordeaux/Gironde : 0113 · Landes : 0116 |
| **Candidate à créer** (A1) | 7 | 0001, 0021, 0022, 0033, 0044, 0122, 0137 |
| **Carte à corriger sur Telegram** (G) ; fiche après correction | 3 | 0003, 0013, 0047 |
| **Doublon établi, consolidation proposée** (D1) | 3 | PARIS-001 (→ 0005), PARIS-008 (→ 0008), PARIS-010 (→ 0003) |
| **Carte conservée à consolider** (D1) puis fiche après correction | 1 | 0005 |
| Décision sur la carte (D2) | 1 | 0024 |
| **REVIEW** (aucune publication) | 2 | 0002, PARIS-004 |
| **HOLD** inchangé | 1 | 0004 |
| **Blocage technique** (crédit modèle, ou garde-fou) | 4 | 0007, 0026, POC-03, 0029 |
| **Total** | **65** | (32 approuvées + 11 Hubs seuls + 22 autres ; POC-09, 0114 et 0115 sont à la fois approuvées et présentes dans un Hub) |

*(30 + 2 = 32 approuvées ; 3 + 3 + 1 + 1 + 2 + 1 + 4 + 7 = 22 autres.)* Hub ≠ fiche individuelle : le circuit refuse de générer une fiche pour un dossier déjà dans un Hub ; « une fiche par affaire » n'est pas atteint avec ces 11 surfaces différentes, et aucune décision n'est demandée à ce sujet.

## C. Corrections documentaires du 30/10 (où se trouvait l'erreur)

| Affaire | Constat | Où c'était faux · correction |
|---|---|---|
| 0001 | Courrier des Stratèges source unique de 3 étapes ; JDD, Libération 06/11, Figaro 07/11 | **Dossier généré** : AFP (Figaro, franceinfo) pour ce qu'il établit, Courrier attribué seul, étape « audience en juin » retirée. **Inventaire** : Libération 06/11/2025 non lue, rattachée à la procédure de l'enseignant. Rien n'est tiré de Libération. |
| 0001 / 0002 | 3 lignes « aqueduc » hors sujet (Marie de Médicis, rue de l'Aqueduc, aqueduc de la Dhuis) | **source_resolutions** : 6 associations détachées (lignes conservées). |
| 0021 | Pas de source indépendante | **Dossier** : date de mise en examen discordante entre le Parisien (« jeudi ») et la Gazette (« 11 février ») : écrite comme telle. Recherche ciblée sans autre source. |
| 0022 | Parisien 20/05/2026 = Saint-Dominique Paris 7e ; Libération hors sujet ; associations | **Ligne `sources` publique** (vraie erreur) → réaffectée à FR-2026-0005 (D1) ; **inventaire** corrigé ; **source_resolutions** : 2 associations hors sujet détachées (annuaire de lycées, article campus). |
| 0033 | Clicanoo « nomme l'établissement » | **Non confirmé** : il nomme la commune, pas le collège (2 collèges dans la commune). Inventaire précisé ; dossier inchangé. |
| 0044 | Soyaux dans l'inventaire Charentay ; Progrès préféré à LyonMag | **Inventaire** (aucune association en base) et **dossier** (voir A1). Parisien Soyaux ×2 rattachés à tort à PARIS-009 dans **source_resolutions** → déplacés vers FR-2026-0137 ; 1 association hors sujet de PARIS-009 détachée. |
| 0122 | Parisien, Montagne, Télégramme écartés à tort ; Le Monde 04/04 ; citation Sud Ouest | **Inventaire/dossier** (voir A1). La citation Sud Ouest est dans 0137, établie mais réservée. |
| Générateur | Titre « Issue de la procédure à documenter » | PR 77 (fusionnée, check vert) : texte adapté quand une condamnation est sourcée ; aucun stock régénéré. |
| Hubs | « 32 pages = 30 fiches + 3 Hubs » (33) | **Erratum** dans COMPLEMENT_E1_E2 : 28 fiches + 4 Hubs. |

## D. Décisions et consolidations

### D1. Doublons : conclusion raisonnée par paire (et consolidation proposée)

| Paire | Intervenants · faits · périodes · procédures · sources | Conclusion | Consolidation proposée (dans le GO ; aucune fusion publique avant) |
|---|---|---|---|
| **FR-2026-0005 / PARIS-001** Saint-Dominique, Paris 7e | Même école maternelle ; suspensions de janvier 2026 puis **16 gardes à vue du 20/05/2026** (Magic Maman, JDD, Parisien 20/05 : « plusieurs étaient déjà suspendus dans le cadre d'enquêtes préliminaires ») et **mises en examen de deux animateurs du 22/05** (franceinfo, parquet de Paris). Rôles « animateur » / « tiers » : même affaire à deux étapes ; PARIS-001 n'a qu'une source (MSN, inaccessible). | **Doublon établi** | Carte conservée : **FR-2026-0005**. Sources réaffectées : MSN (PARIS-001) et Le Parisien du 20/05 (depuis 0022). PARIS-001 retirée (historique conservé). **Carte 0005 « enquête » → « mise en examen »** : décision déjà prise (proposition `275d28c3`, VALIDATE du 25/09), événement public déjà affiché, **carte jamais projetée** ; elle regroupe aussi les écoles Rapp et La Rochefoucauld. La fiche 0005 est ensuite à régénérer (aujourd'hui BLOQUÉE par l'état de carte) ; sa fonction identifiante (« chef des animateurs », 2 lignes) sera neutralisée. |
| **PARIS-008 / FR-2026-0008** Boulard, Paris 14e | Même école, mêmes trois animateurs vacataires suspendus depuis la mi-février, **même article** (Le Parisien 11/03/2026, même URL). FR-2026-0008 : fiche approuvée (24/10, `82fdc1186464a565`). | **Doublon établi** | PARIS-008 retirée ; rien à déplacer (source identique). |
| **PARIS-010 / FR-2026-0003** Grands-Champs, Paris 20e | Même école, même compagnon d'une institutrice, même plainte du 30/09/2025, **même condamnation du 16/10/2026** ; mêmes dossiers générés. 0003 a 2 sources, PARIS-010 la même source Le Parisien du 20/03. | **Doublon établi** | PARIS-010 retirée ; carte conservée **FR-2026-0003** (sa correction « condamnation non définitive » : message Telegram, G). |

Effet public si D1 est approuvé : 65 → **62 cartes** (PARIS-001, PARIS-008, PARIS-010 disparaissent de la carte ; aucune page ni Hub n'y renvoie). Réversible : les lignes restent en base, la réconciliation exige un GO pour en ramener une.

### D2. FR-2026-0024 — École Belzunce (Paris 10e) · carte « relaxe / non-lieu / classement »

Deux procédures sont séparées : la **plainte de 2024** (école Belzunce, garde à vue) et la **mise en examen de février 2026 à l'école maternelle Bullourde (Paris 11e)**, que la carte ne porte pas. **« Relaxe » n'apparaît dans aucune source** : le libellé est la catégorie « classement » ; et le classement lui-même est dit **au conditionnel** (« aurait ensuite été classée sans suite », Le Figaro, 18/05/2026, d'après Le Parisien ; le Parisien du 22/05 ne le dit pas). Une fiche sobre limitée à la plainte de 2024 est possible ; elle reste à faire (crédit modèle) et **après** la décision sur la carte.
**Recommandation : carte → « plainte »** (seul état établi ; le classement devient une inconnue attribuée). Alternative : conserver. Si vous choisissez « plainte », j'ajoute `_cartes_seules { FR-2026-0024 : plainte }` au manifeste. La prudence éditoriale ne remplace pas la preuve manquante.

### D3. Cartes déjà approuvées, sources en base absentes de la carte publique (écart préexistant)

`project-public --diff` : 10 cartes diffèrent de Neon — FR-2026-0005 (D1) et 9 cartes dont seules les **sources** diffèrent (aucun état) : FR-2026-0011, 0028, 0042, 0114, 0115 (4 → 9), 0117, 0119, 0133, POC-09 (1 → 4). Ces sources ont été rattachées par les GO des 13, 24 et 27/10. **Recommandation : les projeter avec le GO** (une affaire à la fois). Non fait : je n'ai pas élargi le périmètre sans le dire.

## E. Autres exceptions (aucune publication)

| Affaire | Motif précis | Recommandation |
|---|---|---|
| FR-2026-0002 École Aqueduc (enseignant) · « enquête » · [aperçu](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0002.md) `5c0cb91528c3eaa8` | A_REVOIR : état plus haut que les sources ; document à identité ambiguë. Signalement du 14/10/2025, suspension, plaintes contre X ; garde à vue sans déferrement (AFP, 20/03/2026). Libération du 06/11/2025 (403) et Figaro du 07/11/2025 concernent cette procédure : rattachement à établir, rien n'en est tiré. | **REVIEW** (inchangé) |
| PARIS-004 École maternelle Paul-Dubois, Paris 3e | Enrichissement insuffisant (1 étape, 20 Minutes) ; Libération 18/02/2026 non lue (403) ; issue favorable à source unique | **REVIEW** (inchangé) |
| FR-2026-0004 École Vigée Lebrun, Paris 15e | **HOLD** : revue de granularité depuis le 21/09/2026 (trois hommes / douze enfants en mars, un condamné / neuf enfants en septembre ; sources inaccessibles). Carte « enquête » conservée ; faits territoriaux indépendants préservés ; aucune levée implicite. | Inchangé |
| FR-2026-0029 Collège Saint-Charles, Chauny · « condamnation non définitive » | **Carte correcte, avec votre décision `799854cc` du 25/09.** Fiche impossible : le verdict de France 3 (03/03/2026) est écarté par le garde-fou **`ISSUE_NON_ATTESTEE`** parce que la phrase citée (« Il vient d'écoper de 24 mois de prison… ») ne contient pas le mot « condamné », qui n'est que dans le titre ; la fiche retombait sur « procès » (blocage ETAT_NON_ETAYE). Garde-fou non contourné, aucune régression. | Carte conservée ; **fiche à régénérer après relèvement du plafond de la clé** (une tentative) |
| FR-2026-0007, FR-2026-0026, POC-03 | Non régénérés : plafond de la clé (H). 0026 n'a de toute façon aucune source lisible. Identité de 0007 et POC-03 : pas de paire de doublons identifiée. | Après relèvement du plafond |

## F. Exécution après votre GO (ordre fixe)

1. **Avant tout** : vérifier que les empreintes approuvées et les Hubs (Paris 11e `fc6fec65e0a310fc`, Landes `a728e1a8dc22eb65`, FR-2026-0115 `ec1f26661dfc9608`) sont inchangés ; toute ligne divergente est isolée, les autres continuent.
2. `go-lot-24-10.mjs --liste=ids-go-lot-stock-27-10.json --ecrire` (approbations et rattachements des sources lues).
3. `consolidations-30-10.mjs --ecrire --go=JJ/MM/AAAA` (réaffectations, retraits de doublons) ; carte 0005 (et 0024 si choisi) ; projections `project-public.mjs --modifier <id>` une affaire à la fois ; D3 si accepté.
4. `promouvoir-fiche.mjs`, `project-evenements.mjs`, QA complète, PR, **fusion seulement après les checks requis (Workers Builds)**.
5. Vérification du contenu servi (`verifier-site.mjs`), puis seulement alors annonce Telegram avec le résultat réel de l'API. PARIS-009 ne doit pas réapparaître ; la version publique approuvée reste en ligne pendant le remplacement.

## G. Telegram — trois corrections de carte (demande explicite, distincte du GO collectif)

Vérifié avant l'envoi : aucune proposition STATE_CHANGE, décision ou revue plus récente pour ces trois affaires (0003 : aucune ligne ; 0047 : 5 analyses ambiguës, 1 sans changement et 1 enrichissement, aucune envoyée ; 0013 : enrichissements dont un seul accepté). Circuit : primitive `etat-affaire` (moteur `rules`, sans modèle) + citation littérale vérifiée dans le corps + `state_proposals` + message. **Ces trois-là ne sont pas approuvées par le manifeste collectif** (retirées de `_cartes_seules`).

| Affaire | Message | Preuve montrée · limite |
|---|---|---|
| FR-2026-0003 | **Reçu, 2 boutons** (message 370, clé `ab79db79`) : enquête → condamnation non définitive | Le Parisien 16/10/2026 : « …le condamné, qui a 10 jours pour faire appel… ». Même condamnation que PARIS-010 (cohérent avec D1). |
| FR-2026-0047 | **Reçu, 2 boutons** (message 371, clé `57a6d73d`) : procès → condamnation non définitive | La Provence 30/03/2026 : « …a été condamné par le tribunal correctionnel de Marseille… 3 ans… ». Limite : jour non écrit ; rattachement classé « douteux » par la primitive (l'article nomme pourtant l'école Alexandre-Copello) : à confirmer. |
| FR-2026-0013 | **Information sans bouton** (message 372, clé `1fbe7d13`) | La primitive répond **NO_CHANGE** (article de 2023 antérieur à l'état courant) : rien n'est forcé. Passage montré : « Elle s'apprête à être entendue par les enquêteurs d'Athis-Mons, saisis du dossier. » **Limite écrite : ce n'est pas une déclaration du parquet sur l'ouverture d'une enquête** (le parquet confirme seulement la plainte) ; l'enseignante conteste. **Exception à trancher ici** : la carte « plainte → enquête » n'est pas établie par les règles ; recommandation : **ne pas corriger** (garder « plainte »). |

Les messages sont consignés dans `telegram_envois` avec leur identifiant réel d'API. Le message de la PR 69 (proposition enrichie « pages concernées ») **n'a pas pu être observé** : aucune de ces trois propositions n'est un enrichissement, et je n'ai envoyé aucun message de test.

## H. Blocage OpenRouter — cause précisée

La recharge du **compte** est bien prise en compte, mais l'API répond encore 402 car **la clé a son propre plafond de dépense : 30 $, 29,987 $ consommés, reste 0,013 $** (lu via `GET /api/v1/key`). Une génération (FR-2026-0005, 6 appels, 0,0125 $) a abouti avant l'échec de l'étape de regroupement. **Je n'ai plus lancé aucun appel** : 0007, 0026, POC-03 et la fiche 0029 ne sont pas régénérés ; leurs rendus du 20/10 sont conservés. Même clé pour GitHub Actions : la Maintenance et la Discovery de demain recevront aussi un 402 (verts sans résultat). **Action : relever le plafond de la clé** (openrouter.ai → Keys → limite), une seule fois.

## I. Signal à traiter — L'Alsace du 02/07/2026 : un enseignant de lycée à **Orange (Vaucluse)**, pas Charentay

Aucun dossier ni signal existant (cartes du Vaucluse : Avignon, Morières-lès-Avignon ; la Discovery n'a de mémoire que depuis le 06/09/2026). Trois sources libres (L'Alsace 02/07 : « mis en examen pour au moins deux viols, quatre agressions sexuelles et une tentative… » communiqué du parquet de Carpentras, contrôle judiciaire ; franceinfo 02/07 ; France 3 Provence-Alpes-Côte d'Azur). Établissement non nommé (« un lycée d'Orange »), nombreuses victimes présumées sur 2003-2026 : limites à respecter (pas de nom, pas de nombre exact d'enfants, pas de détail). **Non préparé** : la qualification Discovery exige un appel modèle (H). Une fois la clé débloquée : `discovery-quotidien.mjs --apres 2026-07-01 --avant 2026-07-03` — la proposition passera par Telegram, aucune publication automatique.

## J. Méthode et limites

- **Lu à la main aujourd'hui** : passages cités en A1, C, D, E (Figaro, franceinfo, CNEWS, Parisien, Télégramme, Montagne, Dauphiné, Charente Libre, Clicanoo, L'Alsace, LyonMag, Le Progrès, Gazette, Sud Ouest, Le Monde 04/04…). Rattachement ≠ contenu lu ≠ passage utilisé : les trois sont distingués ; un article multi-affaires justifie un rattachement, jamais un transfert de fait.
- **Inaccessibles, donc non lus** : Libération (403) partout ; Sud Ouest et Progrès partiels (abonnés) ; MSN. Aucun fait n'en est extrait.
- Qualification READY ≠ validation éditoriale ; aucun humain n'a relu ce lot avant vous. Les corrections de texte sont tracées dans `data/fiches-generees/<id>.json` (hors dépôt), champ `corrections_relecture`.
- Défauts documentaires consignés dans [ROADMAP_PRE_EXECUTEUR.md](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/ROADMAP_PRE_EXECUTEUR.md) (pilotage vivant) : garde-fou d'issue lié à la phrase, motif d'écart d'inventaire trompeur, Discovery sans mémoire avant le 06/09, plafond de clé. Pas de refonte de la recherche, des synthèses de Hub ni du dédoublonnage ; les améliorations des Hubs ne prouvent ni régénération automatique des synthèses ni dédoublonnage sémantique fiable.
