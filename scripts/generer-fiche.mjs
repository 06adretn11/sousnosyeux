#!/usr/bin/env node
// =====================================================================
// scripts/generer-fiche.mjs — circuit de génération des fiches individuelles (session « première industrialisation »).
//
//   affaire publique → sources lisibles → compréhension documentaire (LLM, citations littérales) → gardes → composition → qualification
//                                                                                                            → dossier + rendu + proposition
//
//   node scripts/generer-fiche.mjs FR-2026-0041 [FR-2026-0004 …]      # génère (aucune écriture en base, aucun message)
//        --decouvrir        complète les sources de la mémoire par une recherche Bing Actualités (URL éditeur directe)
//        --sources-extra f  JSON { "<case_id>": [{url, media, publication_date}] } : sources apportées par un humain (passent les mêmes gardes)
//        --modele <slug>    modèle OpenRouter (défaut : celui de la Maintenance)
//        --sans-neon        n'interroge pas Neon : sources de l'artefact public seulement
//        --hors-ligne       rejoue depuis les caches disque (.cache/fiches) : aucun réseau, aucun appel LLM
//        --sortie <dossier> défaut data/fiches-generees (IGNORÉ par Git : la traçabilité contient des extraits littéraux)
//
// Sorties : <sortie>/<ID>.json (dossier + generation), <sortie>/<ID>.revue.md (rendu complet), docs/industrialisation/fiches-generees/<ID>.md (rendu
// sans extraits, sûr pour le dépôt). Lecture seule sur Neon. La proposition Telegram se prépare avec : node scripts/proposer-fiche.mjs <ID> --generee
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reunirSources, affairesSoeurs } from './lib/fiche-sources.mjs';
import { SYSTEME, invite, CONTRAT_VERSION, appelerModele, verifier } from './lib/fiche-extraction.mjs';
import { composer } from './lib/fiche-composer.mjs';
import { rendreMarkdown } from './lib/fiche-rendu.mjs';

const A = process.argv.slice(2);
const val = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const ids = A.filter((a) => /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+|PARIS-\d+)$/.test(a));
const MODELE = val('--modele') || 'deepseek/deepseek-v4.1-flash'; // celui de MAINTENANCE_LOOP_2 : déjà éprouvé sur la compréhension documentaire
const HORS_LIGNE = A.includes('--hors-ligne');
const SORTIE = new URL(`../${val('--sortie') || 'data/fiches-generees'}/`, import.meta.url);
const CACHE_LLM = new URL('../.cache/fiches/llm/', import.meta.url);
if (!ids.length) { console.error('usage : generer-fiche.mjs <case_id>… [--decouvrir] [--sources-extra f.json] [--modele slug] [--sans-neon] [--hors-ligne]'); process.exit(2); }

const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const cases = lire('data/cases.json').cases;
const holds = new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id));
const extraParAffaire = val('--sources-extra') ? JSON.parse(readFileSync(val('--sources-extra'), 'utf8')) : {};

let sql = null;
if (!A.includes('--sans-neon') && !HORS_LIGNE) { const { connecter } = await import('./lib/neon.mjs'); sql = connecter().sql; }

/** Appel modèle avec cache disque (clé : modèle + contrat + affaire + document) : rejouable, et chaque appel réel est compté. */
async function extraire({ fiche, soeurs, doc, cout }) {
  const article = { media: doc.media, publication_date: doc.publication_date, body: doc.corps };
  const utilisateur = invite({ fiche, soeurs, article });
  const cle = createHash('sha1').update(`${MODELE}|${CONTRAT_VERSION}|${utilisateur}`).digest('hex').slice(0, 24);
  const f = new URL(`${cle}.json`, CACHE_LLM);
  if (existsSync(f)) { cout.cache++; return JSON.parse(readFileSync(f, 'utf8')).reponse; }
  if (HORS_LIGNE) return null;
  const { reponse, cout: c } = await appelerModele({ systeme: SYSTEME, utilisateur, modele: MODELE });
  cout.appels++; cout.input_tokens += c.input_tokens; cout.output_tokens += c.output_tokens; cout.latence_ms += c.latence_ms;
  if (c.cout_usd != null) cout.cout_usd = (cout.cout_usd ?? 0) + c.cout_usd; else cout.sans_cout++;
  if (reponse) { mkdirSync(CACHE_LLM, { recursive: true }); writeFileSync(f, JSON.stringify({ modele: MODELE, contrat: CONTRAT_VERSION, reponse, cout: c })); }
  return reponse;
}

