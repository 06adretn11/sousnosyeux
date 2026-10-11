// Étape « Alerter » de sny-telegram : lit les `outcome` des étapes (env OUTCOME_<clé>) et prévient l'éditeur avec la bonne classification.
import { classerEchecClic } from './lib/alerte-clic.mjs';
import { prevenir } from './lib/prevenir.mjs';

const cles = ['enregistrer', 'simples', 'discovery', 'projection', 'qa', 'publier', 'verifier'];
const outcomes = Object.fromEntries(cles.map((k) => [k, process.env['OUTCOME_' + k]]));
await prevenir(classerEchecClic(outcomes).texte);
