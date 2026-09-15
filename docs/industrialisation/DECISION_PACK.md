# DECISION_PACK — décisions humaines

_15 septembre 2026 · branche `feat/hub-pre-executeur-clean`._

**Aucune donnée réelle n'a été modifiée.** Ce document qualifie ; il ne tranche pas.
Chaque décision est arbitrable en lisant la section correspondante, sans relire le code.

| # | Objet | Recommandation | Confiance |
|---|---|---|---|
| **D1** | 2 fiches étiquetées `relaxe / non-lieu / classement` | **NE PAS retirer** — corriger le statut, qui paraît faux | moyenne |
| **D2** | 3 doublons supposés | **2 `MERGE`** (`0003/010`, `0007/007`) · **1 `HUMAN_REVIEW`** (`0008/008`) · +1 paire Faidherbe en `HUMAN_REVIEW` | moyenne |
| **D3** | Clé `service_role` | **Rotation** — comportement dangereux avéré, publication non démontrée | élevée |
| **D4** | Migration 004 | **Appliquer**, mais l'encodage UTF-8 doit être garanti par le **processus**, pas par un poste | moyenne |
| **D5** | Objet d'une revue | **Revue portant sur une `content_version` immuable** | moyenne |
| **D6** | `FR-2026-0026` — patronyme exposé dans une URL publique | **Retirer la source réhébergée** (option C), puis retrouver l'article d'origine | élevée |

---

## D1 — `FR-2026-0024` et `FR-2026-0035`

> ⚠️ **Ceci corrige la recommandation de la session précédente.** J'avais recommandé un
> retrait sous 72 h. La vérification des sources montre que **le statut lui-même est
> douteux** : retirer ces fiches pour « relaxe » entérinerait une qualification que rien
> n'établit.

### D1-a · `FR-2026-0024` — École Belzunce, Paris 10e

| | |
|---|---|
| Statut affiché | `relaxe / non-lieu / classement` · `statut_des_faits: non établi` · `1 enfant` |
| Source primaire | Le Parisien, 22/05/2026 — titre : *la Ville de Paris a maintenu un animateur en poste alors qu'elle savait qu'il avait été accusé de violences sexuelles* |
| Source secondaire | Le Figaro, 18/05/2026 — titre : *un animateur périscolaire **mis en examen** pour agression sexuelle avait déjà été visé par une plainte en 2024* |

**Ce que disent les sources** : le titre du Figaro décrit une **mise en examen**, pas une
issue favorable. Une recherche ciblée (2 requêtes) indique qu'une plainte déposée par les
parents d'une enfant scolarisée à Belzunce **aurait été classée sans suite**, et que **la
même personne** a ensuite été mise en examen pour des faits à l'**école maternelle Bullourde
(11e)** — laquelle correspond à la fiche `POC-06` du corpus.

| Dimension | Constat |
|---|---|
| Personne | **la même** dans les deux fiches (Belzunce et Bullourde) |
| Procédure | **deux distinctes** : plainte 2024 classée (Belzunce) · information judiciaire en cours (Bullourde) |
| Établissement | **deux distincts** |
| Caractère définitif du classement | **`UNKNOWN`** — un classement sans suite est révocable et rien ne le présente comme définitif |
| Contradiction | oui : l'étiquette « relaxe » coexiste avec une mise en examen de la même personne |

**Action recommandée : correction, pas retrait.** L'angle des deux articles est la
défaillance de l'institution qui a maintenu l'agent en poste — ce n'est pas une
disculpation. Le retrait effacerait une information d'intérêt public en la présentant à tort
comme favorable.

Correctif proposé (non appliqué) :
- `statut_judiciaire` → `plainte` **ou** création d'une valeur distincte pour « plainte
  classée sans suite, non définitif » ;
- lier explicitement `FR-2026-0024` et `POC-06` (même personne, procédures distinctes) —
  c'est exactement ce que `case_events` + `claims` permettront ;
- vérifier qu'aucun élément des deux fiches, recoupé, ne désigne une personne unique.

**Verdict : `HUMAN_REVIEW` — ne pas retirer, requalifier.**

### D1-b · `FR-2026-0035` — Crèche La Joyeuse Tribu, Lyon 6e

| | |
|---|---|
| Statut affiché | `relaxe / non-lieu / classement` · `non établi` · `1 enfant` |
| Source primaire | Le Progrès, 20/06/2025 — *un salarié **suspecté** de comportement inapproprié dans deux crèches* |
| Source secondaire | France 3 Régions, 18/06/2025 — ***soupçons** de violences sexuelles dans deux crèches lyonnaises* |

