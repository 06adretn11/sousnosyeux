// =====================================================================
// scripts/lib/paroles-attribuees.mjs — les PAROLES ATTRIBUÉES d'une source déjà lue (23/11/2026, cas BFMTV Baudin–Titon)
//
// Jusqu'ici la lecture d'un article ne produisait que des mobilisations et des mesures (`extraireReactions` : « jamais de parole citée ») : les avocates, la porte-parole et les
// parents d'un article déjà connu n'étaient jamais proposés. Cette fonction PURE enrichit la MÊME lecture (le corps est déjà lu, aucun appel modèle, aucune requête) :
// elle repère une déclaration entre guillemets, son locuteur TEL QUE LE MÉDIA L'ÉCRIT (anonymat et qualité conservés : « Camille*, la maman de l'un des enfants… »), sa
// portée (cette affaire, l'établissement voisin, ou les deux = territoire) et rend un fait structuré, décidable par le circuit existant (proposition ENRICHMENT → clic →
// `state_proposals.facts` ACCEPT → matière validée → « Paroles et réactions »).
//
// Une parole documente CE QU'UNE PERSONNE EXPRIME : jamais une affirmation de SNY, jamais un changement de statut judiciaire (niveau POSITION_ATTRIBUEE). Aucune identité n'est
// recherchée ; le nom d'une personne mise en cause (« Paul X. ») n'est jamais repris : une qualité ou une citation qui en contient un est BLOQUÉE avec son motif.
// Le nombre exact d'enfants n'est jamais repris : la phrase qui le porte est écartée (les autres phrases de la déclaration restent, mot pour mot).
// =====================================================================
import { aplat, jetonsEtab } from './routage-veille.mjs';
import { dateEcrite } from './evenement-institutionnel.mjs';

