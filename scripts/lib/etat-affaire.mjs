// =====================================================================
// scripts/lib/etat-affaire.mjs — primitive P1 « etat-affaire »
//
// Contrat : 1 fiche minimale + 1 article  ->  proposition de changement
//           d'état factuel, ou NO_CHANGE.
//
// Référence : docs/industrialisation/AUTOPSIE_PARIS_11E.md §5.
//
// ---------------------------------------------------------------------
// SÉPARATION DES COUCHES — invariants de ce module
// ---------------------------------------------------------------------
// 1. Cette primitive produit des FAITS JUDICIAIRES, jamais une décision de
//    présentation. Elle ne sait pas si une fiche doit être retirée, affichée
//    ou masquée. Aucune clé de sortie ne porte de sémantique d'affichage.
//    En particulier `DISPLAY_RELAXE` n'existe pas ici : la finalité d'une
//    relaxe (`definitive` / `non_definitive` / `inconnue`) est un fait ; ce
//    qu'on en affiche est une règle éditoriale AVAL, appliquée ailleurs,
//    après décision humaine.
// 2. CASE_IDENTITY ≠ ESTABLISHMENT_IDENTITY. `normEtab` sert à RAPPROCHER,
//    jamais à CONCLURE. Un établissement qui correspond ne suffit pas à
//    rattacher un article à une affaire : commune, rôle et fenêtre
//    temporelle sont exigés en plus, et le doute produit `DOUTEUX`.
// 3. Aucun changement d'état n'est proposé sans passage justificatif cité
//    depuis le corps de l'article (`quote`).
// 4. Le libellé public est imposé par le statut (table §2 du contrat
//    éditorial) et repasse par les contrôles déterministes R1/R2 avant
//    d'être rendu.
// =====================================================================

import { createHash } from 'node:crypto';
import {
  STATUTS,
  normEtab,
  ruleForbiddenContent,
  ruleChildCount,
  ruleTransitions,
  ruleClaims,
} from '../qa/lib/rules.mjs';

export const PRIMITIVE = 'etat-affaire';
export const PRIMITIVE_VERSION = '0.1.0';

export const RATTACHEMENTS = Object.freeze(['OK', 'DOUTEUX', 'NON_RATTACHABLE']);
export const FINALITES = Object.freeze(['definitive', 'non_definitive', 'inconnue']);
export const TRANSITIONS = Object.freeze(['progressive', 'regressive', 'issue_favorable', 'aucune']);

/** Avancement conventionnel — copie locale : `rules.mjs` ne l'exporte pas. */
const AVANCEMENT = {
  'à qualifier': 0,
  plainte: 1,
  enquête: 2,
  'mise en examen': 3,
  procès: 4,
  'condamnation non définitive': 5,
  'condamnation définitive': 6,
  'relaxe / non-lieu / classement': -1,
};

/** Table de formulation publique — contrat éditorial §2. */
const WORDING = {
  plainte: 'Une source publique rapporte qu’une plainte a été déposée.',
  'enquête': 'Une source publique rapporte qu’une enquête a été ouverte.',
  'mise en examen': 'Une source publique rapporte une mise en examen. La mise en examen ne vaut pas culpabilité.',
  'procès': 'Une source publique rapporte qu’un procès est en cours.',
  'condamnation non définitive':
    'Une source publique rapporte une condamnation non définitive, susceptible d’appel.',
  'condamnation définitive': 'Une source publique rapporte une condamnation définitive.',
  'relaxe / non-lieu / classement': 'Une source publique rapporte une relaxe.',
};

/** Mention obligatoire et non supprimable — contrat éditorial §2. */
// Une mention PAR état : « mise en examen » ne s'applique qu'à la mise en examen
// (une enquête ou une plainte n'impliquent aucune mise en examen). Mêmes
// formulations que web/src/lib/etat-wording.ts.
const MENTIONS = {
  'plainte': 'Le dépôt d’une plainte ne vaut pas culpabilité.',
  'enquête': 'L’ouverture d’une enquête ne préjuge pas de la culpabilité.',
  'mise en examen': 'La mise en examen ne vaut pas culpabilité.',
  'procès': 'La tenue d’un procès ne vaut pas culpabilité.',
};

export function libellePublic(statut) {
  const base = WORDING[statut];
  if (!base) return null;
  const mention = MENTIONS[statut];
  if (mention && !base.includes(mention)) return base + ' ' + mention;
  return base;
}

