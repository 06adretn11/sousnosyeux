// =====================================================================
// scripts/build-hubs.mjs
//
// Fabrique de hubs — porte 3.
//
// Un hub est un RENDU DÉRIVÉ, jamais une seconde source de vérité :
//   · les affaires viennent de data/cases.json ;
//   · la sélection vient de fixtures/hubs/<hub>.json (explicite) ;
//   · les compteurs sont CALCULÉS, jamais saisis ;
//   · le payload est figé par un SHA-256 : c'est lui qui sera approuvé.
//
// Le générateur REFUSE de produire un payload publiable si un contrôle
// bloquant se déclenche. Avec --draft, il produit quand même un payload
// marqué `publishable: false` pour permettre la revue.
//
// Usage :
//   node scripts/build-hubs.mjs --draft
//   node scripts/build-hubs.mjs --draft --hub paris-11e
// =====================================================================

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { checkCase, ruleDuplicates, ruleCounters, deriveCounters } from './qa/lib/rules.mjs';
import { projectCase, projectSource, assertNoInternalFields } from './lib/public-projection.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HUB_DEFS = resolve(ROOT, 'fixtures/hubs');
const OUT_PAYLOAD = resolve(ROOT, 'data/hub-drafts');
const OUT_DOSSIER = resolve(ROOT, 'docs/industrialisation/hub-drafts');

const args = process.argv.slice(2);
const DRAFT = args.includes('--draft');
const ONLY = args.includes('--hub') ? args[args.indexOf('--hub') + 1] : null;
const TODAY = new Date();

const SEUIL_ELIGIBILITE = 4;

