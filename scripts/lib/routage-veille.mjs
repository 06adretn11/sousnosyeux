// =====================================================================
// scripts/lib/routage-veille.mjs
//
// ROUTAGE PRUDENT des résultats de veille, puis regroupement en CLAIMS.
//
//   Le titre sert à décider où regarder.
//   La source sert à décider ce qui est vrai.
//
// Ce module ne lit QUE des métadonnées (titre, date de publication, média,
// domaine). Il ne produit jamais un fait, un état, une date d'événement
// ni une finalité. Sa seule sortie est une DIRECTION :
//
//   POTENTIAL_UPDATE                    un acte plausiblement nouveau est annoncé
//   CONTEXT_ONLY                        synthèse / politique publique / hors sujet
//   WRONG_SCOPE_CERTAIN                 l'objet du titre est ailleurs, explicitement
//   HISTORICAL_OR_ALREADY_KNOWN_CERTAIN antérieur à l'état connu, sans rien d'avancé
//   UNCERTAIN                           on ne sait pas — CONTINUE comme POTENTIAL_UPDATE
//
// Règle de conception : optimiser la PRÉCISION des exclusions, pas leur
// volume. Chaque exclusion exige des indices convergents ; au moindre
// doute le résultat continue. Les exclusions ne sont JAMAIS mémorisées
// (elles se recalculent, gratuitement, à chaque cycle) : une décision de
// routage fondée sur un titre ne doit pas devenir irrévocable.
//
// Ce n'est pas une ontologie judiciaire. Les « actes » ci-dessous servent
// uniquement à empêcher les confusions déjà observées :
//   RÉQUISITION ≠ VERDICT · AUDIENCE ≠ VERDICT
//   DEMANDE DE REMISE EN LIBERTÉ ≠ REMISE EN LIBERTÉ
//   COUR D'APPEL (juridiction) ≠ APPEL FORMÉ
// =====================================================================

export const ROUTAGE_VERSION = 'routage-veille-0.2.0';

export const ROUTES = Object.freeze([
  'POTENTIAL_UPDATE', 'CONTEXT_ONLY', 'WRONG_SCOPE_CERTAIN',
  'HISTORICAL_OR_ALREADY_KNOWN_CERTAIN', 'UNCERTAIN',
]);

import { STRUCTURES, FAITS, MINEURS } from './capteurs.mjs';

