// Enchaînement complet d'un test de démarche, sans intervention humaine : utilisé par la plateforme (navigateur)
// et par les essais en ligne de commande. Les appels au modèle passent par la fonction `appel` fournie :
// clé de l'utilisateur dans le navigateur, rejeu de réponses enregistrées pour les essais.
import fs from "node:fs";
import path from "node:path";
import type { StepName } from "./schemas.js";
import { cmdInit, cmdPanel, cmdPrepare, cmdIngest, cmdSimulate, items } from "./cli.js";
import { runDir, okPath, readJson, exists, journal, type Manifest } from "./store.js";
import type { Requete } from "./appels.js";
import type { CaseFile } from "./requests.js";

export interface ReponseModele { texte: string; tokens_entree: number; tokens_sortie: number; modele?: string }
export type Appel = (r: Requete) => Promise<ReponseModele>;

export interface EtapeDef { cle: string; libelle: string; modele?: StepName }
// Ordre d'exécution. Les étapes témoins sont sautées quand le cas n'en définit pas.
export const ETAPES: EtapeDef[] = [
  { cle: "panel", libelle: "Construction du panel d'habitants simulés" },
  { cle: "formulateur", libelle: "Autres formulations de la démarche", modele: "formulateur" },
  { cle: "gardien-angles", libelle: "Contrôle de méthode des formulations", modele: "gardien-angles" },
  { cle: "personas", libelle: "Réactions des habitants", modele: "personas" },
  { cle: "mobilisation", libelle: "Participation par format", modele: "mobilisation" },
  { cle: "controle", libelle: "Témoin : décision imposée", modele: "controle" },
  { cle: "controle2", libelle: "Témoin : objectif en question ouverte", modele: "controle2" },
  { cle: "simulate", libelle: "Propagation dans la population" },
  { cle: "niveau", libelle: "Estimation du nombre de participants", modele: "niveau" },
  { cle: "facilitateur", libelle: "Lecture de la propagation", modele: "facilitateur" },
  { cle: "sociologue", libelle: "Analyse des groupes et des objections", modele: "sociologue" },
  { cle: "contradicteur", libelle: "Critique contradictoire", modele: "contradicteur" },
  { cle: "gardien-final", libelle: "Contrôle de méthode final", modele: "gardien-final" },
  { cle: "traducteur", libelle: "Rédaction du rapport", modele: "traducteur" },
];

export interface Suivi {
  etape?: (cle: string, etat: "en_cours" | "fait" | "saute") => void;
  usage?: (u: ReponseModele) => void;
  signal?: AbortSignal;
  parallele?: number;
}

const casDe = (runId: string) => {
  const m = readJson<Manifest>(path.join(runDir(runId), "manifest.json"));
  return readJson<CaseFile>(path.join(runDir(runId), "..", "..", "cases", m.caseId, "case.json"));
};
const valide = (runId: string, step: StepName) => {
  try {
    return items(runId, step).every((i) => exists(okPath(runId, step, i)));
  } catch {
    return false;
  }
};
const active = (runId: string, e: EtapeDef) => {
  const c = casDe(runId);
  if (e.cle === "controle") return !!c.angle_controle;
  if (e.cle === "controle2") return !!c.angle_controle2;
  if (e.cle === "niveau") return !!c.plateforme;
  return true;
};
export const etapeFaite = (runId: string, e: EtapeDef): boolean => {
  if (e.cle === "panel") return exists(path.join(runDir(runId), "panel.json"));
  if (e.cle === "simulate") return exists(path.join(runDir(runId), "metrics.json"));
  return valide(runId, e.modele!);
};

async function parallele<T>(xs: T[], n: number, f: (x: T) => Promise<void>, signal?: AbortSignal) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) {
      if (signal?.aborted) throw new Error("Test interrompu.");
      await f(xs[i++]);
    }
  }));
}

// Une étape confiée au modèle : préparer, appeler, faire contrôler par l'Administrateur, recommencer sur les rejets.
async function etapeModele(runId: string, step: StepName, appel: Appel, s: Suivi) {
  for (let tour = 0; tour < 4 && !valide(runId, step); tour++) {
    const lot = cmdPrepare(runId, step);
    if (!lot.length) break; // éléments restants au-delà du nombre d'essais permis
    await parallele(lot, s.parallele ?? 6, async (x) => {
      const r = readJson<Requete>(x.request);
      const debut = Date.now();
      const res = await appel(r);
      fs.mkdirSync(path.dirname(x.response), { recursive: true });
      fs.writeFileSync(x.response, res.texte, "utf8");
      journal(runId, { event: "appel_api", step, item: r.item, modele: res.modele, tokens_entree: res.tokens_entree, tokens_sortie: res.tokens_sortie, duree_ms: Date.now() - debut });
      s.usage?.(res);
    }, s.signal);
    cmdIngest(runId, step);
  }
}

// Crée le run s'il n'existe pas, puis exécute toutes les étapes restantes. Reprend là où il s'était arrêté.
export async function executerTest(caseId: string, runId: string, appel: Appel, s: Suivi = {}) {
  if (!exists(path.join(runDir(runId), "manifest.json"))) cmdInit(caseId, runId);
  // Le Gardien peut invalider une étape déjà faite : on repart toujours de la première étape non faite.
  for (let garde = 0; garde < 40; garde++) {
    const e = ETAPES.find((x) => active(runId, x) && !etapeFaite(runId, x));
    if (!e) break;
    if (s.signal?.aborted) throw new Error("Test interrompu.");
    s.etape?.(e.cle, "en_cours");
    if (e.cle === "panel") cmdPanel(runId);
    else if (e.cle === "simulate") cmdSimulate(runId);
    else await etapeModele(runId, e.modele!, appel, s);
    if (!etapeFaite(runId, e)) throw new Error(`L'étape « ${e.libelle} » n'a pas abouti après plusieurs essais : réponses du modèle refusées par les contrôles.`);
    s.etape?.(e.cle, "fait");
  }
  for (const e of ETAPES) if (!active(runId, e)) s.etape?.(e.cle, "saute");
  const reste = ETAPES.find((x) => active(runId, x) && !etapeFaite(runId, x));
  if (reste) throw new Error(`Étape inachevée : ${reste.libelle}.`);
}
