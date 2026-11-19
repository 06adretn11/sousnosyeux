// =====================================================================
// scripts/qa/test-relais-instagram.mjs — RELAIS SOCIAL, canal INSTAGRAM (mode REVIEW) : légende + visuel + GO Instagram + Buffer + anti-backfill + non-régression X / Facebook.
//
// Exécute les VRAIES fonctions de production (composerInstagram, proposerInstagram, publierInstagram, enregistrerDecision, executerCycle, flux Buffer) contre une base, un Buffer,
// un hébergeur de média et un Telegram SIMULÉS EN MÉMOIRE, avec les VRAIES données du dépôt (mêmes scénarios FIGÉS que test-relais-social.mjs). Aucun réseau, aucun navigateur,
// aucune publication, aucun secret. (Le rendu réel par un navigateur est vérifié à part : scripts/essai-rendu-instagram.mjs — jamais dans la QA de publication.)
// Usage : node scripts/qa/test-relais-instagram.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { dossierFiche as dossierFicheVivant, hashDossier } from '../lib/fiche-page.mjs';
import { ErreurBuffer, clientBuffer } from '../lib/buffer.mjs';
import { decoderCallback } from '../lib/telegram-clics.mjs';
import { DATA_RE } from '../../workers/telegram-webhook/worker.mjs';
import { executerCycle, enregistrerDecision, verifierActivation, decouperInstructions, instructionDestructrice, suivreEtRetirer, boutonsProposition, ACTIONS_SOCIALES, CANAUX_RELAIS, sha256 } from '../lib/relais-social.mjs';
import { composerInstagram, proposerInstagram, publierInstagram, confirmerInstagram, cycleInstagram, controlerImageDistante, apresPointDepart, verifierActivationInstagram, cleEvenementDe,
  boutonsInstagram, messagePropositionInstagram, LIMITE_LEGENDE } from '../lib/relais-instagram.mjs';
import { specVisuel, verifierVisuel, htmlVisuel, pngDimensions, empreinteImage, LARGEUR, HAUTEUR, GABARIT_VISUEL } from '../lib/instagram-visuel.mjs';
import { mediaGithub, shaBlobGit, urlMedia, BRANCHE_MEDIA } from '../lib/media-github.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`  ${cond ? '✅' : '❌'} ${nom}${cond ? '' : ' — ' + String(detail).slice(0, 400)}`); if (!cond) ko++; };
const racine = fileURLToPath(new URL('../../', import.meta.url));
const lire = (f) => JSON.parse(readFileSync(join(racine, f), 'utf8'));
const wording = await import('../../web/src/lib/etat-wording.ts');
const casesPubliques = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const ev = lire('data/evenements.json');
// Mêmes scénarios FIGÉS que test-relais-social.mjs : un texte éditorial qui change en production ne doit jamais casser la QA de la chaîne de publication.
const FICHE_0146_FIGEE = lire('scripts/qa/fixtures/fiche-0146-8b38c2d4b2470bf8.json');
ev.fiches_approuvees = { ...(ev.fiches_approuvees ?? {}), 'FR-2026-0146': { ...(ev.fiches_approuvees?.['FR-2026-0146'] ?? {}), hash: hashDossier(FICHE_0146_FIGEE.dossier) } };
if (hashDossier(FICHE_0146_FIGEE.dossier) !== FICHE_0146_FIGEE._meta.hash) { console.error('❌ fixture fiche-0146 altérée : empreinte ≠ _meta.hash'); process.exit(1); }
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

const NOUVELLE = { id: 'FR-2026-0146', now: new Date('2026-11-13T12:00:00Z') };
const EVOLUTION = { id: 'FR-2026-0005', event_id: '54946f38-6f58-4631-a904-a07ea92545ce', now: new Date('2026-05-23T12:00:00Z') };
const PARTIELLE = { id: 'FR-2026-0113', now: new Date('2026-07-03T12:00:00Z') };
const KEY_NOUVELLE = 'new_case|FR-2026-0146';
const KEY_EVOLUTION = 'case_update|FR-2026-0005|mise-en-examen';

// Candidats : T0 global = now − 24 h ; point de départ Instagram = now − 6 h. « dans le périmètre » = dernier geste humain APRÈS le point de départ d'Instagram.
const candNouvelle = (t0, igT0, { id = NOUVELLE.id, approuveeApresIg = true } = {}) => ({ type: 'new_case', case_id: id, decouverte_at: new Date(t0.getTime() + 1 * H), cree_at: new Date(t0.getTime() + 2 * H),
  fiche_approuvee_at: new Date(igT0.getTime() + (approuveeApresIg ? 1 : -1) * H), ps: 'publiée', retire: false });
const candEvolution = (t0, igT0, { apresIg = true } = {}) => ({ type: 'case_update', case_id: EVOLUTION.id, event_id: EVOLUTION.event_id, statut_avant: 'enquête', statut_apres: 'mise en examen',
  propose_at: new Date(t0.getTime() + 1 * H), decide_at: new Date(igT0.getTime() + (apresIg ? 1 : -1) * H), evenement_enregistre_at: new Date(igT0.getTime() + (apresIg ? 2 : -1) * H), ps: 'publiée', retire: false });

// PNG minimal VALIDE pour l'en-tête (signature + IHDR 1080×1350) : le test ne rend rien, il vérifie les contrôles qui entourent le rendu.
function faussePng(graine = 'a') {
  const ihdr = Buffer.alloc(25); ihdr.writeUInt32BE(13, 0); ihdr.write('IHDR', 4, 'ascii'); ihdr.writeUInt32BE(LARGEUR, 8); ihdr.writeUInt32BE(HAUTEUR, 12); ihdr[16] = 8; ihdr[17] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.from(`SNY-${graine}`.padEnd(200, '.'))]);
}

