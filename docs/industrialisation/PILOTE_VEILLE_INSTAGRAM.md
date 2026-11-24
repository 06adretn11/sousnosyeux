# Pilote de veille Instagram — raccordé à la veille existante, NON ACTIVÉ (23/11/2026)

**État : préparé et testé en simulation ; jamais exécuté en production ; aucun workflow ne le lance.** Branche `feat/business-discovery-preuve` (rebasée sur `origin/main` `8a0d382`), non fusionnée, non poussée. L'accès Business Discovery lui-même est démontré par lectures réelles (voir [BUSINESS_DISCOVERY_1.md](BUSINESS_DISCOVERY_1.md)). Ce document décrit ce qui a été ajouté pour que `leursvoixnotrecombat40` et `sosperiscolaire` rejoignent la veille « sources suivies », et ce qui reste à décider.

## 1. Ce qui a été réutilisé, et ce qui a été ajouté

| Existant réutilisé tel quel | Ajout minimal |
|---|---|
| Registre unique `data/associations-watchlist.json` | un nouvel organisme `leurs-voix-notre-combat-tarnos` ; une page `type: "instagram"` pour lui et pour `sos-periscolaire` ; un bloc `_meta.instagram` (non secret) |
| `parcourirSources` : mémoire `source_resolutions`, comparaison d'empreinte, `classer` (rattachement par le texte), `passages`, propositions « déclaration d'organisme » sans bouton, revue humaine habituelle | un lecteur injecté pour les pages Instagram : les publications arrivent **déjà lues** (aucune requête à instagram.com) ; un état « non activé » quand aucun lecteur n'est fourni |
| `maintenance-cycle.mjs --sources-suivies` | l'option `--instagram-pilote` (absente de tout workflow) ; mesure `X.instagram` et ligne de journal sans adresse |
| Sonde et bibliothèque Business Discovery (`scripts/lib/business-discovery.mjs`) | `scripts/lib/veille-instagram.mjs` : budget, pagination, dédoublonnage, écart des témoignages, appel réel |

Rien n'écrit en production sans l'option ET un jeton `META_GRAPH_TOKEN` (secret à créer par le propriétaire) ; sans jeton, l'option produit une **panne consignée** (`ACCES:JETON_ABSENT`), jamais « aucune nouveauté ».

## 2. Budget par cycle : 4 appels

* Une première page (10 publications) par compte : 2 appels.
* Jusqu'à 2 pages supplémentaires, **seulement si** la dernière page lue ne contient aucune publication déjà connue en mémoire (l'historique couvert n'est pas atteint) et qu'un curseur existe ; elles vont au compte dont l'historique lu est le moins profond.
* Plafond atteint avec un historique non atteint : `historique_non_couvert: true` et la date de la plus ancienne publication lue, **dits** dans la mesure du cycle (`X.instagram`) et la ligne de console, jamais silencieux.
* Aucune relance ; arrêt net sur jeton refusé ou quota ; budget configurable dans `_meta.instagram.budget_appels_par_cycle` (1 à 12), 4 par défaut.
* Régime permanent attendu : une publication quotidienne d'un compte actif tient dans une page par compte, soit **2 appels par cycle** ; les 4 appels ne servent qu'au rattrapage (première exécution, absence prolongée). Ce chiffre est un raisonnement, **pas une mesure** : aucun cycle réel n'a eu lieu.
* Dédoublonnage : par identifiant de publication dans le cycle ; par permalien en mémoire entre cycles ; une légende modifiée d'une publication connue est vue au cycle suivant (empreinte de substance), sans délai hebdomadaire.

## 3. Règles éditoriales appliquées (et vérifiées par test)

