// =====================================================================
// scripts/qa/test-veille-instagram.mjs — pilote Instagram de la veille « sources suivies » : budget par cycle, dédoublonnage, historique non couvert,
// pannes d'accès, témoignages écartés, rattachement par le texte seulement, aucune activation.
// ⚠ SIMULÉ : réponses, légendes, communes et affaires sont FICTIVES (ou paraphrasées sans texte réel de tiers). Aucun réseau, aucun jeton, aucune base.
// Usage : node scripts/qa/test-veille-instagram.mjs
// =====================================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chargerRegistre, parcourirSources, memoireFichier, cleDocument, empreinteSubstance, passages, complementDe } from '../lib/sources-suivies.mjs';
import {
  lireComptes, ecarterPublication, titreDe, postVersDocument, appelerReel, lecteurEnPanne, chargerConfigInstagram, verifierAliasDistincts, BUDGET_CYCLE_DEFAUT, BUDGET_CYCLE_MAX,
} from '../lib/veille-instagram.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };
const leve = async (f) => { try { await f(); return false; } catch { return true; } };

// ---------- Graph simulé : N publications par compte, pages de 10, curseur « pN » ----------
const JOUR = 864e5;
function compteSimule(pseudo, { total = 35, debut = Date.parse('2026-11-20T10:00:00Z'), pas = JOUR } = {}) {
  const posts = Array.from({ length: total }, (_, i) => ({ id: `${pseudo}-${i}`, caption: `Légende fictive ${i} de ${pseudo}`, timestamp: new Date(debut - i * pas).toISOString().replace('Z', '+0000'), permalink: `https://www.instagram.com/p/${pseudo}${i}/`, media_type: 'IMAGE' }));
  return { posts };
}
function graph(comptes, variante = {}) {
  const appelsFaits = [];
  const appeler = async (pseudo, apres) => {
    appelsFaits.push({ pseudo, apres });
    if (variante.auth && (variante.auth === true || appelsFaits.length >= variante.auth)) return { classe: { statut: 'erreur_auth', code: 190 }, corps: undefined, http: 400 };
    if (variante.quota && appelsFaits.length >= variante.quota) return { classe: { statut: 'quota', code: 4 }, corps: undefined, http: 400 };
    if (variante.generique && pseudo === variante.generique) return { classe: { statut: 'erreur_cible_ou_requete', code: 100 }, corps: undefined, http: 400 };
    if (variante.leve) throw new Error('boom');
    const tous = comptes[pseudo].posts; const debut = apres ? Number(String(apres).slice(1)) : 0; const page = tous.slice(debut, debut + 10);
    const suite = debut + 10 < tous.length ? `p${debut + 10}` : null;
    const chevauche = variante.chevauchement && apres ? [tous[debut - 1], ...page] : page; // la page suivante répète la dernière publication de la précédente
    const corps = { business_discovery: { username: pseudo, media_count: tous.length, media: { data: chevauche, ...(suite ? { paging: { cursors: { after: suite } } } : {}) } } };
    return { classe: { statut: suite ? 'partiel' : 'succes' }, corps, http: 200 };
  };
  return { appeler, appelsFaits };
}
const page = (pseudo) => ({ url: `https://www.instagram.com/${pseudo}/`, type: 'instagram', compte: pseudo, emetteur: `${pseudo} (Instagram)`, cadence: 'quotidienne', organismes: [`org-${pseudo}`] });
const cptes = (...ps) => ps.map((p) => ({ page: page(p), pseudo: p }));
const connuDe = (urls) => (u) => urls.has(u);
const tousInconnus = connuDe(new Set());

