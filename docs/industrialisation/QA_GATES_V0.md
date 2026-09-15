# QA_GATES_V0 — contrôles bloquants

_Version 0 — 14 septembre 2026._

Un contrôle **bloquant** interdit la publication. Un contrôle **d'alerte** n'interdit rien
mais crée une tâche de revue. Rien n'est « bloquant sauf si on est pressé ».

Exécution : `node scripts/qa/run-all.mjs` (ou `npm run qa` depuis `web/` pour la chaîne
complète build + QA).

---

## 1. Contrôles bloquants

| # | Contrôle | Automatisation | Implémentation |
|---|---|---|---|
| G1 | 100 % des affirmations sensibles ont une source **et** un passage justificatif | ✅ AUTO | `check-claims.mjs` |
| G2 | Aucune donnée interdite : âge, année de naissance, nombre exact d'enfants, nom de personne mise en cause | ✅ AUTO (motifs) + ⚠️ HUMAIN (noms) | `check-forbidden-content.mjs` |
| G3 | Aucune échéance dépassée présentée comme future | ✅ AUTO | `check-deadlines.mjs` |
| G4 | Compteurs dérivés et cohérents (`sum(par_statut) == affaires`, aucun compteur saisi) | ✅ AUTO | `check-counters.mjs` |
| G5 | Doublons probables résolus ; un établissement = une graphie canonique | ✅ AUTO (signalement) + HUMAIN (arbitrage) | `check-duplicates.mjs` |
| G6 | Rendu mobile ≈ 390 px et desktop ≈ 1440 px sans débordement horizontal | ⚠️ SEMI | `check-responsive.mjs` (heuristique statique) + capture manuelle |
| G7 | Liens et sources accessibles, ou statut d'indisponibilité **explicite** | ✅ AUTO (structure) / ⚠️ réseau requis pour le live | `check-sources.mjs` |
| G8 | Approbation humaine portant sur un `payload_hash` exact | ✅ AUTO | `check-approval.mjs` |
| G9 | Correction / retrait testés et effectifs en cascade | ✅ AUTO (cycle simulé) | `scan-maintenance.mjs --cycle` |
| G10 | Aucune fuite de champ interne ni de secret dans un artefact public | ✅ AUTO | `check-public-surface.mjs` |

## 2. Contrôles d'alerte

| # | Contrôle | Effet |
|---|---|---|
| A1 | `verified_at` absent ou plus ancien que le seuil du statut | tâche de revue, priorité selon statut |
| A2 | Source primaire issue d'un média non admissible (encyclopédie, agrégateur, paywall) | tâche de revue |
| A3 | Affaire sans coordonnées géographiques | tâche de revue, l'affaire reste hors carte |
| A4 | Transition judiciaire régressive détectée | **priorité haute** — favorable à la personne mise en cause |
| A5 | Divergence entre `cases.statut_judiciaire` et le dernier `case_event` | tâche de revue |

Note : A4 n'est **pas** bloquant. Une régression est une information légitime et prioritaire,
pas une erreur — la bloquer reviendrait à retarder une correction favorable.

---

## 3. Règles d'application

1. **Aucune dérogation silencieuse.** Une exception se déclare dans le fichier de la fiche
   ou du hub, avec une justification et une date d'expiration. Un contrôle ne se désactive
   pas globalement.
2. **Un test qui ne peut pas échouer ne compte pas.** Chaque contrôle bloquant a au moins une
   fixture prouvant qu'il détecte le défaut (`fixtures/editorial/`), et le harnais vérifie que
   le verdict attendu correspond au verdict obtenu.
3. **Le vert n'est pas une preuve d'exhaustivité.** G2 détecte des motifs, pas des noms
   propres inconnus ; G7 vérifie la structure, pas la disponibilité réseau. Leurs limites sont
   déclarées dans chaque script.
4. **Idempotence.** Un second passage sans changement ne recrée pas la même alerte active :
   une alerte est identifiée par une empreinte stable `(type, cible, éléments déclencheurs)`.
5. **Ordre.** G10 (fuite) et G2 (donnée interdite) s'exécutent en premier : ils protègent
   contre un dommage irréversible, les autres contre une erreur corrigeable.

---

## 4. Ce que ces portes ne couvrent pas

- L'exactitude judiciaire d'une affirmation : aucun contrôle automatique ne remplace la
  lecture de la source par un humain.
- La qualification juridique du projet (hébergeur / éditeur) — 🔵 conseil externe.
- La disponibilité réelle des URL : nécessite un accès réseau sortant, non exécuté ici.
- Les noms de personnes non détectables par motif.
- La conformité visuelle pixel-près : G6 est une heuristique statique, pas un rendu réel.
