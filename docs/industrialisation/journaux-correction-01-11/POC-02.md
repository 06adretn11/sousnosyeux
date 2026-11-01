# POC-02 — École maternelle Charlie-Chaplin (La Courneuve)

**Statut final : MISE À JOUR PRÊTE** — empreinte `53dcbef1f29f68eb` → `4f0b75486dfa4a70` (`corr/p-POC-02.mjs`). ctrl : aucun signal.

## Observations des rapports
- Convocation et audience du 12/12 : étapes dupliquées, la seconde « était convoqué » — **encore présente**. Constat à la source : Le Parisien (17/12/2025) rapporte que l'audience a bien eu lieu le 12/12 (« audience devant la 14e chambre », prévenu « à la barre ») sans jugement, procès renvoyé au 27 mars ; ce n'est pas déduit de la convocation seule. Les deux étapes sont fusionnées en une étape `renvoi`.
- Condamnation (27/03/2026) et appel seulement annoncé bien distingués — **déjà conforme**, inchangé (« souhaite faire appel », « ferait appel » : annonce, pas appel formé).
- Propos de défense historicisés (avocat, 17/12/2025) — **déjà conforme**, inchangé.
- Référence Ouest-France sans parution — **encore présente** : renseignée.

## Changements exacts
- `deroule` : étapes `renvoi` + `audience` du 12/12 → une étape `renvoi` datée `2025-12-12` (evenement) : « convoqué le 12 décembre 2025 […] n'a pas été jugé ce jour-là : à l'audience, le tribunal a renvoyé le procès au 27 mars après avoir demandé aux deux plaignantes non représentées si elles souhaitaient un avocat ».
- Étape du 7/02/2025 : « élève de moyenne section » → « élève » (classe retirée).
- Source Ouest-France : `publie_le` null → `2026-03-30` (sur l'étape condamnation et les étapes où elle figure).
- `deroule` réordonné chronologiquement : révélation/signalement → plainte → enquête → suspension → contrôle judiciaire → renvoi du 12/12 → audience → condamnation → appel annoncé.

## Preuves
- Le Parisien 17/12/2025 https://www.leparisien.fr/seine-saint-denis-93/la-courneuve-suspendu-un-professeur-des-ecoles-accuse-dagression-sexuelle-par-trois-fillettes-sera-juge-en-mars-17-12-2025-4KGGPSVVCJH6NEDTADF2KZ2FEU.php : « était convoqué le 12 décembre devant le tribunal correctionnel de Bobigny » ; « renvoyer le procès au 27 mars prochain ».
- Ouest-France https://www.ouest-france.fr/faits-divers/agression-sexuelle/un-enseignant-de-maternelle-condamne-en-seine-saint-denis-pour-agressions-sexuelles-sur-trois-fillettes-feb57662-2c3a-11f1-9163-025005abf8da : « condamné, vendredi 27 mars, à quatre ans de prison dont deux ferme » ; « son client ferait appel » ; parution : métadonnée `datePublished` de la page = 2026-03-30 (non écrite dans le texte).
- Femme Actuelle (28/03/2026) : « souhaite faire appel […] comme l'a confirmé son avocat ».

## Limites
- Appel formé et caractère définitif non documentés. La date de parution Ouest-France vient des métadonnées de la page, pas du corps du texte.

## Proposition de carte
Aucune.
