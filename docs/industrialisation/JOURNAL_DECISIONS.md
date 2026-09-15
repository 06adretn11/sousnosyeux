# Journal de décisions — session pré-exécuteur

_14–15 septembre 2026 · branche `feat/hub-pre-executeur`._

Hypothèses prises seul, parce que réversibles et sans effet sur la doctrine, les données
réelles ou la production. Chacune peut être annulée sans migration inverse.

| # | Décision | Alternative écartée | Pourquoi | Réversibilité |
|---|---|---|---|---|
| J1 | Brouillons de hub sous `web/src/pages/brouillons/hubs/[hub].astro`, `getStaticPaths` vide sauf si `SNY_DRAFTS=1` | dossier `_drafts/` (jamais routé par Astro) | un dossier `_` ne peut **jamais** être rendu : impossible de prouver quoi que ce soit. Le drapeau d'environnement permet de prouver les deux états (build public = 0 hub, build de revue = N hubs) | supprimer le fichier |
| J2 | `fiabilite_info_10` classé **interne** | le garder public | publié à côté d'une affaire judiciaire, un « score 10/10 » se lit comme un degré de certitude sur les faits — exactement la confusion que le contrat interdit. Le front ne l'affichait pas : aucune perte | le retirer de `INTERNAL_FIELDS` |
| J3 | `commentaire_validation` retiré de l'export **sans** backfill vers `resume_public` | backfill immédiat | le backfill est une mutation de données réelles, réservée à Adrien. La colonne cible existe (004) mais reste vide | régénérer via `sync-data.mjs` |
| J4 | `contact@sousnosyeux.fr` → `.org` **retiré de cette branche** et isolé en candidat non commité | corriger directement dans le chantier | une mention légale ne se corrige pas au milieu de 46 autres fichiers, et rien ne prouve que la boîte `.org` reçoit réellement du courrier | le candidat n'est pas commité |
| J5 | Invariants du contrat contrôlés **hors base**, pas par contraintes SQL | `NOT NULL` / `CHECK` dans 004 | 53 fiches publiées violent déjà au moins un invariant : les imposer au moteur rendrait la base non écrivable. On observe d'abord, on contraint ensuite | ajouter les contraintes plus tard |
| J6 | Une source non admissible en **secondaire** = alerte, pas blocage | blocage | elle est citée au lecteur comme vérification possible, donc elle mérite un signalement ; mais la bloquer supprimerait des sources secondaires utiles sans décision humaine | changer la sévérité |
| J7 | Un doublon avec **même URL de source** = bloquant ; sans URL commune = alerte | tout bloquant | le cas Faidherbe prouve que *même établissement + même rôle* peut désigner deux affaires réelles. Un dédoublonnage trop zélé effacerait une affaire distincte | ajuster `ruleDuplicates` |
| J8 | `run-all.mjs` : le corpus réel n'est **pas** bloquant par défaut | bloquant | ses constats portent sur des données publiées dont la correction appartient à Adrien. Un contrôle qu'on ne peut pas satisfaire finit désactivé. `--strict` le rend bloquant | drapeau `--strict` |
| J9 | Vue `cases_public_v2` **ajoutée** à côté de `cases_public` | remplacer la vue | la bascule du front devient réversible sans migration inverse | `drop view` |
| J10 | `data/maintenance-report.json` suivi par Git, `maintenance-state.json` ignoré | ignorer les deux | le rapport est la preuve machine demandée ; l'état est un cache local qui changerait à chaque exécution | une ligne de `.gitignore` |
| J11 | Cluster Postgres éphémère local pour tester 004 | contrôles statiques seulement, porte 2 `PROVISIONAL` | `psql` 17 était disponible : une preuve d'exécution valait mieux qu'une preuve de relecture | rien à annuler (cluster jetable, hors dépôt) |
| J12 | Fixtures entièrement **fictives** (établissements, communes, médias, URL inventés) | dériver des fixtures du corpus réel | une fixture dérivée du réel se retrouve tôt ou tard importée ou citée. Le préfixe `FIX-`/`CYC-` et le champ `avertissement` rendent la confusion impossible | — |

## Sous-chantiers marqués `BLOCKED`

| Sous-chantier | Blocage matériel | Débloqué par |
|---|---|---|
| Vérification du volume réel en base (112 vs 53) | aucun accès Supabase dans cette session | Adrien exécute `sync-data.mjs --dry-run` |
| Contrôle d'accessibilité des URL de source | aucun accès réseau sortant utilisé (contrainte de périmètre) | exécution locale de `check-sources --live` (à écrire) |
| Revue juridique du contrat éditorial | compétence externe | conseil en droit de la presse |
| `reviews` polymorphe (affaire **ou** hub) | `reviews.case_id` est `NOT NULL` dans `schema.sql` : l'assouplir n'est **pas** additif | décision explicite d'Adrien (voir D5) |
| 2 cycles de maintenance **réels** | suppose de corriger des données publiées | décisions D1 et D2 |
