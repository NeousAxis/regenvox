// Test à l'aveugle par quartier dans une ville étrangère (Medellín, Bologne) : une démarche, un panel par quartier.
// Méthodes comparées : panel seul, modèle seul, hybride (le modèle lit le résumé des panels) et « rang du panel, niveau du modèle ».
// Les chiffres publiés sont sous scellé (data/SCELLE_<ville>_chiffres.json) et ne sont lus qu'après le commit des prévisions.
// Usage : npx tsx src/quartiers.ts cases <ville> <N> | entree <ville> | resume <ville> | prevision <ville> | fuite <ville> | comparer <ville>
import fs from "node:fs";
import path from "node:path";
import { makeRng } from "./rng.js";
import { ROOT, runDir, okPath, readJson, writeJson, exists } from "./store.js";
import type { PersonaSkeleton, ReactionMobilOut } from "./schemas.js";
import type { PanelSpec } from "./demographe.js";
import { spearman } from "./mobilisations.js";

const DIR = path.join(ROOT, "tests_aveugles");
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const NATIONALITES: Record<string, { nationale: string; etrangere: string }> = {
  CO: { nationale: "colombienne", etrangere: "étrangère (résident·e en Colombie)" },
  IT: { nationale: "italienne", etrangere: "étrangère (résident·e en Italie)" },
};

interface Part { part: number }
interface Territoire {
  id: string; nom: string; type: string; description: string;
  population_eligible: { valeur: number; annee: string | number; definition: string; source: string };
  tranches_age: { tranche: string; min: number; max: number; part: number }[]; source_age: string;
  part_femmes: { valeur: number; source: string }; part_etrangers: { valeur: number; source: string };
  lieux_de_vie: { lieu: string; part: number }[]; source_lieux_de_vie: string;
  activites_actifs: { activite: string; part: number }[]; source_activites: string;
  partis: { parti: string; part: number }[]; source_partis: string;
  hypotheses: string[];
}
interface Textes { ville: string; pays: string; demarche: Record<string, any>; territoires: Territoire[] }

const textes = (ville: string) => readJson<Textes>(path.join(ROOT, "data", `${ville}_textes.json`));
const runOf = (tid: string) => `q-${tid}`;
const f = (ville: string, suffixe: string) => path.join(DIR, `${ville}_${suffixe}.json`);
// Les parts collectées somment à 1 à l'arrondi près : on les ramène exactement à 1.
const norm = <T extends Part>(xs: T[], sousEnsemble = false) => {
  const t = xs.reduce((s, x) => s + x.part, 0);
  if (!sousEnsemble && Math.abs(t - 1) > 0.05) throw new Error(`Parts dont la somme vaut ${t.toFixed(3)}.`);
  return xs.map((x) => ({ ...x, part: x.part / t }));
};

