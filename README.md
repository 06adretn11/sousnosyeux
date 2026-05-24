# sousnosyeux

Carte publique des affaires signalées dans les structures accueillant des mineurs en France.

> **Note éditoriale.** Ce projet relaie des affaires publiquement documentées par la presse. Les statuts judiciaires doivent être lus avec prudence : une plainte, une enquête, une garde à vue, une suspension ou une mise en examen ne valent pas culpabilité. La carte ne désigne pas des établissements comme « dangereux » — elle rend visibles des affaires déjà documentées publiquement, avec source, statut et datation.

## État du projet

- **Phase** : MVP Paris
- **Volume MVP** : 17 affaires (score ≥ 8/10)
- **Stack** : Supabase (eu-west-1) · Cloudflare · OVH · GitHub
- **Statut** : infrastructure en cours de provisionnement

## Structure du dépôt

```
sousnosyeux/
├── README.md                     # ce fichier
├── TUTO_SUPABASE.md              # tuto création projet Supabase
├── supabase/
│   └── schema.sql                # schéma DB (tables + enums + RLS + vue publique)
├── data/
│   └── cases.json                # 17 fiches MVP normalisées
└── docs/
    ├── brief_projet.md           # cahier des charges
    └── mvp_paris_score8plus.md   # source des fiches
```

## Démarrage

1. Lire [docs/brief_projet.md](docs/brief_projet.md) pour le cadrage éditorial.
2. Suivre [TUTO_SUPABASE.md](TUTO_SUPABASE.md) pour provisionner la base.
3. Importer [data/cases.json](data/cases.json) via le script (à venir).

## Principes éditoriaux

- Respect strict de la présomption d'innocence
- Nom de la personne mise en cause **jamais** publié
- Nombre exact d'enfants **jamais** publié (`1 enfant` / `plusieurs enfants` / `non précisé`)
- Aucun détail graphique
- Wording standardisé selon statut judiciaire
- Procédure de correction et droit de réponse documentée

## Licences

Ce projet utilise deux licences distinctes :

- **Code** (schema SQL, scripts, futur front) : [GNU AGPL-3.0](LICENSE)
  Toute personne qui héberge un fork modifié doit republier ses modifications sous la même licence. Empêche la fermeture du code par un tiers.

- **Données** (`data/cases.json`, contenu éditorial des fiches) : [Creative Commons BY-SA-4.0](LICENSE-DATA)
  Réutilisation libre à condition de **citer la source** (`sousnosyeux`) et de **redistribuer les modifications sous la même licence**. Préserve la traçabilité éditoriale.

Ce choix copyleft reflète la nature de vigilance citoyenne du projet : ouverture maximale + impossibilité de privatiser le travail ou d'en effacer l'origine.
