// Lot D — sitemap.xml généré au build, canonicals, déclaration dans robots.txt.
// 1) logique pure (exclusions, unicité, population qui suit les pages générées, aucune date) ;
// 2) source (Layout, config, robots d'origine) ;
// 3) si web/dist existe : contrôle EXHAUSTIF du build (sitemap = pages indexables générées, canonicals concordantes,
//    aucune URL de fiche pour une affaire sans fiche). Sans dist (cas de la CI de promotion) : ignoré, dit.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyserPage, construireSitemap, urlDePage, SITE, SITEMAP_URL } from '../lib/sitemap.mjs';

const racine = fileURLToPath(new URL('../../', import.meta.url));
let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const page = (chemin, { canonical = urlDePage(chemin), robots = null, extra = '' } = {}) => ({
  pathname: chemin,
  html: `<!doctype html><html><head><title>x</title>${robots ? `<meta name="robots" content="${robots}" />` : ''}${canonical === null ? '' : `<link rel="canonical" href="${canonical}">`}${extra}</head><body></body></html>`,
});

t('URL finale : origine publique, barre finale, accueil = racine', () => {
  assert.equal(urlDePage(''), `${SITE}/`);
  assert.equal(urlDePage('affaires/fr-2026-0001/'), `${SITE}/affaires/fr-2026-0001/`);
  assert.equal(urlDePage('/methodologie'), `${SITE}/methodologie/`);
  assert.equal(SITEMAP_URL, 'https://sousnosyeux.org/sitemap.xml');
});
t('inclusion : page avec une seule canonical égale à sa propre URL', () => {
  assert.deepEqual(analyserPage('methodologie/', page('methodologie/').html), { url: `${SITE}/methodologie/`, inclus: true, raison: null });
});
t('exclusions motivées : noindex, canonical absente / multiple / différente, redirection, brouillon, technique, paramètre, fragment', () => {
  const raison = (p, h) => analyserPage(p, h ?? page(p).html).raison;
  assert.equal(raison('revue-parents/', page('revue-parents/', { canonical: null, robots: 'noindex,nofollow,noarchive' }).html), 'noindex');
  assert.equal(raison('a/', page('a/', { canonical: null }).html), 'canonical-absente');
  assert.equal(raison('a/', page('a/', { extra: `<link rel="canonical" href="${SITE}/b/">` }).html), 'canonical-multiple');
  assert.equal(raison('a/', page('a/', { canonical: `${SITE}/` }).html), 'canonical-differente', 'aucune canonical globale vers l’accueil');
  assert.equal(raison('a/', page('a/', { canonical: `${SITE}/a` }).html), 'canonical-differente', 'la barre finale effectivement servie fait foi');
  assert.equal(raison('a/', page('a/', { extra: '<meta http-equiv="refresh" content="0;url=/b/">' }).html), 'redirection');
  assert.equal(raison('brouillons/hubs/x/'), 'brouillon');
  assert.equal(raison('404.html', '<html></html>'), 'technique');
  assert.equal(raison('a/?utm_source=x'), 'parametre-ou-fragment');
  assert.equal(raison('a/#affaire-fr-2026-0001'), 'parametre-ou-fragment');
});
t('sitemap : XML bien formé, URL absolues et uniques, triées, ni lastmod ni priority ni changefreq', () => {
  const { xml, urls } = construireSitemap([page(''), page('b/'), page('b/'), page('a/')]);
  assert.deepEqual(urls, [`${SITE}/`, `${SITE}/a/`, `${SITE}/b/`]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.equal((xml.match(/<loc>/g) || []).length, 3);
  assert.ok(!/lastmod|priority|changefreq/i.test(xml));
  assert.ok(urls.every((u) => /^https:\/\/sousnosyeux\.org\//.test(u) && !/[?#]/.test(u)));
});
t('la population suit les pages générées : une fiche de plus ou de moins se retrouve au build suivant, sans liste manuelle', () => {
  const base = [page(''), page('affaires/fr-2026-0001/'), page('affaires/fr-2026-0002/'), page('territoires/landes/')];
  const avant = construireSitemap(base).urls;
  const plus = construireSitemap([...base, page('affaires/fr-2026-0143/')]).urls;
  const moins = construireSitemap(base.filter((p) => p.pathname !== 'affaires/fr-2026-0002/')).urls;
  assert.deepEqual(plus.filter((u) => !avant.includes(u)), [`${SITE}/affaires/fr-2026-0143/`]);
  assert.deepEqual(avant.filter((u) => !moins.includes(u)), [`${SITE}/affaires/fr-2026-0002/`]);
  // une affaire du catalogue sans page générée n'a pas d'URL
  assert.ok(!avant.includes(`${SITE}/affaires/fr-2026-0143/`));
});
t('source : Layout émet la canonical (absente si noindex), la config enregistre l’intégration, aucun module tiers', () => {
  const layout = readFileSync(join(racine, 'web/src/layouts/Layout.astro'), 'utf8');
  assert.ok(/noindex \? <meta name="robots"[^>]*\/> : <link rel="canonical" href=\{canonical\} \/>/.test(layout));
  assert.ok(/new URL\(path === '\/' \? '\/' : path \+ '\/'/.test(layout), 'URL propre : ni paramètre ni fragment');
  const conf = readFileSync(join(racine, 'web/astro.config.mjs'), 'utf8');
  assert.ok(conf.includes("import sitemapSny from '../scripts/lib/sitemap.mjs'") && /integrations:\s*\[sitemapSny\(\)\]/.test(conf));
  const pkg = JSON.parse(readFileSync(join(racine, 'web/package.json'), 'utf8'));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /sitemap/i.test(d)), 'aucune dépendance ajoutée');
});
t('robots d’origine : déclaration Sitemap exacte ; ni bloc géré Cloudflare recopié ni nouvelle restriction', () => {
  const r = readFileSync(join(racine, 'web/public/robots.txt'), 'utf8');
  assert.ok(r.split(/\r?\n/).includes(`Sitemap: ${SITEMAP_URL}`));
  assert.ok(!/Disallow|Cloudflare|Content-Signal|User-agent/i.test(r));
});

// ---- contrôle exhaustif du build, si présent -------------------------------------------------------------
const dist = join(racine, 'web/dist');
if (!existsSync(join(dist, 'sitemap.xml'))) {
  console.log('  (web/dist/sitemap.xml absent : contrôle exhaustif du build ignoré — build requis)');
} else {
  const fichiers = []; (function marche(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); e.isDirectory() ? marche(p) : /\.html$/.test(e.name) && fichiers.push(p); } })(dist);
  const pages = fichiers.map((f) => { const rel = relative(dist, f).replace(/\\/g, '/').replace(/index\.html$/, ''); return { pathname: rel, html: readFileSync(f, 'utf8') }; });
  const xml = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  const servies = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  t('build : sitemap = exactement les pages générées indexables (concordance sitemap ↔ canonicals ↔ noindex)', () => {
    const attendues = construireSitemap(pages).urls;
    assert.deepEqual([...servies].sort(), attendues);
    assert.equal(new Set(servies).size, servies.length, 'URL uniques');
    assert.ok(servies.length > 0 && servies.every((u) => u.startsWith(`${SITE}/`) && u.endsWith('/') && !/[?#]/.test(u)));
    for (const p of pages) {
      const i = analyserPage(p.pathname, p.html);
      const dit = servies.includes(i.url);
      if (/<meta name="robots" content="[^"]*noindex/i.test(p.html)) assert.ok(!dit && !/rel="canonical"/.test(p.html), `${i.url} : noindex ⇒ hors sitemap, sans canonical`);
      else { assert.ok(dit, `${i.url} : indexable ⇒ dans le sitemap (${i.raison})`); assert.equal((p.html.match(/<link rel="canonical"/g) || []).length, 1, `${i.url} : une seule canonical`); }
    }
  });
  t('build : aucune URL de fiche pour une affaire sans fiche ; fiches du sitemap = pages de fiche générées', () => {
    const fiches = servies.filter((u) => u.startsWith(`${SITE}/affaires/`));
    const generees = pages.filter((p) => p.pathname.startsWith('affaires/')).map((p) => urlDePage(p.pathname)).sort();
    assert.deepEqual([...fiches].sort(), generees);
    const evt = JSON.parse(readFileSync(join(racine, 'data/evenements.json'), 'utf8'));
    const cases = JSON.parse(readFileSync(join(racine, 'data/cases.json'), 'utf8'));
    const approuvees = Object.keys(evt.fiches_approuvees ?? {}).map((i) => urlDePage(`affaires/${i.toLowerCase()}/`));
    const frais = statSync(join(dist, 'sitemap.xml')).mtimeMs >= statSync(join(racine, 'data/evenements.json')).mtimeMs; // dist périmé : on ne compare pas aux données
    if (frais) assert.deepEqual([...fiches].sort(), approuvees.sort());
    const ids = (Array.isArray(cases) ? cases : cases.cases ?? []).map((c) => c.case_id);
    const sansFiche = ids.filter((i) => !approuvees.includes(urlDePage(`affaires/${i.toLowerCase()}/`)));
    for (const i of sansFiche) assert.ok(!servies.includes(urlDePage(`affaires/${i.toLowerCase()}/`)), `${i} : sans fiche ⇒ sans URL`);
    console.log(`    (${fiches.length} fiches dans le sitemap ; ${sansFiche.length} affaires publiées sans fiche : ${sansFiche.join(', ') || '—'})`);
  });
}
console.log(`\n${n} contrôles sitemap / canonicals : OK`);
