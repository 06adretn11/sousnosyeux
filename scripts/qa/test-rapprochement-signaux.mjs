#!/usr/bin/env node
// =====================================================================
// scripts/qa/test-rapprochement-signaux.mjs — « les signaux sont réunis avant d'être décidés, un voisin sans indice n'est pas un candidat ».
//
// Cas réel du 08/11/2026 : deux articles d'un même éditeur sur une même école arrivent comme DEUX arbitrages contre une affaire historique d'une
// autre commune du même département, chacun annoncé « Pour : aucun indice établi ». Causes (trois, indépendantes) :
//   1. le voisin géographique était imposé comme alternative même sans aucun indice positif ;
//   2. « même affaire » exigeait une PAGE citée en commun (deux articles d'un même éditeur n'en partagent pas), et « école primaire X » / « école X »
//      donnaient deux clés de déduplication ;
//   3. le modèle renvoie les champs catégoriels sous forme de LISTES (`["enquête"]`) : tout retombait au repli neutre (« à qualifier », « autre »).
//
// Ce que ce test exécute RÉELLEMENT (pas des fonctions isolées) : `evaluer()` — pages relues, extraction, vérification, consolidation, rapprochement,
// décision — sur des fixtures SYNTHÉTIQUES (fixtures/rapprochement/saint-exemple.json : noms inventés, jamais une preuve réelle, jamais réinjecté en
// base). Le modèle, le réseau et la géolocalisation sont remplacés par des réponses figées ; la base par un double qui répond aux seules requêtes prévues.
// Aucun réseau, aucun Neon, aucun appel payant.
// =====================================================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ENUMS, verifier, valeurEnum, analyseEnum, periodeAttestee, evaluer, memeAffaire, chercherJumelle, chercherDansMemoire, decisionJumelle, changementMateriel, cleVersion,
  fusionner, formeComparable, MACHINE_RE, DECIDEUR_MACHINE, entreeDepuisStock,
} from '../lib/qualifier-signal.mjs';
import { composerFile } from '../lib/discovery-file.mjs';
import { estDecisionMachine } from '../lib/decision-machine.mjs';
import { selectionnerMisesAJour } from '../lib/fiche-miseajour.mjs';
import { comparerSignaux, comparerEtablissements, rapprochementEtaye, niveauGeo } from '../lib/rapprochement-garde.mjs';
import { messageDecision, boutons } from '../lib/discovery-messages.mjs';
import { boutonValable } from '../lib/telegram-clics.mjs';

let n = 0;
const t = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const F = JSON.parse(readFileSync(new URL('../../fixtures/rapprochement/saint-exemple.json', import.meta.url), 'utf8'));

// --- harnais : modèle, pages, base, géolocalisation figés -------------------------------------------------------------
const cle = (k) => F.signaux[k].cle;
const sig = (k) => ({ ...F.signaux[k], urls: [{ url: F.signaux[k].url, media: F.signaux[k].media, published: F.signaux[k].published }] });
const clef = (s) => Object.keys(F.signaux).find((x) => F.signaux[x].cle === s.cle);
const pagesFn = async (s) => { const k = clef(s); return { pages: [{ url: F.signaux[k].url, media: F.signaux[k].media, published: F.signaux[k].published, corps: F.pages[k] }], erreurs: [] }; };
const comprendreFn = async ({ article }) => {
  const k = Object.keys(F.signaux).find((x) => article.body.includes(`url: ${F.signaux[x].url}`));
  const r = structuredClone(F.extractions[k]);
  r.preuves = r.preuves.map((p) => ({ ...p, url: F.signaux[k].url }));
  return { reponse: r, cout: { cout_usd: 0 } };
};
const geocoder = async () => ({ lat: 49.3, lng: 1.0, source: 'ban-commune' });
const cacheHistorique = () => {
  const m = new Map();
  for (const k of Object.values(F.cas)) for (const s of k.sources) m.set(s.url, { ok: true, corps: F.pages[s.page] ?? F.pages_historiques[s.page], url: s.url });
  return m;
};
/** Double de la base : ne répond qu'aux requêtes que `evaluer` doit poser (aucune écriture possible). */
const faux = (etat = {}) => async (strings, ...vals) => {
  const q = strings.join('?');
  if (/from new_case_proposals/.test(q)) return etat.propositions || [];
  const cas = (etat.cas || F.cas);
  if (/from cases c where c\.case_id/.test(q)) { const k = cas[vals[0]]; if (!k) return []; const { sources, ...c } = k; return [c]; }
  if (/from sources where case_id/.test(q)) return (cas[vals[0]]?.sources || []).map(({ page, ...s }) => s);
  throw new Error('requête non prévue : ' + q.slice(0, 100));
};
const lancer = (ordre, { index = F.index, etat = {}, contexte = { analyses: [], dry: false } } = {}) => (async () => {
  const sql = faux(etat);
  const sorties = [];
  for (const k of ordre) sorties.push(await evaluer({ sql, index, signal: sig(k), modele: 'fixture', cache: cacheHistorique(), contexte, pagesFn, comprendreFn, geocoder }));
  return { sorties, contexte };
})();
const ligne = (o) => ({ pid: 'aaaaaaaa-0000-4000-8000-000000000001', dedup_key: 'saint-exemple-les-testbeuf|ecole marcel-exemple|animateur periscolaire', recommendation: 'NEW_CASE_CANDIDATE', attach_case_id: null, decision: null, applied_at: null, created_case_id: null, decided_by: null, envoye: false, ...o });

