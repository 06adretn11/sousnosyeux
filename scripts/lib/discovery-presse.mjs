// =====================================================================
// scripts/lib/discovery-presse.mjs
//
// Recherche générique de presse récente — NEW_CASE_DISCOVERY V0.
//
//   structure accueillant des mineurs × plainte × faits graves
//   → Google Actualités RSS, FENÊTRE DE DATES (after:/before:)
//   → titres, médias, dates
//
// POURQUOI GOOGLE ACTUALITÉS ICI, ALORS QUE SES LIENS SONT OPAQUES.
// La découverte n'a besoin que du titre, du média et de la date : le lien
// n'est jamais suivi. La preuve se cherche ensuite par Bing (URL éditeur
// directe, preuve-claim.mjs). L'opérateur de fenêtre est ce qui rend la
// recherche utilisable : sans lui, la requête générique ramène l'actualité
// dominante du moment (mesuré : 164 URL, 1 affaire de contrôle sur 5).
//
// AUCUN nom de lieu, d'établissement ou d'affaire connue dans les requêtes.
// =====================================================================

const UA = 'Mozilla/5.0 (compatible; sousnosyeux-watch/1.0)';

export const STRUCTURES = ['école maternelle', 'périscolaire', 'centre de loisirs', 'crèche', 'école animateur'];
export const FAITS = [
  'plainte violences sexuelles enfants',
  'plaintes agressions sexuelles suspendu',
  'soupçons faits sexuels parents plaintes enquête',
];
export const GRILLE = STRUCTURES.flatMap((s) => FAITS.map((f) => `${s} ${f}`));

const dec = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Une requête, une fenêtre [after, before[ → [{titre, media, published}] */
export async function rechercherFenetre(q, { after, before }) {
  const qq = `${q} after:${after} before:${before}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(qq)}&hl=fr&gl=FR&ceid=FR:fr`;
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Google Actualités HTTP ${r.status}`);
  const xml = await r.text();
  return xml.split('<item>').slice(1).map((b) => {
    const c = (n) => dec((b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [, ''])[1]);
    const d = new Date(c('pubDate'));
    const media = c('source');
    let titre = c('title');
    if (media && titre.endsWith(` - ${media}`)) titre = titre.slice(0, -(media.length + 3));
    return { titre, media, published: Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) };
  });
}

/** Toute la grille sur une fenêtre ; titres dédupliqués. */
export async function scannerFenetre({ after, before, pauseMs = 700, grille = GRILLE }) {
  const vus = new Map();
  const erreurs = [];
  for (const q of grille) {
    try {
      for (const x of await rechercherFenetre(q, { after, before })) {
        const cle = x.titre.toLowerCase().slice(0, 80);
        if (!vus.has(cle)) vus.set(cle, { ...x, requete: q });
      }
    } catch (e) { erreurs.push(`${q} : ${e.message}`); }
    await new Promise((r) => setTimeout(r, pauseMs));
  }
  return { items: [...vus.values()], erreurs };
}

// --- message Telegram -------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const jj = (d) => (d ? d.split('-').reverse().join('/') : 'date inconnue');

/** Texte HTML du message de décision « nouvelle affaire potentielle » à partir du payload qualifié. */
export function messageNouvelleAffaire(p) {
  const preuve = p.evidence[0];
  const autres = [...new Set(p.evidence.map((e) => e.media))].filter((m) => m !== p.source.media);
  const voisins = p.possible_matches_sny || [];
  const match = p.recommendation === 'NEW_CASE_CANDIDATE'
    ? 'Aucune affaire SNY correspondante trouvée.' +
      (voisins.length ? `\n(${voisins.length} autre(s) affaire(s) SNY dans la commune, autre(s) établissement(s) : ${voisins.map((v) => v.case_id).join(', ')}.)` : '')
    : `⚠️ Affaire(s) SNY proche(s) à vérifier : ${voisins.map((v) => v.case_id).join(', ')}.`;
  return [
    '🆕 <b>NOUVELLE AFFAIRE POTENTIELLE</b>',
    '',
    `<b>${esc(p.etablissement)}</b> · ${esc(p.commune)}`,
    '',
    esc(p.claim),
    '',
    `Stade : ${esc(p.stade_minimal)}.`,
    `Source : ${esc(p.source.media)} · ${jj(p.date_source)}`,
    `Preuve : « ${esc(cut(preuve.quote.replace(/\s+/g, ' '), 230))} » (${esc(preuve.media)})` +
      (autres.length ? `\nRecoupé par : ${esc(autres.join(', '))}.` : ''),
    p.unknowns?.length ? `\nÀ noter : ${esc(cut(p.unknowns[0], 140))}` : '',
    '',
    esc(match),
  ].filter((l) => l !== undefined).join('\n');
}

// --- comparaison de citations (preuve littérale) ---------------------
const ENTITES = { eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ugrave: 'ù', ucirc: 'û', laquo: '«', raquo: '»', nbsp: ' ', quot: '"', rsquo: "'", apos: "'", amp: '&', hellip: '…' };
export const normaliser = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITES[n.toLowerCase()] ?? m)
  .replace(/[’‘`]/g, "'").replace(/[«»“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/** La citation figure-t-elle LITTÉRALEMENT dans le corps (espaces, apostrophes et entités mis à part) ? */
export const citationPresente = (quote, corps) => normaliser(corps).includes(normaliser(quote));
