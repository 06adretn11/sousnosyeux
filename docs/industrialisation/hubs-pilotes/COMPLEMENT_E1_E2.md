# Complément au dossier Hubs pilotes — E1 (PARIS-009) et E2 (Tarnos) — 29/10/2026

*Complément documentaire à [HUBS_PILOTES_1.md](../HUBS_PILOTES_1.md) (lot A/B/C/D clos, `main` 744e57b). **Version de référence examinée : `main` = 744e57b** (aucun commit depuis) ; cartes lues dans `data/cases.json`, matières `paris-11e` `165d248c53255f5d` et `landes` `7d109f47a5f5830c`, fiche FR-2026-0115 approuvée `4af66277ad3e802e`.
Rien n'est appliqué par ce document : aucune carte, fiche ou donnée publique n'a été modifiée. Le GO A/B/C/D ne vaut pas GO pour E1/E2.*

**Déjà décidé ou corrigé depuis le compte rendu ?** Non. Aucun commit sur `main` depuis 744e57b ; aucune décision sur PARIS-009 ni sur la date de Tarnos dans le dépôt (docs, manifestes, `publication-holds.json`). Les décisions Neon ne sont pas lisibles depuis cette session : une décision prise par clic Telegram depuis le 29/10 n'apparaîtrait pas ici.

| Ligne | Statut final |
|---|---|
| **E1 — PARIS-009** | **Arbitrage éditorial nécessaire** (2 options, recommandation : option A) |
| **E2-a — Tarnos : dates et divergences de sources** | **Correction prête pour validation** dans le circuit existant (nouvelle version de la fiche FR-2026-0115) |
| **E2-b — Tarnos : « municipal »** | **Aucune correction justifiée** (point à clore) |
| E3 — Bullourde / Belzunce | Renvoi à B1 (ouvert) |
| D — proposition Telegram | **Aucun cas pertinent trouvé** dans les traces consultées |

Les lignes sont indépendantes : E2-a se valide sans E1.

---

## E1 — PARIS-009, école maternelle Faidherbe (Paris 11e)

### 1. Constat
La carte affiche **« enquête »** (`statut_judiciaire`) et **« mixte »** (`type_affaire`). L'unique source de la carte ne documente ni procédure judiciaire ni violence sexuelle pour la personne concernée.

### 2. Preuve (sources **lues en entier** ; aucune autre source repérée sur cette animatrice)
- **Le Parisien, 20/11/2025** (source unique de la carte, accès libre) :
  - *Nature des faits rapportés* : le mercredi 19/11, lors d'une réunion avec les parents, une **animatrice** est annoncée suspendue (« deuxième personne » après un animateur suspendu la semaine précédente). La Ville précise qu'il ne s'agit **pas de faits à caractère sexuel** mais de « violences éducatives ordinaires » (humiliations, violences verbales, tapes, fessées). Les faits reprochés précisément ne sont pas connus.
  - *État judiciaire documenté* : **aucun**. Seule occurrence d'« enquête » : un parent rapporte qu'on ne lui a rien dit « en raison de l'enquête », sans dire administrative ou pénale. La mention des « enquêtes administratives et pénales » décrit le protocole de la Ville, pas ce dossier. Aucune plainte, aucun parquet, aucune enquête pénale n'est mentionné pour cette animatrice.
  - *Lien avec l'autre affaire de l'école* : l'article cite aussi un **animateur** suspendu la semaine précédente après un signalement pour agression sexuelle. 20 Minutes (08/12/2025, qui cite Le Parisien) et Linfo.re (09/12/2025, qui reprend 20 Minutes), lus, rapportent une plainte pour agression sexuelle contre **un animateur** de l'école (FR-2026-0023, enquête préliminaire selon une source policière) et résument les deux suspensions de novembre : « deux animateurs », l'un pour agression sexuelle. **Aucun des trois articles ne dit si la plainte de décembre vise l'animateur suspendu en novembre.** Les deux cartes ne décrivent donc pas les mêmes faits (animatrice / violences éducatives ; animateur / agression sexuelle), mais le lien entre les personnes n'est pas établi.
- Recherche du 29/10/2026 (Bing Actualités, 3 requêtes) : aucun article postérieur sur cette animatrice.
- *Absence de preuve ≠ absence d'enquête* : on ne peut affirmer ni qu'une enquête existe, ni qu'elle n'existe pas ; on peut seulement dire que les sources lues n'en établissent aucune.

