// =====================================================================
// scripts/lib/sources-suivies.mjs — publications PUBLIQUES d'organismes suivis (associations, services d'aide aux victimes,
// replis institutionnels), raccordées à la Maintenance existante.
//
//   registre (data/associations-watchlist.json)
//     → lecture des points d'entrée (index HTML, flux RSS validé, pages de service) avec le lecteur existant
//       (extraireCorps) + deux extensions démontrées : PDF (pdfjs-dist) et texte intégral quand les <p> ne portent rien
//     → identité documentaire (URL canonique ; paramètres fonctionnels conservés ; www ≠ sans www)
//     → mémoire (`source_resolutions`, une ligne par document : empreinte de SUBSTANCE, dernier succès, incident)
//     → classement déterministe (aucun modèle) : AFFAIRE · RATTACHEMENT_SUSPENDU · SIGNAL_AFFAIRE_POSSIBLE ·
//       RESSOURCE · POSITION_GENERALE · HORS_PERIMETRE
//
// Ce module ne décide RIEN d'éditorial et n'écrit rien lui-même : `maintenance-cycle.mjs --sources-suivies` l'appelle,
// construit les propositions dans `state_proposals` (validation humaine habituelle) et écrit la mémoire hors `--dry-run`.
//
// Doctrine appliquée ici (kit du 05/11/2026) :
//   · une publication d'organisme documente ce que CET organisme déclare : jamais un état judiciaire, jamais une accusation établie ;
//   · le siège d'un organisme ne donne aucune portée territoriale : seul le TEXTE du document rattache (établissement + commune) ;
//   · un échec de lecture n'est jamais « aucune actualité » : l'incident est consigné, le dernier état réussi est conservé ;
//   · un changement de gabarit (menu, dons, compteurs) ne change pas l'empreinte ; une correction de texte, si.
// =====================================================================

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extraireCorps, nettoyer, CHROME } from './corps-article.mjs';
import { canonique } from './preuve-claim.mjs';
import { filtrer, detecterTerritoire, aplatir, parserRSS } from './capteurs.mjs';
import { resoudre } from './resolver.mjs';
import { jetonsEtab } from './routage-veille.mjs';

export const SOURCES_SUIVIES_VERSION = 'sources-suivies-0.2.0';
// Même agent que lirePage (preuve-claim.mjs) : un seul lecteur public, identifiable, sans déguisement.
export const UA = 'Mozilla/5.0 (compatible; sousnosyeux-watch/1.0)';
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const JOUR = 864e5;

// ---------------------------------------------------------------------
// 1. REGISTRE
// ---------------------------------------------------------------------
/**
 * Pages suivies, dédupliquées par URL canonique : une page commune à deux organismes (paris.fr pour l'OSE et PAV) est lue UNE fois
 * et garde SON émetteur. Les organismes sans page (identité à confirmer, anciennes entrées sans URL) restent dans le registre.
 * @returns {{ organismes: object[], pages: object[] }}
 */
export function chargerRegistre(chemin) {
  const brut = JSON.parse(readFileSync(chemin, 'utf8'));
  const organismes = Array.isArray(brut) ? brut : brut.organismes;
  const pages = new Map();
  for (const o of organismes) {
    for (const p of o.suivi?.pages || []) {
      const url = canonique(p.url);
      const deja = pages.get(url);
      if (deja) {
        if (deja.emetteur !== p.emetteur) throw new Error(`registre : ${url} déclarée avec deux émetteurs (${deja.emetteur} / ${p.emetteur})`);
        deja.organismes.push(o.id);
        continue;
      }
      pages.set(url, { ...p, url, organismes: [o.id] });
    }
  }
  return { organismes, pages: [...pages.values()] };
}

// ---------------------------------------------------------------------
// 2. LECTURE
// ---------------------------------------------------------------------
const WAF = /tiger protect|security check|veuillez activer javascript|verify that this request is legitimate|cf-chl|just a moment/i;

