// =====================================================================
// scripts/lib/social-editorial.mjs — PILOTE ÉDITORIAL SOCIAL V3 : composition X / Facebook À PARTIR DE LA MATIÈRE DÉJÀ APPROUVÉE. Fonctions PURES.
//
// Ce module ne rédige RIEN. Un post est une suite de SEGMENTS ; chaque segment est soit
//   · un GABARIT fixe de la liste blanche GABARITS (ponctuation, libellés « Source : », « Contexte, sources et suivi : »),
//     dont les champs viennent de la fiche carte publique (établissement, commune, département) ou d'une table fixe (LIBELLES) ;
//   · une phrase APPROUVÉE reprise À L'IDENTIQUE : dossier de fiche approuvée (empreinte = celle du GO), événement validé (Neon → evenements.json),
//     information validée (matiere), réaction attribuée du dossier, ou formulation officielle du site (web/src/lib/etat-wording.ts).
// Le contrôleur `verifierPost` RECONSTRUIT indépendamment l'ensemble des valeurs autorisées depuis les données brutes et refuse toute valeur
// qui n'y figure pas : c'est la preuve « 0 invention ». Aucun modèle, aucun réseau, aucun Buffer, aucune base.
//
// N'est PAS branché sur le pipeline de diffusion (scripts/diffuser-social.mjs → composerMessage) : sans GO éditorial d'Adrien, rien ne change en production.
// =====================================================================
import { hashDossier, urlsDe, MEDIAS_PAYANTS } from './fiche-page.mjs';
import { RE_NOMBRE_ENFANTS, RE_AGE_ENFANT, RE_AGE_MIS_EN_CAUSE, RE_PROCHE_VICTIME } from './fiche-extraction.mjs';
import { lienDiffusion, LIMITE_X, LONGUEUR_LIEN_X, STATUTS_DIFFUSABLES, rang } from './diffusion-sociale.mjs';

export const VERSION = 'pilote-social-v3.2';
export const FAMILLES = Object.freeze(['nouvelle_affaire', 'evolution', 'declaration_association', 'declaration_victime']);
const LIMITE_FB_LISIBLE = 1200; // au-delà, le post devient une page : le contexte facultatif est retiré (jamais coupé). Facebook replie de toute façon après ~480 caractères.

export const plat = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const dateLongue = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : null; };

// ---------------------------------------------------------------------
// LISTES BLANCHES : seuls textes qui ne sont pas des phrases approuvées. Aucun ne contient d'affirmation factuelle sur une affaire.
// ---------------------------------------------------------------------
export const GABARITS = Object.freeze({
  accroche_fb: '{commune} ({departement}) — {etablissement} : {libelle}',
  accroche_x: '{commune} · {etablissement}',
  phrase: '{phrase}',
  libelle_evenement: '{libelle} (selon {media}).', // le point final du libellé est reporté après l'attribution (typographie seule)
  parole: '{acteur} ({qualite}, {date}) : « {citation} »',
  source_fb: 'Source : {media}, {date} — {url}',
  source_x: 'Source : {url}',
  suivi_fb: 'Contexte, sources et suivi de l’affaire sur Sous nos yeux : {lien}',
  suivi_x: 'Suivi : {lien}',
});
/** Fait principal de l'accroche : une table FIXE indexée par le statut public / le type d'événement validé. Jamais un texte libre. */
export const LIBELLES = Object.freeze({
  nouvelle_affaire: { 'enquête': 'enquête en cours', 'mise en examen': 'mise en examen', 'procès': 'affaire au stade du procès', 'condamnation non définitive': 'condamnation prononcée', 'condamnation définitive': 'condamnation définitive' },
  evolution: { mise_en_examen: 'mise en examen le {date}', 'décision|condamnation non définitive': 'condamnation prononcée le {date}', 'décision|condamnation définitive': 'condamnation définitive le {date}', enquête: 'enquête ouverte le {date}', audience: 'procès le {date}' },
  declaration_association: 'déclaration de {acteur}',
  declaration_victime: 'prise de parole de {acteur}',
});

// ---------------------------------------------------------------------
// GARDES DE CONTENU (sécurité des personnes) — appliquées à chaque candidat ET au texte final (défense en profondeur).
// ---------------------------------------------------------------------
// « mineurs de 15 ans » est une QUALIFICATION PÉNALE (moins de 15 ans), pas l'âge d'un enfant : seule exception, explicite.
const QUALIF_15 = /\bmineur(?:e)?s? de (?:moins de )?15 ans\b/gi;
const ROLES_GENERIQUES = new Set(['autre', 'non precise', 'inconnu', 'a qualifier']);
// Désignation de la personne visée par sa FONCTION (distingue deux procédures d'un même établissement). Testée sur le texte APLATI (sans accents) : « éducatif » compris.
const RE_FONCTION = /\b(animat\w*|enseignan\w*|professeur\w*|atsem|agents?|directeur|directrice|educat\w*|surveillant\w*|cadre\w*|instituteur\w*|institutrice\w*|assistantes? maternelles?|auxiliaires?)\b/;
export const RE_DESIGNATION_ROLE = { test: (t) => RE_FONCTION.test(plat(t)) };

// ---------------------------------------------------------------------
// ARBITRAGES ÉDITORIAUX D'ADRIEN (12/11/2026) — docs/industrialisation/PILOTE_EDITORIAL_SOCIAL_V3.md §5. Toute modification exige un nouvel arbitrage.
//   A1 fonction de la personne visée : reprise telle qu'écrite dans la fiche approuvée (la valeur exacte de la carte reste bloquée) ;
//   A2 lien dont l'adresse / le titre porte un décompte : autorisé, à condition que le TEXTE du post n'en contienne aucun (gardes sur le texte) ;
//   A3 X minimal (phrase d'état du site) autorisé ; une phrase courte approuvée (`accroche_courte` du dossier) est utilisée en priorité quand elle existe ;
//   A4 mention fixe « Caractère définitif non documenté. » — appliquée par le PILOTE seulement (`reserveA4`) ; la formulation publique
//      (web/src/lib/etat-wording.ts) reste inchangée tant qu'une validation spécifique de son effet sur le site n'est pas donnée ;
//   A5 détails déjà approuvés sur la fiche (sexe d'un enfant, peine, FIJAIS) : repris tels quels, sans revue spécifique.
// ---------------------------------------------------------------------
export const ARBITRAGES = Object.freeze({ date: '2026-11-12', lienAvecDecompte: true, revueSexeEnfant: false });
const RE_SEXE_ENFANT = /\b(?:une|cette|la) enfant\b|\bfillettes?\b|\bpetite fille\b|\bmineure\b/i;