### 3. Périmètre éditorial (doctrine existante)
- `brief_projet.md` §1 : « violences sexuelles **ou faits assimilés** » ; page publique `/methodologie` §1 : « affaires de violences (**en particulier** sexuelles) » ; `schema.sql` : `type_affaire` n'a que des valeurs sexuelles (+ « mixte », « à qualifier ») et les 66 cartes publiques en relèvent toutes.
- Des violences éducatives ordinaires non sexuelles ne sont donc ni clairement incluses ni clairement exclues : **ambiguïté réelle** (« faits assimilés », « en particulier »).
- Indépendamment du périmètre, **le libellé « enquête » n'est pas étayé**. « Plainte » ne l'est pas davantage. « À qualifier » existe mais la règle R5 le bloque sans fiche approuvée (précédent Chat Perché, 24/10) et le circuit ne génère pas de fiche pour un dossier déjà dans un Hub (REVUE_GLOBALE_STOCK_2 §D).

### 4. Valeurs actuelles (main 744e57b)
Carte : `statut_judiciaire` = « enquête » · `type_affaire` = « mixte » · `role_mis_en_cause` = « animateur périscolaire » · source Le Parisien 20/11/2025. Hub Paris 11e : dossier `PARIS-009` (état écrit « enquête », avec réserve explicite sur l'état), compté parmi « Neuf affaires », « Enquête (3) », et avec FR-2026-0023 sous la note « Deux fiches existent pour cet établissement ». Alerte R9 « doublon probable » FR-2026-0023 / PARIS-009 (HUMAN_REVIEW, [DECISION_PACK](../DECISION_PACK.md)) toujours ouverte.

### 5. Options (choix à arbitrer)
**Option A — retirer PARIS-009 de la carte et du Hub (recommandée).**
- *Pourquoi* : le seul état judiciaire disponible (« enquête ») n'est pas étayé, l'unique valeur honnête (« à qualifier ») est inaccessible sans fiche, et les faits rapportés sont non sexuels (périmètre ambigu, au mieux « faits assimilés »). Réversible : l'affaire reviendrait si une source documente une procédure. La suspension n'est pas cachée : le Hub la signale en « Limites ».
- *Surfaces* : (1) carte : `data/cases.json` via le circuit de retrait (revue « retirer ») ; (2) Hub Paris 11e, **à livrer avant ou avec** le retrait (sinon `casesParIds` échoue au build : production intacte mais bloquée) :
  - `reperes.titre` : « **Neuf** affaires indépendantes dans le 11e, et une réponse publique… » → « **Huit** affaires indépendantes dans le 11e, et une réponse publique… » ;
  - `reperes.chapeau` : « la presse rapporte **neuf** affaires distinctes dans des écoles et une crèche du 11e » → « **huit** affaires distinctes… » ;
  - description de page (`web/src/pages/territoires/[hub].astro`) : « **Neuf** affaires rapportées… » → « **Huit** affaires rapportées… » ;
  - retirer `PARIS-009` de `ordre` et `dossiers` (tableau « Enquête (3) » → « (2) », filtre, note « Deux fiches existent… » disparaît seule) ;
  - ajouter à `inconnues_transversales` : « Une suspension d'animatrice pour « violences éducatives ordinaires » à l'école maternelle Faidherbe (Le Parisien, 20 novembre 2025) n'est pas reprise : aucun fait de violence sexuelle ni procédure judiciaire n'y est rapporté dans les sources lues. » ;
  - la mention « Faidherbe : article du Parisien… désormais lu » de `recherches` reste exacte ;
  (3) l'alerte R9 FR-2026-0023 / PARIS-009 se ferme d'elle-même ; FR-2026-0023 est inchangée.
- *Effet* : 65 cartes publiques ; Hub à 8 affaires ; nouvelle empreinte de matière Paris 11e (GO distinct).

**Option B — conserver la carte telle quelle (statu quo).** Le Hub continue de dire que l'état « enquête » reste à établir (réserve déjà publiée). *Conséquence* : la carte et la fiche de la carte affichent un état judiciaire que les sources ne soutiennent pas. Atténuation minimale possible : `type_affaire` « mixte » → « à qualifier » (valeur existante, non bloquée par R5) ; elle ne corrige pas « enquête ».

**Ma recommandation : A.** Si vous préférez inclure les violences non sexuelles, le point à trancher est le périmètre (une phrase à écrire dans `/methodologie`), pas la carte seule.

**Statut E1 : arbitrage éditorial nécessaire (A ou B).**

---

## E2 — Tarnos, centre de loisirs (FR-2026-0115, fiche approuvée `4af66277ad3e802e`)

### E2-a. Date de la mise en examen et divergences de sources — **correction prête pour validation**

**Constat.** Dans le déroulé de la fiche, l'étape « mise en examen » est **sans date** (« la source ne date pas l'événement ») et placée **après** la remise en liberté d'août. Or la date est établie par deux sources lues.

