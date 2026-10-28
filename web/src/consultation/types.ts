// Consultation réelle : le questionnaire partagé à chaque contributeur, ses réponses et ce que l'initiateur garde chez lui.
import type { TypeOrganisation } from '../moteur'
import type { BoitePublique } from './chiffrement'
import type { LigneAnonyme } from './analyse'

export type Langue = 'fr' | 'en'

// Mêmes catégories que le panel simulé, pour comparer la consultation réelle à la simulation.
export const CLES_CATEGORIES = ['groupe', 'tranche_age', 'sexe', 'nationalite', 'activite', 'menage', 'lieu_de_vie'] as const
export type CleCategorie = (typeof CLES_CATEGORIES)[number]
export interface Categorie { cle: CleCategorie; options: string[] }

// Positions et engagement : mêmes échelles que les habitants simulés (src/schemas.ts).
export const POSITIONS = ['porteur', 'interesse', 'indifferent', 'reticent', 'opposant'] as const
export type Position = (typeof POSITIONS)[number]
export const POSITION_SCORE: Record<Position, number> = { porteur: 3, interesse: 1, indifferent: 0, reticent: -1, opposant: -3 }
export const ENGAGEMENTS = [0, 1, 2, 3, 4] as const
export const FORMATS = ['avis_en_ligne', 'atelier_presentiel', 'parcours_distance', 'aucun'] as const
export type Format = (typeof FORMATS)[number]

export type TypeQuestion = 'choix' | 'choix_multiples' | 'echelle' | 'texte'
export interface Question { id: string; type: TypeQuestion; intitule: string; options?: string[]; obligatoire: boolean }

// Ce que voient les contributeurs. Chiffré avec la clé du lien : le serveur ne le lit pas.
export interface Questionnaire {
  version: 1
  id: string
  langue: Langue
  organisation: { type: TypeOrganisation; nom: string }
  titre: string
  introduction: string
  formulation: string // l'appel, tel qu'il a été testé sur le panel simulé
  contact: string // qui répond aux questions et décide de l'usage des réponses
  cloture_le: string // AAAA-MM-JJ, inclus
  conservation_jours: number // durée de conservation sur le serveur après la clôture
  categories: Categorie[]
  questions: Question[]
  cle_publique: string
}

export type ValeurReponse = string | string[] | number

// Une réponse, chiffrée dans le téléphone du contributeur pour la seule clé de l'initiateur.
// Ni nom, ni adresse, ni heure : la date suffit.
export interface Reponse {
  version: 1
  envoyee_le: string // AAAA-MM-JJ
  categories: Partial<Record<CleCategorie, string>> // chaîne vide : préfère ne pas répondre
  position?: Position
  engagement?: number
  format?: Format
  avis?: string
  freins?: string
  envie?: string
  reponses: Record<string, ValeurReponse>
}

// Résumé de la simulation, copié dans la consultation à sa création : la comparaison reste possible
// même si la prospective est supprimée plus tard.
export interface RepereSimulation {
  projet_id: string
  angle_id: number
  formulation: string
  enjeu: string
  objectif: string
  contexte: string[]
  positions: Record<Position, number> // parts pondérées, somme 1
  engagement: number[] // parts pondérées pour 0 à 4
  formats: Partial<Record<Format, number>> // format préféré, parts pondérées
  population: Partial<Record<CleCategorie, Record<string, number>>> // parts dans la population, estimées par le panel
  score_par_categorie: Partial<Record<CleCategorie, Record<string, number>>> // score moyen de soutien (échelle -3 à 3)
  taille_panel: number
}

// Synthèse rédigée à partir des vraies réponses, avec la clé d'IA de l'initiateur.
export interface Segment { nom: string; position_dominante: Position; objection_citee: string; reponse_source: string; racine: string; levier: string }
export interface Theme { question_id: string; themes: { theme: string; nombre: number; citation: string }[] }
export interface LectureReelle {
  segments: Segment[]
  freins_participation: { frein: string; nombre: number; levier: string }[]
  themes: Theme[]
  ecarts_avec_simulation: string[]
  surprises: string[]
}
export interface CritiqueReelle { attaques: { cible: string; critique: string; impact: string }[]; notes_pour_rapport: string[] }
export interface RedactionReelle { titre: string; synthese: string; sections: { titre: string; contenu: string }[] }
export interface Synthese {
  faite_le: string
  nombre_reponses: number
  lecture: LectureReelle
  critique: CritiqueReelle
  redaction: RedactionReelle
  usage: { tokens_entree: number; tokens_sortie: number }
  modele?: string // fournisseur ou modèle qui a rédigé, cité dans la méthode du rapport
}

// Ce que l'initiateur garde sur son appareil (IndexedDB). La clé privée y est rangée non exportable.
export interface ConsultationLocale {
  id: string
  cree_le: string
  serveur: string
  questionnaire: Questionnaire
  cle_lien: string
  jeton: string
  privee: CryptoKey
  simulation?: RepereSimulation
  reponses?: Reponse[]
  releve_le?: string
  illisibles?: number
  ferme?: boolean
  // Données anonymes, calculées une fois par relevé : les numéros R… restent les mêmes dans la synthèse, le rapport et le CSV.
  lignes_anonymes?: LigneAnonyme[]
  cases_masquees?: number
  synthese?: Synthese
  rapport_html?: string
}

// Ce qui circule entre le navigateur et le serveur de collecte.
export interface EnveloppeReponse { boite: BoitePublique }
