# GÉNÉRALISATION QUALITATIVE #1 — qualité, couverture, reproductibilité, catalogue à blanc, décision de sortie (20/10/2026)

Aucune donnée métier, aucune base écrite, aucun Telegram, aucune publication ; la fiche publiée FR-2026-0117 n'est pas touchée. **READY n'est pas une validation éditoriale** : c'est l'absence d'anomalie bloquante détectée par les gardes.

## 1. Défauts corrigés — classés (déterministe · extraction reproductible · ambiguïté · exception)
| # | Défaut mesuré | Nature | Correction (test positif + négatif) |
|---|---|---|---|
| 1 | **Entités HTML non décodées** (« &laquo; », « &ecirc; ») dans **29 % des pages lues** (73/252) : citations littérales et propos « entre guillemets » rejetés, donc faits et déclarations perdus (ex. la **remise en liberté** de septembre de Tarnos, absente de la fiche) | déterministe | décodage dans la lecture des sources ; **réactions 80 → 106, remise en liberté restituée** |
| 2 | Citations quasi littérales rejetées (Tarnos 10/49 événements) | extraction reproductible | citation récupérée (phrase de la source) sous les mêmes gardes |
| 3 | Même fait en 5 à 8 exemplaires (37 étapes) | déterministe + extraction | radicaux, meilleur groupe, regroupement par le modèle sous gardes |
| 4 | Un fait vu par une seule de deux extractions | extraction reproductible (variance) | deux passes, union des éléments vérifiés |
| 5 | « Aucun appel rapporté » alors qu'un appel est annoncé ; « Appel rapporté » sur « ferait appel » | déterministe | appel = acte accompli ; intention → « Appel annoncé » |
| 6 | Reproche à une institution écrit comme un fait | déterministe | toujours attribué au média + signal majeur |
| 7 | Fonction unique + accusation (« le chef des animateurs », « devenu proviseur », « ancien censeur ») | déterministe (rappel du signal) | signal majeur A_REVOIR ; élargi aux fonctions sans déterminant |
| 8 | Décomptes d'enfants/plaintes, année de naissance, nombre de fichiers | déterministe | expressions élargies |
| 9 | État « enquête » établi par une enquête administrative ; « procès » par une audience de remise en liberté | déterministe | état judiciaire = actes judiciaires ; procès = audience de jugement |
| 10 | Classement « aurait été » prononcé retenu ; issue favorable à source unique | déterministe | conditionnel écarté ; R5 → A_REVOIR |
| 11 | Propos-fragments sans sens ; « selon le document » ; sources sans apport comptées | déterministe | contexte joint ou fragment écarté ; attribution au média ; sources contributrices |
| 12 | Issue établie absente de la chronologie | déterministe | étape « décision » structurée (nature + date écrite + source) |
| 13 | Fiche sans synthèse visuelle | déterministe (PR 16) | `situation` composée depuis les données vérifiées |

Les tests passent de 40 à 69 (`test-generer-fiche.mjs`) ; chaque correction a un cas où elle s'applique et un cas où elle reste inactive.

