// =====================================================================
// scripts/lib/fiche-extraction.mjs — « que dit CE document, pour la fiche de CETTE affaire ? »
//
// Étape 2 du circuit de génération des fiches (scripts/generer-fiche.mjs) : un document lu → des éléments STRUCTURÉS, chacun relié à une
// citation littérale du corps. Le modèle PROPOSE ; tout ce qui sort d'ici est vérifié par des gardes déterministes, et ce qui ne passe
// pas est ÉCARTÉ avec sa raison (jamais corrigé en silence). Aucune connaissance extérieure n'est admise : un fait absent du corps n'existe pas.
//
// Ce module ne connaît aucun identifiant d'affaire : les gardes sont des règles de doctrine (citation entière, nombres, issue judiciaire,
// date explicite, noms propres, nombre d'enfants), pas des correctifs de cas.
// =====================================================================
import { createHash } from 'node:crypto';

export const TYPES_EVENEMENT = ['fait_rapporte', 'signalement', 'plainte', 'enquete', 'garde_a_vue', 'mise_en_examen', 'renvoi', 'audience', 'requisitions', 'decision', 'appel',
  'mesure_etablissement', 'mesure_collectivite', 'mesure_etat', 'communication_parquet', 'contexte'];
export const TYPES_ACTEUR = ['institution', 'parquet', 'magistrat', 'avocat_victimes', 'avocat_defense', 'collectivite', 'education_nationale', 'association', 'parent', 'temoin', 'autre'];
const ACTEURS_PUBLIABLES = new Set(['institution', 'parquet', 'magistrat', 'avocat_victimes', 'avocat_defense', 'collectivite', 'education_nationale', 'association']);

const SCHEMA = `{
  "pertinence": "CETTE_AFFAIRE" | "AFFAIRE_SOEUR" | "AUTRE_AFFAIRE" | "AMBIGU",
  "pertinence_raison": "une phrase : ce qui, dans le document, désigne (ou non) cette affaire",
  "personnes_mises_en_cause_nommees": ["nom ou prénom écrit dans le document, pour filtrage interne uniquement"],
  "faits_rapportes": [ { "texte": "...", "portee": "affaire" | "autre_affaire" | "territoire", "citation": "..." } ],
  "evenements": [ {
      "type": ${TYPES_EVENEMENT.map((t) => `"${t}"`).join(' | ')},
      "acteur": "autorité ou institution qui accomplit l'acte (tribunal, parquet, rectorat, mairie…)" | null,
      "texte": "une phrase factuelle attribuée (« Selon <média>, … » ou sujet institutionnel explicite)",
      "date": "YYYY-MM-DD" | "YYYY-MM" | null,
      "citation_date": "extrait littéral qui DATE l'événement (jour/mois/année écrits)" | null,
      "realisation": "realisee" | "annoncee" | "non_applicable",
      "portee": "affaire" | "etablissement" | "autre_affaire" | "territoire",
      "citation": "extrait littéral qui soutient la phrase" } ],
  "issue_judiciaire": null | {
      "nature": "condamnation" | "relaxe" | "non_lieu" | "classement" | "acquittement" | "renvoi_devant_juridiction" | "autre",
      "date": "YYYY-MM-DD" | null, "citation_date": "..." | null,
      "appel": "OUI" | "NON_RAPPORTE" | "INCONNU", "citation_appel": "..." | null,
      "definitive": "OUI" | "INCONNU", "citation_definitive": "..." | null,
      "citation": "extrait littéral de la décision" },
  "declarations": [ {
      "acteur": "nom + fonction écrits dans le document",
      "type_acteur": ${TYPES_ACTEUR.map((t) => `"${t}"`).join(' | ')},
      "a_propos": "sur quoi porte la déclaration",
      "portee": "affaire" | "etablissement" | "autre_affaire" | "territoire",
      "citation": "propos entre guillemets, copiés mot pour mot (≤ 300 caractères)" } ],
  "lacunes_declarees": [ { "texte": "ce que le document dit ne pas savoir / être en cours", "portee": "affaire" | "etablissement" | "autre_affaire" | "territoire", "citation": "..." } ]
}`;

