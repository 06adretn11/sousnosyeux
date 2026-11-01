// =====================================================================
// scripts/lib/hub-application.mjs — contrat d'application d'une version finale de fiche dont le dossier VIT dans un Hub pilote. Fonctions PURES (aucune écriture).
//
// Un Hub pilote est servi tel que data/hub-matiere/<hub>.json : écrire la version finale d'une fiche, c'est modifier ce fichier. Garanties, vérifiées par test :
//   1. la version finale écrite a EXACTEMENT l'empreinte soumise au GO (et c'est celle de son aperçu) ;
//   2. le dossier actuel du Hub doit être exactement la version publique attendue (`_hub_avant`) : une modification concurrente du dossier refuse l'écrasement ;
//      une ligne sans empreinte « avant » est refusée (échec fermé) ;
//   3. plusieurs lignes autorisées d'un même Hub se cumulent ; un refus ou une exception isole SA ligne seulement ;
//   4. une affaire exclue (exception) garde son contenu public exact, y compris quand d'autres affaires du même Hub sont corrigées ;
//   5. rien d'autre que `dossiers[<id>]` des lignes acceptées ne change dans le Hub (réponses, repères, ordre, autres dossiers).
// =====================================================================
import { hashDossier } from './fiche-page.mjs';

/** Décision pour UNE ligne. @returns {{etat:'a_ecrire'|'deja_appliquee'|'refus', motif?:string, hashFinale?:string, hashHub?:string}} */
export function verifierLigneHub({ finale, hubDossier, hashAutorise, hashAvant }) {
  if (!finale) return { etat: 'refus', motif: 'VERSION_FINALE_ABSENTE' };
  const hashFinale = hashDossier(finale);
  if (hashFinale !== hashAutorise) return { etat: 'refus', motif: 'EMPREINTE_FINALE_DIFFERENTE_DU_MANIFESTE', hashFinale };
  if (!hubDossier) return { etat: 'refus', motif: 'DOSSIER_ABSENT_DU_HUB', hashFinale };
  const hashHub = hashDossier(hubDossier);
  if (hashHub === hashFinale) return { etat: 'deja_appliquee', hashFinale, hashHub };
  if (!hashAvant) return { etat: 'refus', motif: 'EMPREINTE_AVANT_ABSENTE_DU_MANIFESTE', hashFinale, hashHub };
  if (hashHub !== hashAvant) return { etat: 'refus', motif: 'MODIFICATION_CONCURRENTE_DU_DOSSIER_DU_HUB', hashFinale, hashHub };
  return { etat: 'a_ecrire', hashFinale, hashHub };
}

/**
 * Applique les lignes autorisées à une COPIE des Hubs.
 * @param {{hubs: Record<string, {dossiers: Record<string, object>}>, lignes: {id:string, finale:object|null, hashAutorise:string, hashAvant?:string}[], sauf?: Set<string>}} o
 * @returns {{hubs: object, rapport: {id:string, hub:string|null, etat:string, motif?:string}[], modifies: string[]}}
 */
export function appliquerAuxHubs({ hubs, lignes, sauf = new Set() }) {
  const copie = structuredClone(hubs); const rapport = []; const modifies = new Set();
  for (const l of lignes) {
    const hub = Object.keys(copie).find((k) => copie[k]?.dossiers?.[l.id]) ?? null;
    if (!hub) continue; // dossier d'une affaire isolée : circuit habituel (promouvoir-fiche)
    if (sauf.has(l.id)) { rapport.push({ id: l.id, hub, etat: 'exception' }); continue; }
    const v = verifierLigneHub({ finale: l.finale, hubDossier: copie[hub].dossiers[l.id], hashAutorise: l.hashAutorise, hashAvant: l.hashAvant });
    rapport.push({ id: l.id, hub, ...v });
    if (v.etat === 'a_ecrire') { copie[hub].dossiers[l.id] = structuredClone(l.finale); modifies.add(hub); }
  }
  return { hubs: copie, rapport, modifies: [...modifies] };
}
