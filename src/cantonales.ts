// Test à l'aveugle sur les votations cantonales du 27.09.2026 (Vaud et Genève), avec la méthode v2 gelée.
// Ni le modèle (connaissances arrêtées en juin 2026) ni nous ne connaissons ces résultats au moment de la prévision.
// Ordre imposé : prevision (écrit et commite les prévisions), PUIS comparer (lit les résultats officiels).
// Usage : npx tsx src/cantonales.ts prevision <run>... | comparer <fichier OGD cantonal>
import fs from "node:fs";
import path from "node:path";
import { makeRng } from "./rng.js";
import { ROOT, runDir, okPath, readJson, writeJson, exists, loadManifest } from "./store.js";
import type { PersonaSkeleton, ScrutinOut } from "./schemas.js";
import type { Cantonale, CaseFile } from "./requests.js";

const B = 500;
const Z90 = 1.645;
const DIR = path.join(ROOT, "tests_aveugles");
const PREV = path.join(DIR, "2026-09-27_cantonales_previsions.json");
const r1 = (x: number) => Math.round(x * 10) / 10;
const moyenne = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];
const fmt = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "n.d." : x.toFixed(1).replace(".", ","));

// Numéros OFS des communes (mêmes que dans scripts/build_communes_v2.py).
const OFS: Record<string, number> = { echallens: 5518, yverdon: 5938, nyon: 5724, meyrin: 6630, carouge: 6608, onex: 6631, "collonge-bellerive": 6616 };

interface Prevision { commune: string; ofs: number; canton: string; vote_id: string; objet_ogd: number; titre: string; recommandation: string; oui_pct: number; ic90_panel_pct: [number, number]; intervalle_pct: [number, number] }

function prevoir(runIds: string[]) {
  const defs = readJson<{ votations: Cantonale[] }>(path.join(ROOT, "data", "cantonales_20260927.json")).votations;
  // Erreur résiduelle du panel brut, mesurée en validation croisée sur les 26 analogues fédéraux (méthode v2, k infini).
  const v2 = readJson<any>(path.join(ROOT, "runs", "scrutins", "analyse_v2.json"));
  const rmse = v2.selection_k.find((s: any) => s.k === "infini").rmse as number;
  const out: Prevision[] = [];
  runIds.forEach((runId, ip) => {
    const caseId = loadManifest(runId).caseId;
    const c = readJson<CaseFile>(path.join(ROOT, "cases", caseId, "case.json"));
    const ofs = OFS[caseId];
    if (!ofs) throw new Error(`Numéro OFS inconnu pour ${caseId}.`);
    const electeurs = readJson<PersonaSkeleton[]>(path.join(runDir(runId), "panel.json")).filter((s) => s.electeur);
    if (electeurs.some((s) => !exists(okPath(runId, "cantonales", s.id)))) throw new Error(`${runId} : étape cantonales incomplète.`);
    const votes = new Map(electeurs.map((s) => [s.id, readJson<ScrutinOut>(okPath(runId, "cantonales", s.id)).votes]));
    const oui = (sample: PersonaSkeleton[], id: string) => {
      let wp = 0, wpy = 0;
      for (const s of sample) {
        const v = votes.get(s.id)!.find((x) => x.vote_id === id)!;
        wp += s.poids * v.participe_proba;
        wpy += s.poids * v.participe_proba * v.oui_proba;
      }
      return wp ? (100 * wpy) / wp : 50;
    };
    const rng = makeRng(3000 + ip);
    for (const d of defs.filter((x) => x.canton === c.cible.canton)) {
      const p = oui(electeurs, d.vote_id);
      const boot = Array.from({ length: B }, () => oui(electeurs.map(() => electeurs[rng.int(0, electeurs.length - 1)]), d.vote_id));
      const ic: [number, number] = [quantile(boot, 0.05), quantile(boot, 0.95)];
      const demi = Math.sqrt(((ic[1] - ic[0]) / 2) ** 2 + (Z90 * rmse) ** 2);
      const reco = /autorités[^:]*:\s*(oui|non)/i.exec(d.campagne)?.[1]?.toLowerCase() ?? "inconnue";
      out.push({ commune: c.cible.nom, ofs, canton: c.cible.canton, vote_id: d.vote_id, objet_ogd: d.objet_ogd, titre: d.titre, recommandation: reco, oui_pct: r1(p), ic90_panel_pct: [r1(ic[0]), r1(ic[1])], intervalle_pct: [r1(Math.max(0, p - demi)), r1(Math.min(100, p + demi))] });
    }
  });
  return { rmse, previsions: out };
}

