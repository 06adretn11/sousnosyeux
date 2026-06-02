# CLAUDE.md — Contexte projet `sousnosyeux`

> Ce fichier est chargé automatiquement par Claude Code à chaque conversation dans ce dossier. Il sert de mémoire projet. **Mettre à jour à chaque fin de conversation, sur instruction explicite de l'utilisateur.**

---

## 1. Objectif du projet

Carte publique des affaires signalées dans les structures accueillant des mineurs en France (crèches, écoles, périscolaire, etc.). Le projet **relaie** des affaires déjà documentées publiquement par la presse, avec un haut niveau de prudence éditoriale.

**Ce n'est pas** un projet de dénonciation. **C'est** un projet de vigilance citoyenne avec sources, scoring de fiabilité et wording neutre.

## 2. État actuel

- **Phase** : Phase 5 en cours — pipeline d'alimentation en masse opérationnel
- **Volume** : 17 affaires POC + **26 affaires IDF importées** (FR-2026-0001 à FR-2026-0026) = **43 affaires en base**
  - 17 POC publiées (`publiée`) — affichées sur la carte
  - 26 nouvelles en statut `candidate` — en cours de review via `tools/review.html`
  - Review en cours par l'utilisateur (checkboxes scoring, inversion sources, publication)
- **Repo GitHub** : https://github.com/06adretn11/sousnosyeux (public)
- **Branche par défaut** : `main`
- **Supabase** : projet `sousnosyeux` (AWS eu-west-1, plan NANO)
  - Schéma SQL appliqué ✅
  - Migration 001 (lat/lng + vue) appliquée ✅
  - Migration 002 (UPDATE coords) appliquée ✅
  - **Migration 003 appliquée ✅** (colonnes scoring détaillé, trigger auto-calcul, vue enrichie avec sources, table contributions, colonne adresse)
  - Seed appliqué ✅ (17 cases + 17 sources)
  - 26 nouvelles affaires IDF importées via `import-cases.mjs` ✅
  - 42 sources en base (27 initiales + 15 rattrapées via repair-sources.mjs) ✅
- **Domaine** : `sousnosyeux.org` réservé chez OVH ✅
- **DNS** : nameservers migrés vers Cloudflare ✅ (zone gérée côté Cloudflare)
- **Email** : `contact@sousnosyeux.org` via Cloudflare Email Routing → redirige vers email perso utilisateur ✅
- **Hébergement** : Cloudflare Workers (static assets) — build auto à chaque push sur `main` ✅
  - URL publique : `https://sousnosyeux.org` ✅
  - URL worker : `https://sousnosyeux.adr-etn.workers.dev` ✅
  - Redirect `www.sousnosyeux.org` → apex via Cloudflare Redirect Rule (301) ✅
  - SSL automatique Cloudflare ✅
  - ⚠️ **Pas de variables d'environnement possibles** côté Workers static assets → le front lit `data/cases.json` (synchro Supabase → JSON via script local)
- **Front Astro** : `web/` (Astro 5 + MapLibre 4, tuiles OSM)
  - Layout partagé avec nav Carte / Méthodologie / Mentions légales ✅
  - Carte fonctionnelle avec pins géocodés ✅
  - Clustering MapLibre actif (clusterRadius 35, clusterMaxZoom 13) ✅
  - Pins colorés par `statut_des_faits` + légende ✅
  - Popup avec wording standardisé par statut judiciaire + avertissement quand coord approximative ✅
  - `fitBounds` initial sur les affaires ✅
  - Page `/methodologie` + Page `/mentions-legales` ✅
  - **Source de données** : `data/cases.json` importé statiquement (synchro Supabase → JSON via `scripts/sync-data.mjs`)
