# VEILLE_ACTEURS_1 — prises de parole publiques et acteurs de terrain (26/11/2026)

**Périmètre de ce document.** Passage du pilote de veille sur deux comptes Instagram à une veille **extensible** d'acteurs (collectifs, associations, institutions), sur la chaîne existante (`data/associations-watchlist.json` → `maintenance-cycle.mjs --sources-suivies` → mémoire Neon → pistes / propositions → Telegram → revue humaine). Aucun nouveau CRM, aucune nouvelle rubrique. **Aucun contact, aucun message, aucune publication, aucun abonnement.** Ce qui est écrit ici est ce qui a été **observé** ; ce qui ne l'a pas été est dit.

## 1. Ce que Dot est, et ce que SNY en lit

- Dot est un agent externe (ChatGPT « dots ») : son run de 8 h 50 restitue dans **sa propre conversation** ; son registre (`SNY_Dot_Suivi_acteurs_et_echanges.md`) est un fichier que vous copiez à la main. **Aucun canal automatique Dot → SNY n'existe ni n'est accessible depuis cet environnement** (aucune trace dans le dépôt, les issues, les PR ou les workflows). Je ne simule donc pas cette intégration.
- Conséquence : SNY **surveille directement les sources identifiées par Dot** (registre ci-dessous). Les statuts « découvert », « suivi », « contact proposé », « envoyé », « réponse reçue » restent distincts : SNY ne tient que les deux premiers (`role: identite_a_confirmer` = découvert, non suivi ; une entrée avec `suivi.pages` = suivi). Les trois autres restent **dans le registre de Dot** (source unique, pas de registre concurrent).
- **Le seul raccordement manquant** : que Dot dépose son registre à un endroit lisible par le cycle SNY (par exemple un fichier d'un dépôt ou un lien de partage lu en CI). Tant que ce n'est pas fait, l'ajout d'un acteur trouvé par Dot passe par une entrée du registre `associations-watchlist.json`.
- Les « 27 comptes Instagram déjà suivis » : **introuvables** (le registre n'en contenait que 2 ; ni le dépôt ni les fichiers Dot ne les listent). Le travail porte sur les comptes établis.

## 2. Couverture compte par compte (mesurée le 26/11/2026)

Accès Instagram par Business Discovery (Graph v27.0), lecture seule, légende seule. Erreur 110/2207013 : compte non professionnel, privé ou identifiant inexact (cause non distinguée).

| Compte | Accès | Publications déclarées | Remarque |
|---|---|---|---|
| @leursvoixnotrecombat40 | lisible | 117 | rejeu identique, pagination vérifiée |
| @sosperiscolaire | lisible | 150 | pagination vérifiée |
| @stoptaboupedo | lisible | 159 | lien exact publié par le collectif dans sa pétition |
| @metooecole | lisible | 230 | |
| @ville_de_tarnos | lisible | 1 766 | source documentaire (mairie), jamais cible |
| @villedemerignac | lisible | 3 046 | source documentaire (mairie), jamais cible |
| @enfantbleunational | **non lisible** (110/2207013) | — | consigné dans `acces_testes`, pas « sans nouveauté » |
| @anttonrouget | **non lisible** (110/2207013) | — | journaliste : hors registre |
| @adavemjp40 | **non lisible** (110/2207013) | — | identifiant attribué par une plaquette municipale, pas par l'association |

## 3. Mesure du coût et des limites (Instagram)

- Une page = **25 publications** par appel (taille maximale testée : 25 ; le code accepte 1 à 50). 0,4 à 2 s par appel. Rejeu de la première page : **identique**. Pagination par curseur : fonctionne (page 2 sans chevauchement).
- Consommation annoncée par Meta après 12 appels : 3 % (en-tête d'usage de l'application). Aucun quota atteint à ce jour.
- Dimensionnement : 6 comptes = 6 appels pour une première page ; budget de **18 appels par cycle** = 6 premières pages + 12 pages d'historique, réparties en priorité sur les comptes dont l'historique lu est le moins profond. Au premier cycle l'historique de chaque compte n'est lu que sur environ 2 à 3 pages (marqué « NON couvert avant … ») ; il s'étend aux cycles suivants **si** le budget le permet. Il n'y a **pas de rotation** : le budget doit rester ≥ nombre de comptes (au-delà, les comptes non lus sont en panne « budget », jamais « sans nouveauté »).
- Plafond du code relevé de 4 à 80 appels par cycle (décision après mesure) ; le registre fixe 18.

## 4. Canaux testés

| Canal | Résultat | Preuve |
|---|---|---|
| Instagram (Business Discovery) | **accès démontré** pour 6 comptes sur 9 ; 3 non lisibles | mesure du 26/11 + essais CI en `--dry-run` |
| Billet de blog Mediapart (Club) | **accès démontré** en CI (lecteur HTTP) | essai dry-run |
| Pétition et mise à jour change.org | **accès démontré** en CI (page de mise à jour) ; la liste des mises à jour ne figure pas sur la page principale | essai dry-run |
| Sites de communes (Tarnos, Mérignac) | **accès démontré** en CI | essai dry-run |
| Sites d'associations déjà au registre | pannes **visibles** : metooecole.org (blocage anti-robot 403), sosperiscolaire.fr (page vide, application JavaScript), adavem40.fr (domaine introuvable), pav75.fr (erreur TLS), fcpe75.org (404) | inventaire du run CI |
| Facebook (pages publiques) | **indisponible** par lecture HTTP (page vide / mur de connexion), testé localement sur deux pages ; l'API Pages de Meta est une possibilité documentée **non testée** (permissions et revue d'application à vérifier) | essai du 26/11 |
| X | **non testé, volontairement** : les conditions consultées interdisent le crawl sans accord écrit ; l'API est payante (0,005 $ par publication tierce lue au tarif affiché) ; aucun budget autorisé | document Dot du 23/11 |
| Newsletters | aucune source concrète identifiée ; non testé | — |

## 5. Ce que la collecte fait

- **Comptes Instagram** (6) : première page de 25 publications par compte et par cycle, pages d'historique dans la limite de 18 appels ; légende seule ; témoignages anonymes écartés sans conservation.
- **Sources web d'un acteur** (blog, pétition, site de commune) : lues par le lecteur HTTP existant ; un acteur ne produit des **pistes** à partir de ses publications propres que s'il porte `pistes_propres: true` ; une commune porte `source_institutionnelle: true` (aucun rattachement ni piste sans fait de violence, plainte ou signalement dans le texte ; aucun « Commune de … » ajouté à une légende).
- **Déclaration d'ensemble** : un texte d'un acteur suivi qui nomme **plusieurs structures distinctes** (clé : établissement ou alias + commune) et porte un signal public concret devient une **piste de hub** (territoire nommé dans le texte), jamais le fait d'une seule affaire. Un rattachement plein à UNE affaire n'est jamais détourné ; une même structure à deux dossiers reste un arbitrage humain.
- **Piste** = table `pistes_a_qualifier` (migration 028, appliquée le 24/11) + une notification Telegram groupée (8 au plus par passage) ; aucune proposition d'état, aucune fiche, aucun statut. Le texte conservé est un extrait court, vidé après la notification.
- **Journaux de CI (publics)** : compteurs par destination, pannes par domaine, inventaire des acteurs (état de la lecture) ; ni texte, ni adresse de publication, ni piste détaillée.

## 5 bis. Limites connues de la classification

- Les pistes sont des **signaux à qualifier**, pas des faits : « article de presse cité » et « mobilisation » restent bruyants sur les comptes de collectifs (à mesurer sur plusieurs cycles).
- Au premier cycle, la lecture remonte jusqu'à environ 450 publications (juin à novembre) : **21 pistes** attendues d'un coup (8 par passage) ; ensuite le flux est incrémental.
- Aucune rotation : le budget doit rester ≥ nombre de comptes + marge (testé).
- Un billet de blog d'une plateforme (Mediapart) n'est la publication de l'acteur que si son adresse contient celle du blog (`suivi.filtre.inclure`).

## 6. Résultats publiables proposés (revue humaine, aucune publication)

Chaque ligne = un document lu à la source ; **différence avec SNY constatée sur les pages publiques le 26/11**. Aucun statut judiciaire n'est inféré ; les demandes, annonces et réalisations restent distinctes.

| # | Acteur et document | Date | Ce qui est constaté (attribué) | Écart avec SNY | Destination proposée |
|---|---|---|---|---|---|
| 1 | Parents d'élèves de plusieurs écoles du 11ᵉ, billet de blog Mediapart | publié le 28/01/2026 ; saisine déclarée du 22/12/2025 | Les signataires déclarent avoir saisi le Défenseur des droits et **demandent** un constat, une enquête indépendante, un audit organisationnel, un avis. Aucune réponse du Défenseur dans le texte. Écoles signataires : Alphonse-Baudin, Bullourde, Faidherbe, 11 bis Parmentier, Titon, Keller. | absente de la fiche POC-06 **et** du hub Paris 11e | **complément de hub Paris 11e** (section « Familles… »), attribué aux signataires ; pas de mise à jour de la seule fiche Bullourde |
| 2 | Collectif Stop Tabou Pédocriminalité (Toulouse), mise à jour de pétition | 7/05/2026 (France 3 : courrier du 8/05) | Le collectif **demande** un bilan des engagements de 2024, une chaîne de signalement unique, une charte communale, des formations, etc. Aucune demande n'est établie comme reprise par la Ville. | aucune fiche ni hub à Toulouse | **piste éditoriale** ; la fiche Bénézet (FR-2026-0048) est retenue en base : sa publication est **votre décision** |
| 3 | Ville de Toulouse, réponse au collectif (France 3 Occitanie, 14/05/2026) | courrier du 12/05/2026 | La Ville **dit** avoir interdit les téléphones (août 2023), formé « 250 agents » depuis 2025 ; charte communale et référents **à l'étude** (ni annoncés ni réalisés). | idem | complément de hub Toulouse à créer, ou mise à jour de FR-2026-0048 si publiée |
| 4 | Ville de Toulouse, annonces de rentrée (27/08/2026, page mise à jour le 12/10) | 27/08/2026 | **Annonces** : plan « en cours de préparation », 340 000 € de formation, cellule de contrôle, badges. Formations d'ici fin 2026-2027 : pas encore réalisées. | idem | idem (annonces, pas réalisations) |
| 5 | Tarnos (FR-2026-0115), Ville de Tarnos : réunion publique | tenue le 15/07/2026 (page du 12/10, mise à jour le 10/11) | La Ville écrit que la réunion s'est tenue ; communiqué du 17/07 : confirmation contemporaine. Ne confirme pas la fermeture du centre. | la fiche la liste encore « annoncée, sans confirmation » | **mise à jour de fiche** |
| 6 | Tarnos, avenant n°1 à la délégation de service public | séance du 10/11/2026 | Adopté selon Sud Ouest (12/11) ; contenu non lu ; signature et application non établies. | la fiche et le hub : « avenant soumis au prochain conseil » | mise à jour de fiche (pas un statut judiciaire) |
| 7 | Tarnos, procureur de Dax : auditions | 9/11/2026 | Selon Sud Ouest : 101 auditions de responsables légaux, 36 de mineurs. Actes d'enquête, pas un nombre de victimes. **Corps de l'article non lu** (domaine inaccessible). | absent | mise à jour de fiche **après lecture du texte complet** |
| 8 | Tarnos, audition du collectif au Sénat | 3/09/2026 | Le collectif de parents du centre de loisirs est dans la liste des personnes entendues (rapport n° 73). Contenu non publié. Aucun lien avec « Leurs voix, notre combat ». | absent | complément de hub Landes |
| 9 | Tarnos, date de remise en liberté de l'animateur | arrêt du 24/07/2026 (ICI, 01/08) | La fiche affiche le 4 septembre (date d'un article). Selon ICI l'arrêt date du 24/07. | écart de date | correction de fiche (certitude moyenne-haute, arrêt non lu) |
| 10 | Mées (FR-2026-0116), Adavem | réunion du 23/09 | Déjà sur la fiche et sur le hub Landes. La nuance « requise par le parquet » n'est que sur le hub. | couvert | aligner la fiche (une phrase) |
| 11 | Soyaux (FR-2026-0137), France Victimes 16 | 14/10/2026 | Déjà sur la fiche (ici, Sud Ouest). Alouette (14/10) le confirme indépendamment. | couvert | ajouter Alouette comme source (optionnel) |
| 12 | Hyères, école Françoise-Dolto : Les Ami(e)s de Romy | juin 2026 | Soutien psychologique aux parents selon France 3 (24/06). Article d'origine non relu. | aucune fiche Hyères | **découverte d'affaire** : décision éditoriale ; base mince |
| 13 | Mérignac, délibération 2026_174 et point municipal du 19/11 | 16 et 19/11/2026 | Autorisation de signer deux chartes (pas de preuve de signature) ; plan au conseil au premier semestre 2027 ; cellule envisagée, non en place. | absent du hub Bordeaux-Gironde | piste éditoriale distincte ; aucun rattachement à Frida-Kahlo ni Cenon |

