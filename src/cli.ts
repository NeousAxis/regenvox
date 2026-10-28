// Orchestrateur RegenVox (non-LLM). Les appels LLM passent par des fichiers requête/réponse,
// exécutables par n'importe quel fournisseur (API Mistral/Anthropic en production, sous-agents isolés en développement).
import path from "node:path";
import fs from "node:fs";
import { SCHEMAS, type StepName, type FormulateurOut, type PersonaOut, type PersonaSkeleton, type SociologueOut, type ContradicteurOut, type GardienOut, type FacilitateurOut, type TraducteurOut, type MobilisationOut, type ControleOut } from "./schemas.js";
import { SYSTEM } from "./prompts.js";
import * as A from "./admin.js";
import * as Q from "./requests.js";
import { ROOT, runDir, reqPath, respPath, okPath, readJson, writeJson, exists, listItems, journal, loadManifest, saveManifest, type Manifest } from "./store.js";
import { generatePanel, type PanelSpec } from "./demographe.js";
import { adapter } from "./vocabulaire.js";
import { estimationParticipants } from "./niveau.js";
import { DEFAULT_PARAMS, PARAM_NOTES, buildNetwork, simulateAngle } from "./diffusion.js";
import { angleMetrics, backtest, mobilisationMetrics, formatsPreferes, type VoteRef } from "./scoring.js";

export const MODEL: Record<StepName, string> = {
  formulateur: "opus",
  "gardien-angles": "sonnet",
  personas: "haiku",
  mobilisation: "haiku",
  controle: "haiku",
  controle2: "haiku",
  facilitateur: "sonnet",
  sociologue: "opus",
  contradicteur: "opus",
  "gardien-final": "sonnet",
  traducteur: "sonnet",
  scrutins: "haiku",
  scrutins2: "haiku",
  cantonales: "haiku",
  petitions: "haiku",
  demarches: "haiku",
  demarchesge: "haiku",
  quartiers: "haiku",
  niveau: "sonnet",
};
export const SYSTEM_OF: Record<StepName, string> = {
  formulateur: SYSTEM.formulateur,
  "gardien-angles": SYSTEM.gardien,
  personas: SYSTEM.persona,
  mobilisation: SYSTEM.mobilisation,
  controle: SYSTEM.controle,
  controle2: SYSTEM.controle,
  facilitateur: SYSTEM.facilitateur,
  sociologue: SYSTEM.sociologue,
  contradicteur: SYSTEM.contradicteur,
  "gardien-final": SYSTEM.gardien,
  traducteur: SYSTEM.traducteur,
  scrutins: SYSTEM.scrutin,
  scrutins2: SYSTEM.scrutin2,
  cantonales: SYSTEM.cantonal,
  petitions: SYSTEM.petition,
  demarches: SYSTEM.demarche,
  demarchesge: SYSTEM.demarche,
  quartiers: SYSTEM.demarche,
  niveau: SYSTEM.niveau,
};

const caseDir = (id: string) => path.join(ROOT, "cases", id);
const loadCase = (m: Manifest) => readJson<Q.CaseFile>(path.join(caseDir(m.caseId), "case.json"));
const loadScrutins = (m: Manifest) => readJson<{ votations: Q.Scrutin[] }>(path.join(caseDir(m.caseId), "scrutins.json")).votations;
const loadScrutinsV2 = () => readJson<{ votations: Q.ScrutinV2[] }>(path.join(ROOT, "data", "scrutins_v2.json")).votations;
const loadCantonales = () => readJson<{ votations: Q.Cantonale[] }>(path.join(ROOT, "data", "cantonales_20260927.json")).votations;
const loadPetitions = () => readJson<{ petitions: Q.Petition[] }>(path.join(ROOT, "data", "mobilisations_textes.json")).petitions;
const loadDemarches = () => readJson<{ demarches: Q.Demarche[] }>(path.join(ROOT, "data", "lausanne_textes.json")).demarches;
// Démarches genevoises : seules celles de la commune du panel, champs ramenés au format lausannois.
const loadDemarchesGe = (c: Q.CaseFile): Q.Demarche[] =>
  readJson<{ demarches: any[] }>(path.join(ROOT, "data", "geneve_textes.json")).demarches
    .filter((d) => String(d.commune).startsWith(c.cible.nom))
    .map((d) => ({ id: d.id, nom_demarche: d.nom, annee: d.annee, appel: d.appel, format: d.format, qui_peut_participer: d.qui_peut_participer, duree_phase_participation: d.duree_phase_participation, participation_a_prevoir: d.grandeur_a_prevoir }));
