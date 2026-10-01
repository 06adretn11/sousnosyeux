// =====================================================================
// scripts/lib/persist-etat-affaire.mjs
//
// Persistance dans Neon de ce que produit la primitive `etat-affaire`, et
// des décisions humaines rendues dessus.
//
// ---------------------------------------------------------------------
// INVARIANTS
// ---------------------------------------------------------------------
// 1. `publication_status` n'est JAMAIS touché ici. Retirer ou afficher une
//    fiche est une décision de présentation, prise par le contrat éditorial
//    à partir des faits ; ce module ne persiste que des faits et la décision
//    qui les accepte. Un test vérifie cet invariant.
// 2. Idempotent : rejouer la même primitive sur le même article et la même
//    affaire ne crée pas de seconde proposition, et ré-appliquer une décision
//    déjà appliquée n'écrit pas de second événement.
// 3. Rien n'est détruit en silence. `cases.statut_judiciaire` évolue, mais
//    l'état précédent reste lisible dans `state_proposals.statut_avant` et le
//    fait daté dans `case_events`, qui est append-only par trigger.
// 4. Tout événement écrit cite l'article qui le fonde.
// =====================================================================

export const DECISIONS = Object.freeze(['ACCEPT', 'REJECT', 'REVIEW_REQUIRED']);

/** Correspondance type d'événement de la primitive -> enum `case_event_type`. */
const TYPE_EVENEMENT = {
  relaxe: 'décision',
  condamnation: 'décision',
  mise_en_examen: 'mise_en_examen',
  plainte: 'plainte',
  enquete: 'enquête',
  proces: 'audience',
};

/** Enregistre (ou retrouve) un article du registre. Idempotent. */
export async function assurerArticle(sql, article) {
  const rows = await sql`
    insert into articles (
      article_id, media, publication_date, url, url_exposante,
      source_ref, content_fingerprint, eligibility_status, supported_claims
    ) values (
      ${article.article_id}, ${article.media}, ${article.publication_date || null},
      ${article.url || null}, ${article.url_exposante === true},
      ${article.source_ref ? JSON.stringify(article.source_ref) : null},
      ${article.content_fingerprint},
      ${article.eligibility_status || 'LU_PAR_OUTILLAGE'},
      ${JSON.stringify(article.supported_claims || [])}
    )
    on conflict (article_id) do update
      set media = excluded.media,
          publication_date = excluded.publication_date,
          url = excluded.url,
          url_exposante = excluded.url_exposante,
          source_ref = excluded.source_ref,
          supported_claims = excluded.supported_claims
    returning article_id, content_fingerprint`;
  return rows[0];
}

/**
 * Enregistre une proposition produite par la primitive.
 * Idempotent sur (case_id, article_id, content_fingerprint, primitive_version).
 *
 * @returns {{proposal_id, deja_presente: boolean, ...}}
 */
export async function enregistrerProposition(sql, r) {
  const change = r.PROPOSED_CHANGE === 'NO_CHANGE' ? null : r.PROPOSED_CHANGE;

  const inserted = await sql`
    insert into state_proposals (
      case_id, article_id, content_fingerprint, primitive_version,
      statut_avant, statut_propose, event_date, source_date,
      transition, finalite, rationale, surveillance, inconnues,
      payload, requires_human_review,
      engine, analysis_action, facts
    ) values (
      ${r.case_id}, ${r.article_id}, ${r.content_fingerprint}, ${r.version},
      ${r.CURRENT_STATE ? r.CURRENT_STATE.statut_judiciaire : null},
      ${r.statut_propose || null},
      ${r.EVENT_DATE || null},
      ${r.SOURCE_DATE || null},
      ${r.transition || null},
      ${r.finalite || null},
      ${r.RATIONALE},
      ${JSON.stringify(r.surveillance || [])},
      ${JSON.stringify(r.inconnues || [])},
      ${JSON.stringify(r)},
      ${r.REQUIRES_HUMAN_REVIEW === true},
      ${r.engine || null},
      ${r.analysis_action || null},
      ${JSON.stringify(r.facts || [])}
    )
    on conflict (case_id, article_id, content_fingerprint, primitive_version)
      do nothing
    returning proposal_id`;

  if (inserted.length) {
    return { proposal_id: inserted[0].proposal_id, deja_presente: false };
  }

  // Déjà là : on rend la ligne existante sans rien réécrire.
  const rows = await sql`
    select proposal_id, decision, decided_by, decided_at, applied_event_id
    from state_proposals
    where case_id = ${r.case_id}
      and article_id = ${r.article_id}
      and content_fingerprint = ${r.content_fingerprint}
      and primitive_version = ${r.version}`;
  return { ...rows[0], deja_presente: true };
}

