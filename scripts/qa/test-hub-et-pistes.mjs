// Deux écarts de la boucle Maintenance Telegram (24/10/2026) :
//   1. une proposition de nouveau Hub doit être ACTIONNABLE (préparer un brouillon consultable, sans jamais publier) ;
//   2. un « À lire aussi » est une PISTE de découverte, jamais une preuve ; l'article lié fournit sa propre preuve, sa date et sa portée.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decoderCallback, boutonValable } from '../lib/telegram-clics.mjs';
import { boutons, messageDecision, messageEnrichissement } from '../lib/discovery-messages.mjs';
import { payloadProposition, composerBrouillonHub, slugTerritoire, urlBrouillon } from '../lib/hub-brouillon.mjs';
import { diagnostiquer } from '../lib/diagnostic-territoire.mjs';
import { extraireCorps, estPisteDeNavigation } from '../lib/corps-article.mjs';
import { extraireReactions } from '../lib/evenement-institutionnel.mjs';
import { evidenceLitterale } from '../lib/comprendre-source.mjs';
import { pistesASuivre } from '../lib/pistes.mjs';

let n = 0; const t = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

// --- fixtures ----------------------------------------------------------------------------------------------------------
const affaire = (id, commune, statut, sources) => ({ case_id: id, etablissement: `École de ${commune}`, commune, departement: 'Landes', type_structure: 'école', role_mis_en_cause: 'enseignant',
  type_affaire: 'violences', statut_judiciaire: statut, statut_des_faits: 'allégué', enfants_concernes_public: 'non précisé', lat: 43.9, lng: -0.9, geocode_source: 'ban-commune',
  sources: sources.map(([media, url, d], i) => ({ url, media, publication_date: d, source_type: 'presse', is_primary: i === 0 })) });
const CASES = [
  affaire('FR-2026-0901', 'Tarnos', 'mise en examen', [['Sud Ouest', 'https://www.sudouest.fr/a1', '2026-07-06'], ['Mediapart', 'https://www.mediapart.fr/x', '2026-07-08']]),
  affaire('FR-2026-0902', 'Mées', 'procès', [['ICI', 'https://www.ici.fr/b1', '2026-09-25']]),
];
const EVTS = [{ case_id: 'FR-2026-0901', type: 'réponse_institutionnelle', date: null, libelle: 'Selon la presse, la collectivité a annoncé un plan d’action.', realisation: 'annoncée',
  source: { media: 'ici', url: 'https://www.ici.fr/e1', publication_date: '2026-10-07' } }];
const ETAT = { hub: null, publiques: ['FR-2026-0902', 'FR-2026-0901'], horsHub: [], candidatesValidees: 0, reviewNonPublic: 0, evenements: 1, reactions: 1, sources: 3, avecMatiere: 1, _dep: 'Landes' };
const TERR = { slug: 'landes', titre: 'Landes', departement: 'Landes' };

// --- 1. Hub -------------------------------------------------------------------------------------------------------------
const d = diagnostiquer(ETAT, { publiques: 0, horsHub: 0, candidatesValidees: 0, reviewNonPublic: 0, evenements: 0, reactions: 0, sources: 0 });
const { payload, cle } = payloadProposition('landes', ETAT, d);

