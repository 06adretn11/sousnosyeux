// =====================================================================
// web/src/lib/fiche.ts — UNE mémoire, plusieurs profondeurs de lecture.
//
//   Neon ──► data/cases.json        (fiche : état, sources)        → Home
//   Neon ──► data/evenements.json   (événements validés)           → fiche ET déroulé du Hub  (scripts/project-evenements.mjs)
//   data/hub-matiere/*.json         (matière éditoriale attribuée : déroulé sourcé, réactions, inconnues) → fiche ET Hub
//
// Un événement validé dans Neon et une entrée de dossier qui le porte (`event_id`) sont UN SEUL fait : sa date et son type viennent
// de Neon dès que Neon les connaît (jamais effacés par un `null`), le texte attribué reste éditorial. Un événement validé que le
// dossier ne porte pas encore est AJOUTÉ au déroulé — de la fiche comme du Hub : aucune seconde rédaction.
// =====================================================================
import casesDoc from '../../../data/cases.json';
import evenementsDoc from '../../../data/evenements.json';
import holdsDoc from '../../../data/publication-holds.json';
import { chargerHub, chargerHubBrut, carteReaction } from './hub-matiere';
import { hashDossier } from '../../../scripts/lib/fiche-page.mjs';

export const HUBS: Record<string, { titre: string; url: string }> = {
  'paris-11e': { titre: 'Paris 11e', url: '/territoires/paris-11e/' },
  'bordeaux-gironde': { titre: 'Bordeaux / Gironde', url: '/territoires/bordeaux-gironde/' },
  'hautes-alpes': { titre: 'Hautes-Alpes', url: '/territoires/hautes-alpes/' },
  'landes': { titre: 'Landes', url: '/territoires/landes/' },
  // Hubs COMPOSÉS puis approuvés : déclarés par la projection (evenements.json → hubs_approuves), sans édition de code.
  ...Object.fromEntries(Object.entries((evenementsDoc as any).hubs_approuves ?? {}).map(([s, a]: [string, any]) => [s, { titre: a.titre, url: `/territoires/${s}/` }])),
};
const ISOLES = 'isoles';
const TYPE_NEON: Record<string, string> = {
  'décision': 'decision', voie_de_recours: 'appel', mise_en_examen: 'mise_en_examen', 'enquête': 'enquete',
  suspension: 'mesure_etablissement', 'mesure_procédurale': 'decision', 'réponse_institutionnelle': 'mesure_collectivite', mobilisation: 'mobilisation',
};
const holds = new Set((holdsDoc as any).holds.map((h: any) => h.case_id));
/** Fiches individuelles APPROUVÉES (revue Telegram) et dont l'empreinte est celle du dossier actuel : seules celles-ci ont une page publique. */
export const fichesApprouvees = (): string[] => Object.keys((evenementsDoc as any).fiches_approuvees ?? {});
export const fichePubliee = (id: string): boolean => fichesApprouvees().includes(id);
export const evenementsDe = (id: string): any[] => (evenementsDoc as any).affaires[id] ?? [];
/** Informations validées destinées à CETTE fiche (rattachement explicite) : une seule information, jamais recopiée ; la fiche ne demande aucune nouvelle approbation. */
export const matiereFiche = (id: string): any[] => ((evenementsDoc as any).matiere ?? []).filter((m: any) => m.destinations?.fiche === id);

/**
 * Titre et description d'une fiche (règle B validée le 09/11/2026) : identification documentaire NEUTRE, identique pour toutes les fiches
 * approuvées quel que soit leur état judiciaire. Sources : le libellé public de l'affaire (H1 de la fiche) et sa commune ; le rôle publié
 * sur la carte seulement pour départager de vrais homonymes établissement + commune parmi les fiches approuvées. Aucun état, compte ni fait.
 */
export function identificationFiche(id: string): { titre: string; description: string } {
  const parId = (x: string) => (casesDoc as any).cases.find((c: any) => c.case_id === x);
  const c = parId(id);
  const nom = c.etablissement.charAt(0).toLocaleUpperCase('fr') + c.etablissement.slice(1);
  const lieu = c.etablissement.toLocaleLowerCase('fr').includes(c.commune.toLocaleLowerCase('fr')) ? '' : ` (${c.commune})`;
  const homonyme = fichesApprouvees().some((x) => x !== id && parId(x)?.etablissement === c.etablissement && parId(x)?.commune === c.commune);
  const ident = `${nom}${lieu}${homonyme && c.role_mis_en_cause ? ` — ${c.role_mis_en_cause}` : ''}`;
  return {
    titre: `${ident} : dossier et sources · sousnosyeux`,
    description: `${ident}. Déroulé de l’affaire, informations attribuées à leurs sources et points non établis.`,
  };
}

