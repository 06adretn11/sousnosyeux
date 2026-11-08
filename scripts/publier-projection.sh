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

git config user.name "sny-bot"
git config user.email "sny-bot@users.noreply.github.com"
git add data/cases.json data/evenements.json data/hub-matiere/isoles.json
if [ -d data/hub-approuve ]; then git add data/hub-approuve; fi
if ! git diff --cached --quiet; then
  git commit -m "publication: mise à jour validée par l'éditeur (${RECON_IDS:-} ${FICHES:-})"
fi

if git push "$REMOTE" "HEAD:$BRANCHE"; then sortie false; exit 0; fi

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
git push "$REMOTE" "HEAD:$BRANCHE"
sortie false
