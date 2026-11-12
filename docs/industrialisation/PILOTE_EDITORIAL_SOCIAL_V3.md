# SNY — Pilote éditorial social V3 (12/11/2026)

**GO développement du banc d'essai. NO GO diffusion.** Aucun message n'a été publié, programmé ni transmis à Buffer. Aucun GO éditorial n'est demandé ici.

## 0. Sécurité préalable (fail closed), vérifiée avant toute intervention

| Point | Constat (12/11/2026) |
|---|---|
| `SNY_DIFFUSION_ACTIVE` (variable GitHub) | `0`, inchangée pendant toute la mission |
| `SNY_DIFFUSION_DEPUIS` | contient un texte d'exemple, pas une date ⇒ le code ne retient **aucun** événement (`depuisValide = null`) : seconde barrière |
| Journal Neon `diffusions_sociales` | **0 ligne** : rien de réservé, programmé ni envoyé (run `sny-diffusion` → `etat`, 43181508329) |
| Canaux Buffer | X et Facebook connectés, file active, en **lecture seule** (run `verifier-connexion`, 43181513931) ; aucun post créé par SNY (le code ne crée un post qu'après réservation d'une ligne de journal) |
| Banc d'essai | ne lit ni `BUFFER_API_KEY` ni le réseau ; n'importe ni `buffer.mjs`, ni `diffusion-flux.mjs`, ni Neon, ni Telegram (testé) |

## 1. Ce qui existait, et le gap réel

- **Moteur actuel** (`composerMessage`, inchangé) : en-tête fixe (« Nouvelle affaire documentée par la presse »), établissement, commune, phrase d'état du site, lien. Il ne dit **jamais le fait principal**, et il **n'a aucun pare-feu documentaire** : il produit un texte pour les 12 scénarios du corpus, y compris une affaire sans fiche approuvée (S07), une procédure Aqueduc sans distinction de l'autre (S11) et un événement d'une autre affaire (S12). Seule la porte d'éligibilité (`evaluerEvenement`) filtre en amont.
- **La matière riche existe déjà, approuvée et sourcée** : 58 dossiers de fiche (`data/hub-matiere/*.json`), tous à empreinte **identique** à celle du GO (`evenements.json → fiches_approuvees`) ; événements validés datés et sourcés (`evenements.json → affaires`) ; déclarations validées (`matiere`) ; réactions attribuées des dossiers ; formulation officielle du site (`etat-wording.ts`).
- **Gap** : un composeur qui **sélectionne** ces phrases approuvées (sans en rédiger), les assemble par gabarits fixes et **prouve** que rien d'autre n'entre dans le texte. Aucun nouveau moteur Discovery/Maintenance, aucune extraction d'article, aucun schéma, aucun modèle.

## 2. Ce qui a été livré (branche `feat/pilote-editorial-social-v3`)

