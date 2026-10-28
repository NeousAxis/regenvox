// Démographe : génère le squelette du panel (déterministe) à partir de distributions sourcées.
// Tout paramètre non sourcé est déclaré comme hypothèse et remonte dans le rapport.
import { makeRng } from "./rng.js";
import type { PersonaSkeleton } from "./schemas.js";

export interface GroupeSpec { nom: string; effectif: number; age_min: number; age_max: number }

export interface PanelSpec {
  groupes?: GroupeSpec[]; // panel d'une organisation (école, entreprise, ONG) : composition donnée par l'utilisateur
  pays?: string; // absent = Suisse ; sinon, les hypothèses du rapport ne parlent ni d'agriculteurs ni du Conseil national
  univers: string;
  population_16_plus: { valeur: number; source: string };
  tranches_age: { tranche: string; min: number; max: number; part: number; part_etrangers?: number }[];
  source_age: string;
  part_etrangers: { valeur: number; source: string };
  part_femmes: { valeur: number; source: string };
  agriculteurs: {
    part_16_plus: number;
    source: string;
    surechantillon: number;
    age_min: number;
    age_max: number;
    part_bio: number;
    orientation: string;
    part_hommes: number;
    part_suisses: number;
  };
  activites_actifs: { activite: string; part: number }[];
  source_activites: string;
  partis: { parti: string; part: number }[];
  source_partis: string;
  lieux_de_vie: { lieu: string; part: number }[];
  hypotheses: string[];
}

function quotas(parts: number[], n: number): number[] {
  const raw = parts.map((p) => p * n);
  const base = raw.map(Math.floor);
  let rest = n - base.reduce((a, b) => a + b, 0);
  raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (rest > 0) {
        base[i]++;
        rest--;
      }
    });
  return base;
}

// Arrondit une liste de quantités réelles en entiers dont la somme vaut l'arrondi de la somme (plus forts restes).
function distribute(raw: number[]): number[] {
  const target = Math.round(raw.reduce((a, b) => a + b, 0));
  const base = raw.map(Math.floor);
  let rest = target - base.reduce((a, b) => a + b, 0);
  raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (rest > 0) {
        base[i]++;
        rest--;
      }
    });
  return base;
}

function menageFor(age: number, r: () => number): string {
  const pick = (opts: [string, number][]) => {
    let x = r() * opts.reduce((s, o) => s + o[1], 0);
    for (const [v, w] of opts) if ((x -= w) <= 0) return v;
    return opts[opts.length - 1][0];
  };
  if (age < 25) return pick([["vit chez ses parents", 0.7], ["seul·e", 0.15], ["en couple sans enfant", 0.15]]);
  if (age < 45) return pick([["en couple avec enfants", 0.5], ["en couple sans enfant", 0.22], ["seul·e", 0.2], ["parent seul avec enfants", 0.08]]);
  if (age < 65) return pick([["en couple avec enfants", 0.38], ["en couple, enfants partis", 0.32], ["seul·e", 0.22], ["parent seul avec enfants", 0.08]]);
  return pick([["en couple, enfants partis", 0.55], ["seul·e", 0.45]]);
}

