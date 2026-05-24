# Brief projet — Carte publique des affaires signalées dans les structures accueillant des mineurs

_Date de cadrage : 2026-05-24_  
_Statut : version POC / cahier des charges succinct_

## 1. Objectif du projet

Créer une base de données structurée d'affaires publiques concernant des faits allégués, poursuivis ou jugés de violences sexuelles ou faits assimilés dans des structures accueillant des mineurs en France, afin d'alimenter une future carte publique à destination des parents.

La carte ne vise pas à désigner des établissements comme « dangereux ». Elle vise à rendre visibles des affaires déjà documentées publiquement, avec un haut niveau de prudence éditoriale : source sélectionnée, statut judiciaire explicite, datation, score de fiabilité et wording neutre.

## 2. Principe éditorial central

Chaque fiche doit répondre à une question simple :

> Existe-t-il une source publique fiable rapportant une affaire concernant cet établissement, et quel était son statut judiciaire à la date de la source ?

La publication doit toujours distinguer :
- un fait allégué ;
- une plainte ou une enquête ;
- une mise en examen ;
- un procès ;
- une condamnation non définitive ;
- une condamnation définitive ;
- une relaxe, un non-lieu ou un classement.

## 3. Périmètre du POC

| Élément | Cadrage |
|---|---|
| Volume POC | 20 affaires |
| Géographie | France |
| Structures | crèches, écoles maternelles, écoles élémentaires, collèges, lycées, périscolaire, centres de loisirs, internats |
| Sources | articles de presse fiables, idéalement récents, avec établissement explicitement nommé |
| Données publiques | établissement, commune, type de structure, rôle générique, statut judiciaire, lien source |
| Données exclues | nom de la personne mise en cause, nombre exact d'enfants, détails graphiques, témoignages détaillés |

## 4. Stack technique cible

| Brique | Choix |
|---|---|
| Base de données | Supabase |
| Déploiement | Cloudflare |
| Hébergement / nom de domaine | OVH |
| Repository public | GitHub |
| Alias GitHub cible | `06adretn11` |

Hypothèse d'architecture :
- Supabase pour stocker les tables `cases`, `sources`, `reviews` et gérer l'API.
- Front-end statique ou SSR léger déployé via Cloudflare.
- Domaine et DNS gérés via OVH, avec routage vers Cloudflare.
- Code publié sur GitHub pour transparence, versioning, tickets et documentation.
- Données sensibles limitées et contrôlées côté base ; aucune donnée personnelle inutile ne doit être publiée.

## 5. Template POC recommandé

Le POC doit rester volontairement court : 15 colonnes maximum.

| Champ | Format attendu | Usage |
|---|---|---|
| `case_id` | `FR-YYYY-0001` | identifiant stable |
| `etablissement` | texte | nom public de l'établissement |
| `commune` | texte | géolocalisation |
| `departement` | texte | géolocalisation |
| `type_structure` | liste fermée | filtre carte |
| `role_mis_en_cause` | liste fermée | typologie du cas |
| `type_affaire` | liste fermée | catégorie simplifiée |
| `statut_judiciaire` | liste fermée | statut de la procédure |
| `statut_des_faits` | liste fermée | allégué / jugé / établi |
| `enfants_concernes_public` | liste fermée | `1 enfant`, `plusieurs enfants`, `non précisé` |
| `source_url` | URL | lien public principal |
| `source_media` | texte | média source |
| `source_date` | date | fraîcheur de l'information |
| `fiabilite_info_10` | entier 0-10 | score éditorial |
| `commentaire_validation` | texte court | réserves et décision map |

## 6. Listes fermées recommandées

### `type_structure`

- crèche
- maternelle
- élémentaire
- collège
- lycée
- périscolaire
- centre de loisirs
- internat
- autre

### `role_mis_en_cause`

- enseignant
- animateur périscolaire
- ATSEM
- direction
- personnel de crèche
- parent
- tiers
- intervenant extérieur
- autre

