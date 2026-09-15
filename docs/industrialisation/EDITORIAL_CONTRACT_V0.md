# EDITORIAL_CONTRACT_V0 — contrat éditorial testable

_Version 0 — 14 septembre 2026. Porte 1._
_Ce document n'est **pas** un avis juridique. Les points marqués 🔵 doivent être relus par un
conseil compétent en droit de la presse et en données personnelles avant toute publication
fondée sur ce contrat._

Objectif : deux personnes différentes doivent rendre **la même décision** sur la même fiche.
Chaque règle ci-dessous est soit vérifiable automatiquement (`AUTO`), soit tranchée par une
question fermée (`HUMAIN`).

---

## 1. Matrice champ par champ

| Information | Régime | Règle | Contrôle |
|---|---|---|---|
| Nom / prénom / initiales de la personne mise en cause | **INTERDIT** | jamais, sous aucune forme | `HUMAIN` |
| Âge exact de la personne mise en cause | **INTERDIT** | ni « 47 ans », ni « la quarantaine » chiffrée | `AUTO` |
| Année de naissance de la personne mise en cause | **INTERDIT** | ni « né en 2005 » | `AUTO` |
| Nom / âge / classe d'un enfant | **INTERDIT** | y compris « un enfant de trois ans » | `AUTO` |
| Nombre exact d'enfants concernés | **GÉNÉRALISÉ** | uniquement `1 enfant`, `plusieurs enfants`, `non précisé` | `AUTO` |
| Détails des faits (gestes, lieux précis, chronologie fine) | **INTERDIT** | aucun détail graphique | `HUMAIN` |
| Nom de l'établissement | **AUTORISÉ** | tel qu'écrit par la source ; une seule graphie canonique par établissement | `AUTO` (doublon) |
| Commune / arrondissement | **AUTORISÉ** | — | `AUTO` (présence) |
| Rôle de la personne mise en cause | **AUTORISÉ** | fonction générique uniquement (`animateur périscolaire`, `enseignant`, `éducateur`, `agent`, `tiers`) | `AUTO` (énum) |
| Type d'affaire | **AUTORISÉ** | qualification issue de la source, jamais requalifiée par nous | `AUTO` (énum) |
| Statut judiciaire | **AUTORISÉ** | valeur de l'énum §2, datée et sourcée | `AUTO` |
| Nom d'un magistrat, avocat, élu **agissant ès qualités** | **REVUE OBLIGATOIRE** | admis uniquement pour une déclaration publique attribuée, avec titre | `HUMAIN` |
| Nom d'un parent, témoin, plaignant | **INTERDIT** | même si la source le publie | `HUMAIN` |
| Numéro de téléphone, adresse d'un particulier | **INTERDIT** | — | `AUTO` (motif) |
| Hotline / contact institutionnel officiel | **AUTORISÉ** | — | `HUMAIN` |
| Commentaire de validation, score de fiabilité, note de revue | **INTERNE** | ne quitte jamais la base ; absent des exports et du build | `AUTO` |

**Règle de composition** : une information autorisée séparément peut devenir interdite par
recoupement. Si `établissement` + `rôle` + `âge approximatif` + `date précise` suffisent à
désigner une personne unique, l'un des éléments doit être retiré. 🔵

---

## 2. Formulations admises par statut judiciaire

Énumération canonique (identique à `statut_judiciaire` en base) et formulation imposée.
Toute autre formulation est un défaut bloquant.

| `statut_judiciaire` | Formulation publiable | Interdit |
|---|---|---|
| `plainte` | « Une source publique rapporte qu'une plainte a été déposée. » | « victime », « auteur », « les faits » |
| `enquête` | « Une source publique rapporte qu'une enquête a été ouverte. » | « coupable », « impliqué » |
| `mise en examen` | « Une source publique rapporte une mise en examen. La mise en examen ne vaut pas culpabilité. » | « inculpé », « reconnu » |
| `procès` | « Une source publique rapporte qu'un procès est en cours. » | annoncer l'issue |
| `condamnation non définitive` | « Une source publique rapporte une condamnation non définitive, susceptible d'appel. » | « condamné » sans qualificatif |
| `condamnation définitive` | « Une source publique rapporte une condamnation définitive. » | détails de peine dramatisés |
| `relaxe / non-lieu / classement` | « Une source publique rapporte une relaxe / un non-lieu / un classement sans suite. » | maintenir le vocabulaire d'accusation |
| `à qualifier` | **non publiable** — reste en candidate | toute publication |

