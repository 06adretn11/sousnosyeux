// =====================================================================
// DATES DE PARUTION DES DEUX SOURCES PRIMAIRES SANS DATE (POC-02, POC-09) — clôture du lot du 01/11/2026.
//
// GO d'Adrien (02/11/2026) : « réutilise les références déjà vérifiées si elles correspondent exactement à ces sources ».
// Chaque date ci-dessous est la DATE DE PARUTION de l'article (métadonnée `datePublished` de la page, relue le 02/11/2026) ET celle déjà
// consignée dans une référence vérifiée du dépôt (même URL) — jamais une date d'événement :
//   POC-02  Ouest-France  2026-03-30  (journal docs/industrialisation/journaux-correction-01-11/POC-02.md ; dossier final : publie_le)
//   POC-09  France 3      2026-05-22  (Hub Paris 11e, première réponse publique : publie_le, même URL)
// Même circuit que les autres corrections de date de source : lib/rattacher-sources (corrections, revue balisée, idempotent).
//
//   node --use-system-ca --env-file=.env.local docs/industrialisation/dates-sources-02-11.mjs            # plan
//   node --use-system-ca --env-file=.env.local docs/industrialisation/dates-sources-02-11.mjs --ecrire
// =====================================================================
import { connecter } from '../../scripts/lib/neon.mjs';
import { rattacherSources } from '../../scripts/lib/rattacher-sources.mjs';

const ECRIRE = process.argv.includes('--ecrire');
const PAR = 'Adrien (GO du 02/11/2026, saisi par l’agent — pas un clic Telegram)';
const LOT = [
  { id: 'POC-02', date: '2026-03-30', url: 'https://www.ouest-france.fr/faits-divers/agression-sexuelle/un-enseignant-de-maternelle-condamne-en-seine-saint-denis-pour-agressions-sexuelles-sur-trois-fillettes-feb57662-2c3a-11f1-9163-025005abf8da' },
  { id: 'POC-09', date: '2026-05-22', url: 'https://france3-regions.franceinfo.fr/paris-ile-de-france/paris/cinq-proces-deja-programmes-dans-l-affaire-du-periscolaire-a-paris-3355093.html' },
];
const { sql } = connecter();
for (const l of LOT) {
  const [s] = await sql`select publication_date::text d, is_primary from sources where case_id = ${l.id} and url = ${l.url}`;
  if (!s) { console.log(`· ${l.id} : REFUS — source introuvable (URL différente de la référence vérifiée)`); continue; }
  if (s.d) { console.log(`· ${l.id} : source déjà datée (${s.d}) — rien à faire`); continue; }
  const o = await rattacherSources(sql, { case_id: l.id, sources: [], par: PAR, balise: `[Date-source ${l.date}]`, ecrire: ECRIRE,
    commentaire: `${l.id} : date de PARUTION ${l.date} inscrite pour la source primaire (métadonnée de la page, identique à la référence déjà vérifiée du dépôt). Ce n’est pas une date d’événement.`,
    corrections: [{ url: l.url, date: l.date }] });
  console.log(`· ${l.id} : ${o.deja ? 'déjà inscrite' : ECRIRE ? `date de parution ${l.date} inscrite` : `plan : date de parution ${l.date} à inscrire`}`);
}
process.exit(0);
