// =====================================================================
// scripts/watch-updates.mjs
// Veille automatique : recherche de nouveaux articles sur les affaires publiées.
//
// Pipeline : cases.json → requêtes Google News RSS → filtrage doublons →
//            pré-analyse via article-server (optionnel) → watch-report.json
//
// Usage :
//   node scripts/watch-updates.mjs                      # toutes les affaires
//   node scripts/watch-updates.mjs --limit 5            # 5 premières affaires
//   node scripts/watch-updates.mjs --case FR-2026-0001  # 1 affaire spécifique
//   node scripts/watch-updates.mjs --analyze             # pré-analyse via article-server
//   node scripts/watch-updates.mjs --dry-run             # affiche les requêtes sans chercher
//
// Env (optionnel, pour --analyze) :
//   article-server.mjs doit tourner sur localhost:3456
// =====================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CASES_PATH = resolve(ROOT, 'data/cases.json');
const REPORT_PATH = resolve(ROOT, 'data/watch-report.json');

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const ANALYZE = ARGS.includes('--analyze');
const LIMIT = ARGS.includes('--limit')
  ? parseInt(ARGS[ARGS.indexOf('--limit') + 1], 10)
  : Infinity;
const CASE_FILTER = ARGS.includes('--case')
  ? ARGS[ARGS.indexOf('--case') + 1]
  : null;

const ARTICLE_SERVER = 'http://localhost:3456';
const DELAY_BETWEEN_SEARCHES_MS = 2000;

// --- Mots-clés de progression selon le statut judiciaire actuel ---
const EVOLUTION_KEYWORDS = {
  'plainte':                          ['enquête', 'garde à vue', 'mis en examen', 'interpellé'],
  'enquête':                          ['mis en examen', 'renvoyé', 'tribunal', 'procès', 'garde à vue'],
  'mise en examen':                   ['procès', 'renvoyé devant', 'tribunal correctionnel', 'assises', 'jugement'],
  'procès':                           ['condamné', 'condamnation', 'relaxé', 'relaxe', 'acquitté', 'peine', 'prison'],
  'condamnation non définitive':      ['appel', 'cassation', 'condamnation définitive', 'confirmé'],
  'condamnation définitive':          ['incarcéré', 'prison', 'inscription FIJAIS'],
  'relaxe / non-lieu / classement':   ['réouverture', 'appel', 'nouvelle plainte'],
  'à qualifier':                      ['enquête', 'plainte', 'mis en examen', 'condamné', 'procès'],
};

// =====================================================================
// Fonctions utilitaires
// =====================================================================

function buildSearchQuery(c) {
  const parts = [];

  if (c.etablissement) parts.push(`"${c.etablissement}"`);
  if (c.commune) parts.push(c.commune);

  const roleShort = (c.role_mis_en_cause || '')
    .replace(/périscolaire/i, '')
    .replace(/scolaire/i, '')
    .trim();
  if (roleShort) parts.push(roleShort);

  const evolutionTerms = EVOLUTION_KEYWORDS[c.statut_judiciaire] || EVOLUTION_KEYWORDS['à qualifier'];
  parts.push(`(${evolutionTerms.join(' OR ')})`);

  return parts.join(' ');
}

