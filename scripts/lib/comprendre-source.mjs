// =====================================================================
// scripts/lib/comprendre-source.mjs
//
// « Que dit cette source, et qu'est-ce que cela change pour cette
// affaire ? » — le seul goulot restant de la chaîne de maintenance.
//
// PÉRIMÈTRE RÉEL, ET CE QU'IL N'EST PAS. Ce module répond à « que dit
// cette source sur une AFFAIRE CONNUE ? ». Sa signature exige une fiche,
// et l'invite s'ouvre sur « AFFAIRE SUIVIE / état judiciaire actuel ».
// Il ne peut donc PAS servir tel quel à la découverte de nouvelles
// affaires, qui n'a précisément pas de fiche de rattachement : cela
// demanderait un second contrat, du type « cet article décrit-il une
// affaire nouvelle ? ». La convergence des deux roadmaps sur un moteur
// unique est un objectif, pas une propriété de ce fichier.
//
// MESURE (gold set de 12 paires de prose réelle, 24/09/2026,
// `docs/industrialisation/gold-set-v1.json`, invite de production) :
//
//   moteur                        action  issue inversée  finalité sur-affirmée  citations fabriquées
//   rules (déterministe)           7/12         1                  0                    0
//   google/gemini-2.5-flash-lite   8/12         1                  0                    0
//   qwen/qwen3.7-flash             8/12         0                  2                    1
//   openai/gpt-5-nano              8/12         2                  0                    6
//   mistralai/mistral-small-24b    9/12         1                  7                    2
//
// AUCUN MOTEUR N'EST PROPRE. Les deux colonnes du milieu sont les seules
// qui comptent : proposer une condamnation sur un article de relaxe, ou
// déclarer définitive une décision qui ne l'est pas, sont les deux
// erreurs publiquement irréparables. L'écart d'action (7 à 9 sur 12)
// n'est pas significatif à n=12.
//
// Aucun moteur n'a donc été adopté. La revue humaine est obligatoire sur
// toute sortie. Ce module propose, il ne décide jamais.
//
// Le gold set lui-même est non représentatif — 73 % France Télévisions,
// contre 6 % dans le flux réel — et le prompt ci-dessous a été écrit
// APRÈS l'annotation : ces scores sont optimistes pour tous les modèles.
// =====================================================================

import { createHash } from 'node:crypto';

// La version DOIT bouger quand le prompt bouge : c'est le prompt, bien
// plus que le slug du modèle, qui conditionne les réponses. Une constante
// figée à la main rendait la mémoire d'analyse non révocable sur sa
// variable la plus influente — on aurait pu réécrire `SYSTEME` sans
// qu'aucune analyse passée ne soit rejouée. L'empreinte est donc dérivée
// du prompt lui-même, en fin de fichier, une fois `SYSTEME` défini.
let _version;
export function contratVersion() {
  if (!_version) {
    _version = 'comprendre-source-0.1.0+' + createHash('sha256').update(SYSTEME).digest('hex').slice(0, 8);
  }
  return _version;
}

const SCHEMA = `{
  "relevant_to_case": true | false | "AMBIGU",
  "new_information": true | false,
  "event_type": "plainte" | "enquête" | "garde_à_vue" | "mise_en_examen" | "suspension" | "audience" | "délibéré" | "décision" | "réponse_institutionnelle" | null,
  "event_date": "YYYY-MM-DD" | null,
  "resulting_state": "plainte" | "enquête" | "mise en examen" | "procès" | "condamnation non définitive" | "condamnation définitive" | "relaxe / non-lieu / classement" | null,
  "finality": "definitive" | "non_definitive" | null,
  "appeal": "YES" | "NO_REPORTED" | "UNKNOWN",
  "expected_action": "NO_CHANGE" | "ENRICHMENT" | "STATE_CHANGE" | "AMBIGUOUS",
  "evidence": ["citation littérale de l'article"],
  "requires_human_review": true | false
}`;

