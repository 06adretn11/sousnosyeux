// =====================================================================
// scripts/lib/rattacher-sources.mjs — ATTACH → Neon.
//
// Ajoute des sources à une affaire EXISTANTE, corrige éventuellement la date d'une source déjà enregistrée,
// et consigne le rapprochement dans `reviews`. Une seule instruction SQL : tout ou rien.
//
// Ce que cette fonction NE fait PAS : changer l'état judiciaire, l'établissement, la publication.
// Une évolution (nombre de plaintes, nom apparu dans un seul média) est consignée dans le commentaire,
// jamais promue en fait de la fiche.
// Idempotente : une source déjà présente (même URL) n'est pas dupliquée ; la revue est balisée.
// =====================================================================

/**
 * @param {object} sql
 * @param {{case_id:string, sources:{url:string,media:string,d:string|null}[], par:string, balise:string, commentaire:string,
 *          corrections?:{url:string,date:string}[], ecrire?:boolean}} o
 */
export async function rattacherSources(sql, { case_id, sources, par, balise, commentaire, corrections = [], ecrire = true }) {
  const [existe] = await sql`select 1 as x from cases where case_id = ${case_id}`;
  if (!existe) throw new Error(`affaire ${case_id} introuvable`);
  const [dejaFait] = await sql`select 1 as x from reviews where case_id = ${case_id} and comment like ${balise + '%'}`;
  if (dejaFait) return { deja: true, ajoutees: 0, corrigees: 0 };

  const connues = new Set((await sql`select url from sources where case_id = ${case_id}`).map((r) => r.url));
  const nouvelles = sources.filter((s) => !connues.has(s.url));
  const aCorriger = corrections.filter((c) => connues.has(c.url));
  if (!ecrire) return { deja: false, ajoutees: nouvelles.length, corrigees: aCorriger.length, plan: { nouvelles, aCorriger } };

  await sql`
    with s as (
      insert into sources (case_id, url, media, publication_date, source_type, is_primary)
      select ${case_id}, x.url, x.media, x.d::date, 'presse', false
        from jsonb_to_recordset(${JSON.stringify(nouvelles)}::jsonb) as x(url text, media text, d text)
      returning 1),
    u as (
      update sources set publication_date = x.date::date
        from jsonb_to_recordset(${JSON.stringify(aCorriger)}::jsonb) as x(url text, date text)
       where sources.case_id = ${case_id} and sources.url = x.url
      returning 1)
    insert into reviews (case_id, reviewed_by, decision, comment)
    values (${case_id}, ${par}, 'validé', ${balise + ' ' + commentaire})`;
  return { deja: false, ajoutees: nouvelles.length, corrigees: aCorriger.length };
}
