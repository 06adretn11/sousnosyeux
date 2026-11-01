# Journal — POC-05 (maternelle Alphonse-Baudin, Paris 11e) — candidate, dossier du Hub paris-11e

**Statut final : MISE À JOUR PRÊTE** (candidate, retouches ciblées). Touche le Hub : oui (dates de parution, suspension isolée, précisions de jugement et d'appel). Carte « relaxe / non-lieu / classement » : conforme.

## Observations des rapports
- Faux bloc sans faits / sans mesures : **encore présente** (suspension fusionnée au signalement ; `faits` absent) → suspension isolée, faits renseigné.
- Relaxe / appel / condamnation sur collègues non fusionnés : **déjà correct** ; conservé et précisé.
- Source franceinfo sans date : **encore présente** (reportage `publie_le` null) → 09/07/2026 (en-tête de la page : « Publié le 09/07/2026 13:27 »).
- Incohérence de métadonnée avec FR-2026-0001 (même URL datée 09/07) : **confirmée** ; la date réelle de la page est le 09/07/2026, donc l'autre dossier est cohérent avec elle (à ne pas corriger ici).
- Découverts en vérifiant : la page du procès est parue le **27/05** (pas le 26) ; la formule du ministre était mal citée (« de la plus grande fermeté » au lieu de « qui appellent à la plus grande fermeté ») et « cette décision » désignait l'appel, pas la relaxe.

## Changements exacts
- deroule[0] : signalement seul ; ajout `mesure_etablissement` 2025-04-09 (suspension, franceinfo 14/11/2025).
- Audience : `publie_le` 2026-05-26 → 2026-05-27. Mobilisation : `publie_le` null → 2026-07-09 ; texte « Le jeudi 9 juillet ».
- Décision : « Jugement rendu le 7 juillet » ; ajout relaxe de l'agression sexuelle visée sur l'une des collègues.
- Appel : « cette décision d'appel » ; citation exacte « qui appellent à la plus grande fermeté ».
- état_actuel : condamnation + relaxe sur une collègue ; appel limité à une partie des faits (relaxe non définitive sur ce point). inconnues : sort de la condamnation (appel non documenté). `faits` ajouté.
- Empreinte : `9579d7ff4af98ecc` → `b0d36eade7a33635`.

## Preuves
- franceinfo 07/07/2026 : relaxé « mardi 7 juillet » ; « condamné à huit mois de prison avec sursis » pour harcèlement sexuel ; « relaxé de l'agression sexuelle sur une collègue ». https://www.franceinfo.fr/societe/education/violences-dans-le-periscolaire/violences-dans-le-periscolaire-a-paris-l-animateur-de-l-ecole-maternelle-alphonse-baudin-accuse-d-agressions-sexuelles-sur-mineurs-relaxe-par-le-tribunal_8095931.html
- franceinfo/AFP 09/07/2026 : parquet « mercredi 8 juillet, faire appel de la relaxe » ; tweet « fait appel de cette décision pour 3 enfants victimes » (nombre non repris). https://www.franceinfo.fr/societe/education/violences-dans-le-periscolaire/violences-dans-le-periscolaire-a-paris-le-parquet-de-paris-fait-appel-de-la-relaxe-d-un-animateur-de-l-ecole-maternelle-alphonse-baudin-pour-agressions-sexuelles_8101406.html
- franceinfo 14/11/2025 : « suspendu de ses fonctions dès le 9 avril puis placé en garde à vue fin juin ». https://www.franceinfo.fr/societe/education/ce-que-l-on-sait-des-accusations-de-viol-aggrave-et-d-agression-sexuelle-visant-des-animateurs-periscolaires-a-paris_7615793.html
- franceinfo 27/05/2026 : « jugé […] mardi 26 mai » ; réquisitions « trois ans […] dont une année ferme sous bracelet ». Reportage 09/07/2026 : rassemblement « jeudi 9 juillet ».

## Limites
- Nom de l'autorité qui suspend non donné par franceinfo (acteur « Employeur (non précisé) »). Appel contre la condamnation, audience d'appel : non documentés. Motifs connus par la presse seulement.

## Proposition de carte
Aucune.
