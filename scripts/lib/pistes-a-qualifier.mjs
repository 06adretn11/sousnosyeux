// =====================================================================
// scripts/lib/pistes-a-qualifier.mjs — « pistes à qualifier » : actions et déclarations PUBLIQUES CONCRÈTES d'un compte suivi, à regarder par un humain.
//
// DEUX PORTÉES DISTINCTES. La portée de l'ACTEUR (le compte, son nom, son siège, un territoire qu'il annonce) ne dit RIEN du lieu d'une publication ni de son lien
// avec une affaire : seul le TEXTE de la publication compte (hashtags, lignes de signature et nom du compte retirés). Une piste n'est jamais rattachée à une affaire :
// aucun case_id, aucune proposition d'état, aucune fiche. Elle propose une DESTINATION, d'après le texte lu :
//   · HUB          — le texte NOMME un territoire (commune ou département d'une fiche de SNY, ville de Paris) : hub qui le couvre, ou « aucun hub ne couvre ce territoire » ;
//   · THEMATIQUE   — aucun territoire dans le texte : piste thématique sans territoire.
// (L'AFFAIRE, elle, n'est décidée qu'en amont, par le classement existant : lien démontré par le texte, ou « à confirmer ».)
//
// Ce qui remonte : un acte ou une déclaration publique CONCRÈTE du compte, d'un motif fermé — jamais une simple signature, jamais une réflexion générale :
//   PLAINTE_ACCUEIL, ARTICLE_PRESSE_CITE, LETTRE_OU_DEMANDE_PUBLIQUE, APPEL_A_TEMOINS, MOBILISATION_OU_DEMARCHE.
// =====================================================================
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { aplatir } from './capteurs.mjs';

export const VERSION_PISTES = 'pistes-a-qualifier-0.4.0';
export const LONGUEUR_MESSAGE_MAX = 3500; // Telegram refuse au-delà de 4096 caractères : marge pour les balises et le pied de message

/** Vocabulaire FERMÉ des motifs : le libellé est celui-ci, jamais la phrase du compte. */
export const MOTIFS = Object.freeze({
  PLAINTE_ACCUEIL: 'déclaration du compte sur l’accueil des plaintes (refus ou difficulté de dépôt déclarés par le compte lui-même)',
  ARTICLE_PRESSE_CITE: 'article ou journaliste cité par le compte (relais de presse : l’article reste à retrouver, il ne prouve pas ce que le compte en dit)',
  LETTRE_OU_DEMANDE_PUBLIQUE: 'lettre ouverte, pétition ou demande publique du compte',
  APPEL_A_TEMOINS: 'appel à témoins lancé par le compte',
  MOBILISATION_OU_DEMARCHE: 'mobilisation ou démarche publique du compte (rassemblement, conférence de presse, saisine, rencontre avec une institution)',
});

// ---------------------------------------------------------------------
// Texte lu
// ---------------------------------------------------------------------
const MOTS_SIGNATURE = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'et', 'collectif', 'famille', 'familles', 'notre', 'nos', 'combat', 'voix', 'leurs', 'leur']);
const normaliser = (s) => aplatir(String(s || '')).replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
const aliasDe = (organisme) => [organisme?.nom, ...(organisme?.alias || [])].filter(Boolean).map((a) => normaliser(String(a).replace(/\s[–—-]\s.*$/, ''))).filter((a) => a.length >= 5);

/**
 * Texte lu : sans hashtags ; une ligne n'est retirée que si elle est une PURE signature (une fois retirés le nom du compte, ses alias et les mots de signature,
 * il reste au plus UN mot). Une phrase courte qui porte une déclaration ET le nom du compte est CONSERVÉE.
 */
export function corpsSansSignature(corps, organisme) {
  const alias = aliasDe(organisme);
  return String(corps || '').replace(/#\S+/g, ' ').split(/\n/).filter((ligne) => {
    const n = normaliser(ligne);
    if (!alias.some((a) => n.includes(a))) return true; // pas de nom de compte : jamais une signature
    let reste = n; for (const a of alias) reste = reste.split(a).join(' ');
    return reste.split(' ').filter((m) => m && !MOTS_SIGNATURE.has(m)).length > 1;
  }).join('\n');
}

