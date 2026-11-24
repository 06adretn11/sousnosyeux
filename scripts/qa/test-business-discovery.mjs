// =====================================================================
// scripts/qa/test-business-discovery.mjs — requête, classement et normalisation Business Discovery.
// ⚠ SIMULÉ : les réponses ci-dessous sont construites d'après la documentation Meta du 23/11/2026, PAS observées. Aucun réseau, aucun jeton.
// Elles prouvent que l'outil distingue succès / vide / partiel / panne d'accès, pas que Meta répond ainsi.
// Usage : node scripts/qa/test-business-discovery.mjs
// =====================================================================
import {
  construireRequete, urlAvecJeton, classerReponse, classerErreur, normaliserPublications, masquer, validerPseudo,
  fusionnerPublications, stockDepuisPreuves, validerJeton, PERMISSIONS_BASE, PERMISSIONS_UNIFIED, requeteMoi, requeteComptesAssignes, typeJetonUnified, extraireComptesAssignes, requeteComptes, requetePage, requeteIdentite, extrairePages, extraireIgDePage, identiteConforme,
} from '../lib/business-discovery.mjs';

let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };
const leve = (f) => { try { f(); return false; } catch { return true; } };

// --- requête ---
const r1 = construireRequete({ igUserId: '17841400000000001', pseudo: '@bluebottle' });
verifie('profil : fields attendu, version documentée', r1.params.fields === 'business_discovery.username(bluebottle){id,username,media_count}' && r1.version === 'v27.0', r1.params.fields);
const r2 = construireRequete({ igUserId: '17841400000000001', pseudo: 'x.y_z', medias: true, limite: 10 });
verifie('publications : media.limit(10) et champs minimaux, sans compteur de réactions', r2.params.fields === 'business_discovery.username(x.y_z){id,username,media_count,media.limit(10){id,caption,timestamp,permalink,media_type}}' && !/like_count|comments_count/.test(r2.params.fields), r2.params.fields);
verifie('curseur injecté par media.after(...)', construireRequete({ igUserId: '17841400000000001', pseudo: 'abc', medias: true, apres: 'QVFIUjk_x-=' }).params.fields.includes('media.limit(10).after(QVFIUjk_x-=)'));
verifie('limite bornée à 50', construireRequete({ igUserId: '17841400000000001', pseudo: 'abc', medias: true, limite: 5000 }).params.fields.includes('media.limit(50)'));
verifie('pseudo avec accolade/parenthèse/espace refusé (pas d\'injection dans l\'expression de champs)', ['a}b', 'a(b)', 'a b', '', 'x'.repeat(31), 'a{id}'].every((p) => leve(() => construireRequete({ igUserId: '17841400000000001', pseudo: p }))));
verifie('identifiant non numérique refusé', leve(() => construireRequete({ igUserId: 'me', pseudo: 'abc' })));
verifie('version invalide refusée', leve(() => construireRequete({ igUserId: '17841400000000001', pseudo: 'abc', version: '../v1' })));
verifie('curseur invalide refusé', leve(() => construireRequete({ igUserId: '17841400000000001', pseudo: 'abc', medias: true, apres: 'a).b' })));

// --- jeton ---
const JETON = 'EAAB' + 'x'.repeat(60);
const url = urlAvecJeton(r1, JETON);
verifie('le jeton est dans l\'URL en mémoire (paramètre documenté)…', url.searchParams.get('access_token') === JETON && url.hostname === 'graph.facebook.com');
verifie('…et masquer() le retire de l\'URL, de l\'en-tête et d\'un message', ![url.toString(), `Bearer ${JETON}`, `échec ${JETON} fin`].map((t) => masquer(t, JETON)).some((t) => t.includes(JETON)));
verifie('masquer() retire un jeton non fourni explicitement (motif access_token=)', !masquer('GET /x?access_token=abcdef123456&fields=id').includes('abcdef123456'));

// --- classement ---
const corpsProfil = { business_discovery: { id: '1', username: 'cible', media_count: 42 }, id: '17841400000000001' };
const publi = (i, extra = {}) => ({ id: `9000${i}`, caption: `Texte ${i}`, timestamp: '2026-11-20T10:00:00+0000', permalink: `https://www.instagram.com/p/AAA${i}/`, media_type: 'IMAGE', ...extra });
const corpsMedias = (data, paging) => ({ business_discovery: { id: '1', username: 'cible', media_count: 42, media: { data, ...(paging ? { paging } : {}) } }, id: '17841400000000001' });