// Démarche d'une ville étrangère, découpée en quartiers : une seule démarche, chaque panel est celui d'un quartier.
const loadDemarcheVille = (c: Q.CaseFile): Q.DemarcheVille => readJson<{ demarche: Q.DemarcheVille }>(path.join(ROOT, "data", `${c.cible.ville_id}_textes.json`)).demarche;
const loadSkels = (runId: string) => readJson<PersonaSkeleton[]>(path.join(runDir(runId), "panel.json"));
const validated = <T>(runId: string, step: StepName, item = "main") => readJson<T>(okPath(runId, step, item));
const errorsPath = (runId: string, step: string, item: string) => path.join(runDir(runId), "errors", step, `${item}.json`);

export function items(runId: string, step: StepName): string[] {
  if (step === "personas" || step === "mobilisation" || step === "controle" || step === "controle2" || step === "demarches" || step === "demarchesge" || step === "quartiers") return loadSkels(runId).map((s) => s.id);
  if (step === "scrutins" || step === "scrutins2" || step === "cantonales" || step === "petitions") return loadSkels(runId).filter((s) => s.electeur).map((s) => s.id);
  return ["main"];
}

function buildUser(runId: string, step: StepName, item: string): string {
  const m = loadManifest(runId);
  const c = loadCase(m);
  switch (step) {
    case "formulateur":
      return Q.userFormulateur(c);
    case "gardien-angles":
      return Q.userGardienAngles(c, validated<FormulateurOut>(runId, "formulateur"));
    case "personas": {
      const s = loadSkels(runId).find((x) => x.id === item)!;
      return Q.userPersona(c, s, validated<FormulateurOut>(runId, "formulateur"));
    }
    case "mobilisation": {
      const s = loadSkels(runId).find((x) => x.id === item)!;
      return Q.userMobilisation(c, s, validated<FormulateurOut>(runId, "formulateur"), validated<PersonaOut>(runId, "personas", item));
    }
    case "controle":
    case "controle2": {
      const s = loadSkels(runId).find((x) => x.id === item)!;
      const t = step === "controle" ? c.angle_controle! : c.angle_controle2!;
      return Q.userControle(c, s, validated<PersonaOut>(runId, "personas", item), t.formulation);
    }
    case "facilitateur":
      return Q.userFacilitateur(c, validated(runId, "formulateur"), readJson(path.join(runDir(runId), "metrics.json")));
    case "sociologue":
      return Q.userSociologue(c, validated(runId, "formulateur"), loadPersonasWithControl(runId), loadSkels(runId), readJson(path.join(runDir(runId), "metrics.json")));
    case "contradicteur": {
      const metrics = readJson(path.join(runDir(runId), "metrics.json"));
      return Q.userContradicteur(c, validated(runId, "formulateur"), metrics, validated(runId, "sociologue"), metrics.hypotheses);
    }
    case "gardien-final":
      return Q.userGardienFinal(c, validated(runId, "formulateur"), validated(runId, "sociologue"), validated(runId, "contradicteur"));
    case "traducteur":
      return Q.userTraducteur(buildDossier(runId));
    case "scrutins": {
      const s = loadSkels(runId).find((x) => x.id === item)!;
      return Q.userScrutin(c, s, validated<PersonaOut>(runId, "personas", item), loadScrutins(m));
    }
    case "scrutins2":
      return Q.userScrutinV2(c, loadSkels(runId).find((x) => x.id === item)!, loadScrutinsV2());
    case "cantonales":
      return Q.userCantonales(c, loadSkels(runId).find((x) => x.id === item)!, loadCantonales());
    case "petitions":
      return Q.userPetitions(c, loadSkels(runId).find((x) => x.id === item)!, loadPetitions());
    case "demarches":
      return Q.userDemarches(c, loadSkels(runId).find((x) => x.id === item)!, loadDemarches());
    case "demarchesge":
      return Q.userDemarches(c, loadSkels(runId).find((x) => x.id === item)!, loadDemarchesGe(c));
    case "quartiers":
      return Q.userQuartier(c, loadSkels(runId).find((x) => x.id === item)!, loadDemarcheVille(c));
    case "niveau":
      return Q.userNiveau(c, validated<FormulateurOut>(runId, "formulateur"), populationDe(m));
  }
}

const populationDe = (m: Manifest) => {
  const p = readJson<{ population_16_plus: number | { valeur: number } }>(path.join(caseDir(m.caseId), "panel.json")).population_16_plus;
  return typeof p === "number" ? p : p.valeur;
};