export const SYSTEME = `Tu lis UN document de presse française pour construire la fiche d'une affaire suivie par un observatoire de violences sur des MINEURS dans des structures qui les accueillent. Tu EXTRAIS ; tu ne rédiges pas un article.

On te donne l'identité de l'affaire (telle que l'observatoire l'enregistre), d'éventuelles affaires « sœurs » proches, puis le corps du document.

PRINCIPES
1. Tu n'affirmes que ce que le document écrit. Aucune connaissance extérieure, même si tu crois connaître l'affaire. Un titre n'est pas un corps : tu n'as que le corps.
2. Chaque élément porte une "citation" : un extrait COPIÉ MOT POUR MOT du corps, assez complet pour soutenir la phrase. Pas de reformulation, pas de "[…]", pas de points de suspension. Si tu ne peux pas citer, tu n'écris pas l'élément.
3. Une fausse information est bien plus grave qu'un champ vide. Liste vide = réponse normale. Ne remplis rien pour faire plein.
4. PERTINENCE. "CETTE_AFFAIRE" seulement si le document désigne la même structure ET la même commune (ou, quand l'affaire enregistrée n'a pas de structure nommée, le même type de structure, la même commune, le même rôle de mis en cause et des faits compatibles). Si le document décrit une autre structure ou une autre commune : "AUTRE_AFFAIRE". S'il peut s'agir d'une affaire sœur listée : "AFFAIRE_SOEUR". Si rien ne permet de trancher : "AMBIGU". Dans ces trois derniers cas, laisse les autres champs vides.
5. PROTECTION. N'écris JAMAIS le nom d'une personne mise en cause (enseignant, animateur, directeur, parent…), ni son initiale, ni de détail qui l'identifie (âge exact, adresse). Dis « l'enseignant », « l'animateur ». N'écris JAMAIS le nombre exact d'enfants ou d'élèves concernés (dis « plusieurs enfants »). Aucun détail graphique ou sexuel des faits : qualification juridique seule. Le nom de la structure et de la commune sont autorisés. Liste dans "personnes_mises_en_cause_nommees" les noms de mis en cause que tu as VUS (ils servent à vérifier que tu ne les as pas écrits ailleurs).
6. PRÉSOMPTION D'INNOCENCE. Une plainte, une mise en examen, des réquisitions ne sont pas une condamnation. Des réquisitions, une peine « encourue » ou « requise » ne sont jamais une décision : type "requisitions". Distingue ce que dit le parquet, la défense, le tribunal.
7. DATES. "date" est la date de l'ÉVÉNEMENT, jamais celle de publication. Tu ne la donnes que si le document l'écrit (jour et mois, ou mois et année) et tu recopies l'expression dans "citation_date". « mardi », « hier », « il y a deux ans » ne sont pas des dates écrites : date = null.
8. NOMBRES. Peines, durées, montants : recopie exactement ce que dit le document ; si deux chiffres se contredisent dans le document, n'en choisis pas un, signale-le dans "lacunes_declarees".
9. ACTEURS ET MESURES. L'autorité qui accomplit un acte est la source de cet acte ; une partie qui annonce une intention ne l'établit pas. "realisation" = "annoncee" pour une mesure promise, prévue, envisagée ; "realisee" seulement si le document dit qu'elle a été prise. Ne rapproche jamais deux faits par une causalité que le document n'énonce pas.
10. DÉCISION. "issue_judiciaire" n'est renseignée que si le document rapporte une décision rendue (pas des réquisitions) CONTRE OU EN FAVEUR DE LA PERSONNE MISE EN CAUSE DE CETTE AFFAIRE — jamais celle d'une autre personne citée dans l'article. "definitive"="OUI" exige que le document l'écrive explicitement (« décision définitive », « devenue définitive », délai d'appel expiré) ; l'absence de mention d'appel ne rend rien définitif (alors "INCONNU"). "appel"="OUI" exige un appel interjeté ; le nom « cour d'appel » n'est pas un appel.
11. DÉCLARATIONS. Seulement des propos de personnes ou institutions NOMMÉES avec leur fonction (procureur, rectrice, maire, avocat, association) : jamais d'anonymes, de parents, d'élèves ni de témoins pour "type_acteur" institutionnel ; si un parent ou un témoin s'exprime, mets type_acteur "parent" ou "temoin" (il sera écarté). La citation est un propos que le document place ENTRE GUILLEMETS, recopié tel quel et complet (pas un discours rapporté à la 3e personne) ; sans propos entre guillemets, pas de déclaration.
12. PORTÉE (champ "portee", obligatoire pour chaque événement, déclaration et lacune). "affaire" : concerne la personne mise en cause de CETTE affaire, ses faits, les victimes de CES faits, la procédure qui la vise, la réaction directe à CETTE affaire. "etablissement" : mesure ou position de la structure elle-même (direction, rectorat, gestionnaire) sur CETTE affaire. "autre_affaire" : une autre personne mise en cause, une autre procédure, un autre établissement cités dans l'article (même s'ils sont proches ou de la même série). "territoire" : plans d'action, chiffres globaux, politiques publiques, auditions parlementaires, contexte de ville, de département ou national. Un article sur une série d'affaires parle de plusieurs affaires : ne mets "affaire" que ce qui concerne la personne et l'établissement de CETTE affaire. ÉNONCÉ COLLECTIF : une phrase dont le SUJET est un ensemble de plusieurs affaires ou de plusieurs personnes (« ces trois enquêtes », « les trois autres ont été déférés », « trois hommes interpellés dans plusieurs écoles », « deux animateurs et le compagnon d'une institutrice ») n'est PAS un fait propre à CETTE affaire : étiquette-la "territoire", sauf si la phrase nomme cette affaire (son établissement ou sa personne mise en cause) parmi celles qu'elle vise. Une phrase au singulier sur la personne mise en cause ou l'établissement de CETTE affaire (« le salarié a été mis à pied », « le groupe devrait déposer plainte contre lui ») n'est JAMAIS collective, même si l'article évoque aussi d'autres affaires. Un passage consacré à cette affaire dans un article sur plusieurs (« À l'école X, … ») et les phrases qui le prolongent restent "affaire". Seuls "affaire" et "etablissement" seront retenus ; les autres sont classés sans toi — ne les supprime pas, étiquette-les.
13. UN ÉVÉNEMENT = UNE ENTRÉE. Regroupe dans UNE seule phrase le dispositif complet d'une décision (peine principale et peines complémentaires, mesures ordonnées par le tribunal : elles font partie de la décision, ce ne sont pas des "mesure_*"). Les types "mesure_*" sont réservés aux mesures prises par un établissement, une collectivité ou l'État (suspension, licenciement, cellule d'écoute…). N'ajoute pas deux entrées pour le même fait ; le type "contexte" n'est à utiliser qu'exceptionnellement.

Réponds UNIQUEMENT par un objet JSON conforme à ce schéma, sans texte autour :
${SCHEMA}`;

export const CONTRAT_VERSION = 'fiche-extraction-1+' + createHash('sha256').update(SYSTEME).digest('hex').slice(0, 8);