| Fichier | Rôle |
|---|---|
| `scripts/lib/social-editorial.mjs` | composeur pilote, **pur** : matière approuvée → segments (gabarits en liste blanche + phrases approuvées à l'identique) → X / Facebook ; contrôleur indépendant `verifierPost` ; grille d'aide à la revue |
| `scripts/banc-social.mjs` | commande locale : `node scripts/banc-social.mjs` → `out/banc-social/banc.html` + `banc.json` (ignorés par git) |
| `scripts/qa/fixtures/banc-social-corpus.json` | corpus = **références** (identifiants d'affaire, d'événement, de déclaration), aucun texte d'article |
| `scripts/qa/test-banc-social.mjs` (+ `run-all.mjs`) | 92 contrôles : pare-feux, injections, corpus réel, HTML, déterminisme, absence de chemin Buffer |

**Non modifiés** : `diffusion-sociale.mjs`, `diffuser-social.mjs`, `diffusion-flux.mjs`, `buffer.mjs`, workflows, déclencheurs, variables, schéma.

### Pare-feux implémentés (échec fermé)

- **A — matière réelle** : fiche approuvée dont l'empreinte = celle du GO, sinon blocage (un titre, une URL, un champ de carte ne suffisent pas). Source liée en accès partiel ou non constaté ⇒ revue humaine. L'article France 3 (Frida-Kahlo) a été vérifié publiquement accessible et complet (lecture unique, sans contournement) ; ses faits concordent avec la fiche approuvée.
- **B — rattachement exact** : la source d'un fait est celle de l'étape du dossier qui porte **exactement** ce texte, sinon le média qu'il nomme ; un événement doit appartenir à l'affaire ; procédures d'un même établissement : le texte doit désigner la personne visée par sa fonction, sinon blocage (X compris).
- **C — 0 invention** : `verifierPost` reconstruit **depuis les données brutes** l'ensemble des valeurs autorisées et refuse toute valeur absente (fait altéré, phrase ajoutée, hashtag, gabarit inconnu : testés). Phrases reprises **entières** (jamais coupées) ; le lien « Source » doit être un média **nommé** par le texte.
- **D — personnes** : nombre d'enfants / décompte de plaintes (texte **et URL**), âge, parenté, rôle exact de la carte, troncature ⇒ blocage ; sexe d'un enfant ⇒ revue. Relaxe / classement ⇒ hors automatisation. Statut carte ≠ statut fiche / événement ⇒ blocage. Réserve judiciaire **obligatoire** sur chaque post.
- **E — preuves** : chaque post porte sa table « affirmation → source → donnée approuvée → validation ».

## 3. Livrable 2 — Synthèse de performance éditoriale (corpus réel, 12 scénarios)

| # | Affaire | Famille | Source exploitable | X | Facebook | Principal problème |
|---|---|---|---|---|---|---|
| S01 | FR-2026-0113 Frida-Kahlo, Bordeaux | Nouvelle affaire (riche) | oui | revue | **conforme** | FB lié à France 3 (A2) ; X minimal lié à Ouest-France, dont l'accès n'est pas constaté par SNY |
| S02 | FR-2026-0025 Pontoise | Nouvelle affaire (limitée) | oui | **conforme** | **conforme** | X minimal (phrase d'état, A3) ; article de 2024 |
| S03 | FR-2026-0005 Saint-Dominique, Paris 7e | Évolution — mise en examen | oui | **conforme** | **conforme** | — |
| S04 | FR-2026-0001 Aqueduc | Évolution — condamnation | oui | bloqué | **conforme** | X : aucune phrase courte ne distingue la procédure de l'enseignant (FR-2026-0002) |
| S05 | POC-05 Alphonse-Baudin | Déclaration associative (L'Enfant Bleu) | oui | bloqué | revue (GO spécifique) | X trop court pour déclaration + situation de la procédure |
| S06 | FR-2026-0001 Aqueduc | Prise de parole (avocat de la famille) | oui | bloqué | revue (GO spécifique) | X : la procédure ne serait pas distinguée de FR-2026-0002 |
| S07 | FR-2026-0144 Saint-Aubin-lès-Elbeuf | Contrôle — insuffisant | non | bloqué | bloqué | Aucune fiche approuvée : seulement carte, titres, URL |
| S08 | FR-2026-0004 Vigée-Lebrun | Contrôle — ambigu | non | bloqué | bloqué | Événement « condamnation » vs carte « enquête » ; l'événement dit lui-même que l'état ne change pas |
| S09 | FR-2026-0027 Vic-la-Gardiole | Contrôle — piège | oui | bloqué | bloqué | Événement étiqueté « mise en examen » = remise en liberté : aucune nouvelle étape |
| S10 | POC-09 Titon | Contrôle — relaxe frappée d'appel | — | bloqué | bloqué | Relaxe hors automatisation ; source d'état sans lien |
| S11 | FR-2026-0002 Aqueduc (enseignant) | Contrôle — même établissement | oui | bloqué | **conforme** | FB distingue la procédure (« un professeur ») et lie Le JDD (URL « …douze-enfants… » tolérée, A2) ; X : aucune version courte ne la distingue |
| S12 | FR-2026-0002 ← événement de FR-2026-0001 | Contrôle — non-confusion | — | bloqué | bloqué | Événement non rattaché : la condamnation n'est jamais attribuée à l'autre procédure |

**Bilan après arbitrages (§5)** : 7 messages conformes aux contrôles (Facebook S01, S02, S03, S04, S11 ; X S02, S03) · 3 en revue humaine (X S01 ; Facebook S05 et S06, déclarations soumises au GO spécifique) · 14 canaux bloqués avec motif précis. *(Avant arbitrages : 4 conformes, 5 en revue, 15 bloqués.)* **0 manquement critique** sur les messages produits (contrôles automatisés 100 %). Aucun message n'est « publiable » : corpus historique (sources de 2024 à octobre 2026), aucune diffusion rétroactive, aucun GO.

## 4. Livrable 3 — Progression mesurée (même corpus, même code de génération)

| Étape | Résultat |
|---|---|
| **Moteur actuel** | 12/12 scénarios produisent un texte (contrôles négatifs compris). Fait principal absent partout ; en-tête générique ; Aqueduc S11 indiscernable de S04. |
| **v1** (1re génération) | 5 canaux « conformes » selon les contrôles de l’époque (X et FB de S01 et S02, FB de S03) — **mais** défauts réels lus à la main : (1) **attribution incohérente** : X S01 « Selon Ouest-France… » lié au Figaro ; FB S01 lié au Figaro (partiel) au lieu de France 3 ; S11 lié à un article de nov. 2025 pour un fait de mars 2026 ; (2) X S11 **sans réserve** (« faits présumés » pris pour une présomption d'innocence) ; (3) X redondants (« enquête en cours » + « une enquête a été ouverte ») ; (4) X d'évolution bloqués alors que l'étape existait ; (5) S06 bloqué faute de situer la procédure ; (6) réserves en doublon (S05), « 1 juillet ». |
| **Corrections** | source exacte de l'étape ; niveau d'accès constaté ; lien X = média cité ; réserve stricte ; en-tête X sans redite ; 1re phrase **entière** du libellé validé pour les évolutions ; situation de la procédure pour les déclarations ; déduplication ; garde d'âge accent-tolérante ; **nouveau contrôle automatique** « le lien Source est un média nommé » (le défaut v1 est désormais rejeté : test). |
| **Final (v3.2)** | voir §3. S03 X passe de « bloqué » à un fait précis (« Deux animateurs mis en examen… placés en détention provisoire (selon franceinfo). La mise en examen ne vaut pas culpabilité. » — 271 car.). S11 passe de « revue » à « bloqué » pour une raison réelle (URL portant un décompte d'enfants) que la v1 avait manquée. |

**Grille (aide à la revue, mécanique, explicable)** — notes finales : FB 100 (S02, S03, S04), 97 (S05, S06), 95 (S01) ; X 92 (S03), 89 (S01, S02). C'est une auto-évaluation par règles, **pas** une preuve de satisfaction éditoriale.

**Mon jugement rédactionnel (distinct des contrôles)** : les Facebook S01, S02, S03 sont de bonne tenue (fait daté, attribué, nuancé, compréhensible sans contexte) ; S04 est exact mais dense (peine, FIJAIS) ; S05/S06 sont fidèles mais longs (≈ 1 100 car.). Les X restent **en deçà** de 95 dans 2 cas sur 3 : la phrase d'état du site (« Selon France info, une mise en examen a été prononcée. ») est exacte mais pauvre — la matière approuvée ne contient **aucune phrase courte** décrivant le fait. Cas encore insatisfaisants : X S01/S02 (pauvres), X S04/S05/S06 (impossibles en l'état).

## 5. Livrable 4 — Arbitrages humains : TRANCHÉS par Adrien le 12/11/2026

| # | Question | Décision | Mise en œuvre |
|---|---|---|---|
| A1 | Fonction de la personne visée | **Oui, telle qu'écrite dans la fiche approuvée** (la valeur exacte de la carte reste bloquée) | comportement du composeur ; une procédure sœur distinguée n'est plus un point de revue mais une note |
| A2 | Lien dont l'adresse / le titre porte un décompte | **Autorisé si le texte du post n'en contient aucun** | `ARBITRAGES.lienAvecDecompte` ; les gardes restent bloquantes sur le texte ; S01 lie France 3, S11 lie Le JDD |
| A3 | Format X | **X minimal maintenant ; phrase courte approuvée ensuite** | champ facultatif `accroche_courte` du dossier (≤ 140 car., « Selon <média>, … »), couvert par l'empreinte d'approbation, utilisé en priorité par X ; testé, encore présent dans **aucun** dossier |
| A4 | Réserve courte, condamnation à finalité inconnue | **Mention fixe « Caractère définitif non documenté. »** | ajoutée à `web/src/lib/etat-wording.ts` (site et posts identiques) — **effet public au déploiement** : 14 affaires publiées l'affichent dans la fenêtre de la carte (fiches inchangées : leur état approuvé prime) ; vérifié sur le site construit localement (FR-2026-0001) |
| A5 | Détails déjà approuvés (sexe d'un enfant, peine, FIJAIS) | **Repris tels quels** | `ARBITRAGES.revueSexeEnfant = false` |

Effet mesuré : Facebook S01, S04, S11 passent à « conforme » ; X S04 et S06 restent bloqués (procédure Aqueduc non distinguable en version courte : A1 n'y suffit pas sans `accroche_courte`).

### Libellé des questions telles que posées

1. **Fonction de la personne visée dans les posts.** La V1 garantissait « jamais le rôle » ; les fiches approuvées le disent (« l'animateur », « un professeur », « une ATSEM ») et c'est **la seule chose** qui distingue les deux procédures Aqueduc (S04 vs S11). Le pilote reprend la fonction **telle qu'écrite dans la fiche approuvée** et bloque seulement la valeur exacte de la carte. *Valider, ou exiger l'ancienne garantie (alors S04, S06, S11 restent bloqués et les affaires à procédures multiples ne sont jamais relayées).*
2. **Liens dont l'adresse ou le titre porte un décompte** (« sept parents d'élèves portent plainte », « …sur douze enfants »). Le pilote ne les lie jamais (l'aperçu de lien afficherait le titre). Conséquence : S01 lie Le Figaro (accès partiel) au lieu de France 3 ; S11 est bloqué. *Maintenir, ou accepter le lien quand le texte du post, lui, ne contient pas le nombre.*
3. **Format X.** Avec deux liens et une réserve, un X fidèle laisse ≈ 180 caractères ; les phrases approuvées font 200 à 400. *Choisir : (a) X minimal = phrase d'état du site (S01, S02 aujourd'hui), (b) un seul lien (la fiche SNY, la source restant nommée) pour gagner 23 caractères, ou (c) silence sur X tant qu'aucune phrase courte n'est approuvée.*
4. **Réserve courte pour les condamnations dont le caractère définitif est inconnu.** La seule réserve approuvée (S04) fait ≈ 140 caractères ⇒ X impossible. *Approuver une mention courte et fixe dans la formulation du site (ex. « Caractère définitif non documenté. »), ou accepter le silence X sur ces cas.*
5. **Détails sensibles déjà publiés sur la fiche** : sexe d'un enfant (« une enfant », S04/S06), détail de peine et inscription au FIJAIS (S04). *Les relayer tels quels sur les réseaux (portée bien plus large que la fiche), ou exiger une phrase approuvée sans ces détails.* Exemple exact : FB S04, § 2, dans le banc.

(Pour les déclarations — S05, S06 — le **GO Telegram spécifique** est maintenu par principe : le futur message devra présenter le texte exact X et Facebook, la déclaration, sa source et la situation de la procédure ; non implémenté ici, par consigne.)

## 6. Livrable 5 — Bilan technique

- **Tests** : `test-banc-social` 106/106 ✅ (dont arbitrages A1–A5) · non-régression `test-diffusion-sociale` 94 ✅, `test-diffuser-script` 27 ✅ (après `npm ci` dans le worktree : il échouait seulement faute de `node_modules`), `test-buffer-sonde` 13 ✅, `test-wording-proces` 10 ✅. `run-all` : 2 échecs **préexistants**, identiques sur `main` sans ces changements (`test-fiche-priorite` : chemin `%20` sous Windows ; `test-declaration-organisme` : assertion) + constat de corpus R5 (FR-2026-0024, FR-2026-0035) déjà connu.
- **Absence de publication** : aucun appel Buffer, aucune écriture Neon, aucune variable modifiée ; journal de diffusion vide.
- **Diffusion** : désactivée (`SNY_DIFFUSION_ACTIVE=0`, `SNY_DIFFUSION_DEPUIS` non daté).
- **Écarts restants avant un GO éditorial** (plus petit changement à chaque fois) :
  1. *Phrase courte approuvée (A3)* : le composeur la lit déjà ; il reste à la **rédiger et l'approuver** fiche par fiche (une nouvelle approbation de fiche, son empreinte changeant). C'est elle qui débloquera X sur S01/S04/S05/S06.
  2. *Niveau d'accès des sources de la carte* : `acces` n'est connu que pour les sources relues du dossier ; l'enregistrer aussi dans `cases.sources` lors de la relecture (sinon « non constaté » ⇒ revue, cas du X S01).
  3. *Garde partagée* : `RE_AGE_ENFANT` (`fiche-extraction.mjs`) ne voit pas « âgée de 6 ans » (`\b` devant « â ») — corrigé localement dans le pilote seulement ; à corriger dans le module partagé (hors périmètre).
  4. *Intégration* (après GO seulement) : dans `diffuser-social.mjs`, remplacer `composerMessage` par `composerPilote` + `verifierPost` (≈ 20 lignes) et adapter la porte d'éligibilité aux familles « déclaration » (GO spécifique).

## 7. Note de sécurité

- **Objet** : banc local qui compose et contrôle des textes à partir de données déjà publiques et approuvées. **Installation** : aucune (scripts Node du dépôt). **Au démarrage** : rien. **Réseau** : aucun. **Privilèges** : lecture de fichiers du dépôt, écriture dans `out/` (ignoré). **Données personnelles** : aucune collectée ; les textes ne contiennent que des phrases déjà publiées sur le site. Une revue Sécurité reste recommandée **avant** l'intégration au pipeline Buffer (publication automatique sur des comptes publics, sujet sensible : mineurs).
