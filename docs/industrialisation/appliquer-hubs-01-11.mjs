// =====================================================================
// APPLICATION DES VERSIONS FINALES AUX DOSSIERS DE HUB — À EXÉCUTER SEULEMENT APRÈS LE GO COLLECTIF D'ADRIEN (REVUE_GLOBALE_STOCK_2.md, section 0).
//
// Pourquoi : une fiche dont le dossier VIT dans un Hub (Paris 11e, Bordeaux/Gironde, Hautes-Alpes, Landes) est lue par la page depuis ce Hub ; le Hub pilote est servi tel que
// `data/hub-matiere/<hub>.json`. Corriger la fiche, c'est donc écrire le dossier corrigé dans ce fichier : le Hub reflète alors la correction. Le circuit des affaires isolées
// (promouvoir-fiche.mjs) refuse volontairement d'écraser un dossier de Hub ; ce script est le seul chemin, limité aux lignes AUTORISÉES du manifeste, et il vérifie :
//   - l'empreinte de la version finale (docs/industrialisation/dossiers-finaux/<ID>.json) = celle du manifeste ;
//   - l'empreinte actuelle du dossier du Hub = `_hub_avant[<ID>]` du manifeste (la version publique approuvée : rien d'autre n'a bougé entretemps).
// Il n'écrit AUCUN autre champ du Hub (réponses, repères, ordre, autres dossiers).
//
//   node docs/industrialisation/appliquer-hubs-01-11.mjs --liste=ids-go-correction-01-11.json            # plan (aucune écriture)
//   node docs/industrialisation/appliquer-hubs-01-11.mjs --liste=ids-go-correction-01-11.json --ecrire   # après le GO ; ajouter --sauf=ID,ID pour une exception
// Ensuite : go-lot-24-10.mjs --liste=… --ecrire (approbations des empreintes), project-public / project-evenements, QA, PR, vérification du contenu servi.
// =====================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { hashDossier } from '../../scripts/lib/fiche-page.mjs';

const A = process.argv.slice(2);
const ECRIRE = A.includes('--ecrire');
const liste = (A.find((a) => a.startsWith('--liste=')) ?? '--liste=ids-go-correction-01-11.json').slice(8);
const SAUF = new Set(((A.find((a) => a.startsWith('--sauf=')) ?? '').slice(7)).split(',').filter(Boolean));
const J = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const man = J(`./${liste}`); const avant = man._hub_avant ?? {};
const ids = Object.keys(man).filter((k) => !k.startsWith('_'));
const hubs = {}; for (const f of readdirSync(new URL('../../data/hub-matiere/', import.meta.url)).filter((x) => x.endsWith('.json') && x !== 'isoles.json')) hubs[f] = J(`../../data/hub-matiere/${f}`);
let ko = 0; const modifies = new Set();
for (const id of ids) {
  const f = Object.keys(hubs).find((k) => hubs[k].dossiers?.[id]);
  if (!f) continue; // dossier d'une affaire isolée : circuit habituel (promouvoir-fiche.mjs)
  if (SAUF.has(id)) { console.log(`· ${id} (${f}) : EXCEPTION demandée — non appliquée`); continue; }
  const p = `./dossiers-finaux/${id}.json`;
  if (!existsSync(new URL(p, import.meta.url))) { console.log(`· ${id} : REFUS — version finale absente (${p})`); ko++; continue; }
  const finale = J(p); const hF = hashDossier(finale); const hA = hashDossier(hubs[f].dossiers[id]);
  if (hF !== man[id]) { console.log(`· ${id} : REFUS — empreinte de la version finale ${hF} ≠ manifeste ${man[id]}`); ko++; continue; }
  if (avant[id] && hA !== avant[id] && hA !== hF) { console.log(`· ${id} : REFUS — le dossier du Hub (${hA}) n'est plus la version publique attendue (${avant[id]}) : changement concurrent`); ko++; continue; }
  console.log(`· ${id} (${f}) : ${hA} → ${hF}${hA === hF ? ' (déjà appliquée)' : ECRIRE ? '' : ' (à écrire)'}`);
  if (hA === hF) continue;
  hubs[f].dossiers[id] = finale; modifies.add(f);
}
if (ECRIRE && !ko) for (const f of modifies) {
  const chemin = new URL(`../../data/hub-matiere/${f}`, import.meta.url);
  const crlf = readFileSync(chemin, 'utf8').includes('\r\n'); // le fichier garde ses fins de ligne : le diff ne porte que sur les dossiers concernés
  const texte = JSON.stringify(hubs[f], null, 2) + '\n';
  writeFileSync(chemin, crlf ? texte.replace(/\n/g, '\r\n') : texte, 'utf8'); console.log(`✅ ${f} écrit (dossiers concernés seulement)`);
}
else if (ECRIRE && ko) console.log(`⛔ ${ko} refus : rien n'est écrit (corriger ou passer en exception avec --sauf=)`);
process.exit(ko ? 1 : 0);
