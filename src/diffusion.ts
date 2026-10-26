// Modèle de propagation sur réseau social (déterministe à graine égale).
// États : A = co-porteur / adhésion active, O = opposition active, N = pas encore positionné.
// Chaque mois, une personne N bascule en A ou O selon sa position initiale (base) et la part pondérée de ses proches déjà en A ou O (influence sociale).
import { makeRng } from "./rng.js";
import type { PersonaOut, PersonaSkeleton, Position } from "./schemas.js";

export interface DiffParams {
  qA: number;
  qO: number;
  decay: number; // usure mensuelle : part des soutiens non convaincus qui retombent en N
  months: number;
  runs: number;
  k: number;
  rewire: number;
  baseA: Record<Position, number>;
  baseO: Record<Position, number>;
}

export const DEFAULT_PARAMS: DiffParams = {
  qA: 0.15,
  qO: 0.12,
  decay: 0.015,
  months: 24,
  runs: 400,
  k: 4,
  rewire: 0.1,
  baseA: { porteur: 0, interesse: 0.02, indifferent: 0.005, reticent: 0.001, opposant: 0 },
  baseO: { porteur: 0, interesse: 0.0005, indifferent: 0.003, reticent: 0.02, opposant: 0 },
};

export const PARAM_NOTES = [
  "Les taux de bascule mensuels (base) et les coefficients d'influence sociale (qA, qO) sont des hypothèses du modèle, non calibrées sur données réelles à ce stade.",
  "Une analyse de sensibilité (qA et qO à 50 % et 150 %) encadre les résultats.",
  "Réseau : chaque persona est relié à ses 4 voisins les plus proches (même lieu de vie, même activité, âge proche), avec 10 % de liens aléatoires.",
  "État A = soutien à la démarche, état O = opposition active. Les soutiens peu convaincus s'usent (1,5 % par mois retombent en position neutre) ; les porteurs très convaincus (intensité 4 ou 5) et les opposants restent stables.",
  "Version 2 du modèle : la version 1 saturait (88 % à 99 % de soutien pour tous les angles), car un simple intérêt était traité comme une adhésion quasi certaine.",
];

const ROLE_W = { leader_opinion: 2, relai: 1.5, suiveur: 1, isole: 0.5 } as const;
const ROLE_SUSC = { leader_opinion: 0.8, relai: 1, suiveur: 1.2, isole: 0.5 } as const;

export function buildNetwork(skels: PersonaSkeleton[], seed: number, k: number, rewire: number): number[][] {
  const rng = makeRng(seed);
  const n = skels.length;
  const sim = (a: PersonaSkeleton, b: PersonaSkeleton) =>
    (a.lieu_de_vie === b.lieu_de_vie ? 2 : 0) + (a.activite === b.activite ? 2 : 0) + (Math.abs(a.age - b.age) <= 12 ? 1 : 0) + (a.nationalite === b.nationalite ? 0.5 : 0);
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i++) {
    const cands = rng
      .shuffle([...Array(n).keys()].filter((j) => j !== i))
      .sort((x, y) => sim(skels[i], skels[y]) - sim(skels[i], skels[x]))
      .slice(0, k);
    for (let j of cands) {
      if (rng.next() < rewire) j = rng.int(0, n - 1);
      if (j !== i) {
        adj[i].add(j);
        adj[j].add(i);
      }
    }
  }
  return adj.map((s) => [...s]);
}

export interface AngleDiffusion {
  angle_id: number;
  params: { qA: number; qO: number };
  monthly: { mois: number; A: number; O: number; N: number }[];
  finalA: { mean: number; p05: number; p95: number };
  finalO: { mean: number; p05: number; p95: number };
  moisMiParcours: number | null;
  personaAdoption: Record<string, { A: number; O: number }>;
}

