#!/usr/bin/env node
// =====================================================================
// Rejeu ISOLÉ de la maintenance des deux Hubs pilotes (Paris 11e, Landes) — preuve des cinq comportements.
//
//   node rejeu-maintenance.mjs --base <worktree origin/main> --nouveau <worktree de la branche> --sortie <dossier>
//
// N'écrit QUE dans les deux worktrees jetables passés en argument (données restaurées par `git checkout -- data` après chaque
// scénario) et dans --sortie. Aucun accès à Neon, aucun envoi Telegram, aucun push : les « approbations » de ces scénarios sont
// SIMULÉES dans la copie locale et le disent. Les traces RÉELLES (production) sont citées dans le dossier, pas produites ici.
// Chaque scénario : données modifiées → `astro build` → texte visible des pages → comparaison avec le rendu de référence.
// =====================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? resolve(process.argv[i + 1]) : null; };
const BASE = arg('--base'), NOUV = arg('--nouveau'), SORTIE = arg('--sortie');
if (!BASE || !NOUV || !SORTIE) { console.error('usage : --base <wt> --nouveau <wt> --sortie <dossier>'); process.exit(2); }
for (const wt of [BASE, NOUV]) if (!existsSync(join(wt, 'web/node_modules'))) { console.error(`${wt} : web/node_modules absent (npm ci)`); process.exit(2); }
mkdirSync(SORTIE, { recursive: true });

const lib = async (f) => import(pathToFileURL(join(NOUV, f)).href);
const { construireMatiere, pagesSiValide } = await lib('scripts/lib/destinations.mjs');
const { lireMatiereValidee } = await lib('scripts/lib/matiere-validee.mjs');
const { messageEnrichissement } = await lib('scripts/lib/discovery-messages.mjs');
const { hashMatiere } = await lib('scripts/lib/hub-publication.mjs');
const { hashDossier } = await lib('scripts/lib/fiche-page.mjs');

// --- outils ----------------------------------------------------------------------------------------------------------
const lireJ = (wt, f) => JSON.parse(readFileSync(join(wt, f), 'utf8'));
const ecrireJ = (wt, f, v) => writeFileSync(join(wt, f), JSON.stringify(v, null, 2) + '\n', 'utf8');
const restaurer = (wt) => execFileSync('git', ['checkout', '--', 'data'], { cwd: wt });
const construire = (wt) => execFileSync(process.execPath, ['node_modules/astro/astro.js', 'build', '--silent'], { cwd: join(wt, 'web'), stdio: 'pipe' });
const texteHtml = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<(\/p|\/li|\/h[1-6]|\/summary|br|\/tr|\/div|\/section|\/article)[^>]*>/g, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
function pages(wt) {                                   // texte visible de chaque page HTML construite (clé = chemin)
  const out = {}, racine = join(wt, 'web/dist');
  const parcourir = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== '_astro') parcourir(p); } else if (f.endsWith('.html')) out[relative(racine, p).replace(/\\/g, '/')] = readFileSync(p, 'utf8'); } };
  parcourir(racine); return out;
}
const changees = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => texteHtml(a[k] ?? '') !== texteHtml(b[k] ?? '')).sort();
const article = (html, id) => { const i = html.indexOf(`id="${id}"`); if (i < 0) return ''; const d = html.lastIndexOf('<article', i); return texteHtml(html.slice(d, html.indexOf('</article>', i) + 10)); };
const bloc = (html, titre) => { const t = texteHtml(html); const i = t.indexOf(`\n${titre}\n`); return i < 0 ? '' : t.slice(i + 1, i + 1 + 2500); };
const P11 = 'territoires/paris-11e/index.html', LAN = 'territoires/landes/index.html', TARNOS = 'affaires/fr-2026-0115/index.html';
const id12 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
function contexte(wt) {                                // même contexte que project-evenements (fichiers du dépôt)
  const cases = lireJ(wt, 'data/cases.json').cases, ev = lireJ(wt, 'data/evenements.json');
  const hubs = Object.fromEntries(['paris-11e', 'bordeaux-gironde', 'hautes-alpes', 'landes'].map((h) => { const m = lireJ(wt, `data/hub-matiere/${h}.json`); return [h, { publie: true, groupes: m.reponses.map((g) => g.titre), items: Object.fromEntries(m.reponses.map((g) => [g.titre, g.items])) }]; }));
  return { publiques: new Set(cases.map((c) => c.case_id)), holds: new Set(lireJ(wt, 'data/publication-holds.json').holds.map((h) => h.case_id)), approuvees: new Set(Object.keys(ev.fiches_approuvees)),
    cases: new Map(cases.map((c) => [c.case_id, { commune: c.commune, departement: c.departement, etablissement: c.etablissement }])), hubs };
}
const resultats = [];
const consigner = (r) => { resultats.push(r); console.log(`${r.ok ? '✅' : '❌'} ${r.comportement} — ${r.cas}`); for (const o of r.observe) console.log(`     · ${o}`); };

