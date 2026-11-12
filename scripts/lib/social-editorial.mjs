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

export const VERSION = 'pilote-social-v4.0';
export const FAMILLES = Object.freeze(['nouvelle_affaire', 'evolution', 'declaration_association', 'declaration_victime']);
// Longueur LISIBLE d'un post Facebook, URL comprises pour 23 caractères (comme X) : les adresses longues des médias ne doivent pas évincer le contexte (défaut V3).
// Au-delà, le contexte facultatif est retiré (jamais coupé).
const LIMITE_FB_LISIBLE = 1400;
const MAX_CONTEXTE_FB = 2;

export const plat = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const dateLongue = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : null; };

// ---------------------------------------------------------------------
// LISTES BLANCHES : seuls textes qui ne sont pas des phrases approuvées. Aucun ne contient d'affirmation factuelle sur une affaire.
// ---------------------------------------------------------------------
export const GABARITS = Object.freeze({
  accroche_fb: '{commune} ({departement}) — {etablissement} : {libelle}',
  // V4 — le fait avant la procédure : l'accroche dit AUSSI l'objet de la procédure. {qualif} est un EXTRAIT EXACT d'une phrase approuvée qui porte ce statut
  // (« mis en examen pour viol sur mineur » → « viol sur mineur ») ; le contrôleur vérifie qu'il en est une sous-chaîne.
  accroche_fb_qualif: '{commune} ({departement}) — {etablissement} : {libelle} pour {qualif}',
  accroche_x: '{commune} · {etablissement}',
  fait_x: '{commune} · {etablissement} : {libelle} pour {qualif} (selon {media}).',
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
  // « enquête ouverte » et non « enquête en cours » : que l'enquête se poursuive aujourd'hui n'est établi par aucune source (V4, S01 : aucun développement après juillet).
  nouvelle_affaire: { 'enquête': 'enquête ouverte', 'mise en examen': 'mise en examen', 'procès': 'affaire au stade du procès', 'condamnation non définitive': 'condamnation prononcée', 'condamnation définitive': 'condamnation définitive' },
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
// V4 — LE FAIT AVANT LA PROCÉDURE (arbitrage éditorial n°1, 12/11/2026). Rien n'est rédigé : on EXTRAIT et on CHOISIT dans la matière approuvée.
// ---------------------------------------------------------------------
/** Ancre de la qualification dans une phrase approuvée qui porte CE statut (« mis en examen pour … », « ouvert une enquête préliminaire du chef d'… »). */
const ANCRES_QUALIF = {
  'enquête': /(?:ouvert une enquête(?: préliminaire| judiciaire)? |enquête(?: préliminaire| judiciaire)? (?:a été )?ouverte )(?:du chef d['’]|pour )|en garde à vue pour /i,
  'mise en examen': /mise?s? en examen (?:du chef d['’]|pour )/i,
  'condamnation non définitive': /condamn\w*\b[^.;«»]*? pour /i,
  'condamnation définitive': /condamn\w*\b[^.;«»]*? pour /i,
};
/**
 * Objet de la procédure : EXTRAIT EXACT (sous-chaîne) de la première phrase approuvée qui énonce ce statut, coupé à la première ponctuation ou articulation.
 * Jamais la catégorie de la carte : « agression sexuelle » (carte, FR-2026-0001) serait faux pour une condamnation pour « atteinte sexuelle ».
 * @param {string} statut @param {{texte:string, origine:string}[]} textes  par ordre de préférence
 */
export function qualification(statut, textes, entree) {
  const ancre = ANCRES_QUALIF[statut];
  if (!ancre) return null;
  for (const t of textes) {
    const m = ancre.exec(t?.texte || '');
    if (!m) continue;
    const q = t.texte.slice(m.index + m[0].length).split(/[,;.()«»:]| et | pour | commis| dans | après | depuis /)[0].trim();
    // Variante courte (X seulement) : sans la circonstance introduite par « par » (« … sur mineurs de 15 ans » au lieu de « … par personne ayant autorité ») :
    // toujours une sous-chaîne exacte, moins complète, jamais fausse.
    const court = q.split(/ par /)[0].trim();
    if (q.length >= 4 && q.length <= 90 && !gardes(q, entree).bloquants.length) return { qualif: q, court: court !== q && court.length >= 12 ? court : null, texte: t.texte, origine: t.origine };
  }
  return null;
}

/** Part des mots porteurs (> 3 lettres) d'un texte déjà présents dans ce qui est dit : au-delà de 1/2, le texte n'apporte rien (doublon de fond). */
// Comparés sur leurs 5 premières lettres : « suspendus » / « suspendues », « école » / « écoles » sont le même mot (défaut V4.1 : S01 redisait la suspension).
const motsPorteurs = (t) => new Set(plat(t).split(' ').filter((w) => w.length > 3).map((w) => w.slice(0, 5)));
export function recouvrement(texte, dits) {
  const a = motsPorteurs(texte);
  if (!a.size) return 1;
  const b = new Set(dits.flatMap((x) => [...motsPorteurs(x)]));
  let n = 0; for (const w of a) if (b.has(w)) n++;
  return n / a.size;
}
/** Une phrase de contexte doit porter sa PROPRE attribution (jamais reprise derrière une autre). */
const RE_ATTRIBUEE = /\bselon\b|d['’]après|\bcité|\bindique|\bprécise|\bannonce|\brapporte/i;
/**
 * Adresse d'article qui ANNONCE une issue ou une étape (« …-ecope-d-un-an-de-prison… », « …-trois-hommes-deferes… »). Liée à une affaire qui n'en est pas là, elle
 * fait lire au lecteur une autre procédure (V4 : Linfo.re pour Pontoise titre sur la condamnation de Stanislas ; le JDD pour Aqueduc sur trois hommes déférés).
 */
const RE_URL_ETAPE = /condamn|ecope|prison|relax|acquitt|defere/;
export function urlAnnonceAutreEtape(url, statut) {
  if (!url) return false;
  const slug = plat(decodeURIComponent(url)).replace(/ /g, '-');
  if (!RE_URL_ETAPE.test(slug)) return false;
  return !/^condamnation|^relaxe/.test(statut || '') || /defere/.test(slug);
}
const ACCES_CONSTATE = ['libre', 'événement validé', 'information validée'];
/** Phrase qui commence (après « Selon X, ») par un renvoi à ce qui précède dans le dossier : illisible isolée dans un post. */
const RE_ANAPHORE = /^(?:(?:selon|d['’]après) [^,]+, )?(?:ces|cette|cet|ce|ceux|celles?|celui|ils|elles|il|elle|leurs?|lui)\b/i;

// ---------------------------------------------------------------------
// V4 — DÉCLARATIONS (arbitrages éditoriaux n°2 et n°3). Trois contrôles indépendants ; tout échec bloque. Une déclaration n'est JAMAIS conforme d'office.
// ---------------------------------------------------------------------
/** Ordre de priorité des prises de parole (arbitrage n°3) : 1 parents, 2 collectifs de parents, 3 associations de familles, 4 associations spécialisées, 5 avocats, 6 autres. */
export function categorieParole(acteur) {
  const a = plat(acteur);
  if (/\bavocat/.test(a) || /\bme [a-z]/.test(a)) return { rang: 5, nom: 'avocat' };
  if (/\bcollectif/.test(a)) return { rang: 2, nom: 'collectif' };
  if (/\bparents?\b|\bmere\b|\bpere\b|\bfamilles?\b/.test(a)) return { rang: 1, nom: 'parents' };
  if (/\bassociation|enfant bleu|innocence en danger|cdp enfance|une vie\b|\bcvm\b/.test(a)) return { rang: 4, nom: 'association' };
  return { rang: 6, nom: 'autre' };
}
// Réaction purement évaluative (satisfaction, déception…) sans démarche, demande, ni explication : pas de plus-value identifiable (arbitrage n°3).
const RE_EVALUATIF = /\b(satisf\w*|content\w*|heureu\w*|soulag\w*|decu\w*|deception|regrett\w*|choque\w*|scandalis\w*|indign\w*|ravi\w*|salu\w*|merci)\b/;
const RE_SUBSTANCE = /\b(demand\w*|exig\w*|reclam\w*|appel\w*|plaintes?|partie civile|recours|saisi\w*|signal\w*|petition|rassembl\w*|doit|doivent|faut|obligation|securite|parole|preuves?|elements?|enquet\w*|proces|audience|conteste\w*)\b/;
export function interetConcret(citation) {
  const t = plat(citation);
  if (RE_EVALUATIF.test(t) && !RE_SUBSTANCE.test(t)) return { ok: false, detail: 'réaction évaluative seule (satisfaction / déception) : ni démarche, ni demande, ni explication de la décision' };
  return { ok: true, detail: RE_SUBSTANCE.test(t) ? 'porte une démarche, une demande ou une explication' : 'énonce une position (à apprécier en revue)' };
}

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
  let principal = [], contexte = [], libelle = null, sourcesFait = [], evt = null, declaration = null;
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
          // V4 : le contexte (autres étapes, résumé de l'affaire) est choisi plus bas, par apport réel et accès constaté (choisirContexte).
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
      // V4 (arbitrage n°2) : relayer une déclaration, c'est la FAIRE LIRE. L'information validée est une paraphrase rédigée par SNY, pas un extrait de l'association.
      const cit = (x.citations || []).find((c) => typeof c?.texte === 'string' && c.texte.trim());
      const cat = categorieParole(x.acteur);
      declaration = {
        categorie: cat,
        controles: [
          { nom: 'citation exacte visible', ok: !!cit, detail: cit ? '' : 'la matière validée ne contient qu’une paraphrase rédigée par SNY (« L’association indique… ») : aucun extrait exact de la déclaration' },
          cit ? { nom: 'intérêt concret de la déclaration', ...interetConcret(cit.texte) } : { nom: 'intérêt concret de la déclaration', ok: false, detail: 'non évaluable sans extrait exact' },
          { nom: 'lien direct avec l’affaire', ok: x.portee === 'affaire', detail: x.portee === 'affaire' ? '' : `portée validée « ${x.portee} » : publication générale de l’association (actions auprès des collectivités) ; elle ne précise ni la date de la démarche ni la procédure visée` },
        ],
      };
      principal.push({ texte: x.libelle, origine: `matiere:${x.id}` });
      sourcesFait = [M.sources.get(x.source?.url)].filter(Boolean);
      libelle = LIBELLES.declaration_association.replace('{acteur}', x.acteur);
      evt = { acteur: x.acteur };
    }
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
      const cat = categorieParole(r.acteur);
      const interet = interetConcret(c.texte);
      // Arbitrage n°3 : pour une affaire EN COURS (aucune décision), la parole d'un avocat doit apporter une démarche, une demande ou une explication.
      const enCours = !/^condamnation|^relaxe/.test(e.statut_judiciaire);
      if (cat.nom === 'avocat' && enCours && interet.ok && !RE_SUBSTANCE.test(plat(c.texte))) { interet.ok = false; interet.detail = 'affaire en cours : la parole d’un avocat doit apporter une démarche, une demande ou une information nouvelle'; }
      declaration = {
        categorie: cat,
        controles: [
          { nom: 'citation exacte visible', ok: (r.citations || []).some((x) => x.texte === c.texte), detail: '' },
          { nom: 'intérêt concret de la déclaration', ...interet },
          { nom: 'lien direct avec l’affaire', ok: r.portee === 'affaire' && !!M.sources.get(r.source?.url), detail: r.portee === 'affaire' && M.sources.get(r.source?.url) ? '' : 'portée ou source non rattachée à cette affaire' },
        ],
      };
      principal.push({ parole: true, acteur: r.acteur, qualite: r.qualite, date: dateLongue(r.date), citation: c.texte, origine: `dossier.reactions[${scenario.reaction}]` });
      if (r.etabli) { const m = /Une prise de parole n’établit pas son contenu\./.exec(r.etabli); if (m) contexte.push({ texte: m[0], origine: `dossier.reactions[${scenario.reaction}].etabli` }); }
      sourcesFait = [M.sources.get(r.source?.url)].filter(Boolean);
      libelle = LIBELLES.declaration_victime.replace('{acteur}', r.acteur);
    }
  }
  if (declaration) {
    for (const k of declaration.controles) if (!k.ok) bloque.push(`déclaration — ${k.nom} : ${k.detail}`);
    attention.push(`déclaration (${declaration.categorie.nom}, priorité ${declaration.categorie.rang}/6) : REVUE_HUMAINE obligatoire — GO social humain distinct, par réseau ; jamais couverte par le GO Telegram de la fiche`);
    if (declaration.categorie.nom === 'avocat') attention.push('déclaration d’avocat : validation humaine spécifique de sa plus-value');
  } else if (scenario.famille.startsWith('declaration') && !bloque.length) bloque.push('prise de parole absente du dossier approuvé');
  if (!principal.length && !bloque.length) bloque.push('aucun fait principal approuvé et sûr à exposer');

  // Rattachement exact : chaque source du fait doit être rattachée à CETTE affaire ; si la phrase n'en nomme aucune, elle n'est pas traçable.
  if (principal.length && !sourcesFait.length) bloque.push('fait principal sans source rattachée identifiable (aucun média nommé ne correspond aux sources de l’affaire)');
  // V4 : parmi les sources du fait, préférer celle dont l'adresse n'annonce pas une autre étape ; si c'est la seule, la revue humaine juge la confusion.
  const srcLien = sourceALier(sourcesFait.filter((s) => !urlAnnonceAutreEtape(s.url, e.statut_judiciaire))) ?? sourceALier(sourcesFait);
  if (srcLien && urlAnnonceAutreEtape(srcLien.url, e.statut_judiciaire)) attention.push(`l’adresse de l’article lié (${srcLien.media}) annonce une étape qui n’est pas celle de cette affaire : confusion possible à apprécier`);
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

  if (bloque.length) return out({ soeurs, declaration });

  // --- 2. SEGMENTS -----------------------------------------------------------------------------------------------------------------
  const preuve = (p, src, validation) => ({ source: src ? { media: src.media, url: src.url, publie_le: src.publie_le } : null, validation });
  const validationDe = (origine) => origine.startsWith('dossier') ? validationFiche : origine.startsWith('evenement') ? `événement validé (Neon, ${origine.split(':')[1]})` : origine.startsWith('matiere') ? `information validée (Neon, ${origine.split(':')[1]})` : origine.startsWith('site') ? 'formulation officielle du site (etat-wording.ts) — déjà servie sur la fiche' : origine === 'arbitrage:A4' ? 'mention fixe arbitrée par Adrien (A4, 12/11/2026) — pilote seulement, NON servie sur le site' : origine;
  const srcDe = (t) => sourceALier(sourcesDePhrase(t, M)) ?? sourcesDePhrase(t, M)[0] ?? null;
  const segFait = (p, role = 'fait') => p.parole
    ? seg('parole', { acteur: champ(p.acteur, p.origine + '.acteur'), qualite: champ(p.qualite, p.origine + '.qualite'), date: champ(p.date, p.origine + '.date'), citation: champ(p.citation, p.origine + '.citations') }, role, preuve(p, srcLien, validationDe(p.origine)))
    : p.origine.startsWith('evenement') ? seg('libelle_evenement', { libelle: champ(sansPointFinal(p.texte), p.origine), media: champ(p.media, p.origine + '.source.media') }, role, preuve(p, srcLien, validationDe(p.origine)))
      : phrase(p.texte, p.origine, role, preuve(p, p.origine.startsWith('site') ? sourceDuSite(M) : p.origine.startsWith('matiere') ? srcLien : srcDe(p.texte) ?? srcLien, validationDe(p.origine)));
  const segRes = (r) => segFait(r, 'reserve');
  const type = scenario.famille === 'evolution' ? 'case_update' : 'new_case';
  const fiche = !!M.empreinte;
  const lien = (canal) => lienDiffusion({ site, case_id: e.case_id, type, statut: scenario.famille === 'evolution' ? evt?.statut : null, canal, fiche });
  const sourceSeg = (s) => seg('source_fb', { media: champ(s.media, 'source.media'), date: champ(dateLongue(s.publie_le) ?? 'date non précisée', 'source.date'), url: champ(s.url, 'source.url') }, 'attribution');

  // V4 — OBJET DE LA PROCÉDURE (accroche) : extrait exact d'une phrase approuvée qui énonce CE statut. Pour une évolution, seulement dans le fait de CET événement.
  const statutQ = evt?.statut ?? e.statut_judiciaire;
  const textesQ = [...principal.filter((p) => p.texte).map((p) => ({ texte: p.texte, origine: p.origine })),
    ...(scenario.famille === 'evolution' && evt?.libelle ? [{ texte: evt.libelle, origine: `evenement:${evt.event_id}` }] : []),
    ...(scenario.famille === 'nouvelle_affaire' ? (d?.etat_actuel || []).map((t, i) => ({ texte: t, origine: `dossier.etat_actuel[${i}]` })) : [])];
  const Q = ['nouvelle_affaire', 'evolution'].includes(scenario.famille) && libelle ? qualification(statutQ, textesQ, e) : null;
  const srcQ = Q ? (Q.origine.startsWith('evenement') ? srcLien : sourceALier(sourcesDePhrase(Q.texte, M))) : null;
  const lieuChamps = { commune: champ(e.commune, 'entree.commune'), departement: champ(e.departement, 'entree.departement'), etablissement: champ(e.etablissement, 'entree.etablissement'), libelle: champ(libelle, 'libelle') };
  const qualifChamp = Q ? { qualif: champ(Q.qualif, `extrait:${Q.origine}`) } : null;

  // V4 — CONTEXTE (paragraphe 2) : ce qui fait comprendre l'affaire à qui la découvre. Choisi, jamais rédigé : phrases approuvées ENTIÈRES, portant leur propre
  // attribution, à source rattachée d'accès constaté, n'apportant pas un doublon de fond (recouvrement < 1/2), et désignant la fonction si une procédure sœur existe.
  const dits = [...principal.map((p) => p.texte ?? p.citation), situationDecl?.texte ?? '', ...contexte.map((c) => c.texte)].filter(Boolean);
  const choisis = [];
  if (d && ['nouvelle_affaire', 'evolution'].includes(scenario.famille)) {
    const cands = [];
    // Évolution : d'abord les autres passages du MÊME article sur le MÊME jour (rattachement documentaire le plus fort : ils parlent de la décision annoncée).
    if (evt) for (const [i, x] of (d.deroule || []).entries()) if (x.source?.url === evt.source?.url && x.texte !== principal[0]?.texte) cands.push({ texte: x.texte, origine: `dossier.deroule[${i}]`, memeArticle: true, memeEvt: !!(x.date && x.date === evt.date) });
    for (const [i, t] of phrasesDe(d.faits).entries()) cands.push({ texte: t, origine: `dossier.faits#${i}` });
    // Étape d'un autre article DÉPASSÉE par le statut (« renvoyé … pour agression sexuelle » sous une condamnation pour atteinte sexuelle, S04) : de la procédure
    // ancienne, pas un fait nouveau, et une source de confusion. Exclue (arbitrage n°1).
    const RANG_ETAPE = { enquete: 1, garde_a_vue: 1, mise_en_examen: 2, renvoi: 3, audience: 3, decision: 4, appel: 5 };
    const RANG_STATUT = { 'enquête': 1, 'mise en examen': 2, 'procès': 3, 'condamnation non définitive': 4, 'condamnation définitive': 4 };
    const depassee = (x) => RANG_ETAPE[x.type] != null && RANG_STATUT[statutQ] != null && RANG_ETAPE[x.type] < RANG_STATUT[statutQ];
    for (const [i, x] of (d.deroule || []).entries()) if (!depassee(x)) cands.push({ texte: x.texte, origine: `dossier.deroule[${i}]` });
    // Passages de l'article de l'événement d'abord (ordre du dossier) ; ensuite le plus NOUVEAU (moindre recouvrement avec ce qui est déjà dit).
    // Défaut V4.1 : trier aussi l'article de l'événement par nouveauté faisait passer d'anciennes mesures disciplinaires avant la suite immédiate (S03).
    const nouveaute = (c) => (c.memeArticle ? -1 : recouvrement(c.texte, dits));
    const ordonnes = cands.map((c, i) => ({ c, i, n: nouveaute(c) })).sort((a, b) => a.n - b.n || a.i - b.i).map((x) => x.c);
    for (const c of ordonnes) {
      if (choisis.length >= MAX_CONTEXTE_FB) break;
      const t = c.texte;
      if (!t || t.length > 500 || RE_RESERVE.test(t) || !RE_ATTRIBUEE.test(t) || RE_SEXE_ENFANT.test(t) || gardes(t, e).bloquants.length) continue;
      // Procédure sœur : la phrase doit désigner la fonction, sauf si elle décrit le même jugement, dans le même article, que le fait qui la désigne.
      if (soeurs.length && !RE_DESIGNATION_ROLE.test(t) && !c.memeEvt) continue;
      // Phrase AUTONOME : lue seule dans le post, elle ne renvoie à rien d'absent (défaut V4.2, S03 : « Selon Sud Ouest, ces images… »).
      if (RE_ANAPHORE.test(t)) continue;
      // Doublon de fond : seuil relevé pour l'article de l'événement, où une phrase courte partage forcément le vocabulaire du fait (« témoin assisté », S03).
      if (recouvrement(t, [...dits, ...choisis.map((x) => x.texte)]) >= (c.memeArticle ? 0.7 : 0.5)) continue;
      // Toutes les sources de la phrase doivent avoir été LUES par SNY (accès constaté, libre ou partiel), la source LIÉE en accès libre (défaut V4.0 : « Selon
      // Le Figaro », lu en partie, porté seul par S01), et aucune adresse ne doit annoncer une autre étape (défaut V4.0 : Linfo.re, S02).
      const srcs = sourcesDePhrase(t, M);
      if (!srcs.length || srcs.some((s) => s.acces == null) || srcs.some((s) => urlAnnonceAutreEtape(s.url, e.statut_judiciaire))) continue;
      // Le lien est celui d'un média que la phrase NOMME quand elle en nomme un (défaut V4.1, S03 : « Selon Commons Média » lié à CNEWS, source complémentaire
      // de la même étape — détecté par le contrôleur indépendant).
      const lisibles = srcs.filter((s) => ACCES_CONSTATE.includes(s.acces));
      const nommes = sourcesNommees(t, new Map(lisibles.map((s) => [s.url, s])));
      const src = sourceALier(nommes.length ? nommes : lisibles);
      if (!src) continue;
      choisis.push({ ...c, src });
    }
  }

  // RÉSERVES — une par THÈME (présomption, caractère définitif, prise de parole, confirmation). V4 : la réserve de la fiche n'est préférée que si elle dit
  // PLUS que la mention courte (« appel pour une partie seulement… ») ; si elle constate seulement une absence (« … non documentés : aucun article… »),
  // la mention courte du site ou de l'arbitrage A4 suffit (formulation utile et suffisante, arbitrage n°1).
  const theme = (t) => (/culpabilit|présum|présomption/i.test(t) ? 'presomption' : /définiti/i.test(t) ? 'definitif' : /n['’]établit/i.test(t) ? 'parole' : /confirmée/i.test(t) ? 'confirmation' : plat(t));
  const precise = (r) => r.origine.startsWith('dossier') && !/non document/i.test(r.texte);
  const ordre = (r) => (precise(r) ? 0 : r.origine.startsWith('site') ? 1 : r.origine === 'arbitrage:A4' ? 2 : 3);
  const dejaDit = new Set(principal.map((p) => plat(p.texte ?? p.citation)));
  const themes = new Set([...principal, ...contexte].filter((p) => p.texte && RE_RESERVE.test(p.texte) && dejaDit.has(plat(p.texte))).map((p) => theme(p.texte)));
  const fbReserves = [];
  for (const r of [...reserves].sort((a, b) => ordre(a) - ordre(b))) if (!dejaDit.has(plat(r.texte)) && !themes.has(theme(r.texte))) { fbReserves.push(segRes(r)); dejaDit.add(plat(r.texte)); themes.add(theme(r.texte)); }

  // FACEBOOK : accroche (lieu + fait) · fait · contexte · mention judiciaire courte · sources (une par média nommé) · renvoi SNY.
  const fbFaits = principal.map((p) => segFait(p));
  const fbContexte = [];
  if (situationDecl && !dejaDit.has(plat(situationDecl.texte))) { fbContexte.push(segFait(situationDecl, 'contexte')); dejaDit.add(plat(situationDecl.texte)); }
  for (const c of contexte) if (!RE_RESERVE.test(c.texte) && !dejaDit.has(plat(c.texte))) { fbContexte.push(segFait(c, 'contexte')); dejaDit.add(plat(c.texte)); }
  for (const c of choisis) if (!dejaDit.has(plat(c.texte))) { fbContexte.push(phrase(c.texte, c.origine, 'contexte', preuve(c, c.src, validationDe(c.origine)))); dejaDit.add(plat(c.texte)); }
  const accrocheFb = qualifChamp ? seg('accroche_fb_qualif', { ...lieuChamps, ...qualifChamp }, 'accroche', preuve(Q, srcQ, `${validationDe(Q.origine)} — extrait exact`)) : seg('accroche_fb', lieuChamps, 'accroche');
  const fbBase = [[accrocheFb], fbFaits];
  // La situation d'une déclaration n'est jamais retirée (elle distingue la procédure) ; le reste du contexte l'est, du dernier au premier.
  const garde = situationDecl ? 1 : 0;
  let fbCtx = [...fbContexte];
  const sourcesFb = () => {
    const vues = new Set(); const l = [];
    for (const s of [srcLien, ...fbCtx.map((x) => x.preuve?.source && M.sources.get(x.preuve.source.url))]) if (s?.url && !vues.has(s.url) && sourceALier([s])) { vues.add(s.url); l.push([sourceSeg(s)]); }
    return l;
  };
  const assembler = () => [...fbBase, ...fbCtx.map((x) => [x]), [...fbReserves], ...sourcesFb(), [seg('suivi_fb', { lien: champ(lien('facebook'), 'lien') }, 'renvoi')]];
  let fbParas = assembler();
  while (longueurX(rendre(fbParas)) > LIMITE_FB_LISIBLE && fbCtx.length > garde) { fbCtx = fbCtx.slice(0, -1); fbParas = assembler(); }
  const facebook = { paragraphes: fbParas, texte: rendre(fbParas), attention: alerteAcces(srcLien) };

  // X : lieu + fait (phrases approuvées ENTIÈRES) + réserve indispensable + source DU fait affiché + suivi. Du plus riche au plus court ; rien ne tient ⇒ X bloqué.
  // Chaque option porte la source qu'elle cite : le lien « Source » est toujours celui du média nommé (défaut v1 : « Selon Ouest-France » → lien Le Figaro).
  const xLieu = seg('accroche_x', lieuChamps, 'accroche');
  const options = [];
  const ajoutOption = (segs, src, lieuInclus = false) => { if (src?.url && urlSure(src.url) && !MEDIAS_PAYANTS.includes(src.media)) options.push({ segs, src, lieuInclus }); };
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
  // V4 — fait qualifié : « <lieu> : <étape> pour <objet> (selon <média>). » ; l'objet est l'extrait exact déjà utilisé par l'accroche Facebook, le média celui
  // de la phrase d'où il est extrait. Remplace le repli V3 sur la seule phrase d'état du site (« Selon X, une enquête a été ouverte. ») : une formule qui ne
  // dit que l'étape, et qui créditait pour S01 un article (Ouest-France) jamais relu par SNY (arbitrage n°1 : pas de formule abstraite à la place du fait).
  if (Q && srcQ) ajoutOption([seg('fait_x', { ...lieuChamps, ...qualifChamp, media: champ(srcQ.media, 'source.media') }, 'fait', preuve(Q, srcQ, `${validationDe(Q.origine)} — extrait exact`))], srcQ, true);
  if (Q?.court && srcQ) ajoutOption([seg('fait_x', { ...lieuChamps, qualif: champ(Q.court, `extrait:${Q.origine}`), media: champ(srcQ.media, 'source.media') }, 'fait', preuve(Q, srcQ, `${validationDe(Q.origine)} — extrait exact (sans la circonstance « par … »)`))], srcQ, true);
  let x = null; const essais = [];
  for (const o of options) {
    // Procédures sœurs : X doit aussi désigner la personne visée par sa fonction, sinon l'option est écartée (défaut v2 S06).
    if (soeurs.length && !RE_DESIGNATION_ROLE.test(o.segs.map((s) => s.texte).join(' '))) { essais.push('option écartée : procédure non distinguée'); continue; }
    const porteReserve = o.segs.some((s) => RE_RESERVE.test(s.texte));
    const resX = porteReserve ? [] : [segRes(reserveIndisp)];
    const tete = o.lieuInclus ? [] : [[xLieu]];
    const paras = [...tete, [...o.segs, ...resX], [seg('source_x', { url: champ(o.src.url, 'source.url') }, 'attribution'), seg('suivi_x', { lien: champ(lien('x'), 'lien') }, 'renvoi')]];
    const t = rendre(paras); essais.push(`${longueurX(t)} car.`);
    if (longueurX(t) <= LIMITE_X) { x = { paragraphes: paras, texte: t, repli: o !== options[0], source: o.src, attention: alerteAcces(o.src) }; break; }
  }
  const xRes = x ? { etat: 'OK', ...x } : { etat: 'BLOQUE', motifs: [`aucune version fidèle ne tient en ${LIMITE_X} caractères avec la réserve indispensable et les deux liens (essais : ${essais.join(' ; ') || 'aucune option sourcée'})`] };
  return { etat: 'OK', motifs: [], attention: [...new Set(attention)], notes, soeurs, declaration, x: xRes, facebook: { etat: 'OK', ...facebook }, sourcePrincipale: srcLien };
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
    for (const p of phrasesDe(M.d.faits)) add(p);
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
  // Un EXTRAIT (objet de la procédure, V4) n'est pas une valeur entière : il doit être une sous-chaîne exacte d'une phrase approuvée de cette affaire.
  const approuvees = [...autorise].filter((t) => t.length >= 40);
  const admis = (k, v) => autorise.has(String(v.valeur)) || (k === 'qualif' && String(v.origine || '').startsWith('extrait:') && approuvees.some((t) => t.includes(String(v.valeur))));
  const hors = segs.flatMap((s) => Object.entries(s.champs).filter(([k, v]) => !admis(k, v)).map(([k, v]) => `${s.gabarit}.${k} = « ${String(v.valeur).slice(0, 60)} »`));
  ok('100 % des valeurs proviennent de la matière approuvée de CETTE affaire (extraits : sous-chaîne exacte d’une phrase approuvée)', !hors.length, hors.join(' | '));
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
// V4 : pondération de la mission (précision 30 · fidélité 25 · accroche 20 · lisibilité 15 · contexte judiciaire et SNY 10). Note de l'outil, pas l'avis d'Adrien.
export const GRILLE = Object.freeze({ precision: 30, fidelite: 25, accroche: 20, lisibilite: 15, judiciaire_sny: 10 });
export function noter(post, canal, verif, { famille } = {}) {
  if (!post || !verif?.ok) return { total: 0, detail: { bloquant: 'contrôle bloquant en échec' } };
  const segs = post.paragraphes.flat();
  const sansUrl = (t) => String(t).replace(/https?:\/\/\S+/g, '');
  const long = (roles) => segs.filter((s) => roles.includes(s.role)).reduce((n, s) => n + sansUrl(s.texte).length, 0);
  const faits = segs.filter((s) => s.role === 'fait');
  const ctx = segs.filter((s) => s.role === 'contexte' && !RE_RESERVE.test(s.texte));
  const qualifie = segs.some((s) => s.champs.qualif);
  const parole = segs.some((s) => s.gabarit === 'parole');
  const factuel = long(['fait', 'contexte', 'accroche']), judiciaire = long(['reserve']);
  const part = factuel / Math.max(1, factuel + judiciaire);
  // 1. Précision et richesse (30) : fait précis (objet de la procédure, ou phrase approuvée développée) 15 ; contexte (FB) / fait qualifié (X) 10 ; part factuelle ≥ 70 % 5.
  const faitPrecis = qualifie || parole || faits.some((s) => sansUrl(s.texte).length >= 80);
  const precision = (faitPrecis ? 15 : 5) + (canal === 'facebook' ? (ctx.length ? 10 : 0) : (faitPrecis ? 10 : 0)) + (part >= 0.7 ? 5 : part >= 0.5 ? 2 : 0);
  // 2. Fidélité et attribution (25) : contrôle indépendant passé (valeurs approuvées, lien = média nommé) 15 ; chaque fait et contexte porte son attribution 10.
  // Une phrase sans attribution propre est attribuée si elle suit, dans le même paragraphe, une phrase qui l'est (règle de composition du fait principal).
  const attribue = (s) => s.gabarit !== 'phrase' || RE_ATTRIBUEE.test(s.texte) || post.paragraphes.some((p) => p.indexOf(s) > 0 && p.slice(0, p.indexOf(s)).some((x) => RE_ATTRIBUEE.test(x.texte)));
  const fidelite = 15 + ([...faits, ...ctx].every(attribue) ? 10 : 4);
  // 3. Accroche (20) : territoire 5 ; information principale 15 (étape + objet, acteur d'une déclaration, ou fait développé en tête de X) — étape seule 7.
  const tete = canal === 'x' ? segs.find((s) => s.role === 'fait') : segs[0];
  const accroche = (segs[0]?.champs?.commune ? 5 : 0) + (tete?.champs?.qualif || (famille || '').startsWith('declaration') || (canal === 'x' && tete && sansUrl(tete.texte).length >= 80) ? 15 : 7);
  // 4. Lisibilité (15) : longueur adaptée au réseau 10 ; structure (≤ 3 blocs sur X, ≤ 8 sur Facebook) 5.
  const n = longueurX(post.texte), blocs = post.paragraphes.filter((p) => p.length).length;
  const lisibilite = (canal === 'x' ? (n <= LIMITE_X ? 10 : 0) + (blocs <= 3 ? 5 : 2) : (n >= 300 && n <= LIMITE_FB_LISIBLE ? 10 : 4) + (blocs <= 8 ? 5 : 2));
  // 5. Contexte judiciaire et valeur SNY (10) : mention judiciaire présente et non redondante 5 ; renvoi vers la fiche SNY 5.
  const themesRes = segs.filter((s) => s.role === 'reserve').map((s) => (/culpabilit|présum|présomption/i.test(s.texte) ? 'p' : /définiti/i.test(s.texte) ? 'd' : s.texte));
  const reserveOk = (themesRes.length || segs.some((s) => RE_RESERVE.test(s.texte))) && new Set(themesRes).size === themesRes.length;
  const judiciaire_sny = (reserveOk ? 5 : 0) + (segs.some((s) => s.role === 'renvoi' && /\/affaires\//.test(s.texte)) ? 5 : 0);
  return { total: precision + fidelite + accroche + lisibilite + judiciaire_sny, detail: { precision, fidelite, accroche, lisibilite, judiciaire_sny, part_factuelle: Math.round(part * 100), famille } };
}

/** Preuves « affirmation → source → passage → validation » d'un post (une ligne par segment porteur d'affirmation). */
export function preuvesDe(post) {
  return post.paragraphes.flat().filter((s) => ['fait', 'reserve', 'contexte', 'accroche'].includes(s.role)).map((s) => ({
    role: s.role, affirmation: s.texte,
    source: s.preuve?.source ?? null,
    passage: Object.values(s.champs).map((v) => `${v.origine} : « ${String(v.valeur).slice(0, 240)}${String(v.valeur).length > 240 ? '…' : ''} »`).join(' ; '),
    validation: s.role === 'accroche' ? `champs publics de la fiche carte (data/cases.json) + libellé fixe${s.preuve?.validation ? ` + objet : ${s.preuve.validation}` : ''}` : s.preuve?.validation ?? '—',
  }));
}

export { rang };