export const PAROLES_VERSION = 'paroles-0.1.0';
const VERBES = '(?:r[ée]clame|esp[èe]re|craint|s’étonne|souhaite|redoute|interpelle|d[ée]nonce|d[ée]plore|t[ée]moigne|explique|estime|affirme|indique|souligne|regrette|confie|assure|raconte|lance|r[ée]agit|s’indigne|s\'indigne|prononce|ajoute|pr[ée]cise|insiste|conclut|martèle|fustige|accuse|juge|crie|alerte|s’inquiète|s\'inquiète|exprime|exige|demande|appelle|rappelle|d[ée]clare|poursuit|renchérit|se désole|se désolent)';
// [1] pronom collé au verbe (« prononce-t-elle ») · [2] le reste jusqu'au point : le locuteur (« …, dénoncent les avocates Me X et Y »)
const CUE = new RegExp(`^[\\s,;:–—-]*${VERBES}(?:nt)?(-t-(?:il|elle|ils|elles)|-(?:il|elle|ils|elles))?\\s*(?:de son c[ôo]t[ée]\\s+|à son tour\\s+|également\\s+|encore\\s+)?(.{0,320}?)(?:\\.(?=\\s|$)|$)`, 'i');
// Une personne mise en cause est désignée par un prénom et une initiale (« Paul X. ») : jamais reprise.
const NOM_INITIALE = /\b[A-ZÉÈ][a-zéèëï-]+\s+[A-ZÉÈ]\.(?![a-zA-Z])/;
// La phrase d'une déclaration qui porte le NOMBRE D'ENFANTS (« ces neuf enfants », « 12 enfants ») : écartée de l'extrait.
// (« un enfant », générique, n'est pas un compte ; « ces neuf enfants », « 12 enfants », « trois des enfants » en sont un)
const NOMBRE_ENFANTS = /\b(?:deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quinze|vingt|\d+)\s+(?:des\s+|d['’]entre\s+eux\s+)?(?:enfants|élèves|fillettes|garçons|petites|petits)\b/i;
const MOTS = (s) => (String(s).match(/[\p{L}\p{N}'’-]+/gu) || []).length;

/** Découpe un texte en phrases (la ponctuation reste attachée), sans toucher aux espaces internes. */
const phrases = (t) => String(t).split(/(?<=[.!?…])\s+(?=[A-ZÉÈÀ"«“(])/).map((s) => s.trim()).filter(Boolean);

/** Locuteur depuis « Nom, qualité, qui … » : le nom tel qu'écrit, la qualité jusqu'à la proposition relative. */
function lireLocuteur(brut) {
  let s = String(brut).replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  // Tout ce qui suit un propos rapporté (« lors d'une prise de parole », « qui pointe… ») n'est pas la qualité du locuteur ; la circonstance est gardée à part.
  const circonstance = /\s+((?:lors d['’]|lors de |pendant |devant )[^,]*)$/i.exec(s)?.[1] ?? null;
  s = s.replace(/\s+(?:lors d['’]|lors de |pendant |devant )[^,]*$/i, '').replace(/,\s+(?:qui|dont|alors|selon lequel|pour qui)\b.*$/i, '');
  const i = s.indexOf(', ');
  const acteur = (i < 0 ? s : s.slice(0, i)).trim();
  let qualite = i < 0 ? '' : s.slice(i + 2).trim();
  qualite = qualite.replace(/\s+de la part d[eu'’][^,.;]*$/i, '').replace(/[\s,;]+$/, '').trim();   // « … violences sexuelles de la part de Paul X. » : on garde la qualité, pas la personne
  return { acteur, qualite, circonstance };
}

/** Choisit les phrases d'une déclaration qui peuvent être reprises ; renvoie les citations (runs contigus, littérales) ou un motif de blocage. */
function extrait(quote) {
  const ph = phrases(quote);
  const gardees = ph.filter((p) => !NOMBRE_ENFANTS.test(p));
  if (!gardees.length) return { bloque: 'toutes les phrases portent le nombre exact d’enfants (jamais repris)' };
  const runs = [];
  let cur = [];
  for (const p of ph) { if (NOMBRE_ENFANTS.test(p)) { if (cur.length) runs.push(cur.join(' ')); cur = []; } else cur.push(p); }
  if (cur.length) runs.push(cur.join(' '));
  // Longueur maximale d'un extrait public : on coupe à la frontière d'une phrase, jamais au milieu.
  let total = 0; const retenus = [];
  for (const r of runs) { if (total + r.length > 420 && retenus.length) break; retenus.push(r.length > 420 ? r.slice(0, r.lastIndexOf('.', 420) + 1) || r.slice(0, 420) : r); total += r.length; }
  return { citations: retenus, partiel: gardees.length < ph.length || retenus.join(' ') !== quote };
}

/**
 * @param {string} corps  corps de l'article (le titre en tête), paragraphes séparés par une ligne vide
 * @param {{ etablissement?:string, autres?:string[], commune?:string, caseId?:string, anneeRef?:string|null, registre?:{alias:string[], affaires_rattachees?:string[]}[] }} o
 * @returns {{ faits:object[], bloques:{motif:string, locuteur?:string}[] }}
 */
export function extraireParoles(corps, { etablissement = '', autres = [], commune = '', caseId = null, anneeRef = null, registre = [] } = {}) {
  const propres = jetonsEtab(etablissement);
  const jetonsAutres = autres.flatMap((e) => jetonsEtab(e)).filter((t) => !propres.includes(t));
  const nomme = (txt, jetons) => { const n = ` ${aplat(txt).replace(/[^a-z0-9]+/g, ' ')} `; return jetons.some((t) => n.includes(` ${t} `)); };
  const paras = String(corps || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const faits = [], bloques = [];
  // « sujet courant » : le dernier paragraphe qui nomme UN SEUL côté (cette école / l'autre) ; un paragraphe qui nomme les deux, ou aucun, le laisse tel quel.
  let courant = null, dernierLocuteurNomme = null;
  paras.forEach((p, ip) => {
    const a = propres.length && nomme(p, propres), b = jetonsAutres.length && nomme(p, jetonsAutres);
    const ici = a && b ? 'both' : a ? 'own' : b ? 'other' : null;
    const sujet = ici ?? courant;
    // Locuteur nommé au début du paragraphe (« Noémie, maman d'une élève scolarisée… ») : repris pour une déclaration du paragraphe suivant (« prononce-t-elle »).
    const intro = /^([A-ZÉÈ][\p{L}'’-]+\*?),\s+((?:maman|mère|père|papa|parent|grand|avocat|porte)[^.]{3,160}?)(?:,\s+(?:se |s['’]|a |est ))|^([A-ZÉÈ][\p{L}'’-]+\*?),\s+((?:maman|mère|père|papa|parent)[^.]{3,160}?)\./u.exec(p);
    const introLoc = intro ? { acteur: intro[1] || intro[3], qualite: (intro[2] || intro[4] || '').trim() } : null;
    const re = /"([^"]{25,900}?)"|«\s?([^»]{25,900}?)\s?»|“([^”]{25,900}?)”/g;
    let m, precedent = null;
    const reste = (fin) => p.slice(fin);
    while ((m = re.exec(p))) {
      const quote = (m[1] ?? m[2] ?? m[3]).trim();
      if (MOTS(quote) < 6) continue;                                                 // guillemets d'ironie ou titre d'émission : pas une déclaration
      const apres = reste(m.index + m[0].length);
      // un second extrait SANS verbe, collé au précédent (« …erreur grave", dénoncent les avocates. "Un enfant ne simule pas… ») : même locuteur
      let loc = null;
      const c = CUE.exec(apres.split(/"|«|“/)[0]);
      let finCue = m.index + m[0].length;
      if (c) {
        finCue += c[0].length;
        // « prononce-t-elle » : le pronom renvoie au locuteur NOMMÉ en tête du paragraphe courant ou du précédent (jamais deviné autrement).
        const base = c[1] ? (introLoc ?? dernierLocuteurNomme) : null;
        loc = c[1] ? (base ? { ...base, circonstance: /((?:lors d['’]|lors de |pendant |devant )[^,.]*)/i.exec(c[2])?.[1] ?? null } : null) : lireLocuteur(c[2]);
      } else if (precedent && /^[\s.]*$/.test(p.slice(precedent.fin, m.index))) loc = precedent.loc;
      if (!loc || !loc.acteur) { bloques.push({ motif: 'locuteur non indiqué par l’article (déclaration sans attribution)', extrait: quote.slice(0, 60) }); continue; }
      precedent = { loc, fin: finCue };
      if (/^(?:le|la|l['’]|les)?\s*(?:journaliste|rédaction)/i.test(loc.acteur)) continue;
      if (NOM_INITIALE.test(`${loc.acteur} ${loc.qualite}`) || NOM_INITIALE.test(quote)) { bloques.push({ motif: 'le locuteur, sa qualité ou l’extrait nomme une personne mise en cause (jamais repris)', locuteur: loc.acteur }); continue; }
      // PORTÉE : le nom d'établissement du paragraphe, à défaut le sujet courant ; l'autre établissement → pas cette affaire ; les deux ou inconnu → territoire (sauf registre).
      let portee, raison;
      const registreQualite = registre.find((r) => r.qualite_registre && (r.alias || []).some((al) => aplat(loc.acteur).includes(aplat(al))))?.qualite_registre ?? null;
      const dansRegistre = caseId && registre.some((r) => (r.affaires_rattachees || []).includes(caseId) && (r.alias || []).some((al) => aplat(loc.acteur).includes(aplat(al))));
      const autreRegistre = caseId && registre.some((r) => (r.affaires_rattachees || []).length && !(r.affaires_rattachees || []).includes(caseId) && (r.alias || []).some((al) => aplat(loc.acteur).includes(aplat(al))));
      if (sujet === 'own') { portee = 'établissement'; raison = ici ? 'le paragraphe nomme l’établissement' : 'dernier établissement nommé avant la déclaration'; }
      else if (sujet === 'other') continue;
      else if (dansRegistre) { portee = 'établissement'; raison = 'locuteur rattaché à cette affaire par le registre des acteurs (preuve hors de cet article)'; }
      else if (autreRegistre) continue;
      else { portee = 'territoire'; raison = sujet === 'both' ? 'l’article parle des deux établissements : portée commune' : 'aucun établissement nommé : portée du territoire'; }
      const ex = extrait(quote);
      if (ex.bloque) { bloques.push({ motif: ex.bloque, locuteur: loc.acteur }); continue; }
      const date = dateEcrite(p, anneeRef);
      const acteur = loc.acteur, qualite = loc.qualite;
      const asterisque = /\*/.test(acteur);
      const citation = ex.citations.join(' […] ');
      faits.push({
        event_type: 'parole', nature: 'parole', mesure: 'parole_attribuee', realisation: null, portee, acteur, acteur_nomme: acteur,
        event_date: date?.date ?? null, event_period: date?.date ? null : date?.periode ?? null,
        libelle_public: `Parole attribuée — ${acteur}${qualite ? `, ${qualite}` : ''} : « ${citation} »`,
        evidence: ex.citations.slice(0, 2),
        parole: { acteur, qualite: qualite || null, citations: ex.citations.map((t) => ({ texte: t })), extrait_partiel: ex.partiel,
          contexte: `${asterisque ? 'Prénom suivi d’un astérisque dans l’article ; ' : ''}propos rapportés par le média, locuteur et qualité tels qu’écrits${loc.circonstance ? ` ; circonstance indiquée : ${loc.circonstance}` : ''}${registreQualite ? ` ; rattachement du locuteur (registre des acteurs) : ${registreQualite}` : ''}.`, rattachement: raison },
        ...(portee === 'territoire' ? { territoire: commune || null } : {}),
      });
    }
    if (ici) courant = ici === 'both' ? 'both' : ici;
    if (introLoc) dernierLocuteurNomme = introLoc;
  });
  // UN fait par (locuteur, extrait) dans l'article.
  const vus = new Set();
  return { faits: faits.filter((f) => { const k = `${aplat(f.acteur)}|${aplat(f.parole.citations[0].texte)}`; if (vus.has(k)) return false; vus.add(k); return true; }), bloques };
}
