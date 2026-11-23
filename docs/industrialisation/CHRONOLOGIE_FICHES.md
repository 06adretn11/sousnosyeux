# Chronologie des fiches — repère temporel et ordre (repasse du 23/11/2026)

Mandat : supprimer les « Date non établie » superflues du Déroulé et ordonner chronologiquement Déroulé, Paroles et réactions, Sources, sur toutes les fiches publiées, et rendre la règle durable. GO global d'Adrien pour ce lot (datation étayée, présentation, classement) ; aucun contenu, statut, HOLD ou brouillon modifié.

## Règle (code : `scripts/lib/chronologie.mjs`, partagé par le site et les contrôles QA)

1. **Date de l'événement établie** (`date_nature` evenement / approximative) → cette date, à sa précision réelle (jour, mois, année ; « Vers … » si approximative). Aucun jour fictif affiché.
2. **Sinon, date de publication de la source citée par l'élément** (`source.publie_le`) → « Information datée du … » (Déroulé) ou « Propos rapportés dans un article du … » (Paroles). Jamais présentée comme la date des faits : la ligne source ajoute « date des faits non établie ».
3. **Sinon** → « Date non établie » (+ « aucune date de publication exploitable »), classé en dernier.

Précisions de méthode :
- la source de repli est celle que cite l'élément (le « Selon X, … » et son lien) ; les références complémentaires (« Aussi : … ») corroborent l'étape mais ne prouvent pas qu'elles contiennent l'élément : elles ne le datent pas ;
- le texte n'est jamais lu pour y chercher une date (une mesure « annoncée pour le 15 juillet » reste une information datée de sa publication, pas une mesure réalisée le 15 juillet) ;
- aucune date de mise à jour, de collecte ou d'import n'est utilisée (le modèle ne porte que `publie_le` ; il ne distingue pas publication initiale et mise à jour : un repère issu d'une mise à jour ne pourrait pas être signalé comme tel) ;
- une date marquée `article` est une date de parution, jamais une date d'événement (conservé de la convention existante).

**Ordre** : ascendant (plus ancien d'abord). Date partielle classée au début de sa période (« 2026-07 » avant « 2026-07-06 », « 2026 » avant « 2026-01 »), sans jour affiché. Éléments sans date en dernier. Égalité → ordre d'écriture (tri stable). Sources : ordre de publication ; sans date en dernier, marquées « (non datée) » ; références « Aussi » triées de même.

## Où c'est appliqué (point commun, aucune donnée modifiée)

| Rendu | Fichier |
|---|---|
| Déroulé (fiches **et** Hubs) : repère + tri + « Aussi » trié | `web/src/components/Chronologie.astro` |
| Paroles et réactions (fiches, mode compact) : repère + tri | `web/src/components/Paroles.astro` |
| Sources et inconnues (fiche) | `web/src/components/FicheUnique.astro` |
| Sources de la fiche (Hub) | `web/src/components/Dossier.astro` |
| Réponses publiques de Hub : même libellé de repli (ordre rédactionnel conservé) | `web/src/components/Reponses.astro`, `web/src/lib/hub-matiere.ts` (`libelleDate` délègue à la règle) |
| Signalement de génération `DATES_NON_ECRITES` (nouveau libellé) | `scripts/lib/fiche-composer.mjs` |

Les données (`data/hub-matiere`, `data/evenements.json`) ne sont pas touchées : l'empreinte approuvée de chaque dossier est inchangée (aucune fiche ne perd son approbation) et toute génération future — nouvelle fiche, rejeu des projections, `appliquer-hubs` — passe par le même rendu. Aucun appel OpenRouter, aucun pipeline lancé, aucune notification.

## Contrôles

- `node scripts/qa/test-chronologie.mjs [--dist web/dist | --site https://sousnosyeux.org]` (enregistré dans `scripts/qa/run-all.mjs`, bloquant) : tests ciblés (précisions, repli, date « article » ≠ événement, texte non lu, complémentaires ignorées, tri stable sans perte), couverture du corpus écrit, et — avec `--dist` / `--site` — ordre et libellés du HTML réellement produit / servi (fiches + Hubs).
- Les éléments portent `data-repere` (evenement / approximative / information / aucune) et `data-cle` (clé de classement) pour que le contrôle lise le rendu, pas la donnée.

## Cas encore non datables et limites

- **Fiches** : 0 étape et 0 prise de parole sans repère (les 553 étapes des 62 fiches ont une date d'événement ou la publication de leur source citée).
- **Hub Paris 11e** (bloc « réponses », hors fiches) : 1 entrée garde « Date non établie » — la page de suivi d'Innocence en Danger, sans date de publication ni date d'événement.
- **Sources sans date de publication** : « Innocence en Danger (non datée) » dans les sources de FR-2026-0047 (page associative, aucune date).
- **37 étapes (22 fiches)** ont une référence complémentaire plus ancienne que la source citée. Le repère reste la publication de la source citée (qui porte le texte attribué). Une première publication plus ancienne contenant le même fait est possible mais n'est pas établie : un test lexical automatique (mots du texte retrouvés dans l'article antérieur) est trop grossier pour trancher (même fait ou même affaire ?) et n'a pas été retenu comme preuve ; cas à relire si l'on veut le repère « première publication » : FR-2026-0123 (5), FR-2026-0035 (3), FR-2026-0115, 0046, 0036, 0133, 0005, 0029, 0113, 0137, 0144 (2 chacune), et 1 pour POC-02, POC-03, FR-2026-0114, 0124, 0139, 0028, 0120, 0024, 0044, 0047, 0116.

## Proposition de mise à jour de CLAUDE.md (NON appliquée — go explicite requis)

> **Chronologie des fiches (23/11/2026)** — Repère d'une étape ou d'une parole : date d'événement si établie ; sinon « Information datée du … » = date de publication de la source citée (jamais une date de faits) ; sinon « Date non établie ». Déroulé, Paroles et réactions, Sources : ordre croissant, date partielle au début de sa période, sans date en dernier. Règle unique : `scripts/lib/chronologie.mjs` ; contrôle : `scripts/qa/test-chronologie.mjs` (`--dist` / `--site`).
