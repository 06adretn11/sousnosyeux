# VEILLE ASSOCIATIVE #2 — raccord éditorial des déclarations d'organismes

_Complément du 06/11/2026 au lot « veille associative » (PR 89/90), révisé le même jour (PR 91). Rien n'est fusionné, activé ni écrit en production par ce complément ; le GO technique (fusion) et l'approbation éditoriale du contenu (clic Telegram) restent distincts._

## 1. Le défaut constaté en exploitation
Premier cycle actif (run 42197647709) : la proposition `f1daa077` (L'Enfant Bleu, 21/07/2026 → POC-05) était jugée utile mais **partait en information sans bouton**, sans décision possible ni intégration.

**Point précis du blocage** — trois conditions cumulées :
1. `telegram-v0.mjs` (notificateur) : `r.decl ? info(…)` — toute publication d'organisme suivi était routée vers l'information, jamais vers la demande de décision.
2. Le fait de la proposition (`event_type: 'declaration_organisme'`, sans `mesure` ni `libelle_public`) n'était pas un « fait structuré » du circuit d'enrichissement existant : ni la demande, ni l'application (`appliquer-decisions`, branche ENRICHMENT), ni la projection (`lireMatiereValidee`) ne pouvaient le traiter.
3. La déduplication marquait la proposition comme « envoyée » (ligne `telegram_envois` `info`), donc jamais renotifiée.

Le parcours existant (clic → `decision` persistée → `appliquer-decisions --generique` écrit un `case_events` sans changement d'état → `project-evenements` projette dans la fiche approuvée et le Hub publié) existait déjà : **aucun changement d'état judiciaire fictif, aucun nouveau canal**.

## 2. Décision motivée sur f1daa077
**Ce que l'association déclare** (paragraphe 2 de sa page du 21/07/2026) : « En avril 2025, les parents de l'école Alphonse Baudin, dans le 11e arrondissement de Paris, apprenaient la suspension d'un animateur pour des faits d'agressions sexuelles, une affaire dans laquelle l'Enfant Bleu s'est constituée partie civile. »

### 2.1 Portée du rattachement (explicite)
- **Ce que la publication permet de relier : un contexte d'affaire, pas une procédure.** Elle atteste une école nommée **et** un fait daté (suspension d'un animateur en avril 2025). Elle ne dit ni quelle procédure, ni quel stade (procès du 26/05, relaxe du 07/07, appel) : le texte proposé ne le dit pas non plus et **n'associe pas la démarche à la procédure ayant abouti à la relaxe**.
- **L'unicité de POC-05 dans notre corpus ne sert pas de preuve d'identité.** Le rattachement repose sur l'ancrage écrit par la source, vérifié par le code : le mois et l'année cités doivent être **ceux de l'origine de la chronologie de l'affaire dans SNY** (événement le plus ancien : signalement et suspension du 09/04/2025). Sans mois écrit, avec le mois d'une étape ultérieure (« juillet 2026 »), ou si la chronologie de la fiche est plus étroite que ce que la source permet de relier (pas d'avril 2025) : **aucun fait décidable**, la publication reste une information (testé).
- **Correspondance avec POC-05** : la fiche couvre l'affaire dans son ensemble, de la suspension d'avril 2025 à la relaxe et à l'appel partiel du parquet — plus large que le contexte attesté, donc pas plus étroite que la source. Destination fiche : justifiée. Destination Hub : POC-05 est dans le périmètre du Hub Paris 11e ; le bloc d'accueil est un bloc **existant** (« Familles, avocats, syndicats, associations »).
- **Texte proposé** (libellé fermé, nomme le contexte attesté) : « Dans sa publication du 21 juillet 2026, L'Enfant Bleu revient sur la suspension d'un animateur en avril 2025 à l'école maternelle Alphonse-Baudin (Paris 11e). L'association indique s'être constituée partie civile dans cette affaire, sans préciser la date de cette démarche ni la procédure visée. Cette déclaration n'est pas confirmée par une autre source consultée. » La date de la **démarche** n'est pas inventée ; la date de **publication** (21/07/2026) est portée à part par la source.
- **Documentée, non confirmée** : la publication de l'association documente sa déclaration ; elle ne confirme indépendamment ni la démarche ni la procédure concernée.

