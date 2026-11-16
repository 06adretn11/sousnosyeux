// =====================================================================
// scripts/qa/test-relais-social.mjs — RELAIS SOCIAL, MODE REVIEW : anti-backfill (zéro historique) + GO social + Buffer + retraits + coupe-circuit.
//
// Exécute les VRAIES fonctions de production (executerCycle, enregistrerDecision, verifierActivation, composeur V4.1, flux Buffer) contre une base, un Buffer et un Telegram
// SIMULÉS EN MÉMOIRE, avec les VRAIES données du dépôt (data/cases.json, evenements.json, dossiers approuvés). Aucun réseau, aucune publication, aucun secret.
// Usage : node scripts/qa/test-relais-social.mjs
// =====================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { dossierFiche as dossierFicheVivant, hashDossier } from '../lib/fiche-page.mjs';
import { ErreurBuffer } from '../lib/buffer.mjs';
import { signatureTexte } from '../lib/diffusion-sociale.mjs';
import { decoderCallback } from '../lib/telegram-clics.mjs';
import { DATA_RE } from '../../workers/telegram-webhook/worker.mjs';
import { verifierActivation, executerCycle, enregistrerDecision, evaluerCandidat, controlerFraicheur, decouperInstructions, instructionDestructrice, boutonsProposition,
  CANAUX_RELAIS, T0_PLANCHER, sha256, empreinteTexte, motifsPublics } from '../lib/relais-social.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`  ${cond ? '✅' : '❌'} ${nom}${cond ? '' : ' — ' + String(detail).slice(0, 400)}`); if (!cond) ko++; };
const racine = fileURLToPath(new URL('../../', import.meta.url));
const lire = (f) => JSON.parse(readFileSync(join(racine, f), 'utf8'));
const wording = await import('../../web/src/lib/etat-wording.ts');
const casesPubliques = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const ev = lire('data/evenements.json');
// FR-2026-0146 sert de « nouvelle affaire » aux scénarios du relais. Son dossier VIVANT est un texte éditorial qui change (nouvelle version approuvée, phrases que le
// garde-fou social refuse à bon droit : fonction unique de l'établissement). La mécanique du relais ne doit pas dépendre de ce texte : on la rejoue sur la version
// approuvée FIGÉE (scripts/qa/fixtures/fiche-0146-8b38c2d4b2470bf8.json, empreinte recalculée à chaque exécution). Les autres affaires restent lues en direct.
const FICHE_0146_FIGEE = lire('scripts/qa/fixtures/fiche-0146-8b38c2d4b2470bf8.json');
ev.fiches_approuvees = { ...(ev.fiches_approuvees ?? {}), 'FR-2026-0146': { ...(ev.fiches_approuvees?.['FR-2026-0146'] ?? {}), hash: hashDossier(FICHE_0146_FIGEE.dossier) } };
if (hashDossier(FICHE_0146_FIGEE.dossier) !== FICHE_0146_FIGEE._meta.hash) { console.error('❌ fixture fiche-0146 altérée : empreinte ≠ _meta.hash'); process.exit(1); }
// Les trois affaires-scénarios sont FIGÉES en entier (carte publique, événements, informations validées, dossier) : un texte éditorial qui change en production
// (nouvelle version de fiche, nouvel événement) ne doit plus jamais bloquer la QA de la chaîne de publication (incident du 13 au 16/11 : ~63 h de projection perdues).
const FIGES = lire('scripts/qa/fixtures/relais-scenarios-figes.json');
const dossiersFiges = { 'FR-2026-0146': { hub: FICHE_0146_FIGEE._meta.hub, d: FICHE_0146_FIGEE.dossier, verifie_le: FICHE_0146_FIGEE.dossier.verifie_le } };
for (const id of ['FR-2026-0005', 'FR-2026-0113', 'FR-2026-0146']) {
  const f = FIGES[id];
  casesPubliques.set(id, f.entree);
  ev.affaires = { ...ev.affaires, [id]: f.evenements };
  ev.matiere = [...(ev.matiere || []).filter((m) => m.case_id !== id), ...f.matiere];
  if (f.dossier) dossiersFiges[id] = f.dossier;
  ev.fiches_approuvees[id] = { hash: hashDossier(dossiersFiges[id].d) };
}
const dossierFiche = (id) => dossiersFiges[id] ?? dossierFicheVivant(id);
const redirections = lire('data/redirections-affaires.json').redirections ?? {};
const SITE = 'https://sousnosyeux.org';
const H = 36e5;

// --- cas de test réels ------------------------------------------------------------------------------------------------------------------
const NOUVELLE = { id: 'FR-2026-0146', now: new Date('2026-11-13T12:00:00Z') };                       // nouvelle affaire (Montpellier), source du 11/11
const EVOLUTION = { id: 'FR-2026-0005', event_id: '54946f38-6f58-4631-a904-a07ea92545ce', now: new Date('2026-05-23T12:00:00Z') }; // mise en examen du 22/05
const PARTIELLE = { id: 'FR-2026-0113', now: new Date('2026-07-03T12:00:00Z') };                    // Le Figaro lu en partie (X seulement)

const T0_DEFAUT = (now) => new Date(now.getTime() - 24 * H);
const candNouvelle = (t0, id = NOUVELLE.id) => ({ type: 'new_case', case_id: id, decouverte_at: new Date(t0.getTime() + 1 * H), cree_at: new Date(t0.getTime() + 2 * H), fiche_approuvee_at: new Date(t0.getTime() + 3 * H), ps: 'publiée', retire: false });
const candEvolution = (t0) => ({ type: 'case_update', case_id: EVOLUTION.id, event_id: EVOLUTION.event_id, statut_avant: 'enquête', statut_apres: 'mise en examen', propose_at: new Date(t0.getTime() + 1 * H), decide_at: new Date(t0.getTime() + 2 * H), evenement_enregistre_at: new Date(t0.getTime() + 3 * H), ps: 'publiée', retire: false });

