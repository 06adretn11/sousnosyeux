# Tuto — Création du projet Supabase `sousnosyeux`

## 1. Créer le projet

1. Aller sur https://supabase.com/dashboard
2. Cliquer **+ New project**
3. Remplir :
   - **Name** : `sousnosyeux`
   - **Database password** : générer un mot de passe fort, **copier dans un gestionnaire de mots de passe** (vous en aurez besoin pour les outils CLI)
   - **Region** : `West EU (Ireland) — eu-west-1` (même région que votre autre projet)
   - **Plan** : Free / NANO suffit pour le MVP (17 lignes, trafic minimal)
4. Cliquer **Create new project** — comptez ~2 minutes de provisionnement

## 2. Récupérer les clés et l'URL

Une fois le projet provisionné, aller dans **Project Settings → API** :

| À copier | Usage |
|---|---|
| `Project URL` (ex. `https://xxxx.supabase.co`) | endpoint API |
| `anon` `public` key | clé lecture publique (utilisée côté front carte) |
| `service_role` key | **SECRET** — admin/import, jamais côté navigateur |

Les sauvegarder dans un `.env.local` (jamais commité) :

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 3. Poser le schéma SQL

1. Dans Supabase, ouvrir **SQL Editor → New query**
2. Coller intégralement le contenu de [supabase/schema.sql](supabase/schema.sql)
3. Cliquer **Run** (en bas à droite)
4. Vérifier que toutes les commandes passent — un message vert "Success. No rows returned." est attendu

Aller ensuite dans **Table Editor** : vous devez voir `cases`, `sources`, `reviews` listées.

## 4. Vérifier les enums

Dans **Database → Enumerated Types**, vérifier que sont créés :
- `type_structure`, `role_mis_en_cause`, `type_affaire`
- `statut_judiciaire`, `statut_des_faits`, `enfants_concernes_public`
- `publication_status`, `source_type`, `review_decision`

## 5. Importer les 17 fiches

Deux options.

### Option A — Script Node (recommandé, idempotent)

À créer plus tard : `scripts/import.mjs` qui lit `data/cases.json` et upsert via le client Supabase + `service_role`. Je peux le générer à la prochaine étape.

### Option B — Import manuel via SQL Editor (rapide pour tester)

Convertir le JSON en `insert` SQL. À ce stade je recommande **d'attendre l'option A** pour garder un import reproductible.

## 6. Tester la vue publique

Dans **SQL Editor** :

```sql
select * from cases_public;
```

Tant que `publication_status` reste à `candidate` (valeur par défaut), la vue renvoie **0 lignes** — c'est le comportement attendu. Une fiche n'apparaît sur la carte qu'après bascule manuelle vers `publiée`.

## 7. Sécurité — checklist avant production

- [ ] RLS activé sur `cases`, `sources`, `reviews` (déjà dans le schéma)
- [ ] Aucune policy SELECT pour le rôle `anon` sur les tables brutes
- [ ] `service_role` key jamais exposée côté front
- [ ] Mot de passe DB stocké dans gestionnaire de mots de passe
- [ ] Région bien sur `eu-west-1` (RGPD)

## 8. Prochaines étapes

Une fois le schéma posé et les clés récupérées, dites-le moi : je génère le script d'import Node.js et on attaque Phase 2.