// ---------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------
export const aplat = (s) => String(s || '')
  .replace(/&amp;/g, '&')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’‘`]/g, "'");

/** Texte de comparaison : sans accent, ponctuation → espace. */
export const mots = (s) => ' ' + aplat(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

/** Retire le suffixe « - Média » ajouté par Google News. */
export const titreSansMedia = (t) => String(t || '')
  .replace(/&amp;/g, '&').replace(/\s+-\s+[^-]{2,50}$/, '').trim();

// ---------------------------------------------------------------------
// ACTES — lus dans le TITRE (routage) ou dans une CITATION (vérification
// de suffisance, après lecture de la source). Ordre = priorité du primaire.
// « stage » : avancement maximal que l'acte peut représenter.
// ---------------------------------------------------------------------
const ACTES = [
  // Un appel FORMÉ : acte d'interjection, jamais la seule juridiction.
  ['APPEL_FORME', 6,
    /\b(?:fai\w*|font|fera|feront|ont fait|a fait|interjet\w*)\s+(?:un\s+)?appel\b(?!\s+(?:a|aux|au)\s)|\bappel\s+(?:de|du|contre)\s+(?:la|le|cette)\s+(?:relaxe|condamnation|decision|jugement|peine)|\bse\s+pourvoi\w*/],
  ['VERDICT_RELAXE', 5, /\b(?:relax\w*|acquitt\w*|non-lieu|classe sans suite|classement sans suite)\b/],
  ['VERDICT_CONDAMNATION', 5, /\b(?:condamn\w*|ecop\w*|reclusion criminelle)\b/],
  // Deux actes distincts : la demande n'est pas la mesure.
  ['DEMANDE_LIBERTE', 3, /\bdemand\w*\s+(?:sa\s+|une\s+|de\s+|la\s+)?(?:remise en liberte|mise en liberte|liberation)\b/],
  ['REMISE_LIBERTE', 3, /\b(?:remise en liberte|remis(?:e|es)? en liberte|remettre en liberte|liberee?s?)\b/],
  ['REQUISITION', 4, /\b(?:requis|requise|requises|requiert|requisitions?|requisitoire|reclam\w+\s+\d+)\b/],
  ['DELIBERE', 4, /\b(?:delibere|rend sa decision|decision attendue|verdict attendu)\b/],
  ['RENVOI', 4, /\brenvoy\w*\s+(?:devant|au tribunal|en correctionnelle|aux assises)|\brenvoi\s+devant\b/],
  ['AUDIENCE', 4, /\b(?:proces|comparait|comparution|audience|juge(?:e|es|s)?\b(?:\s+pour|\s+a|\s+ce|\s+mardi|\s+lundi)|s'ouvre)\b/],
  ['MISE_EN_EXAMEN', 3, /\bmis(?:e|es)?\s+en\s+examen\b|\bmise\s+en\s+examen\b/],
  ['ECROU', 3, /\becroue?s?\b|\bdetention provisoire\b|\bplaces? en detention\b|\bmandat de depot\b/],
  ['INTERPELLATION', 2, /\bgarde a vue\b|\binterpell\w*|\bdeferre?s?\b/],
  ['SUSPENSION', 2, /\bsuspendu\w*|\bsuspension\b|\becarte\w*|\blicenci\w*/],
  ['PLAINTE', 1, /\bplaintes?\b/],
  // Vocabulaire de la phase initiale : « soupçonné », « accusé », « visé par ».
  ['SOUPCON', 1, /\bsoupconn\w*|\bsuspect\w*|\baccus\w*|\bvise(?:e|es|s)? par\b/],
  ['ENQUETE', 2, /\benquete\b|\binformation judiciaire\b|\bjuge d'instruction\b/],
  // Juridiction seule : n'établit PAS un appel. Stage inconnu → ne jamais exclure.
  ['COUR_APPEL', null, /\bcour d'appel\b|\ben appel\b/],
  // « 3 ans de prison » sans « condamné » ni « requis » : verdict OU réquisitions.
  ['PEINE_NON_QUALIFIEE', null, /\b\d+\s+(?:ans?|mois)\s+de\s+prison\b|\bprison\s+(?:ferme|avec sursis)\b|\bans?\s+ferme\b/],
];
export const STAGE_ACTE = Object.fromEntries(ACTES.map(([a, s]) => [a, s]));

/**
 * Actes énoncés dans un texte, du plus prioritaire au moins.
 * Un verdict dans le texte l'emporte sur une réquisition qui y est rappelée
 * (« relaxé alors que le parquet avait requis »).
 */
export function actes(texte) {
  const t = aplat(texte);
  // demande ≠ mesure : « demande sa remise en liberté » n'est pas une remise en liberté. On retire les
  // DEMANDES avant de chercher la MESURE, au lieu de supprimer la mesure dès qu'une demande est citée :
  // un corps qui rappelle la demande ET rapporte la mesure (Vic-la-Gardiole : « accepté de remettre en
  // liberté ») énonce bien les deux.
  const sansDemande = t.replace(/\bdemand\w*\s+(?:sa\s+|une\s+|de\s+|la\s+)?(?:remise en liberte|mise en liberte|liberation)\b/g, ' ');
  const trouves = ACTES.filter(([a, , re]) => re.test(a === 'REMISE_LIBERTE' ? sansDemande : t)).map(([a]) => a);
  const set = new Set(trouves);
  // La peine chiffrée n'est qualifiée que par le verbe qui l'accompagne.
  if (set.has('REQUISITION') || set.has('VERDICT_CONDAMNATION') || set.has('VERDICT_RELAXE')) set.delete('PEINE_NON_QUALIFIEE');
  // Réquisitions rappelées dans un titre de verdict : le verdict est l'information.
  if (set.has('REQUISITION') && (set.has('VERDICT_CONDAMNATION') || set.has('VERDICT_RELAXE'))) set.delete('REQUISITION');
  // RENVOI est plus précis qu'AUDIENCE.
  if (set.has('RENVOI')) set.delete('AUDIENCE');
  return ACTES.map(([a]) => a).filter((a) => set.has(a));
}

/** Acte principal : le premier de la liste de priorité, sinon null. */
export const acteprimaire = (liste) => (liste.length ? liste[0] : null);

// ---------------------------------------------------------------------
// État courant → avancement (comparaison de stade UNIQUEMENT)
// ---------------------------------------------------------------------
export const STADE_ETAT = {
  'à qualifier': 0, plainte: 1, 'enquête': 2, 'mise en examen': 3, 'procès': 4,
  'condamnation non définitive': 5, 'relaxe / non-lieu / classement': 5,
  'condamnation définitive': 6,
};

/** Un état cible plus en arrière que l'état courant. Relaxe et condamnation : même rang. */
export function estRegression(courant, cible) {
  const a = STADE_ETAT[courant], b = STADE_ETAT[cible];
  return a !== undefined && b !== undefined && b < a;
}

// ---------------------------------------------------------------------
// Boosters de recherche par état courant — JAMAIS une liste fermée :
// la veille exécute toujours, en plus, la requête ouverte.
// ---------------------------------------------------------------------
export const BOOSTERS = {
  plainte: ['enquête', 'garde à vue', 'mis en examen', 'classement sans suite', 'interpellé'],
  'enquête': ['mis en examen', 'garde à vue', 'renvoyé', 'procès', 'non-lieu', 'classement sans suite'],
  'mise en examen': ['non-lieu', 'renvoyé', 'procès', 'tribunal correctionnel', 'cour d\'assises', 'remise en liberté', 'contrôle judiciaire'],
  'procès': ['condamné', 'relaxé', 'délibéré', 'verdict', 'jugement', 'requis', 'appel'],
  'condamnation non définitive': ['appel', 'fait appel', 'cour d\'appel', 'cassation', 'condamnation confirmée', 'définitive'],
  'relaxe / non-lieu / classement': ['appel', 'fait appel', 'parquet', 'cour d\'appel', 'cassation', 'nouvelle plainte', 'réouverture'],
  'condamnation définitive': ['incarcéré', 'libéré', 'FIJAIS', 'détention'],
  'à qualifier': ['enquête', 'plainte', 'mis en examen', 'condamné', 'procès'],
};

// ---------------------------------------------------------------------
// Contexte de routage (construit une fois par cycle)
// ---------------------------------------------------------------------
const GENERIQUES = new Set(['ecole', 'maternelle', 'elementaire', 'primaire', 'college', 'lycee', 'creche',
  'institution', 'centre', 'loisirs', 'groupe', 'scolaire', 'prive', 'publique', 'public',
  'de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'sur', 'aux', 'au', 'multi', 'accueil', 'micro',
  'halte', 'garderie', 'jardin', 'enfants', 'notre', 'dame', 'sacre', 'coeur']);
const STOP_LOCALITES = new Set(['plaisir', 'rue', 'ham', 'albert', 'lens', 'nord', 'somme', 'gap', 'pau', 'vie',
  'sens', 'mars', 'saint', 'chauny', 'roye', 'creil', 'laon', 'melun', 'dax']);

/** Racine de commune : « Paris 11e » → « paris ». */
export const racineCommune = (c) => aplat(c).replace(/\s*\d+\s*(?:er|e|eme)?\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Jetons distinctifs d'un nom d'établissement. */
export function jetonsEtab(nom, { saint = false } = {}) {
  // « saint » ne désigne rien seul (Saint-Valery ≠ Saint-Dominique) : gardé pour
  // les PHRASES distinctives, écarté des jetons isolés.
  return aplat(nom).split(/[^a-z0-9]+/)
    .filter((j) => j.length >= 4 && !GENERIQUES.has(j) && (saint || !/^sainte?$/.test(j)));
}

/** Grandes villes ajoutées au gazetteer — jamais la seule source de « ailleurs ». */
const VILLES = ['paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'montpellier', 'strasbourg', 'bordeaux',
  'lille', 'rennes', 'reims', 'toulon', 'grenoble', 'dijon', 'angers', 'nimes', 'villeurbanne', 'clermont-ferrand',
  'le mans', 'aix-en-provence', 'brest', 'tours', 'amiens', 'limoges', 'perpignan', 'metz', 'besancon', 'orleans',
  'rouen', 'mulhouse', 'caen', 'nancy', 'avignon', 'poitiers', 'versailles', 'cannes', 'ajaccio', 'bayonne',
  'saint-denis', 'saint-etienne', 'nanterre', 'creteil', 'bobigny', 'evry', 'pontoise', 'la rochelle', 'valence'];

/**
 * @param {object} p
 * @param {Array}  p.fiches            toutes les affaires (case_id, etablissement, commune)
 * @param {Array}  p.etablissements    lignes de case_establishments
 * @param {Map}    p.derniereSource    case_id → 'YYYY-MM-DD' (source la plus récente connue)
 * @param {Array}  p.evenements        lignes de case_events
 */
export function construireContexte({ fiches, etablissements = [], derniereSource = new Map(), evenements = [] }) {
  const propres = new Map();
  const ajouter = (case_id, nom, commune) => {
    if (!propres.has(case_id)) propres.set(case_id, { phrases: new Set(), jetons: new Set(), communes: new Set() });
    const p = propres.get(case_id);
    const j = jetonsEtab(nom);
    const ph = jetonsEtab(nom, { saint: true });
    if (ph.length) p.phrases.add(' ' + ph.join(' ') + ' ');
    j.forEach((x) => p.jetons.add(x));
    if (commune) p.communes.add(racineCommune(commune));
  };
  for (const f of fiches) ajouter(f.case_id, f.etablissement, f.commune);
  for (const e of etablissements) ajouter(e.case_id, e.etablissement, e.commune);

  const gazetteer = new Set(VILLES.map((v) => v.replace(/-/g, " ")));
  for (const f of fiches) { const r = racineCommune(f.commune); if (r.length >= 5) gazetteer.add(r); }
  STOP_LOCALITES.forEach((s) => gazetteer.delete(s));

  // Tous les établissements connus (phrase distinctive → cases concernés).
  const etabs = new Map();
  for (const [case_id, p] of propres) {
    for (const ph of p.phrases) {
      if (ph.trim().length < 5) continue;
      if (!etabs.has(ph)) etabs.set(ph, new Set());
      etabs.get(ph).add(case_id);
    }
  }
  // La chronologie connue inclut les événements VALIDÉS, pas seulement les sources citées :
  // un verdict validé le 10/07 date l'état même si aucune source n'est datée de ce jour.
  const derniere = new Map(derniereSource);
  for (const e of evenements) {
    if (!e.event_date) continue;
    const d = String(e.event_date).slice(0, 10);
    if (!derniere.get(e.case_id) || d > derniere.get(e.case_id)) derniere.set(e.case_id, d);
  }
  return { propres, gazetteer, etabs, derniereSource: derniere, evenements };
}

// ---------------------------------------------------------------------
// Lexiques de contexte
// ---------------------------------------------------------------------
// Synthèses, politiques publiques, dossiers thématiques : ne portent pas
// UN fait sur UNE affaire. Exclusion posée seulement si le titre ne nomme
// aucun élément propre à l'affaire.
const RE_CONTEXTE = /\b(?:plan d'action|que contient|campagne municipale|ou en est[- ]on|on fait le point|toutes les enquetes|que revele|scandale du periscolaire|cinq proces|procedures? programmee?s?|proces deja programmes|informations judiciaires|la crise enflamme|tourne? dans les ecoles|restaurer la confiance|temoignages? -)/;
// Hors sujet judiciaire : sujet positivement identifié comme autre chose.
const RE_HORS_SUJET = /\b(?:pollution|mercure|amiante|travaux|incendie|greve|carte scolaire|menu|kermesse|fermeture de classe|rentree scolaire)\b/;
// Une juridiction ou une institution qui précède une localité : la localité
// n'est PAS l'endroit des faits (« cour d'appel de Montpellier »).
const RE_INSTITUTION_AVANT = /(?:cour d'appel|cour d'assises|tribunal(?: judiciaire| correctionnel| administratif)?|parquet|procureur(?:e)?|juge(?:s)?|rectorat|academie|prefecture|conseil|mairie|ville|barreau|avocat(?:e)?s?)\s+(?:de|du|d'|des)\s*$|(?:pres|proche|environs|banlieue|peripherie|region|agglomeration|portes)\s+(?:de|du|d'|des)\s*$/;

// Mots du dossier que les lexiques du capteur ne portent pas (« Scandale dans une maternelle à Paris »).
const VOCAB_DOSSIER = ['maternelle', 'scandale', 'affaire', 'scolaire', 'ecole', 'college', 'lycee', 'proviseur', 'professeur',
  'surveillant', 'parent', 'abus', 'sexuel', 'pedo', 'periscolaire', 'creche'];
const ROMAINS_ARR = { 1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii', 8: 'viii', 9: 'ix', 10: 'x', 11: 'xi',
  12: 'xii', 13: 'xiii', 14: 'xiv', 15: 'xv', 16: 'xvi', 17: 'xvii', 18: 'xviii', 19: 'xix', 20: 'xx' };
const RE_REFERENCE =/\b(?:apres|aussi|comme|depuis|contrairement|similaire|lie|liee|echo)\b/;
// Un titre de synthèse qui porte un acte décisif peut porter la nouvelle : il continue.
const ACTES_DECISIFS = new Set(['APPEL_FORME', 'VERDICT_RELAXE', 'VERDICT_CONDAMNATION', 'MISE_EN_EXAMEN', 'ECROU', 'REMISE_LIBERTE', 'PEINE_NON_QUALIFIEE']);
const contient = (txtMots, phrase) => txtMots.includes(phrase);

// ---------------------------------------------------------------------
// ROUTEUR
// ---------------------------------------------------------------------
/**
 * @param {object} o
 * @param {string} o.titre       titre brut Google News
 * @param {string} [o.published] 'YYYY-MM-DD' (date de la SOURCE, jamais celle de l'événement)
 * @param {object} o.fiche       { case_id, statut_judiciaire, ... }
 * @param {object} o.ctx         construireContexte()
 * @returns {{route:string, regle:string|null, actes:string[], primaire:string|null, raisons:string[]}}
 */
export function router({ titre, published = null, fiche, ctx }) {
  const t = titreSansMedia(titre);
  const tm = mots(t);
  const brut = aplat(t);
  const liste = actes(t);
  const primaire = acteprimaire(liste);
  const propre = ctx.propres.get(fiche.case_id) || { phrases: new Set(), jetons: new Set(), communes: new Set() };

  const nommeMonEtab = [...propre.jetons].some((j) => contient(tm, ' ' + j + ' '))
    || [...propre.phrases].some((ph) => contient(tm, ph));
  const nommeMaCommune = [...propre.communes].some((c) => c && contient(tm, ' ' + c + ' '));
  // Pour une ville à arrondissements, « Paris » ne désigne pas MON arrondissement :
  // sans cela, aucun établissement parisien ne pourrait jamais être « ailleurs » d'un autre.
  const arr = /(\d{1,2})\s*(?:er|e|eme|ème)?\s*$/i.exec(String(fiche.commune || ''));
  const nommeMonArrondissement = arr
    ? nommeMaCommune && new RegExp(
      `(?: ${arr[1]}(?:er|e|eme)? (?:arrondissement|arr) | ${ROMAINS_ARR[Number(arr[1])] || '#'}(?:er|e|eme)? arrondissement | ${arr[1]}(?:er|e|eme)? )`).test(tm)
    : nommeMaCommune;

  const sortie = (route, regle, raisons = []) => ({ route, regle, actes: liste, primaire, raisons });

  // --- W1 · localité explicitement AILLEURS --------------------------------
  // Le titre nomme une localité connue qui n'est pas la nôtre, sans nommer ni
  // notre commune ni notre établissement, et sans que la localité soit
  // introduite par une juridiction/institution (« cour d'appel de X »).
  // Une localité à côté d'un acte judiciaire est souvent celle du TRIBUNAL, pas des
  // faits (« jugé à Rouen », affaire de Saint-Valery) : dans ce cas on continue.
  // Seuls les actes d'avant procès (soupçon, plainte, enquête, GAV, suspension) laissent
  // penser que la localité est celle des FAITS ; un acte de tribunal la rend ambiguë.
  if (!nommeMonEtab && !nommeMaCommune
      && liste.every((a) => ['SOUPCON', 'PLAINTE', 'ENQUETE', 'INTERPELLATION', 'SUSPENSION'].includes(a))) {
    const ailleurs = [];
    for (const loc of ctx.gazetteer) {
      if ([...propre.communes].includes(loc)) continue;
      const re = new RegExp(`(?<![a-z0-9])${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`);
      const m = re.exec(brut.replace(/-/g, ' ').replace(/'/g, "' "));
      if (!m) continue;
      const avant = brut.replace(/-/g, ' ').replace(/'/g, "' ").slice(Math.max(0, m.index - 40), m.index);
      if (RE_INSTITUTION_AVANT.test(avant)) continue;
      ailleurs.push(loc);
    }
    if (ailleurs.length === 1) {
      return sortie('WRONG_SCOPE_CERTAIN', 'W1_AUTRE_LOCALITE',
        [`le titre situe les faits à « ${ailleurs[0]} » ; ni notre commune ni notre établissement ne sont nommés`]);
    }
  }

  // --- W2 · un AUTRE établissement connu est nommé, pas le nôtre -----------
  // « Affaire Bétharram », « après Bétharram » citent un autre dossier en RÉFÉRENCE :
  // seul un établissement désigné comme tel (« l'école X ») compte, et jamais
  // quand notre commune est nommée ou qu'une marque de référence est présente.
  if (!nommeMonEtab && !nommeMonArrondissement && !RE_CONTEXTE.test(brut) && !RE_REFERENCE.test(brut)) {
    const autres = [];
    for (const [ph, ids] of ctx.etabs) {
      if (ids.has(fiche.case_id)) continue;
      if (!contient(tm, ph)) continue;
      const echap = ph.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?:ecole|college|lycee|creche|institution|maternelle)\\s+(?:\\w+\\s+){0,2}${echap}`).test(tm)) autres.push(ph.trim());
    }
    if (autres.length >= 1) {
      return sortie('WRONG_SCOPE_CERTAIN', 'W2_AUTRE_ETABLISSEMENT',
        [`le titre nomme « ${autres.join(' / ')} », établissement d'une autre affaire, et pas le nôtre`]);
    }
  }

  // --- C · contexte : synthèse, politique publique, hors sujet -------------
  if (!nommeMonEtab) {
    if (RE_CONTEXTE.test(brut) && !ACTES_DECISIFS.has(primaire)) return sortie('CONTEXT_ONLY', 'C1_SYNTHESE', ['titre de synthèse ou de politique publique, aucun élément propre à l\'affaire']);
    if (RE_HORS_SUJET.test(brut) && !liste.length) return sortie('CONTEXT_ONLY', 'C2_HORS_SUJET', ['sujet identifié comme non judiciaire']);
  } else if (RE_HORS_SUJET.test(brut) && !liste.length) {
    return sortie('CONTEXT_ONLY', 'C2_HORS_SUJET', ['sujet identifié comme non judiciaire']);
  }

  // Sans aucun mot du dossier (structure, fait, mineur, acte), sans notre établissement,
  // assez long pour ne pas être un titre dégénéré (« Sainte-Rose - lequotidien.re » doit
  // CONTINUER : c'est un cas de lecture humaine) : un club de foot, un menu de restaurant.
  if (!nommeMonEtab && liste.length === 0 && t.split(/\s+/).length >= 5
      && ![...STRUCTURES, ...FAITS, ...MINEURS, ...VOCAB_DOSSIER].some((m) => brut.includes(m))) {
    return sortie('CONTEXT_ONLY', 'C3_SANS_VOCABULAIRE_DU_DOSSIER',
      ['aucun mot de structure, de fait, de mineur ni d\'acte ; notre établissement n\'est pas nommé']);
  }

  // --- H · historique certain ---------------------------------------------
  // Tous les actes du titre sont d'un stade STRICTEMENT antérieur à l'état
  // courant, aucun acte de stade inconnu, aucun mot « appel/cassation », et
  // la date de la source est antérieure à la source connue la plus récente.
  // La date seule ne suffit JAMAIS : sans acte reconnu, le résultat continue.
  const stadeEtat = STADE_ETAT[fiche.statut_judiciaire];
  const derniere = ctx.derniereSource.get(fiche.case_id) || null;
  if (liste.length && stadeEtat !== undefined && published && derniere && published < derniere
      && !/\bappel\b|\bcassation\b|\bsuites?\b|\bapres\b|\bnouvel\w*|\bnouveau\b|\bfinalement\b|\bdeja\b/.test(brut)) {
    const stades = liste.map((a) => STAGE_ACTE[a]);
    if (stades.every((s) => s !== null && s < stadeEtat)) {
      return sortie('HISTORICAL_OR_ALREADY_KNOWN_CERTAIN', 'H1_STADE_ANTERIEUR',
        [`actes ${liste.join('+')} de stade < « ${fiche.statut_judiciaire} » ; source du ${published} antérieure à la source connue du ${derniere}`]);
    }
  }

  // --- avancé ou inconnu ---------------------------------------------------
  const avance = liste.some((a) => STAGE_ACTE[a] === null || stadeEtat === undefined || STAGE_ACTE[a] >= stadeEtat);
  return avance
    ? sortie('POTENTIAL_UPDATE', 'P1_ACTE_AVANCE', [`acte(s) ${liste.join('+')} de stade ≥ état courant`])
    : sortie('UNCERTAIN', 'U1_SANS_ACTE', liste.length ? ['actes de stade antérieur mais chronologie non établie'] : ['aucun acte reconnu dans le titre']);
}

