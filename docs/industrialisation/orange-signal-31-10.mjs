// =====================================================================
// SIGNAL « ORANGE (VAUCLUSE) » — L'Alsace, franceinfo et France 3 du 02/07/2026 : un enseignant de lycée mis en examen (parquet de Carpentras).
//
// Aucune affaire ni proposition existante (cases du Vaucluse : Avignon, Morières-lès-Avignon ; la mémoire de la Discovery ne remonte qu'au 06/09/2026,
// son scan est une fenêtre glissante : l'article n'y est jamais passé). On soumet donc CE signal, avec ses trois URL, à la qualification EXISTANTE
// (`evaluer`, lib/qualifier-signal.mjs : extraction avec citations littérales, rapprochement géographique, établissement non nommé = réserve).
// Le modèle n'a décidé de rien ; la proposition (NEW_CASE_CANDIDATE) ne crée ni ne publie rien : le message Telegram « VALIDER ET PUBLIER » reste un clic d'Adrien.
//
//   node --env-file=.env.local docs/industrialisation/orange-signal-31-10.mjs            # qualification à blanc (rien n'est écrit)
//   node --env-file=.env.local docs/industrialisation/orange-signal-31-10.mjs --ecrire   # dépose la proposition (envoi : notifier-nouvelles, comme d'habitude)
// =====================================================================
import { connecter } from '../../scripts/lib/neon.mjs';
import { construireIndex } from '../../scripts/lib/resolver.mjs';
import { evaluer } from '../../scripts/lib/qualifier-signal.mjs';
import { messageDecision } from '../../scripts/lib/discovery-messages.mjs';
import { createHash } from 'node:crypto';
import { aplatir } from '../../scripts/lib/capteurs.mjs';

const ECRIRE = process.argv.includes('--ecrire');
const { sql } = connecter();
const signal = {
  titre: 'Vaucluse. Orange : un enseignant mis en examen pour viols et agressions sexuelles sur mineurs', media: 'L\'Alsace', published: '2026-07-02',
  urls: [
    { url: 'https://www.lalsace.fr/faits-divers-justice/2026/07/02/un-enseignant-mis-en-examen-pour-viols-et-agressions-sexuelles-sur-mineurs', media: 'L\'Alsace', published: '2026-07-02' },
    { url: 'https://www.franceinfo.fr/faits-divers/dans-le-vaucluse-un-enseignant-interpelle-et-mis-en-examen-pour-viols-et-agressions-sexuelles-sur-au-moins-sept-personnes-dont-cinq-mineurs_8090678.html', media: 'franceinfo', published: '2026-07-02' },
    { url: 'https://france3-regions.franceinfo.fr/provence-alpes-cote-d-azur/vaucluse/avignon/viols-agressions-sexuelles-enquete-ce-que-l-on-sait-de-la-mise-en-examen-d-un-enseignant-soupconne-de-violences-sexuelles-sur-plusieurs-eleves-3380596.html', media: 'France 3', published: '2026-07-02' },
  ],
};
const anonymes = new Set((await sql`select case_id from cases where publication_status = 'retirée' and etablissement ~* 'non nomm'`).map((r) => r.case_id));
const index = (await construireIndex(sql, {})).filter((f) => !anonymes.has(f.case_id));
const r = await evaluer({ sql, index, signal, modele: 'deepseek/deepseek-v4.1-flash', cache: new Map() });
console.log(`qualification : ${r.statut} · ${r.motif} · coût ${Number(r.cout?.cout_usd || 0).toFixed(5)} $`);
if (r.statut !== 'propose' || !r.proposition) { console.log('aucune proposition à déposer'); process.exit(0); }
const p = r.proposition;
console.log('\n' + messageDecision(p.payload, p.recommendation).replace(/<\/?b>/g, ''));
if (!ECRIRE) process.exit(0);
const ins = await sql`insert into new_case_proposals (dedup_key, recommendation, attach_case_id, payload) values (${p.dedup_key}, ${p.recommendation}, ${p.attach_case_id}, ${JSON.stringify(p.payload)}::jsonb) on conflict (dedup_key) do nothing returning proposal_id::text pid`;
const cle = createHash('sha1').update(aplatir(signal.titre).slice(0, 80)).digest('hex').slice(0, 20); // même clé que discovery-quotidien (cleSignal)
if (!ins.length) { console.log('déjà proposé : rien d’écrit'); process.exit(0); }
await sql`insert into discovery_signaux (cle, titre, media, published, statut, motif, proposal_id, urls, last_checked) values (${cle}, ${signal.titre}, ${signal.media}, ${signal.published}, 'propose', 'signal soumis à la main (orange-signal-31-10)', ${ins[0].pid}::uuid, ${JSON.stringify(signal.urls)}::jsonb, now()) on conflict (cle) do nothing`;
console.log(`✅ proposition ${ins[0].pid.slice(0, 8)} déposée`);
process.exit(0);