**Ce que disent les sources** : rien. **Aucune des deux ne mentionne relaxe, non-lieu ou
classement.** Les deux décrivent des soupçons et une suspension, en juin 2025. Une recherche
ciblée n'a trouvé aucune issue judiciaire publiée.

| Dimension | Constat |
|---|---|
| Source soutenant l'issue favorable | **aucune** |
| Caractère définitif | **`UNKNOWN`** |
| Contradiction | oui : le statut n'est soutenu par aucune source liée |
| Élément supplémentaire | la recherche indique que le même salarié aurait été **réaffecté** à la crèche du Chat Perché (Lyon 3e), qui correspond à `FR-2026-0036`. Deux fiches, deux établissements, vraisemblablement **une personne et une procédure**. |

**Action recommandée : attente de preuve.** Le statut `relaxe` semble une erreur de saisie.
Retirer la fiche sur cette base retirerait une information exacte au motif d'une
qualification fausse.

Correctif proposé (non appliqué) : `statut_judiciaire` → `enquête`, et examiner le lien
`FR-2026-0035` ↔ `FR-2026-0036`.

**Verdict : `HUMAN_REVIEW` — statut non soutenu, ne pas retirer.**

> **Conséquence sur le compteur** : les 53 affaires publiées ne tombent pas à 51.
> L'hypothèse « retrait de 2 fiches » de la session précédente est abandonnée.

---

## D2 — Trois doublons supposés

> ⚠️ **Cette section corrige une erreur de raisonnement de la version précédente.**
> J'y concluais `MERGE` avec confiance **élevée** pour les trois paires, au motif qu'elles
> partagent la même URL de source primaire. **Ce motif ne vaut rien**, et le corpus lui-même
> le démontre.

### D2-0 · Pourquoi une URL commune ne prouve rien

Six URL du corpus sont partagées par plusieurs affaires. La plus partagée l'est par **cinq
affaires distinctes** :

| URL | Affaires qui la citent |
|---|---|
| Le Parisien 20/03/2026 — *trois hommes dont deux animateurs périscolaires interpellés…* | `FR-2026-0001` (Aqueduc, animateur) · `FR-2026-0002` (Aqueduc, enseignant) · `FR-2026-0003` (Grands Champs, tiers) · `FR-2026-0004` (Vigée Lebrun, animateur) · `PARIS-010` (Grands-Champs, tiers) |
| CNEWS 20/03/2026 | 3 affaires, 3 établissements |
| ELLE 2026 — *quelles sont les écoles parisiennes les plus touchées* | 2 affaires, 2 établissements |
| Le Progrès 20/06/2025 | `FR-2026-0035` (Lyon 6e) · `FR-2026-0036` (Lyon 3e) |

Ces articles sont des **synthèses multi-établissements**. Deux fiches qui les citent sont
donc **attendues**, y compris quand elles décrivent des affaires parfaitement distinctes.

Deuxième artefact à écarter : **les coordonnées identiques ne sont pas une corroboration**.
Elles résultent du géocodage du même couple `établissement + commune` : deux graphies proches
produisent mécaniquement le même point. C'est une conséquence du rapprochement supposé, pas
une preuve indépendante.

Il ne reste donc qu'un seul type de preuve recevable : **ce que l'article dit du nombre de
personnes mises en cause et du nombre d'établissements concernés.**

### D2-1 · `FR-2026-0003` / `PARIS-010` — Grands Champs, Paris 20e

| | `FR-2026-0003` | `PARIS-010` |
|---|---|---|
| Établissement | École Grands Champs | École maternelle Grands-Champs |
| Rôle · type · statut · faits · enfants | `tiers` · agression sexuelle · enquête · allégué · plusieurs | **identiques** |
| Coordonnées | 48.851216 / 2.403689 | **identiques** (artefact de géocodage) |
| Sources | Le Parisien + CNEWS | Le Parisien seule |

**Preuve recevable** : l'article titre *trois hommes **dont deux animateurs périscolaires***.
Il décrit donc **au plus un** mis en cause non-animateur. Or les deux fiches portent le rôle
`tiers` et ne s'appuient que sur cet article. Le corpus ne peut pas en tirer deux `tiers`.

