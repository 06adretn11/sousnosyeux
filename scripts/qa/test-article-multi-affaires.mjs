#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-article-multi-affaires.mjs — un article qui parle de deux établissements voisins (cas BFMTV du 10/07/2026, rejoué le 23/11/2026)
//
// Trois défauts MESURÉS sur cet article déjà connu (rassemblement du 9 juillet après deux relaxes) :
//   1. « deux jours après l'annonce de la relaxe » rendait un rassemblement accompli « annoncé » ;
//   2. le même rassemblement redevenait « nouveau » dès que l'article était lu pour l'établissement VOISIN ;
//   3. l'appel du parquet rapporté pour l'AUTRE école pouvait être attribué à cette affaire.
// Textes SYNTHÉTIQUES (écoles et communes fictives, aucun nom de personne) : aucun contenu d'article n'est reproduit.
//
//   node scripts/qa/test-article-multi-affaires.mjs        Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { extraireReactions, realisationDe } from '../lib/evenement-institutionnel.mjs';
import { detecterActesProcéduraux } from '../lib/acte-procedural.mjs';
import { dejaConnu, dejaConnuChezVoisines } from '../lib/nouveaute.mjs';

let ok = 0, ko = 0;
const test = (nom, fn) => {
  try { fn(); ok++; console.log(`  ✔ ${nom}`); }
  catch (e) { ko++; console.log(`  ✘ ${nom}\n      ${String(e.message).split('\n').join('\n      ')}`); }
};
const vrai = (c, msg) => { if (!c) throw new Error(msg); };
console.log('\n  article à deux établissements voisins\n');

const ETAB = 'École maternelle Tournesol', AUTRES = ['École Bellevue'], COMMUNE = 'Ville-Exemple 11e';
const reactions = (corps) => extraireReactions(corps, { etablissement: ETAB, anneeRef: '2026-07-10', autres: AUTRES, titre: '', lieAffaire: true, commune: COMMUNE });

test('1. « après l’annonce de la relaxe, des parents se sont réunis » : rassemblement RÉALISÉ (le nom « annonce » rappelle la décision)', () => {
  const r = reactions('Jeudi 9 juillet, deux jours après l’annonce de la relaxe de l’animateur de l’école maternelle Tournesol, parents d’élèves et collectifs se sont réunis devant l’établissement pour exprimer leur colère.');
  vrai(r.length === 1 && r[0].mesure === 'rassemblement', JSON.stringify(r.map((x) => x.mesure)));
  vrai(r[0].realisation === 'réalisée' && r[0].event_date === '2026-07-09', `${r[0].realisation} ${r[0].event_date}`);
});
test('1b. une VRAIE annonce reste annoncée : « annoncent un rassemblement », « vont se rassembler »', () => {
  for (const t of ['Des parents annoncent un rassemblement devant l’école maternelle Tournesol jeudi 9 juillet.', 'Après l’annonce de la relaxe, les parents vont se rassembler devant l’école maternelle Tournesol.']) {
    const r = reactions(t);
    vrai(r.length === 1 && r[0].realisation === 'annoncée', `${t} → ${JSON.stringify(r.map((x) => x.realisation))}`);
  }
});
test('1c. realisationDe : « a été suspendu, après l’annonce du jugement » reste réalisée ; « annonce qu’il suspendra » reste annoncée', () => {
  vrai(realisationDe('L’agent a été suspendu après l’annonce de la décision de relaxe.') === 'réalisée', 'nom « annonce » lu comme annonce de la mesure');
  vrai(realisationDe('La mairie annonce qu’elle a suspendu l’agent.') === 'annoncée', 'une annonce de la mairie doit rester annoncée');
});

