// Fiches individuelles — une seule mémoire : liens d'événements intacts, réactions attribuées, rien de privé dans la matière.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const lire = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const evs = lire('data/evenements.json').affaires;
const cases = new Set(lire('data/cases.json').cases.map((c) => c.case_id));
const holds = new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id));
const fichiers = ['paris-11e', 'bordeaux-gironde', 'hautes-alpes', 'isoles'].map((h) => [h, lire(`data/hub-matiere/${h}.json`)]);
let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

t('tout event_id d’un dossier existe dans data/evenements.json (un fait = un événement)', () => {
  for (const [h, m] of fichiers) for (const [id, d] of Object.entries(m.dossiers || {})) for (const e of d.deroule || []) {
    if (e.event_id) assert.ok((evs[id] || []).some((x) => x.event_id === e.event_id), `${h}/${id} : event_id inconnu ${e.event_id}`);
  }
});
t('un dossier n’existe que pour une affaire PUBLIQUE et hors HOLD', () => {
  for (const [, m] of fichiers) for (const id of Object.keys(m.dossiers || {})) { assert.ok(cases.has(id), `${id} absente de l’artefact`); assert.ok(!holds.has(id), `${id} sous HOLD`); }
});
t('toute réaction : validation connue, acteur, source avec URL', () => {
  for (const [, m] of fichiers) for (const [id, d] of Object.entries(m.dossiers || {})) for (const r of d.reactions || []) {
    assert.ok(['PAROLE_ETABLIE', 'POSITION_ATTRIBUEE'].includes(r.validation), `${id} : une PISTE ou un contenu non publiable ne s’écrit pas dans un fichier public`);
    assert.ok(r.acteur && r.source?.url && r.source?.media, `${id} : réaction sans attribution`);
    assert.ok(['affaire'].includes(r.portee), `${id} : une réaction de portée territoire vit dans le Hub, une seule fois`);
  }
});
t('aucun nombre exact d’enfants ni nom de personne mise en cause dans la matière des fiches', () => {
  const txt = JSON.stringify([fichiers.find(([h]) => h === 'isoles')[1], lire('data/hub-matiere/paris-11e.json').dossiers['POC-09']]);
  assert.ok(!/\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|\d+)\s+(fillettes|enfants|élèves|garçons)\b/i.test(txt), 'nombre exact d’enfants');
  assert.ok(!/Nicolas|\b[A-Z]\.\s?[A-Z]\./.test(txt), 'nom ou initiale d’une personne mise en cause');
});
console.log(`\n${n} contrôles fiches : OK`);
