// Accueil (lots B1/B2) — H1 visible, vrais liens <a href> vers les fiches, ancres stables /#affaire-<id> sans ouverture de popup.
// Contrôle sur le SOURCE de la page (le rendu réel est vérifié par le build + le site servi : voir la passation).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../web/src/pages/index.astro', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

t('H1 visible unique, texte décidé', () => {
  assert.equal((src.match(/<h1\b/g) || []).length, 1);
  assert.ok(src.includes('<h1 class="info-h1">Affaires dans les lieux d\'accueil des mineurs : la carte et les sources</h1>'));
  assert.ok(!/\.info-h1\s*\{[^}]*display:\s*none/.test(src), 'jamais masqué');
});
t('hauteur au-dessus de la carte mesurée (H1 sur plusieurs lignes) et carte redimensionnée', () => {
  assert.ok(src.includes('ResizeObserver') && src.includes("--above-map-h") && src.includes('map.resize()'));
});
t('lien vers la fiche : vrai <a href>, jamais un role=link ni un lien dans un bouton', () => {
  assert.ok(/<a class="case-fiche" href=\{fichesRevue\[c\.case_id\]\}/.test(src));
  assert.ok(!src.includes('role="link"') && !src.includes('data-href'));
  assert.ok(/<\/button>\s*\n\s*\{fichesRevue\[c\.case_id\] && <a class="case-fiche"/.test(src), 'le lien est frère du bouton, pas son enfant');
});
t('ancre stable sur chaque entrée : id="affaire-<case_id>"', () => {
  assert.ok(src.includes('id={`affaire-${c.case_id.toLowerCase()}`}'), 'forme canonique en minuscules, comme les URL de fiches');
});
t('arrivée sur une ancre : défilement de la liste + surlignage ; aucune ouverture de popup ni zoom', () => {
  const i = src.indexOf('function allerAUneAffaire'), j = src.indexOf("window.addEventListener('load', allerAUneAffaire");
  assert.ok(i > 0 && j > i);
  const corps = src.slice(i, j);
  assert.ok(!/openPopupForCase|flyTo|easeTo|\.setLngLat|activePopup/.test(corps), 'popup réservée à une action du lecteur');
  assert.ok(/is-target/.test(corps) && /hashchange/.test(src) && /decodeURIComponent/.test(corps));
  assert.ok(/catch \{ return; \}/.test(corps) && /if \(!el \|\| !el\.classList\.contains\('case-item'\)\) return;/.test(corps), 'fragment inconnu ou mal encodé : sans effet');
});
console.log(`\n${n} contrôles accueil (liens, ancres) : OK`);