function monde({ t0, igT0 = undefined, candidats = [], ps = {}, retire = {} } = {}) {
  const w = { t0Row: t0 ? { t0, mode: 'review', provenance: 'test' } : null, igRow: igT0 ? { t0: igT0, mode: 'review', provenance: 'test instagram' } : null, candidats, props: [], ledger: [], ps, retire,
    posts: [], appelsBuffer: [], telegram: [], photos: [], envois: 0, medias: new Map(), rendus: 0, pannes: { creerApresCreation: 0, rendu: false, hebergement: false, telegram: false, photo: false }, exclusions: new Set() };
  const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : x);
  const parId = (id) => w.props.find((p) => p.proposal_id === id);
  w.port = {
    t0: async () => w.t0Row, t0Canal: async () => w.igRow,
    candidats: async () => w.candidats.map((c) => ({ ...c, ps: w.ps[c.case_id] ?? c.ps, retire: !!(w.retire[c.case_id] ?? c.retire) })),
    propositionParEvenement: async (k) => clone(w.props.find((p) => p.event_key === k)) ?? null,
    propositionsDeEvenement: async (k) => w.props.filter((p) => p.event_key === k || p.event_key.startsWith(`${k}#`)).map(clone),
    propositionsInstagramDeEvenement: async (k) => w.props.filter((p) => p.event_key.startsWith(`${k}#instagram:`)).map(clone),
    propositionsInstagramAvecGo: async () => w.props.filter((p) => p.decision === 'GO_I' && !p.resolution).map(clone),
    propositionParCle: async (cle) => { const r = w.props.filter((p) => p.proposal_id.startsWith(cle)); return r.length === 1 ? clone(r[0]) : null; },
    creerProposition: async (p) => { if (w.props.some((x) => x.event_key === p.event_key)) return null; const row = { ...clone(p), proposal_id: sha256(p.event_key).slice(0, 8) + '-0000-4000-8000-000000000000', decision: null, canaux_autorises: null, resolution: null, telegram_message_id: null, notif_programme_at: null, notif_publie_at: null, created_at: new Date() }; w.props.push(row); return clone(row); },
    reclamerEnvoi: async (id) => { const p = parId(id); if (p && p.telegram_message_id == null && !p.decision) { p.telegram_message_id = -1; return true; } return false; },
    noterEnvoi: async (id, mid) => { parId(id).telegram_message_id = mid ?? -2; },
    libererEnvoi: async (id) => { const p = parId(id); if (p.telegram_message_id === -1) p.telegram_message_id = null; },
    decider: async (id, { decision, canaux, now, resolution }) => { const p = parId(id); if (!p || p.decision) return false; p.decision = decision; p.canaux_autorises = canaux; p.decided_at = now; p.resolution = resolution ?? null; return true; },
    ajouterGo: async (id, { canaux, now }) => { const p = parId(id); if (!p || ['REFUS', 'EXPIREE'].includes(p.decision) || (p.resolution && p.resolution !== 'publie') || canaux.every((k) => (p.canaux_autorises || []).includes(k))) return false; const u = [...new Set([...(p.canaux_autorises || []), ...canaux])].sort(); p.canaux_autorises = u; p.decision = u.includes('x') && u.includes('facebook') ? 'GO_XF' : u.includes('x') ? 'GO_X' : u.includes('facebook') ? 'GO_F' : 'GO_I'; p.decided_at = p.decided_at ?? now; p.resolution = null; p.notif_programme_at = null; p.notif_publie_at = null; return true; },
    propositionsExpirees: async (now) => w.props.filter((p) => !p.decision && new Date(p.expire_at) < now).map((p) => ({ proposal_id: p.proposal_id })),
    propositionsAvecGo: async () => w.props.filter((p) => ['GO_XF', 'GO_F', 'GO_X'].includes(p.decision) && !p.resolution).map(clone),
    resoudre: async (id, r) => { const p = parId(id); if (!p.resolution) p.resolution = r; },
    noterNotif: async (id, q) => { const p = parId(id); if (q === 'programme') p.notif_programme_at = p.notif_programme_at ?? new Date(); else p.notif_publie_at = p.notif_publie_at ?? new Date(); },
    propositionsAConfirmer: async () => w.props.filter((p) => p.resolution === 'publie' && !p.notif_publie_at).map(clone),
    exclusionsDe: async () => new Set(), empreinteTexteExclue: async () => false,
    ledgerDe: async (k) => w.ledger.some((l) => l.event_key === k),
    diffusionsDeAffaire: async (id) => w.ledger.filter((l) => l.case_id === id).map(clone),
    lignesOuvertes: async () => w.ledger.filter((l) => ['reserve', 'soumis', 'programme', 'envoye', 'verifie'].includes(l.etat)).map(clone),
    etatsAffaires: async (ids) => ids.map((id) => ({ case_id: id, ps: w.ps[id] ?? 'publiée', retire: !!w.retire[id] })),
  };
  w.ledgerPort = {
    lire: async (k, c) => clone(w.ledger.find((l) => l.event_key === k && l.canal === c)) ?? null,
    reserver: async (l) => { if (w.ledger.some((x) => x.event_key === l.event_key && x.canal === l.canal)) return false; w.ledger.push({ ...l, etat: 'reserve', buffer_post_id: null, permalien: null, soumis_at: null, created_at: w.horloge ?? new Date() }); return true; },
    maj: async (k, c, p) => { const r = w.ledger.find((l) => l.event_key === k && l.canal === c); for (const [a, b] of Object.entries(p)) if (b != null) r[a] = b; },
  };
  w.buffer = {
    creerPost: async ({ channelId, canal, texte, dueAt, imageUrl, altText = null }) => {
      w.appelsBuffer.push({ op: 'creerPost', channelId, canal, texte, dueAt, imageUrl, altText });
      const post = { id: `bp${w.posts.length + 1}`, status: 'scheduled', text: texte, channelId, dueAt, externalLink: null };
      w.posts.push(post);
      if (w.pannes.creerApresCreation > 0) { w.pannes.creerApresCreation--; throw new ErreurBuffer('incertain', 'délai dépassé après création'); }
      return post;
    },
    lirePost: async (id) => { w.appelsBuffer.push({ op: 'lirePost', id }); return w.posts.find((p) => p.id === id) ?? null; },
    trouverPost: async ({ channelId, signature }) => { w.appelsBuffer.push({ op: 'trouverPost', channelId }); return w.posts.find((p) => p.channelId === channelId && String(p.text).replace(/\s+/g, ' ').includes(signature)) ?? null; },
    supprimerPost: async (id) => { w.appelsBuffer.push({ op: 'supprimerPost', id }); const p = w.posts.find((x) => x.id === id); if (p?.status === 'sent') throw new ErreurBuffer('refus', 'déjà publié'); w.posts = w.posts.filter((x) => x.id !== id); return true; },
  };
  w.image = {
    rendre: async ({ html }) => { if (w.pannes.rendu) throw new Error('le texte ne tient pas dans le gabarit'); w.rendus++; w.dernierHtml = html; return { png: faussePng(sha256(html).slice(0, 8)), fit: { k: 1, contexte: true } }; },
    publier: async ({ chemin, png }) => { if (w.pannes.hebergement) throw new Error('dépôt du média refusé (HTTP 403)'); const url = urlMedia('06adretn11/sousnosyeux', chemin); w.medias.set(url, { status: 200, contentType: 'image/png', png }); return { url }; },
    lire: async (url) => w.medias.get(url) ?? { status: 404, contentType: 'text/html', png: Buffer.alloc(0) },
  };
  w.ecritures = () => w.appelsBuffer.filter((a) => a.op === 'creerPost' || a.op === 'supprimerPost').length;
  w.creations = (canal) => w.appelsBuffer.filter((a) => a.op === 'creerPost' && (!canal || a.canal === canal)).length;
  return w;
}

const env = (t0, extra = {}) => ({ SNY_DIFFUSION_ACTIVE: '1', SNY_DIFFUSION_MODE: 'review', SNY_DIFFUSION_DEPUIS: t0.toISOString(), ...extra });
function deps(w, now, { ecrire = true, ficheHashServi = undefined, compoMod = null, amorcage = null, canalConfigure = true } = {}) {
  const t0 = w.t0Row?.t0 ?? null;
  const activation = verifierActivation({ env: t0 ? env(t0) : { SNY_DIFFUSION_ACTIVE: '1', SNY_DIFFUSION_MODE: 'review' }, t0Row: w.t0Row, now, plancher: '2000-01-01T00:00:00Z' });
  const compo = { cases: casesPubliques, ev: JSON.parse(JSON.stringify(ev)), redirections, wording, dossierFiche, site: SITE, now };
  if (compoMod) compoMod(compo);
  w.horloge = now;
  return { port: w.port, compo, activation, holds: new Set(), ecrire, log: (m) => { w.journal = [...(w.journal || []), m]; }, alerter: async (t) => { w.telegram.push({ alerte: t }); }, buffer: w.buffer, ledger: w.ledgerPort,
    canauxConfigures: ['x', 'facebook'], channelIds: { x: 'chX', facebook: 'chF', instagram: 'chI' }, channelId: 'chI', delaiMin: 15, igRow: w.igRow, canalConfigure, amorcage, image: w.image,
    envoyer: async (texte, markup) => { if (w.pannes.telegram) throw new Error('Telegram HS'); w.telegram.push({ texte, markup }); return 100 + ++w.envois; },
    envoyerPhoto: async (url, legende) => { if (w.pannes.photo) throw new Error('photo HS'); w.photos.push({ url, legende }); return 50 + w.photos.length; },
    servi: () => true, ficheServie: async (id) => ({ status: 200, hash: ficheHashServi === undefined ? compo.ev.fiches_approuvees?.[id]?.hash ?? null : ficheHashServi }) };
}
const propositionsTg = (w) => w.telegram.filter((m) => m.texte);
const igProps = (w) => w.props.filter((p) => p.event_key.includes('#instagram:'));
const decisionIG = async (w, action = 'I', i = 0, now = NOUVELLE.now) => { const p = igProps(w)[i]; return enregistrerDecision({ port: w.port, action, cle: p.proposal_id.slice(0, 8), now, actif: true }); };

const now = NOUVELLE.now, t0 = new Date(now.getTime() - 24 * H), igT0 = new Date(now.getTime() - 6 * H);
const prepare = (extra = {}) => monde({ t0, igT0, candidats: [candNouvelle(t0, igT0)], ...extra });

