#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-fait-deja-publie.mjs — un fait que la fiche publiée porte déjà n'est pas une information à décider.
//
// Cas réel (20/11/2026, FR-2026-0133, Rots) : la maintenance demandait de VALIDER « Selon la presse, l'agent concerné a été suspendu »
// alors que la fiche disait déjà (ici, 7 octobre) que l'animateur avait été suspendu le 25 septembre, et référençait déjà l'article.
// Textes ci-dessous : paraphrases synthétiques. Aucun réseau, aucune base, aucun modèle.
// =====================================================================
import { readFileSync } from 'node:fs';
import { detecterInstitutionnel } from '../lib/evenement-institutionnel.mjs';
import { etapeDejaPublie, sourceDejaReferencee, dejaPublie } from '../lib/fait-deja-publie.mjs';

let ko = 0;
const test = (nom, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}`); if (!cond) ko++; };

const A = 'https://exemple.test/article-initial', B = 'https://exemple.test/article-du-15-novembre';
const dossier = {
  deroule: [
    { date: '2026-09', date_nature: 'approximative', type: 'mesure_etablissement', acteur: 'mairie',
      texte: "Selon ici, l'animateur du centre de loisirs a été suspendu de ses fonctions le 25 septembre 2026, selon la maire.",
      source: { url: A, media: 'ici' }, sources_complementaires: [{ url: B, media: 'ici' }] },
    { date: null, date_nature: 'article', type: 'mesure_collectivite', acteur: 'mairie',
      texte: "Mesure annoncée, sans confirmation de sa réalisation dans les sources lues : selon ici, la mairie organise une réunion d'information avec les familles.",
      source: { url: A, media: 'ici' } },
    { date: '2026-09', type: 'enquete', texte: "Selon le procureur, une enquête a été ouverte.", source: { url: A, media: 'ici' } },
  ],
};

// Citation réelle du message du 20/11 (paraphrasée) : acteur « commune » + « suspendu de ses fonctions », sans date écrite.
const citation = "Fin septembre, un animateur qui exerçait au centre de loisirs de la commune, géré par une association, a été suspendu de ses fonctions.";
const inst = detecterInstitutionnel([citation]);
test('la citation du message est bien détectée comme suspension réalisée', inst?.mesure === 'suspension_agent' && inst.realisation === 'réalisée');

test('suspension déjà dans le déroulé → étape trouvée', etapeDejaPublie(dossier, { ...inst, event_date: null })?.type === 'mesure_etablissement');
test('même fait avec un jour compatible avec « 2026-09 » → déjà publié', !!etapeDejaPublie(dossier, { ...inst, event_date: '2026-09-25' }));
test('même mesure à une AUTRE date (octobre) → deux faits, pas déjà publié', etapeDejaPublie(dossier, { ...inst, event_date: '2026-10-12' }) === null);
test('une étape d’un autre type (enquête) n’est jamais un fait « déjà publié »', etapeDejaPublie({ deroule: [dossier.deroule[2]] }, { ...inst }) === null);
test('mesure absente de la fiche → à décider comme avant', etapeDejaPublie({ deroule: [dossier.deroule[2]] }, { mesure: 'controle_inspection', realisation: 'réalisée' }) === null);
test('fiche sans déroulé / sans dossier : jamais « déjà publié » (échec ouvert vers la demande à l’éditeur)', etapeDejaPublie({}, { ...inst }) === null && etapeDejaPublie(null, { ...inst }) === null);

// Annoncée ≠ réalisée : confirmer la réalisation d'une mesure que la fiche dit seulement annoncée est une information NOUVELLE.
test('réunion « annoncée » dans la fiche + article qui la dit tenue → information nouvelle', etapeDejaPublie(dossier, { mesure: 'information_familles', realisation: 'réalisée' }) === null);
test('réunion « annoncée » dans la fiche + article qui la dit encore annoncée → déjà publié', !!etapeDejaPublie(dossier, { mesure: 'information_familles', realisation: 'annoncée' }));

// Source : rattachée ou non.
test('article du 15 novembre déjà référencé (source complémentaire) → source déjà rattachée', sourceDejaReferencee(dossier, B));
test('URL équivalente (fragment, paramètre de suivi) → toujours reconnue', sourceDejaReferencee(dossier, B + '?utm_source=x#haut'));
test('article inconnu de la fiche → non rattaché', !sourceDejaReferencee(dossier, 'https://exemple.test/autre'));
test('URL absente → non rattachée (jamais de faux « déjà »)', !sourceDejaReferencee(dossier, null) && !sourceDejaReferencee(dossier, ''));

let r = dejaPublie(dossier, { ...inst, event_date: null }, B);
test('RAPPORT : fait déjà publié ET source déjà rattachée → rien à faire', r?.sourceDejaRattachee === true);
r = dejaPublie(dossier, { ...inst, event_date: null }, 'https://exemple.test/nouvel-article');
test('RAPPORT : fait déjà publié, source absente → simple rattachement, aucune information ajoutée', r && r.sourceDejaRattachee === false);
test('RAPPORT : fait absent → null', dejaPublie({ deroule: [] }, { ...inst }, B) === null);

// Rejeu sur la fiche réelle publiée (lecture seule), si présente.
try {
  const isoles = JSON.parse(readFileSync(new URL('../../data/hub-matiere/isoles.json', import.meta.url), 'utf8'));
  const rots = isoles.dossiers?.['FR-2026-0133'];
  if (rots) {
    const ici = 'https://www.ici.fr/emissions/l-info-d-ici-ici-normandie-calvados-orne/qu-est-ce-qu-ils-attendent-ses-filles-de-3-et-5-ans-accusent-un-animateur-de-rots-de-viols-la-revolte-d-un-pere-9757940';
    const reel = dejaPublie(rots, { ...inst, event_date: null }, ici);
    test('REJEU Rots (FR-2026-0133) : suspension déjà publiée et article du 15/11 déjà référencé → aucun message', reel?.sourceDejaRattachee === true);
  } else console.log('  (rejeu Rots ignoré : dossier absent)');
} catch { console.log('  (rejeu Rots ignoré : data/hub-matiere/isoles.json illisible)'); }

console.log(ko ? `\n${ko} échec(s)` : '\ntout est vert');
process.exit(ko ? 1 : 0);
