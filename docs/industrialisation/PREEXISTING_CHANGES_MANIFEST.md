# Manifeste des changements antérieurs

_15 septembre 2026 — séparation du travail d'Adrien et du chantier pré-exécuteur._

Commit de départ : **`e9a28e2`** (= `main`).
Branche historique : `feat/hub-pre-executeur` (9 commits, **intacte, non réécrite**).
Branche propre : `feat/hub-pre-executeur-clean` (6 commits, depuis `e9a28e2`).

> La branche propre ne contient **que** du travail attribuable au chantier. Elle n'est pas
> une réécriture de l'historique : la branche d'origine existe toujours, telle quelle.

---

## 1. Fichiers suivis modifiés avant la session

Constatés au préflight du 14/09/2026 (`git status` de la session 1).

| Fichier | État avant session | Décision | Dans la branche propre ? |
|---|---|---|---|
| `CLAUDE.md` | modifié par Adrien | **conservé intact** dans son worktree, jamais commité par moi | ❌ non |
| `docs/prompt_crawler.md` | modifié par Adrien | conservé intact | ❌ non |
| `scripts/watch-updates.mjs` | modifié par Adrien (+21 requêtes de contexte, flag `--no-context`) | conservé intact | ❌ non |
| `web/src/layouts/Layout.astro` | modifié par Adrien | conservé intact | ❌ non |
| `.gitignore` | modifié par Adrien **et** par moi | **hunks séparés** — voir §3 | ⚠️ partiellement (mes lignes seules) |
| `tools/review.html` | modifié par Adrien **et** par moi | **hunks séparés** — voir §4 | ⚠️ partiellement (mes hunks seuls) |

Les 4 premiers fichiers n'ont jamais été touchés : `git status` du worktree d'origine les
montre toujours modifiés et non commités.

## 2. Fichiers non suivis avant la session

26 fichiers, **tous laissés non suivis**, aucun repris dans la branche propre :

`data/associations-watchlist.json` · `data/hubs/paris-11e.json` ·
`data/import-batch-juin2026{,b,c,d,e}.csv` · `f.list` · `full.list` · `nopolicy.list` ·
`scripts/hub-freshness.mjs` · `scripts/watch-associations.mjs` ·
`tools/design-B2-editorial.html` · `tools/design-hub-affaires.html` ·
`tools/design-hub-v2.html` · `tools/design-hub-v3.html` · `tools/hub-guide-editorial.html` ·
`tools/presentation.html` · `tools/scripts-guide.html` · `tools/tests/*.html` (5) ·
`tools/tuto-review.html` · `web/src/pages/a-propos.astro`

Tous sont sauvegardés par empreinte dans `MANIFEST.md` de l'archive locale.

---

## 3. `.gitignore` — séparation

**Provenance : RÉSOLUE.** Le découpage est sémantique et sans ambiguïté.

| Lignes | Auteur | Preuve d'attribution | Branche propre |
|---|---|---|---|
| `data/hub-freshness-report.json`, `data/associations-report.json` | **Adrien** | ignorent les rapports produits par `scripts/hub-freshness.mjs` et `scripts/watch-associations.mjs`, deux fichiers non suivis lui appartenant | ❌ **exclues** |
| `data/maintenance-state.json`, `.scan-cycles/`, `pgdata/` | **chantier** | référencent `scripts/scan-maintenance.mjs`, `scripts/qa/run-cycles.mjs` et le cluster Postgres éphémère, tous créés par le chantier | ✅ incluses |

Les lignes d'Adrien sont consignées dans `adrien-gitignore.patch` (archive locale) pour qu'il
les réapplique lui-même.

## 4. `tools/review.html` — séparation

**Provenance : RÉSOLUE** pour les 7 hunks. Le fichier de la branche propre a été
**reconstruit depuis `e9a28e2`** en n'appliquant que les modifications du chantier — il n'a
pas été obtenu en retirant des hunks d'un fichier mélangé.

| Hunk | Contenu | Auteur | Branche propre |
|---|---|---|---|
| `@@ -140` | avertissement `service_role` + `autocomplete="off"` | chantier | ✅ |
| `@@ -156` | `REVIEW_CASE_SELECT` / `REVIEW_SOURCE_SELECT`, purge de clé héritée | chantier | ✅ |
| `@@ -192` | `select=*` → listes explicites, `localStorage` sans clé | chantier | ✅ |
| `@@ -255` | tri des candidates par score décroissant | **Adrien** | ❌ |
| `@@ -271` | constante `FLAGGED` (`FR-2026-0057/0058/0060`) | **Adrien** | ❌ |
| `@@ -281` | affichage du drapeau + bouton « éditer » | **Adrien** | ❌ |
| `@@ -485` | `editEtablissement` / `saveEtablissement` + géocodage BAN | **Adrien** | ❌ |

**Vérification de la séparation** : `diff(version propre, version mélangée)` produit
exactement **4 hunks**, tous d'Adrien, et **une seule ligne supprimée** (le `div.case-title`
qu'il remplace). Aucun hunk du chantier n'y apparaît.

⚠️ **Action requise d'Adrien.** Son travail sur `review.html` n'est plus dans un fichier
modifié de son worktree : il a été commité par erreur dans `613952d` sur la branche
historique. Il est récupérable de deux façons :

```bash
git apply adrien-review-html.patch
```

```bash
git show feat/hub-pre-executeur:tools/review.html > tools/review.html
```

La première réapplique ses 4 hunks sur la version propre. La seconde restaure le fichier
mélangé tel qu'il était.

---

## 5. Exclusion volontaire supplémentaire

| Fichier | Motif |
|---|---|
| `web/src/pages/mentions-legales.astro` | Le correctif `contact@sousnosyeux.fr` → `.org` **ne fait pas partie de cette branche** : il modifie une mention légale et suppose que la boîte `.org` reçoit réellement du courrier, ce qui n'est pas démontré. Isolé dans `CONTACT_HOTFIX_CANDIDATE.md`, non commité. |

## 6. Vérification de non-régression

| Contrôle | Attendu | Résultat |
|---|---|---|
| `feat/hub-pre-executeur` HEAD | `4049aa5…` inchangé | ✅ |
| Worktree d'origine : fichiers suivis modifiés | 4 (ceux d'Adrien) | ✅ |
| Worktree d'origine : fichiers non suivis | 26 | ✅ |
| `refs/backup/hub-pre-executeur-20260915` | `4049aa5…` | ✅ |
| Branche propre : fichiers non attribuables | 0 | ✅ |
| `PROVENANCE_UNRESOLVED` | 0 | ✅ |
