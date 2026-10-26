// Tests des briques déterministes (sans LLM) : panel, propagation, métriques, backtest, et pièges pour l'Administrateur.
import assert from "node:assert/strict";
import { generatePanel, type PanelSpec } from "./demographe.js";
import { buildNetwork, simulateAngle, DEFAULT_PARAMS } from "./diffusion.js";
import { angleMetrics, backtest, mobilisationMetrics } from "./scoring.js";
import { makeRng } from "./rng.js";
import * as A from "./admin.js";
import { POSITIONS, type PersonaOut } from "./schemas.js";

const spec: PanelSpec = {
  univers: "test",
  population_16_plus: { valeur: 2000, source: "test" },
  tranches_age: [
    { tranche: "16-29", min: 16, max: 29, part: 0.2 },
    { tranche: "30-49", min: 30, max: 49, part: 0.35 },
    { tranche: "50-64", min: 50, max: 64, part: 0.25 },
    { tranche: "65+", min: 65, max: 90, part: 0.2 },
  ],
  source_age: "test",
  part_etrangers: { valeur: 0.15, source: "test" },
  part_femmes: { valeur: 0.5, source: "test" },
  agriculteurs: { part_16_plus: 0.04, source: "test", surechantillon: 8, age_min: 25, age_max: 70, part_bio: 0.1, orientation: "laitière", part_hommes: 0.7, part_suisses: 0.97 },
  activites_actifs: [{ activite: "employé·e du tertiaire", part: 0.6 }, { activite: "artisan·e ou ouvrier·ère", part: 0.4 }],
  source_activites: "test",
  partis: [{ parti: "PDC", part: 0.5 }, { parti: "UDC", part: 0.5 }],
  source_partis: "test",
  lieux_de_vie: [{ lieu: "centre du village", part: 0.5 }, { lieu: "quartier résidentiel récent", part: 0.5 }],
  hypotheses: [],
};

const { skeletons } = generatePanel(spec, 48, 42);
assert.equal(skeletons.length, 48);
assert.equal(skeletons.filter((s) => /agricult/.test(s.activite)).length, 8);
const totalW = skeletons.reduce((s, x) => s + x.poids, 0);
assert.ok(Math.abs(totalW - 2000) < 1e-6, `poids total ${totalW} ≠ population`);
const agriW = skeletons.filter((s) => /agricult/.test(s.activite)).reduce((s, x) => s + x.poids, 0);
assert.ok(Math.abs(agriW / totalW - 0.04) < 1e-9, "repondération agriculteurs incorrecte");
assert.ok(skeletons.every((s) => s.electeur === (s.nationalite === "suisse" && s.age >= 18)), "règle électeur incorrecte");
assert.deepEqual(generatePanel(spec, 48, 42).skeletons, skeletons, "panel non reproductible à graine égale");

const rng = makeRng(1);
const personas: PersonaOut[] = skeletons.map((s) => ({
  id: s.id,
  portrait: "Je suis un habitant de test avec un portrait assez long pour passer.",
  reactions: [1, 2].map((id) => ({
    angle_id: id,
    position: POSITIONS[Math.floor(rng.next() * 5)],
    intensite: 3,
    citation: `citation ${s.id} angle ${id} assez longue`,
    engagement: Math.floor(rng.next() * 5),
    freins_participation: [],
    ce_qui_me_ferait_venir: "",
  })),
  influence: { taille_cercle: 10, role: "suiveur", cercle_type: "voisins et famille" },
  votes: s.electeur ? [{ vote_id: "v1", participe_proba: 0.5, oui_proba: 0.4, raison: "test" }] : [],
}));

const net = buildNetwork(skeletons, 3, 4, 0.1);
assert.ok(net.every((n) => n.length >= 1), "nœud isolé dans le réseau");
const d = simulateAngle(1, personas, skeletons, net, { ...DEFAULT_PARAMS, runs: 200 }, 9);
assert.ok(d.monthly.every((m) => m.A >= 0 && m.A <= 1), "part A hors bornes");
const noDecay = simulateAngle(1, personas, skeletons, net, { ...DEFAULT_PARAMS, decay: 0, runs: 200 }, 9);
assert.ok(noDecay.monthly.every((m, i) => i === 0 || m.A >= noDecay.monthly[i - 1].A - 1e-9), "sans usure, la part A doit être croissante");
assert.ok(d.finalA.mean <= noDecay.finalA.mean + 0.02, "l'usure doit réduire le soutien final");
assert.ok(d.monthly.every((m) => Math.abs(m.A + m.O + m.N - 1) < 0.002), "A + O + N ≠ 1");
const d2 = simulateAngle(1, personas, skeletons, net, { ...DEFAULT_PARAMS, runs: 200 }, 9);
assert.deepEqual(d, d2, "propagation non reproductible");
const met = angleMetrics(1, personas, skeletons, d, [0.1, 0.2], { groupe: "agriculteurs", match: /agricult/ });
assert.ok(met.resonance >= 0 && met.resonance <= 10);
assert.equal(met.acteurs_cles?.n, 8);
assert.ok(met.coporteurs <= met.soutien.moyenne + 1e-9, "les co-porteurs sont un sous-ensemble des soutiens");
const bt = backtest(personas, skeletons, [{ vote_id: "v1", date: "x", titre: "t", vuadens_oui: 40, vuadens_participation: 50, fribourg_oui: 45, suisse_oui: 39 }], 5);
assert.equal(bt.votes[0].simule_oui, 40);
assert.equal(bt.votes[0].simule_participation, 50);
assert.equal(bt.votes[0].ecart_oui, 0);

