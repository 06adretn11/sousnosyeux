# CONVERGENCE DES FICHES GÉNÉRÉES #1 (19/10/2026)

Référence visuelle : Jules-Ferry (FR-2026-0042). Référence industrielle : Paul-Gauguin (FR-2026-0117, publiée, **non modifiée** : son dossier approuvé `4b09fee48cf4b74e` reste celui du site).

## Écart A — synthèse visuelle : défaut de COMPOSITION, pas de template
Chemin : sources → extraction → composition (`fiche-composer.mjs`) → dossier → `FicheUnique.astro`. Le composant existe (deux cartes colorées, `dossier.situation`), il lit `decision{label,titre,meta,cat,texte}` et `suite{label,titre,meta,cat,lignes}` ; la couleur des pilotes suit `statutCat`. Les champs nécessaires étaient **déjà disponibles et vérifiés** (nature de l'issue, date écrite, autorité, appel/finalité, mesures du déroulé) mais le composeur n'écrivait pas `situation` : le template retombait sur le rendu linéaire. Correction : `situation` est composée à partir de ces seules données, sans extraction ni template nouveaux.
- Décision : titre = nature de l'issue (Condamnation / Relaxe / Non-lieu / Classement sans suite / Acquittement) ou de l'état (Mise en examen / Enquête / Plainte / Audience tenue) ; date seulement si écrite et non contestée entre sources ; autorité = acteur de l'acte ; couleur = nature (rouge condamnation, vert relaxe/classement, bleu mise en examen/enquête/procès, orange plainte/appel).
- Suite : « Aucun appel rapporté » / « Appel rapporté » / « Décision devenue définitive » ; sans décision : « Aucune décision rendue » + présomption d'innocence, ou « Prochaine étape » si une audience future est écrite.
- Mesures : une ligne « Mesure institutionnelle (distincte de la décision judiciaire) » par mesure documentée (2 au plus dans la carte, le reste dans le déroulé) ; « Mesure annoncée, sans confirmation… » si non réalisée ; aucune ligne sans mesure ; aucun bloc sans état établi.
- Vocabulaire : une relaxe ou un classement n'est plus dit « non définitif ».

## Écart B — matière : trois causes démontrées (chiffrées sur 12 affaires)
Flux mesuré (événements retenus par les gardes → affichés ; éléments écartés ; hors périmètre) : la perte documentaire principale n'est pas la déduplication mais le rejet de citations **quasi littérales**.
| Cause | Constat | Correction |
|---|---|---|
| Extraction incorrecte (citation qui dérive en fin de phrase) | Tarnos : 10 citations d'événements sur 49 absentes du corps, dont la suspension annoncée par la mairie et l'écartement de deux animateurs ; FR-2026-0004 : 7/48 ; FR-2026-0047 : 2/18 ; Paul-Gauguin : 0/22 | **Citation récupérée** : la phrase de la source désignée par un ancrage de ~45 caractères est retenue (littérale) si elle soutient ≥ 60 % des mots du texte, avec les mêmes gardes (quantités, issues). Tarnos : 4 récupérées |
| Sélection/déduplication | Paul-Gauguin : la mise à pied apparaissait deux fois (28 juin daté / « en juin » non daté) | Même mot-clé de mesure (mis à pied ≈ suspendu ≈ écarté, licenciement, mutation, cellule d'écoute…), **même état de réalisation**, dates compatibles → un seul fait. Une annonce et une mise en œuvre restent deux faits |
| Libellé | « divergence : mise_en_examen » (code interne) | libellé français |
Causes restantes, non corrigées : **source inaccessible** (403/503), **sources de recherche** récentes seulement, **date de la mise en examen de Paul-Gauguin** (Ouest-France date la garde à vue au 21 et écrit « puis mis en examen » : le modèle a daté la MEE du 21, d'où la « divergence » ; elle est signalée, pas résolue), **choix éditorial en attente** (« Poursuivi pour » des pilotes : non structuré, non extrait).

## Résultats avant / après (mêmes extractions du cache, 0 nouvel appel pour les corrections)
| Affaire | Config. | Étapes avant → après | Qualif. | Synthèse |
|---|---|---|---|---|
| FR-2026-0117 Paul-Gauguin | MEE, mesure | 8 → 7 (doublon éliminé) | A_REVOIR → idem | Mise en examen (bleu) + Aucune décision rendue + mesure |
| FR-2026-0115 Tarnos | riche, mesures | 15 → 17 (+suspension annoncée, +écartement) | READY → idem | Mise en examen + mesures (annoncée / réalisée distinguées) |
| FR-2026-0046 Rezé | condamnation, appel | 11 → 11 | READY → idem | Condamnation (rouge) + Appel rapporté (orange) |
| FR-2026-0038 Saché | MEE | 9 → 9 | READY → idem | Mise en examen |
| 8 autres affaires (BLOQUÉ) | état contredit, HOLD, sans source | inchangé | BLOQUÉ → idem | sans objet (jamais proposées) |
**Validation indépendante** (5 affaires jamais vues, générées avec le code final, aucune règle retouchée après lecture sauf le libellé relaxe/classement, trouvé sur FR-2026-0035 de l'échantillon de développement) : FR-2026-0043 condamnation (rouge, 1ᵉʳ juillet 2025, tribunal de Privas, suspension + dispositif d'écoute) ; FR-2026-0035 classement sans suite (vert) ; FR-2026-0025 mise en examen, **2 étapes, aucun bloc de mesure** (cas négatif) ; FR-2026-0002 enquête, 2 étapes, aucun bloc de mesure ; FR-2026-0036 plainte (orange). Aucune régression de qualification sur les 15 affaires. Coût des 14 appels de validation : 0,09 USD ; corrections : 0 appel.
Réserves de la validation : FR-2026-0035 : le classement sans suite repose sur **un seul site** (Magic Maman) rapportant la décision, pas sur le parquet : à renforcer par une règle de preuve pour relaxe/classement (R5 ne vérifie aujourd'hui que l'existence d'une décision lue) ; FR-2026-0002 et -0025 : fiches très courtes, READY (≥ 2 étapes) : seuil d'enrichissement à discuter.

## Production
Aucun fichier de données, aucun template, aucune page publique modifiés par cette PR ; le dossier approuvé de Paul-Gauguin n'est pas touché. Une **nouvelle version** de la fiche Paul-Gauguin (avec synthèse visuelle) peut être générée mais exige une **nouvelle approbation** (empreinte différente).
