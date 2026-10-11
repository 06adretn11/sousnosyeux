// =====================================================================
// scripts/lib/alerte-clic.mjs — classer l'issue d'un job `sny-telegram` en échec, et dire la vérité à l'éditeur.
//
// Cas fondateur (11/10/2026) : le clic ATTACH sur 2e159d7b est APPLIQUÉ (étape 3 réussie, applied_at posé) ; l'étape 4 échoue
// ensuite pour une AUTRE affaire (projection de FR-2026-0115). L'alerte générique disait « le traitement a ÉCHOUÉ… re-clique » :
// faux. Règle : l'APPLICATION MÉTIER (enregistrer, appliquer) et les étapes SECONDAIRES (projeter, QA, publier, vérifier) sont
// classées séparément. Fonction pure : entrée = `outcome` de chaque étape GitHub (success | failure | skipped | cancelled).
// =====================================================================

const METIER = [
  ['enregistrer', 'enregistrement du clic'],
  ['simples', 'application des décisions simples'],
  ['discovery', 'application de la décision à Neon'],
];
// Étapes secondaires : conséquence RÉELLE de leur échec, jamais « ta décision a échoué ».
const SECONDAIRES = {
  projection: ['projection des évolutions d’affaires déjà publiques', 'le site public n’a pas été modifié ; QA, publication et vérification n’ont pas tourné'],
  qa: ['QA avant publication', 'rien n’a été publié sur le site'],
  publier: ['publication de la projection', 'le site n’a pas été mis à jour'],
  reconcile: ['réconciliation de la publication', 'aucune nouvelle affaire n’a été publiée par ce passage ; elle sera réessayée au prochain passage, sans nouvelle validation'],
  controle: ['contrôle du site servi', 'une affaire annoncée n’est pas encore (ou plus) conforme sur le site ; réessayé au prochain passage'],
  verifier: ['vérification du site public', 'la publication a eu lieu mais le site public n’a pas pu être vérifié : à contrôler'],
};

/** @param {Record<string,string>} o  outcomes par clé d'étape ; une clé absente = 'skipped' */
export function classerEchecClic(o = {}) {
  const r = (k) => o[k] || 'skipped';
  const metierKo = METIER.find(([k]) => r(k) !== 'success');
  if (metierKo) {
    return {
      decisionAppliquee: false,
      texte: `⚠️ Ta décision n’a PAS été appliquée : échec de l’étape « ${metierKo[1]} » (run GitHub sny-telegram). ` +
        'Le callback complet est conservé dans l’entrée du run. Tu peux re-cliquer (l’application est idempotente) ou me le dire.',
    };
  }
  const ko = Object.entries(SECONDAIRES).filter(([k]) => r(k) === 'failure');
  const detail = ko.length
    ? ko.map(([, [nom, suite]]) => `« ${nom} » — conséquence : ${suite}`).join(' ; ')
    : 'étape secondaire non identifiée (voir le run GitHub sny-telegram)';
  return {
    decisionAppliquee: true,
    texte: '✅ Ta décision a bien été enregistrée et appliquée : ne re-clique pas, il n’y a rien à refaire.\n' +
      `⚠️ Seule une étape secondaire a échoué : ${detail}. Cela n’affecte pas ta décision.`,
  };
}
