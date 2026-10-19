# Généralisation #1 — ce que le pipeline produit hors pilotes (18/10/2026)

Branche `feat/generalisation-fiches` (sur `979c424`). Aucun moteur modifié, aucune donnée de production touchée. Mesure seule.

## Constat de départ
Il n'existe **pas de moteur qui produise les dossiers**. Les 14 dossiers de `data/hub-matiere/*.json` sont rédigés à la main après lecture des articles ; 3 seulement sont des fiches complètes (Titon, Delle, Cenon). Les 44 autres affaires publiques n'affichent qu'une carte : état, type, rôle, catégorie d'enfants, **une** source. « Qualité équivalente aux pilotes hors pilotes » n'est donc pas une propriété du code aujourd'hui : c'est un travail éditorial. Ce qui est mesurable, c'est l'exactitude de la carte et la capacité du capteur de veille à détecter qu'elle a vieilli.

## Protocole
- 44 affaires publiques hors dossiers. Échantillon A (27, stratifié par état, graine fixe, commité avant toute correction) : 14 `dev`, 13 `holdout`. Échantillon B (17 restantes, « vierge ») : vérité annotée **après** gel des décisions.
- Vérité : 9 lots annotés à l'aveugle (sans voir ce que le site affiche), par un agent LLM avec web. **Ce n'est pas une vérité humaine** : 12/44 états « incertain », 22 « probable », 10 « établi » ; la plupart des pages des presses locales sont bloquées (403) pour l'outil, donc beaucoup d'états reposent sur des extraits de recherche.
- Limite d'honnêteté : j'ai affiché la comparaison complète (dev + holdout) avant de la scinder ; la sélection des corrections ne s'appuie que sur `dev`, et l'échantillon B sert de vraie validation.

## Résultats
| | dev (14) | holdout (13) | vierge (17) | total (44) |
|---|---|---|---|---|
| État affiché = vérité | 9 | 6 | 15 | **30 (68 %)** |
| …sur états non « incertain » | | | 11/13 | 23/32 (72 %) |

Désaccords : 7 états **en retard** sur la vérité (ex. « enquête » alors qu'il y a condamnation) dans A, 1 réel dans B (PARIS-004) ; 2 « relaxe/classement » affichés à tort ou sans preuve suffisante (FR-2026-0024, -0035) ; 2 inférences « définitive » non démontrables (FR-2026-0020, -0045), non comptées comme erreurs moteur.
Rôle / type / catégorie d'enfants : rôle compatible 22/27 sur A ; 4/27 catégories d'enfants divergentes ; 2 types sur-qualifiés (FR-2026-0035/0036 : « agression/violences sexuelles » là où les sources parlent de comportements/propos). Ces divergences ne sont pas détectables par règle déterministe.

Couverture : vérité = 3,1 événements datés en moyenne (≥ 3 pour 29/44) et ≥ 1 source libre supplémentaire utile pour 42/44 ; le site expose des événements pour 7/44 affaires. Une fiche « courte, exacte, sourcée » existe en puissance pour toutes, mais **aucun code ne la produit**.
Traçabilité : 1 source affichée sur 1–4 en base. 1 échéance future réelle (FR-2026-0046, appel 16–18 nov. 2026 à Rennes) non portée par le site.
Identité : homonymies/affaires sœurs relevées par les annotateurs dans ≥ 8 affaires (Grands-Champs ×2 lignes, Aqueduc ×2, Reuilly/Boulard/Faidherbe, Belzunce↔Bullourde, Saché, FR-2026-0022↔0005, etc.).

## Capteur de veille existant (Google News, `requetesVeille(...).avant` + routage par titre)
Retards réels détectés / fausses alertes sur affaires à jour : dev 2/4, 1/7 ; holdout 2/2, 2/6 ; vierge 0/2, 2/11 → **4/8, 5/24**.
Variante testée « sans guillemets » (jetons + commune) : 3/4·1/7, 2/2·1/6, 0/2·3/11 → **5/8, 5/24**. +1 détection sur 8, aucune amélioration des fausses alertes : **non retenue** (n trop petit, pas de gain démontré).
Piège évité : sur **Bing**, la requête actuelle rend 0 résultat sur 13/14 (guillemets + OR) — c'est faux pour Google, moteur réellement utilisé par ce chemin ; sans le rejeu Google, j'aurais « corrigé » un défaut inexistant.
Règle d'âge de la dernière source comme alerte de péremption : **rejetée** (des états justes et des états faux ont le même âge de source, ex. 212 j).

## Règles contractuelles existantes sur ces affaires
Elles attrapent bien les cas dangereux de l'échantillon : R5 (relaxe non étayée) 2/2, R9 (doublons) 3 paires, R4 (source non admissible/média incohérent) 3/3. Elles n'exercent pas R3/R6/R8 (pas de surface en base) : l'échéance du 16 nov. et le retard d'état restent invisibles au QA.

## Verdict
- **Aucune correction de moteur n'est démontrée sur l'indépendant** : aucune règle ajoutée, rien à retirer. Ce qui a progressé, c'est la mesure : un échantillon indépendant avec vérité et trois scripts de rejeu (`eval/generalisation/`).
- Défaut reproductible, non corrigible par une règle sûre : **le retard d'état** (~16 % des affaires hors dossiers, 8/44, dont 1 sur B), que le capteur ne détecte qu'à moitié, surtout quand le titre de l'article ne nomme pas l'établissement (condamnation « du compagnon d'une institutrice »).
- **Dépend des humains** : valider la vérité (surtout les 12 « incertain » et les 22 « probable »), corriger les données, trancher les doublons. Propositions de lecture (aucune appliquée) : FR-2026-0003 et PARIS-010 (même affaire, condamnation 16/10/2026), FR-2026-0002 (condamnation 10/07/2026, appel), FR-2026-0047 (condamnation 31/03/2026), PARIS-001 et PARIS-004 (mise en examen), FR-2026-0024 et -0035 (réexaminer « relaxe/classement »), FR-2026-0046 (échéance 16–18/11/2026).
- Le pipeline **n'est pas industrialisé** pour produire des fiches hors pilotes : le contenu documentaire dépend de la rédaction manuelle.
