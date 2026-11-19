// =====================================================================
// scripts/lib/relais-social.mjs — RELAIS SOCIAL, MODE REVIEW : le seul chemin qui mène du « nouveau fait approuvé » à un post X / Facebook.
//
//   Nouveauté validée → contrôles (T0, fraîcheur, page servie) → composition V4.1 → PROPOSITION Telegram → GO social (un clic) → recontrôle → Buffer → journal
//
// Aucune base, aucun réseau, aucun secret ici : tout est INJECTÉ (port de données, client Buffer, notifieur) — le même code est exécuté par scripts/diffuser-social.mjs
// (production) et par les tests (mocks). AUCUN appel de modèle. Le composeur est le V4.1 (scripts/lib/social-editorial.mjs), jamais l'ancien gabarit générique.
//
// GARANTIES (démontrées par scripts/qa/test-relais-social.mjs)
//   · rien ne part sans GO social : le seul appel qui écrit chez Buffer (diffuserCanal) n'est atteint QUE depuis publierDecisions, pour une proposition dont la décision
//     humaine est GO_* et dont l'identité (affaire + événement + version approuvée + sources + texte + URLs, par canal) est INCHANGÉE au moment de l'envoi ;
//   · zéro historique : tout horodatage nécessaire (découverte, création, approbation de fiche, proposition, décision, événement) doit être ≥ T0 ; absent ⇒ échec fermé ;
//   · T0 vient de la base (table immuable), jamais d'une variable ; absent / incohérent / non confirmé par son témoin ⇒ aucune proposition ;
//   · source < 7 jours, accès constaté (libre ou validé), fait non plus ancien que 7 jours avant l'article ; sinon blocage ;
//   · silence, expiration, bouton obsolète, clic rejoué ⇒ zéro publication ; une décision n'est enregistrée qu'une fois.
// =====================================================================
import { createHash } from 'node:crypto';
import { matiereApprouvee, composerPilote, verifierPost, poidsX } from './social-editorial.mjs';
import { cleEvenement, evolutionSignificative, ageJours, FENETRE_SOURCE_JOURS, STATUTS_DIFFUSABLES, lienDiffusion } from './diffusion-sociale.mjs';
import { diffuserCanal } from './diffusion-flux.mjs';
import { visuelPartage, recontroleVisuel, imagesDeProps, examinerInstagram, dansPerimetreInstagram, creerPropositionInstagram, verifierActivationInstagram, cleProposition as cleInstagramDe } from './relais-instagram.mjs';

// X et Facebook : propositions jumelées. Instagram a SA proposition indépendante (scripts/lib/relais-instagram.mjs) : il n'entre jamais dans cette liste, donc jamais dans
// les GO, empreintes, textes ni boutons X / Facebook.
export const CANAUX_RELAIS = Object.freeze(['x', 'facebook']);
export const MODE_REVIEW = 'review';
export const T0_PLANCHER = '2026-11-13T00:00:00Z';              // aucune mise en service ne peut être antérieure à la mission
export const VALIDITE_PROPOSITION_H = 48;
const HEURE = 36e5;

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
/**
 * GO PARTIEL → COMPLÉMENT. Un GO « X seul » (ou « Facebook seul ») laisse l'autre canal ouvert : si sa rédaction est ensuite retravaillée, une proposition COMPLÉMENTAIRE à ce seul
 * canal est faite. Sa clé est `<clé de l'événement>#<canal>:<empreinte du texte>` : l'événement, lui, reste UN (exclusions, éligibilité, recontrôle partent de la clé de base).
 */
export const cleBase = (k) => String(k ?? '').split('#')[0];
export const cleComplement = (base, canal, texte) => `${base}#${canal}:${sha256(String(texte ?? '').replace(/\s+/g, ' ').trim()).slice(0, 8)}`;
/** Dépôt PUBLIC ⇒ journaux publics : un motif de blocage peut citer un extrait de texte ou une adresse (« valeur », URL) ; on n'en garde que la nature, abrégée. */
export const motifsPublics = (m) => String(m ?? '').replace(/«[^»]*»/g, '«…»').replace(/https?:\/\/\S+/g, '<url>').slice(0, 220);
/** Empreinte d'un texte publié, insensible aux espaces (Buffer normalise parfois les sauts de ligne) : sert aux exclusions. */
export const empreinteTexte = (t) => sha256(String(t ?? '').replace(/\s+/g, ' ').trim());
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
export const jsonCanonique = (v) => JSON.stringify(canon(v));
const dateOuNull = (d) => { if (d == null || d === '') return null; const x = d instanceof Date ? d : new Date(d); return Number.isNaN(x.getTime()) ? null : x; };

// ---------------------------------------------------------------------
// MIGRATION : découpage des instructions (guillemets, $$ et commentaires respectés) + refus de toute instruction destructrice.
// ---------------------------------------------------------------------
export function decouperInstructions(texte) {
  const s = String(texte);
  const out = []; let cur = '', quote = false, dollar = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!quote && !dollar && c === '-' && s[i + 1] === '-') { while (i < s.length && s[i] !== '\n') i++; cur += '\n'; continue; }
    if (!quote && s.startsWith('$$', i)) { dollar = !dollar; cur += '$$'; i++; continue; }
    if (!dollar && c === '\'') quote = !quote;
    if (c === ';' && !quote && !dollar) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** Une migration additive ne contient ni DROP, ni TRUNCATE, ni DELETE FROM, ni UPDATE, ni ALTER … DROP en tête d'instruction. */
export const instructionDestructrice = (ins) => /^\s*(drop\b|truncate\b|delete\s+from\b|update\b|alter\s+table\s+\S+\s+drop\b)/i.test(ins) && !CONTRAINTE_ELARGIE.test(ins);
// SEULE exception, nominative : lever la contrainte CHECK qu'une migration additive ÉLARGIT aussitôt (027 : décision « GO_I », ligne de configuration n° 2). Une contrainte CHECK ne porte
// aucune donnée ; nulle autre instruction « alter table … drop » n'est tolérée.
const CONTRAINTE_ELARGIE = /^\s*alter\s+table\s+relais_social_(?:propositions|config)\s+drop\s+constraint\s+if\s+exists\s+relais_social_(?:propositions_decision|config_id)_check\s*$/i;

// ---------------------------------------------------------------------
// ACTIVATION : coupe-circuit, T0 verrouillé en base, témoin de configuration. Tout doute ⇒ inactif (échec fermé).
// ---------------------------------------------------------------------
/**
 * @param {{env:object, t0Row:{t0:Date|string, mode:string}|null, now:Date}} a
 * @returns {{actif:boolean, t0:Date|null, raisons:string[]}}
 */
export function verifierActivation({ env, t0Row, now, plancher = T0_PLANCHER }) {
  const r = [];
  if (String(env.SNY_DIFFUSION_ACTIVE ?? '').trim() !== '1') r.push('coupe-circuit : SNY_DIFFUSION_ACTIVE ≠ 1 — rien n’est proposé ni publié');
  if (String(env.SNY_DIFFUSION_MODE ?? '').trim() !== MODE_REVIEW) r.push('mode REVIEW non sélectionné (SNY_DIFFUSION_MODE ≠ review) — aucun autre mode n’existe dans ce code');
  let t0 = null;
  if (!t0Row) r.push('T0 absent : non initialisé (relais-social --initialiser-t0)');
  else {
    t0 = dateOuNull(t0Row.t0);
    if (t0Row.mode !== MODE_REVIEW) r.push('T0 enregistré pour un autre mode');
    if (!t0) r.push('T0 illisible');
    else {
      if (t0.getTime() > now.getTime() + 5 * 6e4) r.push('T0 dans le futur : incohérent');
      if (t0.getTime() < Date.parse(plancher)) r.push(`T0 antérieur au plancher ${plancher} : incohérent`);
      const temoin = dateOuNull(String(env.SNY_DIFFUSION_DEPUIS ?? '').trim());
      if (!temoin || Math.floor(temoin.getTime() / 1000) !== Math.floor(t0.getTime() / 1000)) r.push('témoin SNY_DIFFUSION_DEPUIS absent ou différent du T0 en base : configuration non vérifiable');
    }
  }
  return { actif: r.length === 0, t0: r.length === 0 ? t0 : (dateOuNull(t0Row?.t0) ?? null), raisons: r };
}

