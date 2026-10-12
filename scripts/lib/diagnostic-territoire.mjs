// =====================================================================
// scripts/lib/diagnostic-territoire.mjs — « ce territoire mérite-t-il (encore) un Hub ? » Fonctions PURES, sans scoring complexe.
//
// Un territoire = un Hub existant (périmètre : commune ou département) ou un département sans Hub. Le diagnostic compare l'état courant
// au PRÉCÉDENT (instantané) et rend UNE sortie :
//   NO_ACTION · INTEGRER_HUB (affaire publique du périmètre absente du Hub) · ENRICHIR_HUB (matière nouvelle depuis l'instantané)
//   · PROPOSER_NOUVEAU_HUB (≥ 3 affaires publiques, aucun Hub) · REVIEW (affaire non publique à arbitrer en plus).
// Ne notifie JAMAIS sans changement significatif : `significatif` n'est vrai que si les compteurs ont bougé depuis l'instantané.
// =====================================================================

export const HUBS_PERIMETRES = {
  'paris-11e': { titre: 'Paris 11e', test: (c) => c.commune === 'Paris 11e' },
  'bordeaux-gironde': { titre: 'Bordeaux / Gironde', test: (c) => c.departement === 'Gironde' },
  'hautes-alpes': { titre: 'Hautes-Alpes', test: (c) => c.departement === 'Hautes-Alpes' },
};

/** Instantané comparable (nombres seulement) : ce qui change = ce qui est nouveau. */
export const instantane = (e) => ({ publiques: e.publiques.length, horsHub: e.horsHub.length, candidatesValidees: e.candidatesValidees,
  reviewNonPublic: e.reviewNonPublic, evenements: e.evenements, reactions: e.reactions, sources: e.sources });

/**
 * @param {object} e   état courant du territoire : {hub, publiques[], horsHub[], candidatesValidees, reviewNonPublic, evenements, reactions, sources}
 * @param {object|null} prev  instantané précédent (null = premier passage : base de référence, jamais de notification)
 * @returns {{decision:string, significatif:boolean, pourquoi:string[]}}
 */
export function diagnostiquer(e, prev) {
  const s = instantane(e);
  const hausse = (k) => (prev ? Math.max(0, s[k] - (prev[k] ?? 0)) : 0);
  const pourquoi = [];
  let decision = 'NO_ACTION';
  if (e.hub) {
    if (e.horsHub.length) { decision = 'INTEGRER_HUB'; pourquoi.push(`${e.horsHub.length} affaire(s) publique(s) du périmètre absente(s) du Hub : ${e.horsHub.join(', ')}`); }
    else if (hausse('evenements') + hausse('reactions') + hausse('sources') + hausse('publiques') + hausse('candidatesValidees') > 0) {
      decision = 'ENRICHIR_HUB';
      if (hausse('publiques')) pourquoi.push(`+${hausse('publiques')} affaire(s) publique(s)`);
      if (hausse('candidatesValidees')) pourquoi.push(`+${hausse('candidatesValidees')} candidate(s) validée(s)`);
      if (hausse('evenements')) pourquoi.push(`+${hausse('evenements')} événement(s) validé(s)`);
      if (hausse('reactions')) pourquoi.push(`+${hausse('reactions')} réaction(s) institutionnelle(s) ou mobilisation(s)`);
      if (hausse('sources')) pourquoi.push(`+${hausse('sources')} source(s)`);
    } else if (hausse('reviewNonPublic')) { decision = 'REVIEW'; pourquoi.push(`+${hausse('reviewNonPublic')} affaire(s) mise(s) de côté (REVIEW) dans le périmètre`); }
  } else if (e.publiques.length >= 3) {
    decision = 'PROPOSER_NOUVEAU_HUB';
    pourquoi.push(`${e.publiques.length} affaires publiques sans Hub`);
  } else if (e.publiques.length + e.candidatesValidees >= 3 && hausse('candidatesValidees')) {
    decision = 'REVIEW'; pourquoi.push('affaires publiques et candidates validées atteignent 3 : un Hub deviendrait possible');
  }
  // Significatif = quelque chose a BOUGÉ depuis l'instantané (jamais au premier passage) ET la sortie appelle une décision.
  const bouge = !!prev && Object.keys(s).some((k) => s[k] !== prev[k]);
  return { decision, significatif: decision !== 'NO_ACTION' && bouge, pourquoi };
}

/** Message Telegram d'une proposition de décision territoriale (aucun bouton : la décision se prend dans la conversation). */
export function messageDiagnostic(terr, e, d) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const attendu = { INTEGRER_HUB: 'intégrer ces affaires au Hub existant (rédaction du dossier + validation)', ENRICHIR_HUB: 'décider si la matière nouvelle change le Hub (dossier, réponses publiques)',
    PROPOSER_NOUVEAU_HUB: 'décider d’ouvrir un Hub pour ce territoire (aucun n’est publié sans ta validation)', REVIEW: 'arbitrer les affaires non publiques du territoire' }[d.decision];
  return [
    `🗺 <b>TERRITOIRE · ${esc(d.decision)}</b> · ${esc(terr)}`,
    '', '<b>Pourquoi maintenant</b> : ' + d.pourquoi.map(esc).join(' ; '),
    `<b>Affaires publiques</b> : ${e.publiques.length}${e.hub ? ` (Hub : ${esc(e.hub)})` : ' (aucun Hub)'} · candidates validées : ${e.candidatesValidees} · REVIEW non publiques : ${e.reviewNonPublic}`,
    `<b>Matière</b> : ${e.evenements} événement(s) validé(s), ${e.reactions} réaction(s)/mobilisation(s), ${e.sources} source(s)`,
    `<b>Décision attendue</b> : ${esc(attendu)}.`,
    '', 'Rien n’est publié automatiquement.',
  ].join('\n');
}
