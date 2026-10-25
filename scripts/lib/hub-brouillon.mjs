// =====================================================================
// scripts/lib/hub-brouillon.mjs — la préparation d'un Hub : de la proposition Telegram au DOSSIER DE REVUE consultable. Fonctions PURES.
//
//   proposition (diagnostic-territoire) → payloadProposition → clic « PRÉPARER LE HUB » → composerBrouillonHub → dossier Markdown versionné
//
// PRÉPARER ≠ PUBLIER. Le dossier est un brouillon de revue (docs/industrialisation/hub-drafts/<territoire>.md) : aucune page du site, aucune
// route, aucune écriture dans `cases`. Il ne vaut ni approbation ni GO ; la publication reste un acte distinct, sur l'empreinte du dossier.
// Tout est DÉRIVÉ de l'artefact public (affaires publiques et leurs sources) et des événements validés : rien n'est saisi à la main, aucune
// affaire non publique n'y figure, aucun média payant n'est cité (décision verrouillée), aucun nom, aucun nombre d'enfants.
// =====================================================================
import { createHash } from 'node:crypto';
import { checkCase, deriveCounters } from '../qa/lib/rules.mjs';
import { projectCase, projectSource, assertNoInternalFields } from './public-projection.mjs';

export const MEDIAS_PAYANTS = ['Mediapart', 'Libération'];
export const BASE_BROUILLONS = 'https://github.com/06adretn11/sousnosyeux/blob/main/docs/industrialisation/hub-drafts';
export const CHEMIN_BROUILLON = (slug) => `docs/industrialisation/hub-drafts/${slug}.md`;
export const urlBrouillon = (slug) => `${BASE_BROUILLONS}/${slug}.md`;

const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const empreinte = (v) => createHash('sha256').update(JSON.stringify(canon(v))).digest('hex').slice(0, 16);
const jj = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : 'date non établie');
const cellule = (s) => String(s ?? '—').replace(/\|/g, '/').replace(/\s+/g, ' ');

/** Nom de fichier sûr (jamais un chemin) : minuscules, sans accent, [a-z0-9-]. */
export const slugTerritoire = (nom) => String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Charge de la proposition « nouveau Hub » (new_case_proposals.payload). Dérivée du diagnostic ; `ids` = affaires publiques du territoire.
 * La clé de dédoublonnage change seulement si le PÉRIMÈTRE change (une affaire publique de plus) : un rejeu ne crée jamais un second message.
 */
export function payloadProposition(nom, e, d) {
  const slug = slugTerritoire(e._dep || nom);
  const ids = [...e.publiques].sort();
  return {
    payload: {
      version: 'proposition-hub-1', commune: e._dep || nom, etablissement: null,
      hub: { territoire: e._dep || nom, slug, departement: e._dep || null, publiques: ids, evenements: e.evenements, reactions: e.reactions, sources: e.sources,
        avecMatiere: e.avecMatiere ?? 0, pourquoi: d.pourquoi },
    },
    cle: `hub|${slug}|${empreinte(ids)}`,
  };
}

/**
 * Dossier de revue d'un Hub territorial.
 * @param {{slug:string, titre:string, departement:string}} territoire
 * @param {object[]} cases       affaires PUBLIQUES du territoire (artefact public : data/cases.json), avec leurs sources
 * @param {{case_id:string, type:string, date:string|null, libelle:string, realisation:string|null, source:{media:string,url:string,publication_date:string|null}|null}[]} evenements  événements validés
 * @returns {{slug:string, hash:string, markdown:string, compteurs:object, bloquants:object[], alertes:object[]}}
 */
