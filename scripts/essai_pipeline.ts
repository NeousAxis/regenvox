// Essai de l'enchaînement complet sans appel payant : les réponses du modèle sont rejouées depuis un run déjà validé
// (run-002, cas Vuadens, même graine donc même panel). Vérifie la mécanique de la plateforme, pas la qualité du modèle.
// Usage : npx tsx scripts/essai_pipeline.ts [dossier de sortie du rapport]
import fs from "node:fs";
import path from "node:path";
import { executerTest, ETAPES } from "../src/pipeline.js";
import { renderRapportPlateforme } from "../src/rapport.js";
import { ROOT, runDir, okPath, readJson } from "../src/store.js";
import type { StepName } from "../src/schemas.js";

const SOURCE = "run-002";
const RUN = "essai-rejeu";
fs.rmSync(runDir(RUN), { recursive: true, force: true });
let appels = 0, compares = 0, differents = 0;
const etapes: string[] = [];
try {
  await executerTest("vuadens-bio", RUN, async (r) => {
    appels++;
    // Non-régression : à la première tentative, la requête doit être identique à celle du run d'origine.
    const origine = path.join(runDir(SOURCE), "requests", r.step, `${r.item}.json`);
    if (r.attempt === 1 && fs.existsSync(origine)) {
      const o = readJson<any>(origine);
      if (o.attempt === 1) {
        compares++;
        if (o.system.replaceAll("Résonance", "RegenVox") !== r.system || o.user !== r.user) differents++; // le dossier de Vuadens a été enrichi depuis run-002 : écarts attendus dans les messages des personas
      }
    }
    const texte = JSON.stringify(readJson(okPath(SOURCE, r.step as StepName, r.item)));
    return { texte, tokens_entree: 0, tokens_sortie: 0, modele: "rejeu" };
  }, { etape: (cle, etat) => etapes.push(`${cle}:${etat}`), parallele: 8 });
  const html = renderRapportPlateforme(RUN, { organisation: "Commune de Vuadens (essai)", date: "27.10.2026" });
  const sortie = path.join(process.argv[2] ?? path.join(ROOT, "runs"), "rapport_essai.html");
  fs.writeFileSync(sortie, html, "utf8");
  console.log(JSON.stringify({ appels, requetes_comparees: compares, requetes_differentes: differents, etapes_faites: etapes.filter((e) => e.endsWith(":fait")).length, etapes_total: ETAPES.length, rapport: sortie, taille_rapport: html.length }, null, 1));
} finally {
  fs.rmSync(runDir(RUN), { recursive: true, force: true });
}
