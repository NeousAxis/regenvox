// Vérifie data/communes_ch.json : generatePanel doit accepter le panel de chaque commune, de chaque canton et de la
// Suisse (N = 48, graine fixe), et chaque panel doit être cohérent (parts qui somment à 1, poids positifs).
// Usage : npx tsx scripts/check_communes_ch.ts
import fs from "node:fs";
import path from "node:path";
import { generatePanel, type PanelSpec } from "../src/demographe.js";
import { communeCase, cantonCase, suisseCase, loadCommunes, COMMUNES_PATH, type TerritoryCase } from "../src/communes.js";

const N = 48;
const SEED = 20261027;
const data = loadCommunes();
const failures: string[] = [];
const anomalies: string[] = [];

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

// nom : nom officiel du territoire, retiré avant la recherche de tirets (ex. « Blonay - Saint-Légier » est le nom officiel).
function checkSpec(label: string, spec: PanelSpec, nom: string) {
  const near1 = (name: string, xs: number[]) => {
    if (Math.abs(sum(xs) - 1) > 0.002) anomalies.push(`${label} : somme des parts ${name} = ${sum(xs).toFixed(4)}`);
  };
  near1("d'âge", spec.tranches_age.map((t) => t.part));
  near1("d'activités", spec.activites_actifs.map((a) => a.part));
  near1("de partis", spec.partis.map((p) => p.part));
  near1("de lieux de vie", spec.lieux_de_vie.map((l) => l.part));
  if (spec.partis.length === 0) anomalies.push(`${label} : aucun parti`);
  const unit = [spec.part_etrangers.valeur, spec.part_femmes.valeur, spec.agriculteurs.part_16_plus, spec.agriculteurs.part_bio, spec.agriculteurs.part_hommes, spec.agriculteurs.part_suisses];
  if (unit.some((x) => !(x >= 0 && x <= 1))) anomalies.push(`${label} : part hors de [0, 1]`);
  if (!(spec.population_16_plus.valeur > 0)) anomalies.push(`${label} : population nulle`);
  const texts = [spec.univers, spec.population_16_plus.source, spec.source_age, spec.source_partis, spec.source_activites, spec.agriculteurs.source, ...spec.hypotheses];
  if (texts.some((t) => / [–—-] /.test(t.split(nom).join("")))) anomalies.push(`${label} : tiret séparateur dans un texte`);
}

function check(label: string, get: () => TerritoryCase) {
  try {
    const c = get();
    checkSpec(label, c.panel, c.cible.nom);
    if ([c.cible.description, ...c.contexte_factuel].some((t) => / [–—-] /.test(t.split(c.cible.nom).join("")))) anomalies.push(`${label} : tiret séparateur dans un texte`);
    const { skeletons, hypotheses } = generatePanel(c.panel, N, SEED);
    if (skeletons.length !== N) anomalies.push(`${label} : ${skeletons.length} personas au lieu de ${N}`);
    if (skeletons.some((s) => !Number.isFinite(s.poids) || s.poids < 0)) anomalies.push(`${label} : poids négatif ou non fini`);
    if (skeletons.some((s) => !s.activite || !s.lieu_de_vie || !s.menage)) anomalies.push(`${label} : persona incomplet`);
    if (skeletons.some((s) => s.electeur && s.tranche_age !== "agri" && !s.parti_proche)) anomalies.push(`${label} : électeur sans parti`);
    if (hypotheses.length === 0 || c.contexte_factuel.length === 0 || !c.cible.description) anomalies.push(`${label} : hypothèses, contexte ou description manquants`);
  } catch (e) {
    failures.push(`${label} : ${(e as Error).message}`);
  }
}

const nums = Object.keys(data.communes).map(Number);
for (const num of nums) check(`commune ${num} ${data.communes[num].nom}`, () => communeCase(num));
const sigles = Object.keys(data.cantons);
for (const k of sigles) check(`canton ${k}`, () => cantonCase(k));
check("Suisse", () => suisseCase());

// Erreur claire attendue pour un numéro ou un sigle inconnu.
for (const [label, f] of [["commune 99999", () => communeCase(99999)], ["canton XX", () => cantonCase("XX")]] as const) {
  try {
    f();
    failures.push(`${label} : aucune erreur levée pour une entrée inconnue`);
  } catch {
    /* attendu */
  }
}

// Index d'autocomplétion : mêmes communes, triées par nom.
const indexPath = path.join(path.dirname(COMMUNES_PATH), "communes_index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as { num: number; nom: string; canton: string }[];
const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
if (index.length !== nums.length || index.some((e) => data.communes[e.num]?.nom !== e.nom || data.communes[e.num]?.canton !== e.canton)) {
  failures.push("index : ne correspond pas aux communes de communes_ch.json");
}
for (let i = 1; i < index.length; i++) {
  if (key(index[i - 1].nom).localeCompare(key(index[i].nom), "fr") > 0) anomalies.push(`index : ordre ${index[i - 1].nom} / ${index[i].nom}`);
}

const ko = (p: string) => `${(fs.statSync(p).size / 1024).toFixed(0)} Ko`;
console.log(`État des communes : ${data.etat_des_communes} ; généré le ${data.genere_le}`);
console.log(`Communes : ${nums.length} ; cantons : ${sigles.length} ; Suisse : 1 ; total testé : ${nums.length + sigles.length + 1} (N = ${N}, graine ${SEED})`);
console.log(`Échecs (erreur levée) : ${failures.length}`);
failures.slice(0, 20).forEach((f) => console.log("  " + f));
console.log(`Anomalies de cohérence : ${anomalies.length}`);
anomalies.slice(0, 20).forEach((a) => console.log("  " + a));
console.log(`Taille : communes_ch.json ${ko(COMMUNES_PATH)}, communes_index.json ${ko(indexPath)}`);
process.exit(failures.length || anomalies.length ? 1 : 0);
