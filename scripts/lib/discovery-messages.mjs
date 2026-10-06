// =====================================================================
// scripts/lib/discovery-messages.mjs — les messages Telegram du run Discovery (HTML Telegram).
//
// Deux formats, validés pendant le bootstrap :
//   AFFAIRE POTENTIELLE   [VALIDATE] [REVIEW] [REJECT]
//   RAPPROCHEMENT PROPOSÉ [ATTACH]   [REVIEW] [REJECT]
// Règles : liens éditeur DIRECTS obligatoires, 1 à 3 articles, pas de longue citation, aucun détail technique.
// Les liens sont écrits en clair (aperçu désactivé à l'envoi) : un lien non cliquable reste copiable.
// =====================================================================
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const jj = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : 'date inconnue');
const lien = (a) => `📰 ${esc(a.media || 'média')} → ${esc(a.url)}`;

/** Au plus `n` articles, un par média, dans l'ordre. */
function trois(articles, n = 3) {
  const vus = new Set();
  return (articles || []).filter((a) => /^https?:\/\//.test(a.url || '') && !vus.has(a.media) && vus.add(a.media)).slice(0, n);
}

export function messageDecision(p, recommendation) {
  if (recommendation === 'ATTACH_EXISTING') return messageRapprochement(p);
  const nomme = p.etablissement_nomme !== false && p.etablissement;
  const matches = p.possible_matches_sny || [];
  const sny = recommendation === 'NEW_CASE_CANDIDATE'
    ? 'SNY : aucune correspondance dans la base.' + (matches.length ? `\n(${matches.length} autre(s) affaire(s) SNY dans la commune, autre(s) établissement(s) : ${matches.map((v) => v.case_id).join(', ')}.)` : '')
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
    esc(sny),
    p.avertissement ? `\n⚠ ${esc(cut(p.avertissement, 200))}` : '',
    '',
    esc(reco),
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

export function messageRapprochement(p) {
  const a = p.attach;
  return [
    '🆕 <b>DISCOVERY</b> · 🔗 RAPPROCHEMENT PROPOSÉ',
    '',
    '<b>NOUVEAU SIGNAL</b>',
    esc(cut(p.resume, 360)),
    ...trois(a.nouvelles).map(lien),
    '',
    '<b>AFFAIRE SNY</b>',
    `${esc(a.case_id)} · ${esc(a.etablissement)} · ${esc(a.commune)} · ${esc(a.role || '')} · état « ${esc(a.statut)} »`,
    ...trois(a.sources).map(lien),
    '',
    '<b>POURQUOI LE RAPPROCHEMENT</b>',
    ...a.pourquoi.map((x) => `• ${esc(cut(x, 160))}`),
    a.divergence ? `\n⚠ ${esc(cut(a.divergence, 200))}` : '',
    '',
    '→ ATTACH : ajouter ces articles aux sources de l’affaire existante.',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Boutons : (action positive, clé 8 car.). `NC` = nouvelle-affaire (new_case_proposals). */
export function boutons(recommendation, cle) {
  const oui = recommendation === 'ATTACH_EXISTING' ? 'ATTACH' : 'VALIDATE';
  return { inline_keyboard: [[
    { text: oui === 'ATTACH' ? '🔗 ATTACH' : '✅ VALIDATE', callback_data: `sny:NC:${oui}:${cle}` },
    { text: '🟡 REVIEW', callback_data: `sny:NC:REVIEW:${cle}` },
    { text: '⛔ REJECT', callback_data: `sny:NC:REJECT:${cle}` },
  ]] };
}
