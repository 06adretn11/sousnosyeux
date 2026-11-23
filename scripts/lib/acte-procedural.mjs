// =====================================================================
// scripts/lib/acte-procedural.mjs — actes procéduraux SANS changement de statut (audit du 21/11/2026)
//
// Garde à vue, présentation au juge SANS mise en examen, appel formé ou annoncé, détention provisoire, remise en liberté, audience
// annoncée : des faits judiciaires qui n'écrivent PAS le statut de la fiche mais que la mémoire de l'affaire doit porter. Jusqu'ici une
// proposition d'enrichissement qui les portait finissait « aucune information nouvelle à décider (source seule) : aucun message »
// (FR-2026-0133, 19/11/2026 : « n'a pas été mis en examen » n'a jamais été montré à l'éditeur).
//
// Même mécanisme que les mesures institutionnelles (evenement-institutionnel.mjs) : fonction PURE sur des citations LITTÉRALES déjà
// vérifiées ; libellé public tiré d'une table FERMÉE (« Selon la presse… », jamais un nom, jamais un détail des faits) ; fait structuré
// décidable (VALIDATE écrit un événement `case_events`, REVIEW / REJECT n'écrivent rien). Un acte NIÉ, REFUSÉ, REQUIS ou RAPPELÉ
// (routage-veille.actesDetail) n'est jamais proposé comme fait nouveau — sauf « pas de mise en examen », qui est lui-même le fait.
// Les actes qui font évoluer le STATUT (mise en examen affirmée, procès, condamnation, relaxe…) restent le travail du circuit STATE_CHANGE.
//
// RÈGLE OPÉRATIONNELLE (revue contradictoire du 23/11/2026, reformulée le 23/11 après-midi) :
//   1. AUCUN fait incertain n'est inscrit comme établi : en cas de doute sur la phrase, aucun fait n'est produit (jamais un fait inversé, jamais l'auteur,
//      le jour ou la nature d'un autre événement). Un libellé plus pauvre mais vrai est préféré à un libellé précis mais douteux (« Il a fait appel » → « un appel a été formé »).
//   2. Le doute N'EFFACE PAS le signal : `signauxNonRetenus` nomme l'acte vu et pourquoi il n'est pas un fait (nié, rappelé, écarté, ou affirmé sans sujet/date/stade sûr) ;
//      le notifier le consigne avec la proposition écartée (state_proposals.payload.ecartee : motif + signaux). La SOURCE (article) et les citations restent dans la proposition elle-même.
//   3. Rien n'est « rattrapé à l'article suivant » par hypothèse : un signal consigné se relit (scripts/rejeu-ecartees.mjs) et se décide, ou se rouvre si un article ultérieur le précise.
// =====================================================================
import { actesDetail, ACTES_REGEX, polarites, aplat, jetonsEtab } from './routage-veille.mjs';
import { dateEcrite } from './evenement-institutionnel.mjs';
import { estPisteDeNavigation } from './corps-article.mjs';
import { LIB, TYPE, MESURES_PROCEDURALES, dateLisible } from './mesures-procedurales.mjs';
export { MESURES_PROCEDURALES, familleDeMesure, memeMesure, mesureDeLibelle } from './mesures-procedurales.mjs';