/**
 * Rend une décision humaine sur une proposition.
 *
 * ACCEPT  -> consigne l'événement daté et fait évoluer `statut_judiciaire`.
 * REJECT / REVIEW_REQUIRED -> trace la décision, n'écrit aucun événement.
 *
 * @returns {{proposal_id, decision, event_id: string|null, deja_appliquee: boolean}}
 */
export async function decider(sql, { proposal_id, decision, decided_by, comment = null }) {
  if (!DECISIONS.includes(decision)) {
    throw new Error(`décision inconnue « ${decision} » — attendu : ${DECISIONS.join(' | ')}`);
  }
  if (!decided_by || !String(decided_by).trim()) {
    throw new Error('une décision doit être signée : `decided_by` est obligatoire');
  }

  const [p] = await sql`
    select proposal_id, case_id, article_id, statut_propose, event_date,
           decision as decision_actuelle, applied_event_id, payload
    from state_proposals where proposal_id = ${proposal_id}`;
  if (!p) throw new Error(`proposition introuvable : ${proposal_id}`);

  // Rejouer une décision déjà appliquée ne réécrit rien.
  if (p.decision_actuelle === decision && p.applied_event_id) {
    return {
      proposal_id,
      decision,
      event_id: p.applied_event_id,
      deja_appliquee: true,
    };
  }

  let event_id = p.applied_event_id || null;

  if (decision === 'ACCEPT' && p.statut_propose && !event_id) {
    const payload = typeof p.payload === 'string' ? JSON.parse(p.payload) : p.payload;
    const change = payload.PROPOSED_CHANGE;
    // L'événement à consigner est CELUI QUI A PRODUIT le statut proposé,
    // pas le dernier cité par l'article. Un papier qui annonce une
    // condamnation rappelle le procès ensuite : prendre le dernier
    // écrivait `audience` sous un `statut_apres` de condamnation.
    const porteurs = (payload.NEW_EVIDENCE?.events || [])
      .filter((e) => e.statut_apres && !e.is_future && !e.hors_perimetre);
    const dernier = porteurs.find((e) => e.statut_apres === p.statut_propose)
      || porteurs[porteurs.length - 1];
    const typeEvt = TYPE_EVENEMENT[dernier?.event_type] || 'décision';

    const [evt] = await sql`
      insert into case_events (
        case_id, event_date, event_type, statut_apres, libelle_public, article_id
      ) values (
        ${p.case_id}, ${p.event_date || null}, ${typeEvt}::case_event_type,
        ${p.statut_propose}::statut_judiciaire,
        ${change && change !== 'NO_CHANGE' ? change.libelle_public : null},
        ${p.article_id}
      )
      returning event_id`;
    event_id = evt.event_id;

    // L'état de production suit le fait accepté.
    // `publication_status` n'est délibérément pas touché : cf. invariant 1.
    await sql`
      update cases
         set statut_judiciaire = ${p.statut_propose}::statut_judiciaire,
             updated_at = now()
       where case_id = ${p.case_id}`;
  }

  await sql`
    update state_proposals
       set decision = ${decision}::proposal_decision,
           decided_by = ${decided_by},
           decided_at = now(),
           decision_comment = ${comment},
           applied_event_id = ${event_id}
     where proposal_id = ${proposal_id}`;

  return { proposal_id, decision, event_id, deja_appliquee: false };
}

/** Relit l'état d'une affaire depuis Neon. */
export async function relireEtat(sql, case_id) {
  const [etat] = await sql`
    select * from case_state_current where case_id = ${case_id}`;
  const evenements = await sql`
    select event_date, event_type, statut_apres, libelle_public, article_id, recorded_at
    from case_events where case_id = ${case_id}
    order by event_date nulls last, recorded_at`;
  const propositions = await sql`
    select proposal_id, article_id, statut_avant, statut_propose, transition,
           finalite, decision, decided_by, decided_at, applied_event_id
    from state_proposals where case_id = ${case_id}
    order by created_at`;
  return { etat, evenements, propositions };
}

/** Le schéma minimal est-il en place ? */
export async function schemaPresent(sql) {
  const rows = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('articles','case_events','state_proposals')`;
  const vues = await sql`
    select table_name from information_schema.views
    where table_schema = 'public' and table_name = 'case_state_current'`;
  const presentes = rows.map((r) => r.table_name).concat(vues.map((v) => v.table_name));
  const attendues = ['articles', 'case_events', 'state_proposals', 'case_state_current'];
  return {
    complet: attendues.every((t) => presentes.includes(t)),
    presentes,
    manquantes: attendues.filter((t) => !presentes.includes(t)),
  };
}
