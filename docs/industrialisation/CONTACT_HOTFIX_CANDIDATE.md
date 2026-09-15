# Candidat de correctif — adresse de contact `.fr` → `.org`

_15 septembre 2026. **Non commité, non appliqué, non poussé.**_

> **Statut : `MAILBOX_OPERATION_NOT_PROVEN`.**
> Ce correctif ne doit pas être appliqué tant qu'Adrien n'a pas prouvé, par un test réel de
> réception, quelle boîte relève effectivement le courrier.

---

## 1. Correction d'un constat erroné de la session précédente

J'avais écrit que `contact@sousnosyeux.fr` était « une adresse qui n'a jamais existé » et que
le droit de réponse LCEN « pointait dans le vide ». **C'est faux.**

Vérification DNS du 15/09/2026, sans envoyer aucun message :

| Domaine | Serveurs de noms | MX | Lecture |
|---|---|---|---|
| `sousnosyeux.fr` | `ns13.ovh.net`, `dns13.ovh.net` | `mx1/mx2/mx3.mail.ovh.net` | **le domaine existe**, il est chez OVH et **du routage mail OVH est configuré** |
| `sousnosyeux.org` | `kevin.ns.cloudflare.com`, `virginia.ns.cloudflare.com` | `route1/route2/route3.mx.cloudflare.net` | DNS chez Cloudflare, **MX Cloudflare Email Routing présents** |

Les deux domaines ont des MX. **Aucun des deux n'est une adresse morte au sens DNS.**

## 2. Ce qui reste non démontré

| Question | Réponse |
|---|---|
| Une boîte ou une redirection `contact@` est-elle provisionnée chez OVH pour `.fr` ? | **`UNKNOWN`** — non observable sans accès au panneau OVH |
| La règle Cloudflare Email Routing pour `contact@sousnosyeux.org` est-elle active **et vérifiée** côté destinataire ? | **`UNKNOWN`** — Email Routing exige que l'adresse de destination soit confirmée ; des MX présents ne le prouvent pas |
| Un message envoyé à l'une ou l'autre arrive-t-il réellement ? | **`UNKNOWN`** — aucun test n'a été effectué, et en effectuer un enverrait un message |
| Le dépôt contient-il une preuve de réception ? | **non** — `CLAUDE.md` l'affirme (« ✅ »), mais une affirmation n'est pas une preuve |

## 3. Ce qui est certain

Le site est **incohérent** : `contact@sousnosyeux.org` dans l'en-tête, le pied de page et
`/a-propos` ; `contact@sousnosyeux.fr` dans les **mentions légales**, c'est-à-dire précisément
là où se trouvent le contact de l'éditeur, le droit de réponse LCEN (art. 6.IV) et le
signalement de contenu illicite.

Un lecteur qui exerce son droit de réponse écrit donc à une adresse **différente** de celle
affichée partout ailleurs. C'est le problème réel — et il est réel quelle que soit la boîte
qui fonctionne.

## 4. Le correctif candidat

Un seul fichier, une seule ligne fonctionnelle.

```diff
--- a/web/src/pages/mentions-legales.astro
+++ b/web/src/pages/mentions-legales.astro
@@
-// Email de contact public — à connecter à Cloudflare Email Routing (gratuit) une fois le
-// domaine sousnosyeux.fr enregistré. Tant que ce n'est pas en place, la mention reste valable
-// (les emails à cette adresse rebondiront, mais l'engagement éditorial est conservé).
-const CONTACT_EMAIL = 'contact@sousnosyeux.fr';
+// Adresse de contact publique. Doit rester identique à celle du Layout et de /a-propos.
+// Les deux domaines existent et portent des MX ; la boîte réellement relevée doit être
+// confirmée par un test de réception avant d'appliquer ce changement.
+const CONTACT_EMAIL = 'contact@sousnosyeux.org';
```

Portée : 4 occurrences rendues (contact éditeur, droit de réponse ×2, signalement), soit
**8 occurrences** dans `web/dist/mentions-legales/index.html` après build.

## 5. Procédure d'application — à ne lancer qu'après preuve

1. **Adrien envoie un message de test** à `contact@sousnosyeux.org` depuis une adresse
   externe et confirme la réception. Puis le même test sur `contact@sousnosyeux.fr`.
2. Deux cas :
   - **`.org` reçoit** → appliquer le correctif ci-dessus. C'est l'hypothèse la plus probable
     au vu de `CLAUDE.md` et de la présence des MX Cloudflare.
   - **seul `.fr` reçoit** → **ne pas appliquer**. Faire l'inverse : aligner le Layout,
     `/a-propos` et le hub sur `.fr`, ou provisionner `.org` d'abord.
3. Créer une branche dédiée `fix/contact-mentions-legales` **depuis `main`**, jamais depuis
   la branche du chantier.
4. `npm run build`, vérifier : `grep -c 'contact@sousnosyeux\.fr' web/dist` → `0`.
5. PR séparée, relue pour ce qu'elle est : **une modification de mention légale**.

## 6. Pourquoi ce correctif n'est pas dans la branche du chantier

Il touche une mention légale, c'est-à-dire un engagement opposable. Le noyer parmi 46 autres
fichiers techniques le ferait relire comme un détail. Il est donc exclu de
`feat/hub-pre-executeur-clean`, et `web/src/pages/mentions-legales.astro` y est **inchangé** :
la branche reflète l'état réel de la production, `.fr` compris.

## 7. Question ouverte qui dépasse ce correctif

Pourquoi le projet possède-t-il **deux domaines** ? `CLAUDE.md` ne mentionne que `.org`, mais
`.fr` est enregistré chez OVH **avec du mail configuré**. Trois possibilités : un reliquat
d'une première réservation, une protection de marque, ou un domaine réellement en service.

La réponse détermine la bonne cible du correctif. Elle appartient à Adrien.
