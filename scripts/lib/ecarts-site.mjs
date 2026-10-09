// Comparaison PURE : la page publique montre-t-elle ce que data/cases.json (projection commitée) annonce ? (testée sans réseau)
//
// Ce que la page expose réellement (web/src/pages/index.astro → JSON `#cases-data`) : l'état judiciaire, la PREMIÈRE source
// (source_url) et la synthèse d'état `etat` — pas la liste complète des sources. On vérifie donc exactement cela.
/** @returns {string[]} les écarts ; vide = conforme */
export function ecartsSite(html, ids, attendu) {
  const m = /<script[^>]*id="cases-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return ['JSON public introuvable dans la page'];
  let pub; try { pub = JSON.parse(m[1]); } catch { return ['JSON public illisible']; }
  const parId = new Map((Array.isArray(pub) ? pub : pub.cases || []).map((c) => [c.case_id, c]));
  const out = [];
  for (const id of ids) {
    const a = attendu.get(id), p = parId.get(id);
    if (!a) { out.push(`${id} : absente de data/cases.json`); continue; }
    if (!p) { out.push(`${id} : absente du site`); continue; }
    if (p.statut_judiciaire !== a.statut_judiciaire) out.push(`${id} : état « ${p.statut_judiciaire} » sur le site, « ${a.statut_judiciaire} » attendu`);
    const premiere = a.sources?.[0]?.url ?? '';
    if ((p.source_url ?? '') !== premiere) out.push(`${id} : première source différente de la projection`);
    if (JSON.stringify(p.etat ?? null) !== JSON.stringify(a.etat ?? null)) out.push(`${id} : synthèse d'état différente de la projection`);
  }
  return out;
}