export function generatePanel(spec: PanelSpec, N: number, seed: number) {
  if (spec.groupes?.length) return generatePanelGroupes(spec, N, seed);
  const rng = makeRng(seed);
  const P = spec.population_16_plus.valeur;
  const ag = spec.agriculteurs;
  const nAgri = Math.min(ag.surechantillon, N - 1);
  const nOther = N - nAgri;
  const pAgri = P * ag.part_16_plus;
  const pOther = P - pAgri;
  const sk: PersonaSkeleton[] = [];
  const pickW = <T extends string>(xs: { v: T; w: number }[]) => rng.pickWeighted(xs.map((x) => ({ value: x.v, weight: x.w })));

  // Agriculteurs (suréchantillonnés, poids réduits en conséquence).
  const nBio = ag.part_bio > 0 ? Math.max(1, Math.round(nAgri * ag.part_bio)) : 0;
  for (let i = 0; i < nAgri; i++) {
    const age = rng.int(ag.age_min, ag.age_max);
    const suisse = rng.next() < ag.part_suisses;
    const electeur = suisse && age >= 18;
    sk.push({
      id: "",
      age,
      tranche_age: "agri",
      sexe: rng.next() < ag.part_hommes ? "homme" : "femme",
      nationalite: suisse ? "suisse" : "etrangere",
      activite: `agriculteur·rice, exploitation familiale ${ag.orientation}${i < nBio ? ", en bio" : ", en production conventionnelle"}`,
      menage: menageFor(age, rng.next),
      lieu_de_vie: "ferme ou hameau",
      parti_proche: null, // pas de donnée locale sur l'orientation politique des agriculteurs : non renseignée plutôt qu'inventée
      electeur,
      poids: pAgri / nAgri,
    });
  }

  // Reste de la population par quotas (et non par tirage libre) : âge, nationalité et sexe par tranche, activités, partis.
  // Avec un petit panel, un tirage au hasard déforme trop la composition (constaté sur le run-001).
  const q = quotas(spec.tranches_age.map((t) => t.part), nOther);
  const nForeign = distribute(spec.tranches_age.map((t, ti) => (t.part_etrangers ?? spec.part_etrangers.valeur) * q[ti]));
  const nWomen = distribute(spec.tranches_age.map((_, ti) => spec.part_femmes.valeur * q[ti]));
  const nActive = spec.tranches_age.reduce((s, t, ti) => s + (t.min >= 20 && t.max <= 64 ? q[ti] : 0), 0);
  const activities = rng.shuffle(
    quotas(spec.activites_actifs.map((a) => a.part), nActive).flatMap((n, i) => Array(n).fill(spec.activites_actifs[i].activite) as string[]),
  );
  const others: PersonaSkeleton[] = [];
  spec.tranches_age.forEach((t, ti) => {
    const foreignFlags = rng.shuffle(Array.from({ length: q[ti] }, (_, k) => k < nForeign[ti]));
    const womanFlags = rng.shuffle(Array.from({ length: q[ti] }, (_, k) => k < nWomen[ti]));
    for (let k = 0; k < q[ti]; k++) {
      const age = rng.int(t.min, t.max);
      const suisse = !foreignFlags[k];
      const electeur = suisse && age >= 18;
      let activite: string;
      if (t.max <= 24 && age < 20) activite = "en formation (apprentissage ou études)";
      else if (t.min >= 65) activite = "retraité·e";
      else if (t.min >= 20 && t.max <= 64) activite = activities.pop()!;
      else activite = rng.next() < 0.6 ? "en formation (apprentissage ou études)" : "jeune employé·e ou apprenti·e en fin de formation";
      others.push({
        id: "",
        age,
        tranche_age: t.tranche,
        sexe: womanFlags[k] ? "femme" : "homme",
        nationalite: suisse ? "suisse" : "etrangere",
        activite,
        menage: menageFor(age, rng.next),
        lieu_de_vie: pickW(spec.lieux_de_vie.map((l) => ({ v: l.lieu, w: l.part }))),
        parti_proche: null,
        electeur,
        poids: (pOther * t.part) / Math.max(1, q[ti]),
      });
    }
  });
  const electors = rng.shuffle(others.filter((s) => s.electeur));
  const partyCounts = quotas(spec.partis.map((p) => p.part), electors.length);
  let idx = 0;
  partyCounts.forEach((n, pi) => {
    for (let k = 0; k < n; k++) electors[idx++].parti_proche = spec.partis[pi].parti;
  });
  sk.push(...others);
  const shuffled = rng.shuffle(sk).map((s, i) => ({ ...s, id: `p${String(i + 1).padStart(2, "0")}` }));
  const hypotheses = spec.pays && spec.pays !== "CH" ? [
    `Univers du panel : ${spec.univers}. Population de référence ${spec.population_16_plus.valeur} (${spec.population_16_plus.source}).`,
    `Sensibilité politique répartie par quotas entre les électeurs (citoyens de 18 ans et plus) selon ${spec.source_partis} : approximation, car ces parts décrivent les votants, pas l'ensemble du corps électoral.`,
    "Nationalité, sexe et activité répartis par quotas pour respecter les proportions malgré la petite taille du panel.",
    "Composition des ménages : hypothèse générique, non sourcée.",
    ...spec.hypotheses,
  ] : [
    `Univers du panel : ${spec.univers}. Population de référence ${spec.population_16_plus.valeur} (${spec.population_16_plus.source}).`,
    nAgri > Math.round(ag.part_16_plus * N)
      ? `Agriculteurs suréchantillonnés (${nAgri} personas) puis repondérés à leur part réelle (${(ag.part_16_plus * 100).toFixed(1).replace(".", ",")} % des 16 ans et plus, ${ag.source}).`
      : `Agriculteurs : ${nAgri} persona${nAgri > 1 ? "s" : ""} sur ${N}, selon leur part réelle (${(ag.part_16_plus * 100).toFixed(1).replace(".", ",")} % des 16 ans et plus, ${ag.source}).`,
    `Sensibilité politique répartie par quotas selon les résultats du Conseil national 2023 dans la commune (${spec.source_partis}), appliquée à tous les électeurs non agriculteurs : approximation, car ces parts décrivent les votants, pas l'ensemble du corps électoral. Pour les agriculteurs, sensibilité politique non renseignée, faute de donnée locale : le persona l'infère de son profil.`,
    "Nationalité, sexe et activité professionnelle répartis par quotas pour respecter les proportions malgré la petite taille du panel.",
    "Composition des ménages et lieux de vie dans la commune : hypothèses génériques, non sourcées.",
    ...spec.hypotheses,
  ];
  return { skeletons: shuffled, hypotheses };
}