function googleNewsRssUrl(query) {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`;
}

function parseRssItems(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      || block.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      || '';
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]
      || block.match(/<link[^>]*href="([^"]+)"/)?.[1]
      || '';
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
    const sourceTag = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
    const sourceDomain = sourceTag?.[1] || null;
    const sourceName = sourceTag?.[2]?.replace(/<[^>]+>/g, '').trim()
      || block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<[^>]+>/g, '').trim()
      || null;

    if (link) {
      items.push({
        title: title.replace(/<[^>]+>/g, '').trim(),
        url: link.trim(),
        source_domain: sourceDomain,
        published: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : null,
        media: sourceName,
      });
    }
  }
  return items;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

function normalizeMedia(name) {
  return (name || '').toLowerCase().replace(/[^a-zàâéèêëïôùûüç0-9]/g, '');
}

function filterNewArticles(articles, existingSources) {
  const latestSourceDate = existingSources
    .map(s => s.publication_date)
    .filter(Boolean)
    .sort()
    .pop() || '1970-01-01';

  const existingMediaDates = new Set(
    existingSources.map(s => `${normalizeMedia(s.media)}|${s.publication_date || ''}`)
  );
  const existingDomains = new Set(
    existingSources.map(s => extractDomain(s.url)).filter(Boolean)
  );

  return articles.filter(a => {
    const mediaKey = `${normalizeMedia(a.media)}|${a.published || ''}`;
    if (existingMediaDates.has(mediaKey)) return false;

    const domain = a.source_domain ? extractDomain(a.source_domain) : null;
    if (a.published && a.published > latestSourceDate) return true;
    if (domain && !existingDomains.has(domain)) return true;

    return false;
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchRss(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; sousnosyeux-watch/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries) throw err;
      await sleep(1000 * (i + 1));
    }
  }
}


async function analyzeArticle(url, caseContext) {
  try {
    const res = await fetch(`${ARTICLE_SERVER}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, context: caseContext }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- Détection d'évolution par analyse du titre (sans fetch article) ---
const ALL_EVOLUTION_TERMS = {
  'condamné':             'condamnation',
  'condamnation':         'condamnation',
  'condamnée':            'condamnation',
  'ans de prison':        'condamnation',
  'ans ferme':            'condamnation',
  'réclusion':            'condamnation',
  'relaxé':               'relaxe / non-lieu / classement',
  'relaxe':               'relaxe / non-lieu / classement',
  'acquitté':             'relaxe / non-lieu / classement',
  'non-lieu':             'relaxe / non-lieu / classement',
  'classé sans suite':    'relaxe / non-lieu / classement',
  'mis en examen':        'mise en examen',
  'mise en examen':       'mise en examen',
  'renvoyé devant':       'procès',
  'tribunal correctionnel': 'procès',
  'cour d\'assises':      'procès',
  'procès':               'procès',
  'jugement':             'procès',
  'jugé':                 'procès',
  'garde à vue':          'enquête',
  'interpellé':           'enquête',
  'enquête':              'enquête',
  'appel':                'appel',
  'cassation':            'cassation',
};

function detectEvolutionFromTitle(title, currentStatut) {
  const titleLower = title.toLowerCase();
  const detected = [];

  for (const [term, statut] of Object.entries(ALL_EVOLUTION_TERMS)) {
    if (titleLower.includes(term) && statut !== currentStatut) {
      detected.push({ term, suggests: statut });
    }
  }

  if (detected.length === 0) return null;

  // Ne signaler que les évolutions VERS L'AVANT (statut plus avancé que l'actuel)
  const HIERARCHY = [
    'plainte', 'enquête', 'mise en examen', 'procès',
    'condamnation', 'relaxe / non-lieu / classement',
    'appel', 'cassation',
  ];
  const currentIdx = HIERARCHY.indexOf(currentStatut);
  const forwardEvolutions = detected
    .filter(d => HIERARCHY.indexOf(d.suggests) > currentIdx)
    .sort((a, b) => HIERARCHY.indexOf(b.suggests) - HIERARCHY.indexOf(a.suggests));

  return forwardEvolutions[0] || null;
}

// =====================================================================
// Pipeline principal
// =====================================================================