Écarts du registre de Dot relevés à la source : la date « 21/06 » de l'article Var-matin est probablement le 22/06 ; `@victimes34` (Facebook) n'est pas confirmé par un lien officiel ; l'annuaire fédéral ne liste que des comptes nationaux ; `@adavemjp40` est attribué par une plaquette municipale.

## 7. Brouillons sociaux (aucune publication automatique)

Deux brouillons **utilisables maintenant** : la page SNY les contient déjà. Aucun ne mentionne un compte d'auteur, faute d'attribution vérifiée par un lien officiel. Pas de nom de personne mise en cause, pas de nombre d'enfants, présomption d'innocence.

**A — Mées (Landes)** · fiche : https://sousnosyeux.org/affaires/fr-2026-0116/ · source originale : Sud Ouest, 29/09/2026 (https://www.sudouest.fr/faits-divers/landes-enseignant-remplacant-soupconne-d-agression-sexuelle-sur-une-fillette-les-investigations-ont-etabli-un-fait-isole-30838015.php) · raison : montrer aux familles qui peut les orienter (association d'aide aux victimes) sans rien affirmer au-delà de la presse.
- **X** : « Mées (Landes) : une réunion publique s'est tenue le 23/09 avec des parents, la gendarmerie, l'association d'aide aux victimes Adavem et le procureur, selon le parquet cité par Sud Ouest (29/09). Le dossier et ses sources : https://sousnosyeux.org/affaires/fr-2026-0116/ »
- **Facebook** : « Mées (Landes) — Une réunion publique s'est tenue le 23 septembre à la mairie, à l'initiative de l'inspectrice d'académie, en présence de parents, de la gendarmerie, de l'association d'aide aux victimes Adavem et du procureur de la République, selon le parquet cité par Sud Ouest (29/09/2026). Notre fiche rassemble ce que la presse rapporte, avec ses sources, et distingue ce qui est établi de ce qui ne l'est pas. Présomption d'innocence. https://sousnosyeux.org/affaires/fr-2026-0116/ »
- **Instagram** (légende) : même texte que Facebook, lien dans la biographie.

