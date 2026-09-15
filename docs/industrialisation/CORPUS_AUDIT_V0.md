# CORPUS_AUDIT_V0 — audit du corpus et du pipeline

_14 septembre 2026 — branche `feat/hub-pre-executeur`, base `e9a28e2`._
_Aucune donnée de production n'a été modifiée pour produire cet audit._

Chaque constat est étiqueté :
**`OBSERVÉ`** = vérifié par une commande sur le dépôt · **`INFÉRÉ`** = déduit de plusieurs
observations · **`À VÉRIFIER`** = nécessite un accès ou une action hors de cette session.

---

## 1. Volume réel

| Mesure | Valeur | Étiquette |
|---|---|---|
| Affaires dans `data/cases.json` | **53** | `OBSERVÉ` |
| `_meta.generated_at` du fichier | **2026-06-06** (≈ 3 mois) | `OBSERVÉ` |
| Affaires en base Supabase | 112 selon `CLAUDE.md` | `À VÉRIFIER` — aucun accès base dans cette session |
| Affaires géocodées | 52 / 53 (`FR-2026-0026` sans coordonnées) | `OBSERVÉ` |
| Sources | 92, toutes `source_type = 'presse'` | `OBSERVÉ` |

**Écart avec la documentation** : `CLAUDE.md` annonce « 53 publiées » — cohérent avec le JSON.
En revanche le JSON date du 6 juin 2026 : **tout état publié affiché aujourd'hui repose sur un
instantané de plus de trois mois.** `INFÉRÉ`

---

## 2. Écarts éditoriaux sur des fiches actuellement publiées

### 2.1 🔴 Deux fiches en `relaxe / non-lieu / classement` sont toujours publiées `OBSERVÉ`

| `case_id` | Établissement | Commune | Sources |
|---|---|---|---|
| `FR-2026-0024` | École Belzunce | Paris 10e | Le Parisien 22/05/2026 ; Le Figaro 18/05/2026 |
| `FR-2026-0035` | Crèche Joyeuse Tribu | Lyon 6e | Le Progrès 20/06/2025 ; France 3 Régions 18/06/2025 |

Les deux portent `statut_des_faits = 'non établi'`. Or la page **Mentions légales du site en
production** (§8 « Retrait éditorial proactif ») engage le projet à retirer de la carte toute
fiche en « relaxe définitive, non-lieu définitif ou classement sans suite ».

**Le site ne respecte donc pas, sur ces deux fiches, l'engagement qu'il publie lui-même.**
C'est l'écart le plus grave de cet audit : il porte sur une issue **favorable** à la personne
mise en cause, catégorie que le contrat éditorial §3 traite en priorité absolue.

⛔ Non corrigé dans cette session : le retrait d'une affaire réelle est réservé à Adrien.
Voir décision **D1**.

### 2.2 🟠 Trois fiches publiées ont une source primaire **sans date** `OBSERVÉ`

`POC-02` (Ouest-France), `POC-09` (France 3), `POC-10` (ELLE).

`POC-09` est l'affaire **École Titon**, celle dont le délibéré était annoncé au 16 juin 2026 —
donc l'affaire la plus sensible au temps du corpus, et celle dont la source est la moins
datable. Invariant violé : `is_primary = true ⇒ publication_date not null`.

### 2.3 🟠 Deux sources primaires non admissibles `OBSERVÉ`

| `case_id` | Média primaire | Problème |
|---|---|---|
| `FR-2026-0008` | **Wikipédia** | encyclopédie collaborative, non admissible en source primaire |
| `PARIS-001` | **MSN / reprise presse** | agrégateur sans rédaction, éditeur d'origine non identifié |

Ces deux fiches ont pourtant un score `fiabilite_info_10 >= 8`. Le critère
`crit_source_fiable` a donc été coché sur une source qui ne l'est pas — le scoring actuel ne
distingue pas *source identifiable* de *source de presse admissible*.

---

## 3. 🔴 Fuite de champs internes dans l'export public `OBSERVÉ`