// --- monde simulé -----------------------------------------------------------------------------------------------------------------------
function monde({ t0, candidats = [], exclusions = [], ps = {}, retire = {}, ficheHashServi = null } = {}) {
  const w = { t0Row: t0 ? { t0, mode: 'review', provenance: 'test' } : null, candidats, props: [], ledger: [], exclusions: new Set(exclusions.map((x) => `${x.event_key}|${x.canal}`)), empreintesExclues: new Set(),
    posts: [], appelsBuffer: [], telegram: [], envoisTg: 0, ps, retire, ficheHashServi, pannes: { creerApresCreation: 0, creerAvantCreation: 0 }, compteurPort: 0 };
  const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : x);
  const parId = (id) => w.props.find((p) => p.proposal_id === id);
  w.port = new Proxy({
    t0: async () => w.t0Row,
    candidats: async (t0) => w.candidats.filter((c) => !c.apresSql || true).map((c) => ({ ...c, ps: w.ps[c.case_id] ?? c.ps, retire: !!(w.retire[c.case_id] ?? c.retire) })),
    propositionParEvenement: async (k) => clone(w.props.find((p) => p.event_key === k)) ?? null,
    propositionsDeEvenement: async (k) => w.props.filter((p) => p.event_key === k || p.event_key.startsWith(`${k}#`)).map(clone),
    propositionParCle: async (cle) => { const r = w.props.filter((p) => p.proposal_id.startsWith(cle)); return r.length === 1 ? clone(r[0]) : null; },
    creerProposition: async (p) => { if (w.props.some((x) => x.event_key === p.event_key)) return null; const row = { ...clone(p), proposal_id: sha256(p.event_key).slice(0, 8) + '-0000-4000-8000-000000000000', decision: null, canaux_autorises: null, resolution: null, telegram_message_id: null, notif_programme_at: null, notif_publie_at: null, created_at: new Date() }; w.props.push(row); return clone(row); },
    reclamerEnvoi: async (id) => { const p = parId(id); if (p && p.telegram_message_id == null && !p.decision) { p.telegram_message_id = -1; return true; } return false; },
    noterEnvoi: async (id, mid) => { parId(id).telegram_message_id = mid ?? -2; },
    libererEnvoi: async (id) => { const p = parId(id); if (p.telegram_message_id === -1) p.telegram_message_id = null; },
    decider: async (id, { decision, canaux, now, resolution }) => { const p = parId(id); if (!p || p.decision) return false; p.decision = decision; p.canaux_autorises = canaux; p.decided_at = now; p.resolution = resolution ?? null; return true; },
    propositionsExpirees: async (now) => w.props.filter((p) => !p.decision && new Date(p.expire_at) < now).map((p) => ({ proposal_id: p.proposal_id })),
    propositionsAvecGo: async () => w.props.filter((p) => ['GO_XF', 'GO_F', 'GO_X'].includes(p.decision) && !p.resolution).map(clone),
    resoudre: async (id, r) => { const p = parId(id); if (!p.resolution) p.resolution = r; },
    noterNotif: async (id, q) => { const p = parId(id); if (q === 'programme') p.notif_programme_at = p.notif_programme_at ?? new Date(); else p.notif_publie_at = p.notif_publie_at ?? new Date(); },
    propositionsAConfirmer: async () => w.props.filter((p) => p.resolution === 'publie' && !p.notif_publie_at).map(clone),
    exclusionsDe: async (k) => new Set(CANAUX_RELAIS.filter((c) => w.exclusions.has(`${k}|${c}`))),
    empreinteTexteExclue: async (c, h) => w.empreintesExclues.has(`${c}|${h}`),
    ledgerDe: async (k) => w.ledger.some((l) => l.event_key === k),
    lignesOuvertes: async () => w.ledger.filter((l) => ['reserve', 'soumis', 'programme', 'envoye', 'verifie'].includes(l.etat)).map(clone),
    etatsAffaires: async (ids) => ids.map((id) => ({ case_id: id, ps: w.ps[id] ?? 'publiée', retire: !!w.retire[id] })),
  }, { get: (t, k) => (typeof t[k] === 'function' ? (...a) => { w.compteurPort++; return t[k](...a); } : t[k]) });
  w.ledgerPort = {
    lire: async (k, c) => clone(w.ledger.find((l) => l.event_key === k && l.canal === c)) ?? null,
    reserver: async (l) => { if (w.ledger.some((x) => x.event_key === l.event_key && x.canal === l.canal)) return false; w.ledger.push({ ...l, etat: 'reserve', buffer_post_id: null, permalien: null, soumis_at: null, created_at: w.horloge ?? new Date() }); return true; },
    maj: async (k, c, p) => { const r = w.ledger.find((l) => l.event_key === k && l.canal === c); for (const [a, b] of Object.entries(p)) if (b != null) r[a === 'soumis_at' ? 'soumis_at' : a] = b; },
  };
  w.buffer = {
    creerPost: async ({ channelId, canal, texte, dueAt }) => {
      w.appelsBuffer.push({ op: 'creerPost', channelId, canal, texte, dueAt });
      if (w.pannes.creerAvantCreation > 0) { w.pannes.creerAvantCreation--; throw new ErreurBuffer('incertain', 'délai dépassé'); }
      const post = { id: `bp${w.posts.length + 1}`, status: 'scheduled', text: texte, channelId, dueAt, externalLink: null };
      w.posts.push(post);
      if (w.pannes.creerApresCreation > 0) { w.pannes.creerApresCreation--; throw new ErreurBuffer('incertain', 'délai dépassé après création'); }
      return post;
    },
    lirePost: async (id) => { w.appelsBuffer.push({ op: 'lirePost', id }); return w.posts.find((p) => p.id === id) ?? null; },
    trouverPost: async ({ channelId, signature }) => { w.appelsBuffer.push({ op: 'trouverPost', channelId }); return w.posts.find((p) => p.channelId === channelId && String(p.text).replace(/\s+/g, ' ').includes(signature)) ?? null; },
    supprimerPost: async (id) => { w.appelsBuffer.push({ op: 'supprimerPost', id }); const p = w.posts.find((x) => x.id === id); if (p?.status === 'sent') throw new ErreurBuffer('refus', 'déjà publié'); w.posts = w.posts.filter((x) => x.id !== id); return true; },
  };
  w.ecritures = () => w.appelsBuffer.filter((a) => a.op === 'creerPost' || a.op === 'supprimerPost').length;
  w.creations = () => w.appelsBuffer.filter((a) => a.op === 'creerPost').length;
  return w;
}

const env = (t0, extra = {}) => ({ SNY_DIFFUSION_ACTIVE: '1', SNY_DIFFUSION_MODE: 'review', SNY_DIFFUSION_DEPUIS: t0.toISOString(), ...extra });
function deps(w, now, { ecrire = true, envE, ficheHashServi = undefined, compoMod = null, canauxConfigures = ['x', 'facebook'] } = {}) {
  const t0 = w.t0Row?.t0 ?? null;
  const activation = verifierActivation({ env: envE ?? (t0 ? env(t0) : { SNY_DIFFUSION_ACTIVE: '1', SNY_DIFFUSION_MODE: 'review' }), t0Row: w.t0Row, now, plancher: '2000-01-01T00:00:00Z' });
  const evCopie = JSON.parse(JSON.stringify(ev));
  const compo = { cases: casesPubliques, ev: evCopie, redirections, wording, dossierFiche, site: SITE, now };
  if (compoMod) compoMod(compo);
  w.horloge = now;
  return { port: w.port, compo, activation, holds: new Set(), ecrire, log: () => {}, alerter: async (t) => { w.telegram.push({ alerte: t }); }, buffer: w.buffer, ledger: w.ledgerPort,
    canauxConfigures, channelIds: { x: 'chX', facebook: 'chF' }, delaiMin: 15,
    envoyer: async (texte, markup) => { w.telegram.push({ texte, markup }); return 100 + ++w.envoisTg; },
    servi: () => true, ficheServie: async (id) => ({ status: 200, hash: ficheHashServi === undefined ? compo.ev.fiches_approuvees?.[id]?.hash ?? null : ficheHashServi }) };
}
const propositions = (w) => w.telegram.filter((m) => m.texte);
const cleDe = (w, i = 0) => w.props[i].proposal_id.slice(0, 8);

