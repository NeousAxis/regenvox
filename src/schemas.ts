import { z } from "zod";

// Échelle des positions face à un angle, et leur poids dans le score de Résonance.
export const POSITIONS = ["porteur", "interesse", "indifferent", "reticent", "opposant"] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_SCORE: Record<Position, number> = { porteur: 3, interesse: 1, indifferent: 0, reticent: -1, opposant: -3 };

// Échelle d'engagement (participation) : 0 ignore, 1 s'informe, 2 donne son avis en ligne, 3 vient en atelier, 4 porte le projet.
export const ENGAGEMENT_LABELS = ["ignore", "s'informe", "avis en ligne", "atelier présentiel", "porte le projet"] as const;

export const PersonaSkeleton = z.object({
  id: z.string(),
  age: z.number().int(),
  tranche_age: z.string(),
  sexe: z.enum(["femme", "homme"]),
  nationalite: z.enum(["suisse", "etrangere"]),
  activite: z.string(),
  menage: z.string(),
  lieu_de_vie: z.string(),
  parti_proche: z.string().nullable(),
  electeur: z.boolean(),
  poids: z.number().positive(),
});
export type PersonaSkeleton = z.infer<typeof PersonaSkeleton>;

export const FormulateurOut = z.object({
  enjeu: z.string().min(20),
  objectif: z.string().min(10),
  angles: z
    .array(
      z.object({
        id: z.number().int().min(1),
        formulation: z.string().min(30).max(320),
        origine: z.enum(["decideur", "formulateur"]),
        acteurs_actives: z.array(z.object({ acteur: z.string().min(3), levier: z.string().min(3) })).min(1).max(6),
        chemins_ouverts: z.array(z.string().min(3)).min(3).max(8),
        risque_de_verrouillage: z.string().min(10),
      }),
    )
    .min(2)
    .max(5),
});
export type FormulateurOut = z.infer<typeof FormulateurOut>;

export const GardienOut = z.object({
  verdicts: z
    .array(
      z.object({
        cible: z.string(),
        aligne: z.boolean(),
        principes_violes: z.array(z.number().int().min(1).max(6)),
        commentaire: z.string().min(10),
      }),
    )
    .min(1),
  decision: z.enum(["accept", "reject"]),
  corrections_demandees: z.array(z.string()),
});
export type GardienOut = z.infer<typeof GardienOut>;

export const PersonaOut = z.object({
  id: z.string(),
  portrait: z.string().min(40).max(700),
  reactions: z
    .array(
      z.object({
        angle_id: z.number().int(),
        position: z.enum(POSITIONS),
        intensite: z.number().int().min(1).max(5),
        citation: z.string().min(15).max(450),
        engagement: z.number().int().min(0).max(4),
        freins_participation: z.array(z.string().min(3)).max(4),
        ce_qui_me_ferait_venir: z.string().max(320),
      }),
    )
    .min(1),
  influence: z.object({
    taille_cercle: z.number().int().min(0).max(300),
    role: z.enum(["leader_opinion", "relai", "suiveur", "isole"]),
    cercle_type: z.string().min(5).max(400),
  }),
  votes: z.array(
    z.object({
      vote_id: z.string(),
      participe_proba: z.number().min(0).max(1),
      oui_proba: z.number().min(0).max(1),
      raison: z.string().min(5).max(700),
    }),
  ),
});
export type PersonaOut = z.infer<typeof PersonaOut>;

export const FacilitateurOut = z.object({
  angles: z
    .array(
      z.object({
        angle_id: z.number().int(),
        evenements: z
          .array(z.object({ mois: z.number().int().min(0).max(48), evenement: z.string().min(10), effet: z.enum(["acceleration", "frein", "neutre"]) }))
          .min(3)
          .max(10),
        declencheurs_cles: z.array(z.string()).min(1).max(5),
        lecture: z.string().min(40),
      }),
    )
    .min(1),
});
export type FacilitateurOut = z.infer<typeof FacilitateurOut>;

const RACINES = ["economique", "culturelle", "pratique", "identitaire", "politique", "information"] as const;
export const SociologueOut = z.object({
  angle_recommande: z.object({ angle_id: z.number().int(), justification: z.string().min(60) }),
  segments: z
    .array(
      z.object({
        nom: z.string().min(5),
        persona_ids: z.array(z.string()).min(1),
        position_dominante: z.enum(POSITIONS),
        objection_citee: z.string().min(10),
        persona_source: z.string(),
        racine: z.enum(RACINES),
        levier: z.string().min(15),
      }),
    )
    .min(2)
    .max(8),
  freins_participation: z.array(z.object({ frein: z.string().min(5), persona_ids: z.array(z.string()).min(1), levier: z.string().min(10) })).min(1).max(12),
  ambassadeurs_potentiels: z.array(z.object({ persona_id: z.string(), pourquoi: z.string().min(10) })).max(10),
  surprises: z.array(z.string()).max(10),
});
export type SociologueOut = z.infer<typeof SociologueOut>;

