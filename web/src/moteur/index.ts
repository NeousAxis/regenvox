// Interface du moteur RegenVox. Le moteur tourne dans le navigateur de l'utilisateur :
// la clé API part uniquement vers le fournisseur choisi, les projets restent sur l'appareil.

export type Fournisseur = "anthropic" | "mistral" | "openai" | "autre";
// adresse et modeles : seulement pour « autre » (service compatible OpenAI choisi par l'utilisateur).
export interface CleApi { fournisseur: Fournisseur; cle: string; adresse?: string; modeles?: { rapide: string; analyse: string } }
export interface Groupe { nom: string; effectif: number; age_min: number; age_max: number }
export type TypeOrganisation = "commune" | "administration" | "ecole" | "entreprise" | "ong";
export interface Territoire { niveau: "commune" | "canton" | "suisse"; commune_num?: number; canton?: string } // canton = sigle, ex. "VD"
export interface ParametresTest {
  langue: "fr" | "en";
  organisation: { type: TypeOrganisation; nom: string };
  territoire?: Territoire;   // commune, administration, ong (si territoire)
  groupes?: Groupe[];        // ecole, entreprise, ong (si membres)
  demarche: { enjeu: string; objectif: string; formulation: string; formats: string[]; horizon_mois: number };
}
export type EtatEtape = "a_faire" | "en_cours" | "fait" | "erreur";
export interface Etape { cle: string; libelle: string; etat: EtatEtape }
export interface Projet {
  version: 1;
  id: string;
  cree_le: string;
  parametres: ParametresTest;
  etat: "en_cours" | "termine" | "erreur" | "interrompu";
  etapes: Etape[];
  erreur?: string;
  rapport_html?: string;
  fichiers: Record<string, string>; // état interne du moteur, opaque pour l'interface, à sauvegarder tel quel
  usage?: { tokens_entree: number; tokens_sortie: number };
}
export interface Moteur {
  creer(p: ParametresTest): Projet; // projet initial, étapes à faire, rien n'est lancé
  executer(projet: Projet, cle: CleApi, suivi: (p: Projet) => void, signal?: AbortSignal): Promise<Projet>; // lance ou reprend ; appelle suivi à chaque changement
  verifierCle(cle: CleApi): Promise<{ ok: boolean; message?: string; modeles?: string[] }>; // modeles : liste du service, pour « autre »
  rendreRapport?(projet: Projet): string | null; // rapport d'un test terminé remis en page avec la version actuelle, sans appel à l'IA
}

import { moteurMaquette } from "./maquette";
import { moteurReel } from "./reel";

// La maquette n'est active qu'en développement ET avec VITE_MAQUETTE=1.
// Dans le build de production, import.meta.env.DEV vaut false : la maquette est retirée du paquet.
export const MAQUETTE: boolean = import.meta.env.DEV && import.meta.env.VITE_MAQUETTE === "1";

export const moteur: Moteur = MAQUETTE ? moteurMaquette : moteurReel;
