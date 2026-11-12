# SNY — Itération éditoriale sociale V4 (12/11/2026)

> **Aucune publication, réelle, programmée ou simulée.** Aucun appel Buffer, `SNY_DIFFUSION_ACTIVE=0` (vérifié, non modifié). Le composeur pilote n'est **pas** branché sur le pipeline de diffusion (`scripts/diffuser-social.mjs` ne l'importe pas — contrôle automatisé). Aucun fichier de `web/`, `data/` ou `.github/` modifié. Aucune fiche approuvée modifiée ou réapprouvée. **Aucun GO éditorial ni GO de diffusion.**

Base : `main` après la PR 118 (pilote V3, `pilote-social-v3.2`). Version produite : `pilote-social-v4.0`. Même architecture : un seul composeur (`scripts/lib/social-editorial.mjs`), le même contrôleur indépendant, le même banc, les mêmes 12 scénarios.

Rendus (une seule exécution, version V3 jointe à chaque scénario) : [`banc-social/banc.md`](banc-social/banc.md) (lisible sur GitHub) · [`banc.html`](banc-social/banc.html) · [`banc.json`](banc-social/banc.json).

---

## 1. Ce qui a changé dans le composeur (rien n'est rédigé : tout est extrait ou choisi dans la matière approuvée)

