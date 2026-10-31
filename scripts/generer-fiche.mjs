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
//        --rejouer          mêmes sources que la génération précédente de --sortie, nouvelle extraction (reproductibilité)
//        --hors-ligne       rejoue depuis les caches disque (.cache/fiches) : aucun réseau, aucun appel LLM
//        --docs             écrit aussi le rendu sans extraits dans docs/industrialisation/fiches-generees/ (fiches READY / A_REVOIR seulement)
//        --sortie <dossier> défaut data/fiches-generees (IGNORÉ par Git : la traçabilité contient des extraits littéraux)
//
// Sorties : <sortie>/<ID>.json (dossier + generation), <sortie>/<ID>.revue.md (rendu complet), docs/industrialisation/fiches-generees/<ID>.md (rendu
// sans extraits, sûr pour le dépôt). Lecture seule sur Neon. La proposition Telegram se prépare avec : node scripts/proposer-fiche.mjs <ID> --generee
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reunirSources, affairesSoeurs, rattachementInsuffisant } from './lib/fiche-sources.mjs';
import { SYSTEME_REGROUPEMENT, invitesRegroupement, groupesValides, SYSTEME, invite, CONTRAT_VERSION, appelerModele, verifier, fusionnerPasses, extractionValide } from './lib/fiche-extraction.mjs';
import { composer, evenementsBruts, regressionJudiciaire } from './lib/fiche-composer.mjs';
import { rendreMarkdown } from './lib/fiche-rendu.mjs';

