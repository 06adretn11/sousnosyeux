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
  ENUMS, verifier, valeurEnum, periodeAttestee, evaluer, memeAffaire, chercherJumelle, chercherDansMemoire, decisionJumelle, changementMateriel, cleVersion,
  fusionner, formeComparable, MACHINE_RE, DECIDEUR_MACHINE,
} from '../lib/qualifier-signal.mjs';
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

console.log(`\n  ${n} contrôles : OK\n`);
