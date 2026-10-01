// =====================================================================
// experiments/source-understanding-2/contrat.mjs
//
// Contrat de compréhension v2 — écrit AVANT le choix des modèles et
// AVANT tout résultat, pour SOURCE_UNDERSTANDING #2.
//
// Ce fichier est un artefact d'expérience. Il ne remplace PAS
// scripts/lib/comprendre-source.mjs et n'est branché nulle part.
//
// CE QUI A ÉTÉ RETIRÉ PAR RAPPORT À LA v1, ET POURQUOI
// ----------------------------------------------------
// La v1 portait huit règles dont quatre répondaient littéralement à un
// piège de son propre gold set — sa règle 8 (« ignore les victimes
// adultes ») était la réponse mot pour mot à l'article de relaxe de
// l'école Baudin. Les scores v1 étaient donc optimistes pour tous les
// modèles. Cette règle est SUPPRIMÉE ici : le périmètre « mineurs » est
// énoncé une fois dans la description de l'observatoire, et il revient
// au moteur d'en tirer les conséquences.
//
// CE QUI EST CONSERVÉ, ET POURQUOI CE N'EST PAS UNE FUITE
// -------------------------------------------------------
// Deux règles viennent de SOURCE_EVIDENCE #1, où elles ont été établies
// sur 14 évolutions réelles SANS recours à ce gold set :
//   - nommer l'établissement ET la commune est le critère discriminant
//     de rattachement ;
//   - l'autorité qui a accompli un acte est la source suffisante de cet
//     acte ; une partie qui annonce son intention ne l'est pas.
// Ce sont des critères de doctrine, antérieurs et extérieurs au corpus.
//
// La définition des quatre actions est une DÉFINITION DE CONTRAT : sans
// elle l'étiquette attendue serait indéterminée. Elle est donc énoncée,
// et déclarée comme telle dans le rapport.
// =====================================================================

import { createHash } from 'node:crypto';

const SCHEMA = `{
  "relevant_to_case": true | false | "AMBIGU",
  "claim": "une phrase factuelle, atomique, que CE document soutient réellement" | null,
  "scope": "PERSON" | "ESTABLISHMENT" | "GROUP_OF_ESTABLISHMENTS" | "TERRITORY" | "NATIONAL" | "UNKNOWN",
  "event_type": "plainte" | "enquête" | "garde_à_vue" | "mise_en_examen" | "suspension" | "audience" | "délibéré" | "décision" | "voie_de_recours" | "mesure_institutionnelle" | "réaction_publique" | null,
  "event_date": "YYYY-MM-DD" | null,
  "resulting_state": "plainte" | "enquête" | "mise en examen" | "procès" | "condamnation non définitive" | "condamnation définitive" | "relaxe / non-lieu / classement" | null,
  "appeal": "YES" | "NO_REPORTED" | "UNKNOWN",
  "finality": "DEFINITIVE" | "NON_DEFINITIVE" | "UNKNOWN",
  "expected_action": "NO_CHANGE" | "ENRICHMENT" | "STATE_CHANGE" | "AMBIGUOUS",
  "evidence": ["citation littérale copiée du document"],
  "requires_human_review": true | false
}`;

export const SYSTEME = `Tu analyses un document de presse française pour un observatoire qui suit des affaires de violences sur des MINEURS dans des structures qui les accueillent (écoles, crèches, périscolaire, collèges).

On te donne l'identité d'une affaire suivie, son état judiciaire enregistré, et le corps d'un document. Tu dois dire ce que CE document permet d'affirmer, et ce que cela change pour CETTE affaire.

PRINCIPES
1. Une modification fausse est bien plus grave qu'une demande de relecture humaine. Dans le doute, réponds "AMBIGUOUS" et requires_human_review=true. Ne pas savoir est une réponse acceptable et attendue.
2. Tu n'affirmes que ce que le document écrit. Tu n'utilises aucune connaissance extérieure, même si tu crois connaître l'affaire.
3. "evidence" ne contient que des extraits copiés MOT POUR MOT du document. Jamais de reformulation. Si tu ne peux pas citer, tu ne peux pas affirmer.

RATTACHEMENT
4. Le document porte sur cette affaire s'il désigne le même établissement ET la même commune, ou une entité qui les contient de façon non ambiguë. Un document qui nomme un autre établissement ou une autre commune ne porte pas sur cette affaire : relevant_to_case=false.
5. Si le document ne nomme ni établissement ni commune, tu ne peux pas conclure au rattachement : relevant_to_case="AMBIGU".

PORTÉE (scope) — de quoi le document parle-t-il réellement ?
6. PERSON : un individu identifié (mis en cause, prévenu, condamné).
   ESTABLISHMENT : un établissement nommé.
   GROUP_OF_ESTABLISHMENTS : plusieurs établissements, ou un service commun à plusieurs.
   TERRITORY : une ville, un département, une académie (chiffres agrégés, plan, politique publique).
   NATIONAL : la France entière.
   UNKNOWN : impossible à déterminer.
   Une information vraie au niveau d'un territoire n'est PAS une information sur une affaire particulière.

DATES
7. event_date est la date de l'ÉVÉNEMENT décrit, pas la date de publication. Si le document ne permet pas d'établir la date de l'événement, mets null. Ne la reconstruis pas.

APPEL ET CARACTÈRE DÉFINITIF
8. appeal="YES" seulement si le document rapporte qu'un appel a été effectivement interjeté. L'autorité qui accomplit un acte est une source suffisante pour cet acte ; une partie qui annonce une intention ne l'est pas.
   appeal="NO_REPORTED" si le document traite de la décision sans mentionner d'appel.
   appeal="UNKNOWN" sinon.
9. finality="DEFINITIVE" exige que le document l'établisse explicitement (délai d'appel expiré, décision devenue définitive, arrêt non susceptible de recours). Une absence de mention d'appel, ou une intention déclarée de ne pas faire appel, ne rend PAS une décision définitive. En cas de doute : "UNKNOWN".
10. Des réquisitions, une peine demandée ou une peine encourue ne sont pas une condamnation.

ACTION — définition des quatre sorties
11. STATE_CHANGE : la situation judiciaire de l'affaire change. Cela couvre un changement de resulting_state, mais AUSSI un changement d'appel ou de caractère définitif alors même que l'état resterait libellé pareil.
    ENRICHMENT : le document apporte une information nouvelle et vérifiable (date, quantum, acte procédural, précision) sans changer la situation judiciaire.
    NO_CHANGE : le document n'apporte rien pour cette affaire, ou ne la concerne pas.
    AMBIGUOUS : le document semble pertinent mais ne permet pas de conclure sans risque.

Réponds UNIQUEMENT par un objet JSON conforme à ce schéma, sans aucun texte autour :
${SCHEMA}`;

export const invite = ({ fiche, article }) => `AFFAIRE SUIVIE
case_id: ${fiche.case_id}
établissement: ${fiche.etablissement}
commune: ${fiche.commune}
état judiciaire enregistré: ${fiche.statut_judiciaire}

DOCUMENT
média: ${article.media}
date de publication: ${article.publication_date}

CORPS DU DOCUMENT
"""
${String(article.body || '').slice(0, 14000)}
"""`;

export const CONTRAT_VERSION =
  'contrat-v2+' + createHash('sha256').update(SYSTEME).digest('hex').slice(0, 8);
