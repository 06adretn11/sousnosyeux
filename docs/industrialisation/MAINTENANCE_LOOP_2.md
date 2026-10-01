# MAINTENANCE LOOP #2 — réduire le bruit, chercher la preuve d'un claim

_30/09/2026 · Neon `neondb` / `migration-clean` · 56 affaires · DeepSeek `deepseek/deepseek-v4.1-flash`,
contrat v2 inchangé · **aucune mutation de `cases`** (vérifié : 0 `updated_at` du jour, 16 décisions humaines
inchangées) · preview front produite, **non publiée**_

> Le titre sert à décider où regarder. La source sert à décider ce qui est vrai.

Versions du code. Les chiffres du rejeu figé et du run réel ont été produits **avant** trois correctifs trouvés
par le contradicteur (§D : pont manuel contrôlé, affaires sœurs, cache d'analyse dans le run). Leur effet a été
revérifié sur les seuls cas touchés (Aqueduc, Saint-Dominique) ; les deux runs complets n'ont pas été rejoués.

---

## A. Avant / après — funnel chiffré

### Mêmes entrées, deux chaînes — rapport du 25/09 (140 signaux, état de l'époque, sans mémoire)

| | AVANT (`--legacy`) | APRÈS (par claim) |
|---|---|---|
| Signaux bruts | 140 | 140 |
| Exclus par le routage | 20 *(date seule)* | **20** : 2 `WRONG_SCOPE_CERTAIN` · 9 `CONTEXT_ONLY` · 9 `HISTORICAL…` — **chacun relu à la main : 0 contestable** |
| Continuent | 120 | 120 *(83 `POTENTIAL_UPDATE` + 37 `UNCERTAIN`)* |
| Unités à traiter | 97 « faits » | **71 claims distincts** |
| Bloqués sur une URL | **80** | **0** (plus de résolution d'URL) |
| Recherches de preuve | — | 96 requêtes |
| Sans source lisible qui nomme l'affaire | — | 20 |
| Sources lues, aucune suffisante | — | 7 |
| Dépassés par un claim établi de stade supérieur | — | 8 |
| **Preuve suffisante** | 17 documents (pont manuel) | **36 claims** (28 propres + 8 par la citation d'un autre claim) |
| Lectures DeepSeek | 9 (+8 réutilisées) | 47 · 0,14 $ |
| Changements d'état / ambiguïtés proposés | 8 | 24 lectures (17 + 7) → **12 événements distincts** parmi les claims prouvés |

**Rappel sur les vrais changements** — les 10 transitions validées par un humain le 25/09 :

| | |
|---|---|
| Présentes dans l'entrée | 9 (Titon n'y est pas : l'ancienne requête ne le remonte pas) |
| Atteignent un claim | **9 / 9** |
| Atteignent une preuve suffisante | **9 / 9** |
| Titon (appel) | retrouvé sur le rapport du 30/09 — §B.6 |

### Run réel — rapport du 30/09 (290 signaux, état après validation, mémoire chargée)

| | AVANT (`--legacy`, mêmes 290) | APRÈS |
|---|---|---|
| Signaux bruts | 290 | 290 |
| Déjà vus (mémoire) | 23 | 23 |
| `WRONG_SCOPE_CERTAIN` | — | 1 |
| `CONTEXT_ONLY` | — | 32 |
| `HISTORICAL_OR_ALREADY_KNOWN_CERTAIN` | *40 (date seule)* | 23 |
| `UNCERTAIN` (continue) / `POTENTIAL_UPDATE` | — | 89 / 122 |
| Unités à traiter | **209 faits** | 145 claims − 9 déjà établis (`case_events`) = **136 à prouver** |
| Bloqués / sans preuve | **204 (98 %)** | **65 (48 %)** : 44 sans source + 21 lus insuffisants |
| Preuve suffisante | 5 documents lus | **69 claims** (54 propres + 15 par citation) |
| Appels DeepSeek | 5 | 105 · 0,33 $ *(dont 40 relectures évitables, corrigées)* |
| Propositions écrites | 5 | 22 → **14 après la garde « affaire sœur »** |
| **Second cycle, même rapport** | — | **0 recherche · 0 appel · 0 page · 0 $ · 1,3 s** |

Décisions humaines attendues : **~4 réelles** (FR-2026-0003 et PARIS-010 → procès · POC-08 → enquête · FR-2026-0004
= fait déjà validé, fiche sous HOLD) **+ 4 ambiguïtés**, contre 9 décisions pour 15 propositions au lot #1.

Le run réel coûte 0,33 $ et 38 min (Bing 1,5 s/requête + 380 pages) ; c'est linéaire en claims, pas en signaux.

---

## B. Erreurs évitées — exemples réels

1. **Voltaire / Montpellier** — « un ex-animateur scolaire de Montpellier soupçonné de viol… » sous POC-08
   (Paris 11e) : `WRONG_SCOPE_CERTAIN`, sans lecture.
2. **Réquisitions Baudin** — « trois ans de prison, dont un ferme, **requis** » était étiqueté `condamnation` par
   la veille (terme « ans de prison »). Désormais `REQUISITION` ; jamais un verdict, jamais cherché avec « condamné ».
3. **Exclusion sur la seule date** (20 sur le rapport figé) remplacée par *acte + stade + chronologie* : 9 exclus,
   tous relus. Un article récent sur une ancienne enquête **continue** ; un article ancien portant un acte avancé
   (page CNEWS datée du 26/06, mise à jour avec le verdict du 10/07) **continue**.
4. **Garde de régression** — 7 propositions rabattues sur le run réel (« procès → enquête » sur Aqueduc…) ;
   elles n'ont plus d'`état proposé`, seulement `AMBIGUOUS`.
5. **Preuve d'un autre événement refusée** (porte « date ») — trois claims « établis » par le verdict du jour
   d'après : l'audience du 26/06 par le verdict du 10/07, une plainte du 18/06 par la détention du 22/05, « a fait
   appel le 11 août » pris pour une mise en examen.
6. **Titon** — l'appel est retrouvé (2 titres « le parquet fait appel de la relaxe » sur le rapport du 30/09 ;
   preuve : Le Parisien, relaxe + appel, finalité `non_definitive`). Le premier essai avait échoué *correctement* :
   la recherche ne ramenait qu'**un** résultat, un article sur l'appel **de Baudin** où Titon n'apparaît que dans
   une citation de parent — DeepSeek a refusé d'y voir un appel pour Titon. Cause : requête trop contrainte.
7. **Aqueduc, deux affaires** — le verdict de l'animateur a produit **trois propositions « condamnation » sur la
   fiche de l'enseignant** (FR-2026-0002). Garde « affaire sœur » : 0 proposition, rejouée.
8. **Convergence** — 15 claims établis par la citation d'un autre claim (l'article de l'appel qui rappelle la
   relaxe) ; POC-05 : **31 signaux → 8 claims → 6 établis + 2 dépassés**, une relaxe (15 redites) et un appel (3).

---

## C. Claims restant sans preuve (run réel : 65 sur 136)

Relus un à un (classement manuel, ± 2) :

| Nature | n | Lecture |
|---|---|---|
| Bruit hors dossier, même commune (fermeture de classes, meurtre à Athis-Mons, « ENQUETE. » = rubrique de journal…) | ~24 | rien à prouver ; le titre contient du vocabulaire, le routage prudent ne peut pas les exclure |
| Articles du scandale parisien sans nom d'école, rattachés à la mauvaise fiche | ~14 | la recherche ne trouve rien qui nomme **cet** établissement : c'est le résultat attendu |
| Redondants d'un claim déjà établi (verdict, peine) | 2 | |
| **Plausibles, sans source retrouvée** | **~25** | dont ~9 anciens (2023-2025) sur des fiches déjà à jour ; restent : POC-10 ×6 (Volontaires — **prouvés au rejeu figé, pas au run réel**), FR-2026-0033 ×2 (Sainte-Suzanne), FR-2026-0036 ×2 (crèches), FR-2026-0027 (13 nouvelles plaintes), PARIS-010 (réquisitions du 01/09), FR-2026-0047 (audience) |

`SANS_PREUVE` est mémorisé **sept jours** puis réessayé : ce sont des dettes, pas des verdicts.
PARIS-001 et FR-2026-0002 sont volontairement à 0 (affaires sœurs : décision humaine).

---

## D. Contradicteur — défauts réellement trouvés

Sur les 12 questions : **6 invalidations, toutes réparées ou déclarées.**

| # | Question | Défaut prouvé | Sort |
|---|---|---|---|
| 2 | Exclusion « certaine » en réalité ambiguë ? | **5 exclusions fausses** sur titres réels : « À Rouen, l'ancien surveillant condamné » (le **vrai verdict** de Saint-Valery, exclu car Rouen = tribunal), « après Bétharram… Hauts-de-Seine », « Première peine de prison ferme » (verdict Vigée-Lebrun, rangé en synthèse), « un lycée près de Toulouse », « Scandale dans une maternelle à Paris » | réparées ; **chacune est un test** |
| 7 | Mauvais événement / mauvaise personne ? | verdict d'un autre jour accepté ; **verdict de l'animateur sur la fiche de l'enseignant** ; **le pont manuel court-circuitait les contrôles** (un pont est indexé par titre, pas par affaire) | porte « date », garde sœur, pont contrôlé |
| 8 | Première source suffisante ? | une analyse **réutilisée** faisait preuve sans refaire le test ; `STATE_CHANGE` ambigu portait un état régressif | test refait à la réutilisation ; garde C étendue |
| 10 | Plus de preuves, ou résultats cachés ? | 204 → 65 sans preuve **et** 5 → 69 preuves : les deux bougent. Mais 40 des 105 appels relisaient un document déjà lu dans le run | cache d'analyse dans le run |
| 3 | Rappel baissé ? | 0 vrai changement perdu au routage (9/9). **Mais** la recherche est instable d'un run à l'autre : POC-10 prouvé au rejeu figé, non prouvé au run réel ; G9 (Aresquiers) passé de `DOUTEUX` à `OK` | **non corrigé** — c'est le modèle et Bing, pas le routage |
| 12 | Code minimal ? | non, en volume : `routage-veille.mjs` 277 lignes de code, `preuve-claim.mjs` 122, refonte de `maintenance-cycle.mjs`, 226 lignes de test. Oui en architecture : 0 agent, 0 table, 0 modèle, 0 dépendance | assumé |

Limites **non levées** : un claim sans acte reconnu est cherché par son titre (dépend du classement Bing) ·
`rattachement OK` est l'avis du modèle, pas une preuve — deux personnes à la même école la même semaine
(FR-2026-0004) restent indiscernables · quand un document couvre **les deux** affaires sœurs, il passe la garde ·
les preuves et citations **nomment la personne** (PREUVE ≠ PUBLICATION : rien de cela ne va au front) ·
`n_non_pertinents` de `case_checks` compte désormais les exclusions de routage.

---

## E. Preview front

Preview locale **non publiée** (`sny-maintenance-2-preview`, port 4322). Branché sur la projection existante :

- **relaxe + appel** : POC-05 et POC-09 — badge « Classé / Relaxé · appel » et phrase « Un appel a été formé contre
  cette relaxe : elle n'est pas définitive » ;
- **`rectification` honorée** : le doublon « relaxe du 16/06 » de POC-09 est écarté (le plus ancien fait foi) ;
  la dernière écriture n'est plus prise pour l'état — **POC-05 et POC-09 perdaient état, finalité et source**
  dès qu'une `mobilisation` ou une `rectification` venait en dernier ;
- **multi-établissements** : FR-2026-0005 expose ses trois écoles (popup « Écoles concernées ») ;
- **FR-2026-0027** : sans événement d'état, l'état n'est plus daté du jour de la remise en liberté.

QA : `check-projection` **0 échec** (le contrat J a été réécrit : « dernier événement » était la mauvaise
définition) · `run-all` `QA_PASSED` · 34 contre-exemples de routage verts. `data/cases.json` réécrit en local,
non commité.

---

## F. Target

```
56 AFFAIRES → VEILLE          → requête « en avant » + ouverte bornée : Titon retrouvé
            → ROUTAGE          → 10 à 18 % exclus, chacun relu ; 0 vrai changement perdu
            → CLAIMS           → 290 signaux → 136 claims à prouver ; 2ᵉ cycle à 0 $
            → PREUVE PAR CLAIM → 69 preuves, sans résoudre une seule URL Google News
            → DEEPSEEK → VALIDATION → NEON : ~4 décisions + 4 ambiguïtés ; `cases` intacte
```

Reproduire : `node scripts/watch-updates.mjs --no-context` puis
`node scripts/maintenance-cycle.mjs --moteur deepseek/deepseek-v4.1-flash --contrat v2`
(`--legacy` pour l'ancien chemin, `--dry-run`, `--rapport`, `--etat-du-rapport`, `--sans-memoire`).
Tests : `node scripts/qa/test-routage.mjs`. Artefacts : `experiments/maintenance-3/`.

---

## Chiffres finaux validés (READY_TO_MERGE)

Ces chiffres remplacent ceux des sections précédentes en cas d'écart (le run réel a été rejoué après les dernières corrections).
Aucun n'a été recalculé lors du paquetage : ils proviennent des runs réseau déjà validés.

**QA locale**
- Routage : 49/49. Oracle figé : 9/9 changements de référence avec preuve suffisante.
- Fresh == cached : 24 combinaisons testées, 29 analyses réutilisées sur le run réel, aucune perte métier liée au cache.
- Affaires sœurs : aucun changement d'état proposé sur les fiches protégées de référence.
- Décisions humaines redemandées : 0. Décisions humaines : 16 intactes. `cases` : 0 mutation automatique.
- Idempotence : second run = 0 recherche, 0 appel modèle, 0 page, 0 $, 1,4 s.
- `run-all` = QA_PASSED, `check-projection` = 0 échec.

**Entonnoir — rejeu figé (71 claims)** : preuve trouvée 29 · ambiguïté déjà arbitrée 4 · ambiguïté nouvelle 2 ·
sans preuve 27 · dépassés par claim établi 9 · DeepSeek 36 appels / 0,13 $.

**Entonnoir — run réel (136 claims à prouver)** : preuve trouvée 52 · ambiguïté déjà arbitrée 9 ·
ambiguïté nouvelle / REVIEW_REQUIRED 30 · sans preuve 53 · dépassé 1 · DeepSeek 51 appels / 0,15 $ ·
7 propositions écrites, 3 ensuite écartées car fait déjà validé.

**Dettes connues, non bloquantes pour le merge**
- A. Un document couvrant simultanément les deux affaires Aqueduc peut encore passer la garde « affaire sœur » : à tracer comme cas de QA futur.
- B. Le résultat d'Aresquiers ne journalise pas encore « rattachement obtenu via décision humaine antérieure » (comportement métier correct, observabilité à enrichir).

**Paquetage (hors expérience)**
- Le contrat de compréhension v2 vit désormais dans `scripts/lib/source-understanding-contract.mjs`
  (contenu inchangé, exports identiques à `experiments/source-understanding-2/contrat.mjs`).
- L'archive horodatée du funnel s'écrit dans `data/maintenance-archive/` (ignoré par Git), plus dans `experiments/`.
- Migrations de schéma : 005 à 014, dans l'ordre.
