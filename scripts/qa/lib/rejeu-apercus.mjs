// Outil de développement : rejoue la fusion « acquis + relecture » sur les aperçus figés des cas réels et imprime le comparatif avant/après.
// Usage : node scripts/qa/lib/rejeu-apercus.mjs [ID …]   (aucun réseau, aucun modèle)
import { readFileSync } from 'node:fs';
import { apercuVersDossier } from './apercu-vers-dossier.mjs';
import { conserverAcquis } from '../../lib/fiche-acquis.mjs';
import { changementsFiche, hashDossier } from '../../lib/fiche-page.mjs';

const DIR = new URL('../../../fixtures/maintenance-sans-perte/', import.meta.url);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['FR-2026-0002', 'FR-2026-0001', 'FR-2026-0047', 'FR-2026-0045', 'FR-2026-0046', 'FR-2026-0005', 'POC-07', 'FR-2026-0113'];
const court = (s, n = 110) => String(s).replace(/\s+/g, ' ').slice(0, n);
export function rejouer(id) {
  const A = JSON.parse(readFileSync(new URL(`${id}.approuve.json`, DIR), 'utf8'));
  const ap = apercuVersDossier(readFileSync(new URL(`${id}.apercu.md`, DIR), 'utf8'));
  const avantFusion = changementsFiche(A, ap.dossier);
  const m = conserverAcquis({ precedent: A, candidat: ap.dossier, sources: ap.sources, noms: [] });
  const apresFusion = changementsFiche(A, m.dossier);
  return { id, A, ap, avantFusion, m, apresFusion };
}
if ((process.argv[1] || '').endsWith('rejeu-apercus.mjs')) {
  for (const id of ids) {
    const r = rejouer(id);
    const f = r.avantFusion, g = r.apresFusion;
    console.log(`\n=== ${id} — approuvé ${hashDossier(r.A)} (${r.A.deroule.length} étapes) · candidate ${r.ap.empreinte} ${r.ap.qualification} (${r.ap.dossier.deroule.length} étapes)`);
    console.log(`  AVANT (sans fusion) : +${f.ajoutees.length} −${f.retirees.length} · ${f.sources_nouvelles.length} source(s) nouvelle(s), ${f.sources_retirees.length} retirée(s) · état ${f.etat_change ? 'CHANGÉ' : 'identique'} · réactions +${f.reactions_ajoutees}/−${f.reactions_retirees}`);
    for (const e of f.retirees) console.log(`     ➖ ${court(e.texte)} (${e.media})`);
    console.log(`  APRÈS (avec fusion) : +${g.ajoutees.length} −${g.retirees.length} · ${g.sources_nouvelles.length} source(s) nouvelle(s), ${g.sources_retirees.length} retirée(s) · état ${g.etat_change ? 'CHANGÉ' : 'identique'} · réactions +${g.reactions_ajoutees}/−${g.reactions_retirees} · ${r.m.dossier.deroule.length} étapes · substantiel ${g.substantiel} · inchangé ${r.m.journal.inchange}`);
    for (const e of g.ajoutees) console.log(`     ➕ ${court(e.texte)} (${e.date ?? 'date non écrite'} · ${e.media})`);
    for (const e of g.retirees) console.log(`     ➖ ${court(e.texte)}`);
    const J = r.m.journal;
    console.log(`     conservées ${J.conservees.length} (${J.conservees.filter((x) => x.raison === 'NON_RELUE').length} non relues) · enrichies ${J.enrichies.length} · références ajoutées ${J.references_ajoutees.length} · sources devenues secondaires ${J.devenues_secondaires.length} · dates divergentes ${J.divergences.length} · retraits motivés ${J.retirees.length} · ambiguïtés ${J.ambigues.length} · état ${J.etat ?? '—'}${J.suite ? ' / ' + J.suite : ''}`);
    for (const a of r.m.attention.filter((x) => x.niveau === 'majeur')) console.log(`     ⚠ ${a.code} — ${court(a.texte, 150)}`);
  }
}
