// =====================================================================
// scripts/lib/pilote-instagram-neon.mjs — pièces PURES de scripts/pilote-instagram-neon.mjs (testables sans base) :
// instructions de vérification de la migration 028, comparaison d'empreintes, résumé d'aperçu pour des journaux PUBLICS.
// =====================================================================

const doBloc = (corps) => `do $$ begin ${corps} end $$`;
/** Une assertion LÈVE quand sa condition est VRAIE. */
export const assertion = (condition, nom) => doBloc(`if ${condition} then raise exception 'ASSERT_${nom}'; end if;`);
const colonne = (nom) => `select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'pistes_a_qualifier' and column_name = '${nom}'`;
export const ROLLBACK = doBloc(`raise exception 'ROLLBACK_VOLONTAIRE';`);

/** Instructions de vérification, exécutées APRÈS la migration, dans la même transaction, terminée par une annulation volontaire. */
export function verifications() {
  const ins = (id, destination, territoire, hub) => `insert into pistes_a_qualifier (piste_id, doc_key, emetteur, compte_url, url, publie_le, motif, destination, territoire, hub_id, classement, extrait)
    values ('${id}', 'verif|${id}', 'Compte de vérification', null, 'https://exemple.invalid/${id}', '2026-11-17', 'PLAINTE_ACCUEIL', '${destination}', ${territoire}, ${hub}, 'vérification', 'extrait de vérification')`;
  return [
    assertion(`exists (${colonne('case_id')})`, 'CASE_ID_PRESENT'),                                           // aucune affaire
    assertion(`not exists (${colonne('destination')}) or not exists (${colonne('hub_id')}) or not exists (${colonne('classement')})`, 'COLONNES_ABSENTES'),
    assertion(`(select is_nullable from information_schema.columns where table_schema = current_schema() and table_name = 'pistes_a_qualifier' and column_name = 'territoire') <> 'YES'`, 'TERRITOIRE_NON_NULLABLE'), // aucun territoire
    ins('verif-them', 'THEMATIQUE', 'null', 'null'),                                                            // piste thématique : ni affaire, ni territoire, ni hub
    ins('verif-hub-sans', 'HUB', `'Paris'`, 'null'),                                                            // territoire du texte sans hub
    ins('verif-hub', 'HUB', `'Tarnos'`, `'landes'`),
    assertion(`(select count(*) from pistes_a_qualifier where piste_id like 'verif-%') <> 3`, 'DECOMPTE'),
    // le marquage EXACT utilisé par telegram-v0 (envoyee_le, message_id, extrait vidé), avec un tableau d'identifiants
    `update pistes_a_qualifier set envoyee_le = now(), message_id = 4242, extrait = null where piste_id = any(array['verif-them', 'verif-hub-sans', 'verif-hub']) and envoyee_le is null`,
    assertion(`exists (select 1 from pistes_a_qualifier where piste_id like 'verif-%' and (envoyee_le is null or extrait is not null or message_id is null))`, 'MARQUAGE'),
    assertion(`exists (select 1 from pistes_a_qualifier where piste_id = 'verif-them' and (territoire is not null or hub_id is not null))`, 'THEMATIQUE_AVEC_TERRITOIRE'),
    ROLLBACK,
  ];
}

/** Insertion REFUSÉE attendue (destination hors vocabulaire), dans une transaction qui s'annule de toute façon. */
export const insertionInvalide = () => [
  `insert into pistes_a_qualifier (piste_id, doc_key, emetteur, url, motif, destination) values ('verif-invalide', 'verif|x', 'x', 'https://exemple.invalid/x', 'PLAINTE_ACCUEIL', 'AFFAIRE')`,
  ROLLBACK,
];