verifie('profil lisible → succès, portée « profil » (≠ veille de publications)', (() => { const c = classerReponse(200, corpsProfil); return c.statut === 'succes' && c.portee === 'profil'; })());
verifie('publications complètes → succès portée « publications »', (() => { const c = classerReponse(200, corpsMedias([publi(1), publi(2)]), { medias: true }); return c.statut === 'succes' && c.portee === 'publications' && c.n === 2; })());
verifie('media vide et media_count 42 → « incoherent » (jamais « vide »)', classerReponse(200, corpsMedias([]), { medias: true }).statut === 'incoherent');
verifie('curseur after présent → « partiel », sans affirmer qu\'une suite existe', (() => { const c = classerReponse(200, corpsMedias([publi(1)], { cursors: { after: 'QVFI', before: 'QVFJ' } }), { medias: true }); return c.statut === 'partiel' && c.curseur_suivant_present === true && !('suite_possible' in c); })());
verifie('publication sans permalink → « partiel »', (() => { const c = classerReponse(200, corpsMedias([publi(1, { permalink: undefined })]), { medias: true }); return c.statut === 'partiel' && c.incomplets === 1; })());
verifie('media vide et media_count 0 → « vide » (le compte déclare 0 publication)', (() => { const b = corpsMedias([]); b.business_discovery.media_count = 0; return classerReponse(200, b, { medias: true }).statut === 'vide'; })());
verifie('media vide, media_count absent → « vide » NON confirmé', (() => { const b = corpsMedias([]); delete b.business_discovery.media_count; const c = classerReponse(200, b, { medias: true }); return c.statut === 'vide' && /non confirm/.test(c.detail); })());
verifie('page suivante vide (fin de pagination) → succès à 0 élément, pas « vide »', classerReponse(200, corpsMedias([]), { medias: true, suite: true }).statut === 'succes');
verifie('publications demandées mais bloc media absent → erreur (jamais succès « profil »)', classerReponse(200, corpsProfil, { medias: true }).statut === 'erreur_inconnue');
verifie('HTTP 403 / 400 sans objet error → jamais succès', [403, 400, 404].every((h) => classerErreur(h, {}).statut === 'erreur_inconnue'));
verifie('HTTP 429 sans error, avec ou sans corps JSON → quota ; HTTP 401 sans error → auth', classerErreur(429, {}).statut === 'quota' && classerErreur(429, undefined).statut === 'quota' && classerErreur(401, undefined).statut === 'erreur_auth');
verifie('HTTP 200 non décodable → erreur_inconnue, pas succès ni vide', classerErreur(200, undefined).statut === 'erreur_inconnue');
verifie('codes 102/104 → auth ; code 1 ou is_transient → transitoire (non relancé)', classerErreur(400, { error: { code: 102 } }).statut === 'erreur_auth' && classerErreur(500, { error: { code: 1 } }).statut === 'erreur_transitoire' && classerErreur(400, { error: { code: 999, is_transient: true } }).statut === 'erreur_transitoire');
verifie('curseur avec « + », « / », « = » accepté ; avec parenthèse, accolade, virgule, espace refusé', !leve(() => construireRequete({ igUserId: '17841400000000001', pseudo: 'abc', medias: true, apres: 'QVFI+ab/cd==' })) && ['a)b(c', 'ab{c}', 'ab,cd', 'ab cd'].every((c) => leve(() => construireRequete({ igUserId: '17841400000000001', pseudo: 'abc', medias: true, apres: c }))));
verifie('validerJeton : une ligne plausible acceptée ; deux lignes, espace, vide refusés sans écho de la valeur', validerJeton('A'.repeat(30)) && ['a'.repeat(30) + '\nb', 'court', '', 'a b'.repeat(10)].every((t) => { try { validerJeton(t); return false; } catch (e) { return !e.message.includes('court') && !e.message.includes('aaaa'); } }));
verifie('code 190 → panne d\'accès, jamais « vide »', classerReponse(400, { error: { code: 190, type: 'OAuthException', message: 'Error validating access token' } }).statut === 'erreur_auth');
verifie('HTTP 401 → panne d\'accès', classerReponse(401, { error: { code: 1 } }).statut === 'erreur_auth');
verifie('code 4 / 613 → quota', ['4', '613'].every((c) => classerReponse(400, { error: { code: Number(c) } }).statut === 'quota'));
verifie('code 10 / 200 → permission', [10, 200].every((c) => classerReponse(403, { error: { code: c } }).statut === 'erreur_permission'));
verifie('erreur générique de cible → « cible_ou_requete », sans conclusion « compte personnel »', (() => { const c = classerReponse(400, { error: { code: 110, error_subcode: 2207013, message: 'Invalid user id' } }); return c.statut === 'erreur_cible_ou_requete' && !/personnel/.test(c.detail); })());
verifie('absence de réponse / HTTP 5xx → erreur réseau', classerReponse(0, undefined).statut === 'erreur_reseau' && classerReponse(503, {}).statut === 'erreur_reseau');
verifie('réponse 200 sans business_discovery → erreur inconnue (jamais succès)', classerReponse(200, { id: '1' }).statut === 'erreur_inconnue');

