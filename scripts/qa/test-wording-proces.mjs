// =====================================================================
// scripts/qa/test-wording-proces.mjs — « procès » : audience annoncée ≠ procès tenu.
// Cenon (FR-2026-0114) : audience fixée au 22/02/2027 ; la Home ne doit JAMAIS dire « un procès s'est tenu ».
// Usage : node scripts/qa/test-wording-proces.mjs
// =====================================================================
const { phrasesEtat } = await import('../../web/src/lib/etat-wording.ts');
let ko = 0;
const verifie = (nom, cond, detail = '') => { console.log(`${cond ? '  ✅' : '  ❌'} ${nom}${cond ? '' : ' — ' + detail}`); if (!cond) ko++; };
const src = { media: 'Sud Ouest', date: '2026-10-08', url: 'https://exemple.test' };

const sansEvenement = phrasesEtat('procès', null, src).join(' ');
verifie('statut « procès » sans événement daté : ne dit pas « s\'est tenu »', !/s'est tenu/.test(sansEvenement), sansEvenement);
verifie('… dit que l\'audience est annoncée OU déjà tenue', /annoncée ou déjà tenue/.test(sansEvenement), sansEvenement);
verifie('… garde le rappel de présomption', /ne vaut pas culpabilité/.test(sansEvenement), sansEvenement);
verifie('… nomme la source', /Sud Ouest/.test(sansEvenement));

const tenu = phrasesEtat('procès', { statut: 'procès', date: '2026-03-10', type_evenement: 'audience', finalite: null, suites: [], sources: [src] }, src).join(' ');
verifie('événement validé et daté : « un procès s\'est tenu le 10 mars 2026 »', /s'est tenu le 10 mars 2026/.test(tenu), tenu);

// Non-régression : les autres statuts n'ont pas bougé.
verifie('enquête inchangée', phrasesEtat('enquête', null, src)[0] === 'Selon Sud Ouest, une enquête a été ouverte.');
// Sans bloc d'état validé (aucune preuve de finalité) : la condamnation est dite, sans « non définitive ».
const sansEtat = phrasesEtat('condamnation non définitive', null, src)[0];
verifie('condamnation sans bloc d\'état : « une condamnation a été prononcée », sans « non définitive »', /une condamnation a été prononcée/.test(sansEtat) && !/non définitive/.test(sansEtat), sansEtat);
const appel = phrasesEtat('condamnation non définitive', { statut: 'condamnation non définitive', date: null, type_evenement: 'décision', finalite: null, suites: ['APPEL_EN_COURS'], sources: [src] }, src).join(' ');
verifie('appel en cours : « non définitive » conservé', /condamnation non définitive a été prononcée/.test(appel) && /Un appel a été formé/.test(appel), appel);

// Finalité validée « inconnue » : plus de « non définitive » affirmé ; finalité « non_definitive » (ou appel) : inchangé (cas positif).
const inconnue = phrasesEtat('condamnation non définitive', { statut: 'condamnation non définitive', date: null, type_evenement: 'décision', finalite: 'inconnue', suites: [], sources: [src] }, src).join(' ');
verifie('finalité inconnue : « une condamnation a été prononcée », sans « non définitive »', /une condamnation a été prononcée/.test(inconnue) && !/non définitive/.test(inconnue), inconnue);
const nonDef = phrasesEtat('condamnation non définitive', { statut: 'condamnation non définitive', date: null, type_evenement: 'décision', finalite: 'non_definitive', suites: [], sources: [src] }, src).join(' ');
verifie('finalité non_definitive : « non définitive » conservé', /condamnation non définitive a été prononcée/.test(nonDef) && /n'est pas définitive/.test(nonDef), nonDef);

console.log(ko ? `\nWORDING_PROCES_FAILED — ${ko} échec(s)` : '\nWORDING_PROCES_OK');
process.exit(ko ? 1 : 0);
