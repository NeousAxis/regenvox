// Exécuteur des requêtes d'agents par API (remplace les sous-agents de développement).
// Lit les requêtes en attente d'une étape, appelle le fournisseur choisi, écrit les réponses brutes.
// La validation reste celle de l'Administrateur : lancer `cli.ts ingest` ensuite.
// Usage : npx tsx src/runner.ts <run> <étape> [--fournisseur anthropic|mistral|openai] [--parallele 6] [--essai]
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Mistral } from "@mistralai/mistralai";
import { reqPath, respPath, readJson, exists, journal } from "./store.js";

export { appelAnthropic, appelMistral, type Tier, type Fournisseur, type Requete, type Resultat } from "./appels.js";
import { appelAnthropic, appelMistral, appelOpenAI, modelesOpenAI, type Fournisseur, type Requete } from "./appels.js";

function enAttente(runId: string, step: string): Requete[] {
  const dir = path.dirname(reqPath(runId, step, "x"));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Requete>(path.join(dir, f)))
    .filter((r) => !exists(respPath(runId, step, r.item)));
}

// Exécute au plus `n` appels en parallèle.
async function parallele<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await f(items[i++]);
  }));
}

export async function executer(runId: string, step: string, fournisseur: Fournisseur, n: number, essai: boolean, options: { baseURL?: string } = {}) {
  const requetes = enAttente(runId, step);
  const caracteres = requetes.reduce((s, r) => s + r.system.length + r.user.length, 0);
  console.log(`${requetes.length} requête(s) en attente pour ${runId}/${step}, environ ${Math.round(caracteres / 3.5)} jetons d'entrée.`);
  if (essai || requetes.length === 0) return { ok: 0, echecs: 0 };
  const anthropic = fournisseur === "anthropic" ? new Anthropic({ maxRetries: 4, timeout: 10 * 60 * 1000, ...(options.baseURL ? { baseURL: options.baseURL } : {}) }) : null;
  const mistral = fournisseur === "mistral" ? new Mistral({ apiKey: process.env.MISTRAL_API_KEY ?? "", ...(options.baseURL ? { serverURL: options.baseURL } : {}) }) : null;
  const modelesOA = fournisseur === "openai" ? await modelesOpenAI(process.env.OPENAI_API_KEY ?? "") : null;
  let ok = 0, echecs = 0;
  await parallele(requetes, n, async (r) => {
    const debut = Date.now();
    try {
      const res = modelesOA ? await appelOpenAI(process.env.OPENAI_API_KEY ?? "", modelesOA, r.model, r) : anthropic ? await appelAnthropic(anthropic, r.model, r) : await appelMistral(mistral!, r.model, r);
      fs.mkdirSync(path.dirname(respPath(runId, step, r.item)), { recursive: true });
      fs.writeFileSync(respPath(runId, step, r.item), res.texte, "utf8");
      journal(runId, { event: "appel_api", step, item: r.item, fournisseur, modele: res.modele, repli: res.repli, tokens_entree: res.tokens_entree, tokens_sortie: res.tokens_sortie, duree_ms: Date.now() - debut });
      ok++;
    } catch (e) {
      // Erreurs typées du SDK : 429 et 5xx sont déjà réessayées par le client, le reste est journalisé pour reprise.
      const statut = e instanceof Anthropic.APIError ? e.status : undefined;
      journal(runId, { event: "appel_api_echec", step, item: r.item, fournisseur, statut, erreur: (e as Error).message });
      console.error(`Échec ${r.item} : ${(e as Error).message}`);
      echecs++;
    }
  });
  console.log(`Terminé : ${ok} réponse(s) écrite(s), ${echecs} échec(s). Lancer ensuite : npx tsx src/cli.ts ingest ${runId} ${step}`);
  return { ok, echecs };
}

if (typeof process !== "undefined" && path.basename(process.argv?.[1] ?? "") === "runner.ts") {
  const [, , runId, step, ...reste] = process.argv;
  const opt = (nom: string) => {
    const i = reste.indexOf(nom);
    return i >= 0 ? reste[i + 1] : undefined;
  };
  const fournisseur = (opt("--fournisseur") ?? "mistral") as Fournisseur;
  if (!runId || !step || !["anthropic", "mistral", "openai"].includes(fournisseur)) {
    console.log("Usage : npx tsx src/runner.ts <run> <étape> [--fournisseur anthropic|mistral|openai] [--parallele 6] [--essai]");
    process.exit(1);
  }
  const essai = reste.includes("--essai");
  if (!essai && fournisseur === "openai" && !process.env.OPENAI_API_KEY) {
    console.error("Clé manquante : définir OPENAI_API_KEY (platform.openai.com).");
    process.exit(1);
  }
  if (!essai && fournisseur === "mistral" && !process.env.MISTRAL_API_KEY) {
    console.error("Clé manquante : définir MISTRAL_API_KEY (console.mistral.ai).");
    process.exit(1);
  }
  executer(runId, step, fournisseur, parseInt(opt("--parallele") ?? "6", 10), essai).catch((e) => {
    console.error("ERREUR :", e.message);
    process.exit(1);
  });
}