// --- référence ---------------------------------------------------------------------------------------------------------
restaurer(NOUV); restaurer(BASE);
construire(NOUV); const REF = pages(NOUV);
const empreintes = { 'paris-11e': hashMatiere(lireJ(NOUV, 'data/hub-matiere/paris-11e.json')), landes: hashMatiere(lireJ(NOUV, 'data/hub-matiere/landes.json')) };

// === 1. ÉVOLUTION JUDICIAIRE VALIDÉE (rejeu historique documenté) =========================================================
// POC-05 (Alphonse-Baudin) : la carte publique est passée de « procès » à « relaxe + appel du parquet » le 07/10/2026 (commit 8d9e9fd,
// événements Neon bf3e73ae / 7ac3dda2, franceinfo 08/07/2026). On reconstitue le dossier du Hub tel qu'il aurait été écrit AVANT cette
// évolution (état « procès », déroulé arrêté à l'audience du 26/05/2026), puis on sert la carte réelle d'après l'évolution.
function dossierAvantDecision(wt) {
  const m = lireJ(wt, 'data/hub-matiere/paris-11e.json'); const d = m.dossiers['POC-05'];
  const audience = d.deroule.find((e) => e.type === 'audience');
  m.dossiers['POC-05'] = { statut_affiche: 'procès', etat_actuel: [`Selon franceinfo (26 mai 2026) : ${audience.texte}`], deroule: d.deroule.filter((e) => e.date && e.date <= '2026-05-26'), inconnues: ['Décision du tribunal : non rendue à la date de rédaction.'] };
  ecrireJ(wt, 'data/hub-matiere/paris-11e.json', m);
}
for (const [wt, version] of [[BASE, 'code actuel (origin/main)'], [NOUV, 'code proposé']]) {
  restaurer(wt); dossierAvantDecision(wt); construire(wt);
  const html = pages(wt)[P11]; const a = article(html, 'poc-05'); const t = texteHtml(html);
  const chip = /Relaxe \/ non-lieu \/ classement/.test(a) ? 'Relaxe / non-lieu / classement' : /\bProcès\b/.test(a) ? 'Procès' : '?';
  const ancienTexte = a.includes('Selon franceinfo (26 mai 2026) : Le procès se tient');   // la LECTURE d'état écrite pour « procès » (le déroulé, historique, reste)
  const tableau = t.slice(t.indexOf('Où en sont les procédures'));
  const ligneTableau = (tableau.match(/École maternelle Alphonse-Baudin[^\n]*/) || [''])[0].slice(0, 120);
  const bandeau = t.includes('Évolution enregistrée depuis la dernière mise à jour de cette page (École maternelle Alphonse-Baudin)');
  const attendu = version.startsWith('code proposé')
    ? 'le dossier affiche l’état validé de la carte (relaxe, appel) dans le wording partagé, retire la lecture écrite pour « procès », le signale ; un bandeau prévient que les repères peuvent ne pas en tenir compte'
    : '(référence) comportement actuel';
  const ok = version.startsWith('code proposé') ? chip.startsWith('Relaxe') && !ancienTexte && a.includes('rédigé avant cette évolution') && bandeau && /appel/i.test(a) : true;
  consigner({ comportement: '1. Évolution pertinente, documentée et approuvée', cas: `POC-05 relaxe + appel (historique, 07/10/2026) — ${version}`, nature: 'rejeu historique', environnement: `copie locale ${relative(resolve(SORTIE, '..'), wt) || wt}`, attendu,
    observe: [`étiquette d’état du dossier : ${chip}`, `lecture « le procès se tient » encore affichée comme état actuel : ${ancienTexte ? 'OUI' : 'non'}`, `bandeau de page : ${bandeau ? 'oui' : 'non'}`, `ligne « Où en sont les procédures » : ${ligneTableau}`], ok,
    defaut_constate: version.startsWith('code actuel') && chip === 'Procès' && ancienTexte ? 'la carte publique dit « relaxe, appel » ; le Hub continue d’afficher « Procès » et « le procès se tient » comme état actuel : contradiction entre surfaces' : null });
  restaurer(wt);
}

