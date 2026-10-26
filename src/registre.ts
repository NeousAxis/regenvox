// Registre des prévisions : publiées avant l'événement, jamais modifiées, comparées ensuite aux résultats officiels.
// Usage : npx tsx src/registre.ts verifier | bilan
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { ROOT } from "./store.js";

const DIR = path.join(ROOT, "predictions");
const DIR_RES = path.join(DIR, "resultats");
const DEPOT = "NeousAxis/resonance";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Prevision = z.object({
  id: z.string().min(5),
  publie_le: date,
  remplace: z.string().optional(),
  evenement: z.object({ type: z.enum(["votation_federale", "votation_communale", "participation"]), date, description: z.string().min(5) }),
  methode: z.object({ moteur: z.string(), runs: z.array(z.string()).min(1), correction: z.string().optional() }),
  criteres_reussite: z.array(z.string().min(10)).min(1),
  previsions: z
    .array(z.object({ commune: z.string(), objet: z.string(), titre: z.string(), oui_pct: z.number().min(0).max(100), oui_brut_pct: z.number().min(0).max(100).optional(), participation_reference_pct: z.number().min(0).max(100).optional(), intervalle_pct: z.tuple([z.number(), z.number()]).optional(), participation_pct: z.number().min(0).max(100).optional() }))
    .min(1),
});
export const Resultat = z.object({
  id: z.string(),
  renseigne_le: date,
  source: z.string().min(5),
  resultats: z.array(z.object({ commune: z.string(), objet: z.string(), oui_pct: z.number(), participation_pct: z.number().optional(), canton_oui_pct: z.number().optional() })).min(1),
});
type Prevision = z.infer<typeof Prevision>;
type Resultat = z.infer<typeof Resultat>;

const git = (...args: string[]) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const fichiers = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []);

// Date à laquelle GitHub a reçu le premier push contenant le commit (horodatage serveur, non falsifiable localement).
export function datePush(sha: string): string | null {
  try {
    const lignes = execFileSync("gh", ["api", `repos/${DEPOT}/activity?per_page=100&direction=asc`, "--jq", ".[] | \"\\(.timestamp) \\(.after)\""], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    for (const l of lignes.sort()) {
      const [quand, apres] = l.split(" ");
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", sha, apres], { cwd: ROOT, stdio: "ignore" });
        return quand;
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

export function verifier(): string[] {
  const problemes: string[] = [];
  for (const f of fichiers(DIR)) {
    const chemin = path.join(DIR, f);
    const relatif = path.relative(ROOT, chemin);
    const p = Prevision.safeParse(JSON.parse(fs.readFileSync(chemin, "utf8")));
    if (!p.success) {
      problemes.push(`${f} : format invalide (${p.error.issues.map((i) => i.path.join(".") + " " + i.message).join(" ; ")})`);
      continue;
    }
    const v = p.data;
    if (`${v.id}.json` !== f) problemes.push(`${f} : l'identifiant ${v.id} ne correspond pas au nom du fichier.`);
    if (v.publie_le >= v.evenement.date) problemes.push(`${f} : publiée le ${v.publie_le}, pas avant l'événement du ${v.evenement.date}.`);
    const commits = git("log", "--all", "--format=%H %cI", "--", relatif).split("\n").filter(Boolean);
    if (commits.length === 0) {
      problemes.push(`${f} : jamais commitée, sa date de publication n'est pas prouvée.`);
      continue;
    }
    if (commits.length > 1) problemes.push(`${f} : modifiée après sa publication (${commits.length} commits) ; une prévision ne se modifie pas.`);
    const [premier, dateCommit] = commits[commits.length - 1].split(" ");
    if (dateCommit.slice(0, 10) >= v.evenement.date) problemes.push(`${f} : premier commit le ${dateCommit.slice(0, 10)}, pas avant l'événement.`);
    const push = datePush(premier);
    if (!push) problemes.push(`${f} : date de push GitHub introuvable pour ${premier.slice(0, 7)} (commit non poussé, ou historique d'activité indisponible).`);
    else if (push.slice(0, 10) >= v.evenement.date) problemes.push(`${f} : poussée sur GitHub le ${push.slice(0, 10)}, pas avant l'événement.`);
    else console.log(`${f} : publiée le ${v.publie_le}, poussée sur GitHub le ${push.slice(0, 10)}, événement le ${v.evenement.date}.`);
  }
  return problemes;
}

export function bilan(): string {
  const lignes: string[] = ["# Bilan des prévisions Résonance", "", "Généré par `npx tsx src/registre.ts bilan`. Toutes les prévisions publiées figurent ici, réussies ou non.", ""];
  for (const f of fichiers(DIR)) {
    const v: Prevision = Prevision.parse(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
    lignes.push(`## ${v.evenement.description} (${v.evenement.date})`, "", `Publiée le ${v.publie_le}. Critères fixés d'avance : ${v.criteres_reussite.join(" ; ")}`, "");
    const fr = path.join(DIR_RES, f);
    if (!fs.existsSync(fr)) {
      lignes.push("Résultats officiels pas encore disponibles.", "");
      continue;
    }
    const r: Resultat = Resultat.parse(JSON.parse(fs.readFileSync(fr, "utf8")));
    lignes.push("| Commune | Objet | Oui prévu | Oui réel | Écart | Écart du panel brut | Écart du résultat cantonal |", "|---|---|---|---|---|---|---|");
    const ecarts: number[] = [], ecartsCanton: number[] = [], ecartsBruts: number[] = [];
    let sens = 0, n = 0;
    for (const p of v.previsions) {
      const reel = r.resultats.find((x) => x.commune === p.commune && x.objet === p.objet);
      if (!reel) continue;
      const e = Math.abs(p.oui_pct - reel.oui_pct);
      const ec = reel.canton_oui_pct == null ? null : Math.abs(reel.canton_oui_pct - reel.oui_pct);
      const eb = p.oui_brut_pct == null ? null : Math.abs(p.oui_brut_pct - reel.oui_pct);
      ecarts.push(e);
      if (ec != null) ecartsCanton.push(ec);
      if (eb != null) ecartsBruts.push(eb);
      n++;
      if (p.oui_pct >= 50 === reel.oui_pct >= 50) sens++;
      const f1 = (x: number | null) => (x == null ? "n.d." : x.toFixed(1).replace(".", ","));
      lignes.push(`| ${p.commune} | ${p.titre} | ${f1(p.oui_pct)} % | ${f1(reel.oui_pct)} % | ${f1(e)} | ${f1(eb)} | ${f1(ec)} |`);
    }
    const moy = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1).replace(".", ",") : "n.d.");
    lignes.push("", `Écart moyen : ${moy(ecarts)} points (panel brut : ${moy(ecartsBruts)}), contre ${moy(ecartsCanton)} pour le résultat cantonal. Bon camp : ${sens} sur ${n}. Source : ${r.source}.`, "");
  }
  return lignes.join("\n");
}

if (path.basename(process.argv[1] ?? "") === "registre.ts") {
  const cmd = process.argv[2];
  if (cmd === "verifier") {
    const p = verifier();
    p.forEach((x) => console.log("PROBLÈME " + x));
    console.log(p.length ? `${p.length} problème(s).` : "Registre conforme.");
    process.exit(p.length ? 1 : 0);
  } else if (cmd === "bilan") {
    fs.writeFileSync(path.join(DIR, "BILAN.md"), bilan(), "utf8");
    console.log("Bilan écrit : predictions/BILAN.md");
  } else console.log("Usage : npx tsx src/registre.ts verifier | bilan");
}
