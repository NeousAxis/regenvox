// Métriques déterministes : Résonance, Viralité, Activation, Résistance, Participation, et backtest sur votations réelles.
import { makeRng } from "./rng.js";
import { round, type AngleDiffusion } from "./diffusion.js";
import { POSITION_SCORE, POSITIONS, type PersonaOut, type PersonaSkeleton, type Position, type MobilisationOut } from "./schemas.js";

export interface AngleMetrics {
  angle_id: number;
  resonance: number; // 0..10, réaction initiale du panel
  repartition_initiale: Record<Position, number>;
  soutien: { moyenne: number; p05: number; p95: number; sensibilite: [number, number] }; // part favorable à horizon
  coporteurs: number; // part qui soutient ET s'engage concrètement (atelier ou portage)
  resistance: { moyenne: number; p05: number; p95: number };
  viralite: number; // part ayant pris position (soutien ou opposition) à horizon
  mois_mi_parcours: number | null;
  participation: { avis_en_ligne: number; atelier: number; porteurs_projet: number };
  acteurs_cles: { groupe: string; n: number; part_initiale_favorable: number; part_finale_soutien: number; part_coporteurs: number } | null;
}

const wmean = (vals: number[], w: number[]) => vals.reduce((s, v, i) => s + v * w[i], 0) / w.reduce((a, b) => a + b, 0);

export function angleMetrics(
  angleId: number,
  personas: PersonaOut[],
  skels: PersonaSkeleton[],
  diff: AngleDiffusion,
  sens: [number, number],
  acteursCles?: { groupe: string; match: RegExp },
): AngleMetrics {
  const byId = new Map(personas.map((p) => [p.id, p]));
  const W = skels.map((s) => s.poids);
  const R = skels.map((s) => byId.get(s.id)!.reactions.find((r) => r.angle_id === angleId)!);
  const pA = skels.map((s) => diff.personaAdoption[s.id].A);
  const resonanceRaw = wmean(R.map((r) => POSITION_SCORE[r.position]), W);
  const repartition = Object.fromEntries(POSITIONS.map((pos) => [pos, round(wmean(R.map((r) => (r.position === pos ? 1 : 0)), W))])) as Record<Position, number>;
  const engaged = R.map((r) => (r.engagement >= 3 ? 1 : 0));
  let cles: AngleMetrics["acteurs_cles"] = null;
  if (acteursCles) {
    const idx = skels.map((s, i) => (acteursCles.match.test(s.activite) ? i : -1)).filter((i) => i >= 0);
    if (idx.length) {
      const w = idx.map((i) => W[i]);
      cles = {
        groupe: acteursCles.groupe,
        n: idx.length,
        part_initiale_favorable: round(wmean(idx.map((i) => (["porteur", "interesse"].includes(R[i].position) ? 1 : 0)), w)),
        part_finale_soutien: round(wmean(idx.map((i) => pA[i]), w)),
        part_coporteurs: round(wmean(idx.map((i) => pA[i] * engaged[i]), w)),
      };
    }
  }
  return {
    angle_id: angleId,
    resonance: round(((resonanceRaw + 3) / 6) * 10, 1),
    repartition_initiale: repartition,
    soutien: { moyenne: diff.finalA.mean, p05: diff.finalA.p05, p95: diff.finalA.p95, sensibilite: sens },
    coporteurs: round(wmean(pA.map((a, i) => a * engaged[i]), W)),
    resistance: { moyenne: diff.finalO.mean, p05: diff.finalO.p05, p95: diff.finalO.p95 },
    viralite: round(diff.finalA.mean + diff.finalO.mean),
    mois_mi_parcours: diff.moisMiParcours,
    participation: {
      avis_en_ligne: round(wmean(R.map((r) => (r.engagement >= 2 ? 1 : 0)), W)),
      atelier: round(wmean(engaged, W)),
      porteurs_projet: round(wmean(R.map((r) => (r.engagement >= 4 ? 1 : 0)), W)),
    },
    acteurs_cles: cles,
  };
}

