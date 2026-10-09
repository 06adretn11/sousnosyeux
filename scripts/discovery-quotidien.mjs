#!/usr/bin/env node
// =====================================================================
// scripts/discovery-quotidien.mjs — le run Discovery, une fois par jour.
//
//   node scripts/discovery-quotidien.mjs --baseline   # ARMEMENT : consigne l'existant, ne notifie rien, pose le watermark
//   node scripts/discovery-quotidien.mjs --dry-run    # tout calculer, ne rien écrire (ni Neon, ni Telegram)
//   node scripts/discovery-quotidien.mjs              # run nominal
//
//   options : --lookback N (jours, défaut 7) · --max N (signaux qualifiés par run, défaut 8)
//             --moteur <slug OpenRouter> · --verbose (poste local UNIQUEMENT) · --apres/--avant AAAA-MM-JJ (fenêtre de test)
//
// Chaîne : recherche presse sur une fenêtre glissante → déduplication persistante (discovery_signaux)
//          → filtre déterministe → grappes (même histoire) → qualification (qualifier-signal.mjs)
//          → new_case_proposals. Telegram est un autre pas (telegram-v0.mjs notifier-nouvelles).
//
// Régime nominal : 0 signal jamais traité → 0 appel modèle → 0 proposition → 0 message.
// Dépôt public ⇒ logs publics : sans --verbose, seuls des compteurs sont affichés (jamais un titre, un lieu, une URL).
// =====================================================================
import { createHash } from 'node:crypto';
import { connecter } from './lib/neon.mjs';
import { scannerFenetre, GRILLE } from './lib/discovery-presse.mjs';
import { scannerBing } from './lib/scan-bing.mjs';
import { aplatir, filtrer } from './lib/capteurs.mjs';
import { construireIndex, resoudre } from './lib/resolver.mjs';
import { evaluer } from './lib/qualifier-signal.mjs';
import { messageDecision } from './lib/discovery-messages.mjs';

const A = process.argv.slice(2);
const flag = (n) => A.includes(n);
const arg = (n, d) => (A.includes(n) ? A[A.indexOf(n) + 1] : d);
const DRY = flag('--dry-run');
const BASELINE = flag('--baseline');
const VERBOSE = flag('--verbose') && !process.env.CI;
const LOOKBACK = Number(arg('--lookback', 7));
const MAX = Number(arg('--max', 8));
const MODELE = arg('--moteur', 'deepseek/deepseek-v4.1-flash');
const ATTENTE_JOURS = 21;
const iso = (d) => d.toISOString().slice(0, 10);
const v = (...x) => { if (VERBOSE) console.log(...x); };

