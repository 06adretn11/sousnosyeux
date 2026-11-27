// =====================================================================
// scripts/lib/acteurs-terrain.mjs — bloc « Acteur de terrain » d'un dossier de fiche (champ optionnel `acteurs_de_terrain`).
//
// Ce que dit un collectif, une association ou un groupe de parents dans SES documents, présenté SANS en faire des faits : jamais « X est vrai »,
// toujours « selon le collectif… », « d'après le compte rendu… ». Réutilisable sur toute fiche (et, plus tard, tout Hub) : un champ, un composant.
//
// Forme d'un acteur :
//   { acteur, nature, presentation,
//     sources: { <clé>: { media, url, publie_le|null, libelle } },        // documents de l'acteur (jamais des « sources de l'affaire » : voir CATEGORIE_DOCUMENT)
//     groupes: [ { genre, titre, precision?, points: [ { texte, src: <clé> } ] } ] }
//
// Les sources de ces documents portent `categorie: 'document_acteur'` : elles n'entrent NI dans les sources de la carte, NI dans la mémoire de l'affaire
// (sources_a_rattacher) à l'approbation — un document militant n'est pas une source de presse.
// =====================================================================

export const CATEGORIE_DOCUMENT = 'document_acteur';

/** Les genres de propos — le libellé est imposé par le genre : « demande ≠ annonce ≠ réalisation ». */
export const GENRES = Object.freeze({
  demande: 'Demande du collectif',
  constat: 'Constat du collectif',
  annonce_rapportee: 'Annonce de la mairie, rapportée par le collectif',
  question_ouverte: 'Question restée sans réponse connue',
});

/** Avertissement FIXE : non éditable (le composant, le rendu Markdown et la QA lisent cette seule constante). */
export const AVERTISSEMENT = 'Ce bloc présente ce qu’un collectif dit et demande, d’après ses propres documents. Ce ne sont ni des faits établis ni la position de SousNosYeux.';

const LIMITE_POINT = 420;
// Un point ne nomme ni une personne (civilité + nom) ni un nombre exact d'enfants ; une qualification pénale n'est jamais attribuée à une personne.
const CIVILITE_NOM = /\b(?:Mme|Mlle|M\.|Mr|Me|Maître|Madame|Monsieur)\s+[A-ZÉÈÀ][\p{L}'’-]{2,}/u;
const NOMBRE_ENFANTS = /\b(?:\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quinze|vingt)\s+(?:enfants?|élèves?|victimes?|fillettes?|garçons?)\b/iu;
const QUALIFICATION_PENALE = /\b(?:agressions?\s+sexuelles?|viols?|attouchements?|pédocriminel(?:le)?s?)\b[^.]{0,60}\b(?:par|de la part de|commis(?:es?)? par)\b/iu;

/** → liste de problèmes (vide = conforme). Pure. */
export function validerActeurs(acteurs) {
  const pb = [];
  if (acteurs == null) return pb;
  if (!Array.isArray(acteurs)) return ['acteurs_de_terrain doit être une liste'];
  for (const [i, a] of acteurs.entries()) {
    const nom = `acteur ${i + 1}`;
    for (const k of ['acteur', 'nature', 'presentation']) if (!String(a?.[k] ?? '').trim()) pb.push(`${nom} : « ${k} » manquant`);
    const sources = a?.sources && typeof a.sources === 'object' ? a.sources : {};
    if (!Object.keys(sources).length) pb.push(`${nom} : aucune source (un document de l'acteur est exigé)`);
    for (const [k, s] of Object.entries(sources)) {
      if (!/^https:\/\/\S+$/.test(s?.url ?? '')) pb.push(`${nom} : source « ${k} » sans URL https`);
      if (!String(s?.media ?? '').trim() || !String(s?.libelle ?? '').trim()) pb.push(`${nom} : source « ${k} » sans média ou sans libellé`);
      if (s?.categorie !== CATEGORIE_DOCUMENT) pb.push(`${nom} : source « ${k} » sans categorie « ${CATEGORIE_DOCUMENT} »`);
      if (s?.publie_le != null && !/^\d{4}-\d{2}-\d{2}$/.test(s.publie_le)) pb.push(`${nom} : source « ${k} » : date de publication invalide`);
      if (/[?&]fbclid=/.test(s?.url ?? '')) pb.push(`${nom} : source « ${k} » : paramètre de suivi (fbclid) dans l'URL`);
    }
    if (a?.limites != null && (!Array.isArray(a.limites) || a.limites.some((l) => !String(l ?? '').trim() || String(l).length > LIMITE_POINT))) pb.push(`${nom} : « limites » doit être une liste de phrases courtes`);
    if (!Array.isArray(a?.groupes) || !a.groupes.length) pb.push(`${nom} : aucun groupe de propos`);
    for (const [j, g] of (a?.groupes ?? []).entries()) {
      const gn = `${nom}, groupe ${j + 1}`;
      if (!GENRES[g?.genre]) pb.push(`${gn} : genre inconnu « ${g?.genre} »`);
      if (!String(g?.titre ?? '').trim()) pb.push(`${gn} : titre manquant`);
      if (!Array.isArray(g?.points) || !g.points.length) pb.push(`${gn} : aucun point`);
      for (const [k, p] of (g?.points ?? []).entries()) {
        const pn = `${gn}, point ${k + 1}`;
        const t = String(p?.texte ?? '');
        if (!t.trim()) pb.push(`${pn} : texte manquant`);
        if (t.length > LIMITE_POINT) pb.push(`${pn} : plus de ${LIMITE_POINT} caractères`);
        if (!sources[p?.src]) pb.push(`${pn} : source « ${p?.src} » inconnue`);
        if (CIVILITE_NOM.test(t)) pb.push(`${pn} : nom de personne (civilité + nom)`);
        if (NOMBRE_ENFANTS.test(t)) pb.push(`${pn} : nombre exact d'enfants`);
        if (QUALIFICATION_PENALE.test(t)) pb.push(`${pn} : qualification pénale attribuée à une personne`);
      }
    }
  }
  return pb;
}

/** Toutes les références (documents de l'acteur), dédoublonnées par URL — pour la liste de sources de la page, jamais pour la mémoire de l'affaire. */
export function sourcesActeurs(acteurs) {
  const vus = new Map();
  for (const a of acteurs || []) for (const s of Object.values(a.sources || {})) if (s?.url && !vus.has(s.url)) vus.set(s.url, { url: s.url, media: s.media, d: s.publie_le ?? null });
  return [...vus.values()];
}

/** Nombre de points par acteur — pour dire ce qu'une approbation ajoute (message Telegram, rendu de revue). */
export const compterPoints = (acteurs) => (acteurs || []).reduce((n, a) => n + (a.groupes || []).reduce((m, g) => m + (g.points || []).length, 0), 0);
