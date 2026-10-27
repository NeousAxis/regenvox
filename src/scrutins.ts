// Étape scrutins : le panel vote sur des votations absentes du backtest, puis le code corrige son biais par famille.
// Analogues : votations passées au résultat connu, de même thème et de même sens du oui. Seules elles corrigent le biais.
// Hors échantillon : votation postérieure aux connaissances des modèles ; son résultat sert uniquement à la comparaison.
// Prévision : votation à venir, publiée dans le registre (predictions/) avant le vote.
// Usage : npx tsx src/scrutins.ts analyse <run>... | prevision <run>... --publie-le AAAA-MM-JJ
import fs from "node:fs";
import path from "node:path";
import { makeRng } from "./rng.js";
import { ROOT, runDir, okPath, readJson, writeJson, exists, loadManifest } from "./store.js";
import type { PersonaOut, PersonaSkeleton, ScrutinOut } from "./schemas.js";
import type { Scrutin } from "./requests.js";
import type { VoteRef } from "./scoring.js";

interface Reel { vote_id: string; vuadens_oui: number; vuadens_participation: number; fribourg_oui: number; suisse_oui: number; source: string }
type Vote = { vote_id: string; participe_proba: number; oui_proba: number };

const B = 1000;
const Z90 = 1.645;
const logit = (p: number) => Math.log(Math.min(0.995, Math.max(0.005, p)) / (1 - Math.min(0.995, Math.max(0.005, p))));
const inv = (x: number) => 1 / (1 + Math.exp(-x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const moyenne = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// Oui et participation pondérés d'un échantillon d'électeurs, comme dans le backtest.
function estimer(sample: PersonaSkeleton[], votes: Map<string, Vote[]>, voteId: string) {
  let w = 0, wp = 0, wpy = 0;
  for (const s of sample) {
    const v = votes.get(s.id)!.find((x) => x.vote_id === voteId)!;
    w += s.poids;
    wp += s.poids * v.participe_proba;
    wpy += s.poids * v.participe_proba * v.oui_proba;
  }
  return { participation: wp / w, oui: wp ? wpy / wp : 0 };
}

interface Panel {
  runId: string;
  electeurs: PersonaSkeleton[];
  scrutins: Map<string, Vote[]>; // votes de l'étape scrutins
  personas: Map<string, Vote[]>; // votes de l'étape personas (backtest)
  rmseLoo: number; // erreur résiduelle de la méthode, mesurée en validation croisée sur le backtest
}

function chargerPanel(runId: string): Panel {
  const skels = readJson<PersonaSkeleton[]>(path.join(runDir(runId), "panel.json"));
  const electeurs = skels.filter((s) => s.electeur);
  const manquants = electeurs.filter((s) => !exists(okPath(runId, "scrutins", s.id)));
  if (manquants.length) throw new Error(`${runId} : étape scrutins incomplète (${manquants.length} électeurs sans réponse validée).`);
  const scrutins = new Map(electeurs.map((s) => [s.id, readJson<ScrutinOut>(okPath(runId, "scrutins", s.id)).votes]));
  const personas = new Map(electeurs.map((s) => [s.id, readJson<PersonaOut>(okPath(runId, "personas", s.id)).votes]));
  const bt = readJson<any>(path.join(runDir(runId), "metrics.json")).backtest;
  const ecarts = bt.votes.map((v: any) => v.ecart_oui_famille_loo).filter((x: any): x is number => x != null);
  return { runId, electeurs, scrutins, personas, rmseLoo: Math.sqrt(moyenne(ecarts.map((e: number) => e * e))) };
}

// Biais du panel dans une famille (en logit) : moyenne de logit(réel) moins logit(panel) sur les analogues de la famille.
// Analogues de l'étape scrutins (rôle analogue) et votations du backtest de même effet sur l'agriculture.
function biais(famille: string, sample: PersonaSkeleton[], p: Panel, defs: Scrutin[], reels: Map<string, Reel>, refs: VoteRef[], exclure?: string) {
  const termes: number[] = [];
  for (const d of defs.filter((d) => d.role === "analogue" && d.famille === famille && d.vote_id !== exclure)) {
    const r = reels.get(d.vote_id)!;
    termes.push(logit(r.vuadens_oui / 100) - logit(estimer(sample, p.scrutins, d.vote_id).oui));
  }
  for (const v of refs.filter((v) => (v.role ?? "test") === "test" && v.effet_agriculture === famille && v.vuadens_oui != null && v.vote_id !== exclure))
    termes.push(logit(v.vuadens_oui! / 100) - logit(estimer(sample, p.personas, v.vote_id).oui));
  return termes.length ? moyenne(termes) : null;
}

// Rapport entre participation réelle et participation annoncée par le panel, sur les analogues de l'étape scrutins.
function facteurParticipation(sample: PersonaSkeleton[], p: Panel, defs: Scrutin[], reels: Map<string, Reel>) {
  return moyenne(defs.filter((d) => d.role === "analogue").map((d) => reels.get(d.vote_id)!.vuadens_participation / 100 / estimer(sample, p.scrutins, d.vote_id).participation));
}

function quantile(xs: number[], q: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function analyser(runIds: string[]) {
  const caseId = loadManifest(runIds[0]).caseId;
  const dir = path.join(ROOT, "cases", caseId);
  const defs = readJson<{ votations: Scrutin[] }>(path.join(dir, "scrutins.json")).votations;
  const reels = new Map(readJson<{ resultats: Reel[] }>(path.join(dir, "scrutins_reels.json")).resultats.map((r) => [r.vote_id, r]));
  const refs = readJson<VoteRef[]>(path.join(dir, "votes_reels.json"));
  const panels = runIds.map(chargerPanel);
  const cibles = defs.filter((d) => d.role !== "analogue");

  // Point et rééchantillonnage : chaque tirage rééchantillonne les électeurs d'un panel et recalcule aussi la correction.
  const parPanel = panels.map((p, k) => {
    const rng = makeRng(1000 + k);
    const calc = (sample: PersonaSkeleton[]) => {
      const fp = facteurParticipation(sample, p, defs, reels);
      return Object.fromEntries(
        cibles.map((d) => {
          const e = estimer(sample, p.scrutins, d.vote_id);
          const b = biais(d.famille, sample, p, defs, reels, refs);
          return [d.vote_id, { brut: e.oui, corrige: b == null ? e.oui : inv(logit(e.oui) + b), participation: Math.min(1, e.participation * fp), corrige_par_famille: b != null }];
        }),
      );
    };
    const point = calc(p.electeurs);
    const tirages = Array.from({ length: B }, () => calc(p.electeurs.map(() => p.electeurs[rng.int(0, p.electeurs.length - 1)])));
    return { point, tirages };
  });

  const rmse = moyenne(panels.map((p) => p.rmseLoo));
  const lignes = cibles.map((d) => {
    const pt = (k: "brut" | "corrige" | "participation") => moyenne(parPanel.map((x) => x.point[d.vote_id][k])) * 100;
    const boot = Array.from({ length: B }, (_, b) => moyenne(parPanel.map((x) => x.tirages[b][d.vote_id].corrige)) * 100);
    const ic: [number, number] = [quantile(boot, 0.05), quantile(boot, 0.95)];
    const corrige = pt("corrige");
    // Intervalle de prévision : incertitude d'échantillonnage du panel et erreur résiduelle de la méthode (validation croisée du backtest).
    const demi = Math.sqrt(((ic[1] - ic[0]) / 2) ** 2 + (Z90 * rmse) ** 2);
    const r = reels.get(d.vote_id);
    return {
      vote_id: d.vote_id,
      titre: d.titre,
      role: d.role,
      famille: d.famille,
      corrige_par_famille: parPanel.every((x) => x.point[d.vote_id].corrige_par_famille),
      oui_brut_pct: r1(pt("brut")),
      oui_pct: r1(corrige),
      ic90_panel_pct: [r1(ic[0]), r1(ic[1])] as [number, number],
      intervalle_pct: [r1(Math.max(0, corrige - demi)), r1(Math.min(100, corrige + demi))] as [number, number],
      participation_pct: r1(pt("participation")),
      par_panel: Object.fromEntries(panels.map((p, k) => [p.runId, { brut: r1(parPanel[k].point[d.vote_id].brut * 100), corrige: r1(parPanel[k].point[d.vote_id].corrige * 100) }])),
      reel_oui_pct: r?.vuadens_oui ?? null,
      reel_participation_pct: r?.vuadens_participation ?? null,
      canton_oui_pct: r?.fribourg_oui ?? null,
      ecart: r ? r1(Math.abs(corrige - r.vuadens_oui)) : null,
      ecart_brut: r ? r1(Math.abs(pt("brut") - r.vuadens_oui)) : null,
      ecart_canton: r ? r1(Math.abs(r.fribourg_oui - r.vuadens_oui)) : null,
    };
  });

  // Validation croisée sur les analogues : chaque analogue est prédit avec la correction tirée des AUTRES analogues de sa famille.
  const validation = defs
    .filter((d) => d.role === "analogue")
    .map((d) => {
      const r = reels.get(d.vote_id)!;
      const preds = panels.map((p) => {
        const b = biais(d.famille, p.electeurs, p, defs, reels, refs, d.vote_id);
        const e = estimer(p.electeurs, p.scrutins, d.vote_id).oui;
        return { brut: e, corrige: b == null ? null : inv(logit(e) + b) };
      });
      const corr = preds.every((x) => x.corrige != null) ? moyenne(preds.map((x) => x.corrige!)) * 100 : null;
      return {
        vote_id: d.vote_id,
        famille: d.famille,
        oui_brut_pct: r1(moyenne(preds.map((x) => x.brut)) * 100),
        oui_corrige_pct: corr == null ? null : r1(corr),
        reel_oui_pct: r.vuadens_oui,
        ecart_corrige: corr == null ? null : r1(Math.abs(corr - r.vuadens_oui)),
        ecart_brut: r1(Math.abs(moyenne(preds.map((x) => x.brut)) * 100 - r.vuadens_oui)),
        ecart_canton: r1(Math.abs(r.fribourg_oui - r.vuadens_oui)),
      };
    });
  const v = validation.filter((x) => x.ecart_corrige != null);
  const synthese_validation = {
    n: v.length,
    ecart_moyen_corrige: r1(moyenne(v.map((x) => x.ecart_corrige!))),
    ecart_moyen_brut: r1(moyenne(v.map((x) => x.ecart_brut))),
    ecart_moyen_canton: r1(moyenne(v.map((x) => x.ecart_canton))),
  };
  return { runs: runIds, rmse_methode: r1(rmse), cibles: lignes, validation_analogues: validation, synthese_validation };
}

const fmt = (x: number | null) => (x == null ? "n.d." : x.toFixed(1).replace(".", ","));

if (path.basename(process.argv[1] ?? "") === "scrutins.ts") {
  const [, , cmd, ...reste] = process.argv;
  const i = reste.indexOf("--publie-le");
  const publieLe = i >= 0 ? reste[i + 1] : undefined;
  const runIds = reste.filter((x, k) => !x.startsWith("--") && (i < 0 || k !== i + 1));
  if (!["analyse", "prevision"].includes(cmd) || runIds.length === 0) {
    console.log("Usage : npx tsx src/scrutins.ts analyse <run>... | prevision <run>... --publie-le AAAA-MM-JJ");
    process.exit(1);
  }
  const a = analyser(runIds);
  writeJson(path.join(ROOT, "runs", "scrutins", `analyse_${runIds.join("_")}.json`), a);
  for (const l of a.cibles)
    console.log(`${l.vote_id.padEnd(24)} brut ${fmt(l.oui_brut_pct)} corrigé ${fmt(l.oui_pct)} [${fmt(l.intervalle_pct[0])} ; ${fmt(l.intervalle_pct[1])}] participation ${fmt(l.participation_pct)}${l.reel_oui_pct == null ? "" : ` | réel ${fmt(l.reel_oui_pct)} écart ${fmt(l.ecart)} (brut ${fmt(l.ecart_brut)}, canton ${fmt(l.ecart_canton)})`}`);
  const s = a.synthese_validation;
  console.log(`Validation croisée sur ${s.n} analogues : écart moyen corrigé ${fmt(s.ecart_moyen_corrige)}, brut ${fmt(s.ecart_moyen_brut)}, canton ${fmt(s.ecart_moyen_canton)}. Erreur résiduelle de la méthode (backtest) : ${fmt(a.rmse_methode)} points.`);
  if (cmd === "prevision") {
    if (!publieLe || !/^\d{4}-\d{2}-\d{2}$/.test(publieLe)) throw new Error("--publie-le AAAA-MM-JJ obligatoire.");
    const prev = a.cibles.filter((l) => l.role === "prevision");
    const date = "2026-11-29";
    const id = `${date}_votations-federales`;
    const fichier = path.join(ROOT, "predictions", `${id}.json`);
    // Une prévision publiée ne se modifie jamais : on refuse d'écraser.
    if (fs.existsSync(fichier)) throw new Error(`${fichier} existe déjà : une prévision publiée ne se modifie pas.`);
    writeJson(fichier, {
      id,
      publie_le: publieLe,
      evenement: { type: "votation_federale", date, description: "Votations fédérales du 29 novembre 2026, commune de Vuadens (canton de Fribourg)" },
      methode: {
        moteur: "RegenVox, étape scrutins (personas Claude Haiku, sous-agents isolés)",
        runs: runIds,
        correction: `Moyenne des panels ${runIds.join(" et ")}. Biais du panel corrigé en logit par famille, à partir de votations analogues passées au résultat connu (même thème, même sens du oui), recalculé à chaque rééchantillonnage. Intervalle à 90 % : échantillonnage du panel combiné à l'erreur résiduelle de la méthode (${fmt(a.rmse_methode)} points, validation croisée du backtest). Participation : panel multiplié par le rapport réel sur annoncé des analogues. Contrôle fait avant le vote : sur ${a.synthese_validation.n} analogues prédits en validation croisée, écart moyen de ${fmt(a.synthese_validation.ecart_moyen_corrige)} points avec la correction, ${fmt(a.synthese_validation.ecart_moyen_brut)} sans, ${fmt(a.synthese_validation.ecart_moyen_canton)} pour le résultat cantonal. La correction tirée d'un ou deux analogues est donc fragile hors du domaine agricole ; le protocole est maintenu tel que publié, et la valeur brute du panel est publiée à côté pour le critère 4.`,
      },
      criteres_reussite: [
        "Critère principal : écart moyen absolu sur le oui de Vuadens, sur les 4 objets, inférieur à l'écart moyen du résultat cantonal fribourgeois au résultat de Vuadens.",
        "Bon camp (majorité de oui ou de non à Vuadens) pour au moins 3 objets sur 4.",
        "Résultat réel de Vuadens dans l'intervalle de prévision pour au moins 3 objets sur 4.",
        "La correction par famille doit faire mieux que le panel brut (écart moyen corrigé inférieur à l'écart moyen brut).",
      ],
      previsions: prev.map((l) => ({ commune: "Vuadens", objet: l.vote_id, titre: l.titre, oui_pct: l.oui_pct, oui_brut_pct: l.oui_brut_pct, intervalle_pct: l.intervalle_pct, participation_pct: l.participation_pct })),
    });
    console.log(`Prévision écrite : ${path.relative(ROOT, fichier)}`);
  }
}