La mention « la mise en examen ne vaut pas culpabilité » est **obligatoire et non
supprimable** pour `mise en examen`, `plainte`, `enquête` et `procès`.

---

## 3. Informations contradictoires ou favorables à la personne mise en cause

**Règle de priorité asymétrique.** Une information qui affaiblit, nuance ou contredit la
présentation initiale est traitée **avant** toute information qui la renforce, et n'attend
pas le cycle de revue suivant.

Sont prioritaires, dans cet ordre :

1. relaxe, non-lieu, classement sans suite, absence de charges ;
2. rectification publiée par la source d'origine, ou rétractation ;
3. erreur d'établissement, de commune ou de périmètre ;
4. requalification à la baisse (ex. `mise en examen` → `enquête` abandonnée) ;
5. levée d'une mesure (fin de contrôle judiciaire, réintégration).

Conséquences :
- une affaire dont le statut devient `relaxe / non-lieu / classement` **quitte la carte** et
  les hubs (retrait, pas simple mise à jour) ; l'enregistrement reste en base avec la trace ;
- une transition **régressive** (d'un statut plus avancé vers un statut moins avancé) est
  légitime et doit être acceptée par le modèle ; elle n'est jamais un « bug de données » ;
- aucune information favorable ne peut être différée au motif qu'elle est moins sourcée
  qu'une information défavorable.

---

## 4. Attribution

Toute affirmation portant sur des faits, des personnes ou une procédure est attribuée.

- Forme imposée : « Une source publique rapporte que… » ou « Selon `<média>` (`<date>`)… ».
- Aucune phrase au présent d'affirmation en nom propre (« l'animateur a agressé… »).
- Une affirmation sensible **sans source directe et datée n'est pas publiable**, quel que
  soit le nombre de reprises secondaires.
- Une source de **synthèse** (un article couvrant dix affaires) ne vaut source directe que
  pour les affirmations qu'elle énonce explicitement. Chaque affirmation doit pointer vers
  le passage qui la justifie (`claims.justifying_quote`, cf. `DATA_CONTRACT_V0.md`).
- Sources non admises comme source primaire : encyclopédie collaborative (Wikipédia),
  agrégateur sans rédaction (MSN, portails de reprise), réseau social, blog personnel,
  contenu derrière paywall (non vérifiable publiquement). Elles peuvent figurer en source
  secondaire signalée comme telle.

**Qualité de source ≠ vérité judiciaire.** Un article de qualité rapportant une plainte ne
fait pas monter le statut judiciaire. Le score de fiabilité qualifie la **traçabilité de
l'information**, jamais la culpabilité. Les deux dimensions ne se compensent pas.

---

## 5. Dates, fraîcheur et péremption

| Date | Sens | Obligation |
|---|---|---|
| `source_date` | date de publication de l'article | obligatoire, format `YYYY-MM-DD` |
| `event_date` | date de l'événement judiciaire rapporté | obligatoire si connue, sinon `null` explicite |
| `verified_at` | date à laquelle un humain a relu source **et** fiche | obligatoire pour toute fiche publiée |
| `next_review_at` | échéance de revue calculée | dérivée (§5.2) |

### 5.1 Échéances futures

Une date future affichée (audience, délibéré, procès) est une **promesse**. Règle :

> Aucune page ne peut se dire à jour si une échéance qu'elle présente comme future est dépassée.

