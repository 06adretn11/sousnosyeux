#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-boucle.mjs — « fermer la boucle » : garde-fous testés sur les cas réels des 8-9 octobre 2026.
//
//   1. clic Telegram       décodage, validité des boutons, réception qui ne perd aucun clic
//   2. Nouvelle affaire / évolution d’état   chaque action produit le bon choix (action) et aucune autre écriture
//   3. Rapprochement incertain  rapprochement incertain : message comparatif avec les deux jeux de sources
//   4. Deux départements      contradiction géographique : bloqué ; source historique redirigée : jamais une preuve
//   5. Mesure d’une mairie     événement institutionnel, annoncé ≠ réalisé, jamais une transition judiciaire
//   6. Vigée-Lebrun        deux articles « de mardi », un seul fait
//
// Les textes ci-dessous sont des paraphrases synthétiques : aucune citation de presse réelle, aucun nom. Aucun réseau,
// aucune base, aucun modèle. Les rejeux sur données réelles (lecture seule) sont décrits dans docs/industrialisation/FERMER_LA_BOUCLE.md.
// =====================================================================
import { niveauGeo, communes, sourceCoherente, forceRapprochement } from '../lib/rapprochement-garde.mjs';
import { detecterInstitutionnel, libelleInstitutionnel, categorieEvenement, realisationDe, TYPES_INSTITUTIONNELS } from '../lib/evenement-institutionnel.mjs';
import { evenementDejaValide } from '../lib/routage-veille.mjs';
import { messageDecision, boutons } from '../lib/discovery-messages.mjs';
import { decoderCallback, boutonValable, dernierAConfirmer, NC_VERS_DB, ACTION_NC, VERS_DB, ESSAIS_MAX } from '../lib/telegram-clics.mjs';