export const invite = ({ fiche, soeurs = [], article }) => `AFFAIRE SUIVIE
case_id: ${fiche.case_id}
structure : ${fiche.etablissement}${/non nomm/i.test(fiche.etablissement) ? ' (non nommée dans l\'observatoire)' : ''}
type de structure : ${fiche.type_structure}
commune : ${fiche.commune}${fiche.departement ? ` (${fiche.departement})` : ''}
rôle de la personne mise en cause : ${fiche.role_mis_en_cause}
nature des faits (catégorie de l'observatoire) : ${fiche.type_affaire}
état judiciaire enregistré : ${fiche.statut_judiciaire}
${soeurs.length ? `\nAFFAIRES SŒURS PROCHES (même commune ou même structure ; ne pas les confondre)\n${soeurs.map((s) => `- ${s.case_id} : ${s.etablissement}, ${s.commune}, rôle ${s.role_mis_en_cause}, état ${s.statut_judiciaire}`).join('\n')}\n` : ''}
DOCUMENT
média : ${article.media}
date de publication : ${article.publication_date ?? 'inconnue'}

CORPS DU DOCUMENT
"""
${String(article.body || '').slice(0, 20000)}
"""`;

/** Appel d'un modèle OpenRouter en JSON. Rend aussi les coûts observables (tokens, USD, latence). */
export async function appelerModele({ systeme, utilisateur, modele, cle = process.env.OPENROUTER_API_KEY }) {
  if (!cle) { const e = new Error('OPENROUTER_API_KEY absente'); e.code = 'CLE_ABSENTE'; throw e; }
  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://sousnosyeux.org', 'X-Title': 'sousnosyeux-generation-fiches' },
    body: JSON.stringify({ model: modele, messages: [{ role: 'system', content: systeme }, { role: 'user', content: utilisateur }], temperature: 0, response_format: { type: 'json_object' }, usage: { include: true } }),
    signal: AbortSignal.timeout(420000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${JSON.stringify(j).slice(0, 200)}`);
  let reponse = null;
  try { reponse = JSON.parse(String(j.choices?.[0]?.message?.content ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { /* JSON illisible : rendu null */ }
  return { reponse, cout: { latence_ms: Date.now() - t0, input_tokens: j.usage?.prompt_tokens ?? 0, output_tokens: j.usage?.completion_tokens ?? 0, cout_usd: j.usage?.cost ?? null } };
}

// ---------------------------------------------------------------------
// GARDES DÉTERMINISTES
// ---------------------------------------------------------------------
const plat = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** La citation ENTIÈRE figure-t-elle dans le corps (accents, ponctuation et apostrophes typographiques neutralisés) ? */
export const citationPresente = (corps, citation) => {
  const c = plat(citation);
  return c.length >= 12 && plat(corps).includes(c);
};

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
/**
 * Une date n'est affichée comme celle de l'événement que si le texte cité l'ÉCRIT : jour + mois (+ année), ou mois + année, ou jj/mm/aaaa.
 * Si l'année manque, elle doit être l'année de publication ou la précédente et rendre une date antérieure à la publication.
 */
export function dateAttestee(iso, expr, publieLe = null) {
  if (!iso || !expr) return false;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso);
  if (!m) return false;
  const [, an, mo, jo] = m;
  const t = plat(expr);
  const anneesTexte = [...t.matchAll(/\b(20\d{2})\b/g)].map((x) => x[1]);
  let moisOk = t.includes(MOIS[Number(mo) - 1]);
  let jourOk = !jo;
  if (jo) {
    jourOk = new RegExp(`\\b0?${Number(jo)}(?:er)? ${MOIS[Number(mo) - 1]}\\b`).test(t);
    const num = /\b(\d{1,2})\s*[\/.]\s*(\d{1,2})\s*[\/.]\s*(\d{2,4})\b/.exec(String(expr));
    if (num && Number(num[1]) === Number(jo) && Number(num[2]) === Number(mo)) { jourOk = true; moisOk = true; if (num[3].length === 4 && num[3] !== an) return false; }
  }
  if (!moisOk || !jourOk) return false;
  if (anneesTexte.length) return anneesTexte.includes(an);
  if (!publieLe) return false;
  const pub = Date.parse(publieLe), ev = Date.parse(jo ? iso : `${iso}-28`);
  return Number.isFinite(pub) && Number.isFinite(ev) && ev <= pub + 864e5 && pub - ev < 400 * 864e5;
}

const UNITES = '(?:an|ans|annee|annees|mois|semaine|semaines|jour|jours|euros?|heures?)';
const MOTS_NOMBRE = { zero: 0, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, mille: 1000 };
const MOTS_UN = /^(?:un|une|1)$/;
/** Valeurs chiffrées « N <unité> » d'un texte (mots ou chiffres, un/une compris quand une unité suit). */
export function quantites(texte) {
  const t = plat(texte).replace(/(\d)\s(\d{3})\b/g, '$1$2');
  const out = new Set();
  for (const m of t.matchAll(new RegExp(`\\b(\\d+|un|une|${Object.keys(MOTS_NOMBRE).join('|')})\\s+${UNITES}\\b`, 'g'))) {
    const v = /^\d+$/.test(m[1]) ? Number(m[1]) : MOTS_UN.test(m[1]) ? 1 : MOTS_NOMBRE[m[1]];
    out.add(`${v}`);
  }
  return out;
}
/** Toute durée/montant du texte rédigé figure-t-elle dans la citation ? Rend les valeurs non attestées. */
export const quantitesNonAttestees = (texte, citation) => {
  const c = quantites(citation);
  return [...quantites(texte)].filter((q) => !c.has(q));
};

// Issue judiciaire : racines qui dessinent le SENS d'une décision. Le texte rédigé ne peut pas en porter une que la citation ne porte pas
// (condamné ← relaxé est l'erreur irréparable). `dont`/`avec sursis` ne sont pas des issues : ils sont couverts par le contrôle des quantités.
// « Il vient d'écoper de 24 mois de prison » constate une condamnation sans le mot (France 3, FR-2026-0029) : seules les formes PASSÉES ou narratives
// comptent (« vient d'écoper », « a écopé », « écope de »), avec une peine dans la phrase ; « risque / pourrait / peut écoper » (infinitif) n'en est pas une.
const ECOPE_PEINE = /(?=.*\b(?:prison|emprisonnement|reclusion|detention|amende|sursis)\b)(?:\b(?:vient|viennent) d ecoper\b|\b(?:a|ont|avait|avaient) ecope(?:e|es|s)?\b|\becope(?:nt)? de\b)/;
const ISSUES = [
  ['condamnation', new RegExp(`\\bcondamn|${ECOPE_PEINE.source}`)], ['relaxe', /\brelax/], ['acquittement', /\bacquitt/], ['non_lieu', /\bnon[- ]lieu/], ['classement', /\bclass(?:e|ee|ement)\b.*\bsans suite|\bclassement sans suite|\bclasse sans suite/],
  ['mise_en_examen', /\bmis(?:e)?(?:s)? en examen|\bmise en examen/], ['definitif', /\bdefinitiv/], ['appel', /\b(?:fait appel|interjete|appel)\b/], ['incarceration', /\b(?:detention|incarcer|mandat de depot)/],
];
export function issuesPortees(s) {
  const t = plat(s);
  return ISSUES.filter(([, re]) => re.test(t)).map(([k]) => k);
}
export function issuesNonAttestees(texte, citation) {
  const c = new Set(issuesPortees(citation));
  // « non définitive » dans le texte suppose « définitiv » dans la citation seulement si le texte l'affirme ; « définitive » est traité à part (finalité).
  return issuesPortees(texte).filter((k) => !c.has(k));
}

// Nombre exact d'enfants / d'élèves (jamais publié) — mots ou chiffres suivis d'un nom d'enfant. « plusieurs » est la forme autorisée.
const RE_ENFANTS_BRUT = /\b(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|vingt|une? (?:dizaine|quinzaine|vingtaine|trentaine|quarantaine|cinquantaine))\s+(?:de\s+|d['’])?(?:[\p{L}'’-]{2,14}\s+){0,2}(?:enfants?|élèves?|eleves?|fillettes?|garçons|garcons|filles|mineurs?|mineures?|victimes|collégiens|collegiens|lycéens|lyceens|bébés|bebes|tout-petits|plaignants?|plaignantes?|écoliers|ecoliers|familles|parents)\b/iu;
// Un décompte élevé de plaintes (≥ 10, ou « une trentaine ») est un décompte de victimes déguisé : jamais publié (quelques plaintes restent dites).
const RE_NOMBRE_PLAINTES = /\b(?:1\d|[2-9]\d|\d{3,}|dix|onze|douze|treize|quatorze|quinze|vingt|trente|quarante|cinquante|une? (?:dizaine|quinzaine|vingtaine|trentaine|quarantaine))\s+(?:de\s+)?plaintes\b/i;
/** Nombre exact d'enfants/familles/élèves OU décompte élevé de plaintes : jamais publié. Même interface que l'ancienne expression (test). */
export const RE_NOMBRE_ENFANTS = { test: (t) => RE_ENFANTS_BRUT.test(t) || RE_NOMBRE_PLAINTES.test(t), exec: (t) => RE_ENFANTS_BRUT.exec(t) || RE_NOMBRE_PLAINTES.exec(t) };

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Occurrences d'un nom de mis en cause (ou de ses éléments de plus de 2 lettres) dans un texte. */
export function nomsPresents(texte, noms) {
  const t = plat(texte);
  const trouves = new Set();
  for (const n of noms || []) {
    const entier = plat(n);
    if (entier.length > 2 && new RegExp(`\\b${echapper(entier)}\\b`).test(t)) trouves.add(n);
    for (const part of entier.split(' ').filter((p) => p.length > 2)) if (new RegExp(`\\b${echapper(part)}\\b`).test(t)) trouves.add(n);
  }
  return [...trouves];
}

// Mots qui annoncent plutôt qu'ils ne constatent : une mesure dont la citation en porte ne peut être « réalisée ».
const RE_ANNONCE = /\b(?:va|vont|devrait|devraient|devra|devront|sera|seront|serait|seraient|envisage\w*|souhait\w*|prevoi\w*|prevu\w*|annonce\w*|compte|comptent|projet|promet\w*|s'engage\w*|a l'intention|dans les prochains)\b/;
export const sembleAnnoncee = (citation) => RE_ANNONCE.test(plat(citation).replace(/\s+/g, ' ')) ;

/**
 * Une citation du modèle qui commence bien dans le corps mais dérive ensuite (deux phrases accolées, un mot changé) n'est pas rejetée d'emblée si
 * la PHRASE qu'elle désigne est dans la source : on retient cette phrase, littérale, comme preuve. Trois conditions : un ancrage de ~45 caractères
 * retrouvé tel quel dans une phrase du corps, le texte rédigé soutenu par cette phrase (≥ 60 % de ses mots significatifs), et les mêmes gardes
 * (quantités, issues) que pour une citation exacte, appliquées à la phrase retenue.
 */
export function recupererCitation(corps, citation, texte) {
  const c = plat(citation);
  if (c.length < 40) return null;
  let ancre = '';
  for (const m of c.split(' ')) { if ((ancre + ' ' + m).trim().length > 45) break; ancre = (ancre + ' ' + m).trim(); }
  if (ancre.length < 30) return null;
  const phrases = String(corps).split(/\n+|(?<=[.!?…»])\s+(?=[A-ZÀ-Ý«"“])/).map((x) => x.trim()).filter((x) => x.length > 20);
  const i = phrases.findIndex((x) => plat(x).includes(ancre));
  if (i < 0) return null;
  const rec = phrases[i];
  const radicaux = (t) => plat(t.replace(/^Selon [^,]{1,60},\s*/i, '')).split(' ').filter((w) => w.length > 3).map((w) => w.slice(0, 5));
  const voulus = radicaux(texte), vus = new Set(radicaux(rec));
  if (!voulus.length || voulus.filter((w) => vus.has(w)).length / voulus.length < 0.6) return null;
  return rec.length > 600 ? null : rec;
}

/** La phrase du corps qui contient la citation (ou null). */
export function phraseContenant(corps, citation) {
  const c = plat(citation);
  if (c.length < 12) return null;
  const phrases = String(corps).split(/\n+|(?<=[.!?…»])\s+(?=[A-ZÀ-Ý«"“])/).map((x) => x.trim()).filter((x) => x.length > 20);
  return phrases.find((x) => plat(x).includes(c)) ?? null;
}

/**
 * Fusion de plusieurs extractions VÉRIFIÉES d'un même document (le modèle n'extrait pas deux fois les mêmes faits : mesuré 69 % d'événements appariés entre deux
 * passes, dont des décisions et recours présents dans une seule). Union des éléments — la déduplication est celle de la composition —, pertinence prudente
 * (accord de toutes les passes, sinon la plus réservée), issue conservée seulement si les passes ne se contredisent pas.
 */
export function fusionnerPasses(vs) {
  if (vs.length === 1) return vs[0];
  const ORDRE = ['AUTRE_AFFAIRE', 'AFFAIRE_SOEUR', 'AMBIGU', 'CETTE_AFFAIRE'];
  const pertinence = ORDRE.find((p) => vs.some((v) => v.pertinence === p)); // la plus réservée
  const out = { pertinence, pertinence_raison: vs.map((v) => v.pertinence_raison).filter(Boolean)[0] || '', noms: [...new Set(vs.flatMap((v) => v.noms))],
    faits: vs.flatMap((v) => v.faits), evenements: vs.flatMap((v) => v.evenements), declarations: vs.flatMap((v) => v.declarations), lacunes: vs.flatMap((v) => v.lacunes),
    hors_perimetre: vs.flatMap((v) => v.hors_perimetre || []), recuperees: vs.reduce((a, v) => a + (v.recuperees || 0), 0), ecartes: vs.flatMap((v) => v.ecartes), issue: null };
  if (pertinence !== 'CETTE_AFFAIRE') return { ...out, faits: [], evenements: [], declarations: [], lacunes: [] };
  const issues = vs.map((v) => v.issue).filter(Boolean);
  if (new Set(issues.map((i) => i.nature)).size > 1) out.ecartes.push({ element: 'issue_judiciaire', raison: 'ISSUE_INSTABLE_ENTRE_PASSES' });
  else if (issues.length) out.issue = issues.find((i) => i.date) ?? issues[0];
  return out;
}

/**
 * Regroupement des événements d'une affaire qui décrivent le MÊME fait (le lexique ne suffit pas : « une plainte est déposée » / « la lycéenne a porté plainte »).
 * Le modèle ne rédige rien : il rend des groupes d'indices ; la composition n'applique un groupe que sous garde déterministe (même type, dates et chiffres compatibles,
 * annonce ≠ réalisation). Mesuré sur 8 sources : 35 étapes dont ~15 doublons sans cette étape.
 */
export const SYSTEME_REGROUPEMENT = `Tu reçois la liste numérotée des événements retenus pour UNE affaire (type | date | phrase). Des articles différents décrivent souvent le même fait avec d'autres mots.
Rends les groupes d'indices qui désignent EXACTEMENT le même fait : même acte, mêmes acteurs, même moment.
NE REGROUPE PAS : deux plaintes de personnes différentes, une annonce et sa mise en œuvre, deux mesures distinctes, deux décisions différentes (détention puis remise en liberté), des chiffres ou des dates différents.
En cas de doute, ne regroupe pas. Réponds UNIQUEMENT par {"groupes":[[i,j],[k,l,m]]} — des groupes d'au moins 2 indices, sans chevauchement ; {"groupes":[]} s'il n'y a rien à regrouper.`;
export const invitesRegroupement = (evts) => evts.map((e, i) => `${i} | ${e.type} | ${e.date || '—'} | ${String(e.texte).replace(/^selon [^,]{1,60},\s*/i, '').slice(0, 220)}`).join('\n');
export function groupesValides(rep, n) {
  const vus = new Set(); const out = [];
  for (const g of Array.isArray(rep?.groupes) ? rep.groupes : []) {
    const idx = [...new Set((Array.isArray(g) ? g : []).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < n && !vus.has(i));
    if (idx.length >= 2) { idx.forEach((i) => vus.add(i)); out.push(idx); }
  }
  return out;
}

/** Un propos n'est attribuable que s'il est placé ENTRE GUILLEMETS dans le document : la citation doit tenir entièrement dans un segment « … » ou "…". */
export function citationEntreGuillemets(corps, citation) {
  const c = plat(citation);
  if (c.length < 12) return false;
  const segments = [...String(corps).matchAll(/«([^»]{12,})»|“([^”]{12,})”|"([^"]{12,})"/g)].map((m) => plat(m[1] ?? m[2] ?? m[3]));
  return segments.some((x) => x.includes(c));
}

// Âge du mis en cause (même par tranche) : un détail qui identifie sans informer.
export const RE_AGE_MIS_EN_CAUSE = /\b(?:d['’]une|dans la) (?:vingtaine|trentaine|quarantaine|cinquantaine|soixantaine) d['’]ann[ée]es|\b(?:trentenaire|quadragénaire|quinquagénaire|sexagénaire|septuagénaire|vingtenaire)s?\b|\bâgé(?:e)? de \d+ ans|,\s*\d{2} ans\s*,/i;

// Âge d'un ENFANT (« fillette de 5 ans », « fillettes âgées de 4 et 5 ans ») : recoupe l'identité d'une famille, jamais publié.
export const RE_AGE_ENFANT = /\b(?:fillettes?|garçons?|enfants?|élèves?|eleves?|bébés?|filles?|mineures?|mineurs?)\s+(?:âgé(?:e)?s?\s+)?de\s+\d+(?:\s+et\s+\d+)?\s+ans\b|\bâgé(?:e)?s?\s+de\s+\d+(?:\s+et\s+\d+)?\s+ans\b|\bnée?s?\s+en\s+(?:19|20)\d{2}\b/i;

// Propos d'une autorité qui rapportent l'état ou les craintes d'un proche de victime (« la mère d'une fillette s'inquiétait pour sa fille ») : détail de famille, jamais cité.
export const RE_PROCHE_VICTIME = /\b(?:sa|leur|ma|mon|son)\s+(?:fille|fils|enfant|petite)\b|\b(?:la|une)\s+(?:mère|maman)\s+d['’]une?\b|\b(?:le|un)\s+(?:père|papa)\s+d['’]une?\b/i;

// Détail graphique ou chiffré du contenu des faits (jamais publié) ; le décompte de fichiers/images est testé sur le texte normalisé (accents retirés).
const DETAIL_GRAPHIQUE = /\b(?:\d[\d ]*\s+(?:fichiers|images|photos|videos)|fellation|sodomi|penetr|masturb|attouchement|caress|zizi|sexe de|parties intimes|culotte|dechir|saign)/;

const nettoyerTexte = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isoOuNull = (d) => (/^\d{4}-\d{2}(-\d{2})?$/.test(String(d || '')) ? d : null);

/**
 * Vérifie la réponse du modèle contre le corps du document. Rend les éléments conservés et la liste des écartés (avec raison).
 * @returns {{pertinence:string, pertinence_raison:string, noms:string[], faits:object[], evenements:object[], issue:object|null, declarations:object[], lacunes:object[], ecartes:{element:string, raison:string, extrait?:string}[]}}
 */
export function verifier(rep, { corps, publieLe = null }) {
  const ecartes = [];
  const ecarte = (element, raison, extrait) => ecartes.push({ element, raison, ...(extrait ? { extrait: String(extrait).slice(0, 140) } : {}) });
  const noms = (rep?.personnes_mises_en_cause_nommees || []).map(nettoyerTexte).filter(Boolean);
  const sortie = { pertinence: ['CETTE_AFFAIRE', 'AFFAIRE_SOEUR', 'AUTRE_AFFAIRE', 'AMBIGU'].includes(rep?.pertinence) ? rep.pertinence : 'AMBIGU', pertinence_raison: nettoyerTexte(rep?.pertinence_raison), noms,
    faits: [], evenements: [], issue: null, declarations: [], lacunes: [], hors_perimetre: [], recuperees: 0, ecartes };
  if (sortie.pertinence !== 'CETTE_AFFAIRE') return sortie;
  // PORTÉE : seuls « affaire » et « établissement » entrent dans la fiche. Une portée absente ou inconnue est écartée (échec fermé).
  // Les éléments d'une autre affaire ou d'un territoire ne sont pas des erreurs du modèle : ils sont classés à part (matière possible d'un Hub).
  const dansLePerimetre = (element, portee, texte) => {
    if (portee === 'affaire' || portee === 'etablissement') return true;
    if (portee === 'autre_affaire' || portee === 'territoire') sortie.hors_perimetre.push({ element, portee, texte: nettoyerTexte(texte).slice(0, 160) });
    else ecarte(element, 'PORTEE_NON_ETABLIE', texte);
    return false;
  };

  // Garde commune à tout texte destiné à la page : nom d'un mis en cause, nombre d'enfants, détail graphique.
  const gardeTexte = (element, texte) => {
    const n = nomsPresents(texte, noms);
    if (n.length) { ecarte(element, 'NOM_MIS_EN_CAUSE', texte); return false; }
    if (RE_NOMBRE_ENFANTS.test(texte)) { ecarte(element, 'NOMBRE_EXACT_ENFANTS', texte); return false; }
    if (RE_AGE_MIS_EN_CAUSE.test(texte)) { ecarte(element, 'AGE_MIS_EN_CAUSE', texte); return false; }
    if (RE_AGE_ENFANT.test(texte)) { ecarte(element, 'AGE_ENFANT', texte); return false; }
    if (DETAIL_GRAPHIQUE.test(plat(texte))) { ecarte(element, 'DETAIL_GRAPHIQUE', texte); return false; }
    return true;
  };
  // Le texte rédigé doit être soutenu par SA citation : citation entière dans le corps, quantités, issues.
  // Rend la citation RETENUE (la citation du modèle, ou à défaut la phrase de la source qu'elle désigne), ou null si rien ne soutient le texte.
  const gardeSoutien = (element, texte, citation) => {
    let cit = citation;
    if (!citationPresente(corps, cit)) {
      const rec = recupererCitation(corps, cit, texte);
      if (!rec) { ecarte(element, 'CITATION_ABSENTE_DU_CORPS', citation); return null; }
      cit = rec; sortie.recuperees += 1;
    }
    const q = quantitesNonAttestees(texte, cit);
    if (q.length) { ecarte(element, `QUANTITE_NON_ATTESTEE(${q.join(',')})`, texte); return null; }
    const i = issuesNonAttestees(texte, cit);
    if (i.length) { ecarte(element, `ISSUE_NON_ATTESTEE(${i.join(',')})`, texte); return null; }
    return cit;
  };

  for (const f of rep.faits_rapportes || []) {
    const texte = nettoyerTexte(f?.texte);
    if (!texte || !dansLePerimetre('fait_rapporte', f?.portee, texte)) continue;
    const cit = gardeSoutien('fait_rapporte', texte, f?.citation);
    if (!cit || !gardeTexte('fait_rapporte', texte)) continue;
    sortie.faits.push({ texte, citation: nettoyerTexte(cit) });
  }

  for (const e of rep.evenements || []) {
    const texte = nettoyerTexte(e?.texte);
    const type = TYPES_EVENEMENT.includes(e?.type) ? e.type : null;
    if (!texte || !type) { ecarte('evenement', 'TYPE_OU_TEXTE_INVALIDE', texte || e?.type); continue; }
    if (!dansLePerimetre(`evenement:${type}`, e.portee, texte)) continue;
    const cit = gardeSoutien(`evenement:${type}`, texte, e.citation);
    if (!cit || !gardeTexte(`evenement:${type}`, texte)) continue;
    // Mesure : « réalisée » est rabaissée en « annoncée » dès que la citation annonce.
    let realisation = ['realisee', 'annoncee', 'non_applicable'].includes(e.realisation) ? e.realisation : 'non_applicable';
    if (/^mesure_/.test(type) && realisation === 'realisee' && sembleAnnoncee(cit)) realisation = 'annoncee';
    // Réquisitions : jamais une décision.
    let typeFinal = type;
    if (type === 'decision' && /\brequis|requisition|requiert|requerir/.test(plat(cit)) && !/\bcondamn|relax|acquitt|non lieu/.test(plat(cit))) typeFinal = 'audience';
    let date = isoOuNull(e.date), nature = 'article';
    if (date) {
      if (e.citation_date && citationPresente(corps, e.citation_date) && dateAttestee(date, e.citation_date, publieLe)) nature = date.length === 10 ? 'evenement' : 'approximative';
      else { ecarte(`evenement:${type}`, 'DATE_NON_ECRITE_DANS_LA_SOURCE', `${date} / ${e.citation_date ?? ''}`); date = null; }
    }
    sortie.evenements.push({ type: typeFinal, acteur: nettoyerTexte(e.acteur) || null, texte, date, date_nature: date ? nature : 'article', realisation, citation: nettoyerTexte(cit) });
  }

  const ij = rep.issue_judiciaire;
  if (ij && ij.citation) {
    if (!citationPresente(corps, ij.citation)) ecarte('issue_judiciaire', 'CITATION_ABSENTE_DU_CORPS', ij.citation);
    // Une décision rapportée au conditionnel (« aurait été classée sans suite ») n'est pas établie : jamais une issue (le conditionnel des FAITS, « se seraient déroulés », n'est pas visé).
    else if (/\b(?:aurait|auraient|serait|seraient)\s+(?:ete\s+)?(?:\w+\s+){0,2}(?:classee?s?|relaxee?s?|condamnee?s?|acquittee?s?)\b/.test(plat(ij.citation))) ecarte('issue_judiciaire', 'ISSUE_AU_CONDITIONNEL', ij.citation);
    else {
      let date = isoOuNull(ij.date); let nature = 'article';
      if (date) { if (ij.citation_date && citationPresente(corps, ij.citation_date) && dateAttestee(date, ij.citation_date, publieLe)) nature = date.length === 10 ? 'evenement' : 'approximative'; else { ecarte('issue_judiciaire', 'DATE_NON_ECRITE_DANS_LA_SOURCE', date); date = null; } }
      // Appel / caractère définitif : établis par un acte écrit, jamais par une absence (doctrine DOCTRINE_JUDICIAIRE_VERDICTS_1).
      let appel = ['OUI', 'NON_RAPPORTE', 'INCONNU'].includes(ij.appel) ? ij.appel : 'INCONNU';
      // Un appel est ÉTABLI par un acte accompli (« a fait appel », « appel interjeté », « le parquet a interjeté appel ») ; une INTENTION (« ferait appel », « souhaite faire appel », « va faire appel »,
      // « annonce qu'il fera appel ») ne l'établit pas — elle reste un événement « appel annoncé ».
      const citAppel = plat(ij.citation_appel);
      const acteAppel = /\b(?:ont|a|avait|avaient)\s+(?:fait|interjete)\s+appel|\bfait appel\b|\binterjete\b|\bappel (?:a ete|est) (?:interjete|forme|depose)|\bfont appel\b|\bfaisant appel\b/.test(citAppel);
      const intentionAppel = /\b(?:ferait|fera|feront|feraient|va|vont|souhaite|souhaitent|compte|comptent|entend|entendent|envisage\w*|veut|veulent|pourrait|devrait|annonce\w*|indique\w* que \w+ (?:ferait|fera))\b(?:\s+\w+){0,4}\s+(?:faire\s+)?appel\b/.test(citAppel) && !/\b(?:ont|a|avait)\s+(?:fait|interjete)\s+appel/.test(citAppel);
      if (appel === 'OUI' && !(ij.citation_appel && citationPresente(corps, ij.citation_appel) && acteAppel && !intentionAppel)) { ecarte('issue_judiciaire', 'APPEL_NON_ETABLI_PAR_ACTE', ij.citation_appel); appel = 'INCONNU'; }
      let definitive = ij.definitive === 'OUI' ? 'OUI' : 'INCONNU';
      if (definitive === 'OUI') {
        const c = plat(ij.citation_definitive);
        if (!(ij.citation_definitive && citationPresente(corps, ij.citation_definitive) && /\bdefinitiv/.test(c) && !/\bnon definitiv|pas definitiv|pas encore definitiv/.test(c))) { ecarte('issue_judiciaire', 'FINALITE_NON_ETABLIE_PAR_LE_TEXTE', ij.citation_definitive); definitive = 'INCONNU'; }
      }
      // La nature déclarée doit se lire dans la citation de la décision.
      const portees = issuesPortees(ij.citation);
      const lie = { condamnation: 'condamnation', relaxe: 'relaxe', acquittement: 'acquittement', non_lieu: 'non_lieu', classement: 'classement' }[ij.nature];
      // Seules les issues qui FONT l'état (condamnation, relaxe, non-lieu, classement, acquittement) deviennent « issue » ; une remise en liberté, un renvoi… restent des événements.
      if (!lie) ecarte('issue_judiciaire', `NATURE_HORS_ISSUES_RETENUES(${ij.nature})`);
      else if (!portees.includes(lie)) ecarte('issue_judiciaire', `NATURE_NON_ATTESTEE(${ij.nature})`, ij.citation);
      else sortie.issue = { nature: ij.nature, date, date_nature: date ? nature : 'article', appel, definitive, citation: nettoyerTexte(ij.citation), citation_appel: appel === 'OUI' ? nettoyerTexte(ij.citation_appel) : null, citation_definitive: definitive === 'OUI' ? nettoyerTexte(ij.citation_definitive) : null };
    }
  }

  for (const d of rep.declarations || []) {
    const citation = nettoyerTexte(d?.citation).replace(/^[«"]\s*|\s*[»"]$/g, '');
    if (!ACTEURS_PUBLIABLES.has(d?.type_acteur)) { ecarte('declaration', `ACTEUR_NON_PUBLIABLE(${d?.type_acteur ?? '?'})`, d?.acteur); continue; }
    if (!d.acteur || citation.length < 25 || citation.length > 340) { ecarte('declaration', 'ACTEUR_OU_CITATION_INVALIDE', citation); continue; }
    if (!citationPresente(corps, citation)) { ecarte('declaration', 'CITATION_ABSENTE_DU_CORPS', citation); continue; }
    if (!citationEntreGuillemets(corps, citation)) { ecarte('declaration', 'PROPOS_NON_ENTRE_GUILLEMETS', citation); continue; }
    if (!dansLePerimetre('declaration', d.portee, citation)) continue;
    if (RE_PROCHE_VICTIME.test(citation)) { ecarte('declaration', 'PROCHE_DE_VICTIME', citation); continue; }
    if (!gardeTexte('declaration', citation) || !gardeTexte('declaration', d.acteur)) continue;
    // Un propos COURT est souvent un fragment de phrase (« condamner avec la plus grande fermeté ») : on joint la phrase de l'article qui le contient,
    // si elle est sûre (aucun nom, nombre d'enfants, âge, détail) — le lecteur comprend alors de quoi il est question.
    let contexte = null;
    if (citation.length < 100 && /^[a-zà-ÿ]/.test(citation)) {
      const phrase = phraseContenant(corps, citation);
      const sur = (t) => !nomsPresents(t, noms).length && !RE_NOMBRE_ENFANTS.test(t) && !RE_AGE_MIS_EN_CAUSE.test(t) && !RE_AGE_ENFANT.test(t) && !DETAIL_GRAPHIQUE.test(plat(t)) && !RE_PROCHE_VICTIME.test(t);
      if (phrase && phrase.length <= 420 && plat(phrase).length > plat(citation).length * 1.3 && sur(phrase)) contexte = phrase;
    }
    // Un fragment (commence en minuscule, < 60 caractères) sans phrase de contexte sûre n'a pas de sens isolé (« de différentes enquêtes préliminaires ») : écarté.
    if (citation.length < 100 && /^[a-zà-ÿ]/.test(citation) && !contexte) { ecarte('declaration', 'FRAGMENT_SANS_CONTEXTE', citation); continue; }
    sortie.declarations.push({ acteur: nettoyerTexte(d.acteur), type_acteur: d.type_acteur, a_propos: nettoyerTexte(d.a_propos) || null, citation, ...(contexte ? { contexte } : {}) });
  }

  for (const l of rep.lacunes_declarees || []) {
    const texte = nettoyerTexte(l?.texte);
    if (texte && !dansLePerimetre('lacune', l?.portee, texte)) continue;
    if (texte && citationPresente(corps, l.citation) && gardeTexte('lacune', texte)) sortie.lacunes.push({ texte, citation: nettoyerTexte(l.citation) });
    else if (texte) ecarte('lacune', 'CITATION_ABSENTE_OU_TEXTE_INTERDIT', texte);
  }
  return sortie;
}
