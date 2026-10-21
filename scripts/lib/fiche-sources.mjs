// =====================================================================
// scripts/lib/fiche-sources.mjs — étape 1 du circuit de génération : quelles sources, lesquelles sont LISIBLES ?
//
// Ne contourne aucune protection : une page qui répond 403/402, vide ou sans corps reconnu est « inaccessible » et son motif est conservé.
// Jamais d'inférence depuis un titre : une source dont on n'a pas lu le corps ne nourrit aucune ligne de la fiche.
//
// Réutilise : lirePage / rechercherBing / admissible / canonique (preuve-claim), rattacher (etat-affaire).
// Ajoute : (a) la réunion des sources de la mémoire (Neon `sources` + `case_events` + artefact public), (b) une découverte complémentaire
// par Bing Actualités (URL éditeur directe), (c) un cache disque (.cache/fiches/pages, ignoré par Git) : un document lu une fois n'est
// pas relu, la génération est rejouable sans réseau.
// =====================================================================
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { lirePage, rechercherBing, admissible, canonique, domaine } from './preuve-claim.mjs';
import { rattacher } from './etat-affaire.mjs';
import { normEtab } from '../qa/lib/rules.mjs';

const CACHE = new URL('../../.cache/fiches/pages/', import.meta.url);
const MIN_CORPS = 600; // en dessous : chapeau seul / mur de paiement partiel — pas une source lisible