### `type_affaire`

- viol
- agression sexuelle
- atteinte sexuelle
- images pédocriminelles
- violences sexuelles
- mixte
- à qualifier

### `statut_judiciaire`

- plainte
- enquête
- mise en examen
- procès
- condamnation non définitive
- condamnation définitive
- relaxe / non-lieu / classement
- à qualifier

### `statut_des_faits`

- allégué
- retenu par jugement non définitif
- établi judiciairement
- non établi
- mixte

## 7. Méthodologie d'alimentation

### Étape 1 — Identifier les affaires candidates

Objectif : constituer une liste brute d'établissements à investiguer.

Sources possibles :
- articles de presse locale ou nationale ;
- articles de synthèse pour repérage ;
- articles judiciaires ;
- communiqués mairie, rectorat, parquet ou institution ;
- collectifs de parents uniquement comme signal faible à corroborer.

Sortie attendue :

| case_id provisoire | établissement | commune | source pressentie | statut supposé |
|---|---|---|---|---|

À ce stade, une affaire candidate n'est pas publiable.

### Étape 2 — Sélectionner la meilleure source

Pour chaque affaire, sélectionner une source principale, et éventuellement une source secondaire.

Priorité :
1. article récent mentionnant le statut judiciaire ;
2. article citant parquet, tribunal, mairie, rectorat ou AFP ;
3. article centré sur l'affaire et l'établissement ;
4. article de synthèse fiable si aucune source dédiée récente ;
5. témoignage seul uniquement en appoint, jamais comme source principale.

### Étape 3 — Extraire les données dans le template

Ne pas résumer toute l'affaire. Extraire uniquement les champs utiles à la carte :
- établissement ;
- type de structure ;
- rôle générique ;
- type d'affaire ;
- statut judiciaire ;
- statut des faits ;
- enfants concernés en version simplifiée ;
- source ;
- score de fiabilité.

### Étape 4 — Scorer la fiabilité

Score sur 10, basé sur 5 critères.

| Critère | Points |
|---|---:|
| Source fiable et identifiable | 2 |
| Article récent ou mis à jour | 2 |
| Établissement explicitement nommé | 2 |
| Statut judiciaire clair | 2 |
| Source institutionnelle citée ou recoupement possible | 2 |

Interprétation :

| Score | Décision |
|---:|---|
| 9-10 | publiable, sous réserve de wording standard |
| 7-8 | publiable avec réserve |
| 5-6 | à renforcer avant publication |
| 3-4 | non publiable au niveau établissement |
| 0-2 | exclure |

Seuil POC recommandé :

> Publier uniquement les fiches avec `fiabilite_info_10 >= 7`.

## 8. Règles de publication

| Statut judiciaire | Publication map | Wording recommandé |
|---|---|---|
| plainte | possible si source solide | « plainte rapportée » |
| enquête | possible si établissement nommé | « enquête rapportée » |
| mise en examen | oui avec réserve | « mise en examen rapportée » |
| procès | oui avec réserve | « procédure judiciaire rapportée » |
| condamnation non définitive | oui avec mention appel possible | « condamnation rapportée, caractère définitif à vérifier » |
| condamnation définitive | oui | « condamnation définitive rapportée » |
| relaxe / non-lieu / classement | uniquement si correction nécessaire | « procédure close sans condamnation » |

## 9. Wording public standardisé

### Plainte / enquête

> Une source publique rapporte une plainte ou une enquête concernant cet établissement. Les faits sont allégués et n'étaient pas établis judiciairement à la date de la source.

### Mise en examen

> Une source publique rapporte une mise en examen dans une affaire concernant cet établissement. Une mise en examen ne vaut pas culpabilité.

### Procès

> Une source publique rapporte une procédure judiciaire concernant cet établissement. La décision finale doit être vérifiée.

### Condamnation non définitive

