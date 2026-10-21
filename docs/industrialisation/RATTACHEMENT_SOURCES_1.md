# Rattachement sources ↔ affaires — correction P0 (21/10/2026)

Aucune donnée métier modifiée, aucun accès Neon, aucun Telegram, aucune approbation ni publication. Les fiches rejouées restent dans `.cache/rejeu/` (hors dépôt) : aucun rendu soumis à validation n'est remplacé.

## 1. Cause exacte (mesurée sur les données, pas supposée)
Pour **Colombes (FR-2026-0124)** et **Reuilly (PARIS-007)**, les mauvaises sources (La Dépêche ×3, Sud Ouest ×2, Le Parisien 2024, nid de frelons) **n'ont alimenté aucune ligne de la fiche** : écartées avant le modèle (page ne nommant pas la commune/structure) ou classées `AUTRE_AFFAIRE`. Elles n'apparaissaient que dans le tableau « Sources », sous une colonne « Pertinence » ambiguë.
Les défauts réels, trouvés en suivant le chemin exécuté :

| # | Défaut | Premier maillon défaillant | Pourquoi les contrôles l'acceptaient |
|---|---|---|---|
| A | **Une source légitime de la mémoire (Le Figaro, Colombes) jugée « ambiguë »** — 12 pages Figaro sur 50 fiches, et 18 autres écartées | **Lecture** : un paragraphe de 30 000 caractères de CSS précédait l'article ; seuls les 20 000 premiers caractères partent au modèle → il ne voyait que le titre et du CSS | `acces=libre` dès 600 caractères, sans contrôle de contenu |
| B | **Article multi-affaires attribué à une seule affaire** : CNEWS (« trois hommes interpellés dans plusieurs écoles parisiennes ») accepté comme `CETTE_AFFAIRE` pour Vigée-Lebrun (FR-2026-0004) et Aqueduc (FR-2026-0002) sans nommer ces écoles | **Association** : le modèle rattachait par arrondissement + rôle, alors que 2 à 3 autres affaires de même arrondissement et de même rôle existent | le contrat dit « même structure ET même commune », mais rien ne vérifiait que la structure était nommée |
| C | Tableau « Sources » : source listée = source utilisée ? | **Présentation** | colonne « Pertinence » avec codes bruts |

Le défaut peut-il toucher Maintenance ? **Non pour B** : `preuve-claim.mjs` exige déjà que la page nomme l'établissement ET la commune (`NE_NOMME_PAS_ETABLISSEMENT_ET_COMMUNE`), plus strict que le générateur. **A** existerait aussi côté Maintenance (fenêtre de 12–14 000 caractères) mais échoue vers `AMBIGUOUS`, jamais vers une fausse association : non modifié.

## 2. Correction minimale
- `fiche-sources.mjs` · `sansBruit` : écarte les paragraphes de code **sans prose** (≥ 2 phrases lisibles les conservent : La Montagne, Rennes Infos Autrement), et coupe après « Il vous reste N % à découvrir » **si l'extrait qui précède fait ≥ 600 caractères** (commentaires de lecteurs et « à lire aussi » d'autres affaires). « Réservé aux abonnés » seul ne coupe rien : Sud Ouest l'affiche *avant* l'article (mesuré, première version abandonnée).
- `fiche-sources.mjs` · `rattachementInsuffisant` + `generer-fiche.mjs` : structure nommée dans l'affaire, **aucun mot distinctif** dans le document, et une autre affaire de la même commune (arrondissement compris) porte une **autre** structure → la source n'est pas envoyée au modèle, `AMBIGU` (`DOC_IDENTITE_AMBIGUE`, majeur pour une source de la mémoire). Le nom littéral n'est **pas** exigé s'il n'y a pas de sœur dans la commune, si la structure n'est pas nommée, si un seul mot distinctif apparaît, ou si l'autre fiche est un doublon de la même structure.
- `fiche-rendu.mjs` : colonne « Rattachement à l'affaire » (« établi — utilisée » / « NON utilisée »).
- Aucune seconde passe LLM, aucun scoring, aucune table, aucune règle par URL, commune, établissement ou identifiant. 6 tests (75 contrôles au total) : positif et négatif pour chaque cas ci-dessous.

## 3. Colombes et Reuilly, avant / après
| | Avant | Après |
|---|---|---|
| **FR-2026-0124** Le Parisien 9 juin, actu.fr | rattachement établi, utilisées | inchangé |
| Le Figaro 16 juin | `AMBIGU` (page vue comme du CSS) → **A_REVOIR** `DOC_IDENTITE_AMBIGUE` | **établi, utilisé** (chapeau lisible : plaintes, signalements, parquet de Nanterre) → **READY**, empreinte `09abd77d3205ac6d` → `9d8ef5b756de7737` |
| Le Parisien 2024 (extorsion), La Dépêche ×2, Sud Ouest ×2, Le Point (403) | écartées / inaccessible, jamais utilisées | inchangé, désormais libellées « NON utilisée » |
| **PARIS-007** 20 Minutes | établi, seule source | inchangé ; Le Parisien « frelons » `AUTRE_AFFAIRE` ; L'indépendant, BFM écartées ; Libération, Télégramme 403 : **aucune fiche à régénérer** |

