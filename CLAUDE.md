# CLAUDE.md — Contexte projet `sousnosyeux`

> Ce fichier est chargé automatiquement par Claude Code à chaque conversation dans ce dossier. Il sert de mémoire projet. **Mettre à jour à chaque fin de conversation, sur instruction explicite de l'utilisateur.**

---

## 1. Objectif du projet

Carte publique des affaires signalées dans les structures accueillant des mineurs en France (crèches, écoles, périscolaire, etc.). Le projet **relaie** des affaires déjà documentées publiquement par la presse, avec un haut niveau de prudence éditoriale.

**Ce n'est pas** un projet de dénonciation. **C'est** un projet de vigilance citoyenne avec sources, scoring de fiabilité et wording neutre.

## 2. État actuel

- **Phase** : MVP Paris — Phase 3b terminée (site déployé et accessible publiquement)
- **Volume MVP** : 17 affaires, score ≥ 8/10 — **toutes géocodées**
- **Repo GitHub** : https://github.com/06adretn11/sousnosyeux (public)
- **Branche par défaut** : `main`
- **Supabase** : projet `sousnosyeux` (AWS eu-west-1, plan NANO)
  - Schéma SQL appliqué ✅
  - Migration 001 (lat/lng + vue) appliquée ✅
  - Migration 002 (UPDATE coords) appliquée ✅
  - Seed appliqué ✅ (17 cases + 17 sources, basculées en `publiée` pour tests)
- **Domaine** : `sousnosyeux.org` réservé chez OVH ✅
- **DNS** : nameservers migrés vers Cloudflare ✅ (zone gérée côté Cloudflare)
- **Email** : `contact@sousnosyeux.org` via Cloudflare Email Routing → redirige vers email perso utilisateur ✅
- **Hébergement** : Cloudflare Workers (static assets) — build auto à chaque push sur `main` ✅
  - URL publique : `https://sousnosyeux.org` ✅
  - URL worker : `https://sousnosyeux.adr-etn.workers.dev` ✅
  - Redirect `www.sousnosyeux.org` → apex via Cloudflare Redirect Rule (301) ✅
  - SSL automatique Cloudflare ✅
- **Front Astro** : `web/` (Astro 5 + MapLibre 4, tuiles OSM)
  - Layout partagé avec nav Carte / Méthodologie / Mentions légales ✅
  - Carte fonctionnelle avec **17 pins géocodés** (annuaire-éducation, BAN, centroïde commune en fallback) ✅
  - Clustering MapLibre actif (clusterRadius 35, clusterMaxZoom 13) ✅
  - Pins colorés par `statut_des_faits` + légende ✅
  - Popup avec wording standardisé par statut judiciaire + avertissement quand coord approximative ✅
  - `fitBounds` initial sur les 17 affaires ✅
  - Page `/methodologie` (sources, score, wording, principes éditoriaux, géolocalisation) ✅
  - Page `/mentions-legales` (LCEN conforme : éditeur, hébergeur Cloudflare, licences, droit de réponse mailto, signalement art. 6.I.5) ✅
- **Géocodage** : script `scripts/geocode.mjs` en cascade annuaire-éducation → BAN → centroïde commune. Bilan : 14 BAN précision rue, 2 annuaire-éducation précision école, 1 centroïde commune (La Courneuve)

## 3. Décisions verrouillées (NE PAS remettre en cause sans validation explicite)