// =====================================================================
console.log('A. Composition : légende Instagram et visuel dérivés de la matière approuvée');
// =====================================================================
{
  const w = prepare(); const d = deps(w, now);
  const c = { ...w.candidats[0], event_key: KEY_NOUVELLE };
  const ig = composerInstagram(c, d.compo);
  verifie('1. composition réelle depuis une affaire approuvée : légende + spécification du visuel, aucun motif de blocage', ig.ok === true && !!ig.texte && !!ig.spec, JSON.stringify(ig.motifs));
  verifie('2. la légende ne porte aucune adresse, aucun lien présenté comme cliquable, aucune mention « lien en bio » (la bio du compte ne porte aucun lien)', !/https?:\/\//.test(ig.texte) && !/\bbio\b/i.test(ig.texte) && /sousnosyeux\.org$/.test(ig.texte));
  verifie('3. chaque source est NOMMÉE et DATÉE dans la légende (attribution exacte)', ig.post.paragraphes.flat().filter((s) => s.role === 'attribution').every((s) => /^Source : .+, .+\.$/.test(s.texte)) && ig.source.media && ig.source.publie_le);
  verifie('4. la légende garde la réserve judiciaire (présomption / caractère non définitif)', /ne vaut pas culpabilit|présum|non définiti|n['’]établit pas|caractère définitif/i.test(ig.texte));
  verifie(`5. légende ≤ ${LIMITE_LEGENDE} caractères, jamais tronquée`, [...ig.texte].length <= LIMITE_LEGENDE && !/\.\.\.|…\s*$/.test(ig.texte));
  const vv = verifierVisuel(ig.spec, ig.post, 'new_case', ig.comp.entree);
  verifie('6. contrôleur du visuel : chaque ligne affichée est un segment de la légende (copie exacte) ou un libellé fixe', vv.ok === true, JSON.stringify(vv.controles.filter((k) => !k.ok)));
  const faux = { ...ig.spec, faits: [...ig.spec.faits, 'Un fait inventé qui ne figure pas dans la légende.'] };
  verifie('7. un texte ajouté au visuel (absent de la légende) est refusé', verifierVisuel(faux, ig.post, 'new_case', ig.comp.entree).ok === false);
  const sansSource = { ...ig.spec, sources: [] };
  verifie('7b. un visuel sans source, ou sans réserve judiciaire, est refusé', verifierVisuel(sansSource, ig.post, 'new_case', ig.comp.entree).ok === false && verifierVisuel({ ...ig.spec, reserves: [], faits: ['Selon X, quelque chose.'] }, { ...ig.post, paragraphes: ig.post.paragraphes.map((p) => p.filter((s) => s.role !== 'reserve')) }, 'new_case', ig.comp.entree).ok === false);
  const tronque = { ...ig.spec, faits: [ig.spec.faits[0].slice(0, 30) + '…'] };
  verifie('7c. un texte tronqué sur le visuel est refusé', verifierVisuel(tronque, ig.post, 'new_case', ig.comp.entree).ok === false);
  const html = htmlVisuel(ig.spec);
  verifie('8. le gabarit est UN seul fichier HTML autonome : polices embarquées, aucune ressource externe, aucun script réseau', !/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<script>[\s\S]*<\/script>/, '')) && /@font-face/.test(html) && html.includes(`${LARGEUR}px`) && html.includes(`${HAUTEUR}px`));
  verifie('8b. le texte affiché est échappé (aucune injection de balise)', htmlVisuel({ ...ig.spec, etablissement: '<img src=x onerror=alert(1)>' }).includes('&lt;img src=x onerror=alert(1)&gt;'));
  const ev1 = (() => { const wE = monde({ t0: new Date(EVOLUTION.now.getTime() - 24 * H), igT0: new Date(EVOLUTION.now.getTime() - 6 * H) }); const dE = deps(wE, EVOLUTION.now); return composerInstagram({ ...candEvolution(wE.t0Row.t0, wE.igRow.t0), event_key: KEY_EVOLUTION }, dE.compo); })();
  verifie('9. une évolution judiciaire est composée de la même façon (légende + visuel conformes)', ev1.ok === true && /^Évolution documentée par la presse$/.test(ev1.spec.kicker) && verifierVisuel(ev1.spec, ev1.post, 'case_update', ev1.comp.entree).ok, JSON.stringify(ev1.motifs));
  // blocages de composition
  const wP = monde({ t0: new Date(PARTIELLE.now.getTime() - 24 * H), igT0: new Date(PARTIELLE.now.getTime() - 6 * H) }); const dP = deps(wP, PARTIELLE.now);
  const igP = composerInstagram({ type: 'new_case', case_id: PARTIELLE.id, event_key: 'new_case|FR-2026-0113' }, dP.compo);
  verifie('10. source lue en partie seulement → blocage (pas de légende)', igP.ok === false && igP.motifs.length > 0, JSON.stringify(igP.motifs));
  const dN = deps(w, now, { compoMod: (cp) => { cp.ev.fiches_approuvees = {}; } });
  verifie('11. fiche non approuvée (empreinte absente) → blocage', composerInstagram(c, dN.compo).ok === false);
  const dF = deps(w, new Date(now.getTime() + 9 * 864e5));
  verifie('12. source de plus de sept jours → blocage', composerInstagram(c, dF.compo).ok === false && composerInstagram(c, dF.compo).motifs.some((m) => /jours|récente/.test(m)));
  const dR = deps(w, now, { compoMod: (cp) => { cp.redirections = { 'fr-2026-0146': 'fr-2026-0001' }; } });
  verifie('13. identifiant retiré (doublon réconcilié) → blocage', composerInstagram(c, dR.compo).ok === false);
}

// =====================================================================
console.log('\nB. Image : contrôle de ce que Buffer verra réellement');
// =====================================================================
{
  const w = monde({}); const png = faussePng('b'); const sha = empreinteImage(png);
  const url = 'https://raw.githubusercontent.com/06adretn11/sousnosyeux/instagram-media/ig/fr-2026-0146/0123456789abcdef.png';
  w.medias.set(url, { status: 200, contentType: 'image/png', png });
  const lit = (u, attendu = sha) => controlerImageDistante({ url: u, attendu, imageDeps: w.image }).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: e.message }));
  const bon = await lit(url);
  verifie('1. URL HTTPS publique : HTTP 200, image/png, 1080×1350, empreinte du CONTENU identique à celle validée', bon.ok && bon.r.sha256 === sha && bon.r.largeur === 1080 && bon.r.hauteur === 1350 && bon.r.octets === png.length);
  verifie('2. URL non HTTPS refusée', !(await lit(url.replace('https', 'http'))).ok);
  verifie('3. média introuvable (404) → refusé', !(await lit(url + 'x')).ok);
  w.medias.set(url + '2', { status: 200, contentType: 'text/html', png });
  verifie('4. mauvais type de contenu → refusé', !(await lit(url + '2')).ok);
  w.medias.set(url + '3', { status: 302, contentType: 'image/png', png: Buffer.alloc(0) });
  verifie('4b. redirection (URL non directe) → refusée', !(await lit(url + '3')).ok);
  w.medias.set(url + '4', { status: 200, contentType: 'image/png', png: faussePng('autre') });
  verifie('5. octets différents de ceux validés (image remplacée) → refusé', !(await lit(url + '4')).ok);
  const petit = Buffer.from(png); petit.writeUInt32BE(800, 16);
  w.medias.set(url + '5', { status: 200, contentType: 'image/png', png: petit });
  verifie('6. dimensions ≠ 1080×1350 → refusé', !(await lit(url + '5', empreinteImage(petit))).ok);
  verifie('6b. pngDimensions lit la signature : un fichier qui n’est pas un PNG → null', pngDimensions(Buffer.from('<html>')) === null && pngDimensions(png).largeur === 1080);
}

// =====================================================================
console.log('\nC. Hébergement du média (branche instagram-media, API GitHub) — mocks');
// =====================================================================
{
  const png = faussePng('c'); const chemin = `ig/fr-2026-0146/${empreinteImage(png).slice(0, 16)}.png`;
  const mk = (reponses) => { const appels = []; const f = async (u, i = {}) => { appels.push({ u, m: i.method || 'GET', corps: i.body ? JSON.parse(i.body) : null }); const r = reponses(u, i.method || 'GET'); return { ok: r.status < 300, status: r.status, json: async () => r.corps ?? {} }; }; return { f, appels }; };
  let m = mk((u, mt) => (/git\/ref\/heads/.test(u) ? { status: 404 } : /git\/(blobs|trees|commits)/.test(u) ? { status: 201, corps: { sha: 'abc' } } : /git\/refs/.test(u) ? { status: 201 } : { status: 201, corps: {} }));
  let r = await mediaGithub({ token: 'jeton-secret', depot: '06adretn11/sousnosyeux', fetchImpl: m.f }).publier({ chemin, png });
  const put = m.appels.find((a) => a.m === 'PUT');
  verifie('1. branche absente → créée orpheline (commit racine sans parent), puis le fichier est déposé SUR CETTE BRANCHE', m.appels.some((a) => /git\/commits/.test(a.u) && a.corps.parents.length === 0) && put?.corps.branch === BRANCHE_MEDIA && !/branch.*main/.test(JSON.stringify(put)));
  verifie('2. URL publique directe, adressée par le contenu, jamais sur main', r.url === `https://raw.githubusercontent.com/06adretn11/sousnosyeux/instagram-media/${chemin}` && r.url.startsWith('https://') && !r.url.includes('/main/'));
  verifie('3. le contenu déposé est exactement l’image (base64)', Buffer.from(put.corps.content, 'base64').equals(png));
  m = mk((u, mt) => (/git\/ref\/heads/.test(u) ? { status: 200 } : mt === 'PUT' ? { status: 422, corps: { message: 'sha wasn’t supplied' } } : { status: 200, corps: { sha: shaBlobGit(png) } }));
  r = await mediaGithub({ token: 't', depot: '06adretn11/sousnosyeux', fetchImpl: m.f }).publier({ chemin, png });
  verifie('4. fichier déjà présent et identique (même empreinte Git) → rejeu sans erreur ni écrasement', r.url.endsWith(chemin) && m.appels.filter((a) => a.m === 'PUT').length === 1);
  m = mk((u, mt) => (/git\/ref\/heads/.test(u) ? { status: 200 } : mt === 'PUT' ? { status: 422, corps: { message: 'jeton-secret refusé' } } : { status: 200, corps: { sha: 'autre' } }));
  let erreur = ''; try { await mediaGithub({ token: 'jeton-secret', depot: '06adretn11/sousnosyeux', fetchImpl: m.f }).publier({ chemin, png }); } catch (e) { erreur = e.message; }
  verifie('5. fichier présent mais DIFFÉRENT → refus (jamais d’écrasement) et le jeton ne figure dans aucun message', erreur.startsWith('dépôt du média refusé') && !erreur.includes('jeton-secret'));
  const essai = async (c) => { try { await mediaGithub({ token: 't', depot: '06adretn11/sousnosyeux', fetchImpl: m.f }).publier({ chemin: c, png }); return true; } catch { return false; } };
  verifie('6. chemin hors gabarit (traversée, extension, casse, absolu) → refusé avant tout appel', !(await essai('../main/x.png')) && !(await essai('ig/fr-2026-0146/../../x.png')) && !(await essai('ig/FR-2026-0146/0123456789abcdef.png')) && !(await essai('/etc/passwd')) && !(await essai('ig/fr-2026-0146/0123456789abcdef.jpg')));
  verifie('7. jeton absent ou dépôt invalide → refusé', (() => { try { mediaGithub({ token: '', depot: 'a/b' }); return false; } catch { return true; } })() && (() => { try { mediaGithub({ token: 't', depot: '../x' }); return false; } catch { return true; } })());
}

