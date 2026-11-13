// =====================================================================
// scripts/qa/test-diffusion-sociale.mjs — relais social (Buffer) : éligibilité, messages, idempotence, réconciliation, retrait, secrets.
// TOUT est simulé (journal en mémoire, Buffer factice, fetch factice) : aucun réseau, aucune base, AUCUNE publication sur un compte public.
// Usage : node scripts/qa/test-diffusion-sociale.mjs
// =====================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { clientBuffer, ErreurBuffer } from '../lib/buffer.mjs';
import { diffuserCanal, suivreLigne, retirerLigne, reconcilierSansCreer } from '../lib/diffusion-flux.mjs';
import { evaluerEvenement, composerMessage, lienDiffusion, cleEvenement, evolutionSignificative, porteeRelais, signatureTexte, dateSourceNouvelleAffaire, LIMITE_X, LONGUEUR_LIEN_X } from '../lib/diffusion-sociale.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };
const section = (t) => console.log(`\n${t}`);
const SITE = 'https://sousnosyeux.org';
const wording = await import('../../web/src/lib/etat-wording.ts');

// --- fixtures ---------------------------------------------------------------------------------------------------------------------
const NOW = new Date('2026-11-12T10:00:00Z');
const DEPUIS = new Date('2026-11-11T08:00:00Z');
const ENTREE = {
  case_id: 'FR-2026-0200', etablissement: 'école Les Tilleuls', commune: 'Exempleville', departement: 'Nord', role_mis_en_cause: 'animateur périscolaire',
  statut_judiciaire: 'enquête', enfants_concernes_public: 'plusieurs enfants', lat: 50.6, lng: 3.0,
  sources: [{ url: 'https://presse.test/a', media: 'Le Quotidien', publication_date: '2026-11-10', is_primary: true }],
};
const phraseDe = (e) => { const p = e.sources[0]; const src = wording.sourceAffichee(e.etat ?? null, { media: p.media, date: p.publication_date, url: p.url }); const l = wording.phrasesEtat(e.statut_judiciaire, e.etat ?? null, src); return { phrase: l[0], mention: l.slice(1).join(' ') || null }; };
const evNew = (o = {}) => ({ type: 'new_case', case_id: ENTREE.case_id, event_key: cleEvenement('new_case', ENTREE.case_id), go_at: new Date('2026-11-12T09:00:00Z'), envoi_at: new Date('2026-11-12T08:30:00Z'), source_date: dateSourceNouvelleAffaire(ENTREE), ...o });
const evUpd = (o = {}) => ({ type: 'case_update', case_id: ENTREE.case_id, event_key: cleEvenement('case_update', ENTREE.case_id, 'mise en examen'), go_at: new Date('2026-11-12T09:00:00Z'), envoi_at: new Date('2026-11-12T08:30:00Z'), statut_avant: 'enquête', statut_apres: 'mise en examen', source_date: '2026-11-11', ...o });
const ctx = (o = {}) => ({ now: NOW, depuis: DEPUIS, holds: new Set(), publication_status: 'publiée', retire: false, entree: ENTREE, servi: true, ...o });
const ctxUpd = (o = {}) => ctx({ entree: { ...ENTREE, statut_judiciaire: 'mise en examen' }, ...o });

// Journal en mémoire (même contrat que le journal Neon) et Buffer factice.
function journal() {
  const m = new Map();
  const k = (e, c) => `${e}|${c}`;
  return {
    lignes: m,
    lire: async (e, c) => m.get(k(e, c)) || null,
    reserver: async (l) => { if (m.has(k(l.event_key, l.canal))) return false; m.set(k(l.event_key, l.canal), { ...l, etat: 'reserve', created_at: NOW.toISOString(), buffer_post_id: null, permalien: null }); return true; },
    maj: async (e, c, p) => { const l = m.get(k(e, c)); for (const [a, b] of Object.entries(p)) if (b !== undefined && b !== null) l[a] = b; },
  };
}
function bufferFactice({ creer = null, lecture = null, trouver = null, supprimer = null } = {}) {
  const b = { appels: { creer: 0, lire: 0, trouver: 0, supprimer: 0 }, posts: new Map(), dernier: null };
  b.creerPost = async (a) => {
    b.appels.creer++; b.dernier = a;
    if (creer) return creer(a, b);
    const id = `p${b.posts.size + 1}`; const p = { id, status: 'scheduled', text: a.texte, channelId: a.channelId, dueAt: a.dueAt, externalLink: null }; b.posts.set(id, p); return p;
  };
  b.lirePost = async (id) => { b.appels.lire++; if (lecture) return lecture(id, b); return b.posts.get(id) || null; };
  b.trouverPost = async (a) => { b.appels.trouver++; if (trouver) return trouver(a, b); return [...b.posts.values()].find((p) => p.channelId === a.channelId && p.text.includes(a.signature)) || null; };
  b.supprimerPost = async (id) => { b.appels.supprimer++; if (supprimer) return supprimer(id, b); b.posts.delete(id); return true; };
  return b;
}
const alertes = () => { const a = []; const f = async (t) => { a.push(t); }; f.liste = a; return f; };
const lienX = lienDiffusion({ site: SITE, case_id: ENTREE.case_id, type: 'new_case', canal: 'x' });

