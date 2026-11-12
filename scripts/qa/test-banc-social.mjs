// =====================================================================
// scripts/qa/test-banc-social.mjs — PILOTE ÉDITORIAL SOCIAL V3 : pare-feux documentaires, traçabilité, sécurité des personnes, non-régression sur le corpus réel,
// absence de tout chemin Buffer. Aucun réseau, aucune base, AUCUNE publication. Usage : node scripts/qa/test-banc-social.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { dossierFiche } from '../lib/fiche-page.mjs';
import { matiereApprouvee, composerPilote, verifierPost, gardes, longueurX, RE_RESERVE, sourceALier, phrasesDe, GABARITS, urlAvecDecompte, ARBITRAGES, reserveA4, MENTION_A4 } from '../lib/social-editorial.mjs';
import { hashDossier } from '../lib/fiche-page.mjs';
import { LIMITE_X } from '../lib/diffusion-sociale.mjs';
import { genererBanc, htmlBanc, mdBanc } from '../banc-social.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };
const section = (t) => console.log(`\n${t}`);
const lire = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const lireTexte = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const SITE = 'https://sousnosyeux.org';
const wording = await import('../../web/src/lib/etat-wording.ts');
const cases = new Map(lire('data/cases.json').cases.map((c) => [c.case_id, c]));
const EV = lire('data/evenements.json');
const clone = (o) => JSON.parse(JSON.stringify(o));
const M_de = (id, o = {}) => matiereApprouvee({ entree: o.entree ?? cases.get(id), dossier: o.dossier ?? dossierFiche(id), empreinteApprouvee: o.empreinte ?? EV.fiches_approuvees?.[id]?.hash ?? null,
  evenements: o.evenements ?? EV.affaires?.[id] ?? [], matiere: (EV.matiere || []).filter((m) => m.case_id === id), wording });

