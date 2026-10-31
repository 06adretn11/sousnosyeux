# Revue globale du stock — dossier unique de décision (31/10/2026)

*État recalculé le 31/10/2026 à partir de `main` et de Neon : **65 cartes publiques** (PARIS-009 reste retirée ; les versions approuvées de Tarnos `ec1f26661dfc9608`, Landes `a728e1a8dc22eb65`, Paris 11e `fc6fec65e0a310fc` et des 32 fiches approuvées sont inchangées ; les HOLD et les historiques de décisions aussi). Rien de ce qui suit n'est publié, approuvé ni fusionné tant que vous n'avez pas donné le GO de la section 0. La PR 78 (revue du 30/10) est intégrée : ses lignes sont reprises ici avec leurs empreintes finales.*

Manifeste exécutable : [`ids-go-lot-stock-27-10.json`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/ids-go-lot-stock-27-10.json) — script [`go-lot-24-10.mjs`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/go-lot-24-10.mjs) `--liste=ids-go-lot-stock-27-10.json --ecrire`. Consolidations et réaffectations de sources : [`consolidations-30-10.mjs`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/consolidations-30-10.mjs) `--ecrire --go=JJ/MM/AAAA`. Signal Orange : [`orange-signal-31-10.mjs`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/orange-signal-31-10.mjs).

**Règle de lecture.** Le GO couvre exactement les empreintes et changements listés : toute version modifiée ensuite sort du GO. Une exception retire sa ligne ; rien d'autre ne change. Les aperçus cités sont sur `main` (liens GitHub, empreinte écrite en tête de chaque aperçu).

## 0. Ce que vous décidez — un seul GO collectif, avec exceptions possibles

| # | Décision | Contenu exact | Recommandation |
|---|---|---|---|
| **1** | **Lot de fiches** (section B) | **11 créations** de page individuelle + **2 mises à jour** (13 lignes du manifeste), avec les rattachements de sources listés et 3 dates de parution rectifiées | Approuver |
| **2** | **Consolidations** (section C) | 3 doublons établis : PARIS-001 → FR-2026-0005, PARIS-008 → FR-2026-0008, PARIS-010 → FR-2026-0003 ; réaffectation de 2 sources vers FR-2026-0005 | Approuver |
| **3** | **FR-2026-0024** (section D) | Carte « relaxe / non-lieu / classement » (le classement n'est dit qu'au conditionnel) → « enquête » | Approuver « enquête » (alternative : conserver) |
| **4** | **Orange** (section E) | Créer la proposition Discovery déjà qualifiée (la publication restera un clic de votre part) | Approuver |

Le GO couvre **les 13 lignes du manifeste final, la consolidation et les options 3 et 4, sauf exceptions que vous nommez**. Il **n'inclut pas** les décisions Telegram distinctes (messages 370, 371, 372 : section A).

## A. Autorisations déjà acquises, exécutées pendant cette session

| Décision d'origine | Action exacte | Résultat vérifié |
|---|---|---|
| Telegram 370 — **FR-2026-0003** « enquête → condamnation non définitive » : VALIDATE le 30/10 (21:01 UTC) | Carte projetée sur le site | Publiée (PR 80, `74f6fa0`). La projection groupée du workflow l'avait **perdue** (seule FR-2026-0047 figurait dans le commit `33f9fba`) : cause corrigée dans `publier-evolutions.mjs`, vérifiée |
| Telegram 371 — **FR-2026-0047** « procès → condamnation non définitive » : VALIDATE le 30/10 (21:02 UTC) | Appliquée par le workflow (07:25 UTC le 31/10), publiée | Publiée (`33f9fba`) |
| Telegram 372 — FR-2026-0013 : **information sans bouton** | Aucune décision applicable ; aucun message renvoyé | Carte « plainte » inchangée |
| Proposition `275d28c3`, **FR-2026-0005** « enquête → mise en examen » + 3 écoles (Saint-Dominique, Rapp, La Rochefoucauld) : VALIDATE le 25/09/2026 | Carte projetée (jamais faite : `publier-evolutions` ne reprend que les clics Telegram) | Publiée (PR 80). L'autorisation couvre exactement l'état et les trois établissements ; elle ne dépend d'aucune consolidation |
| Rattachements de sources des approbations des 13, 24 et 27/10 (revues `[Fiche-sources:…]`, « Adrien (Telegram, fiche) ») | Projetés sur 9 cartes : FR-2026-0011, 0028, 0042, 0114, 0115, 0117, 0119, 0133, POC-09 (aucun état modifié) | Publiés (PR 80) |

