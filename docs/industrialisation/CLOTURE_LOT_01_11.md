# SNY — Clôture du lot de correction groupée (1er–2 novembre 2026)

_Bilan documentaire unique. Strictement factuel : aucune nouvelle revue, aucune régénération, aucun changement de doctrine. Rien n'a été retiré ni assoupli pour faire disparaître une alerte._

## 1. État livré

| Élément | Valeur au 02/11/2026 |
|---|---|
| Affaires en base (Neon) | 159 : 65 `publiée`, 76 `candidate`, 18 `retirée` |
| Cartes projetées (`data/cases.json`) | 62 (230 sources) ; 61 affichées sur la carte — FR-2026-0026 n'a pas de coordonnées |
| `publiée` non projetées | FR-2026-0048 et FR-2026-0049 (HOLD), PARIS-011 (fiabilité 4, sous le seuil de 8) |
| Fiches individuelles approuvées et servies | 58 |
| Cartes par état | condamnation non définitive 16 · enquête 10 · mise en examen 21 · plainte 5 · à qualifier 3 · relaxe / non-lieu / classement 4 · procès 3 |
| Hubs pilotes publiés | Paris 11e · Bordeaux-Gironde · Hautes-Alpes · Landes |

**Lot du 01/11/2026** ([PR 85](https://github.com/06adretn11/sousnosyeux/pull/85), main `7f7d476` ; [PR 86](https://github.com/06adretn11/sousnosyeux/pull/86), main `b83c09f`) : 56 fiches (26 créations, 30 mises à jour) ; 56/56 empreintes servies = manifeste = approbations, texte de la décision relu sur les 56 pages servies ; 13 dossiers de Hub appliqués sans refus ; 43 dossiers hors Hub promus ; cartes FR-2026-0008 et PARIS-007 « à qualifier », FR-2026-0116 type « autre », FR-2026-0142 « Lycée non nommé (secteur d’Orange) » ; doublons retirés PARIS-001, PARIS-008, PARIS-010, FR-2026-0007 (carte absente, page 404 ; PARIS-009 reste retiré). Aucun HOLD levé. Confirmation Telegram acceptée par l'API.

**Décisions acquises** : consignées dans `CLAUDE.md` §3 (« Acquis oct.–nov. 2026 ») ; aucune doctrine modifiée.

## 2. Les quatre affaires publiées sans fiche individuelle (volontaire)

| Affaire | Raison | Suite identifiée |
|---|---|---|
| FR-2026-0004 | HOLD (revue de granularité depuis le 21/09/2026) ; sources inaccessibles | Inchangé : aucune levée |
| FR-2026-0013 | Aucune décision judiciaire ; « enquêteurs saisis » n'est pas une déclaration du parquet | Conserver « plainte » ; pas de fiche |
| FR-2026-0016 | Une seule source partielle (Le Parisien, 20/03/2026) : pas de fait exploitable | Reste dans le Hub Paris 11e |
| FR-2026-0026 | État « procès » (2021) non étayé : franceinfo 2016 = mise en examen ; PDF du Parisien inaccessible ; antécédents identifiants ; sans coordonnées | À revoir — pas de fiche |

## 3. Les quatre constats de corpus

**Commande concernée** : `node scripts/qa/check-corpus.mjs` — c'est l'étape « Corpus réel (data/cases.json) » de `node scripts/qa/run-all.mjs`. Les règles R4 et R5 qu'elle applique sont classées **bloquantes** dans le rapport du contrôle (code de sortie 1), mais **l'étape n'est bloquante pour la QA et pour la fusion qu'avec `--strict`** : par défaut elle est informative, parce que les constats portent sur des données réelles publiées dont la correction est réservée à une décision humaine. La QA complète est restée verte tout au long du lot.

Avant la clôture : 4 constats bloquants. Après : **2** (les deux sources sans date sont fermées).

| # | Constat | Nature | Justification | Prochaine action |
|---|---|---|---|---|
| 1 | `R4_source_primaire_sans_date` — POC-02, source primaire Ouest-France | **Fermé le 02/11/2026** | Date de **parution** 2026-03-30, lue dans la métadonnée `datePublished` de la page ET déjà consignée dans une référence vérifiée du dépôt pour la même URL (journal de correction de POC-02 ; `publie_le` du dossier final). Ce n'est pas la date de l'événement (condamnation du vendredi 27 mars) | Aucune |
| 2 | `R4_source_primaire_sans_date` — POC-09, source primaire France 3 | **Fermé le 02/11/2026** | Date de **parution** 2026-05-22, lue dans `datePublished` ET identique au `publie_le` déjà porté par le Hub Paris 11e pour la même URL. Ce n'est pas une date d'événement | Aucune |
| 3 | `R5_relaxe_encore_publiee` — FR-2026-0024 (École Belzunce) | **Ouvert — informatif pour la QA, bloquant selon la doctrine R5 ; arbitrage éditorial requis** | La carte porte « relaxe / non-lieu / classement ». Le Figaro (18/05/2026) rapporte au conditionnel un classement sans suite de la plainte de 2024 ; aucune décision n'a été consultée ; aucune réouverture ni recours n'est rapporté. La règle R5 (07/10/2026) ne tolère l'issue favorable que si la procédure est vivante (appel, pourvoi, recours ou finalité non définitive établie) : rien ne l'établit ici. La fiche le dit déjà publiquement (« classement sans suite rapporté », « décision non consultée ») | Voir « Arbitrage à prendre » ci-dessous |
| 4 | `R5_relaxe_encore_publiee` — FR-2026-0035 (Crèche Joyeuse Tribu) | **Ouvert — même nature, même arbitrage** | Classement sans suite rapporté par France 3 Régions « selon la direction du groupe » ; aucune source judiciaire ne le confirme ; aucun recours rapporté ; 2 articles seulement. La fiche le dit (« classement rapporté », « aucun recours rapporté ») | Idem |

POC-09 n'est **pas** concernée par R5 : son état « relaxe » est accompagné d'un appel du parquet rapporté (procédure vivante).

### Arbitrage à prendre (consigné, ne bloque pas la clôture)

Les trois formulations publiques et la règle ne disent pas la même chose :
- **Mentions légales §8** : une fiche est retirée de la carte en cas de « relaxe définitive, non-lieu définitif ou classement sans suite » ;
- **Méthodologie** : « une affaire reste visible avec son état à jour, y compris après une relaxe ou un classement » ;
- **Règle R5 (07/10/2026)** : pas de retrait tant que la procédure est vivante ; sinon « retrait à instruire ».

Options, sans choix fait ici : (a) retirer les deux fiches, conformément aux mentions légales ; (b) les maintenir en l'état et mettre en cohérence mentions légales, méthodologie et règle (changement de doctrine : décision d'Adrien, à faire relire en Phase 4) ; (c) établir par une source, pour chaque affaire, un recours ou une finalité non définitive. **Jusqu'à la décision : statu quo** — les deux fiches restent publiées avec leur formulation prudente, rien n'est retiré, aucune règle n'est assouplie.

### Autres alertes (non bloquantes, inchangées)
`R5_verified_at_absent` (62 cartes, aucune date de vérification humaine en base) · `R4_media_incoherent` (13 libellés de média incohérents avec le domaine) · `R4_source_secondaire_non_admissible` (1 : MSN, agrégateur, sur FR-2026-0005).

## 4. Page `/revue-parents/` : ordre Carte → Fiches → Hubs

- Ordre des sections : **1. La carte → 2. Les fiches → 3. Les territoires (Hubs)** ; liste d'ancres « Sur cette page » dans le même ordre (`#carte`, `#fiches`, `#territoires`).
- Transitions ajustées seulement : les fiches sont présentées comme « le contenu le plus abouti du site » ; les Hubs comme « la partie la moins avancée : quatre pages pilotes, encore en construction, couverture et profondeur inégales ».
- Exemples publics et textes utiles conservés (trois fiches : Collège Jules-Ferry, Centre de loisirs de Cenon, École Titon ; quatre Hubs ; questions et lien e-mail).
- Aucun nouvel outil ni refonte.
- **Vérifié sur la page servie** (https://sousnosyeux.org/revue-parents/, après la fusion de la [PR 87](https://github.com/06adretn11/sousnosyeux/pull/87), main `b252804`) : ordre des titres Carte → Fiches → Territoires ; les trois ancres existent et mènent à la bonne section ; les neuf liens internes (méthodologie, carte, trois fiches, quatre Hubs) répondent 200 ; page toujours `noindex`. Sur ordinateur (1024 px) et sur mobile (375 px) : aucun débordement horizontal, l'ancre « les fiches » atterrit sous l'en-tête fixe. Après la fusion, relecture du site servi : 56/56 fiches du lot toujours conformes, 61 cartes affichées, PARIS-001/008/010 et FR-2026-0007 absents (404), dates de parution de POC-02 et POC-09 présentes sur leurs pages.

## 5. Défauts récurrents et prévention

Consignés dans `ROADMAP_PRE_EXECUTEUR.md` § 0 (bloc « Clôture du lot de correction groupée »). Aucun chantier n'est ouvert.

## 6. Suites déjà identifiées

1. **Première diffusion ciblée** pour recueillir des retours de parents (page prête ; retours par e-mail).
2. **Suivi de l'autonomie** sur les prochains passages normaux de la Maintenance et de la Discovery, sans rejeu global.
3. **Arbitrage R5 / mentions légales** pour FR-2026-0024 et FR-2026-0035 (§ 3).
4. Les quatre affaires sans fiche (§ 2) ; 76 candidates en attente de décision ; Phase 4 (revue juridique) ; critères de scoring sur la méthodologie.