/** Texte intégral d'une page dont les <p> ne portent rien (fiches de réseau, pages de service) : <main>/<article>/<body>, sans navigation. */
export function texteIntegral(html) {
  let h = String(html).replace(/<(script|style|noscript|svg|template|form|select|button)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|nav|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const zone = /<main\b[\s\S]*?<\/main>/i.exec(h)?.[0] || /<article\b[\s\S]*?<\/article>/i.exec(h)?.[0] || /<body\b[\s\S]*?<\/body>/i.exec(h)?.[0] || h;
  return zone.replace(/<(?:br|\/p|\/div|\/li|\/h\d|\/tr|\/td|\/th|\/section|\/dd|\/dt)\b[^>]*>/gi, '\n')
    .split('\n').map((l) => nettoyer(l)).filter((l) => l.length > 2 && !CHROME.some((c) => l.toLowerCase().includes(c)))
    .join('\n');
}

/** Texte d'un PDF, page par page, avec un repère « [p. N] » (l'emplacement du passage probant reste citable). */
async function textePdf(octets) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const tache = getDocument({ data: new Uint8Array(octets), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await tache.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const t = tc.items.map((x) => x.str + (x.hasEOL ? '\n' : '')).join('').replace(/[ \t]+/g, ' ').trim();
    pages.push(`[p. ${i}]\n${t}`);
  }
  const meta = await doc.getMetadata().catch(() => null);
  await tache.destroy();
  return { texte: pages.join('\n\n'), nb_pages: doc.numPages, pages_sans_texte: pages.filter((p) => p.split('\n').length < 2 || p.length < 15).length,
    // Métadonnée technique du fichier : JAMAIS une date de publication (un PDF peut être régénéré).
    pdf_modifie_le: /D:(\d{4})(\d{2})(\d{2})/.exec(meta?.info?.ModDate || '')?.slice(1).join('-') || null };
}

const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
/** Date ÉCRITE en tête d'un communiqué (« Paris, le 12 mai 2026 ») — la date que l'émetteur donne à son texte, jamais déduite. */
export function dateEntete(texte) {
  const debut = aplatir(String(texte).slice(0, 600));
  // En DÉBUT DE LIGNE seulement : « paru dans Le Parisien, le 20 mai 2026 » au milieu d'une phrase est la date d'un autre texte.
  const m = /(?:^|\n)\s*[a-z' -]{2,40},\s+le\s+(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})/.exec(debut);
  if (!m || !MOIS[m[2]]) return null;
  return `${m[3]}-${String(MOIS[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

/** Liens d'un index : même site (www indifférent pour COMPARER, jamais pour identifier), hors navigation, hors pages techniques. */
const LIEN_TECHNIQUE = /\/(?:category|categorie|tag|author|auteur|page\/\d+|feed|wp-json|wp-login|wp-admin|search|recherche|panier|cart|mon-compte|login|connexion|contact|contactez-nous|faire-un-don|don|dons|soutenir|nous-soutenir|adherer|adhesion|mentions-legales|politique[\w-]*|cookies|plan-du-site|newsletter|boutique|recrutement|nous-rejoindre|offres-d-emploi|benevolat|devenir-benevole|espace-adherent)(?:\/|$)|[?&](?:s|p|replytocom|share)=|\.(?:jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/i;
const hote = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export function liensIndex(html, base, { externes = false, max = 40 } = {}) {
  const sansChrome = String(html).replace(/<(header|nav|footer|script|style)\b[\s\S]*?<\/\1>/gi, ' ');
  const vus = new Map();
  const h0 = hote(base);
  for (const m of sansChrome.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try { u = canonique(new URL(m[1].replace(/&amp;/g, '&'), base).href); } catch { continue; }
    if (!/^https?:/.test(u) || LIEN_TECHNIQUE.test(u)) continue;
    const pdf = /\.pdf(?:$|\?)/i.test(u);
    const memeSite = hote(u) === h0;
    if (!memeSite && !(externes && !pdf)) continue;
    const chemin = new URL(u).pathname.replace(/\/+$/, '');
    if (!chemin || canonique(base).replace(/\/+$/, '') === u.replace(/\/+$/, '')) continue;
    // Un document se reconnaît à un chemin « titre » (au moins trois mots) ou à un PDF ; un menu (« /association ») non.
    const slug = chemin.split('/').pop() || '';
    if (!pdf && slug.split(/[-_]/).filter((x) => x.length > 1).length < 3) continue;
    const titre = nettoyer(m[2]);
    const prev = vus.get(u);
    if (!prev || (titre.length > (prev.titre || '').length)) vus.set(u, { url: u, titre: titre || slug.replace(/[-_]/g, ' '), externe: !memeSite, pdf });
  }
  return [...vus.values()].slice(0, max);
}

/**
 * Lit UN document public. Jamais de contournement : un contrôle anti-robot est consigné comme tel.
 * @returns {{ok, url, url_finale, statut_http, nature_fichier, titre, corps, publie_le, date_entete, liens, extraction, octets, motif}}
 */
export async function lireDocument(url, { fetchImpl = fetch, timeoutMs = 25000, index = null } = {}) {
  const t0 = Date.now();
  let r;
  try {
    r = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  } catch (e) {
    return { ok: false, url, motif: `RESEAU:${e.cause?.code || e.name || 'erreur'}`, duree_ms: Date.now() - t0 };
  }
  const url_finale = canonique(r.url || url);
  const type = r.headers.get('content-type') || '';
  const pdf = /pdf/i.test(type) || /\.pdf(?:$|\?)/i.test(url_finale);
  const buf = Buffer.from(await r.arrayBuffer());
  const base = { url, url_finale, statut_http: r.status, octets: buf.length, duree_ms: 0 };
  if (!r.ok) {
    const html = pdf ? '' : buf.toString('utf8');
    return { ...base, ok: false, motif: WAF.test(html) ? `BLOCAGE_ANTI_ROBOT (HTTP ${r.status})` : `HTTP ${r.status}`, duree_ms: Date.now() - t0 };
  }
  if (pdf) {
    try {
      const p = await textePdf(buf);
      // Titre : première ligne de la page 1 ; page 1 sans texte (image non lue) → nom du fichier, jamais une phrase prise au milieu du document.
      const p1 = (/^\[p\. 1\]\n([^\n]{8,})/.exec(p.texte) || [])[1];
      const fichier = decodeURIComponent(url_finale.split('/').pop().replace(/\.pdf.*$/i, '')).replace(/[-_]+/g, ' ').trim();
      const res = { ...base, ok: p.texte.replace(/\[p\. \d+\]/g, '').trim().length >= 200, nature_fichier: 'pdf', titre: p1 ? p1.trim() : fichier,
        corps: p.texte, publie_le: null, date_entete: dateEntete(p.texte.replace(/^\[p\. \d+\]\n/gm, '')), pdf_modifie_le: p.pdf_modifie_le,
        pages: p.nb_pages, pages_sans_texte: p.pages_sans_texte, liens: [], extraction: 'pdf', duree_ms: Date.now() - t0 };
      if (!res.ok) res.motif = 'EXTRACTION_INSUFFISANTE (PDF sans texte lisible : image non lue)';
      return res;
    } catch (e) {
      return { ...base, ok: false, motif: `PDF_ILLISIBLE:${String(e.message).slice(0, 60)}`, duree_ms: Date.now() - t0 };
    }
  }
  const html = buf.toString('utf8');
  if (WAF.test(html) && html.length < 20000) return { ...base, ok: false, motif: 'BLOCAGE_ANTI_ROBOT (HTTP 200)', duree_ms: Date.now() - t0 };
  const lu = extraireCorps(html, url_finale);
  let corps = lu.corps, extraction = 'paragraphes';
  if (corps.length < 400) {
    const integral = texteIntegral(html);
    if (integral.length > corps.length) { corps = [lu.titre, integral].filter(Boolean).join('\n\n'); extraction = 'texte-integral'; }
  }
  const res = { ...base, ok: corps.length >= 200, nature_fichier: 'html', titre: lu.titre, corps, publie_le: lu.publie_le, date_entete: dateEntete(corps.split('\n\n').slice(1).join('\n')),
    liens: index ? liensIndex(html, url_finale, index) : [], extraction, duree_ms: Date.now() - t0 };
  if (!res.ok) res.motif = corps.length ? 'EXTRACTION_INSUFFISANTE (texte < 200 caractères)' : 'PAGE_VIDE (aucun texte : application JavaScript ou page blanche)';
  return res;
}

/** Flux RSS déclaré ET validé : seulement s'il rend des entrées avec lien et titre (un flux de démonstration ne compte pas : `exige`). */
export async function lireFlux(url, { fetchImpl = fetch, exige = null } = {}) {
  try {
    const r = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: false, motif: `HTTP ${r.status}`, items: [] };
    const items = parserRSS(await r.text()).filter((i) => i.url && i.title).map((i) => ({ url: canonique(i.url), titre: i.title, publie_le: i.published_at ? String(i.published_at).slice(0, 10) : null }));
    const valides = exige ? items.filter((i) => new RegExp(exige, 'i').test(i.url)) : items;
    return valides.length ? { ok: true, items: valides } : { ok: false, motif: 'FLUX_SANS_ENTREE_UTILISABLE', items: [] };
  } catch (e) { return { ok: false, motif: `RESEAU:${e.cause?.code || e.name}`, items: [] }; }
}

// ---------------------------------------------------------------------
// 3. IDENTITÉ ET EMPREINTE
// ---------------------------------------------------------------------
/** Clé de mémoire : URL canonique COMPLÈTE (hôte avec/sans www distinct, `?id=17&view=fiche` ≠ `?id=23&view=fiche`). */
export const cleDocument = (url) => `suivie|${canonique(url)}`;

// Gabarit : dons, lettres d'information, partage, mentions, compteurs. Leur variation n'est jamais une évolution d'affaire.
const GABARIT = /(faire un don|je (?:fais un )?don|\bdons?\b[^.]{0,40}(?:deductible|defiscalis|reduction d'impot)|newsletter|infolettre|lettre d'information|\bcookies?\b|partager (?:sur|cet)|suivez[- ]nous|tous droits reserves|©|mentions legales|politique de confidentialite|abonnez[- ]vous|adherer|nous soutenir|lire la suite|en savoir plus|retour (?:a l'accueil|en haut))/;
const compteur = (l) => l.length < 80 && (l.match(/\d/g) || []).length / (l.replace(/\s/g, '').length || 1) > 0.3;
/** Empreinte de SUBSTANCE : ce qui change le texte change l'empreinte ; le gabarit, non. */
export function empreinteSubstance(corps) {
  const lignes = String(corps || '').split(/\n+/).map((l) => aplatir(l).replace(/\s+/g, ' ').trim())
    .filter((l) => l && !GABARIT.test(l) && !compteur(l));
  return sha(lignes.join('\n')).slice(0, 16);
}

// ---------------------------------------------------------------------
// 4. NATURE ET ORIGINE
// ---------------------------------------------------------------------
const REPRISE = /(?:[Aa]rticle|[Ii]nterview|[Ee]ntretien|[Tt]ribune|[Rr]eportage)\s+(?:paru|publi[ée])e?s?\s+(?:dans|sur|par)\s+([A-ZÀ-Ý][\w'’ .-]{2,40}?)(?=[,.;:)\n]|\s+(?:le|du)\s)|source\s*:\s*([A-ZÀ-Ý][\w'’ .-]{2,40}?)(?=[,.;)\n])|\(\s*(AFP|Le Parisien|Le Monde|Libération|Mediapart|France ?Info|France ?Bleu|Ouest-France|Sud Ouest|BFM ?TV|20 ?Minutes|Le Figaro|L'Express|ActuMag)\s*\)/;
/**
 * Nature du document par rapport à l'organisme : publication propre, communiqué, reprise de presse (origine conservée), article de presse
 * référencé par l'organisme (émetteur = le média), page de service, repli de réseau / institutionnel (émetteur = celui de la page).
 */
export function natureDocument(doc, page, organisme) {
  const domainesOrg = (organisme?.suivi?.domaines || []).map((d) => d.replace(/^www\./, ''));
  const h = hote(doc.url_finale || doc.url);
  if (page && canonique(page.url) === canonique(doc.url) && page.type === 'service') return { nature: 'PAGE_SERVICE', emetteur: page.emetteur };
  if (page && page.repli) return { nature: 'REPLI', emetteur: page.emetteur };
  if (domainesOrg.length && !domainesOrg.includes(h)) return { nature: 'ARTICLE_PRESSE_REFERENCE', emetteur: h, origine_presse: h };
  const m = REPRISE.exec(String(doc.corps || '').slice(0, 6000));
  if (m) return { nature: 'REPRISE_PRESSE', emetteur: page?.emetteur || organisme?.nom, origine_presse: (m[1] || m[2] || m[3]).trim() };
  if (/communiqu[ée] de presse/i.test(String(doc.corps || '').slice(0, 800))) return { nature: 'COMMUNIQUE', emetteur: page?.emetteur || organisme?.nom };
  return { nature: 'PUBLICATION_PROPRE', emetteur: page?.emetteur || organisme?.nom };
}

// ---------------------------------------------------------------------
// 5. CLASSEMENT (déterministe, sans modèle)
// ---------------------------------------------------------------------
// Lien thématique : violences et protection des mineurs. « victimes » seul (un incendie, un accident) ne suffit pas.
const THEME = /(violences?|agressions? sexuel|abus sexuel|atteintes? sexuel|maltraitance|pedocrimin|inceste|harcelement|protection de l'?enfance|periscolaire|\bviols?\b|enfance en danger|recueil de (?:la )?parole)/;
const JUDICIAIRE = /(plainte|mis(?:e)? en examen|garde a vue|ecroue|condamn|proces|audience|tribunal|parquet|enquete|signalement|suspendu)/;

/**
 * Indices d'une affaire nommée dont l'établissement manque au texte. Le résolveur partagé accepte « Paris » pour toute affaire d'un
 * arrondissement (utile à Discovery, trop large ici : mesuré, une course « de Saint-Paul-lès-Dax à Paris » suspendait 22 affaires).
 * On garde un voisin seulement si le texte écrit SA commune complète (« 11e arrondissement », « Paris 11e ») et, à moins de 600 caractères,
 * un mot de son rôle ET un fait (agression, plainte, signalement…).
 */
const FAIT_PROCHE = /(agression|viol|violence|attouchement|plainte|signal|mis(?:e)? en examen|garde a vue|condamn|proces|suspendu)/;
function voisins(texte, fiches) {
  const ids = resoudre({ candidate: { title: '' }, index: fiches, corps: texte }).voisins || [];
  const t = aplatir(texte);
  return ids.filter((id) => {
    const f = fiches.find((x) => x.case_id === id);
    const c = aplatir(String(f?.commune || ''));
    const num = /^(.*?)\s+(\d+)\s*(?:er|e|eme)?$/.exec(c);
    const re = num ? new RegExp(`\\b${num[2]}\\s*(?:er|e|eme)\\s+arrondissement|\\b${num[1]}\\s+${num[2]}\\s*(?:er|e|eme)\\b`, 'g') : new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    const roles = aplatir(String(f?.role_mis_en_cause || '')).split(/[^a-z]+/).filter((w) => w.length > 4 && !/scolaire/.test(w));
    for (const m of t.matchAll(re)) {
      const fen = t.slice(Math.max(0, m.index - 600), m.index + 600);
      if (roles.some((w) => fen.includes(w)) && FAIT_PROCHE.test(fen)) return true;
    }
    return false;
  });
}

/**
 * @param {object} doc     document lu (corps, titre)
 * @param {object} page    page du registre d'où il vient
 * @param {object} organisme
 * @param {object[]} fiches  affaires connues (case_id, etablissement, commune, departement, role_mis_en_cause, statut_judiciaire)
 * @returns {{destination, motif, case_ids, suspendus, raisons}}
 */
/**
 * Partie du document qui sert au rattachement et aux passages.
 *   · Document long découpé en pages (PDF de plus de 3 pages) : seules les pages qui portent un signal « structure × fait » (mesuré : sur le PV
 *     de Tarnos, 48 pages de délibérations faisaient « reconnaître » quatre affaires, dont une à Nîmes, par des passages électoraux).
 *   · Émetteur COMMUNAL (procès-verbal d'une commune) : le document parle de cette commune — contexte ajouté en tête. Ne vaut JAMAIS pour le
 *     siège d'une association (portée « nationale », « departementale:… ») : seul un émetteur déclaré « communale:<Commune> » est concerné.
 */
export function zonePertinente(doc, organisme) {
  let z = String(doc.corps || '');
  const pages = z.split(/\n{2,}(?=\[p\. \d+\]\n)/);
  if (pages.length > 3) {
    const gardees = pages.filter((p) => filtrer({ title: '', excerpt: p.slice(0, 6000) }).decision === 'CANDIDATE');
    z = gardees.join('\n\n');
  }
  const communal = /^communale:(.+)$/.exec(organisme?.portee || '')?.[1];
  return communal ? `Commune de ${communal}.\n\n${z}` : z;
}

export function classer({ doc, page, organisme, fiches }) {
  const titre = String(doc.titre || '');
  const corps = zonePertinente(doc, organisme);
  const tete = aplatir(`${titre} ${doc.url_finale || doc.url}`);
  const f = organisme?.suivi?.filtre || {};
  for (const p of f.exclure || []) if (new RegExp(p, 'i').test(tete)) return { destination: 'HORS_PERIMETRE', motif: `filtre de l'organisme (${p})`, case_ids: [], suspendus: [] };
  if (f.inclure?.length && !f.inclure.some((p) => new RegExp(p, 'i').test(aplatir(`${titre} ${doc.url_finale || doc.url} ${corps.slice(0, 1500)}`)))) {
    return { destination: 'HORS_PERIMETRE', motif: 'hors du service suivi pour cet organisme', case_ids: [], suspendus: [] };
  }

  // Rattachement par le TEXTE seul (établissement + commune + rôle) — jamais par l'adresse de l'organisme.
  if (!corps.trim()) return page?.type === 'service' ? { destination: 'RESSOURCE', motif: 'page de service : révision documentaire de la ressource', case_ids: [], suspendus: [] }
    : { destination: 'HORS_PERIMETRE', motif: 'document long sans page portant un signal « structure × fait »', case_ids: [], suspendus: [] };
  const r = resoudre({ candidate: { title: titre }, index: fiches, corps });
  const ok = (r.detail || []).filter((d) => d.rattachement === 'OK').map((d) => d.case_id);
  const douteux = (r.detail || []).filter((d) => d.rattachement === 'DOUTEUX').map((d) => d.case_id);
  // Même établissement, plusieurs affaires (procédure indéterminée) ou rattachement par départage chronologique seulement : jamais un ajout forcé, un humain tranche.
  if (ok.length && (ok.length > 1 || r.resolution_status !== 'MATCH')) return { destination: 'RATTACHEMENT_SUSPENDU', motif: 'plusieurs affaires, ou rattachement non plein, pour ce texte : procédure indéterminée, aucun ajout forcé', case_ids: [], suspendus: [...new Set([...ok, ...douteux])] };
  if (ok.length) return { destination: 'AFFAIRE', motif: r.reason, case_ids: ok, suspendus: douteux, resolution: r.resolution_status, zone: corps };
  // Indices dispersés (plus de 10 affaires « douteuses ») : ce n'est pas une piste d'identification mais un texte général qui cite des lieux
  // (mesuré : un communiqué sur une affaire hors SNY en « suspendait » 27). Le document est classé comme s'il ne rattachait rien, motif consigné.
  if (douteux.length > 10) return { ...classerSansAffaire({ titre, corps, page }), indices_disperses: douteux.length };
  if (douteux.length) return { destination: 'RATTACHEMENT_SUSPENDU', motif: 'établissement nommé mais identification incomplète (commune ou rôle) : aucun lien sans arbitrage', case_ids: [], suspendus: douteux };
  const vois = voisins(corps, fiches);
  if (vois.length && vois.length <= 10) return { destination: 'RATTACHEMENT_SUSPENDU', motif: 'commune, rôle et fait concordent, établissement non nommé : aucun lien sans autre preuve', case_ids: [], suspendus: vois };
  return { ...classerSansAffaire({ titre, corps, page }), ...(vois.length ? { indices_disperses: vois.length } : {}) };
}

/** Destination d'un document qui ne se rattache à aucune affaire connue. */
function classerSansAffaire({ titre, corps, page }) {
  const extrait = `${titre} ${corps.slice(0, 600)}`;
  const t = aplatir(`${titre} ${corps.slice(0, 3000)}`);
  if (page?.type === 'service') return { destination: 'RESSOURCE', motif: 'page de service : révision documentaire de la ressource', case_ids: [], suspendus: [] };
  const signal = filtrer({ title: titre, excerpt: corps.slice(0, 600) });
  const territoire = detecterTerritoire(extrait);
  if (signal.decision === 'CANDIDATE' && territoire.valeurs?.length && JUDICIAIRE.test(aplatir(extrait))) {
    return { destination: 'SIGNAL_AFFAIRE_POSSIBLE', motif: `structure × fait localisé (${territoire.valeurs.join(', ')}) sans affaire connue — relais Discovery inexistant : signal consigné`, case_ids: [], suspendus: [] };
  }
  // Une seule mention (souvent dans la présentation de l'organisme) ne fait pas une publication thématique : titre, ou deux mentions.
  const mentions = (t.match(new RegExp(THEME.source, 'g')) || []).length;
  if (THEME.test(aplatir(titre)) || mentions >= 2) return { destination: 'POSITION_GENERALE', motif: 'publication thématique sans affaire ni territoire identifié', case_ids: [], suspendus: [] };
  return { destination: 'HORS_PERIMETRE', motif: 'sans lien avec les violences faites aux mineurs', case_ids: [], suspendus: [] };
}

// ---------------------------------------------------------------------
// 6. PASSAGES PROBANTS (pour une affaire)
// ---------------------------------------------------------------------
/**
 * Passages probants pour UNE affaire, avec leur emplacement (page du PDF ou paragraphe) :
 *   1. phrases qui nomment l'établissement ;  2. phrases qui nomment un organisme suivi (la démarche ou la sollicitation dont il s'agit) ;
 *   3. à défaut de 1, phrases qui nomment la commune ET une structure ou un fait.
 * Une phrase sur l'ensemble d'une ville (« de nombreuses affaires à Paris ») n'est jamais retenue quand l'établissement est nommé ailleurs.
 */
export function passages(corps, fiche, { max = 3, alias = [] } = {}) {
  const jetons = jetonsEtab(fiche.etablissement, { saint: true });
  const commune = aplatir(String(fiche.commune || '').replace(/\s+\d+\s*(?:er|e|eme)?$/i, ''));
  const etab = [], orga = [], communaux = [];
  let page = null;
  const blocs = String(corps).split(/\n{2,}/);
  let num = 0;
  for (const b of blocs) {
    const pm = /^\[p\. (\d+)\]/.exec(b);
    if (pm) page = Number(pm[1]);
    if (/^Commune de [^\n]+\.$/.test(b)) continue; // contexte ajouté par zonePertinente : jamais une citation
    num++;
    // Titre de la page (1er bloc) et intertitres courts : ils annoncent, ils ne prouvent pas.
    if (!pm && (num === 1 || b.length < 90)) continue;
    const phrases = b.replace(/^\[p\. \d+\]\n?/, '').replace(/\n/g, ' ').split(/(?<=[.!?»])\s+(?=[A-ZÀ-Ý«])/);
    for (const ph of phrases) {
      const n = aplatir(ph);
      const item = { texte: ph.trim().slice(0, 600), emplacement: page ? `page ${page}` : `paragraphe ${num}` };
      if (jetons.length && jetons.every((j) => n.includes(j))) etab.push({ ...item, nomme_etablissement: true });
      else if (alias.some((a) => n.includes(a))) orga.push({ ...item, nomme_organisme: true });
      else if (commune.length > 3 && n.includes(commune) && /centre de loisirs|ecole|creche|animateur|periscolaire/.test(n) && FAIT_PROCHE.test(n)) communaux.push(item);
    }
  }
  return [...etab, ...orga, ...(etab.length ? [] : communaux)].slice(0, max);
}

/**
 * DÉCLARATIONS d'un organisme sur SA PROPRE action dans une affaire — vocabulaire FERMÉ, libellé public fermé (jamais la phrase de la source).
 * PORTÉE ACTUELLE : une seule famille reconnue, « s'est constitué(e) partie civile ». Ce n'est PAS un traitement général des publications d'organismes :
 * toute autre publication rattachée reste une information SANS bouton (message Telegram « MAINTENANCE »), et reste consultable en mémoire
 * (`source_resolutions`, `SOURCE_SUIVIE/<destination>`, titre et adresse). Étendre le vocabulaire = ajouter une ligne ici (et un test).
 * Une publication ne devient une information décidable (fait structuré du circuit « enrichissement » existant) que si :
 *   1. le document est rattaché à l'affaire par son TEXTE (classer → AFFAIRE, un seul rattachement plein) ;
 *   2. la phrase probante a pour SUJET l'organisme suivi lui-même (un de ses alias) ;
 *   3. l'acte écrit appartient à ce vocabulaire ;
 *   4. le CONTEXTE d'affaire attesté par la phrase (un mois et une année) est celui de l'ORIGINE de la chronologie de l'affaire dans SNY
 *      (son événement le plus ancien) : on relie la déclaration à ce contexte, jamais à une procédure ou à une étape (une affaire dont la
 *      chronologie ne permet pas ce lien — fiche plus étroite que la source, mois absent ou postérieur — reste une simple information).
 * Le libellé nomme ce contexte ; il ne dit ni la date de la démarche (jamais déduite), ni la procédure visée, ni l'issue.
 */
const MOIS_ECRITS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const deMois = (m) => (/^[aeiouhéû]/i.test(m) ? `d’${m}` : `de ${m}`);
const enMois = (m) => `en ${m}`;
/** « à l’école maternelle X », « au centre de loisirs Y », « à la crèche Z » : le lieu tel que la fiche le nomme, sans exception par établissement. */
const lieuDe = (etab) => { const e = String(etab || '').trim(); const mot = aplatir(e).split(' ')[0]; const bas = e.charAt(0).toLowerCase() + e.slice(1);
  return /^(ecole|aire|accueil|ensemble)$/.test(mot) ? `à l’${bas}` : /^(creche|halte|garderie|maison|micro)$/.test(mot) ? `à la ${bas}` : /^(centre|college|lycee|jardin|institut|foyer|service)$/.test(mot) ? `au ${bas}` : `à ${e}`; };
const dateLongue = (iso) => { const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return d ? `${Number(d[3]) === 1 ? '1er' : Number(d[3])} ${MOIS_NOMS[Number(d[2]) - 1]} ${d[1]}` : null; };

const DECLARATIONS = [{
  mesure: 'declaration_partie_civile',
  motif: /\b(?:s'est|se sont|se|nous nous sommes)\s+constitue\w*\s+partie civile\b|\bconstitue\w*\s+partie civile\b/,
  libelle: ({ nom, etab, commune, contexte, publie }) => `Dans sa publication${publie ? ` du ${publie}` : ''}, ${nom} revient sur ${contexte} ${lieuDe(etab)} (${commune}). L’association indique s’être constituée partie civile dans cette affaire, sans préciser la date de cette démarche ni la procédure visée. Cette déclaration n’est pas confirmée par une autre source consultée.`,
  // Inconnues du dossier rendues obsolètes (portion STRICTE) : remplacées seulement si le texte actuel est EXACTEMENT celui attendu ; le reste reste intact.
  inconnues: [
    { cible: 'dossier', re: /^Une constitution de partie civile d['’]associations est évoquée ailleurs ; elle n['’]est pas confirmée par les articles relus\.$/,
      apres: ({ nom, publie }) => `Une constitution de partie civile est déclarée par ${nom} dans une publication du ${publie} (déclaration non confirmée par une autre source consultée ; date de la démarche et procédure non précisées) ; pour d’autres associations, elle est évoquée ailleurs et n’est pas confirmée par les articles relus.` },
    { cible: 'transversale', re: /^Une constitution de partie civile de l['’]association (.+?) est évoquée dans d['’]autres sources ; le communiqué \(PDF\) n['’]a pas pu être relu : elle n['’]est donc pas reprise\.$/,
      qui: true,
      apres: ({ publie, capture }) => `Une constitution de partie civile de l’association ${capture} est évoquée dans d’autres sources ; le communiqué (PDF) n’a pas pu être relu : seule la déclaration de l’association du ${publie} est reprise (attribuée, non confirmée par une autre source consultée).` },
  ],
}];

/**
 * Contexte éditorial des affaires, en LECTURE SEULE : chronologie (dossiers des Hubs + événements validés) et inconnues (dossier, transversales).
 * @param {string[]} fichiersHub  chemins de data/hub-matiere/*.json (le nom du fichier est l'identifiant du Hub)
 * @param {string|null} cheminEvenements  data/evenements.json
 */
export function chargerContexteHub(fichiersHub, cheminEvenements = null) {
  const dates = new Map(), dossiers = new Map(), transversales = new Map();
  const ajouter = (id, d) => { if (d && /^\d{4}-\d{2}/.test(d)) dates.set(id, [...new Set([...(dates.get(id) || []), String(d).slice(0, 10)])].sort()); };
  for (const f of fichiersHub) {
    let j; try { j = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    const hub = f.replace(/\\/g, '/').split('/').pop().replace(/\.json$/, '');
    transversales.set(hub, j.inconnues_transversales || []);
    for (const [id, d] of Object.entries(j.dossiers || {})) {
      dossiers.set(id, { hub, inconnues: d.inconnues || [] });
      for (const e of d.deroule || []) ajouter(id, e.date);
    }
  }
  if (cheminEvenements && existsSync(cheminEvenements)) {
    try { for (const [id, evs] of Object.entries(JSON.parse(readFileSync(cheminEvenements, 'utf8')).affaires || {})) for (const e of evs) ajouter(id, e.date); } catch { /* fichier illisible : chronologie des dossiers seule */ }
  }
  return { dates, dossiers, transversales };
}

/**
 * Faits structurés (contrat des « +reactions » : nature, mesure, libellé public, réalisation, portée, acteur, citation) pour les passages d'UNE affaire.
 * `fiche` : { case_id, etablissement, commune } · `contexte` : chargerContexteHub(...). Sans contexte ou sans ancrage attesté : aucun fait (fail closed).
 */
export function faitsDeclares({ passages: ps, organisme, emetteur, nature, publie_le, fiche, contexte }) {
  if (!['PUBLICATION_PROPRE', 'COMMUNIQUE'].includes(nature)) return [];     // reprise, article de presse référencé, replis : l'émetteur n'est pas l'organisme
  const alias = aliasOrganismes([organisme || {}]);
  const nom = (organisme?.alias || [])[0] || organisme?.nom;
  if (!alias.length || !nom || !fiche || !contexte) return [];
  const out = [];
  for (const D of DECLARATIONS) {
    const p = ps.find((x) => { const n = aplatir(x.texte); return alias.some((a) => n.includes(a)) && D.motif.test(n); });
    if (!p || out.some((f) => f.mesure === D.mesure)) continue;
    // 4. contexte attesté = ORIGINE de la chronologie de l'affaire (jamais une étape ultérieure, jamais l'absence de date)
    const n = aplatir(p.texte);
    const m = new RegExp(`\\b(${MOIS_ECRITS.join('|')})\\s+(\\d{4})\\b`).exec(n);
    const connues = contexte.dates.get(fiche.case_id) || [];
    if (!m || !connues.length) continue;
    const idx = MOIS_ECRITS.indexOf(m[1]); const ym = `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
    if (!connues[0].startsWith(ym)) continue;
    const mois = MOIS_NOMS[idx];
    const ctx = n.includes("suspension d'un animateur") ? `la suspension d’un animateur ${enMois(mois)} ${m[2]}` : `une affaire datée ${deMois(mois)} ${m[2]}`;
    const nomPublic = nom.replace(/'/g, '’');
    const publie = dateLongue(publie_le);
    // inconnues devenues obsolètes : portion stricte, texte exact seulement
    const dossier = contexte.dossiers.get(fiche.case_id);
    const ajustements = [];
    if (publie && dossier) {
      for (const I of D.inconnues) {
        const source = I.cible === 'dossier' ? dossier.inconnues : (contexte.transversales.get(dossier.hub) || []);
        for (const avant of source) {
          const mm = I.re.exec(avant);
          if (!mm) continue;
          if (I.qui && !alias.some((a) => aplatir(mm[1]).includes(a) || a.includes(aplatir(mm[1])))) continue;   // la mention doit viser CET organisme
          ajustements.push({ cible: I.cible, hub: dossier.hub, ...(I.cible === 'dossier' ? { case_id: fiche.case_id } : {}), avant, apres: I.apres({ nom: nomPublic, publie, capture: mm[1] }) });
        }
      }
    }
    out.push({ event_type: 'mobilisation', nature: 'mobilisation', mesure: D.mesure, realisation: 'réalisée', portee: 'établissement', acteur: nom, acteur_nomme: nom,
      event_date: null, event_period: null, publication_date: publie_le || null, emetteur, organisme: organisme.id, evidence: [p.texte], emplacements: [p.emplacement],
      contexte_atteste: { mois: ym, ancrage: 'origine de la chronologie de l’affaire' },
      libelle_public: D.libelle({ nom: nomPublic, etab: fiche.etablissement, commune: fiche.commune, contexte: ctx, publie }),
      ...(ajustements.length ? { ajustements_inconnues: ajustements } : {}) });
  }
  return out;
}

/** Contacts publics d'une page de service (adresses électroniques génériques seulement ; une adresse nominative est masquée). */
const adresses = (corps) => [...new Set((String(corps).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map((e) => e.toLowerCase()))].sort();
const masquer = (e) => (/^(contact|info|infos|accueil|secretariat|direction|communication|renseignements|presse|aide|aidevictimes|association|siege|courrier)[\w.-]*@/.test(e) ? e : `…@${e.split('@')[1]}`);
export function contacts(corps) { return adresses(corps).map(masquer); }

/**
 * Divergence de contacts entre les pages de service d'un même organisme (site propre + replis) : signalée, JAMAIS résolue par écrasement.
 * Les adresses complètes ne sortent pas de la fonction : seules leurs formes masquées sont rendues.
 */
export function divergencesContact(pagesEtat) {
  const parOrg = new Map();
  // Une page commune à plusieurs organismes (paris.fr pour l'OSE et PAV) est émise par un tiers : ses adresses ne sont celles d'aucun d'eux.
  for (const p of pagesEtat.filter((x) => x.type === 'service' && x.doc?.corps && x.organismes.length === 1)) {
    const a = adresses(p.doc.corps);
    if (!a.length) continue;
    for (const o of p.organismes) parOrg.set(o, [...(parOrg.get(o) || []), { url: p.url, emetteur: p.emetteur, a }]);
  }
  const out = [];
  for (const [organisme, pages] of parOrg) {
    const toutes = new Set(pages.flatMap((p) => p.a));
    if (pages.length > 1 && toutes.size > 1 && pages.some((p) => p.a.join() !== pages[0].a.join())) {
      out.push({ organisme, constat: 'adresses différentes selon les pages : à vérifier, aucune n’est retenue à la place d’une autre',
        pages: pages.map((p) => ({ url: p.url, emetteur: p.emetteur, adresses: p.a.map(masquer) })) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// 7. MÉMOIRE (source_resolutions en production ; fichier pour les essais isolés)
// ---------------------------------------------------------------------
export const METHODE = 'SOURCE_SUIVIE';
const versionEtat = (d) => ({ statut: d.fetch_status, empreinte: d.content_fingerprint, verifie_le: d.checked_at, dernier_succes: d.resolved_at, methode: d.resolution_method });

/**
 * Compare un document lu à sa mémoire.
 *   NOUVEAU (jamais lu avec succès) · INCHANGE (même empreinte de substance) · MODIFIE (substance différente : réexamen)
 */
export function comparer(doc, memo) {
  if (!memo?.content_fingerprint) return 'NOUVEAU';
  return memo.content_fingerprint === doc.empreinte ? 'INCHANGE' : 'MODIFIE';
}

/** Cadence : une page de service (hebdomadaire) déjà lue avec succès depuis moins de 7 jours n'est pas relue. */
export function aRelire(page, memo, maintenant = Date.now()) {
  if (!memo || memo.fetch_status !== 'OK' || page.cadence !== 'hebdomadaire') return true;
  return maintenant - Date.parse(memo.checked_at) >= 7 * JOUR;
}

/** Mémoire en fichier JSON — état ISOLÉ et explicitement artificiel des essais. Jamais la production. */
export function memoireFichier(chemin, { lectureSeule = false } = {}) {
  const etat = existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : { _avertissement: 'ÉTAT DE TEST ISOLÉ — jamais importé en production', docs: {} };
  return {
    type: 'fichier',
    get: (k) => etat.docs[k] || null,
    tous: () => Object.values(etat.docs),
    noterSucces(row) { etat.docs[row.doc_key] = { ...(etat.docs[row.doc_key] || {}), ...row, fetch_status: 'OK', failure_reason: null, resolved_at: row.maintenant, checked_at: row.maintenant }; },
    // Un échec n'efface RIEN : empreinte, méthode et date du dernier succès sont conservées ; seul l'incident est ajouté.
    noterEchec(row) { const p = etat.docs[row.doc_key] || { doc_key: row.doc_key, raw_url: row.raw_url, publisher_domain: row.publisher_domain, resolution_method: `${METHODE}/JAMAIS_LU`, case_ids: [] };
      etat.docs[row.doc_key] = { ...p, fetch_status: row.fetch_status, failure_reason: row.failure_reason, checked_at: row.maintenant }; },
    toucher(k, maintenant) { if (etat.docs[k]) etat.docs[k].checked_at = maintenant; },
    async ecrire() { if (!lectureSeule) writeFileSync(chemin, JSON.stringify(etat, null, 1)); },
  };
}

/**
 * Mémoire de production : `source_resolutions` (migration 012, existante). Une ligne par document (doc_key « suivie|<url> »).
 * `resolution_method` = « SOURCE_SUIVIE/<destination> » ; `resolved_at` = dernier succès ; `failure_reason` = dernier incident.
 * `dry` : les écritures restent en mémoire du processus (rien n'atteint la base).
 */
export async function memoireNeon(sql, { dry = true } = {}) {
  const lignes = await sql`select doc_key, case_ids, titre, publisher_domain, raw_url, publisher_url, resolution_method, fetch_status,
                                  content_fingerprint, failure_reason, resolved_at, checked_at
                             from source_resolutions where resolution_method like ${METHODE + '%'}`;
  const docs = new Map(lignes.map((l) => [l.doc_key, { ...l, resolved_at: l.resolved_at && new Date(l.resolved_at).toISOString(), checked_at: l.checked_at && new Date(l.checked_at).toISOString() }]));
  const enAttente = [];
  return {
    type: 'neon', dry,
    get: (k) => docs.get(k) || null,
    tous: () => [...docs.values()],
    noterSucces(row) { docs.set(row.doc_key, { ...(docs.get(row.doc_key) || {}), ...row, fetch_status: 'OK', failure_reason: null, resolved_at: row.maintenant, checked_at: row.maintenant }); enAttente.push(['ok', row]); },
    noterEchec(row) { const p = docs.get(row.doc_key) || {}; docs.set(row.doc_key, { ...p, doc_key: row.doc_key, fetch_status: row.fetch_status, failure_reason: row.failure_reason, checked_at: row.maintenant }); enAttente.push(['echec', row]); },
    toucher(k, maintenant) { if (docs.has(k)) { docs.get(k).checked_at = maintenant; enAttente.push(['toucher', { doc_key: k }]); } },
    async ecrire() {
      if (dry) return { ecrites: 0, en_attente: enAttente.length };
      for (const [quoi, r] of enAttente) {
        if (quoi === 'ok') {
          await sql`insert into source_resolutions (doc_key, case_ids, titre, publisher_domain, raw_url, publisher_url, resolution_method,
                                                   fetch_status, content_fingerprint, failure_reason, resolved_at, checked_at)
                    values (${r.doc_key}, ${JSON.stringify(r.case_ids || [])}, ${r.titre || null}, ${r.publisher_domain}, ${r.raw_url}, ${r.publisher_url},
                            ${r.resolution_method}, 'OK', ${r.content_fingerprint}, null, now(), now())
                    on conflict (doc_key) do update set case_ids = excluded.case_ids, titre = excluded.titre, publisher_url = excluded.publisher_url,
                      resolution_method = excluded.resolution_method, fetch_status = 'OK', content_fingerprint = excluded.content_fingerprint,
                      failure_reason = null, resolved_at = now(), checked_at = now()`;
        } else if (quoi === 'echec') {
          // Échec : on n'écrase NI l'empreinte, NI la méthode, NI la date du dernier succès.
          await sql`insert into source_resolutions (doc_key, case_ids, publisher_domain, raw_url, resolution_method, fetch_status, failure_reason, checked_at)
                    values (${r.doc_key}, '[]'::jsonb, ${r.publisher_domain}, ${r.raw_url}, ${METHODE + '/JAMAIS_LU'}, ${r.fetch_status}, ${r.failure_reason}, now())
                    on conflict (doc_key) do update set fetch_status = excluded.fetch_status, failure_reason = excluded.failure_reason, checked_at = now()`;
        } else {
          await sql`update source_resolutions set checked_at = now() where doc_key = ${r.doc_key}`;
        }
      }
      return { ecrites: enAttente.length };
    },
  };
}

export { versionEtat };

// ---------------------------------------------------------------------
// 8. FAITS DÉJÀ RAPPORTÉS (preuve complémentaire ≠ nouvel événement)
// ---------------------------------------------------------------------
/**
 * Textes et URL déjà publiés pour une affaire dans la matière des Hubs (data/hub-matiere/*.json : réponses, déroulé du dossier).
 * Sert à reconnaître une PREUVE COMPLÉMENTAIRE : le passage du document cite des organismes que SNY rapporte déjà pour cette affaire.
 */
export function chargerFaitsConnus(fichiers) {
  const parCas = new Map();
  for (const f of fichiers) {
    let j; try { j = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    const ids = Object.keys(j.dossiers || {});
    const items = [
      ...(j.reponses || []).flatMap((g) => g.items || []),
      ...ids.flatMap((id) => (j.dossiers[id].deroule || []).map((x) => ({ ...x, _case: id }))),
    ];
    for (const id of ids) {
      const propres = items.filter((x) => !x._case || x._case === id);
      parCas.set(id, [...(parCas.get(id) || []), ...propres.map((x) => ({ texte: x.texte || '', url: x.source?.url || null, media: x.source?.media || null, publie_le: x.source?.publie_le || null }))]);
    }
  }
  return parCas;
}

/** Le passage rapporte-t-il un fait DÉJÀ publié (même organisme suivi nommé, ou même URL) ? */
export function complementDe({ url, passagesTexte, faits, alias }) {
  const meme = faits.find((f) => f.url && canonique(f.url) === canonique(url));
  if (meme) return { type: 'DEJA_SOURCE', ref: meme };
  const p = aplatir(passagesTexte);
  for (const f of faits) {
    const t = aplatir(f.texte);
    const communs = alias.filter((a) => p.includes(a) && t.includes(a));
    if (communs.length) return { type: 'PREUVE_COMPLEMENTAIRE', ref: f, organismes: communs };
  }
  return null;
}

/** Formes sous lesquelles un organisme suivi est écrit dans un texte (pour rapprocher un passage d'un fait connu). */
export function aliasOrganismes(organismes) {
  const a = new Set();
  for (const o of organismes) {
    if (o.role === 'identite_a_confirmer' || !o.suivi?.pages?.length) continue;
    for (const x of [o.nom, ...(o.alias || [])]) {
      const n = aplatir(String(x || '').replace(/\(.*?\)|«|»/g, ' ')).replace(/\s[–—-]\s.*$/, '').replace(/\s+/g, ' ').trim();
      if (n.length >= 5) a.add(n);
    }
  }
  return [...a];
}

// ---------------------------------------------------------------------
// 9. PARCOURS D'UN CYCLE
// ---------------------------------------------------------------------
/**
 * Lit les points d'entrée, puis les documents qu'ils signalent ; compare à la mémoire ; classe. N'ÉCRIT RIEN en base.
 * Un document trouvé par deux index (ou deux organismes) n'est lu et compté qu'une fois.
 *
 * @param {{ registre, memoire, fiches, lire?, lireRss?, maintenant?, maxParIndex?, maxDocs?, journal? }} o
 * @returns {{ pages: object[], docs: object[], requetes: number }}
 */
export async function parcourirSources({ registre, memoire, fiches, lire = lireDocument, lireRss = lireFlux, maintenant = new Date().toISOString(),
  maxParIndex = 20, maxDocs = 120, journal = () => {} }) {
  const parId = new Map(registre.organismes.map((o) => [o.id, o]));
  const pagesEtat = [];
  const docs = new Map();           // url canonique → { url, titre_index, publie_index, page, organisme }
  let requetes = 0;

  const ajouterDoc = (d, page) => {
    const u = canonique(d.url);
    if (docs.has(u) || registre.pages.some((p) => p.url === u)) return; // une page du registre n'est pas un « document trouvé »
    docs.set(u, { url: u, titre_index: d.titre || null, publie_index: d.publie_le || null, page, organisme: parId.get(page.organismes[0]), externe: !!d.externe });
  };

  for (const page of registre.pages) {
    const org = parId.get(page.organismes[0]);
    const k = cleDocument(page.url);
    const memo = memoire.get(k);
    const etat = { url: page.url, organismes: page.organismes, type: page.type, emetteur: page.emetteur, repli: !!page.repli };
    if (!aRelire(page, memo, Date.parse(maintenant))) { pagesEtat.push({ ...etat, issue: 'NON_DUE', verifie_le: memo.checked_at }); continue; }

    // Flux RSS déclaré : validé à chaque lecture (entrées réelles), sinon l'index HTML prend le relais.
    let viaRss = null;
    if (page.type === 'index' && page.rss) { requetes++; viaRss = await lireRss(page.rss); }

    requetes++;
    let doc = await lire(page.url, { index: page.type === 'index' ? { externes: !!page.externes, max: maxParIndex } : null });
    if (!doc.ok && page.repli_index) { requetes++; const r2 = await lire(page.repli_index, { index: { max: maxParIndex } }); if (r2.ok) doc = { ...r2, repli_utilise: page.repli_index }; }
    if (!doc.ok) {
      memoire.noterEchec({ doc_key: k, raw_url: page.url, publisher_domain: hote(page.url), fetch_status: doc.statut_http ? `HTTP ${doc.statut_http}` : 'RESEAU', failure_reason: doc.motif, maintenant });
      pagesEtat.push({ ...etat, issue: 'ECHEC', motif: doc.motif, dernier_succes: memo?.resolved_at || null, empreinte_conservee: memo?.content_fingerprint || null });
      journal(`  ✗ ${page.url} — ${doc.motif}`);
      // Un index illisible n'empêche pas d'utiliser son flux validé.
      if (viaRss?.ok) for (const it of viaRss.items.slice(0, maxParIndex)) ajouterDoc(it, page);
      continue;
    }
    doc.empreinte = empreinteSubstance(doc.corps);
    const issue = comparer(doc, memo);
    const nat = natureDocument(doc, page, org);
    const cls = page.type === 'index' ? { destination: 'INDEX', case_ids: [], suspendus: [] } : classer({ doc, page, organisme: org, fiches });
    pagesEtat.push({ ...etat, issue, extraction: doc.extraction, caracteres: doc.corps.length, empreinte: doc.empreinte, empreinte_precedente: memo?.content_fingerprint || null,
      liens: doc.liens?.length || 0, rss: page.rss ? (viaRss?.ok ? `valide (${viaRss.items.length} entrées)` : `non retenu (${viaRss?.motif})`) : null,
      contacts: page.type === 'service' ? contacts(doc.corps) : undefined, repli_utilise: doc.repli_utilise || null, ...nat, ...cls, doc: page.type === 'index' ? undefined : doc,
      organisme: org, publie_le: doc.publie_le || doc.date_entete || null });
    const entrees = viaRss?.ok ? viaRss.items : doc.liens || [];
    for (const it of entrees.slice(0, maxParIndex)) ajouterDoc(it, page);
  }

  // Documents signalés par les index : nouveaux → lus ; connus → relus au plus une fois par semaine (corrections substantielles).
  const sortie = [];
  for (const d of [...docs.values()].slice(0, maxDocs)) {
    const k = cleDocument(d.url);
    const memo = memoire.get(k);
    // Un document rattaché à une affaire est relu à chaque cycle (rares, bornés) : sa proposition doit rester décidable et à jour sans réimport ; les autres : au plus 1×/semaine.
    const rattache = (memo?.resolution_method || '').endsWith('/AFFAIRE');
    if (memo && !rattache && !aRelire({ cadence: 'hebdomadaire' }, memo, Date.parse(maintenant))) { sortie.push({ ...d, issue: 'CONNU_RECENT', verifie_le: memo.checked_at, destination: memo.resolution_method?.split('/')[1] || null }); continue; }
    requetes++;
    const doc = await lire(d.url, {});
    if (!doc.ok) {
      memoire.noterEchec({ doc_key: k, raw_url: d.url, publisher_domain: hote(d.url), fetch_status: doc.statut_http ? `HTTP ${doc.statut_http}` : 'RESEAU', failure_reason: doc.motif, maintenant });
      sortie.push({ ...d, issue: 'ECHEC', motif: doc.motif, dernier_succes: memo?.resolved_at || null });
      continue;
    }
    doc.empreinte = empreinteSubstance(doc.corps);
    const issue = comparer(doc, memo);
    const nat = natureDocument(doc, d.externe ? null : d.page, d.organisme);
    const cls = classer({ doc, page: { ...d.page, type: 'document' }, organisme: d.organisme, fiches });
    sortie.push({ ...d, issue, empreinte: doc.empreinte, empreinte_precedente: memo?.content_fingerprint || null, ...nat, ...cls, doc,
      publie_le: doc.publie_le || d.publie_index || doc.date_entete || null });
  }
  return { pages: pagesEtat, docs: sortie, requetes };
}

// ---------------------------------------------------------------------
// 9 bis. CONTINUITÉ ET SOLLICITATION (fonctions pures, testées hors base)
// ---------------------------------------------------------------------
/**
 * Que faire d'un document rattaché dont une proposition du même moteur existe peut-être déjà (même affaire, même article, même empreinte) ?
 *   CREER        aucune proposition : on la crée ;
 *   REPRENDRE    elle existe, sans décision, et n'était qu'une information alors qu'elle est maintenant décidable : MÊME proposal_id, faits complétés ;
 *   DEJA_PRESENTE sinon (décidée, déjà décidable, ou rien de décidable) : aucun doublon, aucune écriture.
 */
export function actionContinuite({ existante, decidable }) {
  if (!existante) return 'CREER';
  const dejaDecidable = (existante.facts || []).some((f) => f?.libelle_public);
  return !existante.decision && decidable && !dejaDecidable ? 'REPRENDRE' : 'DEJA_PRESENTE';
}

/**
 * Une proposition sans décision doit-elle être soumise à l'éditeur dans ce cycle ?
 * `envois` : lignes « kind:avecMessage » de telegram_envois pour la proposition (et son marqueur « #suite »).
 *   · aucun envoi : oui (comportement historique) ;
 *   · moteur « sources-suivies », fait décidable, information déjà envoyée AVEC message, jamais de demande de décision, pas de marqueur d'écart : oui, UNE fois
 *     (la demande est la SUITE de l'information : même proposition) ;
 *   · sinon non.
 */
export function aSolliciter({ decision = null, engine = null, decidable = false, envois = [] }) {
  if (decision) return false;
  if (!envois.length) return true;
  if (engine !== 'sources-suivies' || !decidable) return false;
  return !envois.some((e) => e.startsWith('decision:') || e.endsWith(':false'));
}

// ---------------------------------------------------------------------
// 10. MESSAGE D'INFORMATION (format Telegram existant : « MAINTENANCE », sans bouton)
// ---------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const jourFr = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : 'date de publication non indiquée');
const couper = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/**
 * Message INFORMATION d'une publication d'organisme rattachée à une affaire : même en-tête que telegram-v0 `info()`, aucun bouton,
 * aucune décision demandée. Utilisé par telegram-v0 (envoi) ET par l'aperçu des essais : un seul texte.
 */
/**
 * Ce que le message de DÉCISION d'une publication d'organisme ajoute au message d'enrichissement existant : attribution, limites, rattachement,
 * et — si une information avait déjà été envoyée pour CETTE proposition — le lien de continuité. Une seule définition (telegram-v0 et l'aperçu des essais).
 */
export function complementDecision({ decl, limite, publication_date, proposal_id, information_envoyee_le = null }) {
  const l = [
    '', '<b>Attribution et limites</b>',
    `Déclaration de ${esc(decl.emetteur)} (${decl.nature === 'COMMUNIQUE' ? 'communiqué' : 'publication propre'}), publiée le ${jourFr(publication_date)} ; la date de la démarche n’est pas précisée par la source.`,
    limite ? esc(couper(limite, 600)) : '',
    decl.rattachement_motif ? `<b>Rattachement</b> : ${esc(couper(decl.rattachement_motif, 400))}` : '',
    ...(decl.ajustements?.length ? ['', '<b>Inconnue(s) ajustée(s) si VALIDATE</b> (portion devenue obsolète seulement ; les autres inconnues restent)',
      ...decl.ajustements.flatMap((a) => [`• Avant : « ${esc(couper(a.avant, 260))} »`, `  Après : « ${esc(couper(a.apres, 420))} »`])] : []),
    information_envoyee_le ? '' : null,
    information_envoyee_le ? `↩️ <b>Suite de l’information du ${jourFr(information_envoyee_le)}</b> (proposition ${esc(String(proposal_id).slice(0, 8))}) : elle est désormais soumise à décision ; aucun nouvel apport.` : null,
  ].filter((x) => x !== null).filter((x, i, a) => !(x === '' && a[i - 1] === ''));
  return '\n' + l.join('\n');
}

export function apercuInformation({ etablissement, commune, media, publication_date, url, avant, citation, limite, emetteur }) {
  const entete = `<b>${esc(etablissement)}</b> — ${esc(commune)}\n${esc(media || 'source inconnue')} · ${jourFr(publication_date)}`
    + (/^https?:\/\//.test(url || '') ? `\n<a href="${esc(url).replace(/"/g, '&quot;')}">Ouvrir la publication</a>` : '');
  return `🔄 <b>MAINTENANCE</b> · 📣 ${entete}\n\nPublication de ${esc(emetteur || media)} rattachée à cette affaire.\nAucun changement de la fiche (état : ${esc(avant)}).\nAucune décision demandée : seule la déclaration de constitution de partie civile est intégrable aujourd’hui ; cette publication reste consultable en mémoire (adresse ci-dessus).`
    + (citation ? `\n\n« ${esc(couper(String(citation).replace(/\s+/g, ' '), 220))} »` : '') + (limite ? `\n\nLimite : ${esc(limite)}` : '');
}
