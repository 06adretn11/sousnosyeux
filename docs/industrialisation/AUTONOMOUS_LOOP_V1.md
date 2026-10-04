# AUTONOMOUS LOOP V1 — note de sécurité et d'exploitation

**Objet.** Exécuter sans poste humain : veille → maintenance → Telegram → clics → apply des changements d'état simples.

**Où ça tourne.** GitHub Actions, deux workflows (`sny-cycle` toutes les 4 h, `sny-clics` toutes les 30 min). Code et workflows vivent sur `main` (GitHub n'exécute un `schedule` que depuis la branche par défaut). La sortie de la veille (titres, URL, erreurs brutes) n'est pas affichée : dépôt public, logs publics.

**Ce qui s'exécute.** `watch-updates` (Google News RSS), `maintenance-cycle` (Bing + OpenRouter), `telegram-v0 notifier | recevoir`, `appliquer-decisions --generique`. Rien au démarrage d'un poste, aucune persistance cachée.

**Réseau.** Sortant seulement : Neon (HTTPS), api.telegram.org, openrouter.ai, Google News, Bing, sites de presse. Aucun port entrant, aucun webhook.

**Secrets (GitHub → Settings → Secrets and variables → Actions).** `NEON_DATABASE_URL`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`. Aucun secret dans Git ni dans les logs. Le bot est dédié à SNY (aucun secret QGMC).

**Privilèges.** `contents: read` uniquement. Écrit dans Neon : `state_proposals`, `case_checks`, `telegram_envois`, et — uniquement pour un ACCEPT humain `AUTO_APPLICABLE` — `case_events` et `cases.statut_judiciaire`. **Aucune publication** (ni `cases.json`, ni Cloudflare).

**Données personnelles.** Les messages Telegram citent la presse (peuvent contenir un nom cité par la source) ; ils ne vont qu'au chat autorisé. Les logs ne contiennent que des identifiants de proposition. Dépôt public : ne jamais ajouter de `console.log` de contenu d'article.

**Contrôles.** Un clic n'est accepté que de l'utilisateur ET du chat autorisés ; décision idempotente (`decision is null`) ; envoi idempotent (`telegram_envois`) ; apply idempotent (`applied_event_id`, identité d'événement).

**Limites connues.** `schedule` GitHub : retard possible, désactivation après 60 jours sans activité sur un dépôt public. Actions épinglées par version majeure (pas par SHA). Revue par l'équipe sécurité recommandée avant tout élargissement (publication automatique, autres canaux).