// =====================================================================
console.log('A. Budget par cycle, pages supplémentaires, historique non couvert');
{
  const donnees = { cpt_a: compteSimule('cpt_a'), cpt_b: compteSimule('cpt_b', { debut: Date.parse('2026-11-10T10:00:00Z') }) };
  // 1. Historique déjà couvert : chaque première page contient une publication connue ⇒ 2 appels, rien de plus
  let g = graph(donnees); const connus = new Set([donnees.cpt_a.posts[3].permalink, donnees.cpt_b.posts[0].permalink]);
  let r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: connuDe(connus), appeler: g.appeler, budget: 4 });
  verifie('historique couvert (une publication connue par page) : 2 appels seulement, aucun historique signalé non couvert', r.appels === 2 && g.appelsFaits.length === 2 && r.comptes.every((c) => !c.historique_non_couvert && c.pages_lues === 1));
  // 2. Tout est inconnu : le budget de 4 est consommé, jamais dépassé ; une première page pour CHAQUE compte avant toute page supplémentaire
  g = graph(donnees);
  r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: tousInconnus, appeler: g.appeler, budget: 4 });
  verifie('tout inconnu : exactement 4 appels (budget), jamais plus', r.appels === 4 && g.appelsFaits.length === 4);
  verifie('une première page par compte AVANT toute page supplémentaire', g.appelsFaits[0].pseudo === 'cpt_a' && g.appelsFaits[0].apres === null && g.appelsFaits[1].pseudo === 'cpt_b' && g.appelsFaits[1].apres === null && g.appelsFaits.slice(2).every((a) => a.apres !== null));
  verifie('au plafond : l\'historique non couvert est DIT, avec la date de la plus ancienne publication lue', r.comptes.some((c) => c.historique_non_couvert && c.plus_ancien_lu) && r.comptes.every((c) => c.ok));
  verifie('pages supplémentaires : au plus deux, réparties selon le besoin (le compte le moins profondément lu d\'abord)', g.appelsFaits.filter((a) => a.apres).length === 2 && g.appelsFaits[2].pseudo === 'cpt_a', JSON.stringify(g.appelsFaits.map((a) => `${a.pseudo}:${a.apres}`)));
  // 3. Un compte court (moins d'une page) ne consomme qu'un appel ; le reste du budget ne sert pas à rien
  const court = { cpt_a: compteSimule('cpt_a', { total: 6 }), cpt_b: compteSimule('cpt_b') };
  g = graph(court);
  r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: tousInconnus, appeler: g.appeler, budget: 4 });
  verifie('compte à une seule page : aucune page suivante demandée pour lui (sans curseur)', g.appelsFaits.filter((a) => a.pseudo === 'cpt_a').length === 1 && r.comptes[0].historique_non_couvert === false);
  // 4. Dédoublonnage par identifiant (la page suivante répète une publication)
  g = graph(donnees, { chevauchement: true });
  r = await lireComptes({ comptes: cptes('cpt_a'), connu: tousInconnus, appeler: g.appeler, budget: 3 });
  verifie('dédoublonnage par identifiant : une publication répétée entre deux pages n\'est comptée qu\'une fois', new Set(r.comptes[0].posts.map((p) => p.id_post)).size === r.comptes[0].posts.length && r.comptes[0].posts.length === 30, String(r.comptes[0].posts.length));
  // 5. Arrêt dès qu'une publication connue apparaît
  g = graph(donnees); const connuePage2 = new Set([donnees.cpt_a.posts[14].permalink]);
  r = await lireComptes({ comptes: cptes('cpt_a'), connu: connuDe(connuePage2), appeler: g.appeler, budget: 4 });
  verifie('arrêt à la première page qui contient une publication déjà connue (page 2 ici) : 2 appels, historique couvert', r.appels === 2 && !r.comptes[0].historique_non_couvert);
  // 6. Budget et paramètres validés
  verifie('budget hors bornes ou pseudo invalide refusés avant tout appel', await leve(() => lireComptes({ comptes: cptes('cpt_a'), connu: tousInconnus, appeler: graph(donnees).appeler, budget: 0 })) && await leve(() => lireComptes({ comptes: cptes('cpt_a'), connu: tousInconnus, appeler: graph(donnees).appeler, budget: BUDGET_CYCLE_MAX + 1 })) && await leve(() => lireComptes({ comptes: [{ page: page('x'), pseudo: 'a}b' }], connu: tousInconnus, appeler: graph(donnees).appeler })));
  verifie('budget par défaut = 4 ; plafond relevé à 80 APRÈS mesure (26/11/2026) ; taille de page configurable (1 à 50)', BUDGET_CYCLE_DEFAUT === 4 && BUDGET_CYCLE_MAX === 80);
  // 8. Publication sans permalien : comptée, jamais « inconnue » (elle ne doit pas déclencher de page supplémentaire)
  g = graph({ cpt_a: { posts: compteSimule('cpt_a').posts.map((p, i) => (i < 10 ? { ...p, permalink: undefined } : p)) } });
  r = await lireComptes({ comptes: cptes('cpt_a'), connu: tousInconnus, appeler: g.appeler, budget: 4 });
  verifie('première page sans aucun permalien : comptées (sans_permalien), AUCUNE page supplémentaire déclenchée par elles', r.comptes[0].sans_permalien === 10 && r.appels === 1 && !r.comptes[0].historique_non_couvert, JSON.stringify([r.comptes[0].sans_permalien, r.appels]));
  // 9. Pagination incohérente : page non vide, curseur présent, mais aucun identifiant nouveau
  const rejouer = async (pseudo, apres) => ({ classe: { statut: 'partiel' }, corps: { business_discovery: { username: pseudo, media_count: 99, media: { data: donnees.cpt_a.posts.slice(0, 10), paging: { cursors: { after: 'p10' } } } } }, http: 200 });
  r = await lireComptes({ comptes: cptes('cpt_a'), connu: tousInconnus, appeler: rejouer, budget: 4 });
  verifie('curseur qui renvoie les mêmes identifiants : arrêt sain (2 appels) ET signalé (pagination_incoherente, historique non couvert), jamais « couvert »', r.appels === 2 && r.comptes[0].pagination_incoherente === true && r.comptes[0].historique_non_couvert === true, JSON.stringify([r.appels, r.comptes[0].pagination_incoherente]));
  // 10. Permission manquante : globale, arrêt (les autres comptes ne consomment pas d'appel pour rien)
  const sansPermission = async () => ({ classe: { statut: 'erreur_permission', code: 10 }, corps: undefined, http: 400 });
  let nb = 0; const compte = async (...a) => { nb++; return sansPermission(...a); };
  r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: tousInconnus, appeler: compte, budget: 4 });
  verifie('permission manquante : UN appel puis arrêt global, les deux comptes EN PANNE (ACCES:erreur_permission)', nb === 1 && r.arret === 'erreur_permission' && r.comptes.every((c) => !c.ok && /^ACCES:erreur_permission/.test(c.motif)));
  // 7. Moins de budget que de comptes : les comptes non lus sont en panne « budget », jamais « sans nouveauté »
  g = graph(donnees);
  r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: tousInconnus, appeler: g.appeler, budget: 1 });
  verifie('budget de 1 pour 2 comptes : le second est signalé NON LU (budget), pas « vide »', r.comptes[0].ok && !r.comptes[1].ok && /BUDGET/.test(r.comptes[1].motif) && r.appels === 1);
}

