// Appels aux fournisseurs d'IA, partagés par l'exécuteur en ligne de commande et par la plateforme (navigateur).
// N'importe pas le SDK Mistral : le client est typé par sa seule méthode utile, ce qui permet au navigateur
// d'en fournir un minimal (le SDK complet embarque des modules propres à Node).
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { ROOT, readJson } from "./store.js";

export type Tier = "opus" | "sonnet" | "haiku";
export type Fournisseur = "anthropic" | "mistral" | "openai" | "autre";
export interface Requete { step: string; item: string; model: Tier; attempt: number; system: string; user: string; response_path: string }
export interface Resultat { texte: string; tokens_entree: number; tokens_sortie: number; modele: string; repli?: string }

// Lu au premier appel : dans le navigateur, le fichier n'existe qu'une fois le système de fichiers en mémoire rempli.
// OpenAI : une liste de modèles par ordre de préférence, le premier accessible avec la clé de l'utilisateur est retenu.
interface Config { anthropic: Record<Tier, string>; mistral: Record<Tier, string>; openai: Record<Tier, string[]> }
let config: Config | undefined;
const CONFIG_DE = () => (config ??= readJson<Config>(path.join(ROOT, "fournisseurs.json")));
// Profondeur de réflexion par niveau d'agent : les personas répondent vite, les analystes réfléchissent.
const EFFORT: Record<Tier, "low" | "medium" | "high"> = { haiku: "low", sonnet: "medium", opus: "high" };

export async function appelAnthropic(client: Anthropic, tier: Tier, r: Requete): Promise<Resultat> {
  const model = CONFIG_DE().anthropic[tier];
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

export interface ClientMistral { chat: { complete(req: any): Promise<any> } }

export async function appelMistral(client: ClientMistral, tier: Tier, r: Requete): Promise<Resultat> {
  const model = CONFIG_DE().mistral[tier];
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

// OpenAI, par appel HTTP direct (API Responses), utilisable en ligne de commande comme dans le navigateur.
const OPENAI = "https://api.openai.com/v1";

async function openai(cle: string, chemin: string, corps?: unknown): Promise<any> {
  for (let essai = 0; ; essai++) {
    const r = await fetch(`${OPENAI}${chemin}`, { method: corps ? "POST" : "GET", headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && essai < 4) {
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** essai));
      continue;
    }
    const texte = await r.text();
    throw Object.assign(new Error(`OpenAI : erreur ${r.status} ${texte.slice(0, 300)}`), { status: r.status, corps: texte });
  }
}

// Modèles retenus pour cette clé, un par niveau d'agent, parmi ceux que la clé donne le droit d'utiliser.
export async function modelesOpenAI(cle: string): Promise<Record<Tier, string>> {
  const liste = await openai(cle, "/models");
  const dispo = new Set<string>((liste.data ?? []).map((m: any) => m.id));
  const choix = {} as Record<Tier, string>;
  for (const tier of ["opus", "sonnet", "haiku"] as Tier[]) {
    const m = CONFIG_DE().openai[tier].find((x) => dispo.has(x));
    if (!m) throw new Error(`Aucun modèle OpenAI adapté n'est accessible avec cette clé (niveau ${tier}).`);
    choix[tier] = m;
  }
  return choix;
}

export async function appelOpenAI(cle: string, modeles: Record<Tier, string>, tier: Tier, r: Requete): Promise<Resultat> {
  const model = modeles[tier];
  const corps: any = { model, instructions: r.system, input: r.user, text: { format: { type: "json_object" } }, reasoning: { effort: EFFORT[tier] }, max_output_tokens: 16000 };
  let res: any;
  try {
    res = await openai(cle, "/responses", corps);
  } catch (e: any) {
    // Modèle sans réglage de réflexion : on renvoie la même demande sans ce réglage.
    if (e.status !== 400 || !/reasoning/i.test(e.corps ?? "")) throw e;
    delete corps.reasoning;
    res = await openai(cle, "/responses", corps);
  }
  if (res.status === "incomplete") throw new Error(`réponse incomplète (${res.incomplete_details?.reason ?? "raison inconnue"})`);
  const texte = (res.output ?? []).flatMap((o: any) => (o.type === "message" ? o.content ?? [] : [])).map((c: any) => (c.type === "output_text" ? c.text : c.type === "refusal" ? "" : "")).join("");
  if (!texte) throw new Error("réponse vide ou refus du modèle");
  return { texte, tokens_entree: res.usage?.input_tokens ?? 0, tokens_sortie: res.usage?.output_tokens ?? 0, modele: res.model ?? model };
}

// Autres modèles (DeepSeek, Kimi, Qwen, Meta, OpenRouter...) : toute API compatible avec celle d'OpenAI
// (Chat Completions). L'adresse et les modèles sont choisis par l'utilisateur.
async function compatible(adresse: string, cle: string, chemin: string, corps?: unknown): Promise<any> {
  const base = adresse.replace(/\/+$/, "");
  for (let essai = 0; ; essai++) {
    const r = await fetch(`${base}${chemin}`, { method: corps ? "POST" : "GET", headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && essai < 4) {
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** essai));
      continue;
    }
    const texte = await r.text();
    throw Object.assign(new Error(`Erreur ${r.status} du service : ${texte.slice(0, 300)}`), { status: r.status, corps: texte });
  }
}

export async function listerModelesCompatibles(adresse: string, cle: string): Promise<string[]> {
  // OpenRouter publie sa liste sans clé : on vérifie d'abord la clé elle-même.
  if (/openrouter\.ai/.test(adresse)) await compatible(adresse, cle, "/key");
  const liste = await compatible(adresse, cle, "/models");
  // Ordre du service conservé (souvent du plus récent au plus ancien) : il guide les choix par défaut.
  return [...new Set<string>((liste.data ?? liste.models ?? []).map((m: any) => m.id ?? m.name).filter(Boolean))];
}

export async function appelCompatible(adresse: string, cle: string, modele: string, r: Requete): Promise<Resultat> {
  const corps: any = { model: modele, messages: [{ role: "system", content: r.system }, { role: "user", content: r.user }], response_format: { type: "json_object" } };
  let res: any;
  try {
    res = await compatible(adresse, cle, "/chat/completions", corps);
  } catch (e: any) {
    // Service ou modèle sans mode JSON : même demande sans ce réglage, la réponse est nettoyée à la lecture.
    if (e.status !== 400 && e.status !== 422) throw e;
    delete corps.response_format;
    res = await compatible(adresse, cle, "/chat/completions", corps);
  }
  const choix = res.choices?.[0];
  if (choix?.finish_reason === "length") throw new Error("réponse tronquée (longueur maximale atteinte)");
  const contenu = choix?.message?.content;
  const texte = typeof contenu === "string" ? contenu : (contenu ?? []).map((c: any) => c.text ?? "").join("");
  if (!texte) throw new Error("réponse vide ou refus du modèle");
  return { texte, tokens_entree: res.usage?.prompt_tokens ?? 0, tokens_sortie: res.usage?.completion_tokens ?? 0, modele: res.model ?? modele };
}
