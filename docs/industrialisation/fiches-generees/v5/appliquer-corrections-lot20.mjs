// =====================================================================
// Corrections du stock issues des 20 relectures humaines — TRACE REPRODUCTIBLE (pas un outil du circuit). Suite de v4/appliquer-corrections-lot1.mjs.
//
// Chaque version part d'une version EXACTE (empreinte de base ci-dessous, archivée dans data/fiches-generees/versions/) et n'y applique que des
// corrections prouvées : retraits d'étapes issues d'une source hors sujet, corroborations par des sources que l'éditeur a reconnues rattachées
// (extraites par le pipeline existant, mêmes gardes), reformulations. Chaque opération est consignée dans `generation.corrections`.
// Aucune écriture Neon, aucun envoi, aucune approbation : chaque dossier corrigé a une NOUVELLE empreinte.
//
//   node docs/industrialisation/fiches-generees/v5/appliquer-corrections-lot20.mjs
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lireDocument } from '../../../../scripts/lib/fiche-sources.mjs';
import { hashDossier } from '../../../../scripts/lib/fiche-page.mjs';
import { rendreMarkdown } from '../../../../scripts/lib/fiche-rendu.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '../../../../');
const GEN = join(RACINE, 'data/fiches-generees/');
const VERS = join(GEN, 'versions/');
const cases = JSON.parse(readFileSync(join(RACINE, 'data/cases.json'), 'utf8')).cases;
const ORIGINE = 'relecture humaine des 20 fiches (22-23/10/2026)';
const norm = (s) => String(s).replace(/[’‘]/g, "'").replace(/[«»“”]/g, '"').replace(/\s+/g, ' ').toLowerCase();
const OLD_APPEL = 'Aucun des articles consultés ne dit si la décision a été contestée ni si elle est définitive : SNY la présente comme non définitive.';
const NEW_APPEL = 'Appel et caractère définitif non documentés : aucun des articles consultés ne dit si la décision a été contestée ni si elle est définitive.';

const pages = new Map();
async function verifier(url, citations) {
  if (!pages.has(url)) pages.set(url, norm((await lireDocument(url)).corps || ''));
  const t = pages.get(url);
  if (!t) throw new Error(`article illisible : ${url}`);
  for (const c of citations) if (!t.includes(norm(c))) throw new Error(`citation absente de ${url} : « ${c} »`);
}