* **Rattachement par le texte seulement** : c'est le résolveur existant (`classer`) qui décide ; l'adresse, le pseudo ou le siège d'un compte ne rattachent rien. Deux publications fictives le montrent : celle qui nomme l'établissement, la commune et le rôle est rattachée ; celle qui ne nomme que la commune et le type de structure ne l'est pas.
* **Lettre à la Ville de Paris** : une lettre adressée à la maire de Paris (parents « du 10ème », « écoles parisiennes ») n'est pas rattachée à l'affaire du 11ᵉ arrondissement (test).
* **Collectif de Tarnos** : organisme distinct, alias propres (« Leurs voix, notre combat »), portée « inconnue » ; sa note interdit de le confondre avec le collectif de familles non nommé cité par *ici* (07/10) et avec le collectif auditionné par le Sénat. **Je n'ai pas pu identifier ce dernier dans les données du dépôt** ; la garde est donc structurelle (alias distincts non génériques, test sur le registre), pas une comparaison avec une entrée précise.
* **Témoignages anonymes sensibles** : une légende qui commence par « Témoignage » est écartée **avant** tout classement ; destination `ECARTE_TEMOIGNAGE`, corps et titre vides, seul le marqueur de mémoire (empreinte, sans texte) est conservé. « Appel à témoins » et la légende d'un collectif qui évoque un témoignage ne sont pas écartés (test). Limite : l'heuristique ne voit que le début de la légende ; un récit sensible sans cette amorce ne serait pas écarté.
* **Légende seule** ; jamais un état judiciaire ; une déclaration associative reste attribuée, sans bouton, sans changement de statut.

## 4. Mesure hors ligne (rejeu de lectures réelles, **aucun appel Meta**)

`node scripts/mesurer-pilote-instagram.mjs` rejoue l'export local des 30 publications réellement lues dans le parcours existant, deux cycles successifs, mémoire temporaire.

| | Cycle 1 | Cycle 2 |
|---|---|---|
| Appels que le pilote aurait faits | 3 sur 4 (2 pages pour `leursvoixnotrecombat40`, 1 pour `sosperiscolaire` : ses 10 publications lues tiennent dans une page) | 2 (historique connu) |
| Documents | 30 (tous « nouveaux ») | 20 (les premières pages seulement), tous « inchangés », 0 modifié |
| Témoignages anonymes écartés | 9 | 9 |
| Autres destinations | 17 « position générale », 4 « hors périmètre » | 7 « position générale », 4 « hors périmètre » |
| **Rattachées à une affaire** | **0** | 0 |
| **Propositions utiles produites** | **0** | 0 |

**Lecture honnête.** Le résolveur existant exige les jetons de l'établissement (« municipal » et « Tarnos » pour la fiche `FR-2026-0115`) ; les légendes écrivent « centre de loisirs de Tarnos » sans « municipal » : **aucun lien n'est établi par le texte**, donc aucune proposition. C'est conforme à la consigne, et c'est aussi un résultat : sur ces 30 publications, la chaîne automatique ne remonte rien. Une lecture humaine en a repéré quatre utiles (déclaration du collectif sur les refus de plainte, appel à témoins, piste de presse sur un article de journaliste, lettre à la Ville de Paris, voir le rapport principal) : **elles resteraient en mémoire documentaire, sans notification** (`POSITION_GENERALE` ou `HORS_PERIMETRE`). Plusieurs étaient même classées « hors périmètre — sans lien avec les violences faites aux mineurs » (quatre, en réalité), un libellé inexact lié au vocabulaire du filtre. *Ce constat est celui du premier passage ; le second passage (alias, signal « à confirmer », thème élargi) est décrit au §4 ter, avec une pièce remontée sur 20.*

## 4 bis. Relecture indépendante des ajouts (agent distinct) et suites

Verdict de la relecture : aucun défaut bloquant pour l'état actuel (pilote non activé) ; onze constats, dont quatre « à corriger avant toute activation ». **Corrigés et testés** :

| Constat | Traitement |
|---|---|
| Écart des témoignages trop étroit (« Nouveau témoignage », « Récit d… », « Parole de… », lettres espacées, forme décomposée, hashtag en tête) | Heuristique élargie à la première ligne utile, normalisée ; filet en échec fermé pour un récit à la première personne entre guillemets (« mon fils… ») ; compteur `ecartes` par compte. Limite : « témoignage » placé loin dans la légende n'est pas vu. |
| `passages()` ignorait le premier bloc (une légende en un bloc donnait 0 passage : rattachement sans proposition) | Option `sansTitre` pour les publications Instagram ; test d'un cas « un bloc ⇒ au moins 1 passage nommant l'établissement » |
| Pseudos dans les journaux CI publics | En CI, la console n'affiche que des compteurs ; `::warning::` quand un compte est en panne ou interrompu |
| Alias du compte pris pour « preuve complémentaire » ; libellé « L'association… » inadapté à un collectif de familles | Pour une publication de compte : aucun alias comme passage, preuve complémentaire **par la même URL seulement**, **aucune déclaration décidable** (information sans bouton) ; `chargerRegistre` refuse un alias partagé ou générique pour un organisme à compte Instagram |
| Budget : plafond de 12 au lieu de 4 | Plafond du pilote ramené à 4 (le relever est une décision) |
| Panne d'une construction du lecteur interrompant toute l'étape | `TLS_NON_VALIDE`, `JETON_INVALIDE`, `CONFIG_INVALIDE`, `JETON_ABSENT`, `CONFIG_ABSENTE` deviennent une panne consignée par compte |
| `fetch_status` toujours « RESEAU » | Dérivé du préfixe du motif (`ACCES`, `LECTURE`, `NON_LU`) |
| Publications tronquées par `maxDocs`, sans permalien, pagination incohérente, permission manquante | `maxDocs` ne tronque jamais les publications Instagram ; compteur `sans_permalien` ; `pagination_incoherente` ⇒ historique non couvert ; une permission manquante arrête le cycle (globale) |
| `--instagram-pilote` sans `--sources-suivies` ignoré en silence | Message explicite |

