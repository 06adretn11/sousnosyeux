# Visuel commun X · Facebook · Instagram et texte X court (19/11/2026)

Mode REVIEW inchangé : aucune publication sans GO Telegram, GO distinct par réseau, T0 et exclusion du stock inchangés, aucun interrupteur modifié.

## Ce qui change (et seulement cela)

| Réseau | Texte | Image |
|---|---|---|
| Instagram | inchangé | inchangée (même gabarit `ig-v1`) |
| Facebook | **strictement inchangé** (liens compris) | le visuel commun, image native — il remplace l'aperçu du lien, qui n'est plus joint (le lien reste dans le texte) |
| X | **court** : fait + réserve, `Source : média`, adresse de l'article, `A suivre sur SNY : fiche` (voir « Texte X ») | le visuel commun, image native ; l'URL de l'article reste dans le texte |

Le visuel est celui du générateur Instagram (`instagram-visuel.mjs`), rendu **une fois** par événement et version éditoriale : même spécification ⇒ même fichier, même URL (branche `instagram-media`, adressée par le contenu). Une proposition qui arrive après une autre sur le même événement **réutilise** le fichier déjà hébergé et relu (`produireOuReutiliser`) ; sinon elle le rend.

## Fichiers touchés

- `social-editorial.mjs` — pied X `Source : {média}` + adresse + `A suivre sur SNY : {lien}` (pied compact, puis sans renvoi SNY, en repli) ; fait qualifié (lieu + étape datée) préféré pour X ; **meilleure tentative** conservée quand rien ne tient ; `poidsX` (comptage pondéré X : URL et noms de domaine nus = 23, emoji et « … » = 2) ; `longueurX` (Facebook) inchangé.
- `relais-instagram.mjs` — `visuelPartage`, `recontroleVisuel`, `produireOuReutiliser`, `texteAlternatif` ; plafond d'image 5 Mo (X via Buffer) dans `controlerImageDistante`.
- `relais-social.mjs` — le visuel entre dans l'**empreinte de chaque canal** ; photo Telegram avant la proposition ; recontrôle du visuel avant l'envoi ; image + texte alternatif transmis au flux.
- `buffer.mjs` / `diffusion-flux.mjs` — `assets[].image.url` + `image.metadata.altText` (champs vérifiés dans le schéma Buffer, contrôlés par `--sonder-api`) ; Facebook : pas de `linkAttachment` quand une image est jointe.
- `diffuser-social.mjs` — injecte le rendu / hébergement / photo Telegram dans le cycle X · Facebook (déjà injectés pour Instagram).

## Règles