// =====================================================================
section('1. Nouvelle affaire éligible → message conforme');
{
  const v = evaluerEvenement(evNew(), ctx());
  verifie('événement éligible', v.ok, v.raisons.join(' ; '));
  const ph = phraseDe(ENTREE);
  const x = composerMessage({ type: 'new_case', canal: 'x', entree: ENTREE, ph, lien: lienX });
  verifie('X : texte produit', !!x.texte, x.erreur);
  verifie(`X : ≤ ${LIMITE_X} caractères (lien compté ${LONGUEUR_LIEN_X})`, x.texte.length - (lienX.length - LONGUEUR_LIEN_X) <= LIMITE_X);
  verifie('X : lien direct vers la fiche, avec les 4 UTM', /utm_source=x&utm_medium=social&utm_campaign=new_case&utm_content=fr-2026-0200/.test(x.texte) && x.texte.includes('#affaire-fr-2026-0200'), x.texte);
  verifie('X : phrase officielle du site (« Selon … une enquête a été ouverte »)', x.texte.includes('Selon Le Quotidien, une enquête a été ouverte.'), x.texte);
  verifie('X : rappel de présomption conservé', x.texte.includes('ne vaut pas culpabilité'), x.texte);
  const fb = composerMessage({ type: 'new_case', canal: 'facebook', entree: ENTREE, ph, lien: lienDiffusion({ site: SITE, case_id: ENTREE.case_id, type: 'new_case', canal: 'facebook' }) });
  verifie('Facebook : établissement, commune, département, phrase, lien', fb.texte.includes('école Les Tilleuls, Exempleville (Nord)') && fb.texte.includes('une enquête a été ouverte') && /utm_source=facebook/.test(fb.texte), fb.erreur || fb.texte);
  const ig = composerMessage({ type: 'new_case', canal: 'instagram', entree: ENTREE, ph, lien: null });
  verifie('Instagram : aucune URL présentée comme cliquable, renvoi vers la bio', !/https?:\/\//.test(ig.texte) && /lien dans la bio/.test(ig.texte), ig.erreur || ig.texte);
  const tous = [x.texte, fb.texte, ig.texte].join('\n').toLowerCase();
  verifie('aucun rôle de la personne mise en cause, aucun nombre d’enfants, aucun détail', !tous.includes('animateur') && !/\d+ enfants?/.test(tous) && !tous.includes('plusieurs enfants'));
  const long = composerMessage({ type: 'new_case', canal: 'x', entree: { ...ENTREE, etablissement: 'Établissement à nom démesurément long '.repeat(8) }, ph, lien: lienX });
  verifie('X : trop long ⇒ silence sur ce canal (jamais un texte tronqué)', !!long.erreur && !long.texte);
  const leak = composerMessage({ type: 'new_case', canal: 'x', entree: { ...ENTREE, etablissement: 'école animateur périscolaire' }, ph, lien: lienX });
  verifie('contrôle de contenu : le rôle de la personne mise en cause bloque le texte', !!leak.erreur);
}

section('2. Évolution éligible → message conforme');
{
  verifie('évolution enquête → mise en examen significative', evolutionSignificative('enquête', 'mise en examen'));
  const v = evaluerEvenement(evUpd(), ctxUpd());
  verifie('événement éligible', v.ok, v.raisons.join(' ; '));
  const e = { ...ENTREE, statut_judiciaire: 'mise en examen' };
  const m = composerMessage({ type: 'case_update', canal: 'x', entree: e, ph: phraseDe(e), lien: lienDiffusion({ site: SITE, case_id: e.case_id, type: 'case_update', statut: 'mise en examen', canal: 'x' }) });
  verifie('X : « Évolution documentée par la presse » + phrase officielle + utm_campaign=case_update', m.texte.startsWith('Évolution documentée par la presse') && m.texte.includes('une mise en examen a été prononcée') && m.texte.includes('utm_campaign=case_update') && m.texte.includes('utm_content=fr-2026-0200-mise-en-examen'), m.erreur || m.texte);
  const c = { ...ENTREE, statut_judiciaire: 'condamnation non définitive' };
  const mc = composerMessage({ type: 'case_update', canal: 'facebook', entree: c, ph: phraseDe(c), lien: lienX });
  verifie('condamnation sans finalité validée : pas de « non définitive » affirmé (doctrine du site)', /une condamnation a été prononcée/.test(mc.texte) && !/non définitive/.test(mc.texte), mc.texte);
  const p = composerMessage({ type: 'case_update', canal: 'x', entree: { ...ENTREE, statut_judiciaire: 'procès' }, ph: phraseDe({ ...ENTREE, statut_judiciaire: 'procès' }), lien: lienX });
  verifie('procès : « audience annoncée ou déjà tenue », jamais « s’est tenu » sans date', /audience annoncée ou déjà tenue/.test(p.texte) && !/s'est tenu/.test(p.texte), p.texte);
}

section('3. Source de plus de sept jours → zéro diffusion');
{
  const v = evaluerEvenement(evNew({ source_date: '2026-11-04' }), ctx());
  verifie('source du 04/11 évaluée le 12/11 (8 jours) : silence', !v.ok && v.raisons.some((r) => /> 7/.test(r)), v.raisons.join(' ; '));
  verifie('source du 06/11 (6 jours) : éligible', evaluerEvenement(evNew({ source_date: '2026-11-06' }), ctx()).ok);
  verifie('date de source absente : silence', !evaluerEvenement(evNew({ source_date: null }), ctx()).ok);
  verifie('date de source dans le futur : silence', !evaluerEvenement(evNew({ source_date: '2026-11-20' }), ctx()).ok);
  verifie('évolution dont la source a 9 jours : silence', !evaluerEvenement(evUpd({ source_date: '2026-11-03' }), ctxUpd()).ok);
}

section('4. Correction technique / mise à jour sans portée → zéro diffusion');
{
  for (const type of ['correction', 'source_ajoutee', 'mise_a_jour_technique', 'mobilisation']) verifie(`type « ${type} » : jamais diffusé`, !evaluerEvenement({ ...evNew(), type }, ctx()).ok);
  verifie('statut inchangé : non significatif', !evaluerEvenement(evUpd({ statut_avant: 'mise en examen' }), ctxUpd()).ok);
  verifie('statut en recul : non significatif', !evolutionSignificative('procès', 'enquête'));
  verifie('relaxe / non-lieu / classement : jamais automatisé (finalité non établie par la presse)', !evolutionSignificative('procès', 'relaxe / non-lieu / classement') && !evaluerEvenement({ ...evNew() }, ctx({ entree: { ...ENTREE, statut_judiciaire: 'relaxe / non-lieu / classement' } })).ok);
  verifie('plainte seule : jamais diffusée', !evaluerEvenement(evNew(), ctx({ entree: { ...ENTREE, statut_judiciaire: 'plainte' } })).ok);
  verifie('statut « à qualifier » (ambigu) : silence', !evaluerEvenement(evNew(), ctx({ entree: { ...ENTREE, statut_judiciaire: 'à qualifier' } })).ok);
  verifie('le statut public ≠ statut de l’évolution approuvée : silence', !evaluerEvenement(evUpd(), ctx()).ok);
}

section('5. Absence de GO → zéro diffusion');
{
  verifie('GO absent (go_at manquant)', !evaluerEvenement(evNew({ go_at: null }), ctx()).ok);
  verifie('message d’approbation introuvable (envoi_at null) : pas de portée « relais social » prouvée', !evaluerEvenement(evNew({ envoi_at: null }), ctx()).ok);
  verifie('message d’approbation envoyé AVANT l’activation (sans la portée) : silence', !evaluerEvenement(evNew({ envoi_at: new Date('2026-11-10T08:00:00Z') }), ctx()).ok);
  verifie('activation non datée : aucune diffusion', !evaluerEvenement(evNew(), ctx({ depuis: null })).ok);
}

section('6. Page non servie, retirée ou gelée → zéro diffusion');
{
  verifie('page non servie à l’identique', !evaluerEvenement(evNew(), ctx({ servi: false })).ok);
  verifie('site injoignable (servi = null)', !evaluerEvenement(evNew(), ctx({ servi: null })).ok);
  verifie('affaire retirée', !evaluerEvenement(evNew(), ctx({ publication_status: 'retirée' })).ok);
  verifie('revue « retirer »', !evaluerEvenement(evNew(), ctx({ retire: true })).ok);
  verifie('HOLD de publication', !evaluerEvenement(evNew(), ctx({ holds: new Set([ENTREE.case_id]) })).ok);
  verifie('absente de l’artefact public', !evaluerEvenement(evNew(), ctx({ entree: null })).ok);
  verifie('sans coordonnée publique', !evaluerEvenement(evNew(), ctx({ entree: { ...ENTREE, lat: null } })).ok);
}

section('7. Rejeu identique → zéro doublon');
{
  const ledger = journal(), buffer = bufferFactice(), ev = evNew();
  const a = { ev, canal: 'x', texte: 'texte utm_content=fr-2026-0200', channelId: 'CX', ledger, buffer, now: NOW };
  const r1 = await diffuserCanal(a), r2 = await diffuserCanal(a), r3 = await diffuserCanal({ ...a, now: new Date(NOW.getTime() + 3 * 864e5) });
  verifie('premier passage : créé', r1.action === 'cree');
  verifie('rejeu et rejeu tardif : « deja », aucun nouvel appel', r2.action === 'deja' && r3.action === 'deja' && buffer.appels.creer === 1, JSON.stringify(buffer.appels));
  const [x, f] = [await diffuserCanal({ ...a, canal: 'facebook', channelId: 'CF' }), await diffuserCanal({ ...a, canal: 'facebook', channelId: 'CF' })];
  verifie('un canal différent est une diffusion distincte, une seule fois chacun', x.action === 'cree' && f.action === 'deja' && buffer.appels.creer === 2);
  // Deux passages SIMULTANÉS : la réservation est atomique (clé primaire) — un seul crée.
  const l2 = journal(), b2 = bufferFactice();
  const rs = await Promise.all([1, 2, 3].map(() => diffuserCanal({ ...a, ledger: l2, buffer: b2 })));
  verifie('3 passages concurrents : un seul createPost', b2.appels.creer === 1 && rs.filter((r) => r.action === 'cree').length === 1, JSON.stringify(rs.map((r) => r.action)));
  verifie('un échec définitif n’est jamais retenté automatiquement', await (async () => { const l = journal(), b = bufferFactice({ creer: async () => { throw new ErreurBuffer('refus', 'refusé'); } }); await diffuserCanal({ ...a, ledger: l, buffer: b }); const r = await diffuserCanal({ ...a, ledger: l, buffer: b }); return r.action === 'deja' && b.appels.creer === 1; })());
}

section('8. Timeout ou statut API incertain → réconciliation avant tout nouvel essai');
{
  const ledger = journal(); let envoye = null;
  const buffer = bufferFactice({ creer: async (a, b) => { envoye = { id: 'pZ', status: 'scheduled', text: a.texte, channelId: a.channelId }; b.posts.set('pZ', envoye); throw new ErreurBuffer('incertain', 'délai dépassé'); } });
  const a = { ev: evNew(), canal: 'x', texte: `Texte ${lienX}`, channelId: 'CX', ledger, buffer, now: NOW };
  const r1 = await diffuserCanal(a);
  verifie('timeout alors que Buffer a bien créé le post : ligne « reserve », aucune autre tentative', r1.action === 'incertain' && ledger.lignes.get('new_case|FR-2026-0200|x').etat === 'reserve' && buffer.appels.creer === 1);
  const r2 = await diffuserCanal({ ...a, now: new Date(NOW.getTime() + 20 * 6e4) });
  verifie('passage suivant : le post existant est RETROUVÉ, pas recréé', r2.action === 'reconcilie' && buffer.appels.creer === 1 && ledger.lignes.get('new_case|FR-2026-0200|x').buffer_post_id === 'pZ', JSON.stringify(r2));
  // Lecture distante impossible : on ne répète pas à l’aveugle.
  const l3 = journal(), b3 = bufferFactice({ creer: async () => { throw new ErreurBuffer('incertain', 'réseau'); }, trouver: async () => { throw new ErreurBuffer('incertain', 'panne de lecture'); } });
  const a3 = { ev: evNew(), canal: 'x', texte: `Texte ${lienX}`, channelId: 'CX', ledger: l3, buffer: b3, now: NOW };
  await diffuserCanal(a3);
  const r3 = await diffuserCanal({ ...a3, now: new Date(NOW.getTime() + 60 * 6e4) });
  verifie('lecture distante en panne : attente, AUCUN second createPost', r3.action === 'attente' && b3.appels.creer === 1, JSON.stringify(r3));
  // Lecture réussie, rien trouvé, délai de grâce dépassé : une seule recréation ; avant la grâce : attente.
  const l4 = journal(), b4 = bufferFactice({ creer: async (a, b) => { if (b.appels.creer === 1) throw new ErreurBuffer('incertain', 'timeout'); const p = { id: 'pN', status: 'scheduled', text: a.texte, channelId: a.channelId }; b.posts.set('pN', p); return p; } });
  const a4 = { ev: evNew(), canal: 'x', texte: `Texte ${lienX}`, channelId: 'CX', ledger: l4, buffer: b4, now: NOW };
  await diffuserCanal(a4);
  const avant = await diffuserCanal({ ...a4, now: new Date(NOW.getTime() + 5 * 6e4) });
  const apres = await diffuserCanal({ ...a4, now: new Date(NOW.getTime() + 30 * 6e4) });
  verifie('rien retrouvé : attente pendant la grâce, puis une seule création', avant.action === 'attente' && apres.action === 'cree' && b4.appels.creer === 2, JSON.stringify([avant, apres]));
  // 429 : incertain, rien consommé.
  const rl = bufferFactice({ creer: async () => { throw new ErreurBuffer('incertain', 'limite de débit', 429); } });
  verifie('429 : « incertain » (nouvel essai plus tard), pas un échec définitif', (await diffuserCanal({ ev: evNew(), canal: 'x', texte: 't', channelId: 'CX', ledger: journal(), buffer: rl, now: NOW })).action === 'incertain');
  // Le jeton « utm_content=fr-2026-0200 » ne reconnaît pas l’événement voisin « …-0200-mise-en-examen ».
  const cli = clientBuffer({ cle: 'k', organisationId: 'o', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { posts: { edges: [{ node: { id: 'v', channelId: 'CX', text: 'x https://s/?utm_content=fr-2026-0200-mise-en-examen#a', status: 'sent' } }] } } }) }) });
  verifie('signature : un événement voisin n’est pas confondu', (await cli.trouverPost({ channelId: 'CX', signature: signatureTexte('t https://s/?utm_content=fr-2026-0200#a'), depuis: 'x' })) === null);
  // Suivi : soumis → programmé → envoyé → vérifié (quatre états distincts).
  const ls = journal(), bs = bufferFactice(), as = alertes();
  await diffuserCanal({ ev: evNew(), canal: 'x', texte: 't utm_content=fr-2026-0200', channelId: 'CX', ledger: ls, buffer: bs, now: NOW });
  const ligne = () => ls.lignes.get('new_case|FR-2026-0200|x');
  verifie('état « programme » après acceptation par Buffer (statut scheduled)', ligne().etat === 'programme');
  bs.posts.get('p1').status = 'sent'; bs.posts.get('p1').externalLink = null;
  await suivreLigne({ row: ligne(), ledger: ls, buffer: bs, now: NOW, alerter: as });
  verifie('« sent » sans permalien = « envoye », PAS « verifie »', ligne().etat === 'envoye');
  bs.posts.get('p1').externalLink = 'https://x.test/status/1';
  await suivreLigne({ row: ligne(), ledger: ls, buffer: bs, now: NOW, alerter: as });
  verifie('permalien distant relu = « verifie »', ligne().etat === 'verifie' && ligne().permalien === 'https://x.test/status/1');
  const le = journal(), be = bufferFactice(), ae = alertes();
  await diffuserCanal({ ev: evNew(), canal: 'x', texte: 't utm_content=fr-2026-0200', channelId: 'CX', ledger: le, buffer: be, now: NOW });
  be.posts.get('p1').status = 'error';
  await suivreLigne({ row: le.lignes.get('new_case|FR-2026-0200|x'), ledger: le, buffer: be, now: NOW, alerter: ae });
  verifie('erreur de publication signalée par Buffer : « echec » + alerte', le.lignes.get('new_case|FR-2026-0200|x').etat === 'echec' && ae.liste.length === 1);
  // Réservation d’un événement qui n’est plus éligible : on retrouve, on ne crée jamais.
  const lr = journal(), br = bufferFactice({ creer: async () => { throw new ErreurBuffer('incertain', 'x'); } });
  await diffuserCanal({ ev: evNew(), canal: 'x', texte: 't utm_content=fr-2026-0200', channelId: 'CX', ledger: lr, buffer: br, now: NOW });
  const rr = await reconcilierSansCreer({ row: lr.lignes.get('new_case|FR-2026-0200|x'), channelId: 'CX', ledger: lr, buffer: br, now: new Date(NOW.getTime() + 30 * 6e4) });
  verifie('plus éligible + rien retrouvé : « echec » (aucune diffusion), aucun createPost', rr.action === 'non_cree' && br.appels.creer === 1 && lr.lignes.get('new_case|FR-2026-0200|x').etat === 'echec');
}