**Vérification du contenu servi** : `verifier-site.mjs` sur ces 12 cartes → « conforme » au premier essai (état judiciaire et nombre de sources lus dans la page publique) ; confirmation Telegram « acceptée par l'API ». Défaut trouvé au passage : le vérificateur compare le site à l'artefact **commité**, pas à Neon ; il avait annoncé « conforme » le 31/10 à 07:26 alors que la carte de 0003 manquait. Corrigé à la source (projection) ; consigné dans la roadmap.

**Défaut de mes propositions du 30/10 (corrigé)** : les deux propositions 370/371 portaient `event_type = condamnation` au lieu de `décision` : non applicables automatiquement. J'ai corrigé ce libellé technique dans leurs faits (preuve et décision inchangées) ; elles se sont alors appliquées par le circuit normal.

## B. Lot de fiches proposé au GO (11 créations · 2 mises à jour)

*« Différence avec le public actuel » : pour une création, aucune page individuelle n'existe aujourd'hui (« Fiche → » absent) ; l'état de carte ne change pas.*

### B1. Créations (page `/affaires/<id>/`)

| Fiche | Affaire · carte | Sources utilisées · limites | Rattachements ajoutés à la carte | Aperçu | Empreinte |
|---|---|---|---|---|---|
| **FR-2026-0001** | École Aqueduc, Paris 10e (animateur) · « condamnation non définitive » | AFP (Figaro 20/03, franceinfo 09/07) pour ce qu'ils établissent ; CNEWS (verdict du 10/07 : 18 mois avec sursis) ; le **Courrier des Stratèges reste seul** pour la convocation par procès-verbal et les interdictions, attribué comme tel. Libération 06/11/2025 non lue (403), Figaro 07/11/2025 = procédure de l'**enseignant** (FR-2026-0002) : non utilisés. Date des faits non établie ; appel inconnu | 4 : CNEWS (26/06), CNEWS (10/07), franceinfo (09/07), Le Figaro (20/03) · **date du Courrier rectifiée : 01/03 → 25/03/2026** | [FR-2026-0001](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0001.md) | `850d7ef7f2b55ec4` |
| **FR-2026-0003** | École Grands Champs, Paris 20e · « condamnation non définitive » (carte déjà corrigée, A) | Le Monde et Le Parisien du 16/10/2026 (peine : 3 ans de prison avec sursis probatoire, obligations et interdiction de 10 ans), CNEWS 20/03. **Dossier réduit à l'essentiel** : le générateur l'avait bloqué (nom de la présidente du tribunal listé à tort comme « mis en cause » : prouvé en rejouant la garde) ; citation graphique d'un enfant, témoignage de parent, propos de la présidente et doublons retirés ; appel : seul le délai de dix jours est rapporté (le générateur avait écrit « appel annoncé » à tort : corrigé). Qualification **A_REVOIR** (relu à la main, jamais READY) | 1 : Le Monde (16/10) | [FR-2026-0003](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0003.md) | `c0c1ba9a71d1a958` |
| **FR-2026-0005** | École maternelle Saint-Dominique, Paris 7e · « mise en examen » (carte déjà corrigée, A) | **Dossier unique de la paire PARIS-001/0005** : CNEWS, Le Parisien (20/05 : 16 gardes à vue), JDD, franceinfo (22/05, parquet : deux mises en examen), READY. **Quatre lignes issues du seul éditorial du Canard enchaîné retirées** (fonction identifiante, ton d'opinion, accusation sans attribution). Commons Média et MSN inaccessibles | 3 : JDD (20/05), Le Parisien (20/05), franceinfo (22/05). Le Parisien et MSN sont aussi **réaffectés** par la consolidation (C) | [FR-2026-0005](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0005.md) | `d912f887365f3798` |
| **FR-2026-0021** | Établissement non nommé, Les Mureaux · « mise en examen » | **Recherche ciblée terminée** : Le Parisien (14/02/2025, lead libre) est la source d'origine ; la Gazette le relaie (« d'après Le Parisien ») : **pas une confirmation indépendante**. Google Actualités liste cinq autres médias le 13/02/2025 (Actu.fr, Dauphiné Libéré, 20 Minutes, Sud Ouest, BFM) avec des titres concordants, mais leurs liens sont opaques et illisibles ici : aucun n'est cité ; ils situent la mise en examen au jeudi 13/02, **pas au 11/02** de la Gazette. Aucune source institutionnelle trouvée (une dizaine de requêtes : web, Google Actualités, Bing). La date reste écrite comme divergente et attribuée. 3 étapes, suite inconnue | aucun | [FR-2026-0021](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0021.md) | `ce6e55035bf36fc4` |
| **FR-2026-0022** | Institution Saint-Dominique, Neuilly-sur-Seine · « enquête » | France 3 (04/2025), 20 Minutes. Dossier **inchangé**. Le Parisien du 20/05/2026 = école de Paris 7e (autre affaire) : sa ligne `sources` publique est réaffectée à FR-2026-0005 (C) ; Libération 23/09/2025 non lue, hors sujet. Aucune suite documentée | 1 : 20 Minutes (18/04/2025) | [FR-2026-0022](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0022.md) | `d3ec303bfecf8a27` |
| **FR-2026-0029** | Collège Saint-Charles, Chauny · « condamnation non définitive » (décision `799854cc` conservée) | **Dossier sobre préparé.** Le refus du générateur était un **défaut de lexique, pas une impossibilité éditoriale** : le corps de France 3 dit « Il vient d'écoper de 24 mois de prison… » (le mot « condamné » n'est que dans le titre). Garde corrigée pour cet idiome seul, au passé/indicatif et avec une peine dans la phrase (« risque / pourrait écoper » : toujours refusé ; le titre seul : toujours refusé) ; 85 contrôles passent. Relecture : « faits le 5 janvier » retiré (c'est la date de la garde à vue), propos-fragment du procureur retiré, trois lignes dépendant uniquement de la page d'accueil locale « ici » retirées | 3 : France 3 Régions (03/03), La Montagne (07/01), Midi Libre (08/01) | [FR-2026-0029](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0029.md) | `cbce5fe63e342711` |
| **FR-2026-0033** | Collège de Quartier-Français, Sainte-Suzanne · « mise en examen » | Linfo.re, Zinfos974. **Clicanoo (07/04) tranché** : le texte entier nomme « un collège de Sainte-Suzanne » et jamais l'établissement ; la commune compte **deux collèges** (annuaire de l'éducation) ; ni mise en examen ni nom de collège. Mêmes circonstances que les sources de 0033 (suspension, article 40, enquête du parquet confiée à la gendarmerie, élève mineure alertée par ses camarades) : concordance forte mais **identité inférée, non lue** → ni rattaché ni rejeté, non utilisé. **Défaut trouvé** : les dates de parution (01/04) étaient fausses (pages : Zinfos974 13/04, Linfo.re 14/04) et la **mise en examen du lundi 13 avril** n'était pas datée : corrigés | 0 · **dates rectifiées** : Linfo.re 14/04, Zinfos974 13/04/2026 | [FR-2026-0033](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0033.md) | `3df31ef5be6362b1` |
| **FR-2026-0044** | Établissement professionnel non nommé, Charentay · « condamnation non définitive » | Le Progrès (accusation, « plusieurs mois ») et LyonMag (année des faits, seul passage lisible disant « jugé et condamné »). Les 4 articles du 13-14/10 (CNEWS, Dauphiné, Charente Libre, Parisien) = **Soyaux** (0137) et L'Alsace = Orange : reclassés. Limite : LyonMag donne la peine (5 ans dont la moitié avec sursis), non reprise ; appel inconnu | 0 | [FR-2026-0044](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0044.md) | `c6c544e7ae14ca26` |
| **FR-2026-0122** | École maternelle privée Saint-Laurent, Paris 10e · « mise en examen » | Mise en examen et écrou du 24/09/2026 ; garde à vue du 22/09 : Le Parisien (information d'origine) et Le Télégramme ajoutés ; La Montagne = reprise, non citée. **Le Monde du 04/04 = Saint-Dominique 7e, jamais utilisé pour Saint-Laurent** | 3 : Dauphiné Libéré (24/09), JDD (22/09), L'Indépendant (25/09) | [FR-2026-0122](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0122.md) | `a79e82a521edf9dd` |
| **FR-2026-0137** | École maternelle Julie-Victoire Daubié, Soyaux · « mise en examen » | 12 articles lus. Citation « C'est un séisme ! » : attribution à la directrice **établie** par Sud Ouest ; la réserve de l'article (« en tant que femme, maman et citoyenne », parole qui « n'engageait pas l'école ») est ajoutée à la citation. CNEWS, Dauphiné, Parisien du 14/10 = reprises du parquet (Soyaux vérifié), non citées | 7 sources de presse | [FR-2026-0137](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0137.md) | `2a586cb2adcb9fb0` |
| **POC-03** | École élémentaire Jules-Vallès, Plaisir · « condamnation non définitive » | **Préparée** (bloquée le 20/10 : le verdict n'était porté que par Le Monde, identité ambiguë). Sources lisibles trouvées : France 3 (05/12/2024), Europe 1, Temps Réel 78, Gazette (05/02/2025 : remise en liberté, appel formé). Peine rédigée une fois : **36 mois dont la moitié avec incarcération immédiate** (la « divergence » avec « un an et demi ferme » n'en était pas une). Qualification A_REVOIR (appel formé non daté) | 3 : Europe 1, Temps Réel 78, Gazette | [POC-03](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-03.md) | `9d13e7414edcd94c` |

**Recommandations** : approuver les onze ; **0021 en version sobre** (alternative : REVIEW) ; **0137** : si vous préférez ne pas publier la citation de la directrice, retirez la ligne (nouvelle empreinte).

### B2. Mises à jour de fiches publiées (la version actuelle reste en ligne jusqu'au GO)

Décisions revérifiées le 31/10 : aucune nouvelle approbation ni proposition depuis le 27/10 (POC-10 : version approuvée `b6c0d06e…`, POC-04 : `301b5f3d…`).

| Fiche | Changement exact | Limite | Rattachement | Aperçu | Empreinte |
|---|---|---|---|---|---|
| POC-10 Volontaires | +2 étapes (Le Parisien, 10/03/2026) : plainte des parents d'un enfant « à la mi-février » ; animateur « actuellement suspendu » | Informations de mars 2026 | +1 : Le Parisien (10/03/2026) | [POC-10](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-10.md) | `c300e67bbd798e1a` |
| POC-04 Émeriau | +2 étapes (Le Parisien, 12/10/2023) : interpellation le 4 octobre 2023, mise en examen et contrôle judiciaire | Fonction non reprise | +1 : Le Parisien (12/10/2023) | [POC-04](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-04.md) | `3ac5a2ffa8c2081b` |

## C. Consolidations de doublons (preuves conservées, aucune suppression, rien de public avant le GO)

| Paire | Preuves (intervenants · faits · périodes · procédures · sources) | Conclusion | Effets exacts après le GO |
|---|---|---|---|
| **PARIS-001 → FR-2026-0005** (Saint-Dominique, 7e) | Même école ; suspensions de janvier 2026, **16 gardes à vue du 20/05/2026** (Parisien : « plusieurs déjà suspendus dans le cadre d'enquêtes préliminaires »), **deux mises en examen du 22/05** ; PARIS-001 n'a qu'une source (MSN) | Doublon établi | **Id conservé : FR-2026-0005.** Sources : MSN (de PARIS-001) et Le Parisien du 20/05 (depuis 0022) réaffectées à 0005 (ligne `sources` déplacée, revue sur chaque affaire). PARIS-001 : `retirée`, revue `retirer` ; sa décision acquise (enrichissement ACCEPT `ed160212`, sans écriture) et ses 17 résolutions restent. Carte : disparaît ; fiche : celle de 0005 (B1) ; Hub : aucun ; URL : aucune page propre |
| **PARIS-008 → FR-2026-0008** (Boulard, 14e) | Même école, mêmes trois animateurs suspendus depuis la mi-février, **même article** (Le Parisien 11/03/2026, même URL) | Doublon établi | **Id conservé : FR-2026-0008** (fiche approuvée `82fdc1186464a565`, inchangée). PARIS-008 : `retirée`, revue `retirer` ; aucune source à déplacer. Carte disparaît ; Hub : aucun ; URL : aucune |
| **PARIS-010 → FR-2026-0003** (Grands-Champs, 20e) | Même école, même plainte du 30/09/2025, **même condamnation du 16/10/2026**, mêmes dossiers générés ; source (Parisien 20/03) déjà source de 0003 | Doublon établi | **Id conservé : FR-2026-0003** (carte « condamnation non définitive » déjà publiée, A ; fiche en B1). PARIS-010 : `retirée`, revue `retirer`. Carte disparaît ; Hub : aucun ; URL : aucune |

Effet public global : **65 → 62 cartes**. Réversible : les lignes restent en base ; la réconciliation de publication exige un nouveau GO pour en ramener une.

## D. FR-2026-0024 — École Belzunce, Paris 10e (décision demandée : carte)

- **Origine du statut actuel** : import de mai 2026, commentaire « plainte… classement sans suite » ; **aucune décision, revue ni événement** en base. Sa seule autre trace, une résolution « Libération — école contaminée au mercure », est hors sujet : détachée (ligne conservée).
- **Deux procédures séparées** : (1) la **plainte de 2024** à Belzunce (parents d'une fillette), l'animateur placé en garde à vue ; (2) la **mise en examen de février 2026 à l'école maternelle Bullourde (Paris 11e)** — qui a sa propre carte (**POC-06**, Hub Paris 11e) : rien de Bullourde n'est transféré à 0024.
- **Le classement** : « La plainte des parents **aurait** ensuite été classée sans suite » (Le Figaro 18/05/2026, d'après Le Parisien) ; le Parisien du 22/05 ne le dit pas. **« Relaxe » n'apparaît dans aucune source** : c'est la catégorie de la carte. Trace conservée : cette revue et la revue de carte écrite au GO.

| Option | Libellé public | Effets |
|---|---|---|
| **A — « enquête » (recommandée)** | « Selon Le Figaro, une enquête a été ouverte. L'ouverture d'une enquête ne préjuge pas de la culpabilité. » (le plus avancé des actes établis : plainte puis garde à vue) | Épingle bleue « Enquête », filtre « En cours » (au lieu de vert « Classé / Relaxé ») ; la mention §8 des mentions légales (retrait d'un classement sans suite) n'est pas déclenchée ; `statut_des_faits` reste « non établi » (non touché par le mécanisme). Le classement conditionnel est écrit comme inconnue dans la future fiche (non préparée : elle suit la décision de carte) |
| B — conserver | « Selon …, une relaxe, un non-lieu ou un classement a été prononcé » : non étayé (conditionnel, source unique d'origine) ; si le classement était un jour confirmé, le §8 des mentions légales imposerait le retrait | Aucun changement |
| C — « plainte » | « Selon …, une plainte a été déposée » | Moins avancé que l'acte établi (garde à vue) : non recommandé |

Pour l'option A : `_cartes_seules { "FR-2026-0024": "enquête" }` à ajouter au manifeste (je l'ajoute à votre mot).

## E. Exceptions résiduelles (aucune publication)

| Affaire | Motif précis | Recommandation |
|---|---|---|
| **Orange (Vaucluse)** — L'Alsace, franceinfo, France 3 du 02/07/2026 | **Nouvelle** : aucune affaire ni proposition (Vaucluse : Avignon, Morières-lès-Avignon ; Discovery sans mémoire avant le 06/09/2026, son scan est une fenêtre glissante). Qualifiée par la qualification Discovery existante (à blanc, 0,0008 $) : **NEW_CASE_CANDIDATE**, commune Orange, **établissement non nommé** (« un lycée d'Orange »), stade « mise en examen » (parquet de Carpentras, 02/07/2026, information judiciaire, contrôle judiciaire), trois sources libres avec citations littérales, aucune correspondance dans la base. Champs à qualifier à la main : type de structure, rôle, type d'affaire | Option 4 du GO : déposer la proposition ; le message « VALIDER ET PUBLIER » partira par le circuit habituel, **aucune publication sans votre clic** |
| **FR-2026-0047** (Alexandre-Copello, Marseille 5e) | Carte déjà corrigée (A). **Fiche non préparée** : générateur BLOQUÉ (l'article de verdict de La Provence est classé ambigu par une des deux passes du modèle, malgré le nom de l'école dans le texte) ; surtout le dossier de 14 étapes n'est **pas publiable en l'état** (âge de la personne mise en cause, citation du procureur sur la crédibilité de l'enfant). Réessai à nouveau coût sans garantie | Ne pas publier de fiche ; reprendre plus tard (roadmap) |
| **FR-2026-0013** (Clément-Ader, Athis-Mons) | Message 372 : la primitive répond « aucun changement » ; « enquêteurs saisis » n'est pas une déclaration du parquet | **Conserver « plainte »** |
| **FR-2026-0007** (Reuilly II, Paris 12e) | Régénérée avec 4 sources lisibles (20 Minutes, Linfo.re, Le Singulier, Orange Actualités) : **aucun acte judiciaire** établi (enquête **administrative**, signalement au parquet promis « sans délai », parents réclamant une procédure pénale). Carte « enquête » non étayée ([aperçu](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0007.md) `8a92d206ddcfefac`, A_REVOIR) | **REVIEW** ; carte → « à qualifier » (libellé public : « À qualifier », orange) tant qu'aucun acte judiciaire n'est lu — à votre décision, hors lot |
| **FR-2026-0026** (collège non nommé, Essonne) | Régénérée avec franceinfo (2016) : identité plausible (**collège Blaise-Pascal, Villemoisson-sur-Orge**, professeur de mathématiques mis en examen le 18/02/2016) mais carte « procès » (2021) non étayée (PDF du Parisien inaccessible, 503) ; dossier avec antécédents identifiants de la personne : non publiable | **REVIEW** ; rien à publier |
| FR-2026-0002 (Aqueduc, enseignant) · PARIS-004 (Paul-Dubois, Paris 3e) | Inchangés : état plus haut que les sources (0002) ; enrichissement insuffisant, Libération 403 (PARIS-004) | **REVIEW** |
| FR-2026-0004 (Vigée Lebrun) | **HOLD** inchangé : revue de granularité depuis le 21/09/2026 (trois hommes / douze enfants en mars, un condamné / neuf enfants en septembre ; sources inaccessibles) ; carte « enquête » conservée, faits territoriaux indépendants préservés, aucune levée | Inchangé |

## F. Situation unique de chacune des 65 cartes

| Situation principale | Nb | Affaires |
|---|---:|---|
| Fiche individuelle approuvée et publiée, **inchangée** | 30 | les 32 approuvées sauf POC-04 et POC-10 |
| Fiche approuvée, **mise à jour proposée** (B2) | 2 | POC-04, POC-10 |
| **Dossier dans un Hub** (aucune page `/affaires/<id>/` : ce n'est pas une anomalie) | 11 | Paris 11e : FR-2026-0016, 0023, PARIS-006, POC-05, POC-06, POC-07, POC-08 · Hautes-Alpes : 0031, 0032 · Bordeaux/Gironde : 0113 · Landes : 0116 |
| **Fiche à créer** (B1) | 11 | 0001, 0003, 0005, 0021, 0022, 0029, 0033, 0044, 0122, 0137, POC-03 |
| **Doublon à consolider** (C) | 3 | PARIS-001, PARIS-008, PARIS-010 |
| Décision de carte (D) | 1 | 0024 |
| **Exceptions résiduelles** (E) | 7 | 0002, PARIS-004, 0004 (HOLD), 0007, 0013, 0026, 0047 |
| **Total** | **65** | 32 approuvées (dont POC-09, 0114 et 0115 aussi présentes dans un Hub) + 11 Hubs seuls + 22 autres |

## G. Exécution après votre GO (ordre fixe)

1. Vérifier que les empreintes approuvées et les Hubs sont inchangés ; toute ligne dont le contenu autorisé a changé est isolée, les autres continuent.
2. `consolidations-30-10.mjs --ecrire --go=JJ/MM/AAAA` (réaffectations puis retraits), avant les approbations (0005 reçoit ses sources).
3. `go-lot-24-10.mjs --liste=ids-go-lot-stock-27-10.json --ecrire` (approbations, rattachements, 3 dates de parution), puis option 3 (`_cartes_seules`) si choisie.
4. Projections `project-public.mjs --modifier <id>` une affaire à la fois, retraits de cartes (circuit du 29/10), `promouvoir-fiche.mjs`, `project-evenements.mjs`, QA complète.
5. PR, **fusion seulement après les checks requis verts**, vérification du **contenu servi** (pages et cartes), puis seulement alors annonce Telegram avec le résultat API tracé. PARIS-009 ne réapparaît pas ; chaque version publique approuvée reste en ligne pendant son remplacement.
6. Option 4 : `orange-signal-31-10.mjs --ecrire` (la proposition part par `notifier-nouvelles`).

## H. Clé OpenRouter et bilan des coûts (à part, bref)

**Clé.** Étiquette `sk-or-v1-342…7a9`, plafond **50 $ par semaine** (reset le lundi 02/11 00:00 UTC), non-gestion. **GitHub et le poste utilisent la même clé** : un diagnostic en lecture seule (GET `/api/v1/key` depuis un workflow, supprimé ensuite) a rendu la même étiquette et le même compteur cumulé (29,986891085 $) que le poste. Le nom `petitnid-lab-dev` ne dit rien : **un autre projet sur cette clé n'est ni démontré ni exclu** (l'activité détaillée exige une clé de gestion). Reprise vérifiée : première génération utile sur FR-2026-0005 (READY, 0,085 $). Cette session : 0,55 $ (fiches 0003, 0005, 0007, 0026, 0029, 0047, POC-03 et qualification Orange), mesuré par le compteur de la clé et égal à la somme des coûts rapportés par les appels ; reste 46,03 $ sur les 50 $ de la semaine.

**Pics (modèle `deepseek/deepseek-v4.1-flash`, jours identiques en UTC et à Paris).** Traces : `cout_usd` OpenRouter de chaque appel réussi dans les caches disque des trois arbres de travail, journaux des runs GitHub, documents de session. **La dépense facturée par jour n'est pas lisible sans clé de gestion** : le « montant restant non attribué » ne peut donc être chiffré qu'avec le chiffre de votre tableau de bord.

| Jour | Appels réussis tracés · coût | Activité attribuée | Preuve | Reste non attribué |
|---|---|---|---|---|
| **19/10** | 515 appels · 3,14 $ (+46 sans coût) ; ≈ 4,1 $ avec les surcoûts documentés | 07h : génération de fiches #1 (36 appels, 0,33 $ ; session 63 appels, 0,58 $) · 13h : synthèse visuelle de FR-2026-0117 (14 appels, 0,09 $) · **19h-22h : catalogue à blanc de 50 affaires + correctif d'entités (465 appels, 2,72 $)** | `.cache/fiches/llm` (horodatage, `cout_usd`) ; docs GENERATION_FICHES_1 et GENERALISATION_QUALITATIVE_1 (≈ 3,5 $ ; correctif d'entités 115 appels, 0,72 $) ; commits 07:43, 13:48, 22:18 | Inconnu : ≥ 1 $ d'écart entre tracé et documenté (appels échoués ou non réussis) ; aucun défaut reproductible |
| **21/10** | 693 appels · 6,03 $ (+95 sans coût) ; ≈ 6,5 $ avec les surcoûts documentés | 09-10h : rattachement des sources (rejeu de 30 fiches, 0,53 $ ; 123 appels, 1,08 $) · **11h-13h : trois changements de contrat/prompt dans la journée** (empreintes `be6a01c4`, `68f87f7c`, `7483e87e` : 131, 163 et 399 appels sur la journée) = **portée multi-affaires (≈ 3,5 $ dont brouillons 1,20 $ + témoin 0,87 $)** puis **rejeu du stock de 51 fiches (≈ 2,5 $, dont 4 relances d'extraction « fetch failed »)** | idem + docs PORTEE_MULTI_AFFAIRES_1, STOCK_RELECTURE_1, RATTACHEMENT_SOURCES_1 ; PR 25/26 | Inconnu comme ci-dessus |

- **Pourquoi c'est cher** : DeepSeek « raisonne » : ≈ 11-12 k tokens de sortie par appel (19/10 : 2,2 M entrée / 5,7 M sortie ; 21/10 : 2,9 M / 8,1 M ; 228 appels dépassent 20 k de sortie) ; ≈ 0,006 à 0,009 $ par appel, sans appel aberrant.
- **Utile ou gaspillé** : travail de développement ponctuel, utile. Gaspillage mesurable : ≈ **2,1 $ de brouillons de contrat** du 21/10 supersédés (itération normale, pas un défaut) et quelques relances techniques (< 0,5 $ estimé). **Aucun défaut reproductible n'explique les pics** : la seule cause répétable est que le cache d'extraction est indexé sur tout le prompt, donc **toute retouche du contrat coûte un rejeu complet (≈ 2,5 $)** — comportement voulu, consigné dans la roadmap, non corrigé.
- **GitHub (Maintenance + Discovery)** : 19/10 : 2 appels (8 690 / 2 693 tokens) ; 21/10 : 8 appels (21 918 / 16 447) + au plus 8 évaluations Discovery par jour (≈ 0,0008 $ chacune) : **moins de 0,05 $ par jour**, négligeable devant les pics.
- **Octobre** : compteur de la clé 23,73 $ (mensuel) contre ≈ 11,3 $ retrouvés dans les caches ; le reste (1-17/10, appels échoués, éventuels autres usages) n'a **aucune trace exploitable** : non reconstitué.

## I. Méthode et limites

- **Relu à la main aujourd'hui** : Figaro, franceinfo, CNEWS, Parisien, Télégramme, Montagne, Dauphiné, Charente Libre, Clicanoo (texte entier), L'Alsace, LyonMag, Progrès, Gazette, Zinfos974, Linfo.re, France 3, Europe 1, Midi Libre, Canard enchaîné (chapeau libre), Le Monde. Rattachement ≠ contenu lu ≠ passage utilisé ; un article multi-affaires justifie un rattachement, jamais un transfert de fait.
- **Vérification des artefacts finaux** (sans refaire les recherches) : 22 contrôles sur les aperçus (corrections 0001, 0021, 0022, 0033, 0044, 0122, 0137, 0005, 0029) : tous présents. **Dates de parution comparées à la page** pour toutes les sources citées des 12 dossiers : 3 erreurs trouvées (0001, 0033 ×2), rectifiées ; 6 autres « 1er du mois » légitimes.
- **Inaccessibles, donc non lus** : Libération (403), MSN, Commons Média, PDF du Parisien (503), liens Google Actualités (opaques). Aucun fait n'en est tiré.
- Qualification READY ≠ validation éditoriale : aucun humain n'a relu ce lot avant vous. Les corrections de texte sont tracées dans `data/fiches-generees/<id>.json` (hors dépôt), champ `corrections_relecture`.
- Défauts documentaires et techniques consignés dans [ROADMAP_PRE_EXECUTEUR.md](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/ROADMAP_PRE_EXECUTEUR.md) (pilotage vivant) : aucun chantier lancé.