const MEMOIRE_VOISINE = [{ event_type: 'mobilisation', event_date: '2026-07-09', libelle_public: 'Rassemblement d’environ une centaine de parents devant l’école pour contester la relaxe.' }];
test('2. rassemblement déjà consigné pour l’affaire VOISINE (même jour, même type) : pas redemandé pour cette affaire', () => {
  vrai(dejaConnuChezVoisines({ event_type: 'mobilisation', event_date: '2026-07-09' }, MEMOIRE_VOISINE), 'même jour et même type = déjà connu');
});
test('2b. jour différent, type différent ou fait SANS date : jamais écarté par la mémoire d’une voisine', () => {
  vrai(!dejaConnuChezVoisines({ event_type: 'mobilisation', event_date: '2026-07-16' }, MEMOIRE_VOISINE), 'autre jour');
  vrai(!dejaConnuChezVoisines({ event_type: 'suspension', event_date: '2026-07-09' }, MEMOIRE_VOISINE), 'autre type');
  vrai(!dejaConnuChezVoisines({ event_type: 'mobilisation', event_date: null }, MEMOIRE_VOISINE), 'sans date : doute = gardé');
  vrai(!dejaConnuChezVoisines({ event_type: 'mobilisation', event_date: '2026-07-09' }, []), 'aucune voisine');
});
test('2c. la mémoire de l’affaire elle-même garde son rôle (dejaConnu inchangé) ; une réaction d’un AUTRE jour reste nouvelle même si l’article et l’état sont connus', () => {
  vrai(dejaConnu({ event_type: 'mobilisation', event_date: '2026-07-09' }, MEMOIRE_VOISINE), 'dejaConnu : même type, même jour');
  vrai(!dejaConnu({ event_type: 'mobilisation', event_date: '2026-07-16' }, MEMOIRE_VOISINE), 'un second rassemblement, une semaine plus tard, est une information nouvelle');
  const r = extraireReactions('Jeudi 16 juillet, des parents se sont de nouveau rassemblés devant l’école maternelle Tournesol, une semaine après la relaxe.', { etablissement: ETAB, anneeRef: '2026-07-17', autres: AUTRES, titre: '', lieAffaire: true, commune: COMMUNE });
  vrai(r.length === 1 && r[0].event_date === '2026-07-16' && !dejaConnu(r[0], MEMOIRE_VOISINE, { pubDate: '2026-07-17' }), JSON.stringify(r.map((x) => [x.mesure, x.event_date])));
});

const ETABS = { propre: ETAB, autres: AUTRES };
const APPEL_AUTRE = 'Le parquet a également fait appel de la relaxe de l’animateur de l’école Bellevue.';
const APPEL_PROPRE = 'Le parquet a fait appel de la relaxe de l’animateur de l’école maternelle Tournesol au lendemain du jugement.';
test('3. l’appel rapporté pour l’AUTRE école n’est pas attribué à cette affaire', () => {
  const f = detecterActesProcéduraux([APPEL_AUTRE], { pubDate: '2026-07-10', courant: 'relaxe / non-lieu / classement', etablissements: ETABS });
  vrai(f.length === 0, `attribué à tort : ${JSON.stringify(f.map((x) => x.mesure))}`);
});
test('3b. pour l’autre affaire, la même phrase est un appel du parquet (sujet explicite)', () => {
  const f = detecterActesProcéduraux([APPEL_AUTRE], { pubDate: '2026-07-10', courant: 'relaxe / non-lieu / classement', etablissements: { propre: 'École Bellevue', autres: [ETAB] } });
  vrai(f.length === 1 && f[0].mesure === 'appel_parquet', JSON.stringify(f.map((x) => x.mesure)));
});
test('3c. phrase qui nomme cette école, ou aucune école (doute = gardée), ou les deux : conservée', () => {
  for (const c of [APPEL_PROPRE, 'Pour une partie des enfants, le parquet a fait appel de la relaxe au lendemain du jugement.', 'Le parquet a fait appel des relaxes des animateurs des écoles Tournesol et Bellevue.']) {
    const f = detecterActesProcéduraux([c], { pubDate: '2026-07-10', courant: 'relaxe / non-lieu / classement', etablissements: ETABS });
    vrai(f.some((x) => x.mesure === 'appel_parquet'), `écartée à tort : ${c}`);
  }
});
test('3d. sans information sur les établissements : comportement inchangé', () => {
  const f = detecterActesProcéduraux([APPEL_AUTRE], { pubDate: '2026-07-10', courant: 'relaxe / non-lieu / classement' });
  vrai(f.some((x) => x.mesure === 'appel_parquet'), 'comportement par défaut modifié');
});

// --- Preuves des faits institutionnels du rejeu du 23/11 : deux faits dont la citation ne soutenait pas le libellé ---
import { detecterInstitutionnel } from '../lib/evenement-institutionnel.mjs';
test('4. un constat ANCIEN rappelé (« Dès 2015, l’Inspection générale avait pointé… ») n’est ni un contrôle annoncé ni un contrôle conduit', () => {
  vrai(detecterInstitutionnel(['Dès 2015, l’Inspection générale de la Ville avait pointé un traitement empirique des soupçons de violences, avec des signalements non systématiques.']) === null, 'constat de 2015 lu comme mesure');
});
test('4b. une inspection ANNONCÉE reste annoncée ; une enquête administrative « actuellement menée » est conduite (et non annoncée)', () => {
  const a = detecterInstitutionnel(['Une inspection sera menée dans l’école la semaine prochaine, a annoncé le rectorat.']);
  const b = detecterInstitutionnel(['Par ailleurs, une enquête administrative est actuellement menée par l’inspecteur général des services de la collectivité.']);
  vrai(a?.mesure === 'controle_inspection' && a.realisation === 'annoncée', JSON.stringify(a));
  vrai(b?.mesure === 'controle_inspection' && b.realisation === 'réalisée', JSON.stringify(b));
});

console.log(`\n  ${ok} réussis · ${ko} en échec\n`);
process.exit(ko ? 1 : 0);
