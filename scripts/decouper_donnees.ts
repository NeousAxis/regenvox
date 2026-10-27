// Découpe data/communes_ch.json en un fichier compressé par canton (avec ses communes) et un pour la Suisse :
// le navigateur ne télécharge que le canton concerné, et l'ensemble tient dans un petit hébergement.
// Usage : npx tsx scripts/decouper_donnees.ts <dossier de sortie, ex. web/public/donnees>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT, readJson } from "../src/store.js";

const sortie = path.resolve(process.argv[2] ?? path.join(ROOT, "web", "public", "donnees"));
const src = readJson<any>(path.join(ROOT, "data", "communes_ch.json"));
const sources = src.sources ?? [];
fs.rmSync(sortie, { recursive: true, force: true });
fs.mkdirSync(sortie, { recursive: true });
const ecrit = (nom: string, x: unknown) => fs.writeFileSync(path.join(sortie, nom), zlib.gzipSync(JSON.stringify(x), { level: 9 }));
const entree = (e: any, cible: { nom: string; canton: string }) => ({ panel: e.panel, cible: { ...cible, pays: "CH", description: e.description }, contexte_factuel: e.contexte_factuel, sources: e.sources ?? sources });

const parCanton: Record<string, any> = {};
for (const c of Object.values<any>(src.cantons)) parCanton[c.canton] = { canton: entree(c, { nom: c.nom, canton: c.canton }), communes: {} };
for (const c of Object.values<any>(src.communes)) parCanton[c.canton].communes[c.num] = entree(c, { nom: c.nom, canton: c.canton });
for (const [sigle, x] of Object.entries(parCanton)) ecrit(`${sigle}.json.gz`, x);
ecrit("suisse.json.gz", entree(src.suisse, { nom: "Suisse", canton: "CH" }));
fs.copyFileSync(path.join(ROOT, "data", "communes_index.json"), path.join(sortie, "..", "communes_index.json"));
const taille = fs.readdirSync(sortie).reduce((s, f) => s + fs.statSync(path.join(sortie, f)).size, 0);
console.log(`${Object.keys(src.communes).length} communes dans ${Object.keys(parCanton).length} fichiers de canton, plus la Suisse : ${Math.round(taille / 1024)} Ko -> ${sortie}`);