// --- normalisation ---
const lignes = normaliserPublications(corpsMedias([publi(1), publi(2, { caption: undefined }), { caption: 'sans id' }]), { collecteLe: '2026-11-23T10:00:00.000Z' });
verifie('2 lignes (l\'entrée sans id est écartée)', lignes.length === 2);
verifie('champs minimaux : auteur, id, url, dates, type, portée « legende_seule »', (() => { const l = lignes[0]; return l.auteur === 'cible' && l.id_post === '90001' && l.url.endsWith('/AAA1/') && l.publie_le && l.collecte_le === '2026-11-23T10:00:00.000Z' && l.type_media === 'IMAGE' && l.portee_lecture === 'legende_seule'; })());
verifie('légende absente conservée comme signal (null), sans empreinte', lignes[1].legende === null && lignes[1].empreinte_legende === null);
verifie('empreinte de légende stable et sensible au texte', normaliserPublications(corpsMedias([publi(1)]))[0].empreinte_legende === lignes[0].empreinte_legende && normaliserPublications(corpsMedias([publi(1, { caption: 'Texte 1 modifié' })]))[0].empreinte_legende !== lignes[0].empreinte_legende);
verifie('aucun compteur de réactions dans la sortie', lignes.every((l) => !('like_count' in l) && !('comments_count' in l)));

// --- découverte des identifiants SNY ---
verifie('me/accounts : fields=id,name, limit=100, GET sans jeton dans les paramètres', (() => { const q = requeteComptes(); return q.chemin === '/me/accounts' && q.params.fields === 'id,name' && q.params.limit === '100' && !('access_token' in q.params); })());
verifie('page : fields=instagram_business_account ; identité : fields=id,username', requetePage('123456789012345').params.fields === 'instagram_business_account' && requeteIdentite('17841400000000001').params.fields === 'id,username');
verifie('identifiant de Page non numérique refusé (pas de chemin arbitraire)', leve(() => requetePage('me/../x')) && leve(() => requeteIdentite('abc')));
verifie('pages_show_list fait partie des permissions de base ; ads_read n\'y est pas (conditionnelle)', PERMISSIONS_BASE.includes('pages_show_list') && !PERMISSIONS_BASE.includes('ads_read') && !PERMISSIONS_BASE.includes('ads_management'));
verifie('extrairePages : liste lue ; corps inattendu ⇒ ok:false (jamais « aucune Page »)', (() => { const a = extrairePages({ data: [{ id: '123456789012345', name: 'SousNosYeux' }, { id: 'x', name: 'rejetée' }] }); const b = extrairePages({ error: { code: 190 } }); return a.ok && a.pages.length === 1 && !b.ok; })());
verifie('extrairePages : suite signalée seulement avec curseur ET next', extrairePages({ data: [], paging: { cursors: { after: 'QVFI' }, next: 'https://x' } }).suite === 'QVFI' && extrairePages({ data: [], paging: { cursors: { after: 'QVFI' } } }).suite === null);
verifie('extraireIgDePage : id lu ; champ absent ⇒ null (lien absent ou accès manquant : non distingués)', extraireIgDePage({ instagram_business_account: { id: '17841400000000001' }, id: '1' }) === '17841400000000001' && extraireIgDePage({ id: '1' }) === null);
verifie('identité : pseudo attendu (casse ignorée) accepté ; autre pseudo refusé', identiteConforme({ id: '17841400000000001', username: 'SousNosYeux_org' }, 'sousnosyeux_org') && !identiteConforme({ id: '17841400000000001', username: 'autre' }, 'sousnosyeux_org') && !identiteConforme({ username: 'sousnosyeux_org' }, 'sousnosyeux_org'));
verifie('classerErreur : 200 sans erreur ⇒ null (interprétation laissée à l\'appelant) ; 190 ⇒ auth', classerErreur(200, { data: [] }) === null && classerErreur(400, { error: { code: 190 } }).statut === 'erreur_auth');