- **Aucun envoi sans image** : visuel non composable, rendu impossible, hébergement refusé ⇒ aucun canal n'est proposé (silence journalisé, sans texte ni adresse), nouvel essai au passage suivant.
- **Visuel = composition validée** : il dérive de la légende Instagram, donc de la même matière approuvée (article lu en entier, citations exactes, réserves). Une source liée lue en partie bloque cette composition ⇒ ni X ni Facebook ne partent (cas FR-2026-0113). Une image ne réintroduit jamais un contenu refusé.
- **Un problème propre à X ne bloque ni Facebook ni Instagram** : X trop long ⇒ Facebook reste proposé avec le visuel ; X reste visible comme *meilleure tentative, non envoyable* (texte, compteur, dépassement) ; aucun bouton X.
- **Le GO couvre texte + visuel** : adresse, empreinte SHA-256 du contenu, spécification et gabarit sont dans l'empreinte de chaque canal. Avant l'envoi : spécification recomposée identique, image relue à son adresse publique (HTTP 200, `image/png`, 1080×1350, ≤ 5 Mo, mêmes octets). Sinon : zéro envoi, alerte « GO social non exécuté », proposition **conservée** (résolue `obsolete:` / `bloque:`), jamais effacée. Une proposition créée avant ce changement (sans visuel validé) est périmée à l'envoi.
- **Texte alternatif** : dérivé de la spécification validée (lieu, libellé, faits, réserves, sources ; contexte ajouté s'il tient), sans appel de modèle, ≤ 1000 caractères ; trop long ⇒ aucun plutôt que coupé. Appliqué à X et Facebook ; Instagram garde son envoi actuel.

## Preuves

- `node scripts/qa/test-relais-social.mjs` section G (G1–G15) et `test-relais-instagram.mjs` (2b : un seul rendu, même URL sur X, Facebook, Instagram) — dans `npm run qa`.
- `scripts/qa/fixtures/facebook-textes-figes.json` : textes Facebook composés par `main` **avant** ce changement ; comparés octet à octet au texte proposé ET au texte posté.
- Comparaison hors QA (75 événements des fiches approuvées, `main` e538892 contre ce code) : 35 textes Facebook composés, **35 identiques**, 40 blocages identiques ; X : 19 → 21 composables, aucun perdu.
- Rendu réel (Chrome sans interface) de 4 scénarios, 161–166 Ko, 1080×1350 : voir `visuel-partage/apercu-telephone-390.png` (**aperçu SIMULÉ à 390 px de large, pas une publication native**).

## Exemples X (dry-run local, comptage pondéré, format du 19/11)

| Cas | Compteur | Forme | Texte |
|---|---|---|---|
| Paris 7e (évolution) | 259/280 | complet | `Paris 7e · École maternelle Saint-Dominique : mise en examen le 22 mai 2026 pour des faits à caractère sexuel (selon franceinfo). La mise en examen ne vaut pas culpabilité.` / `Source : franceinfo` / `<URL>` / `A suivre sur SNY : <fiche>` |
| Montpellier (nouvelle affaire) | 263/280 | pied compact (la ligne « Source : » ne tient pas) | `Montpellier · école maternelle … : enquête ouverte pour soupçons d'agressions sexuelles (selon Actu.fr). L’ouverture d’une enquête ne vaut pas culpabilité.` / `<URL>` / `A suivre sur SNY : <fiche>` |
| Bordeaux FR-2026-0113 | 245/280 | sans renvoi SNY | composable pour X seul, mais Facebook et Instagram sont bloqués (source liée lue en partie) ⇒ le visuel n'est pas composable, aucun canal proposé |
| Rots, parole d'une mère | > 280 | — | meilleure tentative montrée, non envoyable ; Facebook et Instagram proposés |
| Rezé, étape « 8 ans requis le 18 novembre, délibéré le 5 janvier » | le texte proposé par Adrien pèse **297/280** (208 pour le fait + 89 de pied : « Source : Ouest France », 2 adresses à 23, « A suivre sur SNY : ») | — | le composeur n'écrit pas de phrase libre : il choisit parmi les phrases approuvées ; si aucune version ne tient, la meilleure tentative est montrée avec son compteur |

## Pare-feu éditorial (19/11/2026, décision d'Adrien)

Par **affaire, par canal et par jour (Europe/Paris)** : au plus **1 post de changement judiciaire** (nouvelle affaire, évolution de statut, étape de procédure) et **1 post de prise de parole** (famille ou pouvoir public) — 2 posts maximum, sur deux thèmes différents. Les deux nombres sont les seuls réglages (`PARE_FEU_PAR_JOUR`, `relais-social.mjs`) : la règle pourra évoluer.

- **Thème** : une clé d'événement `case_update|<affaire>|parole-…` est une prise de parole ; tout le reste est un changement judiciaire.
- **Compte** : les lignes du journal de diffusion (soumis, programmé, envoyé…) de l'affaire, pour le même canal et le même thème, le jour de Paris courant. Une ligne annulée ou en échec n'est pas un post. Les lignes du même événement (reprise, complément, remplaçante) ne comptent jamais contre lui-même.
- **Deux points d'application** : à la **proposition** (un canal déjà servi n'est pas proposé ; silence journalisé) et à l'**exécution du GO** (deux GO le même jour : le second est refusé, aucun post, alerte « GO social non exécuté — pare-feu », proposition conservée avec son motif). Les propositions ouvertes ne comptent pas : seuls les posts comptent.
- Instagram est soumis à la même règle (`relais-instagram.mjs`).

## Reproposition ciblée d'une proposition antérieure au visuel

Une proposition X / Facebook créée avant le visuel commun ne peut plus être exécutée (GO périmé). `data/relais-reproposer.json` nomme, un par un, les événements dont la proposition **jamais décidée** doit être remplacée : l'ancienne est refermée **sans aucune décision** (résolution « remplacee ») et une proposition avec visuel (clé `<événement>#visuel:<id>`) est envoyée, avec la mention « Remplace la proposition … ». Un clic sur l'ancienne n'enregistre rien. Un événement absent de la liste garde sa proposition, qui expire d'elle-même.

## Un seul message par événement (19/11/2026, décision d'Adrien)

Avant : une proposition X / Facebook, une proposition Instagram, des compléments, des remplaçantes — plusieurs messages pour un même événement. Maintenant, **UN envoi** :

1. **le visuel** (une seule image, celle du générateur Instagram, jointe aux trois réseaux) ;
2. **un message** : contrôles, puis les textes EXACTS de **Facebook**, **Instagram** et **X** (Instagram n'y figure que s'il est actif et si l'événement est dans son périmètre — sinon il garde son propre message) ;
3. **une ligne de boutons** : « GO Facebook · GO Instagram · GO X ». Chaque bouton ne vaut que pour SON réseau, sur CE texte et CE visuel. Plus de bouton « Refuser » ni « X + Facebook » : **l'absence de GO vaut refus** (la proposition expire au bout de 48 h, rien n'est conservé). Si le message dépasse la limite de Telegram, le texte passe sur deux messages et les boutons sont sur le dernier.

Mécanique : la proposition X / Facebook et la proposition Instagram restent deux lignes distinctes (chacune garde son contrôle, son GO et son exécution), mais elles sont créées ensemble et partagent le MÊME message Telegram. Les GO s'**additionnent** sur la même proposition (`ajouterGo`) : GO Facebook, puis plus tard GO X, les deux comptent ; un clic rejoué sur un réseau déjà autorisé est sans effet ; un GO après l'expiration, après un refus ou sur un GO périmé est refusé. Le mécanisme des « compléments » (GO partiel puis nouvelle proposition) est **supprimé** : le réseau sans GO reste simplement sur le message jusqu'à son expiration. Les anciens boutons (« X + Facebook », « Refuser ») des messages déjà envoyés fonctionnent encore.

