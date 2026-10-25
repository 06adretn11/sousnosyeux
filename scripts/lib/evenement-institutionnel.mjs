// =====================================================================
// scripts/lib/evenement-institutionnel.mjs — réactions et mesures des institutions, distinctes du judiciaire.
//
// Fonction PURE (aucune base, aucun réseau, aucun modèle).
//
// TROIS CATÉGORIES (le modèle `case_events` les porte déjà ; seule la colonne `realisation` est ajoutée) :
//   1. judiciaire     plainte, enquête, mise en examen, audience, décision, voie de recours…  → fait évoluer l'état
//   2. institutionnel suspension, réponse_institutionnelle, mobilisation                      → JAMAIS l'état judiciaire
//   3. nouvelle source sans événement distinct                                               → sources de l'affaire
//
// PREUVE ≠ PUBLICATION. Le libellé public d'un événement institutionnel n'est JAMAIS du texte libre (ni du modèle, ni de
// l'article) : il sort d'une table fermée (mesure × réalisation), comme les libellés judiciaires. Le fait précis et sa
// citation restent en mémoire privée (state_proposals / payload).
//
// ANNONCÉE ≠ RÉALISÉE. « réalisée » exige un verbe d'accomplissement explicite dans la citation et aucun marqueur
// d'annonce ; au moindre doute, « annoncée ». Une intention n'est pas une mesure (doctrine SOURCE_EVIDENCE).
// =====================================================================

export const TYPES_JUDICIAIRES = Object.freeze(['plainte', 'enquête', 'garde_à_vue', 'mise_en_examen', 'audience', 'délibéré', 'décision', 'voie_de_recours', 'mesure_procédurale']);
export const TYPES_INSTITUTIONNELS = Object.freeze(['suspension', 'réponse_institutionnelle', 'mobilisation']);
export const categorieEvenement = (t) => (TYPES_INSTITUTIONNELS.includes(t) ? 'institutionnel' : TYPES_JUDICIAIRES.includes(t) ? 'judiciaire' : 'autre');

// ⚠ Tous les motifs sont écrits SANS accents et appliqués sur un texte normalisé (`norm`) : en JavaScript `\b` ne reconnaît pas
// les lettres accentuées, donc « municipalité » n'était jamais vu comme un acteur — défaut révélé par le rejeu sur l'article
// réel d'une mairie (la fixture synthétique passait seulement grâce au mot « maire »).
const ACTEUR = /\b(maire|mairie|municipalite|conseil municipal|collectivite|la commune|ville de|la ville|rectorat|academie|dsden|prefet|prefecture|education nationale|ministere|direction des services|service jeunesse|services? de la ville)\b/;