**B — Soyaux (Charente)** · fiche : https://sousnosyeux.org/affaires/fr-2026-0137/ · source originale : ici, 14/10/2026 (https://www.ici.fr/nouvelle-aquitaine/charente-16/soyaux/un-instituteur-interpelle-a-soyaux-apres-des-accusations-d-agressions-sexuelles-sur-cinq-enfants-de-maternelle-5048456) · raison : l'aide proposée aux parents est une information utile ; elle est déjà sur la fiche.
- **X** : « Soyaux (Charente) : selon ici (14/10), l'association France Victimes 16 est mobilisée auprès des parents des victimes pour leur proposer soutien et accompagnement. Le dossier et ses sources : https://sousnosyeux.org/affaires/fr-2026-0137/ »
- **Facebook** : « Soyaux (Charente) — Selon ici (14/10/2026), l'association France Victimes 16 est mobilisée auprès des parents des victimes pour leur proposer soutien et accompagnement. Sud Ouest la situe aussi à la réunion d'information du 14 octobre. Notre fiche rassemble ce que la presse rapporte et distingue ce qui est établi de ce qui ne l'est pas. Présomption d'innocence. https://sousnosyeux.org/affaires/fr-2026-0137/ »
- **Instagram** : idem Facebook, lien dans la biographie.

