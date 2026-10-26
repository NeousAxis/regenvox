// Test à l'aveugle sur des mobilisations réelles terminées : quelles pétitions mobilisent le plus ?
// Le panel ne voit que les textes ; les signatures réelles sont sous scellé (data/SCELLE_mobilisations_chiffres.json)
// et ne sont lues qu'après le commit des prévisions.
// Usage : npx tsx src/mobilisations.ts prevision <run>... | comparer
import fs from "node:fs";
import path from "node:path";
import { makeRng } from "./rng.js";
import { ROOT, runDir, okPath, readJson, writeJson, exists } from "./store.js";
import type { PersonaSkeleton, ReactionMobilOut } from "./schemas.js";
import type { Petition } from "./requests.js";

const DIR = path.join(ROOT, "tests_aveugles");
const PREV = path.join(DIR, "mobilisations_previsions.json");
const NAIF = path.join(DIR, "mobilisations_naif.json");
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const moyenne = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Rangs moyens (ex aequo partagés), puis corrélation de Pearson des rangs = Spearman.
function rangs(xs: number[]) {
  const idx = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const r = Array(xs.length).fill(0);
  for (let k = 0; k < idx.length; ) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1].x === idx[k].x) j++;
    for (let m = k; m <= j; m++) r[idx[m].i] = (k + j) / 2 + 1;
    k = j + 1;
  }
  return r;
}
function pearson(a: number[], b: number[]) {
  const ma = moyenne(a), mb = moyenne(b);
  const s = a.reduce((t, x, i) => t + (x - ma) * (b[i] - mb), 0);
  return s / Math.sqrt(a.reduce((t, x) => t + (x - ma) ** 2, 0) * b.reduce((t, x) => t + (x - mb) ** 2, 0));
}
export const spearman = (a: number[], b: number[]) => pearson(rangs(a), rangs(b));

function prevoir(runIds: string[]) {
  const petitions = readJson<{ petitions: Petition[] }>(path.join(ROOT, "data", "mobilisations_textes.json")).petitions;
  const indice = new Map(petitions.map((p) => [p.id, { signe: 0, diffusion: 0 }]));
  for (const runId of runIds) {
    // Chaque panel compte pour une part égale ; à l'intérieur, les personas sont pondérés par leur poids.
    const skels = readJson<PersonaSkeleton[]>(path.join(runDir(runId), "panel.json")).filter((s) => s.electeur);
    if (skels.some((s) => !exists(okPath(runId, "petitions", s.id)))) throw new Error(`${runId} : étape petitions incomplète.`);
    const W = skels.reduce((t, s) => t + s.poids, 0);
    for (const s of skels)
      for (const r of readJson<ReactionMobilOut>(okPath(runId, "petitions", s.id)).reactions) {
        const v = indice.get(r.item_id)!;
        v.signe += (s.poids / W / runIds.length) * r.participe_proba;
        v.diffusion += (s.poids / W / runIds.length) * r.participe_proba * (1 + r.partage_proba);
      }
  }
  const naif = fs.existsSync(NAIF) ? readJson<{ estimations: { id: string; signatures_estimees: number }[] }>(NAIF).estimations : [];
  return petitions.map((p) => ({ id: p.id, titre: p.titre, portee: p.portee, indice_signature: r3(indice.get(p.id)!.signe), indice_diffusion: r3(indice.get(p.id)!.diffusion), naif_signatures_estimees: naif.find((n) => n.id === p.id)?.signatures_estimees ?? null }));
}

