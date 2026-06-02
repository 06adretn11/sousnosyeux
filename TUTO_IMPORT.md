# Tuto — Import des affaires dans Supabase

## Partie A — Import initial (17 fiches MVP, déjà fait)

### Prérequis

- Schéma déjà posé via [supabase/schema.sql](supabase/schema.sql) ✅ (enums vérifiés)
- Vous êtes dans l'interface Supabase, projet `sousnosyeux`

### Méthode recommandée — SQL Editor

Plus simple que d'écrire un script Node pour 17 lignes. Pas de Node, pas de clés à manipuler.

1. Menu de gauche → **SQL Editor** → **+ New query**
2. Ouvrir [supabase/seed.sql](supabase/seed.sql) → **Tout sélectionner** → **Copier** → **Coller** → **Run**
3. Vérifier : `nb_cases` = 17, `nb_sources` = 17
4. Table Editor → `cases` : 17 lignes visibles
5. `select * from cases_public;` → 0 ligne (normal, tout est en `candidate`)

### Script idempotent

Le seed peut être re-joué sans risque (`ON CONFLICT DO UPDATE`).

---

## Partie B — Import en masse (Phase 5)

### Prérequis

- Node.js 20+
- Fichier `.env.local` avec `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
- **Migration 003 appliquée** (voir ci-dessous)

### Étape 0 — Appliquer la migration 003

Dans le **SQL Editor** du dashboard Supabase, coller et exécuter :

```
supabase/migrations/003_scoring_columns_and_view.sql
```

Cela ajoute :
- 5 colonnes de scoring (checkboxes dans le Table Editor)
- Le trigger d'auto-calcul du score
- La vue enrichie `cases_public` (avec lat/lng + source primaire)
- La table `contributions` (pour le futur formulaire public)

### Étape 1 — Préparer le CSV

1. Lancer le prompt de `docs/prompt_crawler.md` dans un LLM avec accès web
2. Consolider les résultats dans `data/import-batch.csv`
3. Colonnes attendues :

```
etablissement,commune,departement,adresse,type_structure,role_mis_en_cause,type_affaire,statut_judiciaire,statut_des_faits,enfants,url1,media1,date1,url2,media2,date2,resume_faits
```

4. Conseil : ouvrir le CSV dans un tableur pour corriger les valeurs d'enum avant import

#### Valeurs d'enum valides

| Champ | Valeurs |
|---|---|
| type_structure | crèche, maternelle, élémentaire, collège, lycée, périscolaire, centre de loisirs, internat, autre |
| role_mis_en_cause | enseignant, animateur périscolaire, ATSEM, direction, personnel de crèche, parent, tiers, intervenant extérieur, autre |
| type_affaire | viol, agression sexuelle, atteinte sexuelle, images pédocriminelles, violences sexuelles, mixte, à qualifier |
| statut_judiciaire | plainte, enquête, mise en examen, procès, condamnation non définitive, condamnation définitive, relaxe / non-lieu / classement, à qualifier |
| statut_des_faits | allégué, retenu par jugement non définitif, établi judiciairement, non établi, mixte |
| enfants | 1 enfant, plusieurs enfants, non précisé |

### Étape 2 — Dry-run (validation sans insertion)

```bash
node --env-file=.env.local scripts/import-cases.mjs --dry-run
```

Vérifie : erreurs de validation, doublons, géocodage, scoring auto.

### Étape 3 — Import réel

```bash
node --env-file=.env.local scripts/import-cases.mjs
```

Les fiches arrivent en statut **`candidate`** dans Supabase.

### Étape 4 — Validation dans le dashboard Supabase

1. **Table Editor** → table `cases` → filtrer `publication_status = candidate`
2. Pour chaque fiche, vérifier les 5 checkboxes :
   - ☑️ `crit_source_fiable` — source identifiable et fiable ?
   - ☑️ `crit_article_recent` — article récent (< 2 ans) ?
   - ☑️ `crit_etablissement_nomme` — établissement nommé ?
   - ☑️ `crit_statut_clair` — statut judiciaire clair ?
   - ☑️ `crit_recoupement` — 2e source ou source institutionnelle ?
3. Le score `fiabilite_info_10` se **recalcule automatiquement** via trigger
4. Si score ≥ 8 et tout OK → changer `publication_status` en **`publiée`**

#### Publication en masse

```bash
node --env-file=.env.local scripts/bulk-publish.mjs --dry-run   # aperçu
node --env-file=.env.local scripts/bulk-publish.mjs              # publication
```

### Étape 5 — Synchroniser vers le JSON et déployer

Le site lit `data/cases.json` au build (pas de fetch Supabase côté Cloudflare).
Il faut donc synchroniser la base vers le JSON, puis push :

```bash
# 1. Synchro Supabase → JSON
node --env-file=.env.local scripts/sync-data.mjs

# 2. Commit + push → rebuild automatique Cloudflare
git add data/cases.json
git commit -m "data: sync N affaires depuis Supabase"
git push
```

Aucune configuration côté Cloudflare n'est nécessaire — tout se fait localement avec `.env.local`.
