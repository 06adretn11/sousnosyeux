// =====================================================================
// scripts/lib/alias-etablissements.mjs — alias PROPRES d'établissement, par affaire (data/alias-etablissements.json).
//
// Un alias est une autre façon, vérifiée, de nommer la MÊME structure qu'une fiche (« centre de loisirs de Tarnos » pour « Centre de loisirs municipal de Tarnos »).
// Il n'ajoute aucun rattachement par lui-même : le résolveur le traite comme un nom d'établissement, avec ses règles habituelles (commune, rôle). Appliqué à la
// seule veille « sources suivies » (enrichirFiches), jamais à Discovery ni à la Maintenance des affaires.
// =====================================================================
import { readFileSync } from 'node:fs';
import { rattacher } from './etat-affaire.mjs';

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** @returns {Map<string, string[]>} case_id → alias */
export function chargerAlias(chemin) {
  const brut = JSON.parse(readFileSync(chemin, 'utf8'));
  return new Map(Object.entries(brut.alias || {}).map(([id, e]) => [id, (e.alias || []).map(String)]));
}

/** Fiches enrichies du champ `etablissement_alias` (copie ; les autres fiches sont rendues telles quelles). */
export function enrichirFiches(fiches, alias) {
  return fiches.map((f) => (alias.has(f.case_id) ? { ...f, etablissement_alias: alias.get(f.case_id) } : f));
}

/** L'expression exacte (normalisée) figure-t-elle dans le texte ? Rapprochement par EXPRESSION, jamais par mots épars. */
export const expressionPresente = (texte, expression) => ` ${norm(texte)} `.includes(` ${norm(expression)} `);

/**
 * Contrôles d'un registre d'alias contre les fiches :
 *   · la fiche existe ; · l'alias contient la commune de la fiche ; · l'alias n'est pas un simple type de structure ;
 *   · AUCUNE autre fiche ne se rapproche de l'alias (établissement + commune) : l'alias ne désigne qu'une affaire.
 * @returns {string[]} problèmes (vide = conforme)
 */
export function verifierAlias(alias, fiches) {
  const problemes = [];
  for (const [id, liste] of alias) {
    const f = fiches.find((x) => x.case_id === id);
    if (!f) { problemes.push(`${id} : fiche absente`); continue; }
    const commune = norm(String(f.commune || '').replace(/\s+\d+\s*(?:er|e|eme)?$/i, ''));
    for (const a of liste) {
      if (!commune || !norm(a).includes(commune)) problemes.push(`${id} : l'alias « ${a} » ne contient pas la commune « ${f.commune} »`);
      if (norm(a).split(' ').length < 3) problemes.push(`${id} : l'alias « ${a} » est trop court pour désigner une structure`);
      const mots = norm(a).split(' ').filter((w) => w.length > 3);
      for (const autre of fiches.filter((x) => x.case_id !== id)) {
        // (b) l'alias serait aussi un nom acceptable pour l'autre fiche : tous ses mots figurent dans « établissement + commune » de cette fiche
        if (mots.length && mots.every((w) => norm(`${autre.etablissement} ${autre.commune}`).includes(w))) { problemes.push(`${id} : l'alias « ${a} » est aussi un nom possible de ${autre.case_id} (${autre.etablissement}, ${autre.commune})`); continue; }
        // le texte « alias » EST l'alias seul : une autre fiche qui s'y rattacherait (établissement ET commune) serait confondue avec elle
        const r = rattacher({ ...autre, role_mis_en_cause: '' }, a);
        if (r.rattachement !== 'NON_RATTACHABLE') problemes.push(`${id} : l'alias « ${a} » se rapproche aussi de ${autre.case_id} (${autre.etablissement}, ${autre.commune})`);
      }
    }
  }
  return problemes;
}
