// Génère, SANS réseau ni LLM, la page de relecture des 20 fiches (lots #1 et #2) à partir des rendus Markdown déjà dans le dépôt :
//   docs/industrialisation/RELECTURE_20_FICHES.html  (autonome : aucun serveur, aucune dépendance, tout est dans le fichier)
//   docs/industrialisation/RELECTURE_20_FICHES.md    (index : liens GitHub absolus, qualification, version, empreinte)
// Chaque rendu est vérifié : l'empreinte écrite dans le fichier doit être celle attendue, sinon la génération échoue. Aucun contenu éditorial n'est modifié.
//   node docs/industrialisation/relecture/generer-relecture.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const FG = 'docs/industrialisation/fiches-generees/';
const GH = 'https://github.com/06adretn11/sousnosyeux/blob/main/';

// [lot, id, dossier, version, empreinte attendue, attente]
const FICHES = [
  [1, 'FR-2026-0115', 'v4/', 'v4 corrigée (relue : 884059fe59b45573)', '4af66277ad3e802e', 'à vous : relue ou v4'],
  [1, 'FR-2026-0012', 'v3/', 'nouvelle, « appel annoncé » vérifié (relue validée : c0463bb37a56ab7f)', 'af070d82b0235729', 'confirmer le passage à cette version'],
  [1, 'FR-2026-0046', 'v4/', 'v4 corrigée (relue : d98feaedd130e5f1)', 'e984bd7210939752', 'à relire'],
  [1, 'POC-02', 'v4/', 'v4 corrigée (relue : b1cdf82e22234035)', '850af5e2f4b7b042', 'à relire'],
  [1, 'FR-2026-0025', 'v4/', 'v4 corrigée (relue : 7ac88f870a7076e6)', '4dfa78f7161d3105', 'à relire · correction de la Home à décider'],
  [1, 'FR-2026-0036', 'v4/', 'v4 corrigée (relue : abeb8fff8aa7ac80)', '6b23273bc88028fe', 'à relire · carte « plainte » à arbitrer'],
  [1, 'FR-2026-0027', 'v4/', 'v4 corrigée (relue : 347b5720c337ad99)', '04ca3c7a38e157eb', 'à relire'],
  [1, 'FR-2026-0035', '', 'inchangée', '28fe51908463933f', '⏸ décision éditoriale humaine'],
  [1, 'PARIS-007', '', 'inchangée (rendu rafraîchi)', '707e7612c3019da4', 'à relire · carte « enquête » à arbitrer'],
  [1, 'FR-2026-0124', 'v3/', 'nouvelle (relue : 09abd77d3205ac6d)', '16071cfe70469bad', 'à relire'],
  [2, 'FR-2026-0043', '', 'référence', 'afba7bb178861d20', 'non relue'],
  [2, 'FR-2026-0038', '', 'référence', '161dba70870f535c', 'non relue'],
  [2, 'FR-2026-0139', '', 'référence', '7bea2f3e47af82bf', 'non relue'],
  [2, 'FR-2026-0006', '', 'référence', 'fb80fca964705d6e', 'non relue'],
  [2, 'FR-2026-0028', '', 'référence', 'cc4d35f3858e5324', 'non relue'],
  [2, 'FR-2026-0123', '', 'référence', '75b201bd44522a61', 'non relue'],
  [2, 'FR-2026-0119', '', 'référence', 'a4cd40da505e3220', 'non relue'],
  [2, 'FR-2026-0045', '', 'référence', '94512e13f4f8b9cb', 'non relue'],
  [2, 'FR-2026-0030', '', 'référence', 'e00891c50069b9f0', 'non relue'],
  [2, 'FR-2026-0008', '', 'référence', '3230d301346dcfee', 'non relue'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');

/** Sous-ensemble de Markdown utilisé par les rendus : titres, listes (avec lignes de suite), citations, tableaux, texte. */
function md2html(md) {
  const out = []; const L = md.replace(/\r\n/g, '\n').split('\n'); let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^#{1,3} /.test(l)) { const n = /^#+/.exec(l)[0].length; out.push(`<h${n + 1}>${inline(l.replace(/^#+ /, ''))}</h${n + 1}>`); i++; }
    else if (/^\|/.test(l)) {
      const rows = []; while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split(/\s\|\s/).map((c) => c.replace(/^\s+|\s+$/g, ''));
      out.push('<table>' + rows.filter((r) => !/^\|[-| ]+\|$/.test(r)).map((r, k) => `<tr>${cells(r).map((c) => `<${k ? 'td' : 'th'}>${inline(c)}</${k ? 'td' : 'th'}>`).join('')}</tr>`).join('') + '</table>');
    } else if (/^- /.test(l)) {
      out.push('<ul>');
      while (i < L.length && (/^- /.test(L[i]) || /^ {2,}\S/.test(L[i]))) {
        let item = L[i].replace(/^- /, '').replace(/ {2}$/, ''); i++;
        const suite = [];
        while (i < L.length && /^ {2,}\S/.test(L[i])) { suite.push(L[i].trim().replace(/ {2}$/, '')); i++; }
        out.push('<li>' + inline(item) + suite.map((x) => (/^> /.test(x) ? `<blockquote>${inline(x.slice(2))}</blockquote>` : `<div class="src">${inline(x)}</div>`)).join('') + '</li>');
      }
      out.push('</ul>');
    } else if (/^> /.test(l)) { out.push(`<blockquote>${inline(l.slice(2))}</blockquote>`); i++; }
    else if (l.trim() === '') i++;
    else { out.push(`<p>${inline(l)}</p>`); i++; }
  }
  return out.join('\n');
}

const lire = (rel) => readFileSync(join(RACINE, rel), 'utf8');
const fiches = FICHES.map(([lot, id, dossier, version, empreinte, attente]) => {
  const chemin = `${FG}${dossier}${id}.md`; const md = lire(chemin);
  const h = /Empreinte du dossier[^`]*`([0-9a-f]{16})`/.exec(md)?.[1];
  if (h !== empreinte) throw new Error(`${id} : empreinte du fichier ${h} ≠ attendue ${empreinte}`);
  const q = /\*\*Qualification : ([^*]+)\*\*/.exec(md)?.[1].trim();
  const titre = /^# (.+)$/m.exec(md)[1];
  return { lot, id, chemin, version, empreinte, attente, q, titre, md };
});

// ---- index Markdown (liens GitHub absolus) ----
const ligne = (f) => `| [${f.id}](${GH}${f.chemin}) ${f.titre.split(' — ')[1] ?? ''} | ${f.q} | ${f.version} | \`${f.empreinte}\` | ${f.attente} |`;
const tete = '| Fiche | Qualification | Version | Empreinte | Statut |\n|---|---|---|---|---|';
writeFileSync(join(RACINE, 'docs/industrialisation/RELECTURE_20_FICHES.md'), `# Relecture des 20 fiches — lots #1 et #2

*Index généré à partir des rendus de \`main\`. Lecture intégrale hors dépôt : [RELECTURE_20_FICHES.html](${GH}docs/industrialisation/RELECTURE_20_FICHES.html) (fichier autonome : le télécharger et l'ouvrir dans un navigateur). Rien n'est approuvé, publié ni envoyé ; les empreintes ont été vérifiées contre chaque fichier.*

## Lot #1 (dix fiches relues, versions corrigées)

${tete}
${fiches.filter((f) => f.lot === 1).map(ligne).join('\n')}

## Lot #2 (dix fiches non relues, versions sélectionnées)

${tete}
${fiches.filter((f) => f.lot === 2).map(ligne).join('\n')}
`);

// ---- HTML autonome ----
const nav = (lot) => fiches.filter((f) => f.lot === lot).map((f) => `<a href="#${f.id}">${esc(f.id)}<small>${esc(f.q)}${/décision|confirmer|à vous|arbitrer|décider/.test(f.attente) ? ' · ⚑' : ''}</small></a>`).join('');
const corps = fiches.map((f) => `<section id="${f.id}"><div class="bandeau"><b>Lot #${f.lot}</b> · version : ${esc(f.version)} · empreinte <code>${f.empreinte}</code> · <span class="att">${esc(f.attente)}</span> · <a href="${GH}${f.chemin}" target="_blank" rel="noopener">source GitHub</a></div>${md2html(f.md)}</section>`).join('\n');
writeFileSync(join(RACINE, 'docs/industrialisation/RELECTURE_20_FICHES.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SNY — relecture des 20 fiches</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;color:#1a1a1a;display:flex}nav{position:sticky;top:0;align-self:flex-start;width:230px;height:100vh;overflow:auto;background:#f4f4f2;padding:12px;box-sizing:border-box;flex:none}nav h3{margin:14px 0 4px;font-size:12px;text-transform:uppercase;color:#666}nav a{display:block;padding:4px 6px;color:#222;text-decoration:none;border-radius:4px}nav a:hover{background:#e3e3df}nav small{display:block;color:#777;font-size:11px}main{max-width:900px;padding:16px 28px;flex:1;min-width:0}section{border-bottom:3px solid #ddd;padding-bottom:28px;margin-bottom:28px}.bandeau{background:#fff7e0;border:1px solid #e8d48a;padding:8px 12px;border-radius:6px;font-size:13px}.att{font-weight:600;color:#9a4b00}h2{margin-top:18px}h3{margin:20px 0 6px;border-bottom:1px solid #ddd}table{border-collapse:collapse;font-size:12px;width:100%}td,th{border:1px solid #ccc;padding:3px 6px;vertical-align:top;word-break:break-word}blockquote{margin:4px 0 4px 8px;padding-left:10px;border-left:3px solid #bbb;color:#333}.src{font-size:12px;color:#555}li{margin:6px 0}code{background:#eee;padding:0 3px;border-radius:3px}@media(max-width:800px){body{display:block}nav{position:static;width:auto;height:auto}}</style></head><body>
<nav><h3>Lot #1 (⚑ = décision attendue)</h3>${nav(1)}<h3>Lot #2</h3>${nav(2)}</nav>
<main><h1>Relecture des 20 fiches</h1><p>Rendus intégraux, tels que dans le dépôt, sans modification. Rien n'est approuvé ni publié. Chaque empreinte a été vérifiée contre son fichier.</p>
${corps}</main></body></html>`);
console.log(`✓ ${fiches.length} fiches, empreintes vérifiées`);
