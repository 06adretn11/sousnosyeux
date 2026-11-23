#!/usr/bin/env node
// =====================================================================
// scripts/rejeu-ecartees.mjs — rejeu HORS PRODUCTION des propositions écartées par le notifier (audit du 21/11/2026)
//
//   NEON_DATABASE_URL=… node scripts/rejeu-ecartees.mjs [--sortie <fichier.json>] [--reference <rejeu-precedent.json>]
//
// LECTURE SEULE (SELECT uniquement) : aucune écriture, aucun envoi, aucun modèle, aucun lancement de cycle. Affiche des COMPTEURS ; le détail (identifiants
// de proposition de 8 caractères, libellés fermés, motif) va dans le fichier de sortie, à GARDER HORS du dépôt public.
//
//   --reference  rejeu précédent (liste d'objets `k` = 8 premiers caractères de proposition) : le PÉRIMÈTRE DE RÉFÉRENCE. Les propositions écartées arrivées depuis sont
//                comptées à part ; une proposition de référence qui n'est plus écartée (décidée, envoyée) est dite avec son nouvel état.
//
// CONTEXTE : une mémoire ou un rattachement absents n'établissent rien. Une proposition dont le verdict de rattachement manque est INDETERMINEE, jamais « sans apport » ni « nouvelle ».
// =====================================================================
import { writeFileSync, readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { dossierFiche } from './lib/fiche-page.mjs';
import { classerEcartee } from './lib/rejeu-ecartees.mjs';
import { memeFait } from './lib/nouveaute.mjs';

const { sql } = connecter();
const arg = (f) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : null);
const sortie = arg('--sortie');
const reference = arg('--reference') ? new Set(JSON.parse(readFileSync(arg('--reference'), 'utf8')).map((x) => x.k)) : null;
const holds = new Set((JSON.parse(readFileSync(new URL('../data/publication-holds.json', import.meta.url), 'utf8')).holds || []).map((h) => h.case_id));
const lignes = await sql`
  select p.proposal_id::text pid, p.case_id, p.analysis_action aa, p.statut_avant::text avant, p.event_date::text ed, c.statut_judiciaire::text courant, p.created_at::text cree,
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
  const k = l.pid.slice(0, 8);
  const contexte = { rattachement: l.rat ?? null, memoire: (memoireDe.get(l.case_id) || []).length, soumis: (soumisDe.get(l.case_id) || []).length, hold: holds.has(l.case_id), date_publication: l.pd ?? null, url: !!l.url };
  const r = classerEcartee({ ...l }, { memoire: memoireDe.get(l.case_id), soumis: soumisDe.get(l.case_id), dossier: dossierFiche(l.case_id)?.d ?? null });
  let classe = r.classe, motif = r.motif;
  // Un verdict de rattachement absent (colonne vide) n'établit ni « sans apport » ni « nouveau » : INDETERMINEE.
  if (l.aa === 'ENRICHMENT' && l.rat == null && classe !== 'DEJA_CONSIGNE') { classe = 'INDETERMINEE'; motif = 'verdict de rattachement absent : rien n’est établi'; }
  // Un rattachement NON ÉTABLI (DOUTEUX) : aucun fait détecté n'établit pas que l'article n'apporte rien à CETTE affaire — il n'a simplement pas été lu pour elle.
  else if (l.aa === 'ENRICHMENT' && l.rat !== 'OK' && classe === 'SANS_APPORT') { classe = 'INDETERMINEE'; motif = `rattachement ${l.rat} : l’absence de fait n’établit pas l’absence d’apport`; }
  if (classe === 'NOUVEAU') {
    const neufs = r.faits.filter((f) => !vusNouveaux.some((v) => v.case_id === l.case_id && memeFait(v.f, f)));
    r.faits.forEach((f) => vusNouveaux.push({ case_id: l.case_id, f }));
    if (!neufs.length) { classe = 'DEJA_SOUMIS'; motif = 'même fait déjà proposé par une autre écartée du rejeu (un fait = une demande)'; }
  }
  return { k, case_id: l.case_id, action: l.aa, cree: l.cree, classe, motif, reference: reference ? reference.has(k) : null, contexte,
    faits: r.faits.map((f) => ({ mesure: f.mesure, libelle: f.libelle_public, date: f.event_date, periode: f.event_period, realisation: f.realisation })) };
});
const compte = (liste) => { const c = {}; for (const r of liste) c[r.classe] = (c[r.classe] || 0) + 1; return c; };
console.log(`propositions écartées sans message (rejeu) : ${resultats.length}${reference ? ` · dans le périmètre de référence : ${resultats.filter((r) => r.reference).length} · arrivées depuis : ${resultats.filter((r) => !r.reference).length}` : ''}`);
for (const [k, v] of Object.entries(compte(resultats)).sort()) console.log(`  ${k.padEnd(14)} ${v}`);
let sorties = [];
if (reference) {
  const dedans = new Set(resultats.map((r) => r.k));
  for (const k of reference) if (!dedans.has(k)) {
    const [p] = await sql`select p.proposal_id::text pid, p.decision::text decision, p.case_id, p.analysis_action aa,
                                 exists (select 1 from telegram_envois t where t.cle = p.proposal_id::text and t.message_id is not null) envoyee
                            from state_proposals p where p.proposal_id::text like ${k + '%'}`;
    sorties.push({ k, etat_actuel: !p ? 'absente de la base' : p.decision ? `décidée (${p.decision})` : p.envoyee ? 'envoyée à l’éditeur' : 'toujours ouverte mais plus écartée' });
  }
  console.log(`  références qui ne sont plus dans l'ensemble écarté : ${sorties.length}`);
  for (const s of sorties) console.log(`    ${s.k} ${s.etat_actuel}`);
}
if (sortie) { writeFileSync(sortie, JSON.stringify({ resultats, references_sorties: sorties }, null, 1)); console.log(`détail → ${sortie} (à garder hors du dépôt)`); }
