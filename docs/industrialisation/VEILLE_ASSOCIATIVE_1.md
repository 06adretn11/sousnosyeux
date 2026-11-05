# VEILLE ASSOCIATIVE #1 — publications d'organismes raccordées à la Maintenance

_Exécution du kit du 5 novembre 2026 (partie A). Rien n'est activé, poussé, fusionné, publié ni envoyé. Aucune écriture en production._

## 1. Point de départ et raccords réellement constatés

- **Commit de départ** : `origin/main` = `c6def5b` (vérifié par `git ls-remote` le 05/11). Branche locale `feat/veille-associative`, worktree propre (le dossier principal est sur une branche dérivée non poussée).
- **AGENTS.md** : absent du dépôt. CLAUDE.md lu (il date de juin et décrit encore Supabase : la chaîne active est Neon).
- **Chaîne active** (`.github/workflows/sny-cycle.yml`, une passe productive par jour via `garde-quotidien`) : `watch-updates.mjs` (Google News) → `maintenance-cycle.mjs --moteur deepseek/deepseek-v4.1-flash --contrat v2` (routage par titre → claims → preuve Bing → compréhension → `state_proposals`) → `telegram-v0.mjs notifier/recevoir` → `appliquer-decisions.mjs --generique`. Discovery (`sny-discovery.yml`) ne lit que ses propres recherches presse : **aucun relais entrant n'existe**.
- **Ce que la documentation disait et que le code ne fait pas** :
  - `data/associations-watchlist.json` **n'existait pas sur `main`** (seulement dans la copie locale non commitée) et **n'avait aucun lecteur**.
  - Les `CONTEXT_QUERIES` de `watch-updates.mjs` (dont « L'Enfant Bleu », « Innocence en Danger ») écrivent `report.context_queries`, que **rien ne lit** : c'était une mention, pas une intégration.
- **Mémoire réutilisée** : `source_resolutions` (migration 012, une ligne par document : empreinte, dernier succès, incident) ; `state_proposals` + `articles` pour les propositions. **Aucune table, aucun canal, aucun ordonnanceur ajouté.**

## 2. Ce qui change (diff)

| Fichier | Nature |
|---|---|
| `data/associations-watchlist.json` | Registre unique : les 5 entrées historiques conservées (mêmes noms et champs, `id` ajouté) + le périmètre du kit (18 entrées). |
| `scripts/lib/sources-suivies.mjs` | Lecture (lecteur existant `extraireCorps` + 2 extensions démontrées), identité, empreinte de substance, mémoire, classement déterministe, passages, message. **Aucun modèle.** |
| `scripts/maintenance-cycle.mjs` | Étape `--sources-suivies`, **désactivée par défaut**, isolée (une panne ne coupe pas la Maintenance). Options d'essai : `--memoire-sources`, `--sources-fixtures`, `--apercu`, `--maintenant`. |
| `scripts/telegram-v0.mjs` | Une proposition portant `payload.declaration` part en **information sans bouton** (même en-tête « MAINTENANCE »). |
| `scripts/qa/test-sources-suivies.mjs` + `run-all.mjs` | 22 vérifications hors réseau, bloquantes. |
| `package.json` | `pdfjs-dist` **6.5.438** épinglé (Mozilla, registre npm officiel, vérifié). |
| `web/src/pages/methodologie.astro` | §3 Sources : le paragraphe prévu par le kit, seul ajout (rendu vérifié en local, non publié). |
| `fixtures/sources-suivies/` | Registre du corpus A–H (essai) et rapport de veille vide. |

**Extensions du lecteur, et pourquoi** : (1) PDF — B (communiqué) et C (PV de Tarnos) sont des PDF, illisibles par le lecteur existant ; (2) texte intégral quand les `<p>` ne portent rien — les fiches France Victimes ne rendaient que 216 caractères.

### Destinations (classement déterministe)

| Destination | Effet |
|---|---|
| `AFFAIRE` (établissement + commune + rôle nommés par le **texte**) | Proposition « déclaration d'organisme » dans `state_proposals` : `ENRICHMENT`, `statut_propose` nul, aucun fait judiciaire, `note_limite` d'attribution ; Telegram : information sans bouton. Si le **titre** énonce un acte judiciaire, il rejoint la veille de l'affaire (chaîne par claim : seul un acte prouvé par la presse peut y devenir une proposition d'état). |
| `RATTACHEMENT_SUSPENDU` | Aucune proposition. Si ≤ 3 candidates : on indique si le document serait une preuve complémentaire d'un fait déjà publié. |
| `RESSOURCE` | Révision documentaire (empreinte + divergences de contacts signalées, jamais écrasées). Pas d'événement d'affaire. |
| `POSITION_GENERALE` | Mémoire documentaire, aucune notification. |
| `SIGNAL_AFFAIRE_POSSIBLE` | Consigné ; **relais Discovery inexistant** (raccord manquant documenté, non construit). |
| `HORS_PERIMETRE` | Décision motivée et mémorisée (filtre d'organisme ou absence de lien thématique). |

Les libellés fermés des « réponses publiques » commencent tous par « Selon la presse » et ne reconnaissent que des acteurs institutionnels : appliqués à une publication d'association, ils produiraient des attributions fausses. Ils ne sont **pas** appliqués aux sources suivies (décision hors périmètre si l'on veut des libellés « Selon <émetteur> »).

