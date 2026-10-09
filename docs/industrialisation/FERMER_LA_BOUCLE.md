# Fermer la boucle — Discovery / Maintenance / Décision / Mémoire / Publication

Mission : combler les écarts constatés dans les runs des 8 et 9 octobre 2026, en réutilisant l'existant.
Ce document est versionné dans un dépôt **public** : il décrit les mécanismes et les cas par leur nature, sans nommer d'affaire
encore candidate. Les rejeux sur données réelles (lecture seule) ont été faits en local ; leurs sorties ne sont pas versionnées.

## 1. Cartographie (état constaté sur `main`, 33ea7ec)

`Source → Signal → Affaire identifiée → Proposition → Telegram → Décision → Neon → Événement → Projection publique`

| Transition | État | Constat |
|---|---|---|
| Source → Signal | fonctionne | Google News + Bing (URL éditeur directes). Bing est bloqué depuis un poste d'entreprise, pas en CI. |
| Signal → Affaire identifiée | **cassée dans deux cas** | « même commune » affirmé sans comparer au signal ; source historique redirigée prise pour une preuve. |
| Affaire identifiée → Proposition | conditionnelle | un rapprochement faible partait en `ATTACH` ; une affaire voisine sortait sans ses sources. |
| Proposition → Telegram | fonctionne | `notifier` / `notifier-nouvelles`. Un même fait déjà consigné redéclenchait une demande (date « ce mardi » non écrite). |
| Telegram → Décision | **non démontré** | 43 passages CI, aucun clic jamais reçu (voir §3). Un clic dont le traitement échouait était confirmé puis perdu. |
| Décision → Neon (application) | conditionnelle | `appliquer-decisions --generique` : uniquement `STATE_CHANGE` AUTO_APPLICABLE ; rien pour une mesure d'institution ; blocages muets. |
| Neon → Événement | fonctionne | `case_events` append-only ; identité de fait = (affaire, type, date, état). |
| Événement → Projection publique | manuelle (voulu) | `project-public.mjs` + `publier-affaire.mjs` (GO explicite) puis push sur `main`. Non automatisé, par doctrine. |

## 2. Écarts, causes, corrections

