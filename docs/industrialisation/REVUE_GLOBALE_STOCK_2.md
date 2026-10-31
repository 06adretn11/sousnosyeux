# Revue globale du stock — dossier unique de décision (31/10/2026, version 3 : couverture en fiches individuelles)

*État recalculé le 31/10/2026 à partir de `main` (b69feb8) et de Neon : **66 cartes publiques** — les 65 du 30/10 plus **Orange (FR-2026-0142)**, publiée par votre clic Telegram « VALIDER ET PUBLIER » de 13:30 UTC (changement légitime concurrent, conservé). PARIS-009 reste retirée ; les versions approuvées de Tarnos `ec1f26661dfc9608`, Landes `a728e1a8dc22eb65`, Paris 11e `fc6fec65e0a310fc` et des 32 fiches approuvées sont inchangées ; les HOLD et les historiques de décisions aussi. Rien de ce qui suit n'est publié, approuvé ni fusionné tant que vous n'avez pas donné le GO de la section 0.*

Manifeste exécutable : [`ids-go-lot-stock-27-10.json`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/ids-go-lot-stock-27-10.json) — script [`go-lot-24-10.mjs`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/go-lot-24-10.mjs) `--liste=ids-go-lot-stock-27-10.json --ecrire` (désormais capable d'approuver un dossier qui ne vit que dans un Hub). Consolidations et réaffectations de sources : [`consolidations-30-10.mjs`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/consolidations-30-10.mjs) `--ecrire --go=JJ/MM/AAAA`.

**Règle de lecture.** Le GO couvre exactement les empreintes et changements listés : toute version modifiée ensuite sort du GO. Une exception retire sa ligne ; rien d'autre ne change. Les aperçus cités sont sur `main` (liens GitHub, empreinte écrite en tête de chaque aperçu). **Approuver un dossier dans un Hub n'est pas un GO pour une nouvelle page** : les 10 reprises de Hub de la section B1c sont donc des lignes du GO, pas une conséquence des Hubs.

## 0. Ce que vous décidez — un seul GO collectif, avec exceptions possibles

| # | Décision | Contenu exact | Recommandation |
|---|---|---|---|
| **1** | **Lot de fiches** (section B) | **26 créations** de page individuelle (dont 10 reprises de dossiers de Hub, 5 nouvelles préparées dans cette mission) + **2 mises à jour** = 28 lignes du manifeste, avec les rattachements de sources listés et 3 dates de parution rectifiées | Approuver |
| **2** | **Consolidations** (section C) | 4 doublons établis : PARIS-001 → FR-2026-0005, PARIS-008 → FR-2026-0008, PARIS-010 → FR-2026-0003, **FR-2026-0007 → PARIS-007** ; réaffectation de 3 sources (2 vers FR-2026-0005, 1 vers PARIS-007) | Approuver |

Plus aucune décision de carte à prendre : **FR-2026-0024** reste inchangée (section D) et **Orange** est déjà décidée (votre clic). Le GO couvre **les 28 lignes du manifeste et les consolidations, sauf exceptions que vous nommez**. Il **n'inclut pas** les décisions Telegram distinctes (messages 370, 371, 372 : section A).

**Résultat attendu après exécution** (état actuel / après GO) :

| | Actuel | Après GO |
|---|---:|---:|
| Cartes publiques | 66 | **62** (4 doublons retirés) |
| Fiches individuelles approuvées et publiées | 32 | **58** (32 + 26 créations ; 2 mises à jour sans changer le nombre) |
| Couverture (fiches / cartes) | 32 / 66 | **58 / 62** |
| Affaires sans fiche | 34 dont 11 dans un Hub seul | **4** : FR-2026-0004 (HOLD), 0013, 0016, 0026 (section E) |

## A. Autorisations déjà acquises, exécutées

| Décision d'origine | Action exacte | Résultat vérifié |
|---|---|---|
| Telegram 370 — **FR-2026-0003** « enquête → condamnation non définitive » : VALIDATE le 30/10 (21:01 UTC) | Carte projetée sur le site | Publiée (PR 80, `74f6fa0`) |
| Telegram 371 — **FR-2026-0047** « procès → condamnation non définitive » : VALIDATE le 30/10 (21:02 UTC) | Appliquée par le workflow (07:25 UTC le 31/10), publiée | Publiée (`33f9fba`) |
| Telegram 372 — FR-2026-0013 : **information sans bouton** | Aucune décision applicable ; aucun message renvoyé | Carte « plainte » inchangée |
| Proposition `275d28c3`, **FR-2026-0005** « enquête → mise en examen » + 3 écoles : VALIDATE le 25/09/2026 | Carte projetée | Publiée (PR 80). L'autorisation ne dépend d'aucune consolidation |
| Rattachements de sources des approbations des 13, 24 et 27/10 | Projetés sur 9 cartes (aucun état modifié) | Publiés (PR 80) |
| **Orange (Vaucluse)** — proposition `edefc366` (déposée et envoyée par le circuit Discovery existant après contrôle des doublons : aucune affaire ni proposition d'Orange ; message Telegram 383) | **Votre clic** « VALIDER ET PUBLIER » à 13:29:56 UTC ; publiée à 13:30 UTC (commit `b69feb8`, FR-2026-0142) | Carte « mise en examen », établissement non nommé, 3 sources. Sa fiche est la ligne B1b du lot |

**Vérification du contenu servi** : `verifier-site.mjs` compare le site à l'artefact **commité**, pas à Neon (défaut consigné dans la roadmap) ; la vérification finale de ce lot lira donc aussi les pages servies.

## B. Lot de fiches proposé au GO (26 créations · 2 mises à jour)

*« Différence avec le public actuel » : pour une création, aucune page individuelle n'existe aujourd'hui (« Fiche → » absent) ; l'état de carte ne change pas, et le Hub éventuel reste tel quel.*

### B1a. Créations préparées avant cette mission (11, reprises de la revue précédente)

| Fiche | Affaire · carte | Sources utilisées · limites | Rattachements ajoutés à la carte | Aperçu | Empreinte |
|---|---|---|---|---|---|
| **FR-2026-0001** | École Aqueduc, Paris 10e (animateur) · « condamnation non définitive » | AFP (Figaro 20/03, franceinfo 09/07) pour ce qu'ils établissent ; CNEWS (verdict du 10/07 : 18 mois avec sursis) ; le **Courrier des Stratèges reste seul** pour la convocation par procès-verbal et les interdictions, attribué comme tel. Libération 06/11/2025 non lue (403), Figaro 07/11/2025 = procédure de l'**enseignant** (FR-2026-0002) : non utilisés. Date des faits non établie ; appel inconnu | 4 : CNEWS (26/06), CNEWS (10/07), franceinfo (09/07), Le Figaro (20/03) · **date du Courrier rectifiée : 01/03 → 25/03/2026** | [FR-2026-0001](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0001.md) | `850d7ef7f2b55ec4` |
| **FR-2026-0003** | École Grands Champs, Paris 20e · « condamnation non définitive » (carte déjà corrigée, A) | Le Monde et Le Parisien du 16/10/2026 (peine : 3 ans de prison avec sursis probatoire, obligations et interdiction de 10 ans), CNEWS 20/03. **Dossier réduit à l'essentiel** (nom de la présidente du tribunal listé à tort comme « mis en cause » par le générateur ; citation graphique, témoignage de parent, propos de la présidente et doublons retirés ; appel : seul le délai de dix jours est rapporté). A_REVOIR | 1 : Le Monde (16/10) | [FR-2026-0003](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0003.md) | `c0c1ba9a71d1a958` |
| **FR-2026-0005** | École maternelle Saint-Dominique, Paris 7e · « mise en examen » (carte déjà corrigée, A) | **Dossier unique de la paire PARIS-001/0005** : CNEWS, Le Parisien (20/05 : 16 gardes à vue), JDD, franceinfo (22/05, parquet : deux mises en examen), READY. Quatre lignes issues du seul éditorial du Canard enchaîné retirées. Commons Média et MSN inaccessibles | 3 : JDD (20/05), Le Parisien (20/05), franceinfo (22/05). Le Parisien et MSN sont aussi **réaffectés** par la consolidation (C) | [FR-2026-0005](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0005.md) | `d912f887365f3798` |
| **FR-2026-0021** | Établissement non nommé, Les Mureaux · « mise en examen » | Le Parisien (14/02/2025) est la source d'origine ; la Gazette le relaie : **pas une confirmation indépendante**. Autres médias listés par Google Actualités (liens opaques) : aucun cité. La date reste écrite comme divergente et attribuée (13/02 vs 11/02). 3 étapes, suite inconnue | aucun | [FR-2026-0021](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0021.md) | `ce6e55035bf36fc4` |
| **FR-2026-0022** | Institution Saint-Dominique, Neuilly-sur-Seine · « enquête » | France 3 (04/2025), 20 Minutes. Dossier **inchangé**. Le Parisien du 20/05/2026 = école de Paris 7e (autre affaire) : sa ligne `sources` est réaffectée à FR-2026-0005 (C). Aucune suite documentée | 1 : 20 Minutes (18/04/2025) | [FR-2026-0022](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0022.md) | `d3ec303bfecf8a27` |
| **FR-2026-0029** | Collège Saint-Charles, Chauny · « condamnation non définitive » (décision `799854cc` conservée) | Dossier sobre : le refus du générateur était un défaut de lexique (« vient d'écoper de 24 mois de prison », France 3), garde corrigée pour cet idiome seul. Retirés : « faits le 5 janvier » (date de la garde à vue), propos-fragment du procureur, trois lignes dépendant de la page d'accueil locale « ici » | 3 : France 3 Régions (03/03), La Montagne (07/01), Midi Libre (08/01) | [FR-2026-0029](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0029.md) | `cbce5fe63e342711` |
| **FR-2026-0033** | Collège de Quartier-Français, Sainte-Suzanne · « mise en examen » | Linfo.re, Zinfos974. Clicanoo (07/04) : ne nomme jamais l'établissement et la commune a deux collèges → identité inférée, **non utilisé**. Dates de parution rectifiées (pages : Zinfos974 13/04, Linfo.re 14/04) ; mise en examen du lundi 13 avril datée | 0 · **dates rectifiées** | [FR-2026-0033](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0033.md) | `3df31ef5be6362b1` |
| **FR-2026-0044** | Établissement professionnel non nommé, Charentay · « condamnation non définitive » | Le Progrès et LyonMag (seul passage lisible disant « jugé et condamné »). Les articles du 13-14/10 = Soyaux (0137), L'Alsace = Orange : reclassés. Peine non reprise ; appel inconnu | 0 | [FR-2026-0044](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0044.md) | `c6c544e7ae14ca26` |
| **FR-2026-0122** | École maternelle privée Saint-Laurent, Paris 10e · « mise en examen » | Mise en examen et écrou du 24/09/2026 ; garde à vue du 22/09 : Le Parisien et Le Télégramme. Le Monde du 04/04 = Saint-Dominique 7e, jamais utilisé | 3 : Dauphiné Libéré (24/09), JDD (22/09), L'Indépendant (25/09) | [FR-2026-0122](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0122.md) | `a79e82a521edf9dd` |
| **FR-2026-0137** | École maternelle Julie-Victoire Daubié, Soyaux · « mise en examen » | 12 articles lus. Citation « C'est un séisme ! » attribuée à la directrice par Sud Ouest, avec la réserve de l'article ; reprises du parquet non citées | 7 sources de presse | [FR-2026-0137](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0137.md) | `2a586cb2adcb9fb0` |
| **POC-03** | École élémentaire Jules-Vallès, Plaisir · « condamnation non définitive » | France 3 (05/12/2024), Europe 1, Temps Réel 78, Gazette (05/02/2025 : remise en liberté, appel formé). Peine : **36 mois dont la moitié avec incarcération immédiate**. A_REVOIR (appel formé non daté) | 3 : Europe 1, Temps Réel 78, Gazette | [POC-03](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-03.md) | `9d13e7414edcd94c` |

### B1b. Créations préparées dans cette mission (5)

| Fiche | Affaire · carte | Sources utilisées · limites · ce qui a été corrigé | Rattachements ajoutés | Aperçu | Empreinte |
|---|---|---|---|---|---|
| **FR-2026-0002** | École Aqueduc, Paris 10e (enseignant) · « enquête » | Garde à vue d'un professeur rapportée par l'AFP (reprise Le Figaro, Le Parisien, JDD du 20-21/03/2026), suspension le jour du signalement (Figaro, rectorat), réunion du 16/10 et cellule psychologique (Le Monde). **L'état « plainte » est retiré** : les « deux plaintes contre X » ont été rectifiées par Le Monde le 07/11/2025 ; la carte « enquête » repose désormais sur la garde à vue. Aucune suite à la garde à vue ; Libération 06/11 non lu (403). A_REVOIR | 3 | [FR-2026-0002](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0002.md) | `4b13bab58ba654b8` |
| **FR-2026-0024** | École Belzunce, Paris 10e · « relaxe / non-lieu / classement » — **carte inchangée** | Voir la section D. Le Figaro (18/05/2026, classement **au conditionnel**), Le Parisien (22/05), Orange Actualités (reprise de 20 Minutes : ne nomme pas l'école, rattachement par recoupement), JDD (janvier 2025), Conseil de Paris (mai 2026, débats du Bulletin municipal officiel). Libellé de fiche : « Classement sans suite rapporté — aucune décision consultée ». Aucune décision lue ; 20 Minutes et Libération non lus. A_REVOIR | 3 | [FR-2026-0024](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0024.md) | `c22e4809eb4882c7` |
| **FR-2026-0047** | École Alexandre-Copello, Marseille 5e · « condamnation non définitive » (carte déjà corrigée, A) | La Provence (verdict du 31/03/2026 : 3 ans dont 2 avec sursis probatoire), Radio France (09/03), **page d'Innocence en Danger lue** (partie civile, obligations, délai d'appel de dix jours ; sa date d'affichage n'est pas prise pour la date du jugement), Figaro, Dépêche, L'Indépendant. **Retirés** : âge de la personne mise en cause, propos du procureur sur la crédibilité de l'enfant. Appel inconnu. Cause du blocage : une réponse vide du modèle avait été mise en cache (corrigé, testé). A_REVOIR | 3 | [FR-2026-0047](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0047.md) | `aaf82105ddf25f8d` |
| **PARIS-004** | École maternelle Paul-Dubois, Paris 3e · « enquête » | **Une seule source lue : 20 Minutes (20/02/2026)** : plainte du 9 février 2019, suspension le 13 février, classement sans suite en juin 2019 **suivi de la reprise de l'enquête**, information judiciaire ouverte en septembre 2019, aucune mise en examen rapportée. La proposition du générateur (« → relaxe/non-lieu/classement ») était **fausse** (le classement de 2019 n'est pas l'issue) : la carte « enquête » est exacte. Fiche courte, sans détail d'enfant ni propos de parents. Libération et Mediapart (403), Figaro du 27/02 (page illisible) : aucun fait n'en est tiré. A_REVOIR | 0 | [PARIS-004](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/PARIS-004.md) | `91993f1c537309d8` |
| **FR-2026-0142** | Lycée d'Orange, Orange · « mise en examen » (carte publiée par votre clic du 31/10) | L'Alsace, France 3, franceinfo (02/07/2026) : interpellation du 1er juillet, mise en examen, information judiciaire, contrôle judiciaire avec interdiction d'exercer au contact de mineurs. READY. Établissement non nommé (lycée du secteur d'Orange) ; suite inconnue | 0 (déjà rattachées) | [FR-2026-0142](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0142.md) | `3e299d99a4cd1bcc` |

### B1c. Reprises de dossiers de Hub déjà approuvés (10) — même rédaction, aucune extraction relancée

*Ces dossiers existent dans un Hub approuvé : la page individuelle en reprend le contenu sans le modifier (le Hub reste tel quel). Elles sont courtes quand la matière l'est : aucun remplissage.*

| Fiche | Affaire · carte · Hub | Sources du dossier · limites | Rattachements ajoutés | Aperçu | Empreinte |
|---|---|---|---|---|---|
| **FR-2026-0023** | École maternelle de la rue Faidherbe, Paris 11e · « enquête » · Hub Paris 11e | 20 minutes (08/12/2025) : plainte de la mère d'une élève ; enquête non confirmée par le parquet (source policière) ; aucune suite après décembre 2025 | 0 | [FR-2026-0023](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0023.md) | `5d7fcf75d28adcd3` |
| **PARIS-006** | École maternelle Parmentier, Paris 11e · « plainte » · Hub Paris 11e | ICI (01/08/2025), franceinfo (18/11/2025) : plainte du 17/11/2025 ; aucune suite ; deux maternelles citées, la fiche n'en porte qu'une | 2 | [PARIS-006](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/PARIS-006.md) | `9312131e1bbda47f` |
| **POC-05** | École maternelle Alphonse-Baudin, Paris 11e · « relaxe / non-lieu / classement » · Hub Paris 11e | franceinfo (14/11/2025, 26/05, 07/07, 09/07/2026) : relaxe des agressions sexuelles le 07/07/2026, condamnation pour harcèlement sexuel sur des collègues, **appel du parquet le 08/07 : la relaxe n'est pas définitive** (la fiche l'écrit, la carte ne le dit pas) ; date d'appel inconnue ; nombre d'enfants non repris | 5 | [POC-05](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-05.md) | `9579d7ff4af98ecc` |
| **POC-06** | École maternelle Bullourde, Paris 11e · « mise en examen » · Hub Paris 11e | France 3 (17/10/2025), franceinfo (14/11/2025), La Minute/AFP (07/02/2026) : mise en examen du 06/02/2026 et contrôle judiciaire ; qualifications différentes de celles de la plainte ; trois animateurs suspendus sans lien établi ; aucune suite après février | 2 | [POC-06](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-06.md) | `05b67e0fce75a362` |
| **POC-07** | École maternelle Servan, Paris 11e · « mise en examen » · Hub Paris 11e | ICI (12/05/2026), **seule source** : mise en examen du 30/04 et détention provisoire ; date donnée par un seul article ; aucune suite | 1 | [POC-07](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-07.md) | `75ce3dc64e6d3a51` |
| **POC-08** | École maternelle Voltaire, Paris 11e · « enquête » · Hub Paris 11e | Le Parisien (27/03/2026) : suspension et enquête confiée à la brigade de protection des mineurs ; date d'ouverture non précisée ; aucune suite | 0 | [POC-08](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-08.md) | `86ab451a1ff36ad8` |
| **FR-2026-0031** | Collège Simone-Veil, La Bâtie-Neuve · « condamnation non définitive » · Hub Hautes-Alpes | Alpes 1 et Dauphiné Libéré (20/02/2026, ce dernier en partie sous paywall, non cité pour ce qu'on n'en lit pas) : trois mois avec sursis probatoire et interdiction d'exercer ; appel inconnu | 0 | [FR-2026-0031](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0031.md) | `4be017e7def7ec66` |
| **FR-2026-0032** | Collège-lycée Saint-Joseph, Gap · « condamnation non définitive » · Hub Hautes-Alpes | BFM DICI, France 3 Provence-Alpes, Le Figaro (2025) : condamnation du 26/11/2025 à trois ans avec sursis pour atteintes sexuelles par autorité, relaxe pour les autres faits ; appel inconnu ; dates de suspension divergentes | 6 | [FR-2026-0032](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0032.md) | `3ab3197ce41f24fa` |
| **FR-2026-0113** | École maternelle Frida-Kahlo, Bordeaux · « enquête » · Hub Bordeaux / Gironde | Le Figaro, France 3 Nouvelle-Aquitaine, franceinfo (01-02/07/2026) : enquête préliminaire du parquet de Bordeaux, deux personnes suspendues, aucune mise en examen ; rien après le 3 juillet | 2 | [FR-2026-0113](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0113.md) | `d08a133aa745107d` |
| **FR-2026-0116** | École de Mées · « procès » · Hub Landes | Sud Ouest (25 et 29/09/2026), ICI Gascogne (25/09) : contrôle judiciaire, comparution à délai différé ; aucune date d'audience ; date d'écartement et type d'école (maternelle/élémentaire) divergents selon les articles | 0 | [FR-2026-0116](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0116.md) | `e1c9d0b08b59ddd5` |

**Recommandations** : approuver les vingt-six ; **0021 en version sobre** (alternative : REVIEW) ; **0137** : si vous préférez ne pas publier la citation de la directrice, retirez la ligne (nouvelle empreinte) ; **PARIS-004** : fiche courte sur une seule source, retirez la ligne si vous jugez qu'une source ne suffit pas (la carte « enquête » est exacte dans les deux cas) ; **FR-2026-0016** (Hub Paris 11e) n'est pas dans le lot (section E).

### B2. Mises à jour de fiches publiées (la version actuelle reste en ligne jusqu'au GO)

Décisions revérifiées le 31/10 : aucune nouvelle approbation ni proposition (POC-10 : version approuvée `b6c0d06e…`, POC-04 : `301b5f3d…`).

| Fiche | Changement exact | Limite | Rattachement | Aperçu | Empreinte |
|---|---|---|---|---|---|
| POC-10 Volontaires | +2 étapes (Le Parisien, 10/03/2026) : plainte des parents d'un enfant « à la mi-février » ; animateur « actuellement suspendu » | Informations de mars 2026 | +1 : Le Parisien (10/03/2026) | [POC-10](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-10.md) | `c300e67bbd798e1a` |
| POC-04 Émeriau | +2 étapes (Le Parisien, 12/10/2023) : interpellation le 4 octobre 2023, mise en examen et contrôle judiciaire | Fonction non reprise | +1 : Le Parisien (12/10/2023) | [POC-04](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-04.md) | `3ac5a2ffa8c2081b` |

## C. Consolidations de doublons (preuves conservées, aucune suppression, rien de public avant le GO)

| Paire | Preuves (intervenants · faits · périodes · procédures · sources) | Conclusion | Effets exacts après le GO |
|---|---|---|---|
| **PARIS-001 → FR-2026-0005** (Saint-Dominique, 7e) | Même école ; suspensions de janvier 2026, **16 gardes à vue du 20/05/2026**, **deux mises en examen du 22/05** ; PARIS-001 n'a qu'une source (MSN) | Doublon établi | **Id conservé : FR-2026-0005.** Sources : MSN (de PARIS-001) et Le Parisien du 20/05 (depuis 0022) réaffectées à 0005 (ligne `sources` déplacée, revue sur chaque affaire). PARIS-001 : `retirée`, revue `retirer` ; décision acquise et résolutions conservées. Carte : disparaît ; fiche : celle de 0005 ; Hub : aucun ; URL : aucune page propre |
| **PARIS-008 → FR-2026-0008** (Boulard, 14e) | Même école, mêmes trois animateurs suspendus depuis la mi-février, **même article** (Le Parisien 11/03/2026, même URL) | Doublon établi | **Id conservé : FR-2026-0008** (fiche approuvée `82fdc1186464a565`, inchangée). PARIS-008 : `retirée`, revue `retirer`. Carte disparaît ; Hub : aucun ; URL : aucune |
| **PARIS-010 → FR-2026-0003** (Grands-Champs, 20e) | Même école, même plainte du 30/09/2025, **même condamnation du 16/10/2026** ; source (Parisien 20/03) déjà source de 0003 | Doublon établi | **Id conservé : FR-2026-0003** (carte déjà publiée, A ; fiche B1a). PARIS-010 : `retirée`. Carte disparaît ; Hub : aucun ; URL : aucune |
| **FR-2026-0007 → PARIS-007** (Reuilly, Paris 12e) | **Même article de 20 Minutes du 19/09/2025 comme source des deux cartes** ; même école maternelle Reuilly (Paris 12e), même animateur écarté en septembre 2025, mêmes mesures (enquête administrative, signalement promis au parquet) ; « Reuilly II » est le même établissement. FR-2026-0007 : 4 sources lisibles, **aucun acte judiciaire** | Doublon établi | **Id conservé : PARIS-007** (fiche approuvée `d73547b2edf3aac7`, **non modifiée**). Source Linfo.re réaffectée de 0007 à PARIS-007 (PARIS-007 passe de 1 à 2 sources). FR-2026-0007 : `retirée`, revue `retirer` ; sa ligne 20 Minutes (même URL que celle de PARIS-007) et son historique restent en base. Carte « FR-2026-0007 » : disparaît ; Hub : aucun ; URL : aucune. **Limite signalée, hors lot** : la carte PARIS-007 dit « enquête » alors que sa fiche approuvée écrit qu'aucune procédure judiciaire n'est rapportée (enquête administrative) ; l'aligner passerait par le libellé de présentation `statut_libelle` — nouvelle empreinte, donc nouveau GO : non proposé ici |

Effet public global : **66 → 62 cartes**. Réversible : les lignes restent en base ; la réconciliation de publication exige un nouveau GO pour en ramener une.

## D. FR-2026-0024 — École Belzunce, Paris 10e (traitée par la fiche ; carte inchangée)

- **Origine du statut actuel** : import de mai 2026, commentaire « plainte… classement sans suite » ; aucune décision, revue ni événement en base.
- **Deux procédures séparées** : (1) la **plainte de 2024** à Belzunce, l'animateur placé en garde à vue ; (2) la **mise en examen de février 2026 à l'école maternelle Bullourde (Paris 11e)** — qui a sa propre carte (POC-06) : rien de Bullourde n'est transféré à 0024.
- **Dernière situation documentée** : « la plainte des parents **aurait** ensuite été classée sans suite » (Le Figaro 18/05/2026, d'après Le Parisien) ; Orange Actualités, qui reprend 20 Minutes, l'écrit à l'indicatif ; la Mairie affirme qu'il n'existait pas de dispositif de traçabilité des signalements classés sans suite ; au Conseil de Paris (mai 2026), une adjointe indique que des fautes ont été commises, que des procédures disciplinaires sont enclenchées et qu'un fichier permet désormais d'identifier les personnes ayant fait l'objet d'une procédure classée sans suite. **Aucune décision de classement n'a été consultée ; « relaxe » n'apparaît dans aucune source** ; aucune enquête de 2024 n'est rapportée comme ouverte.
- **Pourquoi « enquête » est abandonnée** : l'option A de la revue précédente afficherait comme ouverte une enquête de 2024 que les sources disent classée (au conditionnel) ; elle n'est plus recommandée.
- **Ce que la fiche écrit** (option de présentation existante `statut_libelle`, aucune nouvelle catégorie) : « Classement sans suite rapporté — aucune décision consultée ». Elle distingue **propos rapportés par la presse**, **déclaration de la Mairie**, **déclaration d'une adjointe au Conseil de Paris** et **décision judiciaire (aucune consultée)** ; elle ne supprime aucune information favorable à la personne mise en cause ; sans nom, âge ni détail.
- **Carte** : « relaxe / non-lieu / classement » **inchangée** ; recommandation : la conserver tant que la fiche la qualifie (la mention §8 des mentions légales — retrait en cas de classement confirmé puis démenti — reste applicable). Alternative hors lot : « plainte », moins avancée que l'acte établi (garde à vue). Le document du Conseil de Paris d'identifiant 186284 n'a pas été retrouvé par cet identifiant : le compte rendu des débats de mai 2026 ([BOVP](https://cdn.paris.fr/paris/2026/07/09/bovp-debats-mai-2026-DjQG.pdf)) a été lu à la place.

## E. Affaires qui restent sans fiche après exécution (4) et autres exceptions — blocage précis et recommandation

| Affaire | Blocage précis | Recommandation |
|---|---|---|
| **FR-2026-0016** (crèche Le Lagon des Ours, Paris 11e · « plainte » · Hub Paris 11e) | **Matière insuffisante** : une seule source partielle (Le Parisien 20/03/2026) ; la fiche tiendrait en une phrase de situation, sans fait exploitable. Le Hub l'approuve, sa page individuelle n'ajouterait rien | **Rester dans le Hub.** Ligne facultative : si vous voulez quand même la page courte, ajoutez au manifeste `FR-2026-0016` (empreinte `70bc6a5c3ef48f5c`) |
| **FR-2026-0013** (Clément-Ader, Athis-Mons · « plainte ») | **Preuve manquante** : message 372 → la primitive répond « aucun changement » ; « enquêteurs saisis » n'est pas une déclaration du parquet | **Conserver « plainte »** ; pas de fiche |
| **FR-2026-0026** (collège non nommé, Essonne · « procès ») | **Rattachement incertain / preuve manquante** : identité plausible (collège de Villemoisson-sur-Orge, mise en examen en 2016, franceinfo) mais carte « procès » (2021) non étayée (PDF du Parisien 503) ; antécédents identifiants de la personne : dossier non publiable. Aucun élément nouveau depuis la dernière revue | **REVIEW** ; rien à publier |
| **FR-2026-0004** (Vigée Lebrun, Paris 15e · « enquête ») | **HOLD** inchangé : revue de granularité depuis le 21/09/2026 (trois hommes / douze enfants en mars, un condamné / neuf enfants en septembre ; sources inaccessibles) ; faits territoriaux indépendants préservés | Inchangé — aucune levée |

*Résolus dans cette mission (ne sont plus des exceptions)* : FR-2026-0002, PARIS-004, FR-2026-0047, FR-2026-0024 (fiches B1b), FR-2026-0007 (doublon C), Orange (décidée et publiée), 11 dossiers de Hub seuls (10 en fiche B1c, 1 en E).

## F. Inventaire : une ligne par affaire publique (66)

*Une ligne = une affaire canonique. « Fiche individuelle » : approuvée aujourd'hui, candidate au GO, ou aucune. Les lignes « doublon » seront retirées des cartes après consolidation. Orange est comptée : sa carte est publique depuis votre clic.*

| Affaire | Carte publique (état) | Fiche individuelle | Hub | Manque précis · prochaine action |
|---|---|---|---|---|
| **FR-2026-0001** École Aqueduc, Paris 10e | condamnation non définitive | **candidate** (850d7ef7f2b55ec4) | — | GO du lot : création (B1) |
| **FR-2026-0002** École Aqueduc, Paris 10e | enquête | **candidate** (4b13bab58ba654b8) | — | GO du lot : création (B1) |
| **FR-2026-0003** École Grands Champs, Paris 20e | condamnation non définitive | **candidate** (c0c1ba9a71d1a958) | — | GO du lot : création (B1) |
| **FR-2026-0004** École Vigée Lebrun, Paris 15e | enquête | aucune | — | Inchangé — aucune levée — HOLD (revue de granularité depuis le 21/09/2026) ; sources inaccessibles |
| **FR-2026-0005** École maternelle Saint-Dominique, Paris 7e | mise en examen | **candidate** (d912f887365f3798) | — | GO du lot : création (B1) |
| **FR-2026-0006** École maternelle Rochechouart, Paris 9e | plainte | approuvée (fb80fca964705d6e) | — | — |
| **FR-2026-0007** École maternelle Reuilly II, Paris 12e | enquête | — (doublon) | — | Consolidation → PARIS-007 |
| **FR-2026-0008** École Boulard, Paris 14e | enquête | approuvée (82fdc1186464a565) | — | — |
| **FR-2026-0011** Structures périscolaires de Morigny-Champigny, Morigny-Champigny | mise en examen | approuvée (fe1fd4e2452b05e2) | — | — |
| **FR-2026-0012** Collège-lycée Saint-Jean-de-Passy, Paris 16e | condamnation non définitive | approuvée (a1165cf2585c95b8) | — | — |
| **FR-2026-0013** Lycée Clément-Ader, Athis-Mons | plainte | aucune | — | Conserver « plainte » ; pas de fiche — aucune décision judiciaire ; « enquêteurs saisis » n’est pas une déclaration du parquet |
| **FR-2026-0016** Crèche Le Lagon des Ours, Paris 11e | plainte | aucune | paris-11e | Rester dans le Hub Paris 11e (ligne optionnelle : approuver la fiche courte) — une seule source partielle (Le Parisien 20/03/2026) : fiche = une phrase de situation, sans fait exploitable |
| **FR-2026-0020** Lycée Notre-Dame, Mantes-la-Jolie | condamnation non définitive | approuvée (b3b8afcf8402bdcf) | — | — |
| **FR-2026-0021** Établissement non nommé, Les Mureaux, Les Mureaux | mise en examen | **candidate** (ce6e55035bf36fc4) | — | GO du lot : création (B1) |
| **FR-2026-0022** Institution Saint-Dominique, Neuilly-sur-Seine | enquête | **candidate** (d3ec303bfecf8a27) | — | GO du lot : création (B1) |
| **FR-2026-0023** École maternelle de la rue Faidherbe, Paris 11e | enquête | **candidate** (5d7fcf75d28adcd3) | paris-11e | GO du lot : création (B1) |
| **FR-2026-0024** École Belzunce, Paris 10e | relaxe / non-lieu / classement | **candidate** (c22e4809eb4882c7) | — | GO du lot : création (B1) |
| **FR-2026-0025** Collège-lycée Saint-Martin-de-France, Pontoise | mise en examen | approuvée (a328daccc2ffef42) | — | — |
| **FR-2026-0026** Collège non nommé, Essonne, commune non précisée | procès | aucune | — | REVIEW — pas de fiche — carte « procès » (2021) non étayée : franceinfo 2016 = mise en examen ; PDF du Parisien inaccessible (503) ; antécédents identifiants |
| **FR-2026-0027** École maternelle Les Aresquiers, Vic-la-Gardiole | mise en examen | approuvée (04ca3c7a38e157eb) | — | — |
| **FR-2026-0028** École primaire Robert-Doisneau, Lucenay | mise en examen | approuvée (cc4d35f3858e5324) | — | — |
| **FR-2026-0029** Collège Saint-Charles, Chauny | condamnation non définitive | **candidate** (cbce5fe63e342711) | — | GO du lot : création (B1) |
| **FR-2026-0030** Lycée Bagatelle, Saint-Gaudens | mise en examen | approuvée (0b212daa94d6ce9c) | — | — |
| **FR-2026-0031** Collège Simone-Veil, La Bâtie-Neuve | condamnation non définitive | **candidate** (4be017e7def7ec66) | hautes-alpes | GO du lot : création (B1) |
| **FR-2026-0032** Collège-lycée Saint-Joseph, Gap | condamnation non définitive | **candidate** (3ab3197ce41f24fa) | hautes-alpes | GO du lot : création (B1) |
| **FR-2026-0033** Collège de Quartier-Français, Sainte-Suzanne | mise en examen | **candidate** (3df31ef5be6362b1) | — | GO du lot : création (B1) |
| **FR-2026-0035** Crèche Joyeuse Tribu, Lyon 6e | relaxe / non-lieu / classement | approuvée (bfbe4b4100cc2c30) | — | — |
| **FR-2026-0036** Crèche Chat Perché, Lyon 3e | à qualifier | approuvée (73661843f953c783) | — | — |
| **FR-2026-0037** Centre de loisirs du Chambon, Laguenne-sur-Avalouze | mise en examen | approuvée (21768971b6575383) | — | — |
| **FR-2026-0038** École élémentaire non nommée, Saché | mise en examen | approuvée (161dba70870f535c) | — | — |
| **FR-2026-0041** Lycée non nommé, Rouen | condamnation non définitive | approuvée (47a158705b78aa24) | — | — |
| **FR-2026-0042** Collège Jules-Ferry, Delle | condamnation non définitive | approuvée (07c4467d69ad1b45) | — | — |
| **FR-2026-0043** Lycée Saint-Denis, Annonay | condamnation non définitive | approuvée (19a5f159833a99e8) | — | — |
| **FR-2026-0044** Établissement professionnel non nommé, Charentay | condamnation non définitive | **candidate** (c6c544e7ae14ca26) | — | GO du lot : création (B1) |
| **FR-2026-0045** Collège Jehan le Povremoyne, Saint-Valéry-en-Caux | condamnation non définitive | approuvée (5b6c8dfc662e4430) | — | — |
| **FR-2026-0046** École maternelle du Chêne-Creux, Rezé | condamnation non définitive | approuvée (e984bd7210939752) | — | — |
| **FR-2026-0047** École Alexandre-Copello, Marseille 5e | condamnation non définitive | **candidate** (aaf82105ddf25f8d) | — | GO du lot : création (B1) |
| **FR-2026-0113** École maternelle Frida-Kahlo, Bordeaux | enquête | **candidate** (d08a133aa745107d) | bordeaux-gironde | GO du lot : création (B1) |
| **FR-2026-0114** Centre de loisirs de Cenon (école Michelet), Cenon | procès | approuvée (e88bdcd643defd55) | bordeaux-gironde | — |
| **FR-2026-0115** Centre de loisirs municipal de Tarnos, Tarnos | mise en examen | approuvée (ec1f26661dfc9608) | landes | — |
| **FR-2026-0116** École de Mées (type non précisé), Mées | procès | **candidate** (e1c9d0b08b59ddd5) | landes | GO du lot : création (B1) |
| **FR-2026-0117** École Paul-Gauguin (périscolaire), Saint-Aubin-d'Aubigné | mise en examen | approuvée (ec6c7dcc3b4838d7) | — | — |
| **FR-2026-0119** Centre aéré (école maternelle non nommée), Morières-lès-Avignon | mise en examen | approuvée (d887a53e930a8f49) | — | — |
| **FR-2026-0120** Centre périscolaire / de loisirs de Charly (non nommé), Charly | mise en examen | approuvée (b3b0ce29f2d73f64) | — | — |
| **FR-2026-0122** École maternelle privée Saint-Laurent, Paris 10e | mise en examen | **candidate** (a79e82a521edf9dd) | — | GO du lot : création (B1) |
| **FR-2026-0123** Centre de loisirs de l'école maternelle Terra Amata, Nice | mise en examen | approuvée (7d45756c4d0e8418) | — | — |
| **FR-2026-0124** École maternelle Gustave-Bienvêtu, Colombes | enquête | approuvée (16071cfe70469bad) | — | — |
| **FR-2026-0133** centre de loisirs de Rots, Rots | enquête | approuvée (64e579a72c9cf9f8) | — | — |
| **FR-2026-0137** école maternelle Julie-Victoire Daubié, Soyaux | mise en examen | **candidate** (2a586cb2adcb9fb0) | — | GO du lot : création (B1) |
| **FR-2026-0139** Les Tournesols, Lingolsheim | enquête | approuvée (7bea2f3e47af82bf) | — | — |
| **FR-2026-0142** Lycée d'Orange, Orange | mise en examen | **candidate** (3e299d99a4cd1bcc) | — | GO du lot : création (B1) |
| **PARIS-001** École maternelle Saint-Dominique, Paris 7e | enquête | — (doublon) | — | Consolidation → FR-2026-0005 |
| **PARIS-004** École maternelle Paul-Dubois, Paris 3e | enquête | **candidate** (91993f1c537309d8) | — | GO du lot : création (B1) |
| **PARIS-006** École maternelle Parmentier, Paris 11e | plainte | **candidate** (9312131e1bbda47f) | paris-11e | GO du lot : création (B1) |
| **PARIS-007** École maternelle Reuilly, Paris 12e | enquête | approuvée (d73547b2edf3aac7) | — | — |
| **PARIS-008** École maternelle Boulard, Paris 14e | enquête | — (doublon) | — | Consolidation → FR-2026-0008 |
| **PARIS-010** École maternelle Grands-Champs, Paris 20e | enquête | — (doublon) | — | Consolidation → FR-2026-0003 |
| **POC-02** École maternelle Charlie-Chaplin, La Courneuve | condamnation non définitive | approuvée (53dcbef1f29f68eb) | — | — |
| **POC-03** École élémentaire Jules-Vallès, Plaisir | condamnation non définitive | **candidate** (9d13e7414edcd94c) | — | GO du lot : création (B1) |
| **POC-04** École Émeriau, Paris 15e | mise en examen | approuvée · **mise à jour au GO** (3ac5a2ffa8c2081b) | — | GO du lot : mise à jour (B2) |
| **POC-05** École maternelle Alphonse-Baudin, Paris 11e | relaxe / non-lieu / classement | **candidate** (9579d7ff4af98ecc) | paris-11e | GO du lot : création (B1) |
| **POC-06** École maternelle Bullourde, Paris 11e | mise en examen | **candidate** (05b67e0fce75a362) | paris-11e | GO du lot : création (B1) |
| **POC-07** École maternelle Servan, Paris 11e | mise en examen | **candidate** (75ce3dc64e6d3a51) | paris-11e | GO du lot : création (B1) |
| **POC-08** École maternelle Voltaire, Paris 11e | enquête | **candidate** (86ab451a1ff36ad8) | paris-11e | GO du lot : création (B1) |
| **POC-09** École Titon, Paris 11e | relaxe / non-lieu / classement | approuvée (b1389eedbc0e7c7d) | paris-11e | — |
| **POC-10** École Volontaires, Paris 15e | plainte | approuvée · **mise à jour au GO** (c300e67bbd798e1a) | — | GO du lot : mise à jour (B2) |

## G. Exécution après votre GO (ordre fixe)

1. Vérifier que les empreintes approuvées et les Hubs sont inchangés ; toute ligne dont le contenu autorisé a changé est isolée, les autres continuent.
2. `consolidations-30-10.mjs --ecrire --go=JJ/MM/AAAA` (3 réaffectations de sources puis 4 retraits), avant les approbations (0005 reçoit ses sources).
3. `go-lot-24-10.mjs --liste=ids-go-lot-stock-27-10.json --ecrire` (approbations, rattachements, 3 dates de parution).
4. Projections `project-public.mjs --modifier <id>` une affaire à la fois, retraits de cartes (circuit du 29/10), `promouvoir-fiche.mjs`, `project-evenements.mjs`, QA complète.
5. PR, **fusion seulement après les checks requis verts**, vérification du **contenu servi** (pages et cartes), puis seulement alors annonce Telegram avec le résultat API tracé. PARIS-009 ne réapparaît pas ; chaque version publique approuvée reste en ligne pendant son remplacement ; tout changement légitime concurrent (comme la publication d'Orange) est conservé.
6. Bilan final unique : publiées, consolidées, non publiées avec motif.

## H. Clé OpenRouter et bilan des coûts (à part, bref)

**Clé.** Étiquette `sk-or-v1-342…7a9`, plafond **50 $ par semaine** (reset le lundi 02/11 00:00 UTC) — une protection, pas un objectif. **GitHub et le poste utilisent la même clé** (diagnostic du 31/10, lecture seule). Relevé du 31/10 en fin de mission : cumul 30,79 $ ; **aujourd'hui 0,80 $** ; **semaine 4,22 $** ; **reste 45,78 $ sur 50 $**. Depuis la revue précédente (compteur 29,99 → 30,79 $) : **+0,80 $** (fiches 0047, 0002, 0024 et FR-2026-0142, qualification Orange, essais de génération) ; les relectures de dossiers de Hub et de sources n'ont pas appelé le modèle.

**Pics des 19 et 21/10 (audit clos, partiel).** Modèle `deepseek/deepseek-v4.1-flash` ; ≈ 11-12 k tokens de sortie par appel, ≈ 0,006 à 0,009 $ par appel ; 19/10 : 515 appels tracés, 3,14 $ (catalogue à blanc de 50 affaires + correctif d'entités) ; 21/10 : 693 appels, 6,03 $ (portée multi-affaires, rejeu du stock de 51 fiches). Aucun défaut reproductible n'explique les pics : le cache d'extraction est indexé sur tout le prompt, donc toute retouche du contrat coûte un rejeu complet (≈ 2,5 $) — comportement voulu, consigné dans la roadmap. La dépense facturée par jour n'est lisible qu'avec une clé de gestion.

## I. Méthode et limites

- **Relu à la main** : outre les articles de la revue précédente, cette mission a lu en entier ou en passages ciblés : 20 Minutes (PARIS-004), Le Figaro, Le Parisien, Orange Actualités, JDD (Belzunce), compte rendu des débats du Conseil de Paris (mai 2026), page d'Innocence en Danger (FR-2026-0047), Le Monde (rectificatif du 07/11/2025, FR-2026-0002). Rattachement ≠ contenu lu ≠ passage utilisé ; une reprise n'est jamais une confirmation indépendante ; une citation littérale ne suffit pas (acteur, affaire, portée et contexte vérifiés).
- **Code modifié (écarts démontrés seulement)** : `generer-fiche.mjs` ne sert ni n'écrit plus une réponse vide du modèle (`extractionValide`, test ajouté ; cause du blocage de FR-2026-0047) ; `go-lot-24-10.mjs` approuve un dossier de Hub tel que la page le lit. Aucun changement de contrat d'extraction ; 86 contrôles de génération et la QA complète passent.
- **Inaccessibles, donc non lus** : Libération (403), Mediapart, MSN, Commons Média, PDF du Parisien (503), page du Figaro du 27/02/2026 (code de page seul), liens Google Actualités (opaques). Aucun fait n'en est tiré.
- Qualification READY ≠ validation éditoriale : les dossiers relus à la main sont A_REVOIR ; aucun humain n'a relu ce lot avant vous. Corrections tracées dans `data/fiches-generees/<id>.json` (hors dépôt), champ `corrections_relecture`.
- Défauts documentaires et techniques consignés dans [ROADMAP_PRE_EXECUTEUR.md](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/ROADMAP_PRE_EXECUTEUR.md) (pilotage vivant) : aucun chantier lancé.