// ---------------------------------------------------------------------
// ÉLIGIBILITÉ avant composition (horodatages ≥ T0, état, page servie, exclusions, doublons). PURE.
// ---------------------------------------------------------------------
const apresT0 = (nom, d, t0, r) => { const x = dateOuNull(d); if (!x) r.push(`${nom} : horodatage absent — échec fermé`); else if (x < t0) r.push(`${nom} antérieur(e) à T0 : historique, jamais diffusé`); };

/**
 * @param {object} c candidat (voir lireCandidats) · @param {object} ctx { t0, now, holds:Set, entree, ficheHash, servi, ficheServie:{status,hash}|null, proposition:boolean, ledger:boolean, exclusions:Set<canal> }
 * @returns {{ok:boolean, raisons:string[]}} (les raisons ne contiennent ni nom ni lieu : logs publics)
 */
export function evaluerCandidat(c, ctx) {
  const r = [];
  if (!['new_case', 'case_update'].includes(c.type)) return { ok: false, raisons: ['type d’événement hors périmètre (déclaration, correction, source ajoutée…)'] };
  if (!ctx.t0) return { ok: false, raisons: ['T0 non vérifié : aucune proposition'] };
  if (c.type === 'new_case') {
    apresT0('découverte', c.decouverte_at, ctx.t0, r);
    apresT0('création de l’affaire', c.cree_at, ctx.t0, r);
    apresT0('approbation de la fiche', c.fiche_approuvee_at, ctx.t0, r);
  } else {
    // La NOUVEAUTÉ est l'événement approuvé et enregistré après T0 ; l'analyse qui l'a proposé peut lui être antérieure (une proposition restée sans décision avant T0 n'a rien relayé).
    // Ce qui interdit le rattrapage : la DÉCISION (une seule par proposition) et l'enregistrement de l'événement sont postérieurs à T0, et la source a moins de 7 jours.
    apresT0('approbation de l’événement', c.decide_at, ctx.t0, r);
    apresT0('enregistrement de l’événement', c.evenement_enregistre_at, ctx.t0, r);
    if (c.sous_type) {
      // Évolution tirée d'une MISE À JOUR DE FICHE approuvée (procès/appel annoncés, parole de parent) : même rigueur qu'un événement — l'approbation (revue d'empreinte) et la décision sont postérieures à T0,
      // et la version approuvée est celle que le site sert. Aucun changement de statut n'est exigé, mais la matière doit être dans la version approuvée.
      apresT0('approbation de la version de fiche', c.fiche_approuvee_at, ctx.t0, r);
      if (!c.fiche_hash) r.push('version de fiche approuvée non identifiée');
      else if (ctx.ficheHash && c.fiche_hash !== ctx.ficheHash) r.push('la version approuvée contenant cette matière n’est plus la version courante de la fiche');
    } else if (!evolutionSignificative(c.statut_avant, c.statut_apres)) r.push('évolution non significative (statut inchangé, en recul ou ambigu)');
    if (!c.event_id) r.push('événement non identifié');
  }
  if (c.ps !== 'publiée') r.push('affaire non publiée ou retirée');
  if (c.retire) r.push('revue « retirer » enregistrée');
  if (ctx.holds?.has(c.case_id)) r.push('sous HOLD de publication');
  const e = ctx.entree;
  if (!e) r.push('absente de l’artefact public');
  else {
    if (!STATUTS_DIFFUSABLES.has(e.statut_judiciaire)) r.push('statut judiciaire ambigu ou non diffusable (relaxe, classement, non précisé : décision éditoriale spécifique requise)');
    if (c.type === 'case_update' && !c.sous_type && e.statut_judiciaire !== c.statut_apres) r.push('le statut public n’est pas celui de l’évolution approuvée');
  }
  if (!ctx.ficheHash) r.push('aucune fiche individuelle approuvée pour cette affaire');
  if (ctx.servi !== true) r.push('page d’accueil non servie à l’identique de la projection');
  if (!ctx.ficheServie || ctx.ficheServie.status !== 200) r.push('fiche individuelle non servie en HTTP 200');
  else if (!ctx.ficheHash || ctx.ficheServie.hash !== ctx.ficheHash) r.push('version servie de la fiche ≠ version approuvée');
  if (ctx.proposition) r.push('événement déjà proposé (doublon social)');
  if (ctx.ledger) r.push('événement déjà diffusé (journal de diffusion)');
  return { ok: r.length === 0, raisons: r };
}

// ---------------------------------------------------------------------
// FRAÎCHEUR du fait et de la source (après composition : la source citée par CHAQUE canal). PURE.
// ---------------------------------------------------------------------
const ACCES_VALIDE = ['libre', 'événement validé', 'information validée'];
/** @returns {string[]} raisons de blocage (vide = frais) */
export function controlerFraicheur({ source, dateFait, now }) {
  const r = [];
  if (!source?.url) return ['source de l’affirmation introuvable'];
  const age = ageJours(source.publie_le, now);
  if (age === null) r.push('date de l’article absente ou ambiguë : silence');
  else if (age < -1) r.push('date de l’article dans le futur : silence');
  else if (age >= FENETRE_SOURCE_JOURS) r.push(`article publié il y a ${Math.floor(age)} jours (≥ ${FENETRE_SOURCE_JOURS}) : information non récente`);
  if (!ACCES_VALIDE.includes(source.acces)) r.push('article non lu en entier par SNY (accès partiel ou non constaté) : source insuffisante');
  if (dateFait) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(dateFait));
    const ecart = m && source.publie_le ? (Date.parse(`${String(source.publie_le).slice(0, 10)}T00:00:00Z`) - Date.parse(`${m[1]}T00:00:00Z`)) / 864e5 : null;
    if (ecart === null) r.push('date du fait illisible : silence');
    else if (ecart > FENETRE_SOURCE_JOURS) r.push(`fait daté ${Math.floor(ecart)} jours avant l’article : republication d’un fait ancien`);
    else if (ecart < -1) r.push('fait postérieur à l’article : incohérence de dates');
  }
  return r;
}