export const SYSTEME = `Tu analyses un article de presse française pour un observatoire d'affaires judiciaires concernant des structures accueillant des mineurs.

Tu reçois l'identité d'une affaire suivie, son état judiciaire actuel, et le corps d'un article.
Tu dois dire ce que cet article change, ou ne change pas, pour CETTE affaire précise.

RÈGLES ABSOLUES :
1. Une fausse modification est BIEN PLUS GRAVE qu'une demande de revue humaine. Dans le doute, réponds "AMBIGUOUS" et requires_human_review=true.
2. Si l'article ne porte PAS sur l'affaire décrite (autre établissement, autre commune, autre procédure), relevant_to_case=false et expected_action="NO_CHANGE". Vérifie l'établissement ET la commune.
3. N'invente jamais une date, un appel ou une finalité. Si l'information n'est pas écrite, utilise null ou "UNKNOWN".
4. "evidence" doit contenir des extraits LITTÉRAUX de l'article, copiés mot pour mot. Jamais de paraphrase.
5. event_date est la date de l'ÉVÉNEMENT judiciaire, pas la date de publication de l'article.
6. appeal="YES" seulement si l'article dit qu'un appel a été interjeté ou annoncé.
7. Si l'état énoncé par l'article est déjà celui de la fiche, expected_action="NO_CHANGE" ou "ENRICHMENT" (si l'article apporte une date, un quantum ou une précision procédurale nouvelle), jamais "STATE_CHANGE".
8. Ignore les faits concernant des victimes ADULTES (collègues par exemple) : ils sont hors périmètre.

Réponds UNIQUEMENT par un objet JSON conforme à ce schéma, sans texte autour :
${SCHEMA}`;

export const invite = ({ fiche, article }) => `AFFAIRE SUIVIE
case_id: ${fiche.case_id}
établissement: ${fiche.etablissement}
commune: ${fiche.commune}
état judiciaire actuel: ${fiche.statut_judiciaire}

ARTICLE
média: ${article.media}
date de publication: ${article.publication_date}

CORPS DE L'ARTICLE
"""
${String(article.body || '').slice(0, 12000)}
"""`;

/**
 * Interroge un modèle OpenRouter sur une source.
 *
 * @returns {{reponse: object|null, cout: {latence_ms, input_tokens, output_tokens, cout_usd, erreur_parsing}}}
 */
export async function comprendre({ fiche, article, modele, contrat, cle = process.env.OPENROUTER_API_KEY }) {
  if (!cle) {
    const e = new Error('OPENROUTER_API_KEY absente');
    e.code = 'CLE_ABSENTE';
    throw e;
  }
  // `contrat` permet d'injecter le contrat v2 figé en SOURCE_UNDERSTANDING
  // #2 sans dupliquer son prompt ici : un seul texte, une seule empreinte.
  // Par défaut, le contrat v1 de ce fichier reste actif.
  const SYS = contrat?.SYSTEME ?? SYSTEME;
  const INV = contrat?.invite ?? invite;
  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sousnosyeux.org',
      'X-Title': 'sousnosyeux-source-understanding',
    },
    body: JSON.stringify({
      model: modele,
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: INV({ fiche, article }) }],
      temperature: 0,
      response_format: { type: 'json_object' },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const latence = Date.now() - t0;
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${JSON.stringify(j).slice(0, 200)}`);

  let reponse = null, erreur = false;
  try {
    reponse = JSON.parse(String(j.choices?.[0]?.message?.content ?? '')
      .replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  } catch { erreur = true; }

  return {
    reponse,
    cout: {
      latence_ms: latence,
      input_tokens: j.usage?.prompt_tokens ?? null,
      output_tokens: j.usage?.completion_tokens ?? null,
      cout_usd: j.usage?.cost ?? null,
      erreur_parsing: erreur,
    },
  };
}

/**
 * Les citations rendues existent-elles LITTÉRALEMENT dans l'article ?
 * Une preuve inventée disqualifie l'analyse, quel que soit le reste.
 */
export function evidenceLitterale(reponse, corps) {
  const norm = (s) => String(s).replace(/[\s«»"'’]+/g, ' ').trim().toLowerCase();
  const texte = norm(corps);
  const ev = Array.isArray(reponse?.evidence) ? reponse.evidence : [];
  // Comparaison sur la citation ENTIÈRE. Une première version ne comparait
  // que les 60 premiers caractères : une citation vraie au début et
  // fabriquée ensuite passait le contrôle.
  return ev.filter((e) => e && !texte.includes(norm(e)));
}
