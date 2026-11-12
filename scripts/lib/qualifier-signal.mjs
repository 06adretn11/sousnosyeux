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
import { niveauGeo, sourceCoherente, forceRapprochement, comparerSignaux, comparerEtablissements, rapprochementEtaye, jetonsEtablissement, estNommeEtab } from './rapprochement-garde.mjs';
import { detecterInstitutionnel } from './evenement-institutionnel.mjs';
import { stadeEtabli, stadeCite } from './stade-judiciaire.mjs';
import { MACHINE_RE, DECIDEUR_MACHINE } from './decision-machine.mjs';
import { evaluerPublication } from './publication-gates.mjs';
import { geocoderCommune } from './geocoder-commune.mjs';
import { localisationDe } from './proposition-publication.mjs';

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
4. "preuves" : 1 à 4 extraits LITTÉRAUX (copiés mot pour mot), chacun avec l'url EXACTE de l'article d'où il vient, parmi les articles fournis. Pas de paraphrase. Chaque extrait doit appuyer un fait (structure, commune, plainte/enquête/procès). Au moins un extrait doit établir la PROCÉDURE du stade retenu (acte, ou autorité qui enquête) : une suspension, une enquête administrative ou une plainte ne sont pas une enquête judiciaire.
5. "resume" : 2 phrases neutres, introduites par « Selon la presse » ou équivalent. JAMAIS le nom ni l'âge ni la fonction précise de la personne mise en cause (écris « un animateur », « un agent »). JAMAIS le nombre exact d'enfants. JAMAIS de détail des faits. Pas de qualification de culpabilité.
6. "statut_judiciaire" = le stade le plus avancé RAPPORTÉ à ce jour (plainte, enquête, mise en examen, procès, condamnation…). Une suspension administrative n'est pas un stade judiciaire : retiens « plainte » ou « enquête » selon ce qui est écrit.
7. "dernier_evenement" = date (AAAA-MM-JJ) du dernier événement rapporté (pas la date de publication si l'article donne la date de l'événement).
8. "ambiguite" : UNE phrase si une incertitude change la décision (nom de l'établissement non confirmé, sources divergentes sur le stade, doute sur la commune), sinon null.
9. Champs catégoriels : UNE SEULE valeur, écrite comme une chaîne (jamais une liste), EXACTEMENT parmi celles proposées, sinon « à qualifier » / « autre » / « non précisé ». type_structure : « maternelle » ou « élémentaire » pour une école (jamais « école »), « autre » si le type n'est pas écrit.
10. "nombre_personnes_mises_en_cause" : un entier si les articles disent combien de personnes sont mises en cause DANS CETTE structure (« un animateur » = 1, « deux agents » = 2) ; null si ce n'est pas écrit. Ne compte pas les personnes d'autres structures.
11. "periode_des_faits" : « AAAA-MM » (ou « AAAA ») si les articles datent les FAITS eux-mêmes (« les faits remontent à septembre 2026 ») ; ni la date de parution, ni celle d'un acte de procédure ; null sinon.

Réponds UNIQUEMENT par un objet JSON (chaque champ catégoriel est une chaîne choisie parmi les valeurs indiquées) :
{
  "est_affaire": true | false,
  "motif_non": "..." | null,
  "commune": "...", "departement": "...",
  "etablissement": "nom tel qu'écrit" | null,
  "type_structure": "${ENUMS.type_structure.join(' | ')}",
  "role_mis_en_cause": "${ENUMS.role_mis_en_cause.join(' | ')}",
  "type_affaire": "${ENUMS.type_affaire.join(' | ')}",
  "statut_judiciaire": "${ENUMS.statut_judiciaire.join(' | ')}",
  "statut_des_faits": "${ENUMS.statut_des_faits.join(' | ')}",
  "enfants_concernes_public": "${ENUMS.enfants_concernes_public.join(' | ')}",
  "nombre_personnes_mises_en_cause": 1 | 2 | ... | null,
  "periode_des_faits": "AAAA-MM" | "AAAA" | null,
  "resume": "...",
  "dernier_evenement": "AAAA-MM-JJ" | null,
  "preuves": [ { "url": "...", "citation": "..." } ],
  "ambiguite": "..." | null
}`;

const invite = ({ article }) => article.body;
export const CONTRAT = { SYSTEME, invite };

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
  // DIAGNOSTIC : la forme ORIGINALE de chaque champ catégoriel est conservée (jamais écrasée sans trace) — « liste » = valeur retrouvée dans une liste,
  // `repli` = champ ramené au neutre avec sa raison (absent · vide · invalide · ambigu). C'est ce qui permettra de distinguer, plus tard, un défaut de TYPE
  // d'une valeur réellement invalide (les sorties brutes du modèle ne sont pas conservées).
  const diag = { liste: [], repli: {} };
  for (const [k, vals] of Object.entries(ENUMS)) {
    const a = analyseEnum(rep[k], vals);
    if (a.valeur) { if (a.forme !== 'chaine') diag.liste.push(k); rep[k] = a.valeur; } else { rep[k] = REPLI[k]; replis.push(k); diag.repli[k] = a.etat; }
  }
  // Le repli est dit EN PREMIER : l'ambiguïté est tronquée à l'affichage, jamais ce qui reste à qualifier à la main.
  if (replis.length) rep.ambiguite = [`champ(s) à qualifier à la main : ${replis.join(', ')}`, rep.ambiguite].filter(Boolean).join(' · ');
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
  // DOCTRINE : le stade judiciaire retenu doit être ÉTABLI par les citations (jamais par le nombre d'articles). Suspension, enquête
  // administrative, plainte seule : jamais promues en « enquête ». Le stade est ramené à ce que les citations établissent.
  const stade = stadeEtabli(rep.statut_judiciaire, evidence.map((e) => e.quote));
  if (!stade.ok) { rep.statut_judiciaire = stade.stade; rep.ambiguite = [rep.ambiguite, stade.raison].filter(Boolean).join(' · '); }
  // PROCÉDURE ≠ QUALIFICATION. Un stade laissé « à qualifier » (réponse du modèle absente ou hors énumération) alors que les citations
  // établissent une enquête (acte ou autorité nommée) ou une plainte est RELEVÉ à ce que les citations établissent — jamais au-delà :
  // les stades supérieurs restent annoncés par le modèle ET prouvés par les citations. La qualification juridique des faits
  // (`type_affaire`) n'est jamais déduite ici.
  if (rep.statut_judiciaire === 'à qualifier') {
    const cite = stadeCite(evidence.map((e) => e.quote));
    if (cite === 'enquête' || cite === 'plainte') rep.statut_judiciaire = cite;
  }
  const personnes = Number(rep.nombre_personnes_mises_en_cause);
  const periode = periodeAttestee(rep.periode_des_faits, corpsAplati);
  const dernier = /^\d{4}-\d{2}-\d{2}$/.test(rep.dernier_evenement || '') && rep.dernier_evenement <= aujourdhui ? rep.dernier_evenement : null;
  let resume = sansNombreDEnfants(String(rep.resume || '').replace(/\s+/g, ' ').trim());
  if (resume.length < 30) return { ok: false, motif: 'résumé absent' };
  // Une réserve ne répare pas une affirmation principale injustifiée : si les articles DIVERGENT sur un acte de procédure (garde à vue, interpellation…) et que le
  // résumé le dit comme certain, le résumé est remplacé par une formulation neutre bâtie sur les champs vérifiés ; la divergence reste affichée.
  const ambiguite = rep.ambiguite ? coupeMot(String(rep.ambiguite), 420) : null;
  const contestes = faitsContestes(resume, ambiguite);
  if (contestes.length) resume = resumeNeutre({ commune, type_structure: rep.type_structure, statut_judiciaire: rep.statut_judiciaire }, contestes);
  return {
    ok: true,
    evidence,
    c: {
      commune, departement: String(rep.departement || '').trim() || null,
      etablissement: rep.etablissement ? String(rep.etablissement).trim() : null,
      type_structure: rep.type_structure, role_mis_en_cause: rep.role_mis_en_cause, type_affaire: rep.type_affaire,
      statut_judiciaire: rep.statut_judiciaire, statut_des_faits: rep.statut_des_faits, enfants_concernes_public: rep.enfants_concernes_public,
      resume: resume.slice(0, 600), dernier_evenement: dernier, ambiguite,
      ...(contestes.length ? { resume_neutralise: contestes } : {}),
      personnes: Number.isInteger(personnes) && personnes >= 1 && personnes <= 30 ? personnes : null, periode_faits: periode,
      ...(diag.liste.length || replis.length ? { diag_enum: diag } : {}),
    },
  };
}

/** Coupe à une limite de mots : jamais au milieu d'un mot (« … le 9 novemb »), avec une ellipse quand le texte est abrégé. */
export function coupeMot(texte, max) {
  const s = String(texte ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const brut = s.slice(0, max - 1);
  const i = brut.lastIndexOf(' ');
  return `${(i > max * 0.6 ? brut.slice(0, i) : brut).replace(/[\s,;:(]+$/, '')}…`;
}

// Jamais le nombre d'enfants (règle 5 du contrat, non négociable) : un modèle l'écrit parfois malgré la consigne (« une douzaine d'enfants »).
const NB_ENFANTS = /\b(?:(?:une|la)\s+)?(?:(?:douzaine|dizaine|vingtaine|quinzaine|trentaine|centaine)|\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt)\s+(?:d['’]\s*)?(enfants|élèves|eleves|fillettes|garçons|garcons|garçonnets|garconnets|victimes)\b/gi;
/** « sur une douzaine d'enfants » → « sur plusieurs enfants ». */
export const sansNombreDEnfants = (resume) => String(resume || '').replace(NB_ENFANTS, 'plusieurs $1');

// Actes de procédure dont un désaccord entre articles ne doit jamais devenir une certitude du résumé.
const ACTES_PROCEDURE = [
  ['garde à vue', /garde a vue/], ['interpellation', /interpell/], ['mise en examen', /mis(?:e)? en examen/],
  ['détention', /ecroue|detention provisoire|incarcere/], ['déferrement', /deferre|presente (?:a|au) (?:un )?juge/],
];
const DIVERGENCE = /diverg|contradict|ne concordent|se contredisent|dementi|conteste|tandis que|alors que|en revanche/;
/** Actes de procédure à la fois contestés par la réserve (divergence entre articles) ET affirmés par le résumé. */
export function faitsContestes(resume, ambiguite) {
  const a = aplatir(ambiguite || '');
  if (!DIVERGENCE.test(a)) return [];
  const r = aplatir(resume || '');
  return ACTES_PROCEDURE.filter(([, re]) => re.test(a) && re.test(r)).map(([nom]) => nom);
}
const STRUCTURES = { maternelle: 'une école maternelle', 'élémentaire': 'une école élémentaire', 'crèche': 'une crèche', 'collège': 'un collège', 'lycée': 'un lycée', 'périscolaire': 'un accueil périscolaire', 'centre de loisirs': 'un centre de loisirs', internat: 'un internat' };
const STADES = { enquête: ' ; une enquête est en cours', plainte: ' ; une plainte a été déposée', 'mise en examen': ' ; une mise en examen est rapportée' };
/** Résumé neutre bâti sur les seuls champs vérifiés (lieu, type de structure, stade établi) : aucun acte contesté n'y figure. */
export function resumeNeutre({ commune, type_structure, statut_judiciaire }, contestes) {
  const lieu = STRUCTURES[type_structure] || 'une structure accueillant des mineurs';
  return `Selon la presse, des faits sont reprochés à un membre du personnel d’${lieu} à ${commune}${STADES[statut_judiciaire] || ''}. Les sources divergent sur ${contestes.length > 1 ? 'certains actes de procédure' : 'un acte de procédure'} (${contestes.join(', ')}) : ce point n’est pas établi.`;
}

/**
 * Valeur d'énumération d'un champ catégoriel du modèle. Aucun choix arbitraire :
 *   chaîne reconnue                                  → ok (forme « chaine »)
 *   liste d'UNE valeur reconnue, ou de valeurs reconnues ÉQUIVALENTES (sans accent ni casse) → ok (forme « liste »)
 *   liste vide · absent · valeur étrangère           → pas de valeur (« vide » · « absent » · « invalide »)
 *   plusieurs catégories reconnues incompatibles, ou reconnue mêlée à une valeur étrangère   → pas de valeur (« ambigu »)
 * @returns {{valeur:string|undefined, forme:string, etat:'ok'|'absent'|'vide'|'invalide'|'ambigu'}}
 */
export function analyseEnum(v, vals) {
  const reconnue = (x) => (typeof x === 'string' ? vals.find((e) => aplatir(e) === aplatir(x).trim()) : undefined);
  if (v === undefined || v === null) return { valeur: undefined, forme: 'absent', etat: 'absent' };
  if (Array.isArray(v)) {
    if (!v.length) return { valeur: undefined, forme: 'liste', etat: 'vide' };
    const reco = v.map(reconnue);
    if (reco.every((x) => x === undefined)) return { valeur: undefined, forme: 'liste', etat: 'invalide' };
    const distinctes = new Set(reco);
    if (distinctes.size === 1 && !distinctes.has(undefined)) return { valeur: reco[0], forme: 'liste', etat: 'ok' };
    return { valeur: undefined, forme: 'liste', etat: 'ambigu' };
  }
  const r = reconnue(v);
  return r ? { valeur: r, forme: 'chaine', etat: 'ok' } : { valeur: undefined, forme: typeof v, etat: 'invalide' };
}
/** Compatibilité : la valeur seule. */
export const valeurEnum = (v, vals) => analyseEnum(v, vals).valeur;

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
/** « AAAA-MM » ou « AAAA » : retenu seulement si l'année (et le mois) figurent dans les articles. null sinon (jamais deviné). */
export function periodeAttestee(periode, corpsAplatis) {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(String(periode || ''));
  if (!m) return null;
  const mo = m[2] ? Number(m[2]) : null;
  if (mo !== null && (mo < 1 || mo > 12)) return null;
  const present = corpsAplatis.some((c) => c.includes(m[1]) && (mo === null || c.includes(`${MOIS[mo - 1]} ${m[1]}`) || c.includes(`${m[1]}-${m[2]}`)));
  return present ? periode : null;
}

// Une page qui dit elle-même tenir son information d'AUTRES médias (« selon plusieurs médias locaux », « selon nos confrères », « comme le rapporte X ») est un
// RELAIS : un éditeur de plus, jamais une origine de plus (cas ToutMontpellier, 12/11/2026 : paraphrase de Midi Libre comptée comme troisième source indépendante).
const RELAIS = /\b(?:selon|d['’]apr[èe]s)\s+(?:plusieurs|de nombreux|les|des|nos)\s+(?:m[ée]dias|confr[èe]res|journaux|sources? m[ée]diatiques?)|\bcomme\s+(?:le\s+)?(?:rapportent?|r[ée]v[èe]lent?|indiquent?)\s+(?:plusieurs\s+)?(?:m[ée]dias|confr[èe]res)|\bselon\s+(?:le\s+quotidien|nos\s+confr[èe]res)\b/i;
/** Familles de dépêches : deux pages qui partagent ≥ 3 longues phrases sont UNE source, pas deux ; un relais déclaré n'en est pas une (au moins une reste). */
export function independantes(pages) {
  const ph = pages.map((p) => phrases(p.corps));
  const parent = pages.map((_, i) => i);
  const racine = (i) => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    let n = 0; for (const x of ph[i]) if (ph[j].has(x)) n++;
    if (n >= 3) parent[racine(j)] = racine(i);
  }
  const familles = new Map();
  pages.forEach((p, i) => { const r = racine(i); (familles.get(r) || familles.set(r, []).get(r)).push(p); });
  const originales = [...familles.values()].filter((f) => f.some((p) => !RELAIS.test(String(p.corps || ''))));
  return Math.max(originales.length, pages.length ? 1 : 0);
}

// --- rapprochement et décision ------------------------------------------
export async function infosCase(sql, case_id) {
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
export async function construireAttach({ k, c, lues, nouvelles, res, geo, cache, partiel }) {
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
  // Établissement : concordance, information absente (un nom d'école absent n'est pas un nom différent) ou contradiction étayée.
  const etab = comparerEtablissements({ nom: c.etablissement }, { nom: k.etablissement });
  if (etab.etat === 'concordance') pour.push(etab.detail); else if (etab.etat === 'contradiction') contre.push(etab.detail);
  // Le résolveur parle de TOUTES ses candidates : seules les lignes de CETTE affaire (ou sans identifiant) lui sont attribuées.
  // Sans ce filtre, le manque d'une autre candidate (« établissement non retrouvé » d'une affaire nantaise) apparaissait
  // comme un contre-argument contre l'affaire visée.
  const ID = /^((?:FR-\d{4}|PARIS|POC)-\d+) — /;
  const deLaCible = (l) => { const m = ID.exec(String(l)); return !m || m[1] === k.case_id; };
  // Départage par les sources et la chronologie : les candidates de la MÊME commune écartées sont ce que l'humain veut savoir.
  const ville = (s) => aplatir(s || '').split(/[^a-z]+/).filter(Boolean)[0] || '';
  for (const v of (res.departage?.verdicts || []).filter((x) => x.verdict === 'exclue' && ville(x.commune) === ville(k.commune))) {
    pour.push(`${v.case_id} (${v.commune}) écartée : ${v.raison}`);
  }
  for (const e of (res.evidence || []).filter(deLaCible).slice(0, 3)) pour.push(String(e).replace(ID, ''));
  for (const x of (res.conflicts || []).filter(deLaCible).slice(0, 2)) contre.push(String(x).replace(ID, ''));
  const nv = sources.filter((x) => !x.verifiee).length;
  if (nv) contre.push(`${nv} source(s) historique(s) de l’affaire non vérifiable(s) (lien indisponible ou sans rapport) : non retenue(s) comme preuve`);
  const maj = k.statut !== c.statut_judiciaire ? `état : « ${k.statut} » en base, « ${c.statut_judiciaire} » dans les nouveaux articles` : null;
  if (maj) contre.push(maj);
  if (c.ambiguite) contre.push(c.ambiguite);
  const { force, raison } = forceRapprochement({ geo, resolution: partiel ? 'POSSIBLE_MATCH' : 'MATCH', memeDepeche, datesCommunes });
  if (force === 'faible' && raison && !contre.includes(raison)) contre.unshift(raison);
  return {
    force, indices: { memeDepeche, datesCommunes },
    bloc: {
      case_id: k.case_id, etablissement: k.etablissement, commune: k.commune, statut: k.statut, type_affaire: k.type_affaire, role: k.role,
      resume: k.resume,
      sources: sources.map(({ ph, dates, ...s }) => s),
      nouvelles: nouvelles.map((p) => ({ media: p.media, url: p.url, d: p.published })),
      pourquoi: [...new Set(pour)].slice(0, 5),
      contre: [...new Set(contre)].slice(0, 5),
      divergence: [...new Set(contre)].join(' · ') || null,
      incertitude: force === 'forte' ? 'modérée' : 'élevée',
    },
  };
}

// --- une affaire = une proposition ---------------------------------------------
// Cas réel (15/10/2026, Soyaux) : trois articles sur la même école ont donné TROIS propositions NEW_CASE, deux validées puis
// converties en deux fiches. Les propositions sont qualifiées l'une après l'autre ; la mémoire consultée (le résolveur) ne contient
// que les FICHES, jamais les propositions encore ouvertes ; et la clé de déduplication (commune|établissement|rôle) varie avec le
// nom écrit (« école maternelle X », « école X », « structure non nommée »).
// Preuve d'identité (rapprochement-garde.comparerSignaux) : trois états par dimension. « Même affaire » = commune des faits concordante,
// AUCUNE contradiction étayée (communes, établissements nommés, rôles précis, nombre de personnes, période des faits) ET un indice
// discriminant (établissement nommé concordant — « école primaire X » = « école X » — ou page citée par les deux). Une page en commun n'est
// plus exigée : deux articles d'un même éditeur n'en partagent pas (cas du 08/11/2026). Une information absente n'est pas une contradiction.
const estNomme = (p) => (p.etablissement_nomme ?? p.fiche?.crit_etablissement_nomme) === true;
const jetonsEtab = jetonsEtablissement;

/** Deux payloads de proposition décrivent-ils la même affaire ? @returns {{ok:boolean, motif:string, verdict:string, dimensions:object[]}} */
export function memeAffaire(a, b) {
  const r = comparerSignaux(a, b);
  return { ok: r.verdict === 'meme', motif: r.motif, verdict: r.verdict, dimensions: r.dimensions };
}

/**
 * Ce qu'un signal rapporté à une proposition DÉJÀ ENVOYÉE change-t-il vraiment pour la décision de l'éditeur ?
 * Matériel : un média nouveau, un stade judiciaire plus avancé, une mesure institutionnelle nouvelle ou passée d'annoncée à réalisée,
 * un établissement jusque-là non nommé. Une page de plus du même éditeur sans fait nouveau n'est PAS matérielle : aucun nouveau message.
 */
export function changementMateriel(ancien, nouveau) {
  const raisons = [];
  const dom = new Set((ancien.articles || []).map((x) => domaine(x.url)));
  const nouveaux = (nouveau.articles || []).filter((x) => !dom.has(domaine(x.url)));
  if (nouveaux.length) raisons.push(`un média nouveau (${[...new Set(nouveaux.map((x) => x.media || domaine(x.url)))].join(', ')})`);
  const RANG = ['à qualifier', 'plainte', 'enquête', 'mise en examen', 'procès', 'condamnation non définitive', 'condamnation définitive'];
  if (RANG.indexOf(nouveau.stade_minimal) > RANG.indexOf(ancien.stade_minimal) && RANG.indexOf(nouveau.stade_minimal) > 0) raisons.push(`un stade judiciaire plus avancé (« ${nouveau.stade_minimal} »)`);
  const [ai, ni] = [ancien.institutionnel, nouveau.institutionnel];
  if (ni && (!ai || ai.mesure !== ni.mesure || (ai.realisation === 'annoncée' && ni.realisation === 'réalisée'))) raisons.push('une mesure institutionnelle nouvelle ou passée à « réalisée »');
  if (!estNomme(ancien) && estNomme(nouveau)) raisons.push('l’établissement est désormais nommé');
  const connues = new Set((ancien.articles || []).map((x) => canonique(x.url)));
  const urlsNouvelles = (nouveau.articles || []).filter((x) => !connues.has(canonique(x.url))).map((x) => x.url);
  return { materiel: raisons.length > 0, raison: raisons.join(' ; ') || 'aucun fait ni média nouveau', urlsNouvelles };
}

/**
 * Enrichit une proposition ouverte avec une proposition jumelle : AUCUNE source n'est perdue, les divergences sont consignées,
 * les nombres de victimes ne sont jamais additionnés, les médias qui reprennent une même dépêche ne deviennent pas indépendants.
 * L'établissement NOMMÉ l'emporte sur « non nommé » ; deux noms différents → le premier reste, l'autre devient une inconnue.
 */
export function fusionner(base, ajout) {
  const out = JSON.parse(JSON.stringify(base));
  const vu = new Set((out.articles || []).map((x) => canonique(x.url)));
  out.articles = [...(out.articles || []), ...(ajout.articles || []).filter((x) => !vu.has(canonique(x.url)))];
  const preuves = new Set((out.evidence || []).map((e) => `${canonique(e.url)}|${e.quote}`));
  out.evidence = [...(out.evidence || []), ...(ajout.evidence || []).filter((e) => !preuves.has(`${canonique(e.url)}|${e.quote}`))];
  out.medias = new Set(out.articles.map((x) => domaine(x.url))).size;
  out.independantes = Math.max(out.independantes || 0, ajout.independantes || 0);
  const inconnues = [...(out.unknowns || [])];
  const note = (t) => { if (t && !inconnues.includes(t)) inconnues.push(t); };
  for (const u of ajout.unknowns || []) note(u);
  if (!estNomme(out) && estNomme(ajout)) {
    Object.assign(out, { etablissement: ajout.etablissement, etablissement_nomme: true, structure: ajout.structure });
    out.fiche = { ...out.fiche, crit_etablissement_nomme: true, type_structure: ajout.fiche?.type_structure ?? out.fiche?.type_structure };
  } else if (estNomme(out) && estNomme(ajout) && jetonsEtab(out.etablissement).size && jaccard(jetonsEtab(out.etablissement), jetonsEtab(ajout.etablissement)) < 1) {
    note(`dénomination différente rapportée : « ${ajout.etablissement} »`);
  }
  if (ajout.stade_minimal && out.stade_minimal && ajout.stade_minimal !== out.stade_minimal) note(`stade judiciaire rapporté différemment selon les sources : « ${out.stade_minimal} » / « ${ajout.stade_minimal} »`);
  if (ajout.dernier_evenement && (!out.dernier_evenement || ajout.dernier_evenement > out.dernier_evenement)) out.dernier_evenement = ajout.dernier_evenement;
  // Une information ABSENTE d'un côté n'est pas une contradiction : elle est complétée par l'autre (jamais l'inverse).
  if (out.stade_minimal === 'à qualifier' && ajout.stade_minimal && ajout.stade_minimal !== 'à qualifier') { out.stade_minimal = ajout.stade_minimal; out.fiche = { ...out.fiche, statut_judiciaire: ajout.stade_minimal, crit_statut_clair: true }; }
  for (const k of ['role_mis_en_cause', 'type_structure', 'type_affaire']) {
    const neutre = k === 'type_affaire' ? 'à qualifier' : 'autre';
    if ((!out.fiche?.[k] || out.fiche[k] === neutre) && ajout.fiche?.[k] && ajout.fiche[k] !== neutre) out.fiche = { ...out.fiche, [k]: ajout.fiche[k] };
  }
  if (!out.personnes && ajout.personnes) out.personnes = ajout.personnes;
  if (!out.periode_faits && ajout.periode_faits) out.periode_faits = ajout.periode_faits;
  // Mesure institutionnelle : « réalisée » n'est JAMAIS rétrogradée en « annoncée » parce qu'un résumé est moins précis ; une divergence réelle
  // (mesures différentes) est signalée, pas tranchée par la plus récente.
  if (ajout.institutionnel) {
    if (!out.institutionnel) out.institutionnel = ajout.institutionnel;
    else if (out.institutionnel.mesure === ajout.institutionnel.mesure) {
      if (out.institutionnel.realisation === 'annoncée' && ajout.institutionnel.realisation === 'réalisée') out.institutionnel = ajout.institutionnel;
    } else note(`autre mesure institutionnelle rapportée : « ${ajout.institutionnel.libelle_public} »`);
  }
  out.unknowns = inconnues;
  out.fiche = { ...out.fiche, crit_recoupement: out.independantes >= 2 };
  if (out.articles.length > (base.articles || []).length) out.regroupes = (out.regroupes || 1) + 1; // un rejeu sans page nouvelle ne compte pas
  return out;
}

/**
 * Que faire d'un signal dont une proposition jumelle existe ?
 * Une proposition déjà ENVOYÉE sur Telegram n'est JAMAIS modifiée en place : son bouton agirait sur un contenu que l'éditeur n'a pas vu.
 * Fait nouveau matériel → `remplacer` (nouvelle version, l'ancienne est rendue inerte) ; sinon `ecarte` en silence.
 * @param {object} row  proposition jumelle ; `row.envoye` = a déjà un message Telegram
 * @param {Set<string>} casConnus
 * @param {object} [nouveau]  payload du signal (nécessaire pour juger la matérialité d'une proposition envoyée)
 * @returns {{action:'fusion'|'remplacer'|'ecarte'|'rattacher'|'attente', motif:string, case_id?:string}}
 */
export function decisionJumelle(row, casConnus, nouveau = null) {
  // Une décision MACHINE (proposition remplacée, doublon consolidé) n'est pas le refus de l'éditeur : elle ne rend le signal ni « rejeté » ni « déjà décidé ».
  if (row.decision && MACHINE_RE.test(row.decided_by || '')) return { action: 'attente', motif: 'même affaire qu’une proposition remplacée par une décision machine : aucune décision humaine ne s’y oppose' };
  if (row.envoye && !row.decision && !row.applied_at && nouveau) {
    const m = changementMateriel(row.payload, nouveau);
    return m.materiel
      ? { action: 'remplacer', motif: `même affaire qu’une proposition déjà envoyée : ${m.raison}`, urlsNouvelles: m.urlsNouvelles }
      : { action: 'ecarte', motif: 'même affaire qu’une proposition déjà envoyée : rien de nouveau à décider', urlsNouvelles: m.urlsNouvelles };
  }
  if (row.envoye && row.decision === 'REVIEW_REQUIRED' && !row.applied_at) return { action: 'ecarte', motif: 'même affaire qu’une proposition mise de côté par l’éditeur : sa décision n’est pas rejouée' };
  if ((!row.decision || row.decision === 'REVIEW_REQUIRED') && !row.applied_at) return { action: 'fusion', motif: 'même affaire qu’une proposition ouverte : sources ajoutées' };
  if (row.decision === 'REJECT') return { action: 'ecarte', motif: 'même affaire qu’une proposition rejetée' };
  if (row.created_case_id && casConnus.has(row.created_case_id)) return { action: 'rattacher', motif: 'même affaire qu’une fiche déjà créée', case_id: row.created_case_id };
  return { action: 'attente', motif: 'même affaire qu’une proposition validée dont la fiche n’existe pas encore' };
}

// Décideur MACHINE (lib/decision-machine.mjs) : une proposition ainsi décidée a été REMPLACÉE, elle n'est ni un refus ni une validation humaine.
export { MACHINE_RE, DECIDEUR_MACHINE };

/**
 * Proposition jumelle d'un nouveau signal parmi les propositions de découverte récentes.
 * Une proposition remplacée par une décision machine est ignorée. Si PLUSIEURS propositions sont « la même affaire », rien n'est fusionné
 * (pas de fusion par transitivité) : `{ ambigu: n }`.
 * @returns {Promise<null|{row:object, motif:string}|{ambigu:number}>}
 */
export async function chercherJumelle(sql, nouveau) {
  const rows = await sql`select proposal_id::text pid, dedup_key, recommendation, attach_case_id, payload, decision::text decision,
                                created_case_id, applied_at, decided_by,
                                exists (select 1 from telegram_envois t where t.cle = proposal_id::text) as envoye
                           from new_case_proposals
                          where payload ? 'evidence' and recommendation <> 'ATTACH_EXISTING' and created_at > now() - interval '45 days'
                          order by created_at`;
  const memes = [];
  for (const row of rows) {
    if (MACHINE_RE.test(row.decided_by || '')) continue;
    const m = memeAffaire(row.payload, nouveau);
    if (m.ok) memes.push({ row, motif: m.motif });
  }
  if (memes.length > 1) return { ambigu: memes.length };
  return memes[0] || null;
}

/** Entrée de la mémoire du passage (analyses déjà faites) qui décrit la même affaire que `nouveau`. Même règle de non-transitivité. */
export function chercherDansMemoire(memoire, nouveau, { dry = false } = {}) {
  const memes = (memoire || []).filter((e) => (e.statut === 'attente' || (dry && e.statut === 'propose')) && memeAffaire(e.cmp, nouveau).ok);
  if (memes.length > 1) return { ambigu: memes.length };
  return memes[0] ? { entree: memes[0], motif: memeAffaire(memes[0].cmp, nouveau).motif } : null;
}

const GRAVITE = { MATCH: 2, POSSIBLE_MATCH: 1, NO_MATCH: 0 };

/**
 * Avertissement d'une proposition dont l'établissement n'est pas nommé et qui a des affaires connues « voisines ».
 * « même commune » n'est dit QUE si la garde géographique le confirme ; une affaire d'une autre commune (même département) est présentée pour ce
 * qu'elle est : une simple proximité, sans lien démontré (cas du 08/11/2026 : Saint-Aubin-lès-Elbeuf annoncée « même commune » que Rouen).
 * @param {string[]} ids  affaires connues retenues par le résolveur
 * @param {(id:string)=>{niveau:string, raison:string|null}} geoDe  garde géographique (rapprochement-garde.niveauGeo) pour chacune
 */
export function avertissementVoisines(ids, geoDe) {
  const gs = ids.map((id) => ({ id, g: geoDe(id) }));
  const memes = gs.filter((x) => x.g.niveau === 'ok').map((x) => x.id);
  const autres = gs.filter((x) => x.g.niveau !== 'ok');
  return [
    memes.length ? `affaire voisine déjà connue (${memes.join(', ')}) : même commune et même rôle, établissement non nommé` : null,
    autres.length ? `affaire connue d’une AUTRE localisation (${autres.map((x) => x.id).join(', ')}) : aucun lien démontré, simple proximité — ${[...new Set(autres.map((x) => x.g.raison || 'localisation non comparable'))].join(' ; ')}` : null,
  ].filter(Boolean).join(' · ');
}

/** Clé de déduplication d'une NOUVELLE VERSION d'une proposition déjà envoyée (l'ancienne garde la sienne : elle est remplacée, pas effacée). */
export function cleVersion(cle) {
  const m = /^(.*)#v(\d+)$/.exec(String(cle));
  return m ? `${m[1]}#v${Number(m[2]) + 1}` : `${cle}#v2`;
}

/** Après fusion, la publiabilité affichée (bouton « VALIDER ET PUBLIER » ou « non publiable : … ») est recalculée sur les preuves RÉUNIES, jamais héritée. */
export async function republier(p, recommendation, geocoder = geocoderCommune) {
  if (!('publication_directe' in p) && !('non_publiable' in p)) return p;
  const { publication_directe, non_publiable, ...reste } = p;
  const f = reste.fiche || {};
  const dp = await dossierPublication({
    c: { commune: reste.commune, etablissement: reste.etablissement, type_structure: f.type_structure, role_mis_en_cause: f.role_mis_en_cause, statut_judiciaire: reste.stade_minimal,
      enfants_concernes_public: f.enfants_concernes_public, ambiguite: reste.unknowns?.[0] ?? null },
    fiche: f, nomme: estNomme(reste), evidence: reste.evidence || [], indep: reste.independantes || 0, recommendation, voisins: reste.possible_matches_sny || [], geocoder,
  });
  return { ...reste, ...(dp.directe ? { publication_directe: dp.directe } : { non_publiable: dp.non }) };
}

// --- consolidation des signaux d'un même passage -----------------------------------------------------------------------
// Les signaux sont qualifiés un par un (un appel modèle chacun), mais JAMAIS décidés isolément : chaque analyse est comparée aux analyses
// déjà faites dans le passage (`contexte.analyses`, signaux en attente de recoupement) AVANT toute décision. Même affaire → une seule
// analyse, avec les pages et les preuves des deux ; la décision (rapprochement historique, attente, proposition) porte sur l'ensemble.

/** Forme comparable (rapprochement-garde.comparerSignaux) d'une analyse. */
export function formeComparable({ c, evidence, lues }) {
  return {
    commune: c.commune, etablissement: c.etablissement, etablissement_nomme: estNommeEtab(c.etablissement), personnes: c.personnes, periode_faits: c.periode_faits,
    fiche: { departement: c.departement || '', role_mis_en_cause: c.role_mis_en_cause, type_structure: c.type_structure },
    articles: lues.map((p) => ({ url: p.url, media: p.media, published: p.published })), evidence,
  };
}

/** Réunit deux analyses de la MÊME affaire : sources et preuves des deux, information absente complétée, divergences consignées, jamais tranchées. */
export function fuserAnalyses(a, b) {
  const lues = [...a.lues, ...b.lues.filter((p) => !a.lues.some((q) => canonique(q.url) === canonique(p.url)))];
  const vu = new Set(a.evidence.map((e) => `${canonique(e.url)}|${e.quote}`));
  const evidence = [...a.evidence, ...b.evidence.filter((e) => !vu.has(`${canonique(e.url)}|${e.quote}`))];
  const [x, y] = [a.c, b.c];
  const neutre = { type_structure: 'autre', role_mis_en_cause: 'autre', type_affaire: 'à qualifier', statut_judiciaire: 'à qualifier', statut_des_faits: 'allégué', enfants_concernes_public: 'non précisé' };
  const c = { ...x };
  const notes = [];
  for (const [k, n] of Object.entries(neutre)) {
    if (c[k] === n && y[k] && y[k] !== n) c[k] = y[k];                                    // information absente d'un côté : complétée
    else if (c[k] !== n && y[k] && y[k] !== n && y[k] !== c[k] && k === 'statut_judiciaire') notes.push(`stade judiciaire rapporté différemment selon les articles : « ${c[k]} » / « ${y[k]} »`);
  }
  if (!estNommeEtab(c.etablissement) && estNommeEtab(y.etablissement)) c.etablissement = y.etablissement;
  else if (estNommeEtab(c.etablissement) && estNommeEtab(y.etablissement)) {
    // « école primaire X » / « école X » : même nom, écrit plus ou moins complètement — pas une divergence. Seuls des jetons distinctifs différents le sont.
    const [ja, jb] = [jetonsEtablissement(c.etablissement), jetonsEtablissement(y.etablissement)];
    if (ja.size !== jb.size || [...ja].some((j) => !jb.has(j))) notes.push(`dénomination différente rapportée : « ${y.etablissement} »`);
  }
  c.departement = c.departement || y.departement;
  c.personnes = c.personnes || y.personnes;
  c.periode_faits = c.periode_faits || y.periode_faits;
  if (y.dernier_evenement && (!c.dernier_evenement || y.dernier_evenement > c.dernier_evenement)) c.dernier_evenement = y.dernier_evenement;
  const dites = [];
  for (const t of [x.ambiguite, y.ambiguite, ...notes]) if (t && !dites.some((d) => d.includes(t))) dites.push(t);
  c.ambiguite = dites.join(' · ').slice(0, 260) || null;
  return { c, evidence, lues };
}

// --- analyse conservée d'un dossier en attente ---------------------------------------------------------------------------------
// Un dossier « en attente de recoupement » n'a, en base, qu'un titre et des URL : un article nouveau qui décrit la même affaire ne pouvait le rejoindre que
// si les deux étaient requalifiés dans le MÊME passage (huit histoires au plus : les anciens étaient évincés). L'analyse VÉRIFIÉE (champs, preuves
// littérales, adresses des pages) est donc conservée à côté du signal (discovery_etat, clé `analyse:<signal>`) ; les pages sont relues (gratuit) seulement
// quand un rapprochement est trouvé, et chaque citation conservée doit y figurer encore.
/** Forme conservable d'une analyse : jamais de texte d'article, seulement ce que le code a vérifié. */
export function serialiserEntree(e) {
  return {
    v: 1, cles: [...new Set(e.cles)], signal: { cle: e.signal.cle, titre: e.signal.titre, media: e.signal.media, published: e.signal.published },
    cmp: e.cmp, c: e.c, evidence: e.evidence, pages: e.lues.map((p) => ({ url: p.url, media: p.media, published: p.published })),
  };
}
/** Entrée de la mémoire du passage depuis une analyse conservée (pages non relues : `lues = null`, relues au besoin par `hydrater`). */
export const entreeDepuisStock = (s) => ({ stockee: true, pages: s.pages, cmp: s.cmp, c: s.c, evidence: s.evidence, lues: null, cles: s.cles, signal: s.signal, statut: 'attente' });
/** Relit les pages d'une analyse conservée ; ne garde que les preuves dont la page est relue ET contient encore la citation. null si rien n'est exploitable. */
export async function hydrater(entree, cache) {
  const lues = [];
  for (const p of entree.pages || []) {
    const r = await lirePage(p.url, cache);
    if (r.ok) lues.push({ url: p.url, media: p.media, published: p.published, corps: r.corps });
  }
  const evidence = entree.evidence.filter((e) => lues.some((p) => canonique(p.url) === canonique(e.url) && citationPresente(e.quote, p.corps)));
  if (!lues.length || !evidence.length) return null;
  return { ...entree, lues: lues.filter((p) => evidence.some((e) => canonique(e.url) === canonique(p.url))), evidence, stockee: false };
}

/**
 * Mesure institutionnelle des preuves réunies. « réalisée » n'est jamais rétrogradée en « annoncée » parce qu'un autre article est moins
 * précis, quel que soit l'ordre d'arrivée des articles (cas du 08/11/2026 : « mairie a suspendu » / « actuellement suspendu »).
 */
export function institutionnelDe(evidence) {
  const premier = detecterInstitutionnel(evidence.map((e) => e.quote));
  if (!premier) return null;
  let retenu = premier;
  if (premier.realisation === 'annoncée') {
    for (const e of evidence) { const d = detecterInstitutionnel([e.quote]); if (d && d.mesure === premier.mesure && d.realisation === 'réalisée') { retenu = d; break; } }
  }
  const src = evidence.find((e) => String(e.quote).replace(/\s+/g, ' ').trim() === retenu.citation) || evidence[0];
  return { ...retenu, url: src.url, media: src.media, published: src.published || null };
}

/**
 * Évalue UN signal : pages relues → extraction (modèle) → vérification (code) → consolidation avec les signaux déjà analysés dans le passage
 * → rapprochement (affaires connues, propositions ouvertes) → décision déterministe.
 * `contexte` = { analyses: [], dry } mémoire du passage (partagée entre les signaux) ; `pagesFn` / `comprendreFn` : injectables (tests, rejeu).
 * @returns {{statut:'propose'|'fusion'|'remplace'|'ecarte'|'attente'|null, motif:string, proposition?:object, cout?:object, regroupes?:string[]}}
 *   statut null = incident technique (modèle, réseau) : le signal n'est pas consigné, il sera repris au prochain run.
 *   regroupes = clés des signaux déjà évalués dans ce passage et réunis à celui-ci (le runner leur applique la même issue).
 */
export async function evaluer(o) {
  const etat = { entree: null, regroupes: [] };
  const r = await evaluerInterne(o, etat);
  if (o.contexte && etat.entree) { etat.entree.statut = r.statut; o.contexte.analyses.push(etat.entree); }
  if (etat.regroupes.length) r.regroupes = etat.regroupes;
  // Dossier qui reste en attente : son analyse vérifiée est rendue au runner, qui la conserve (un article nouveau pourra le rejoindre plus tard).
  if (r.statut === 'attente' && etat.entree) r.analyse = serialiserEntree(etat.entree);
  return r;
}

async function evaluerInterne({ sql, index, signal, modele, cle, cache = new Map(), contexte = null, pagesFn = chercherPages, comprendreFn = comprendre, geocoder = geocoderCommune }, etat) {
  const { pages, erreurs } = await pagesFn(signal, { cache });
  if (!pages.length) return { statut: erreurs.length ? null : 'attente', motif: erreurs.length ? 'recherche en erreur' : 'aucune page retrouvée' };

  let ext;
  try {
    ext = await comprendreFn({ fiche: {}, article: { media: signal.media, publication_date: signal.published, body: corpsPourModele(signal, pages) }, modele, contrat: CONTRAT, cle });
  } catch (e) { return { statut: null, motif: 'modèle indisponible : ' + String(e.message).slice(0, 60) }; }
  const v = verifier(ext.reponse, pages);
  if (!v.ok) return { statut: 'ecarte', motif: v.motif, cout: ext.cout };
  let { c, evidence } = v;
  let lues = pages.filter((p) => evidence.some((e) => canonique(e.url) === canonique(p.url)));

  // CONSOLIDATION : ce signal décrit-il la même affaire qu'un signal déjà analysé dans ce passage ? (jamais par transitivité : si plusieurs
  // analyses se ressemblent, rien n'est fusionné et l'ambiguïté est consignée.)
  let ambiguMemoire = null;
  etat.cles = [signal.cle].filter(Boolean);
  if (contexte) {
    const m = chercherDansMemoire(contexte.analyses, formeComparable({ c, evidence, lues }), { dry: !!contexte.dry });
    // Analyse conservée d'un ancien dossier en attente : ses pages sont relues (citations revérifiées) AVANT toute fusion ; illisible → pas de fusion, consigné.
    const entree = m?.entree?.stockee ? await hydrater(m.entree, cache) : m?.entree;
    if (m?.entree && !entree) ambiguMemoire = 'un ancien dossier en attente semble décrire la même affaire, mais ses pages ne sont plus relisibles : non fusionné';
    else if (entree) {
      contexte.analyses = contexte.analyses.filter((x) => x !== m.entree);
      etat.regroupes = [...new Set(entree.cles)].filter((k) => k !== signal.cle);
      ({ c, evidence, lues } = fuserAnalyses(entree, { c, evidence, lues }));
      etat.cles = [...new Set([...entree.cles, ...etat.cles])];
    } else if (m?.ambigu) ambiguMemoire = `identité possible avec ${m.ambigu} autres signaux du passage : non fusionnés, à arbitrer`;
  }
  if (ambiguMemoire) c = { ...c, ambiguite: [c.ambiguite, ambiguMemoire].filter(Boolean).join(' · ').slice(0, 260) };
  etat.entree = { cmp: formeComparable({ c, evidence, lues }), c, evidence, lues, cles: etat.cles, signal, statut: null };
  const domaines = new Set(evidence.map((e) => domaine(e.url)));
  // Sources indépendantes : familles de dépêches (textes), PLAFONNÉES par le nombre d'éditeurs. Deux articles d'un même éditeur, même de textes
  // différents, ne sont jamais deux confirmations indépendantes (un éditeur commun n'exclut pas une information originale complémentaire, mais
  // celle-ci enrichit le dossier : elle ne le recoupe pas).
  const indep = Math.min(independantes(lues), domaines.size);

  // Rapprochement : une résolution PAR page, jamais sur le texte concaténé (faux POSSIBLE_MATCH constaté).
  const parPage = lues.map((p) => resoudre({ candidate: { title: '' }, index, corps: p.corps }));
  const res = parPage.reduce((a, r) => (GRAVITE[r.resolution_status] > GRAVITE[a.resolution_status] ? r : a), parPage[0]);
  // GARDE GÉOGRAPHIQUE. Le résolveur rapproche sur des indices faibles (la commune « présente » dans les 900 premiers
  // caractères d'une page — un menu de navigation « édition de <ville> » suffit). Aucun rapprochement n'est affirmé contre la localisation du SIGNAL
  // (commune extraite ET retrouvée dans le corps des articles) : contradiction forte → l'affaire visée est écartée.
  const geoDe = (id) => { const f = index.find((x) => x.case_id === id); return niveauGeo({ commune: c.commune, departement: c.departement }, { commune: f?.commune, departement: f?.departement }); };
  const ecartes = [];
  const nomme = !!c.etablissement && !/non nomm|non pr[ée]cis/i.test(c.etablissement);
  // RAISONS POSITIVES EXIGÉES. Un voisin ne devient un candidat de rapprochement que s'il existe au moins un indice positif discriminant (ou une
  // commune des faits concordante sans établissement nommé contredit). Le département, la proximité, le mot « Rouen » d'un titre ou d'un commissariat
  // cherchent des candidats, ils ne prouvent pas l'identité. Un voisin non étayé reste une TRACE INTERNE (`rapprochement_ecarte`) : le signal poursuit
  // comme candidat autonome — l'absence de correspondance est une issue normale, pas un rejet du signal.
  const etayer = async (id, resolution) => {
    const f = index.find((x) => x.case_id === id);
    const geo = geoDe(id);
    const etab = comparerEtablissements({ nom: c.etablissement, nomme }, { nom: f?.etablissement });
    let e = rapprochementEtaye({ geo, etab, resolution, memeDepeche: false, datesCommunes: [] });
    if (!e.etaye && geo.niveau !== 'bloquant') {
      // Dernier recours : les sources historiques (relues) et les nouvelles partagent-elles une dépêche ou un fait daté ?
      const k = await infosCase(sql, id);
      const nouvelles = k ? lues.filter((p) => !new Set(k.sources.map((s) => canonique(s.url))).has(canonique(p.url))) : [];
      if (k && nouvelles.length) {
        const a = await construireAttach({ k, c, lues, nouvelles, res, geo, cache, partiel: resolution !== 'MATCH' });
        e = rapprochementEtaye({ geo, etab, resolution, memeDepeche: a.indices.memeDepeche, datesCommunes: a.indices.datesCommunes });
      }
    }
    if (!e.etaye) ecartes.push({ case_id: id, raison: e.raison });
    return e.etaye;
  };
  const voisinsResolver = [];
  for (const id of [...new Set(parPage.flatMap((r) => r.voisins || []))]) {
    const g = geoDe(id);
    if (g.niveau === 'bloquant') { ecartes.push({ case_id: id, raison: g.raison }); continue; }
    if (await etayer(id, 'VOISIN')) voisinsResolver.push(id);
  }
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
    else if (statutRes !== 'MATCH' && !(await etayer(cible, statutRes))) { cible = null; statutRes = 'NO_MATCH'; }
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
    independantes: indep, medias: domaines.size, personnes: c.personnes ?? null, periode_faits: c.periode_faits ?? null,
    ...(etat.regroupes.length ? { regroupes: etat.cles.length } : {}),
    ...(c.diag_enum ? { diag_extraction: c.diag_enum } : {}),   // forme originale des champs catégoriels (liste récupérée / repli et sa raison)
    ...(c.resume_neutralise?.length ? { resume_neutralise: c.resume_neutralise } : {}),   // actes de procédure contestés : absents du résumé (voir faitsContestes)
  };
  // Réaction ou mesure d'une institution rapportée par la presse : conservée comme fait STRUCTURÉ, distinct de l'état judiciaire
  // (jamais de transition). Libellé public tiré d'une table fermée ; la citation reste en mémoire privée.
  const inst = institutionnelDe(evidence);
  if (inst) base.institutionnel = inst;
  const etab = nomme ? c.etablissement : `${c.type_structure} non nommée`;
  const cleStd = `${aplatir(c.commune)}|${aplatir(etab)}|${aplatir(c.role_mis_en_cause)}`;
  const fiche = {
    departement: c.departement || '', type_structure: c.type_structure, role_mis_en_cause: c.role_mis_en_cause, type_affaire: c.type_affaire,
    statut_judiciaire: c.statut_judiciaire, statut_des_faits: c.statut_des_faits, enfants_concernes_public: c.enfants_concernes_public,
    crit_source_fiable: true, crit_article_recent: true, crit_etablissement_nomme: nomme,
    crit_statut_clair: c.statut_judiciaire !== 'à qualifier', crit_recoupement: indep >= 2,
  };

  // UNE AFFAIRE, UNE DÉCISION. Avant de proposer, ce signal décrit-il une affaire déjà proposée ? (pages citées en commun)
  //   ouverte (aucune décision, non appliquée) → ENRICHIE avec ces sources, aucune nouvelle proposition ;
  //   validée et déjà devenue fiche           → rapprochement vers CETTE fiche (ATTACH/REVIEW), jamais une seconde création ;
  //   validée, fiche pas encore créée         → en attente (repris au run suivant, quand la fiche existe) ;
  //   rejetée                                 → écartée (une décision humaine n'est pas rejouée).
  //   déjà ENVOYÉE sur Telegram              → jamais modifiée en place (son bouton agirait sur un contenu non vu) : fait nouveau matériel →
  //                                            NOUVELLE version qui remplace l'ancienne (rendue inerte) ; sinon silence.
  if (statutRes !== 'MATCH') {
    const nouveauP = { ...base, fiche, etablissement_nomme: nomme };
    const j = await chercherJumelle(sql, nouveauP);
    if (j?.ambigu) { base.unknowns = [...base.unknowns, `identité possible avec ${j.ambigu} propositions ouvertes : non fusionné, à arbitrer`]; }
    else if (j) {
      const d = decisionJumelle(j.row, new Set(index.map((f) => f.case_id)), nouveauP);
      if (d.action === 'fusion') return { statut: 'fusion', motif: d.motif, cout: ext.cout, fusion: { proposal_id: j.row.pid, payload: await republier(fusionner(j.row.payload, nouveauP), j.row.recommendation, geocoder) } };
      if (d.action === 'remplacer') {
        const p = await republier(fusionner(j.row.payload, nouveauP), j.row.recommendation, geocoder);
        return { statut: 'remplace', motif: d.motif, cout: ext.cout, remplace: { proposal_id: j.row.pid, dedup_key: cleVersion(j.row.dedup_key), recommendation: j.row.recommendation, attach_case_id: j.row.attach_case_id,
          payload: { ...p, remplace: { pid8: j.row.pid.slice(0, 8), motif: d.motif } } } };
      }
      if (d.action === 'ecarte') return { statut: 'ecarte', motif: d.motif, cout: ext.cout, urlsNouvelles: d.urlsNouvelles, proposition_jumelle: j.row.pid };
      if (d.action === 'attente') return { statut: 'attente', motif: d.motif, cout: ext.cout };
      cible = d.case_id; statutRes = 'POSSIBLE_MATCH';
    }
  }

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
    recommendation = 'REVIEW'; avertissement = avertissementVoisines(voisinsResolver, geoDe);
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
  // UNE SEULE DÉCISION : si le dossier est complet ET publiable, le bouton unique est « VALIDER ET PUBLIER » ; sinon la validation reste
  // documentaire (candidate, sans publication) et le message dit pourquoi la publication n'est pas proposée.
  const dp = await dossierPublication({ c, fiche, nomme, evidence, indep, recommendation, voisins, geocoder });
  return {
    statut: 'propose', motif: recommendation, cout: ext.cout,
    proposition: {
      dedup_key: cleStd, recommendation, attach_case_id: null,
      payload: { ...base, fiche, etablissement_nomme: nomme, possible_matches_sny: possibles.slice(0, 4), avertissement, rapprochement_ecarte: ecartes[0] || null,
        ...(dp.directe ? { publication_directe: dp.directe } : { non_publiable: dp.non }) },
    },
  };
}

