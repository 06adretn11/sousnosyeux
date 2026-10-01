// =====================================================================
// scripts/lib/preuve-claim.mjs
//
// RECHERCHE DE PREUVE PAR CLAIM — on ne résout plus l'URL Google News.
//
//   claim candidat (affaire, acte, fenêtre de dates)
//     → recherche « établissement + commune + acte »
//     → première source LISIBLE qui nomme l'établissement ET la commune
//       et qui énonce l'acte
//     → (l'appelant) compréhension, gardes, proposition
//
// POURQUOI BING ACTUALITÉS. Google News ne rend que des identifiants
// opaques (126/126 irrécupérables, SOURCE_ACCESS #1). Le flux RSS de Bing
// Actualités rend, lui, l'URL éditeur dans le paramètre `url=` de son lien
// de clic. C'est un moteur de recherche interrogé par requête, pas un
// crawler : une requête par claim, quelques pages lues, rien n'est
// parcouru. Il est sur la même règle que la veille : gratuit, sans clé.
//
// LE TITRE N'EST PAS UNE PREUVE. Les titres et extraits que renvoie la
// recherche servent uniquement à CLASSER les pages à ouvrir. Ce qui
// qualifie une page comme candidate est lu dans son CORPS, et ce qui la
// qualifie comme preuve est décidé après (citation littérale, gardes).
// =====================================================================

import { extraireCorps } from './corps-article.mjs';
import { rattacher } from './etat-affaire.mjs';
import { actes, aplat, jetonsEtab, mots } from './routage-veille.mjs';

const UA = 'Mozilla/5.0 (compatible; sousnosyeux-watch/1.0)';

// Doctrine SOURCE_EVIDENCE #1 §6 : les agrégateurs (règle R4) et les sites
// d'opinion ne sont pas admissibles comme source primaire. Ce n'est PAS un
// classement de médias : c'est la liste des types d'acteurs exclus par nature.
const INADMISSIBLES = /(?:^|\.)(?:yahoo\.com|msn\.com|orange\.fr|news\.google\.com|bing\.com|dailymotion\.com|youtube\.com|facebook\.com|x\.com|twitter\.com|linkedin\.com|flipboard\.com|newsbreak\.com|bvoltaire\.fr|epochtimes\.fr|lemediaen442\.fr|fdesouche\.com)$/;

// Paramètres de suivi retirés : ils changeraient l'identifiant d'article (donc la mémoire) sans changer le document.
export const canonique = (u) => {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|at_|xtor|xt$|fbclid|gclid|ref$|mc_|cmpid|origin|ns_|sourceid|link_source)/i.test(k)) x.searchParams.delete(k);
    x.hash = '';
    return x.toString();
  } catch { return u; }
};
export const domaine = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const admissible = (u) => { const d = domaine(u); return d && !INADMISSIBLES.test(d); };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let derniereRecherche = 0;