## 2. Valeur documentaire (couverture) — mesurée, pas présumée
Pertes classées sur les affaires relues contre leurs sources : **source inaccessible** (≈ 20 % des pages en 403/503, jamais contournées) ; **extraction incorrecte** (citation dérivée, entités : corrigées) ; **sélection/déduplication** (corrigée) ; **garde justifiée** (nom, âge, nombre d'enfants, détail, proche de victime : voulu) ; **non détecté** (variance du modèle : atténuée par deux passes) ; **choix éditorial en attente** (« Poursuivi pour » des pilotes : non structuré). Effet du correctif d'entités sur les 50 affaires : étapes 439 → 459, réactions 80 → 106, un cas de décision clé restitué (remise en liberté).

## 3. Reproductibilité (mêmes sources, extractions fraîches, 9 affaires)
| | 1 passe / 1 passe | union de 2 passes / union de 2 passes |
|---|---|---|
| événements appariés | 62/90 (69 %) | 90/112 (80 %) |
| événements-clés d'un seul côté | 10 | 6 |
| état · issue · qualification identiques | 9/9 · 9/9 · 8/9 | 9/9 · 9/9 · 9/9 |
Les variations restantes sont des faits secondaires, pas des contradictions. La composition est déterministe à extraction donnée (cache).

## 4. Validation indépendante — limite explicite
Le catalogue public éligible compte 50 affaires, **toutes traitées** : il n'existe plus d'affaire neuve. Les 17 affaires « vierges » et les 12 « réservées » ont servi, une fois lues, à trouver des défauts (#5 à #12 en partie) : elles sont désormais des cas de **développement/régression**, pas une preuve indépendante. Constat honnête : la relecture de 8 fiches READY « indépendantes » y a trouvé 4 erreurs avant correction, et un audit supplémentaire (cette session) a encore trouvé 3 défauts déterministes (#1, #7, #12) **sans aucun nouvel échantillon neuf pour les confirmer**. Aucune statistique de précision n'est donc produite ici.

## 5. Catalogue à blanc (50 affaires publiques éligibles)
**READY 16 · A_REVOIR 20 · BLOQUÉE 13 · PAS_D_ENRICHISSEMENT 1.** BLOQUÉES : état de la carte non étayé 6, carte périmée ou contredite 5 (propositions à la Maintenance), aucune source lisible 2. A_REVOIR : fonction identifiante 10, carte « enquête » sans acte judiciaire 4, divergence de dates ou chiffres 6, issue favorable à source unique 1, identité d'une source ambiguë 2, état plus haut que les sources 1, reproche institutionnel 1.

| Affaire | Carte | Qualification | Étapes | Réactions | Sources utiles | Synthèse | Réserve / blocage |
|---|---|---|---:|---:|---:|---|---|
| FR-2026-0006 École maternelle Rochechouar, Paris 9e | plainte | READY | 4 | 0 | 2 | Plainte/orange + Aucune décision rendue | — |
| FR-2026-0011 Structures périscolaires de , Morigny-Champign | mise en examen | READY | 5 | 0 | 2 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0020 Lycée Notre-Dame, Mantes-la-Jolie | condamnation non définitive | READY | 7 | 2 | 2 | Condamnation/red + Aucun appel rapporté | — |
| FR-2026-0025 École Saint-Martin-de-France, Pontoise | mise en examen | READY | 2 | 0 | 2 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0028 École primaire Robert-Doisne, Lucenay | mise en examen | READY | 12 | 4 | 4 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0036 Crèche Chat Perché, Lyon 3e | plainte | READY | 6 | 0 | 1 | Plainte/orange + Aucune décision rendue | — |
| FR-2026-0037 Centre de loisirs du Chambon, Laguenne-sur-Ava | mise en examen | READY | 8 | 1 | 2 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0038 École élémentaire non nommée, Saché | mise en examen | READY | 9 | 2 | 4 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0041 Lycée non nommé, Rouen | condamnation non définitive | READY | 9 | 0 | 2 | Condamnation/red + Aucun appel rapporté | — |
| FR-2026-0043 Lycée Saint-Denis, Annonay | condamnation non définitive | READY | 4 | 2 | 2 | Condamnation/red + Aucun appel rapporté | — |
| FR-2026-0046 Deux écoles maternelles non , Rezé | condamnation non définitive | READY | 11 | 3 | 2 | Condamnation/red + Appel rapporté | — |
| FR-2026-0115 Centre de loisirs municipal , Tarnos | mise en examen | READY | 19 | 7 | 9 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0120 Centre périscolaire / de loi, Charly | mise en examen | READY | 7 | 2 | 2 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0139 Les Tournesols, Lingolsheim | enquête | READY | 5 | 1 | 2 | Enquête/blue + Aucune décision rendue | — |
| PARIS-001 École maternelle Saint-Domin, Paris 7e | enquête | READY | 3 | 2 | 2 | Enquête/blue + Aucune décision rendue | — |
| POC-02 École maternelle Charlie-Cha, La Courneuve | condamnation non définitive | READY | 11 | 2 | 3 | Condamnation/red + Appel annoncé | — |
| FR-2026-0005 École maternelle Saint-Domin, Paris 7e | enquête | A_REVOIR | 11 | 5 | 6 | Enquête/blue + Aucune décision rendue | FONCTION_IDENTIFIANTE |
| FR-2026-0007 École maternelle Reuilly II, Paris 12e | enquête | A_REVOIR | 7 | 2 | 1 | — | ETAT_NON_ETAYE_PAR_LES_SOURCES |
| FR-2026-0008 École Boulard, Paris 14e | enquête | A_REVOIR | 11 | 1 | 2 | — | ETAT_NON_ETAYE_PAR_LES_SOURCES |
| FR-2026-0012 Collège-lycée Saint-Jean-de-, Paris 16e | condamnation non définitive | A_REVOIR | 3 | 4 | 1 | Condamnation/red + Aucun appel rapporté | FONCTION_IDENTIFIANTE |
| FR-2026-0022 Institution Saint-Dominique, Neuilly-sur-Sein | enquête | A_REVOIR | 5 | 1 | 1 | Enquête/blue + Aucune décision rendue | FONCTION_IDENTIFIANTE |
| FR-2026-0027 École maternelle Les Aresqui, Vic-la-Gardiole | mise en examen | A_REVOIR | 22 | 8 | 7 | Mise en examen/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES |
| FR-2026-0030 Lycée Bagatelle, Saint-Gaudens | mise en examen | A_REVOIR | 30 | 4 | 6 | Mise en examen/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES,FONCTION_IDENTIFIANTE,REPROCHE_A_UNE_INSTITUTION |
| FR-2026-0035 Crèche Joyeuse Tribu, Lyon 6e | relaxe / non-lieu / classement | A_REVOIR | 10 | 0 | 2 | Classement sans suite/green + Aucun appel rapporté | ISSUE_FAVORABLE_SOURCE_UNIQUE |
| FR-2026-0044 Établissement professionnel , Charentay | condamnation non définitive | A_REVOIR | 3 | 0 | 2 | Condamnation/red + Aucun appel rapporté | FONCTION_IDENTIFIANTE |
| FR-2026-0045 Collège Jehan le Povremoyne, Saint-Valéry-en- | condamnation non définitive | A_REVOIR | 11 | 3 | 4 | Condamnation/red + Aucun appel rapporté | DIVERGENCE_ENTRE_SOURCES,FONCTION_IDENTIFIANTE |
| FR-2026-0119 Centre aéré (école maternell, Morières-lès-Avi | mise en examen | A_REVOIR | 18 | 8 | 7 | Mise en examen/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES |
| FR-2026-0122 École maternelle privée Sain, Paris 10e | mise en examen | A_REVOIR | 11 | 3 | 3 | Mise en examen/blue + Aucune décision rendue | DOC_IDENTITE_AMBIGUE,FONCTION_IDENTIFIANTE |
| FR-2026-0123 Centre de loisirs de l'école, Nice | mise en examen | A_REVOIR | 25 | 8 | 8 | Mise en examen/blue + Aucune décision rendue | FONCTION_IDENTIFIANTE |
| FR-2026-0124 École maternelle Gustave-Bie, Colombes | enquête | A_REVOIR | 8 | 2 | 2 | Enquête/blue + Aucune décision rendue | DOC_IDENTITE_AMBIGUE |
| FR-2026-0133 centre de loisirs de Rots, Rots | enquête | A_REVOIR | 9 | 5 | 5 | Enquête/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES |
| FR-2026-0137 école maternelle Julie-Victo, Soyaux | mise en examen | A_REVOIR | 33 | 5 | 11 | Mise en examen/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES,FONCTION_IDENTIFIANTE |
| PARIS-007 École maternelle Reuilly, Paris 12e | enquête | A_REVOIR | 9 | 2 | 1 | — | ETAT_NON_ETAYE_PAR_LES_SOURCES |
| PARIS-008 École maternelle Boulard, Paris 14e | enquête | A_REVOIR | 4 | 0 | 1 | — | ETAT_NON_ETAYE_PAR_LES_SOURCES |
| POC-04 École Émeriau, Paris 15e | mise en examen | A_REVOIR | 9 | 3 | 1 | Mise en examen/blue + Aucune décision rendue | FONCTION_IDENTIFIANTE |
| POC-10 École Volontaires, Paris 15e | enquête | A_REVOIR | 2 | 1 | 2 | Plainte/orange + Aucune décision rendue | ETAT_PLUS_HAUT_QUE_LES_SOURCES |
| FR-2026-0001 École Aqueduc, Paris 10e | condamnation non définitive | BLOQUE | 7 | 0 | 2 | Enquête/blue + Aucune décision rendue | ETAT_NON_ETAYE |
| FR-2026-0003 École Grands Champs, Paris 20e | enquête | BLOQUE | 8 | 1 | 5 | Condamnation/red + Aucun appel rapporté | ETAT_CARTE_PERIME_OU_CONTREDIT |
| FR-2026-0013 Lycée Clément-Ader, Athis-Mons | plainte | BLOQUE | 10 | 2 | 5 | Enquête/blue + Aucune décision rendue | ETAT_CARTE_PERIME_OU_CONTREDIT |
| FR-2026-0021 Établissement non nommé, Les, Les Mureaux | mise en examen | BLOQUE | 0 | 0 | 1 | — | ETAT_NON_ETAYE |
| FR-2026-0024 École Belzunce, Paris 10e | relaxe / non-lieu / classement | BLOQUE | 2 | 0 | 1 | Plainte/orange + Aucune décision rendue | ETAT_NON_ETAYE |
| FR-2026-0026 Collège non nommé, Essonne, commune non préc | procès | BLOQUE | 0 | 0 | 0 | — | AUCUNE_SOURCE_LISIBLE_ET_PERTINENTE |
| FR-2026-0029 Collège Saint-Charles, Chauny | condamnation non définitive | BLOQUE | 11 | 1 | 5 | Audience tenue/blue + Aucune décision rendue | ETAT_NON_ETAYE |
| FR-2026-0033 Collège de Quartier-Français, Sainte-Suzanne | mise en examen | BLOQUE | 0 | 0 | 0 | — | AUCUNE_SOURCE_LISIBLE_ET_PERTINENTE |
| FR-2026-0047 École Alexandre-Copello, Marseille 5e | procès | BLOQUE | 10 | 3 | 4 | Condamnation/red + Aucun appel rapporté | ETAT_CARTE_PERIME_OU_CONTREDIT |
| FR-2026-0116 École de Mées (type non préc, Mées | procès | BLOQUE | 14 | 2 | 3 | Enquête/blue + Aucune décision rendue | ETAT_NON_ETAYE |
| PARIS-004 École maternelle Paul-Dubois, Paris 3e | enquête | BLOQUE | 16 | 2 | 1 | Classement sans suite/green + Aucun appel rapporté | ETAT_CARTE_PERIME_OU_CONTREDIT |
| PARIS-010 École maternelle Grands-Cham, Paris 20e | enquête | BLOQUE | 7 | 1 | 4 | Condamnation/red + Aucun appel rapporté | ETAT_CARTE_PERIME_OU_CONTREDIT |
| POC-03 École élémentaire Jules-Vall, Plaisir | condamnation non définitive | BLOQUE | 10 | 1 | 4 | Enquête/blue + Aucune décision rendue | ETAT_NON_ETAYE |
| FR-2026-0002 École Aqueduc, Paris 10e | enquête | PAS_D_ENRICHISSEMENT | 1 | 0 | 2 | Enquête/blue + Aucune décision rendue | — |


## 6. Coût et capacité
≈ 0,05 USD et ≈ 8 appels LLM par affaire (deux passes + regroupement) ; ≈ 0,03 USD par document lu. Correctif d'entités : 115 appels, 0,72 USD. Session entière ≈ 3,5 USD. 6 à 10 min par affaire (modèle « raisonnant »), 6 en parallèle ; les accès Neon échouent par intermittence sous forte charge (le mode `--rejouer --sans-neon` n'en dépend plus). Régénérer les 50 affaires : ≈ 2,6 USD.

## 7. Condition d'arrêt et décision de sortie
**Écarts restants, tous hors de portée d'une correction générale :**
- sources inaccessibles (≈ 20 % des pages) et rappel de la découverte (articles récents surtout) ;
- ambiguïtés nécessitant l'éditeur : dates divergentes entre médias (6), fonctions identifiantes (10), cartes à état non étayé (13 + 4), « vidéos à caractère sexuel » (nature des faits) ;
- exceptions isolées : un doublon inter-types (enquête interne / mesure), une peine partiellement relaxée écartée par une garde (Rezé) ;
- choix éditoriaux en attente : « Poursuivi pour », plafond de réactions, seuil d'enrichissement.

**DÉCISION : GO validation humaine — pour un premier lot RESTREINT, pas pour le catalogue.** Justification par les résultats : état judiciaire, issue et qualification se reproduisent à l'identique (9/9) d'une extraction à l'autre ; aucune citation fabriquée (toutes littérales) ; les défauts trouvés étaient reproductibles, déterministes et corrigés avec tests ; les écarts restants relèvent des quatre catégories ci-dessus. **Réserve forte** : le taux de défauts découverts à chaque relecture n'a pas atteint zéro et aucun échantillon neuf ne permet de le garantir : l'effort humain doit porter sur la lecture de chaque fiche (3 à 5 minutes), jamais sur une approbation en bloc. Premier lot proposé (READY, ≥ 2 sources utiles, relecture exigée) : FR-2026-0115, 0046, 0043, 0038, 0041, 0020, 0120, 0037, POC-02, 0139. Les A_REVOIR et BLOQUÉES ne sont pas proposées.
