# SNY — Diffusion sociale & mesure d'audience (10/11/2026)

Chaîne livrée : `Événement documenté → GO Telegram → page publique vérifiée → publication sociale automatique (Buffer) → mesure`.
**État : code livré, testé en simulation, DÉSACTIVÉ.** Aucune publication réelle n'a eu lieu ni n'a été simulée sur un compte public.
« Code livré » ≠ « dispositif activé » ≠ « trafic démontré » : seul le premier est vrai à ce jour.

## 1. Ce qui existe (et ce qui a été réutilisé)

| Besoin | Réutilisé tel quel |
|---|---|
| Point de décision humain | clic Telegram existant (`PUBLIER` / `VALIDER ET PUBLIER` / `VALIDATE` sur une évolution) |
| GO explicite | revue « `[Publication …] GO d'Adrien : « Telegram PUBLIER <id8> »` » (`publier-affaire.mjs`, `goPublication`) |
| Page réellement servie | `ecartsSite` (JSON `#cases-data` du site vs `data/cases.json`) |
| Retrait / blocage | `publication_status`, revues « retirer », `data/publication-holds.json` |
| Alertes | `prevenir()` (Telegram) |
| Mémoire | Neon (nouvelle table `diffusions_sociales`, migration 025, une seule) |

Ajouts (le plus petit changement couvrant le gap) :

- `scripts/diffuser-social.mjs` — orchestrateur (plan par défaut · `--ecrire` · `--verifier-connexion` · `--appliquer-migration` · `--etat`).
- `scripts/lib/diffusion-sociale.mjs` (éligibilité, messages, signature — pur) · `diffusion-flux.mjs` (réserver → créer → réconcilier → suivre → retirer) · `buffer.mjs` (client GraphQL, 0 dépendance).
- `supabase/migrations/025_diffusions_sociales.sql` · `.github/workflows/sny-diffusion.yml` (diagnostics manuels) · une étape `continue-on-error` dans `sny-telegram.yml` et `sny-clics.yml`.
- Ligne de portée dans le message d'approbation Telegram (§3). Aucun appel de modèle. Aucun nouveau moteur, dashboard ni raccourcisseur.

## 2. Événements éligibles (V1)

Diffusés **seulement** si TOUT est vrai (`evaluerEvenement`, silence au moindre doute) :
1. GO explicite **postérieur** à `SNY_DIFFUSION_DEPUIS`, **et** message d'approbation envoyé **après** cette date (donc porteur de la ligne de portée) ; une publication manuelle sans GO Telegram consigné ne diffuse rien.
2. Page réellement servie à l'identique (état, première source, synthèse d'état), affaire `publiée`, non gelée (HOLD), sans revue « retirer », avec coordonnées publiques.
3. Nouvelle affaire (type `new_case`) ou évolution judiciaire dont le statut **avance** (`case_update`) vers : enquête, mise en examen, procès, condamnation.
4. Source publiée il y a **moins de 7 jours** (la plus récente de la fiche ; pour une évolution, l'article de l'évolution).

**Volontairement hors automatisation** (décision éditoriale à prendre, jamais un défaut) : correction, source ajoutée, mise à jour technique ; **mobilisation / prise de parole** (« importante » est un jugement) ; **relaxe / non-lieu / classement** (finalité non établie par la presse, cf. POC-09) ; plainte seule ; statut « à qualifier ». Aucune classification automatique nouvelle.

## 3. Portée du GO (B4)

