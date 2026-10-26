// Rapport HTML autonome d'un run (sert de fiche de catalogue). Tous les chiffres viennent de metrics.json et des sorties validées.
import fs from "node:fs";
import path from "node:path";
import { runDir, readJson, okPath, exists } from "./store.js";
import type { FormulateurOut, PersonaOut, PersonaSkeleton, SociologueOut, ContradicteurOut, GardienOut, FacilitateurOut, TraducteurOut } from "./schemas.js";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (x: number | null | undefined, d = 0) => (x == null ? "n.d." : `${(x * 100).toFixed(d).replace(".", ",")} %`);
const COLORS = ["#4A919E", "#CE6A6B", "#6A9A74", "#212E53", "#C88A3B"];

function chart(angles: any[], horizon: number) {
  const W = 640, H = 260, L = 44, R = 16, T = 16, B = 34;
  const x = (m: number) => L + (m / horizon) * (W - L - R);
  const maxY = Math.min(1, Math.max(0.2, ...angles.flatMap((a) => a.diffusion.monthly.map((m: any) => Math.max(m.A, m.O)))) + 0.05);
  const y = (v: number) => T + (1 - v / maxY) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].filter((t) => t <= maxY + 1e-9);
  const grid = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 4}" class="ax" text-anchor="end">${Math.round(t * 100)} %</text>`).join("");
  const xt = [0, 6, 12, 18, 24, 30, 36].filter((m) => m <= horizon).map((m) => `<text x="${x(m)}" y="${H - 12}" class="ax" text-anchor="middle">M${m}</text>`).join("");
  const lines = angles
    .map((a, i) => {
      const c = COLORS[i % COLORS.length];
      const pa = a.diffusion.monthly.map((m: any) => `${x(m.mois).toFixed(1)},${y(m.A).toFixed(1)}`).join(" ");
      const po = a.diffusion.monthly.map((m: any) => `${x(m.mois).toFixed(1)},${y(m.O).toFixed(1)}`).join(" ");
      const last = a.diffusion.monthly[a.diffusion.monthly.length - 1];
      return `<polyline points="${pa}" fill="none" stroke="${c}" stroke-width="2.4"/><polyline points="${po}" fill="none" stroke="${c}" stroke-width="1.4" stroke-dasharray="4 4" opacity=".8"/><circle cx="${x(last.mois)}" cy="${y(last.A)}" r="3.5" fill="${c}"/><text x="${x(last.mois) - 6}" y="${y(last.A) - 8}" class="lbl" fill="${c}" text-anchor="end">Angle ${a.angle_id}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Propagation par angle">${grid}${xt}${lines}</svg>`;
}

export function renderReport(runId: string): string {
  const dir = runDir(runId);
  const m = readJson<any>(path.join(dir, "metrics.json"));
  const manifest = readJson<any>(path.join(dir, "manifest.json"));
  const c = readJson<any>(path.join(dir, "..", "..", "cases", manifest.caseId, "case.json"));
  const f = readJson<FormulateurOut>(okPath(runId, "formulateur", "main"));
  const soc = readJson<SociologueOut>(okPath(runId, "sociologue", "main"));
  const con = readJson<ContradicteurOut>(okPath(runId, "contradicteur", "main"));
  const gar = readJson<GardienOut>(okPath(runId, "gardien-final", "main"));
  const gar1 = readJson<GardienOut>(okPath(runId, "gardien-angles", "main"));
  const fac = readJson<FacilitateurOut>(okPath(runId, "facilitateur", "main"));
  const tra = exists(okPath(runId, "traducteur", "main")) ? readJson<TraducteurOut>(okPath(runId, "traducteur", "main")) : null;
  const skels = readJson<PersonaSkeleton[]>(path.join(dir, "panel.json"));
  const personas = new Map(skels.map((s) => [s.id, readJson<PersonaOut>(okPath(runId, "personas", s.id))]));
  const skel = new Map(skels.map((s) => [s.id, s]));
  const journalLines = fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const rejects = journalLines.filter((j) => j.event === "admin_reject");
  const gardienRejects = journalLines.filter((j) => j.event === "gardien_reject");
  const frictions = journalLines.filter((j) => j.event === "friction");
  const bt = m.backtest;
  const reco = soc.angle_recommande.angle_id;
  const sources: { label: string; url: string }[] = c.sources ?? [];

  const angleCards = m.angles
    .map((a: any, i: number) => {
      const mt = a.metrics;
      const fa = f.angles.find((x) => x.id === a.angle_id)!;
      const k = mt.acteurs_cles;
      return `<article class="angle ${a.angle_id === reco ? "reco" : ""}">
  <div class="angle-head"><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span><span class="eyebrow">Angle ${a.angle_id} · ${fa.origine === "decideur" ? "proposé par le décideur" : "proposé par le Formulateur"}</span>${a.angle_id === reco ? '<span class="pill">Recommandé</span>' : ""}</div>
  <p class="q">${esc(fa.formulation)}</p>
  <dl class="kpis">
    <div><dt>Résonance initiale</dt><dd>${mt.resonance.toFixed(1)}<small>/10</small></dd><span class="ci">${pct(mt.repartition_initiale.porteur + mt.repartition_initiale.interesse)} favorables, ${pct(mt.repartition_initiale.reticent + mt.repartition_initiale.opposant)} réticents ou opposés</span></div>
    <div><dt>Soutien à ${c.horizon_mois} mois</dt><dd>${pct(mt.soutien.moyenne)}</dd><span class="ci">variabilité du modèle ${pct(mt.soutien.p05)} à ${pct(mt.soutien.p95)}</span></div>
    <div><dt>Co-porteurs engagés</dt><dd>${pct(mt.coporteurs, 1)}</dd><span class="ci">soutiennent et viendraient agir</span></div>
    <div><dt>Opposition active</dt><dd>${pct(mt.resistance.moyenne)}</dd></div>
    <div><dt>Avis en ligne (intention)</dt><dd>${pct(mt.participation.avis_en_ligne)}</dd></div>
    <div><dt>Atelier sur place (intention)</dt><dd>${pct(mt.participation.atelier, 1)}</dd></div>
    ${k ? `<div><dt>Agriculteurs : soutien final</dt><dd>${pct(k.part_finale_soutien)}</dd><span class="ci">${k.n} agriculteurs du panel, ${pct(k.part_initiale_favorable)} favorables au départ, ${pct(k.part_coporteurs, 1)} co-porteurs</span></div>` : ""}
  </dl>
  <p class="sens">Sensibilité du modèle (influence sociale ×0,5 / ×1,5) : soutien de ${pct(mt.soutien.sensibilite[0])} à ${pct(mt.soutien.sensibilite[1])}.</p>
</article>`;
    })
    .join("");

  const best1 = m.angles.reduce((a: any, b: any) => (b.metrics.soutien.moyenne > a.metrics.soutien.moyenne ? b : a));
  const temoinCard = (ctrl: any, titre: string) =>
    ctrl
      ? `<article class="angle" style="margin-top:16px;border-style:dashed"><div class="angle-head"><span class="dot" style="background:var(--soft)"></span><span class="eyebrow">${titre}</span></div>
  <p class="q">${esc(ctrl.formulation)}</p>
  <p class="small">${esc(ctrl.pourquoi)}</p>
  <dl class="kpis">
    <div><dt>Résonance initiale</dt><dd>${ctrl.metrics.resonance.toFixed(1).replace(".", ",")}<small>/10</small></dd><span class="ci">${pct(ctrl.metrics.repartition_initiale.porteur + ctrl.metrics.repartition_initiale.interesse)} favorables, ${pct(ctrl.metrics.repartition_initiale.reticent + ctrl.metrics.repartition_initiale.opposant)} réticents ou opposés</span></div>
    <div><dt>Soutien à ${c.horizon_mois} mois</dt><dd>${pct(ctrl.metrics.soutien.moyenne)}</dd><span class="ci">contre ${pct(best1.metrics.soutien.moyenne)} pour le meilleur angle ouvert</span></div>
    <div><dt>Opposition active</dt><dd>${pct(ctrl.metrics.resistance.moyenne)}</dd></div>
    ${ctrl.metrics.acteurs_cles ? `<div><dt>Agriculteurs favorables</dt><dd>${Math.round(ctrl.metrics.acteurs_cles.part_initiale_favorable * ctrl.metrics.acteurs_cles.n)} sur ${ctrl.metrics.acteurs_cles.n}</dd><span class="ci">au départ</span></div>` : ""}
  </dl></article>`
      : "";
  const ctrlCard = temoinCard(m.controle, "Témoin 1 · décision imposée") + temoinCard(m.controle_objectif, "Témoin 2 · objectif chiffré, question ouverte");

  const segs = soc.segments
    .map((s) => {
      const src = skel.get(s.persona_source);
      return `<article class="seg"><div class="eyebrow">${esc(s.nom)} · ${s.persona_ids.length} personas · ${esc(s.position_dominante)} · racine ${esc(s.racine)}</div>
<blockquote>« ${esc(s.objection_citee)} »<cite>${esc(s.persona_source)}, ${src ? `${src.age} ans, ${esc(src.activite)}` : ""}</cite></blockquote>
<p><b>Levier</b> : ${esc(s.levier)}</p></article>`;
    })
    .join("");

  const freins = soc.freins_participation.map((x) => `<li><b>${esc(x.frein)}</b> (${x.persona_ids.length} personas) : ${esc(x.levier)}</li>`).join("");

  const testVotes = bt.votes.filter((v: any) => v.role === "test");
  const calVotes = bt.votes.filter((v: any) => v.role === "etalonnage");
  const f1 = (x: number | null | undefined) => (x == null ? "n.d." : `${x.toFixed(1).replace(".", ",")} %`);
  const EFFET: Record<string, string> = { soutien_agriculture: "soutien à l'agriculture", contrainte_agriculture: "contrainte sur l'agriculture", climat_energie: "climat et énergie" };
  const btRows = testVotes
    .map(
      (v: any) => `<tr><td>${esc(v.titre.replace(/\s-\s.*$/, ""))}<br><small>${esc(v.date.split("-").reverse().join("."))} · ${esc(EFFET[v.effet_agriculture] ?? v.effet_agriculture ?? "")}</small></td><td class="n">${f1(v.simule_oui)}<br><small>${v.simule_oui_ic90[0]} à ${v.simule_oui_ic90[1]}</small></td><td class="n">${f1(v.simule_oui_famille_loo)}</td><td class="n"><b>${f1(v.reel_oui)}</b></td><td class="n">${v.ecart_oui ?? "n.d."}</td><td class="n">${v.ecart_oui_famille_loo ?? "n.d."}</td><td class="n">${v.ecart_baseline_canton ?? "n.d."}</td><td class="n">${v.ecart_baseline_suisse ?? "n.d."}</td></tr>`,
    )
    .join("");
  const calRows = calVotes.map((v: any) => `<li>${esc(v.titre)} (${esc(v.date.slice(0, 4))}) : simulé ${f1(v.simule_oui)}, réel ${f1(v.reel_oui)}</li>`).join("");
  const s = bt.synthese;
  const best = Math.min(s.ecart_moyen_oui_baseline_canton ?? 99, s.ecart_moyen_oui_baseline_suisse ?? 99);
  const corr = s.ecart_moyen_oui_famille_loo;
  const verdictBt =
    corr == null
      ? "Résultats réels indisponibles : backtest non concluant."
      : `Écart moyen sur les ${s.n_votes_test} votations de test : ${s.ecart_moyen_oui_brut} points pour le panel brut, ${corr} points après correction par famille, contre ${s.ecart_moyen_oui_baseline_canton} points si l'on applique simplement le résultat cantonal et ${s.ecart_moyen_oui_baseline_suisse} points avec le résultat suisse. ` +
        (corr < best
          ? "Corrigé par famille, le panel prédit mieux le vote de la commune que les deux références naïves. "
          : corr < (s.ecart_moyen_oui_baseline_suisse ?? 99)
            ? "Corrigé, le panel fait mieux que le résultat suisse mais pas mieux que le résultat cantonal : il ne capte pas encore toute la spécificité locale. "
            : "Même corrigé, le panel ne fait pas mieux que les références naïves : ses niveaux absolus ne sont pas fiables, seules les comparaisons entre angles ont un sens. ") +
        `L'étalonnage sur les votations anciennes, essayé d'abord, dégradait le résultat (${s.ecart_moyen_oui_etalonne} points) : un biais mesuré sur d'autres sujets ne se transpose pas.`;
  const biaisFam = Object.entries(bt.biais_par_effet_agriculture ?? {})
    .map(([k, v]) => `${EFFET[k] ?? k} ${(v as number) > 0 ? "+" : ""}${(v as number).toFixed(2)}`)
    .join(", ");

  const mob = m.mobilisation;
  const FMT: [string, string][] = [["avis_en_ligne", "Avis en ligne"], ["atelier_presentiel", "Atelier présentiel"], ["parcours_distance", "Parcours à distance"], ["atelier_si_invite_par_un_proche", "Atelier, si invité par un proche"]];
  const mobRows = mob
    ? mob.angles
        .map((a: any) => `<tr><td>Angle ${a.angle_id}${a.angle_id === reco ? " <b>(recommandé)</b>" : ""}</td>${FMT.map(([k]) => {
          const x = a.formats[k];
          return `<td class="n"><b>${pct(x.part, 1)}</b><br><small>${pct(x.ic90[0], 1)} à ${pct(x.ic90[1], 1)}</small><br>≈ ${x.habitants} hab.${x.habitants_corriges != null && Math.abs(1 - mob.facteur_realisme_votations) >= 0.1 ? `<br><small>corrigé ≈ ${x.habitants_corriges}</small>` : ""}</td>`;
        }).join("")}</tr>`)
        .join("")
    : "";
  const mobAgri = mob
    ? mob.angles
        .filter((a: any) => a.acteurs_cles)
        .map((a: any) => `Angle ${a.angle_id} : atelier ${pct(a.acteurs_cles.atelier_presentiel, 1)}, en ligne ${pct(a.acteurs_cles.avis_en_ligne, 1)}, à distance ${pct(a.acteurs_cles.parcours_distance, 1)}, si invités par un proche ${pct(a.acteurs_cles.atelier_si_invite_par_un_proche, 1)}`)
        .join(" ; ")
    : "";
  const mobPref = mob ? Object.entries(mob.formats_preferes).map(([k, v]) => `${(FMT.find((f) => f[0] === k)?.[1] ?? "Aucun").toLowerCase()} ${pct(v as number)}`).join(", ") : "";
  const mobRecoAngle = mob?.angles.find((a: any) => a.angle_id === reco);
  const mobSection = mob
    ? `<div class="panel"><h3 style="margin-top:0">Combien d'habitants participeraient, par format</h3><p class="small">Chaque persona a estimé sa probabilité de participer réellement à chaque format (invitation par courrier à tous les ménages). Moyenne pondérée, intervalle à 90 % par rééchantillonnage du panel, convertie en habitants sur ${mob.population_16_plus} résidents de 16 ans et plus. Le chiffre brut est un plafond. La ligne « corrigé » le multiplie par ${String(mob.facteur_realisme_votations).replace(".", ",")} : sur les ${mob.n_scrutins_peu_suivis ?? ""} votations les moins suivies, Vuadens a voté à ce rythme par rapport à ce que le panel annonçait. Un atelier mobilise encore moins qu'une votation : ces chiffres sont des ordres de grandeur, que la phase de participation réelle permettra d'étalonner.</p>
<div class="tbl"><table><thead><tr><th>Angle</th>${FMT.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${mobRows}</tbody></table></div>
${mobRecoAngle?.effet_invitation ? `<p class="verdict">Une invitation personnelle par un proche multiplie la venue à l'atelier par ${String(mobRecoAngle.effet_invitation).replace(".", ",")} sur l'angle recommandé : les ambassadeurs comptent plus que le courrier.</p>` : ""}
<p class="small">Format préféré dans le panel : ${esc(mobPref)}.${mobAgri ? ` Agriculteurs du panel : ${esc(mobAgri)}.` : ""}</p></div>`
    : "";

  const voices = soc.ambassadeurs_potentiels
    .slice(0, 4)
    .map((a) => {
      const p = personas.get(a.persona_id);
      const sk = skel.get(a.persona_id);
      const r = p?.reactions.find((x) => x.angle_id === reco);
      return p && sk && r ? `<figure class="voice"><blockquote>« ${esc(r.citation)} »</blockquote><figcaption>${esc(a.persona_id)}, ${sk.age} ans, ${esc(sk.activite)} · ${esc(a.pourquoi)}</figcaption></figure>` : "";
    })
    .join("");

  const attaques = con.attaques
    .map((x) => `<li><span class="eyebrow">${esc(x.posture)} · cible ${esc(x.cible)}</span><p>${esc(x.critique)}</p><p class="small">Élément : ${esc(x.element_verifiable)} <i>(${x.source_element === "donnees_du_run" ? "données du run" : "connaissance générale, à vérifier"})</i>. Angle mort : ${esc(x.angle_mort)}</p></li>`)
    .join("");

  const facLines = fac.angles
    .map((a) => `<li><b>Angle ${a.angle_id}</b> : ${esc(a.lecture)}<br><small>Déclencheurs : ${a.declencheurs_cles.map(esc).join(" ; ")}</small></li>`)
    .join("");

  const traSections = tra ? tra.sections.map((x) => `<h3>${esc(x.titre)}</h3><p>${esc(x.contenu).replace(/\n+/g, "</p><p>")}</p>`).join("") : "";

  return `<meta charset="utf-8">
<title>Résonance Vuadens</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root{--paper:#FBF8F3;--paper2:#F4EFE6;--card:#fff;--ink:#212E53;--soft:#4a556b;--rule:#d8d0c0;--teal:#4A919E;--coral:#CE6A6B;--sage:#BED3C3;--salmon:#EBACA2;color-scheme:light}
body{background:var(--paper);color:var(--ink);font:15px/1.6 Inter,system-ui,sans-serif;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.wrap{max-width:1040px;margin:0 auto;padding-block:40px 64px;display:flex;flex-direction:column;gap:48px}
h1,h2,h3{font-family:Fraunces,Georgia,serif;font-weight:500;letter-spacing:-.01em;text-wrap:balance;margin:0}
h1{font-size:clamp(30px,5vw,46px);line-height:1.08}h2{font-size:clamp(22px,3vw,28px);margin-bottom:14px}h3{font-size:18px;margin:18px 0 6px}
.eyebrow{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--soft);font-weight:600}
.lede{font-family:Fraunces,serif;font-size:18px;color:var(--soft);max-width:68ch}
.badges{display:flex;flex-wrap:wrap;gap:8px}.badge{font-size:12px;border:1px solid var(--rule);background:var(--card);border-radius:999px;padding:4px 12px}.badge.warn{border-color:var(--coral);color:#9b3f40}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.angle{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:20px;min-width:0}.angle.reco{border:2px solid var(--teal)}
.angle-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dot{width:10px;height:10px;border-radius:50%}
.pill{background:var(--teal);color:#fff;font-size:11px;font-weight:600;border-radius:999px;padding:2px 10px}
.q{font-family:Fraunces,serif;font-size:17px;margin:10px 0 14px}
.kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}.kpis div{min-width:0}.kpis dt{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}.kpis dd{margin:2px 0 0;font-family:Fraunces,serif;font-size:26px;font-variant-numeric:tabular-nums}.kpis dd small{font-size:13px;color:var(--soft)}.ci{display:block;font-size:11.5px;color:var(--soft)}
.sens{font-size:12px;color:var(--soft);margin:12px 0 0}
.panel{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:20px}
.chart svg{width:100%;height:auto}.grid{stroke:#e8e2d4}.ax{font:11px Inter,sans-serif;fill:var(--soft)}.lbl{font:600 11px Inter,sans-serif}
.legend{font-size:12px;color:var(--soft)}
.seg{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:16px;min-width:0}
blockquote{margin:8px 0;font-family:Fraunces,serif;font-style:italic;font-size:16px}cite{display:block;font-style:normal;font-family:Inter,sans-serif;font-size:12px;color:var(--soft);margin-top:4px}
.voice{margin:0;background:var(--paper2);border-radius:10px;padding:14px 16px}.voice figcaption{font-size:12px;color:var(--soft)}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13.5px;min-width:720px}th,td{border-bottom:1px solid var(--rule);padding:8px 10px;text-align:left;vertical-align:top}th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}td.n{text-align:right;font-variant-numeric:tabular-nums}
.verdict{border-left:3px solid var(--teal);background:#e7f0eb;padding:12px 16px;border-radius:6px;font-family:Fraunces,serif;font-size:16px}
ul.att{list-style:none;padding:0;display:flex;flex-direction:column;gap:12px}ul.att li{background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--coral);border-radius:8px;padding:12px 16px}ul.att p{margin:6px 0 0}.small{font-size:12.5px;color:var(--soft)}
.method li{margin-bottom:4px}.foot{font-size:12px;color:var(--soft);border-top:1px solid var(--rule);padding-top:16px}
a{color:var(--teal)}
</style>
<div class="wrap">
<header style="display:flex;flex-direction:column;gap:14px">
  <div class="eyebrow">Résonance · catalogue de cas · simulation multi-agents</div>
  <h1>${esc(c.cible.nom)} : vers une agriculture biologique portée par les agriculteurs</h1>
  <p class="small">Commune de la Gruyère, canton de Fribourg, Suisse.</p>
  <p class="lede"><b>Enjeu</b> : ${esc(c.enjeu)}<br><b>Objectif</b> : ${esc(c.objectif)}</p>
  <div class="badges"><span class="badge warn">Cas d'étude simulé, sans mandat de la commune</span><span class="badge">Panel de ${skels.length} personas calibré sur données publiques</span><span class="badge">${bt.synthese.n_votes_test} votations de test, ${bt.etalonnage.n_votes_etalonnage} d'étalonnage</span><span class="badge">Run ${esc(runId)} · graine ${manifest.seed}</span></div>
</header>
${tra ? `<section><h2>Synthèse</h2><p class="lede" style="color:var(--ink)">${esc(tra.synthese)}</p></section>` : ""}
<section><h2>Les angles testés</h2><p class="small">Un angle nomme l'enjeu et l'objectif, jamais les chemins : ceux-ci restent ouverts au terrain. Les chiffres de participation sont des intentions déclarées par le panel, pas des prévisions : le backtest montre que le panel ne sait pas encore prédire la participation réelle.</p><div class="grid2">${angleCards}</div>${ctrlCard}</section>
<section class="panel chart"><h2>Propagation simulée sur ${c.horizon_mois} mois</h2>${chart(m.angles, c.horizon_mois)}<p class="legend">Trait plein : part de soutien. Pointillé : opposition active. Moyenne de ${400} simulations sur un réseau social entre les personas.</p><ul>${facLines}</ul></section>
<section><h2>Segments, objections réelles du panel et leviers</h2><p class="small">Chaque citation est vérifiée mot pour mot par l'Administrateur du cadre dans les réponses des personas.</p><div class="grid2">${segs}</div></section>
<section><h2>Mobiliser les habitants</h2>${mobSection}<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">Freins et leviers de participation</h3><ul>${freins}</ul>${voices ? `<h3>Ambassadeurs potentiels</h3><div class="grid2">${voices}</div>` : ""}</div></section>
<section><h2>Fiabilité : le panel face aux votations réelles de ${esc(c.cible.nom)}</h2><p class="small">Le panel a voté, sans connaître les résultats, sur ${s.n_votes_test} votations fédérales réelles (2018 à 2024) qui touchent à l'agriculture, à l'écologie ou au climat. La correction par famille regroupe les votations selon leur effet sur l'agriculture (soutien, contrainte, climat et énergie) : pour chaque votation, le biais de sa famille est mesuré sur les <b>autres</b> votations de la même famille, en excluant aussi celles du même jour (validation croisée), puis appliqué. Les deux votations du 23 septembre 2018 n'ont pas d'autre votation de leur famille à une autre date : elles restent non corrigées. La fourchette « IC 90 % » ne reflète que l'échantillonnage du panel, pas l'erreur du modèle : le résultat réel en sort souvent. Biais moyens mesurés, en logit : ${esc(biaisFam)}. Une valeur négative signifie que le panel surestime le oui : sur les initiatives qui contraignent l'agriculture, la commune vote nettement plus non que ce que le panel prévoit.</p>
<div class="tbl panel"><table><thead><tr><th>Votation de test</th><th>Oui simulé brut (IC 90 %)</th><th>Oui simulé corrigé</th><th>Oui réel commune</th><th>Écart brut</th><th>Écart corrigé</th><th>Écart si résultat cantonal</th><th>Écart si résultat suisse</th></tr></thead><tbody>${btRows}</tbody></table></div>
<p class="verdict">${verdictBt} Bon camp (oui ou non) prédit : ${s.sens_correct_brut} brut, ${s.sens_correct_famille_loo} corrigé, contre ${s.sens_correct_baseline_canton} pour le résultat cantonal et ${s.sens_correct_baseline_toujours_non} pour la règle naïve « toujours non ». Écart maximal après correction : ${String(s.ecart_max_oui_famille_loo).replace(".", ",")} points. Participation aux votations : écart moyen ${s.ecart_moyen_participation_brut} points, le panel ne sait pas prédire qui se déplace.</p>
<p class="small">Limites : ${s.n_votes_test} votations seulement, des familles définies après avoir vu les premiers résultats, ${s.n_electeurs_panel} électeurs dans le panel. Ce test montre que le panel capte le sens et l'ordre de grandeur du vote local sur ces sujets, pas qu'il prédit une démarche participative.</p><details><summary class="small">Votations d'étalonnage</summary><ul class="small">${calRows}</ul></details></section>
<section><h2>Ce que le Contradicteur objecte</h2><p class="small">Verdict : ${con.verdict === "reject" ? "rejet" : "accepté avec réserves"}.</p><ul class="att">${attaques}</ul><h3>Réserves à garder en tête</h3><ul>${con.notes_pour_rapport.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>
${traSections ? `<section class="panel"><h2>Rapport au Conseil communal</h2>${traSections}</section>` : ""}
<section class="panel method"><h2>Méthode, contrôles et hypothèses</h2>
<p>Agents : Formulateur d'angle, ${skels.length} personas isolés, Facilitateur social, Sociologue, Contradicteur, Traducteur. Superviseurs : Administrateur du cadre (contrôles automatiques : format, citations exactes, chiffres présents dans le dossier, absence de chemins imposés, typographie) et Gardien de la méthode (${[gar1, gar].map((g) => (g.decision === "accept" ? "accepté" : "rejeté")).join(" puis ")}). Les chiffres de propagation, de participation et de backtest sont calculés par du code déterministe, pas par un modèle de langage.</p>
<p>Journal : ${rejects.length} sorties rejetées par l'Administrateur puis corrigées, ${gardienRejects.length} rejet(s) doctrinal(aux) du Gardien, ${frictions.length} friction(s) de format.</p>
<h3>Hypothèses déclarées</h3><ul>${m.hypotheses.map((h: string) => `<li>${esc(h)}</li>`).join("")}</ul>
${sources.length ? `<h3>Sources</h3><ul>${sources.map((x) => `<li><a href="${esc(x.url)}">${esc(x.label)}</a></li>`).join("")}</ul>` : ""}
</section>
<footer class="foot">Régénère Plus · moteur Résonance (open source, en développement) · Les personas sont des profils simulés à partir de statistiques publiques, ils ne représentent aucune personne réelle et une simulation ne dit pas ce que pense un habitant réel.</footer>
</div>`;
}

if (process.argv[1]?.endsWith("report.ts")) {
  const runId = process.argv[2];
  const out = path.join(runDir(runId), "rapport.html");
  fs.writeFileSync(out, renderReport(runId), "utf8");
  console.log(out);
}
