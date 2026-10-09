// =====================================================================
// scripts/lib/qualifier-signal.mjs — du titre de presse à la proposition décisionnelle (Discovery quotidien).
//
//   signal (titre, média, date)
//     → pages de presse retrouvées (Bing, URL éditeur directe) et RELUES
//     → extraction structurée par un modèle (une seule fois par signal)
//     → vérification CODE : chaque citation figure littéralement dans SA page, la commune figure dans le corps,
//       chaque champ catégoriel appartient à l'énumération de la base
//     → rapprochement avec les affaires connues, page par page (resolver.mjs, lecture seule)
//     → décision déterministe : NEW_CASE_CANDIDATE | REVIEW | ATTACH_EXISTING | écarté | en attente
//
// Le modèle ne décide JAMAIS : il extrait. Une citation qu'on ne retrouve pas dans la page fait tomber le signal.
// Aucune écriture ici : la persistance est l'affaire du runner.
// =====================================================================
import { rechercherBing, lirePage, admissible, domaine, canonique } from './preuve-claim.mjs';
import { citationPresente } from './discovery-presse.mjs';
import { aplatir } from './capteurs.mjs';
import { resoudre } from './resolver.mjs';
import { datesCompletes } from './etat-affaire.mjs';
import { comprendre } from './comprendre-source.mjs';
import { niveauGeo, sourceCoherente, forceRapprochement } from './rapprochement-garde.mjs';
import { detecterInstitutionnel } from './evenement-institutionnel.mjs';

export const ENUMS = {
  type_structure: ['crèche', 'maternelle', 'élémentaire', 'collège', 'lycée', 'périscolaire', 'centre de loisirs', 'internat', 'autre'],
  role_mis_en_cause: ['enseignant', 'animateur périscolaire', 'ATSEM', 'direction', 'personnel de crèche', 'parent', 'tiers', 'intervenant extérieur', 'autre'],
  type_affaire: ['viol', 'agression sexuelle', 'atteinte sexuelle', 'images pédocriminelles', 'violences sexuelles', 'mixte', 'à qualifier'],
  statut_judiciaire: ['plainte', 'enquête', 'mise en examen', 'procès', 'condamnation non définitive', 'condamnation définitive', 'relaxe / non-lieu / classement', 'à qualifier'],
  statut_des_faits: ['allégué', 'retenu par jugement non définitif', 'établi judiciairement', 'non établi', 'mixte'],
  enfants_concernes_public: ['1 enfant', 'plusieurs enfants', 'non précisé'],
};

