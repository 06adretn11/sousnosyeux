// Outil de test : relit un APERÇU public de candidate (docs/industrialisation/fiches-generees/<ID>.md, rendu par fiche-rendu.mjs) et en restitue le dossier et
// l'état de lecture des sources — de quoi rejouer la fusion avec la version approuvée sur de VRAIS cas, sans réseau ni modèle.
// Seul ce qui est rendu dans l'aperçu public est restitué (déroulé, situation, faits, réactions, inconnues, sources) : pas d'extraits littéraux.
const TYPE_INVERSE = { 'Faits rapportés': 'fait_rapporte', Signalement: 'signalement', Plainte: 'plainte', Enquête: 'enquete', 'Garde à vue': 'garde_a_vue', 'Mise en examen': 'mise_en_examen', Renvoi: 'renvoi', Audience: 'audience', Décision: 'decision', Appel: 'appel',
  'Mesure de l’établissement': 'mesure_etablissement', 'Mesure de la collectivité': 'mesure_collectivite', 'Mesure de l’État': 'mesure_etat', Parquet: 'communication_parquet', Contexte: 'contexte' };
const MOIS = { janvier: '01', février: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', août: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12' };
const iso = (s) => { const m = /^(?:(\d{1,2})(?:er)? )?([a-zéûà]+) (\d{4})$/.exec(String(s).trim()); if (!m || !MOIS[m[2]]) return null; return m[1] ? `${m[3]}-${MOIS[m[2]]}-${String(m[1]).padStart(2, '0')}` : `${m[3]}-${MOIS[m[2]]}`; };
const section = (md, titre) => { const m = new RegExp(`^## ${titre}[^\\n]*\\n([\\s\\S]*?)(?=^## |^<details|\\Z)`, 'm').exec(md); return m ? m[1].trim() : ''; };
const lien = /\[([^\]]+)\]\(([^)]+)\)/g;

