#!/usr/bin/env node
// =====================================================================
// scripts/rejeu-ecartees.mjs — rejeu HORS PRODUCTION des propositions écartées par le notifier (audit du 21/11/2026)
//
//   NEON_DATABASE_URL=… node scripts/rejeu-ecartees.mjs [--sortie <fichier.json>]
//
// LECTURE SEULE (SELECT uniquement) : aucune écriture, aucun envoi, aucun modèle. Affiche des COMPTEURS ; le détail (identifiants
// de proposition de 8 caractères, libellés fermés, motif) va dans le fichier de sortie, à GARDER HORS du dépôt public.
// =====================================================================
import { writeFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { dossierFiche } from './lib/fiche-page.mjs';
import { classerEcartee } from './lib/rejeu-ecartees.mjs';
import { memeFait } from './lib/nouveaute.mjs';

const { sql } = connecter();
const sortie = process.argv.includes('--sortie') ? process.argv[process.argv.indexOf('--sortie') + 1] : null;
const lignes = await sql`
  select p.proposal_id::text pid, p.case_id, p.analysis_action aa, p.statut_avant::text avant, p.event_date::text ed, c.statut_judiciaire::text courant,
         p.facts, p.payload->>'rattachement' rat, a.publication_date::text pd, a.url
    from state_proposals p join cases c using (case_id) left join articles a using (article_id)
   where p.decision is null and p.analysis_action in ('ENRICHMENT', 'STATE_CHANGE')
     and exists (select 1 from telegram_envois t where t.cle in (p.proposal_id::text, p.proposal_id::text || '#suite') and t.message_id is null)
     and not exists (select 1 from telegram_envois t where t.cle in (p.proposal_id::text, p.proposal_id::text || '#suite') and t.message_id is not null)
   order by p.created_at`;
const memoireDe = new Map(), soumisDe = new Map();
for (const id of new Set(lignes.map((l) => l.case_id))) {
  memoireDe.set(id, await sql`select event_type::text event_type, event_date::text event_date, null::text event_period, libelle_public from case_events where case_id = ${id} and libelle_public is not null
                              union all select f.fait->>'event_type', f.fait->>'event_date', f.fait->>'event_period', f.fait->>'libelle_public'
                                          from state_proposals q cross join lateral jsonb_array_elements(q.facts) f(fait) where q.case_id = ${id} and q.decision = 'ACCEPT'`);
  const ouvertes = await sql`select q.facts from state_proposals q where q.case_id = ${id} and q.decision is null and q.analysis_action = 'ENRICHMENT'
                              and exists (select 1 from telegram_envois t where t.kind = 'decision' and t.cle = q.proposal_id::text and t.message_id is not null)`;
  soumisDe.set(id, ouvertes.flatMap((q) => (Array.isArray(q.facts) ? q.facts : [])));
}
const vusNouveaux = [];   // dédoublonnage ENTRE écartées, au niveau du FAIT : un fait nouveau n'est compté qu'une fois
const resultats = lignes.map((l) => {
  const r = classerEcartee({ ...l }, { memoire: memoireDe.get(l.case_id), soumis: soumisDe.get(l.case_id), dossier: dossierFiche(l.case_id)?.d ?? null });
  let classe = r.classe, motif = r.motif;
  if (classe === 'NOUVEAU') {
    const neufs = r.faits.filter((f) => !vusNouveaux.some((v) => v.case_id === l.case_id && memeFait(v.f, f)));
    r.faits.forEach((f) => vusNouveaux.push({ case_id: l.case_id, f }));
    if (!neufs.length) { classe = 'DEJA_SOUMIS'; motif = 'même fait déjà proposé par une autre écartée du rejeu (un fait = une demande)'; }
  }
  return { k: l.pid.slice(0, 8), case_id: l.case_id, action: l.aa, classe, motif, faits: r.faits.map((f) => ({ mesure: f.mesure, libelle: f.libelle_public, date: f.event_date, periode: f.event_period, realisation: f.realisation })) };
});
const compte = {}; for (const r of resultats) compte[r.classe] = (compte[r.classe] || 0) + 1;
console.log(`propositions écartées sans message (rejeu) : ${resultats.length}`);
for (const [k, v] of Object.entries(compte).sort()) console.log(`  ${k.padEnd(14)} ${v}`);
if (sortie) { writeFileSync(sortie, JSON.stringify(resultats, null, 1)); console.log(`détail → ${sortie} (à garder hors du dépôt)`); }
