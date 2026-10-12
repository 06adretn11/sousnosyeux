# Mission 3 — fiches, Hubs et mémoire vivante : intégration (12/10/2026)

Branche `feat/fiches-individuelles` (sur `2ee18ff`). **Rien n'est déployé tant que la branche n'est pas fusionnée** : les workflows et le Worker tournent sur `main`.

## La verticale, étape par étape (rien de manuel après le merge)
1. `node scripts/proposer-fiche.mjs POC-09 FR-2026-0042 --ecrire` — crée la proposition (clé `fiche|<id>|<empreinte du dossier>`), sans l'envoyer. *(seule commande humaine/technique : la préparation d'une fiche, comme `proposer-publication`)*
2. `sny-clics` (toutes les 30 min, `notifier-nouvelles`) envoie le message « FICHE INDIVIDUELLE À APPROUVER » : aperçu, éléments nouveaux, sources directes, inconnues, diff de publication. Boutons : ✅ APPROUVER LA FICHE (callback `VALIDATE`), 🟡 REVIEW, ⛔ REJECT.
3. Clic → Worker → `sny-telegram` : décision persistée (`new_case_proposals`) → `appliquer-nouvelles-affaires` (branche `p.page`) : sources lues pour la fiche rattachées à l'affaire (`rattacher-sources`, idempotent) + revue `[Fiche approuvée <id8>] <id> hash=<empreinte>` ; l'affaire n'est **pas** modifiée.
4. `project-evenements.mjs` (nouvelle étape 5b des deux workflows) : `data/evenements.json` reçoit `fiches_approuvees` **seulement si l'empreinte approuvée = empreinte du dossier actuel** (dossier modifié depuis → plus de page : échec fermé).
5. QA → commit → push `main` → build Cloudflare (route publique `/affaires/<id>/`, absente sans approbation) → `verifier-site --fiches` (200, `data-fiche`, `data-evenements` = événements de la projection) → Telegram « Publié et vérifié ».
6. Hub : si la fiche est publiée **et** le dossier porte `apercu_types`, le bloc de l'affaire devient aperçu + « Consulter le dossier complet → » ; la fiche porte « Contexte territorial ».

## Propagation d'un UPDATE
`appliquer-decisions` (ACCEPT d'état) → `publier-evolutions` (Home, `cases.json`) **et** `project-evenements` (fiche + Hub) dans le **même passage** : un seul commit, une seule QA, une seule vérification. Aucun workflow nouveau.

## Réaction institutionnelle (Francas, `4d4d3ec7`)
`detecterInstitutionnel` ne reconnaissait pas une association employeuse → la proposition n'aurait jamais eu de bouton ni été appliquée. Ajout d'une catégorie fermée `declaration_employeur` : libellé public **fixe** (« Selon la presse, l'employeur… a publié un communiqué… Position de l'employeur, non vérifiée par ailleurs. »), `event_type` `réponse_institutionnelle`, `realisation` NULL, **aucun changement d'état**. La citation reste en mémoire privée.

## Diagnostic territorial (`diagnostic-territoire.mjs`)
Sorties NO_ACTION · INTEGRER_HUB · ENRICHIR_HUB · PROPOSER_NOUVEAU_HUB · REVIEW. Instantané dans `telegram_journal` (aucune table). Premier passage = base de référence ; notification seulement si les compteurs ont bougé. Étape finale non bloquante des deux workflows.

## À la fusion
- Pré-requis Neon déjà satisfaits (migrations 019/021). Aucune migration nouvelle.
- Après merge : (a) `UPDATE state_proposals SET payload = payload || '{"rattachement":"OK"}' WHERE proposal_id::text LIKE '4d4d3ec7%'` (la proposition Francas écrite à la main n'avait pas ce drapeau) ; (b) `proposer-fiche --ecrire` pour Titon puis Delle.
- **Enrichissements de Hub inclus** (visibles à la fusion, relus sur le texte brut) : Paris 11e / Titon : +1 entrée « enquête / contrôle judiciaire », date d'appel précisée ; +1 réponse « rassemblement du 18 juin » (groupe Familles…). Sources de Titon à rattacher via l'approbation de la fiche.
