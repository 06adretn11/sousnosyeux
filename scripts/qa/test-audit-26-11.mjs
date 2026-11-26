#!/usr/bin/env node
// Non-régression de l'audit du 26/11/2026 sur la chaîne clic → publication : fonctions pures, aucun réseau, aucune base.
//   (les règles de relecture chronologique, de concurrence des clics, d'alertes et de poussée distante ont leurs tests dans test-chronologie, test-publication-autonome, test-alerte-clic, test-fiche-priorite)
import assert from 'node:assert/strict';
import { avertissementSource } from '../lib/discovery-messages.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
t('mauvaise attribution de source (Rots, adresse « cabaret » + titre « Soupçons de violences… ») : un rattachement DOUTEUX est dit, jamais présenté comme la source de la phrase', () => {
  assert.match(avertissementSource('DOUTEUX'), /Rattachement DOUTEUX/); assert.match(avertissementSource('DOUTEUX'), /Ne pas lire ce lien comme la source/);
  assert.equal(avertissementSource('OK'), '', 'un rattachement établi n’ajoute rien'); assert.equal(avertissementSource(null), '');
});
console.log(`\n${n} contrôles audit 26/11 : OK`);