// ---------------------------------------------------------------------
// COMPOSITION V4.1 + contrôleur indépendant + garde-fous du relais (accès, fraîcheur). Les textes d'ici sont CEUX de Telegram et de Buffer.
// ---------------------------------------------------------------------
/** compo = { cases:Map, ev:object (evenements.json), redirections:object, wording:object, dossierFiche:(id)=>…, site:string, now:Date } */
export function composerEvenement(c, compo) {
  const entree = compo.cases.get(c.case_id) ?? null;
  // Évolutions tirées d'une MISE À JOUR DE FICHE approuvée : une étape judiciaire (famille « evolution », événement SYNTHÉTIQUE bâti sur l'étape approuvée, jamais sur autre chose)
  // ou une parole de parent de la fiche approuvée (famille « declaration_victime » du composeur V4.1, REVUE_HUMAINE obligatoire).
  const sous = c.sous_type ?? null;
  const famille = sous === 'fiche_temoignage' ? 'declaration_victime' : c.type === 'new_case' ? 'nouvelle_affaire' : 'evolution';
  const scenario = { famille, case_id: c.case_id, ...(sous === 'fiche_temoignage' ? { reaction: c.reaction, citation: 0 } : c.type === 'case_update' ? { event_id: c.event_id } : {}) };
  const M = matiereApprouvee({ entree, dossier: compo.dossierFiche(c.case_id), empreinteApprouvee: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
    evenements: compo.ev.affaires?.[c.case_id] ?? [], matiere: (compo.ev.matiere || []).filter((m) => m.case_id === c.case_id), wording: compo.wording });
  M.evocations = compo.evocations ?? []; // phrases « ce qu'il évoque » approuvées par l'éditeur (format X des prises de parole)
  if (sous === 'fiche_evolution' && c.etape) {
    const type = c.etape.type === 'audience' && /appel/i.test(c.etape.texte || '') ? 'audience_appel' : c.etape.type;
    M.evenements = [...(M.evenements || []), { event_id: c.event_id, type, statut: entree?.statut_judiciaire ?? null, date: c.etape.date ?? null, libelle: c.etape.texte, source: { media: c.etape.media, url: c.etape.url, publie_le: c.etape.publie_le } }];
  }
  const r = composerPilote({ scenario, M, publiques: compo.cases, site: compo.site, redirections: compo.redirections });
  const evt = c.type === 'case_update' ? (M.evenements || []).find((x) => x.event_id === c.event_id) ?? null : null;
  // Une audience ANNONCÉE dont la date est atteinte : « est programmé » est périmé et le déroulement n'est pas rapporté — ni « à venir » ni « tenu » ne peut être dit : aucune rédaction automatique.
  const aujourdhui = compo.now.toISOString().slice(0, 10);
  // Seule une phrase d'ANNONCE (« programmé », « prévu », « sera rejugé »…) dont la date est atteinte est périmée : une étape qui RAPPORTE un fait (« 8 ans requis le 18 novembre, délibéré au… ») ne l'est pas.
  const perime = sous === 'fiche_evolution' && evt?.date && String(evt.date) <= aujourdhui && ['audience_appel', 'audience', 'renvoi'].includes(evt.type) && /programm|prévu|prevu|annonc|sera |seront |rejug\w+ le|à venir/i.test(String(c.etape?.texte ?? ''));
  const dateFait = c.type === 'case_update' ? evt?.date : entree?.etat?.date ?? null;
  const canaux = {};
  for (const canal of CANAUX_RELAIS) {
    const p = r[canal];
    const motifs = [];
    if (perime) motifs.push('date annoncée atteinte : la formulation « programmé / prévu » est périmée et aucune source lue ne rapporte le déroulement ni l’issue — ni « à venir » ni « tenu » ne peut être dit (brouillon manuel, source à jour requise)');
    if (r.etat === 'BLOQUE') motifs.push(...r.motifs);
    else if (p.etat !== 'OK') motifs.push(...(p.motifs || ['composition impossible']));
    else {
      const verif = verifierPost(p, canal, M, compo.site, compo.redirections);
      if (!verif.ok) motifs.push(...verif.controles.filter((k) => !k.ok).map((k) => `contrôle V4.1 « ${k.nom} » : ${k.detail || 'échec'}`));
      const attention = [...r.attention, ...(p.attention || [])];
      const bloquantes = attention.filter((a) => /source liée/.test(a));
      motifs.push(...bloquantes);
      const source = canal === 'x' ? p.source : r.sourcePrincipale;
      motifs.push(...controlerFraicheur({ source: source ? M.sources.get(source.url) ?? source : null, dateFait, now: compo.now }));
      if (!motifs.length) {
        const liens = (p.texte.match(/https?:\/\/\S+/g) || []);
        canaux[canal] = { ok: true, texte: p.texte, longueur: canal === 'x' ? poidsX(p.texte) : [...p.texte].length, urls: liens, source: { media: source.media, url: source.url, publie_le: source.publie_le ?? null },
          reserves: [...attention.filter((a) => !/source liée/.test(a)), ...(dateFait ? [] : ['date du fait non établie : seule la date de l’article fait foi — ancienneté à apprécier'])], repli: !!p.repli };
        continue;
      }
    }
    // MEILLEURE TENTATIVE X : montrée avec son compte, jamais envoyée tant que X est bloqué (dépassement, source insuffisante…). Pas de tentative quand la formulation serait fausse (date annoncée atteinte).
    const tentative = canal === 'x' && !perime && r.etat !== 'BLOQUE' ? (p.etat === 'OK' ? { texte: p.texte, longueur: poidsX(p.texte), compact: !!p.compact } : p.tentative ?? null) : null;
    canaux[canal] = { ok: false, motifs: [...new Set(motifs)], ...(tentative ? { tentative } : {}) };
  }
  const lienSny = (canal) => lienDiffusion({ site: compo.site, case_id: c.case_id, type: c.type, statut: evt?.statut ?? c.statut_apres ?? null, canal, fiche: !!M.empreinte });
  return { famille, M, canaux, evt, entree, fiche_hash: M.empreinte, lien: { x: lienSny('x'), facebook: lienSny('facebook') }, pilote: r, dateFait };
}

// ---------------------------------------------------------------------
// IDENTITÉ IMMUABLE : affaire + événement + version approuvée + sources + texte + URLs + canal → empreinte. PURE.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// PARE-FEU ÉDITORIAL (19/11/2026, décision d'Adrien) : par affaire, par canal et par jour (Europe/Paris), AU PLUS un post de CHANGEMENT JUDICIAIRE (nouvelle affaire, évolution de statut,
// étape de procédure) et AU PLUS un post de PRISE DE PAROLE (famille ou pouvoir public) — soit 2 posts maximum, sur deux thèmes différents. La règle pourra évoluer : ces deux nombres
// sont les seuls réglages. Elle est appliquée à la proposition ET, de nouveau, à l'exécution du GO (deux GO le même jour : le second est refusé, jamais envoyé).
// Compte : les lignes du journal de diffusion (soumis, programmé, envoyé…) ; une ligne annulée ou en échec n'a pas de post et ne compte pas.
// ---------------------------------------------------------------------
export const PARE_FEU_PAR_JOUR = Object.freeze({ judiciaire: 1, parole: 1 });
const LIBELLE_THEME = Object.freeze({ judiciaire: 'changement judiciaire', parole: 'prise de parole (famille ou pouvoir public)' });
/** Thème d'une clé d'événement : « parole-… » (parole d'un parent de la fiche) = prise de parole ; tout le reste = changement judiciaire. */
export const themeDe = (cle) => (/^case_update\|[^|]+\|parole-/.test(cleBase(cle)) ? 'parole' : 'judiciaire');
export const jourParis = (d) => new Date(d).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
/** @returns {string[]} raisons de refus (vide = permis). diffusions = lignes du journal de CETTE affaire (event_key, canal, etat, created_at). */
export function controlerPareFeu({ event_key, canal, diffusions, now }) {
  const theme = themeDe(event_key), base = cleBase(event_key), jour = jourParis(now);
  const deja = (diffusions || []).filter((l) => l.canal === canal && cleBase(l.event_key) !== base && themeDe(l.event_key) === theme && !['annule', 'echec'].includes(l.etat) && jourParis(l.created_at) === jour);
  return deja.length >= PARE_FEU_PAR_JOUR[theme] ? [`pare-feu : ${deja.length} post(s) de ce thème (${LIBELLE_THEME[theme]}) déjà programmé(s) ou publié(s) aujourd’hui pour cette affaire sur ${canal} — maximum ${PARE_FEU_PAR_JOUR[theme]} par jour et par thème`] : [];
}
/** Applique le pare-feu aux canaux proposables d'un événement : un canal refusé devient non proposable (le texte X reste visible comme tentative). @returns {Promise<string[]>} canaux restants */
async function appliquerPareFeu({ c, comp, canaux, port, now }) {
  const diffusions = await port.diffusionsDeAffaire(c.case_id, new Date(now.getTime() - 36 * HEURE));
  for (const k of canaux) { const r = controlerPareFeu({ event_key: c.event_key, canal: k, diffusions, now }); if (r.length) comp.canaux[k] = sansVisuel(comp.canaux[k], k, r); }
  return canaux.filter((k) => comp.canaux[k]?.ok);
}

