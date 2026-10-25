// =====================================================================
// scripts/lib/pistes.mjs — quels liens « À lire aussi » valent d'être SUIVIS ? Fonction PURE (aucun réseau, aucune base).
//
// Un lien associé est une PISTE de découverte, jamais une preuve : son titre annonce un fait, c'est l'article lié qui peut le documenter.
// On ne suit que ce qui est borné : même éditeur que la source, jamais la source elle-même, jamais deux fois, au plus `max` par source,
// et seulement si le TITRE annonce un fait du vocabulaire fermé (mobilisation, mesure d'une institution, acte judiciaire). Un titre
// qui n'annonce rien de tel n'est pas exploré : pas d'exploration générale du Web.
// La profondeur (1 seule) est tenue par l'appelant : l'article lié ne fournit pas de pistes à son tour.
// =====================================================================
import { extraireReactions } from './evenement-institutionnel.mjs';
import { actes } from './routage-veille.mjs';

export const PISTES_PAR_SOURCE = 2;
const hote = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

/**
 * @param {{titre:string, url:string}[]} liens  liens associés trouvés dans la source (extraireCorps)
 * @param {{url:string, deja?:Set<string>, max?:number}} o  adresse de la source ; adresses déjà suivies (mutée : on y ajoute les retenues)
 * @returns {{titre:string, url:string}[]}
 */
export function pistesASuivre(liens, { url, deja = new Set(), max = PISTES_PAR_SOURCE }) {
  const retenues = [];
  for (const l of liens || []) {
    if (retenues.length >= max) break;
    if (!l?.url || !l?.titre || l.url === url || deja.has(l.url) || hote(l.url) !== hote(url)) continue;
    if (!extraireReactions(l.titre).length && !actes(l.titre).length) continue;
    deja.add(l.url);
    retenues.push({ titre: l.titre, url: l.url });
  }
  return retenues;
}

/**
 * Suit les pistes retenues, UNE fois (profondeur 1 : l'appelant ne rappelle pas cette fonction depuis l'article lié).
 * `lire(url)` rend une page lue ({ok, motif?, publie_le?}) ; `qualifier({page, piste})` lit et analyse l'article lié comme n'importe quelle source.
 * Un article inaccessible ou sans fait ne produit rien : la piste est seulement consignée, l'incertitude de la source d'origine reste entière.
 * @returns {Promise<object[]>} une ligne de consignation par piste suivie
 */
export async function suivrePistes({ liens, url, deja, max, lire, qualifier, compte = () => {} }) {
  const consignation = [];
  for (const p of pistesASuivre(liens, { url, deja, max })) {
    compte('pistes_suivies');
    const page = await lire(p.url);
    if (!page?.ok) { compte('pistes_inaccessibles'); consignation.push({ url: p.url, titre: p.titre, issue: 'INACCESSIBLE', motif: page?.motif ?? 'page non lue' }); continue; }
    const q = await qualifier({ page, piste: p });
    consignation.push({ url: p.url, titre: p.titre, publie_le: page.publie_le ?? null, sortie: q.sortie, rattachement: q.rattachement, reutilisee: !!q.reutilisee });
  }
  return consignation;
}
