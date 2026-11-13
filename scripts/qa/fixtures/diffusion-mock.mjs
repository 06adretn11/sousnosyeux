// =====================================================================
// scripts/qa/fixtures/diffusion-mock.mjs — préchargement (node --import) pour exécuter le VRAI scripts/diffuser-social.mjs sans réseau ni base :
//   · Neon (HTTP)        → mini base en mémoire (reviews, cases, propositions, journal de diffusion), état persisté dans SNY_TEST_STATE ;
//   · api.buffer.com     → faux Buffer (createPost / post / posts / deletePost / channels), état persisté dans le même fichier ;
//   · sousnosyeux.org    → page d'accueil fabriquée depuis data/cases.json (JSON `#cases-data`), fiches approuvées : 404 ;
//   · api.telegram.org   → enregistre les alertes ;
//   · Date               → figée à SNY_TEST_NOW.
// Test seulement : jamais importé par du code de production. Tout appel sortant autre que ceux-là est REFUSÉ (aucune publication réelle possible).
// =====================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ETAT = process.env.SNY_TEST_STATE;
const SCEN = JSON.parse(process.env.SNY_TEST_SCENARIO || '{}');
const RealDate = Date;
const FIXE = process.env.SNY_TEST_NOW ? new RealDate(process.env.SNY_TEST_NOW).getTime() : null;
if (FIXE) {
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(FIXE); }
    static now() { return FIXE; }
  };
}

const etat = () => (existsSync(ETAT) ? JSON.parse(readFileSync(ETAT, 'utf8')) : { ledger: [], posts: [], telegram: [], appels: [] });
const sauve = (e) => writeFileSync(ETAT, JSON.stringify(e));
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

// --- Neon -----------------------------------------------------------------------------------------------------------------------------------
const pgDate = (d) => new RealDate(d).toISOString().replace('T', ' ').replace('Z', '+00');
function reponse(rows) {
  const noms = rows.length ? Object.keys(rows[0]) : [];
  const type = (v) => (v instanceof RealDate || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && v.endsWith('Z')) ? 1184 : typeof v === 'number' ? 23 : typeof v === 'boolean' ? 16 : 25);
  const brut = (v) => (v === null || v === undefined ? null : v instanceof RealDate || type(v) === 1184 ? pgDate(v) : typeof v === 'boolean' ? (v ? 't' : 'f') : String(v));
  return json({ command: 'SELECT', rowCount: rows.length, rows: rows.map((r) => noms.map((n) => brut(r[n]))), fields: noms.map((n) => ({ name: n, dataTypeID: type(rows[0][n]) })), rowAsArray: true });
}
function neon(corps) {
  const { query: q, params: p = [] } = JSON.parse(corps);
  const e = etat();
  const L = e.ledger;
  if (/to_regclass/.test(q)) return reponse([{ ok: !SCEN.sansJournal }]);
  if (/from relais_social_config/.test(q)) return reponse(SCEN.t0 ? [{ t0: SCEN.t0, mode: 'review', provenance: 'test' }] : []);
  if (/select distinct case_id from reviews/.test(q)) return reponse((SCEN.revues || []).map((r) => ({ case_id: r.case_id })).filter((v, i, a) => a.findIndex((x) => x.case_id === v.case_id) === i));
  if (/from cases where case_id = any/.test(q) && /select case_id, publication_status/.test(q)) return reponse((SCEN.cases || []).map((c) => ({ case_id: c.case_id, ps: SCEN.statutNeon?.[c.case_id] || c.ps })));
  if (/select case_id, reviewed_by/.test(q)) return reponse(SCEN.revues || []);
  if (/from telegram_envois/.test(q)) return reponse(SCEN.envoi ? [{ sent_at: SCEN.envoi }] : []);
  if (/from state_proposals p join cases/.test(q)) return reponse(SCEN.evolutions || []);
  if (/select \* from diffusions_sociales where event_key/.test(q)) return reponse(L.filter((r) => r.event_key === p[0] && r.canal === p[1]));
  if (/insert into diffusions_sociales/.test(q)) {
    if (L.some((r) => r.event_key === p[0] && r.canal === p[1])) return reponse([]);
    L.push({ event_key: p[0], canal: p[1], type_event: p[2], case_id: p[3], etat: 'reserve', texte: p[4], buffer_post_id: null, soumis_at: null, envoye_at: null, permalien: null, erreur: null, created_at: new RealDate(FIXE || Date.now()).toISOString() });
    sauve(e); return reponse([{ event_key: p[0] }]);
  }
  if (/update diffusions_sociales set/.test(q)) {
    const r = L.find((x) => x.event_key === p[6] && x.canal === p[7]);
    if (r) { const [et, bid, so, en, pl, er] = p; if (et) r.etat = et; if (bid) r.buffer_post_id = bid; if (so) r.soumis_at = so; if (en) r.envoye_at = en; if (pl) r.permalien = pl; if (er) r.erreur = er; sauve(e); }
    return reponse([]);
  }
  if (/select \* from diffusions_sociales where etat in/.test(q)) return reponse(L.filter((r) => ['reserve', 'soumis', 'programme', 'envoye', 'verifie'].includes(r.etat)));
  if (/select c\.case_id, c\.publication_status/.test(q)) return reponse([...new Set(L.map((r) => r.case_id))].map((id) => ({ case_id: id, ps: SCEN.statutNeon?.[id] || 'publiée', retire: false })));
  return reponse([]);
}