const norm = (s) => aplat(s);
// Une PRÉSENTATION au juge est dite explicitement : « présenté à un juge », « déféré devant un juge ». « Déféré au parquet » n'est PAS une présentation à un juge ;
// une garde à vue qui se poursuit non plus (« toujours en garde à vue, aucune mise en examen à ce stade »).
const PRESENTATION_JUGE = /\b(?:presente\w*|defere\w*)\s+(?:a|au|devant)\s+(?:un|une|le|la|l')?\s*(?:juge|magistrat)\b|\bdevant\s+(?:un|le)\s+juge\b/;
const FUTUR_PRESENTATION = /\b(?:doit|doivent|devra|devront|sera|seront|va|vont|attend\w*|prevu\w*|programme\w*|envisag\w*|pourrait|pourrai\w*)\b/;
const FUTUR_ACTE = /\b(?:sera|seront|serait|va|vont|fera|feront|fixe\w*|prevu\w*|programme\w*|attendu\w*|comparaitra|comparaitront|renvoy\w+)\b/;
// « sera jugé », « le procès est fixé au… », « comparaîtra » : un jugement À VENIR (jamais un procès tenu — wording « audience annoncée ≠ procès tenu »).
const ANNONCE_AUDIENCE = /\b(?:sera|seront)\s+juge\w*|\b(?:proces|audience)\b[^.]{0,60}\b(?:fixe\w*|prevu\w*|programme\w*|aura lieu|s'ouvrira)\b|\bcomparaitr\w+\b/;
const GAV_TERMINEE = /\b(?:levee|lever|leve|fin|terminee|sortie?|prolong\w*|ecourt\w*|renouvel\w*)\b[^.]{0,14}\bgarde a vue\b|\bgarde a vue\b[^.]{0,25}\b(?:levee|terminee|prolong\w*|ecourt\w*|renouvel\w*)\b/;
// Interpellation d'une PERSONNE : forme passive (« a été interpellé », « interpellé mardi »), nom (« l'interpellation de ») ou verbe actif suivi d'une personne.
// « Les parents ont interpellé la mairie » n'est pas une interpellation judiciaire.
const INTERP_PASSIF = /\b(?:ete|est|sont|fut|etait|etaient)\s+(?:\w+\s+){0,2}?interpell(?:e|ee|es|ees)\b|\binterpellation\s+(?:d'|de\s+|du\s+)(?:un\s+|une\s+|l'|la\s+|le\s+)?(?:homme|femme|suspect|individu|animat|enseignant|professeur|directeur|directrice|agent|salarie|aide|educat|jeune|mineur|\d+\s*ans|\w+aire\b)|(?:^|[.;:!?,]\s*)interpell(?:e|ee|es|ees)\b/;
// « interpellé par des parents », « interpellation des parents par la maire » : une interpellation CIVILE, pas judiciaire.
const INTERP_CIVILE = /\binterpell\w*\s+par\s+(?:des\s+|les\s+|plusieurs\s+|de\s+|un\s+groupe\s+de\s+)?(?:parents?|eleves|habitants|riverains|collectif|syndicats?|maire|elus|associations?|familles?)\b|\binterpellation\s+(?:des|de la|du|de l')\s*(?:parents?|eleves|elus|maire|mairie|habitants|collectif|syndicat|famille)/;
const INTERP_ACTIF = /\b(?:a|ont)\s+interpelle\s+(?:un|une|deux|trois|quatre|plusieurs|l'|le|la|les|des)\s*(?:homme|femme|suspect\w*|individu|animat\w+|enseignant\w*|professeur\w*|directeur|directrice|agent|salarie\w*|auxiliaire|personne|aide|educat\w+|jeune|mineur|garcon|\d+\s*ans)/;

const MOIS_RE = 'janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre';
const WD = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';
// Un jour de semaine suivi d'un quantième est UNE expression (« jeudi 19 novembre ») : jamais deux dates concurrentes.
const EXPR_DATE = new RegExp(`\\b(?:(?:ce\\s+|le\\s+)?(?:${WD})(?:\\s+dernier)?\\s+)?\\d{1,2}(?:er)?\\s+(?:${MOIS_RE})(?:\\s+\\d{4})?\\b|\\b(?:ce\\s+|le\\s+)?(?:${WD})(?:\\s+dernier)?\\b`, 'g');
// Date RATTACHÉE à un autre événement : « la décision du 12 novembre », « condamné le 12 novembre », « a-t-on appris vendredi », « les faits survenus le… ».
// « la décision du 12 novembre », « décision rendue mardi », « les faits survenus le… » : la date est celle de la décision ou des faits. « … de la décision le 18 novembre » (le « le » suit le
// groupe nominal) est la date de l'APPEL. Les verbes de parole (« a-t-on appris vendredi », « a annoncé jeudi ») ou de condamnation (« condamné le 12 novembre ») rattachent toujours.
const ATTACHEE = /\b(?:decision|jugement|relaxe|condamnation|verdict|arret|peine|les faits|agression\w*|viol\w*)\b[^.;:!?]{0,30}\b(?:du|rendue?s?|prononcee?s?|survenue?s?|commise?s?|datee?s?)\s+(?:le\s+|ce\s+)?$|\b(?:rendue?s?|prononcee?s?|survenue?s?|commise?s?)\s+(?:le\s+|ce\s+)?$|\b(?:condamn\w*|appris|annonc\w*|indiqu\w*|precis\w*|declar\w*|confirm\w*)\b[^.;:!?]{0,30}$/;
const AUTRE_ACTE = /\b(?:interpell\w*|garde a vue|condamn\w*|relax\w*|mis(?:e|es)? en examen|detention|liberte|appel|proces|audience)\b/;
const DISTANCE_MAX = 25;
const REGEX_MESURE = {
  garde_a_vue: /\bgarde a vue\b/, interpellation: /\binterpell\w*/, detention_provisoire: ACTES_REGEX.ECROU, remise_en_liberte: ACTES_REGEX.REMISE_LIBERTE, remise_en_liberte_controle: ACTES_REGEX.REMISE_LIBERTE,
  appel_parquet: ACTES_REGEX.APPEL_FORME, appel_défense: ACTES_REGEX.APPEL_FORME, appel: ACTES_REGEX.APPEL_FORME, audience_annoncee: new RegExp(`${ANNONCE_AUDIENCE.source}|${ACTES_REGEX.RENVOI.source}|${ACTES_REGEX.AUDIENCE.source}`),
  presentation_sans_mise_en_examen: PRESENTATION_JUGE, non_mise_en_examen: ACTES_REGEX.MISE_EN_EXAMEN,
};
const sansG = (re) => new RegExp(re.source, re.flags.replace('g', ''));

/** Libellé public d'un acte procédural (table fermée), ou null. Une audience annoncée porte sa date seulement si elle est ÉCRITE en jour complet. */
export function libelleProcedural(mesure, realisation, date = null) {
  const l = LIB[mesure]?.[realisation] || null;
  return l && mesure === 'audience_annoncee' && date ? l.replace(/\.$/, ` le ${dateLisible(date)}.`) : l;
}
/** Une mesure institutionnelle détectée (detecterInstitutionnel) sous la forme d'un fait structuré, pour être décidée avec les actes procéduraux d'une même proposition. */
export const faitDeInstitutionnel = (inst, ed = null) => ({ event_type: inst.event_type, nature: 'mesure', mesure: inst.mesure, realisation: inst.realisation, portee: 'établissement', acteur: null,
  event_date: ed, event_period: null, libelle_public: inst.libelle_public, evidence: [inst.citation] });

/** Ce qui précède l'indice dans SA proposition (virgule, point-virgule, « mais », « puis » ouvrent une proposition), borné à `max` caractères. */
function avantProposition(n, indice, max = 60) {
  const debut = n.slice(Math.max(0, indice - max), indice);
  let coupe = 0;
  for (const m of debut.matchAll(/[.;:!?,]|\b(?:mais|puis|alors que)\b/g)) coupe = m.index + m[0].length;
  return debut.slice(coupe);
}

/**
 * Date écrite À CÔTÉ de l'acte, jamais celle d'un autre événement : une expression de date à 25 caractères au plus de l'acte, de préférence APRÈS lui,
 * sans autre acte entre les deux, hors plage (« du 16 au 18 novembre ») et hors date rattachée à une décision, un jugement ou « a-t-on appris ».
 * `jourComplet` : seul un jour écrit en toutes lettres compte. `attachee: false` : pas de filtre de rattachement (audience annoncée).
 * Dans le doute : null.
 */
export function dateProche(citation, regexActe, pubDate, { avenir = false, jourComplet = false, attachee = true } = {}) {
  const n = norm(citation);
  const acte = regexActe ? sansG(regexActe).exec(n) : null;
  if (!acte) return { date: null, periode: null };
  const debut = acte.index, fin = acte.index + acte[0].length;
  const candidats = [];
  for (const m of n.matchAll(EXPR_DATE)) {
    if (jourComplet && !/\d/.test(m[0])) continue;
    const finDate = m.index + m[0].length;
    const avantDate = n.slice(Math.max(0, m.index - 14), m.index), apresDate = n.slice(finDate, finDate + 8);
    if (/\bdu\s*$/.test(avantDate) && /^\s*(?:au|a)\s+\d/.test(apresDate)) continue;     // plage : « du 16 au 18 novembre »
    if (/\bau\s*$/.test(avantDate) && /\bdu\s+\d{1,2}(?:er)?(?:\s+[a-z]+)?\s+au\s*$/.test(n.slice(Math.max(0, m.index - 30), m.index))) continue;
    const apres = m.index >= fin;
    const dist = apres ? m.index - fin : finDate <= debut ? debut - finDate : 0;
    // Audience annoncée : le jour est écrit dans la même proposition mais plus loin (« renvoyé devant le tribunal correctionnel pour y être jugé le 22 février 2027 ») ;
    // seul un jour COMPLET compte alors (jamais un jour de semaine), ce qui borne le risque.
    if (dist > (jourComplet ? 70 : DISTANCE_MAX)) continue;
    const entre = apres ? n.slice(fin, m.index) : n.slice(finDate, debut);
    if (AUTRE_ACTE.test(entre)) continue;
    if (attachee) {
      const pre = n.slice(Math.max(0, m.index - 60), m.index);
      let coupe = 0;
      for (const b of pre.matchAll(/[.;:!?]/g)) coupe = b.index + 1;
      if (ATTACHEE.test(pre.slice(coupe))) continue;
    }
    candidats.push({ apres, dist, texte: m[0] });
  }
  // Préférence : la date qui SUIT le participe (« remis en liberté jeudi 19 novembre »), puis la plus proche.
  candidats.sort((a, b) => (a.apres === b.apres ? a.dist - b.dist : a.apres ? -1 : 1));
  return candidats.length ? dateEcrite(candidats[0].texte, pubDate, { avenir }) : { date: null, periode: null };
}

/** Une présentation à un juge est-elle AFFIRMÉE dans ce texte (ni niée, ni à venir, ni demandée, ni rappelée) ? */
function presentationAffirmee(n) {
  if (!PRESENTATION_JUGE.test(n)) return false;
  if (!polarites(PRESENTATION_JUGE, n, 'PRESENTATION').affirme) return false;
  for (const m of n.matchAll(new RegExp(PRESENTATION_JUGE.source, 'g'))) if (FUTUR_PRESENTATION.test(avantProposition(n, m.index, 70))) return false;
  return true;
}
/** Auteur de l'appel : seulement le SUJET écrit dans la proposition qui précède le verbe ; avocat de la famille ou de la victime → pas d'auteur. */
function acteurAppel(n) {
  // L'occurrence retenue est la première AFFIRMÉE : « Le parquet n'a pas fait appel de la relaxe mais la partie civile a fait appel » → l'appel est celui de la partie civile.
  let m = null, avant = '';
  for (const c of n.matchAll(new RegExp(ACTES_REGEX.APPEL_FORME.source, 'g'))) {
    const a = avantProposition(n, c.index, 50);
    if (/(?:\bn'|\bne\s)(?:[a-z']+\s+){0,3}(?:pas|jamais|plus)\b|\b(?:renonc|abandonn)\w*/.test(a)) continue;
    m = c; avant = a; break;
  }
  if (!m) return null;
  const partieCivile = /\b(?:famille|parents?|victimes?|partie civile|plaignant\w*|association|mere|pere)\b/.test(avant);
  if (partieCivile) return null;
  const parquet = /\b(?:parquet|procureur\w*|ministere public)\b/.test(avant);
  const defense = /\b(?:defense|prevenu\w*|condamne\w*|accuse\w*|avocat\w*)\b/.test(avant);
  if (parquet === defense) return null;
  return parquet ? 'parquet' : 'défense';
}

/**
 * Faits procéduraux portés par des citations littérales vérifiées.
 * @param {string[]} citations
 * @param {{pubDate?:string|null}} [o]  date de PUBLICATION de l'article : référence des dates relatives, jamais une date d'événement
 * @returns {Array<{event_type:string, nature:'acte_procédural', mesure:string, realisation:'annoncée'|'réalisée', portee:'établissement', acteur:null,
 *                  event_date:string|null, event_period:string|null, libelle_public:string, evidence:string[]}>}
 */
export function detecterActesProcéduraux(citations, { pubDate = null, courant = null, memoire = [], etablissements = null } = {}) {
  const parMesure = new Map();
  // ARTICLE À PLUSIEURS ÉTABLISSEMENTS (BFMTV du 10/07/2026 : « … la relaxe de l'animateur de l'école Titon » dans un article sur Baudin) : une citation qui nomme un AUTRE établissement
  // de la commune sans nommer celui de l'affaire parle d'une autre procédure ; ses actes ne sont jamais attribués à cette affaire. Sans nom d'établissement, rien n'est écarté (doute = gardé).
  const propres = etablissements ? jetonsEtab(etablissements.propre || '') : [];
  const autres = etablissements ? (etablissements.autres || []).flatMap((e) => jetonsEtab(e)).filter((t) => !propres.includes(t)) : [];
  const parleDUneAutre = (c) => { const n = ` ${norm(c).replace(/[^a-z0-9]+/g, ' ')} `; return autres.some((t) => n.includes(` ${t} `)) && !propres.some((t) => n.includes(` ${t} `)); };
  const cites = (citations || []).map((c) => String(c || '').replace(/\s+/g, ' ').trim()).filter((c) => c.length >= 25 && !estPisteDeNavigation(c) && !parleDUneAutre(c));
  // Une présentation à un juge n'est combinée à « pas de mise en examen » que si AUCUNE citation n'affirme une mise en examen
  // (deux suspects, l'un mis en examen, l'autre non : jamais « présenté à un juge, qui ne l'a pas mis en examen »).
  const uneMiseEnExamen = cites.some((c) => actesDetail(c).affirmes.includes('MISE_EN_EXAMEN'));
  const presentation = !uneMiseEnExamen && cites.some((c) => presentationAffirmee(norm(c)));
  for (const c of cites) {
    const n = norm(c);
    // Un pourvoi en cassation n'est pas un appel : aucun libellé fermé ne le couvre.
    const d = actesDetail(c.replace(/\bse\s+pourvo\w*/gi, ' '));
    const trouves = [];   // [mesure, réalisation]
    // « pas de mise en examen » : lui-même un fait (avec ou sans présentation au juge, dite dans la même proposition de l'article).
    if (d.nies.includes('MISE_EN_EXAMEN') && !d.affirmes.includes('MISE_EN_EXAMEN')) trouves.push([presentation ? 'presentation_sans_mise_en_examen' : 'non_mise_en_examen', 'réalisée']);
    // appel : formé ou annoncé ; son auteur seulement s'il est écrit comme sujet.
    if (d.affirmes.includes('APPEL_FORME')) {
      const acteur = acteurAppel(n);
      const realisation = /\b(?:fera|feront|va faire|vont faire|compte faire|annonce\w* (?:qu'|son intention|faire)|envisage\w*)\b/.test(n) ? 'annoncée' : 'réalisée';
      trouves.push([acteur === 'parquet' ? 'appel_parquet' : acteur === 'défense' ? 'appel_défense' : 'appel', realisation]);
    }
    // garde à vue ET interpellation sont jugées chacune sur SES occurrences (« n'a pas été placé en garde à vue mais a été interpellé »).
    const gav = polarites(/\bgarde a vue\b/, n, 'INTERPELLATION').affirme && !GAV_TERMINEE.test(n);
    if (gav) trouves.push(['garde_a_vue', 'réalisée']);
    else if (polarites(/\binterpell\w*/, n, 'INTERPELLATION').affirme && (INTERP_PASSIF.test(n) || INTERP_ACTIF.test(n)) && !INTERP_CIVILE.test(n)) trouves.push(['interpellation', 'réalisée']);
    if (d.affirmes.includes('ECROU')) trouves.push(['detention_provisoire', 'réalisée']);
    if (d.affirmes.includes('REMISE_LIBERTE')) trouves.push([/\bcontrole judiciaire\b/.test(n) ? 'remise_en_liberte_controle' : 'remise_en_liberte', 'réalisée']);
    // audience annoncée : un renvoi ou une audience AVEC une marque d'avenir et aucun verdict dans la même citation.
    if (((d.affirmes.includes('RENVOI') || d.affirmes.includes('AUDIENCE')) && FUTUR_ACTE.test(n) || ANNONCE_AUDIENCE.test(n)) && !d.affirmes.some((a) => a.startsWith('VERDICT_'))) trouves.push(['audience_annoncee', 'annoncée']);
    for (const [mesure, realisation] of trouves) {
      // La date est celle qui est ÉCRITE À CÔTÉ de l'acte (même proposition, la plus proche), jamais la première date de la phrase :
      // « interpellé lundi … placé en détention provisoire ce mercredi » → mercredi ; « du 16 au 18 novembre » (plage d'un procès) ne date pas l'appel.
      const dt = dateProche(c, REGEX_MESURE[mesure], pubDate, { avenir: realisation === 'annoncée', jourComplet: mesure === 'audience_annoncee', attachee: mesure !== 'audience_annoncee' });
      let date = dt.date;
      // Une garde à vue dite dans une phrase de PRÉSENTATION n'est pas datée par cette phrase (le jour écrit est celui de la présentation).
      if ((mesure === 'garde_a_vue' || mesure === 'interpellation') && presentationAffirmee(n)) date = null;
      const libelle_public = libelleProcedural(mesure, realisation, date);
      if (!libelle_public) continue;
      const f = parMesure.get(mesure);
      if (!f) parMesure.set(mesure, { event_type: TYPE[mesure], nature: 'acte_procédural', mesure, realisation, portee: 'établissement', acteur: null, event_date: date, event_period: date ? dt.periode : null, libelle_public, evidence: [c] });
      else {
        if (realisation === 'annoncée') f.realisation = 'annoncée';
        f.event_date ||= date; f.event_period ||= dt.periode;
        if (f.evidence.length < 2) f.evidence.push(c);
      }
    }
  }
  // La présentation au juge « sans mise en examen » est datée par la citation qui DIT la présentation (souvent une autre phrase que le « pas de mise en examen »).
  const pres = parMesure.get('presentation_sans_mise_en_examen');
  if (pres && !pres.event_date) {
    for (const c of cites) {
      if (!presentationAffirmee(norm(c))) continue;
      const dt = dateProche(c, PRESENTATION_JUGE, pubDate);
      if (dt.date) { pres.event_date = dt.date; if (!pres.evidence.includes(c) && pres.evidence.length < 2) pres.evidence.push(c); }
      break;
    }
  }
  let faits = [...parMesure.values()];
  // Un acte plus précis remplace le plus général du même instant : UN fait, un seul libellé fermé (garde à vue ⊃ interpellation ; présentation sans mise en examen ⊃ « pas de mise en examen » ;
  // « un appel » ⊂ « le parquet / la défense a fait appel » ; remise en liberté ⊂ …sous contrôle judiciaire).
  if (parMesure.has('garde_a_vue')) faits = faits.filter((f) => f.mesure !== 'interpellation');
  if (parMesure.has('presentation_sans_mise_en_examen')) faits = faits.filter((f) => f.mesure !== 'non_mise_en_examen');
  if (parMesure.has('appel_parquet') || parMesure.has('appel_défense')) faits = faits.filter((f) => f.mesure !== 'appel');
  if (parMesure.has('remise_en_liberte_controle')) faits = faits.filter((f) => f.mesure !== 'remise_en_liberte');
  // Une audience n'est « annoncée » que datée EN JOUR COMPLET et à venir (≥ date de l'article) : « sera jugé » sans date, ou une date passée, n'annonce rien.
  faits = faits.filter((f) => f.mesure !== 'audience_annoncee' || (f.event_date && (!pubDate || f.event_date >= String(pubDate).slice(0, 10))));
  // Rappel par STADE : à un état déjà plus avancé (mise en examen, procès, condamnation…), une garde à vue ou une présentation au juge est l'histoire de l'affaire, pas son actualité.
  if (courant && STADE_BORNE[courant] !== undefined) faits = faits.filter((f) => (BORNE_MESURE[f.mesure] ?? Infinity) >= STADE_BORNE[courant]);
  // Fait déjà porté par la mémoire : une détention provisoire dite dans le libellé d'une mise en examen consignée n'est pas un second événement.
  faits = faits.filter((f) => !(f.mesure === 'detention_provisoire' && (memoire || []).some((e) => /detention provisoire|ecroue/.test(norm(e.libelle_public)) && (!f.event_date || !e.event_date || Math.abs(Date.parse(String(f.event_date).slice(0, 10)) - Date.parse(String(e.event_date).slice(0, 10))) <= 3 * 864e5))));
  return faits;
}
// Stade de l'état de la fiche (même échelle que routage-veille.STADE_ETAT) et stade MAXIMAL jusqu'auquel chaque acte reste une actualité.
const STADE_BORNE = { 'à qualifier': 0, plainte: 1, 'enquête': 2, 'mise en examen': 3, 'procès': 4, 'condamnation non définitive': 5, 'relaxe / non-lieu / classement': 5, 'condamnation définitive': 6 };
const BORNE_MESURE = { garde_a_vue: 2, interpellation: 2, presentation_sans_mise_en_examen: 2, non_mise_en_examen: 2, detention_provisoire: 4, remise_en_liberte: 4, remise_en_liberte_controle: 4, appel_parquet: 6, appel_défense: 6, appel: 6, audience_annoncee: 6 };