t('le cas Landes est bien un PROPOSER_NOUVEAU_HUB (la proposition existe, c\'est son action qui manquait)', () => assert.equal(d.decision, 'PROPOSER_NOUVEAU_HUB'));
t('la proposition de Hub envoyée porte une action fonctionnelle : un bouton décodable par le circuit de clics existant', () => {
  const kb = boutons('REVIEW', 'abcd1234', payload).inline_keyboard.flat();
  const prep = kb.find((b) => /PRÉPARER LE HUB/.test(b.text));
  assert.ok(prep, 'bouton PRÉPARER LE HUB absent');
  assert.deepEqual(decoderCallback(prep.callback_data), { type: 'NC', action: 'VALIDATE', cle: 'abcd1234' });
  assert.ok(kb.some((b) => decoderCallback(b.callback_data)?.action === 'REVIEW') && kb.some((b) => decoderCallback(b.callback_data)?.action === 'REJECT'));
});
t('le bouton est VALABLE pour ce message, et seulement lui : un clic « Hub » ne peut ni créer une fiche, ni rattacher, ni publier', () => {
  assert.equal(boutonValable('VALIDATE', payload), true);
  for (const a of ['CREATE', 'ATTACH', 'PENDING']) assert.equal(boutonValable(a, payload), false, a);
  assert.equal(boutonValable('VALIDATE', { hub: { territoire: 'x' } }), false, 'sans identifiant de dossier : non valable');
});
t('le message annonce ce que fait le bouton, et que rien n\'est publié', () => {
  const m = messageDecision(payload, 'REVIEW');
  assert.match(m, /PRÉPARER LE HUB/); assert.match(m, /BROUILLON/); assert.match(m, /Aucune page n’est créée ni publiée/); assert.match(m, /Landes/);
  assert.doesNotMatch(m, /se prend dans la conversation/);
});
t('une même proposition de périmètre ne se duplique pas : clé stable à l\'ordre près, nouvelle seulement si le périmètre change', () => {
  assert.equal(payloadProposition('landes', { ...ETAT, publiques: [...ETAT.publiques].reverse() }, d).cle, cle);
  assert.notEqual(payloadProposition('landes', { ...ETAT, publiques: [...ETAT.publiques, 'FR-2026-0903'] }, d).cle, cle);
});
t('préparer = un dossier de revue consultable : affaires, sources, réponse publique, couverture, contrôles, empreinte, « aucune publication »', () => {
  const r = composerBrouillonHub({ territoire: TERR, cases: CASES, evenements: EVTS, genere_le: '2026-10-25' });
  for (const s of ['FR-2026-0901', 'FR-2026-0902', 'Tarnos', 'Mées', 'https://www.sudouest.fr/a1', 'https://www.ici.fr/e1', 'plan d’action', 'Couverture de presse dans le temps', 'BROUILLON — aucune publication', r.hash]) assert.ok(r.markdown.includes(s), s);
  assert.match(r.markdown, /2 affaire\(s\) publique\(s\) dans 2 commune\(s\)/);
  assert.match(urlBrouillon(r.slug), /\/docs\/industrialisation\/hub-drafts\/landes\.md$/);
});
t('le dossier n\'invente ni ne publie : média payant écarté, aucun événement d\'une autre affaire, aucun lien postulé entre les affaires', () => {
  const r = composerBrouillonHub({ territoire: TERR, cases: CASES, evenements: [...EVTS, { ...EVTS[0], case_id: 'FR-2026-0777', libelle: 'ÉVÉNEMENT ÉTRANGER' }], genere_le: '2026-10-25' });
  assert.ok(!/mediapart/i.test(r.markdown)); assert.ok(!r.markdown.includes('ÉVÉNEMENT ÉTRANGER')); assert.match(r.markdown, /ne postule aucun lien/);
});
t('rejouer ne crée pas de doublon : mêmes données → même empreinte et même dossier ; données modifiées → autre empreinte', () => {
  const a = composerBrouillonHub({ territoire: TERR, cases: CASES, evenements: EVTS, genere_le: '2026-10-25' });
  const b = composerBrouillonHub({ territoire: TERR, cases: CASES, evenements: EVTS, genere_le: '2026-10-25' });
  assert.equal(a.hash, b.hash); assert.equal(a.markdown, b.markdown);
  assert.notEqual(composerBrouillonHub({ territoire: TERR, cases: CASES.slice(0, 1), evenements: EVTS, genere_le: '2026-10-25' }).hash, a.hash);
});
t('une impossibilité est dite, jamais présentée comme un succès : aucune affaire publique → erreur ; identifiant de fichier hostile refusé', () => {
  assert.throws(() => composerBrouillonHub({ territoire: TERR, cases: [], genere_le: '2026-10-25' }), /aucune affaire publique/);
  assert.throws(() => composerBrouillonHub({ territoire: { ...TERR, slug: '../../etc/x' }, cases: CASES, genere_le: '2026-10-25' }), /invalide/);
  assert.equal(slugTerritoire('Côtes-d’Armor'), 'cotes-d-armor');
});

// --- 2. Preuve : « À lire aussi » = piste, pas preuve --------------------------------------------------------------------
const RFI_A = 'https://www.rfi.fr/fr/france/20260915-peine-de-prison-ferme-scandale-periscolaire-parisien';
const LIEN = 'https://www.rfi.fr/fr/france/20260321-france-des-parents-rassembl%C3%A9s-%C3%A0-paris';
const page = (corps, titre = 'Article') => `<html><head><title>${titre}</title></head><body>${corps}</body></html>`;
const HTML_A = page(
  '<p>Un animateur a été condamné mardi à Paris à cinq ans de prison pour agressions sexuelles sur des élèves de l’école Vigée-Lebrun dans le XVe arrondissement.</p>'
  + `<p class="a-read-more"><span class="a-read-more__label">À lire aussi</span><a href="${LIEN}">France: des parents rassemblés à Paris contre les violences sexuelles dans le périscolaire</a></p>`
  + '<p>Le parquet a fait appel de la relaxe de deux autres animateurs, ce qui a provoqué la colère de plusieurs familles et associations spécialisées.</p>', 'France: première peine ferme - RFI');

