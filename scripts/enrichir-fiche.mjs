#!/usr/bin/env node
// =====================================================================
// scripts/enrichir-fiche.mjs — enrichit la fiche APPROUVÉE d'une affaire avec une matière RÉDIGÉE (étapes de chronologie + bloc « Acteur de terrain »),
// puis prépare la version candidate d'une MISE À JOUR de fiche (la proposition Telegram reste un clic de l'éditeur ; rien n'est publié ici).
//
//   node scripts/enrichir-fiche.mjs FR-2026-0048            # plan : valide et montre ce qui serait ajouté, n'écrit rien
//   node scripts/enrichir-fiche.mjs FR-2026-0048 --ecrire   # écrit data/fiches-generees/<ID>.json (local, ignoré par Git) + l'aperçu docs/ de CETTE version
//   puis : node scripts/proposer-fiche.mjs FR-2026-0048 --generee --ecrire   (proposition « MISE À JOUR » ; l'approbation reste celle de l'éditeur)
//
// Matière : data/fiches-enrichissements/<ID>.json (versionnée, publique par nature : c'est ce qui sera affiché).
//   { case_id, base_hash, redige_le, motif, deroule_ajouts: [étape…], acteurs_de_terrain: [acteur…] }
// Garde-fous : la matière s'applique à UNE version approuvée précise (base_hash) ; si le dossier approuvé a changé, REFUS (jamais d'écrasement) ;
// étapes et acteurs sont validés (sources https, dates, pas de nom de personne ni de nombre d'enfants dans le bloc) ; aucun modèle n'est appelé.
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dossierFiche } from './lib/fiche-page.mjs';
import { composerEnrichissement } from './lib/enrichissement.mjs';
import { rendreMarkdown } from './lib/fiche-rendu.mjs';
import { sourcesActeurs, compterPoints } from './lib/acteurs-terrain.mjs';

const A = process.argv.slice(2);
const ID = A.find((a) => /^(?:[A-Z]+-\d{4}-\d{4}|POC-\d+)$/.test(a));
const ECRIRE = A.includes('--ecrire');
if (!ID) { console.error('usage : enrichir-fiche.mjs <FR-AAAA-NNNN> [--ecrire]'); process.exit(2); }

const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const refus = (m) => { console.error(`REFUS : ${m}`); process.exit(2); };

let patch;
try { patch = lire(`data/fiches-enrichissements/${ID}.json`); } catch { refus(`aucune matière d'enrichissement pour ${ID} (data/fiches-enrichissements/${ID}.json)`); }
if (patch.case_id !== ID) refus('case_id de la matière différent de l’affaire demandée');

const approuve = dossierFiche(ID);
const c = lire('data/cases.json').cases.find((x) => x.case_id === ID);
if (!approuve || !c) refus(`${ID} : dossier approuvé ou affaire publique absent`);
if (lire('data/publication-holds.json').holds.some((h) => h.case_id === ID)) refus(`${ID} est sous HOLD`);
const comp = composerEnrichissement({ approuve, patch });
if (!comp.ok) refus(comp.refus.length > 1 ? `matière non conforme :\n  · ${comp.refus.join('\n  · ')}` : comp.refus[0]);
const { dossier, ajouts, base, apres } = comp;
console.log(`${ID} — version approuvée ${base} → version candidate ${apres}`);
console.log(`  + ${ajouts.length} étape(s) de chronologie · bloc « Acteur de terrain » : ${(patch.acteurs_de_terrain || []).length} acteur(s), ${compterPoints(patch.acteurs_de_terrain)} point(s)`);
if (apres === base) { console.log('  rien à ajouter : la version approuvée porte déjà cette matière'); process.exit(0); }
if (!ECRIRE) { console.log('(plan : rien écrit)'); process.exit(0); }

const sources = [
  ...(c.sources || []).map((s) => ({ url: s.url, media: s.media, publication_date: s.publication_date, origine: 'memoire', acces: 'libre', pertinence: 'CETTE_AFFAIRE' })),
  ...sourcesActeurs(patch.acteurs_de_terrain).map((s) => ({ url: s.url, media: s.media, publication_date: s.d, origine: 'fournie', acces: 'libre', pertinence: 'CETTE_AFFAIRE' })),
].filter((s, i, t) => t.findIndex((x) => x.url === s.url) === i);
const generation = {
  contrat: 'enrichissement-redige-1', modele: 'aucun (matière rédigée et attribuée, sans appel modèle)', genere_le: patch.redige_le, qualification: 'A_REVOIR', blocages: [],
  attention: [
    { niveau: 'majeur', code: 'ENRICHISSEMENT_REDIGE', texte: 'Matière rédigée (sans modèle) à partir de deux documents du collectif Stop Tabou Pédo : étapes « rencontre » et « courrier » + bloc « Acteur de terrain ». Les propos sont attribués au collectif et jamais présentés comme des faits ; aucune étape, source de presse, état ni décision judiciaire n’est modifié.' },
    { niveau: 'mineur', code: 'DOCUMENTS_D_ACTEUR', texte: 'Les documents du collectif ne sont pas des sources de presse : ils ne sont ni rattachés à la mémoire de l’affaire ni ajoutés aux sources de la carte.' },
  ],
  proposition_etat: null, citations_recuperees: 0, requetes_decouverte: [], erreurs_decouverte: [],
  stats: { sources_pertinentes: sources.length, sources_contributrices: sources.length, etapes: dossier.deroule.length, reactions: (dossier.reactions || []).length, inconnues: (dossier.inconnues || []).length, empreinte: apres },
  cout: { appels: 0, cache: 0, input_tokens: 0, output_tokens: 0, usd: 0 }, ecartes: [], hors_perimetre: [], trace: [], sources,
};
const sortie = new URL('../data/fiches-generees/', import.meta.url);
mkdirSync(sortie, { recursive: true });
writeFileSync(new URL(`${ID}.json`, sortie), JSON.stringify({ version: 'fiche-generee-1', case_id: ID, dossier, generation }, null, 2));
const rendu = rendreMarkdown({ c, dossier, generation }, { complet: false });
const docs = new URL('../docs/industrialisation/fiches-generees/', import.meta.url);
mkdirSync(new URL('versions/', docs), { recursive: true });
writeFileSync(new URL(`${ID}.md`, docs), rendu);
writeFileSync(new URL(`versions/${ID}-${apres}.md`, docs), rendu);
console.log(`écrit : data/fiches-generees/${ID}.json (local) · docs/industrialisation/fiches-generees/versions/${ID}-${apres}.md`);
