#!/usr/bin/env node
// =====================================================================
// scripts/garde-quotidien.mjs — « un seul passage productif par jour », malgré un planificateur GitHub qui perd des déclenchements.
//
//   node scripts/garde-quotidien.mjs verifier <nom>   # écrit skip=true|false dans $GITHUB_OUTPUT (et sur stdout)
//   node scripts/garde-quotidien.mjs marquer  <nom>   # consigne que <nom> a tourné aujourd'hui (UTC)
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

const [cmd, nom] = process.argv.slice(2);
if (!['verifier', 'marquer'].includes(cmd) || !/^[a-z-]{3,20}$/.test(nom || '')) {
  console.error('usage : garde-quotidien.mjs verifier|marquer <nom>');
  process.exit(2);
}
const cle = `quotidien:${nom}`;
const aujourdhui = new Date().toISOString().slice(0, 10);
const { sql } = connecter();

if (cmd === 'verifier') {
  const [r] = await sql`select valeur from discovery_etat where cle = ${cle}`;
  // Fenêtre de travail (UTC) : un relais livré en pleine nuit n'envoie pas de message Telegram à 3 h du matin.
  const heure = new Date().getUTCHours();
  const dansFenetre = heure >= 5 && heure < 19;
  const skip = r?.valeur === aujourdhui || !dansFenetre;
  console.log(r?.valeur === aujourdhui ? `${nom} : déjà passé aujourd’hui (${aujourdhui}) → ce créneau ne fait rien`
    : !dansFenetre ? `${nom} : hors fenêtre de travail (05h–19h UTC) → ce créneau ne fait rien`
      : `${nom} : pas encore passé aujourd’hui → ce créneau travaille`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${skip}\n`);
} else {
  await sql`insert into discovery_etat (cle, valeur) values (${cle}, ${aujourdhui})
            on conflict (cle) do update set valeur = excluded.valeur, maj = now()`;
  console.log(`${nom} : passage du ${aujourdhui} consigné`);
}
process.exit(0);
