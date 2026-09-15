# DECISION_PACK — cinq décisions humaines

_15 septembre 2026 · branche `feat/hub-pre-executeur-clean`._

**Aucune donnée réelle n'a été modifiée.** Ce document qualifie ; il ne tranche pas.
Chaque décision est arbitrable en lisant la section correspondante, sans relire le code.

| # | Objet | Recommandation | Confiance |
|---|---|---|---|
| **D1** | 2 fiches étiquetées `relaxe / non-lieu / classement` | **NE PAS retirer** — corriger le statut, qui paraît faux | moyenne |
| **D2** | 3 doublons supposés | **MERGE** pour les 3 · 1 paire supplémentaire en `HUMAN_REVIEW` | élevée |
| **D3** | Clé `service_role` | **Rotation** — comportement dangereux avéré, publication non démontrée | élevée |
| **D4** | Migration 004 | **Appliquer**, avec `PGCLIENTENCODING=UTF8` impérativement épinglé | élevée |
| **D5** | Objet d'une revue | **Revue portant sur une `content_version` immuable** | moyenne |

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

Les trois paires partagent **exactement la même URL de source primaire** — ce n'est pas une
ressemblance de nom, c'est le même article saisi deux fois.

| Paire | Établissement normalisé | Commune | Rôle | Période | Source primaire | Motif du rapprochement | Verdict | Confiance |
|---|---|---|---|---|---|---|---|---|
| `FR-2026-0003` / `PARIS-010` | grands champs | Paris 20e | tiers | 03/2026 | **URL Le Parisien identique** (20/03/2026) | même URL, **coordonnées identiques au 10⁻⁶**, même type, même statut, même généralisation d'enfants | **`MERGE`** | **élevée** |
| `FR-2026-0007` / `PARIS-007` | reuilly | Paris 12e | animateur périscolaire | 09/2025 | **URL 20 Minutes identique** (`4174086-20250919`) | même URL, coordonnées à ~110 m (deux géocodages du même groupe scolaire), variante de graphie « Reuilly II » / « Reuilly » | **`MERGE`** | **élevée** |
| `FR-2026-0008` / `PARIS-008` | boulard | Paris 14e | animateur périscolaire | 03/2026 | **URL Le Parisien identique** (11/03/2026) | même URL, coordonnées à ~60 m, « École Boulard » / « École maternelle Boulard » | **`MERGE`** | **élevée** |

Divergences à trancher au moment de la fusion (elles n'infirment pas le rapprochement, elles
montrent une saisie incohérente du **même** fait) :

- `FR-2026-0007` a `type_structure: maternelle`, `PARIS-007` a `périscolaire` ;
- `FR-2026-0008` a `type_affaire: violences sexuelles`, `PARIS-008` a `mixte` ;
- `FR-2026-0008` porte un libellé de média erroné (voir §D2-bis).

**Paire supplémentaire, non concluante** — `FR-2026-0023` / `PARIS-009`, école Faidherbe
(11e) : coordonnées identiques et même rôle, mais **sources et dates différentes** (20 Minutes
08/12/2025 vs Le Parisien 20/11/2025). La presse décrit deux mis en cause distincts dans le
même établissement. **`HUMAN_REVIEW`**, confiance faible — ne pas fusionner automatiquement.

**Conséquence sur le compteur** : si les 3 fusions sont validées, le corpus publié passe de
**53 à 50**. Cela reste une hypothèse jusqu'à validation.

### D2-bis · Défauts de sourçage révélés en qualifiant D2

| Fiche | Constat | Gravité |
|---|---|---|
| `FR-2026-0026` | Établissement « Collège non nommé », commune « non précisée », **aucune coordonnée**, source primaire = **PDF d'un article Le Parisien réhébergé sur le site d'un cabinet d'avocats**, dont le nom de fichier contient **le patronyme d'une personne**. Cette URL est publiée dans `data/cases.json` et rendue sur le site. | 🔴 vecteur de ré-identification dans un artefact public |
| `FR-2026-0008` | Média saisi « Wikipédia », URL réelle = **radiofrance.fr** (France Culture). Ce n'est pas une source Wikipédia : c'est un **libellé faux**. | 🟠 corrige un constat erroné de la session précédente |
| `PARIS-001` | Reprise MSN ; l'éditeur d'origine **n'a pas pu être identifié** (3 requêtes). | 🟠 `UNKNOWN` |

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