Le clic Telegram reste **l'unique** validation. Quand la diffusion est activée, les messages d'approbation portent la ligne :
« 📣 Ce GO / VALIDATE vaut aussi relais social strictement factuel … (X, Facebook), sans autre validation : seulement si la page est servie, la source a moins de 7 jours et rien n'est retiré. Annulable quelques minutes avant l'envoi ; pas de second GO par canal. »
(`porteeRelais`, ajoutée à `messagePublication`, au bouton « VALIDER ET PUBLIER » et à « NOUVELLE ÉVOLUTION » — uniquement si l'évolution est significative.) Désactivée ⇒ messages **inchangés**. Les approbations antérieures ne valent jamais autorisation rétroactive (condition 1).

## 4. Messages (déterministes, champs approuvés, sans modèle)

Établissement, commune, département, phrase d'état **identique à celle du site** (`web/src/lib/etat-wording.ts` : « Selon <média>, une enquête a été ouverte. » + rappel de présomption) et lien. Jamais : nom de la personne mise en cause, son rôle, nombre d'enfants, détail des faits (contrôle de contenu bloquant).
- **X** : texte court ≤ 280 (URL comptée 23), mention retirée avant de tronquer ; trop long ⇒ silence sur ce canal.
- **Facebook** (Page) : message plus détaillé + lien. **Instagram** : même texte sans lien présenté comme cliquable (« lien dans la bio »), visuel neutre existant `/og-sousnosyeux.png` (aucune photo), `schedulingType: automatic` uniquement.
- Lien : fiche approuvée si servie, sinon l'ancre stable `/#affaire-<id>`. UTM : `utm_source=x|facebook|instagram`, `utm_medium=social`, `utm_campaign=new_case|case_update`, `utm_content=<affaire>[-<statut>]`. Le canonical dépend du chemin seul (testé).

## 5. Idempotence et sécurité

- **Journal Neon** `diffusions_sociales`, clé `(event_key, canal)` : la ligne est **réservée avant** tout appel Buffer ; 3 passages concurrents ⇒ un seul `createPost` (testé).
- **Buffer n'a aucune clé d'idempotence** : réponse incertaine (timeout, 5xx, 429) ⇒ ligne `reserve` ; au passage suivant on **relit** Buffer (`posts`, signature = `utm_content`) avant toute répétition. Recréation uniquement si la lecture a réussi, n'a rien trouvé et que 15 min ont passé ; abandon alerté après 24 h.
- États distincts : `reserve` · `soumis` · `programme` · `envoye` (status `sent`) · **`verifie` (permalien distant relu)** · `annule` · `echec` · `retire_apres_envoi`.
- Posts **programmés à +15 min** (`customScheduled`, réglable 5–120) : fenêtre d'annulation réelle. Échecs isolés par canal. Aucun backfill : pas de GO postérieur à `SNY_DIFFUSION_DEPUIS` ⇒ pas d'événement ; sur les 64 affaires du stock, 0 éligible (testé).
- Secrets : `BUFFER_API_KEY` (secret GitHub) uniquement ; erreurs purgées de la clé ; logs publics = identifiants d'affaire, canaux, issues (testé).

## 6. Mise en service (actions Adrien) et désactivation

1. Compte Buffer (gratuit) → connecter le profil **X** et la **Page Facebook** (Instagram professionnel ensuite) → clé API : https://publish.buffer.com/settings/api.
2. GitHub → Settings → Secrets and variables → Actions : secret `BUFFER_API_KEY`.
3. Actions → **sny-diffusion** → `appliquer-migration`, puis `verifier-connexion` (sans variable : il affiche l'identifiant de l'organisation et ceux des canaux ; mettre ensuite en **Variables** `BUFFER_ORGANIZATION_ID`, `BUFFER_CHANNEL_X`, `BUFFER_CHANNEL_FACEBOOK`, puis relancer `verifier-connexion` : tout doit être ✅). Cette vérification est en lecture seule et **valide aussi la forme des requêtes GraphQL que la documentation ne permet pas de confirmer sans clé**.
4. Activer : variable `SNY_DIFFUSION_DEPUIS` = l'instant ISO UTC de la mise en service (ex. `2026-11-12T09:00:00Z`), **puis** `SNY_DIFFUSION_ACTIVE` = `1`. (Instagram : ajouter `BUFFER_CHANNEL_INSTAGRAM` et `SNY_DIFFUSION_CANAUX` = `x,facebook,instagram` après vérification du mode de publication automatique.)
5. **Désactiver** : `SNY_DIFFUSION_ACTIVE` = `0` (ou supprimer la variable). Effet immédiat au passage suivant ; le journal est conservé.

La première vraie publication partira d'une vraie nouveauté éligible ; aucune n'est simulée. Tant qu'elle n'est pas observée : « prêt et testé, publication réelle non encore observée ».

## 7. Retrait ou correction sensible après envoi (procédure manuelle)

Buffer **ne peut pas** supprimer un post déjà publié sur le réseau. Si une affaire est retirée ou gelée :
- posts non encore envoyés : annulés automatiquement, alerte Telegram « annulée avant envoi » ;
- posts déjà envoyés : alerte **URGENT** Telegram avec le lien de chaque post, journal `retire_apres_envoi`. Alors : (1) ouvrir le lien, supprimer le post depuis le compte du réseau (X : `…` → Supprimer ; Facebook : `…` → Déplacer dans la corbeille / Supprimer ; Instagram : `…` → Supprimer) ; (2) vérifier dans Buffer qu'aucun autre post de l'événement n'est programmé ; (3) noter la suppression dans `docs/industrialisation/JOURNAL_DECISIONS.md`. Délai visé : immédiat, le jour même.

## 8. Mesure (Lot A + C) et protocole J0 / J+7 / J+28

**Constat Cloudflare Web Analytics (10/11/2026, vérifié sur la production)** : le beacon est **absent** du HTML servi (`/`, `/methodologie/`, `/territoires/paris-11e/`, `www` → 301 ; aucun `static.cloudflareinsights.com`, aucun `data-cf-beacon`, `/cdn-cgi/rum` → 404). Web Analytics n'est donc **pas actif** sur ce site (l'en-tête `Cache-Control: public, max-age=0, must-revalidate` n'empêche pas l'injection ; seul `no-transform` l'empêcherait). Aucune donnée de visites n'existe : **pas de baseline possible aujourd'hui** (accès manquant : le tableau de bord Cloudflare exige une connexion que ni cette session ni le dépôt n'ont ; les métriques HTTP de la zone, qui incluent les robots, ne sont pas des visites mesurées et ne sont pas utilisées). Aucun code n'a été ajouté (zéro code si l'activation suffit ; pas de double beacon).