t('l\'« À lire aussi » sort du corps de l\'article : il n\'est plus du texte que l\'on peut citer', () => {
  const r = extraireCorps(HTML_A, RFI_A);
  assert.ok(!/rassembl/i.test(r.corps.replace(r.titre, '')), 'le titre du lien associé est resté dans le corps');
  assert.equal(r.paragraphes.length, 2);
});
t('… mais il est CONSERVÉ comme piste de découverte, avec son adresse', () => {
  const r = extraireCorps(HTML_A, RFI_A);
  assert.deepEqual(r.liens_associes, [{ titre: 'France: des parents rassemblés à Paris contre les violences sexuelles dans le périscolaire', url: LIEN }]);
});
t('un « À lire aussi » seul ne fait plus une réaction proposée : ni dans le corps nettoyé, ni dans un corps déjà mémorisé qui le contient encore', () => {
  assert.deepEqual(extraireReactions(extraireCorps(HTML_A, RFI_A).corps, { etablissement: 'École Vigée Lebrun', anneeRef: '2026-09-15' }), []);
  const ancien = 'Un animateur a été condamné mardi à Paris à cinq ans de prison.\n\nÀ lire aussi France: des parents rassemblés à Paris contre les violences sexuelles dans le périscolaire\n\nLe parquet a fait appel.';
  assert.deepEqual(extraireReactions(ancien, { etablissement: 'École Vigée Lebrun', anneeRef: '2026-09-15' }), []);
});
t('voie modèle : une citation qui n\'est qu\'un « À lire aussi » est INVALIDE même si elle figure dans la page', () => {
  const corps = 'Texte.\n\nÀ lire aussi France: des parents rassemblés à Paris contre les violences\n\nSuite du texte réel.';
  assert.deepEqual(evidenceLitterale({ evidence: ['À lire aussi France: des parents rassemblés à Paris contre les violences', 'Suite du texte réel.'] }, corps),
    ['À lire aussi France: des parents rassemblés à Paris contre les violences']);
  assert.ok(estPisteDeNavigation('Lire aussi : « un titre »') && !estPisteDeNavigation('Les parents ont lu aussi la lettre'));
});
t('un fait directement documenté dans le CORPS reste admissible (la garde ne supprime pas la preuve réelle)', () => {
  const corps = extraireCorps(page('<p>Un rassemblement de plusieurs parents du collectif était organisé ce samedi matin devant la mairie de Paris pour alerter les autorités.</p>'), 'https://x.fr/a').corps;
  const r = extraireReactions(corps, { etablissement: 'École Vigée Lebrun', anneeRef: '2026-03-24' });
  assert.equal(r.length, 1); assert.equal(r[0].mesure, 'rassemblement'); assert.match(r[0].evidence.join(' '), /devant la mairie de Paris/);
});
t('pistes bornées : même éditeur, jamais la source elle-même, jamais deux fois, ≤ 2, et seulement si le titre annonce un fait', () => {
  const liens = [
    { titre: 'France: des parents rassemblés à Paris contre les violences sexuelles dans le périscolaire', url: LIEN },
    { titre: 'Les parents rassemblés à Lyon contre les violences sexuelles dans le périscolaire', url: 'https://autre-media.fr/x' },
    { titre: 'Recevez toute l’actualité internationale directement dans votre boite mail', url: 'https://www.rfi.fr/newsletter' },
    { titre: 'Les parents rassemblés à Nantes pour dénoncer les violences périscolaires', url: RFI_A },
    { titre: 'Des parents se sont rassemblés à Lille contre les violences sexuelles dans le périscolaire', url: 'https://www.rfi.fr/lille' },
    { titre: 'Des parents se sont rassemblés à Brest contre les violences sexuelles dans le périscolaire', url: 'https://www.rfi.fr/brest' },
  ];
  const deja = new Set();
  const p = pistesASuivre(liens, { url: RFI_A, deja });
  assert.deepEqual(p.map((x) => x.url), [LIEN, 'https://www.rfi.fr/lille']);
  assert.deepEqual(pistesASuivre(liens, { url: RFI_A, deja }).map((x) => x.url), ['https://www.rfi.fr/brest'], 'les pistes déjà suivies ne le sont pas deux fois');
});
t('l\'article LIÉ fournit sa propre preuve : citation de SON corps, date de l\'événement ≠ date de publication, portée = territoire que la source nomme', () => {
  const lie = extraireCorps(page(
    '<p>Pour alerter les autorités, un rassemblement de plusieurs parents du collectif était organisé ce samedi matin devant la mairie de Paris contre les violences dans le périscolaire.</p>',
    'France: des parents rassemblés à Paris contre les violences sexuelles dans le périscolaire - RFI'), LIEN);
  const [f] = extraireReactions(lie.corps, { etablissement: 'École Vigée Lebrun', anneeRef: '2026-03-24' }); // publié un mardi, le rassemblement date du samedi précédent
  assert.equal(f.event_date, '2026-03-21'); assert.notEqual(f.event_date, '2026-03-24');
  assert.equal(f.portee, 'territoire'); assert.equal(f.territoire, 'Paris'); assert.notEqual(f.territoire, 'Paris 15e');
  assert.ok(f.evidence.some((e) => /devant la mairie de Paris/.test(e)));
  assert.ok(f.evidence.every((e) => lie.corps.includes(e)), 'toute citation vient du corps de l\'article lié');
});
t('sans date écrite : la date de PUBLICATION n\'est jamais prise pour celle du rassemblement', () => {
  const [f] = extraireReactions(extraireCorps(page('<p>Un rassemblement de plusieurs parents du collectif a eu lieu devant la mairie de Paris contre les violences périscolaires.</p>'), LIEN).corps,
    { etablissement: 'École Vigée Lebrun', anneeRef: '2026-03-24' });
  assert.equal(f.event_date, null);
});
t('la portée vient du contenu probant : le message ne rattache pas un fait territorial à la commune de la fiche d\'où l\'on est parti', () => {
  const base = { etablissement: 'École Vigée Lebrun', commune: 'Paris 15e', courant: 'condamnation non définitive', media: 'RFI', publication_date: '2026-09-15', url: RFI_A };
  const fait = { libelle_public: 'Selon la presse, des parents ont tenu un rassemblement.', realisation: 'réalisée', acteur: 'parents', evidence: ['Un rassemblement de parents.'], event_date: null };
  const sans = messageEnrichissement(base, [fait], true);
  assert.match(sans, /Territoire : non établi par la source/); assert.doesNotMatch(sans, /Territoire : Paris 15e/); assert.doesNotMatch(sans, /état judiciaire inchangé|ENRICHISSEMENT PROPOSÉ/); assert.match(sans, /date non établie/);
  assert.match(messageEnrichissement(base, [{ ...fait, territoire: 'Paris' }], true), /Territoire : Paris</);
});
t('le passage présenté comme preuve est une phrase du corps, pas le titre de la page', () => {
  const base = { etablissement: 'École Vigée Lebrun', commune: 'Paris 15e', courant: 'enquête', media: 'RFI', publication_date: '2026-03-21', url: LIEN };
  const f = { libelle_public: 'Selon la presse, des parents ont tenu un rassemblement.', realisation: 'réalisée', acteur: 'parents', territoire: 'Paris', event_date: '2026-03-21',
    evidence: ['France: des parents rassemblés à Paris contre les violences sexuelles dans le périscolaire - RFI', 'Un rassemblement de plusieurs parents était organisé ce samedi matin devant la mairie de Paris.'] };
  const m = messageEnrichissement(base, [f], true);
  assert.match(m, /« Un rassemblement de plusieurs parents était organisé/); assert.doesNotMatch(m, /« France: des parents rassemblés/);
  assert.match(messageEnrichissement(base, [{ ...f, evidence: [f.evidence[0]] }], true), /« France: des parents/, 'sans autre passage, le titre reste le seul repère');
});
t('un titre seul ne suffit pas à proposer un enrichissement ; titre + phrase du corps reste admissible', () => {
  const TITRE = 'France: des parents rassemblés à Paris contre les violences sexuelles dans le périscolaire - RFI';
  const seul = extraireCorps(page('<p>Le secteur du périscolaire est éclaboussé depuis plusieurs semaines par une multiplication des cas de violences signalés dans des écoles.</p>', TITRE), 'https://x.fr/a');
  const opts = { etablissement: 'École Vigée Lebrun', anneeRef: '2026-03-21', titre: seul.corps.split('\n\n')[0] };
  assert.equal(extraireReactions(seul.corps, { ...opts, titre: '' }).length, 1, 'sans la garde, le titre seul faisait une proposition');
  assert.deepEqual(extraireReactions(seul.corps, opts), []);
  const avec = extraireCorps(page('<p>Pour alerter les autorités, un rassemblement de plusieurs parents du collectif était organisé ce samedi matin devant la mairie de Paris.</p>', TITRE), 'https://x.fr/b');
  const [f] = extraireReactions(avec.corps, { ...opts, titre: avec.corps.split('\n\n')[0] });
  assert.ok(f && f.evidence.some((e) => /devant la mairie de Paris/.test(e)));
});
t('date de publication de la page lue : méta, JSON-LD, sinon adresse — jamais devinée', () => {
  assert.equal(extraireCorps('<html><head><meta property="article:published_time" content="2026-03-21T08:00:00+01:00"></head><body><p>' + 'x'.repeat(80) + '</p></body></html>', 'https://x.fr/a').publie_le, '2026-03-21');
  assert.equal(extraireCorps(page('<p>' + 'x'.repeat(80) + '</p>'), 'https://x.fr/20260321-titre').publie_le, '2026-03-21');
  assert.equal(extraireCorps(page('<p>' + 'x'.repeat(80) + '</p>'), 'https://x.fr/titre-sans-date').publie_le, null);
});