## 3. Bilan par organisme (passage réel du 05/11/2026)

| # | Organisme | Statut | Constat |
|---|---|---|---|
| 01 | L'Enfant Bleu | **Couverture opérationnelle testée** | 2 index lus (flux RSS validé : 12 entrées) ; 32 documents (dont 20 PDF) ; 1 rattachement (A), 7 suspendus, 18 positions, 3 signaux, 3 hors périmètre. Déjà suivie (watchlist de juin). |
| 02 | Colosse aux pieds d'argile | **Couverture opérationnelle testée** | Index + contact lus ; 18 documents ; filtre (recrutement, collectes, événements) : 6 hors périmètre ; flux `/feed/` vide (non retenu). |
| 03 | ADAVEM JP40 | **Limite technique documentée** + ressource de secours | Site propre : le domaine ne se résout plus (DNS) depuis notre lecteur ; fiche France Victimes id=67 lue (contact affiché, mise à jour 2024 non rafraîchie). |
| 04 | OSE (cellule parisienne) | **Limite technique documentée** | Index et page de la cellule : contrôle anti-robot (o2switch « Tiger Protect », HTTP 503) — non contourné. Repli paris.fr lu (émetteur : Ville de Paris). Vérification manuelle de E faite dans un navigateur. |
| 05 | Innocence en Danger | **Couverture opérationnelle testée** (déjà suivie) | Les deux pages lues ; dossier périscolaire : établissements nommés sans arrondissement → rattachement suspendu (aucune régression possible). |
| 06 | FCPE Paris | **Limite technique documentée** | Les deux rubriques : même contrôle anti-robot. |
| 07 | FCPE de la Gironde | **Couverture opérationnelle testée** | 2 index + « qui sommes-nous » ; 23 documents (communiqués PDF anciens majoritairement hors périmètre) ; 3 échecs isolés (un PDF 404, deux pages à contenu non textuel). |
| 08 | Paris Aide aux Victimes | **Suivi de ressources seulement** + limite | Site propre : connexion coupée ; fiche France Victimes id=17 et page paris.fr lues (textes jamais attribués à PAV). |
| 09 | Vict'Aid (Institut Don Bosco) | **Couverture opérationnelle testée** | Flux RSS validé ; filtre « Vict'Aid » : 10 publications de l'Institut hors service ; F classé hors périmètre. |
| 10 | Médiavic 05 | **Suivi de ressources seulement** | 3 pages + fiche id=23 lues ; flux `/feed/` = billets de démonstration (non retenu) ; **divergence d'adresses signalée** (adresse du site ≠ adresse wanadoo de la page activités et de la fiche réseau). |
| 11 | Collectif MeTooEcole | **Limite technique documentée** | Contrôle anti-robot ; H vérifié manuellement (introduction seule, aucune date, formulaire non utilisé). |
| 12 | Mouv'Enfants (réserve) | **Couverture opérationnelle testée** | Ancien site : index + RSS validé, 10 publications ; nouveau site (www) : page unique sans index, suivie comme page ; les deux identités restent distinctes. |
| 13 | Francas de la Gironde (réserve) | **Limite technique documentée** | Contrôle anti-robot. |
| 14 | SOS Périscolaire (réserve) | **Limite technique documentée** | Page applicative vide pour le lecteur public ; état et dernier contrôle conservés, rien déduit du titre. |
| 15 | « Couples et Familles » | **Identité à confirmer** | Mention du PV de Tarnos (p. 2 : animation de la réunion du 15/07). Deux homonymes plausibles (Landes à Dax ; Pays Basque, actif avec le centre de loisirs de Tarnos), aucune source primaire ne tranche : aucune URL attribuée. |

