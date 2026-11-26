#!/bin/sh
# =====================================================================
# scripts/publier-projection.sh — commit + push de la projection (étape « Publier la projection » de sny-clics et sny-telegram).
#
# Remplace `git push origin HEAD:main || (git pull --rebase origin main && git push origin HEAD:main)`. Le rejeu par rebase fusionne PAR BLOCS : si main a avancé pendant
# le passage (une autre promotion, une restauration, un correctif du code de promotion), il rejouerait par-dessus un résultat calculé avec l'ancienne logique ou les
# anciennes données. Règle ici :
#   - push accepté                                                        → fini ;
#   - push refusé et main n'a PAS touché de chemin sensible depuis notre base → rebase puis push (sans risque : rien de ce qui détermine la décision n'a bougé) ;
#   - push refusé et main a touché data/, scripts/, web/ ou .github/workflows/ → ABANDON : notre commit n'est pas rejoué, l'arbre est remis sur main, la sortie
#     `abandon=true` est écrite et l'affaire est recalculée au PASSAGE SUIVANT (relecture de Neon, nouvelle décision). Jamais de force-push, jamais d'annulation de run.
# Aucun secret, aucun appel réseau autre que git. Variables de test : SNY_REMOTE, SNY_BRANCH, SNY_CHEMINS_SENSIBLES.
# =====================================================================
set -eu
REMOTE="${SNY_REMOTE:-origin}"
BRANCHE="${SNY_BRANCH:-main}"
SENSIBLES="${SNY_CHEMINS_SENSIBLES:-data/ scripts/ web/ .github/workflows/}"
sortie() { if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "abandon=$1" >> "$GITHUB_OUTPUT"; fi; }
# PANNE DISTANTE ≠ MAIN QUI A AVANCÉ (audit du 26/11/2026 : « remote rejected … Internal Server Error » de GitHub, 24/11 à 21:30, présentée comme « main a avancé » puis publication bloquée).
# 3 essais (0 s, 5 s, 10 s ; SNY_PUSH_ATTENTE pour les tests) sur une erreur DISTANTE ; un refus « fetch first / non-fast-forward » n'est PAS retenté ici : il suit la règle ci-dessous.
PANNE=0
pousser() {
  essai=1; PANNE=0
  while :; do
    if SORTIE_PUSH="$(git push "$REMOTE" "HEAD:$BRANCHE" 2>&1)"; then echo "$SORTIE_PUSH"; return 0; fi
    echo "$SORTIE_PUSH"
    case "$SORTIE_PUSH" in *"fetch first"*|*"non-fast-forward"*) return 1 ;; esac
    PANNE=1
    if [ "$essai" -ge 3 ]; then return 1; fi
    echo "erreur distante transitoire (essai $essai/3) : nouvel essai"
    sleep $((essai * ${SNY_PUSH_ATTENTE:-5}))
    essai=$((essai + 1))
  done
}

git config user.name "sny-bot"
git config user.email "sny-bot@users.noreply.github.com"
git add data/cases.json data/evenements.json data/hub-matiere/isoles.json
if [ -d data/hub-approuve ]; then git add data/hub-approuve; fi
if ! git diff --cached --quiet; then
  git commit -m "publication: mise à jour validée par l'éditeur (${RECON_IDS:-} ${FICHES:-})"
fi

if pousser; then sortie false; exit 0; fi
# Erreur distante persistante après 3 essais : rien n'est publié, rien n'est supposé sur main ; le passage suivant (sny-clics) rejoue sans nouveau clic.
if [ "$PANNE" = 1 ]; then echo "push impossible : erreur distante persistante (3 essais) — publication NON effectuée"; exit 1; fi

echo "push refusé : $BRANCHE a avancé pendant le passage"
git fetch "$REMOTE" "$BRANCHE"
BASE="$(git merge-base HEAD FETCH_HEAD)"
TOUCHES=""
for f in $(git diff --name-only "$BASE" FETCH_HEAD); do
  for p in $SENSIBLES; do
    case "$f" in "$p"*) TOUCHES="$TOUCHES $f" ;; esac
  done
done

if [ -n "$TOUCHES" ]; then
  # Un commit à nous existe-t-il ? (sinon rien à abandonner : l'arbre est simplement en retard sur main)
  if [ "$(git rev-parse HEAD)" = "$BASE" ]; then echo "rien à publier dans ce passage"; sortie false; exit 0; fi
  echo "::warning::ABANDON de la publication de ce passage : $BRANCHE a modifié des chemins qui déterminent la décision ($TOUCHES). Résultat calculé avec l'état précédent NON rejoué ; recalcul au prochain passage."
  git reset --hard FETCH_HEAD
  sortie true
  exit 0
fi

if ! git rebase FETCH_HEAD; then git rebase --abort || true; echo "rebase impossible"; exit 1; fi
pousser || exit 1
sortie false
