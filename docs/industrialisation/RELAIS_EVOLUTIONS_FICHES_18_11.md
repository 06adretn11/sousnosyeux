# Relais social — évolutions tirées d'une mise à jour de fiche approuvée (18/11/2026)

Mode REVIEW inchangé : aucune publication automatique, aucune activation globale. Un GO Telegram de fiche n'est jamais un GO social.

## Ce qui change dans le relais (minimum nécessaire)

- **Candidats** (`relais-social-db.mjs`) : une mise à jour de fiche dont l'éditeur a accepté la proposition **et** approuvé l'empreinte, après T0, produit
  - un candidat `fiche_evolution` par étape nouvelle de type audience, appel ou renvoi (annonces et évolutions de procès, sans changement de statut) ;
  - un candidat `fiche_temoignage` par parole de parent présente dans la version approuvée, si la mise à jour ajoute des positions attribuées.
  Ils restent des `case_update` (aucune migration) ; la clé d'événement porte l'empreinte de la version et l'élément (aucun doublon).
- **Éligibilité** (`evaluerCandidat`) : approbation de la version et décision postérieures à T0, version courante = version approuvée = version servie (HTTP 200), affaire publique, pas de HOLD ni de retrait, pas de doublon, pas de diffusion antérieure. Un type hors périmètre reste refusé.
- **Composition** : les étapes passent par la famille `evolution` du composeur V4.1 (événement synthétique bâti sur l'étape approuvée) ; les paroles par `declaration_victime` (REVUE_HUMAINE, GO social distinct par réseau). Tous les contrôles V4.1 et de fraîcheur s'appliquent.
- **Audience annoncée dont la date est atteinte** : aucune rédaction automatique (ni « à venir », ni « tenu »).

## Évaluation du 18/11/2026 (simulation du circuit réel sur les versions proposées, supposées approuvées — rien d'écrit ni d'envoyé)

### FR-2026-0046 (Rezé) — version proposée `624f3a1e859ade9b`
- Procès en appel annoncé du 16 au 18 novembre 2026 : **blocage** — date atteinte, aucun article lu ne rapporte le déroulement ni l'issue ; en outre la version n'est pas approuvée. Sera repris quand une source à jour existe.
- Parole d'une mère d'enfant concerné (ICI, 15/11) : Facebook composable, X impossible (> 280 caractères avec la réserve et les liens). **Dépend de la version non approuvée.** Déconseillé en l'état : contenu sensible (trauma d'un enfant), décision humaine.
- Brouillon manuel sûr (valable tant qu'aucune source ne rapporte le procès ; à relire au moment de l'envoi) :
  > Rezé (Loire-Atlantique) : selon ICI, le procès en appel de l'ancien animateur périscolaire, condamné en janvier 2026 à six ans de prison, était annoncé du 16 au 18 novembre à Rennes. À ce jour, aucune source lue ne rapporte son déroulement ni la décision ; la condamnation n'est pas définitive. Sources et suivi : sousnosyeux.org/affaires/fr-2026-0046/

### FR-2026-0133 (Rots) — version proposée `5a08c6ec90b9f11a`
- Parole d'un père d'enfant concerné (ICI) : **blocage V4.1** — « le lien Source est celui d'un média nommé dans le texte » (ici / Actu.fr) ; X : aucune version fidèle ne tient en 280 caractères avec la réserve. **Dépend de la version non approuvée**, de la proposition de correction de date (la mobilisation est publiée au 9 novembre) et de la décision sur le rassemblement du 16 novembre.
- Brouillon manuel (uniquement matière du dossier proposé ; à ne pas envoyer avant approbation de la version et décision sur la date) :
  > Rots (Calvados) : le lundi 16 novembre, des dizaines de parents ont manifesté devant la mairie pour dénoncer une prise en charge qu'ils estiment trop lente de la parole de leurs enfants (selon France 3 Régions). Un père d'enfant concerné, cité par ICI : « Mais il devrait se passer quelque chose, même pour une plainte. Qu'est-ce qu'ils attendent ? » Une enquête a été ouverte fin septembre ; aucune décision judiciaire n'est rapportée et la personne mise en cause est présumée innocente. Sources et suivi : sousnosyeux.org/affaires/fr-2026-0133/

Les fiches actuellement publiques (versions `4083cdfdbb384981` et `9618383317ae989e`) ne sont pas modifiées : tout ce qui précède dépend des nouvelles versions, tant qu'elles ne sont pas approuvées.