**Non traité, à connaître avant activation** : le code de sortie du cycle reste 0 en cas de panne Instagram (le signal est la ligne de console, `::warning::` et `X.instagram`, pas un bilan « clos avec erreurs » ni un message Telegram) ; avec la veille actuelle, `sny-cycle.yml` lance déjà `--sources-suivies`, les deux pages Instagram y apparaissent donc à chaque cycle en « non activé » sans aucune lecture ; la première lecture réelle peut ramener jusqu'à 40 publications anciennes, donc une rafale de « rattrapage » (plus de 30 jours) à prévoir ; la relecture porte sur l'état **avant** ces corrections, qui n'ont pas eu de seconde relecture.

## 4 ter. Alias « centre de loisirs de Tarnos » (FR-2026-0115), signal « à confirmer » (23/11/2026, 2ᵉ passage)

**Alias.** `data/alias-etablissements.json` (lu par `scripts/lib/alias-etablissements.mjs`, appliqué à la seule étape « sources suivies » du cycle ; Discovery et Maintenance gardent les fiches brutes). Vérification avant ajout : (1) la matière SNY (La Dépêche, Sud Ouest, parquet de Dax) emploie « centre de loisirs de Tarnos » / « centre de loisirs municipal de Tarnos » / « Centre de loisirs Pierrette-Fontenas de Tarnos » pour la même structure ; (2) aucune autre fiche SNY n'est à Tarnos et aucune des 68 autres fiches ne se rapproche de l'alias (contrôle automatique, avec contre-exemples) ; (3) le site de la ville de Tarnos décrit un accueil de loisirs tenu par une seule association gestionnaire (sites Pierrette-Fontenas et école Robert-Lasplacettes) : l'expression désigne cet organisme, pas une autre structure ; **la maison de quartier du Pissot est une structure distincte** (espace de vie sociale), non couverte par l'alias. Limite : ce nom existe depuis 1983, un texte antérieur ou étranger à l'affaire qui le citerait resterait « à confirmer ».

**Règles.** L'**expression exacte** doit figurer dans le texte (pas de mots épars) ; commune et rôle suivent les règles habituelles ; **sans le rôle, le rattachement est « douteux », jamais plein**. Deux affaires portant l'alias ⇒ suspendu (arbitrage humain).

**Signal examinable.** Constat de départ : un rattachement « suspendu » n'était que consigné (rapport du cycle, mémoire), **sans proposition ni notification** ; seul un rattachement plein (`AFFAIRE`) produisait une proposition puis l'information Telegram. Pour une **publication d'un compte** qui nomme la structure par son alias, avec un lien thématique (violences, plainte, signalement, appel à témoins…) mais sans le rôle : destination **`AFFAIRE_A_CONFIRMER`** → proposition d'information (moteur `sources-suivies`, `NO_CHANGE`, revue humaine requise, rattachement `DOUTEUX`, aucun `case_id`, aucun fait décidable donc **aucun bouton**) → message Telegram existant (`notifier` → `info()`), variante « ⚠️ RATTACHEMENT À CONFIRMER » : le texte seul n'établit pas le lien, déclaration du compte attribuée et non vérifiée, aucun statut judiciaire ne change. Nommer une structure sans thème (programme, inscriptions) ne déclenche rien.

**Vérifié :** chaque maillon par test (classement, proposition construite par le cycle, critères de sélection de `notifier`, texte du message, indicateur transmis par `telegram-v0`). **Non vérifié : le parcours de bout en bout avec la base Neon et l'envoi Telegram réel** (non exécutable sans toucher à la production). Le pilote reste inactif.

