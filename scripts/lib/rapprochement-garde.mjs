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
