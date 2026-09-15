// =====================================================================
// scripts/qa/lib/rules.mjs
//
// Règles éditoriales déterministes.
// Chaque règle transforme une fiche en une liste de constats.
//
// Un constat : { rule, severity, case_id, message, evidence }
//   severity : 'bloquant' | 'alerte'
//
// Références :
//   docs/industrialisation/EDITORIAL_CONTRACT_V0.md
//   docs/industrialisation/QA_GATES_V0.md
//
// ⚠️ Limites déclarées (QA_GATES_V0 §3.3) :
//   - la détection de noms propres n'est PAS couverte : aucun motif ne
//     distingue un patronyme d'un nom d'établissement ;
//   - la disponibilité réseau des URL n'est PAS testée ici ;
//   - un corpus vert ne prouve pas l'exactitude judiciaire.
// =====================================================================

export const STATUTS = Object.freeze([
  'plainte',
  'enquête',
  'mise en examen',
  'procès',
  'condamnation non définitive',
  'condamnation définitive',
  'relaxe / non-lieu / classement',
  'à qualifier',
]);

/** Avancement conventionnel d'un statut. Sert à qualifier une transition. */
const AVANCEMENT = {
  'à qualifier': 0,
  plainte: 1,
  enquête: 2,
  'mise en examen': 3,
  procès: 4,
  'condamnation non définitive': 5,
  'condamnation définitive': 6,
  'relaxe / non-lieu / classement': -1, // issue terminale favorable
};

export const ENFANTS_ADMIS = Object.freeze(['1 enfant', 'plusieurs enfants', 'non précisé']);

/** Fraîcheur maximale de `verified_at`, en jours (contrat éditorial §5.2). */
export const FRAICHEUR_JOURS = Object.freeze({
  procès: 30,
  'mise en examen': 30,
  enquête: 90,
  plainte: 90,
  'condamnation non définitive': 180,
  'condamnation définitive': 365,
});

