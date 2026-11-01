# Journal — POC-07 (maternelle Servan, Paris 11e) — candidate, dossier du Hub paris-11e

**Statut final : MISE À JOUR PRÊTE** (candidate, retouches ciblées). Touche le Hub : oui (suspension de l'animateur isolée, autre agent en contexte distinct, janvier 2026). Carte « mise en examen » : conforme.

## Observations des rapports
- Suspension d'un autre agent placée dans les mesures : **encore présente** (entrée « mesure_etablissement » sans lien établi) → reclassée en `contexte` explicitement distinct, rôle neutralisé (« autre membre de l'équipe d'animation »).
- Ne pas attribuer plainte/suspension de l'autre agent à l'animateur mis en examen : **confirmé** ; la suspension propre à l'animateur (ICI : « suspendu par son employeur » dès son identification) est isolée en mesure.
- Première plainte / interpellation / mise en examen distincts : **déjà correct** ; conservé.
- Faux bloc sans faits : **encore présente** → `faits` renseigné.

## Changements exacts
- deroule[0] : plainte seule ; ajout `mesure_etablissement` (suspension de l'animateur, non datée).
- Signalements : « début 2026, deux autres signalements » → janvier 2026 (« un signalement supplémentaire », parquet), acteur « Parquet de Paris » ; plus de décompte.
- Autre agent : type `contexte`, texte « n'est pas rattaché aux étapes ci-dessus » ; inconnue reformulée. `faits` ajouté.
- Empreinte : `75ce3dc64e6d3a51` → `a6be119b416bc279`.

## Preuves (ICI, 12/05/2026) https://www.ici.fr/ile-de-france/paris-75/paris/violences-sexuelles-dans-le-periscolaire-a-paris-un-animateur-d-une-ecole-maternelle-mis-en-examen-et-ecroue-3298366
- « plainte en novembre 2025 » ; « Dès que l'animateur a été identifié, il a été suspendu par son employeur. »
- « En janvier 2026, le parquet a reçu un signalement évoquant deux autres victimes » ; employés : « Six employés ont pu être entendus par la BPM ».
- « interpellé ce 28 avril » ; « mis en examen jeudi 30 avril et placé en détention provisoire pour des "gestes de nature sexuelle" » ; l'autre agent « suspendu après le dépôt d'une plainte ».

## Limites
- La date de mise en examen vient du seul article ICI. L'article ICI est lui-même flottant sur « deux signalements » / « un signalement » : formulation retenue prudente. Lien entre les deux procédures inconnu.

## Proposition de carte
Aucune.