export function gardes(texte, entree) {
  const t = String(texte);
  const sansQualif = t.replace(QUALIF_15, '');
  const bloquants = [];
  if (RE_NOMBRE_ENFANTS.test(t)) bloquants.push('nombre d’enfants ou décompte de plaintes');
  // Complément : RE_AGE_ENFANT (fiche-extraction) commence par \b devant « â » et ne voit donc pas « âgée de 6 ans » (même piège que \b/« municipalité »). Le texte aplati le voit.
  if (RE_AGE_ENFANT.test(sansQualif) || /(?:^| )agee?s? de \d+(?: et \d+)? ans\b/.test(plat(sansQualif))) bloquants.push('âge d’une personne (enfant ou mis en cause)');
  if (RE_AGE_MIS_EN_CAUSE.test(t)) bloquants.push('âge de la personne mise en cause');
  if (RE_PROCHE_VICTIME.test(t)) bloquants.push('lien de parenté avec une victime');
  const role = plat(entree?.role_mis_en_cause);
  if (role.length >= 6 && !ROLES_GENERIQUES.has(role) && (' ' + plat(t) + ' ').includes(` ${role} `)) bloquants.push('rôle exact de la fiche (garantie du moteur actuel)');
  if (/\.\.\.|…\s*$/.test(t)) bloquants.push('texte tronqué');
  const attention = ARBITRAGES.revueSexeEnfant && RE_SEXE_ENFANT.test(sansQualif) ? ['indication du sexe d’un enfant (déjà publiée sur la fiche) : risque d’identification à apprécier'] : [];
  return { bloquants, attention };
}
/** URL portant un décompte d'enfants ou de plaignants dans son adresse (« …sur-douze-enfants… », « sept-parents-d-eleves… »). */
export const urlAvecDecompte = (url) => !!url && RE_NOMBRE_ENFANTS.test(decodeURIComponent(url).replace(/[-_/]+/g, ' '));
const urlSure = (url) => !!url && (ARBITRAGES.lienAvecDecompte || !urlAvecDecompte(url));

// ---------------------------------------------------------------------
// MATIÈRE APPROUVÉE d'une affaire (tout ce qui peut être repris à l'identique) et rattachement des sources.
// ---------------------------------------------------------------------
/**
 * @param {{entree:object|null, dossier:{d:object,hub:string|null}|null, empreinteApprouvee:string|null, evenements:object[], matiere:object[], wording:object}} m
 */
export function matiereApprouvee({ entree, dossier, empreinteApprouvee, evenements = [], matiere = [], wording }) {
  const d = dossier?.d ?? null;
  const approuve = !!(d && empreinteApprouvee && hashDossier(d) === empreinteApprouvee);
  const sources = new Map(); // url → { media, url, publie_le, acces }
  // Une même URL peut venir de la carte (sans niveau d'accès) puis du dossier relu (accès libre/partiel) : le niveau d'accès CONSTATÉ l'emporte.
  const ajoute = (s, acces = s?.acces ?? null) => {
    if (!s?.url) return;
    const x = sources.get(s.url);
    if (!x) sources.set(s.url, { media: s.media, url: s.url, publie_le: s.publie_le ?? s.publication_date ?? null, acces });
    else if (x.acces == null && acces != null) x.acces = acces;
  };
  for (const s of entree?.sources || []) ajoute(s, null);
  if (approuve) { for (const e of d.deroule || []) { ajoute(e.source); for (const s of e.sources_complementaires || []) ajoute(s); } for (const r of [...(d.reactions || []), ...(d.paroles || [])]) ajoute(r.source); }
  for (const e of evenements) ajoute(e.source, 'événement validé');
  for (const x of matiere) ajoute(x.source, 'information validée');
  // Phrase d'état du site (même calcul que scripts/diffuser-social.mjs : mêmes mots que la fiche).
  let site = null;
  if (entree && wording) {
    const p = (entree.sources || [])[0];
    const src = wording.sourceAffichee(entree.etat ?? null, p ? { media: p.media, date: p.publication_date, url: p.url } : null);
    site = wording.phrasesEtat(entree.statut_judiciaire, entree.etat ?? null, src);
  }
  return { approuve, d: approuve ? d : null, sources, site, reserveA4: reserveA4(entree), evenements, matiere, entree, empreinte: approuve ? empreinteApprouvee : null };
}

/**
 * Arbitrage A4 — mention courte fixe pour une condamnation sans recours ni finalité validés (mêmes conditions que la clause « une condamnation a été
 * prononcée » de etat-wording.ts). ISOLÉE dans le pilote : la formulation publique du site n'est PAS modifiée (validation spécifique requise).
 */
export const MENTION_A4 = 'Caractère définitif non documenté.';
export function reserveA4(entree) {
  const etat = entree?.etat ?? null;
  const cible = etat?.statut ?? entree?.statut_judiciaire;
  return cible === 'condamnation non définitive' && etat?.finalite !== 'non_definitive' && !(etat?.suites ?? []).length ? MENTION_A4 : null;
}

