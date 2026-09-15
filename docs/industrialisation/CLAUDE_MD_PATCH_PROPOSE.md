# Mise à jour proposée de `CLAUDE.md`

**Non appliquée.** Deux raisons :

1. `CLAUDE.md` §11 verrouille l'édition du fichier (« Ne **jamais** modifier ce fichier sans
   le go explicite de l'utilisateur »).
2. Le fichier porte déjà des modifications locales non commitées de la session précédente :
   y écrire ferait entrer ce travail en cours dans les commits de cette branche.

Blocs à coller tels quels après relecture.

---

## À ajouter dans §3 — Décisions verrouillées

| Décision | Choix | Raison |
|---|---|---|
| Projection publique | Liste blanche unique dans `scripts/lib/public-projection.mjs` ; `assertNoInternalFields()` jette avant toute écriture d'artefact public | 4 fuites constatées, dont `fiabilite_info_10` expédié 52× au navigateur de chaque visiteur |
| `fiabilite_info_10` | **Champ interne** — retiré de `data/cases.json`, du build et du navigateur | Publié à côté d'une affaire judiciaire, un « 10/10 » se lit comme un degré de certitude sur les faits. Il ne qualifie que la traçabilité de l'information |
| `commentaire_validation` | **Champ interne** ; le résumé public passe par `resume_public` (colonne créée par la migration 004, non remplie) | La vue `cases_public` l'excluait déjà : `sync-data.mjs` la contournait en `select=*` |
| Clé `service_role` | **Jamais persistée** dans le navigateur ; `tools/review.html` purge une clé héritée et invite à la faire tourner | La clé bypasse toutes les RLS et l'outil est versionné dans un dépôt public |
| Email de contact | `contact@sousnosyeux.org` **partout** — `.fr` n'a jamais existé | Le droit de réponse LCEN et le signalement de contenu pointaient vers une boîte inexistante |
| Migrations | Additives et **non appliquées** ; testées sur un Postgres éphémère local avant toute exécution contre Supabase | La 004 a été appliquée, rejouée, testée (11 invariants) et son rollback exercé sans jamais toucher la production |
| Invariants éditoriaux | Contrôlés **hors base** (`scripts/qa/`) avant d'être imposés par le moteur | 53 fiches publiées en violent déjà au moins un : les contraindre en SQL rendrait la base non écrivable |
| Brouillons de hub | `web/src/pages/brouillons/hubs/[hub].astro`, rendus uniquement si `SNY_DRAFTS=1` (`npm run build:drafts`) | Le build de déploiement n'en produit aucun, et `check-public-surface.mjs` échoue si un brouillon atteint `web/dist` |
| Seuil d'éligibilité d'un hub | **4 affaires publiées distinctes** par zone ; sinon preuve d'inéligibilité | Interdit de compléter artificiellement une zone pour « faire une page » |
| Priorité de revue | Une issue **favorable** à la personne mise en cause (relaxe, non-lieu, classement, rectification) passe avant toute information qui confirme | Asymétrie assumée : une correction favorable n'attend pas le cycle de revue |

## À ajouter dans §2 — État actuel

```
- **Chantier pré-exécuteur** : branche `feat/hub-pre-executeur` (PR ouverte, non mergée)
  - Portes : 0 `PASSED` · 1 `PROVISIONAL` · 2 `PASSED` · 3 `PROVISIONAL` · 4 `PROVISIONAL`
  - Verdict : `READY_FOR_EXECUTOR_DESIGN` — n'autorise ni bot, ni Telegram, ni scheduler,
    et ne rend aucun hub publiable
  - Contrats : `docs/industrialisation/{EDITORIAL,DATA}_CONTRACT_V0.md`, `QA_GATES_V0.md`
  - Audit : `docs/industrialisation/CORPUS_AUDIT_V0.md`
  - Preuves : `docs/industrialisation/GATE_0_REPORT.md`
  - Outils : `npm run qa` (racine), `node scripts/build-hubs.mjs --draft`,
    `node scripts/scan-maintenance.mjs`
- ⚠️ `data/cases.json` est un instantané du **2026-06-06** : plus de 3 mois d'écart
```

## À ajouter dans §8 — Tâches techniques en attente

```
- 🔴 **CRITIQUE** : `FR-2026-0024` et `FR-2026-0035` sont en `relaxe / non-lieu /
  classement` et **toujours publiées sur la carte**, alors que les mentions légales §8
  engagent à les retirer
- 🔴 **CRITIQUE** : faire tourner la clé `service_role` Supabase — elle a été stockée en
  clair dans `localStorage` par une version antérieure de `tools/review.html`
- 🔴 3 doublons quasi certains à fusionner : `FR-2026-0003`/`PARIS-010`,
  `FR-2026-0007`/`PARIS-007`, `FR-2026-0008`/`PARIS-008` → le corpus passerait à 50
- 🟠 3 fiches publiées avec une source primaire **non datée** : `POC-02`, `POC-09`, `POC-10`
- 🟠 2 sources primaires non admissibles : Wikipédia (`FR-2026-0008`), MSN (`PARIS-001`)
- 🟠 La table `reviews` n'a **jamais** été écrite : aucune trace de qui a validé quoi
- 🟠 `bulk-publish.mjs` publie sur le seul score, sans vérifier `verified_at`, la présence
  d'une source primaire datée ni le statut → c'est le chemin par lequel les 2 relaxes sont
  passées
```

## Correction à apporter dans §6 — Carte du repo

La section `tools/` y apparaît **deux fois** (une fois développée, une fois réduite à
`review.html`). Fusionner les deux blocs.
