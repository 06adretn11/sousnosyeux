// =====================================================================
// GO DE PUBLICATION COLLECTIF DU 24/10/2026 — saisie technique par l'agent d'une décision RÉELLE d'Adrien (pas un clic Telegram).
//
// Adrien a écrit, dans la conversation du 24/10/2026, son GO pour publier les 19 fiches relues restantes (liste et empreintes exactes :
// docs/industrialisation/ids-go-lot.json). Ce script ne décide rien : il transcrit ce GO, pour CHAQUE fiche, avec les mêmes écritures
// que l'approbation Telegram (scripts/appliquer-nouvelles-affaires.mjs) :
//   1. rattachement des sources lues pour la fiche (lib/rattacher-sources, idempotent, balise [Fiche-sources:<id8>]) ;
//   2. une revue « [Fiche approuvée <id8>] <ID> hash=<empreinte> », que lisent promouvoir-fiche et project-evenements.
// <id8> n'est PAS un identifiant de proposition (aucune proposition n'est créée : elle serait réémise par notifier-nouvelles) : c'est
// l'identifiant du GO de lot. L'origine est dite dans `reviewed_by`. Refus si l'empreinte du dossier local diffère de celle autorisée.
//
//   node --env-file=.env.local docs/industrialisation/go-lot-24-10.mjs [ID …]           # plan (aucune écriture)
//   node --env-file=.env.local docs/industrialisation/go-lot-24-10.mjs [ID …] --ecrire
// =====================================================================
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { connecter } from '../../scripts/lib/neon.mjs';
import { dossierGeneree, dossierFiche, hashDossier, payloadFiche } from '../../scripts/lib/fiche-page.mjs';
import { rattacherSources } from '../../scripts/lib/rattacher-sources.mjs';
import { verifierLigneHub } from '../../scripts/lib/hub-application.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const liste = (A.find((a) => a.startsWith('--liste=')) ?? '--liste=ids-go-lot.json').slice(8);
const autorisees = JSON.parse(readFileSync(new URL(`./${liste}`, import.meta.url), 'utf8'));
const LOT = autorisees._lot ?? 'publication';
// Date du GO (défaut : 24/10/2026, lot historique) ; `_cartes` : changements de CARTE couverts par le même GO (id → état) ; `_dates_sources` : dates de parution lues sur la page (id → [{url, date}]).
const DATE = autorisees._date ?? '24/10/2026';
// `_hub_avant` : empreinte attendue du dossier de Hub avant application (lignes de Hub) — LUE ICI avant d'être retirée des lignes : elle sert au contrôle de version ci-dessous.
// `_champs_carte` : corrections de CHAMPS de carte couvertes par le même GO (id → {etablissement | type_structure | role_mis_en_cause : valeur}).
const CARTES = autorisees._cartes ?? {}, DATES_SOURCES = autorisees._dates_sources ?? {}, HUB_AVANT = autorisees._hub_avant ?? {}, CHAMPS_CARTE = autorisees._champs_carte ?? {};
delete autorisees._note; delete autorisees._lot; delete autorisees._date; delete autorisees._cartes; delete autorisees._dates_sources; delete autorisees._cartes_seules; delete autorisees._hub_avant; delete autorisees._champs_carte;
const demandes = A.filter((a) => !a.startsWith('--'));
const ids = (demandes.length ? demandes : Object.keys(autorisees)).filter((id) => id !== 'FR-2026-0115' || autorisees['FR-2026-0115']); // Tarnos : approuvée par clic Telegram (af7a64e7) ; un manifeste qui la porte explicitement (nouvelle empreinte) la couvre
const ID8 = createHash('sha256').update(LOT === 'publication' ? 'GO-lot-publication-2026-10-24' : `GO-lot-${LOT}`).digest('hex').slice(0, 8);
const PAR = LOT === 'publication' ? `Adrien (GO de lot du ${DATE}, saisi par l’agent — pas un clic Telegram)` : LOT.startsWith('lot-') ? `Adrien (GO de lot du ${DATE} « ${LOT} », saisi par l’agent — pas un clic Telegram)` : `Adrien (GO de correction du ${DATE} « ${LOT} », saisi par l’agent — pas un clic Telegram)`;
const cases = new Map(JSON.parse(readFileSync(new URL('../../data/cases.json', import.meta.url), 'utf8')).cases.map((c) => [c.case_id, c]));
const { sql } = connecter();