### 2.2 Pourquoi ce cas diffère du contre-exemple « même établissement, rattachement insuffisant »
Le contre-exemple (deux affaires de même établissement et de même rôle) n'offre que **l'établissement** comme indice : rien ne départage les affaires, le rattachement est suspendu. Ici le texte porte **deux indices indépendants** — l'établissement et un fait daté — et ce fait coïncide avec l'**origine** de la chronologie de l'affaire ; une seule affaire s'y rattache pleinement (`MATCH`), et un second test écarte le cas où le mois attesté ne serait que celui d'une étape. Le test existant (deux affaires, même établissement) est conservé et reste vert.

### 2.3 Résultat éditorial cohérent après ACCEPT (une seule décision)
La même proposition, sous le même clic, porte :
1. **l'ajout** de la déclaration attribuée (fiche POC-05 « Paroles et réactions », bloc des associations du Hub Paris 11e) ;
2. **l'ajustement strict des deux inconnues directement concernées**, par remplacement **exact** de la phrase (si le texte actuel du dossier n'est plus celui attendu, rien n'est modifié) :
   - dossier POC-05 — avant : « Une constitution de partie civile d'associations est évoquée ailleurs ; elle n'est pas confirmée par les articles relus. » → après : « Une constitution de partie civile est déclarée par L'Enfant Bleu dans une publication du 21 juillet 2026 (déclaration non confirmée par une autre source consultée ; date de la démarche et procédure non précisées) ; pour d'autres associations, elle est évoquée ailleurs et n'est pas confirmée par les articles relus. »
   - inconnues transversales du Hub — la mention « le communiqué (PDF) n'a pas pu être relu : elle n'est donc pas reprise » devient « … : seule la déclaration de l'association du 21 juillet 2026 est reprise (attribuée, non confirmée par une autre source consultée). » (début de phrase inchangé).
   Les 4 autres inconnues du dossier et les autres inconnues transversales sont intactes ; l'état affiché (« relaxe / non-lieu / classement ») et le déroulé ne sont pas touchés.
3. Mécanisme : le fait porte `ajustements_inconnues` ; après ACCEPT, la projection existante (`project-evenements` → `data/evenements.json`, matière) les transmet et `web/src/lib/hub-matiere.ts` les applique à l'affichage (fiche **et** Hub). **Aucune écriture dans les fichiers éditoriaux du Hub**, aucun changement public avant le clic, et la même matière annule l'ajustement si l'information est retirée.

## 3. Le raccord (diff minimal)
| Fichier | Changement |
|---|---|
| `scripts/lib/sources-suivies.mjs` (v0.2.0) | `faitsDeclares` : une famille, fait structuré du contrat existant ; ancrage de portée sur l'origine de la chronologie ; ajustements stricts des inconnues ; `chargerContexteHub` (lecture seule). `actionContinuite`, `aSolliciter`, `complementDecision` (affiche aussi les inconnues ajustées). `classer` : plusieurs affaires, ou rattachement non plein → suspendu. |
| `scripts/maintenance-cycle.mjs` | Reprise **sur place** de la proposition existante (mêmes `proposal_id` et historique, `UPDATE … where decision is null`) ; création sinon ; rien si décidée ou déjà décidable. Un document rattaché est relu à chaque cycle. |
| `scripts/telegram-v0.mjs` | Fait décidable → chemin d'enrichissement existant (3 boutons), complété par attribution, limites, rattachement, inconnues ajustées, « Suite de l'information du … » ; une seule demande. |
| `scripts/lib/matiere-validee.mjs`, `scripts/lib/destinations.mjs` | Transmission des `ajustements` (seulement pour une information qui a une destination). |
| `web/src/lib/hub-matiere.ts` | `ajusterInconnues` : remplacement exact, fail-closed ; sans matière validée, aucun effet. |
| `scripts/lib/evenement-institutionnel.mjs`, `scripts/appliquer-decisions.mjs` | `faitsStructures` : une seule définition du « fait décidable » (demande et application). |
| Tests | `test-declaration-organisme.mjs` (26), `test-sources-suivies.mjs` (24, dont échéances), `demo-declaration-organisme.mjs` (vraie construction Astro isolée ; le fait y est **produit par le code** depuis la publication en fixture) ; `run-all` 29/29. |

Aucune exception d'organisme, d'URL ou d'affaire. Aucun appel de modèle. Aucun nouveau canal, front, registre, cron, table ou formulaire.

