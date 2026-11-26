#!/usr/bin/env node
// Non-régression de l'audit du 26/11/2026 sur la chaîne clic → publication : fonctions pures, aucun réseau, aucune base.
//   (les règles de relecture chronologique, de concurrence des clics, d'alertes et de poussée distante ont leurs tests dans test-chronologie, test-publication-autonome, test-alerte-clic, test-fiche-priorite)
import { ecartsHubPur } from '../lib/ecarts-site.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avertissementSource } from '../lib/discovery-messages.mjs';
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
t('mauvaise attribution de source (Rots, adresse « cabaret » + titre « Soupçons de violences… ») : un rattachement DOUTEUX est dit, jamais présenté comme la source de la phrase', () => {
  assert.match(avertissementSource('DOUTEUX'), /Rattachement DOUTEUX/); assert.match(avertissementSource('DOUTEUX'), /Ne pas lire ce lien comme la source/);
  assert.equal(avertissementSource('OK'), '', 'un rattachement établi n’ajoute rien'); assert.equal(avertissementSource(null), '');
});
t('génération de fiche trop longue (FR-2026-0005 : 17 min pour 10 de limite, « ERREUR DE GÉNÉRATION » 23/11 et 25/11) : limite à 25 min, dépassement DIT et RETENTÉ, jamais marqué « traité »', () => {
  const m = src('scripts/proposer-mises-a-jour-fiches.mjs');
  assert.match(m, /DELAI_GENERATION_MS = 25 \* 60 \* 1000/); assert.match(m, /timeout: DELAI_GENERATION_MS/);
  assert.match(m, /e\.code === 'ETIMEDOUT'/); assert.match(m, /GÉNÉRATION TROP LONGUE/);
  assert.match(m, /resultat <> 'delai'/, 'un dépassement n’entre pas dans les propositions déjà traitées');
  assert.match(m, /gen\.delai \? 'delai' : 'bloquee'/);
  const w = src('.github/workflows/sny-maj-fiches.yml'); const minutes = Number(/timeout-minutes:\s*(\d+)/.exec(w)[1]);
  assert.ok(minutes >= 2 * 25, 'le job couvre deux générations de 25 min : ' + minutes);
});
t('Hub : une parole projetée est reconnue par sa citation affichée (run sny-clics du 26/11 : 13 « informations absentes » à tort, toutes servies), une absente réelle reste signalée', () => {
  const x = { id: 'aaaa11112222', nature: 'parole', libelle: 'Parole attribuée — la municipalité qui affirme : « coopérer pleinement »', parole: { citations: [{ texte: 'Nous allons coopérer pleinement avec la justice' }] } };
  const y = { id: 'bbbb33334444', nature: 'fait', libelle: 'Une audience est fixée au 3 décembre' };
  const html = '<div data-hub="h" data-matiere="2"><blockquote>Nous allons coopérer pleinement avec la justice</blockquote><p>Une audience est fixée au 3 décembre</p></div>';
  assert.deepEqual(ecartsHubPur(html, 'h', [x, y]), [], 'servi ⇒ conforme');
  assert.ok(ecartsHubPur(html.replace('coopérer pleinement', 'autre chose'), 'h', [x, y]).some((m) => /aaaa11112222 absente/.test(m)), 'parole réellement absente ⇒ signalée');
  assert.ok(ecartsHubPur(html.replace('data-matiere="2"', 'data-matiere="1"'), 'h', [x, y]).some((m) => /différentes de la projection/.test(m)), 'compte différent ⇒ signalé');
});
console.log(`\n${n} contrôles audit 26/11 : OK`);
