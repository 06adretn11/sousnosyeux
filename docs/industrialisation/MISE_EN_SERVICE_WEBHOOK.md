# Mise en service — réception des clics Telegram par webhook

Objectif : un clic reçoit un accusé en **moins d'une seconde**, puis est enregistré et appliqué dans la minute, sans intervention.
Choix retenu et pourquoi (le cron ne donne pas d'accusé instantané ; il faudrait en plus un jeton GitHub, comme ici) :

| Option | Accusé immédiat | Application | Verdict |
|---|---|---|---|
| Cron Cloudflare → `sny-clics` (10 min) | non (jusqu'à 10 min) | ≤ 10 min | écartée : ne répond pas à l'exigence |
| Webhook Telegram → Worker `sny-telegram` → workflow `sny-telegram.yml` | oui (< 1 s) | ≈ 30–60 s (démarrage du runner) | **retenue** |

Le Worker (`workers/telegram-webhook/`) **n'a aucun accès à la base** : il authentifie (secret du webhook, temps constant), vérifie que
le clic vient de l'éditeur dans son chat, déclenche le workflow, puis acquitte (« Décision reçue ✓ » seulement si le déclenchement a
réussi). Toute la logique Neon reste dans les scripts existants (`telegram-v0.mjs traiter`, `appliquer-*`).

## Prérequis humains (secrets : jamais dans le dépôt, jamais dans une conversation)
1. **Jeton GitHub à portée minimale** : *Settings → Developer settings → Fine-grained tokens* ; dépôt `06adretn11/sousnosyeux` seulement ;
   permission **Actions : Read and write** et rien d'autre ; durée courte (90 jours), à renouveler.
2. **Secret du webhook** : une chaîne aléatoire de 32+ caractères `[A-Za-z0-9_-]`, par exemple `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## Déploiement du Worker (compte Cloudflare existant)
```bash
cd workers/telegram-webhook
npx wrangler login
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_ALLOWED_USER_ID
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```
L'URL est de la forme `https://sny-telegram.<compte>.workers.dev`.

## Bascule (modifie la configuration du bot — après GO explicite)
Telegram n'autorise **qu'un seul mode** : dès que le webhook est posé, `getUpdates` ne fonctionne plus (`recevoir` le détecte et ne lit rien).
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://sny-telegram.<compte>.workers.dev" -d "secret_token=<SECRET>" -d 'allowed_updates=["callback_query"]'
```
Vérification : `node scripts/telegram-v0.mjs diagnostic` (webhook : ACTIF, 0 en attente) puis `node scripts/telegram-v0.mjs test-clic` et un clic.

## Retour arrière (immédiat)
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```
`sny-clics` (relève périodique) reprend alors seul la lecture des clics ; rien d'autre à défaire. Les clics en attente chez Telegram sont conservés 24 h.

## Garanties
- idempotence : une mise à jour déjà journalisée n'est jamais rejouée (Telegram réessaie un webhook non acquitté) ; la clause `decision is null` garde le second clic ;
- un seul consommateur à la fois : même groupe de concurrence (`sny-telegram`) pour les workflows, webhook exclusif de `getUpdates` ;
- si la transmission à GitHub échoue : le Worker répond 500 (Telegram réessaie) et l'accusé dit « Non transmise », jamais un faux « reçue » ;
- le filet `sny-clics` applique et projette toute décision déjà enregistrée, même si le webhook est indisponible.

## Neon → site (affaire déjà publique)
Après application, `publier-evolutions.mjs` projette **uniquement** les affaires déjà `publiées` dont une décision de l'éditeur vient d'être
appliquée (`project-public.mjs --modifier`, qui respecte les HOLD et n'absorbe aucun autre retard) ; QA complète ; commit de `data/cases.json` ;
build Cloudflare existant ; `verifier-site.mjs` relit la **page publique** et confirme sur Telegram. Une NOUVELLE affaire n'est jamais publiée
ici : `publier-affaire.mjs --go` reste un acte humain distinct (une candidate « en attente de preuves » est refusée par ce garde-fou).
