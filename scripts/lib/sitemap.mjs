// =====================================================================
// scripts/lib/sitemap.mjs — sitemap.xml généré à CHAQUE build (lot D)
//
// Principe : la population du sitemap est celle des pages RÉELLEMENT générées
// par le build (liste fournie par Astro à la fin du build) ET indexables au
// vu de leur propre HTML. Aucune liste manuelle, aucune déduction depuis le
// catalogue d'affaires, aucun crawl de la production : une fiche n'a d'URL
// que si la route [id].astro l'a produite (donc approuvée), un Hub que si
// la route territoires/[hub].astro l'a produit.
//
// Une page est EXCLUE quand son HTML dit qu'elle ne doit pas être indexée
// (noindex), n'a pas de canonical, en a plusieurs, ou une canonical qui
// n'est pas sa propre URL finale (cohérence sitemap ↔ canonicals), ou
// quand c'est une redirection, un brouillon, une page technique.
// Ni lastmod, ni priority, ni changefreq : une date de build ne doit pas
// devenir une fausse date de mise à jour.
// =====================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://sousnosyeux.org';
export const SITEMAP_URL = `${SITE}/sitemap.xml`;

/** URL finale servie d'un chemin de page généré : toujours avec barre finale (Cloudflare redirige la forme sans barre). */
export function urlDePage(pathname) {
  const p = '/' + String(pathname ?? '').replace(/^\/+/, '');
  return SITE + (p.endsWith('/') ? p : p + '/');
}

const attr = (balise, nom) => {
  const m = balise.match(new RegExp(`\\b${nom}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3]) : null;
};
const balises = (html, nom) => html.match(new RegExp(`<${nom}\\b[^>]*>`, 'gi')) ?? [];

/** Ce que le HTML initial d'une page dit d'elle-même. */
export function lireIndexation(html) {
  const robots = balises(html, 'meta')
    .filter((b) => (attr(b, 'name') ?? '').toLowerCase() === 'robots')
    .map((b) => attr(b, 'content') ?? '');
  const canonicals = balises(html, 'link')
    .filter((b) => (attr(b, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'))
    .map((b) => attr(b, 'href') ?? '');
  const refresh = balises(html, 'meta').some((b) => (attr(b, 'http-equiv') ?? '').toLowerCase() === 'refresh');
  return { noindex: robots.some((c) => /\bnoindex\b|\bnone\b/i.test(c)), canonicals, refresh };
}

/**
 * Décision pour une page générée : { url, inclus, raison }.
 * @param {string} pathname chemin de la page (ex. "affaires/fr-2026-0001/", "" pour l'accueil)
 * @param {string} html     HTML initial de la page
 */
export function analyserPage(pathname, html) {
  const url = urlDePage(pathname);
  const chemin = '/' + String(pathname ?? '').replace(/^\/+/, '');
  if (/[?#]/.test(chemin)) return { url, inclus: false, raison: 'parametre-ou-fragment' };
  if (/^\/brouillons(\/|$)/.test(chemin)) return { url, inclus: false, raison: 'brouillon' };
  if (/^\/(404|500)(\/|\.html)?$/.test(chemin) || /\.[a-z0-9]+$/i.test(chemin)) return { url, inclus: false, raison: 'technique' };
  const i = lireIndexation(html);
  if (i.refresh) return { url, inclus: false, raison: 'redirection' };
  if (i.noindex) return { url, inclus: false, raison: 'noindex' };
  if (i.canonicals.length === 0) return { url, inclus: false, raison: 'canonical-absente' };
  if (i.canonicals.length > 1) return { url, inclus: false, raison: 'canonical-multiple' };
  if (i.canonicals[0] !== url) return { url, inclus: false, raison: 'canonical-differente' };
  return { url, inclus: true, raison: null };
}

const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** @param {{pathname: string, html: string}[]} pages */
export function construireSitemap(pages) {
  const decisions = pages.map((p) => analyserPage(p.pathname, p.html));
  const urls = [...new Set(decisions.filter((d) => d.inclus).map((d) => d.url))].sort();
  const exclus = decisions.filter((d) => !d.inclus).map((d) => ({ url: d.url, raison: d.raison }));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${echapper(u)}</loc></url>\n`).join('')
    + '</urlset>\n';
  return { xml, urls, exclus };
}

/** HTML d'une page générée dans `dir` (dossier de sortie du build) ; null si introuvable. */
export function lireHtmlGenere(dir, pathname) {
  const rel = String(pathname ?? '').replace(/^\/+/, '');
  const candidats = rel === '' || rel.endsWith('/') ? [join(dir, rel, 'index.html')] : [join(dir, rel, 'index.html'), join(dir, rel + '.html')];
  for (const f of candidats) if (existsSync(f)) return readFileSync(f, 'utf8');
  return null;
}

/** Intégration Astro native (aucune dépendance) : écrit dist/sitemap.xml à la fin de chaque build. */
export default function sitemapSny() {
  return {
    name: 'sny-sitemap',
    hooks: {
      'astro:build:done': ({ dir, pages, logger }) => {
        const sortie = fileURLToPath(dir);
        const lues = pages.map((p) => ({ pathname: p.pathname, html: lireHtmlGenere(sortie, p.pathname) }));
        const manquantes = lues.filter((p) => p.html === null);
        const { xml, urls, exclus } = construireSitemap(lues.filter((p) => p.html !== null));
        if (urls.length === 0) throw new Error('sitemap : aucune page indexable générée — build refusé plutôt que publier un sitemap vide');
        writeFileSync(join(sortie, 'sitemap.xml'), xml);
        logger.info(`sitemap.xml : ${urls.length} URL ; exclues : ${exclus.length}${exclus.length ? ' (' + [...new Set(exclus.map((e) => e.raison))].join(', ') + ')' : ''}${manquantes.length ? ` ; HTML introuvable : ${manquantes.length}` : ''}`);
      },
    },
  };
}
