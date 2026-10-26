#!/usr/bin/env node
// =====================================================================
// scripts/project-evenements.mjs — Neon (case_events) → data/evenements.json : la chronologie VALIDÉE des affaires PUBLIQUES.
//
//   node scripts/project-evenements.mjs --diff     # écart avec le fichier committé, n'écrit rien
//   node scripts/project-evenements.mjs            # écrit data/evenements.json si le contenu change
//
// C'est le seul pont entre la mémoire (Neon) et les pages : la fiche d'une affaire ET le déroulé du Hub lisent CE fichier pour les
// événements validés (voir web/src/lib/fiche.ts). Aucune rédaction ici, aucun LLM, lecture seule.
// Périmètre : les affaires présentes dans data/cases.json (jamais une candidate, jamais une affaire retirée). Liste blanche de champs.
// Un même fait enregistré deux fois (type + date + statut) ne compte qu'une fois, le plus ancien fait foi (même règle que la synthèse d'état).
// `rectification` n'est jamais un fait à afficher.
// =====================================================================
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dossierFiche, hashDossier, ficheApprouvee, empreinteApprouvee } from './lib/fiche-page.mjs';
import { connecter } from './lib/neon.mjs';
import { lireMatiereValidee } from './lib/matiere-validee.mjs';
import { construireMatiere } from './lib/destinations.mjs';
import { enregistrerHub } from './lib/diagnostic-territoire.mjs';
import { hubsApprouves, hashMatiere, CHEMIN_MATIERE, CHEMIN_APPROUVE } from './lib/hub-publication.mjs';
import { prevenirUneFois, texteBloquee, texteConservee } from './lib/prevenir.mjs';

const DIFF = process.argv.includes('--diff');
const CHEMIN = new URL('../data/evenements.json', import.meta.url);
const ids = JSON.parse(readFileSync(new URL('../data/cases.json', import.meta.url), 'utf8')).cases.map((c) => c.case_id);

const { sql } = connecter();
const lignes = await sql`
  select e.case_id, e.event_id::text event_id, to_char(e.event_date, 'YYYY-MM-DD') date, e.event_type::text type,
         e.statut_apres::text statut, e.libelle_public libelle, e.realisation, e.recorded_at::text recorded_at,
         a.media, a.url, to_char(a.publication_date, 'YYYY-MM-DD') publie_le
    from case_events e left join articles a on a.article_id = e.article_id
   where e.case_id = any(${ids}) and e.event_type::text <> 'rectification'
   order by e.case_id, e.event_date nulls last, e.recorded_at`;

const vus = new Set();
const parAffaire = {};
for (const l of lignes) {
  const cle = `${l.case_id}|${l.type}|${l.date ?? 'nd'}|${l.statut ?? 'nd'}`;
  if (l.date && vus.has(cle)) continue; // même fait, déjà retenu (le plus ancien)
  vus.add(cle);
  (parAffaire[l.case_id] ||= []).push({
    event_id: l.event_id, date: l.date, type: l.type, statut: l.statut, libelle: l.libelle,
    ...(l.realisation ? { realisation: l.realisation } : {}),
    source: l.media ? { media: l.media, url: l.url, publie_le: l.publie_le } : null,
  });
}
// Fiches individuelles APPROUVÉES (revue « [Fiche approuvée] » d'Adrien) : publiques seulement si l'empreinte approuvée est celle du dossier
// ACTUEL (le dossier a changé depuis → plus publique jusqu'à une nouvelle approbation : échec fermé).
const revues = await sql`select case_id, reviewed_by, decision::text decision, comment from reviews where case_id = any(${ids}) and comment like '[Fiche approuvée %' order by reviewed_at`;
const fiches = {};
for (const id of new Set(revues.map((r) => r.case_id))) {
  const h = ficheApprouvee(revues.filter((r) => r.case_id === id), id);
  const dossier = dossierFiche(id);
  const servie = empreinteApprouvee(revues.filter((r) => r.case_id === id), id, dossier); // empreinte du dossier RÉELLEMENT servi (approuvée)
  if (servie) fiches[id] = { hash: servie };
  else if (h) console.log(`· ${id} : fiche approuvée mais dossier modifié depuis (empreinte différente) — NON publique, nouvelle approbation requise`);
}
// INFORMATIONS VALIDÉES (mobilisations, mesures, réactions) : UNE information dans la mémoire (state_proposals.facts), ses DESTINATIONS calculées ici
// parmi les pages DÉJÀ publiques (fiche approuvée de l'affaire, Hub publié dont le périmètre contient la portée). Aucune page n'est créée ; une
// information sans page concernée, ou liée à une affaire non publique / sous HOLD, ne quitte jamais Neon (et sa citation n'est jamais projetée).
const lire = (fichier) => JSON.parse(readFileSync(new URL(`../${fichier}`, import.meta.url), 'utf8'));
const casesPubliques = lire('data/cases.json').cases;
const holds = new Set((lire('data/publication-holds.json').holds || []).map((h) => h.case_id));
const hubs = Object.fromEntries(['paris-11e', 'bordeaux-gironde', 'hautes-alpes', 'landes'].map((h) => [h, { publie: true, groupes: lire(`data/hub-matiere/${h}.json`).reponses.map((g) => g.titre) }]));
// HUBS COMPOSÉS : le contenu public est la DERNIÈRE VERSION APPROUVÉE (instantané data/hub-approuve/<slug>.json, écrit quand le GO porte sur la matière
// courante). Une modification en attente de validation ne retire jamais un Hub publié ; sans GO retrouvable, rien n'est public (échec fermé).
// Le Hub approuvé reçoit ensuite les informations validées comme les Hubs rédigés (même périmètre, mêmes blocs de SA version approuvée), sans second GO.
const decisionsHub = (await sql`select payload->'hub_publication' h from new_case_proposals where decision = 'ACCEPT' and payload ? 'hub_publication' order by decided_at desc, proposal_id`)
  .map((r) => r.h).filter((x) => /^[a-z0-9-]+$/.test(x?.slug || '') && x?.hash);