section('9. Échec d’un canal → les autres restent autonomes');
{
  const ledger = journal(), al = alertes();
  const buffer = bufferFactice({ creer: async (a, b) => { if (a.channelId === 'CX') throw new ErreurBuffer('refus', 'canal verrouillé'); if (a.channelId === 'CI') throw new Error('boum inattendu'); const p = { id: `p${b.posts.size + 1}`, status: 'scheduled', text: a.texte, channelId: a.channelId }; b.posts.set(p.id, p); return p; } });
  const res = {};
  for (const [canal, ch] of [['x', 'CX'], ['facebook', 'CF'], ['instagram', 'CI']]) {
    try { res[canal] = await diffuserCanal({ ev: evNew(), canal, texte: `t ${canal}`, channelId: ch, imageUrl: 'https://sousnosyeux.org/og-sousnosyeux.png', ledger, buffer, now: NOW, alerter: al }); } catch (e) { res[canal] = { action: 'exception' }; }
  }
  verifie('X refusé ⇒ « echec » consigné avec la cause', res.x.action === 'echec' && ledger.lignes.get('new_case|FR-2026-0200|x').etat === 'echec' && /verrouillé/.test(ledger.lignes.get('new_case|FR-2026-0200|x').erreur));
  verifie('Facebook publié malgré l’échec de X', res.facebook.action === 'cree' && ledger.lignes.get('new_case|FR-2026-0200|facebook').etat === 'programme');
  verifie('erreur inattendue sur Instagram : isolée (ligne conservée, pas de crash)', res.instagram.action === 'incertain');
}

