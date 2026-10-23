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
  [1,'FR-2026-0115','v4/','v4 corrigée (relue : 884059fe59b45573)','4af66277ad3e802e','à vous : relue ou v4'],
  [1,'FR-2026-0012','v5/','v5 : « appel annoncé » + 3 sources reconnues rattachées (v3 : af070d82b0235729 ; relue validée : c0463bb37a56ab7f)','564a9a72a6a0c45e','confirmer le passage à cette version'],
  [1,'FR-2026-0046','v4/','v4 corrigée (relue : d98feaedd130e5f1)','e984bd7210939752','à relire · titre de la carte à corriger (Chêne-Creux)'],
  [1,'POC-02','v4/','v4 corrigée (relue : b1cdf82e22234035)','850af5e2f4b7b042','à relire'],
  [1,'FR-2026-0025','v5/','v5 recentrée sur Pontoise (arbitrage 24/10 ; v5 précédente : 479e446bac41eca5 ; v4 : 4dfa78f7161d3105 ; relue : 7ac88f870a7076e6)','a328daccc2ffef42','à relire · arbitrage appliqué : l’empreinte reste à approuver · correction de la Home à décider'],
  [1,'FR-2026-0036','v4/','v4 corrigée (relue : abeb8fff8aa7ac80)','6b23273bc88028fe','à relire · une ou deux fiches (Chat Perché / Joyeuse Tribu) à arbitrer'],
  [1,'FR-2026-0027','v4/','v4 corrigée (relue : 347b5720c337ad99)','04ca3c7a38e157eb','à relire'],
  [1,'FR-2026-0035','','inchangée (rendu rafraîchi)','28fe51908463933f','⏸ décision éditoriale · une ou deux fiches à arbitrer'],
  [1,'PARIS-007','','inchangée (rendu rafraîchi)','707e7612c3019da4','à relire · carte « enquête » à arbitrer'],
  [1,'FR-2026-0124','v3/','nouvelle (relue : 09abd77d3205ac6d)','16071cfe70469bad','à relire'],
  [2,'FR-2026-0043','v5/','v5 : sources hors sujet retirées, nature des faits dite (référence : afba7bb178861d20)','bd5806875460e9d8','non relue · périmètre (frontière) à arbitrer'],
  [2,'FR-2026-0038','','référence','161dba70870f535c','non relue'],
  [2,'FR-2026-0139','','référence','7bea2f3e47af82bf','non relue'],
  [2,'FR-2026-0006','','référence','fb80fca964705d6e','non relue'],
  [2,'FR-2026-0028','','référence','cc4d35f3858e5324','non relue'],
  [2,'FR-2026-0123','','référence','75b201bd44522a61','non relue · Saint-Ouen : nouvelle affaire possible'],
  [2,'FR-2026-0119','v5/','v5 : date au mois, source principale nationale (référence : a4cd40da505e3220)','d887a53e930a8f49','non relue'],
  [2,'FR-2026-0045','v5/','v5 : appel « non documenté » (référence : 94512e13f4f8b9cb)','d5181579c9183535','non relue'],
  [2,'FR-2026-0030','v5/','v5 : article hors sujet détaché, BFMTV rattaché (référence : e00891c50069b9f0)','09c7f15cd8d7af1a','non relue'],
  [2,'FR-2026-0008','v5/','v5 : source France Culture (et non Wikipédia) (référence : 3230d301346dcfee)','d613e70a3d0a0212','non relue'],
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