console.log('B. Pannes d\'accès : jamais « aucune nouveauté », jamais de relance');
{
  const donnees = { cpt_a: compteSimule('cpt_a'), cpt_b: compteSimule('cpt_b') };
  let g = graph(donnees, { auth: true });
  let r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: tousInconnus, appeler: g.appeler, budget: 4 });
  verifie('jeton refusé : UN appel, arrêt, les deux comptes EN PANNE (ACCES:erreur_auth), aucune publication', g.appelsFaits.length === 1 && r.arret === 'erreur_auth' && r.comptes.every((c) => !c.ok && /^ACCES:erreur_auth/.test(c.motif) && c.posts.length === 0));
  g = graph(donnees, { quota: 3 });
  r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: tousInconnus, appeler: g.appeler, budget: 4 });
  verifie('quota atteint en cours de cycle : arrêt net (aucun appel après), publications déjà lues conservées, historique non couvert signalé', g.appelsFaits.length === 3 && r.arret === 'quota' && r.comptes.every((c) => c.ok && c.posts.length >= 10) && r.comptes.some((c) => c.historique_non_couvert && c.incident_suite === 'quota'));
  g = graph(donnees, { generique: 'cpt_b' });
  r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: tousInconnus, appeler: g.appeler, budget: 4 });
  verifie('erreur générique sur UN compte : ce compte est en panne de lecture (cause non établie), l\'autre est lu, pas d\'arrêt global', !r.comptes[1].ok && /^LECTURE:erreur_cible_ou_requete/.test(r.comptes[1].motif) && r.comptes[0].ok && r.arret === null);
  verifie('aucun motif ne conclut « compte personnel »', !r.comptes.some((c) => /personnel/i.test(String(c.motif))));
  g = graph(donnees, { leve: true });
  r = await lireComptes({ comptes: cptes('cpt_a', 'cpt_b'), connu: tousInconnus, appeler: g.appeler, budget: 4 });
  verifie('exception de l\'appelant : traitée comme erreur réseau, chaque compte tenté UNE fois, aucune relance', g.appelsFaits.length === 2 && r.comptes.every((c) => !c.ok && /^LECTURE:erreur_reseau/.test(c.motif)));
  const panne = await lecteurEnPanne('JETON_ABSENT', 4)({ comptes: cptes('cpt_a', 'cpt_b') });
  verifie('pilote demandé sans jeton : chaque compte EN PANNE (ACCES:JETON_ABSENT), zéro appel', panne.appels === 0 && panne.comptes.every((c) => !c.ok && c.motif === 'ACCES:JETON_ABSENT'));
}