// Paragraphes de bruit (scripts, publicités) : jamais envoyés au modèle ni cités.
const BRUIT = /runonuserconsent|sponsoris[ée]|pageenvironment|function\s*\(|googletag/i;
// Entités HTML laissées par l'extraction (« &laquo; », « &ecirc; », « &thinsp; ») : 29 % des pages en contenaient (mesuré sur 252) ; elles faisaient échouer la citation littérale et la détection
// des propos entre guillemets, donc perdre des faits et des déclarations. Table des entités françaises usuelles + numériques.
const ENTITES = { laquo: '«', raquo: '»', ecirc: 'ê', Ecirc: 'Ê', eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', euml: 'ë', agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', ccedil: 'ç', Ccedil: 'Ç',
  ocirc: 'ô', Ocirc: 'Ô', icirc: 'î', Icirc: 'Î', iuml: 'ï', ucirc: 'û', Ucirc: 'Û', ugrave: 'ù', Ugrave: 'Ù', oelig: 'œ', OElig: 'Œ', thinsp: ' ', nbsp: ' ', ensp: ' ', emsp: ' ', hellip: '…',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', euro: '€', middot: '·', deg: '°', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
export const decoderEntites = (t) => String(t)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITES[n] ?? m);
// Feuilles de style / scripts incrustés : un paragraphe de 30 000 caractères de CSS repoussait le texte de l'article au-delà de la fenêtre envoyée au modèle (Le Figaro : article lisible,
// jugé « ambigu » faute de texte). Mur de paiement : tout ce qui suit le marqueur (commentaires de lecteurs, articles « à lire aussi » d'AUTRES affaires) n'est pas l'article.
// Un paragraphe n'est écarté que s'il ne contient aucune prose (≥ 2 phrases lisibles) : un texte d'article mêlé à du JavaScript (La Montagne, Rennes Infos Autrement) est conservé tel quel.
const PHRASE = /[A-ZÉ][a-zéèêàçùôûîï’' ,]{40,}[.!?]/g;
const CODE = (p) => p.length > 200 && (p.match(/[{};]/g) || []).length / p.length > 0.01 && (p.match(PHRASE) || []).length < 2;
const MUR_DE_PAIEMENT = /il vous reste \d+\s?% (?:de cet article )?à (?:lire|découvrir)/i; // « Réservé aux abonnés » seul ne suffit pas : Sud Ouest l'affiche EN TÊTE d'un article qui suit
export const sansBruit = (corps) => {
  const ps = decoderEntites(String(corps)).split(/\n\n/).filter((p) => !BRUIT.test(p) && !CODE(p));
  const mur = ps.findIndex((p) => MUR_DE_PAIEMENT.test(p));
  const avant = mur > 0 ? ps.slice(0, mur).join('\n\n') : '';
  return avant.length >= MIN_CORPS ? avant : ps.join('\n\n');
};

const empreinteUrl = (u) => createHash('sha1').update(u).digest('hex').slice(0, 20);

/** Lit une page (cache disque d'abord). Rend { ok, corps, titre, motif, acces } ; acces ∈ libre | partiel | inaccessible. */
export async function lireDocument(url, { memoire = new Map(), reessayerEchecs = false } = {}) {
  const u = canonique(url);
  const fichier = new URL(`${empreinteUrl(u)}.json`, CACHE);
  let page = null;
  if (existsSync(fichier)) {
    const c = JSON.parse(readFileSync(fichier, 'utf8'));
    if (c.ok || !reessayerEchecs) page = c;
  }
  if (!page) {
    page = await lirePage(u, memoire);
    page = { ...page, url: u, lu_le: new Date().toISOString().slice(0, 10) };
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(fichier, JSON.stringify(page));
  }
  if (!page.ok) return { ...page, acces: 'inaccessible' };
  page = { ...page, corps: sansBruit(page.corps) };
  return { ...page, acces: page.corps.length >= MIN_CORPS ? 'libre' : 'partiel', motif: page.corps.length >= MIN_CORPS ? undefined : `corps trop court (${page.corps.length} car.)` };
}

const sansArrondissement = (commune) => String(commune || '').replace(/\s+\d+\s*(?:er|e|ème|eme)\b/i, '').trim();
const nonNomme = (e) => /non nomm|non préc|non prec/i.test(e || '');

/** Requêtes de découverte : jamais de guillemets ni d'arrondissement (mesuré : ils font échouer la recherche). */
export function requetesDecouverte(c) {
  const ville = sansArrondissement(c.commune);
  const villeOk = !/non pr[ée]cis/i.test(ville);
  if (nonNomme(c.etablissement)) {
    return villeOk ? [`${c.type_structure} ${ville} ${c.role_mis_en_cause} ${c.type_affaire}`, `${c.type_structure} ${ville} ${c.role_mis_en_cause} tribunal`] : [];
  }
  const etab = String(c.etablissement).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return [`${etab} ${ville}`, `${etab} ${ville} ${c.role_mis_en_cause} tribunal`];
}

/** Affaires proches (même commune, ou même structure nommée) : l'identité est le premier risque des fiches. */
export function affairesSoeurs(c, toutes) {
  const ville = sansArrondissement(c.commune).toLowerCase();
  const jetons = (e) => String(e || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((j) => j.length > 3 && !['ecole', 'maternelle', 'elementaire', 'college', 'lycee', 'creche', 'centre', 'loisirs', 'primaire', 'periscolaire', 'non', 'nommee', 'nomme'].includes(j));
  const mine = new Set(jetons(c.etablissement));
  return toutes.filter((x) => x.case_id !== c.case_id && (
    (ville && !/non pr[ée]cis/.test(ville) && sansArrondissement(x.commune).toLowerCase() === ville) ||
    (mine.size && jetons(x.etablissement).some((j) => mine.has(j)))
  )).slice(0, 5);
}

const MOTS_GENERIQUES = ['ecole', 'maternelle', 'elementaire', 'college', 'lycee', 'creche', 'centre', 'loisirs', 'primaire', 'periscolaire', 'non', 'nommee', 'nomme'];
const jetonsEtab = (e) => normEtab(e).split(/\s+/).filter((j) => j.length > 3 && !MOTS_GENERIQUES.includes(j));
const aplati = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');

/**
 * Rattachement insuffisant : la structure est NOMMÉE dans l'affaire, aucun de ses mots distinctifs n'apparaît dans le document, et une autre affaire de la même commune
 * (arrondissement compris) porte une autre structure. Commune + rôle ne distinguent alors pas les affaires (un article sur trois interpellations parisiennes « était »
 * l'affaire de chacune des trois écoles). Le nom littéral n'est pas exigé si la structure n'a pas de sœur dans la commune, ni si un mot distinctif la désigne.
 */
export function rattachementInsuffisant({ c, corps, toutes }) {
  if (nonNomme(c.etablissement)) return null;
  const mes = jetonsEtab(c.etablissement);
  if (!mes.length) return null;
  const texte = aplati(corps);
  if (mes.some((j) => texte.includes(j))) return null;
  const distinctes = toutes.filter((x) => x.case_id !== c.case_id && x.commune === c.commune && !nonNomme(x.etablissement) && !jetonsEtab(x.etablissement).some((j) => mes.includes(j)));
  return distinctes.length ? `la structure (« ${c.etablissement} ») n'est pas nommée et ${distinctes.length} autre(s) affaire(s) de ${c.commune} portent une autre structure` : null;
}

/**
 * Réunit les sources d'une affaire.
 * @param {{c:object, sourcesMemoire:{url,media,publication_date}[], extra?:object[], decouvrir?:boolean, maxDecouvertes?:number, log?:Function}} o
 * @returns {Promise<{documents:object[], requetes:string[], erreurs:string[]}>} documents : {url, media, publication_date, origine, acces, motif?, corps?, rattachement?}
 */
export async function reunirSources({ c, sourcesMemoire, extra = [], decouvrir = false, maxDecouvertes = 6, log = () => {} }) {
  const vus = new Map();
  const ajoute = (s, origine) => { const url = canonique(s.url); if (url && !vus.has(url)) vus.set(url, { url, media: s.media || domaine(url), publication_date: s.publication_date ?? s.published ?? null, origine }); };
  for (const s of sourcesMemoire) ajoute(s, 'memoire');
  for (const s of extra) ajoute(s, s.origine || 'fournie');
  const requetes = [], erreurs = [];
  if (decouvrir) {
    const trouves = [];
    for (const q of requetesDecouverte(c)) {
      requetes.push(q);
      try { for (const r of await rechercherBing(q)) if (admissible(r.url) && !vus.has(r.url) && !trouves.some((t) => t.url === r.url)) trouves.push({ url: r.url, media: r.media, publication_date: r.published, titre: r.titre }); } catch (e) { erreurs.push(`${q} : ${e.message}`); }
    }
    for (const t of trouves.slice(0, maxDecouvertes * 2)) ajoute(t, 'decouverte');
  }
  const documents = [];
  let ouvertesDecouverte = 0;
  for (const d of vus.values()) {
    if (d.origine === 'decouverte' && ouvertesDecouverte >= maxDecouvertes) continue;
    if (d.origine === 'decouverte') ouvertesDecouverte++;
    const p = await lireDocument(d.url);
    const doc = { ...d, acces: p.acces, motif: p.motif, titre: p.titre, corps: p.acces === 'libre' ? p.corps : null };
    if (p.acces === 'libre') {
      const att = rattacher(c, p.corps);
      doc.rattachement = { statut: att.rattachement, signaux: att.signaux };
      // Une page DÉCOUVERTE doit nommer la commune (et la structure si elle est nommée) : sinon elle n'est même pas envoyée au modèle.
      const communeOk = att.signaux.some((s) => s.startsWith('commune'));
      if (d.origine === 'decouverte' && (!communeOk || (!nonNomme(c.etablissement) && att.rattachement === 'NON_RATTACHABLE'))) { doc.ecarte = 'NE_NOMME_PAS_LA_STRUCTURE_ET_LA_COMMUNE'; }
    }
    log(`  · ${doc.acces.padEnd(12)} ${doc.origine.padEnd(10)} ${doc.media} — ${doc.url.slice(0, 90)}${doc.motif ? ` (${doc.motif})` : ''}${doc.ecarte ? ` → écartée : ${doc.ecarte}` : ''}`);
    documents.push(doc);
  }
  return { documents, requetes, erreurs };
}
