# SNY — Pilote éditorial social V4.1 et premier test hors corpus : Montpellier (12/11/2026)

**Aucun GO de diffusion n'est accordé.** `SNY_DIFFUSION_ACTIVE=0`, aucun appel Buffer, aucune modification du site, des fiches approuvées ou de Neon. La fusion du pilote ne vaut ni GO éditorial ni autorisation de publication.

Rendus : `banc-social/banc.md` (14 scénarios, V4 jointe sous chaque scénario) · simulation Montpellier : `banc-social/s13-simulation.md`.

## Synthèse

| | Résultat |
|---|---|
| PR 119 (V4.1) | rebasée sur `main` (PR 120 et 121 incluses) sans conflit · 166 contrôles du banc ✅ · non-régression 94 / 27 / 10 / incidents 12-11 ✅ |
| Montpellier : réconciliation | **vérifiée** (Neon en lecture seule, site servi, alias) : une seule affaire, `FR-2026-0146` |
| Montpellier : Facebook | **bloqué** : aucune fiche approuvée. La simulation sur le brouillon de fiche révèle une date mal attribuée dans sa phrase principale |
| Montpellier : X | **bloqué** pour la même raison ; une fois la fiche corrigée et approuvée, X tient en 246 caractères avec l'objet de l'enquête |
| Demande d'approbation | **pas de GO de publication demandé** : Facebook n'est pas réellement prêt |

## 1. V4.1 : corrections demandées

| Point | Avant (V4) | Après (V4.1) | Règle générale |
|---|---|---|---|
| **D1** (S01 X) | « … sur mineurs de 15 ans (selon France 3 …) » : circonstance « par personne ayant autorité » retirée | qualification **complète**, 278 caractères | plus de variante raccourcie ; si rien ne tient, un **pied compact** retire la seule étiquette « Source : » (même contenu, mêmes liens) ; sinon X bloqué |
| **D2** (S06) | bloqué | bloqué (inchangé) | — |
| **D3** (S02 FB) | « … nie avec fermeté l'accusation de viol et se dit humilié et effondré » | « … nie avec fermeté l'accusation de viol. » | `sansRegistreEmotionnel` : début EXACT de la phrase approuvée jusqu'à l'articulation qui précède l'émotion ; le contrôleur n'accepte qu'un début de phrase approuvée (jamais un morceau pris au milieu) |
| **S01** (FB) : attribution | « Selon France 3 et Le Figaro » + un seul lien (France 3) ; paragraphe garde à vue daté « selon Le Figaro » | une ligne Source **par média nommé** (France 3 + Le Figaro) ; développement garde à vue retiré | un contexte qui repose, même en partie, sur un article lu partiellement est exclu ; chaque article lié est contrôlé (Le Figaro partiel ⇒ **revue humaine**) |
| **S03** (FB) : concordance | phrase « … cité par franceinfo » prouvée par le JDD | prouvée par l'article de franceinfo | la preuve d'une phrase est l'article d'un média qu'elle nomme ; nouveau contrôle indépendant « concordance média cité ↔ preuve » |
| Revue des conformes | — | S11 lie aussi Le Parisien (nommé dans le fait) ; jamais le JDD « trois hommes déférés » | même règle « une ligne par média nommé », sauf adresse trompeuse |

Textes inchangés : S03 X et FB, S04 FB. Bilan sur les 12 scénarios d'origine : **7 conformes, 1 revue humaine (S01 FB), 16 bloqués** (V4 : 8 / 0 / 16). La baisse est voulue : S01 FB lie désormais un article lu en partie.

## 2. Montpellier : réconciliation réelle (lecture seule)

