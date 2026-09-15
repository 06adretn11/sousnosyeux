# DATA_CONTRACT_V0 — modèle canonique minimal

_Version 0 — 14 septembre 2026. Porte 2._
_Décrit le modèle **cible**. Les migrations correspondantes sont écrites dans
`supabase/migrations/` mais **non appliquées**. Aucune donnée de production n'est mutée._

Principe directeur : **le hub est un rendu dérivé, jamais une seconde source de vérité.**
Tout champ ci-dessous répond à un besoin du hub, de son entretien, de sa revue ou de sa
traçabilité. Rien d'autre n'est ajouté à ce stade.

---

## 0. État existant (observé le 14/09/2026)

| Table | Statut | Écart avec la cible |
|---|---|---|
| `cases` | ✅ existe (`schema.sql` + migrations 001–003) | pas d'état public distinct du score ; pas de `verified_at` |
| `sources` | ✅ existe | `access_checked_at` et `archive_url` présents mais jamais renseignés |
| `reviews` | ⚠️ existe, **jamais écrite** | aucun script ni outil n'y insère |
| `contributions` | ✅ existe (migration 003) | hors périmètre |
| `cases_public` (vue) | ✅ existe, exclut `commentaire_validation` | **contournée** par `sync-data.mjs` (voir `CORPUS_AUDIT_V0.md` §3) |
| `case_events` | ❌ absente | à créer |
| `claims` | ❌ absente | à créer |
| `local_hubs` / `hub_cases` | ❌ absentes | à créer |
| `content_versions` | ❌ absente | à créer |
| `releases` | ❌ absente | à créer |

---

## 1. `cases` — identité durable de l'affaire

| Champ | Visibilité | Règle |
|---|---|---|
| `case_id` (PK, text) | **public** | identifiant stable `FR-YYYY-NNNN`. Ne change jamais, même après correction. |
| `etablissement` | **public** | graphie canonique unique par établissement |
| `commune`, `departement` | **public** | — |
| `type_structure`, `role_mis_en_cause`, `type_affaire` | **public** | énums fermés |
| `statut_judiciaire` | **public** | énum §2 du contrat éditorial |
| `statut_des_faits` | **public** | énum |
| `enfants_concernes_public` | **public** | énum à 3 valeurs, jamais un nombre |
| `lat`, `lng` | **public** | `null` autorisé ; l'affaire est alors hors carte mais reste dans un hub |
| `resume_public` | **public** | ⚠️ **nouveau** — remplace l'usage actuel de `commentaire_validation` comme résumé |
| `publication_status` | **interne** | `candidate` / `validée` / `publiée` / `retirée` |
| `fiabilite_info_10`, `crit_*` | **interne** | score de traçabilité, jamais un indice de culpabilité |
| `commentaire_validation` | **interne** | note de revue — ne quitte jamais la base |
| `verified_at` (date) | **public** | ⚠️ **nouveau** — dernière relecture humaine source + fiche |
| `next_review_at` (date) | **interne** | dérivé de `statut_judiciaire` (contrat éditorial §5.2) |
| `adresse` | **interne** | aide au géocodage uniquement |
| `created_at`, `updated_at` | **interne** | — |

**Invariants**
- `publication_status = 'publiée'` ⇒ `fiabilite_info_10 >= 8` **et** `verified_at not null`
  **et** au moins une `source` primaire datée.
- `statut_judiciaire = 'relaxe / non-lieu / classement'` ⇒ `publication_status = 'retirée'`.
- `statut_judiciaire = 'à qualifier'` ⇒ `publication_status ≠ 'publiée'`.
- un `case_id` n'est jamais supprimé ni recyclé ; un doublon se résout par `merged_into`.

**Champ de déduplication** — ⚠️ nouveau :
`merged_into text references cases(case_id)`. Une affaire fusionnée garde sa ligne, passe en
`retirée` et pointe vers la survivante. Aucune suppression physique.