console.log('\n  CAUSE 3 — le modèle renvoie des LISTES : ce n’est plus un repli neutre');
await t('valeurEnum : liste d’une valeur, casse et accents tolérés ; liste ambiguë ou valeur étrangère → rien', () => {
  assert.equal(valeurEnum(['enquête'], ENUMS.statut_judiciaire), 'enquête');
  assert.equal(valeurEnum('Enquete', ENUMS.statut_judiciaire), 'enquête');
  assert.equal(valeurEnum(['viol', 'agression sexuelle'], ENUMS.type_affaire), undefined);
  assert.equal(valeurEnum('école', ENUMS.type_structure), undefined);
  assert.equal(valeurEnum(null, ENUMS.type_structure), undefined);
});
const pageA = { url: F.signaux.A.url, media: 'Journal-Test', published: '2026-11-06', corps: F.pages.A };
const repA = () => { const r = structuredClone(F.extractions.A); r.preuves = r.preuves.map((p) => ({ ...p, url: pageA.url })); return r; };
await t('extraction réelle (listes) : stade « enquête » établi, rôle, personnes et période conservés ; la qualification juridique reste « à qualifier »', () => {
  const v = verifier(repA(), [pageA]);
  assert.equal(v.ok, true);
  assert.equal(v.c.statut_judiciaire, 'enquête'); assert.equal(v.c.role_mis_en_cause, 'animateur périscolaire');
  assert.equal(v.c.type_affaire, 'à qualifier');                       // procédure ≠ qualification : jamais fabriquée
  assert.equal(v.c.personnes, 1); assert.equal(v.c.periode_faits, '2026-09');
  assert.ok(!/à qualifier à la main/.test(v.c.ambiguite || ''));
});
await t('stade « à qualifier » relevé à ce que les citations ÉTABLISSENT (enquête ou plainte), jamais au-delà', () => {
  const v = verifier({ ...repA(), statut_judiciaire: 'à qualifier' }, [pageA]);
  assert.equal(v.c.statut_judiciaire, 'enquête');
  const pasAssez = verifier({ ...repA(), statut_judiciaire: 'à qualifier', preuves: [{ url: pageA.url, citation: 'Un animateur aurait eu un comportement déplacé envers des enfants, sur le temps périscolaire, à l\' école primaire Marcel-Exemple .' }] }, [pageA]);
  assert.equal(pasAssez.c.statut_judiciaire, 'à qualifier');          // une suspension ou des faits allégués n'établissent aucune procédure
});
await t('valeur hors énumération : repli neutre, et ce qui reste à qualifier est dit EN PREMIER (jamais tronqué)', () => {
  const v = verifier({ ...repA(), type_structure: 'école', ambiguite: 'x'.repeat(300) }, [pageA]);
  assert.match(v.c.ambiguite, /^champ\(s\) à qualifier à la main : type_structure/);
});
await t('période des faits : retenue seulement si elle figure dans les articles', () => {
  assert.equal(periodeAttestee('2026-09', ['les faits remontent au mois de septembre 2026']), '2026-09');
  assert.equal(periodeAttestee('2023-04', ['les faits remontent au mois de septembre 2026']), null);
  assert.equal(periodeAttestee('hier', ['septembre 2026']), null);
});

console.log('\n  IDENTITÉ — trois états par dimension (concordance · information absente · contradiction étayée)');
const forme = async (k) => { const r = await evaluer({ sql: faux(), index: [], signal: sig(k), modele: 'f', cache: cacheHistorique(), contexte: { analyses: [], dry: false }, pagesFn, comprendreFn, geocoder }); return r; };
const analyse = async (k) => { const ctx = { analyses: [], dry: false }; await evaluer({ sql: faux(), index: [], signal: sig(k), modele: 'f', cache: cacheHistorique(), contexte: ctx, pagesFn, comprendreFn, geocoder }); return ctx.analyses[0].cmp; };
const [cA, cB, cC, cE] = [await analyse('A'), await analyse('B'), await analyse('C'), await analyse('E')];
const etat = (r, nom) => r.dimensions.find((d) => d.nom === nom).etat;
await t('« école primaire X » et « école X » : même établissement ; A et B = même affaire sans page commune', () => {
  assert.equal(comparerEtablissements({ nom: cA.etablissement }, { nom: cB.etablissement }).etat, 'concordance');
  const r = comparerSignaux(cA, cB);
  assert.equal(r.verdict, 'meme');
  for (const d of ['commune', 'établissement', 'rôle', 'personnes', 'période des faits']) assert.equal(etat(r, d), 'concordance', d);
  assert.equal(etat(r, 'pages citées'), 'absente');                    // plus exigée
  assert.equal(memeAffaire(cA, cB).ok, true);
});
await t('personnes et période explicitement différentes → contradiction étayée : DISTINCTS, même école ; l’établissement reste « concordant »', () => {
  const r = comparerSignaux(cA, cE);
  assert.equal(r.verdict, 'distinct');
  assert.equal(etat(r, 'établissement'), 'concordance');
  assert.equal(etat(r, 'personnes'), 'contradiction'); assert.equal(etat(r, 'période des faits'), 'contradiction');
  assert.match(r.motif, /personnes/);
});
await t('information ABSENTE ≠ contradiction : sans nombre ni période d’un côté, la fusion reste possible et les deux états sont distingués', () => {
  const r = comparerSignaux(cA, { ...cB, personnes: null, periode_faits: null });
  assert.equal(r.verdict, 'meme');
  assert.equal(etat(r, 'personnes'), 'absente'); assert.equal(etat(r, 'période des faits'), 'absente');
  assert.equal(comparerEtablissements({ nom: 'école Marcel-Exemple' }, { nom: 'structure non nommée', nomme: false }).etat, 'absente');   // un nom absent n'est pas un nom différent
});
await t('acteur du signalement / de la plainte / de la partie civile, parutions éloignées, état judiciaire : jamais des contradictions', () => {
  const autre = { ...cB, evidence: cB.evidence.map((e) => ({ ...e, quote: e.quote.replace('mail envoyé par la commune', 'plainte déposée par les parents') })), articles: [{ ...cB.articles[0], published: '2026-12-30' }] };
  assert.equal(comparerSignaux(cA, autre).verdict, 'meme');
  assert.ok(!comparerSignaux(cA, cB).dimensions.some((d) => /acteur|date|parution|état|stade/i.test(d.nom)));
});
await t('établissements nommés différemment, ou deux types de structure d’un même groupe scolaire → distincts', () => {
  assert.equal(comparerSignaux(cA, { ...cB, etablissement: 'école Les Tilleuls' }).verdict, 'distinct');
  assert.equal(comparerSignaux({ ...cA, fiche: { ...cA.fiche, type_structure: 'maternelle' } }, { ...cB, fiche: { ...cB.fiche, type_structure: 'élémentaire' } }).verdict, 'distinct');
  // …mais « école » d'un côté et « périscolaire » de l'autre décrivent le même établissement (variation réelle du modèle sur A/B) : aucune contradiction.
  assert.equal(comparerSignaux({ ...cA, fiche: { ...cA.fiche, type_structure: 'élémentaire' } }, { ...cB, fiche: { ...cB.fiche, type_structure: 'périscolaire' } }).verdict, 'meme');
});
await t('communes différentes (même département) → distincts, même avec une page citée en commun (article multi-affaires)', () => {
  const autre = { ...cB, commune: 'Testville', evidence: cA.evidence };
  assert.equal(comparerSignaux(cA, autre).verdict, 'distinct');
});
await t('nom d’un côté seulement, aucune page en commun → AMBIGU, jamais fusionné', () => {
  const r = comparerSignaux(cA, { ...cB, etablissement: null, etablissement_nomme: false });
  assert.equal(r.verdict, 'ambigu'); assert.equal(memeAffaire(cA, { ...cB, etablissement: null, etablissement_nomme: false }).ok, false);
});