**« Hors périmètre » erronés.** Quatre publications de l'export étaient classées « hors périmètre — sans lien avec les violences faites aux mineurs » (et non deux, comme je l'écrivais) ; le vocabulaire du thème est étendu (protection de l'enfant, dépôt ou refus de plainte, signalement, centre de loisirs, tout-petits, appel à témoins). **Trois** deviennent « position générale » (appel à témoins, refus de plainte, accompagnement après signalement), sans aucun rattachement ; **une** reste hors périmètre (légende sur les frères et sœurs, sans aucun terme du thème) : son motif dit désormais « aucun terme de la thématique dans le texte lu : non classé, sans jugement sur le fond ».

**Mesure du rejeu des 30 publications** (`node scripts/mesurer-alias-tarnos.mjs`, aucun appel Meta, aucun texte imprimé) :

| | Sans alias | Avec alias |
|---|---|---|
| Publications de `leursvoixnotrecombat40` dont le texte (hors hashtags et signature) nomme Tarnos | 2 sur 20 | 2 sur 20 |
| … dont le texte nomme la structure par l'alias | 1 | 1 |
| **Pistes Tarnos remontées** (`AFFAIRE` ou `AFFAIRE_A_CONFIRMER`) | **0** | **1** (appel à témoins du 16/11, candidat FR-2026-0115) |
| **Faux rattachements** (publications de `sosperiscolaire`, lettre à la Ville de Paris comprise ; publications sans lien textuel) | 0 | **0** |
| « Hors périmètre » | 4 | 1 |

**Contre-exemples testés** (légendes fictives) : centre de loisirs d'une autre commune (Cenon) ; « centre de loisirs » et « Tarnos » dans des phrases séparées ; maison de quartier du Pissot ; alias d'une autre commune, trop court ou en collision avec une seconde fiche (refusés à la vérification) ; deux affaires portant l'alias ; document HTML ordinaire (le signal « à confirmer » est réservé aux comptes) ; programme du centre sans thème.

**Pistes non remontées (limite mesurée).** Sur 20 publications, une seule déclaration utile est remontée. Restent en mémoire sans notification : (a) la publication du 29/10 (« centre de loisirs » dans le titre, « faits survenus à Tarnos » dans une autre phrase : lien lisible par un humain, **non établi par l'expression exacte**) ; (b) la déclaration du 17/11 sur les difficultés pour déposer plainte et (c) la mention d'un article de presse du 11/11, qui ne nomment Tarnos que dans leur signature ou leurs hashtags. Les assouplir (lecture de la signature « – Tarnos » comme territoire, ou une portée « affaire FR-2026-0115 » déclarée pour le compte) rattacherait tout ce que publie le collectif, à raison d'une publication par jour : **décision éditoriale, non prise**.

## 4 quater. Portée de l'acteur ≠ portée de la publication ; actions et déclarations concrètes (24/11/2026)

**Principe.** Le nom d'un compte, son siège ou un territoire qu'il annonce ne prouvent **ni le lieu d'une publication ni son lien avec une affaire** : seul le texte lu compte (hashtags et lignes de pure signature retirés). Le champ `piste_territoire` du registre est **supprimé** ; la portée des deux acteurs reste « inconnue ». Le pilote fait remonter les **actions et déclarations publiques concrètes** des comptes suivis, même sans lieu ni affaire nommés, sur la chaîne existante (une notification groupée) : pas de rubrique, pas de classificateur général, pas de nouveau circuit de revue.

**Classement d'après le texte, dans cet ordre.**
1. **Affaire** — seulement si le lien est démontré par le texte (établissement, commune, rôle : `AFFAIRE`, proposition d'information sans bouton) ; si le texte nomme la structure par son alias propre sans le rôle : « **affaire à confirmer** » (même circuit, jamais une affaire forcée).
2. **Hub** — si le texte **nomme** un territoire : commune ou département d'une fiche de SNY, ou Paris. Le hub qui le couvre est celui de `data/hub-matiere` (« isolés » exclu) ; **Paris général n'a aucun hub** et n'est jamais « Paris 11e » : le 11ᵉ doit être écrit dans le texte.
3. **Piste thématique sans territoire** — sinon.
Chaque piste garde l'**auteur**, l'**adresse**, la **date**, l'**extrait probant** (≤ 300 caractères, vidé après notification) et le **motif du classement**. Les témoignages anonymes sensibles sont écartés avant tout (règle inchangée).

**Motifs fermés** (une phrase du texte suffit, jamais la signature) : `PLAINTE_ACCUEIL` (le compte déclare, en « nous », un refus ou une difficulté de dépôt de plainte ; une phrase qui cite un article ou un journaliste n'en est jamais une) · `ARTICLE_PRESSE_CITE` (relais de presse : l'article reste à retrouver, il ne prouve pas ce que le compte en dit) · `LETTRE_OU_DEMANDE_PUBLIQUE` (lettre ouverte, pétition, demande à objet précis ; « nous attendons des réponses » seulement si la publication s'ancre dans une annonce ou « après les faits ») · `APPEL_A_TEMOINS` · `MOBILISATION_OU_DEMARCHE`.

**Circuit.** Table `pistes_a_qualifier` (migration **028**, **sans `case_id`**, `territoire` **nullable**, `destination` HUB ou THEMATIQUE, `hub_id`, `classement`) → `telegram-v0` : UNE notification, sans bouton, longueur bornée, qui dit que la portée du compte ne prouve ni le lieu ni le lien avec une affaire. Table absente : rien n'est écrit ni envoyé.

**Rejeu des 30 publications réelles** (`node scripts/mesurer-alias-tarnos.mjs`, aucun appel Meta). 9 témoignages anonymes écartés ; 21 lues individuellement. **6 signaux** :

| Publication | Signal | Destination proposée | Verdict |
|---|---|---|---|
| leursvoix 17/11 | `PLAINTE_ACCUEIL` : le collectif dit avoir rencontré des difficultés et des refus de dépôt de plainte | piste thématique (« Dax » n'est pas un territoire reconnu : on n'en déduit pas « Landes ») | vrai positif |
| leursvoix 11/11 | `ARTICLE_PRESSE_CITE` : relais d'un article et d'une journaliste | piste thématique | vrai positif ; **ne devient pas un refus de plainte** (la phrase qui parle de « refus » cite l'article ; celle qui parle de l'accueil à la gendarmerie est à la 3ᵉ personne) |
| leursvoix 16/11 | appel à témoins qui **nomme** « centre de loisirs de Tarnos » | **affaire à confirmer** FR-2026-0115 (structure démontrée, rôle non précisé) | vrai positif |
| leursvoix 29/10 | demande publique ancrée dans « après les faits survenus à Tarnos » | **hub « landes »** (Tarnos nommé dans le texte) | vrai positif |
| leursvoix 28/10 | demande publique ancrée dans l'annonce d'un plan d'action de la mairie | piste thématique (commune non nommée) | vrai positif |
| sosperiscolaire 22/04 | lettre ouverte à la Ville de Paris | **hub à orienter : Paris, sans hub** ; **jamais Paris 11e** (le texte parle des parents « du 10ème » et de la Mairie de Paris) | vrai positif |

**Faux positifs : 0 sur ces 21 textes** (deux candidats ont été écartés pendant la mise au point : une demande générale de « vigilance » et une série de questions sans événement) — ce chiffre ne dit rien de la précision sur d'autres textes : la relecture indépendante en a trouvé plusieurs sur des légendes écrites pour l'occasion, corrigés ci-dessous. **Manqués : 0 certain ; 2 discutables**, laissés sans signal : le 31/10 (présentation d'une structure d'accueil de Dax : relais d'une ressource, pas une action du compte) et le 09/11 (appel général à « la vigilance et des contrôles rigoureux », sans objet précis). **Aucune signature seule ne déclenche un signal** : 17 publications portent la signature, 13 sans signal (les 4 autres sont les signaux ci-dessus) ; le seul signal sans signature est la lettre de SOS Périscolaire. Aucune action générale de SOS Périscolaire n'est attribuée à Paris 11e.

**Relecture indépendante de cette passe** (agent distinct, légendes de son choix). **Corrigés et testés** : un accueil *favorable*, un rappel de droit ou une revendication (« que plus aucune famille ne se voie refuser… ») n'étaient pas distingués d'un refus déclaré — seul un accueil défavorable ou un refus dit à la première personne compte ; une phrase attribuée à un média (« selon Le Télégramme », « d'après France 3 ») n'était pas reconnue comme relais de presse, et « tout le monde » passait pour « Le Monde » — les médias sont reconnus avec leur majuscule et leur verbe d'attribution ; « plusieurs familles » ne vaut plus « nous » ; l'ancrage d'une demande (« nous attendons des réponses ») est cherché dans les phrases qui précèdent, sans les mots banals (« réunion », « publié ») ; « communiqué » nu et « rencontre avec des parents » ne sont plus des démarches (seules les institutions comptent) ; **« Paris 11e » n'est retenu que si le texte l'écrit** (« Paris, 11 décembre » et « 11e arrondissement de Lyon » ne le sont plus) ; faux territoires écartés (« Le Parisien », « Nice-Matin », « chacun sache », « Orange », « la réunion de la semaine ») par la majuscule exigée dans le texte original et une liste de noms ambigus ; la signature (« – Tarnos », « (40) », « depuis Tarnos ») n'est jamais un lieu, y compris sur la même ligne que le texte ; **garde thématique** : une publication sans aucun terme du thème (vide-grenier, cantine fermée) ne devient jamais une piste. **Non corrigé** : « Gironde » ou « Landes » donnent le hub qui porte leurs dossiers, sans que ce hub couvre tout le département ; seul le premier territoire d'un texte est retenu. **Limite : ces verdicts sont ma lecture de 21 textes, sans second lecteur** ; ils ne mesurent ni le rappel ni la précision en conditions réelles.

## 5. Ce qui n'est PAS démontré

* **Aucun appel réel du pilote** : ni l'appel lui-même (`appelerReel` est testé avec un `fetch` simulé ; la même construction de requête a été validée en réel par la sonde), ni un cycle complet avec la base Neon et `state_proposals`.
* **Le budget de 4 n'est pas mesuré** ; la mesure ci-dessus est un rejeu.
* **Rendement** : 0 proposition utile sur 30 publications ; à rapprocher du coût de maintenance du pilote avant de l'activer. Une décision éditoriale est possible et n'a PAS été prise : assouplir le rattachement (la fiche de Tarnos exige « municipal » que les légendes n'écrivent pas) ferait remonter des liens que le texte n'établit pas stricto sensu.
* **Dot** : aucune transmission automatique ; l'export local n'est pas une intégration.

## 6. Essai manuel et activation

Workflow **manuel** `sny-pilote-instagram` (aucun cron) : `verifier-migration` (transaction annulée : la base n'est pas modifiée), `appliquer-migration` (confirmation GO-028), `essai-dry-run` (empreinte de la base → cycle `--sources-suivies --instagram-pilote --dry-run` → comparaison : aucune écriture attendue ; aucun secret Telegram n'est fourni). Il partage le groupe de concurrence `sny-telegram` avec le cycle quotidien. Journaux publics : compteurs, dates et destinations, jamais de pseudo, d'adresse ni de légende. Limite connue de la comparaison : un autre workflow (mise à jour de fiches) qui écrirait pendant l'essai la fausserait ; un `--dry-run` écrit encore un fichier d'archive local sur le runner (pas dans Neon).

## 6 bis. Pour activer (hors de cette phase, décision du propriétaire)

1. Créer le secret `META_GRAPH_TOKEN` (jeton Unified Login avec `instagram_basic` et `instagram_manage_insights`) dans l'environnement du cycle, et documenter son renouvellement ; l'identifiant `_meta.instagram.ig_user_id` est déjà au registre.
2. Ajouter `--instagram-pilote` à **un** essai manuel `maintenance-cycle.mjs --sources-suivies --dry-run` d'abord, mesurer les appels réels et les propositions, puis seulement décider d'un workflow.
3. Retour arrière : retirer l'option ; les pages Instagram reviennent à l'état « non activé » sans autre changement.

## Note de sécurité (livraison)

* **Finalité** : lire, en lecture seule, des publications publiques de deux comptes professionnels pour alimenter la veille. **Installation / démarrage** : aucun service ni tâche planifiée ; code du dépôt, inactif par défaut. **Réseau** : `graph.facebook.com` uniquement, TLS toujours validé (refus de `NODE_TLS_REJECT_UNAUTHORIZED=0`). **Privilèges** : lecture ; jeton jamais journalisé.
* **Données** : légendes publiques de tiers ; témoignages anonymes sensibles écartés avant conservation ; dépôt public ⇒ journaux CI publics : la console n'affiche que des compteurs et les pseudos publics du registre, jamais de légende ni d'adresse de publication.
* Revue sécurité recommandée avant activation (stockage et renouvellement du jeton, contenus de tiers).
