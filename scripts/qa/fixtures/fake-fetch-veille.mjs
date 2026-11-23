// Faux `fetch` pour le test de la veille (module préchargé par --import). Aucun réseau. Mode lu dans SNY_FAKE_MODE :
//   « down »  : toute requête répond HTTP 503 (service indisponible)
//   « mixte » : affaires SYNTHÉTIQUES — Alpha : résultats ; Beta : 1er essai 503 puis résultats (reprise) ;
//               Gamma : flux VIDE aux requêtes quotées, résultat au REPLI sans guillemets ; Delta : toujours 503 ;
//               Epsilon : requête quotée MAIGRE (1 article déjà cité), le REPLI ramène un article NOUVEAU ;
//               Zeta : requête RICHE (4 articles déjà cités) : pas de repli
import { writeFileSync } from 'node:fs';
const mode = process.env.SNY_FAKE_MODE || 'mixte';
const appels = new Map();
const flux = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${items.map((t) => `<item><title>${t}</title><link>https://news.google.com/rss/articles/CBMi${t.length}</link><pubDate>${/NOUVEAU/.test(t) ? 'Fri, 20 Nov 2026 08:00:00 GMT' : 'Mon, 16 Nov 2026 08:00:00 GMT'}</pubDate><source url="https://www.example-presse.fr">Presse Exemple</source></item>`).join('')}</channel></rss>`;
const rep = (corps, status = 200) => new Response(corps, { status, headers: { 'content-type': 'application/rss+xml' } });
// SNY_FAKE_COMPTE : fichier où écrire, à la sortie, le NOMBRE de requêtes émises (mesure des relances ; aucune URL n'est écrite).
if (process.env.SNY_FAKE_COMPTE) process.on('exit', () => writeFileSync(process.env.SNY_FAKE_COMPTE, JSON.stringify({ total: [...appels.values()].reduce((a, b) => a + b, 0) })));
globalThis.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  appels.set(u, (appels.get(u) || 0) + 1);
  if (mode === 'down') return rep('indisponible', 503);
  // « ok-puis-503 » : la première affaire (Alpha) répond, toutes les suivantes sont en HTTP 503 (service qui se dégrade en cours de passage).
  if (mode === 'ok-puis-503') return /Alpha/i.test(u) ? rep(flux(['Exemple Alpha : audience annoncée'])) : rep('indisponible', 503);
  if (mode === 'vide') return rep(flux([]));   // flux RSS valides mais VIDES pour toutes les requêtes (limitation silencieuse suspectée)
  // « selon-env » : SNY_FAKE_ECHECS = noms (séparés par des virgules) dont les requêtes répondent HTTP 503 ; tous les autres noms répondent un article. Sert au parcours
  // « passage incomplet → reprise bornée » sur base locale isolée (un passage échoue pour certains noms, le suivant réussit).
  if (mode === 'selon-env') {
    const noms = String(process.env.SNY_FAKE_ECHECS || '').split(',').map((s) => s.trim()).filter(Boolean);
    return noms.some((n) => u.includes(n)) ? rep('indisponible', 503) : rep(flux([`${(/Exemple (\w+)/.exec(u) || [])[1] || 'X'} Exemple : audience annoncée`]));
  }
  if (/Delta/i.test(u)) return rep('indisponible', 503);
  if (/Beta/i.test(u)) return appels.get(u) === 1 ? rep('indisponible', 503) : rep(flux(['Exemple Beta : enquête ouverte']));
  if (/Gamma/i.test(u)) return u.includes('"École Exemple Gamma"') ? rep(flux([])) : rep(flux(['Gamma Exemple : un animateur placé en garde à vue']));
  if (/Epsilon/i.test(u)) return u.includes('"École Exemple Epsilon"') ? rep(flux(['Epsilon Exemple : article déjà cité'])) : rep(flux(['Epsilon Exemple : article déjà cité', 'Epsilon Exemple : NOUVEAU fait']));
  if (/Zeta/i.test(u)) return rep(flux(['Zeta 1 déjà cité', 'Zeta 2 déjà cité', 'Zeta 3 déjà cité', 'Zeta 4 déjà cité']));
  if (/Alpha/i.test(u)) return rep(flux(['Exemple Alpha : audience annoncée']));
  return rep(flux([]));
};
