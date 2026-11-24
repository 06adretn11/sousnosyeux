# Business Discovery Instagram — preuve de lecture #1 (23/11/2026)

**Verdict : accès démontré.** Avec le jeton Unified Login régénéré (permission `instagram_manage_insights` ajoutée), Business Discovery lit le contrôle `bluebottle` et les deux cibles SNY (`leursvoixnotrecombat40`, `sosperiscolaire`), publications comprises, depuis le compte `sousnosyeux_org`. Pagination et rejeu sont observés en réel. **Le plafond de 12 appels est consommé (12/12).** Ce n'est ni une couverture exhaustive, ni un gain éditorial mesuré, ni une intégration à dot.

## 1. Accès Meta : ce qui est constaté

Avant l'ajout de `META_GRAPH_TOKEN` par l'opérateur, le dépôt, les secrets et variables GitHub (noms seulement) et `.env.local` ne contenaient aucun jeton Meta ; Instagram n'y servait qu'à publier via Buffer. Cela ne permettait **pas** de conclure à l'absence d'application Meta. Le jeton fourni par l'opérateur est un **jeton Unified Login** (jeton système rattaché au portefeuille), pas un jeton utilisateur Facebook : le parcours `me/accounts` n'a pas été utilisé.

## 2. Parcours Unified Login (documentation lue le 23/11/2026)

Pages Unified Login (accueil, get-started, authentication, permissions, eligibility) : jeton « Business Integration System User Access Token » ; hôte `graph.facebook.com`, exemples en v27.0 ; `/me` renvoie l'utilisateur système, pas un compte Instagram ; `me?fields=client_business_id` et `me/assigned_instagram_accounts?fields=id,username` (permission `instagram_basic`) donnent portefeuille et comptes ; aucun point d'inspection de jeton décrit. `pages_show_list` et `pages_read_engagement` ne sont **pas** dans les permissions listées pour ce parcours ; `ads_read` n'est demandée que si le rôle sur la Page vient de Business Manager (parcours Facebook Login).

Business Discovery n'est **pas** décrit dans les pages Unified Login. Seule la page Business Discovery du parcours Facebook Login dit qu'il fonctionne aussi avec Unified Login ; la référence liste, pour un jeton utilisateur Facebook, `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`.

## 3. Appels réseau réellement faits (12 sur 12)

Preuves locales : `data/preuves-business-discovery/preuve-*.json` (ignoré par Git), toutes de source `reseau`.

| # | Heure UTC | Appel | Résultat |
|---|---|---|---|
| 1 | 18:21:05 | `GET /me?fields=client_business_id` | 200 ; identifiant de portefeuille présent (non conservé) : cohérent avec un jeton système Unified Login (inférence, pas un test documenté) |
| 2 | 18:21:05 | `GET /me/assigned_instagram_accounts?fields=id,username` | 200 ; `sousnosyeux_org` dans la liste : **identité SNY vérifiée** |
| 3 | 18:21:38 | Business Discovery `bluebottle` (profil) | **400 `(#10) Application does not have permission for this action`**, `OAuthException`, sans sous-code (jeton initial) |
| 4 | 18:22:07 | idem | idem (même résultat, message de Meta capturé) |
| 5 | 18:33:08 | idem, jeton régénéré | **200** : contrôle réussi |
| 6-7 | 18:33 | `leursvoixnotrecombat40` : profil, 10 publications | 200 ; `media_count` 114 |
| 8-9 | 18:33 | `sosperiscolaire` : profil, 10 publications | 200 ; `media_count` 150 |
| 10-12 | 18:36 | `leursvoixnotrecombat40` : profil, **rejeu de la première page**, **page 2** par curseur | 200 ×3 |

**Étape « permissions effectives » : non déclenchée, l'erreur #10 n'a pas persisté.** Constat : #10 avant la régénération du jeton, succès après l'ajout de `instagram_manage_insights`. C'est cohérent avec « permission absente » ; **ce n'est pas démontré** par une liste de permissions, car aucun moyen officiel de lister les permissions de ce jeton n'est décrit dans les pages lues et je n'ai pas appelé de point non documenté (budget d'ailleurs épuisé). Deux autres causes sont écartées *en pratique* : Business Discovery fonctionne avec ce type de jeton (pas d'incompatibilité du parcours), et sans que `pages_read_engagement` figure dans la configuration Unified Login (sous réserve qu'elle ne soit pas accordée en plus). Le niveau d'accès exact de l'application n'a pas été consulté ; il n'a pas empêché la lecture.

