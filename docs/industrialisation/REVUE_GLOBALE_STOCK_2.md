# Revue globale du stock — dossier unique de validation (27/10/2026)

*Stock figé au 27/10/2026 (Neon + dépôt). Aucune publication, aucune approbation, aucun envoi Telegram : ce dossier prépare **un seul GO collectif avec exceptions**.
Manifeste exécutable après le GO : [`ids-go-lot-stock-27-10.json`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/ids-go-lot-stock-27-10.json)
(mécanisme du GO collectif du 24/10 : [`go-lot-24-10.mjs`](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/go-lot-24-10.mjs) `--liste=ids-go-lot-stock-27-10.json --ecrire`).
Les quatre publications du GO `9d277e1b` (Rouen, Charly v2, Émeriau, Volontaires v1) sont acquises : elles ne reviennent que par la mise à jour de POC-10 et POC-04 ci-dessous.*

**Règle de lecture.** Un GO couvre exactement les empreintes et changements listés : toute version modifiée ensuite sort du GO. Une exception retire sa ligne du manifeste ; rien d'autre ne change.

## A. Lot recommandé pour approbation (7 créations · 2 mises à jour · 5 corrections de carte)

### A1. Créations de fiche (page `/affaires/<id>/`, bouton « Fiche → » sur la carte ; aucun changement d'état de carte)

