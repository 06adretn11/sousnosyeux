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

const CACHE = new URL('../../.cache/fiches/pages/', import.meta.url);
const MIN_CORPS = 600; // en dessous : chapeau seul / mur de paiement partiel — pas une source lisible

// Paragraphes de bruit (scripts, publicités) : jamais envoyés au modèle ni cités.
const BRUIT = /runonuserconsent|sponsoris[ée]|pageenvironment|function\s*\(|googletag/i;
const sansBruit = (corps) => String(corps).split(/\n\n/).filter((p) => !BRUIT.test(p)).join('\n\n');

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
