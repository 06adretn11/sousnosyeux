# Hubs pilotes — Paris 11e et Landes : qualité éditoriale et maintenance (dossier de décision, 29/10/2026)

*Branche `hubs/pilotes-qualite-maintenance`, partie de `origin/main` 7c4eb7a (27/10/2026). Rien n'est publié : la production sert la version actuelle tant que le GO n'est pas donné.
Aucune fiche, empreinte, décision ou manifeste du lot en revue (`ids-go-lot-stock-27-10.json`) n'est touché ; aucune des 11 affaires des pilotes n'y figure.*

## Entrée synthétique

| # | Point | Réponse courte |
|---|---|---|
| 1 | **Périmètre** | **Paris 11e** (9 affaires, dense) et **Landes** (2 affaires, moins dense). Landes plutôt que Hautes-Alpes (deux affaires jugées, peu d'évolutions attendues) ou Bordeaux (plus dense) : Hub le plus récent (26/10), aucune dépendance au lot en revue, une audience attendue (Mées), une fiche approuvée (Tarnos) pour éprouver la cohérence Hub/fiche. |
| 2 | **Aperçus** | [Aperçu Paris 11e](https://github.com/06adretn11/sousnosyeux/blob/hubs/pilotes-qualite-maintenance/docs/industrialisation/hubs-pilotes/APERCU_PARIS_11E.md) · [Aperçu Landes](https://github.com/06adretn11/sousnosyeux/blob/hubs/pilotes-qualite-maintenance/docs/industrialisation/hubs-pilotes/APERCU_LANDES.md) (texte du rendu réel + liste des différences). Page rendue par Cloudflare (build de la branche réussi) : https://hubs-pilotes-qualite-maintenance-sousnosyeux.adr-etn.workers.dev/territoires/landes/ — **non ouvrable depuis le poste Cdiscount** (le proxy bloque `*.workers.dev`), à ouvrir depuis un autre réseau. |
| 3 | **Différences** | Paris 11e : rapport du Sénat publié (la page dit encore « conclusions non publiées »), commission indépendante installée, source du chiffre des relaxes, dossier Faidherbe (PARIS-009) relu sur l'article entier. Landes : réponses de la Ville de Tarnos (réunion tenue, aides votées, plan d'action), voix des familles, divergence de date sur la remise en liberté. Détail en §3. |
| 4 | **Versions soumises** | Matière **Paris 11e `165d248c53255f5d`** (servie : `78f0f34344455b70`) · Matière **Landes `7d109f47a5f5830c`** (servie : `e586ef52027a18dd`) · code : commits de la branche listés en §4. Empreinte = mécanisme existant (`hashMatiere`, sha256 canonique, 16 caractères). |
| 5 | **Maintenance** | Cinq comportements éprouvés (§5) : 4 sur 5 avec une trace ou une observation **réelle** de production, tous avec un **rejeu isolé** (7/7 scénarios OK). Deux défauts trouvés et corrigés : un Hub contredisait la carte après une évolution judiciaire ; la proposition Telegram ne nommait ni le Hub ni le bloc concernés. |
| 6 | **Exceptions** | 5 points, tous **indépendants du GO** des deux Hubs (§6) : carte PARIS-009 ; fiche de Tarnos (date, « municipal ») ; Bullourde ↔ Belzunce (lié au lot en revue) ; doublon possible Hub rédigé / information validée ; accès techniques. |
| 7 | **GO** | Quatre éléments approuvables séparément (A Paris 11e · B Landes · C garde-fou d'état · D proposition Telegram). Après GO : fusion → build Cloudflare → contrôle des pages servies (§7). |

## 1. Apport de chaque Hub (au-delà des fiches)

**Paris 11e — « Où en est chacune des neuf procédures, et qu'ont fait, ou seulement annoncé, les pouvoirs publics ? »** Le Hub donne l'état comparé des neuf affaires (deux relaxes frappées d'appel, deux mises en examen, trois enquêtes, deux plaintes), la chronologie des réponses publiques en distinguant l'annonce du fait documenté (plan d'action annoncé en avril ; commission annoncée le 9 juin, **installée en juillet** ; rapport du Sénat **présenté le 15 octobre** : des recommandations, pas des mesures), et ce qui reste introuvable (dates d'audience d'appel, conclusions de la commission, parole de l'Éducation nationale).

**Landes — « Dans deux affaires sans jugement, qui a répondu, comment, et que sait-on de la suite ? »** Le Hub met côte à côte la réponse judiciaire (parquet de Dax), administrative (Éducation nationale à Mées) et municipale (Tarnos : réunion, aides votées, plan à horizon juin 2027), la position des familles et de leur avocat, et les divergences des sources (date de remise en liberté, type d'école, statut du centre de loisirs).

Ni l'un ni l'autre ne conclut sur une cause, une tendance ou un risque territorial ; les deux disent que leur corpus n'est pas exhaustif.

**Conservé tel quel** (déjà satisfaisant) : 7 des 9 dossiers de Paris 11e (seules les dates de recherche de POC-05 et le dossier PARIS-009 changent), les repères et chiffres hors relaxes, le bloc Justice ; le dossier de Mées (sauf un type d'étape et deux inconnues) ; **les dossiers des fiches approuvées de Titon (POC-09) et de Tarnos (FR-2026-0115), inchangés à l'octet** (empreintes `b1389eedbc0e7c7d` et `4af66277ad3e802e` identiques) ; les Hubs Bordeaux / Gironde et Hautes-Alpes (texte visible identique au rendu actuel).

## 2. Méthode et sources

Inventaire (dépôt, artefact public, `evenements.json`, journaux GitHub Actions) → recherche de presse ciblée sur les manques (Bing Actualités RSS, 29/10/2026 ; une requête par affaire et par réponse publique) → **lecture du texte de chaque article retenu** par l'extracteur du dépôt (`corps-article.mjs`), relevé des phrases utilisées → rédaction attribuée → rendu construit et relu.
Sources ajoutées, toutes lues (partie libre pour Sud Ouest) : TIME France 16/10, France 24 15/10, Ouest-France 15/10 et 01/07, BFMTV 10/07, Le Parisien 20/11/2025 (corps désormais lisible), Sud Ouest 18/07, 09/09 et 07/10, ICI 01/09 et 08/10. Écartées : Mediapart et Libération (payants, doctrine), Le Parisien 15/10 (réaction de la Ville au rapport : accès abonnés), auditions Hidalgo/Grégoire au Sénat (septembre, hors manque identifié).
**Rien de postérieur trouvé** pour : audiences d'appel Titon et Baudin, Servan, Bullourde, Voltaire, Parmentier, Lagon des Ours, jugement de Mées, nouvelles étapes à Tarnos.

## 3. Différences proposées

### Paris 11e (matière `165d248c53255f5d`)

| Manque ou défaut initial | Apport | Sources lues | Portée exacte | Limite restante |
|---|---|---|---|---|
| « Conclusions non publiées » (repères, bloc Parlement, limites) : **faux depuis le 14-15/10** | Rapport adopté à l'unanimité le 14/10, présenté le 15/10 : 25 propositions en 5 axes (4 citées) ; « défaillances systémiques » attribué au rapport | TIME France 16/10 ; France 24 15/10 ; Ouest-France 15/10 | recommandations, pas des mesures | suites non documentées ; « commission d'enquête » (Le Monde, Ouest-France) vs « commission de la culture » (TIME) : libellé des premiers conservé |
| Commission indépendante : seulement « annoncée » | Installée début juillet, travaux commencés ; conclusions espérées début 2027 (dit par son président) | Ouest-France 01/07 ; paris.fr | annonce → mise en place documentée | conclusions non publiées au 29/10 |
| Chiffre « 2 relaxes, toutes deux frappées d'appel » sourcé par un article du 17/06, **antérieur à la seconde relaxe (07/07)** | Source remplacée par un article qui rapporte les deux appels | BFMTV 10/07 | inchangée | — |
| PARIS-009 : « SNY n'a pu lire que le titre » et **note interne publique « À revoir avant publication d'un hub »** | Corps lu : une animatrice suspendue ; selon la Ville, « violences éducatives ordinaires », pas de faits sexuels ; « l'enquête » évoquée par un parent sans nature précisée ; distinction avec l'animateur visé par un signalement pour agression sexuelle | Le Parisien 20/11/2025 | dossier du Hub seulement | **carte « enquête » non étayée → exception E1** |
| Dates de recherche « au 10 octobre » | « au 29 octobre 2026 » (POC-05, limites, « Ce que nous avons cherché ») | recherche du 29/10 | — | — |
| Informations validées affichées **en fin de bloc, hors chronologie** (nov. 2025 après sept. 2026) | Insertion à leur place chronologique, ordre rédigé intact (code) | — | blocs « Ville… » et « Familles… » | — |
| Note de lieu « les sources ne permettent pas d'établir s'il s'agit d'une ou de deux procédures » (Faidherbe), devenue inexacte | Note neutre ; le lien est dit dans chaque dossier (code) | — | — | — |

### Landes (matière `7d109f47a5f5830c`)

| Manque ou défaut initial | Apport | Sources lues | Portée exacte | Limite restante |
|---|---|---|---|---|
| Réunion du 15/07 « annoncée, sans confirmation de sa réalisation » | Tenue, « sous haute tension » ; soutien psychologique annoncé | Sud Ouest 18/07 | annonce → fait documenté | — |
| Aucune trace des aides aux familles ni du plan municipal | Fonds proposé par le maire ; aides votées en conseil extraordinaire le 23/07 ; plan en 4 axes présenté le 7/10, à déployer d'ici juin 2027 ; mesures pratiques **selon la Ville** | Sud Ouest 18/07 et 07/10 ; ICI 08/10 | annonces et vote, attribués | mise en œuvre non documentée ; montants non repris |
| Aucune voix des familles de Tarnos | Avocat d'une partie civile (conteste la remise en liberté) ; collectif SOS Périscolaire ; marche blanche (date non précisée) | Sud Ouest 09/09 ; ICI 01/09 et 08/10 | positions attribuées | nombres de familles/plaignants volontairement non repris |
| « Remis en liberté en août, selon La Dépêche » (une seule version) ; « centre de loisirs municipal » | Deux versions attribuées (« près de quinze jours plus tard », Sud Ouest ; août, La Dépêche) ; « municipal » retiré du repère | Sud Ouest 09/09 ; ICI 08/10 (centre géré par une association en délégation de service public) | repère du Hub | fiche de Tarnos : **exception E2** |
| Mées : réunion du 23/09 typée « mesure de la collectivité » (initiative de l'inspectrice d'académie) ; type d'école non signalé | « Mesure de l'État » ; inconnue « maternelle (25/09) / élémentaire (29/09) » | Sud Ouest 25 et 29/09 ; ICI 25/09 | dossier de Mées | — |

**Invisible mais nécessaire à la maintenance** : l'état de la carte au moment de la rédaction (`statut_affiche`) est désormais porté par tous les dossiers sans fiche approuvée (5 ajouts, valeurs identiques aux cartes actuelles : aucune différence affichée).

## 4. Versions soumises

| Élément | Référence exacte | Fichiers |
|---|---|---|
| **A. Matière Paris 11e** | empreinte `165d248c53255f5d` (servie : `78f0f34344455b70`) | `data/hub-matiere/paris-11e.json` |
| **B. Matière Landes** | empreinte `7d109f47a5f5830c` (servie : `e586ef52027a18dd`) | `data/hub-matiere/landes.json` |
| **C. Garde-fou d'état et ordre des blocs** | commit `6f15986` (partie code) | `web/src/lib/territoires.ts`, `web/src/components/Dossier.astro`, `web/src/components/territoires/Paris11e.astro`, `web/src/pages/territoires/[hub].astro`, `web/src/lib/hub-matiere.ts`, tests |
| **D. Proposition Telegram** | commits `a5f8c63`, `19eb73e`, libellé dans `553eb81` | `scripts/lib/destinations.mjs`, `scripts/lib/discovery-messages.mjs`, `scripts/telegram-v0.mjs`, test |

Inchangés et vérifiés : les 32 fiches approuvées (empreinte courante = empreinte approuvée), matières Bordeaux / Gironde `b8ade36dbcdab19a`, Hautes-Alpes `797c632b421d3947`, isolées `cbcfa37df240dfa9`. Calcul : `node <scratch>/empreintes.mjs <dépôt>` ou `hashMatiere()` de `scripts/lib/hub-publication.mjs`.
QA complète `scripts/qa/run-all.mjs` : **QA_PASSED** (les 8 constats « corpus » sont les mêmes sur `origin/main`, non bloquants).

## 5. Preuves de maintenance

Chaîne réelle du projet : signal (Maintenance / Discovery) → preuve (passage d'article) → proposition Telegram → clic (webhook → `sny-telegram` / `sny-clics`) → `appliquer-decisions` → `project-evenements` (destinations calculées) → commit `main` → build Cloudflare → `verifier-site --hubs` → confirmation Telegram. Pour une **réécriture rédigée** de Hub (ce dossier) : proposition (PR + aperçu) → GO écrit → fusion → build → contrôle des pages servies.
Rejeu : [`hubs-pilotes/rejeu-maintenance.mjs`](https://github.com/06adretn11/sousnosyeux/blob/hubs/pilotes-qualite-maintenance/docs/industrialisation/hubs-pilotes/rejeu-maintenance.mjs), résultats [`preuves/rejeu-resultats.json`](https://github.com/06adretn11/sousnosyeux/blob/hubs/pilotes-qualite-maintenance/docs/industrialisation/hubs-pilotes/preuves/rejeu-resultats.json) (copies jetables, aucune écriture Neon, aucun envoi).

| Comportement | Cas | Réel / rejoué | Environnement | Attendu | Observé | Trace |
|---|---|---|---|---|---|---|
| **1. Évolution approuvée** | Paris 11e : rassemblement de parents (RFI, 21/03), information territoriale | **réel** — décisions ACCEPT lues en base par le workflow (dont `8a7830d4`, provenance FR-2026-0004 sous HOLD, non exposée ; correspondance proposition ↔ information non relue en base) | production | seul le bloc « Familles… » du Hub 11e change | projection « 1 nouvelle · hubs [paris-11e] » ; commit `67f7523` = +27 lignes de `evenements.json` et rien d'autre ; `verifier-site --hubs paris-11e` : **site conforme** (essai 3/12) | run `sny-clics` [40300796657](https://github.com/06adretn11/sousnosyeux/actions/runs/40300796657) (26/10, 09:36 UTC) |
| | POC-05 Baudin : carte « procès » → **relaxe + appel** (publiée le 07/10, `8d9e9fd`) | **rejeu historique** (dossier reconstitué à l'état « procès ») | copies locales, code actuel puis proposé | le Hub suit la carte, sans lecture périmée | **code actuel : « Procès » + « le procès se tient » à côté de la puce « Appel », carte = relaxe → contradiction** ; code proposé : état de la carte, lecture retirée, mention « rédigé avant cette évolution », bandeau de page ; la colonne « dernière étape datée » reste celle du dossier rédigé (audience du 26/05) jusqu’à sa réécriture | `rejeu-resultats.json` |
| | Landes : information validée (mobilisation, Mées) | rejeu (fait construit, approbation simulée) | copie locale | destination = Hub Landes, bloc « Familles… » ; aucune autre page | 1 seule page changée ; insertion après la réunion du 23/09 | idem |
| | Landes : réponses de Tarnos (ce dossier) | **réel** (articles), **non approuvé** | branche | blocs « Collectivités… » et « Familles… », repères | voir aperçu Landes ; dossier de la fiche de Tarnos intact | aperçu, empreintes |
| **2. Sans effet utile** | FR-2026-0139 (Lingolsheim, Bas-Rhin) : 2 informations validées | **réel** — ACCEPT `5fd1d98c` | production | aucun Hub touché | « pages concernées : fiches [FR-2026-0139] hubs [—] » | run `sny-telegram` [40329135968](https://github.com/06adretn11/sousnosyeux/actions/runs/40329135968) (26/10, 13:16 UTC) |
| | Mesure de portée « Bordeaux » ; plan de Tarnos du 07/10 déjà rédigé | rejeu (calcul réel) | fonctions pures | aucune page Landes ; doublon signalé | « Bordeaux » → Hub Bordeaux seulement ; plan → « **déjà dans ce bloc à cette date** » dans la proposition | [`proposition-telegram-tarnos.txt`](https://github.com/06adretn11/sousnosyeux/blob/hubs/pilotes-qualite-maintenance/docs/industrialisation/hubs-pilotes/preuves/proposition-telegram-tarnos.txt) |
| **3. Rejeu** | Projection relancée après la publication RFI | **réel** | production | rien de neuf | « 3 informations (0 nouvelle) · hubs [—] » ; NO_PUBLIC_CHANGE, aucun commit | run [40302470620](https://github.com/06adretn11/sousnosyeux/actions/runs/40302470620) (26/10, 09:49 UTC) |
| | Même information validée deux fois ; projection et construction rejouées | rejeu | copie locale | une information, rendu identique | 1 information ; projection identique ; 0 page changée | `rejeu-resultats.json` |
| **4. Non approuvée** | Ce dossier face au site servi | **observation réelle** | sousnosyeux.org (lecture) | la production garde la version approuvée | « Conclusions non publiées » encore servi ; rapport du 15/10 seulement sur la branche | `rejeu-resultats.json` (lecture du 29/10) |
| | Information en REVIEW ou sans décision | code + QA existante | — | jamais projetée | `lireMatiereValidee` ne lit que `decision = 'ACCEPT'` ; QA « REVIEW ne publie rien » verte | `scripts/lib/matiere-validee.mjs` |
| **5. Rectification** | 4 mentions périmées des deux Hubs | proposition réelle | branche | aucune ne subsiste à côté de sa correction | 0 reste (contrôle automatique) | `rejeu-resultats.json` |
| | Information validée rectifiée (« mise en œuvre » → « annoncée ») | rejeu | copie locale | remplace l'ancienne | ancien libellé absent, nouveau présent, 1 page ; contrôle `verifier-site` conforme | idem |

**Niveaux de preuve.** *Génération locale correcte* : tous les scénarios. *Transport et décision observés* : décisions ACCEPT lues en base par les workflows réels (journaux) ; le clic lui-même et la confirmation Telegram de ces runs ne sont pas relus ici (base inaccessible depuis ce poste ; la trace de confirmation n'existe que depuis le 27/10, #62). *Publication vérifiée* : `verifier-site` « site conforme » sur la page servie pour le cas RFI. **Aucun message de test n'a été envoyé dans le canal de production.**

**Proposition Telegram actionnable** (rendu réel du message, `proposition-telegram-tarnos.txt`) : ce qui change (libellé + passage probant), pourquoi (source datée, lien), **Hub et bloc concernés avec l'adresse de la page** (nouveau), **doublon probable signalé** (nouveau), fiche concernée, action exacte (VALIDATE / REVIEW / REJECT et leur effet). Avant : « Utilisation possible : fiche individuelle et Hub du territoire », sans Hub nommé ni lien.

## 6. Exceptions (aucune ne bloque A, B, C ou D)

| # | Sujet | Établi | Dépendance / blocage | Décision nécessaire |
|---|---|---|---|---|
| E1 | **Carte PARIS-009** (Faidherbe) « enquête » | Article lu : suspension d'une animatrice pour « violences éducatives ordinaires » selon la Ville ; « enquête » non précisée ; aucune enquête pénale rapportée | carte = décision humaine ; le Hub dit le doute | (a) conserver « enquête » avec la réserve écrite dans le Hub (recommandé tant qu’aucune source ne précise) ; (b) retirer la carte (aucune procédure établie). « À qualifier » serait bloqué par la règle R5 sans fiche approuvée. |
| E2 | **Fiche approuvée de Tarnos** (FR-2026-0115), hors périmètre | Mise en examen datable au **8 juillet** (Sud Ouest 09/09) alors que la fiche dit « date non établie » et l'aperçu du Hub l'affiche après la remise en liberté d'août ; remise en liberté datée différemment selon les sources ; centre géré par une association en DSP (ICI 08/10) alors que la carte dit « municipal » | relève du chantier des fiches ; le Hub n'y touche pas (empreinte intacte) et ne contredit pas la fiche (versions attribuées) | à traiter dans la revue des fiches (mise à jour de fiche + libellé de carte) |
| E3 | **Bullourde ↔ Belzunce** | Le Figaro 18/05, Le Parisien 22/05, JDD 23/05 : animateur maintenu en poste malgré une plainte de 2024 (Belzunce, FR-2026-0024) puis mis en examen pour des faits à Bullourde (POC-06) | FR-2026-0024 est l'exception B1 du lot en revue : rien n'est intégré au Hub | après l'arbitrage B1 : décider si le Hub mentionne le lien (avec sources lisibles) |
| E4 | **Doublon possible** information validée / texte rédigé d'un Hub | un Hub rédigé n'est pas une mémoire de faits : une information déjà écrite peut être reproposée | atténué : la proposition le signale (§5) ; rien n'est masqué (sinon `verifier-site` échouerait) | aucune maintenant ; suppression complète = enregistrer les réponses rédigées comme faits en mémoire (chantier distinct) |
| E5 | **Accès** | `.env.local` refusé dans cette session (pas de lecture Neon directe) ; `*.workers.dev` bloqué par le proxy ; Libération (403) et parties abonnés de Sud Ouest / Le Parisien non lues | aucune donnée n'a été déduite de ce qui n'a pas été lu | aucune ; l'événement Neon `8fda8846` (plan de Tarnos, validé **sans source** dans la projection) reste non affichable — à sourcer si utile |

## 7. Action du GO

**Formulation attendue** (un GO peut ne couvrir qu'une partie) : « GO Hubs pilotes : A paris-11e `165d248c53255f5d`, B landes `7d109f47a5f5830c`, C, D ».

Après GO, dans l'ordre :
1. Vérifier que les empreintes de la branche sont celles du GO et que `main` n'a pas modifié `paris-11e.json`, `landes.json` ni les fichiers de C/D depuis `7c4eb7a` (sinon : rebase, recalcul, nouveau GO si le rendu change).
2. Retirer de la PR ce qui n'est pas couvert (fichier par fichier : A, B, C, D sont séparables), relancer la QA (`QA_PASSED` exigé), fusionner sur `main`.
3. Attendre le build Cloudflare de `main` (check « Workers Builds »), puis contrôler les **pages servies** : Paris 11e contient « rapport présenté le 15 octobre 2026 » et ne contient plus « Conclusions non publiées » ni « À revoir avant publication » ; Landes contient « 23 juillet 2026 » et « Me Mehdi Boudjenane », et ne contient plus « Mesure annoncée, sans confirmation » ; les fiches `/affaires/poc-09/` et `/affaires/fr-2026-0115/` sont inchangées ; `node scripts/verifier-site.mjs --hubs paris-11e,landes` conforme (informations validées présentes).
4. Rendre compte : préparé / approuvé / appliqué / déployé / vérifié, avec l'URL de chaque page et le commit de `main`.

## Reprise hors de cette conversation

Worktree `C:/Users/adrien.etienne/sny-worktrees/hubs-pilotes` (branche `hubs/pilotes-qualite-maintenance`). Rejeu : deux copies jetables (`git worktree add --detach <dossier> origin/main` et `… <dossier> hubs/pilotes-qualite-maintenance`, `npm ci` à la racine et dans `web/`) puis
`node docs/industrialisation/hubs-pilotes/rejeu-maintenance.mjs --base <copie main> --nouveau <copie branche> --sortie docs/industrialisation/hubs-pilotes/preuves` (poste Cdiscount : `NODE_TLS_REJECT_UNAUTHORIZED=0`).

## Note de sécurité

- **But** : contenus de deux Hubs ; affichage cohérent avec la carte ; proposition Telegram plus précise. **Installation** : aucune (fichiers du dépôt ; scripts exécutés par les workflows existants). **Au démarrage** : rien.
- **Réseau** : inchangé (Telegram, Neon) ; le code ajouté ne lit que des fichiers du dépôt. **Privilèges** : inchangés. **Données personnelles** : aucune personne mise en cause nommée ; seules des personnes publiques nommées par la presse (élus, magistrats, un avocat de partie civile) ; aucun nombre d'enfants.
- Revue sécurité non requise (rien au démarrage, aucune élévation) ; `telegram-v0.mjs` modifié (contenu d'un message) : relecture conseillée avant fusion.

## GO reçu (29/10/2026)

« GO Hubs pilotes : A paris-11e 165d248c53255f5d, B landes 7d109f47a5f5830c, C, D » — écrit par Adrien dans la session de préparation.
Vérifié avant application : empreintes de la branche identiques à celles du GO ; `main` inchangé depuis `7c4eb7a` sur les fichiers concernés ; production encore sur l'ancienne version (rien d'appliqué) ; QA_PASSED ; 32 fiches approuvées inchangées. Périmètre appliqué : A, B, C, D, sans exclusion.
