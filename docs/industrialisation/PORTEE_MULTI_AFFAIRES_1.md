# Articles multi-affaires — périmètre des faits extraits (21/10/2026)

Aucune donnée métier modifiée, aucun accès Neon, aucun Telegram, aucune approbation, promotion ni publication. Les fiches rejouées restent dans `.cache/` (hors dépôt) ; aucune version approuvée n'est touchée. **PR non fusionnée : GO demandé** (voir §7).

## 1. Cause exacte
Chemin suivi sur FR-2026-0002 et FR-2026-0004 : **la source est bien rattachée, l'extraction est correcte mais mal étiquetée, la composition est saine**. Dans un article sur trois écoles, le modèle rend fidèlement « ces trois enquêtes ont été confiées à la BPM » (Figaro), « trois suspects ont été déférés » (JDD), « deux animateurs et le compagnon d'une institutrice ont été interpellés » (Parisien) avec une citation exacte, mais les marque `portee: "affaire"`. Les gardes (citation littérale, date écrite…) ne regardent pas la portée : l'énoncé collectif devient un événement individuel de la fiche.
Les passages **individuels** du même article (« À l'école Aqueduc, un signalement… suspendu le jour même… réunion… cellule psychologique ») étaient, eux, correctement attribués : ils doivent rester.

## 2. Correction minimale
- `fiche-extraction.mjs`, règle 12 du contrat existant (champ `portee` déjà présent, `territoire` déjà classé hors fiche) : un **énoncé dont le sujet est un ensemble** (« ces trois enquêtes », « les trois autres », « trois hommes… ») est `territoire` sauf s'il nomme cette affaire ; une phrase au **singulier** sur la personne mise en cause ou l'établissement n'est **jamais** collective ; un passage consacré à l'affaire dans un article multi-affaires reste `affaire`. Aucune taxonomie, aucune table, aucun appel supplémentaire.
- **Première rédaction rejetée** : elle exigeait que la phrase « désigne nommément » l'affaire et a produit un **faux rejet** (FR-2026-0036 : « le groupe devrait déposer plainte contre le salarié » et « le salarié a été immédiatement mis à pied » classés `autre_affaire`, READY → A_REVOIR). La clause « au singulier… JAMAIS collective » l'a corrigé (0036 : READY, 7 étapes).
- `fiche-composer.mjs` · `regressionJudiciaire` + `generer-fiche.mjs` : une régénération qui **perd ou contredit une issue établie** alors que la source de cette issue est toujours retenue **n'écrase pas** la version précédente : la nouvelle est écrite dans `<ID>.regression.json`, l'alerte est affichée. Si la source n'est plus rattachée à l'affaire, la disparition est justifiée.
- `fiche-composer.mjs` : nouveau point **majeur** `DECISION_SANS_ISSUE_ETABLIE` quand la chronologie rapporte un classement / non-lieu / relaxe / condamnation sans issue structurée (jamais READY avec « Aucune décision rendue » à côté de « classée sans suite »).
- 79 contrôles (4 nouveaux).

## 3. Les deux cas, avant / après (même sources, même code de lecture)
| | Avant | Après |
|---|---|---|
| **FR-2026-0002** (Aqueduc) | « ces trois enquêtes ont été confiées à la BPM » = étape propre | classé `territoire` ; signalement du 14 octobre, suspension, réunion du 16 octobre + cellule psychologique **conservés** |
| **FR-2026-0004** (Vigée-Lebrun) | 3 énoncés collectifs en étapes (interpellations, « enquêtes », « trois suspects déférés ») | 0 ; passages nommant l'école conservés (procès du 31 août, condamnation, suspension puis licenciement) |

## 4. Cas positifs et négatifs
- **Mesure automatique** (énoncés collectifs *non nommant* la structure dans les étapes ; même détecteur sur toutes les variantes) :

| Périmètre | Avant (extraction d'origine) | Témoin : ancien contrat, extraction fraîche | Après |
|---|---|---|---|
| 11 fiches (13 multi-affaires + contrôles individuels) | 8 | **5** (0001 : 2, 0003 : 3 — le défaut persiste sans correctif) | **0** |
| 9 autres fiches multi-affaires | 1 | — | **0** |

- **Faux rejets** (étapes nommant la structure, 11 fiches) : avant 32, témoin 34, après 32 ; (9 autres) 21 → 22. Réactions : 22 / 23 / 22 (11 fiches) ; 14 → 10 (9 fiches : 0005 −2 dont « de différentes enquêtes préliminaires » et « plusieurs agents… suspendus », jugés collectifs ; POC-10 et 0007 −1 chacune, non reclassées hors périmètre : variance d'extraction).
- Contrôles individuels (une seule affaire : 0115 Tarnos, 0036, 0120, 0028, 0035, 0046) : étapes et réactions comparables au témoin ; 0036 corrigée par la 2ᵉ rédaction.
- **Limite** : une phrase collective qui nomme l'affaire (CNEWS : « les trois affaires, dont celle de l'école du XXe ») est aujourd'hui aussi écartée par le modèle (0003) : prudence acceptée, information de contexte perdue.
- Les cas « contexte général non attribuable » et « source ambiguë » restent portés par `territoire`, `AMBIGU` et la garde de rattachement de la PR 25 (inchangés).

## 5. Variance du modèle (à ne pas confondre avec l'effet)
Le témoin (ancien contrat, sels différents) fait déjà basculer la qualification de 3 fiches sur 11 : 0046 READY → A_REVOIR (DIVERGENCE de dates), 0028 READY → A_REVOIR, PARIS-004 A_REVOIR → BLOQUE. Les mêmes bascules se retrouvent avec le correctif : **elles ne lui sont pas imputables**. Aucune amélioration n'est donc déclarée sur les qualifications ; seul le critère « énoncé collectif retenu comme fait individuel » est comparé de façon contrôlée.

## 6. Régressions documentaires et garde-fou judiciaire
- **PARIS-004** : le rejeu issu de la PR 25 avait déjà perdu l'issue « classement sans suite » (variance), le correctif ne l'a pas retrouvée (READY avec « Aucune décision rendue »). Rejoué contre la **vraie** version précédente (`data/fiches-generees`, issue présente, BLOQUE) : `⚠ RÉGRESSION JUDICIAIRE : « classement 2019-06 » → aucune issue … version précédente CONSERVÉE`. Sans version précédente (fiche neuve), `DECISION_SANS_ISSUE_ETABLIE` la ramène à A_REVOIR.
- Aucune autre issue perdue sur les 20 fiches rejouées ; aucune contradiction judiciaire nouvelle.

## 7. Coût, PR, décision
Coût réel de la session : ≈ 3,5 USD (première rédaction 1,20 ; témoin 0,87 ; rédaction finale 1,39 ; ~ 300 appels), cache invalidé : `CONTRAT_VERSION` change. Un rejeu complet du catalogue coûterait ≈ 2,6 USD.
**Fusion non faite** : le changement modifie le contrat d'extraction, donc les fiches générées à venir (0124, 0002, etc.) et leurs empreintes ; aucune page publique n'est modifiée à ce jour (la fiche publiée FR-2026-0117 vient de `isoles.json`). À valider avant fusion : le compromis « énoncé collectif nommant l'affaire écarté ».

## 8. Blocages restants
1. Variance de qualification d'un tirage à l'autre (≈ 3 fiches sur 11) : décision sur le nombre de passes ou une règle de stabilité.
2. Faits collectifs nommant l'affaire : restitués comme contexte ? (changement de rendu, non fait).
3. Sources inaccessibles, doublons d'événements résiduels : inchangés.
