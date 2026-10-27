// Moteur RegenVox exécuté entièrement dans le navigateur de l'utilisateur.
// La clé API ne sert qu'aux appels directs vers le fournisseur choisi (Anthropic, Mistral ou OpenAI).
// Aucun appel vers Régénère Plus : seules les données publiques du territoire sont lues sur regenvox.xyz.
import Anthropic from "@anthropic-ai/sdk";
import * as memoire from "./fs";
import fournisseurs from "../../../../fournisseurs.json";
import { ETAPES, executerTest, type Appel } from "../../../../src/pipeline";
import { construireCas, type SourceTerritoire } from "../../../../src/plateforme";
import { renderRapportPlateforme } from "../../../../src/rapport";
import { appelAnthropic, appelMistral, appelOpenAI, modelesOpenAI, appelCompatible, listerModelesCompatibles, type Requete, type ClientMistral } from "../../../../src/appels";
import type { Moteur, Projet, ParametresTest, CleApi, Etape } from "../index";

const RACINE = "/moteur";
const base = import.meta.env.BASE_URL ?? "/";
// Données publiques compressées (un fichier par canton) : décompressées ici, sauf si le serveur l'a déjà fait.
const lire = async <T>(chemin: string): Promise<T> => {
  const r = await fetch(`${base}${chemin}`);
  if (!r.ok) throw new Error(`Données publiques introuvables (${chemin}).`);
  const octets = new Uint8Array(await r.arrayBuffer());
  const gz = octets[0] === 0x1f && octets[1] === 0x8b;
  const texte = gz ? await new Response(new Blob([octets]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : new TextDecoder().decode(octets);
  return JSON.parse(texte) as T;
};
const cantonDe = async (num: number) => {
  const index = await lire<{ num: number; canton: string }[]>("communes_index.json");
  const c = index.find((x) => x.num === num);
  if (!c) throw new Error(`Commune ${num} inconnue.`);
  return c.canton;
};

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "test";
const etapesInitiales = (): Etape[] => ETAPES.map((e) => ({ cle: e.cle, libelle: e.libelle, etat: "a_faire" }));

async function clientAppel(cle: CleApi): Promise<Appel> {
  if (cle.fournisseur === "autre") {
    if (!cle.adresse || !cle.modeles) throw new Error("Service ou modèles non choisis.");
    const { adresse, modeles } = cle;
    // Les habitants simulés (nombreux appels courts) prennent le modèle rapide, les analyses le plus capable.
    return async (r: Requete) => appelCompatible(adresse, cle.cle, r.model === "haiku" ? modeles.rapide : modeles.analyse, r);
  }
  if (cle.fournisseur === "openai") {
    const modeles = await modelesOpenAI(cle.cle);
    return async (r: Requete) => appelOpenAI(cle.cle, modeles, r.model, r);
  }
  if (cle.fournisseur === "anthropic") {
    const client = new Anthropic({ apiKey: cle.cle, dangerouslyAllowBrowser: true, maxRetries: 4, timeout: 10 * 60 * 1000 });
    return async (r: Requete) => appelAnthropic(client, r.model, r);
  }
  const client = clientMistral(cle.cle);
  return async (r: Requete) => appelMistral(client, r.model, r);
}

// Client Mistral minimal (appel HTTP direct) : le SDK complet embarque des modules réservés à Node.
const MISTRAL = "https://api.mistral.ai/v1";
async function mistral(cle: string, chemin: string, corps?: unknown) {
  for (let essai = 0; ; essai++) {
    const r = await fetch(`${MISTRAL}${chemin}`, { method: corps ? "POST" : "GET", headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && essai < 4) {
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** essai));
      continue;
    }
    throw Object.assign(new Error(`Mistral : erreur ${r.status} ${(await r.text()).slice(0, 200)}`), { status: r.status });
  }
}
function clientMistral(cle: string): ClientMistral {
  return {
    chat: {
      complete: async (req: any) => {
        const res: any = await mistral(cle, "/chat/completions", { model: req.model, messages: req.messages, response_format: req.responseFormat });
        return {
          model: res.model,
          choices: res.choices.map((c: any) => ({ finishReason: c.finish_reason, message: c.message })),
          usage: { promptTokens: res.usage?.prompt_tokens ?? 0, completionTokens: res.usage?.completion_tokens ?? 0 },
        };
      },
    },
  };
}

// Seuls les fichiers utiles à la reprise et au rapport sont gardés : les requêtes et réponses brutes se régénèrent.
const garder = (k: string) => !/\/(requests|responses)\//.test(k);
function instantane(): Record<string, string> {
  const tout = memoire.exporter(RACINE);
  return Object.fromEntries(Object.entries(tout).filter(([k]) => garder(k) && k !== "fournisseurs.json"));
}

async function territoire(p: ParametresTest): Promise<SourceTerritoire | null> {
  if (!p.territoire) return null;
  const t = p.territoire;
  if (t.niveau === "suisse") return lire("donnees/suisse.json.gz");
  const sigle = t.niveau === "canton" ? t.canton! : t.canton ?? (await cantonDe(t.commune_num!));
  const fichier = await lire<{ canton: SourceTerritoire; communes: Record<string, SourceTerritoire> }>(`donnees/${sigle}.json.gz`);
  if (t.niveau === "canton") return fichier.canton;
  const c = fichier.communes[String(t.commune_num)];
  if (!c) throw new Error(`Commune ${t.commune_num} absente des données du canton ${sigle}.`);
  return c;
}

export const moteurNavigateur: Moteur = {
  creer(p: ParametresTest): Projet {
    const date = new Date().toISOString();
    const id = `${slug(p.organisation.nom)}-${date.slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`;
    return { version: 1, id, cree_le: date, parametres: p, etat: "en_cours", etapes: etapesInitiales(), fichiers: {}, usage: { tokens_entree: 0, tokens_sortie: 0 } };
  },

  async executer(projet: Projet, cle: CleApi, suivi: (p: Projet) => void, signal?: AbortSignal): Promise<Projet> {
    let pr: Projet = { ...projet, etat: "en_cours", erreur: undefined, etapes: projet.etapes.map((e) => (e.etat === "erreur" || e.etat === "en_cours" ? { ...e, etat: "a_faire" } : e)) };
    const maj = (x: Partial<Projet>) => {
      pr = { ...pr, ...x };
      suivi(pr);
    };
    memoire.vider();
    memoire.writeFileSync(`${RACINE}/fournisseurs.json`, JSON.stringify(fournisseurs));
    memoire.importer(RACINE, pr.fichiers);
    const caseId = pr.id;
    const runId = pr.id;
    try {
      if (!memoire.existsSync(`${RACINE}/cases/${caseId}/case.json`)) {
        const [src, ref] = await Promise.all([territoire(pr.parametres), lire<SourceTerritoire>("donnees/suisse.json.gz")]);
        const graine = 20261027 + Math.floor(Math.random() * 1e6);
        const { cas, panel } = construireCas(caseId, pr.parametres, src, ref, graine);
        memoire.writeFileSync(`${RACINE}/cases/${caseId}/case.json`, JSON.stringify(cas, null, 2));
        memoire.writeFileSync(`${RACINE}/cases/${caseId}/panel.json`, JSON.stringify(panel, null, 2));
        memoire.writeFileSync(`${RACINE}/cases/${caseId}/votes_reels.json`, "[]");
        maj({ fichiers: instantane() });
      }
      const usage = { ...(pr.usage ?? { tokens_entree: 0, tokens_sortie: 0 }) };
      await executerTest(caseId, runId, await clientAppel(cle), {
        signal,
        parallele: cle.fournisseur === "anthropic" ? 6 : cle.fournisseur === "autre" ? 3 : 4,
        usage: (u) => {
          usage.tokens_entree += u.tokens_entree;
          usage.tokens_sortie += u.tokens_sortie;
        },
        etape: (k, etat) => {
          const e2: Etape["etat"] = etat === "saute" ? "fait" : etat;
          maj({ etapes: pr.etapes.map((e) => (e.cle === k ? { ...e, etat: e2 } : e)), fichiers: instantane(), usage: { ...usage } });
        },
      });
      const html = renderRapportPlateforme(runId, { organisation: pr.parametres.organisation.nom, date: new Date().toLocaleDateString("fr-CH") });
      maj({ etat: "termine", rapport_html: html, fichiers: instantane(), usage: { ...usage } });
    } catch (e: any) {
      const interrompu = signal?.aborted;
      maj({
        etat: interrompu ? "interrompu" : "erreur",
        erreur: interrompu ? "Test interrompu. Vous pouvez le reprendre." : messageErreur(e),
        etapes: pr.etapes.map((x) => (x.etat === "en_cours" ? { ...x, etat: interrompu ? "a_faire" : "erreur" } : x)),
        fichiers: instantane(),
      });
    }
    return pr;
  },

  async verifierCle(cle: CleApi) {
    try {
      if (cle.fournisseur === "anthropic") {
        const client = new Anthropic({ apiKey: cle.cle, dangerouslyAllowBrowser: true, maxRetries: 1 });
        // Comptage de jetons : gratuit, et accessible depuis une page web (la liste des modèles ne l'est pas).
        await client.messages.countTokens({ model: fournisseurs.anthropic.haiku, messages: [{ role: "user", content: "test" }] });
      } else if (cle.fournisseur === "autre") {
        if (!cle.adresse) return { ok: false, message: "Adresse du service manquante." };
        const modeles = await listerModelesCompatibles(cle.adresse, cle.cle);
        if (!modeles.length) return { ok: false, message: "Le service n'a renvoyé aucun modèle." };
        return { ok: true, modeles };
      } else if (cle.fournisseur === "openai") {
        await modelesOpenAI(cle.cle);
      } else {
        await mistral(cle.cle, "/models");
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: messageErreur(e) };
    }
  },
};

function messageErreur(e: any): string {
  const statut = e?.status ?? e?.statusCode;
  if (statut === 401 || statut === 403) return "Clé refusée par le fournisseur : vérifiez qu'elle est correcte et active.";
  if (statut === 402 || /credit|billing|balance/i.test(e?.message ?? "")) return "Crédit insuffisant chez le fournisseur : ajoutez du crédit sur votre compte puis reprenez le test.";
  if (statut === 429) return "Trop de demandes envoyées au fournisseur : attendez une minute puis reprenez le test.";
  if (e?.name === "TypeError" && /fetch/i.test(e?.message ?? "")) return "Connexion au fournisseur impossible : vérifiez votre connexion internet.";
  return String(e?.message ?? e);
}
