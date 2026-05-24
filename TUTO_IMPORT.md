# Tuto — Import des 17 fiches dans Supabase

## Prérequis

- Schéma déjà posé via [supabase/schema.sql](supabase/schema.sql) ✅ (enums vérifiés)
- Vous êtes dans l'interface Supabase, projet `sousnosyeux`

## Méthode recommandée — SQL Editor

Plus simple que d'écrire un script Node pour 17 lignes. Pas de Node, pas de clés à manipuler.

### Étape 1 — Ouvrir le SQL Editor

Menu de gauche → **SQL Editor** → **+ New query**.

### Étape 2 — Coller le seed

1. Ouvrir [supabase/seed.sql](supabase/seed.sql)
2. **Tout sélectionner** (Ctrl+A) → **Copier** (Ctrl+C)
3. Coller dans le SQL Editor Supabase
4. Cliquer **Run** (bouton en bas à droite, ou Ctrl+Entrée)

### Étape 3 — Lire les résultats

Le script termine par 3 requêtes de vérification. Dans le panneau **Results** vous devez voir :

| Vérification | Valeur attendue |
|---|---|
| `nb_cases` | **17** |
| `nb_sources` | **17** |
| Liste des `case_id` | POC-02 → PARIS-011 (17 lignes), toutes en `candidate` |

Si vous voyez ces 3 résultats : import OK.

### Étape 4 — Inspecter dans le Table Editor

Menu de gauche → **Table Editor** → cliquer sur `cases` : vous devez voir les 17 lignes.

### Étape 5 — Tester la vue publique

Retourner dans **SQL Editor** et lancer :

```sql
select * from cases_public;
```

**Attendu : 0 ligne.** C'est normal — la vue ne renvoie que les fiches `publication_status = 'publiée'`. Au départ toutes les fiches sont en `candidate` → invisibles côté public. Vous basculerez les fiches vers `publiée` après revue juridique, une par une :

```sql
update cases set publication_status = 'publiée' where case_id = 'POC-07';
```

## En cas d'erreur

| Erreur | Cause | Solution |
|---|---|---|
| `invalid input value for enum ...` | enum non créé ou valeur fautive | re-jouer [schema.sql](supabase/schema.sql) |
| `relation "cases" does not exist` | schéma pas appliqué | jouer [schema.sql](supabase/schema.sql) d'abord |
| `duplicate key value violates unique constraint` | déjà importé | le script est idempotent (ON CONFLICT) → re-jouer écrase, c'est OK |

## Script idempotent

Le seed peut être re-joué sans risque :
- `cases` : `ON CONFLICT DO UPDATE` → rafraîchit les champs
- `sources` : `DELETE` préalable des sources des 17 cases puis `INSERT` → toujours propre

C'est utile quand vous corrigerez une typo ou modifierez une catégorisation.
