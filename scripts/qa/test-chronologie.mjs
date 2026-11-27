// =====================================================================
// scripts/qa/test-chronologie.mjs — repère temporel et ordre chronologique des fiches (Déroulé, Paroles et réactions, Sources).
//
//   1. Tests ciblés de scripts/lib/chronologie.mjs : précision des dates, repli sur la date de PUBLICATION (jamais présentée
//      comme date d'événement), absence honnête de date, tri croissant stable, aucune perte d'élément.
//   2. Contrôle de COUVERTURE sur tout le corpus écrit (data/hub-matiere, data/hub-approuve) : aucune étape dotée d'une date de
//      publication ne retombe sur « Date non établie » ; aucune date « article » n'est lue comme date d'événement ; le tri est
//      une permutation sans perte, croissante, sans date en dernier. Les cas encore non datables sont LISTÉS (exceptions justifiées).
//   3. Avec `--dist <dossier>` : contrôle du HTML RÉELLEMENT produit (fiches /affaires/*/ et hubs) : ordre des repères de
//      chaque Déroulé, des Paroles et des Sources, libellés. `--dist` accepte aussi une URL de base (site servi) via `--site`.
//
// Usage : node scripts/qa/test-chronologie.mjs [--dist web/dist] [--site https://sousnosyeux.org]
// =====================================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyserDate, dateFr, cleDate, repere, trierChrono, trierSources, trierParCle, appliquerRelectures, publicationCorrigee, correspondEtape, correspondParole, defautsRelectureEtape } from '../lib/chronologie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let ko = 0, ok = 0;
const t = (nom, fn) => { try { fn(); ok++; console.log(`  ✅ ${nom}`); } catch (e) { ko++; console.log(`  ❌ ${nom}\n     ${String(e.message).split('\n')[0]}`); } };
const src = (publie_le) => ({ media: 'Sud Ouest', url: 'https://exemple.test/a', publie_le });