/** Sources NOMMÉES dans une phrase (« Selon France 3 et Le Figaro, … ») parmi les sources rattachées à l'affaire. */
export function sourcesNommees(texte, sources) {
  const t = ` ${plat(texte)} `, colle = plat(texte).replace(/ /g, '');
  return [...sources.values()].filter((s) => {
    const mots = plat(s.media).split(' ').filter((w) => w && !['le', 'la', 'les', 'l'].includes(w));
    if (!mots.length) return false;
    const court = mots.slice(0, Math.min(2, mots.length)).join(' ');
    const un = mots[0];
    return t.includes(` ${court} `) || (un.length >= 6 && t.includes(` ${un} `)) || (court.replace(/ /g, '').length >= 6 && colle.includes(court.replace(/ /g, '')));
  });
}
/**
 * Sources qui JUSTIFIENT une phrase approuvée : celles de l'étape du dossier qui porte exactement ce texte (rattachement le plus fort), sinon les médias
 * nommés dans la phrase. Défaut v1 corrigé : un « Le Figaro » quelconque de l'affaire n'est pas la source d'un fait daté d'une autre publication.
 */
export function sourcesDePhrase(texte, M) {
  const etape = (M.d?.deroule || []).find((x) => x.texte === texte);
  if (etape) {
    const refs = [etape.source, ...(etape.sources_complementaires || [])].map((s) => s?.url && M.sources.get(s.url)).filter(Boolean);
    if (refs.length) return refs;
  }
  return sourcesNommees(texte, M.sources);
}
/** Source de la phrase d'état du site : celle que le site crédite (même calcul que etat-wording.sourceAffichee). */
export function sourceDuSite(M) {
  const e = M.entree;
  const url = e?.etat?.sources?.[0]?.url ?? (e?.etat?.sources?.length ? null : e?.sources?.[0]?.url) ?? null;
  return url ? M.sources.get(url) ?? null : null;
}
/** Le niveau d'accès de la source LIÉE par un canal : partiel ou non constaté ⇒ revue humaine (pare-feu A), jamais un blocage silencieux. */
export const alerteAcces = (s) => (!s ? [] : s.acces === 'partiel' ? [`source liée (${s.media}) en accès partiel lors de la relecture`] : s.acces == null ? [`accès à la source liée (${s.media}) non constaté par SNY (référence de la carte, non relue dans le dossier)`] : []);
/** Phrases ENTIÈRES d'un texte approuvé (coupure aux seules fins de phrase suivies d'une majuscule). Une phrase entière n'est pas une troncature. */
export const phrasesDe = (t) => String(t || '').split(/(?<=[.!?])\s+(?=[A-ZÀÂÉÈÊÎÔÛÇ«])/).map((x) => x.trim()).filter(Boolean);
const sansPointFinal = (t) => String(t || '').replace(/\.\s*$/, '');
const siteL0 = (M) => (M.site || [])[0] ?? null;
const accesRang =(s) => (s.acces === 'libre' ? 0 : s.acces === 'événement validé' || s.acces === 'information validée' ? 1 : s.acces == null ? 2 : 3);
/** Source à lier : rattachée, non payante, URL sans donnée interdite ; accès libre d'abord, puis la plus récente. */
export function sourceALier(candidates) {
  return [...candidates].filter((s) => s.url && !MEDIAS_PAYANTS.includes(s.media) && urlSure(s.url))
    .sort((a, b) => accesRang(a) - accesRang(b) || String(b.publie_le || '').localeCompare(String(a.publie_le || '')))[0] ?? null;
}

// ---------------------------------------------------------------------
// SEGMENTS
// ---------------------------------------------------------------------
const seg = (gabarit, champs, role, preuve = null) => ({ gabarit, champs, role, preuve, texte: GABARITS[gabarit].replace(/\{(\w+)\}/g, (_, k) => String(champs[k]?.valeur ?? '')) });
const champ = (valeur, origine) => ({ valeur, origine });
const phrase = (texte, origine, role, preuve) => seg('phrase', { phrase: champ(texte, origine) }, role, preuve);

/** Rend un post : paragraphes (séparés par une ligne vide), segments d'un paragraphe séparés par une espace. */
export const rendre = (paragraphes) => paragraphes.filter((p) => p.length).map((p) => p.map((s) => s.texte).join(' ')).join('\n\n');
/** Longueur X : URL comptées 23 caractères (t.co), le reste en points de code. */
export function longueurX(texte) {
  const urls = String(texte).match(/https?:\/\/\S+/g) || [];
  return [...String(texte)].length - urls.reduce((n, u) => n + [...u].length, 0) + urls.length * LONGUEUR_LIEN_X;
}

// Réserve judiciaire : présomption d'innocence, caractère non définitif, prise de parole non probante. « faits présumés » n'en est PAS une (défaut v1, S11).
export const RE_RESERVE = /ne vaut pas culpabilit|présumée? innocente?|présomption d['’]innocence|non définiti|pas définiti|caractère définitif|n['’]établit pas|non confirmée/i;

// ---------------------------------------------------------------------
// COMPOSITION
// ---------------------------------------------------------------------
/**
 * @param {{scenario:object, M:object, publiques:Map, site:string}} a — M = matiereApprouvee(...)
 * @returns {{etat:string, motifs:string[], attention:string[], x:object, facebook:object, preuves:object[], sourcePrincipale:object|null}}
 */
