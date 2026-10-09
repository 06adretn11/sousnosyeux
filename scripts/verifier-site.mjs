#!/usr/bin/env node
// =====================================================================
// scripts/verifier-site.mjs — le site PUBLIC montre-t-il ce que Neon a validé ? Vérification indépendante + confirmation Telegram.
//
//   node scripts/verifier-site.mjs FR-2026-0004 [FR-2026-0010 …]     (ou --sans-telegram)
//
// Lit la page publique (le JSON embarqué `#cases-data`) et compare, pour chaque affaire, l'état judiciaire et le nombre de sources à
// ce que data/cases.json (projection COMMITÉE) annonce. Attend le build Cloudflare (jusqu'à ~8 min). Succès → Telegram « publié et
// vérifié » ; délai dépassé → Telegram « projeté mais NON vérifié » et code de sortie 1 (le job est rouge : c'est visible).
// =====================================================================
import { readFileSync } from 'node:fs';
import { prevenir } from './lib/prevenir.mjs';
import { ecartsSite } from './lib/ecarts-site.mjs';

const ID = /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+)$/;
const ids = process.argv.slice(2).filter((a) => ID.test(a));
const TELEGRAM = !process.argv.includes('--sans-telegram');
const SITE = process.env.SNY_SITE_URL || 'https://sousnosyeux.org';
if (!ids.length) { console.error('aucune affaire à vérifier'); process.exit(2); }

const doc = JSON.parse(readFileSync('data/cases.json', 'utf8'));
const attendu = new Map((doc.cases || doc).map((c) => [c.case_id, c]));

let dernier = ['non tenté'];
const ESSAIS = Number(process.env.SNY_VERIF_ESSAIS || 12);
for (let essai = 1; essai <= ESSAIS; essai++) {
  try {
    const r = await fetch(`${SITE}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    dernier = r.ok ? ecartsSite(await r.text(), ids, attendu) : [`HTTP ${r.status}`];
  } catch { dernier = ['site injoignable']; }
  console.log(`essai ${essai}/${ESSAIS} : ${dernier.length ? dernier.length + ' écart(s)' : 'conforme'}`);
  if (!dernier.length) break;
  if (essai < ESSAIS) await new Promise((res) => setTimeout(res, 40000));
}
if (!dernier.length) {
  if (TELEGRAM) await prevenir(`🌐 <b>Publié et vérifié sur le site</b> — ${ids.join(', ')}\nLe site public affiche l’état validé (${SITE}).`);
  console.log('site conforme');
  process.exit(0);
}
if (TELEGRAM) await prevenir(`⚠️ <b>Projeté mais NON vérifié sur le site</b> — ${ids.join(', ')}\nÉcart : ${dernier.slice(0, 2).join(' ; ')}. Le build Cloudflare est peut-être en retard : à revérifier.`);
console.error('site non conforme : ' + dernier.join(' ; '));
process.exit(1);