---

## 2. `case_events` — append-only

Chronologie factuelle de l'affaire. **Jamais modifiée, jamais supprimée** : une erreur se
corrige par un nouvel événement de type `rectification`.

| Champ | Visibilité | Règle |
|---|---|---|
| `event_id` (uuid, PK) | interne | — |
| `case_id` (FK) | public | — |
| `event_date` (date) | **public** | date de l'événement rapporté ; `null` si la source ne la donne pas |
| `event_type` | **public** | `plainte`, `enquête`, `garde_à_vue`, `mise_en_examen`, `suspension`, `audience`, `délibéré`, `décision`, `réponse_institutionnelle`, `rectification`, `retrait` |
| `statut_apres` | **public** | valeur de `statut_judiciaire` après l'événement, ou `null` si sans effet |
| `libelle_public` | **public** | phrase attribuée, conforme au contrat éditorial §2 |
| `is_future` (bool, dérivé) | **public** | `event_date > today` — pilote la règle d'échéance dépassée |
| `source_id` (FK) | public (via source) | **obligatoire** pour tout événement publiable |
| `recorded_at` | interne | horodatage d'écriture, ≠ `event_date` |

**Invariants**
- l'ordre canonique est `event_date`, puis `recorded_at` en cas d'égalité ;
- `cases.statut_judiciaire` = `statut_apres` du dernier `case_event` daté qui en porte un ;
  toute divergence est un défaut bloquant (contrôlé par le scanner) ;
- une transition **régressive** est valide (voir contrat éditorial §3) ; ce qui est invalide,
  c'est une transition **non justifiée par un événement sourcé**.

---

## 3. `sources`

| Champ | Visibilité | Règle |
|---|---|---|
| `source_id` (uuid, PK) | interne | — |
| `case_id` (FK) | public | — |
| `url` | **public** | URL canonique, `https://`, jamais tronquée |
| `media` | **public** | nom d'éditeur normalisé (une graphie par média) |
| `publication_date` (date) | **public** | obligatoire pour une source primaire |
| `source_type` | **public** | `presse` / `institution` / `justice` |
| `source_tier` | interne | ⚠️ **nouveau** — `primaire_admissible` / `secondaire` / `non_admissible` (contrat éditorial §4) |
| `is_primary` (bool) | **public** | une seule par affaire (index unique déjà en place) |
| `access_checked_at` | **public** | dernier contrôle d'accessibilité |
| `access_status` | **public** | ⚠️ **nouveau** — `ok` / `indisponible` / `paywall` / `erreur`. Un lien mort est **affiché comme tel**, jamais masqué. |
| `archive_url` | **public** | copie d'archive si disponible |

**Invariants**
- `is_primary = true` ⇒ `publication_date not null` **et** `source_tier = 'primaire_admissible'` ;
- une affaire publiée a ≥ 1 source primaire admissible.

---

## 4. `claims` — affirmation ↔ source ↔ passage

La brique qui empêche qu'un article de synthèse serve de justificatif à dix affirmations
qu'il n'énonce pas.

| Champ | Visibilité | Règle |
|---|---|---|
| `claim_id` (uuid, PK) | interne | — |
| `case_id` (FK) | public | — |
| `event_id` (FK, nullable) | interne | rattachement à un événement si applicable |
| `claim_text` | **public** | l'affirmation telle qu'elle sera rendue |
| `source_id` (FK) | **public** | source qui la justifie |
| `justifying_quote` | interne | passage exact de la source qui la porte |
| `sensitivity` | interne | `sensible` / `contextuel`. Une affirmation `sensible` **sans** `source_id` + `justifying_quote` n'est pas publiable. |
| `verified_at` | **public** | date de la vérification du passage |

**Invariant bloquant** : 100 % des `claims` de sensibilité `sensible` d'une page publiée ont
un `source_id` non nul et un `justifying_quote` non vide.

---