console.log('C. Témoignages anonymes sensibles : écartés sans lecture ni conservation');
{
  const ecartes = ['✍🏼Témoignage✍🏼 « Un récit entre guillemets… »', '✍🏼Temoignage ✍🏼 « autre récit »', 'Témoignage : une maman raconte', '  📣 TÉMOIGNAGE — un parent', 'Témoignages de parents'];
  verifie('« Témoignage » en tête de légende (emojis, casse, accent) ⇒ écarté', ecartes.every((c) => ecarterPublication(c) === 'TEMOIGNAGE_ANONYME'));
  const variantes = ['Nouveau témoignage\n\nRécit fictif.', 'Un témoignage poignant', 'Témoin', 'Récit d’une maman fictive', 'Parole de parent', 'T É M O I G N A G E\nrécit fictif', 'Te\u0301moignage « récit fictif »', '#collectiffictif\n\nTémoignage « récit fictif »'];
  verifie('variantes (« Nouveau témoignage », « Récit d… », « Parole de… », lettres espacées, forme décomposée, hashtag en tête) ⇒ écartées', variantes.every((c) => ecarterPublication(c) !== null), variantes.filter((c) => ecarterPublication(c) === null).join(' | '));
  verifie('filet en échec fermé : récit à la première personne entre guillemets (sans amorce « témoignage ») ⇒ écarté', ecarterPublication('Hier, mon fils est rentré en pleurs. « Il m’a dit que… » (récit fictif)') === 'RECIT_PREMIERE_PERSONNE');
  const gardes = ['📣 APPEL À TÉMOINS — collectif fictif', 'Quand une famille ose parler, elle doit être écoutée.\nUne famille a accepté de témoigner anonymement auprès d’une journaliste fictive.', 'Nos enfants ont besoin d’être protégés.', 'Quand une famille ose parler, elle doit être écoutée : un témoignage anonyme a été recueilli par un journal.', 'Le refus de plainte : un parcours difficile', '', null];
  verifie('appel à témoins, légende d\'un collectif qui parle d\'un témoignage, légende vide ⇒ non écartés', gardes.every((c) => ecarterPublication(c) === null));
  const d = postVersDocument({ id_post: '1', url: 'https://www.instagram.com/p/abc/', publie_le: '2026-08-01T10:00:00+0000', legende: '✍🏼Témoignage✍🏼 « récit sensible fictif »' });
  verifie('document écarté : corps et titre VIDES (aucun texte conservé), identifiant et date gardés', d.corps === '' && d.titre === '' && d.ecarte === 'TEMOIGNAGE_ANONYME' && d.id_post === '1' && d.publie_le === '2026-08-01');
  const n = postVersDocument({ id_post: '2', url: 'https://www.instagram.com/p/def/', publie_le: '2026-11-16T10:00:00+0000', legende: '📣 APPEL À TÉMOINS\n\nTexte fictif.' });
  verifie('document normal : légende intégrale, titre = première ligne utile, portée « légende seule », extraction nommée', n.corps.includes('Texte fictif') && n.titre === 'APPEL À TÉMOINS' && n.portee_lecture === 'legende_seule' && n.extraction === 'instagram-business-discovery' && n.ok === true && n.ecarte === undefined);
  verifie('titre borné à 140 caractères', titreDe('x'.repeat(500)).length <= 140);
}