console.log('\n  CAUSE 1 — un voisin géographique n’est un candidat que s’il a un indice positif');
const geoFaible = { niveau: 'faible', raison: 'communes différentes (X / Y), même département' };
await t('même département seulement, aucun indice → non étayé (trace interne) ; une dépêche ou un fait daté commun → étayé', () => {
  const sans = rapprochementEtaye({ geo: geoFaible, etab: { etat: 'contradiction', detail: 'établissements nommés différemment' }, resolution: 'VOISIN', memeDepeche: false, datesCommunes: [] });
  assert.equal(sans.etaye, false); assert.match(sans.raison, /aucun indice positif/);
  assert.equal(rapprochementEtaye({ geo: geoFaible, etab: { etat: 'absente' }, resolution: 'VOISIN', memeDepeche: true, datesCommunes: [] }).etaye, true);
  assert.equal(rapprochementEtaye({ geo: geoFaible, etab: { etat: 'absente' }, resolution: 'VOISIN', memeDepeche: false, datesCommunes: ['2026-06-09'] }).etaye, true);
  assert.equal(rapprochementEtaye({ geo: { niveau: 'bloquant', raison: 'sans rapport' }, etab: { etat: 'absente' }, resolution: 'MATCH', memeDepeche: true, datesCommunes: [] }).etaye, false);
});
await t('même commune, établissement non nommé d’un côté → ambiguïté RÉELLE conservée ; même commune mais deux écoles nommées différemment → non étayé', () => {
  assert.equal(rapprochementEtaye({ geo: { niveau: 'ok', raison: null }, etab: { etat: 'absente' }, resolution: 'VOISIN', memeDepeche: false, datesCommunes: [] }).etaye, true);
  assert.equal(rapprochementEtaye({ geo: { niveau: 'ok', raison: null }, etab: { etat: 'contradiction', detail: 'x' }, resolution: 'VOISIN', memeDepeche: false, datesCommunes: [] }).etaye, false);
});

console.log('\n  CAS RÉEL REJOUÉ (fixture) — A + B, dans les deux ordres : une seule candidate, aucun arbitrage contre le voisin');
for (const ordre of ['AB', 'BA']) {
  await t(`ordre ${ordre} : une analyse réunie (2 pages, preuves des deux), 1 seul média → en attente de recoupement, AUCUNE proposition, AUCUN message`, async () => {
    const { sorties, contexte } = await lancer(ordre);
    assert.deepEqual(sorties.map((s) => s.statut), ['attente', 'attente']);
    assert.ok(sorties.every((s) => !s.proposition && !s.fusion && !s.remplace), 'ni proposition ni arbitrage contre FR-2026-9001');
    assert.deepEqual(sorties[1].regroupes, [cle(ordre[0])]);          // le runner applique la même issue au signal déjà évalué
    assert.equal(contexte.analyses.length, 1);
    const e = contexte.analyses[0];
    assert.deepEqual([...e.cles].sort(), [cle('A'), cle('B')].sort());
    assert.equal(e.lues.length, 2); assert.ok(e.evidence.length >= 7);  // toutes les preuves conservées
    assert.equal(e.c.statut_judiciaire, 'enquête'); assert.equal(e.c.role_mis_en_cause, 'animateur périscolaire'); assert.equal(e.c.type_structure, 'élémentaire');   // absence complétée par l'autre article
    assert.equal(new Set(e.evidence.map((x) => new URL(x.url).hostname)).size, 1);   // UN éditeur : jamais deux confirmations indépendantes
  });
}
await t('A + B + C (second média) : UNE candidate NEW_CASE, voisin FR-2026-9001 écarté en TRACE INTERNE, bouton unique, pas de RAPPROCHER', async () => {
  const { sorties, contexte } = await lancer('ABC');
  const r = sorties[2];
  assert.equal(r.statut, 'propose'); assert.equal(r.proposition.recommendation, 'NEW_CASE_CANDIDATE');
  const p = r.proposition.payload;
  assert.equal(p.attach, undefined); assert.equal(r.proposition.attach_case_id, null);
  assert.equal(p.rapprochement_ecarte?.case_id, 'FR-2026-9001'); assert.match(p.rapprochement_ecarte.raison, /aucun indice positif/);
  assert.equal(p.articles.length, 3); assert.equal(p.medias, 2);
  assert.deepEqual(r.regroupes.sort(), [cle('A'), cle('B')].sort());
  assert.equal(p.fiche.statut_judiciaire, 'enquête'); assert.equal(p.fiche.crit_statut_clair, true);
  assert.equal(contexte.analyses.length, 1);
  // publiabilité selon les critères existants : recoupement par deux éditeurs distincts (textes distincts), procédure établie, établissement nommé
  assert.ok(p.publication_directe || p.non_publiable?.length);
  // message : « nouvelle affaire candidate », deux articles du même éditeur ET leurs apports, procédure et mesure institutionnelle avec preuve et temporalité
  const m = messageDecision(p, r.proposition.recommendation);
  assert.match(m, /AFFAIRE POTENTIELLE · Saint-Exemple-lès-Testbeuf/); assert.doesNotMatch(m, /RAPPROCHEMENT/);
  assert.ok(m.includes(F.signaux.A.url) && m.includes(F.signaux.B.url) && m.includes(F.signaux.C.url), 'les trois articles, liens directs');
  assert.match(m, /↳ apport/); assert.match(m, /Procédure<\/b> : enquête — « /); assert.match(m, /3 article\(s\) · 2 éditeur\(s\) · 2 source\(s\) indépendante\(s\)/);
  assert.match(m, /Selon la presse, l’agent concerné a été suspendu de ses fonctions\. — mesure réalisée \(Journal-Test, paru le 06\/11\/2026\)/);
  assert.doesNotMatch(m, /dénomination différente/, '« école primaire X » / « école X » n’est pas une divergence');
  const b = JSON.stringify(boutons(r.proposition.recommendation, 'abcdef12', p));
  assert.ok(!/ATTACH/.test(b), 'aucun bouton RAPPROCHER vers FR-2026-9001');
});
await t('même mesure rapportée « réalisée » (A) puis « annoncée » (B) : jamais rétrogradée, quel que soit l’ordre', async () => {
  for (const ordre of ['ABC', 'BAC']) {
    const { sorties } = await lancer(ordre);
    assert.equal(sorties[2].proposition.payload.institutionnel.realisation, 'réalisée', ordre);
  }
});
await t('l’état judiciaire n’est pas confondu avec la mesure institutionnelle ni avec la qualification juridique', async () => {
  const { sorties } = await lancer('ABC');
  const p = sorties[2].proposition.payload;
  assert.equal(p.stade_minimal, 'enquête'); assert.equal(p.fiche.type_affaire, 'à qualifier'); assert.equal(p.institutionnel.event_type, 'suspension');
});