/** Décode les entités du flux Bing (le titre arrive en &#233; etc.). */
const dec = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|quot|lt|gt|apos);/g, (_, n) => ({ amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" }[n]))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Une requête Bing Actualités → résultats à URL éditeur DIRECTE. */
export async function rechercherBing(q, { delaiMs = 1500, timeoutMs = 20000 } = {}) {
  const attente = derniereRecherche + delaiMs - Date.now();
  if (attente > 0) await dormir(attente);
  derniereRecherche = Date.now();
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=fr&cc=FR`;
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`Bing HTTP ${r.status}`);
  const xml = await r.text();
  return xml.split('<item>').slice(1).map((b) => {
    const champ = (n) => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [, ''])[1];
    const lien = champ('link').replace(/&amp;/g, '&');
    const cible = (lien.match(/[?&]url=([^&]+)/) || [, ''])[1];
    let direct = '';
    try { direct = canonique(decodeURIComponent(cible)); } catch { /* lien illisible : ignoré */ }
    const d = new Date(champ('pubDate'));
    return {
      titre: dec(champ('title')), url: direct, extrait: dec(champ('description')),
      media: dec(champ('News:Source')), published: Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10),
    };
  }).filter((x) => x.url && /^https?:\/\//.test(x.url));
}

/** Récupère et extrait une page. Mis en cache : un document sert plusieurs claims. */
export async function lirePage(url, cache) {
  if (cache?.has(url)) return cache.get(url);
  let res;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000), redirect: 'follow' });
    const html = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { corps, titre } = extraireCorps(html);
    if (!corps) throw new Error('structure de page non reconnue');
    res = { ok: true, corps, titre, octets: Buffer.byteLength(html), url: r.url || url };
  } catch (e) {
    res = { ok: false, motif: String(e.message).slice(0, 80), octets: 0 };
  }
  cache?.set(url, res);
  return res;
}

/** Le titre ou l'extrait nomme-t-il l'établissement ? (classement seulement : jamais une preuve) */
const nommeEtab = (r, fiche) => {
  const tm = mots(`${r.titre} ${r.extrait}`);
  const j = jetonsEtab(fiche.etablissement);
  return j.length > 0 && j.every((x) => tm.includes(' ' + x + ' '));
};

// Mots de la requête servant à CLASSER les résultats (pas à les qualifier).
function scoreRang({ r, fiche, claim }) {
  const tm = mots(`${r.titre} ${r.extrait}`);
  let s = 0;
  if (nommeEtab(r, fiche)) s += 6; // une page qui NOMME l'établissement passe avant celles qui ne portent que l'acte
  const a = new Set(actes(`${r.titre} ${r.extrait}`));
  if (claim.acte !== 'NON_QUALIFIE' && a.has(claim.acte)) s += 3;
  // Proximité de date avec la fenêtre du claim : une page publiée très
  // avant l'acte ne peut pas l'établir, une page tardive le rappelle.
  if (r.published && claim.debut) {
    const ecart = (Date.parse(r.published) - Date.parse(claim.debut)) / 864e5;
    if (ecart >= -1 && ecart <= 14) s += 2; else if (ecart < -1) s -= 3;
  }
  return s;
}

/**
 * Cherche des sources candidates pour UN claim.
 *
 * @returns {{requetes:string[], vus:number, ouvertes:number,
 *            candidats:Array, rejets:Array, erreurs:string[]}}
 *   `candidats` : pages LUES dont le corps nomme l'établissement ET la
 *   commune et énonce l'acte — dans l'ordre où l'appelant doit les essayer.
 */
export async function trouverSources({ fiche, claim, requetes, cache, maxOuvertes = 5, maxCandidats = 3, F = null,
  echecsConnus = null, noterEchec = null, exigerRole = false, imposes = null, arbitres = null }) {
  const sortie = { requetes: [], vus: 0, ouvertes: 0, candidats: [], rejets: [], erreurs: [] };
  const dejaVus = new Set();
  let resultats = [];

  // Adresses IMPOSÉES (pont manuel, fourni par un humain) : elles passent exactement les mêmes
  // contrôles qu'une page trouvée par la recherche. Un pont est indexé par titre, pas par
  // affaire : le même titre remonte sous plusieurs fiches (le verdict d'Aqueduc sous FR-2026-0001
  // ET sous celle de l'enseignant). Sans ce contrôle, il ferait autorité pour toutes.
  for (const x of imposes || []) {
    resultats.push({ titre: '', extrait: '', url: canonique(x.url), media: x.media || '', published: null });
    sortie.requetes.push('(pont manuel)');
  }

  for (const q of imposes?.length ? [] : requetes) {
    sortie.requetes.push(q);
    try {
      if (F) F.recherches_preuve++;
      const res = await rechercherBing(q);
      for (const r of res) if (!dejaVus.has(r.url)) { dejaVus.add(r.url); resultats.push(r); }
    } catch (e) { sortie.erreurs.push(String(e.message)); }
    // La 1re requête suffit quand elle a rendu de quoi choisir (au moins 3 pages admissibles
    // qui nomment l'établissement ou l'acte) ; sinon la seconde est lancée. Un seul résultat
    // ne suffit pas : c'était la cause du Titon manqué (un article sur un AUTRE établissement).
    if (resultats.filter((r) => admissible(r.url) && nommeEtab(r, fiche)).length >= 2) break;
  }
  sortie.vus = resultats.length;

  const classes = resultats
    .filter((r) => admissible(r.url))
    .map((r) => ({ r, s: scoreRang({ r, fiche, claim }) }))
    .sort((x, y) => y.s - x.s);

  for (const { r } of classes) {
    if (sortie.candidats.length >= maxCandidats || sortie.ouvertes >= maxOuvertes) break;
    // Source DÉJÀ examinée et inaccessible (403, 402, 404…) : mémorisée, réessayable
    // après un délai — on ne repaie pas une page qu'on sait fermée.
    if (echecsConnus?.has(r.url)) {
      if (F) F.pages_deja_inaccessibles++;
      sortie.rejets.push({ url: r.url, motif: `DEJA_INACCESSIBLE ${echecsConnus.get(r.url)}` }); continue;
    }
    sortie.ouvertes++;
    if (F) F.fetches++;
    const page = await lirePage(r.url, cache);
    if (F) F.octets += page.octets || 0;
    if (!page.ok) {
      sortie.rejets.push({ url: r.url, motif: page.motif });
      if (/^HTTP 4\d\d/.test(page.motif || '')) await noterEchec?.(r.url, page.motif, fiche.case_id);
      continue;
    }

    // Critère 1 de SOURCE_EVIDENCE : la page nomme l'établissement ET la commune.
    const att = rattacher(fiche, page.corps);
    const communeOk = att.signaux.some((s) => s.startsWith('commune'));
    // RATTACHEMENT DÉJÀ ARBITRÉ par un humain pour (cette affaire, cet article) : la décision persistée
    // remplace ces deux contrôles de rattachement — et eux seuls (l'acte et la date restent contrôlés).
    const arbitre = arbitres?.has(canonique(r.url)) === true;
    if (!arbitre && (att.rattachement === 'NON_RATTACHABLE' || !communeOk)) {
      sortie.rejets.push({ url: r.url, motif: 'NE_NOMME_PAS_ETABLISSEMENT_ET_COMMUNE' }); continue;
    }
    // Deux affaires distinctes au même établissement (invariant Faidherbe : Aqueduc animateur / enseignant) :
    // nommer l'établissement ne départage plus, le rôle de la personne mise en cause doit être confirmé.
    if (!arbitre && exigerRole && att.rattachement !== 'OK') {
      sortie.rejets.push({ url: r.url, motif: 'AFFAIRE_SOEUR_ROLE_NON_CONFIRME' }); continue;
    }
    // La page énonce-t-elle l'acte ? (lexique appliqué au CORPS, pas au titre.)
    if (claim.acte !== 'NON_QUALIFIE' && !actes(page.corps).includes(claim.acte)) {
      sortie.rejets.push({ url: r.url, motif: 'ACTE_ABSENT_DU_CORPS' }); continue;
    }
    sortie.candidats.push({ url: r.url, media: r.media || domaine(r.url), published: r.published, titre: r.titre, page, arbitre });
  }
  return sortie;
}