// Un cas et une spécification de panel par quartier, à partir du fichier de textes.
function cases(ville: string, N: number) {
  const T = textes(ville);
  T.territoires.forEach((t, k) => {
    const dir = path.join(ROOT, "cases", t.id);
    const ages = norm(t.tranches_age);
    if (ages.some((a, i) => i > 0 && a.min !== ages[i - 1].max + 1)) throw new Error(`${t.id} : tranches d'âge non contiguës.`);
    writeJson(path.join(dir, "case.json"), {
      id: t.id,
      cible: { type: t.type, nom: t.nom, canton: "", pays: T.pays, description: t.description, ville: T.ville, ville_id: ville, nationalites: NATIONALITES[T.pays] },
      decideur: "aucun (test à l'aveugle)",
      enjeu: `prévoir la participation de ${t.nom} à ${T.demarche.nom}`,
      objectif: "publier une prévision avant d'ouvrir les chiffres et la comparer au résultat publié",
      horizon_mois: 1,
      panel: { N, seed: 20261026 + k },
      contexte_factuel: [],
      votations: [],
    });
    const spec: PanelSpec = {
      pays: T.pays,
      univers: `${t.population_eligible.definition}, ${t.nom} (${T.ville}), ${t.population_eligible.annee}`,
      population_16_plus: { valeur: t.population_eligible.valeur, source: t.population_eligible.source },
      tranches_age: ages,
      source_age: t.source_age,
      part_etrangers: t.part_etrangers,
      part_femmes: t.part_femmes,
      agriculteurs: { part_16_plus: 0, source: "sans objet", surechantillon: 0, age_min: 20, age_max: 70, part_bio: 0, orientation: "", part_hommes: 0.5, part_suisses: 1 },
      // Les retraités viennent des 65 ans et plus ; une répartition donnée pour tous les âges ferait des retraités de 25 ans.
      activites_actifs: norm(norm(t.activites_actifs).filter((a) => !/retrait/i.test(a.activite)), true),
      source_activites: t.source_activites,
      partis: norm(t.partis),
      source_partis: t.source_partis,
      lieux_de_vie: norm(t.lieux_de_vie),
      hypotheses: [...t.hypotheses, ...(t.activites_actifs.some((a) => /retrait/i.test(a.activite)) ? ["Retraités retirés de la répartition des activités des 20 à 64 ans (elle couvrait tous les âges) : seuls les 65 ans et plus sont retraités dans le panel."] : [])],
    };
    writeJson(path.join(dir, "panel.json"), spec);
  });
  console.log(`${T.territoires.length} cas écrits (${T.territoires.map((t) => t.id).join(", ")}).`);
}

// Ce que lit le modèle seul : la démarche et les quartiers, sans les réponses du panel.
function entree(ville: string) {
  const T = textes(ville);
  return {
    ville: T.ville,
    demarche: T.demarche,
    territoires: T.territoires.map((t) => ({
      id: t.id, nom: t.nom, type: t.type, description: t.description,
      population_eligible: t.population_eligible.valeur, definition_population: t.population_eligible.definition,
      tranches_age: t.tranches_age.map((a) => ({ tranche: a.tranche, part: a.part })),
      part_femmes: t.part_femmes.valeur, part_etrangers: t.part_etrangers.valeur,
      lieux_de_vie: t.lieux_de_vie, activites: t.activites_actifs, partis: t.partis,
    })),
  };
}

// Résumé des réponses du panel, par quartier : taux pondéré, part des habitants à 10 % ou plus, et 6 raisons tirées au hasard.
function resume(ville: string) {
  const T = textes(ville);
  return T.territoires.map((t, k) => {
    const runId = runOf(t.id);
    const skels = readJson<PersonaSkeleton[]>(path.join(runDir(runId), "panel.json"));
    if (skels.some((s) => !exists(okPath(runId, "quartiers", s.id)))) throw new Error(`${runId} : étape quartiers incomplète.`);
    const W = skels.reduce((s, x) => s + x.poids, 0);
    const rows = skels.map((s) => ({ s, r: readJson<ReactionMobilOut>(okPath(runId, "quartiers", s.id)).reactions[0] }));
    const taux = rows.reduce((s, x) => s + (x.s.poids / W) * x.r.participe_proba, 0);
    const forts = rows.reduce((s, x) => s + (x.r.participe_proba >= 0.1 ? x.s.poids / W : 0), 0);
    const raisons = makeRng(700 + k).shuffle(rows.map((x) => `${x.s.age} ans, ${x.s.activite}, ${x.s.lieu_de_vie} : ${x.r.raison}`)).slice(0, 6);
    return { id: t.id, nom: t.nom, run: runId, population_eligible: t.population_eligible.valeur, taux_panel: r4(taux), part_habitants_probabilite_10_pct_ou_plus: r4(forts), raisons_echantillon: raisons };
  });
}

type Estim = { estimations: { id: string; participants_estimes: number }[] };