/** Dossier éditorial d'une affaire : celui de son hub, sinon celui des affaires isolées (même forme). */
export function dossierDe(id: string): { hub: string | null; d: any | null } {
  for (const h of Object.keys(HUBS)) {
    const d = chargerHub(h).matiere.dossiers?.[id];
    if (d) return { hub: h, d };
  }
  try { const d = chargerHub(ISOLES).matiere.dossiers?.[id]; if (d) return { hub: null, d }; } catch { /* pas de fichier */ }
  return { hub: null, d: null };
}

/** Dossier tel qu'ÉCRIT dans data/hub-matiere (avant l'ajustement d'affichage des inconnues par une information validée) : c'est lui que porte l'empreinte approuvée. */
export function dossierBrutDe(id: string): any | null {
  for (const h of Object.keys(HUBS)) { const d = chargerHubBrut(h).matiere.dossiers?.[id]; if (d) return d; }
  try { return chargerHubBrut(ISOLES).matiere.dossiers?.[id] ?? null; } catch { return null; }
}

/** Déroulé commun (fiche + Hub) : entrées du dossier, dates/types alignés sur Neon, événements validés manquants ajoutés. */
export function derouleCommun(id: string, d: any): { items: any[]; divergences: string[] } {
  const evs = evenementsDe(id);
  const dejaCartes = new Set(matiereFiche(id).map((m: any) => m.event_id).filter(Boolean)); // déjà restituée dans « Paroles et réactions » : pas deux fois
  const divergences: string[] = [];
  const portes = new Set<string>();
  const items = (d?.deroule ?? []).map((e: any) => {
    const ev = e.event_id ? evs.find((x) => x.event_id === e.event_id) : null;
    if (!ev) return e;
    portes.add(ev.event_id);
    const out = { ...e };
    if (ev.date) { if (ev.date !== e.date) divergences.push(`${id} : date Neon ${ev.date} ≠ dossier ${e.date ?? '—'}`); out.date = ev.date; out.date_nature = 'evenement'; }
    else if (e.date) divergences.push(`${id} : l'événement ${ev.type} est sans date dans Neon ; le dossier la porte (${e.date}) — à consolider`);
    return out;
  });
  // Événements validés que le dossier ne porte pas encore : ajoutés À LA SUITE (chronologique par construction : un UPDATE est le plus récent).
  // Opt-in par dossier (`suivre_neon: true`) : un hub existant ne change jamais de lui-même.
  for (const ev of d?.suivre_neon ? evs : []) {
    if (portes.has(ev.event_id) || dejaCartes.has(ev.event_id)) continue;
    items.push({ date: ev.date, date_nature: ev.date ? 'evenement' : 'inconnue', type: TYPE_NEON[ev.type] ?? 'contexte', acteur: null,
      texte: ev.libelle, source: ev.source ? { ...ev.source, acces: 'libre' } : { media: 'source non conservée', url: null } });
  }
  return { items, divergences };
}

export function ficheDe(id: string) {
  const c = (casesDoc as any).cases.find((x: any) => x.case_id === id);
  if (!c) throw new Error(`[fiche] ${id} absente de l'artefact public`);
  if (holds.has(id)) throw new Error(`[fiche] ${id} est sous HOLD : jamais affichable`);
  const { hub, d } = dossierDe(id);
  const { items, divergences } = derouleCommun(id, d);
  const cartes = matiereFiche(id).map(carteReaction);
  const dossier = { ...(d ?? {}), reactions: [...(d?.reactions ?? []), ...cartes] };
  // Empreinte du dossier FICHIER (neuf champs, calcul de l'approbation : hashDossier de scripts/lib/fiche-page.mjs) — ni le dossier fusionné avec les cartes de réaction,
  // ni le dossier dont une information validée a ajusté l'AFFICHAGE des inconnues. Exposée dans la page (`data-dossier`) pour que la vérification du site servi
  // compare la version réellement servie à la version autorisée.
  const brut = dossierBrutDe(id);
  return { c, hub: hub ? { id: hub, ...HUBS[hub] } : null, d: dossier, deroule: items, divergences, matiere: cartes.length, empreinte: brut ? hashDossier(brut) : null };
}