/** Version de base : archive versions/<ID>.<hash>.json (idempotent), sinon fichier de repli dont l'empreinte DOIT être celle attendue. */
function charger(id, hash, repli = join(GEN, `${id}.json`)) {
  mkdirSync(VERS, { recursive: true });
  const archive = join(VERS, `${id}.${hash}.json`);
  if (!existsSync(archive)) {
    const j = JSON.parse(readFileSync(repli, 'utf8'));
    if (hashDossier(j.dossier) !== hash) throw new Error(`${id} : la base ${repli} a l'empreinte ${hashDossier(j.dossier)}, attendue ${hash}`);
    copyFileSync(repli, archive);
  }
  const j = JSON.parse(readFileSync(archive, 'utf8'));
  return { j, d: structuredClone(j.dossier), g: structuredClone(j.generation), avant: hash, corrections: [], preuves: [] };
}
const evt = (x) => ({ date: null, date_nature: 'article', acteur: null, ...x });
const note = (c, o) => c.corrections.push({ ...o, origine: ORIGINE });
function retirerSource(c, predSource, motif, nouvellePertinence = 'HORS_SUJET') {
  const hors = (s) => predSource(s);
  let retirees = 0;
  for (const e of [...c.d.deroule]) {
    const sources = [e.source, ...(e.sources_complementaires || [])];
    const restantes = sources.filter((s) => !hors(s));
    if (restantes.length === sources.length) continue;
    if (!restantes.length) { c.d.deroule = c.d.deroule.filter((x) => x !== e); retirees++; note(c, { operation: 'retrait_etape', cible: e.texte, motif }); continue; }
    e.source = restantes[0]; e.sources_complementaires = restantes.slice(1); if (!e.sources_complementaires.length) delete e.sources_complementaires;
    note(c, { operation: 'retrait_source_complementaire', cible: e.texte, motif });
  }
  for (const r of [...c.d.reactions]) if (hors(r.source)) { c.d.reactions = c.d.reactions.filter((x) => x !== r); note(c, { operation: 'retrait_reaction', cible: `${r.acteur} — « ${r.citations[0].texte} »`, motif }); }
  for (const s of c.g.sources) if (hors({ url: s.url, media: s.media })) { s.pertinence = nouvellePertinence; delete s.ecarte; s.raison = motif; }
  return retirees;
}
/** Corrobore les étapes de la base par les sources `medias` d'une régénération (même type et même date écrite, ou textes très proches). */
function corroborer(c, regen, medias, nomsSources) {
  const jet = (s) => new Set(norm(s).replace(/^selon [^,]{1,60}, /, '').split(/[^a-zà-ÿ0-9]+/).filter((t) => t.length > 3).map((t) => t.slice(0, 5)));
  const jac = (a, b) => { const A = jet(a), B = jet(b); let i = 0; for (const x of A) if (B.has(x)) i++; return A.size && B.size ? i / (A.size + B.size - i) : 0; };
  let n = 0;
  for (const r of regen.dossier.deroule) {
    const sr = [r.source, ...(r.sources_complementaires || [])].filter((s) => medias.includes(s.media));
    if (!sr.length) continue;
    const cible = c.d.deroule.find((e) => e.type === r.type && ((e.date && e.date === r.date && e.date_nature === 'evenement') || jac(e.texte, r.texte) >= 0.5));
    if (!cible) continue;
    for (const s of sr) if (![cible.source, ...(cible.sources_complementaires || [])].some((x) => x.url === s.url)) {
      cible.sources_complementaires = [...(cible.sources_complementaires || []), s]; n++;
      const idx = regen.dossier.deroule.indexOf(r);
      const cit = (regen.generation.trace.find((t) => t.ref === `deroule[${idx}]`)?.preuves || []).find((p) => p.url === s.url)?.citation ?? null;
      note(c, { operation: 'corroboration', cible: cible.texte, apres: `+ ${s.media}`, motif: 'Source reconnue rattachée par l’éditeur, lue par le pipeline (mêmes gardes) : même fait.', preuves: [{ media: s.media, url: s.url, citation: cit }] });
    }
  }
  for (const s of regen.generation.sources) if (nomsSources.includes(s.media) && !c.g.sources.some((x) => x.url === s.url)) c.g.sources.push({ ...s, origine: 'fournie', raison: 'Rattachement reconnu par l’éditeur (relecture) ; lue et extraite par le pipeline existant.' });
  else if (nomsSources.includes(s.media)) { const x = c.g.sources.find((y) => y.url === s.url); Object.assign(x, { origine: 'fournie', pertinence: s.pertinence, acces: s.acces, raison: s.raison, ecarte: undefined }); delete x.ecarte; }
  return n;
}
function recalculer(c) {
  const cit = new Set();
  for (const e of c.d.deroule) { cit.add(e.source?.url); (e.sources_complementaires || []).forEach((s) => cit.add(s.url)); }
  for (const r of c.d.reactions || []) cit.add(r.source?.url);
  const utiles = c.g.sources.filter((s) => s.acces === 'libre' && s.pertinence === 'CETTE_AFFAIRE' && cit.has(s.url));
  const medias = [...new Set(utiles.map((s) => s.media))];
  c.d.inconnues = c.d.inconnues.map((x) => (/^Le dossier ne repose que sur \d+ article/.test(x) ? `Le dossier ne repose que sur ${utiles.length} article${utiles.length > 1 ? 's' : ''} lu${utiles.length > 1 ? 's' : ''} (${medias.join(', ')}).` : x));
  const sansDate = c.d.deroule.filter((e) => e.date_nature === 'article').length;
  for (const a of c.g.attention) if (a.code === 'DATES_NON_ECRITES') a.texte = a.texte.replace(/^\d+ étape\(s\)/, `${sansDate} étape(s)`);
  c.g.attention = c.g.attention.filter((a) => !(a.code === 'SOURCE_UNIQUE' && utiles.length > 1));
  c.g.stats = { ...c.g.stats, sources_pertinentes: utiles.length, sources_contributrices: utiles.length, etapes: c.d.deroule.length, reactions: (c.d.reactions || []).length, inconnues: c.d.inconnues.length };
}
/** Reformulation générale « appel / caractère définitif non documentés » (plus de « présentée comme non définitive » par défaut). */
function reformulerAppel(c) {
  const s = JSON.stringify(c.d);
  if (!s.includes(OLD_APPEL.replace(/"/g, '\\"'))) return false;
  c.d = JSON.parse(s.split(OLD_APPEL).join(NEW_APPEL));
  note(c, { operation: 'reformulation', cible: OLD_APPEL, apres: NEW_APPEL, motif: 'Sans information sur un appel, la fiche ne présente plus la condamnation comme non définitive : elle dit que l’information n’est pas documentée.' });
  return true;
}
function ecrire(c, id, { qualification } = {}) {
  recalculer(c);
  const apres = hashDossier(c.d);
  if (apres === c.avant) { console.log(`· ${id} : aucune modification (empreinte inchangée ${apres})`); return null; }
  if (qualification) c.g.qualification = qualification;
  c.g.version_precedente = { empreinte: c.avant, qualification: c.j.generation.qualification };
  c.g.corrections = [...(c.j.generation.corrections || []), ...c.corrections];
  c.g.corrige_le = '2026-10-23';
  c.g.stats.empreinte = apres;
  c.g.trace = [...c.g.trace, ...c.preuves];
  const carte = cases.find((x) => x.case_id === id);
  writeFileSync(join(GEN, `${id}.json`), JSON.stringify({ version: 'fiche-generee-1', case_id: id, dossier: c.d, generation: c.g }, null, 2));
  writeFileSync(join(GEN, `${id}.revue.md`), rendreMarkdown({ c: carte, dossier: c.d, generation: c.g }, { complet: true }));
  const rendu = rendreMarkdown({ c: carte, dossier: c.d, generation: c.g }, { complet: false });
  writeFileSync(join(GEN, `${id}.public.md`), rendu);
  writeFileSync(join(ICI, `${id}.md`), rendu);
  console.log(`✓ ${id} : ${c.avant} → ${apres} · ${c.corrections.length} correction(s) · ${c.g.qualification}`);
  return apres;
}

// =====================================================================
const regen = (id) => JSON.parse(readFileSync(join(RACINE, `.cache/sortie-v5b/${id}.json`), 'utf8'));
const CORRECTIONS = {
  // ---- Annonay : deux sources « utilisées » sans rapport (actualité du lycée) ; nature des faits dite honnêtement
  async 'FR-2026-0043'() {
    const c = charger('FR-2026-0043', 'afba7bb178861d20');
    const n = c.g.sources.filter((s) => /2026\/09\/04\/le-lycee-saint-denis|classement-des-lycees/.test(s.url)).length;
    if (n !== 2) throw new Error('0043 : sources attendues');
    retirerSource(c, (s) => /2026\/09\/04\/le-lycee-saint-denis|classement-des-lycees/.test(s.url), 'Actualité du lycée (rentrée 2026 ; palmarès) : même nom d’établissement, aucun rapport avec l’affaire. Aucune étape ni réaction n’en provenait.');
    for (const s of c.g.sources.filter((s) => /2026\/10\/18\/rotary|angela-davis/.test(s.url))) { s.pertinence = 'HORS_SUJET'; delete s.ecarte; s.raison = 'Actualité de la ville / du nom du lycée : hors sujet.'; }
    const ici = c.d.deroule.find((e) => e.source.media === 'Ici').source.url;
    await verifier(ici, ['téléchargeait des images pédopornographiques sur son ordinateur, en dehors de l\'établissement scolaire']);
    c.d.faits = 'Selon Ici, l\'enseignant, qui enseignait auprès d\'élèves en BTS, a été condamné pour avoir téléchargé des images pédopornographiques sur son ordinateur, en dehors de l\'établissement scolaire. ' + c.d.faits.split(' Selon Le Dauphiné Libéré, l\'enseignant téléchargeait')[0];
    note(c, { operation: 'reformulation', cible: 'faits publiquement rapportés', motif: 'Affaire à la frontière du périmètre : la nature des faits (détention de fichiers, hors de l’établissement) est dite d’emblée ; aucun fait commis sur un élève n’est rapporté. Catégorisation éventuelle réservée à l’éditeur.', preuves: [{ media: 'Ici', url: ici, citation: 'téléchargeait des images pédopornographiques sur son ordinateur, en dehors de l\'établissement scolaire' }] });
    c.d.inconnues.unshift('Périmètre : les sources lues ne rapportent aucun fait commis sur un élève de l’établissement ; la condamnation porte sur le téléchargement d’images pédopornographiques hors de l’établissement. Catégorisation de la fiche : décision éditoriale.');
    reformulerAppel(c);
    ecrire(c, 'FR-2026-0043');
  },

  // ---- Saint-Gaudens : un article sur une autre affaire du même lycée alimentait 3 étapes ; BFMTV reconnu rattaché
  async 'FR-2026-0030'() {
    const c = charger('FR-2026-0030', 'e00891c50069b9f0');
    retirerSource(c, (s) => /ladepeche\.fr\/2026\/07\/06\/lycee-bagatelle-les-communistes/.test(s.url), 'Article sur une autre affaire du même lycée (sanctions contre un enseignant, propos homophobes et racistes ; prises de position politiques) : aucun lien avec les faits jugés ici.');
    c.g.attention = c.g.attention.filter((a) => a.code !== 'REPROCHE_A_UNE_INSTITUTION');
    c.corrections.push({ operation: 'attention_retiree', cible: 'REPROCHE_A_UNE_INSTITUTION', motif: 'Le seul reproche à une institution (« aucun signalement ») venait de l’article hors sujet.', origine: ORIGINE });
    for (const x of c.g.sources.filter((x) => x.url.includes('ladepeche.fr/2026/10/14/lecole-fabrique'))) { x.pertinence = 'HORS_SUJET'; x.raison = 'Article sur la vie d’une école (« fabrique de l’amitié ») : hors sujet.'; }
    c.g.attention = c.g.attention.filter((a) => a.code !== 'DOC_IDENTITE_AMBIGUE');
    c.corrections.push({ operation: 'attention_retiree', cible: 'DOC_IDENTITE_AMBIGUE', motif: 'Le document ambigu (La Dépêche, 13 octobre 2026) est un article hors sujet, désormais classé comme tel.', origine: ORIGINE });
    const n = corroborer(c, regen('FR-2026-0030'), ['BFMTV'], ['BFMTV']);
    if (!n) throw new Error('0030 : aucune corroboration BFMTV');
    reformulerAppel(c);
    ecrire(c, 'FR-2026-0030');
  },

  // ---- Boulard : la source « Wikipédia » est en réalité France Culture (Radio France)
  async 'FR-2026-0008'() {
    const c = charger('FR-2026-0008', '3230d301346dcfee');
    const wp = c.g.sources.find((s) => s.media === 'Wikipédia');
    if (!/radiofrance\.fr\/franceculture/.test(wp.url)) throw new Error('0008 : URL inattendue');
    const page = await lireDocument(wp.url);
    if (!/France Culture/.test(page.corps)) throw new Error('0008 : la page n’est pas France Culture');
    const s = JSON.stringify({ d: c.d, src: c.g.sources }).split('Wikipédia').join('France Culture');
    const o = JSON.parse(s); c.d = o.d; c.g.sources = o.src;
    for (const t of c.g.trace) { t.texte = String(t.texte).split('Wikipédia').join('France Culture'); for (const p of t.preuves || []) if (p.media === 'Wikipédia') p.media = 'France Culture'; }
    note(c, { operation: 'provenance', cible: 'media « Wikipédia »', apres: 'France Culture (Radio France)', motif: 'L’URL est un article de France Culture (Radio France) ; la mention « Wikipédia » est une erreur d’étiquette de la mémoire (à corriger côté source de données).', preuves: [{ media: 'France Culture', url: wp.url, citation: 'France Culture' }] });
    for (const x of c.g.sources.filter((x) => /paris\.fr\/pages\/dans-le-14e/.test(x.url))) { x.pertinence = 'HORS_SUJET'; x.raison = 'Page de la Ville de Paris sur le chauffage d’une école du 14e : hors sujet.'; }
    reformulerAppel(c);
    ecrire(c, 'FR-2026-0008');
  },

  // ---- Morières : jours divergents d'un même mois → mois ; presse nationale en source principale quand elle corrobore
  async 'FR-2026-0119'() {
    const c = charger('FR-2026-0119', 'a4cd40da505e3220');
    const i = c.d.deroule.findIndex((e) => e.type === 'plainte' && e.date === '2026-06-10');
    if (i < 0) throw new Error('0119 : plainte attendue');
    const e = c.d.deroule[i];
    note(c, { operation: 'date_au_mois', cible: e.texte, apres: 'juin 2026 (vers)', motif: 'Sources concordantes sur le fait, jours divergents (10 / 21 juin) : date affichée au mois (règle du moteur DATE_AU_MOIS).' });
    e.date = '2026-06'; e.date_nature = 'approximative';
    c.d.inconnues = c.d.inconnues.filter((x) => !/Divergence entre sources — plainte/.test(x));
    c.g.attention = c.g.attention.filter((a) => a.code !== 'DIVERGENCE_ENTRE_SOURCES');
    c.g.attention.unshift({ niveau: 'mineur', code: 'DATE_AU_MOIS', texte: 'plainte : jours divergents selon les sources (10 / 21 juin 2026) : date affichée au mois.' });
    for (const st of c.d.deroule) {
      if (st.source.media !== "L'Alsace.fr") continue;
      const nat = (st.sources_complementaires || []).find((s) => s.media === 'Le Parisien');
      if (!nat) continue;
      st.sources_complementaires = [...st.sources_complementaires.filter((s) => s !== nat), st.source]; st.source = nat;
      st.texte = st.texte.replace("Selon L'Alsace.fr,", 'Selon Le Parisien,');
      note(c, { operation: 'source_principale', cible: st.texte, apres: 'Le Parisien (presse nationale) ; L’Alsace.fr en complément', motif: 'Plusieurs sources concordent : la source principale est la presse nationale ou locale concernée, pas un quotidien d’une autre région qui reprend l’affaire.' });
    }
    reformulerAppel(c);
    ecrire(c, 'FR-2026-0119');
  },

  // ---- Saint-Valéry : « appel non documenté » ≠ « non définitif »
  async 'FR-2026-0045'() {
    const c = charger('FR-2026-0045', '94512e13f4f8b9cb');
    if (!reformulerAppel(c)) throw new Error('0045 : phrase d’appel absente');
    ecrire(c, 'FR-2026-0045');
  },

  // ---- Saint-Jean-de-Passy : la version « appel annoncé » corroborée par les trois sources reconnues rattachées
  async 'FR-2026-0012'() {
    mkdirSync(VERS, { recursive: true });
    const relue = join(VERS, 'FR-2026-0012.c0463bb37a56ab7f.json');
    if (!existsSync(relue) && hashDossier(JSON.parse(readFileSync(join(GEN, 'FR-2026-0012.json'), 'utf8')).dossier) === 'c0463bb37a56ab7f') copyFileSync(join(GEN, 'FR-2026-0012.json'), relue);
    const c = charger('FR-2026-0012', 'af070d82b0235729', join(RACINE, '.cache/sortie-v3/FR-2026-0012.json'));
    const n = corroborer(c, regen('FR-2026-0012'), ['BFMTV', 'Le Figaro', 'Marianne'], ['BFMTV', 'Le Figaro', 'Marianne']);
    if (!n) throw new Error('0012 : aucune corroboration');
    // Équilibre : la version relue portait la réaction de l'avocat de la défense, perdue dans la régénération v3. Rétablie telle quelle (même extrait, même source).
    const yak = JSON.parse(readFileSync(join(VERS, 'FR-2026-0012.c0463bb37a56ab7f.json'), 'utf8')).dossier.reactions.find((r) => /Yakouti/.test(r.acteur));
    if (!yak) throw new Error('0012 : réaction de la défense introuvable dans la version relue');
    await verifier(yak.source.url, [yak.citations[0].texte.slice(0, 60)]);
    if (!c.d.reactions.some((r) => /Yakouti/.test(r.acteur))) {
      c.d.reactions.push(yak);
      note(c, { operation: 'ajout_reaction', cible: `${yak.acteur} — « ${yak.citations[0].texte} »`, motif: 'Réaction de la défense présente dans la version relue, perdue à la régénération : rétablie pour l’équilibre (même extrait, même source).', preuves: [{ media: yak.source.media, url: yak.source.url, citation: yak.citations[0].texte }] });
    }
    for (const s of c.g.sources.filter((s) => /lemonde\.fr|lepoint\.fr/.test(s.url))) {
      if (/lepoint/.test(s.url)) { s.pertinence = 'HORS_SUJET'; s.raison = 'Article immobilier sur les « bonnes écoles » (Le Point) : hors sujet ; inaccessible (403).'; }
    }
    ecrire(c, 'FR-2026-0012');
  },

  // ---- Pontoise : date de la mise en examen (26 janvier, pas le 14 février = date de révélation) ; procédure distincte sur Stanislas
  async 'FR-2026-0025'() {
    const c = charger('FR-2026-0025', '4dfa78f7161d3105');
    const EU = { media: 'Europe 1', url: 'https://www.europe1.fr/Police-Justice/stanislas-un-ancien-maitre-dinternat-juge-en-septembre-pour-des-violences-contre-six-eleves-4231027', publie_le: null, acces: 'libre' };
    const mee = c.d.deroule.find((e) => e.type === 'mise_en_examen');
    await verifier(mee.source.url, ['a appris franceinfo, mercredi 14 février']);
    await verifier(EU.url, ['a été mis en examen le 26 janvier dans une autre affaire', 'au sein de l\'internat Saint-Martin-De-France de Pontoise', 'Placé "sous contrôle judiciaire"']);
    note(c, { operation: 'date', cible: `mise en examen · ${mee.date}`, apres: 'janvier 2024 (26 janvier selon l’AFP)', motif: 'Le 14 février est la date à laquelle franceinfo a appris la mise en examen, pas celle de l’acte : l’AFP (Europe 1) écrit « mis en examen le 26 janvier ».', preuves: [{ media: 'France info', url: mee.source.url, citation: 'a appris franceinfo, mercredi 14 février, de source proche du dossier' }, { media: 'Europe 1', url: EU.url, citation: 'a été mis en examen le 26 janvier dans une autre affaire' }] });
    mee.date = '2024-01'; mee.date_nature = 'approximative'; mee.sources_complementaires = [EU];
    // Arbitrage éditorial (24/10/2026) : la fiche raconte l'affaire de PONTOISE ; le parcours ultérieur de la personne (Stanislas) n'occupe pas le déroulé.
    const SANS_STAN = (t) => t.split(' du collège-lycée privé Stanislas').join('');
    const linfo = c.d.deroule.find((e) => e.source.media === 'Linfo.re');
    await verifier(linfo.source.url, ['jeune de 17 ans qui était sous sa responsabilité à l’internat Saint-Martin-de-France']);
    await verifier(EU.url, ['pour des faits commis entre le 30 juin et le 1er juillet 2001 au sein de l\'internat Saint-Martin-De-France de Pontoise', 'l\'interdiction d\'entrer en contact avec la victime']);
    await verifier(mee.source.url, ['où est instruite l’affaire']);
    const avantFaits = linfo.texte;
    linfo.texte = 'Selon Linfo.re, l\'homme est poursuivi pour viol et agression sexuelle par personne abusant de sa fonction, pour des faits qui se seraient déroulés les 30 juin et 1er juillet 2001 à Pontoise (Val-d\'Oise), la victime étant un jeune de 17 ans sous sa responsabilité à l\'internat Saint-Martin-de-France.';
    linfo.sources_complementaires = [EU];
    note(c, { operation: 'reformulation', cible: avantFaits, apres: linfo.texte, motif: 'Le « aussi poursuivi » renvoyait au parcours de Stanislas : le fait de 2001 est énoncé pour lui-même, corroboré par l’AFP (Europe 1).', preuves: [{ media: 'Europe 1', url: EU.url, citation: 'pour des faits commis entre le 30 juin et le 1er juillet 2001 au sein de l\'internat Saint-Martin-De-France de Pontoise' }] });
    mee.texte = 'Selon franceinfo, un ancien cadre éducatif a été mis en examen pour viol sur mineur pour des faits datant de 2001 commis dans le collège-lycée Saint-Martin de France, à Pontoise (Val-d\'Oise), et placé sous contrôle judiciaire ; l\'affaire est instruite à Valenciennes. Selon l\'AFP (Europe 1), la mise en examen date du 26 janvier et la personne a l\'interdiction d\'entrer en contact avec la victime, selon le parquet de Valenciennes. Note de contexte : selon Europe 1, la même personne devait aussi être jugée à Valenciennes pour des violences commises à Stanislas ; cette procédure est distincte et ne concerne pas les faits de Pontoise.';
    await verifier(EU.url, ['sera jugé en septembre pour des violences commises entre 2012 et 2018']);
    note(c, { operation: 'reformulation', cible: 'mise en examen (texte)', apres: mee.texte, motif: 'Établissement de la carrière ultérieure retiré de la phrase ; contrôle judiciaire précisé (interdiction de contact avec la victime) ; procédure Stanislas réduite à une note de contexte attribuée, sans condamnation.', preuves: [{ media: 'Europe 1', url: EU.url, citation: 'l\'interdiction d\'entrer en contact avec la victime' }, { media: 'Europe 1', url: EU.url, citation: 'sera jugé en septembre pour des violences commises entre 2012 et 2018' }, { media: 'France info', url: mee.source.url, citation: 'où est instruite l’affaire' }] });
    c.d.etat_actuel = c.d.etat_actuel.map(SANS_STAN);
    c.d.synthese = { ...c.d.synthese, decision: SANS_STAN(c.d.synthese.decision) };
    c.d.situation.decision.texte = SANS_STAN(c.d.situation.decision.texte);
    const faitsAvant = c.d.faits;
    c.d.faits = SANS_STAN(c.d.faits).replace(', souligne que cette mise en examen n\'a rien à voir avec Stanislas et se dit humilié et effondré', ' et se dit humilié et effondré');
    note(c, { operation: 'reformulation', cible: 'faits publiquement rapportés / situation', apres: c.d.faits, motif: 'Arbitrage éditorial : la fiche raconte l’affaire de Pontoise ; l’emploi ultérieur de la personne à Stanislas n’est plus dans la situation ni dans les faits.', preuves: [{ media: 'France info', url: mee.source.url, citation: 'nie avec fermeté l\'accusation de viol' }] });
    void faitsAvant;
    await verifier(mee.source.url, ['nie avec fermeté l\'accusation de viol']);
    c.d.situation.decision.meta = 'Mise en examen fin janvier 2024 (26 janvier selon l’AFP), révélée le 14 février 2024 par franceinfo · pour des faits datant de 2001 à Pontoise';
    ajouterSource(c, EU, 'Source ajoutée (recherche ciblée) : AFP via Europe 1, 2024 — date de la mise en examen, contrôle judiciaire, parquet de Valenciennes.');
    reformulerAppel(c);
    // Arbitrage éditorial (24/10/2026) : trois articles pertinents et rattachés = matière suffisante ; pas de recherche exhaustive supplémentaire. La réserve « matière faible » est levée.
    note(c, { operation: 'qualification', cible: 'À REVOIR (matière faible, v5 précédente)', apres: 'READY', motif: 'Arbitrage de l’éditeur : l’affaire a sa place dans SNY et trois articles correctement rattachés constituent une matière suffisante. Ce n’est PAS une approbation de l’empreinte.' });
    ecrire(c, 'FR-2026-0025', { qualification: 'READY' });
  },
};
function ajouterSource(c, s, raison) { if (!c.g.sources.some((x) => x.url === s.url)) c.g.sources.push({ url: s.url, media: s.media, publication_date: s.publie_le ?? null, origine: 'fournie', acces: 'libre', pertinence: 'CETTE_AFFAIRE', raison }); }

// Reformulation générale sur les autres fiches des 20 qui portent la phrase (aucune autre correction)
const demandees = process.argv.slice(2);
for (const [id, f] of Object.entries(CORRECTIONS)) if (!demandees.length || demandees.includes(id)) await f();
// Reformulation générale sur les autres fiches des 20 qui portent encore la phrase (aucune autre correction)
const AUTRES = ['FR-2026-0038', 'FR-2026-0139', 'FR-2026-0006', 'FR-2026-0028', 'FR-2026-0123', 'FR-2026-0046', 'POC-02', 'FR-2026-0036', 'FR-2026-0027', 'FR-2026-0115', 'FR-2026-0035', 'PARIS-007'];
if (!demandees.length) for (const id of AUTRES) {
  const j = JSON.parse(readFileSync(join(GEN, `${id}.json`), 'utf8'));
  if (!JSON.stringify(j.dossier).includes(OLD_APPEL.replace(/"/g, '\\"'))) continue;
  const c = charger(id, hashDossier(j.dossier));
  reformulerAppel(c);
  ecrire(c, id);
}