// ---------------------------------------------------------------------
// CLAIMS — regroupement prudent
// ---------------------------------------------------------------------
const JOUR = 864e5;
const ecartJours = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / JOUR;

/**
 * Regroupe les résultats d'UNE affaire en claims candidats.
 *
 * Deux résultats convergent seulement s'ils portent LE MÊME acte principal
 * et sont publiés à moins de `fenetre` jours l'un de l'autre (chaînage).
 * Deux actes différents ne fusionnent jamais, même le même jour (la
 * relaxe du 07/07 et l'appel du 08/07 sont deux claims). Un résultat sans
 * acte reconnu reste seul. Regrouper ne valide rien : cela réduit le nombre
 * de recherches de preuve.
 *
 * @param {Array} items  { titre, published, media, cle, route, actes, primaire }
 * @returns {Array} claims { acte, items[], debut, fin, cle_claim }
 */
export function clusteriser(items, { fenetre = 5 } = {}) {
  const parActe = new Map();
  const claims = [];
  for (const it of items) {
    const acte = it.primaire || null;
    if (!acte) {
      claims.push({ acte: 'NON_QUALIFIE', items: [it], debut: it.published, fin: it.published });
      continue;
    }
    if (!parActe.has(acte)) parActe.set(acte, []);
    parActe.get(acte).push(it);
  }
  for (const [acte, liste] of parActe) {
    liste.sort((x, y) => String(x.published || '').localeCompare(String(y.published || '')));
    let courant = null;
    for (const it of liste) {
      if (courant && it.published && courant.fin && ecartJours(it.published, courant.fin) <= fenetre) {
        courant.items.push(it); courant.fin = it.published;
      } else {
        courant = { acte, items: [it], debut: it.published, fin: it.published };
        claims.push(courant);
      }
    }
  }
  return claims;
}

