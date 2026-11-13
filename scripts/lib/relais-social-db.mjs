// =====================================================================
// scripts/lib/relais-social-db.mjs — le PORT de données du relais social, adossé à Neon. Du SQL et rien d'autre : toute la décision est dans relais-social.mjs.
// `sql` = le client tagged-template de scripts/lib/neon.mjs. Aucune écriture hors des trois tables du relais et du journal de diffusion.
// =====================================================================
import { REVUE_FICHE } from './fiche-page.mjs';

const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
const iso8 = (v) => (v == null ? null : v instanceof Date ? v : new Date(v));

export const ledgerNeon = (sql) => ({
  lire: async (k, c) => (await sql`select * from diffusions_sociales where event_key = ${k} and canal = ${c}`)[0] || null,
  reserver: async (l) => (await sql`insert into diffusions_sociales (event_key, canal, type_event, case_id, etat, texte) values (${l.event_key}, ${l.canal}, ${l.type_event}, ${l.case_id}, 'reserve', ${l.texte}) on conflict do nothing returning event_key`).length === 1,
  maj: async (k, c, p) => sql`update diffusions_sociales set etat = coalesce(${p.etat ?? null}, etat), buffer_post_id = coalesce(${p.buffer_post_id ?? null}, buffer_post_id),
      soumis_at = coalesce(${iso(p.soumis_at)}::timestamptz, soumis_at), envoye_at = coalesce(${iso(p.envoye_at)}::timestamptz, envoye_at),
      permalien = coalesce(${p.permalien ?? null}, permalien), erreur = coalesce(${p.erreur ?? null}, erreur), updated_at = now() where event_key = ${k} and canal = ${c}`,
});

