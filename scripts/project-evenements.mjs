#!/usr/bin/env node
// =====================================================================
// scripts/project-evenements.mjs — Neon (case_events) → data/evenements.json : la chronologie VALIDÉE des affaires PUBLIQUES.
//
//   node scripts/project-evenements.mjs --diff     # écart avec le fichier committé, n'écrit rien
//   node scripts/project-evenements.mjs            # écrit data/evenements.json si le contenu change
//
// C'est le seul pont entre la mémoire (Neon) et les pages : la fiche d'une affaire ET le déroulé du Hub lisent CE fichier pour les
// événements validés (voir web/src/lib/fiche.ts). Aucune rédaction ici, aucun LLM, lecture seule.
// Périmètre : les affaires présentes dans data/cases.json (jamais une candidate, jamais une affaire retirée). Liste blanche de champs.
// Un même fait enregistré deux fois (type + date + statut) ne compte qu'une fois, le plus ancien fait foi (même règle que la synthèse d'état).
// `rectification` n'est jamais un fait à afficher.
// =====================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';

const DIFF = process.argv.includes('--diff');
const CHEMIN = new URL('../data/evenements.json', import.meta.url);
const ids = JSON.parse(readFileSync(new URL('../data/cases.json', import.meta.url), 'utf8')).cases.map((c) => c.case_id);

const { sql } = connecter();
const lignes = await sql`
  select e.case_id, e.event_id::text event_id, to_char(e.event_date, 'YYYY-MM-DD') date, e.event_type::text type,
         e.statut_apres::text statut, e.libelle_public libelle, e.realisation, e.recorded_at::text recorded_at,
         a.media, a.url, to_char(a.publication_date, 'YYYY-MM-DD') publie_le
    from case_events e left join articles a on a.article_id = e.article_id
   where e.case_id = any(${ids}) and e.event_type::text <> 'rectification'
   order by e.case_id, e.event_date nulls last, e.recorded_at`;

const vus = new Set();
const parAffaire = {};
for (const l of lignes) {
  const cle = `${l.case_id}|${l.type}|${l.date ?? 'nd'}|${l.statut ?? 'nd'}`;
  if (l.date && vus.has(cle)) continue; // même fait, déjà retenu (le plus ancien)
  vus.add(cle);
  (parAffaire[l.case_id] ||= []).push({
    event_id: l.event_id, date: l.date, type: l.type, statut: l.statut, libelle: l.libelle,
    ...(l.realisation ? { realisation: l.realisation } : {}),
    source: l.media ? { media: l.media, url: l.url, publie_le: l.publie_le } : null,
  });
}
const doc = { _meta: { projection: 'evenements-v0', note: 'Compilé depuis Neon (case_events) par scripts/project-evenements.mjs. Ne pas éditer à la main.' }, affaires: parAffaire };
const texte = JSON.stringify(doc, null, 2) + '\n';
const avant = existsSync(CHEMIN) ? readFileSync(CHEMIN, 'utf8') : '';
const n = Object.values(parAffaire).reduce((s, l) => s + l.length, 0);
console.log(`${n} événement(s) validé(s) sur ${Object.keys(parAffaire).length} affaire(s) publique(s)`);
if (avant === texte) { console.log('NO_PUBLIC_CHANGE — data/evenements.json déjà conforme à Neon'); process.exit(0); }
if (DIFF) { console.log('écart avec le fichier committé (rien écrit)'); process.exit(0); }
writeFileSync(CHEMIN, texte, 'utf8');
console.log('✅ écrit : data/evenements.json');
