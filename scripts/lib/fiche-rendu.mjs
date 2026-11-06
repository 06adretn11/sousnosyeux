// =====================================================================
// scripts/lib/fiche-rendu.mjs — rendu Markdown LISIBLE d'une fiche générée (revue humaine, restitution) : blocs, sources, inconnues, points d'attention,
// puis traçabilité (chaque ligne → l'extrait littéral qui la soutient). Lecture seule : ce n'est pas la page publique.
// =====================================================================
import { hashDossier } from './fiche-page.mjs';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (iso) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso || ''); return m ? `${m[3] ? `${Number(m[3])} ` : ''}${MOIS[Number(m[2]) - 1]} ${m[1]}` : null; };
const TYPE = { fait_rapporte: 'Faits rapportés', signalement: 'Signalement', plainte: 'Plainte', enquete: 'Enquête', garde_a_vue: 'Garde à vue', mise_en_examen: 'Mise en examen', renvoi: 'Renvoi', audience: 'Audience', decision: 'Décision', appel: 'Appel',
  mesure_etablissement: 'Mesure de l’établissement', mesure_collectivite: 'Mesure de la collectivité', mesure_etat: 'Mesure de l’État', communication_parquet: 'Parquet', contexte: 'Contexte' };
const BADGE = { READY: '🟢 READY', A_REVOIR: '🟠 À REVOIR', BLOQUE: '🔴 BLOQUÉ', PAS_D_ENRICHISSEMENT: '⚪ PAS D’ENRICHISSEMENT' };

