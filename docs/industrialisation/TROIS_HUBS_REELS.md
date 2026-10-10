# Trois hubs réels — Paris 11e · Bordeaux/Gironde · Somme

Prévisualisations NON publiées. Source unique : `data/cases.json` (artefact public, 54 fiches, compilé le 2026-10-07 depuis `origin/main`). Aucune écriture Neon, aucune publication, aucun HOLD levé.

## Consulter

```
cd web
SNY_DRAFTS=1 node node_modules/astro/astro.js build     # rendu de revue (jamais déployé)
node node_modules/astro/astro.js preview --port 4323
```

- `/brouillons/territoires` — porte d'entrée
- `/brouillons/territoires/paris-11e`
- `/brouillons/territoires/bordeaux-gironde`
- `/brouillons/territoires/somme`

Le build par défaut (celui de Cloudflare) ne produit AUCUNE de ces pages (vérifié : 3 pages, pas de dossier `brouillons`). Même garde que les brouillons de hub existants.

## Inventaire réel (Neon en lecture + artefact public)

| Territoire | Publiques (artefact) | Hors vue publique |
|---|---|---|
| Paris 11e | 9 fiches / 8 établissements | — |
| Gironde | 1 (Frida-Kahlo, enquête) | 1 sous HOLD, 2 candidates, 1 retirée |
| Somme | 0 | 1 candidate (fiabilité 4) |

## Code

Ajouté : `web/src/lib/territoires.ts`, `components/FicheAffaire.astro`, `components/territoires/{Index,Paris11e,Bordeaux,Somme}.astro`, `pages/brouillons/territoires/[...vue].astro`.
Modifié : `layouts/Layout.astro` (prop optionnelle `noindex`, sans effet par défaut).
Réutilisé : `Layout`, `etat-wording.ts` (même wording que la home), MapLibre/OSM, variables CSS B2.
Duplication assumée : aucune logique métier triplée ; seul le gabarit de chaque vue diffère.
Garde-fous : `casesParIds()` échoue au build si un id est sous HOLD ou absent de l'artefact ; `MEDIAS_PAYANTS` applique la décision « pas de paywall dans les hubs ».
