#!/usr/bin/env node
// =====================================================================
// scripts/corriger-fiche-0144.mjs — rectification CIBLÉE de « Ce que l'on ne sait pas » de la fiche FR-2026-0144 (école Marcel-Touchard), sans régénération.
//
//   node scripts/corriger-fiche-0144.mjs            # plan : montre le diff, n'écrit rien
//   node scripts/corriger-fiche-0144.mjs --ecrire   # écrit data/fiches-generees/FR-2026-0144.json (local, ignoré par Git) + l'aperçu docs/ de CETTE version
//   puis : node scripts/proposer-fiche.mjs FR-2026-0144 --generee --correction --ecrire   (proposition « mise à jour » ; l'approbation reste celle d'Adrien)
//
// Pourquoi : la version approuvée dit « la suite de la procédure est inconnue » alors que l'article sweetfm lu annonce l'audience du 7 décembre (étape connue, issue
// inconnue), et rapporte à la fois une « mise en examen » et un jugement « en comparution immédiate » sans que l'un tranche. Aucun fait, aucune étape, aucune source,
// aucun état n'est modifié : seules deux lignes d'inconnues le sont. Les citations ci-dessous sont littérales dans l'article (relu en entier le 16/11/2026).
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { hashDossier } from './lib/fiche-page.mjs';
import { rendreMarkdown } from './lib/fiche-rendu.mjs';

const ID = 'FR-2026-0144';
const ECRIRE = process.argv.includes('--ecrire');
const lire = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const c = lire('data/cases.json').cases.find((x) => x.case_id === ID);
const approuve = lire('data/hub-matiere/isoles.json').dossiers[ID];
if (!c || !approuve) { console.error(`${ID} : affaire ou dossier absent`); process.exit(2); }

const ANCIENNE = /la suite de la procédure est inconnue/;
const i0 = approuve.inconnues.findIndex((x) => ANCIENNE.test(x));
if (i0 < 0) { console.error('la formulation à corriger n’est plus dans la version publique : rien à faire'); process.exit(0); }

const AUDIENCE = 'Aucun jugement sur le fond n’est rapporté par les sources lues : une audience est annoncée (voir le déroulé) ; son issue est inconnue.';
const QUALIFICATION = 'Qualification de la procédure : sweetfm emploie à la fois « mis en examen » et « déféré et jugé en comparution immédiate » (audience au lundi 7 décembre, après un délai demandé par la défense) ; les sources lues ne permettent pas de dire laquelle de ces deux qualifications décrit la procédure.';
const dossier = structuredClone(approuve);
dossier.inconnues = [...approuve.inconnues.slice(0, i0), AUDIENCE, QUALIFICATION, ...approuve.inconnues.slice(i0 + 1)];

const avant = hashDossier(approuve), apres = hashDossier(dossier);
console.log(`version publique ${avant} → version corrigée ${apres}`);
console.log('➖', approuve.inconnues[i0]); console.log('➕', AUDIENCE); console.log('➕', QUALIFICATION);
if (!ECRIRE) { console.log('(plan : rien écrit)'); process.exit(0); }

const sources = c.sources.map((s) => ({ url: s.url, media: s.media, publication_date: s.publication_date, origine: s.media === 'sweetfm' ? 'fournie' : 'memoire', acces: 'libre', pertinence: 'CETTE_AFFAIRE' }));
const generation = {
  contrat: 'correction-ciblee-inconnues-16-11', modele: 'aucun (rectification déterministe, sans appel modèle)', genere_le: '2026-11-16', qualification: 'A_REVOIR', blocages: [],
  attention: [{ niveau: 'mineur', code: 'CITATIONS_A_RELIRE', texte: 'Les citations sont reproduites telles que publiées : à relire sous l’angle de la protection des enfants et des familles.' },
    { niveau: 'mineur', code: 'DATES_NON_ECRITES', texte: '10 étape(s) sans date d’événement écrite dans la source : affichées « Date non établie » (la date de parution reste dans la référence de la source, jamais présentée comme celle de l’événement).' },
    { niveau: 'majeur', code: 'CORRECTION_INCONNUES', texte: 'Rectification ciblée de « Ce que l’on ne sait pas » (audience annoncée ≠ suite inconnue ; qualification divergente dans l’article sweetfm). Aucune étape, source, position ni état modifié.' }],
  proposition_etat: null, citations_recuperees: 0, requetes_decouverte: [], erreurs_decouverte: [], stats: { sources_pertinentes: sources.length, sources_contributrices: sources.length, etapes: dossier.deroule.length, reactions: (dossier.reactions || []).length, inconnues: dossier.inconnues.length, empreinte: apres },
  cout: { appels: 0, cache: 0, input_tokens: 0, output_tokens: 0, usd: 0 }, ecartes: [], hors_perimetre: [], trace: [],
  sources,
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
