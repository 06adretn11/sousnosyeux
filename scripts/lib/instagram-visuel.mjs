// =====================================================================
// scripts/lib/instagram-visuel.mjs — LE visuel Instagram de SNY : UN gabarit, 1080 × 1350 (portrait 4:5), identité du site (papier, rouge, DM Sans / Playfair Display / DM Mono).
//
// Ce module ne rédige RIEN. Le visuel est une MISE EN PAGE, déterministe, des segments DÉJÀ composés et contrôlés de la légende Instagram (même matière approuvée V4.1) :
// chaque ligne affichée est la copie exacte d'un segment de la légende (ou un libellé fixe de la liste blanche : en-tête, signature). Aucune image générative, aucun portrait,
// aucune représentation des faits ou des personnes : du texte, la marque, des aplats de couleur.
//
//   specVisuel(type, post)        → les lignes à afficher (copie des segments de la légende) — PURE
//   verifierVisuel(spec, post)    → contrôleur indépendant : tout ce qui est affiché provient de la légende / de la liste blanche — PURE
//   htmlVisuel(spec)              → page HTML autonome (polices embarquées en base64, aucun accès réseau) — PURE
//   rendreVisuel({ html })        → PNG 1080 × 1350 par un navigateur SANS INTERFACE (Chrome / Edge) lancé en liste d'arguments (pas de shell), `--dump-dom` d'abord (mesure du
//                                   débordement : un texte qui ne tient pas est REFUSÉ, jamais coupé), puis capture
//   pngDimensions / empreinte     → contrôle de format et empreinte du CONTENU de l'image (pas seulement de son adresse)
// =====================================================================
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ENTETE } from './diffusion-sociale.mjs';
import { gardes } from './social-editorial.mjs';

/** Version du gabarit : elle entre dans l'identité validée (un changement de mise en page invalide tout GO donné sur l'ancienne). */
export const GABARIT_VISUEL = 'ig-v1';
export const LARGEUR = 1080;
export const HAUTEUR = 1350;
export const SIGNATURE = 'sousnosyeux.org';
const MAX_SOURCES_AFFICHEES = 3;
const MAX_CONTEXTE_AFFICHE = 1; // « quelques mots de contexte » : une seule phrase approuvée, retirée la première si elle ne tient pas
/** Plus petit corps toléré (facteur sur les tailles de base) : en dessous, le texte serait illisible sur un téléphone ⇒ pas de visuel ⇒ pas de proposition. */
export const ECHELLES = Object.freeze([1, 0.95, 0.9, 0.85, 0.8, 0.76, 0.73]);

const sha256 = (x) => createHash('sha256').update(x).digest('hex');
export const empreinteImage = (png) => sha256(png);
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
export const empreinteSpec = (spec) => sha256(JSON.stringify(canon({ gabarit: GABARIT_VISUEL, spec }))).slice(0, 16);

/** Même convention de couleur que la carte du site (index.astro : statutCat). Décoratif : aucune information supplémentaire n'est portée par la couleur. */
const COULEUR_STATUT = { 'condamnation définitive': '#E63946', 'condamnation non définitive': '#E63946', 'mise en examen': '#457B9D', 'enquête': '#457B9D', 'procès': '#457B9D' };

// ---------------------------------------------------------------------
// SPEC : copie des segments de la légende. PURE.
// ---------------------------------------------------------------------
/** @param {'new_case'|'case_update'} type @param {{paragraphes:object[][]}} post légende Instagram (segments)  @param {string|null} statut statut judiciaire public (couleur de la pastille) */
export function specVisuel(type, post, statut = null) {
  const segs = post.paragraphes.flat();
  const accroche = segs.find((s) => s.role === 'accroche');
  const c = accroche?.champs ?? {};
  const val = (k) => (c[k]?.valeur != null ? String(c[k].valeur) : null);
  return {
    kicker: ENTETE[type] ?? null,
    commune: val('commune'), departement: val('departement'), etablissement: val('etablissement'), libelle: val('libelle'), qualif: val('qualif'),
    couleur: COULEUR_STATUT[statut] ?? '#8B9BAD',
    faits: segs.filter((s) => s.role === 'fait').map((s) => s.texte),
    contexte: segs.filter((s) => s.role === 'contexte').map((s) => s.texte).slice(0, MAX_CONTEXTE_AFFICHE),
    reserves: segs.filter((s) => s.role === 'reserve').map((s) => s.texte),
    sources: segs.filter((s) => s.role === 'attribution').map((s) => s.texte),
    signature: SIGNATURE,
  };
}

