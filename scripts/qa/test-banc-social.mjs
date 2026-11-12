// =====================================================================
// scripts/qa/test-banc-social.mjs — PILOTE ÉDITORIAL SOCIAL (V3 → V4) : pare-feux documentaires, traçabilité, sécurité des personnes, non-régression sur le corpus réel,
// absence de tout chemin Buffer. Aucun réseau, aucune base, AUCUNE publication. Usage : node scripts/qa/test-banc-social.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { dossierFiche } from '../lib/fiche-page.mjs';
import { matiereApprouvee, composerPilote, verifierPost, gardes, longueurX, RE_RESERVE, sourceALier, phrasesDe, GABARITS, urlAvecDecompte, ARBITRAGES, reserveA4, MENTION_A4, qualification, urlAnnonceAutreEtape, interetConcret, categorieParole, LIBELLES, sansRegistreEmotionnel } from '../lib/social-editorial.mjs';
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
  // V4.1 : S01 Facebook lie aussi Le Figaro (nommé par le fait, lu en partie) ⇒ revue humaine ; S13 (Montpellier) sans fiche approuvée ; S14 identifiant retiré.
  S01: ['CONFORME', 'REVUE_HUMAINE'], S02: ['CONFORME', 'CONFORME'], S03: ['CONFORME', 'CONFORME'], S04: ['BLOQUE', 'CONFORME'], S05: ['BLOQUE', 'BLOQUE'], S06: ['BLOQUE', 'BLOQUE'],
  S07: ['BLOQUE', 'BLOQUE'], S08: ['BLOQUE', 'BLOQUE'], S09: ['BLOQUE', 'BLOQUE'], S10: ['BLOQUE', 'BLOQUE'], S11: ['BLOQUE', 'CONFORME'], S12: ['BLOQUE', 'BLOQUE'],
  S13: ['BLOQUE', 'BLOQUE'], S14: ['BLOQUE', 'BLOQUE'],
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
verifie('déclarations : jamais « conforme », REVUE_HUMAINE + GO social distinct exigés', ['S05', 'S06'].every((id) => R[id].attention.some((a) => /REVUE_HUMAINE obligatoire — GO social humain distinct/.test(a)) && R[id].canaux.facebook.etat !== 'CONFORME' && /déclaration : GO spécifique/.test(R[id].validation_requise)));
verifie('A2 : S01 lie France 3 (accès libre) malgré « sept parents » dans l’adresse ; le TEXTE ne contient aucun décompte', R.S01.canaux.facebook.texte.includes('sept-parents') && !/\bsept parents\b/i.test(R.S01.canaux.facebook.texte.replace(/https?:\/\/\S+/g, '')));
verifie('S11 : Facebook distingue la procédure (« un professeur ») ; X bloqué car aucune version courte ne la distingue', /professeur/.test(R.S11.canaux.facebook.texte ?? '') && /non distinguée/.test(R.S11.canaux.x.motifs.join(' ')));
verifie('A4 + V4 : une seule mention « caractère définitif », la forme courte (la réserve de la fiche ne constate qu’une absence)', R.S04.canaux.facebook.texte.includes(MENTION_A4) && !R.S04.canaux.facebook.texte.includes('Appel et caractère définitif non documentés'));
verifie('A1 : la fonction de la fiche approuvée est reprise, jamais la valeur exacte de la carte', /l’animateur/.test(R.S04.canaux.facebook.texte) && !/animateur périscolaire/.test(R.S04.canaux.facebook.texte));
verifie('A5 : le sexe d’un enfant (déjà approuvé) ne met plus en revue', R.S04.canaux.facebook.etat === 'CONFORME' && /une enfant/.test(R.S04.canaux.facebook.texte));
verifie('S12 : la condamnation de FR-2026-0001 n’est jamais attribuée à FR-2026-0002', R.S12.motifs.some((m) => /non rattaché/.test(m)) && !JSON.stringify(R.S12.canaux).includes('18 mois'));
verifie('S08 : statut ambigu détecté', R.S08.motifs.some((m) => /statut ambigu/.test(m)));
verifie('S09 : remise en liberté jamais annoncée comme mise en examen', R.S09.motifs.some((m) => /ne change pas|mesure_procédurale/.test(m)));
verifie('S10 : relaxe hors automatisation', R.S10.motifs.some((m) => /relaxe/.test(m)));
verifie('S06 : réaction d’avocat purement évaluative ⇒ bloquée (intérêt concret), citation exacte et lien direct établis', R.S06.motifs.some((m) => /intérêt concret/.test(m)) && R.S06.declaration.controles[0].ok && R.S06.declaration.controles[2].ok);
verifie('S05 : paraphrase SNY ≠ citation, portée « établissement » ⇒ bloquée sur les trois contrôles', R.S05.declaration.controles.every((k) => !k.ok) && R.S05.canaux.facebook.etat === 'BLOQUE');

