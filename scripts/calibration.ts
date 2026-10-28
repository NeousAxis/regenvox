// Mesure de l'erreur de l'estimation directe du nombre de participants (le « modèle seul ») sur tous les tests à l'aveugle
// publiés, et écriture de src/calibration.ts : la plateforme affiche ces chiffres pour que l'utilisateur sache
// de combien l'estimation peut se tromper. À relancer après chaque nouveau bilan.
// Usage : npx tsx scripts/calibration.ts
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson } from "../src/store.js";

const T = (f: string) => readJson<any>(path.join(ROOT, "tests_aveugles", f)).lignes;
const facteur = (p: number, r: number) => Math.max(p, r) / Math.min(p, r);
const r2 = (x: number) => Math.round(x * 100) / 100;

function mesure(cas: [number, number][], sources: string[]) {
  const f = cas.map(([p, r]) => facteur(p, r)).sort((a, b) => a - b);
  const n = f.length;
  const mediane = n % 2 ? f[(n - 1) / 2] : (f[n / 2 - 1] + f[n / 2]) / 2;
  // Le pire cas, avec son sens (estimé, réel) : plus parlant pour le lecteur qu'un facteur.
  const [estime, reel] = cas.reduce((a, b) => (facteur(b[0], b[1]) > facteur(a[0], a[1]) ? b : a));
  return { n, facteur_median: r2(mediane), dans_un_facteur_2: f.filter((x) => x <= 2).length, dans_un_facteur_3: f.filter((x) => x <= 3).length, facteur_max: r2(f[n - 1]), pire_cas: { estime, reel }, surestimations: cas.filter(([p, r]) => p > r).length, sources };
}

const geneve = T("geneve_bilan.json").map((l: any) => [l.participants_modele_seul, l.reel]);
const lausanne = T("lausanne_bilan_relance.json").map((l: any) => [l.naif_participants_estimes, l.participants_reels]);
const medellin = T("medellin_bilan.json").map((l: any) => [l.participants_modele_seul, l.reel]);
const petitions = T("mobilisations_bilan.json").map((l: any) => [l.naif_signatures_estimees, l.signatures]);

const calibration = {
  genere_le: new Date().toISOString().slice(0, 10),
  methode: "estimation directe du nombre de participants par le modèle seul, à partir du texte de la démarche",
  demarches: mesure([...lausanne, ...geneve, ...medellin], ["tests_aveugles/lausanne_bilan_relance.json", "tests_aveugles/geneve_bilan.json", "tests_aveugles/medellin_bilan.json"]),
  petitions: mesure(petitions, ["tests_aveugles/mobilisations_bilan.json"]),
};
const sortie = path.join(ROOT, "src", "calibration.ts");
fs.writeFileSync(sortie, `// Généré par scripts/calibration.ts à partir des bilans des tests à l'aveugle. Ne pas modifier à la main.\nexport const CALIBRATION = ${JSON.stringify(calibration, null, 2)} as const;\n`, "utf8");
console.log(JSON.stringify(calibration, null, 1));