/** Médias non admissibles comme source primaire (contrat éditorial §4). */
const MEDIA_NON_ADMISSIBLE = [
  { re: /wikip[ée]dia/i, motif: 'encyclopédie collaborative' },
  { re: /^msn\b|\bmsn\s*\//i, motif: 'agrégateur sans rédaction' },
  { re: /reprise presse/i, motif: 'reprise sans éditeur identifié' },
  { re: /facebook|twitter|\bx\.com\b|instagram|tiktok/i, motif: 'réseau social' },
  { re: /\bblog\b/i, motif: 'blog personnel' },
];

/**
 * Médias à accès restreint.
 *
 * Crédibilité et accessibilité sont deux choses distinctes : un journal
 * payant peut être parfaitement crédible, et l'écarter pour cette seule
 * raison appauvrirait le sourçage. Ce qui pose problème, c'est qu'une
 * affirmation sensible repose UNIQUEMENT sur une source que le lecteur
 * ne peut pas ouvrir pour la vérifier.
 */
const MEDIA_PAYANT = [/mediapart/i, /\babonn[ée]s?\b/i];
const estPayant = (s) =>
  s.access_status === 'paywall' || MEDIA_PAYANT.some((re) => re.test(String(s.media || '')));

const UNITES_FR =
  '(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze)';

/** Motifs d'information interdite (contrat éditorial §1). */
const MOTIFS_INTERDITS = [
  {
    id: 'age_exact',
    // « de 47 ans », « âgé de 47 ans », « animateur de 47 ans »
    re: new RegExp(`\\b(?:âg[ée]e?\\s+de\\s+)?\\d{1,2}\\s*ans\\b|\\bde\\s+${UNITES_FR}\\s+ans\\b`, 'i'),
    message: 'âge exact mentionné',
  },
  {
    id: 'annee_naissance',
    re: /\bn[ée]e?\s+en\s+(?:19|20)\d{2}\b/i,
    message: 'année de naissance mentionnée',
  },
  {
    id: 'nombre_enfants_exact',
    // « sur 3 enfants », « 5 enfants », « trois enfants »
    re: new RegExp(`\\b(?:\\d{1,3}|${UNITES_FR})\\s+(?:jeunes\\s+)?enfants\\b`, 'i'),
    message: 'nombre exact d\'enfants mentionné',
    // « plusieurs enfants » et « des enfants » sont admis : non capturés par le motif.
  },
  {
    id: 'telephone',
    re: /\b0[1-9](?:[\s.-]?\d{2}){4}\b/,
    message: 'numéro de téléphone présent',
  },
];

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------

const finding = (rule, severity, case_id, message, evidence = null) => ({
  rule,
  severity,
  case_id,
  message,
  evidence,
});

export const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const daysBetween = (a, b) => Math.floor((b - a) / 86_400_000);

/** Texte libre d'une fiche, tous champs susceptibles d'être rendus. */
function textesPublics(c) {
  return [
    ['resume_public', c.resume_public],
    ['libelle_public', c.libelle_public],
    ...(c.events || []).map((e, i) => [`events[${i}].libelle_public`, e.libelle_public]),
  ].filter(([, v]) => typeof v === 'string' && v.length > 0);
}

/** Normalisation d'un nom d'établissement pour la détection de doublons. */
export function normEtab(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(ecole|maternelle|elementaire|primaire|creche|groupe scolaire|de|du|des|la|le|les|rue|d)\b/g, ' ')
    .replace(/\b(i{1,3}|iv|v)\b/g, ' ') // « Reuilly II » ≡ « Reuilly »
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------

/** R1 — information interdite dans un texte destiné au public. */
export function ruleForbiddenContent(c) {
  const out = [];
  for (const [champ, texte] of textesPublics(c)) {
    for (const m of MOTIFS_INTERDITS) {
      const hit = texte.match(m.re);
      if (hit) {
        out.push(
          finding('R1_information_interdite', 'bloquant', c.case_id, `${m.message} (${champ})`, hit[0].trim())
        );
      }
    }
  }
  return out;
}

/** R2 — généralisation du nombre d'enfants. */
export function ruleChildCount(c) {
  if (!ENFANTS_ADMIS.includes(c.enfants_concernes_public)) {
    return [
      finding(
        'R2_enfants_non_generalise',
        'bloquant',
        c.case_id,
        `enfants_concernes_public hors énumération admise`,
        String(c.enfants_concernes_public)
      ),
    ];
  }
  return [];
}

/** R3 — échéance présentée comme future mais dépassée. */
export function ruleDeadlines(c, today) {
  const out = [];
  for (const e of c.events || []) {
    if (!e.is_future) continue;
    const d = parseDate(e.event_date);
    if (!d) {
      out.push(
        finding('R3_echeance_sans_date', 'bloquant', c.case_id, 'échéance annoncée sans date exploitable', e.libelle_public)
      );
      continue;
    }
    if (d < today) {
      out.push(
        finding(
          'R3_echeance_depassee',
          'bloquant',
          c.case_id,
          `échéance présentée comme future mais dépassée depuis ${daysBetween(d, today)} j`,
          `${e.event_date} — ${e.libelle_public || e.event_type}`
        )
      );
    }
  }
  return out;
}

/** R4 — sources : présence, datation, admissibilité, forme de l'URL. */
export function ruleSources(c) {
  const out = [];
  const sources = c.sources || [];

  if (sources.length === 0) {
    return [finding('R4_source_absente', 'bloquant', c.case_id, 'aucune source')];
  }

  const primaires = sources.filter((s) => s.is_primary);
  if (primaires.length === 0) {
    out.push(finding('R4_source_primaire_absente', 'bloquant', c.case_id, 'aucune source primaire'));
  }
  if (primaires.length > 1) {
    out.push(
      finding('R4_sources_primaires_multiples', 'bloquant', c.case_id, `${primaires.length} sources primaires`)
    );
  }

  for (const s of sources) {
    const url = String(s.url || '');
    if (!/^https?:\/\/\S+$/.test(url)) {
      out.push(finding('R4_url_invalide', 'bloquant', c.case_id, 'URL absente ou malformée', url));
    } else if (/\.{3}$/.test(url)) {
      out.push(finding('R4_url_tronquee', 'bloquant', c.case_id, 'URL tronquée', url));
    }

    if (s.is_primary && !s.publication_date) {
      out.push(
        finding('R4_source_primaire_sans_date', 'bloquant', c.case_id, 'source primaire sans date de publication', s.media)
      );
    }

    // Non-admissibilité = problème de CRÉDIBILITÉ de l'éditeur.
    // Elle vaut aussi en source secondaire : la source est citée au lecteur
    // comme moyen de vérification, ce qu'elle ne permet pas.
    const ko = MEDIA_NON_ADMISSIBLE.find((m) => m.re.test(String(s.media || '')));
    if (ko) {
      out.push(
        finding(
          s.is_primary ? 'R4_source_primaire_non_admissible' : 'R4_source_secondaire_non_admissible',
          s.is_primary ? 'bloquant' : 'alerte',
          c.case_id,
          `source ${s.is_primary ? 'primaire' : 'secondaire'} non admissible : ${ko.motif}`,
          s.media
        )
      );
    }

    // Cohérence média ↔ domaine : un libellé qui ne correspond pas à l'URL
    // fausse toute lecture de la qualité du sourçage.
    const dom = (String(s.url || '').match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1];
    if (dom) {
      // Comparaison par jeton significatif plutôt que par préfixe : les
      // domaines réordonnent et élident (« L'Est Républicain » →
      // estrepublicain.fr, « La Gazette en Yvelines » → lagazette-yvelines.fr).
      const domCle = dom.toLowerCase().replace(/[^a-z0-9]/g, '');
      const jetons = String(s.media || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 5);
      if (jetons.length > 0 && !jetons.some((t) => domCle.includes(t))) {
        out.push(
          finding('R4_media_incoherent', 'alerte', c.case_id, `libellé « ${s.media} » incohérent avec le domaine`, dom)
        );
      }
    }

    if (s.access_status && s.access_status !== 'ok' && s.access_status !== 'paywall' && !s.archive_url) {
      out.push(
        finding(
          'R4_source_indisponible_sans_archive',
          'alerte',
          c.case_id,
          `source ${s.access_status} sans URL d'archive`,
          s.url
        )
      );
    }
  }

  // Accessibilité — distincte de la crédibilité (contrat éditorial §4).
  // Une source payante est légitime ; ce qui ne l'est pas, c'est qu'AUCUNE
  // source ouverte ne permette au lecteur de vérifier l'affirmation.
  const ouvertes = sources.filter((s) => !estPayant(s));
  if (sources.length > 0 && ouvertes.length === 0) {
    out.push(
      finding(
        'R4_aucune_source_accessible',
        'bloquant',
        c.case_id,
        'toutes les sources sont à accès restreint — aucune vérification possible par le lecteur',
        sources.map((s) => s.media).join(', ')
      )
    );
  }

  return out;
}

/** R5 — invariants de publication (contrat de données §1). */
export function rulePublicationInvariants(c) {
  const out = [];
  const publiee = c.publication_status === 'publiée' || c.publication_status === undefined;

  if (!STATUTS.includes(c.statut_judiciaire)) {
    out.push(
      finding('R5_statut_inconnu', 'bloquant', c.case_id, 'statut_judiciaire hors énumération', String(c.statut_judiciaire))
    );
  }

  if (publiee && c.statut_judiciaire === 'relaxe / non-lieu / classement') {
    out.push(
      finding(
        'R5_relaxe_encore_publiee',
        'bloquant',
        c.case_id,
        'issue favorable (relaxe / non-lieu / classement) mais fiche toujours publiée — retrait requis'
      )
    );
  }

  if (publiee && c.statut_judiciaire === 'à qualifier') {
    out.push(
      finding('R5_a_qualifier_publiee', 'bloquant', c.case_id, 'statut « à qualifier » incompatible avec la publication')
    );
  }

  if (publiee && !c.verified_at) {
    out.push(finding('R5_verified_at_absent', 'alerte', c.case_id, 'fiche publiée sans date de vérification humaine'));
  }

  return out;
}

/** R6 — fraîcheur de `verified_at` selon le statut. */
export function ruleFreshness(c, today) {
  if (!c.verified_at) return [];
  const d = parseDate(c.verified_at);
  if (!d) {
    return [finding('R6_verified_at_invalide', 'alerte', c.case_id, 'verified_at illisible', String(c.verified_at))];
  }
  const seuil = FRAICHEUR_JOURS[c.statut_judiciaire];
  if (!seuil) return [];
  const age = daysBetween(d, today);
  if (age > seuil) {
    return [
      finding(
        'R6_fiche_perimee',
        'alerte',
        c.case_id,
        `vérifiée il y a ${age} j — seuil ${seuil} j pour « ${c.statut_judiciaire} »`,
        c.verified_at
      ),
    ];
  }
  return [];
}

/**
 * R7 — cohérence statut ↔ chronologie, et détection des transitions
 * régressives. Une régression n'est PAS une erreur : c'est une priorité
 * de revue (contrat éditorial §3).
 */
export function ruleTransitions(c) {
  const out = [];
  const events = (c.events || [])
    .filter((e) => e.statut_apres)
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));

  if (events.length === 0) return out;

  const dernier = events[events.length - 1];
  if (c.statut_judiciaire && dernier.statut_apres !== c.statut_judiciaire) {
    out.push(
      finding(
        'R7_statut_divergent',
        'alerte',
        c.case_id,
        `statut de la fiche « ${c.statut_judiciaire} » ≠ dernier événement « ${dernier.statut_apres} »`,
        dernier.event_date
      )
    );
  }

  for (let i = 1; i < events.length; i++) {
    const a = AVANCEMENT[events[i - 1].statut_apres];
    const b = AVANCEMENT[events[i].statut_apres];
    if (a === undefined || b === undefined) continue;
    if (b === -1) {
      out.push(
        finding(
          'R7_issue_favorable',
          'alerte',
          c.case_id,
          'issue favorable ou contradictoire — revue prioritaire',
          `${events[i - 1].statut_apres} → ${events[i].statut_apres} (${events[i].event_date})`
        )
      );
    } else if (b < a) {
      out.push(
        finding(
          'R7_transition_regressive',
          'alerte',
          c.case_id,
          'transition régressive — revue prioritaire',
          `${events[i - 1].statut_apres} → ${events[i].statut_apres} (${events[i].event_date})`
        )
      );
    }
  }

  for (const e of c.events || []) {
    if (!e.source_id && !e.source_url) {
      out.push(
        finding('R7_evenement_non_source', 'bloquant', c.case_id, 'événement publiable sans source', e.libelle_public || e.event_type)
      );
    }
  }

  return out;
}