async function main() {
  console.log('📡 watch-updates — veille sur les affaires publiées\n');

  const raw = JSON.parse(await readFile(CASES_PATH, 'utf-8'));
  let cases = raw.cases || [];

  if (CASE_FILTER) {
    cases = cases.filter(c => c.case_id === CASE_FILTER);
    if (!cases.length) {
      console.error(`❌ Affaire ${CASE_FILTER} non trouvée dans cases.json`);
      process.exit(1);
    }
  }

  cases = cases.slice(0, LIMIT);
  console.log(`🔍 ${cases.length} affaire(s) à surveiller\n`);

  const report = {
    generated_at: new Date().toISOString(),
    total_cases_checked: cases.length,
    cases_with_updates: 0,
    results: [],
  };

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const query = buildSearchQuery(c);
    const label = `[${i + 1}/${cases.length}] ${c.case_id} — ${c.etablissement}, ${c.commune}`;

    console.log(`${label}`);
    console.log(`   Requête : ${query}`);

    if (DRY_RUN) {
      console.log(`   (dry-run — pas de recherche)\n`);
      continue;
    }

    let articles = [];
    try {
      const rssUrl = googleNewsRssUrl(query);
      const xml = await fetchRss(rssUrl);
      articles = parseRssItems(xml);
      console.log(`   → ${articles.length} résultat(s) Google News`);
    } catch (err) {
      console.log(`   ⚠️  Erreur recherche : ${err.message}`);
      report.results.push({
        case_id: c.case_id,
        etablissement: c.etablissement,
        commune: c.commune,
        statut_judiciaire: c.statut_judiciaire,
        query,
        error: err.message,
        new_articles: [],
      });
      await sleep(DELAY_BETWEEN_SEARCHES_MS);
      continue;
    }

    const existingSources = c.sources || [];
    const latestDate = existingSources.map(s => s.publication_date).filter(Boolean).sort().pop() || '?';
    const newArticles = filterNewArticles(articles, existingSources);
    console.log(`   → ${newArticles.length} article(s) nouveau(x) (${existingSources.length} source(s), dernière: ${latestDate})`);

    // Détection d'évolution par analyse des titres (toujours active)
    for (const article of newArticles) {
      const evol = detectEvolutionFromTitle(article.title, c.statut_judiciaire);
      if (evol) {
        article.evolution = evol;
        console.log(`     🔔 "${evol.term}" → suggère : ${evol.suggests}`);
      }
    }

    // Pré-analyse LLM via article-server (optionnel, uniquement pour les URLs directes)
    if (ANALYZE && newArticles.length > 0) {
      const directArticles = newArticles.filter(a => !a.url.includes('news.google.com'));
      if (directArticles.length > 0) {
        console.log(`   → Pré-analyse via article-server (${directArticles.length} URL(s) directe(s))...`);
        const context = `Affaire: ${c.etablissement}, ${c.commune}. Rôle: ${c.role_mis_en_cause}. Statut actuel: ${c.statut_judiciaire}.`;
        for (const article of directArticles) {
          const analysis = await analyzeArticle(article.url, context);
          if (analysis?.ok) {
            article.analysis = analysis.analysis || null;
            article.analysis_mode = analysis.mode || null;
          }
        }
      }
    }

    if (newArticles.length > 0) report.cases_with_updates++;

    report.results.push({
      case_id: c.case_id,
      etablissement: c.etablissement,
      commune: c.commune,
      statut_judiciaire: c.statut_judiciaire,
      query,
      new_articles: newArticles,
    });

    if (i < cases.length - 1) await sleep(DELAY_BETWEEN_SEARCHES_MS);
    console.log('');
  }

  if (!DRY_RUN) {
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n✅ Rapport écrit : data/watch-report.json`);
    console.log(`   ${report.cases_with_updates}/${report.total_cases_checked} affaire(s) avec nouveaux articles`);

    if (report.cases_with_updates > 0) {
      console.log('\n📋 Résumé des nouveautés :');
      for (const r of report.results) {
        if (r.new_articles?.length > 0) {
          console.log(`\n   ${r.case_id} — ${r.etablissement}, ${r.commune} (statut: ${r.statut_judiciaire})`);
          for (const a of r.new_articles) {
            const evolFlag = a.evolution ? ` 🔔 ${a.evolution.suggests}` : '';
            console.log(`     • ${a.title}${evolFlag}`);
            console.log(`       ${a.url}`);
            if (a.media) console.log(`       Source : ${a.media} (${a.published || '?'})`);
          }
        }
      }
    }
  }
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err);
  process.exit(1);
});
