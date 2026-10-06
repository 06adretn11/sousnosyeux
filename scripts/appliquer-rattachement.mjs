#!/usr/bin/env node
// =====================================================================
// scripts/appliquer-rattachement.mjs — ATTACH décidé hors Telegram (fichier daté et relisible).
//
//   node scripts/appliquer-rattachement.mjs data/rattachements/<fichier>.json            # plan (aucune écriture)
//   node scripts/appliquer-rattachement.mjs data/rattachements/<fichier>.json --ecrire   # applique
//
// Même fonction que le clic ATTACH de Discovery (lib/rattacher-sources.mjs) : sources ajoutées, correction de date
// éventuelle, rapprochement consigné dans `reviews`. Aucun changement d'état, d'établissement ni de publication.
// =====================================================================
import { readFileSync } from 'node:fs';
import { connecter } from './lib/neon.mjs';
import { rattacherSources } from './lib/rattacher-sources.mjs';

const fichier = process.argv[2];
if (!fichier || fichier.startsWith('--')) { console.error('usage : appliquer-rattachement.mjs <fichier.json> [--ecrire]'); process.exit(1); }
const d = JSON.parse(readFileSync(fichier, 'utf8'));
const ecrire = process.argv.includes('--ecrire');
const { sql } = connecter();
const o = await rattacherSources(sql, { case_id: d.case_id, sources: d.sources, par: d.par, balise: d.balise, commentaire: d.commentaire, corrections: d.corrections || [], ecrire });
if (o.deja) console.log(`${d.case_id} : déjà rattaché (${d.balise}) — rien écrit`);
else console.log(`${d.case_id} : ${ecrire ? 'appliqué' : 'PLAN'} — ${o.ajoutees} source(s) ajoutée(s), ${o.corrigees} date(s) corrigée(s)`);
process.exit(0);