console.log('D. Intégration au parcours existant (parcourirSources) : rien lu sans lecteur, rattachement par le texte, mémoire');
{
  // Registre fictif : deux comptes Instagram, deux organismes distincts (alias distincts)
  const registre = {
    organismes: [
      { id: 'org-cpt_a', nom: 'Collectif fictif A', alias: ['Collectif fictif A'], role: 'organisme', portee: 'inconnue', suivi: { domaines: ['instagram.com'], pages: [page('cpt_a')] } },
      { id: 'org-cpt_b', nom: 'Association fictive B', alias: ['Association fictive B'], role: 'organisme', portee: 'inconnue', suivi: { domaines: ['instagram.com'], pages: [page('cpt_b')] } },
    ],
    pages: [{ ...page('cpt_a') }, { ...page('cpt_b') }],
  };
  const fiches = [
    { case_id: 'FR-TEST-0001', etablissement: 'Centre de loisirs municipal de Valmont', commune: 'Valmont', departement: 'Landes', role_mis_en_cause: 'animateur', statut_judiciaire: 'mise en examen', type_structure: 'périscolaire' },
    { case_id: 'FR-TEST-0002', etablissement: 'École maternelle Aqueduc', commune: 'Paris 11e', departement: 'Paris', role_mis_en_cause: 'animateur', statut_judiciaire: 'mise en examen', type_structure: 'école' },
  ];
  const lecturesHttp = [];
  const lireInterdit = async (url) => { lecturesHttp.push(url); throw new Error(`lecture HTTP interdite : ${url}`); };
  const sansLecteur = await parcourirSources({ registre, memoire: memoireFichier('/inexistant/m.json', { lectureSeule: true }), fiches, lire: lireInterdit, lireRss: lireInterdit, maintenant: '2026-11-23T10:00:00Z' });
  verifie('SANS lecteur Instagram : aucune lecture (même HTTP) des comptes, état « non activé » ; aucun document', sansLecteur.pages.length === 2 && sansLecteur.pages.every((p) => p.type === 'instagram' && p.issue === 'NON_DUE' && /non activé/.test(p.motif)) && sansLecteur.docs.length === 0 && sansLecteur.requetes === 0 && sansLecteur.instagram === null);

  const legendes = {
    cpt_a: [
      ['a1', '2026-11-20', 'Après les faits survenus au centre de loisirs municipal de Valmont, l’animateur mis en examen reste sous contrôle judiciaire. Nous demandons des réponses à la mairie de Valmont.'],
      ['a2', '2026-11-19', 'Les familles ont besoin d’être écoutées. Valmont, centre de loisirs : nous restons mobilisés.'],
      ['a3', '2026-11-18', '✍🏼Témoignage✍🏼 « Récit anonyme fictif d’un parent, sans lieu. »'],
      ['a4', '2026-11-17', 'Merci à toutes et à tous pour votre soutien.'],
    ],
    cpt_b: [
      ['b1', '2026-04-22', 'Lettre ouverte à la maire de Paris : parents du 10ème et association demandent quatre mesures d’urgence dans les écoles parisiennes, périscolaire et violences : à signer avant dimanche.'],
      ['b2', '2026-04-21', '✍🏼Témoignage ✍🏼 « autre récit anonyme fictif »'],
    ],
  };
  const donnees = Object.fromEntries(Object.entries(legendes).map(([p, l]) => [p, { posts: l.map(([id, d, c]) => ({ id: `${p}-${id}`, caption: c, timestamp: `${d}T10:00:00+0000`, permalink: `https://www.instagram.com/p/${id}/`, media_type: 'IMAGE' })) }]));
  const memoire = memoireFichier('/inexistant/m.json', { lectureSeule: true });
  const g = graph(donnees);
  const lireInstagram = ({ comptes, connu, maintenant }) => lireComptes({ comptes, connu, appeler: g.appeler, budget: 4, collecteLe: maintenant });
  const cycle1 = await parcourirSources({ registre, memoire, fiches, lire: lireInterdit, lireRss: lireInterdit, maintenant: '2026-11-23T10:00:00Z', lireInstagram });
  const par = (id) => cycle1.docs.find((d) => d.url.endsWith(`/p/${id}/`));
  verifie('cycle 1 : 6 documents (publications déjà lues, jamais relues par HTTP), appels du pilote comptés dans les requêtes', cycle1.docs.length === 6 && cycle1.requetes === 2 && cycle1.instagram.appels === 2 && cycle1.instagram.budget === 4);
  verifie('mesure par compte : appels, pages, publications lues, historique non couvert (faux ici : une page suffit)', cycle1.instagram.comptes.every((c) => c.ok && c.appels === 1 && c.pages_lues === 1 && c.historique_non_couvert === false) && cycle1.instagram.comptes[0].publications_lues === 4);
  verifie('témoignages anonymes : destination ECARTE_TEMOIGNAGE, corps vide, aucun cas rattaché, aucun texte dans le document', ['a3', 'b2'].every((id) => par(id).destination === 'ECARTE_TEMOIGNAGE' && par(id).doc.corps === '' && par(id).case_ids.length === 0 && !JSON.stringify(par(id)).includes('anonyme fictif')));
  verifie('le texte NOMME l\'établissement et la commune (rôle inclus) ⇒ rattaché à l\'affaire, par le texte', par('a1').destination === 'AFFAIRE' && par('a1').case_ids.join() === 'FR-TEST-0001', `${par('a1').destination} ${par('a1').case_ids}`);
  const ficheV = fiches[0];
  const psSans = passages(par('a1').doc.corps, ficheV, { alias: [] }); const psAvec = passages(par('a1').doc.corps, ficheV, { alias: [], sansTitre: true });
  verifie('légende en un seul bloc : sans l\'option, son contenu serait pris pour un TITRE (0 passage) ; avec sansTitre, au moins 1 passage nomme l\'établissement', psSans.length === 0 && psAvec.length >= 1 && psAvec[0].nomme_etablissement === true, JSON.stringify([psSans.length, psAvec.length]));
  const faitsConnus = [{ texte: 'Collectif fictif A a annoncé une mobilisation à Valmont.', url: 'https://exemple.test/article', media: 'Média', publie_le: '2026-11-01' }];
  verifie('preuve complémentaire : par alias (document HTML) possible, mais une publication propre d\'un compte (urlSeulement) ne vaut preuve complémentaire que par la MÊME URL', complementDe({ url: 'https://www.instagram.com/p/a1/', passagesTexte: 'Collectif fictif A demande des réponses.', faits: faitsConnus, alias: ['collectif fictif a'] })?.type === 'PREUVE_COMPLEMENTAIRE' && complementDe({ url: 'https://www.instagram.com/p/a1/', passagesTexte: 'Collectif fictif A demande des réponses.', faits: faitsConnus, alias: ['collectif fictif a'], urlSeulement: true }) === null && complementDe({ url: 'https://exemple.test/article', passagesTexte: 'x', faits: faitsConnus, alias: [], urlSeulement: true })?.type === 'DEJA_SOURCE');
  verifie('le texte ne nomme que la commune et le type de structure ⇒ AUCUN rattachement forcé (pas de case_id)', par('a2').destination !== 'AFFAIRE' && par('a2').case_ids.length === 0, `${par('a2').destination}`);
  verifie('remerciement sans objet ⇒ hors périmètre ou position générale, aucun rattachement', par('a4').case_ids.length === 0 && par('a4').destination !== 'AFFAIRE');
  verifie('lettre adressée à la Ville de Paris (parents du 10e, écoles parisiennes) : PAS rattachée à l\'affaire du 11e arrondissement', par('b1').destination !== 'AFFAIRE' && !par('b1').case_ids.includes('FR-TEST-0002'), `${par('b1').destination} ${par('b1').case_ids} ${par('b1').suspendus}`);
  verifie('émetteur = le compte lui-même (publication propre d\'un organisme distinct par compte), jamais un média', par('a1').emetteur === 'cpt_a (Instagram)' && par('b1').emetteur === 'cpt_b (Instagram)' && par('a1').nature === 'PUBLICATION_PROPRE');

  // Cycle 2 : la mémoire connaît tout (comme le cycle réel qui note chaque document) ⇒ INCHANGE, et une légende modifiée est vue TOUT DE SUITE
  for (const d of cycle1.docs) memoire.noterSucces({ doc_key: cleDocument(d.url), titre: '', raw_url: d.url, resolution_method: `SOURCE_SUIVIE/${d.destination}`, content_fingerprint: d.empreinte, maintenant: '2026-11-23T10:00:00Z', case_ids: d.case_ids || [] });
  for (const p of cycle1.pages) memoire.noterSucces({ doc_key: cleDocument(p.url), titre: '', raw_url: p.url, resolution_method: 'SOURCE_SUIVIE/INDEX', content_fingerprint: p.empreinte, maintenant: '2026-11-23T10:00:00Z', case_ids: [] });
  donnees.cpt_a.posts[3].caption = 'Merci à toutes et à tous pour votre soutien constant. Texte modifié.'; // a4 modifié 1 jour plus tard
  g.appelsFaits.length = 0;
  const cycle2 = await parcourirSources({ registre, memoire, fiches, lire: lireInterdit, lireRss: lireInterdit, maintenant: '2026-11-24T10:00:00Z', lireInstagram });
  const par2 = (id) => cycle2.docs.find((d) => d.url.endsWith(`/p/${id}/`));
  verifie('mesure par compte : écartés comptés (cpt_a : 1, cpt_b : 1), sans permalien, pagination incohérente', cycle1.instagram.comptes.every((c) => c.ecartes === 1 && c.sans_permalien === 0 && c.pagination_incoherente === false), JSON.stringify(cycle1.instagram.comptes.map((c) => c.ecartes)));
  const tronque = await parcourirSources({ registre, memoire: memoireFichier('/inexistant/t.json', { lectureSeule: true }), fiches, lire: lireInterdit, lireRss: lireInterdit, maintenant: '2026-11-23T10:00:00Z', lireInstagram: ({ comptes, connu, maintenant: m }) => lireComptes({ comptes, connu, appeler: graph(donnees).appeler, budget: 4, collecteLe: m }), maxDocs: 1 });
  verifie('maxDocs ne tronque JAMAIS les publications Instagram (déjà lues : sinon jamais notées en mémoire et le budget serait consommé à plein indéfiniment)', tronque.docs.length === 6, String(tronque.docs.length));
  verifie('cycle 2 : publications déjà connues et inchangées ⇒ INCHANGE (aucune relecture HTTP, aucune nouvelle proposition possible)', ['a1', 'a2', 'a3', 'b1', 'b2'].every((id) => par2(id).issue === 'INCHANGE'));
  verifie('cycle 2 : légende modifiée d\'une publication connue ⇒ MODIFIE immédiatement (pas de délai hebdomadaire)', par2('a4').issue === 'MODIFIE');
  verifie('cycle 2 : 2 appels seulement (historique connu), pas de page supplémentaire', cycle2.instagram.appels === 2 && g.appelsFaits.length === 2);
  verifie('empreinte de substance : stable pour le même texte, différente si le texte change', empreinteSubstance(donnees.cpt_a.posts[0].caption) === empreinteSubstance(donnees.cpt_a.posts[0].caption) && empreinteSubstance('un texte') !== empreinteSubstance('un autre texte'));

  verifie('aucune lecture HTTP (instagram.com ou autre) pendant les deux cycles : les publications arrivent déjà lues', lecturesHttp.length === 0, lecturesHttp.join());

  // Panne : le compte est un ÉCHEC consigné (mémoire), jamais une absence de nouveauté
  const memoirePanne = memoireFichier('/inexistant/p.json', { lectureSeule: true });
  const cyclePanne = await parcourirSources({ registre, memoire: memoirePanne, fiches, lire: lireInterdit, lireRss: lireInterdit, maintenant: '2026-11-23T10:00:00Z', lireInstagram: lecteurEnPanne('JETON_ABSENT', 4) });
  verifie('panne d\'accès : pages en ECHEC (motif ACCES:JETON_ABSENT), incident noté en mémoire avec un fetch_status fidèle (ACCES, pas RESEAU), aucun document, JAMAIS « NON_DUE »', cyclePanne.pages.every((p) => p.issue === 'ECHEC' && p.motif === 'ACCES:JETON_ABSENT') && cyclePanne.docs.length === 0 && memoirePanne.get(cleDocument(page('cpt_a').url))?.failure_reason === 'ACCES:JETON_ABSENT' && memoirePanne.get(cleDocument(page('cpt_a').url))?.fetch_status === 'ACCES');
}

