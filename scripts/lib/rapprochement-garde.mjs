// =====================================================================
// scripts/lib/rapprochement-garde.mjs — garde-fous du rapprochement « signal → affaire connue » (Discovery).
//
// Fonctions PURES : aucune base, aucun réseau, aucun modèle.
//
// POURQUOI. Le moteur existant (resolver.mjs + qualifier-signal.mjs) rapproche sur des INDICES FAIBLES (jetons du nom,
// « commune présente dans les 900 premiers caractères » — où un menu de navigation « édition de <ville> » suffit) et, à l'affichage,
// écrivait « même commune : <commune de l'AFFAIRE> » sans jamais la comparer à celle du SIGNAL. Cas réel (09/10/2026) :
// un animateur condamné dans un département de l'Ouest proposé en rapprochement d'une affaire du Sud-Est.
//
// DOCTRINE. Une commune ou un rôle identiques sont un indice faible, jamais une preuve. Une contradiction géographique
// forte BLOQUE le rapprochement. Une source inaccessible ou incohérente n'est jamais présentée comme preuve.
// =====================================================================
import { aplatir } from './capteurs.mjs';
import { canonique } from './preuve-claim.mjs';

const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'ou', 'aux', 'au', 'd', 'l', 'lez', 'arrondissement']);

/** « Saint-Aubin et Brandelac » → 2 communes ; « Paris 10e » → { nom: 'paris', arr: 10 }. */
export function communes(texte) {
  return String(texte || '')
    .split(/\s+et\s+|\s*[,;/]\s*|\s+ou\s+/i)
    .map((s) => {
      const a = aplatir(s).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ');
      const m = /\b(\d{1,2})\s*(?:er|e|eme)\b/.exec(a);
      const nom = a.replace(/\b\d{1,2}\s*(?:er|e|eme)\b/g, ' ').split(/\s+/).filter((w) => w && !VIDES.has(w)).join(' ');
      return { nom, arr: m ? Number(m[1]) : null };
    })
    .filter((c) => c.nom);
}

const jetonsNom = (n) => new Set(n.split(' ').filter(Boolean));
const nomsCompatibles = (a, b) => {
  if (a === b) return true;
  const ja = jetonsNom(a), jb = jetonsNom(b);
  const [petit, grand] = ja.size <= jb.size ? [ja, jb] : [jb, ja];
  return petit.size > 0 && [...petit].every((x) => grand.has(x)); // « saint germain » ⊂ « saint germain de princay »
};

/**
 * Le signal et l'affaire visée sont-ils au même endroit ?
 *   ok        : une commune en commun (et, si les deux portent un arrondissement, le même) ;
 *   faible    : indice insuffisant (arrondissements différents, même département mais communes différentes, commune inconnue) ;
 *   bloquant  : communes sans rapport ET département différent ou inconnu → aucun rapprochement.
 */
export function niveauGeo(signal, cible) {
  const cs = communes(signal.commune), ck = communes(cible.commune);
  if (!cs.length || !ck.length) return { niveau: 'faible', raison: 'commune inconnue d’un côté : localisation non comparable' };
  const paires = cs.flatMap((a) => ck.map((b) => ({ a, b }))).filter(({ a, b }) => nomsCompatibles(a.nom, b.nom));
  if (paires.length) {
    if (paires.every(({ a, b }) => a.arr && b.arr && a.arr !== b.arr)) return { niveau: 'faible', raison: `arrondissements différents (${paires[0].a.arr}e / ${paires[0].b.arr}e)` };
    return { niveau: 'ok', raison: null };
  }
  const ds = aplatir(signal.departement || '').trim(), dk = aplatir(cible.departement || '').trim();
  const lisible = (d) => d && !/^\d+[ab]?$/.test(d);
  if (lisible(ds) && lisible(dk) && ds === dk) return { niveau: 'faible', raison: `communes différentes (${signal.commune} / ${cible.commune}), même département` };
  return { niveau: 'bloquant', raison: `communes sans rapport (${signal.commune} / ${cible.commune})` + (lisible(ds) && lisible(dk) ? ` et départements différents (${signal.departement} / ${cible.departement})` : '') };
}

