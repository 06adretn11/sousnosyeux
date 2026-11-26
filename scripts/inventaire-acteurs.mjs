// =====================================================================
// scripts/inventaire-acteurs.mjs — inventaire des acteurs suivis : registre (identité, preuves, intérêt) + état de la dernière lecture (aperçu du cycle).
//
//   node scripts/inventaire-acteurs.mjs [--registre data/associations-watchlist.json] [--apercu fichier.json] [--format md|json]
//
// Sans --apercu : inventaire STATIQUE du registre (aucun état de lecture n'est inventé : « non mesuré »).
// Avec --apercu (sortie de maintenance-cycle --apercu) : par acteur et par source — accès, dernier contrôle, dernière publication couverte, historique manquant, panne.
// Aucun texte de publication, aucune légende : seulement des compteurs, des dates, des classes. Lecture seule.
// =====================================================================
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const court = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** @returns {object[]} une ligne par SOURCE d'un acteur (une ligne « sans source » si l'acteur n'a aucune page suivie) */
export function inventaire(registre, apercu = null) {
  const lignes = apercu?.documents || [];
  const parPage = new Map(lignes.filter((l) => l.type && l.type !== 'document').map((l) => [l.url, l]));
  const sortie = [];
  for (const o of registre.organismes || []) {
    const docs = lignes.filter((l) => (l.type || 'document') === 'document' && (l.organismes || []).includes(o.id) && l.publie_le);
    const derniere = docs.map((d) => String(d.publie_le).slice(0, 10)).sort().at(-1) || null;
    const base = { acteur: o.id, nom: o.nom, role: o.role || null, portee: o.portee || null, identite_verifiee: Boolean(o.implication_verifiee), verifie_le: o.verifie_le || null,
      themes: o.themes || [], interet: court(o.implication_detail || o.description || o.note, 220), preuves_identite: court(o.implication_source, 160) || null };
    const pages = o.suivi?.pages || [];
    if (!pages.length) { sortie.push({ ...base, source: null, type: null, mesure: 'AUCUNE_SOURCE_SUIVIE' }); continue; }
    for (const p of pages) {
      const l = parPage.get(p.url);
      const mesure = !apercu ? 'NON_MESURE' : !l ? 'ABSENTE_DE_L_APERCU' : l.issue;
      sortie.push({ ...base, source: p.url, type: p.type, cadence: p.cadence || null, repli: Boolean(p.repli), mesure,
        incident: l?.incident || null, dernier_succes: l?.dernier_succes || null,
        derniere_publication_couverte: derniere,
        publications_lues: l?.couverture?.publications_lues ?? null, plus_ancien_lu: l?.couverture?.plus_ancien_lu ?? null,
        historique_non_couvert: l?.couverture ? Boolean(l.couverture.historique_non_couvert) : null, dernier_controle: apercu?.maintenant || apercu?.genere_le || null });
    }
  }
  return sortie;
}

export function enMarkdown(lignes) {
  const e = (s) => String(s ?? '').replace(/\|/g, '/');
  const out = ['| Acteur | Source | Type | État | Dernière publication couverte | Historique | Identité |', '|---|---|---|---|---|---|---|'];
  for (const l of lignes) {
    const hote = l.source ? new URL(l.source).host + (l.type === 'instagram' ? ` (@${new URL(l.source).pathname.split('/').filter(Boolean)[0]})` : '') : '—';
    out.push(`| ${e(l.nom)} | ${e(hote)} | ${e(l.type || '—')} | ${e(l.mesure)}${l.incident ? ` (${e(l.incident)})` : ''} | ${e(l.derniere_publication_couverte || '—')} | ${l.historique_non_couvert === null ? '—' : l.historique_non_couvert ? `NON couvert avant ${e(l.plus_ancien_lu)}` : 'couvert'} | ${l.identite_verifiee ? 'vérifiée' : 'à confirmer'} |`);
  }
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const A = process.argv.slice(2); const val = (n, d = null) => { const i = A.indexOf(`--${n}`); return i >= 0 ? A[i + 1] : d; };
  const registre = JSON.parse(readFileSync(val('registre', 'data/associations-watchlist.json'), 'utf8'));
  const apercu = val('apercu') ? JSON.parse(readFileSync(val('apercu'), 'utf8')) : null;
  const l = inventaire(registre, apercu);
  console.log(val('format', 'md') === 'json' ? JSON.stringify(l, null, 1) : enMarkdown(l));
}
