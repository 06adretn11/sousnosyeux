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
  L.push('## Situation judiciaire', '');
  if (d.etat_actuel?.length) L.push(...d.etat_actuel.map((x) => `- ${x}`)); else L.push('*Aucune décision ni étape établie par les sources lues.*');
  L.push('');
  L.push('## Faits publiquement rapportés', '', d.faits ?? '*Aucun fait rapporté de façon exploitable par les sources lues.*', '');
  L.push('## Chronologie', '');
  if (!d.deroule?.length) L.push('*Aucune étape datée et sourcée.*');
  for (const e of d.deroule || []) L.push(`- **${quand(e)}** · ${TYPE[e.type] ?? e.type}${e.acteur ? ` (${e.acteur})` : ''} — ${e.texte}  \n  Source : [${e.source.media}](${e.source.url})${(e.sources_complementaires || []).length ? ` · aussi : ${e.sources_complementaires.map((s) => `[${s.media}](${s.url})`).join(', ')}` : ''}`);
  L.push('');
  const mesures = (d.deroule || []).filter((e) => /^mesure_/.test(e.type));
  L.push('## Mesures institutionnelles', '', ...(mesures.length ? mesures.map((e) => `- ${e.texte} ([${e.source.media}](${e.source.url}))`) : ['*Aucune mesure documentée par les sources lues.*']), '');
  L.push('## Réactions et déclarations attribuées', '');
  if (!d.reactions?.length) L.push('*Aucune déclaration d’une personne ou institution nommée dans les sources lues.*');
  for (const r of d.reactions || []) L.push(`- **${r.acteur}** — ${r.qualite}${r.a_propos ? ` · à propos de : ${r.a_propos}` : ''}  \n  > « ${r.citations[0].texte} »  \n  Source : [${r.source.media}](${r.source.url})`);
  L.push('');
  // Une source listée n'est pas une source utilisée : seule « établi » alimente la fiche.
  const USAGE = { CETTE_AFFAIRE: 'rattachement établi — utilisée', AUTRE_AFFAIRE: 'autre affaire — NON utilisée', AFFAIRE_SOEUR: 'affaire proche — NON utilisée', AMBIGU: 'rattachement non établi — NON utilisée' };
  L.push('## Sources', '', '| Source | Accès | Origine | Rattachement à l’affaire |', '|---|---|---|---|');
  for (const s of g.sources) L.push(`| [${s.media}](${s.url}) (${s.publication_date ?? 'date ?'}) | ${s.acces}${s.motif ? ` — ${s.motif}` : ''} | ${s.origine} | ${s.pertinence ? USAGE[s.pertinence] ?? s.pertinence : (s.ecarte ? 'rattachement non établi (ne nomme pas la commune ou la structure) — NON utilisée' : '—')} |`);
  L.push('');
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
