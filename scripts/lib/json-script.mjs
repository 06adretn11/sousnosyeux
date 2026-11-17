// Sérialisation JSON destinée à être insérée telle quelle dans un <script> (set:html).
// « < » devient < : une donnée contenant « </script> » ou « <!-- » ne peut plus fermer la balise ni ouvrir un commentaire,
// et JSON.parse restitue exactement la donnée d'origine. Source unique : Layout.astro, accueil, Paris 11e.
export function jsonPourScript(valeur) {
  return JSON.stringify(valeur).replace(/</g, '\\u003c');
}
