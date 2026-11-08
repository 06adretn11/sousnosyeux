// Vérification de TOUTES les fiches approuvées courantes contre le site servi (sans état, sans journal, rejouable : une version est « vérifiée »
// quand la page servie porte la version AUTORISÉE actuelle, et seulement alors).
//
// Appelée à chaque passage du circuit (reconcilier-publication.mjs --site), y compris quand la liste des modifications à projeter est vide :
// une mise à jour dont le déploiement a tardé reste donc revérifiée jusqu'à confirmation. Si la version attendue a été supplantée entre-temps,
// c'est la NOUVELLE version attendue qui est contrôlée ; l'ancienne n'est jamais déclarée publiée. Aucune confirmation Telegram ici.
import { ecartsFiche } from './ecarts-site.mjs';

/**
 * @param {{ids: string[], evenements: object, dossierDe: (id:string)=>object|null|undefined,
 *          lirePage: (id:string)=>Promise<{ok:boolean, status?:number, html?:string}>, concurrence?: number}} o
 * @returns {Promise<{conformes: string[], enAttente: {id: string, ecarts: string[]}[]}>}
 */
export async function verifierFichesCourantes({ ids, evenements, dossierDe, lirePage, concurrence = 6 }) {
  const resultats = new Map();
  const file = [...ids];
  const travailleur = async () => {
    for (let id = file.shift(); id !== undefined; id = file.shift()) {
      try {
        const p = await lirePage(id);
        resultats.set(id, p.ok ? ecartsFiche(p.html, id, { evenements, dossier: dossierDe(id) }) : [`fiche ${id} : HTTP ${p.status ?? '?'}`]);
      } catch {
        resultats.set(id, [`fiche ${id} : site injoignable`]); // un site injoignable ne vaut jamais « vérifié »
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrence, ids.length)) }, travailleur));
  return {
    conformes: ids.filter((id) => (resultats.get(id) || ['non tenté']).length === 0),
    enAttente: ids.filter((id) => (resultats.get(id) || ['non tenté']).length > 0).map((id) => ({ id, ecarts: resultats.get(id) || ['non tenté'] })),
  };
}