// Panel d'une organisation : quotas par groupe selon les effectifs déclarés, âge uniforme dans la tranche du groupe,
// sexe et nationalité selon les parts de référence fournies (déclarées comme hypothèses).
function generatePanelGroupes(spec: PanelSpec, N: number, seed: number) {
  const rng = makeRng(seed);
  const gs = spec.groupes!;
  const total = gs.reduce((s, g) => s + g.effectif, 0);
  const q = quotas(gs.map((g) => g.effectif / total), N);
  const sk: PersonaSkeleton[] = [];
  gs.forEach((g, gi) => {
    const nForeign = Math.round(spec.part_etrangers.valeur * q[gi]);
    const nWomen = Math.round(spec.part_femmes.valeur * q[gi]);
    const foreignFlags = rng.shuffle(Array.from({ length: q[gi] }, (_, k) => k < nForeign));
    const womanFlags = rng.shuffle(Array.from({ length: q[gi] }, (_, k) => k < nWomen));
    for (let k = 0; k < q[gi]; k++) {
      const age = rng.int(g.age_min, g.age_max);
      const suisse = !foreignFlags[k];
      sk.push({
        id: "",
        age,
        tranche_age: g.nom,
        sexe: womanFlags[k] ? "femme" : "homme",
        nationalite: suisse ? "suisse" : "etrangere",
        activite: g.nom,
        menage: menageFor(age, rng.next),
        lieu_de_vie: spec.lieux_de_vie.length ? rng.pickWeighted(spec.lieux_de_vie.map((l) => ({ value: l.lieu, weight: l.part }))) : "non précisé",
        parti_proche: null,
        electeur: suisse && age >= 18,
        poids: g.effectif / Math.max(1, q[gi]),
      });
    }
  });
  const shuffled = rng.shuffle(sk).map((s, i) => ({ ...s, id: `p${String(i + 1).padStart(2, "0")}` }));
  const hypotheses = [
    `Univers du panel : ${spec.univers}. Effectif total déclaré : ${total} (${spec.population_16_plus.source}).`,
    `Groupes répartis par quotas selon les effectifs déclarés : ${gs.map((g) => `${g.nom} ${g.effectif}`).join(", ")}. Âge tiré au hasard dans la tranche de chaque groupe.`,
    `Parts de femmes (${Math.round(spec.part_femmes.valeur * 100)} %) et de personnes de nationalité étrangère (${Math.round(spec.part_etrangers.valeur * 100)} %) : hypothèse, valeurs de référence (${spec.part_etrangers.source}), faute de composition déclarée.`,
    "Composition des ménages : hypothèse générique, non sourcée. Aucune sensibilité politique attribuée.",
    ...spec.hypotheses,
  ];
  return { skeletons: shuffled, hypotheses };
}
