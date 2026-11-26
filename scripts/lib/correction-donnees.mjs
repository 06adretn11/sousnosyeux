// =====================================================================
// scripts/lib/correction-donnees.mjs — garde-fous d'une CORRECTION DE DONNÉES appliquée à Neon par la CI (workflow sny-correction-donnees).
//
// Fonctions PURES (testées sans base ni réseau). Principe : fermé par défaut.
//   · le fichier est une migration du dépôt, nommée NNN_xxx.sql, dans supabase/migrations/ — jamais un chemin libre ;
//   · la confirmation est « GO-NNN » avec le numéro du fichier ;
//   · seules sont admises des instructions INSERT / UPDATE sur cases, sources, reviews ; tout UPDATE porte un WHERE ;
//   · refusés : DELETE, DROP, TRUNCATE, ALTER, CREATE, GRANT, COPY, et tout UPDATE qui assigne publication_status (la publication a son propre acte : publier-affaire).
// L'écriture se fait dans UNE transaction : tout ou rien.
// =====================================================================
import { decouperInstructions } from './relais-social.mjs';

export const NOM_MIGRATION = /^(\d{3})_[a-z0-9_]{3,80}\.sql$/;
const TABLES = ['cases', 'sources', 'reviews'];
export const MAX_INSTRUCTIONS = 30;

/** → { ok, numero, raison } : le nom doit être exactement celui d'un fichier de supabase/migrations (aucun séparateur de chemin). */
export function validerNom(nom) {
  const m = NOM_MIGRATION.exec(String(nom ?? ''));
  return m ? { ok: true, numero: m[1] } : { ok: false, raison: 'nom attendu : NNN_description.sql (supabase/migrations), sans chemin' };
}

/** La confirmation doit être exactement « GO-NNN » avec le numéro du fichier. */
export const confirmationValide = (confirmation, numero) => typeof confirmation === 'string' && confirmation === `GO-${numero}`;

/** Une instruction est admise ou refusée avec une raison. */
export function jugerInstruction(ins) {
  const s = String(ins).replace(/\s+/g, ' ').trim();
  const insertion = new RegExp(`^insert into (${TABLES.join('|')})\\b`, 'i').exec(s);
  if (insertion) return { ok: true, type: 'insert', table: insertion[1].toLowerCase() };
  const miseAJour = new RegExp(`^update (${TABLES.join('|')})\\b`, 'i').exec(s);
  if (miseAJour) {
    if (!/\bwhere\b/i.test(s)) return { ok: false, raison: 'UPDATE sans WHERE' };
    if (/\bpublication_status\s*=/i.test(s.replace(/\bwhere\b[\s\S]*$/i, ''))) return { ok: false, raison: 'assignation de publication_status refusée (acte distinct : publier-affaire)' };
    return { ok: true, type: 'update', table: miseAJour[1].toLowerCase() };
  }
  const tete = s.split(' ').slice(0, 2).join(' ').toLowerCase();
  return { ok: false, raison: `instruction non admise (${tete})` };
}

/** → { ok, instructions, refus[], resume } pour le texte d'un fichier SQL. */
export function preparer(texte) {
  const instructions = decouperInstructions(texte);
  const refus = [];
  const resume = { insert: 0, update: 0 };
  if (!instructions.length) refus.push('aucune instruction');
  if (instructions.length > MAX_INSTRUCTIONS) refus.push(`plus de ${MAX_INSTRUCTIONS} instructions`);
  for (const [i, ins] of instructions.entries()) {
    const j = jugerInstruction(ins);
    if (!j.ok) refus.push(`instruction ${i + 1} : ${j.raison}`);
    else resume[j.type]++;
  }
  return { ok: refus.length === 0, instructions, refus, resume };
}
