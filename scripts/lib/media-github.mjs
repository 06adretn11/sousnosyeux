// =====================================================================
// scripts/lib/media-github.mjs — hébergement du visuel Instagram SANS nouvelle infrastructure : une branche orpheline `instagram-media` du dépôt public, alimentée par
// l'API GitHub (le jeton `GITHUB_TOKEN` du workflow, droit `contents: write`, déjà accordé aux deux workflows du relais). Aucun commit sur `main`, aucun déploiement du site,
// aucun téléversement manuel : le même job qui compose le visuel le publie.
//
//   · URL = https://raw.githubusercontent.com/<dépôt>/instagram-media/<chemin>  — HTTPS, directe (aucune redirection), publique ;
//   · le chemin est ADRESSÉ PAR LE CONTENU (`ig/<affaire>/<16 premiers hex du sha256>.png`) : une image ne peut jamais être remplacée par une autre sous la même URL ⇒ immuable
//     par construction, et stable aussi longtemps que la branche existe (elle n'est jamais réécrite ni supprimée par ce code) ;
//   · le dépôt est public : l'image l'est dès son dépôt (avant le GO). Elle ne contient que des informations déjà approuvées pour le site public ;
//   · aucun secret ne figure dans l'image, l'URL ni les messages d'erreur (le jeton est purgé).
// `fetchImpl` est injectable : les tests n'ouvrent aucun réseau.
// =====================================================================
import { createHash } from 'node:crypto';

export const BRANCHE_MEDIA = 'instagram-media';
const RE_CHEMIN = /^ig\/[a-z0-9-]{3,30}\/[0-9a-f]{16}\.png$/;
const RE_DEPOT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,59}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/; // ni « .. » ni segment commençant par un point
export const urlMedia = (depot, chemin) => `https://raw.githubusercontent.com/${depot}/${BRANCHE_MEDIA}/${chemin}`;
/** SHA-1 « blob » de Git : permet de reconnaître un fichier déjà présent sans le télécharger. */
export const shaBlobGit = (buf) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');

/** @param {{token:string, depot:string, fetchImpl?:Function}} o  @returns {{publier:Function}} */
export function mediaGithub({ token, depot, fetchImpl = globalThis.fetch }) {
  if (!token) throw new Error('jeton GitHub absent');
  if (!RE_DEPOT.test(String(depot))) throw new Error('dépôt GitHub invalide');
  const purge = (s) => String(s ?? '').split(token).join('***').slice(0, 200);
  const api = (chemin, init = {}) => fetchImpl(`https://api.github.com/repos/${depot}${chemin}`, {
    ...init, signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sny-relais-instagram', 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const json = async (r) => { try { return await r.json(); } catch { return {}; } };

  /** Crée la branche orpheline si elle n'existe pas (un commit racine portant un README). Jamais de réécriture d'une branche existante. */
  async function assurerBranche() {
    const r = await api(`/git/ref/heads/${BRANCHE_MEDIA}`);
    if (r.status === 200) return;
    if (r.status !== 404) throw new Error(`lecture de la branche média impossible (HTTP ${r.status})`);
    const lire = async (rep, nom) => { if (!rep.ok) throw new Error(`création de la branche média : ${nom} refusé (HTTP ${rep.status} ${purge((await json(rep)).message)})`); return json(rep); };
    const blob = await lire(await api('/git/blobs', { method: 'POST', body: JSON.stringify({ content: '# Visuels Instagram de SNY\n\nBranche alimentée automatiquement par le relais social (scripts/lib/media-github.mjs). Images adressées par leur contenu : ne jamais réécrire cette branche.\n', encoding: 'utf-8' }) }), 'blob');
    const arbre = await lire(await api('/git/trees', { method: 'POST', body: JSON.stringify({ tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blob.sha }] }) }), 'arbre');
    const commit = await lire(await api('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'instagram-media : branche des visuels (racine)', tree: arbre.sha, parents: [] }) }), 'commit');
    const ref = await api('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCHE_MEDIA}`, sha: commit.sha }) });
    if (!ref.ok && ref.status !== 422) await lire(ref, 'référence'); // 422 = créée entre-temps par un autre passage
  }

  return {
    /** @returns {Promise<{url:string}>} throws Error */
    async publier({ chemin, png }) {
      if (!RE_CHEMIN.test(String(chemin))) throw new Error('chemin de média non conforme');
      if (!Buffer.isBuffer(png) || png.length < 100 || png.length > 8 * 1024 * 1024) throw new Error('image absente ou hors limites');
      await assurerBranche();
      const put = await api(`/contents/${chemin}`, { method: 'PUT', body: JSON.stringify({ message: `instagram-media : ${chemin}`, content: png.toString('base64'), branch: BRANCHE_MEDIA }) });
      if (!put.ok) {
        // Le fichier existe déjà : le chemin est celui de l'empreinte du contenu, donc c'est la même image si son identifiant Git concorde (sinon : refus, jamais d'écrasement).
        const ex = await api(`/contents/${chemin}?ref=${BRANCHE_MEDIA}`);
        const corps = ex.ok ? await json(ex) : null;
        if (!(put.status === 422 && corps?.sha === shaBlobGit(png))) throw new Error(`dépôt du média refusé (HTTP ${put.status} ${purge((await json(put)).message)})`);
      }
      return { url: urlMedia(depot, chemin) };
    },
  };
}