console.log('E. Registre de production : aucun mélange d\'organismes, aucune activation');
{
  const chemin = join(ROOT, 'data', 'associations-watchlist.json');
  const reg = chargerRegistre(chemin);
  const pagesIG = reg.pages.filter((p) => p.type === 'instagram');
  verifie('six comptes Instagram au registre (tous mesurés lisibles le 26/11/2026), chacun avec un pseudo valide et une URL cohérente', pagesIG.map((p) => p.compte).sort().join() === 'leursvoixnotrecombat40,metooecole,sosperiscolaire,stoptaboupedo,ville_de_tarnos,villedemerignac' && pagesIG.every((p) => p.url === `https://www.instagram.com/${p.compte}/` && /^[A-Za-z0-9._]{1,30}$/.test(p.compte) && p.emetteur));
  const leurs = reg.organismes.find((o) => o.id === 'leurs-voix-notre-combat-tarnos'); const sos = reg.organismes.find((o) => o.id === 'sos-periscolaire'); const autres = reg.organismes.filter((o) => !['leurs-voix-notre-combat-tarnos', 'sos-periscolaire'].includes(o.id));
  verifie('deux organismes DISTINCTS : « Leurs voix, notre combat » ≠ « SOS Périscolaire » ≠ tout autre organisme (alias jamais partagés, jamais génériques)', verifierAliasDistincts(reg.organismes).filter((p) => !/« (OSE|CVM) »/.test(p)).length === 0 && leurs.id !== sos.id);
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  verifie('aucun alias du collectif de Tarnos n\'est partagé avec un autre organisme (dont un collectif entendu au Sénat) ni générique', leurs.alias.every((a) => !autres.some((o) => [o.nom, ...(o.alias || [])].some((x) => norm(x) === norm(a)) ) && !/^collectif$/i.test(a.trim())) && /ne pas confondre|à ne pas confondre/i.test(leurs.note) && /Sénat/.test(leurs.note));
  verifie('un alias générique ou partagé serait détecté', verifierAliasDistincts([{ id: 'x', nom: 'Collectif', alias: ['Collectif de familles'] }, { id: 'y', nom: 'Même Nom', alias: [] }, { id: 'z', nom: 'Même Nom', alias: [] }]).length >= 3);
  verifie('le collectif de Tarnos n\'a aucune portée territoriale déduite de son nom ou de sa commune (portée « inconnue »)', leurs.portee === 'inconnue' && !/communale:/.test(leurs.portee));
  const cfg = chargerConfigInstagram(chemin);
  verifie('configuration du pilote : parcours unified, budget de 18 appels par cycle (6 comptes : une première page chacun + 12 pages d’historique ; 25 publications par appel), taille de page 25, identifiant numérique', cfg.parcours === 'unified' && cfg.budget === 18 && cfg.budget <= BUDGET_CYCLE_MAX && cfg.taille_page === 25 && /^\d{5,25}$/.test(cfg.ig_user_id));
  const dossierTmp = mkdtempSync(join(tmpdir(), 'sny-reg-')); const regTmp = join(dossierTmp, 'reg.json');
  const org = (id, alias) => ({ id, nom: alias[0], alias, role: 'organisme', portee: 'inconnue', suivi: { domaines: ['instagram.com'], pages: [{ url: `https://www.instagram.com/${id}/`, type: 'instagram', compte: id, emetteur: id, cadence: 'quotidienne' }] } });
  const ecrire = (organismes) => writeFileSync(regTmp, JSON.stringify({ organismes }), 'utf8');
  ecrire([org('collectif_a', ['Collectif Fictif A']), org('collectif_b', ['Collectif Fictif B'])]);
  verifie('registre fictif à deux organismes Instagram aux alias distincts : chargé', !(await leve(() => chargerRegistre(regTmp))));
  ecrire([org('collectif_a', ['Collectif Fictif A']), org('collectif_b', ['Collectif fictif a'])]);
  verifie('alias PARTAGÉ (même nom, casse différente) entre deux organismes : chargement REFUSÉ (échec fermé)', await leve(() => chargerRegistre(regTmp)));
  ecrire([org('collectif_a', ['Collectif de familles de Fictiville'])]);
  verifie('alias générique (« collectif de familles de … ») : chargement refusé', await leve(() => chargerRegistre(regTmp)));
  rmSync(dossierTmp, { recursive: true, force: true });
  const brut = JSON.parse(readFileSync(chemin, 'utf8'));
  verifie('le registre dit explicitement dans quelles conditions le pilote est en service et rappelle la doctrine de lecture incrémentale', /EN SERVICE seulement si sny-cycle passe --instagram-pilote/.test(brut._meta.instagram.etat) && /25 publications/.test(brut._meta.instagram.doctrine));
  // Aucune activation : ni workflow, ni appel par défaut
  const wf = join(ROOT, '.github', 'workflows'); const fichiers = existsSync(wf) ? readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)) : [];
  const MANUEL = 'sny-pilote-instagram.yml'; // essai MANUEL en --dry-run : seul workflow autorisé à passer l'option (voir test-pistes-a-qualifier : workflow_dispatch seul, sans cron)
  verifie('aucun workflow PLANIFIÉ ne passe --instagram-pilote ni ne référence META_GRAPH_TOKEN (pilote non activé en régulier) ; le seul qui le fait est manuel, en --dry-run, sans cron', fichiers.filter((x) => x !== MANUEL).every((x) => !/instagram-pilote|META_GRAPH_TOKEN/.test(readFileSync(join(wf, x), 'utf8'))) && (!fichiers.includes(MANUEL) || (() => { const y = readFileSync(join(wf, MANUEL), 'utf8'); return /workflow_dispatch:/.test(y) && !/^\s*schedule:/m.test(y) && !/^\s*workflow_run:/m.test(y) && /--dry-run/.test(y) && !/TELEGRAM/.test(y); })()), fichiers.join());
  const cycle = readFileSync(join(ROOT, 'scripts', 'maintenance-cycle.mjs'), 'utf8');
  verifie('maintenance-cycle : le pilote exige l\'option explicite, et jeton ou configuration absents, TLS non validé, jeton ou configuration invalides sont une PANNE consignée (jamais l\'arrêt de toute l\'étape)', /const INSTAGRAM_PILOTE = A\.includes\('--instagram-pilote'\)/.test(cycle) && ['JETON_ABSENT', 'CONFIG_ABSENTE', 'CONFIG_INVALIDE', 'TLS_NON_VALIDE', 'JETON_INVALIDE'].every((m) => cycle.includes(m)) && /lecteurEnPanne/.test(cycle));
  verifie('maintenance-cycle : --instagram-pilote sans --sources-suivies est DIT ; en CI la console ne montre que des compteurs (pas de pseudo) ; une panne lève un ::warning::', /--instagram-pilote ignoré/.test(cycle) && /if \(process\.env\.CI\) console\.log\(`  Instagram \(pilote\)[^\n]*\n?/.test(cycle) && !/if \(process\.env\.CI\) console\.log\([^\n]*c\.compte/.test(cycle) && /::warning::Pilote Instagram/.test(cycle));
  verifie('publications Instagram : passages sans titre, jamais d\'alias comme passage, déclaration décidable désactivée (libellé « L\'association » inadapté à un collectif de familles)', /sansTitre: ig/.test(cycle) && /urlSeulement: ig/.test(cycle) && /const declares = \(comp \|\| ig\) \? \[\]/.test(cycle));
}

console.log('F. Appel réel : jeton, TLS, une tentative, GET');
{
  const JETON = 'EAAB' + 'z'.repeat(70);
  const vus = []; const fetchImpl = async (url, init = {}) => { vus.push({ methode: init.method, corps: init.body, redirect: init.redirect, hote: new URL(url).hostname }); return { status: 200, json: async () => ({ business_discovery: { username: 'cpt_a', media_count: 1, media: { data: [{ id: '1', caption: 'x', timestamp: '2026-11-20T10:00:00+0000', permalink: 'https://www.instagram.com/p/z/', media_type: 'IMAGE' }] } } }) }; };
  const appeler = appelerReel({ igUserId: '17841400000000001', jeton: JETON, fetchImpl });
  const r = await appeler('cpt_a', null);
  verifie('un appel = un GET vers graph.facebook.com, sans corps, redirections refusées', vus.length === 1 && vus[0].methode === undefined && vus[0].corps === undefined && vus[0].redirect === 'error' && vus[0].hote === 'graph.facebook.com' && r.classe.statut === 'succes');
  verifie('le retour de l\'appel ne contient pas le jeton', !JSON.stringify(r).includes(JETON));
  const echec = await appelerReel({ igUserId: '17841400000000001', jeton: JETON, fetchImpl: async () => { throw new Error(`échec ${JETON}`); } })('cpt_a', null);
  verifie('échec réseau : classé « erreur_reseau », une seule tentative, message sans jeton', echec.classe.statut === 'erreur_reseau' && !JSON.stringify(echec).includes(JETON));
  const av = process.env.NODE_TLS_REJECT_UNAUTHORIZED; process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const refus = await leve(() => appelerReel({ igUserId: '17841400000000001', jeton: JETON, fetchImpl })); if (av === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = av;
  verifie('NODE_TLS_REJECT_UNAUTHORIZED=0 : refus avant tout appel', refus);
  verifie('jeton ou identifiant invalides : refus', await leve(() => appelerReel({ igUserId: 'me', jeton: JETON })) && await leve(() => appelerReel({ igUserId: '17841400000000001', jeton: 'court' })));
}

console.log(ko ? `\n${ko} échec(s)` : '\nTous les contrôles passent (réponses et publications SIMULÉES).');
process.exit(ko ? 1 : 0);
