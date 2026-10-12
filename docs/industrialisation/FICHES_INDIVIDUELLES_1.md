# Fiches individuelles #1 — deux fiches, une seule mémoire (12/10/2026)

_Brouillons de revue : rien n'est déployé, rien n'est publié, aucune écriture Neon, aucun message Telegram envoyé. Les fiches n'existent que sous `/brouillons/affaires/` (build `SNY_DRAFTS=1`)._

## Ce qui a été construit (petit)
| Élément | Rôle |
|---|---|
| `scripts/project-evenements.mjs` → `data/evenements.json` | pont Neon → pages : événements VALIDÉS des affaires publiques (lecture seule, liste blanche, un fait = un événement) |
| `web/src/lib/fiche.ts` | `derouleCommun()` : entrées du dossier alignées sur Neon (`event_id`), événements validés manquants ajoutés (opt-in `suivre_neon`) |
| `Dossier.astro` (Hub) | lit le même `derouleCommun()` — sortie des 3 hubs publics **identique** hors la seule entrée ajoutée à Titon |
| `Fiche.astro` + `brouillons/affaires/[id].astro` | la fiche ; liste explicite de 2 affaires |
| `data/hub-matiere/isoles.json` | dossier des affaires hors hub, **même forme** que les dossiers de hub |
| `scripts/qa/test-fiches.mjs` | liens d'événements, réactions attribuées, rien de privé |

Aucune nouvelle table, aucun workflow, aucun bot, aucun CMS.

## Comparaison Home / Hub / Fiche (Titon, POC-09)
| Contenu | Home | Hub Paris 11e | Fiche |
|---|---|---|---|
| Résumé | état + phrase (wording partagé) | `etat_actuel` (3 phrases du dossier) | **le même `etat_actuel`** + « faits tels que rapportés » (nouveau) |
| Chronologie | — | déroulé du dossier | **le même `derouleCommun()`** : une seule rédaction, deux rendus |
| Sources | 1 source d'état (lien perdu) | sources du dossier | liste consolidée, chaque source une fois, celles non rattachées signalées |
| Réponses institutionnelles | — | groupes transversaux (Ville, parquet, Parlement…) | **directement liées** : ministre (parole établie), parties civiles (position attribuée) |
| Contexte territorial | — | oui (c'est sa raison d'être) | un lien, rien de plus |
| Inconnues | — | celles du dossier | les mêmes + une (position Ville/rectorat sur ce jugement) |

Répétitions : l'état et le déroulé sont répétés Hub ↔ fiche **par construction** (même objet). Honnêtement, pour Titon le Hub contient déjà un mini-dossier : la fiche n'ajoute que les faits allégués, les 2 réactions liées, une consolidation des sources et une URL stable. Une fois la fiche approuvée, le bloc Titon du Hub devrait devenir un résumé + lien « Voir la fiche » (à décider, mission 3).
Mobilisation du 18/06 (portée territoire) : placée **uniquement dans le Hub** (groupe « Familles… »), jamais dans la fiche.

