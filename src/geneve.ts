// Test à l'aveugle de la méthode hybride sur 10 démarches participatives genevoises.
// Trois prévisions comparées : le panel seul, le modèle seul (texte uniquement), et l'hybride (le modèle lit aussi les réponses du panel).
// La participation publiée est sous scellé (data/SCELLE_geneve_chiffres.json) et n'est lue qu'après le commit des prévisions.
// Usage : npx tsx src/geneve.ts resume <run>... | prevision | comparer
import fs from "node:fs";
import path from "node:path";
import { makeRng } from "./rng.js";
import { ROOT, runDir, okPath, readJson, writeJson, exists, loadManifest } from "./store.js";
import type { PersonaSkeleton, ReactionMobilOut } from "./schemas.js";
import type { CaseFile } from "./requests.js";
import { spearman } from "./mobilisations.js";

const DIR = path.join(ROOT, "tests_aveugles");
const RESUME = path.join(DIR, "geneve_resume_panels.json");
const SEUL = path.join(DIR, "geneve_modele_seul.json");
const HYBRIDE = path.join(DIR, "geneve_hybride.json");
const PREV = path.join(DIR, "geneve_previsions.json");
const r4 = (x: number) => Math.round(x * 10000) / 10000;

// Résumé des réponses du panel, par démarche : taux pondéré, part des habitants au-dessus de 10 %, et 6 raisons tirées au hasard.
function resumer(runIds: string[]) {
  const out: any[] = [];
  runIds.forEach((runId, k) => {
    const c = readJson<CaseFile>(path.join(ROOT, "cases", loadManifest(runId).caseId, "case.json"));
    const pop16 = readJson<any>(path.join(ROOT, "cases", loadManifest(runId).caseId, "panel.json")).population_16_plus.valeur as number;
    const skels = readJson<PersonaSkeleton[]>(path.join(runDir(runId), "panel.json"));
    if (skels.some((s) => !exists(okPath(runId, "demarchesge", s.id)))) throw new Error(`${runId} : étape demarchesge incomplète.`);
    const W = skels.reduce((t, s) => t + s.poids, 0);
    const reps = skels.map((s) => ({ s, r: readJson<ReactionMobilOut>(okPath(runId, "demarchesge", s.id)).reactions }));
    const ids = [...new Set(reps.flatMap((x) => x.r.map((r) => r.item_id)))];
    const rng = makeRng(500 + k);
    for (const id of ids) {
      const rows = reps.map((x) => ({ s: x.s, r: x.r.find((r) => r.item_id === id)! }));
      const taux = rows.reduce((t, x) => t + (x.s.poids / W) * x.r.participe_proba, 0);
      const forts = rows.reduce((t, x) => t + (x.r.participe_proba >= 0.1 ? x.s.poids / W : 0), 0);
      const raisons = rng.shuffle(rows.map((x) => `${x.s.age} ans, ${x.s.activite} : ${x.r.raison}`)).slice(0, 6);
      out.push({ id, commune: c.cible.nom, run: runId, habitants_16_plus: pop16, taux_panel: r4(taux), part_habitants_probabilite_10_pct_ou_plus: r4(forts), raisons_echantillon: raisons });
    }
  });
  return out;
}

function prevoir() {
  const resume = readJson<any[]>(RESUME);
  const seul = readJson<{ estimations: { id: string; participants_estimes: number }[] }>(SEUL).estimations;
  const hyb = readJson<{ estimations: { id: string; participants_estimes: number }[] }>(HYBRIDE).estimations;
  return resume.map((r) => ({
    id: r.id,
    commune: r.commune,
    taux_panel: r.taux_panel,
    participants_panel: Math.round(r.taux_panel * r.habitants_16_plus),
    participants_modele_seul: seul.find((x) => x.id === r.id)?.participants_estimes ?? null,
    participants_hybride: hyb.find((x) => x.id === r.id)?.participants_estimes ?? null,
  }));
}

function comparer() {
  const prev = readJson<{ previsions: ReturnType<typeof prevoir> }>(PREV).previsions;
  const reels = readJson<{ demarches: { id: string; nombre: number }[] }>(path.join(ROOT, "data", "SCELLE_geneve_chiffres.json")).demarches;
  const lignes = prev.map((p) => ({ ...p, reel: Number(reels.find((r) => r.id === p.id)?.nombre) })).filter((l) => Number.isFinite(l.reel) && l.reel > 0);
  const reel = lignes.map((l) => l.reel);
  const facteur = (xs: number[]) => {
    // Écart médian en facteur multiplicatif : 2 veut dire deux fois trop ou deux fois trop peu.
    const f = xs.map((x, i) => Math.exp(Math.abs(Math.log(Math.max(1, x) / reel[i])))).sort((a, b) => a - b);
    return r4(f.length % 2 ? f[(f.length - 1) / 2] : (f[f.length / 2 - 1] + f[f.length / 2]) / 2);
  };
  const methodes = { panel: lignes.map((l) => l.participants_panel), modele_seul: lignes.map((l) => l.participants_modele_seul ?? 0), hybride: lignes.map((l) => l.participants_hybride ?? 0) };
  const synthese = Object.fromEntries(Object.entries(methodes).map(([k, v]) => [k, { spearman: r4(spearman(v, reel)), ecart_median_en_facteur: facteur(v) }]));
  writeJson(path.join(DIR, "geneve_bilan.json"), { n: lignes.length, synthese, lignes });
  const md = [
    "# Test à l'aveugle de la méthode hybride : 10 démarches participatives genevoises",
    "",
    "Généré par `npx tsx src/geneve.ts comparer`, après le commit des prévisions (historique Git de `tests_aveugles/`).",
    "",
    "| Démarche | Commune | Panel seul | Modèle seul | Hybride | Réel |",
    "|---|---|---|---|---|---|",
    ...[...lignes].sort((a, b) => b.reel - a.reel).map((l) => `| ${l.id} | ${l.commune} | ${l.participants_panel} | ${l.participants_modele_seul} | ${l.participants_hybride} | ${l.reel} |`),
    "",
    "| Méthode | Corrélation de rang avec le réel | Écart médian (facteur) |",
    "|---|---|---|",
    ...Object.entries(synthese).map(([k, v]: [string, any]) => `| ${k.replace("_", " ")} | ${String(v.spearman).replace(".", ",")} | ${String(v.ecart_median_en_facteur).replace(".", ",")} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(DIR, "geneve_bilan.md"), md, "utf8");
  return { n: lignes.length, synthese };
}

if (path.basename(process.argv[1] ?? "") === "geneve.ts") {
  const [, , cmd, ...reste] = process.argv;
  if (cmd === "resume" && reste.length) {
    writeJson(RESUME, resumer(reste));
    console.log(`Résumé écrit : ${path.relative(ROOT, RESUME)}`);
  } else if (cmd === "prevision") {
    if (fs.existsSync(PREV)) throw new Error(`${PREV} existe déjà : une prévision écrite ne se réécrit pas.`);
    writeJson(PREV, { ecrit_le: new Date().toISOString(), previsions: prevoir() });
    console.log(`Prévisions écrites : ${path.relative(ROOT, PREV)}. Les commiter AVANT de lancer la comparaison.`);
  } else if (cmd === "comparer") console.log(JSON.stringify(comparer(), null, 1));
  else console.log("Usage : npx tsx src/geneve.ts resume <run>... | prevision | comparer");
}
