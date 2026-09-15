# Prompt Claude Code Opus — autonomie maximale sur le chantier SNY pré-exécuteur

À exécuter avec **Claude Code sur Opus**, depuis le dépôt GitHub `06adretn11/sousnosyeux`.

---

Tu travailles sur le projet **Sous Nos Yeux (SNY)**. Ta mission est d’avancer aussi loin que possible sur le chantier préparatoire du futur système de production éditoriale distante, **sans construire l’exécuteur distant à ce stade**.

Cette session doit produire un lot réel, versionné et vérifié. Elle ne doit pas se limiter à une analyse, une nouvelle roadmap ou une série de questions. Tu disposes d’un mandat d’autonomie pour traverser successivement les portes 0 à 4 lorsque les preuves sont suffisantes, et pour continuer les travaux réversibles même lorsqu’une porte reste provisoire.

## 1. Target du projet

SNY documente et relaie, à partir de sources publiques citées, des affaires concernant des structures accueillant des mineurs. Le projet ne mène pas d’enquête, ne plaide pas une thèse et n’interprète pas la culpabilité. Il doit privilégier :

1. l’exactitude et la fraîcheur des affaires déjà visibles ;
2. la minimisation des informations et la prudence juridique ;
3. la traçabilité de chaque affirmation jusqu’à sa source ;
4. la capacité de corriger ou retirer rapidement ;
5. seulement ensuite, l’extension géographique et l’automatisation.

À terme, la cible est une boucle similaire à QGMC : détection → dossier sourcé → rendu exact → validation humaine Telegram → exécution bornée → PR/CI → déploiement → contrôle live → état terminal. La différence de persistance est **Supabase/Postgres pour SNY**, et la politique éditoriale est plus stricte.

## 2. Mandat d’autonomie

Cette session doit :

- inspecter l’état réel et actuel du dépôt, pas seulement les documents historiques ;
- intégrer la reconstruction du prototype « Hub Affaires V3 — Paris 11e » comme **référence visuelle non publiable** ;
- figer la roadmap pré-exécuteur dans le dépôt ;
- créer les premiers contrats éditoriaux, de données et de QA nécessaires au futur hub industriel ;
- implémenter les fondations techniques réversibles des portes 1 à 4 lorsque l’état réel du dépôt le permet ;
- produire un verdict et des preuves pour chaque porte atteinte ;
- regrouper les arbitrages humains au lieu d’interrompre le travail à chaque choix mineur ;
- ouvrir une PR propre si les accès GitHub le permettent.

### Tu es autorisé à agir seul pour

- lire le dépôt, son historique et ses remotes ; fetcher sans écraser le travail local ;
- créer une branche dédiée ;
- écrire ou modifier documentation, code, tests, fixtures, scripts dry-run et fichiers de migration **non appliqués** ;
- corriger une faille de sécurité évidente, une fuite de champ interne ou un export public non allowlisté ;
- construire des composants de hub et des rendus de test non exposés publiquement ;
- créer un scanner déterministe en mode observation, sans scheduler ni mutation ;
- exécuter builds, tests, contrôles statiques, audits de secrets et rendus locaux ;
- faire des commits atomiques par porte, pousser la branche, ouvrir une PR et corriger sa CI ;
- choisir un défaut réversible lorsqu’il ne modifie ni la doctrine, ni les données réelles, ni la production ; consigner alors l’hypothèse dans un journal de décisions.

### Règles d’autonomie

1. Ne demande pas confirmation pour une convention de nommage, une organisation interne, un test, une fixture, une refactorisation locale ou une décision facilement réversible.
2. Si plusieurs solutions sont valables, choisis la plus simple qui respecte la target et documente brièvement le compromis.
3. Si une question bloque un sous-chantier mais pas les autres, marque ce sous-chantier `BLOCKED`, poursuis les tâches indépendantes et reviens au blocage à la fin.
4. Regroupe les décisions réellement nécessaires dans une seule liste finale, cinq maximum, avec recommandation, alternative et conséquence de l’absence de décision.
5. Ne t’arrête en cours de session que pour : permission manquante indispensable, secret absent, risque de perte de données, action externe irréversible, ambiguïté sur le dépôt cible ou décision éditoriale/juridique qui changerait matériellement ce qui peut être publié.
6. Un service externe indisponible ne bloque pas la conception locale : utilise une fixture ou un adaptateur mocké, puis documente la preuve restant à obtenir.
7. Parallélise les travaux indépendants. Séquentialise uniquement les étapes qui modifient le même périmètre ou dont la preuve dépend de l’étape précédente.
8. Privilégie les contrôles déterministes et peu coûteux. N’utilise aucune API externe payante et n’invente pas de plafond de tokens avant instrumentation.
9. Challenge tes propres résultats avant de conclure : recherche explicitement fuite de données, statut judiciaire régressif, échéance périmée, doublon, contenu contradictoire et test faussement vert.