## 4. Portée exacte du correctif — ce qui n'est PAS couvert
- **Une seule famille est reconnue** : « s'est constitué(e) partie civile », sujet = l'organisme suivi, contexte daté attesté. Ce n'est **pas** un traitement général des publications d'organismes.
- **Les autres apports restent accessibles, sans taxonomie nouvelle** :
  - publication rattachée à une affaire mais hors famille (ou sans ancrage) → **information sans bouton** sur Telegram, qui dit désormais explicitement qu'aucune décision n'est demandée et que la publication reste consultable ;
  - rattachement suspendu, positions générales, ressources, signaux d'affaire possible, hors périmètre → **mémoire documentaire** (`source_resolutions` : méthode `SOURCE_SUIVIE/<destination>`, titre, adresse, empreinte ; relisible en lecture seule) et bilan de livraison ; aucune notification répétée ;
  - étendre la couverture = ajouter une ligne au vocabulaire fermé (libellé, motif, inconnue concernée) avec son test — décision éditoriale distincte.

## 5. Vérifications isolées (résultats)
- **Apport admissible** : fait → demande de décision → ACCEPT → `appliquer-decisions` (événement `mobilisation`, `statut_apres` nul) → projection → **construction Astro réelle** : déclaration fidèle, **inconnues ajustées** (fiche POC-05 ; Hub : inconnue transversale et phrase du dossier), issue favorable (« relaxe ») et **autres inconnues** préservées, limites d'attribution visibles.
- **Refus, REVIEW, aucune décision** (seul ACCEPT alimente la matière) : pages **identiques** à la référence. **HOLD** : ni la déclaration ni les inconnues ne changent. Fiche non approuvée : Hub seul. Affaire non publique : rien.
- **Portée** : mois absent / étape ultérieure / chronologie plus étroite / aucune chronologie → aucun fait ; deux affaires de même établissement et même rôle ; nom d'école seul → aucun rattachement.
- **Continuité** : `actionContinuite` (REPRENDRE / DEJA_PRESENTE / CREER) et `aSolliciter` (une demande, jamais de répétition, jamais pour un autre moteur) ; lecture réelle en dry-run (Neon lu seulement) : le corpus A–H retrouve f1daa077 → `REPRISE_SUR_PLACE (decidable)` avec le nouveau libellé.
- **Autre organisme du corpus** (Colosse) : même règle, aucune exception ; position nationale → aucun fait.

## 6. Effets exacts de l'activation et traitement de f1daa077
Au **prochain passage productif** de `sny-cycle` : (1) étape B : la proposition existante est complétée sur place (nouveau libellé, ajustements), sans nouvelle ligne et sans toucher `source_resolutions` ; (2) étape C : **une seule** demande à 3 boutons « Suite de l'information du 6 novembre 2026 », avec aperçu des pages et des inconnues ajustées ; (3) aucune répétition ensuite. Après un clic VALIDATE : événement sans changement d'état (étape E), puis `sny-clics` (`project-evenements`) met à jour fiche et Hub déjà publiés et vérifie le site. REVIEW/REJECT : aucune écriture. **Aucune modification publique sans ce clic.**

## 7. Échéances des documents « connus récents » — règle réelle
Un document déjà lu avec succès est **relu au premier cycle exécuté après l'expiration de 7 jours** depuis sa dernière lecture (`checked_at`). Le décalage réel dépend de la **cadence** des passages (un passage productif par jour dans une fenêtre horaire ; GitHub peut perdre des créneaux) et des **incidents** (un échec est retenté au cycle suivant). Il n'existe donc pas de délai maximal garanti de sept jours. La réapparition du document dans un index **ne repousse pas** l'échéance (prouvé en isolation). Une correction substantielle à URL constante est réexaminée à cette relecture (essai isolé : `MODIFIE`). Pour les 90 documents lus le 06/11 vers 09:55 UTC, la première relecture possible est le passage du 13/11 s'il part après cette heure, sinon celui du 14/11 — sous réserve de ces aléas. Les documents rattachés à une affaire sont relus à chaque cycle. Aucun changement d'ordonnanceur.

## 8. Observations de production encore indisponibles
- Résultat du prochain passage productif (07/11 attendu) : absence de répétition, incidents visibles, nouvelles publications distinguées. Au 06/11 20:17 UTC, aucun passage productif n'avait eu lieu depuis le premier.
- La reprise sur place, la demande « Suite » et l'ajustement des inconnues n'ont été vus qu'en isolation, pas en production.
