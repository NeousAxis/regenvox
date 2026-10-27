// Rapport HTML autonome d'un test de démarche lancé depuis la plateforme (commune, école ou entreprise).
// Même règle que le rapport du catalogue : tous les chiffres viennent de metrics.json et des sorties validées.
import fs from "node:fs";
import path from "node:path";
import { runDir, readJson, okPath, exists } from "./store.js";
import type { FormulateurOut, PersonaOut, PersonaSkeleton, SociologueOut, ContradicteurOut, FacilitateurOut, TraducteurOut } from "./schemas.js";
import { STYLE, COLORS, esc, pct, chart } from "./report.js";

const FMT: [string, string][] = [["avis_en_ligne", "Avis en ligne"], ["atelier_presentiel", "Atelier sur place"], ["parcours_distance", "Parcours à distance"], ["atelier_si_invite_par_un_proche", "Atelier, si invité par un proche"]];

export function renderRapportPlateforme(runId: string, meta: { organisation: string; date: string }): string {
  const dir = runDir(runId);
  const m = readJson<any>(path.join(dir, "metrics.json"));
  const manifest = readJson<any>(path.join(dir, "manifest.json"));
  const c = readJson<any>(path.join(dir, "..", "..", "cases", manifest.caseId, "case.json"));
  const f = readJson<FormulateurOut>(okPath(runId, "formulateur", "main"));
  const soc = readJson<SociologueOut>(okPath(runId, "sociologue", "main"));
  const con = readJson<ContradicteurOut>(okPath(runId, "contradicteur", "main"));
  const fac = readJson<FacilitateurOut>(okPath(runId, "facilitateur", "main"));
  const tra = exists(okPath(runId, "traducteur", "main")) ? readJson<TraducteurOut>(okPath(runId, "traducteur", "main")) : null;
  const skels = readJson<PersonaSkeleton[]>(path.join(dir, "panel.json"));
  const personas = new Map(skels.map((s) => [s.id, readJson<PersonaOut>(okPath(runId, "personas", s.id))]));
  const skel = new Map(skels.map((s) => [s.id, s]));
  const journal = fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const rejets = journal.filter((j) => j.event === "admin_reject").length;
  const rejetsGardien = journal.filter((j) => j.event === "gardien_reject").length;
  const reco = soc.angle_recommande.angle_id;
  const sources: { label: string; url: string }[] = c.sources ?? [];
  const membres = c.cible.type === "commune" ? "habitants" : "membres";

  const cartes = m.angles
    .map((a: any, i: number) => {
      const mt = a.metrics;
      const fa = f.angles.find((x) => x.id === a.angle_id)!;
      return `<article class="angle ${a.angle_id === reco ? "reco" : ""}">
  <div class="angle-head"><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span><span class="eyebrow">Formulation ${a.angle_id} · ${fa.origine === "decideur" ? "la vôtre" : "proposée par RegenVox"}</span>${a.angle_id === reco ? '<span class="pill">Recommandée</span>' : ""}</div>
  <p class="q">${esc(fa.formulation)}</p>
  <dl class="kpis">
    <div><dt>Accueil initial</dt><dd>${mt.resonance.toFixed(1).replace(".", ",")}<small>/10</small></dd><span class="ci">${pct(mt.repartition_initiale.porteur + mt.repartition_initiale.interesse)} favorables, ${pct(mt.repartition_initiale.reticent + mt.repartition_initiale.opposant)} réticents ou opposés</span></div>
    <div><dt>Soutien à ${c.horizon_mois} mois</dt><dd>${pct(mt.soutien.moyenne)}</dd><span class="ci">variabilité du modèle ${pct(mt.soutien.p05)} à ${pct(mt.soutien.p95)}</span></div>
    <div><dt>Prêts à agir</dt><dd>${pct(mt.coporteurs, 1)}</dd><span class="ci">soutiennent et viendraient agir</span></div>
    <div><dt>Opposition active</dt><dd>${pct(mt.resistance.moyenne)}</dd></div>
  </dl>
</article>`;
    })
    .join("");

  const meilleur = m.angles.reduce((a: any, b: any) => (b.metrics.soutien.moyenne > a.metrics.soutien.moyenne ? b : a));
  const temoin = (t: any, titre: string) =>
    t
      ? `<article class="angle" style="border-style:dashed"><div class="angle-head"><span class="dot" style="background:var(--soft)"></span><span class="eyebrow">${titre}</span></div>
  <p class="q">${esc(t.formulation)}</p><p class="small">${esc(t.pourquoi)}</p>
  <dl class="kpis"><div><dt>Soutien à ${c.horizon_mois} mois</dt><dd>${pct(t.metrics.soutien.moyenne)}</dd><span class="ci">contre ${pct(meilleur.metrics.soutien.moyenne)} pour la meilleure formulation ouverte</span></div><div><dt>Opposition active</dt><dd>${pct(t.metrics.resistance.moyenne)}</dd></div></dl></article>`
      : "";
  const temoins = temoin(m.controle, "Témoin 1 · décision imposée") + temoin(m.controle_objectif, "Témoin 2 · même objectif, question ouverte");

  const segments = soc.segments
    .map((s) => {
      const src = skel.get(s.persona_source);
      return `<article class="seg"><div class="eyebrow">${esc(s.nom)} · ${s.persona_ids.length} ${membres} · ${esc(s.position_dominante)}</div>
<blockquote>« ${esc(s.objection_citee)} »<cite>${esc(s.persona_source)}${src ? `, ${src.age} ans, ${esc(src.activite)}` : ""}</cite></blockquote>
<p><b>Levier</b> : ${esc(s.levier)}</p></article>`;
    })
    .join("");
  const freins = soc.freins_participation.map((x) => `<li><b>${esc(x.frein)}</b> (${x.persona_ids.length} ${membres}) : ${esc(x.levier)}</li>`).join("");

  const mob = m.mobilisation;
  const lignesMob = mob
    ? mob.angles
        .map((a: any) => `<tr><td>Formulation ${a.angle_id}${a.angle_id === reco ? " <b>(recommandée)</b>" : ""}</td>${FMT.map(([k]) => {
          const x = a.formats[k];
          return `<td class="n"><b>${pct(x.part, 1)}</b><br><small>${pct(x.ic90[0], 1)} à ${pct(x.ic90[1], 1)}</small><br>au plus ≈ ${x.habitants}</td>`;
        }).join("")}</tr>`)
        .join("")
    : "";
  const mobReco = mob?.angles.find((a: any) => a.angle_id === reco);
  const sectionMob = mob
    ? `<div class="panel"><h3 style="margin-top:0">Participation déclarée, par format</h3>
<p class="small">Chaque ${membres === "habitants" ? "habitant" : "membre"} simulé a estimé sa probabilité de participer réellement à chaque format. Ces chiffres sont des plafonds : lors de nos tests à l'aveugle, les panels ont surestimé la participation réelle d'un facteur 2 à 8. Servez-vous en pour comparer les formats et les formulations entre eux, pas comme une prévision de fréquentation.</p>
<div class="tbl"><table><thead><tr><th>Formulation</th>${FMT.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${lignesMob}</tbody></table></div>
${mobReco?.effet_invitation ? `<p class="verdict">Une invitation personnelle par un proche multiplie la venue à l'atelier par ${String(mobReco.effet_invitation).replace(".", ",")} sur la formulation recommandée.</p>` : ""}</div>`
    : "";

  const voix = soc.ambassadeurs_potentiels
    .slice(0, 4)
    .map((a) => {
      const p = personas.get(a.persona_id);
      const sk = skel.get(a.persona_id);
      const r = p?.reactions.find((x) => x.angle_id === reco);
      return p && sk && r ? `<figure class="voice"><blockquote>« ${esc(r.citation)} »</blockquote><figcaption>${esc(a.persona_id)}, ${sk.age} ans, ${esc(sk.activite)} · ${esc(a.pourquoi)}</figcaption></figure>` : "";
    })
    .join("");
  const attaques = con.attaques.map((x) => `<li><span class="eyebrow">${esc(x.posture)}</span><p>${esc(x.critique)}</p></li>`).join("");
  const lectures = fac.angles.map((a) => `<li><b>Formulation ${a.angle_id}</b> : ${esc(a.lecture)}</li>`).join("");
  const sectionsTra = tra ? tra.sections.map((x) => `<h3>${esc(x.titre)}</h3><p>${esc(x.contenu).replace(/\n+/g, "</p><p>")}</p>`).join("") : "";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RegenVox : ${esc(meta.organisation)}</title>
${STYLE}
<style>@media print{.angle,.seg,.panel{break-inside:avoid}body{background:#fff}}@media (max-width:400px){.grid2{grid-template-columns:minmax(0,1fr)}}</style></head><body>
<div class="wrap">
<header style="display:flex;flex-direction:column;gap:14px">
  <div class="eyebrow">RegenVox · test de démarche du ${esc(meta.date)}</div>
  <h1>${esc(meta.organisation)}</h1>
  <p class="small">${esc(c.cible.description)}</p>
  <p class="lede"><b>Enjeu</b> : ${esc(c.enjeu)}<br><b>Objectif</b> : ${esc(c.objectif)}</p>
  <div class="badges"><span class="badge">Panel de ${skels.length} ${membres} simulés</span><span class="badge">${m.angles.length} formulations comparées</span><span class="badge">Résultats conservés chez vous, jamais chez Régénère Plus</span></div>
</header>
${tra ? `<section><h2>En bref</h2><p class="lede" style="color:var(--ink)">${esc(tra.synthese)}</p></section>` : ""}
<section><h2>Les formulations testées</h2><p class="small">Une bonne formulation nomme l'enjeu et l'objectif, sans imposer les chemins : ceux-ci restent ouverts aux ${membres}.</p><div class="grid2">${cartes}</div>${temoins ? `<div class="grid2" style="margin-top:16px">${temoins}</div>` : ""}</section>
<section class="panel chart"><h2>Propagation simulée sur ${c.horizon_mois} mois</h2>${chart(m.angles, c.horizon_mois)}<p class="legend">Trait plein : part de soutien. Pointillé : opposition active. Moyenne de nombreuses simulations sur un réseau de relations entre ${membres}.</p><ul>${lectures}</ul></section>
<section><h2>Groupes, objections et leviers</h2><p class="small">Chaque citation est contrôlée mot pour mot dans les réponses du panel.</p><div class="grid2">${segments}</div></section>
<section><h2>Faire participer</h2>${sectionMob}<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">Freins et leviers de participation</h3><ul>${freins}</ul>${voix ? `<h3>Relais possibles</h3><div class="grid2">${voix}</div>` : ""}</div></section>
<section><h2>Ce qu'une critique contradictoire objecte</h2><ul class="att">${attaques}</ul><h3>Réserves à garder en tête</h3><ul>${con.notes_pour_rapport.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>
${sectionsTra ? `<section class="panel"><h2>Rapport détaillé</h2>${sectionsTra}</section>` : ""}
<section class="panel method"><h2>Méthode et hypothèses</h2>
<p>Chaque ${membres === "habitants" ? "habitant" : "membre"} simulé est un appel isolé au modèle d'IA, avec un profil tiré des statistiques publiques. Des contrôles automatiques vérifient chaque réponse (format, citations exactes, chiffres présents dans les données) : ${rejets} réponse(s) refusée(s) puis corrigée(s), ${rejetsGardien} reprise(s) demandée(s) par le contrôle de méthode.</p>
<p>Une simulation ne dit pas ce que pense une personne réelle : elle aide à préparer une démarche, elle ne la remplace pas.</p>
<h3>Hypothèses déclarées</h3><ul>${m.hypotheses.map((h: string) => `<li>${esc(h)}</li>`).join("")}</ul>
${sources.length ? `<h3>Sources</h3><ul>${sources.map((x) => `<li><a href="${esc(x.url)}">${esc(x.label)}</a></li>`).join("")}</ul>` : ""}
</section>
<footer class="foot">RegenVox, outil open source de Régénère Plus (https://regenvox.xyz, code : https://github.com/NeousAxis/regenvox). Ce rapport a été produit dans votre navigateur avec votre propre clé ; il n'a été transmis ni à Régénère Plus ni à personne d'autre que votre fournisseur d'IA.</footer>
</div></body></html>`;
}