section('10. Retrait après programmation → annulation ou alerte fiable');
{
  const prepare = async (statut = 'scheduled', lien = null) => {
    const ledger = journal(), buffer = bufferFactice(), alerter = alertes();
    await diffuserCanal({ ev: evNew(), canal: 'x', texte: 't utm_content=fr-2026-0200', channelId: 'CX', ledger, buffer, now: NOW, alerter });
    const p = buffer.posts.get('p1'); p.status = statut; p.externalLink = lien;
    return { ledger, buffer, alerter, row: () => ledger.lignes.get('new_case|FR-2026-0200|x') };
  };
  let s = await prepare();
  let r = await retirerLigne({ row: s.row(), motif: 'revue « retirer »', channelId: 'CX', ledger: s.ledger, buffer: s.buffer, alerter: s.alerter });
  verifie('post programmé : deletePost appelé, ligne « annule »', r.action === 'annule' && s.buffer.appels.supprimer === 1 && s.row().etat === 'annule' && !s.buffer.posts.has('p1'));
  s = await prepare('sent', 'https://x.test/status/9'); await suivreLigne({ row: s.row(), ledger: s.ledger, buffer: s.buffer, now: NOW, alerter: s.alerter });
  r = await retirerLigne({ row: s.row(), motif: 'affaire retirée', channelId: 'CX', ledger: s.ledger, buffer: s.buffer, alerter: s.alerter });
  verifie('post DÉJÀ publié : aucune suppression simulée, état « retire_apres_envoi »', r.action === 'retire_apres_envoi' && s.buffer.appels.supprimer === 0 && s.row().etat === 'retire_apres_envoi');
  verifie('… alerte prioritaire avec le lien du post et la procédure manuelle', s.alerter.liste.some((t) => /URGENT/.test(t) && t.includes('https://x.test/status/9') && /DIFFUSION_SOCIALE\.md/.test(t)));
  // La suppression est refusée parce que le post vient de partir : on relit et on alerte avec le lien.
  s = await prepare();
  s.buffer.supprimerPost = async () => { throw new ErreurBuffer('refus', 'déjà publié'); };
  s.buffer.posts.get('p1').status = 'sent'; s.buffer.posts.get('p1').externalLink = 'https://x.test/status/10';
  r = await retirerLigne({ row: s.row(), motif: 'HOLD de publication', channelId: 'CX', ledger: s.ledger, buffer: s.buffer, alerter: s.alerter });
  verifie('suppression refusée, post parti entre-temps : « retire_apres_envoi » + lien', r.action === 'retire_apres_envoi' && s.alerter.liste.some((t) => t.includes('https://x.test/status/10')));
  // Suppression impossible à confirmer : alerte humaine, jamais un faux « annulé ».
  s = await prepare();
  s.buffer.supprimerPost = async () => { throw new ErreurBuffer('incertain', 'panne'); }; s.buffer.lirePost = async () => { throw new ErreurBuffer('incertain', 'panne'); };
  r = await retirerLigne({ row: s.row(), motif: 'affaire retirée', channelId: 'CX', ledger: s.ledger, buffer: s.buffer, alerter: s.alerter });
  verifie('panne pendant l’annulation : alerte « à supprimer à la main », ligne NON marquée annulée', r.action === 'echec_annulation' && s.row().etat !== 'annule' && s.alerter.liste.some((t) => /à la main/.test(t)));
  // Réservation sans identifiant (réponse incertaine) puis retrait : on retrouve le post avant de conclure.
  const ledger = journal(); const buffer = bufferFactice({ creer: async (a, b) => { b.posts.set('pQ', { id: 'pQ', status: 'scheduled', text: a.texte, channelId: a.channelId }); throw new ErreurBuffer('incertain', 'timeout'); } });
  const al = alertes();
  await diffuserCanal({ ev: evNew(), canal: 'x', texte: 't utm_content=fr-2026-0200', channelId: 'CX', ledger, buffer, now: NOW, alerter: al });
  r = await retirerLigne({ row: ledger.lignes.get('new_case|FR-2026-0200|x'), motif: 'affaire retirée', channelId: 'CX', ledger, buffer, alerter: al });
  verifie('réservation incertaine + retrait : le post existant est retrouvé puis annulé', r.action === 'annule' && !buffer.posts.has('pQ'));
}

