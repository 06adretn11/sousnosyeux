// Comparaison PURE : la page publique montre-t-elle ce que data/cases.json (projection commitée) annonce ? (testée sans réseau)
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
    const ns = (p.sources || []).length, na = (a.sources || []).length;
    if (ns !== na) out.push(`${id} : ${ns} source(s) sur le site, ${na} attendue(s)`);
  }
  return out;
}
