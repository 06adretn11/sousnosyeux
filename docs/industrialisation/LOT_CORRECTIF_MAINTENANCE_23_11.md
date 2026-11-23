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

## 2. Diff minimal (11 fichiers modifiés, 10 nouveaux ; état après la revue contradictoire du 23/11, voir §5)

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
* Les propositions antérieures déjà écartées (marquées `telegram_envois` sans message) **ne reviennent pas toutes seules** : un rejeu ciblé reste à autoriser (lecture seule disponible : `scripts/rejeu-ecartees.mjs`).
* Une phrase de moins de 25 caractères (« Il a fait appel. ») n'est jamais un fait (garde héritée) : l'appel de FR-2026-0012 passe par une correction éditoriale, pas par l'automatisme.
* Non démontré : cause de l'absence de proposition pour les signalements de FR-2026-0114 (30/10) ; cause du 12/10 ; délai entre éligibilité et première recherche ; pertinence au-delà de 19 affaires.
* Déploiement : le code déployé est `main` ; ce lot est une branche locale non poussée.

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

**Restent des limites connues (non corrigées, déclarées) :** une phrase qui cumule deux actes avec sujets différents n'est pas démêlée au-delà de la proposition ; l'auteur d'un appel n'est donné que si son sujet est écrit juste avant le verbe ; la date d'un appel dont l'article ne dit que « la décision de mardi » reste vide ; `--sauter-reussies-du-jour` lit `case_checks` (Neon) et n'a été vérifié ici que par lecture du code et par le faux fetch, pas contre la base.

**Vérifications après correctifs :** `run-all` QA_PASSED ; `test-faux-faits-revue` 22, `test-acte-procedural` 18, `test-negation-actes` 13, `test-recherche-veille` 19, `test-routage` 52 ; parcours isolé rejoué (2 `case_events`, message sans Hub, rejeu sans doublon) ; comparaison hors ligne sur 75 citations exportées : les 16 faits procéduraux sont conservés. **Le rejeu complet des 91 propositions écartées avec le code final n'a pas pu être relancé** (accès Neon non accordé pour cette étape) : les chiffres du §3 datent du code d'avant la revue ; commande à lancer en lecture seule : `node scripts/rejeu-ecartees.mjs --sortie <fichier hors dépôt>`.
