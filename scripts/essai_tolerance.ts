// Essai de la tolérance du moteur (sans appel payant, en rejouant le run-002) :
// 1. une réponse de participation qui contredit sans cesse l'engagement déclaré est ramenée au seuil, et le rapport le dit ;
// 2. un test arrêté sur une étape bloquée reprend avec « Réessayer » : les éléments bloqués retrouvent leurs essais.
// 3. un renvoi du contrôle final fait refaire l'analyse des groupes et la critique, deux fois au plus.
// Usage : npx tsx scripts/essai_tolerance.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { executerTest } from "../src/pipeline.js";
import { checkContradicteur, reparerCitations, retirerAttaquesNonSourcees, retirerSegmentsIntrouvables, sansTiretsSeparateurs } from "../src/admin.js";
import { ROOT, runDir, okPath, readJson } from "../src/store.js";
import { construireCas, SURECHANTILLON_AGRICOLE } from "../src/plateforme.js";
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

// 0 bis. Critique contradictoire : un cas inventé (test réel du 28.10.2026) est refusé, un calcul fait sur les données passe.
{
  const attaque = (source: string, critique: string, ev: string) => ({ posture: "Militant écologiste", cible: "donnees", critique, element_verifiable: ev, source_element: source, impact: "Impact assez long.", angle_mort: "Angle mort assez long." });
  const invente = attaque("connaissance_generale_a_verifier", "Le modèle n'intègre aucun backtest. Par exemple, la commune de Villars-sur-Glâne (FR) a échoué à convertir 30% de ses terres en bio en 10 ans (2013-2023) en raison de la résistance des agriculteurs.", "Absence de référence à des cas similaires (ex: Villars-sur-Glâne).");
  const calcul = attaque("donnees_du_run", "L'objectif suppose une conversion bien plus large que l'existant, ce que la simulation ne mesure pas.", "21 % de 719 ha font environ 151 ha en bio ; la majorité suppose plus de 360 ha, soit environ 209 ha supplémentaires.");
  const general = attaque("connaissance_generale_a_verifier", "Les aides à la conversion ont un cadre légal que la simulation ignore, et qui peut limiter les leviers proposés.", "Cadre légal des aides à la conversion bio.");
  const contra: any = { attaques: [invente, { ...calcul, cible: "simulation" }, { ...general, cible: "angle" }, { ...calcul, cible: "participation" }], verdict: "accept_with_notes", notes_pour_rapport: ["Comparer avec des cas réels documentés."] };
  const permis = [21, 719, 2023, 2025, 2135, 64, 48];
  const erreurs = checkContradicteur(contra, { allowedNumbers: permis });
  assert.equal(erreurs.length, 1, erreurs.join(" | "));
  assert.match(erreurs[0], /^Attaque 1 \(connaissance générale\).*30, 2013/);
  const r = retirerAttaquesNonSourcees(contra, permis);
  assert.equal(r?.retirees, 1);
  assert.equal(checkContradicteur(r!.valeur, { allowedNumbers: permis }).length, 0);
}

// 0 ter. Démarche agricole : agriculteurs suréchantillonnés et suivis à part ; sinon, leur nombre suit leur part réelle.
{
  const spec = readJson<any>(path.join(ROOT, "cases", "vuadens-bio", "panel.json"));
  const territoire: any = { panel: { ...spec, hypotheses: spec.hypotheses ?? [] }, cible: { nom: "Vuadens", canton: "FR", pays: "CH", description: "Commune." }, contexte_factuel: [] };
  const params = (enjeu: string): any => ({ organisation: { type: "commune", nom: "Commune de Vuadens" }, territoire: { niveau: "commune", commune_num: 2140 }, demarche: { enjeu, objectif: "Un objectif assez long pour l'essai.", formulation: "Comment faire ensemble ?", formats: [], horizon_mois: 24 } });
  const bio = construireCas("essai-bio", params("Accompagner l'agriculture de la commune vers le bio."), territoire, territoire, 1);
  assert.equal(bio.panel.agriculteurs.surechantillon, SURECHANTILLON_AGRICOLE);
  assert.deepEqual(bio.cas.acteurs_cles, { groupe: "agriculteurs", activite_regex: "agricult" });
  const velo = construireCas("essai-velo", params("Rendre les trajets à vélo plus sûrs vers l'école."), territoire, territoire, 1);
  assert.equal(velo.panel.agriculteurs.surechantillon, Math.round(spec.agriculteurs.part_16_plus * 48));
  assert.equal(velo.cas.acteurs_cles, undefined);
  const fermeture = construireCas("essai-poste", params("Réagir à la fermeture de la poste du village."), territoire, territoire, 1);
  assert.equal(fermeture.cas.acteurs_cles, undefined, "« fermeture » n'est pas une ferme");
}