- **Pipeline d'import** : opérationnel ✅
  - `scripts/import-cases.mjs` : CSV → validation → dédoublonnage → géocodage → INSERT Supabase
  - `scripts/bulk-publish.mjs` : publication en masse des candidates score ≥ 8
  - `scripts/sync-data.mjs` : Supabase → `data/cases.json` (synchro avant push)
  - `scripts/repair-sources.mjs` : rattrapage one-shot des sources avec dates partielles (déjà utilisé)
  - `tools/review.html` : outil local de validation (sources visibles, checkboxes scoring, inversion source primaire, publication 1 clic)
  - `docs/prompt_crawler.md` : prompt pour faire crawler un LLM avec accès web
- **Géocodage** : cascade annuaire-éducation → BAN → centroïde commune, intégré dans `import-cases.mjs`
- **Environnement** : ⚠️ Proxy Cdiscount → nécessite `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"` avant les commandes Node.js qui appellent Supabase

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
| Source de vérité front | `data/cases.json` synchro depuis Supabase via `scripts/sync-data.mjs` | Statique, pas de fetch runtime, pas de clés Supabase côté client. Workers static assets ne supporte pas les env vars → pas de bascule possible vers fetch build-time |
| Pipeline d'import | CSV → `import-cases.mjs` → Supabase → review dans `tools/review.html` → `sync-data.mjs` → push | Workflow testé et opérationnel avec 26 affaires IDF |
| Dédoublonnage | Match sur `etablissement` + `commune` + `role_mis_en_cause` | Permet 2 affaires distinctes au même établissement (ex: Aqueduc — animateur + enseignant) |
| Scoring | 5 critères booléens × 2 pts = fiabilite_info_10, trigger auto-calcul | Checkboxes visibles dans `tools/review.html` avec info contextuelle (nom média, date, etc.) |
| Anti-spam futur | Cloudflare Turnstile | Gratuit, invisible, déjà dans l'écosystème Cloudflare — pour le formulaire de contribution phase 8 |
| Dates partielles CSV | Normalisées en YYYY-MM-DD (`"2026"` → `"2026-01-01"`, `"2026-03"` → `"2026-03-01"`) | Postgres `date` n'accepte que le format complet |
| Proxy entreprise | `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"` avant commandes Node.js | Proxy Cdiscount intercepte le SSL — workaround local uniquement |
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
├── README.md                  # présentation publique
├── CLAUDE.md                  # ce fichier — contexte pour Claude Code
├── LICENSE                    # AGPL-3.0 (code)
├── LICENSE-DATA               # CC-BY-SA-4.0 (données)
├── .gitignore
├── .env.example               # template — utilisateur a son .env.local rempli localement
├── TUTO_SUPABASE.md           # tuto création projet Supabase
├── TUTO_IMPORT.md             # tuto import (seed + import en masse Phase 5)
├── supabase/
│   ├── schema.sql             # tables + enums + RLS + vue publique
│   ├── seed.sql               # INSERT idempotent des 17 fiches POC
│   └── migrations/
│       ├── 001_add_geocoords.sql           # ajoute lat/lng à cases + recrée cases_public
│       ├── 002_geocode_data.sql            # UPDATE coords (généré par scripts/geocode.mjs)
│       └── 003_scoring_columns_and_view.sql # scoring détaillé, trigger, vue enrichie, contributions
├── data/
│   ├── cases.json             # affaires publiées (synchro Supabase → JSON via sync-data.mjs)
│   └── import-batch.csv       # CSV des 34 affaires IDF (input du pipeline)
├── scripts/
│   ├── geocode.mjs            # géocodage en cascade (POC — standalone)
│   ├── import-cases.mjs       # CSV → validation → dédoublonnage → géocodage → INSERT Supabase
│   ├── bulk-publish.mjs       # publication en masse des candidates score ≥ seuil
│   ├── sync-data.mjs          # Supabase → data/cases.json (synchro avant push)
│   └── repair-sources.mjs     # rattrapage one-shot des sources avec dates partielles (déjà utilisé)
├── tools/
│   └── review.html            # outil local de validation (sources, scoring, publication)
├── web/                       # front Astro (Astro 5 + MapLibre 4)
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
    ├── brief_projet.md        # cahier des charges (référence éditoriale)
    ├── mvp_paris_score8plus.md # source des fiches MVP
    └── prompt_crawler.md      # prompt pour LLM crawler (recherche d'affaires)
