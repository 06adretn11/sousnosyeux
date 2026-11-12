// =====================================================================
// scripts/lib/destinations.mjs — où une information VALIDÉE est-elle utile, parmi les pages DÉJÀ PUBLIQUES ? Fonctions PURES.
//
// Une information = UN fait (mémoire : state_proposals.facts, lu par matiere-validee.mjs). Sa PORTÉE (de quoi parle-t-elle ?) vient de sa
// SOURCE ; ses DESTINATIONS (où est-elle utile ?) se CALCULENT ici, jamais par une simple correspondance départementale, jamais par page :
//   fiche   : la fiche APPROUVÉE de l'affaire dont l'article parle (rattachement explicite) — une seule, jamais « toutes les affaires du territoire » ;
//   Hub     : un Hub PUBLIÉ dont le périmètre contient la portée du fait, dans un bloc EXISTANT approprié ;
//   rien    : aucune page publique concernée → l'information reste en mémoire (affaire sans fiche, territoire sans Hub), aucune page créée.
// Sécurité : une affaire non publique (candidate, REVIEW) n'apparaît JAMAIS, même via un Hub. Une affaire sous HOLD n'est jamais projetée NI dans sa
// fiche NI par ses faits propres. HOLD ≠ provenance : un fait de TERRITOIRE validé (une mobilisation à l'échelle d'une ville, documentée par SON article) n'est pas
// une mutation de l'affaire gelée ; il suit sa propre portée et sa propre preuve. La provenance (l'affaire par laquelle il a été découvert) reste dans la
// mémoire privée : elle n'est jamais exposée côté public quand l'affaire est gelée, et le fait n'est jamais rattaché à une autre affaire.
// Une information qu'aucun bloc existant ne peut accueillir sans forcer le sens d'une page est un BLOCAGE explicite (revue ciblée), jamais une insertion forcée.
// =====================================================================
import { HUBS_PERIMETRES } from './diagnostic-territoire.mjs';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Blocs EXISTANTS des Hubs (titres de `reponses`) : une mobilisation va aux familles/associations, une mesure de collectivité à son bloc.
const BLOC = { mobilisation: /familles|parents|associations|mobilisation/i, mesure: /ville|mairie|collectivit|municipal|rectorat|education/i };
const blocDe = (nature, groupes) => (groupes || []).find((g) => (nature === 'mobilisation' ? BLOC.mobilisation : BLOC.mesure).test(g)) ?? null;

/** La portée (territoire nommé par la SOURCE) est-elle contenue dans le périmètre d'un Hub ? Échec fermé si inconnu. */
export function territoireDansHub(territoire, zone, departementDeCommune) {
  const t = norm(territoire);
  if (!t || !zone) return false;
  if (zone.ville) {
    if (t.split(' ')[0] !== zone.ville) return false;                           // « Paris », « Paris 11e » ⊂ Paris
    // Un Hub d'ARRONDISSEMENT (Paris 11e) accueille une mesure de TOUTE la ville (« Paris » : elle vaut pour le 11e aussi) et un fait de SON arrondissement ; pas un fait
    // d'un AUTRE arrondissement (« Paris 7e ») : une mobilisation dans le 7e ne concerne pas le 11e sans preuve de ce lien.
    const arr = /\b(\d{1,2})\s*(?:er|e|eme)\b/.exec(t);
    return !(arr && zone.arrondissement && Number(arr[1]) !== zone.arrondissement);
  }
  if (zone.departement) return t === norm(zone.departement) || norm(departementDeCommune.get(t)) === norm(zone.departement);
  return false;
}

/** La commune de l'affaire est-elle DANS la portée nommée par la source ? (« Paris » ⊃ « Paris 10e » ; « Lyon » ⊅ « Cenon »). Lien démontré, pas une simple proximité. */
export function communeDansTerritoire(commune, territoire, departement = null) {
  const c = norm(commune), t = norm(territoire);
  if (!c || !t) return false;
  return c === t || (t.split(' ').length === 1 && c.split(' ')[0] === t) || (!!departement && t === norm(departement));
}

/**
 * @param {object} fait  { id, case_id, nature, portee, territoire }
 * @param {object} ctx   { publiques:Set<case_id>, holds:Set, approuvees:Set<case_id>, cases:Map<case_id,{commune,departement}>,
 *                         hubs:{[hub]:{publie:boolean, groupes:string[]}} }
 * @returns {{ fiche:string|null, hubs:{hub:string, groupe:string}[], bloques:string[] }}
 */
export function destinationsDe(fait, ctx) {
  const vide = { fiche: null, hubs: [], bloques: [] };
  const c = ctx.cases.get(fait.case_id);
  if (!c || !ctx.publiques.has(fait.case_id)) return vide;                                      // jamais une affaire non publique
  const gelee = ctx.holds.has(fait.case_id);
  if (gelee && fait.portee !== 'territoire') return vide;                                       // un fait PROPRE à une affaire gelée n'est jamais projeté
  // Fiche : celle de l'affaire dont l'article parle (jamais une affaire gelée) ; une information TERRITORIALE n'y figure que si la commune de l'affaire est dans sa portée.
  const lienFiche = fait.portee !== 'territoire' || communeDansTerritoire(c.commune, fait.territoire, c.departement);
  const out = { fiche: !gelee && ctx.approuvees.has(fait.case_id) && lienFiche ? fait.case_id : null, hubs: [], bloques: [] };
  const departementDeCommune = new Map([...ctx.cases.values()].map((x) => [norm(x.commune), x.departement]));
  for (const [hub, p] of Object.entries(HUBS_PERIMETRES)) {
    if (!ctx.hubs[hub]?.publie) continue;
    const dedans = fait.portee === 'territoire'
      ? territoireDansHub(fait.territoire, p.zone, departementDeCommune)
      : p.test(c);                                                                              // fait d'affaire : l'affaire est dans le périmètre
    if (!dedans) continue;
    const groupe = blocDe(fait.nature, ctx.hubs[hub].groupes);
    if (groupe) out.hubs.push({ hub, groupe });
    else out.bloques.push(`${hub} : aucun bloc existant ne peut accueillir cette information (${fait.nature}) sans modifier le sens de la page — revue ciblée`);
  }
  return out;
}