/** Clé de mémoire d'un claim : (affaire, acte, fenêtre de dates). */
export const cleClaim = (case_id, c) => `claim|${case_id}|${c.acte}|${c.debut || 'nd'}|${c.fin || 'nd'}`;

/** Lit une clé de claim mémorisée. */
export function lireCleClaim(s) {
  const m = /^claim\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)(?:\|([A-Z_]+))?$/.exec(s || '');
  return m ? { case_id: m[1], acte: m[2], debut: m[3], fin: m[4], verdict: m[5] || null } : null;
}

// ---------------------------------------------------------------------
// Claim déjà établi ? (mémoire éditoriale : case_events validés)
// ---------------------------------------------------------------------
const TYPE_EVENT = {
  APPEL_FORME: ['voie_de_recours'],
  VERDICT_CONDAMNATION: ['décision'], VERDICT_RELAXE: ['décision'],
  MISE_EN_EXAMEN: ['mise_en_examen'], ECROU: ['mise_en_examen', 'mesure_procédurale'],
  REMISE_LIBERTE: ['mesure_procédurale'], DEMANDE_LIBERTE: ['mesure_procédurale'],
  INTERPELLATION: ['garde_à_vue'], SUSPENSION: ['suspension'],
  PLAINTE: ['plainte'], ENQUETE: ['enquête'], AUDIENCE: ['audience'], RENVOI: ['audience'],
  REQUISITION: ['audience'], DELIBERE: ['délibéré'],
};
const STATUT_ACTE = { VERDICT_CONDAMNATION: /^condamnation/, VERDICT_RELAXE: /^relaxe/ };