// Pièges : l'Administrateur doit les attraper.
const fBad = {
  enjeu: "un enjeu suffisamment long pour le schéma",
  objectif: "objectif long",
  angles: [
    { id: 1, formulation: "Comment rendre la conversion bio obligatoire pour tous les agriculteurs ?", origine: "formulateur" as const, acteurs_actives: [{ acteur: "agri", levier: "dignité" }], chemins_ouverts: ["a", "b", "c"], risque_de_verrouillage: "aucun risque particulier" },
    { id: 3, formulation: "Comment faire pour que chacun mange mieux à l'école chaque jour", origine: "formulateur" as const, acteurs_actives: [{ acteur: "parents", levier: "santé" }], chemins_ouverts: ["a", "b", "c"], risque_de_verrouillage: "aucun risque particulier" },
  ],
};
const ef = A.checkFormulateur(fBad as any, {});
assert.ok(ef.some((e) => e.includes("obligatoire")), "moyen imposé non détecté");
assert.ok(ef.some((e) => e.includes("question ouverte")), "absence de « ? » non détectée");
assert.ok(ef.some((e) => e.includes("numérotés")), "numérotation non détectée");

const socBad = {
  angle_recommande: { angle_id: 1, justification: "x".repeat(70) },
  segments: [{ nom: "segment test", persona_ids: [personas[0].id], position_dominante: "opposant", objection_citee: "phrase que personne n'a dite", persona_source: personas[0].id, racine: "economique", levier: "un levier assez long" }],
  freins_participation: [{ frein: "horaires", persona_ids: ["p99"], levier: "un levier assez long" }],
  ambassadeurs_potentiels: [],
  surprises: [],
};
const es = A.checkSociologue(socBad as any, { personas, angleIds: [1, 2] });
assert.ok(es.some((e) => e.includes("n'existe pas mot pour mot")), "citation inventée non détectée");
assert.ok(es.some((e) => e.includes("p99")), "persona inexistant non détecté");

const tBad = { titre: "Rapport de test", synthese: "La résonance atteint 7,4 sur 10 — un résultat solide, avec 83 % d'adhésion.", sections: [] };
const et = A.checkTraducteur(tBad as any, { allowedNumbers: [7.4, 0.42] });
assert.ok(et.some((e) => e.includes("Tiret")), "tiret séparateur non détecté");
assert.ok(et.some((e) => e.includes("83")), "chiffre inventé non détecté");
assert.ok(!et.some((e) => e.includes("7.4")), "chiffre légitime refusé à tort");

const eContra = A.checkContradicteur({
  attaques: [1, 2, 3].map(() => ({ posture: "journaliste", cible: "angle", critique: "c".repeat(90), element_verifiable: "Selon l'étude Agroscope de 2023 sur les conversions", source_element: "connaissance_generale_a_verifier", impact: "impact réel", angle_mort: "angle mort réel" })),
  verdict: "accept_with_notes",
  notes_pour_rapport: ["note de test"],
} as any);
assert.ok(eContra.some((e) => e.includes("trois cibles")), "manque de diversité des cibles non détecté");
assert.ok(eContra.some((e) => e.includes("référence nommée")), "référence inventée non détectée");

// Mobilisation : incohérences avec l'engagement déclaré et réponses paresseuses.
const pMob = { id: "p01", portrait: "x", reactions: [1, 2].map((id) => ({ angle_id: id, position: id === 1 ? "porteur" : "reticent", intensite: 3, citation: "c", engagement: id === 1 ? 3 : 0, freins_participation: [], ce_qui_me_ferait_venir: "x" })), influence: { taille_cercle: 1, role: "isole", cercle_type: "x" }, votes: [] } as any;
const skMob = { id: "p01", age: 40 } as any;
const mobRow = (id: number, en: number, at: number) => ({ angle_id: id, avis_en_ligne: en, atelier_presentiel: at, parcours_distance: 0.1, atelier_si_invite_par_un_proche: at, ce_qui_doublerait_ma_venue: "une garde d'enfants" });
const eMob = A.checkMobilisation({ id: "p01", angles: [mobRow(1, 0.1, 0.02), mobRow(2, 0.1, 0.02)], format_prefere: "aucun", raison_format: "pas le temps" } as any, { skeleton: skMob, angleIds: [1, 2], persona: pMob });
assert.ok(eMob.some((e) => e.includes("Angle 1") && e.includes("atelier")), "incohérence atelier non détectée");
assert.ok(eMob.some((e) => e.includes("identiques")), "probabilités paresseuses non détectées");
const okMob = A.checkMobilisation({ id: "p01", angles: [mobRow(1, 0.6, 0.4), mobRow(2, 0.05, 0.01)], format_prefere: "atelier_presentiel", raison_format: "j'aime le contact" } as any, { skeleton: skMob, angleIds: [1, 2], persona: pMob });
assert.deepEqual(okMob, [], "réponse cohérente refusée à tort : " + okMob.join(" | "));
const mm = mobilisationMetrics(1, [{ id: "a", angles: [mobRow(1, 0.5, 0.2)] }, { id: "b", angles: [mobRow(1, 0.1, 0)] }] as any, [{ id: "a", poids: 1, activite: "x" }, { id: "b", poids: 3, activite: "x" }] as any, 1000, 0.5, 1);
assert.equal(mm.formats.atelier_presentiel.part, 0.05, "moyenne pondérée de mobilisation fausse");
assert.equal(mm.formats.atelier_presentiel.habitants, 50);
assert.equal(mm.formats.atelier_presentiel.habitants_corriges, 25);

console.log("selftest OK", { soutien: met.soutien, coporteurs: met.coporteurs, participation: met.participation });