console.log('\n  AFFAIRE HISTORIQUE — une vraie mise à jour reste rapprochée (évolution de procédure, établissement partiellement nommé)');
await t('« école élémentaire Les Lilas-Test » vs « École Les Lilas-Test », plainte → mise en examen : rapprochement PROPOSÉ vers CETTE affaire, avec ses raisons', async () => {
  const { sorties } = await lancer('L'.split(''), { index: F.index });
  const r = sorties[0];
  assert.equal(r.statut, 'propose'); assert.equal(r.proposition.attach_case_id, 'FR-2026-9002');
  assert.ok(['ATTACH_EXISTING', 'REVIEW'].includes(r.proposition.recommendation));
  const a = r.proposition.payload.attach;
  assert.ok(a.pourquoi.length >= 1 && a.pourquoi.some((x) => /commune concordante/.test(x)), 'au moins un indice positif affiché');
  assert.ok(a.contre.some((x) => /état : « plainte » en base, « mise en examen »/.test(x)), 'l’évolution de procédure est dite, pas cachée');
  assert.equal(a.nouvelles.length, 1);
  const m = messageDecision(r.proposition.payload, r.proposition.recommendation);
  assert.match(m, /RAPPROCHEMENT/); assert.match(m, /FR-2026-9002/);
});

console.log('\n  MÊME DÉPARTEMENT SEULEMENT / MÊME COMMUNE — pas d’arbitrage artificiel, mais l’ambiguïté réelle reste soumise');
await t('un signal seul, voisin d’un autre commune : aucune sollicitation, signal conservé (attente)', async () => {
  const { sorties } = await lancer(['A']);
  assert.equal(sorties[0].statut, 'attente'); assert.equal(sorties[0].proposition, undefined);
});
await t('voisin de la MÊME commune sans établissement nommé : l’ambiguïté réelle reste un arbitrage, avec son indice positif et ce qui manque', async () => {
  const index = [{ case_id: 'FR-2026-9003', etablissement: 'Structure périscolaire (non nommée)', commune: 'Saint-Exemple-lès-Testbeuf', departement: 'Seine-Test', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'plainte', sources_dates: ['2026-09-20'] }];
  const cas = { 'FR-2026-9003': { case_id: 'FR-2026-9003', etablissement: 'Structure périscolaire (non nommée)', commune: 'Saint-Exemple-lès-Testbeuf', departement: 'Seine-Test', type_structure: 'périscolaire', role: 'animateur périscolaire',
    type_affaire: 'violences sexuelles', statut: 'plainte', publication: 'candidate', commentaire_validation: null, reexamen: false, sources: [] } };
  const { sorties } = await lancer(['A', 'C'], { index, etat: { cas } });
  const r = sorties[1];
  assert.equal(r.statut, 'propose'); assert.equal(r.proposition.recommendation, 'REVIEW'); assert.equal(r.proposition.attach_case_id, 'FR-2026-9003');
  assert.ok(r.proposition.payload.attach.pourquoi.some((x) => /commune concordante/.test(x)));
});
await t('voisin de la MÊME commune mais d’une AUTRE école NOMMÉE : contradiction étayée → non proposé', async () => {
  const index = [{ case_id: 'FR-2026-9004', etablissement: 'École Les Tilleuls', commune: 'Saint-Exemple-lès-Testbeuf', departement: 'Seine-Test', role_mis_en_cause: 'animateur périscolaire', statut_judiciaire: 'plainte', sources_dates: ['2026-09-20'] }];
  const cas = { 'FR-2026-9004': { case_id: 'FR-2026-9004', etablissement: 'École Les Tilleuls', commune: 'Saint-Exemple-lès-Testbeuf', departement: 'Seine-Test', type_structure: 'élémentaire', role: 'animateur périscolaire',
    type_affaire: 'violences sexuelles', statut: 'plainte', publication: 'candidate', commentaire_validation: null, reexamen: false, sources: [] } };
  const { sorties } = await lancer(['A', 'C'], { index, etat: { cas } });
  const r = sorties[1];
  assert.equal(r.statut, 'propose'); assert.equal(r.proposition.recommendation, 'NEW_CASE_CANDIDATE'); assert.equal(r.proposition.payload.attach, undefined);
  assert.match(r.proposition.payload.rapprochement_ecarte.raison, /établissements nommés différemment/);
});

console.log('\n  MÊME ÉCOLE, PERSONNES / ÉPISODES DISTINCTS — pas de fusion abusive');
await t('A puis E (« second animateur », autre période, 2 personnes) : deux analyses séparées, rien de fusionné', async () => {
  const { sorties, contexte } = await lancer(['A', 'E']);
  assert.equal(sorties[1].regroupes, undefined);
  assert.equal(contexte.analyses.length, 2);
  assert.equal(chercherDansMemoire(contexte.analyses.slice(0, 1), contexte.analyses[1].cmp, {}), null);
});
await t('non-transitivité : un signal « même affaire » que DEUX analyses distinctes n’est fusionné avec aucune, et l’ambiguïté est consignée', async () => {
  const m = [{ statut: 'attente', cmp: cA, cles: ['x'] }, { statut: 'attente', cmp: cB, cles: ['y'] }];
  assert.deepEqual(chercherDansMemoire(m, cC, {}), { ambigu: 2 });
  const fakeSql = async () => [ligne({ pid: 'p1', payload: cA }), ligne({ pid: 'p2', payload: cB })];
  assert.deepEqual(await chercherJumelle(fakeSql, cC), { ambigu: 2 });
});

console.log('\n  DEUX ARTICLES D’UNE MÊME ORIGINE ≠ DEUX PREUVES INDÉPENDANTES');
await t('deux éditeurs qui reprennent la même dépêche : 2 médias, 1 source indépendante → à revoir, jamais « nouvelle affaire recoupée »', async () => {
  const { sorties } = await lancer(['C', 'D']);
  const r = sorties[1];
  assert.equal(r.statut, 'propose'); assert.equal(r.proposition.recommendation, 'REVIEW');
  const p = r.proposition.payload;
  assert.equal(p.medias, 2); assert.equal(p.independantes, 1); assert.equal(p.fiche.crit_recoupement, false);
  assert.match(p.avertissement, /même dépêche/);
  assert.match(messageDecision(p, 'REVIEW'), /2 éditeur\(s\) · 1 source\(s\) indépendante\(s\)/);
});
await t('deux articles du MÊME éditeur : jamais deux confirmations (1 éditeur, donc en attente de recoupement)', async () => {
  const { sorties, contexte } = await lancer('AB');
  assert.equal(sorties[1].statut, 'attente');
  assert.match(sorties[1].motif, /un seul média/);
  assert.equal(new Set(contexte.analyses[0].lues.map((p) => new URL(p.url).hostname)).size, 1);
});