`scripts/sync-data.mjs` interroge **la table `cases`** avec `select=*` (lignes 42 et 53),
alors que la vue `cases_public` existe précisément pour exclure `commentaire_validation`
(`supabase/schema.sql` ligne 123 : « Pas de commentaire_validation (réservé à l'édition) »).

Conséquences mesurées :

| Champ | Présent dans `data/cases.json` | Consommé par le front | Statut |
|---|---|---|---|
| `commentaire_validation` | **53 / 53** | ❌ non | champ interne exporté |
| `fiabilite_info_10` | 53 / 53 | ❌ non | indicateur de revue interne exporté |

`data/cases.json` est **suivi par Git dans un dépôt public** : ces champs sont donc déjà
publics, même s'ils ne rejoignent pas le HTML compilé (`web/dist/` en est exempt, `OBSERVÉ`).

✅ **Corrigé dans cette session** — voir §7.

---

## 4. 🔴 Clé `service_role` manipulée et stockée dans le navigateur `OBSERVÉ`

`tools/review.html` :

- ligne 142 : champ de saisie explicitement libellé **« Service Role Key »** ;
- lignes 172–173 : la clé part en `apikey` et `Authorization: Bearer` depuis le navigateur ;
- ligne 205 : `localStorage.setItem('sny_review', JSON.stringify({ url, key }))` — la clé
  d'administration, qui **bypasse toutes les RLS**, est écrite **en clair et durablement**
  dans le stockage du navigateur ;
- ligne 194 : `cases?select=*` — l'outil récupère toutes les colonnes internes.

L'outil est versionné dans un dépôt **public**. `CLAUDE.md` §3 documente par ailleurs un
partage de ces identifiants « de vive voix » pour la collaboration.

Risque : toute extension, tout script tiers, tout profil de navigateur partagé ou toute
machine compromise donne un accès administrateur complet à la base — lecture, écriture,
suppression, sur toutes les tables.

✅ **Corrigé dans cette session** (chemin dangereux fermé) — voir §7.

---

## 5. Doublons probables `OBSERVÉ` + `INFÉRÉ`

Le dédoublonnage actuel exige une égalité **exacte** sur `etablissement + commune +
role_mis_en_cause`. Les variations de graphie passent au travers.

| Paire | Indices concordants | Verdict |
|---|---|---|
| `FR-2026-0003` / `PARIS-010` — Grands Champs (Paris 20e) | **coordonnées identiques**, même rôle, même type, même source (Le Parisien 20/03/2026) | 🔴 doublon quasi certain |
| `FR-2026-0007` / `PARIS-007` — Reuilly « II » / Reuilly (12e) | même source (20 Minutes 19/09/2025), même rôle, même type | 🔴 doublon quasi certain |
| `FR-2026-0008` / `PARIS-008` — Boulard (14e) | même source (Le Parisien 11/03/2026), même rôle | 🔴 doublon quasi certain |
| `FR-2026-0023` / `PARIS-009` — Faidherbe (11e) | **coordonnées identiques**, même rôle — mais sources et dates différentes (08/12/2025 vs 20/11/2025) | 🟠 ambigu : la presse décrit **deux** mis en cause distincts dans le même établissement |
| `FR-2026-0005` / `PARIS-001` — Saint-Dominique (7e) | coordonnées identiques, mais rôles différents (`animateur` vs `tiers`) et sources différentes | 🟠 ambigu |
| `FR-2026-0001` / `FR-2026-0002` — Aqueduc (10e) | rôles différents (`animateur` / `enseignant`) | ✅ distinction **intentionnelle**, documentée dans `CLAUDE.md` |

Le cas Faidherbe montre que la déduplication ne peut pas être entièrement automatique :
*même établissement + même rôle* peut désigner deux affaires réelles. D'où le champ
`merged_into` du contrat de données (§1) plutôt qu'une suppression.

`INFÉRÉ` : si les 3 doublons certains sont fusionnés, le corpus publié tombe à **50 affaires**,
et le compteur « 53 affaires publiées » affiché en page d'accueil devient faux.

---

## 6. Autres constats

| # | Constat | Étiquette |
|---|---|---|
| 6.1 | **Divergence `.fr` / `.org`** : `web/src/pages/mentions-legales.astro` utilise `contact@sousnosyeux.fr` (4 occurrences dans le build en production), alors que la boîte réellement relevée est `contact@sousnosyeux.org` (Layout, à-propos, Cloudflare Email Routing). **Le droit de réponse LCEN, le signalement de contenu illicite et le contact de l'éditeur pointent vers une adresse inexistante.** | 🔴 `OBSERVÉ` |
| 6.2 | La table `reviews` existe depuis `schema.sql` mais **aucun script ni outil ne l'écrit** (`grep` sur `.mjs`/`.html` : 0 insertion). Il n'existe donc **aucune trace** de qui a validé quoi, ni quand. | 🔴 `OBSERVÉ` |
| 6.3 | `scripts/bulk-publish.mjs` publie sur le **seul** critère `fiabilite_info_10 >= 8` : ni `verified_at`, ni présence d'une source primaire datée, ni statut ≠ relaxe. C'est le chemin par lequel §2.1 et §2.2 ont pu se produire. | `INFÉRÉ` |
| 6.4 | `FR-2026-0026` sans `lat`/`lng` : absente de la carte et des compteurs géographiques, mais comptée dans « 53 affaires publiées ». | `OBSERVÉ` |
| 6.5 | Graphies de média non normalisées : `20 Minutes` / `20 minutes` / `20minutes`. Empêche tout regroupement fiable par éditeur. | `OBSERVÉ` |
| 6.6 | `source_type` vaut `presse` sur **92 sources / 92** : le champ ne porte aujourd'hui aucune information. | `OBSERVÉ` |
| 6.7 | **Aucun test, aucune CI** : pas de `.github/`, aucun `test` dans `web/package.json`. `tools/tests/` contient des maquettes de design, pas des tests. | `OBSERVÉ` |
| 6.8 | Relation OVH / Cloudflare : `nslookup -type=NS sousnosyeux.org` → `kevin.ns.cloudflare.com`, `virginia.ns.cloudflare.com`. DNS bien délégué à Cloudflare, conforme à `CLAUDE.md`. Le registrar OVH n'est pas observable d'ici. | `OBSERVÉ` / `À VÉRIFIER` (registrar) |
| 6.9 | Aucune trace de secret dans l'historique Git ni dans les fichiers suivis (`.env.local` bien ignoré, vérifié par `git check-ignore`). | `OBSERVÉ` |

---

## 7. Corrections appliquées dans cette session

Toutes locales, réversibles, sur la branche `feat/hub-pre-executeur`. Aucune n'a été mergée
ni déployée.

| # | Correction | Fichier |
|---|---|---|
| C1 | Export public par **liste blanche** ; `select=*` remplacé par la liste explicite des colonnes ; refus d'écriture si un champ interne est détecté | `scripts/sync-data.mjs`, `scripts/lib/public-projection.mjs` |
| C2 | `commentaire_validation` et `fiabilite_info_10` retirés de `data/cases.json` (le front ne les consomme pas ; régénérables depuis Supabase) | `data/cases.json` |
| C3 | La clé `service_role` n'est **plus écrite dans `localStorage`** ; seule l'URL est mémorisée ; la clé est saisie à chaque session et un avertissement explicite est affiché | `tools/review.html` |
| C4 | `select=*` de l'outil de revue remplacé par une liste de colonnes explicite | `tools/review.html` |
| C5 | Contrôles QA déterministes + fixtures prouvant qu'ils échouent sur le défaut attendu | `scripts/qa/`, `fixtures/editorial/` |

⚠️ **Le correctif `contact@sousnosyeux.fr` → `.org` ne fait PAS partie de cette branche.**
Il touche une mention légale et suppose que la boîte `.org` reçoit réellement du courrier,
ce qui n'est pas démontré. Il est isolé dans un candidat séparé, non commité : voir
`docs/industrialisation/CONTACT_HOTFIX_CANDIDATE.md`.

**Non corrigé volontairement** : la correction de contact ci-dessus, le retrait des fiches §2.1, la fusion des doublons §5, le
re-scoring §2.3, le backfill `resume_public`. Ces actions touchent des **données réelles
publiées** et sont réservées à Adrien.

---

## 8. Éligibilité des zones pour un hub (seuil : ≥ 4 affaires publiées) `OBSERVÉ`

| Zone | Maille | Affaires | Établissements distincts | Éligible |
|---|---|---|---|---|
| Paris 11e | arrondissement | **9** | 9 | ✅ |
| Paris | département | **26** | 10 communes | ✅ |
| Rhône | département | **4** | 4 communes | ⚠️ éligible, mais **1 des 4 est en `relaxe`** (`FR-2026-0035`) → tombe à 3 après retrait |
| Essonne, Yvelines | département | 3 | — | ❌ inéligible |
| 15 autres départements | — | 1–2 | — | ❌ inéligibles |

`INFÉRÉ` : le corpus ne supporte aujourd'hui que **deux** hubs réellement solides
(Paris 11e et Paris). Le troisième hub exigé par la roadmap (§6 mission C) n'est atteignable
qu'en assouplissant la maille ou en enrichissant le corpus — ce qui est hors périmètre de
cette session.

---

## 9. Écart entre le prototype et le corpus réel `OBSERVÉ`

La roadmap signalait que le résumé du prototype cite « Voltaire » sans carte correspondante.
L'audit montre l'inverse du diagnostic attendu : **`POC-08` « École maternelle Voltaire »
existe bien en base**, et c'est la **carte** du prototype qui était anonymisée
(« École maternelle — Paris 11e »).

Le prototype et le corpus décrivent donc 9 affaires chacun pour Paris 11e, mais avec des
libellés qui ne se correspondent pas un à un. La liaison affaire ↔ établissement doit être
rétablie par `hub_cases` (sélection explicite), pas par rapprochement de noms.