section('11. Aucune publication historique lors de l’activation');
{
  verifie('GO du 10/11 (avant l’activation du 11/11) : inéligible', !evaluerEvenement(evNew({ go_at: new Date('2026-11-10T09:00:00Z'), envoi_at: new Date('2026-11-12T08:30:00Z') }), ctx()).ok);
  verifie('stock publié historiquement (aucun GO postérieur) : inéligible', !evaluerEvenement(evNew({ go_at: null, envoi_at: null }), ctx()).ok);
  const d = JSON.parse(readFileSync(new URL('../../data/cases.json', import.meta.url), 'utf8')).cases;
  const eligiblesStock = d.filter((c) => evaluerEvenement({ type: 'new_case', case_id: c.case_id, event_key: 'k', go_at: new Date('2026-10-01'), envoi_at: new Date('2026-10-01'), source_date: dateSourceNouvelleAffaire(c) }, ctx({ entree: c, depuis: new Date() })).ok);
  verifie(`stock réel (${d.length} affaires) : AUCUNE n’est éligible une fois l’activation datée de maintenant`, eligiblesStock.length === 0, `${eligiblesStock.length} éligibles`);
  verifie('le script exige SNY_DIFFUSION_ACTIVE=1 ET SNY_DIFFUSION_MODE=review (désactivé par défaut) ; aucune promesse de relais sinon', /ECRIRE && (env('SNY_DIFFUSION_ACTIVE') !== '1' || env('SNY_DIFFUSION_MODE') !== 'review')/.test(readFileSync(new URL('../diffuser-social.mjs', import.meta.url), 'utf8')) && !porteeRelais('new_case', {}) && !porteeRelais('new_case', { SNY_DIFFUSION_ACTIVE: '1' }));
  verifie('le texte du GO dit la vérité : le clic de publication NE VAUT PAS relais social (proposition et GO distincts), seulement si le mode REVIEW est actif', !porteeRelais('new_case', { SNY_DIFFUSION_ACTIVE: '0', SNY_DIFFUSION_MODE: 'review' }) && /ne vaut PAS relais social/.test(porteeRelais('new_case', { SNY_DIFFUSION_ACTIVE: '1', SNY_DIFFUSION_MODE: 'review' })) && /propre GO/.test(porteeRelais('case_update', { SNY_DIFFUSION_ACTIVE: '1', SNY_DIFFUSION_MODE: 'review' })));
}