console.log('\n  ARRIVÉE INVERSÉE · DEUX PASSAGES · REJEU — une candidate cohérente, sources conservées, aucune notification inutile');
// Passage 1 : A + C → proposition P (dans la base, pas encore envoyée). Passage 2 : B arrive plus tard.
const passage1 = await lancer('AC');
const P = passage1.sorties[1].proposition;
const rowP = (o = {}) => ligne({ payload: P.payload, dedup_key: P.dedup_key, recommendation: P.recommendation, attach_case_id: P.attach_case_id, ...o });
await t('passage 2, proposition NON envoyée : B est fusionné EN PLACE (aucune seconde proposition), toutes les sources conservées', async () => {
  const { sorties } = await lancer(['B'], { etat: { propositions: [rowP()] } });
  const r = sorties[0];
  assert.equal(r.statut, 'fusion'); assert.equal(r.fusion.proposal_id, rowP().pid);
  assert.equal(r.fusion.payload.articles.length, 3); assert.ok(r.fusion.payload.evidence.length >= P.payload.evidence.length + 3);
  assert.equal(r.fusion.payload.medias, 2);
});
await t('rejeu identique : même état, même résultat (idempotent), rien de plus', async () => {
  const a = await lancer(['B'], { etat: { propositions: [rowP()] } });
  const b = await lancer(['B'], { etat: { propositions: [rowP({ payload: a.sorties[0].fusion.payload })] } });
  assert.equal(b.sorties[0].statut, 'fusion');
  assert.deepEqual(b.sorties[0].fusion.payload.articles, a.sorties[0].fusion.payload.articles);
  assert.deepEqual(b.sorties[0].fusion.payload.evidence, a.sorties[0].fusion.payload.evidence);
  assert.equal(b.sorties[0].fusion.payload.regroupes, a.sorties[0].fusion.payload.regroupes);
});
await t('proposition DÉJÀ ENVOYÉE, article sans fait nouveau (même éditeur, même mesure) : silence — aucune nouvelle sollicitation', async () => {
  const { sorties } = await lancer(['B'], { etat: { propositions: [rowP({ envoye: true })] } });
  assert.equal(sorties[0].statut, 'ecarte'); assert.match(sorties[0].motif, /rien de nouveau à décider/);
  assert.equal(sorties[0].proposition_jumelle, rowP().pid);          // le lien est consigné, l'ancienne proposition n'est PAS modifiée
});
await t('proposition DÉJÀ ENVOYÉE, média nouveau : NOUVELLE version (nouvelle clé, ancienne remplacée), jamais une modification en place', async () => {
  const Pc = (await lancer('AB')).contexte; void Pc;
  const base = (await lancer('AC')).sorties[1].proposition;       // P : A + C
  const ligneEnvoyee = ligne({ payload: base.payload, dedup_key: base.dedup_key, recommendation: base.recommendation, envoye: true });
  const { sorties } = await lancer(['D'], { etat: { propositions: [ligneEnvoyee] } });  // D : un éditeur nouveau
  const r = sorties[0];
  assert.equal(r.statut, 'remplace'); assert.match(r.motif, /un média nouveau \(Agence-Test\)/);
  assert.equal(r.remplace.proposal_id, ligneEnvoyee.pid);
  assert.equal(r.remplace.dedup_key, base.dedup_key + '#v2');
  assert.equal(r.remplace.payload.remplace.pid8, ligneEnvoyee.pid.slice(0, 8));
  assert.equal(r.remplace.payload.articles.length, 3);
  assert.match(messageDecision(r.remplace.payload, r.remplace.recommendation), /Version consolidée : elle remplace la proposition aaaaaaaa \(son bouton est inerte\)/);
});

console.log('\n  ANCIEN BOUTON — aucune mutation incorrecte, aucune substitution de version');
await t('une proposition envoyée et sans décision n’est JAMAIS fusionnée en place (remplacer ou se taire)', () => {
  for (const nouveau of [{ ...P.payload, articles: [...P.payload.articles, { url: 'https://autre.example/x', media: 'Autre' }] }, P.payload]) {
    const d = decisionJumelle(ligne({ envoye: true, payload: P.payload }), new Set(), nouveau);
    assert.ok(['remplacer', 'ecarte'].includes(d.action), d.action);
  }
  assert.equal(decisionJumelle(ligne({ envoye: true, decision: 'REVIEW_REQUIRED' }), new Set(), P.payload).action, 'ecarte');   // une décision de l'éditeur n'est pas rejouée
});
await t('une proposition remplacée (décision MACHINE) n’est ni un refus humain ni une jumelle : elle ne bloque et ne capte aucun signal', async () => {
  assert.ok(MACHINE_RE.test(DECIDEUR_MACHINE) && MACHINE_RE.test('reprise sans perte 06/11/2026 (agent, non humain)') && !MACHINE_RE.test('Adrien (Telegram)'));
  const fakeSql = async () => [ligne({ payload: cA, decision: 'REJECT', applied_at: 'x', decided_by: DECIDEUR_MACHINE })];
  assert.equal(await chercherJumelle(fakeSql, cB), null);
  const humain = async () => [ligne({ payload: cA, decision: 'REJECT', applied_at: 'x', decided_by: 'Adrien (Telegram)' })];
  assert.ok((await chercherJumelle(humain, cB)).row);                // un rejet HUMAIN, lui, reste une décision (la jumelle sera écartée)
});
await t('le bouton « RAPPROCHER » n’est valable que si le message actuel porte un candidat de rattachement ; la nouvelle version n’en porte pas', () => {
  assert.equal(boutonValable('ATTACH', { attach: { case_id: 'FR-2026-9001' }, fiche: {} }), true);
  assert.equal(boutonValable('ATTACH', P.payload), false);
  assert.equal(boutonValable('ATTACH', undefined), false);
});
await t('le remplacement est atomique et inerte : décision MACHINE seulement si encore sans décision et déjà envoyée, clé libérée, nouvelle version dans la même requête', () => {
  const r = src('scripts/discovery-quotidien.mjs');
  assert.ok(r.includes('where proposal_id = ${rp.proposal_id}::uuid and decision is null and applied_at is null'));
  assert.ok(r.includes('exists (select 1 from telegram_envois t where t.cle = proposal_id::text)'));
  assert.ok(r.includes("dedup_key = dedup_key || ${'#remplacee-' + rp.proposal_id.slice(0, 8)}") && r.includes('${DECIDEUR_MACHINE}'));
  assert.ok(r.includes('where exists (select 1 from ancienne)'), 'la nouvelle version n’existe que si l’ancienne a été remplacée dans la même requête');
  assert.ok(r.includes("and not exists (select 1 from telegram_envois t where t.cle = proposal_id::text)"), 'la fusion en place est refusée si le message est parti');
});
await t('le clic, lui, n’écrit que sur une proposition sans décision : un ancien bouton répond « déjà décidée »', () => {
  const v0 = src('scripts/telegram-v0.mjs');
  assert.ok(/update new_case_proposals[\s\S]{1,500}where proposal_id = \$\{pr\.pid\}::uuid and decision is null/.test(v0));
  assert.ok(v0.includes('double clic sur'));
  assert.ok(src('scripts/appliquer-nouvelles-affaires.mjs').includes('where decision is not null and applied_at is null'), 'une décision MACHINE (applied_at posé) n’est jamais appliquée');
});
await t('cleVersion : une chaîne de versions ne collisionne jamais avec l’ancienne clé', () => {
  assert.equal(cleVersion('a|b|c'), 'a|b|c#v2'); assert.equal(cleVersion('a|b|c#v2'), 'a|b|c#v3');
});
await t('changementMateriel : média nouveau, stade plus avancé, mesure passée à « réalisée », établissement nommé ; sinon rien', () => {
  const pl = { ...P.payload, institutionnel: { mesure: 'suspension_agent', realisation: 'annoncée' }, stade_minimal: 'plainte' };
  assert.equal(changementMateriel(pl, { ...pl, articles: [...pl.articles] }).materiel, false);
  assert.equal(changementMateriel(pl, { ...pl, stade_minimal: 'enquête' }).materiel, true);
  assert.equal(changementMateriel(pl, { ...pl, institutionnel: { mesure: 'suspension_agent', realisation: 'réalisée' } }).materiel, true);
  assert.equal(changementMateriel({ ...pl, etablissement_nomme: false }, { ...pl, etablissement_nomme: true }).materiel, true);
});