// ---------------------------------------------------------------------
section('0. Aucun chemin Buffer / réseau / base / modèle dans le banc');
delete process.env.BUFFER_API_KEY;
for (const f of ['scripts/lib/social-editorial.mjs', 'scripts/banc-social.mjs']) {
  const s = lireTexte(f).replace(/^\s*\/\/.*$/gm, '');
  verifie(`${f} : n’importe ni buffer, ni diffusion-flux, ni neon, ni prevenir, ni telegram`, !/from '[^']*(buffer|diffusion-flux|neon|prevenir|telegram)[^']*'/.test(s));
  verifie(`${f} : aucun fetch, aucune clé, aucun modèle`, !/\bfetch\(|BUFFER_API_KEY|OPENROUTER|appelerModele|createPost/.test(s));
}
verifie('le pipeline de production n’utilise PAS le composeur pilote (aucun GO éditorial)', !lireTexte('scripts/diffuser-social.mjs').includes('social-editorial'));

// ---------------------------------------------------------------------
section('1. Corpus réel — états attendus (non-régression)');
const banc = await genererBanc({ now: new Date('2026-11-12T10:00:00Z') });
const R = Object.fromEntries(banc.resultats.map((r) => [r.id, r]));
const attendu = {
  S01: ['REVUE', 'CONFORME'], S02: ['CONFORME', 'CONFORME'], S03: ['CONFORME', 'CONFORME'], S04: ['BLOQUE', 'CONFORME'], S05: ['BLOQUE', 'REVUE'], S06: ['BLOQUE', 'REVUE'],
  S07: ['BLOQUE', 'BLOQUE'], S08: ['BLOQUE', 'BLOQUE'], S09: ['BLOQUE', 'BLOQUE'], S10: ['BLOQUE', 'BLOQUE'], S11: ['BLOQUE', 'CONFORME'], S12: ['BLOQUE', 'BLOQUE'],
};
for (const [id, [x, fb]] of Object.entries(attendu)) verifie(`${id} : X ${x} · Facebook ${fb}`, R[id]?.canaux.x.etat === x && R[id]?.canaux.facebook.etat === fb, `${R[id]?.canaux.x.etat} / ${R[id]?.canaux.facebook.etat}`);
const publies = banc.resultats.flatMap((r) => ['x', 'facebook'].map((c) => ({ r, c, k: r.canaux[c] }))).filter(({ k }) => k.texte);
verifie('au moins 8 messages générés (hors blocages)', publies.length >= 8, String(publies.length));
for (const { r, c, k } of publies) {
  verifie(`${r.id} ${c} : 100 % des contrôles automatisés passent`, k.controles.every((x) => x.ok), k.controles.filter((x) => !x.ok).map((x) => x.nom).join(', '));
  if (c === 'x') verifie(`${r.id} X ≤ ${LIMITE_X} (URL = 23)`, longueurX(k.texte) <= LIMITE_X, String(longueurX(k.texte)));
  verifie(`${r.id} ${c} : réserve judiciaire présente`, RE_RESERVE.test(k.texte));
  verifie(`${r.id} ${c} : lien source = média cité dans le texte`, !k.source || k.texte.includes(k.source.url) && k.texte.toLowerCase().includes(String(k.source.media).toLowerCase().split(/[ (]/)[0]) || /selon franceinfo|selon france info/i.test(k.texte), k.source?.media);
}
verifie('déclarations : jamais « conforme » sans GO Telegram spécifique', ['S05', 'S06'].every((id) => R[id].attention.some((a) => /GO Telegram SPÉCIFIQUE/.test(a)) && R[id].canaux.facebook.etat !== 'CONFORME'));
verifie('A2 : S01 lie France 3 (accès libre) malgré « sept parents » dans l’adresse ; le TEXTE ne contient aucun décompte', R.S01.canaux.facebook.texte.includes('sept-parents') && !/\bsept parents\b/i.test(R.S01.canaux.facebook.texte.replace(/https?:\/\/\S+/g, '')));
verifie('S11 : Facebook distingue la procédure (« un professeur ») ; X bloqué car aucune version courte ne la distingue', /professeur/.test(R.S11.canaux.facebook.texte ?? '') && /non distinguée/.test(R.S11.canaux.x.motifs.join(' ')));
verifie('A4 : la mention courte du site ne répète pas la réserve « caractère définitif » de la fiche', ['S04', 'S06'].every((id) => { const t = R[id].canaux.facebook.texte; return /définiti/.test(t) && !(t.includes('Appel et caractère définitif non documentés') && t.includes('Caractère définitif non documenté.')); }));
verifie('A1 : la fonction de la fiche approuvée est reprise, jamais la valeur exacte de la carte', /l’animateur/.test(R.S04.canaux.facebook.texte) && !/animateur périscolaire/.test(R.S04.canaux.facebook.texte));
verifie('A5 : le sexe d’un enfant (déjà approuvé) ne met plus en revue', R.S04.canaux.facebook.etat === 'CONFORME' && /une enfant/.test(R.S04.canaux.facebook.texte));
verifie('S12 : la condamnation de FR-2026-0001 n’est jamais attribuée à FR-2026-0002', R.S12.motifs.some((m) => /non rattaché/.test(m)) && !JSON.stringify(R.S12.canaux).includes('18 mois'));
verifie('S08 : statut ambigu détecté', R.S08.motifs.some((m) => /statut ambigu/.test(m)));
verifie('S09 : remise en liberté jamais annoncée comme mise en examen', R.S09.motifs.some((m) => /ne change pas|mesure_procédurale/.test(m)));
verifie('S10 : relaxe hors automatisation', R.S10.motifs.some((m) => /relaxe/.test(m)));
verifie('S06 : X bloqué car la procédure Aqueduc n’y serait pas distinguée', /non distinguée/.test(R.S06.canaux.x.motifs.join(' ')));

// ---------------------------------------------------------------------
section('2. HTML = mêmes sorties (aucun texte dupliqué ou réécrit)');
const html = htmlBanc(banc);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const { r, c, k } of publies) verifie(`${r.id} ${c} : le texte affiché est le texte généré`, html.includes(esc(k.texte.split('\n')[0])) && html.includes(esc(k.texte.split('\n\n')[1].split('\n')[0]).slice(0, 80)));
const md = mdBanc(banc);
for (const { r, c, k } of publies) verifie(`${r.id} ${c} : le Markdown porte le texte EXACT généré`, md.includes('```text\n' + k.texte + '\n```'));
verifie('Markdown : 12 scénarios, 24 déclinaisons, avertissement « aucune publication »', banc.resultats.every((r) => md.includes(`## ${r.id}`)) && (md.match(/^### (X|Facebook) — /gm) || []).length === 24 && md.includes("Aucun de ces messages n'a été publié"));
verifie('HTML non indexable et sans ressource externe', html.includes('noindex') && !/<script|<link[^>]+href=|src="http/.test(html));
verifie('HTML : avertissement « aucune publication »', html.includes('Aucun de ces messages n\'a été publié'));
const banc2 = await genererBanc({ now: new Date('2026-11-12T10:00:00Z') });
verifie('génération déterministe (deux passages identiques)', JSON.stringify(banc2.resultats) === JSON.stringify(banc.resultats));

// ---------------------------------------------------------------------
section('3. Pare-feux — injections (échec fermé)');
const SC = { id: 'T', famille: 'nouvelle_affaire', case_id: 'FR-2026-0025' };
const base = composerPilote({ scenario: SC, M: M_de('FR-2026-0025'), publiques: cases, site: SITE });
verifie('témoin : FR-2026-0025 compose', base.etat === 'OK' && base.facebook.etat === 'OK');
// 3a. altération d'un fait approuvé (mot ajouté) → refus
{ const p = clone(base.facebook); const s = p.paragraphes[1][0]; s.champs.phrase.valeur = s.champs.phrase.valeur.replace('mis en examen', 'mis en examen et écroué'); s.texte = s.champs.phrase.valeur; p.texte = p.paragraphes.map((x) => x.map((y) => y.texte).join(' ')).join('\n\n');
  verifie('fait altéré (« et écroué » ajouté) ⇒ contrôle en échec', !verifierPost(p, 'facebook', M_de('FR-2026-0025'), SITE).ok); }
// 3b. phrase inventée ajoutée → refus
{ const p = clone(base.facebook); p.paragraphes[2].push({ gabarit: 'phrase', champs: { phrase: { valeur: 'Les parents sont sous le choc.', origine: 'x' } }, role: 'contexte', texte: 'Les parents sont sous le choc.' }); p.texte = p.paragraphes.map((x) => x.map((y) => y.texte).join(' ')).join('\n\n');
  verifie('phrase inventée ⇒ contrôle en échec', !verifierPost(p, 'facebook', M_de('FR-2026-0025'), SITE).ok); }
// 3c. texte modifié hors segments → refus
{ const p = clone(base.facebook); p.texte += '\n\n#justice'; verifie('ajout hors segments (hashtag) ⇒ contrôle en échec', !verifierPost(p, 'facebook', M_de('FR-2026-0025'), SITE).ok); }
// 3c bis. défaut v1 reproduit : X « Selon Ouest-France » lié à l'article du Figaro → refus
{ const M13 = M_de('FR-2026-0113'); const r = composerPilote({ scenario: { id: 'T', famille: 'nouvelle_affaire', case_id: 'FR-2026-0113' }, M: M13, publiques: cases, site: SITE });
  const p = clone(r.x); const att = p.paragraphes.flat().find((s) => s.role === 'attribution'); const figaro = [...M13.sources.values()].find((s) => s.media === 'Le Figaro');
  att.champs.url.valeur = figaro.url; att.texte = `Source : ${figaro.url}`; p.texte = p.paragraphes.map((x) => x.map((y) => y.texte).join(' ')).join('\n\n');
  verifie('défaut v1 : lien d’un média non cité par le texte ⇒ contrôle en échec', r.x.texte.includes('Ouest-France') && !verifierPost(p, 'x', M13, SITE).ok); }
// 3d. gabarit hors liste blanche → refus
{ const p = clone(base.facebook); p.paragraphes[0][0].gabarit = 'inconnu'; verifie('gabarit hors liste blanche ⇒ contrôle en échec', !verifierPost(p, 'facebook', M_de('FR-2026-0025'), SITE).ok); }
// 3e. empreinte d'approbation différente → bloqué
verifie('fiche modifiée après approbation (empreinte ≠) ⇒ bloqué', composerPilote({ scenario: SC, M: M_de('FR-2026-0025', { empreinte: '0000000000000000' }), publiques: cases, site: SITE }).etat === 'BLOQUE');
// 3f. statut public ≠ statut de la fiche → bloqué
{ const e = { ...cases.get('FR-2026-0025'), statut_judiciaire: 'enquête' }; const r = composerPilote({ scenario: SC, M: M_de('FR-2026-0025', { entree: e }), publiques: cases, site: SITE });
  verifie('statut carte ≠ statut fiche ⇒ bloqué (ambiguïté)', r.etat === 'BLOQUE' && r.motifs.some((m) => /statut ambigu/.test(m))); }
// 3g. nombre d'enfants / âge / parenté dans la phrase approuvée → bloqué
for (const [nom, ajout] of [['nombre d’enfants', ' Douze enfants seraient concernés.'], ['âge d’un enfant', ' La victime, âgée de 6 ans, était scolarisée.'], ['parenté', ' Sa fille avait alerté.']]) {
  const d = clone(dossierFiche('FR-2026-0025')); d.d.etat_actuel[0] += ajout;
  const r = composerPilote({ scenario: SC, M: matiereApprouvee({ entree: cases.get('FR-2026-0025'), dossier: d, empreinteApprouvee: (await import('../lib/fiche-page.mjs')).hashDossier(d.d), wording }), publiques: cases, site: SITE });
  verifie(`${nom} dans la matière approuvée ⇒ bloqué`, r.etat === 'BLOQUE', r.motifs.join(' / '));
}
verifie('« mineurs de 15 ans » (qualification pénale) n’est pas un âge d’enfant', gardes('agressions sexuelles sur mineurs de 15 ans par personne ayant autorité', {}).bloquants.length === 0);
verifie('« âgée de 6 ans » est un âge d’enfant', gardes('une élève âgée de 6 ans', {}).bloquants.length > 0);
verifie('« faits présumés » n’est PAS une réserve de présomption d’innocence', !RE_RESERVE.test('pour des faits présumés d’agressions sexuelles'));
verifie('rôle générique « autre » n’est pas une fuite de rôle', gardes('d’autres parents ont porté plainte', { role_mis_en_cause: 'autre' }).bloquants.length === 0);
// 3h. procédure sœur sans désignation de fonction → bloqué
{ const d = clone(dossierFiche('FR-2026-0002')); d.d.etat_actuel = ['Selon Le Monde.fr, une réunion avec les parents s\'est tenue le 16 octobre et une cellule psychologique a été ouverte à l\'école Aqueduc.'];
  const r = composerPilote({ scenario: { id: 'T', famille: 'nouvelle_affaire', case_id: 'FR-2026-0002' }, M: matiereApprouvee({ entree: cases.get('FR-2026-0002'), dossier: d, empreinteApprouvee: (await import('../lib/fiche-page.mjs')).hashDossier(d.d), wording }), publiques: cases, site: SITE });
  verifie('même établissement, fait sans fonction ⇒ bloqué (confusion)', r.etat === 'BLOQUE' && r.motifs.some((m) => /confusion/.test(m)), r.motifs.join(' / ')); }
// 3i. sources : payantes et URL portant un décompte jamais liées
verifie('média payant jamais lié', sourceALier([{ media: 'Libération', url: 'https://www.liberation.fr/x', acces: 'libre' }]) === null);
verifie('A2 : URL portant « douze enfants » détectée et autorisée (texte contrôlé à part)', ARBITRAGES.lienAvecDecompte && urlAvecDecompte('https://x.fr/sur-douze-enfants-2026') && sourceALier([{ media: 'Le Figaro', url: 'https://x.fr/sur-douze-enfants-2026', acces: 'libre' }])?.media === 'Le Figaro');
verifie('A2 : un décompte dans le TEXTE reste bloquant', gardes('Selon X, douze enfants seraient concernés.', {}).bloquants.length > 0);
verifie('accès libre préféré à l’accès partiel', sourceALier([{ media: 'A', url: 'https://a.fr/1', acces: 'partiel', publie_le: '2026-07-02' }, { media: 'B', url: 'https://b.fr/1', acces: 'libre', publie_le: '2026-07-01' }]).media === 'B');
// 3j. événement d'une autre affaire, événement non daté, événement non lié
const evt0001 = EV.affaires['FR-2026-0001'][0];
verifie('événement d’une autre affaire ⇒ bloqué', composerPilote({ scenario: { id: 'T', famille: 'evolution', case_id: 'FR-2026-0002', event_id: evt0001.event_id }, M: M_de('FR-2026-0002'), publiques: cases, site: SITE }).etat === 'BLOQUE');
verifie('événement non daté ⇒ bloqué', composerPilote({ scenario: { id: 'T', famille: 'evolution', case_id: 'FR-2026-0001', event_id: evt0001.event_id }, M: M_de('FR-2026-0001', { evenements: [{ ...evt0001, date: null }] }), publiques: cases, site: SITE }).etat === 'BLOQUE');
// 3k. phrases entières seulement
verifie('découpe en phrases entières (aucune coupe à l’intérieur d’une phrase)', JSON.stringify(phrasesDe('Deux animateurs mis en examen. L’enquête vise trois écoles.')) === JSON.stringify(['Deux animateurs mis en examen.', 'L’enquête vise trois écoles.']));
verifie('liste blanche : aucun gabarit ne contient de verbe d’affirmation factuelle', Object.values(GABARITS).every((g) => !/\b(a été|ont été|est|sont|accus|condamn|viol|agress)\b/i.test(g.replace(/\{\w+\}/g, ''))));


section('4. Arbitrages A3 (accroche courte approuvée) et A4 (mention courte, pilote seulement)');
{ const d = clone(dossierFiche('FR-2026-0113')); d.d.accroche_courte = 'Selon France 3, le parquet de Bordeaux a ouvert une enquête préliminaire après des plaintes de parents d’élèves.';
  const M = matiereApprouvee({ entree: cases.get('FR-2026-0113'), dossier: d, empreinteApprouvee: hashDossier(d.d), wording });
  const r = composerPilote({ scenario: { id: 'T', famille: 'nouvelle_affaire', case_id: 'FR-2026-0113' }, M, publiques: cases, site: SITE });
  verifie('accroche courte approuvée utilisée par X, liée à son média, contrôles verts', r.x.etat === 'OK' && r.x.texte.includes(d.d.accroche_courte) && r.x.texte.includes('france3-regions') && verifierPost(r.x, 'x', M, SITE).ok, r.x.texte ?? r.x.motifs);
  verifie('accroche courte NON approuvée (empreinte ancienne) ⇒ fiche entière refusée', composerPilote({ scenario: { id: 'T', famille: 'nouvelle_affaire', case_id: 'FR-2026-0113' }, M: matiereApprouvee({ entree: cases.get('FR-2026-0113'), dossier: d, empreinteApprouvee: EV.fiches_approuvees['FR-2026-0113'].hash, wording }), publiques: cases, site: SITE }).etat === 'BLOQUE');
  const d2 = clone(d); d2.d.accroche_courte = 'Le parquet a ouvert une enquête.';
  const r2 = composerPilote({ scenario: { id: 'T', famille: 'nouvelle_affaire', case_id: 'FR-2026-0113' }, M: matiereApprouvee({ entree: cases.get('FR-2026-0113'), dossier: d2, empreinteApprouvee: hashDossier(d2.d), wording }), publiques: cases, site: SITE });
  verifie('accroche courte non attribuée (« Selon … ») ignorée', !r2.x.texte?.includes('Le parquet a ouvert une enquête.')); }
{ const src = { media: 'CNEWS', date: '2026-07-10', url: null };
  const etat = (o) => ({ statut: 'condamnation non définitive', date: '2026-07-10', type_evenement: 'décision', finalite: null, suites: [], sources: [src], ...o });
  const entree = (o) => ({ statut_judiciaire: 'condamnation non définitive', etat: etat(o) });
  verifie('A4 (pilote) : condamnation sans recours ni finalité ⇒ mention courte', reserveA4(entree({})) === MENTION_A4);
  verifie('A4 (pilote) : appel en cours ⇒ pas de mention courte', reserveA4(entree({ suites: ['APPEL_EN_COURS'] })) === null);
  verifie('A4 (pilote) : finalité « non définitive » validée ⇒ pas de mention courte', reserveA4(entree({ finalite: 'non_definitive' })) === null);
  verifie('A4 (pilote) : enquête ⇒ pas de mention courte', reserveA4({ statut_judiciaire: 'enquête', etat: null }) === null);
  verifie('A4 ISOLÉ : la formulation publique du site ne contient PAS la mention (aucun effet sur la carte)', !wording.phrasesEtat('condamnation non définitive', etat({}), src).join(' ').includes(MENTION_A4) && !lireTexte('web/src/lib/etat-wording.ts').includes(MENTION_A4));
  // Sans procédure sœur (publiques réduites à l'affaire), le X de la condamnation Aqueduc tient grâce à la mention courte ; elle n'est jamais attribuée au site.
  { const seule = new Map([['FR-2026-0001', cases.get('FR-2026-0001')]]); const M1 = M_de('FR-2026-0001');
    const r = composerPilote({ scenario: { id: 'T', famille: 'evolution', case_id: 'FR-2026-0001', event_id: EV.affaires['FR-2026-0001'][0].event_id }, M: M1, publiques: seule, site: SITE });
    const seg = r.x.paragraphes?.flat().find((x) => x.texte === MENTION_A4);
    verifie('A4 (pilote) : X d’une condamnation à finalité inconnue tient avec la mention courte, contrôles verts', r.x.etat === 'OK' && r.x.texte.includes(MENTION_A4) && verifierPost(r.x, 'x', M1, SITE).ok, r.x.texte ?? r.x.motifs);
    verifie('A4 (pilote) : preuve = arbitrage, « NON servie sur le site »', /NON servie sur le site/.test(seg?.preuve?.validation ?? ''));
    verifie('A4 (pilote) : Facebook garde la réserve approuvée de la fiche, sans redite', r.facebook.texte.includes('Appel et caractère définitif non documentés') && !r.facebook.texte.includes(MENTION_A4)); } }

console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ banc social : tous les contrôles passent (aucune publication, aucun appel Buffer)');
process.exit(ko ? 1 : 0);