function comparer(fichierOgd: string) {
  const prev = readJson<{ previsions: Prevision[] }>(PREV).previsions;
  const d = JSON.parse(fs.readFileSync(fichierOgd, "utf8"));
  const lignes = prev.map((p) => {
    const k = d.kantone.find((x: any) => x.geoLevelname === p.canton);
    const v = k.vorlagen.find((x: any) => x.vorlagenId === p.objet_ogd);
    const g = v.gemeinden.find((x: any) => Number(x.geoLevelnummer) === p.ofs);
    const reel = g.resultat.jaStimmenInProzent as number;
    const canton = v.resultat.jaStimmenInProzent as number;
    return { ...p, reel_oui_pct: r1(reel), canton_oui_pct: r1(canton), ecart: r1(Math.abs(p.oui_pct - reel)), ecart_canton: r1(Math.abs(canton - reel)), bon_camp: p.oui_pct >= 50 === reel >= 50, bon_camp_autorites: p.recommandation === "inconnue" ? null : (p.recommandation === "oui") === reel >= 50, dans_intervalle: reel >= p.intervalle_pct[0] && reel <= p.intervalle_pct[1] };
  });
  // Lecture relative : le panel classe-t-il bien les communes entre elles, objet par objet (écart à la moyenne des communes du même canton) ?
  const rel: { pred: number; reel: number }[] = [];
  for (const id of new Set(lignes.map((l) => l.vote_id))) {
    const ls = lignes.filter((l) => l.vote_id === id);
    if (ls.length < 2) continue;
    const mp = moyenne(ls.map((l) => l.oui_pct)), mr = moyenne(ls.map((l) => l.reel_oui_pct));
    ls.forEach((l) => rel.push({ pred: l.oui_pct - mp, reel: l.reel_oui_pct - mr }));
  }
  const corr = (() => {
    const mx = moyenne(rel.map((r) => r.pred)), my = moyenne(rel.map((r) => r.reel));
    const sxy = rel.reduce((s, r) => s + (r.pred - mx) * (r.reel - my), 0);
    const sx = Math.sqrt(rel.reduce((s, r) => s + (r.pred - mx) ** 2, 0)), sy = Math.sqrt(rel.reduce((s, r) => s + (r.reel - my) ** 2, 0));
    return sx && sy ? sxy / (sx * sy) : NaN;
  })();
  const n = lignes.length;
  const synthese = {
    n,
    ecart_moyen: r1(moyenne(lignes.map((l) => l.ecart))),
    ecart_moyen_canton: r1(moyenne(lignes.map((l) => l.ecart_canton))),
    bon_camp: `${lignes.filter((l) => l.bon_camp).length}/${n}`,
    bon_camp_recommandation_autorites: `${lignes.filter((l) => l.bon_camp_autorites).length}/${lignes.filter((l) => l.bon_camp_autorites != null).length}`,
    dans_intervalle: `${lignes.filter((l) => l.dans_intervalle).length}/${n}`,
    correlation_ecarts_entre_communes: Number.isNaN(corr) ? null : Math.round(corr * 100) / 100,
    n_ecarts_entre_communes: rel.length,
  };
  writeJson(path.join(DIR, "2026-09-27_cantonales_bilan.json"), { synthese, lignes });
  const md = [
    "# Test à l'aveugle : votations cantonales du 27 septembre 2026 (Vaud et Genève)",
    "",
    "Généré par `npx tsx src/cantonales.ts comparer`, après le commit des prévisions (voir l'historique Git de `tests_aveugles/`).",
    "",
    "| Commune | Objet | Prévu | Réel | Écart | Écart du résultat cantonal | Dans l'intervalle |",
    "|---|---|---|---|---|---|---|",
    ...lignes.map((l) => `| ${l.commune} | ${l.titre.slice(0, 70)} | ${fmt(l.oui_pct)} % | ${fmt(l.reel_oui_pct)} % | ${fmt(l.ecart)} | ${fmt(l.ecart_canton)} | ${l.dans_intervalle ? "oui" : "non"} |`),
    "",
    `Écart moyen : ${fmt(synthese.ecart_moyen)} points, contre ${fmt(synthese.ecart_moyen_canton)} pour le résultat cantonal (connu seulement après le vote). Bon camp : ${synthese.bon_camp} (suivre la recommandation des autorités : ${synthese.bon_camp_recommandation_autorites}). Résultat réel dans l'intervalle : ${synthese.dans_intervalle}. Corrélation entre écarts prévus et réels d'une commune à l'autre : ${synthese.correlation_ecarts_entre_communes ?? "n.d."} (${synthese.n_ecarts_entre_communes} couples).`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(DIR, "2026-09-27_cantonales_bilan.md"), md, "utf8");
  return synthese;
}

if (path.basename(process.argv[1] ?? "") === "cantonales.ts") {
  const [, , cmd, ...reste] = process.argv;
  if (cmd === "prevision" && reste.length) {
    // Une prévision écrite ne se réécrit pas : sinon on pourrait la refaire après avoir vu les résultats.
    if (fs.existsSync(PREV)) throw new Error(`${PREV} existe déjà.`);
    const p = prevoir(reste);
    fs.mkdirSync(DIR, { recursive: true });
    writeJson(PREV, { ecrit_le: new Date().toISOString(), methode: `Méthode v2 gelée (commit e016514), panel brut sans correction faute d'analogues cantonaux ; intervalle à 90 % combinant l'échantillonnage du panel et l'erreur de validation croisée du panel brut sur les analogues fédéraux (${fmt(p.rmse)} points).`, runs: reste, previsions: p.previsions });
    for (const l of p.previsions) console.log(`${l.commune.padEnd(19)} ${l.vote_id.padEnd(14)} ${fmt(l.oui_pct)} % [${fmt(l.intervalle_pct[0])} ; ${fmt(l.intervalle_pct[1])}] autorités : ${l.recommandation}`);
    console.log(`Prévisions écrites : ${path.relative(ROOT, PREV)}. Les commiter AVANT de lancer la comparaison.`);
  } else if (cmd === "comparer" && reste[0]) console.log(JSON.stringify(comparer(reste[0]), null, 1));
  else console.log("Usage : npx tsx src/cantonales.ts prevision <run>... | comparer <fichier OGD cantonal>");
}