export function composerPilote({ scenario, M, publiques, site }) {
  const bloque = [], attention = [], notes = [];
  const e = M.entree;
  const out = (extra = {}) => ({ etat: 'BLOQUE', motifs: bloque, attention, x: { etat: 'BLOQUE', motifs: ['scénario bloqué'] }, facebook: { etat: 'BLOQUE', motifs: ['scénario bloqué'] }, preuves: [], sourcePrincipale: null, ...extra });
  if (!FAMILLES.includes(scenario.famille)) { bloque.push(`famille inconnue : ${scenario.famille}`); return out(); }
  if (!e) { bloque.push('affaire absente de l’artefact public (data/cases.json)'); return out(); }
  if (!M.approuve) bloque.push('aucune fiche approuvée dont l’empreinte corresponde à la version courante : la matière disponible se réduit aux champs de la carte, aux titres et aux URL (insuffisant)');
  // Statut public ↔ statut de la fiche approuvée : une divergence est une ambiguïté judiciaire.
  if (M.d && M.d.statut_affiche && M.d.statut_affiche !== e.statut_judiciaire) bloque.push(`statut ambigu : fiche approuvée « ${M.d.statut_affiche} » ≠ carte « ${e.statut_judiciaire} »`);
  if (e.statut_judiciaire === 'relaxe / non-lieu / classement' && ['nouvelle_affaire', 'evolution'].includes(scenario.famille)) bloque.push('relaxe / non-lieu / classement : finalité non établie par la presse, hors automatisation (doctrine POC-09)');
  else if (['nouvelle_affaire', 'evolution'].includes(scenario.famille) && !STATUTS_DIFFUSABLES.has(e.statut_judiciaire)) bloque.push(`statut « ${e.statut_judiciaire} » non diffusable`);

  // Procédures sœurs : même établissement, même commune, autre affaire.
  const soeurs = [...(publiques?.values() || [])].filter((c) => c.case_id !== e.case_id && plat(c.etablissement) === plat(e.etablissement) && plat(c.commune) === plat(e.commune)).map((c) => c.case_id);

  // --- 1. FAIT PRINCIPAL (phrases approuvées) + événement / déclaration --------------------------------------------------------------
  let principal = [], contexte = [], libelle = null, sourcesFait = [], evt = null;
  const validationFiche = M.empreinte ? `fiche approuvée (empreinte ${M.empreinte})` : null;
  const d = M.d;
  if (scenario.famille === 'nouvelle_affaire' && d) {
    // Préfixe CONTIGU de l'état actuel approuvé : une phrase sans attribution propre n'est reprise que derrière celle qui l'attribue.
    for (const [i, t] of (d.etat_actuel || []).entries()) {
      const g = gardes(t, e);
      if (g.bloquants.length) { if (i === 0) bloque.push(`phrase d’état approuvée inutilisable : ${g.bloquants.join(', ')}`); break; }
      attention.push(...g.attention);
      (i === 0 || !RE_RESERVE.test(t) ? principal : contexte).push({ texte: t, origine: `dossier.etat_actuel[${i}]` });
    }
    sourcesFait = principal.length ? sourcesDePhrase(principal[0].texte, M) : [];
    libelle = LIBELLES.nouvelle_affaire[e.statut_judiciaire] ?? null;
  } else if (scenario.famille === 'evolution') {
    evt = (M.evenements || []).find((x) => x.event_id === scenario.event_id) ?? null;
    if (!evt) bloque.push('événement non rattaché à cette affaire (absent des événements validés de la fiche) : aucune attribution par ressemblance');
    else {
      if (!evt.date) bloque.push('événement validé non daté : la nouvelle étape ne peut pas être située');
      if (!evt.source?.url) bloque.push('événement validé sans lien de source conservé');
      if (evt.statut !== e.statut_judiciaire) bloque.push(`statut ambigu : l’événement validé porte « ${evt.statut} », la fiche publique « ${e.statut_judiciaire} »`);
      const cleLib = LIBELLES.evolution[evt.type] ? evt.type : `${evt.type}|${evt.statut}`;
      libelle = LIBELLES.evolution[cleLib] ? LIBELLES.evolution[cleLib].replace('{date}', dateLongue(evt.date) ?? '') : null;
      if (!libelle && STATUTS_DIFFUSABLES.has(evt.statut)) bloque.push(`type d’événement « ${evt.type} » : n’est pas une étape judiciaire qui fait avancer le statut (aucune nouvelle étape à annoncer)`);
      if (/inchang|ne change pas/i.test(evt.libelle || '')) bloque.push('l’événement validé précise lui-même que l’état de l’affaire ne change pas');
      // Phrase approuvée de la fiche qui décrit CET événement : même source, même date.
      if (d) {
        const etapes = (d.deroule || []).map((x, i) => ({ x, i })).filter(({ x }) => x.source?.url === evt.source?.url);
        const meme = etapes.find(({ x }) => x.date && evt.date && x.date === evt.date && !gardes(x.texte, e).bloquants.length);
        if (meme) {
          principal.push({ texte: meme.x.texte, origine: `dossier.deroule[${meme.i}]` });
          attention.push(...gardes(meme.x.texte, e).attention);
          for (const [i, t] of (d.etat_actuel || []).entries()) if (t !== meme.x.texte && RE_RESERVE.test(t) && !gardes(t, e).bloquants.length) contexte.push({ texte: t, origine: `dossier.etat_actuel[${i}]` });
          for (const { x, i } of etapes) if (i !== meme.i && contexte.length < 2 && ['enquete', 'garde_a_vue', 'mise_en_examen', 'audience', 'decision', 'appel'].includes(x.type) && !gardes(x.texte, e).bloquants.length && !RE_SEXE_ENFANT.test(x.texte)) contexte.push({ texte: x.texte, origine: `dossier.deroule[${i}]` });
        } else if (evt.libelle && !gardes(evt.libelle, e).bloquants.length) principal.push({ texte: evt.libelle, origine: `evenement:${evt.event_id}`, media: evt.source?.media });
      }
      sourcesFait = evt.source?.url ? [M.sources.get(evt.source.url)].filter(Boolean) : [];
    }
  } else if (scenario.famille === 'declaration_association') {
    const x = (M.matiere || []).find((m) => m.id === scenario.matiere_id);
    if (!x) bloque.push('déclaration absente des informations validées rattachées à cette affaire');
    else {
      if (x.case_id !== e.case_id) bloque.push('déclaration rattachée à une autre affaire');
      if (!['mobilisation'].includes(x.nature)) bloque.push(`nature « ${x.nature} » : pas une prise de parole`);
      const g = gardes(x.libelle, e);
      if (g.bloquants.length) bloque.push(`déclaration inutilisable : ${g.bloquants.join(', ')}`);
      attention.push(...g.attention);
      principal.push({ texte: x.libelle, origine: `matiere:${x.id}` });
      sourcesFait = [M.sources.get(x.source?.url)].filter(Boolean);
      libelle = LIBELLES.declaration_association.replace('{acteur}', x.acteur);
      evt = { acteur: x.acteur };
    }
    attention.push('déclaration : GO Telegram SPÉCIFIQUE requis (texte exact présenté avant approbation) — jamais couverte par le GO de publication');
  } else if (scenario.famille === 'declaration_victime' && d) {
    const r = [...(d.reactions || []), ...(d.paroles || [])][scenario.reaction ?? -1];
    const c = r?.citations?.[scenario.citation ?? 0];
    if (!r || !c) bloque.push('prise de parole absente du dossier approuvé');
    else {
      if (r.portee && r.portee !== 'affaire') bloque.push('prise de parole hors affaire');
      if (!/rapport|diffus|interrog|déclar|communiqu/i.test(r.qualite || '')) bloque.push('caractère public de la prise de parole non établi');
      const g = gardes(`${r.acteur} ${c.texte}`, e);
      if (g.bloquants.length) bloque.push(`prise de parole inutilisable : ${g.bloquants.join(', ')}`);
      attention.push(...g.attention);
      principal.push({ parole: true, acteur: r.acteur, qualite: r.qualite, date: dateLongue(r.date), citation: c.texte, origine: `dossier.reactions[${scenario.reaction}]` });
      if (r.etabli) { const m = /Une prise de parole n’établit pas son contenu\./.exec(r.etabli); if (m) contexte.push({ texte: m[0], origine: `dossier.reactions[${scenario.reaction}].etabli` }); }
      sourcesFait = [M.sources.get(r.source?.url)].filter(Boolean);
      libelle = LIBELLES.declaration_victime.replace('{acteur}', r.acteur);
    }
    attention.push('prise de parole côté victime : GO Telegram SPÉCIFIQUE requis ; vérifier caractère public et risque d’identification');
  }
  if (!principal.length && !bloque.length) bloque.push('aucun fait principal approuvé et sûr à exposer');

  // Rattachement exact : chaque source du fait doit être rattachée à CETTE affaire ; si la phrase n'en nomme aucune, elle n'est pas traçable.
  if (principal.length && !sourcesFait.length) bloque.push('fait principal sans source rattachée identifiable (aucun média nommé ne correspond aux sources de l’affaire)');
  const srcLien = sourceALier(sourcesFait);
  if (principal.length && sourcesFait.length && !srcLien) bloque.push('aucune source du fait n’est liable (payante, ou URL portant une donnée interdite)');

  // Procédures sœurs : le texte doit désigner la personne visée par sa fonction, sinon confusion possible.
  // Déclaration : la situer dans SA procédure. Phrase d'état approuvée de la fiche (précise, attribuée) si elle est sûre, sinon la phrase d'état du site.
  let situationDecl = null;
  if (scenario.famille.startsWith('declaration')) {
    const t0 = d?.etat_actuel?.[0];
    if (t0 && !gardes(t0, e).bloquants.length && (!soeurs.length || RE_DESIGNATION_ROLE.test(t0))) situationDecl = { texte: t0, origine: 'dossier.etat_actuel[0]' };
    else if (siteL0(M)) situationDecl = { texte: siteL0(M), origine: 'site:etat-wording' };
    if (situationDecl) attention.push(...gardes(situationDecl.texte, e).attention);
  }
  if (soeurs.length && principal.length) {
    const t = [...principal.map((p) => p.texte ?? p.citation), situationDecl?.texte ?? ''].join(' ');
    if (!RE_DESIGNATION_ROLE.test(t)) bloque.push(`même établissement que ${soeurs.join(', ')} : le fait principal ne distingue pas la procédure (confusion possible)`);
    else notes.push(`même établissement que ${soeurs.join(', ')} : procédure distinguée par la fonction de la personne visée`);
  }

  // Réserve judiciaire INDISPENSABLE : la formulation du site (mention de présomption / suite de recours), sinon une réserve approuvée de la fiche.
  const reserves = [];
  const siteL = M.site || [];
  // Ordre de lecture : réserves propres à l'affaire (fiche approuvée, prise de parole) puis la mention du site, en dernier.
  const deja = (t) => reserves.some((r) => plat(r.texte) === plat(t)) || principal.some((p) => p.texte && plat(p.texte) === plat(t));
  for (const c of contexte) if (RE_RESERVE.test(c.texte) && !deja(c.texte)) reserves.push(c);
  // Réserves de la fiche seulement si le site n'en porte pas (sinon doublon : « appel formé » dit deux fois, défaut v2 S05).
  if (siteL.length < 2) for (const [i, t] of (d?.etat_actuel || []).entries()) if (RE_RESERVE.test(t) && !gardes(t, e).bloquants.length && !deja(t) && scenario.famille !== 'nouvelle_affaire') reserves.push({ texte: t, origine: `dossier.etat_actuel[${i}]` });
  for (const l of siteL.slice(1)) if (!deja(l)) reserves.push({ texte: l, origine: 'site:etat-wording' });
  if (M.reserveA4 && !deja(M.reserveA4)) reserves.push({ texte: M.reserveA4, origine: 'arbitrage:A4' });
  const reserveIndisp = reserves.find((r) => r.origine === 'site:etat-wording') ?? reserves.find((r) => r.origine === 'arbitrage:A4') ?? reserves.find((r) => RE_RESERVE.test(r.texte)) ?? null;
  // Toutes les familles parlent d'une affaire en cours ou jugée : la réserve est exigée partout.
  if (!reserveIndisp && !principal.some((p) => RE_RESERVE.test(p.texte || ''))) bloque.push('aucune réserve judiciaire approuvée disponible (présomption / caractère non définitif) : obligatoire');

  if (bloque.length) return out({ soeurs });

  // --- 2. SEGMENTS -----------------------------------------------------------------------------------------------------------------
  const preuve = (p, src, validation) => ({ source: src ? { media: src.media, url: src.url, publie_le: src.publie_le } : null, validation });
  const validationDe = (origine) => origine.startsWith('dossier') ? validationFiche : origine.startsWith('evenement') ? `événement validé (Neon, ${origine.split(':')[1]})` : origine.startsWith('matiere') ? `information validée (Neon, ${origine.split(':')[1]})` : origine.startsWith('site') ? 'formulation officielle du site (etat-wording.ts) — déjà servie sur la fiche' : origine === 'arbitrage:A4' ? 'mention fixe arbitrée par Adrien (A4, 12/11/2026) — pilote seulement, NON servie sur le site' : origine;
  const srcDe = (t) => sourceALier(sourcesDePhrase(t, M)) ?? sourcesDePhrase(t, M)[0] ?? null;
  const segFait = (p, role = 'fait') => p.parole
    ? seg('parole', { acteur: champ(p.acteur, p.origine + '.acteur'), qualite: champ(p.qualite, p.origine + '.qualite'), date: champ(p.date, p.origine + '.date'), citation: champ(p.citation, p.origine + '.citations') }, role, preuve(p, srcLien, validationDe(p.origine)))
    : p.origine.startsWith('evenement') ? seg('libelle_evenement', { libelle: champ(sansPointFinal(p.texte), p.origine), media: champ(p.media, p.origine + '.source.media') }, role, preuve(p, srcLien, validationDe(p.origine)))
      : phrase(p.texte, p.origine, role, preuve(p, p.origine.startsWith('site') ? sourceDuSite(M) : p.origine.startsWith('matiere') ? srcLien : srcDe(p.texte) ?? srcLien, validationDe(p.origine)));
  const segRes = (r) => segFait(r, 'reserve');
  const lieuChamps = { commune: champ(e.commune, 'entree.commune'), departement: champ(e.departement, 'entree.departement'), etablissement: champ(e.etablissement, 'entree.etablissement'), libelle: champ(libelle, 'libelle') };
  const type = scenario.famille === 'evolution' ? 'case_update' : 'new_case';
  const fiche = !!M.empreinte;
  const lien = (canal) => lienDiffusion({ site, case_id: e.case_id, type, statut: scenario.famille === 'evolution' ? evt?.statut : null, canal, fiche });
  const sourceFb = seg('source_fb', { media: champ(srcLien.media, 'source.media'), date: champ(dateLongue(srcLien.publie_le) ?? 'date non précisée', 'source.date'), url: champ(srcLien.url, 'source.url') }, 'attribution');

  // FACEBOOK : accroche · fait · contexte · réserves · attribution · renvoi SNY. Le contexte facultatif est retiré (jamais coupé) si le post devient trop long.
  const fbFaits = principal.map((p) => segFait(p));
  const dejaDit = new Set(principal.map((p) => plat(p.texte ?? p.citation)));
  const fbContexte = [];
  if (situationDecl && !dejaDit.has(plat(situationDecl.texte))) { fbContexte.push(segFait(situationDecl, 'contexte')); dejaDit.add(plat(situationDecl.texte)); }
  const fbReserves = [];
  // Une réserve par THÈME (présomption, caractère définitif, prise de parole, confirmation) : la première, la plus précise (fiche), l'emporte ; la mention courte du site
  // ne la répète pas (défaut après A4 : « Appel et caractère définitif non documentés… » suivi de « Caractère définitif non documenté. »).
  const theme = (t) => (/culpabilit|présum|présomption/i.test(t) ? 'presomption' : /définiti/i.test(t) ? 'definitif' : /n['’]établit/i.test(t) ? 'parole' : /confirmée/i.test(t) ? 'confirmation' : plat(t));
  const themes = new Set([...principal, ...contexte].filter((p) => p.texte && RE_RESERVE.test(p.texte) && dejaDit.has(plat(p.texte))).map((p) => theme(p.texte)));
  for (const r of reserves) if (!dejaDit.has(plat(r.texte)) && !themes.has(theme(r.texte))) { fbReserves.push(segRes(r)); dejaDit.add(plat(r.texte)); themes.add(theme(r.texte)); }
  for (const c of contexte) if (!dejaDit.has(plat(c.texte))) { fbContexte.push(segFait(c, 'contexte')); dejaDit.add(plat(c.texte)); }
  const fbBase = [[seg('accroche_fb', lieuChamps, 'accroche')], fbFaits];
  const fbFin = [[sourceFb], [seg('suivi_fb', { lien: champ(lien('facebook'), 'lien') }, 'renvoi')]];
  // La situation d'une déclaration n'est jamais retirée (elle distingue la procédure) ; le reste du contexte l'est, du dernier au premier.
  const garde = situationDecl ? 1 : 0;
  let fbCtx = [...fbContexte];
  const assembler = () => [...fbBase, [...fbCtx], [...fbReserves], ...fbFin];
  let fbParas = assembler();
  while (rendre(fbParas).length > LIMITE_FB_LISIBLE && fbCtx.length > garde) { fbCtx = fbCtx.slice(0, -1); fbParas = assembler(); }
  const facebook = { paragraphes: fbParas, texte: rendre(fbParas), attention: alerteAcces(srcLien) };

  // X : lieu + fait (phrases approuvées ENTIÈRES) + réserve indispensable + source DU fait affiché + suivi. Du plus riche au plus court ; rien ne tient ⇒ X bloqué.
  // Chaque option porte la source qu'elle cite : le lien « Source » est toujours celui du média nommé (défaut v1 : « Selon Ouest-France » → lien Le Figaro).
  const xLieu = seg('accroche_x', lieuChamps, 'accroche');
  const options = [];
  const ajoutOption = (segs, src) => { if (src?.url && urlSure(src.url) && !MEDIAS_PAYANTS.includes(src.media)) options.push({ segs, src }); };
  if (principal.length > 1 && !principal[0].parole) ajoutOption(principal.map((p) => segFait(p)), srcLien);
  ajoutOption([segFait(principal[0])], srcLien);
  // Arbitrage A3 : phrase courte APPROUVÉE du dossier (`accroche_courte`, ≤ 140 car., attribuée « Selon <média>, … »). Couverte par l'empreinte de la fiche :
  // l'ajouter ou la modifier exige une nouvelle approbation. N'existe encore dans aucun dossier ; pour une évolution, seulement si l'état publié EST l'événement.
  const ac = typeof d?.accroche_courte === 'string' ? d.accroche_courte.trim() : null;
  if (ac && ac.length <= 140 && /^Selon /.test(ac) && !gardes(ac, e).bloquants.length && !scenario.famille.startsWith('declaration')
    && (scenario.famille === 'nouvelle_affaire' || (evt && e.etat?.statut === evt.statut && e.etat?.date === evt.date))) {
    const src = sourceALier(sourcesNommees(ac, M.sources));
    if (src) ajoutOption([segFait({ texte: ac, origine: 'dossier.accroche_courte' })], src);
  }
  // Évolution : PREMIÈRE PHRASE ENTIÈRE du libellé de l'événement validé, attribuée à sa source (plus précise que la phrase d'état du site ; ajout v3, S03).
  if (scenario.famille === 'evolution' && evt?.libelle) { const p1 = phrasesDe(evt.libelle)[0]; if (p1 && p1 !== principal[0]?.texte && /\.$/.test(p1) && p1.length >= 40 && !gardes(p1, e).bloquants.length) ajoutOption([seg('libelle_evenement', { libelle: champ(sansPointFinal(p1), `evenement:${evt.event_id}#phrase1`), media: champ(evt.source?.media, `evenement:${evt.event_id}.source.media`) }, 'fait', preuve(null, srcLien, `événement validé (Neon, ${evt.event_id}) — première phrase entière du libellé`))], srcLien); }
  // Repli : la phrase d'état du site (attribuée, déjà servie). Pour une évolution, seulement si l'état publié EST cet événement (même statut, même date, même source).
  const etatEstEvt = evt && e.etat && e.etat.statut === evt.statut && e.etat.date === evt.date && e.etat.sources?.[0]?.url === evt.source?.url;
  if (siteL[0] && (scenario.famille === 'nouvelle_affaire' || (scenario.famille === 'evolution' && etatEstEvt))) ajoutOption([segFait({ texte: siteL[0], origine: 'site:etat-wording' })], sourceDuSite(M));
  let x = null; const essais = [];
  for (const o of options) {
    // Procédures sœurs : X doit aussi désigner la personne visée par sa fonction, sinon l'option est écartée (défaut v2 S06).
    if (soeurs.length && !RE_DESIGNATION_ROLE.test(o.segs.map((s) => s.texte).join(' '))) { essais.push('option écartée : procédure non distinguée'); continue; }
    const porteReserve = o.segs.some((s) => RE_RESERVE.test(s.texte));
    const resX = porteReserve ? [] : [segRes(reserveIndisp)];
    const paras = [[xLieu], [...o.segs, ...resX], [seg('source_x', { url: champ(o.src.url, 'source.url') }, 'attribution'), seg('suivi_x', { lien: champ(lien('x'), 'lien') }, 'renvoi')]];
    const t = rendre(paras); essais.push(`${longueurX(t)} car.`);
    if (longueurX(t) <= LIMITE_X) { x = { paragraphes: paras, texte: t, repli: o !== options[0], source: o.src, attention: alerteAcces(o.src) }; break; }
  }
  const xRes = x ? { etat: 'OK', ...x } : { etat: 'BLOQUE', motifs: [`aucune version fidèle ne tient en ${LIMITE_X} caractères avec la réserve indispensable et les deux liens (essais : ${essais.join(' ; ') || 'aucune option sourcée'})`] };
  return { etat: 'OK', motifs: [], attention: [...new Set(attention)], notes, soeurs, x: xRes, facebook: { etat: 'OK', ...facebook }, sourcePrincipale: srcLien };
}

// ---------------------------------------------------------------------
// CONTRÔLE INDÉPENDANT d'un post composé — reconstruit les valeurs autorisées depuis les données brutes (ne fait PAS confiance au composeur).
// ---------------------------------------------------------------------
export function valeursAutorisees(M, site) {
  const v = new Set();
  const add = (s) => { if (s != null && s !== '') v.add(String(s)); };
  const e = M.entree;
  if (e) { add(e.commune); add(e.departement); add(e.etablissement); }
  if (M.d) {
    for (const t of M.d.etat_actuel || []) add(t);
    if (typeof M.d.accroche_courte === 'string') add(M.d.accroche_courte.trim());
    for (const x of M.d.deroule || []) add(x.texte);
    for (const r of [...(M.d.reactions || []), ...(M.d.paroles || [])]) { add(r.acteur); add(r.qualite); add(dateLongue(r.date)); for (const c of r.citations || []) add(c.texte); if (/Une prise de parole n’établit pas son contenu\./.test(r.etabli || '')) add('Une prise de parole n’établit pas son contenu.'); }
  }
  for (const x of M.evenements || []) { add(x.libelle); for (const p of [x.libelle, ...phrasesDe(x.libelle)]) { add(p); add(sansPointFinal(p)); } add(x.source?.media); }
  for (const x of M.matiere || []) add(x.libelle);
  for (const l of M.site || []) add(l);
  add(M.reserveA4);
  for (const s of M.sources.values()) { add(s.media); add(s.url); add(dateLongue(s.publie_le)); }
  add('date non précisée');
  // Libellés fixes (avec date d'un événement validé de CETTE affaire) et liens SNY de CETTE affaire.
  for (const l of Object.values(LIBELLES.nouvelle_affaire)) add(l);
  for (const l of Object.values(LIBELLES.evolution)) for (const x of M.evenements || []) add(l.replace('{date}', dateLongue(x.date) ?? ''));
  for (const x of M.matiere || []) add(LIBELLES.declaration_association.replace('{acteur}', x.acteur));
  if (M.d) for (const r of [...(M.d.reactions || []), ...(M.d.paroles || [])]) add(LIBELLES.declaration_victime.replace('{acteur}', r.acteur));
  if (e) for (const canal of ['x', 'facebook']) for (const fiche of [true, false]) {
    add(lienDiffusion({ site, case_id: e.case_id, type: 'new_case', canal, fiche }));
    for (const x of M.evenements || []) add(lienDiffusion({ site, case_id: e.case_id, type: 'case_update', statut: x.statut, canal, fiche }));
  }
  return v;
}

/** @returns {{ok:boolean, controles:{nom:string, ok:boolean, detail?:string}[]}} */
export function verifierPost(post, canal, M, site) {
  const c = [];
  const ok = (nom, cond, detail = '') => c.push({ nom, ok: !!cond, detail: cond ? '' : detail });
  const autorise = valeursAutorisees(M, site);
  const segs = post.paragraphes.flat();
  ok('texte = assemblage exact des segments (rien d’ajouté)', rendre(post.paragraphes) === post.texte);
  const gab = segs.filter((s) => !GABARITS[s.gabarit] || GABARITS[s.gabarit].replace(/\{(\w+)\}/g, (_, k) => String(s.champs[k]?.valeur ?? '')) !== s.texte);
  ok('gabarits de la liste blanche uniquement', !gab.length, gab.map((s) => s.gabarit).join(', '));
  const hors = segs.flatMap((s) => Object.entries(s.champs).filter(([, v]) => !autorise.has(String(v.valeur))).map(([k, v]) => `${s.gabarit}.${k} = « ${String(v.valeur).slice(0, 60)} »`));
  ok('100 % des valeurs proviennent de la matière approuvée de CETTE affaire', !hors.length, hors.join(' | '));
  const g = gardes(post.texte.replace(/https?:\/\/\S+/g, ''), M.entree);
  ok('gardes de sécurité des personnes (texte final)', !g.bloquants.length, g.bloquants.join(', '));
  const urls = post.texte.match(/https?:\/\/\S+/g) || [];
  ok(ARBITRAGES.lienAvecDecompte ? 'URL autorisées (arbitrage A2 : décompte toléré dans l’adresse, jamais dans le texte ; aucun média payant)' : 'URL sûres (aucun décompte d’enfants dans l’adresse, aucun média payant)', urls.every((u) => urlSure(u)) && !segs.some((s) => s.gabarit.startsWith('source') && MEDIAS_PAYANTS.includes(s.champs.media?.valeur)), urls.filter((u) => !urlSure(u)).join(' '));
  ok('lien SNY présent', segs.some((s) => s.role === 'renvoi'));
  ok('lien source présent', segs.some((s) => s.role === 'attribution'));
  // Le média du lien « Source » doit être NOMMÉ par le texte qui affirme (hors ligne « Source : » elle-même). Défaut v1 non détecté : « Selon Ouest-France » + lien Le Figaro.
  const corps = segs.filter((s) => s.role !== 'attribution' && s.role !== 'renvoi').map((s) => s.texte).join(' ');
  const lies = segs.filter((s) => s.role === 'attribution').map((s) => M.sources.get(s.champs.url?.valeur)).filter(Boolean);
  ok('le lien « Source » est celui d’un média nommé dans le texte', lies.length > 0 && lies.every((s) => sourcesNommees(corps, new Map([[s.url, s]])).length === 1), lies.map((s) => s.media).join(', '));
  ok('réserve judiciaire présente', segs.some((s) => s.role === 'reserve') || segs.some((s) => RE_RESERVE.test(s.texte)));
  if (canal === 'x') ok(`X ≤ ${LIMITE_X} caractères (URL = ${LONGUEUR_LIEN_X})`, longueurX(post.texte) <= LIMITE_X, String(longueurX(post.texte)));
  ok('aucune donnée interne (identifiant, champ technique)', !/FR-2026-\d{4}(?!\/|\?|-)|POC-\d+(?![\w/?-])|statut_judiciaire|undefined|null\b/i.test(post.texte.replace(/https?:\/\/\S+/g, '')));
  return { ok: c.every((x) => x.ok), controles: c };
}

// ---------------------------------------------------------------------
// GRILLE QUALITÉ — AIDE À LA REVUE (mécanique, explicable). N'autorise jamais rien ; un échec bloquant met la note à 0.
// ---------------------------------------------------------------------
export function noter(post, canal, verif, { famille } = {}) {
  if (!post || !verif?.ok) return { total: 0, detail: { bloquant: 'contrôle bloquant en échec' } };
  const segs = post.paragraphes.flat();
  const faits = segs.filter((s) => s.role === 'fait');
  const fid = 35;
  const attribue = faits.every((s) => /\b(selon|d’après|d'après|propos rapportés|indique|annoncé|a indiqué)\b/i.test(s.texte) || s.gabarit !== 'phrase');
  const ctx = (segs.some((s) => s.role === 'reserve') || segs.some((s) => RE_RESERVE.test(s.texte)) ? 15 : 0) + (attribue ? 5 : 0) + (faits.length ? 5 : 0);
  const acc = segs[0]?.role === 'accroche' ? (canal === 'facebook' ? (segs[0].champs.libelle?.valeur ? 20 : 10) : (faits.length && !post.repli ? 20 : 12)) : 0;
  const n = canal === 'x' ? longueurX(post.texte) : post.texte.length;
  const lis = canal === 'x' ? (n <= LIMITE_X ? 10 : 0) + (faits.some((s) => s.texte.length >= 80) ? 5 : 2) : (n >= 300 && n <= LIMITE_FB_LISIBLE ? 10 : n < 300 ? 5 : 3) + (post.paragraphes.filter((p) => p.length).length <= 5 ? 5 : 2);
  const sny = segs.some((s) => s.role === 'renvoi' && /\/affaires\//.test(s.texte)) ? 5 : segs.some((s) => s.role === 'renvoi') ? 3 : 0;
  return { total: fid + ctx + acc + lis + sny, detail: { fidelite: fid, contexte: ctx, accroche: acc, lisibilite: lis, sny, famille } };
}

/** Preuves « affirmation → source → passage → validation » d'un post (une ligne par segment porteur d'affirmation). */
export function preuvesDe(post) {
  return post.paragraphes.flat().filter((s) => ['fait', 'reserve', 'contexte', 'accroche'].includes(s.role)).map((s) => ({
    role: s.role, affirmation: s.texte,
    source: s.preuve?.source ?? null,
    passage: Object.values(s.champs).map((v) => `${v.origine} : « ${String(v.valeur).slice(0, 240)}${String(v.valeur).length > 240 ? '…' : ''} »`).join(' ; '),
    validation: s.role === 'accroche' ? 'champs publics de la fiche carte (data/cases.json) + libellé fixe' : s.preuve?.validation ?? '—',
  }));
}

export { rang };
