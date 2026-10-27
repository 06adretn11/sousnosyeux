// =====================================================================
// scripts/lib/discovery-messages.mjs — les messages Telegram du run Discovery (HTML Telegram).
//
// Deux formats :
//   AFFAIRE POTENTIELLE        [VALIDATE]              [REVIEW] [REJECT]
//   RAPPROCHEMENT (comparatif) [RAPPROCHER] [CRÉER]    [REVIEW] [REJECT]   (NOUVEAU SIGNAL · AFFAIRE EXISTANTE · ANALYSE · DÉCISION)
// Règles : liens éditeur DIRECTS obligatoires, 1 à 3 articles, pas de longue citation, aucun détail technique.
// Les liens sont écrits en clair (aperçu désactivé à l'envoi) : un lien non cliquable reste copiable.
// =====================================================================
import { preuvesDe } from './preuves.mjs';
import { moisFr } from './evenement-institutionnel.mjs';
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
// Les acteurs de l'extraction sont normalisés (sans accent) : rendus lisibles, rien n'est inventé.
const LISIBLES = { municipalite: 'Municipalité', mairie: 'Mairie', maire: 'Maire', academie: 'Académie', prefecture: 'Préfecture', prefet: 'Préfet', rectorat: 'Rectorat', 'education nationale': 'Éducation nationale', 'conseil municipal': 'Conseil municipal' };
const acteurLisible = (a) => (a ? (LISIBLES[a] ?? a) : 'acteur non précisé');
const jj = (d) => (d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10).split('-').reverse().join('/') : 'date inconnue'); // un objet Date (colonne SQL) ne devient jamais « Thu Oct 15 »
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

/**
 * ENRICHISSEMENT PROPOSÉ (Maintenance) — information NOUVELLE qui ne change pas l'état judiciaire : mobilisation, déclaration, mesure.
 * Une décision : VALIDATE conserve en mémoire (aucune mise à jour publique immédiate n'est promise) · REVIEW · REJECT.
 * @param {{etablissement, commune, courant, media, publication_date, url}} p   affaire + article source
 * @param {object[]} neufs  faits NOUVEAUX (libellé fermé, acteur, date/période, portée, citation)
 * @param {boolean} territorial  aucune information de portée affaire / établissement
 */