export const fingerprint = (txt) =>
  createHash('sha256').update(String(txt), 'utf8').digest('hex').slice(0, 16);

// ---------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------

const MOIS = {
  janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, 'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  'décembre': 12, decembre: 12,
};

const iso = (y, m, d) =>
  String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

/** Dates complètes (jour + mois + année) d'un fragment, dans l'ordre d'apparition. */
export function datesCompletes(txt) {
  const out = [];
  const s = String(txt || '');
  const reLettres = new RegExp(
    '\\b(\\d{1,2})\\s+(' + Object.keys(MOIS).join('|') + ')\\s+(\\d{4})\\b',
    'gi'
  );
  let m;
  while ((m = reLettres.exec(s))) {
    out.push({ index: m.index, date: iso(m[3], MOIS[m[2].toLowerCase()], m[1]) });
  }
  const reNum = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  while ((m = reNum.exec(s))) {
    out.push({ index: m.index, date: iso(m[3], m[2], m[1]) });
  }
  return out.sort((a, b) => a.index - b.index).map((x) => x.date);
}

/** Ligne d'en-tête d'un article de presse : porte la date de PUBLICATION. */
const RE_ENTETE_PUBLICATION = /^publi[ée]\s+le\b/i;

/**
 * Découpe le corps en phrases.
 *
 * Le découpage se fait d'abord par paragraphe, puis par ponctuation. C'est
 * indispensable : un titre et une ligne « Publié le … » ne se terminent pas
 * par un point. Fusionnés avec la première phrase du corps, ils y injectent
 * la date de publication, que l'extraction prendrait alors pour la date de
 * l'événement — le défaut exact relevé sur Titon (16/06 lu comme 17/06).
 *
 * La ligne d'en-tête est donc écartée de l'analyse des événements.
 */
