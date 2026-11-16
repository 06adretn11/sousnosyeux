# Relais social — canal Instagram (mode REVIEW)

Compte : `@sousnosyeux_org` (Instagram Business, connecté à Buffer). Même circuit que X / Facebook, **sans rien reconstruire** :

```
Nouveauté approuvée → contrôles → légende V4.1 + visuel 1080×1350 → image hébergée et relue → UNE proposition Telegram Instagram
   → GO Instagram (clic) → recontrôle complet → Buffer (+15 min) → journal → suivi / annulation → permalien vérifié
```

## Ce qui est nouveau (et seulement cela)

| Élément | Fichier | Rôle |
|---|---|---|
| Légende | `scripts/lib/social-editorial.mjs` (`versInstagram`, gabarits `source_ig`, `suivi_ig`) | Dérivée du post **Facebook déjà composé et contrôlé** : mêmes phrases approuvées, mêmes sources. La ligne « Source » garde média + date, **perd son adresse** (non cliquable) ; le renvoi est `sousnosyeux.org` en clair. Le vérificateur V4.1 (`verifierPost`) s'applique tel quel. |
| Visuel | `scripts/lib/instagram-visuel.mjs` | UN gabarit HTML (polices du site embarquées), rendu par un navigateur sans interface. Chaque ligne affichée est la **copie exacte d'un segment de la légende** ; contrôleur indépendant (`verifierVisuel`). Texte qui ne tient pas ⇒ **aucun visuel** (jamais coupé). Aucune image générative, aucun portrait. |
| Hébergement | `scripts/lib/media-github.mjs` | Branche orpheline `instagram-media` du dépôt, alimentée par l'API GitHub (`GITHUB_TOKEN` du workflow). URL directe `raw.githubusercontent.com/…/instagram-media/ig/<affaire>/<16 hex du sha256>.png` : **adressée par le contenu ⇒ immuable**, aucun commit sur `main`, aucun déploiement, aucun upload manuel. |
| Relais | `scripts/lib/relais-instagram.mjs` | Proposition indépendante (`<événement>#instagram:<empreinte>`), GO `GO_I`, recontrôle, publication, confirmation. |
| Boutons | `sny:SG:I:<id>` (GO Instagram) · `sny:SG:R:<id>` (Refuser) | `I` n'est valable que sur une proposition qui a proposé Instagram ; un GO X / Facebook ne vaut jamais GO Instagram, et inversement. Le Worker Telegram accepte `I` (`DATA_RE`). |
| Migration | `supabase/migrations/027_relais_social_instagram.sql` | Élargit deux CHECK (décision `GO_I`, ligne de configuration n° 2). Aucune table, aucune donnée touchée. |

## Identité validée par le GO (immuable)

`événement + fiche approuvée (empreinte) + source + légende + spécification du visuel + gabarit + empreinte SHA-256 du CONTENU de l'image + URL + canal Instagram`.

Au moment de l'envoi : recomposition complète, comparaison, **relecture de l'image à son adresse publique** (HTTP 200, `image/png`, 1080×1350, octets identiques, pas de redirection). Toute différence ⇒ le GO est résolu « périmé », **aucun appel Buffer**, alerte Telegram.

## Point de départ propre à Instagram (anti-backfill)

* **T0 global** (ligne 1 de `relais_social_config`) : inchangé, ni lu ni modifié par le canal Instagram.
* **Point de départ Instagram** = ligne 2 de la même table (mêmes triggers d'immuabilité), posée UNE fois par l'action `initialiser-t0-instagram` (confirmation `GO-INSTAGRAM`), horloge de la base.
* Une nouveauté n'est proposée sur Instagram que si son **dernier geste humain** (approbation de la fiche / décision de l'événement) suit ce point de départ **et** tous les contrôles du relais passent (T0 global, source < 7 j lue, fiche approuvée et servie, aucun retrait / HOLD).
* **Exception d'amorçage** : la variable `SNY_INSTAGRAM_AMORCAGE` peut nommer **UN** événement (ex. `case_update|FR-2026-0144|mise-en-examen`) admis malgré un geste antérieur au point de départ. Elle ne lève aucun autre contrôle. À vider après l'essai.
* Un événement n'est diffusé qu'**une fois** sur Instagram : le journal `diffusions_sociales` est tenu sur la clé de l'événement (pas celle de la proposition).

## Activation / coupe-circuit

1. Migration : action `appliquer-migration`.
2. Variables : `BUFFER_CHANNEL_INSTAGRAM` ; `SNY_DIFFUSION_CANAUX = x,facebook,instagram` (Instagram n'est **jamais** actif implicitement).
3. Point de départ : action `initialiser-t0-instagram`.
4. **Retour arrière** : retirer `instagram` de `SNY_DIFFUSION_CANAUX` (Instagram seul), ou `SNY_DIFFUSION_ACTIVE=0` (tout le relais).

Aucun mode automatique : tout post exige un GO Instagram sur le visuel et la légende exacts.

## Bio du compte

La bio ne porte aujourd'hui **aucun lien** (vérifié le 16/11/2026). La légende ne dit donc ni « lien en bio » ni ne présente de lien cliquable : elle renvoie à `sousnosyeux.org` en clair. Quand un lien sera ajouté à la bio, une nouvelle formulation (gabarit `suivi_ig`) devra être arbitrée.

## Note de sécurité (livraison)

* **Finalité** : relayer sur Instagram, après GO humain, une information déjà approuvée et servie sur le site. Aucun modèle, aucune génération d'image.
* **Installation** : rien à installer ; le code tourne dans les workflows GitHub existants (`sny-telegram`, `sny-clics`) sur l'exécuteur `ubuntu-latest`. Polices : `scripts/assets/fonts/` (SIL OFL 1.1, paquets @fontsource épinglés, cf. `LICENCES.md`).
* **Démarrage / persistance** : aucun service, aucune tâche planifiée nouvelle, aucun lanceur. Le navigateur est lancé **en liste d'arguments** (`execFile`, jamais par un shell), sans profil persistant, dossier temporaire supprimé.
* **Réseau** : `api.github.com` (dépôt du média), `raw.githubusercontent.com` (relecture), `api.telegram.org`, `api.buffer.com`. Buffer et Telegram récupèrent l'image à l'URL publique.
* **Privilèges** : `contents: write` (déjà accordé à `sny-telegram` / `sny-clics`) pour la seule branche `instagram-media` ; le workflow manuel `sny-diffusion` reste en lecture, sauf son job d'essai `essai-instagram` (écriture, isolé). Aucun secret nouveau.
* **Données** : le dépôt est public ⇒ l'image l'est dès son dépôt (avant le GO). Elle ne contient que des informations déjà approuvées pour le site public ; aucun nom, aucun nombre d'enfants. Journaux : identifiants d'affaire, états, compteurs — ni texte, ni adresse, ni secret.
* **Revue sécurité** recommandée (écriture sur une branche du dépôt par un job qui traite des données éditoriales ; rendu par navigateur d'un texte issu de la base) — le texte est échappé et le navigateur ne charge aucune ressource externe.

## Preuves

`node scripts/qa/test-relais-instagram.mjs` (dans `npm run qa`) · `node scripts/essai-rendu-instagram.mjs [--heberger|--debordement]` (action `essai-instagram` du workflow `sny-diffusion` : navigateur, polices et hébergement public sur l'exécuteur réel, sans aucun post).
