# Remise à niveau de la maintenance — 28/11/2026 (état vérifié, causes, correctifs)

Point de départ : mandat du 28/11 (dossier de preuves préparé hors environnement). Tout ce qui suit a été **relu dans Neon, les journaux GitHub et le site servi** le 28/11 vers 14 h 30–16 h UTC, sur `main` = 3b9c838 (PR 172).

## 1. Cibles internes — état réel

| Cible | Objet résolu | État vérifié | Lecture |
|---|---|---|---|
| INT-001 Montpellier 0146 | `0c289b64` STATE_CHANGE enquête → mise en examen | ACCEPT 27/11 14:31, **appliqué** (événement 27/11 14:36) ; carte « mise en examen » ; fiche approuvée `3596b3e0…` (13/11) « enquête » | Rupture AVAL démontrée (§2-A) |
| INT-002 POC-05 | `f260ef64` | ACCEPT, application « conservee » 27/11 22:46 : rattachée à l'événement voie_de_recours du 08/07 déjà en base | Clos |
| INT-003 PARIS-006 | `5aa7ec2d` plainte → enquête | ACCEPT 27/11 14:22, application « bloquee » : le fait porté est une suspension | **Arbitrage** (le GO ne se transpose pas à un autre objet) |
| INT-004 Copello 0047 | `aca4236d` (fiche) | ACCEPT 27/11 20:56, approuvée et **servie** (hash `0ace6409ea155c94`) ; parole de Me Bucquet affichée « Date non établie » | Clos : aucune fausse date au 10/03 |
| INT-005 Saint-Aubin 0144 | `1e785e7f` (`ad1a2572…`) et `cd40fe3a` (`411b737c…`), même base | Deux GO le 27/11 ; seul `411b737c` est servi ; inconnues servies : « la suite de la procédure est inconnue » alors que le déroulé annonce le jugement du 7/12 | Perte de la rectification 1e785e7f ; version composée = **nouveau GO** (reprise `regenerer`) |
| INT-006 0144 audience | `0d374909` | écartée NON_PORTE_PAR_LE_CONTRAT ; audience du 7/12 **présente** dans le déroulé servi (« À venir ») | Information non perdue |
| INT-007 Montauban 0150 | `premiere-fiche:FR-2026-0150` | 5 refus `ETAT_CARTE_PERIME_OU_CONTREDIT` (21/11 15:04 → 27/11 01:15 UTC = 02 h 15 Paris) + 1 erreur de génération ; aucune proposition de fiche en base | §2-B |
| INT-009 Rots `0bb10e79` | REJECT Adrien 27/11 21:00 | Refus humain conservé | Clos |
| INT-010 `265d30bc` | écartée RATTACHEMENT_ERRONE_ARTICLE_SANS_LIEN | Exclusion conservée | Clos |
| PUB-002 Lingolsheim 0139 | carte servie, `data/cases.json`, Neon | « enquête » partout ; **jamais** « mise en examen » dans les 55 versions de `cases.json` ; aucun STATE_CHANGE | Constat infirmé, rien à aligner |

**29 décisions de l'export** : 29/29 retrouvées, portée intacte (24 ACCEPT, 4 REJECT, 1 REVIEW). Aucun refus ni aucune revue n'est devenu une acceptation. 18 des ACCEPT sont des enrichissements sans écriture (§2-C).

## 2. Causes démontrées et correctifs (PR « fix/maintenance-ecart-etat-fiche »)

**A. État appliqué, fiche jamais régénérée.** `proposer-mises-a-jour-fiches` ne lisait que les analyses ENRICHMENT (la source du 20/11 était en plus déjà listée : `SOURCE_DEJA_DANS_LA_FICHE`). `proposer-premieres-fiches` écarte les affaires déjà dotées d'une fiche. → `selectionnerEcartsEtat` : fiche approuvée ≠ carte, avec un événement appliqué portant l'état de la carte ⇒ régénération avec l'article de l'événement, avant les enrichissements. Une proposition faite n'est jamais refaite ; un blocage est réévalué après 24 h. Sur données réelles : **1 affaire, FR-2026-0146**.

**B. Montauban : audience renvoyée lue comme procès (hypothèse forte, à confirmer par la relance).** Les sources AFP rapportent une audience correctionnelle d'une procédure distincte, **renvoyée** au 1/12. Le compositeur comptait toute audience de jugement datée et passée comme « procès tenu » (rang 4 > mise en examen ⇒ refus). → Une audience renvoyée, reportée ou ajournée n'est plus un procès tenu ; « renvoyé devant le tribunal » (ordonnance de renvoi) n'est pas visé.

