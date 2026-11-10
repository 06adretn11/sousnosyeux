// =====================================================================
// scripts/lib/diffusion-sociale.mjs — DIFFUSION SOCIALE : éligibilité, message, idempotence. Fonctions PURES (aucun réseau, aucune base, aucun secret).
//
// Ce module ne décide JAMAIS de rien d'éditorial : il applique, sur un événement déjà APPROUVÉ par l'éditeur (GO Telegram) et déjà SERVI sur le site,
// des conditions fermées. En cas de doute : silence (la fonction rend { ok:false, raisons }), jamais une nouvelle classification.
//
// ÉVÉNEMENTS ÉLIGIBLES (V1) — deux types seulement :
//   new_case     nouvelle affaire dont la publication a reçu un GO explicite (publier-affaire --go) APRÈS l'activation, sur un message qui portait la portée « relais social »
//   case_update  évolution judiciaire significative (statut qui AVANCE) validée par clic Telegram APRÈS l'activation, sur un message qui portait cette portée
// HORS AUTOMATISATION (décision éditoriale à prendre, jamais un défaut) : mobilisation / prise de parole (« importante » = un jugement), relaxe / non-lieu /
// classement (finalité non établie par la presse : cf. POC-09), correction, source ajoutée, mise à jour technique.
//
// Les textes ne sont composés QUE de champs publics déjà approuvés (établissement, commune, département, statut, média) et de la phrase officielle du site
// (web/src/lib/etat-wording.ts) : jamais le nom d'une personne, le nombre d'enfants, le rôle de la personne mise en cause, un détail des faits.
// =====================================================================

export const CANAUX = Object.freeze(['x', 'facebook', 'instagram']);
export const FENETRE_SOURCE_JOURS = 7;
export const LIMITE_X = 280;
export const LONGUEUR_LIEN_X = 23; // X compte toute URL pour 23 caractères
const JOUR = 864e5;

/** Statuts pour lesquels une évolution est « significative » ET non ambiguë, du plus faible au plus fort. La relaxe / le classement en sont exclus (finalité). */
const ORDRE = ['plainte', 'enquête', 'mise en examen', 'procès', 'condamnation non définitive', 'condamnation définitive'];
/** Statuts diffusables pour une NOUVELLE affaire : une procédure policière ou judiciaire est établie (même ensemble que la publication, sans la relaxe). */
export const STATUTS_DIFFUSABLES = new Set(['enquête', 'mise en examen', 'procès', 'condamnation non définitive', 'condamnation définitive']);

export const rang = (s) => ORDRE.indexOf(s);
/** Évolution significative : le statut AVANCE vers un statut diffusable. */
export const evolutionSignificative = (avant, apres) => STATUTS_DIFFUSABLES.has(apres) && rang(apres) > rang(avant);

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const slugStatut = (s) => sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Clé d'idempotence d'un événement (avec le canal : clé primaire du journal). */
export const cleEvenement = (type, case_id, statut = null) => (type === 'new_case' ? `new_case|${case_id}` : `case_update|${case_id}|${slugStatut(statut)}`);
/** Identifiant court d'événement pour `utm_content` (aucune donnée personnelle). */
export const idUtm = (type, case_id, statut = null) => (type === 'new_case' ? case_id.toLowerCase() : `${case_id.toLowerCase()}-${slugStatut(statut)}`);

const jourIso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));

/** Date de source (AAAA-MM-JJ) → âge en jours à `now`. null si illisible. */
export function ageJours(dateIso, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateIso || ''));
  if (!m) return null;
  return (now.getTime() - Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)) / JOUR;
}

// ---------------------------------------------------------------------
// LIEN : fiche approuvée si elle existe, sinon ancre stable de la carte. UTM standard (Cloudflare Web Analytics ne les exploite pas : repère des liens, pas une attribution).
// Le canonical des pages ne dépend que du chemin : les paramètres n'y changent rien.
// ---------------------------------------------------------------------
export function lienDiffusion({ site, case_id, type, statut = null, canal, fiche = false }) {
  const q = new URLSearchParams({ utm_source: canal, utm_medium: 'social', utm_campaign: type, utm_content: idUtm(type, case_id, statut) });
  const base = site.replace(/\/$/, '');
  return fiche ? `${base}/affaires/${case_id.toLowerCase()}/?${q}` : `${base}/?${q}#affaire-${case_id.toLowerCase()}`;
}

// ---------------------------------------------------------------------
// MESSAGES : déterministes, factuels, sans modèle. `ph` = { phrase, mention } issus de la formulation officielle du site.
// ---------------------------------------------------------------------
const ENTETE = { new_case: 'Nouvelle affaire documentée par la presse', case_update: 'Évolution documentée par la presse' };