// --- suivi d'une piste : article lié lu comme une source, ou incertitude conservée -------------------------------------------
const at = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const LIE_HTML = page('<p>Pour alerter les autorités, un rassemblement de plusieurs parents du collectif était organisé ce samedi matin devant la mairie de Paris contre les violences périscolaires.</p>',
  'France: des parents rassemblés à Paris contre les violences sexuelles dans le périscolaire - RFI');
const lirePageFictive = (html, url) => async () => { const r = extraireCorps(html, url); return { ok: true, corps: r.corps, liens: r.liens_associes, publie_le: '2026-03-21', url }; };

await at('suivre la piste : l\'article lié est lu et qualifié pour la même affaire, avec SA date de publication, une seule fois (profondeur 1)', async () => {
  const appels = []; const compte = {};
  const { suivrePistes } = await import('../lib/pistes.mjs');
  const r = await suivrePistes({ liens: extraireCorps(HTML_A, RFI_A).liens_associes, url: RFI_A, deja: new Set(), max: 2, lire: lirePageFictive(LIE_HTML, LIEN), compte: (k) => { compte[k] = (compte[k] || 0) + 1; },
    qualifier: async ({ page, piste }) => { appels.push({ url: page.url, titre: piste.titre, corps: page.corps }); return { sortie: 'NEW_SOURCE_NO_STATE_CHANGE', rattachement: 'OK' }; } });
  assert.equal(appels.length, 1); assert.equal(appels[0].url, LIEN); assert.match(appels[0].corps, /devant la mairie de Paris/);
  assert.deepEqual(r.map((x) => [x.url, x.publie_le, x.sortie]), [[LIEN, '2026-03-21', 'NEW_SOURCE_NO_STATE_CHANGE']]); assert.equal(compte.pistes_suivies, 1);
});
await at('article lié inaccessible : l\'incertitude est conservée et dite — rien n\'est qualifié, rien n\'est inventé', async () => {
  const { suivrePistes } = await import('../lib/pistes.mjs'); let appele = false; const compte = {};
  const r = await suivrePistes({ liens: extraireCorps(HTML_A, RFI_A).liens_associes, url: RFI_A, deja: new Set(), max: 2, compte: (k) => { compte[k] = (compte[k] || 0) + 1; },
    lire: async () => ({ ok: false, motif: 'HTTP 403' }), qualifier: async () => { appele = true; return {}; } });
  assert.equal(appele, false); assert.deepEqual(r.map((x) => [x.issue, x.motif]), [['INACCESSIBLE', 'HTTP 403']]); assert.equal(compte.pistes_inaccessibles, 1);
});
await at('aucun lien associé retenu → aucune lecture (pas d\'exploration générale)', async () => {
  const { suivrePistes } = await import('../lib/pistes.mjs'); let lu = 0;
  const r = await suivrePistes({ liens: [{ titre: 'Newsletter : recevez l’actualité', url: 'https://www.rfi.fr/n' }], url: RFI_A, deja: new Set(), max: 2, lire: async () => { lu++; return { ok: true }; }, qualifier: async () => ({}) });
  assert.deepEqual(r, []); assert.equal(lu, 0);
});