export function portNeon(sql) {
  const prop = (r) => (r ? { ...r, proposal_id: String(r.proposal_id) } : null);
  return {
    /** T0 : ligne unique, lue telle quelle (jamais recalculée). null si absente ou si la table n'existe pas encore. */
    async t0() {
      const [ok] = await sql`select to_regclass('public.relais_social_config') is not null as ok`;
      if (!ok.ok) return null;
      return (await sql`select t0, mode, provenance from relais_social_config where id = 1`)[0] || null;
    },
    async tablesPresentes() {
      const [r] = await sql`select to_regclass('public.relais_social_config') is not null and to_regclass('public.relais_social_propositions') is not null and to_regclass('public.relais_social_exclusions') is not null and to_regclass('public.diffusions_sociales') is not null as ok`;
      return !!r.ok;
    },
    /** Horloge de la base : seule source de T0. */
    async maintenantBase() { return new Date((await sql`select now() as n`)[0].n); },
    async initialiserT0(provenance) {
      const r = await sql`insert into relais_social_config (id, mode, provenance) values (1, 'review', ${provenance}) on conflict (id) do nothing returning t0`;
      return r.length ? new Date(r[0].t0) : null; // null = déjà initialisé : T0 inchangé
    },

    /**
     * Candidats = événements dont TOUS les horodatages de départ sont ≥ T0 (la sélection SQL est un premier filtre ; evaluerCandidat re-contrôle chaque date).
     *   new_case    : découverte (new_case_proposals.created_at) · création de l'affaire (cases.created_at) · approbation de la fiche (reviews « [Fiche approuvée] » de la version courante)
     *   case_update : proposition de maintenance · décision Telegram · enregistrement de l'événement (case_events.recorded_at)
     */
    async candidats(t0) {
      const T = iso(t0);
      const nouvelles = await sql`
        select c.case_id, c.created_at cree_at, c.publication_status::text ps, min(p.created_at) decouverte_at,
               exists (select 1 from reviews r where r.case_id = c.case_id and r.decision = 'retirer') retire
          from cases c join new_case_proposals p on p.created_case_id = c.case_id and p.decision = 'ACCEPT'
         where c.created_at >= ${T}::timestamptz and p.created_at >= ${T}::timestamptz
         group by c.case_id, c.created_at, c.publication_status`;
      const ids = nouvelles.map((n) => n.case_id);
      const revues = ids.length ? await sql`select case_id, reviewed_by, decision::text decision, comment, reviewed_at from reviews where case_id = any(${ids}::text[]) and decision = 'validé' order by reviewed_at, review_id` : [];
      const sortie = nouvelles.map((n) => {
        const approbations = revues.filter((r) => r.case_id === n.case_id && /^Adrien/.test(r.reviewed_by || '') && REVUE_FICHE.test(r.comment || '') && REVUE_FICHE.exec(r.comment)[1] === n.case_id);
        const premiere = approbations[0] ?? null;
        return { type: 'new_case', case_id: n.case_id, decouverte_at: iso8(n.decouverte_at), cree_at: iso8(n.cree_at), fiche_approuvee_at: iso8(premiere?.reviewed_at), fiche_hash: premiere ? REVUE_FICHE.exec(premiere.comment)[2] : null, ps: n.ps, retire: !!n.retire };
      });
      const maj = await sql`
        select p.proposal_id::text pid, p.case_id, p.statut_avant::text avant, p.statut_propose::text apres, p.created_at propose_at, p.decided_at,
               p.applied_event_id::text event_id, e.recorded_at enregistre_at, c.publication_status::text ps,
               exists (select 1 from reviews r where r.case_id = p.case_id and r.decision = 'retirer') retire
          from state_proposals p join cases c using (case_id) join case_events e on e.event_id = p.applied_event_id
         where p.decision = 'ACCEPT' and p.decided_by ilike '%Telegram%' and p.applied_event_id is not null
           and p.decided_at >= ${T}::timestamptz and p.created_at >= ${T}::timestamptz and e.recorded_at >= ${T}::timestamptz
           and p.statut_propose is not null and p.statut_avant is distinct from p.statut_propose`;
      for (const m of maj) sortie.push({ type: 'case_update', case_id: m.case_id, event_id: m.event_id, statut_avant: m.avant, statut_apres: m.apres, propose_at: iso8(m.propose_at), decide_at: iso8(m.decided_at), evenement_enregistre_at: iso8(m.enregistre_at), ps: m.ps, retire: !!m.retire });
      return sortie;
    },

    async propositionParEvenement(k) { return prop((await sql`select * from relais_social_propositions where event_key = ${k}`)[0]); },
    async propositionParCle(cle) { const r = await sql`select * from relais_social_propositions where proposal_id::text like ${cle + '%'}`; return r.length === 1 ? prop(r[0]) : null; },
    async creerProposition(p) {
      const r = await sql`insert into relais_social_propositions (event_key, case_id, type_event, identite, texte_x, texte_facebook, canaux_proposes, empreinte_x, empreinte_facebook, expire_at)
        values (${p.event_key}, ${p.case_id}, ${p.type_event}, ${JSON.stringify(p.identite)}::jsonb, ${p.texte_x}, ${p.texte_facebook}, ${p.canaux_proposes}::text[], ${p.empreinte_x}, ${p.empreinte_facebook}, ${iso(p.expire_at)}::timestamptz)
        on conflict (event_key) do nothing returning *`;
      return prop(r[0]);
    },
    /** Envoi Telegram une seule fois : réclamation atomique avant l'appel (-1), identifiant réel après. Une réclamation abandonnée depuis > 30 min est rendue. */
    async reclamerEnvoi(id) {
      await sql`update relais_social_propositions set telegram_message_id = null where proposal_id = ${id}::uuid and telegram_message_id = -1 and created_at < now() - interval '30 minutes'`;
      return (await sql`update relais_social_propositions set telegram_message_id = -1 where proposal_id = ${id}::uuid and telegram_message_id is null and decision is null returning 1 x`).length === 1;
    },
    async noterEnvoi(id, mid) { await sql`update relais_social_propositions set telegram_message_id = ${mid ?? -2} where proposal_id = ${id}::uuid`; },
    async libererEnvoi(id) { await sql`update relais_social_propositions set telegram_message_id = null where proposal_id = ${id}::uuid and telegram_message_id = -1`; },

    /** Une seule décision par proposition ; renvoie true si CE passage l'a enregistrée. */
    async decider(id, { decision, canaux, now, resolution }) {
      return (await sql`update relais_social_propositions set decision = ${decision}, canaux_autorises = ${canaux}::text[], decided_at = ${iso(now)}::timestamptz,
          resolution = ${resolution ?? null}, resolved_at = case when ${resolution ?? null}::text is not null then ${iso(now)}::timestamptz end
        where proposal_id = ${id}::uuid and decision is null returning 1 x`).length === 1;
    },
    async propositionsExpirees(now) { return (await sql`select proposal_id::text proposal_id from relais_social_propositions where decision is null and expire_at < ${iso(now)}::timestamptz`); },
    async propositionsAvecGo() { return (await sql`select * from relais_social_propositions where decision in ('GO_XF', 'GO_F', 'GO_X') and resolution is null order by decided_at`).map(prop); },
    async resoudre(id, resolution) { await sql`update relais_social_propositions set resolution = ${resolution}, resolved_at = now() where proposal_id = ${id}::uuid and resolution is null`; },
    async noterNotif(id, quoi) {
      if (quoi === 'programme') await sql`update relais_social_propositions set notif_programme_at = now() where proposal_id = ${id}::uuid and notif_programme_at is null`;
      else await sql`update relais_social_propositions set notif_publie_at = now() where proposal_id = ${id}::uuid and notif_publie_at is null`;
    },
    async propositionsAConfirmer() { return (await sql`select * from relais_social_propositions where resolution = 'publie' and notif_publie_at is null and created_at > now() - interval '30 days'`).map(prop); },

    async exclusionsDe(k) { return new Set((await sql`select canal from relais_social_exclusions where event_key = ${k}`).map((r) => r.canal)); },
    async empreinteTexteExclue(canal, h) { return (await sql`select 1 x from relais_social_exclusions where canal = ${canal} and empreinte_texte = ${h}`).length > 0; },
    async lignesOuvertes() { return sql`select * from diffusions_sociales where etat in ('reserve', 'soumis', 'programme', 'envoye', 'verifie') and created_at > now() - interval '30 days'`; },
    async etatsAffaires(ids) { return ids.length ? sql`select c.case_id, c.publication_status::text ps, exists (select 1 from reviews r where r.case_id = c.case_id and r.decision = 'retirer') retire from cases c where c.case_id = any(${ids}::text[])` : []; },
    async ledgerDe(k) { return (await sql`select 1 x from diffusions_sociales where event_key = ${k} limit 1`).length > 0; },
    async exclure({ event_key, canal, motif, empreinte_texte = null, permalien = null }) {
      return (await sql`insert into relais_social_exclusions (event_key, canal, motif, empreinte_texte, permalien) values (${event_key}, ${canal}, ${motif}, ${empreinte_texte}, ${permalien}) on conflict do nothing returning 1 x`).length === 1;
    },
    async synthese() {
      const p = await sql`select coalesce(decision, case when resolution is null then 'EN_ATTENTE' else resolution end) etat, type_event, count(*)::int n from relais_social_propositions group by 1, 2 order by 1, 2`;
      const r = await sql`select coalesce(split_part(resolution, ':', 1), '(ouverte)') res, count(*)::int n from relais_social_propositions group by 1 order by 1`;
      const d = await sql`select canal, etat, count(*)::int n from diffusions_sociales group by 1, 2 order by 1, 2`;
      const x = await sql`select event_key, canal from relais_social_exclusions order by 1, 2`;
      return { propositions: p, resolutions: r, diffusions: d, exclusions: x };
    },
  };
}