export function simulateAngle(
  angleId: number,
  personas: PersonaOut[],
  skels: PersonaSkeleton[],
  net: number[][],
  p: DiffParams,
  seed: number,
): AngleDiffusion {
  const rng = makeRng(seed);
  const n = skels.length;
  const byId = new Map(personas.map((x) => [x.id, x]));
  const W = skels.map((s) => s.poids);
  const totalW = W.reduce((a, b) => a + b, 0);
  const pos: Position[] = [];
  const strength: number[] = [];
  const susc: number[] = [];
  const convinced: boolean[] = [];
  skels.forEach((s, i) => {
    const pe = byId.get(s.id)!;
    const r = pe.reactions.find((x) => x.angle_id === angleId)!;
    pos[i] = r.position;
    // L'influence d'un persona est pondérée par la part de population qu'il représente : un groupe suréchantillonné
    // (les agriculteurs) ne doit pas peser plus dans le réseau que dans la commune réelle.
    strength[i] = ROLE_W[pe.influence.role] * (1 + Math.log1p(pe.influence.taille_cercle) / 3) * (r.intensite / 3) * (W[i] / (totalW / n));
    susc[i] = ROLE_SUSC[pe.influence.role];
    convinced[i] = r.position === "porteur" && r.intensite >= 4;
  });
  const sumA = new Array(p.months + 1).fill(0);
  const sumO = new Array(p.months + 1).fill(0);
  const finalsA: number[] = [];
  const finalsO: number[] = [];
  const adoptA = new Array(n).fill(0);
  const adoptO = new Array(n).fill(0);

  for (let run = 0; run < p.runs; run++) {
    let st = pos.map((x) => (x === "porteur" ? "A" : x === "opposant" ? "O" : "N"));
    const share = (s: string[], v: string) => s.reduce((acc, x, i) => acc + (x === v ? W[i] : 0), 0) / totalW;
    sumA[0] += share(st, "A");
    sumO[0] += share(st, "O");
    for (let t = 1; t <= p.months; t++) {
      const next = [...st];
      for (let i = 0; i < n; i++) {
        if (st[i] === "A" && !convinced[i] && rng.next() < p.decay) {
          next[i] = "N";
          continue;
        }
        if (st[i] !== "N") continue;
        let wa = 0, wo = 0, wt = 0;
        for (const j of net[i]) {
          wt += strength[j];
          if (st[j] === "A") wa += strength[j];
          else if (st[j] === "O") wo += strength[j];
        }
        const fa = wt ? wa / wt : 0;
        const fo = wt ? wo / wt : 0;
        const pA = Math.min(1, p.baseA[pos[i]] + p.qA * fa * susc[i]);
        const pO = Math.min(1 - pA, p.baseO[pos[i]] + p.qO * fo * susc[i]);
        const r = rng.next();
        if (r < pA) next[i] = "A";
        else if (r < pA + pO) next[i] = "O";
      }
      st = next;
      sumA[t] += share(st, "A");
      sumO[t] += share(st, "O");
    }
    finalsA.push(share(st, "A"));
    finalsO.push(share(st, "O"));
    st.forEach((x, i) => {
      if (x === "A") adoptA[i]++;
      if (x === "O") adoptO[i]++;
    });
  }
  const q = (arr: number[], f: number) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(f * s.length))];
  };
  const monthly = sumA.map((a, t) => {
    const A = a / p.runs, O = sumO[t] / p.runs;
    return { mois: t, A: round(A), O: round(O), N: round(1 - A - O) };
  });
  const fA = finalsA.reduce((a, b) => a + b, 0) / p.runs;
  const half = monthly[0].A + (fA - monthly[0].A) / 2;
  const mid = monthly.find((m) => m.A >= half);
  const personaAdoption: Record<string, { A: number; O: number }> = {};
  skels.forEach((s, i) => (personaAdoption[s.id] = { A: round(adoptA[i] / p.runs), O: round(adoptO[i] / p.runs) }));
  return {
    angle_id: angleId,
    params: { qA: p.qA, qO: p.qO },
    monthly,
    finalA: { mean: round(fA), p05: round(q(finalsA, 0.05)), p95: round(q(finalsA, 0.95)) },
    finalO: { mean: round(finalsO.reduce((a, b) => a + b, 0) / p.runs), p05: round(q(finalsO, 0.05)), p95: round(q(finalsO, 0.95)) },
    moisMiParcours: fA - monthly[0].A > 0.01 && mid ? mid.mois : null,
    personaAdoption,
  };
}

export const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
