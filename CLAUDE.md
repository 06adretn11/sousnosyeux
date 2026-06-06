# CLAUDE.md — Contexte projet `sousnosyeux`

> Ce fichier est chargé automatiquement par Claude Code à chaque conversation dans ce dossier. Il sert de mémoire projet. **Mettre à jour à chaque fin de conversation, sur instruction explicite de l'utilisateur.**

---

## 1. Objectif du projet

Carte publique des affaires signalées dans les structures accueillant des mineurs en France (crèches, écoles, périscolaire, etc.). Le projet **relaie** des affaires déjà documentées publiquement par la presse, avec un haut niveau de prudence éditoriale.

**Ce n'est pas** un projet de dénonciation. **C'est** un projet de vigilance citoyenne avec sources, scoring de fiabilité et wording neutre.

## 2. État actuel

- **Phase** : Phase 5 terminée · Phase 5b terminée · **Phase 6 (design) terminée → V0 déployée en prod**
- **Volume** : 17 POC + 26 IDF + 21 hors-IDF = **64 affaires en base**, dont **53 publiées**
  - 53 publiées (`publiée`) — affichées sur la carte
  - 11 rejetées après review
- **Repo GitHub** : https://github.com/06adretn11/sousnosyeux (public)
- **Branche par défaut** : `main`
- **Supabase** : projet `sousnosyeux` (AWS eu-west-1, plan NANO)
  - Schéma SQL appliqué ✅
  - Migration 001 (lat/lng + vue) appliquée ✅
  - Migration 002 (UPDATE coords) appliquée ✅
  - **Migration 003 appliquée ✅** (colonnes scoring détaillé, trigger auto-calcul, vue enrichie avec sources, table contributions, colonne adresse)
  - Seed appliqué ✅ (17 cases + 17 sources)
  - 26 affaires IDF importées via `import-cases.mjs` ✅
  - 21 affaires hors-IDF importées (batch 2) ✅
  - Sources en base : ~110+ (automatiques + rattrapées via repair-sources.mjs) ✅
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
  - **Design B2 implémenté** (Phase 6) ✅ — direction "Éditorial sobre + lanceur d'alerte"
  - Polices : DM Sans (UI) + DM Mono (chiffres/codes) + Playfair Display (titres)
  - Palette : rouge `#E63946` · bleu `#457B9D` · vert `#2D6A4F` · orange `#D97706`
  - Header blanc compact : logo avec barre rouge, nav, bouton "Nous contacter" (rouge) · "Mentions légales" masqué sur mobile
  - Bande info compacte (1 ligne) : compteur affaires + tagline + lien méthodologie
  - Toolbar filtres sticky (Tous / Condamné / En cours / Allégué / Classé) — filtre carte ET sidebar simultanément
  - Carte centrée France métropolitaine (`fitBounds` filtré sur bornes FR lat 41–52 / lng -6–10)
  - Clustering réduit : `clusterRadius 15`, `clusterMaxZoom 11` — pins individuels visibles dès zoom 12
  - Pins colorés par catégorie `statut_judiciaire` ✅
  - Popup partagée `openPopupForCase()` — déclenchée depuis pin ET depuis sidebar, avec pan automatique
  - Sidebar statique scrollable : liste affaires par date, barre colorée, badge statut, clic → zoom + popup
  - Footer sombre avec liens légaux
  - Page `/methodologie` + Page `/mentions-legales` ✅
  - **Source de données** : `data/cases.json` importé statiquement (synchro Supabase → JSON via `scripts/sync-data.mjs`)
