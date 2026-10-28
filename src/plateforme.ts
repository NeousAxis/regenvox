// Construction du cas d'un test lancé depuis la plateforme web, à partir de ce que l'utilisateur a saisi
// et des données publiques du territoire (data/communes_ch.json) ou des groupes déclarés par l'organisation.
import type { CaseFile } from "./requests.js";
import type { PanelSpec, GroupeSpec } from "./demographe.js";
import { mots, type TypeOrganisation } from "./vocabulaire.js";

export interface ParametresPlateforme {
  organisation: { type: TypeOrganisation; nom: string };
  territoire?: { niveau: "commune" | "canton" | "suisse"; commune_num?: number; canton?: string };
  groupes?: GroupeSpec[];
  demarche: { enjeu: string; objectif: string; formulation: string; formats: string[]; horizon_mois: number };
}

// Entrée de data/communes_ch.json (commune, canton ou Suisse).
export interface SourceTerritoire {
  panel: PanelSpec;
  cible: { nom: string; canton: string; pays: string; description: string };
  contexte_factuel: string[];
  sources?: { label: string; url: string }[];
}

export const TAILLE_PANEL = 48;

// Démarche agricole, reconnue à ses mots : les agriculteurs sont suréchantillonnés (8 sur 48, comme au premier test de Vuadens)
// puis ramenés à leur part réelle, pour que leur avis puisse être lu à part. Ailleurs, leur nombre suit leur part réelle.
export const SURECHANTILLON_AGRICOLE = 8;
const MOTS_AGRICOLES = /agricol|agricult|paysan|\bfermes?\b|élevage|éleveu|maraîch|viticult|vigneron|\bvignes?\b|\bvergers?\b|alpage|pâturage|\bbio\b|biologique|agro-?écolog|semences|\brécoltes?\b/i;
export const demarcheAgricole = (d: { enjeu: string; objectif: string; formulation: string }) => MOTS_AGRICOLES.test([d.enjeu, d.objectif, d.formulation].join(" "));

const TYPE_LIBELLE: Record<TypeOrganisation, string> = { commune: "commune", administration: "administration publique", ecole: "école", entreprise: "entreprise", ong: "ONG ou association" };
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nettoie = (s: string) => s.trim().replace(/\s+/g, " ");

export function construireCas(id: string, p: ParametresPlateforme, territoire: SourceTerritoire | null, reference: SourceTerritoire, seed: number): { cas: CaseFile; panel: PanelSpec } {
  const d = p.demarche;
  const org = { type: p.organisation.type, nom: nettoie(p.organisation.nom) };
  let cible: CaseFile["cible"];
  let panel: PanelSpec;
  let contexte: string[];
  let agricole = false;
  let sources = territoire?.sources ?? [];
  if (p.groupes?.length) {
    const gs = p.groupes.map((g) => ({ ...g, nom: nettoie(g.nom) }));
    const total = gs.reduce((s, g) => s + g.effectif, 0);
    const resume = gs.map((g) => `${g.nom} (${g.effectif}, ${g.age_min} à ${g.age_max} ans)`).join(", ");
    cible = { type: "organisation", nom: org.nom, canton: "", pays: "CH", description: `${majuscule(TYPE_LIBELLE[org.type])} en Suisse. Composition déclarée : ${resume}.` };
    contexte = [`Effectifs déclarés par ${org.nom} : ${resume}, soit ${total} personnes.`];
    sources = reference.sources ?? [];
    panel = {
      univers: `membres de ${org.nom} (${gs.map((g) => g.nom).join(", ")})`,
      population_16_plus: { valeur: total, source: "effectifs déclarés par l'organisation" },
      tranches_age: [],
      source_age: "âges déclarés par groupe",
      part_etrangers: reference.panel.part_etrangers,
      part_femmes: reference.panel.part_femmes,
      agriculteurs: { part_16_plus: 0, source: "sans objet", surechantillon: 0, age_min: 0, age_max: 0, part_bio: 0, orientation: "", part_hommes: 0, part_suisses: 0 },
      activites_actifs: [],
      source_activites: "groupes déclarés",
      partis: [],
      source_partis: "sans objet",
      lieux_de_vie: [],
      hypotheses: [],
      groupes: gs,
    };
  } else {
    if (!territoire || !p.territoire) throw new Error("Territoire manquant.");
    const niveau = p.territoire.niveau;
    cible = { type: niveau, nom: territoire.cible.nom, canton: territoire.cible.canton, pays: "CH", description: territoire.cible.description };
    contexte = territoire.contexte_factuel;
    const ag = territoire.panel.agriculteurs;
    const proportionnel = Math.round(ag.part_16_plus * TAILLE_PANEL);
    agricole = ag.part_16_plus > 0 && demarcheAgricole(d);
    panel = {
      ...territoire.panel,
      agriculteurs: { ...ag, surechantillon: agricole ? Math.max(proportionnel, SURECHANTILLON_AGRICOLE) : proportionnel },
      hypotheses: agricole ? [...territoire.panel.hypotheses, "La démarche touche l'agriculture (d'après les mots de l'enjeu, de l'objectif ou de la formulation) : les agriculteurs sont suréchantillonnés pour que leur avis puisse être lu à part."] : territoire.panel.hypotheses,
    };
  }
  const cas: CaseFile = {
    id,
    plateforme: true,
    organisation: org,
    cible,
    decideur: org.nom,
    enjeu: nettoie(d.enjeu),
    objectif: nettoie(d.objectif),
    angle_fourni: nettoie(d.formulation),
    horizon_mois: d.horizon_mois,
    panel: { N: TAILLE_PANEL, seed },
    contexte_factuel: contexte,
    votations: [],
    sources,
    ...(agricole ? { acteurs_cles: { groupe: "agriculteurs", activite_regex: "agricult" } } : {}),
  };
  const m = mots(cas);
  const objectif = nettoie(d.objectif).replace(/[.!?]+$/, "");
  cas.angle_controle = {
    formulation: `${majuscule(m.emetteur)} a décidé de l'objectif suivant : « ${objectif} ». Comment allez-vous contribuer à cet objectif ?`,
    pourquoi: "Témoin contraire à la méthode : il annonce une décision déjà prise et demande seulement comment s'y conformer. S'il obtenait autant de soutien que les formulations ouvertes, le panel serait complaisant et ses résultats peu fiables.",
  };
  cas.angle_controle2 = {
    formulation: `${majuscule(m.emetteur)} s'est fixé l'objectif suivant : « ${objectif} ». Comment pourrions-nous y parvenir ensemble ?`,
    pourquoi: "Second témoin : le même objectif, posé comme une question ouverte. Il sépare l'effet de l'objectif de l'effet du ton imposé.",
  };
  return { cas, panel };
}