// =====================================================================
console.log('\nD. Anti-backfill : aucun rattrapage, aucune proposition du seul fait de l’activation');
// =====================================================================
{
  const run = async (opts, dopts = {}) => { const w = monde(opts); await cycleInstagram(deps(w, now, dopts)); return w; };
  let w = await run({ t0, candidats: [candNouvelle(t0, igT0)] });
  verifie('1. point de départ Instagram NON posé → aucune proposition, aucun rendu, aucun message, aucune écriture', igProps(w).length === 0 && w.rendus === 0 && w.telegram.length === 0 && w.ecritures() === 0);
  w = await run({ t0, igT0, candidats: [candNouvelle(t0, igT0, { approuveeApresIg: false })] });
  verifie('2. nouvelle affaire dont la fiche a été approuvée AVANT le point de départ d’Instagram → ignorée (même si elle suit le T0 global)', igProps(w).length === 0 && w.rendus === 0 && w.telegram.length === 0);
  w = await run({ t0: new Date(now.getTime() - 24 * H), igT0, candidats: [candEvolution(new Date(EVOLUTION.now.getTime() - 24 * H), new Date(EVOLUTION.now.getTime() - 6 * H), { apresIg: false })] });
  verifie('3. évolution décidée AVANT le point de départ d’Instagram → ignorée', igProps(w).length === 0 && w.telegram.length === 0);
  const antiT0 = monde({ t0, igT0: new Date(t0.getTime() - 3 * H) });
  verifie('4. point de départ Instagram antérieur au T0 global → activation refusée (incohérent)', verifierActivationInstagram({ activation: { actif: true, t0 }, igRow: antiT0.igRow, now, canalConfigure: true }).actif === false);
  verifie('4b. point de départ dans le futur, mode ≠ review, canal non configuré, relais global inactif → refusés',
    !verifierActivationInstagram({ activation: { actif: true, t0 }, igRow: { t0: new Date(now.getTime() + 9 * H), mode: 'review' }, now, canalConfigure: true }).actif
    && !verifierActivationInstagram({ activation: { actif: true, t0 }, igRow: { t0: igT0, mode: 'auto' }, now, canalConfigure: true }).actif
    && !verifierActivationInstagram({ activation: { actif: true, t0 }, igRow: { t0: igT0, mode: 'review' }, now, canalConfigure: false }).actif
    && !verifierActivationInstagram({ activation: { actif: false, raisons: ['x'] }, igRow: { t0: igT0, mode: 'review' }, now, canalConfigure: true }).actif);
  w = await run({ t0, igT0, candidats: [candNouvelle(t0, igT0)] }, { canalConfigure: false });
  verifie('5. canal non nommé dans SNY_DIFFUSION_CANAUX / non configuré → rien', igProps(w).length === 0 && w.telegram.length === 0);
  verifie('5b. apresPointDepart : horodatage absent ou illisible → faux (échec fermé)', !apresPointDepart({ type: 'new_case', fiche_approuvee_at: null }, igT0) && !apresPointDepart({ type: 'case_update', decide_at: 'x', evenement_enregistre_at: igT0 }, igT0) && !apresPointDepart({ type: 'new_case', fiche_approuvee_at: igT0 }, null));
  w = await run({ t0, igT0, candidats: [candNouvelle(t0, igT0)] });
  verifie('6. nouveauté approuvée après les deux points de départ → UNE proposition Instagram, visuel + message envoyés', igProps(w).length === 1 && w.photos.length === 1 && propositionsTg(w).length === 1 && w.rendus === 1, JSON.stringify(w.journal));
  // exception d'amorçage : un événement nommé, plus ancien que le point de départ du canal, mais APRÈS le T0 global
  const ancien = candNouvelle(t0, igT0, { approuveeApresIg: false });
  w = await run({ t0, igT0, candidats: [ancien] }, { amorcage: KEY_NOUVELLE });
  verifie('7. exception d’amorçage : UN événement nommé (≥ T0 global, < point de départ Instagram) → proposé, marqué « première publication contrôlée »', igProps(w).length === 1 && /Première publication contrôlée/.test(propositionsTg(w)[0].texte));
  w = await run({ t0, igT0, candidats: [ancien] }, { amorcage: 'new_case|FR-2026-0001' });
  verifie('7b. l’amorçage ne vaut que pour la clé nommée : tout autre événement reste ignoré', igProps(w).length === 0);
  w = monde({ t0, igT0, candidats: [ancien] });
  await cycleInstagram(deps(w, new Date(now.getTime() + 9 * 864e5), { amorcage: KEY_NOUVELLE }));
  verifie('7c. l’amorçage ne lève AUCUN autre contrôle : source de plus de 7 jours → blocage', igProps(w).length === 0 && w.telegram.length === 0);
  w = monde({ t0, igT0, candidats: [{ ...ancien, ps: 'à publier' }] }); await cycleInstagram(deps(w, now, { amorcage: KEY_NOUVELLE }));
  verifie('7d. amorçage + affaire non publiée → blocage', igProps(w).length === 0);
  w = monde({ t0, igT0, candidats: [{ ...ancien, retire: true }] }); await cycleInstagram(deps(w, now, { amorcage: KEY_NOUVELLE }));
  verifie('7e. amorçage + affaire retirée → blocage', igProps(w).length === 0);
  w = monde({ t0, igT0, candidats: [{ ...ancien, fiche_approuvee_at: new Date(t0.getTime() - 2 * H) }] }); await cycleInstagram(deps(w, now, { amorcage: KEY_NOUVELLE }));
  verifie('7f. amorçage + événement antérieur au T0 GLOBAL → blocage (aucun rattrapage de l’historique)', igProps(w).length === 0);
  w = monde({ t0, igT0, candidats: [candNouvelle(t0, igT0)] });
  await cycleInstagram(deps(w, now)); await cycleInstagram(deps(w, new Date(now.getTime() + 36e5))); await cycleInstagram(deps(w, new Date(now.getTime() + 2 * H)));
  verifie('8. rejeux successifs : UNE proposition, UN visuel, UN message (aucun doublon d’un même événement)', igProps(w).length === 1 && w.photos.length === 1 && propositionsTg(w).length === 1 && w.rendus === 1);
}