export function messageEnrichissement(p, neufs, territorial) {
  const f1 = neufs[0];
  const quand = (f) => (f.event_date ? jj(f.event_date) : f.event_period ? `${moisFr(f.event_period)} (jour non établi)` : 'date non établie');
  // Le territoire est celui que NOMME la source probante ; à défaut il n'est pas établi — jamais la commune de l'affaire d'où l'on est parti.
  const lienArticle = /^https?:\/\//.test(p.url || '') ? `\n${esc(p.url)}` : '';
  // Un fait de TERRITOIRE se présente par sa portée : l'affaire par laquelle il a été découvert n'est qu'une provenance, il n'est pas « un enrichissement de cette affaire ».
  const tete = territorial
    ? [`🔄 <b>MAINTENANCE</b> · 🗺 INFORMATION TERRITORIALE PROPOSÉE`,
      `<b>Territoire : ${f1.territoire ? esc(f1.territoire) : 'non établi par la source'}</b>`,
      `Provenance seulement : découverte via un article lié à ${esc(p.etablissement)} — ce fait n’est pas propre à cette affaire, dont l’état judiciaire n’est pas concerné.`]
    : [`🔄 <b>MAINTENANCE</b> · 📌 ENRICHISSEMENT PROPOSÉ`,
      `<b>${esc(p.etablissement)}</b> — ${esc(p.commune)} · état judiciaire inchangé (${esc(p.courant)})`];
  return [
    ...tete,
    '',
    '<b>Ce qui est nouveau</b>',
    // Chaque fait avec SON passage probant : une PHRASE du corps (finit par une ponctuation) ; le titre de la page (« … - RFI ») n'est qu'un repère, jamais présenté comme preuve s'il existe mieux.
    ...neufs.slice(0, 2).flatMap((f) => [`• ${esc(f.libelle_public)}${f.realisation ? ` (${esc(f.realisation)})` : ''}`,
      `  « ${esc(cut(f.evidence.find((e) => /[.!?]["»”]?\s*$/.test(String(e))) ?? f.evidence[0], 420))} »`]),
    neufs.length > 2 ? `(+${neufs.length - 2} autre(s) information(s))` : '',
    '',
    '<b>Qui / quand</b>',
    ...neufs.slice(0, 2).map((f) => `${esc(acteurLisible(f.acteur_nomme || f.acteur))} · ${esc(quand(f))}`),
    '',
    '<b>Source</b>',
    `${esc(p.media || 'source inconnue')} · ${jj(p.publication_date)}${lienArticle}`,
    '',
    `<b>Portée</b> : ${territorial ? `territoire${f1.territoire ? ` « ${esc(f1.territoire)} »` : ''} (non propre à un établissement ni à une affaire)` : `établissement — réponse liée à cette affaire${f1.territoire ? ` · étendue de la mesure : ${esc(f1.territoire)} (non limitée à cet établissement)` : ''}`}`,
    `<b>Utilisation possible</b> : ${territorial ? 'un Hub PUBLIÉ dont le périmètre contient ce territoire, avec sa portée écrite (contexte) ; jamais la fiche d’une affaire par défaut' : 'fiche individuelle (détail) et Hub du territoire (synthèse)'}`,
    '',
    '<b>Décision</b>',
    'VALIDATE : conserver en mémoire (aucune mise à jour publique immédiate n’est promise ; reprise automatique si la fiche ou le Hub existent) · REVIEW · REJECT',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** PROPOSITION DE PUBLICATION d'une candidate examinée : synthèse (établissement, commune, état, preuves, sources, localisation). */
export function messagePublication(p) {
  const x = p.publication;
  const c = x.criteres || {};
  const ok = (b) => (b ? '✓' : '✗');
  const loc = x.localisation;
  const ligneLoc = !loc ? '📍 ⚠ Aucune localisation fiable : publication impossible tant qu’un point documenté n’est pas fourni.'
    : loc.type === 'approximative' ? '📍 Localisation APPROXIMATIVE : centre de la commune (API Adresse). La carte affichera « Localisation approximative » ; ce n’est pas l’adresse de l’établissement.'
      : '📍 Localisation documentée (coordonnées déjà enregistrées pour cette fiche).';
  return [
    `📢 <b>PUBLICATION</b> · PROPOSITION · ${esc(x.case_id)}`,
    '',
    `<b>${esc(p.etablissement || 'Structure non nommée')}</b> · ${esc(p.commune)}`,
    `État judiciaire : « ${esc(x.statut_judiciaire)} » · fiabilité ${esc(x.fiabilite)}/10 · ${(x.sources || []).length} source(s)`,
    p.resume ? '\n' + esc(cut(p.resume, 300)) : '',
    '',
    `Preuves : source fiable ${ok(c.source_fiable)} · article récent ${ok(c.article_recent)} · établissement nommé ${ok(c.etablissement_nomme)} · statut clair ${ok(c.statut_clair)} · recoupement ${ok(c.recoupement)}`,
    ...trois(x.sources).map(lien),
    ligneLoc,
    x.bloque ? `\n⛔ Non publiable : ${esc(cut(x.bloque, 200))}` : '\nContrôles passés : HOLD, retrait, fiabilité, sources, doublon.',
    '',
    x.publiable
      ? '📢 PUBLIER = GO éditorial explicite, enregistré : publication, projection, QA, déploiement, puis vérification du site. « Publié et vérifié » n’est annoncé qu’après lecture du site servi.'
      : 'PUBLIER indisponible : REVIEW ou REJECT seulement.',
    '🟡 REVIEW : rien publié, mis de côté · ⛔ REJECT : refus de publier, l’affaire est conservée (candidate).',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** FICHE INDIVIDUELLE À APPROUVER : une page (pas l'affaire) ; APPROUVER = GO éditorial de la PAGE uniquement. */
export function messageFiche(p) {
  const x = p.page;
  if (x.mise_a_jour) return messageFicheMiseAJour(p);
  return [
    `📄 <b>FICHE INDIVIDUELLE À APPROUVER</b> · ${esc(x.case_id)}`,
    '',
    `<b>${esc(p.etablissement)}</b> · ${esc(p.commune)}`,
    `État judiciaire : « ${esc(x.statut_judiciaire)} » (l’affaire est déjà publique)`,
    ...(x.generation ? [`🧪 Fiche PRODUITE AUTOMATIQUEMENT · qualification ${esc(x.generation.qualification)} · ${x.generation.sources_lues} source(s) lue(s) sur ${x.generation.sources_total} · chaque ligne reliée à un extrait de la source`] : []),
    ...(x.resume || []).map((l) => '\n' + esc(cut(l, 280))),
    '',
    '<b>Éléments nouveaux</b> : ' + (x.nouveautes || []).map(esc).join(' · '),
    ...trois(x.sources_directes, 4).map(lien),
    x.sources_a_rattacher?.length ? `🔗 ${x.sources_a_rattacher.length} source(s) lue(s) pour la fiche seront rattachées à l’affaire dans la mémoire (APPROUVER vaut aussi cet accord).` : '',
    '<b>Inconnues</b> : ' + (x.inconnues || []).map((i) => esc(cut(i, 120))).join(' · '),
    ...(x.generation?.attention?.length ? ['', '<b>⚠ Points d’attention</b>', ...x.generation.attention.map((a) => `• ${esc(cut(a.texte, 200))}`)] : []),
    '',
    x.preview_url ? `👁 Aperçu : ${esc(x.preview_url)}` : '👁 Aperçu : captures de la page jointes à ce message (desktop et mobile)',
    '<b>Diff de publication</b> :',
    ...(x.diff_public || []).map((l) => '• ' + esc(l)),
    '',
    '✅ APPROUVER = GO éditorial de la PAGE (enregistré, puis projection, QA, déploiement, vérification du site servi). Ce n’est pas la publication de l’affaire.',
    '🟡 REVIEW : rien publié · ⛔ REJECT : page écartée, l’affaire reste publique.',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** MISE À JOUR d'une fiche DÉJÀ publiée : seulement ce qui change depuis la dernière version approuvée (pas « + page », pas « Fiche → »). */
function messageFicheMiseAJour(p) {
  const x = p.page, m = x.mise_a_jour;
  const quand = (e) => (e.date ? e.date : e.publie_le ? `date non écrite · paru le ${e.publie_le}` : 'date non établie');
  return [
    `🔄 <b>MISE À JOUR DE FICHE À APPROUVER</b> · ${esc(x.case_id)}`,
    '',
    `<b>${esc(p.etablissement)}</b> · ${esc(p.commune)}`,
    `La page existe déjà : la version publique actuelle (empreinte <code>${esc(m.precedent_hash)}</code>) reste EN LIGNE tant que vous n’approuvez pas celle-ci (<code>${esc(x.hash)}</code>).`,
    ...(x.generation ? [`🧪 Version PRODUITE AUTOMATIQUEMENT · qualification ${esc(x.generation.qualification)} · chaque ligne reliée à un extrait de la source`] : []),
    '',
    '<b>Ce qui change depuis la version publique</b>',
    ...(m.ajoutees || []).map((e) => `➕ ${esc(cut(e.texte, 300))}\n   (${esc(quand(e))}${e.media ? ' · ' + esc(e.media) : ''})`),
    ...(m.sources_nouvelles || []).map((s) => `📰 Nouvelle source : ${esc(s.media || '')} → ${esc(s.url)}`),
    ...(m.retirees || []).map((e) => `➖ Retirée : ${esc(cut(e.texte, 200))}`),
    ...(m.sources_retirees || []).map((s) => `➖ Source retirée : ${esc(s.media || '')} → ${esc(s.url)}`),
    m.reformulees ? `✏️ ${m.reformulees} étape(s) reformulée(s) (même source, même date)` : '',
    !(m.ajoutees || []).length && !(m.retirees || []).length ? '(aucune étape ajoutée ni retirée)' : '',
    '<b>Inconnues</b> : ' + (x.inconnues || []).map((i) => esc(cut(i, 120))).join(' · '),
    ...(x.generation?.attention?.length ? ['', '<b>⚠ Points d’attention</b>', ...x.generation.attention.map((a) => `• ${esc(cut(a.texte, 200))}`)] : []),
    '',
    x.preview_url ? `👁 Aperçu complet de cette version : ${esc(x.preview_url)}` : '👁 Aperçu : captures de la page jointes à ce message',
    '',
    '✅ APPROUVER = GO éditorial de CETTE VERSION de la page (enregistré, puis projection, QA, déploiement, vérification du site servi). L’affaire et la carte ne changent pas.',
    '🟡 REVIEW : rien publié, la version actuelle reste en ligne · ⛔ REJECT : cette mise à jour est écartée, la version actuelle reste en ligne.',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** NOUVEAU HUB PROPOSÉ (diagnostic territorial) : PRÉPARER LE HUB = préparer un BROUILLON consultable, jamais publier. */
export function messageHub(p) {
  const h = p.hub;
  return [
    `🗺 <b>TERRITOIRE · NOUVEAU HUB PROPOSÉ</b> · ${esc(h.territoire)}`,
    '',
    '<b>Pourquoi maintenant</b> : ' + (h.pourquoi || []).map(esc).join(' ; '),
    `<b>Affaires publiques</b> : ${h.publiques.length} (aucun Hub) · <b>Matière</b> : ${h.evenements} événement(s) validé(s), ${h.reactions} réaction(s)/mobilisation(s), ${h.sources} source(s)`,
    '',
    '<b>Ce que fait le bouton</b>',
    '🗺 PRÉPARER LE HUB : SNY prépare un BROUILLON de Hub (affaires, chronologie du territoire, réponses publiques, sources, ce qui reste à établir) et t’envoie le lien du dossier de revue. Aucune page n’est créée ni publiée ; publier un Hub exigera ton GO distinct.',
    '🟡 REVIEW : rien préparé · ⛔ REJECT : pas de Hub pour ce territoire.',
  ].join('\n');
}

/** HUB À PUBLIER : l'aperçu a été préparé ; PUBLIER LE HUB = GO éditorial de CETTE matière (empreinte) puis chaîne autonome jusqu'au front vérifié. */
export function messageHubPublication(p) {
  const h = p.hub_publication;
  return [
    `🗺 <b>HUB À PUBLIER</b> · ${esc(h.titre)}`,
    '',
    `<b>Aperçu consultable</b> : ${esc(h.apercu)}`,
    `${h.publiques.length} affaire(s) publique(s) · empreinte de la page <code>${esc(h.hash)}</code>`,
    'La page est composée sans rédaction depuis les fiches publiques et les événements validés ; ce qui manque est dit dans l’aperçu et dans la page.',
    '',
    '<b>Ce que fait le bouton</b>',
    `🗺 PUBLIER LE HUB : GO éditorial de CETTE page (empreinte ci-dessus). Ensuite, sans autre intervention : projection, contrôles, déploiement, vérification du site servi, puis confirmation avec le lien public (${esc(h.page)}). Si la page change avant, elle ne sera pas publiée sans nouveau GO.`,
    '🟡 REVIEW : rien publié · ⛔ REJECT : ce Hub n’est pas publié.',
  ].join('\n');
}

export function messageDecision(p, recommendation) {
  if (p.hub_publication) return messageHubPublication(p);
  if (p.hub) return messageHub(p);
  if (p.page) return messageFiche(p);
  if (p.publication) return messagePublication(p);
  // Un candidat de rattachement (payload.attach) → message COMPARATIF, quelle que soit la recommandation : c'est l'humain qui tranche.
  if (p.attach || recommendation === 'ATTACH_EXISTING') return messageRapprochement(p, recommendation);
  const nomme = p.etablissement_nomme !== false && p.etablissement;
  const matches = p.possible_matches_sny || [];
  const sny = recommendation === 'NEW_CASE_CANDIDATE'
    ? 'SNY : aucune correspondance dans la base.' + (matches.length ? `\n(${matches.length} autre(s) affaire(s) SNY dans la commune, autre(s) établissement(s) : ${matches.map((v) => v.case_id).join(', ')}.)` : '')
      + (p.rapprochement_ecarte ? `\nℹ Rapprochement avec ${esc(p.rapprochement_ecarte.case_id)} écarté : ${esc(cut(p.rapprochement_ecarte.raison, 140))}.` : '')
    : `SNY : correspondance à vérifier${matches.length ? ' — ' + matches.map((v) => v.case_id).join(', ') : ''}.`;
  // La ligne de recommandation dit EXACTEMENT ce que le bouton proposé fera (modeCreation) : jamais « VALIDATE » sous un bouton « preuves à compléter ».
  const pending = modeCreation(recommendation, p) === 'PENDING';
  const dp = pending ? null : p.publication_directe; // jamais un bouton « publier » sous une création « preuves à compléter »
  const reco = dp
    // Contrat du bouton unique : confirmer l'affaire + autoriser la publication + accepter la localisation et les réserves.
    ? `→ VALIDER ET PUBLIER : je confirme cette affaire, j’autorise sa publication sur SNY, j’accepte la localisation (approximative, centre de commune) et les réserves ci-dessous. Stade judiciaire retenu : « ${p.stade_minimal || p.fiche?.statut_judiciaire} ».\nRéserves : ${(dp.reserves || []).join(' ; ') || 'aucune'}.\n🟡 REVIEW : mettre de côté, rien n’est créé · ⛔ REJECT : écarter.`
    : !pending
    ? `→ VALIDATE${p.non_publiable?.length ? ' (validation documentaire, SANS publication)' : ''} : ${p.independantes || p.medias} sources indépendantes recoupent les faits${preuvesDe(p).manques.length ? ` (réserve : ${preuvesDe(p).manques.join(' ; ')})` : ''}.`
    : `→ CRÉER EN ATTENTE DE PREUVES : signal crédible, mais ${preuvesDe(p, recommendation).manques.join(' ; ') || 'matière à confirmer'}. La candidate ne sera pas publiable tant que ces preuves manquent. REVIEW : mettre de côté sans rien créer.`;
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
    !dp && p.non_publiable?.length ? `\n🚫 Publication non proposée : ${esc(cut(p.non_publiable.join(' ; '), 260))}.` : '',
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
    modeCreation(recommendation, p) === 'PENDING'
      ? `⏳ CRÉER (preuves à compléter) : nouvelle affaire distincte, candidate NON publiable — manque : ${preuvesDe(p, recommendation).manques.join(' ; ') || 'à confirmer'}.`
      : '🆕 CRÉER : nouvelle affaire distincte (candidate, non publiée).',
    '🟡 REVIEW : mettre de côté, sans rien créer ni rattacher · ⛔ REJECT : écarter cette proposition.',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Bouton de création proposé : CRÉER si l'affaire est suffisamment documentée, sinon CRÉER (preuves à compléter). */
export function modeCreation(recommendation, payload) {
  return recommendation === 'REVIEW' || !preuvesDe(payload).suffisantes ? 'PENDING' : 'CREATE';
}

/**
 * Boutons CONTEXTUELS (`NC` = nouvelle-affaire, new_case_proposals). Callbacks : sny:NC:<ACTION>:<clé>.
 *   candidat de rattachement   RAPPROCHER + (CRÉER | CRÉER-EN-ATTENTE-DE-PREUVES)  / REVIEW · REJECT
 *   sinon, bien documentée     VALIDATE                                             / REVIEW · REJECT
 *   sinon, preuves à compléter CRÉER (preuves à compléter)                          / REVIEW · REJECT
 * REVIEW = HOLD : n'écrit rien. Jamais toutes les actions à la fois.
 */
export function boutons(recommendation, cle, payload = null) {
  if (payload?.hub_publication) return { inline_keyboard: [[{ text: '🗺 PUBLIER LE HUB', callback_data: `sny:NC:VALIDATE:${cle}` }, { text: '🟡 REVIEW', callback_data: `sny:NC:REVIEW:${cle}` }, { text: '⛔ REJECT', callback_data: `sny:NC:REJECT:${cle}` }]] };
  if (payload?.hub) return { inline_keyboard: [[{ text: '🗺 PRÉPARER LE HUB', callback_data: `sny:NC:VALIDATE:${cle}` }, { text: '🟡 REVIEW', callback_data: `sny:NC:REVIEW:${cle}` }, { text: '⛔ REJECT', callback_data: `sny:NC:REJECT:${cle}` }]] };
  if (payload?.page) return { inline_keyboard: [[{ text: payload.page.mise_a_jour ? '✅ APPROUVER LA MISE À JOUR' : '✅ APPROUVER LA FICHE', callback_data: `sny:NC:VALIDATE:${cle}` }, { text: '🟡 REVIEW', callback_data: `sny:NC:REVIEW:${cle}` }, { text: '⛔ REJECT', callback_data: `sny:NC:REJECT:${cle}` }]] };
  const r2 = [
    { text: '🟡 REVIEW', callback_data: `sny:NC:REVIEW:${cle}` },
    { text: '⛔ REJECT', callback_data: `sny:NC:REJECT:${cle}` },
  ];
  // Proposition de PUBLICATION : PUBLIER (callback VALIDATE : le Worker n'est pas modifié) seulement si examinée ET localisée.
  if (payload?.publication) {
    const publier = { text: '📢 PUBLIER', callback_data: `sny:NC:VALIDATE:${cle}` };
    return { inline_keyboard: [payload.publication.publiable ? [publier, ...r2] : r2] };
  }
  const creer = modeCreation(recommendation, payload || {}) === 'PENDING'
    ? { text: '⏳ CRÉER (preuves à compléter)', callback_data: `sny:NC:PENDING:${cle}` }
    : { text: payload?.attach ? '🆕 CRÉER' : payload?.publication_directe ? '📢 VALIDER ET PUBLIER' : '✅ VALIDATE', callback_data: `sny:NC:VALIDATE:${cle}` };
  if (payload ? !!payload.attach : recommendation === 'ATTACH_EXISTING') {
    return { inline_keyboard: [[{ text: '🔗 RAPPROCHER', callback_data: `sny:NC:ATTACH:${cle}` }, creer], r2] };
  }
  return { inline_keyboard: [[creer, ...r2]] };
}
