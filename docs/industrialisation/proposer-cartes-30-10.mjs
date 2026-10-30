// =====================================================================
// PROPOSITIONS DE CORRECTION DE CARTE du 30/10/2026 — demande explicite d'Adrien (distincte du GO collectif) : FR-2026-0003, FR-2026-0047, FR-2026-0013.
//
// Même circuit que la Maintenance, sans appel de modèle : primitive `etat-affaire` (moteur `rules`) sur l'article lu + citation littérale
// vérifiée dans le corps + `enregistrerProposition` (state_proposals). L'envoi Telegram est le pas suivant (telegram-v0.mjs decision|info <clé>).
// Rien n'est forcé : si la primitive ne qualifie pas le changement (FR-2026-0013 : NO_CHANGE), la ligne est écrite telle quelle (aucun état
// proposé) et part en message d'INFORMATION sans bouton, avec sa limite.
//
//   node --env-file=.env.local docs/industrialisation/proposer-cartes-30-10.mjs            # plan (aucune écriture)
//   node --env-file=.env.local docs/industrialisation/proposer-cartes-30-10.mjs --ecrire
// =====================================================================
import { connecter } from '../../scripts/lib/neon.mjs';
import { etatAffaire, fingerprint } from '../../scripts/lib/etat-affaire.mjs';
import { lireDocument, sansBruit } from '../../scripts/lib/fiche-sources.mjs';
import { assurerArticle, enregistrerProposition } from '../../scripts/lib/persist-etat-affaire.mjs';

const ECRIRE = process.argv.includes('--ecrire');
const { sql } = connecter();

const DEMANDES = [
  { id: 'FR-2026-0003', media: 'Le Parisien', pub: '2026-10-16', etat: 'condamnation non définitive', type: 'condamnation', finality: 'non_definitive',
    url: 'https://www.leparisien.fr/paris-75/paris-75020/paris-le-compagnon-dune-institutrice-condamne-a-trois-ans-de-prison-avec-sursis-pour-des-attouchements-sur-deux-enfants-16-10-2026-M4QK4THCFFAUNMLWVBC44EQ2TI.php',
    citations: ['Durant les trois ans de sursis probatoire auquel il devra s’astreindre, le condamné, qui a 10 jours pour faire appel, devra s’astreindre à une obligation de soins psychologiques et sera interdit de se rendre à l’école ainsi que dans la rue des Grands-Champs.'],
    limite: 'même condamnation que PARIS-010 (même école, mêmes faits) : audit de doublon dans la revue ; appel possible sous 10 jours, issue inconnue.' },
  { id: 'FR-2026-0047', media: 'La Provence', pub: '2026-03-30', etat: 'condamnation non définitive', type: 'condamnation', finality: 'non_definitive',
    url: 'https://www.laprovence.com/article/faits-divers-justice/1673246679031614/le-technicien-soupconne-dagression-sexuelle-sur-une-ecoliere-marseillaise-condamne',
    citations: ['a été condamné par le tribunal correctionnel de Marseille pour agression sexuelle sur mineure , à la peine de 3 ans de détention dont 2 ans assortis d\'un sursis probatoire, la partie ferme d\'un an étant à purger à domicile sous bracelet électronique.'],
    limite: 'jour du jugement non écrit dans l’article ; appel inconnu. L’article nomme l’école maternelle Alexandre-Copello (Marseille 5e), mais la primitive classe le rattachement « douteux » : à confirmer par vous.' },
  { id: 'FR-2026-0013', media: 'Le Parisien', pub: '2023-04-19', etat: 'enquête', type: 'enquete', finality: null,
    url: 'https://www.leparisien.fr/essonne-91/essonne-une-professeure-accusee-dagression-sexuelle-par-un-lyceen-19-04-2023-NRT7AZHJIVHXNMXYS5EVMX4HZ4.php',
    citations: ['Elle s’apprête à être entendue par les enquêteurs d’Athis-Mons, saisis du dossier.'],
    limite: 'ce n’est pas une déclaration du parquet sur l’ouverture d’une enquête (le parquet confirme seulement l’existence de la plainte) ; article de 2023, aucune suite lue ; l’enseignante conteste les faits. La primitive répond NO_CHANGE (article antérieur à l’état courant) : rien n’est forcé, aucun bouton.' },
];

for (const d of DEMANDES) {
  const [c] = await sql`select case_id, etablissement, commune, role_mis_en_cause, statut_judiciaire::text statut_judiciaire, type_affaire::text type_affaire, enfants_concernes_public::text enfants_concernes_public from cases where case_id = ${d.id}`;
  const sources = await sql`select media, publication_date::text publication_date from sources where case_id = ${d.id}`;
  const deja = await sql`select left(proposal_id::text, 8) k, analysis_action a, decision, statut_propose::text s from state_proposals where case_id = ${d.id} and (statut_propose::text = ${d.etat} or analysis_action = 'STATE_CHANGE')`;
  const doc = await lireDocument(d.url, { reessayerEchecs: true });
  const body = sansBruit(doc.corps || '');
  const litterale = d.citations.every((q) => body.replace(/\s+/g, ' ').includes(q.replace(/\s+/g, ' ')));
  const article = { article_id: 'ART-' + fingerprint(d.url).slice(0, 10), media: d.media, publication_date: d.pub, url: d.url, body, content_fingerprint: fingerprint(body) };
  const out = await etatAffaire({ fiche: { ...c, sources }, article, engine: 'rules' });
  console.log(`· ${d.id} : carte « ${c.statut_judiciaire} » · article lu ${doc.ok ? 'oui' : 'NON'} · citation littérale ${litterale ? 'oui' : 'NON'} · primitive : rattachement ${out.rattachement}, ${out.statut_propose ? `→ « ${out.statut_propose} »` : 'NO_CHANGE'} · propositions STATE_CHANGE existantes : ${deja.length ? JSON.stringify(deja) : 'aucune'}`);
  if (!doc.ok || !litterale) { console.log('  REFUS : lecture ou citation non établie'); continue; }
  if (deja.some((x) => x.s === d.etat && x.a === 'STATE_CHANGE')) { console.log('  déjà proposée : aucun doublon'); continue; }
  const facts = [{ event_type: d.type, event_date: null, event_period: null, resulting_state: d.etat, finality: d.finality, appeal: null, evidence: d.citations }];
  if (!ECRIRE) continue;
  await assurerArticle(sql, article);
  const p = await enregistrerProposition(sql, { ...out, article_id: article.article_id, version: out.version, engine: 'rules', analysis_action: 'STATE_CHANGE', facts, note_limite: d.limite, REQUIRES_HUMAN_REVIEW: true });
  console.log(`  ✅ écrite : clé ${String(p.proposal_id).slice(0, 8)}${p.deja_presente ? ' (déjà présente)' : ''}`);
}
process.exit(0);