export const ContradicteurOut = z.object({
  attaques: z
    .array(
      z.object({
        posture: z.string().min(5),
        cible: z.enum(["angle", "segments", "simulation", "backtest", "participation", "donnees"]),
        critique: z.string().min(80),
        element_verifiable: z.string().min(10),
        source_element: z.enum(["donnees_du_run", "connaissance_generale_a_verifier"]),
        impact: z.string().min(10),
        angle_mort: z.string().min(10),
      }),
    )
    .min(3)
    .max(12),
  verdict: z.enum(["accept_with_notes", "reject"]),
  notes_pour_rapport: z.array(z.string().min(10)).min(1),
});
export type ContradicteurOut = z.infer<typeof ContradicteurOut>;

export const TraducteurOut = z.object({
  titre: z.string().min(10),
  synthese: z.string().min(80).max(900),
  sections: z.array(z.object({ titre: z.string().min(3), contenu: z.string().min(40) })).min(4).max(9),
});
export type TraducteurOut = z.infer<typeof TraducteurOut>;

// Mobilisation : probabilités de participer à chaque format de la phase de participation réelle.
export const FORMATS = ["avis_en_ligne", "atelier_presentiel", "parcours_distance"] as const;
const proba = z.number().min(0).max(1);
export const MobilisationOut = z.object({
  id: z.string(),
  angles: z
    .array(
      z.object({
        angle_id: z.number().int(),
        avis_en_ligne: proba,
        atelier_presentiel: proba,
        parcours_distance: proba,
        atelier_si_invite_par_un_proche: proba,
        ce_qui_doublerait_ma_venue: z.string().min(10).max(400),
      }),
    )
    .min(2)
    .max(5),
  format_prefere: z.enum(["avis_en_ligne", "atelier_presentiel", "parcours_distance", "aucun"]),
  raison_format: z.string().min(10).max(900),
});
export type MobilisationOut = z.infer<typeof MobilisationOut>;

// Angle témoin : une formulation volontairement descendante (décision déjà prise), pour vérifier que le panel sait dire non.
export const ControleOut = z.object({
  id: z.string(),
  reaction: z.object({
    position: z.enum(POSITIONS),
    intensite: z.number().int().min(1).max(5),
    citation: z.string().min(15).max(450),
    engagement: z.number().int().min(0).max(4),
    freins_participation: z.array(z.string()).max(6),
    ce_qui_me_ferait_venir: z.string().max(800),
  }),
});
export type ControleOut = z.infer<typeof ControleOut>;

// Votations hors du backtest : analogues au résultat connu, votation postérieure aux modèles, votations à venir.
export const ScrutinOut = z.object({
  id: z.string(),
  votes: z.array(
    z.object({
      vote_id: z.string(),
      participe_proba: z.number().min(0).max(1),
      oui_proba: z.number().min(0).max(1),
      raison: z.string().min(5).max(700),
    }),
  ),
});
export type ScrutinOut = z.infer<typeof ScrutinOut>;

// Test à l'aveugle sur des mobilisations réelles terminées (pétitions, budgets participatifs).
export const ReactionMobilOut = z.object({
  id: z.string(),
  reactions: z.array(
    z.object({
      item_id: z.string(),
      participe_proba: z.number().min(0).max(1),
      partage_proba: z.number().min(0).max(1),
      raison: z.string().min(5).max(500),
    }),
  ),
});
export type ReactionMobilOut = z.infer<typeof ReactionMobilOut>;

export const SCHEMAS = {
  formulateur: FormulateurOut,
  "gardien-angles": GardienOut,
  personas: PersonaOut,
  mobilisation: MobilisationOut,
  controle: ControleOut,
  controle2: ControleOut,
  facilitateur: FacilitateurOut,
  sociologue: SociologueOut,
  contradicteur: ContradicteurOut,
  "gardien-final": GardienOut,
  traducteur: TraducteurOut,
  scrutins: ScrutinOut,
  scrutins2: ScrutinOut,
  cantonales: ScrutinOut,
  petitions: ReactionMobilOut,
  demarches: ReactionMobilOut,
  demarchesge: ReactionMobilOut,
  quartiers: ReactionMobilOut,
} as const;
export type StepName = keyof typeof SCHEMAS;
