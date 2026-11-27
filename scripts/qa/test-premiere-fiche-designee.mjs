// Première fiche d'une affaire DÉSIGNÉE par l'éditeur (hors périmètre du relais) : le mode est étroit et garde tous les autres garde-fous. Contrôles statiques, sans base ni réseau.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const lire = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const s = lire('scripts/proposer-premieres-fiches.mjs');
const y = lire('.github/workflows/sny-maj-fiches.yml');

t('--designee exige --case et un identifiant valide (refus avant toute connexion)', () => {
  const i = s.indexOf('if (DESIGNEE && !(SEUL');
  assert.ok(i > 0 && i < s.indexOf('connecter()'), 'le refus précède la connexion à la base');
  assert.ok(s.includes('[A-Z]+-\\d{4}-\\d{4}|POC-\\d+'), 'motif d’identifiant avec l’échappement \\d');
});
t('le mode désigné ne lève QUE l’exigence du relais : HOLD, retrait, publication, artefact, fiche approuvée, proposition en attente restent contrôlés', () => {
  for (const garde of ["c.ps !== 'publiée' || c.retire", 'holds.has(c.case_id)', '!cases.has(c.case_id)', 'ev.fiches_approuvees?.[c.case_id]', "like '[Fiche approuvée %'", 'new_case_proposals', 'decision is null']) assert.ok(s.includes(garde), garde);
  assert.ok(s.includes('!DESIGNEE && (age === null || age >= FENETRE_SOURCE_JOURS)'), 'seule la fenêtre de 7 jours est levée');
});
t('aucune publication : le script ne fait qu’écrire une proposition ; l’envoi reste notifier-nouvelles', () => {
  assert.ok(!/publication_status\s*=\s*'publiée'/.test(s) && !/update cases/i.test(s));
  assert.ok(s.includes("'proposer-fiche.mjs', [r.case_id, '--generee', '--ecrire']"));
});
t('workflow : la saisie « designee » passe par une variable d’environnement, jamais interpolée dans la commande', () => {
  assert.ok(/DESIGNEE: \$\{\{ inputs\.designee \}\}/.test(y));
  assert.ok(y.includes('if [ "$DESIGNEE" = "true" ]; then options="--designee"; fi'));
  for (const corps of y.split('run: |').slice(1)) assert.ok(!/\$\{\{ inputs\./.test(corps.split('\n      - ')[0]), 'aucune saisie dans un corps de commande');
  assert.ok(y.includes("- cron: '47 6-18 * * *'"), 'le déclenchement planifié reste sans « désignée »');
});
console.log(`\n  ${n} contrôles : OK`);