// =====================================================================
console.log('\nE. Proposition Telegram, GO Instagram et décisions');
// =====================================================================
{
  const w = prepare(); await cycleInstagram(deps(w, now));
  const msg = propositionsTg(w)[0], p = igProps(w)[0], ig = p.identite.canaux.instagram;
  verifie('1. le visuel EXACT est envoyé d’abord (image hébergée à l’URL qui sera donnée à Buffer), puis la proposition', w.photos.length === 1 && w.photos[0].url === ig.image.url && /empreinte/.test(w.photos[0].legende) && w.telegram.indexOf(msg) >= 0);
  verifie('2. la proposition porte la légende INTÉGRALE, l’affaire, l’événement, les sources, le lien SNY, les contrôles et l’empreinte de l’image', msg.texte.includes(ig.texte.replace(/&/g, '&amp;')) && /Source :/.test(msg.texte) && /Fiche SNY : https:\/\/sousnosyeux\.org\/affaires\/fr-2026-0146\//.test(msg.texte) && /Contrôles :/.test(msg.texte) && msg.texte.includes(ig.image.sha256.slice(0, 12)) && /1080×1350/.test(msg.texte));
  verifie('3. exactement UN bouton : GO Instagram (l’absence de GO vaut refus : aucun bouton « Refuser »)', msg.markup.inline_keyboard.flat().length === 1 && /GO Instagram/.test(msg.markup.inline_keyboard[0][0].text) && !/Refuser/.test(JSON.stringify(msg.markup)) && msg.markup.inline_keyboard[0][0].callback_data === `sny:SG:I:${p.proposal_id.slice(0, 8)}`);
  verifie('4. les boutons sont reconnus par le décodeur, par le garde du Worker, et un format voisin ne l’est pas', decoderCallback('sny:SG:I:0123abcd')?.action === 'I' && DATA_RE.test('sny:SG:I:0123abcd') && !DATA_RE.test('sny:SG:IX:0123abcd') && !DATA_RE.test('sny:SG:i:0123abcd') && decoderCallback('sny:SG:XF:0123abcd')?.action === 'XF');
  verifie('5. l’identité enregistrée porte événement, fiche approuvée, source, légende, spécification, EMPREINTE DU CONTENU et URL de l’image, canal Instagram', !!p.identite.fiche_hash && p.identite.canal === 'instagram' && !!ig.texte && !!ig.spec_hash && /^[0-9a-f]{64}$/.test(ig.image.sha256) && ig.image.url.startsWith('https://') && !!ig.empreinte && ig.gabarit === GABARIT_VISUEL && !!ig.source.url);
  verifie('6. la proposition ne porte que le canal Instagram (aucun texte X / Facebook)', p.canaux_proposes.join() === 'instagram' && p.texte_x === null && p.texte_facebook === null);
  // Un GO X / Facebook ne vaut jamais GO Instagram
  for (const a of ['XF', 'F', 'X']) { const r = await decisionIG(w, a); verifie(`7${a}. bouton « ${a} » (X / Facebook) cliqué sur la proposition Instagram → refusé, aucune décision`, r.issue === 'bouton_invalide' && !p.decision && !igProps(w)[0].decision); }
  // Un GO Instagram ne vaut rien sur une proposition X / Facebook
  const w2 = prepare(); await executerCycle(deps(w2, now));
  const px = w2.props.find((x) => !x.event_key.includes('#instagram:'));
  const rr = await enregistrerDecision({ port: w2.port, action: 'I', cle: px.proposal_id.slice(0, 8), now, actif: true });
  verifie('8. bouton « GO Instagram » cliqué sur une proposition X / Facebook → refusé', rr.issue === 'bouton_invalide' && !px.decision);
  verifie('9. boutons du message commun : une ligne « GO Facebook · GO Instagram · GO X » (Instagram sur SA proposition) ; sans Instagram : Facebook et X seuls', JSON.stringify(boutonsProposition('0123abcd', ['x', 'facebook'], '99887766')) === JSON.stringify({ inline_keyboard: [[{ text: 'GO Facebook', callback_data: 'sny:SG:F:0123abcd' }, { text: 'GO Instagram', callback_data: 'sny:SG:I:99887766' }, { text: 'GO X', callback_data: 'sny:SG:X:0123abcd' }]] }) && JSON.stringify(boutonsProposition('0123abcd', ['x', 'facebook'])) === JSON.stringify({ inline_keyboard: [[{ text: 'GO Facebook', callback_data: 'sny:SG:F:0123abcd' }, { text: 'GO X', callback_data: 'sny:SG:X:0123abcd' }]] }));
  verifie('10. ACTIONS_SOCIALES : I = GO_I sur le seul canal instagram ; XF / F / X inchangés', ACTIONS_SOCIALES.I.decision === 'GO_I' && ACTIONS_SOCIALES.I.canaux.join() === 'instagram' && ACTIONS_SOCIALES.XF.canaux.join() === 'x,facebook' && !CANAUX_RELAIS.includes('instagram'));
  // Refus, silence, expiration, clic rejoué
  const wr = prepare(); await cycleInstagram(deps(wr, now));
  const refus = await decisionIG(wr, 'R'); await cycleInstagram(deps(wr, new Date(now.getTime() + 3 * H)));
  verifie('11. ancien bouton « Refuser Instagram » (message déjà envoyé) → décision REFUS, aucune publication, jamais reproposé', refus.decision === 'REFUS' && wr.creations() === 0 && igProps(wr).length === 1 && propositionsTg(wr).length === 1);
  const we = prepare(); await cycleInstagram(deps(we, now));
  const ex = await enregistrerDecision({ port: we.port, action: 'I', cle: igProps(we)[0].proposal_id.slice(0, 8), now: new Date(now.getTime() + 60 * H), actif: true });
  await cycleInstagram(deps(we, new Date(now.getTime() + 60 * H)));
  verifie('12. GO après expiration (48 h) → refusé, aucune publication', ex.issue === 'expiree' && we.creations() === 0);
  const ws = prepare(); await cycleInstagram(deps(ws, now)); await cycleInstagram(deps(ws, new Date(now.getTime() + 72 * H)));
  verifie('13. silence : la proposition expire sans GO, aucune publication, jamais d’autre proposition à l’identique', ws.creations() === 0 && igProps(ws).length === 1 && igProps(ws)[0].decision === 'EXPIREE');
  const wd = prepare(); await cycleInstagram(deps(wd, now));
  const a1 = await decisionIG(wd, 'I', 0, now), a2 = await decisionIG(wd, 'I', 0, now);
  verifie('14. clic rejoué → une seule décision enregistrée', a1.issue === 'enregistree' && a2.issue === 'double_clic');
  const wi = prepare(); await cycleInstagram(deps(wi, now));
  const ri = await enregistrerDecision({ port: wi.port, action: 'I', cle: igProps(wi)[0].proposal_id.slice(0, 8), now, actif: false });
  verifie('15. relais inactif (coupe-circuit) → le GO n’est PAS enregistré', ri.issue === 'inactif' && !igProps(wi)[0].decision);
  // Telegram HS
  const wt = prepare(); wt.pannes.telegram = true; await cycleInstagram(deps(wt, now));
  verifie('16. envoi Telegram impossible → la proposition reste « à envoyer » (réclamation rendue)', igProps(wt).length === 1 && igProps(wt)[0].telegram_message_id === null);
  wt.pannes.telegram = false; await cycleInstagram(deps(wt, new Date(now.getTime() + 6e4)));
  verifie('16b. nouvel essai au passage suivant : UNE proposition, message envoyé', igProps(wt).length === 1 && propositionsTg(wt).length === 1 && igProps(wt)[0].telegram_message_id != null);
  // Pannes de rendu / d'hébergement → silence
  const wh = prepare(); wh.pannes.hebergement = true; await cycleInstagram(deps(wh, now));
  verifie('17. hébergement du média impossible → silence, aucune proposition, aucun message', igProps(wh).length === 0 && wh.telegram.length === 0);
  const wg = prepare(); wg.pannes.rendu = true; await cycleInstagram(deps(wg, now));
  verifie('17b. texte qui ne tient pas dans le gabarit (rendu refusé) → silence : jamais de visuel tronqué, aucune proposition', igProps(wg).length === 0 && wg.telegram.length === 0 && wg.medias.size === 0);
  const wm = prepare(); const d = deps(wm, now); d.image = { ...wm.image, lire: async (u) => ({ ...(await wm.image.lire(u)), png: faussePng('substitue') }) }; await cycleInstagram(d);
  verifie('17c. média relu à l’adresse publique ≠ image rendue → silence', igProps(wm).length === 0 && wm.telegram.length === 0);
  verifie('18. message : aucun « < » nu (l’API Telegram refuse le HTML invalide) et ≤ 4096 caractères', !/<(?!\/?(b|pre)>)/.test(msg.texte) && msg.texte.length <= 4096);
}

// =====================================================================
console.log('\nF. Publication : un GO Instagram valide → UN post Instagram, rien sans GO');
// =====================================================================
{
  const w = prepare(); await cycleInstagram(deps(w, now));
  const rien = await cycleInstagram(deps(w, new Date(now.getTime() + 3 * 6e4)));
  verifie('1. GO Instagram absent → aucune écriture Buffer (ni création, ni suppression)', w.ecritures() === 0 && rien.publications.go === 0);
  // GO X / Facebook sur le MÊME événement : proposition X / Facebook séparée, cycle complet
  const wx = prepare(); const dx = deps(wx, now);
  await executerCycle(dx); await cycleInstagram(dx);
  const px = wx.props.find((p) => !p.event_key.includes('#instagram:'));
  await enregistrerDecision({ port: wx.port, action: 'XF', cle: px.proposal_id.slice(0, 8), now, actif: true });
  const dx2 = deps(wx, new Date(now.getTime() + 6e4)); await executerCycle(dx2); await cycleInstagram(dx2);
  verifie('2. GO X + Facebook donné, aucun GO Instagram → X et Facebook partent, AUCUN post Instagram', wx.creations('x') === 1 && wx.creations('facebook') === 1 && wx.creations('instagram') === 0 && igProps(wx)[0].decision === null);
  verifie('2b. X et Facebook portent le MÊME visuel que la proposition Instagram (même URL, même fichier), avec son texte alternatif ; aucun ne passe par le canal Instagram',
    wx.appelsBuffer.filter((a) => a.op === 'creerPost').every((a) => a.imageUrl === igProps(wx)[0].identite.canaux.instagram.image.url && !!a.altText && a.channelId !== 'chI') && wx.rendus === 1, `rendus=${wx.rendus}`);
  // GO Instagram valide
  const wg = prepare(); await executerCycle(deps(wg, now)); await cycleInstagram(deps(wg, now));
  await decisionIG(wg, 'I', 0, now);
  const t1 = new Date(now.getTime() + 6e4); const dg = deps(wg, t1);
  const rg = await cycleInstagram(dg);
  const posts = wg.appelsBuffer.filter((a) => a.op === 'creerPost');
  const ig = igProps(wg)[0].identite.canaux.instagram;
  verifie('3. GO Instagram valide → UN post Instagram, programmé avec délai d’annulation, légende et image EXACTES validées, canal Instagram', posts.length === 1 && posts[0].canal === 'instagram' && posts[0].channelId === 'chI' && posts[0].texte === ig.texte && posts[0].imageUrl === ig.image.url
    && new Date(posts[0].dueAt).getTime() === t1.getTime() + 15 * 6e4 && rg.publications.publiees === 1, JSON.stringify(rg));
  verifie('3b. le GO Instagram n’a déclenché aucun post X ni Facebook', wg.creations('x') === 0 && wg.creations('facebook') === 0);
  verifie('3c. le journal est tenu sur la clé de l’ÉVÉNEMENT et le canal instagram (une seule diffusion par événement)', wg.ledger.length === 1 && wg.ledger[0].event_key === KEY_NOUVELLE && wg.ledger[0].canal === 'instagram' && wg.ledger[0].etat === 'programme');
  verifie('3d. confirmation « programmée » envoyée une fois', wg.telegram.filter((m) => m.alerte && /Publication Instagram programmée/.test(m.alerte)).length === 1);
  // Rejeu
  await cycleInstagram(deps(wg, new Date(now.getTime() + 12e4))); await cycleInstagram(deps(wg, new Date(now.getTime() + 18e4)));
  verifie('4. rejeux après publication → zéro doublon', wg.creations('instagram') === 1);
  // L'événement ne peut plus être reproposé une fois diffusé
  const wp = prepare(); await cycleInstagram(deps(wp, now)); await decisionIG(wp, 'I', 0, now); await cycleInstagram(deps(wp, t1));
  await cycleInstagram(deps(wp, new Date(now.getTime() + 2 * H)));
  verifie('4b. une fois diffusé, l’événement n’est plus jamais reproposé sur Instagram', igProps(wp).length === 1);
  // Confirmation avec permalien : seulement quand le post est réellement parti
  wg.posts[0].status = 'sent'; wg.posts[0].externalLink = 'https://www.instagram.com/p/XYZ/';
  const dc = deps(wg, new Date(now.getTime() + 30 * 6e4));
  await suivreEtRetirer({ ...dc, compo: dc.compo });
  const apresSuivi = await confirmerInstagram(dc);
  verifie('5. « Publié » n’est annoncé qu’une fois le post réellement envoyé, avec son permalien (un post seulement accepté par Buffer n’est pas une preuve)', apresSuivi === 1 && wg.telegram.some((m) => m.alerte && /Publié sur Instagram/.test(m.alerte) && m.alerte.includes('https://www.instagram.com/p/XYZ/')) && (await confirmerInstagram(dc)) === 0);
  const wq = prepare(); await cycleInstagram(deps(wq, now)); await decisionIG(wq, 'I', 0, now); await cycleInstagram(deps(wq, t1));
  const dq = deps(wq, new Date(now.getTime() + 20 * 6e4)); await suivreEtRetirer({ ...dq, compo: dq.compo });
  verifie('5b. post seulement programmé (non envoyé) → aucune confirmation « Publié »', (await confirmerInstagram(dq)) === 0 && !wq.telegram.some((m) => m.alerte && /Publié sur Instagram/.test(m.alerte)));
  // Timeout : le post existe peut-être chez Buffer
  const wt = prepare(); await cycleInstagram(deps(wt, now)); await decisionIG(wt, 'I', 0, now);
  wt.pannes.creerApresCreation = 1;
  await cycleInstagram(deps(wt, t1));
  for (let i = 2; i <= 4; i++) await cycleInstagram(deps(wt, new Date(t1.getTime() + i * 20 * 6e4)));
  verifie('6. réponse incertaine après création (timeout) → réconcilié par lecture distante, UN seul post Instagram', wt.posts.filter((p) => p.channelId === 'chI').length === 1 && wt.creations('instagram') === 1, JSON.stringify(wt.appelsBuffer.map((a) => a.op)));
  // Retrait avant publication
  const wrt = prepare(); await cycleInstagram(deps(wrt, now)); await decisionIG(wrt, 'I', 0, now); await cycleInstagram(deps(wrt, t1));
  wrt.retire[NOUVELLE.id] = true;
  const dr = deps(wrt, new Date(now.getTime() + 5 * 6e4)); await suivreEtRetirer({ ...dr, compo: dr.compo });
  verifie('7. affaire retirée avant l’envoi → publication Instagram ANNULÉE chez Buffer, journal « annule »', wrt.posts.length === 0 && wrt.ledger[0].etat === 'annule' && wrt.appelsBuffer.some((a) => a.op === 'supprimerPost'));
  const wrb = prepare(); await cycleInstagram(deps(wrb, now)); await decisionIG(wrb, 'I', 0, now); wrb.retire[NOUVELLE.id] = true; await cycleInstagram(deps(wrb, t1));
  verifie('7b. affaire retirée entre le GO et l’envoi → recontrôle bloque, AUCUN appel Buffer, le GO est résolu comme périmé', wrb.creations() === 0 && /^bloque/.test(igProps(wrb)[0].resolution || '') && wrb.telegram.some((m) => m.alerte && /GO Instagram non exécuté/.test(m.alerte)));
}

// =====================================================================
console.log('\nG. Immuabilité : image, légende, fiche, sources, URL — toute modification invalide le GO');
// =====================================================================
{
  const cas = async (nom, alterer, attendu = /^(obsolete|bloque)/, { apresGo = null } = {}) => {
    const w = prepare(); await cycleInstagram(deps(w, now)); await decisionIG(w, 'I', 0, now);
    if (apresGo) apresGo(w);
    const t1 = new Date(now.getTime() + 6e4);
    const d = deps(w, t1, alterer.compoMod ? { compoMod: alterer.compoMod } : alterer.ficheHashServi !== undefined ? { ficheHashServi: alterer.ficheHashServi } : {});
    await cycleInstagram(d);
    verifie(nom, w.creations() === 0 && attendu.test(igProps(w)[0].resolution || ''), `${w.creations()} création(s), résolution : ${igProps(w)[0].resolution}`);
    return w;
  };
  await cas('1. image remplacée sur l’hébergeur après la proposition (mêmes URL, autres octets) → GO invalidé, aucune écriture Buffer', {}, undefined, { apresGo: (w) => { const [u] = [...w.medias.keys()]; w.medias.set(u, { status: 200, contentType: 'image/png', png: faussePng('remplacee') }); } });
  await cas('2. image retirée (404) après la proposition → GO invalidé', {}, undefined, { apresGo: (w) => { w.medias.clear(); } });
  await cas('3. légende modifiée dans la proposition enregistrée → GO invalidé', {}, undefined, { apresGo: (w) => { const p = igProps(w)[0]; p.identite.canaux.instagram.texte += ' Un ajout.'; } });
  await cas('4. spécification du visuel modifiée → GO invalidé', {}, undefined, { apresGo: (w) => { igProps(w)[0].identite.canaux.instagram.spec_hash = 'autre'; } });
  await cas('5. URL du média modifiée → GO invalidé', {}, undefined, { apresGo: (w) => { const p = igProps(w)[0]; const u = p.identite.canaux.instagram.image.url; w.medias.set(u + '?v=2', w.medias.get(u)); p.identite.canaux.instagram.image.url = u + '?v=2'; } });
  await cas('6. nouvelle version de fiche approuvée (empreinte changée) → GO invalidé', { compoMod: (cp) => { cp.ev.fiches_approuvees['FR-2026-0146'] = { hash: 'ffffffffffffffff' }; } });
  await cas('7. fiche individuelle servie ≠ version approuvée → GO invalidé', { ficheHashServi: 'ffffffffffffffff' });
  await cas('8. source changée (autre média cité) → GO invalidé', {}, undefined, { apresGo: (w) => { igProps(w)[0].identite.canaux.instagram.source = { media: 'Autre média', url: 'https://example.org/x', publie_le: '2026-11-11' }; } });
  await cas('9. empreinte d’ensemble enregistrée altérée → GO invalidé', {}, undefined, { apresGo: (w) => { igProps(w)[0].identite.canaux.instagram.empreinte = 'f'.repeat(64); } });
  await cas('10. identité enregistrée incomplète (sans URL d’image) → GO sans effet', {}, undefined, { apresGo: (w) => { delete igProps(w)[0].identite.canaux.instagram.image; } });
  await cas('11. changement de gabarit visuel (mise en page) entre la proposition et le GO → GO invalidé', {}, undefined, { apresGo: (w) => { igProps(w)[0].identite.canaux.instagram.gabarit = 'ig-v0'; } });
  // GO donné sur une proposition ancienne dont le contenu a changé : une NOUVELLE proposition (autre clé) est possible, le GO ancien ne vaut pas pour elle
  const w = prepare(); await cycleInstagram(deps(w, now)); await decisionIG(w, 'I', 0, now);
  verifie('12. la proposition porte une clé dérivée du contenu (légende + visuel) : un contenu différent = une proposition différente', /#instagram:[0-9a-f]{8}$/.test(igProps(w)[0].event_key));
  const wa = prepare(); await cycleInstagram(deps(wa, now));
  verifie('13. canal non configuré / identifiant de canal absent au moment du GO → bloqué, aucun appel Buffer', await (async () => { await decisionIG(wa, 'I', 0, now); const d = deps(wa, new Date(now.getTime() + 6e4)); d.channelId = ''; await publierInstagram(d); return wa.creations() === 0 && /^bloque/.test(igProps(wa)[0].resolution || ''); })());
}

// =====================================================================
console.log('\nH. Non-régression X / Facebook, migration et client Buffer');
// =====================================================================
{
  // Propositions X / Facebook : mêmes résultats avec ou sans Instagram
  const seul = prepare(); await executerCycle(deps(seul, now));
  const duo = prepare(); await executerCycle(deps(duo, now)); await cycleInstagram(deps(duo, now));
  const xf = (w) => w.props.filter((p) => !p.event_key.includes('#instagram:'));
  verifie('1. la proposition X / Facebook est identique, octet pour octet, avec ou sans Instagram (textes, empreintes, canaux, boutons, message)',
    xf(seul).length === 1 && xf(duo).length === 1 && xf(seul)[0].texte_x === xf(duo)[0].texte_x && xf(seul)[0].texte_facebook === xf(duo)[0].texte_facebook && xf(seul)[0].empreinte_x === xf(duo)[0].empreinte_x
    && xf(seul)[0].empreinte_facebook === xf(duo)[0].empreinte_facebook && xf(duo)[0].canaux_proposes.join() === 'x,facebook' && JSON.stringify(seul.telegram.find((m) => m.texte).markup) === JSON.stringify(duo.telegram.find((m) => m.texte && /GO X/.test(JSON.stringify(m.markup))).markup));
  verifie('2. un message Telegram distinct par proposition : X / Facebook d’un côté, Instagram de l’autre (jamais mélangés)', propositionsTg(duo).length === 2 && propositionsTg(duo).filter((m) => /INSTAGRAM/.test(m.texte)).length === 1 && !/INSTAGRAM/.test(propositionsTg(duo).find((m) => /GO X/.test(JSON.stringify(m.markup))).texte));
  // GO partiel X seul : le complément ne touche pas Instagram
  const px = xf(duo)[0];
  await enregistrerDecision({ port: duo.port, action: 'X', cle: px.proposal_id.slice(0, 8), now, actif: true });
  const d2 = deps(duo, new Date(now.getTime() + 6e4)); await executerCycle(d2); await cycleInstagram(d2);
  verifie('3. GO X seul exécuté normalement ; la proposition Instagram, elle, reste en attente de SON GO', duo.creations('x') === 1 && duo.creations('instagram') === 0 && igProps(duo)[0].decision === null && !igProps(duo)[0].resolution);
  const iprop = igProps(duo)[0];
  verifie('3b. une proposition Instagram expirée est refermée par le même passage que les autres, sans publication', await (async () => { const d3 = deps(duo, new Date(now.getTime() + 80 * H)); await executerCycle(d3); return igProps(duo)[0].decision === 'EXPIREE' && duo.creations('instagram') === 0; })());
  // publierDecisions X / Facebook ne résout JAMAIS une proposition Instagram (propositionsAvecGo n'en renvoie pas)
  const wy = prepare(); await cycleInstagram(deps(wy, now)); await decisionIG(wy, 'I', 0, now);
  await executerCycle(deps(wy, new Date(now.getTime() + 6e4)));
  verifie('4. le passage X / Facebook ne touche pas à un GO Instagram (ni création, ni résolution) : Instagram n’est publié que par son propre circuit', wy.creations() === 0 && !igProps(wy)[0].resolution);
  await cycleInstagram(deps(wy, new Date(now.getTime() + 12e4)));
  verifie('4b. … et le circuit Instagram l’exécute ensuite, une seule fois', wy.creations('instagram') === 1);
  // Migration
  const sql027 = decouperInstructions(readFileSync(join(racine, 'supabase/migrations/027_relais_social_instagram.sql'), 'utf8'));
  verifie('6. migration 027 : additive (aucune instruction destructrice au sens du garde), 5 instructions, aucune table nouvelle', sql027.length === 5 && !sql027.some(instructionDestructrice) && !sql027.some((s) => /create table/i.test(s)), JSON.stringify(sql027.map((s) => s.slice(0, 50))));
  verifie('6b. le garde reste strict : drop table, drop column, truncate, delete, update, drop constraint hors liste → toujours refusés',
    ['drop table relais_social_propositions', 'alter table relais_social_propositions drop column decision', 'truncate relais_social_config', 'delete from relais_social_config', 'update relais_social_config set t0 = now()',
      'alter table relais_social_config drop constraint if exists relais_social_config_mode_check', 'alter table cases drop constraint if exists relais_social_config_id_check', 'alter table relais_social_propositions drop constraint relais_social_propositions_decision_check']
      .every(instructionDestructrice));
  verifie('6c. les deux seules levées de contrainte tolérées sont nommément celles de 027', instructionDestructrice(sql027[0]) === false && instructionDestructrice(sql027[2]) === false && /GO_I/.test(sql027[1]) && /id in \(1, 2\)/.test(sql027[3]));
  verifie('6d. la migration 026 reste intacte (T0 global : ligne 1, immuable)', /check \(id = 1\)/.test(readFileSync(join(racine, 'supabase/migrations/026_relais_social_review.sql'), 'utf8')));
  // Client Buffer : le post Instagram exigé par Buffer
  const envoyes = [];
  const b = clientBuffer({ cle: 'cle-buffer', organisationId: 'org', fetchImpl: async (u, i) => { const corps = JSON.parse(i.body); envoyes.push(corps); return { status: 200, ok: true, json: async () => ({ data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'p1', status: 'scheduled', dueAt: corps.variables.input.dueAt } } } }) }; } });
  await b.creerPost({ channelId: 'chI', canal: 'instagram', texte: 'légende', dueAt: '2026-11-17T10:00:00.000Z', imageUrl: 'https://raw.githubusercontent.com/x/y/instagram-media/ig/a/0123456789abcdef.png' });
  const inp = envoyes[0].variables.input;
  verifie('7. createPost Instagram : publication AUTOMATIQUE (jamais une notification), programmée, image par URL, publication au fil', inp.schedulingType === 'automatic' && inp.mode === 'customScheduled' && inp.assets[0].image.url.startsWith('https://') && inp.metadata.instagram.type === 'post' && inp.metadata.instagram.shouldShareToFeed === true && inp.channelId === 'chI');
  let refus = null; try { await b.creerPost({ channelId: 'chI', canal: 'instagram', texte: 'x', dueAt: 'd', imageUrl: null }); } catch (e) { refus = e; }
  verifie('7b. Instagram sans image → refus avant tout appel réseau', refus?.kind === 'refus' && envoyes.length === 1);
}