## Réactions publiques réellement utilisées (relues sur le texte brut)
| Réaction | Classe | Où |
|---|---|---|
| Ministre de l'Éducation nationale, franceinfo 17/06 : « La justice, elle passe au regard d'un droit pénal… c'est le parquet qui décidera » — il n'a pas souhaité commenter | parole établie (son contenu n'établit rien sur l'affaire) | fiche |
| Parents parties civiles, communiqué relayé par ELLE 18/06 : « un profond soulagement » ; jugement « fondé sur des erreurs factuelles » | position attribuée | fiche |
| Rassemblement devant Saint-Dominique (7e) 18/06, « plusieurs centaines » (ELLE d'après Le Parisien) | position attribuée, portée territoire | Hub |
| Rectorat (Delle) : suspension à titre conservatoire, « ne fera pas d'autres commentaires » (ICI 27/03/2024) | mesure réalisée, attribuée au rectorat par le journal | fiche Delle, dans le déroulé (pas doublé en « réaction ») |
| Avocate de cinq familles (« le signal est dramatique ») | **piste** : non retrouvée dans le texte brut | non utilisée |
| Élu sur X espérant l'appel | **non publiable** (identité/qualité non établie) | non utilisée |
| Réactions de collégiens/parents à Delle (noms de personnes privées) | **non publiable** | non utilisée |

## Décisions de doctrine appliquées
Nom de la personne relaxée/condamnée : jamais. Nombre exact d'enfants : jamais (« plusieurs élèves », « certaines d'entre elles ») — les sources le donnent, SNY ne le publie pas. Détails graphiques, messages cités, âge de l'élève, déclaration de la victime à l'audience : exclus. Motif du jugement évoquant le « retentissement donné aux faits » : non repris (reproche d'imputation contesté par les parties civiles, lecture risquée hors contexte).

## Mémoire commune — ce qui existe et ce qui diverge
- Neon `case_events` de Titon : décision 16/06 (source franceinfo, **URL perdue**), appel (date **non établie**, rattaché à l'article ICI du **16/06**, alors que l'annonce de l'appel est dans l'article ICI du 17/06 « ce mercredi »).
- Le dossier du Hub porte la date 17/06 (article daté du 17/06, « a fait appel ce mercredi »). Règle : Neon prime quand il a une valeur, ne l'efface jamais par un `null` ; l'écart est **signalé** (`divergences`), pas tranché. À corriger par un ENRICHMENT validé (rattacher l'article du 17/06 à l'événement et le dater) — pas dans cette mission.
- Les sources lues pour les fiches (franceinfo 17/06, ICI 17/06, ELLE 18/06 pour Titon ; ICI 27/03/2024 pour Delle) ne sont pas rattachées à l'affaire dans Neon : la fiche les marque « lue pour cette fiche, pas encore rattachée ». À proposer en ATTACH (mission 3).

## Propagation Neon → fiche + Hub (test réel, sans mutation métier)
Reproductible : ajouter dans une copie de `data/evenements.json` un événement `voie_de_recours` daté du 01/12/2026 pour POC-09, `SNY_DRAFTS=1 astro build`, comparer le corps des 19 pages avant/après :
**modifiées : `/brouillons/affaires/poc-09`, `/territoires/paris-11e` et `/brouillons/territoires/paris-11e` (1 occurrence chacune, dans le dossier Titon) — identiques : toutes les autres** (fiche Delle, Bordeaux, Hautes-Alpes, Home, méthodologie). La Home n'est pas touchée par cette voie : elle suit `cases.json` (`etat`) par la chaîne existante `publier-evolutions`. Fichier restauré, aucun Neon.
Hubs publics sans cette ligne : corps **identique** au build de `origin/main`, sauf Paris 11e = +1 entrée « enquête / contrôle judiciaire » dans Titon et +1 réponse « rassemblement du 18/06 » (enrichissements volontaires).

## Propositions Telegram (prêtes, NON envoyées, non insérées en base)
**Callback à réutiliser** : le circuit « PUBLIER ? » — ligne `new_case_proposals` (clé `fiche|<case_id>`, recommandation REVIEW), Worker, journal, idempotence existants ; bouton VALIDATE (« APPROUVER LA FICHE »), REVIEW, REJECT. **Plus petite extension (mission 3)** : `payload.page` + une branche `boutonValable` + `messageFiche()` (~20 lignes) ; branche `p.page` dans `appliquer-nouvelles-affaires.mjs` qui consigne une revue « validé » `[Fiche approuvée <id8>]` — **sans publier** (publier la page ≠ publier l'affaire).

### Message 1 — POC-09 (École Titon, Paris 11e)
```
📄 FICHE · PROPOSITION DE VALIDATION · POC-09
École Titon · Paris 11e — affaire déjà publique (relaxe, appel du parquet)
Preview : http://localhost:4331/brouillons/affaires/poc-09/  (poste d'Adrien, serveur de revue)

Nouveau vs Home/Hub : faits allégués (sans nombre ni nom), 2 réactions liées attribuées
(ministre = parole établie ; parties civiles = position attribuée), sources consolidées, 1 inconnue ajoutée.
Même déroulé que le Hub (une seule rédaction).
Sources directes : franceinfo 17/06, ICI 17/06, ELLE 18/06 (relues sur le texte brut).
Inconnues : date de l'audience d'appel ; motifs connus par la presse seulement ; position Ville/rectorat.
À noter : l'événement « appel » de Neon est sans date alors que le dossier dit 17/06 (à consolider).
Diff public envisagé : +1 page /affaires/poc-09 ; Hub Paris 11e : +1 entrée dans Titon (enquête/contrôle
judiciaire) et +1 réponse « rassemblement du 18/06 » ; Home inchangée.
APPROUVER LA FICHE = GO éditorial de la PAGE uniquement (n'affecte pas la publication de l'affaire).
🟡 REVIEW : rien publié · ⛔ REJECT : page écartée.
```
### Message 2 — FR-2026-0042 (Collège Jules-Ferry, Delle)
```
📄 FICHE · PROPOSITION DE VALIDATION · FR-2026-0042
Collège Jules-Ferry · Delle (Territoire de Belfort) — affaire publique, condamnation non définitive
Preview : http://localhost:4331/brouillons/affaires/fr-2026-0042/

Nouveau vs Home : déroulé daté en 7 étapes (faits, plainte, garde à vue, mise en examen, suspension par le
rectorat, audience, condamnation), faits tels que rapportés (sans âge, sans citation des messages), 3 inconnues.
Sources directes : L'Est Républicain 16/12/2025, France 3 27/03/2024 (déjà rattachées) + ICI 27/03/2024
(NOUVELLE : à rattacher à l'affaire, ATTACH distinct).
Inconnues : appel ; suites administratives ; rien entre mars 2024 et décembre 2025.
Aucun Hub. Diff public envisagé : +1 page /affaires/fr-2026-0042 ; Home inchangée.
APPROUVER LA FICHE = GO de la PAGE uniquement.   🟡 REVIEW · ⛔ REJECT
```
Limite : une « preview » sur `localhost` n'est consultable que depuis ce poste ; une preview partageable (téléphone) suppose un déploiement de revue protégé — non fait ici.

## Mise à jour future (périmètre déjà approuvé)
Un UPDATE validé (ACCEPT d'état → `case_events`) → `project-public` (Home) + `project-evenements` (fiche + Hub via `derouleCommun`) : **aucune seconde rédaction**. Reste à brancher `project-evenements` au workflow existant (mission 3). Hors périmètre approuvé (nouveau type de contenu, texte éditorial, contradiction) → REVIEW.

## Verdicts
- **Fiche riche (Titon) : GO conditionnel** — valeur réelle mais modérée sur le Hub (faits, réactions liées, sources, URL stable) ; condition : réduire le bloc Titon du Hub à un résumé + lien après approbation, sinon doublon d'affichage.
- **Fiche pauvre (Delle) : GO** — dépasse nettement la Home (déroulé 7 étapes, mesure du rectorat, inconnues) avec 3 articles. Limite : matière plus riche que la moyenne des fiches à 2 sources ; une affaire à 1 source n'apporterait presque rien.
- **Complémentarité Hub / fiche : partielle** — démontrée pour la donnée (un événement → deux rendus), pas encore pour l'usage (Home sans lien vers la fiche ; Hub qui répète le déroulé).

## Limites et QA
`run-all` : QA_PASSED (+ `test-fiches`) ; build par défaut : 0 page de fiche, `/affaires/…` → 404 ; hubs publics identiques hors Titon. Contrôles visuels : textes vérifiés par lecture de page ; captures impossibles (pane du navigateur masqué : délai d'écran, largeur 0) — le mobile 375 px n'a pas pu être mesuré (mises en page à grille repliée sous 600 px selon le CSS, non observée). En-tête global : bouton « Nous contacter » déborde en largeur étroite (préexistant, hors fiche).
