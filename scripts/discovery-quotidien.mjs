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
//             --cles <clé,clé…> : PASSAGE CIBLÉ — ne réexamine que ces signaux (déjà consignés « attente »), sans nouvelle recherche presse
//                                 (reprise après une correction du moteur ; voir scripts/reprendre-rapprochement.mjs)
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
import { evaluer, DECIDEUR_MACHINE, entreeDepuisStock } from './lib/qualifier-signal.mjs';
import { messageDecision } from './lib/discovery-messages.mjs';
import { composerFile } from './lib/discovery-file.mjs';

const A = process.argv.slice(2);
const flag = (n) => A.includes(n);
const arg = (n, d) => (A.includes(n) ? A[A.indexOf(n) + 1] : d);
const DRY = flag('--dry-run');
const BASELINE = flag('--baseline');
const VERBOSE = flag('--verbose') && !process.env.CI;
const LOOKBACK = Number(arg('--lookback', 7));
const MAX = Number(arg('--max', 8));
const MODELE = arg('--moteur', 'deepseek/deepseek-v4.1-flash');
const CLES = arg('--cles', null) ? String(arg('--cles', '')).split(',').filter((x) => /^[0-9a-f]{20}$/.test(x)) : null; // passage ciblé (signaux déjà consignés)
const iso = (d) => d.toISOString().slice(0, 10);
const v = (...x) => { if (VERBOSE) console.log(...x); };

const { sql } = connecter();
const cleSignal = (titre) => createHash('sha1').update(aplatir(titre).slice(0, 80)).digest('hex').slice(0, 20);

