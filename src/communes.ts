// Panels de toutes les communes suisses, des 26 cantons et de la Suisse entière, construits par
// scripts/build_communes_ch.py à partir des données ouvertes OFS (STATPOP 2025, Conseil national 2023, relevé agricole 2025).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./store.js";
import type { PanelSpec } from "./demographe.js";

export interface CommuneEntry {
  num: number;
  nom: string;
  canton: string;
  nom_canton: string;
  description: string;
  panel: PanelSpec;
  contexte_factuel: string[];
}
export interface CantonEntry {
  canton: string;
  nom: string;
  description: string;
  panel: PanelSpec;
  contexte_factuel: string[];
}
export interface SuisseEntry {
  nom: string;
  description: string;
  panel: PanelSpec;
  contexte_factuel: string[];
}
export interface CommunesFile {
  genere_le: string;
  etat_des_communes: string;
  sources: { label: string; url: string }[];
  communes: Record<string, CommuneEntry>;
  cantons: Record<string, CantonEntry>;
  suisse: SuisseEntry;
}
export interface TerritoryCase {
  panel: PanelSpec;
  cible: { type: "commune" | "canton" | "pays"; nom: string; canton: string; pays: "CH"; description: string };
  contexte_factuel: string[];
}

export const COMMUNES_PATH = path.join(ROOT, "data", "communes_ch.json");

// Fichier lu une seule fois (environ 2100 communes), puis gardé en mémoire.
let cache: CommunesFile | null = null;
export function loadCommunes(): CommunesFile {
  if (!cache) {
    if (!fs.existsSync(COMMUNES_PATH)) {
      throw new Error(`Fichier ${COMMUNES_PATH} introuvable : lancer python3 -I scripts/build_communes_ch.py <dossier des téléchargements> <racine du moteur>.`);
    }
    cache = JSON.parse(fs.readFileSync(COMMUNES_PATH, "utf8")) as CommunesFile;
  }
  return cache;
}

export function communeCase(num: number): TerritoryCase {
  if (!Number.isInteger(num) || num <= 0) throw new Error(`Numéro OFS de commune invalide : ${num}.`);
  const data = loadCommunes();
  const c = data.communes[String(num)];
  if (!c) throw new Error(`Commune inconnue : aucun numéro OFS ${num} parmi les communes au ${data.etat_des_communes}.`);
  return {
    panel: c.panel,
    cible: { type: "commune", nom: c.nom, canton: c.canton, pays: "CH", description: c.description },
    contexte_factuel: c.contexte_factuel,
  };
}

export function cantonCase(sigle: string): TerritoryCase {
  const data = loadCommunes();
  const k = String(sigle ?? "").trim().toUpperCase();
  const c = data.cantons[k];
  if (!c) throw new Error(`Canton inconnu : « ${sigle} ». Sigles valides : ${Object.keys(data.cantons).sort().join(", ")}.`);
  return {
    panel: c.panel,
    cible: { type: "canton", nom: c.nom, canton: c.canton, pays: "CH", description: c.description },
    contexte_factuel: c.contexte_factuel,
  };
}

// Pour la Suisse entière, le champ canton porte le sigle du pays (« CH »), faute de canton.
export function suisseCase(): TerritoryCase {
  const s = loadCommunes().suisse;
  return {
    panel: s.panel,
    cible: { type: "pays", nom: s.nom, canton: "CH", pays: "CH", description: s.description },
    contexte_factuel: s.contexte_factuel,
  };
}