/**
 * Texte pour le TERRITOIRE : sur une ligne qui cite le nom du compte, tout ce qui le SUIT (« – Tarnos », « (40) », « depuis Tarnos ») est retiré : une signature n'est
 * jamais un lieu. (Conservateur : une phrase qui cite le nom du compte avant un lieu perd ce lieu et reste « thématique ».)
 */
export function corpsPourTerritoire(corps, organisme) {
  const alias = aliasDe(organisme);
  return corpsSansSignature(corps, organisme).split(/\n/).map((ligne) => {
    const n = normaliser(ligne);
    const a = alias.find((x) => n.includes(x));
    if (!a) return ligne;
    const premier = a.split(' ')[0];
    const mots = ligne.split(/(\s+)/);
    const k = mots.findIndex((m) => normaliser(m) === premier);
    return k >= 0 ? mots.slice(0, k).join('') : ligne;
  }).join('\n');
}

const phrasesDe = (para) => String(para || '').replace(/\n+/g, ' ').split(/(?<=[.!?»])\s+(?=[A-ZÀ-Ý«"“])/).map((p) => p.trim()).filter(Boolean);
const aplati = (s) => aplatir(s);

// ---------------------------------------------------------------------
// Motifs (une condition porte sur UNE PHRASE ; « ancrage » : sur la phrase et les quelques précédentes)
// ---------------------------------------------------------------------
const PLAINTE = /\bplaintes?\b/;
const REFUS = [
  /\brefus(?:e|ent|er|ee|es|ons)?\b[^.\n]{0,40}\bplaintes?\b/,
  /\brefus(?:e|ent|er|ee|es|ons)?\s+(?:de\s+|du\s+|le\s+)?(?:depot|recueil)\b/,
  /\b(?:ont|a|avons|vu|vue|vus|vues)\s+(?:ete\s+)?refus(?:e|es|ee|ees|er)\b[^.\n]{0,40}\b(?:depot|plainte)/,
  /\b(?:ne veut|ne voulait|ne voulaient|a refuse|ont refuse)\b[^.\n]{0,50}\bplaintes?\b/,
  /\b(?:pas pris|pas accepte|pas recueilli)\b[^.\n]{0,30}\bplaintes?\b/,
  /\bdissuad\w*[^.\n]{0,60}\b(?:deposer|plainte)/,
  /\bdifficult(?:e|es)\b[^.\n]{0,80}\b(?:deposer|depot)\b[^.\n]{0,30}\bplaintes?\b/,
  /\b(?:deposer|depot de) plaintes?\b[^.\n]{0,40}\b(?:difficile|complique|impossible|long|parcours)\b/,
];
const AUTORITE = /\b(?:gendarmerie|commissariat|police)\b/;
// Accueil DÉFAVORABLE seulement (le libellé du motif dit « refus ou difficulté ») : jamais « très bien accueillis » ni « pris au sérieux »
const ACCUEIL_DEFAVORABLE = /(?:\bmal\s+(?:accueilli|recu)(?:e|s|es)?\b|\bpas (?:ete )?(?:pris(?:e|es)? au serieux|ecoute(?:e|s|es)?|accueilli(?:e|s|es)?|entendu(?:e|s|es)?)\b|\baccueil (?:tres )?(?:froid|desagreable|decevant|inadapte)\b)/;
const HORS_ACCUEIL = /accueil de loisirs|centre d'accueil|accueil periscolaire|accueil collectif/;
// Revendication, rappel de droit, hypothèse : une phrase qui REFUSE le refus n'est pas une déclaration de refus
const REVENDICATION = /\b(?:ne se voie|ne se voient|ne peut|ne peuvent|ne doit|ne doivent|ne devrait|ne devraient|rappelons|rappel|que plus (?:aucun|aucune|jamais|personne)|(?:afin|pour) que (?:plus|personne|aucun|aucune|chaque|chacun)|il faut que|nous demandons que|exigeons que|plus jamais|jamais plus|si|aucune difficulte|sans difficulte|n'a pas (?:ete )?(?:mal|refuse)|n'ont pas (?:ete )?(?:mal|refuse)|n'avons pas (?:ete )?(?:mal|refuse|voulu)|contactez|contacter|nous aider|nous vous aidons)\b/;
const NOUS = /\b(?:nous|nos|notre)\b/; // le COMPTE parle de lui-même (« plusieurs familles » seul n'est pas un « nous »)
// Relais de presse : l'article, le journaliste ou le média est le sujet ; le fond du propos n'est pas celui du compte
const PRESSE_MOTS = /(?:\b(?:journaliste|reportage|interview|tribune)\b|\b(?:un|cet|l'|son|leur) article\b|\barticle (?:de|du|paru|publie|consacre|sur|dans)\b|\b(?:paru|publie|publiee|relaye|relayee) (?:dans|par|sur)\b)/;
const MEDIAS = /\b(?:Paris Normandie|Le Parisien|Le Monde|Libération|Mediapart|franceinfo|France Info|France 3|France Bleu|Sud Ouest|Ouest-France|La Dépêche|BFM(?:TV)?|20 Minutes|Le Figaro|L['’]Express|ActuMag|Public Sénat|Le Télégramme|Le Point|Europe 1|La Nouvelle République|Le Dauphiné|La Provence|Nice-Matin|Midi Libre|Le Progrès|La Voix du Nord|L['’]Union|Le Journal du Dimanche|Le JDD|Paris Match|RTL|LCI)\b/;
const ATTRIBUTION = /\b(?:selon|d['’]après|rapporte|rapportent|écrit|écrivent|révèle|révèlent)\s+(?:le |la |les |l['’])?[A-ZÉÈÀ]/; // « selon Le Télégramme », « d'après France 3 »
/** Cette phrase (texte ORIGINAL) relaie-t-elle la presse ? */
export const relaisPresse = (phrase) => PRESSE_MOTS.test(aplati(phrase)) || MEDIAS.test(phrase) || ATTRIBUTION.test(phrase);

const LETTRE = /(?:\blettres? ouvertes?\b|\bpetitions?\b|\bco-?signer\b|\ba signer\b|\bdemand(?:er|ons|ent|e) (?:la )?(?:mise en place|l'application|des mesures|une commission|des moyens)\b)/;
// « nous attendons / demandons des réponses… » : concret SEULEMENT si la publication s'ancre dans une annonce ou un événement précis, dans les phrases qui précèdent
const DEMANDE = /\bnous (?:attendons|demandons|exigeons|reclamons) (?:des |de la |de |une? |les )?(?:reponses?|explications|precisions|comptes|mesures|actions|mise en place)\b/;
const ANCRAGE = /(?:\ba annonce\b|\bont annonce\b|\bannonces?\b|\bplan d'action\b|\bapres les faits\b|\bsuite a\b|\bconseil municipal\b|\brapport\b|\bdecision\b)/;
const TEMOINS = /\bappels? a temoins\b/;
const INSTITUTION = '(?:maire|mairie|prefet|prefecture|rectorat|inspection|academie|ministre|ministere|procureur|parquet|defenseur des droits|elus|conseil municipal|conseil departemental|departement|region|deputes?|senat(?:eur|rice)?s?)';
const MOBILISATION = new RegExp(`(?:\\b(?:rassemblement|marche blanche|manifestation|conference de presse)\\b|\\bcourrier (?:a|au|aux)\\b|\\b(?:rencontre|rencontres|recu|recue|recus|recues) (?:avec |par )?(?:le |la |les |l')?${INSTITUTION}\\b|\\bauditionn\\w+|\\bavons saisi\\b|\\bsaisi(?:r|e|es)? (?:le|la|les) (?:procureur|defenseur|prefet|rectorat|ministre|maire)\\b)`);

/** Phrases du texte, à plat, avec leur paragraphe */
const plat = (paragraphes) => paragraphes.flatMap((para, p) => phrasesDe(para).map((texte) => ({ texte, p })));

function plainteAccueil(phrases) {
  for (const [i, s] of phrases.entries()) {
    const n = aplati(s.texte);
    if (!PLAINTE.test(n) || relaisPresse(s.texte) || REVENDICATION.test(n)) continue; // relais de presse ou revendication : pas une déclaration du compte
    const prec = phrases[i - 1] && phrases[i - 1].p === s.p && !relaisPresse(phrases[i - 1].texte) ? phrases[i - 1].texte : ''; // le « nous » de la phrase précédente ne franchit pas un relais de presse
    if (!NOUS.test(aplati(`${prec} ${s.texte}`).replace(/\b(?:contactez|contacter)[- ]nous\b|\bnous (?:contacter|aider)\b/g, ' '))) continue;
    if (REFUS.some((r) => r.test(n)) || (AUTORITE.test(n) && ACCUEIL_DEFAVORABLE.test(n.replace(HORS_ACCUEIL, ' ')))) return s.texte;
  }
  return null;
}
const premiere = (phrases, re) => phrases.find((s) => re.test(aplati(s.texte)))?.texte || null;
function demandeAncree(phrases) {
  for (const [i, s] of phrases.entries()) {
    if (!DEMANDE.test(aplati(s.texte))) continue;
    const contexte = phrases.slice(Math.max(0, i - 4), i + 1).map((x) => aplati(x.texte)).join(' ');
    if (ANCRAGE.test(contexte)) return s.texte;
  }
  return null;
}

/**
 * Signal PUBLIC CONCRET d'un texte, ou null. Le COMPTE (nom, siège, territoire annoncé) n'intervient pas : seul le texte lu.
 * @returns {{ motif_code: string, passage: string } | null}
 */
export function detecterSignal({ doc, organisme }) {
  const phrases = plat(corpsSansSignature(doc?.corps, organisme).split(/\n{2,}/));
  const trouve = (code, p) => (p ? { motif_code: code, passage: p.replace(/\s+/g, ' ').slice(0, 300) } : null);
  return trouve('PLAINTE_ACCUEIL', plainteAccueil(phrases))
    || trouve('LETTRE_OU_DEMANDE_PUBLIQUE', premiere(phrases, LETTRE) || demandeAncree(phrases))
    || trouve('APPEL_A_TEMOINS', premiere(phrases, TEMOINS))
    || trouve('MOBILISATION_OU_DEMARCHE', premiere(phrases, MOBILISATION))
    || trouve('ARTICLE_PRESSE_CITE', phrases.find((s) => relaisPresse(s.texte))?.texte || null);
}

// ---------------------------------------------------------------------
// Territoire du PROPOS (lu dans le texte, jamais déduit du compte) et hub qui le couvre
// ---------------------------------------------------------------------
// Noms de lieux qui sont aussi des mots, des prénoms, des marques ou des libellés vides : jamais un territoire
const AMBIGUS = new Set(['plaisir', 'rue', 'ham', 'albert', 'lens', 'nord', 'somme', 'gap', 'pau', 'vie', 'sens', 'mars', 'saint', 'sainte', 'chauny', 'roye', 'creil', 'laon', 'melun', 'dax',
  'orange', 'sache', 'delle', 'charly', 'la reunion', 'reunion', 'commune non precisee', 'non precisee', 'rots']);
const RE_ARR11 = /\b(?:paris 11(?:e|eme)|11(?:e|eme|er) arrondissement de paris|xi(?:e|eme|er)? arrondissement de paris)\b/; // « Paris 11 décembre » n'est PAS le 11e
const sansElision = (s) => s.replace(/(^| )[dl]'/g, '$1'); // « val d'oise » → « val oise », comme les mots du texte
const racineCommune = (c) => sansElision(normaliser(String(c || '').replace(/\(.*?\)/g, ' ').replace(/\s+\d+\s*(?:er|e|eme)?\s*$/i, '')));

/** Gazetteer de SNY : communes et départements des fiches (jamais une liste générale) + couverture des hubs de data/hub-matiere (« isolés » exclu). */
export function construireContexteTerritoire(fiches, dossierHubs) {
  const communes = new Map(); const departements = new Map();
  for (const f of fiches) {
    const c = racineCommune(f.commune);
    if (c.length >= 4 && !AMBIGUS.has(c) && !/^paris|^lyon|^marseille/.test(c)) communes.set(c, String(f.commune).replace(/\(.*?\)/g, '').trim());
    const d = sansElision(normaliser(f.departement));
    if (d.length >= 4 && !AMBIGUS.has(d) && d !== 'paris') departements.set(d, f.departement);
  }
  const hubs = [];
  if (dossierHubs && existsSync(dossierHubs)) {
    for (const nom of readdirSync(dossierHubs).filter((n) => n.endsWith('.json'))) {
      let h; try { h = JSON.parse(readFileSync(join(dossierHubs, nom), 'utf8')); } catch { continue; }
      const id = h._meta?.hub_id || nom.replace(/\.json$/, '');
      const ids = Object.keys(h.dossiers || {});
      if (id === 'isoles' || !ids.length) continue;
      const fs = fiches.filter((f) => ids.includes(f.case_id));
      hubs.push({ hub_id: id, communes: new Set(fs.map((f) => racineCommune(f.commune))), departements: new Set(fs.map((f) => sansElision(normaliser(f.departement)))) });
    }
  }
  return { communes, departements, hubs };
}

const MAJ = (mot) => { const c = mot[0]; return c !== c.toLowerCase() && c === c.toUpperCase(); };
/** Le nom (tokens normalisés) figure-t-il dans le texte ORIGINAL avec une majuscule initiale ? « sache » n'est pas « Saché ». */
function contientNom(mots, normaux, nom) {
  const t = nom.split(' ');
  for (let i = 0; i + t.length <= normaux.length; i++) if (t.every((x, k) => normaux[i + k] === x) && MAJ(mots[i])) return true;
  return false;
}

/**
 * @returns {{ libelle: string, hub_id: string|null, niveau: 'arrondissement'|'ville'|'commune'|'departement' } | null}  null = aucun territoire dans le texte
 */
export function territoireDuPropos(texte, ctx) {
  // les noms de médias portent un territoire (« Le Parisien », « Nice-Matin ») qui n'est pas celui du propos
  // (insensible à la casse : « selon LE PARISIEN » ; apostrophe typographique normalisée ; élision retirée : « l'Essonne », « d'Annonay »)
  const brut = String(texte || '').replace(/[’‘]/g, "'").replace(new RegExp(MEDIAS.source.replace(/\['’\]/g, "'"), 'gi'), ' ');
  const mots = brut.split(/[^\p{L}\p{N}']+/u).map((m) => m.replace(/^[dDlL]'(?=\p{L})/u, '')).filter(Boolean);
  const normaux = mots.map((m) => normaliser(m));
  const n = ` ${normaux.join(' ')} `;
  if (/\bparis\b|\bparisien(?:ne)?s?\b/.test(n)) {
    if (RE_ARR11.test(n)) return { libelle: 'Paris 11e', hub_id: ctx.hubs.find((h) => h.hub_id === 'paris-11e')?.hub_id || null, niveau: 'arrondissement' };
    return { libelle: 'Paris', hub_id: null, niveau: 'ville' };
  }
  for (const [cle, libelle] of [...ctx.communes].sort((a, b) => b[0].length - a[0].length)) if (contientNom(mots, normaux, cle)) return { libelle, hub_id: ctx.hubs.find((h) => h.communes.has(cle))?.hub_id || null, niveau: 'commune' };
  for (const [cle, libelle] of [...ctx.departements].sort((a, b) => b[0].length - a[0].length)) if (contientNom(mots, normaux, cle)) return { libelle, hub_id: ctx.hubs.find((h) => h.departements.has(cle) && h.hub_id !== 'paris-11e')?.hub_id || null, niveau: 'departement' };
  return null;
}

/** Piste complète d'un texte : signal + destination proposée. @returns {object|null} */
export function pisteDuTexte({ doc, organisme, ctx }) {
  const s = detecterSignal({ doc, organisme });
  if (!s) return null;
  const t = ctx ? territoireDuPropos(corpsPourTerritoire(doc.corps, organisme), ctx) : null;
  const destination = t ? 'HUB' : 'THEMATIQUE';
  const classement = t
    ? `territoire du propos lu dans le texte : ${t.libelle}${t.hub_id ? ` → hub « ${t.hub_id} »` : ' — aucun hub ne couvre ce territoire'}`
    : 'aucun territoire dans le texte lu : piste thématique sans territoire';
  return { ...s, destination, territoire: t?.libelle || null, hub_id: t?.hub_id || null, classement };
}

/** Identifiant stable d'une piste : la publication ET l'état de son texte (une légende modifiée est une nouvelle ligne ; le message ne garde que la plus récente par adresse). */
export const pisteId = (url, empreinte) => createHash('sha256').update(`${url}|${empreinte}`).digest('hex').slice(0, 16);

// ---------------------------------------------------------------------
// Message groupé
// ---------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const couper = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const jourFr = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : 'date non indiquée');
const visible = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;|&lt;|&gt;/g, '.').length;
const libelleDestination = (p) => (p.destination === 'HUB'
  ? (p.hub_id ? `hub « ${esc(p.hub_id)} » (territoire du propos : ${esc(p.territoire)}, lu dans le texte)` : `hub à orienter — territoire du propos : ${esc(p.territoire)}, lu dans le texte ; aucun hub ne couvre ce territoire`)
  : 'piste thématique, sans territoire (aucun lieu dans le texte)');

/**
 * UNE notification pour toutes les pistes en attente, dans une LONGUEUR bornée (Telegram refuse au-delà de 4096 caractères) et au plus `max` pistes ;
 * une publication retouchée (même adresse) n'apparaît qu'une fois, dans sa version la plus récente. Le reste part au passage suivant.
 * @returns {{ message: string, inclus: number, ids: string[], restantes: number }} `ids` : toutes les lignes représentées (versions plus anciennes d'une même adresse comprises)
 */
export function composerPistes(pistes, { max = 8, maxChars = LONGUEUR_MESSAGE_MAX } = {}) {
  const parUrl = new Map();
  for (const p of pistes) parUrl.set(p.url, { dernier: p, tous: [...(parUrl.get(p.url)?.tous || []), p] }); // la dernière version l'emporte
  const entrees = [...parUrl.values()];
  const pied = (n, total) => ['',
    'Ce sont des <b>déclarations ou actions d’un compte suivi, non vérifiées</b>. La portée du compte (son nom, son siège, un territoire qu’il annonce) <b>ne prouve ni le lieu de la publication ni son lien avec une affaire</b> : seul le texte lu compte. Aucune affaire rattachée, aucune fiche modifiée, aucun statut judiciaire changé.',
    'Aucun bouton : à qualifier par l’éditeur (retrouver une source de presse, vérifier, décider d’une destination).',
    ...(total > n ? [`${total - n} autre(s) piste(s) : prochain envoi.`] : [])].join('\n');
  const bloc = (e, i) => {
    const p = e.dernier;
    return [`<b>${i + 1}.</b> ${esc(jourFr(p.publie_le))} · auteur : ${esc(p.emetteur)}${p.compte_url ? ` — <a href="${esc(p.compte_url).replace(/"/g, '&quot;')}">compte</a>` : ''}`,
      `Signal : ${esc(MOTIFS[p.motif] || 'à qualifier')}.`,
      `Destination proposée : ${libelleDestination(p)}.`,
      ...(p.extrait ? [`« ${esc(couper(String(p.extrait).replace(/\s+/g, ' '), 240))} »`] : []),
      `Source : <a href="${esc(p.url).replace(/"/g, '&quot;')}">publication du compte</a>`, ''].join('\n');
  };
  let n = 0; let corps = '';
  const entete = (k) => `🔄 <b>MAINTENANCE</b> · 🧭 <b>PISTES À QUALIFIER</b> (${k}${entrees.length > k ? ` sur ${entrees.length}` : ''})\n\n`;
  for (const [i, e] of entrees.slice(0, max).entries()) {
    const essai = corps + bloc(e, i);
    if (n > 0 && visible(entete(n + 1) + essai + pied(n + 1, entrees.length)) > maxChars) break; // au moins UNE piste, jamais un message trop long
    corps = essai; n++;
  }
  const retenues = entrees.slice(0, n);
  return { message: entete(n) + corps + pied(n, entrees.length).replace(/^\n/, ''), inclus: n, ids: retenues.flatMap((e) => e.tous.map((p) => p.piste_id).filter(Boolean)), restantes: entrees.length - n };
}
/** Message seul (compatibilité des tests et de l'aperçu). */
export const messagePistes = (pistes, options) => composerPistes(pistes, options).message;

// ---------------------------------------------------------------------
// Écriture et envoi, avec un `sql` injecté (tag template Neon) : testables sans base
// ---------------------------------------------------------------------
const TABLE_ABSENTE = (e) => e?.code === '42P01' || /^relation "?pistes_a_qualifier"? does not exist/i.test(String(e?.message));

/** Écrit une piste SANS case_id (et sans territoire obligatoire). @returns {'ecrite'|'table_absente'|'erreur'} */
export async function ecrirePiste(sql, p) {
  try {
    await sql`insert into pistes_a_qualifier (piste_id, doc_key, emetteur, compte_url, url, publie_le, motif, destination, territoire, hub_id, classement, extrait)
              values (${p.piste_id}, ${p.doc_key}, ${p.emetteur}, ${p.compte_url || null}, ${p.url}, ${p.publie_le || null}, ${p.motif}, ${p.destination}, ${p.territoire || null}, ${p.hub_id || null}, ${p.classement || null}, ${p.extrait})
              on conflict (piste_id) do nothing`;
    return 'ecrite';
  } catch (e) { return TABLE_ABSENTE(e) ? 'table_absente' : 'erreur'; }
}

/**
 * UNE notification pour toutes les pistes en attente. Marquage APRÈS l'envoi, en UNE requête ; l'extrait est vidé une fois la piste notifiée (minimisation :
 * il peut citer des tiers). Échec d'envoi : rien n'est marqué (retenté). Table absente : rien.
 * @returns {{ statut: 'table_absente'|'aucune'|'a_blanc'|'envoye', envoyees?: number, restantes?: number }}
 */
export async function envoyerPistes({ sql, envoyer, max = 8, dry = false }) {
  let rows;
  try {
    rows = await sql`select piste_id, emetteur, compte_url, url, publie_le::text publie_le, motif, destination, territoire, hub_id, classement, extrait from pistes_a_qualifier where envoyee_le is null order by decouvert_le, created_at`;
  } catch (e) { if (TABLE_ABSENTE(e)) return { statut: 'table_absente' }; throw e; }
  if (!rows.length) return { statut: 'aucune' };
  const { message, inclus, ids, restantes } = composerPistes(rows, { max });
  const mid = await envoyer(message); // une erreur d'envoi remonte : rien n'est marqué
  if (dry) return { statut: 'a_blanc', envoyees: inclus, restantes };
  await sql`update pistes_a_qualifier set envoyee_le = now(), message_id = ${mid}, extrait = null where piste_id = any(${ids}) and envoyee_le is null`;
  return { statut: 'envoye', envoyees: inclus, restantes };
}
