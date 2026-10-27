// Affiche les messages préparés pour trois cas de plateforme (commune, canton, école), pour relire les tournures.
// Usage : npx tsx scripts/essai_vocabulaire.ts
import fs from "node:fs";
import path from "node:path";
import { construireCas, type SourceTerritoire } from "../src/plateforme.js";
import { cmdInit, cmdPanel, cmdPrepare } from "../src/cli.js";
import { ROOT, runDir, okPath, readJson, writeJson } from "../src/store.js";

const ech = readJson<any>(path.join(ROOT, "cases", "echallens", "case.json"));
const src: SourceTerritoire = { panel: readJson(path.join(ROOT, "cases", "echallens", "panel.json")), cible: ech.cible, contexte_factuel: ech.contexte_factuel };
const demarche = { enjeu: "Rendre les déplacements quotidiens plus sûrs et moins polluants.", objectif: "Doubler la part des trajets à pied et à vélo d'ici 2030.", formulation: "Comment voulez-vous vous déplacer dans votre quotidien en 2035 ?", formats: ["avis_en_ligne", "atelier"], horizon_mois: 18 };
const essais = [
  { id: "voc-commune", p: { organisation: { type: "commune" as const, nom: "Commune d'Echallens" }, territoire: { niveau: "commune" as const, commune_num: 5518 }, demarche } },
  { id: "voc-canton", p: { organisation: { type: "administration" as const, nom: "État de Vaud" }, territoire: { niveau: "canton" as const, canton: "VD" }, demarche } },
  { id: "voc-ecole", p: { organisation: { type: "ecole" as const, nom: "Collège du Léman" }, groupes: [{ nom: "élèves", effectif: 400, age_min: 12, age_max: 15 }, { nom: "parents", effectif: 600, age_min: 35, age_max: 55 }, { nom: "enseignants", effectif: 40, age_min: 25, age_max: 64 }], demarche } },
];
for (const e of essais) {
  const cid = `_${e.id}`;
  fs.rmSync(path.join(ROOT, "cases", cid), { recursive: true, force: true });
  fs.rmSync(runDir(e.id), { recursive: true, force: true });
  const s = e.id === "voc-canton" ? { ...src, cible: { ...src.cible, nom: "Vaud", canton: "VD", description: "Canton de Suisse romande." } } : src;
  const { cas, panel } = construireCas(cid, e.p, s, src, 42);
  writeJson(path.join(ROOT, "cases", cid, "case.json"), cas);
  writeJson(path.join(ROOT, "cases", cid, "panel.json"), panel);
  writeJson(path.join(ROOT, "cases", cid, "votes_reels.json"), []);
  cmdInit(cid, e.id);
  cmdPanel(e.id);
  const fo = cmdPrepare(e.id, "formulateur");
  const formu = { enjeu: cas.enjeu, objectif: cas.objectif, angles: [{ id: 1, formulation: cas.angle_fourni!, origine: "decideur", acteurs_actives: [], chemins_ouverts: [], risque_de_verrouillage: "" }] };
  writeJson(okPath(e.id, "formulateur", "main"), formu);
  const pe = cmdPrepare(e.id, "personas");
  const p1 = readJson<any>(pe[0].request);
  for (const x of pe) writeJson(okPath(e.id, "personas", x.item), { id: x.item, portrait: "Portrait.", reactions: [], influence: { taille_cercle: 5, role: "suiveur", cercle_type: "x" }, votes: [] });
  const mo = cmdPrepare(e.id, "mobilisation").find((x: any) => x.item === p1.item)!;
  const co = cmdPrepare(e.id, "controle").find((x: any) => x.item === p1.item)!;
  const out = [`################ ${e.id}`, "=== formulateur.user", readJson<any>(fo[0].request).user, "=== personas.user", p1.user, "=== personas.system (début)", p1.system.slice(0, 900), "=== mobilisation.user (fin)", readJson<any>(mo.request).user.split("\n").slice(-6).join("\n"), "=== controle.user (fin)", readJson<any>(co.request).user.split("\n").slice(-3).join("\n")];
  console.log(out.join("\n"));
  fs.rmSync(path.join(ROOT, "cases", cid), { recursive: true, force: true });
  fs.rmSync(runDir(e.id), { recursive: true, force: true });
}