// ---------------------------------------------------------------------
section('2. HTML = mêmes sorties (aucun texte dupliqué ou réécrit)');
const html = htmlBanc(banc);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Chaque paragraphe, jusqu'à sa première URL (que le HTML rend en lien raccourci), figure tel quel dans la page.
for (const { r, c, k } of publies) verifie(`${r.id} ${c} : le texte affiché est le texte généré`, k.texte.split('\n\n').every((p) => html.includes(esc(p.split(/https?:\/\//)[0]).replace(/\n/g, '<br>'))));
const md = mdBanc(banc);
for (const { r, c, k } of publies) verifie(`${r.id} ${c} : le Markdown porte le texte EXACT généré`, md.includes('```text\n' + k.texte + '\n```'));
verifie(`Markdown : ${banc.resultats.length} scénarios, ${2 * banc.resultats.length} déclinaisons, avertissement « aucune publication »`, banc.resultats.length === 14 && banc.resultats.every((r) => md.includes(`## ${r.id}`)) && (md.match(/^### (X|Facebook) — /gm) || []).length === 2 * banc.resultats.length && md.includes("Aucun de ces messages n'a été publié"));
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
  att.champs.url.valeur = figaro.url; att.texte = GABARITS[att.gabarit].replace('{url}', figaro.url); p.texte = p.paragraphes.map((x) => x.map((y) => y.texte).join(' ')).join('\n\n');
  verifie('défaut v1 : lien d’un média non cité par le texte ⇒ contrôle en échec', r.x.etat === 'OK' && !verifierPost(p, 'x', M13, SITE).ok);
  verifie('V4 : X de S01 ne crédite plus Ouest-France (article non relu par SNY)', !r.x.texte.includes('Ouest-France') && r.x.texte.includes('France 3')); }
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
    verifie('A4 + V4 : Facebook porte la mention courte, sans redite de la réserve de la fiche', r.facebook.texte.includes(MENTION_A4) && !r.facebook.texte.includes('Appel et caractère définitif non documentés')); } }

// ---------------------------------------------------------------------
section('5. V4 — le fait avant la procédure (arbitrage n°1)');
const conformes = publies.filter(({ k }) => k.etat === 'CONFORME');
for (const { r, c, k } of conformes) verifie(`${r.id} ${c} : part factuelle ≥ 70 % (hors mention judiciaire)`, k.note.detail.part_factuelle >= 70, String(k.note.detail.part_factuelle));
verifie('X : plus aucun repli sur la seule étape (« Selon X, une enquête a été ouverte. »)', publies.filter(({ c }) => c === 'x').every(({ k }) => !/Selon [^,]+, (une enquête a été ouverte|une mise en examen a été prononcée)\./.test(k.texte)));
verifie('S01 / S02 X : l’objet de la procédure est dit (« pour … »)', /enquête ouverte pour agressions sexuelles sur mineurs de 15 ans/.test(R.S01.canaux.x.texte) && /mise en examen pour viol sur mineur/.test(R.S02.canaux.x.texte));
verifie('accroches Facebook : étape + objet (S01–S04)', ['S01', 'S02', 'S03', 'S04'].every((id) => / pour /.test(R[id].canaux.facebook.texte.split('\n')[0])));
verifie('« enquête en cours » n’est plus affirmé (non établi)', !Object.values(LIBELLES.nouvelle_affaire).some((l) => /en cours/.test(l)) && !banc.resultats.some((r) => /enquête en cours/.test(r.canaux.facebook.texte ?? '')));
{ const d1 = dossierFiche('FR-2026-0001').d, d25 = dossierFiche('FR-2026-0025').d;
  verifie('objet = extrait de la phrase approuvée, jamais la catégorie de la carte (atteinte ≠ agression sexuelle)', qualification('condamnation non définitive', [{ texte: d1.etat_actuel[0], origine: 'x' }], cases.get('FR-2026-0001')).qualif === 'atteinte sexuelle sur une enfant');
  verifie('objet coupé à la première articulation (« viol sur mineur », sans « pour des faits datant… »)', qualification('mise en examen', [{ texte: d25.etat_actuel[0], origine: 'x' }], cases.get('FR-2026-0025')).qualif === 'viol sur mineur');
  verifie('statut sans ancre ⇒ aucun objet (repli sur l’étape seule)', qualification('procès', [{ texte: d25.etat_actuel[0], origine: 'x' }], {}) === null); }
{ const p = clone(base.facebook); const a = p.paragraphes[0][0]; a.champs.qualif.valeur = 'viol aggravé'; a.texte = a.texte.replace('viol sur mineur', 'viol aggravé'); p.texte = p.paragraphes.map((x) => x.map((y) => y.texte).join(' ')).join('\n\n');
  verifie('objet altéré (« viol aggravé », absent de la matière) ⇒ contrôle en échec', a.gabarit === 'accroche_fb_qualif' && !verifierPost(p, 'facebook', M_de('FR-2026-0025'), SITE).ok); }
verifie('V4.1 S01 Facebook : plus de développement reposant sur un article lu en partie (garde à vue datée « selon Le Figaro »), aucun lien Ouest-France', !/garde à vue/.test(R.S01.canaux.facebook.texte) && !/ouest-france/.test(R.S01.canaux.facebook.texte));
verifie('S02 : l’article Linfo.re (titre : condamnation dans l’affaire Stanislas) n’est jamais lié à Pontoise', !/linfo\.re/.test(R.S02.canaux.facebook.texte) && urlAnnonceAutreEtape('https://www.linfo.re/x/un-ancien-maitre-d-internat-ecope-d-un-an-de-prison-avec-sursis', 'mise en examen'));
verifie('S11 : lien préféré au JDD « trois hommes déférés » (le professeur n’a pas été déféré)', !/lejdd/.test(R.S11.canaux.facebook.texte) && urlAnnonceAutreEtape('https://www.lejdd.fr/x/trois-hommes-deferes-pour', 'enquête'));
verifie('une adresse « condamné » reste admise pour une affaire jugée', !urlAnnonceAutreEtape('https://x.fr/animateur-condamne-a-18-mois', 'condamnation non définitive'));
verifie('S03 : contexte du MÊME article (gardes à vue levées, témoin assisté), aucune phrase anaphorique (« ces images »)', /témoin assisté/.test(R.S03.canaux.facebook.texte) && /relâchées/.test(R.S03.canaux.facebook.texte) && !/ces images/.test(R.S03.canaux.facebook.texte));
verifie('S04 : motivation du jugement reprise ; étape dépassée (renvoi pour agression sexuelle) écartée', /cohérence et la constance/.test(R.S04.canaux.facebook.texte) && !/renvoyé/.test(R.S04.canaux.facebook.texte));
verifie('une source par média nommé, et seulement des médias nommés (contrôle indépendant vert)', conformes.every(({ k }) => k.controles.find((x) => /média nommé/.test(x.nom))?.ok));

section('6. V4 — déclarations (arbitrages n°2 et n°3)');
const [cit0, cit1] = dossierFiche('FR-2026-0001').d.reactions.map((r) => r.citations[0].texte);
verifie('« très satisfait de cette décision » : réaction évaluative seule ⇒ pas d’intérêt concret', !interetConcret(cit0).ok);
verifie('« la parole de cette enfant ait été entendue » : explication ⇒ intérêt (à confirmer en revue)', interetConcret(cit1).ok);
verifie('priorité : parents < collectif < association < avocat', categorieParole('des parents d’élèves').rang < categorieParole('collectif #MeTooEcole').rang && categorieParole('collectif #MeTooEcole').rang < categorieParole('L’Enfant Bleu').rang && categorieParole('L’Enfant Bleu').rang < categorieParole('Charles Héran, avocat de la famille').rang);
verifie('« avocat des parents » est un avocat, pas un parent', categorieParole('avocat des parents d’élèves').nom === 'avocat');
// Déclaration associative IDÉALE (citation exacte, portée « affaire ») : jamais conforme d'office — REVUE_HUMAINE + GO social distinct.
{ const M5 = M_de('POC-05'); const x = clone(M5.matiere[0]); x.portee = 'affaire'; x.citations = [{ texte: 'Nous nous sommes constitués partie civile pour accompagner les familles.' }];
  const r = composerPilote({ scenario: { id: 'T', famille: 'declaration_association', case_id: 'POC-05', matiere_id: x.id }, M: { ...M5, matiere: [x] }, publiques: cases, site: SITE });
  verifie('déclaration parfaite : contrôles de déclaration verts mais revue humaine obligatoire (jamais automatique)', r.declaration?.controles.every((k) => k.ok) && r.attention.some((a) => /REVUE_HUMAINE obligatoire/.test(a)), JSON.stringify(r.declaration?.controles)); }
{ const r = composerPilote({ scenario: { id: 'T', famille: 'declaration_victime', case_id: 'FR-2026-0005', reaction: 0 }, M: M_de('FR-2026-0005'), publiques: cases, site: SITE });
  verifie('avocat, affaire en cours, demande précise (« obligation de garantir … sécurité ») ⇒ intérêt reconnu, revue humaine', r.declaration?.controles[1].ok && r.attention.some((a) => /déclaration d’avocat/.test(a)), JSON.stringify(r.declaration?.controles)); }
verifie('banc : plus aucun état « REVUE » ambigu (REVUE_HUMAINE explicite)', banc.resultats.every((r) => ['x', 'facebook'].every((c) => ['CONFORME', 'REVUE_HUMAINE', 'BLOQUE'].includes(r.canaux[c].etat))));
verifie('chaque scénario affiche la validation sociale requise (aucun GO accordé)', banc.resultats.every((r) => /GO social humain distinct, par réseau .* aucun accordé/.test(r.validation_requise)));

section('7. V4.1 — D1, D3, concordance des sources (S01, S03) et Montpellier (S13, S14)');
// D1 : aucune qualification raccourcie ; le X de S01 garde la circonstance aggravante et tient grâce au pied compact (contenu inchangé).
{ const d13 = dossierFiche('FR-2026-0113').d; const q = qualification('enquête', [{ texte: d13.etat_actuel[0], origine: 'x' }], cases.get('FR-2026-0113'));
  verifie('D1 : la qualification n’a plus de variante raccourcie', q && !('court' in q) && /par personne ayant autorité$/.test(q.qualif), JSON.stringify(q));
  verifie('D1 : X de S01 = qualification COMPLÈTE (« par personne ayant autorité »), réserve et deux liens, ≤ 280', /mineurs de 15 ans par personne ayant autorité \(selon France 3/.test(R.S01.canaux.x.texte) && RE_RESERVE.test(R.S01.canaux.x.texte) && R.S01.canaux.x.urls.length === 2 && R.S01.canaux.x.longueur <= LIMITE_X, R.S01.canaux.x.texte);
  verifie('D1 : aucun X du banc ne porte une qualification amputée de sa circonstance (« sur mineurs de 15 ans (selon »)', !banc.resultats.some((r) => /mineurs de 15 ans \(selon/.test(r.canaux.x.texte ?? ''))); }
// D3 : contestation rapportée, sans registre émotionnel ; le texte est le DÉBUT EXACT de la phrase approuvée.
verifie('D3 : S02 rapporte la contestation (« nie avec fermeté l’accusation de viol »), sans « humilié » ni « effondré »', /nie avec fermeté l'accusation de viol\./.test(R.S02.canaux.facebook.texte) && !/humili|effondr/i.test(R.S02.canaux.facebook.texte));
verifie('D3 : sansRegistreEmotionnel coupe à l’articulation qui précède l’émotion', sansRegistreEmotionnel("Selon France info, le mis en cause nie avec fermeté l'accusation de viol et se dit humilié et effondré.").texte === "Selon France info, le mis en cause nie avec fermeté l'accusation de viol.");
verifie('D3 : phrase sans émotion inchangée ; émotion en tête ⇒ phrase écartée', sansRegistreEmotionnel('Selon X, il conteste les faits.').extrait === false && sansRegistreEmotionnel('Selon X, effondré, il conteste.') === null);
{ const M25 = M_de('FR-2026-0025'); const r = composerPilote({ scenario: SC, M: M25, publiques: cases, site: SITE });
  const p = clone(r.facebook); const s = p.paragraphes.flat().find((x) => String(x.champs.phrase?.origine).startsWith('extrait:'));
  verifie('D3 : l’extrait est accepté par le contrôleur (début exact d’une phrase approuvée)', !!s && verifierPost(r.facebook, 'facebook', M25, SITE).ok);
  s.champs.phrase.valeur = "le mis en cause nie avec fermeté l'accusation de viol."; s.texte = s.champs.phrase.valeur; p.texte = p.paragraphes.map((x) => x.map((y) => y.texte).join(' ')).join('\n\n');
  verifie('D3 : un morceau pris AU MILIEU d’une phrase approuvée (attribution retirée) ⇒ contrôle en échec', !verifierPost(p, 'facebook', M25, SITE).ok); }
// S01 / S03 : concordance média cité ↔ passage ↔ adresse.
verifie('S01 : « Selon France 3 et Le Figaro » ⇒ une ligne Source pour CHACUN des deux médias', /Source : France 3 Nouvelle-Aquitaine/.test(R.S01.canaux.facebook.texte) && /Source : Le Figaro/.test(R.S01.canaux.facebook.texte));
verifie('S01 : Le Figaro lu en partie ⇒ revue humaine signalée (jamais conforme d’office)', R.S01.canaux.facebook.attention.some((a) => /Le Figaro.*partiel/.test(a)));
verifie('S03 : la phrase qui cite franceinfo est prouvée par l’article de franceinfo (plus par le JDD)', R.S03.canaux.facebook.preuves.filter((p) => /franceinfo/.test(p.affirmation)).every((p) => /franceinfo/i.test(p.source?.media ?? '')) && !R.S03.canaux.facebook.preuves.some((p) => /Journal du Dimanche/.test(p.source?.media ?? '')));
{ const M5 = M_de('FR-2026-0005'); const r = composerPilote({ scenario: { id: 'T', famille: 'evolution', case_id: 'FR-2026-0005', event_id: '54946f38-6f58-4631-a904-a07ea92545ce' }, M: M5, publiques: cases, site: SITE });
  const p = clone(r.facebook); const s = p.paragraphes[1][0]; const jdd = [...M5.sources.values()].find((x) => /Journal du Dimanche/.test(x.media));
  s.preuve.source = { media: jdd.media, url: jdd.url, publie_le: jdd.publie_le };
  verifie('S03 : preuve rattachée à un autre média que celui cité (JDD pour « cité par franceinfo ») ⇒ contrôle en échec', !!jdd && !verifierPost(p, 'facebook', M5, SITE).ok); }
verifie('chaque post produit passe le contrôle de concordance média ↔ preuve', publies.every(({ k }) => k.controles.find((x) => /^concordance/.test(x.nom))?.ok));
// S13 / S14 : Montpellier — une affaire réconciliée = une seule identité documentaire ; jamais l'ancien identifiant ; jamais de post sans fiche approuvée.
const redir = lire('data/redirections-affaires.json').redirections;
verifie('S13 : une seule carte publique pour l’école Goethe de Montpellier (FR-2026-0146), FR-2026-0147 absente', [...cases.values()].filter((c) => /goethe/i.test(c.etablissement) && c.commune === 'Montpellier').map((c) => c.case_id).join() === 'FR-2026-0146' && !cases.has('FR-2026-0147'));
verifie('S13 : alias de l’ancien identifiant vers l’affaire conservée', redir['fr-2026-0147'] === 'fr-2026-0146');
verifie('S13 : aucune fiche approuvée ⇒ X et Facebook bloqués (pas de rédaction à partir des titres)', R.S13.canaux.x.etat === 'BLOQUE' && R.S13.canaux.facebook.etat === 'BLOQUE' && /aucune fiche approuvée/.test(R.S13.motifs.join(' ')));
verifie('S13 : aucune approbation antérieure (GO Discovery « valider et publier ») n’est lue comme un GO social ou une approbation de fiche', !EV.fiches_approuvees?.['FR-2026-0146'] && /aucun accordé/.test(R.S13.validation_requise));
verifie('S14 : l’identifiant retiré est refusé par le composeur, même avec une copie de la carte', /identifiant retiré/.test(R.S14.motifs.join(' ')) && composerPilote({ scenario: { id: 'T', famille: 'nouvelle_affaire', case_id: 'FR-2026-0147' }, M: M_de('FR-2026-0146'), publiques: cases, site: SITE, redirections: redir }).etat === 'BLOQUE');
{ const r = composerPilote({ scenario: SC, M: M_de('FR-2026-0025'), publiques: cases, site: SITE }); const p = clone(r.facebook); const s = p.paragraphes.flat().find((x) => x.role === 'renvoi');
  s.champs.lien.valeur = s.champs.lien.valeur.replace(/fr-2026-0025/g, 'fr-2026-0147'); s.texte = GABARITS[s.gabarit].replace('{lien}', s.champs.lien.valeur); p.texte = p.paragraphes.map((x) => x.map((y) => y.texte).join(' ')).join('\n\n');
  verifie('lien SNY vers l’identifiant retiré ⇒ contrôle en échec', !verifierPost(p, 'facebook', M_de('FR-2026-0025'), SITE, redir).ok); }
verifie('aucune source indépendante inventée : une ligne Source par article réellement rattaché, jamais deux fois le même', publies.every(({ k }) => { const u = (k.texte.match(/^Source : .* — (https?:\/\/\S+)$/gm) || []); return new Set(u).size === u.length; }));

console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ banc social : tous les contrôles passent (aucune publication, aucun appel Buffer)');
process.exit(ko ? 1 : 0);
