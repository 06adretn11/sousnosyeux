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
import { decoderCallback, boutonValable, dernierAConfirmer, essaisDe, NC_VERS_DB, ACTION_NC, VERS_DB, ESSAIS_MAX } from '../lib/telegram-clics.mjs';
import { preuvesDe } from '../lib/preuves.mjs';
import { ecartsSite } from '../lib/ecarts-site.mjs';
import worker, { egal, DATA_RE } from '../../workers/telegram-webhook/worker.mjs';
import { readFileSync } from 'node:fs';

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
test('sans journal (migration absente) : un clic qui échoue en boucle ne bloque PAS la file (essais = maximum)', (await essaisDe(async () => [], 123)) === ESSAIS_MAX && dernierAConfirmer([ok(10), ko1(11, ESSAIS_MAX), ok(12)]) === 12);
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
test('boutons (candidat de rattachement, signal à confirmer) : RAPPROCHER + CRÉER (preuves à compléter), REVIEW + REJECT en dessous', bAttache.length === 2 && bAttache[0][0].callback_data === 'sny:NC:ATTACH:abcdef12' && bAttache[0][1].callback_data === 'sny:NC:PENDING:abcdef12' && bAttache[1].length === 2);
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
// Défauts relevés par la relecture indépendante du commit aaf38e8 :
test('« l’inspection académique est saisie du dossier » : un acteur n’est PAS une mesure', detecterInstitutionnel(['L’inspection académique est saisie du dossier depuis ce matin.']) === null);
test('« la mairie a licencié l’agent » ne produit PAS le libellé « suspendu »', detecterInstitutionnel(['La mairie a licencié l’agent concerné après la découverte des faits.'])?.libelle_public !== 'Selon la presse, l’agent concerné a été suspendu de ses fonctions.');
test('« écarté de ses fonctions » = suspension ; « écarté de l’enquête » ne l’est pas', detecterInstitutionnel(['La mairie a écarté l’agent de ses fonctions dès lundi.'])?.event_type === 'suspension' && detecterInstitutionnel(['La mairie a écarté l’agent de l’enquête administrative interne le temps de la procédure.'])?.event_type !== 'suspension');
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