for (const id of ids) {
  if (!autorisees[id]) { console.log(`· ${id} : non autorisée par le GO de lot — ignorée`); continue; }
  // Affaire dont le dossier VIT DÉJÀ dans un Hub approuvé : la fiche individuelle en reprend la rédaction (aucune génération) ; l'approbation porte l'empreinte de CE dossier,
  // celle que la page lit (lib/fiche.ts dossierDe) et que project-evenements compare. Sinon : dossier produit par le générateur.
  const dansHub = dossierFiche(id);
  let g = dansHub?.hub ? dansHub : dossierGeneree(id);
  // Dossier de Hub corrigé : la version finale est suivie dans docs/industrialisation/dossiers-finaux ; elle est écrite dans le Hub par appliquer-hubs-01-11.mjs (étape distincte, après GO).
  // L'approbation n'est écrite qu'une fois le Hub appliqué : le dossier du Hub doit déjà être l'empreinte autorisée.
  // Contrôle de version (contrat scripts/lib/hub-application.mjs) : le dossier actuel du Hub doit être la version publique attendue (`_hub_avant`) ou déjà la version finale ; sinon la ligne est refusée.
  if (dansHub?.hub && hashDossier(dansHub.d) !== autorisees[id]) { // (dossier du Hub déjà égal à l'empreinte autorisée : approbation du dossier tel quel, circuit historique)
    const chemin = new URL(`./dossiers-finaux/${id}.json`, import.meta.url);
    const v = verifierLigneHub({ finale: existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : null, hubDossier: dansHub.d, hashAutorise: autorisees[id], hashAvant: HUB_AVANT[id] });
    if (v.etat === 'refus') { console.log(`· ${id} : REFUS — ${v.motif}${v.hashHub ? ` (dossier du Hub ${v.hashHub})` : ''}`); continue; }
    // Hub pas encore appliqué (ou ligne exclue/refusée par appliquer-hubs) : on n'approuve JAMAIS une empreinte que la page ne sert pas.
    if (v.etat === 'a_ecrire') { console.log('· '+id+' : REFUS — dossier du Hub non appliqué (exécuter appliquer-hubs-01-11.mjs d’abord ; ligne exclue ou refusée = non approuvée)'); continue; }
  }
  const h = g ? hashDossier(g.d) : null;
  if (h !== autorisees[id]) { console.log(`· ${id} : REFUS — empreinte du dossier local ${h} ≠ autorisée ${autorisees[id]}`); continue; }
  const [k] = await sql`select publication_status::text ps from cases where case_id = ${id}`;
  if (k?.ps !== 'publiée') { console.log(`· ${id} : REFUS — l’affaire n’est pas publique`); continue; }
  const sourcesNeon = (await sql`select url from sources where case_id = ${id}`).map((r) => r.url);
  const p = payloadFiche({ c: cases.get(id), dossier: g, sourcesNeon, nbEvenements: 0, previewBase: null, generation: g.generation });
  const srcs = (p.page.sources_a_rattacher || []).map((s) => ({ url: s.url, media: s.media, d: s.d || null }));
  const [deja] = await sql`select 1 x from reviews where case_id = ${id} and comment like ${'[Fiche approuvée ' + ID8 + ']%'}`;
  console.log(`· ${id} : empreinte ${h} ✓ · ${srcs.length} source(s) à rattacher · ${deja ? 'GO déjà inscrit' : 'GO à inscrire'}${CARTES[id] ? ` · CARTE → « ${CARTES[id]} »` : ''}${(DATES_SOURCES[id] || []).length ? ` · ${DATES_SOURCES[id].length} date(s) de source` : ''}`);
  if (!ECRIRE) continue;
  const o = await rattacherSources(sql, { case_id: id, sources: srcs, par: PAR, balise: `[Fiche-sources:${ID8}]`,
    commentaire: `Sources lues pour la fiche individuelle, rattachées avec le GO de publication collectif du ${DATE}. ${CARTES[id] ? 'Changement de carte couvert par le même GO (trace séparée).' : 'Aucun changement d’état.'}`,
    corrections: DATES_SOURCES[id] || [] });
  if (!deja) await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${id}, ${PAR}, 'validé', ${`[Fiche approuvée ${ID8}] ${id} hash=${h} — GO collectif d'Adrien du ${DATE} (conversation Claude Code), inscrit par l'agent ; aucune décision Telegram`})`;
  // Changement de CARTE couvert par le même GO : même écriture que `etat()` d'appliquer-decisions ; la projection publique (project-public --modifier) est l'étape suivante.
  if (CARTES[id]) {
    const [av] = await sql`select statut_judiciaire::text s from cases where case_id = ${id}`;
    if (av.s !== CARTES[id]) {
      await sql`update cases set statut_judiciaire = ${CARTES[id]}::statut_judiciaire, updated_at = now() where case_id = ${id}`;
      await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${id}, ${PAR}, 'validé', ${`[Carte ${ID8}] ${id} : « ${av.s} » → « ${CARTES[id]} » — GO collectif d'Adrien du ${DATE} : les sources lues n'établissent pas l'état précédent`})`;
      console.log(`  ✅ ${id} : carte « ${av.s} » → « ${CARTES[id]} » (à projeter : project-public.mjs --modifier ${id})`);
    }
  }
  console.log(`  ✅ ${id} : GO inscrit (${o.ajoutees ?? 0} source(s) rattachée(s)${o.deja ? ', déjà rattachées' : ''})`);
}

