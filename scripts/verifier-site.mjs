#!/usr/bin/env node
// =====================================================================
// scripts/verifier-site.mjs — le site PUBLIC montre-t-il ce que Neon a validé ? Vérification indépendante + confirmation Telegram.
//
//   node scripts/verifier-site.mjs FR-2026-0004 [FR-2026-0010 …]     (ou --sans-telegram)
//   node scripts/verifier-site.mjs --fiches POC-09,FR-2026-0042      fiches individuelles : page servie, bon dossier, bon nombre d'événements
//
// Lit la page publique (le JSON embarqué `#cases-data`) et compare, pour chaque affaire, l'état judiciaire et le nombre de sources à
// ce que data/cases.json (projection COMMITÉE) annonce. Pour une fiche : GET /affaires/<id>/ doit répondre 200 et porter
// `data-fiche="<id>"` et `data-evenements="<n>"` (n = événements validés de data/evenements.json). Attend le build Cloudflare
// (jusqu'à ~8 min). Succès → Telegram « publié et vérifié » ; délai dépassé → Telegram « projeté mais NON vérifié » et code de sortie 1.
// =====================================================================
import { readFileSync } from 'node:fs';
import { prevenir, texteVerifie } from './lib/prevenir.mjs';
import { ecartsSite } from './lib/ecarts-site.mjs';

const ID = /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+)$/;
const argv = process.argv.slice(2);
const iF = argv.indexOf('--fiches');
const iH = argv.indexOf('--hubs');
const hubs = iH >= 0 ? (argv[iH + 1] || '').split(',').filter((h) => /^[a-z0-9-]+$/.test(h)) : [];
const fiches = iF >= 0 ? (argv[iF + 1] || '').split(',').filter((i) => ID.test(i)) : [];
const ids = argv.filter((a, i) => ID.test(a) && i !== iF + 1 && i !== iH + 1);
const TELEGRAM = !argv.includes('--sans-telegram');
const SITE = process.env.SNY_SITE_URL || 'https://sousnosyeux.org';
if (!ids.length && !fiches.length && !hubs.length) { console.error('rien à vérifier'); process.exit(2); }

const doc = JSON.parse(readFileSync('data/cases.json', 'utf8'));
const attendu = new Map((doc.cases || doc).map((c) => [c.case_id, c]));
const evenements = JSON.parse(readFileSync('data/evenements.json', 'utf8'));

/** Écarts d'une fiche servie : [] = conforme. */
async function ecartsFiche(id) {
  const r = await fetch(`${SITE}/affaires/${id.toLowerCase()}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
  if (!r.ok) return [`fiche ${id} : HTTP ${r.status}`];
  const html = await r.text();
  const n = (evenements.affaires?.[id] || []).length;
  const out = [];
  if (!html.includes(`data-fiche="${id}"`)) out.push(`fiche ${id} : page sans le bon dossier`);
  if (!html.includes(`data-evenements="${n}"`)) out.push(`fiche ${id} : nombre d'événements différent de la projection (${n} attendus)`);
  const m = (evenements.matiere || []).filter((x) => x.destinations?.fiche === id).length;
  if (!html.includes(`data-matiere="${m}"`)) out.push(`fiche ${id} : informations validées différentes de la projection (${m} attendues)`);
  return out;
}

/** Écarts d'un Hub servi : la page porte le bon nombre d'informations validées ET leur libellé (une information projetée est réellement affichée). */
async function ecartsHub(hub) {
  const r = await fetch(`${SITE}/territoires/${hub}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
  if (!r.ok) return [`hub ${hub} : HTTP ${r.status}`];
  const html = await r.text();
  const items = (evenements.matiere || []).filter((x) => (x.destinations?.hubs || []).some((h) => h.hub === hub));
  const out = [];
  if (!html.includes(`data-matiere="${items.length}"`)) out.push(`hub ${hub} : informations validées différentes de la projection (${items.length} attendues)`);
  for (const x of items) if (!html.includes(String(x.libelle).replace(/&/g, '&amp;').slice(0, 40))) out.push(`hub ${hub} : information ${x.id} absente de la page servie`);
  return out;
}

let dernier = ['non tenté'];
const ESSAIS = Number(process.env.SNY_VERIF_ESSAIS || 12);
for (let essai = 1; essai <= ESSAIS; essai++) {
  try {
    dernier = [];
    if (ids.length) {
      const r = await fetch(`${SITE}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
      dernier.push(...(r.ok ? ecartsSite(await r.text(), ids, attendu) : [`HTTP ${r.status}`]));
    }
    for (const f of fiches) dernier.push(...(await ecartsFiche(f)));
    for (const h of hubs) dernier.push(...(await ecartsHub(h)));
  } catch { dernier = ['site injoignable']; }
  console.log(`essai ${essai}/${ESSAIS} : ${dernier.length ? dernier.length + ' écart(s)' : 'conforme'}`);
  if (!dernier.length) break;
  if (essai < ESSAIS) await new Promise((res) => setTimeout(res, 40000));
}
const tout = [...ids, ...fiches.map((f) => `fiche ${f}`), ...hubs.map((h) => `Hub ${h}`)].join(', ');
if (!dernier.length) {
  // Informations validées dont la page servie vient d'être contrôlée (ecartsHub : présentes dans la page) : dites telles qu'elles sont, avec leur portée.
  const infos = (evenements.matiere || []).filter((x) => (x.destinations?.hubs || []).some((h) => hubs.includes(h.hub))).map((x) => ({ libelle: x.libelle, portee: x.portee, territoire: x.territoire }));
  if (TELEGRAM) await prevenir(texteVerifie({ ids, fiches, hubs, site: SITE, infos })); // pages actualisées : URL de chacune
  console.log('site conforme');
  process.exit(0);
}
if (TELEGRAM) await prevenir(`⚠️ <b>Projeté mais NON vérifié sur le site</b> — ${tout}\nÉcart : ${dernier.slice(0, 2).join(' ; ')}. Le build Cloudflare est peut-être en retard : à revérifier.`);
console.error('site non conforme : ' + dernier.join(' ; '));
process.exit(1);
