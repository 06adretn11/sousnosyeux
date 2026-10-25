#!/usr/bin/env node
// =====================================================================
// scripts/preparer-hub.mjs — exécute le clic « PRÉPARER LE HUB » : produit le dossier de revue du Hub, le rend consultable, prévient.
//
//   node scripts/preparer-hub.mjs                       # plan : propositions de Hub ACCEPTÉES, rien écrit
//   node scripts/preparer-hub.mjs --ecrire              # écrit docs/industrialisation/hub-drafts/<territoire>.md (change=true si modifié)
//   node scripts/preparer-hub.mjs --annoncer            # dossier présent sur origin/main ? alors UN message avec le lien, et la proposition est close
//   node scripts/preparer-hub.mjs --simuler <territoire> [<département>]   # sans base ni Telegram : dossier à partir de data/cases.json seul
//
// Réutilise : new_case_proposals (décision, applied_at), data/cases.json (affaires PUBLIQUES), case_events + sources (Neon, lecture seule),
// prevenir/prevenirUneFois (Telegram + journal), le dossier de revue docs/industrialisation/hub-drafts/ — et le commit-push de la CI.
// PRÉPARER ≠ PUBLIER : aucune page, aucune écriture dans `cases`, aucun HOLD touché. Rejouable : un dossier déjà à jour (même empreinte) n'est
// pas réécrit, l'annonce n'est faite qu'une fois (proposition close). Une impossibilité ou une erreur est dite, jamais présentée comme un succès.
// =====================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composerBrouillonHub, CHEMIN_BROUILLON, urlBrouillon, slugTerritoire } from './lib/hub-brouillon.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire'), ANNONCER = A.includes('--annoncer'), SIMULER = A.includes('--simuler');
const racine = new URL('../', import.meta.url);
const chemin = (slug) => new URL(CHEMIN_BROUILLON(slug), racine);
const affairesPubliques = (dep) => JSON.parse(readFileSync(new URL('data/cases.json', racine), 'utf8')).cases.filter((c) => c.departement === dep);
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const empreinteDe = (md) => /Empreinte du dossier \| `([0-9a-f]{16})`/.exec(md)?.[1] ?? null;

if (SIMULER) {
  const [, nom, dep] = A.slice(A.indexOf('--simuler'));
  const departement = dep || nom;
  const r = composerBrouillonHub({ territoire: { slug: slugTerritoire(departement), titre: departement, departement }, cases: affairesPubliques(departement), evenements: [], genere_le: aujourdhui() });
  console.log(r.markdown);
  process.exit(0);
}

const { connecter } = await import('./lib/neon.mjs');
const { prevenir, prevenirUneFois, esc } = await import('./lib/prevenir.mjs');
const { journaliser } = await import('./lib/telegram-clics.mjs');
const { sql } = connecter();

const dues = await sql`select proposal_id::text pid, payload, decided_at::text decided_at from new_case_proposals
                        where decision = 'ACCEPT' and applied_at is null and payload ? 'hub' order by created_at`;
console.log(`${dues.length} proposition(s) de Hub acceptée(s) en attente${ECRIRE || ANNONCER ? '' : ' (plan : rien écrit)'}`);
const clore = (pid, note) => sql`update new_case_proposals set applied_at = now(), decision_comment = left(coalesce(decision_comment, '') || ${note}, 500)
                                   where proposal_id = ${pid}::uuid and applied_at is null`;
let erreurs = 0;
const modifies = [];

