# Prompt — Recherche d'affaires dans les structures accueillant des mineurs en France

> Copier-coller ce prompt dans un LLM avec accès web (ChatGPT + browsing, Perplexity, Gemini, etc.)
> Objectif : obtenir un CSV structuré de ~250 affaires sur 5 ans.
> Stratégie : lancer par tranches (par année ou par région) pour maximiser la couverture.

---

## Prompt principal (à adapter par tranche)

```
Tu es un assistant de recherche pour un projet de vigilance citoyenne. Je constitue une base de données publique des affaires signalées dans les structures accueillant des mineurs en France (crèches, écoles, périscolaire, collèges, lycées, centres de loisirs, internats).

Je cherche des affaires DÉJÀ DOCUMENTÉES par la presse, concernant des violences sexuelles ou faits assimilés (viol, agression sexuelle, atteinte sexuelle, images pédocriminelles) dans ces structures. Je ne cherche PAS de témoignages ni de rumeurs — uniquement des affaires relayées par des médias identifiables.

PÉRIODE : [ANNÉE ou PLAGE — ex: "2021", "2022-2023", "janvier à juin 2024"]
GÉOGRAPHIE : [ZONE — ex: "France entière", "Île-de-France", "Sud-Est"]

Pour chaque affaire trouvée, donne-moi les informations suivantes dans un tableau structuré :

| Champ | Consigne |
|---|---|
| etablissement | Nom complet de l'établissement (ex: "École maternelle Jules-Ferry"). Si le nom exact n'est pas mentionné, indiquer ce qui est disponible (ex: "une crèche de Marseille") |
| commune | Ville ou arrondissement (ex: "Paris 15e", "Lyon") |
| departement | Département (ex: "Paris", "Bouches-du-Rhône") |
| adresse | Adresse si mentionnée dans l'article, sinon laisser vide |
| type_structure | Une valeur parmi : crèche, maternelle, élémentaire, collège, lycée, périscolaire, centre de loisirs, internat, autre |
| role_mis_en_cause | Une valeur parmi : enseignant, animateur périscolaire, ATSEM, direction, personnel de crèche, parent, tiers, intervenant extérieur, autre |
| type_affaire | Une valeur parmi : viol, agression sexuelle, atteinte sexuelle, images pédocriminelles, violences sexuelles, mixte, à qualifier |
| statut_judiciaire | Une valeur parmi : plainte, enquête, mise en examen, procès, condamnation non définitive, condamnation définitive, relaxe / non-lieu / classement, à qualifier |
| statut_des_faits | Une valeur parmi : allégué, retenu par jugement non définitif, établi judiciairement, non établi, mixte |
| enfants | Une valeur parmi : 1 enfant, plusieurs enfants, non précisé |
| url1 | URL de l'article de presse le PLUS RÉCENT possible sur cette affaire |
| url2 | URL d'un SECOND article de presse (média différent si possible), le plus récent possible. Si introuvable, laisser vide |
| media1 | Nom du média de url1 (ex: "Le Monde", "France 3 Régions") |
| media2 | Nom du média de url2 |
| date1 | Date de publication de url1 (format YYYY-MM-DD si possible, sinon YYYY-MM) |
| date2 | Date de publication de url2 |
| resume_faits | 1 phrase neutre résumant les faits rapportés par la presse. Pas de nom de personne. Pas de détail graphique. Exemple : "Un enseignant mis en examen pour agressions sexuelles sur plusieurs élèves." |

RÈGLES STRICTES :
- NE JAMAIS mentionner le nom de la personne mise en cause
- NE JAMAIS donner le nombre exact d'enfants (utiliser "plusieurs enfants" ou "1 enfant")
- NE JAMAIS inclure de détails graphiques
- Toujours utiliser un wording neutre ("rapporté par la presse", "selon une source publique")
- Privilégier les sources nationales (Le Monde, Le Figaro, Libération, 20 Minutes, France Info, Le Parisien, Ouest-France) ou presse quotidienne régionale identifiable
- Si tu hésites sur le statut judiciaire, mettre "à qualifier"
- Si l'établissement n'est pas nommé explicitement, l'indiquer clairement (ex: "crèche non nommée, Toulouse")

FORMAT DE SORTIE : un tableau (ou CSV) avec exactement ces 17 colonnes. Une ligne par affaire. Si une même affaire concerne plusieurs établissements distincts, faire une ligne par établissement.

Cherche de manière exhaustive. Vise au minimum 30 affaires pour cette tranche. Indique en fin de réponse :
- Le nombre total d'affaires trouvées
- Les requêtes de recherche que tu as utilisées
- Les zones ou périodes où tu penses qu'il reste des affaires à trouver
```

---

## Stratégie de découpage en tranches

Pour couvrir 5 ans (~250 affaires), lancer le prompt en 5-10 tranches :

| Tranche | Période | Géographie | Affaires attendues |
|---|---|---|---|
| 1 | 2025-2026 | France entière | 40-80 |
| 2 | 2024 | France entière | 40-60 |
| 3 | 2023 | France entière | 40-60 |
| 4 | 2022 | France entière | 30-50 |
| 5 | 2021 | France entière | 20-40 |

Si le LLM atteint sa limite par tranche, découper par région :
- Île-de-France
- Nord (Hauts-de-France, Grand Est)
- Ouest (Bretagne, Normandie, Pays de la Loire)
- Sud-Est (PACA, Auvergne-Rhône-Alpes, Occitanie Est)
- Sud-Ouest (Nouvelle-Aquitaine, Occitanie Ouest)
- Centre / DOM-TOM

## Requêtes de recherche suggérées (à donner au LLM si besoin)

```
"agression sexuelle" "école" site:lemonde.fr OR site:lefigaro.fr OR site:liberation.fr
"violences sexuelles" "crèche" condamnation 2024
"enseignant" "mis en examen" "agression" école 2023
"atteinte sexuelle" mineur école jugement
"périscolaire" "agression sexuelle" condamnation
"ATSEM" "attouchement" école maternelle
"animateur" "centre de loisirs" "agression sexuelle"
```

## Après récupération

1. Consolider toutes les tranches dans un seul fichier `data/import-batch.csv`
2. Dédoublonner (même établissement + même commune = probable doublon)
3. Lancer `node scripts/import-cases.mjs` pour importer + géocoder
4. Valider dans le dashboard Supabase (checkboxes scoring + publication)