// =====================================================================
console.log('\nI. Sécurité du dépôt : aucun secret, aucun lanceur déguisé, aucun accès hors liste');
// =====================================================================
{
  const sources = ['scripts/lib/relais-instagram.mjs', 'scripts/lib/instagram-visuel.mjs', 'scripts/lib/media-github.mjs'].map((f) => [f, readFileSync(join(racine, f), 'utf8')]);
  verifie('1. aucun secret codé en dur (clé, jeton, mot de passe, chaîne de connexion)', sources.every(([, s]) => !/(ghp_|github_pat_|xox[bp]-|AKIA|sk-[A-Za-z0-9]{20}|postgres(?:ql)?:\/\/|bearer [A-Za-z0-9]{20})/i.test(s)));
  verifie('2. le navigateur est lancé en LISTE D’ARGUMENTS (execFile), jamais par un shell, sans eval ni commande construite', /import \{ execFile \} from 'node:child_process'/.test(sources[1][1]) && /execFile\(bin, args/.test(sources[1][1]) && !/shell:\s*true|\beval\(|new Function\(|execSync|spawnSync|\bspawn\(/.test(sources[1][1]));
  verifie('3. le chemin du média est confiné par une expression stricte (aucune traversée possible)', /RE_CHEMIN = \/\^ig\\\/\[a-z0-9-\]\{3,30\}\\\/\[0-9a-f\]\{16\}\\\.png\$\//.test(sources[2][1]));
  verifie('4. aucun journal ne contient de texte éditorial ni d’adresse (les motifs sont abrégés par motifsPublics avant d’être loggés)', /motifsPublics/.test(sources[0][1]));
}

// =====================================================================
console.log('\nPare-feu éditorial sur Instagram (1 changement judiciaire + 1 prise de parole par affaire et par jour)');
// =====================================================================
{
  const postDuJour = (w, etat = 'programme') => w.ledger.push({ event_key: 'case_update|FR-2026-0146|mise-en-examen', canal: 'instagram', case_id: NOUVELLE.id, type_event: 'case_update', etat, texte: 't', created_at: now });
  const w = prepare(); postDuJour(w);
  const lignes = []; await cycleInstagram({ ...deps(w, now), log: (m) => lignes.push(m) });
  verifie('PF1. un changement judiciaire déjà posté sur Instagram aujourd’hui : AUCUNE proposition Instagram pour un 2e (silence journalisé), aucun rendu', igProps(w).length === 0 && w.rendus === 0 && /SILENCE[^\n]*pare-feu/.test(lignes.join('\n')), lignes.join(' / '));
  const w2 = prepare(); postDuJour(w2, 'annule');
  await cycleInstagram(deps(w2, now));
  verifie('PF2. une ligne annulée n’est pas un post : la proposition Instagram est faite', igProps(w2).length === 1);
  const w3 = prepare(); await cycleInstagram(deps(w3, now)); await decisionIG(w3, 'I', 0, now); postDuJour(w3);
  const r = await cycleInstagram(deps(w3, new Date(now.getTime() + 6e4)));
  verifie('PF3. GO Instagram donné, puis un autre post judiciaire du jour part avant lui : le GO est REFUSÉ à l’exécution (aucun post Instagram), alerte, proposition conservée', w3.creations('instagram') === 0 && /^bloque: pare-feu/.test(igProps(w3)[0].resolution ?? '') && w3.telegram.some((m) => m.alerte && /pare-feu/.test(m.alerte)) && r.publications.bloquees === 1, String(igProps(w3)[0].resolution));
}

// =====================================================================
console.log('\nI. UN message pour les trois réseaux : le visuel, les textes Facebook / Instagram / X, un bouton GO par réseau');
// =====================================================================
{
  const joint = (w, t) => ({ ...deps(w, t), instagram: { igRow: w.igRow, canalConfigure: true, amorcage: null } });
  const plus = (ms) => new Date(now.getTime() + ms);
  const sansHtml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const xfDe = (w) => w.props.find((p) => !p.event_key.includes('#instagram:'));
  const w = prepare(); await executerCycle(joint(w, now)); await cycleInstagram(joint(w, now));
  const xf = xfDe(w), ig = igProps(w)[0], msgs = propositionsTg(w);
  verifie('I1. UN seul message et UN seul visuel pour l’événement : Instagram n’envoie pas de second message', msgs.length === 1 && w.photos.length === 1 && w.props.length === 2, JSON.stringify([msgs.length, w.photos.length, w.props.length]));
  const m = msgs[0], igTexte = ig?.identite.canaux.instagram.texte ?? '';
  verifie('I2. le message porte les trois textes EXACTS : Facebook, Instagram et X', sansHtml(m.texte).includes(xf.texte_facebook) && sansHtml(m.texte).includes(igTexte) && sansHtml(m.texte).includes(xf.texte_x) && /<b>Instagram<\/b>/.test(m.texte));
  const b = m.markup.inline_keyboard;
  verifie('I3. UNE ligne de boutons « GO Facebook · GO Instagram · GO X » (aucun « Refuser ») ; GO Instagram porte l’identifiant de la proposition Instagram', b.length === 1 && b[0].map((x) => x.text).join() === 'GO Facebook,GO Instagram,GO X' && b[0][1].callback_data === `sny:SG:I:${ig.proposal_id.slice(0, 8)}` && b[0][0].callback_data === `sny:SG:F:${xf.proposal_id.slice(0, 8)}` && b[0][2].callback_data === `sny:SG:X:${xf.proposal_id.slice(0, 8)}`, JSON.stringify(b));
  verifie('I4. le MÊME visuel (même fichier, même empreinte) pour les trois réseaux, rendu UNE seule fois', ig.identite.canaux.instagram.image.url === xf.identite.image.url && ig.identite.canaux.instagram.image.sha256 === xf.identite.image.sha256 && w.rendus === 1 && w.photos[0].url === xf.identite.image.url);
  verifie('I5. les deux propositions portent le MÊME numéro de message Telegram (aucun renvoi) et la marque « commune »', xf.telegram_message_id > 0 && xf.telegram_message_id === ig.telegram_message_id && xf.identite.commun === true && ig.identite.commun === true);
  await executerCycle(joint(w, plus(6e4))); await cycleInstagram(joint(w, plus(6e4)));
  verifie('I6. cycles répétés : ni nouveau message, ni nouveau visuel, ni nouvelle proposition', propositionsTg(w).length === 1 && w.photos.length === 1 && w.props.length === 2 && w.rendus === 1);
  // GO indépendants : Instagram, puis X ; Facebook, sans GO, n'est jamais publié
  const ri = await enregistrerDecision({ port: w.port, action: 'I', cle: ig.proposal_id.slice(0, 8), now: plus(10 * 6e4), actif: true });
  await executerCycle(joint(w, plus(15 * 6e4))); await cycleInstagram(joint(w, plus(15 * 6e4)));
  verifie('I7. GO Instagram seul → UN post Instagram (légende exacte, visuel du message), rien sur X ni Facebook', ri.issue === 'enregistree' && w.creations('instagram') === 1 && w.creations() === 1 && w.appelsBuffer.find((a) => a.op === 'creerPost').texte === igTexte && w.appelsBuffer.find((a) => a.op === 'creerPost').imageUrl === xf.identite.image.url);
  const rx = await enregistrerDecision({ port: w.port, action: 'X', cle: xf.proposal_id.slice(0, 8), now: plus(20 * 6e4), actif: true });
  await executerCycle(joint(w, plus(25 * 6e4))); await cycleInstagram(joint(w, plus(25 * 6e4)));
  verifie('I8. GO X ensuite sur le même message → UN post X avec le même visuel ; Facebook, sans GO, n’est jamais publié', rx.issue === 'enregistree' && w.creations() === 2 && w.creations('x') === 1 && w.creations('facebook') === 0 && w.appelsBuffer.filter((a) => a.op === 'creerPost').every((a) => a.imageUrl === xf.identite.image.url));
  // Instagram hors périmètre (fiche approuvée avant le point de départ du canal) : le message ne l'offre pas
  const wh = monde({ t0, igT0, candidats: [candNouvelle(t0, igT0, { approuveeApresIg: false })] }); await executerCycle(joint(wh, now)); await cycleInstagram(joint(wh, now));
  verifie('I9. événement hors périmètre d’Instagram : message X / Facebook sans Instagram (deux boutons), aucune proposition Instagram', propositionsTg(wh).length === 1 && propositionsTg(wh)[0].markup.inline_keyboard[0].length === 2 && igProps(wh).length === 0 && !/<b>Instagram<\/b>/.test(propositionsTg(wh)[0].texte));
  // Instagram seul (X / Facebook non publiables) : son propre message, avec son seul bouton
  const wi = prepare(); await executerCycle({ ...joint(wi, now), canauxConfigures: [] }); await cycleInstagram(joint(wi, now));
  verifie('I10. X / Facebook non publiables : Instagram garde son propre message (un seul bouton « GO Instagram »)', propositionsTg(wi).length === 1 && propositionsTg(wi)[0].markup.inline_keyboard.flat().length === 1 && igProps(wi).length === 1);
  // Reproposition ciblée : les anciennes propositions (X / Facebook ET Instagram, jamais décidées) sont remplacées par UN message commun
  const wr = prepare(); await executerCycle(deps(wr, now)); await cycleInstagram(deps(wr, now));
  verifie('I11. (point de départ) deux anciens messages, deux propositions ouvertes', propositionsTg(wr).length === 2 && wr.props.length === 2);
  await executerCycle({ ...joint(wr, plus(6e4)), reproposer: new Set([KEY_NOUVELLE]) }); await cycleInstagram(joint(wr, plus(6e4)));
  const anciennes = wr.props.slice(0, 2), nouvelles = wr.props.slice(2), nm = propositionsTg(wr).slice(2), dernier = nm[nm.length - 1];
  verifie('I12. reproposition : les deux anciennes sont refermées « remplacee » SANS décision ; UNE proposition commune X / Facebook + UNE Instagram les remplacent, dans UN seul envoi (un visuel, les textes — éventuellement sur deux messages si la taille l’exige —, les trois boutons sur le dernier)', anciennes.every((p) => !p.decision && /^remplacee:/.test(p.resolution ?? '')) && nouvelles.length === 2 && wr.photos.length === 3 && nm.length >= 1 && nm.slice(0, -1).every((x) => !x.markup) && dernier.markup.inline_keyboard[0].length === 3 && /Remplace les propositions/.test(nm.map((x) => x.texte).join(" ")) && nouvelles.some((p) => p.event_key.includes('#commun:')) && nouvelles.some((p) => p.event_key.includes('#instagram:')) && wr.rendus === 1, JSON.stringify(wr.props.map((p) => [p.event_key.slice(-22), p.resolution?.slice(0, 9) ?? null])));
  await executerCycle({ ...joint(wr, plus(12e4)), reproposer: new Set([KEY_NOUVELLE]) }); await cycleInstagram(joint(wr, plus(12e4)));
  verifie('I13. la reproposition ne se répète pas (cycles suivants : rien de plus)', wr.props.length === 4 && wr.photos.length === 3);
  const ancienClic = await enregistrerDecision({ port: wr.port, action: 'I', cle: anciennes[1].proposal_id.slice(0, 8), now: plus(15e4), actif: true });
  verifie('I14. un clic sur le bouton d’un ANCIEN message remplacé n’enregistre rien (« expirée »), aucun post', ancienClic.issue === 'expiree' && wr.creations() === 0);
}

console.log(ko ? `\n❌ ${ko} vérification(s) en échec` : '\n✅ relais Instagram : toutes les vérifications passent');
process.exit(ko ? 1 : 0);