/** R8 — affirmations sensibles sourcées et justifiées. */
export function ruleClaims(c) {
  const out = [];
  for (const cl of c.claims || []) {
    if (cl.sensitivity !== 'sensible') continue;
    if (!cl.source_id) {
      out.push(finding('R8_claim_sans_source', 'bloquant', c.case_id, 'affirmation sensible sans source', cl.claim_text));
    } else if (!cl.justifying_quote || !String(cl.justifying_quote).trim()) {
      out.push(
        finding('R8_claim_sans_passage', 'bloquant', c.case_id, 'affirmation sensible sans passage justificatif', cl.claim_text)
      );
    }
  }
  return out;
}

/** Applique toutes les règles « par fiche ». */
export function checkCase(c, today = new Date()) {
  return [
    ...ruleForbiddenContent(c),
    ...ruleChildCount(c),
    ...ruleDeadlines(c, today),
    ...ruleSources(c),
    ...rulePublicationInvariants(c),
    ...ruleFreshness(c, today),
    ...ruleTransitions(c),
    ...ruleClaims(c),
  ];
}

// ---------------------------------------------------------------------
// Règles « par corpus »
// ---------------------------------------------------------------------

/** R9 — doublons probables. */
export function ruleDuplicates(cases) {
  const out = [];
  const groups = new Map();
  for (const c of cases) {
    if (c.merged_into) continue;
    const key = `${normEtab(c.etablissement)}::${normEtab(c.commune)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const memeRole = a.role_mis_en_cause === b.role_mis_en_cause;
        if (!memeRole) continue; // rôles distincts = affaires distinctes assumées

        const urlsA = new Set((a.sources || []).map((s) => s.url));
        const memeSource = (b.sources || []).some((s) => urlsA.has(s.url));
        const datesA = new Set((a.sources || []).map((s) => s.publication_date).filter(Boolean));
        const memeDate = (b.sources || []).some((s) => s.publication_date && datesA.has(s.publication_date));
        const memesCoords =
          a.lat != null && b.lat != null && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

        const indices = [
          memeSource && 'même URL de source',
          memeDate && 'même date de publication',
          memesCoords && 'coordonnées identiques',
        ].filter(Boolean);

        const severity = memeSource || (memeDate && memesCoords) ? 'bloquant' : 'alerte';
        out.push(
          finding(
            'R9_doublon_probable',
            severity,
            `${a.case_id}/${b.case_id}`,
            `doublon probable (${key}) — ${indices.length ? indices.join(', ') : 'même établissement et même rôle'}`,
            `${a.etablissement} ≡ ${b.etablissement}`
          )
        );
      }
    }
  }
  return out;
}

/**
 * R10 — compteurs dérivés cohérents.
 * @param {object} hub  { hub_id, compteurs? }
 * @param {Array} cases affaires retenues pour ce hub
 */
export function ruleCounters(hub, cases) {
  const out = [];
  const retenues = cases.filter((c) => (c.publication_status ?? 'publiée') === 'publiée');
  const derives = deriveCounters(retenues);

  const somme = Object.values(derives.par_statut).reduce((a, b) => a + b, 0);
  if (somme !== derives.affaires) {
    out.push(
      finding('R10_somme_statuts', 'bloquant', hub.hub_id, `somme des statuts (${somme}) ≠ nombre d'affaires (${derives.affaires})`)
    );
  }

  if (hub.compteurs) {
    for (const [k, v] of Object.entries(hub.compteurs)) {
      if (derives[k] !== undefined && derives[k] !== v) {
        out.push(
          finding('R10_compteur_saisi_divergent', 'bloquant', hub.hub_id, `compteur « ${k} » saisi à ${v}, dérivé à ${derives[k]}`)
        );
      }
    }
  }

  if (derives.affaires < 4) {
    out.push(
      finding('R10_zone_ineligible', 'bloquant', hub.hub_id, `${derives.affaires} affaire(s) publiée(s) — seuil d'éligibilité : 4`)
    );
  }

  return out;
}

/** Calcul canonique des compteurs d'un hub (contrat de données §5). */
export function deriveCounters(cases) {
  const retenues = cases.filter((c) => (c.publication_status ?? 'publiée') === 'publiée');
  const par_statut = {};
  for (const c of retenues) par_statut[c.statut_judiciaire] = (par_statut[c.statut_judiciaire] || 0) + 1;
  const verifs = retenues.map((c) => c.verified_at).filter(Boolean).sort();
  return {
    affaires: retenues.length,
    etablissements: new Set(retenues.map((c) => normEtab(c.etablissement))).size,
    par_statut,
    derniere_verif: verifs.length ? verifs[0] : null,
    echeances_futures: retenues.reduce((n, c) => n + (c.events || []).filter((e) => e.is_future).length, 0),
  };
}
