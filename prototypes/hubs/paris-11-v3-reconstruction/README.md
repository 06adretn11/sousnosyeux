# Reconstruction « Hub Affaires V3 — Paris 11e »

> ⛔ **Référence visuelle non publiable.** Ce dossier ne doit jamais être servi, lié depuis
> une page publique, ni copié dans `web/src/pages/`, `web/public/` ou `web/dist/`.

| Champ | Valeur |
|---|---|
| Fichier | `index.html` |
| SHA-256 | `a09fb67c6362517af1d21dc065aeac736557dc3cf79b3271fe2e91098f8bdc4f` |
| Intégré le | 14 septembre 2026 |
| Statut | référence graphique figée — contenu **non revérifié** |
| Robots | `noindex,nofollow,noarchive` (balise présente dans le fichier) |

## 1. Ce que ce fichier est — et n'est pas

| Dimension | Statut | Détail |
|---|---|---|
| **Fidélité visuelle** | ✅ utilisable | Mise en page, hiérarchie, tokens de couleur et de typographie sont la référence de travail pour la porte 3. |
| **Texte historique** | ⚠️ conservé tel quel | Les formulations datent du 9 juin 2026. Plusieurs ne sont **plus** conformes à la doctrine SNY (voir §3). Elles sont volontairement **non nettoyées** pour préserver la référence. |
| **Données judiciaires** | ⛔ non revérifiées | Statuts, compteurs et échéances sont périmés. Rien dans ce fichier ne peut être republié sans revérification source par source. |
| **Source originale** | ❌ perdue | Le HTML/CSS/JS d'origine n'a été retrouvé ni dans le dépôt, ni dans l'historique de travail, ni sur le téléphone. Voir `docs/industrialisation/ROADMAP_PRE_EXECUTEUR.md` §2. |

## 2. Différences connues avec l'original

Ce fichier est une **recomposition**, pas une récupération. Écarts assumés :

1. **Code source non récupéré** — l'URI `content://com.whatsapp.provider.media/item/25686f60-…`
   est une permission Android locale et temporaire, non résolvable depuis un autre appareil.
2. **Rendu reconstruit depuis un enregistrement mobile + une transcription textuelle** — les
   dimensions, espacements et couleurs sont approchés à l'œil, pas extraits du CSS d'origine.
3. **Adaptation desktop inférée** — la vidéo ne montrait que le rendu mobile. La grille
   `1160px` à deux colonnes est une reconstruction plausible, pas une observation.
4. **Bouton « Masquer QA » ajouté** — n'existait pas dans le prototype. Ajouté pour pouvoir
   examiner le rendu public sans le bandeau de revue.
5. **En-tête mobile** — la vidéo révélait au moins un défaut de mise en page dans
   l'en-tête/navigation ; la reconstruction le corrige (nav à défilement horizontal).

## 3. Non-conformités éditoriales présentes dans le fichier

Elles sont **listées ici, pas corrigées dans le HTML**. Elles servent de corpus de test à la
porte 1 (`fixtures/editorial/`) et ne doivent jamais être reprises telles quelles.

| # | Emplacement | Non-conformité | Règle violée |
|---|---|---|---|
| 1 | Carte « École maternelle Servan » | « Animateur (né en 2005) » | année de naissance d'une personne mise en cause |
| 2 | Carte « École maternelle Servan » | « sur 3 enfants » | nombre exact d'enfants |
| 3 | Carte « École Titon » | « Animateur de 47 ans » | âge exact d'une personne mise en cause |
| 4 | Carte « École maternelle — Paris 11e » | « un enfant de trois ans » | âge exact d'un enfant |
| 5 | Carte « École maternelle Alphonse-Baudin » | « sur 5 enfants de maternelle » | nombre exact d'enfants |
| 6 | Bandeau de revue | « V3 — Publiable en l'état », coches QA, « 85 % complété » | données internes de revue mêlées au rendu public |
| 7 | Bandeau de statistiques | « 9 affaires / 7 établissements / 2 mises en examen / 2 procès / 0 condamnation » | compteurs saisis en dur, non dérivés des enregistrements canoniques |
| 8 | Encart « Suivi judiciaire » | cite « Voltaire » alors qu'aucune carte n'est nommée ainsi | liaison affaire ↔ établissement non traçable |
| 9 | Bandeau + agenda | « Délibéré Titon · 16 juin 2026 », « 26 juin », « 31 août », « 1er sept. » | échéances présentées comme futures, toutes dépassées au 14/09/2026 |
| 10 | Blocs « Ce que dit la presse », « Pour aller plus loin », « Associations mobilisées » | régimes de droits, de sélection et d'entretien distincts | hors périmètre du template public V1 |

## 4. Ce qui est repris pour le template public V1

Conservé : ancrage sur une zone, date de dernière vérification visible, cartes d'affaires
reliées à leurs sources, mention explicite de la présomption d'innocence, suivi de la réponse
institutionnelle, densité graphique générale.

Différé : citations de presse, podcasts, annuaire d'associations, agenda judiciaire, pages
individuelles d'affaires. Voir `docs/industrialisation/EDITORIAL_CONTRACT_V0.md` §7.

## 5. Garde-fous automatiques

Le contrôle `scripts/qa/check-public-surface.mjs` échoue si un fichier de `prototypes/`
apparaît dans `web/dist/`, `web/public/` ou `web/src/pages/`. Exécution : `npm run qa` à la
racine, ou `node scripts/qa/check-public-surface.mjs`.
