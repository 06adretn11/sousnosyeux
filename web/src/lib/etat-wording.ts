// =====================================================================
// web/src/lib/etat-wording.ts
//
// FORMULATION PUBLIQUE DE L'ÉTAT D'UNE AFFAIRE — autorité unique.
//
// Home et hub sont deux profondeurs du même produit : ils doivent dire la
// même chose de l'état judiciaire, avec les mêmes mots. Ce module est le
// seul endroit où cette phrase se construit. Dupliquer la table de wording
// dans chaque gabarit, c'est se garantir deux vérités divergentes.
//
// Propriétés :
//   · déterministe   — mêmes données ⇒ même phrase, à chaque build ;
//   · sans LLM       — aucune génération au rendu ;
//   · sans stockage  — rien de ce fichier ne vit en base.
//
// ATTRIBUTION : quand le média est connu, il est NOMMÉ dans la phrase
// (« Selon Le Dauphiné Libéré, … ») plutôt que masqué derrière « une
// source publique ». Nommer la source est plus informatif, et plus fidèle
// au principe du site : SNY rapporte ce que la presse publie, il ne rend
// pas ses propres conclusions judiciaires.
// =====================================================================

export type SourceAffichee = { media: string; date: string | null; url: string | null };

export type EtatBloc = {
  statut: string;
  date: string | null;
  type_evenement: string | null;
  finalite: string | null;
  suites: string[];
  sources: SourceAffichee[];
} | null;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-06-16 » → « 16 juin 2026 ». Jamais de Date : la chaîne suffit. */
export function dateLongue(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Proposition décrivant l'état, SANS majuscule initiale : elle se compose
 * derrière « Selon <média>, … ». Seuls les statuts réellement présents au
 * corpus sont couverts ; le reste retombe sur un repli prudent.
 */
const CLAUSE: Record<string, (quand: string) => string> = {
  'plainte': (q) => `une plainte a été déposée${q}`,
  'enquête': (q) => `une enquête a été ouverte${q}`,
  'mise en examen': (q) => `une mise en examen a été prononcée${q}`,
  'procès': (q) => `un procès s'est tenu${q}`,
  'condamnation non définitive': (q) => `une condamnation non définitive a été prononcée${q}`,
  'condamnation définitive': (q) => `une condamnation définitive a été prononcée${q}`,
  'relaxe / non-lieu / classement': (q) => `une relaxe, un non-lieu ou un classement a été prononcé${q}`,
};

/**
 * Mention non supprimable tant qu'aucune décision n'est intervenue.
 *
 * Elle est accordée au statut : écrire « la mise en examen ne vaut pas
 * culpabilité » sous une simple plainte serait inexact, et donnerait à
 * lire une étape procédurale qui n'a pas eu lieu.
 */
const MENTION: Record<string, string> = {
  'plainte': 'Le dépôt d’une plainte ne vaut pas culpabilité.',
  'enquête': 'L’ouverture d’une enquête ne vaut pas culpabilité.',
  'mise en examen': 'La mise en examen ne vaut pas culpabilité.',
  'procès': 'La tenue d’un procès ne vaut pas culpabilité.',
};

/**
 * Suites procédurales, depuis les codes de surveillance validés en base.
 * Volontairement génériques : rien dans les données structurées ne dit DE
 * QUI émane le recours, on ne l'invente donc pas.
 */
const SUITE: Record<string, string> = {
  APPEL_EN_COURS: "Un appel a été formé : la décision n'est pas définitive et la procédure se poursuit.",
  POURVOI_EN_COURS: "Un pourvoi a été formé : la décision n'est pas définitive.",
};

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * La source à citer : celle de l'état validé si elle existe, sinon la
 * source principale de l'affaire.
 *
 * La distinction compte. La source d'un ÉTAT soutient précisément
 * l'affirmation affichée ; la source principale d'une affaire n'est que sa
 * référence d'origine, qui peut dater d'une étape antérieure.
 */
export function sourceAffichee(etat: EtatBloc, principale: SourceAffichee | null): SourceAffichee | null {
  if (etat?.sources?.length) return etat.sources[0];
  return principale && principale.media ? principale : null;
}

/**
 * Les phrases de la synthèse d'état, dans l'ordre d'affichage.
 *
 * @param statut  statut judiciaire de la fiche
 * @param etat    bloc `etat` projeté, ou null si l'affaire n'a pas encore
 *                d'événement validé
 * @param source  média à créditer, ou null s'il est inconnu
 */
export function phrasesEtat(statut: string, etat: EtatBloc, source: SourceAffichee | null): string[] {
  const clause = CLAUSE[etat?.statut ?? statut];
  if (!clause) {
    // Repli prudent : statut non couvert (ex. « à qualifier »).
    return source
      ? [`Selon ${source.media}, des faits ont été signalés ; la qualification reste à préciser.`]
      : ['Une source publique rapporte des faits signalés.'];
  }

  // La date n'est affichée que si elle qualifie l'ÉTAT lui-même. La date de
  // publication d'un article ne date pas l'événement : les confondre ferait
  // dire à la page qu'une décision a été rendue le jour de sa parution.
  const quand = etat?.date ? ` le ${dateLongue(etat.date)}` : '';

  const lignes = [
    source
      ? `Selon ${source.media}, ${clause(quand)}.`
      : `${majuscule(clause(quand))} selon une source publique.`,
  ];

  // Un appel sur une RELAXE ne doit jamais laisser croire à une relaxe acquise :
  // la phrase nomme la décision attaquée. (POC-05, POC-09.)
  const cible = etat?.statut ?? statut;
  const suites = (etat?.suites ?? []).map((s) => {
    if (s === 'APPEL_EN_COURS' && cible === 'relaxe / non-lieu / classement') {
      return "Un appel a été formé contre cette relaxe : elle n'est pas définitive et la procédure se poursuit.";
    }
    if (s === 'APPEL_EN_COURS' && cible.startsWith('condamnation')) {
      return "Un appel a été formé contre cette condamnation : elle n'est pas définitive et la procédure se poursuit.";
    }
    return SUITE[s];
  }).filter(Boolean);
  if (suites.length) lignes.push(suites.join(' '));
  else if (etat?.finalite === 'non_definitive') lignes.push("Cette décision n'est pas définitive.");

  const mention = MENTION[etat?.statut ?? statut];
  if (mention) lignes.push(mention);

  return lignes;
}