const A = process.argv.slice(2);
const val = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const ids = A.filter((a) => /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+|PARIS-\d+)$/.test(a));
const MODELE = val('--modele') || 'deepseek/deepseek-v4.1-flash'; // celui de MAINTENANCE_LOOP_2 : déjà éprouvé sur la compréhension documentaire
const HORS_LIGNE = A.includes('--hors-ligne');
const REJOUER = A.includes('--rejouer');   // MÊMES sources (celles de la génération précédente dans --sortie), NOUVELLE extraction : mesure la reproductibilité du modèle (utiliser SNY_LLM_SALT pour contourner le cache)
const SOURCES_FIGEES = HORS_LIGNE || REJOUER;
// DEUX extractions indépendantes par document, union des éléments vérifiés (fusionnerPasses) : une seule passe perd, d'un tirage à l'autre, des décisions et recours.
// SNY_PASSES=, → une seule passe ; SNY_PASSES=,a,b → trois (le sel vide est la 1re passe ; le sel d'une passe sépare son cache).
const PASSES = process.env.SNY_PASSES !== undefined ? process.env.SNY_PASSES.split(',') : ['', 'bis'];
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
async function extraire({ fiche, soeurs, doc, cout, sel = '' }) {
  const article = { media: doc.media, publication_date: doc.publication_date, body: doc.corps };
  const utilisateur = invite({ fiche, soeurs, article });
  const cle = createHash('sha1').update(`${MODELE}|${CONTRAT_VERSION}|${utilisateur}${sel ? `|${sel}` : ''}`).digest('hex').slice(0, 24);
  const f = new URL(`${cle}.json`, CACHE_LLM);
  // Une réponse sans « pertinence » n'est pas une extraction : jamais servie depuis le cache, jamais mise en cache (voir extractionValide).
  const valide = extractionValide;
  if (existsSync(f)) { const r = JSON.parse(readFileSync(f, 'utf8')).reponse; if (valide(r)) { cout.cache++; return r; } }
  if (HORS_LIGNE) return null;
  const { reponse, cout: c } = await appelerModele({ systeme: SYSTEME, utilisateur, modele: MODELE });
  cout.appels++; cout.input_tokens += c.input_tokens; cout.output_tokens += c.output_tokens; cout.latence_ms += c.latence_ms;
  if (c.cout_usd != null) cout.cout_usd = (cout.cout_usd ?? 0) + c.cout_usd; else cout.sans_cout++;
  if (valide(reponse)) { mkdirSync(CACHE_LLM, { recursive: true }); writeFileSync(f, JSON.stringify({ modele: MODELE, contrat: CONTRAT_VERSION, reponse, cout: c })); }
  return valide(reponse) ? reponse : null;
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
  if (SOURCES_FIGEES && existsSync(new URL(`${id}.json`, SORTIE))) precedentes = JSON.parse(readFileSync(new URL(`${id}.json`, SORTIE), 'utf8')).generation.sources.map((s) => ({ url: s.url, media: s.media, publication_date: s.publication_date, origine: s.origine }));
  const { documents, requetes, erreurs } = SOURCES_FIGEES
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
      const faible = rattachementInsuffisant({ c, corps: doc.corps, toutes: cases });
      if (faible) { extractions[i] = { doc, v: vide(`rattachement non établi : ${faible}`) }; console.log(`  ◦ ${doc.media} : AMBIGU (${faible}) — non envoyée au modèle`); continue; }
      // PASSES : une extraction par sel (défaut : une seule, sel vide) ; SNY_PASSES=,bis → deux extractions indépendantes dont on fait l'union (voir fusionnerPasses).
      const vs = [];
      for (const sel of PASSES) {
        let rep = null;
        try { rep = await extraire({ fiche: c, soeurs, doc, cout, sel }); } catch (e) { console.log(`  ⚠ modèle : ${e.message.slice(0, 120)}`); }
        if (rep) vs.push(verifier(rep, { corps: doc.corps, publieLe: doc.publication_date }));
      }
      const v = vs.length ? fusionnerPasses(vs) : vide('extraction indisponible');
      console.log(`  ◦ ${doc.media} : ${v.pertinence} · ${v.evenements.length} évt, ${v.faits.length} fait(s), ${v.declarations.length} décl., issue ${v.issue ? v.issue.nature : '—'}, ${v.ecartes.length} écarté(s)`);
      extractions[i] = { doc, v };
    }
  }));
  // Regroupement des doublons sémantiques (un appel par affaire à partir de 6 événements, mis en cache) ; hors ligne : depuis le cache seulement.
  let fusionsModele = [];
  const evts = evenementsBruts(extractions);
  if (evts.length >= 6 && !process.env.SNY_SANS_REGROUPEMENT) {
    const utilisateur = invitesRegroupement(evts);
    const cle = createHash('sha1').update(`${MODELE}|regroupement|${utilisateur}`).digest('hex').slice(0, 24);
    const f = new URL(`rg-${cle}.json`, CACHE_LLM);
    try {
      let rep = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).reponse : null;
      if (rep) cout.cache++;
      else if (!HORS_LIGNE) {
        const o = await appelerModele({ systeme: SYSTEME_REGROUPEMENT, utilisateur, modele: MODELE });
        cout.appels++; cout.input_tokens += o.cout.input_tokens; cout.output_tokens += o.cout.output_tokens;
        if (o.cout.cout_usd != null) cout.cout_usd = (cout.cout_usd ?? 0) + o.cout.cout_usd;
        rep = o.reponse;
        if (rep) { mkdirSync(CACHE_LLM, { recursive: true }); writeFileSync(f, JSON.stringify({ reponse: rep })); }
      }
      fusionsModele = groupesValides(rep, evts.length);
    } catch (e) { console.log(`  ⚠ regroupement : ${e.message.slice(0, 100)}`); }
  }
  const r = composer({ c, extractions, holds, fusionsModele });
  const generation = {
    contrat: CONTRAT_VERSION, modele: MODELE, genere_le: new Date().toISOString().slice(0, 10), qualification: r.qualification, blocages: r.blocages, attention: r.attention, proposition_etat: r.proposition_etat,
    citations_recuperees: extractions.reduce((a, x) => a + (x.v.recuperees || 0), 0), requetes_decouverte: requetes, erreurs_decouverte: erreurs, stats: r.stats, cout, ecartes: r.ecartes, hors_perimetre: r.hors_perimetre, trace: r.trace,
    sources: extractions.map(({ doc, v }) => ({ url: doc.url, media: doc.media, publication_date: doc.publication_date, origine: doc.origine, acces: doc.acces, motif: doc.motif, ecarte: doc.ecarte, pertinence: doc.acces === 'libre' && !doc.ecarte ? v.pertinence : undefined, raison: v.pertinence_raison || undefined })),
  };
  mkdirSync(SORTIE, { recursive: true });
  // Garde-fou judiciaire : une régénération ne remplace jamais une issue établie (classement, relaxe, condamnation) par une version qui l'a perdue ou contredite alors que sa source est toujours retenue.
  const fichierPrecedent = new URL(`${id}.json`, SORTIE);
  const precedente = existsSync(fichierPrecedent) ? JSON.parse(readFileSync(fichierPrecedent, 'utf8')).generation : null;
  const regression = precedente ? regressionJudiciaire(precedente, generation) : null;
  if (regression) {
    writeFileSync(new URL(`${id}.regression.json`, SORTIE), JSON.stringify({ version: 'fiche-generee-1', case_id: id, regression, dossier: r.dossier, generation }, null, 2));
    console.log(`  ⚠ RÉGRESSION JUDICIAIRE : « ${regression.avant} » → ${regression.apres ? `« ${regression.apres} »` : 'aucune issue'} alors que sa source est toujours retenue : version précédente CONSERVÉE, nouvelle version écrite dans ${id}.regression.json`);
    bilan.push({ id, qualification: precedente.qualification, cout, regression });
    continue;
  }
  writeFileSync(new URL(`${id}.json`, SORTIE), JSON.stringify({ version: 'fiche-generee-1', case_id: id, dossier: r.dossier, generation }, null, 2));
  writeFileSync(new URL(`${id}.revue.md`, SORTIE), rendreMarkdown({ c, dossier: r.dossier, generation }, { complet: true }));
  // Rendu destiné au dépôt (sans extraits littéraux) : écrit dans docs/ SEULEMENT sur demande (--docs) et seulement pour une fiche proposable — la relecture d'une fiche non approuvée ne part pas
  // dans le dépôt par accident. Une fiche bloquée (surtout une affaire sous HOLD) n'est jamais écrite hors de data/fiches-generees/.
  const rendu = rendreMarkdown({ c, dossier: r.dossier, generation }, { complet: false });
  writeFileSync(new URL(`${id}.public.md`, SORTIE), rendu);
  if (A.includes('--docs') && ['READY', 'A_REVOIR'].includes(r.qualification)) {
    const docs = new URL('../docs/industrialisation/fiches-generees/', import.meta.url);
    mkdirSync(docs, { recursive: true });
    writeFileSync(new URL(`${id}.md`, docs), rendu);
  }
  console.log(`  ⇒ ${r.qualification} · ${r.stats.etapes} étape(s), ${r.stats.reactions} réaction(s), ${r.stats.inconnues} inconnue(s) · ${r.blocages.map((b) => b.code).join(', ') || 'aucun blocage'} · LLM ${cout.appels} appel(s)+${cout.cache} cache`);
  bilan.push({ id, qualification: r.qualification, cout });
}
const tot = bilan.reduce((a, b) => ({ appels: a.appels + b.cout.appels, cache: a.cache + b.cout.cache, i: a.i + b.cout.input_tokens, o: a.o + b.cout.output_tokens, usd: a.usd + (b.cout.cout_usd ?? 0) }), { appels: 0, cache: 0, i: 0, o: 0, usd: 0 });
console.log(`\nTotal : ${bilan.length} affaire(s) · ${tot.appels} appel(s) LLM (+${tot.cache} depuis le cache) · ${tot.i} tokens in / ${tot.o} out · ${tot.usd.toFixed(4)} USD`);