Dès que `date_echeance < aujourd'hui`, la page est en défaut **bloquant** jusqu'à ce que
l'issue soit documentée ou l'échéance retirée. Le blocage ne dépend d'aucun cycle de revue.

### 5.2 Péremption par statut

| Statut | Fraîcheur maximale de `verified_at` |
|---|---|
| `procès`, `mise en examen`, échéance future affichée | **30 jours** |
| `enquête`, `plainte` | **90 jours** |
| `condamnation non définitive` | **180 jours** (délai d'appel) |
| `condamnation définitive` | **365 jours** |
| `relaxe / non-lieu / classement` | fiche retirée, pas de revue |

Au-delà, la fiche est marquée `PERIMEE` : elle reste visible mais le hub ne peut plus
afficher de date de fraîcheur, et le scanner d'entretien l'escalade.

---

## 6. Correction, retrait, droit de réponse

| Déclencheur | Action | Délai cible |
|---|---|---|
| Relaxe / non-lieu / classement définitif | **retrait** de la carte et des hubs | 72 h |
| Rétractation ou correction publiée par la source primaire | **retrait ou correction** alignée sur la source | 72 h |
| Erreur d'établissement ou de commune confirmée | **correction** + trace `case_events` | 7 j |
| Demande motivée d'une personne directement concernée | **revue humaine** obligatoire, réponse écrite | 7 j |
| Droit de réponse LCEN art. 6.IV | publication de la réponse | 3 j après réception |
| Signalement de contenu manifestement illicite | examen prioritaire | sans délai |

Invariants :
- un retrait ne supprime jamais l'enregistrement en base ; il change l'état public et écrit
  un `case_event` daté ;
- une correction met à jour **tous** les agrégats où l'affaire figure (carte, hub, compteurs)
  dans la même opération, ou échoue entièrement ;
- l'adresse de contact publiée doit être une boîte réellement relevée. 🔵

---

## 7. Blocs du hub — V1 autorisé / différé

| Bloc | V1 | Raison |
|---|---|---|
| En-tête de zone + date de vérification + rappel méthodologie | ✅ | ancrage et fraîcheur |
| Compteurs **calculés** depuis les affaires publiées | ✅ | jamais saisis en dur |
| Liste d'affaires (≥ 4 distinctes et qualifiées) | ✅ | pas de remplissage artificiel |
| Statut courant + chronologie factuelle par affaire | ✅ | cœur du hub |
| Réponses publiques / institutionnelles directement sourcées | ✅ | ne documente pas que l'accusation |
| Liste des sources + procédure de correction + contact | ✅ | traçabilité et recours |
| Citations de presse (« ce que dit la presse ») | ⏸️ différé | droits de citation, sélection, entretien |
| Podcasts et ressources externes | ⏸️ différé | régime de droits distinct |
| Annuaire d'associations | ⏸️ différé | vérification d'implication au cas par cas |
| Agenda judiciaire des audiences à venir | ⏸️ différé | ne revient qu'avec expiration automatique |
| Pages individuelles par affaire | ⏸️ différé | surface d'indexation, hors périmètre |
| Bandeau QA, score de complétude, « publiable en l'état » | ⛔ interdit | vit dans l'outil de revue, jamais dans la page |

Seuil d'éligibilité d'une zone : **au moins 4 affaires distinctes et qualifiées**. En deçà,
produire une **preuve d'inéligibilité**, pas une page remplie.

---

## 8. Points renvoyés à une validation juridique externe 🔵

1. Seuil de ré-identification acceptable par recoupement (§1, règle de composition).
2. Publication du nom d'un établissement encore au stade `plainte` / `enquête`.
3. Citation nominative d'avocats, magistrats et élus ès qualités (§1).
4. Durée de conservation des enregistrements retirés et base légale (RGPD).
5. Adresse postale du directeur de publication : domiciliation vs « sur demande écrite ».
6. Statut d'hébergeur vs éditeur au sens de la LCEN pour un contenu agrégé et éditorialisé.
7. Reprise de citations de presse et d'extraits de podcasts (§7, blocs différés).
