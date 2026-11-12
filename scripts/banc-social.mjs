#!/usr/bin/env node
// =====================================================================
// scripts/banc-social.mjs — BANC D'ESSAI ÉDITORIAL SOCIAL V3 (local). AUCUNE publication, AUCUN appel Buffer, AUCUN réseau, AUCUNE base, AUCUN modèle.
//
//   node scripts/banc-social.mjs                 génère out/banc-social/banc.json + banc.html depuis le corpus de référence
//   node scripts/banc-social.mjs --sortie <dir>  autre dossier de sortie (local)
//
// Entrées (lecture seule, dans le dépôt) : data/cases.json, data/evenements.json, data/hub-matiere/*.json, web/src/lib/etat-wording.ts,
// scripts/qa/fixtures/banc-social-corpus.json. Le HTML affiche les textes EXACTS sortis du composeur (aucune duplication de texte).
// La « version actuelle » montrée en regard est la sortie du composeur de PRODUCTION (composerMessage), inchangé.
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierFiche } from './lib/fiche-page.mjs';
import { composerMessage, lienDiffusion } from './lib/diffusion-sociale.mjs';
import { matiereApprouvee, composerPilote, verifierPost, noter, preuvesDe, longueurX, VERSION } from './lib/social-editorial.mjs';

const ROOT = new URL('../', import.meta.url);
const lire = (f) => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8'));
const SITE = 'https://sousnosyeux.org';
const A = process.argv.slice(2);
const SORTIE = resolve(A.includes('--sortie') ? A[A.indexOf('--sortie') + 1] : fileURLToPath(new URL('out/banc-social/', ROOT)));
const AUJOURDHUI = new Date(process.env.BANC_DATE || Date.now());

export async function genererBanc({ corpus = lire('scripts/qa/fixtures/banc-social-corpus.json'), now = AUJOURDHUI } = {}) {
  const wording = await import('../web/src/lib/etat-wording.ts');
  const cases = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
  const ev = lire('data/evenements.json');
  const resultats = [];
  for (const sc of corpus.scenarios) {
    const entree = cases.get(sc.case_id) ?? null;
    const dossier = dossierFiche(sc.case_id);
    const M = matiereApprouvee({ entree, dossier, empreinteApprouvee: ev.fiches_approuvees?.[sc.case_id]?.hash ?? null,
      evenements: ev.affaires?.[sc.case_id] ?? [], matiere: (ev.matiere || []).filter((m) => m.case_id === sc.case_id), wording });
    const r = composerPilote({ scenario: sc, M, publiques: cases, site: SITE });
    const canaux = {};
    for (const canal of ['x', 'facebook']) {
      const p = r[canal];
      if (p.etat !== 'OK') { canaux[canal] = { etat: 'BLOQUE', motifs: r.etat === 'BLOQUE' ? r.motifs : p.motifs }; continue; }
      const verif = verifierPost(p, canal, M, SITE);
      const note = noter(p, canal, verif, { famille: sc.famille });
      const attentionCanal = [...r.attention, ...(p.attention || [])];
      const etat = !verif.ok ? 'BLOQUE' : attentionCanal.length ? 'REVUE' : 'CONFORME';
      canaux[canal] = { etat, texte: p.texte, longueur: canal === 'x' ? longueurX(p.texte) : [...p.texte].length, urls: p.texte.match(/https?:\/\/\S+/g) || [],
        repli: !!p.repli, attention: p.attention || [], source: canal === 'x' ? p.source ?? null : r.sourcePrincipale, controles: verif.controles, note, preuves: preuvesDe(p), motifs: verif.ok ? [] : verif.controles.filter((c) => !c.ok).map((c) => `${c.nom} : ${c.detail}`) };
    }
    // Version ACTUELLE (moteur de production, inchangé) pour la même affaire : référence « avant ».
    const actuel = {};
    if (entree) {
      const p = (entree.sources || [])[0];
      const src = wording.sourceAffichee(entree.etat ?? null, p ? { media: p.media, date: p.publication_date, url: p.url } : null);
      const l = wording.phrasesEtat(entree.statut_judiciaire, entree.etat ?? null, src);
      const type = sc.famille === 'evolution' ? 'case_update' : 'new_case';
      for (const canal of ['x', 'facebook']) {
        const lien = lienDiffusion({ site: SITE, case_id: entree.case_id, type, statut: entree.statut_judiciaire, canal, fiche: !!ev.fiches_approuvees?.[sc.case_id] });
        actuel[canal] = composerMessage({ type, canal, entree, ph: { phrase: l[0], mention: l.slice(1).join(' ') || null }, lien });
        if (actuel[canal].texte && canal === 'x') actuel[canal].longueur = longueurX(actuel[canal].texte);
      }
    }
    const src = r.sourcePrincipale;
    const age = src?.publie_le ? Math.floor((now - Date.parse(`${String(src.publie_le).slice(0, 10)}T00:00:00Z`)) / 864e5) : null;
    const global = ['x', 'facebook'].map((c) => canaux[c].etat);
    resultats.push({ ...sc, etablissement: entree?.etablissement ?? null, commune: entree?.commune ?? null, statut_public: entree?.statut_judiciaire ?? null,
      fiche_approuvee: M.empreinte, source_principale: src, age_source_jours: age,
      etat: global.includes('CONFORME') ? 'CONFORME' : global.includes('REVUE') ? 'REVUE' : 'BLOQUE',
      motifs: r.motifs, attention: r.attention, soeurs: r.soeurs ?? [], canaux, actuel });
  }
  return { version: VERSION, genere_le: now.toISOString(), resultats };
}

