#!/usr/bin/env node
// =====================================================================
// scripts/essai-rendu-instagram.mjs — ESSAI TECHNIQUE du chemin du visuel Instagram, sans contenu éditorial et SANS AUCUN POST.
//
//   node scripts/essai-rendu-instagram.mjs               rend une carte d'essai synthétique (aucune affaire, aucun nom, aucun fait) avec le navigateur sans interface local :
//                                                         format 1080×1350, mesure du débordement, empreinte. Aucun réseau.
//   node scripts/essai-rendu-instagram.mjs --heberger    en plus : dépose cette carte sur la branche `instagram-media` (jeton GITHUB_TOKEN) puis la RELIT à son adresse publique
//                                                         comme le fera Buffer (HTTPS direct, HTTP 200, image/png, 1080×1350, mêmes octets). Ne touche ni Buffer, ni Telegram, ni la base.
//   node scripts/essai-rendu-instagram.mjs --debordement  prouve qu'un texte trop long est REFUSÉ (jamais coupé).
//
// Sert à prouver, sur l'exécuteur réel, les trois dépendances que les tests simulent : navigateur, polices embarquées, hébergement public. Dépôt public ⇒ journaux sans secret.
// =====================================================================
import { writeFileSync } from 'node:fs';
import { htmlVisuel, rendreVisuel, empreinteImage, pngDimensions, SIGNATURE } from './lib/instagram-visuel.mjs';
import { mediaGithub } from './lib/media-github.mjs';
import { controlerImageDistante } from './lib/relais-instagram.mjs';

const A = process.argv.slice(2);
const log = (m) => console.log(m);
const spec = {
  kicker: 'Essai technique du gabarit', commune: 'Commune d’essai', departement: 'Département', etablissement: 'établissement fictif', libelle: 'carte d’essai', qualif: null, couleur: '#457B9D',
  faits: ['Selon une source fictive, ceci est une carte d’essai du gabarit : aucune affaire, aucun fait, aucune personne.'],
  contexte: ['Elle sert uniquement à vérifier le format, les polices et l’hébergement public du visuel.'],
  reserves: ['Carte d’essai : elle ne relaie aucune information.'], sources: ['Source : essai technique, 16 novembre 2026.'], signature: SIGNATURE,
};

if (A.includes('--debordement')) {
  const long = { ...spec, faits: [Array.from({ length: 40 }, () => 'Selon une source fictive, ceci est une phrase d’essai très longue qui ne peut pas tenir.').join(' ')] };
  try { await rendreVisuel({ html: htmlVisuel(long) }); log('❌ un texte trop long a produit une image : le gabarit COUPE ou déborde'); process.exit(1); }
  catch (e) { log(`✅ texte trop long refusé, jamais coupé : ${String(e.message).slice(0, 120)}`); process.exit(0); }
}

const { png, fit } = await rendreVisuel({ html: htmlVisuel(spec) });
const d = pngDimensions(png);
const sha = empreinteImage(png);
log(`✅ rendu : ${d.largeur}×${d.hauteur}, ${png.length} octets, empreinte ${sha.slice(0, 16)}, corps ×${fit.k}, contexte ${fit.contexte ? 'affiché' : 'retiré'}`);
if (process.env.SNY_ESSAI_SORTIE) { writeFileSync(process.env.SNY_ESSAI_SORTIE, png); log(`écrit : ${process.env.SNY_ESSAI_SORTIE}`); }

if (A.includes('--heberger')) {
  const token = (process.env.GITHUB_TOKEN || '').trim(), depot = (process.env.GITHUB_REPOSITORY || '').trim();
  if (!token || !depot) { log('❌ GITHUB_TOKEN / GITHUB_REPOSITORY absents'); process.exit(1); }
  const { url } = await mediaGithub({ token, depot }).publier({ chemin: `ig/essai-technique/${sha.slice(0, 16)}.png`, png });
  log(`✅ déposé sur la branche instagram-media : ${url}`);
  // La branche raw.githubusercontent peut mettre quelques secondes à servir un fichier neuf : quelques essais, puis échec franc.
  let derniere = '';
  for (let i = 1; i <= 6; i++) {
    try {
      const r = await controlerImageDistante({ url, attendu: sha, imageDeps: { lire: async (u) => { const x = await fetch(u, { redirect: 'manual', headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30000) }); return { status: x.status, contentType: x.headers.get('content-type'), png: x.status === 200 ? Buffer.from(await x.arrayBuffer()) : Buffer.alloc(0) }; } } });
      log(`✅ relu à l’adresse publique (essai ${i}) : HTTP 200, image/png, ${r.largeur}×${r.hauteur}, mêmes octets (empreinte ${r.sha256.slice(0, 16)}), URL directe sans redirection`);
      process.exit(0);
    } catch (e) { derniere = e.message; await new Promise((res) => setTimeout(res, 5000)); }
  }
  log(`❌ l’image déposée n’est pas servie comme attendu : ${derniere}`);
  process.exit(1);
}