const SYSTEME = `Tu lis des articles de presse française à propos d'un SIGNAL (un titre). Tu extrais, pour un observatoire d'affaires judiciaires concernant des structures accueillant des mineurs en France (crèche, école, périscolaire, centre de loisirs, collège, lycée, internat), les faits RAPPORTÉS PAR LA PRESSE.

RÈGLES ABSOLUES
1. Tu n'écris que ce que les articles disent. Rien d'inventé : ni lieu, ni date, ni stade de procédure. Inconnu → null.
2. est_affaire=true seulement si les articles rapportent des faits de violences/agressions sexuelles (ou images pédocriminelles) sur des MINEURS, imputés à un membre du personnel, un intervenant ou un adulte lié à UNE structure accueillant des mineurs en France. Sinon est_affaire=false (affaire privée/familiale, victime adulte, hors France, simple prévention, contrôle, reportage général, bilan statistique, réaction d'élus / commission / plan d'action sans fait précis rattaché à UNE structure identifiée, sujet « scandale du périscolaire » traité globalement).
3. Si les articles couvrent plusieurs structures, retiens celle du signal ; si l'identification est impossible, est_affaire=false.
4. "preuves" : 1 à 4 extraits LITTÉRAUX (copiés mot pour mot), chacun avec l'url EXACTE de l'article d'où il vient, parmi les articles fournis. Pas de paraphrase. Chaque extrait doit appuyer un fait (structure, commune, plainte/enquête/procès).
5. "resume" : 2 phrases neutres, introduites par « Selon la presse » ou équivalent. JAMAIS le nom ni l'âge ni la fonction précise de la personne mise en cause (écris « un animateur », « un agent »). JAMAIS le nombre exact d'enfants. JAMAIS de détail des faits. Pas de qualification de culpabilité.
6. "statut_judiciaire" = le stade le plus avancé RAPPORTÉ à ce jour (plainte, enquête, mise en examen, procès, condamnation…). Une suspension administrative n'est pas un stade judiciaire : retiens « plainte » ou « enquête » selon ce qui est écrit.
7. "dernier_evenement" = date (AAAA-MM-JJ) du dernier événement rapporté (pas la date de publication si l'article donne la date de l'événement).
8. "ambiguite" : UNE phrase si une incertitude change la décision (nom de l'établissement non confirmé, sources divergentes sur le stade, doute sur la commune), sinon null.
9. Champs catégoriels : valeurs EXACTES parmi celles listées, sinon « à qualifier » / « autre » / « non précisé ». type_structure : « maternelle » ou « élémentaire » pour une école (jamais « école »), « autre » si le type n'est pas écrit.

Réponds UNIQUEMENT par un objet JSON :
{
  "est_affaire": true | false,
  "motif_non": "..." | null,
  "commune": "...", "departement": "...",
  "etablissement": "nom tel qu'écrit" | null,
  "type_structure": ${JSON.stringify(ENUMS.type_structure)},
  "role_mis_en_cause": ${JSON.stringify(ENUMS.role_mis_en_cause)},
  "type_affaire": ${JSON.stringify(ENUMS.type_affaire)},
  "statut_judiciaire": ${JSON.stringify(ENUMS.statut_judiciaire)},
  "statut_des_faits": ${JSON.stringify(ENUMS.statut_des_faits)},
  "enfants_concernes_public": ${JSON.stringify(ENUMS.enfants_concernes_public)},
  "resume": "...",
  "dernier_evenement": "AAAA-MM-JJ" | null,
  "preuves": [ { "url": "...", "citation": "..." } ],
  "ambiguite": "..." | null
}`;

const invite = ({ article }) => article.body;
const CONTRAT = { SYSTEME, invite };