**Réserve** : le même article alimente déjà cinq fiches, dont un `enseignant` (`FR-2026-0002`).
Le décompte du corpus ne se réconcilie pas proprement avec « trois hommes ». L'article n'a pas
pu être lu intégralement (accès refusé).

**Verdict : `MERGE` · confiance moyenne.** À confirmer par la lecture de l'article.

### D2-2 · `FR-2026-0007` / `PARIS-007` — Reuilly, Paris 12e

| | `FR-2026-0007` | `PARIS-007` |
|---|---|---|
| Établissement | École maternelle Reuilly **II** | École maternelle Reuilly |
| `type_structure` | maternelle | **périscolaire** |
| Rôle · type · statut · faits · enfants | animateur périscolaire · agression sexuelle · enquête · allégué · 1 enfant | **identiques** |
| Coordonnées | 48.845678 / 2.388686 | 48.844756 / 2.389791 — **~110 m d'écart** |
| Sources | 20 Minutes + Linfo.re | 20 Minutes seule |

**Preuve recevable** : l'article (titre et reprises concordantes) décrit **un seul** animateur
suspendu dans **une seule** maternelle, en août-septembre 2025. Deux fiches ne peuvent en
sortir.

**Réserve sérieuse** : « Reuilly II » n'est pas nécessairement une variante de graphie.
Paris numérote de véritables écoles distinctes au sein d'un même groupe scolaire. L'écart de
110 m entre les deux géocodages est compatible avec **deux adresses réelles**. Si les deux
établissements existent, l'une des deux fiches n'est pas un doublon mais une **mauvaise
attribution** — à corriger, pas à fusionner.

**Verdict : `MERGE` · confiance moyenne**, conditionné à la vérification que « Reuilly » et
« Reuilly II » désignent bien le même établissement. Sinon : correction d'attribution.

### D2-3 · `FR-2026-0008` / `PARIS-008` — Boulard, Paris 14e

| | `FR-2026-0008` | `PARIS-008` |
|---|---|---|
| Établissement | École Boulard | École maternelle Boulard |
| `type_structure` | maternelle | **périscolaire** |
| `type_affaire` | **violences sexuelles** | **mixte** |
| Rôle · statut · faits · enfants | animateur périscolaire · enquête · allégué · plusieurs | **identiques** |
| Coordonnées | 48.83373… / 2.32893… | 48.833196 / 2.328467 — ~60 m |
| Sources | Radio France *(libellé « Wikipédia », faux)* + Le Parisien | Le Parisien seule |

**Preuve recevable — elle va dans l'autre sens.** L'article titre *****trois** animateurs
écartés d'**une** maternelle***. Le même établissement héberge donc, selon la source
elle-même, **trois** mis en cause au même rôle. Deux fiches « animateur périscolaire à
Boulard » citant cet article sont exactement ce qu'on attend de **deux affaires distinctes**.

Rien ne distingue ces deux fiches comme portant sur la **même** personne. Les divergences de
`type_affaire` (`violences sexuelles` / `mixte`) sont même cohérentes avec deux mis en cause
différents.

**Verdict : `HUMAN_REVIEW` · confiance faible.** Ne pas fusionner. `KEEP_SEPARATE` est au
moins aussi plausible que `MERGE`.

### D2-4 · Récapitulatif et effet sur le compteur

| Paire | Verdict | Confiance | Preuve décisive |
|---|---|---|---|
| `FR-2026-0003` / `PARIS-010` | **`MERGE`** | moyenne | l'article décrit au plus **un** non-animateur |
| `FR-2026-0007` / `PARIS-007` | **`MERGE`** | moyenne | l'article décrit **un seul** animateur dans **une seule** maternelle |
| `FR-2026-0008` / `PARIS-008` | **`HUMAN_REVIEW`** | faible | l'article décrit **trois** animateurs dans **la même** maternelle |
| `FR-2026-0023` / `PARIS-009` (Faidherbe, 11e) | **`HUMAN_REVIEW`** | faible | sources et dates différentes ; la presse décrit deux mis en cause distincts |

**Conséquence sur le compteur** : au mieux **53 → 51**, et seulement si les deux `MERGE` sont
confirmés par lecture des articles. L'hypothèse « 53 → 50 » de la version précédente est
**retirée**.

**Conséquence sur la règle `R9_doublon_probable`** : elle classe `bloquant` dès qu'une URL est
commune. Sur ce corpus, ce critère produit au moins un faux positif (`Boulard`). La règle
devrait retomber en `alerte` tant qu'aucune preuve tirée du **contenu** de la source n'est
disponible. Non modifié dans cette passe.