// CARTES SEULES couvertes par le même GO (aucune fiche : la fiche d'une carte contredite n'est produite qu'après sa correction) : id → état.
// Même écriture que `etat()` d'appliquer-decisions ; la projection (project-public --modifier <id>, une affaire à la fois) est l'étape suivante.
const CARTES_SEULES = JSON.parse(readFileSync(new URL(`./${liste}`, import.meta.url), 'utf8'))._cartes_seules ?? {};
for (const [id, vers] of Object.entries(CARTES_SEULES)) {
  if (demandes.length && !demandes.includes(id)) continue;
  const [av] = await sql`select statut_judiciaire::text s, publication_status::text ps from cases where case_id = ${id}`;
  if (!av || av.ps !== 'publiée') { console.log(`· ${id} : REFUS — l’affaire n’est pas publique`); continue; }
  if (av.s === vers) { console.log(`· ${id} : carte déjà « ${vers} »`); continue; }
  console.log(`· ${id} : CARTE « ${av.s} » → « ${vers} » (carte seule)${ECRIRE ? '' : ' · à écrire'}`);
  if (!ECRIRE) continue;
  await sql`update cases set statut_judiciaire = ${vers}::statut_judiciaire, updated_at = now() where case_id = ${id}`;
  await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${id}, ${PAR}, 'validé', ${`[Carte ${ID8}] ${id} : « ${av.s} » → « ${vers} » — GO collectif d'Adrien du ${DATE} : les sources lues établissent « ${vers} » (voir REVUE_GLOBALE_STOCK_2) ; la fiche viendra après correction de la carte`})`;
  console.log(`  ✅ ${id} : carte « ${av.s} » → « ${vers} » (à projeter : project-public.mjs --modifier ${id})`);
}

// CORRECTIONS DE CHAMPS DE CARTE couvertes par le même GO (en-tête de page contredit par les sources lues) : id → { etablissement | type_structure | role_mis_en_cause : valeur }.
// Même écriture que `etat()` d'appliquer-decisions : UPDATE de la ligne + revue séparée ; la projection (project-public --modifier <id>, une affaire à la fois) est l'étape suivante.
const CHAMPS_AUTORISES = ['etablissement', 'type_structure', 'role_mis_en_cause'];
for (const [id, champs] of Object.entries(CHAMPS_CARTE)) {
  if (demandes.length && !demandes.includes(id)) continue;
  const [av] = await sql`select etablissement, type_structure::text ts, role_mis_en_cause::text r, publication_status::text ps from cases where case_id = ${id}`;
  if (!av || av.ps !== 'publiée') { console.log(`· ${id} : REFUS — l’affaire n’est pas publique`); continue; }
  const inconnus = Object.keys(champs).filter((k) => !CHAMPS_AUTORISES.includes(k));
  if (inconnus.length) { console.log(`· ${id} : REFUS — champ(s) non autorisé(s) : ${inconnus.join(', ')}`); continue; }
  const actuel = { etablissement: av.etablissement, type_structure: av.ts, role_mis_en_cause: av.r };
  const diff = Object.entries(champs).filter(([k, v]) => actuel[k] !== v);
  if (!diff.length) { console.log(`· ${id} : champs de carte déjà à jour`); continue; }
  console.log(`· ${id} : CHAMPS DE CARTE ${diff.map(([k, v]) => `${k} « ${actuel[k]} » → « ${v} »`).join(' ; ')}${ECRIRE ? '' : ' · à écrire'}`);
  if (!ECRIRE) continue;
  for (const [k, v] of diff) {
    if (k === 'etablissement') await sql`update cases set etablissement = ${v}, updated_at = now() where case_id = ${id}`;
    else if (k === 'type_structure') await sql`update cases set type_structure = ${v}::type_structure, updated_at = now() where case_id = ${id}`;
    else await sql`update cases set role_mis_en_cause = ${v}::role_mis_en_cause, updated_at = now() where case_id = ${id}`;
  }
  await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${id}, ${PAR}, 'validé', ${`[Carte ${ID8}] ${id} : ${diff.map(([k, v]) => `${k} « ${actuel[k]} » → « ${v} »`).join(' ; ')} — GO collectif d'Adrien du ${DATE} : en-tête de la page contredit par les sources lues (voir REVUE_GLOBALE_STOCK_2)`})`;
  console.log(`  ✅ ${id} : champs de carte corrigés (à projeter : project-public.mjs --modifier ${id})`);
}