**C. Matière acceptée sans voie vers la fiche.** Un GO sur une parole ou une réaction n'écrit rien (la matière reste dans `state_proposals.facts`), et la mise à jour de fiche l'écartait comme `AUCUN_EVENEMENT_JUDICIAIRE`. → Une analyse **acceptée par l'éditeur** (décideur humain) déclenche une version candidate, même si sa source est déjà listée. Sur données réelles : **73 analyses, 23 affaires**, traitées à 2 par passage. Le GO de la parole n'approuve pas la fiche : chaque version repasse par sa propre proposition. Le plafond d'envoi existant (10/jour) protège des rafales.

**D. Cadence réelle.** `sny-maj-fiches` (cron horaire) : ~2 passages/jour mesurés. → `workflow_run` sur sny-clics (cœur de rythme du Worker, 30 min).

**E. Reprise ciblée.** Il n'existait aucune voie pour remettre en cohérence une fiche approuvée (GO perdu, inconnues contredites, source apportée par un humain). → Entrée `regenerer` + `case` dans sny-maj-fiches : générateur et gardes habituels, `data/fiches-sources-extra.json`, proposition Telegram (jamais publiée).

## 3. Le Perreux 0148 — cause amont

`case_checks` : la requête de veille est ancrée sur `"Germaine-Sablon"`. La dépêche AFP du 27/11 (Le Figaro, Le Dauphiné) n'apparaît dans aucun passage. Le repli « commune + rôle » existe, mais ne tourne que si les requêtes principales ne ramènent **rien**, et la lecture exige que la page nomme l'établissement (garde-fou délibéré contre les faux rattachements). Les titres vus (Le Parisien, Citoyens.com du 19/11, Seven Radio) ont produit des claims `SANS_PREUVE`, jamais de proposition, tandis que l'article Actu.fr du 13/11 a été réanalysé 10 fois. **Action prise** : les 3 références du dossier sont versionnées dans `data/fiches-sources-extra.json`, pour une reprise `regenerer`. **Résiduel** : élargir la détection aux articles qui ne nomment pas l'école est un choix de doctrine de rattachement, à trancher.

## 4. File d'attente (state_proposals, 60 jours, 28/11)

Sans décision : 165 ENRICHMENT envoyées, 29 jamais envoyées, 77 NO_CHANGE (non envoyées, normal), 45 AMBIGUOUS, 18 STATE_CHANGE (§5), 34 écartées avec motif. ACCEPT : 102 ENRICHMENT (dont 73 désormais repris, cf. §2-C), 10 STATE_CHANGE. REJECT : 16 (conservés). 7 doublons FR-0144 « mise en examen → procès » (même audience du 7/12) sont parqués, `info` sans message : jamais affichés à Adrien ; inapplicables par contrat.

## 5. Arbitrages restants (préparés, non décidés)

1. **FR-2026-0004** (HOLD) : 2 STATE_CHANGE « enquête → condamnation non définitive » (décision du 15/09/2026) envoyées, jamais décidées ; la carte dit « enquête ».
2. **PARIS-006 `5aa7ec2d`** : GO donné sur un objet typé « suspension » pour l'état « enquête » ; le GO ne vaut pas pour la transition.
3. **Doctrine de détection** (§3) : accepter un article qui nomme la commune et le rôle, sans l'établissement ?
4. **FR-2026-0032** (contradiction condamnation/classement) : non traité dans ce passage.

## 6. Relances prévues après fusion (aucune publication : chaque sortie est une proposition Telegram)

- sny-maj-fiches automatique : FR-2026-0146 (écart d'état), puis les 23 affaires à matière acceptée.
- `case=FR-2026-0150 designee=true` : première fiche Montauban (preuve de §2-B).
- `case=FR-2026-0144 regenerer=true` : version composée (rectification 1e785e7f + ajouts cd40fe3a).
- `case=FR-2026-0148 regenerer=true` : dépêche AFP du 27/11.
- `case=FR-2026-0133 regenerer=true` : inconnues contredites par le déroulé (PUB-003).

Diffusion sociale : bloquée tant que ces fiches ne sont pas approuvées et servies (relais REVIEW). Aucune voie manuelle utilisée.