// --- schéma : fail closed -------------------------------------------------
const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('discovery_signaux', 'discovery_etat', 'new_case_proposals')`;
if (tables.length < 3) { console.error('migrations 016/017 non appliquées : arrêt'); process.exit(1); }

const [wm] = await sql`select valeur from discovery_etat where cle = 'watermark'`;
if (!wm && !BASELINE && !DRY) { console.error('aucun watermark : lancer --baseline avant le premier run (sinon tout le passé serait notifiable)'); process.exit(1); }

// --- 1. recherche presse ----------------------------------------------------
const after = arg('--apres', iso(new Date(Date.now() - LOOKBACK * 864e5)));
const before = arg('--avant', iso(new Date(Date.now() + 864e5)));
if (CLES && !CLES.length) { console.error('--cles : aucune clé valide (20 caractères hexadécimaux)'); process.exit(1); }
if (CLES && BASELINE) { console.error('--cles est incompatible avec --baseline'); process.exit(1); }
const scanG = CLES ? { items: [], erreurs: [] } : await scannerFenetre({ after, before });
const scanB = CLES || flag('--sans-bing') ? { items: [], erreurs: [] } : await scannerBing({ jours: LOOKBACK });
// Un capteur entièrement en panne n'arrête pas le run tant que l'autre répond ; les deux en panne : arrêt, rien consigné.
if (!CLES && scanG.erreurs.length >= GRILLE.length && (flag("--sans-bing") || scanB.erreurs.length >= GRILLE.length)) { console.error('sources presse indisponibles : arrêt, rien consigné'); process.exit(1); }

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
const attente = DRY && !wm ? [] : CLES
  ? await sql`select cle, titre, media, published::text published, first_seen, last_checked, urls from discovery_signaux where statut = 'attente' and cle = any(${CLES})`
  : await sql`select cle, titre, media, published::text published, first_seen, last_checked, urls from discovery_signaux where statut = 'attente'`;

// --- 4. la file : jamais vus d'abord, puis les « en attente » dans l'ordre de leur DERNIER EXAMEN (lib/discovery-file.mjs, testée) ; grappes ---------
const { expires, aReexaminer, file, grappes } = composerFile({ candidatsNeufs, attente });
if (!DRY && expires.length) await sql`update discovery_signaux set statut = 'expire', last_checked = now() where cle = any(${expires.map((r) => r.cle)})`;

// --- 5. qualification -------------------------------------------------------------
// Les affaires écartées ET anonymes (« École non nommée, XIIIe arrondissement ») ne servent à rien au rapprochement : leur commune
// seule fabrique de faux « rapprochements partiels » avec tout article parisien. Les écartées NOMMÉES restent : c'est la mémoire des rejets.
const anonymesEcartees = new Set((await sql`select case_id from cases where publication_status = 'retirée' and etablissement ~* 'non nomm'`).map((r) => r.case_id));
const index = (await construireIndex(sql, {})).filter((f) => !anonymesEcartees.has(f.case_id));
const cache = new Map();
const cp = { grappes: grappes.length, evalues: 0, propose_new: 0, propose_review: 0, propose_attach: 0, attente: 0, ecartes: 0, incidents: 0, reportes: 0, dejaPropose: 0, fusionnes: 0, remplaces: 0, regroupes: 0, silencieux: 0, geo_ecartes: 0, cout: 0 };
let aEnvoyer = []; // à blanc : propositions qu'on AURAIT faites (une proposition réunie remplace celles de ses signaux déjà comptés)
// Mémoire du passage : chaque analyse est comparée aux précédentes AVANT toute décision (deux articles d'une même affaire arrivés dans le même lot,
// dans un ordre quelconque, deviennent UNE analyse). Elle est AMORCÉE avec l'analyse conservée de chaque dossier encore « en attente » (discovery_etat,
// clé `analyse:<signal>`, écrite par le passage qui l'a qualifié) : un article nouveau qui décrit la même affaire qu'un ancien dossier en attente le
// rejoint même si ce dossier est loin dans la file, sans nouvel appel modèle ; la décision est alors prise sur l'ensemble (lib/qualifier-signal.mjs).
const stocks = (await sql`select e.valeur from discovery_etat e where e.cle like 'analyse:%'
                           and exists (select 1 from discovery_signaux s where s.cle = substr(e.cle, 9) and s.statut = 'attente')`)
  .map((r) => { try { return JSON.parse(r.valeur); } catch { return null; } }).filter((x) => x && x.v === 1 && Array.isArray(x.cles));
const contexte = { analyses: stocks.map(entreeDepuisStock), dry: DRY };
const cleStock = (cles) => 'analyse:' + cles[0];
const oublier = (cles) => (DRY || !cles.length ? null : sql`delete from discovery_etat where cle = any(${cles.map((c) => 'analyse:' + c)})`);

for (const g of grappes) {
  const s = g.rep;
  if (cp.evalues >= MAX) {
    cp.reportes++;
    // Un report s'explique : plafond atteint ; l'ancienneté du dernier examen du plus délaissé est dite (jamais examiné = depuis la première apparition).
    const depuis = (Date.now() - new Date(s.last_checked || s.first_seen || Date.now()).getTime()) / 864e5;
    if (s.requalif) cp.reporteMaxJours = Math.max(cp.reporteMaxJours || 0, depuis);
    continue;
  }
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
  const r = await evaluer({ sql, index, signal: s, modele: MODELE, cache, contexte });
  cp.cout += Number(r.cout?.cout_usd) || 0;
  if (r.regroupes?.length) cp.regroupes++;
  if (r.proposition?.payload?.rapprochement_ecarte) cp.geo_ecartes++; // rapprochement contredit par la géographie du signal (garde-fou)
  v(`  [${r.statut}] ${s.titre.slice(0, 90)} — ${r.motif}` + (r.proposition ? ` | ${r.proposition.payload.commune} · ${r.proposition.payload.etablissement || '?'} · matches: ${(r.proposition.payload.possible_matches_sny || []).map((m) => m.case_id).join(',') || r.proposition.attach_case_id || '-'} | ${r.proposition.payload.avertissement || ''}` : ''));
  if (r.statut === null) {
    // Incident technique (modèle, réseau) : repris plus tard, mais son EXAMEN est consigné — sinon il resterait « jamais examiné », donc en tête de file,
    // et consommerait les mêmes appels à chaque passage au détriment des autres dossiers.
    cp.incidents++;
    if (!DRY) await sql`update discovery_signaux set last_checked = now() where cle = any(${g.membres.map((m) => m.cle)}) and statut = 'attente'`;
    continue;
  }
  let statut = r.statut, motif = r.motif, proposalId = null;
  if (statut === 'fusion') {
    // Même affaire qu'une proposition ouverte : on l'enrichit (jamais une seconde proposition). La mise à jour est gardée par la
    // décision : si un humain a cliqué entre-temps, rien n'est écrasé et le signal est repris au prochain run.
    if (DRY) { cp.fusionnes++; statut = 'propose'; }
    else {
      // Jamais en place sur une proposition déjà ENVOYÉE : son bouton agirait sur un contenu que l'éditeur n'a pas vu (le moteur choisit « remplacer » dans ce cas).
      const maj = await sql`update new_case_proposals set payload = ${JSON.stringify(r.fusion.payload)}::jsonb
                             where proposal_id = ${r.fusion.proposal_id}::uuid and applied_at is null and (decision is null or decision = 'REVIEW_REQUIRED')
                               and not exists (select 1 from telegram_envois t where t.cle = proposal_id::text)
                             returning proposal_id::text pid`;
      if (maj.length) { cp.fusionnes++; statut = 'propose'; proposalId = maj[0].pid; motif = `fusionné dans ${maj[0].pid.slice(0, 8)}`; }
      else { statut = 'attente'; motif = 'proposition jumelle envoyée ou décidée entre-temps : repris au prochain run'; cp.attente++; }
    }
  } else if (statut === 'remplace') {
    // Une proposition déjà ENVOYÉE reçoit un fait nouveau matériel : UNE nouvelle version (nouveau message, nouvelle clé) ; l'ancienne reçoit une décision MACHINE
    // (son bouton répond « déjà décidée », rien n'est approuvé ni rejeté à la place de l'éditeur) et sa clé de déduplication est libérée.
    const rp = r.remplace;
    if (DRY) { cp.remplaces++; statut = 'propose'; aEnvoyer.push({ recommendation: rp.recommendation, payload: rp.payload, cles: s.cle }); }
    else {
      const [existe] = await sql`select 1 x from new_case_proposals where dedup_key = ${rp.dedup_key}`;
      if (existe) { statut = 'attente'; motif = 'version consolidée déjà présente : repris au prochain run'; cp.attente++; }
      else {
        const [o] = await sql`
          with ancienne as (
            update new_case_proposals set decision = 'REJECT'::proposal_decision, decided_by = ${DECIDEUR_MACHINE}, decided_at = now(), applied_at = now(),
                   decision_comment = ${'SUPERSEDED — remplacée par une version consolidée (' + String(r.motif).slice(0, 200) + ') ; ce bouton est inerte'},
                   dedup_key = dedup_key || ${'#remplacee-' + rp.proposal_id.slice(0, 8)}
             where proposal_id = ${rp.proposal_id}::uuid and decision is null and applied_at is null
               and exists (select 1 from telegram_envois t where t.cle = proposal_id::text)
            returning proposal_id),
          nouvelle as (
            insert into new_case_proposals (dedup_key, recommendation, attach_case_id, payload)
            select ${rp.dedup_key}, ${rp.recommendation}, ${rp.attach_case_id}, ${JSON.stringify(rp.payload)}::jsonb where exists (select 1 from ancienne)
            returning proposal_id::text pid)
          select (select count(*)::int from ancienne) anc, (select pid from nouvelle) pid`;
        if (o?.pid) { cp.remplaces++; statut = 'propose'; proposalId = o.pid; motif = `nouvelle version ${o.pid.slice(0, 8)} (remplace ${rp.proposal_id.slice(0, 8)})`; }
        else { statut = 'attente'; motif = 'proposition jumelle décidée entre-temps : repris au prochain run'; cp.attente++; }
      }
    }
  } else if (statut === 'propose') {
    const p = r.proposition;
    if (DRY) { cp['propose_' + (p.recommendation === 'ATTACH_EXISTING' ? 'attach' : p.recommendation === 'REVIEW' ? 'review' : 'new')]++; aEnvoyer = aEnvoyer.filter((x) => !(r.regroupes || []).includes(x.cles)); aEnvoyer.push({ ...p, cles: s.cle }); }
    else {
      const ins = await sql`insert into new_case_proposals (dedup_key, recommendation, attach_case_id, payload)
                            values (${p.dedup_key}, ${p.recommendation}, ${p.attach_case_id}, ${JSON.stringify(p.payload)}::jsonb)
                            on conflict (dedup_key) do nothing returning proposal_id::text pid`;
      if (ins.length) { proposalId = ins[0].pid; cp['propose_' + (p.recommendation === 'ATTACH_EXISTING' ? 'attach' : p.recommendation === 'REVIEW' ? 'review' : 'new')]++; }
      else { statut = 'ecarte'; motif = 'déjà proposé'; cp.dejaPropose++; }
    }
  } else if (statut === 'attente') cp.attente++;
  else { cp.ecartes++; if (r.proposition_jumelle) cp.silencieux++; }
  if (DRY) continue;
  if (r.proposition_jumelle && !proposalId) proposalId = r.proposition_jumelle; // « même affaire que cette proposition » : le lien est consigné, aucune autre trace
  for (const m of g.membres) {
    await sql`insert into discovery_signaux (cle, titre, media, published, statut, motif, proposal_id, urls, last_checked)
              values (${m.cle}, ${m.titre}, ${m.media || null}, ${m.published || null}, ${statut}, ${m.cle === s.cle ? motif : 'même histoire'}, ${m.cle === s.cle ? proposalId : null}, ${JSON.stringify(m.urls || [])}::jsonb, now())
              on conflict (cle) do update set statut = excluded.statut, motif = excluded.motif, proposal_id = coalesce(excluded.proposal_id, discovery_signaux.proposal_id), last_checked = now()`;
  }
  // Signaux déjà évalués dans ce passage et réunis à celui-ci : même issue (une seule candidate), même proposition.
  if (r.regroupes?.length) {
    await sql`update discovery_signaux set statut = ${statut}, motif = 'même histoire', proposal_id = coalesce(${proposalId}::uuid, proposal_id), last_checked = now() where cle = any(${r.regroupes})`;
  }
  // Mémoire d'analyse des dossiers en attente : conservée tant que le dossier attend ; effacée dès qu'il a une autre issue.
  if (statut === 'attente' && r.analyse) {
    await sql`insert into discovery_etat (cle, valeur) values (${cleStock(r.analyse.cles)}, ${JSON.stringify(r.analyse)}) on conflict (cle) do update set valeur = excluded.valeur, maj = now()`;
  } else await oublier([...new Set([s.cle, ...g.membres.map((m) => m.cle), ...(r.regroupes || [])])]);
}

console.log(`signaux : ${neufs.length} jamais vus (${filtres.length} filtrés, ${candidatsNeufs.length} candidats) · ${aReexaminer.length} en attente réexaminés · ${expires.length} expirés`);
console.log(`qualification : ${cp.grappes} histoires, ${cp.evalues} évaluées (plafond ${MAX}), ${cp.reportes} reportées${cp.reporteMaxJours ? ` (le plus délaissé : sans examen depuis ${cp.reporteMaxJours.toFixed(1)} j ; file par ancienneté du dernier examen)` : ''}, ${stocks.length} dossier(s) en attente avec analyse conservée au départ · propositions : ${cp.propose_new} nouvelle(s), ${cp.propose_review} à revoir, ${cp.propose_attach} rapprochement(s) · ${cp.fusionnes} fusionnée(s) dans une proposition ouverte, ${cp.remplaces} nouvelle(s) version(s) d'une proposition déjà envoyée, ${cp.silencieux} sans fait nouveau (silence) · ${cp.regroupes} réunie(s) avec un autre signal du passage · ${cp.attente} en attente de recoupement, ${cp.ecartes} écartées, ${cp.dejaPropose} déjà proposées, ${cp.incidents} incident(s), ${cp.geo_ecartes} rapprochement(s) écarté(s) (contradiction géographique) · coût modèle ${cp.cout.toFixed(4)} $`);
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