await at('article lié qui ne nomme pas l\'école : seul un fait de TERRITOIRE nommé par la source est retenu — jamais un fait d\'établissement, jamais un territoire déduit de la fiche', async () => {
  const { estFaitDeTerritoireNomme } = await import('../lib/pistes.mjs');
  const lie = extraireCorps(LIE_HTML, LIEN).corps;
  const faits = extraireReactions(lie, { etablissement: 'École Vigée Lebrun', anneeRef: '2026-03-24' });
  assert.ok(faits.length === 1 && faits.every(estFaitDeTerritoireNomme), 'le rassemblement de Paris est un fait de territoire nommé');
  assert.equal(estFaitDeTerritoireNomme({ portee: 'territoire', territoire: null }), false);
  assert.equal(estFaitDeTerritoireNomme({ portee: 'établissement', territoire: 'Paris' }), false);
  const nomme = extraireReactions('Des parents se sont rassemblés ce jeudi devant l’école Vigée Lebrun pour demander des explications aux autorités.', { etablissement: 'École Vigée Lebrun', anneeRef: '2026-03-24' });
  assert.ok(nomme.length === 1 && !estFaitDeTerritoireNomme(nomme[0]), 'un fait qui nomme l’école reste un fait d’établissement : écarté pour un article non rattaché');
});

