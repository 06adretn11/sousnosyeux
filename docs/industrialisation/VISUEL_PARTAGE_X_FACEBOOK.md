# Visuel commun X · Facebook · Instagram et texte X court (19/11/2026)

Mode REVIEW inchangé : aucune publication sans GO Telegram, GO distinct par réseau, T0 et exclusion du stock inchangés, aucun interrupteur modifié.

## Ce qui change (et seulement cela)

| Réseau | Texte | Image |
|---|---|---|
| Instagram | inchangé | inchangée (même gabarit `ig-v1`) |
| Facebook | **strictement inchangé** (liens compris) | le visuel commun, image native — il remplace l'aperçu du lien, qui n'est plus joint (le lien reste dans le texte) |
| X | **court** : `lieu · fait (selon média). réserve.` puis `Média : URL de l'article` — plus de second lien « Suivi » | le visuel commun, image native ; l'URL de l'article reste dans le texte |

Le visuel est celui du générateur Instagram (`instagram-visuel.mjs`), rendu **une fois** par événement et version éditoriale : même spécification ⇒ même fichier, même URL (branche `instagram-media`, adressée par le contenu). Une proposition qui arrive après une autre sur le même événement **réutilise** le fichier déjà hébergé et relu (`produireOuReutiliser`) ; sinon elle le rend.

## Fichiers touchés

- `social-editorial.mjs` — pied X `{média} : {url}` (le pied compact reste le repli) ; fait qualifié (lieu + étape datée) préféré pour X ; **meilleure tentative** conservée quand rien ne tient ; `poidsX` (comptage pondéré X : URL et noms de domaine nus = 23, emoji et « … » = 2) ; `longueurX` (Facebook) inchangé.
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

## Exemples X (dry-run, comptage pondéré)

| Cas | Compteur | Texte |
|---|---|---|
| Montpellier (nouvelle affaire) | 247/280 | `Montpellier · école maternelle … : enquête ouverte pour soupçons d'agressions sexuelles (selon Actu.fr). L’ouverture d’une enquête ne vaut pas culpabilité.` + `Actu.fr : <URL>` |
| Paris 7e (évolution) | 210/280 | `Paris 7e · École maternelle Saint-Dominique : mise en examen le 22 mai 2026 pour des faits à caractère sexuel (selon franceinfo). La mise en examen ne vaut pas culpabilité.` + `franceinfo : <URL>` |
| Rezé | 174/280 | `Rezé · École maternelle du Chêne-Creux : condamnation prononcée pour douze agressions sexuelles (selon ici). Caractère définitif non documenté.` + `ici : <URL>` |
| Rezé, parole d'une mère | **380/280** | meilleure tentative montrée, non envoyable (dépasse de 100) ; Facebook proposé |
| Bordeaux FR-2026-0113 | — | source liée lue en partie : visuel non composable, aucun canal proposé |

## Pare-feu éditorial (19/11/2026, décision d'Adrien)

Par **affaire, par canal et par jour (Europe/Paris)** : au plus **1 post de changement judiciaire** (nouvelle affaire, évolution de statut, étape de procédure) et **1 post de prise de parole** (famille ou pouvoir public) — 2 posts maximum, sur deux thèmes différents. Les deux nombres sont les seuls réglages (`PARE_FEU_PAR_JOUR`, `relais-social.mjs`) : la règle pourra évoluer.

- **Thème** : une clé d'événement `case_update|<affaire>|parole-…` est une prise de parole ; tout le reste est un changement judiciaire.
- **Compte** : les lignes du journal de diffusion (soumis, programmé, envoyé…) de l'affaire, pour le même canal et le même thème, le jour de Paris courant. Une ligne annulée ou en échec n'est pas un post. Les lignes du même événement (reprise, complément, remplaçante) ne comptent jamais contre lui-même.
- **Deux points d'application** : à la **proposition** (un canal déjà servi n'est pas proposé ; silence journalisé) et à l'**exécution du GO** (deux GO le même jour : le second est refusé, aucun post, alerte « GO social non exécuté — pare-feu », proposition conservée avec son motif). Les propositions ouvertes ne comptent pas : seuls les posts comptent.
- Instagram est soumis à la même règle (`relais-instagram.mjs`).

## Reproposition ciblée d'une proposition antérieure au visuel

Une proposition X / Facebook créée avant le visuel commun ne peut plus être exécutée (GO périmé). `data/relais-reproposer.json` nomme, un par un, les événements dont la proposition **jamais décidée** doit être remplacée : l'ancienne est refermée **sans aucune décision** (résolution « remplacee ») et une proposition avec visuel (clé `<événement>#visuel:<id>`) est envoyée, avec la mention « Remplace la proposition … ». Un clic sur l'ancienne n'enregistre rien. Un événement absent de la liste garde sa proposition, qui expire d'elle-même.

## Limites connues

- Le renvoi vers SNY n'est plus un lien dans le texte X (la signature `sousnosyeux.org` est sur le visuel). Le contrôle « lien SNY présent » ne s'applique plus à X (il reste pour Facebook et Instagram).
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
