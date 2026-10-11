#!/usr/bin/env node
// Non-régression : une affaire « publiée » en base mais absente de l'artefact (Tarnos, 11/10/2026) n'est ni reprojetée ni en échec ;
// une affaire sur le site devenue non projetable est un CONFLIT à arbitrer (jamais retirée ni silencieuse) ; l'évolution valide passe.
import { classerProjection, texteConflit } from '../lib/classer-projection.mjs';
let ko = 0;
const test = (n, c) => { if (c) console.log(`  ✓ ${n}`); else { ko++; console.log(`  ✗ ${n}`); } };
test('Tarnos : publiée en base, absente de l’artefact → EN_ATTENTE (pas reprojetée, pas d’échec)', classerProjection({ dansArtefact: false }) === 'EN_ATTENTE');
test('… même si une erreur de projection était survenue : l’absence prime', classerProjection({ dansArtefact: false, erreur: 'x' }) === 'EN_ATTENTE');
test('évolution valide d’une affaire déjà publiée → A_PROJETER', classerProjection({ dansArtefact: true }) === 'A_PROJETER');
test('sur le site mais « n’est plus projetable » → CONFLIT (arbitrage, jamais retirée)', classerProjection({ dansArtefact: true, erreur: 'Error: FR-2026-0099 n’est plus projetable (retirée, sous le seuil ou sous HOLD) : refus' }) === 'CONFLIT');
test('autre erreur (réseau, base) → TECHNIQUE : échec réel de l’étape', classerProjection({ dansArtefact: true, erreur: 'Error: connect ETIMEDOUT' }) === 'TECHNIQUE');
const t = texteConflit('FR-2026-0099');
test('le message de conflit dit que RIEN n’est retiré et demande l’arbitrage', /Arbitrage requis/.test(t) && /Rien n’a été retiré/.test(t) && /FR-2026-0099/.test(t));
console.log(ko ? `\n  ❌ ${ko} échec(s)\n` : '\n  ✅ tous les tests passent\n');
process.exit(ko ? 1 : 0);
