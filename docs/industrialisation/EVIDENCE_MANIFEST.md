# Manifeste de preuves — branche `feat/hub-pre-executeur-clean`

_Rejoué le 15 septembre 2026 sur la branche propre, depuis `e9a28e2`._
_Aucun résultat de la session précédente n'est réutilisé : tout est réexécuté._

Les journaux complets ne sont conservés que pour les contrôles **en échec**. Un contrôle vert
est attesté par sa commande, son code retour et son artefact.

---

## 1. Build et étanchéité du rendu

| # | Contrôle | Commande | Code | Résultat |
|---|---|---|---|---|
| P1 | Build public | `npm run build` (dans `web/`) | `0` | **3 pages**, `0` hub |
| P2 | Aucun hub dans le build public | `find web/dist -path '*hub*' -o -path '*brouillon*'` | — | **0 fichier** |
| P3 | Build de revue | `npm run build:drafts` | `0` | **6 pages**, dont 3 hubs |
| P4 | `noindex` sur les brouillons | `grep -c 'noindex,nofollow,noarchive'` | — | **3/3** |
| P5 | Brouillons liés depuis une page publique | `grep -l 'brouillons' web/dist/{index,methodologie,mentions-legales}` | — | **0** |

> ⚠️ **3 pages et non 4.** `web/src/pages/a-propos.astro` appartient à Adrien et reste non
> suivi : il n'est pas dans la branche propre. L'écart de comptage est **la preuve visible**
> que la séparation a fonctionné, pas une régression.

## 2. Règles éditoriales

| # | Contrôle | Commande | Code | Résultat |
|---|---|---|---|---|
| P6 | Auto-test des règles | `node scripts/qa/self-test.mjs` | `0` | `SELF_TEST_PASSED` — 16 règles, 11 fixtures, vérifié dans les deux sens |
| P7 | Corpus réel | `node scripts/qa/check-corpus.mjs` | `1` | `CORPUS_CHECK_FAILED` — **10 constats bloquants** (attendu : ils portent sur des données réelles, non corrigées ici) |

## 3. Projection publique et fuites

| # | Contrôle | Commande | Code | Résultat |
|---|---|---|---|---|
| P8 | Surface publique | `node scripts/qa/check-public-surface.mjs` | `0` | `G10_PASSED` — 0 champ interne dans `data/cases.json`, `web/dist`, `web/public`, `web/src` |
| P9 | Projection en liste blanche sur fixtures | inclus dans P6 §3 | `0` | projection propre sur les 11 fixtures, dont `FIX-10` qui contient une fuite volontaire |

## 4. Migration 004 — PostgreSQL 17.11 éphémère

Cluster jetable hors dépôt, base `sny_clean`. **La production n'a pas été touchée.**

| # | Étape | Code | Résultat |
|---|---|---|---|
| P10 | `schema.sql` + `001` + `003` | `0` | appliqués |
| P11 | `004_canonical_model.sql` (1er passage) | `0` | appliquée |
| P12 | `004` rejouée immédiatement | `0` | **idempotente** |
| P13 | `supabase/tests/004_invariants.sql` | `0` | `004_INVARIANTS_PASSED` — **12 assertions** |
| P14 | `004_rollback.sql` | `0` | 6 tables → **0** ; `cases_public` (v1) survit ; **4 lignes `cases` préservées** |
| P15 | `004` ré-appliquée après rollback | `0` | 0 → 6 tables |

### 🔴 Porte 2 rétrogradée à `PROVISIONAL`

Au premier essai, `004` a échoué :

```
ERROR:  invalid input value for enum publication_status: "publiée"
```

Cause : `schema.sql` avait été lu avec un encodage client autre qu'UTF-8, créant des
**libellés d'énumération corrompus**. L'erreur n'apparaît qu'ensuite, dans `004`.

Les lignes P10 à P15 ci-dessus ont été obtenues **après** avoir exporté `PGCLIENTENCODING=UTF8`
à la main, sur un poste Windows. **Elles ne prouvent donc pas que la migration est
reproductible : elles prouvent qu'elle fonctionne sur mon poste, une fois la variable posée.**

C'est insuffisant pour une porte `PASSED`, pour trois raisons :

1. l'encodage dépend du **poste et de l'opérateur**, pas du processus ;
2. le mode d'échec est différé — la corruption a lieu à `schema.sql`, l'erreur surgit dans
   `004`, et entre les deux la base contient des libellés faux ;
3. la fragilité s'est reproduite pendant la rédaction : la même requête d'assertion, passée
   par `psql -c` au lieu de `psql -f`, a échoué avec
   `invalid byte sequence for encoding "UTF8": 0xe9`.

> **Verdict corrigé — porte 2 : `PASSED` → `PROVISIONAL`.**
> Le tableau de `GATE_0_REPORT.md` est **périmé sur cette ligne** ; ce manifeste fait foi.
> La porte ne repassera que lorsque l'encodage sera garanti **par le chemin d'exécution**
> (éditeur SQL Supabase, ou script qui pose la variable et refuse de démarrer sans elle),
> et non par une manipulation d'environnement. Garanties G1/G2/G3 et requête d'assertion
> testée : `DECISION_PACK.md` → D4.

**État des portes après correction** : 0 `PASSED` · 1 `PROVISIONAL` · 2 **`PROVISIONAL`** ·
3 `PROVISIONAL` · 4 `PROVISIONAL`. **Aucune porte n'est `PASSED` sur la dimension exécution.**

## 5. Contrôles de rendu