const slug = (u) => { try { return new Set(aplatir(new URL(u).pathname).split(/[^a-z]+/).filter((w) => w.length > 3)); } catch { return new Set(); } };
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / ((a.size + b.size - i) || 1); };
const THEME = /agression sexuelle|violences? sexuelle|\bviols?\b|atteinte sexuelle|p[ée]do|mis en examen|mise en examen|animateur|enseignant|p[ée]riscolaire|centre de loisirs|cr[èe]che|[ée]cole|[ée]l[èe]ve/;

/**
 * Une source historique d'une affaire est-elle UTILISABLE comme preuve ?
 * Cas réel (09/10/2026) : deux URL historiques d'une affaire redirigent vers des articles sans rapport (environnement, fait divers étranger).
 * La seule présence de la commune ne prouve rien (un menu de navigation « édition de <ville> » suffit) : il faut aussi le thème.
 * @param {{url:string, page:{ok:boolean, url?:string, corps?:string}|null, commune:string}} o
 */
export function sourceCoherente({ url, page, commune }) {
  if (!page?.ok) return { ok: false, motif: 'page inaccessible' };
  if (page.url && page.url !== url && jaccard(slug(url), slug(page.url)) < 0.34) return { ok: false, motif: 'redirigée vers un autre article' };
  // Comparaison par MOTS ENTIERS sur un texte sans accents ni ponctuation : « Saint-Germain-des-Prés » et « L'Haÿ-les-Roses »
  // se retrouvent malgré tirets et élisions, et « Vire » ne se retrouve pas dans « virement ».
  const corps = aplatir(page.corps || '').replace(/[^a-z0-9]+/g, ' ');
  const mots = new Set(corps.split(' ').filter(Boolean));
  const noms = communes(commune).map((c) => c.nom);
  if (!noms.some((n) => n.split(' ').every((w) => mots.has(w)))) return { ok: false, motif: 'commune absente de la page' };
  if (!THEME.test(corps.slice(0, 4000))) return { ok: false, motif: 'la page ne traite pas des faits suivis' };
  return { ok: true, motif: null };
}

// =====================================================================
// IDENTITÉ : trois états par dimension (concordance · information absente · contradiction étayée).
//
// Cas réel (08/11/2026) : deux articles d'un même éditeur sur une même école donnaient DEUX arbitrages contre une affaire d'une autre
// commune du même département, tous deux annoncés « Pour : aucun indice établi ». Trois défauts : (1) le voisin géographique était
// imposé sans aucun indice positif ; (2) deux signaux n'étaient jamais comparés entre eux (« même affaire » exigeait une PAGE citée en
// commun, ce que deux articles d'un même éditeur ne partagent pas) ; (3) « école primaire X » et « école X » faisaient deux clés.
//
// DOCTRINE. Le département, la proximité, une fonction générique, un mot commun servent à CHERCHER des candidats, jamais à prouver leur
// identité. Une information absente n'est pas une contradiction (un nom d'école absent n'est pas un nom différent). Une contradiction
// étayée (deux communes, deux établissements nommés, deux nombres de personnes, deux périodes de faits) interdit toute fusion.
// Ne comptent PAS comme contradictions : l'acteur du signalement, de la plainte ou de la constitution de partie civile (une mairie et des
// parents agissent dans la même affaire), l'écart entre deux dates de PARUTION, l'écart d'état judiciaire (une enquête succède à une plainte).
// =====================================================================