// --- Hub Landes publié : matière cohérente, projection possible, un dossier = un seul Hub -----------------------------------
await at('Hub Landes : affaires publiques et non gelées, un dossier par affaire, jamais le même dossier dans deux fichiers de matière', async () => {
  const { readdirSync } = await import('node:fs');
  const lire = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
  const landes = lire('data/hub-matiere/landes.json');
  const publiques = new Set(lire('data/cases.json').cases.map((c) => c.case_id));
  const holds = new Set(lire('data/publication-holds.json').holds.map((h) => h.case_id));
  for (const id of landes.ordre) { assert.ok(publiques.has(id), `${id} non publique`); assert.ok(!holds.has(id), `${id} sous HOLD`); assert.ok(landes.dossiers[id], `${id} sans dossier`); }
  const vus = new Map();
  for (const f of readdirSync(new URL('../../data/hub-matiere/', import.meta.url)).filter((x) => x.endsWith('.json'))) {
    for (const id of Object.keys(lire(`data/hub-matiere/${f}`).dossiers || {})) { assert.ok(!vus.has(id), `${id} dans ${vus.get(id)} ET ${f}`); vus.set(id, f); }
  }
});
await at('Hub Landes : une mesure ou une mobilisation validée a un bloc existant pour s\'y projeter (aucun blocage)', async () => {
  const { destinationsDe } = await import('../lib/destinations.mjs');
  const { readFileSync } = await import('node:fs');
  const groupes = JSON.parse(readFileSync(new URL('../../data/hub-matiere/landes.json', import.meta.url), 'utf8')).reponses.map((g) => g.titre);
  const ctx = { publiques: new Set(['A']), holds: new Set(), approuvees: new Set(), cases: new Map([['A', { commune: 'Tarnos', departement: 'Landes' }]]), hubs: { landes: { publie: true, groupes } } };
  for (const nature of ['mesure', 'mobilisation']) {
    const d = destinationsDe({ case_id: 'A', nature, portee: 'affaire', territoire: null }, ctx);
    assert.deepEqual(d.bloques, []); assert.equal(d.hubs[0]?.hub, 'landes');
  }
});
await at('Hubs rédigés : chaque dossier sans fiche approuvée porte l\'état pour lequel il a été écrit (une évolution validée ensuite est détectée, jamais contredite en silence) ; aucune note interne de revue dans le texte public', async () => {
  const lire = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
  const approuvees = new Set(Object.keys(lire('data/evenements.json').fiches_approuvees || {}));
  for (const hub of ['paris-11e', 'bordeaux-gironde', 'hautes-alpes', 'landes']) {
    const m = lire(`data/hub-matiere/${hub}.json`);
    for (const id of m.ordre) if (!approuvees.has(id)) assert.ok(m.dossiers[id]?.statut_affiche, `${hub} / ${id} : état de rédaction absent (statut_affiche)`);
    assert.ok(!/À revoir|avant publication d.un hub|TODO|FIXME/i.test(JSON.stringify(m)), `${hub} : note interne de revue dans la matière publique`);
  }
  const dossier = readFileSync(new URL('../../web/src/components/Dossier.astro', import.meta.url), 'utf8');
  assert.ok(dossier.includes('dossierDepasse(c, dossier)') && /etat_actuel: undefined/.test(dossier) && /inconnues: undefined/.test(dossier), 'dossier dépassé : la lecture écrite pour l\'ancien état n\'est plus affichée');
});

