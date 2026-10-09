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
];

const ANNONCE = /\b(annonc\w+|va|vont|sera|seront|serait|prevu\w*|prevoit|prevoient|projette\w*|compte|comptent|s'engage\w*|promet\w*|propos\w+|presente\w*\s+(?:un|une|des)\s+(?:plan|serie|mesures?)|presentera|decide\s+de|lancera|mettra|souhait\w+|envisag\w+|il y aura|veut|veulent)\b/;
const ACCOMPLI = /\b(a|ont)\s+(?:ete\s+)?(?:suspendu\w*|ecarte\w*|licenci\w+|ferme\w*|mis(?:e|es)?\s+a\s+pied|mis(?:e|es)?\s+en\s+place|instaur\w*|remplac\w*|lance\w*|ordonne\w*|declenche\w*|conduit\w*|realise\w*|effectue\w*)|\b(est|sont)\s+(?:desormais\s+)?(?:en place|effectifs?|suspendu\w*|ferme\w*)\b/;
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
};

export function libelleInstitutionnel(mesure, realisation) {
  return LIBELLES[mesure]?.[realisation] || null;
}

/** « réalisée » seulement si la citation établit l'accomplissement ET n'annonce rien. */
export function realisationDe(citation) {
  const n = norm(citation);
  return ACCOMPLI.test(n) && !ANNONCE.test(n) ? 'réalisée' : 'annoncée';
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