// --- Buffer ---------------------------------------------------------------------------------------------------------------------------------
function buffer(corps) {
  const { query: q, variables: v } = JSON.parse(corps);
  const e = etat();
  e.appels.push(q.match(/createPost|deletePost|posts\(|post\(|channels|organizations/)?.[0]); sauve(e);
  if (SCEN.bufferEnPanne) return json({}, 503);
  if (/createPost/.test(q)) {
    if (SCEN.refus?.includes(v.input.channelId)) return json({ data: { createPost: { __typename: 'MutationError', message: 'canal verrouillé' } } });
    const post = { id: `bp${e.posts.length + 1}`, status: 'scheduled', text: v.input.text, channelId: v.input.channelId, dueAt: v.input.dueAt, externalLink: null, schedulingType: v.input.schedulingType, mode: v.input.mode };
    e.posts.push(post); sauve(e);
    return json({ data: { createPost: { __typename: 'PostActionSuccess', post } } });
  }
  if (/deletePost/.test(q)) {
    if (e.posts.find((p) => p.id === v.input.id)?.status === 'sent') return json({ data: { deletePost: { __typename: 'VoidMutationError', message: 'post déjà publié' } } });
    e.posts = e.posts.filter((p) => p.id !== v.input.id); sauve(e); return json({ data: { deletePost: { __typename: 'DeletePostSuccess' } } });
  }
  if (/posts\(/.test(q)) return json({ data: { posts: { edges: e.posts.map((node) => ({ node })) } } });
  if (/post\(/.test(q)) return json({ data: { post: e.posts.find((p) => p.id === v.input.id) || null } });
  if (/channels/.test(q)) return json({ data: { channels: [] } });
  return json({ errors: [{ message: 'requête inconnue du faux Buffer' }] }, 400);
}

// --- site ------------------------------------------------------------------------------------------------------------------------------------
function accueil() {
  const cases = JSON.parse(readFileSync(new URL('../../../data/cases.json', import.meta.url), 'utf8')).cases;
  const servies = cases.map((c) => ({ case_id: c.case_id, statut_judiciaire: SCEN.siteStatut?.[c.case_id] ?? c.statut_judiciaire, source_url: c.sources?.[0]?.url ?? '', etat: c.etat ?? null }));
  return new Response(`<html><script id="cases-data" type="application/json">${JSON.stringify(servies)}</script></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
}

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (/\/sql$/.test(u)) return neon(opts.body);
  if (u.startsWith('https://api.buffer.com')) return buffer(opts.body);
  if (u.startsWith('https://sousnosyeux.org/affaires/')) return new Response('', { status: 404 });
  if (u.startsWith('https://sousnosyeux.org/')) return accueil();
  if (u.startsWith('https://api.telegram.org/')) { const e = etat(); e.telegram.push(JSON.parse(opts.body).text); sauve(e); return json({ ok: true, result: {} }); }
  throw new Error(`appel sortant refusé par le test : ${u.slice(0, 60)}`);
};