// Mobilisation : probabilités moyennes pondérées de participer à chaque format, intervalle par rééchantillonnage des personas,
// conversion en nombre d'habitants, et version corrigée par la surestimation de participation mesurée sur les votations réelles.
export function mobilisationMetrics(
  angleId: number,
  mobs: MobilisationOut[],
  skels: PersonaSkeleton[],
  population: number,
  facteurRealisme: number | null,
  seed: number,
  acteursCles?: { groupe: string; match: RegExp },
) {
  const byId = new Map(mobs.map((m) => [m.id, m.angles.find((a) => a.angle_id === angleId)!]));
  const W = skels.map((s) => s.poids);
  const rows = skels.map((s) => byId.get(s.id)!);
  const keys = ["avis_en_ligne", "atelier_presentiel", "parcours_distance", "atelier_si_invite_par_un_proche"] as const;
  const rng = makeRng(seed);
  const B = 1000;
  const out: Record<string, { part: number; ic90: [number, number]; habitants: number; habitants_corriges: number | null }> = {};
  for (const k of keys) {
    const vals = rows.map((r) => r[k]);
    const m = wmean(vals, W);
    const boots: number[] = [];
    for (let b = 0; b < B; b++) {
      const idx = skels.map(() => rng.int(0, skels.length - 1));
      boots.push(wmean(idx.map((i) => vals[i]), idx.map((i) => W[i])));
    }
    boots.sort((a, b) => a - b);
    out[k] = {
      part: round(m),
      ic90: [round(boots[Math.floor(B * 0.05)]), round(boots[Math.floor(B * 0.95)])],
      habitants: Math.round(m * population),
      habitants_corriges: facteurRealisme == null ? null : Math.round(m * facteurRealisme * population),
    };
  }
  let cles: { groupe: string; n: number; avis_en_ligne: number; atelier_presentiel: number; parcours_distance: number; atelier_si_invite_par_un_proche: number } | null = null;
  if (acteursCles) {
    const idx = skels.map((s, i) => (acteursCles.match.test(s.activite) ? i : -1)).filter((i) => i >= 0);
    if (idx.length) {
      const w = idx.map((i) => W[i]);
      const mk = (k: (typeof keys)[number]) => round(wmean(idx.map((i) => rows[i][k]), w));
      cles = { groupe: acteursCles.groupe, n: idx.length, avis_en_ligne: mk("avis_en_ligne"), atelier_presentiel: mk("atelier_presentiel"), parcours_distance: mk("parcours_distance"), atelier_si_invite_par_un_proche: mk("atelier_si_invite_par_un_proche") };
    }
  }
  const effetInvitation = out.atelier_presentiel.part > 0 ? round(out.atelier_si_invite_par_un_proche.part / out.atelier_presentiel.part, 2) : null;
  return { angle_id: angleId, formats: out, effet_invitation: effetInvitation, acteurs_cles: cles };
}

export function formatsPreferes(mobs: MobilisationOut[], skels: PersonaSkeleton[]) {
  const byId = new Map(mobs.map((m) => [m.id, m.format_prefere]));
  const W = skels.map((s) => s.poids);
  const opts = ["avis_en_ligne", "atelier_presentiel", "parcours_distance", "aucun"] as const;
  return Object.fromEntries(opts.map((o) => [o, round(wmean(skels.map((s) => (byId.get(s.id) === o ? 1 : 0)), W))]));
}

export interface VoteRef {
  vote_id: string;
  date: string;
  titre: string;
  vuadens_oui: number | null; // en %
  vuadens_participation: number | null;
  fribourg_oui: number | null;
  suisse_oui: number | null;
  famille?: string; // "ecologie" ou "pro_paysan"
  role?: "test" | "etalonnage";
  effet_agriculture?: string; // "contrainte_agriculture" | "soutien_agriculture" | "climat_energie"
}

const logit = (p: number) => Math.log(Math.min(0.995, Math.max(0.005, p)) / (1 - Math.min(0.995, Math.max(0.005, p))));
const inv = (x: number) => 1 / (1 + Math.exp(-x));