/** Hash stable : clés triées récursivement avant sérialisation. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}
const hashPayload = (p) => createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex');

const doc = JSON.parse(await readFile(resolve(ROOT, 'data/cases.json'), 'utf8'));
const byId = new Map(doc.cases.map((c) => [c.case_id, c]));

await mkdir(OUT_PAYLOAD, { recursive: true });
await mkdir(OUT_DOSSIER, { recursive: true });

const defFiles = (await readdir(HUB_DEFS)).filter((f) => f.endsWith('.json'));
const resultats = [];

for (const file of defFiles) {
  const def = JSON.parse(await readFile(resolve(HUB_DEFS, file), 'utf8'));
  if (ONLY && def.hub_id !== ONLY) continue;

  const selection = def.case_ids
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ ...s, case: byId.get(s.case_id) }));

  const introuvables = selection.filter((s) => !s.case).map((s) => s.case_id);
  const cases = selection.filter((s) => s.case).map((s) => s.case);

  // ── Contrôles ──────────────────────────────────────────────────
  const findings = [
    ...cases.flatMap((c) => checkCase(c, TODAY)),
    ...ruleDuplicates(cases),
    ...ruleCounters({ hub_id: def.hub_id, compteurs: def.compteurs }, cases),
  ];
  for (const id of introuvables) {
    findings.push({
      rule: 'H1_affaire_introuvable',
      severity: 'bloquant',
      case_id: id,
      message: 'affaire sélectionnée absente du corpus',
    });
  }

  const bloquants = findings.filter((f) => f.severity === 'bloquant');
  const alertes = findings.filter((f) => f.severity === 'alerte');
  const compteurs = deriveCounters(cases);
  const eligible = compteurs.affaires >= SEUIL_ELIGIBILITE;

  // ── Preuve d'inéligibilité plutôt que remplissage artificiel ──
  if (!eligible) {
    const preuve = {
      hub_id: def.hub_id,
      zone_label: def.zone_label,
      verdict: 'INELIGIBLE',
      motif: `${compteurs.affaires} affaire(s) publiée(s) et qualifiée(s) — seuil ${SEUIL_ELIGIBILITE}`,
      affaires_retenues: cases.map((c) => c.case_id),
      note: 'Aucun hub produit. Le corpus n’est pas complété artificiellement.',
    };
    await writeFile(
      resolve(OUT_PAYLOAD, `${def.hub_id}.INELIGIBLE.json`),
      JSON.stringify(preuve, null, 2) + '\n'
    );
    resultats.push({ hub_id: def.hub_id, verdict: 'INELIGIBLE', affaires: compteurs.affaires, bloquants: bloquants.length });
    console.log(`⛔ ${def.hub_id} — INÉLIGIBLE (${compteurs.affaires} affaires < ${SEUIL_ELIGIBILITE})`);
    continue;
  }

  // ── Payload : uniquement des champs publics ───────────────────
  const payload = {
    hub_id: def.hub_id,
    zone_label: def.zone_label,
    zone_kind: def.zone_kind,
    template_version: def.template_version,
    rules_version: def.rules_version,
    verified_at: compteurs.derniere_verif,
    compteurs: {
      affaires: compteurs.affaires,
      etablissements: compteurs.etablissements,
      par_statut: compteurs.par_statut,
      echeances_futures: compteurs.echeances_futures,
    },
    affaires: cases.map((c) => ({
      ...projectCase(c),
      sources: (c.sources || []).map(projectSource),
    })),
  };

  // Garde-fou terminal : rien d'interne ne rejoint un rendu.
  assertNoInternalFields(payload, `payload du hub ${def.hub_id}`);

  const payload_hash = hashPayload(payload);
  const publishable = bloquants.length === 0;

  const enveloppe = {
    _meta: {
      avertissement:
        'BROUILLON NON PUBLIABLE. Rendu de travail, noindex, relié à aucune page publique. '
        + 'Les informations judiciaires proviennent d’un instantané non revérifié.',
      genere_le: TODAY.toISOString().slice(0, 10),
      source: 'data/cases.json',
      statut: 'draft',
    },
    payload_hash,
    publishable,
    bloquants: bloquants.length,
    alertes: alertes.length,
    findings,
    payload,
  };

  if (!publishable && !DRAFT) {
    console.log(`❌ ${def.hub_id} — ${bloquants.length} contrôle(s) bloquant(s), payload non produit (relancer avec --draft)`);
    resultats.push({ hub_id: def.hub_id, verdict: 'BLOQUE', affaires: compteurs.affaires, bloquants: bloquants.length });
    continue;
  }

  await writeFile(resolve(OUT_PAYLOAD, `${def.hub_id}.json`), JSON.stringify(enveloppe, null, 2) + '\n');
  await writeFile(resolve(OUT_DOSSIER, `${def.hub_id}.md`), dossierRevue(enveloppe, compteurs));

  resultats.push({
    hub_id: def.hub_id,
    verdict: publishable ? 'PUBLIABLE' : 'BROUILLON',
    affaires: compteurs.affaires,
    bloquants: bloquants.length,
    alertes: alertes.length,
    payload_hash,
  });
  console.log(
    `${publishable ? '✅' : '⚠️ '} ${def.hub_id} — ${compteurs.affaires} affaires · ` +
    `${bloquants.length} bloquant(s) · ${alertes.length} alerte(s) · hash ${payload_hash.slice(0, 12)}…`
  );
}

console.log('\n── Récapitulatif ──');
for (const r of resultats) {
  console.log(`  ${r.hub_id.padEnd(12)} ${String(r.verdict).padEnd(10)} ${r.affaires} affaire(s)` +
    (r.payload_hash ? ` · ${r.payload_hash.slice(0, 12)}…` : ''));
}
const publiables = resultats.filter((r) => r.verdict === 'PUBLIABLE').length;
console.log(`\n${publiables}/${resultats.length} hub(s) publiable(s) en l'état.`);

// ---------------------------------------------------------------------

function dossierRevue(env, compteurs) {
  const p = env.payload;
  const L = [];
  L.push(`# Dossier de revue — hub \`${p.hub_id}\``);
  L.push('');
  L.push(`> ⛔ **Brouillon non publiable.** ${env._meta.avertissement}`);
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| Zone | ${p.zone_label} (${p.zone_kind}) |`);
  L.push(`| Généré le | ${env._meta.genere_le} |`);
  L.push(`| Template | \`${p.template_version}\` · règles \`${p.rules_version}\` |`);
  L.push(`| \`payload_hash\` | \`${env.payload_hash}\` |`);
  L.push(`| Publiable | ${env.publishable ? '✅ oui' : `❌ non — ${env.bloquants} contrôle(s) bloquant(s)`} |`);
  L.push(`| Dernière vérification | ${p.verified_at ?? '— aucune fiche ne porte de `verified_at`'} |`);
  L.push('');
  L.push('## Compteurs dérivés');
  L.push('');
  L.push('Aucun compteur n\'est saisi : tous sont recalculés depuis les affaires retenues.');
  L.push('');
  L.push(`- affaires : **${p.compteurs.affaires}**`);
  L.push(`- établissements distincts : **${p.compteurs.etablissements}**`);
  L.push(`- échéances futures : **${p.compteurs.echeances_futures}**`);
  L.push('');
  L.push('| Statut judiciaire | Affaires |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(p.compteurs.par_statut).sort((a, b) => b[1] - a[1])) {
    L.push(`| ${k} | ${v} |`);
  }
  const somme = Object.values(p.compteurs.par_statut).reduce((a, b) => a + b, 0);
  L.push(`| **total** | **${somme}** ${somme === p.compteurs.affaires ? '✅' : '❌ incohérent'} |`);
  L.push('');
  L.push('## Contrôles');
  L.push('');
  if (env.findings.length === 0) {
    L.push('Aucun constat.');
  } else {
    L.push('| Sévérité | Règle | Cible | Constat |');
    L.push('|---|---|---|---|');
    for (const f of env.findings) {
      L.push(`| ${f.severity === 'bloquant' ? '🔴' : '🟠'} ${f.severity} | \`${f.rule}\` | \`${f.case_id}\` | ${f.message} |`);
    }
  }
  L.push('');
  L.push('## Affaires retenues');
  L.push('');
  L.push('| # | `case_id` | Établissement | Commune | Statut | Source primaire |');
  L.push('|---|---|---|---|---|---|');
  p.affaires.forEach((a, i) => {
    const src = (a.sources || []).find((s) => s.is_primary) || a.sources?.[0];
    L.push(
      `| ${i + 1} | \`${a.case_id}\` | ${a.etablissement} | ${a.commune} | ${a.statut_judiciaire} | ` +
      `${src ? `${src.media} ${src.publication_date ?? '(sans date)'}` : '—'} |`
    );
  });
  L.push('');
  L.push('## Décision');
  L.push('');
  L.push('- [ ] Contenu relu source par source');
  L.push('- [ ] Aucune information interdite (âge, année de naissance, nombre exact d\'enfants)');
  L.push('- [ ] Aucune échéance dépassée présentée comme future');
  L.push('- [ ] Compteurs cohérents avec la liste');
  L.push(`- [ ] Approbation portant sur le hash \`${env.payload_hash}\``);
  L.push('');
  L.push(`_Validateur : ______________  ·  Date : ____________  ·  Décision : validé / à corriger / retirer_`);
  L.push('');
  return L.join('\n');
}
