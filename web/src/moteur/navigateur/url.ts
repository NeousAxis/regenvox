// Remplace node:url dans le navigateur : le moteur calcule sa racine à partir de l'adresse de store.ts,
// on la fixe à /moteur dans le système de fichiers en mémoire.
export const fileURLToPath = (_u: string | URL) => "/moteur/src/store.ts";
export default { fileURLToPath };