## 4. Verdict par cible

| Cible | Verdict |
|---|---|
| `bluebottle` (contrôle Meta, hors périmètre SNY) | **Accès démontré** (profil, 2 603 médias déclarés) |
| `leursvoixnotrecombat40` | **Accès démontré** : profil et 20 publications lues sur 114 déclarées (27/10 au 23/11/2026) ; curseur de page suivante présent |
| `sosperiscolaire` | **Accès démontré** : profil et 10 publications lues sur 150 déclarées (22/04, 23/07-31/08/2026) ; curseur présent, page 2 non lue (budget) |

Un compte lisible par Business Discovery est cohérent avec un compte professionnel et non soumis à restriction d'âge ; cela ne dit rien d'autre sur son identité. L'identité d'organisation de ces comptes n'est pas établie par Meta : le texte des légendes se désigne « Leurs voix, notre combat – Tarnos » et « sosperiscolaire ».

## 5. Ce qui a été lu, et les limites de lecture

Champs : auteur, identifiant du post, permalien, date de publication, type de média, légende, date de collecte. **Légende seule** : images, carrousels, vidéos, commentaires, messages et stories n'ont pas été lus (`portee_lecture: legende_seule`). Les réponses sont apparues en ordre de date décroissant ; l'ordre n'est pas garanti par Meta. Un curseur `after` était présent à chaque page : il ne prouve pas qu'il reste des publications, ici `media_count` indique qu'il en reste. Les légendes complètes sont dans la preuve locale ; elles ne sont pas recopiées dans ce rapport.

## 6. Comparaison avec les fiches et hubs SNY (`origin/main` récupéré le 23/11/2026)

Référence : fiche `FR-2026-0115` (centre de loisirs municipal de Tarnos, mise en examen), hub Landes (matière du 26/10), hub Paris-11e, `associations-watchlist.json`. **Aucune modification n'a été faite ; tout rattachement ci-dessous est une proposition, à valider.**