// =====================================================================
console.log('A. Anti-backfill : zéro historique');
// =====================================================================
{
  const now = NOUVELLE.now, t0 = T0_DEFAUT(now);
  // 1. fiche ancienne approuvée avant T0
  let w = monde({ t0, candidats: [{ ...candNouvelle(t0), fiche_approuvee_at: new Date(t0.getTime() - 5 * H) }] });
  await executerCycle(deps(w, now));
  verifie('1. fiche approuvée AVANT T0 → aucune proposition, aucun message', w.props.length === 0 && propositions(w).length === 0);
  // 2. fiche ancienne (créée avant T0) simplement modifiée / réapprouvée après T0
  w = monde({ t0, candidats: [{ ...candNouvelle(t0), cree_at: new Date(t0.getTime() - 48 * H), decouverte_at: new Date(t0.getTime() - 50 * H), fiche_approuvee_at: new Date(t0.getTime() + 2 * H) }] });
  await executerCycle(deps(w, now));
  verifie('2. affaire créée avant T0, fiche modifiée / réapprouvée après T0 → jamais « nouvelle affaire »', w.props.length === 0 && propositions(w).length === 0);
  // 3. ancienne proposition de maintenance réapprouvée après T0
  {
    const t0b = T0_DEFAUT(EVOLUTION.now);
    w = monde({ t0: t0b, candidats: [{ ...candEvolution(t0b), decide_at: new Date(t0b.getTime() - 3 * H), evenement_enregistre_at: new Date(t0b.getTime() - 3 * H) }] });
    await executerCycle(deps(w, EVOLUTION.now));
  }
  verifie('3. ancienne proposition Telegram réapprouvée après T0 → aucun nouveau post', w.props.length === 0 && propositions(w).length === 0);
  // 4. article récent ajouté à une ancienne affaire, sans événement nouveau : aucun candidat n'existe → silence total
  w = monde({ t0, candidats: [] });
  const r4 = await executerCycle(deps(w, now));
  verifie('4. article récent ajouté à une ancienne affaire, sans événement nouveau → aucun message', propositions(w).length === 0 && w.props.length === 0 && r4.propositions.candidats === 0);
  // Les refus 1 à 3 viennent bien de T0 (aucune autre cause ne les explique : page servie, source, statut sont tous valides dans ce jeu).
  {
    const h = ev.fiches_approuvees[NOUVELLE.id].hash;
    const ctx = { t0, now, holds: new Set(), entree: casesPubliques.get(NOUVELLE.id), ficheHash: h, servi: true, ficheServie: { status: 200, hash: h }, proposition: false, ledger: false, exclusions: new Set() };
    const raisons = (c, x = ctx) => evaluerCandidat(c, x).raisons;
    const hE = ev.fiches_approuvees[EVOLUTION.id].hash, t0E2 = T0_DEFAUT(EVOLUTION.now);
    const ctxE = { ...ctx, t0: t0E2, now: EVOLUTION.now, entree: casesPubliques.get(EVOLUTION.id), ficheHash: hE, ficheServie: { status: 200, hash: hE } };
    const a = raisons({ ...candNouvelle(t0), event_key: 'k', fiche_approuvee_at: new Date(t0.getTime() - 5 * H) });
    const b = raisons({ ...candNouvelle(t0), event_key: 'k', cree_at: new Date(t0.getTime() - 48 * H) });
    const c = raisons({ ...candEvolution(t0E2), event_key: 'k', decide_at: new Date(t0E2.getTime() - 3 * H), evenement_enregistre_at: new Date(t0E2.getTime() - 3 * H) }, ctxE);
    verifie('1-3 : chaque refus cite T0 et AUCUNE autre cause (fiche approuvée, création, décision de maintenance antérieures)', [a, b].every((r) => r.length === 1 && /antérieur\(e\) à T0/.test(r[0])) && c.length === 2 && c.every((x) => /antérieur\(e\) à T0/.test(x)), JSON.stringify([a, b, c]));
    // Cas réel FR-2026-0144 (16/11) : analyse proposée AVANT T0, décidée et enregistrée APRÈS ⇒ c'est une nouveauté (l'événement approuvé), pas un rattrapage.
    verifie('proposition de maintenance créée avant T0 mais DÉCIDÉE et enregistrée après T0 ⇒ éligible (la nouveauté est l’événement approuvé)', evaluerCandidat({ ...candEvolution(t0E2), event_key: 'k', propose_at: new Date(t0E2.getTime() - 30 * H) }, ctxE).ok);
    verifie('contrôle témoin : le même candidat, daté après T0, est éligible à ce niveau', evaluerCandidat({ ...candNouvelle(t0), event_key: 'k' }, ctx).ok && evaluerCandidat({ ...candEvolution(t0E2), event_key: 'k' }, ctxE).ok);
  }
  // 5. événement de maintenance réellement nouveau, approuvé après T0 → proposition éligible
  const nowE = EVOLUTION.now, t0E = T0_DEFAUT(nowE);
  w = monde({ t0: t0E, candidats: [candEvolution(t0E)] });
  await executerCycle(deps(w, nowE));
  verifie('5. événement Maintenance nouveau et approuvé après T0 → UNE proposition éligible', w.props.length === 1 && w.props[0].type_event === 'case_update' && propositions(w).length === 1, JSON.stringify(w.props.map((p) => p.type_event)));
  // 6. nouvelle affaire post-T0, source récente
  w = monde({ t0, candidats: [candNouvelle(t0)] });
  await executerCycle(deps(w, now));
  verifie('6. nouvelle affaire créée et approuvée après T0, source récente → UNE proposition éligible', w.props.length === 1 && w.props[0].type_event === 'new_case' && propositions(w).length === 1);
  // 7. article de plus de sept jours
  w = monde({ t0: new Date(now.getTime() - 40 * 864e5), candidats: [candNouvelle(new Date(now.getTime() - 40 * 864e5))] });
  await executerCycle(deps(w, new Date(now.getTime() + 9 * 864e5)));
  verifie('7. article de plus de sept jours → blocage', w.props.length === 0 && propositions(w).length === 0);
  verifie('7b. contrôle de fraîcheur : 6 jours passe, 7 jours bloque, futur bloque', controlerFraicheur({ source: { url: 'u', publie_le: '2026-11-07', acces: 'libre' }, dateFait: null, now }).length === 0 && controlerFraicheur({ source: { url: 'u', publie_le: '2026-11-06', acces: 'libre' }, dateFait: null, now }).length === 1 && controlerFraicheur({ source: { url: 'u', publie_le: '2026-11-20', acces: 'libre' }, dateFait: null, now }).length === 1);
  // 8. date essentielle absente ou ambiguë
  w = monde({ t0, candidats: [{ ...candNouvelle(t0), fiche_approuvee_at: null }] });
  await executerCycle(deps(w, now));
  verifie('8a. horodatage d’approbation absent → échec fermé', w.props.length === 0);
  w = monde({ t0: t0E, candidats: [{ ...candEvolution(t0E), decide_at: 'pas une date' }] });
  await executerCycle(deps(w, nowE));
  verifie('8b. horodatage de décision ambigu → échec fermé', w.props.length === 0);
  verifie('8c. date d’article absente / fait ancien repris par un article récent / fait postérieur → blocage', controlerFraicheur({ source: { url: 'u', publie_le: null, acces: 'libre' }, now }).length >= 1
    && controlerFraicheur({ source: { url: 'u', publie_le: '2026-11-12', acces: 'libre' }, dateFait: '2026-10-01', now }).some((r) => /fait ancien/.test(r))
    && controlerFraicheur({ source: { url: 'u', publie_le: '2026-11-10', acces: 'libre' }, dateFait: '2026-11-12', now }).some((r) => /postérieur/.test(r)));
  // 9. redémarrage / redéploiement / rejeu : même résultat, aucune proposition de plus, T0 intact
  w = monde({ t0, candidats: [candNouvelle(t0)] });
  await executerCycle(deps(w, now)); await executerCycle(deps(w, new Date(now.getTime() + 36e5))); await executerCycle(deps(w, new Date(now.getTime() + 2 * H)));
  verifie('9a. rejeux successifs : UNE proposition, UN message Telegram', w.props.length === 1 && propositions(w).length === 1);
  const t0Avant = w.t0Row.t0.toISOString(); await executerCycle(deps(w, now));
  verifie('9b. T0 inchangé après redémarrage / rejeu', w.t0Row.t0.toISOString() === t0Avant);
  // un T0 plus ancien (correction de configuration) : le témoin ne concorde plus → tout bloqué, aucun rattrapage
  w = monde({ t0, candidats: [candNouvelle(t0)] });
  const r9 = await executerCycle(deps(w, now, { envE: env(new Date(t0.getTime() - 10 * 864e5)) }));
  verifie('9c. configuration corrigée vers une date plus ancienne → relais bloqué (témoin ≠ T0), aucun rattrapage', r9.actif === false && w.props.length === 0 && w.compteurPort === 0);
  // 10. Montpellier déjà publié : aucune réémission, sur chacun des deux canaux
  w = monde({ t0, candidats: [candNouvelle(t0)], exclusions: [{ event_key: 'new_case|FR-2026-0146', canal: 'x' }, { event_key: 'new_case|FR-2026-0146', canal: 'facebook' }] });
  await executerCycle(deps(w, now));
  verifie('10a. Montpellier (exclu X et Facebook) → aucune proposition, aucun message', w.props.length === 0 && propositions(w).length === 0);
  w = monde({ t0, candidats: [candNouvelle(t0)], exclusions: [{ event_key: 'new_case|FR-2026-0146', canal: 'x' }] });
  await executerCycle(deps(w, now));
  verifie('10b. exclusion d’un seul canal : l’autre reste proposable, X jamais proposé', w.props.length === 1 && w.props[0].canaux_proposes.join() === 'facebook');
  w = monde({ t0, candidats: [candNouvelle(t0)] });
  await executerCycle(deps(w, now)); const texteFb = w.props[0].texte_facebook;
  w = monde({ t0, candidats: [candNouvelle(t0)] }); w.empreintesExclues.add(`facebook|${empreinteTexte(texteFb)}`);
  await executerCycle(deps(w, now));
  verifie('10c. texte identique à celui déjà publié à la main → écarté, même sous un autre identifiant', w.props.length === 1 && w.props[0].canaux_proposes.join() === 'x');
  // une évolution FUTURE de Montpellier n'est pas bloquée par l'exclusion d'un autre événement
  w = monde({ t0, candidats: [], exclusions: [{ event_key: 'new_case|FR-2026-0146', canal: 'x' }] });
  verifie('10d. l’exclusion ne porte que sur l’événement déjà diffusé (clé new_case|…), pas sur toute l’affaire', !(await w.port.exclusionsDe('case_update|FR-2026-0146|condamnation-non-definitive')).size);
}

