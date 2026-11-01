# Journal — POC-04 (école Émeriau, Paris 15e) — publiée + candidate : UNE version finale

**Statut final : MISE À JOUR PRÊTE** (version unique : candidate corrigée, avec ce que la publiée a de correct). Empreintes : publiée `301b5f3da6f70f99` ; candidate examinée `3ac5a2ffa8c2081b` ; **finale `ed20ddf58faf654a`**. Carte inchangée (« mise en examen »).

## Comparaison publiée / candidate
- Publiée : 1 article (20 Minutes 23/02/2026), mise en examen « en octobre 2023 » (approximative), enquête administrative, restitution (convocation du 20/01/2026), plaintes, recommandations préfixées « Mesure annoncée… », « Aucune décision rendue ».
- Candidate : ajoute Le Parisien du 12/10/2023 (interpellation du 4 octobre, mise en examen et contrôle judiciaire) mais fusionnait interpellation et mise en examen sous la date du 4 octobre. Rôle identifiant neutralisé, 2 sources.
- Finale = candidate, dont l'interpellation est séparée et la mise en examen redevient « octobre 2023 » comme dans la publiée (qui était correcte sur ce point).

## Observations des rapports
- « 4 octobre » = date de mise en examen (candidate) : **encore présente** → interpellation datée du 4 octobre 2023 (evenement, type garde à vue) ; mise en examen + contrôle judiciaire à « octobre 2023 » (approximative), « le jour de ces décisions n'est pas précisé ».
- Recommandations formulées ≠ mesures appliquées : **encore présente** (préfixe « Mesure annoncée… » sur « neuf recommandations ») → « …formule neuf recommandations… ; leur mise en œuvre n'est pas rapportée par les sources lues ».
- Restitution : la candidate/publiée disait « convoqués à une restitution » ; l'article rapporte qu'elle a eu lieu (« Pendant près de trois heures, les équipes de la Ville de Paris ont déroulé les conclusions ») → écrit comme tenue le 20/01/2026.
- Répétition de la restitution (publiée P2) : **encore présente** (ligne « rendue en juin 2024 » en double dans `situation.suite`) → ligne retirée.
- Alerte SOURCE_UNIQUE périmée (`generation.attention`) : **encore présente** (2 articles) → retirée.
- « Aucune décision rendue » (§4.1, candidates) : **encore présente** (titre + inconnues[0]) → libellé de la consigne (une mise en examen et un contrôle judiciaire sont des décisions, non niées).
- Rôle identifiant / contestation des faits / seconde source : **acquis, inchangés**.

## Changements exacts
- deroule[0] (« interpellé le 4 octobre… mis en examen… ») → 2 étapes : (a) 2023-10-04 evenement, garde_a_vue, « interpellé sur son lieu de travail le 4 octobre 2023, puis placé en garde à vue » (Le Parisien seul) ; (b) 2023-10 approximative, mise_en_examen, « mis en examen… et placé sous contrôle judiciaire à l'issue de sa garde à vue ; le jour de ces décisions n'est pas précisé » (Le Parisien + 20 Minutes).
- Restitution (texte), recommandations (texte), suite.lignes (ligne en double), suite.titre, inconnues[0].
- reactions : contexte de Patrick Bloche précisé (« à la question de la journaliste de l'émission "Cash investigation"… ») ; citation « que ces conclusions leur avaient été communiquées » inchangée.
- generation.attention : SOURCE_UNIQUE retirée.

## Preuves
- Le Parisien 12/10/2023 (https://www.leparisien.fr/paris-75/suspicion-dagression-sexuelle-dans-une-ecole-de-paris-au-moins-5-signalements-et-plaintes-deposes-12-10-2023-DNPHMP25IFB4TCIEOFVCZF5VLE.php) : « Interpellé sur son lieu de travail le 4 octobre, il a été mis en examen et placé sous contrôle judiciaire à l'issue de sa garde à vue. » (le jour de la mise en examen n'est pas donné).
- 20 Minutes 23/02/2026 (https://www.20minutes.fr/societe/4202824-20260223-violences-periscolaire-paris-parents-revoltes-enquete-mairie-ecole-emeriau) : « mis en examen pour agression sexuelle […] en octobre 2023 […] une instruction est en cours » ; « convoqués pour une restitution le 20 janvier 2026 » ; « Neuf recommandations sont formulées » ; enquête judiciaire « toujours au stade préliminaire » pour les autres plaintes.
- Question à Patrick Bloche : « la journaliste […] lui a alors demandé s'il s'engageait à communiquer aux parents les conclusions ».

## Limites et réserves
- Mise en examen : jour inconnu (entre le 4 et le ~10 octobre 2023 selon Le Parisien). Suite de l'instruction après février 2026 inconnue.
- 20 Minutes mentionne aussi un âge, la profession et un nombre de plaintes élevé selon des parents : non repris.
- `generation.trace` non réalignée (étape scindée) : métadonnée hors dépôt public.
- Ctrl `deroule[2]` : l'étape « au moins cinq signalements et plaintes avaient depuis été déposés » cite la date de l'article (12 octobre 2023), pas l'acte : date laissée vide, signalement justifié.

## Proposition de carte
Aucune.
