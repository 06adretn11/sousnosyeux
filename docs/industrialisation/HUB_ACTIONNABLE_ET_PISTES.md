# Nouveau Hub actionnable · « À lire aussi » = piste, jamais preuve

Deux écarts de la boucle Telegram observés le 24/10/2026. Changement minimal, circuits existants réutilisés.

## 1. Nouveau Hub : de l'information à l'action

**Avant.** `diagnostic-territoire.mjs` envoyait « TERRITOIRE · PROPOSER_NOUVEAU_HUB » par `prevenir()` : aucun bouton, aucune ligne en base, rien à cliquer.

**Maintenant.** La proposition est une ligne de `new_case_proposals` (clé `hub|<territoire>|<empreinte du périmètre>` : une seule par périmètre), envoyée par le circuit Discovery avec trois boutons :

| Bouton | Effet |
|---|---|
| 🗺 PRÉPARER LE HUB (callback `sny:NC:VALIDATE`) | décision ACCEPT → `preparer-hub.mjs` |
| 🟡 REVIEW | HOLD : rien préparé |
| ⛔ REJECT | consigné, rien préparé |

`boutonValable` n'admet pour un message « Hub » que `VALIDATE` : un clic ne peut ni créer une fiche, ni rattacher, ni publier.

**Préparer** (`scripts/preparer-hub.mjs`, appelé par `sny-clics` et `sny-telegram`) :
1. `--ecrire` : écrit `docs/industrialisation/hub-drafts/<territoire>.md` (dossier de revue, `lib/hub-brouillon.mjs`) depuis `data/cases.json` (affaires publiques) + `case_events`/`sources` (Neon, lecture). Dossier déjà à jour (même empreinte) : rien n'est réécrit.
2. Le workflow dépose le dossier sur `main` (docs seulement ; aucune page, aucun build modifié).
3. `--annoncer` : vérifie que le dossier est **sur `origin/main`** avec la même empreinte, puis envoie UN message avec le lien et clôt la proposition (`applied_at`). Pas sur main → rien n'est annoncé ; au bout de 2 h, un message dit que le brouillon n'est pas disponible.
4. Aucune affaire publique / erreur → message explicite (une seule fois), jamais un succès.

**PRÉPARER ≠ PUBLIER.** Le dossier porte « BROUILLON — aucune publication », une empreinte, une liste « à établir avant toute publication ». Publier un Hub reste un GO distinct.

Re-proposer un territoire sans attendre un changement : `node scripts/diagnostic-territoire.mjs --territoire landes --proposer --ecrire` (idempotent).

Non traité (hors périmètre) : `INTEGRER_HUB`, `ENRICHIR_HUB`, `REVIEW` du diagnostic restent des messages d'information sans bouton.

## 2. Preuve : « À lire aussi » n'est pas une citation

**Cause établie.** Pour `751ac2d7` (FR-2026-0004, RFI du 15/09), `extraireCorps` gardait le paragraphe `<p class="a-read-more">À lire aussi …` ; `extraireReactions` le découpait comme une phrase du corps et y lisait « des parents rassemblés ». La citation était « littérale » : la vérification (`evidenceLitterale`) ne contrôle que la présence dans la page.

**Correctifs.**
- `corps-article.mjs` : les blocs « À lire aussi / Lire aussi / Voir aussi… » sortent du corps ; ils sont rendus dans `liens_associes` (titre + adresse). `extraireCorps` rend aussi `publie_le` (méta, JSON-LD, sinon adresse).
- Défense en profondeur : `extraireReactions` et `evidenceLitterale` refusent une phrase / citation qui est un lien associé (corps déjà mémorisés, voie modèle).
- `lib/pistes.mjs` + `maintenance-cycle.mjs` : les liens associés sont **suivis une fois** (profondeur 1), même éditeur, ≤ 2 par source, ≤ 8 par cycle, seulement si le titre annonce un fait du vocabulaire fermé. L'article lié est lu par `lirePage` puis qualifié comme n'importe quelle source (mêmes gardes) : sa proposition porte sa propre source, ses citations, sa date de publication et `decouvert_via`. Inaccessible ou sans fait : consigné, incertitude conservée.
- Dates : une date d'événement n'est posée que si l'article la dit (« ce samedi » rapporté à sa publication, ou une légende datée unique) ; la date de publication n'est jamais prise pour celle du fait.
- Portée : `territoire` est celui que nomme la source probante (« à Paris ») ; le message ne dit plus « Territoire : Paris 15e » par défaut mais « non établi par la source ».

**Cas RFI (lecture réelle du 25/10/2026).** Article du 15/09 : 0 réaction, 2 liens associés (1 suivi). Article lié du 21/03 : « un rassemblement de plusieurs parents du collectif #MeTooEcole était organisé ce samedi matin devant la mairie de Paris » → événement 2026-03-21, portée territoire « Paris », absent de la mémoire. La proposition `751ac2d7` est déjà en REVIEW (décision d'Adrien du 24/10, 08:26 UTC) : non modifiée.

## Note de sécurité (livraison)
- But : rendre actionnable un signal Telegram et fiabiliser une preuve ; aucun nouveau binaire ni service.
- Installation : scripts du dépôt, exécutés par les workflows GitHub Actions existants (`sny-clics`, `sny-telegram`).
- Au démarrage : rien (pas de persistance). Trois étapes ajoutées, `continue-on-error`, après la publication des pages.
- Réseau : Telegram, Neon (déjà utilisés) ; lecture des pages d'articles liés (même éditeur, borné).
- Privilèges : `contents: write` déjà accordé aux deux workflows ; nouveau dépôt de fichiers limité à `docs/industrialisation/hub-drafts/`.
- Données personnelles : dossier de Hub construit à partir de l'artefact public ; aucun nom, aucune affaire non publique, aucun média payant. Revue sécurité recommandée pour les étapes de workflow qui poussent sur `main`.
