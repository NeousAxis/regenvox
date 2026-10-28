// Essai de la tolérance du moteur (sans appel payant, en rejouant le run-002) :
// 1. une réponse de participation qui contredit sans cesse l'engagement déclaré est ramenée au seuil, et le rapport le dit ;
// 2. un test arrêté sur une étape bloquée reprend avec « Réessayer » : les éléments bloqués retrouvent leurs essais.
// Usage : npx tsx scripts/essai_tolerance.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { executerTest } from "../src/pipeline.js";
import { ROOT, runDir, okPath, readJson } from "../src/store.js";
import type { StepName } from "../src/schemas.js";

const SOURCE = "run-002";
const CAS = "_essai-tolerance";
const dossierCas = path.join(ROOT, "cases", CAS);
const NIVEAU = { formats: [{ format: "avis_en_ligne", participants: 180, raisonnement: "Questionnaire court envoyé à tous les ménages." }, { format: "atelier_presentiel", participants: 35, raisonnement: "Un samedi matin, surtout les personnes déjà engagées." }, { format: "parcours_distance", participants: 60, raisonnement: "Entre l'avis en ligne et l'atelier." }] };
const rejeu = (r: { step: string; item: string }) => (r.step === "niveau" ? NIVEAU : readJson(okPath(SOURCE, r.step as StepName, r.item)));
// p01 avait annoncé un avis en ligne pour l'angle 3 (engagement 2) : on lui fait répondre 1 % à chaque essai.
const incoherent = () => {
  const m = readJson<any>(okPath(SOURCE, "mobilisation", "p01"));
  return { ...m, angles: m.angles.map((a: any) => (a.angle_id === 3 ? { ...a, avis_en_ligne: 0.01 } : a)) };
};

fs.rmSync(dossierCas, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "cases", "vuadens-bio"), dossierCas, { recursive: true });
const cas = readJson<any>(path.join(dossierCas, "case.json"));
fs.writeFileSync(path.join(dossierCas, "case.json"), JSON.stringify({ ...cas, id: CAS, plateforme: true, organisation: { type: "commune", nom: "Commune de Vuadens (essai)" } }, null, 2));
const runs = ["essai-tolerance-1", "essai-tolerance-2"];
try {
  // 1. Correction au seuil au troisième refus.
  // Le rapport rejoué du run-002 cite les anciens chiffres : seule la rédaction peut échouer ici, après la correction.
  let essaisP01 = 0;
  await executerTest(CAS, runs[0], async (r) => {
    if (r.step === "mobilisation" && r.item === "p01") essaisP01++;
    const v = r.step === "mobilisation" && r.item === "p01" ? incoherent() : rejeu(r);
    return { texte: JSON.stringify(v), tokens_entree: 0, tokens_sortie: 0 };
  }, { parallele: 8 }).catch((e: Error) => assert.match(e.message, /Rédaction du rapport/));
  assert.equal(essaisP01, 3, "trois demandes avant la correction");
  const corrige = readJson<any>(okPath(runs[0], "mobilisation", "p01"));
  assert.equal(corrige.angles.find((a: any) => a.angle_id === 3).avis_en_ligne, 0.05);
  const metrics = readJson<any>(path.join(runDir(runs[0]), "metrics.json"));
  assert.ok(metrics.hypotheses.some((h: string) => h.startsWith("Participation par format : 1 habitant simulé sur 48")), "note publiée dans les hypothèses");

  // 2. Arrêt sur une réponse illisible, puis reprise.
  let panne = true;
  const appel = async (r: { step: string; item: string }) => {
    const v = panne && r.step === "mobilisation" && r.item === "p02" ? "pas du JSON" : JSON.stringify(rejeu(r));
    return { texte: v, tokens_entree: 0, tokens_sortie: 0 };
  };
  await assert.rejects(executerTest(CAS, runs[1], appel as any, { parallele: 8 }), /Participation par format/);
  panne = false;
  await executerTest(CAS, runs[1], appel as any, { parallele: 8 });
  assert.ok(fs.existsSync(okPath(runs[1], "mobilisation", "p02")), "p02 validé après la reprise");
  assert.ok(fs.existsSync(path.join(runDir(runs[1]), "metrics.json")), "le test va jusqu'au bout");
  console.log("essai tolérance : tout est conforme");
} finally {
  for (const r of runs) fs.rmSync(runDir(r), { recursive: true, force: true });
  fs.rmSync(dossierCas, { recursive: true, force: true });
}