const { sql } = connecter();
const cleSignal = (titre) => createHash('sha1').update(aplatir(titre).slice(0, 80)).digest('hex').slice(0, 20);
const mots = (s) => new Set(aplatir(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / ((a.size + b.size - i) || 1); };

// --- schéma : fail closed -------------------------------------------------
const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('discovery_signaux', 'discovery_etat', 'new_case_proposals')`;
if (tables.length < 3) { console.error('migrations 016/017 non appliquées : arrêt'); process.exit(1); }

const [wm] = await sql`select valeur from discovery_etat where cle = 'watermark'`;
if (!wm && !BASELINE && !DRY) { console.error('aucun watermark : lancer --baseline avant le premier run (sinon tout le passé serait notifiable)'); process.exit(1); }

// --- 1. recherche presse ----------------------------------------------------
const after = arg('--apres', iso(new Date(Date.now() - LOOKBACK * 864e5)));
const before = arg('--avant', iso(new Date(Date.now() + 864e5)));
const scanG = await scannerFenetre({ after, before });
const scanB = flag('--sans-bing') ? { items: [], erreurs: [] } : await scannerBing({ jours: LOOKBACK });
// Un capteur entièrement en panne n'arrête pas le run tant que l'autre répond ; les deux en panne : arrêt, rien consigné.
if (scanG.erreurs.length >= GRILLE.length && (flag("--sans-bing") || scanB.erreurs.length >= GRILLE.length)) { console.error('sources presse indisponibles : arrêt, rien consigné'); process.exit(1); }

// Un signal = un titre. Le capteur Bing apporte en plus l'URL éditeur directe (relecture sans recherche).
const parCle = new Map();
for (const x of scanG.items) parCle.set(cleSignal(x.titre), { ...x, cle: cleSignal(x.titre), urls: [] });
for (const x of scanB.items) {
  const k = cleSignal(x.titre);
  const s = parCle.get(k) || { titre: x.titre, media: x.media, published: x.published, cle: k, urls: [] };
  s.urls.push({ url: x.url, media: x.media, published: x.published });
  parCle.set(k, s);
}
const signaux = [...parCle.values()];
console.log(`scan : ${signaux.length} titres uniques (Google ${scanG.items.length}, Bing ${scanB.items.length} avec URL directe) sur ${LOOKBACK} j, ${scanG.erreurs.length + scanB.erreurs.length} requête(s) en erreur`);

async function consigner(rows, statut, motif) {
  if (DRY || !rows.length) return;
  await sql`insert into discovery_signaux (cle, titre, media, published, statut, motif, last_checked)
            select * from unnest(${rows.map((r) => r.cle)}::text[], ${rows.map((r) => r.titre)}::text[], ${rows.map((r) => r.media || null)}::text[],
                                 ${rows.map((r) => r.published || null)}::date[], ${rows.map(() => statut)}::text[], ${rows.map((r) => motif(r))}::text[], ${rows.map(() => new Date().toISOString())}::timestamptz[])
            on conflict (cle) do nothing`;
}

// --- 2. armement : baseline ----------------------------------------------------
if (BASELINE) {
  await consigner(signaux, 'baseline', () => 'armement');
  if (!DRY) await sql`insert into discovery_etat (cle, valeur) values ('watermark', ${new Date().toISOString()}) on conflict (cle) do update set valeur = excluded.valeur, maj = now()`;
  console.log(`baseline${DRY ? ' (à blanc)' : ''} : ${signaux.length} titres consignés, aucun notifiable ; watermark ${DRY ? 'non posé' : 'posé'}`);
  process.exit(0);
}

// --- 3. déduplication persistante ---------------------------------------------
const deja = new Map((await sql`select cle, statut from discovery_signaux where cle = any(${signaux.map((s) => s.cle)})`).map((r) => [r.cle, r.statut]));
const plancher = wm ? iso(new Date(Date.parse(wm.valeur) - LOOKBACK * 864e5)) : null; // jamais de signal antérieur à l'armement − fenêtre
const neufs = signaux.filter((s) => !deja.has(s.cle) && !(plancher && s.published && s.published < plancher));
const filtres = neufs.filter((s) => filtrer({ title: s.titre }).decision !== 'CANDIDATE');
await consigner(filtres, 'ecarte', (r) => 'filtre : ' + filtrer({ title: r.titre }).rejection_reason);
const candidatsNeufs = neufs.filter((s) => filtrer({ title: s.titre }).decision === 'CANDIDATE');

// signaux déjà vus et en attente de recoupement : réexaminés tant qu'ils n'ont pas expiré
const attente = DRY && !wm ? [] : await sql`select cle, titre, media, published::text published, first_seen, urls from discovery_signaux where statut = 'attente' order by first_seen`;
const expires = attente.filter((r) => Date.now() - Date.parse(r.first_seen) > ATTENTE_JOURS * 864e5);
if (!DRY && expires.length) await sql`update discovery_signaux set statut = 'expire', last_checked = now() where cle = any(${expires.map((r) => r.cle)})`;
const aReexaminer = attente.filter((r) => !expires.includes(r)).filter((r) => !candidatsNeufs.some((c) => c.cle === r.cle));

// --- 4. grappes : une histoire = une qualification ------------------------------
const file = [...candidatsNeufs, ...aReexaminer.map((r) => ({ ...r, urls: r.urls || [], requalif: true }))];
const grappes = [];
for (const s of file) {
  const t = mots(s.titre);
  const gr = grappes.find((x) => jaccard(x.t, t) >= 0.5);
  if (gr) gr.membres.push(s); else grappes.push({ t, rep: s, membres: [s] });
}
// Les URL directes de tous les membres servent à la qualification de l'histoire.
for (const gr of grappes) gr.rep = { ...gr.rep, urls: gr.membres.flatMap((m) => m.urls || []) };

// --- 5. qualification -------------------------------------------------------------
// Les affaires écartées ET anonymes (« École non nommée, XIIIe arrondissement ») ne servent à rien au rapprochement : leur commune
// seule fabrique de faux « rapprochements partiels » avec tout article parisien. Les écartées NOMMÉES restent : c'est la mémoire des rejets.
const anonymesEcartees = new Set((await sql`select case_id from cases where publication_status = 'retirée' and etablissement ~* 'non nomm'`).map((r) => r.case_id));
const index = (await construireIndex(sql, {})).filter((f) => !anonymesEcartees.has(f.case_id));
const cache = new Map();
const cp = { grappes: grappes.length, evalues: 0, propose_new: 0, propose_review: 0, propose_attach: 0, attente: 0, ecartes: 0, incidents: 0, reportes: 0, dejaPropose: 0, geo_ecartes: 0, cout: 0 };
const aEnvoyer = [];

for (const g of grappes) {
  const s = g.rep;
  if (cp.evalues >= MAX) { cp.reportes++; continue; }
  // Titre qui nomme déjà une affaire suivie (publiée, en réexamen) ou écartée : inutile de dépenser un appel.
  const pre = resoudre({ candidate: { title: s.titre }, index, corps: s.titre });
  if (pre.resolution_status === 'MATCH') {
    const [k] = await sql`select c.publication_status::text p, exists (select 1 from reviews r where r.case_id = c.case_id and r.next_review_at is not null and r.decision <> 'retirer') re from cases c where c.case_id = ${pre.matched_case_id}`;
    if (k && (k.p === 'publiée' || k.p === 'retirée' || k.re)) {
      await consigner(g.membres.filter((m) => !m.requalif), 'ecarte', () => 'connu au titre');
      cp.ecartes++; continue;
    }
  }
  cp.evalues++;
  const r = await evaluer({ sql, index, signal: s, modele: MODELE, cache });
  cp.cout += Number(r.cout?.cout_usd) || 0;
  if (r.proposition?.payload?.rapprochement_ecarte) cp.geo_ecartes++; // rapprochement contredit par la géographie du signal (garde-fou)
  v(`  [${r.statut}] ${s.titre.slice(0, 90)} — ${r.motif}` + (r.proposition ? ` | ${r.proposition.payload.commune} · ${r.proposition.payload.etablissement || '?'} · matches: ${(r.proposition.payload.possible_matches_sny || []).map((m) => m.case_id).join(',') || r.proposition.attach_case_id || '-'} | ${r.proposition.payload.avertissement || ''}` : ''));
  if (r.statut === null) { cp.incidents++; continue; } // non consigné : repris au prochain run
  let statut = r.statut, motif = r.motif, proposalId = null;
  if (statut === 'propose') {
    const p = r.proposition;
    if (DRY) { cp['propose_' + (p.recommendation === 'ATTACH_EXISTING' ? 'attach' : p.recommendation === 'REVIEW' ? 'review' : 'new')]++; aEnvoyer.push(p); }
    else {
      const ins = await sql`insert into new_case_proposals (dedup_key, recommendation, attach_case_id, payload)
                            values (${p.dedup_key}, ${p.recommendation}, ${p.attach_case_id}, ${JSON.stringify(p.payload)}::jsonb)
                            on conflict (dedup_key) do nothing returning proposal_id::text pid`;
      if (ins.length) { proposalId = ins[0].pid; cp['propose_' + (p.recommendation === 'ATTACH_EXISTING' ? 'attach' : p.recommendation === 'REVIEW' ? 'review' : 'new')]++; }
      else { statut = 'ecarte'; motif = 'déjà proposé'; cp.dejaPropose++; }
    }
  } else if (statut === 'attente') cp.attente++; else cp.ecartes++;
  if (DRY) continue;
  for (const m of g.membres) {
    await sql`insert into discovery_signaux (cle, titre, media, published, statut, motif, proposal_id, urls, last_checked)
              values (${m.cle}, ${m.titre}, ${m.media || null}, ${m.published || null}, ${statut}, ${m === s ? motif : 'même histoire'}, ${m === s ? proposalId : null}, ${JSON.stringify(m.urls || [])}::jsonb, now())
              on conflict (cle) do update set statut = excluded.statut, motif = excluded.motif, proposal_id = coalesce(excluded.proposal_id, discovery_signaux.proposal_id), last_checked = now()`;
  }
}

console.log(`signaux : ${neufs.length} jamais vus (${filtres.length} filtrés, ${candidatsNeufs.length} candidats) · ${aReexaminer.length} en attente réexaminés · ${expires.length} expirés`);
console.log(`qualification : ${cp.grappes} histoires, ${cp.evalues} évaluées (plafond ${MAX}), ${cp.reportes} reportées · propositions : ${cp.propose_new} nouvelle(s), ${cp.propose_review} à revoir, ${cp.propose_attach} rapprochement(s) · ${cp.attente} en attente de recoupement, ${cp.ecartes} écartées, ${cp.dejaPropose} déjà proposées, ${cp.incidents} incident(s), ${cp.geo_ecartes} rapprochement(s) écarté(s) (contradiction géographique) · coût modèle ${cp.cout.toFixed(4)} $`);
if (DRY) {
  // Diagnostic privé : le dépôt est public, les logs CI ne montrent que des compteurs. Avec SNY_DIAG_NEON=1, les propositions
  // qu'un run à blanc AURAIT faites sont déposées dans `discovery_dryrun` (jamais lue par un autre script) pour relecture locale.
  if (process.env.SNY_DIAG_NEON === '1') {
    for (const p of aEnvoyer) await sql`insert into discovery_dryrun (recommendation, payload) values (${p.recommendation}, ${JSON.stringify(p.payload)}::jsonb)`;
  }
  console.log(`à blanc : rien écrit, rien envoyé. ${aEnvoyer.length} message(s) seraient proposés.`);
  for (const p of aEnvoyer) v('\n' + messageDecision(p.payload, p.recommendation).replace(/<\/?b>/g, '') + '\n');
}
process.exit(0);
