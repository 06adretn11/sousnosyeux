# Runbook — pilote manuel

_15 septembre 2026. **Non joué.** Aucune validation humaine n'a eu lieu._

Ce document permet de lancer le pilote dans une mission distincte. Il ne l'exécute pas et ne
préjuge pas de son résultat.

## 1. Contenu candidat

**Hub `paris-11e`** — `payload_hash 3a78e3e5368ecdca…`, 9 affaires, 8 établissements.

Pourquoi celui-là :

- ses sources sont des médias nationaux **en accès libre** (Le Monde, Le Figaro, Libération,
  Le Parisien, France 3, 20 Minutes) : revérifiables sans compte ni abonnement ;
- il est le seul à disposer d'une **référence visuelle** (`prototypes/hubs/paris-11-v3-reconstruction/`) ;
- il porte déjà **1 constat bloquant** et **10 alertes** : le pilote traite un cas réel, pas un cas parfait ;
- l'affaire `POC-09` (École Titon) avait un délibéré annoncé au **16 juin 2026**, dépassé
  depuis trois mois : le pilote est obligé de chercher une issue, ce qui est exactement
  l'exercice à calibrer.

### Préflight — exécuté le 15/09/2026, **le pilote ne l'a pas été**

Croisement des 10 constats bloquants du corpus avec les 9 affaires du hub :

| | |
|---|---|
| Bloquants du corpus touchant le hub | **1 sur 10** |
| Lequel | `R4_source_primaire_sans_date` — `POC-09` (École Titon), source **France 3 non datée** |
| Alertes du hub | `R5_verified_at_absent` × 9 · `R9_doublon_probable` × 1 (`FR-2026-0023`/`PARIS-009`) |
| `payload_hash` | `3a78e3e5368ecdca…` |
| `publishable` | `false` |

**Hors périmètre du hub** : les 2 fiches à statut « relaxe » douteux (D1), les 3 paires de
doublons (D2), la fiche au patronyme exposé (D6), les 2 sources primaires non admissibles,
les 2 autres sources non datées. Aucun de ces sujets ne bloque le pilote, et le pilote ne les
débloque pas.

**Le seul bloquant qui touche le hub est l'entrée prévue du scénario S2.** Le pilote n'est
pas empêché par ce constat : il est construit autour de lui. Un hub sans défaut ne
calibrerait rien.

**Verdict du préflight : `READY_FOR_MANUAL_PILOT`.**

Détail du croisement : `EVIDENCE_MANIFEST.md` §9.

## 2. Rôles

| Rôle | Qui | Règle |
|---|---|---|
| Producteur | Adrien **ou** Ly | prépare le contenu, revérifie les sources, régénère le payload |
| Validateur | **l'autre** des deux | **le producteur ne valide jamais son propre travail** |
| Approbation opérationnelle | **un seul** des deux valideurs autorisés suffit | pas de double approbation systématique |

**Calibration** : avant tout travail sur l'exécuteur, **chacun des deux** doit avoir réalisé
au moins **une revue complète** en tant que validateur. C'est une condition d'apprentissage,
pas une règle de double signature.

## 3. Les quatre scénarios

Chaque étape consigne : entrée · résultat attendu · `payload_hash` exact · décision ·
preuve conservée.

### S1 — Création

| | |
|---|---|
| Entrée | `node scripts/build-hubs.mjs --draft --hub paris-11e` |
| Attendu | `publishable: false`, 1 bloquant, dossier de revue régénéré |
| Hash | `3a78e3e5368ecdca…` (doit être **identique** tant que `data/cases.json` ne bouge pas) |
| Travail | le producteur ouvre les 9 sources primaires, note pour chacune : accessible ? date confirmée ? statut judiciaire confirmé ? |
| Décision | validateur : `validé` / `à corriger` / `retirer` |
| Preuve | `docs/industrialisation/hub-drafts/paris-11e.md` complété et daté, avec le hash recopié |

> `reviews` n'est pas enregistrable en base tant que `004` n'est pas appliquée (cf. D5).
> **Consigner la revue hors base**, dans le dossier de revue, avec le hash.

### S2 — Rejet puis correction

