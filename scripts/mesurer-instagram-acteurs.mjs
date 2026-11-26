// =====================================================================
// scripts/mesurer-instagram-acteurs.mjs — MESURE de la lecture Instagram Business Discovery sur des comptes variés :
// appels nécessaires, accès réel (lisible / refusé), taille de page, pagination, rejeu, durée, consommation annoncée par Meta (en-têtes d'usage).
//
// Lecture seule côté Meta (aucune écriture, aucun message, aucun abonnement). Aucune légende n'est conservée ni affichée : seulement des compteurs, des dates, des classes d'erreur.
// Le jeton vient de .env.local (META_GRAPH_TOKEN) ou de l'environnement ; il n'est jamais affiché. Validation de certificat obligatoire.
//
// Usage : node scripts/mesurer-instagram-acteurs.mjs --env-local <fichier> --comptes pseudo1,pseudo2,… [--limite 25] [--budget 40] [--pagination pseudo] [--rejeu pseudo] [--sortie fichier.json]
// =====================================================================
import { writeFileSync } from 'node:fs';
import { construireRequete, urlAvecJeton, classerReponse, validerPseudo, masquer, validerJeton, GRAPH_VERSION_DEFAUT } from './lib/business-discovery.mjs';
import { lireJetonDansEnvLocal } from './sonde-business-discovery.mjs';

const A = process.argv.slice(2);
const opt = (nom, def = null) => { const i = A.indexOf(`--${nom}`); return i >= 0 ? A[i + 1] : def; };
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') { console.error('NODE_TLS_REJECT_UNAUTHORIZED=0 refusé'); process.exit(2); }

const comptes = String(opt('comptes', '')).split(',').map((s) => s.trim()).filter(Boolean).map(validerPseudo);
const limite = Number(opt('limite', 25));
const budget = Number(opt('budget', 40));
const pagination = new Set(String(opt('pagination', '')).split(',').filter(Boolean));
const rejeu = new Set(String(opt('rejeu', '')).split(',').filter(Boolean));
const sortie = opt('sortie');
const IG_USER_ID = opt('ig-user-id', '17841480706234777'); // compte SNY (sousnosyeux_org), identifiant public du registre
const jeton = validerJeton(process.env.META_GRAPH_TOKEN || lireJetonDansEnvLocal(opt('env-local')));

let appels = 0; const resultats = [];
async function appeler(pseudo, apres = null) {
  if (appels >= budget) throw new Error('budget de mesure atteint');
  appels++;
  const req = construireRequete({ igUserId: IG_USER_ID, pseudo, medias: true, limite, apres, version: GRAPH_VERSION_DEFAUT });
  const t0 = Date.now(); let r; let corps;
  try { r = await fetch(urlAvecJeton(req, jeton), { redirect: 'error' }); try { corps = await r.json(); } catch { corps = undefined; } }
  catch { return { http: 0, ms: Date.now() - t0, classe: classerReponse(0, undefined, { medias: true }), corps: undefined, usage: null }; }
  const usage = { app: r.headers.get('x-app-usage'), metier: r.headers.get('x-business-use-case-usage') ? 'présent' : null };
  return { http: r.status, ms: Date.now() - t0, classe: classerReponse(r.status, corps, { medias: true, suite: Boolean(apres) }), corps, usage };
}
const dates = (corps) => (corps?.business_discovery?.media?.data || []).map((m) => String(m.timestamp || '').slice(0, 10)).filter(Boolean).sort();
const ids = (corps) => (corps?.business_discovery?.media?.data || []).map((m) => m.id);
const curseur = (corps) => corps?.business_discovery?.media?.paging?.cursors?.after || null;

for (const pseudo of comptes) {
  const ligne = { compte: pseudo, pages: [] };
  const p1 = await appeler(pseudo);
  const d1 = dates(p1.corps);
  ligne.acces = p1.classe.statut; ligne.http = p1.http; ligne.code = p1.classe.code ?? null; ligne.sous_code = p1.classe.sous_code ?? null; ligne.message = p1.classe.message_meta ? masquer(p1.classe.message_meta, jeton).slice(0, 160) : null;
  ligne.media_count = p1.classe.media_count ?? p1.corps?.business_discovery?.media_count ?? null;
  ligne.pages.push({ n: ids(p1.corps).length, plus_ancien: d1[0] || null, plus_recent: d1[d1.length - 1] || null, curseur: Boolean(curseur(p1.corps)), ms: p1.ms, usage_app: p1.usage?.app || null });
  const lisible = ['succes', 'partiel'].includes(p1.classe.statut);
  if (lisible && pagination.has(pseudo) && curseur(p1.corps)) {
    const p2 = await appeler(pseudo, curseur(p1.corps)); const d2 = dates(p2.corps);
    ligne.pages.push({ n: ids(p2.corps).length, plus_ancien: d2[0] || null, plus_recent: d2[d2.length - 1] || null, curseur: Boolean(curseur(p2.corps)), ms: p2.ms, statut: p2.classe.statut, chevauche_page_1: ids(p2.corps).filter((x) => ids(p1.corps).includes(x)).length });
  }
  if (lisible && rejeu.has(pseudo)) {
    const r2 = await appeler(pseudo);
    ligne.rejeu_identique = JSON.stringify(ids(r2.corps)) === JSON.stringify(ids(p1.corps)); ligne.rejeu_statut = r2.classe.statut;
  }
  resultats.push(ligne);
  console.log(`${pseudo.padEnd(26)} accès=${ligne.acces}${ligne.code != null ? `(${ligne.code}${ligne.sous_code != null ? `/${ligne.sous_code}` : ''})` : ''} pages=${ligne.pages.map((p) => `${p.n}${p.curseur ? '+' : ''}`).join(',')} déclarées=${ligne.media_count ?? '?'} ${ligne.pages[0].plus_recent || ''}→${ligne.pages[0].plus_ancien || ''} ${ligne.pages[0].ms} ms${ligne.rejeu_identique !== undefined ? ` rejeu=${ligne.rejeu_identique ? 'identique' : 'DIFFÉRENT'}` : ''}`);
}
const synthese = { le: new Date().toISOString(), limite, appels, budget, comptes: comptes.length, lisibles: resultats.filter((r) => ['succes', 'partiel'].includes(r.acces)).length, par_acces: resultats.reduce((a, r) => ((a[r.acces] = (a[r.acces] || 0) + 1), a), {}),
  usage_app_dernier: resultats.map((r) => r.pages.at(-1)?.usage_app).filter(Boolean).at(-1) || null };
console.log(`SYNTHÈSE : ${JSON.stringify(synthese)}`);
if (sortie) writeFileSync(sortie, JSON.stringify({ synthese, resultats }, null, 1));
