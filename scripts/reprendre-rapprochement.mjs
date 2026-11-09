#!/usr/bin/env node
// =====================================================================
// scripts/reprendre-rapprochement.mjs — REPRISE de l'encours après la correction « signaux réunis avant décision, voisin sans indice positif »
// (09/11/2026).
//
//   node scripts/reprendre-rapprochement.mjs              # PLAN : inventaire seulement (aucune écriture, aucun modèle, aucun envoi)
//   node scripts/reprendre-rapprochement.mjs --ecrire     # remplace les propositions défectueuses et repasse leurs signaux dans le moteur corrigé
//
// MOTIF REPRIS (et lui seul) : proposition de RAPPROCHEMENT encore ouverte (aucune décision, non appliquée) dont l'analyse affichait
// « Pour : aucun indice établi » (aucune raison positive d'identité avec l'affaire historique proposée). Les autres propositions ouvertes
// (mises à jour de fiches, Hubs, publications, nouvelles affaires, rapprochements AVEC indice) ne sont pas touchées. Une décision d'Adrien
// n'est jamais rejouée : une proposition décidée, même identique, reste ce qu'elle est.
//
// Mécanismes existants, rien de nouveau :
//   1. la proposition reçoit une décision MACHINE (« non humain ») : son bouton répond « déjà décidée », rien n'est approuvé ni rejeté à la place
//      de l'éditeur, applied_at est posé (aucune fiche ne sera créée ni retirée) et sa clé de déduplication est libérée ;
//   2. ses signaux repassent « attente » ; le moteur corrigé les réexamine ENSEMBLE (passage ciblé : discovery-quotidien --cles) ;
//   3. les boutons des anciens messages Telegram sont retirés (le message reste lisible) ; UN message d'information explique ce qui est devenu quoi ;
//   4. l'historique est conservé : lignes de proposition, signaux, envois Telegram — rien n'est supprimé. L'affaire historique n'est PAS modifiée.
// Dépôt public ⇒ logs publics : compteurs et identifiants techniques seulement (jamais un titre, un lieu, une URL).
// =====================================================================
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connecter } from './lib/neon.mjs';
import { aplatir } from './lib/capteurs.mjs';
import { domaine } from './lib/preuve-claim.mjs';
import { DECIDEUR_MACHINE } from './lib/qualifier-signal.mjs';
import { prevenirUneFois, esc } from './lib/prevenir.mjs';

const ECRIRE = process.argv.includes('--ecrire');
const { sql } = connecter();
const cleSignal = (titre) => createHash('sha1').update(aplatir(titre).slice(0, 80)).digest('hex').slice(0, 20);

const ouvertes = await sql`
  select proposal_id::text pid, attach_case_id, payload, created_at,
         exists (select 1 from telegram_envois t where t.cle = proposal_id::text) envoye,
         (select message_id from telegram_envois t where t.cle = proposal_id::text and t.kind = 'decision' limit 1) message_id
    from new_case_proposals
   where decision is null and applied_at is null and recommendation = 'REVIEW' and attach_case_id is not null
     and payload ? 'attach' and jsonb_array_length(coalesce(payload->'attach'->'pourquoi', '[]'::jsonb)) = 0
   order by created_at`;
const [total] = await sql`select count(*)::int n from new_case_proposals where decision is null and applied_at is null`;
console.log(`propositions ouvertes : ${total.n} · rapprochement sans aucun indice positif : ${ouvertes.length}${ouvertes.length ? ` (${ouvertes.map((o) => `${o.pid.slice(0, 8)}${o.envoye ? ' envoyée' : ' non envoyée'}`).join(', ')})` : ''}`);
if (!ouvertes.length) { console.log('rien à reprendre'); process.exit(0); }
if (!ECRIRE) { console.log('plan seulement (--ecrire pour appliquer)'); process.exit(0); }

// 1. décision MACHINE, bouton inerte, clé libérée.
const remplacees = [];
for (const o of ouvertes) {
  const r = await sql`
    update new_case_proposals set decision = 'REJECT'::proposal_decision, decided_by = ${DECIDEUR_MACHINE}, decided_at = now(), applied_at = now(),
           decision_comment = ${'SUPERSEDED — rapprochement avec ' + o.attach_case_id + ' sans aucun indice positif (autre localisation, autre établissement) : le signal est réexaminé avec les autres signaux de la même affaire ; ce bouton est inerte'},
           dedup_key = dedup_key || ${'#remplacee-' + o.pid.slice(0, 8)}
     where proposal_id = ${o.pid}::uuid and decision is null and applied_at is null
    returning proposal_id::text pid`;
  if (r.length) remplacees.push(o);
}
console.log(`${remplacees.length} proposition(s) remplacée(s) (décision machine, boutons inertes)`);

