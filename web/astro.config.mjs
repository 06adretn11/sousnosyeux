// @ts-check
import { defineConfig } from 'astro/config';
import sitemapSny from '../scripts/lib/sitemap.mjs';

export default defineConfig({
  site: 'https://sousnosyeux.org',
  trailingSlash: 'ignore',
  // sitemap.xml généré à chaque build depuis les pages réellement produites et indexables (scripts/lib/sitemap.mjs).
  integrations: [sitemapSny()],
});
