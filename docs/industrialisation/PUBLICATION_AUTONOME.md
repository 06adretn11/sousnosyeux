# Publication autonome — l'exécution est automatique, l'autorisation ne l'est jamais

**Contrat** (jamais d'autorisation implicite) :

| Acte éditorial | Effet |
|---|---|
| CREATE / VALIDATE Discovery | candidate dans Neon, **jamais publiée** |
| CREATE_PENDING_EVIDENCE (« à corriger ») | candidate non publiable tant que les preuves manquent |
| ATTACH / RAPPROCHER | rattachement à une affaire existante, aucune autorisation de publier |
| REVIEW / HOLD | aucune publication |
| **GO PUBLICATION** | `publier-affaire.mjs --ecrire --go "…"` : bascule la fiche en `publiée` et consigne la revue « [Publication AAAA-MM-JJ] GO d'Adrien : … » (même instruction SQL) |

**Exécution automatique après un GO** — `scripts/reconcilier-publication.mjs --ecrire`, appelé par `sny-telegram` et `sny-clics` (même groupe de concurrence) :
`publiée` + GO explicite + absente de l'artefact → `project-public.mjs --ajouter` (lot) → QA → commit → push `main` → build Cloudflare → `verifier-site.mjs`
(« Publié et vérifié » n'est annoncé qu'après lecture du site servi) → contrôle `--site`. Un passage interrompu (push, QA, build) est rattrapé au passage suivant : les états sont recalculés depuis Neon + artefact + site.

**Ce que le script ne fait jamais** : publier une candidate, écrire un GO, projeter une affaire sous HOLD, retirée, de fiabilité < 8, ou publiée en base sans GO explicite.
Le GO doit être postérieur à `SNY_PUBLICATION_DEPUIS` (variable des deux workflows) : l'historique est protégé. Le texte « Publication automatique SNY » (écrit autrefois par une automatisation) n'est pas un GO.
États : AWAITING_GO (candidate validée, éligible, examinée, attend un GO) · NEEDS_PROJECTION · NO_GO · BLOCKED · HOLD · IN_ARTEFACT · PENDING_DEPLOYMENT · PUBLISHED_VERIFIED.

**Concurrence** — deux publieurs simultanés : le serveur git arbitre ; un conflit fait échouer franchement le second push, rien n'est écrasé, l'affaire reste `publiée` en base et est reprojetée au passage suivant.

**Marquage `geocode_source`** — émis pour les NOUVELLES entrées uniquement ; une entrée en ligne ne change pas d'elle-même. Pour marquer d'anciens points : `project-public.mjs --modifier <ids> --avec-geocode` (décision explicite).

**Note de sécurité** — but : exécuter sans intervention Git la suite d'une publication déjà autorisée par l'éditeur. Installation : aucune (scripts du dépôt, exécutés par GitHub Actions). Au démarrage : rien. Réseau : Neon (HTTPS), site public (lecture). Privilèges : `contents: write` sur le dépôt (déjà accordé à ces workflows), uniquement après QA. Aucune donnée personnelle traitée au-delà de celles de l'artefact public ; en CI les logs ne portent ni nom ni lieu. Revue par l'équipe sécurité recommandée avant activation : modification de workflows qui poussent sur `main`.