// ---- différences des 7 versions v5 par rapport à la version RELUE (calculées sur les dossiers, pas rédigées) ----
// [id, empreinte relue, décision attendue]
const V5 = [
  ['FR-2026-0043', 'afba7bb178861d20', 'Approuver la v5 (2 sources hors sujet retirées, nature des faits dite d’emblée, appel « non documenté ») — et trancher le périmètre d’Annonay (arbitrage séparé).'],
  ['FR-2026-0030', 'e00891c50069b9f0', 'Approuver le retrait des 3 étapes issues d’un article sur une autre affaire du lycée, et la corroboration par BFMTV.'],
  ['FR-2026-0008', '3230d301346dcfee', 'Approuver la correction de provenance (France Culture, pas Wikipédia). La donnée source se corrige après votre GO (migration 021, préparée).'],
  ['FR-2026-0012', 'c0463bb37a56ab7f', 'Confirmer le passage de la version validée à celle-ci : ajout de « appel annoncé » (et correction de la phrase « aucun article ne dit… »), 3 sources de corroboration. Réserve « fonction identifiante » inchangée.'],
  ['FR-2026-0025', '7ac88f870a7076e6', 'Approuver (ou non) cette empreinte : fiche recentrée sur Pontoise (faits de 2001, mise en examen du 26 janvier 2024, contrôle judiciaire) ; le parcours à Stanislas n’occupe plus le déroulé (une note de contexte attribuée, sans condamnation). Votre arbitrage d’inclusion n’est pas une approbation.'],
  ['FR-2026-0119', 'a4cd40da505e3220', 'Approuver la date de la plainte « vers juin 2026 » (jours divergents 10 / 21 juin) et la source principale nationale.'],
  ['FR-2026-0045', '94512e13f4f8b9cb', 'Approuver « appel / caractère définitif non documentés » (la carte reste « condamnation non définitive » : sujet de Maintenance).'],
];
const jlire = (p) => JSON.parse(readFileSync(join(RACINE, p), 'utf8'));
const cle = (e) => `${e.type}|${e.texte}`;
const ucit = (j) => { const s = new Set(); for (const e of j.dossier.deroule) { s.add(e.source?.media); for (const c of e.sources_complementaires || []) s.add(c.media); } for (const r of j.dossier.reactions || []) s.add(r.source?.media); return [...s].filter(Boolean).sort(); };
const diffs = V5.map(([id, relue, decision]) => {
  const nouv = jlire(`data/fiches-generees/${id}.json`); const ancien = jlire(`data/fiches-generees/versions/${id}.${relue}.json`);
  const f = fiches.find((x) => x.id === id);
  if (nouv.generation.stats.empreinte !== f.empreinte) throw new Error(`${id} : dossier local ${nouv.generation.stats.empreinte} ≠ rendu ${f.empreinte}`);
  const A = ancien.dossier, N = nouv.dossier;
  if (id === 'FR-2026-0008') for (const e of A.deroule) e.texte = e.texte.split('Wikipédia').join('France Culture'); // simple changement d'étiquette : pas une modification de contenu
  const ajouts = N.deroule.filter((e) => !A.deroule.some((x) => cle(x) === cle(e))), retraits = A.deroule.filter((e) => !N.deroule.some((x) => cle(x) === cle(e)));
  const rk = (r) => `${r.acteur}|${r.citations[0].texte}`;
  const rajouts = (N.reactions || []).filter((r) => !(A.reactions || []).some((x) => rk(x) === rk(r))), rretraits = (A.reactions || []).filter((r) => !(N.reactions || []).some((x) => rk(x) === rk(r)));
  const sA = ucit(ancien), sN = ucit(nouv);
  const codes = (j) => j.generation.attention.map((a) => `${a.niveau === 'majeur' ? '⚠ ' : ''}${a.code}`);
  const rA = new Set(codes(ancien)), rN = new Set(codes(nouv));
  const preuves = (nouv.generation.corrections || []).filter((c) => c.preuves?.some((p) => p.citation));
  const reclasses = nouv.generation.sources.filter((x) => x.pertinence === 'HORS_SUJET' && ancien.generation.sources.find((y) => y.url === x.url && y.pertinence !== 'HORS_SUJET'));
  return { id, relue, nouvelle: f.empreinte, decision, f, A, N, ajouts, retraits, rajouts, rretraits, citeesAvant: sA, citeesApres: sN,
    qA: ancien.generation.qualification, qN: nouv.generation.qualification, reservesAjoutees: [...rN].filter((x) => !rA.has(x)), reservesLevees: [...rA].filter((x) => !rN.has(x)),
    reclasses, etatChange: JSON.stringify(A.etat_actuel) !== JSON.stringify(N.etat_actuel) ? N.etat_actuel : null, nCorr: (nouv.generation.corrections || []).length, preuves,
    requalifs: (nouv.generation.corrections || []).filter((c) => !['ajout_etape', 'retrait_etape', 'ajout_reaction', 'retrait_reaction', 'corroboration', 'attention_retiree'].includes(c.operation)),
    corro: (nouv.generation.corrections || []).filter((c) => c.operation === 'corroboration').reduce((m, c) => { const k = c.apres; m[k] = (m[k] || 0) + 1; return m; }, {}) };
});
const tr = (s, n = 260) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const li = (arr, fmt) => (arr.length ? `<ul>${arr.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>` : '<p><i>aucun</i></p>');
const htmlV5 = `<section id="v5"><h2>À valider : 7 versions modifiées (différences par rapport à la version relue)</h2>
<p>Seules les informations qui ont changé sont listées ; le reste de ces fiches est identique à ce que vous avez relu. Les 13 autres fiches n'ont pas changé de contenu. <b>Une approbation antérieure ne vaut jamais pour une nouvelle empreinte.</b></p>
${diffs.map((d) => `<div class="v5"><h3 id="v5-${d.id}">${d.id} — ${esc(d.f.titre.split(' — ')[1] ?? '')}</h3>
<p>Relue <code>${d.relue}</code> → <b>actuelle <code>${d.nouvelle}</code></b> · ${esc(d.qA)} → ${esc(d.qN)} · <a href="#${d.id}">ouvrir la fiche intégrale</a> · <a href="${GH}${d.f.chemin}" target="_blank" rel="noopener">GitHub</a></p>
<h4>Ajouté (${d.ajouts.length} étape(s), ${d.rajouts.length} réaction(s))</h4>${li(d.ajouts, (e) => `<b>${esc(e.type)}</b> — ${esc(tr(e.texte))} <span class="src">(${esc([e.source.media, ...(e.sources_complementaires || []).map((s) => s.media)].join(', '))})</span>`)}${d.rajouts.length ? li(d.rajouts, (r) => `<b>${esc(r.acteur)}</b> — « ${esc(tr(r.citations[0].texte, 160))} »`) : ''}
<h4>Retiré (${d.retraits.length} étape(s), ${d.rretraits.length} réaction(s))</h4>${li(d.retraits, (e) => `<b>${esc(e.type)}</b> — ${esc(tr(e.texte))} <span class="src">(${esc(e.source.media)})</span>`)}${d.rretraits.length ? li(d.rretraits, (r) => `<b>${esc(r.acteur)}</b> — « ${esc(tr(r.citations[0].texte, 160))} »`) : ''}
<h4>Requalifié / réattribué</h4>${li(d.requalifs, (c) => `<b>${esc(c.operation)}</b> — ${esc(tr(c.cible ?? '', 140))}${c.apres ? ` → ${esc(tr(c.apres, 200))}` : ''} <span class="src">— ${esc(tr(c.motif ?? '', 260))}</span>`)}${d.etatChange ? `<p><b>Situation judiciaire modifiée :</b> ${esc(tr(d.etatChange.join(' · '), 500))}</p>` : ''}
<h4>Sources</h4>${d.reclasses.length ? `<p>Reclassées « hors sujet » : ${esc(d.reclasses.map((x) => `${x.media} (${x.publication_date})`).join(' ; '))}</p>` : ''}${Object.keys(d.corro).length ? `<p>Corroborations ajoutées à des étapes existantes : ${esc(Object.entries(d.corro).map(([k, n]) => `${k} sur ${n} étape(s)`).join(' ; '))}</p>` : ''}<p><b>Sources citées</b></p><p>avant : ${esc(d.citeesAvant.join(', ') || '—')} → après : <b>${esc(d.citeesApres.join(', '))}</b></p>
<h4>Réserves</h4><p>ajoutées : ${esc(d.reservesAjoutees.join(', ') || '—')} · levées : ${esc(d.reservesLevees.join(', ') || '—')}</p>
<h4>Preuves (extraits littéraux vérifiés dans l'article)</h4>${li(d.preuves.flatMap((c) => c.preuves.filter((p) => p.citation).map((p) => ({ p, c }))), ({ p }) => `${esc(p.media)} — « ${esc(tr(p.citation ?? '', 220))} » ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">article</a>` : ''}`)}
<p class="att">Décision attendue : ${esc(d.decision)}</p></div>`).join('\n')}</section>`;
const tableV5 = `| Affaire | Ancienne empreinte | Nouvelle empreinte | Modification | Réserve | Décision attendue |\n|---|---|---|---|---|---|\n${diffs.map((d) => `| [${d.id}](${GH}${d.f.chemin}) | \`${d.relue}\` | \`${d.nouvelle}\` | +${d.ajouts.length}/−${d.retraits.length} étapes, +${d.rajouts.length}/−${d.rretraits.length} réactions, ${d.requalifs.length} requalification(s) | ${d.qN}${d.reservesAjoutees.length ? ' · +' + d.reservesAjoutees.join(', ') : ''}${d.reservesLevees.length ? ' · −' + d.reservesLevees.join(', ') : ''} | ${d.decision} |`).join('\n')}`;

// ---- index Markdown (liens GitHub absolus) ----
const ligne = (f) => `| [${f.id}](${GH}${f.chemin}) ${f.titre.split(' — ')[1] ?? ''} | ${f.q} | ${f.version} | \`${f.empreinte}\` | ${f.attente} |`;
const tete = '| Fiche | Qualification | Version | Empreinte | Statut |\n|---|---|---|---|---|';
writeFileSync(join(RACINE, 'docs/industrialisation/RELECTURE_20_FICHES.md'), `# Relecture des 20 fiches — lots #1 et #2

*Index généré à partir des rendus de \`main\`. Lecture intégrale hors dépôt : [RELECTURE_20_FICHES.html](${GH}docs/industrialisation/RELECTURE_20_FICHES.html) (fichier autonome : le télécharger et l'ouvrir dans un navigateur). Rien n'est approuvé, publié ni envoyé ; les empreintes ont été vérifiées contre chaque fichier.*

## À valider : les 7 versions modifiées (différences uniquement)

${tableV5}

Détail des différences, avec preuves : section « À valider » du [fichier HTML](${GH}docs/industrialisation/RELECTURE_20_FICHES.html). Les 13 autres fiches ne changent pas de contenu.

## Lot #1 (dix fiches relues, versions corrigées)

${tete}
${fiches.filter((f) => f.lot === 1).map(ligne).join('\n')}

## Lot #2 (dix fiches non relues, versions sélectionnées)

${tete}
${fiches.filter((f) => f.lot === 2).map(ligne).join('\n')}
`);

