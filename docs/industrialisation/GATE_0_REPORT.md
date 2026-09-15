# Rapports de portes 0 → 4

_Session du 14–15 septembre 2026 · branche `feat/hub-pre-executeur` · base `e9a28e2` (`main`)._

Tous les verdicts ci-dessous sont adossés à une commande exécutée et à sa sortie.
Aucun merge, aucun déploiement, aucune mutation Supabase, aucune publication.

---

## Verdict global

> **`READY_FOR_EXECUTOR_DESIGN`** — les contrats et les exécuteurs locaux bornés sont
> suffisamment définis pour ouvrir le chantier de conception distante.
>
> Cela n'autorise **ni bot, ni Telegram, ni scheduler, ni automatisation distante**, et ne
> rend **aucun** hub publiable : trois des cinq portes restent `PROVISIONAL`.

| Porte | Verdict | Preuve courte |
|---|---|---|
| 0 — Sauver la référence | **`PASSED`** | prototype byte-identique dans Git, hors de toute surface publique, garde-fou automatique |
| 1 — Contrat éditorial testable | **`PROVISIONAL`** | 16 règles prouvées par 11 fixtures ; revue juridique externe manquante |
| 2 — Source de vérité | **`PASSED`** | migration 004 appliquée, idempotente, invariants testés et rollback rejoué sur Postgres 17 |
| 3 — Fabrique de hubs | **`PROVISIONAL`** | 3 hubs générés, hachés, noindex, non liés — mais **0/3 publiable** |
| 4 — Entretien en observation | **`PROVISIONAL`** | 4 cycles simulés verts, idempotence prouvée sur fixtures **et** corpus réel ; aucun contrôle réseau |

---

## Porte 0 — Sauver la référence · `GATE_0_PASSED`

### Inventaire observé (≠ documentation)

| Élément | Observé |
|---|---|
| Branche / HEAD de départ | `main` / `e9a28e2`, aligné avec `origin/main` (0 ahead, 0 behind) |
| Worktree | **sale** : 6 fichiers modifiés, 22 non suivis — tous préservés, aucun écrasé |
| Pages Astro | 4 (`index`, `methodologie`, `mentions-legales`, `a-propos`) |
| Affaires publiées | **53** dans `data/cases.json`, instantané du **2026-06-06** |
| Migrations | 001, 002, 003 (004 ajoutée par cette session) |
| Tests | **aucun** avant cette session |
| CI | **aucune** — pas de `.github/` |

`CLAUDE.md` annonce 112 affaires en base : **non vérifiable** sans accès Supabase, non utilisé
comme hypothèse. Toute affirmation de ce rapport est reliée à un fichier ou une commande.

### Fichiers ajoutés

```
prototypes/hubs/paris-11-v3-reconstruction/{index.html, README.md}
docs/industrialisation/{ROADMAP_PRE_EXECUTEUR, MANDAT_OPUS_PRE_EXECUTEUR,
  EDITORIAL_CONTRACT_V0, DATA_CONTRACT_V0, QA_GATES_V0, CORPUS_AUDIT_V0,
  GATE_0_REPORT, JOURNAL_DECISIONS}.md
```

### Vérifications

| Contrôle | Commande | Résultat |
|---|---|---|
| Fidélité du prototype | `sha256sum` source vs copie | **identique** — `a09fb67c…8bdc4f` |
| `noindex` conservé | `grep robots` | `noindex,nofollow,noarchive` présent |
| Hors du build | `check-public-surface.mjs` | aucun fichier de `prototypes/` dans `web/dist`, `web/public`, `web/src` |
| Build inchangé | `npm run build` | 4 pages, 0 erreur |
| Rendu de référence 390 px | navigateur intégré | `scrollWidth` 390, pas de défilement de page, **2 éléments en dépassement** (`NAV.main-nav`, `A.contact-button`) |
| Rendu de référence 1440 px | navigateur intégré | `scrollWidth` 1425, grille 2 colonnes `671px + 403px`, 9 cartes, 0 dépassement |