/**
 * Un événement validé correspond-il au claim ? Même affaire, même type
 * d'acte (et même issue pour un verdict), date de l'événement dans la
 * fenêtre du claim ± 7 jours ; un événement SANS date correspond par le
 * seul type (limite documentée : POC-09, appel « ce mercredi »).
 */
export function claimDejaEtabli({ case_id, claim, evenements }) {
  const types = TYPE_EVENT[claim.acte];
  if (!types) return null;
  const reStatut = STATUT_ACTE[claim.acte];
  for (const e of evenements) {
    if (e.case_id !== case_id || !types.includes(e.event_type)) continue;
    if (reStatut && !reStatut.test(e.statut_apres || '')) continue;
    if (!e.event_date) return e;
    const d = String(e.event_date).slice(0, 10);
    const lo = claim.debut ? Date.parse(claim.debut) - 7 * JOUR : -Infinity;
    const hi = claim.fin ? Date.parse(claim.fin) + 7 * JOUR : Infinity;
    if (Date.parse(d) >= lo && Date.parse(d) <= hi) return e;
  }
  return null;
}

// ---------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------
/**
 * Requêtes de VEILLE pour une affaire : une requête « en avant » (boosters
 * de l'état courant) ET une requête ouverte. Les boosters orientent, ils ne
 * bornent jamais : la requête ouverte tourne toujours.
 * Le rôle n'entre pas dans la requête en avant : il la rétrécissait
 * (mesuré sur Titon : « animateur » écartait des titres d'appel qui ne le
 * nomment pas).
 */