Activation (une fois, 2 minutes) : `https://dash.cloudflare.com/?to=/:account/web-analytics` → **Add a site** → hostname `sousnosyeux.org` → **Done** (injection automatique) → *Manage site* → choisir **Enable** (et **non** « Enable, excluding visitor data in the EU » : le public est français). Vérification : `curl -s https://sousnosyeux.org/ | grep -c cloudflareinsights` doit répondre ≥ 1 sous quelques minutes ; sinon utiliser « Enable with JS snippet installation » et me transmettre le jeton public du site pour un ajout d'une ligne dans `Layout.astro`. Les statistiques ne commencent qu'à l'activation : **J0 = jour d'activation**. Web Analytics est sans cookie ; vérifier que la page de mentions légales reste exacte sur ce point.

**Limites d'attribution (honnêtes)** : Cloudflare Web Analytics n'exploite pas les UTM (conservés comme repère des liens). L'attribution se lit dans les **référents** (`t.co`/`x.com`, `facebook.com`/`l.facebook.com`/`m.facebook.com`, `l.instagram.com`). Les applications mobiles masquent souvent le référent (visites « directes » sous-comptées) ; une légende Instagram n'est pas cliquable (seules les visites via le lien du profil existent) ; un référent n'est pas une conversion.

| Indicateur | Source | Relevé |
|---|---|---|
| Visites, pages vues | Cloudflare Web Analytics | J0 (activation), J+7, J+28 |
| Référents sociaux détectables | Cloudflare → Referrers | idem |
| Pages d'atterrissage | Cloudflare → Pages | idem |
| Événements éligibles | journal (`sny-diffusion` → `plan`) | idem |
| Posts publiés / échoués | journal (`sny-diffusion` → `etat`) | idem |
| Impressions, engagements | réseaux natifs / Buffer Analytics si disponible | idem |

Trame de comparaison (à remplir, sans valeur inventée ; aucun seuil fixé ici — à décider par Adrien avant J0) :

| Canal | Posts publiés | Visites référées (J+7 / J+28) | Visites / post | Impressions | Engagements | Reconduire ? |
|---|---|---|---|---|---|---|
| X | | | | | | |
| Facebook | | | | | | |
| Instagram | | | | | | |

## 9. Note de sécurité (politique IT/Sécurité)

- **Objet** : relayer sur X/Facebook/Instagram, via Buffer, des nouveautés déjà approuvées par l'éditeur et déjà publiques.
- **Installation** : aucune sur poste ; s'exécute dans les workflows GitHub Actions existants (runners `ubuntu-latest`). Aucun fichier de démarrage, aucune persistance cachée, aucun lanceur chaîné.
- **Au démarrage** : rien. Exécution à la demande des workflows existants (clic Telegram) et toutes les 30 min (filet `sny-clics`) ; inerte tant que `SNY_DIFFUSION_ACTIVE` ≠ `1`.
- **Réseau** : `api.buffer.com` (TLS, validation de certificat), `sousnosyeux.org`, `api.telegram.org`, Neon. Rien d'autre.
- **Privilèges** : jeton Buffer limité à l'organisation, secret GitHub ; écriture Neon sur une seule table ; aucune élévation.
- **Données personnelles** : aucune collectée ; textes composés de champs publics déjà approuvés ; journal sans donnée personnelle ni secret.
- **Revue Sécurité recommandée** avant l'activation : stockage du jeton Buffer, droits du jeton, publication automatique sur des comptes publics (impact réputationnel), traitement de données sensibles (affaires visant des mineurs).

## 10. Limites résiduelles

- **Écart technique** : la forme exacte de la requête `posts` (réconciliation) et du sous-objet `error` n'a pas pu être confirmée sans clé ; `verifier-connexion` la teste avant toute activation (échec ⇒ pas d'activation). Aucun test sur un compte réel, par consigne.
- **Accès extérieur manquant** : comptes Buffer/X/Facebook/Instagram, clé API, identifiants de canaux ; connexion au tableau de bord Cloudflare ; application de la migration 025 (secret Neon uniquement dans GitHub).
- **Plateforme** : Buffer ne supprime pas un post publié ; Cloudflare Web Analytics sans UTM ; Instagram sans lien cliquable en légende ; l'offre gratuite plafonne à 10 posts programmés par canal (posts à +15 min : sans effet pratique).
- **Décisions éditoriales ultérieures** : diffusion des mobilisations / prises de parole ; relaxe / classement ; seuils de décision sur la valeur de chaque canal ; mise à jour de `CLAUDE.md` (non modifié ici, sur ton go).