function prevoir(ville: string) {
  const res = readJson<ReturnType<typeof resume>>(f(ville, "resume_panels"));
  const seul = readJson<Estim>(f(ville, "modele_seul")).estimations;
  const hyb = readJson<Estim>(f(ville, "hybride")).estimations;
  const get = (xs: Estim["estimations"], id: string) => {
    const v = xs.find((x) => x.id === id)?.participants_estimes;
    if (!Number.isFinite(v)) throw new Error(`Estimation manquante pour ${id}.`);
    return v!;
  };
  const panel = res.map((r) => r.taux_panel * r.population_eligible);
  const totalPanel = panel.reduce((a, b) => a + b, 0);
  const totalSeul = res.reduce((s, r) => s + get(seul, r.id), 0);
  // Rang du panel, niveau du modèle : le total du modèle seul, réparti entre quartiers comme le panel les répartit.
  return res.map((r, i) => ({
    id: r.id,
    nom: r.nom,
    population_eligible: r.population_eligible,
    taux_panel: r.taux_panel,
    participants_panel: Math.round(panel[i]),
    participants_modele_seul: get(seul, r.id),
    participants_hybride: get(hyb, r.id),
    participants_rang_panel_niveau_modele: Math.round((totalSeul * panel[i]) / totalPanel),
  }));
}

const scelle = (ville: string) => readJson<any>(path.join(ROOT, "data", `SCELLE_${ville}_chiffres.json`));