```

## 7. Modèle de données (résumé)

- Table `cases` : 1 ligne par affaire — `case_id` PK, ENUMs sur les champs catégorisés, `publication_status` contrôle l'affichage map
- Table `sources` : 1+ sources par case (FK `case_id`)
- Table `reviews` : historique de validation éditoriale (à utiliser systématiquement avant bascule vers `publiée`)
- Vue `cases_public` : filtrée `publication_status='publiée' AND fiabilite_info_10 >= 8`, c'est **la seule chose exposée publiquement**

## 8. Prochaines étapes prévues

1. **Phase 5 — Alimentation en masse** (EN COURS)
   - ✅ Pipeline opérationnel : prompt crawler → CSV → import → review → sync → deploy
   - ✅ 26 affaires IDF importées (1er batch), sources rattrapées
   - ✅ Outil de review local (`tools/review.html`) avec scoring, sources, inversion primaire/secondaire
   - 🔄 **Review en cours** : utilisateur valide les 26 candidates dans review.html
   - ⏭️ Après review : `sync-data.mjs` → commit `data/cases.json` → push → rebuild Cloudflare
   - ⏭️ Lancer d'autres tranches crawler (2021–2024, hors IDF) pour atteindre ~250 affaires
   - ⏭️ Améliorer le dédoublonnage (variations de noms d'établissements → fuzzy match ?)
2. **Phase 4 — Revue juridique + procédures** (critique mais risque modéré)
   - ⏭️ Faire relire méthodologie + mentions légales par un avocat presse
   - ⏭️ Trancher sur l'adresse postale (domiciliation vs maintien « sur demande »)
   - ℹ️ **Note** : le projet ne fait que relayer des articles de presse — pas de noms, pas de création d'information. Risque limité.
3. **Phase 6 — Design du site**
   - ⏭️ Refonte visuelle : site, carte, modales, légende
   - ⏭️ Dégradé de couleur sur les clusters (actuellement bleu uni)
   - ⏭️ Identité graphique / charte
4. **Phase 7 — Suivi des affaires**
   - ⏭️ Historiser les évolutions (condamnations, procédures)
   - ⏭️ Veille : flux RSS, alertes, contributions
   - ⏭️ Adapter le modèle de données
5. **Phase 8 — Communication publique** (vient APRÈS les phases 4–7)
   - ⏭️ Partage du lien, réseaux sociaux, prise de contact associations / journalistes
   - ⏭️ Formulaire de contribution public (Turnstile anti-spam)

### Tâches techniques en attente (toutes phases)
- ⏭️ Améliorer la fiche La Courneuve (POC-02) — centroïde commune → adresse précise
- ⏭️ Nettoyage DNS : supprimer les TXT OVH orphelins
- ⏭️ Commit + push de tous les nouveaux fichiers Phase 5 (scripts, tools, data, migrations, docs)

## 9. Fiches exclues du MVP (à renforcer plus tard)

3 fiches à 7/10 stockées dans `docs/mvp_paris_score8plus.md` mais **non importées en base** :
- PARIS-002 (Vigée-Lebrun, Paris 15e)
- PARIS-003 (Aqueduc, Paris 10e) — ⚠️ attention : une affaire Aqueduc avec rôle différent existe déjà via le batch IDF
- PARIS-005 (Rochechouart, Paris 9e)

Action future : ajouter une seconde source pour chacune → monter à 8/10 → importer.

⚠️ **Doublons à surveiller** : le dédoublonnage match exact sur `etablissement + commune + role_mis_en_cause`. Les variations de noms (ex: « École Charlie-Chaplin » vs « École maternelle Charlie-Chaplin ») ne sont pas détectées automatiquement → vérifier manuellement dans review.html.

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