/**
 * « VALIDER ET PUBLIER » n'est proposé que si les garde-fous de publication existants (evaluerPublication : fiabilité, sources, statut,
 * doublon, HOLD…) ET la doctrine judiciaire (stade établi par les citations) seraient satisfaits, et si une localisation acceptable existe.
 * Jamais un bouton qui serait refusé par publier-affaire.mjs. @returns {Promise<{directe?:{localisation:object, reserves:string[]}, non?:string[]}>}
 */
export async function dossierPublication({ c, fiche, nomme, evidence, indep, recommendation, voisins = [], geocoder = geocoderCommune }) {
  if (recommendation !== 'NEW_CASE_CANDIDATE') return { non: ['proposition à arbitrer (rapprochement ou ambiguïté)'] };
  const crits = [fiche.crit_source_fiable, fiche.crit_article_recent, fiche.crit_etablissement_nomme, fiche.crit_statut_clair, fiche.crit_recoupement].filter(Boolean).length;
  const g = evaluerPublication({
    case_id: 'APERCU', publication_status: 'candidate', fiabilite_info_10: 2 * crits, statut_judiciaire: c.statut_judiciaire, crit_statut_clair: fiche.crit_statut_clair,
    etablissement: nomme ? c.etablissement : `${c.type_structure} non nommée`, enfants_concernes_public: c.enfants_concernes_public, commune: c.commune,
  }, { revues: [{ reviewed_by: 'Adrien (aperçu)', decision: 'validé', comment: '[Discovery-auto:00000000] VALIDATE — aperçu' }],
    sources: evidence.map((e) => ({ url: e.url, media: e.media })), holds: new Set(), autres: [] });
  const non = [...g.raisons];
  // Doublon / identité : une affaire voisine de même rôle, ou un établissement non nommé avec des voisines, n'est pas résolue.
  const memeRole = voisins.filter((v) => v.role === c.role_mis_en_cause || v.role === 'autre' || c.role_mis_en_cause === 'autre');
  if (memeRole.length) non.push(`doublon possible avec ${memeRole.map((v) => v.case_id).join(', ')}`);
  else if (!nomme && voisins.length) non.push('identité non résolue (établissement non nommé, affaires voisines dans la commune)');
  let loc = null;
  try { loc = localisationDe({ lat: null, lng: null }, await geocoder(c.commune, fiche.departement)); } catch { loc = null; }
  if (!loc) non.push('aucune localisation fiable (commune ambiguë, composée ou inconnue)');
  if (non.length) return { non };
  return { directe: { localisation: loc, reserves: [
    'localisation approximative : centre de commune (API Adresse)',
    ...(nomme ? [] : ['établissement non nommé']),
    ...(indep >= 2 ? [] : ['une seule source indépendante']),
    ...(c.ambiguite ? [c.ambiguite] : []),
  ] } };
}
