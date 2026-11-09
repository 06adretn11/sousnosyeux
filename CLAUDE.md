# CLAUDE.md — Contexte projet `sousnosyeux`

> Ce fichier est chargé automatiquement par Claude Code à chaque conversation dans ce dossier. Il sert de mémoire projet. **Mettre à jour à chaque fin de conversation, sur instruction explicite de l'utilisateur.**

---

## 1. Objectif du projet

Carte publique des affaires signalées dans les structures accueillant des mineurs en France (crèches, écoles, périscolaire, etc.). Le projet **relaie** des affaires déjà documentées publiquement par la presse, avec un haut niveau de prudence éditoriale.

**Ce n'est pas** un projet de dénonciation. **C'est** un projet de vigilance citoyenne avec sources, scoring de fiabilité et wording neutre.

**Porté par** : Adrien Etienne & Ly Nguyen — deux parents parisiens d'un garçon de 18 mois, motivés par l'absence de mémoire collective autour des affaires dans les structures accueillant des mineurs à Paris.

## 2. État actuel

- **Phase** : Phase 5 terminée · Phase 5b terminée · Phase 6 (design) terminée · **fiches individuelles + 4 Hubs pilotes en production · lot de correction groupée du 01/11/2026 livré et vérifié (02/11/2026)** · prochaine priorité : première diffusion ciblée pour recueillir des retours de parents
- **Mémoire de référence (état au 02/11/2026)** : **Neon** (Postgres) — c'est lui qui alimente `data/cases.json` (`scripts/project-public.mjs`) et `data/evenements.json` (`scripts/project-evenements.mjs`). **Supabase n'est plus utilisé** ; tout ce qui le concerne plus bas est historique (import initial de 2026). Les identifiants de Neon, de Telegram et d'OpenRouter sont des secrets GitHub (et `.env.local` en local) — jamais dans le dépôt.
- **Volume au 02/11/2026** : **159 affaires en base** — 65 `publiée`, 76 `candidate`, 18 `retirée`
  - **62 cartes projetées** sur la carte (`data/cases.json`, 230 sources) ; **61 affichées** (FR-2026-0026 n'a pas de coordonnées, donc pas de point)
  - Les 3 `publiée` non projetées : FR-2026-0048 et FR-2026-0049 (sous HOLD) et PARIS-011 (fiabilité 4, sous le seuil de 8)
  - **58 fiches individuelles approuvées et servies** (`/affaires/<id>/`)
  - Répartition des 62 cartes par état : condamnation non définitive 16 · enquête 10 · mise en examen 21 · plainte 5 · à qualifier 3 · relaxe / non-lieu / classement 4 · procès 3
- **Repo GitHub** : https://github.com/06adretn11/sousnosyeux (public)
- **Branche par défaut** : `main`
- **Supabase (historique)** : projet `sousnosyeux` (AWS eu-west-1, plan NANO)
  - Schéma SQL appliqué ✅
  - Migration 001 (lat/lng + vue) appliquée ✅
  - Migration 002 (UPDATE coords) appliquée ✅
  - **Migration 003 appliquée ✅** (colonnes scoring détaillé, trigger auto-calcul, vue enrichie avec sources, table contributions, colonne adresse)
  - Seed appliqué ✅ (17 cases + 17 sources)
  - 26 affaires IDF importées via `import-cases.mjs` ✅
  - 21 affaires hors-IDF importées (batch 2) ✅
  - **Session juin 2026** : +59 affaires importées en 5 batches (juin2026a→e), IDs FR-2026-0048 à FR-2026-0112
    - Gemini : meilleur LLM testé pour ce projet (batch e — 27 affaires, 0 doublon, régions ciblées)
    - Mistral : résultats médiocres (doublons non détectés, sources non-presse)
    - Hallucinations LLM : URLs tronquées (se terminant par `...`) = signal d'alerte, rejeter le batch
  - **Session juin 2026 (suite)** : enrichissement hubs, veille contextuelle, outils internes
    - Hub `data/hubs/paris-11e.json` documenté : France Info (nov 2025) + France 3 (mai 2026), calendrier judiciaire, associations vérifiées (L'Enfant Bleu partie civile, Innocence en Danger communiqué)
    - Délibéré Titon (Paris 11e) : **rendu** — relaxe rapportée le 17/06/2026, appel du parquet rapporté (franceinfo, ICI, 17–18/06/2026) ; la fiche POC-09 en rend compte (état « relaxe / non-lieu / classement », procédure encore vivante)
    - `scripts/watch-updates.mjs` étendu : +21 CONTEXT_QUERIES libres (avocats, magistrature, institutions, thèmes), flag `--no-context`
    - `data/associations-watchlist.json` : implication vérifiée pour L'Enfant Bleu et Innocence en Danger
    - `tools/presentation.html` : section "Avant une validation externe" ajoutée (bloquant/sérieux/priorisation avec cases à cocher)
    - `tools/scripts-guide.html` créé : catalogue des 6 scripts + 4 workflows types
    - `tools/design-hub-v3.html` : maquette V3 hub Paris 11e (éditoriale, groupes thématiques, refus paywall)
  - Sources en base : 393 (Neon, toutes affaires confondues) ; 230 projetées sur les 62 cartes
- **Livraison du 01–02/11/2026 (lot de correction groupée, GO collectif d'Adrien)** — PR 85 (main `7f7d476`) et PR 86 (`b83c09f`), build « Workers Builds » vert avant chaque fusion
  - **56 fiches** (26 créations + 30 mises à jour), manifeste `docs/industrialisation/ids-go-correction-01-11.json` : 56/56 empreintes servies = manifeste = approbations ; texte de la décision relu sur les 56 pages servies
  - **13 dossiers de Hub** appliqués par `docs/industrialisation/appliquer-hubs-01-11.mjs` (aucun refus) ; 43 dossiers hors Hub promus dans `data/hub-matiere/isoles.json`
  - **Cartes corrigées** : FR-2026-0008 et PARIS-007 « enquête » → « à qualifier » ; FR-2026-0116 (Mées) type « autre » ; FR-2026-0142 (Orange) « Lycée non nommé (secteur d’Orange) », lycée, enseignant
  - **Doublons retirés** (carte absente, page 404, sources et historique conservés) : PARIS-001 → FR-2026-0005, PARIS-008 → FR-2026-0008, PARIS-010 → FR-2026-0003, FR-2026-0007 → PARIS-007 ; PARIS-009 reste retiré (29/10/2026)
  - Aucun HOLD levé. Confirmation Telegram « publié et vérifié » : acceptée par l'API
  - **Clôture du 02/11/2026** : dates de parution inscrites pour les deux sources primaires sans date (POC-02 Ouest-France 30/03/2026 ; POC-09 France 3 22/05/2026 — dates de parution, jamais des dates d'événement) ; page `/revue-parents/` réordonnée **Carte → Fiches → Hubs**
  - **Quatre affaires publiées sans fiche individuelle** (volontaire) : FR-2026-0004 (HOLD, revue de granularité) · FR-2026-0013 (aucune décision judiciaire ; « enquêteurs saisis » n'est pas une déclaration du parquet) · FR-2026-0016 (une seule source partielle, reste dans le Hub Paris 11e) · FR-2026-0026 (carte « procès » non étayée, PDF source inaccessible, antécédents identifiants, sans coordonnées)
  - Détail, constats de corpus et défauts récurrents : `docs/industrialisation/CLOTURE_LOT_01_11.md` et `docs/industrialisation/ROADMAP_PRE_EXECUTEUR.md` (§ 0)
- **Fonctionnement autonome (workflows GitHub)** : Discovery (`sny-discovery`) et Maintenance (`sny-cycle`) une fois par jour, clics Telegram par webhook (`sny-telegram`) avec filet `sny-clics`, mises à jour de fiches proposées par `sny-maj-fiches` ; rien ne se publie sans décision d'Adrien. Suivi de l'autonomie : sur les prochains passages normaux de la Maintenance, sans rejeu global.
- **Domaine** : `sousnosyeux.org` réservé chez OVH ✅
- **DNS** : nameservers migrés vers Cloudflare ✅ (zone gérée côté Cloudflare)
- **Email** : `contact@sousnosyeux.org` via Cloudflare Email Routing → redirige vers email perso utilisateur ✅
- **Hébergement** : Cloudflare Workers (static assets) — build auto à chaque push sur `main` ✅
  - URL publique : `https://sousnosyeux.org` ✅
  - URL worker : `https://sousnosyeux.adr-etn.workers.dev` ✅
  - Redirect `www.sousnosyeux.org` → apex via Cloudflare Redirect Rule (301) — ⚠️ observé le 09/11/2026 : la règle renvoie vers l'URL littérale `https://sousnosyeux.org/*` (404) et `http://` est servi en 200 sans redirection ; correction de zone Cloudflare (hors dépôt) décrite dans le suivi du socle SEO
  - SSL automatique Cloudflare ✅
  - ⚠️ **Pas de variables d'environnement possibles** côté Workers static assets → le front lit `data/cases.json` (projection de Neon par `scripts/project-public.mjs`)
  - `web/wrangler.jsonc` : `not_found_handling: "404-page"` (URL inconnue → `404.html` avec statut 404) ; `web/public/_headers` : cache `immutable` sur `/_astro/*` seulement
- **Front Astro** : `web/` (Astro 5 + MapLibre 4, tuiles OSM)
  - **Design B2 implémenté** (Phase 6) ✅ — direction "Éditorial sobre + lanceur d'alerte"
  - Polices : DM Sans (UI) + DM Mono (chiffres/codes) + Playfair Display (titres) — auto-hébergées via `@fontsource` (OFL-1.1), aucun appel Google Fonts
  - Palette : rouge `#E63946` · bleu `#457B9D` · vert `#2D6A4F` · orange `#D97706`
  - Header blanc compact : logo avec barre rouge, nav, bouton "Nous contacter" (rouge) · sur mobile seul "Nous contacter" visible (Carte + Méthodologie masqués → présents dans footer/bande info)
  - Bande info compacte (1 ligne) : compteur affaires + tagline (masquée mobile) + lien méthodologie toujours visible
  - Toolbar filtres sticky (Tous / Condamné / En cours / Allégué / Classé) — filtre carte ET sidebar simultanément
  - Carte centrée France métropolitaine (`fitBounds` filtré sur bornes FR lat 41–52 / lng -6–10)
  - Clustering : `clusterRadius 30`, `clusterMaxZoom 7` — pins individuels visibles dès zoom 8 (niveau région)
  - Pins colorés par catégorie `statut_judiciaire` ✅
  - Popup partagée `openPopupForCase()` — déclenchée depuis pin ET depuis sidebar, avec pan automatique
  - Sidebar statique scrollable : liste affaires par date, barre colorée, badge statut + tag type_affaire, clic → zoom + popup
  - Footer sombre avec liens légaux
  - Page `/methodologie` + Page `/mentions-legales` ✅ · `/territoires/` + Hubs · fiches `/affaires/<id>/` · page 404 · **aucune page `/a-propos` en production** (constat du 09/11/2026)
  - **Source de données** : `data/cases.json` importé statiquement (projection de Neon par `scripts/project-public.mjs`)
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
| Porteurs du projet | Adrien Etienne & Ly Nguyen | Couple de parents parisiens — discours "nous" dans tous les supports (site, présentation, email) |
| Page À propos | `/a-propos` dans Astro, lien dans la nav | Contexte humain séparé de la méthodologie éditoriale — ⚠️ page absente de la production au 09/11/2026 (aucune route) |
| Support de présentation | `tools/presentation.html` | Document HTML autonome pour associations/partenaires — même tonalité que le site |
| Clustering carte | `clusterRadius 30`, `clusterMaxZoom 7` | Pins individuels visibles dès zoom 8 (niveau région) — ajusté post-feedback prod |
| Centre initial carte | `fitBounds` filtré sur bornes France (lat 41–52, lng -6–10) | Évite les points mal géocodés qui élargissaient la vue hors France |
| CTA "Nous contacter" | Bouton rouge dans le header (nav) | Suppression du bandeau CTA rouge pleine largeur — intégré dans le header |
| Hub JSON — format | 7 blocs (`case_filter`, `reponse_publique`, `ressources`, `associations`, `acteurs_cles`, `causes_presse`, `notes_edition`) + optionnels (`calendrier_judiciaire`, `etablissements_references`) | Structure stable pour l'enrichissement des zones géographiques |
| `verifie_contenu` dans les hubs | `false` = non publiable dans la maquette | Article non lu en intégralité = info non vérifiable — empêche publication de sources inconnues |
| Paywall dans les hubs | Ne jamais mentionner les articles payants (Mediapart, Libération) — ni en ressource ni en citation | Seuls les articles accessibles librement sont cités — cohérence avec la vérifiabilité publique |
| « Ce que dit la presse » (hubs) | Uniquement déclarations de personnes nommées très légitimes : avocats des familles, magistrats, officiels avec titre | Exclut témoignages anonymes, positions syndicales, notes éditoriales de podcasts |
| Réponse publique (hubs) | Structurée en 3 groupes thématiques : (1) Suspensions et enquêtes · (2) Plans structurels · (3) État judiciaire | Donne de la lisibilité aux réponses institutionnelles — remplace la chronologie brute |
| **Acquis oct.–nov. 2026** — Mémoire et projection | Neon → `project-public.mjs` → `data/cases.json` ; `project-evenements.mjs` → `data/evenements.json` | Constat de fait (Supabase n'est plus utilisé) ; aucune modification manuelle de l'artefact |
| Fiche individuelle publique | Une page `/affaires/<id>/` n'existe que si une revue `[Fiche approuvée <id8>] <ID> hash=<empreinte>` d'Adrien correspond à l'empreinte du dossier courant (sha256 des clés triées, 16 hex) | « APPROUVER ≠ PUBLIER » ; un dossier modifié sans nouvelle approbation n'est pas servi |
| Hubs pilotes | 4 Hubs publiés (Paris 11e, Bordeaux-Gironde, Hautes-Alpes, Landes) ; **aucune barrière d'approbation** : `data/hub-matiere/<hub>.json` EST le contenu servi | Corriger une fiche qui vit dans un Hub = modifier le Hub, seulement via `appliquer-hubs` (empreinte finale exacte, `_hub_avant`, refus sur modification concurrente) |
| Libellé d'absence de jugement | « Jugement sur le fond non documenté » (et non « Aucune décision rendue ») | L'ancien libellé niait des décisions de détention, de contrôle judiciaire ou de classement pourtant décrites |
| Doublons | On conserve une carte, on retire l'autre (`retirée`), on réaffecte la source ; affaire, sources et historique restent en base | Cas : PARIS-001/008/010, FR-2026-0007 (01/11/2026), PARIS-009 (29/10/2026) |
| Dates | Une date de parution n'est jamais une date d'événement ; une date calculée n'est conservée que si la déduction est univoque et ancrée dans le texte | Cas Copello, Laguenne, Vic-la-Gardiole |
| Reprises de dépêches | Une reprise n'est jamais comptée comme confirmation indépendante | Évite de gonfler la fiabilité |
| Relaxe / non-lieu / classement (doctrine R5, 07/10/2026) | Pas de retrait tant que la procédure est vivante (appel, pourvoi, recours, finalité non définitive établie) ; sinon « retrait à instruire » — constaté par `scripts/qa/check-corpus.mjs` | Deux cartes encore concernées (FR-2026-0024, 0035) : voir `docs/industrialisation/CLOTURE_LOT_01_11.md` |
| Merge et Telegram | Aucune fusion avant « Workers Builds » vert ; la confirmation Telegram se juge sur le résultat réel de l'API ; pas d'envoi individuel hors confirmation finale d'un lot | Traçabilité de ce qui est réellement parti |

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
├── tools/
│   ├── review.html            # outil local de validation
│   ├── presentation.html      # document de présentation du projet (pour associations, partenaires)
│   ├── scripts-guide.html     # catalogue des scripts + workflows types (copier-coller des commandes)
│   └── design-hub-v3.html     # maquette V3 hub éditorial (Paris 11e — référence UX)
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
│   ├── cases.json             # cartes publiées (projection de Neon par scripts/project-public.mjs)
│   ├── evenements.json        # événements validés + fiches approuvées (empreintes) — projection de Neon (project-evenements.mjs)
│   ├── publication-holds.json # affaires gelées (HOLD) : état public conservé, aucune mise à jour absorbée
│   ├── hub-matiere/           # contenu servi des Hubs pilotes (<hub>.json) et dossiers de fiches isolées (isoles.json)
│   ├── import-batch.csv       # CSV des 34 affaires IDF (input du pipeline)
│   ├── import-batch-hdf.csv   # CSV des 21 affaires hors-IDF (batch 2)
│   ├── associations-watchlist.json # associations suivies + implication vérifiée
│   └── hubs/
│       └── paris-11e.json     # hub éditorial Paris 11e (France Info + France 3, calendrier judiciaire, associations)
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
│   │       ├── mentions-legales.astro # page LCEN
│       ├── affaires/              # fiches individuelles (/affaires/<id>/), publiques si approuvées
│       ├── territoires/           # Hubs pilotes (/territoires/<hub>/)
│       └── revue-parents.astro    # page de retours (noindex, hors navigation) : Carte → Fiches → Hubs
│   └── package.json
├── .github/workflows/         # sny-discovery, sny-cycle (Maintenance), sny-telegram, sny-clics, sny-maj-fiches, sny-webhook-admin
└── docs/
    ├── industrialisation/     # revues, manifestes de lots, journaux, ROADMAP_PRE_EXECUTEUR.md, CLOTURE_LOT_01_11.md
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
     - **Session juin 2026** : +21 CONTEXT_QUERIES libres (avocats, magistrature, institutions, associations, thèmes) + flag `--no-context`
     - ℹ️ La veille courante est désormais assurée par la Maintenance quotidienne (workflow `sny-cycle`, GitHub) ; ce script reste disponible en manuel
3. **Phase 4 — Revue juridique + procédures** (critique mais risque modéré)
   - ⏭️ Faire relire méthodologie + mentions légales par un avocat presse
   - ⏭️ Trancher sur l'adresse postale (domiciliation vs maintien « sur demande »)
   - ℹ️ **Note** : le projet ne fait que relayer des articles de presse — pas de noms, pas de création d'information. Risque limité.
4. **Phase 6 — Design du site** (TERMINÉE + correctifs prod)
   - ✅ 3 directions visuelles maquettées (A Sobre/Institutionnel, B Terrain/Alerte, C Citoyen/Humain)
   - ✅ Direction B2 "Éditorial" choisie et implémentée
   - ✅ 3 variations B1/B2/B3 maquettées pour affiner
   - ✅ Déployée en prod sur sousnosyeux.org (commit 6bb51c7)
   - ✅ Correctifs responsive mobile : header overflow, drag page, info band, hauteur carte (commit 458c112)
   - ✅ Correctifs UX : légende compacte mobile, clustering earlier (zoom 8), tag type_affaire sidebar (commit b3ec32c)
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
7. **Phase 9 — SEO + pages thématiques**
   - ⏭️ Pages SEO statiques par région / type d'affaire / statut judiciaire (ex : `/region/ile-de-france`, `/type/creche`)
   - ✅ Métadonnées : Open Graph + image de partage GÉNÉRIQUE (aucune image par affaire), JSON-LD minimal `WebSite` (accueil) + `BreadcrumbList` (fiches) — socle SEO du 09/11/2026
   - ✅ Sitemap XML généré au build (`scripts/lib/sitemap.mjs`, lot D, PR 103), sans `lastmod` (aucune date de modification publiée fiable)
   - ⏭️ Page d'accueil optimisée : titre H1, description, maillage interne
   - ℹ️ Objectif : référencement naturel sur les recherches liées aux affaires de protection de l'enfance
8. **Phase 10 — Témoignages des familles**
   - ⏭️ Page dédiée pour recueillir des témoignages de familles concernées (formulaire structuré)
   - ⏭️ Workflow de modération : réception par email → review éditoriale → publication anonymisée
   - ⏭️ Modèle de données : table `testimonials` (anonymisé, lié optionnellement à une `case_id`)
   - ⏭️ Anti-spam : Cloudflare Turnstile (déjà prévu §3)
   - ⚠️ Point juridique critique : cadre RGPD + droit à l'anonymat des témoins à valider en phase 4
9. **Phase 11 — Cartographie des acteurs (associations, podcasts, avocats)**
   - ⏭️ Page « Relais & alliés » : liste des associations œuvrant sur la protection de l'enfance dans les structures d'accueil
   - ⏭️ Recenser les producteurs de contenu sur le même thème (podcasts, journalistes d'investigation, médias spécialisés) — ex: podcasts déjà identifiés par l'utilisateur
   - ⏭️ Identifier un ou plusieurs avocats spécialisés (droit de la presse, droit de l'enfant) susceptibles d'accompagner le projet juridiquement
   - ⏭️ Stratégie backlinks : partenariats éditoriaux avec ces acteurs pour améliorer le référencement
   - ℹ️ Objectif double : trouver des alliés pour peser face aux institutions + améliorer la visibilité SEO
   - **Session juin 2026** : 5 associations identifiées et contactées (email rédigé) — L'Enfant Bleu, Innocence en Danger, CDP-Enfance, CVM, Une Vie. Prise de contact en cours par Adrien & Ly.
10. **Phase 12 — Interpellation des institutions publiques**
    - ⏭️ Définir la structure cible du site pour maximiser l'impact institutionnel (agrégation par département, par type de structure, par récidive de l'institution)
    - ⏭️ Page « Demandes aux institutions » : synthèse des questions adressées aux services publics (EN, ASE, parquet…)
    - ⏭️ Suivi des réponses institutionnelles (open data, courriers, communiqués)
    - ⏭️ Rapport annuel public auto-généré depuis les données en base (statistiques, tendances)
    - ℹ️ Objectif final : constituer un corpus suffisant pour peser dans le débat public et obtenir des comptes

### Tâches techniques en attente (état au 02/11/2026)
- 🎯 **Prochaine priorité** : préparer une première diffusion ciblée pour recueillir des retours de parents (page `/revue-parents/` prête : Carte → Fiches → Hubs ; retours par e-mail à contact@sousnosyeux.org)
- 🔎 **Suivi de l'autonomie** : sur les prochains passages normaux de la Maintenance et de la Discovery (pas de rejeu global)
- ⚖️ **Arbitrage éditorial à prendre** — FR-2026-0024 et FR-2026-0035 (classement sans suite rapporté, état « relaxe / non-lieu / classement ») : la règle R5 les signale « retrait à instruire » ; les mentions légales §8 annoncent le retrait sur « classement sans suite » alors que la méthodologie dit qu'une affaire reste visible après un classement. Rien n'a été retiré ni assoupli ; voir `docs/industrialisation/CLOTURE_LOT_01_11.md`
- ⏭️ Quatre affaires sans fiche : FR-2026-0004 (HOLD, revue de granularité), FR-2026-0013 (rien d'établi côté parquet), FR-2026-0016 (source unique partielle), FR-2026-0026 (état « procès » non étayé, à revoir)
- ⏭️ Alertes de corpus non bloquantes : `verified_at` absent (62 cartes), 13 libellés de média incohérents avec le domaine, 1 source secondaire non admissible (MSN, FR-2026-0005)
- ⏭️ 76 candidates en attente de décision (Discovery quotidienne, rien ne se publie sans GO)
- ⏭️ Phase 4 (revue juridique par un avocat presse, adresse postale) — toujours ouverte
- ⏭️ Documenter les 5 critères de scoring sur `/methodologie` (~2h)
- ⏭️ Améliorer la fiche La Courneuve (POC-02) — centroïde commune → adresse précise
- ⏭️ Nettoyage DNS : supprimer les TXT OVH orphelins
- ⏭️ Défauts récurrents consignés pour prévention (aucune refonte lancée) : `docs/industrialisation/ROADMAP_PRE_EXECUTEUR.md` § 0
- ✅ Faits depuis la version précédente de cette liste : délibéré Titon rendu et fiche à jour ; veille assurée par les workflows quotidiens ; revues indépendantes (28 candidates + 32 publiées) puis correction groupée de 56 fiches 
- ℹ️ `scripts/watch-updates.mjs` reste disponible en manuel ; la veille courante passe par `sny-cycle`

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
