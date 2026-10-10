# Trois hubs éditoriaux réels — Paris 11e · Bordeaux/Gironde · Somme (v2)

Prévisualisations NON publiées. Aucune écriture Neon, aucune publication, aucun HOLD levé.

## Consulter

```
cd web
SNY_DRAFTS=1 node node_modules/astro/astro.js build     # rendu de revue (jamais déployé)
node node_modules/astro/astro.js preview --port 4323
```

`/brouillons/territoires` · `/paris-11e` · `/bordeaux-gironde` · `/somme`

Le build par défaut (Cloudflare) ne produit aucune de ces pages. `scripts/qa/check-public-surface.mjs`
échoue désormais si un dossier `brouillons` est présent dans `web/dist` (il ne détectait que `hubs/`).

## Données : trois niveaux, une seule forme

| Emplacement | Contenu | Git |
|---|---|---|
| `data/cases.json` | fiches publiques (artefact compilé depuis Neon) | oui |
| `data/hub-matiere/<hub>.json` | matière éditoriale sur affaires PUBLIQUES (déroulé daté, réponses, inconnues) | oui |
| `data/hub-prive/<hub>.json` | matière sur affaires VALIDÉES/CANDIDATES non publiées (Cenon, Somme) | **ignoré** (dépôt public) |

Toute entrée : `{date, date_nature (evenement|approximative|article|inconnue), type, acteur, texte, source{media,url,publie_le,acces}}`.
Seule `evenement` affiche une date comme date d'événement.

## Méthode de constitution (commune aux trois)

1. Inventaire Neon (lecture seule) : fiches, sources, reviews, événements.
2. Recherche web ciblée, par agent, sur les 5 dimensions (affaires, déroulé, réponses institutionnelles, contexte/mobilisation, preuves et inconnues).
3. **Relecture de chaque affirmation retenue sur le texte brut de l'article** (`fetch` + mots-clés), indépendamment de l'agent : plusieurs résumés d'agent ont été corrigés ou écartés.
4. Rédaction attribuée ; inconnues explicites ; ce qui n'a pas pu être relu n'est pas repris.

## Code

Ajouté : `lib/hub-matiere.ts`, `components/{Dossier,Chronologie,Reponses,Synthese,Limites}.astro`.
Réécrits : les trois composants de `components/territoires/`. Modifié : check-public-surface (garde `brouillons`).