fs.rmSync(dossierCas, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "cases", "vuadens-bio"), dossierCas, { recursive: true });
const cas = readJson<any>(path.join(dossierCas, "case.json"));
fs.writeFileSync(path.join(dossierCas, "case.json"), JSON.stringify({ ...cas, id: CAS, plateforme: true, organisation: { type: "commune", nom: "Commune de Vuadens (essai)" } }, null, 2));
const runs = ["essai-tolerance-1", "essai-tolerance-2", "essai-tolerance-3", "essai-tolerance-4"];
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

  // 3. Le contrôle final renvoie l'analyse des groupes une fois (cas réel du 28.10.2026) : analyse, critique et contrôle sont refaits.
  const refus = { ...readJson<any>(okPath(SOURCE, "gardien-final", "main")), decision: "reject", corrections_demandees: ["Le levier du segment Porteurs impose un chemin au terrain."] };
  const essai = async (runId: string, refuser: (n: number) => boolean) => {
    const appels: Record<string, number> = {};
    let consigne = false;
    let consigneCritique = false;
    await executerTest(CAS, runId, async (r: any) => {
      appels[r.step] = (appels[r.step] ?? 0) + 1;
      if (r.step === "sociologue" && appels.sociologue > 1) consigne ||= r.user.includes("Gardien de la méthode : Le levier du segment Porteurs");
      if (r.step === "contradicteur" && appels.contradicteur > 1) consigneCritique ||= r.user.includes("Gardien de la méthode : Le levier du segment Porteurs");
      const v = r.step === "gardien-final" && refuser(appels["gardien-final"]) ? refus : rejeu(r);
      return { texte: JSON.stringify(v), tokens_entree: 0, tokens_sortie: 0 };
    }, { parallele: 8 });
    return { appels, consigne, consigneCritique };
  };
  const un = await essai(runs[2], (n) => n === 1);
  assert.deepEqual([un.appels.sociologue, un.appels.contradicteur, un.appels["gardien-final"], un.appels.traducteur], [2, 2, 2, 1]);
  assert.ok(un.consigne, "la correction du Gardien est transmise à l'analyse refaite");
  assert.ok(un.consigneCritique, "et à la critique refaite");
  assert.equal(readJson<any>(okPath(runs[2], "gardien-final", "main")).decision, "accept");

  // 4. Le contrôle final refuse toujours : deux reprises, puis ses réserves sont publiées et le rapport est rédigé.
  const toujours = await essai(runs[3], () => true);
  assert.deepEqual([toujours.appels.sociologue, toujours.appels.contradicteur, toujours.appels["gardien-final"], toujours.appels.traducteur], [3, 3, 3, 1]);
  const m4 = readJson<any>(path.join(runDir(runs[3]), "metrics.json"));
  assert.ok(m4.hypotheses.some((h: string) => h.startsWith("Contrôle de méthode final : réserves maintenues après 2 reprises")), "réserves publiées");
  console.log("essai tolérance : tout est conforme");
} finally {
  for (const r of runs) fs.rmSync(runDir(r), { recursive: true, force: true });
  fs.rmSync(dossierCas, { recursive: true, force: true });
}
