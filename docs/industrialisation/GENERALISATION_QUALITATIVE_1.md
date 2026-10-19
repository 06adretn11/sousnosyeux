# GÉNÉRALISATION QUALITATIVE #1 — qualité, couverture, reproductibilité, puis catalogue à blanc (19/10/2026)

Branche `feat/generalisation-qualitative`. Aucune donnée métier, aucune base écrite, aucun Telegram, aucune publication ; la fiche publiée FR-2026-0117 n'est pas touchée. **READY n'est pas une validation éditoriale** : c'est l'absence d'anomalie bloquante détectée.

## 1. Défauts transversaux démontrés → corrigés (cause → correction minimale → test)
| # | Défaut mesuré | Cause | Correction |
|---|---|---|---|
| 1 | Citations quasi littérales rejetées (Tarnos : 10/49 événements, dont la suspension annoncée et l'écartement de deux animateurs) | extraction : la citation dérive en fin de phrase | **citation récupérée** : phrase de la source retenue si elle soutient le texte (gardes inchangées) |
| 2 | Même fait en 5 à 8 exemplaires (une affaire à 8 sources : 37 étapes) | dédup lexicale insuffisante ; premier groupe compatible choisi | radicaux de mots + **meilleur groupe** + **regroupement par le modèle sous gardes** (un appel/affaire ; partition d'événements existants, aucune rédaction) |
| 3 | Un même fait vu par une seule des deux extractions (décisions, recours, remise en liberté) | variance du modèle (69 % d'événements appariés entre deux passes) | **deux passes indépendantes, union des éléments vérifiés** (80 % appariés ; décisions/recours divergents 10 → 6 ; état, issue et qualification identiques 9/9) |
| 4 | Fiche sans synthèse visuelle | `dossier.situation` jamais écrit | composée depuis les données vérifiées (PR 16) |
| 5 | « Aucun appel rapporté » alors que l'avocat annonce un appel ; « Appel rapporté » sur « ferait appel » | garde d'appel trop permissive (« appel de la décision ») | appel = **acte** (« a fait appel »), intention → « Appel annoncé » |
| 6 | Reproche à une institution écrit comme un fait (« le rectorat n'a engagé aucune poursuite ») | exemption d'attribution pour les sujets institutionnels | toujours attribué au média + signal majeur |
| 7 | Fonction unique + accusation (« le chef des animateurs ») | identification sans nom | signal majeur (A_REVOIR), jamais READY |
| 8 | « les deux premières fillettes », « une trentaine d'enfants », 22 plaintes, année de naissance, 2 800 fichiers | expressions de décompte trop étroites | élargies (mots intercalés, décomptes de plaintes ≥ 10, naissance, fichiers) |
| 9 | État « enquête » établi par une enquête administrative ; « procès » établi par une audience de remise en liberté | mapping type d'événement → état trop large | état judiciaire = actes judiciaires seulement ; procès = audience de jugement |
| 10 | Classement sans suite « aurait été » prononcé retenu comme issue ; issue favorable à source unique | conditionnel non détecté ; pas de règle R5 | conditionnel écarté ; issue favorable à source unique → A_REVOIR |
| 11 | Propos-fragments sans sens (« condamner avec la plus grande fermeté ») ; « selon le document » ; pages de palmarès comptées comme sources | citation courte, attribution, sources sans apport | phrase de contexte jointe ou fragment écarté ; attribution au média ; seules les sources contributrices comptent |

Chaque correction a un test positif et négatif (`test-generer-fiche.mjs` : 40 → 66 contrôles ; `test-fiche-approbation.mjs`).

## 2. Mesure de la perte documentaire (affaires relues contre leurs sources)
Classement des écarts constatés : **source inaccessible** (≈ 20 % des pages 403/503, jamais contournées) ; **extraction incorrecte** (citation dérivée : corrigé, +4 événements sur Tarnos) ; **sélection/dédup** (corrigé : 37 → 28 étapes sur la plus bruitée) ; **garde justifiée** (nom, âge, nombre d'enfants, détail, proche de victime : voulu) ; **non détecté** (variance entre passes : atténué par l'union) ; **choix éditorial en attente** (« Poursuivi pour » des pilotes : non structuré, non extrait ; qualification juridique des faits). Les phrases « informatives » non couvertes d'une fiche sont, pour l'essentiel, des phrases d'autres affaires d'un article de série ou de page-ruban, correctement écartées.

## 3. Reproductibilité (mêmes sources, extractions fraîches, 9 affaires)
| | 1 passe contre 1 passe | union de 2 passes contre union de 2 passes |
|---|---|---|
| événements appariés | 62 / 90 (69 %) | 90 / 112 (80 %) |
| événements-clés (décision, MEE, appel, garde à vue) présents d'un seul côté | 10 | 6 |
| état affiché / issue / qualification identiques | 9/9 · 9/9 · 8/9 | 9/9 · 9/9 · 9/9 |
Les variations restantes sont des faits secondaires (formulation, précision de date, détail de mesure), pas des contradictions. La composition elle-même est déterministe à extraction donnée (cache).

## 4. Validation indépendante — et ses limites, dites sans détour
17 affaires jamais manipulées avant la génération finale (échantillon « vierge ») + 12 « réservées » ont été générées avec le code de l'époque, puis lues. Leur lecture a révélé **6 défauts** (#5, #8, #9, certains de #6/#7/#11), corrigés ensuite : **ces corrections n'ont donc pas été validées sur un échantillon neuf** (le catalogue public éligible est épuisé : 50 affaires toutes traitées). Elles sont éprouvées par des tests positifs/négatifs et par régénération des 50 fiches (aucune contradiction judiciaire non signalée connue après correction), pas par un échantillon aveugle.

## 5. Catalogue à blanc (50 affaires publiques éligibles, hors dossiers existants et HOLD)
Qualifications finales : **READY 18 · A_REVOIR 16 · BLOQUÉE 14 · PAS_D_ENRICHISSEMENT 2**. Causes : BLOQUÉE — état de la carte non étayé 7, carte périmée/contredite 5 (propositions à la Maintenance), aucune source lisible 2 ; A_REVOIR — divergence de dates/chiffres entre sources 6, fonction identifiante 4, carte « enquête » sans acte judiciaire 4, issue favorable à source unique 1, identité d'une source ambiguë 2, état plus haut que les sources 1, reproche institutionnel 1.

| Affaire | Carte | Qualification | Étapes | Réactions | Sources utiles | Synthèse | Réserve / blocage |
|---|---|---|---:|---:|---:|---|---|
| FR-2026-0006 École maternelle Rochechouar, Paris 9e | plainte | READY | 4 | 0 | 2 | Plainte/orange + Aucune décision rendue | — |
| FR-2026-0011 Structures périscolaires de , Morigny-Champign | mise en examen | READY | 5 | 0 | 2 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0012 Collège-lycée Saint-Jean-de-, Paris 16e | condamnation non définitive | READY | 4 | 0 | 1 | Condamnation/red + Appel annoncé | — |
| FR-2026-0020 Lycée Notre-Dame, Mantes-la-Jolie | condamnation non définitive | READY | 4 | 0 | 2 | Condamnation/red + Aucun appel rapporté | — |
| FR-2026-0022 Institution Saint-Dominique, Neuilly-sur-Sein | enquête | READY | 5 | 1 | 1 | Enquête/blue + Aucune décision rendue | — |
| FR-2026-0025 École Saint-Martin-de-France, Pontoise | mise en examen | READY | 2 | 0 | 2 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0028 École primaire Robert-Doisne, Lucenay | mise en examen | READY | 13 | 0 | 4 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0036 Crèche Chat Perché, Lyon 3e | plainte | READY | 6 | 0 | 1 | Plainte/orange + Aucune décision rendue | — |
| FR-2026-0037 Centre de loisirs du Chambon, Laguenne-sur-Ava | mise en examen | READY | 7 | 1 | 2 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0038 École élémentaire non nommée, Saché | mise en examen | READY | 9 | 2 | 4 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0041 Lycée non nommé, Rouen | condamnation non définitive | READY | 9 | 0 | 2 | Condamnation/red + Aucun appel rapporté | — |
| FR-2026-0043 Lycée Saint-Denis, Annonay | condamnation non définitive | READY | 4 | 2 | 2 | Condamnation/red + Aucun appel rapporté | — |
| FR-2026-0046 Deux écoles maternelles non , Rezé | condamnation non définitive | READY | 11 | 3 | 2 | Condamnation/red + Appel rapporté | — |
| FR-2026-0115 Centre de loisirs municipal , Tarnos | mise en examen | READY | 18 | 3 | 9 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0120 Centre périscolaire / de loi, Charly | mise en examen | READY | 7 | 2 | 2 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0139 Les Tournesols, Lingolsheim | enquête | READY | 5 | 1 | 2 | Enquête/blue + Aucune décision rendue | — |
| POC-02 École maternelle Charlie-Cha, La Courneuve | condamnation non définitive | READY | 11 | 2 | 3 | Condamnation/red + Appel annoncé | — |
| POC-04 École Émeriau, Paris 15e | mise en examen | READY | 9 | 3 | 1 | Mise en examen/blue + Aucune décision rendue | — |
| FR-2026-0005 École maternelle Saint-Domin, Paris 7e | enquête | A_REVOIR | 10 | 5 | 6 | Enquête/blue + Aucune décision rendue | FONCTION_IDENTIFIANTE |
| FR-2026-0007 École maternelle Reuilly II, Paris 12e | enquête | A_REVOIR | 7 | 2 | 1 | — | ETAT_NON_ETAYE_PAR_LES_SOURCES |
| FR-2026-0008 École Boulard, Paris 14e | enquête | A_REVOIR | 11 | 1 | 2 | — | ETAT_NON_ETAYE_PAR_LES_SOURCES |
| FR-2026-0027 École maternelle Les Aresqui, Vic-la-Gardiole | mise en examen | A_REVOIR | 18 | 8 | 7 | Mise en examen/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES |
| FR-2026-0030 Lycée Bagatelle, Saint-Gaudens | mise en examen | A_REVOIR | 31 | 4 | 6 | Mise en examen/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES,FONCTION_IDENTIFIANTE,REPROCHE_A_UNE_INSTITUTION |
| FR-2026-0035 Crèche Joyeuse Tribu, Lyon 6e | relaxe / non-lieu / classement | A_REVOIR | 10 | 0 | 2 | Classement sans suite/green + Aucun appel rapporté | ISSUE_FAVORABLE_SOURCE_UNIQUE |
| FR-2026-0045 Collège Jehan le Povremoyne, Saint-Valéry-en- | condamnation non définitive | A_REVOIR | 11 | 3 | 4 | Condamnation/red + Aucun appel rapporté | DIVERGENCE_ENTRE_SOURCES |
| FR-2026-0119 Centre aéré (école maternell, Morières-lès-Avi | mise en examen | A_REVOIR | 21 | 6 | 7 | Mise en examen/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES |
| FR-2026-0122 École maternelle privée Sain, Paris 10e | mise en examen | A_REVOIR | 8 | 1 | 3 | Mise en examen/blue + Aucune décision rendue | DOC_IDENTITE_AMBIGUE,FONCTION_IDENTIFIANTE |
| FR-2026-0123 Centre de loisirs de l'école, Nice | mise en examen | A_REVOIR | 25 | 8 | 8 | Mise en examen/blue + Aucune décision rendue | FONCTION_IDENTIFIANTE |
| FR-2026-0124 École maternelle Gustave-Bie, Colombes | enquête | A_REVOIR | 5 | 0 | 2 | Enquête/blue + Aucune décision rendue | DOC_IDENTITE_AMBIGUE |
| FR-2026-0133 centre de loisirs de Rots, Rots | enquête | A_REVOIR | 8 | 5 | 5 | Enquête/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES |
| FR-2026-0137 école maternelle Julie-Victo, Soyaux | mise en examen | A_REVOIR | 31 | 4 | 11 | Mise en examen/blue + Aucune décision rendue | DIVERGENCE_ENTRE_SOURCES |
| PARIS-007 École maternelle Reuilly, Paris 12e | enquête | A_REVOIR | 9 | 2 | 1 | — | ETAT_NON_ETAYE_PAR_LES_SOURCES |
| PARIS-008 École maternelle Boulard, Paris 14e | enquête | A_REVOIR | 4 | 0 | 1 | — | ETAT_NON_ETAYE_PAR_LES_SOURCES |
| POC-10 École Volontaires, Paris 15e | enquête | A_REVOIR | 2 | 1 | 2 | Plainte/orange + Aucune décision rendue | ETAT_PLUS_HAUT_QUE_LES_SOURCES |
| FR-2026-0001 École Aqueduc, Paris 10e | condamnation non définitive | BLOQUE | 7 | 0 | 2 | Enquête/blue + Aucune décision rendue | ETAT_NON_ETAYE |
| FR-2026-0003 École Grands Champs, Paris 20e | enquête | BLOQUE | 8 | 1 | 5 | Condamnation/red + Aucun appel rapporté | ETAT_CARTE_PERIME_OU_CONTREDIT |
| FR-2026-0013 Lycée Clément-Ader, Athis-Mons | plainte | BLOQUE | 10 | 2 | 5 | Enquête/blue + Aucune décision rendue | ETAT_CARTE_PERIME_OU_CONTREDIT |
| FR-2026-0021 Établissement non nommé, Les, Les Mureaux | mise en examen | BLOQUE | 0 | 0 | 1 | — | ETAT_NON_ETAYE |
| FR-2026-0024 École Belzunce, Paris 10e | relaxe / non-lieu / classement | BLOQUE | 2 | 0 | 1 | Plainte/orange + Aucune décision rendue | ETAT_NON_ETAYE |
| FR-2026-0026 Collège non nommé, Essonne, commune non préc | procès | BLOQUE | 0 | 0 | 0 | — | AUCUNE_SOURCE_LISIBLE_ET_PERTINENTE |
| FR-2026-0029 Collège Saint-Charles, Chauny | condamnation non définitive | BLOQUE | 10 | 1 | 5 | Audience tenue/blue + Aucune décision rendue | ETAT_NON_ETAYE |
| FR-2026-0033 Collège de Quartier-Français, Sainte-Suzanne | mise en examen | BLOQUE | 0 | 0 | 0 | — | AUCUNE_SOURCE_LISIBLE_ET_PERTINENTE |
| FR-2026-0044 Établissement professionnel , Charentay | condamnation non définitive | BLOQUE | 2 | 0 | 2 | — | ETAT_NON_ETAYE |
| FR-2026-0047 École Alexandre-Copello, Marseille 5e | procès | BLOQUE | 10 | 2 | 4 | Condamnation/red + Aucun appel rapporté | ETAT_CARTE_PERIME_OU_CONTREDIT |
| FR-2026-0116 École de Mées (type non préc, Mées | procès | BLOQUE | 12 | 0 | 3 | Enquête/blue + Aucune décision rendue | ETAT_NON_ETAYE |
| PARIS-004 École maternelle Paul-Dubois, Paris 3e | enquête | BLOQUE | 16 | 2 | 1 | Classement sans suite/green + Aucun appel rapporté | ETAT_CARTE_PERIME_OU_CONTREDIT |
| PARIS-010 École maternelle Grands-Cham, Paris 20e | enquête | BLOQUE | 7 | 1 | 4 | Condamnation/red + Aucun appel rapporté | ETAT_CARTE_PERIME_OU_CONTREDIT |
| POC-03 École élémentaire Jules-Vall, Plaisir | condamnation non définitive | BLOQUE | 9 | 1 | 4 | Enquête/blue + Aucune décision rendue | ETAT_NON_ETAYE |
| FR-2026-0002 École Aqueduc, Paris 10e | enquête | PAS_D_ENRICHISSEMENT | 1 | 0 | 2 | Enquête/blue + Aucune décision rendue | — |
| PARIS-001 École maternelle Saint-Domin, Paris 7e | enquête | PAS_D_ENRICHISSEMENT | 1 | 0 | 1 | Enquête/blue + Aucune décision rendue | — |


Sur le périmètre comparable des 16 affaires déjà générées en début de session : READY 7 → 6, A_REVOIR 1 → 2 (FR-2026-0117, inchangée, et FR-2026-0035), PAS_D_ENRICHISSEMENT 1 → 1, BLOQUÉE 7 → 7 (FR-2026-0035 passe en A_REVOIR : classement fondé sur une seule source et rapporté au conditionnel dans la source de la carte). **Les décomptes bougent peu : l'amélioration est dans le contenu** (doublons, citations récupérées, synthèses, appel annoncé, identifications), pas dans le nombre de READY.

## 6. Coût et capacité
≈ 0,05 USD et ≈ 8 appels LLM par affaire avec deux passes + regroupement ; ≈ 0,03 USD par document lu (DeepSeek, jetons mesurés par OpenRouter). Session entière (essais, deux passes de reproductibilité, validation, catalogue) : ≈ 2,7 USD. Temps : ≈ 6 à 10 min par affaire (modèle « raisonnant »), 6 affaires en parallèle. Les 50 affaires coûtent ≈ 2,6 USD à régénérer.

## 7. Condition de passage à l'échelle
| Condition | Verdict |
|---|---|
| Fiabilité factuelle satisfaisante | **partielle** : aucun fait inventé détecté (citations vérifiées), mais 4 des 8 fiches READY indépendantes relues contenaient une erreur de qualification ou un détail interdit avant correction |
| Couverture cohérente avec la matière | **oui sous réserve** des sources inaccessibles (~20 %) et du rappel de la découverte (Bing, articles récents) |
| Synthèses correctement alimentées | **oui** (état, autorité, date écrite, appel, mesures) ; absentes quand l'état n'est pas étayé |
| Reproductibilité sans régression substantielle | **oui pour l'état, l'issue, la qualification** ; faits secondaires variables (80 %) |
→ La **génération** est généralisable. Le **passage à la publication** reste conditionné à la revue humaine fiche par fiche : la relecture de 8 fiches a suffi à trouver des défauts, donc aucune approbation en bloc.