// === 2. INFORMATION VALIDÉE (chemin automatisé) — bons blocs, rien d'autre ===================================================
// Rejeu sur la copie de la branche : un fait de mobilisation validé pour Mées (affaire du Hub Landes, sans fiche approuvée) passe par la
// VRAIE fonction de projection (construireMatiere) ; on vérifie la page servie localement et l'absence de tout autre changement.
// Le fait est CONSTRUIT pour le rejeu (aucune mobilisation n'est documentée à Mées) : il éprouve le calcul, pas l'actualité.
{
  restaurer(NOUV);
  const fait = { id: id12('FR-2026-0116|Selon la presse, des parents ont tenu un rassemblement.|2026-09-24'), case_id: 'FR-2026-0116', nature: 'mobilisation', mesure: 'rassemblement', libelle: 'Selon la presse, des parents ont tenu un rassemblement.',
    realisation: 'réalisée', portee: 'établissement', acteur: 'parents', territoire: null, date: '2026-09-24', periode: null, source: { media: 'REJEU (fait construit)', url: 'https://example.invalid/rejeu', publie_le: '2026-09-25' }, event_id: null };
  const { matiere } = construireMatiere([fait], contexte(NOUV));
  const ev = lireJ(NOUV, 'data/evenements.json'); ev.matiere = [...ev.matiere, ...matiere].sort((a, b) => a.id.localeCompare(b.id)); ecrireJ(NOUV, 'data/evenements.json', ev);
  construire(NOUV); const P = pages(NOUV); const diff = changees(REF, P);
  const famille = bloc(P[LAN], 'Familles et associations d’aide aux victimes');
  const pos = famille.split('\n'); const iMob = pos.findIndex((l) => l.includes('des parents ont tenu un rassemblement')); const iReu = pos.findIndex((l) => l.includes('réunion publique à la mairie'));
  const ok = JSON.stringify(matiere[0]?.destinations) === JSON.stringify({ fiche: null, hubs: [{ hub: 'landes', groupe: 'Familles et associations d’aide aux victimes' }] }) && diff.length === 1 && diff[0] === LAN && iMob > iReu && P[LAN].includes('data-matiere="1"');
  consigner({ comportement: '1. Évolution pertinente, documentée et approuvée', cas: 'information validée → Hub Landes (chemin automatisé)', nature: 'rejeu (fait construit, approbation simulée)', environnement: 'copie locale de la branche',
    attendu: 'destination calculée = Hub Landes, bloc « Familles… » (pas de fiche : Mées n’a pas de fiche approuvée) ; ajout à sa place chronologique ; aucune autre page modifiée',
    observe: [`destinations calculées : ${JSON.stringify(matiere[0]?.destinations)}`, `pages dont le texte change : ${diff.join(', ') || 'aucune'}`, `ordre dans le bloc : réunion du 23/09 (ligne ${iReu}) puis rassemblement du 24/09 (ligne ${iMob})`], ok });
  restaurer(NOUV);
}

// === 3. INFORMATION SANS EFFET UTILE SUR LE HUB ==============================================================================
{
  const ctx = contexte(NOUV);
  // a) portée hors du Hub : une mesure nommée « Bordeaux » n'atteint jamais le Hub Landes.
  const bx = pagesSiValide([{ case_id: 'FR-2026-0113', nature: 'mesure', portee: 'territoire', territoire: 'Bordeaux', date: null }], ctx);
  // b) déjà écrite dans le Hub : le plan d'action de Tarnos du 07/10 (documenté, ICI 08/10) — la proposition le dit avant toute décision.
  const plan = { libelle_public: 'Selon la presse, la collectivité a annoncé un plan d’action pour renforcer l’encadrement des enfants.', realisation: 'annoncée', nature: 'mesure', portee: 'établissement', acteur: 'Ville de Tarnos', event_date: '2026-10-07', evidence: ['La municipalité a en effet présenté une série de mesures pour renforcer l’encadrement des enfants après la découverte de faits d’agressions sexuelles et de viols sur de très jeunes enfants au centre de loisirs communal.'] };
  const pagesPlan = pagesSiValide([{ case_id: 'FR-2026-0115', nature: 'mesure', portee: 'établissement', territoire: null, date: '2026-10-07' }], ctx);
  const msg = messageEnrichissement({ etablissement: 'Centre de loisirs municipal de Tarnos', commune: 'Tarnos', courant: 'mise en examen', media: 'ICI Pays Basque', publication_date: '2026-10-08', url: 'https://www.ici.fr/emissions/l-invite-d-ici-matin-pays-basque/violences-sexuelles-au-centre-de-loisirs-de-tarnos-il-y-aura-un-avant-et-un-apres-assure-le-maire-marc-mabillet-8534796' }, [plan], false, pagesPlan);
  writeFileSync(join(SORTIE, 'proposition-telegram-tarnos.txt'), msg.replace(/<\/?b>/g, '') + '\n', 'utf8');
  const ok = !bx.some((x) => /landes/.test(x)) && bx.some((x) => /bordeaux-gironde/.test(x)) && pagesPlan.some((x) => /déjà dans ce bloc à cette date/.test(x));
  consigner({ comportement: '2. Information sans effet utile sur le Hub', cas: 'mesure de portée « Bordeaux » ; plan de Tarnos déjà rédigé dans le Hub', nature: 'rejeu (calcul réel des destinations, aucune écriture)', environnement: 'fonctions pures sur les données de la branche',
    attendu: 'aucune page Landes pour une portée « Bordeaux » ; pour une information déjà écrite, la proposition le dit (doublon probable) au lieu de la présenter comme nouvelle',
    observe: [`portée « Bordeaux » → ${bx.join(' ; ') || 'aucune page'}`, `plan de Tarnos du 07/10 → ${pagesPlan.join(' ; ')}`, 'message Telegram rendu : proposition-telegram-tarnos.txt'], ok,
    limite: 'Le Hub rédigé n’est pas une mémoire de faits : la proposition est encore ENVOYÉE (signalée comme doublon probable) ; c’est la décision humaine (REJECT) qui évite le changement.' });
}

