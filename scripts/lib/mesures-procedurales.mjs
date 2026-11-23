// =====================================================================
// scripts/lib/mesures-procedurales.mjs — table FERMÉE des actes procéduraux sans changement de statut (audit du 21/11/2026) et leur FAMILLE.
// Aucune dépendance : importée par acte-procedural (détection), nouveaute (déduplication au niveau du fait) et le notifier.
//
// Famille : un même fait peut s'écrire sous deux libellés fermés (« interpellée » / « placée en garde à vue » ; « un appel a été formé » /
// « le parquet a fait appel » ; « remise en liberté » / « …sous contrôle judiciaire »). Deux libellés d'une même famille ne sont UN seul fait que si
// l'un des deux est le libellé GÉNÉRIQUE de la famille : « le parquet a fait appel » et « la défense a fait appel » restent deux faits.
// =====================================================================
const MOIS_LIB = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const dateLisible = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS_LIB[Number(m[2]) - 1]} ${m[1]}` : null; };

export const LIB = {
  garde_a_vue: { réalisée: 'Selon la presse, la personne mise en cause a été placée en garde à vue.' },
  interpellation: { réalisée: 'Selon la presse, la personne mise en cause a été interpellée.' },
  presentation_sans_mise_en_examen: { réalisée: 'Selon la presse, la personne mise en cause a été présentée à un juge, qui ne l’a pas mise en examen à ce stade.' },
  non_mise_en_examen: { réalisée: 'Selon la presse, la personne mise en cause n’a pas été mise en examen à ce stade.' },
  appel_parquet: { réalisée: 'Selon la presse, le parquet a fait appel de la décision.', annoncée: 'Selon la presse, le parquet a annoncé son intention de faire appel de la décision.' },
  appel_défense: { réalisée: 'Selon la presse, la défense a fait appel de la décision.', annoncée: 'Selon la presse, la défense a annoncé son intention de faire appel de la décision.' },
  appel: { réalisée: 'Selon la presse, un appel a été formé contre la décision.', annoncée: 'Selon la presse, un appel a été annoncé contre la décision.' },
  detention_provisoire: { réalisée: 'Selon la presse, la personne mise en cause a été placée en détention provisoire.' },
  remise_en_liberte: { réalisée: 'Selon la presse, la personne mise en cause a été remise en liberté.' },
  remise_en_liberte_controle: { réalisée: 'Selon la presse, la personne mise en cause a été remise en liberté sous contrôle judiciaire.' },
  audience_annoncee: { annoncée: 'Selon la presse, une audience est annoncée.' },
};
export const TYPE = { garde_a_vue: 'garde_à_vue', interpellation: 'garde_à_vue', presentation_sans_mise_en_examen: 'mesure_procédurale', non_mise_en_examen: 'mesure_procédurale',
  appel_parquet: 'voie_de_recours', appel_défense: 'voie_de_recours', appel: 'voie_de_recours', detention_provisoire: 'mesure_procédurale', remise_en_liberte: 'mesure_procédurale',
  remise_en_liberte_controle: 'mesure_procédurale', audience_annoncee: 'audience' };
export const MESURES_PROCEDURALES = Object.freeze(Object.keys(LIB));

export const FAMILLE = { garde_a_vue: 'privation', interpellation: 'privation', presentation_sans_mise_en_examen: 'non_mee', non_mise_en_examen: 'non_mee',
  appel_parquet: 'appel', appel_défense: 'appel', appel: 'appel', detention_provisoire: 'detention', remise_en_liberte: 'liberte', remise_en_liberte_controle: 'liberte', audience_annoncee: 'audience' };
/** Libellé générique d'une famille : compatible avec tout libellé plus précis de la même famille. */
export const GENERIQUE = new Set(['interpellation', 'non_mise_en_examen', 'appel', 'remise_en_liberte']);
export const familleDeMesure = (m) => FAMILLE[m] || null;
/** Deux mesures désignent-elles UN fait ? Même mesure, ou même famille dont l'une est générique. */
export function memeMesure(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return FAMILLE[a] === FAMILLE[b] && (GENERIQUE.has(a) || GENERIQUE.has(b));
}
const PAR_LIBELLE = Object.entries(LIB).flatMap(([mesure, parReal]) => Object.values(parReal).map((l) => [l.replace(/\.$/, ''), mesure]));
/** Mesure fermée portée par un libellé public (celui du circuit, avec ou sans date ajoutée), ou null. */
export function mesureDeLibelle(libelle) {
  const l = String(libelle || '');
  return PAR_LIBELLE.find(([t]) => l === `${t}.` || l.startsWith(`${t} le `))?.[1] || null;
}
