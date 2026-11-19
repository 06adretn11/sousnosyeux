// =====================================================================
// scripts/qa/test-parole-x.mjs — FORMAT X STANDARD DES PRISES DE PAROLE (19/11/2026, décision d'Adrien).
//   « <commune> · <lieu> : <acteur> évoque <évocation>. <réserve> » / « Source : <média> » / <adresse> / « A suivre sur SNY : <fiche> » — un retour à la ligne entre les blocs.
// L'évocation est une phrase APPROUVÉE par l'éditeur pour UNE citation exacte (data/evocations-paroles.json) : jamais de paraphrase produite par la machine.
// Dossier de Rots FIGÉ (fixtures/rots-dossier-fige.json) : le test ne dépend pas du dossier vivant. Aucun réseau, aucune publication.
// =====================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { hashDossier } from '../lib/fiche-page.mjs';
import { composerEvenement } from '../lib/relais-social.mjs';
import { poidsX, lieuCourt, acteurEnPhrase, verifierPost, GABARITS } from '../lib/social-editorial.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`  ${cond ? '✅' : '❌'} ${nom}${cond ? '' : ' — ' + String(detail).slice(0, 500)}`); if (!cond) ko++; };
const racine = fileURLToPath(new URL('../../', import.meta.url));
const lire = (f) => JSON.parse(readFileSync(join(racine, f), 'utf8'));
const wording = await import('../../web/src/lib/etat-wording.ts');
const F = lire('scripts/qa/fixtures/rots-dossier-fige.json');
const ID = 'FR-2026-0133';
const evBase = lire('data/evenements.json');
const ev = { ...evBase, fiches_approuvees: { ...evBase.fiches_approuvees, [ID]: { hash: hashDossier(F.d) } }, affaires: { ...evBase.affaires, [ID]: [] }, matiere: (evBase.matiere || []).filter((m) => m.case_id !== ID) };
const cases = new Map([[ID, F.entree]]);
const dossier = { hub: F.hub, d: F.d, verifie_le: F.verifie_le };
const indexMere = [...(F.d.reactions || []), ...(F.d.paroles || [])].findIndex((r) => /Une mère d’enfant concerné/.test(r.acteur || ''));
const indexPere = [...(F.d.reactions || []), ...(F.d.paroles || [])].findIndex((r) => /Un père d’enfant concerné/.test(r.acteur || ''));
const citationMere = [...(F.d.reactions || []), ...(F.d.paroles || [])][indexMere].citations[0].texte;
const evocationApprouvee = lire('data/evocations-paroles.json').evocations;
const compose = (reaction, evocations, { mod = null } = {}) => {
  const compo = { cases, ev, evocations, redirections: {}, wording, dossierFiche: () => dossier, site: 'https://sousnosyeux.org', now: new Date('2026-11-19T17:30:00Z') };
  if (mod) mod(compo);
  return composerEvenement({ type: 'case_update', case_id: ID, sous_type: 'fiche_temoignage', event_id: `fiche:test:parole${reaction}`, statut_avant: null, statut_apres: `parole-test-${reaction}`, reaction, event_key: `case_update|${ID}|parole-test-${reaction}` }, compo);
};