export function requetesVeille(c, { fenetreJours = 45 } = {}) {
  // Un établissement ANONYME (« Centre périscolaire de Charly (non nommé) », « École non nommée ») ne se
  // cherche pas entre guillemets : la phrase exacte n'existera dans aucun article, la requête ne ramène
  // rien et l'affaire n'est jamais surveillée. On cherche alors les mots du nom, sans la mention
  // « non nommé » ni la parenthèse (mesuré à l'ouverture des dossiers REVIEW de Discovery #1).
  const etab = c.etablissement || '';
  const anonyme = /non nomm|\(/i.test(etab);
  const nomCherche = etab.replace(/\(.*?\)/g, ' ').replace(/non nomm[ée]e?s?/gi, ' ').replace(/[/,]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = [etab ? (anonyme ? nomCherche : `"${etab}"`) : '', (c.commune || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' ');
  const b = BOOSTERS[c.statut_judiciaire] || BOOSTERS['à qualifier'];
  const bq = b.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' OR ');
  // La requête ouverte est BORNÉE DANS LE TEMPS : sans borne, elle remonte tout l'historique
  // de l'établissement (mesuré : 686 résultats bruts contre 140, dont un club de foot et un
  // menu de restaurant). La requête « en avant » n'est, elle, jamais bornée : c'est elle qui
  // retrouve un appel déposé il y a trois mois.
  return { avant: `${base} (${bq})`, ouverte: `${base} when:${fenetreJours}d` };
}

const MOTS_ACTE = {
  APPEL_FORME: 'parquet fait appel', VERDICT_RELAXE: 'relaxe', VERDICT_CONDAMNATION: 'condamné',
  REQUISITION: 'requis', DELIBERE: 'délibéré', RENVOI: 'renvoyé tribunal', AUDIENCE: 'procès',
  MISE_EN_EXAMEN: 'mis en examen', ECROU: 'détention provisoire', REMISE_LIBERTE: 'remise en liberté',
  DEMANDE_LIBERTE: 'demande remise en liberté', INTERPELLATION: 'garde à vue', SUSPENSION: 'suspendu',
  PLAINTE: 'plainte', ENQUETE: 'enquête', COUR_APPEL: 'cour d\'appel', PEINE_NON_QUALIFIEE: 'prison',
};

/**
 * Requête de PREUVE pour un claim : établissement + commune + acte candidat
 * (+ rôle quand il départage deux affaires d'un même établissement).
 * Un claim sans acte reconnu cherche par son propre titre.
 */
export function requetePreuve({ fiche, claim }) {
  const commune = racineCommune(fiche.commune);
  if (claim.acte === 'NON_QUALIFIE') return [titreSansMedia(claim.items[0].titre), `"${fiche.etablissement}" ${commune}`];
  // Première requête : jetons distinctifs de l'établissement, SANS guillemets ni arrondissement.
  // Mesuré sur Titon : `"École Titon" Paris 11e parquet fait appel` ne rend qu'UN résultat (la presse
  // écrit « XIe arrondissement »), `Titon Paris relaxe appel parquet` en rend dix, dont l'appel.
  const jetons = jetonsEtab(fiche.etablissement, { saint: true }).join(' ') || fiche.etablissement;
  // Un appel porte sur une décision : la nommer resserre la recherche sans la fermer.
  const objet = claim.acte === 'APPEL_FORME'
    ? (/relaxe/.test(fiche.statut_judiciaire || '') ? 'relaxe' : /condamnation/.test(fiche.statut_judiciaire || '') ? 'condamnation' : '')
    : '';
  const mots = [MOTS_ACTE[claim.acte] || '', objet].filter(Boolean).join(' ');
  const role = String(fiche.role_mis_en_cause || '').replace(/périscolaire|scolaire/gi, '').trim();
  return [`${jetons} ${commune} ${mots}`.trim(), `"${fiche.etablissement}" ${role} ${mots}`.replace(/\s+/g, ' ').trim()];
}

// ---------------------------------------------------------------------
// SUFFISANCE ET CACHE — une seule décision métier, fraîche ou réutilisée
// ---------------------------------------------------------------------
/**
 * Une source établit-elle CE claim ? Même fonction pour une analyse neuve et une analyse
 * réutilisée : c'est ce qui garantit `fraîche == en cache`.
 * `arbitre` : le rattachement (affaire, article) a déjà été validé par un humain et persisté
 * (`state_proposals.decision = ACCEPT`) — il remplace l'avis du modèle sur le rattachement,
 * jamais le contrôle de la citation, de l'acte ni de la date.
 */
export function suffisance({ moteur, rattachement, evidence, evidenceInvalide = false, acte = null, dateOk = true, arbitre = false }) {
  const ev = evidence || [];
  const acteEtabli = !acte || acte === 'NON_QUALIFIE' ? ev.length > 0 : actes(ev.join(' ')).includes(acte);
  const suffisante = moteur !== 'rules' && (rattachement === 'OK' || arbitre === true)
    && !evidenceInvalide && ev.length > 0 && acteEtabli && dateOk;
  return { acteEtabli, suffisante };
}

/** Ce que le cache d'analyse conserve : TOUT ce dont `suffisance` a besoin (citations vérifiées incluses). */
export function entreeCache(out, action) {
  return {
    analysis_action: action, evidence: out._evidence || [], evidence_invalide: !!out._evidence_invalide,
    statut_propose: out.statut_propose || null, event_date: out.EVENT_DATE || null,
    rattachement: out.rattachement, claim: out._claim || null,
  };
}

/** Même forme, depuis une ligne `state_proposals` : citations vérifiées du payload, à défaut les faits. */
export function entreeDepuisBase(row) {
  const ev = Array.isArray(row.ev) && row.ev.length ? row.ev : (row.facts || []).flatMap((f) => f.evidence || []);
  return {
    analysis_action: row.analysis_action, evidence: ev, evidence_invalide: row.evinv === 'true' || row.evinv === true,
    statut_propose: row.statut_propose || null, event_date: row.event_date || null,
    rattachement: row.rattachement, claim: row.claim || null,
  };
}

/**
 * Un événement HUMAINEMENT VALIDÉ couvre-t-il déjà cette proposition d'état ? Même affaire, même état
 * cible, même date d'événement ÉCRITE des deux côtés.
 *
 * Date du fait NON écrite (« condamné ce mardi », mesuré le 09/10/2026 : 2 articles du 15/09 sur FR-2026-0004, fait validé
 * le 25/09, 2 nouvelles demandes d'arbitrage) : on s'appuie sur la date de PUBLICATION, qui ne peut pas précéder le fait.
 * Un article publié le jour du fait validé, ou dans les 3 jours qui suivent, rapporte CE fait — à condition qu'un seul
 * événement validé de même état tombe dans cette fenêtre : deux faits possibles → on ne tranche pas (jamais de fusion
 * de deux faits réellement distincts au seul motif qu'ils partagent un état). Sans aucune date : la proposition est
 * conservée (jamais d'effacement par défaut).
 */
export function evenementDejaValide(evenements, case_id, statutPropose, dateEvenement, datePublication = null) {
  if (!statutPropose) return null;
  const memes = (evenements || []).filter((e) => e.case_id === case_id && e.statut_apres === statutPropose && e.event_date);
  if (dateEvenement) return memes.find((e) => String(e.event_date).slice(0, 10) === dateEvenement) || null;
  if (!datePublication) return null;
  const pub = Date.parse(String(datePublication).slice(0, 10));
  if (Number.isNaN(pub)) return null;
  const proches = memes.filter((e) => { const j = (pub - Date.parse(String(e.event_date).slice(0, 10))) / 864e5; return j >= 0 && j <= 3; });
  return proches.length === 1 ? { ...proches[0], rapproche_par_publication: true } : null;
}