Les deux rendus de référence exigés par la roadmap sont consignés sous forme de **mesures
reproductibles** dans `RENDERS.md` plutôt que de captures binaires : des valeurs se
comparent et se rejouent, une image non. Le dépassement mobile confirme le défaut de
navigation que la vidéo d'origine laissait voir ; il est **conservé**, pas corrigé.

Le contenu historique non conforme est **conservé tel quel** et documenté dans le README du
prototype (10 non-conformités listées, non corrigées).

**`GATE_0_PASSED`.**

---

## Porte 1 — Contrat éditorial testable · `GATE_1_PROVISIONAL`

### Ce qui existe

- `EDITORIAL_CONTRACT_V0.md` : matrice champ par champ, formulations imposées par statut,
  règle de priorité asymétrique, règles de datation et de péremption, procédures de
  correction et de retrait, blocs V1 autorisés / différés.
- `scripts/qa/lib/rules.mjs` : **16 règles déterministes** appliquées à une fiche ou au corpus.
- `fixtures/editorial/cases.json` : **11 fixtures explicitement fictives** couvrant publiable,
  à généraliser, à compléter, contradictoire, périmé, doublon, relaxe, retrait, affirmation
  non sourcée, fuite de champ interne.
- `scripts/qa/self-test.mjs` : vérifie dans les **deux sens** — règle attendue non déclenchée
  **et** règle inattendue déclenchée.

```
$ node scripts/qa/self-test.mjs
SELF_TEST_PASSED — chaque règle éprouvée se déclenche sur le défaut attendu, et sur lui seul.
```

### Qualité de source ≠ vérité judiciaire

Séparation explicite dans le contrat (§4) et dans le code : `fiabilite_info_10` est classé
**interne** et retiré des artefacts publics, précisément parce que sa publication invite à le
lire comme un degré de certitude sur les faits.

### Pourquoi `PROVISIONAL` et non `PASSED`

1. Aucune revue par un conseil en droit de la presse et données personnelles — 7 points
   listés en §8 du contrat.
2. La détection de **noms de personnes** n'est pas automatisable par motif : elle reste
   humaine, donc la porte ne peut pas être déclarée prouvée.
3. Le critère de sortie de la roadmap (« deux personnes rendent la même décision sur un
   corpus test ») n'a été exercé que par la machine, pas par deux relecteurs humains.

Le développement local se poursuit sur l'option la plus prudente.

---

## Porte 2 — Source de vérité et projection publique · `GATE_2_PASSED`

### Fuites fermées

| Fuite | Preuve avant | Preuve après |
|---|---|---|
| `commentaire_validation` × 53 dans `data/cases.json` (dépôt public) | `reproject-cases-json.mjs --dry-run` → 106 champs internes | 0 |
| `fiabilite_info_10` × 53 dans `data/cases.json` | idem | 0 |
| `fiabilite_info_10` **× 52 dans `web/dist/index.html`** — score interne expédié au navigateur de chaque visiteur dans le GeoJSON | `grep -c` → 52 | 0 après retrait de la propriété dans `index.astro` |
| `select=*` sur la table `cases` (contournait la vue `cases_public`) | `sync-data.mjs:42,53` | liste blanche `CASE_SELECT` / `SOURCE_SELECT` |
| Clé `service_role` en clair dans `localStorage`, outil versionné dans un dépôt **public** | `review.html:205` | plus jamais persistée + purge automatique d'une clé héritée + avertissement |
| `select=*` dans l'outil de revue | `review.html:194` | listes de colonnes explicites |

Garde-fou terminal : `assertNoInternalFields()` **jette** avant toute écriture d'artefact
public. Le contrôle `check-public-surface.mjs` a été vu **échouer** sur l'état d'avant
(`G10_FAILED`, 2 problèmes) puis **passer** après correction (`G10_PASSED`) — il distingue
donc réellement les deux états.

### Migrations exécutées sur une base éphémère

Postgres 17.11 local, cluster jetable, base `sny_test`. **La production n'a jamais été touchée.**