| Fiche | Affaire | Relecture (sources relues, corrections appliquées) | Limite importante | Rattachements (sources ajoutées aux sources de l'affaire, donc visibles sur la carte) | Aperçu | Empreinte |
|---|---|---|---|---|---|---|
| FR-2026-0001 | École Aqueduc, Paris 10e (animateur) · carte « condamnation non définitive » | Condamnation du 10/07/2026 (18 mois avec sursis, CNEWS + franceinfo) : étaye la carte. Étape en double retirée. Pas de transfert avec l'affaire sœur (enseignant) : sources de l'animateur seules. | Appel et caractère définitif non documentés. Quelques répétitions d'étapes subsistent (historique « audience prévue » puis « décision rendue »). | 4 : CNEWS (26/06), CNEWS (10/07), franceinfo (09/07), Le Figaro (20/03/2026) | [FR-2026-0001](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0001.md) | `bbf6dbdf3c435ff8` |
| FR-2026-0021 | Établissement non nommé, Les Mureaux · carte « mise en examen » | Mise en examen du 11/02/2025 (La Gazette en Yvelines, Le Parisien) : étaye la carte. Détails sur la victime retirés des « faits ». | 3 étapes, 2 sources ; la suite de la procédure est inconnue (dernière source : février 2025). | aucun | [FR-2026-0021](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0021.md) | `ca69bcd3e781128f` |
| FR-2026-0022 | Institution Saint-Dominique, Neuilly-sur-Seine · carte « enquête » | Enquête préliminaire du parquet de Nanterre (France 3, 07/04/2025) : étaye la carte. Fonction identifiante (« ancien censeur », « proviseur ») neutralisée partout, y compris dans une déclaration retirée. | Dossier d'avril 2025, 2 sources lues ; aucune suite documentée. Ne pas confondre avec l'école maternelle Saint-Dominique de Paris 7e (autre affaire, non mélangée). | 1 : 20 Minutes (18/04/2025) | [FR-2026-0022](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0022.md) | `d3ec303bfecf8a27` |
| FR-2026-0033 | Collège de Quartier-Français, Sainte-Suzanne · carte « mise en examen » | Mise en examen, suspension, contrôle judiciaire (Linfo.re, Zinfos974, 01/04/2026) : étaye la carte. Relecture : RAS. | 2 sources ; suite inconnue. | aucun | [FR-2026-0033](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0033.md) | `45db2b6de5bbc8fd` |
| FR-2026-0044 | Établissement professionnel non nommé, Charentay · carte « condamnation non définitive » | Procès du 02/12/2025 et condamnation rapportée (Le Progrès, LyonMag) : étaye la carte. Fonction identifiante (« professeur de mathématiques, professeur principal ») et âge de la victime retirés. | La peine n'est pas précisée dans les sources lues (« une condamnation est rapportée ») ; appel et caractère définitif inconnus. Une version régressive plus récente a été écartée par le garde-fou. | aucun | [FR-2026-0044](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0044.md) | `8b9335bf1473be74` |
| FR-2026-0122 | École maternelle privée Saint-Laurent, Paris 10e · carte « mise en examen » | Mise en examen et écrou du 24/09/2026 (Le Monde, Le Figaro, L'Indépendant, Midi Libre/AFP, JDD) : étaye la carte. Fonction identifiante (« intervenant / professeur d'anglais ») et nom de la société prestataire neutralisés. | Homonymes « Saint-Laurent » : chaque source retenue nomme bien l'école du Xe. Quelques étapes de plainte se répètent. | 3 : Le Dauphiné Libéré (24/09), JDD (22/09), L'Indépendant (25/09) | [FR-2026-0122](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0122.md) | `5b0ea0573432c33c` |
| FR-2026-0137 | École maternelle Julie-Victoire Daubié, Soyaux · carte « mise en examen » | Garde à vue du 12/10, présentation au juge, détention provisoire du 14/10 (parquet d'Angoulême, Charente Libre, Sud Ouest, ici, franceinfo) : étaye la carte. **Fausse « divergence » levée** : deux gardes à vue distinctes (28/07/2026 pour une photographie, autre fait ; 12/10/2026 pour les faits actuels) — l'étape du 12/10 ajoutée. Deux déclarations du parquet retirées (identité d'autres élèves ; constatations médico-légales). | Dossier long (32 étapes, redondances) ; Sud Ouest lu partiellement (abonnés) ; épisode de juillet traité comme contexte, non comme fait de la procédure actuelle. | 7 sources de presse (Sud Ouest ×2, Charente Libre ×2, ici ×3) | [FR-2026-0137](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0137.md) | `9107847d31816769` |

### A2. Mises à jour de fiches déjà publiées (la version actuelle reste en ligne jusqu'au GO)

| Fiche | Changement exact | Limite | Rattachement | Aperçu | Empreinte |
|---|---|---|---|---|---|
| POC-10 Volontaires | +2 étapes (Le Parisien, 10/03/2026) : plainte des parents d'un enfant de l'école « à la mi-février » ; animateur « actuellement suspendu » à cette date (France Inter, repris par Le Parisien). Le parcours antérieur de l'animateur (autre école) n'est pas repris. | Informations de mars 2026. | +1 : Le Parisien (10/03/2026) | [POC-10](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-10.md) | `c300e67bbd798e1a` |
| POC-04 Émeriau | +2 étapes (Le Parisien, 12/10/2023) : interpellation le 4 octobre 2023, mise en examen et contrôle judiciaire ; au moins cinq signalements et plaintes. L'étape « vers octobre 2023 » (20 Minutes) est fusionnée dans l'étape datée (20 Minutes devient source complémentaire : elle apparaît « −1 » dans le diff). | Le Parisien écrit « animateur », 20 Minutes « agent » : fonction non reprise (« un agent »). | +1 : Le Parisien (12/10/2023) | [POC-04](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/POC-04.md) | `3ac5a2ffa8c2081b` |

### A3. Corrections de carte seules (aucune fiche ; la fiche n'est produite qu'après correction de la carte : garde d'état)

| Affaire | Carte actuelle → proposée | Ce que les sources lues établissent | Limite |
|---|---|---|---|
| FR-2026-0003 École Grands Champs, Paris 20e | enquête → **condamnation non définitive** | Le Monde (16/10/2026) : le tribunal correctionnel de Paris a condamné à trois ans avec sursis probatoire, interdiction de se rendre « rue des Grands-Champs » ; Le Parisien (16/10). | Doublon présumé PARIS-010 (même école) non résolu : ses deux pins se contredisent tant qu'il subsiste. |
| FR-2026-0047 École Alexandre-Copello, Marseille 5e | procès → **condamnation non définitive** | La Provence (30/03/2026) : le tribunal correctionnel de Marseille a condamné à 3 ans dont 2 avec sursis probatoire. | Appel inconnu. |
| FR-2026-0013 Lycée Clément-Ader, Athis-Mons | plainte → **enquête** | Le Parisien (19/04/2023) : enquêteurs saisis, audition de la professeure ; Ouest-France (20/04/2023). | Sources de 2023 seulement ; aucune suite lue. |
| FR-2026-0029 Collège Saint-Charles, Chauny | condamnation non définitive → **procès** | Procès fixé au 3 mars 2026 (ici, Midi Libre, Le Parisien) ; **aucun verdict lu**. | Si un verdict existe hors des sources lues, l'exception est à lever (laisser la carte). |
| FR-2026-0024 École Belzunce, Paris 10e | relaxe / non-lieu / classement → **enquête** | Aucune relaxe, non-lieu ni classement lus (doctrine R5) ; garde à vue après plainte (Le Figaro, 18/05/2026) et plainte antérieure (Le Parisien, 22/05/2026). | La carte « relaxe » est une assertion favorable non étayée : à corriger plutôt que laisser. |

## B. Exceptions — recommandations (rien n'est publié pour ces dossiers)

| Affaire | Motif précis | Établi | Manque | Recommandation |
|---|---|---|---|---|
| FR-2026-0002 École Aqueduc (enseignant) · carte « enquête » · [aperçu](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0002.md) `5c0cb91528c3eaa8` | A_REVOIR : état plus haut que les sources (alerte majeure) ; document à identité ambiguë | Signalement du 14/10/2025, suspension, cellule psychologique, plaintes contre X (Le Monde, Le Figaro) ; une garde à vue sans déferrement citée par un article multi-affaires | Aucune étape de parquet/enquête explicite | **REVIEW** (arbitrage : carte « enquête » étayée par la seule garde à vue ?) |
| PARIS-004 École maternelle Paul-Dubois, Paris 3e · carte « enquête » | Enrichissement insuffisant (1 étape) | 20 Minutes (20/02/2026) | Libération (18/02/2026, rattaché à PARIS-004, non lu : HTTP 403) ; issue favorable à source unique | **REVIEW** |
| FR-2026-0005 et PARIS-001 École maternelle Saint-Dominique, Paris 7e | Doublon présumé (même école, deux pins) ; FR-2026-0005 : fonction identifiante ; PARIS-001 isolée | Rendus existants ([FR-2026-0005](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0005.md), [PARIS-001](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/PARIS-001.md)) | Arbitrage de doublon ; régénération de FR-2026-0005 impossible (crédits LLM, voir plus bas) | **Arbitrage de doublon** (aucune fusion automatique) |
| PARIS-008 École maternelle Boulard, Paris 14e | Doublon présumé de FR-2026-0008 (fiche déjà approuvée) | Rendu existant ([PARIS-008](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/PARIS-008.md)) | Arbitrage de doublon ; régénération impossible (crédits LLM) | **Arbitrage de doublon** |
| PARIS-010 École maternelle Grands-Champs, Paris 20e | Doublon présumé de FR-2026-0003 | — | Arbitrage de doublon (la carte de FR-2026-0003 est proposée en A3) ; régénération impossible (crédits LLM) | **Arbitrage de doublon** |
| FR-2026-0007 École maternelle Reuilly II, Paris 12e · carte « enquête » | Non préparée : régénération impossible (crédits LLM) ; version du 20/10 A_REVOIR, carte non étayée (enquête administrative seulement) | [Rendu du 20/10](https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/fiches-generees/FR-2026-0007.md) | Source judiciaire ; Linfo.re inaccessible | **REVIEW** (correction de carte à arbitrer) |
| FR-2026-0026 Collège non nommé, Essonne · carte « procès » | Non préparée : aucune source lisible (Le Parisien 2021 et Libération 2016 inaccessibles) | — | Toute source lisible | **REVIEW** (carte non étayée) |
| POC-03 École élémentaire Jules-Vallès, Plaisir · carte « condamnation non définitive » | Non préparée : régénération impossible (crédits LLM) ; version du 20/10 BLOQUÉE (carte non étayée) | Sources connues : Le Monde 2024 (402), Le Parisien, Europe 1 ×2, La Croix | Extraction par le modèle | **REVIEW** |
| FR-2026-0004 École Vigée Lebrun, Paris 15e | **HOLD** (décision historique conservée) | — | — | Inchangé |

## C. Bilan de couverture (34 affaires publiques sans fiche approuvée, chacune dans UNE seule ligne)

| Catégorie | Nombre | Affaires |
|---|---:|---|
| Cartes publiques | 66 | |
| Fiches déjà approuvées (dont les 4 du GO `9d277e1b`) | 32 | — |
| **Sans fiche approuvée** | **34** | |
| · Créations proposées (A1) | 7 | 0001, 0021, 0022, 0033, 0044, 0122, 0137 |
| · Corrections de carte proposées, fiche non préparée (A3) | 5 | 0003, 0013, 0024, 0029, 0047 |
| · Exceptions à arbitrer — REVIEW (B) | 2 | 0002, PARIS-004 |
| · Exceptions — doublon présumé / identité (B) | 4 | 0005, PARIS-001, PARIS-008, PARIS-010 |
| · Non préparées : régénération impossible ou source illisible (B) | 3 | 0007, 0026, POC-03 |
| · HOLD | 1 | 0004 |
| · Couvertes par un Hub (dossier publié dans le Hub, pas de fiche individuelle) | 12 | 0016, 0023, 0031, 0032, 0113, 0116, PARIS-006, PARIS-009, POC-05, POC-06, POC-07, POC-08 |
| Mises à jour proposées sur des fiches déjà approuvées (hors des 34) | 2 | POC-10, POC-04 |

**« Non préparée » ≠ « non publiable ».** Les trois affaires « non préparées » et les doublons dont la régénération a échoué l'ont été faute de crédits du modèle (OpenRouter HTTP 402 constaté pendant cette session, y compris en séquentiel) : leur état est celui des rendus du 20/10, non rafraîchi. Cela affecte aussi, tant que le solde n'est pas rechargé, les cycles de Maintenance et de Discovery qui utilisent la même clé.

## État de reprise

Aucune limite d'exécution n'a empêché de classer les 34 affaires. Reprise possible après le GO : (1) fiches des cinq cartes corrigées (A3) — régénération puis revue ; (2) arbitrages de doublon (0005/PARIS-001, PARIS-008, PARIS-010) ; (3) régénération de 0007, 0026, POC-03, PARIS-004 une fois les crédits rechargés.

## Méthode et limites de la relecture

- **Générées de nouveau le 27/10/2026** (sources de la mémoire + sources rattachées par la Maintenance ces 30 jours, hors sources payantes) : 0001, 0002, 0003, 0013, 0021, 0022, 0024, 0029, 0033, 0044 (version précédente conservée par le garde-fou de régression), 0047, 0122, 0137, PARIS-001. Chaque ligne publiée reste reliée à un extrait littéral de sa source (contrôle du générateur).
- **Passages sources relus à la main** : 0137 (gardes à vue des 28/07 et 12/10), 0022/0044/0122 (fonctions identifiantes), POC-10 et POC-04 (Le Parisien 10/03/2026 et 12/10/2023), états de carte de A3 (étapes de décision relues).
- **Relu sur le dossier et les contrôles du générateur, sans nouvelle lecture intégrale des articles** : 0001, 0021, 0033 — à reprendre si l'une de ces fiches soulève un doute à l'aperçu.
- Non relu par un humain à ce stade : tout le lot ; qualification READY ≠ validation éditoriale.
- Accès : les sources « libre » ont été lues en entier ; Sud Ouest (0137) et L'Humanité sont partielles (abonnés) ; Libération reste inaccessible (HTTP 403) partout où il apparaît, aucun fait n'en est extrait.
- Les corrections de texte de ce dossier (fonctions identifiantes, détails de victimes, étapes en double) sont tracées dans `data/fiches-generees/<id>.json` (hors dépôt public) et dans le champ `corrections_relecture`.