**Preuve (lue en entier).**
- Sud Ouest, 09/09/2026 : date la mise en examen et le placement en détention provisoire au **8 juillet**, après quarante-huit heures de garde à vue (garde à vue du lundi 6/07 selon Sud Ouest du 06/07 : cohérent).
- La Provence / AFP, 09/07/2026 : mise en examen et écrou annoncés « jeudi » (9/07) par le parquet de Dax ; placement en détention provisoire « à l'issue de sa garde à vue mercredi » (8/07).
- Distinction des dates : **événement = 8/07/2026** ; annonce publique = 9/07 ; La Dépêche (04/09) n'est que la source du texte actuel.
- **Divergences non tranchables** (à dire, sans choisir) : (i) *chefs retenus* : trois viols et trois agressions sexuelles (communiqué du parquet, via AFP, 9/07) vs quatre viols et trois agressions sexuelles (La Dépêche, 4/09) — l'écart peut venir d'une évolution de la procédure ; (ii) *remise en liberté* : « près de quinze jours plus tard » (Sud Ouest 9/09, soit fin juillet) vs « en août », « un mois plus tard » (La Dépêche 4/09).
- Point mineur : la source La Provence de l'étape « communiqué du parquet » porte `publie_le` 2026-07-08 ; la page lue est datée du jeudi 9 juillet (« ce jeudi 9 juillet »).