// =====================================================================
console.log('\nB. Activation : coupe-circuit, T0 verrouillé, mode REVIEW');
// =====================================================================
{
  const now = NOUVELLE.now, t0 = new Date(now.getTime() - 6 * H); // 06:00 UTC le 13/11 : après le plancher réel
  const ok = (e, row = { t0, mode: 'review' }) => verifierActivation({ env: e, t0Row: row, now });
  verifie('actif seulement si ACTIVE=1 ET MODE=review ET T0 en base ET témoin identique', ok(env(t0)).actif === true);
  verifie('coupe-circuit : ACTIVE=0 → inactif', !ok(env(t0, { SNY_DIFFUSION_ACTIVE: '0' })).actif);
  verifie('ACTIVE absent → inactif', !ok({ SNY_DIFFUSION_MODE: 'review', SNY_DIFFUSION_DEPUIS: t0.toISOString() }).actif);
  verifie('mode ≠ review (ex. « auto ») → inactif : aucun mode automatique n’existe', !ok(env(t0, { SNY_DIFFUSION_MODE: 'auto' })).actif && !ok(env(t0, { SNY_DIFFUSION_MODE: '' })).actif);
  verifie('T0 absent → bloqué', !ok(env(t0), null).actif && /T0 absent/.test(ok(env(t0), null).raisons.join()));
  verifie('T0 dans le futur → bloqué', !ok(env(new Date(now.getTime() + 864e5)), { t0: new Date(now.getTime() + 864e5), mode: 'review' }).actif);
  verifie('T0 antérieur au plancher de la mission → bloqué', !ok(env(new Date('2026-11-01T00:00:00Z')), { t0: new Date('2026-11-01T00:00:00Z'), mode: 'review' }).actif && T0_PLANCHER === '2026-11-13T00:00:00Z');
  verifie('témoin absent ou différent du T0 de la base → bloqué', !ok({ ...env(t0), SNY_DIFFUSION_DEPUIS: '' }).actif && !ok(env(new Date(t0.getTime() + 5000))).actif);
  verifie('témoin placeholder (valeur texte) → bloqué', !ok({ ...env(t0), SNY_DIFFUSION_DEPUIS: 'Valeur : date et heure UTC exactes de l’activation' }).actif);
  const w = monde({ t0, candidats: [candNouvelle(t0)] });
  const r = await executerCycle(deps(w, now, { envE: env(t0, { SNY_DIFFUSION_ACTIVE: '0' }) }));
  verifie('inactif : executerCycle ne touche ni la base, ni Buffer, ni Telegram', r.actif === false && w.compteurPort === 0 && w.appelsBuffer.length === 0 && w.telegram.length === 0);
  // SQL de migration : découpage et refus de l'destructif
  const m26 = decouperInstructions(readFileSync(join(racine, 'supabase/migrations/026_relais_social_review.sql'), 'utf8'));
  const m25 = decouperInstructions(readFileSync(join(racine, 'supabase/migrations/025_diffusions_sociales.sql'), 'utf8'));
  verifie('migration 026 : corps de fonction et chaînes conservés, 10 instructions, aucune destructive', m26.length === 10 && m26.some((s) => /relais_social_config_immuable\(\)[\s\S]*raise exception[\s\S]*end \$\$/.test(s)) && !m26.some(instructionDestructrice), String(m26.length));
  verifie('migration 025 : toujours additive', m25.length >= 4 && !m25.some(instructionDestructrice));
  verifie('un DROP / DELETE FROM / UPDATE est refusé', ['drop table x', 'DELETE FROM x', 'update x set a = 1', 'truncate x'].every(instructionDestructrice));
  verifie('trigger d’immuabilité : UPDATE, DELETE et TRUNCATE de la config refusés', /before update or delete on relais_social_config/.test(readFileSync(join(racine, 'supabase/migrations/026_relais_social_review.sql'), 'utf8')) && /before truncate on relais_social_config/.test(readFileSync(join(racine, 'supabase/migrations/026_relais_social_review.sql'), 'utf8')) && /check \(id = 1\)/.test(readFileSync(join(racine, 'supabase/migrations/026_relais_social_review.sql'), 'utf8')));
}