section('B4. Portée du GO unique — libellé de l’approbation Telegram');
{
  const { messagePublication } = await import('../lib/discovery-messages.mjs');
  const p = { etablissement: 'école Les Tilleuls', commune: 'Exempleville', publication: { case_id: 'FR-2026-0200', publiable: true, statut_judiciaire: 'enquête', fiabilite: 8, criteres: {}, sources: [], localisation: { type: 'documentee', lat: 1, lng: 1 } } };
  const avant = process.env.SNY_DIFFUSION_ACTIVE;
  delete process.env.SNY_DIFFUSION_ACTIVE;
  const sans = messagePublication(p);
  process.env.SNY_DIFFUSION_ACTIVE = '1';
  process.env.SNY_DIFFUSION_MODE = 'review';
  const avec = messagePublication(p);
  const bloque = messagePublication({ ...p, publication: { ...p.publication, publiable: false, bloque: 'x' } });
  if (avant === undefined) delete process.env.SNY_DIFFUSION_ACTIVE; else process.env.SNY_DIFFUSION_ACTIVE = avant;
  delete process.env.SNY_DIFFUSION_MODE;
  verifie('diffusion désactivée : le message d’approbation est inchangé (aucune promesse de relais)', !/relais social/.test(sans));
  verifie('diffusion activée : le message « PUBLIER » ne promet PAS de relais social (proposition et GO distincts)', !/relais social strictement factuel/.test(avec) && /ne vaut PAS relais social/.test(avec));
  verifie('proposition non publiable : aucune mention de relais', !/relais social/.test(bloque));
}