// --- recherche des pages ------------------------------------------------
const mots = (s) => new Set(aplatir(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / ((a.size + b.size - i) || 1); };
const phrases = (t) => new Set(String(t).split(/(?<=[.!?»])\s+/)
  .map((s) => aplatir(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()).filter((s) => s.length > 60));

/** Pages de presse (URL directes) qui racontent la même histoire que le titre, lues. */
export async function chercherPages(signal, { max = 4, cache = new Map() } = {}) {
  // 1. URL éditeur DIRECTES apportées par le capteur Bing : relues telles quelles, un média à la fois.
  const parDomaine = new Set();
  const pages = [];
  for (const u of signal.urls || []) {
    if (pages.length >= max) break;
    const d = domaine(u.url);
    if (!admissible(u.url) || parDomaine.has(d)) continue;
    const p = await lirePage(u.url, cache);
    if (!p.ok) continue;
    parDomaine.add(d);
    pages.push({ url: u.url, media: u.media || d, published: u.published, corps: p.corps });
  }
  // 2. Corroboration : la recherche par titre ne sert qu'à compléter (il faut au moins deux médias pour proposer).
  if (pages.length >= 3) return { pages, erreurs: [], vus: pages.length };

  const t = mots(signal.titre);
  const sig = [...t].slice(0, 8).join(' ');
  const requetes = [signal.titre.replace(/["«»]/g, ''), sig].filter((q, i, a) => q && a.indexOf(q) === i);
  const vus = new Map();
  const erreurs = [];
  for (const q of requetes) {
    try {
      for (const r of await rechercherBing(q)) {
        if (!admissible(r.url) || vus.has(r.url)) continue;
        const s = jaccard(t, mots(`${r.titre} ${r.extrait}`));
        const proche = r.published && signal.published ? Math.abs((Date.parse(r.published) - Date.parse(signal.published)) / 864e5) <= 20 : true;
        if (s >= 0.2 && proche) vus.set(r.url, { ...r, s });
      }
    } catch (e) { erreurs.push(String(e.message).slice(0, 60)); }
    if ([...vus.values()].filter((r) => r.s >= 0.35).length >= 3) break;
  }
  const classes = [...vus.values()].sort((a, b) => b.s - a.s);
  for (const r of classes) {
    if (pages.length >= max) break;
    const d = domaine(r.url);
    if (parDomaine.has(d)) continue;
    const p = await lirePage(r.url, cache);
    if (!p.ok) continue;
    parDomaine.add(d);
    pages.push({ url: r.url, media: r.media || d, published: r.published, corps: p.corps });
  }
  return { pages, erreurs, vus: vus.size };
}

// --- extraction + vérification ------------------------------------------
function corpsPourModele(signal, pages) {
  return `SIGNAL : « ${signal.titre} » (${signal.media || 'média inconnu'}, ${signal.published || 'date inconnue'})\n\n` +
    pages.map((p, i) => `ARTICLE ${i + 1}\nurl: ${p.url}\nmédia: ${p.media}\ndate de publication: ${p.published || 'inconnue'}\n"""\n${p.corps.slice(0, 6000)}\n"""`).join('\n\n');
}

/** Vérifie la réponse du modèle ; retourne { ok, motif, c, evidence } (c = champs validés). */
export function verifier(rep, pages, aujourdhui = new Date().toISOString().slice(0, 10)) {
  if (!rep || typeof rep !== 'object') return { ok: false, motif: 'réponse du modèle illisible' };
  if (rep.est_affaire !== true) return { ok: false, motif: 'hors périmètre : ' + String(rep.motif_non || 'non précisé').slice(0, 80) };
  // Une valeur hors énumération n'invalide pas une affaire réelle : repli NEUTRE (« autre », « à qualifier »…),
  // l'humain tranche. Le repli est signalé dans l'ambiguïté.
  const REPLI = { type_structure: 'autre', role_mis_en_cause: 'autre', type_affaire: 'à qualifier', statut_judiciaire: 'à qualifier', statut_des_faits: 'allégué', enfants_concernes_public: 'non précisé' };
  const replis = [];
  for (const [k, vals] of Object.entries(ENUMS)) if (!vals.includes(rep[k])) { rep[k] = REPLI[k]; replis.push(k); }
  if (replis.length) rep.ambiguite = [rep.ambiguite, `champ(s) à qualifier à la main : ${replis.join(', ')}`].filter(Boolean).join(' · ');
  const commune = String(rep.commune || '').trim();
  if (commune.length < 2) return { ok: false, motif: 'commune absente' };
  const corpsAplati = pages.map((p) => aplatir(p.corps));
  if (!corpsAplati.some((c) => c.includes(aplatir(commune)))) return { ok: false, motif: 'commune absente des articles' };
  const parUrl = new Map(pages.map((p) => [canonique(p.url), p]));
  const evidence = [];
  for (const e of Array.isArray(rep.preuves) ? rep.preuves : []) {
    const p = parUrl.get(canonique(String(e?.url || '')));
    if (!p || !e.citation || String(e.citation).length < 25) continue;
    if (citationPresente(e.citation, p.corps)) evidence.push({ media: p.media, url: p.url, quote: String(e.citation).replace(/\s+/g, ' ').trim(), published: p.published || null });
  }
  if (!evidence.length) return { ok: false, motif: 'aucune citation retrouvée dans les pages' };
  const dernier = /^\d{4}-\d{2}-\d{2}$/.test(rep.dernier_evenement || '') && rep.dernier_evenement <= aujourdhui ? rep.dernier_evenement : null;
  const resume = String(rep.resume || '').replace(/\s+/g, ' ').trim();
  if (resume.length < 30) return { ok: false, motif: 'résumé absent' };
  return {
    ok: true,
    evidence,
    c: {
      commune, departement: String(rep.departement || '').trim() || null,
      etablissement: rep.etablissement ? String(rep.etablissement).trim() : null,
      type_structure: rep.type_structure, role_mis_en_cause: rep.role_mis_en_cause, type_affaire: rep.type_affaire,
      statut_judiciaire: rep.statut_judiciaire, statut_des_faits: rep.statut_des_faits, enfants_concernes_public: rep.enfants_concernes_public,
      resume: resume.slice(0, 600), dernier_evenement: dernier, ambiguite: rep.ambiguite ? String(rep.ambiguite).slice(0, 220) : null,
    },
  };
}

/** Familles de dépêches : deux pages qui partagent ≥ 3 longues phrases sont UNE source, pas deux. */
export function independantes(pages) {
  const ph = pages.map((p) => phrases(p.corps));
  const parent = pages.map((_, i) => i);
  const racine = (i) => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    let n = 0; for (const x of ph[i]) if (ph[j].has(x)) n++;
    if (n >= 3) parent[racine(j)] = racine(i);
  }
  return new Set(pages.map((_, i) => racine(i))).size;
}

// --- rapprochement et décision ------------------------------------------
async function infosCase(sql, case_id) {
  const [c] = await sql`
    select c.case_id, c.etablissement, c.commune, c.departement, c.type_structure::text type_structure, c.role_mis_en_cause::text role,
           c.type_affaire::text type_affaire, c.statut_judiciaire::text statut, c.publication_status::text publication,
           c.commentaire_validation,
           exists (select 1 from reviews r where r.case_id = c.case_id and r.next_review_at is not null and r.decision <> 'retirer') as reexamen
      from cases c where c.case_id = ${case_id}`;
  if (!c) return null;
  c.sources = await sql`select media, url, publication_date::text d, is_primary from sources where case_id = ${case_id} order by publication_date`;
  // Résumé de l'affaire existante, tel que consigné à sa création Discovery (« [Discovery-auto:xxxxxxxx] VALIDATE — … »), sinon rien.
  const m = /^\[Discovery-auto:[0-9a-f]{8}\]\s+\w+\s+—\s+([\s\S]+)$/.exec(String(c.commentaire_validation || ''));
  c.resume = m ? m[1].replace(/\s+/g, ' ').trim() : null;
  return c;
}

/**
 * Bloc de comparaison « signal ↔ affaire existante » (payload.attach), honnête sur ce qui est établi et ce qui ne l'est pas.
 *   - les sources historiques sont RELUES : une source inaccessible ou sans rapport (redirigée vers un autre article, commune
 *     absente, thème absent) n'est jamais une preuve et n'entre pas dans la comparaison de phrases ;
 *   - « pour » = indices établis ; « contre » = contradictions et informations manquantes ;
 *   - « même commune » n'est affirmé que si la commune du SIGNAL concorde avec celle de l'affaire (cf. rapprochement-garde).
 * @returns {{ bloc:object, force:'forte'|'faible'|'aucune' }}
 */
async function construireAttach({ k, c, lues, nouvelles, res, geo, cache, partiel }) {
  const sources = [];
  for (const s of k.sources.slice(0, 4)) {
    const p = await lirePage(s.url, cache);
    const v = sourceCoherente({ url: s.url, page: p, commune: k.commune });
    sources.push({ media: s.media, url: s.url, d: s.d, verifiee: v.ok, motif: v.motif, ph: v.ok ? phrases(p.corps) : null,
      dates: v.ok ? new Set(datesCompletes(p.corps)) : new Set() });
  }
  // Dates complètes citées par la nouvelle source ET par une source VÉRIFIÉE de l'affaire — hors dates de publication (une date de
  // bandeau ou de « publié le » ne prouve rien).
  const dejaPubliees = new Set(sources.map((s) => s.d).filter(Boolean));
  const datesCommunes = [...new Set(nouvelles.flatMap((n) => datesCompletes(n.corps)))]
    .filter((d) => !dejaPubliees.has(d) && !nouvelles.some((n) => String(n.published || '').slice(0, 10) === d)
      && sources.some((s) => s.verifiee && s.dates.has(d)));
  const pour = [];
  const contre = [];
  if (geo.niveau === 'ok') pour.push(`commune concordante : ${c.commune}`);
  else if (geo.raison) contre.push(geo.raison);
  let memeDepeche = false;
  for (const n of nouvelles.slice(0, 2)) {
    const ph = phrases(n.corps);
    for (const s of sources.filter((x) => x.verifiee)) {
      let m = 0; for (const x of ph) if (s.ph.has(x)) m++;
      if (m >= 3) { pour.push(`${n.media} et ${s.media} (déjà en base) reprennent les mêmes phrases (même dépêche)`); memeDepeche = true; break; }
    }
  }
  if (datesCommunes.length) pour.push(`même fait daté cité par les deux jeux de sources : ${datesCommunes.slice(0, 2).map((d) => d.split('-').reverse().join('/')).join(', ')}`);
  for (const e of (res.evidence || []).slice(0, 2)) pour.push(String(e).replace(/^FR-\d{4}-\d{4} — /, ''));
  for (const x of (res.conflicts || []).slice(0, 2)) contre.push(String(x).replace(/^FR-\d{4}-\d{4} — /, ''));
  const nv = sources.filter((x) => !x.verifiee).length;
  if (nv) contre.push(`${nv} source(s) historique(s) de l’affaire non vérifiable(s) (lien indisponible ou sans rapport) : non retenue(s) comme preuve`);
  const maj = k.statut !== c.statut_judiciaire ? `état : « ${k.statut} » en base, « ${c.statut_judiciaire} » dans les nouveaux articles` : null;
  if (maj) contre.push(maj);
  if (c.ambiguite) contre.push(c.ambiguite);
  const { force, raison } = forceRapprochement({ geo, resolution: partiel ? 'POSSIBLE_MATCH' : 'MATCH', memeDepeche, datesCommunes });
  if (force === 'faible' && raison && !contre.includes(raison)) contre.unshift(raison);
  return {
    force,
    bloc: {
      case_id: k.case_id, etablissement: k.etablissement, commune: k.commune, statut: k.statut, type_affaire: k.type_affaire, role: k.role,
      resume: k.resume,
      sources: sources.map(({ ph, dates, ...s }) => s),
      nouvelles: nouvelles.map((p) => ({ media: p.media, url: p.url, d: p.published })),
      pourquoi: [...new Set(pour)].slice(0, 4),
      contre: [...new Set(contre)].slice(0, 5),
      divergence: [...new Set(contre)].join(' · ') || null,
      incertitude: force === 'forte' ? 'modérée' : 'élevée',
    },
  };
}

const GRAVITE = { MATCH: 2, POSSIBLE_MATCH: 1, NO_MATCH: 0 };

/**
 * Évalue UN signal.
 * @returns {{statut:'propose'|'ecarte'|'attente'|null, motif:string, proposition?:object, cout?:object}}
 *   statut null = incident technique (modèle, réseau) : le signal n'est pas consigné, il sera repris au prochain run.
 */
export async function evaluer({ sql, index, signal, modele, cle, cache = new Map() }) {
  const { pages, erreurs } = await chercherPages(signal, { cache });
  if (!pages.length) return { statut: erreurs.length ? null : 'attente', motif: erreurs.length ? 'recherche en erreur' : 'aucune page retrouvée' };

  let ext;
  try {
    ext = await comprendre({ fiche: {}, article: { media: signal.media, publication_date: signal.published, body: corpsPourModele(signal, pages) }, modele, contrat: CONTRAT, cle });
  } catch (e) { return { statut: null, motif: 'modèle indisponible : ' + String(e.message).slice(0, 60) }; }
  const v = verifier(ext.reponse, pages);
  if (!v.ok) return { statut: 'ecarte', motif: v.motif, cout: ext.cout };
  const { c, evidence } = v;

  const lues = pages.filter((p) => evidence.some((e) => canonique(e.url) === canonique(p.url)));
  const domaines = new Set(evidence.map((e) => domaine(e.url)));
  const indep = independantes(lues);

  // Rapprochement : une résolution PAR page, jamais sur le texte concaténé (faux POSSIBLE_MATCH constaté).
  const parPage = lues.map((p) => resoudre({ candidate: { title: '' }, index, corps: p.corps }));
  const res = parPage.reduce((a, r) => (GRAVITE[r.resolution_status] > GRAVITE[a.resolution_status] ? r : a), parPage[0]);
  // GARDE GÉOGRAPHIQUE. Le résolveur rapproche sur des indices faibles (la commune « présente » dans les 900 premiers
  // caractères d'une page — un menu de navigation « édition de <ville> » suffit). Aucun rapprochement n'est affirmé contre la localisation du SIGNAL
  // (commune extraite ET retrouvée dans le corps des articles) : contradiction forte → l'affaire visée est écartée.
  const geoDe = (id) => { const f = index.find((x) => x.case_id === id); return niveauGeo({ commune: c.commune, departement: c.departement }, { commune: f?.commune, departement: f?.departement }); };
  const ecartes = [];
  const voisinsResolver = [...new Set(parPage.flatMap((r) => r.voisins || []))].filter((id) => {
    const g = geoDe(id);
    if (g.niveau === 'bloquant') { ecartes.push({ case_id: id, raison: g.raison }); return false; }
    return true;
  });
  // Plusieurs rapprochements partiels : seuls comptent ceux de la MÊME commune (un « Saint-Denis » d'Ardèche ne se rapproche pas
  // d'un article parisien). Un seul reste → c'est l'affaire visée ; aucun → pas de rapprochement ; plusieurs, tous déjà
  // suivis (publiés, en réexamen, écartés) → couverture d'affaires connues, silence.
  let cible = res.matched_case_id;
  let statutRes = res.resolution_status;
  if (statutRes === 'POSSIBLE_MATCH' && !cible) {
    const premier = (s) => aplatir(s || '').split(/[^a-z]+/).filter(Boolean)[0] || '';
    const ids = (res.detail || []).filter((d) => d.rattachement === 'OK' || d.rattachement === 'DOUTEUX').map((d) => d.case_id)
      .filter((id) => { const f = index.find((x) => x.case_id === id); return f && premier(f.commune) === premier(c.commune); });
    if (ids.length === 1) cible = ids[0];
    else if (ids.length === 0) statutRes = 'NO_MATCH';
    else {
      const ks = await Promise.all(ids.map((id) => infosCase(sql, id)));
      if (ks.every((k) => k && (k.publication === 'retirée' || k.publication === 'publiée' || k.reexamen))) {
        return { statut: 'ecarte', motif: 'connu probable : affaires voisines toutes suivies', cout: ext.cout };
      }
    }
  }
  if (cible) {
    const g = geoDe(cible);
    if (g.niveau === 'bloquant') { ecartes.push({ case_id: cible, raison: g.raison }); cible = null; statutRes = 'NO_MATCH'; }
  }
  const communeN = aplatir(c.commune);
  const voisins = index.filter((f) => aplatir(f.commune) === communeN && f.case_id !== cible)
    .map((f) => ({ case_id: f.case_id, etablissement: f.etablissement, role: f.role_mis_en_cause, statut: f.statut_judiciaire }));

  const base = {
    version: 'discovery-quotidien-1',
    signal: { titre: signal.titre, media: signal.media, published: signal.published },
    source: { media: evidence[0].media, url: evidence[0].url, titre: signal.titre },
    date_source: evidence[0].published || signal.published || null,
    dernier_evenement: c.dernier_evenement,
    resume: c.resume, commune: c.commune, etablissement: c.etablissement, structure: c.type_structure, stade_minimal: c.statut_judiciaire,
    evidence, articles: lues.map((p) => ({ media: p.media, url: p.url, published: p.published })),
    unknowns: c.ambiguite ? [c.ambiguite] : [],
    independantes: indep, medias: domaines.size,
  };
  // Réaction ou mesure d'une institution rapportée par la presse : conservée comme fait STRUCTURÉ, distinct de l'état judiciaire
  // (jamais de transition). Libellé public tiré d'une table fermée ; la citation reste en mémoire privée.
  const inst = detecterInstitutionnel(evidence.map((e) => e.quote));
  if (inst) {
    const src = evidence.find((e) => String(e.quote).replace(/\s+/g, ' ').trim() === inst.citation) || evidence[0];
    base.institutionnel = { ...inst, url: src.url, media: src.media, published: src.published || null };
  }
  const nomme = !!c.etablissement && !/non nomm|non pr[ée]cis/i.test(c.etablissement);
  const etab = nomme ? c.etablissement : `${c.type_structure} non nommée`;
  const cleStd = `${aplatir(c.commune)}|${aplatir(etab)}|${aplatir(c.role_mis_en_cause)}`;
  const fiche = {
    departement: c.departement || '', type_structure: c.type_structure, role_mis_en_cause: c.role_mis_en_cause, type_affaire: c.type_affaire,
    statut_judiciaire: c.statut_judiciaire, statut_des_faits: c.statut_des_faits, enfants_concernes_public: c.enfants_concernes_public,
    crit_source_fiable: true, crit_article_recent: true, crit_etablissement_nomme: nomme,
    crit_statut_clair: c.statut_judiciaire !== 'à qualifier', crit_recoupement: indep >= 2,
  };

  // Une affaire connue est visée : rapprochement complet (MATCH) ou PARTIEL sur UNE seule affaire (POSSIBLE_MATCH avec
  // matched_case_id — ex. « École de Mées (type non précisé) », dont les mots du nom ne se retrouvent jamais tels quels).
  // Dans les deux cas : affaire écartée / suivie par la Maintenance / rien de plus récent que ses sources → silence ;
  // sinon rapprochement PROPOSÉ à un humain (jamais appliqué seul), avec ce qui manque à l'identification.
  if (cible && (statutRes === 'MATCH' || statutRes === 'POSSIBLE_MATCH')) {
    const partiel = statutRes === 'POSSIBLE_MATCH';
    const k = await infosCase(sql, cible);
    if (!k) return { statut: 'ecarte', motif: 'rapprochement vers une affaire introuvable', cout: ext.cout };
    if (k.publication === 'retirée') return { statut: 'ecarte', motif: 'connu : affaire écartée', cout: ext.cout };
    if (k.publication === 'publiée' || k.reexamen) return { statut: 'ecarte', motif: 'connu : suivi par Maintenance', cout: ext.cout };
    const connues = new Set(k.sources.map((s) => canonique(s.url)));
    const nouvelles = lues.filter((p) => !connues.has(canonique(p.url)));
    if (!nouvelles.length) return { statut: 'ecarte', motif: 'connu : aucune source nouvelle', cout: ext.cout };
    const derniere = k.sources.map((s) => s.d).filter(Boolean).sort().pop() || null;
    if (!nouvelles.some((p) => p.published && (!derniere || p.published > derniere))) return { statut: 'ecarte', motif: 'connu : sources nouvelles non postérieures', cout: ext.cout };
    // Rapprochement FORT (ATTACH proposé d'emblée) seulement si une preuve d'identité existe : « même commune » ou « même rôle »
    // ne suffisent jamais. Sinon REVIEW : l'humain compare les deux jeux de sources et tranche (RAPPROCHER / CRÉER / REVIEW).
    const { bloc, force } = await construireAttach({ k, c, lues, nouvelles, res, geo: geoDe(cible), cache, partiel });
    return {
      statut: 'propose', motif: force === 'forte' ? 'rattachement proposé' : 'rattachement à arbitrer', cout: ext.cout,
      proposition: {
        dedup_key: `attach|${k.case_id}|${aplatir(canonique(nouvelles[0].url)).slice(-60)}`,
        recommendation: force === 'forte' ? 'ATTACH_EXISTING' : 'REVIEW', attach_case_id: k.case_id,
        payload: {
          ...base, fiche, etablissement_nomme: nomme, attach: bloc, rapprochement_ecarte: ecartes[0] || null,
          possible_matches_sny: [{ case_id: k.case_id, etablissement: k.etablissement, role: k.role, statut: k.statut }],
          avertissement: force === 'forte' ? c.ambiguite : 'rapprochement non démontré : ' + (bloc.contre[0] || 'identification incomplète').slice(0, 150),
        },
      },
    };
  }

  let recommendation, avertissement = c.ambiguite;
  if (statutRes === 'POSSIBLE_MATCH') {
    recommendation = 'REVIEW'; avertissement = 'ambiguïté avec une affaire connue : ' + (res.reason || '').slice(0, 120);
  } else if (voisinsResolver.length > 3) {
    // Commune à nombreuses affaires connues (Paris) et établissement que l'article ne nomme pas : c'est de la couverture
    // générale d'un scandale en cours, pas une affaire identifiable. Se taire vaut mieux que 10 « affaires voisines » à trier.
    return { statut: 'ecarte', motif: `couverture générale : établissement non identifié, ${voisinsResolver.length} affaires voisines`, cout: ext.cout };
  } else if (voisinsResolver.length) {
    recommendation = 'REVIEW'; avertissement = `affaire voisine déjà connue (${voisinsResolver.join(', ')}) : même commune et même rôle, établissement non nommé`;
  } else if (domaines.size < 2) {
    return { statut: 'attente', motif: 'un seul média : en attente de recoupement', cout: ext.cout };
  } else if (indep < 2) {
    recommendation = 'REVIEW'; avertissement = 'les médias reprennent la même dépêche (une seule source indépendante)' + (c.ambiguite ? ' · ' + c.ambiguite : '');
  } else recommendation = 'NEW_CASE_CANDIDATE';

  const possibles = statutRes === 'NO_MATCH'
    ? voisins
    : [...(res.detail || []).filter((d) => d.rattachement !== 'NON_RATTACHABLE').map((d) => ({ case_id: d.case_id })), ...voisins];

  // Une SEULE affaire voisine déjà connue (même commune concordante) : l'humain doit pouvoir COMPARER les deux jeux de sources
  // et choisir RAPPROCHER ou CRÉER (cas du 09/10/2026 : « affaire voisine déjà connue » annoncée sans aucune de ses sources).
  let attach = null;
  if (recommendation === 'REVIEW' && statutRes !== 'POSSIBLE_MATCH' && voisinsResolver.length === 1) {
    const k = await infosCase(sql, voisinsResolver[0]);
    if (k) {
      const connues = new Set(k.sources.map((s) => canonique(s.url)));
      const nouvelles = lues.filter((p) => !connues.has(canonique(p.url)));
      if (nouvelles.length) attach = { k, nouvelles };
    }
  }
  if (attach) {
    const { bloc } = await construireAttach({ k: attach.k, c, lues, nouvelles: attach.nouvelles, res, geo: geoDe(attach.k.case_id), cache, partiel: true });
    return {
      statut: 'propose', motif: 'rattachement à arbitrer', cout: ext.cout,
      proposition: {
        dedup_key: cleStd, recommendation, attach_case_id: attach.k.case_id,
        payload: { ...base, fiche, etablissement_nomme: nomme, attach: bloc, rapprochement_ecarte: ecartes[0] || null,
          possible_matches_sny: [{ case_id: attach.k.case_id, etablissement: attach.k.etablissement, role: attach.k.role, statut: attach.k.statut }], avertissement },
      },
    };
  }
  return {
    statut: 'propose', motif: recommendation, cout: ext.cout,
    proposition: {
      dedup_key: cleStd, recommendation, attach_case_id: null,
      payload: { ...base, fiche, etablissement_nomme: nomme, possible_matches_sny: possibles.slice(0, 4), avertissement, rapprochement_ecarte: ecartes[0] || null },
    },
  };
}
