// =====================================================================
// scripts/lib/discovery-messages.mjs — les messages Telegram du run Discovery (HTML Telegram).
//
// Deux formats :
//   AFFAIRE POTENTIELLE        [VALIDATE]              [REVIEW] [REJECT]
//   RAPPROCHEMENT (comparatif) [RAPPROCHER] [CRÉER]    [REVIEW] [REJECT]   (NOUVEAU SIGNAL · AFFAIRE EXISTANTE · ANALYSE · DÉCISION)
// Règles : liens éditeur DIRECTS obligatoires, 1 à 3 articles, pas de longue citation, aucun détail technique.
// Les liens sont écrits en clair (aperçu désactivé à l'envoi) : un lien non cliquable reste copiable.
// =====================================================================
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const jj = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : 'date inconnue');
const lien = (a) => `📰 ${esc(a.media || 'média')} → ${esc(a.url)}`;

/** Réaction ou mesure d'une institution (hors état judiciaire) : fait structuré, libellé public tiré d'une table fermée. */
const blocInstitutionnel = (p) => (p.institutionnel
  ? ['🏛 <b>ÉVÉNEMENT INSTITUTIONNEL</b> (sans effet sur l’état judiciaire)', `${esc(p.institutionnel.libelle_public)} — mesure ${esc(p.institutionnel.realisation)}.`, '']
  : []);