let ko = 0;
const test = (nom, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}`); if (!cond) ko++; };
const section = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------------
section('1. clic Telegram — décodage et validité des boutons');
test('callback Maintenance', JSON.stringify(decoderCallback('sny:VALIDATE:abcdef12')) === JSON.stringify({ type: 'ETAT', action: 'VALIDATE', cle: 'abcdef12' }));
test('callback Discovery RAPPROCHER', decoderCallback('sny:NC:ATTACH:abcdef12')?.type === 'NC' && decoderCallback('sny:NC:ATTACH:abcdef12').action === 'ATTACH');
test('callback test', decoderCallback('sny:TEST:0a1b2c3d')?.type === 'TEST');
test('callbacks invalides refusés (clé non hexa, action inconnue, injection)', [null, '', 'sny:VALIDATE:zz', 'sny:NC:DELETE:abcdef12', "sny:VALIDATE:abcdef12'; drop table cases;--", 'sny:NC:ATTACH:abcdef123'].every((d) => decoderCallback(d) === null));
test('VALIDATE → ACCEPT, REVIEW → REVIEW_REQUIRED, REJECT → REJECT', VERS_DB.VALIDATE === 'ACCEPT' && VERS_DB.REVIEW === 'REVIEW_REQUIRED' && VERS_DB.REJECT === 'REJECT');
test('le CHOIX est enregistré : ATTACH → ATTACH, VALIDATE et CREATE → CREATE, REVIEW/REJECT → aucune action', ACTION_NC.ATTACH === 'ATTACH' && ACTION_NC.VALIDATE === 'CREATE' && ACTION_NC.CREATE === 'CREATE' && ACTION_NC.REVIEW === null && ACTION_NC.REJECT === null);
test('ATTACH, VALIDATE et CREATE écrivent tous ACCEPT', ['ATTACH', 'VALIDATE', 'CREATE'].every((a) => NC_VERS_DB[a] === 'ACCEPT'));
const avecAttach = { attach: { case_id: 'FR-2026-9901' }, fiche: {} };
const sansAttach = { fiche: {} };
test('RAPPROCHER n’est valable que s’il existe un candidat de rattachement', boutonValable('ATTACH', avecAttach) && !boutonValable('ATTACH', sansAttach));
test('CRÉER est valable partout où une fiche est à créer', boutonValable('VALIDATE', avecAttach) && boutonValable('VALIDATE', sansAttach) && !boutonValable('VALIDATE', {}));
test('REVIEW et REJECT sont toujours valables', boutonValable('REVIEW', {}) && boutonValable('REJECT', null));

section('1b. réception — un clic dont le traitement échoue n’est JAMAIS confirmé (perdu en silence avant)');
const ok = (id) => ({ update_id: id, ok: true, essais: 0, age_h: 0 });
const ko1 = (id, essais = 1) => ({ update_id: id, ok: false, essais, age_h: 0 });
test('tout réussi → on confirme jusqu’au dernier', dernierAConfirmer([ok(10), ok(11), ok(12)]) === 12);
test('rien reçu → rien à confirmer', dernierAConfirmer([]) === null);
test('échec au milieu → on s’arrête AVANT lui (rejoué au passage suivant)', dernierAConfirmer([ok(10), ko1(11), ok(12)]) === 10);
test('échec du premier → rien n’est confirmé', dernierAConfirmer([ko1(10), ok(11)]) === null);
test(`échec répété ${ESSAIS_MAX} fois → abandonné pour ne pas bloquer la file`, dernierAConfirmer([ok(10), ko1(11, ESSAIS_MAX), ok(12)]) === 12);
test('rejeu : le même lot rejoué donne le même résultat (idempotent)', dernierAConfirmer([ok(10), ok(11)]) === dernierAConfirmer([ok(10), ok(11)]));

// ---------------------------------------------------------------------
section('2. boutons — Nouvelle affaire / évolution d’état (format inchangé pour une proposition sans candidat de rattachement)');
const rots = boutons('NEW_CASE_CANDIDATE', 'abcdef12', sansAttach).inline_keyboard;
test('nouvelle affaire : VALIDATE / REVIEW / REJECT sur une ligne', rots.length === 1 && rots[0].length === 3 && rots[0][0].callback_data === 'sny:NC:VALIDATE:abcdef12');
test('tous les callbacks ≤ 64 octets et décodables', [...rots.flat(), ...boutons('REVIEW', 'abcdef12', avecAttach).inline_keyboard.flat()].every((b) => Buffer.byteLength(b.callback_data) <= 64 && decoderCallback(b.callback_data)));

// ---------------------------------------------------------------------
section('3. Marcillac-les-Pins — rapprochement incertain : l’éditeur dispose des deux jeux de sources');
const cenon = {
  commune: 'Marcillac-les-Pins', etablissement: 'écoles Anatole-France et Michelet', structure: 'périscolaire', etablissement_nomme: true,
  resume: 'Selon la presse, un animateur du périscolaire a été renvoyé devant le tribunal correctionnel. Son employeur affirme l’avoir écarté dès qu’il a eu connaissance des faits.',
  dernier_evenement: '2026-09-29', independantes: 1, medias: 1, possible_matches_sny: [{ case_id: 'FR-2026-9901' }],
  attach: {
    case_id: 'FR-2026-9901', etablissement: 'Centre de loisirs de Marcillac-les-Pins (école Michelet)', commune: 'Marcillac-les-Pins', statut: 'procès', role: 'animateur périscolaire',
    resume: 'Selon la presse, un animateur périscolaire de Gironde est poursuivi.',
    sources: [
      { media: 'Ouest-France', url: 'https://exemple.test/of/cenon', d: '2026-09-21', verifiee: true },
      { media: 'Sud Ouest', url: 'https://exemple.test/so/cenon', d: '2026-09-29', verifiee: true },
      { media: 'Source cassée', url: 'https://exemple.test/casse/cenon', d: '2026-09-21', verifiee: false, motif: 'page inaccessible' },
    ],
    nouvelles: [{ media: 'Sud Ouest', url: 'https://exemple.test/so/cenon-employeur', d: '2026-10-08' }],
    pourquoi: ['commune concordante : Marcillac-les-Pins'],
    contre: ['identification partielle : l’établissement, la date ou la procédure ne sont pas établis par les articles', 'établissement du signal non nommé de la même façon'],
    incertitude: 'élevée',
  },
};
let m = messageDecision(cenon, 'REVIEW');
test('message comparatif : les 4 blocs NOUVEAU SIGNAL / AFFAIRE EXISTANTE / ANALYSE / DÉCISION', ['NOUVEAU SIGNAL', 'AFFAIRE EXISTANTE', 'ANALYSE', 'DÉCISION', 'RAPPROCHEMENT À ARBITRER'].every((s) => m.includes(s)));
test('les sources du NOUVEAU signal ET de l’affaire existante sont montrées, avec URL directe', m.includes('https://exemple.test/so/cenon-employeur') && m.includes('https://exemple.test/of/cenon') && m.includes('https://exemple.test/so/cenon'));
test('une source historique non vérifiée n’est JAMAIS présentée comme preuve (lien masqué, comptée)', !m.includes('casse/cenon') && /1 source\(s\) historique\(s\) non vérifiable/.test(m));
test('identifiant, établissement, lieu, état de l’affaire existante', m.includes('FR-2026-9901') && m.includes('Centre de loisirs de Marcillac-les-Pins') && m.includes('état « procès »'));
test('indices pour ET contradictions / manques + niveau d’incertitude', /Pour :/.test(m) && /Contre \/ manquant/.test(m) && /Incertitude : élevée/.test(m));
test('les trois décisions sont proposées : RAPPROCHER, CRÉER, REVIEW', ['RAPPROCHER', 'CRÉER', 'REVIEW'].every((s) => m.includes(s)));
const bAttache = boutons('REVIEW', 'abcdef12', cenon).inline_keyboard;
test('boutons : RAPPROCHER et CRÉER ensemble, REVIEW et REJECT en dessous', bAttache.length === 2 && bAttache[0][0].callback_data === 'sny:NC:ATTACH:abcdef12' && bAttache[0][1].callback_data === 'sny:NC:VALIDATE:abcdef12' && bAttache[1].length === 2);
test('« RAPPROCHER » ne promet aucun changement d’état judiciaire', /état judiciaire n’est pas modifié/.test(m));
const ancien = messageDecision({ ...cenon, attach: { ...cenon.attach, sources: [{ media: 'Le Parisien', url: 'https://exemple.test/lp', d: '2026-05-22' }] } }, 'ATTACH_EXISTING');
test('message ancien (sans drapeau verifiee) : sources affichées telles quelles, « RAPPROCHEMENT PROPOSÉ »', ancien.includes('https://exemple.test/lp') && ancien.includes('RAPPROCHEMENT PROPOSÉ'));

// ---------------------------------------------------------------------
section('4. Vendée / Port-Soleil — contradiction géographique : jamais de rapprochement');
const vendee = { commune: 'Saint-Aubin-des-Lilas et Brandelac', departement: 'Vendée' };
const nice = { commune: 'Port-Soleil', departement: 'Alpes-Maritimes' };
test('Vendée ≠ Port-Soleil : BLOQUANT', niveauGeo(vendee, nice).niveau === 'bloquant');
test('… et la raison nomme les deux communes', /Saint-Aubin-des-Lilas/.test(niveauGeo(vendee, nice).raison) && /Port-Soleil/.test(niveauGeo(vendee, nice).raison));
test('Vendée ≠ Port-Soleil même quand le département du signal est illisible : BLOQUANT (jamais « faible »)', niveauGeo({ commune: 'Saint-Aubin-des-Lilas', departement: '' }, nice).niveau === 'bloquant');
test('Marcillac-les-Pins = Marcillac-les-Pins : ok', niveauGeo({ commune: 'Marcillac-les-Pins', departement: 'Gironde' }, { commune: 'Marcillac-les-Pins', departement: 'Gironde' }).niveau === 'ok');
test('Verdon-les-Roses = Verdon-les-Roses : ok', niveauGeo({ commune: 'Verdon-les-Roses', departement: 'Landes' }, { commune: 'Verdon-les-Roses', departement: 'Landes' }).niveau === 'ok');
test('multi-communes : l’une des deux suffit', niveauGeo({ commune: 'Saint-Aubin-des-Lilas et Brandelac' }, { commune: 'Brandelac' }).niveau === 'ok');
test('Paris 10e / Paris 15e : indice faible (arrondissements différents), jamais « ok »', niveauGeo({ commune: 'Paris 10e' }, { commune: 'Paris 15e' }).niveau === 'faible');
test('Paris / Paris 15e : ok (arrondissement non précisé d’un côté)', niveauGeo({ commune: 'Paris' }, { commune: 'Paris 15e' }).niveau === 'ok');
test('communes voisines, même département : faible (l’humain compare), pas bloquant', niveauGeo({ commune: 'Marcillac-les-Pins', departement: 'Gironde' }, { commune: 'Brandelac-Haut', departement: 'Gironde' }).niveau === 'faible');
test('commune inconnue d’un côté : faible', niveauGeo({ commune: '' }, nice).niveau === 'faible');
test('communes() sépare « et » et retire l’arrondissement', JSON.stringify(communes('Paris 10e')) === JSON.stringify([{ nom: 'paris', arr: 10 }]) && communes('Saint-Aubin-des-Lilas et Brandelac').length === 2);

section('4b. sources historiques — redirigée ou hors sujet : jamais une preuve');
const PAGE_OK = { ok: true, url: 'https://exemple.test/port-soleil-animateur-periscolaire-mis-examen', corps: 'À Port-Soleil, un animateur périscolaire a été mis en examen pour des agressions sexuelles sur des enfants. '.repeat(3) };
test('page cohérente (commune + thème) : utilisable', sourceCoherente({ url: PAGE_OK.url, page: PAGE_OK, commune: 'Port-Soleil' }).ok);
test('commune à trait d’union et élision : retrouvée (régression : « port soleil » ≠ « port-soleil »)', sourceCoherente({ url: PAGE_OK.url, page: { ...PAGE_OK, corps: 'À L’Haÿ-les-Roses, un animateur périscolaire a été mis en examen pour des agressions sexuelles sur des enfants.' }, commune: 'L’Haÿ-les-Roses' }).ok);
test('« Vire » ne se retrouve pas dans « virement » (mots entiers)', !sourceCoherente({ url: PAGE_OK.url, page: { ...PAGE_OK, corps: 'À Virement, un animateur périscolaire a été mis en examen pour des agressions sexuelles sur des enfants.' }, commune: 'Vire' }).ok);
test('page inaccessible : refusée', !sourceCoherente({ url: 'https://exemple.test/x', page: { ok: false }, commune: 'Port-Soleil' }).ok);
const REDIR = { ok: true, url: 'https://exemple.test/planete/eaux-usees-reutilisation-reglement-europeen', corps: 'Le règlement européen sur la réutilisation des eaux usées sera simplifié. Édition de Port-Soleil. '.repeat(5) };
const rd = sourceCoherente({ url: 'https://exemple.test/justice/port-soleil-animateur-periscolaire-mis-examen-agressions-sexuelles', page: REDIR, commune: 'Port-Soleil' });
test('URL redirigée vers un autre article (cas FR-2026-9902) : refusée, même si « Port-Soleil » figure dans la page', !rd.ok && /redirigée/.test(rd.motif));
const HORS = { ok: true, url: 'https://exemple.test/a', corps: 'Port-Soleil accueille un festival de jazz cet été avec de nombreux concerts en plein air. '.repeat(5) };
test('« Port-Soleil » présent mais aucun thème : refusée (un menu de navigation ne prouve rien)', !sourceCoherente({ url: 'https://exemple.test/a', page: HORS, commune: 'Port-Soleil' }).ok);
test('commune absente : refusée', !sourceCoherente({ url: 'https://exemple.test/a', page: { ok: true, url: 'https://exemple.test/a', corps: 'Un animateur mis en examen pour agressions sexuelles à Lyon. '.repeat(3) }, commune: 'Port-Soleil' }).ok);

section('4c. force du rapprochement — « même commune » ou « même rôle » ne suffisent jamais');
test('géographie bloquante → aucune', forceRapprochement({ geo: { niveau: 'bloquant', raison: 'x' }, resolution: 'MATCH', memeDepeche: true }).force === 'aucune');
test('rapprochement complet du résolveur + géographie ok → forte', forceRapprochement({ geo: { niveau: 'ok' }, resolution: 'MATCH', memeDepeche: false }).force === 'forte');
test('partiel + même dépêche qu’une source VÉRIFIÉE → forte', forceRapprochement({ geo: { niveau: 'ok' }, resolution: 'POSSIBLE_MATCH', memeDepeche: true }).force === 'forte');
test('partiel sans autre preuve (Marcillac-les-Pins, Verdon-les-Roses) → faible : l’humain tranche', forceRapprochement({ geo: { niveau: 'ok' }, resolution: 'POSSIBLE_MATCH', memeDepeche: false }).force === 'faible');
test('géographie faible → faible, même si le résolveur dit MATCH', forceRapprochement({ geo: { niveau: 'faible', raison: 'x' }, resolution: 'MATCH', memeDepeche: true }).force === 'faible');
const ecarte = messageDecision({ commune: 'Saint-Aubin-des-Lilas et Brandelac', etablissement: null, etablissement_nomme: false, structure: 'centre de loisirs', resume: 'Selon la presse, un animateur périscolaire a été condamné.', dernier_evenement: '2026-10-05', articles: [{ media: 'A', url: 'https://exemple.test/a' }, { media: 'B', url: 'https://exemple.test/b' }], independantes: 2, medias: 2, possible_matches_sny: [], rapprochement_ecarte: { case_id: 'FR-2026-9902', raison: 'communes sans rapport (Saint-Aubin-des-Lilas / Port-Soleil)' } }, 'NEW_CASE_CANDIDATE');
test('rapprochement écarté : la nouvelle affaire le dit (transparence), sans proposer de rattachement', /Rapprochement avec FR-2026-9902 écarté/.test(ecarte) && !/RAPPROCHER/.test(ecarte));

// ---------------------------------------------------------------------
section('5. Verdon-les-Roses — événement institutionnel : conservé, daté, qualifié, sans transition judiciaire');
const TARNOS = 'La municipalité a présenté un plan d’action pour renforcer l’encadrement des enfants, le maire assurant qu’il y aura un avant et un après.';
let inst = detecterInstitutionnel(['Des violences sexuelles ont été découvertes au centre de loisirs.', TARNOS]);
test('détecté : réponse institutionnelle, plan d’encadrement', inst?.event_type === 'réponse_institutionnelle' && inst.mesure === 'plan_action_encadrement');
test('mesure ANNONCÉE (le maire « présente un plan », « il y aura »)', inst?.realisation === 'annoncée');
test('l’événement n’est PAS judiciaire et ne porte aucun statut', categorieEvenement(inst.event_type) === 'institutionnel' && !('statut_apres' in inst) && !('statut_judiciaire' in inst));
test('libellé public : table fermée, neutre, « Selon la presse », sans nom ni détail', inst.libelle_public === 'Selon la presse, la collectivité a annoncé un plan d’action pour renforcer l’encadrement des enfants.' && !/maire|violence|sexuel/i.test(inst.libelle_public));
test('la citation d’origine est conservée (mémoire privée)', inst.citation.includes('plan d’action'));
// Régression : `\b` ne reconnaît pas les lettres accentuées. Sans le mot « maire », « municipalité » / « collectivité » n'étaient jamais
// vus comme acteurs — ce que seul le rejeu sur l'article réel de Verdon-les-Roses a révélé (la fixture ci-dessus passait grâce à « maire »).
inst = detecterInstitutionnel(['La municipalité a présenté une série de mesures pour renforcer l’encadrement des enfants dans les centres de loisirs.']);
test('« municipalité » seule (sans « maire ») est reconnue comme acteur — mesure annoncée', inst?.mesure === 'plan_action_encadrement' && inst.realisation === 'annoncée');
test('« collectivité » (accent final) est reconnue comme acteur', detecterInstitutionnel(['La collectivité a décidé d’un renforcement de l’encadrement dans toutes les structures.'])?.mesure === 'plan_action_encadrement');
test('« éducation nationale » (accent initial) est reconnue comme acteur', detecterInstitutionnel(['L’éducation nationale a lancé une inspection de l’établissement concerné.'])?.mesure === 'controle_inspection');
inst = detecterInstitutionnel(['La mairie a mis en place des binômes dans tous les accueils de loisirs depuis lundi.']);
test('mesure RÉALISÉE : verbe d’accomplissement explicite, aucun marqueur d’annonce', inst?.realisation === 'réalisée' && /mis en œuvre/.test(inst.libelle_public));
test('même mesure, deux stades : deux libellés distincts (annoncée ≠ réalisée)', libelleInstitutionnel('plan_action_encadrement', 'annoncée') !== libelleInstitutionnel('plan_action_encadrement', 'réalisée'));
test('au moindre doute : « annoncée » (jamais « réalisée » par défaut)', realisationDe('La mairie travaille sur un dispositif de renforcement de l’encadrement.') === 'annoncée');
test('annonce au futur : annoncée', detecterInstitutionnel(['Le maire annonce que la mairie fermera temporairement le centre de loisirs.'])?.realisation === 'annoncée');
inst = detecterInstitutionnel(['Un animateur a été mis à pied ou suspendu de ses fonctions jusqu’à nouvel ordre par ses employeurs, dont la municipalité.']);
test('suspension par la municipalité co-employeur (« mis à pied ou suspendu ») : suspension réalisée, pas annoncée', inst?.event_type === 'suspension' && inst.realisation === 'réalisée');
inst = detecterInstitutionnel(['Le maire a suspendu l’agent de ses fonctions dès la découverte des faits.']);
test('suspension de l’agent par la collectivité : type « suspension », réalisée', inst?.event_type === 'suspension' && inst.realisation === 'réalisée');
test('une mesure SANS acteur institutionnel ne suffit pas (employeur privé non nommé)', detecterInstitutionnel(['L’animateur a été suspendu par son employeur le lendemain des faits.']) === null);
test('un acteur SANS mesure ne suffit pas (le maire est choqué)', detecterInstitutionnel(['Le maire se dit choqué par ces révélations et pense aux familles concernées.']) === null);
test('acteur et mesure doivent figurer dans la MÊME citation (pas de recoupement entre deux)', detecterInstitutionnel(['Le maire s’est exprimé devant la presse hier matin.', 'Un plan d’action doit renforcer l’encadrement des enfants.']) === null);
test('un fait purement judiciaire n’est pas institutionnel', detecterInstitutionnel(['Le tribunal correctionnel a condamné l’animateur à cinq ans de prison.']) === null);
test('catégories : judiciaire / institutionnel / autre', categorieEvenement('mise_en_examen') === 'judiciaire' && categorieEvenement('réponse_institutionnelle') === 'institutionnel' && categorieEvenement('retrait') === 'autre' && TYPES_INSTITUTIONNELS.includes('mobilisation'));

// ---------------------------------------------------------------------
section('6. Vigée-Lebrun — deux articles « de mardi », un seul fait');
const EV = [{ case_id: 'FR-2026-0004', event_type: 'décision', event_date: '2026-09-15', statut_apres: 'condamnation non définitive' }];
const COND = 'condamnation non définitive';
test('date écrite identique : même fait', !!evenementDejaValide(EV, 'FR-2026-0004', COND, '2026-09-15'));
test('date écrite différente : fait distinct', evenementDejaValide(EV, 'FR-2026-0004', COND, '2026-09-16') === null);
test('date non écrite, publiée le jour du fait : MÊME fait (rapproché par la publication)', evenementDejaValide(EV, 'FR-2026-0004', COND, null, '2026-09-15')?.rapproche_par_publication === true);
test('date non écrite, publiée 3 jours après : même fait', !!evenementDejaValide(EV, 'FR-2026-0004', COND, null, '2026-09-18'));
test('date non écrite, publiée 4 jours après : on ne tranche pas', evenementDejaValide(EV, 'FR-2026-0004', COND, null, '2026-09-19') === null);
test('un article publié AVANT le fait ne peut pas le rapporter', evenementDejaValide(EV, 'FR-2026-0004', COND, null, '2026-09-14') === null);
test('sans aucune date : proposition conservée (jamais d’effacement par défaut)', evenementDejaValide(EV, 'FR-2026-0004', COND, null, null) === null);
test('autre affaire / autre état : jamais fusionnés', evenementDejaValide(EV, 'FR-2026-0001', COND, null, '2026-09-15') === null && evenementDejaValide(EV, 'FR-2026-0004', 'relaxe / non-lieu / classement', null, '2026-09-15') === null);
const DEUX = [...EV, { case_id: 'FR-2026-0004', event_type: 'décision', event_date: '2026-09-16', statut_apres: COND }];
test('deux faits validés de même état dans la fenêtre : on ne fusionne PAS (jamais deux faits distincts au seul motif de l’état)', evenementDejaValide(DEUX, 'FR-2026-0004', COND, null, '2026-09-17') === null);
test('rejeu / retry : même entrée, même résultat (idempotent)', JSON.stringify(evenementDejaValide(EV, 'FR-2026-0004', COND, null, '2026-09-15')) === JSON.stringify(evenementDejaValide(EV, 'FR-2026-0004', COND, null, '2026-09-15')));

console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ tous les tests passent');
process.exit(ko ? 1 : 0);