| Étape | Résultat |
|---|---|
| `schema.sql` + `001` + `003` | appliqués sans erreur |
| `004_canonical_model.sql` | appliquée |
| `004` rejouée immédiatement | **idempotente** — aucun échec |
| `supabase/tests/004_invariants.sql` | **`004_INVARIANTS_PASSED`** — 11 assertions |
| `004_rollback.sql` | tables 6 → 0, `cases_public` v1 intacte, **4 lignes `cases` préservées** |
| `004` ré-appliquée après rollback | tables 0 → 6, sans erreur |

Invariants prouvés par le moteur, pas par convention :
- `cases_public_v2` exclut relaxe/non-lieu/classement, « à qualifier » et fiches fusionnées ;
- **aucune** colonne interne dans `cases_public_v2` ;
- `case_events` est **réellement** append-only : `UPDATE` et `DELETE` sont refusés par trigger ;
- `(hub_id, payload_hash)` unique ;
- `merged_into` contraint par clé étrangère ;
- l'ancienne vue `cases_public` survit → la bascule du front est réversible.

004 est 100 % additive : aucun `DROP`, aucune contrainte `NOT NULL` ni `CHECK` sur une colonne
existante. Les invariants du contrat sont contrôlés **hors base** tant qu'ils n'ont pas été
observés sur les données réelles.

### Risque résiduel assumé

`tools/review.html` **utilise toujours** la clé `service_role` dans le navigateur : c'est un
outil d'écriture, il ne peut pas s'en passer sans une authentification Supabase qui n'existe
pas encore. Ce qui a été fermé, c'est le **chemin dangereux** — la persistance en clair.
Reste : la clé transite par le navigateur le temps d'une session.

Conséquence directe : **la clé actuelle doit être considérée comme compromise** et changée.
Elle a été écrite en clair dans le `localStorage` de chaque machine ayant utilisé l'outil, et
`CLAUDE.md` §3 documente un partage de ces identifiants « de vive voix ». Voir décision **D3**.

**`GATE_2_PASSED`** — les preuves manquantes sont l'exécution contre Supabase et
l'authentification de l'outil de revue, toutes deux réservées à Adrien.

---

## Porte 3 — Fabrique de hubs locale · `GATE_3_PROVISIONAL`

### Éligibilité mesurée, pas supposée

Seuil : 4 affaires publiées distinctes par zone.

| Zone | Affaires | Verdict |
|---|---|---|
| `paris-11e` (arrondissement) | 9 | éligible |
| `paris` (département) | 26 | éligible |
| `rhone` (département) | 4 | éligible **de justesse** — tombe à 3 si `FR-2026-0035` (relaxe) est retirée |
| Essonne, Yvelines | 3 | inéligibles |
| 15 autres départements | 1–2 | inéligibles |

Le générateur produit une **preuve d'inéligibilité** (`<hub>.INELIGIBLE.json`) au lieu de
remplir artificiellement.

### Rendus produits

```
$ node scripts/build-hubs.mjs           → 0 payload (3 hubs bloqués, refus)
$ node scripts/build-hubs.mjs --draft   → 3 payloads + 3 dossiers de revue
```

| Hub | Affaires | `payload_hash` | Bloquants | Alertes |
|---|---|---|---|---|
| `paris-11e` | 9 | `3a78e3e5368ecdca…` | 1 | 10 |
| `paris` | 26 | `cf18d473b23196e3…` | 8 | 27 |
| `rhone` | 4 | `be115bf91cfe2156…` | 1 | 4 |

**0/3 publiable.** Le générateur refuse de produire un payload publiable tant qu'un contrôle
bloquant se déclenche — c'est le comportement attendu, pas un échec.

### Étanchéité du rendu

| Contrôle | Résultat |
|---|---|
| Build par défaut (`npm run build`) | **4 pages, 0 hub** |
| Build de revue (`npm run build:drafts`) | 7 pages, dont 3 hubs |
| `noindex,nofollow,noarchive` sur chaque brouillon | 3/3 |
| Lien depuis une page publique | **aucun** |
| `check-public-surface.mjs` sur un `dist` contenant des brouillons | **`G10_FAILED`** — le garde-fou se déclenche |
| Compteurs saisis | **aucun** — tous dérivés ; `sum(par_statut) == affaires` vérifié |
| Champs internes dans un payload | 0 (`assertNoInternalFields` avant écriture) |