console.log('1. Règle de datation et de tri');
t('date d’événement : jour, mois, année — à leur précision réelle, sans jour fictif', () => {
  assert.equal(repere({ date: '2026-07-06', date_nature: 'evenement' }).libelle, '6 juillet 2026');
  assert.equal(repere({ date: '2026-07', date_nature: 'evenement' }).libelle, 'Juillet 2026');
  assert.equal(repere({ date: '2025', date_nature: 'evenement' }).libelle, '2025');
  assert.equal(repere({ date: '2026-07', date_nature: 'approximative' }).libelle, 'Vers juillet 2026');
  assert.equal(repere({ date: '2026-07-06', date_nature: 'evenement' }).nature, 'evenement');
  assert.equal(repere({ date: '2026-07-06', date_nature: 'evenement' }).sansDateEvenement, false);
});
t('sans date d’événement : repli sur la publication de la source citée, libellé explicite, nature « information »', () => {
  const r = repere({ date: null, date_nature: 'article', source: src('2026-09-24') });
  assert.equal(r.libelle, 'Information datée du 24 septembre 2026');
  assert.equal(r.nature, 'information'); assert.equal(r.sansDateEvenement, true); assert.equal(r.date, '2026-09-24');
  assert.equal(repere({ date: null, date_nature: 'inconnue', source: src('2026-09') }).libelle, 'Information datée de septembre 2026');
  assert.equal(repere({ date: null, source: src('2026') }).libelle, 'Information datée de 2026');
});
t('une date marquée « article » est une date de PARUTION : jamais lue comme date d’événement', () => {
  const r = repere({ date: '2026-02-20', date_nature: 'article', source: src('2026-02-20') });
  assert.equal(r.nature, 'information'); assert.match(r.libelle, /^Information datée du 20 février 2026$/);
  const sansPub = repere({ date: '2026-02-20', date_nature: 'article' }); // pas de source : la date « article » reste une information, pas un fait
  assert.equal(sansPub.nature, 'information');
});
t('prise de parole : « Propos rapportés dans un article de … » ; date de parole établie → cette date', () => {
  assert.equal(repere({ date: null, date_nature: 'article', source: src('2026-10-07') }, { parole: true }).libelle, 'Propos rapportés dans un article du 7 octobre 2026');
  assert.equal(repere({ date: null, source: src('2026-09') }, { parole: true }).libelle, 'Propos rapportés dans un article de septembre 2026');
  assert.equal(repere({ date: '2026-09-22', date_nature: 'evenement', source: src('2026-09-24') }, { parole: true }).libelle, '22 septembre 2026');
});
t('aucune date exploitable : mention honnête, classée en dernier', () => {
  for (const e of [{}, { date: null, date_nature: 'article' }, { date: 'bientôt', source: { publie_le: 'hier' } }, { date: '2026-13-01', date_nature: 'evenement', source: {} }, { date: '2026-02-30', date_nature: 'evenement' }]) {
    const r = repere(e); assert.equal(r.libelle, 'Date non établie', JSON.stringify(e)); assert.equal(r.cle, null); assert.equal(r.nature, 'aucune');
  }
});
t('le texte n’est jamais lu pour y trouver une date : une mesure ANNONCÉE pour une date future reste datée de l’information', () => {
  const r = repere({ date: null, date_nature: 'article', texte: 'Mesure annoncée : réunion annoncée pour le mercredi 15 juillet 2026.', source: src('2026-07-09') });
  assert.equal(r.nature, 'information'); assert.equal(r.date, '2026-07-09');
});
t('les références complémentaires (« Aussi ») ne datent pas l’élément : seule la source citée compte', () => {
  const r = repere({ date: null, date_nature: 'article', source: src('2026-09-04'), sources_complementaires: [{ publie_le: '2026-02-11' }] });
  assert.equal(r.date, '2026-09-04');
});
t('clé de classement : une date partielle se classe au début de sa période, sans jour fictif affiché', () => {
  assert.equal(cleDate('2026-07'), '2026-07-00'); assert.equal(cleDate('2026'), '2026-00-00'); assert.equal(cleDate('2026-07-06'), '2026-07-06');
  assert.equal(cleDate('n’importe quoi'), null); assert.equal(dateFr('2026-07'), 'juillet 2026'); assert.equal(analyserDate('2026-07').precision, 'mois');
});
t('tri chronologique ASCENDANT, stable, sans date en dernier, sans perte ni mutation', () => {
  const a = { id: 'a', date: '2026-09-22', date_nature: 'evenement' };
  const b = { id: 'b', date: null, date_nature: 'article', source: src('2026-07-09') };
  const c = { id: 'c', date: '2026-07', date_nature: 'approximative' };
  const d = { id: 'd', date: null, date_nature: 'inconnue' };
  const e = { id: 'e', date: '2026-07-06', date_nature: 'evenement' };
  const f = { id: 'f', date: null, date_nature: 'article', source: src('2026-07-09') }; // égalité avec b : ordre d'écriture
  const g = { id: 'g' };
  const entree = [a, b, c, d, e, f, g]; const copie = [...entree];
  const sortie = trierChrono(entree);
  assert.deepEqual(sortie.map((x) => x.id), ['c', 'e', 'b', 'f', 'a', 'd', 'g']);
  assert.deepEqual(entree, copie, 'le tableau d’entrée n’est pas modifié');
  assert.equal(sortie.length, entree.length); assert.ok(entree.every((x) => sortie.includes(x)), 'aucun élément perdu');
  assert.deepEqual(trierChrono(sortie).map((x) => x.id), sortie.map((x) => x.id), 'idempotent');
});
t('sources : publication ascendante, sans date en dernier, ex æquo conservés dans l’ordre', () => {
  const l = [{ n: 1, d: '2026-10-07' }, { n: 2, d: null }, { n: 3, d: '2026-07-06' }, { n: 4, d: '2026-10-07' }, { n: 5, d: '2026-07' }];
  assert.deepEqual(trierSources(l, (s) => s.d).map((s) => s.n), [5, 3, 1, 4, 2]);
  assert.deepEqual(trierParCle([], () => null), []);
});

