// Consolidation Saint-Genès (mandat d'Adrien, 28/11/2026) : FR-2026-0049 (doublon, statut non étayé) → FR-2026-0061 (conservée, candidate).
//   node --env-file=<.env.local> docs/industrialisation/consolidation-saint-genes-28-11.mjs            # plan, aucune écriture
//   node --env-file=<.env.local> docs/industrialisation/consolidation-saint-genes-28-11.mjs --ecrire   # applique (une transaction, puis le rattachement)
// Écart assumé avec scripts/consolider-doublon.mjs : la fiche CONSERVÉE (0061) n'est pas publique, et la source Sud Ouest « directeur agenais » (0049) décrit
// une AUTRE affaire : elle n'est PAS réaffectée (elle reste sous 0049, retirée, pour la traçabilité). Rien n'est supprimé.
import { connecter } from '../../scripts/lib/neon.mjs';
import { rattacherSources } from '../../scripts/lib/rattacher-sources.mjs';

const ECRIRE = process.argv.includes('--ecrire');
const GARDE = 'FR-2026-0061', RETIRE = 'FR-2026-0049';
const LE_MONDE_08_01 = 'https://www.lemonde.fr/societe/article/2026/01/08/accuse-de-pedocriminalite-un-ex-instituteur-d-une-ecole-privee-bordelaise-sera-juge-pour-avoir-viole-17-eleves_6661063_3224.html';
const PAR = 'Agent Claude (consolidation Saint-Genès, mandat d’Adrien du 28/11/2026 — pas un clic Telegram)';
const MOTIF = 'Même établissement (Saint-Genès La Salle, Bordeaux), même enseignant, même procédure (renvoi devant la cour criminelle de la Gironde, procès du 30/11 au 11/12/2026) : la source principale de ' + RETIRE + ' (Le Monde, 08/01/2026) décrit l’affaire de ' + GARDE + '. Le statut « condamnation définitive / images pédocriminelles » de ' + RETIRE + ' n’est étayé par aucune de ses sources et contredit la presse (procès non tenu) ; la source Sud Ouest du directeur d’un établissement agenais concerne une autre affaire et reste sous ' + RETIRE + '.';
const NOUVELLES = [
  { url: 'https://www.charentelibre.fr/societe/justice/jeu-du-gout-36-fillettes-et-quinze-ans-de-faits-presumes-un-ancien-instituteur-juge-pour-18-viols-et-six-agressions-sexuelles-a-bordeaux-31676964.php', media: 'Charente Libre', d: '2026-11-26' },
  { url: 'https://www.rcf.fr/articles/actualite/proces-de-linstituteur-de-saintgenes-a-bordeaux-comprendre-les-enjeux-dune', media: 'RCF', d: '2026-11-23' },
  { url: 'https://www.sudouest.fr/faits-divers/violences-sexuelles-au-sein-de-l-ecole-catholique-saint-genes-a-bordeaux-l-ex-enseignant-suspecte-est-aussi-mis-en-examen-pour-viol-23957471.php', media: 'Sud Ouest', d: '2025-04-09' },
  { url: 'https://www.lefigaro.fr/bordeaux/bordeaux-accuse-de-17-viols-l-ex-enseignant-d-un-etablissement-catholique-renvoye-devant-la-cour-criminelle-20260108', media: 'Le Figaro', d: '2026-01-08' },
  { url: 'https://www.lemonde.fr/societe/article/2026/03/14/a-l-ecole-saint-genes-de-bordeaux-l-instituteur-accuse-de-viols-les-alertes-ignorees-et-les-enfances-ravagees_6671151_3224.html', media: 'Le Monde', d: '2026-03-14' },
];

const { sql } = connecter();
const [g] = await sql`select case_id, commune, publication_status::text ps, statut_judiciaire::text st from cases where case_id = ${GARDE}`;
const [r] = await sql`select case_id, commune, publication_status::text ps, statut_judiciaire::text st from cases where case_id = ${RETIRE}`;
if (!g || !r) { console.error('REFUS : fiche introuvable'); process.exit(1); }
if (g.commune !== r.commune) { console.error('REFUS : communes différentes'); process.exit(1); }
if (g.ps === 'retirée') { console.error(`REFUS : ${GARDE} est retirée`); process.exit(1); }
console.log(`${RETIRE} (${r.ps}, ${r.st}) → ${GARDE} (${g.ps}, ${g.st})${ECRIRE ? '' : ' — PLAN, aucune écriture'}`);

const [dejaFait] = await sql`select 1 x from reviews where case_id = ${RETIRE} and comment like '[Réconciliation %'`;
const [lm] = await sql`select source_id::text id, case_id from sources where url = ${LE_MONDE_08_01}`;
const [reste] = await sql`select source_id::text id, media from sources where case_id = ${RETIRE} and url <> ${LE_MONDE_08_01}`;
console.log(dejaFait ? '  réconciliation déjà consignée' : `  · source Le Monde 08/01 réaffectée à ${GARDE} (secondaire) ; source Sud Ouest ${reste?.media ? '(' + reste.media + ') ' : ''}laissée sous ${RETIRE}`);
console.log(dejaFait ? '' : `  · ${RETIRE} passe « retirée » (jamais publique : sous HOLD), une revue « retirer » consignée`);
const plan = await rattacherSources(sql, { case_id: GARDE, sources: NOUVELLES, par: PAR, balise: '[Rattachement 28/11/2026 — Saint-Genès]', commentaire: 'sources du procès (30/11–11/12/2026) rattachées ; aucun changement d’état, d’établissement ni de publication.', ecrire: false });
console.log(`  · rattachement : ${plan.deja ? 'déjà fait' : plan.ajoutees + ' source(s) à ajouter (hors Le Monde 08/01, déplacé avant)'}`);
if (!ECRIRE) process.exit(0);

if (!dejaFait) {
  if (!lm || lm.case_id !== RETIRE) { console.error('REFUS : source Le Monde 08/01 introuvable sous ' + RETIRE); process.exit(1); }
  await sql.transaction([
    sql`update sources set case_id = ${GARDE}, is_primary = false where source_id = ${lm.id}::uuid`,
    sql`update sources set is_primary = true where source_id = ${reste.id}::uuid and not exists (select 1 from sources where case_id = ${RETIRE} and is_primary)`,
    sql`update cases set publication_status = 'retirée', updated_at = now() where case_id = ${RETIRE} and publication_status <> 'retirée'`,
    sql`insert into reviews (case_id, reviewed_by, decision, comment) values (${RETIRE}, ${PAR}, 'retirer',
      ${`[Réconciliation 2026-11-28] doublon établi de ${GARDE} : ${MOTIF} Affaire, source restante et revues CONSERVÉES pour la traçabilité ; fiche conservée : ${GARDE}.`})`,
  ]);
  console.log(`  ✅ ${RETIRE} retirée, 1 source réaffectée, revue consignée`);
}
const o = await rattacherSources(sql, { case_id: GARDE, sources: NOUVELLES, par: PAR, balise: '[Rattachement 28/11/2026 — Saint-Genès]', commentaire: 'sources du procès (30/11–11/12/2026) rattachées ; aucun changement d’état, d’établissement ni de publication.', ecrire: true });
console.log(o.deja ? '  rattachement déjà fait' : `  ✅ ${o.ajoutees} source(s) rattachée(s) à ${GARDE}`);
process.exit(0);