Entrées historiques conservées sans URL : CDP-Enfance, CVM, Une Vie.

## 4. Comptes (réels ≠ contrôlés)

**Réel — périmètre complet, passage 1** (réseau réel, état Neon lu, `--dry-run`, mémoire isolée) : 129 URL distinctes lues (33 points d'entrée + 93 documents + 3 flux) ; 111 documents/pages qualifiés, 15 échecs ; destinations : 1 affaire, 12 rattachements suspendus, 11 ressources, 40 positions générales, 3 signaux d'affaire possible, 37 hors périmètre ; **1 proposition nouvelle** (A → `POC-05`, information sans bouton, marquée « rattrapage documentaire » : publiée le 21/07, découverte le 05/11) ; 0 preuve complémentaire ; 0 titre injecté dans la chaîne par claim ; **0 appel de modèle**.
**Réel — passage 2** : 27 requêtes (index, flux, échecs retentés) ; 9 inchangés, 12 pages de service non dues, 90 documents connus récents ; **0 proposition**.
**Corpus A–H, deux passages** : 8 URL ; passage 2 = 6 inchangés, 0 proposition.
**Contrôlés** (état de test artificiel autour de documents réels, voir §5) : 1 reprise, 1 correction de texte, 1 changement de gabarit, 1 changement de contact, 1 échec simulé.

Les catégories ne s'additionnent pas : un document compte une fois par issue et une fois par destination ; une proposition est par affaire.

## 5. Essais — attendu / obtenu

| Essai | Nature | Attendu | Obtenu |
|---|---|---|---|
| A — L'Enfant Bleu, 21/07 | réel | Alphonse-Baudin nommé, démarche attribuée, dates distinctes, statut inchangé | `AFFAIRE POC-05` ; passage « paragraphe 4 » ; publication 2026-07-21 ≠ démarche (avril 2025) ; `statut_propose` nul, état « relaxe » affiché inchangé |
| B — communiqué 12/05 (PDF) | réel | sans école : identification suspendue | `RATTACHEMENT_SUSPENDU` (8 affaires « animateur, Paris 11e ») ; date d'en-tête 2026-05-12 ; métadonnée PDF (05/05) jamais prise pour une date |
| C — PV Tarnos, p. 2 | réel | preuve complémentaire, pas un nouvel événement ; ni prise en charge ni réunion tenue | `RATTACHEMENT_SUSPENDU` sur `FR-2026-0115` seule (le PV écrit « animateur », jamais « périscolaire ») ; si rattaché : **preuve complémentaire** du fait Sud Ouest du 09/07 ; aucune proposition |
| D — Colosse, 31/08 | réel | position nationale, pas landaise | `POSITION_GENERALE` |
| E — OSE, 14/09 | réel bloqué + vérification manuelle + contrôlé | déclaration propre, aucune école | lecteur : `BLOCAGE_ANTI_ROBOT` ; texte relevé manuellement → `POSITION_GENERALE`, aucune école |
| F — Vict'Aid, Le Porge | réel | hors périmètre | `HORS_PERIMETRE` (après correction : une mention isolée de « protection de l'enfance » dans la présentation de l'Institut ne suffit plus) |
| G — IED, dossier | réel | archives datées, aucune régression | `RATTACHEMENT_SUSPENDU` (établissements nommés sans arrondissement) : aucune proposition d'état possible |
| H — MeTooEcole | réel bloqué + vérification manuelle + contrôlé | démarche déclarée, date non inventée, aucun formulaire | lecteur : blocage ; contrôlé → `RESSOURCE`, `publie_le` nul |
| Deux lectures identiques | réel | 0 proposition | 0 (périmètre et corpus) |
| Reprise de presse | contrôlé | origine conservée | `REPRISE_PRESSE`, origine « Le Parisien », « une seule origine, aucune corroboration » |
| Gabarit / correction | contrôlé | comportements distincts | gabarit → `INCHANGE` ; correction → `MODIFIE` + réexamen |
| Contact / divergence | réel + contrôlé | aucun événement d'affaire | `RESSOURCE MODIFIE`, 0 proposition ; divergence Médiavic signalée, masquée |
| Identités FV / Mouv'Enfants | réel | aucune collision | 4 clés France Victimes et 2 Mouv'Enfants distinctes |
| Échec / page vide | réel + contrôlé | erreur visible, dernier succès préservé | 15 échecs nommés ; mémoire : empreinte, destination et date du dernier succès conservées |
| HOLD / approbation absente | code + QA | aucune projection | le module n'écrit ni `cases`, ni `case_events`, ni `reviews`, ni l'artefact public ; les propositions n'ont pas de bouton (aucun ACCEPT possible) ; `run-all` vert, dont les garde-fous HOLD existants |
| Panne de l'étape | contrôlé | Maintenance non interrompue | « étape interrompue », code 0 |

Défauts trouvés et corrigés pendant les essais : PDF jamais lus (`destroy`) ; rattachement de 4 affaires par des pages électorales du PV (zone pertinente) ; « Paris » seul suspendant 22 affaires d'arrondissement ; indices dispersés (27 affaires) ; date d'un article cité prise pour la date du document ; reprise non reconnue (casse) ; fausse divergence sur une page tierce partagée.

**Absence d'effets externes** : tous les essais en `--dry-run`, `TELEGRAM_BOT_TOKEN` et `OPENROUTER_API_KEY` vidés, mémoire en fichier hors dépôt ; vérification Neon par `EXPLAIN` sans exécution (0 ligne de test présente ensuite). État de production : **0 ligne `SOURCE_SUIVIE`**, 0 proposition `sources-suivies`.

## 6. Cadence et charge marginale

- Cadence obtenue **sans ordonnanceur** : l'étape suit la passe quotidienne de `sny-cycle` ; les index sont lus à chaque passe ; les pages de service et les documents connus au plus une fois tous les 7 jours (`checked_at`) ; les échecs sont retentés à chaque passe.
- Charge mesurée (poste local) : 1ʳᵉ passe 129 requêtes, ~60 s ; passes suivantes ~27 requêtes, ~10 s ; relecture hebdomadaire des documents connus ≈ 110 requêtes une fois par semaine. **0 appel de modèle** (aucun titre n'a porté d'acte judiciaire ; s'il y en a, la chaîne par claim existante s'applique avec son budget). Coût : aucun coût de modèle mesuré ; durée CI non mesurée (aucun run CI lancé).

## 7. Activation (après GO) et retour arrière

1. Fusionner la branche `feat/veille-associative` sur `main` (le push d'une branche déclenche un build Cloudflare Workers de prévisualisation : c'est pourquoi rien n'a été poussé). La fusion publie aussi le paragraphe de méthodologie.
2. Appliquer le commit d'activation (`feat/veille-associative-activation`) : ajoute `--sources-suivies` à l'étape B de `sny-cycle.yml`.
3. **Base initiale** : rien à reconstituer — `source_resolutions` ne contient aucune ligne `SOURCE_SUIVIE` (vérifié). Le premier cycle actif lit le périmètre, écrit l'état réel en mémoire, et produit au plus la proposition A (information datée « rattrapage documentaire ») ; tous les autres documents sont mémorisés sans notification. Les états artificiels des essais sont dans des fichiers locaux, jamais importés. Le second cycle produit 0 proposition (prouvé en rejeu).
4. Retour arrière : retirer `--sources-suivies` (revert du commit d'activation). Aucune suppression : les lignes `source_resolutions` / `state_proposals` restent comme historique et ne sont lues par aucune autre étape (`echecsConnus` ne lit que `RECHERCHE_PAR_CLAIM`).

## 8. Limites et décisions hors périmètre

- 6 organismes ne sont pas lisibles par notre lecteur (anti-robot ×4, DNS, application JS) : pas de contournement. Un accès éditeur, un flux public non protégé ou une liste blanche du site sont des décisions externes.
- Le résolveur partagé exige « périscolaire » pour une affaire d'animateur périscolaire et ne reconnaît pas « Paris » sans arrondissement : C et G restent suspendus (choix prudent, non modifié).
- Pas de libellé « Selon <organisme> » pour les réponses publiques ; pas de relais Discovery entrant ; pas de destination pour les ressources hors Hub — conservées dans le bilan (`review-exports/veille-associative-2026-11-05/`).
- Utilité éditoriale : à apprécier sur les décisions réelles après activation (propositions retenues/refusées, charge de revue), avec les journaux existants.
