# SNY — Relais social, mode REVIEW (13/11/2026)

Chaîne : `Nouveauté validée → contrôles (T0, fraîcheur, page servie) → composition V4.1 → proposition Telegram → GO social (un clic) → recontrôle → Buffer → journal`.

Remplace le chemin « GO de publication ⇒ post automatique » de `DIFFUSION_SOCIALE.md` (§ chaîne, § éligibilité) : **ce chemin n'existe plus dans le code**. Les parties « Buffer », « journal », « retraits », « mesure » de ce document restent valables.
**Il n'existe aucun mode automatique** : tout post exige un GO social Telegram, donné après avoir lu les deux textes exacts.

## 1. Ce que fait le relais

| Étape | Où | Détail |
|---|---|---|
| Détection | `scripts/lib/relais-social-db.mjs` `candidats()` | Nouvelles affaires (Discovery) et évolutions judiciaires (Maintenance) dont **tous** les horodatages sont ≥ T0 |
| Éligibilité | `relais-social.mjs` `evaluerCandidat()`, `controlerFraicheur()` | T0, publiée, ni HOLD ni retrait, statut diffusable, fiche approuvée **et servie en HTTP 200 avec l'empreinte approuvée** (`data-dossier`), source < 7 jours **lue** (accès libre ou validé), fait pas plus ancien de 7 jours avant l'article, aucun doublon, aucune exclusion |
| Composition | `composerEvenement()` → `composerPilote` + `verifierPost` (V4.1) | Mêmes textes pour Telegram, empreinte et Buffer. Aucun repli sur l'ancien gabarit générique. Aucun appel de modèle |
| Proposition | `proposerNouveautes()` | **Un seul** message Telegram par événement : affaire, événement, source, fiche, **textes Facebook et X intégraux**, contrôles, réserves, échéance (48 h) |
| GO | `telegram-v0.mjs` `clicSocial()` → `enregistrerDecision()` | Boutons : GO X + Facebook · GO Facebook seul · GO X seul · Refuser. Un canal bloqué n'a pas de bouton. Une décision par proposition (`decision is null`) |
| Publication | `publierDecisions()` → `diffuserCanal()` | Recontrôle complet (éligibilité + recomposition + empreinte du texte par canal), puis réservation au journal, Buffer programmé à +15 min, réconciliation avant tout retry |
| Suivi | `suivreEtRetirer()`, `confirmerPublications()` | Annulation avant envoi si retrait / HOLD, alerte URGENT si déjà publié (jamais « supprimé » sans preuve), confirmation avec permaliens |

Le relais s'exécute à la fin de `sny-telegram` (après vérification du site, donc juste après un clic) et dans `sny-clics` (filet). Un clic GO est donc exécuté dans le même passage que son enregistrement.

## 2. T0 — zéro historique

- **Source** : l'horloge de la base Neon, écrite **une fois** par `--initialiser-t0` dans `relais_social_config` (migration 026). La table est **immuable** : un trigger refuse UPDATE, DELETE et TRUNCATE. Un redéploiement, un rejeu ou une correction de configuration ne la touchent pas.
- **Témoin** : la variable `SNY_DIFFUSION_DEPUIS` doit être égale (à la seconde) au T0 de la base. Écart, absence ou texte parasite ⇒ relais **bloqué**. Corriger la variable vers une date plus ancienne ne rouvre donc jamais l'historique.
- **Incohérent** (futur, antérieur au 13/11/2026, mode ≠ review) ⇒ bloqué. T0 absent ⇒ aucune proposition.
- **Nouvelle affaire** : découverte (`new_case_proposals.created_at`), création (`cases.created_at`) **et** première approbation de fiche (`reviews`, « [Fiche approuvée] ») ≥ T0. Une affaire présente avant T0, même réapprouvée ou modifiée, n'est jamais « nouvelle ».
- **Évolution** : proposition de maintenance, décision Telegram et enregistrement de l'événement (`case_events.recorded_at`) ≥ T0, statut qui **avance**. Relecture, correction, réapprobation, ajout d'une source ancienne, `updated_at` ne sont **pas** des déclencheurs.
- **Horodatage absent ou illisible ⇒ échec fermé.**
- **Contrôle du stock** (`--controle-stock`, lecture seule) : charge tous les événements depuis l'origine, les juge avec T0 = maintenant, et exige zéro éligible (évaluateur **et** plan complet avec composition). `--initialiser-t0` le rejoue et refuse de poser T0 s'il échoue.
- **Exclusion** : `relais_social_exclusions` (`--exclure-montpellier`) interdit à jamais la réémission des deux publications manuelles de FR-2026-0146 (événement `new_case|FR-2026-0146`, X et Facebook ; plus l'empreinte du texte réellement publié si Buffer l'a conservé). L'exclusion ne porte que sur cet événement : une évolution future de Montpellier reste possible. Ce n'est **pas** un journal d'envoi.

## 3. Identité du GO

Chaque proposition enregistre, par canal, l'empreinte sha256 de `affaire + événement + empreinte de la fiche approuvée + source + texte + URLs + canal`. Avant l'envoi, tout est recalculé depuis les données courantes : la moindre différence (fiche modifiée, texte différent, source changée, page plus servie, fiche retirée, source devenue trop ancienne) ⇒ **zéro publication**, résolution `obsolete` ou `bloque`, alerte Telegram. Le GO ne vaut que pour l'ensemble validé ; il ne s'étend ni à l'autre canal ni à une version ultérieure.
Silence, expiration (48 h), bouton obsolète ou callback rejoué ⇒ rien. Un GO donné alors que le relais est désactivé n'est pas enregistré.

