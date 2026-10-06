// =====================================================================
// scripts/lib/scan-bing.mjs — second capteur de Discovery : Bing Actualités, fenêtre glissante, URL éditeur DIRECTE.
//
// POURQUOI. Google Actualités donne un titre, un média, une date — mais un lien opaque : retrouver l'article par une
// recherche sur son titre échoue dans ~60 % des cas (mesuré sur un rejeu de 100 jours). Bing Actualités rend, lui,
// l'URL de l'éditeur : l'article se relit directement, sans recherche intermédiaire. Les deux capteurs se complètent
// (rappels différents) ; leurs signaux sont dédupliqués par titre puis regroupés par histoire.
//
// `qft=interval="8"` = « dernière semaine » (4 = heure, 7 = 24 h, 8 = semaine, 9 = mois).
// Même grille de requêtes que Google (structure × faits) : aucun nom de lieu, d'établissement ou d'affaire connue.
// =====================================================================
import { canonique, admissible } from './preuve-claim.mjs';
import { GRILLE } from './discovery-presse.mjs';

const UA = 'Mozilla/5.0 (compatible; sousnosyeux-watch/1.0)';
const dec = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|quot|lt|gt|apos);/g, (_, n) => ({ amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" }[n]))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const INTERVALLE = { 1: 7, 7: 8, 30: 9 }; // jours → code Bing

async function rechercher(q, code) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=fr&cc=FR&qft=${encodeURIComponent(`interval="${code}"`)}`;
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Bing HTTP ${r.status}`);
  const xml = await r.text();
  return xml.split('<item>').slice(1).map((b) => {
    const champ = (n) => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [, ''])[1];
    const lien = champ('link').replace(/&amp;/g, '&');
    const cible = (lien.match(/[?&]url=([^&]+)/) || [, ''])[1];
    let direct = '';
    try { direct = canonique(decodeURIComponent(cible)); } catch { /* lien illisible : ignoré */ }
    const d = new Date(champ('pubDate'));
    return { titre: dec(champ('title')), media: dec(champ('News:Source')), url: direct, published: Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) };
  }).filter((x) => x.titre && /^https?:\/\//.test(x.url) && admissible(x.url));
}

/** Toute la grille sur la fenêtre (`jours` ≤ 7 → semaine, sinon mois) ; signaux dédupliqués par URL. */
export async function scannerBing({ jours = 7, pauseMs = 1500, grille = GRILLE } = {}) {
  const code = jours <= 1 ? INTERVALLE[1] : jours <= 7 ? INTERVALLE[7] : INTERVALLE[30];
  const vus = new Map();
  const erreurs = [];
  for (const q of grille) {
    try { for (const x of await rechercher(q, code)) if (!vus.has(x.url)) vus.set(x.url, { ...x, requete: q }); } catch (e) { erreurs.push(`${q} : ${e.message}`); }
    await new Promise((r) => setTimeout(r, pauseMs));
  }
  return { items: [...vus.values()], erreurs };
}