**Avant / après exact** (dossier `FR-2026-0115`, `data/hub-matiere/landes.json`, une seule nouvelle version) :
1. Étape `mise_en_examen` (« Selon La Dépêche, l'animateur du centre de loisirs de Tarnos a été mis en examen pour quatre viols et trois agressions sexuelles… »), actuellement `date: null`, `date_nature: "article"`, en 10ᵉ position (après `decision` 2026-08) → **`date: "2026-07-08"`, `date_nature: "evenement"`, texte et source principale inchangés**, ajout aux `sources_complementaires` de Sud Ouest 2026-09-09 (`https://www.sudouest.fr/justice/violences-sexuelles-dans-un-centre-de-loisirs-de-tarnos-la-justice-n-avance-pas-et-rien-ne-justifie-la-sortie-de-detention-provisoire-du-suspect-deplore-l-un-des-avocats-des-victimes-30545985.php`), et **déplacement juste après la garde à vue du 6/07** (le déroulé n'est pas trié à l'affichage).
2. `inconnues` : ajouter « Le nombre de chefs de mise en examen diffère selon les sources lues : trois viols et trois agressions sexuelles dans le communiqué du parquet de Dax (La Provence, avec l'AFP, 9 juillet) ; quatre viols et trois agressions sexuelles selon La Dépêche (4 septembre). Les sources lues ne disent pas si l'écart tient à une évolution de la procédure. »
3. `inconnues` : ajouter « Date de la remise en liberté : « près de quinze jours » après le 8 juillet selon Sud Ouest (9 septembre), « en août » selon La Dépêche (4 septembre). Les sources lues ne permettent pas de trancher. »
4. Étape `communication_parquet` : `source.publie_le` 2026-07-08 → 2026-07-09.

**Portée.** `/affaires/fr-2026-0115/` et le dossier de Tarnos dans `/territoires/landes/` (l'aperçu du Hub retient `mise_en_examen`). La carte (statut « mise en examen ») ne change pas. Le dossier étant approuvé par empreinte, la modification **dépublie la fiche tant que la nouvelle version n'est pas approuvée** (échec fermé) : à passer par le circuit de remplacement de fiche (v2, comme FR-2026-0011 v2, #57/#59), en un seul GO. Le repère du Hub Landes (« en juillet… en août selon La Dépêche ») est déjà cohérent.

**Recommandation.** Valider en une version unique (4 modifications ci-dessus).

### E2-b. « Centre de loisirs **municipal** » — **aucune correction justifiée**
- Le **parquet de Dax**, dans son communiqué relayé par l'AFP (9/07), parle d'enfants inscrits « au centre de loisirs municipal » ; Sud Ouest (06/07, 09/07) le nomme de même ; la fiche l'attribue à Sud Ouest et au parquet.
- ICI (08/10) précise que le centre n'est pas un service municipal : il est géré par une **association en délégation de service public**, la Ville gardant un cahier des charges et un comité de suivi ; Sud Ouest (07/10) évoque un avenant au contrat de DSP.
- Les deux énoncés coexistent (centre de la commune, exploité par un délégataire) : aucune contradiction prouvée. Le nom de la carte reprend le terme du parquet ; le Hub dit déjà la gestion associative (« Ce que nous avons cherché »).
- **Statut : à clore sans modification.**

---

## E3 — Bullourde / Belzunce
Rattaché à l'arbitrage **B1** de [REVUE_GLOBALE_STOCK_2.md](../REVUE_GLOBALE_STOCK_2.md) (FR-2026-0024 Belzunce, « carte conservée telle quelle », confirmation ou source du classement à arbitrer) ; hors manifeste `ids-go-lot-stock-27-10.json`. **Statut : ouvert**, aucune décision enregistrée dans le dépôt depuis le 27/10. Non réinstruit ; aucune seconde demande.

## D — proposition Telegram plus précise
**Aucun cas pertinent trouvé dans les traces consultées.** Périmètre : les 6 exécutions GitHub Actions du 29/10 depuis 10:00 UTC. Après le déploiement (13:17 UTC), seul `sny-maj-fiches` (13:45) a tourné : il traite les mises à jour de fiches (0 retenue) et n'émet pas de proposition d'enrichissement de Hub. Les passages `sny-cycle` (11:43, 13:11), `sny-discovery` (11:29, 11:43) et `sny-clics` (11:42) précèdent le déploiement et ont utilisé l'ancien code. Les journaux CI ne portent de toute façon pas le texte des messages. **À observer** : la première proposition d'enrichissement émise par un passage postérieur ; sa vérification sera : Hub, bloc, adresse, et avertissement de doublon le cas échéant. Aucun envoi ni déclenchement de test.

## E4, E5, Mées
Limites inchangées (doublons possibles Hub rédigé / information validée ; accès `.env.local` et `*.workers.dev`). Mées : prochain cas d'observation, sans condition pour cette clôture.

## Vérification
Chaque proposition répond à un défaut établi par les articles lus ; aucune date, statut, affaire ou gestionnaire n'a été tranché par supposition (les deux divergences de Tarnos sont dites, non résolues) ; cartes, fiches, empreintes, manifestes et matières publiques inchangés.

---

## Suite du 29/10/2026 — GO d'Adrien et exécution

**GO E1 (29/10/2026)** : retrait public de **PARIS-009 seul**, selon l'option A ci-dessus ; motif consigné : « Le statut judiciaire actuellement affiché n'est pas suffisamment étayé par les sources consultées. » Ce retrait n'est pas une décision générale d'exclusion des violences non sexuelles. Aucun nouveau statut, aucune modification de R5. FR-2026-0023 et les autres affaires de l'école ne sont pas touchées.

**Exécution** (état de départ : PARIS-009 `publiée`, aucune revue, 1 source ; `main` = 6d7a6e4 ; proposition restée applicable) :
1. **Neon** (niveau qui commande la publication) : `cases.publication_status` `publiée` → `retirée` et revue `retirer` (« [Retrait 2026-10-29] GO d'Adrien… »), même convention que les retraits existants (FR-2026-0138, FR-2026-0134). Écriture idempotente, une seule exécution. L'affaire, sa source (Le Parisien, 20/11/2025) et l'historique restent en base ; les projections (`project-public`, `reconcilier-publication`) ne retiennent que `publiée`, et la réconciliation exige un GO de publication : la carte ne revient pas seule.
2. **Dépôt** (une seule PR) : bloc `PARIS-009` retiré du Hub Paris 11e (titre et chapeau « huit », description de page, ligne « Limites », date de recherche) **et** entrée retirée de `data/cases.json` (65 affaires) : Hub et carte dans le même commit, la dépendance est respectée.
3. Cohérence vérifiée avant fusion : affaires `publiée` ≥ 8 en base (67) = artefact (65) + FR-2026-0048 et FR-2026-0049 (déjà sous HOLD, non publiques) ; aucune affaire de l'artefact absente de la base. QA complète : QA_PASSED ; build : OK, 0 occurrence de PARIS-009 dans l'accueil et le Hub.

Le résultat servi en production est consigné ci-dessous après vérification.

**Vérification en production (29/10/2026) — E1 clos.** PR #71, `main` = 3bb80a9, build Cloudflare déployé ; pages lues sur https://sousnosyeux.org :
- `/territoires/paris-11e/` : titre « Huit affaires indépendantes… », chapeau « huit affaires distinctes », aucun bloc `PARIS-009`, tableau sans la ligne, note « Deux fiches existent » disparue, note de limites sur la suspension d'animatrice présente, FR-2026-0023 conservée ; `/` : aucune occurrence de PARIS-009 (65 cartes) ; `/territoires/` : 200.
- Neon : PARIS-009 `retirée`, 1 source et 1 revue `retirer` conservées ; affaires `publiée` ≥ 8 (67) = artefact (65) + FR-2026-0048/0049 sous HOLD ; FR-2026-0023 toujours `publiée`.
- Inchangés : matières Landes `7d109f47a5f5830c`, Bordeaux `b8ade36dbcdab19a`, Hautes-Alpes `797c632b421d3947` ; 32 fiches approuvées (empreinte courante = approuvée) ; `ids-go-lot-stock-27-10.json`, REVUE_GLOBALE_STOCK_2, `publication-holds.json`, `evenements.json` ; pages `/affaires/poc-09/`, `/affaires/fr-2026-0115/`, Landes, Hautes-Alpes, Bordeaux en 200. Matière Paris 11e : `165d248c53255f5d` → `fc6fec65e0a310fc` (retrait seul).
- E2-b clos sans modification ; E2-a (nouvelle version de la fiche FR-2026-0115) en attente de validation ; E3 rattaché à B1 ; D : première proposition pertinente après déploiement non observée dans les traces consultées.

---

## E2-a — GO d'Adrien du 29/10/2026 et exécution (fiche FR-2026-0115, nouvelle version)

**GO** : les quatre modifications E2-a, avec A (étape du 8 juillet : « des viols et des agressions sexuelles », décomptes chiffrés conservés dans la divergence, sans présenter une évolution de la procédure comme établie), B (remise en liberté : plus de date structurée « 2026-08 », date non établie, événement conservé après la mise en examen, deux datations attribuées et réserve) et C (« Les sources lues ne rapportent pas de jugement sur le fond. L’issue de la procédure reste à documenter. »). Aucune autre réécriture. La carte Tarnos est inchangée.

**Version de départ vérifiée** : dossier `FR-2026-0115` d'empreinte `4af66277ad3e802e` sur `main` 1d8ace0 (approuvé par clic Telegram le 24/10, proposition `af7a64e7`) ; aucune modification concurrente ; passages conformes à ceux examinés. Corroboration : la validation du Decision Pack du 06/10 consignait déjà « mis en examen le 08/07 ».

**Exécution** :
1. Neon : revue `[Fiche approuvée b3ecb4bf] FR-2026-0115 hash=b3ecb4bf8853df89` (reviewed_by « Adrien (GO E2-a 29/10/2026) »), **écrite avant la fusion**. L'approbation `4af66277…` n'est pas révoquée (historique conservé) : la fiche n'a jamais été dépubliée.
2. Dépôt : `data/hub-matiere/landes.json` (dossier FR-2026-0115 seul) + `data/evenements.json` (`fiches_approuvees.FR-2026-0115.hash` → `b3ecb4bf8853df89`, comme #59 pour FR-2026-0011 v2). QA : QA_PASSED ; build OK ; les 31 autres fiches approuvées inchangées.
3. Empreintes : dossier Tarnos `4af66277ad3e802e` → **`b3ecb4bf8853df89`** ; matière Landes `7d109f47a5f5830c` → **`ba7d03c505c233f8`**.

**Contenu appliqué** (étapes du déroulé, dans l'ordre) : garde à vue 06/07 → **mise en examen, 8 juillet 2026** (La Dépêche ; Sud Ouest 09/09, La Provence/AFP, La Montagne/AFP, Sud Ouest 09/07, ici en sources complémentaires) → … → remise en liberté (date non établie, texte « en août » attribué à La Dépêche inchangé) ; `inconnues` : phrase C, divergence des décomptes, divergence de la date de remise en liberté ; La Provence/AFP publiée le 09/07/2026 (2 occurrences).

**Points laissés tels quels (hors GO, à votre appréciation)** : (1) « quatre viols et trois agressions sexuelles », attribué à La Dépêche, figure encore dans `etat_actuel`, `faits`, `synthese` et `situation` (4 occurrences) ; seule l'étape du 8 juillet est modifiée, la divergence est dite dans « Ce que l'on ne sait pas » ; (2) la rubrique « Suite » garde le titre « Aucune décision rendue » ; (3) pour une date non établie, le composant ajoute « la source ne date pas l'événement ; elle paraît le … », ce qui est inexact pour l'étape « en août » (La Dépêche dit « en août »).
