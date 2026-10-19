# GÉNÉRATION DES FICHES #1 — le premier circuit industriel (19/10/2026)

Branche `feat/generation-fiches` (depuis `origin/main` `3f36f5b`). Aucune donnée métier, aucune base, aucune page publique touchée ; aucun message Telegram ; Neon lu seulement (table `sources`).

## Le circuit

```
affaire publique ─► sources (mémoire + découverte Bing) ─► lecture (corps seul, cache disque) ─► extraction LLM structurée, citations littérales
   ─► GARDES déterministes ─► composition (dossier de même forme que data/hub-matiere) ─► qualification ─► rendu + proposition « APPROUVER LA FICHE » (simulée)
```

```bash
node scripts/generer-fiche.mjs FR-2026-0115 --decouvrir            # génère (aucune écriture en base)
node scripts/generer-fiche.mjs FR-2026-0115 --hors-ligne           # rejoue depuis les caches, 0 réseau, 0 appel LLM
node scripts/proposer-fiche.mjs FR-2026-0115 --generee --simuler   # le message Telegram tel qu'il partirait, sans Neon
node scripts/qa/test-generer-fiche.mjs                              # 40 contrôles (dans `npm run qa`)
```

| Fichier | Rôle |
|---|---|
| `scripts/lib/fiche-sources.mjs` | sources de la mémoire + découverte Bing ; lecture (réutilise `lirePage`, `rattacher`) ; cache `.cache/fiches/pages` |
| `scripts/lib/fiche-extraction.mjs` | contrat d'extraction (prompt + schéma) et **gardes** |
| `scripts/lib/fiche-composer.mjs` | fusion des sources, état judiciaire, inconnues, **qualification** |
| `scripts/lib/fiche-rendu.mjs` | rendu Markdown (complet / sûr pour le dépôt) |
| `scripts/generer-fiche.mjs` | commande |
| `scripts/proposer-fiche.mjs`, `lib/fiche-page.mjs`, `lib/discovery-messages.mjs` | **extension minimale** : `--generee`, `--simuler`, `payload.page.generation` (qualification + points d'attention), 2 lignes dans le message |

Réutilisé tel quel : `lirePage`/`rechercherBing`/`canonique`/`admissible`, `rattacher`, le format de dossier et `payloadFiche`/`hashDossier`, le bouton `APPROUVER LA FICHE` (callback `VALIDATE`), HOLD, OpenRouter + DeepSeek (modèle de la Maintenance). Aucun nouveau schéma de bloc : les 7 blocs demandés sont portés par `etat_actuel`/`synthese`, `deroule`, `faits`, `reactions`, les types `mesure_*`, les sources du déroulé et `inconnues`.

## Ce que la matière permet (constat avant d'écrire l'extracteur)
Neon ne conserve **aucun texte d'article** (empreinte + claims seulement). Les corps sont relus à la volée : les pages lisibles sont lues, les 403/503 sont notées « inaccessibles » avec leur motif, sans contournement ; rien n'est déduit d'un titre. Les sources de la mémoire (1 à 4 par affaire) sont complétées par une recherche Bing Actualités (URL éditeur directe).

## Gardes (toutes testées avec contre-exemple)
Citation **entière** présente dans le corps · date d'événement acceptée seulement si **écrite** (jour+mois(+année)) · durées/peines du texte ⊂ citation · racines d'issue (condamné/relaxé…) ⊂ citation · appel et caractère définitif = **acte écrit** (jamais une juridiction ni une absence) · réquisitions ≠ décision · mesure « réalisée » rabaissée en « annoncée » si la citation annonce · propos **entre guillemets** seulement, personnes nommées ou institutions · portée `affaire|établissement` retenue, `autre_affaire|territoire` classés à part (échec fermé si absente) · nom du mis en cause, âge, nombre exact d'enfants/familles, détail graphique · décision sans phrase extraite → phrase structurée (jamais la citation brute) · garde finale sur la page produite.

Qualification : `BLOQUE` (HOLD ; aucune source lisible ; état de la carte contredit, périmé ou non étayé ; relaxe sans décision lue ; « définitive » sans finalité écrite ; nom/âge/nombre dans la page) · `PAS_D_ENRICHISSEMENT` (< 2 étapes, aucune parole) · `A_REVOIR` (divergence entre sources, identité ambiguë d'une source de la mémoire, évolution judiciaire) · `READY`. **L'état de la carte n'est jamais modifié** : un écart produit une proposition à la Maintenance.

## Démonstration (12 affaires hors pilotes ; fiches consultables : `docs/industrialisation/fiches-generees/`)

Développement : FR-2026-0004, -0117, -0001, -0033 (échantillon `dev`). Validation : FR-2026-0046, -0115, -0029, -0024, -0026, PARIS-010 (`holdout`/vierge). FR-2026-0038 et -0047 ajoutées en fin de parcours.

| Affaire | Configuration | Sources lues/total | Qualification | Motif |
|---|---|---|---|---|
| FR-2026-0115 Tarnos | riche, réactions de la mairie, mesures | 9/10 | **READY** (12 étapes, 3 paroles) | |
| FR-2026-0046 Rezé | évolution judiciaire (appel) | 2/8 | **READY** (10 étapes, 4 paroles) | échéance d'appel 16–18/11 non trouvée (voir limites) |
| FR-2026-0038 Saché | structure non nommée, procureure | 4/5 | **READY** (9 étapes) | |
| FR-2026-0117 St-Aubin-d'Aubigné | récente | 6/9 | **A_REVOIR** | MEE datée 21 vs 22/09 selon les sources |
| PARIS-010 | pauvre (1 source en base) → 4 lues | 4/7 | BLOQUE | carte « enquête », sources : condamnation 16/10/2026 → proposition d'état |
| FR-2026-0047 Marseille | | 4/8 | BLOQUE | carte « procès », sources : condamnation → proposition d'état |
| FR-2026-0001 Aqueduc (sœur) / -0029 Chauny | | 3/8 · 3/5 | BLOQUE | carte « condamnation » non étayée par les sources lues |
| FR-2026-0024 Belzunce | carte « relaxe/classement » | 1/8 | BLOQUE | aucune décision de relaxe lue (R5) |
| FR-2026-0004 Vigée-Lebrun | HOLD | 7/9 | BLOQUE | HOLD (+ état périmé) |
| FR-2026-0033, -0026 | rien d'exploitable | 0/3 · 0/2 | BLOQUE | 403/503, ou page ambiguë ; **aucun enrichissement justifié** |

Les deux « propositions d'état » (PARIS-010, FR-2026-0047) recoupent le diagnostic de GENERALISATION #1 (PARIS-010 : condamnation du 16/10/2026) : le circuit retrouve le retard d'état de façon indépendante, mais ne l'applique pas.

## Défauts observés → causes → corrections (boucle)
1. 28 étapes et mélange d'affaires (série de plusieurs animateurs) → champ **portée** obligatoire + dispositif de décision en une phrase.
2. Doublons massifs (même fait dans 7 articles) → fusion par acte unique (garde à vue, MEE…) et par jour écrit ; mesures d'étiquettes différentes fusionnées.
3. « Anne Hidalgo » → « anne » ; « Selon X, Un… » → majuscules corrigées sur mots courants seulement.
4. Citation brute d'une décision republiée telle quelle (âge « sexagénaire ») → phrase structurée ; âge, nombre de **familles** ajoutés aux interdits.
5. Une remise en liberté prise pour une « issue » écrasait l'état tiré des événements → seules les 5 issues font l'état.
6. Cinq citations quasi identiques d'une procureure → déclarations redondantes avec le déroulé écartées, 2 par acteur.
7. Pages de recherche hors sujet comptées comme « identité ambiguë majeure » → bruit de recherche ≠ ambiguïté.
Disclosure : j'ai lu les fiches de validation (0046, 0115, 0038) pour trouver les défauts 4–7 ; ces corrections sont structurelles (testées avec contre-exemples), non liées à ces affaires, mais l'échantillon n'est plus « aveugle » pour elles.

## Coût et mesures
63 appels LLM réels (dont les itérations de prompt et 2 timeouts), 287 k tokens en entrée, 706 k en sortie, **0,58 USD** au total (≈ 0,01 à 0,015 USD par article ; ≈ 0,05 USD par affaire riche). 85 réponses relues depuis le cache disque (0 USD). DeepSeek « raisonne » : ~2 minutes par article ; 4 articles en parallèle.

## Limites et obstacles à la généralisation
- **Accès** : ~20 % des pages en 403/503 (Zinfos, Clicanoo, Libération, Le Télégramme…) ; certains « libres » sont des corps tronqués. Aucun contournement.
- **Rappel de la découverte** : Bing rend des articles récents ; FR-2026-0046 n'a pas l'échéance d'appel de novembre. La découverte de sources est le premier levier de qualité, avant le modèle.
- **Structure non nommée / commune imprécise** (FR-2026-0026, -0038) : rattachement par type de structure + rôle + faits, donc plus fragile ; les cas imprécis sortent en `BLOQUE` ou `A_REVOIR`.
- **Un seul modèle, aucun second vérificateur** : les gardes déterministes ont attrapé 9 à 25 éléments par affaire riche ; je n'ai pas démontré qu'un second modèle apporterait quelque chose.
- **Qualité du texte** : phrases extraites, donc rédaction hétérogène (« Selon X, l'homme… ») ; pas de synthèse rédigée (volontaire).
- **Pas de vérité humaine** : la qualité factuelle n'a été vérifiée que par les gardes et la relecture de quatre fiches.

## Reste à faire (session 2)
`promouvoir-fiche` : après approbation de l'empreinte, écrire le dossier dans `data/hub-matiere/isoles.json` (même hash) → la page se publie par le circuit existant ; revue humaine des 4 fiches proposables ; brancher la proposition d'état aux Maintenance ; tests de rejeu sur les 44 affaires.