export function composerBrouillonHub({ territoire, cases, evenements = [], genere_le }) {
  if (!/^[a-z0-9-]+$/.test(territoire?.slug || '')) throw new Error('territoire : identifiant de fichier invalide');
  if (!cases.length) throw new Error('aucune affaire publique dans ce territoire : rien à préparer');
  const affaires = cases.map((c) => ({ ...projectCase(c), sources: (c.sources || []).map(projectSource).filter((s) => !MEDIAS_PAYANTS.includes(s.media)) }));
  const ids = new Set(affaires.map((a) => a.case_id));
  const evs = evenements.filter((x) => ids.has(x.case_id) && !(x.source && MEDIAS_PAYANTS.includes(x.source.media)));
  const compteurs = deriveCounters(cases);
  const findings = cases.flatMap((c) => checkCase(c, new Date(genere_le)));
  const bloquants = findings.filter((f) => f.severity === 'bloquant');
  const alertes = findings.filter((f) => f.severity === 'alerte');
  const parId = new Map(affaires.map((a) => [a.case_id, a]));

  // --- ce que le territoire montre et que les fiches isolées ne montrent pas ---------------------------------------
  const sources = affaires.flatMap((a) => a.sources);
  const datesSrc = sources.map((s) => String(s.publication_date || '').slice(0, 10)).filter(Boolean).sort();
  const medias = [...new Set(sources.map((s) => s.media))];
  const reponses = evs.filter((x) => ['suspension', 'réponse_institutionnelle', 'mobilisation'].includes(x.type));
  const chrono = [
    ...affaires.filter((a) => a.etat?.date).map((a) => ({ date: a.etat.date, quoi: `État de l'affaire : ${a.etat.statut}${a.etat.finalite ? ` (${a.etat.finalite})` : ''}`, case_id: a.case_id, source: (a.etat.sources || [])[0] || null })),
    ...evs.map((x) => ({ date: x.date, quoi: x.libelle, case_id: x.case_id, source: x.source })),
  ];
  const datees = chrono.filter((x) => x.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const sansDate = chrono.filter((x) => !x.date);
  const lien = (s) => (s?.url ? `${cellule(s.media)} (${jj(s.publication_date)}) — ${s.url}` : 'source non rattachée à l’événement dans la mémoire');

  const noyau = { territoire, affaires: affaires.map((a) => ({ ...a, sources: a.sources.map((s) => s.url).sort() })), evenements: evs.map((x) => ({ ...x, source: x.source?.url ?? null })) };
  assertNoInternalFields(noyau, `brouillon de Hub ${territoire.slug}`);
  const hash = empreinte(noyau);

  const L = [];
  L.push(`# Dossier de revue — Hub « ${territoire.titre} »`, '');
  L.push('> ⛔ **BROUILLON — aucune publication.** Préparé depuis la proposition Telegram « PRÉPARER LE HUB ». Aucune page du site n’est créée ni modifiée ; ce dossier ne vaut ni approbation ni GO de publication.', '');
  L.push('| | |', '|---|---|', `| Territoire | ${territoire.titre}${territoire.departement ? ` (département : ${territoire.departement})` : ''} |`, `| Généré le | ${genere_le} |`,
    `| Empreinte du dossier | \`${hash}\` |`, `| Publiable en l’état | ${bloquants.length ? `❌ non — ${bloquants.length} contrôle(s) bloquant(s)` : '❌ non — aucune page de Hub n’existe pour ce territoire ; la publication est un acte distinct'} |`, '');

  L.push('## Ce que le Hub apporte au-delà des fiches individuelles', '');
  L.push(`- **Périmètre** : ${affaires.length} affaire(s) publique(s) dans ${new Set(affaires.map((a) => a.commune)).size} commune(s) — ${[...new Set(affaires.map((a) => a.commune))].join(', ')}. Ce brouillon ne postule aucun lien entre les affaires : elles ne sont réunies que par le territoire.`);
  L.push(`- **Structures et rôles** : ${[...new Set(affaires.map((a) => a.type_structure))].join(', ')} · ${[...new Set(affaires.map((a) => a.role_mis_en_cause))].join(', ')}.`);
  L.push(`- **Où en sont les affaires** : ${Object.entries(compteurs.par_statut).map(([k, v]) => `${v} × ${k}`).join(' · ')}.`);
  L.push(`- **Couverture** : ${sources.length} source(s) de presse, ${medias.length} média(s) distinct(s)${datesSrc.length ? `, publiées du ${jj(datesSrc[0])} au ${jj(datesSrc[datesSrc.length - 1])}` : ''}.`);
  L.push(`- **Réponses publiques et mobilisations documentées** : ${reponses.length ? `${reponses.length} (voir ci-dessous)` : 'aucune dans la mémoire à ce jour'}.`, '');

  L.push('## Les affaires du territoire', '', '| `case_id` | Établissement | Commune | Structure · rôle | État judiciaire | Sources | Dernière source |', '|---|---|---|---|---|---|---|');
  for (const a of affaires) {
    const d = a.sources.map((s) => String(s.publication_date || '').slice(0, 10)).filter(Boolean).sort().pop();
    L.push(`| \`${a.case_id}\` | ${cellule(a.etablissement)} | ${cellule(a.commune)} | ${cellule(a.type_structure)} · ${cellule(a.role_mis_en_cause)} | ${cellule(a.statut_judiciaire)} | ${a.sources.length} | ${jj(d)} |`);
  }
  L.push('', '## Chronologie du territoire', '');
  if (!datees.length) L.push('Aucun événement daté dans la mémoire : la chronologie ne peut pas être établie sans nouvelle source.');
  for (const x of datees) L.push(`- **${jj(x.date)}** — ${cellule(x.quoi)} (\`${x.case_id}\`, ${cellule(parId.get(x.case_id)?.commune)})  \n  ${lien(x.source)}`);
  if (sansDate.length) {
    L.push('', '**Sans date établie** (la date de publication d’un article n’est pas la date du fait) :');
    for (const x of sansDate) L.push(`- ${cellule(x.quoi)} (\`${x.case_id}\`)  \n  ${lien(x.source)}`);
  }
  // Lecture croisée des affaires : QUAND la presse en parle (dates de PUBLICATION, jamais des dates de faits). Aucune fiche isolée ne la donne.
  const parMois = new Map();
  for (const a of affaires) for (const s of a.sources) {
    const m = String(s.publication_date || '').slice(0, 7);
    if (!m) continue;
    parMois.set(m, { ...(parMois.get(m) || {}), [a.commune]: ((parMois.get(m) || {})[a.commune] || 0) + 1 });
  }
  L.push('', '## Couverture de presse dans le temps', '', '_Dates de publication des articles, pas dates des faits._', '');
  for (const [m, parCommune] of [...parMois].sort(([x], [y]) => x.localeCompare(y))) L.push(`- **${m.split('-').reverse().join('/')}** : ${Object.entries(parCommune).map(([c, n]) => `${c} (${n} article${n > 1 ? 's' : ''})`).join(' · ')}`);
  L.push('', '## Réponses publiques et mobilisations', '');
  if (!reponses.length) L.push('Aucune réponse institutionnelle ni mobilisation validée pour ce territoire.');
  for (const x of reponses) L.push(`- ${cellule(x.libelle)}${x.realisation ? ` (${x.realisation})` : ''} — \`${x.case_id}\`  \n  ${lien(x.source)}`);

  L.push('', '## Sources par affaire', '');
  for (const a of affaires) {
    L.push(`**\`${a.case_id}\` — ${cellule(a.etablissement)}**`);
    for (const s of [...a.sources].sort((x, y) => String(x.publication_date).localeCompare(String(y.publication_date)))) L.push(`- ${cellule(s.media)} (${jj(s.publication_date)}) — ${s.url}`);
    L.push('');
  }

  L.push('## À établir avant toute publication', '');
  const aEtablir = [
    ...(sansDate.length ? [`${sansDate.length} information(s) sans date d’événement établie`] : []),
    ...(evs.some((x) => !x.source) ? ['au moins un événement sans source rattachée dans la mémoire'] : []),
    ...affaires.filter((a) => /non définitive|mise en examen|procès|plainte|enquête/.test(a.statut_judiciaire)).map((a) => `\`${a.case_id}\` : état « ${a.statut_judiciaire} » — l’issue et son caractère définitif ne sont pas établis`),
    ...(compteurs.derniere_verif ? [] : ['aucune date de vérification humaine portée par les fiches']),
  ];
  for (const x of aEtablir.length ? aEtablir : ['rien de signalé par les contrôles automatiques (cela ne remplace pas la relecture)']) L.push(`- ${x}`);

  L.push('', '## Contrôles automatiques', '');
  if (!findings.length) L.push('Aucun constat.');
  else { L.push('| Sévérité | Règle | Affaire | Constat |', '|---|---|---|---|'); for (const f of findings) L.push(`| ${f.severity === 'bloquant' ? '🔴' : '🟠'} ${f.severity} | \`${f.rule}\` | \`${f.case_id}\` | ${cellule(f.message)} |`); }

  L.push('', '## Décision', '', '- [ ] Chaque affirmation relue sur la source citée', '- [ ] Aucune information interdite (nom, âge, nombre exact d’enfants, détail des faits)', '- [ ] L’apport territorial est réel (pas un simple cumul de fiches)', `- [ ] Approbation portant sur l’empreinte \`${hash}\``, '',
    '_Ce dossier est un brouillon. Une page de Hub n’existera qu’après ta validation explicite, sur cette empreinte._', '');
  return { slug: territoire.slug, hash, markdown: L.join('\n'), compteurs, bloquants, alertes };
}