### Statuts de porte

- `PASSED` : tous les critères sont prouvés.
- `PROVISIONAL` : la fondation est utilisable localement, mais une validation humaine, juridique ou une preuve externe reste nécessaire avant publication.
- `BLOCKED` : le travail ne peut réellement pas continuer ; indiquer le blocage matériel exact.

Une porte `PROVISIONAL` n’interdit pas de poursuivre les développements locaux et réversibles de la suivante. Elle interdit seulement de présenter la capacité comme publiable ou prête pour la production.

## 3. Frontière non délégable

Cette session ne doit pas :

- construire la sonde, l’exécuteur, Telegram, une machine d’états ou un scheduler ;
- créer une route publique pour le prototype ;
- republier les informations datées de juin 2026 ;
- lancer une recherche web large ou enrichir le corpus ;
- appliquer une migration Supabase ou muter les données de production ;
- déployer ou modifier Cloudflare/OVH ;
- activer indexation, sitemap ou SEO ;
- refondre la carte ou le design existant ;
- ajouter des dépendances lourdes sans nécessité démontrée ;
- réécrire l’histoire Git, écraser des changements locaux ou exposer un secret.

Tu dois t’arrêter avant de construire la couche distante. Sont réservés à une validation explicite d’Adrien :

- merge vers `main` et déploiement ;
- mutation de Supabase ou des données réelles ;
- publication, correction ou retrait d’une affaire réelle ;
- changement de doctrine éditoriale ou conclusion juridique ;
- création de bot, message Telegram réel, webhook, polling, scheduler ou automatisation distante ;
- activation SEO, sitemap ou indexation ;
- migration destructive ou difficilement réversible.

## 4. Inputs remis avec ce prompt

Trois fichiers sont fournis :

1. `SNY_Roadmap_Avant_Industrialisation_V1.md` — document de pilotage vivant et prioritaire ;
2. `SNY_Hub_Paris11_Reconstruction.html` — reconstruction visuelle autonome, fondée sur la transcription et la vidéo du prototype perdu ;
3. si disponible, `Fichier markdown.md collé` — extraction textuelle historique du prototype.

Le HTML reconstruit contient volontairement le contenu historique et certaines formulations désormais non conformes afin de préserver la référence visuelle. Il porte `noindex` et un avertissement. **Ne pas le traiter comme un contenu validé.**

## 5. Contraintes éditoriales non négociables

- Jamais publier le nom d’une personne mise en cause.
- Jamais publier le nombre exact d’enfants : uniquement `1 enfant`, `plusieurs enfants` ou `non précisé`.
- Ne pas publier d’âge exact, d’année de naissance ou de détail facilitant inutilement la ré-identification.
- Jamais de détails graphiques.
- Toujours attribuer : « une source publique rapporte que… » ou une formulation standard équivalente.
- Distinguer plainte, enquête, mise en examen, procès, condamnation non définitive, condamnation définitive, relaxe, non-lieu et classement.
- Une mise en examen, une garde à vue, une suspension ou une plainte ne vaut pas culpabilité.
- Une évolution qui affaiblit ou contredit la présentation initiale est prioritaire : relaxe, classement, non-lieu, absence de charges, rectification, erreur d’établissement ou changement de périmètre.
- Une affirmation sensible sans source directe et datée n’est pas publiable.
- Aucune page ne peut se dire à jour si une échéance affichée comme future est dépassée.

Le cadre juridique définitif devra être validé par un conseil compétent ; ne présente pas tes propositions comme un avis juridique.

## 6. Contraintes techniques et sécurité

- Stack verrouillée : Astro + MapLibre, Supabase/Postgres, GitHub, Cloudflare Workers static assets, domaine chez OVH.
- Le hub doit devenir un rendu dérivé des données canoniques, pas une seconde source de vérité.
- Aucun `select=*` pour un export public ; utiliser une liste blanche explicite.
- Aucun champ interne, commentaire de validation ou secret dans `data/cases.json`, le build, le navigateur ou les artefacts publics.
- La clé Supabase `service_role` ne doit jamais être stockée ou utilisée côté navigateur, y compris dans `localStorage`.
- Ne jamais commiter `.env`, `.env.local`, token, clé ou dump sensible.
- Préserver les modifications locales existantes et signaler tout worktree sale avant d’écrire.
- Ne pas modifier une décision verrouillée de `CLAUDE.md` silencieusement. Lorsqu’une ancienne décision est devenue manifestement incompatible avec la sécurité ou la roadmap, documenter le conflit et proposer une décision de remplacement explicite.