// ---------------------------------------------------------------------
section('7. contrat des boutons — sémantique fiable, contextuelle, sans effet secondaire');
const doc = { fiche: { crit_recoupement: true, crit_etablissement_nomme: true, crit_statut_clair: true, crit_source_fiable: true, crit_article_recent: true } };
const peu = { fiche: { crit_recoupement: false, crit_etablissement_nomme: false, crit_statut_clair: true } };
const acts = (kb) => kb.inline_keyboard.flat().map((b) => decoderCallback(b.callback_data).action).sort().join(',');
test('affaire bien documentée : VALIDATE / REVIEW / REJECT seulement', acts(boutons('NEW_CASE_CANDIDATE', 'abcdef12', doc)) === 'REJECT,REVIEW,VALIDATE');
test('affaire à preuves insuffisantes : CRÉER (preuves à compléter) / REVIEW / REJECT — jamais VALIDATE', acts(boutons('NEW_CASE_CANDIDATE', 'abcdef12', peu)) === 'PENDING,REJECT,REVIEW');
test('signal crédible mais à confirmer (REVIEW) : preuves à compléter, pas VALIDATE', acts(boutons('REVIEW', 'abcdef12', doc)) === 'PENDING,REJECT,REVIEW');
test('candidat de rattachement, bien documenté : RAPPROCHER + CRÉER', acts(boutons('ATTACH_EXISTING', 'abcdef12', { ...doc, attach: { case_id: 'FR-2026-9901' } })) === 'ATTACH,REJECT,REVIEW,VALIDATE');
test('candidat de rattachement, preuves insuffisantes : RAPPROCHER + CRÉER (preuves à compléter)', acts(boutons('ATTACH_EXISTING', 'abcdef12', { ...peu, attach: { case_id: 'FR-2026-9901' } })) === 'ATTACH,PENDING,REJECT,REVIEW');
test('jamais toutes les actions à la fois', ['NEW_CASE_CANDIDATE', 'REVIEW', 'ATTACH_EXISTING'].every((r) => [doc, peu, { ...doc, attach: { case_id: 'x' } }].every((p) => boutons(r, 'abcdef12', p).inline_keyboard.flat().length <= 4)));
test('CREATE_PENDING_EVIDENCE : décodé, enregistre ACCEPT + action CREATE_PENDING, exige une fiche', decoderCallback('sny:NC:PENDING:abcdef12')?.action === 'PENDING' && NC_VERS_DB.PENDING === 'ACCEPT' && ACTION_NC.PENDING === 'CREATE_PENDING' && boutonValable('PENDING', doc) && !boutonValable('PENDING', {}));
test('REVIEW (HOLD) n’enregistre AUCUNE action de création ou de rattachement', NC_VERS_DB.REVIEW === 'REVIEW_REQUIRED' && ACTION_NC.REVIEW === null && ACTION_NC.REJECT === null);
test('tous les callbacks produits sont acceptés par le Worker (et seulement eux)', [doc, peu, { ...doc, attach: { case_id: 'x' } }].flatMap((p) => ['NEW_CASE_CANDIDATE', 'REVIEW', 'ATTACH_EXISTING'].flatMap((r) => boutons(r, 'abcdef12', p).inline_keyboard.flat())).every((b) => DATA_RE.test(b.callback_data))
  && !DATA_RE.test('sny:NC:DELETE:abcdef12') && !DATA_RE.test('sny:VALIDATE:abcdef12;drop') && DATA_RE.test('sny:TEST:0a1b2c3d'));
const pd = preuvesDe(peu);
test('ce qui manque est identifié précisément (recoupement, établissement)', !pd.suffisantes && pd.manques.length === 2 && /recoupement/.test(pd.manques[0]) && /établissement/.test(pd.manques[1]));
test('preuves complètes : aucun manque', preuvesDe(doc).suffisantes);
const un = { fiche: { ...doc.fiche, crit_etablissement_nomme: false } };
test('SEUIL EXISTANT (fiabilité ≥ 8, au plus un critère en défaut) : établissement non nommé seul = suffisant, la réserve est dite', preuvesDe(un).suffisantes && preuvesDe(un).fiabilite === 8 && preuvesDe(un).manques.length === 1 && acts(boutons('NEW_CASE_CANDIDATE', 'abcdef12', un)) === 'REJECT,REVIEW,VALIDATE');
test('deux critères en défaut (fiabilité 6) = insuffisant', preuvesDe(peu).fiabilite === 6 && !preuvesDe(peu).suffisantes);
test('la ligne de recommandation ne dit JAMAIS « VALIDATE » sous un bouton « preuves à compléter »', !/→ VALIDATE/.test(messageDecision({ ...peu, commune: 'Valmont', structure: 'périscolaire', resume: 'Selon la presse, une enquête est ouverte.', dernier_evenement: '2026-10-01', articles: [{ media: 'A', url: 'https://exemple.test/a' }], independantes: 2 }, 'NEW_CASE_CANDIDATE')));
const mp = messageDecision({ ...peu, commune: 'Valmont', etablissement: null, structure: 'périscolaire', resume: 'Selon la presse, une enquête est ouverte.', dernier_evenement: '2026-10-01', articles: [{ media: 'A', url: 'https://exemple.test/a' }], independantes: 1 }, 'REVIEW');
test('le message dit ce qui manque et que la candidate sera non publiable', /recoupement insuffisant/.test(mp) && /ne sera pas publiable/.test(mp));
test('rapprochement : une même date citée par les deux jeux de sources = preuve discriminante (forte)', forceRapprochement({ geo: { niveau: 'ok' }, resolution: 'POSSIBLE_MATCH', memeDepeche: false, datesCommunes: ['2027-02-22'] }).force === 'forte');
test('… mais jamais si la géographie est faible ou bloquante', forceRapprochement({ geo: { niveau: 'faible', raison: 'x' }, resolution: 'POSSIBLE_MATCH', datesCommunes: ['2027-02-22'] }).force === 'faible' && forceRapprochement({ geo: { niveau: 'bloquant', raison: 'x' }, resolution: 'MATCH', datesCommunes: ['2027-02-22'] }).force === 'aucune');