| Contrôle | Constat | Preuve |
|---|---|---|
| État des deux affaires | `FR-2026-0146` publiée (enquête) ; `FR-2026-0147` retirée, non supprimée | `cases` (Neon) |
| Unicité publique | une seule carte Goethe sur le site servi ; `cases_public` = 0146 seule | site + Neon |
| Sources | 4 sources sur 0146 (Midi Libre, Actu.fr ×2, ToutMontpellier) ; 0147 garde la ligne ToutMontpellier (historique) | `sources` (Neon) = `data/cases.json` |
| Événements | aucun `case_events` sur l'une ou l'autre | Neon |
| Rôles | 0146 « enseignant », 0147 « direction » : une personne, « directeur et enseignant » (rôles cumulables, incident 12/11) | Neon + articles |
| Confusion de personnes ou de procédures | aucune : une procédure (enquête préliminaire), une personne | brouillon de fiche |
| Ancien identifiant | `/#affaire-fr-2026-0147` → réécrit en `/#affaire-fr-2026-0146` ; aucune page `/affaires/fr-2026-0147/` | navigateur sur le site servi |
| Fiche individuelle | **aucune** : `/affaires/fr-2026-0146/` répond 404 ; absente de `fiches_approuvees` | site + `data/evenements.json` |
| Diffusion | `diffusions_sociales` vide (aucun post, aucun post rétroactif) | Neon |

Une carte publique n'est pas une fiche approuvée. Le GO Discovery « VALIDER ET PUBLIER » du 12/11 a publié la carte ; il n'approuve ni une fiche ni un post.

## 3. S13 : test hors corpus

**Résultat initial (V4.1 avant correction)** : bloqué, car aucune fiche n'est approuvée (contrôle S13 du banc). C'est le résultat réel, conservé.

Pour éprouver le composeur sur la vraie matière, le brouillon de fiche a été produit par le circuit existant (`generer-fiche.mjs`) : lecture seule sur Neon, 9 appels au modèle, 0,064 $, rien écrit, rien envoyé. Son état est « À REVOIR ». Le composeur a ensuite été appliqué à ce brouillon avec une **approbation simulée**.