## 7. Méthode de travail attendue

### Étape A — Préflight factuel

1. Afficher branche, HEAD, remotes, statut Git et différences locales.
2. Récupérer l’état distant sans action destructive.
3. Vérifier que le dépôt ouvert est bien `sousnosyeux`.
4. Inventorier routes, données, scripts, migrations, tests et workflows réellement présents.
5. Comparer cet état à la roadmap fournie et à `CLAUDE.md`.
6. Créer une branche dédiée, par exemple `feat/hub-gate-0`, seulement après avoir confirmé que les changements locaux sont préservés.

Ne suppose pas que le snapshot de juin ou les chiffres de `CLAUDE.md` sont encore actuels. Toute affirmation d’état doit être reliée à un fichier, un commit ou une commande observée.

### Étape B — Intégrer la référence sans exposition publique

Créer une structure simple, cohérente avec le dépôt, par exemple :

```text
prototypes/
  hubs/
    paris-11-v3-reconstruction/
      index.html
      README.md
docs/
  industrialisation/
    ROADMAP_PRE_EXECUTEUR.md
    EDITORIAL_CONTRACT_V0.md
    DATA_CONTRACT_V0.md
    QA_GATES_V0.md
    GATE_0_REPORT.md
```

Exigences :

- le prototype reste hors de `web/src/pages`, `web/public` et de tout chemin déployé ;
- conserver le `noindex`, l’avertissement de reconstruction et la provenance ;
- le `README` doit distinguer explicitement : fidélité visuelle, texte historique, données non revérifiées, source originale perdue ;
- ne pas « nettoyer » silencieusement le contenu historique du fichier de référence ;
- documenter les différences connues avec l’original : code source non récupéré, rendu reconstruit depuis une vidéo mobile et une transcription, adaptation desktop inférée, bouton de masquage QA ajouté.

### Étape C — Figer les contrats V0

Créer des documents courts et actionnables, sans surarchitecture.

#### `EDITORIAL_CONTRACT_V0.md`

Inclure au minimum :

- champ ou information : autorisé / généralisé / interdit / revue obligatoire ;
- formulations admises par statut judiciaire ;
- traitement des informations contradictoires ou favorables à la personne mise en cause ;
- règle d’attribution de chaque affirmation ;
- règles de date `source_date`, `verified_at`, échéance future et péremption ;
- critères de correction, retrait et droit de réponse ;
- blocs du hub V1 autorisés et blocs différés.

#### `DATA_CONTRACT_V0.md`

Décrire, sans encore écrire de migration, le modèle minimal :

- `cases` ;
- `case_events` append-only ;
- `sources` ;
- `claims` reliées aux sources et à un passage justificatif ;
- `local_hubs` et `hub_cases` ;
- `content_versions` ;
- `reviews` ;
- `releases`.

Pour chaque entité : rôle, identifiant stable, champs publics, champs internes, invariants, dates et relations. Ajouter la projection publique en liste blanche et la règle de calcul des compteurs du hub.

Ne produis pas un schéma de 40 tables. Tout champ doit répondre à un besoin du hub, de sa maintenance, de sa revue ou de sa traçabilité.

#### `QA_GATES_V0.md`

Définir les contrôles bloquants :

- 100 % des affirmations sensibles sourcées ;
- aucune donnée interdite ;
- aucune échéance dépassée présentée comme future ;
- compteurs dérivés et cohérents ;
- doublons et établissement vérifiés ;
- rendu mobile/desktop ;
- liens et sources accessibles ou statut d’indisponibilité explicite ;
- approbation humaine portant sur une version/hash exact ;
- possibilité testée de correction/retrait ;
- aucune fuite de champ interne ou secret.

### Étape D — Audit court du corpus et du pipeline

Sans modifier les données de production, vérifier et documenter :

- nombre réel d’affaires et écart éventuel avec la documentation ;
- doublons probables et logique de dédoublonnage ;
- dates ou coordonnées manquantes ;
- divergence `.fr` / `.org` ;
- utilisation effective de `reviews` ;
- export `select=*` ou fuite de `commentaire_validation` ;
- présence de `service_role` dans le navigateur ou `localStorage` ;
- tests et workflows CI existants ;
- relation réelle OVH / Cloudflare.