function loadPersonas(runId: string): PersonaOut[] {
  return loadSkels(runId).map((s) => validated<PersonaOut>(runId, "personas", s.id));
}

// Personas complétés par leur réaction à l'angle témoin (identifiant 0), quand elle existe : le Sociologue peut alors la citer.
function loadPersonasWithControl(runId: string): PersonaOut[] {
  return loadPersonas(runId).map((p) =>
    exists(okPath(runId, "controle", p.id)) ? { ...p, reactions: [...p.reactions, { ...validated<ControleOut>(runId, "controle", p.id).reaction, angle_id: 0 }] } : p,
  );
}

export function cmdInit(caseId: string, runId: string, seedArg?: string, nArg?: string) {
  const c = readJson<Q.CaseFile>(path.join(caseDir(caseId), "case.json"));
  const seed = seedArg ? parseInt(seedArg, 10) : c.panel.seed;
  if (exists(runDir(runId))) throw new Error(`Le run ${runId} existe déjà.`);
  saveManifest({ runId, caseId, seed, createdAt: new Date().toISOString(), attempts: {}, maxAttempts: 3, ...(nArg ? { N: parseInt(nArg, 10) } : {}) });
  journal(runId, { event: "init", caseId, seed });
  console.log(`Run ${runId} créé (graine ${seed}).`);
}

export function cmdPanel(runId: string) {
  const m = loadManifest(runId);
  const c = loadCase(m);
  const spec = readJson<PanelSpec>(path.join(caseDir(m.caseId), "panel.json"));
  const { skeletons, hypotheses } = generatePanel(spec, m.N ?? c.panel.N, m.seed);
  writeJson(path.join(runDir(runId), "panel.json"), skeletons);
  writeJson(path.join(runDir(runId), "panel_hypotheses.json"), hypotheses);
  journal(runId, { event: "panel", N: skeletons.length });
  console.log(`Panel généré : ${skeletons.length} personas, dont ${skeletons.filter((s) => s.electeur).length} électeurs fédéraux.`);
}

export function cmdPrepare(runId: string, step: StepName) {
  const m = loadManifest(runId);
  const c = loadCase(m);
  const out: { item: string; request: string; response: string; model: string; attempt: number }[] = [];
  for (const item of items(runId, step)) {
    if (exists(okPath(runId, step, item))) continue;
    const key = `${step}/${item}`;
    const attempt = (m.attempts[key] ?? 0) + 1;
    if (attempt > m.maxAttempts) {
      console.log(`ESCALADE HUMAINE : ${key} a échoué ${m.maxAttempts} fois.`);
      continue;
    }
    const prevErrors = exists(errorsPath(runId, step, item)) ? readJson<string[]>(errorsPath(runId, step, item)) : undefined;
    const user = Q.withErrors(adapter(buildUser(runId, step, item), c), prevErrors);
    const rp = reqPath(runId, step, item);
    const sp = respPath(runId, step, item);
    if (exists(sp)) fs.rmSync(sp);
    writeJson(rp, { step, item, model: MODEL[step], attempt, system: adapter(SYSTEM_OF[step], c), user, response_path: sp });
    out.push({ item, request: rp, response: sp, model: MODEL[step], attempt });
  }
  console.log(JSON.stringify(out, null, 1));
  return out;
}

function parseLoose(raw: string): { value: unknown; friction?: string } {
  const t = raw.trim();
  try {
    return { value: JSON.parse(t) };
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return { value: JSON.parse(m[0]), friction: "JSON entouré de texte ou de balises (nettoyé)" };
      } catch {}
    }
    // Accolades finales manquantes (réponse tronquée d'un ou deux caractères) : on les ajoute, et on le trace.
    let depth = 0, inStr = false, esc = false;
    for (const ch of t) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      else if (!inStr && ch === "{") depth++;
      else if (!inStr && ch === "}") depth--;
    }
    if (!inStr && depth > 0 && depth <= 2) return { value: JSON.parse(t + "}".repeat(depth)), friction: `JSON tronqué : ${depth} accolade(s) finale(s) ajoutée(s)` };
    throw new Error("Réponse non JSON");
  }
}