// ---------------------------------------------------------------------
// HTML autonome (aucune ressource externe). Les textes sont ceux de `banc.json`, échappés.
// ---------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const liens = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u.length > 60 ? u.slice(0, 57) + '…' : u}</a>`);
const BADGE = { CONFORME: ['#2D6A4F', 'conforme aux contrôles'], REVUE: ['#D97706', 'revue humaine'], BLOQUE: ['#E63946', 'bloqué'] };
const badge = (e) => `<span class="badge" style="background:${BADGE[e][0]}">${BADGE[e][1]}</span>`;
const FAM = { nouvelle_affaire: 'Nouvelle affaire (Discovery)', evolution: 'Évolution judiciaire (Maintenance)', declaration_association: 'Déclaration associative', declaration_victime: 'Prise de parole côté victime' };

function carteReseau(canal, c) {
  if (c.etat === 'BLOQUE' && !c.texte) return `<div class="post ${canal} bloque"><div class="net">${canal === 'x' ? 'X' : 'Facebook'} ${badge('BLOQUE')}</div><ul>${c.motifs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
  const ctl = c.controles.map((k) => `<li class="${k.ok ? 'ok' : 'ko'}">${k.ok ? '✓' : '✗'} ${esc(k.nom)}${k.detail ? ` — ${esc(k.detail)}` : ''}</li>`).join('');
  return `<div class="post ${canal}">
    <div class="net">${canal === 'x' ? 'X' : 'Facebook'} ${badge(c.etat)} <span class="meta">${c.longueur} car.${canal === 'x' ? ' (URL = 23)' : ''} · ${c.urls.length} URL · qualité (aide) ${c.note.total}/100${c.repli ? ' · version de repli' : ''}</span></div>
    <div class="head"><span class="avatar">SNY</span><b>Sous nos yeux</b> <span class="handle">${canal === 'x' ? '@sousnosyeux · aperçu' : 'Page · aperçu'}</span></div>
    <div class="body">${liens(c.texte).replace(/\n/g, '<br>')}</div>
    <div class="og">Aperçu de lien : non simulé (métadonnées Open Graph non récupérées par le banc).</div>
    ${c.attention?.length ? `<div class="attention"><small>${c.attention.map(esc).join('<br>')}</small></div>` : ''}
    <details><summary>Contrôles automatisés (${c.controles.filter((k) => k.ok).length}/${c.controles.length})</summary><ul class="ctl">${ctl}</ul></details>
  </div>`;
}

function htmlBanc(b) {
  const lignes = b.resultats.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.case_id)}<br><small>${esc(r.etablissement ?? '')}</small></td><td>${esc(FAM[r.famille])}</td><td>${r.fiche_approuvee ? 'oui (fiche approuvée)' : 'non'}</td><td>${badge(r.canaux.x.etat)}</td><td>${badge(r.canaux.facebook.etat)}</td><td>${esc(([...r.motifs, ...(r.canaux.x.motifs || []), ...(r.canaux.facebook.motifs || []), ...r.attention, ...(r.canaux.facebook.attention || []), ...(r.canaux.x.attention || [])][0] ?? "—").slice(0, 160))}</td></tr>`).join('');
  const cartes = b.resultats.map((r) => {
    const preuves = (r.canaux.facebook.preuves || r.canaux.x.preuves || []);
    const tab = preuves.length ? `<table class="preuves"><tr><th>Affirmation</th><th>Source</th><th>Passage / donnée approuvée</th><th>Validation</th></tr>${preuves.map((p) => `<tr><td>${esc(p.affirmation)}</td><td>${p.source ? `${esc(p.source.media)}${p.source.publie_le ? `, ${esc(String(p.source.publie_le).slice(0, 10))}` : ''}<br>${liens(p.source.url ?? '')}` : '—'}</td><td><small>${esc(p.passage)}</small></td><td>${esc(p.validation)}</td></tr>`).join('')}</table>` : '<p class="vide">Aucune affirmation publiable : scénario bloqué.</p>';
    const act = (c) => r.actuel[c] ? (r.actuel[c].texte ? `<pre>${esc(r.actuel[c].texte)}</pre>` : `<p class="vide">${esc(r.actuel[c].erreur)}</p>`) : '<p class="vide">—</p>';
    return `<section class="carte" id="${esc(r.id)}">
      <h2>${esc(r.id)} · ${esc(r.titre)} ${badge(r.etat)}</h2>
      <p class="meta">${esc(r.case_id)} · ${esc(FAM[r.famille])} · statut public : ${esc(r.statut_public ?? '—')} · fiche approuvée : ${esc(r.fiche_approuvee ?? 'aucune')}
      ${r.source_principale ? ` · article utilisé : <a href="${esc(r.source_principale.url)}" target="_blank" rel="noopener noreferrer">${esc(r.source_principale.media)}</a> (${esc(String(r.source_principale.publie_le ?? '').slice(0, 10))}, ${r.age_source_jours} j — corpus historique : <b>aucune diffusion rétroactive</b>)` : ''}</p>
      ${r.motifs.length ? `<div class="blocage"><b>Blocages</b><ul>${r.motifs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
      ${r.attention.length ? `<div class="attention"><b>Points de revue humaine</b><ul>${r.attention.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
      <div class="fils">${carteReseau('x', r.canaux.x)}${carteReseau('facebook', r.canaux.facebook)}</div>
      <details><summary>Affirmations et preuves</summary>${tab}</details>
      <details><summary>Moteur actuel (production, inchangé) — même affaire</summary><div class="fils"><div><b>X</b>${act('x')}</div><div><b>Facebook</b>${act('facebook')}</div></div></details>
    </section>`;
  }).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>SNY — banc d'essai éditorial social V3 (local)</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;background:#f4f4f2;color:#1d1d1f}header{background:#1d1d1f;color:#fff;padding:18px 28px}header b{color:#E63946}
main{max-width:1180px;margin:auto;padding:20px}table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}td,th{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}
.badge{color:#fff;border-radius:10px;padding:1px 8px;font-size:12px;white-space:nowrap}.carte{background:#fff;border-radius:10px;padding:16px 20px;margin:22px 0;box-shadow:0 1px 3px #0001}
.carte h2{font-size:18px;margin:0 0 4px}.meta{color:#666;font-size:12.5px}.fils{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0}
.post{border:1px solid #e1e1e1;border-radius:12px;padding:12px 14px;background:#fff}.post.x{border-color:#cfd9de}.post.facebook{border-color:#dadde1;background:#fdfdfd}
.net{font-weight:600;margin-bottom:8px}.head{display:flex;gap:8px;align-items:center;margin-bottom:6px}.avatar{background:#E63946;color:#fff;border-radius:50%;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
.handle{color:#536471;font-size:13px}.body{white-space:normal;word-wrap:break-word}.body a{color:#1d9bf0}.og{margin-top:10px;border:1px dashed #ccc;border-radius:8px;padding:6px 8px;color:#888;font-size:12px}
.bloque{background:#fff5f5}.blocage{background:#fff0f0;border-left:4px solid #E63946;padding:6px 12px;margin:8px 0}.attention{background:#fff8eb;border-left:4px solid #D97706;padding:6px 12px;margin:8px 0}
.ctl{font-size:12.5px;padding-left:16px}.ctl .ok{color:#2D6A4F}.ctl .ko{color:#E63946;font-weight:600}.preuves td{font-size:12.5px}pre{white-space:pre-wrap;background:#f7f7f7;padding:8px;border-radius:6px;font-size:12.5px}.vide{color:#999;font-style:italic}
</style></head><body><header><b>▍</b> Sous nos yeux — banc d'essai éditorial social <b>V3</b> · ${esc(b.version)} · généré le ${esc(b.genere_le.slice(0, 16).replace('T', ' '))} UTC<br><small>Document LOCAL. Aucun de ces messages n'a été publié, programmé ni transmis à Buffer. Corpus historique : aucune diffusion rétroactive. Aucun GO de publication.</small></header>
<main><h1 style="font-size:20px">Synthèse</h1><table><tr><th>#</th><th>Affaire</th><th>Famille</th><th>Matière exploitable</th><th>X</th><th>Facebook</th><th>Principal problème / point de revue</th></tr>${lignes}</table>${cartes}</main></body></html>`;
}

// ---------------------------------------------------------------------
// Markdown (lisible directement sur GitHub) : mêmes sorties que le HTML, rien de réécrit. Les textes sont en blocs de code (affichage exact, liens non actifs).
// ---------------------------------------------------------------------
const ETAT_MD = { CONFORME: '🟢 conforme aux contrôles', REVUE: '🟠 revue humaine', BLOQUE: '🔴 bloqué' };
const cel = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const bloc = (t) => '```text\n' + String(t).replace(/```/g, "'''") + '\n```';
function mdBanc(b) {
  const L = [`# SNY — banc d'essai éditorial social V3 (${b.version})`, '',
    `Généré le ${b.genere_le.slice(0, 16).replace('T', ' ')} UTC par \`node scripts/banc-social.mjs --sortie docs/industrialisation/banc-social\`. **Aucun de ces messages n'a été publié, programmé ni transmis à Buffer.** Corpus historique : aucune diffusion rétroactive. Aucun GO éditorial ni de diffusion.`, '',
    'Les messages ci-dessous sont les sorties EXACTES du composeur (`scripts/lib/social-editorial.mjs`), identiques à `banc.json` et `banc.html` du même dossier.', '',
    '## Synthèse', '', '| # | Affaire | Famille | X | Facebook | Principal problème / point de revue |', '|---|---|---|---|---|---|'];
  for (const r of b.resultats) L.push(`| [${r.id}](#${r.id.toLowerCase()}) | ${cel(r.case_id)} · ${cel(r.etablissement)} | ${cel(FAM[r.famille])} | ${ETAT_MD[r.canaux.x.etat]} | ${ETAT_MD[r.canaux.facebook.etat]} | ${cel(([...r.motifs, ...(r.canaux.x.motifs || []), ...(r.canaux.facebook.motifs || []), ...r.attention, ...(r.canaux.facebook.attention || []), ...(r.canaux.x.attention || [])][0] ?? '—').slice(0, 200))} |`);
  for (const r of b.resultats) {
    L.push('', `## ${r.id}`, '', `**${cel(r.titre)}** — ${cel(r.case_id)}, ${cel(r.etablissement)} (${cel(r.commune)}) · ${FAM[r.famille]} · statut public : ${cel(r.statut_public)} · fiche approuvée : ${r.fiche_approuvee ?? 'aucune'}`);
    if (r.source_principale) L.push('', `Article utilisé : ${r.source_principale.media}, ${String(r.source_principale.publie_le ?? '').slice(0, 10)} — ${r.source_principale.url}`);
    if (r.motifs.length) L.push('', '**Blocages**', '', ...r.motifs.map((m) => `- ${m}`));
    if (r.attention.length) L.push('', '**Points de revue humaine**', '', ...r.attention.map((m) => `- ${m}`));
    if (r.notes?.length) L.push('', '**Notes**', '', ...r.notes.map((m) => `- ${m}`));
    for (const c of ['x', 'facebook']) {
      const k = r.canaux[c];
      L.push('', `### ${c === 'x' ? 'X' : 'Facebook'} — ${ETAT_MD[k.etat]}`);
      if (!k.texte) { L.push('', ...k.motifs.map((m) => `- ${m}`)); continue; }
      L.push('', `${k.longueur} caractères${c === 'x' ? ' (URL comptées 23)' : ''} · ${k.urls.length} URL · qualité (aide à la revue, mécanique) ${k.note.total}/100${k.repli ? ' · version de repli' : ''} · contrôles ${k.controles.filter((x) => x.ok).length}/${k.controles.length}`, '', bloc(k.texte));
      if (k.attention?.length) L.push('', ...k.attention.map((m) => `- ⚠️ ${m}`));
      L.push('', '<details><summary>Affirmations et preuves</summary>', '', '| Rôle | Affirmation | Source | Validation |', '|---|---|---|---|',
        ...k.preuves.map((p) => `| ${p.role} | ${cel(p.affirmation)} | ${p.source ? `${cel(p.source.media)} ${String(p.source.publie_le ?? '').slice(0, 10)} ${cel(p.source.url)}` : '—'} | ${cel(p.validation)} |`), '', '</details>');
    }
    const act = (c) => r.actuel[c]?.texte ?? r.actuel[c]?.erreur ?? '—';
    L.push('', '<details><summary>Moteur actuel (production, inchangé) — même affaire</summary>', '', '**X**', '', bloc(act('x')), '', '**Facebook**', '', bloc(act('facebook')), '', '</details>');
  }
  return L.join('\n') + '\n';
}

// Exécution directe seulement (le test importe ce module sans rien écrire).
if (process.argv[1] && basename(process.argv[1]) === 'banc-social.mjs') {
  const b = await genererBanc();
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(resolve(SORTIE, 'banc.json'), JSON.stringify(b, null, 2));
  writeFileSync(resolve(SORTIE, 'banc.html'), htmlBanc(b));
  writeFileSync(resolve(SORTIE, 'banc.md'), mdBanc(b));
  for (const r of b.resultats) console.log(`${r.id} ${r.case_id.padEnd(13)} ${r.famille.padEnd(24)} X:${r.canaux.x.etat.padEnd(9)} FB:${r.canaux.facebook.etat.padEnd(9)} q(X/FB) ${r.canaux.x.note?.total ?? '—'}/${r.canaux.facebook.note?.total ?? '—'}  ${(r.motifs[0] ?? r.canaux.x.motifs?.[0] ?? '').slice(0, 110)}`);
  console.log(`\n→ ${resolve(SORTIE, 'banc.html')}`);
}
export { htmlBanc, mdBanc };