console.log('\n  RÉGRESSIONS — ce qui marchait doit marcher');
await t('fusion d’un signal dans une proposition ouverte : sources de tous, divergences consignées, mesure réalisée non rétrogradée', () => {
  const x = fusionner({ ...P.payload, institutionnel: { mesure: 'suspension_agent', realisation: 'réalisée', libelle_public: 'a' } }, { ...P.payload, articles: [], evidence: [], institutionnel: { mesure: 'suspension_agent', realisation: 'annoncée', libelle_public: 'b' } });
  assert.equal(x.institutionnel.realisation, 'réalisée');
  const y = fusionner({ ...P.payload, institutionnel: { mesure: 'suspension_agent', realisation: 'annoncée', libelle_public: 'b' } }, { ...P.payload, articles: [], evidence: [], institutionnel: { mesure: 'suspension_agent', realisation: 'réalisée', libelle_public: 'a' } });
  assert.equal(y.institutionnel.realisation, 'réalisée');
});
await t('géographie : Saint-Exemple / Testville (même département) est « faible », jamais « ok » ; deux départements sans rapport = « bloquant »', () => {
  assert.equal(niveauGeo({ commune: 'Saint-Exemple-lès-Testbeuf', departement: 'Seine-Test' }, { commune: 'Testville', departement: 'Seine-Test' }).niveau, 'faible');
  assert.equal(niveauGeo({ commune: 'Saint-Exemple-lès-Testbeuf', departement: 'Seine-Test' }, { commune: 'Autreville', departement: 'Nord-Test' }).niveau, 'bloquant');
});

// =====================================================================  FINITION (09/11/2026, 2e mandat) : file, dossiers anciens, normaliseur, décision machine
console.log('\n  FILE D’UN PASSAGE — chaque dossier en attente a son tour (sélection EXÉCUTÉE par le runner : lib/discovery-file.mjs)');
const jour = 864e5, T0 = Date.parse('2026-11-09T06:00:00Z');
const attenteSynth = (n) => Array.from({ length: n }, (_, i) => ({ cle: i.toString(16).padStart(20, '0'), titre: [0, 1, 2, 3, 4, 5].map((j) => `mot${i}x${j}`).join(' '), /* mots tous distincts : une histoire par dossier (pas de grappe) */ first_seen: new Date(T0 - (30 - i) * 60e3 - 5 * jour).toISOString(), last_checked: null, urls: [] }));
await t('45 dossiers en attente, plafond 8 : en six passages, TOUS sont examinés ; aucun n’est examiné deux fois avant que tous l’aient été une fois', () => {
  const etat = new Map(attenteSynth(45).map((r) => [r.cle, r]));
  const vus = new Map();
  for (let p = 0; p < 6; p++) {
    const f = composerFile({ candidatsNeufs: [], attente: [...etat.values()], maintenant: T0 + p * jour });
    const choisis = f.grappes.slice(0, 8).flatMap((g) => g.membres);
    for (const m of choisis) { vus.set(m.cle, (vus.get(m.cle) || 0) + 1); etat.get(m.cle).last_checked = new Date(T0 + p * jour).toISOString(); }
    if (p < 5) assert.ok(choisis.every((m) => (vus.get(m.cle) || 0) === 1), `passage ${p + 1} : aucun dossier déjà examiné ne repasse avant les autres`);
  }
  assert.equal(vus.size, 45);
});
await t('ancien ordre (première apparition) : les huit mêmes occupaient chaque passage — la propriété échoue, c’est ce que le test garde', () => {
  const rows = attenteSynth(45);
  const ancien = (r) => rows.slice().sort((a, b) => Date.parse(a.first_seen) - Date.parse(b.first_seen)).slice(0, 8).map((x) => x.cle);
  assert.deepEqual(ancien(1), ancien(2));
});
await t('les signaux jamais vus passent d’abord ; un dossier en échec technique dont l’examen est consigné cède sa place ; expiration à 21 jours inchangée', () => {
  const att = attenteSynth(12);
  const neufs = [{ cle: 'f'.repeat(20), titre: 'Une histoire toute nouvelle sur un fait divers inconnu', urls: [] }];
  const f = composerFile({ candidatsNeufs: neufs, attente: att, maintenant: T0 });
  assert.equal(f.grappes[0].rep.cle, 'f'.repeat(20));
  const apres = att.map((r, i) => (i === 0 ? { ...r, last_checked: new Date(T0).toISOString() } : r));     // l'échec du premier a consigné son examen
  assert.notEqual(composerFile({ candidatsNeufs: [], attente: apres, maintenant: T0 }).grappes[0].rep.cle, att[0].cle);
  const vieux = [{ ...att[0], first_seen: new Date(T0 - 22 * jour).toISOString() }, att[1]];
  assert.deepEqual(composerFile({ candidatsNeufs: [], attente: vieux, maintenant: T0 }).expires.map((r) => r.cle), [att[0].cle]);
});
await t('le runner consigne l’examen d’un échec technique et utilise composerFile (pas une copie du tri)', () => {
  const r = src('scripts/discovery-quotidien.mjs');
  assert.ok(r.includes('composerFile({ candidatsNeufs, attente })'));
  assert.ok(r.includes("update discovery_signaux set last_checked = now() where cle = any(${g.membres.map((m) => m.cle)}) and statut = 'attente'"));
  assert.ok(r.includes('const MAX = Number(arg(\'--max\', 8))'), 'plafond inchangé');
});