**`leursvoixnotrecombat40` → Tarnos / `FR-2026-0115` / hub Landes.** Le compte se présente comme un collectif de familles de Tarnos. Le hub mentionne « plusieurs familles regroupées au sein d'un collectif » (source ici, 07/10), sans le nommer : que ce soit ce collectif est une **hypothèse**, non prouvée.
- *Déjà connu :* le plan d'action de la mairie jusqu'en juin 2027 (post du 28/10), la mobilisation en collectif et la marche blanche. Aucun apport.
- *Absent de SNY, déclaré par le collectif (attribué, jamais un fait établi) :* (a) 17/11 : plusieurs familles du collectif disent avoir rencontré des difficultés pour déposer plainte, certaines se seraient vu refuser le dépôt, d'autres auraient dû aller à Dax ; (b) 16/11 : appel à témoins visant des personnes ayant fréquenté le centre de loisirs ou la maison de quartier du Pissot ; (c) 11/11 : une famille du collectif aurait témoigné anonymement auprès d'une journaliste dans un article sur les refus de plainte : **piste à retrouver dans la presse** avant toute utilisation, l'article n'est pas lu ; (d) 31/10 : mention d'un lieu d'accueil de victimes à Dax (ressource, sans lien établi avec l'affaire).
- *Destination possible :* réactions/mobilisation de `FR-2026-0115` et section « réponses » ou piste éditoriale du hub Landes, avec la mention « déclaration du collectif, non vérifiée par une source indépendante ». **Aucun statut judiciaire ne change** (mise en examen inchangée) ; la déclaration (a) ne qualifie aucun acteur. L'appel à témoins et le renvoi vers des messages privés ne doivent pas être relayés ni contactés par SNY sans décision.
- *Source de recoupement prioritaire :* l'article de presse du point (c), plus fiable que la légende.

**`sosperiscolaire` → hub Paris / piste éditoriale.** `associations-watchlist.json` connaît déjà « SOS Périscolaire » (site `sosperiscolaire.fr`, « zéro ligne lisible », fiche en réserve documentaire) : le compte Instagram offre **un canal lisible là où le site ne l'est pas** ; que ce compte soit celui du collectif du site est probable (la fiche `FR-2026-0115` cite une cofondatrice du « collectif SOS périscolaire ») mais **non démontré**.
- Sur 10 posts lus, 9 sont des témoignages anonymes de parents ou d'agents, sans établissement ni commune repérés (lecture des débuts de légende et recherche du mot « Paris »), certains décrivant des faits graves. **Inutilisables comme sources** (anonymes, non localisés, sensibles) ; ne pas les citer ni les rattacher à une affaire.
- Le 10ᵉ (22/04, ancien) annonce, avec l'association « dottoasso », une lettre ouverte à la maire de Paris demandant quatre mesures d'urgence (surveillance en binômes mixtes, identification et traçabilité des agents, accompagnement et information des familles, vérification des antécédents). Absente des hubs Paris lus (qui citent les annonces de la Ville du 09/06) : **piste éditoriale « demandes de collectifs à la Ville de Paris »**, déclaration attribuée, antérieure aux annonces du 09/06, donc à dater avec soin. Rattachement à un hub : hypothétique.

**Valeur démontrée.** Une information réellement absente de SNY et exploitable (déclaration sur les refus de plainte, avec une piste de presse à recouper) et un canal lisible pour un acteur déjà suivi mais illisible. Rendement, volume mensuel et couverture : **non mesurés**. Rien dans ces lectures ne modifie une fiche sans validation humaine.

## 7. Pagination, rejeu, dédoublonnage (lectures réelles, distinctes des tests)

Sur `leursvoixnotrecombat40` : la page 1 rejouée (appel 11) renvoie les 10 mêmes publications avec les mêmes légendes (10 identiques, 0 légende modifiée) ; la page 2 (appel 12) apporte 10 publications nouvelles (27/10-04/11) sans chevauchement (0 doublon dans le lot) ; stock reconstruit depuis les preuves réelles : 30 publications au total (20 pour `leursvoixnotrecombat40`, 10 pour `sosperiscolaire`). Bilan écrit dans la preuve (`bilan_rejeu`) ; l'export `export-publications.json` est régénéré depuis les preuves réelles (une ligne par publication, aucun doublon). 94 publications de ce compte et 140 de `sosperiscolaire` restent non lues.

## 8. Livré (branche `feat/business-discovery-preuve`, worktree `~/sny-worktrees/business-discovery`, non commité, non activé)

| Fichier | Rôle |
|---|---|
| `scripts/lib/business-discovery.mjs` | requêtes validées, classement des réponses (message de Meta conservé, masqué), normalisation, fusion/rejeu, masquage du jeton |
| `scripts/sonde-business-discovery.mjs` | parcours `unified` (défaut) et `facebook` ; `--etape identification`, `--reutiliser-identite`, `--reutiliser-controle` (jamais depuis une preuve simulée ni après un échec postérieur) ; compteur persistant ; preuve et export locaux |
| `scripts/qa/test-business-discovery.mjs`, `test-sonde-business-discovery.mjs` | tests **simulés** (réponses construites d'après la documentation) |

Garanties : GET uniquement ; plafond **total de 12 appels** réservé avant chaque appel, insensible à un plantage, à la suppression d'une preuve et au changement de dossier ; arrêt sans relance sur panne d'accès ou quota ; identité SNY vérifiée avant toute lecture ; contrôle obligatoire ; refus de `NODE_TLS_REJECT_UNAUTHORIZED=0` ; jeton lu **uniquement** dans `META_GRAPH_TOKEN` du `.env.local` (vérifié ignoré par Git), jamais affiché ni écrit (vérifié sur la valeur réelle dans toutes les preuves) ; preuves étiquetées `reseau`/`simule`.

## 9. Procédure et budget

```powershell
& "$env:USERPROFILE\OneDrive - Cdiscount\node-v24.14.1-win-x64\node.exe" scripts\sonde-business-discovery.mjs --medias --reutiliser-identite --reutiliser-controle [--cible <pseudo>] [--pages-suivantes N]
```

**Budget restant : 0 appel.** Tout nouvel appel exige une décision explicite de relever le plafond (constante `PLAFOND_TOTAL` et compteur). Ordre de grandeur de la lecture complète des deux comptes : environ 10 pages pour l'un (94 restantes) et 14 pour l'autre (140 restantes) à 10 publications par page, à vérifier au premier essai de taille de page (limite maximale non documentée). Aucun quota Meta n'a été observé (en-têtes d'usage non lus).

## 10. Renouvellement et contraintes

Durée du jeton : fixée dans la configuration Unified Login (aperçu du tableau de bord) ; il cesse de fonctionner si le client retire l'application de son portefeuille ou déplace le compte Instagram (pages Unified Login). Le renouvellement réel (qui, où, quel secret) **reste à documenter**. Les erreurs d'accès sont traitées comme pannes (`erreur_auth`), jamais comme absence de nouvelles. Ne rien promettre sur stories, messages, commentaires, contenu des images ou vidéos. Le `.env.local` principal est synchronisé par OneDrive : choix de l'opérateur, noté.

## 11. Raccordement proposé et passage à dot (non réalisés)

**Raccordement : PRÉPARÉ, NON ACTIVÉ (go du 23/11/2026), voir [PILOTE_VEILLE_INSTAGRAM.md](PILOTE_VEILLE_INSTAGRAM.md).** Budget pilote de 4 appels par cycle, rattachement par le texte seul, témoignages anonymes écartés. Rappel de la piste initiale : Registre unique : `data/associations-watchlist.json`, lu par `maintenance-cycle.mjs --sources-suivies` via `scripts/lib/sources-suivies.mjs` ; `parcourirSources` accepte un lecteur injectable. Piste la plus courte : un type de page `instagram` (pseudo, émetteur) dans `suivi.pages`, lu par un lecteur Business Discovery au format de `lireDocument`. Le collectif `leursvoixnotrecombat40` n'est pas au registre ; `sos-periscolaire` y est déjà (site seul). À faire seulement après décision.

**Dot.** Le registre de dot existe (`SNY_Dot_Suivi_acteurs_et_echanges.md`, d'après Adrien) ; je ne l'ai pas trouvé sur le poste et n'en crée aucun autre. L'export `data/preuves-business-discovery/export-publications.json` est **un fichier local Windows : ce n'est pas une intégration**. La transmission automatique vers dot reste à démontrer, avec son canal. Le mandat de dot lui interdit d'affirmer utiliser Business Discovery avant récupération réussie : celle-ci est maintenant démontrée côté SNY, pas côté dot.

**Unique prochaine action indispensable.** Décision d'Adrien : raccorder (ou non) ces deux comptes à la veille, ce qui suppose de fixer un budget d'appels par cycle (le plafond de 12 est épuisé) ; sans cette décision, aucune lecture supplémentaire ne sera faite.

## 12. Relecture indépendante (agent distinct, avant les lectures réelles) et limites

Constats corrigés : plafond contournable ou non décrémenté, HTTP 4xx sans `error` classé en succès, « vide »/« succès » trop affirmatifs, contrôle non obligatoire, chemins du jeton contournables, TLS, preuves simulées indiscernables. Les ajouts postérieurs (parcours Unified, lecture du `.env.local`, fusion/rejeu, `--reutiliser-controle`) n'ont **pas** été relus indépendamment. Restent non vérifiés : codes d'erreur hors quota, taille maximale de page, durée réelle du jeton, permissions effectives (§3).

## Note de sécurité (livraison)

- **Finalité** : lecture manuelle de publications publiques de comptes professionnels. **Installation** : aucune ; scripts Node du dépôt, à lancer depuis un chemin local hors OneDrive. **Démarrage** : aucun service, aucune tâche planifiée. **Réseau** : `graph.facebook.com`, TLS validé. **Privilèges** : ceux de l'utilisateur ; jeton en lecture.
- **Données personnelles** : légendes publiques de tiers, y compris des témoignages anonymes sensibles (comptes de collectifs), conservées localement dans un dossier ignoré par Git ; non recopiées dans les rapports ; à ne pas diffuser. Aucune donnée sur les personnes qui commentent ou aiment.
- Revue sécurité recommandée avant tout fonctionnement récurrent (stockage et renouvellement du jeton, traitement de contenus sensibles de tiers).