// --- Unified Login (jeton système) ---
verifie('Unified : me?fields=client_business_id et me/assigned_instagram_accounts?fields=id,username, GET sans jeton dans les paramètres', (() => { const a = requeteMoi('client_business_id'); const b = requeteComptesAssignes(); return a.chemin === '/me' && a.params.fields === 'client_business_id' && b.chemin === '/me/assigned_instagram_accounts' && b.params.fields === 'id,username' && !('access_token' in a.params) && !('access_token' in b.params); })());
verifie('requeteMoi refuse des champs non listés (pas d\'injection)', leve(() => requeteMoi('id,name&access_token=x')) && leve(() => requeteMoi('')));
verifie('Unified : le type n\'est confirmé que par un client_business_id numérique', typeJetonUnified({ client_business_id: '123456789012' }) && !typeJetonUnified({ id: '1', name: 'Un utilisateur' }) && !typeJetonUnified({ client_business_id: 'abc' }) && !typeJetonUnified(undefined));
verifie('Unified : comptes assignés lus ; corps inattendu ⇒ ok:false (jamais « aucun compte ») ; lien next ⇒ liste partielle', (() => { const a = extraireComptesAssignes({ data: [{ id: '17841400000000001', username: 'x' }, { id: 'zz', username: 'rejeté' }], paging: { next: 'https://x' } }); const b = extraireComptesAssignes({ error: { code: 190 } }); return a.ok && a.comptes.length === 1 && a.suite === true && !b.ok; })());
verifie('Unified : permissions = instagram_basic + instagram_manage_insights ; ni pages_*, ni ads_*', PERMISSIONS_UNIFIED.join() === 'instagram_basic,instagram_manage_insights');
verifie('le message de Meta est conservé pour le diagnostic, mais un jeton qui s\'y trouverait est masqué', (() => { const c = classerErreur(400, { error: { code: 10, message: `Application does not have permission (access_token=abc123def456 ${JETON})` } }); return c.message_meta.includes('Application does not have permission') && !c.message_meta.includes(JETON) && !c.message_meta.includes('abc123def456'); })());
// --- Rejeu : fusion et stock ---
{
  const lot = (leg) => normaliserPublications(corpsMedias([publi(1), publi(2, leg ? { caption: 'Texte 2 modifié' } : {})]), { collecteLe: '2026-11-23T10:00:00.000Z' });
  const a = fusionnerPublications(new Map(), lot(false));
  verifie('rejeu : premier lot = 2 nouvelles', a.nouvelles === 2 && a.identiques === 0 && a.stock.size === 2);
  const b = fusionnerPublications(a.stock, lot(false));
  verifie('rejeu : même lot rejoué ⇒ 0 nouvelle, 2 identiques, stock inchangé (aucun doublon)', b.nouvelles === 0 && b.identiques === 2 && b.stock.size === 2);
  const c = fusionnerPublications(b.stock, lot(true));
  verifie('rejeu : légende modifiée détectée sur UN post, historique des empreintes conservé, stock toujours à 2', c.modifiees === 1 && c.identiques === 1 && c.stock.size === 2 && c.stock.get('90002').empreintes.length === 2 && c.stock.get('90001').empreintes.length === 1);
  verifie('rejeu : fusionner ne modifie pas le stock reçu (fonction pure)', a.stock.get('90001').empreintes.length === 1 && b.stock !== a.stock);
  const d = fusionnerPublications(new Map(), [...lot(false), ...lot(false)]);
  verifie('rejeu : même id dans deux pages d\'un même lot ⇒ compté en doublon dans le lot, une seule entrée', d.nouvelles === 2 && d.doublons_dans_le_lot === 2 && d.stock.size === 2);
  const s = stockDepuisPreuves([{ date: '2026-11-23T11:00:00Z', source_reponses: 'reseau', publications: lot(true) }, { date: '2026-11-23T10:00:00Z', source_reponses: 'reseau', publications: lot(false) }, { date: '2026-11-23T12:00:00Z', source_reponses: 'simule', publications: [{ id_post: '777', empreinte_legende: 'x' }] }]);
  verifie('stock reconstruit : ordre chronologique, preuves simulées ignorées', s.size === 2 && s.get('90002').empreintes.length === 2 && !s.has('777'));
}
console.log(ko ? `\n${ko} échec(s)` : '\nTous les contrôles passent (réponses simulées).');
process.exit(ko ? 1 : 0);