section('8. Worker de réception (webhook Telegram) — authenticité, accusé immédiat honnête, aucun accès base');
const ENV = { TELEGRAM_BOT_TOKEN: 'jeton-test', TELEGRAM_WEBHOOK_SECRET: 'secret-webhook-test', TELEGRAM_ALLOWED_USER_ID: '4242', GITHUB_TOKEN: 'gh-test', GITHUB_REPO: 'org/depot' };
const clic = (over = {}) => ({ update_id: 7001, callback_query: { id: 'cb1', data: 'sny:VALIDATE:abcdef12', from: { id: 4242 }, message: { message_id: 9, chat: { id: 4242 } }, ...over } });
const requete = (corps, secret = ENV.TELEGRAM_WEBHOOK_SECRET, methode = 'POST') => new Request('https://w.test/', { method: methode, headers: { 'X-Telegram-Bot-Api-Secret-Token': secret ?? '' }, body: methode === 'POST' ? JSON.stringify(corps) : undefined });
const faux = (githubStatus = 204) => { const appels = []; const f = async (url, opts) => { appels.push({ url: String(url), body: opts?.body }); return new Response(null, { status: String(url).includes('api.github.com') ? githubStatus : 200 }); }; f.appels = appels; return f; };
{
  let f = faux(); let r = await worker.fetch(requete(clic(), 'mauvais-secret'), ENV, null, f);
  test('mauvais secret : 403, RIEN n’est appelé', r.status === 403 && f.appels.length === 0);
  f = faux(); r = await worker.fetch(requete(clic(), ''), ENV, null, f);
  test('secret absent : 403, rien n’est appelé', r.status === 403 && f.appels.length === 0);
  f = faux(); r = await worker.fetch(requete(clic({ from: { id: 999 } })), ENV, null, f);
  test('clic d’un autre utilisateur : ignoré (200), rien n’est appelé', r.status === 200 && f.appels.length === 0);
  f = faux(); r = await worker.fetch(requete(clic({ message: { message_id: 9, chat: { id: 999 } } })), ENV, null, f);
  test('clic dans un autre chat : ignoré, rien n’est appelé', r.status === 200 && f.appels.length === 0);
  f = faux(); r = await worker.fetch(requete(clic({ data: 'sny:NC:DROP:abcdef12' })), ENV, null, f);
  test('données de bouton invalides : ignoré, rien n’est appelé', r.status === 200 && f.appels.length === 0);
  f = faux(); r = await worker.fetch(requete({ update_id: 1, message: { text: 'bonjour' } }), ENV, null, f);
  test('mise à jour qui n’est pas un clic : ignorée', r.status === 200 && f.appels.length === 0);
  f = faux(); r = await worker.fetch(new Request('https://w.test/', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': ENV.TELEGRAM_WEBHOOK_SECRET }, body: 'x'.repeat(9000) }), ENV, null, f);
  test('corps trop gros : 413', r.status === 413 && f.appels.length === 0);
  f = faux(204); r = await worker.fetch(requete(clic()), ENV, null, f);
  const gh = f.appels.find((a) => a.url.includes('api.github.com')); const tg = f.appels.find((a) => a.url.includes('answerCallbackQuery'));
  test('clic valide : déclenche le workflow sny-telegram du bon dépôt', r.status === 200 && gh && gh.url.endsWith('/repos/org/depot/actions/workflows/sny-telegram.yml/dispatches'));
  test('… puis accusé IMMÉDIAT « Décision reçue » (avant toute écriture en base)', tg && /Décision reçue/.test(JSON.parse(tg.body).text) && f.appels.indexOf(gh) < f.appels.indexOf(tg));
  test('… la mise à jour transmise ne contient que le nécessaire (pas de texte, pas de profil)', (() => { const u = JSON.parse(JSON.parse(gh.body).inputs.update); return u.update_id === 7001 && u.callback_query.data === 'sny:VALIDATE:abcdef12' && !('username' in u.callback_query.from) && Object.keys(u.callback_query.message).sort().join() === 'chat,message_id'; })());
  f = faux(500); r = await worker.fetch(requete(clic()), ENV, null, f);
  const tg2 = f.appels.find((a) => a.url.includes('answerCallbackQuery'));
  test('transmission en échec : 500 (Telegram réessaiera) et accusé « Non transmise » — jamais un faux « reçue »', r.status === 500 && /Non transmise/.test(JSON.parse(tg2.body).text) && !/reçue/.test(JSON.parse(tg2.body).text));
  r = await worker.fetch(requete(null, '', 'GET'), ENV, null, faux());
  test('une requête GET ne déclenche rien', r.status === 200);
}
test('comparaison du secret en temps constant : égal / différent / longueurs différentes / vide', egal('abc', 'abc') && !egal('abc', 'abd') && !egal('abc', 'abcd') && !egal('', '') && !egal(undefined, 'x'));
const srcWorker = readFileSync(new URL('../../workers/telegram-webhook/worker.mjs', import.meta.url), 'utf8');
test('le Worker n’a AUCUN accès à la base (ni NEON, ni driver, ni SQL)', !/NEON|neondatabase|\bsql\b|postgres/i.test(srcWorker.replace(/\/\/.*$/gm, '')));
const wfTel = readFileSync(new URL('../../.github/workflows/sny-telegram.yml', import.meta.url), 'utf8');
test('workflow webhook : l’entrée utilisateur ne passe JAMAIS dans un `run:` (injection) — seulement par env', !/run:[^\n]*\$\{\{\s*inputs\./.test(wfTel) && /UPDATE_JSON: \$\{\{ inputs\.update \}\}/.test(wfTel));
test('workflow webhook : même groupe de concurrence que les autres (un seul consommateur à la fois)', /group: sny-telegram/.test(wfTel));

section('9. vérification indépendante du site public');
const attenduSite = new Map([['FR-2026-9910', { case_id: 'FR-2026-9910', statut_judiciaire: 'enquête', sources: [{}, {}] }]]);
const pageSite = (cas) => `<html><body><script type="application/json" id="cases-data">${JSON.stringify(cas)}</script></body></html>`;
test('site conforme : aucun écart', ecartsSite(pageSite([{ case_id: 'FR-2026-9910', statut_judiciaire: 'enquête', sources: [{}, {}] }]), ['FR-2026-9910'], attenduSite).length === 0);
test('site en retard (ancien état) : écart signalé', ecartsSite(pageSite([{ case_id: 'FR-2026-9910', statut_judiciaire: 'plainte', sources: [{}, {}] }]), ['FR-2026-9910'], attenduSite).length === 1);
test('affaire absente du site : écart signalé', ecartsSite(pageSite([]), ['FR-2026-9910'], attenduSite)[0].includes('absente du site'));
test('sources manquantes : écart signalé', ecartsSite(pageSite([{ case_id: 'FR-2026-9910', statut_judiciaire: 'enquête', sources: [{}] }]), ['FR-2026-9910'], attenduSite).length === 1);
test('page sans JSON public : écart (jamais « conforme » par défaut)', ecartsSite('<html></html>', ['FR-2026-9910'], attenduSite).length === 1);

console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ tous les tests passent');
process.exit(ko ? 1 : 0);