console.log('1 bis. Relectures documentées (source antérieure, date explicite, parution corrigée)');
t('repère_source : une source antérieure date l’information, le texte reste attribué à la source citée', () => {
  const e = { texte: 'Selon TF1 Info, X.', date: null, date_nature: 'article', source: src('2026-02-12'), repere_source: { media: '20 Minutes', url: 'https://exemple.test/b', publie_le: '2026-02-11' } };
  const r = repere(e); assert.equal(r.libelle, 'Information datée du 11 février 2026'); assert.equal(r.sourceRepere.media, '20 Minutes'); assert.equal(e.source.publie_le, '2026-02-12');
  assert.equal(repere({ ...e, repere_source: { publie_le: 'n’importe quoi' } }).date, '2026-02-12', 'repère_source invalide ignoré');
});
t('appliquerRelectures : étape (repère ou date explicite), parole, parution corrigée — sans modifier l’original, sans effet hors correspondance', () => {
  const table = { reperes: [{ case_id: 'X', texte: 'Selon A, le fait un', repere_source: { media: 'B', url: 'https://b', publie_le: '2026-01-01' } }, { case_id: 'X', texte: 'Selon A, le fait deux', date: '2026-03', date_nature: 'evenement' }, { case_id: 'AUTRE', texte: 'Selon A, le fait un', date: '2020-01-01' }],
    paroles: [{ case_id: 'X', acteur: 'Maire', cle: 'la mesure', date: '2026-04-21', date_nature: 'evenement' }], publications: [{ url: 'https://a/1', publie_le: '2026-11-16' }] };
  const d = { deroule: [{ texte: 'Selon A, le fait un.', date: null, date_nature: 'article', source: { url: 'https://a/1', publie_le: '2026-11-15' } }, { texte: 'Selon A, le fait deux.', date: null, date_nature: 'article', source: src('2026-05-05') }, { texte: 'Autre.', source: src('2026-05-06') }],
    reactions: [{ acteur: 'Maire', a_propos: 'la mesure prise', date: null, date_nature: 'article', source: src('2026-05-07') }] };
  const copie = JSON.stringify(d); const o = appliquerRelectures('X', d, table);
  assert.equal(JSON.stringify(d), copie, 'original intact');
  assert.equal(o.deroule[0].repere_source.publie_le, '2026-01-01'); assert.equal(o.deroule[0].source.publie_le, '2026-11-16', 'parution corrigée');
  assert.equal(o.deroule[1].date, '2026-03'); assert.equal(repere(o.deroule[1]).libelle, 'Mars 2026');
  assert.equal(o.deroule[2].date, undefined, 'étape sans correspondance : inchangée'); assert.equal(o.reactions[0].date, '2026-04-21');
  assert.equal(publicationCorrigee(table, 'https://a/1', 'x'), '2026-11-16'); assert.equal(publicationCorrigee(table, 'https://z', 'x'), 'x');
  assert.equal(appliquerRelectures('Y', d, { reperes: table.reperes }).deroule[0].repere_source, undefined, 'autre affaire : rien');
});