| Décision | Choix | Raison |
|---|---|---|
| Seuil publication MVP | `fiabilite_info_10 >= 8` | Plus strict que le brief (≥ 7), pour le 1er MVP |
| Stack DB | Supabase eu-west-1 | RGPD, même région qu'autre projet utilisateur |
| Stack front | **Astro + MapLibre** | Bon équilibre simplicité/perf/SEO |
| Hébergement front | Cloudflare Workers (static assets) | 0€, perf, déjà dans la stack, deploy via `wrangler deploy` |
| Deploy command | `npx wrangler deploy` + `wrangler.jsonc` dans `web/` | Nouvelle interface unifiée Workers & Pages de Cloudflare |
| Licence code | **AGPL-3.0** | Copyleft fort, empêche fermeture du fork |
| Licence données | **CC-BY-SA-4.0** | Préserve traçabilité, oblige citation source |
| Visibilité repo | Public | Cohérent avec principe de transparence |
| Directeur de publication | Adrien Etienne (utilisateur) | Relai d'articles uniquement, pas d'écriture en nom propre |
| Domaine | `sousnosyeux.org` (OVH) | `.org` aligné avec nature non-commerciale citoyenne |
| DNS | Cloudflare (NS migrés depuis OVH) | Préparation Cloudflare Pages + Email Routing |
| Email contact | `contact@sousnosyeux.org` via Cloudflare Email Routing | Gratuit, sans serveur SMTP à maintenir, redirige vers email perso |
| Adresse postale (mentions légales) | « communiquée sur demande écrite à contact@... » | Évite d'exposer le domicile, tolérance courante projets citoyens — à revalider en revue juridique phase 4 |
| Droit de réponse | Mailto avec template pré-rempli | Pas de backend, RGPD-friendly, suffisant pour MVP |
| Source de vérité front | `data/cases.json` importé en frontmatter Astro | Statique, pas de fetch runtime, pas de clés Supabase côté client. Bascule sur vue `cases_public` reportée |
| Glyphes MapLibre | `demotiles.maplibre.org` avec `Noto Sans Regular` | Service maintenu par MapLibre, gratuit. ⚠ Si glyphes 404 : ne PAS utiliser `Open Sans Semibold` (non servi) |
| Properties GeoJSON | **Aplaties** (pas d'objet imbriqué) | Supercluster éjecte silencieusement les features avec nested objects → cause de bug de clustering avéré |

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
│   ├── seed.sql             # INSERT idempotent des 17 fiches
│   └── migrations/
│       ├── 001_add_geocoords.sql   # ajoute lat/lng à cases + recrée cases_public
│       └── 002_geocode_data.sql    # UPDATE coords (généré par scripts/geocode.mjs)
├── data/
│   └── cases.json           # 17 fiches normalisées + lat/lng/geocode_source (source de vérité éditoriale)
├── scripts/
│   └── geocode.mjs          # géocodage en cascade annuaire-éducation → BAN → centroïde
├── web/                     # front Astro (Astro 5 + MapLibre 4)
│   ├── wrangler.jsonc         # config Cloudflare Workers (static assets)
│   ├── public/
│   │   └── .assetsignore      # requis par wrangler pour le deploy
│   ├── src/
│   │   ├── layouts/
│   │   │   └── Layout.astro          # header + nav + footer partagés (variant map | page)
│   │   └── pages/
│   │       ├── index.astro           # carte + clustering + légende
│   │       ├── methodologie.astro    # page éditoriale
│   │       └── mentions-legales.astro # page LCEN
│   └── package.json
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

1. **Phase 3 — Front Astro + MapLibre** (quasi terminée)
   - ✅ Init projet Astro dans `web/` (Astro 5 + MapLibre 4)
   - ✅ Itération 1 : carte Paris fonctionnelle, popup, responsive mobile-first
   - ✅ Itération 2 : géocodage 17 fiches (annuaire-éducation + BAN + centroïde commune), pins colorés par statut, clustering, légende
   - ✅ Layout partagé avec navigation Carte / Méthodologie / Mentions légales
   - ✅ Page méthodologie
   - ✅ Page mentions légales (LCEN, droit de réponse mailto)
   - ⏭️ **Améliorer la fiche La Courneuve** (POC-02) — actuellement sur centroïde commune, chercher adresse précise de l'École Charlie-Chaplin
   - ⏭️ Restaurer un dégradé de couleur sur les clusters (actuellement bleu uni)
2. **Phase 3b — Déploiement public** ✅ terminée
   - ✅ Déployer sur Cloudflare Workers (static assets) depuis le repo GitHub
   - ✅ Brancher le domaine `sousnosyeux.org` (custom domain Worker + redirect www→apex)
   - ✅ CI/CD : chaque push sur `main` déclenche un rebuild automatique
   - ⏭️ Bascule éventuelle `cases.json` → vue `cases_public` Supabase (si on veut un refresh sans rebuild)
   - ⏭️ Nettoyage DNS : supprimer les TXT OVH orphelins (`"1|www.sousnosyeux.org"`, `"3|welcome"`)
3. **Phase 4 — Revue juridique + procédures** (critique mais risque modéré à ce stade)
   - ⏭️ Faire relire méthodologie + mentions légales par un avocat presse
   - ⏭️ Trancher sur l'adresse postale (domiciliation vs maintien « sur demande »)
   - ℹ️ **Note de cadrage** : le projet ne fait que relayer des articles de presse et des condamnations officielles — pas de noms, pas de création d'information. Le risque est limité tant qu'on ne crée pas de contenu original. Objectif : standardiser au maximum le retraitement avec citation systématique de la source dans les modales.
4. **Phase 5 — Alimentation de la BDD à grande échelle**
   - ⏭️ Alimenter en volume : saisie manuelle + contribution du public pour faire remonter des affaires
   - ⏭️ Définir un flux simple de traitement : 1 affaire + 2 liens sources = écriture en BDD
   - ⏭️ Process de validation : vérification des infos avant publication dans les modales (scoring fiabilité, wording standardisé)
   - ⏭️ Bascule `cases.json` → vue `cases_public` Supabase (nécessaire pour gérer le volume sans rebuild)
5. **Phase 6 — Design du site**
   - ⏭️ Refonte visuelle : site, carte, modales, légende
   - ⏭️ Dégradé de couleur sur les clusters (actuellement bleu uni)
   - ⏭️ Identité graphique / charte
6. **Phase 7 — Suivi des affaires**
   - ⏭️ Suivre les suites données par les autorités quand les faits sont avérés (condamnations, procédures, moyens mis en œuvre)
   - ⏭️ Établir la stratégie de veille pour récupérer cette information (flux RSS presse, alertes, contributions)
   - ⏭️ Adapter le modèle de données pour historiser les évolutions d'une affaire
7. **Phase 8 — Communication publique** (vient APRÈS les phases 4–7)
   - ⏭️ Partage du lien, réseaux sociaux, prise de contact associations / journalistes

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