### D2-bis · Divergences de saisie à trancher lors d'une fusion éventuelle

- `FR-2026-0007` : `type_structure` `maternelle` vs `périscolaire` sur `PARIS-007` ;
- `FR-2026-0008` : `type_affaire` `violences sexuelles` vs `mixte` sur `PARIS-008` ;
- `FR-2026-0008` : libellé de média faux (voir §D2-ter).

### D2-ter · Défauts de sourçage révélés en qualifiant D2

| Fiche | Constat | Gravité |
|---|---|---|
| `FR-2026-0026` | Patronyme exposé dans une URL publique — **traité à part, voir D6** | 🔴 |
| `FR-2026-0008` | Média saisi « Wikipédia », URL réelle = **radiofrance.fr** (France Culture). Ce n'est pas une source Wikipédia : c'est un **libellé faux**. La règle `R4_source_primaire_non_admissible` se déclenche donc sur une **fausse cause** : corriger le libellé fera disparaître le constat sans rien améliorer au sourçage. | 🟠 corrige un constat erroné de la session précédente |
| `PARIS-001` | Reprise MSN ; l'éditeur d'origine **n'a pas pu être identifié** (3 requêtes). | 🟠 `UNKNOWN` |

---

## D6 — `FR-2026-0026` : patronyme exposé dans une URL publique

> Ajoutée à la demande d'Adrien. Elle porte le nombre de décisions à six : elle ne pouvait
> pas rester une ligne de tableau, l'exposition est d'une autre nature que les autres
> constats.

### Le constat

| Champ | Valeur |
|---|---|
| `etablissement` | « Collège non nommé, Essonne » |
| `commune` | « commune non précisée » |
| `lat` / `lng` | `null` / `null` |
| Source primaire | `cabinetlombard.net/wp-content/uploads/2021/01/2021-01-06-Article-Le-Parisien-affaire-<PATRONYME>-1.pdf` |
| Média saisi | « Le Parisien » (le domaine est celui d'un cabinet d'avocats) |
| Date | 2021-01-06 |
| Source secondaire | Libération, 21/04/2016 — *pédophilie collège de Villemoisson : failles et soupçons* |

Le nom de fichier du PDF contient **le patronyme d'une personne**, dans un segment de la
forme `affaire-<nom>`. Cette URL est stockée dans `data/cases.json`, **fichier suivi par Git
dans un dépôt public**, et rendue telle quelle dans le lien de source du site.

### Pourquoi c'est d'une autre nature que les autres constats

Le principe éditorial non négociable du projet est : **jamais le nom de la personne mise en
cause**. Ici il n'est pas dans un champ, il est dans une **URL** — un endroit que ni la revue
éditoriale, ni les règles de contenu (`R1`) ne regardent, puisqu'elles inspectent les textes
publiables, pas les liens.

Aggravations :

1. la fiche ne nomme ni l'établissement ni la commune, mais l'URL et la source secondaire
   désignent **Villemoisson** : le recoupement rétablit ce que l'anonymisation retirait ;
2. la source primaire n'est pas l'éditeur : c'est un **PDF réhébergé** sur le site d'un
   cabinet d'avocats, sans garantie d'intégrité ni de pérennité ;
3. les faits remontent à **2016-2021**, hors du périmètre temporel du reste du corpus.

### Options

| # | Option | Effet | Coût | Risque résiduel |
|---|---|---|---|---|
| **A** | Remplacer la source primaire par l'article **Le Parisien d'origine** | supprime l'URL exposante, rétablit le bon éditeur | il faut retrouver l'article de 2021 | aucun si trouvé ; sinon blocage |
| **B** | Rétrograder le PDF en secondaire et promouvoir **Libération 2016** en primaire | source déjà présente, éditeur identifié, accessible | immédiat | l'URL exposante **reste publiée** tant qu'elle est citée |
| **C** | Supprimer purement la source `cabinetlombard.net` | supprime l'exposition immédiatement | la fiche perd sa source la plus récente | Libération 2016 reste seule : fiche affaiblie mais conforme |
| **D** | Dépublier la fiche (`publication_status = 'retirée'`) | supprime tout | perte d'une information d'intérêt public | aucun |