// `complet:false` (rendu destiné au dépôt public) n'inclut NI les extraits littéraux NI le détail des éléments écartés : ils peuvent contenir un nom
// de mis en cause ou un nombre d'enfants, précisément ce que les gardes ont retiré de la fiche.
export function rendreMarkdown({ c, dossier: d, generation: g }, { complet = true } = {}) {
  const empreinte = hashDossier(d);
  const L = [];
  const quand = (e) => (e.date_nature === 'evenement' ? dateFr(e.date) : e.date_nature === 'approximative' ? `vers ${dateFr(e.date)}` : `date non écrite · paru le ${dateFr(e.source?.publie_le) ?? '?'}`);
  L.push(`# ${c.etablissement} — ${c.commune}`, '', `\`${c.case_id}\` · ${c.type_structure} · rôle : ${c.role_mis_en_cause} · état de la carte : **${c.statut_judiciaire}**`, '', `**Qualification : ${BADGE[g.qualification]}** — fiche générée le ${g.genere_le} (contrat \`${g.contrat}\`, modèle \`${g.modele}\`). *Aperçu de revue : ce n’est pas la page publique.* Empreinte du dossier (celle de la proposition Telegram) : \`${empreinte}\`.`, '');
  if (g.blocages.length) L.push('### Blocages', ...g.blocages.map((b) => `- **${b.code}** — ${b.texte}`), '');
  if (g.proposition_etat) L.push(`> Proposition à transmettre à la Maintenance (non appliquée) : « ${g.proposition_etat.de} » → « ${g.proposition_etat.vers} »${g.proposition_etat.preuve ? ` — preuve : ${g.proposition_etat.preuve.media}, ${g.proposition_etat.preuve.url}` : ''}`, '');
  // Ce que la page affiche (FicheUnique.astro) : les blocs `situation` s'ils existent, sinon la `synthese`, sinon les phrases d'état. Le libellé de statut n'est affiché qu'en leur absence.
  L.push('## Situation judiciaire', '');
  if (d.situation) for (const b of [d.situation.decision, d.situation.suite]) { if (b) L.push(`- **${b.label} · ${b.titre}**${b.meta ? ` (${b.meta})` : ''}${b.texte ? ` — ${b.texte}` : ''}`, ...(b.lignes || []).map((x) => `  - ${x}`)); }
  else if (d.synthese) L.push(`- ${d.synthese.decision}`, ...(d.synthese.ouvert ? [`- ${d.synthese.ouvert}`] : []));
  else if (d.etat_actuel?.length) L.push(...d.etat_actuel.map((x) => `- ${x}`)); else L.push('*Aucune décision ni étape établie par les sources lues.*');
  if (d.statut_libelle && !d.situation) L.push('', `Libellé de statut affiché : « ${d.statut_libelle} »`);
  L.push('');
  // `faits` n'est pas affiché par la page : la section n'est donnée que si le champ existe (jamais de fausse mention d'absence quand le déroulé porte des faits).
  if (d.faits) L.push('## Faits publiquement rapportés (champ réutilisable, non affiché par la page)', '', d.faits, '');
  L.push('## Chronologie', '');
  if (!d.deroule?.length) L.push('*Aucune étape datée et sourcée.*');
  for (const e of d.deroule || []) L.push(`- **${quand(e)}** · ${TYPE[e.type] ?? e.type}${e.acteur ? ` (${e.acteur})` : ''} — ${e.texte}  \n  Source : [${e.source.media}](${e.source.url})${(e.sources_complementaires || []).length ? ` · aussi : ${e.sources_complementaires.map((s) => `[${s.media}](${s.url})`).join(', ')}` : ''}`);
  L.push('');
  // Une suspension ou une mesure rapportée dans le déroulé n'est jamais déclarée absente : la section n'existe que s'il y a une mesure typée.
  const mesures = (d.deroule || []).filter((e) => /^mesure_|^suspension/.test(e.type));
  if (mesures.length) L.push('## Mesures institutionnelles (autres que les suites judiciaires, suivies plus haut)', '', ...mesures.map((e) => `- ${e.texte} ([${e.source.media}](${e.source.url}))`), '');
  L.push('## Réactions et déclarations attribuées', '');
  if (!d.reactions?.length) L.push('*Aucune déclaration d’une personne ou institution nommée dans les sources lues.*');
  for (const r of d.reactions || []) L.push(`- **${r.acteur}** — ${r.qualite}${r.a_propos ? ` · à propos de : ${r.a_propos}` : ''}${(r.citations || []).slice(0, 2).map((c) => `  \n  > « ${c.texte} »`).join('')}${r.paraphrase ? `  \n  ${r.paraphrase}` : ''}  \n  Source : [${r.source.media}](${r.source.url})`);
  L.push('');
  // Une source listée n'est pas une source utilisée : seule « établi » alimente la fiche.
  // Trois niveaux distincts : listée · qualifiée « utilisée » · citée par une étape ou une réaction. Seule la source CITÉE alimente la fiche.
  const citees = new Set();
  for (const e of d.deroule || []) { citees.add(e.source?.url); for (const s of e.sources_complementaires || []) citees.add(s.url); }
  for (const r of [...(d.reactions || []), ...(d.paroles || [])]) citees.add(r.source?.url);
  const USAGE = { CETTE_AFFAIRE: 'rattachement établi — utilisée', AUTRE_AFFAIRE: 'autre affaire — NON utilisée', AFFAIRE_SOEUR: 'affaire proche — NON utilisée', AMBIGU: 'rattachement non établi — NON utilisée', HORS_SUJET: 'hors sujet (même nom ou même lieu, autre sujet) — NON utilisée' };
  const usage = (s) => (s.pertinence === 'CETTE_AFFAIRE' && !citees.has(s.url) ? 'rattachement établi, mais aucune étape ni réaction n’en provient — NON utilisée'
    : citees.has(s.url) && s.pertinence !== 'CETTE_AFFAIRE' ? `conservée de la version approuvée (non relue ou non reprise à ce passage${s.acces !== 'libre' ? ` : ${s.acces}${s.motif ? ` — ${s.motif}` : ''}` : ''}) — l’acquis n’est pas effacé`
    : s.pertinence ? USAGE[s.pertinence] ?? s.pertinence : (s.ecarte ? 'rattachement non établi (ne nomme pas la commune ou la structure) — NON utilisée' : (s.acces !== 'libre' ? 'non lue (inaccessible) — NON utilisée' : '—')));
  const ligneSource = (s) => `| [${s.media}](${s.url}) (${s.publication_date ?? 'date ?'}) | ${s.acces}${s.motif ? ` — ${s.motif}` : ''} | ${s.origine} | ${usage(s)} |`;
  const utilisees = g.sources.filter((s) => citees.has(s.url));
  const inventaire = g.sources.filter((s) => !citees.has(s.url));
  L.push('## Sources utilisées', '', '| Source | Accès | Origine | Rattachement à l’affaire |', '|---|---|---|---|', ...utilisees.map(ligneSource), '');
  if (inventaire.length) L.push('## Inventaire des autres sources (écartées, non lues ou sans apport)', '', '| Source | Accès | Origine | Rattachement à l’affaire |', '|---|---|---|---|', ...inventaire.map(ligneSource), '');
  if (g.acquis) {
    const q = g.acquis;
    L.push('## Version approuvée et relecture : ce qui est conservé, ajouté ou écarté', '',
      `Version approuvée de départ : \`${q.precedent_hash}\`. ${q.inchange ? 'La relecture n’apporte rien d’éditorial : la version approuvée est inchangée.' : 'La candidate = version approuvée + apports de la relecture.'}`, '',
      `- Étapes approuvées conservées alors que la relecture ne les reproduit pas : ${q.conservees.length}${q.conservees.length ? ` (${q.conservees.filter((x) => x.raison === 'NON_RELUE').length} dont aucune source n’a été relue à ce passage)` : ''}`,
      `- Références ajoutées à des étapes existantes : ${q.references_ajoutees.length} · sources devenues références secondaires (jamais retirées) : ${q.devenues_secondaires.length}`,
      `- Étapes enrichies par une formulation plus complète : ${q.enrichies.length} · dates divergentes non tranchées : ${q.divergences.length} · ambiguïtés conservées : ${q.ambigues.length}`,
      `- Retraits motivés : ${q.retirees.length}${q.retirees.map((x) => `\n  - ${String(x.texte).slice(0, 120)} — ${x.motif}`).join('')}`,
      `- Positions attribuées conservées : ${q.reactions_conservees} · ajoutées : ${q.reactions_ajoutees}`);
    if (q.non_relues?.length) L.push('- Sources citées par la version fusionnée mais non relues à ce passage (conservées, aucune relecture n’est prétendue) :', ...q.non_relues.map((s) => `  - ${s.media} (${s.motif || 'non relue'})`));
    L.push('');
  }
  L.push('## Inconnues et limites documentaires', '', ...(d.inconnues?.length ? d.inconnues.map((x) => `- ${x}`) : ['*Aucune.*']), '');
  L.push('## Points nécessitant une attention particulière', '', ...(g.attention.length ? g.attention.map((a) => `- **${a.niveau}** · ${a.code} — ${a.texte}`) : ['*Aucun.*']), '');
  L.push('## Mesures de génération', '', `- Sources : ${g.sources.filter((s) => s.acces === 'libre').length} lue(s) sur ${g.sources.length} · pertinentes : ${g.stats.sources_pertinentes}`, `- Éléments écartés par les gardes : ${g.ecartes.length} · éléments d'une autre affaire ou de portée territoriale, classés à part : ${(g.hors_perimetre || []).length}`, `- LLM : ${g.cout.appels} appel(s) (${g.cout.cache} depuis le cache), ${g.cout.input_tokens} tokens en entrée, ${g.cout.output_tokens} en sortie, ${g.cout.cout_usd == null ? 'coût non rapporté' : `${g.cout.cout_usd.toFixed(4)} USD`}`, '');
  if (complet) {
    L.push('<details><summary>Traçabilité — extrait littéral soutenant chaque ligne</summary>', '');
    for (const t of g.trace) for (const p of t.preuves || []) L.push(`- \`${t.ref}\` — ${t.texte.slice(0, 110)}  \n  « ${p.citation} » — ${p.media}`);
    L.push('', '</details>', '');
    if (g.ecartes.length) L.push('<details><summary>Éléments proposés par le modèle puis écartés</summary>', '', ...g.ecartes.map((e) => `- ${e.element} — **${e.raison}**${e.extrait ? ` : « ${e.extrait} »` : ''}`), '', '</details>', '');
  } else L.push('*Traçabilité (extrait littéral de chaque ligne) et détail des éléments écartés : conservés hors dépôt public (data/fiches-generees/, ignoré par Git).*', '');
  return L.join('\n');
}