Le rapport doit séparer : `OBSERVÉ`, `INFÉRÉ`, `À VÉRIFIER`.

### Étape E — Vérifications et preuve de porte 0

Effectuer au minimum :

- build existant du front sans modification fonctionnelle ;
- validation syntaxique du HTML reconstruit avec les outils disponibles ;
- contrôle que le prototype ne rejoint pas le build Astro ;
- recherche de secrets et de champs internes dans les fichiers publics générés ;
- contrôle responsive du prototype à environ 390 px et 1440 px si un navigateur de test est déjà disponible ; ne pas installer une infrastructure lourde uniquement pour cela.

Créer `GATE_0_REPORT.md` avec :

- commit de départ et branche ;
- inventaire observé ;
- fichiers ajoutés/modifiés ;
- commandes et résultats de vérification ;
- écarts critiques ;
- décisions humaines requises ;
- verdict unique : `GATE_0_PASSED` ou `GATE_0_BLOCKED` avec raisons précises.

La porte 0 n’est passée que si la référence, la roadmap et les preuves sont dans Git, sans exposition publique ni mutation de production.

Après avoir écrit le verdict de la porte 0, poursuis immédiatement avec les étapes suivantes. Ne demande pas un nouveau prompt.

### Étape F — Porte 1 : contrat éditorial testable

Transformer les documents V0 en règles vérifiables :

1. créer une matrice de décision couvrant tous les statuts judiciaires et les issues qui corrigent ou affaiblissent une information initiale ;
2. créer un petit corpus de fixtures explicitement synthétiques : publiable, à généraliser, à compléter, contradictoire, périmé, doublon, relaxe/non-lieu/classement et retrait ;
3. implémenter, lorsque pertinent, des validateurs déterministes pour les interdits simples : âge ou année de naissance, nombre exact d’enfants, échéance dépassée, source absente, champ interne exposé ;
4. vérifier que les règles ne confondent jamais qualité de source et vérité judiciaire ;
5. lister séparément les points nécessitant une validation juridique externe.

Verdict attendu : `GATE_1_PASSED`, `GATE_1_PROVISIONAL` ou `GATE_1_BLOCKED`. Une revue juridique manquante rend normalement la porte provisoire, mais ne bloque pas le développement local fondé sur l’option la plus prudente.

### Étape G — Porte 2 : source de vérité et projection publique

À partir du modèle réel, aller au-delà du document si cela peut être fait sans mutation de production :

1. concevoir puis écrire des migrations **additives et non appliquées** pour les entités minimales nécessaires ;
2. créer une projection/export public par liste blanche explicite ;
3. supprimer du chemin public toute fuite de `commentaire_validation`, données internes ou secrets ;
4. retirer tout stockage ou usage navigateur de `service_role` ; si la correction complète exige une authentification future, fermer le chemin dangereux et fournir un mode local sûr ou une erreur explicite ;
5. ajouter tests de schéma, invariants, sérialisation publique et compatibilité avec les données existantes ;
6. prévoir une stratégie de migration et rollback, sans l’exécuter ;
7. mesurer l’impact sur les scripts d’import, revue, veille et synchronisation.

Si Supabase CLI ou une base éphémère sont disponibles, tester les migrations localement. Sinon, réaliser les contrôles statiques possibles et marquer la preuve d’exécution `PROVISIONAL`.

Verdict attendu : `GATE_2_PASSED`, `GATE_2_PROVISIONAL` ou `GATE_2_BLOCKED`.

### Étape H — Porte 3 : fabrique de hubs locale

Construire la capacité sans créer de publication réelle :

1. extraire les tokens et composants réutilisables de la reconstruction, sans l’utiliser comme source éditoriale ;
2. implémenter un moteur Astro de hub alimenté par des fixtures structurées et des compteurs calculés ;
3. empêcher qu’une donnée de QA, un champ interne ou un contenu non validé rejoigne le rendu public ;
4. générer Paris 11 et deux autres hubs de démonstration uniquement si le corpus existant contient au moins quatre affaires distinctes et qualifiées par zone ; sinon produire une preuve d’inéligibilité au lieu de remplir artificiellement ;
5. marquer tous les rendus comme brouillons non indexables et ne les relier à aucune page publique ;
6. produire les dossiers de revue et, si l’outillage le permet, les captures 390 px et 1440 px ;
7. tester stabilité des compteurs, ordre, liens, absence d’overflow et accessibilité essentielle.

