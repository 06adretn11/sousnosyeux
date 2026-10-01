// =====================================================================
// scripts/lib/corps-article.mjs — extraction du corps d'un article.
//
// Extrait de `scripts/fetch-article.mjs`, qui en était le seul porteur et
// n'était appelable qu'en ligne de commande. La chaîne de maintenance a
// besoin de la même extraction dans le même processus : d'où cette
// bibliothèque. Le comportement est inchangé.
//
// POURQUOI PAS LA PAGE BRUTE : elle noie l'article sous le menu, le pied
// de page et les articles liés, et l'extracteur de `etat-affaire` finit
// par citer la navigation. Constaté sur la page France 3 de l'affaire
// Vigée-Lebrun : 29 792 caractères dont ~28 000 de chrome, et la primitive
// en tirait « procès » au lieu de « condamnation ».
// =====================================================================

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&rsquo;|&apos;/g, "'")
  .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
  .replace(/&amp;/g, '&');

export const nettoyer = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Bruit de page : navigation, partage, articles liés. Reconnu par des
 * marqueurs de chrome, pas par position — la position varie d'un site à
 * l'autre, les marqueurs beaucoup moins.
 */
export const CHROME = [
  'nouvelle fenêtre', 'accéder au contenu', 'accéder au menu', 'fermer le menu',
  'consulter la météo', 'newsletters', 'voir toute l’actu', 'voir toute l\'actu',
  'copier le lien', 'sur facebook', 'sur whatsapp', 'afficher en priorité',
  'en ce moment', 'direct tv', 'direct radio', 'nos applications', 'cookies',
];

/**
 * @param {string} html
 * @returns {{titre: string, corps: string, paragraphes: string[]}}
 *          `corps` est vide si la structure de page n'est pas reconnue.
 */
export function extraireCorps(html) {
  const paragraphes = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => nettoyer(m[1]))
    .filter((t) => t.length > 60)
    .filter((t) => {
      const bas = t.toLowerCase();
      return !CHROME.some((c) => bas.includes(c));
    });

  // Le titre reste utile à `rattacher()` : il porte souvent l'établissement.
  const titre = nettoyer((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]);

  return {
    titre,
    paragraphes,
    corps: paragraphes.length ? [titre, ...paragraphes].join('\n\n') : '',
  };
}
