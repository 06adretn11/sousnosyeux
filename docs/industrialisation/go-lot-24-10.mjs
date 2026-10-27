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
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { connecter } from '../../scripts/lib/neon.mjs';
import { dossierGeneree, hashDossier, payloadFiche } from '../../scripts/lib/fiche-page.mjs';
import { rattacherSources } from '../../scripts/lib/rattacher-sources.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const liste = (A.find((a) => a.startsWith('--liste=')) ?? '--liste=ids-go-lot.json').slice(8);
const autorisees = JSON.parse(readFileSync(new URL(`./${liste}`, import.meta.url), 'utf8'));
const LOT = autorisees._lot ?? 'publication';
// Date du GO (défaut : 24/10/2026, lot historique) ; `_cartes` : changements de CARTE couverts par le même GO (id → état) ; `_dates_sources` : dates de parution lues sur la page (id → [{url, date}]).
const DATE = autorisees._date ?? '24/10/2026';
const CARTES = autorisees._cartes ?? {}, DATES_SOURCES = autorisees._dates_sources ?? {};
delete autorisees._note; delete autorisees._lot; delete autorisees._date; delete autorisees._cartes; delete autorisees._dates_sources;
const demandes = A.filter((a) => !a.startsWith('--'));
const ids = (demandes.length ? demandes : Object.keys(autorisees)).filter((id) => id !== 'FR-2026-0115'); // Tarnos : approuvée par clic Telegram (af7a64e7)
const ID8 = createHash('sha256').update(LOT === 'publication' ? 'GO-lot-publication-2026-10-24' : `GO-lot-${LOT}`).digest('hex').slice(0, 8);
const PAR = LOT === 'publication' ? `Adrien (GO de lot du ${DATE}, saisi par l’agent — pas un clic Telegram)` : LOT.startsWith('lot-') ? `Adrien (GO de lot du ${DATE} « ${LOT} », saisi par l’agent — pas un clic Telegram)` : `Adrien (GO de correction du ${DATE} « ${LOT} », saisi par l’agent — pas un clic Telegram)`;
const cases = new Map(JSON.parse(readFileSync(new URL('../../data/cases.json', import.meta.url), 'utf8')).cases.map((c) => [c.case_id, c]));
const { sql } = connecter();

for (const id of ids) {
  if (!autorisees[id]) { console.log(`· ${id} : non autorisée par le GO de lot — ignorée`); continue; }
  const g = dossierGeneree(id);
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
