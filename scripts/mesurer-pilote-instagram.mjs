// =====================================================================
// scripts/mesurer-pilote-instagram.mjs — mesure HORS LIGNE du pilote Instagram, sur des publications DÉJÀ LUES (aucun appel Meta, aucun jeton, aucune base).
//
// Rejoue, dans le parcours existant `parcourirSources`, l'export local des lectures réelles (data/preuves-business-discovery/export-publications.json,
// ignoré par Git) comme s'il venait de Business Discovery, page de 10, avec le BUDGET du pilote. Deux cycles successifs, mémoire de fichier temporaire.
// Ce n'est PAS une mesure d'appels réels : les appels comptés ici sont ceux que le pilote aurait faits sur ces données rejouées.
//
// Sortie : un résumé sans légende (compteurs, destinations, affaires rattachées, passages probants) ; `--detail` ajoute, par publication, date, permalien et destination.
// Usage : node scripts/mesurer-pilote-instagram.mjs [--export <fichier>] [--budget 4] [--detail]
// =====================================================================
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerRegistre, parcourirSources, memoireFichier, passages, aliasOrganismes, zonePertinente } from './lib/sources-suivies.mjs';
import { lireComptes } from './lib/veille-instagram.mjs';
import { chargerAlias, enrichirFiches } from './lib/alias-etablissements.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = process.argv.slice(2);
const val = (k) => (A.includes(k) ? A[A.indexOf(k) + 1] : null);
const fichier = resolve(val('--export') || join(ROOT, 'data', 'preuves-business-discovery', 'export-publications.json'));
const budget = Number(val('--budget') || 4);
if (!existsSync(fichier)) { console.error('export introuvable : lancer d\'abord la sonde (lectures réelles) ou passer --export'); process.exit(1); }

const posts = JSON.parse(readFileSync(fichier, 'utf8')).publications;
const registre = chargerRegistre(join(ROOT, 'data', 'associations-watchlist.json'));
const brut = JSON.parse(readFileSync(join(ROOT, 'data', 'cases.json'), 'utf8'));
const fiches = enrichirFiches(Array.isArray(brut) ? brut : (brut.cases || brut.affaires), chargerAlias(join(ROOT, 'data', 'alias-etablissements.json')));
const alias = aliasOrganismes(registre.organismes);
const parCas = new Map(fiches.map((f) => [f.case_id, f]));

// Rejeu : chaque compte renvoie ses publications par pages de 10 (ordre de date décroissant), curseur tant qu'il en reste.
const parCompte = (pseudo) => posts.filter((p) => p.auteur === pseudo).sort((a, b) => String(b.publie_le).localeCompare(String(a.publie_le)));
const appeler = async (pseudo, apres) => {
  const tous = parCompte(pseudo); const debut = apres ? Number(apres) : 0; const page = tous.slice(debut, debut + 10);
  const suite = debut + 10 < tous.length ? String(debut + 10) : null;
  const corps = { business_discovery: { username: pseudo, media_count: tous.length, media: { data: page.map((p) => ({ id: p.id_post, caption: p.legende ?? undefined, timestamp: p.publie_le, permalink: p.url, media_type: p.type_media })), ...(suite ? { paging: { cursors: { after: suite } } } : {}) } } };
  return { classe: { statut: suite ? 'partiel' : 'succes' }, corps, http: 200 };
};

const dossier = mkdtempSync(join(tmpdir(), 'sny-mesure-ig-'));
const memoire = memoireFichier(join(dossier, 'memoire.json'));
const lireInstagram = ({ comptes, connu, maintenant }) => lireComptes({ comptes, connu, appeler, budget, collecteLe: maintenant });
const resume = [];
try {
  for (const [i, maintenant] of ['2026-11-23T20:00:00.000Z', '2026-11-24T08:00:00.000Z'].entries()) {
    const { pages, docs, instagram } = await parcourirSources({ registre, memoire, fiches, lire: async () => ({ ok: false, motif: 'HORS_LIGNE' }), lireRss: async () => ({ ok: false, items: [] }), maintenant, lireInstagram });
    const dest = {}; const issues = {}; const affaires = []; let avecPassage = 0;
    for (const d of docs) {
      dest[d.destination || '∅'] = (dest[d.destination || '∅'] || 0) + 1; issues[d.issue] = (issues[d.issue] || 0) + 1;
      if (d.destination === 'AFFAIRE') for (const id of d.case_ids) {
        const ps = passages(d.zone || d.doc.corps, parCas.get(id), { alias: [], sansTitre: true });
        if (ps.length) avecPassage++;
        affaires.push({ url: d.url, case_id: id, publie_le: d.publie_le, passages_probants: ps.length });
      }
      memoire.noterSucces({ doc_key: `suivie|${d.url}`, titre: '', raw_url: d.url, resolution_method: `SOURCE_SUIVIE/${d.destination || 'INDEX'}`, content_fingerprint: d.empreinte, maintenant, case_ids: d.case_ids || [] });
    }
    for (const p of pages.filter((x) => x.type === 'instagram')) memoire.noterSucces({ doc_key: `suivie|${p.url}`, titre: '', raw_url: p.url, resolution_method: 'SOURCE_SUIVIE/INDEX', content_fingerprint: p.empreinte, maintenant, case_ids: [] });
    resume.push({ cycle: i + 1, appels_pilote: instagram?.appels, budget: instagram?.budget, comptes: instagram?.comptes, documents: docs.length, par_issue: issues, par_destination: dest, rattachees_a_une_affaire: affaires.length, avec_passage_nommant_l_affaire: avecPassage, detail_rattachements: affaires });
    if (A.includes('--detail')) for (const d of docs) console.log(`  cycle ${i + 1} · ${String(d.publie_le).slice(0, 10)} · ${d.destination} · ${(d.case_ids || []).join(',') || '—'} · ${d.url}`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
console.log(JSON.stringify({ source: 'rejeu hors ligne de lectures réelles (aucun appel Meta)', export: fichier.replace(ROOT, '.'), publications_rejouees: posts.length, resume }, null, 1));