// --- qualification des réponses : preuve = fait précis, lien à l'affaire ≠ étendue, jamais d'élargissement ni de transfert ------------------
const CORPS_MESURE = 'Une plainte a été déposée contre cet agent communal, indique la municipalité.\n\nLa municipalité indique qu’elle va "renforcer l’encadrement sur les accueils de loisirs maternels, au-delà des obligations règlementaires afin qu’un adulte ne reste pas seul avec un enfant" . Un temps d’échange sera organisé dans le courant du mois de novembre , avec les parents et les enfants scolarisés sur le thème de la prévention des violences sexuelles.\n\nUn autre paragraphe sans rapport.';
t('réponse municipale lue dans l’article RATTACHÉ à l’affaire : liée à l’affaire, étendue communale conservée à part, libellé limité à ce que la source dit', () => {
  const fs = extraireReactions(CORPS_MESURE, { etablissement: 'Les Tournesols', anneeRef: '2026-10-16', lieAffaire: true, commune: 'Lingolsheim' });
  const renf = fs.find((f) => f.mesure === 'renforcement_encadrement'), info = fs.find((f) => f.mesure === 'information_familles');
  assert.equal(fs.length, 2);
  assert.equal(renf.portee, 'établissement'); assert.equal(renf.territoire, 'Lingolsheim'); assert.doesNotMatch(renf.libelle_public, /plan d’action/);
  assert.match(renf.libelle_public, /renforcement de l’encadrement/); assert.equal(renf.event_period, null, 'la date du temps d’échange n’est pas transférée à la mesure d’encadrement');
  assert.equal(info.event_period, '2026-11'); assert.equal(info.portee, 'établissement'); assert.equal(info.territoire, 'Lingolsheim');
  assert.ok(info.evidence[0].includes('La municipalité indique') && info.evidence[0].includes('temps d’échange'), 'la preuve porte l’acteur ET la mesure, écrits dans le même paragraphe');
});
t('« plan d’action » seulement si la source le dit ; hors article rattaché (ou autre établissement nommé), la mesure reste territoriale — l’acteur seul ne décide pas', () => {
  assert.equal(extraireReactions('La mairie présente un plan d’action pour renforcer l’encadrement des enfants dans les centres.', { lieAffaire: true, commune: 'X' })[0].mesure, 'plan_action_encadrement');
  assert.equal(extraireReactions(CORPS_MESURE, { etablissement: 'Les Tournesols', anneeRef: '2026-10-16' }).find((f) => f.mesure === 'renforcement_encadrement').portee, 'territoire');
  const autre = extraireReactions('La municipalité renforcera l’encadrement dans les écoles Voltaire et Pasteur de la commune cette année.', { etablissement: 'Les Tournesols', autres: ['École Voltaire'], lieAffaire: true, commune: 'X' });
  assert.equal(autre[0].portee, 'territoire', 'phrase qui nomme d’autres établissements : jamais rattachée à celui-ci');
});
t('le rattachement de l’article ne décide pas seul de la portée : autre établissement dans l’article, ou acteur d’un autre territoire ⇒ territoire (doute = pas d’attribution forcée)', () => {
  const opts = { etablissement: 'Les Tournesols', anneeRef: '2026-10-16', lieAffaire: true, commune: 'Lingolsheim' };
  const mesure = 'La municipalité indique qu’elle va renforcer l’encadrement sur les accueils de loisirs maternels.';
  assert.equal(extraireReactions(mesure, opts)[0].portee, 'établissement', 'article centré sur l’affaire : réponse liée');
  const multi = extraireReactions(`${mesure}\n\nAilleurs, à l’école Voltaire, une autre enquête a été ouverte.`, { ...opts, autres: ['École Voltaire'] });
  assert.equal(multi[0].portee, 'territoire', 'l’article parle aussi d’un autre établissement : lien incertain');
  assert.equal(extraireReactions('La Ville de Lyon va renforcer l’encadrement dans les accueils de loisirs.', opts)[0].portee, 'territoire', 'acteur d’un autre territoire');
  const meme = extraireReactions('La Ville de Lingolsheim va renforcer l’encadrement dans les accueils de loisirs.', opts)[0];
  assert.equal(meme.portee, 'établissement'); assert.equal(meme.territoire, 'Lingolsheim');
});
t('une phrase impersonnelle ne reprend l’acteur que dans le MÊME paragraphe (incertitude ≠ attribution forcée)', () => {
  const separe = 'La municipalité indique qu’elle va renforcer l’encadrement des accueils de loisirs.\n\nUn temps d’échange sera organisé en novembre avec les parents.';
  const fs = extraireReactions(separe, { etablissement: 'X', lieAffaire: true, commune: 'Y' });
  assert.deepEqual(fs.map((f) => f.mesure), ['renforcement_encadrement'], 'autre paragraphe : aucune attribution à la municipalité');
});
const CORPS_AVOCAT = 'Le mis en examen ne reconnaît pas les faits.\n\n"Au drame humain s’ajoute la légèreté blâmable de responsables manifestement inconséquents" , avait réagi jeudi, avant la mise en examen, Maître Untel, avocat de plusieurs parents d’élèves.';
t('la réaction d’un avocat n’est pas un rassemblement : « manifestement » n’est pas « manifester », aucune date ni statut annoncé/réalisé inventés', () => {
  assert.deepEqual(extraireReactions(CORPS_AVOCAT, { etablissement: 'École Saint-Laurent', anneeRef: '2026-09-25', lieAffaire: true, commune: 'Paris 10e' }), []);
  // la vraie manifestation reste reconnue
  const vraie = extraireReactions('Des parents ont manifesté devant l’école ce jeudi pour réclamer des explications aux autorités.', { etablissement: 'École Saint-Laurent', anneeRef: '2026-09-25' });
  assert.equal(vraie.length, 1); assert.equal(vraie[0].mesure, 'rassemblement'); assert.equal(vraie[0].event_date, '2026-09-24');
});
t('entités HTML décodées par le traitement existant (plus de « &acirc; » ni « &ocirc; » dans les citations)', () => {
  const r = extraireCorps(page('<p>Au drame humain s’ajoute la légèreté bl&acirc;mable de responsables, a réagi Ma&icirc;tre Untel, avocat des parents d’élèves de l’école du c&ocirc;té de la gare.</p>'), 'https://x.fr/a');
  assert.match(r.corps, /blâmable/); assert.match(r.corps, /Maître/); assert.match(r.corps, /côté/); assert.doesNotMatch(r.corps, /&[a-z]+;/);
});
t('mobilisation générale (RFI) : toujours territoriale — article atteint par une piste, jamais lié à l’affaire d’où l’on est parti', () => {
  const fs = extraireReactions('Pour alerter les autorités, un rassemblement de plusieurs parents du collectif était organisé ce samedi matin devant la mairie de Paris.', { etablissement: 'École Vigée Lebrun', anneeRef: '2026-03-24', lieAffaire: false, commune: 'Paris 15e' });
  assert.equal(fs[0].portee, 'territoire'); assert.equal(fs[0].territoire, 'Paris');
});
t('messages : réponse liée à l’affaire = enrichissement de sa fiche avec son étendue ; fait territorial = provenance seulement', () => {
  const base = { etablissement: 'Les Tournesols', commune: 'Lingolsheim', courant: 'enquête', media: 'ICI', publication_date: '2026-10-16', url: 'https://ici.example/a' };
  const lie = messageEnrichissement(base, [{ libelle_public: 'Selon la presse, la collectivité a annoncé un renforcement de l’encadrement des enfants.', realisation: 'annoncée', acteur: 'municipalite', portee: 'établissement', territoire: 'Lingolsheim', evidence: ['La municipalité indique qu’elle va renforcer l’encadrement.'], event_date: null }], false);
  for (const s of ['ENRICHISSEMENT PROPOSÉ', 'Les Tournesols', 'réponse liée à cette affaire', 'étendue de la mesure : Lingolsheim', 'non limitée à cet établissement']) assert.ok(lie.includes(s), s);
  assert.doesNotMatch(lie, /plan d’action|Provenance seulement|INFORMATION TERRITORIALE/);
});
t('retraitement sans doublon : les propositions erronées gardent leur ligne et leur décision ; les corrigées naissent sous une version distincte (idempotente), compatible avec les filtres « +reactions »', () => {
  const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  const mc = src('scripts/maintenance-cycle.mjs');
  assert.ok(mc.includes('.q2+reactions`') && mc.includes("primitive_version not like '%+reactions'"));
  assert.ok(mc.includes('lieAffaire: !viaPiste') && mc.includes('commune: fiche.commune'));
  assert.ok(src('scripts/lib/persist-etat-affaire.mjs').includes('on conflict (case_id, article_id, content_fingerprint, primitive_version)'));
});

t('un titre voisin dans un conteneur « related » ou un teaser sans marqueur sort du corps (défaut reproduit sur main avant correctif) ; le paragraphe suivant reste', () => {
  const T = 'La mairie de Rennes suspend les animateurs de tous les centres de loisirs après une affaire, annonce la municipalité';
  const h = '<html><title>Un animateur mis en examen à Rennes</title><body><p>Un animateur périscolaire de Rennes a été mis en examen mardi pour agressions sexuelles sur mineurs, selon le parquet.</p>'
    + `<div class="related-posts"><p>${T}</p></div><p class="teaser"><a href="/x">${T}</a></p>`
    + '<p>Son avocat a indiqué mercredi que le mis en examen contestait les faits et qu\'il serait placé sous contrôle judiciaire.</p></body></html>';
  const r = extraireCorps(h, 'https://ex.fr/a');
  assert.equal(r.paragraphes.length, 2);
  assert.ok(!r.corps.includes('suspend'));
});

console.log(`\n${n} contrôles : OK`);