console.log('\n  DOSSIER ANCIEN — un article nouveau rejoint un dossier en attente, même loin dans la file, sans nouvel appel modèle');
const cacheAvec = (...ks) => { const m = cacheHistorique(); for (const k of ks) m.set(F.signaux[k].url, { ok: true, corps: F.pages[k], url: F.signaux[k].url }); return m; };
// Passage 1 : A seul → « en attente » ; son analyse vérifiée est rendue au runner pour conservation.
const p1 = await evaluer({ sql: faux(), index: F.index, signal: sig('A'), modele: 'fixture', cache: cacheAvec('A'), contexte: { analyses: [], dry: false }, pagesFn, comprendreFn, geocoder });
const stockA = JSON.parse(JSON.stringify(p1.analyse));      // ce que le runner écrit dans discovery_etat (JSON)
await t('l’analyse conservée ne contient AUCUN texte d’article : champs vérifiés, citations littérales, adresses des pages', () => {
  assert.equal(p1.statut, 'attente'); assert.equal(stockA.v, 1);
  assert.ok(!JSON.stringify(stockA).includes('Toujours selon nos informations, une enquête a été ouverte, pilotée depuis le commissariat de Testville, et plusieurs familles ont déjà été entendues.\n'));
  assert.deepEqual(stockA.pages.map((p) => p.url), [F.signaux.A.url]); assert.ok(stockA.evidence.length >= 3); assert.ok(!('corps' in stockA.pages[0]));
});
await t('passage plus tard : B (même affaire) rejoint A SANS que A soit requalifié (un seul appel modèle) ; sources et preuves de A conservées', async () => {
  let appels = 0;
  const compte = async (o) => { appels++; return comprendreFn(o); };
  const contexte = { analyses: [entreeDepuisStock(stockA)], dry: false };
  const r = await evaluer({ sql: faux(), index: F.index, signal: sig('B'), modele: 'fixture', cache: cacheAvec('A'), contexte, pagesFn, comprendreFn: compte, geocoder });
  assert.equal(appels, 1, 'seul le signal nouveau est extrait');
  assert.deepEqual(r.regroupes, [cle('A')]);                          // le runner applique la même issue au signal ancien
  assert.equal(r.statut, 'attente');                                  // un seul éditeur : la doctrine ne change pas
  const e = contexte.analyses.at(-1);
  assert.deepEqual([...e.cles].sort(), [cle('A'), cle('B')].sort()); assert.equal(e.lues.length, 2); assert.ok(e.evidence.length >= 7);
  assert.equal(contexte.analyses.filter((x) => x.stockee).length, 0, 'l’analyse conservée est consommée, pas dupliquée');
  assert.equal(r.analyse.cles[0], cle('A'), 'la conservation réécrit la clé du dossier ancien (une seule entrée)');
});
await t('le dossier ancien devenu recoupé par un second éditeur produit UNE proposition (nouvelle preuve, dossier consolidé) ; l’ancienne analyse conservée est effacée', async () => {
  const contexte = { analyses: [entreeDepuisStock(stockA)], dry: false };
  const r = await evaluer({ sql: faux(), index: F.index, signal: sig('C'), modele: 'fixture', cache: cacheAvec('A', 'C'), contexte, pagesFn, comprendreFn, geocoder });
  assert.equal(r.statut, 'propose'); assert.equal(r.proposition.recommendation, 'NEW_CASE_CANDIDATE');
  assert.equal(r.proposition.payload.articles.length, 2); assert.deepEqual(r.regroupes, [cle('A')]); assert.equal(r.analyse, undefined);
  const r2 = src('scripts/discovery-quotidien.mjs');
  assert.ok(r2.includes("else await oublier([...new Set([s.cle, ...g.membres.map((m) => m.cle), ...(r.regroupes || [])])])"));
});
await t('pages de l’ancien dossier illisibles ou citation disparue : AUCUNE fusion sur du texte non revérifié, la raison est consignée', async () => {
  for (const cache of [(() => { const m = cacheHistorique(); m.set(F.signaux.A.url, { ok: false, motif: 'HTTP 404', octets: 0 }); return m; })(),
    (() => { const m = cacheHistorique(); m.set(F.signaux.A.url, { ok: true, corps: 'Page remaniée : plus rien de ce qui était cité.', url: F.signaux.A.url }); return m; })()]) {
    const contexte = { analyses: [entreeDepuisStock(stockA)], dry: false };
    const r = await evaluer({ sql: faux(), index: F.index, signal: sig('B'), modele: 'fixture', cache, contexte, pagesFn, comprendreFn, geocoder });
    assert.equal(r.regroupes, undefined);
    assert.ok(contexte.analyses.some((x) => x.stockee), 'le dossier ancien reste conservé');
    assert.match(r.analyse.c.ambiguite, /non fusionné/);
  }
});
await t('le runner amorce la mémoire avec les seules analyses de dossiers ENCORE en attente, et conserve ou efface selon l’issue', () => {
  const r = src('scripts/discovery-quotidien.mjs');
  assert.ok(r.includes("s.cle = substr(e.cle, 9) and s.statut = 'attente'") && r.includes('entreeDepuisStock') && r.includes("on conflict (cle) do update set valeur = excluded.valeur"));
});

console.log('\n  NORMALISEUR — formes valides, ambiguës, invalides ; les preuves ne sont jamais contournées');
await t('chaîne reconnue, liste d’une valeur, valeurs répétées ÉQUIVALENTES (casse, accents) → compatibles et déterministes', () => {
  const V = ENUMS.statut_judiciaire;
  assert.deepEqual(analyseEnum('enquête', V), { valeur: 'enquête', forme: 'chaine', etat: 'ok' });
  assert.equal(analyseEnum(['enquête'], V).valeur, 'enquête');
  assert.deepEqual(analyseEnum(['enquête', 'Enquete', ' enquête '], V), { valeur: 'enquête', forme: 'liste', etat: 'ok' });
});
await t('liste vide, valeur étrangère, absent, catégories incompatibles, valeur reconnue mêlée à une étrangère → AUCUN choix arbitraire (jamais le premier élément)', () => {
  const V = ENUMS.statut_judiciaire;
  assert.deepEqual([analyseEnum([], V).etat, analyseEnum(['inconnu'], V).etat, analyseEnum(undefined, V).etat, analyseEnum(null, V).etat], ['vide', 'invalide', 'absent', 'absent']);
  assert.equal(analyseEnum(['plainte', 'enquête'], V).valeur, undefined); assert.equal(analyseEnum(['plainte', 'enquête'], V).etat, 'ambigu');
  assert.equal(analyseEnum(['enquête', 'n’importe quoi'], V).etat, 'ambigu');
  assert.equal(analyseEnum({ valeur: 'enquête' }, V).etat, 'invalide'); assert.equal(analyseEnum(3, V).etat, 'invalide');
});
await t('un champ ambigu n’en neutralise pas d’autres ; la forme originale et la raison du repli sont conservées pour le diagnostic', () => {
  const v = verifier({ ...repA(), type_affaire: ['viol', 'agression sexuelle'], role_mis_en_cause: [], statut_judiciaire: ['enquête', 'Enquête'] }, [pageA]);
  assert.equal(v.ok, true);
  assert.equal(v.c.type_affaire, 'à qualifier'); assert.equal(v.c.role_mis_en_cause, 'autre');                                  // repli NEUTRE, pas le premier élément
  assert.equal(v.c.statut_judiciaire, 'enquête'); assert.equal(v.c.statut_des_faits, 'allégué'); assert.equal(v.c.enfants_concernes_public, 'plusieurs enfants');   // les autres champs valides restent
  assert.deepEqual(v.c.diag_enum.repli, { type_affaire: 'ambigu', role_mis_en_cause: 'vide' });
  assert.ok(v.c.diag_enum.liste.includes('statut_judiciaire'));
});
await t('une liste valide ne contourne PAS les preuves : citations inventées → rejet ; stade annoncé en liste mais non établi → ramené', () => {
  assert.equal(verifier({ ...repA(), statut_judiciaire: ['procès'], preuves: repA().preuves.slice(0, 3) }, [pageA]).c.statut_judiciaire, 'enquête');          // procès annoncé : les citations n'établissent que l'enquête
  assert.equal(verifier({ ...repA(), statut_judiciaire: ['enquête'], preuves: repA().preuves.slice(0, 1) }, [pageA]).c.statut_judiciaire, 'à qualifier');   // une enquête sans autorité nommée n'est pas établie
  const v = verifier({ ...repA(), preuves: [{ url: pageA.url, citation: 'Citation inventée qui ne figure nulle part dans la page lue par le modèle.' }] }, [pageA]);
  assert.equal(v.ok, false);
});
await t('le diagnostic atteint la proposition : forme originale des champs (liste récupérée / repli et sa raison)', async () => {
  const { sorties } = await lancer('AC');
  assert.equal(sorties[1].proposition.payload.diag_extraction.liste.length, 6);     // proposition réunie A + C : la forme d'origine de A (six listes) est conservée dans le payload
  const e = await (async () => { const ctx = { analyses: [], dry: false }; await evaluer({ sql: faux(), index: [], signal: sig('A'), modele: 'f', cache: cacheHistorique(), contexte: ctx, pagesFn, comprendreFn, geocoder }); return ctx.analyses[0]; })();
  assert.equal(e.c.diag_enum.liste.length, 6);                          // les six champs de la réponse A étaient des listes
});

