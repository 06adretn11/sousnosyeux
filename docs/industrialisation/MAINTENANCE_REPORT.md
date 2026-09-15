# Rapport d’entretien — sousnosyeux

_Généré le 2026-09-15 · mode **observation** · 0 mutation · corpus `data/cases.json`_

> Ce rapport ne modifie rien. Il liste ce qu’un validateur humain doit trancher.

| | |
|---|---|
| Affaires analysées | 53 |
| Constats bloquants | **10** |
| Alertes | 55 |
| Nouvelles depuis le dernier passage | **0** |
| Inchangées | 65 |
| Résolues depuis le dernier passage | 0 |

## File de revue, par priorité

### P1 — issue favorable ou contradictoire (traiter en premier) — 2

| | Règle | Cible | Constat | État |
|---|---|---|---|---|
| 🔴 | `R5_relaxe_encore_publiee` | `FR-2026-0024` | issue favorable (relaxe / non-lieu / classement) mais fiche toujours publiée — retrait requis | inchangée |
| 🔴 | `R5_relaxe_encore_publiee` | `FR-2026-0035` | issue favorable (relaxe / non-lieu / classement) mais fiche toujours publiée — retrait requis | inchangée |

### P4 — doublon probable — 4

| | Règle | Cible | Constat | État |
|---|---|---|---|---|
| 🔴 | `R9_doublon_probable` | `FR-2026-0003/PARIS-010` | doublon probable (grands champs::paris 20e) — même URL de source, même date de publication, coordonnées identiques — `École Grands Champs ≡ École maternelle Grands-Champs` | inchangée |
| 🔴 | `R9_doublon_probable` | `FR-2026-0007/PARIS-007` | doublon probable (reuilly::paris 12e) — même URL de source, même date de publication — `École maternelle Reuilly II ≡ École maternelle Reuilly` | inchangée |
| 🔴 | `R9_doublon_probable` | `FR-2026-0008/PARIS-008` | doublon probable (boulard::paris 14e) — même URL de source, même date de publication — `École Boulard ≡ École maternelle Boulard` | inchangée |
| 🟠 | `R9_doublon_probable` | `FR-2026-0023/PARIS-009` | doublon probable (faidherbe::paris 11e) — coordonnées identiques — `École maternelle de la rue Faidherbe ≡ École maternelle Faidherbe` | inchangée |

### P5 — défaut de source bloquant — 5

| | Règle | Cible | Constat | État |
|---|---|---|---|---|
| 🔴 | `R4_source_primaire_non_admissible` | `FR-2026-0008` | source primaire non admissible : encyclopédie collaborative — `Wikipédia` | inchangée |
| 🔴 | `R4_source_primaire_non_admissible` | `PARIS-001` | source primaire non admissible : agrégateur sans rédaction — `MSN / reprise presse` | inchangée |
| 🔴 | `R4_source_primaire_sans_date` | `POC-02` | source primaire sans date de publication — `Ouest-France` | inchangée |
| 🔴 | `R4_source_primaire_sans_date` | `POC-09` | source primaire sans date de publication — `France 3` | inchangée |
| 🔴 | `R4_source_primaire_sans_date` | `POC-10` | source primaire sans date de publication — `ELLE` | inchangée |

### P6 — source dégradée — 1

| | Règle | Cible | Constat | État |
|---|---|---|---|---|
| 🟠 | `R4_source_secondaire_non_admissible` | `FR-2026-0016` | source secondaire non admissible : contenu sous paywall, non vérifiable publiquement — `Mediapart` | inchangée |

### P8 — traçabilité de revue — 53

| | Règle | Cible | Constat | État |
|---|---|---|---|---|
| 🟠 | `R5_verified_at_absent` | `FR-2026-0001` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0002` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0003` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0004` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0005` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0006` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0007` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0008` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0011` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0012` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0013` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0016` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0020` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0021` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0022` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0023` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0024` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0025` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0026` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0027` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0028` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0029` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0030` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0031` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0032` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0033` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0035` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0036` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0037` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0038` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0041` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0042` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0043` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0044` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0045` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0046` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `FR-2026-0047` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `PARIS-001` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `PARIS-004` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `PARIS-006` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `PARIS-007` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `PARIS-008` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `PARIS-009` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `PARIS-010` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-02` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-03` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-04` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-05` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-06` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-07` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-08` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-09` | fiche publiée sans date de vérification humaine | inchangée |
| 🟠 | `R5_verified_at_absent` | `POC-10` | fiche publiée sans date de vérification humaine | inchangée |

## Ce que ce scanner ne voit pas

- la disponibilité réelle des URL (aucun accès réseau) ;
- les noms de personnes non détectables par motif ;
- l’exactitude judiciaire d’une affirmation ;
- une évolution non encore reflétée dans le corpus : le scanner observe `data/cases.json`,
  pas la presse. Il ne remplace pas la veille (`scripts/watch-updates.mjs`).