for (const r of dues) {
  const id8 = r.pid.slice(0, 8), h = r.payload.hub;
  const slug = slugTerritoire(h?.slug);
  if (!slug || slug !== h.slug || !h.departement) { console.log(`· ${id8} proposition mal formée : ignorée`); continue; }

  if (ANNONCER) {
    const f = chemin(slug);
    if (!existsSync(f)) { console.log(`· ${id8} ${slug} : dossier pas encore écrit — annonce différée`); continue; }
    const local = readFileSync(f, 'utf8');
    let surMain = null;
    try {
      execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore' });
      surMain = execFileSync('git', ['show', `origin/main:${CHEMIN_BROUILLON(slug)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { /* absent de main ou git indisponible : traité ci-dessous */ }
    if (surMain === null || empreinteDe(surMain) !== empreinteDe(local)) {
      console.log(`· ${id8} ${slug} : dossier pas (encore) sur main — annonce différée`);
      // Jamais de silence : une préparation qui n'aboutit pas dans les 2 h est dite.
      if (Date.now() - Date.parse(r.decided_at) > 2 * 36e5 && process.env.TELEGRAM_BOT_TOKEN) {
        await prevenirUneFois(sql, { cle: id8, resultat: 'hub_en_retard', texte: `⚠️ <b>Brouillon de Hub NON disponible</b> — ${esc(h.territoire)} (${id8})\nLe dossier a été préparé mais n’a pas pu être déposé sur le dépôt. Rien n’est publié. Il sera réessayé au prochain passage.` });
      }
      continue;
    }
    const texte = `🗺 <b>Brouillon de Hub prêt à relire</b> — ${esc(h.territoire)} (${id8})\n${h.publiques.length} affaire(s) publique(s) · ${h.sources} source(s) · ${h.reactions} réponse(s)/mobilisation(s)\nDossier de revue : ${urlBrouillon(slug)}\nEmpreinte : ${empreinteDe(local)}\n\n<b>Rien n’est publié</b> : aucune page du site n’est créée ni modifiée. Publier ce Hub exigera ton GO distinct, sur cette empreinte.`;
    if (!(await prevenir(texte))) { console.log(`· ${id8} ${slug} : message non parti — réessayé au prochain passage`); erreurs++; continue; }
    await clore(r.pid, ' · brouillon de Hub préparé et annoncé');
    await journaliser(sql, { kind: 'application', cle: id8, resultat: 'hub_pret', details: { slug, empreinte: empreinteDe(local) } });
    console.log(`· ${id8} ${slug} : brouillon annoncé, proposition close`);
    continue;
  }

  // --- préparation ---------------------------------------------------------------------------------------------------------
  try {
    const cases = affairesPubliques(h.departement);
    if (!cases.length) {
      console.log(`· ${id8} ${slug} : plus aucune affaire publique — préparation impossible`);
      if (ECRIRE) {
        await prevenirUneFois(sql, { cle: id8, resultat: 'hub_impossible', texte: `⚠️ <b>Hub NON préparé</b> — ${esc(h.territoire)} (${id8})\nAucune affaire publique dans ce territoire à ce jour. Rien n’a été préparé ni publié.` });
        await clore(r.pid, ' · préparation impossible : aucune affaire publique');
      }
      continue;
    }
    const ids = cases.map((c) => c.case_id);
    const evenements = (await sql`select e.case_id, e.event_type::text type, e.event_date::text date, e.libelle_public libelle, e.realisation,
                                         s.media, s.url, s.publication_date::text publication_date
                                    from case_events e left join sources s on s.source_id = e.source_id
                                   where e.case_id = any(${ids}) and e.libelle_public is not null`)
      .map(({ media, url, publication_date, ...e }) => ({ ...e, source: url ? { media, url, publication_date } : null }));
    const d = composerBrouillonHub({ territoire: { slug, titre: h.departement, departement: h.departement }, cases, evenements, genere_le: aujourdhui() });
    const f = chemin(slug);
    const existant = existsSync(f) ? readFileSync(f, 'utf8') : null;
    const a_jour = existant !== null && empreinteDe(existant) === d.hash;
    console.log(`· ${id8} ${slug} : ${cases.length} affaire(s), ${evenements.length} événement(s), empreinte ${d.hash}${a_jour ? ' — dossier déjà à jour' : ''}`);
    if (!ECRIRE || a_jour) continue;
    mkdirSync(dirname(fileURLToPath(f)), { recursive: true });
    writeFileSync(f, d.markdown);
    modifies.push(slug);
    console.log(`  dossier écrit : ${CHEMIN_BROUILLON(slug)}`);
  } catch (e) {
    erreurs++;
    console.log(`· ${id8} ${slug} : ERREUR de préparation (${String(e.message).slice(0, 120)})`);
    if (ECRIRE) await prevenirUneFois(sql, { cle: id8, resultat: 'hub_erreur', texte: `⚠️ <b>Préparation du Hub en ERREUR</b> — ${esc(h.territoire)} (${id8})\nLe brouillon n’a pas pu être produit. Rien n’est publié ; ta décision est conservée et la préparation sera réessayée.` });
  }
}

if (process.env.GITHUB_OUTPUT && ECRIRE) appendFileSync(process.env.GITHUB_OUTPUT, `change=${modifies.length > 0}\nslugs=${modifies.join(',')}\n`);
console.log(`préparation de Hub : ${modifies.length} dossier(s) écrit(s), ${erreurs} erreur(s)${ECRIRE || ANNONCER ? '' : ' (plan)'}`);
process.exit(erreurs ? 1 : 0);