### Contrôle responsive réel

Rendu `paris-11e` ouvert dans le navigateur intégré :

| Largeur | `scrollWidth` | Débordement | Éléments hors cadre |
|---|---|---|---|
| 390 px | 390 | **non** | 0 |
| 1440 px | 1425 | **non** | 0 |

**Ce contrôle visuel a trouvé un défaut que les règles ne voyaient pas** : une source
**Mediapart** (paywall, non vérifiable publiquement) était citée en source *secondaire*, alors
que `ruleSources` ne contrôlait l'admissibilité que des sources *primaires*. Règle étendue
(`R4_source_secondaire_non_admissible`), défaut confirmé sur `FR-2026-0016`.

### Pourquoi `PROVISIONAL`

Les informations judiciaires rendues proviennent d'un instantané du 6 juin 2026 **non
revérifié**. Elles restent des brouillons historiques. Le critère de la roadmap — « trois hubs
produits au même niveau de qualité, sans retouche du HTML généré » — est atteint sur le
**procédé**, pas sur le **contenu**.

---

## Porte 4 — Entretien en observation · `GATE_4_PROVISIONAL`

`scripts/scan-maintenance.mjs` — déterministe, borné, **lecture seule**, aucun accès réseau,
aucun scheduler, aucune mutation. Sorties : `data/maintenance-report.json` (machine) et
`docs/industrialisation/MAINTENANCE_REPORT.md` (humain).

### Cycles simulés

```
$ node scripts/qa/run-cycles.mjs
CYCLES_PASSED — idempotence, résolution et priorité aux issues favorables vérifiées.
```

| Cycle | Corpus | Nouvelles | Résolues | Propriété prouvée |
|---|---|---|---|---|
| 1 | `c1` état initial | 3 | 0 | détection (relaxe publiée, doublon, source non datée) |
| 2 | `c1` **inchangé** | **0** | 0 | **idempotence** — aucune alerte recréée |
| 3 | `c2` correction + retrait + fusion | 0 | **3** | résolution effective |
| 4 | `c3` information contradictoire | 2 | 0 | issue favorable remontée en **priorité 1** |

Empreinte d'alerte = `sha256(règle, cible, éléments déclencheurs)` — sans horodatage, donc stable.

### Idempotence vérifiée aussi sur le corpus réel

| Passage | Constats | Nouvelles |
|---|---|---|
| 1er | 65 (10 bloquants, 55 alertes) | 65 |
| 2e, sans changement | 65 | **0** |

### File de revue réelle

| Priorité | Nombre |
|---|---|
| P1 — issue favorable (relaxe encore publiée) | **2** |
| P4 — doublon probable | 4 |
| P5 — défaut de source bloquant | 5 |
| P6 — source dégradée | 1 |
| P8 — traçabilité de revue (`verified_at` absent) | 53 |

### Pourquoi `PROVISIONAL`

- Aucun contrôle d'accessibilité réseau des URL (hors périmètre, déclaré dans le script).
- Le scanner observe `data/cases.json`, pas la presse : il ne remplace pas `watch-updates.mjs`.
- Les cycles sont simulés sur fixtures ; aucun cycle n'a été exercé contre Supabase.
- Les deux cycles de maintenance **réels** exigés par la roadmap supposent une intervention
  humaine sur des données publiées — réservée à Adrien.

---

## Ce que cette session n'a pas fait

Aucune sonde, aucun exécuteur, aucun Telegram, aucune machine d'états, aucun scheduler, aucune
route publique pour le prototype, aucune recherche web, aucun enrichissement de corpus, aucune
migration appliquée en production, aucune mutation de données réelles, aucun déploiement,
aucun changement Cloudflare/OVH, aucun SEO ni sitemap, aucune refonte de la carte, aucune
dépendance ajoutée (`web/package.json` : 2 dépendances, inchangées), aucune réécriture de
l'historique Git, aucune modification locale écrasée.