**Recommandation : C maintenant, A ensuite.** Retirer d'abord l'URL exposante — c'est la
seule action qui arrête l'exposition sans dépendre d'une recherche. Puis chercher l'article
Le Parisien d'origine et le réintroduire comme source primaire.

L'option B est insuffisante : rétrograder ne dépublie pas. Une source secondaire est **rendue
sur le site** exactement comme une primaire.

### Patch proposé — **non appliqué**

Aucune donnée n'a été modifiée. La suppression d'une source est une mutation de production,
réservée à Adrien.

```
-- À exécuter uniquement après décision. Option C.
-- 1) Constater avant
select source_id, media, url, is_primary
  from sources where case_id = 'FR-2026-0026';

-- 2) Supprimer la source réhébergée
delete from sources
 where case_id = 'FR-2026-0026'
   and url like 'https://cabinetlombard.net/%';

-- 3) Promouvoir Libération en source primaire
update sources set is_primary = true
 where case_id = 'FR-2026-0026'
   and url like 'https://www.liberation.fr/%';

-- 4) Contrôler : exactement une primaire, datée
select count(*) from sources
 where case_id = 'FR-2026-0026' and is_primary and publication_date is not null;
```

Puis `node --env-file=.env.local scripts/sync-data.mjs` et vérifier :
`grep -c cabinetlombard data/cases.json` → **0**.

### Ce que ce constat révèle au-delà d'une fiche

Aucun contrôle n'inspecte aujourd'hui les **URL** à la recherche d'information personnelle :
`R1` ne lit que les textes publiables. Un contrôle `URL ne contient pas de segment
`affaire-<nom>`, `proces-<nom>`, `<prenom>-<nom>`` manque. Il n'a pas été écrit dans cette
passe — la consigne était de ne rien développer. **À ouvrir comme tâche distincte.**

⚠️ Un retrait de la fiche ou de sa source ne supprime **pas** l'URL de l'historique Git :
elle restera dans les commits passés de `data/cases.json`. Le nettoyage d'historique est une
opération destructive, à décider séparément.

---

## D3 — Clé `service_role`

Les trois notions séparées, comme demandé :

| # | Question | Réponse | Preuve |
|---|---|---|---|
| 1 | **Le code stockait-il une clé dangereusement ?** | **OUI, avéré** | `tools/review.html` écrivait `localStorage.setItem('sny_review', {url, key})` — clé d'administration, en clair, persistante, dans un outil versionné en dépôt **public** |
| 2 | **Une valeur secrète est-elle présente dans le dépôt ou l'historique ?** | **NON** | scan de 7 motifs sur le worktree, l'index et **tous les blobs** de `e9a28e2..HEAD` : **0 correspondance**. `.env.local` : **0 commit** dans tout l'historique |
| 3 | **Une clé réellement utilisée a-t-elle été exposée ?** | **PLAUSIBLE, non démontré** | la clé a été saisie dans des navigateurs et écrite dans leur `localStorage`. Toute extension, tout profil partagé, toute sauvegarde de profil a pu la lire. `CLAUDE.md` §3 documente en outre un partage « de vive voix » |

**Le point 1 suffit à justifier une rotation ; il ne prouve pas le point 3.** Ne pas présenter
la clé comme « publiée ».

### Consommateurs de la clé

| Consommateur | Usage | Après correctif |
|---|---|---|
| `tools/review.html` | lecture + écriture, **dans le navigateur** | chemin de persistance fermé ; la clé transite encore le temps d'une session (l'outil écrit en base, il ne peut pas s'en passer sans authentification Supabase) |
| `scripts/sync-data.mjs` | lecture, Node, `.env.local` | inchangé, légitime |
| `scripts/import-cases.mjs` | écriture, Node | inchangé, légitime |
| `scripts/bulk-publish.mjs` | écriture, Node | inchangé, légitime |
| `scripts/repair-sources.mjs` | écriture, Node | inchangé, légitime |

### État du correctif

Clé **plus jamais persistée** ; purge automatique d'une clé héritée au chargement, avec
message invitant à la rotation ; `select=*` remplacé par des listes de colonnes ;
avertissement visible sur le formulaire.

### Runbook de rotation — **non exécuté**

