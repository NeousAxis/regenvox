// Test à l'aveugle : participation aux démarches participatives passées de Lausanne.
// Le panel ne voit que les textes ; la participation publiée est sous scellé (data/SCELLE_lausanne_chiffres.json)
// et n'est lue qu'après le commit des prévisions.
// Usage : npx tsx src/lausanne.ts prevision <run> | comparer
import fs from "node:fs";
import path from "node:path";
import { makeRng } from "./rng.js";
import { ROOT, runDir, okPath, readJson, writeJson, exists } from "./store.js";
import type { PersonaSkeleton, ReactionMobilOut } from "./schemas.js";
import type { Demarche } from "./requests.js";
import { spearman } from "./mobilisations.js";

const DIR = path.join(ROOT, "tests_aveugles");
const SUFFIXE = process.env.SUFFIXE ?? "";
const PREV = path.join(DIR, `lausanne_previsions${SUFFIXE}.json`);
const NAIF = path.join(DIR, "lausanne_naif.json");
const r4 = (x: number) => Math.round(x * 10000) / 10000;

function prevoir(runId: string) {
  const demarches = readJson<{ demarches: Demarche[] }>(path.join(ROOT, "data", "lausanne_textes.json")).demarches;
  const skels = readJson<PersonaSkeleton[]>(path.join(runDir(runId), "panel.json"));
  if (skels.some((s) => !exists(okPath(runId, "demarches", s.id)))) throw new Error(`${runId} : étape demarches incomplète.`);
  const W = skels.reduce((t, s) => t + s.poids, 0);
  const taux = new Map(demarches.map((d) => [d.id, 0]));
  for (const s of skels)
    for (const r of readJson<ReactionMobilOut>(okPath(runId, "demarches", s.id)).reactions) taux.set(r.item_id, taux.get(r.item_id)! + (s.poids / W) * r.participe_proba);
  const naif = fs.existsSync(NAIF) ? readJson<{ estimations: { id: string; participants_estimes: number }[] }>(NAIF).estimations : [];
  return demarches.map((d) => ({ id: d.id, annee: d.annee, nom: d.nom_demarche, taux_prevu_16_plus: r4(taux.get(d.id)!), naif_participants_estimes: naif.find((n) => n.id === d.id)?.participants_estimes ?? null }));
}

// Les champs du fichier scellé sont lus après le commit des prévisions ; la mesure retenue est la mesure principale publiée.
function comparer(champMesure: string, champPopulation: string) {
  const prev = readJson<{ previsions: ReturnType<typeof prevoir> }>(PREV).previsions;
  const reels = readJson<{ demarches: Record<string, any>[] }>(path.join(ROOT, "data", "SCELLE_lausanne_chiffres.json")).demarches;
  const val = (o: any, champ: string) => champ.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
  const lignes = prev
    .map((p) => {
      const r = reels.find((x) => x.id === p.id);
      const mesure = r ? Number(val(r, champMesure)) : NaN;
      const pop = r ? Number(val(r, champPopulation)) : NaN;
      return { ...p, participants_reels: mesure, population: pop, taux_reel: mesure / pop };
    })
    .filter((l) => Number.isFinite(l.taux_reel) && l.taux_reel > 0);
  const reel = lignes.map((l) => l.taux_reel);
  const rho = spearman(lignes.map((l) => l.taux_prevu_16_plus), reel);
  const rhoNaif = lignes.every((l) => l.naif_participants_estimes != null) ? spearman(lignes.map((l) => l.naif_participants_estimes! / l.population), reel) : null;
  const rng = makeRng(7);
  let plusFort = 0;
  const N = 10000;
  for (let k = 0; k < N; k++) if (spearman(lignes.map((l) => l.taux_prevu_16_plus), rng.shuffle([...reel])) >= rho) plusFort++;
  const rapport = lignes.map((l) => l.taux_prevu_16_plus / l.taux_reel).sort((a, b) => a - b);
  const synthese = { n: lignes.length, spearman_panel: r4(rho), p_valeur_permutation: r4(plusFort / N), spearman_llm_naif: rhoNaif == null ? null : r4(rhoNaif), rapport_median_prevu_sur_reel: r4(rapport[Math.floor(rapport.length / 2)]), mesure: champMesure, population: champPopulation };
  writeJson(path.join(DIR, `lausanne_bilan${SUFFIXE}.json`), { synthese, lignes });
  const pct = (x: number) => (100 * x).toFixed(2).replace(".", ",") + " %";
  const md = [
    "# Test à l'aveugle : participation aux démarches participatives de Lausanne",
    "",
    "Généré par `npx tsx src/lausanne.ts comparer`, après le commit des prévisions (historique Git de `tests_aveugles/`).",
    "",
    "| Démarche | Taux prévu par le panel | Participants estimés par un modèle seul | Participants réels | Taux réel |",
    "|---|---|---|---|---|",
    ...[...lignes].sort((a, b) => b.taux_reel - a.taux_reel).map((l) => `| ${l.annee} ${l.nom.slice(0, 70)} | ${pct(l.taux_prevu_16_plus)} | ${l.naif_participants_estimes ?? "n.d."} | ${l.participants_reels} | ${pct(l.taux_reel)} |`),
    "",
    `Corrélation de rang entre taux prévu et taux réel : ${String(synthese.spearman_panel).replace(".", ",")} (probabilité d'un tel résultat par hasard : ${String(synthese.p_valeur_permutation).replace(".", ",")}). Modèle seul : ${synthese.spearman_llm_naif == null ? "n.d." : String(synthese.spearman_llm_naif).replace(".", ",")}. Le panel surestime la participation d'un facteur médian de ${String(synthese.rapport_median_prevu_sur_reel).replace(".", ",")}.`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(DIR, `lausanne_bilan${SUFFIXE}.md`), md, "utf8");
  return synthese;
}

if (path.basename(process.argv[1] ?? "") === "lausanne.ts") {
  const [, , cmd, a, b] = process.argv;
  if (cmd === "prevision" && a) {
    if (fs.existsSync(PREV)) throw new Error(`${PREV} existe déjà : une prévision écrite ne se réécrit pas.`);
    const previsions = prevoir(a);
    fs.mkdirSync(DIR, { recursive: true });
    writeJson(PREV, { ecrit_le: new Date().toISOString(), run: a, previsions });
    for (const p of [...previsions].sort((x, y) => y.taux_prevu_16_plus - x.taux_prevu_16_plus)) console.log(`${p.id} ${p.annee} ${(100 * p.taux_prevu_16_plus).toFixed(2)} % ${p.nom.slice(0, 60)}`);
    console.log(`Prévisions écrites : ${path.relative(ROOT, PREV)}. Les commiter AVANT de lancer la comparaison.`);
  } else if (cmd === "comparer" && a && b) console.log(JSON.stringify(comparer(a, b), null, 1));
  else console.log("Usage : npx tsx src/lausanne.ts prevision <run> | comparer <champ mesure> <champ population>");
}
