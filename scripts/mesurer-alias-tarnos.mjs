// =====================================================================
// scripts/mesurer-alias-tarnos.mjs — mesure HORS LIGNE de l'alias « centre de loisirs de Tarnos » sur les publications DÉJÀ LUES (aucun appel Meta, aucun jeton, aucune base).
//
// Pour chaque publication de l'export local (data/preuves-business-discovery/export-publications.json, ignoré par Git) : traits mesurables du texte (sans hashtags),
// destination obtenue AVEC alias et SANS alias. Aucun texte n'est imprimé : dates, traits, destinations seulement.
// « Piste Tarnos » = la légende nomme Tarnos dans son texte (hors hashtags et signature finale « – Tarnos ») : c'est une mesure du TEXTE, pas un jugement éditorial.
// Usage : node scripts/mesurer-alias-tarnos.mjs
// =====================================================================
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classer, chargerRegistre } from './lib/sources-suivies.mjs';
import { postVersDocument } from './lib/veille-instagram.mjs';
import { chargerAlias, enrichirFiches, expressionPresente, norm } from './lib/alias-etablissements.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fichier = join(ROOT, 'data', 'preuves-business-discovery', 'export-publications.json');
if (!existsSync(fichier)) { console.error('export local introuvable : lancer la sonde (lectures réelles) d\'abord'); process.exit(1); }
const posts = JSON.parse(readFileSync(fichier, 'utf8')).publications;
const brut = JSON.parse(readFileSync(join(ROOT, 'data', 'cases.json'), 'utf8'));
const brutes = Array.isArray(brut) ? brut : (brut.cases || brut.affaires);
const avecAlias = enrichirFiches(brutes, chargerAlias(join(ROOT, 'data', 'alias-etablissements.json')));
const page = { type: 'document' };
// Organismes RÉELS du registre (alias, territoire annoncé) : la mesure porte sur la configuration de production du pilote.
const registre = chargerRegistre(join(ROOT, 'data', 'associations-watchlist.json'));
const organismeDe = (auteur) => registre.organismes.find((o) => (o.suivi?.pages || []).some((p) => p.type === 'instagram' && p.compte === auteur));

const sansHashtagsNiSignature = (l) => String(l || '').replace(/#\S+/g, ' ').replace(/leurs voix, notre combat\s*[–-]\s*tarnos/gi, ' ');
const lignes = [];
for (const p of posts) {
  const doc = postVersDocument(p);
  const corps = sansHashtagsNiSignature(p.legende);
  const t = {
    date: String(p.publie_le).slice(0, 10), auteur: p.auteur,
    ecarte: Boolean(doc.ecarte),
    alias: expressionPresente(corps, 'centre de loisirs de Tarnos'),
    tarnos: /tarnos/i.test(corps), centre: /centre de loisirs/i.test(corps),
  };
  if (!doc.ecarte) {
    const orga = organismeDe(p.auteur);
    const sans = classer({ doc, page, organisme: { ...orga, piste_territoire: undefined }, fiches: brutes });
    const avec = classer({ doc, page, organisme: orga, fiches: avecAlias });
    t.sans_alias = sans.destination; t.avec_alias = avec.destination; t.candidats = [...(avec.case_ids || []), ...(avec.suspendus || [])];
    t.piste = avec.destination === 'PISTE_A_QUALIFIER' ? avec.piste.motif_code : null;
    t.piste_detail = avec.destination === 'PISTE_A_QUALIFIER' ? { destination: avec.piste.destination, territoire: avec.piste.territoire, hub_id: avec.piste.hub_id, passage: avec.piste.passage.slice(0, 170) } : null;
    t.titre = doc.titre.slice(0, 70);
    t.signature = /leurs voix, notre combat/i.test(String(p.legende || ''));
  }
  lignes.push(t);
}
const compte = (f) => lignes.filter(f).length;
const lv = (t) => t.auteur === 'leursvoixnotrecombat40'; const sos = (t) => t.auteur === 'sosperiscolaire';
console.log(JSON.stringify({
  source: 'rejeu hors ligne de lectures réelles (aucun appel Meta)',
  publications: lignes.length, leursvoix: compte(lv), sosperiscolaire: compte(sos), ecartees_temoignage: compte((t) => t.ecarte),
  leursvoix_pistes_textuelles_tarnos: compte((t) => lv(t) && t.tarnos),
  leursvoix_texte_nomme_la_structure_par_l_alias: compte((t) => lv(t) && t.alias),
  leursvoix_texte_dit_centre_de_loisirs_sans_l_alias: compte((t) => lv(t) && t.centre && !t.alias),
  pistes_a_qualifier: lignes.filter((t) => t.piste).map((t) => ({ date: t.date, motif: t.piste })),
  signature_presente: compte((t) => lv(t) && t.signature),
  signature_seule_sans_piste: compte((t) => lv(t) && t.signature && !t.piste && !t.ecarte),
  pistes_sur_publications_sans_signature: compte((t) => t.piste && !t.signature),
  pistes_sosperiscolaire: compte((t) => sos(t) && t.piste),
  remontees_avec_alias: compte((t) => ['AFFAIRE', 'AFFAIRE_A_CONFIRMER'].includes(t.avec_alias)),
  remontees_sans_alias: compte((t) => ['AFFAIRE', 'AFFAIRE_A_CONFIRMER'].includes(t.sans_alias)),
  rattachements_suspendus_avec_alias: compte((t) => t.avec_alias === 'RATTACHEMENT_SUSPENDU'),
  faux_rattachements_sosperiscolaire: compte((t) => sos(t) && ['AFFAIRE', 'AFFAIRE_A_CONFIRMER', 'RATTACHEMENT_SUSPENDU'].includes(t.avec_alias)),
  destinations_avec_alias: lignes.filter((t) => t.avec_alias).reduce((a, t) => ({ ...a, [t.avec_alias]: (a[t.avec_alias] || 0) + 1 }), {}),
  destinations_sans_alias: lignes.filter((t) => t.sans_alias).reduce((a, t) => ({ ...a, [t.sans_alias]: (a[t.sans_alias] || 0) + 1 }), {}),
  hors_perimetre_restants: lignes.filter((t) => t.avec_alias === 'HORS_PERIMETRE').map((t) => t.date),
  par_publication: lignes.filter((t) => !t.ecarte).map(({ date, auteur, alias, tarnos, centre, sans_alias, avec_alias, candidats, piste, signature, piste_detail, titre }) => ({ date, auteur: auteur.slice(0, 8), alias, tarnos, centre, signature, sans_alias, avec_alias, candidats, piste, piste_detail, titre })),
}, null, 1));
