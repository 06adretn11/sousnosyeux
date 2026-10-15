#!/usr/bin/env node
// =====================================================================
// scripts/proposer-publication.mjs — prépare la proposition « PUBLIER ? » des candidates EXAMINÉES (AWAITING_GO).
//
//   node scripts/proposer-publication.mjs                     # plan : aucune écriture
//   node scripts/proposer-publication.mjs --ecrire            # crée les propositions (ligne new_case_proposals) — NE LES ENVOIE PAS
//   options : --ids a,b  (proposition EXPLICITE, y compris une candidate de l'arriéré) · --max N (défaut 3)
//
// SÉLECTION. Sans --ids : seulement les candidates dont la validation de création (VALIDATE/CREATE d'Adrien) est POSTÉRIEURE à
// SNY_PUBLICATION_DEPUIS — jamais l'arriéré, jamais d'envoi massif. Avec --ids : le choix explicite de l'éditeur.
// Une proposition par candidate (dedup `publication|<case_id>`) : rejouable sans doublon ; une candidate déjà proposée n'est pas reproposée.
// L'ENVOI reste `telegram-v0.mjs notifier-nouvelles` (existant). Le clic PUBLIER est exécuté par appliquer-nouvelles-affaires → publier-affaire.
// Dépôt public ⇒ en CI, ni nom ni lieu dans les logs.
// =====================================================================
import { connecter } from './lib/neon.mjs';
import { etatPublication, REVUE_VALIDATION, goPublication } from './lib/publication-gates.mjs';
import { geocoderCommune } from './lib/geocoder-commune.mjs';
import { localisationDe, payloadPublication, cleDedup } from './lib/proposition-publication.mjs';
import { messagePublication, boutons } from './lib/discovery-messages.mjs';
import { readFileSync } from 'node:fs';

const A = process.argv.slice(2);
const ID = /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+)$/;
const ECRIRE = A.includes('--ecrire');
const IDS = A.includes('--ids') ? new Set(A[A.indexOf('--ids') + 1].split(',').filter((i) => ID.test(i))) : null;
const MAX = Number(A.includes('--max') ? A[A.indexOf('--max') + 1] : 3);
const CI = !!process.env.CI;
const depuis = process.env.SNY_PUBLICATION_DEPUIS ? new Date(process.env.SNY_PUBLICATION_DEPUIS) : null;
const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));

const { sql } = connecter();
const holds = new Set((lire('data/publication-holds.json').holds || []).map((h) => h.case_id));
const cases = await sql`
  select case_id, etablissement, commune, departement, type_structure::text type_structure, role_mis_en_cause::text role_mis_en_cause,
         statut_judiciaire::text statut_judiciaire, enfants_concernes_public::text enfants_concernes_public, publication_status::text publication_status,
         fiabilite_info_10, crit_source_fiable, crit_article_recent, crit_etablissement_nomme, crit_statut_clair, crit_recoupement,
         lat, lng, geocode_source, commentaire_validation
    from cases where publication_status in ('candidate', 'publiée') order by case_id`;
const revues = await sql`select case_id, reviewed_by, decision::text decision, comment, reviewed_at from reviews order by reviewed_at`;
const sources = await sql`select case_id, url, media, publication_date::text d from sources order by publication_date nulls last`;
const deja = new Set((await sql`select dedup_key from new_case_proposals where dedup_key like 'publication|%'`).map((r) => r.dedup_key));
// GO déjà donné (clic « VALIDER ET PUBLIER », ou GO explicite consigné) : jamais redemandé — la publication est reprise, pas reproposée.
const goDonne = new Set((await sql`select created_case_id from new_case_proposals where decision = 'ACCEPT' and created_case_id is not null and payload ? 'publication_directe'`).map((r) => r.created_case_id));
const par = (rows) => rows.reduce((m, r) => ((m.get(r.case_id) || m.set(r.case_id, []).get(r.case_id)).push(r), m), new Map());
const revuesDe = par(revues), sourcesDe = par(sources);

const retenues = [];
for (const c of cases.filter((x) => x.publication_status === 'candidate')) {
  if (IDS && !IDS.has(c.case_id)) continue;
  const rv = revuesDe.get(c.case_id) || [];
  const examen = etatPublication(c, { revues: rv, sources: sourcesDe.get(c.case_id), holds, autres: cases.filter((o) => o.case_id !== c.case_id), artefact: new Map() });
  if (examen?.etat !== 'AWAITING_GO') { if (IDS) console.log(`· ${c.case_id} non proposable : ${examen ? examen.raisons.join(' ; ') : 'candidate non validée'}`); continue; }
  if (goDonne.has(c.case_id) || goPublication(rv)) { if (IDS) console.log(`· ${c.case_id} : GO déjà donné (reprise de la publication, aucune nouvelle demande)`); continue; }
  if (deja.has(cleDedup(c.case_id))) { if (IDS) console.log(`· ${c.case_id} : déjà proposée (aucun doublon)`); continue; }
  if (!IDS) {
    const val = rv.filter((r) => /^Adrien/.test(r.reviewed_by || '') && r.decision === 'validé' && REVUE_VALIDATION.test(r.comment || '')).pop();
    if (!val || !depuis || new Date(val.reviewed_at) < depuis) continue; // arriéré : jamais proposé sans demande explicite
  }
  retenues.push({ c, examen });
}

const lot = retenues.slice(0, MAX);
let ecrites = 0;
for (const { c, examen } of lot) {
  let geo = null;
  if (c.lat === null || c.lng === null) { try { geo = await geocoderCommune(c.commune, c.departement); } catch { geo = null; } }
  const loc = localisationDe(c, geo);
  // Résumé NEUTRE seulement (création Discovery-auto ou Decision Pack) : un commentaire interne d'outil n'a pas sa place dans un message de décision.
  const resume = (/^(?:\[Discovery-auto:[0-9a-f]{8}\]\s+\w+|VALIDATED)\s+—\s+([\s\S]+)$/.exec(String(c.commentaire_validation || '')) || [])[1]?.trim() || null;
  const payload = payloadPublication({ c, examen, sources: sourcesDe.get(c.case_id) || [], loc, resume });
  console.log(`· ${c.case_id}  ${payload.publication.publiable ? 'PROPOSABLE' : 'non publiable'}  localisation ${loc ? loc.type : 'AUCUNE'}${CI ? '' : ` — ${c.etablissement} (${c.commune})`}`);
  if (!CI && !ECRIRE) {
    console.log('  ' + messagePublication(payload).replace(/<\/?b>/g, '').split('\n').join('\n  '));
    console.log('  boutons : ' + boutons('REVIEW', 'abcdef12', payload).inline_keyboard.flat().map((b) => b.text).join(' | '));
  }
  // Une candidate sans localisation fiable n'est pas proposée : le bouton PUBLIER n'existerait pas, le message ne serait que du bruit.
  if (ECRIRE && payload.publication.publiable) {
    const ins = await sql`insert into new_case_proposals (dedup_key, recommendation, attach_case_id, payload)
                          values (${cleDedup(c.case_id)}, 'REVIEW', null, ${JSON.stringify(payload)}::jsonb)
                          on conflict (dedup_key) do nothing returning proposal_id::text pid`;
    if (ins.length) ecrites++;
  }
}
console.log(`propositions de publication : ${retenues.length} candidate(s) retenue(s), ${lot.length} traitée(s) (plafond ${MAX})${ECRIRE ? `, ${ecrites} créée(s), aucune envoyée` : ' — plan : aucune écriture, aucun envoi'}`);