**Défauts observés au premier essai** (tous génériques, aucun propre à Montpellier) :
1. une rumeur au conditionnel reprise en contexte (« des parents d'élèves se seraient rassemblés ») ;
2. un lien ToutMontpellier dont l'adresse dit « le directeur … interpellé » : la fonction identifie la personne, et l'interpellation est démentie par Actu.fr (« ni convoqué, ni entendu, ni placé en garde à vue ») ;
3. un X bloqué, car l'objet « sur les soupçons d'agressions sexuelles » n'était pas reconnu ;
4. la preuve de la réserve pointait vers l'article d'Actu.fr « une douzaine de victimes », que le circuit de fiche n'a pas pu rattacher à l'école ;
5. une phrase du Rectorat sur la mesure prise « à l'égard du directeur de l'école » restait admissible (non choisie par hasard d'ordre).

**Corrections génériques** : fait au conditionnel exclu du contexte (sauf dans une subordonnée : la motivation du jugement S04 est conservée) ; adresse annonçant un acte non établi jamais liée ; ancre d'objet « sur les soupçons d'… » ; preuve de la réserve = source du fait ; garde « fonction unique dans l'établissement » (directeur, directrice, proviseur, chef d'établissement — pas les fonctions d'institution). Les 12 scénarios d'origine restent inchangés hors corrections voulues (comparaison texte à texte).

**Défaut que le composeur ne peut pas voir** (relecture des passages littéraux) : la phrase principale du brouillon, « Selon Actu.fr, une enquête préliminaire … a été ouverte … sur les soupçons d'agressions sexuelles, **les investigations ayant été lancées le lundi 9 novembre 2026** », attribue à Actu.fr une date qui vient de ToutMontpellier, où elle est celle de l'*interpellation* démentie. Le contrôleur garantit la fidélité du post à la fiche approuvée ; la fidélité de la fiche aux articles relève de son approbation humaine. Avec ce brouillon tel quel, la simulation obtient 100/100 : **une note élevée ne prouve rien**.

**Résultat final (simulation sur le brouillon corrigé d'une seule clause, sans ajout)** :

X, 246 caractères (URL = 23), contrôles 13/13 :

```text
Montpellier · école maternelle Johann-Wolfgang-Von-Goethe : enquête ouverte pour soupçons d'agressions sexuelles (selon Actu.fr). L’ouverture d’une enquête ne vaut pas culpabilité.

Source : https://actu.fr/occitanie/montpellier_34172/soupcons-d-agressions-sexuelles-dans-une-ecole-maternelle-a-montpellier-le-rectorat-prend-des-mesures_65043937.html Suivi : https://sousnosyeux.org/affaires/fr-2026-0146/?utm_source=x&utm_medium=social&utm_campaign=new_case&utm_content=fr-2026-0146
```

Facebook :

```text
Montpellier (Hérault) — école maternelle Johann-Wolfgang-Von-Goethe : enquête ouverte pour soupçons d'agressions sexuelles

Selon Actu.fr, une enquête préliminaire du Service local de police judiciaire a été ouverte à Montpellier sur les soupçons d'agressions sexuelles.

Selon l'Académie, les représentants des parents d'élèves de l'école ont été reçus le lundi 9 novembre 2026 par l'adjointe au directeur académique en charge du premier degré et par l'inspectrice de l'Education nationale de circonscription, afin de les tenir informés de la situation.

Selon le Rectorat, un point hebdomadaire entre les services académiques et les parents d'élèves ainsi qu'une ligne d'écoute téléphonique dédiée aux familles ont été mis en place dès cette semaine, ces dispositifs devant rester actifs autant que nécessaire.

L’ouverture d’une enquête ne vaut pas culpabilité.

Source : Actu.fr, 11 novembre 2026 — https://actu.fr/occitanie/montpellier_34172/soupcons-d-agressions-sexuelles-dans-une-ecole-maternelle-a-montpellier-le-rectorat-prend-des-mesures_65043937.html

Contexte, sources et suivi de l’affaire sur Sous nos yeux : https://sousnosyeux.org/affaires/fr-2026-0146/?utm_source=facebook&utm_medium=social&utm_campaign=new_case&utm_content=fr-2026-0146
```

| Affirmation | Source | Passage justificatif (Actu.fr, 11/11) | Contrôle |
|---|---|---|---|
| enquête ouverte pour soupçons d'agressions sexuelles | Actu.fr « le Rectorat prend des mesures » | « Des soupçons d'agressions sexuelles sur des enfants […] font l'objet d'une enquête préliminaire au Service Local de Police Judiciaire » | extrait exact de la phrase de la fiche ✅ |
| parents reçus le 9 novembre | idem | « lundi 9 novembre, les représentants des parents d'élèves de l'école ont été reçus par l'adjointe […] » | ✅ |
| point hebdomadaire, ligne d'écoute | idem | « un point hebdomadaire entre les services académiques et les parents d'élèves a été mis en place dès cette semaine […] » | ✅ |
| mention judiciaire | formulation du site | `etat-wording.ts` (statut « enquête ») | ✅ |

*(Les crochets […] marquent les coupes de ce tableau ; le post ne contient aucune citation tronquée.)*

Ce que le post ne dit pas, volontairement :
- le nombre et l'âge des enfants (règle 5) ;
- la fonction de la personne (directeur : identifiante) ;
- la garde à vue (non établie, démentie) ;
- le contenu du signalement médical (détail sensible).

Ce message est **compréhensible** par un lecteur qui découvre l'affaire. Il est **pauvre sur les faits** : la presse ne dit encore rien de plus d'établi.

## 4. Ce qui manque avant un post Facebook réel

1. **Fiche** : corriger le brouillon. Il faut au minimum :
   - retirer la clause de date ;
   - régler les lignes « directeur », signalées comme fonction identifiante (majeur) ;
   - régler « Selon le journal », une attribution sans média ;
   - régler « Selon ToutMontpellier.fr, Devant… » (rumeur au conditionnel, majuscule) ;
   - régler le détail de l'examen médical.

   La fiche corrigée passe ensuite par le circuit existant : `proposer-fiche --generee` puis Telegram « APPROUVER LA FICHE ». C'est une décision d'Adrien ; le circuit écrit une ligne `new_case_proposals` et envoie un message, donc rien n'a été lancé.
2. **Page servie** : après la promotion de la fiche, `/affaires/fr-2026-0146/` doit répondre 200. Sinon, le lien SNY reste l'ancre `/#affaire-fr-2026-0146`, ce qui change le texte et exige un nouveau rendu.
3. **Recomposer** avec l'empreinte réellement approuvée, puis vérifier que le texte est identique à celui qui a été relu.
4. **GO social**, distinct par réseau, sur le texte exact et le lien exact. Toute modification ultérieure exige un nouveau GO.

## 5. Publication et mesure (préparé, rien exécuté)

**Chemin retenu pour un premier essai** : publication **manuelle** dans Buffer, en copiant-collant le texte validé, un post sur la Page Facebook et un post sur `@sousnosyeux_org`, sans programmation automatique. Aucun mécanisme nouveau ; `SNY_DIFFUSION_ACTIVE` reste à 0. Une publication manuelle prouve le contenu et la distribution, **pas** la chaîne automatique.

**Contrôles après publication** :
1. un seul post par canal ;
2. le texte publié est identique au texte validé (diff caractère par caractère) ;
3. le lien source et le lien SNY répondent 200 ;
4. aucun lien vers `fr-2026-0147` ;
5. aucun post Instagram ni autre post imprévu ;
6. le statut Buffer et le permalien sont relevés ;
7. les erreurs éventuelles sont notées ;
8. le mode d'envoi (« manuel ») est consigné dans `JOURNAL_DECISIONS.md`.

**Mesure** :
- Le beacon Cloudflare Web Analytics est maintenant **actif** sur le site servi (script `static.cloudflareinsights.com` présent dans le DOM le 12/11 ; absent le 10/11).
- La baseline n'a **pas** pu être relevée : le tableau de bord exige la connexion d'Adrien.
- Lecture à J0 (avant publication), J+1 et J+7 dans Cloudflare : visites, référents (`t.co`/`x.com`, `facebook.com`/`l.facebook.com`/`m.facebook.com`), page d'atterrissage.
- Statistiques natives : X Analytics et Meta Business Suite.
- Limites :
  - Cloudflare n'exploite pas les UTM ;
  - les applications mobiles masquent souvent le référent ;
  - aucune attribution exacte par post ;
  - aucun clic ni aucune impression ne sera estimé.

## 6. Contrôles

- `test-banc-social` : 166 ✅ (144 en V4). 22 nouveaux contrôles portent sur :
  - D1 et D3 (dont un extrait coupé au milieu, refusé) ;
  - la concordance (dont une preuve JDD injectée, refusée) ;
  - une ligne Source par média nommé ;
  - S13 et S14 : une seule identité, l'alias, l'absence de lien vers l'identifiant retiré, l'absence d'approbation rétroactive, l'identifiant retiré refusé.
- Non-régression :
  - `test-diffusion-sociale` 94 ✅ ;
  - `test-diffuser-script` 27 ✅ ;
  - `test-wording-proces` 10 ✅ ;
  - `test-incident-12-11` ✅.
- `run-all` : les 2 échecs **préexistants** (`test-declaration-organisme`, `test-fiche-priorite`) échouent identiquement sur `main` (9d6ea8c) sans ce changement. Ils n'importent pas le pilote.

## 7. Risques résiduels

- Le contrôleur ne revérifie pas une fiche contre ses articles : la qualité d'un post dépend de l'approbation humaine de la fiche (cas Montpellier).
- Pied X compact (S01) : l'adresse de la source n'a plus d'étiquette. Elle suit immédiatement le paragraphe qui nomme le média.
- Garde « fonction unique » : elle peut aussi écarter une phrase sur une directrice témoin ou signalante (choix prudent, aucun cas dans le corpus).
- Grille sur 100 : outil maison et saturant (98,6 de moyenne sur les conformes). Ce n'est pas l'avis d'Adrien.

## 8. Note de sécurité

- **Objet** : composeur pilote local (fonctions pures) et banc d'essai ; ni publication, ni réseau, ni base, ni modèle dans le pilote.
- **Installation** : dépôt seulement. Rien au démarrage, aucune tâche planifiée.
- **Accès réseau** : aucun pour le pilote. Les vérifications de cette mission sont restées locales et en lecture seule :
  - SELECT sur Neon en HTTPS ;
  - lecture du site servi ;
  - génération du brouillon de fiche par le circuit existant (OpenRouter, 0,064 $).
- **Secrets** : `.env.local` jamais lu ni affiché ; aucun secret dans le dépôt ni dans les journaux.
- **Données personnelles** : aucune ; le pilote bloque la fonction identifiante, l'âge et le nombre d'enfants.
- **Privilèges** : aucun.
- **Revue** : une revue de l'équipe sécurité est recommandée avant tout raccordement à Buffer.
