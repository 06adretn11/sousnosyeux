// =====================================================================
// scripts/qa/test-lexique.mjs — deux défauts du filtre déterministe, mesurés sur cas réels.
//
//   1. « agressée sexuellement » (forme du témoignage de la victime) n'était pas reconnu :
//      le signal France 3 / collège d'Amiens (01/10/2026) était rejeté STRUCTURE_SANS_FAIT.
//   2. « viol » était cherché en sous-chaîne : « violent », « violemment », « hyperviolent »
//      déclenchaient un fait grave (et, par accident, « violences sexuelles » n'était reconnu
//      que grâce à ce défaut — il est désormais nommé).
//
// Usage : node scripts/qa/test-lexique.mjs
// =====================================================================
import { filtrer } from '../lib/capteurs.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`);
  if (!cond) ko++;
};

// ── Cas réel : France 3 Hauts-de-France, 1er octobre 2026 ───────────────
const amiens = {
  title: 'TÉMOIGNAGE. Agressée sexuellement dans son collège par un professeur, une adolescente et sa mère se confient sur leur combat',
  excerpt: "Alors que sa fille de 14 ans aurait été agressée sexuellement par un professeur de son collège à Amiens, une mère de famille tente tout pour qu'elle puisse continuer à étudier.",
};
verifie('Amiens (titre + extrait) → CANDIDATE', filtrer(amiens).decision === 'CANDIDATE', JSON.stringify(filtrer(amiens)));
verifie('Amiens (titre seul, comme discovery-quotidien) → CANDIDATE', filtrer({ title: amiens.title }).decision === 'CANDIDATE');

// ── 1. formes d'« agressée sexuellement » ──────────────────────────────
for (const t of ['une élève agressée sexuellement au collège', 'un enfant agressé sexuellement à la crèche', 'des fillettes agressées sexuellement à l’école']) {
  verifie(`reconnu : « ${t} »`, filtrer({ title: t }).faits.some((f) => f.startsWith('agress') && f.endsWith('sexuellement')));
}

// ── 2. « viol » = un mot, pas un préfixe ───────────────────────────────
verifie('« viol » reconnu comme mot', filtrer({ title: 'Un viol dans une école maternelle' }).faits.includes('viol'));
verifie('« viols » reconnu', filtrer({ title: 'Procès pour viols à la crèche' }).faits.includes('viols'));
verifie('« violée » reconnu (forme dérivée listée)', filtrer({ title: 'une élève violée par son professeur' }).faits.includes('violee'));
verifie('« violeur » reconnu', filtrer({ title: 'un violeur présumé arrêté près d’une école' }).faits.includes('violeur'));
for (const t of ['Un violent accident entre deux voitures', 'une rixe violente devant le lycée', 'des élèves frappent violemment un surveillant', 'blocage hyperviolent devant le collège']) {
  const f = filtrer({ title: t });
  verifie(`« ${t} » ne déclenche pas « viol »`, !f.faits.some((x) => /^viol/.test(x)), JSON.stringify(f.faits));
}

// ── Non-régression : ce qui était reconnu l'est toujours ───────────────
verifie('« violences sexuelles » reconnu comme fait grave (R2)', filtrer({ title: 'Violences sexuelles sur 22 enfants : un intervenant en maternelle accusé' }).decision === 'CANDIDATE');
verifie('« agression sexuelle » reconnu', filtrer({ title: 'agression sexuelle dans une crèche' }).faits.includes('agression sexuelle'));
verifie('« violences » restent un fait (R1 avec structure)', filtrer({ title: 'Violences dans une école maternelle' }).decision === 'CANDIDATE');
verifie('rejet inchangé : fait sans mineur ni structure', filtrer({ title: 'Une femme enceinte retrouvée morte' }).decision === 'REJECT');

console.log(ko ? `\nLEXIQUE_FAILED — ${ko} échec(s)` : '\nLEXIQUE_OK');
process.exit(ko ? 1 : 0);