section('12. Aucune fuite de secrets');
{
  const CLE = 'CLE-SECRETE-DE-TEST-0123456789';
  const sorties = []; const l = console.log, e = console.error; console.log = (...a) => sorties.push(a.join(' ')); console.error = (...a) => sorties.push(a.join(' '));
  let msgs = [];
  for (const fetchImpl of [async () => { throw new Error(`échec avec ${CLE}`); }, async () => ({ ok: false, status: 401, json: async () => ({ errors: [{ message: `jeton ${CLE} invalide` }] }) }), async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: `Bearer ${CLE}` }] }) }), async () => ({ ok: true, status: 200, json: async () => ({ data: { createPost: { __typename: 'MutationError', message: `refus ${CLE}` } } }) })]) {
    try { await clientBuffer({ cle: CLE, organisationId: 'o', fetchImpl }).creerPost({ channelId: 'c', canal: 'x', texte: 't', dueAt: 'd' }); } catch (x) { msgs.push(String(x.message)); }
  }
  console.log = l; console.error = e;
  verifie('aucun message d’erreur du client ne contient la clé', msgs.length === 4 && msgs.every((m) => !m.includes(CLE)), msgs.join(' | '));
  verifie('le client n’écrit rien dans les logs', sorties.length === 0);
  let entetes = null, corps = null;
  await clientBuffer({ cle: CLE, organisationId: 'o', fetchImpl: async (u, o) => { entetes = o.headers; corps = o.body; return { ok: true, status: 200, json: async () => ({ data: { createPost: { post: { id: 'p', status: 'scheduled' } } } }) }; } }).creerPost({ channelId: 'c', canal: 'x', texte: 't', dueAt: 'd' });
  verifie('la clé ne voyage que dans l’en-tête Authorization, jamais dans le corps', entetes.authorization === `Bearer ${CLE}` && !corps.includes(CLE));
  const dossier = new URL('../', import.meta.url);
  const fichiers = ['diffuser-social.mjs', 'lib/buffer.mjs', 'lib/diffusion-flux.mjs', 'lib/diffusion-sociale.mjs'].map((f) => readFileSync(new URL(f, dossier), 'utf8')).join('\n') + readFileSync(new URL('../.github/workflows/sny-diffusion.yml', dossier), 'utf8');
  verifie('aucun secret en dur dans les fichiers de la diffusion (clés, jetons, identifiants de canal)', !/(Bearer\s+[A-Za-z0-9_\-]{20,}|1\/[A-Za-z0-9_\-]{30,}|api[_-]?key\s*[:=]\s*['"][^'"]{12,})/i.test(fichiers));
  verifie('le script et le relais n’impriment jamais le texte d’un post, ni un lieu, ni une clé (journaux publics : identifiants et issues seulement)', !/log\([^;]*\.texte/.test(readFileSync(new URL('../lib/relais-social.mjs', import.meta.url), 'utf8')) && !/log\([^;]*\.texte/.test(readFileSync(new URL('../diffuser-social.mjs', import.meta.url), 'utf8')));
}

section('Client Buffer — forme des requêtes (mocks)');
{
  let derniere = null;
  const faux = (reponse) => async (u, o) => { derniere = { u, o, corps: JSON.parse(o.body) }; return { ok: true, status: 200, json: async () => reponse }; };
  const ok = { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'p1', status: 'scheduled', dueAt: 'd' } } } };
  const c = clientBuffer({ cle: 'k', organisationId: 'org', fetchImpl: faux(ok) });
  await c.creerPost({ channelId: 'CX', canal: 'x', texte: 'bonjour', dueAt: '2026-11-12T10:15:00.000Z' });
  const inp = derniere.corps.variables.input;
  verifie('endpoint GraphQL officiel, POST', derniere.u === 'https://api.buffer.com' && derniere.o.method === 'POST');
  verifie('publication AUTOMATIQUE (jamais « notification »), programmée avec marge d’annulation', inp.schedulingType === 'automatic' && inp.mode === 'customScheduled' && inp.dueAt === '2026-11-12T10:15:00.000Z');
  verifie('X : aucun metadata ni asset', !inp.metadata && inp.assets.length === 0);
  await c.creerPost({ channelId: 'CF', canal: 'facebook', texte: 't', dueAt: 'd', avecLienFacebook: 'https://s/' });
  verifie('Facebook : Page, type « post »', derniere.corps.variables.input.metadata.facebook.type === 'post');
  await c.creerPost({ channelId: 'CI', canal: 'instagram', texte: 't', dueAt: 'd', imageUrl: 'https://sousnosyeux.org/og-sousnosyeux.png' });
  verifie('Instagram : image à URL publique + type « post », schedulingType automatic', derniere.corps.variables.input.assets[0].image.url.endsWith('og-sousnosyeux.png') && derniere.corps.variables.input.schedulingType === 'automatic');
  let refus = null; try { await c.creerPost({ channelId: 'CI', canal: 'instagram', texte: 't', dueAt: 'd' }); } catch (e) { refus = e; }
  verifie('Instagram sans image : refus (jamais une publication sans média)', refus?.kind === 'refus');
  await clientBuffer({ cle: 'k', organisationId: 'org', fetchImpl: faux({ data: { posts: { edges: [] } } }) }).trouverPost({ channelId: 'CX', signature: 'utm_content=a', depuis: '2026-11-12T10:00:00.000Z' });
  const fl = derniere.corps.variables.input.filter;
  verifie('réconciliation : filtre de dates = createdAt.start (champ réel du schéma Buffer), jamais startDate', fl.createdAt?.start === '2026-11-12T10:00:00.000Z' && !('startDate' in fl) && fl.channelIds[0] === 'CX' && derniere.corps.variables.input.organizationId === 'org');
  let lim = null; try { await clientBuffer({ cle: 'k', organisationId: 'o', fetchImpl: faux({ data: { createPost: { __typename: 'LimitReachedError', message: 'limit' } } }) }).creerPost({ channelId: 'CX', canal: 'x', texte: 't', dueAt: 'd' }); } catch (e) { lim = e; }
  verifie('limite du plan atteinte (LimitReachedError) : « incertain » — réessayé plus tard, pas un échec définitif', lim?.kind === 'incertain');
  let nf = null; try { await clientBuffer({ cle: 'k', organisationId: 'o', fetchImpl: faux({ data: { createPost: { __typename: 'NotFoundError', message: 'Channel not found' } } }) }).creerPost({ channelId: 'CX', canal: 'x', texte: 't', dueAt: 'd' }); } catch (e) { nf = e; }
  verifie('canal introuvable (NotFoundError) : refus définitif', nf?.kind === 'refus');
  verifie('mutation de suppression = deletePost sur un id', await clientBuffer({ cle: 'k', organisationId: 'o', fetchImpl: faux({ data: { deletePost: { __typename: 'DeletePostSuccess' } } }) }).supprimerPost('p9') && /deletePost/.test(derniere.corps.query) && derniere.corps.variables.input.id === 'p9');
  let r500 = null; try { await clientBuffer({ cle: 'k', organisationId: 'o', fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) }).canaux(); } catch (e) { r500 = e; }
  verifie('HTTP 5xx : « incertain » (à réconcilier)', r500?.kind === 'incertain');
}

section('Liens : UTM et canonical');
{
  const l = lienDiffusion({ site: SITE, case_id: 'FR-2026-0200', type: 'case_update', statut: 'mise en examen', canal: 'facebook', fiche: true });
  const u = new URL(l);
  verifie('fiche approuvée : /affaires/<id>/ + utm_source/medium/campaign/content', u.pathname === '/affaires/fr-2026-0200/' && u.searchParams.get('utm_source') === 'facebook' && u.searchParams.get('utm_medium') === 'social' && u.searchParams.get('utm_campaign') === 'case_update' && u.searchParams.get('utm_content') === 'fr-2026-0200-mise-en-examen');
  const layout = readFileSync(new URL('../../web/src/layouts/Layout.astro', import.meta.url), 'utf8');
  verifie('canonical calculé depuis le chemin seul (les paramètres UTM ne le modifient pas)', /const canonical = new URL\(path === '\/' \? '\/' : path \+ '\/', SITE\)\.href/.test(layout) && !/Astro\.url\.search/.test(layout));
}

console.log(ko ? `\n❌ ${ko} vérification(s) en échec` : '\n✅ diffusion sociale : toutes les vérifications passent');
process.exit(ko ? 1 : 0);
