# LOT CORRECTIF — maintenance des affaires existantes (23/11/2026)

_Branche `fix/maintenance-lot-audit-21-11`, depuis `main` 2d32f99. **Rien n'est appliqué** : aucune écriture Neon, aucun envoi Telegram, aucun cycle de production, aucun déploiement, aucun contenu public modifié. Les mesures sur données réelles ont été faites en lecture seule ; les exports bruts et les URL de presse restent hors du dépôt public._

Objectif : qu'une évolution pertinente **arrive dans la mémoire de l'affaire**. Une recherche exécutée, une notification envoyée ou un ACCEPT ne le démontrent pas : la preuve exigée est la ligne `case_events` (ou la matière validée) puis sa projection (`data/evenements.json`).

## 1. Ce que l'audit du 21/11 avait mal établi (corrigé)

| Point | Constat corrigé |
|---|---|
| FR-2026-0004 « enquête » malgré la condamnation acceptée | **Ni export, ni défaut d'application.** L'événement « condamnation non définitive » (15/09/2026) est bien en mémoire (`case_events`, projeté dans `data/evenements.json`). L'état global reste « enquête » parce que l'affaire est sous **HOLD `CASE_GRANULARITY_REVIEW`** (21/09, `data/publication-holds.json`) : le lot du 25/09 a validé « le fait documentaire uniquement ». Les ACCEPT du 09/10 ont rattaché la source au même événement (aucun doublon, aucune mutation de `cases`). Seul défaut : le message « Appliqué en base » ne disait pas que le HOLD maintenait l'état → corrigé (une ligne). |
| 12 ACCEPT d'enrichissement sans `applied_event_id` | Voulu : tous sont de portée **territoire** (matière conservée dans `state_proposals.facts`, projetée seulement vers un Hub/fiche publics existants). Aucune décision perdue. |
| « Transmis » (0114.g5, 0133.g3) | **Faux au niveau du fait exact.** 0114 : le claim du 30/10 est établi mais **aucune proposition** ne porte les nouveaux signalements ; 0133 : les propositions du 17/11 portent le rassemblement, la suspension et un « la structure a été fermée » **faux** (bouton « fermer » de page, déjà corrigé par `sansChromeDePage`) — pas le contrat non reconduit, l'échange du 19/11 ni les 11 plaintes. Même requalification pour 6 autres faits (statut `LU_NON_CONSIGNE`). |
| Taux « 56 % des faits récents transmis » | Gonflé par les **témoins** (choisis parce que la maintenance avait trouvé une évolution) et par un rapprochement par article. Corrigé : sur les 4 témoins, 4 des 13 faits nouveaux exacts sont transmis (31 %) ; sur les **20 autres affaires, 0 des 17 faits nouveaux** (13 sur les 16 anciennes). Aucune extrapolation au stock : échantillon raisonné. |
| Publication récente ≠ événement récent | Séparés dans `AUDIT_EVOLUTIONS.csv` : `fenetre_evenement` (date de l'événement) et `publication_dans_90j`. Sur les 20 autres affaires : 5 événements dans les 90 jours (dont 4 nouveaux), 30 antérieurs (11 nouveaux). |
| Stock | **Éligible 82** (72 publiées + 10 candidates validées) ; **effectivement cherché 81** : FR-2026-0150 (publiée le 21/11) n'avait pas encore de passage. |
| Fenêtres de jours | 45 jours productifs (08/10→21/11) ; 44 avec recherche aboutie (échec total du 05/11) ; 29 = 22/10→21/11 (31 jours civils) hors 05/11 et 18/11 (4 runs ce jour-là) pour la mesure « affaire sans nouvel article ». Depuis sa première ligne, **chaque affaire éligible a une ligne chaque jour productif** (0 trou ; 3 283 case-jours sur 3 358 hors 05/11 = 97,8 %). Délai entre éligibilité et 1re recherche des 13 entrées tardives : non mesurable (date d'éligibilité non consignée). |
| 12/10 | **Pas un échec global prouvé.** Dans l'ordre de traitement : ~20 affaires normales puis une série de 28 affaires d'affilée sans nouvel article, run 2,3 fois plus long, 0 erreur comptée ; la plus longue série légitime des jours normaux est de 4. Hypothèse (non prouvée) : limitation de Google renvoyant des flux vides. Détection ajoutée (§3.4) ; cause non établie. |

## 2. Diff minimal (état de la branche : voir `git diff --stat` ; premier état : 11 fichiers modifiés, 10 nouveaux ; état après la revue contradictoire du 23/11, voir §5)

| Composant | Changement | Pourquoi (preuve) |
|---|---|---|
| `lib/routage-veille.mjs` `actes()` / `actesDetail()` | **Négation et rappel** : un acte nié (« n'a pas été mis en examen », « sans mise en examen », « aucune… ni… ») ou rappelé (« avait été », « déjà », « six mois après la mise en examen ») n'est plus un acte énoncé ; la portée s'arrête à la proposition (virgule, « mais », « et a… »). « classée sans suite » et « non lieu » reconnus (ne l'étaient pas). | claim `MISE_EN_EXAMEN` faux pour FR-2026-0133 |
| `lib/acte-procedural.mjs` (nouveau) | Faits **procéduraux sans changement de statut** (garde à vue, présenté au juge sans mise en examen, appel formé/annoncé, détention provisoire, remise en liberté, audience annoncée) : libellés fermés « Selon la presse… », date lue **à côté de l'acte**, filtre par stade, mémoire, une garde à vue levée ≠ placement, une demande ≠ une remise en liberté. | e75935cc écartée « source seule » |
| `telegram-v0.mjs` `decisionInstitutionnelle` | Si la proposition porte un acte procédural nouveau : demande de décision avec boutons (circuit `decisionReactions` existant, dédoublonnage au niveau du fait) au lieu de « source seule ». | idem |
| `appliquer-decisions.mjs` | Même détection à l'application → `case_events` ; message « HOLD actif » quand l'état global est tenu. | FR-2026-0004 |
| `lib/nouveaute.mjs` `memeFait` | Déduplication au niveau du fait : même libellé, dates non contradictoires (sans date ≡ daté). | « appel formé » sans date et daté du 18/11 |
| `lib/matiere-validee.mjs` | Un acte procédural validé reste un événement de l'affaire, pas une information de Hub. | pas de fuite vers les blocs « mesures » |
| `lib/routage-veille.mjs` `requetesVeille` | Le substitut « commune non précisée » ne part plus ; **repli distinctif** (mots du nom sans guillemets) et **repli commune** (commune + rôle, communes sans arrondissement) ; `titreDeRepli` ne garde que les titres qui parlent de l'affaire. | FR-2026-0012, FR-2026-0143 |
| `watch-updates.mjs` | Tentative / succès / erreur ; reprise **bornée à l'échec** (une fois, après pause) ; disjoncteur (5 échecs d'affilée) ; flux vides en rafale (> 8 d'affilée = deux fois le maximum observé) = erreur ; sortie 2 si **aucune** recherche n'a abouti ; `--cases A,B` (lot borné). Le repli ne part que si la recherche est **maigre (< 3 résultats) et sans nouveauté**. | 05/11, 12/10 |
| `maintenance-cycle.mjs` | Recherche en erreur → `NON_EXAMINE` + `[RECHERCHE_EN_ERREUR]` ; flux vide → `[FLUX_VIDE]` ; repli → `[REPLI]`. Valeurs existantes : **aucune migration**. | 05/11 : 77 lignes `NO_NEW_INFORMATION` |
| `rejeu-ecartees.mjs` + `lib/rejeu-ecartees.mjs` | Rejeu lecture seule des propositions écartées, classées par fait. | demande du 23/11 |
| 4 tests + faux fetch | `test-negation-actes` (13), `test-acte-procedural` (18), `test-recherche-veille` (19), `test-faux-faits-revue` (22), branchés dans `run-all`. | |

Seuils : **pas** de seuil de 20 % (arbitraire) ; chaque seuil est tiré d'une mesure : 3 résultats (recherche « maigre » : les cas aveugles rendent 0 ou 1), 5 échecs consécutifs (marge sur ≤ 1 échec isolé par jour), 8 flux vides consécutifs (2 × le maximum de 4 observé).

## 3. Vérifications exécutées

* `node scripts/qa/run-all.mjs` : **QA_PASSED** (les « constats du corpus réel » non bloquants sont antérieurs).
* Tests ci-dessus : 13 + 18 + 19 + 22 verts ; `test-routage` 52, `test-enrichissement`, `test-fait-deja-publie`, `test-sources-suivies`, `test-rapprochement-signaux` inchangés.
* **Parcours isolé** (PGlite local, structure copiée de Neon sans donnée, faux Telegram, scripts de production inchangés) — mêmes données synthétiques, deux versions du code :
  * *avant* (`8ede770`) : `écartée e75935cc : aucune information nouvelle à décider (source seule) : aucun message`, 0 message, 0 événement ;
  * *après* : message avec libellés fermés et boutons → clic VALIDATE (circuit réel `recevoir`) → ACCEPT → `appliquer-decisions --generique` → **2 lignes `case_events`** (`garde_à_vue`, `mesure_procédurale` datée du 19/11) → `project-evenements` → les 2 événements dans `data/evenements.json` ; rejeu du notifier et de l'application : **0 renvoi, 0 doublon**.
  * échec de recherche : même rapport (une erreur, un flux vide) → *avant* 2 × `NO_NEW_INFORMATION` ; *après* `NON_EXAMINE [RECHERCHE_EN_ERREUR]` et `NO_NEW_INFORMATION [FLUX_VIDE]`.
* **Rejeu des propositions écartées** (91 aujourd'hui = les 88 de l'audit + 3 depuis) : 9 `NOUVEAU` (11 faits, vérifiés à la main sur leurs citations), 12 `DEJA_SOUMIS`, 9 `PERIMEE`, 1 `RATTACHEMENT`, 60 `SANS_APPORT` (acte au stade déjà atteint, rappel, ou sans fait consignable : détail par motif dans le fichier local). Cette vérification manuelle a fait trouver **quatre faux faits ou fausses dates**, tous corrigés et testés : une *demande* de remise en liberté lue comme une remise en liberté ; une *levée* de garde à vue lue comme un placement ; la **première** date de la phrase attribuée à l'acte (détention datée du jour de l'interpellation) ; la plage d'un procès d'appel (« du 16 au 18 novembre ») prise pour la date de l'appel.
* **Requêtes** (Google Actualités, lecture seule ; 10 affaires aveugles + 9 contrôles, 23/11) :

| | Avant | Après |
|---|---|---|
| FR-2026-0143 (Courbevoie) | 1 résultat (déjà cité) ; article du 11/11 invisible | trouvé par le repli commune + rôle |
| FR-2026-0012 | 0 résultat | 26 résultats gardés (titres nommant l'établissement), dont 1 postérieur à la dernière source |
| Bruit du repli distinctif (FR-2026-0125) | 51 résultats hors sujet (« Père Jacques Hamel »…) | 1 gardé, 19 écartés par `titreDeRepli` |
| Faux rapprochements restants | — | 1 titre hors sujet sur 10 affaires (annonce immobilière, FR-2026-0023), qui s'arrêterait à la lecture (l'établissement n'est pas nommé) |
| Requêtes en plus | 0 | 1 à 2 pour ~10 des 81 affaires (≈ +9 % / jour) ; **0 pour les 9 contrôles** (recherche riche ou nouveauté) |
| Résultats bruts | — | une hausse brute n'est **pas** la mesure : seuls comptent les pertinents nouveaux (1 pour 0143, 1 pour 0012) |

## 4. Limites et obstacles à la mise en production

* **Aucune décision d'Adrien n'est engagée.** À décider : (a) le circuit « actes procéduraux » (libellés ci-dessus, une décision par proposition, `case_events` sans changement d'état) ; (b) le repli de requêtes (+≈ 15 requêtes/jour) ; (c) les corrections de fiches préparées hors dépôt (FR-2026-0026, FR-2026-0012, FR-2026-0144).
* Les propositions antérieures déjà écartées (marquées `telegram_envois` sans message) **ne reviennent pas toutes seules**. Un rejeu **borné** sur exports locaux est fait (§6) ; le rejeu complet exige une lecture Neon (colonnes manquantes listées au §6) : `scripts/rejeu-ecartees.mjs` (lecture seule) le produit.
* Une phrase de moins de 25 caractères (« Il a fait appel. ») n'est jamais un **fait** (garde héritée), mais son **signal** est désormais consigné avec la proposition (§8) ; l'appel de FR-2026-0012 reste une correction éditoriale.
* Non démontré : cause de l'absence de proposition pour les signalements de FR-2026-0114 (30/10) ; cause du 12/10 ; délai entre éligibilité et première recherche ; pertinence au-delà de 19 affaires.
* Déploiement : le code déployé est `main` ; ce lot est une branche poussée et une PR ouverte, **non fusionnée**.

## 5. Revue contradictoire (deux passes, 23/11/2026) — défauts confirmés et corrigés

Revue indépendante en lecture seule (phrases synthétiques, veille avec faux fetch, lecture des chemins notifier et application). **Passe 1 : 16 défauts** ; **passe 2 (sur les corrections) : 8 nouveaux**. Tous corrigés et couverts par `scripts/qa/test-faux-faits-revue.mjs` (22 tests). Principe retenu : **dans le doute, aucun fait** (un fait manquant se rattrape à l'article suivant ; un faux fait reste dans la mémoire).

| Famille | Défaut | Correction |
|---|---|---|
| Faux fait | refus / requête / écartement pris pour l'acte (« a refusé de le placer en détention », « a requis son placement ») ; sujets négatifs (« aucun… n'a été mis en examen ») ; renoncement à l'appel | négation par clitique `ne/n' … pas/jamais/plus`, sujets négatifs, incises, marqueurs d'écartement (état `ecartes`) |
| Faux fait (2e passe) | « n'a pas contesté / commenté sa mise en examen » devenait « pas de mise en examen » ; « libérés de la salle » = remise en liberté ; « interpellé par des parents » ; auteur de l'appel pris dans une proposition niée | verbe de parole ou d'attitude après le clitique ⇒ l'acte a eu lieu ; contexte judiciaire exigé pour « libéré » et « interpellé » ; auteur lu dans la première occurrence affirmée |
| Mauvais auteur / date | auteur d'appel pris n'importe où dans la citation ; date d'une décision, du jour où l'on apprend, de l'interpellation | auteur = sujet de la proposition ; date adjacente (≤ 25 car.), jamais rattachée à « décision du… », « rendue mardi », « a-t-on appris » ; audience : jour complet à ≤ 70 car. |
| Présentation au juge | à venir, niée, « déféré au parquet », deux suspects | affirmée, passée, devant un juge, aucune mise en examen affirmée dans les citations ; sinon libellé « pas de mise en examen » seul |
| Doublons | un fait sous deux libellés fermés ; mémoire rédigée à la main non reconnue (appel « Appel formé par le parquet… ») ; appel sans date avalé par un appel vieux d'un an | familles de mesures (`lib/mesures-procedurales.mjs`) ; repli par type + jour pour un événement hors table ; fait sans date « connu » seulement si l'événement est sans date ou daté dans les 10 jours |
| Décision ≠ écriture | l'application recalculait les faits (mémoire et état ayant pu changer) ; `applied_event_id` posé après le premier fait | `facts` gelé à l'envoi (faits montrés = faits écrits) ; identité par `dejaConnu` ; `applied_event_id` après tous les faits |
| Destination | message annonçant un Hub (bloc « mesures ») jamais alimenté | `destinationsDe` : acte procédural ⇒ fiche seulement |
| Relances | 9 échecs sur 10 sortaient en code 0 et le jour était marqué fait ; flux vides en rafale : repli doublé puis recherche de tout le stock ; `--cases` sans valeur ⇒ TypeError ; repli sur rôles génériques (« bordeaux autre ») | code 3 « passage incomplet » (la maintenance consigne, l'étape Z ne marque pas le jour : workflow, sortie `incomplet`) ; arrêt sur rafale, pas de repli après 3 flux vides (60 → 21 requêtes pour 20 affaires de test) ; `--cases` validé ; `--sauter-reussies-du-jour` (reprise bornée aux échecs, créneaux planifiés) ; rôles génériques exclus, titre de repli devant dire une affaire |

**Restent des limites connues (non corrigées, déclarées) :** une phrase qui cumule deux actes avec sujets différents n'est pas démêlée au-delà de la proposition ; l'auteur d'un appel n'est donné que si son sujet est écrit juste avant le verbe ; la date d'un appel dont l'article ne dit que « la décision de mardi » reste vide ; `--sauter-reussies-du-jour` lit `case_checks` : **exercé depuis sur une base locale isolée** (§7).

**Les chiffres des §3 et §5 datent du code d'avant la revue ; ceux des §6 à §8 sont ceux du code final.**

## 6. Rejeu des propositions écartées avec le code final — borné, limites exactes

> **Remplacé par le §10** (rejeu complet, lecture Neon autorisée). Ce paragraphe garde la trace du premier rejeu, borné aux exports locaux : ses écarts de classe (POC-10, FR-2026-0048, FR-2026-0122) étaient des artefacts du contexte absent.

**Source :** exports locaux du 21/11 (non versionnés) : 88 propositions ouvertes écartées sans message (75 `ENRICHMENT`, 13 `STATE_CHANGE` ; le rejeu précédent en comptait 91, trois sont postérieures à l'export). Les 13 `STATE_CHANGE` ne relèvent pas du lot (circuit d'état non modifié) : **75 relues**, avec le code de cette branche.

**Ce que les exports contiennent :** les citations littérales des 75 propositions, l'état des fiches, 40 événements consignés (24 affaires), les dates de publication des articles, les envois Telegram. **Ce qui manque pour un rejeu complet :** (1) le verdict de rattachement du modèle (`payload.rattachement`) — supposé `OK` ; (2) la mémoire complète des 75 affaires (événements de 24 affaires seulement, aucune information validée `ACCEPT`) ; (3) les faits en attente de décision de l'éditeur (`soumis`) ; (4) les trois propositions postérieures ; (5) l'adresse des articles (pour `dejaPublie`). La **classe finale** n'est donc pas établie ; le **fait détecté et sa preuve** le sont.

| Classe (rejeu borné) | Nombre | Lecture |
|---|---|---|
| `SANS_APPORT` | 59 | aucun acte ni mesure consignable (rappel, stade déjà atteint, sans acte) |
| `NOUVEAU` | 10 propositions / 12 faits | faits décidables, chacun avec sa citation |
| `DEJA_SOUMIS` | 5 | même fait déjà proposé par une autre écartée |
| `DEJA_CONSIGNE` | 1 | fait déjà en mémoire |

**Changements par rapport au rejeu précédent (dernier rejeu réel, code d'avant la revue) : 3 classes sur 75.** FR-2026-0122 `RATTACHEMENT → DEJA_SOUMIS` (hypothèse `rat = OK`, non vérifiable) ; POC-10 `DEJA_SOUMIS → DEJA_CONSIGNE` (le fait « inspection annoncée » est supprimé : la citation rappelait un constat de 2015) ; FR-2026-0048 `DEJA_SOUMIS → NOUVEAU` (artefact : `soumis` manquant, l'ancienne classe est probablement exacte). Les chiffres « 9 propositions / 11 faits » ne sont **pas** une cible et ne sont pas comparables (contexte différent).

**Vérification des faits nouvellement proposés (preuve = citation exportée, sauf mention) :**

| Affaire | Fait | Date | Preuve |
|---|---|---|---|
| FR-2026-0137, POC-07, FR-2026-0122, FR-2026-0011 | détention provisoire | 14/10/2026 (« mercredi »), 30/04/2026, 24/09/2026, 27/11/2025 (« écroué jeudi soir ») | date écrite ou jour de semaine calculé depuis la date de l'article : conformes |
| FR-2026-0145 | garde à vue | sans date | citation explicite ; le fait principal de l'article (statut de témoin assisté) sort des libellés fermés, non proposé |
| FR-2026-0146 | garde à vue ; « pas mis en examen à ce stade » | sans date | citation explicite ; la garde à vue est en cours : le libellé « à ce stade » reste exact (à relire si elle prend fin) |
| FR-2026-0114 | audience annoncée le 22/02/2027 | 22/02/2027 | **article relu en entier** : « renvoyé devant le tribunal correctionnel pour y être jugé le 22 février 2027 » — fait acquis, la citation exportée était tronquée au début |
| FR-2026-0046 | appel (générique) | sans date | « Il fait appel de peine » : ni auteur ni date inventés |
| FR-2026-0133 | garde à vue ; présenté à un juge sans mise en examen | 19/11/2026 | cas déclencheur, déjà traité |
| FR-2026-0048 | contrôle / inspection | — | dépend de `soumis` manquant ; « enquête administrative actuellement menée » = conduite, plus « annoncée » |

## 7. Passage incomplet et reprise — preuve sur base locale isolée

**Dispositif :** base PGlite locale (structure copiée de Neon, **aucune donnée copiée**), faux fetch (aucun réseau), **mêmes scripts de production** (`watch-updates`, `maintenance-cycle`, `garde-quotidien`) ; trois affaires synthétiques ; chemin SQL réel de `--sauter-reussies-du-jour` (`case_checks`) et compteur dans `discovery_etat`. Hors dépôt (dépendance PGlite non ajoutée) ; les décisions pures (plafond, fenêtre) sont testées dans le dépôt (`test-reprise-bornee`, 8).

| Étape | Résultat observé |
|---|---|
| 1. Une recherche réussit, deux échouent (HTTP 503) | code **3** (« passage incomplet : 2/3 ») ; `case_checks` : `NO_NEW_INFORMATION` (réussie), `NON_EXAMINE` + `[RECHERCHE_EN_ERREUR]` (2 échecs) ; compteur d'incomplets = 1 ; le jour **n'est pas** consigné |
| 2. Créneau suivant (`--sauter-reussies-du-jour`) | « reprise bornée : **1** affaire déjà examinée ignorée, **2** restantes » : seules les deux en échec sont cherchées ; l'une répond, l'autre échoue encore |
| 3. Dernier créneau | « 2 ignorées, 1 restante » ; plus aucune erreur ; code 0 ; le passage du jour est consigné ; le créneau suivant « ne fait rien » |
| 4. Invocation **sans affaire restante** | « 3 ignorées, **0** restante » ; **0 requête émise** (le faux service était en panne : aucun appel visible), `searches_failed = 0`, aucune ligne `case_checks` ajoutée, code 0 : ni faux échec, ni relance |
| 5. Cinq déclenchements le même jour sans réussite | les 3 premiers travaillent (compteur 1, 2, 3) ; les 4ᵉ et 5ᵉ « ne font rien — plafond 3, reprise complète demain » |

**Code ajouté :** `scripts/lib/reprise-bornee.mjs` (décision pure) ; `garde-quotidien.mjs incomplet` (compteur `quotidien:<nom>:incomplets`, valeur `AAAA-MM-JJ:N`) ; étape A du workflow : sur code 3, le passage incomplet est compté (jamais sur `workflow_dispatch`). **Avant : aucun plafond** — chaque créneau (≈ 24 déclenchements planifiés + relais) relançait la veille contre un service qui ne répond pas.

**Quatre états distincts** dans le rapport et `case_checks` : *absence de nouveauté* (`NO_NEW_INFORMATION`) · *flux vide* (`[FLUX_VIDE]`, tentative réussie, jamais compté comme échec) · *dégradation suspectée* (`DEGRADATION_SUSPECTEE`, `[DEGRADATION_SUSPECTEE]` : au-delà de 8 flux vides d'affilée, aucune panne n'est affirmée, la recherche n'est pas retenue comme « rien trouvé ») · *erreur technique* (`ERREUR`, `[RECHERCHE_EN_ERREUR]`). Une rafale de flux vides ne devient pas une panne : elle interrompt la veille (affaires restantes « non tentées », même état `DEGRADATION_SUSPECTEE`) et produit un passage **incomplet** (code 3, repris de façon bornée) — **jamais le code 2** réservé à « aucune recherche n'a abouti » (erreurs techniques seulement).

**Limite déclarée :** un échec **minoritaire** (≤ la moitié des recherches) sort en code 0 et clôt le jour ; ses affaires restent `NON_EXAMINE` et sont reprises au passage complet du lendemain.

**Parcours de l'enrichissement (base isolée, code final) :** (a) les faits **montrés** sont ceux **appliqués** : l'état de la fiche, la mémoire et la citation ont été modifiés entre la présentation et le clic, les deux faits gelés sont écrits tels que montrés ; (b) une **interruption** après le premier événement (déclencheur SQL) laisse 1 événement et la proposition non appliquée ; la reprise écrit seulement le second (« mesure déjà consignée : aucun doublon »), pose `applied_event_id`, et un rejeu n'ajoute rien ; (c) un `ACCEPT` sur une affaire sous **HOLD** était **appliqué** et projeté (défaut constaté, hérité) : désormais « HOLD actif sur la fiche : aucune écriture », l'`ACCEPT` reste enregistré non appliqué, la projection ne contient pas l'affaire.

## 8. Règle opérationnelle du fait incertain (remplace « un fait manquant se rattrape à l'article suivant »)

1. **Aucun fait incertain n'est inscrit comme établi** (libellé fermé, plus pauvre mais vrai : « Il a fait appel » dans une phrase qui porte son contexte → « un appel a été formé », ni auteur ni date).
2. **Le doute n'efface pas le signal** : `lib/signaux-actes.mjs` nomme l'acte vu et son état (`nie`, `ecarte`, `rappele`, `incertain`) ; le notifier le consigne avec la proposition écartée (`state_proposals.payload.ecartee` : motif + signaux, **colonne existante**, ni nom ni citation) ; la **source** (article) et les citations restent dans la proposition.
3. **Rien n'est supposé rattrapé plus tard** : un signal consigné se relit (`rejeu-ecartees`) et se décide, ou se rouvre si un article ultérieur le précise.

Cas « Il a fait appel » seul (16 caractères, sous le seuil de 25) : **aucun fait**, signal `APPEL_FORME / incertain` consigné (parcours isolé : `payload.ecartee` écrit à l'écartement d'une proposition à acte nié).

## 9. Cas BFMTV Baudin–Titon, découverte, acteurs

Voir `CAS_BFM_BAUDIN_TITON_23_11.md` (diagnostic, tableau par élément, enrichissements prêts, preuves de découverte, registre d'acteurs). Quatre défauts concrets corrigés (« annonce de la relaxe » lu comme annonce du rassemblement ; fait de territoire reproposé pour l'école voisine ; acte de l'autre école attribué à l'affaire ; deux faits institutionnels non soutenus par leur citation), `test-article-multi-affaires` (12 tests).

## 10. Rejeu COMPLET sur Neon (lecture seule autorisée, 23/11/2026 soir) — remplace le rejeu borné du §6

**Accès :** `SELECT` uniquement, via `scripts/rejeu-ecartees.mjs` (aucune écriture, aucun cycle, aucun envoi, aucun modèle). Aucun refus rencontré. Périmètre de référence : les **91** propositions du rejeu précédent (`--reference`) ; les arrivées ultérieures sont comptées à part.

| | Propositions | `NOUVEAU` | `SANS_APPORT` | `DEJA_SOUMIS` | `PERIMEE` | `RATTACHEMENT` | `DEJA_CONSIGNE` | `INDETERMINEE` |
|---|---|---|---|---|---|---|---|---|
| **Référence (91)** | 91 (76 `ENRICHMENT` + 15 `STATE_CHANGE`, circuit d'état non modifié) | 9 propositions / 11 faits | 58 | 12 | 9 | 1 | 0 | 2 |
| **Arrivées ultérieures** | 6 (toutes `ENRICHMENT`, 23/11 au matin) | 1 (FR-2026-0133 : « pas de mise en examen » + appel du parquet) | 3 | 1 | 0 | 0 | 1 | 0 |
| **Total** | 97 | 10 | 61 | 13 | 9 | 1 | 1 | 2 |

- **Couverture de l'export (§6) vs Neon :** l'export couvrait 88 propositions (75 `ENRICHMENT` relues). Neon couvre les 97 ; **aucune** proposition de référence n'a quitté l'ensemble écarté.
- **Contextes complets :** 97 sur 97 ont un verdict de rattachement (94 `OK`, 3 `DOUTEUX`), une mémoire lue (28 affaires sans aucun événement consigné — un état réel, plus une donnée absente), les faits déjà soumis, l'article et sa date. 6 propositions appartiennent à une affaire sous HOLD (FR-2026-0004, FR-2026-0048) : aucune n'est `NOUVEAU`.
- **Cas indéterminés :** 2 `ENRICHMENT` de la référence (FR-2026-0133, POC-10) à rattachement `DOUTEUX` sans fait détecté sont `INDETERMINEE` (nouvelle classe : une absence de fait n'établit pas l'absence d'apport quand l'article n'a pas été rattaché) ; une troisième est `RATTACHEMENT`. Aucun rattachement absent. Les **paroles** ne sont pas rejouables ici (elles exigent le corps complet de l'article, pas des fragments de citation) : voir §11.
- **Changements par rapport au rejeu précédent, par fait :** **0 sur 91** (mêmes 9 propositions / 11 faits, mêmes classes). Les écarts du §6 (POC-10, FR-2026-0048, FR-2026-0122) étaient des **artefacts du contexte absent de l'export** : avec le contexte complet, FR-2026-0048 et FR-2026-0122 restent `DEJA_SOUMIS`. Ce n'est pas un objectif atteint : c'est ce que donne le code final sur le contexte complet.
- **Faits nouveaux :** détention provisoire (FR-2026-0137, POC-07, FR-2026-0122, FR-2026-0011), garde à vue (FR-2026-0145), garde à vue + « pas mis en examen à ce stade » (FR-2026-0146), audience annoncée le 22/02/2027 (FR-2026-0114, article relu en entier), appel générique (FR-2026-0046), garde à vue + présentation sans mise en examen (FR-2026-0133) + (arrivée) « pas de mise en examen » et appel du parquet (FR-2026-0133).
- **Ce que ce rejeu ne fait pas :** il ne **représente** rien à l'éditeur (ces 10 propositions restent écartées sans message : la reproposition est le rattrapage de production, hors de cette étape).

**Date de publication de l'article BFMTV (réconciliée).** Neon, `articles.publication_date` = **2026-07-09** (colonne lue en texte : pas un décalage d'export) ; la page écrit « ce vendredi 10 juillet » et sa métadonnée dit 2026-07-10. Cause : la date enregistrée est celle de la **découverte** (flux de la veille), la page n'étant lue qu'à défaut (`maintenance-cycle`, « date de PUBLICATION… celle de la découverte »). Ce n'est **pas** la date de la mobilisation (jeudi 9 juillet, fait distinct) ; la coïncidence des deux jours ne doit pas les confondre. Conséquence : la source s'affiche « 09/07/2026 » dans les messages ; aucune date de fait n'en dépend (les paroles n'ont pas de date établie). Non modifié ici (règle de priorité de la date : décision de conception).

## 11. Paroles attribuées — le circuit existant les traite désormais

**Défaut établi (cas BFMTV) :** `extraireReactions` ne lisait que des mobilisations et des mesures (« jamais de parole citée ») ; aucune surface n'avait de proposition pour les avocates, la porte-parole ou les parents.

**Correction limitée (aucun nouveau moteur, aucun appel supplémentaire, aucune migration) :**
- `scripts/lib/paroles-attribuees.mjs` (fonction pure) enrichit la **même lecture** (le corps est déjà lu par `maintenance-cycle`, branche « analyse neuve » **et** branche « analyse réutilisée ») : déclaration entre guillemets, locuteur **tel que le média l'écrit** (prénom d'emprunt à astérisque, qualité), extrait **mot pour mot** (la phrase qui porte le nombre d'enfants est écartée, les autres restent), niveau `POSITION_ATTRIBUEE`.
- **Rattachement par le contenu :** l'établissement nommé dans le paragraphe, à défaut le dernier établissement nommé avant la déclaration ; l'autre école → pas cette affaire ; les deux, ou aucun → portée commune (territoire). Pour une parole dont l'article ne dit pas l'affaire, le **registre des acteurs** (`affaires_rattachees`, preuve hors de l'article) tranche — c'est lui qui rattache les avocates à Baudin.
- **Même parcours que les autres faits :** proposition `ENRICHMENT` séparée (version `paroles-0.1.0+reactions`, **une décision par parole**), message Telegram existant, `VALIDATE` → `state_proposals.facts` (ACCEPT) → matière validée → carte « Paroles et réactions » de la fiche (`carteReaction`) ou bloc « familles » du Hub (`carteReponse`). Aucune écriture `case_events` (pas de valeur d'énumération pour une parole). Identité = locuteur + extrait : jamais « le même type la même semaine », jamais de doublon avec la mémoire, les affaires voisines, les propositions déjà soumises ou la fiche publiée (`dejaPublie`).
- **Blocages explicites (jamais une parole inventée) :** déclaration sans attribution (ex. le §9 de l'article BFMTV) ; locuteur, qualité ou extrait qui nomme une personne mise en cause (prénom + initiale) ; extrait dont toutes les phrases portent le nombre d'enfants.
- **URL déjà connue :** requalifiée à sa **prochaine lecture** (la branche « analyse réutilisée » rejoue seulement la lecture déjà faite, aucun modèle) ; pour une URL qui ne revient pas, le **pont manuel existant** (`data/maintenance-urls.json`) avec un rapport ciblé désigne l'adresse, contrôlée comme toute autre. Rien ne rescane l'historique ; un second passage sur la même page retombe sur la même clé (`deja_presente`).

**Trois cas rejoués sur base locale isolée (mêmes scripts de production, pages servies localement, aucun réseau) :**
1. **BFMTV Baudin–Titon** (copie réelle de l'article) : **5 propositions pour Baudin** — les deux déclarations des avocates (rattachées par le registre), la porte-parole, deux parents — et **1 pour Titon** (la mère d'une élève de Titon) ; la mobilisation du 9 juillet, déjà en mémoire, n'est pas reproposée ; la déclaration sans attribution est bloquée avec son motif. 6 messages présentés, un `VALIDATE` sur un parent de Baudin et sur celui de Titon : conservés, projetés (bloc « familles » du Hub Paris 11e), **0 `case_events`**.
2. **Autre source avec une réaction pertinente** (père d'élève cité dans un article sur une garde à vue) : 1 proposition, même parcours.
3. **Source sans réaction exploitable** (guillemets d'ironie) : **aucune** proposition artificielle.
Rejeu du même rapport : **0 doublon** (10 propositions avant et après ; une version de proposition de parole indépendante du moteur évite la clé dupliquée quand l'analyse est réutilisée — défaut constaté sur une première version).

## 12. HOLD, reprises, bilan

**Portée exacte du HOLD de FR-2026-0004** (décision du 25/09/2026, lue en base : « VALIDATE le fait documentaire uniquement… Aucune mutation de `cases` ») : l'**état global reste gelé** (`enquête`), le **fait documentaire autorisé est préservé** (événement du 15/09, `case_events`, projeté) et un second article du même fait s'y rattache sans écrire (`FAIT_DEJA_CONSIGNE`) ; **aucun fait nouveau propre à l'affaire n'est appliqué automatiquement** ; un fait de **territoire** suit sa propre portée (aucune écriture ici). Contrôle ciblé sur base isolée (avant/après : 1 événement, état `enquête`, preuve rattachée) : voir la PR. Le notifier n'envoie plus de demande de décision sans effet pour un fait propre d'une affaire sous HOLD (motif consigné).

**Reprises : 3 passages incomplets au plus par jour, première tentative comprise.** Réessais internes documentés (par affaire et par passage) : une recherche = « en avant » + « ouverte » (+ 2 replis au plus, seulement si la recherche est maigre) ; en cas d'erreur, **une seule nouvelle tentative** après pause (`REPRISE_PAUSE_MS`, 20 s) → **≤ 8 requêtes** par affaire en erreur et par passage, **≤ 24** sur les 3 passages, **≤ 4** pour une affaire réussie (jamais relancée ensuite). **Défaut corrigé :** les requêtes contextuelles (23 par passage) étaient rejouées à chaque reprise ; elles ne le sont plus (un passage de reprise ne rejoue pas ce qui a abouti).

**Échec minoritaire : bilan distinct.** `watch-updates` écrit `bilan : complet | clos_avec_erreurs | incomplet | echec` (rapport et sortie) ; `garde-quotidien marquer --bilan` le consigne (`quotidien:<nom>:bilan`) ; le workflow le transmet de l'étape A à l'étape Z. Scénario (base isolée) : jour 1 — 1 recherche sur 3 échoue → code 0, **`clos_avec_erreurs`**, jour consigné ; jour 2 (simulé) — « 0 ignorée, 3 cherchées » (les réussites d'hier ne comptent pas), l'affaire en erreur est reprise, **`complet`**.

## 13. Vérifications finales

`run-all` : voir la PR (CI du commit final). Tests propres au lot : `test-faux-faits-revue` 22, `test-acte-procedural` 18, `test-negation-actes` 13, `test-signaux-actes` 8, `test-reprise-bornee` 8, `test-recherche-veille` 19, `test-article-multi-affaires` 12, `test-paroles-attribuees` 12, `test-sources-suivies` 25 (acteurs).

**Parcours sur base locale isolée rejoués avec le code final** (hors dépôt : dépendance PGlite non ajoutée ; journaux dans le dossier interne) : paroles (3 cas) · passage incomplet et reprise bornée · échec minoritaire et lendemain · contexte changé, interruption, HOLD (cas FR-2026-0004). Les parcours déjà prouvés (gel des faits, reprise après interruption) n'ont pas été reconstruits.

**Limites déclarées.** (1) Les paroles ne sont pas rejouables sur les 97 propositions écartées (corps d'article requis) : elles passent à la prochaine lecture de chaque page. (2) La requalification d'une URL qui ne revient pas dans la veille passe par le pont manuel existant et un rapport ciblé : aucune option nouvelle. (3) Les 10 propositions `NOUVEAU` du §10 restent écartées : leur reproposition est le rattrapage de production, non exécuté. (4) Le rattachement d'une parole par le contenu s'arrête aux établissements de la même commune présents en base ; une déclaration dont ni le paragraphe, ni le contexte, ni le registre ne désignent une affaire est proposée en portée territoire, jamais devinée.
