# CLAUDE.md — Contexte projet `sousnosyeux`

> Ce fichier est chargé automatiquement par Claude Code à chaque conversation dans ce dossier. Il sert de mémoire projet. **Mettre à jour à chaque fin de conversation, sur instruction explicite de l'utilisateur.**

---

## 1. Objectif du projet

Carte publique des affaires signalées dans les structures accueillant des mineurs en France (crèches, écoles, périscolaire, etc.). Le projet **relaie** des affaires déjà documentées publiquement par la presse, avec un haut niveau de prudence éditoriale.

**Ce n'est pas** un projet de dénonciation. **C'est** un projet de vigilance citoyenne avec sources, scoring de fiabilité et wording neutre.

## 2. État actuel

- **Phase** : MVP Paris — Phase 3 en cours (front), itération 1 livrée
- **Volume MVP** : 17 affaires, score ≥ 8/10
- **Repo GitHub** : https://github.com/06adretn11/sousnosyeux (public)
- **Branche par défaut** : `main`
- **Supabase** : projet `sousnosyeux` (AWS eu-west-1, plan NANO)
- **Schéma SQL appliqué** ✅
- **Seed appliqué** ✅ (17 cases + 17 sources, toutes en `candidate` — basculées en `publiée` pour tests)
- **Front Astro initialisé** ✅ (`web/`, Astro 5 + MapLibre 4, tuiles OSM)
- **Carte Paris fonctionnelle** ✅ (1 pin démo École Émeriau, popup avec wording standardisé par statut judiciaire, responsive mobile-first validé sur plusieurs devices)

## 3. Décisions verrouillées (NE PAS remettre en cause sans validation explicite)

| Décision | Choix | Raison |
|---|---|---|
| Seuil publication MVP | `fiabilite_info_10 >= 8` | Plus strict que le brief (≥ 7), pour le 1er MVP |
| Stack DB | Supabase eu-west-1 | RGPD, même région qu'autre projet utilisateur |
| Stack front | **Astro + MapLibre** | Bon équilibre simplicité/perf/SEO |
| Hébergement front | Cloudflare Pages | 0€, perf, déjà dans la stack |
| Licence code | **AGPL-3.0** | Copyleft fort, empêche fermeture du fork |
| Licence données | **CC-BY-SA-4.0** | Préserve traçabilité, oblige citation source |
| Visibilité repo | Public | Cohérent avec principe de transparence |
| Directeur de publication | Adrien Etienne (utilisateur) | Relai d'articles uniquement, pas d'écriture en nom propre |

## 4. Principes éditoriaux NON-NÉGOCIABLES

- ✋ **Jamais** publier le nom de la personne mise en cause
- ✋ **Jamais** publier le nombre exact d'enfants (utiliser `1 enfant` / `plusieurs enfants` / `non précisé`)
- ✋ **Jamais** de détails graphiques
- ✋ **Jamais** d'affirmation en nom propre — toujours « une source publique rapporte que… »
- ✅ Respect strict de la présomption d'innocence
- ✅ Wording standardisé selon `statut_judiciaire` (cf. brief §9)
- ✅ Distinguer toujours : allégué / plainte / enquête / mise en examen / procès / condamnation non-déf / condamnation déf / relaxe

## 5. Sécurité / Git

- ❌ **Jamais** commiter `.env.local`, `.env`, clés Supabase, mot de passe DB
- ✅ Toujours vérifier `git check-ignore -v <fichier>` en cas de doute
- ✅ `.gitignore` en place exclut `.env*`, `node_modules/`, `dist/`, `.next/`, etc.
- La clé `service_role` Supabase ne doit **jamais** apparaître côté navigateur (uniquement scripts admin/import)

## 6. Carte du repo

```
sousnosyeux/
├── README.md                # présentation publique
├── CLAUDE.md                # ce fichier — contexte pour Claude Code
├── LICENSE                  # AGPL-3.0 (code)
├── LICENSE-DATA             # CC-BY-SA-4.0 (données)
├── .gitignore
├── .env.example             # template — utilisateur a son .env.local rempli localement
├── TUTO_SUPABASE.md         # tuto création projet Supabase
├── TUTO_IMPORT.md           # tuto import seed
├── supabase/
│   ├── schema.sql           # tables + enums + RLS + vue publique
│   └── seed.sql             # INSERT idempotent des 17 fiches
├── data/
│   └── cases.json           # 17 fiches normalisées (source de vérité éditoriale)
└── docs/
    ├── brief_projet.md      # cahier des charges (référence éditoriale)
    └── mvp_paris_score8plus.md # source des fiches MVP
```

## 7. Modèle de données (résumé)

- Table `cases` : 1 ligne par affaire — `case_id` PK, ENUMs sur les champs catégorisés, `publication_status` contrôle l'affichage map
- Table `sources` : 1+ sources par case (FK `case_id`)
- Table `reviews` : historique de validation éditoriale (à utiliser systématiquement avant bascule vers `publiée`)
- Vue `cases_public` : filtrée `publication_status='publiée' AND fiabilite_info_10 >= 8`, c'est **la seule chose exposée publiquement**

## 8. Prochaines étapes prévues

1. **Phase 3 — Front Astro + MapLibre** (en cours)
   - ✅ Init projet Astro dans `web/` (Astro 5 + MapLibre 4)
   - ✅ Page d'accueil avec carte Paris (MapLibre + tuiles OSM), 1 pin démo
   - ✅ Popup avec wording standardisé par statut judiciaire
   - ✅ Responsive mobile-first (100dvh, safe-areas iOS, tap targets 44px, popup adaptative)
   - ⏭️ **Itération 2** : géocodage des 17 fiches (BAN, gratuit) + ajout `lat`/`lng` au schéma + affichage des 17 pins
   - ⏭️ Pins colorés selon `statut_des_faits` (allégué vs condamnation déf.) + légende
   - ⏭️ Clustering quand on aura les 17 pins (chevauchements probables 9e–18e)
   - ⏭️ Page méthodologie (expliquer le score de fiabilité, le wording, la présomption d'innocence)
   - ⏭️ Page mentions légales + formulaire de droit de réponse
   - ⏭️ Déploiement Cloudflare Pages
2. **Phase 4 — Revue juridique + procédures**
3. **Phase 5 — Mise en ligne POC publique**

## 9. Fiches exclues du MVP (à renforcer plus tard)

3 fiches à 7/10 stockées dans `docs/mvp_paris_score8plus.md` mais **non importées en base** :
- PARIS-002 (Vigée-Lebrun, Paris 15e)
- PARIS-003 (Aqueduc, Paris 10e)
- PARIS-005 (Rochechouart, Paris 9e)

Action future : ajouter une seconde source pour chacune → monter à 8/10 → importer.

## 10. Préférences utilisateur

- **Langue** : français
- **Style de réponse** : concis, structuré, options comparées avec pros/cons quand décision à prendre
- **Profil tech** : pas développeur expert — expliquer les concepts (licences, RLS, etc.) quand pertinent
- **Workflow** : tutos pas-à-pas pour les opérations côté UI (Supabase, GitHub) que Claude ne peut pas faire à sa place

## 11. Maintenance de ce fichier

À chaque **fin de conversation**, si l'utilisateur donne le **go explicite** :
1. Mettre à jour la section "État actuel" (§2)
2. Ajouter toute décision nouvelle dans §3
3. Mettre à jour "Prochaines étapes" (§8)
4. Committer avec un message du type : `chore: update CLAUDE.md — <résumé de la session>`
5. Pousser sur `main`

Ne **jamais** modifier ce fichier sans le go explicite de l'utilisateur.