/**
 * CONTRÔLEUR INDÉPENDANT du visuel : reprend la légende (segments) et la liste blanche, et refuse toute ligne qui n'en provient pas. « Une information présente sur l'image est
 * justifiée au même titre qu'une phrase de la légende. » Retourne les contrôles, comme verifierPost.
 */
export function verifierVisuel(spec, post, type, entree = null) {
  const c = [];
  const ok = (nom, cond, detail = '') => c.push({ nom, ok: !!cond, detail: cond ? '' : detail });
  const segs = post.paragraphes.flat();
  const parRole = (r) => new Set(segs.filter((s) => s.role === r).map((s) => s.texte));
  const accroche = segs.find((s) => s.role === 'accroche');
  const champ = (k) => (accroche?.champs?.[k]?.valeur != null ? String(accroche.champs[k].valeur) : null);
  ok('en-tête = libellé fixe de la liste blanche', spec.kicker === ENTETE[type], String(spec.kicker));
  ok('signature = libellé fixe', spec.signature === SIGNATURE);
  ok('lieu, établissement et pastille = champs de l’accroche de la légende', !!accroche && spec.commune === champ('commune') && spec.departement === champ('departement') && spec.etablissement === champ('etablissement') && spec.libelle === champ('libelle') && spec.qualif === champ('qualif') && !!spec.commune && !!spec.etablissement && !!spec.libelle,
    'un champ affiché diffère de la légende');
  const dans = (liste, role) => liste.every((t) => parRole(role).has(t));
  ok('faits affichés = segments « fait » de la légende (copie exacte)', dans(spec.faits, 'fait'), spec.faits.filter((t) => !parRole('fait').has(t)).map((t) => t.slice(0, 40)).join(' | '));
  ok('TOUS les faits de la légende sont affichés (aucun fait omis, aucun fait tronqué)', spec.faits.length > 0 && spec.faits.length === segs.filter((s) => s.role === 'fait').length);
  ok('contexte affiché = segments « contexte » de la légende', dans(spec.contexte, 'contexte'));
  ok('réserve judiciaire affichée = segments « réserve » de la légende, TOUS affichés', dans(spec.reserves, 'reserve') && spec.reserves.length === segs.filter((s) => s.role === 'reserve').length);
  ok('au moins une réserve judiciaire visible sur l’image', spec.reserves.length >= 1 || spec.faits.some((t) => /ne vaut pas culpabilit|présum|non définiti|pas définiti|caractère définitif|n['’]établit pas/i.test(t)), 'aucune réserve judiciaire sur le visuel');
  ok('sources affichées = lignes « Source » de la légende (média + date)', spec.sources.length >= 1 && dans(spec.sources, 'attribution'), 'source absente ou différente de la légende');
  ok('TOUTES les sources de la légende sont affichées (attribution exacte)', spec.sources.length === segs.filter((s) => s.role === 'attribution').length && spec.sources.length <= MAX_SOURCES_AFFICHEES, `${spec.sources.length} source(s) affichée(s)`);
  const tout = [spec.commune, spec.departement, spec.etablissement, spec.libelle, spec.qualif, ...spec.faits, ...spec.contexte, ...spec.reserves, ...spec.sources].filter(Boolean).join(' \n ');
  ok('aucune adresse ni lien sur l’image', !/https?:\/\/|www\./i.test(tout));
  ok('aucun texte tronqué (pas de « … » ni « ... »)', !/\.\.\.|…/.test(tout));
  const g = gardes(tout, entree);
  ok('gardes de sécurité des personnes (nombre d’enfants, âge, parenté, rôle exact, fonction unique)', !g.bloquants.length, g.bloquants.join(', '));
  return { ok: c.every((x) => x.ok), controles: c };
}

// ---------------------------------------------------------------------
// HTML : une mise en page, polices embarquées. PURE (hors lecture des fichiers de police, versionnés).
// ---------------------------------------------------------------------
const POLICES = [
  ['DM Sans', 400, 'dm-sans-latin-400-normal.woff2'], ['DM Sans', 600, 'dm-sans-latin-600-normal.woff2'], ['DM Sans', 700, 'dm-sans-latin-700-normal.woff2'],
  ['Playfair Display', 700, 'playfair-display-latin-700-normal.woff2'], ['DM Mono', 500, 'dm-mono-latin-500-normal.woff2'],
];
let facesCache = null;
const faces = () => (facesCache ??= POLICES.map(([nom, poids, f]) => `@font-face{font-family:'${nom}';font-weight:${poids};font-style:normal;src:url(data:font/woff2;base64,${readFileSync(new URL(`../assets/fonts/${f}`, import.meta.url)).toString('base64')}) format('woff2');}`).join('\n'));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Marque du site (web/public/favicon.svg), recopiée telle quelle : l'ours rouge et son point d'exclamation.
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="88 115 1071 1071" width="72" height="72"><g fill="#DC343C"><circle cx="308" cy="360" r="152"/><circle cx="947" cy="360" r="152"/><path d="M140 720C140 430 360 258 625 258C890 258 1108 430 1108 720C1108 930 960 1093 625 1093C290 1093 140 930 140 720Z"/></g><polygon points="566,441 686,441 660,715 595,715" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="40" stroke-linejoin="round"/><circle cx="625" cy="853" r="86" fill="#FFFFFF"/></svg>';

export function htmlVisuel(spec) {
  const ctx = spec.contexte.map((t) => `<p class="ctx">${esc(t)}</p>`).join('');
  return `<!doctype html><html lang="fr" data-fit="mesure"><head><meta charset="utf-8"><title>sousnosyeux</title><style>
${faces()}
:root{--k:1;--c:${/^#[0-9A-Fa-f]{6}$/.test(spec.couleur) ? spec.couleur : '#8B9BAD'}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:${LARGEUR}px;height:${HAUTEUR}px;background:#FAF9F6;overflow:hidden}
.page{width:${LARGEUR}px;height:${HAUTEUR}px;display:flex;flex-direction:column;font-family:'DM Sans',sans-serif;color:#1A1A1A}
header{flex:none;height:132px;padding:0 64px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:6px solid #E63946}
.logo{display:flex;align-items:center;gap:20px}.logo b{font:700 36px 'DM Sans',sans-serif;letter-spacing:-.5px}
.kicker{font:600 21px/1.3 'DM Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#64748B;text-align:right;max-width:560px}
main{flex:1;min-height:0;padding:52px 64px 26px;display:flex;flex-direction:column;gap:calc(26px*var(--k));overflow:hidden}
h1{margin:0;font:700 calc(92px*var(--k))/1.02 'Playfair Display',serif;letter-spacing:-1px}
h1 small{font:500 calc(34px*var(--k)) 'DM Mono',monospace;color:#8B9BAD;letter-spacing:0;margin-left:14px}
.etab{margin:calc(-8px*var(--k)) 0 0;font:600 calc(38px*var(--k))/1.25 'DM Sans',sans-serif}
.chip{align-self:flex-start;background:var(--c);color:#fff;font:700 calc(27px*var(--k)) 'DM Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:calc(11px*var(--k)) calc(22px*var(--k));border-radius:6px}
.pour{margin:calc(-6px*var(--k)) 0 0;font:600 calc(34px*var(--k))/1.3 'DM Sans',sans-serif}
.fait{margin:0;font:400 calc(44px*var(--k))/1.36 'DM Sans',sans-serif;border-left:8px solid #E63946;padding-left:28px}
.ctx{margin:0;font:400 calc(34px*var(--k))/1.4 'DM Sans',sans-serif;color:#334155}
.res{margin:0;font:400 calc(32px*var(--k))/1.4 'DM Sans',sans-serif;background:#EEF3FB;border-left:8px solid #457B9D;padding:calc(16px*var(--k)) 26px;color:#1E293B}
.src{margin:0;font:500 calc(25px*var(--k))/1.4 'DM Mono',monospace;color:#475569}
.srcs{margin-top:auto;display:flex;flex-direction:column;gap:calc(6px*var(--k))}
footer{flex:none;height:92px;padding:0 64px;background:#1A1A1A;color:#fff;display:flex;align-items:center;justify-content:space-between;font:500 30px 'DM Mono',monospace}
footer i{width:56px;height:6px;background:#E63946;display:block}
</style></head><body><div class="page">
<header><div class="logo">${LOGO}<b>sousnosyeux</b></div><div class="kicker">${esc(spec.kicker)}</div></header>
<main id="corps">
<h1>${esc(spec.commune)}${spec.departement ? `<small>(${esc(spec.departement)})</small>` : ''}</h1>
<p class="etab">${esc(spec.etablissement)}</p>
<div class="chip">${esc(spec.libelle)}</div>${spec.qualif ? `\n<p class="pour">pour ${esc(spec.qualif)}</p>` : ''}
${spec.faits.map((t) => `<p class="fait">${esc(t)}</p>`).join('\n')}
<div id="ctx">${ctx}</div>
${spec.reserves.map((t) => `<p class="res">${esc(t)}</p>`).join('\n')}
<div class="srcs">${spec.sources.map((t) => `<p class="src">${esc(t)}</p>`).join('')}</div>
</main>
<footer><span>${esc(spec.signature)}</span><i></i></footer>
</div>
<script>
// Ajustement par PALIERS de corps (jamais de coupe) : le contexte, facultatif, est retiré le premier ; si le fait, la réserve et les sources ne tiennent toujours pas au plus petit corps, le visuel est REFUSÉ.
(async () => {
  const D = document.documentElement, corps = document.getElementById('corps'), ctx = document.getElementById('ctx');
  try { await document.fonts.ready; } catch (e) {}
  const tiens = () => corps.scrollHeight <= corps.clientHeight + 1;
  const echelles = ${JSON.stringify(ECHELLES)};
  for (const avecCtx of [true, false]) {
    ctx.style.display = avecCtx ? '' : 'none';
    for (const k of echelles) { D.style.setProperty('--k', String(k)); if (tiens()) { D.dataset.fit = 'ok'; D.dataset.k = String(k); D.dataset.ctx = avecCtx && ctx.children.length ? 'oui' : 'non'; return; } }
  }
  D.dataset.fit = 'debordement';
})();
</script></body></html>`;
}

// ---------------------------------------------------------------------
// RENDU : navigateur sans interface, arguments en liste (aucun shell), dossier temporaire supprimé.
// ---------------------------------------------------------------------
export function trouverChrome(env = process.env) {
  const cands = [env.SNY_CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  return cands.find((p) => existsSync(p)) ?? null;
}
const lancer = (bin, args) => new Promise((resolve, reject) => execFile(bin, args, { timeout: 90000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (e, stdout) => (e ? reject(e) : resolve(String(stdout)))));

/** @returns {Promise<{png:Buffer, fit:{k:number, contexte:boolean}}>}  throws Error si le texte ne tient pas, si le navigateur manque ou si le format est inattendu. */
export async function rendreVisuel({ html, chrome = trouverChrome(), lancerImpl = lancer, env = process.env }) {
  if (!chrome) throw new Error('navigateur sans interface introuvable (SNY_CHROME_BIN)');
  const dir = mkdtempSync(join(tmpdir(), 'sny-ig-'));
  try {
    const page = join(dir, 'visuel.html'), sortie = join(dir, 'visuel.png');
    writeFileSync(page, html, 'utf8');
    const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', `--user-data-dir=${join(dir, 'profil')}`, ...(env.CI || env.SNY_CHROME_NO_SANDBOX ? ['--no-sandbox'] : []), `--window-size=${LARGEUR},${HAUTEUR}`];
    const url = pathToFileURL(page).href;
    const dom = await lancerImpl(chrome, [...base, '--virtual-time-budget=6000', '--dump-dom', url]);
    const m = /data-fit="([a-z]+)"/.exec(dom);
    if (!m || m[1] !== 'ok') throw new Error(m?.[1] === 'debordement' ? 'le texte ne tient pas dans le gabarit au plus petit corps toléré : aucun visuel (jamais de texte coupé)' : 'mesure du gabarit impossible');
    const k = Number(/data-k="([0-9.]+)"/.exec(dom)?.[1]);
    const contexte = /data-ctx="oui"/.test(dom);
    await lancerImpl(chrome, [...base, '--virtual-time-budget=6000', `--screenshot=${sortie}`, url]);
    const png = readFileSync(sortie);
    const d = pngDimensions(png);
    if (!d || d.largeur !== LARGEUR || d.hauteur !== HAUTEUR) throw new Error(`format inattendu : ${d ? `${d.largeur}×${d.hauteur}` : 'pas un PNG'} (attendu ${LARGEUR}×${HAUTEUR})`);
    return { png, fit: { k, contexte } };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Lit l'en-tête PNG (signature + IHDR). null si ce n'est pas un PNG. */
export function pngDimensions(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? []);
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (b.length < 33 || !b.subarray(0, 8).equals(SIG) || b.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) };
}