| | |
|---|---|
| Entrée | le constat bloquant `POC-09` — source France 3 **sans date** |
| Attendu | le validateur **refuse** le hub. C'est le résultat correct, pas un échec du pilote. |
| Travail | retrouver la date de publication de l'article France 3, et chercher l'issue du délibéré du 16/06/2026 |
| Correction | mise à jour en base via `tools/review.html`, puis `sync-data.mjs`, puis régénération |
| Attendu après | **le hash change** ; `R4_source_primaire_sans_date` disparaît du dossier |
| Preuve | ancien hash, nouveau hash, source de la date, source de l'issue |

### S3 — Mise à jour

| | |
|---|---|
| Entrée | l'issue du délibéré Titon trouvée en S2 |
| Attendu | `statut_judiciaire` de `POC-09` évolue ; les **compteurs du hub se recalculent seuls** ; aucun compteur n'est saisi |
| Contrôle | `sum(par_statut) == affaires` dans le dossier de revue |
| Décision | le validateur approuve **le nouveau hash**, jamais « le hub » |
| Preuve | diff des compteurs avant/après, nouveau hash |

### S4 — Correction ou retrait

| | |
|---|---|
| Entrée | `FR-2026-0023` / `PARIS-009` — doublon probable, établissement Faidherbe. C'est la **seule** paire de doublons présente dans ce hub ; les trois autres sont hors périmètre |
| Attendu | trancher `MERGE` ou `KEEP_SEPARATE` (cf. `DECISION_PACK.md` D2). Si `MERGE` : la fiche fusionnée passe en `retirée`, `merged_into` pointe vers la survivante |
| ⚠️ Méthode imposée | **ne pas conclure à partir d'une URL commune ni de coordonnées identiques.** Le corpus contient une URL citée par 5 affaires distinctes, et les coordonnées sont un artefact du géocodage du nom. La seule preuve recevable est ce que l'article dit du **nombre de personnes mises en cause** et du **nombre d'établissements**. Ici les deux fiches ont des sources et des dates **différentes** : les deux doivent être lues. |
| Contrôle en cascade | la correction doit se propager à **tous** les agrégats : carte, hub, compteurs, dans la même opération |
| Vérification | `node scripts/scan-maintenance.mjs` — l'alerte doit apparaître comme **résolue**, et un second passage ne doit créer **aucune** nouvelle alerte |
| Preuve | rapport d'entretien avant/après, décision écrite et motivée |

## 4. Mesures à relever

Utiliser **`UNKNOWN`** plutôt qu'une estimation inventée.

| Mesure | Unité |
|---|---|
| Durée humaine, par scénario | minutes |
| Sources ouvertes et relues | nombre |
| Recherches externes nécessaires | nombre |
| Alertes utiles / alertes rejetées à tort | nombre / nombre |
| Corrections demandées par le validateur | nombre |
| Coût ou tokens, si observable | valeur ou `UNKNOWN` |
| Écarts de jugement entre les deux opérateurs | description |

La dernière ligne est la plus importante : c'est elle qui dit si le contrat éditorial permet
réellement à deux personnes de rendre la même décision — le critère de sortie de la porte 1.

## 5. Arrêt immédiat

Interrompre le pilote et remonter à Adrien si l'un de ces cas survient :

1. **source contradictoire non résolue** — deux sources publiques disent l'inverse et rien ne
   permet de trancher ;
2. **information sensible non nécessaire** — âge, nombre exact d'enfants, élément permettant
   d'identifier une personne par recoupement ;
3. **version différente de celle approuvée** — le `payload_hash` rendu ne correspond pas à
   celui validé ;
4. **doute juridique** — qualification d'une issue, nommage d'un établissement encore au
   stade de la plainte, demande d'une personne concernée.

## 6. Ce que ce pilote ne fait pas

Il **ne publie rien**. Aucune étape ne pousse vers `main`, ne déploie, ni ne rend un hub
accessible publiquement. Le rendu reste un brouillon `noindex` produit par
`npm run build:drafts`.

Après le pilote, la construction de l'exécuteur reste **non autorisée** : elle suppose en
outre la réplication sur trois hubs et deux cycles d'entretien réels.
