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
  // Entités nommées courantes de la presse française (« &acirc; », « &ocirc; », « &laquo; »…) : sans elles, une citation « littérale » garde le code HTML.
  .replace(/&([A-Za-z]+);/g, (m, nom) => ENTITES[nom] ?? m)
  .replace(/&amp;/g, '&');
const ENTITES = {
  acirc: 'â', Acirc: 'Â', ecirc: 'ê', Ecirc: 'Ê', icirc: 'î', Icirc: 'Î', ocirc: 'ô', Ocirc: 'Ô', ucirc: 'û', Ucirc: 'Û', euml: 'ë', iuml: 'ï', uuml: 'ü', ouml: 'ö', auml: 'ä',
  ccedil: 'ç', Ccedil: 'Ç', ugrave: 'ù', Ugrave: 'Ù', Eacute: 'É', Egrave: 'È', Agrave: 'À', oelig: 'œ', OElig: 'Œ', aelig: 'æ', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', ldquo: '“', rdquo: '”', euro: '€', copy: '©', deg: '°',
};

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

// Bloc « À lire aussi » : le titre d'UN AUTRE article. C'est une piste à explorer, jamais une preuve : il ne documente rien par lui-même.
const PISTE = /^\s*(?:à|a)\s+lire\s+(?:aussi|également|egalement)\b|^\s*lire\s+(?:aussi|également|egalement)\b|^\s*voir\s+aussi\b|^\s*sur\s+le\s+m[êe]me\s+sujet\b|^\s*pour\s+aller\s+plus\s+loin\b|^\s*(?:nos|les)\s+articles\s+(?:sur|li[ée]s)\b/i;
export const estPisteDeNavigation = (t) => PISTE.test(String(t || ''));

/** Date de publication de la page (balise méta, JSON-LD, sinon date portée par l'adresse) — `AAAA-MM-JJ` ou null, jamais devinée. */
export function datePublication(html, url = '') {
  const iso = (s) => (/^(\d{4}-\d{2}-\d{2})/.exec(String(s || '')) || [])[1] || null;
  const m = /<meta[^>]+(?:property|name)=["'](?:article:published_time|og:article:published_time)["'][^>]+content=["']([^"']+)["']/i.exec(html)
    || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i.exec(html)
    || /"datePublished"\s*:\s*"([^"]+)"/.exec(html);
  const u = /\/(20\d{2})(\d{2})(\d{2})(?:[-_/]|$)/.exec(String(url || ''));
  return iso(m?.[1]) || (u ? `${u[1]}-${u[2]}-${u[3]}` : null);
}

// Classes des blocs qui ne sont PAS l'article : liens associés, suggestions (« ranking-profile » / « suggested » chez Le Figaro), articles suivants, commentaires des lecteurs.
// Cas réel (12/11/2026) : sur une page du Figaro, deux « chapôs » d'articles recommandés (autres affaires, autres villes) étaient lus comme des phrases de l'article
// et ont produit deux faits de « territoire » (Montreuil, Paris) annoncés comme informations de cette affaire.
export const CLASSE_BLOC_LIE = '(?:read-more|related|lire-aussi|see-also|teaser|recommend|suggest|ranking-profile|article-next|more-articles|most-read|comments?__|comments?-(?:list|item|text|body|thread|wrapper|section|content)|commentaires?-(?:liste|item|texte|corps))';
// Conteneurs SÉMANTIQUES (rarement imbriqués dans eux-mêmes, balancés même dans du HTML de presse) : « encore ouvert » se décide par PROFONDEUR (ouvertures et fermetures
// de la même balise), non par la première fermeture venue — une carte de suggestion (<article class="…ranking-profile…">) contient ses propres <div> (image, légende)
// avant son paragraphe, et la première fermeture rencontrée ne la ferme pas. Les <div>, eux, ne sont pas comptés en profondeur : le HTML réel de la presse est trop
// déséquilibré pour cela (mesuré : un bloc « related » apparaissait ouvert alors qu'il était fermé) ; ils gardent la règle d'origine (première fermeture).
const CONTENEURS_PROFONDEUR = ['article', 'aside', 'section', 'ul', 'nav', 'li'];
/** Le paragraphe situé à `index` se trouve-t-il dans un bloc de liens associés, de suggestions ou de commentaires encore ouvert ? (titre voisin, pas l'article) */
export const dansBlocLie = (html, index) => {
  const avant = html.slice(0, index);
  for (const t of CONTENEURS_PROFONDEUR) {
    const ouvertures = [...avant.matchAll(new RegExp(`<${t}\\b[^>]*class=["'][^"']*${CLASSE_BLOC_LIE}[^"']*["'][^>]*>`, 'gi'))];
    for (const o of ouvertures.slice(-6)) {
      const apres = avant.slice(o.index + o[0].length);
      const ouverts = (apres.match(new RegExp(`<${t}\\b`, 'gi')) || []).length;
      const fermes = (apres.match(new RegExp(`</${t}>`, 'gi')) || []).length;
      if (fermes <= ouverts) return true;   // le conteneur « lié » est encore ouvert à cet endroit
    }
  }
  const divs = [...avant.matchAll(new RegExp(`<div\\b[^>]*class=["'][^"']*${CLASSE_BLOC_LIE}[^"']*["'][^>]*>`, 'gi'))];
  const d = divs[divs.length - 1];
  return !!d && !/<\/(?:div|aside|section|ul|nav)>/i.test(avant.slice(d.index + d[0].length));
};

/** Contenus qui ne sont jamais du texte d'article : scripts, feuilles de style, commentaires HTML. */
const sansCodeEtStyle = (html) => html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/**
 * @param {string} htmlBrut
 * @param {string} [url]  adresse de la page (résout les liens relatifs, date la page)
 * @returns {{titre: string, corps: string, paragraphes: string[], liens_associes: {titre: string, url: string}[], publie_le: string|null}}
 *          `corps` est vide si la structure de page n'est pas reconnue. Les blocs « À lire aussi », les suggestions d'autres articles et les commentaires
 *          de lecteurs ne sont PAS dans le corps : les liens sont rendus à part (`liens_associes`), comme pistes de découverte.
 */
export function extraireCorps(htmlBrut, url = '') {
  const html = sansCodeEtStyle(htmlBrut);
  const liens_associes = [];
  const paragraphes = [...html.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/gi)]
    .map((m) => ({ attrs: m[1], html: m[2], texte: nettoyer(m[2]), lie: dansBlocLie(html, m.index) }))
    .filter((p) => p.texte.length > 60)
    .filter((p) => {
      const bas = p.texte.toLowerCase();
      return !CHROME.some((c) => bas.includes(c));
    })
    .filter((p) => {
      if (!p.lie && !estPisteDeNavigation(p.texte) && !new RegExp(`class=["'][^"']*${CLASSE_BLOC_LIE}`, 'i').test(p.attrs)) return true;
      const a = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(p.html);
      if (a) {
        try { liens_associes.push({ titre: nettoyer(a[2]), url: new URL(a[1].replace(/&amp;/g, '&'), url || undefined).href }); } catch { /* lien relatif sans base : ignoré */ }
      }
      return false;
    })
    .map((p) => p.texte);

  // Le titre reste utile à `rattacher()` : il porte souvent l'établissement.
  const titre = nettoyer((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]);

  return {
    titre,
    paragraphes,
    liens_associes,
    publie_le: datePublication(htmlBrut, url),   // la date vit dans les balises méta et le JSON-LD (<script>) : lue sur la page brute
    corps: paragraphes.length ? [titre, ...paragraphes].join('\n\n') : '',
  };
}