t('relecture d’étape : une date explicite IDENTIQUE à celle du dossier est redondante (pas un défaut) ; une date DIFFÉRENTE reste un défaut (écrasement silencieux)', () => {
  const r = { texte: 'Selon X, début octobre', date: '2026-10', date_nature: 'evenement', motif: 'relue' };
  assert.deepEqual(defautsRelectureEtape(r, { texte: 'Selon X, début octobre', date: '2026-10', date_nature: 'evenement', source: { publie_le: '2026-11-20' } }), [], 'même date : conforme');
  assert.deepEqual(defautsRelectureEtape(r, { texte: 'Selon X, début octobre', date: null, date_nature: 'article', source: { publie_le: '2026-11-20' } }), [], 'étape sans date d’événement : conforme');
  assert.equal(defautsRelectureEtape(r, { texte: 'Selon X, début octobre', date: '2026-09', date_nature: 'evenement', source: { publie_le: '2026-11-20' } }).length, 1, 'date différente : défaut');
  assert.equal(defautsRelectureEtape({ ...r, motif: '' }, { texte: 'x', date: null, date_nature: 'article', source: { publie_le: '2026-11-20' } }).length, 1, 'motif manquant : défaut');
});

console.log('2. Couverture sur le corpus écrit (hubs + dossiers de fiches)');
const lire = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const TABLE = lire('data/chronologie-reperes.json');
const dossiers = []; const rendus = {}; // rendus[id] = dossier tel que servi (version approuvée d'abord, sinon matière publique)
for (const dir of ['data/hub-approuve', 'data/hub-matiere']) {
  if (!fs.existsSync(path.join(ROOT, dir))) continue;
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith('.json'))) {
    const h = lire(`${dir}/${f}`);
    for (const [id, d0] of Object.entries(h.dossiers ?? {})) {
      const d = appliquerRelectures(id, d0, TABLE); // la règle s'évalue sur le rendu (relectures comprises), pas sur la donnée brute
      dossiers.push({ id, d, fichier: `${dir}/${f}` }); rendus[id] ??= d0;
    }
  }
}
// Chaque relecture documentée correspond à UN élément du dossier servi (sinon : dossier réécrit, relecture à refaire) et reste étayée par ses références.
const relecturesKo = [];
for (const r of TABLE.reperes) {
  const d = rendus[r.case_id]; const m = (d?.deroule ?? []).filter((e) => correspondEtape(e, r));
  if (m.length !== 1) { relecturesKo.push(`${r.case_id} « ${r.texte.slice(0, 40)}… » : ${m.length} correspondance(s)`); continue; }
  for (const x of defautsRelectureEtape(r, m[0])) relecturesKo.push(`${r.case_id} « ${r.texte.slice(0, 40)}… » : ${x}`);
}
for (const r of TABLE.paroles) { const d = rendus[r.case_id]; const m = [...(d?.reactions ?? []), ...(d?.paroles ?? [])].filter((p) => correspondParole(p, r)); if (m.length !== 1) relecturesKo.push(`${r.case_id} parole ${r.acteur} : ${m.length} correspondance(s)`); }
for (const r of TABLE.publications) { if (!Object.values(rendus).some((d) => JSON.stringify(d).includes(r.url))) relecturesKo.push(`publication ${r.url.slice(0, 50)} : aucune source concernée`); if (!(r.publie_le && r.stockee && r.motif)) relecturesKo.push(`publication ${r.url.slice(0, 50)} : champ manquant`); }
t(`relectures documentées (${TABLE.reperes.length} étapes, ${TABLE.paroles.length} paroles, ${TABLE.publications.length} parution) : chacune correspond à un élément du dossier servi et reste étayée`, () => assert.deepEqual(relecturesKo, []));
const stats = { dossiers: dossiers.length, etapes: 0, evenement: 0, information: 0, aucune: 0, paroles: 0, paroles_info: 0, paroles_aucune: 0 };
const exceptions = [];
const ECRIT_ARTICLE = new Set(['article', 'inconnue']);
const sansPerte = (avant, apres) => apres.length === avant.length && avant.every((x) => apres.includes(x));
const croissant = (items, opt) => { let prec = null, vu_sans = false; for (const e of items) { const k = repere(e, opt).cle; if (k === null) vu_sans = true; else { if (vu_sans) return false; if (prec !== null && k < prec) return false; prec = k; } } return true; };
const incoherences = [];
for (const { id, d, fichier } of dossiers) {
  const etapes = d.deroule ?? [];
  const paroles = [...(d.reactions ?? []), ...(d.paroles ?? [])];
  for (const e of etapes) {
    const r = repere(e); stats.etapes++;
    if (r.nature === 'evenement' || r.nature === 'approximative') stats.evenement++;
    else if (r.nature === 'information') stats.information++;
    else { stats.aucune++; exceptions.push(`${id} (${fichier.split('/').pop()}) — « ${String(e.texte).slice(0, 70)} » : ni date d'événement ni date de publication de la source citée`); }
    if (ECRIT_ARTICLE.has(e.date_nature) && (r.nature === 'evenement' || r.nature === 'approximative')) incoherences.push(`${id} : date « ${e.date_nature} » lue comme date d'événement`);
    if (r.nature === 'aucune' && analyserDate(e.source?.publie_le)) incoherences.push(`${id} : « Date non établie » alors que la source porte une publication`);
    if (r.nature === 'information' && !/^Information datée d[eu] /.test(r.libelle)) incoherences.push(`${id} : libellé de repli non explicite (${r.libelle})`);
  }
  for (const p of paroles) { const r = repere(p, { parole: true }); stats.paroles++; if (r.nature === 'information') stats.paroles_info++; if (r.nature === 'aucune') { stats.paroles_aucune++; exceptions.push(`${id} — parole « ${p.acteur} » : aucune date exploitable`); } }
  const te = trierChrono(etapes), tp = trierChrono(paroles, { parole: true });
  if (!sansPerte(etapes, te) || !sansPerte(paroles, tp)) incoherences.push(`${id} : le tri a perdu ou dupliqué un élément`);
  if (!croissant(te) || !croissant(tp, { parole: true })) incoherences.push(`${id} : tri non croissant`);
}
t(`${stats.dossiers} dossiers, ${stats.etapes} étapes : repère établi pour ${stats.evenement + stats.information} (événement ${stats.evenement}, information ${stats.information}), ${stats.aucune} sans date exploitable`, () => assert.ok(stats.etapes > 0));
t('aucune incohérence (date de parution lue comme événement, repli manquant, libellé non explicite, perte d’élément, ordre)', () => assert.deepEqual(incoherences, []));
// Une prise de parole dont NI la date des propos NI la parution de la source ne sont établies reste SANS date (jamais datée par défaut : la parution n'est pas la date des propos) :
// comme une étape du déroulé, elle est listée ci-dessous (exception justifiée), rendue « Date non établie » et placée en dernier — vérifié sur le HTML produit plus bas. Elle ne bloque plus la publication des autres affaires.
t(`paroles : ${stats.paroles} examinées, ${stats.paroles_info} datées par l’article qui les rapporte, ${stats.paroles_aucune} sans date (listées, « Date non établie », en dernier)`, () => assert.ok(stats.paroles > 0));
t('une parole sans date établie : repère « aucune », libellé explicite, jamais une date par défaut, triée après les paroles datées', () => {
  const sans = { acteur: 'A', source: { url: 'https://a.example/1', publie_le: null }, date: null, date_nature: 'article' };
  const datee = { acteur: 'B', source: { url: 'https://a.example/2', publie_le: '2026-03-10' }, date: null, date_nature: 'article' };
  const r = repere(sans, { parole: true });
  assert.equal(r.nature, 'aucune'); assert.equal(r.libelle, 'Date non établie'); assert.equal(r.cle, null); assert.equal(r.date, null);
  assert.deepEqual(trierChrono([sans, datee], { parole: true }).map((p) => p.acteur), ['B', 'A']);
});
if (exceptions.length) { console.log(`  ℹ️  ${exceptions.length} cas non datable(s) (exceptions justifiées) :`); for (const x of exceptions) console.log(`     - ${x}`); }

