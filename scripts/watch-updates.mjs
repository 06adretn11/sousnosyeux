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
//   node scripts/watch-updates.mjs --no-context          # affaires seulement, sans requêtes libres
//
// Env (optionnel, pour --analyze) :
//   article-server.mjs doit tourner sur localhost:3456
// =====================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requetesVeille } from './lib/routage-veille.mjs';

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
const NO_CONTEXT = ARGS.includes('--no-context');
const USE_JSON = ARGS.includes('--json');

const ARTICLE_SERVER = 'http://localhost:3456';
const DELAY_BETWEEN_SEARCHES_MS = 2000;

// Les mots-clés de progression par état courant vivent dans
// `lib/routage-veille.mjs` (BOOSTERS) : ce sont des BOOSTERS de recherche,
// jamais une liste fermée — une requête ouverte tourne toujours en plus.

// Mots-clés détectant une déclaration ou mesure d'autorité dans un titre d'article
const OFFICIAL_KEYWORDS = [
  'rectorat', 'dasco', 'mairie', 'procureur', 'parquet',
  'ministère', 'ministre', 'préfecture', 'inspection académique',
  'caspe', 'igas', 'igesr',
  'suspendu', 'suspension', 'licencié', 'licenciement',
  'cellule de crise', 'protocole', 'rapport', 'audit', 'mission',
  // Brigade de protection des mineurs
  'brigade de protection des mineurs', 'bpm',
  // Magistrature
  'procureure de paris', 'laure beccuau',
];

// Acteurs notables liés aux affaires (avocats des familles, magistrats nommés)
// Leur apparition dans un titre signale un développement significatif du dossier.
const NOTABLE_ACTORS_KEYWORDS = [
  'arié alimi', 'arie alimi',
  'hannah kopp',
  'rebecca royer',
  'laure beccuau',
  'beccuau',
];

// Requêtes libres lancées indépendamment des affaires.
// Captent déclarations institutionnelles, prises de position d'acteurs notables,
// et nouvelles publications d'associations — même sans lien direct avec un cas en base.
const CONTEXT_QUERIES = [
  // Avocats des familles
  '"Arié Alimi" périscolaire',
  '"Arié Alimi" animateur',
  '"Hannah Kopp" enfants Paris',
  '"Rebecca Royer" enfants Paris',
  // Magistrature
  '"Laure Beccuau" mineurs',
  '"Laure Beccuau" périscolaire',
  // Institutions (Ville de Paris, Éducation nationale)
  '"DASCO" violences animateur Paris',
  '"rectorat Paris" périscolaire animateur',
  'mairie Paris plan animateurs violences',
  '"brigade protection mineurs" Paris périscolaire',
  '"IGAS" périscolaire',
  '"IGESR" périscolaire',
  // Associations impliquées dans les procès Paris 11e
  '"L\'Enfant Bleu" périscolaire Paris',
  '"Innocence en Danger" périscolaire Paris',
  // Établissements nommés (Paris 11e et hubs liés)
  '"Alphonse-Baudin" animateur',
  '"Bullourde" animateur',
  '"école Servan" animateur Paris',
  '"école Titon" Paris animateur',
  // Thématiques élargies
  'périscolaire Paris procès animateur 2026',
  'animateurs violences sexuelles Paris condamné',
  '"réseau pédocriminel" périscolaire Paris',
];

// =====================================================================
// Fonctions utilitaires
// =====================================================================

// Deux requêtes par affaire : « en avant » (boosters de l'état courant, sans
// le rôle qui la rétrécissait) et ouverte (établissement + commune seuls).
// Mesuré sur Titon : l'appel du parquet n'était trouvé que par une requête
// qui le nomme ; une requête ouverte ne le remonte pas.
const FENETRE = ARGS.includes('--fenetre-jours') ? parseInt(ARGS[ARGS.indexOf('--fenetre-jours') + 1], 10) : 45;
const buildSearchQuery = (c) => requetesVeille(c, { fenetreJours: FENETRE });

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

function detectOfficialDeclaration(title) {
  const lower = title.toLowerCase();
  return OFFICIAL_KEYWORDS.filter(kw => lower.includes(kw));
}

function detectNotableActor(title) {
  const lower = title.toLowerCase();
  return NOTABLE_ACTORS_KEYWORDS.filter(kw => lower.includes(kw));
}

// =====================================================================
// Pipeline principal
// =====================================================================