function adminFor(runId: string, step: StepName, item: string, value: any): string[] {
  const m = loadManifest(runId);
  const c = loadCase(m);
  switch (step) {
    case "formulateur":
      return A.checkFormulateur(value, { angleFourni: c.angle_fourni });
    case "gardien-angles":
    case "gardien-final":
      return A.checkGardien(value);
    case "personas": {
      const f = validated<FormulateurOut>(runId, "formulateur");
      return A.checkPersona(value, { skeleton: loadSkels(runId).find((s) => s.id === item), angleIds: f.angles.map((a) => a.id), voteIds: Q.allVotes(c).map((v) => v.vote_id) });
    }
    case "mobilisation": {
      const f = validated<FormulateurOut>(runId, "formulateur");
      return A.checkMobilisation(value, { skeleton: loadSkels(runId).find((s) => s.id === item), angleIds: f.angles.map((a) => a.id), persona: validated<PersonaOut>(runId, "personas", item) });
    }
    case "controle":
    case "controle2":
      return value.id !== item ? [`Identifiant ${value.id} différent du profil ${item}.`] : [];
    case "facilitateur":
      return A.checkFacilitateur(value, { angleIds: validated<FormulateurOut>(runId, "formulateur").angles.map((a) => a.id), horizon: c.horizon_mois });
    case "sociologue":
      return A.checkSociologue(value, { personas: loadPersonasWithControl(runId), angleIds: validated<FormulateurOut>(runId, "formulateur").angles.map((a) => a.id) });
    case "contradicteur":
      return A.checkContradicteur(value);
    case "traducteur":
      return A.checkTraducteur(value, { allowedNumbers: allowedNumbers(runId) });
    case "scrutins":
      return A.checkScrutin(value, { skeleton: loadSkels(runId).find((s) => s.id === item), voteIds: loadScrutins(m).map((v) => v.vote_id) });
    case "scrutins2":
      return A.checkScrutin(value, { skeleton: loadSkels(runId).find((s) => s.id === item), voteIds: loadScrutinsV2().map((v) => v.vote_id) });
    case "cantonales":
      return A.checkScrutin(value, { skeleton: loadSkels(runId).find((s) => s.id === item), voteIds: loadCantonales().filter((v) => v.canton === c.cible.canton).map((v) => v.vote_id) });
    case "petitions":
    case "demarches":
    case "demarchesge":
    case "quartiers": {
      const want = (step === "petitions" ? loadPetitions() : step === "demarches" ? loadDemarches() : step === "quartiers" ? [loadDemarcheVille(c)] : loadDemarchesGe(c)).map((p) => p.id).sort();
      const got = (value.reactions as { item_id: string }[]).map((r) => r.item_id).sort();
      const e: string[] = value.id !== item ? [`Identifiant ${value.id} différent du profil ${item}.`] : [];
      if (JSON.stringify(got) !== JSON.stringify(want)) e.push(`Il faut une réaction et une seule pour chacun de ces éléments : ${want.join(", ")}.`);
      return e;
    }
    case "niveau": {
      const pop = populationDe(m);
      const vus = (value.formats as { format: string; participants: number }[]);
      const e: string[] = [];
      if (new Set(vus.map((x) => x.format)).size !== 3) e.push("Il faut une estimation et une seule pour chacun des trois formats.");
      for (const x of vus) if (x.participants > pop) e.push(`Format ${x.format} : ${x.participants} participants, plus que l'effectif concerné (${pop}).`);
      return e;
    }
  }
}

// Après un arrêt (bouton « Réessayer » de la plateforme) : les éléments bloqués d'une étape retrouvent leurs essais.
export function cmdRelancer(runId: string, step: StepName) {
  const m = loadManifest(runId);
  let n = 0;
  for (const item of items(runId, step)) {
    const key = `${step}/${item}`;
    if (!exists(okPath(runId, step, item)) && (m.attempts[key] ?? 0) >= m.maxAttempts) {
      m.attempts[key] = 0;
      n++;
    }
  }
  saveManifest(m);
  if (n) journal(runId, { event: "relance", step, elements: n });
  return n;
}