/** Contrôle de contenu : aucun champ interne ni donnée interdite ne doit avoir fuité dans le texte. */
export function controleContenu(texte, entree) {
  const t = sansAccents(texte).toLowerCase();
  const raisons = [];
  if (entree.role_mis_en_cause && t.includes(sansAccents(entree.role_mis_en_cause).toLowerCase())) raisons.push('rôle de la personne mise en cause présent');
  if (/\b\d+\s+enfants?\b/.test(t)) raisons.push('nombre d’enfants présent');
  if (/\.\.\.|…\s*$/.test(texte)) raisons.push('texte tronqué');
  return raisons;
}

/**
 * Compose le texte d'UN canal. Retourne { texte } ou { erreur } (jamais un texte tronqué : trop long ⇒ erreur ⇒ silence sur ce canal).
 * @param {{type:'new_case'|'case_update', canal:string, entree:object, ph:{phrase:string, mention:string|null}, lien:string|null}} a
 */
export function composerMessage({ type, canal, entree, ph, lien }) {
  const etab = String(entree.etablissement || '').trim();
  const commune = String(entree.commune || '').trim();
  if (!etab || !commune || !ph?.phrase) return { erreur: 'champ approuvé manquant (établissement, commune ou phrase d’état)' };
  const lieu = `${etab}, ${commune}`;
  let texte;
  if (canal === 'x') {
    const avec = (mention) => [`${ENTETE[type]} — ${lieu}.`, ph.phrase, mention, lien].filter(Boolean).join(' ');
    const longueur = (s) => s.length - (lien ? lien.length - LONGUEUR_LIEN_X : 0);
    texte = [avec(ph.mention), avec(null)].find((s) => longueur(s) <= LIMITE_X);
    if (!texte) return { erreur: `texte X > ${LIMITE_X} caractères même sans mention` };
  } else if (canal === 'facebook') {
    texte = [`${ENTETE[type]} — ${lieu}${entree.departement ? ` (${entree.departement})` : ''}.`, '', ph.phrase, ph.mention || null, '', `Sources, méthode et droit de réponse : ${lien}`].filter((l) => l !== null).join('\n');
  } else if (canal === 'instagram') {
    // Une légende n'est pas cliquable : on ne présente JAMAIS un lien comme tel ; le profil renvoie vers le site.
    texte = [`${ENTETE[type]} — ${lieu}${entree.departement ? ` (${entree.departement})` : ''}.`, '', ph.phrase, ph.mention || null, '', 'Sources, méthode et droit de réponse : lien dans la bio (sousnosyeux.org).'].filter((l) => l !== null).join('\n');
  } else return { erreur: `canal inconnu : ${canal}` };
  const fuite = controleContenu(texte, entree);
  return fuite.length ? { erreur: `contrôle de contenu : ${fuite.join(' ; ')}` } : { texte };
}

// ---------------------------------------------------------------------
// ÉLIGIBILITÉ — toutes les conditions de B3. Silence par défaut.
// ---------------------------------------------------------------------
/**
 * @param {object} ev   { type, case_id, go_at:Date, envoi_at:Date|null, statut_avant?, statut_apres?, source_date: 'AAAA-MM-JJ'|null }
 * @param {object} ctx  { now:Date, depuis:Date|null, holds:Set, publication_status, retire:boolean, entree:object|null (artefact public), servi:boolean|null }
 * @returns {{ok:boolean, raisons:string[]}}  les raisons ne contiennent ni nom ni lieu (logs publics)
 */