Brouillon `paris-11e` servi en HTTP local (les fichiers `file://` hors projet ne sont pas
pilotables), mesures prises dans le navigateur.

| Largeur | `scrollWidth` | Débordement | Cartes | Éléments hors cadre | `robots` |
|---|---|---|---|---|---|
| 390 px | 390 | non | 9 | **0** | `noindex,nofollow,noarchive` |
| 1440 px | 1425 | non | 9 | **0** | — |

## 6. Entretien

| # | Contrôle | Commande | Code | Résultat |
|---|---|---|---|---|
| P16 | Cycles simulés | `node scripts/qa/run-cycles.mjs` | `0` | `CYCLES_PASSED` — détection, idempotence, résolution, priorité aux issues favorables |

> L'idempotence (`65 alertes → 0 nouvelle`) est une propriété **du scanner**. Elle ne
> démontre pas que deux cycles réels de maintenance ont eu lieu : aucun humain n'a encore
> traité une alerte. Voir `MANUAL_PILOT_RUNBOOK.md`.

## 7. Reproductibilité des payloads de hub

| Hub | `payload_hash` (branche historique) | `payload_hash` (branche propre) | Identique |
|---|---|---|---|
| `paris-11e` | `3a78e3e5368e…` | `3a78e3e5368e…` | ✅ |
| `paris` | `cf18d473b231…` | `cf18d473b231…` | ✅ |
| `rhone` | `be115bf91cfe…` | `be115bf91cfe…` | ✅ |

Le hash ne couvre que le payload public : il est insensible aux constats de contrôle et aux
dates de génération. C'est le comportement voulu — c'est lui qui sera approuvé.

## 8. Scan de secrets

Aucune valeur détectée n'est affichée. Motifs : JWT, `sb_secret_`, clé Anthropic,
`SUPABASE_SERVICE_ROLE_KEY=`, URL Postgres avec identifiants, clé AWS, bloc PEM.

| Périmètre | Fichiers / blobs concernés |
|---|---|
| Worktree (fichiers suivis) | **0** |
| Index | **0** (aucune entrée stagée) |
| Historique de la branche (`e9a28e2..HEAD`, tous les blobs) | **0** |
| Archive de sauvegarde locale | **0** |
| `.env.local` | ignoré, **0 commit** dans tout l'historique — jamais entré dans Git |

## 9. Préflight du candidat `paris-11e`

Exécuté le 15/09/2026. **Aucune donnée modifiée, aucun scénario du pilote joué.**

Croisement des **10 constats bloquants du corpus** avec les 9 affaires du hub
(`FR-2026-0016`, `FR-2026-0023`, `PARIS-006`, `PARIS-009`, `POC-05`, `POC-06`, `POC-07`,
`POC-08`, `POC-09`) :

| Constat bloquant du corpus | Affaire | Touche `paris-11e` |
|---|---|---|
| `R4_source_primaire_sans_date` — France 3 non datée | `POC-09` | ✅ **OUI** |
| `R4_source_primaire_non_admissible` — libellé « Wikipédia » | `FR-2026-0008` | ❌ non |
| `R4_source_primaire_non_admissible` — reprise MSN | `PARIS-001` | ❌ non |
| `R4_source_primaire_sans_date` — Ouest-France | `POC-02` | ❌ non |
| `R4_source_primaire_sans_date` — ELLE | `POC-10` | ❌ non |
| `R5_relaxe_encore_publiee` | `FR-2026-0024` | ❌ non |
| `R5_relaxe_encore_publiee` | `FR-2026-0035` | ❌ non |
| `R9_doublon_probable` | `FR-2026-0003`/`PARIS-010` | ❌ non |
| `R9_doublon_probable` | `FR-2026-0007`/`PARIS-007` | ❌ non |
| `R9_doublon_probable` | `FR-2026-0008`/`PARIS-008` | ❌ non |

**1 bloquant sur 10 touche le hub.**

Alertes propres au hub : `R5_verified_at_absent` × **9** (les 9 affaires) et
`R9_doublon_probable` × **1** (`FR-2026-0023` / `PARIS-009`, Faidherbe — `HUMAN_REVIEW`).

`payload_hash 3a78e3e5368ecdca…` · `publishable: false` · 9 affaires · 8 établissements.

### Lecture

Le seul bloquant qui touche le hub — la source France 3 non datée de `POC-09`, École Titon —
**est exactement l'entrée prévue du scénario S2** du runbook. Le pilote n'est pas empêché par
ce constat : il est construit autour de lui.

Aucun des constats les plus lourds ne touche le hub : les deux fiches à statut douteux (D1)
et les trois paires de doublons (D2) sont **hors périmètre**. Les décisions D1, D2 et D6
peuvent donc être arbitrées **sans bloquer le pilote**, et réciproquement.

Réserve : `publishable: false`. Le hub **ne peut pas être publié** en l'état — ce qui est
sans effet ici, puisque aucun scénario du pilote ne publie.

**Verdict du préflight : `READY_FOR_MANUAL_PILOT`.**

## 10. Ce que ces preuves ne démontrent pas

- **Aucune qualité éditoriale.** 16 règles et 11 fixtures prouvent que les contrôles
  fonctionnent, pas que le corpus est exact.
- **Aucun cycle de maintenance réel.** Les 4 cycles sont simulés sur fixtures.
- **Aucune application en production.** La migration n'a tourné que sur une base jetable, et
  seulement après avoir fixé l'encodage à la main (cf. §4).
- **Aucune validation humaine.** Aucun hub n'a été relu, approuvé ni publié.
- **Aucune disponibilité réseau** des URL de source n'a été contrôlée.