/** @returns {'refusee'|'acceptee'|'autre'} d'après l'erreur de la transaction d'insertion invalide */
export function issueInsertionInvalide(erreur) {
  const m = `${erreur?.message || ''} ${erreur?.code || ''}`;
  if (/23514|check constraint|violates check/i.test(m)) return 'refusee';
  if (/ROLLBACK_VOLONTAIRE/.test(m)) return 'acceptee'; // l'insertion a PASSÉ : le CHECK ne protège pas
  return 'autre';
}

/** Verdict d'une transaction de vérification d'après l'erreur levée (null = la transaction a abouti, ce qui ne doit pas arriver). */
export function verdictTransaction(erreur) {
  if (!erreur) return { ok: false, detail: 'la transaction a ABOUTI : l\'annulation volontaire n\'a pas eu lieu' };
  const m = String(erreur?.message || erreur);
  if (/ROLLBACK_VOLONTAIRE/.test(m)) return { ok: true, detail: 'toutes les instructions et assertions ont réussi ; transaction annulée volontairement' };
  const a = /ASSERT_[A-Z_]+/.exec(m);
  return { ok: false, detail: a ? `assertion échouée : ${a[0]}` : `erreur SQL : ${m.slice(0, 160)}` };
}

/** Compare deux empreintes de base : toute différence de lignes ou de compteurs d'écriture est une modification. */
export function comparerEmpreintes(avant, apres) {
  const diff = [];
  for (const t of new Set([...Object.keys(avant.lignes), ...Object.keys(apres.lignes)])) {
    if (avant.lignes[t] !== apres.lignes[t]) diff.push(`${t} : ${avant.lignes[t] ?? '∅'} → ${apres.lignes[t] ?? '∅'} lignes`);
    const a = avant.compteurs[t] || [0, 0, 0]; const b = apres.compteurs[t] || [0, 0, 0];
    if (a.some((x, i) => x !== b[i])) diff.push(`${t} : insertions/modifications/suppressions ${a.join('/')} → ${b.join('/')}`);
  }
  return diff;
}

/**
 * Résumé d'un aperçu de cycle pour des journaux PUBLICS : compteurs sans identité (ni compte, ni pseudo, ni adresse), puis, par publication Instagram,
 * date + issue + destination (+ motif et destination proposée d'une piste). Jamais de légende, d'adresse ni de pseudo.
 * @returns {string[]} lignes
 */
export function resumerApercu(a) {
  const X = a?.compteurs || {}; const ig = X.instagram || null;
  const lignes = [];
  lignes.push(`compteurs : ${JSON.stringify({
    instagram: ig ? { appels: ig.appels, budget: ig.budget, arret: ig.arret || null, comptes: (ig.comptes || []).length, en_panne: (ig.comptes || []).filter((c) => !c.ok).length,
      historique_non_couvert: (ig.comptes || []).filter((c) => c.historique_non_couvert).length, publications_lues: (ig.comptes || []).reduce((s, c) => s + (c.publications_lues || 0), 0), ecartees: (ig.comptes || []).reduce((s, c) => s + (c.ecartes || 0), 0) } : null,
    par_issue: X.par_issue, par_destination: X.par_destination, pistes_a_qualifier: X.pistes_a_qualifier || 0, pistes_erreur: X.pistes_erreur || null })}`);
  const posts = (a?.documents || []).filter((d) => /^https:\/\/www\.instagram\.com\/p\//.test(d.url || ''));
  const par = {}; for (const d of posts) par[d.destination || d.issue] = (par[d.destination || d.issue] || 0) + 1;
  lignes.push(`publications Instagram par destination : ${JSON.stringify(par)}`);
  for (const d of posts) lignes.push(`  ${String(d.publie_le || '?').slice(0, 10)} · ${d.issue} · ${d.destination}${d.piste ? ` · ${d.piste.motif_code} → ${d.piste.destination}${d.piste.hub_id ? ` ${d.piste.hub_id}` : ''}` : ''}${(d.propositions || []).length ? ` · propositions : ${d.propositions.map((p) => p.issue).join(',')}` : ''}`);
  return lignes;
}
