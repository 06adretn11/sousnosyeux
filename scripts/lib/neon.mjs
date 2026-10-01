// =====================================================================
// scripts/lib/neon.mjs — accès à la base SNY (Neon)
//
// La mémoire SousNosYeux vit dans Neon depuis le 10/09/2026
// (voir docs/industrialisation/PREFLIGHT_NEON.md). Le projet Supabase
// d'origine n'existe plus : son hôte ne résout pas.
//
// ---------------------------------------------------------------------
// POURQUOI LE DRIVER HTTP, ET PAS `pg`
// ---------------------------------------------------------------------
// Depuis un poste Cdiscount, le protocole Postgres ne sort pas : le SYN TCP
// sur 5432 est accepté par le middlebox Cato/PEAKSYS, puis la trame
// `SSLRequest` reste sans réponse (relevé dans le RUNBOOK du dépôt
// `sousnosyeux-migration`). Le port 443, lui, passe — avec interception TLS.
//
// `@neondatabase/serverless` parle à Neon en HTTPS sur 443. C'est ce qui
// permet à ce dépôt d'écrire dans Neon directement, sans passer par un
// runner GitHub.
//
// Conséquence de l'interception TLS : le certificat est re-signé par une CA
// absente du trust store Node. Les scripts exigent donc
// `NODE_TLS_REJECT_UNAUTHORIZED=0` sur ce poste — contournement local, jamais
// en CI. Le correctif propre est `NODE_EXTRA_CA_CERTS` pointant sur la CA
// d'entreprise.
// =====================================================================

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Charge .env.local sans dépendance (mêmes règles que les autres scripts). */
export function chargerEnv() {
  const f = resolve(ROOT, '.env.local');
  if (!existsSync(f)) return {};
  const out = {};
  for (const ligne of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const l = ligne.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 0) continue;
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export const VAR_ATTENDUE = 'NEON_DATABASE_URL';

/**
 * Message d'aide unique, affiché quand la connection string manque.
 * Il ne demande jamais de coller la valeur dans un chat ou un terminal :
 * elle s'écrit dans `.env.local`, qui est déjà couvert par `.gitignore`.
 */
export const AIDE_CONNEXION = `
  ${VAR_ATTENDUE} est absente de .env.local.

  Où la trouver : console Neon -> projet SousNosYeux -> branche
  « migration-clean » -> Connection string. Prendre l'endpoint DIRECT
  (pas le « -pooler »).

  L'ajouter à .env.local (fichier déjà gitignoré) :

      ${VAR_ATTENDUE}=postgresql://<user>:<mdp>@ep-....aws.neon.tech/neondb?sslmode=require

  La valeur ne peut pas être récupérée depuis le secret GitHub
  NEON_TARGET_URL : GitHub ne restitue jamais la valeur d'un secret.
  La console Neon en est la seule source.
`;

/** Masque une connection string pour l'affichage : jamais d'identifiants en clair. */
export function masquer(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//***@${u.hostname}${u.pathname}`;
  } catch {
    return '(illisible)';
  }
}

/**
 * Ouvre l'accès à Neon.
 * @returns {{sql: Function, url: string, host: string}}
 */
export function connecter({ env = null } = {}) {
  const e = env || { ...chargerEnv(), ...process.env };
  // `chargerEnv()` ne faisait que RETOURNER les paires de .env.local :
  // seul NEON_DATABASE_URL était consommé ici, et les autres clés du
  // fichier — OPENROUTER_API_KEY notamment — n'atteignaient jamais
  // process.env. Tout script appelant un modèle après `connecter()`
  // échouait donc sur « clé absente » alors que la clé était bien là.
  // On publie sans jamais écraser une variable déjà définie.
  for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
  const url = e[VAR_ATTENDUE];
  if (!url) {
    const err = new Error(`${VAR_ATTENDUE} manquante`);
    err.aide = AIDE_CONNEXION;
    err.code = 'NEON_URL_ABSENTE';
    throw err;
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    const err = new Error(`${VAR_ATTENDUE} ne ressemble pas à une URL Postgres`);
    err.code = 'NEON_URL_INVALIDE';
    throw err;
  }
  if (/-pooler\./.test(url)) {
    // Toléré en lecture/écriture simple, mais signalé : le pooler Neon est en
    // mode transaction et casse les opérations multi-instructions.
    console.warn('  ⚠ endpoint « -pooler » détecté : préférer l’endpoint direct.');
  }

  let host = '(inconnu)';
  try {
    host = new URL(url).hostname;
  } catch {
    /* déjà validé au-dessus */
  }

  return { sql: neon(url), url, host };
}

/** Vrai si le poste a besoin du contournement TLS (proxy à interception). */
export function tlsContourne() {
  return process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';
}