1. Supabase → Settings → API → régénérer la clé `service_role`.
2. Mettre à jour `.env.local` sur chaque machine (jamais dans Git).
3. Rejouer `node --env-file=.env.local scripts/sync-data.mjs --dry-run` : doit lister 53 affaires.
4. Rejouer un import à blanc et une publication à blanc.
5. Rouvrir `tools/review.html` : la purge doit s'exécuter une fois, puis plus jamais.
6. Nettoyer le stockage local sur chaque navigateur utilisé :
   ouvrir l'outil → `Application` → `Local Storage` → supprimer la clé `sny_review`
   (la purge automatique le fait déjà, mais le vérifier).
7. Consigner la date de rotation.

**Cette rotation n'a pas été effectuée : elle modifie un secret.**

---

## D4 — Migration `004`

**Revue avant application. La migration n'a pas été appliquée à Supabase.**

| Dimension | Analyse |
|---|---|
| **DDL** | 6 types, 4 colonnes sur `cases`, 2 sur `sources`, 2 sur `reviews`, 6 tables, 2 vues, 1 fonction, 1 trigger. Aucun `DROP`, aucun `ALTER` de colonne existante. |
| **Verrous** | `ADD COLUMN` nullable sans défaut = `ACCESS EXCLUSIVE` **bref** (métadonnées seulement, pas de réécriture de table) sur PG 11+. `CREATE INDEX` sans `CONCURRENTLY` verrouille en écriture — négligeable sur 112 lignes. `create or replace view cases_public_v2` ne touche pas `cases_public`. |
| **Données existantes affectées** | **Aucune.** Aucun `UPDATE`, aucun `DELETE`. Les nouvelles colonnes naissent à `NULL`. |
| **Backfill** | **Aucun n'est inclus, volontairement.** `resume_public` reste vide : le remplir depuis `commentaire_validation` est une mutation de données réelles qui suppose de relire chaque résumé. À décider séparément. |
| **Compatibilité des scripts** | `sync-data.mjs` demande une liste blanche dont `verified_at` et `geocode_source` sont explicitement **exclus tant que la colonne n'existe pas** (`PENDING_CASE_FIELDS`). Après application, les retirer de cette liste pour les exposer. Les autres scripts ne lisent aucune colonne supprimée : **aucun ne casse**. |
| **Transaction** | Le fichier n'ouvre pas de transaction explicite. `psql -1 -f` l'exécute en une seule transaction — **recommandé**. Les `do $$ … exception when duplicate_object` restent corrects en transaction. |
| **Rollback** | `004_rollback.sql`, **exercé** : 6 tables → 0, `cases_public` v1 intacte, lignes `cases` préservées, puis `004` ré-appliquée sans erreur. `resume_public` y est laissé commenté : il peut contenir de la saisie manuelle. |
| **Idempotence** | Rejouée deux fois de suite sans erreur. |

### 🔴 Condition d'application découverte pendant la revue

Au premier essai, `004` a échoué :

```
ERROR:  invalid input value for enum publication_status: "publiée"
```

La cause n'est pas dans `004` : c'est `schema.sql`, lu avec un encodage client non-UTF-8, qui
avait créé des **libellés d'énumération corrompus**. L'erreur ne se manifeste que plus tard.

> **Appliquer impérativement avec `PGCLIENTENCODING=UTF8`**, ou depuis l'éditeur SQL du
> dashboard Supabase (UTF-8 natif). Avec un encodage latin, les libellés accentués
> (`publiée`, `enquête`, `à qualifier`) seraient corrompus **silencieusement**.

#### Pourquoi ceci suffit à maintenir la porte 2 en `PROVISIONAL`

Ma preuve d'exécution vaut pour **un poste Windows sur lequel j'ai exporté la variable à la
main**. C'est une propriété de mon environnement, pas du processus de migration.

Tant que l'encodage dépend de la machine et de l'opérateur, la migration est **reproductible
par accident**, pas par construction. Or son mode d'échec est le pire possible : elle ne
plante pas au moment de la corruption, elle plante **plus tard**, et entre les deux les
libellés d'énumération sont faux en base.

La porte 2 est donc ramenée de `PASSED` à **`PROVISIONAL`**. Elle ne pourra repasser que
lorsque l'une de ces garanties existera :