function comparer() {
  const prev = readJson<{ previsions: ReturnType<typeof prevoir> }>(PREV).previsions;
  const reels = readJson<{ petitions: { id: string; signatures_affichees: number }[] }>(path.join(ROOT, "data", "SCELLE_mobilisations_chiffres.json")).petitions;
  const lignes = prev.map((p) => ({ ...p, signatures: reels.find((r) => r.id === p.id)?.signatures_affichees ?? null })).filter((l) => l.signatures != null);
  const sig = lignes.map((l) => l.signatures!);
  const rho = spearman(lignes.map((l) => l.indice_signature), sig);
  const rhoDiff = spearman(lignes.map((l) => l.indice_diffusion), sig);
  const avecNaif = lignes.filter((l) => l.naif_signatures_estimees != null);
  const rhoNaif = avecNaif.length === lignes.length ? spearman(avecNaif.map((l) => l.naif_signatures_estimees!), sig) : null;
  // Test par permutation : probabilité d'obtenir une corrélation au moins aussi forte par hasard.
  const rng = makeRng(42);
  let plusFort = 0;
  const N = 10000;
  for (let k = 0; k < N; k++) {
    const perm = rng.shuffle([...sig]);
    if (spearman(lignes.map((l) => l.indice_signature), perm) >= rho) plusFort++;
  }
  const top = (xs: number[]) => xs.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x).slice(0, 5).map((o) => o.i);
  const communsTop5 = top(lignes.map((l) => l.indice_signature)).filter((i) => top(sig).includes(i)).length;
  const synthese = { n: lignes.length, spearman_panel: r3(rho), p_valeur_permutation: r3(plusFort / N), spearman_panel_diffusion: r3(rhoDiff), spearman_llm_naif: rhoNaif == null ? null : r3(rhoNaif), top5_communs_sur_5: communsTop5 };
  writeJson(path.join(DIR, "mobilisations_bilan.json"), { synthese, lignes });
  const md = [
    "# Test à l'aveugle : quelles pétitions mobilisent le plus ?",
    "",
    "Généré par `npx tsx src/mobilisations.ts comparer`, après le commit des prévisions (historique Git de `tests_aveugles/`).",
    "",
    "| Pétition | Indice du panel | Estimation d'un modèle seul | Signatures réelles |",
    "|---|---|---|---|",
    ...lignes.sort((a, b) => b.signatures! - a.signatures!).map((l) => `| ${l.titre.slice(0, 80)} | ${String(l.indice_signature).replace(".", ",")} | ${l.naif_signatures_estimees ?? "n.d."} | ${l.signatures} |`),
    "",
    `Corrélation de rang entre l'indice du panel et les signatures réelles : ${String(synthese.spearman_panel).replace(".", ",")} (probabilité d'un tel résultat par hasard : ${String(synthese.p_valeur_permutation).replace(".", ",")}). Modèle seul, sans panel : ${synthese.spearman_llm_naif == null ? "n.d." : String(synthese.spearman_llm_naif).replace(".", ",")}. Pétitions communes aux cinq premières prévues et aux cinq premières réelles : ${communsTop5} sur 5.`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(DIR, "mobilisations_bilan.md"), md, "utf8");
  return synthese;
}

if (path.basename(process.argv[1] ?? "") === "mobilisations.ts") {
  const [, , cmd, ...reste] = process.argv;
  if (cmd === "prevision" && reste.length) {
    if (fs.existsSync(PREV)) throw new Error(`${PREV} existe déjà : une prévision écrite ne se réécrit pas.`);
    const previsions = prevoir(reste);
    fs.mkdirSync(DIR, { recursive: true });
    writeJson(PREV, { ecrit_le: new Date().toISOString(), runs: reste, previsions });
    for (const p of [...previsions].sort((a, b) => b.indice_signature - a.indice_signature)) console.log(`${p.id} ${String(p.indice_signature).padEnd(6)} ${p.titre.slice(0, 70)}`);
    console.log(`Prévisions écrites : ${path.relative(ROOT, PREV)}. Les commiter AVANT de lancer la comparaison.`);
  } else if (cmd === "comparer") console.log(JSON.stringify(comparer(), null, 1));
  else console.log("Usage : npx tsx src/mobilisations.ts prevision <run>... | comparer");
}