/**
 * Pages publiques qu'un fait mettrait à jour S'IL était validé — même calcul que la projection, dit AVANT la décision (proposition Telegram).
 * Un Hub rédigé n'est pas en mémoire : si son bloc porte déjà une réponse à la MÊME date d'événement, elle est citée (doublon probable, décision humaine).
 */
export function pagesSiValide(faits, ctx, site = 'https://sousnosyeux.org') {
  const out = new Set();
  for (const f of faits) for (const l of lignesDeFait(f, ctx, site)) out.add(l);
  return [...out];
}

/** Pages qu'UN fait mettrait à jour s'il était validé (même calcul que la projection). Vide si aucune. */
function lignesDeFait(f, ctx, site) {
  const out = [];
  const d = destinationsDe(f, ctx);
  for (const h of d.hubs) {
    const meme = f.date ? (ctx.hubs[h.hub]?.items?.[h.groupe] ?? []).find((i) => i.date === f.date) : null;
    out.push(`Hub ${HUBS_PERIMETRES[h.hub]?.titre ?? h.hub}, bloc « ${h.groupe} » — ${site}/territoires/${h.hub}/${meme ? ` — déjà dans ce bloc à cette date : « ${String(meme.texte).slice(0, 90)}… »` : ''}`);
  }
  if (d.fiche) out.push(`fiche ${d.fiche} — ${site}/affaires/${d.fiche.toLowerCase()}/`);
  for (const b of d.bloques) out.push(`non intégrable : ${b}`);
  return out;
}

/** Pourquoi un fait n'a AUCUNE page : dit en clair (territoire non établi, hors des Hubs publiés, affaire sans fiche…), jamais « rien » sans raison. */
function raisonSansPage(f, ctx) {
  if (f.portee === 'territoire') {
    if (!f.territoire) return 'territoire non établi par la source : aucune page ne peut être déduite';
    return `aucun Hub publié ne couvre « ${f.territoire} », et la commune de l’affaire d’où l’article est parti n’est pas dans ce territoire (la provenance ne tient pas lieu de portée)`;
  }
  const c = ctx.cases.get(f.case_id);
  if (!c || !ctx.publiques.has(f.case_id)) return 'l’affaire n’est pas publique';
  if (ctx.holds.has(f.case_id)) return 'l’affaire est sous HOLD : aucun fait propre n’est projeté';
  return 'ni fiche approuvée, ni Hub publié couvrant cette affaire';
}

/**
 * Pour CHAQUE fait, dans l'ordre : les pages qu'il mettrait à jour si la proposition était validée, ou la raison pour laquelle il n'en a aucune.
 * Le message de décision l'affiche fait par fait : une page n'est jamais annoncée « pour la proposition » en bloc (des faits de portées différentes n'ont pas les
 * mêmes destinations — cas du 12/11/2026 : un Hub et une fiche annoncés pour une mobilisation à Montreuil qui n'avait aucune destination).
 * @returns {{pages:string[], aucune:string|null}[]}
 */
export function pagesParFait(faits, ctx, site = 'https://sousnosyeux.org') {
  return faits.map((f) => { const pages = lignesDeFait(f, ctx, site); return { pages, aucune: pages.length ? null : raisonSansPage(f, ctx) }; });
}

/** Projection publique : SEULES les informations qui ont au moins une destination ; le reste ne quitte jamais Neon. Pas de citation (preuve ≠ publication). */
export function construireMatiere(faits, ctx) {
  const matiere = [], bloques = [], conservees = [];
  for (const f of faits) {
    const d = destinationsDe(f, ctx);
    // Un fait de territoire n'est pas « de » l'établissement par lequel il a été découvert : ni son nom ni son identifiant ne servent à le présenter.
    const terr = f.portee === 'territoire';
    const id_ = { id: f.id, case_id: terr ? null : f.case_id, etablissement: terr ? null : f.etablissement ?? null, portee: f.portee, territoire: f.territoire ?? null, libelle: f.libelle };
    for (const b of d.bloques) bloques.push({ ...id_, raison: b });
    if (!d.fiche && !d.hubs.length) { if (!d.bloques.length) conservees.push(id_); continue; }
    matiere.push({
      id: f.id, nature: f.nature, libelle: f.libelle, realisation: f.realisation, portee: f.portee, acteur: f.acteur, territoire: f.territoire ?? null,
      date: f.date ?? null, periode: f.periode ?? null, source: f.source, ...(f.ajustements?.length ? { ajustements: f.ajustements } : {}), ...(f.portee === 'territoire' ? {} : { etablissement: ctx.cases.get(f.case_id)?.etablissement ?? null }), case_id: terr && ctx.holds.has(f.case_id) ? null : f.case_id, event_id: f.event_id ?? null, destinations: { fiche: d.fiche, hubs: d.hubs },
    });
  }
  matiere.sort((a, b) => a.id.localeCompare(b.id));
  return { matiere, bloques, conservees };
}