const bilan = [];
for (const id of ids) {
  const c = cases.find((x) => x.case_id === id);
  if (!c) { console.log(`· ${id} : absente de l’artefact public — jamais de fiche`); continue; }
  console.log(`\n▶ ${id} — ${c.etablissement}, ${c.commune} (carte : ${c.statut_judiciaire})`);
  const sourcesMemoire = new Map((c.sources || []).map((s) => [s.url, { url: s.url, media: s.media, publication_date: s.publication_date }]));
  if (sql) for (const r of await sql`select url, media, publication_date::text publication_date from sources where case_id = ${id}`) if (r.url && !sourcesMemoire.has(r.url)) sourcesMemoire.set(r.url, r);
  // Hors ligne, la recherche Bing n'est pas rejouable : on reprend les URL déjà découvertes lors de la dernière génération (leurs pages sont dans le cache disque).
  let precedentes = [];
  if (HORS_LIGNE && existsSync(new URL(`${id}.json`, SORTIE))) precedentes = JSON.parse(readFileSync(new URL(`${id}.json`, SORTIE), 'utf8')).generation.sources.filter((s) => s.origine === 'decouverte').map((s) => ({ url: s.url, media: s.media, publication_date: s.publication_date, origine: 'decouverte' }));
  const { documents, requetes, erreurs } = HORS_LIGNE
    ? await reunirSources({ c, sourcesMemoire: [...sourcesMemoire.values()], extra: [...(extraParAffaire[id] || []), ...precedentes], decouvrir: false, log: console.log })
    : await reunirSources({ c, sourcesMemoire: [...sourcesMemoire.values()], extra: extraParAffaire[id] || [], decouvrir: A.includes('--decouvrir'), log: console.log });
  const soeurs = affairesSoeurs(c, cases);
  const cout = { appels: 0, cache: 0, input_tokens: 0, output_tokens: 0, latence_ms: 0, cout_usd: null, sans_cout: 0 };
  const vide = (raison) => ({ pertinence: 'AMBIGU', pertinence_raison: raison, noms: [], faits: [], evenements: [], issue: null, declarations: [], lacunes: [], ecartes: [] });
  // Documents lus en parallèle (4 à la fois) : l'ordre des sources est conservé, seul l'attente des appels est partagée.
  const extractions = new Array(documents.length);
  let suivant = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let i = suivant++; i < documents.length; i = suivant++) {
      const doc = documents[i];
      if (doc.acces !== 'libre' || doc.ecarte) { extractions[i] = { doc, v: vide(doc.ecarte ?? doc.motif ?? 'non lue') }; continue; }
      let rep = null;
      try { rep = await extraire({ fiche: c, soeurs, doc, cout }); } catch (e) { console.log(`  ⚠ modèle : ${e.message.slice(0, 120)}`); }
      const v = rep ? verifier(rep, { corps: doc.corps, publieLe: doc.publication_date }) : vide('extraction indisponible');
      console.log(`  ◦ ${doc.media} : ${v.pertinence} · ${v.evenements.length} évt, ${v.faits.length} fait(s), ${v.declarations.length} décl., issue ${v.issue ? v.issue.nature : '—'}, ${v.ecartes.length} écarté(s)`);
      extractions[i] = { doc, v };
    }
  }));
  const r = composer({ c, extractions, holds });
  const generation = {
    contrat: CONTRAT_VERSION, modele: MODELE, genere_le: new Date().toISOString().slice(0, 10), qualification: r.qualification, blocages: r.blocages, attention: r.attention, proposition_etat: r.proposition_etat,
    requetes_decouverte: requetes, erreurs_decouverte: erreurs, stats: r.stats, cout, ecartes: r.ecartes, hors_perimetre: r.hors_perimetre, trace: r.trace,
    sources: extractions.map(({ doc, v }) => ({ url: doc.url, media: doc.media, publication_date: doc.publication_date, origine: doc.origine, acces: doc.acces, motif: doc.motif, ecarte: doc.ecarte, pertinence: doc.acces === 'libre' && !doc.ecarte ? v.pertinence : undefined, raison: v.pertinence_raison || undefined })),
  };
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(new URL(`${id}.json`, SORTIE), JSON.stringify({ version: 'fiche-generee-1', case_id: id, dossier: r.dossier, generation }, null, 2));
  writeFileSync(new URL(`${id}.revue.md`, SORTIE), rendreMarkdown({ c, dossier: r.dossier, generation }, { complet: true }));
  const docs = new URL('../docs/industrialisation/fiches-generees/', import.meta.url);
  mkdirSync(docs, { recursive: true });
  // Rendu destiné au dépôt : seulement pour les fiches proposables. Une fiche bloquée (surtout une affaire sous HOLD) n'est jamais écrite hors de data/fiches-generees/.
  if (['READY', 'A_REVOIR'].includes(r.qualification)) writeFileSync(new URL(`${id}.md`, docs), rendreMarkdown({ c, dossier: r.dossier, generation }, { complet: false }));
  console.log(`  ⇒ ${r.qualification} · ${r.stats.etapes} étape(s), ${r.stats.reactions} réaction(s), ${r.stats.inconnues} inconnue(s) · ${r.blocages.map((b) => b.code).join(', ') || 'aucun blocage'} · LLM ${cout.appels} appel(s)+${cout.cache} cache`);
  bilan.push({ id, qualification: r.qualification, cout });
}
const tot = bilan.reduce((a, b) => ({ appels: a.appels + b.cout.appels, cache: a.cache + b.cout.cache, i: a.i + b.cout.input_tokens, o: a.o + b.cout.output_tokens, usd: a.usd + (b.cout.cout_usd ?? 0) }), { appels: 0, cache: 0, i: 0, o: 0, usd: 0 });
console.log(`\nTotal : ${bilan.length} affaire(s) · ${tot.appels} appel(s) LLM (+${tot.cache} depuis le cache) · ${tot.i} tokens in / ${tot.o} out · ${tot.usd.toFixed(4)} USD`);
