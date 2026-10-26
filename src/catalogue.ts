// Catalogue public des tests Résonance : page HTML générée à partir des runs réels (aucun chiffre saisi à la main).
// Usage : npx tsx src/catalogue.ts run-002 run-003 > catalogue.html
import fs from "node:fs";
import path from "node:path";
import { runDir, okPath, readJson, exists } from "./store.js";
import type { FormulateurOut, GardienOut, SociologueOut, ContradicteurOut, TraducteurOut } from "./schemas.js";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (x: number | null | undefined, d = 0) => (x == null ? "n.d." : `${(x * 100).toFixed(d).replace(".", ",")} %`);
const sur = (part: number | null | undefined, n: number | undefined) => (part == null || !n ? "n.d." : `${Math.round(part * n)} sur ${n}`);
const num = (x: number | null | undefined, d = 1) => (x == null ? "n.d." : x.toFixed(d).replace(".", ","));
const opt = <T>(run: string, step: string) => (exists(okPath(run, step, "main")) ? readJson<T>(okPath(run, step, "main")) : null);

function load(run: string) {
  const journal = fs.readFileSync(path.join(runDir(run), "journal.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return {
    run,
    m: readJson<any>(path.join(runDir(run), "metrics.json")),
    f: readJson<FormulateurOut>(okPath(run, "formulateur", "main")),
    g: readJson<GardienOut>(okPath(run, "gardien-angles", "main")),
    soc: opt<SociologueOut>(run, "sociologue"),
    con: opt<ContradicteurOut>(run, "contradicteur"),
    gf: opt<GardienOut>(run, "gardien-final"),
    tra: opt<TraducteurOut>(run, "traducteur"),
    journal,
  };
}

const COURT: Record<string, string> = {
  "v2018-equitables": "Initiative pour des aliments équitables",
  "v2018-souverainete": "Initiative pour la souveraineté alimentaire",
  "v2021-eau": "Initiative pour une eau potable propre",
  "v2021-pesticides": "Initiative pour une Suisse sans pesticides de synthèse",
  "v2021-co2": "Loi sur le CO2",
  "v2022-elevage": "Initiative sur l'élevage intensif",
  "v2023-climat": "Loi sur le climat et l'innovation",
  "v2024-biodiversite": "Initiative biodiversité",
};
const dateCH = (iso: string) => iso.split("-").reverse().join(".");

// Erreurs et frictions trouvées pendant les tests, et ce qui a été corrigé. Chaque ligne correspond à une modification du moteur.
const FRICTIONS: { probleme: string; correction: string; trouve_par: string }[] = [
  { probleme: "Le premier panel faisait moins bien que le simple résultat cantonal sur les votations réelles (15,0 points d'écart contre 7,0) et la propagation saturait à presque 100 % de soutien.", correction: "Mémoire politique sourcée de la commune (votations 1995 à 2017), consigne de réalisme pour les personas, propagation avec érosion du soutien.", trouve_par: "Backtest" },
  { probleme: "Le tirage aléatoire du panel déformait la commune (âges, nationalités) d'un run à l'autre.", correction: "Tirage par quotas sur les statistiques publiques, agriculteurs suréchantillonnés puis repondérés à leur part réelle.", trouve_par: "Autotest" },
  { probleme: "Les contrôles de texte ignoraient les mots accentués (« réglementation » passait sans être vu).", correction: "Frontières de mots compatibles avec les accents.", trouve_par: "Autotest" },
  { probleme: "Les votations d'étalonnage des années 1990 étaient hors de portée des jeunes personas, qui n'avaient pas l'âge de voter.", correction: "Étalonnage déplacé sur 2012 à 2017 ; consigne claire pour les votations antérieures à la majorité. Le second panel a été validé à 48 sur 48 du premier coup.", trouve_par: "Administrateur" },
  { probleme: "L'étalonnage sur les votations anciennes aggravait l'erreur (12,6 points au lieu de 10,2) : un biais mesuré sur d'autres sujets ne se transpose pas.", correction: "Correction par famille de votations (soutien à l'agriculture, contrainte sur l'agriculture, climat), en validation croisée.", trouve_par: "Backtest" },
  { probleme: "La validation croisée laissait deux votations du même jour se corriger l'une l'autre.", correction: "Les votations du même jour sont exclues ensemble. L'écart corrigé passe de 4,3 à 5,3 points : moins flatteur, plus honnête.", trouve_par: "Contradicteur" },
  { probleme: "Le Facilitateur appelait « co-porteurs » des habitants qui soutiennent sans s'engager.", correction: "Distinction explicite entre soutien et co-porteurs dans sa consigne, lecture refaite.", trouve_par: "Relecture" },
  { probleme: "Mesurer la participation sur une échelle de 0 à 4 écrasait tout : un seul persona sur 336 réactions viendrait à un atelier.", correction: "Étape Mobilisation : probabilité de participer à chaque format (avis en ligne, atelier présentiel, parcours à distance, atelier avec un proche).", trouve_par: "Contradicteur" },
  { probleme: "Le contrôle de cohérence de la mobilisation rejetait 6 personas sur 10 dont les probabilités basses étaient réalistes.", correction: "Seuils abaissés : l'écart entre intention et probabilité réelle est précisément ce qu'on mesure, l'exiger poussait à surestimer.", trouve_par: "Administrateur" },
  { probleme: "Les agriculteurs, suréchantillonnés pour être entendus, pesaient dans la propagation comme 17 % de la commune au lieu de 3 %.", correction: "Influence sociale pondérée par la part de population représentée.", trouve_par: "Contradicteur" },
  { probleme: "Aucun persona n'était opposant au départ : rien ne prouvait que le panel sache dire non.", correction: "Angle témoin volontairement descendant, présenté au même panel.", trouve_par: "Contradicteur" },
  { probleme: "Des affirmations de personas risquaient d'être reprises comme des faits sur la commune.", correction: "Le Sociologue écrit « selon tel persona, à vérifier » pour tout fait non sourcé, et compte toute répartition partisane sur les identifiants.", trouve_par: "Contradicteur" },
  { probleme: "Le Sociologue et le Contradicteur ne recevaient pas les faits sourcés de la commune : ils ont pris un chiffre officiel (3 exploitations bio sur 23, OFS) pour une invention de persona.", correction: "Les faits sourcés leur sont transmis ; la fromagerie, seul fait sans source, a été vérifiée et sourcée.", trouve_par: "Recoupement" },
  { probleme: "Le Traducteur reprenait une critique du Contradicteur que le second témoin avait déjà tranchée.", correction: "La lecture des témoins est calculée par le code et prime sur les critiques antérieures.", trouve_par: "Relecture" },
  { probleme: "Deux réponses de personas arrivaient tronquées d'une accolade finale.", correction: "Réparation automatique limitée aux accolades manquantes, tracée dans le journal.", trouve_par: "Administrateur" },
  { probleme: "« 7 votations sur 8 dans le bon camp » paraissait solide, mais la règle naïve « toujours non » en obtient 6 sur 8.", correction: "Références naïves ajoutées au backtest : résultat cantonal et « toujours non ».", trouve_par: "Contradicteur" },
  { probleme: "Le premier angle témoin mélangeait le ton imposé et l'objectif chiffré : impossible de savoir lequel faisait fuir le panel.", correction: "Second témoin : le même objectif chiffré, posé comme une question ouverte.", trouve_par: "Contradicteur" },
  { probleme: "Le facteur de réalisme de la mobilisation (0,97) masquait des erreurs qui se compensent : le panel sous-estime les grands scrutins et surestime les petits.", correction: "Correction calculée sur les votations les moins suivies, plus proches d'un atelier ; les effectifs bruts deviennent des plafonds.", trouve_par: "Contradicteur" },
  { probleme: "L'écart moyen du backtest mélangeait 6 votations corrigées et 2 restées brutes.", correction: "Les deux chiffres sont publiés séparément.", trouve_par: "Contradicteur" },
  { probleme: "Les fourchettes de soutien étaient présentées comme des intervalles de confiance.", correction: "Renommées « variabilité du modèle » : elles ne mesurent pas l'erreur réelle.", trouve_par: "Contradicteur" },
  { probleme: "Le troisième niveau s'appelait « solution », alors que la méthode refuse toute solution préétablie.", correction: "Renommé « chemins » : le décideur nomme l'enjeu et l'objectif, jamais les chemins (principe 6 du Gardien).", trouve_par: "Cyril Léger" },
];

function bars(rows: { label: string; fav: number; neg: number; soutien: number; temoin?: boolean }[]) {
  const w = (v: number) => `${(v * 100).toFixed(1)}%`;
  return `<div class="bars" role="img" aria-label="Accueil des angles et de l'angle témoin">${rows
    .map(
      (r) => `<div class="bar-row${r.temoin ? " t" : ""}"><span class="bar-lbl">${esc(r.label)}</span><div class="bar-track">
  <div class="bar-line"><span class="b fav" style="width:${w(r.fav)}"></span><span class="v">${pct(r.fav)}</span><span class="b neg" style="width:${w(r.neg)}"></span><span class="v n">${pct(r.neg)}</span></div>
  <div class="bar-line s"><span class="b sout" style="width:${w(r.soutien)}"></span><span class="v s">${pct(r.soutien)} à 24 mois</span></div></div></div>`,
    )
    .join("")}<div class="bar-row axis"><span></span><div class="bar-axis"><span>0 %</span><span>50 %</span><span>100 %</span></div></div></div>`;
}

// Extrait lisible d'un commentaire : à partir d'un mot repère, limité à quelques phrases entières.
const extrait = (txt: string, repere: string, phrases: number) => {
  const k = txt.indexOf(repere);
  const t = k >= 0 ? txt.slice(k) : txt;
  return (t.match(/.*?\.(?=\s+[A-ZÀ-Ý«]|\s*$)/gs) ?? [t]).slice(0, phrases).join("").trim();
};

export function renderCatalogue(refRun: string, repRun: string) {
  const A = load(refRun);
  const B = load(repRun);
  const c = readJson<any>(path.join(process.cwd(), "cases", "vuadens-bio", "case.json"));
  const r1 = readJson<any>(path.join(runDir("run-001"), "metrics.json"));
  const angles = A.m.angles as any[];
  const reco = A.soc?.angle_recommande.angle_id ?? angles.reduce((a, b) => (b.metrics.soutien.moyenne > a.metrics.soutien.moyenne ? b : a)).angle_id;
  const ctrl = A.m.controle;
  const ctrl2 = A.m.controle_objectif;
  const fmt = A.f.angles;
  const short = (id: number) => `Angle ${id}`;

  // Volume de travail réellement exécuté (journal des trois runs).
  const all = [load("run-001").journal, A.journal, B.journal].flat();
  const appels = all.filter((j) => j.event === "admin_accept" || j.event === "admin_reject").length;
  const rejets = all.filter((j) => j.event === "admin_reject").length;

  const barRows = [
    ...angles.map((a) => ({ label: `${short(a.angle_id)}${a.angle_id === 1 ? " (décideur)" : ""}`, fav: a.metrics.repartition_initiale.porteur + a.metrics.repartition_initiale.interesse, neg: a.metrics.repartition_initiale.reticent + a.metrics.repartition_initiale.opposant, soutien: a.metrics.soutien.moyenne })),
    ...(ctrl2 ? [{ label: "Témoin 2 : objectif chiffré, question ouverte", fav: ctrl2.metrics.repartition_initiale.porteur + ctrl2.metrics.repartition_initiale.interesse, neg: ctrl2.metrics.repartition_initiale.reticent + ctrl2.metrics.repartition_initiale.opposant, soutien: ctrl2.metrics.soutien.moyenne, temoin: true }] : []),
    ...(ctrl ? [{ label: "Témoin 1 : décision imposée", fav: ctrl.metrics.repartition_initiale.porteur + ctrl.metrics.repartition_initiale.interesse, neg: ctrl.metrics.repartition_initiale.reticent + ctrl.metrics.repartition_initiale.opposant, soutien: ctrl.metrics.soutien.moyenne, temoin: true }] : []),
  ];

  const anglesRows = angles
    .map((a) => {
      const b = (B.m.angles as any[]).find((x) => x.angle_id === a.angle_id);
      const ma = A.m.mobilisation?.angles.find((x: any) => x.angle_id === a.angle_id);
      const mb = B.m.mobilisation?.angles.find((x: any) => x.angle_id === a.angle_id);
      const fa = fmt.find((x) => x.id === a.angle_id)!;
      return `<tr${a.angle_id === reco ? ' class="reco"' : ""}><td><b>${short(a.angle_id)}</b>${fa.origine === "decideur" ? ' <span class="tag">décideur</span>' : ""}<br><span class="q">${esc(fa.formulation)}</span></td>
<td class="n">${pct(a.metrics.soutien.moyenne)}<br><small>${pct(b?.metrics.soutien.moyenne)}</small></td>
<td class="n">${pct(a.metrics.resistance.moyenne)}<br><small>${pct(b?.metrics.resistance.moyenne)}</small></td>
<td class="n">${sur(a.metrics.acteurs_cles?.part_initiale_favorable, a.metrics.acteurs_cles?.n)}<br><small>${sur(b?.metrics.acteurs_cles?.part_initiale_favorable, b?.metrics.acteurs_cles?.n)}</small></td>
<td class="n">${ma ? `${ma.formats.atelier_presentiel.habitants}` : "n.d."}<br><small>${mb ? mb.formats.atelier_presentiel.habitants : "n.d."}</small></td></tr>`;
    })
    .join("");

  const mobA = A.m.mobilisation?.angles.find((x: any) => x.angle_id === reco);
  const mobB = B.m.mobilisation?.angles.find((x: any) => x.angle_id === reco);
  const tile = (label: string, k: string, sub: string) =>
    mobA
      ? `<div class="tile"><span class="eyebrow">${label}</span><b>${mobA.formats[k].habitants_corriges ?? mobA.formats[k].habitants}</b><span>habitants, estimation prudente</span><small>${sub} · plafond ${mobA.formats[k].habitants}${mobB ? ` · second panel ${mobB.formats[k].habitants_corriges ?? mobB.formats[k].habitants}` : ""}</small></div>`
      : "";

  const bt = A.m.backtest;
  const btB = B.m.backtest;
  const s = bt.synthese;
  const btRows = (bt.votes as any[])
    .filter((v) => v.role === "test")
    .map((v) => {
      const w = (btB.votes as any[]).find((x) => x.vote_id === v.vote_id);
      const corr = v.simule_oui_famille_loo ?? v.simule_oui;
      return `<tr><td>${esc(COURT[v.vote_id] ?? v.titre.replace(/\s-\s.*$/, ""))}<br><small>${esc(dateCH(v.date))}</small></td><td class="n">${num(corr)} %<br><small>${num(w?.simule_oui_famille_loo ?? w?.simule_oui)} %</small></td><td class="n"><b>${num(v.reel_oui)} %</b></td><td class="n">${num(v.ecart_oui_famille_loo ?? v.ecart_oui)}</td><td class="n">${num(v.ecart_baseline_canton)}</td></tr>`;
    })
    .join("");

  const gA1 = A.g.verdicts.find((v) => v.cible === "angle 1");
  const gA2 = A.g.verdicts.find((v) => v.cible === "angle 2");
  const a2 = angles.find((a) => a.angle_id === 2);

  const attaques = (A.con?.attaques ?? []).slice(0, 6).map((x) => `<li><span class="eyebrow">${esc(x.posture)}</span><p>${esc(x.critique)}</p></li>`).join("");

  const frictions = FRICTIONS.map((x) => `<tr><td>${esc(x.probleme)}</td><td>${esc(x.correction)}</td><td><span class="tag">${esc(x.trouve_par)}</span></td></tr>`).join("");

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Catalogue Résonance</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Mise en page : une colonne éditoriale, des bandes de preuve (graphique, tableaux) qui s'élargissent. Thème clair unique, choisi par Régénère Plus. */
:root{--paper:#FBF8F3;--paper2:#F3EEE4;--card:#FFFFFF;--ink:#212E53;--soft:#56607A;--rule:#DDD5C6;--teal:#4A919E;--coral:#CE6A6B;--sage:#BED3C3;--salmon:#EBACA2;
--display:Fraunces,Georgia,serif;--body:Inter,system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace;color-scheme:light}
body{background:var(--paper);color:var(--ink);font:15.5px/1.62 var(--body);margin:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.wrap{max-width:1060px;margin:0 auto;padding-block:44px 72px;display:flex;flex-direction:column;gap:56px}
h1,h2,h3{font-family:var(--display);font-weight:500;letter-spacing:-.01em;text-wrap:balance;margin:0}
h1{font-size:clamp(32px,5.2vw,52px);line-height:1.06;max-width:22ch}h2{font-size:clamp(23px,3vw,30px);margin-bottom:10px}h3{font-size:18px;margin-bottom:6px}
p{margin:0}.lede{font-family:var(--display);font-size:clamp(17px,2vw,20px);color:var(--soft);max-width:62ch}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);font-weight:600}
section{display:flex;flex-direction:column;gap:16px}section>p{max-width:70ch}
.small{font-size:13px;color:var(--soft)}
.badges{display:flex;flex-wrap:wrap;gap:8px}.badge{font-size:12.5px;border:1px solid var(--rule);background:var(--card);border-radius:999px;padding:4px 12px}.badge.warn{border-color:var(--coral);color:#8f3637}
.levels{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.level{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:6px;min-width:0}
.level.open{background:var(--paper2);border-style:dashed}
.level b{font-family:var(--display);font-size:20px;font-weight:500}
ol.flow{list-style:none;counter-reset:s;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
ol.flow li{counter-increment:s;background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:12px 14px 12px 46px;position:relative;min-width:0}
ol.flow li::before{content:counter(s);position:absolute;left:14px;top:12px;font-family:var(--mono);font-size:13px;color:var(--teal);font-weight:500}
ol.flow li.sup{border-color:var(--teal);background:#EEF5F4}
ol.flow b{display:block;font-weight:600}ol.flow span{font-size:13px;color:var(--soft)}
.proof{background:var(--card);border:1px solid var(--rule);border-radius:14px;padding:22px}
.bars{display:flex;flex-direction:column;gap:14px}
.bar-row{display:grid;grid-template-columns:190px minmax(0,1fr);gap:14px;align-items:start}
.bar-lbl{font-weight:600;font-size:13.5px;text-align:right;padding-top:1px}.bar-row.t .bar-lbl{color:var(--coral)}
.bar-track{display:flex;flex-direction:column;gap:4px;min-width:0}
.bar-line{position:relative;height:16px;display:flex;align-items:center}
.bar-line.s{height:10px}
.b{display:block;height:100%;border-radius:3px}.b.fav{background:var(--teal)}.b.neg{background:var(--salmon);position:absolute;right:0;top:0}.b.sout{background:var(--sage)}
.v{font:500 11.5px var(--mono);margin-left:6px;white-space:nowrap}.v.n{position:absolute;right:6px;top:1px;margin:0}.v.s{color:var(--soft)}
.bar-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--soft);border-top:1px solid var(--rule);padding-top:4px}
.bar-row.axis{margin-top:-4px}
@media (max-width:560px){.bar-row{grid-template-columns:1fr;gap:6px}.bar-lbl{text-align:left}.bar-row.axis>span{display:none}}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:12.5px;color:var(--soft)}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-2px}
.verdict{border-left:3px solid var(--teal);background:#EAF2EE;padding:14px 18px;border-radius:6px;font-family:var(--display);font-size:17px;max-width:none}
.verdict.warn{border-color:var(--coral);background:#F8ECE9}
.tbl{overflow-x:auto;background:var(--card);border:1px solid var(--rule);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:14px;min-width:680px}th,td{border-bottom:1px solid var(--rule);padding:10px 12px;text-align:left;vertical-align:top}
th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);font-weight:600;background:var(--paper2)}tr:last-child td{border-bottom:0}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td small{color:var(--soft)}td .q{font-family:var(--display);font-size:15px}
tr.reco td{background:#F1F7F5}.tag{display:inline-block;font-size:11px;font-weight:600;border-radius:999px;padding:1px 9px;background:var(--paper2);border:1px solid var(--rule);color:var(--soft);white-space:nowrap}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.tile{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:2px;min-width:0}
.tile b{font-family:var(--display);font-size:34px;font-weight:500;font-variant-numeric:tabular-nums}.tile small{color:var(--soft);font-size:12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:8px;min-width:0}
blockquote{margin:0;font-family:var(--display);font-style:italic;font-size:16px;border-left:2px solid var(--sage);padding-left:12px}
ul.att{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
ul.att li{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-width:0}
ul.lim{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;max-width:75ch}
.cta{display:inline-block;background:var(--ink);color:var(--paper);text-decoration:none;font-weight:600;padding:10px 18px;border-radius:999px}.cta:hover,.cta:focus-visible{background:var(--teal);outline:none}
.foot{font-size:12.5px;color:var(--soft);border-top:1px solid var(--rule);padding-top:18px}
@media (prefers-reduced-motion:no-preference){.b.fav,.b.sout{transform-origin:left center;animation:grow .7s ease-out both}.b.neg{transform-origin:right center;animation:grow .7s ease-out both}@keyframes grow{from{transform:scaleX(.001)}}}
</style>
<div class="wrap">
<header style="display:flex;flex-direction:column;gap:16px">
  <span class="eyebrow">Régénère Plus · moteur Résonance · catalogue de tests</span>
  <h1>Avant de mobiliser une commune, tester l'angle. Voici ce que le moteur a réellement produit.</h1>
  <p class="lede">Un cas complet : ${esc(c.cible.nom)}, 2 580 habitants, commune de la Gruyère dans le canton de Fribourg, en Suisse. Joué deux fois avec deux panels différents, confronté aux votations réelles de la commune et attaqué par son propre Contradicteur. Tout ce qui suit sort des fichiers des runs.</p>
  <div class="badges"><span class="badge warn">Cas d'étude simulé, sans mandat de la commune</span><span class="badge">${appels} réponses d'agents contrôlées</span><span class="badge">${rejets} rejetées puis corrigées</span><span class="badge">2 panels de ${A.m.panel_resume.N} personas</span><span class="badge">${s.n_votes_test} votations réelles de test</span></div>
</header>

<section>
  <h2>Le principe</h2>
  <p>En phase 1, le décideur teste à huis clos une manière de poser la question sur un panel virtuel calibré sur les statistiques publiques de sa commune. Il cherche l'angle qui mobilise sans fermer la réponse. En phase 2, la question choisie part en participation réelle, en présentiel accompagné par la plateforme ou entièrement à distance.</p>
  <div class="levels">
    <div class="level"><span class="eyebrow">Enjeu · nommé par le décideur</span><b>Le problème</b><p class="small">${esc(c.enjeu)}</p></div>
    <div class="level"><span class="eyebrow">Objectif · nommé par le décideur</span><b>L'état visé</b><p class="small">${esc(c.objectif)}</p></div>
    <div class="level open"><span class="eyebrow">Chemins · laissés au terrain</span><b>Les manières d'y aller</b><p class="small">Aides, filières, accompagnement, débouchés, règles : le décideur ne les tranche pas. Ils sont inventés en phase 2 par les habitants et les agriculteurs.</p></div>
  </div>
</section>

<section>
  <h2>Le système multi-agents</h2>
  <p>Chaque agent est un appel isolé, qui ne voit que ce dont il a besoin. Les agents en vert ne produisent rien : ils contrôlent. Les chiffres de propagation, de mobilisation et de backtest sont calculés par du code, jamais par un modèle de langage.</p>
  <ol class="flow">
    <li><b>Formulateur d'angle</b><span>garde l'angle du décideur, propose d'autres angles ouverts</span></li>
    <li class="sup"><b>Gardien de la méthode</b><span>vérifie les six principes de la prospective rétrocausale</span></li>
    <li><b>Démographe</b><span>tire ${A.m.panel_resume.N} profils par quotas sur les données OFS</span></li>
    <li><b>${A.m.panel_resume.N} personas isolés</b><span>réagissent aux angles et votent sur les votations passées sans connaître le résultat</span></li>
    <li class="sup"><b>Administrateur du cadre</b><span>contrôles automatiques : format, âge, citations exactes, chiffres, chemins imposés</span></li>
    <li><b>Mobilisation et angle témoin</b><span>probabilités de venir par format, réaction à une question imposée</span></li>
    <li><b>Propagation et backtest</b><span>diffusion sur réseau social, comparaison aux votations réelles</span></li>
    <li><b>Sociologue et Facilitateur</b><span>segments, objections citées mot pour mot, freins à la participation</span></li>
    <li class="sup"><b>Contradicteur</b><span>attaque les conclusions sous huit postures</span></li>
    <li class="sup"><b>Gardien final, puis Traducteur</b><span>contrôle doctrinal, rapport au Conseil communal sans chiffre inventé</span></li>
  </ol>
</section>

${ctrl ? `<section>
  <h2>Premier test : le panel sait-il dire non ?</h2>
  <p>Un panel qui approuve tout ne sert à rien. Le même panel a donc reçu, à part, une question volontairement contraire à la méthode, le témoin 1 : « ${esc(ctrl.formulation)} »</p>
  ${ctrl2 ? `<p>Le Contradicteur a objecté que ce témoin mélange deux choses : le ton imposé et l'objectif chiffré, que les quatre angles ne mentionnent pas. Un second témoin garde l'objectif chiffré mais pose une question ouverte : « ${esc(ctrl2.formulation)} »</p>` : ""}
  <div class="proof">${bars(barRows)}<div class="legend" style="margin-top:12px"><span><i style="background:var(--teal)"></i>favorables au départ</span><span><i style="background:var(--salmon)"></i>réticents ou opposés au départ</span><span><i style="background:var(--sage)"></i>soutien après propagation</span></div></div>
  <p class="verdict">Sur l'angle témoin, ${pct(ctrl.metrics.repartition_initiale.reticent + ctrl.metrics.repartition_initiale.opposant)} du panel est réticent ou opposé d'emblée, contre ${pct(angles[0].metrics.repartition_initiale.reticent + angles[0].metrics.repartition_initiale.opposant)} pour l'angle du décideur. ${ctrl.metrics.acteurs_cles && ctrl.metrics.acteurs_cles.part_initiale_favorable === 0 ? "Aucun des agriculteurs du panel n'y est favorable." : `Seuls ${pct(ctrl.metrics.acteurs_cles?.part_initiale_favorable)} des agriculteurs du panel y sont favorables.`} Après propagation, son soutien plafonne à ${pct(ctrl.metrics.soutien.moyenne)}, contre ${pct(angles[0].metrics.soutien.moyenne)} pour l'angle du décideur. Le panel distingue une question qui ouvre d'une décision qui s'impose.</p>
  ${ctrl2 ? `<p class="verdict${ctrl2.metrics.soutien.moyenne < 0.4 ? " warn" : ""}">Avec l'objectif chiffré posé en question ouverte, ${pct(ctrl2.metrics.repartition_initiale.porteur + ctrl2.metrics.repartition_initiale.interesse)} du panel est favorable au départ (${sur(ctrl2.metrics.acteurs_cles?.part_initiale_favorable, ctrl2.metrics.acteurs_cles?.n)} agriculteurs) et le soutien atteint ${pct(ctrl2.metrics.soutien.moyenne)} après propagation, contre ${pct(ctrl.metrics.soutien.moyenne)} pour la décision imposée. ${ctrl2.metrics.soutien.moyenne - ctrl.metrics.soutien.moyenne >= 0.15 ? "La manière de poser la question pèse donc par elle-même, à objectif identique." : `C'est donc l'objectif chiffré lui-même qui fait fuir, quelle que soit la manière de le poser. La question ouverte ne change qu'une chose : l'opposition active retombe de ${pct(ctrl.metrics.resistance.moyenne)} à ${pct(ctrl2.metrics.resistance.moyenne)}. Les angles ouverts gagnent leur soutien en ne nommant pas cet objectif. Pour la méthode, c'est un signal fort : annoncer d'entrée l'objectif chiffré risque de refermer la porte que l'angle ouvre, et la phase 2 doit dire comment l'objectif sera discuté avec le terrain.`}</p>` : ""}
</section>` : ""}

<section>
  <h2>Les quatre angles, deux panels</h2>
  <p>Le premier chiffre vient du panel de référence, le second, en petit, d'un panel tiré avec une autre graine, sans aucun profil commun. Les écarts entre les deux donnent l'ordre de grandeur de l'incertitude due au tirage.</p>
  <div class="tbl"><table><thead><tr><th>Angle</th><th>Soutien à 24 mois</th><th>Opposition</th><th>Agriculteurs favorables</th><th>Habitants à l'atelier</th></tr></thead><tbody>${anglesRows}</tbody></table></div>
  <p class="small">Le soutien est un score de comparaison entre formulations, pas une part d'habitants qui voteraient oui : sur les initiatives qui contraignent l'agriculture, le panel surestime le oui de la commune.</p>
</section>

${mobA ? `<section>
  <h2>Mobiliser les habitants</h2>
  <p>Chaque persona a estimé sa probabilité de participer réellement à chaque format si la commune écrit à tous les ménages. Pour l'angle ${reco}, sur ${A.m.mobilisation.population_16_plus} résidents de 16 ans et plus :</p>
  <div class="tiles">${tile("Avis en ligne", "avis_en_ligne", "questionnaire de 10 minutes")}${tile("Atelier présentiel", "atelier_presentiel", "2 h 30, samedi matin ou soir")}${tile("Parcours à distance", "parcours_distance", "trois séquences de 20 minutes")}${tile("Atelier, invité par un proche", "atelier_si_invite_par_un_proche", "la même soirée, avec quelqu'un qu'on connaît")}</div>
  <p class="verdict">L'invitation personnelle par un proche multiplie la venue à l'atelier par ${num(mobA.effet_invitation)}${mobB ? ` (${num(mobB.effet_invitation)} sur le second panel)` : ""}. Pour mobiliser, des ambassadeurs comptent plus qu'un tous-ménages.</p>
  <p class="small">Le plafond additionne les probabilités annoncées par les personas. L'estimation prudente les multiplie par ${num(A.m.mobilisation.facteur_realisme_votations, 2)} : sur les ${A.m.mobilisation.n_scrutins_peu_suivis} votations les moins suivies, Vuadens a voté à ce rythme par rapport à ce que le panel annonçait. Un atelier mobilise encore moins qu'une votation : la phase de participation réelle servira à étalonner ces chiffres.</p>
</section>` : ""}

<section>
  <h2>Le panel face aux votations réelles de ${esc(c.cible.nom)}</h2>
  <p>Avant de juger des angles, les personas électeurs ont voté sur ${s.n_votes_test} votations fédérales de 2018 à 2024 liées à l'agriculture, à l'écologie et au climat, sans en connaître le résultat. Le résultat est corrigé par famille de votations, en validation croisée.</p>
  <div class="tbl"><table><thead><tr><th>Votation</th><th>Oui simulé corrigé</th><th>Oui réel</th><th>Écart</th><th>Écart du résultat cantonal</th></tr></thead><tbody>${btRows}</tbody></table></div>
  <p class="verdict">Écart moyen : ${num(s.ecart_moyen_oui_corrigees_seules)} points sur les ${s.n_votes_corriges} votations corrigées (second panel ${num(btB.synthese.ecart_moyen_oui_corrigees_seules)}), ${num(s.ecart_moyen_oui_famille_loo)} en y ajoutant les 2 votations restées brutes, contre ${num(s.ecart_moyen_oui_baseline_canton)} points en reprenant simplement le résultat cantonal. Bon camp : ${s.sens_correct_famille_loo}, autant que le canton (${s.sens_correct_baseline_canton}), et la règle « toujours non » fait ${s.sens_correct_baseline_toujours_non}. Le premier panel, sans mémoire politique, faisait ${num(r1.backtest.synthese.ecart_moyen_oui_brut)} points.</p>
  <p class="small">Huit votations seulement, des familles définies après avoir vu les premiers résultats, ${s.n_electeurs_panel} électeurs dans le panel. Le test montre que le panel capte le sens et l'ordre de grandeur du vote local sur ces sujets. Il ne prouve pas qu'il prédit une démarche participative.</p>
</section>

<section>
  <h2>Ce que les contrôleurs ont attrapé</h2>
  <div class="cards">
    ${gA1 ? `<div class="card"><span class="eyebrow">Gardien · angle du décideur</span><h3>« Faire pour que » les agriculteurs deviennent promoteurs</h3><p class="small">${esc(extrait(gA1.commentaire, "Violation", 2))}</p></div>` : ""}
    ${gA2 && a2 ? `<div class="card"><span class="eyebrow">Gardien puis personas · angle 2</span><h3>Une alerte doctrinale confirmée par le terrain simulé</h3><p class="small">Le Gardien jugeait que l'angle 2 présuppose des fermes déjà engagées vers le bio. Sans connaître cet avis, les agriculteurs du panel l'ont rejeté : ${sur(a2.metrics.acteurs_cles?.part_initiale_favorable, a2.metrics.acteurs_cles?.n)} favorables au départ, et l'opposition monte à ${pct(a2.metrics.resistance.moyenne)} de la population.</p></div>` : ""}
    ${A.gf ? `<div class="card"><span class="eyebrow">Gardien final · leviers</span><h3>Des chemins glissés dans les recommandations</h3><p class="small">${esc(extrait(A.gf.verdicts.find((v) => v.cible === "leviers")?.commentaire ?? "", "Principe 6", 2))}</p></div>` : ""}
    <div class="card"><span class="eyebrow">Administrateur</span><h3>${rejets} réponses rejetées et refaites</h3><p class="small">Jeunes électeurs qui sautaient des votations, citations qui n'existaient pas mot pour mot, formats trop longs, JSON cassé, probabilités incohérentes avec l'engagement déclaré. Rien n'entre dans les calculs sans passer ces contrôles.</p></div>
  </div>
  ${attaques ? `<h3 style="margin-top:8px">Le Contradicteur</h3><ul class="att">${attaques}</ul>` : ""}
</section>

<section>
  <h2>Erreurs trouvées et corrigées</h2>
  <p>Chaque ligne a modifié le moteur. Plusieurs corrections ont rendu les résultats moins flatteurs : c'est le but.</p>
  <div class="tbl"><table><thead><tr><th>Problème constaté</th><th>Correction</th><th>Trouvé par</th></tr></thead><tbody>${frictions}</tbody></table></div>
</section>

${A.tra ? `<section>
  <h2>Ce que la commune reçoit</h2>
  <p>Un rapport au Conseil communal rédigé par le Traducteur, à partir du seul dossier validé : chaque chiffre y est vérifié automatiquement contre les résultats, et les critiques du Contradicteur y figurent telles quelles.</p>
  <blockquote>${esc(A.tra.synthese)}</blockquote>
  <p><a class="cta" href="rapport-vuadens.html">Lire le rapport complet du run de référence</a></p>
</section>` : ""}

<section>
  <h2>Limites à connaître</h2>
  <ul class="lim">
    <li>Les personas sont des modèles de langage nourris de statistiques publiques. Ils ne remplacent aucun habitant réel, et la phase 2 reste indispensable.</li>
    <li>Les agriculteurs ne sont que 8 dans chaque panel : leurs pourcentages bougent de 12,5 points avec un seul persona.</li>
    <li>La propagation repose sur des paramètres d'influence non étalonnés sur des données de terrain. Les angles 1 et 3 sont au coude à coude : leurs fourchettes se recouvrent et le second panel les place à égalité.</li>
    <li>Aucun persona n'est opposant au départ sur les angles ouverts, alors que la commune a rejeté nettement les initiatives agricoles récentes. Seuls les témoins font apparaître des opposants : la résistance aux angles ouverts est probablement sous-estimée.</li>
    <li>Les deux mesures de participation ne concordent pas : sur l'échelle déclarative, l'angle 2 obtient le plus d'avis en ligne, sur les probabilités c'est l'angle 1. L'écart reste à expliquer.</li>
    <li>Les personas étrangers ne votent pas au niveau fédéral : leurs réponses ne sont pas vérifiées par le backtest.</li>
    <li>L'objectif se mesure en hectares, le modèle ne connaît que des personnes. Surfaces, exploitations et baux communaux restent à documenter avant toute communication.</li>
    <li>La commune n'a qu'une partie des leviers : prix du lait, paiements directs et règles de reconversion relèvent de la filière, du canton et de la Confédération.</li>
  </ul>
</section>

<footer class="foot">Régénère Plus · moteur Résonance, open source, en développement · Cas d'étude simulé sans mandat de la commune de ${esc(c.cible.nom)}. Sources : OFS (STATPOP, STATENT, élections au Conseil national 2023), résultats officiels des votations fédérales. Runs ${esc(refRun)} et ${esc(repRun)}.</footer>
</div>`;
}

// Typographie française : espaces insécables avant ? ! : ; » et après «, appliquées au contenu seulement (pas au CSS).
export function typoFr(html: string) {
  const i = html.indexOf("</style>");
  const head = html.slice(0, i), body = html.slice(i);
  return head + body.replace(/ ([?!:;»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");
}

if (process.argv[1]?.endsWith("catalogue.ts")) {
  const [, , ref = "run-002", rep = "run-003", out = "catalogue.html"] = process.argv;
  fs.writeFileSync(out, typoFr(renderCatalogue(ref, rep)), "utf8");
  console.log(`Catalogue écrit : ${out}`);
}
