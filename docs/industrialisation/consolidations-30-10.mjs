// =====================================================================
// CONSOLIDATIONS ET CORRECTIONS DE DONNÉES PRÉPARÉES LE 30/10/2026 — À EXÉCUTER SEULEMENT APRÈS LE GO COLLECTIF D'ADRIEN (REVUE_GLOBALE_STOCK_2.md, section F).
//
// Rien n'est supprimé : une source est RÉAFFECTÉE (même ligne, autre affaire), une carte doublon est RETIRÉE (`publication_status` « retirée », même convention
// que PARIS-009 le 29/10/2026), chaque écriture laisse une revue. L'affaire retirée, ses sources, ses résolutions et son historique restent en base ; la
// réconciliation de publication n'en ramène aucune sans nouveau GO. Aucune fusion publique avant le GO.
//
//   node --env-file=.env.local docs/industrialisation/consolidations-30-10.mjs                          # plan (aucune écriture)
//   node --env-file=.env.local docs/industrialisation/consolidations-30-10.mjs --ecrire --go=JJ/MM/AAAA  # après le GO écrit
//
// Suite (hors de ce script) : project-public.mjs --modifier <id> (une affaire à la fois), puis le circuit habituel (QA, PR, vérification en ligne).
// =====================================================================
import { connecter } from '../../scripts/lib/neon.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const GO = (A.find((a) => a.startsWith('--go=')) ?? '').slice(5);
if (ECRIRE && !/^\d{2}\/\d{2}\/\d{4}$/.test(GO)) { console.error('--ecrire exige --go=JJ/MM/AAAA (date du GO collectif écrit)'); process.exit(2); }
const PAR = `Adrien (GO collectif du ${GO || '…'}, saisi par l’agent — pas un clic Telegram)`;
const { sql } = connecter();

// Réaffectations de ligne `sources` (vérifiées : l'article nomme l'école Saint-Dominique de Paris 7e, pas l'Institution de Neuilly).
const SOURCES = [
  { fragment: 'leparisien.fr/faits-divers/dramatique-il-ny-a-pas-dautre-mot', de: 'FR-2026-0022', vers: 'FR-2026-0005',
    motif: 'Le Parisien du 20/05/2026 : l’article porte sur l’école Saint-Dominique du 7e arrondissement de Paris (périscolaire), non sur l’Institution Saint-Dominique de Neuilly-sur-Seine' },
  { fragment: 'msn.com/fr-fr/actualite/france/violences-dans-le-p', de: 'PARIS-001', vers: 'FR-2026-0005',
    motif: 'source unique de PARIS-001, même événement (16 gardes à vue du 20/05/2026 à l’école Saint-Dominique, Paris 7e) : doublon établi de FR-2026-0005' },
];
// Doublons établis (voir REVUE_GLOBALE_STOCK_2.md, section E) : la carte retirée → la carte conservée.
const RETRAITS = [
  { id: 'PARIS-001', garde: 'FR-2026-0005', motif: 'même école maternelle Saint-Dominique (Paris 7e), mêmes faits (suspensions de janvier 2026, 16 gardes à vue du 20/05/2026, mises en examen du 22/05) : deux cartes pour une affaire' },
  { id: 'PARIS-008', garde: 'FR-2026-0008', motif: 'même école Boulard (Paris 14e), mêmes trois animateurs suspendus depuis la mi-février 2026, même article (Le Parisien, 11/03/2026) déjà source de FR-2026-0008' },
  { id: 'PARIS-010', garde: 'FR-2026-0003', motif: 'même école des Grands-Champs (Paris 20e), même compagnon d’une institutrice, même plainte du 30/09/2025, même condamnation du 16/10/2026 ; source (Le Parisien, 20/03/2026) déjà source de FR-2026-0003' },
];

for (const s of SOURCES) {
  const [l] = await sql`select source_id, case_id from sources where url like ${'%' + s.fragment + '%'} and case_id in (${s.de}, ${s.vers}) limit 1`;
  if (!l) { console.log(`· source ${s.fragment.slice(0, 40)}… : introuvable`); continue; }
  if (l.case_id === s.vers) { console.log(`· source ${s.fragment.slice(0, 40)}… : déjà sous ${s.vers}`); continue; }
  console.log(`· source ${s.fragment.slice(0, 40)}… : ${s.de} → ${s.vers}${ECRIRE ? '' : ' (à écrire)'}`);
  if (!ECRIRE) continue;
  await sql`update sources set case_id = ${s.vers} where source_id = ${l.source_id}`;
  for (const id of [s.de, s.vers]) await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${id}, ${PAR}, 'validé', ${`[Source déplacée ${GO}] ${s.de} → ${s.vers} : ${s.motif}. La ligne est conservée (réaffectée), rien n’est supprimé.`})`;
  console.log('  ✅ réaffectée');
}
for (const r of RETRAITS) {
  const [c] = await sql`select publication_status::text ps from cases where case_id = ${r.id}`;
  const [k] = await sql`select publication_status::text ps from cases where case_id = ${r.garde}`;
  if (c?.ps !== 'publiée') { console.log(`· ${r.id} : déjà non publique (${c?.ps})`); continue; }
  if (k?.ps !== 'publiée') { console.log(`· ${r.id} : REFUS — la carte conservée ${r.garde} n’est pas publique`); continue; }
  console.log(`· ${r.id} : retrait public, carte conservée ${r.garde}${ECRIRE ? '' : ' (à écrire)'}`);
  if (!ECRIRE) continue;
  await sql`update cases set publication_status = 'retirée', updated_at = now() where case_id = ${r.id}`;
  await sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${r.id}, ${PAR}, 'retirer', ${`[Consolidation ${GO}] doublon établi de ${r.garde} : ${r.motif}. Affaire, sources et historique conservés pour la traçabilité ; carte conservée : ${r.garde}.`})`;
  console.log('  ✅ retirée (à projeter : project-public.mjs --modifier ne s’applique pas à un retrait — voir le circuit de retrait du 29/10/2026)');
}
process.exit(0);
