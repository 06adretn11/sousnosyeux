// =====================================================================
// scripts/lib/alerte-clic.mjs — classer l'issue d'un job `sny-telegram` en échec, et dire la vérité à l'éditeur.
//
// Cas fondateur (11/10/2026) : le clic ATTACH sur 2e159d7b est APPLIQUÉ (étape 3 réussie, applied_at posé) ; l'étape 4 échoue
// ensuite pour une AUTRE affaire (projection de FR-2026-0115). L'alerte générique disait « le traitement a ÉCHOUÉ… re-clique » :
// faux. Règle : l'APPLICATION MÉTIER (enregistrer, appliquer) et les étapes SECONDAIRES (projeter, QA, publier, vérifier) sont
// classées séparément. Fonction pure : entrée = `outcome` de chaque étape GitHub (success | failure | skipped | cancelled).
//
// Second cas (16/11/2026, FR-2026-0148 / FR-2026-0144) : l'alerte « QA avant publication · contrôle du site servi » ne disait ni QUELLE
// fiche, ni quel contrôle, ni que « rien n'a été publié » ne valait que pour CE passage. Elle dit désormais : l'objet (fiche, proposition),
// l'étape et le contrôle en cause, l'état de la décision déjà enregistrée, la conséquence exacte, et la reprise SEULEMENT si elle existe.
// =====================================================================

const METIER = [
  ['enregistrer', 'enregistrement du clic'],
  ['simples', 'application des décisions simples'],
  ['discovery', 'application de la décision à Neon'],
];
// Étapes secondaires : conséquence RÉELLE de leur échec, jamais « ta décision a échoué ». 3e élément : la publication est BLOQUÉE (rien n'a atteint le site) ;
// sinon elle a été poussée mais le site servi n'est pas (encore) vérifié. Le périmètre de « rien publié » est celui de CE passage : les pages déjà en ligne ne bougent pas.
const SECONDAIRES = {
  projection: ['projection des évolutions d’affaires déjà publiques', 'le site public n’a pas été modifié par ce passage (les pages déjà en ligne restent telles quelles) ; QA, publication et vérification n’ont pas tourné', true],
  qa: ['QA avant publication', 'ce passage n’a rien publié : le site n’a pas été mis à jour et les pages déjà en ligne restent telles quelles', true],
  publier: ['publication de la projection', 'le site n’a pas été mis à jour par ce passage (les pages déjà en ligne restent telles quelles)', true],
  reconcile: ['réconciliation de la publication', 'aucune nouvelle affaire n’a été publiée par ce passage', true],
  controle: ['contrôle du site servi', 'la publication a été poussée mais le contenu servi n’est pas encore (ou plus) conforme à ce qui a été autorisé : aucun « Publié et vérifié » n’est annoncé tant que ce contenu n’est pas contrôlé', false],
  verifier: ['vérification du site public', 'la publication a eu lieu mais le site public n’a pas pu être vérifié : à contrôler', false],
};
const REPRISE = 'le prochain passage planifié de sny-clics (toutes les 30 min ; GitHub peut le retarder) rejoue ces étapes sans nouveau clic ; il échouera de nouveau tant que la cause n’est pas corrigée.';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const court = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

/** « FR-2026-0144 — approbation de la page (fe3f3ae8, ACCEPT) » ; objets = [{ id, nature, cle, decision }]. */
export function libelleObjets(objets = []) {
  return objets.map((x) => [x.id, x.nature && `— ${x.nature}`, x.cle && `(${x.cle}${x.decision ? `, ${x.decision}` : ''})`].filter(Boolean).join(' ')).join(' ; ');
}

/**
 * @param {Record<string,string>} o  outcomes par clé d'étape ; une clé absente = 'skipped'
 * @param {{objets?: {id:string, nature?:string, cle?:string, decision?:string}[], controles?: string[], ecartsSite?: string[], enregistreA?: string|null}} [ctx]
 *   contexte lu par le script (journal de clics, journaux des étapes QA / site servi) ; absent = message sans objet nommé
 */
export function classerEchecClic(o = {}, ctx = {}) {
  const r = (k) => o[k] || 'skipped';
  const quoi = libelleObjets(ctx.objets || []);
  const metierKo = METIER.find(([k]) => r(k) !== 'success');
  if (metierKo) {
    return {
      decisionAppliquee: false,
      texte: `⚠️ Ta décision${quoi ? ` (${esc(quoi)})` : ''} n’a PAS été appliquée : échec de l’étape « ${metierKo[1]} » (run GitHub sny-telegram). ` +
        'Le callback complet est conservé dans l’entrée du run. Tu peux re-cliquer (l’application est idempotente) ou me le dire.',
    };
  }
  const ko = Object.entries(SECONDAIRES).filter(([k]) => r(k) === 'failure');
  const bloque = ko.some(([, v]) => v[2]);
  const detail = ko.length
    ? ko.map(([, [nom, suite]]) => `« ${nom} » — conséquence : ${suite}`).join(' ; ')
    : 'étape secondaire non identifiée (voir le run GitHub sny-telegram)';
  const lignes = [
    ko.length ? `${bloque ? '⛔ <b>Publication BLOQUÉE</b>' : '⚠️ <b>Publication NON VÉRIFIÉE</b>'}${quoi ? ` — ${esc(quoi)}` : ''}` : '',
    '✅ Ta décision a bien été enregistrée et appliquée' + (ctx.enregistreA ? ` (${esc(ctx.enregistreA)})` : '') + ' : ne re-clique pas, il n’y a rien à refaire.',
    `⚠️ Seule une étape secondaire a échoué : ${esc(detail)}. Cela n’affecte pas ta décision.`,
    ...(ctx.controles?.length ? [`Contrôle en cause : ${ctx.controles.slice(0, 3).map((x) => esc(court(x, 200))).join(' ; ')}`] : []),
    ...(ctx.ecartsSite?.length ? [`Écart constaté sur le site servi : ${ctx.ecartsSite.slice(0, 3).map((x) => esc(court(x, 160))).join(' ; ')}`] : []),
    ...(ko.length ? [`Reprise : ${REPRISE}`] : []),
  ].filter(Boolean);
  return { decisionAppliquee: true, texte: lignes.join('\n') };
}
