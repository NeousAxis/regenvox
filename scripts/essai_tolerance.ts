// Essai de la tolérance du moteur (sans appel payant, en rejouant le run-002) :
// 1. une réponse de participation qui contredit sans cesse l'engagement déclaré est ramenée au seuil, et le rapport le dit ;
// 2. un test arrêté sur une étape bloquée reprend avec « Réessayer » : les éléments bloqués retrouvent leurs essais.
// Usage : npx tsx scripts/essai_tolerance.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { executerTest } from "../src/pipeline.js";
import { reparerCitations, retirerSegmentsIntrouvables, sansTiretsSeparateurs } from "../src/admin.js";
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

// 0. Citations « presque exactes » de Mistral (cas réel du 28.10.2026) : remplacées par les mots exacts de l'habitant.
{
  const persona = (id: string, citations: string[]) => ({ id, portrait: "Portrait sans importance pour cet essai, assez long.", reactions: citations.map((citation, i) => ({ angle_id: i + 1, position: "interesse", intensite: 3, citation, engagement: 1, freins_participation: [], ce_qui_me_ferait_venir: "" })), influence: { taille_cercle: 5, role: "suiveur", cercle_type: "famille" }, votes: [] }) as any;
  const p23 = persona("p23", ["Les sols, c’est notre capital. Si on les détruit, on n’a plus rien. Mais il faut que la transition soit progressive, sinon on crève avant que ça porte ses fruits."]);
  const p38 = persona("p38", ["Diffuser le bio dans les communes voisines ? Très bien, mais à condition que ça ne coûte pas un centime aux contribuables de Vuadens."]);
  const seg = (nom: string, source: string, ids: string[], cite: string) => ({ nom, persona_ids: ids, position_dominante: "porteur", objection_citee: cite, persona_source: source, racine: "pratique", levier: "Un levier assez long pour le schéma." });
  const soc: any = { angle_recommande: { angle_id: 1, justification: "x".repeat(70) }, segments: [seg("Porteurs", "p23", ["p23"], "Les sols, c’est notre capital. Si on les détruit, on n’a plus rien à cultiver."), seg("Opposants", "p38", ["p38"], "Le bio, c’est une mode qui coûte cher et qui ne sert à rien."), seg("Autres", "p23", ["p23"], "Les sols, c’est notre capital.")], freins_participation: [], ambassadeurs_potentiels: [], surprises: [] };
  const r = reparerCitations(soc, [p23, p38]);
  assert.equal(r.valeur.segments[0].objection_citee, "Les sols, c’est notre capital. Si on les détruit, on n’a plus rien.");
  assert.equal(r.valeur.segments[1].objection_citee, soc.segments[1].objection_citee, "une citation inventée n'est pas remplacée");
  const sans = retirerSegmentsIntrouvables(r.valeur, [p23, p38]);
  assert.deepEqual(sans?.retires, ["Opposants"]);
  assert.equal(sansTiretsSeparateurs({ titre: "Vuadens — le bio", synthese: "a – b - c", sections: [] } as any).titre, "Vuadens, le bio");
}

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