// 2. les signaux de ces propositions repassent « attente » (clé = empreinte du titre, comme le runner) puis sont réexaminés ENSEMBLE.
const cles = [...new Set(remplacees.map((o) => cleSignal(o.payload?.signal?.titre || '')).filter((c) => c.length === 20))];
const avant = cles.length ? await sql`select cle, statut, motif, proposal_id::text pid from discovery_signaux where cle = any(${cles})` : [];
const lancerPasse = (liste) => {
  try {
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('./discovery-quotidien.mjs', import.meta.url)), '--cles', liste.join(',')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    console.log(out.split('\n').filter((l) => /^(signaux|qualification|scan)/.test(l)).join('\n'));
  } catch (e) { console.log('passage ciblé en erreur : ' + String(e.stdout || e.stderr || e.message).slice(-300)); }
};
if (cles.length) {
  const m = await sql`update discovery_signaux set statut = 'attente', motif = 'reprise 09/11/2026 : rapprochement non étayé retiré, signal réexaminé', last_checked = now()
                        where cle = any(${cles}) returning cle`;
  console.log(`${m.length} signal(s) repassé(s) en attente`);
  // Le modèle n'est pas déterministe : une extraction dont les citations ne se retrouvent pas dans la page est ÉCARTÉE par le code (garde-fou). Pour une
  // REPRISE (le signal existe déjà et ne doit pas se perdre), l'extraction est rejouée au plus 3 fois ; la matière (pages, preuves vérifiées) reste celle de la presse.
  let restants = cles;
  for (let essai = 1; essai <= 3 && restants.length; essai++) {
    lancerPasse(restants);
    const etat = await sql`select cle, statut from discovery_signaux where cle = any(${cles})`;
    restants = etat.filter((s) => !['attente', 'propose'].includes(s.statut)).map((s) => s.cle);
    if (restants.length && essai < 3) {
      console.log(`${restants.length} signal(s) écarté(s) par le garde-fou d'extraction : nouvel essai (${essai + 1}/3)`);
      await sql`update discovery_signaux set statut = 'attente', last_checked = now() where cle = any(${restants})`;
    }
  }
  if (restants.length) {
    // Issue inutilisable : on RESTAURE (statuts des signaux, décisions machine annulées, clés), rien n'est perdu ; les anciens messages restent actifs.
    for (const a of avant) await sql`update discovery_signaux set statut = ${a.statut}, motif = ${a.motif}, proposal_id = ${a.pid}::uuid where cle = ${a.cle}`;
    for (const o of remplacees) await sql`update new_case_proposals set decision = null, decided_by = null, decided_at = null, applied_at = null, decision_comment = null,
                                              dedup_key = regexp_replace(dedup_key, '#remplacee-[0-9a-f]{8}$', '') where proposal_id = ${o.pid}::uuid and decided_by = ${DECIDEUR_MACHINE}`;
    console.log('reprise ANNULÉE : le moteur n’a pas produit d’issue exploitable pour tous les signaux ; état initial restauré, anciens boutons actifs');
    process.exit(1);
  }
}

// 3. issue réelle, lue en base : une proposition nouvelle (envoyée ensuite par notifier-nouvelles) ou un dossier conservé.
const suite = cles.length ? await sql`select statut, count(*)::int n from discovery_signaux where cle = any(${cles}) group by 1` : [];
const nouvelles = await sql`select left(proposal_id::text, 8) k, recommendation from new_case_proposals where decision is null and created_at > ${remplacees[0].created_at} and not (payload ? 'page') and proposal_id::text <> all(${remplacees.map((o) => o.pid)}) order by created_at`;
console.log(`issue des signaux : ${suite.map((s) => `${s.n} ${s.statut}`).join(', ') || '—'} · nouvelle(s) proposition(s) ouverte(s) depuis : ${nouvelles.length}`);

// 4. boutons des anciens messages retirés (le texte reste), puis UN message d'information.
const jeton = process.env.TELEGRAM_BOT_TOKEN, chat = Number(process.env.TELEGRAM_ALLOWED_USER_ID);
let retires = 0;
if (jeton && Number.isInteger(chat)) {
  for (const o of remplacees.filter((x) => x.message_id)) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${jeton}/editMessageReplyMarkup`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, message_id: Number(o.message_id), reply_markup: { inline_keyboard: [] } }) });
      if ((await r.json()).ok === true) retires++;
    } catch { /* best effort : le bouton reste de toute façon inerte */ }
  }
}
console.log(`${retires} clavier(s) d'anciens messages retiré(s)`);

const p0 = remplacees[0].payload;
const arts = remplacees.flatMap((o) => (o.payload.articles || []));
const urls = new Set(arts.map((a) => a.url));
const editeurs = new Set([...urls].map(domaine));
const attente = suite.find((s) => s.statut === 'attente')?.n || 0;
const etat = nouvelles.length
  ? `une nouvelle proposition consolidée a été préparée (${nouvelles.map((x) => x.k).join(', ')}) : tu la recevras comme un message à part.`
  : attente ? `le dossier est conservé EN ATTENTE DE RECOUPEMENT (${editeurs.size === 1 ? 'un seul éditeur' : `${editeurs.size} éditeurs`}) : dès qu'un second éditeur indépendant publie, il sera proposé automatiquement. Aucune décision n'est demandée.`
    : 'les signaux ont été consignés sans suite (hors périmètre ou sans page lisible).';
const texte = [
  '🔁 <b>DISCOVERY</b> · propositions remplacées',
  `${remplacees.length} proposition(s) envoyée(s) pour <b>${esc(p0.commune)}</b> (${remplacees.map((o) => o.pid.slice(0, 8)).join(', ')}) sont REMPLACÉES : leurs boutons sont inertes.`,
  `Pourquoi : elles proposaient de rapprocher ces articles de ${esc(remplacees[0].attach_case_id)} sans aucun indice positif (autre localisation, autre établissement), et ${urls.size} articles (${editeurs.size} éditeur(s)) décrivaient en fait la même affaire.`,
  `Maintenant : ${etat}`,
  `${esc(remplacees[0].attach_case_id)} n'est pas modifiée ; l'historique des propositions et des signaux est conservé.`,
].join('\n');
const parti = await prevenirUneFois(sql, { cle: `reprise-rapprochement:${remplacees.map((o) => o.pid.slice(0, 8)).sort().join('+')}`, resultat: 'info', texte });
console.log(parti ? 'message d’information envoyé' : 'message d’information non envoyé (déjà envoyé, ou Telegram indisponible)');
process.exit(0);
