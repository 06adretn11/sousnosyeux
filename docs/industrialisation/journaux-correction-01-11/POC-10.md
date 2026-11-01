# Journal — POC-10 (école Volontaires, Paris 15e) — publiée + candidate : UNE version finale

**Statut final : MISE À JOUR PRÊTE** (version unique : candidate corrigée). Empreintes : publiée `b6c0d06e024d87e3` ; candidate examinée `c300e67bbd798e1a` ; **finale `99673d401ef0fb4e`**. Carte « plainte » (inchangée).

## Comparaison publiée / candidate
- Publiée : ELLE (16/03/2026) seule + citation d'ICI (11/10/2026) ; `statut_affiche` « enquête » (champ interne, pas ce que la page affiche : « Plainte »).
- Candidate : ajoute 2 étapes du Parisien du 10/03/2026 (plainte mi-février, animateur « actuellement suspendu »). Ces deux ajouts sont étayés (article relu).
- Finale = candidate corrigée.

## Observations des rapports
- Intitulé « viols commis » (`a_propos`) : **encore présente** (« impunité des responsables et gravité des viols commis sur de très jeunes enfants ») → remplacé (voir citation ci-dessous), plus aucune affirmation non attribuée de viols.
- Portée de la citation de l'avocat : **confirmée collective** : l'article ICI du 11/10/2026 porte sur une plainte déposée par une vingtaine de familles d'enfants de DEUX écoles (Saint-Dominique et Volontaires) contre la Ville ; « On ne parle pas d'une impéritie sans conséquence, mais de viols de tous petits enfants » y vise les responsables de la Ville. Elle n'est donc pas propre à Volontaires. → Remplacée par la déclaration du même avocat directement liée à Volontaires (Le Parisien 10/03/2026, communiqué transmis à l'AFP).
- Date ELLE absente du tableau `generation.sources` (« date ? ») : **encore présente** → 2026-03-16.
- `statut_affiche = enquête` : **encore présente** → « plainte » (= carte).
- « Aucune décision rendue » : **encore présente** → « Jugement sur le fond non documenté » ; ajout d'une ligne de suite (animateur « actuellement suspendu » au 10/03/2026, mesure institutionnelle).
- Ne pas réimporter parcours entre écoles, suspension d'un autre animateur : **acquis, inchangés** ; en plus, retrait de « qui y travaillait depuis décembre 2025 » dans `faits` (parcours dispensable ; ELLE et Le Parisien divergent sur la durée).

## Changements exacts
- reactions[0] : Louis Cailliez (ICI) → Louis Cailliez, « avocat de la famille d'un enfant de l'école Volontaires » (Le Parisien 10/03/2026) ; citation exacte « l'absence de célérité judiciaire est incompréhensible et place mes clients dans une situation très douloureuse et intenable » ; contexte : la famille « réclame la désignation d'un juge d'instruction » et appelle à « l'ouverture d'une information judiciaire dans les plus brefs délais » ; objet : « la lenteur de la procédure judiciaire, selon l'avocat de la famille ».
- statut_affiche, suite.titre, suite.lignes (+1), inconnues (3 lignes : enquête judiciaire non rapportée, réserve sur le nombre de plaintes propres à Volontaires, 2 articles), generation.sources (date ELLE ; ICI « lu mais non utilisé »), faits.

## Preuves
- Le Parisien 10/03/2026 (https://www.leparisien.fr/paris-75/periscolaire-a-paris-un-animateur-dune-ecole-du-xve-vise-par-trois-plaintes-pour-viol-sur-mineur-10-03-2026-ODNJZZILXJCGHFQHXTLJR7PLJ4.php) : « Les parents de cet enfant scolarisé à l'école Volontaires ont porté plainte mi-février » ; l'animateur « actuellement suspendu » (France Inter) ; « La famille du garçon de trois ans a annoncé réclamer la désignation d'un juge d'instruction » (âge non repris dans la fiche) ; citation de Me Cailliez dans « un communiqué transmis à l'AFP ».
- ICI 11/10/2026 (https://www.ici.fr/ile-de-france/paris-75/paris/periscolaire-a-paris-de-nouvelles-familles-portent-plainte-dans-le-cadre-de-l-enquete-sur-les-violences-sexuelles-9444315) : « Leurs enfants étaient scolarisés en maternelle dans les écoles Saint-Dominique […] et Volontaires » ; plainte « contre la Ville de Paris ».
- ELLE (https://www.elle.fr/Societe/News/Violences-sexuelles-dans-le-periscolaire-quelles-sont-les-ecoles-parisiennes-les-plus-touchees-4459600) : « trois plaintes pour viol et agressions sexuelles sur mineur avaient également été déposées contre un animateur de l'école Volontaires du 15e arrondissement » ; date de parution 16/03/2026 consignée dans le dossier (non revérifiée dans le texte de la page).

## Limites et réserves
- **Nombre de plaintes** : ELLE les rattache à Volontaires ; Le Parisien dit que l'animateur est « visé par trois plaintes » et que les parents d'un élève de Volontaires ont porté plainte mi-février, mais la plainte de Saint-Dominique est antérieure. La part propre à Volontaires n'est pas établie : réserve ajoutée aux inconnues ; l'étape de plainte reste attribuée à ELLE.
- Aucune enquête judiciaire propre à ces plaintes n'est établie par les sources lues (la famille réclamait une information judiciaire le 10/03/2026).
- Ctrl `deroule[2]` (« article du 10 mars 2026 ») : mention de la date de l'article, pas de l'acte ; non datée, signalement justifié.

## Proposition de carte
Aucune (« plainte » correct).
