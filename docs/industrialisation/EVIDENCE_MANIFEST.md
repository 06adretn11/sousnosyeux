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

### ⚠️ Découverte de cette passe — condition d'application

Au premier essai, `004` a échoué :

```
ERROR:  invalid input value for enum publication_status: "publiée"
```

Cause : `schema.sql` avait été lu avec un encodage client autre qu'UTF-8, créant les
**libellés d'énumération corrompus**. L'erreur n'apparaît qu'ensuite, dans `004`.

**Conséquence pour l'application réelle** : la migration doit être appliquée avec
`PGCLIENTENCODING=UTF8` explicitement épinglé, ou depuis l'éditeur SQL Supabase (UTF-8
natif). Appliquée avec un encodage latin, elle corromprait silencieusement les libellés
d'énumération. Ce point est repris dans `DECISION_PACK.md` → D4.

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

## 9. Ce que ces preuves ne démontrent pas

- **Aucune qualité éditoriale.** 16 règles et 11 fixtures prouvent que les contrôles
  fonctionnent, pas que le corpus est exact.
- **Aucun cycle de maintenance réel.** Les 4 cycles sont simulés sur fixtures.
- **Aucune application en production.** La migration n'a tourné que sur une base jetable.
- **Aucune validation humaine.** Aucun hub n'a été relu, approuvé ni publié.
- **Aucune disponibilité réseau** des URL de source n'a été contrôlée.