| # | Garantie | Effet |
|---|---|---|
| **G1** | La migration s'exécute par un chemin qui **impose** l'encodage (éditeur SQL Supabase, ou script d'application qui pose `PGCLIENTENCODING=UTF8` et refuse de démarrer sinon) | supprime la dépendance au poste |
| **G2** | `004` commence par une **assertion** qui échoue tôt et bruyamment si un libellé accentué connu est absent de son énumération | déplace l'échec au bon endroit |
| **G3** | La procédure d'application vérifie les libellés **avant** et **après**, et le contrôle fait partie du livrable | rend l'erreur détectable par l'opérateur |

Requête d'assertion proposée, à placer en tête de la procédure — **non ajoutée à `004`**,
puisque cette passe ne développe rien :

```sql
-- Doit renvoyer t. Sinon : encodage client fautif, NE PAS CONTINUER.
select bool_and(l = any (enum_range(null::publication_status)::text[])) as encodage_ok
  from unnest(array['publiée','candidate','validée','retirée']) as l;
```

**Testée** sur la base éphémère : renvoie `t` lorsqu'elle est exécutée depuis un fichier
UTF-8 avec `PGCLIENTENCODING=UTF8`.

⚠️ La même requête passée en ligne de commande via `psql -c` a échoué :

```
ERROR:  invalid byte sequence for encoding "UTF8": 0xe9 0x65 0x27
```

Le shell avait transmis les accents en Latin-1. **C'est exactement le mode de défaillance que
l'assertion cherche à attraper**, reproduit ici par accident. Conclusion opérationnelle :
exécuter l'assertion **depuis un fichier** (`psql -f`), jamais via `-c`. Ce détail est la
meilleure illustration de pourquoi la porte 2 ne peut pas rester `PASSED` : la chaîne complète
— shell, fichier, client, serveur — doit être UTF-8, et une seule maille suffit à corrompre
silencieusement.

### Requêtes de contrôle avant / après

```sql
-- AVANT
select count(*) from cases;
select count(*) from cases where publication_status = 'publiée';
select enumlabel from pg_enum
  join pg_type t on t.oid = enumtypid where t.typname = 'publication_status';

-- APRÈS (doit être identique pour les deux premières)
select count(*) from cases;
select count(*) from cases where publication_status = 'publiée';
select count(*) from cases_public;      -- vue v1, inchangée
select count(*) from cases_public_v2;   -- v2 : exclut relaxe, à qualifier, fusionnées
select count(*) from case_events;       -- 0
```

`cases_public_v2` renverra **moins** de lignes que `cases_public` : c'est voulu (elle exclut
les issues favorables et les fiches fusionnées). Ne pas l'interpréter comme une perte.

---

## D5 — Objet d'une revue : affaire ou hub ?

**ADR — Revue portant sur une `content_version` immuable.**

### Contexte

`reviews.case_id` est `NOT NULL` depuis `schema.sql`. La table n'a **jamais été écrite** :
aucune contrainte d'historique réel ne pèse sur le choix. Un hub doit pouvoir être approuvé
au même titre qu'une affaire.

### Options

| Option | Description | Conséquence |
|---|---|---|
| **A** — `case_id` nullable + `hub_id` nullable | polymorphisme par colonnes optionnelles | invariant non exprimable simplement ; deux colonnes nulles = revue orpheline ; migration **non additive** |
| **B** — table `hub_reviews` séparée | duplication du schéma de revue | deux mécaniques d'approbation à maintenir, deux chemins à auditer |
| **C** — `reviews.content_version_id NOT NULL` ✅ | la revue porte sur **une version rendue et hachée**, quel qu'en soit l'objet | une seule mécanique ; l'approbation porte sur un `payload_hash` exact ; traçabilité conservée |

### Décision recommandée : **option C**

Une revue approuve **ce qui a été rendu**, pas une entité abstraite. C'est déjà la règle
posée par `DATA_CONTRACT_V0` §6 : « une approbation porte sur un `payload_hash`, jamais sur
le hub ». L'option C aligne le schéma sur cette règle.

Implications :

1. `content_versions` doit pouvoir décrire une **affaire seule**, pas seulement un hub —
   `hub_id` y devient nullable, ou un `content_versions.subject_kind` est introduit ;
2. `reviews.case_id` **reste `NOT NULL`** pour l'historique existant ; il devient nullable
   **seulement** en même temps qu'un invariant `check (case_id is not null or
   content_version_id is not null)` et une migration dédiée — donc **pas dans `004`** ;
3. tant que `004` n'est pas appliquée, une revue de hub n'est pas enregistrable. C'est
   accepté : le pilote manuel (§`MANUAL_PILOT_RUNBOOK.md`) consigne les revues **hors base**,
   sur papier ou en fichier, avec le `payload_hash`.

**Non implémentée.** Cette section est une décision, pas un changement de modèle.
