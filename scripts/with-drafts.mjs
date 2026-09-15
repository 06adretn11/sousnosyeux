// =====================================================================
// scripts/with-drafts.mjs
//
// Lance une commande avec SNY_DRAFTS=1, sans dépendance externe
// (cross-env n'est pas installé et n'a pas à l'être pour une variable).
//
// Les brouillons de hub ne sont générés QUE par ce chemin. Le build
// par défaut (`npm run build`, celui utilisé par le déploiement
// Cloudflare) n'en produit aucun.
//
// Usage : node ../scripts/with-drafts.mjs astro build
// =====================================================================

import { spawn } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage : node scripts/with-drafts.mjs <commande> [args…]');
  process.exit(2);
}

console.log('⚠️  SNY_DRAFTS=1 — les brouillons de hub vont être générés.');
console.log('   Ce build est un rendu de REVUE. Ne jamais le déployer.\n');

const child = spawn(cmd, args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SNY_DRAFTS: '1' },
});
child.on('exit', (code) => process.exit(code ?? 1));