const phrases = (txt) =>
  String(txt || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p && !RE_ENTETE_PUBLICATION.test(p))
    .flatMap((p) => p.split(/(?<=[.!?])\s+/))
    .map((p) => p.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------
// Marqueurs d'événement
// ---------------------------------------------------------------------

const MARQUEURS = [
  { type: 'relaxe', statut: 'relaxe / non-lieu / classement', re: /\ba\s+relax[ée]|relax[ée]\s+par\s+le\s+tribunal|prononc[ée]\s+(?:la\s+)?relaxe\b/i },
  // ⚠ `\b` est ASCII en JavaScript : après « é », il ne matche JAMAIS.
  // `/\bcondamn[ée]\b/` était donc toujours faux, et toute condamnation
  // écrite « le tribunal a condamné » passait inaperçue — le cas le plus
  // courant. Constaté sur l'article réel France 3 du 15/09/2026.
  // On ferme désormais par une frontière consciente de l'Unicode.
  // Le marqueur exigeait un auxiliaire (« a été condamné »). Or la presse
  // écrit massivement au participe attributif — « un enseignant condamné à
  // 24 mois », « le professeur condamné à trois ans » — et emploie le
  // verbe « écoper ». Mesuré sur le gold set de prose réelle : 62 titres
  // judiciaires sur 124, 21 seulement déclenchaient un marqueur.
  //
  // Les deux ajouts ci-dessous sont des CONSTRUCTIONS, pas des
  // formulations : le participe suivi de « à » + quantum, et le verbe
  // « écoper de ». Ils ne sont pas extensibles à l'infini sans devenir un
  // catalogue — et c'est précisément le test de la §13 du mandat.
  { type: 'condamnation', statut: 'condamnation non définitive', re: /\b(?:a|ont|est|sont)\s+(?:en\s+revanche\s+)?(?:été\s+)?condamn[ée]e?s?(?![\p{L}])|\bcondamn[ée]\s+le\s+pr[ée]venu(?![\p{L}])|\bcondamn[ée]e?s?\s+à\s+(?:une\s+peine\s+de\s+)?(?:\d|[a-zà-ÿ]+\s+(?:ans?|mois))|\b[ée]cop(?:e|er|é)\s+de\s+/iu },
  { type: 'mise_en_examen', statut: 'mise en examen', re: /\bmis\s+en\s+examen\b/i },
  { type: 'plainte', statut: 'plainte', re: /\bd[ée]pos[ée]\s+plainte\b|\bplainte\s+avec\s+constitution\b/i },
  { type: 'enquete', statut: 'enquête', re: /\bouvert\s+une\s+enqu[êe]te\b/i },
  { type: 'proces', statut: 'procès', re: /\bs’est\s+tenue?\b|\baudience\s+s’[ée]tait\s+tenue\b|\bjug[ée]\s+depuis\b|\bdoit\s+s’ouvrir\b|\bproc[èe]s\b/i },
];

/** Suite procédurale — ne décide jamais de publication, alimente la surveillance. */
const RE_APPEL = /\ba\s+fait\s+appel\b|\binterjet[ée]\s+appel\b|\bappel\s+du\s+parquet\b/i;
const RE_PAS_DE_RECOURS_CONNU =
  /n’ont\s+pas\s+indiqu[ée]|n’a\s+pas\s+indiqu[ée]|voie\s+de\s+recours/i;
const RE_DEFINITIF = /\bd[ée]sormais\s+d[ée]finiti|\bd[ée]cision\s+d[ée]finitive\b|\bd[ée]lai\s+d’appel\s+expir/i;

/** Hors périmètre : faits ne visant pas des mineurs. */
const RE_HORS_PERIMETRE =
  /\bcoll[èe]gues?\s+adultes?\b|\badultes?\b|\bne\s+concerne\s+pas\s+des\s+mineurs\b/i;

/** Événement annoncé comme à venir. */
const RE_FUTUR =
  /\bdoit\s+s’ouvrir\b|\best\s+attendue?\b|\bprogramm[ée]s?\b|\binscrit\s+au\s+r[ôo]le\b|\bà\s+une\s+date\s+qui\s+n’est\s+pas\s+encore\s+fix[ée]e\b/i;

// ---------------------------------------------------------------------
// Rattachement — CASE_IDENTITY ≠ ESTABLISHMENT_IDENTITY
// ---------------------------------------------------------------------

const ROLE_MOTS = (r) =>
  String(r || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 4);

/**
 * Une commune du corpus est-elle désignée par le texte ?
 *
 * Gère la forme « Paris 11e » ≡ « 11e arrondissement de Paris ». La ville ET
 * le numéro d'arrondissement doivent être présents : la ville seule ne suffit
 * pas, sans quoi tout article parisien se rattacherait à toute affaire
 * parisienne.
 */
/** Arrondissements en chiffres romains, tels que la presse les écrit. */
const ROMAINS = Object.freeze({
  1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii', 8: 'viii',
  9: 'ix', 10: 'x', 11: 'xi', 12: 'xii', 13: 'xiii', 14: 'xiv', 15: 'xv',
  16: 'xvi', 17: 'xvii', 18: 'xviii', 19: 'xix', 20: 'xx',
});

function communePresente(commune, txtNorm, norm) {
  const c = norm(commune);
  if (!c) return false;
  if (txtNorm.includes(c)) return true;

  const m = c.match(/^(paris|lyon|marseille)\s*(\d{1,2})\s*(?:er|e|eme|ème)?$/);
  if (!m) return false;
  const [, ville, num] = m;
  if (!txtNorm.includes(ville)) return false;

  // « 15e arrondissement »
  const reArr = new RegExp('\\b' + num + '\\s*(?:er|e|eme|ème)?\\s+arrondissement\\b');
  if (reArr.test(txtNorm)) return true;

  // « XVe arrondissement » — la presse française écrit l'arrondissement en
  // chiffres romains au moins aussi souvent qu'en chiffres arabes. Sans
  // cela, aucun article parisien ne rattache sa commune (constaté sur un
  // article réel de France 3 : « l'école Vigée-Lebrun dans le XVe
  // arrondissement »).
  const romain = ROMAINS[Number(num)];
  if (!romain) return false;
  const reRom = new RegExp('\\b' + romain + '\\s*(?:er|e|eme|ème)?\\s+arrondissement\\b');
  return reRom.test(txtNorm);
}

export function rattacher(fiche, corps) {
  const txt = String(corps || '');
  const norm = (s) =>
    String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const txtNorm = norm(txt);

  const signaux = [];
  const manquants = [];

  // Établissement : rapprochement par jetons normalisés (jamais une conclusion).
  const jetons = normEtab(fiche.etablissement).split(/\s+/).filter((j) => j.length > 3);
  const jetonsVus = jetons.filter((j) => txtNorm.includes(j));
  const etabOk = jetons.length > 0 && jetonsVus.length === jetons.length;
  if (etabOk) signaux.push('établissement: jetons « ' + jetonsVus.join(' ') + ' » présents');
  else manquants.push('établissement « ' + fiche.etablissement + ' » non retrouvé dans le corps');

  // Commune. La presse écrit « le 11e arrondissement de Paris » là où le
  // corpus écrit « Paris 11e » : on accepte les deux formes pour les villes
  // à arrondissements, sans quoi aucun article parisien ne se rattache.
  const communeOk = communePresente(fiche.commune, txtNorm, norm);
  if (communeOk) signaux.push('commune: « ' + fiche.commune + ' » présente');
  else manquants.push('commune « ' + fiche.commune + ' » non retrouvée');

  // Rôle.
  const motsRole = ROLE_MOTS(fiche.role_mis_en_cause);
  const roleOk = motsRole.length > 0 && motsRole.every((w) => txtNorm.includes(w));
  if (roleOk) signaux.push('rôle: « ' + fiche.role_mis_en_cause + ' » présent');
  else manquants.push('rôle « ' + fiche.role_mis_en_cause + ' » non retrouvé');

  let rattachement;
  if (!etabOk) {
    // Sans l'établissement, aucun rattachement : commune + rôle décrivent
    // des dizaines d'affaires du même dossier. C'est précisément le piège
    // que l'invariant n°2 interdit de franchir.
    rattachement = 'NON_RATTACHABLE';
  } else if (communeOk && roleOk) {
    rattachement = 'OK';
  } else {
    rattachement = 'DOUTEUX';
  }

  return { rattachement, signaux, manquants };
}

// ---------------------------------------------------------------------
// Extraction déterministe (moteur `rules`)
// ---------------------------------------------------------------------

function extraireEvenements(corps, sourceDate) {
  const evs = [];
  for (const ph of phrases(corps)) {
    const ds = datesCompletes(ph);
    for (const mk of MARQUEURS) {
      if (!mk.re.test(ph)) continue;
      const horsPerimetre = RE_HORS_PERIMETRE.test(ph);
      const isFuture = RE_FUTUR.test(ph);
      evs.push({
        event_type: mk.type,
        event_date: ds[0] || null,
        statut_apres: horsPerimetre || isFuture ? null : mk.statut,
        hors_perimetre: horsPerimetre,
        is_future: isFuture,
        quote: ph,
        source_date: sourceDate,
      });
      break; // une phrase porte au plus un événement
    }
  }

  // Un même événement peut être énoncé deux fois : une fois dans un titre
  // sans date, une fois dans le corps avec sa date. L'occurrence datée fait
  // foi — sinon un titre ferait perdre la date de l'événement.
  const datesParType = new Set(evs.filter((e) => e.event_date).map((e) => e.event_type));
  return evs.filter((e) => e.event_date || !datesParType.has(e.event_type));
}

/** Types d'événement qui closent (au moins partiellement) une procédure. */
const TYPES_ISSUE = ['relaxe', 'condamnation'];

/**
 * Suite procédurale. `aUneIssue` est décisif : sans décision rendue, la
 * question « est-ce définitif ? » n'a pas d'objet, et signaler une finalité
 * inconnue ne serait qu'un bruit qui escaladerait des articles sans enjeu.
 */
function extraireSuiteProcedurale(corps, aUneIssue) {
  const surveillance = [];
  const inconnues = [];
  let finalite = aUneIssue ? 'inconnue' : null;

  if (!aUneIssue) return { finalite, surveillance, inconnues };

  const ph = phrases(corps);
  const appel = ph.find((p) => RE_APPEL.test(p));
  if (appel) {
    finalite = 'non_definitive';
    surveillance.push({
      code: 'APPEL_EN_COURS',
      motif: 'Une voie de recours a été exercée : la décision n’est pas définitive.',
      quote: appel,
    });
  } else {
    const def = ph.find((p) => RE_DEFINITIF.test(p));
    if (def) {
      finalite = 'definitive';
    } else {
      const muet = ph.find((p) => RE_PAS_DE_RECOURS_CONNU.test(p));
      inconnues.push({
        code: 'FINALITE_INCONNUE',
        motif:
          'L’article n’énonce pas si la décision est définitive : ni délai de recours expiré, ni recours exercé.',
        quote: muet || null,
        debloque_par: 'vérification du délai d’appel ou publication ultérieure',
      });
    }
  }
  return { finalite, surveillance, inconnues };
}

// ---------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------

/**
 * @param {object}   o
 * @param {object}   o.fiche    fiche minimale (≈12 champs)
 * @param {object}   o.article  { article_id, media, publication_date, body, registry_fingerprint? }
 * @param {Date}     [o.today]
 * @param {string}   [o.engine] 'rules' (déterministe local) | 'llm'
 * @param {Function} [o.llm]    async ({system,user}) => texte JSON — requis si engine==='llm'
 */
export async function etatAffaire({ fiche, article, today = new Date(), engine = 'rules', llm = null }) {
  const t0 = Date.now();
  const corps = String(article.body || '');
  const instrumentation = {
    primitive: PRIMITIVE,
    version: PRIMITIVE_VERSION,
    engine,
    model: null,
    llm_calls: 0,
    input_chars: 0,
    output_chars: 0,
    input_tokens: 'not_measured',
    output_tokens: 'not_measured',
    duration_ms: null,
  };

  const ficheMin = {
    case_id: fiche.case_id,
    etablissement: fiche.etablissement,
    commune: fiche.commune,
    role_mis_en_cause: fiche.role_mis_en_cause,
    statut_judiciaire: fiche.statut_judiciaire,
    type_affaire: fiche.type_affaire,
    enfants_concernes_public: fiche.enfants_concernes_public,
    date_dernier_etat: derniereDateConnue(fiche),
    sources: (fiche.sources || []).map((s) => ({
      media: s.media,
      date: dateISO(s.publication_date || s.date),
    })),
  };
  instrumentation.input_chars = JSON.stringify(ficheMin).length + corps.length;

  const fpCorps = fingerprint(corps);
  const base = {
    primitive: PRIMITIVE,
    version: PRIMITIVE_VERSION,
    case_id: fiche.case_id,
    article_id: article.article_id,
    content_fingerprint: fpCorps,
    registry_fingerprint: article.registry_fingerprint || null,
    fingerprint_divergent: article.registry_fingerprint
      ? article.registry_fingerprint !== fpCorps
      : null,
    SOURCE: {
      article_id: article.article_id,
      media: article.media,
      url: article.url || null,
      url_exposante: article.url_exposante === true,
    },
    SOURCE_DATE: article.publication_date || null,
  };

  // --- 1. rattachement ------------------------------------------------
  const rat = rattacher(ficheMin, corps);
  if (rat.rattachement === 'NON_RATTACHABLE') {
    instrumentation.duration_ms = Date.now() - t0;
    const out = {
      ...base,
      rattachement: rat.rattachement,
      rattachement_signaux: rat.signaux,
      rattachement_manquants: rat.manquants,
      CURRENT_STATE: etatCourant(ficheMin),
      NEW_EVIDENCE: null,
      PROPOSED_CHANGE: 'NO_CHANGE',
      RATIONALE:
        'L’article ne peut pas être rattaché à cette affaire : ' +
        rat.manquants.join(' ; ') +
        '. Un rapprochement d’établissement, seul, ne vaut pas identité d’affaire.',
      EVENT_DATE: null,
      statut_propose: null,
      transition: 'aucune',
      finalite: null,
      surveillance: [],
      inconnues: [],
      claims: [],
      controles: [],
      REQUIRES_HUMAN_REVIEW: false,
      review_reasons: [],
      confiance: 'haute',
      instrumentation,
    };
    instrumentation.output_chars = JSON.stringify(out).length;
    return out;
  }

  // --- 2..6. extraction ------------------------------------------------
  let events;
  let suite;
  if (engine === 'llm') {
    if (typeof llm !== 'function') throw new Error('engine=llm requiert un appelant `llm`');
    const r = await appelLLM({ llm, ficheMin, article, corps, instrumentation });
    events = r.events;
    suite = r.suite;
  } else {
    events = extraireEvenements(corps, article.publication_date || null);
    const aUneIssue = events.some((e) => TYPES_ISSUE.includes(e.event_type) && !e.is_future);
    suite = extraireSuiteProcedurale(corps, aUneIssue);
  }

  // --- 4. statut proposé, énum fermée, forward-only sauf issue favorable
  const dateEtatCourant = ficheMin.date_dernier_etat;

  const porteurs = events.filter((e) => e.statut_apres && !e.is_future && !e.hors_perimetre);
  const dateDe = (e) => e.event_date || e.source_date || '';
  // À date égale, l'ordre du texte n'est PAS l'ordre de la procédure : un
  // article annonçant une condamnation rappelle presque toujours le procès
  // ensuite. Trier sur le seul texte retenait « procès » et perdait la
  // condamnation (constaté sur l'article France 3 du 15/09/2026). On
  // départage donc par avancement procédural ; une issue favorable (-1)
  // prime, c'est le fait le plus fort que l'article puisse rapporter.
  const rang = (e) => (AVANCEMENT[e.statut_apres] === -1 ? 99 : AVANCEMENT[e.statut_apres] ?? 0);
  porteurs.sort((a, b) => {
    const d = String(dateDe(a)).localeCompare(String(dateDe(b)));
    return d !== 0 ? d : rang(a) - rang(b);
  });
  const dernier = porteurs.length ? porteurs[porteurs.length - 1] : null;

  const statutCourant = ficheMin.statut_judiciaire;
  let statutPropose = null;
  let transition = 'aucune';
  const motifsNoChange = [];
  const inconnuesAsymetrie = [];

  if (!dernier) {
    motifsNoChange.push(
      events.length
        ? 'aucun événement porteur d’un état nouveau : ' + resume(events)
        : 'aucun événement daté porteur d’un changement d’état'
    );
  } else if (dernier.statut_apres === statutCourant) {
    motifsNoChange.push(
      'l’état énoncé par l’article (« ' + dernier.statut_apres + ' ») est déjà celui de la fiche'
    );
  } else {
    const av = AVANCEMENT[statutCourant];
    const ap = AVANCEMENT[dernier.statut_apres];
    const issueFavorable = ap === -1;
    const datePub = dateISO(article.publication_date);
    const anterieur = dateEtatCourant && datePub && datePub < dateEtatCourant;
    const courantEstFavorable = av === -1;

    if (!issueFavorable && anterieur) {
      // Antériorité : un article publié AVANT l'état courant ne le change pas,
      // dans aucune direction. La version précédente ne bloquait que les
      // régressions ; un article de calendrier antérieur pouvait donc ramener
      // une affaire relaxée au statut « procès », en la qualifiant de
      // « progression ».
      motifsNoChange.push(
        'article du ' + datePub + ' antérieur à l’état courant du ' +
          dateEtatCourant + ' : un article plus ancien ne change pas un état plus récent'
      );
    } else if (!issueFavorable && courantEstFavorable) {
      // Priorité asymétrique (contrat éditorial §3) : une issue favorable déjà
      // acquise ne se défait pas sur un article qui rouvre l'accusation. Seule
      // une décision judiciaire postérieure le peut, et elle passe par
      // l'humain — jamais par une proposition automatique.
      motifsNoChange.push(
        'l’affaire est en « ' + statutCourant + ' » : revenir à « ' +
          dernier.statut_apres + ' » demande une décision judiciaire postérieure, ' +
          'pas la relecture d’un article'
      );
      inconnuesAsymetrie.push({
        code: 'RETOUR_ACCUSATION_REFUSE',
        motif:
          'L’article propose de requalifier une affaire déjà close en faveur de la ' +
          'personne mise en cause. La primitive s’y refuse ; seule une décision ' +
          'judiciaire postérieure, vérifiée par un humain, peut rouvrir cet état.',
        quote: dernier.quote,
        debloque_par: 'source judiciaire postérieure à ' + (dateEtatCourant || 'l’état courant'),
      });
    } else {
      statutPropose = dernier.statut_apres;
      transition = issueFavorable ? 'issue_favorable' : ap > av ? 'progressive' : 'regressive';
    }
  }

  // --- 5/6. surveillance et inconnues ---------------------------------
  const surveillance = [...suite.surveillance];
  const inconnues = [...suite.inconnues, ...inconnuesAsymetrie];
  const finalite = dernier ? suite.finalite : null;

  const horsPerimetre = events.filter((e) => e.hors_perimetre);
  if (horsPerimetre.length && porteurs.length) {
    surveillance.push({
      code: 'ISSUES_MULTIPLES',
      motif:
        'La même procédure porte plusieurs issues, dont au moins une hors périmètre du projet ' +
        '(faits ne visant pas des mineurs). Un statut unique ne peut pas les représenter.',
      quote: horsPerimetre[0].quote,
    });
  }

  // --- 7. libellé public imposé ---------------------------------------
  const statutAffiche = statutPropose || statutCourant;
  const libelle = libellePublic(statutAffiche);

  // --- claims sourcées -------------------------------------------------
  const claims = porteurs.concat(horsPerimetre).map((e) => ({
    claim_text:
      e.event_type +
      (e.event_date ? ' le ' + e.event_date : '') +
      (e.hors_perimetre ? ' (hors périmètre : faits ne visant pas des mineurs)' : ''),
    justifying_quote: e.quote,
    sensitivity: 'sensible',
    source_id: article.article_id,
  }));

  // --- 8. contrôles déterministes AVANT sortie -------------------------
  const ficheSimulee = {
    case_id: fiche.case_id,
    statut_judiciaire: statutAffiche,
    enfants_concernes_public: ficheMin.enfants_concernes_public,
    resume_public: libelle,
    libelle_public: libelle,
    events: [
      ...(fiche.events || []),
      ...porteurs.map((e) => ({
        event_date: e.event_date,
        event_type: e.event_type,
        statut_apres: e.statut_apres,
        libelle_public: libellePublic(e.statut_apres),
        is_future: false,
        source_id: article.article_id,
      })),
    ],
    claims,
  };
  const controles = [
    ...ruleForbiddenContent(ficheSimulee),
    ...ruleChildCount(ficheSimulee),
    ...ruleTransitions(ficheSimulee),
    ...ruleClaims(ficheSimulee),
  ];
  const bloquants = controles.filter((c) => c.severity === 'bloquant');

  // --- décision humaine requise ---------------------------------------
  const review_reasons = [];
  if (transition === 'issue_favorable')
    review_reasons.push('issue favorable — revue humaine obligatoire (contrat éditorial §3)');
  if (transition === 'regressive')
    review_reasons.push('transition régressive — revue humaine obligatoire (contrat éditorial §3)');
  if (rat.rattachement === 'DOUTEUX')
    review_reasons.push('rattachement douteux — l’humain confirme que l’article vise bien cette affaire');
  if (surveillance.some((s) => s.code === 'ISSUES_MULTIPLES'))
    review_reasons.push('issues multiples dans une même procédure — arbitrage de périmètre requis');
  if (bloquants.length)
    review_reasons.push('contrôle déterministe bloquant : ' + bloquants.map((b) => b.rule).join(', '));
  if (statutPropose === 'relaxe / non-lieu / classement')
    review_reasons.push(
      'relaxe proposée — la conséquence d’affichage est une décision éditoriale, hors de cette primitive'
    );

  const PROPOSED_CHANGE = statutPropose
    ? {
        champ: 'statut_judiciaire',
        de: statutCourant,
        vers: statutPropose,
        libelle_public: libelle,
        finalite,
        event_date: dernier.event_date || null,
      }
    : 'NO_CHANGE';

  const RATIONALE = statutPropose
    ? 'L’article du ' + article.publication_date + ' (' + article.media + ') énonce « ' +
      dernier.event_type + ' » daté du ' + (dernier.event_date || 'sans date exploitable') +
      '. Transition ' + transition + ' depuis « ' + statutCourant + ' ». Finalité : ' + finalite + '.'
    : 'NO_CHANGE — ' + motifsNoChange.join(' ; ') + '.';

  instrumentation.duration_ms = Date.now() - t0;
  const out = {
    ...base,
    rattachement: rat.rattachement,
    rattachement_signaux: rat.signaux,
    rattachement_manquants: rat.manquants,
    CURRENT_STATE: etatCourant(ficheMin),
    NEW_EVIDENCE: {
      article_id: article.article_id,
      media: article.media,
      publication_date: article.publication_date || null,
      events: events.map((e) => ({
        event_type: e.event_type,
        event_date: e.event_date,
        statut_apres: e.statut_apres,
        is_future: e.is_future,
        hors_perimetre: e.hors_perimetre,
        quote: e.quote,
      })),
    },
    PROPOSED_CHANGE,
    RATIONALE,
    EVENT_DATE: dernier ? dernier.event_date : null,
    statut_propose: statutPropose,
    transition,
    finalite,
    surveillance,
    inconnues,
    claims,
    controles,
    REQUIRES_HUMAN_REVIEW: review_reasons.length > 0,
    review_reasons,
    confiance: rat.rattachement === 'OK' ? (bloquants.length ? 'moyenne' : 'haute') : 'moyenne',
    instrumentation,
  };
  instrumentation.output_chars = JSON.stringify(out).length;
  return out;
}

// ---------------------------------------------------------------------

/**
 * Normalise une date en `YYYY-MM-DD`.
 *
 * Indispensable : selon le transport, une colonne `date` arrive en objet Date
 * (driver `pg`) ou en chaîne ISO (driver HTTP Neon). Trier des objets Date
 * comme des chaînes donne un ordre alphabétique sur « Fri Feb 06 2026 », donc
 * un « dernier état connu » faux — et la règle d'antériorité cesse alors de
 * protéger quoi que ce soit.
 */
export function dateISO(v) {
  if (!v) return null;
  // ⚠ Composantes LOCALES, jamais `toISOString()`. Le driver `pg` parse une
  // colonne `date` en minuit heure locale : en UTC+2, `toISOString()` recule
  // alors d'un jour et une relaxe du 16/06 se relit « 15/06 ». C'est
  // précisément l'erreur d'un jour que cette primitive existe pour éviter.
  const local = (d) =>
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0');

  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : local(v);
  const s = String(v).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : local(d);
}

/**
 * Date de l'état courant de la fiche.
 *
 * `fiche.date_dernier_etat` fait foi quand l'appelant la fournit : elle vient
 * alors du dernier événement consigné, qui date l'état bien mieux que la
 * publication d'une source. À défaut, on retombe sur la source la plus
 * récente.
 */
function derniereDateConnue(fiche) {
  const explicite = dateISO(fiche.date_dernier_etat);
  if (explicite) return explicite;
  const d = (fiche.sources || [])
    .map((s) => dateISO(s.publication_date || s.date))
    .filter(Boolean)
    .sort();
  return d.length ? d[d.length - 1] : null;
}

function etatCourant(ficheMin) {
  return {
    case_id: ficheMin.case_id,
    etablissement: ficheMin.etablissement,
    commune: ficheMin.commune,
    role_mis_en_cause: ficheMin.role_mis_en_cause,
    statut_judiciaire: ficheMin.statut_judiciaire,
    date_dernier_etat: ficheMin.date_dernier_etat,
    sources: ficheMin.sources,
  };
}

const resume = (events) =>
  events
    .map(
      (e) =>
        e.event_type +
        (e.is_future ? ' (annoncé à venir)' : '') +
        (e.hors_perimetre ? ' (hors périmètre)' : '')
    )
    .join(', ');

/** Moteur LLM — même contrat de sortie, instrumenté. */
async function appelLLM({ llm, ficheMin, article, corps, instrumentation }) {
  const system = [
    'Tu extrais des faits judiciaires datés d’un article de presse français.',
    'Tu ne décides JAMAIS de ce qui est publié ou retiré.',
    'Statuts autorisés, énumération fermée : ' + STATUTS.join(' | ') + '.',
    'Tout événement doit porter un passage justificatif copié mot pour mot de l’article.',
    'Sépare la date de l’événement de la date de publication.',
    'Marque hors_perimetre=true pour des faits ne visant pas des mineurs.',
    'Marque is_future=true pour une échéance annoncée et non encore survenue.',
    'Réponds en JSON strict : {"events":[{"event_type","event_date","statut_apres","is_future","hors_perimetre","quote"}],',
    '"suite":{"finalite":"definitive|non_definitive|inconnue","surveillance":[{"code","motif","quote"}],"inconnues":[{"code","motif","quote","debloque_par"}]}}',
  ].join('\n');
  const user = [
    'FICHE: ' + JSON.stringify(ficheMin),
    'ARTICLE: ' + article.media + ', publié le ' + article.publication_date,
    '---',
    corps,
  ].join('\n');

  instrumentation.llm_calls += 1;
  const res = await llm({ system, user });
  if (res && typeof res === 'object' && res.usage) {
    instrumentation.input_tokens = res.usage.input_tokens ?? 'not_measured';
    instrumentation.output_tokens = res.usage.output_tokens ?? 'not_measured';
    instrumentation.model = res.model ?? null;
  }
  const texte = typeof res === 'string' ? res : res.text;
  const parsed = JSON.parse(texte);
  return {
    events: (parsed.events || []).map((e) => ({ ...e, source_date: article.publication_date })),
    suite: parsed.suite || { finalite: 'inconnue', surveillance: [], inconnues: [] },
  };
}