Les informations judiciaires réelles non revérifiées restent des fixtures historiques ou des brouillons. Ne les transforme pas en contenu publiable.

Verdict attendu : `GATE_3_PASSED`, `GATE_3_PROVISIONAL` ou `GATE_3_BLOCKED`.

### Étape I — Porte 4 : entretien en observation

Construire et exécuter localement un scanner dry-run, borné et déterministe qui détecte au minimum :

- échéance future dépassée ;
- absence ou ancienneté de `verified_at` ;
- source absente, URL invalide ou indisponibilité explicite ;
- transition judiciaire incohérente ou régressive ;
- issue favorable/contradictoire nécessitant une priorité de revue ;
- doublon probable affaire/établissement ;
- incohérence entre cartes, résumés et compteurs ;
- champ interne ou information interdite dans une projection publique.

Produire un rapport JSON lisible par machine et un résumé Markdown lisible par les validateurs. Exécuter deux cycles simulés sur fixtures, dont un cas de correction/retrait et un cas d’information contradictoire. Prouver l’idempotence : un second passage sans changement ne recrée pas la même alerte active.

Ne branche pas de cron, scheduler, Telegram ou mutation automatique.

Verdict attendu : `GATE_4_PASSED`, `GATE_4_PROVISIONAL` ou `GATE_4_BLOCKED`.

### Étape J — Revue contradictoire et arrêt avant exécuteur

Avant la livraison :

1. confronter chaque verdict aux preuves réellement produites ;
2. rétrograder tout `PASSED` non démontré en `PROVISIONAL` ou `BLOCKED` ;
3. lancer tests et build complets ;
4. relire le diff pour repérer surarchitecture et changements hors périmètre ;
5. vérifier que rien n’est publié, mergé, déployé ou connecté à une production ;
6. mettre à jour le journal de roadmap et `CLAUDE.md` uniquement avec les faits durables réellement obtenus ;
7. s’arrêter explicitement à `READY_FOR_EXECUTOR_DESIGN` ou `NOT_READY_FOR_EXECUTOR_DESIGN`.

`READY_FOR_EXECUTOR_DESIGN` signifie seulement que les contrats et exécuteurs locaux bornés sont suffisamment définis pour ouvrir le futur chantier. Cela n’autorise ni bot ni automatisation distante.

## 8. Git et livraison

Travaille sur une branche unique et conserve un historique lisible avec, si possible, un commit atomique par porte. Tu peux pousser et ouvrir ou mettre à jour une PR sans demander de confirmation.

Si les contrôles passent :

1. relire le diff complet ;
2. vérifier qu’aucun fichier étranger au chantier n’a été modifié ;
3. commiter avec un message explicite ;
4. pousser la branche et ouvrir une PR ;
5. ne pas merger et ne pas déployer.

Si GitHub ou une permission bloque, conserver les commits locaux et donner la commande exacte ou l’action humaine minimale nécessaire. Ne contourne pas les protections.

## 9. Format du rapport final attendu dans la conversation

Répondre avec ces blocs, sans narration longue :

1. **Verdict global** — `READY_FOR_EXECUTOR_DESIGN` ou `NOT_READY_FOR_EXECUTOR_DESIGN`.
2. **Portes** — statut `PASSED / PROVISIONAL / BLOCKED` et preuve courte pour chacune des portes 0 à 4.
3. **Ce qui existe maintenant** — liste factuelle des capacités, pas seulement des fichiers.
4. **Preuves** — build, tests, fixtures, dry-runs, absence d’exposition publique, branche/commits/PR.
5. **Écarts découverts** — critique / important / ultérieur.
6. **Décisions demandées à Adrien** — cinq maximum, avec recommandation et conséquence.
7. **Dette volontaire** — ce qui a été différé et pourquoi.
8. **Prochaine mission recommandée** — une mission bornée, avec critère de sortie.

Ne construis aucun exécuteur distant et ne propose pas de changement SEO pendant cette session. Ne t’arrête pas volontairement après la porte 0 si des travaux locaux et réversibles des portes suivantes restent possibles.

---

## Résultat recherché

À la fin de cette session, la reconstruction et la roadmap sont durablement dans le dépôt, l’état réel du projet est réconcilié, les contrats éditoriaux et de données sont testables, le moteur de hub fonctionne sur des brouillons structurés, l’entretien a été simulé en dry-run, les écarts restants sont regroupés, et Opus s’arrête exactement avant la construction de l’exécuteur distant.
