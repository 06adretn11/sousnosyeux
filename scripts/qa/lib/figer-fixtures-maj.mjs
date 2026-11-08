// Outil de développement (pas un test) : fige, à partir de l'historique Git, les aperçus de candidate (rendus publics déposés par sny-maj-fiches) et les dossiers
// approuvés correspondants, pour rejouer le défaut « une relecture efface les acquis » sur de VRAIS cas. Usage : node scripts/qa/lib/figer-fixtures-maj.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const racine = new URL('../../../', import.meta.url);
const DIR = new URL('fixtures/maintenance-sans-perte/', racine);
mkdirSync(DIR, { recursive: true });
const commits = { 'FR-2026-0005': 'c6def5b', 'FR-2026-0002': '543ae6c', 'FR-2026-0001': '25e4e96', 'POC-07': '25e4e96', 'FR-2026-0047': '788f864', 'FR-2026-0113': '788f864', 'FR-2026-0045': 'eaf3c7a', 'FR-2026-0046': 'eaf3c7a' };
const dossiers = {};
for (const f of readdirSync(new URL('data/hub-matiere/', racine)).filter((x) => x.endsWith('.json'))) Object.assign(dossiers, JSON.parse(readFileSync(new URL(`data/hub-matiere/${f}`, racine), 'utf8')).dossiers || {});
for (const [id, c] of Object.entries(commits)) {
  writeFileSync(new URL(`${id}.apercu.md`, DIR), execFileSync('git', ['show', `${c}:docs/industrialisation/fiches-generees/${id}.md`], { encoding: 'utf8', cwd: racine }));
  writeFileSync(new URL(`${id}.approuve.json`, DIR), JSON.stringify(dossiers[id], null, 2) + '\n');
}
console.log(readdirSync(DIR).join('\n'));