/** Au plus `n` articles, un par média, dans l'ordre. */
function trois(articles, n = 3) {
  const vus = new Set();
  return (articles || []).filter((a) => /^https?:\/\//.test(a.url || '') && !vus.has(a.media) && vus.add(a.media)).slice(0, n);
}

export function messageDecision(p, recommendation) {
  // Un candidat de rattachement (payload.attach) → message COMPARATIF, quelle que soit la recommandation : c'est l'humain qui tranche.
  if (p.attach || recommendation === 'ATTACH_EXISTING') return messageRapprochement(p, recommendation);
  const nomme = p.etablissement_nomme !== false && p.etablissement;
  const matches = p.possible_matches_sny || [];
  const sny = recommendation === 'NEW_CASE_CANDIDATE'
    ? 'SNY : aucune correspondance dans la base.' + (matches.length ? `\n(${matches.length} autre(s) affaire(s) SNY dans la commune, autre(s) établissement(s) : ${matches.map((v) => v.case_id).join(', ')}.)` : '')
      + (p.rapprochement_ecarte ? `\nℹ Rapprochement avec ${esc(p.rapprochement_ecarte.case_id)} écarté : ${esc(cut(p.rapprochement_ecarte.raison, 140))}.` : '')
    : `SNY : correspondance à vérifier${matches.length ? ' — ' + matches.map((v) => v.case_id).join(', ') : ''}.`;
  const reco = recommendation === 'NEW_CASE_CANDIDATE'
    ? `→ VALIDATE : ${p.independantes || p.medias} sources indépendantes recoupent les faits.`
    : '→ REVIEW : signal crédible, matière à confirmer avant de valider ou rejeter.';
  return [
    `🆕 <b>DISCOVERY</b> · AFFAIRE POTENTIELLE · ${esc(p.commune)}`,
    '',
    `<b>${esc(nomme ? p.etablissement : 'Structure non nommée')}</b>${p.structure && p.structure !== 'autre' ? ' · ' + esc(p.structure) : ''}`,
    '',
    esc(cut(p.resume, 420)),
    '',
    `Dernier événement : ${jj(p.dernier_evenement)}`,
    '',
    ...trois(p.articles).map(lien),
    '',
    ...blocInstitutionnel(p),
    esc(sny),
    p.avertissement ? `\n⚠ ${esc(cut(p.avertissement, 200))}` : '',
    '',
    esc(reco),
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * RAPPROCHEMENT — message comparatif. Quatre blocs : NOUVEAU SIGNAL · AFFAIRE EXISTANTE · ANALYSE · DÉCISION.
 * Seules les sources historiques VÉRIFIÉES (relues, cohérentes avec l'affaire) sont montrées comme liens ; les autres sont
 * comptées, jamais présentées comme preuves. Un message ancien (sans drapeau `verifiee`) est affiché tel quel.
 */
export function messageRapprochement(p, recommendation) {
  const a = p.attach;
  const fort = recommendation === 'ATTACH_EXISTING';
  const sources = a.sources || [];
  const montrees = sources.filter((s) => s.verifiee !== false);
  const masquees = sources.length - montrees.length;
  const pour = (a.pourquoi || []).map((x) => `• ${esc(cut(x, 160))}`);
  const contre = a.contre?.length ? a.contre : (a.divergence ? [a.divergence] : []);
  return [
    `🆕 <b>DISCOVERY</b> · 🔗 ${fort ? 'RAPPROCHEMENT PROPOSÉ' : 'RAPPROCHEMENT À ARBITRER'}`,
    '',
    '<b>NOUVEAU SIGNAL</b>',
    esc(cut(p.resume, 360)),
    `📍 ${esc(p.commune)}${p.etablissement ? ' · ' + esc(p.etablissement) : ''} · dernier événement ${jj(p.dernier_evenement)}`,
    ...trois(a.nouvelles).map(lien),
    '',
    ...blocInstitutionnel(p),
    '<b>AFFAIRE EXISTANTE</b>',
    `${esc(a.case_id)} · ${esc(a.etablissement)} · ${esc(a.commune)}${a.role ? ' · ' + esc(a.role) : ''} · état « ${esc(a.statut)} »`,
    a.resume ? esc(cut(a.resume, 260)) : '',
    ...trois(montrees).map(lien),
    masquees ? `(${masquees} source(s) historique(s) non vérifiable(s) — lien indisponible ou sans rapport : non retenue(s) comme preuve)` : '',
    '',
    '<b>ANALYSE</b>',
    pour.length ? 'Pour :' : 'Pour : aucun indice établi.',
    ...pour,
    contre.length ? '\nContre / manquant :' : '',
    ...contre.map((x) => `• ${esc(cut(x, 200))}`),
    `\nIncertitude : ${a.incertitude || (fort ? 'modérée' : 'élevée')}`,
    '',
    '<b>DÉCISION</b>',
    `🔗 RAPPROCHER : ajouter ces articles aux sources de l’affaire existante (son état judiciaire n’est pas modifié)${p.institutionnel ? ' et consigner l’événement institutionnel signalé' : ''}.`,
    '🆕 CRÉER : ouvrir une nouvelle affaire (candidate, non publiée).',
    '🟡 REVIEW : reporter · ⛔ REJECT : écarter.',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Boutons : `NC` = nouvelle-affaire (new_case_proposals). Un candidat de rattachement ⇒ RAPPROCHER et CRÉER sont offerts
 * ensemble (l'humain tranche) ; sinon VALIDATE seul, comme avant. Callbacks inchangés : sny:NC:<ACTION>:<clé>.
 */
export function boutons(recommendation, cle, payload = null) {
  const r2 = [
    { text: '🟡 REVIEW', callback_data: `sny:NC:REVIEW:${cle}` },
    { text: '⛔ REJECT', callback_data: `sny:NC:REJECT:${cle}` },
  ];
  if (payload ? !!payload.attach : recommendation === 'ATTACH_EXISTING') {
    return { inline_keyboard: [
      [{ text: '🔗 RAPPROCHER', callback_data: `sny:NC:ATTACH:${cle}` }, { text: '🆕 CRÉER', callback_data: `sny:NC:VALIDATE:${cle}` }],
      r2,
    ] };
  }
  return { inline_keyboard: [[{ text: '✅ VALIDATE', callback_data: `sny:NC:VALIDATE:${cle}` }, ...r2]] };
}
