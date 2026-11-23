#!/usr/bin/env node
// =====================================================================
// scripts/garde-quotidien.mjs — « un seul passage productif par jour », malgré un planificateur GitHub qui perd des déclenchements.
//
//   node scripts/garde-quotidien.mjs verifier <nom>   # écrit skip=true|false dans $GITHUB_OUTPUT (et sur stdout)
//   node scripts/garde-quotidien.mjs marquer  <nom>   # consigne que <nom> a tourné aujourd'hui (UTC)
//   node scripts/garde-quotidien.mjs incomplet <nom>  # compte un passage INCOMPLET (reprise plafonnée à 3 par jour : lib/reprise-bornee.mjs)
//
// POURQUOI. Mesuré le 07/10/2026 : GitHub n'a livré que 11 déclenchements `schedule` en 43 h pour ce dépôt (≈ 10 % des créneaux
// demandés), et aucun des créneaux quotidiens uniques de Discovery/Maintenance. Un cron quotidien unique a donc une forte
// chance de ne jamais partir. Les workflows déclarent désormais plusieurs créneaux dans la journée ; ce garde-fou garantit
// qu'un seul d'entre eux fait le travail : les suivants se terminent en quelques secondes, sans rien lire ni écrire d'autre.
//
// Mémoire : discovery_etat (clé `quotidien:<nom>`, valeur = date UTC du dernier passage RÉUSSI). Un passage en échec n'est pas
// marqué : le créneau suivant réessaie. Un workflow_dispatch n'est jamais soumis au garde-fou (decision du workflow).
// Aucun secret, aucun contenu : une clé, une date.
// =====================================================================
import { appendFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { decisionGarde, valeurIncompletsApres, REPRISES_MAX } from './lib/reprise-bornee.mjs';

const [cmd, nom] = process.argv.slice(2);
if (!['verifier', 'marquer', 'incomplet'].includes(cmd) || !/^[a-z-]{3,20}$/.test(nom || '')) {
  console.error('usage : garde-quotidien.mjs verifier|marquer|incomplet <nom>');
  process.exit(2);
}
const cle = `quotidien:${nom}`;
const cleIncomplets = `quotidien:${nom}:incomplets`;
const aujourdhui = new Date().toISOString().slice(0, 10);
const { sql } = connecter();

if (cmd === 'verifier') {
  const [r] = await sql`select valeur from discovery_etat where cle = ${cle}`;
  const [i] = await sql`select valeur from discovery_etat where cle = ${cleIncomplets}`;
  // Fenêtre de travail (UTC) : un relais livré en pleine nuit n'envoie pas de message Telegram à 3 h du matin.
  // Reprise plafonnée (lib/reprise-bornee.mjs) : après REPRISES_MAX passages INCOMPLETS le même jour, les créneaux suivants ne relancent plus la veille contre un service qui ne répond pas.
  const max = process.env.SNY_REPRISES_MAX && /^\d{1,2}$/.test(process.env.SNY_REPRISES_MAX) ? Number(process.env.SNY_REPRISES_MAX) : REPRISES_MAX;
  const d = decisionGarde({ dernierPassage: r?.valeur ?? null, valeurIncomplets: i?.valeur ?? null, jour: aujourdhui, heureUtc: new Date().getUTCHours(), max });
  console.log({ deja_passe: `${nom} : déjà passé aujourd’hui (${aujourdhui}) → ce créneau ne fait rien`,
    hors_fenetre: `${nom} : hors fenêtre de travail (05h–19h UTC) → ce créneau ne fait rien`,
    reprises_epuisees: `${nom} : ${d.incomplets} passage(s) incomplet(s) aujourd’hui (plafond ${max}) → ce créneau ne fait rien, reprise complète demain`,
    travaille: `${nom} : pas encore passé aujourd’hui${d.incomplets ? ` (${d.incomplets} passage(s) incomplet(s), reprise bornée)` : ''} → ce créneau travaille` }[d.raison]);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${d.skip}\n`);
} else if (cmd === 'incomplet') {
  // Un passage INCOMPLET est compté, pas consigné comme fait : le créneau suivant reprend (dans la limite du plafond).
  const [i] = await sql`select valeur from discovery_etat where cle = ${cleIncomplets}`;
  const valeur = valeurIncompletsApres(i?.valeur ?? null, aujourdhui);
  await sql`insert into discovery_etat (cle, valeur) values (${cleIncomplets}, ${valeur})
            on conflict (cle) do update set valeur = excluded.valeur, maj = now()`;
  console.log(`${nom} : passage incomplet du ${aujourdhui} compté (${valeur.split(':')[1]})`);
} else {
  await sql`insert into discovery_etat (cle, valeur) values (${cle}, ${aujourdhui})
            on conflict (cle) do update set valeur = excluded.valeur, maj = now()`;
  // BILAN du passage (--bilan complet|clos_avec_erreurs) : un jour CLOS AVEC ERREURS (échec minoritaire de la veille) n'est pas une veille intégralement réussie. Le bilan est consigné à part
  // (`quotidien:<nom>:bilan` = AAAA-MM-JJ:<bilan>) ; les affaires en erreur (NON_EXAMINE) sont reprises au cycle suivant, qui cherche tout le stock.
  const b = process.argv.includes('--bilan') ? process.argv[process.argv.indexOf('--bilan') + 1] : null;
  const bilan = b && /^(complet|clos_avec_erreurs|inconnu)$/.test(b) ? b : null;
  if (bilan) await sql`insert into discovery_etat (cle, valeur) values (${`quotidien:${nom}:bilan`}, ${`${aujourdhui}:${bilan}`})
                       on conflict (cle) do update set valeur = excluded.valeur, maj = now()`;
  console.log(`${nom} : passage du ${aujourdhui} consigné${bilan === 'clos_avec_erreurs' ? ' — CLOS AVEC ERREURS (ce n’est pas une veille intégralement réussie : les affaires en erreur sont reprises au cycle suivant)' : bilan ? ` — bilan : ${bilan}` : ''}`);
}
process.exit(0);