// Mots qui ne distinguent pas un établissement d'un autre (type de structure, articles). « primaire » : « école primaire X » = « école X ».
const GENERIQUES = new Set(['ecole', 'ecoles', 'maternelle', 'elementaire', 'primaire', 'college', 'lycee', 'creche', 'centre', 'loisirs', 'periscolaire',
  'groupe', 'scolaire', 'autre', 'nommee', 'nomme', 'municipal', 'municipale', 'accueil', 'collectif', 'mineurs', 'structure',
  'de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'au', 'aux', 'saint', 'sainte']);

/** Jetons DISTINCTIFS d'un nom d'établissement (sans type de structure ni article). */
export const jetonsEtablissement = (e) => new Set(aplatir(e || '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERIQUES.has(w)));
const jaccardSet = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / ((a.size + b.size - i) || 1); };

/** Un établissement est « nommé » s'il porte au moins un jeton distinctif et n'est pas déclaré anonyme. */
export const estNommeEtab = (nom, nomme = true) => nomme !== false && !!nom && !/non nomm|non pr[ée]cis/i.test(nom) && jetonsEtablissement(nom).size > 0;

/** Deux établissements : concordance (même jetons, ou l'un contient l'autre) · contradiction (noms distincts) · absente (l'un n'est pas nommé). */
export function comparerEtablissements(a, b) {
  const [na, nb] = [estNommeEtab(a.nom, a.nomme), estNommeEtab(b.nom, b.nomme)];
  if (!na || !nb) return { etat: 'absente', detail: !na && !nb ? 'établissement non nommé des deux côtés' : 'établissement non nommé d’un côté' };
  const [ja, jb] = [jetonsEtablissement(a.nom), jetonsEtablissement(b.nom)];
  const [petit, grand] = ja.size <= jb.size ? [ja, jb] : [jb, ja];
  if ([...petit].every((x) => grand.has(x)) || jaccardSet(ja, jb) >= 0.5) return { etat: 'concordance', detail: `établissement concordant (« ${a.nom} » / « ${b.nom} »)` };
  return { etat: 'contradiction', detail: `établissements nommés différemment (« ${a.nom} » / « ${b.nom} »)` };
}

const PRECIS = (r) => !!r && r !== 'autre' && r !== 'à qualifier';
// Rôles dont une même personne peut cumuler les deux : à l'école maternelle, le directeur ou la directrice enseigne (« directeur et enseignant »).
// Une paire absente de cette liste reste une contradiction (animateur périscolaire / enseignant : employeurs et procédures distincts, invariant Aqueduc).
const ROLES_CUMULABLES = [['direction', 'enseignant']];
/** Les deux rôles précis peuvent-ils désigner la même personne ? */
export const rolesCompatibles = (a, b) => ROLES_CUMULABLES.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
const mois = (p) => { const m = /^(\d{4})(?:-(\d{2}))?$/.exec(String(p || '')); return m ? { an: Number(m[1]), mo: m[2] ? Number(m[2]) : null } : null; };
// Pages CITÉES comme preuve par chaque côté : une page seulement LUE par l'un des deux n'est pas une preuve d'identité.
const urlsDe = (p) => new Set((p.evidence || []).map((x) => canonique(String(x.url || ''))).filter(Boolean));

/**
 * Compare deux signaux déjà qualifiés (payloads de proposition ou analyses) : même affaire, distincts, ou ambigus.
 *   même     : commune concordante, aucune contradiction, ET un indice discriminant (établissement nommé concordant, ou page citée en commun) ;
 *   distinct : au moins une contradiction étayée ;
 *   ambigu   : rien ne contredit mais rien ne discrimine (information absente) — jamais fusionné automatiquement.
 * @returns {{verdict:'meme'|'distinct'|'ambigu', dimensions:{nom:string, etat:'concordance'|'absente'|'contradiction', detail:string}[], motif:string}}
 */
export function comparerSignaux(a, b) {
  const dim = [];
  const ajoute = (nom, etat, detail) => dim.push({ nom, etat, detail });
  const geo = niveauGeo({ commune: a.commune, departement: a.fiche?.departement }, { commune: b.commune, departement: b.fiche?.departement });
  if (geo.niveau === 'ok') ajoute('commune', 'concordance', `commune des faits concordante : ${a.commune}`);
  else if (/inconnue/.test(geo.raison || '')) ajoute('commune', 'absente', geo.raison);
  else ajoute('commune', 'contradiction', geo.raison);
  const etab = comparerEtablissements({ nom: a.etablissement, nomme: a.etablissement_nomme ?? a.fiche?.crit_etablissement_nomme }, { nom: b.etablissement, nomme: b.etablissement_nomme ?? b.fiche?.crit_etablissement_nomme });
  ajoute('établissement', etab.etat, etab.detail);
  const [ra, rb] = [a.fiche?.role_mis_en_cause, b.fiche?.role_mis_en_cause];
  // Deux rôles qui peuvent désigner UNE SEULE personne (le directeur d'une école maternelle est aussi enseignant : cas Montpellier du 12/11/2026,
  // deux propositions « direction » / « enseignant » pour le même homme) ne sont pas une contradiction. Ils ne sont pas non plus une concordance :
  // l'identité n'est alors prouvée que si les autres indices la prouvent (voir `rolesCompatibles` plus bas).
  const compatibles = PRECIS(ra) && PRECIS(rb) && ra !== rb && rolesCompatibles(ra, rb);
  if (compatibles) ajoute('rôle', 'absente', `rôles compatibles (${ra} / ${rb}) : peuvent désigner la même personne, ils ne la distinguent pas`);
  else if (PRECIS(ra) && PRECIS(rb)) ajoute('rôle', ra === rb ? 'concordance' : 'contradiction', ra === rb ? `même rôle : ${ra}` : `rôles différents (${ra} / ${rb}) : procédures distinctes`);
  else ajoute('rôle', 'absente', 'rôle précis absent d’un côté');
  // Deux structures d'un même groupe scolaire (« maternelle X » / « élémentaire X ») : distinctes dès que les deux NIVEAUX sont écrits et différents.
  // « périscolaire », « centre de loisirs », « autre » ne distinguent rien : le même établissement est décrit tantôt comme une école, tantôt par son
  // service périscolaire (variation constatée d'un article à l'autre du même éditeur).
  const NIVEAUX = new Set(['crèche', 'maternelle', 'élémentaire', 'collège', 'lycée']);
  const [sa, sb] = [a.fiche?.type_structure, b.fiche?.type_structure].map((t) => (NIVEAUX.has(t) ? t : null));
  if (sa && sb) ajoute('structure', sa === sb ? 'concordance' : 'contradiction', sa === sb ? `même type de structure : ${sa}` : `types de structure différents (${sa} / ${sb}) : deux structures distinctes`);
  else ajoute('structure', 'absente', 'type de structure non précisé d’un côté');
  const [pa, pb] = [Number(a.personnes) || null, Number(b.personnes) || null];
  if (pa && pb) ajoute('personnes', pa === pb ? 'concordance' : 'contradiction', pa === pb ? `${pa} personne(s) mise(s) en cause des deux côtés` : `nombre de personnes mises en cause différent (${pa} / ${pb}) : personnes ou épisodes possiblement distincts`);
  else ajoute('personnes', 'absente', 'nombre de personnes non précisé d’un côté');
  const [ma, mb] = [mois(a.periode_faits), mois(b.periode_faits)];
  if (ma && mb) {
    const ecart = ma.mo && mb.mo ? Math.abs((ma.an * 12 + ma.mo) - (mb.an * 12 + mb.mo)) : Math.abs(ma.an - mb.an) * 12;
    ajoute('période des faits', ecart <= 2 ? 'concordance' : 'contradiction', ecart <= 2 ? `faits situés à la même période (${a.periode_faits} / ${b.periode_faits})` : `périodes de faits éloignées (${a.periode_faits} / ${b.periode_faits}) : épisodes possiblement distincts`);
  } else ajoute('période des faits', 'absente', 'période des faits non datée d’un côté');
  const [ua, ub] = [urlsDe(a), urlsDe(b)];
  const communes = [...ua].filter((u) => ub.has(u));
  ajoute('pages citées', communes.length ? 'concordance' : 'absente', communes.length ? `${communes.length} page(s) citée(s) par les deux` : 'aucune page citée en commun');
  const contra = dim.filter((d) => d.etat === 'contradiction');
  const etat = (nom) => dim.find((d) => d.nom === nom).etat;
  if (contra.length) return { verdict: 'distinct', dimensions: dim, motif: contra.map((d) => d.detail).join(' · ') };
  // Rôles seulement COMPATIBLES : le rôle ne distingue rien, donc il faut TROIS indices positifs — établissement nommé concordant, nombre de
  // personnes identique et écrit des deux côtés, page citée par les deux. Sinon : ambigu (jamais fusionné automatiquement).
  if (compatibles && !(etat('commune') === 'concordance' && etat('établissement') === 'concordance' && etat('personnes') === 'concordance' && etat('pages citées') === 'concordance')) {
    return { verdict: 'ambigu', dimensions: dim, motif: 'rôles compatibles sans preuve suffisante d’une même personne : ' + dim.filter((d) => d.etat === 'absente').map((d) => d.detail).join(' · ') };
  }
  if (etat('commune') === 'concordance' && (etat('établissement') === 'concordance' || etat('pages citées') === 'concordance')) {
    return { verdict: 'meme', dimensions: dim, motif: dim.filter((d) => d.etat === 'concordance').map((d) => d.detail).join(' · ') };
  }
  return { verdict: 'ambigu', dimensions: dim, motif: 'aucune contradiction, mais aucun indice discriminant : ' + dim.filter((d) => d.etat === 'absente').map((d) => d.detail).join(' · ') };
}

/**
 * Un voisin HISTORIQUE (affaire connue que le résolveur a seulement « approchée ») mérite-t-il d'être soumis à un humain ?
 * Oui s'il existe au moins un indice positif RÉELLEMENT discriminant (même dépêche que une source vérifiée, fait daté commun, nom
 * d'établissement retrouvé dans l'article) ou si la commune des faits concorde sans que l'établissement NOMMÉ des deux côtés soit contredit.
 * Non sinon : le voisin reste une trace interne (`rapprochement_ecarte`), le signal poursuit comme candidat autonome.
 * @param {{geo:{niveau:string, raison:string|null}, etab:{etat:string, detail:string}, resolution:string, memeDepeche:boolean, datesCommunes:string[]}} o
 * @returns {{etaye:boolean, positifs:string[], contradictions:string[], raison:string|null}}
 */
export function rapprochementEtaye({ geo, etab, resolution, memeDepeche, datesCommunes = [] }) {
  const positifs = [], contradictions = [];
  if (resolution === 'MATCH') positifs.push('l’établissement de l’affaire est retrouvé dans l’article');
  if (memeDepeche) positifs.push('mêmes phrases qu’une source vérifiée de l’affaire (même dépêche)');
  if (datesCommunes.length) positifs.push('même fait daté cité par les deux jeux de sources');
  if (etab.etat === 'concordance') positifs.push(etab.detail);
  if (geo.niveau === 'ok') positifs.push('commune des faits concordante');
  else if (geo.raison) contradictions.push(geo.raison);
  if (etab.etat === 'contradiction') contradictions.push(etab.detail);
  const discriminant = positifs.some((p) => !/^commune des faits concordante$/.test(p));
  if (geo.niveau === 'bloquant') return { etaye: false, positifs, contradictions, raison: geo.raison };
  if (discriminant) return { etaye: true, positifs, contradictions, raison: null };
  if (geo.niveau === 'ok' && etab.etat !== 'contradiction') return { etaye: true, positifs, contradictions, raison: null };
  return { etaye: false, positifs, contradictions, raison: 'aucun indice positif discriminant' + (contradictions.length ? ' : ' + contradictions.join(' ; ') : '') };
}

/**
 * Un rapprochement est-il « fort » (ATTACH proposé d'emblée) ou « faible » (REVIEW : l'humain compare et tranche) ?
 * Fort = géographie compatible ET une preuve d'identité : rapprochement COMPLET du résolveur (établissement nommé, commune,
 * rôle) ou mêmes phrases qu'une source déjà vérifiée (même dépêche). « Même commune » ou « même rôle » seuls : jamais.
 */
export function forceRapprochement({ geo, resolution, memeDepeche, datesCommunes = [] }) {
  if (geo.niveau === 'bloquant') return { force: 'aucune', raison: geo.raison };
  if (geo.niveau !== 'ok') return { force: 'faible', raison: geo.raison };
  // Preuve discriminante : un fait DATÉ cité (jour, mois, année) à la fois par la nouvelle source et par une source déjà vérifiée de
  // l'affaire (ex. le même procès annoncé pour le même jour), dans la même commune.
  if (resolution === 'MATCH' || memeDepeche || datesCommunes.length > 0) return { force: 'forte', raison: null };
  return { force: 'faible', raison: 'identification partielle : l’établissement, la date ou la procédure ne sont pas établis par les articles' };
}
