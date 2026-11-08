// Comparaisons PURES entre ce que le dépôt annonce (projection commitée, dossiers approuvés) et ce que le site servi montre. Testées sans réseau.
//
// Ce que la page d'accueil expose réellement (web/src/pages/index.astro → JSON `#cases-data`) : l'état judiciaire, la PREMIÈRE source
// (source_url) et la synthèse d'état `etat` — pas la liste complète des sources. On vérifie donc exactement cela.
import { hashDossier } from './fiche-page.mjs';

/** @returns {string[]} les écarts ; vide = conforme */
export function ecartsSite(html, ids, attendu) {
  const m = /<script[^>]*id="cases-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return ['JSON public introuvable dans la page'];
  let pub; try { pub = JSON.parse(m[1]); } catch { return ['JSON public illisible']; }
  const parId = new Map((Array.isArray(pub) ? pub : pub.cases || []).map((c) => [c.case_id, c]));
  const out = [];
  for (const id of ids) {
    const a = attendu.get(id), p = parId.get(id);
    if (!a) { out.push(`${id} : absente de data/cases.json`); continue; }
    if (!p) { out.push(`${id} : absente du site`); continue; }
    if (p.statut_judiciaire !== a.statut_judiciaire) out.push(`${id} : état « ${p.statut_judiciaire} » sur le site, « ${a.statut_judiciaire} » attendu`);
    const premiere = a.sources?.[0]?.url ?? '';
    if ((p.source_url ?? '') !== premiere) out.push(`${id} : première source différente de la projection`);
    if (JSON.stringify(p.etat ?? null) !== JSON.stringify(a.etat ?? null)) out.push(`${id} : synthèse d'état différente de la projection`);
  }
  return out;
}

const ID = /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+)$/;

/**
 * Arguments de scripts/verifier-site.mjs. Une valeur d'option (`--fiches a,b`, `--hubs x`) n'est écartée des identifiants QUE si l'option est présente :
 * le premier identifiant positionnel est un identifiant comme les autres (défaut corrigé : avec `iF = iH = -1`, l'indice 0 était exclu à tort).
 * @returns {{ids: string[], fiches: string[], hubs: string[], telegram: boolean}}
 */
export function analyserArguments(argv) {
  const iF = argv.indexOf('--fiches');
  const iH = argv.indexOf('--hubs');
  const valeurs = new Set([iF >= 0 ? iF + 1 : -1, iH >= 0 ? iH + 1 : -1].filter((i) => i >= 0));
  const hubs = iH >= 0 ? (argv[iH + 1] || '').split(',').filter((h) => /^[a-z0-9-]+$/.test(h)) : [];
  const fiches = iF >= 0 ? (argv[iF + 1] || '').split(',').filter((i) => ID.test(i)) : [];
  const ids = argv.filter((a, i) => ID.test(a) && !valeurs.has(i));
  return { ids, fiches, hubs, telegram: !argv.includes('--sans-telegram') };
}

/** Texte à plat d'une page ou d'une phrase, pour comparer indépendamment de l'échappement HTML. */
export const plat = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/’/g, "'").replace(/\s+/g, ' ');

/**
 * Écarts d'une fiche servie par rapport à la VERSION AUTORISÉE actuelle : [] = conforme.
 * `dossier` = le dossier approuvé présent dans data/hub-matiere (celui dont l'empreinte est approuvée) ; `evenements` = data/evenements.json.
 *  · `data-dossier` doit porter l'empreinte (hashDossier, neuf champs) de CE dossier : une version précédente encore servie n'est jamais confirmée ;
 *  · événements et informations validées : nombre ET libellé des informations ; étapes du déroulé : début de chaque texte (contrôle conservé).
 * L'empreinte du dossier ne couvre ni les événements Neon, ni la matière, ni la carte : ils sont contrôlés séparément ci-dessus.
 */
export function ecartsFiche(html, id, { evenements, dossier }) {
  const out = [];
  if (!html.includes(`data-fiche="${id}"`)) out.push(`fiche ${id} : page sans le bon dossier`);
  const n = (evenements?.affaires?.[id] || []).length;
  if (!html.includes(`data-evenements="${n}"`)) out.push(`fiche ${id} : nombre d'événements différent de la projection (${n} attendus)`);
  const matiere = (evenements?.matiere || []).filter((x) => x.destinations?.fiche === id);
  if (!html.includes(`data-matiere="${matiere.length}"`)) out.push(`fiche ${id} : informations validées différentes de la projection (${matiere.length} attendues)`);
  const page = plat(html);
  for (const x of matiere) if (!page.includes(plat(x.libelle).slice(0, 40))) out.push(`fiche ${id} : information ${x.id} absente de la page servie`);
  if (!dossier) { out.push(`fiche ${id} : dossier approuvé introuvable dans data/hub-matiere`); return out; }
  const attendu = hashDossier(dossier);
  const servi = /data-dossier="([0-9a-f]{16})"/.exec(html)?.[1];
  if (!servi) out.push(`fiche ${id} : page sans empreinte de dossier (version précédente encore servie ?)`);
  else if (servi !== attendu) out.push(`fiche ${id} : dossier servi ${servi}, dossier autorisé ${attendu} (version précédente encore servie ?)`);
  const absentes = (dossier.deroule || []).filter((e) => !page.includes(plat(e.texte).slice(0, 50)));
  if (absentes.length) out.push(`fiche ${id} : ${absentes.length} étape(s) du dossier approuvé absente(s) de la page servie (version précédente encore servie ?)`);
  return out;
}