export function cmdIngest(runId: string, step: StepName) {
  const m = loadManifest(runId);
  const summary = { valides: [] as string[], rejetes: [] as { item: string; erreurs: string[] }[], manquants: [] as string[] };
  for (const item of items(runId, step)) {
    if (exists(okPath(runId, step, item))) continue;
    const key = `${step}/${item}`;
    if (!exists(respPath(runId, step, item))) {
      summary.manquants.push(item);
      continue;
    }
    m.attempts[key] = (m.attempts[key] ?? 0) + 1;
    let errors: string[] = [];
    let value: any;
    try {
      const parsed = parseLoose(fs.readFileSync(respPath(runId, step, item), "utf8"));
      value = parsed.value;
      if (parsed.friction) journal(runId, { event: "friction", step, item, detail: parsed.friction });
      const z = SCHEMAS[step].safeParse(value);
      if (!z.success) errors = z.error.issues.map((i) => `Format : ${i.path.join(".")} : ${i.message}`);
      else {
        value = z.data;
        errors = adminFor(runId, step, item, value);
      }
    } catch (e: any) {
      errors = [`Réponse illisible : ${e.message}`];
    }
    // Participation par format : au dernier essai, des probabilités contraires à l'engagement déclaré sont ramenées aux seuils
    // plutôt que d'arrêter tout le test pour une seule personne simulée. La correction est notée et publiée dans le rapport.
    if (errors.length && step === "mobilisation" && value && m.attempts[key] >= m.maxAttempts && SCHEMAS.mobilisation.safeParse(value).success) {
      const { valeur, corrections } = A.corrigerMobilisation(value as MobilisationOut, validated<PersonaOut>(runId, "personas", item));
      if (corrections.length && adminFor(runId, step, item, valeur).length === 0) {
        value = valeur;
        errors = [];
        const fichier = path.join(runDir(runId), "corrections_auto.json");
        const deja = exists(fichier) ? readJson<{ item: string; corrections: string[] }[]>(fichier) : [];
        writeJson(fichier, [...deja.filter((x) => x.item !== item), { item, corrections }]);
        journal(runId, { event: "correction_auto", step, item, corrections });
      }
    }
    if (errors.length) {
      writeJson(errorsPath(runId, step, item), errors);
      summary.rejetes.push({ item, erreurs: errors });
      journal(runId, { event: "admin_reject", step, item, attempt: m.attempts[key], errors });
      continue;
    }
    writeJson(okPath(runId, step, item), value);
    journal(runId, { event: "admin_accept", step, item, attempt: m.attempts[key] });
    summary.valides.push(item);
    // Le Gardien peut rejeter le travail d'un autre agent : on renvoie alors cet agent avec les corrections.
    if ((step === "gardien-angles" || step === "gardien-final") && (value as GardienOut).decision === "reject") {
      const target: StepName = step === "gardien-angles" ? "formulateur" : "sociologue";
      fs.rmSync(okPath(runId, target, "main"));
      fs.rmSync(okPath(runId, step, "main"));
      writeJson(errorsPath(runId, target, "main"), (value as GardienOut).corrections_demandees.map((x) => "Gardien de la méthode : " + x));
      journal(runId, { event: "gardien_reject", step, target, corrections: (value as GardienOut).corrections_demandees });
      console.log(`Gardien : REJET de ${target}, à relancer avec les corrections.`);
    }
  }
  saveManifest(m);
  console.log(JSON.stringify(summary, null, 1));
  return summary;
}