// ---- HTML autonome ----
const nav = (lot) => fiches.filter((f) => f.lot === lot).map((f) => `<a href="#${f.id}">${esc(f.id)}<small>${esc(f.q)}${/décision|confirmer|à vous|arbitrer|décider|corriger/.test(f.attente) ? ' · ⚑' : ''}</small></a>`).join('');
const corps = fiches.map((f) => `<section id="${f.id}"><div class="bandeau"><b>Lot #${f.lot}</b> · version : ${esc(f.version)} · empreinte <code>${f.empreinte}</code> · <span class="att">${esc(f.attente)}</span> · <a href="${GH}${f.chemin}" target="_blank" rel="noopener">source GitHub</a></div>${md2html(f.md)}</section>`).join('\n');
writeFileSync(join(RACINE, 'docs/industrialisation/RELECTURE_20_FICHES.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SNY — relecture des 20 fiches</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;color:#1a1a1a;display:flex}nav{position:sticky;top:0;align-self:flex-start;width:230px;height:100vh;overflow:auto;background:#f4f4f2;padding:12px;box-sizing:border-box;flex:none}nav h3{margin:14px 0 4px;font-size:12px;text-transform:uppercase;color:#666}nav a{display:block;padding:4px 6px;color:#222;text-decoration:none;border-radius:4px}nav a:hover{background:#e3e3df}nav small{display:block;color:#777;font-size:11px}main{max-width:900px;padding:16px 28px;flex:1;min-width:0}h4{margin:10px 0 2px;font-size:13px}.v5{border:1px solid #ddd;border-radius:6px;padding:4px 14px 10px;margin:14px 0}section{border-bottom:3px solid #ddd;padding-bottom:28px;margin-bottom:28px}.bandeau{background:#fff7e0;border:1px solid #e8d48a;padding:8px 12px;border-radius:6px;font-size:13px}.att{font-weight:600;color:#9a4b00}h2{margin-top:18px}h3{margin:20px 0 6px;border-bottom:1px solid #ddd}table{border-collapse:collapse;font-size:12px;width:100%}td,th{border:1px solid #ccc;padding:3px 6px;vertical-align:top;word-break:break-word}blockquote{margin:4px 0 4px 8px;padding-left:10px;border-left:3px solid #bbb;color:#333}.src{font-size:12px;color:#555}li{margin:6px 0}code{background:#eee;padding:0 3px;border-radius:3px}@media(max-width:800px){body{display:block}nav{position:static;width:auto;height:auto}}</style></head><body>
<nav><a href="#v5"><b>À valider : 7 versions</b><small>différences uniquement</small></a><h3>Lot #1 (⚑ = décision attendue)</h3>${nav(1)}<h3>Lot #2</h3>${nav(2)}</nav>
<main><h1>Relecture des 20 fiches</h1><p>Rendus intégraux, tels que dans le dépôt, sans modification. Rien n'est approuvé ni publié. Chaque empreinte a été vérifiée contre son fichier.</p>
${htmlV5}
${corps}</main></body></html>`);
console.log(`✓ ${fiches.length} fiches, empreintes vérifiées`);