/** Un canal fermé (visuel indisponible, pare-feu) n'est PAS envoyable ; le texte X reste visible comme tentative. */
function sansVisuel(canal, k, motifs) {
  return { ok: false, motifs, ...(k === 'x' && canal?.texte ? { tentative: { texte: canal.texte, longueur: canal.longueur } } : {}) };
}
export function identiteDe(c, comp, visuel = null) {
  const base = { case_id: c.case_id, event_key: c.event_key, type: c.type, event_id: c.event_id ?? null, statut_apres: c.statut_apres ?? null, fiche_hash: comp.fiche_hash };
  // VISUEL PARTAGÉ (le même fichier sur X, Facebook et Instagram) : adresse, empreinte du CONTENU, spécification et gabarit sont couverts par le GO.
  const im = visuel?.image ? { url: visuel.image.url, sha256: visuel.image.sha256, largeur: visuel.image.largeur, hauteur: visuel.image.hauteur, octets: visuel.image.octets, spec_hash: visuel.spec_hash, gabarit: visuel.gabarit, alt: visuel.alt ?? null } : null;
  const parCanal = {};
  for (const canal of CANAUX_RELAIS) {
    const k = comp.canaux[canal];
    if (!k?.ok) continue;
    parCanal[canal] = { texte: k.texte, urls: k.urls, source: k.source, empreinte: sha256(jsonCanonique({ ...base, canal, texte: k.texte, urls: k.urls, source: k.source, ...(im ? { image_sha256: im.sha256, image_url: im.url, spec_hash: im.spec_hash, gabarit: im.gabarit } : {}) })) };
  }
  return { ...base, canaux: parCanal, liens: comp.lien, ...(im ? { image: im } : {}) };
}

// ---------------------------------------------------------------------
// MESSAGE TELEGRAM DE PROPOSITION. PURE. Contient les deux textes INTÉGRAUX, tels qu'ils partiront.
// ---------------------------------------------------------------------
export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const jourFr = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'date inconnue');
export const TAILLE_MESSAGE = 4090; // l'API Telegram refuse plus de 4096 caractères (comptés après analyse du HTML : la longueur brute, balises comprises, est une borne sûre)
/** Regroupe les blocs dans le moins de messages possible (un bloc n'est jamais coupé) ; le DERNIER message porte les boutons. */
export function regrouper(blocs, taille = TAILLE_MESSAGE) {
  const msgs = [];
  for (const b of blocs.filter(Boolean)) {
    if (msgs.length && msgs[msgs.length - 1].length + 1 + b.length <= taille) msgs[msgs.length - 1] += `\n${b}`;
    else msgs.push(b);
  }
  return msgs;
}
const NOM_RESEAU = Object.freeze({ facebook: 'Facebook', instagram: 'Instagram', x: 'X' });
/**
 * UN message pour l'événement (précédé du visuel) : contrôles, puis les textes EXACTS de Facebook, Instagram et X, puis un bouton GO par réseau.
 * `ig` = identité de la proposition Instagram jointe (ou null). @returns {string[]} messages dans l'ordre d'envoi (le dernier porte les boutons)
 */
export function messagesProposition({ id8, c, comp, ident, expire_at, site, now, ig = null }) {
  const e = comp.entree;
  const fb = ident.canaux.facebook, x = ident.canaux.x, igc = ig?.canaux?.instagram ?? null;
  const src = (fb ?? x ?? igc).source;
  const age = ageJours(src.publie_le, now);
  const remplace = ident.remplace ?? [];
  const evenement = (ident.complementX ? '➕ <b>X seul</b> — Facebook et Instagram ont déjà été décidés pour cet événement ; seule la rédaction de X est proposée ici (format standard des prises de parole)\n' : '')
    + (remplace.length ? `🔁 <b>Remplace ${remplace.length > 1 ? 'les propositions' : 'la proposition'} ${remplace.map(esc).join(', ')}</b> (jamais décidée${remplace.length > 1 ? 's' : ''}, refermée${remplace.length > 1 ? 's' : ''} sans décision) — même événement, un seul message pour les réseaux\n` : '')
    + (c.type === 'new_case' ? 'Nouvelle affaire' : c.sous_type === 'fiche_temoignage' ? 'Parole d’un parent (mise à jour de fiche approuvée) — statut judiciaire inchangé' : c.sous_type === 'fiche_evolution' ? `Évolution de procédure (mise à jour de fiche approuvée) — statut judiciaire inchangé${comp.evt?.date ? ` (${jourFr(comp.evt.date)})` : ''}` : `Évolution judiciaire : ${esc(c.statut_avant ?? '?')} → ${esc(c.statut_apres)}${comp.evt?.date ? ` (${jourFr(comp.evt.date)})` : ''}`);
  const reserves = [...new Set([...['facebook', 'x'].flatMap((k) => comp.canaux[k]?.reserves ?? []), ...(ig?.affichage?.reserves ?? [])])];
  const bloques = CANAUX_RELAIS.filter((k) => !comp.canaux[k]?.ok && (!ident.complementX || k === 'x')).map((k) => `${NOM_RESEAU[k]} BLOQUÉ : ${esc((comp.canaux[k]?.motifs || []).join(' ; ').slice(0, 300))}`);
  const tete = `📣 <b>RELAIS SOCIAL — proposition</b> (${id8})\n<b>${esc(e.etablissement)} — ${esc(e.commune)}</b>\n${evenement}\n`
    + `Source : ${esc(src.media)}, ${jourFr(src.publie_le)}${age != null ? ` (il y a ${Math.max(0, Math.floor(age))} j)` : ''} — ${esc(src.url)}\n`
    + `Fiche SNY : ${site}/affaires/${esc(c.case_id.toLowerCase())}/\n`
    + `Contrôles : T0 ✓ · fiche approuvée et servie (empreinte ${esc(comp.fiche_hash)}) ✓ · composeur ${esc('V4.1')} + vérificateur ✓ · source &lt; ${FENETRE_SOURCE_JOURS} j lue ✓${ident.image ? ` · visuel commun hébergé et relu (${ident.image.largeur}×${ident.image.hauteur}, ${Math.round(ident.image.octets / 1024)} Ko, empreinte ${esc(ident.image.sha256.slice(0, 12))}) ✓` : ''}`
    + (reserves.length ? `\n⚠️ Réserves : ${esc(reserves.join(' ; ').slice(0, 500))}` : '') + (bloques.length ? `\n🚫 ${bloques.join('\n🚫 ')}` : '');
  const blocs = [tete];
  if (fb) blocs.push(`<b>Facebook</b> (${[...fb.texte].length} car.)\n<pre>${esc(fb.texte)}</pre>`);
  if (igc) blocs.push(`<b>Instagram</b> (${[...igc.texte].length} car.)\n<pre>${esc(igc.texte)}</pre>`);
  if (x) blocs.push(`<b>X</b> (${poidsX(x.texte)}/280 car., comptage pondéré X : URL = 23)${/A suivre sur SNY/.test(x.texte) ? '' : '\nℹ️ Sans la ligne « A suivre sur SNY » : le format complet dépasse 280 (le visuel joint porte sousnosyeux.org).'}\n<pre>${esc(x.texte)}</pre>`);
  // MEILLEURE TENTATIVE X (jamais envoyée : X reste bloqué tant que la difficulté n'est pas levée) — l'éditeur voit le texte, son compte et la raison, pour arbitrer ou contre-proposer.
  const tx = comp.canaux?.x?.tentative;
  if (!x && tx) blocs.push(`<b>X — meilleure tentative, NON ENVOYABLE</b> (${tx.longueur}/280 car.${tx.longueur > 280 ? `, dépasse de ${tx.longueur - 280}` : ''}, comptage pondéré X)\n<pre>${esc(tx.texte)}</pre>`);
  if (ident.image) {
    const reseaux = [fb && 'Facebook', igc && 'Instagram', x && 'X'].filter(Boolean).join(' + ');
    const alt = ident.image.alt ? `Texte alternatif joint (${[...ident.image.alt].length} car.) : ${esc(ident.image.alt)}` : 'Texte alternatif : aucun (le contenu validé dépasse 1000 caractères)';
    const resume = ident.image.alt ? `Texte alternatif joint : ${[...ident.image.alt].length} car. (dérivé du visuel validé)` : alt;
    // Le texte alternatif n'est écrit en entier que s'il ne force pas un second message (les textes des posts, eux, ne sont jamais abrégés).
    const entete = `<b>Visuel commun</b> (envoyé juste avant ; joint tel quel aux posts ${reseaux}) : ${esc(ident.image.url)}\n`;
    blocs.push(entete + (blocs.join('\n').length + entete.length + alt.length + 450 <= TAILLE_MESSAGE ? alt : resume));
  }
  blocs.push(`Valable jusqu’au ${new Date(expire_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Chaque bouton ne vaut que pour SON réseau, sur CE texte et CE visuel (un changement de l’un ou de l’autre l’annule). Sans GO, rien n’est publié : la proposition expire. Texte, source et visuel sont revérifiés juste avant l’envoi, et la publication est programmée avec un délai d’annulation.`);
  const msgs = regrouper(blocs);
  // Les réserves sont abrégées en dernier recours (jamais les textes des posts, jamais les contrôles bloquants).
  return msgs.map((m) => (m.length > 4090 ? m.replace(/\n⚠️ Réserves : [^\n]*/, '\n⚠️ Réserves : voir la fiche et le contrôleur (liste trop longue pour ce message)') : m));
}
/** Un bouton GO par réseau proposé, sur une seule ligne ; pas de bouton « Refuser » : l'absence de GO vaut refus (la proposition expire, rien n'est conservé). */
export function boutonsProposition(id8, canaux, igId8 = null) {
  const b = [];
  if (canaux.includes('facebook')) b.push({ text: 'GO Facebook', callback_data: `sny:SG:F:${id8}` });
  if (igId8) b.push({ text: 'GO Instagram', callback_data: `sny:SG:I:${igId8}` });
  if (canaux.includes('x')) b.push({ text: 'GO X', callback_data: `sny:SG:X:${id8}` });
  return { inline_keyboard: [b] };
}

