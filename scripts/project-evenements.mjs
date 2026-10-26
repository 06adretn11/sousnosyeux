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
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { dossierFiche, hashDossier, ficheApprouvee, empreinteApprouvee } from './lib/fiche-page.mjs';
import { connecter } from './lib/neon.mjs';
import { lireMatiereValidee } from './lib/matiere-validee.mjs';
import { construireMatiere } from './lib/destinations.mjs';
import { prevenirUneFois, texteBloquee, texteConservee } from './lib/prevenir.mjs';

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
// Fiches individuelles APPROUVÉES (revue « [Fiche approuvée] » d'Adrien) : publiques seulement si l'empreinte approuvée est celle du dossier
// ACTUEL (le dossier a changé depuis → plus publique jusqu'à une nouvelle approbation : échec fermé).
const revues = await sql`select case_id, reviewed_by, decision::text decision, comment from reviews where case_id = any(${ids}) and comment like '[Fiche approuvée %' order by reviewed_at`;
const fiches = {};
for (const id of new Set(revues.map((r) => r.case_id))) {
  const h = ficheApprouvee(revues.filter((r) => r.case_id === id), id);
  const dossier = dossierFiche(id);
  const servie = empreinteApprouvee(revues.filter((r) => r.case_id === id), id, dossier); // empreinte du dossier RÉELLEMENT servi (approuvée)
  if (servie) fiches[id] = { hash: servie };
  else if (h) console.log(`· ${id} : fiche approuvée mais dossier modifié depuis (empreinte différente) — NON publique, nouvelle approbation requise`);
}
// INFORMATIONS VALIDÉES (mobilisations, mesures, réactions) : UNE information dans la mémoire (state_proposals.facts), ses DESTINATIONS calculées ici
// parmi les pages DÉJÀ publiques (fiche approuvée de l'affaire, Hub publié dont le périmètre contient la portée). Aucune page n'est créée ; une
// information sans page concernée, ou liée à une affaire non publique / sous HOLD, ne quitte jamais Neon (et sa citation n'est jamais projetée).
const lire = (fichier) => JSON.parse(readFileSync(new URL(`../${fichier}`, import.meta.url), 'utf8'));
const casesPubliques = lire('data/cases.json').cases;
const holds = new Set((lire('data/publication-holds.json').holds || []).map((h) => h.case_id));
const hubs = Object.fromEntries(['paris-11e', 'bordeaux-gironde', 'hautes-alpes', 'landes'].map((h) => [h, { publie: true, groupes: lire(`data/hub-matiere/${h}.json`).reponses.map((g) => g.titre) }]));
const { matiere, bloques, conservees } = construireMatiere(await lireMatiereValidee(sql), {
  publiques: new Set(ids), holds, approuvees: new Set(Object.keys(fiches)), cases: new Map(casesPubliques.map((c) => [c.case_id, { commune: c.commune, departement: c.departement, etablissement: c.etablissement }])), hubs,
});
const doc = { _meta: { projection: 'evenements-v0', note: 'Compilé depuis Neon (case_events, reviews, informations validées) par scripts/project-evenements.mjs. Ne pas éditer à la main.' }, affaires: parAffaire, fiches_approuvees: fiches, matiere };
const texte = JSON.stringify(doc, null, 2) + '\n';
const avant = existsSync(CHEMIN) ? readFileSync(CHEMIN, 'utf8') : '';
const n = Object.values(parAffaire).reduce((s, l) => s + l.length, 0);
console.log(`${n} événement(s) validé(s) sur ${Object.keys(parAffaire).length} affaire(s) publique(s)`);
// Pages concernées : fiches nouvellement approuvées + fiches publiques dont un événement a changé (à vérifier sur le site servi).
const ancien = avant ? JSON.parse(avant) : { affaires: {}, fiches_approuvees: {}, matiere: [] };
const ancienne = new Map((ancien.matiere ?? []).map((m) => [m.id, JSON.stringify(m)]));
const changees = matiere.filter((m) => ancienne.get(m.id) !== JSON.stringify(m));                    // informations nouvelles ou modifiées
const retirees = (ancien.matiere ?? []).filter((m) => !matiere.some((x) => x.id === m.id));
const touchees = [...changees, ...retirees];
const concernees = Object.keys(fiches).filter((id) => !ancien.fiches_approuvees?.[id] || JSON.stringify(ancien.affaires?.[id] ?? []) !== JSON.stringify(parAffaire[id] ?? []) || touchees.some((m) => m.destinations.fiche === id));
const hubsConcernes = [...new Set(touchees.flatMap((m) => m.destinations.hubs.map((h) => h.hub)))];
const sortie = (change) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `change=${change}
fiches=${concernees.join(',')}
hubs=${hubsConcernes.join(',')}
`); };
console.log(`${matiere.length} information(s) validée(s) projetée(s) (${changees.length} nouvelle(s) ou modifiée(s)) · pages concernées : fiches [${concernees.join(', ') || '—'}] hubs [${hubsConcernes.join(', ') || '—'}] · ${bloques.length} blocage(s)`);
// Une information validée qu'aucun bloc existant ne peut accueillir : blocage EXPLICITE (une seule alerte), jamais d'insertion forcée.
if (!DIFF) for (const b of bloques) await prevenirUneFois(sql, { cle: `matiere:${b.id}`, resultat: 'bloquee', texte: texteBloquee(b) });
// Une information validée SANS page concernée (ni fiche approuvée, ni Hub publié) : confirmation de PERSISTANCE, une seule fois, sans promesse de publication.
// L'issue vient du résultat réel de la projection ci-dessus, jamais du statut « publiée » de l'affaire.
if (!DIFF) for (const f of conservees) await prevenirUneFois(sql, { cle: `matiere:conservee:${f.id}`, resultat: 'conservee', texte: texteConservee(f) });
if (avant === texte) { console.log('NO_PUBLIC_CHANGE — data/evenements.json déjà conforme à Neon'); sortie(false); process.exit(0); }
if (DIFF) { console.log('écart avec le fichier committé (rien écrit) · pages concernées : ' + (concernees.join(', ') || 'aucune')); process.exit(0); }
writeFileSync(CHEMIN, texte, 'utf8');
sortie(true);
console.log('✅ écrit : data/evenements.json');