- **Pipeline d'import** : opérationnel ✅
  - `scripts/import-cases.mjs` : CSV → validation → dédoublonnage → géocodage → INSERT Supabase
  - `scripts/bulk-publish.mjs` : publication en masse des candidates score ≥ 8
  - `scripts/sync-data.mjs` : Supabase → `data/cases.json` (synchro avant push)
  - `scripts/repair-sources.mjs` : rattrapage one-shot des sources avec dates partielles (déjà utilisé)
  - `scripts/article-server.mjs` : serveur local d'analyse d'articles (HTTP localhost:3456)
    - Fetch HTML → extraction texte → analyse LLM (Claude API) ou mots-clés
  - `scripts/watch-updates.mjs` : veille automatique sur les affaires publiées ✅
    - Google News RSS → filtrage doublons → détection d'évolution par titre → rapport JSON
    - Usage : `node scripts/watch-updates.mjs` (options: `--limit N`, `--case ID`, `--dry-run`)
    - Rapport : `data/watch-report.json` (gitignored)
    - Propose des mises à jour de statut judiciaire, type d'affaire, résumé
    - Nécessite `ANTHROPIC_API_KEY` dans `.env.local` pour le mode LLM (optionnel)
  - `tools/review.html` : outil local de validation (sources, scoring, analyse d'articles, publication 1 clic)
    - Bouton "analyser" par source → appelle article-server → affiche suggestions avec "appliquer"
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
| Analyse d'articles | Serveur local Node.js (localhost:3456) + Claude API | LLM pour extraction structurée (statut, type, résumé) ; mots-clés en fallback sans clé API |
| Coût API analyse | Acceptable (~0,01€/article, négligeable à 200 affaires) | Clé personnelle Anthropic Console — séparée du compte Claude Code entreprise |
| Veille statuts | Script local lancé manuellement → scheduled agent si ça marche | Évite la conso tokens Claude Code ; l'agent appelle juste le script |
| Collaboration review | Partage du fichier `tools/review.html` + credentials Supabase de vive voix | Option rapide validée ; passer à RLS + auth Supabase si collaboration régulière |
| Source recherche veille | Google News RSS (gratuit, sans clé API) | Suffisant pour ~200 affaires, pas de rate limit observé |
| Détection évolution | Analyse des titres (mots-clés forward-only) | Les URLs Google News sont des redirections opaques (consent GDPR), impossible de fetcher le contenu côté serveur |
| Scheduling veille | Exécution manuelle 1×/mois (rappel calendrier) | Routine distante bloquée par compte Business Cdiscount — revoir quand accès GitHub autorisé côté org |
| Direction design | **B2 "Éditorial"** — DM Sans + DM Mono + Playfair Display, palette rouge/bleu/vert/orange | 3 directions A/B/C maquettées, 3 variations B1/B2/B3 affinées, B2 validé par l'utilisateur |
| Clustering carte | `clusterRadius 15`, `clusterMaxZoom 11` | Pins individuels visibles dès zoom 12 (niveau département) — validé Phase 6 |
| Centre initial carte | `fitBounds` filtré sur bornes France (lat 41–52, lng -6–10) | Évite les points mal géocodés qui élargissaient la vue hors France |
| CTA "Nous contacter" | Bouton rouge dans le header (nav) | Suppression du bandeau CTA rouge pleine largeur — intégré dans le header |

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
│   ├── import-batch.csv       # CSV des 34 affaires IDF (input du pipeline)
│   └── import-batch-hdf.csv   # CSV des 21 affaires hors-IDF (batch 2)
├── scripts/
│   ├── geocode.mjs            # géocodage en cascade (POC — standalone)
│   ├── import-cases.mjs       # CSV → validation → dédoublonnage → géocodage → INSERT Supabase
│   ├── bulk-publish.mjs       # publication en masse des candidates score ≥ seuil
│   ├── sync-data.mjs          # Supabase → data/cases.json (synchro avant push)
│   ├── repair-sources.mjs     # rattrapage one-shot des sources avec dates partielles (déjà utilisé)
│   ├── article-server.mjs     # serveur local d'analyse d'articles (port 3456)
│   └── watch-updates.mjs      # veille automatique Google News RSS → watch-report.json
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

1. **Phase 5 — Alimentation en masse** (TERMINÉE)
   - ✅ Pipeline opérationnel : prompt crawler → CSV → import → review → sync → deploy
   - ✅ 26 affaires IDF importées (batch 1), 21 hors-IDF (batch 2)
   - ✅ 53 affaires publiées, 11 rejetées après review
   - ✅ Outil de review local (`tools/review.html`) avec scoring, sources, analyse d'articles
   - ⏭️ Lancer d'autres tranches crawler (2021–2024, autres régions) pour atteindre ~250 affaires
   - ⏭️ Améliorer le dédoublonnage (variations de noms d'établissements → fuzzy match ?)
2. **Phase 5b — Analyse d'articles + veille** (TERMINÉE)
   - ✅ `scripts/article-server.mjs` : serveur local d'analyse (fetch + extraction texte + LLM)
   - ✅ Intégration dans `review.html` : bouton "analyser" par source, suggestions avec "appliquer"
   - ✅ Mode mots-clés (sans clé API) fonctionnel — utilisé pour la 1ère passe manuelle
   - ✅ **Phase 5b-A** : 1ère passe manuelle terminée
   - ✅ **Phase 5b-B** : `scripts/watch-updates.mjs` — veille automatique via Google News RSS
     - Détection d'évolution par analyse des titres (forward-only : ignore les statuts antérieurs)
     - Gratuit (pas de clé API), ~2 min pour 53 affaires
     - Routine distante créée (`trig_01D91SxNpG2egWBhE1c4soUC`) mais bloquée par compte Business Cdiscount → exécution manuelle 1×/mois en attendant
3. **Phase 4 — Revue juridique + procédures** (critique mais risque modéré)
   - ⏭️ Faire relire méthodologie + mentions légales par un avocat presse
   - ⏭️ Trancher sur l'adresse postale (domiciliation vs maintien « sur demande »)
   - ℹ️ **Note** : le projet ne fait que relayer des articles de presse — pas de noms, pas de création d'information. Risque limité.
4. **Phase 6 — Design du site** (TERMINÉE)
   - ✅ 3 directions visuelles maquettées (A Sobre/Institutionnel, B Terrain/Alerte, C Citoyen/Humain)
   - ✅ Direction B2 "Éditorial" choisie et implémentée
   - ✅ 3 variations B1/B2/B3 maquettées pour affiner
   - ✅ Déployée en prod sur sousnosyeux.org (commit 6bb51c7)
   - ⏭️ Feedbacks prod à intégrer (tests en cours)
   - ⏭️ Dégradé de couleur sur les clusters selon statut majoritaire
   - ⏭️ Identité graphique / charte complète (favicon, og:image…)
5. **Phase 7 — Suivi des affaires + réactions publiques**
   - ⏭️ Historiser les évolutions (condamnations, procédures)
   - ⏭️ Section « réactions/décisions des services publics » par affaire (nouveau champ modèle)
   - ⏭️ Adapter le modèle de données
6. **Phase 8 — Communication publique + contributions** (vient APRÈS les phases 4–7)
   - ⏭️ Partage du lien, réseaux sociaux, prise de contact associations / journalistes
   - ⏭️ Formulaire de contribution public (Turnstile anti-spam)
   - ⏭️ Section « parole aux parents/associations » — témoignages liés à une affaire

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