// === 4. REJEU D'UNE ÉVOLUTION DÉJÀ TRAITÉE ==================================================================================
{
  const ligne = (proposal) => ({ proposal_id: proposal, case_id: 'FR-2026-0116', applied_event_id: null, fait: { libelle_public: 'Selon la presse, des parents ont tenu un rassemblement.', nature: 'mobilisation', portee: 'établissement', realisation: 'réalisée', event_date: '2026-09-24', evidence: ['x'] }, commune: 'Mées', departement: 'Landes', etablissement: 'École de Mées', media: 'REJEU', url: 'https://example.invalid/rejeu', publie_le: '2026-09-25' });
  const sql = async () => [ligne('p-1'), ligne('p-2')];       // la même information validée deux fois (deux articles, deux décisions)
  const lus = await lireMatiereValidee(sql);
  const ctx = contexte(NOUV);
  const m1 = construireMatiere(lus, ctx).matiere, m2 = construireMatiere(await lireMatiereValidee(sql), ctx).matiere;
  restaurer(NOUV); construire(NOUV); const P2 = pages(NOUV); const diff = changees(REF, P2);
  const ok = lus.length === 1 && JSON.stringify(m1) === JSON.stringify(m2) && diff.length === 0;
  consigner({ comportement: '3. Rejeu d’une évolution déjà traitée', cas: 'même information validée deux fois ; projection et construction rejouées', nature: 'rejeu (fonctions réelles, aucune écriture)', environnement: 'copie locale de la branche',
    attendu: 'une seule information ; projection identique au rejeu ; site reconstruit identique', observe: [`informations lues : ${lus.length}`, `projection rejouée identique : ${JSON.stringify(m1) === JSON.stringify(m2)}`, `pages changées après reconstruction sans modification : ${diff.length}`], ok });
}

// === 5. PROPOSITION NON APPROUVÉE ===========================================================================================
{
  // La matière proposée n'est servie qu'après fusion sur main (build Cloudflare de production) : vérifié sur le site servi (lecture seule).
  let servie = null;
  try { const r = await fetch(`https://sousnosyeux.org/territoires/paris-11e/?v=${Date.now()}`); servie = r.ok ? texteHtml(await r.text()) : null; } catch { servie = null; }
  const propose = texteHtml(REF[P11]);
  const ok = servie !== null && servie.includes('Conclusions non publiées') && !servie.includes('rapport présenté le 15 octobre 2026') && propose.includes('rapport présenté le 15 octobre 2026');
  consigner({ comportement: '4. Proposition non approuvée', cas: 'cette proposition (branche non fusionnée) face au site de production', nature: 'observation réelle (lecture du site servi)', environnement: 'https://sousnosyeux.org (lecture seule)',
    attendu: 'le site servi garde la version approuvée ; la version proposée n’existe que sur la branche et son aperçu', observe: [servie === null ? 'site non lisible depuis ce poste' : `site servi : « Conclusions non publiées » ${servie.includes('Conclusions non publiées') ? 'présent' : 'absent'} ; rapport du 15/10 ${servie.includes('rapport présenté le 15 octobre 2026') ? 'présent' : 'absent'}`, `version proposée : rapport du 15/10 ${propose.includes('rapport présenté le 15 octobre 2026') ? 'présent' : 'absent'}`], ok });
}