## 4. Périmètre éditorial

- **Proposables** : nouvelle affaire factuelle ; évolution judiciaire substantielle non ambiguë (statut qui avance vers enquête / mise en examen / procès / condamnation).
- **Bloqués** sans décision éditoriale spécifique : relaxe, non-lieu, classement, recours ambigu ; source insuffisante (accès partiel ou non constaté) ; procédures possiblement confondues ; corrections techniques ou documentaires.
- **Déclarations** (parents, collectifs, associations, avocats) : le composeur V4.1 sait les composer avec revue renforcée (extrait exact, attribution, plus-value), **mais aucun événement horodaté fiable ne les identifie aujourd'hui** (les informations validées n'ont pas d'horodatage d'approbation exploitable) : le relais **ne les détecte pas** — échec fermé, par la règle ci-dessus. Les proposer exigera de dater l'approbation d'une information validée (une colonne) puis de brancher `declaration_*` dans `candidats()` ; le circuit de revue (même proposition, mêmes boutons) ne change pas.

## 5. Mise en service et exploitation

Toutes les opérations se font depuis GitHub → Actions → `sny-diffusion` (aucune ne publie) :

1. `appliquer-migration` (025 + 026, additives) puis `autotest-ecriture` (requêtes d'écriture sur une ligne jetable, immuabilité de T0).
2. `inventaire-buffer` (aucun post SNY en attente) puis `exclure-montpellier`.
3. `controle-stock` (zéro historique) puis `initialiser-t0` (confirmation `GO-T0`) : T0 = horloge de la base.
4. Variables : `SNY_DIFFUSION_DEPUIS` = T0 (témoin), `SNY_DIFFUSION_MODE=review`, puis `SNY_DIFFUSION_ACTIVE=1` **en dernier**.
5. `plan` : aucune proposition issue du stock ; `etat` : compteurs.

**Coupe-circuit** : `SNY_DIFFUSION_ACTIVE=0` (Settings → Secrets and variables → Actions → Variables, ou `gh variable set SNY_DIFFUSION_ACTIVE --body 0`). Effet au passage suivant : plus aucune proposition ni publication, un clic GO n'est plus enregistré. Les posts déjà programmés (≤ 15 min) restent dans Buffer : les supprimer dans Buffer si nécessaire (le relais ne les annule que sur retrait de la fiche). Vérifié par `test-diffuser-script.mjs` (aucun appel sortant) et `test-relais-social.mjs`.

## 6. Examiner les 8 à 10 premières propositions

Pour chaque proposition (Telegram), noter dans un tableau (une ligne par proposition) : événement, canaux proposés, décision (`etat` → propositions par décision), délai clic, retouches souhaitées, publication réelle (permalien), visites référées J+7 (Cloudflare Web Analytics → Referrers : `t.co`/`x.com`, `l.facebook.com`/`m.facebook.com`, comme dans `DIFFUSION_SOCIALE.md` §8 ; les UTM ne sont pas exploités par Cloudflare, ils servent de repère des liens).
Compteurs de suivi : `sny-diffusion` → `etat` donne propositions, GO, refus, expirées, obsolètes/bloquées et état du journal par canal ; les silences (blocages) se lisent dans le journal du passage (`plan` ou les étapes « Relais social » des runs) : une ligne `SILENCE — <raisons>` par événement écarté.
Critères pour envisager le passage en automatique (à décider par Adrien, jamais par défaut) : au moins 8 à 10 propositions examinées, aucune modification de texte demandée, aucun retrait après publication, aucun cas `obsolete` inexpliqué.
**Ce qu'il faudra changer pour supprimer ensuite le second GO** (rien n'est préparé dans le code) : n'exiger le GO que pour les familles non factuelles ; transformer la décision `GO_*` en décision par défaut au bout du délai pour les seules propositions entièrement « CONFORME » (aucune réserve, aucun avertissement) ; ajouter un mode explicite `SNY_DIFFUSION_MODE=auto` refusé aujourd'hui par `verifierActivation`, avec revue de sécurité.

## 7. Note de sécurité (livraison)

- **Objet** : proposer, après un clic humain, la publication de deux textes composés à partir de la matière déjà approuvée. Aucun appel de modèle ; aucune donnée personnelle collectée.
- **Installation** : code du dépôt exécuté par GitHub Actions (runners GitHub) ; Worker Cloudflare `sny-telegram` redéployé via `sny-webhook-admin` (`deploy`). Rien ne s'installe sur un poste.
- **Démarrage / persistance** : aucun service, aucune tâche planifiée nouvelle ; le relais s'exécute dans les workflows existants (`sny-telegram`, `sny-clics`) et reste inerte tant que `SNY_DIFFUSION_ACTIVE ≠ 1` ou `SNY_DIFFUSION_MODE ≠ review` ou T0 non vérifié.
- **Réseau** : Neon (HTTPS), Buffer (`api.buffer.com`), Telegram (`api.telegram.org`), `sousnosyeux.org` (lecture des pages servies). Validation TLS normale.
- **Privilèges** : secrets GitHub `NEON_DATABASE_URL`, `BUFFER_API_KEY`, `TELEGRAM_BOT_TOKEN` (déjà présents) ; aucun secret en clair dans le code, les tests ou les journaux (dépôt public : identifiants d'affaire, canaux, issues seulement). Le Worker ne détient aucun accès base.
- **Données** : les textes publiés sont publics par nature ; la base ne stocke que ces textes, leurs empreintes et les décisions.
- **Revue Sécurité recommandée** : le passage futur en mode automatique (publication sans GO), tout ajout d'un canal.