// ---------------------------------------------------------------------
// DÉCISION HUMAINE (clic Telegram) : enregistrée UNE fois, jamais plus large que ce qui a été proposé.
// ---------------------------------------------------------------------
// `I` (GO Instagram) n'est valable QUE sur une proposition qui a proposé Instagram (relais-instagram.mjs) : le contrôle « canaux autorisés ⊂ canaux proposés » ci-dessous
// rend un GO X / Facebook sans effet sur Instagram et inversement. `R` (refuser) vaut pour la proposition cliquée, quel que soit son canal.
export const ACTIONS_SOCIALES = Object.freeze({ XF: { decision: 'GO_XF', canaux: ['x', 'facebook'] }, F: { decision: 'GO_F', canaux: ['facebook'] }, X: { decision: 'GO_X', canaux: ['x'] }, I: { decision: 'GO_I', canaux: ['instagram'] }, R: { decision: 'REFUS', canaux: [] } });
/**
 * Un clic = UN réseau. Chaque GO s'ajoute aux précédents sur la même proposition (GO Facebook puis GO X : les deux comptent) jusqu'à l'expiration ; un réseau sans GO n'est jamais publié.
 * `XF` et `R` ne sont plus proposés par les messages ; ils restent décodés pour les boutons des messages déjà envoyés.
 * @param {{port:object, action:string, cle:string, now:Date, actif:boolean}} a
 * @returns {Promise<{issue:'enregistree'|'double_clic'|'introuvable'|'bouton_invalide'|'expiree'|'inactif', proposition?:object, decision?:string}>}
 */
export async function enregistrerDecision({ port, action, cle, now, actif }) {
  const a = ACTIONS_SOCIALES[action];
  if (!a || !/^[0-9a-f]{8}$/.test(cle || '')) return { issue: 'bouton_invalide' };
  const p = await port.propositionParCle(cle);
  if (!p) return { issue: 'introuvable' };
  const dejaDit = { issue: 'double_clic', proposition: p, decision: p.decision };
  if (p.decision === 'REFUS' || p.decision === 'EXPIREE') return dejaDit;
  if (!a.canaux.length) return p.decision ? dejaDit : refuserAncien({ port, p, a, now });
  if (a.canaux.every((k) => (p.canaux_autorises || []).includes(k))) return dejaDit; // clic rejoué : ce réseau a déjà son GO
  if (p.resolution && p.resolution !== 'publie') return { issue: 'expiree', proposition: p }; // refermée sans décision, ou GO périmé (bloqué / obsolète)
  if (!actif) return { issue: 'inactif', proposition: p };
  if (a.canaux.some((k) => !(p.canaux_proposes || []).includes(k))) return { issue: 'bouton_invalide', proposition: p };
  if (dateOuNull(p.expire_at) && now.getTime() > dateOuNull(p.expire_at).getTime()) {
    if (!p.decision) await port.decider(p.proposal_id, { decision: 'EXPIREE', canaux: [], now, resolution: 'expiree' });
    return { issue: 'expiree', proposition: p };
  }
  const ok = await port.ajouterGo(p.proposal_id, { canaux: a.canaux, now });
  return ok ? { issue: 'enregistree', proposition: p, decision: a.decision } : { issue: 'double_clic', proposition: p };
}
async function refuserAncien({ port, p, a, now }) { // bouton « Refuser » d'un message envoyé avant la proposition unique
  if (p.resolution) return { issue: 'expiree', proposition: p };
  const ok = await port.decider(p.proposal_id, { decision: a.decision, canaux: [], now, resolution: 'refuse' });
  return ok ? { issue: 'enregistree', proposition: p, decision: a.decision } : { issue: 'double_clic', proposition: p };
}

// ---------------------------------------------------------------------
// PHASE 1 — PROPOSER : événements éligibles → UNE proposition Telegram chacun. Silence si rien d'éligible (aucune recherche historique pour « remplir »).
// ---------------------------------------------------------------------
/**
 * deps = { port, compo, activation:{actif,t0}, holds:Set, canauxConfigures:string[], envoyer:(texte, markup)=>Promise<number|null>, log, ecrire:boolean, ficheServie:(id)=>Promise<{status,hash}|null>, servi:(id)=>boolean }
 */
