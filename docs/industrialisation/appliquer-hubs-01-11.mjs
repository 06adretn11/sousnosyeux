// =====================================================================
// APPLICATION DES VERSIONS FINALES AUX DOSSIERS DE HUB — À EXÉCUTER SEULEMENT APRÈS LE GO COLLECTIF D'ADRIEN (REVUE_GLOBALE_STOCK_2.md, section 0).
//
// Un Hub pilote est servi tel que `data/hub-matiere/<hub>.json` : corriger la fiche d'une affaire dont le dossier y vit, c'est écrire le dossier corrigé dans ce fichier
// (le Hub reflète alors la correction). `promouvoir-fiche.mjs` refuse volontairement d'écraser un dossier de Hub ; ce script est le seul chemin, limité aux lignes AUTORISÉES
// du manifeste. Contrat (scripts/lib/hub-application.mjs, démontré par scripts/qa/test-appliquer-hubs.mjs) : empreinte de la version finale = manifeste ; dossier actuel du Hub =
// `_hub_avant` (sinon refus : modification concurrente) ; lignes cumulées ; un refus ou une exception n'isole que sa ligne ; rien d'autre que ces dossiers n'est écrit.
//
//   node docs/industrialisation/appliquer-hubs-01-11.mjs --liste=ids-go-correction-01-11.json            # plan (aucune écriture)
//   node docs/industrialisation/appliquer-hubs-01-11.mjs --liste=ids-go-correction-01-11.json --ecrire   # après le GO ; --sauf=ID,ID pour des exceptions
// Code de sortie 1 s'il y a au moins un refus (les lignes acceptées sont écrites quand même : un refus n'en bloque aucune autre). Ensuite : go-lot-24-10.mjs --liste=… --ecrire.
// =====================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { appliquerAuxHubs } from '../../scripts/lib/hub-application.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const liste = (A.find((a) => a.startsWith('--liste=')) ?? '--liste=ids-go-correction-01-11.json').slice(8);
const SAUF = new Set(((A.find((a) => a.startsWith('--sauf=')) ?? '').slice(7)).split(',').filter(Boolean));
const J = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const man = J(`./${liste}`); const avant = man._hub_avant ?? {};
const ids = Object.keys(man).filter((k) => !k.startsWith('_'));
const fichiers = readdirSync(new URL('../../data/hub-matiere/', import.meta.url)).filter((x) => x.endsWith('.json') && x !== 'isoles.json');
const hubs = Object.fromEntries(fichiers.map((f) => [f, J(`../../data/hub-matiere/${f}`)]));
const lignes = ids.map((id) => { const p = `./dossiers-finaux/${id}.json`; return { id, finale: existsSync(new URL(p, import.meta.url)) ? J(p) : null, hashAutorise: man[id], hashAvant: avant[id] }; });
const { hubs: apres, rapport, modifies } = appliquerAuxHubs({ hubs, lignes, sauf: SAUF });
let refus = 0;
for (const r of rapport) {
  if (r.etat === 'refus') { refus++; console.log(`· ${r.id} (${r.hub}) : REFUS — ${r.motif}${r.hashHub ? ` (dossier du Hub ${r.hashHub})` : ''}`); }
  else if (r.etat === 'exception') console.log(`· ${r.id} (${r.hub}) : EXCEPTION demandée — non appliquée, contenu public conservé`);
  else if (r.etat === 'deja_appliquee') console.log(`· ${r.id} (${r.hub}) : déjà appliquée`);
  else console.log(`· ${r.id} (${r.hub}) : ${r.hashHub} → ${r.hashFinale}${ECRIRE ? '' : ' (à écrire)'}`);
}
if (ECRIRE) for (const f of modifies) {
  const chemin = new URL(`../../data/hub-matiere/${f}`, import.meta.url);
  const crlf = readFileSync(chemin, 'utf8').includes('\r\n'); // le fichier garde ses fins de ligne : le diff ne porte que sur les dossiers concernés
  const texte = JSON.stringify(apres[f], null, 2) + '\n';
  writeFileSync(chemin, crlf ? texte.replace(/\n/g, '\r\n') : texte, 'utf8'); console.log(`✅ ${f} écrit (dossiers acceptés seulement)`);
}
if (refus) console.log(`⚠ ${refus} ligne(s) refusée(s) : à isoler (exception) ; les autres lignes ne sont pas bloquées`);
process.exit(refus ? 1 : 0);
