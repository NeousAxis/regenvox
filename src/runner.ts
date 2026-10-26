// Exécuteur des requêtes d'agents par API (remplace les sous-agents de développement).
// Lit les requêtes en attente d'une étape, appelle le fournisseur choisi, écrit les réponses brutes.
// La validation reste celle de l'Administrateur : lancer `cli.ts ingest` ensuite.
// Usage : npx tsx src/runner.ts <run> <étape> [--fournisseur anthropic|mistral] [--parallele 6] [--essai]
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Mistral } from "@mistralai/mistralai";
import { ROOT, reqPath, respPath, readJson, exists, journal } from "./store.js";

type Tier = "opus" | "sonnet" | "haiku";
type Fournisseur = "anthropic" | "mistral";
interface Requete { step: string; item: string; model: Tier; attempt: number; system: string; user: string; response_path: string }
interface Resultat { texte: string; tokens_entree: number; tokens_sortie: number; modele: string; repli?: string }

const CONFIG = readJson<Record<Fournisseur, Record<Tier, string>>>(path.join(ROOT, "fournisseurs.json"));
// Profondeur de réflexion par niveau d'agent : les personas répondent vite, les analystes réfléchissent.
const EFFORT: Record<Tier, "low" | "medium" | "high"> = { haiku: "low", sonnet: "medium", opus: "high" };

export async function appelAnthropic(client: Anthropic, tier: Tier, r: Requete): Promise<Resultat> {
  const model = CONFIG.anthropic[tier];
  // Repli automatique sur refus de sécurité pour Opus et Sonnet (non disponible pour Haiku).
  const repli = tier === "haiku" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    output_config: { effort: EFFORT[tier] },
    system: r.system,
    messages: [{ role: "user", content: r.user }],
    ...repli,
  });
  if (res.stop_reason === "refusal") throw new Error(`refus du modèle (${res.stop_details?.category ?? "sans catégorie"})`);
  if (res.stop_reason === "max_tokens") throw new Error("réponse tronquée (max_tokens atteint)");
  const texte = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const repliUtilise = (res.usage.iterations ?? []).some((e) => e.type === "fallback_message");
  return { texte, tokens_entree: res.usage.input_tokens, tokens_sortie: res.usage.output_tokens, modele: res.model, repli: repliUtilise ? res.model : undefined };
}

export async function appelMistral(client: Mistral, tier: Tier, r: Requete): Promise<Resultat> {
  const model = CONFIG.mistral[tier];
  const res = await client.chat.complete({
    model,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: r.system },
      { role: "user", content: r.user },
    ],
  });
  const choix = res.choices?.[0];
  if (choix?.finishReason === "length") throw new Error("réponse tronquée (longueur maximale atteinte)");
  const contenu = choix?.message?.content;
  const texte = typeof contenu === "string" ? contenu : (contenu ?? []).map((c: any) => c.text ?? "").join("");
  return { texte, tokens_entree: res.usage?.promptTokens ?? 0, tokens_sortie: res.usage?.completionTokens ?? 0, modele: res.model ?? model };
}

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
  let ok = 0, echecs = 0;
  await parallele(requetes, n, async (r) => {
    const debut = Date.now();
    try {
      const res = anthropic ? await appelAnthropic(anthropic, r.model, r) : await appelMistral(mistral!, r.model, r);
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

if (path.basename(process.argv[1] ?? "") === "runner.ts") {
  const [, , runId, step, ...reste] = process.argv;
  const opt = (nom: string) => {
    const i = reste.indexOf(nom);
    return i >= 0 ? reste[i + 1] : undefined;
  };
  const fournisseur = (opt("--fournisseur") ?? "mistral") as Fournisseur;
  if (!runId || !step || !["anthropic", "mistral"].includes(fournisseur)) {
    console.log("Usage : npx tsx src/runner.ts <run> <étape> [--fournisseur anthropic|mistral] [--parallele 6] [--essai]");
    process.exit(1);
  }
  const essai = reste.includes("--essai");
  if (!essai && fournisseur === "mistral" && !process.env.MISTRAL_API_KEY) {
    console.error("Clé manquante : définir MISTRAL_API_KEY (console.mistral.ai).");
    process.exit(1);
  }
  executer(runId, step, fournisseur, parseInt(opt("--parallele") ?? "6", 10), essai).catch((e) => {
    console.error("ERREUR :", e.message);
    process.exit(1);
  });
}
