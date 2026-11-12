// =====================================================================
// scripts/qa/run-all.mjs
//
// Enchaîne les contrôles QA dans l'ordre imposé par QA_GATES_V0 §3.5 :
// d'abord ce qui protège d'un dommage irréversible (fuite, donnée
// interdite), ensuite ce qui protège d'une erreur corrigeable.
//
// Usage :
//   node scripts/qa/run-all.mjs
//   node scripts/qa/run-all.mjs --strict   (échoue aussi sur le corpus réel)
// =====================================================================

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STRICT = process.argv.includes('--strict');

const ETAPES = [
  {
    nom: 'G10 — surface publique (fuite de champ interne, secret, prototype)',
    script: 'scripts/qa/check-public-surface.mjs',
    bloquant: true,
  },
  {
    nom: 'Auto-test des règles (chaque règle sait échouer)',
    script: 'scripts/qa/self-test.mjs',
    bloquant: true,
  },
  {
    nom: 'Cycles d’entretien simulés (idempotence, résolution, contradiction)',
    script: 'scripts/qa/run-cycles.mjs',
    bloquant: true,
  },
  {
    nom: 'Routage de la veille — contre-exemples (le titre décide où regarder, jamais ce qui est vrai)',
    script: 'scripts/qa/test-routage.mjs',
    bloquant: true,
  },
  {
    nom: 'Sources suivies — publications d’organismes (attribution, rattachement par le texte, mémoire, échecs visibles)',
    script: 'scripts/qa/test-sources-suivies.mjs',
    bloquant: true,
  },
  {
    nom: 'Déclarations d’organismes — information décidable (fait structuré, libellé fermé, attribution), continuité d’une proposition, application et projection (jamais sans ACCEPT, jamais sous HOLD)',
    script: 'scripts/qa/test-declaration-organisme.mjs',
    bloquant: true,
  },
  {
    nom: 'Wording « procès » — audience annoncée ≠ procès tenu',
    script: 'scripts/qa/test-wording-proces.mjs',
    bloquant: true,
  },
  {
    nom: 'Lexique du filtre — « agressée sexuellement » reconnu, « violent » ne déclenche pas « viol »',
    script: 'scripts/qa/test-lexique.mjs',
    bloquant: true,
  },
  {
    nom: 'Discovery quotidien — vérification des extractions, familles de dépêches, messages Telegram',
    script: 'scripts/qa/test-discovery.mjs',
    bloquant: true,
  },
  {
    nom: 'Une affaire, une décision (Discovery) · réponses publiques et dates écrites (Maintenance)',
    script: 'scripts/qa/test-unite-decision.mjs',
    bloquant: true,
  },
  {
    nom: 'Signaux réunis avant d’être décidés · un voisin sans indice positif n’est pas un candidat · trois états d’identité · ancien bouton inerte (fixtures synthétiques)',
    script: 'scripts/qa/test-rapprochement-signaux.mjs',
    bloquant: true,
  },
  {
    nom: 'Une décision humaine, une suite · doctrine judiciaire (stade établi par les citations) · « VALIDER ET PUBLIER » · aucun deuxième GO',
    script: 'scripts/qa/test-une-decision.mjs',
    bloquant: true,
  },
  {
    nom: 'Enrichissement multi-surfaces — faits (pas articles) comparés à la mémoire, mobilisation, mesure territoriale à date relative, une information lue par fiche et Hub',
    script: 'scripts/qa/test-enrichissement.mjs',
    bloquant: true,
  },
  {
    nom: 'Nouveau Hub actionnable (PRÉPARER LE HUB → dossier consultable, rejeu sans doublon, rien publié) · « À lire aussi » = piste, jamais preuve (article lié, date, portée)',
    script: 'scripts/qa/test-hub-et-pistes.mjs',
    bloquant: true,
  },
  {
    nom: 'Hubs futurs sans agent — matière composée (jamais inventée), GO « PUBLIER LE HUB » sur l’empreinte, projection, parcours raccordé aux workflows',
    script: 'scripts/qa/test-hub-publication.mjs',
    bloquant: true,
  },
  {
    nom: 'Mise à jour d’une fiche publiée par un événement judiciaire sans changement de statut — sélection, changements vs version publique, message « mise à jour », promotion après clic, contenu servi vérifié',
    script: 'scripts/qa/test-fiche-maj.mjs',
    bloquant: true,
  },
  {
    nom: 'Une relecture enrichit les acquis, elle ne les remplace pas — fusion avec la version approuvée, diff sans faux retrait, message de mise à jour, empreinte et clic, faits territoriaux (6 cas réels rejoués)',
    script: 'scripts/qa/test-acquis.mjs',
    bloquant: true,
  },
  {
    nom: 'Information validée → pages existantes — destinations calculées (fiche approuvée, Hub publié), portée jamais devinée, rien d’exposé hors pages publiques',
    script: 'scripts/qa/test-destinations.mjs',
    bloquant: true,
  },
  {
    nom: 'Confirmation d’un enrichissement — message selon l’issue réelle (conservé · publié et vérifié avec URL · bloqué avec motif) ; nouvelle affaire inchangée',
    script: 'scripts/qa/test-confirmation-enrichissement.mjs',
    bloquant: true,
  },
  {
    nom: 'Fermer la boucle — clics Telegram, rapprochements (géographie, sources), événements institutionnels, un fait = un événement',
    script: 'scripts/qa/test-boucle.mjs',
    bloquant: true,
  },
  {
    nom: 'Résolveur — départage par les sources et la chronologie (plusieurs candidates ≠ ambiguïté tant qu’on ne les a pas comparées)',
    script: 'scripts/qa/test-departage.mjs',
    bloquant: true,
  },
  {
    nom: 'Alerte de clic — une erreur secondaire après une application réussie n’est pas l’échec de la décision',
    script: 'scripts/qa/test-alerte-clic.mjs',
    bloquant: true,
  },
  {
    nom: 'Projection des évolutions — affaire absente de l’artefact ≠ échec ; non projetable sur le site = conflit à arbitrer',
    script: 'scripts/qa/test-classer-projection.mjs',
    bloquant: true,
  },
  {
    nom: 'Publication autonome — garde-fous (HOLD, REVIEW, à corriger, doublon, sources) et point de carte jamais inventé',
    script: 'scripts/qa/test-publication.mjs',
    bloquant: true,
  },
  {
    nom: 'Publication autonome — intégration (GO → publication ; HOLD/sans GO/arriéré → rien ; concurrence ; build en échec ; workflows)',
    script: 'scripts/qa/test-publication-autonome.mjs',
    bloquant: true,
  },
  {
    nom: 'Telegram PUBLIER — GO explicite via publier-affaire, REJECT conserve, REVIEW ne publie rien, localisation jamais inventée',
    script: 'scripts/qa/test-proposition-publication.mjs',
    bloquant: true,
  },
  {
    nom: 'Fiches individuelles — une seule mémoire (liens d’événements, réactions attribuées, rien de privé)',
    script: 'scripts/qa/test-fiches.mjs',
    bloquant: true,
  },
  {
    nom: 'Fiche individuelle — pas de page sans approbation (empreinte du dossier), APPROUVER ≠ PUBLIER, prise de parole sans effet sur l’état',
    script: 'scripts/qa/test-fiche-approbation.mjs',
    bloquant: true,
  },
  {
    nom: 'Priorité des approbations de fiche — une approbation supplantée ne remplace jamais le contenu autorisé le plus récent (sélection, GO de lot, retrait/HOLD, relecture, abandon sur push refusé)',
    script: 'scripts/qa/test-fiche-priorite.mjs',
    bloquant: true,
  },
  {
    nom: 'Accueil — H1 visible, vrais liens vers les fiches publiées, ancres stables /#affaire-<id> sans popup à l’arrivée',
    script: 'scripts/qa/test-accueil-liens-ancres.mjs',
    bloquant: true,
  },
  {
    nom: 'Sitemap et canonicals — population = pages générées indexables (jamais le catalogue), exclusions motivées, canonical propre à chaque page, déclaration dans robots.txt',
    script: 'scripts/qa/test-sitemap-canonical.mjs',
    bloquant: true,
  },
  {
    nom: 'Génération des fiches — gardes d’extraction (citation entière, date écrite, quantités, issue, nom, nombre d’enfants, appel/finalité), état contredit ou non étayé ⇒ jamais READY, proposition Telegram',
    script: 'scripts/qa/test-generer-fiche.mjs',
    bloquant: true,
  },
  {
    nom: 'Application d’une version finale de fiche à un dossier de Hub — empreinte exacte, refus sur modification concurrente, cumul de lignes, exception sans effet sur le contenu public, lot réel cohérent',
    script: 'scripts/qa/test-appliquer-hubs.mjs',
    bloquant: true,
  },
  {
    nom: 'Diagnostic territorial — évolue avec la mémoire, aucune notification sans changement',
    script: 'scripts/qa/test-diagnostic.mjs',
    bloquant: true,
  },
  {
    nom: 'Diffusion sociale (Buffer) — éligibilité, messages, idempotence, réconciliation, retrait, secrets (mocks : aucune publication)',
    script: 'scripts/qa/test-diffusion-sociale.mjs',
    bloquant: true,
  },
  {
    nom: 'Diffusion sociale — le vrai script de bout en bout (base, Buffer, site, Telegram simulés : désactivé par défaut, GO postérieur, rejeu, panne, retrait)',
    script: 'scripts/qa/test-diffuser-script.mjs',
    bloquant: true,
  },
  {
    nom: 'Diffusion sociale — la sonde de schéma Buffer sait échouer (filtre de dates, enums, erreurs typées, statuts) : introspection simulée',
    script: 'scripts/qa/test-buffer-sonde.mjs',
    bloquant: true,
  },
  {
    nom: 'Pilote éditorial social (V4.1) — banc d’essai : fait avant procédure, déclarations, concordance des sources, affaire réconciliée (Montpellier), pare-feux documentaires, traçabilité, sécurité des personnes, corpus réel, aucun chemin Buffer',
    script: 'scripts/qa/test-banc-social.mjs',
    bloquant: true,
  },
  {
    nom: 'Incidents du 12/11 — une affaire = une fiche (garde à la création, rejeu, concurrence, séparation, revue) · recommandations ≠ article · une décision = une portée, des destinations dites fait par fait',
    script: 'scripts/qa/test-incident-12-11.mjs',
    bloquant: true,
  },
  {
    nom: 'Corpus réel (data/cases.json)',
    script: 'scripts/qa/check-corpus.mjs',
    bloquant: STRICT,
    note: 'Non bloquant par défaut : les constats portent sur des données réelles publiées, '
      + 'dont la correction est réservée à une décision humaine.',
  },
];

let echecs = 0;
const resume = [];

for (const e of ETAPES) {
  console.log(`\n${'─'.repeat(72)}\n▶ ${e.nom}\n${'─'.repeat(72)}`);
  const r = spawnSync(process.execPath, [resolve(ROOT, e.script)], { cwd: ROOT, stdio: 'inherit' });
  const ok = r.status === 0;
  if (!ok && e.bloquant) echecs++;
  resume.push({ nom: e.nom, ok, bloquant: e.bloquant, note: e.note });
}

console.log(`\n${'═'.repeat(72)}\nRÉCAPITULATIF QA\n${'═'.repeat(72)}`);
for (const r of resume) {
  const etat = r.ok ? '✅ PASSED' : r.bloquant ? '❌ FAILED' : '⚠️  CONSTATS';
  console.log(`  ${etat}  ${r.nom}`);
  if (r.note && !r.ok) console.log(`           ${r.note}`);
}

console.log('');
if (echecs === 0) {
  console.log('QA_PASSED — aucun contrôle bloquant en échec.');
  process.exit(0);
}
console.log(`QA_FAILED — ${echecs} contrôle(s) bloquant(s) en échec.`);
process.exit(1);