async function main() {
  console.log('📡 watch-updates — veille sur les affaires publiées\n');

  // SOURCE DE VÉRITÉ : Neon, plus `data/cases.json`.
  //
  // `cases.json` est une PROJECTION figée, régénérée à la main avant un
  // déploiement. Mesuré le 24/09/2026 : 53 affaires dans le JSON contre 56
  // publiées dans Neon. `FR-2026-0048`, `FR-2026-0049` et `PARIS-011`
  // n'étaient donc surveillées par rien, et rien ne le signalait — alors
  // que `FR-2026-0049` est précisément l'affaire dont l'état publié est
  // contredit par ses propres sources.
  //
  // `--json` conserve l'ancien comportement pour rejouer un cycle à
  // l'identique hors ligne.
  let cases;
  if (USE_JSON) {
    const raw = JSON.parse(await readFile(CASES_PATH, 'utf-8'));
    cases = raw.cases || [];
    console.log(`   source du stock : data/cases.json (projection figée)`);
  } else {
    const { connecter } = await import('./lib/neon.mjs');
    const { sql } = connecter();
    cases = await sql`
      select c.case_id, c.etablissement, c.commune,
             c.role_mis_en_cause::text  as role_mis_en_cause,
             c.statut_judiciaire::text  as statut_judiciaire,
             coalesce(
               (select json_agg(json_build_object(
                  'media', s.media, 'publication_date', s.publication_date, 'url', s.url))
                from sources s where s.case_id = c.case_id),
               '[]'::json) as sources
      from cases c
      where c.publication_status = 'publiée'
         -- + toute affaire dont un humain a planifié un réexamen (reviews.next_review_at) : les dossiers
         --   REVIEW / en attente de corroboration de Discovery. Un rejet (« retirer ») n'est jamais surveillé.
         or exists (select 1 from reviews r
                     where r.case_id = c.case_id and r.next_review_at is not null and r.decision <> 'retirer')
         -- + toute candidate EXPLICITEMENT validée par Adrien (clic VALIDATE de Discovery ou Decision Pack) : surveillée dès sa
         --   validation, publiée ou non. Ni les candidates historiques non décidées, ni un simple rattachement (ATTACH), ni une
         --   validation « par règle conditionnelle » (reviewed_by ne commence pas par « Adrien »).
         or (c.publication_status = 'candidate'
             and exists (select 1 from reviews r
                          where r.case_id = c.case_id and r.decision = 'validé' and r.reviewed_by like 'Adrien%'
                            and (r.comment like 'VALIDATED —%' or r.comment like '[Discovery-auto:%] VALIDATE —%'))
             and not exists (select 1 from reviews x where x.case_id = c.case_id and x.decision = 'retirer'))
      order by c.case_id`;
    console.log(`   source du stock : Neon (${cases.length} affaires : publiées + réexamens planifiés + candidates validées)`);
  }

  if (CASE_FILTER) {
    cases = cases.filter(c => c.case_id === CASE_FILTER);
    if (!cases.length) {
      console.error(`❌ Affaire ${CASE_FILTER} introuvable dans le stock publié`);
      process.exit(1);
    }
  }

  cases = cases.slice(0, LIMIT);
  console.log(`🔍 ${cases.length} affaire(s) à surveiller\n`);

  const report = {
    generated_at: new Date().toISOString(),
    total_cases_checked: cases.length,
    cases_with_updates: 0,
    declarations_officielles_count: 0,
    results: [],
  };

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const queries = buildSearchQuery(c);
    const query = queries.avant;
    const label = `[${i + 1}/${cases.length}] ${c.case_id} — ${c.etablissement}, ${c.commune}`;

    console.log(`${label}`);
    console.log(`   Requête (avant)   : ${queries.avant}`);
    console.log(`   Requête (ouverte) : ${queries.ouverte}`);

    if (DRY_RUN) {
      console.log(`   (dry-run — pas de recherche)\n`);
      continue;
    }

    let articles = [];
    try {
      articles = parseRssItems(await fetchRss(googleNewsRssUrl(queries.avant)));
      await sleep(DELAY_BETWEEN_SEARCHES_MS);
      const ouverts = parseRssItems(await fetchRss(googleNewsRssUrl(queries.ouverte)));
      // Union dédupliquée par (titre, média) : la requête ouverte n'ajoute que
      // ce que la requête « en avant » n'a pas remonté.
      const vus = new Set(articles.map((a) => `${a.title}|${a.media}`));
      for (const a of ouverts) if (!vus.has(`${a.title}|${a.media}`)) articles.push(a);
      console.log(`   → ${articles.length} résultat(s) Google News (${ouverts.length} en requête ouverte)`);
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

    // Détection d'évolution et de déclarations officielles par titre
    for (const article of newArticles) {
      const evol = detectEvolutionFromTitle(article.title, c.statut_judiciaire);
      if (evol) {
        article.evolution = evol;
        console.log(`     🔔 "${evol.term}" → suggère : ${evol.suggests}`);
      }
      const officialKws = detectOfficialDeclaration(article.title);
      if (officialKws.length > 0) {
        article.declaration_officielle = true;
        article.declaration_keywords = officialKws;
        console.log(`     📢 Déclaration officielle : ${officialKws.join(', ')}`);
      }
      const actorKws = detectNotableActor(article.title);
      if (actorKws.length > 0) {
        article.notable_actor = true;
        article.notable_actor_keywords = actorKws;
        console.log(`     👤 Acteur notable : ${actorKws.join(', ')}`);
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
    report.declarations_officielles_count += newArticles.filter(a => a.declaration_officielle).length;

    report.results.push({
      case_id: c.case_id,
      etablissement: c.etablissement,
      commune: c.commune,
      statut_judiciaire: c.statut_judiciaire,
      query,
      query_open: queries.ouverte,
      new_articles: newArticles,
    });

    if (i < cases.length - 1) await sleep(DELAY_BETWEEN_SEARCHES_MS);
    console.log('');
  }

  // ── Requêtes de contexte libre ────────────────────────────────────────
  if (!DRY_RUN && !CASE_FILTER && !NO_CONTEXT) {
    console.log('\n📡 Requêtes de contexte libre...\n');
    const contextResults = [];

    for (let i = 0; i < CONTEXT_QUERIES.length; i++) {
      const query = CONTEXT_QUERIES[i];
      process.stdout.write(`[${i + 1}/${CONTEXT_QUERIES.length}] ${query} `);

      try {
        const xml = await fetchRss(googleNewsRssUrl(query));
        const articles = parseRssItems(xml);

        const flagged = articles.map(a => {
          const officialKws = detectOfficialDeclaration(a.title);
          const actorKws = detectNotableActor(a.title);
          return {
            ...a,
            ...(officialKws.length > 0 && { declaration_officielle: true, declaration_keywords: officialKws }),
            ...(actorKws.length > 0 && { notable_actor: true, notable_actor_keywords: actorKws }),
          };
        });

        console.log(`→ ${articles.length} résultat(s)`);
        contextResults.push({ query, articles: flagged });
      } catch (err) {
        console.log(`⚠️  ${err.message}`);
        contextResults.push({ query, error: err.message, articles: [] });
      }

      if (i < CONTEXT_QUERIES.length - 1) await sleep(DELAY_BETWEEN_SEARCHES_MS);
    }

    report.context_queries = contextResults;
    report.context_queries_count = CONTEXT_QUERIES.length;
    report.context_articles_count = contextResults.reduce((s, r) => s + r.articles.length, 0);
  }

  if (!DRY_RUN) {
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n✅ Rapport écrit : data/watch-report.json`);
    console.log(`   ${report.cases_with_updates}/${report.total_cases_checked} affaire(s) avec nouveaux articles`);
    if (report.declarations_officielles_count > 0) {
      console.log(`   📢 ${report.declarations_officielles_count} déclaration(s) officielle(s) détectée(s)`);
    }
    if (report.context_queries_count > 0) {
      console.log(`   📡 ${report.context_queries_count} requêtes contextuelles · ${report.context_articles_count} article(s)`);
    }

    if (report.cases_with_updates > 0) {
      console.log('\n📋 Résumé des nouveautés (affaires) :');
      for (const r of report.results) {
        if (r.new_articles?.length > 0) {
          console.log(`\n   ${r.case_id} — ${r.etablissement}, ${r.commune} (statut: ${r.statut_judiciaire})`);
          for (const a of r.new_articles) {
            const evolFlag = a.evolution ? ` 🔔 ${a.evolution.suggests}` : '';
            const officialFlag = a.declaration_officielle ? ` 📢 [${a.declaration_keywords.join(', ')}]` : '';
            const actorFlag = a.notable_actor ? ` 👤 [${a.notable_actor_keywords.join(', ')}]` : '';
            console.log(`     • ${a.title}${evolFlag}${officialFlag}${actorFlag}`);
            console.log(`       ${a.url}`);
            if (a.media) console.log(`       Source : ${a.media} (${a.published || '?'})`);
          }
        }
      }
    }

    const notableContext = (report.context_queries || [])
      .flatMap(r => r.articles)
      .filter(a => a.declaration_officielle || a.notable_actor);
    if (notableContext.length > 0) {
      console.log('\n📋 Articles notables (contexte libre) :');
      for (const a of notableContext) {
        const flags = [a.declaration_officielle && '📢', a.notable_actor && '👤'].filter(Boolean).join(' ');
        console.log(`   ${flags} ${a.title}`);
        console.log(`     ${a.url}`);
        if (a.media) console.log(`     Source : ${a.media} (${a.published || '?'})`);
      }
    }
  }
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err);
  process.exit(1);
});