// === 6. RECTIFICATION =======================================================================================================
{
  // a) éditoriale (dans la proposition) : aucune mention périmée ne subsiste à côté de sa correction.
  const t = texteHtml(REF[P11]), l = texteHtml(REF[LAN]);
  const restes = [/Conclusions non publiées/.test(t) && 'Sénat « conclusions non publiées »', /n'a pu lire que le titre/.test(t) && 'PARIS-009 « titre seul »', /À revoir avant publication/.test(t) && 'note interne PARIS-009',
    /sans confirmation de sa réalisation dans les sources lues : selon Sud Ouest, une réunion/.test(l) && 'réunion de Tarnos « non confirmée »'].filter(Boolean);
  // b) automatisée (rejeu) : une information validée rectifiée (réalisation « réalisée » → « annoncée ») remplace l'ancienne, jamais à côté.
  restaurer(NOUV);
  const ev = lireJ(NOUV, 'data/evenements.json'); const i = ev.matiere.findIndex((m) => m.id === 'aa9d4eb1d5fd');
  const ancien = ev.matiere[i].libelle, nouveau = 'Selon la presse, la collectivité a annoncé un renforcement de l’encadrement des enfants.';
  ev.matiere[i] = { ...ev.matiere[i], id: id12(`POC-07|${nouveau}|`), libelle: nouveau, realisation: 'annoncée' }; ev.matiere.sort((a, b) => a.id.localeCompare(b.id)); ecrireJ(NOUV, 'data/evenements.json', ev);
  construire(NOUV); const P = pages(NOUV); const diff = changees(REF, P); const tp = texteHtml(P[P11]);
  const n = ev.matiere.filter((x) => x.destinations.hubs.some((h) => h.hub === 'paris-11e')).length;
  const verif = P[P11].includes(`data-matiere="${n}"`) && P[P11].includes(nouveau.slice(0, 40).replace(/&/g, '&amp;'));     // même contrôle que verifier-site (ecartsHub)
  const ok = !restes.length && !tp.includes(ancien) && tp.includes(nouveau) && diff.length === 1 && diff[0] === P11 && verif;
  consigner({ comportement: '5. Rectification d’une information', cas: 'mentions périmées des deux Hubs (proposition) ; information validée rectifiée (rejeu)', nature: 'proposition réelle + rejeu', environnement: 'copie locale de la branche',
    attendu: 'l’information incorrecte disparaît des blocs concernés ; elle ne subsiste pas à côté de la correction', observe: [`mentions périmées restantes dans la proposition : ${restes.join(', ') || 'aucune'}`, `ancien libellé encore affiché : ${tp.includes(ancien) ? 'OUI' : 'non'} ; nouveau affiché : ${tp.includes(nouveau) ? 'oui' : 'NON'}`, `pages changées : ${diff.join(', ')}`, `contrôle verifier-site (nombre + libellé) : ${verif ? 'conforme' : 'ÉCART'}`], ok });
  restaurer(NOUV);
}

// --- fiches approuvées : jamais touchées ---------------------------------------------------------------------------------
const ev0 = lireJ(NOUV, 'data/evenements.json');
const fiches = Object.fromEntries(['POC-09', 'FR-2026-0115'].map((id) => { const f = id === 'POC-09' ? 'paris-11e' : 'landes'; return [id, { approuvee: ev0.fiches_approuvees[id].hash, courante: hashDossier(lireJ(NOUV, `data/hub-matiere/${f}.json`).dossiers[id]) }]; }));
writeFileSync(join(SORTIE, 'rejeu-resultats.json'), JSON.stringify({ execute_le: new Date().toISOString(), base: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: BASE }).toString().trim(), nouveau: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: NOUV }).toString().trim(), empreintes_proposees: empreintes, fiches_approuvees_inchangees: fiches, resultats }, null, 2) + '\n', 'utf8');
for (const [id, f] of Object.entries(fiches)) assert.equal(f.approuvee, f.courante, `${id} : empreinte de fiche modifiée`);
const ko = resultats.filter((r) => !r.ok);
console.log(ko.length ? `\nREJEU_ÉCHEC — ${ko.length} scénario(s)` : `\nREJEU_OK — ${resultats.length} scénarios ; empreintes proposées ${JSON.stringify(empreintes)}`);
process.exit(ko.length ? 1 : 0);
