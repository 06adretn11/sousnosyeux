#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-discovery.mjs — garde-fous du run Discovery quotidien.
//
//   - la vérification code d'une extraction du modèle (citation littérale dans SA page, commune, énumérations)
//   - les familles de dépêches (deux médias qui reprennent la même dépêche = une source)
//   - les messages Telegram (format imposé, liens directs, boutons ≤ 64 octets, callbacks préfixés)
//
// Aucun réseau, aucun Neon, aucun modèle.
// =====================================================================
import { verifier, independantes } from '../lib/qualifier-signal.mjs';
import { messageDecision, boutons } from '../lib/discovery-messages.mjs';

let ko = 0;
const test = (nom, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${nom}`); if (!cond) ko++; };

const PHRASE = (n) => `Phrase numéro ${n} assez longue pour dépasser largement le seuil de soixante caractères exigé par le comparateur.`;
const A = { url: 'https://exemple-a.fr/a', media: 'A', published: '2026-10-01', corps: 'Une enquête est ouverte à l’école maternelle Les Lilas de Lyon après des plaintes de parents. ' + [1, 2, 3, 4].map(PHRASE).join(' ') };
const B = { url: 'https://exemple-b.fr/b', media: 'B', published: '2026-10-02', corps: 'À Lyon, l’école Les Lilas est visée par une enquête. ' + [1, 2, 3, 4].map(PHRASE).join(' ') };
const C = { url: 'https://exemple-c.fr/c', media: 'C', published: '2026-10-02', corps: 'Tout autre sujet : le parquet de Lyon évoque une enquête distincte. ' + [11, 12, 13].map((n) => `Autre phrase indépendante numéro ${n} suffisamment longue pour compter dans la comparaison de textes.`).join(' ') };

const base = () => ({
  est_affaire: true, commune: 'Lyon', departement: 'Rhône', etablissement: 'École maternelle Les Lilas',
  type_structure: 'maternelle', role_mis_en_cause: 'animateur périscolaire', type_affaire: 'violences sexuelles',
  statut_judiciaire: 'enquête', statut_des_faits: 'allégué', enfants_concernes_public: 'non précisé',
  resume: 'Selon la presse, une enquête est ouverte après des plaintes de parents dans une école maternelle.',
  dernier_evenement: '2026-10-01', ambiguite: null,
  preuves: [{ url: A.url, citation: 'Une enquête est ouverte à l’école maternelle Les Lilas de Lyon après des plaintes de parents.' }],
});

console.log('vérification de l’extraction');
let v = verifier(base(), [A, B]);
test('extraction valide acceptée', v.ok && v.evidence.length === 1);
v = verifier({ ...base(), preuves: [{ url: A.url, citation: 'Citation inventée qui ne figure dans aucun des articles lus par le modèle.' }] }, [A, B]);
test('citation inventée → rejet', !v.ok && /citation/.test(v.motif));
v = verifier({ ...base(), preuves: [{ url: B.url, citation: 'Une enquête est ouverte à l’école maternelle Les Lilas de Lyon après des plaintes de parents.' }] }, [A, B]);
test('citation attribuée à la MAUVAISE page → rejet', !v.ok);
v = verifier({ ...base(), preuves: [{ url: A.url, citation: 'Une enquête est ouverte à l’école maternelle Les Lilas de Lyon après des plaintes de parents.' }, { url: B.url, citation: 'Invention pure et simple, longue de plus de vingt-cinq caractères.' }] }, [A, B]);
test('citation inventée parmi des vraies → seule la vraie est conservée', v.ok && v.evidence.length === 1);
v = verifier({ ...base(), commune: 'Marseille' }, [A, B]);
test('commune absente des articles → rejet', !v.ok && /commune/.test(v.motif));
v = verifier({ ...base(), est_affaire: false, motif_non: 'hors périmètre' }, [A, B]);
test('hors périmètre → rejet', !v.ok);
v = verifier({ ...base(), type_structure: 'école', role_mis_en_cause: 'surveillant' }, [A, B]);
test('énumération invalide → repli neutre, pas de rejet', v.ok && v.c.type_structure === 'autre' && v.c.role_mis_en_cause === 'autre' && /à qualifier à la main/.test(v.c.ambiguite));
v = verifier({ ...base(), dernier_evenement: '2099-01-01' }, [A, B], '2026-10-06');
test('date d’événement dans le futur → ignorée', v.ok && v.c.dernier_evenement === null);
v = verifier({ ...base(), resume: 'trop court' }, [A, B]);
test('résumé absent → rejet', !v.ok);

console.log('familles de dépêches');
test('deux médias qui reprennent la même dépêche = 1 source indépendante', independantes([A, B]) === 1);
test('un média distinct = 2 sources indépendantes', independantes([A, C]) === 2);

console.log('messages Telegram');
const payload = {
  commune: 'Lyon', etablissement: 'École maternelle Les Lilas', etablissement_nomme: true, structure: 'maternelle',
  resume: 'Selon la presse, une enquête est ouverte après des plaintes de parents.', dernier_evenement: '2026-10-01',
  articles: [A, B, C, { ...A, media: 'D', url: 'https://exemple-d.fr/d' }].map(({ media, url, published }) => ({ media, url, published })),
  independantes: 2, medias: 3, possible_matches_sny: [], avertissement: null,
};
let m = messageDecision(payload, 'NEW_CASE_CANDIDATE');
test('en-tête « 🆕 DISCOVERY · AFFAIRE POTENTIELLE · commune »', /^🆕 <b>DISCOVERY<\/b> · AFFAIRE POTENTIELLE · Lyon/.test(m));
test('3 articles au plus, avec leur URL directe', (m.match(/📰 /g) || []).length === 3 && m.includes('https://exemple-a.fr/a') && !m.includes('exemple-d.fr'));
test('dernier événement daté', m.includes('Dernier événement : 01/10/2026'));
test('ligne SNY + recommandation', /SNY : aucune correspondance/.test(m) && /→ VALIDATE/.test(m));
test('pas de balise <a> (liens en clair)', !/<a /.test(m));
m = messageDecision({ ...payload, etablissement: null, etablissement_nomme: false, avertissement: 'sources divergentes' }, 'REVIEW');
test('structure non nommée + ambiguïté + recommandation « créer en attente de preuves »', /Structure non nommée/.test(m) && /⚠ sources divergentes/.test(m) && /→ CRÉER EN ATTENTE DE PREUVES/.test(m));

const att = {
  ...payload,
  attach: {
    case_id: 'FR-2026-0083', etablissement: 'Crèche non nommée', commune: 'Rouen', statut: 'enquête', role: 'personnel de crèche',
    sources: [{ media: 'Le Parisien', url: 'https://www.leparisien.fr/x', d: '2026-05-22' }],
    nouvelles: [{ media: 'Le Monde', url: 'https://www.lemonde.fr/y', d: '2026-05-23' }],
    pourquoi: ['commune concordante : Rouen', 'Le Monde et Le Parisien reprennent les mêmes phrases (même dépêche)'], divergence: 'nombre de plaintes : 2 puis 9',
  },
};
m = messageDecision(att, 'ATTACH_EXISTING');
test('rapprochement : les 4 blocs imposés', ['RAPPROCHEMENT PROPOSÉ', 'NOUVEAU SIGNAL', 'AFFAIRE EXISTANTE', 'ANALYSE', 'DÉCISION'].every((s) => m.includes(s)));
test('rapprochement : sources historiques ET nouvelles, avec URL', m.includes('https://www.leparisien.fr/x') && m.includes('https://www.lemonde.fr/y'));
test('rapprochement : l’identifiant de l’affaire existante', m.includes('FR-2026-0083'));

for (const [reco, creer] of [['NEW_CASE_CANDIDATE', 'VALIDATE'], ['REVIEW', 'PENDING']]) {
  const b = boutons(reco, 'abcdef12', { fiche: {} }).inline_keyboard[0];
  test(`boutons ${reco} (sans candidat de rattachement) : ${creer} / REVIEW / REJECT, callback ≤ 64 octets`,
    b.length === 3 && b[0].callback_data === `sny:NC:${creer}:abcdef12` && b[1].callback_data.endsWith('REVIEW:abcdef12') && b[2].callback_data.endsWith('REJECT:abcdef12')
    && b.every((x) => Buffer.byteLength(x.callback_data) <= 64));
}
{
  // Avec un candidat de rattachement : l'humain choisit RAPPROCHER (ATTACH) ou CRÉER (VALIDATE), puis REVIEW / REJECT.
  const k = boutons('ATTACH_EXISTING', 'abcdef12', att).inline_keyboard;
  test('boutons ATTACH_EXISTING : RAPPROCHER + CRÉER, puis REVIEW + REJECT, callback ≤ 64 octets',
    k.length === 2 && k[0][0].callback_data === 'sny:NC:ATTACH:abcdef12' && k[0][1].callback_data === 'sny:NC:VALIDATE:abcdef12'
    && k[1][0].callback_data.endsWith('REVIEW:abcdef12') && k[1][1].callback_data.endsWith('REJECT:abcdef12') && k.flat().every((x) => Buffer.byteLength(x.callback_data) <= 64));
}
// Les callbacks Maintenance (sny:VALIDATE|REVIEW|REJECT:<8 hex>) ne doivent jamais être capturés par le motif Discovery.
test('callbacks Maintenance distincts des callbacks Discovery', !/^sny:NC:/.test('sny:VALIDATE:abcdef12'));

console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ tous les tests passent');
process.exit(ko ? 1 : 0);
