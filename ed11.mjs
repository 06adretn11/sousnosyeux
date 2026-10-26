import { readFileSync, writeFileSync } from 'node:fs';
const f = 'scripts/lib/discovery-messages.mjs'; let t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sub = (a, b) => { if (!t.includes(a)) throw new Error('ancre ' + a.slice(0, 60)); t = t.replace(a, b); };
sub(`    '<b>Ce qui est nouveau</b>',
    ...neufs.slice(0, 2).map((f) => \`• \${esc(f.libelle_public)}\${f.realisation ? \` (\${esc(f.realisation)})\` : ''}\`),
    neufs.length > 2 ? \`(+\${neufs.length - 2} autre(s) information(s))\` : '',
    '',
    '<b>Qui / quand</b>',
    \`\${esc(f1.acteur_nomme || f1.acteur || 'acteur non précisé')} · \${esc(quand(f1))}\`,
    '',
    '<b>Source</b>',
    \`\${esc(p.media || 'source inconnue')} · \${jj(p.publication_date)}\${lienArticle}\`,
    // Passage probant = une PHRASE du corps (finit par une ponctuation) ; le titre de la page (« … - RFI ») n'est qu'un repère, jamais présenté comme preuve s'il existe mieux.
    \`« \${esc(cut(f1.evidence.find((e) => /[.!?]["»”]?\s*$/.test(String(e))) ?? f1.evidence[0], 240))} »\`,
    '',`, `    '<b>Ce qui est nouveau</b>',
    // Chaque fait avec SON passage probant : une PHRASE du corps (finit par une ponctuation) ; le titre de la page (« … - RFI ») n'est qu'un repère, jamais présenté comme preuve s'il existe mieux.
    ...neufs.slice(0, 2).flatMap((f) => [\`• \${esc(f.libelle_public)}\${f.realisation ? \` (\${esc(f.realisation)})\` : ''}\`,
      \`  « \${esc(cut(f.evidence.find((e) => /[.!?]["»”]?\s*$/.test(String(e))) ?? f.evidence[0], 420))} »\`]),
    neufs.length > 2 ? \`(+\${neufs.length - 2} autre(s) information(s))\` : '',
    '',
    '<b>Qui / quand</b>',
    ...neufs.slice(0, 2).map((f) => \`\${esc(acteurLisible(f.acteur_nomme || f.acteur))} · \${esc(quand(f))}\`),
    '',
    '<b>Source</b>',
    \`\${esc(p.media || 'source inconnue')} · \${jj(p.publication_date)}\${lienArticle}\`,
    '',`);
sub("const jj = (d) =>", "// Les acteurs de l'extraction sont normalisés (sans accent) : rendus lisibles, rien n'est inventé.\nconst LISIBLES = { municipalite: 'Municipalité', mairie: 'Mairie', maire: 'Maire', academie: 'Académie', prefecture: 'Préfecture', prefet: 'Préfet', rectorat: 'Rectorat', 'education nationale': 'Éducation nationale', 'conseil municipal': 'Conseil municipal' };\nconst acteurLisible = (a) => (a ? (LISIBLES[a] ?? a) : 'acteur non précisé');\nconst jj = (d) =>");
writeFileSync(f, t);
console.log('ok');
