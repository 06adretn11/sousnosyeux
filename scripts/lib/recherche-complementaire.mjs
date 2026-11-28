// =====================================================================
// scripts/lib/recherche-complementaire.mjs — corroborer une affaire repérée par UN SEUL article.
//
// POURQUOI (28/11/2026, Saint-Genès La Salle, Bordeaux). Discovery avait repéré le procès par un seul titre (Charente Libre, reprise AFP). La recherche
// de corroboration d'alors partait du TITRE de ce signal : requête = le titre, filtre = proximité de mots avec ce titre ET parution à ± 20 jours.
// Elle ne pouvait donc retrouver que des reprises de la même dépêche. Or la presse locale et nationale avait couvert l'affaire pendant trois ans
// (Sud Ouest, Le Figaro, Le Monde, Ouest-France, 20 Minutes, RMC, RCF, actu.fr — douze pages, huit éditeurs en une recherche par nom d'établissement).
//
// CE QUE FAIT CE MODULE. Une fois l'établissement et la commune EXTRAITS et VÉRIFIÉS par le premier passage, il cherche par ENTITÉS
// (établissement + commune + faits), sans fenêtre de dates, et ne garde que les pages RELUES dont le corps nomme l'établissement ET la commune ET
// parle de faits. Il ne décide rien : les pages retenues repassent par l'extraction, la vérification littérale des citations et le comptage des
// origines (qualifier-signal.mjs). Une page qui parle d'une AUTRE affaire du même lieu n'est pas écartée ici : c'est l'extraction qui retient la
// structure du signal, et seules les pages portant une citation vérifiée comptent comme éditeur.
//
// Sans effet de bord : aucune écriture. `rechercherFn` / `lireFn` sont injectables (tests hors ligne).
// =====================================================================
import { rechercherBing, lirePage, admissible, domaine, canonique } from './preuve-claim.mjs';
import { aplatir } from './capteurs.mjs';
import { jetonsEtablissement, estNommeEtab } from './rapprochement-garde.mjs';

/** Indices de faits : une page de l'établissement qui ne parle ni d'affaire ni de procédure n'est pas une corroboration. */
const INDICES_FAITS = /\b(viol|viols|agression|agressions|sexuel|sexuelle|sexuels|sexuelles|mis en examen|mise en examen|proces|cour criminelle|assises|garde a vue|plainte|enquete|pedocriminalite|pedocriminel|voyeurisme)\b/;

const mot = (s) => ` ${aplatir(s || '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
const contientTous = (texteMot, jetons) => [...jetons].every((j) => texteMot.includes(` ${j} `));
const contientUn = (texteMot, jetons) => [...jetons].some((j) => texteMot.includes(` ${j} `));

/** Mot de procédure pour la requête, d'après le stade déjà extrait (jamais une affirmation : c'est un mot de recherche). */
const MOT_STADE = {
  'procès': 'procès', 'mise en examen': 'mis en examen', 'enquête': 'enquête', 'plainte': 'plainte',
  'condamnation non définitive': 'condamné', 'condamnation définitive': 'condamné', 'relaxe / non-lieu / classement': 'non-lieu',
};

/**
 * Requêtes par entités, de la plus précise à la plus large. Jamais le titre du signal.
 * @returns {string[]} 2 à 3 requêtes distinctes
 */
export function requetesComplementaires(c) {
  const etab = String(c.etablissement || '').replace(/["«»]/g, ' ').replace(/\s+/g, ' ').trim();
  const commune = String(c.commune || '').trim();
  if (!etab || !commune) return [];
  const utile = (v) => (v && v !== 'autre' && v !== 'à qualifier' ? String(v) : '');
  const faits = [utile(c.role_mis_en_cause), utile(c.type_affaire)].filter(Boolean).join(' ');
  const qs = [
    `${etab} ${commune}`,
    `${etab} ${commune} ${faits}`.replace(/\s+/g, ' ').trim(),
    `${etab} ${commune} ${MOT_STADE[c.statut_judiciaire] || 'enquête'}`,
  ];
  return qs.filter((q, i, a) => q && a.indexOf(q) === i);
}

/**
 * @param {{c: object, dejaLues: Array<{url:string}>, cache?: Map, max?: number, rechercherFn?: Function, lireFn?: Function}} o
 * @returns {Promise<{pages: Array<{url,media,published,corps}>, requetes: string[], candidats: number, erreurs: string[]}>}
 *   pages = pages RELUES, d'éditeurs nouveaux (un par domaine), dont le corps nomme l'établissement et la commune et parle de faits.
 */
export async function rechercheComplementaire({ c, dejaLues = [], cache = new Map(), max = 4, rechercherFn = rechercherBing, lireFn = lirePage }) {
  const vide = { pages: [], requetes: [], candidats: 0, erreurs: [] };
  if (!estNommeEtab(c.etablissement)) return vide; // sans nom d'établissement, aucune recherche par entités n'est fiable
  const requetes = requetesComplementaires(c);
  if (!requetes.length) return vide;
  const jetons = jetonsEtablissement(c.etablissement);
  const communeMot = mot(c.commune);
  const dejaUrls = new Set(dejaLues.map((p) => canonique(p.url)));
  const dejaDomaines = new Set(dejaLues.map((p) => domaine(p.url)));

  const erreurs = [];
  const vus = new Map();
  for (const q of requetes) {
    try {
      for (const r of await rechercherFn(q)) {
        if (!admissible(r.url) || dejaUrls.has(canonique(r.url)) || vus.has(r.url)) continue;
        // Pré-filtre sur le titre et l'extrait : au moins un jeton DISTINCTIF de l'établissement (le corps, relu ensuite, les exige tous).
        const tm = mot(`${r.titre} ${r.extrait}`);
        if (!contientUn(tm, jetons)) continue;
        vus.set(r.url, { ...r, nomme: contientTous(tm, jetons) });
      }
    } catch (e) { erreurs.push(String(e.message).slice(0, 60)); }
  }
  // Les pages dont le titre nomme tout l'établissement d'abord, puis les plus récentes.
  const classes = [...vus.values()].sort((a, b) => (b.nomme - a.nomme) || String(b.published || '').localeCompare(String(a.published || '')));
  const pages = [];
  const domaines = new Set(dejaDomaines);
  let lectures = 0;
  for (const r of classes) {
    if (pages.length >= max || lectures >= max * 3) break;
    const d = domaine(r.url);
    if (domaines.has(d)) continue; // un éditeur = une page : deux articles du même éditeur ne sont jamais deux confirmations
    lectures++;
    const p = await lireFn(r.url, cache);
    if (!p.ok) continue;
    const corps = mot(p.corps);
    if (!contientTous(corps, jetons) || !corps.includes(communeMot) || !INDICES_FAITS.test(corps.trim())) continue;
    domaines.add(d);
    pages.push({ url: r.url, media: r.media || d, published: r.published || p.publie_le || null, corps: p.corps });
  }
  return { pages, requetes, candidats: vus.size, erreurs };
}