export function cmdSimulate(runId: string) {
  const m = loadManifest(runId);
  const c = loadCase(m);
  const skels = loadSkels(runId);
  const personas = loadPersonas(runId);
  const f = validated<FormulateurOut>(runId, "formulateur");
  const refs = readJson<VoteRef[]>(path.join(caseDir(m.caseId), "votes_reels.json"));
  const bt = backtest(personas, skels, refs, m.seed + 7);
  const net = buildNetwork(skels, m.seed + 1, DEFAULT_PARAMS.k, DEFAULT_PARAMS.rewire);
  const params = { ...DEFAULT_PARAMS, months: c.horizon_mois };
  const acteurs = c.acteurs_cles ? { groupe: c.acteurs_cles.groupe, match: new RegExp(c.acteurs_cles.activite_regex, "i") } : undefined;
  const angles = f.angles.map((a) => {
    const d = simulateAngle(a.id, personas, skels, net, params, m.seed + 100 + a.id);
    const lo = simulateAngle(a.id, personas, skels, net, { ...params, qA: params.qA * 0.5, qO: params.qO * 0.5, runs: 200 }, m.seed + 200 + a.id);
    const hi = simulateAngle(a.id, personas, skels, net, { ...params, qA: params.qA * 1.5, qO: params.qO * 1.5, runs: 200 }, m.seed + 300 + a.id);
    const metrics = angleMetrics(a.id, personas, skels, d, [lo.finalA.mean, hi.finalA.mean], acteurs);
    return { angle_id: a.id, formulation: a.formulation, metrics, diffusion: { params: d.params, monthly: d.monthly } };
  });
  // Angles témoins (facultatifs) : mêmes métriques, calculées sur une copie des personas où la réaction témoin porte un identifiant réservé.
  const temoin = (step: "controle" | "controle2", def: { formulation: string; pourquoi: string } | undefined, id: number) => {
    if (!def || !skels.every((s) => exists(okPath(runId, step, s.id)))) return null;
    const withCtrl = personas.map((p) => ({ ...p, reactions: [...p.reactions, { ...validated<ControleOut>(runId, step, p.id).reaction, angle_id: id }] }));
    const d = simulateAngle(id, withCtrl, skels, net, params, m.seed + 100 + id);
    const lo = simulateAngle(id, withCtrl, skels, net, { ...params, qA: params.qA * 0.5, qO: params.qO * 0.5, runs: 200 }, m.seed + 200 + id);
    const hi = simulateAngle(id, withCtrl, skels, net, { ...params, qA: params.qA * 1.5, qO: params.qO * 1.5, runs: 200 }, m.seed + 300 + id);
    return { angle_id: id, formulation: def.formulation, pourquoi: def.pourquoi, metrics: angleMetrics(id, withCtrl, skels, d, [lo.finalA.mean, hi.finalA.mean], acteurs), diffusion: { params: d.params, monthly: d.monthly } };
  };
  const controle = temoin("controle", c.angle_controle, 0);
  const controle_objectif = temoin("controle2", c.angle_controle2, 10);
  const totalW = skels.reduce((s, x) => s + x.poids, 0);
  const share = (pred: (s: PersonaSkeleton) => boolean) => Math.round((skels.filter(pred).reduce((s, x) => s + x.poids, 0) / totalW) * 1000) / 1000;
  const panel_resume = {
    N: skels.length,
    electeurs_federaux: skels.filter((s) => s.electeur).length,
    part_ponderee_etrangers: share((s) => s.nationalite === "etrangere"),
    part_ponderee_65_plus: share((s) => s.age >= 65),
    agriculteurs_dans_panel: skels.filter((s) => /agricult/i.test(s.activite)).length,
  };
  const hypotheses = [...readJson<string[]>(path.join(runDir(runId), "panel_hypotheses.json")), ...PARAM_NOTES];
  const mobilisation = computeMobilisation(runId, skels, f, bt, acteurs, m.seed);
  if (mobilisation) hypotheses.push(mobilisation.note);
  const corrigees = path.join(runDir(runId), "corrections_auto.json");
  if (exists(corrigees)) {
    const n = readJson<unknown[]>(corrigees).length;
    if (n) hypotheses.push(`Participation par format : ${n} habitant${n > 1 ? "s" : ""} simulé${n > 1 ? "s" : ""} sur ${skels.length} donnai${n > 1 ? "ent" : "t"} des probabilités contraires à l'engagement déclaré juste avant, malgré trois demandes de correction ; le moteur les a ramenées au seuil de cohérence (5 % au moins pour un format annoncé).`);
  }
  writeJson(path.join(runDir(runId), "metrics.json"), { angles, controle, controle_objectif, backtest: bt, panel_resume, hypotheses, mobilisation });
  journal(runId, { event: "simulate", angles: angles.length });
  console.log(JSON.stringify({ panel_resume, backtest: bt.synthese, angles: angles.map((a) => ({ id: a.angle_id, ...a.metrics })) }, null, 1));
}

// Mobilisation par format (étape facultative : calculée seulement si tous les personas y ont répondu).
function computeMobilisation(runId: string, skels: PersonaSkeleton[], f: FormulateurOut, bt: any, acteurs: { groupe: string; match: RegExp } | undefined, seed: number) {
  if (!skels.every((s) => exists(okPath(runId, "mobilisation", s.id)))) return null;
  const m = loadManifest(runId);
  const spec0 = readJson<{ population_16_plus: number | { valeur: number } }>(path.join(caseDir(m.caseId), "panel.json"));
  const spec = { population_16_plus: typeof spec0.population_16_plus === "number" ? spec0.population_16_plus : spec0.population_16_plus.valeur };
  const mobs = skels.map((s) => validated<MobilisationOut>(runId, "mobilisation", s.id));
  const test = bt.votes.filter((v: any) => v.role === "test" && v.reel_participation != null);
  const ratio = (vs: any[]) => {
    const sim = vs.reduce((a: number, v: any) => a + v.simule_participation, 0);
    const reel = vs.reduce((a: number, v: any) => a + v.reel_participation, 0);
    return sim > 0 ? Math.round((reel / sim) * 100) / 100 : null;
  };
  const facteurGlobal = ratio(test);
  // Un atelier mobilise peu : on corrige avec le rapport mesuré sur les scrutins les moins suivis (sous la médiane),
  // où le panel surestime le plus sa participation. La moyenne globale masque des erreurs qui se compensent.
  const med = [...test.map((v: any) => v.reel_participation)].sort((a, b) => a - b)[Math.floor(test.length / 2)];
  const peuSuivis = test.filter((v: any) => v.reel_participation < med);
  const facteur = ratio(peuSuivis);
  return {
    population_16_plus: spec.population_16_plus,
    facteur_realisme_votations: facteur,
    facteur_realisme_global: facteurGlobal,
    n_scrutins_peu_suivis: peuSuivis.length,
    formats_preferes: formatsPreferes(mobs, skels),
    angles: f.angles.map((a) => mobilisationMetrics(a.id, mobs, skels, spec.population_16_plus, facteur, seed + 500 + a.id, acteurs)),
    note: `Mobilisation : probabilités déclarées par chaque persona, pondérées, converties en habitants sur ${spec.population_16_plus} résidents de 16 ans et plus. Version corrigée : multipliée par ${facteur}, rapport entre la participation réelle et la participation annoncée par le panel sur les ${peuSuivis.length} votations les moins suivies (sur l'ensemble des ${test.length} votations, le rapport est de ${facteurGlobal}, mais des erreurs de sens contraire s'y compensent). Les effectifs bruts sont des plafonds.`,
  };
}

