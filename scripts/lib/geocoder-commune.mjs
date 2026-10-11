// =====================================================================
// scripts/lib/geocoder-commune.mjs — point de carte d'une affaire dont on ne connaît QUE la commune.
//
// Règle : jamais inventer. Le point est le CENTRE de la commune (ou de l'arrondissement) renvoyé par l'API Adresse officielle,
// accepté seulement si (1) le nom de la commune est identique à celui de la fiche et (2) le département est le bon. Sinon : null,
// et l'affaire reste BLOQUÉE avec une raison explicite (communes composées, homonymes, nom incertain). Le point est toujours
// marqué (`geocode_source`) pour que le site affiche « Localisation approximative ».
// =====================================================================
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Choisit, parmi les features de l'API Adresse (type=municipality), celle qui correspond EXACTEMENT. Pure, testable sans réseau. */
export function choisirCommune(features, commune, departement) {
  const cible = norm(commune);
  const paris = /^paris \d{1,2}(er|e)?$/.test(cible);
  for (const f of features || []) {
    const p = f.properties || {};
    const nom = norm(p.label ?? p.name);
    const memeNom = paris ? nom === `${cible} arrondissement` || nom.startsWith(`${cible} `) : nom === cible;
    const dept = norm(String(p.context ?? '').split(',')[1]);
    if (!memeNom || !dept || dept !== norm(departement)) continue;
    const [lng, lat] = f.geometry?.coordinates || [];
    if (!(lat >= 41 && lat <= 52 && lng >= -6 && lng <= 10)) continue; // France métropolitaine
    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), source: paris ? 'centroid-arr' : 'ban-commune' };
  }
  return null;
}

export async function geocoderCommune(commune, departement, fetchFn = fetch) {
  if (!commune || !departement || /non précisée/i.test(commune)) return null;
  const url = 'https://api-adresse.data.gouv.fr/search/?' + new URLSearchParams({ q: commune, type: 'municipality', limit: '5' });
  const r = await fetchFn(url, { headers: { 'User-Agent': 'sousnosyeux-publication/0.1 (https://github.com/06adretn11/sousnosyeux)' } });
  if (!r.ok) throw new Error(`API Adresse HTTP ${r.status}`); // erreur réseau ≠ « introuvable » : l'appelant ne conclut rien
  return choisirCommune((await r.json()).features, commune, departement);
}