export function apercuVersDossier(md0) {
  const md = String(md0).replace(/\r\n/g, '\n');   // checkout Windows (autocrlf) ou Linux : même lecture
  const empreinte = /Empreinte du dossier[^`]*`([0-9a-f]{16})`/.exec(md)?.[1] ?? null;
  const qualification = /Qualification : [^A-Z]*([A-Z_É’ ]+?)\*\*/.exec(md)?.[1]?.trim() ?? null;
  // sources : tableau « utilisées » + inventaire
  const sources = [];
  for (const l of md.split('\n').filter((x) => /^\| \[/.test(x))) {
    const c = l.split('|').map((x) => x.trim());
    const m = /^\[([^\]]+)\]\(([^)]+)\) \(([^)]*)\)$/.exec(c[1]);
    if (!m) continue;
    const acces = /^libre/.test(c[2]) ? 'libre' : /^partiel/.test(c[2]) ? 'partiel' : 'inaccessible';
    const r = c[4] || '';
    const pertinence = /établi — utilisée|aucune étape ni réaction/.test(r) ? 'CETTE_AFFAIRE' : /autre affaire/.test(r) ? 'AUTRE_AFFAIRE' : /affaire proche/.test(r) ? 'AFFAIRE_SOEUR' : /hors sujet/.test(r) ? 'HORS_SUJET' : /rattachement non établi/.test(r) && acces === 'libre' ? 'AMBIGU' : undefined;
    sources.push({ media: m[1], url: m[2], publication_date: /^\d{4}/.test(m[3]) ? m[3] : null, acces, motif: /—\s*(.+)$/.exec(c[2])?.[1], origine: c[3], pertinence, ecarte: /ne nomme pas/.test(r) ? 'NE_NOMME_PAS_LA_STRUCTURE_ET_LA_COMMUNE' : undefined });
  }
  const pub = new Map(sources.map((s) => [s.url, s.publication_date]));
  const ref = (media, url) => ({ media, url, publie_le: pub.get(url) ?? null, acces: 'libre' });
  // chronologie
  const deroule = [];
  const chrono = section(md, 'Chronologie');
  for (const bloc of chrono.split(/^- /m).filter(Boolean)) {
    const m = /^\*\*(.+?)\*\* · (.+?)(?: \(([^)]*)\))? — ([\s\S]*?)\s*\n\s*Source : (\[[^\n]+)$/.exec(bloc.trim());
    if (!m) continue;
    const [, quand, typeLabel, acteur, texte, srcs] = m;
    const [principale, aussi] = srcs.split(' · aussi : ');
    const liens = [...principale.matchAll(lien)].map((x) => ref(x[1], x[2]));
    const comp = aussi ? [...aussi.matchAll(lien)].map((x) => ref(x[1], x[2])) : [];
    let date = null, nature = 'article';
    if (/^date non écrite/.test(quand)) { nature = 'article'; } else if (/^vers /.test(quand)) { date = iso(quand.slice(5)); nature = 'approximative'; } else { date = iso(quand); nature = date ? 'evenement' : 'article'; }
    deroule.push({ date, date_nature: nature, type: TYPE_INVERSE[typeLabel] ?? typeLabel, acteur: acteur ?? null, texte: texte.replace(/\s+$/g, ''), source: liens[0], ...(comp.length ? { sources_complementaires: comp } : {}) });
  }
  // situation
  const sit = section(md, 'Situation judiciaire');
  let situation, etat_actuel;
  const blocs = [...sit.matchAll(/^- \*\*(.+) · (.+?)\*\*(?: \(([^)]*)\))?(?: — (.*))?$((?:\n  - .*)*)/gm)];
  if (blocs.length >= 2) {
    const mk = (b) => ({ label: b[1], titre: b[2], ...(b[3] ? { meta: b[3] } : {}), cat: 'blue', ...(b[4] ? { texte: b[4] } : {}), ...(b[5] ? { lignes: b[5].split('\n').filter(Boolean).map((x) => x.replace(/^\s*- /, '')) } : {}) });
    situation = { decision: mk(blocs[0]), suite: mk(blocs[1]) };
    etat_actuel = [situation.decision.texte, situation.suite.lignes?.[0]].filter(Boolean);
  }
  const faits = /^## Faits publiquement rapportés[^\n]*\n\n([\s\S]*?)\n\n## /m.exec(md)?.[1];
  // réactions
  const reactions = [];
  for (const bloc of section(md, 'Réactions et déclarations attribuées').split(/^- /m).filter((x) => x.startsWith('**'))) {
    const m = /^\*\*(.+?)\*\* — (.+?)(?: · à propos de : (.*?))?\s*\n/.exec(bloc + '\n');
    const cit = [...bloc.matchAll(/> « (.*?) »/g)].map((x) => ({ texte: x[1] }));
    const s = /Source : \[([^\]]+)\]\(([^)]+)\)/.exec(bloc);
    if (m && s) reactions.push({ acteur: m[1], qualite: m[2], ...(m[3] ? { a_propos: m[3] } : {}), citations: cit, source: ref(s[1], s[2]), attribution: 'POSITION_ATTRIBUEE' });
  }
  const inconnues = section(md, 'Inconnues et limites documentaires').split('\n').filter((l) => /^- /.test(l)).map((l) => l.slice(2));
  const attention = section(md, 'Points nécessitant une attention particulière').split('\n').filter((l) => /^- /.test(l)).map((l) => { const m = /^- \*\*(\w+)\*\* · (\w+) — (.*)$/.exec(l); return m ? { niveau: m[1], code: m[2], texte: m[3] } : null; }).filter(Boolean);
  const dossier = { ...(etat_actuel ? { etat_actuel } : {}), appel: false, ...(faits ? { faits } : {}), deroule, inconnues, reactions, ...(situation ? { situation } : {}) };
  return { dossier, sources, attention, empreinte, qualification };
}