**C — Paris 11e : DIFFÉRÉ** (le hub public ne contient pas encore la saisine du Défenseur des droits ; un post renverrait vers une page qui ne dit pas ce qu'il dit). À publier **après approbation du complément de hub** (§6, ligne 1) : « Dans le 11ᵉ arrondissement, des parents d'élèves de plusieurs écoles déclarent avoir saisi le Défenseur des droits le 22/12/2025 et demandent une enquête indépendante et un audit du périscolaire parisien (billet du 28/01/2026). Aucune réponse du Défenseur n'est rapportée à ce jour. https://sousnosyeux.org/territoires/paris-11e/ » — mention du compte de l'auteur : non (blog personnel sans compte vérifié) ; ne suggère aucun partenariat.

**Toulouse : pas de brouillon.** Aucune page SNY ne couvre Toulouse (la fiche Bénézet n'est pas publiée) ; renvoyer vers une fiche étrangère serait trompeur. Destination honnête : décider la publication de FR-2026-0048, puis un hub Toulouse.

## 8. Essais observés (workflow manuel `sny-pilote-instagram`, `--dry-run`, empreinte de la base avant/après : **aucune écriture, aucun Telegram**)

Dernier essai (26/11/2026, six comptes, 18 appels sur 18) :
- 450 publications lues, 24 témoignages anonymes écartés, 6 comptes sur 6 lus, 0 en panne ; historique non couvert sur les 6 (budget).
- Destinations des publications Instagram : 20 pistes, 24 écartées (témoignages), le reste en position générale, hors périmètre ou rattachements suspendus.
- Sources web des acteurs : 1 piste de hub (billet des parents du 11ᵉ → hub `paris-11e`, aucune affaire), 2 rattachements suspendus (mise à jour de la pétition de Toulouse : fiche Bénézet non publiée ; page de la Ville de Tarnos : une fiche), 1 position générale (Mérignac) ; aucune de ces pages n'était en panne.
- Pannes visibles préexistantes : fcpe75.org (404), metooecole.org (403 anti-robot), sosperiscolaire.fr (page vide), adavem40.fr (domaine introuvable), pav75.fr (erreur TLS).

Défauts trouvés PAR cet essai et corrigés avant fusion : le billet de Bullourde restait « rattachement suspendu » parce que (1) la base de production contient bien plus de fiches que le site et (2) la porte « piste » n'était pas transmise aux pages « document » du registre.

## 9. Sécurité (note de livraison)

Objet : lecture de publications publiques de comptes suivis, classement, notification interne. Installation : aucune (workflows existants). Démarrage : le cycle quotidien existant ; **aucun cron nouveau**. Réseau : graph.facebook.com (lecture Business Discovery), sites publics des sources. Privilèges : jeton Meta stocké en secret de dépôt, injecté seulement dans l'étape de maintenance. Données : textes de publications publiques conservés en extrait court, vidés après notification ; témoignages anonymes écartés sans conservation. Journaux de CI (dépôt public) : compteurs, dates, destinations ; ni texte, ni adresse de publication, ni jeton.