// 3. HTML réellement produit (build local ou site servi) ----------------------------------------------------------
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const dist = arg('--dist'); const site = arg('--site');
if (dist || site) {
  console.log(`3. HTML produit (${dist ?? site})`);
  const ids = Object.keys(lire('data/evenements.json').fiches_approuvees ?? {}).map((x) => x.toLowerCase());
  const pages = [...ids.map((id) => `/affaires/${id}/`), ...['paris-11e', 'landes', 'bordeaux-gironde', 'hautes-alpes'].map((h) => `/territoires/${h}/`)];
  const charger = async (p) => {
    if (dist) { const f = path.join(ROOT, dist, p, 'index.html'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; }
    const r = await fetch(new URL(p, site)); return r.ok ? await r.text() : null;
  };
  const att = (h, n) => [...h.matchAll(new RegExp(`${n}="([^"]*)"`, 'g'))].map((m) => m[1]);
  const defauts = []; let nbPages = 0, nbSources = 0, nbEtapes = 0, nbSansDateEv = 0, nbAucune = 0;
  const verifOrdre = (page, nom, cles) => { let prec = null, vu = false; for (const k of cles) { if (k === '') vu = true; else { if (vu || (prec !== null && k < prec)) { defauts.push(`${page} : ${nom} hors ordre chronologique (${k} après ${vu ? 'un élément sans date' : prec})`); return; } prec = k; } } };
  for (const p of pages) {
    const h = await charger(p); if (h === null) { if (p.startsWith('/affaires/')) defauts.push(`${p} : page introuvable`); continue; }
    nbPages++;
    // Un hub porte un déroulé PAR dossier (<ol class="chrono">) : l'ordre se vérifie dans chacun, pas sur la page entière.
    const li = [];
    for (const ol of h.split('<ol class="chrono"').slice(1)) {
      const lis = [...ol.split('</ol>')[0].matchAll(/<li class="[^"]*"[^>]*data-repere="([a-z]+)"[^>]*data-cle="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)];
      verifOrdre(p, 'Déroulé', lis.map((m) => m[2])); li.push(...lis);
    }
    nbEtapes += li.length;
    for (const m of li) {
      if (m[1] === 'aucune') nbAucune++; if (m[1] === 'information') nbSansDateEv++;
      if (m[1] === 'information' && !/Information datée d/.test(m[3])) defauts.push(`${p} : repère « information » sans libellé explicite`);
      if (m[1] !== 'aucune' && /Date non établie/.test(m[3])) defauts.push(`${p} : « Date non établie » alors qu’un repère existe`);
    }
    for (const m of h.matchAll(/<article class="parole c" data-repere="aucune"[^>]*>([\s\S]*?)<\/article>/g)) if (!/Date non établie/.test(m[1])) defauts.push(`${p} : parole sans date rendue sans « Date non établie »`);
    const pa = [...h.matchAll(/<article class="parole c"[^>]*data-cle="([^"]*)"/g)].map((m) => m[1]);
    verifOrdre(p, 'Paroles et réactions', pa);
    const so = [...h.matchAll(/<li data-cle="([^"]*)"[^>]*><a href/g)].map((m) => m[1]);
    if (p.startsWith('/affaires/') && so.length === 0) defauts.push(`${p} : liste de sources introuvable (contrôle d’ordre vide)`);
    nbSources += so.length;
    verifOrdre(p, 'Sources', so);
  }
  t(`${nbPages} pages lues : ${nbEtapes} étapes de déroulé et ${nbSources} références de sources (${nbSansDateEv} datées par l’information, ${nbAucune} sans date), ordre et libellés conformes`, () => { assert.ok(nbPages > 0); assert.ok(defauts.length === 0, `${defauts.length} défaut(s) : ${defauts.slice(0, 12).join(" ; ")}`); });
}

console.log(`\n${ko ? '❌' : '✅'} ${ok} contrôle(s) OK, ${ko} en échec`);
process.exit(ko ? 1 : 0);