> Une source publique rapporte une condamnation concernant cet établissement. Le caractère définitif de la décision doit être vérifié.

### Condamnation définitive

> Une source publique rapporte une condamnation définitive dans une affaire concernant cet établissement.

## 10. Modèle de données cible

### Table `cases`

Une ligne par affaire cartographiable.

| Champ | Description |
|---|---|
| `case_id` | identifiant stable |
| `etablissement` | nom public |
| `commune` | localisation |
| `departement` | localisation |
| `type_structure` | filtre carte |
| `role_mis_en_cause` | typologie |
| `type_affaire` | catégorie simplifiée |
| `statut_judiciaire` | statut principal |
| `statut_des_faits` | allégué / établi |
| `enfants_concernes_public` | 1 enfant / plusieurs / non précisé |
| `fiabilite_info_10` | score |
| `publication_status` | candidate / validée / publiée / retirée |

### Table `sources`

Une ou plusieurs sources par affaire.

| Champ | Description |
|---|---|
| `source_id` | identifiant |
| `case_id` | rattachement |
| `url` | lien |
| `media` | média |
| `publication_date` | date |
| `source_type` | presse / institution / justice |
| `is_primary` | oui/non |
| `access_checked_at` | date de vérification |

### Table `reviews`

Historique de validation.

| Champ | Description |
|---|---|
| `review_id` | identifiant |
| `case_id` | rattachement |
| `reviewed_at` | date |
| `reviewed_by` | relecteur |
| `decision` | validé / à corriger / retirer |
| `comment` | justification courte |
| `next_review_at` | prochaine revue |

## 11. Estimation de volumétrie annuelle

Il n'existe pas, à ce stade du projet, de base publique nationale consolidée directement alignée avec ce périmètre : établissement nommé, source presse, violences sexuelles ou faits assimilés, statut judiciaire lisible.

L'estimation doit donc distinguer trois niveaux.

| Niveau | Définition | Estimation annuelle France |
|---|---|---:|
| Affaires candidates | signalements, plaintes, enquêtes, articles de synthèse ou sources faibles à investiguer | 80 à 150 |
| Affaires documentables | source presse fiable, établissement nommé, statut suffisamment lisible | 40 à 80 |
| Affaires publiables map | score >= 7/10, wording sécurisé, source sélectionnée, statut judiciaire clair | 20 à 50 |

Pour le process actuel, l'hypothèse raisonnable est donc :

> En régime de croisière manuel, viser 30 à 50 affaires publiables par an semble faisable, avec 80 à 150 affaires candidates à trier.

### Charge de traitement estimée

| Action | Temps moyen / affaire |
|---|---:|
| repérage affaire candidate | 5 à 10 min |
| sélection source principale | 10 à 20 min |
| extraction template | 10 à 15 min |
| scoring et wording | 5 à 10 min |
| validation humaine | 10 à 20 min |

Charge moyenne par affaire publiable : 40 à 75 minutes.

Pour 30 à 50 affaires publiables par an :
- charge annuelle estimée : 20 à 60 heures ;
- avec revue trimestrielle des affaires non closes : ajouter 10 à 25 heures.

## 12. Points juridiques et éditoriaux à sécuriser

- Respect strict de la présomption d'innocence.
- Ne pas publier le nom de la personne mise en cause.
- Ne pas publier le nombre exact d'enfants dans la fiche map.
- Ne pas publier de détails graphiques.
- Prévoir une procédure de correction, retrait et droit de réponse.
- Prévoir une revue juridique avant publication publique.
- Garder une trace des sources et dates de vérification.

## 13. Prochaine étape

1. Finaliser les 20 affaires POC.
2. Créer le repository GitHub sous l'alias `06adretn11`.
3. Poser le schéma Supabase minimal.
4. Importer les 20 fiches validées.
5. Créer une première carte interne non publique.
6. Tester les wordings et filtres.
7. Faire une revue juridique / éditoriale avant publication.