// =====================================================================
console.log('\nC. Proposition Telegram : textes V4.1 intégraux, boutons, canal bloqué non proposé');
// =====================================================================
{
  const now = NOUVELLE.now, t0 = T0_DEFAUT(now);
  const w = monde({ t0, candidats: [candNouvelle(t0)] });
  await executerCycle(deps(w, now));
  const p = w.props[0], msg = propositions(w)[0];
  const sansHtml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  verifie('la proposition contient le texte Facebook ET le texte X INTÉGRAUX, la source, la fiche SNY, les contrôles', sansHtml(msg.texte).includes(p.texte_facebook) && sansHtml(msg.texte).includes(p.texte_x) && /Source : /.test(msg.texte) && msg.texte.includes(`${SITE}/affaires/fr-2026-0146/`) && /Contrôles : /.test(msg.texte));
  verifie('un seul message Telegram par événement', propositions(w).length === 1);
  // Telegram (parse_mode HTML) refuse un « < » ou un « & » nus : première proposition réelle (FR-2026-0144) restée sans envoi pour « source < 7 j ». Toute proposition doit être du HTML valide.
  const htmlTg = msg.texte.replace(/<\/?(?:b|pre)>/g, '');
  verifie('proposition Telegram = HTML valide (aucun « < », « > » ni « & » nus) et ≤ 4096 caractères', !/[<>]/.test(htmlTg) && !/&(?!amp;|lt;|gt;|quot;)/.test(htmlTg) && msg.texte.length <= 4096, String(msg.texte.length));
  const cb = msg.markup.inline_keyboard.flat().map((b) => b.callback_data);
  verifie('boutons : GO X + Facebook, GO Facebook seul, GO X seul, Refuser (callbacks ≤ 64 octets, décodables)', cb.length === 4 && cb.every((d) => d.length <= 64 && decoderCallback(d)?.type === 'SG' && DATA_RE.test(d)), cb.join(' '));
  verifie('le worker n’accepte pas une action sociale inventée', !DATA_RE.test('sny:SG:Z:abcdef12') && !DATA_RE.test('sny:SG:XF:ZZZZZZZZ') && DATA_RE.test('sny:SG:R:abcdef12'));
  // V4.1 : le texte est celui du composeur de production du pilote (fait qualifié, source, réserve), jamais l'ancien gabarit générique
  verifie('texte V4.1 : lieu + fait + réserve judiciaire + sources, pas l’ancien gabarit (« Nouvelle affaire documentée par la presse »)', !/Nouvelle affaire documentée par la presse/.test(p.texte_facebook + p.texte_x) && /Source : /.test(p.texte_facebook) && /Suivi/.test(p.texte_x));
  verifie('X ≤ 280 caractères (URL = 23)', (() => { const n = [...p.texte_x.replace(/https?:\/\/\S+/g, '')].length + (p.texte_x.match(/https?:\/\/\S+/g) || []).length * 23; return n <= 280; })());
  // canal bloqué : X bloqué ⇒ pas de bouton X
  const w2 = monde({ t0: new Date(PARTIELLE.now.getTime() - 24 * H), candidats: [candNouvelle(new Date(PARTIELLE.now.getTime() - 24 * H), PARTIELLE.id)] });
  await executerCycle(deps(w2, PARTIELLE.now));
  const q = w2.props[0];
  verifie('source partielle (Facebook) → Facebook BLOQUÉ, seul X est proposé', !!q && q.canaux_proposes.join() === 'x' && q.texte_facebook === null, JSON.stringify(q?.canaux_proposes));
  const cb2 = propositions(w2)[0].markup.inline_keyboard.flat().map((b) => b.callback_data);
  verifie('canal bloqué non proposé : aucun bouton Facebook ni « X + Facebook »', cb2.length === 2 && cb2.every((d) => /:(X|R):/.test(d)), cb2.join(' '));
  verifie('boutonsProposition : un seul canal ⇒ jamais « X + Facebook »', !boutonsProposition('abcdef12', ['facebook']).inline_keyboard.flat().some((b) => /:XF:/.test(b.callback_data)));
  // Journaux publics : un motif de blocage qui cite un extrait ou une adresse n'est jamais imprimé tel quel.
  const lignes = [];
  const w5 = monde({ t0: new Date(PARTIELLE.now.getTime() - 24 * H), candidats: [candNouvelle(new Date(PARTIELLE.now.getTime() - 24 * H), PARTIELLE.id)] });
  await executerCycle({ ...deps(w5, PARTIELLE.now), canauxConfigures: [], log: (m) => lignes.push(m) });
  const sortie = lignes.join('\n');
  verifie('journal public : aucun texte de post, aucune adresse, aucun nom d’établissement ni de commune', !/https?:\/\//.test(sortie) && !sortie.includes(casesPubliques.get(PARTIELLE.id).etablissement) && !sortie.includes(casesPubliques.get(PARTIELLE.id).commune) && /SILENCE/.test(sortie), sortie.slice(0, 300));
  verifie('motifsPublics masque « extrait » et adresse', motifsPublics('valeur « Jean Dupont » et https://x.fr/a') === 'valeur «…» et <url>');
}

// =====================================================================
console.log('\nD. GO social, refus, silence, péremption, rejeu');
// =====================================================================
async function aveGo(action, { pre = null, post = null, ficheHashServi = undefined } = {}) {
  const now = NOUVELLE.now, t0 = T0_DEFAUT(now);
  const w = monde({ t0, candidats: [candNouvelle(t0)] });
  await executerCycle(deps(w, now));
  if (pre) pre(w);
  const r = await enregistrerDecision({ port: w.port, action, cle: cleDe(w), now: new Date(now.getTime() + 10 * 6e4), actif: true });
  return { w, now, r };
}
{
  // silence
  const now = NOUVELLE.now, t0 = T0_DEFAUT(now);
  let w = monde({ t0, candidats: [candNouvelle(t0)] });
  await executerCycle(deps(w, now));
  await executerCycle(deps(w, new Date(now.getTime() + 3 * H)));
  verifie('sans GO : aucun appel d’ÉCRITURE Buffer (ni création, ni suppression)', w.ecritures() === 0 && w.posts.length === 0 && w.ledger.length === 0);
  // expiration
  await executerCycle(deps(w, new Date(now.getTime() + 60 * H)));
  verifie('silence puis expiration : proposition refermée, zéro post', w.props[0].decision === 'EXPIREE' && w.props[0].resolution === 'expiree' && w.ecritures() === 0);
  const tard = await enregistrerDecision({ port: w.port, action: 'XF', cle: cleDe(w), now: new Date(now.getTime() + 61 * H), actif: true });
  verifie('bouton obsolète (clic après expiration) → refusé, zéro post', ['double_clic', 'expiree'].includes(tard.issue) && w.ecritures() === 0);
  // refus
  let g = await aveGo('R');
  await executerCycle(deps(g.w, new Date(g.now.getTime() + 15 * 6e4)));
  verifie('Refuser → décision REFUS, zéro post', g.r.issue === 'enregistree' && g.w.props[0].decision === 'REFUS' && g.w.ecritures() === 0);
  // GO double
  g = await aveGo('XF');
  await executerCycle(deps(g.w, new Date(g.now.getTime() + 15 * 6e4)));
  verifie('GO X + Facebook → UN post par canal, journal « programme »', g.w.creations() === 2 && g.w.ledger.length === 2 && g.w.ledger.every((l) => l.etat === 'programme') && ['chX', 'chF'].every((c) => g.w.posts.some((p) => p.channelId === c)), JSON.stringify(g.w.ledger.map((l) => [l.canal, l.etat])));
  const textesTg = propositions(g.w)[0].texte.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  verifie('les textes envoyés à Buffer sont EXACTEMENT ceux de la proposition Telegram', g.w.posts.every((p) => textesTg.includes(p.text)) && g.w.posts.find((p) => p.channelId === 'chX').text === g.w.props[0].texte_x && g.w.posts.find((p) => p.channelId === 'chF').text === g.w.props[0].texte_facebook);
  verifie('posts programmés dans le futur (délai d’annulation)', g.w.posts.every((p) => new Date(p.dueAt) > new Date(g.now.getTime() + 15 * 6e4)));
  // rejeu
  for (let i = 1; i <= 3; i++) await executerCycle(deps(g.w, new Date(g.now.getTime() + (15 + i) * 6e4)));
  const rejeu = await enregistrerDecision({ port: g.w.port, action: 'XF', cle: cleDe(g.w), now: new Date(g.now.getTime() + 30 * 6e4), actif: true });
  await executerCycle(deps(g.w, new Date(g.now.getTime() + 31 * 6e4)));
  verifie('callback rejoué + passages répétés → toujours UN post par canal', rejeu.issue === 'double_clic' && g.w.creations() === 2 && g.w.posts.length === 2);
  verifie('proposition résolue « publie », notification « programmée » envoyée UNE fois', g.w.props[0].resolution === 'publie' && g.w.telegram.filter((m) => m.alerte && /Publication programmée/.test(m.alerte)).length === 1);
  // GO Facebook seul / X seul
  g = await aveGo('F');
  await executerCycle(deps(g.w, new Date(g.now.getTime() + 15 * 6e4)));
  verifie('GO Facebook seul → AUCUN post X', g.w.creations() === 1 && g.w.posts.every((p) => p.channelId === 'chF') && !g.w.ledger.some((l) => l.canal === 'x'));
  g = await aveGo('X');
  await executerCycle(deps(g.w, new Date(g.now.getTime() + 15 * 6e4)));
  verifie('GO X seul → AUCUN post Facebook', g.w.creations() === 1 && g.w.posts.every((p) => p.channelId === 'chX') && !g.w.ledger.some((l) => l.canal === 'facebook'));
  verifie('aucun appel Buffer sur un canal autre que X / Facebook (jamais Instagram)', !CANAUX_RELAIS.includes('instagram') && g.w.appelsBuffer.every((a) => !a.channelId || ['chX', 'chF'].includes(a.channelId)));
  // GO sur un canal non proposé
  const w3 = monde({ t0: new Date(PARTIELLE.now.getTime() - 24 * H), candidats: [candNouvelle(new Date(PARTIELLE.now.getTime() - 24 * H), PARTIELLE.id)] });
  await executerCycle(deps(w3, PARTIELLE.now));
  const r3 = await enregistrerDecision({ port: w3.port, action: 'F', cle: cleDe(w3), now: PARTIELLE.now, actif: true });
  const r3b = await enregistrerDecision({ port: w3.port, action: 'XF', cle: cleDe(w3), now: PARTIELLE.now, actif: true });
  verifie('GO sur un canal bloqué (Facebook) ou « X + Facebook » → bouton invalide, rien d’enregistré', r3.issue === 'bouton_invalide' && r3b.issue === 'bouton_invalide' && !w3.props[0].decision);
  // GO alors que le relais est désactivé
  const w4 = monde({ t0, candidats: [candNouvelle(t0)] }); await executerCycle(deps(w4, now));
  const r4 = await enregistrerDecision({ port: w4.port, action: 'XF', cle: cleDe(w4), now, actif: false });
  verifie('clic GO pendant le coupe-circuit → non enregistré', r4.issue === 'inactif' && !w4.props[0].decision);
  verifie('clé inconnue / forme invalide → rien', (await enregistrerDecision({ port: w4.port, action: 'XF', cle: 'deadbeef', now, actif: true })).issue === 'introuvable' && (await enregistrerDecision({ port: w4.port, action: 'ZZ', cle: 'deadbeef', now, actif: true })).issue === 'bouton_invalide');
}

// =====================================================================
console.log('\nD2. GO partiel : le canal laissé sans GO reste ouvert, une rédaction retravaillée est reproposée à ce seul canal');
// =====================================================================
{
  const now = NOUVELLE.now, t0 = T0_DEFAUT(now);
  const apres = (min) => new Date(now.getTime() + min * 6e4);
  // Rédaction retravaillée (simulée) : le libellé de l'établissement change, donc le texte Facebook ; le dossier approuvé, lui, est inchangé.
  const retravaille = (compo) => { const e = casesPubliques.get(NOUVELLE.id); compo.cases = new Map(casesPubliques); compo.cases.set(NOUVELLE.id, { ...e, etablissement: `${e.etablissement} (rédaction retravaillée)` }); };
  const depart = async (action) => {
    const w = monde({ t0, candidats: [candNouvelle(t0)] });
    await executerCycle(deps(w, now));
    await enregistrerDecision({ port: w.port, action, cle: cleDe(w), now: apres(10), actif: true });
    await executerCycle(deps(w, apres(15)));
    return w;
  };
  // 1. GO X seul puis cycles à rédaction inchangée : rien de nouveau (le GO partiel vaut décision sur ce texte)
  let w = await depart('X');
  for (let i = 1; i <= 3; i++) await executerCycle(deps(w, apres(15 + i)));
  verifie('GO X seul, rédaction Facebook inchangée → aucune proposition complémentaire, un seul message', w.props.length === 1 && propositions(w).length === 1 && w.creations() === 1);
  // 2. rédaction retravaillée → UNE proposition Facebook seul
  await executerCycle(deps(w, apres(30), { compoMod: retravaille }));
  const comp = w.props.find((p) => p.event_key.includes('#'));
  verifie('rédaction Facebook retravaillée → UNE proposition complémentaire, limitée à Facebook', w.props.length === 2 && comp?.canaux_proposes.join() === 'facebook' && comp.texte_x === null && comp.texte_facebook && comp.texte_facebook !== w.props[0].texte_facebook, JSON.stringify(w.props.map((p) => [p.event_key, p.canaux_proposes])));
  verifie('la clé du complément garde la clé de l’événement (exclusions et recontrôle partent de la base)', comp.event_key.startsWith(`${w.props[0].event_key}#facebook:`));
  const msg = propositions(w)[1];
  const bt = msg?.markup.inline_keyboard.flat().map((b) => b.callback_data) ?? [];
  verifie('message Telegram du complément : texte Facebook intégral, mention « Complément Facebook », seuls « GO Facebook seul » et « Refuser » proposés', !!msg && /Complément Facebook/.test(msg.texte) && !/<b>X<\/b>/.test(msg.texte) && bt.length === 2 && bt.some((d) => /:SG:F:/.test(d)) && bt.some((d) => /:SG:R:/.test(d)), JSON.stringify(bt));
  verifie('aucun envoi Buffer tant que le complément n’a pas son GO', w.creations() === 1);
  for (let i = 1; i <= 3; i++) await executerCycle(deps(w, apres(30 + i), { compoMod: retravaille }));
  verifie('cycles répétés : le complément n’est ni recréé ni renvoyé', w.props.length === 2 && propositions(w).length === 2);
  // 3. GO Facebook sur le complément → UN post Facebook, texte retravaillé exact ; X n'est jamais republié
  const idc = comp.proposal_id.slice(0, 8);
  const rc = await enregistrerDecision({ port: w.port, action: 'F', cle: idc, now: apres(40), actif: true });
  await executerCycle(deps(w, apres(45), { compoMod: retravaille }));
  const fb = w.posts.filter((p) => p.channelId === 'chF'), xs = w.posts.filter((p) => p.channelId === 'chX');
  verifie('GO sur le complément → UN post Facebook, EXACTEMENT le texte retravaillé proposé ; X inchangé (un seul post)', rc.issue === 'enregistree' && fb.length === 1 && fb[0].text === comp.texte_facebook && xs.length === 1 && w.creations() === 2, JSON.stringify([rc.issue, fb.length, xs.length]));
  verifie('journal : X sous la clé de l’événement, Facebook sous celle du complément ; les deux propositions résolues « publie »', w.ledger.length === 2 && w.ledger.some((l) => l.canal === 'x' && l.event_key === w.props[0].event_key) && w.ledger.some((l) => l.canal === 'facebook' && l.event_key === comp.event_key) && w.props.every((p) => p.resolution === 'publie'));
  const avant = w.props.length; for (let i = 1; i <= 3; i++) await executerCycle(deps(w, apres(45 + i), { compoMod: retravaille }));
  verifie('après publication : plus aucune proposition, aucun post de plus', w.props.length === avant && w.creations() === 2);
  // 4. refus du complément : la voie se ferme, même si la rédaction change encore
  w = await depart('X');
  await executerCycle(deps(w, apres(30), { compoMod: retravaille }));
  const c4 = w.props.find((p) => p.event_key.includes('#'));
  await enregistrerDecision({ port: w.port, action: 'R', cle: c4.proposal_id.slice(0, 8), now: apres(40), actif: true });
  const retravaille2 = (compo) => { const e = casesPubliques.get(NOUVELLE.id); compo.cases = new Map(casesPubliques); compo.cases.set(NOUVELLE.id, { ...e, etablissement: `${e.etablissement} (encore retravaillée)` }); };
  await executerCycle(deps(w, apres(50), { compoMod: retravaille2 }));
  verifie('refus du complément → aucun post Facebook, aucune nouvelle proposition (le refus explicite ferme le canal)', w.props.length === 2 && w.creations() === 1 && w.props.every((p) => p.event_key.includes('#') ? p.decision === 'REFUS' : true));
  // 5. GO X + Facebook : aucun canal ouvert, aucun complément
  w = await depart('XF');
  await executerCycle(deps(w, apres(30), { compoMod: retravaille }));
  verifie('GO X + Facebook → aucun complément même si la rédaction change', w.props.length === 1 && w.creations() === 2);
  // 6. refus de la proposition de base : pas de complément
  const w6 = monde({ t0, candidats: [candNouvelle(t0)] });
  await executerCycle(deps(w6, now)); await enregistrerDecision({ port: w6.port, action: 'R', cle: cleDe(w6), now: apres(10), actif: true });
  await executerCycle(deps(w6, apres(30), { compoMod: retravaille }));
  verifie('refus de la proposition de base → aucun complément', w6.props.length === 1 && w6.creations() === 0);
  // 7. GO sur le complément puis rédaction changée avant l'envoi : GO périmé, rien ne part (identité)
  w = await depart('X');
  await executerCycle(deps(w, apres(30), { compoMod: retravaille }));
  const c7 = w.props.find((p) => p.event_key.includes('#'));
  await enregistrerDecision({ port: w.port, action: 'F', cle: c7.proposal_id.slice(0, 8), now: apres(40), actif: true });
  await executerCycle(deps(w, apres(45), { compoMod: retravaille2 }));
  verifie('GO donné sur une rédaction, puis rédaction modifiée avant l’envoi → GO périmé, zéro post Facebook, alerte', w.creations() === 1 && /^obsolete/.test(w.props.find((p) => p.proposal_id === c7.proposal_id).resolution ?? '') && w.telegram.some((m) => m.alerte && /GO social non exécuté/.test(m.alerte)), JSON.stringify(w.props.map((p) => p.resolution)));
  // 8. exclusion définitive de la base (publication manuelle antérieure) : s'applique aussi au complément
  w = monde({ t0, candidats: [candNouvelle(t0)], exclusions: [] });
  await executerCycle(deps(w, now)); await enregistrerDecision({ port: w.port, action: 'X', cle: cleDe(w), now: apres(10), actif: true });
  await executerCycle(deps(w, apres(15)));
  w.exclusions.add(`${w.props[0].event_key}|facebook`);
  await executerCycle(deps(w, apres(30), { compoMod: retravaille }));
  verifie('canal Facebook exclu (publié hors circuit) → aucun complément', w.props.length === 1);
}

// =====================================================================
console.log('\nE. GO périmé, retrait, Buffer en panne');
// =====================================================================
{
  // GO périmé : la fiche approuvée change entre la proposition et l'envoi
  let g = await aveGo('XF');
  const t = new Date(g.now.getTime() + 15 * 6e4);
  await executerCycle(deps(g.w, t, { compoMod: (c) => { c.ev.fiches_approuvees[NOUVELLE.id] = { hash: '0000000000000000' }; }, ficheHashServi: '0000000000000000' }));
  verifie('GO donné puis fiche approuvée modifiée → ancien GO sans effet : zéro post, résolution « obsolete/bloque »', g.w.ecritures() === 0 && /^(obsolete|bloque)/.test(g.w.props[0].resolution || ''), g.w.props[0].resolution);
  verifie('alerte Telegram « GO social non exécuté » envoyée', g.w.telegram.some((m) => m.alerte && /GO social non exécuté/.test(m.alerte)));
  // texte changé (dossier modifié, même hash annoncé) : l'empreinte du texte diffère
  g = await aveGo('XF', {});
  await executerCycle(deps(g.w, t, { compoMod: (c) => {
    const d = dossierFiche(NOUVELLE.id);
    c.dossierFiche = (id) => { const x = dossierFiche(id); if (id === NOUVELLE.id && x) { const y = JSON.parse(JSON.stringify(x)); y.d.etat_actuel[0] = `${y.d.etat_actuel[0]} `; return y; } return x; };
    // L'empreinte approuvée de la fiche doit rester celle du dossier modifié pour isoler le test sur le TEXTE : on la recalcule.
  } }));
  verifie('dossier modifié depuis la proposition (version approuvée ≠ version courante) → zéro post', g.w.ecritures() === 0 && g.w.props[0].resolution && g.w.props[0].resolution !== 'publie', g.w.props[0].resolution);
  // page plus servie
  g = await aveGo('XF');
  await executerCycle(deps(g.w, t, { ficheHashServi: null }));
  verifie('fiche servie ≠ version approuvée au moment de l’envoi → zéro post', g.w.ecritures() === 0 && /servie/.test(g.w.props[0].resolution || ''), g.w.props[0].resolution);
  // GO tardif : source > 7 jours
  g = await aveGo('XF');
  await executerCycle(deps(g.w, new Date(g.now.getTime() + 9 * 24 * H)));
  verifie('GO donné tard (source devenue trop ancienne) → recontrôle bloque, zéro post', g.w.ecritures() === 0 && /bloque|obsolete/.test(g.w.props[0].resolution || '') );
  // retrait avant envoi : posts annulés
  g = await aveGo('XF');
  await executerCycle(deps(g.w, t));
  verifie('préparation : 2 posts programmés', g.w.posts.length === 2);
  g.w.ps[NOUVELLE.id] = 'retirée';
  await executerCycle(deps(g.w, new Date(t.getTime() + 5 * 6e4)));
  verifie('fiche retirée avant l’envoi → les 2 posts sont annulés chez Buffer, journal « annule »', g.w.posts.length === 0 && g.w.ledger.every((l) => l.etat === 'annule'), JSON.stringify(g.w.ledger.map((l) => l.etat)));
  verifie('alerte d’annulation envoyée', g.w.telegram.filter((m) => m.alerte && /annulée avant envoi/.test(m.alerte)).length === 2);
  // retrait APRÈS envoi : jamais « supprimé » sans preuve
  g = await aveGo('XF');
  await executerCycle(deps(g.w, t));
  for (const p of g.w.posts) { p.status = 'sent'; p.externalLink = `https://reseau.test/${p.id}`; }
  g.w.ps[NOUVELLE.id] = 'retirée';
  await executerCycle(deps(g.w, new Date(t.getTime() + 20 * 6e4)));
  verifie('retrait APRÈS publication : aucune suppression simulée, « retire_apres_envoi », alerte URGENT avec les liens', g.w.ledger.every((l) => l.etat === 'retire_apres_envoi') && g.w.appelsBuffer.every((a) => a.op !== 'supprimerPost') && g.w.telegram.some((m) => m.alerte && /URGENT/.test(m.alerte) && /reseau\.test/.test(m.alerte)));
  // confirmation avec permalien
  g = await aveGo('XF');
  await executerCycle(deps(g.w, t));
  for (const p of g.w.posts) { p.status = 'sent'; p.externalLink = `https://reseau.test/${p.id}`; }
  await executerCycle(deps(g.w, new Date(t.getTime() + 20 * 6e4)));
  await executerCycle(deps(g.w, new Date(t.getTime() + 21 * 6e4)));
  const conf = g.w.telegram.filter((m) => m.alerte && /<b>Publié<\/b>/.test(m.alerte));
  verifie('publication confirmée sur Telegram UNE fois, avec les permaliens', conf.length === 1 && /reseau\.test\/bp1/.test(conf[0].alerte) && /reseau\.test\/bp2/.test(conf[0].alerte));
  // timeout Buffer : réponse perdue APRÈS création → réconciliation, pas de doublon
  g = await aveGo('XF');
  g.w.pannes.creerApresCreation = 2;
  await executerCycle(deps(g.w, t));
  verifie('timeout Buffer (post créé mais réponse perdue) : UNE création par canal, le passage relit l’état distant au lieu de recréer', g.w.creations() === 2 && g.w.posts.length === 2 && g.w.ledger.every((l) => ['reserve', 'programme'].includes(l.etat)), JSON.stringify(g.w.ledger.map((l) => l.etat)));
  await executerCycle(deps(g.w, new Date(t.getTime() + 2 * 6e4)));
  await executerCycle(deps(g.w, new Date(t.getTime() + 40 * 6e4)));
  verifie('réconciliation AVANT tout réessai : les posts existants sont retrouvés, createPost n’est pas répété', g.w.creations() === 2 && g.w.posts.length === 2 && g.w.ledger.every((l) => l.etat === 'programme'), `${g.w.creations()} créations ; ${JSON.stringify(g.w.ledger.map((l) => l.etat))}`);
  // timeout AVANT création : un seul nouvel essai, après délai de grâce
  g = await aveGo('X');
  g.w.pannes.creerAvantCreation = 1;
  await executerCycle(deps(g.w, t));
  await executerCycle(deps(g.w, new Date(t.getTime() + 2 * 6e4)));
  verifie('délai de grâce non écoulé : aucun second createPost', g.w.creations() === 1);
  await executerCycle(deps(g.w, new Date(t.getTime() + 40 * 6e4)));
  verifie('rien retrouvé après le délai de grâce : UNE nouvelle création, un seul post', g.w.creations() === 2 && g.w.posts.length === 1);
}

// =====================================================================
console.log('\nF. Aucun contournement : seuls les chemins protégés atteignent Buffer');
// =====================================================================
{
  const fichiers = [];
  const parcourir = (d) => { for (const e of readdirSync(join(racine, d), { withFileTypes: true })) { const c = `${d}/${e.name}`; if (e.isDirectory()) { if (!['node_modules', 'qa'].includes(e.name)) parcourir(c); } else if (/\.(mjs|js|ts|yml)$/.test(e.name)) fichiers.push(c); } };
  parcourir('scripts'); parcourir('.github/workflows'); parcourir('workers'); parcourir('web/src');
  const appelants = (motif) => fichiers.filter((f) => motif.test(readFileSync(join(racine, f), 'utf8'))).sort();
  verifie('createPost n’est appelé que par le flux idempotent (diffusion-flux) ; plus aucune sonde de création', appelants(/\.creerPost\(/).join() === 'scripts/lib/diffusion-flux.mjs', appelants(/\.creerPost\(/).join());
  // Deux appelants, tous deux des RELAIS REVIEW soumis à un GO humain : X / Facebook (relais-social) et Instagram (relais-instagram, proposition et GO propres). Aucun troisième.
  verifie('diffuserCanal n’est appelé que depuis le relais REVIEW (relais-social) et le relais REVIEW Instagram (relais-instagram)', appelants(/[^a-zA-Z]diffuserCanal\(/).filter((f) => f !== 'scripts/lib/diffusion-flux.mjs').join() === 'scripts/lib/relais-instagram.mjs,scripts/lib/relais-social.mjs', appelants(/[^a-zA-Z]diffuserCanal\(/).join());
  verifie('l’ancien chemin « GO de publication ⇒ post automatique » n’existe plus (evaluerEvenement / composerMessage non appelés par le script)', !/evaluerEvenement\(|composerMessage\(|goPublication\(/.test(readFileSync(join(racine, 'scripts/diffuser-social.mjs'), 'utf8')));
  const dsrc = readFileSync(join(racine, 'scripts/diffuser-social.mjs'), 'utf8');
  verifie('suppression Buffer : flux de retrait + UNE sonde manuelle sur un identifiant inexistant (rien à supprimer), aucun autre appel', appelants(/\.supprimerPost\(/).join() === 'scripts/diffuser-social.mjs,scripts/lib/diffusion-flux.mjs' && (dsrc.match(/\.supprimerPost\(/g) || []).length === 1 && /supprimerPost\(INEXISTANT\)/.test(dsrc), appelants(/\.supprimerPost\(/).join());
  verifie('la publication ne dépend que de propositionsAvecGo (décision humaine enregistrée)', /propositionsAvecGo\(\)/.test(readFileSync(join(racine, 'scripts/lib/relais-social.mjs'), 'utf8')) && /decision in \('GO_XF', 'GO_F', 'GO_X'\)/.test(readFileSync(join(racine, 'scripts/lib/relais-social-db.mjs'), 'utf8')));
  const wf = ['sny-telegram', 'sny-clics', 'sny-cycle', 'sny-discovery', 'sny-maj-fiches', 'sny-reprise', 'sny-diffusion'].map((f) => readFileSync(join(racine, `.github/workflows/${f}.yml`), 'utf8'));
  verifie('tous les workflows qui lisent la configuration reçoivent SNY_DIFFUSION_MODE', wf.every((t) => /SNY_DIFFUSION_MODE: \$\{\{ vars\.SNY_DIFFUSION_MODE \}\}/.test(t)));
  verifie('aucun workflow n’écrit SNY_DIFFUSION_ACTIVE ni ne force un mode automatique', wf.every((t) => !/SNY_DIFFUSION_ACTIVE: ['"]?1/.test(t) && !/SNY_DIFFUSION_MODE: ['"]?(auto|automatique)/.test(t)));
  // Première fiche automatique : elle ne publie rien et n'atteint jamais Buffer.
  const pf = readFileSync(join(racine, 'scripts/proposer-premieres-fiches.mjs'), 'utf8');
  const maj = readFileSync(join(racine, '.github/workflows/sny-maj-fiches.yml'), 'utf8');
  verifie('premières fiches : aucun accès à Buffer, aucune publication ; seule issue = une proposition « APPROUVER LA FICHE » (clic humain)', !/buffer|creerPost|diffuserCanal|publier-affaire|sendMessage/i.test(pf.replace(/^\/\/.*$/gm, '')) && /proposer-fiche\.mjs/.test(pf));
  verifie('premières fiches : réservées aux événements que le relais jugerait nouveaux (≥ T0), sans fiche, source < 7 j, relais REVIEW actif', /port\.candidats\(activation\.t0\)/.test(pf) && /verifierActivation/.test(pf) && /FENETRE_SOURCE_JOURS/.test(pf) && /fiches_approuvees/.test(pf));
  verifie('premières fiches : branchées dans le workflow existant sny-maj-fiches (aperçu déposé puis proposition envoyée), avec la configuration du relais', /proposer-premieres-fiches\.mjs --ecrire/.test(maj) && /steps\.premieres\.outputs\.change/.test(maj) && /SNY_DIFFUSION_DEPUIS/.test(maj));
  const dm = readFileSync(join(racine, 'scripts/lib/discovery-messages.mjs'), 'utf8');
  verifie('le message du GO de publication ne promet plus de relais social', !/relais social strictement factuel/.test(dm) && /pas son relais social/.test(dm));
}

console.log(ko ? `\n❌ ${ko} vérification(s) en échec` : '\n✅ relais social REVIEW : anti-backfill, GO, retraits, coupe-circuit et absence de contournement démontrés');
process.exit(ko ? 1 : 0);