// Vocabulaire fermé : code → motif. `suspension_agent` s'écrit en `suspension`, le reste en `réponse_institutionnelle`.
const MESURES = [
  // Seulement ce que le libellé « suspendu de ses fonctions » dit VRAIMENT : ni licenciement ni révocation (autre mesure, autre libellé),
  // et « écarté » seulement s'il s'agit des fonctions (« écarté de l'enquête » n'est pas une suspension).
  ['suspension_agent', /\b(suspendu\w*|suspension|mis(?:e)? a pied|ecarte\w*(?:\s+[^\s.]+){0,4}\s+(?:de\s+)?(?:ses|son)\s+(?:fonctions?|poste))\b/],
  ['plan_action_encadrement', /plan d'action|renforc\w+\s+(?:de\s+)?(?:l'|les\s+)?(?:encadrement|controles?|recrutements?)|renforcement\s+(?:de\s+)?(?:l')?encadrement|taux d'encadrement|binomes?|double encadrement|recrut\w+\s+(?:de\s+)?(?:nouveaux\s+)?animateurs?/],
  ['controle_inspection', /\b(inspection|inspecteurs?|audit|controle administratif|enquete administrative|mission d'inspection)\b/],
  ['fermeture_structure', /\bferm\w+\b(?=[^.]{0,60}\b(?:centre|accueil|ecole|structure|creche|periscolaire)\b)|\bfermeture\b/],
  ['information_familles', /reunion d'information|information (?:aux|des) (?:familles|parents)|cellule d'ecoute|cellule psychologique|accompagnement psychologique|soutien psychologique/],
  // Mesures de collectivité (cas Villeurbanne, 15/10/2026) : jusqu'ici invisibles parce que seul l'audit / l'inspection était reconnu.
  ['commission_independante', /commission independante/],
  ['plan_formation', /plan de formation|formations?\b[^.]{0,60}\b(?:agents|managers|personnels?|animateurs)\b|\bformer\b[^.]{0,40}\b(?:agents|personnels?|animateurs)\b/],
  ['verification_antecedents', /verifications?\s+(?:des\s+)?casiers?|fichier des auteurs d'infractions/],
];

const ANNONCE = /\b(annonc\w+|va|vont|sera|seront|serait|prevu\w*|prevoit|prevoient|projette\w*|compte|comptent|s'engage\w*|promet\w*|propos\w+|presente\w*\s+(?:un|une|des)\s+(?:plan|serie|mesures?)|presentera|decide\s+de|lancera|mettra|souhait\w+|envisag\w+|il y aura|veut|veulent)\b/;
const ACCOMPLI = /\b(a|ont|avait|avaient)\s+(?:ete\s+)?(?:suspendu\w*|ecarte\w*|licenci\w+|ferme\w*|mis(?:e|es)?\s+a\s+pied|mis(?:e|es)?\s+en\s+place|instaur\w*|remplac\w*|lance\w*|ordonne\w*|declenche\w*|conduit\w*|realise\w*|effectue\w*|diligent\w*|rendu\w*\s+obligatoire\w*)|\b(est|sont)\s+(?:desormais\s+)?(?:en place|effectifs?|suspendu\w*|ferme\w*|termine\w*)\b|\b(?:se\s+sont|s'est)\s+(?:reuni|rassembl|mobilis)\w*|\ba eu lieu\b|\bont\s+(?:manifeste|defile)\w*/;
/** Texte comparable : sans accents, minuscules, apostrophes unifiées. */
import { dejaConnu } from './nouveaute.mjs';
import { estPisteDeNavigation } from './corps-article.mjs';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, "'");

// Libellés publics : table fermée. Jamais de nom (personne mise en cause, élu), jamais de détail des faits.
const LIBELLES = {
  suspension_agent: {
    annoncée: 'Selon la presse, une suspension de l’agent concerné a été annoncée.',
    réalisée: 'Selon la presse, l’agent concerné a été suspendu de ses fonctions.',
  },
  plan_action_encadrement: {
    annoncée: 'Selon la presse, la collectivité a annoncé un plan d’action pour renforcer l’encadrement des enfants.',
    réalisée: 'Selon la presse, la collectivité a mis en œuvre des mesures de renforcement de l’encadrement des enfants.',
  },
  controle_inspection: {
    annoncée: 'Selon la presse, un contrôle ou une inspection a été annoncé.',
    réalisée: 'Selon la presse, un contrôle ou une inspection a été conduit.',
  },
  fermeture_structure: {
    annoncée: 'Selon la presse, la fermeture de la structure a été annoncée.',
    réalisée: 'Selon la presse, la structure a été fermée.',
  },
  information_familles: {
    annoncée: 'Selon la presse, des mesures d’information et d’accompagnement des familles ont été annoncées.',
    réalisée: 'Selon la presse, des mesures d’information et d’accompagnement des familles ont été mises en œuvre.',
  },
  commission_independante: {
    annoncée: 'Selon la presse, la collectivité a annoncé la mise en place d’une commission indépendante chargée d’évaluer ses procédures.',
    réalisée: 'Selon la presse, la collectivité a mis en place une commission indépendante chargée d’évaluer ses procédures.',
  },
  plan_formation: {
    annoncée: 'Selon la presse, la collectivité a annoncé un plan de formation de ses agents au contact des enfants.',
    réalisée: 'Selon la presse, la collectivité a mis en œuvre une formation de ses agents au contact des enfants.',
  },
  verification_antecedents: {
    annoncée: 'Selon la presse, la collectivité a annoncé des vérifications des antécédents judiciaires de ses agents au contact des enfants.',
    réalisée: 'Selon la presse, la collectivité a procédé à la vérification des antécédents judiciaires de ses agents au contact des enfants.',
  },
};

// PRISE DE PAROLE (hors mesure) : « X a déclaré Y » n'établit pas Y. Libellé fermé, sans annoncée/réalisée (realisation NULL).
const DECLARATIONS = [
  ['declaration_employeur', /association[^.]{0,80}responsabilites? d'employeur|responsabilites? d'employeur[^.]{0,80}gestionnaire/],
];
const LIBELLES_DECLARATION = {
  declaration_employeur: 'Selon la presse, l’employeur de l’agent concerné a publié un communiqué par lequel il affirme avoir assumé ses responsabilités d’employeur. Position de l’employeur, non vérifiée par ailleurs.',
};

export function libelleInstitutionnel(mesure, realisation) {
  return LIBELLES[mesure]?.[realisation] || null;
}

/** « réalisée » seulement si la citation établit l'accomplissement ET n'annonce rien. */
export function realisationDe(citation) {
  const n = norm(citation);
  return ACCOMPLI.test(n) && !ANNONCE.test(n) ? 'réalisée' : 'annoncée';
}

const MOIS = { janvier: '01', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', aout: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12' };
const NOMS_MOIS = Object.keys(MOIS).join('|');

const JOURS = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };
const FUTUR = /\b(prochain\w*|sera|seront|va|vont|prevu\w*|a venir)\b/; // « a annoncé » est un passé : ce n'est pas une marque d'avenir
const parseRef = (r) => { const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(String(r || '')); return m ? { y: Number(m[1]), m: m[2] ? Number(m[2]) : null, d: m[3] ? Number(m[3]) : null } : null; };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Date d'un fait telle que l'ÉCRIT la phrase, RAPPORTÉE à la date de PUBLICATION de l'article — jamais inventée.
 *   jour complet (« 12 octobre ») → `date` ; jour de semaine (« ce jeudi ») → la date de CE jour relativement à la publication ;
 *   mois seul (« en juin 2026 », « depuis juillet ») → `periode` AAAA-MM, `date` reste null.
 * `ref` : date de publication « AAAA-MM-JJ » (ou seulement l'année). Un passé RELATIF (« en novembre dernier » dans un article de mars 2026
 * = novembre 2025) n'est jamais daté du futur de l'article : sans marque d'avenir (« prochain », « sera »…), une date postérieure à la
 * publication est ramenée à l'année précédente. Sans référence suffisante : null, jamais deviné.
 * @returns {{date:string|null, periode:string|null}}
 */
export function dateEcrite(texte, ref = null) {
  const n = norm(texte), R = parseRef(ref), futur = FUTUR.test(n);
  const apresRef = (y, m, d) => !!(R?.m && R?.d) && iso(y, m, d) > iso(R.y, R.m, R.d);
  const j = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${NOMS_MOIS})(?:\\s+(\\d{4}))?\\b`).exec(n);
  if (j) {
    const m = Number(MOIS[j[2]]), d = Number(j[1]);
    let y = j[3] ? Number(j[3]) : R?.y;
    if (y) { if (!j[3] && !futur && apresRef(y, m, d)) y -= 1; return { date: iso(y, m, d), periode: null }; }
  }
  const w = new RegExp(`\\b(?:ce\\s+|le\\s+)?(${Object.keys(JOURS).join('|')})(\\s+dernier)?\\b`).exec(n);
  if (w && R?.m && R?.d) {
    const pub = new Date(Date.UTC(R.y, R.m - 1, R.d));
    let ecart = (pub.getUTCDay() - JOURS[w[1]] + 7) % 7;
    if (w[2] && ecart === 0) ecart = 7;
    const dt = new Date(pub.getTime() - ecart * 864e5);
    return { date: iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()), periode: null };
  }
  const m = new RegExp(`\\b(?:en|depuis|durant|courant|au mois de|fin|debut)\\s+(${NOMS_MOIS})(?:\\s+(\\d{4}))?(\\s+(?:dernier|passe))?\\b`).exec(n);
  if (m) {
    const mois = Number(MOIS[m[1]]);
    let y = m[2] ? Number(m[2]) : R?.y;
    if (y && !m[2] && R?.m && !futur) { const ecart = y * 12 + mois - (R.y * 12 + R.m); if (ecart > 0 || (m[3] && ecart >= 0)) y -= 1; }
    if (y && !(m[3] && !m[2] && !R?.m)) return { date: null, periode: `${y}-${String(mois).padStart(2, '0')}` };
  }
  return { date: null, periode: null };
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 2026-06 » → « juin 2026 » (période rapportée sans jour) ; '' si le format n'est pas AAAA-MM. */
export const moisFr = (p) => { const m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? `${MOIS_FR[Number(m[2]) - 1]} ${m[1]}` : ''; };

/**
 * Ce qu'une proposition « +reactions » demande vraiment : les mesures NOUVELLES (libellé absent de la mémoire de l'affaire), séparées
 * selon la portée. `propres` (établissement) peuvent devenir des événements de l'affaire ; `territoire` jamais.
 */
export function planReactions(faits, memoire = []) {
  // `memoire` : faits connus {event_type, event_date, event_period, libelle_public} (un Set de libellés reste accepté : comparaison par libellé seul).
  const liste = memoire instanceof Set ? [...memoire].map((libelle_public) => ({ libelle_public })) : memoire;
  const neufs = (faits || []).filter((f) => f?.libelle_public && !dejaConnu(f, liste.map((e) => ({ event_type: f.event_type, ...e }))));
  return { neufs, propres: neufs.filter((f) => f.portee !== 'territoire'), territoire: neufs.filter((f) => f.portee === 'territoire') };
}

// MOBILISATIONS de la société civile (parents, enseignants, collectifs…) : vocabulaire fermé, acteur COLLECTIF seulement. Un acteur
// institutionnel dans la phrase n'est jamais une mobilisation. Le libellé public ne reprend ni parole ni citation de parent.
const COLLECTIF = /\b(parents?(?: d'eleves)?|enseignants?|professeurs?|personnels?|collectifs?|associations?|riverains|habitants|syndicats?)\b/g;
const MOBILISATIONS = [
  ['rassemblement', /\b(?:se\s+sont\s+(?:reuni|rassembl|mobilis)\w*|rassembl\w+|manifest\w+|sit-in|veillee|marche blanche|cercle de silence|mobilis\w+)\b/, { annoncee: 'ont annoncé un rassemblement', realisee: 'ont tenu un rassemblement' }],
  ['petition', /\bpetitions?\b/, { annoncee: 'ont annoncé une pétition', realisee: 'ont lancé une pétition' }],
  ['lettre_ouverte', /\blettres? ouvertes?\b|\bcourrier\s+(?:au|a la|adresse)\b/, { annoncee: 'ont annoncé l’envoi d’une lettre', realisee: 'ont adressé une lettre aux autorités' }],
];
const acteursCollectifs = (n) => {
  const s = new Set([...n.matchAll(COLLECTIF)].map((m) => (/parent/.test(m[1]) ? 'parents' : /enseignant|professeur|personnel/.test(m[1]) ? 'enseignants' : 'collectif')));
  return [...s];
};
const GN_ACTEURS = (a) => (a.includes('parents') && a.includes('enseignants') ? 'des parents et des enseignants' : a.includes('parents') ? 'des parents' : a.includes('enseignants') ? 'des enseignants et personnels' : 'un collectif ou une association');
export function libelleMobilisation(mesure, realisation, acteurs) {
  const t = MOBILISATIONS.find(([m]) => m === mesure)?.[2];
  return t ? `Selon la presse, ${GN_ACTEURS(acteurs || [])} ${realisation === 'réalisée' ? t.realisee : t.annoncee}.` : null;
}
// « la Ville de Paris », « la mairie de Villeurbanne » : acteur NOMMÉ et territoire de la mesure, tels qu'écrits.
const ACTEUR_NOMME = /\b(?:la\s+)?([Vv]ille|[Mm]airie|[Mm]unicipalité|[Cc]ommune|[Pp]réfecture|[Rr]ectorat)\s+(?:de|d['’])\s*([A-ZÀ-Ý][\p{L}'’-]*(?:\s+[A-ZÀ-Ý][\p{L}'’-]*){0,2})/u;
const acteurNomme = (phrase) => { const m = ACTEUR_NOMME.exec(phrase); return m ? { acteur_nomme: `${m[1][0].toUpperCase()}${m[1].slice(1)} de ${m[2]}`, territoire: m[2] } : {}; };

const jetonsEtab = (e) => norm(e).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !['ecole', 'maternelle', 'elementaire', 'college', 'lycee', 'creche', 'periscolaire', 'centre', 'loisirs'].includes(w));
// Coupe aux fins de phrase seulement : les guillemets à espaces de la presse (« " texte " ») ne sont pas des frontières.
// Les crédits photo (« © Radio France – Prénom Nom ») collés à une phrase sont retirés : jamais un nom de journaliste dans une citation.
const decoupe = (corps) => String(corps || '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý"«])|\n+/).map((s) => s.replace(/\s*©.*$/, '').replace(/\s+/g, ' ').trim())
  // Un « À lire aussi » est le titre d'un AUTRE article : jamais une phrase de celui-ci, donc jamais une preuve (même sur un corps déjà mémorisé).
  .filter((s) => s.length >= 25 && !estPisteDeNavigation(s));

/** Territoire NOMMÉ par la phrase (« rassemblés à Paris ») — jamais la commune de l'affaire dont on est parti. */
// (`\b` ne voit pas les lettres accentuées : « à » s'ancre par lookbehind.)
const territoireDe = (phrase) => /(?<![\p{L}])(?:à|au|aux|en|dans|(?:la\s+)?(?:mairie|ville)\s+de)\s+(?:la\s+ville\s+de\s+)?([A-ZÀ-Ý][\p{L}'’-]+(?:[ -][A-ZÀ-Ý][\p{L}'’-]+){0,2})/u.exec(phrase)?.[1] ?? null;

/**
 * Réactions et mesures d'institutions rapportées par un ARTICLE ENTIER (et non seulement par la citation qui porte l'événement
 * judiciaire). Fonction PURE, sans modèle : même vocabulaire fermé et mêmes libellés publics que `detecterInstitutionnel`.
 *
 * PORTÉE. « établissement » seulement si la phrase NOMME l'établissement de l'affaire ; sinon « territoire » : une politique municipale
 * qui vise plusieurs structures n'est pas un événement propre à cet établissement (jamais rattachée automatiquement à sa fiche).
 * Une mesure vue dans plusieurs phrases n'est comptée qu'une fois ; « réalisée » exige que TOUTES ses phrases le soient.
 * @returns {Array<{event_type:string, mesure:string, realisation:'annoncée'|'réalisée', portee:'établissement'|'territoire', acteur:string,
 *                  event_date:string|null, event_period:string|null, libelle_public:string, evidence:string[]}>}
 */
export function extraireReactions(corps, { etablissement = '', anneeRef = null, autres = [] } = {}) {
  const jetons = jetonsEtab(etablissement);
  // Jetons des AUTRES établissements du même territoire : une phrase qui les nomme parle de plusieurs structures (portée territoire).
  const jetonsAutres = autres.flatMap((e) => jetonsEtab(e)).filter((t) => !jetons.includes(t));
  const parMesure = new Map();
  const phrases = decoupe(corps);
  // Mobilisations collectives (parents, enseignants…) : un événement par type, acteur(s) COLLECTIF(S), jamais de parole citée.
  for (const phrase of phrases) {
    const n = norm(phrase);
    const acteurs = acteursCollectifs(n);
    if (!acteurs.length) continue;
    for (const [mesure, motif] of MOBILISATIONS) {
      if (!motif.test(n)) continue;
      // Un titre (« … parents et enseignants rassemblés à l'école ») et la phrase du corps rapportent le MÊME rassemblement : « réalisé » dès
      // qu'une phrase l'établit (participe passé ou verbe d'accomplissement) sans marque d'annonce ; sinon « annoncé » (doute = annoncé).
      const passe = ACCOMPLI.test(n) || /\b(?:rassembl|reuni|mobilis)\w*s\b/.test(n);
      const realisation = passe && !ANNONCE.test(n) ? 'réalisée' : 'annoncée';
      const nomme = !!jetons.length && jetons.some((t) => n.includes(t));
      const multi = jetonsAutres.some((t) => n.includes(t));
      const d = dateEcrite(phrase, anneeRef);
      // UN fait par (type, jour) : deux rassemblements de jours différents ne fusionnent pas ; une phrase sans date rejoint le fait déjà vu.
      const cle = [...parMesure.keys()].find((k) => k.startsWith(`mob:${mesure}|`) && (!d.date || !parMesure.get(k).event_date || parMesure.get(k).event_date === d.date)) ?? `mob:${mesure}|${d.date ?? d.periode ?? parMesure.size}`;
      const f = parMesure.get(cle);
      if (!f) parMesure.set(cle, { event_type: 'mobilisation', nature: 'mobilisation', mesure, realisation, portee: nomme && !multi ? 'établissement' : 'territoire', acteur: acteurs.join(', '), acteurs, event_date: d.date, event_period: d.periode, evidence: [phrase], territoire: territoireDe(phrase), _nomme: nomme && !multi });
      else {
        f.event_date ||= d.date; f.event_period ||= d.periode; f.territoire ||= territoireDe(phrase);
        for (const a of acteurs) if (!f.acteurs.includes(a)) f.acteurs.push(a);
        if (realisation === 'réalisée') f.realisation = 'réalisée';
        if (nomme && !multi && !f._nomme) { f._nomme = true; f.portee = 'établissement'; f.evidence.unshift(phrase); }
        else if (f.evidence.length < 2) f.evidence.push(phrase);
        f.evidence = f.evidence.slice(0, 2);
        f.acteur = f.acteurs.join(', ');
      }
    }
  }
  // Date de l'ÉVÉNEMENT établie ailleurs dans le même article (légende « … à Paris, le 21 mars 2026 ») : adoptée seulement si elle porte une année
  // écrite et si l'article n'en nomme qu'une pour ce type de mobilisation. La date de PUBLICATION n'est jamais la date du rassemblement.
  for (const f of parMesure.values()) {
    if (f.nature !== 'mobilisation' || f.event_date) continue;
    const motif = MOBILISATIONS.find(([m]) => m === f.mesure)[1];
    const datees = phrases.filter((p) => motif.test(norm(p)) && /\b\d{4}\b/.test(p)).map((p) => [dateEcrite(p, anneeRef).date, p]).filter(([d]) => d);
    if (datees.length && new Set(datees.map(([d]) => d)).size === 1) {
      f.event_date = datees[0][0]; f.event_period = null;
      if (f.evidence.length < 2) f.evidence.push(datees[0][1]);
    }
  }
  for (let i = 0; i < phrases.length; i++) {
    // Une mesure dont l'acteur est nommé dans la phrase SUIVANTE (« Une commission indépendante sera installée. Elle auditera les
    // processus de la commune. ») : les deux phrases forment alors UNE citation — jamais un acteur recoupé entre deux citations.
    let phrase = phrases[i];
    if (!ACTEUR.test(norm(phrase)) && phrases[i + 1] && MESURES.some(([m, re]) => m !== 'suspension_agent' && re.test(norm(phrase)))) phrase = `${phrase} ${phrases[i + 1]}`;
    const n = norm(phrase);
    const acteur = ACTEUR.exec(n)?.[1];
    if (!acteur) continue;
    for (const [mesure, motif] of MESURES) {
      if (mesure === 'suspension_agent' || !motif.test(n)) continue;
      const realisation = realisationDe(phrase);
      const portee = jetons.length && jetons.some((t) => n.includes(t)) ? 'établissement' : 'territoire';
      const d = dateEcrite(phrase, anneeRef);
      const f = parMesure.get(mesure);
      if (!f) parMesure.set(mesure, { event_type: 'réponse_institutionnelle', nature: 'mesure', mesure, realisation, portee, acteur, ...acteurNomme(phrase), event_date: d.date, event_period: d.periode, evidence: [phrase] });
      else {
        if (realisation === 'annoncée') f.realisation = 'annoncée';
        if (portee === 'établissement') f.portee = 'établissement';
        f.event_date ||= d.date; f.event_period ||= d.periode;
        if (f.evidence.length < 2) f.evidence.push(phrase);
      }
    }
  }
  return [...parMesure.values()].map(({ _nomme, ...f }) => (f.nature === 'mobilisation' && (f.portee !== 'territoire' || !f.territoire) ? (delete f.territoire, f) : f)).map((f) => ({ ...f,libelle_public: f.nature === 'mobilisation' ? libelleMobilisation(f.mesure, f.realisation, f.acteurs) : libelleInstitutionnel(f.mesure, f.realisation) }));
}

/**
 * Cherche, parmi des citations LITTÉRALES déjà vérifiées, un fait institutionnel : un acteur institutionnel ET une mesure
 * dans la MÊME citation (jamais recoupé entre deux citations). Une mesure sans acteur (« l'animateur a été suspendu » par
 * son employeur non nommé) ne suffit pas ; un acteur sans mesure (le maire « est choqué ») non plus.
 * @param {string[]} citations
 * @returns {null | { event_type:'suspension'|'réponse_institutionnelle', mesure:string, realisation:'annoncée'|'réalisée',
 *                    libelle_public:string, citation:string }}
 */
export function detecterInstitutionnel(citations) {
  for (const brut of citations || []) {
    const c = String(brut || '').replace(/\s+/g, ' ').trim();
    const n = norm(c);
    const decl = c.length >= 25 ? DECLARATIONS.find(([, m]) => m.test(n)) : null;
    if (decl) return { event_type: 'réponse_institutionnelle', mesure: decl[0], realisation: null, libelle_public: LIBELLES_DECLARATION[decl[0]], citation: c };
    if (c.length < 25 || !ACTEUR.test(n)) continue;
    for (const [mesure, motif] of MESURES) {
      if (!motif.test(n)) continue;
      const realisation = realisationDe(c);
      return {
        event_type: mesure === 'suspension_agent' ? 'suspension' : 'réponse_institutionnelle',
        mesure, realisation, libelle_public: libelleInstitutionnel(mesure, realisation), citation: c,
      };
    }
  }
  return null;
}