export function buildDossier(runId: string) {
  const m = loadManifest(runId);
  const c = loadCase(m);
  const f = validated<FormulateurOut>(runId, "formulateur");
  const metrics = readJson<any>(path.join(runDir(runId), "metrics.json"));
  const pct = (x: number | null) => (x == null ? null : Math.round(x * 100));
  return {
    commune: c.cible.nom,
    enjeu: c.enjeu,
    objectif: c.objectif,
    contexte_factuel: c.contexte_factuel,
    angles: metrics.angles.map((a: any) => ({
      id: a.angle_id,
      formulation: a.formulation,
      origine: f.angles.find((x) => x.id === a.angle_id)?.origine,
      resonance_sur_10: a.metrics.resonance,
      repartition_initiale_pct: Object.fromEntries(Object.entries(a.metrics.repartition_initiale).map(([k, v]) => [k, pct(v as number)])),
      soutien_pct: pct(a.metrics.soutien.moyenne),
      soutien_intervalle_pct: [pct(a.metrics.soutien.p05), pct(a.metrics.soutien.p95)],
      soutien_sensibilite_pct: a.metrics.soutien.sensibilite.map(pct),
      coporteurs_pct: pct(a.metrics.coporteurs),
      opposition_pct: pct(a.metrics.resistance.moyenne),
      viralite_pct: pct(a.metrics.viralite),
      mois_mi_parcours: a.metrics.mois_mi_parcours,
      participation_avis_en_ligne_pct: pct(a.metrics.participation.avis_en_ligne),
      participation_atelier_pct: pct(a.metrics.participation.atelier),
      porteurs_projet_pct: pct(a.metrics.participation.porteurs_projet),
      agriculteurs: a.metrics.acteurs_cles
        ? { n: a.metrics.acteurs_cles.n, favorables_au_depart_pct: pct(a.metrics.acteurs_cles.part_initiale_favorable), soutien_final_pct: pct(a.metrics.acteurs_cles.part_finale_soutien), coporteurs_pct: pct(a.metrics.acteurs_cles.part_coporteurs) }
        : null,
    })),
    panel: metrics.panel_resume,
    angles_temoins: [metrics.controle, metrics.controle_objectif].filter(Boolean).map((t: any) => ({
      formulation: t.formulation,
      pourquoi: t.pourquoi,
      favorables_au_depart_pct: pct(t.metrics.repartition_initiale.porteur + t.metrics.repartition_initiale.interesse),
      reticents_ou_opposes_au_depart_pct: pct(t.metrics.repartition_initiale.reticent + t.metrics.repartition_initiale.opposant),
      soutien_pct: pct(t.metrics.soutien.moyenne),
      opposition_pct: pct(t.metrics.resistance.moyenne),
      agriculteurs_favorables_sur_8: Math.round((t.metrics.acteurs_cles?.part_initiale_favorable ?? 0) * (t.metrics.acteurs_cles?.n ?? 0)),
    })),
    lecture_temoins:
      metrics.controle && metrics.controle_objectif
        ? Math.abs(metrics.controle.metrics.soutien.moyenne - metrics.controle_objectif.metrics.soutien.moyenne) < 0.1
          ? `Les deux témoins obtiennent un soutien proche (${pct(metrics.controle.metrics.soutien.moyenne)} % et ${pct(metrics.controle_objectif.metrics.soutien.moyenne)} %) : à objectif chiffré identique, poser la question de façon ouverte ne change presque rien. C'est l'objectif chiffré lui-même qui suscite le rejet ; la question ouverte réduit seulement l'opposition active (${pct(metrics.controle.metrics.resistance.moyenne)} % contre ${pct(metrics.controle_objectif.metrics.resistance.moyenne)} %).`
          : `Les deux témoins diffèrent nettement (${pct(metrics.controle.metrics.soutien.moyenne)} % et ${pct(metrics.controle_objectif.metrics.soutien.moyenne)} % de soutien) : à objectif identique, la manière de poser la question pèse par elle-même.`
        : null,
    mobilisation: metrics.mobilisation
      ? {
          population_16_plus: metrics.mobilisation.population_16_plus,
          facteur_realisme_votations: metrics.mobilisation.facteur_realisme_votations,
          formats_preferes_pct: Object.fromEntries(Object.entries(metrics.mobilisation.formats_preferes).map(([k, v]) => [k, pct(v as number)])),
          angles: metrics.mobilisation.angles.map((a: any) => ({
            angle_id: a.angle_id,
            formats: Object.fromEntries(Object.entries(a.formats).map(([k, v]: [string, any]) => [k, { part_pct: pct(v.part), intervalle_pct: v.ic90.map(pct), habitants: v.habitants, habitants_corriges: v.habitants_corriges }])),
            effet_invitation: a.effet_invitation,
            agriculteurs: a.acteurs_cles ? Object.fromEntries(Object.entries(a.acteurs_cles).filter(([k]) => k !== "groupe").map(([k, v]) => [k, k === "n" ? v : pct(v as number)])) : null,
          })),
        }
      : null,
    // Plateforme : nombre de participants attendu (estimation directe, fourchette et fiabilité mesurée à l'aveugle).
    ...(estimationParticipants(runId) ? { estimation_participants: estimationParticipants(runId) } : {}),
    backtest: metrics.backtest,
    hypotheses: metrics.hypotheses,
    lecture_propagation: validated<FacilitateurOut>(runId, "facilitateur"),
    sociologue: validated<SociologueOut>(runId, "sociologue"),
    contradicteur: validated<ContradicteurOut>(runId, "contradicteur"),
    gardien_final: validated<GardienOut>(runId, "gardien-final"),
  };
}