| Règle V4 | Arbitrage | Effet |
|---|---|---|
| **Objet de la procédure** dans l'accroche Facebook et dans X : « mise en examen **pour viol sur mineur** ». L'objet est un **extrait exact** de la phrase approuvée qui énonce ce statut, coupé à la première articulation ; le contrôleur vérifie qu'il en est une sous-chaîne. Jamais la catégorie de la carte. | n°1 | S01–S04 : l'accroche dit le fait. La catégorie de la carte aurait été fausse pour S04 (« agression sexuelle » au lieu d'« atteinte sexuelle »). |
| X : nouvelle forme « lieu : étape **pour** objet (selon média). ». Le repli V3 sur la seule phrase d'état du site (« Selon X, une enquête a été ouverte. ») est **supprimé**. | n°1 (voir §5, D1) | S01 et S02 sur X disent ce qui est reproché. S01 ne crédite plus Ouest-France, que SNY n'a jamais relu. |
| « enquête **ouverte** » au lieu d'« enquête **en cours** » | n°1, fidélité | Aucune source n'établit que l'enquête se poursuit (S01 : aucun développement après juillet). |
| **Contexte (paragraphe 2)** choisi parmi les phrases approuvées entières (dossier, `faits`, `deroule`), selon les critères suivants :<br>• d'abord les autres passages de l'article de l'événement, puis le plus nouveau ;<br>• attribution propre ;<br>• sources lues par SNY, la source liée en accès libre ;<br>• aucune phrase anaphorique ;<br>• aucune étape dépassée par le statut ;<br>• désignation de la fonction s'il existe une procédure sœur. | n°1 | S01 : garde à vue et perquisitions. S03 : gardes à vue levées et témoin assisté. S04 : motivation du jugement. S02 : position de la personne mise en examen. |
| La longueur Facebook est mesurée **URL comptées 23** (limite lisible : 1 400). | n°1 | En V3, les adresses longues des médias évinçaient le contexte (S03, S04). |
| **Une source par média nommé** : un lien par paragraphe sourcé, toujours celui d'un média que la phrase nomme. | fidélité | Contrôle indépendant inchangé (« le lien Source est celui d'un média nommé »). |
| Les adresses d'article qui **annoncent une autre étape** (« écope… prison », « déférés ») ne sont pas liées à une affaire qui n'en est pas là. | pare-feux | S02 : Linfo.re (titre sur la condamnation dans l'affaire Stanislas) n'est plus lié à Pontoise. S11 : Le Figaro est lié plutôt que le JDD (« trois hommes déférés »), alors que le professeur n'a pas été déféré. |
| **Mention judiciaire courte** : une par thème. La réserve de la fiche n'est préférée que si elle dit plus que la mention courte. | n°1 + A4 | S04 : « Caractère définitif non documenté. » remplace 130 caractères qui disaient la même chose. |
| **Déclarations : trois contrôles indépendants** :<br>• citation exacte visible ;<br>• intérêt concret ;<br>• lien direct avec l'affaire.<br>Tout échec bloque. | n°2 | S05 et S06 bloqués (§2). |
| **Priorité des paroles** : parents (1), collectifs (2), associations de familles (3), associations spécialisées (4), avocats (5). Pour une affaire en cours, un avocat doit apporter une démarche, une demande ou une explication. | n°3 | Affiché dans le banc ; « avocat des parents » est classé avocat. |
| `REVUE_HUMAINE` explicite. Chaque scénario affiche la **validation requise** : GO social humain distinct, par réseau, aucun accordé ; pour une déclaration, un GO spécifique, jamais couvert par le GO Telegram de la fiche. | n°3 | Aucune déclaration ne peut devenir « conforme » d'office (test avec une déclaration idéale). |
| Grille qualité re-pondérée : précision 30, fidélité 25, accroche 20, lisibilité 15, judiciaire et SNY 10. Elle affiche la **part factuelle**. | §7 | Note de l'outil, mécanique ; ce n'est pas l'avis d'Adrien. |

Rien d'autre n'a changé :
- **Pare-feux** : empreinte de fiche, statut ambigu, relaxe hors automatisation, rattachement d'événement, procédures sœurs, gardes de sécurité des personnes, médias payants, A1–A5.
- **Contrôleur indépendant** : un seul ajout, la sous-chaîne exacte pour l'objet.

## 2. Livrable B — avant / après (textes exacts : `banc.md`, rubrique « Version précédente » de chaque scénario)

**S01 — Frida-Kahlo, Bordeaux (nouvelle affaire)**
- **X : REVUE → conforme.**
  - V3 : « Selon Ouest-France, une enquête a été ouverte. », lié à un article que SNY n'a jamais relu.
  - V4 : « …enquête ouverte pour agressions sexuelles sur mineurs de 15 ans (selon France 3 Nouvelle-Aquitaine). », source relue en accès libre.
- **Facebook** :
  - L'accroche dit l'objet de l'enquête.
  - Le contexte ajoute la garde à vue des deux agents, les perquisitions et l'exploitation du matériel informatique saisi, « en toute première priorité » selon le parquet.
- **Ce qui reste** : ce paragraphe de contexte contient la note approuvée « La date n'est pas établie : … selon Le Figaro », un article lu en partie. Il est repris tel quel (§5, D-hors liste).

**S02 — Saint-Martin-de-France, Pontoise (nouvelle affaire)**
- **Accroche** : V3 « mise en examen » ; V4 « mise en examen pour viol sur mineur ».
- **X** : V3 « Selon France info, une mise en examen a été prononcée. » ; V4 « …mise en examen pour viol sur mineur (selon France info). ».
- **Facebook** ajoute la position de la personne mise en examen : « nie avec fermeté l'accusation de viol… » (§5, D3).
- **Défaut évité en cours d'itération** : un passage Linfo.re aurait été lié avec une adresse annonçant la condamnation dans **une autre procédure** (Stanislas).

**S03 — Saint-Dominique, Paris 7e (évolution)**
- **X inchangé**, comme demandé : il fonctionnait.
- **Facebook** :
  - L'accroche dit « mise en examen le 22 mai 2026 pour des faits à caractère sexuel ».
  - Le contexte reprend la suite immédiate rapportée par le même article : treize des seize personnes relâchées, trois présentées aux juges, une animatrice témoin assistée.

**S04 — Aqueduc, condamnation de l'animateur (évolution)**
- **Facebook** :
  - L'accroche dit « condamnation prononcée le 10 juillet 2026 pour atteinte sexuelle sur une enfant ».
  - Le contexte reprend la motivation du jugement rapportée par CNEWS : cohérence et constance de la parole de l'enfant.
  - La mention est réduite à « Caractère définitif non documenté. ».
- **Reste bloqué, à juste titre** : X. Aucune version courte ne désigne la fonction, et une procédure sœur existe (FR-2026-0002). L'étape dépassée « renvoyé… pour agression sexuelle » est écartée.

**S05 — L'Enfant Bleu (déclaration associative)**
- **REVUE → bloqué**, sur les trois contrôles :
  - **Citation exacte** : la matière validée n'est qu'une paraphrase rédigée par SNY (« L'association indique… »), pas un extrait de l'association.
  - **Lien direct** : la portée validée est « établissement ». La publication présente les actions de l'association auprès des collectivités et ne précise ni la date de la démarche ni la procédure visée.
  - **Intérêt concret** : non évaluable sans extrait exact.
- Aucune nouvelle catégorie « publication générale » n'a été créée, conformément à la consigne.
- Pour débloquer : relire la publication et faire valider un extrait exact rattaché à la procédure. C'est une donnée absente, pas un défaut de rédaction.

**S06 — Avocat de la famille, Aqueduc (déclaration)**
- **REVUE → bloqué** :
  - La citation retenue, « On est très satisfait de cette décision qui vient d'être rendue », n'est qu'une réaction évaluative : ni démarche, ni demande, ni explication de la décision.
  - La citation exacte et le lien direct avec l'affaire sont, eux, établis.
- Le même avocat a une autre citation approuvée qui passerait le contrôle d'intérêt (§5, D2).

**S11 — Aqueduc, enseignant (nouvelle affaire)**
- **Facebook** :
  - L'accroche dit l'objet (« des faits présumés d'agressions sexuelles »).
  - Le lien pointe vers Le Figaro et non plus vers le JDD « trois hommes déférés ».
- **Ce qui reste** :
  - Pas de contexte. Les passages approuvés qui le donneraient (signalement du 14 octobre, suspension le jour même) contiennent le mot exact du rôle de la carte (« enseignant »), que la garde héritée d'A1 bloque.
  - Les autres passages ne désignent pas la fonction alors qu'une procédure sœur existe.
  - La lourde chaîne d'attribution (« Selon l'AFP, citée par… puis relayée par… ») est dans la phrase approuvée elle-même. La simplifier exige une phrase approuvée plus courte (`accroche_courte`, A3), pas une réécriture du composeur.
  - X reste bloqué (procédure non distinguée).

Les scénarios S07 à S10 et S12 sont inchangés : tous bloqués pour les mêmes motifs documentaires qu'en V3.

## 3. Livrable C — qualité et non-régression

| | Conformes | Revue humaine | Bloqués |
|---|---:|---:|---:|
| V3 (12/11, PR 118) | 7 | 3 | 14 |
| **V4** | **8** | **0** | **16** |

- **+1 conforme** : X de S01. Son seul défaut V3 (Ouest-France, non relu) a disparu.
- **−3 revues** :
  - X de S01 est devenu conforme.
  - Les déclarations S05 et S06 passent de la revue au **blocage**. C'est une montée en exigence voulue par les arbitrages n°2 et n°3, pas une perte.

Grille V4, appliquée **aux mêmes textes** (V3 recomposé avec son propre code, noté avec la grille V4) :

| Scénario | V3 | V4 |
|---|---|---|
| S01 X | revue · 69 (63 % factuel) | **conforme · 100** (74 %) |
| S01 Facebook | 82 (90 %) | **100** (95 %) |
| S02 X | 72 (71 %) | **100** (72 %) |
| S02 Facebook | 82 (88 %) | **100** (91 %) |
| S03 X | 100 (79 %) | 100 (79 %) — inchangé |
| S03 Facebook | 82 (90 %) | **100** (95 %) |
| S04 Facebook | 82 (77 %) | **100** (96 %) |
| S11 Facebook | 82 (86 %) | **90** (88 %) — sans contexte, faute de matière utilisable |
| **Moyenne des conformes** | **83,1** (7 messages) | **98,8** (8 messages) |

**Limites honnêtes de cette mesure :**
- La grille est mécanique et je l'ai écrite. Elle sature à 100 et départage peu.
- Elle a donné 100 aux déclarations V3 de S05 et S06, qui avaient pourtant un défaut documentaire réel. La note ne voit pas ce que voient les contrôles bloquants, et **elle n'a servi à débloquer aucun message**.
- La part factuelle (texte des faits et du contexte rapporté aux mentions judiciaires) est de 72 à 96 % sur les messages conformes. Le X de S02 (72 %) est le plus juste : sur 280 caractères, la mention « La mise en examen ne vaut pas culpabilité. » pèse lourd.

**Tests :**

| Test | Résultat |
|---|---|
| `scripts/qa/test-banc-social.mjs` | **144 ✅** (121 en V3), dont 23 nouveaux, chacun ciblant une règle V4 ou un défaut trouvé pendant les itérations |
| Non-régression de la diffusion | `test-diffusion-sociale` 94 ✅ · `test-diffuser-script` 27 ✅ · `test-wording-proces` 10 ✅ |
| `run-all` | 2 échecs, **préexistants** et identiques sur `main` sans ce changement : `test-declaration-organisme` et `test-fiche-priorite`. Ils n'importent pas le pilote. Le banc y est bloquant et passe. |

Aucune régression d'une protection existante. Toutes les injections V3 échouent toujours. Nouvelle injection : un objet altéré (« viol aggravé ») est refusé par le contrôleur.

## 4. Itérations (baseline → modification → génération → revue documentaire → revue éditoriale → correction)

1. **Baseline** : code V3 sur les données de `main` (5 commits de données depuis la PR 118). Résultat 7 / 3 / 14, textes identiques à la PR 118.
2. **V4.0** : objet, contexte, déclarations, mentions courtes. Revue documentaire, 3 défauts :
   - **S01** : contexte « Selon Le Figaro… » repris d'un article lu **en partie**, et redondant (« second signalement »).
   - **S02** : passage Linfo.re lié par une adresse qui titre sur **une autre procédure** (« écope d'un an de prison », Stanislas). Confusion de procédure.
   - **S04** : la motivation du jugement était écartée (procédure sœur, sans désignation) au profit d'une étape ancienne.
3. **V4.1** : accès constaté exigé, adresses annonçant une autre étape refusées, exception « même jugement, même article ». Le contrôleur indépendant **bloque S03** : un passage « Selon Commons Média » était lié à CNEWS, source complémentaire de la même étape. C'est le pare-feu qui fonctionne. Le lien suit désormais le média nommé.
4. **V4.2** : le tri « le plus nouveau d'abord » fait remonter, pour S03, d'anciennes mesures et une phrase **illisible seule** (« Selon Sud Ouest, **ces images**… »). Pour S04, il fait remonter une étape dépassée (« renvoyé… pour agression sexuelle » sous une condamnation pour atteinte sexuelle).
5. **V4.3** (version livrée) :
   - l'article de l'événement passe d'abord ;
   - phrases anaphoriques écartées ;
   - étapes dépassées écartées ;
   - doublons de fond mesurés sur des mots tronqués (« suspendus » / « suspendues »).

   Revue éditoriale des 8 messages conformes : aucun défaut restant. Non-régression complète.

## 5. Livrable D — les trois arbitrages qui reviennent à Adrien

**D1 — X : accepter l'objet raccourci, et confirmer l'abandon du X « étape seule ».**
- **Contexte** : la consigne n°1 (« ne pas remplacer une information précise par une formule abstraite ») est incompatible avec le repli « X minimal » d'A3 quand la fiche contient le fait précis. J'ai appliqué la consigne la plus récente et je le signale ici.
- **L'objet raccourci** : pour tenir en 280 caractères, X peut dire l'objet **sans sa circonstance aggravante**. S01 dit « enquête ouverte pour agressions sexuelles sur mineurs de 15 ans (selon France 3 Nouvelle-Aquitaine) » et omet « par personne ayant autorité ». Le texte reste exact, mais il est moins complet.
- **Question** : accepte-t-on cette forme courte, ou exige-t-on l'objet complet, quitte à bloquer X ?

**D2 — S06 : relayer l'autre citation de l'avocat de la famille ?**
- « On est content que la parole de cette enfant ait été entendue » (Charles Héran, CNEWS, 10 juillet 2026) passe le contrôle d'intérêt. Elle fait écho à la motivation du jugement (parole de l'enfant jugée cohérente et constante).
- Elle reste une parole d'avocat, avec mention du sexe de l'enfant, déjà approuvée (A5).
- **Question** : est-ce une plus-value suffisante pour une publication autonome, ou les paroles d'avocat restent-elles hors des réseaux sauf démarche nouvelle ?

**D3 — S02 : la position de la personne mise en cause dans un post social.**
- Le contexte retenu pour Pontoise est « Selon France info, le mis en cause nie avec fermeté l'accusation de viol et se dit humilié et effondré. ».
- C'est approuvé et cela sert la présomption d'innocence. Mais cela donne, sur un réseau social, plus de place à la défense qu'aux faits.
- **Question** : reprend-on la position de la personne mise en cause quand elle est la seule information nouvelle disponible, ou la réserve-t-on à la fiche ?

*Hors liste, sans question nouvelle :*
- **S05** : rien ne débloquera S05 sans un extrait exact rattaché à la procédure.
- **S11** : le contexte est bloqué par la garde du rôle exact (A1), que je ne rouvre pas.
- **S01** : le contexte cite une date donnée par un article lu en partie, reprise telle qu'approuvée.

## 6. Résumé technique

**Fichiers** (pilote, ses tests, ses rendus ; rien d'autre) :
- `scripts/lib/social-editorial.mjs` (`pilote-social-v4.0`). Nouvelles fonctions exportées :
  - `qualification`, `recouvrement`, `urlAnnonceAutreEtape` ;
  - `categorieParole`, `interetConcret`, `GRILLE`.
- Nouveaux gabarits : `accroche_fb_qualif`, `fait_x`.
- `scripts/banc-social.mjs` : `REVUE_HUMAINE`, contrôles de déclaration, validation requise, option `--avant <banc.json>` pour joindre la version précédente.
- `scripts/qa/test-banc-social.mjs` (144 contrôles) et le libellé dans `scripts/qa/run-all.mjs`.
- `docs/industrialisation/banc-social/banc.{md,html,json}` régénérés en une exécution :

```bash
BANC_DATE=2026-11-12T18:00:00Z node scripts/banc-social.mjs --sortie docs/industrialisation/banc-social --avant <banc.json V3>
```

**Ce qui n'a pas été fait (hors mandat) :**
- aucun deuxième composeur, aucun LLM, aucune table, aucun workflow, aucun circuit Telegram ;
- aucun raccordement à Buffer ;
- aucune modification de `etat-wording.ts`, des fiches ou des événements.

## 7. Note de sécurité

| Point | État |
|---|---|
| Objet | Banc local de composition de textes pour X et Facebook, à partir de la matière déjà approuvée |
| Installation | Aucune : scripts du dépôt, exécutés à la main |
| Démarrage automatique | Aucun |
| Réseau | Aucun appel : ni fetch, ni Buffer, ni base, ni modèle (contrôlé par test) |
| Privilèges | Aucun privilège particulier |
| Données personnelles | Aucune nouvelle donnée. Gardes inchangées : ni nom, ni nombre ou âge d'enfants, ni parenté, ni détail graphique. Aucun texte intégral d'article dans les fixtures (références seulement) |
| Effet public | Aucun : `web/`, `data/` et `.github/` non modifiés ; site identique |
| Diffusion | Aucune ; `SNY_DIFFUSION_ACTIVE=0` |

Toute activation future (raccordement du composeur au pipeline, GO social par réseau) demandera un GO éditorial d'Adrien et une revue dédiée.