export async function proposerNouveautes(deps) {
  const { port, compo, activation, holds, canauxConfigures, envoyer, log, ecrire } = deps;
  const bilan = { candidats: 0, proposees: 0, bloquees: 0, envoyees: 0 };
  if (!activation.actif) { log(`relais social inactif : ${activation.raisons.join(' ; ')}`); return bilan; }
  const now = compo.now;
  // Instagram rejoint le MÊME message (visuel + texte + bouton) quand son canal est actif et que l'événement est dans son périmètre ; sa décision et son envoi restent indépendants (relais-instagram.mjs).
  const igAct = deps.instagram ? verifierActivationInstagram({ activation, igRow: deps.instagram.igRow, now, canalConfigure: deps.instagram.canalConfigure }) : null;
  const candidats = await port.candidats(activation.t0);
  bilan.candidats = candidats.length;
  for (const c of candidats) {
    c.event_key = c.type === 'new_case' ? cleEvenement('new_case', c.case_id) : cleEvenement('case_update', c.case_id, c.statut_apres);
    const prop = await port.propositionParEvenement(c.event_key);
    // REPROPOSITION CIBLÉE (data/relais-reproposer.json) : toutes les propositions OUVERTES d'un événement NOMMÉ (X / Facebook et Instagram, jamais décidées) sont REMPLACÉES par une seule proposition commune
    // (clé « <événement>#commun:<id> »). Aucune décision n'est enregistrée sur les anciennes (elles sont seulement refermées) ; si une décision existe déjà sur cet événement, rien n'est reproposé.
    let cleProp = c.event_key, anterieures = [];
    if (deps.reproposer?.has(c.event_key)) {
      const rows = await port.propositionsDeEvenement(c.event_key);
      // Proposition commune déjà faite (remplaçante, ou proposition d'origine) : on ne la refait pas ; on la renvoie si elle n'est pas partie, et on propose X seul s'il n'était pas publiable à l'époque.
      const commune = rows.find((p) => p.event_key.startsWith(`${c.event_key}#commun:`)) ?? rows.find((p) => p.identite?.commun && !/#(instagram|x):/.test(p.event_key));
      if (commune) { if (ecrire && !commune.decision && !commune.resolution && commune.telegram_message_id == null && new Date(commune.expire_at) > now) bilan.envoyees += await envoyerProposition({ prop: commune, deps, c: { ...c, event_key: commune.event_key } }) ? 1 : 0; if (ecrire) bilan.envoyees += await proposerXSeul({ c, rows, deps }); continue; }
      if (!rows.some((p) => p.decision && p.decision !== 'EXPIREE')) {
        anterieures = rows.filter((p) => !p.decision && !p.resolution && new Date(p.expire_at) > now);
        if (anterieures.length) cleProp = `${c.event_key}#commun:${String(anterieures[0].proposal_id).slice(0, 8)}`;
      }
    }
    // Proposition déjà créée : on ne la recrée jamais ; on ne fait qu'envoyer le message si l'envoi n'a pas eu lieu (reprise après panne).
    if (prop && !anterieures.length) {
      if (ecrire && !prop.decision && !prop.resolution && prop.telegram_message_id == null && new Date(prop.expire_at) > now) bilan.envoyees += await envoyerProposition({ prop, deps, c }) ? 1 : 0;
      continue;
    }
    const cc = { ...c, event_key: cleProp };
    const exclus = await port.exclusionsDe(c.event_key);
    const ctx = { t0: activation.t0, now, holds, entree: compo.cases.get(c.case_id) ?? null, ficheHash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
      servi: deps.servi(c.case_id), ficheServie: await deps.ficheServie(c.case_id), proposition: false, ledger: await port.ledgerDe(c.event_key), exclusions: exclus };
    const v = evaluerCandidat(c, ctx);
    if (!v.ok) { bilan.bloquees++; log(`· ${c.type} ${c.case_id} : SILENCE — ${v.raisons.join(' ; ')}`); continue; }
    const comp = composerEvenement(c, compo);
    for (const k of CANAUX_RELAIS) {
      if (exclus.has(k) && comp.canaux[k]?.ok) comp.canaux[k] = { ok: false, motifs: ['publication déjà faite hors circuit sur ce canal (exclusion définitive)'] };
      if (comp.canaux[k]?.ok && !canauxConfigures.includes(k)) comp.canaux[k] = { ok: false, motifs: ['canal non configuré'] };
      if (comp.canaux[k]?.ok && await port.empreinteTexteExclue(k, empreinteTexte(comp.canaux[k].texte))) comp.canaux[k] = { ok: false, motifs: ['texte identique à une publication déjà faite (exclusion)'] };
    }
    let proposables = CANAUX_RELAIS.filter((k) => comp.canaux[k]?.ok);
    if (proposables.length) proposables = await appliquerPareFeu({ c: cc, comp, canaux: proposables, port, now });
    let visuel = null;
    if (proposables.length) {
      visuel = await visuelPartage({ c, compo, imageDeps: deps.image, ecrire, existantes: imagesDeProps(await port.propositionsDeEvenement(c.event_key)) });
      if (!visuel.ok) { for (const k of proposables) comp.canaux[k] = sansVisuel(comp.canaux[k], k, visuel.motifs); proposables = []; }
    }
    if (!proposables.length) { bilan.bloquees++; log(`· ${c.type} ${c.case_id} : SILENCE — aucun canal publiable : ${CANAUX_RELAIS.map((k) => `${k}: ${motifsPublics((comp.canaux[k]?.motifs || []).join(' ; '))}`).join(' | ')}`); continue; }
    // Instagram dans le même message : mêmes contrôles que son passage autonome (point de départ, décisions, pare-feu, légende, visuel). Une panne ici n'empêche jamais X / Facebook.
    let igJoint = null;
    if (ecrire && visuel?.image && igAct?.actif && dansPerimetreInstagram(c, igAct, deps.instagram.amorcage).ok) {
      try {
        const ex = await examinerInstagram({ c, base: c.event_key, deps: { ...deps, amorcage: deps.instagram.amorcage }, act: igAct, rejouer: anterieures.length > 0, ignorer: new Set(anterieures.map((a) => a.proposal_id)) });
        if (ex.etat === 'ok') igJoint = ex; else if (ex.etat === 'silence') log(`· instagram ${c.type} ${c.case_id} : SILENCE — ${motifsPublics(ex.motif)}`);
      } catch (e) { log(`· instagram ${c.type} ${c.case_id} : erreur technique isolée (${motifsPublics(e.message).slice(0, 80)})`); }
    }
    const ident = identiteDe(cc, comp, visuel);
    if (anterieures.length) ident.remplace = anterieures.map((a) => String(a.proposal_id).slice(0, 8));
    ident.commun = true;
    log(`· ${c.type} ${c.case_id} : ÉLIGIBLE${anterieures.length ? ' (remplace des propositions antérieures)' : ''} (${[...proposables, ...(igJoint ? ['instagram'] : [])].join(' + ')})${ecrire ? '' : ' — plan, rien enregistré ni envoyé'}`);
    if (!ecrire) continue;
    const expire_at = new Date(now.getTime() + VALIDITE_PROPOSITION_H * HEURE);
    const cree = await port.creerProposition({ event_key: cleProp, case_id: c.case_id, type_event: c.type, identite: ident, texte_x: ident.canaux.x?.texte ?? null, texte_facebook: ident.canaux.facebook?.texte ?? null,
      canaux_proposes: proposables, empreinte_x: ident.canaux.x?.empreinte ?? null, empreinte_facebook: ident.canaux.facebook?.empreinte ?? null, expire_at });
    if (!cree) continue; // un autre passage vient de la créer
    let igProp = null;
    if (igJoint) { try { igProp = await creerPropositionInstagram({ c, base: c.event_key, ex: igJoint, image: visuel.image, deps, expire_at, commun: true, cle: anterieures.length ? `${cleInstagramDe(c.event_key, igJoint.contenu)}-${String(anterieures[0].proposal_id).slice(0, 4)}` : null }); } catch (e) { log(`· instagram ${c.type} ${c.case_id} : proposition non créée (${motifsPublics(e.message).slice(0, 80)})`); } }
    for (const a of anterieures) await port.resoudre(a.proposal_id, 'remplacee: proposition antérieure, reproposée dans le message commun (aucune décision enregistrée)');
    bilan.proposees++;
    bilan.envoyees += await envoyerProposition({ prop: cree, deps, c: cc, comp, ident, igProp }) ? 1 : 0;
  }
  log(`${bilan.candidats} candidat(s) après T0, ${bilan.proposees} proposition(s) créée(s), ${bilan.bloquees} silence(s)`);
  return bilan;
}

/**
 * X SEUL pour un événement NOMMÉ (data/relais-reproposer.json) dont la proposition commune est déjà partie SANS X (X n'était pas publiable). Quand sa rédaction le devient (format standard), UNE proposition
 * « X seul » est faite, avec le même visuel. Mêmes contrôles qu'une proposition ordinaire ; jamais si X a déjà une proposition, une ligne de journal ou une exclusion. @returns {Promise<number>} messages envoyés
 */
async function proposerXSeul({ c, rows, deps }) {
  const { port, compo, activation, holds, canauxConfigures, log, ledger } = deps;
  const now = compo.now;
  if (rows.some((p) => (p.canaux_proposes || []).includes('x')) || await ledger.lire(c.event_key, 'x') || !canauxConfigures.includes('x')) return 0;
  const exclus = await port.exclusionsDe(c.event_key);
  if (exclus.has('x')) return 0;
  const v = evaluerCandidat(c, { t0: activation.t0, now, holds, entree: compo.cases.get(c.case_id) ?? null, ficheHash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
    servi: deps.servi(c.case_id), ficheServie: await deps.ficheServie(c.case_id), proposition: false, ledger: false, exclusions: exclus });
  if (!v.ok) { log(`· X seul ${c.case_id} : SILENCE — ${motifsPublics(v.raisons.join(' ; '))}`); return 0; }
  const comp = composerEvenement(c, compo);
  if (!comp.canaux.x?.ok) { log(`· X seul ${c.case_id} : SILENCE — ${motifsPublics((comp.canaux.x?.motifs || []).join(' ; '))}`); return 0; }
  if (await port.empreinteTexteExclue('x', empreinteTexte(comp.canaux.x.texte))) return 0;
  const cle = `${c.event_key}#x:${empreinteTexte(comp.canaux.x.texte).slice(0, 8)}`;
  const cc = { ...c, event_key: cle };
  if (!(await appliquerPareFeu({ c: cc, comp, canaux: ['x'], port, now })).length) { log(`· X seul ${c.case_id} : SILENCE — ${motifsPublics((comp.canaux.x?.motifs || []).join(' ; '))}`); return 0; }
  const visuel = await visuelPartage({ c, compo, imageDeps: deps.image, ecrire: true, existantes: imagesDeProps(rows) });
  if (!visuel.ok) { log(`· X seul ${c.case_id} : SILENCE — ${motifsPublics(visuel.motifs.join(' ; '))}`); return 0; }
  const ident = identiteDe(cc, comp, visuel);
  ident.canaux = { x: ident.canaux.x };
  ident.complementX = true;
  log(`· X seul ${c.case_id} : rédaction X devenue publiable ⇒ proposition X seul (Facebook et Instagram déjà décidés)`);
  const cree = await port.creerProposition({ event_key: cle, case_id: c.case_id, type_event: c.type, identite: ident, texte_x: ident.canaux.x.texte, texte_facebook: null, canaux_proposes: ['x'],
    empreinte_x: ident.canaux.x.empreinte, empreinte_facebook: null, expire_at: new Date(now.getTime() + VALIDITE_PROPOSITION_H * HEURE) });
  return cree && await envoyerProposition({ prop: cree, deps, c: cc, comp, ident }) ? 1 : 0;
}

async function envoyerProposition({ prop, deps, c, comp = null, ident = null, igProp = null }) {
  const { port, compo, envoyer, log } = deps;
  const id8 = String(prop.proposal_id).slice(0, 8);
  const reconstruit = ident ?? prop.identite;
  const cp = comp ?? composerEvenement(c, compo);
  // Reprise après panne : l'Instagram créé avec cette proposition, s'il attend toujours son message, repart dans le MÊME message.
  if (!igProp) igProp = (await port.propositionsInstagramDeEvenement(cleBase(prop.event_key))).find((p) => p.identite?.commun && !p.decision && !p.resolution && p.telegram_message_id == null && new Date(p.expire_at) > compo.now) ?? null;
  // Le message reprend le texte ENREGISTRÉ (celui du GO), pas une recomposition éventuellement différente.
  if (!(await port.reclamerEnvoi(prop.proposal_id))) return false;
  if (igProp && !(await port.reclamerEnvoi(igProp.proposal_id))) igProp = null;
  const messages = messagesProposition({ id8, c, comp: cp, ident: reconstruit, expire_at: prop.expire_at, site: compo.site, now: compo.now, ig: igProp?.identite ?? null });
  try {
    // Le visuel EXACT (celui qui sera joint aux posts) : Telegram le télécharge à l'adresse publique, preuve de plus qu'elle est servie.
    if (reconstruit?.image?.url) {
      if (!deps.envoyerPhoto) throw new Error('envoi du visuel impossible');
      await deps.envoyerPhoto(reconstruit.image.url, `Visuel commun — ${reconstruit.image.largeur}×${reconstruit.image.hauteur}, empreinte ${reconstruit.image.sha256.slice(0, 12)}`);
    }
    const boutons = boutonsProposition(id8, prop.canaux_proposes, igProp ? String(igProp.proposal_id).slice(0, 8) : null);
    let mid = null;
    for (const [i, m] of messages.entries()) mid = await envoyer(m, i === messages.length - 1 ? boutons : undefined);
    await port.noterEnvoi(prop.proposal_id, mid);
    if (igProp) await port.noterEnvoi(igProp.proposal_id, mid);
    log(`· proposition ${id8} (${c.case_id}) envoyée sur Telegram${igProp ? ' (avec Instagram)' : ''}`);
    return true;
  } catch (e) {
    await port.libererEnvoi(prop.proposal_id);
    if (igProp) await port.libererEnvoi(igProp.proposal_id);
    log(`· proposition ${id8} : envoi Telegram impossible (${String(e.message).slice(0, 80)}) — nouvel essai au prochain passage`);
    return false;
  }
}

// ---------------------------------------------------------------------
// PHASE 2 — PUBLIER : uniquement les propositions dotées d'un GO social, après recontrôle de l'éligibilité ET de l'identité.
// ---------------------------------------------------------------------
/**
 * deps (en plus de proposerNouveautes) = { buffer, ledger, channelIds:{x,facebook}, delaiMin, alerter:(texte)=>Promise }
 */
export async function publierDecisions(deps) {
  const { port, compo, activation, holds, canauxConfigures, log, ecrire, buffer, ledger, channelIds, delaiMin = 15, alerter } = deps;
  const bilan = { go: 0, publiees: 0, obsoletes: 0, bloquees: 0, expirees: 0 };
  if (!activation.actif || !ecrire) return bilan;
  const now = compo.now;
  // Silence = zéro publication : une proposition sans décision et expirée est refermée, jamais publiée.
  for (const p of await port.propositionsExpirees(now)) { await port.decider(p.proposal_id, { decision: 'EXPIREE', canaux: [], now, resolution: 'expiree' }); bilan.expirees++; log(`· proposition ${String(p.proposal_id).slice(0, 8)} expirée sans GO : aucun envoi`); }
  const aTraiter = await port.propositionsAvecGo();
  if (!aTraiter.length) return bilan;
  const candidats = await port.candidats(activation.t0);
  for (const p of aTraiter) {
    bilan.go++;
    const id8 = String(p.proposal_id).slice(0, 8);
    const autorises = (p.canaux_autorises || []).filter((k) => CANAUX_RELAIS.includes(k) && p.canaux_proposes.includes(k));
    const dejaCrees = [];
    for (const k of autorises) { const l = await ledger.lire(p.event_key, k); if (l && l.etat !== 'reserve') dejaCrees.push(k); } // une ligne « reserve » = réponse incertaine : réconciliée par diffuserCanal, après recontrôle
    const aCreer = autorises.filter((k) => !dejaCrees.includes(k));
    let bloque = null;
    if (aCreer.length) {
      // Recontrôle COMPLET : même événement, mêmes horodatages, page servie, source récente, composition et empreinte identiques.
      const c = candidats.find((x) => (x.type === 'new_case' ? cleEvenement('new_case', x.case_id) : cleEvenement('case_update', x.case_id, x.statut_apres)) === cleBase(p.event_key));
      if (!c) bloque = 'obsolete: événement introuvable ou modifié depuis la proposition';
      else {
        c.event_key = p.event_key; // clé de la PROPOSITION (celle d'un complément porte son suffixe : elle entre dans l'empreinte)
        const v = evaluerCandidat(c, { t0: activation.t0, now, holds, entree: compo.cases.get(c.case_id) ?? null, ficheHash: compo.ev.fiches_approuvees?.[c.case_id]?.hash ?? null,
          servi: deps.servi(c.case_id), ficheServie: await deps.ficheServie(c.case_id), proposition: false, ledger: false, exclusions: await port.exclusionsDe(cleBase(p.event_key)) });
        if (!v.ok) bloque = `bloque: ${v.raisons.join(' ; ')}`;
        else {
          const comp = composerEvenement(c, compo);
          const stock = p.identite?.image;
          const rv = await recontroleVisuel({ c, compo, stock, imageDeps: deps.image });
          const ident = identiteDe(c, comp, rv.motif ? null : { image: rv.image, spec_hash: stock.spec_hash, gabarit: stock.gabarit, alt: stock.alt });
          const exclus = await port.exclusionsDe(cleBase(p.event_key));
          const pfDiffusions = rv.motif ? [] : await port.diffusionsDeAffaire(c.case_id, new Date(now.getTime() - 36 * HEURE));
          const pf = rv.motif ? [] : aCreer.flatMap((k) => controlerPareFeu({ event_key: p.event_key, canal: k, diffusions: pfDiffusions, now }));
          if (rv.motif) bloque = rv.motif;
          else if (pf.length) bloque = `bloque: ${[...new Set(pf)].join(' ; ')}`;
          else for (const k of aCreer) {
            if (exclus.has(k)) bloque = `bloque: publication déjà faite hors circuit sur ${k}`;
            else if (!canauxConfigures.includes(k) || !channelIds[k]) bloque = `bloque: canal ${k} non configuré`;
            else if (!comp.canaux[k]?.ok) bloque = `bloque: ${k} n’est plus publiable (${(comp.canaux[k]?.motifs || []).join(' ; ').slice(0, 200)})`;
            else if (ident.canaux[k].empreinte !== (k === 'x' ? p.empreinte_x : p.empreinte_facebook) || ident.canaux[k].texte !== (k === 'x' ? p.texte_x : p.texte_facebook)) bloque = `obsolete: l’ensemble validé (affaire, événement, version approuvée, sources, texte, URLs) a changé pour ${k}`;
            if (bloque) break;
          }
        }
      }
    }
    if (bloque) {
      // Un GO périmé n'autorise rien : ni ce canal ni l'autre (le GO portait sur UN ensemble).
      await port.resoudre(p.proposal_id, bloque);
      if (bloque.startsWith('obsolete')) bilan.obsoletes++; else bilan.bloquees++;
      await alerter(`🛑 <b>GO social non exécuté</b> (${id8}) : ${esc(bloque.replace(/^(obsolete|bloque): /, ''))}. Aucune publication. Le GO donné ne vaut plus ; une nouvelle proposition sera faite si l’événement reste éligible.`);
      log(`· proposition ${id8} : ${motifsPublics(bloque)}`);
      continue;
    }
    let incertain = false;
    for (const k of aCreer) {
      const texte = k === 'x' ? p.texte_x : p.texte_facebook;
      try {
        const r = await diffuserCanal({ ev: { event_key: p.event_key, type: p.type_event, case_id: p.case_id }, canal: k, texte, channelId: channelIds[k], imageUrl: p.identite?.image?.url ?? null, altText: p.identite?.image?.alt ?? null, lien: p.identite?.liens?.[k] ?? null, ledger, buffer, now, delaiMin, alerter });
        log(`· proposition ${id8} [${k}] : ${r.action}${r.etat ? ` (${r.etat})` : ''}`);
        if (r.action === 'echec') await alerter(`⚠️ <b>Diffusion sociale refusée par Buffer</b> (${k}, ${id8}) : ${esc(r.erreur)}`);
        if (['incertain', 'attente'].includes(r.action)) incertain = true;
      } catch (e) { incertain = true; log(`· proposition ${id8} [${k}] : erreur technique isolée (${String(e.message).slice(0, 80)})`); }
    }
    const lignes = [];
    for (const k of autorises) lignes.push(await ledger.lire(p.event_key, k));
    const tout = lignes.every((l) => l && l.etat !== 'reserve');
    if (!incertain && tout) { await port.resoudre(p.proposal_id, 'publie'); bilan.publiees++; }
    if (tout && !p.notif_programme_at) {
      await port.noterNotif(p.proposal_id, 'programme');
      await alerter(`🕒 <b>Publication programmée</b> (${id8}) : ${(aCreer.length ? aCreer : autorises).map((k) => (k === 'x' ? 'X' : 'Facebook')).join(' + ')}, envoi dans ~${delaiMin} min. Annulable avant l’envoi si la fiche est retirée ; sinon, aucune action requise.`);
    }
  }
  return bilan;
}

/** Après suivi du journal : une confirmation unique, avec les permaliens disponibles, quand chaque canal autorisé est parti. */
export async function confirmerPublications({ port, ledger, alerter }) {
  let n = 0;
  for (const p of await port.propositionsAConfirmer()) {
    const lignes = [];
    for (const k of p.canaux_autorises || []) lignes.push(await ledger.lire(p.event_key, k));
    if (!lignes.length || !lignes.every((l) => l && ['envoye', 'verifie'].includes(l.etat))) continue;
    await port.noterNotif(p.proposal_id, 'publie');
    await alerter(`📣 <b>Publié</b> (${String(p.proposal_id).slice(0, 8)}) :\n${lignes.map((l) => `• ${l.canal === 'x' ? 'X' : 'Facebook'} : ${l.permalien ? esc(l.permalien) : 'envoyé (permalien non encore disponible)'}`).join('\n')}`);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------
// SUIVI ET RETRAITS des lignes ouvertes du journal (Buffer) : annulation avant envoi si la fiche est retirée, alerte prioritaire si déjà publié.
// ---------------------------------------------------------------------
import { suivreLigne, retirerLigne, reconcilierSansCreer } from './diffusion-flux.mjs';
export async function suivreEtRetirer({ port, compo, holds, buffer, ledger, channelIds, alerter, log }) {
  let erreurs = 0;
  const now = compo.now;
  const ouvertes = await port.lignesOuvertes();
  const etats = new Map((await port.etatsAffaires([...new Set(ouvertes.map((r) => r.case_id))])).map((e) => [e.case_id, e]));
  for (const row of ouvertes) {
    try {
      const e = etats.get(row.case_id);
      const motif = !e || e.ps !== 'publiée' ? 'affaire retirée' : e.retire ? 'revue « retirer »' : holds.has(row.case_id) ? 'HOLD de publication' : !compo.cases.has(row.case_id) ? 'absente de l’artefact public' : null;
      if (motif) { const r = await retirerLigne({ row, motif, channelId: channelIds[row.canal], ledger, buffer, alerter }); log(`· retrait ${row.case_id} [${row.canal}] : ${r.action}`); continue; }
      if (row.etat === 'reserve') { const r = await reconcilierSansCreer({ row, channelId: channelIds[row.canal], ledger, buffer, now, alerter }); log(`· réconciliation ${row.case_id} [${row.canal}] : ${r.action}`); continue; }
      if (row.etat !== 'verifie') { const r = await suivreLigne({ row, ledger, buffer, now, alerter }); if (r.action !== 'inchange' && r.action !== 'rien') log(`· suivi ${row.case_id} [${row.canal}] : ${r.action}${r.etat ? ` (${r.etat})` : ''}`); }
    } catch (e) { erreurs++; log(`· suivi/retrait ${row.case_id} [${row.canal}] : erreur technique isolée (${String(e.message).slice(0, 80)})`); }
  }
  return erreurs;
}

/**
 * UN passage complet du relais (c'est ce que `diffuser-social.mjs --ecrire` exécute, et ce que les tests exécutent) :
 * proposer les nouveautés éligibles → publier les GO sociaux recontrôlés → suivre / retirer → confirmer. Inactif ⇒ rien, sans toucher ni Buffer ni Telegram.
 */
export async function executerCycle(deps) {
  const { activation, log } = deps;
  if (!activation.actif) { log(`relais social INACTIF : ${activation.raisons.join(' ; ')}`); return { actif: false }; }
  const propositions = await proposerNouveautes(deps);
  if (!deps.ecrire) return { actif: true, propositions };
  const publications = await publierDecisions(deps);
  const erreurs = await suivreEtRetirer(deps);
  const confirmees = await confirmerPublications(deps);
  return { actif: true, propositions, publications, erreurs, confirmees };
}