## 5. `local_hubs` et `hub_cases`

| `local_hubs` | Visibilité | Règle |
|---|---|---|
| `hub_id` (text, PK) | **public** | slug stable, ex. `paris-11e` |
| `zone_label` | **public** | libellé affiché |
| `zone_kind` | **public** | `arrondissement` / `commune` / `departement` |
| `status` | interne | `draft` / `review` / `published` / `retired` |
| `verified_at` | **public** | date de vérification du hub = **min** des `verified_at` des affaires retenues |
| `template_version` | interne | version du template utilisé |

| `hub_cases` | Règle |
|---|---|
| `hub_id` + `case_id` (PK composite) | sélection **explicite**, jamais implicite par requête géographique |
| `position` | ordre d'affichage stable |
| `included_at` / `excluded_at` | trace d'entrée et de sortie |

**Règle d'éligibilité** : `count(hub_cases où case.publication_status='publiée') >= 4`.
En deçà, le hub reste `draft` et le générateur produit une **preuve d'inéligibilité**.

### Règle de calcul des compteurs

Les compteurs du hub sont **exclusivement dérivés**, jamais stockés ni saisis :

```
affaires          = count(cases publiées et rattachées au hub)
etablissements    = count(distinct etablissement) sur ce même ensemble
par_statut[S]     = count(cases où statut_judiciaire = S) sur ce même ensemble
derniere_verif    = min(verified_at) sur ce même ensemble
echeances_futures = count(case_events où is_future) sur ce même ensemble
```

Invariant : `sum(par_statut) == affaires`. Une divergence est un défaut bloquant.
Les affaires `retirée` ou `candidate` ne comptent dans **aucun** compteur.

---

## 6. `content_versions` — ce qui a été rendu

| Champ | Règle |
|---|---|
| `version_id` (uuid, PK) | — |
| `hub_id` (FK) | — |
| `payload` (jsonb) | l'objet exact passé au template |
| `payload_hash` (text) | SHA-256 du payload canonicalisé — **c'est ce qui est approuvé** |
| `template_version`, `rules_version` | versions du template et du contrat éditorial appliqués |
| `rendered_at` | — |

Une approbation porte sur un `payload_hash`, jamais sur « le hub ». Si le payload change
d'un octet, l'approbation est caduque.

---

## 7. `reviews` — décision humaine

La table existe déjà mais **n'est jamais écrite**. Contrat cible :

| Champ | Règle |
|---|---|
| `review_id` (uuid, PK) | — |
| `case_id` (FK) ou `hub_id` (FK) | ⚠️ **nouveau** — une revue porte sur une affaire **ou** sur un hub |
| `payload_hash` | ⚠️ **nouveau** — hash exact validé (cf. §6) |
| `reviewed_by` | identité du validateur, non anonyme |
| `reviewed_at` | — |
| `decision` | `validé` / `à corriger` / `retirer` |
| `comment` | interne |
| `next_review_at` | échéance dérivée du statut |

**Invariant** : aucune bascule vers `publication_status = 'publiée'` sans une `review`
`validé` portant sur le `payload_hash` courant.

---

## 8. `releases` — ce qui est réellement en ligne

| Champ | Règle |
|---|---|
| `release_id` (uuid, PK) | — |
| `version_id` (FK `content_versions`) | — |
| `commit_sha`, `pr_url` | traçabilité Git |
| `deployed_at`, `live_check_at`, `live_check_status` | contrôle post-déploiement |
| `outcome` | `succes` / `echec` / `rollback` |
| `rollback_of` (FK, nullable) | correction ou retrait rattaché à la release fautive |

---

## 9. Projection publique par liste blanche

Une seule fonction produit tout artefact public. **Aucun `select=*` sur le chemin public.**

`scripts/lib/public-projection.mjs` expose :