console.log('Format X standard des prises de parole');
{
  verifie('0. le dossier figé contient la parole de la mère et celle du père', indexMere >= 0 && indexPere >= 0 && citationMere.length > 20);
  const comp = compose(indexMere, evocationApprouvee), x = comp.canaux.x;
  verifie('1. avec l’évocation approuvée, X est publiable (contrôle indépendant V4.1 passé)', x.ok === true, JSON.stringify(x.motifs));
  const lignes = (x.texte || '').split('\n');
  verifie('2. le message est EXACTEMENT : lieu : acteur évoque évocation. réserve / Source : média / adresse / A suivre sur SNY : fiche', lignes.length === 4
    && lignes[0] === 'Rots · centre de loisirs : une mère d’enfant concerné évoque des signalements antérieurs à la plainte. L’ouverture d’une enquête ne vaut pas culpabilité.'
    && lignes[1] === 'Source : Actu.fr' && /^https:\/\/actu\.fr\/normandie\/rots_14543\/\S+\.html$/.test(lignes[2]) && /^A suivre sur SNY : https:\/\/sousnosyeux\.org\/affaires\/fr-2026-0133\/(\?\S+)?$/.test(lignes[3]), x.texte);
  verifie('3. un seul retour à la ligne entre les blocs (aucune ligne vide), ≤ 280 (comptage pondéré, URL = 23)', !/\n\n/.test(x.texte) && poidsX(x.texte) <= 280 && x.longueur === poidsX(x.texte), String(poidsX(x.texte)));
  verifie('4. la citation exacte n’est PAS dans le texte (elle est sur le visuel)', !x.texte.includes('signalements de famille pour des faits inappropriés') && !x.texte.includes('« '));
  verifie('5. rien de nominatif ni de détail : pas de nom, pas de nombre d’enfants, la réserve judiciaire est présente', !/\b\d+\s+enfants?\b/i.test(x.texte) && /ne vaut pas culpabilité/.test(x.texte));
  const sansEvocation = compose(indexMere, []);
  verifie('6. Facebook est strictement INCHANGÉ par le format X (même texte avec ou sans évocation)', sansEvocation.canaux.facebook.ok && sansEvocation.canaux.facebook.texte === comp.canaux.facebook.texte);
  verifie('7. sans évocation approuvée, la machine ne paraphrase pas : le X standard n’est pas produit (citation entière, ou bloqué avec sa tentative)', !/évoque/.test(sansEvocation.canaux.x.texte ?? sansEvocation.canaux.x.tentative?.texte ?? ''), JSON.stringify(sansEvocation.canaux.x).slice(0, 200));
  const autreCitation = compose(indexMere, [{ ...evocationApprouvee[0], citation: 'Une autre citation.' }]);
  verifie('8. une évocation approuvée pour une AUTRE citation n’est jamais utilisée (clé = citation exacte)', !/évoque/.test(autreCitation.canaux.x.texte ?? autreCitation.canaux.x.tentative?.texte ?? ''));
  const sansApprobation = compose(indexMere, [{ ...evocationApprouvee[0], approuve_par: undefined }]);
  verifie('9. une évocation sans éditeur approbateur n’est jamais utilisée', !/évoque/.test(sansApprobation.canaux.x.texte ?? sansApprobation.canaux.x.tentative?.texte ?? ''));
  const pere = compose(indexPere, evocationApprouvee);
  verifie('10. la parole du père (aucune évocation approuvée) n’utilise pas le format « évoque »', !/évoque/.test(pere.canaux.x.texte ?? pere.canaux.x.tentative?.texte ?? ''));
  // Le contrôleur indépendant refuse un texte « évoque » dont l'évocation n'est pas approuvée (liste blanche)
  const post = comp.pilote.x;
  const M = { ...comp.M, evocations: [] };
  const v = verifierPost(post, 'x', M, 'https://sousnosyeux.org', {});
  verifie('11. contrôleur : retirer l’évocation de la liste blanche invalide le même texte (« 100 % des valeurs proviennent de la matière approuvée »)', v.ok === false && v.controles.some((k) => !k.ok && /valeurs proviennent/.test(k.nom)), JSON.stringify(v.controles.filter((k) => !k.ok)));
  verifie('12. gabarit de la liste blanche : « {commune} · {lieu} : {acteur} évoque {evocation}. »', GABARITS.parole_x === '{commune} · {lieu} : {acteur} évoque {evocation}.');
  verifie('13. lieuCourt : « centre de loisirs de Rots » → « centre de loisirs » ; sans commune finale : inchangé', lieuCourt({ commune: 'Rots', etablissement: 'centre de loisirs de Rots' }) === 'centre de loisirs' && lieuCourt({ commune: 'Rots', etablissement: 'école Jean-Moulin' }) === 'école Jean-Moulin' && lieuCourt({ commune: 'Paris 7e', etablissement: 'École maternelle Saint-Dominique' }) === 'École maternelle Saint-Dominique');
  verifie('14. acteurEnPhrase : « Une mère… » → « une mère… » ; un nom propre reste tel quel', acteurEnPhrase('Une mère d’enfant concerné') === 'une mère d’enfant concerné' && acteurEnPhrase('Un père d’enfant concerné') === 'un père d’enfant concerné' && acteurEnPhrase('Maître Dupont, avocat des familles') === 'Maître Dupont, avocat des familles');
  verifie('15. data/evocations-paroles.json : chaque entrée nomme l’affaire, la citation exacte, l’évocation, l’éditeur et la date', evocationApprouvee.every((x) => x.case_id && x.citation && x.evocation && x.approuve_par && /^\d{4}-\d{2}-\d{2}$/.test(x.le)) && evocationApprouvee.some((x) => x.citation === citationMere), JSON.stringify(evocationApprouvee));
}

console.log(ko ? `\n❌ ${ko} vérification(s) en échec` : '\n✅ format X des prises de parole : toutes les vérifications passent');
process.exit(ko ? 1 : 0);