// Contrôle de fuite : un chiffre sous scellé apparaît-il dans un texte donné aux panels ou au modèle ? N'affiche que des décomptes.
function fuite(ville: string) {
  const S = scelle(ville);
  const texte = fs.readFileSync(path.join(ROOT, "data", `${ville}_textes.json`), "utf8").replace(/[\s'’.,]/g, "");
  const nombres = [S.edition_2026, S.edition_precedente].filter(Boolean).flatMap((e: any) => e.territoires.map((t: any) => t.nombre)).filter((n: any) => Number.isFinite(n) && n >= 100);
  const trouves = nombres.filter((n: number) => texte.includes(String(n)));
  console.log(JSON.stringify({ chiffres_sous_scelle_controles: nombres.length, retrouves_dans_les_textes: trouves.length }));
}

function comparer(ville: string) {
  const prev = readJson<{ previsions: ReturnType<typeof prevoir> }>(f(ville, "previsions")).previsions;
  const S = scelle(ville);
  if (!S.edition_2026) throw new Error("Résultats publiés pas encore relevés : edition_2026 est vide.");
  const reel = (id: string) => Number(S.edition_2026.territoires.find((t: any) => t.id === id)?.nombre);
  const avant = (id: string) => Number(S.edition_precedente?.territoires?.find((t: any) => t.id === id)?.nombre);
  const lignes = prev.map((p) => ({ ...p, reel: reel(p.id), edition_precedente: avant(p.id) })).filter((l) => Number.isFinite(l.reel) && l.reel > 0);
  const pop = lignes.map((l) => l.population_eligible);
  const reels = lignes.map((l) => l.reel);
  const tauxReel = reels.map((x, i) => x / pop[i]);
  const facteur = (xs: number[]) => {
    // Écart médian en facteur multiplicatif : 2 veut dire deux fois trop ou deux fois trop peu.
    const v = xs.map((x, i) => Math.exp(Math.abs(Math.log(Math.max(1, x) / reels[i])))).sort((a, b) => a - b);
    return r4(v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2);
  };
  // Test par permutation (unilatéral) : probabilité d'un classement des taux au moins aussi bon par hasard.
  const pPerm = (xs: number[]) => {
    const rho = spearman(xs, tauxReel);
    const rng = makeRng(42);
    let n = 0;
    for (let k = 0; k < 10000; k++) if (spearman(rng.shuffle([...xs]), tauxReel) >= rho) n++;
    return r4(n / 10000);
  };
  const methodes: Record<string, number[]> = {
    panel: lignes.map((l) => l.participants_panel),
    modele_seul: lignes.map((l) => l.participants_modele_seul),
    hybride: lignes.map((l) => l.participants_hybride),
    rang_panel_niveau_modele: lignes.map((l) => l.participants_rang_panel_niveau_modele),
  };
  const synthese: Record<string, any> = Object.fromEntries(
    Object.entries(methodes).map(([k, v]) => {
      const taux = v.map((x, i) => x / pop[i]);
      return [k, { spearman_taux: r4(spearman(taux, tauxReel)), p_permutation_taux: pPerm(taux), spearman_nombres: r4(spearman(v, reels)), ecart_median_en_facteur: facteur(v) }];
    }),
  );
  // Références naïves, hors critères : la taille des quartiers seule, et l'édition précédente reconduite.
  synthese.reference_population_seule = { spearman_nombres: r4(spearman(pop, reels)) };
  const prec = lignes.map((l) => l.edition_precedente);
  if (prec.every((x) => Number.isFinite(x) && x > 0))
    synthese.reference_edition_precedente = { spearman_taux: r4(spearman(prec.map((x, i) => x / pop[i]), tauxReel)), spearman_nombres: r4(spearman(prec, reels)), ecart_median_en_facteur: facteur(prec) };
  writeJson(path.join(DIR, `${ville}_bilan.json`), { n: lignes.length, nature_du_chiffre: S.edition_2026.nature, synthese, lignes });
  const v = (x: number | undefined) => (x == null || !Number.isFinite(x) ? "" : String(x).replace(".", ","));
  const md = [
    `# Test à l'aveugle par quartier : ${textes(ville).ville}`,
    "",
    `Généré par \`npx tsx src/quartiers.ts comparer ${ville}\`, après le commit des prévisions (historique Git de \`tests_aveugles/\`). Chiffre publié : ${S.edition_2026.nature}.`,
    "",
    "| Quartier | Population éligible | Panel seul | Modèle seul | Hybride | Rang du panel, niveau du modèle | Édition précédente | Réel |",
    "|---|---|---|---|---|---|---|---|",
    ...[...lignes].sort((a, b) => b.reel / b.population_eligible - a.reel / a.population_eligible).map((l) => `| ${l.nom} | ${l.population_eligible} | ${l.participants_panel} | ${l.participants_modele_seul} | ${l.participants_hybride} | ${l.participants_rang_panel_niveau_modele} | ${v(l.edition_precedente)} | ${l.reel} |`),
    "",
    "| Méthode | Rang des taux (Spearman) | p (permutation) | Rang des nombres | Écart médian (facteur) |",
    "|---|---|---|---|---|",
    ...Object.entries(synthese).map(([k, s]: [string, any]) => `| ${k.replaceAll("_", " ")} | ${v(s.spearman_taux)} | ${v(s.p_permutation_taux)} | ${v(s.spearman_nombres)} | ${v(s.ecart_median_en_facteur)} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(DIR, `${ville}_bilan.md`), md, "utf8");
  return { n: lignes.length, synthese };
}

if (path.basename(process.argv[1] ?? "") === "quartiers.ts") {
  const [, , cmd, ville, n] = process.argv;
  if (!ville) console.log("Usage : npx tsx src/quartiers.ts cases <ville> <N> | entree <ville> | resume <ville> | prevision <ville> | fuite <ville> | comparer <ville>");
  else if (cmd === "cases") cases(ville, parseInt(n ?? "30", 10));
  else if (cmd === "entree") writeJson(f(ville, "entree_modele"), entree(ville));
  else if (cmd === "resume") writeJson(f(ville, "resume_panels"), resume(ville));
  else if (cmd === "prevision") {
    if (fs.existsSync(f(ville, "previsions"))) throw new Error(`${f(ville, "previsions")} existe déjà : une prévision écrite ne se réécrit pas.`);
    writeJson(f(ville, "previsions"), { ecrit_le: new Date().toISOString(), previsions: prevoir(ville) });
    console.log(`Prévisions écrites. Les commiter et les pousser AVANT de lancer la comparaison.`);
  } else if (cmd === "fuite") fuite(ville);
  else if (cmd === "comparer") console.log(JSON.stringify(comparer(ville), null, 1));
}