function allowedNumbers(runId: string): number[] {
  const text = JSON.stringify(buildDossier(runId)) + JSON.stringify(readJson(path.join(runDir(runId), "metrics.json")));
  const nums = A.extractNumbers(text);
  return [...new Set(nums), 2026, 2027, 2028, 2030, 2035, 2040];
}

function cmdStatus(runId: string) {
  const steps = Object.keys(SCHEMAS) as StepName[];
  const rows = steps.map((s) => {
    let its: string[] = [];
    try {
      its = items(runId, s);
    } catch {}
    return { step: s, valides: its.filter((i) => exists(okPath(runId, s, i))).length, total: its.length };
  });
  console.log(JSON.stringify({ rows, metrics: exists(path.join(runDir(runId), "metrics.json")) }, null, 1));
}

// Ligne de commande (Node seulement) : dans le navigateur, la plateforme appelle les fonctions exportées.
const enLigneDeCommande = typeof process !== "undefined" && path.basename(process.argv?.[1] ?? "") === "cli.ts";
const [, , cmd, a1, a2, a3, a4] = enLigneDeCommande ? process.argv : [];
if (enLigneDeCommande) try {
  if (cmd === "init") cmdInit(a1, a2, a3, a4);
  else if (cmd === "panel") cmdPanel(a1);
  else if (cmd === "clone-angles") {
    // Test de reproductibilité : mêmes angles validés, nouveau panel tiré avec une autre graine.
    for (const step of ["formulateur", "gardien-angles"] as const) writeJson(okPath(a2, step, "main"), readJson(okPath(a1, step, "main")));
    journal(a2, { event: "clone-angles", from: a1 });
    console.log(`Angles de ${a1} copiés dans ${a2}.`);
  }
  else if (cmd === "prepare") cmdPrepare(a1, a2 as StepName);
  else if (cmd === "ingest") cmdIngest(a1, a2 as StepName);
  else if (cmd === "simulate") cmdSimulate(a1);
  else if (cmd === "dossier") writeJson(path.join(runDir(a1), "dossier.json"), buildDossier(a1));
  else if (cmd === "status") cmdStatus(a1);
  else console.log("Commandes : init <case> <run> [seed] | prepare <run> <step> | ingest <run> <step> | simulate <run> | dossier <run> | status <run>");
} catch (e: any) {
  console.error("ERREUR :", e.message);
  process.exit(1);
}