- `PUBLIC_CASE_FIELDS` — la liste blanche, seule autorité ;
- `INTERNAL_FIELDS` — liste noire explicite, contrôlée en plus de la liste blanche ;
- `projectCase(row)` — filtre, et **jette** si un champ interne est présent en entrée sans
  être explicitement écarté ;
- `projectSource(row)`, `projectHub(payload)`.

Champs publics d'une affaire (V0, alignés sur ce que le front consomme réellement) :

```
case_id · etablissement · commune · departement · type_structure ·
role_mis_en_cause · type_affaire · statut_judiciaire · statut_des_faits ·
enfants_concernes_public · lat · lng · verified_at · sources[]
```

Champs de source publics : `url · media · publication_date · source_type · is_primary ·
access_status · archive_url`.

Champs **interdits** dans tout artefact public (`data/cases.json`, build, navigateur) :

```
commentaire_validation · fiabilite_info_10 · crit_source_fiable · crit_article_recent ·
crit_etablissement_nomme · crit_statut_clair · crit_recoupement · publication_status ·
adresse · next_review_at · justifying_quote · source_tier · reviewed_by · comment
```

> Note de compatibilité : `fiabilite_info_10` est aujourd'hui présent dans `data/cases.json`
> et non consommé par le front. Il est classé **interne** : c'est un indicateur de revue
> interne dont la publication invite à le lire comme un degré de certitude sur les faits —
> exactement la confusion que le contrat éditorial §4 interdit.

---

## 10. Stratégie de migration et rollback (non exécutée)

| Étape | Nature | Réversible |
|---|---|---|
| `004` — `case_events`, `claims`, `local_hubs`, `hub_cases`, `content_versions`, `releases` | **additive** : `create table if not exists` | ✅ `drop table` |
| `004` — colonnes ajoutées à `cases` (`resume_public`, `verified_at`, `merged_into`) | **additive** : `add column if not exists`, toutes nullables | ✅ `drop column` |
| `004` — colonnes ajoutées à `sources` (`source_tier`, `access_status`) | **additive**, nullables avec défaut | ✅ `drop column` |
| `004` — vue `cases_public_v2` | **additive** : nouvelle vue, l'ancienne reste | ✅ `drop view` |
| Backfill `resume_public` ← `commentaire_validation` | **mutation de données** | ⛔ **hors périmètre** — décision d'Adrien |
| Passage du front à `cases_public_v2` | changement de contrat | ✅ revert du script |
| Suppression de `commentaire_validation` | **destructif** | ⛔ jamais dans cette phase |

Aucune contrainte `not null` ni `check` n'est ajoutée sur des colonnes existantes : les
invariants sont d'abord **contrôlés hors base** (`scripts/qa/`) pour être observés sur les
données réelles avant d'être imposés par le moteur.

Rollback complet de `004` : `supabase/migrations/004_rollback.sql`, fourni et non appliqué.

---

## 11. Impact sur les scripts existants

| Script | Impact | Action prise dans cette session |
|---|---|---|
| `scripts/sync-data.mjs` | interroge la table `cases` en `select=*` et exporte `commentaire_validation` | ✅ **corrigé** — bascule sur la liste blanche + refus de tout champ interne |
| `scripts/import-cases.mjs` | écrit `commentaire_validation` ← `resume_faits` | ⚠️ inchangé — l'écriture est interne et légitime ; seule l'**exportation** était fautive |
| `scripts/bulk-publish.mjs` | publie sur le seul critère `fiabilite_info_10 >= 8` | ⚠️ inchangé — ne vérifie ni `verified_at` ni la présence d'une source primaire datée (écart documenté) |
| `scripts/repair-sources.mjs` | one-shot, déjà utilisé | aucun |
| `scripts/watch-updates.mjs` | veille Google News, écrit un rapport | aucun — le scanner de la porte 4 est distinct et déterministe |
| `tools/review.html` | stocke la clé `service_role` en clair dans `localStorage` | ✅ **corrigé** — voir `CORPUS_AUDIT_V0.md` §4 |