| Écart | Cause (démontrée ou hypothèse) | Correction minimale | Risque |
|---|---|---|---|
| Rapprochement d'un signal d'un département avec une affaire d'un autre | **Démontrée.** `pourquoi = ['même commune : ' + k.commune]` écrit la commune de l'AFFAIRE sans la comparer à celle du SIGNAL ; le résolveur admet « commune présente dans les 900 premiers caractères » (un menu « édition de <ville> » suffit). | `rapprochement-garde.mjs` : `niveauGeo` (ok / faible / bloquant) appliqué à la cible ET aux voisins ; contradiction forte → affaire écartée. Même garde **à l'application** (une proposition déjà envoyée ne peut plus écrire). | Faux blocage d'une commune voisine : exclu (même département → « faible », l'humain tranche). |
| Sources historiques d'une affaire présentées comme preuves alors qu'elles redirigent vers un autre article | **Démontrée.** Les deux URL redirigent vers des articles sans rapport ; la commune figurait pourtant dans la page (navigation). | `sourceCoherente` : redirection vers un autre article, commune absente (mots entiers), thème absent → refusée, lien masqué et compté. | Un faux « non vérifiable » : la source est masquée, jamais supprimée. |
| Rapprochement « incertain » sans éléments de comparaison | Le message ne montrait ni les sources ni l'état de l'affaire voisine. | Message comparatif NOUVEAU SIGNAL / AFFAIRE EXISTANTE / ANALYSE / DÉCISION ; boutons RAPPROCHER, CRÉER, REVIEW, REJECT ; le choix est enregistré (`action`). | Migration 019 requise : sinon le message n'est pas envoyé (fail closed). |
| Un même fait, deux demandes d'arbitrage | **Démontrée.** `evenementDejaValide` exigeait une date de fait écrite des deux côtés ; « condamné ce mardi » n'en a pas. | Fenêtre de publication [0, +3 j], un seul événement validé dans la fenêtre (jamais de fusion de deux faits possibles) ; même garde à l'envoi (`verifierFaitInedit`) et à l'application (preuve rattachée à l'événement, sans transition, valable sous HOLD). | Deux faits distincts le même jour : on ne tranche pas (la proposition est conservée). |
| Réaction ou mesure d'une institution perdue | Le contrat de maintenance ne porte que l'état judiciaire. | `evenement-institutionnel.mjs` : vocabulaire fermé × annoncée/réalisée, libellé public tiré d'une table (jamais de texte libre) ; décision Telegram ; événement `réponse_institutionnelle` / `suspension` avec `realisation` ; **aucune** transition. | « réalisée » seulement sur verbe d'accomplissement explicite sans marqueur d'annonce ; au moindre doute « annoncée ». |
| Un clic dont le traitement échoue est perdu | **Démontrée** (relecture du code) : erreur capturée puis offset avancé. | Offset confirmé seulement jusqu'au dernier clic traité ; rejeu au passage suivant, abandon journalisé après 3 essais. | Un clic empoisonné bloque la file au plus 3 passages. |
| « 0 clic traité » inexplicable | **Hypothèse, non tranchée** (§3). | Journal `telegram_journal` (passages, clics, échecs), commande `diagnostic`, test contrôlé `test-clic`. | Aucun contenu éditorial dans le journal. |
| Décision enregistrée ≠ appliquée ≠ publiée, sans retour | Accusé unique « Décision enregistrée ». | Accusé explicite + message « Appliqué en base » + alerte unique « NON appliquée » avec la raison ; `etat-decisions.mjs`. | — |

## 3. Pourquoi les clics ne sont pas récupérés — ce qui est établi, ce qui ne l'est pas

Établi (lectures seules, 09/10/2026) :
- 43 runs `sny-clics` / `sny-cycle` / `sny-discovery` du 05 au 09/10 : **tous** répondent « 0 clic traité » ; aucun clic n'est jamais passé en CI (les décisions antérieures venaient d'un `poll` local).
- Telegram : aucun webhook, `pending_update_count = 0`, aucun `getUpdates` concurrent trouvé (aucun processus local, pas de tâche planifiée Telegram ; la tâche « SNY-Observatoire » ne touche pas Telegram).
- Le bot de la machine locale est `@sousnosyeux_bot` ; le bot utilisé par les secrets GitHub **n'a pas pu être vérifié** (secrets illisibles par conception).
- Les passages CI s'espacent de 4 à 6 h (GitHub perd la majorité des déclenchements `schedule` de ce dépôt) ; le planning à 30 min n'est donc pas tenu.
- Toutes les décisions envoyées ces 8-9 octobre (Maintenance et Discovery) sont sans décision en base : le problème n'est pas propre à un message.

Non établi : pourquoi Telegram n'a rien en file alors que des clics sont rapportés. Hypothèses, par ordre de plausibilité :
1. les clics sont donnés sur des messages **sans bouton** (information) ou sur les liens « Ouvrir l'article » ;
2. le bot des secrets GitHub n'est pas celui qui a envoyé le message cliqué ;
3. un consommateur extérieur à cette machine lit la file (non vérifiable d'ici).

**Aucune de ces hypothèses n'est conclue sans preuve.** Le journal et le test contrôlé servent à trancher :
`telegram_journal.details.bot` donne le bot réellement interrogé par la CI ; `pending_avant` donne ce que Telegram a en file à chaque passage.

### Test contrôlé (action humaine requise : un clic)
```
node scripts/telegram-v0.mjs test-clic     # envoie UN message avec un bouton « 🧪 Je clique » (aucune donnée éditoriale)
# → l'éditeur clique sur ce bouton dans Telegram
node scripts/telegram-v0.mjs recevoir      # ou attendre/lancer sny-clics : le clic est retrouvé, accusé « Test reçu »
node scripts/telegram-v0.mjs diagnostic    # journal : test_envoye puis test_recu, bot, clics en attente
```
Critère : la ligne `test_recu` existe une seule fois et le message « Test reçu » est arrivé. Si `recevoir` (poste local) trouve le clic mais pas la CI :
le bot des secrets GitHub est différent (hypothèse 2). Si aucun des deux ne le trouve : Telegram ne le livre pas à ce bot (hypothèse 1 ou 3).

### Latence : correction minimale ou réception événementielle ?
| Option | Latence | Coût / risque | Verdict |
|---|---|---|---|
| Existant corrigé (ce lot) | 30 min à plusieurs heures (GitHub saute des déclenchements) | aucune infra nouvelle | suffisant pour fiabiliser, pas pour l'immédiateté |
| Webhook Telegram → Cloudflare Worker → Neon | secondes ; accusé instantané | un Worker + 2 secrets ; `setWebhook` **désactive** `getUpdates` (la CI ne recevrait plus rien) | recommandé SI le test prouve que les clics arrivent à Telegram mais pas à la CI |
| Cron Worker (1/min) qui exécute `recevoir` | ≤ 1 min, sans toucher au bot | un Worker + secrets, cohabite avec la CI (idempotent) | alternative sans changement de configuration du bot |

Aucun webhook ni configuration du bot n'a été modifié. À décider après le test.

## 4. Ce qui change

- `scripts/lib/rapprochement-garde.mjs` (nouveau, pur) : `niveauGeo`, `sourceCoherente`, `forceRapprochement`.
- `scripts/lib/evenement-institutionnel.mjs` (nouveau, pur) : détection, libellés, annoncée/réalisée.
- `scripts/lib/telegram-clics.mjs` (nouveau) : décodage des callbacks, validité des boutons, politique de confirmation, journal best-effort.
- `scripts/lib/prevenir.mjs` (nouveau) : retour Telegram « appliqué / bloqué » (une seule fois par blocage).
- `scripts/lib/qualifier-signal.mjs` : garde géographique, comparaison avec sources vérifiées, REVIEW avec candidat, `institutionnel`.
- `scripts/lib/discovery-messages.mjs` : message comparatif, boutons à 4 choix.
- `scripts/lib/routage-veille.mjs` + `scripts/maintenance-cycle.mjs` : `evenementDejaValide` avec date de publication.
- `scripts/telegram-v0.mjs` : réception sans perte, journal, `test-clic`, `diagnostic`, accusés explicites, décision institutionnelle, déduplication des demandes.
- `scripts/appliquer-decisions.mjs` : événement institutionnel, fait déjà consigné (sous HOLD aussi), alerte unique si non applicable.
- `scripts/appliquer-nouvelles-affaires.mjs` : lit `action` (RAPPROCHER / CRÉER), garde géographique à l'application, événement institutionnel, retour Telegram.
- `scripts/etat-decisions.mjs` (nouveau, lecture seule) : état de chaque décision, de Telegram au site.
- `scripts/discovery-quotidien.mjs` : compteur de rapprochements écartés (logs publics : compteur seulement).
- `supabase/migrations/019_boucle_decisions.sql` : `telegram_journal`, `new_case_proposals.action`, `case_events.realisation`.
- `scripts/qa/test-boucle.mjs` (80 assertions) branché dans `run-all` ; `test-discovery.mjs` adapté au nouveau format de message.

### Ordre de déploiement (important)
1. Appliquer la migration 019 (additive, idempotente, sans instruction destructrice).
2. Merger sur `main`. Le code détecte la migration (`schemaBoucle`) : sans elle, tout fonctionne comme avant, **sauf** que les messages comparatifs ne partent pas (fail closed).
3. Lancer le test contrôlé (§3).

## 5. États de bout en bout d'une décision

`etat-decisions.mjs` calcule, pour chaque décision envoyée, avec la raison :
EN ATTENTE (aucun clic) · ENREGISTRÉE (clic en base, application au prochain passage) · BLOQUÉE (raison dite) · APPLIQUÉE (écrit / consigné) ·
puis la publication : candidate (GO requis) · publiée en base mais non projetée · projetée dans `data/cases.json`.
La publication reste **toujours** un acte distinct, avec GO explicite (`publier-affaire.mjs --go`). Aucun second mécanisme de publication.

## 6. Limites connues et non résolues

- Cause racine des « 0 clic » : non établie (§3) ; nécessite un clic humain.
- Latence de la CI : non corrigée par ce lot (décision d'infrastructure à prendre après le test).
- La détection institutionnelle est lexicale (vocabulaire fermé) : elle rate des formulations (faux négatifs → le fait reste une simple source), elle ne publie rien de libre.
- Les sources historiques non vérifiables de la base ne sont pas corrigées : elles sont masquées dans les messages ; leur correction relève d'une décision humaine (« ne pas réécrire sans preuve »).
- Les propositions déjà envoyées avant ce lot gardent leur ancien format ; leur application reste protégée par les gardes (géographie, fait déjà consigné).