// Backtest : le panel répond aux votations sans connaître leur résultat.
// Étalonnage : biais (en logit) mesuré sur les votations anciennes d'étalonnage, appliqué aux votations de test de la même famille.
export function backtest(personas: PersonaOut[], skels: PersonaSkeleton[], votes: VoteRef[], seed: number) {
  const byId = new Map(personas.map((p) => [p.id, p]));
  const voters = skels.filter((s) => s.electeur);
  const est = (sample: PersonaSkeleton[], voteId: string) => {
    let wp = 0, wpy = 0, w = 0;
    for (const s of sample) {
      const v = byId.get(s.id)!.votes.find((x) => x.vote_id === voteId)!;
      w += s.poids;
      wp += s.poids * v.participe_proba;
      wpy += s.poids * v.participe_proba * v.oui_proba;
    }
    return { turnout: wp / w, yes: wp ? wpy / wp : 0 };
  };
  const rng = makeRng(seed);
  const pct = (x: number) => round(x * 100, 1);
  const raw = votes.map((v) => {
    const point = est(voters, v.vote_id);
    const ys: number[] = [], ts: number[] = [];
    for (let b = 0; b < 1000; b++) {
      const sample = voters.map(() => voters[rng.int(0, voters.length - 1)]);
      const e = est(sample, v.vote_id);
      ys.push(e.yes);
      ts.push(e.turnout);
    }
    ys.sort((a, b) => a - b);
    ts.sort((a, b) => a - b);
    return { v, yes: point.yes, turnout: point.turnout, ic: [pct(ys[50]), pct(ys[949])] as [number, number], icT: [pct(ts[50]), pct(ts[949])] as [number, number] };
  });
  const cal = raw.filter((r) => r.v.role === "etalonnage" && r.v.vuadens_oui != null);
  const deltas: Record<string, number> = {};
  for (const fam of new Set(cal.map((r) => r.v.famille ?? "ecologie"))) {
    const rs = cal.filter((r) => (r.v.famille ?? "ecologie") === fam);
    deltas[fam] = rs.reduce((s, r) => s + (logit(r.v.vuadens_oui! / 100) - logit(r.yes)), 0) / rs.length;
  }
  const calT = cal.filter((r) => r.v.vuadens_participation != null && r.turnout > 0);
  const turnoutFactor = calT.length ? calT.reduce((s, r) => s + r.v.vuadens_participation! / 100 / r.turnout, 0) / calT.length : null;
  const err = (a: number | null, b: number | null) => (a == null || b == null ? null : round(Math.abs(a - b), 1));
  const rows = raw.map((r) => {
    const v = r.v;
    const d = deltas[v.famille ?? "ecologie"];
    const yesCal = v.role !== "etalonnage" && d != null ? pct(inv(logit(r.yes) + d)) : null;
    const tCal = v.role !== "etalonnage" && turnoutFactor ? pct(Math.min(1, r.turnout * turnoutFactor)) : null;
    return {
      vote_id: v.vote_id,
      titre: v.titre,
      date: v.date,
      role: v.role ?? "test",
      famille: v.famille ?? "ecologie",
      simule_oui: pct(r.yes),
      simule_oui_ic90: r.ic,
      simule_oui_etalonne: yesCal,
      simule_participation: pct(r.turnout),
      simule_participation_ic90: r.icT,
      simule_participation_etalonnee: tCal,
      reel_oui: v.vuadens_oui,
      reel_participation: v.vuadens_participation,
      ecart_oui: err(pct(r.yes), v.vuadens_oui),
      ecart_oui_etalonne: err(yesCal, v.vuadens_oui),
      ecart_baseline_canton: err(v.fribourg_oui, v.vuadens_oui),
      ecart_baseline_suisse: err(v.suisse_oui, v.vuadens_oui),
      ecart_participation: err(pct(r.turnout), v.vuadens_participation),
      ecart_participation_etalonnee: err(tCal, v.vuadens_participation),
      sens_correct: v.vuadens_oui == null ? null : pct(r.yes) >= 50 === v.vuadens_oui >= 50,
      sens_correct_etalonne: v.vuadens_oui == null || yesCal == null ? null : yesCal >= 50 === v.vuadens_oui >= 50,
    };
  });
  // Étalonnage par famille d'effet sur l'agriculture, en validation croisée (leave-one-out) :
  // chaque votation de test est corrigée avec le biais mesuré sur les AUTRES votations de sa famille, jamais avec son propre résultat.
  const testRaw = raw.filter((r) => (r.v.role ?? "test") === "test" && r.v.vuadens_oui != null);
  const loo: Record<string, number | null> = {};
  for (const r of testRaw) {
    const fam = r.v.effet_agriculture;
    // Les votations du même jour sont exclues aussi : elles partagent la même campagne et fuiraient l'une dans l'autre.
    const others = testRaw.filter((o) => o !== r && fam && o.v.effet_agriculture === fam && o.v.date !== r.v.date);
    loo[r.v.vote_id] =
      others.length >= 1 ? pct(inv(logit(r.yes) + others.reduce((s, o) => s + (logit(o.v.vuadens_oui! / 100) - logit(o.yes)), 0) / others.length)) : null;
  }
  const famBias: Record<string, number> = {};
  for (const fam of new Set(testRaw.map((r) => r.v.effet_agriculture).filter(Boolean) as string[])) {
    const rs = testRaw.filter((r) => r.v.effet_agriculture === fam);
    famBias[fam] = round(rs.reduce((s, r) => s + (logit(r.v.vuadens_oui! / 100) - logit(r.yes)), 0) / rs.length, 3);
  }
  rows.forEach((row: any) => {
    const l = loo[row.vote_id];
    row.effet_agriculture = votes.find((v) => v.vote_id === row.vote_id)?.effet_agriculture ?? null;
    row.simule_oui_famille_loo = l ?? null;
    row.ecart_oui_famille_loo = l == null || row.reel_oui == null ? null : round(Math.abs(l - row.reel_oui), 1);
  });
  const test = rows.filter((r) => r.role === "test");
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 1) : null;
  };
  const count = (xs: (boolean | null)[]) => `${xs.filter((x) => x === true).length}/${xs.filter((x) => x != null).length}`;
  return {
    votes: rows,
    biais_par_effet_agriculture: famBias,
    etalonnage: { biais_logit_par_famille: Object.fromEntries(Object.entries(deltas).map(([k, v]) => [k, round(v, 3)])), facteur_participation: turnoutFactor == null ? null : round(turnoutFactor, 3), n_votes_etalonnage: cal.length },
    synthese: {
      n_votes_test: test.length,
      n_electeurs_panel: voters.length,
      ecart_moyen_oui_brut: mean(test.map((r) => r.ecart_oui)),
      ecart_moyen_oui_etalonne: mean(test.map((r) => r.ecart_oui_etalonne ?? r.ecart_oui)),
      ecart_moyen_oui_baseline_canton: mean(test.map((r) => r.ecart_baseline_canton)),
      ecart_moyen_oui_baseline_suisse: mean(test.map((r) => r.ecart_baseline_suisse)),
      ecart_moyen_participation_brut: mean(test.map((r) => r.ecart_participation)),
      ecart_moyen_participation_etalonnee: mean(test.map((r) => r.ecart_participation_etalonnee ?? r.ecart_participation)),
      ecart_moyen_oui_famille_loo: mean(test.map((r: any) => r.ecart_oui_famille_loo ?? r.ecart_oui)),
      ecart_moyen_oui_corrigees_seules: mean(test.filter((r: any) => r.ecart_oui_famille_loo != null).map((r: any) => r.ecart_oui_famille_loo)),
      n_votes_corriges: test.filter((r: any) => r.ecart_oui_famille_loo != null).length,
      ecart_max_oui_famille_loo: Math.max(...test.map((r: any) => r.ecart_oui_famille_loo ?? r.ecart_oui ?? 0)),
      sens_correct_baseline_toujours_non: count(test.map((r: any) => (r.reel_oui == null ? null : r.reel_oui < 50))),
      sens_correct_baseline_canton: count(test.map((r: any) => (r.reel_oui == null || r.ecart_baseline_canton == null ? null : (votes.find((v) => v.vote_id === r.vote_id)!.fribourg_oui! >= 50) === r.reel_oui >= 50))),
      sens_correct_famille_loo: count(test.map((r: any) => (r.simule_oui_famille_loo == null || r.reel_oui == null ? r.sens_correct : r.simule_oui_famille_loo >= 50 === r.reel_oui >= 50))),
      sens_correct_brut: count(test.map((r) => r.sens_correct)),
      sens_correct_etalonne: count(test.map((r) => r.sens_correct_etalonne ?? r.sens_correct)),
    },
  };
}