console.log('\n  DÉCISION MACHINE ≠ REFUS HUMAIN — jusque dans les traitements réellement concernés');
await t('marqueur : les trois signatures d’agent existantes sont machine ; les décisions de personnes ne le sont jamais', () => {
  for (const m of ['consolidation Discovery 09/11/2026 (agent, non humain)', 'reprise sans perte 06/11/2026 (agent, non humain)', 'système (doublon, consolidation autorisée par Adrien)', 'consolidation lot #1 (agent, non humain)']) assert.equal(estDecisionMachine(m), true, m);
  for (const h of ['Adrien (Telegram)', 'Adrien Etienne', 'Adrien (lot de validation #1, 25/09/2026)', '', null]) assert.equal(estDecisionMachine(h), false, String(h));
});
await t('A/B/C après remplacement : une preuve nouvelle produit une NOUVELLE proposition, non bloquée par l’ancien REJECT machine (A et B restent éligibles)', async () => {
  const anciens = ['A', 'B'].map((k, i) => ligne({ pid: `00000000-0000-4000-8000-00000000000${i + 1}`, dedup_key: `cle|ancienne#remplacee-0000000${i + 1}`, payload: i ? cB : cA, decision: 'REJECT', applied_at: 'x', decided_by: DECIDEUR_MACHINE, envoye: true }));
  const { sorties } = await lancer('ABC', { etat: { propositions: anciens } });
  assert.equal(sorties[2].statut, 'propose'); assert.equal(sorties[2].proposition.recommendation, 'NEW_CASE_CANDIDATE');
  assert.equal(sorties[2].proposition.payload.articles.length, 3);
  assert.notEqual(sorties[2].statut, 'ecarte');
});
await t('contre-épreuve : le MÊME REJECT signé par Adrien reste une décision humaine — le signal est écarté, jamais rejoué', async () => {
  const humain = ligne({ payload: cA, decision: 'REJECT', applied_at: 'x', decided_by: 'Adrien (Telegram)' });
  const j = await chercherJumelle(async () => [humain], cB);
  assert.equal(decisionJumelle(j.row, new Set()).action, 'ecarte');
  assert.equal(decisionJumelle({ ...humain, decided_by: DECIDEUR_MACHINE }, new Set()).action, 'attente');   // défense en profondeur : jamais « rejetée »
});
await t('sélection des mises à jour de fiche : un REJECT machine est « invalidé par une décision machine », jamais « refusé par l’éditeur »', () => {
  const ligneMaj = (o) => ({ k: 'k1', case_id: 'FR-2026-9100', url: 'https://x.example/a', media: 'X', pd: '2026-11-01', rat: 'OK', decision: 'REJECT', facts: [], ...o });
  const motif = (l) => selectionnerMisesAJour({ lignes: [l], publie: new Map(), approuvee: () => true, holds: new Set(), deja: new Set() }).ecartees[0].motif;
  assert.equal(motif(ligneMaj({ decideur: 'Adrien (Telegram)' })), 'REFUSEE_PAR_L_EDITEUR');
  assert.equal(motif(ligneMaj({ decideur: 'reprise sans perte 06/11/2026 (agent, non humain)' })), 'INVALIDEE_PAR_DECISION_MACHINE');
  assert.equal(motif(ligneMaj({})), 'REFUSEE_PAR_L_EDITEUR');
});
await t('rapport des décisions : une décision machine n’est pas listée comme un choix de l’éditeur ; l’historique reste lisible', () => {
  const e = src('scripts/etat-decisions.mjs');
  assert.ok(e.includes('estDecisionMachine(n.decided_by)') && e.includes("l.etat = 'REMPLACÉE'") && e.includes('n.decided_by'));
  assert.ok(src('scripts/telegram-v0.mjs').includes('decision is null'), 'le clic n’écrit que sur une proposition sans décision (ancien bouton : déjà décidée)');
});

console.log('\n  TENTATIVES D’EXTRACTION — aucune nouvelle, le plafond réel est celui de la reprise (3), succès toujours conditionné aux preuves');
await t('evaluer / comprendre ne réessaient pas ; la seule boucle est celle de la reprise (≤ 3 passes, seulement pour les signaux ÉCARTÉS ; les extractions valides ne sont pas rejouées)', () => {
  assert.ok(!/retry|réessa|attempt/i.test(src('scripts/lib/comprendre-source.mjs').replace(/réessayé au prochain run/g, '')), 'comprendre : un seul appel');
  const q = src('scripts/lib/qualifier-signal.mjs');
  assert.equal((q.match(/await comprendreFn\(/g) || []).length, 1, 'evaluer : une extraction par signal et par passage');
  const rp = src('scripts/reprendre-rapprochement.mjs');
  assert.ok(rp.includes('essai <= 3') && rp.includes("!['attente', 'propose'].includes(s.statut)"));
});

console.log(`\n  ${n} contrôles : OK\n`);
