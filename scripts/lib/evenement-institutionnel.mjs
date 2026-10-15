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
const ACCOMPLI = /\b(a|ont|avait|avaient)\s+(?:ete\s+)?(?:suspendu\w*|ecarte\w*|licenci\w+|ferme\w*|mis(?:e|es)?\s+a\s+pied|mis(?:e|es)?\s+en\s+place|instaur\w*|remplac\w*|lance\w*|ordonne\w*|declenche\w*|conduit\w*|realise\w*|effectue\w*|diligent\w*|rendu\w*\s+obligatoire\w*)|\b(est|sont)\s+(?:desormais\s+)?(?:en place|effectifs?|suspendu\w*|ferme\w*|termine\w*)\b/;
/** Texte comparable : sans accents, minuscules, apostrophes unifiées. */
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

/**
 * Date d'un fait telle que l'ÉCRIT la phrase — jamais inventée. Jour complet → `date` ; mois seul (« en juin 2026 », « depuis juillet »)
 * → `periode` AAAA-MM, `date` reste null. L'année manquante est celle de la publication (`anneeRef`), jamais devinée autrement.
 * @returns {{date:string|null, periode:string|null}}
 */
export function dateEcrite(texte, anneeRef = null) {
  const n = norm(texte);
  const j = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${NOMS_MOIS})(?:\\s+(\\d{4}))?\\b`).exec(n);
  if (j) {
    const an = j[3] || anneeRef;
    if (an) return { date: `${an}-${MOIS[j[2]]}-${String(j[1]).padStart(2, '0')}`, periode: null };
  }
  const m = new RegExp(`\\b(?:en|depuis|durant|courant|au mois de|fin|debut)\\s+(${NOMS_MOIS})(?:\\s+(\\d{4}))?\\b`).exec(n);
  if (m) {
    const an = m[2] || anneeRef;
    if (an) return { date: null, periode: `${an}-${MOIS[m[1]]}` };
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
export function planReactions(faits, connus = new Set()) {
  const neufs = (faits || []).filter((f) => f?.libelle_public && !connus.has(f.libelle_public));
  return { neufs, propres: neufs.filter((f) => f.portee !== 'territoire'), territoire: neufs.filter((f) => f.portee === 'territoire') };
}

const jetonsEtab = (e) => norm(e).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !['ecole', 'maternelle', 'elementaire', 'college', 'lycee', 'creche', 'periscolaire', 'centre', 'loisirs'].includes(w));
// Coupe aux fins de phrase seulement : les guillemets à espaces de la presse (« " texte " ») ne sont pas des frontières.
const decoupe = (corps) => String(corps || '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý"«])|\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 25);

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
export function extraireReactions(corps, { etablissement = '', anneeRef = null } = {}) {
  const jetons = jetonsEtab(etablissement);
  const parMesure = new Map();
  const phrases = decoupe(corps);
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
      if (!f) parMesure.set(mesure, { event_type: 'réponse_institutionnelle', mesure, realisation, portee, acteur, event_date: d.date, event_period: d.periode, evidence: [phrase] });
      else {
        if (realisation === 'annoncée') f.realisation = 'annoncée';
        if (portee === 'établissement') f.portee = 'établissement';
        f.event_date ||= d.date; f.event_period ||= d.periode;
        if (f.evidence.length < 2) f.evidence.push(phrase);
      }
    }
  }
  return [...parMesure.values()].map((f) => ({ ...f, libelle_public: libelleInstitutionnel(f.mesure, f.realisation) }));
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
