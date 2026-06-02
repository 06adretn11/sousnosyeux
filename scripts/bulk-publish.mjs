// =====================================================================
// scripts/bulk-publish.mjs
// Passe en "publiée" toutes les fiches candidates avec score >= 8.
//
// Usage :
//   node --env-file=.env.local scripts/bulk-publish.mjs             # publie score >= 8
//   node --env-file=.env.local scripts/bulk-publish.mjs --min=7     # publie score >= 7
//   node --env-file=.env.local scripts/bulk-publish.mjs --dry-run   # liste sans modifier
// =====================================================================

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const minArg = args.find(a => a.startsWith('--min='));
const MIN_SCORE = minArg ? parseInt(minArg.split('=')[1], 10) : 8;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  console.error('   Lancer avec : node --env-file=.env.local scripts/bulk-publish.mjs');
  process.exit(1);
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function main() {
  console.log(`🔍 Recherche des fiches candidates avec score >= ${MIN_SCORE}...\n`);

  // Récupérer les candidates éligibles
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?publication_status=eq.candidate&fiabilite_info_10=gte.${MIN_SCORE}&select=case_id,etablissement,commune,fiabilite_info_10,lat,lng&order=fiabilite_info_10.desc,case_id`,
    { headers }
  );

  if (!res.ok) {
    console.error(`❌ Erreur API : ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const candidates = await res.json();

  if (candidates.length === 0) {
    console.log('✅ Aucune fiche candidate éligible à publier.');
    return;
  }

  // Vérifier que toutes ont des coordonnées
  const withGeo = candidates.filter(c => c.lat !== null && c.lng !== null);
  const withoutGeo = candidates.filter(c => c.lat === null || c.lng === null);

  console.log(`📋 ${candidates.length} fiche(s) candidate(s) score >= ${MIN_SCORE} :`);
  console.log(`   • ${withGeo.length} géocodée(s) → prêtes à publier`);
  if (withoutGeo.length > 0) {
    console.log(`   • ${withoutGeo.length} SANS coordonnées → non publiée(s) (lancer d'abord le géocodage)`);
  }
  console.log('');

  // Lister
  for (const c of candidates) {
    const geo = c.lat !== null ? '📍' : '⚠️ ';
    console.log(`  ${geo} ${c.case_id} — ${c.etablissement} (${c.commune}) — score ${c.fiabilite_info_10}/10`);
  }
  console.log('');

  // Ne publier que celles avec coordonnées
  const toPublish = withGeo;

  if (toPublish.length === 0) {
    console.log('⚠️  Aucune fiche géocodée à publier.');
    return;
  }

  if (DRY) {
    console.log(`[dry-run] ${toPublish.length} fiche(s) seraient publiée(s).`);
    return;
  }

  // Passage en "publiée" par batch
  const ids = toPublish.map(c => c.case_id);
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?case_id=in.(${ids.map(id => `"${id}"`).join(',')})`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ publication_status: 'publiée' }),
    }
  );

  if (!updateRes.ok) {
    console.error(`❌ Erreur mise à jour : ${updateRes.status} ${await updateRes.text()}`);
    process.exit(1);
  }

  const updated = await updateRes.json();
  console.log(`✅ ${updated.length} fiche(s) passée(s) en "publiée".`);
  console.log('');
  console.log('👉 Prochaine étape : déclencher un rebuild du site.');
  console.log('   Option 1 : git commit + push (déclenche le CI Cloudflare)');
  console.log('   Option 2 : curl -X POST <DEPLOY_HOOK_URL>');
}

main().catch(e => { console.error(e); process.exit(1); });