export function evaluerEvenement(ev, ctx) {
  const r = [];
  if (!['new_case', 'case_update'].includes(ev.type)) return { ok: false, raisons: ['type d’événement non diffusable (correction, source ajoutée, mise à jour technique, mobilisation…)'] };
  if (!ctx.depuis) r.push('activation non datée (SNY_DIFFUSION_DEPUIS) : aucune diffusion');
  else {
    if (!(ev.go_at instanceof Date) || ev.go_at < ctx.depuis) r.push('GO antérieur à l’activation : aucune approbation rétroactive de diffusion');
    if (!(ev.envoi_at instanceof Date) || ev.envoi_at < ctx.depuis) r.push('message d’approbation antérieur à l’activation (sans la portée « relais social ») ou introuvable');
  }
  if (ctx.publication_status !== 'publiée') r.push('affaire non publiée ou retirée');
  if (ctx.retire) r.push('retrait ou revue « retirer » postérieur au GO');
  if (ctx.holds?.has(ev.case_id)) r.push('sous HOLD de publication');
  const e = ctx.entree;
  if (!e) r.push('absente de l’artefact public');
  else {
    if (typeof e.lat !== 'number' || typeof e.lng !== 'number') r.push('aucune coordonnée publique');
    if (!STATUTS_DIFFUSABLES.has(e.statut_judiciaire)) r.push('statut judiciaire ambigu ou non diffusable');
    if (ev.type === 'case_update' && e.statut_judiciaire !== ev.statut_apres) r.push('le statut public n’est pas celui de l’évolution approuvée');
  }
  if (ev.type === 'case_update' && !evolutionSignificative(ev.statut_avant, ev.statut_apres)) r.push('évolution non significative (statut inchangé, en recul ou ambigu)');
  if (ctx.servi !== true) r.push('page non (encore) servie à l’identique sur le site');
  const age = ageJours(ev.source_date, ctx.now);
  if (age === null) r.push('date de source absente ou illisible : silence');
  else if (age < -1) r.push('date de source dans le futur : silence');
  else if (age >= FENETRE_SOURCE_JOURS) r.push(`source publiée il y a ${Math.floor(age)} jours (> ${FENETRE_SOURCE_JOURS})`);
  return { ok: r.length === 0, raisons: r };
}

/** Date de source d'une nouvelle affaire : la source la PLUS RÉCENTE de la fiche publique (celle qui rend l'information d'actualité). */
export function dateSourceNouvelleAffaire(entree) {
  const d = (entree?.sources || []).map((s) => jourIso(s.publication_date)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  return d.length ? d[d.length - 1] : null;
}

// ---------------------------------------------------------------------
// ÉTAT DE DIFFUSION ↔ ÉTAT DISTANT : distinguer « soumis », « programmé », « envoyé » et « vérifié ». PURE.
// ---------------------------------------------------------------------
/** Traduit le statut Buffer (draft|error|needs_approval|scheduled|sending|sent) et le permalien en état de journal. */
export function etatDepuisBuffer(post) {
  if (!post) return { etat: null, erreur: 'post introuvable côté Buffer' };
  switch (post.status) {
    case 'sent': return post.externalLink ? { etat: 'verifie', permalien: post.externalLink, envoye_at: post.sentAt || null } : { etat: 'envoye', permalien: null, envoye_at: post.sentAt || null };
    case 'scheduled': case 'sending': return { etat: 'programme' };
    case 'error': return { etat: 'echec', erreur: String(post.error?.message || post.error || 'erreur de publication signalée par Buffer').slice(0, 300) };
    default: return { etat: 'echec', erreur: `statut Buffer inattendu : ${String(post.status).slice(0, 40)} (brouillon ou approbation requise : la diffusion n’est pas automatique)` };
  }
}

/**
 * Signature qui retrouve un post côté Buffer même si le texte a été légèrement normalisé : l'identifiant d'événement du lien (utm_content), sinon le texte entier
 * (espaces normalisés — Instagram n'a pas de lien).
 */
export function signatureTexte(texte) {
  const m = /utm_content=([a-z0-9-]+)/.exec(texte);
  return m ? `utm_content=${m[1]}` : String(texte).replace(/\s+/g, ' ').trim();
}

/** Délai de grâce avant de retenter un createPost dont la réponse était incertaine ET dont aucun post n'a été retrouvé côté Buffer. */
export const GRACE_REESSAI_MIN = 15;

// ---------------------------------------------------------------------
// PORTÉE DU GO (B4) : un seul GO éditorial — le clic Telegram — couvre la publication SUR SNY et le relais social strictement factuel. Cette ligne est ajoutée au
// message d'approbation UNIQUEMENT quand la diffusion est activée (SNY_DIFFUSION_ACTIVE=1) : elle dit la vérité du moment. L'éligibilité exige que le message envoyé
// APRÈS l'activation (donc porteur de cette ligne) soit celui qui a reçu le GO : les approbations antérieures ne valent jamais autorisation rétroactive.
// ---------------------------------------------------------------------
export function porteeRelais(type, env = process.env) {
  if (env.SNY_DIFFUSION_ACTIVE !== '1') return null;
  const quoi = type === 'case_update' ? 'cette évolution' : 'cette nouvelle affaire';
  const bouton = type === 'case_update' ? 'VALIDATE' : 'Ce GO';
  return `📣 ${bouton} vaut aussi relais social strictement factuel de ${quoi} (X, Facebook), sans autre validation : seulement si la page est servie, la source a moins de 7 jours et rien n’est retiré. Annulable quelques minutes avant l’envoi ; pas de second GO par canal.`;
}
