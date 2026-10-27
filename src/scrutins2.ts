// Étape scrutins2 (méthode v2) : prévision des votations fédérales pour plusieurs communes.
// Par rapport à la v1 : recommandations officielles et mots d'ordre donnés aux personas, 26 analogues répartis en familles
// (avec le sens du oui), biais par famille ramené vers zéro selon le nombre d'analogues (paramètre k choisi en validation
// croisée sur les seuls analogues), participation par correspondance de quantiles sur les jours de votation analogues.
// Usage : npx tsx src/scrutins2.ts analyse <run>... | prevision <run>... --publie-le AAAA-MM-JJ
import fs from "node:fs";
import path from "node:path";
import { makeRng } from "./rng.js";
import { ROOT, runDir, okPath, readJson, writeJson, exists, loadManifest } from "./store.js";
import type { PersonaSkeleton, ScrutinOut } from "./schemas.js";
import type { ScrutinV2, CaseFile } from "./requests.js";

interface Reel { vote_id: string; commune_oui: number; commune_participation: number; canton_oui: number; suisse_oui: number; source: string }
type Vote = { vote_id: string; participe_proba: number; oui_proba: number };

export const K_GRILLE = [0, 0.5, 1, 2, 4, 8, Infinity];
const B = 500;
const Z90 = 1.645;
const logit = (p: number) => Math.log(Math.min(0.995, Math.max(0.005, p)) / (1 - Math.min(0.995, Math.max(0.005, p))));
const inv = (x: number) => 1 / (1 + Math.exp(-x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const moyenne = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const mediane = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = Math.min(1, Math.max(0, q)) * (s.length - 1);
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (pos - lo);
};

const DEFS = () => readJson<{ votations: ScrutinV2[] }>(path.join(ROOT, "data", "scrutins_v2.json")).votations;

interface Panel { runId: string; caseId: string; commune: string; electeurs: PersonaSkeleton[]; votes: Map<string, Vote[]>; reels: Map<string, Reel> }

function charger(runId: string): Panel {
  const caseId = loadManifest(runId).caseId;
  const commune = readJson<CaseFile>(path.join(ROOT, "cases", caseId, "case.json")).cible.nom;
  const electeurs = readJson<PersonaSkeleton[]>(path.join(runDir(runId), "panel.json")).filter((s) => s.electeur);
  const manquants = electeurs.filter((s) => !exists(okPath(runId, "scrutins2", s.id)));
  if (manquants.length) throw new Error(`${runId} : étape scrutins2 incomplète (${manquants.length} électeurs sans réponse validée).`);
  const votes = new Map(electeurs.map((s) => [s.id, readJson<ScrutinOut>(okPath(runId, "scrutins2", s.id)).votes]));
  const reels = new Map(readJson<{ resultats: Reel[] }>(path.join(ROOT, "cases", caseId, "scrutins_reels_v2.json")).resultats.map((r) => [r.vote_id, r]));
  return { runId, caseId, commune, electeurs, votes, reels };
}

function estimer(sample: PersonaSkeleton[], votes: Map<string, Vote[]>, voteId: string) {
  let w = 0, wp = 0, wpy = 0;
  for (const s of sample) {
    const v = votes.get(s.id)!.find((x) => x.vote_id === voteId)!;
    w += s.poids;
    wp += s.poids * v.participe_proba;
    wpy += s.poids * v.participe_proba * v.oui_proba;
  }
  return { participation: wp / w, oui: wp ? wpy / wp : 0.5 };
}

// Biais du panel dans une famille, en logit de la « variable de famille » (oui si sens +1, non si sens -1),
// ramené vers zéro : somme des écarts / (n + k). k infini : pas de correction. Les analogues exclus (validation croisée) ne comptent pas.
function biais(famille: string, sample: PersonaSkeleton[], p: Panel, defs: ScrutinV2[], k: number, exclure?: ScrutinV2) {
  if (k === Infinity) return 0;
  const termes: number[] = [];
  for (const d of defs) {
    if (d.role !== "analogue" || (exclure && (d.vote_id === exclure.vote_id || d.jour === exclure.jour))) continue;
    const f = d.familles.find((x) => x.famille === famille);
    if (!f) continue;
    const r = p.reels.get(d.vote_id)!;
    termes.push(f.sens * (logit(r.commune_oui / 100) - logit(estimer(sample, p.votes, d.vote_id).oui)));
  }
  return termes.length ? termes.reduce((a, b) => a + b, 0) / (termes.length + k) : 0;
}

const corriger = (oui: number, sens: number, b: number) => inv(logit(oui) + sens * b);

// Participation : rang de la participation annoncée pour le jour visé parmi les jours analogues, reporté sur la distribution
// des participations réelles de ces jours (correspondance de quantiles). Corrige à la fois le niveau et l'écrasement des écarts.
function joursAnalogues(sample: PersonaSkeleton[], p: Panel, defs: ScrutinV2[], exclureJour?: string) {
  const jours = [...new Set(defs.filter((d) => d.role === "analogue" && d.jour !== exclureJour).map((d) => d.jour))];
  return jours.map((j) => {
    const ds = defs.filter((d) => d.role === "analogue" && d.jour === j);
    return { jour: j, panel: moyenne(ds.map((d) => estimer(sample, p.votes, d.vote_id).participation)), reel: moyenne(ds.map((d) => p.reels.get(d.vote_id)!.commune_participation)) };
  });
}
function participationQuantile(tPanel: number, jours: { panel: number; reel: number }[]) {
  const n = jours.length;
  const q = (jours.filter((j) => j.panel < tPanel).length + 0.5 * jours.filter((j) => j.panel === tPanel).length) / n;
  return quantile(jours.map((j) => j.reel), q);
}

export function analyser(runIds: string[]) {
  const defs = DEFS();
  const panels = runIds.map(charger);
  const analogues = defs.filter((d) => d.role === "analogue");
  const cibles = defs.filter((d) => d.role !== "analogue");

  // 1. Choix de k : validation croisée sur les analogues seulement (chaque analogue prédit sans lui ni les votations du même jour).
  const erreursPour = (k: number) => {
    const e: number[] = [];
    for (const p of panels)
      for (const a of analogues)
        for (const f of a.familles) {
          const b = biais(f.famille, p.electeurs, p, defs, k, a);
          const pred = corriger(estimer(p.electeurs, p.votes, a.vote_id).oui, f.sens, b) * 100;
          e.push(pred - p.reels.get(a.vote_id)!.commune_oui);
        }
    return e;
  };
  const selection = K_GRILLE.map((k) => {
    const e = erreursPour(k);
    return { k, ecart_moyen: moyenne(e.map(Math.abs)), rmse: Math.sqrt(moyenne(e.map((x) => x * x))), n: e.length };
  });
  const meilleur = selection.reduce((a, b) => (b.ecart_moyen < a.ecart_moyen ? b : a));
  const k = meilleur.k;
  const rmse = meilleur.rmse;

  // 2. Validation de la participation sur les jours analogues (sans le jour prédit).
  const valPart: { quantiles: number; mediane: number }[] = [];
  for (const p of panels) {
    const jours = joursAnalogues(p.electeurs, p, defs);
    for (const j of jours) {
      const autres = joursAnalogues(p.electeurs, p, defs, j.jour);
      valPart.push({ quantiles: Math.abs(participationQuantile(j.panel, autres) - j.reel), mediane: Math.abs(mediane(autres.map((x) => x.reel)) - j.reel) });
    }
  }

  // 3. Prévisions par commune, avec rééchantillonnage des électeurs (correction et participation recalculées à chaque tirage).
  const communes = panels.map((p, ip) => {
    const rng = makeRng(2000 + ip);
    const calc = (sample: PersonaSkeleton[]) => {
      const jours = joursAnalogues(sample, p, defs);
      const out: Record<string, { brut: number; corrige: number; participation: number }> = {};
      const parJour = new Map<string, number>();
      for (const j of new Set(cibles.map((d) => d.jour))) parJour.set(j, moyenne(cibles.filter((d) => d.jour === j).map((d) => estimer(sample, p.votes, d.vote_id).participation)));
      for (const d of cibles) {
        const f = d.familles[0];
        const e = estimer(sample, p.votes, d.vote_id);
        out[d.vote_id] = { brut: e.oui, corrige: corriger(e.oui, f.sens, biais(f.famille, sample, p, defs, k)), participation: participationQuantile(parJour.get(d.jour)!, jours) };
      }
      return out;
    };
    const point = calc(p.electeurs);
    const tirages = Array.from({ length: B }, () => calc(p.electeurs.map(() => p.electeurs[rng.int(0, p.electeurs.length - 1)])));
    const reference = mediane(joursAnalogues(p.electeurs, p, defs).map((j) => j.reel));
    return {
      run: p.runId,
      cas: p.caseId,
      commune: p.commune,
      electeurs: p.electeurs.length,
      participation_reference_pct: r1(reference),
      cibles: cibles.map((d) => {
        const boot = tirages.map((t) => t[d.vote_id].corrige * 100);
        const ic: [number, number] = [quantile(boot, 0.05), quantile(boot, 0.95)];
        const c = point[d.vote_id].corrige * 100;
        const demi = Math.sqrt(((ic[1] - ic[0]) / 2) ** 2 + (Z90 * rmse) ** 2);
        const r = p.reels.get(d.vote_id);
        return {
          vote_id: d.vote_id,
          titre: d.titre,
          role: d.role,
          famille: d.familles[0].famille,
          oui_brut_pct: r1(point[d.vote_id].brut * 100),
          oui_pct: r1(c),
          ic90_panel_pct: [r1(ic[0]), r1(ic[1])] as [number, number],
          intervalle_pct: [r1(Math.max(0, c - demi)), r1(Math.min(100, c + demi))] as [number, number],
          participation_pct: r1(point[d.vote_id].participation),
          reel_oui_pct: r?.commune_oui ?? null,
          reel_participation_pct: r?.commune_participation ?? null,
          canton_oui_pct: r?.canton_oui ?? null,
          ecart: r ? r1(Math.abs(c - r.commune_oui)) : null,
          ecart_brut: r ? r1(Math.abs(point[d.vote_id].brut * 100 - r.commune_oui)) : null,
          ecart_canton: r ? r1(Math.abs(r.canton_oui - r.commune_oui)) : null,
          ecart_participation: r ? r1(Math.abs(point[d.vote_id].participation - r.commune_participation)) : null,
          ecart_participation_reference: r ? r1(Math.abs(reference - r.commune_participation)) : null,
        };
      }),
    };
  });

  const hors = communes.flatMap((c) => c.cibles.filter((x) => x.role === "hors_echantillon"));
  const synth = (rows: typeof hors) => ({
    n: rows.length,
    ecart_moyen: r1(moyenne(rows.map((x) => x.ecart!))),
    ecart_moyen_brut: r1(moyenne(rows.map((x) => x.ecart_brut!))),
    ecart_moyen_canton: r1(moyenne(rows.map((x) => x.ecart_canton!))),
    ecart_moyen_participation: r1(moyenne(rows.map((x) => x.ecart_participation!))),
    ecart_moyen_participation_reference: r1(moyenne(rows.map((x) => x.ecart_participation_reference!))),
  });
  return {
    runs: runIds,
    k_retenu: k === Infinity ? "infini (pas de correction)" : k,
    selection_k: selection.map((s) => ({ k: s.k === Infinity ? "infini" : s.k, ecart_moyen: r1(s.ecart_moyen), rmse: r1(s.rmse), n: s.n })),
    rmse_methode: r1(rmse),
    validation_participation: { n: valPart.length, ecart_moyen_quantiles: r1(moyenne(valPart.map((x) => x.quantiles))), ecart_moyen_mediane: r1(moyenne(valPart.map((x) => x.mediane))) },
    hors_echantillon: { tous: synth(hors), neutralite: synth(hors.filter((x) => x.vote_id === "h2026-neutralite")), alimentation: synth(hors.filter((x) => x.vote_id === "h2026-alimentation")) },
    communes,
  };
}

const fmt = (x: number | null | undefined) => (x == null ? "n.d." : x.toFixed(1).replace(".", ","));

if (path.basename(process.argv[1] ?? "") === "scrutins2.ts") {
  const [, , cmd, ...reste] = process.argv;
  const i = reste.indexOf("--publie-le");
  const publieLe = i >= 0 ? reste[i + 1] : undefined;
  const runIds = reste.filter((x, j) => !x.startsWith("--") && (i < 0 || j !== i + 1));
  if (!["analyse", "prevision"].includes(cmd) || runIds.length === 0) {
    console.log("Usage : npx tsx src/scrutins2.ts analyse <run>... | prevision <run>... --publie-le AAAA-MM-JJ");
    process.exit(1);
  }
  const a = analyser(runIds);
  writeJson(path.join(ROOT, "runs", "scrutins", "analyse_v2.json"), a);
  console.log(`k retenu : ${a.k_retenu} ; validation croisée : ${a.selection_k.map((s) => `k=${s.k} ${fmt(s.ecart_moyen)}`).join(", ")}`);
  console.log(`Participation, validation sur jours analogues : quantiles ${fmt(a.validation_participation.ecart_moyen_quantiles)}, médiane ${fmt(a.validation_participation.ecart_moyen_mediane)}`);
  for (const c of a.communes)
    for (const l of c.cibles)
      console.log(`${c.commune.padEnd(10)} ${l.vote_id.padEnd(22)} brut ${fmt(l.oui_brut_pct)} corrigé ${fmt(l.oui_pct)} [${fmt(l.intervalle_pct[0])} ; ${fmt(l.intervalle_pct[1])}] part. ${fmt(l.participation_pct)}${l.reel_oui_pct == null ? "" : ` | réel ${fmt(l.reel_oui_pct)} écart ${fmt(l.ecart)} (brut ${fmt(l.ecart_brut)}, canton ${fmt(l.ecart_canton)}) part. réelle ${fmt(l.reel_participation_pct)}`}`);
  const h = a.hors_echantillon.tous;
  console.log(`Hors échantillon (27.09) : écart moyen ${fmt(h.ecart_moyen)} (brut ${fmt(h.ecart_moyen_brut)}, canton ${fmt(h.ecart_moyen_canton)}) ; participation ${fmt(h.ecart_moyen_participation)} contre ${fmt(h.ecart_moyen_participation_reference)} pour la médiane.`);
  if (cmd === "prevision") {
    if (!publieLe || !/^\d{4}-\d{2}-\d{2}$/.test(publieLe)) throw new Error("--publie-le AAAA-MM-JJ obligatoire.");
    const date = "2026-11-29";
    const id = `${date}_votations-federales_romandie`;
    const fichier = path.join(ROOT, "predictions", `${id}.json`);
    // Une prévision publiée ne se modifie jamais : on refuse d'écraser.
    if (fs.existsSync(fichier)) throw new Error(`${fichier} existe déjà : une prévision publiée ne se modifie pas.`);
    writeJson(fichier, {
      id,
      publie_le: publieLe,
      evenement: { type: "votation_federale", date, description: `Votations fédérales du 29 novembre 2026, ${a.communes.length} communes romandes (${a.communes.map((c) => c.commune).join(", ")})` },
      methode: {
        moteur: "RegenVox v2, étape scrutins2 (personas Claude Haiku, sous-agents isolés)",
        runs: runIds,
        correction: `Personas informés des recommandations officielles et des mots d'ordre connus au ${publieLe}. Biais du panel corrigé en logit par famille de votations analogues (même thème, sens du oui pris en compte), ramené vers zéro selon le nombre d'analogues (k = ${a.k_retenu}, choisi en validation croisée sur les seuls analogues : écart moyen ${fmt(a.selection_k.find((s) => String(s.k) === String(a.k_retenu === "infini (pas de correction)" ? "infini" : a.k_retenu))?.ecart_moyen)} points). Intervalle à 90 % : échantillonnage du panel combiné à l'erreur de validation croisée (${fmt(a.rmse_methode)} points). Participation : correspondance de quantiles sur les jours de votation analogues. Cette prévision s'ajoute à celle de Vuadens publiée plus tôt (2026-11-29_votations-federales), qui reste inchangée.`,
      },
      criteres_reussite: [
        "Critère principal : écart moyen absolu sur le oui, sur les 24 prévisions (6 communes, 4 objets), inférieur à l'écart moyen du résultat cantonal de chaque commune au résultat de la commune.",
        "Bon camp (majorité de oui ou de non dans la commune) au moins aussi souvent que le résultat cantonal.",
        "Résultat réel dans l'intervalle de prévision pour au moins 18 prévisions sur 24.",
        "La correction doit faire mieux que le panel brut (écart moyen corrigé inférieur à l'écart moyen brut).",
        "Participation : écart moyen inférieur à celui de la médiane des participations réelles des jours analogues (participation_reference_pct).",
        "Vuadens : la méthode v2 doit faire mieux que la v1 publiée dans 2026-11-29_votations-federales.",
      ],
      previsions: a.communes.flatMap((c) =>
        c.cibles.filter((l) => l.role === "prevision").map((l) => ({ commune: c.commune, objet: l.vote_id, titre: l.titre, oui_pct: l.oui_pct, oui_brut_pct: l.oui_brut_pct, intervalle_pct: l.intervalle_pct, participation_pct: l.participation_pct, participation_reference_pct: c.participation_reference_pct })),
      ),
    });
    console.log(`Prévision écrite : ${path.relative(ROOT, fichier)}`);
  }
}
