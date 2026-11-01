// =====================================================================
// scripts/lib/fiche-composer.mjs — étape 3 : des éléments VÉRIFIÉS → un dossier de fiche (même forme que data/hub-matiere/*.json) + sa qualification.
//
// Aucune prose n'est générée ici : le dossier n'est fait que de phrases extraites ET vérifiées (fiche-extraction.mjs), d'un préfixe d'attribution
// quand il manque, et de lignes d'inconnue calculées. Un bloc sans matière reste vide. La qualification est déterministe :
//   BLOQUE               — ne peut pas être proposée (aucune source lue, état contredit ou non étayé, affaire sous HOLD…)
//   PAS_D_ENRICHISSEMENT — les sources lues n'ajoutent rien de sourcé à la carte (< 2 étapes datées/sourcées et aucune parole)
//   A_REVOIR             — proposable, avec des points d'attention majeurs signalés à l'humain
//   READY                — proposable sans réserve majeure (l'humain reste seul à décider)
// =====================================================================
import { createHash } from 'node:crypto';
import { quantites, nomsPresents, RE_NOMBRE_ENFANTS, RE_AGE_MIS_EN_CAUSE, RE_AGE_ENFANT, quantitesNonAttestees, issuesPortees } from './fiche-extraction.mjs';

const plat = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Mots significatifs d'une phrase : radicaux de 5 lettres (« déposée » ≈ « déposé »), sans l'attribution « Selon X, » (le média n'est pas le sujet du fait).
const jetons = (s) => new Set(plat(String(s).replace(/^(?:Mesure[^:]*:\s*)?(?:À venir : )?selon [^,]{1,60},\s*/i, '')).split(' ').filter((t) => t.length > 3).map((t) => t.slice(0, 5)));
const jaccard = (a, b) => { const A = jetons(a), B = jetons(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
/** La décision de remise en liberté (étape « decision ») qui corrige une phrase d'état parlant de détention, ou null. Pure : sert aussi à contrôler un dossier déjà généré. */
export function liberationPosterieure(phraseEtat, deroule) {
  if (!/détention|écrou|incarcér/i.test(phraseEtat)) return null;
  return (deroule || []).find((d) => d.type === 'decision' && /remise en liberté|remis(?:e)?\b[^.]{0,40}\ben liberté|libéré|libération/i.test(d.texte)) ?? null;
}
const MAJ = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// Minuscule initiale seulement si le premier mot est un mot courant : « Anne Hidalgo », « Ville de Paris », « Sénat » gardent leur majuscule.
const MOTS_COURANTS = new Set("le la les l un une des du de d deux trois quatre cinq six plusieurs ce cet cette ces il elle ils elles on selon après apres lors en dans pour avec sans aucun aucune certains certaines chaque tous toutes son sa ses leur leurs notamment puis ensuite depuis dès au aux à".split(' '));
const MIN = (s) => { const mot = (/^[\p{L}]+/u.exec(String(s ?? '')) || [''])[0].toLowerCase(); return s && MOTS_COURANTS.has(mot) ? s[0].toLowerCase() + s.slice(1) : s; };
/** « Selon X, Un … » (majuscule posée par le modèle après la virgule) → « Selon X, un … » ; les noms propres gardent la leur. */
const recaser = (s) => s.replace(/^(Selon [^,]{1,60}, )(\S[\s\S]*)$/, (_, a, b) => a + MIN(b));
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (iso) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso || ''); if (!m) return null; return `${m[3] ? `${Number(m[3])} ` : ''}${MOIS_FR[Number(m[2]) - 1]} ${m[1]}`; };

const RANG = { plainte: 1, 'enquête': 2, 'mise en examen': 3, 'procès': 4, 'condamnation non définitive': 5, 'condamnation définitive': 5, 'relaxe / non-lieu / classement': 5 };
const SUJET_INSTITUTIONNEL = /^(selon|d['’]après|le tribunal|la cour|le parquet|la procureure|le procureur|le rectorat|la rectrice|le recteur|l['’]académie|la mairie|le maire|la ville|le conseil|l['’]établissement|l['’]inspection|le ministère|le ministre|la ministre|la direction|le juge|la juge|les juges|le département|la préfecture|le préfet|la préfète|l['’]enseignement|la justice)\b/i;
// « le document indique que » n'est pas une attribution : on ne garde que le média. Un reproche fait à une institution (« n'a engagé aucune poursuite ») n'est jamais écrit comme un
// fait établi : il est TOUJOURS attribué au média, même quand le sujet est une institution.
const nettoyerDocument = (t) => String(t).replace(/^selon (?:le|ce) document,?\s*/i, '').replace(/\b(?:le|ce) document (?:indique|précise|rapporte|mentionne|fait état|évoque) que /gi, '').trim();
export const RE_REPROCHE_INSTITUTION = /\b(?:n['’](?:a|ont|avait|avaient)|ne)\s+(?:\w+\s+){0,3}(?:pas|aucun|aucune|jamais|rien)\b|\baucun(?:e)?\s+(?:signalement|poursuite|mesure|suite|action)\b|\bdéfaillances?\b/i;
export const attribue = (texte, media) => {
  const t = nettoyerDocument(texte);
  if (SUJET_INSTITUTIONNEL.test(t) && !(RE_REPROCHE_INSTITUTION.test(t) && !/^selon\b/i.test(t))) return recaser(t);
  return `Selon ${media}, ${MIN(t.replace(/^selon [^,]{1,60},\s*/i, ''))}`;
};
// Mesures qu'un même mot-clé désigne (lexique de mesures, pas d'affaire) : « mis à pied », « suspendu », « écarté » = la même mise à l'écart du poste.
const CLES_MESURE = [
  ['ecartement', /mis(?:e|es)? a pied|suspen[dsc]|ecarte|dispens(?:e|ee) de (?:se presenter|travail)|relev(?:e|ee) de ses fonctions/],
  ['licenciement', /licenci/], ['revocation', /revoqu/], ['mutation', /\bmute\b|mutation|change d ecole/],
  ['cellule_ecoute', /cellule d ecoute/], ['reunion_publique', /reunions? publiques?/], ['groupes_parole', /groupes? de parole/], ['partie_civile', /partie civile/],
];
const cleMesure = (t) => (CLES_MESURE.find(([, re]) => re.test(plat(t))) || [null])[0];
const TYPE_FR = { plainte: 'plainte', enquete: 'enquête', garde_a_vue: 'garde à vue', mise_en_examen: 'mise en examen', audience: 'audience', decision: 'décision', appel: 'appel', renvoi: 'renvoi', signalement: 'signalement' };
const SOURCE = (d) => ({ media: d.media, url: d.url, publie_le: d.publication_date ?? null, acces: 'libre' });
const TYPE_PAGE = { requisitions: 'audience' };
// Types « souples » : un même fait est volontiers étiqueté différemment d'un article à l'autre (interpellation = fait rapporté ou garde à vue ; signalement ou plainte). Le regroupement du
// modèle peut les réunir (sous garde) ; jamais une décision, une mise en examen, un appel, une audience ou une mesure avec autre chose.
const SOUPLES = ['garde_a_vue', 'plainte', 'signalement', 'enquete', 'communication_parquet', 'fait_rapporte', 'contexte']; // du plus spécifique au plus générique
const PROCEDURAL = new Set(['plainte', 'garde_a_vue', 'mise_en_examen', 'audience', 'decision', 'appel', 'renvoi']);
// Actes qui n'ont lieu qu'une fois dans une affaire : toutes les mentions d'un même type sont un seul fait (un désaccord de date est signalé, pas dupliqué).
const UNIQUES = new Set(['garde_a_vue', 'mise_en_examen', 'enquete', 'renvoi']);

/**
 * @param {{c:object, extractions:{doc:object, v:object}[], aujourdhui?:string, holds?:Set<string>}} o
 */
/**
 * Une régénération ne remplace jamais une issue judiciaire établie par une version qui l'a perdue (ou contredite) sans raison.
 * La disparition est JUSTIFIÉE si aucune source qui portait l'issue n'est plus retenue comme « cette affaire » ; sinon c'est de la variance du modèle : on garde la version précédente.
 * @param {{trace?:object[], sources?:object[]}} precedente  generation précédente
 * @param {{trace?:object[], sources?:object[]}} nouvelle    generation qui la remplacerait
 * @returns {null|{avant:string, apres:string|null}} null = rien à signaler
 */
export function regressionJudiciaire(precedente, nouvelle) {
  const issue = (g) => (g?.trace || []).find((t) => t.ref === 'issue_judiciaire');
  const avant = issue(precedente);
  if (!avant) return null;
  const apres = issue(nouvelle);
  const famille = (t) => (/^condamnation/.test(t.texte) ? 'condamnation' : 'favorable');
  if (apres && famille(apres) === famille(avant)) return null;
  const pertinentes = new Set((nouvelle?.sources || []).filter((s) => s.pertinence === 'CETTE_AFFAIRE').map((s) => s.url));
  const encore = (avant.preuves || []).some((p) => pertinentes.has(p.url));
  return encore ? { avant: avant.texte, apres: apres?.texte ?? null } : null;
}

/** Les événements bruts, dans l'ordre où la composition les voit (ce que le regroupement du modèle indexe). */
export const evenementsBruts = (extractions) => extractions.filter((x) => x.doc.acces === 'libre' && x.v.pertinence === 'CETTE_AFFAIRE').flatMap((x) => x.v.evenements.map((e) => ({ ...e, doc: x.doc })));

export function composer({ c, extractions, aujourdhui = new Date().toISOString().slice(0, 10), holds = new Set(), fusionsModele = [] }) {
  const blocages = [], attention = [], ecartesComposition = [];
  const bloque = (code, texte) => blocages.push({ code, texte });
  const signale = (niveau, code, texte) => attention.push({ niveau, code, texte });

  const lues = extractions.filter((x) => x.doc.acces === 'libre');
  const pertinentes = lues.filter((x) => x.v.pertinence === 'CETTE_AFFAIRE');
  for (const x of lues) {
    if (x.v.pertinence === 'AFFAIRE_SOEUR') signale('mineur', 'DOC_AFFAIRE_SOEUR', `${x.doc.media} (${x.doc.url}) concerne une affaire sœur, non utilisée.`);
    // Une page trouvée par la recherche et écartée avant lecture (elle ne nomme ni la structure ni la commune) est du bruit de recherche, pas une ambiguïté.
    // Une page de la MÉMOIRE de l'affaire que l'on ne sait pas rattacher est, elle, un point majeur ; une page découverte et ambiguë, un point mineur.
    if (x.v.pertinence === 'AMBIGU' && !x.doc.ecarte) signale(x.doc.origine === 'memoire' ? 'majeur' : 'mineur', 'DOC_IDENTITE_AMBIGUE', `${x.doc.media} (${x.doc.url}) : rattachement à l'affaire non établi (${x.v.pertinence_raison || 'sans raison'}), non utilisé.`);
  }
  const inaccessibles = extractions.filter((x) => x.doc.acces !== 'libre' && x.doc.origine === 'memoire');
  if (holds.has(c.case_id)) bloque('HOLD', 'L’affaire est sous HOLD : jamais de fiche.');
  if (!pertinentes.length) bloque('AUCUNE_SOURCE_LISIBLE_ET_PERTINENTE', lues.length ? 'Les sources lues ne se rattachent pas de façon établie à cette affaire.' : 'Aucune source n’a pu être lue (accès refusé ou corps non reconnu) : rien ne peut être extrait, rien n’est inventé.');
  if (inaccessibles.length) signale(pertinentes.length ? 'mineur' : 'majeur', 'SOURCES_MEMOIRE_INACCESSIBLES', `${inaccessibles.length} source(s) de la mémoire n’ont pu être lues (${[...new Set(inaccessibles.map((x) => x.doc.motif))].join(' ; ')}) : leur contenu n’est pas pris en compte.`);

  // ---- événements : un fait = une entrée, corroborée par les autres sources ----------------------------------
  const brut = evenementsBruts(extractions);
  brut.forEach((e, i) => { e._i = i; });
  const groupeModele = new Map();
  fusionsModele.forEach((grp, gi) => grp.forEach((i) => groupeModele.set(i, gi)));
  const groupes = [];
  for (const e of brut) {
    // Même acte procédural, même jour écrit = un seul fait (l'extraction regroupe le dispositif complet d'une décision en une phrase).
    // Sans jour commun : même type, textes proches, mois compatibles.
    const type = TYPE_PAGE[e.type] ?? e.type;
    // Une même mesure rapportée par deux médias sous deux étiquettes (établissement / État / collectivité) est un seul fait.
    const famille = (t) => (/^mesure_/.test(t) ? 'mesure' : t);
    // Même mesure nommée par le même mot-clé (« mis à pied » / « suspendu »), même état de réalisation (annoncée ≠ mise en œuvre : deux faits), dates compatibles.
    const datesCompatibles = (a, b) => !a || !b || a === b || a.slice(0, 7) === b.slice(0, 7);
    // Même fait selon le regroupement du modèle, APPLIQUÉ SOUS GARDES : même type, dates compatibles, chiffres non contradictoires (annonce ≠ réalisation est déjà exigé plus bas).
    const memeSelonModele = (g) => {
      const k = groupeModele.get(e._i);
      if (k === undefined || !g.membres.some((m) => groupeModele.get(m._i) === k)) return false;
      const qa = [...quantites(e.texte)].sort().join(), qb = [...quantites(g.rep.texte)].sort().join();
      return datesCompatibles(g.rep.date, e.date) && (!qa || !qb || qa === qb);
    };
    const memeMesure = (g) => famille(type) === 'mesure' && cleMesure(e.texte) && cleMesure(e.texte) === cleMesure(g.rep.texte) && g.membres.every((m) => m.realisation === e.realisation) && datesCompatibles(g.rep.date, e.date);
    // Le MEILLEUR groupe compatible (pas le premier) : un événement ne se range pas sous un autre fait simplement parce qu'il est arrivé après lui.
    // Une mesure ANNONCÉE et sa MISE EN ŒUVRE sont deux faits : aucune règle de fusion ne les rapproche.
    const g = groupes.filter((g) => (famille(g.type) === famille(type) || (SOUPLES.includes(g.type) && SOUPLES.includes(type) && memeSelonModele(g))) && (famille(type) !== 'mesure' || g.membres.every((m) => m.realisation === e.realisation)) && (
      UNIQUES.has(type) || memeMesure(g) || memeSelonModele(g) ||
      // Un événement sans date écrite se range sous un événement daté du même type dès qu'ils partagent un peu de vocabulaire.
      // (seuil plus haut pour les mesures : deux mesures distinctes d'un même article partagent vite des mots)
      ((!e.date || !g.rep.date) && jaccard(g.rep.texte, e.texte) >= (famille(type) === 'mesure' ? 0.22 : 0.15)) ||
      (PROCEDURAL.has(type) && e.date_nature === 'evenement' && g.membres.some((m) => m.date_nature === 'evenement' && m.date === e.date)) ||
      (jaccard(g.rep.texte, e.texte) >= 0.34 && (!g.rep.date || !e.date || g.rep.date === e.date || g.rep.date.slice(0, 7) === e.date.slice(0, 7))))).sort((x, y) => jaccard(y.rep.texte, e.texte) - jaccard(x.rep.texte, e.texte))[0];
    if (g) { g.membres.push(e); if (SOUPLES.includes(g.type) && SOUPLES.includes(type) && SOUPLES.indexOf(type) < SOUPLES.indexOf(g.type)) g.type = type; }
    else groupes.push({ type: TYPE_PAGE[e.type] ?? e.type, rep: e, membres: [e] });
  }
  const deroule = [];
  const contradictions = [];
  for (const g of groupes) {
    // Représentant : l'entrée DATÉE avec date attestée ; à défaut la plus ancienne publication.
    // Représentant : date écrite d'abord, puis la phrase la plus complète, puis la plus ancienne parution.
    const ordre = [...g.membres].sort((a, b) => (b.date_nature === 'evenement') - (a.date_nature === 'evenement') || b.texte.length - a.texte.length || String(a.doc.publication_date).localeCompare(String(b.doc.publication_date)));
    const e = ordre[0];
    // « mars 2019 » et « 14 mars 2019 » ne divergent pas : une date moins précise qui contient la date plus précise est compatible avec elle.
    const toutes = new Set(g.membres.filter((m) => m.date).map((m) => m.date));
    const autresDates = new Set([...toutes].filter((d) => ![...toutes].some((o) => o.length > d.length && o.startsWith(d))));
    // Jours différents d'un même mois (informations concordantes par ailleurs) : la date est affichée au MOIS, plus fidèle qu'un jour choisi entre deux sources ; ni contradiction ni jour inventé.
    const memeMois = autresDates.size > 1 && [...autresDates].every((d) => d.length === 10 && d.slice(0, 7) === [...autresDates][0].slice(0, 7));
    const dateFinale = memeMois ? [...autresDates][0].slice(0, 7) : e.date, natureFinale = memeMois ? 'approximative' : e.date_nature;
    if (memeMois) signale('mineur', 'DATE_AU_MOIS', `${TYPE_FR[g.type] ?? g.type} : jours divergents selon les sources (${[...autresDates].map(dateFr).join(' / ')}) : date affichée au mois.`);
    else if (autresDates.size > 1) contradictions.push(`${TYPE_FR[g.type] ?? g.type} : dates divergentes selon les sources (${[...autresDates].map(dateFr).join(' / ')})`);
    // Quantités divergentes entre sources pour un même fait (peine : « un an avec sursis » / « trois ans ferme »).
    const divergent = g.membres.length > 1 && g.membres.some((m) => quantitesNonAttestees(e.texte, m.citation).length && quantitesNonAttestees(m.texte, e.citation).length);
    if (divergent) contradictions.push(`${TYPE_FR[g.type] ?? g.type} : chiffres divergents selon les sources (${g.membres.map((m) => `${m.doc.media} : « ${m.texte.slice(0, 120)} »`).join(' ; ')})`);
    let texte = attribue(e.texte, e.doc.media);
    if (/^mesure_/.test(g.type) && g.membres.every((m) => m.realisation === 'annoncee')) texte = `Mesure annoncée, sans confirmation de sa réalisation dans les sources lues : ${MIN(texte)}`;
    if (/^(audience|renvoi)$/.test(g.type) && e.date && e.date > aujourdhui) texte = `À venir : ${MIN(texte)}`;
    const corrobore = ordre.slice(1).filter((m) => m.doc.url !== e.doc.url).map((m) => SOURCE(m.doc));
    deroule.push({ date: dateFinale, date_nature: natureFinale, type: g.type, acteur: e.acteur, texte, source: SOURCE(e.doc), ...(corrobore.length ? { sources_complementaires: corrobore.filter((s, i, a) => a.findIndex((t) => t.url === s.url) === i) } : {}),
      _tri: dateFinale || e.doc.publication_date || '', _preuves: g.membres.map((m) => ({ url: m.doc.url, media: m.doc.media, citation: m.citation })) });
  }
  // Chronologie : date de l'événement, à défaut date de parution ; à égalité l'ordre procédural.
  const ORDRE_TYPE = ['fait_rapporte', 'signalement', 'plainte', 'enquete', 'garde_a_vue', 'mise_en_examen', 'mesure_etablissement', 'mesure_collectivite', 'mesure_etat', 'communication_parquet', 'renvoi', 'audience', 'decision', 'appel', 'contexte'];
  deroule.sort((a, b) => a._tri.localeCompare(b._tri) || ORDRE_TYPE.indexOf(a.type) - ORDRE_TYPE.indexOf(b.type));

  // ---- issue judiciaire et état -----------------------------------------------------------------------------
  const issues = pertinentes.filter((x) => x.v.issue).map((x) => ({ ...x.v.issue, doc: x.doc }));
  const natures = new Set(issues.map((i) => (i.nature === 'condamnation' ? 'condamnation' : ['relaxe', 'non_lieu', 'classement', 'acquittement'].includes(i.nature) ? 'relaxe' : i.nature)));
  let issue = null;
  if (issues.length) {
    const datees = issues.filter((i) => i.date);
    if (natures.size > 1) {
      const tri = [...datees].sort((a, b) => b.date.localeCompare(a.date));
      if (datees.length === issues.length && tri[0].date !== tri[tri.length - 1].date) { issue = tri[0]; signale('majeur', 'EVOLUTION_JUDICIAIRE', `Décisions successives rapportées (${tri.map((i) => `${dateFr(i.date)} : ${i.nature}`).join(' → ')}) : la plus récente est retenue ; à vérifier (appel ?).`); }
      else bloque('STATUT_CONTRADICTOIRE', `Les sources rapportent des issues contraires sans pouvoir les ordonner dans le temps : ${issues.map((i) => `${i.doc.media} : ${i.nature}`).join(' ; ')}.`);
    } else {
      // Même nature : la plus datée ; l'appel OUI ou la finalité OUI d'une seule source suffit (acte écrit), sauf contradiction.
      issue = [...issues].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      const ap = issues.find((i) => i.appel === 'OUI'), df = issues.find((i) => i.definitive === 'OUI');
      issue = { ...issue, appel: ap ? 'OUI' : 'INCONNU', definitive: df && !ap ? 'OUI' : 'INCONNU', citation_appel: ap?.citation_appel ?? null, citation_definitive: df?.citation_definitive ?? null };
      if (ap && df) bloque('STATUT_CONTRADICTOIRE', 'Une source rapporte un appel, une autre une décision définitive : à trancher par un humain.');
    }
  }
  let etatSources = null;
  if (issue) {
    etatSources = issue.nature === 'condamnation' ? (issue.definitive === 'OUI' ? 'condamnation définitive' : 'condamnation non définitive') : ['relaxe', 'non_lieu', 'classement', 'acquittement'].includes(issue.nature) ? 'relaxe / non-lieu / classement' : null;
  } else {
    // L'ÉTAT judiciaire ne vient que d'actes judiciaires : une enquête purement administrative (inspection, enquête interne de la Ville ou du rectorat) n'est pas une « enquête » au sens de l'état.
    const JUDICIAIRE = /parquet|procureur|police|gendarm|brigade|juge d['’]instruction|information judiciaire|enquête (?:préliminaire|pénale|judiciaire)|enquêteurs/i;
    const ADMINISTRATIVE = /administrative|inspection|enquête interne|disciplinaire/i;
    const enqueteJudiciaire = deroule.some((d) => d.type === 'enquete' && !(ADMINISTRATIVE.test(d.texte) && !JUDICIAIRE.test(d.texte)));
    const types = new Set(deroule.map((d) => d.type));
    // « Procès » = une audience de JUGEMENT tenue (tribunal correctionnel, assises…), pas une audience de remise en liberté ou de chambre de l'instruction.
    const JUGEMENT = /tribunal correctionnel|tribunal pour enfants|cour d['’]assises|cour criminelle|jugé|jugée|comparu|procès|à la barre|audience de jugement/i;
    const DETENTION = /remise en liberté|détention|chambre de l['’]instruction|contrôle judiciaire|libertés et de la détention|demande de mise en liberté/i;
    const procesTenu = deroule.some((d) => d.type === 'audience' && d.date && d.date <= aujourdhui && JUGEMENT.test(d.texte) && !DETENTION.test(d.texte));
    etatSources = procesTenu ? 'procès' : types.has('mise_en_examen') ? 'mise en examen' : enqueteJudiciaire || types.has('garde_a_vue') ? 'enquête' : types.has('plainte') ? 'plainte' : null;
  }
  const carte = c.statut_judiciaire;
  let propositionEtat = null;
  if (pertinentes.length && !blocages.some((b) => b.code === 'STATUT_CONTRADICTOIRE')) {
    if (/^relaxe/.test(carte) && etatSources !== 'relaxe / non-lieu / classement') bloque('ETAT_NON_ETAYE', `La carte affiche « ${carte} » mais aucune décision de relaxe, non-lieu ou classement n’est lue dans les sources : doctrine R5, jamais sans preuve.`);
    else if (/^condamnation définitive/.test(carte) && etatSources !== 'condamnation définitive') bloque('ETAT_NON_ETAYE', 'La carte affiche une condamnation définitive que aucune source lue n’établit explicitement (une absence d’appel ne rend rien définitif).');
    else if (etatSources && etatSources !== carte) {
      const [r1, r2] = [RANG[etatSources], RANG[carte]];
      if (r1 > r2 || (r1 === r2)) { propositionEtat = { de: carte, vers: etatSources, preuve: issue ? { url: issue.doc.url, media: issue.doc.media, citation: issue.citation } : null }; bloque('ETAT_CARTE_PERIME_OU_CONTREDIT', `Les sources lues établissent « ${etatSources} » alors que la carte affiche « ${carte} » : à traiter d’abord par la Maintenance (état), pas par la fiche.`); }
      else if (r2 >= 3) bloque('ETAT_NON_ETAYE', `La carte affiche « ${carte} » ; les sources lues n’établissent que « ${etatSources} ».`);
      else signale('majeur', 'ETAT_PLUS_HAUT_QUE_LES_SOURCES', `La carte affiche « ${carte} » ; les sources lues n’établissent que « ${etatSources} ».`);
    } else if (!etatSources && RANG[carte] >= 3) bloque('ETAT_NON_ETAYE', `La carte affiche « ${carte} » ; aucune source lue ne l’établit.`);
    else if (!etatSources) signale('majeur', 'ETAT_NON_ETAYE_PAR_LES_SOURCES', `La carte affiche « ${carte} » ; aucune source lue n’établit un acte judiciaire (plainte, garde à vue, enquête du parquet) : la fiche ne porte pas de bloc de situation.`);
  }

  // ---- blocs --------------------------------------------------------------------------------------------------
  const NATURE_STEM = { condamnation: 'condamnation', relaxe: 'relaxe', non_lieu: 'non_lieu', classement: 'classement', acquittement: 'acquittement' };
  let decisionEvt = issue && (deroule.find((d) => d.type === 'decision' && (!issue.date || d.date === issue.date) && issuesPortees(d.texte).includes(NATURE_STEM[issue.nature]))
    ?? deroule.find((d) => d.type === 'decision' && issuesPortees(d.texte).includes(NATURE_STEM[issue.nature])));
  // Une issue établie mais sans étape « décision » dans le déroulé (le modèle n'a rendu que l'issue) : la chronologie la porte quand même, en phrase STRUCTURÉE (nature + date écrite).
  if (issue && !decisionEvt) {
    const NOM = { condamnation: 'une condamnation', relaxe: 'une relaxe', non_lieu: 'un non-lieu', classement: 'un classement sans suite', acquittement: 'un acquittement' };
    decisionEvt = { date: issue.date, date_nature: issue.date_nature, type: 'decision', acteur: null, source: SOURCE(issue.doc), _tri: issue.date || issue.doc.publication_date || '',
      texte: `Selon ${issue.doc.media}, ${NOM[issue.nature]} est rapporté${issue.nature === 'condamnation' || issue.nature === 'relaxe' ? 'e' : ''}${issue.date && issue.date_nature === 'evenement' ? ` (décision du ${dateFr(issue.date)})` : ''}.`,
      _preuves: [{ url: issue.doc.url, media: issue.doc.media, citation: issue.citation }] };
    deroule.push(decisionEvt);
    deroule.sort((a, b) => a._tri.localeCompare(b._tri) || ORDRE_TYPE.indexOf(a.type) - ORDRE_TYPE.indexOf(b.type));
  }
  // Un appel ANNONCÉ (« l'avocat a annoncé qu'il ferait appel ») n'est pas un appel interjeté : la fiche le dit sans l'affirmer, et ne prétend pas « aucun appel rapporté ».
  const appelAnnonce = issue && issue.appel !== 'OUI' ? deroule.find((d) => d.type === 'appel') : null;
  const etat_actuel = [];
  let liberation = null;
  if (issue) {
    // Sans phrase de décision extraite : phrase STRUCTURÉE (nature + date écrite), jamais la citation brute (elle peut contenir un âge, un nom, un nombre d'enfants).
    const NOM_ISSUE = { condamnation: 'une condamnation', relaxe: 'une relaxe', non_lieu: 'un non-lieu', classement: 'un classement sans suite', acquittement: 'un acquittement' };
    const phrase = decisionEvt?.texte ?? `Selon ${issue.doc.media}, ${NOM_ISSUE[issue.nature]} est rapporté${issue.nature === 'condamnation' || issue.nature === 'relaxe' ? 'e' : ''}${issue.date && issue.date_nature === 'evenement' ? ` (décision du ${dateFr(issue.date)})` : ''}.`;
    if (phrase) etat_actuel.push(phrase);
    else signale('majeur', 'DECISION_NON_RESTITUABLE', 'La décision est établie mais sa formulation source contient un nom ou un nombre d’enfants : phrase à rédiger par un humain.');
    etat_actuel.push(issue.appel === 'OUI'
      ? `Un appel est rapporté (${issue.doc.media}) : la décision n’est pas définitive.`
      : appelAnnonce ? `Un appel est annoncé (${appelAnnonce.source.media}) : son dépôt effectif n’est pas confirmé dans les sources lues ; appel formé et caractère définitif non documentés.`
      : issue.definitive === 'OUI' ? 'Une source indique que la décision est devenue définitive.'
        : issue.nature === 'condamnation' ? 'Appel et caractère définitif non documentés : aucun des articles consultés ne dit si la décision a été contestée ni si elle est définitive.'
          : 'Aucun des articles consultés ne mentionne de recours ni de nouvelle décision après celle-ci.');
  } else if (deroule.length) {
    // La phrase d'état est celle de l'étape qui FAIT l'état (mise en examen, enquête, plainte, procès), pas la dernière mentionnée.
    const TYPE_ETAT = { 'procès': 'audience', 'mise en examen': 'mise_en_examen', 'enquête': 'enquete', plainte: 'plainte' }[etatSources];
    const dernier = [...deroule].reverse().find((d) => d.type === TYPE_ETAT) ?? [...deroule].reverse().find((d) => ['mise_en_examen', 'enquete', 'plainte', 'garde_a_vue', 'audience', 'renvoi'].includes(d.type));
    if (dernier) etat_actuel.push(dernier.texte);
    // Une phrase d'état qui parle de détention (« écroué », « placée en détention provisoire ») ne doit pas rester seule quand une décision de remise en liberté est rapportée : l'état n'est plus celui de la phrase.
    liberation = dernier ? liberationPosterieure(dernier.texte, deroule) : null;
    if (liberation) etat_actuel.push(`Évolution rapportée : ${liberation.texte}`);
  }
  // ---- synthèse visuelle (composants existants de FicheUnique : `dossier.situation`, comme les pilotes) ---------------------------------
  // Tout vient de données déjà vérifiées : nature de l'issue ou état, date écrite, autorité qui agit, appel/finalité, mesures du déroulé.
  // Couleur = nature de l'information (mêmes règles que statutCat du site), jamais une appréciation de culpabilité. Rien n'est inventé : pas d'état établi → pas de bloc.
  let situation;
  if (etatSources && etat_actuel.length) {
    const CAT = { 'condamnation non définitive': 'red', 'condamnation définitive': 'red', 'mise en examen': 'blue', 'enquête': 'blue', 'procès': 'blue', plainte: 'orange', 'relaxe / non-lieu / classement': 'green' };
    const NOM_ISSUE_TITRE = { condamnation: 'Condamnation', relaxe: 'Relaxe', non_lieu: 'Non-lieu', classement: 'Classement sans suite', acquittement: 'Acquittement' };
    const NOM_ETAT_TITRE = { 'mise en examen': 'Mise en examen', 'enquête': 'Enquête', plainte: 'Plainte', 'procès': 'Audience tenue' };
    const TYPE_DE_L_ETAT = { 'procès': 'audience', 'mise en examen': 'mise_en_examen', 'enquête': 'enquete', plainte: 'plainte' }[etatSources];
    const evtEtat = issue ? decisionEvt : [...deroule].reverse().find((d) => d.type === TYPE_DE_L_ETAT);
    const dateDe = (nature, date) => (!date ? null : nature === 'evenement' ? dateFr(date) : nature === 'approximative' ? `vers ${dateFr(date)}` : null);
    const typeEtat = issue ? 'decision' : TYPE_DE_L_ETAT;
    const divergente = contradictions.some((x) => x.startsWith(TYPE_FR[typeEtat] ?? typeEtat));
    const quand = divergente ? null : issue ? dateDe(issue.date_nature, issue.date) : dateDe(evtEtat?.date_nature, evtEtat?.date);
    const meta = [quand, evtEtat?.acteur ? MAJ(evtEtat.acteur) : null].filter(Boolean).join(' · ');
    const mesures = deroule.filter((d) => /^mesure_/.test(d.type)).slice(0, 2)
      .map((d) => (/^Mesure annoncée/.test(d.texte) ? d.texte : `Mesure institutionnelle (distincte de la décision judiciaire) : ${MIN(d.texte)}`));
    const futureAudience = !issue && deroule.find((d) => d.type === 'audience' && d.date && d.date > aujourdhui);
    const suite = issue
      ? (issue.appel === 'OUI' ? { label: 'Suite · recours', titre: 'Appel rapporté', meta: `selon ${issue.doc.media}`, cat: 'orange', lignes: ['Décision non définitive.'] }
        : appelAnnonce ? { label: 'Suite · recours', titre: 'Appel annoncé', meta: `selon ${appelAnnonce.source.media}`, cat: 'orange', lignes: [etat_actuel[1]] }
        : issue.definitive === 'OUI' ? { label: 'Suite · recours', titre: 'Décision devenue définitive', meta: `selon ${issue.doc.media}`, cat: 'blue', lignes: [] }
          : { label: 'Suite · recours', titre: 'Aucun appel rapporté', meta: 'dans les sources consultées', cat: 'blue', lignes: [etat_actuel[1]].filter(Boolean) })
      : futureAudience ? { label: 'Prochaine étape', titre: `Audience le ${dateFr(futureAudience.date)}`, meta: 'à venir · le procès n’a pas eu lieu', cat: 'blue', lignes: ['La personne mise en cause est présumée innocente.'] }
        : { label: 'Suite', titre: 'Issue de la procédure à documenter', meta: 'dans les sources consultées', cat: 'blue', lignes: ['La personne mise en cause est présumée innocente.'] };
    suite.lignes = [...(liberation ? [`Évolution rapportée : ${liberation.texte}`] : []), ...suite.lignes, ...mesures];
    if (!suite.lignes.length) delete suite.lignes;
    situation = { decision: { label: issue ? 'Décision' : 'Situation judiciaire', titre: issue ? NOM_ISSUE_TITRE[issue.nature] : NOM_ETAT_TITRE[etatSources], ...(meta ? { meta } : {}), cat: CAT[etatSources], texte: etat_actuel[0] }, suite };
  }
  const faits = [];
  for (const x of [...pertinentes].sort((a, b) => b.v.faits.length - a.v.faits.length)) for (const f of x.v.faits) if (faits.length < 2 && !faits.some((t) => jaccard(t.texte, f.texte) > 0.4)) faits.push({ texte: attribue(f.texte, x.doc.media) });
  const reactions = [];
  for (const x of pertinentes) for (const d of x.v.declarations) {
    if (reactions.some((r) => jaccard(r.citations[0].texte, d.citation) > 0.6)) continue;
    // Une déclaration qui ne fait que répéter une étape du déroulé n'apporte pas de parole : elle est écartée. Deux déclarations par acteur au plus.
    if (deroule.some((e) => jaccard(e.texte, d.citation) >= 0.5)) { ecartesComposition.push({ element: 'declaration', raison: 'DECLARATION_REDONDANTE_AVEC_LE_DEROULE', source: x.doc.url }); continue; }
    if (reactions.length >= 8) { ecartesComposition.push({ element: 'declaration', raison: 'PLAFOND_DE_REACTIONS', source: x.doc.url }); continue; }
    if (reactions.filter((r) => plat(r.acteur) === plat(d.acteur)).length >= 2) { ecartesComposition.push({ element: 'declaration', raison: 'ACTEUR_DEJA_REPRESENTE', source: x.doc.url }); continue; }
    reactions.push({ ...(d.contexte ? { paraphrase: `Contexte dans l’article (${x.doc.media}) : ${d.contexte}` } : {}), acteur: d.acteur, qualite: `propos rapportés par ${x.doc.media}`, date: x.doc.publication_date, date_nature: 'article', portee: 'affaire', attribution: 'POSITION_ATTRIBUEE', a_propos: d.a_propos,
      citations: [{ texte: d.citation, pour: d.a_propos ?? 'à propos de l’affaire' }], etabli: `Établi : propos rapportés par ${x.doc.media}. Une prise de parole n’établit pas son contenu.`, source: SOURCE(x.doc), validation: 'POSITION_ATTRIBUEE' });
  }

  // ---- inconnues : calculées, jamais rédigées pour remplir ---------------------------------------------------------
  const inconnues = [];
  if (appelAnnonce && issue.definitive !== 'OUI') inconnues.push(`Appel : annoncé (${appelAnnonce.source.media}) ; dépôt effectif et suites non confirmés dans les sources lues.`);
  else if (issue && issue.appel !== 'OUI' && issue.definitive !== 'OUI') inconnues.push(issue.nature === 'condamnation' ? 'Appel et caractère définitif : aucun article consulté ne dit si la décision a été contestée ni si elle est définitive.' : 'Recours éventuels : aucun article consulté n’en mentionne ; la suite de la procédure est inconnue.');
  // Une condamnation / un classement déjà sourcé dans la chronologie ne s'écrit pas « aucune décision rapportée » : on dit que l'issue est à documenter.
  const decisionSourcee = deroule.find((d) => d.type === 'decision' && /class[ée]e? sans suite|non-lieu|relax[ée]|acquitt[ée]|condamn[ée]/i.test(d.texte));
  if (!issue && pertinentes.length && RANG[carte] >= 3) inconnues.push(decisionSourcee ? 'Issue de la procédure à documenter : la chronologie rapporte une décision que les sources lues ne permettent pas d’établir plus précisément (nature, appel, caractère définitif).' : 'Aucun jugement sur le fond n’est rapporté par les sources lues : la suite de la procédure est inconnue.');
  if (pertinentes.length && !deroule.some((d) => /^mesure_/.test(d.type))) inconnues.push('Mesures prises par l’établissement ou les autorités (suspension, procédure disciplinaire, accompagnement des familles) : non documentées dans les sources lues.');
  // Les lacunes que déclarent les articles (« une 7e plainte pourrait être déposée… ») sont datées par nature : conservées dans la trace, pas publiées comme inconnues durables.
  for (const cc of contradictions) inconnues.push(`Divergence entre sources — ${cc}.`);
  // Seules comptent les sources qui ont APPORTÉ quelque chose à la fiche : une page jugée pertinente mais sans aucun élément retenu (palmarès, page de série) n'est pas un « article lu » de ce dossier.
  const contribuent = pertinentes.filter((x) => x.v.evenements.length || x.v.faits.length || x.v.declarations.length || x.v.issue);
  const mediasLus = [...new Set(contribuent.map((x) => x.doc.media))];
  if (contribuent.length) inconnues.push(`Le dossier ne repose que sur ${contribuent.length} article${contribuent.length > 1 ? 's' : ''} lu${contribuent.length > 1 ? 's' : ''} (${mediasLus.join(', ')}).`);
  if (contradictions.length) signale('majeur', 'DIVERGENCE_ENTRE_SOURCES', contradictions.join(' | '));
  if (deroule.some((d) => d.date && d.date > aujourdhui)) signale('mineur', 'ECHEANCE_A_VENIR', `Échéance à venir : ${deroule.filter((d) => d.date > aujourdhui).map((d) => `${dateFr(d.date)} (${d.type})`).join(', ')} : à mettre à jour après la date.`);
  if (reactions.length) signale('mineur', 'CITATIONS_A_RELIRE', 'Les citations sont reproduites telles que publiées : à relire sous l’angle de la protection des enfants et des familles.');
  // Une issue FAVORABLE (relaxe, non-lieu, classement, acquittement) établie par une seule source n'est jamais READY (doctrine R5 : jamais sans preuve).
  if (issue && issue.nature !== 'condamnation' && new Set(pertinentes.filter((x) => x.v.issue && x.v.issue.nature === issue.nature).map((x) => x.doc.media)).size < 2) signale('majeur', 'ISSUE_FAVORABLE_SOURCE_UNIQUE', `L’issue « ${issue.nature} » ne repose que sur ${issue.doc.media} : à confirmer par une seconde source ou par l’autorité qui l’a rendue.`);
  // La chronologie rapporte un verdict ou un classement que la synthèse n'établit pas (le modèle l'a rangé en événement sans renseigner l'issue) : « Aucune décision rendue » ne doit pas voisiner avec « classée sans suite ».
  const verdict = !issue && deroule.find((d) => d.type === 'decision' && /class[ée]e? sans suite|non-lieu|relax[ée]|acquitt[ée]|condamn[ée]/i.test(d.texte));
  if (verdict) signale('majeur', 'DECISION_SANS_ISSUE_ETABLIE', `La chronologie rapporte une décision de fond (« ${verdict.texte.slice(0, 120)} ») que la synthèse n'établit pas : à vérifier avant toute proposition.`);
  if (contribuent.length === 1) signale('mineur', 'SOURCE_UNIQUE', 'Le dossier repose sur un seul article lu.');
  const partielles = deroule.filter((d) => d.date_nature === 'article').length;
  if (partielles) signale('mineur', 'DATES_NON_ECRITES', `${partielles} étape(s) sans date d’événement écrite dans la source : affichées avec la date de parution.`);

  // Une FONCTION UNIQUE au sein d'un établissement (« le chef des animateurs », « le directeur ») rattachée à une accusation ou à une mesure disciplinaire identifie
  // la personne sans la nommer : pas un blocage (une direction peut aussi agir ou parler), mais jamais READY sans regard humain.
  // Fonctions nommées SANS déterminant aussi (« devenu proviseur », « ancien censeur », « ex-directeur ») : le déterminant n'est pas ce qui identifie.
  const FONCTION_UNIQUE = /\b(?:(?:le|la|l['’])\s*(?:chef|responsable)|(?:chef des|responsable éducatif|responsable du périscolaire)|directeur|directrice|proviseure?|proviseur adjoint|principale?|censeur|gardien(?:ne)?|surveillant(?:e)?(?: général(?:e)?)?|infirmier|infirmière|bibliothécaire|aumônier|maître d['’]internat|économe)\b/i;
  const ACCUSATION = /\b(?:plainte|violences?|agressions?|viols?|suspendu|suspendue|mis(?:e)? en examen|garde à vue|interpell|mis(?:e)? à pied|licenci|écart|retrait|révoqu)/i;
  const identifies = [...deroule.map((e) => e.texte), faits.map((f) => f.texte).join(' ')].filter((t) => FONCTION_UNIQUE.test(t) && ACCUSATION.test(t));
  if (identifies.length) signale('majeur', 'FONCTION_IDENTIFIANTE', `${identifies.length} ligne(s) rattachent une accusation ou une mesure à une fonction unique de l’établissement (ex. « ${(identifies[0].match(FONCTION_UNIQUE) || [''])[0]} … ») : à vérifier — elle peut identifier la personne mise en cause sans la nommer.`);

  const SUJET_INSTITUTION = /\b(?:rectorat|académie|mairie|municipalité|ville|direction|établissement|école|préfecture|justice|ministère|institution|employeur|éducation nationale|hiérarchie|autorités?|services?)\b/i;
  const reproches = [...deroule.map((e) => e.texte), faits.map((f) => f.texte).join(' ')].filter((t) => RE_REPROCHE_INSTITUTION.test(t) && SUJET_INSTITUTION.test(t));
  if (reproches.length) signale('majeur', 'REPROCHE_A_UNE_INSTITUTION', `${reproches.length} ligne(s) rapportent un reproche fait à une institution (« ${(reproches[0].match(RE_REPROCHE_INSTITUTION) || [''])[0]} … ») : attribué au média, à vérifier (qui le formule ? est-il contesté ?).`);

  // ---- garde finale sur la page produite : noms, nombres d'enfants, mesure annoncée ≠ réalisée ----------------------------
  const noms = [...new Set(extractions.flatMap((x) => x.v.noms || []))];
  const dossier = {
    etat_actuel, appel: issue?.appel === 'OUI', ...(faits.length ? { faits: faits.map((f) => f.texte).join(' ') } : {}), deroule: deroule.map(({ _tri, _preuves, ...d }) => d), inconnues,
    synthese: etat_actuel.length ? { decision: etat_actuel[0], ...(etat_actuel[1] ? { ouvert: etat_actuel[1] } : {}) } : undefined, reactions, statut_affiche: carte, ...(situation ? { situation } : {}),
  };
  if (!dossier.synthese) delete dossier.synthese;
  const publie = JSON.stringify(dossier);
  const nomsFuite = nomsPresents(publie, noms);
  if (nomsFuite.length) bloque('NOM_MIS_EN_CAUSE_DANS_LA_FICHE', `Un nom de mis en cause figure dans la fiche produite (${nomsFuite.length}).`);
  if (RE_AGE_ENFANT.test(publie)) bloque('AGE_ENFANT_DANS_LA_FICHE', 'Un âge d’enfant figure dans la fiche produite.');
  if (RE_AGE_MIS_EN_CAUSE.test(publie)) bloque('AGE_MIS_EN_CAUSE_DANS_LA_FICHE', 'Un âge du mis en cause figure dans la fiche produite.');
  if (RE_NOMBRE_ENFANTS.test(publie)) bloque('NOMBRE_ENFANTS_DANS_LA_FICHE', 'Un nombre exact d’enfants figure dans la fiche produite.');

  const hors_perimetre = extractions.flatMap((x) => (x.v.hors_perimetre || []).map((h) => ({ ...h, source: x.doc.url })));
  const ecartes = [...extractions.flatMap((x) => (x.v.ecartes || []).map((e) => ({ ...e, source: x.doc.url }))), ...ecartesComposition];
  const parRaison = {};
  for (const e of ecartes) parRaison[e.raison.replace(/\(.*\)$/, '')] = (parRaison[e.raison.replace(/\(.*\)$/, '')] || 0) + 1;
  if (ecartes.length) signale(ecartes.some((e) => /NOM_MIS_EN_CAUSE|NOMBRE_EXACT/.test(e.raison)) ? 'mineur' : 'mineur', 'ELEMENTS_ECARTES_PAR_LES_GARDES', `${ecartes.length} élément(s) proposé(s) par le modèle ont été écartés par les gardes : ${Object.entries(parRaison).map(([k, n]) => `${k} ×${n}`).join(', ')}.`);

  // ---- qualification ---------------------------------------------------------------------------------------------
  const etapes = deroule.length;
  let qualification;
  if (blocages.length) qualification = 'BLOQUE';
  else if (etapes < 2 && !reactions.length) qualification = 'PAS_D_ENRICHISSEMENT';
  else if (attention.some((a) => a.niveau === 'majeur')) qualification = 'A_REVOIR';
  else qualification = 'READY';

  const trace = [
    ...deroule.map((d, i) => ({ ref: `deroule[${i}]`, texte: d.texte, preuves: d._preuves })),
    ...reactions.map((r, i) => ({ ref: `reactions[${i}]`, texte: r.citations[0].texte, preuves: [{ url: r.source.url, media: r.source.media, citation: r.citations[0].texte }] })),
    ...(issue ? [{ ref: 'issue_judiciaire', texte: `${issue.nature} ${issue.date ?? ''}`.trim(), preuves: [{ url: issue.doc.url, media: issue.doc.media, citation: issue.citation }, ...(issue.citation_appel ? [{ url: issue.doc.url, media: issue.doc.media, citation: issue.citation_appel }] : []), ...(issue.citation_definitive ? [{ url: issue.doc.url, media: issue.doc.media, citation: issue.citation_definitive }] : [])] }] : []),
  ];
  const empreinte = createHash('sha256').update(JSON.stringify(dossier)).digest('hex').slice(0, 16);
  return { dossier, qualification, blocages, attention, proposition_etat: propositionEtat, trace, ecartes, hors_perimetre, stats: { sources_pertinentes: pertinentes.length, sources_contributrices: contribuent.length, etapes, reactions: reactions.length, inconnues: inconnues.length, empreinte } };
}