## 4. Généralisation (tests de régression ; aucune validation indépendante)
Cas de développement : Colombes, Reuilly, Vigée-Lebrun, Aqueduc. Tests unitaires (`test-generer-fiche.mjs`) : association explicite correcte → conservée ; correcte sans nom d'établissement (pas de sœur) → conservée ; deux affaires dans la même commune sans nom → non établie ; article multi-affaires nommant deux écoles → exploitable pour chacune, pas pour une troisième ; source nommant une autre structure → refusée ; doublon de structure → pas une sœur ; structure non nommée → non concernée ; feuille de style → retirée sans perdre l'article ; « Réservé aux abonnés » en tête → rien coupé. Sur le catalogue : **la garde ne déclenche sur aucune source qui contribuait légitimement hors CNEWS/Paris** (0 perte de couverture : 15 des 17 déclenchements portaient déjà sur des sources écartées).
**Limite** : plus aucune affaire neuve ; pas de statistique de précision.

## 5. Impact catalogue (rejeu 30 fiches depuis les caches : 0,53 USD ; sources figées, nouvelle extraction)
- **Contamination supprimée** : CNEWS retiré de FR-2026-0004 (garde à vue du 20 mars « dans plusieurs écoles » et « enquêtes » imputées à Vigée-Lebrun) et de FR-2026-0002 (0 ligne propre).
- **Information gagnée** (Figaro désormais lisible, source supplémentaire) : 0124, 0002, 0001, 0024, 0047, 0117, 0120, 0122, 0123, 0004, PARIS-004. Changements de qualification : **0124 A_REVOIR → READY** ; **0002 PAS_D_ENRICHISSEMENT → A_REVOIR** (7 étapes) ; **PARIS-004 BLOQUE → A_REVOIR** (voir §7, à ne pas retenir).
- 17 autres fiches rejouées sans changement de qualification.

| Fiche | Qualification | Empreinte du dossier avant → après |
|---|---|---|
| FR-2026-0124 | A_REVOIR → READY | `09abd77d3205ac6d` → `9d8ef5b756de7737` |
| FR-2026-0002 | PAS_D_ENRICHISSEMENT → A_REVOIR | `870a823d2e6f06c4` → `a4ddf02cd4e2f09a` |
| FR-2026-0004 | BLOQUE → BLOQUE | `6482b925c858816c` → `d026272fab383a63` |
| FR-2026-0024 | BLOQUE → BLOQUE | `8111abcf940fbcf8` → `b4e2e056a184d009` |
| FR-2026-0047 | BLOQUE → BLOQUE | `54a5fcf9124afb08` → `8aebd29468e4369d` |
| FR-2026-0001 | BLOQUE → BLOQUE | `7ebf19b307d7ac34` → `689eddb5e2faa842` |
| FR-2026-0120 | READY → READY | `5bb21c50b8a7b257` → `a374994717ab3dc3` |
| FR-2026-0122 | A_REVOIR → A_REVOIR | `898ca36927d7694a` → `dbacf6996fbc3780` |
| FR-2026-0123 | A_REVOIR → A_REVOIR | `75b201bd44522a61` → `37bbb1038c84ff2f` |
| FR-2026-0012 | A_REVOIR → A_REVOIR | inchangé `c0463bb37a56ab7f` (Figaro réduit à son chapeau, aucune étape perdue) |

Une approbation donnée à l'ancienne empreinte (lot de validation #1 : 0124 `09abd77d…`, 0002, 0004…) ne vaut pas pour la nouvelle : rien n'est remplacé, les nouvelles versions sont à relire avant toute proposition.

## 6. Production
Fiches publiques : aucune modifiée (la fiche publiée FR-2026-0117 est servie par `isoles.json`, non touché ; sa version rejouée a une autre empreinte et demanderait une nouvelle approbation). `data/fiches-generees/` et `.cache/` ne sont pas versionnés. Seul effet sur les rendus à venir : la colonne « Rattachement ».

## 7. Résidus (non corrigeables sans décision)
1. **Passages multi-affaires dans un article bien rattaché** : « ces trois enquêtes », « trois suspects déférés » restent parfois classés `portee: affaire` par le modèle (ex. Figaro/JDD pour 0002, 0004). Une consigne de portée dans le contrat d'extraction changerait `CONTRAT_VERSION` donc invaliderait tout le cache (≈ 2,6 USD de rejeu complet) : **décision à prendre**.
2. **PARIS-004** : le rejeu perd l'issue « classement sans suite » (variance du modèle) et passe de BLOQUE à A_REVOIR, avec une chronologie qui dit « classée sans suite » sous une synthèse « Aucune décision rendue ». À ne pas retenir : conserver la version actuelle (BLOQUE).
3. Doublon d'événement (plainte du 26 avril, 0124) quand deux formulations se côtoient : déjà connu.
4. Sources inaccessibles (Le Point, Libération, Le Télégramme : 403), `affairesSoeurs` tronqué à 5 voisines pour les communes à arrondissements (modifier le prompt = même effet que le point 1).
