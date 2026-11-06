# VEILLE ASSOCIATIVE #2 — raccord éditorial des déclarations d'organismes

_Complément du 06/11/2026 au lot « veille associative » (PR 89/90). Rien n'est fusionné, activé ni écrit en production par ce complément ; le GO technique et l'approbation éditoriale du contenu restent distincts._

## 1. Le défaut constaté en exploitation
Premier cycle actif (run 42197647709) : la proposition `f1daa077` (L'Enfant Bleu, 21/07/2026 → POC-05) était jugée utile mais **partait en information sans bouton**, sans décision possible ni intégration.

**Point précis du blocage** — trois conditions cumulées :
1. `telegram-v0.mjs` (notificateur) : `r.decl ? info(…)` — toute publication d'organisme suivi était routée vers l'information, jamais vers la demande de décision.
2. Le fait de la proposition (`event_type: 'declaration_organisme'`, sans `mesure` ni `libelle_public`) n'était pas un « fait structuré » du circuit d'enrichissement existant : ni `decisionReactions`, ni l'application (`appliquer-decisions` branche ENRICHMENT), ni la projection (`lireMatiereValidee`) ne pouvaient le traiter.
3. La déduplication marquait la proposition comme « envoyée » (ligne `telegram_envois` `info`), donc jamais renotifiée.

Le parcours existant (clic → `decision` persistée → `appliquer-decisions --generique` écrit un `case_events` sans changement d'état → `project-evenements` projette dans la fiche approuvée et le Hub publié) existait déjà : **aucun changement d'état judiciaire fictif, aucun nouveau canal**.

## 2. Décision motivée sur f1daa077
**Ce que l'association déclare** (passage, paragraphe 2 de la page du 21/07/2026) : « En avril 2025, les parents de l'école Alphonse Baudin, dans le 11e arrondissement de Paris, apprenaient la suspension d'un animateur pour des faits d'agressions sexuelles, une affaire dans laquelle l'Enfant Bleu s'est constituée partie civile. »

| Question | Réponse |
|---|---|
| Rattachement | **Établi au niveau de l'affaire, pas d'une procédure.** Le texte ne se limite pas au nom de l'école : il date l'affaire (suspension d'un animateur en avril 2025, école du 11e), ce que le dossier SNY de POC-05 consigne (suspension le 09/04/2025) ; POC-05 est la seule affaire publique d'Alphonse-Baudin. La publication ne dit ni quelle procédure, ni quel stade (procès du 26/05, relaxe, appel) : le libellé proposé ne le dit pas non plus. |
| Déjà dans SNY ? | **Non.** Le Hub Paris 11e classe cette constitution de partie civile parmi les **inconnues** (« évoquée ailleurs ; elle n'est pas confirmée par les articles relus ») et n'a pas repris le communiqué du 12/05, jugé non relu. L'apport comble donc un manque réel — sans le trancher : il reste « selon l'association ». |
| Ajout utile | « Selon L'Enfant Bleu, l'association s'est constituée partie civile dans cette affaire ; la procédure concernée n'est pas précisée. Déclaration de l'association, non vérifiée par ailleurs. » — attribué, sans date de démarche (non écrite : jamais inventée), date de **publication** 21/07/2026 distincte. |
| Issue favorable | Préservée : le texte ne mentionne ni jugement, ni relaxe, ni appel, ni culpabilité ; l'état affiché de la fiche reste « relaxe / non-lieu / classement ». |
| Emplacement | Bloc **existant** « Familles, avocats, syndicats, associations » du Hub Paris 11e et section « Paroles et réactions » de la fiche POC-05 (étiquette « Mobilisation », nature du circuit existant — limite assumée, non modifiée). |
| Non retenu | La phrase sur la Convention citoyenne (Ville de Paris) : portée Paris, pas Alphonse-Baudin → aucun ajout à POC-05, aucun déplacement automatique vers un Hub. Le communiqué B reste suspendu (aucune école nommée). |
| À arbitrer par l'éditeur (hors lot) | Après un ACCEPT, la ligne « inconnue » du Hub sur la partie civile d'associations deviendra partiellement obsolète : ce n'est pas modifié ici (dossiers éditoriaux approuvés non repris). |

## 3. Le raccord (diff minimal)
| Fichier | Changement |
|---|---|
| `scripts/lib/sources-suivies.mjs` (v0.2.0) | `faitsDeclares` : vocabulaire **fermé** (une famille : constitution de partie civile) → fait structuré du contrat existant (`mesure`, libellé fermé « Selon <organisme> … », acteur, citation, `event_date` nul). Conditions : document rattaché par le texte ; sujet de la phrase = l'organisme suivi ; émetteur = l'organisme (ni reprise, ni article référencé, ni repli). `actionContinuite`, `aSolliciter`, `complementDecision` (fonctions pures). `classer` : plusieurs affaires, ou rattachement non plein → **suspendu**. |
| `scripts/maintenance-cycle.mjs` | Cherche la proposition existante (même affaire, même article, même empreinte, même moteur) : décidable → **reprise sur place** (mêmes `proposal_id` et historique, `UPDATE … where decision is null`) ; aucune → création ; décidée ou déjà décidable → rien. Un document rattaché est relu à chaque cycle (rares, bornés). |
| `scripts/telegram-v0.mjs` | Une publication d'organisme **avec fait décidable** suit le chemin d'enrichissement existant (3 boutons) ; sans fait décidable : information. Le message ajoute attribution, limites, rattachement et « Suite de l'information du … ». Sélection par `aSolliciter` (une seule demande, jamais après un écart). |
| `scripts/lib/evenement-institutionnel.mjs`, `scripts/appliquer-decisions.mjs` | `faitsStructures` : une seule définition du « fait décidable », lue par la demande **et** l'application. |
| Tests | `test-declaration-organisme.mjs` (22), `test-sources-suivies.mjs` (24, dont échéances), `demo-declaration-organisme.mjs` (vraie construction Astro, isolée) ; un test existant mis à jour (message + complément). `run-all` : 29/29. |

Aucune exception d'organisme, d'URL ou d'affaire (testé : même règle sur Colosse et une affaire de test). Aucun appel de modèle. Aucun nouveau canal, front, registre, cron, table ou formulaire.

## 4. Vérifications isolées (résultats)
- **Apport admissible** : fait → demande de décision (message ci-dessous) → ACCEPT → `appliquer-decisions` (événement `mobilisation`, `statut_apres` nul, libellé = libellé validé) → projection → **construction Astro réelle** : le texte exact apparaît dans `/affaires/poc-05/` et dans `/territoires/paris-11e/` (bloc des associations), l'issue favorable reste dite.
- **Sans ACCEPT** (refus, REVIEW, aucune décision) : pages **identiques** à la référence (seul ACCEPT alimente la matière). **HOLD** : aucune page ne change. Fiche non approuvée : Hub seul. Affaire non publique : rien.
- **Même établissement, procédure indéterminée** (deux affaires, même rôle) ; **nom d'école seul** : aucun rattachement, aucun fait.
- **Mémorisé** : `aSolliciter` — jamais envoyée → oui ; information envoyée + décidable → **une** demande ; demande déjà envoyée, ou écartée → non ; autre moteur → comportement historique. Reprise sur place : décidée/déjà décidable/inexistante → pas de doublon.
- **Autre organisme du corpus** (Colosse, 31/08) : `POSITION_GENERALE`, aucun fait — aucune proposition fabriquée.
- **Lecture réelle, en dry-run (Neon lu seulement)** : le corpus A–H, rejoué avec le nouveau code, retrouve f1daa077 et prédit `REPRISE_SUR_PLACE (decidable)`.

## 5. Effets exacts de l'activation et traitement de f1daa077
Après fusion, au **prochain passage productif** de `sny-cycle` :
1. Étape B : le document A (relu : rattaché) retrouve `f1daa077` (même empreinte) → ses `facts` et `payload` sont complétés **sur place** (aucune nouvelle ligne `state_proposals`, `source_resolutions` inchangé : pas de réimport).
2. Étape C : une **seule** demande Telegram à 3 boutons, titrée « Suite de l'information du 6 novembre 2026 (proposition f1daa077) ». Aucune nouvelle information sans bouton.
3. Passages suivants : aucune répétition (envoi `decision` enregistré).
4. Après un clic : VALIDATE → `ACCEPT` → étape E crée l'événement ; `sny-clics` (`project-evenements`, comme pour toute information validée) met à jour fiche et Hub déjà approuvés/publiés, puis vérifie le site ; REVIEW/REJECT : aucune écriture. **Aucune modification publique sans ce clic.**

## 6. Échéances des documents « connus récents »
- Règle : un document déjà lu avec succès n'est relu qu'à **7 jours** de sa dernière lecture (`checked_at`) ; sa **réapparition dans un index ne la modifie pas** (seule une lecture la réécrit) — prouvé par essai isolé (index qui relie le document chaque jour, échéance inchangée).
- Les 90 documents ont été lus le 06/11 à ~09:55 UTC : **échéance 13/11 ~09:55 UTC**, soit au passage du 13/11 s'il part après cette heure, sinon du 14/11. Une correction substantielle à URL constante est **réexaminée à cette échéance** (essai isolé : `MODIFIE` à J+7) — pas avant : le délai maximal de détection est de 7 jours (13 pour les pages de service rattachées : quotidien).
- Les documents rattachés à une affaire sont relus chaque cycle ; un échec conserve le dernier état réussi.

## 7. Observations de production encore indisponibles
- Résultat du **prochain passage productif** (07/11 attendu, fenêtre 6–17 h UTC) : absence de répétition, incidents visibles, nouvelles publications distinguées. Au 06/11 20:17 UTC, aucun passage productif n'a eu lieu depuis le premier (les runs de 14:22 et 17:23 ont été écartés par la garde).
- Le comportement de reprise sur place et de la demande « suite » n'a été vu qu'en isolation, pas en production.