### Texte X (format validé)

```
<lieu : fait (selon média). réserve.>
Source : <média>
<adresse de l'article>
A suivre sur SNY : <fiche>
```

Un seul retour à la ligne entre les blocs. Trois passes, du plus complet au plus court, sans jamais raccourcir la qualification ni retirer la réserve : (1) format complet ; (2) pied compact — la ligne « Source : <média> » saute (le média reste nommé dans la phrase « selon … ») ; (3) en dernier recours, sans la ligne « A suivre sur SNY » (le visuel porte `sousnosyeux.org`) — le message l'indique. Rien ne tient en 280 (comptage pondéré, URL = 23) ⇒ X est **bloqué** et sa meilleure tentative est montrée avec son compteur.

### Reproposition ciblée

`data/relais-reproposer.json` nomme les événements dont **toutes** les propositions ouvertes et jamais décidées (X / Facebook et Instagram) sont refermées sans décision (« remplacee ») et remplacées par une proposition commune (clé `<événement>#commun:<id>`), avec la mention « Remplace les propositions … ». S'il existe déjà une décision sur l'événement, rien n'est reproposé.

## Format X standard des prises de parole (19/11/2026)

Pour toute prise de parole (famille, pouvoir public) autre qu'une création ou une mise à jour de fiche :

```
<commune> · <lieu> : <acteur> évoque <évocation>. <réserve judiciaire>
Source : <média>
<adresse de l'article>
A suivre sur SNY : <fiche>
```

Exemple (Rots, 253/280) : `Rots · centre de loisirs : une mère d’enfant concerné évoque des signalements antérieurs à la plainte. L’ouverture d’une enquête ne vaut pas culpabilité.` / `Source : Actu.fr` / `<URL>` / `A suivre sur SNY : <fiche>`.

- **La citation n'est pas dans le texte** : elle est sur le visuel. Le début du message n'est pas chargé ; l'attribution est la ligne « Source : média ».
- **« Évoque … » est une phrase approuvée par l'éditeur pour UNE citation exacte** (`data/evocations-paroles.json` : affaire, citation, évocation, éditeur, date). La machine ne paraphrase jamais ; une évocation approuvée pour une autre citation, ou sans éditeur, n'est jamais utilisée. Sans entrée, X garde la citation entière (même mise en page) et reste bloqué si elle ne tient pas en 280. **Pour chaque nouvelle prise de parole, ajouter l'entrée correspondante (une ligne) pour obtenir le format standard.**
- Le lieu est l'établissement sans « de <commune> » final (« centre de loisirs de Rots » → « centre de loisirs ») ; l'acteur passe en minuscule s'il commence par « Un / Une ». Facebook et Instagram sont inchangés.
- **X seul** : pour un événement nommé dans `data/relais-reproposer.json` dont la proposition commune est partie sans X (non publiable à l'époque), une proposition « X seul » (clé `<événement>#x:<empreinte>`, un bouton « GO X », même visuel) est faite dès que la rédaction X devient publiable. Jamais rétroactive pour un événement non nommé.

## Limites connues

- X : la ligne « A suivre sur SNY » saute en dernier recours (format complet > 280) ; le contrôle « lien SNY présent » ne s'applique donc pas à X (il reste pour Facebook et Instagram).
- Une image servie de façon intermittente après le GO résout le GO en « bloqué » (comme pour Instagram) : un nouveau cycle ne repropose pas l'événement ; à reprendre à la main si besoin.
- La carte est dense : au plus petit corps toléré (0,73) les sources font ~7 px à 390 px de large. Gabarit non modifié : un changement de mise en page invaliderait les GO Instagram en cours (`GABARIT_VISUEL`).
- Comptage X : Buffer applique « X's own weighted count » ; le compteur SNY est prudent (domaines nus comptés 23). Aucune publication réelle n'a été faite pour vérifier le rendu natif sur X / Facebook.

## Note de sécurité (livraison)

- **Finalité** : joindre aux posts X / Facebook, après GO humain, le visuel déjà utilisé pour Instagram ; raccourcir le texte X. Aucun modèle, aucune génération d'image.
- **Installation / démarrage** : rien de nouveau (code exécuté par les workflows `sny-telegram` et `sny-clics`) ; aucune tâche planifiée, aucun service.
- **Réseau** : inchangé (`api.github.com`, `raw.githubusercontent.com`, `api.telegram.org`, `api.buffer.com`).
- **Privilèges** : inchangés (`contents: write` déjà accordé, branche `instagram-media` seulement). Aucun secret nouveau.
- **Données** : le dépôt est public ⇒ l'image l'est dès son dépôt (avant le GO), comme pour Instagram ; elle ne contient que des informations déjà approuvées pour le site.
- Revue sécurité déjà recommandée pour Instagram (écriture sur une branche par un job traitant du contenu éditorial) ; cette évolution l'étend à deux canaux sans nouveau privilège.
