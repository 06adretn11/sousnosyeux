# Cas BFMTV du 10/07/2026 — Baudin / Titon, de bout en bout (23/11/2026)

> Version **expurgée** pour le dépôt public : aucune adresse d'article, aucune citation longue, aucun prénom de parent, aucun nom de personne mise en cause. La version complète (passages, adresses, citations vérifiées une à une) est un document interne, hors dépôt.
> Aucune écriture Neon, aucun envoi, aucune publication, aucune modification de fiche ou de Hub dans cette étape.

L'article est **déjà connu** : son adresse figure dans le hub `/territoires/paris-11e/` (repère chiffré « 2 relaxes dans le 11e, toutes deux frappées d'appel »), pas dans les listes de sources des fiches `poc-05` (Baudin) et `poc-09` (Titon). Les décisions et appels sont documentés ; le rassemblement du 9 juillet est déjà sur Baudin (franceinfo). Rien ici ne part de l'hypothèse « article jamais trouvé ».

## 1. Parcours reconstitué (ce qui est traçable, ce qui ne l'est pas)

| Date | Étape | Preuve / trace |
|---|---|---|
| 30/09/2026 | L'adresse apparaît dans une recherche **Bing Actualités** de la Maintenance (neuf résultats sur « Baudin / appel / relaxe »). | transcript de session (liste de résultats) |
| 16/10/2026 09:31 UTC | L'article est enregistré (`articles`, lu par outillage) et la Maintenance propose, pour **POC-05**, un `STATE_CHANGE` « relaxe → relaxe » (modèle `deepseek-v4.1-flash`, citation : l'appel du parquet pour une partie des enfants). | `state_proposals` (export local du 21/11) |
| 16/10/2026 | Même jour (mission « fermer la boucle », PR #8) : « état identique ≠ changement d'état » ; rejeu sur la vraie page : `NO_ACTION`, aucun clic. Une seule information extraite : le rassemblement du 9 juillet, **déjà connu**. | compte rendu de mission |
| 29/10/2026 | **Lecture manuelle** pour le Hub (outil local, extraction **filtrée par mots-clés** appel / parquet / relax / Titon / Baudin) : sert de source au repère chiffré du Hub. | transcript, `data/hub-matiere/paris-11e.json` |
| 14/11/2026 13:58 UTC | Nouvelle analyse de la même page : `NO_CHANGE` (aucun message). | `state_proposals` |

**Pourquoi le lien et ses apports ne figurent pas dans les fiches (4 causes, toutes établies par le code ou les traces) :**

1. Les fiches publiées sont des **dossiers approuvés figés** ; une source n'y entre que par le circuit de mise à jour (`proposer-mises-a-jour-fiches`), qui exige un **événement judiciaire nouveau et étayé**. L'article n'en apportait aucun.
2. Une source nouvelle **sans fait nouveau** est `SOURCE_ONLY` : aucun message, aucun rattachement, aucune consignation sur la fiche (`categorieNouveaute`, `clic: false`). La source reste seulement dans `articles`.
3. **Aucun circuit automatique n'extrait les paroles** : `extraireReactions` ne lit que des mobilisations et des mesures institutionnelles (« jamais de parole citée »). Les avocates et la porte-parole de l'article n'ont donc jamais pu être proposées. Les « Paroles » d'une fiche viennent de la génération de fiche (extraction documentaire + GO), pas de la Maintenance.
4. La lecture du 29/10 était filtrée par mots-clés : elle servait un repère chiffré du Hub, pas un inventaire de l'article.

**Non traçable :** pourquoi la première lecture (16/10) n'a retenu qu'un passage (le journal ne conserve que la citation du modèle) ; la date de publication enregistrée (09/07 dans l'export local, 10/07 écrite et lue sur la page) — l'export a pu subir le décalage d'un jour connu de `pg` (date → JS) : à vérifier en lecture directe.

## 2. Lecture de l'original

Copie complète lue le 23/11/2026 par l'extracteur du dépôt (HTTP 200, 4 399 caractères, texte complet jusqu'au bandeau de droits ; `WebFetch` refuse ce domaine, le lecteur du dépôt l'accepte). Conservée hors dépôt. Les citations proposées ci-dessous ont été **vérifiées littéralement** dans cette copie.

## 3. Tableau par élément utile

Repères « § » : paragraphes numérotés de la copie lue (la légende de la photo est le §1, le chapô le §2).

Statut : **présent** = déjà dans la fiche/mémoire ; **nouveau** = absent ; destination = surface existante. Aucun fait d'une procédure n'est attribué à l'autre.

### 3.1 Faits judiciaires

| Passage (repère) | Affaire | Date | Statut | Destination / traitement |
|---|---|---|---|---|
| Relaxe de l'animateur de l'école Baudin, « le 7 juillet » (légende, §1) | POC-05 | 2026-07-07 | **présent** (déroulé, franceinfo) | rien ; BFMTV = seconde source à rattacher |
| Appel du parquet « au lendemain du jugement », pour une partie des enfants (§8) | POC-05 | 2026-07-08 | **présent** (appel du 08/07, « partie des enfants ») | rien ; le **nombre exact d'enfants n'est pas repris** (principe éditorial) |
| Relaxe de l'animateur de l'école Titon « en juin dernier » (§10) | POC-09 | 2026-06-16 | **présent** | rien ; BFMTV = seconde source à rattacher |
| « Le parquet a également fait appel » pour Titon (§11) | POC-09 | sans date (17/06 connue) | **présent** | rien — **ne pas attribuer à Baudin** (`etablissements` du détecteur, §5) |
| Motivation du président du tribunal (influence supposée des parents, absence de gestes rapportés par un adulte) (§5) | POC-05 | 2026-07-07 | **nouveau**, sensible | décision éditoriale : « selon BFMTV », position attribuée ; **non préparée comme fait** |
| Troisième jugement du 10 juillet, autre animateur condamné (§12) | autre affaire | 2026-07-10 | non attribuable | concordance **probable** avec FR-2026-0001 (décision du 10/07 déjà en mémoire), non établie par l'article : **rien n'est rattaché** à Baudin ni Titon |

### 3.2 Paroles et réactions attribuées

| Passage | Auteur | Affaire | Date | Statut | Destination / traitement |
|---|---|---|---|---|---|
| Désaccord avec la relaxe (« erreur grave ») ; « Ces enfants méritent d'être crus. » (§3) | Me Hannah Kopp et Me Rebecca Royer, avocates de familles de Baudin (rattachement : franceinfo, Le Média ; l'article ne dit pas pour quelle école) | POC-05 | jour non indiqué (article du 10/07) | **nouveau** | **2 propositions** (une par déclaration), rattachées à Baudin par le registre des acteurs, `POSITION_ATTRIBUEE` ; la phrase qui contient le nombre d'enfants est écartée |
| « Cette solidarité, on l'a retournée contre eux » ; victimisation secondaire (§7) | Barka Zerouali, du collectif #MeToo École (qualité telle qu'écrite) | POC-05 | jour non indiqué | **partiellement présent** : la fiche cite déjà, sans la nommer, la critique de la cofondatrice (franceinfo) ; le nom, la qualité et le propos sont nouveaux | **1 proposition**, `POSITION_ATTRIBUEE` |
| Mère d'un enfant qui a dénoncé des faits à Baudin, prénom suivi d'un astérisque (§6) : « Moi, je n'ai jamais reparlé à mon fils… On se sent trahis, ridiculisés… » | prénom d'emprunt à astérisque, « la maman de l'un des enfants ayant dénoncé des violences sexuelles » (qualité coupée avant le nom de la personne poursuivie) | POC-05 | jour non indiqué (colère exprimée lors du rassemblement du 9 juillet selon le chapô) | **nouveau** | **1 proposition**, anonymisation et qualité conservées, propos intégral conservé (force du propos préservée) |
| Père d'une enfant plaignante, prénom à astérisque (§8) : « On est heureux qu'il y ait un appel, mais… l'appel ne concerne pas notre enfant » | prénom d'emprunt à astérisque, « père d'une enfant ayant porté plainte » | POC-05 | idem | **nouveau** (le caractère partiel de l'appel est déjà connu) | **1 proposition** |
| Mère d'une élève de Titon (§10–§11) : « Alors qu'un casseur écope de dix mois de prison… » | prénom non modifié par le média, « maman d'une élève scolarisée à l'école Titon », « lors d'une prise de parole » (rassemblement évoqué par l'article) | **POC-09** | 9 juillet (rassemblement) : jour du propos non écrit | **nouveau** | **1 proposition**, rattachée à Titon par son contenu (l'école est nommée) |
| Déclaration « Pour nous, c'est un coup de grâce… » (§9) | **aucun locuteur indiqué** par l'article | — | — | **bloquée** | motif précis : déclaration sans attribution ; jamais attribuée à un locuteur deviné |

### 3.3 Mobilisation commune

| Passage | Affaire | Date | Statut | Destination / traitement |
|---|---|---|---|---|
| « Jeudi 9 juillet … parents d'élèves et collectifs se sont réunis devant l'établissement » (§2) | POC-05 | 2026-07-09 | **présent** (événement du 09/07, franceinfo) | BFMTV = **seconde source datée** ; libellé du code final : « réalisée » (l'ancien code lisait « annoncée », voir §5) |
| Un parent de Titon prend la parole lors de ce rassemblement (§10) | POC-05 ; **pas** un événement propre à POC-09 | 2026-07-09 | **présent** pour POC-05 (« des familles de l'école Titon sont venues les soutenir ») | **ne pas dupliquer** pour Titon (`dejaConnuChezVoisines`, §5) |
| Légende : manifestation « organisée par le #MeToo École » devant Baudin (légende photo) | POC-05 | non datée par la légende | **présent** (acteur « Parents, collectif #MeTooEcole ») | rien |

### 3.4 Acteurs publics à suivre

| Acteur | Rôle public | Preuve du rattachement | État |
|---|---|---|---|
| Collectif #MeToo École | collectif national de familles | franceinfo (famille(s) de Baudin) ; BFMTV (légende) | **déjà au registre** (site, 2 pages) ; **complété** (voir §6) |
| Barka Zerouali | cofondatrice et porte-parole | BFMTV ; Le Média ; franceinfo (prénom seul) | **ajoutée** au registre |
| Me Hannah Kopp, Me Rebecca Royer (cabinet Kopp & Royer) | avocates de familles de Baudin | **franceinfo** (« avocates qui représentent six des enfants d'Alphonse-Baudin ») et **Le Média** — pas BFMTV seul | **ajoutées** au registre ; déjà suivies par la presse |
| Parquet de Paris | autorité de poursuite (appels) | article | institution, déjà suivie |
| Parents anonymisés (prénoms à astérisque) | parents d'élèves | cités par le média | **retenus** : paroles attribuées avec l'anonymat du média ; **aucune** recherche d'identité ni de compte |

## 4. Enrichissements prêts (rien appliqué)

- **POC-05 : 5 propositions de paroles** (avocates ×2, porte-parole, deux parents à prénom d'emprunt) et **POC-09 : 1** (la mère d'une élève de Titon), produites par le circuit existant à la lecture de l'article (voir `LOT_CORRECTIF_MAINTENANCE_23_11.md` §11) ; **une décision par parole**. La motivation du tribunal est reprise **directement « Selon BFMTV… »**, en position attribuée (proposition éditoriale hors circuit Telegram : état actuel de POC-05). Fichier prêt (hors dépôt) : `PAROLES_PROPOSEES_BFM.json`.
- **POC-05 et POC-09** : BFMTV en **source à rattacher** (même format que `data/fiches-sources-extra.json`), sans fait ajouté.
- **Aucun** événement `case_events` n'est proposé : tout ce qui est factuel dans l'article est déjà en mémoire. L'information « Titon à la prise de parole du 9 juillet » est déjà dans la fiche Baudin.

## 5. Défauts concrets trouvés en rejouant l'article avec le code final (corrigés, testés)

`scripts/qa/test-article-multi-affaires.mjs` (12 tests, textes synthétiques) :

1. **« deux jours après l'annonce de la relaxe, des parents se sont réunis »** : le nom « annonce » faisait lire le rassemblement **annoncé** au lieu de **réalisé** (`evenement-institutionnel.annonceFuture`). Une vraie annonce (« annoncent un rassemblement », « vont se rassembler ») reste annoncée.
2. **Le même rassemblement redevenait « nouveau » dès que l'article était lu pour l'école voisine** (Titon) : la mémoire n'était comparée qu'à l'affaire lue. `dejaConnuChezVoisines` (même type, même jour explicite, autre affaire de la même commune) ; un fait sans date n'est jamais écarté ; un second rassemblement d'un autre jour reste nouveau.
3. **Un acte rapporté pour l'autre école pouvait être attribué à cette affaire** : `detecterActesProcéduraux({ etablissements })` écarte une citation qui nomme un autre établissement de la commune sans nommer celui de l'affaire (doute = gardée). Câblé dans le notifier.
4. **Deux faits institutionnels du rejeu dont la citation ne soutenait pas le libellé** : un constat de 2015 rappelé (« Dès 2015, l'Inspection générale avait pointé… ») lu comme inspection annoncée ; une enquête administrative « actuellement menée » lue comme annoncée.

## 6. Découverte : l'article est-il retrouvé automatiquement ? (preuves séparées)

Lecture seule, Google Actualités RSS, le 23/11/2026, mêmes requêtes que la veille (`requetesVeille`) puis variantes.

| Requête | POC-05 (Baudin) | POC-09 (Titon) |
|---|---|---|
| « en avant » (non bornée, état courant) | **trouvé** (rang 6/19) | **trouvé** (rang 4/10) |
| ouverte, fenêtre de 45 jours | 0 résultat | 0 résultat |
| ouverte **sans borne** | **trouvé** (rang 4/31) | **trouvé** (rang 9/12) |
| repli « mots distinctifs » (sans guillemets) | non (11 résultats, autres sujets) | **trouvé** (rang 6/10) |

- Variantes « Alphonse-Baudin », « Alphonse Baudin », « Baudin » (+ « Paris », « relaxe », contexte « 11e animateur périscolaire ») : **9 sur 9 trouvent l'article** (rangs 3 à 15). Les requêtes nommant **plusieurs établissements** (« Titon » « Baudin ») le placent **en rang 1** (2 sur 2). Avec une fenêtre de dates de l'époque (9–13 juillet) : 17 sur 17 (la combinaison `when:45d` + `after:` est contradictoire et ne ramène rien, sans objet).
- **L'absence n'est attribuable ni à la fenêtre de 45 jours ni aux guillemets** : reproduite, la fenêtre ne ramène rien (l'article a 136 jours) mais la requête « en avant », qui n'est jamais bornée, le trouve avec le nom entre guillemets.
- **Le repli ne s'active jamais pour ces deux affaires** (vérifié dans `chercherAffaire`) : la requête « en avant » ramène 19 et 10 résultats distincts (`SEUIL_MAIGRE = 3`). C'est la conception — un repli réservé aux recherches maigres sans nouveauté — et non un défaut ; il ne rendrait service ni à Baudin ni à Titon.
- **Distinction des preuves** : (1) *traitement de l'URL déjà connue* → §5 (code final rejoué sur la page entière) ; (2) *capacité de la recherche* → ce tableau. Une injection manuelle réussie n'est jamais présentée comme une découverte automatique : ici les deux sont établies séparément.

## 7. Acteurs et registre de veille (état réel de collecte)

Registre unique : `data/associations-watchlist.json`. Trois niveaux distincts, jamais confondus : **acteur identifié** (nom, rôle public, preuve), **canal vérifié** (ouvert et reconnu), **collecte testée** (une collecte réelle a abouti).

| Acteur / canal | Identifié | Canal vérifié | Collecte testée |
|---|---|---|---|
| #MeToo École (organisation) | oui (déjà au registre) | site : adresse déclarée ; **lecture bloquée par un contrôle anti-robot** (05/11 et 23/11), **non contourné** | recherche de presse : 24 résultats (nom sans accent), 4 (avec accent + « périscolaire ») ; **site : non** |
| Barka Zerouali | oui (3 sources) | aucun compte recherché | recherche de presse sur le nom : 11 résultats |
| Comptes X, Instagram, Facebook déclarés par le collectif | — | **déclarés** (indiqués par Adrien le 23/11), adresses dérivées des comptes, **non ouvertes** | **non testée** — collecte sociale : chantier dédié, aucun connecteur ici |
| Pétition et mises à jour Change.org | — | adresse retrouvée par recherche, non ouverte, aucune signature | **non testée** |
| Me Kopp, Me Rebecca Royer | oui (rattachement : franceinfo + Le Média) | site professionnel (`kr-avocates.com`) ouvert : identité des deux avocates **confirmée**, **aucune** actualité ni réseau social | recherche de presse : 9 et 10 résultats |

Ajouts au code existant : `data/associations-watchlist.json` (champs `porte_parole`, `canaux`, `collecte_reelle`, entrée `kopp-royer`, alias `MeTooÉcole`), mots-clés d'acteurs notables et deux requêtes contextuelles dans `scripts/watch-updates.mjs`. Aucun connecteur, aucune inscription, aucun abonnement, aucun compte créé. Une requête de ce test a répondu « sans flux » (consentement/limitation Google), non comptée.

## 8. Du circuit à la fiche (23/11, soir)

Le parcours complet — source connue non qualifiée → propositions → message → `VALIDATE` → matière validée → fiche approuvée → rendu local des deux fiches (Baudin, Titon) → second passage identique — est décrit au §13 de `LOT_CORRECTIF_MAINTENANCE_23_11.md`. La cause de l'absence de destination « fiche » dans le premier journal était un montage de test sans fiche approuvée, non un défaut de code.
