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
// Cas de plateforme : copie du cas Vuadens marquée « plateforme », pour exercer aussi l'étape niveau.
const CAS = "_essai-plateforme";
const dossierCas = path.join(ROOT, "cases", CAS);
fs.rmSync(runDir(RUN), { recursive: true, force: true });
fs.rmSync(dossierCas, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "cases", "vuadens-bio"), dossierCas, { recursive: true });
const cas = readJson<any>(path.join(dossierCas, "case.json"));
fs.writeFileSync(path.join(dossierCas, "case.json"), JSON.stringify({ ...cas, id: CAS, plateforme: true, organisation: { type: "commune", nom: "Commune de Vuadens (essai)" } }, null, 2));
// Réponse fixe pour l'étape niveau, absente du run d'origine.
const NIVEAU = { formats: [{ format: "avis_en_ligne", participants: 180, raisonnement: "Questionnaire court, invitation à tous les ménages : quelques pour cent des adultes." }, { format: "atelier_presentiel", participants: 35, raisonnement: "Un samedi matin mobilise surtout les personnes déjà engagées." }, { format: "parcours_distance", participants: 60, raisonnement: "Trois séquences en ligne : moins que l'avis, plus que l'atelier." }] };
let appels = 0;
const etapes: string[] = [];
try {
  await executerTest(CAS, RUN, async (r) => {
    appels++;
    const texte = r.step === "niveau" ? JSON.stringify(NIVEAU) : JSON.stringify(readJson(okPath(SOURCE, r.step as StepName, r.item)));
    return { texte, tokens_entree: 0, tokens_sortie: 0, modele: "rejeu" };
  }, { etape: (cle, etat) => etapes.push(`${cle}:${etat}`), parallele: 8 });
  const html = renderRapportPlateforme(RUN, { organisation: "Commune de Vuadens (essai)", date: "27.10.2026" });
  const sortie = path.join(process.argv[2] ?? path.join(ROOT, "runs"), "rapport_essai.html");
  fs.writeFileSync(sortie, html, "utf8");
  const estimation = html.includes("Combien de participants attendre") && html.includes("Fiabilité de ce chiffre");
  console.log(JSON.stringify({ appels, section_estimation: estimation, etapes_faites: etapes.filter((e) => e.endsWith(":fait")).length, etapes_total: ETAPES.length, rapport: sortie, taille_rapport: html.length }, null, 1));
} finally {
  fs.rmSync(runDir(RUN), { recursive: true, force: true });
  fs.rmSync(dossierCas, { recursive: true, force: true });
}