const slugsHub = [...new Set(decisionsHub.map((x) => x.slug))];
const lireSi = (chemin) => (existsSync(new URL(`../${chemin}`, import.meta.url)) ? lire(chemin) : null);
const matieresHub = Object.fromEntries(slugsHub.map((s) => [s, lireSi(CHEMIN_MATIERE(s))]));
const instantanesHub = Object.fromEntries(slugsHub.map((s) => [s, lireSi(CHEMIN_APPROUVE(s))]));
const approbations = hubsApprouves(decisionsHub, matieresHub, instantanesHub);
const versionApprouvee = {};   // slug → matière de la version approuvée (courante si le GO vient de lui être donné, sinon l'instantané conservé)
for (const [slug, a] of Object.entries(approbations)) {
  versionApprouvee[slug] = a.source === 'courante' ? matieresHub[slug] : instantanesHub[slug];
  hubs[slug] = { publie: true, groupes: versionApprouvee[slug].reponses.map((g) => g.titre) };
  enregistrerHub(slug, a.titre, versionApprouvee[slug]._meta?.perimetre?.departement);
}
// Ce qui est publié côté données : { hash, titre } seulement (la provenance courante/instantané ne doit pas faire bouger le fichier public).
const hubsApprouvesCourants = Object.fromEntries(Object.entries(approbations).map(([s, a]) => [s, { hash: a.hash, titre: a.titre }]));
for (const x of decisionsHub) if (!approbations[x.slug] && matieresHub[x.slug]) console.log(`· Hub « ${x.slug} » : aucun GO sur une version retrouvable — non publié (nouveau GO requis)`);
for (const [slug, a] of Object.entries(approbations)) if (a.source === 'instantane' && matieresHub[slug] && hashMatiere(matieresHub[slug]) !== a.hash) console.log(`· Hub « ${slug} » : modification en attente de validation — dernière version approuvée maintenue`);
const { matiere, bloques, conservees } = construireMatiere(await lireMatiereValidee(sql), {
  publiques: new Set(ids), holds, approuvees: new Set(Object.keys(fiches)), cases: new Map(casesPubliques.map((c) => [c.case_id, { commune: c.commune, departement: c.departement, etablissement: c.etablissement }])), hubs,
});
const doc = { _meta: { projection: 'evenements-v0', note: 'Compilé depuis Neon (case_events, reviews, informations validées) par scripts/project-evenements.mjs. Ne pas éditer à la main.' }, affaires: parAffaire, fiches_approuvees: fiches, matiere, ...(Object.keys(hubsApprouvesCourants).length ? { hubs_approuves: hubsApprouvesCourants } : {}) };
const texte = JSON.stringify(doc, null, 2) + '\n';
const avant = existsSync(CHEMIN) ? readFileSync(CHEMIN, 'utf8') : '';
const n = Object.values(parAffaire).reduce((s, l) => s + l.length, 0);
console.log(`${n} événement(s) validé(s) sur ${Object.keys(parAffaire).length} affaire(s) publique(s)`);
// Pages concernées : fiches nouvellement approuvées + fiches publiques dont un événement a changé (à vérifier sur le site servi).
const ancien = avant ? JSON.parse(avant) : { affaires: {}, fiches_approuvees: {}, matiere: [] };
const ancienne = new Map((ancien.matiere ?? []).map((m) => [m.id, JSON.stringify(m)]));
const changees = matiere.filter((m) => ancienne.get(m.id) !== JSON.stringify(m));                    // informations nouvelles ou modifiées
const retirees = (ancien.matiere ?? []).filter((m) => !matiere.some((x) => x.id === m.id));
const touchees = [...changees, ...retirees];
const concernees = Object.keys(fiches).filter((id) => !ancien.fiches_approuvees?.[id] || JSON.stringify(ancien.affaires?.[id] ?? []) !== JSON.stringify(parAffaire[id] ?? []) || touchees.some((m) => m.destinations.fiche === id));
// + les Hubs nouvellement approuvés (ou dont l'empreinte approuvée a changé) ou retirés : leur page est à vérifier sur le site servi, puis confirmée.
const hubsChanges = Object.keys(hubsApprouvesCourants).filter((s) => JSON.stringify(hubsApprouvesCourants[s]) !== JSON.stringify(ancien.hubs_approuves?.[s]));
const hubsConcernes = [...new Set([...touchees.flatMap((m) => m.destinations.hubs.map((h) => h.hub)), ...hubsChanges])];
const sortie = (change) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `change=${change}
fiches=${concernees.join(',')}
hubs=${hubsConcernes.join(',')}
`); };
console.log(`${matiere.length} information(s) validée(s) projetée(s) (${changees.length} nouvelle(s) ou modifiée(s)) · pages concernées : fiches [${concernees.join(', ') || '—'}] hubs [${hubsConcernes.join(', ') || '—'}] · ${bloques.length} blocage(s)`);
// Une information validée qu'aucun bloc existant ne peut accueillir : blocage EXPLICITE (une seule alerte), jamais d'insertion forcée.
if (!DIFF) for (const b of bloques) await prevenirUneFois(sql, { cle: `matiere:${b.id}`, resultat: 'bloquee', texte: texteBloquee(b) });
// Une information validée SANS page concernée (ni fiche approuvée, ni Hub publié) : confirmation de PERSISTANCE, une seule fois, sans promesse de publication.
// L'issue vient du résultat réel de la projection ci-dessus, jamais du statut « publiée » de l'affaire.
if (!DIFF) for (const f of conservees) await prevenirUneFois(sql, { cle: `matiere:conservee:${f.id}`, resultat: 'conservee', texte: texteConservee(f) });
// Instantanés des versions approuvées : écrits quand le GO porte sur la matière COURANTE (jamais réécrits tant que la version approuvée est la même).
const instantanesAEcrire = Object.entries(approbations).filter(([s, a]) => a.source === 'courante' && !(instantanesHub[s] && hashMatiere(instantanesHub[s]) === a.hash));
if (!DIFF) for (const [s] of instantanesAEcrire) { mkdirSync(new URL('../data/hub-approuve/', import.meta.url), { recursive: true }); writeFileSync(new URL(`../${CHEMIN_APPROUVE(s)}`, import.meta.url), JSON.stringify(matieresHub[s], null, 2) + '\n', 'utf8'); console.log(`✅ version approuvée conservée : ${CHEMIN_APPROUVE(s)}`); }
if (avant === texte && !(instantanesAEcrire.length && !DIFF)) { console.log('NO_PUBLIC_CHANGE — data/evenements.json déjà conforme à Neon'); sortie(false); process.exit(0); }
if (DIFF) { console.log('écart avec le fichier committé (rien écrit) · pages concernées : ' + (concernees.join(', ') || 'aucune')); process.exit(0); }
writeFileSync(CHEMIN, texte, 'utf8');
sortie(true);
console.log('✅ écrit : data/evenements.json');
