// Maquette du moteur, pour vérifier l'interface sans clé ni appel réseau.
// Active uniquement en développement avec VITE_MAQUETTE=1 (voir index.ts).
//
// Pour simuler les cas difficiles :
//   clé contenant « refusee » : la vérification échoue ;
//   clé contenant « panne » : le test s'arrête sur une erreur à la première étape ;
//   formulation contenant « #erreur » : le test s'arrête sur une erreur à la quatrième étape.
import type { CleApi, Etape, Moteur, ParametresTest, Projet } from "./index";

const DUREE_ETAPE_MS = 1200;

const ETAPES: { cle: string; fr: string; en: string }[] = [
  { cle: "panel", fr: "Construction du panel d'habitants simulés", en: "Building the panel of simulated residents" },
  { cle: "formulations", fr: "Préparation des formulations à comparer", en: "Preparing the wordings to compare" },
  { cle: "reactions", fr: "Réactions du panel à chaque formulation", en: "Panel reactions to each wording" },
  { cle: "participation", fr: "Participation estimée par format", en: "Estimated participation by format" },
  { cle: "temoins", fr: "Formulations témoins", en: "Control wordings" },
  { cle: "propagation", fr: "Propagation de l'idée au fil des mois", en: "Spread of the idea over the months" },
  { cle: "objections", fr: "Objections, freins et leviers", en: "Objections, obstacles and levers" },
  { cle: "relecture", fr: "Relecture critique", en: "Critical review" },
  { cle: "rapport", fr: "Rédaction du rapport", en: "Writing the report" },
];

function cloner<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function attendre(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Interrompu", "AbortError"));
      return;
    }
    const minuteur = setTimeout(() => {
      signal?.removeEventListener("abort", surAbandon);
      resolve();
    }, ms);
    function surAbandon() {
      clearTimeout(minuteur);
      reject(new DOMException("Interrompu", "AbortError"));
    }
    signal?.addEventListener("abort", surAbandon, { once: true });
  });
}

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function decrirePopulation(p: ParametresTest): string {
  const fr = p.langue === "fr";
  if (p.territoire) {
    const t = p.territoire;
    if (t.niveau === "suisse") return fr ? "Suisse entière" : "Switzerland as a whole";
    if (t.niveau === "canton") return (fr ? "Canton : " : "Canton: ") + (t.canton ?? "");
    return (fr ? "Commune n° OFS " : "Municipality, FSO no. ") + String(t.commune_num ?? "");
  }
  return (p.groupes ?? [])
    .map((g) => `${g.nom} (${g.effectif}, ${g.age_min} ${fr ? "à" : "to"} ${g.age_max} ${fr ? "ans" : "years"})`)
    .join(", ");
}

function rapportExemple(p: Projet): string {
  const fr = p.parametres.langue === "fr";
  const d = p.parametres.demarche;
  const ligne = (titre: string, valeur: string) => `<tr><th>${echapper(titre)}</th><td>${echapper(valeur)}</td></tr>`;
  return `<!DOCTYPE html>
<html lang="${fr ? "fr" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fr ? "Rapport d'exemple" : "Sample report"}</title>
<style>
body { font-family: Georgia, serif; color: #1A2332; max-width: 46rem; margin: 0 auto; padding: 2rem 1rem; line-height: 1.6; }
h1 { font-size: 1.8rem; margin: 0 0 0.5rem; }
h2 { font-size: 1.25rem; margin-top: 2rem; color: #2A6D8A; }
.avertissement { background: #FBEFEA; border: 1px solid #E2BAA7; border-radius: 10px; padding: 1rem; font-family: system-ui, sans-serif; }
table { border-collapse: collapse; width: 100%; font-family: system-ui, sans-serif; font-size: 0.95rem; }
th, td { text-align: left; vertical-align: top; padding: 0.5rem; border-bottom: 1px solid #E0E7EB; }
th { width: 35%; }
</style>
</head>
<body>
<h1>${fr ? "Rapport d'exemple\u00a0:" : "Sample report:"} ${echapper(p.parametres.organisation.nom)}</h1>
<p class="avertissement">${fr
    ? "Ce document est produit par la maquette de l'interface. Il ne contient aucun résultat\u00a0: il sert seulement à vérifier l'affichage, l'impression et l'enregistrement."
    : "This document is produced by the interface mock-up. It contains no results: it only serves to check display, printing and saving."}</p>
<h2>${fr ? "Votre démarche" : "Your process"}</h2>
<table>
${ligne(fr ? "Population" : "Population", decrirePopulation(p.parametres))}
${ligne(fr ? "Enjeu" : "Issue", d.enjeu)}
${ligne(fr ? "Objectif" : "Goal", d.objectif)}
${ligne(fr ? "Votre formulation" : "Your wording", d.formulation)}
${ligne(fr ? "Formats envisagés" : "Planned formats", d.formats.join(", "))}
${ligne(fr ? "Horizon" : "Time horizon", `${d.horizon_mois} ${fr ? "mois" : "months"}`)}
</table>
<h2>${fr ? "Ce que contiendra le vrai rapport" : "What the real report will contain"}</h2>
<p>${fr
    ? "Les formulations comparées, la participation estimée par format, les objections du panel citées mot pour mot, la relecture critique, la méthode et les sources."
    : "The compared wordings, estimated participation by format, the panel's objections quoted word for word, the critical review, the method and the sources."}</p>
</body>
</html>`;
}

function marquer(p: Projet, i: number, etat: Etape["etat"]): Projet {
  return { ...p, etapes: p.etapes.map((e, j) => (j === i ? { ...e, etat } : e)) };
}

export const moteurMaquette: Moteur = {
  creer(parametres: ParametresTest): Projet {
    const fr = parametres.langue === "fr";
    return {
      version: 1,
      id: crypto.randomUUID(),
      cree_le: new Date().toISOString(),
      parametres: cloner(parametres),
      etat: "en_cours",
      etapes: ETAPES.map((e) => ({ cle: e.cle, libelle: fr ? e.fr : e.en, etat: "a_faire" as const })),
      fichiers: {},
      usage: { tokens_entree: 0, tokens_sortie: 0 },
    };
  },

  async executer(projet: Projet, cle: CleApi, suivi: (p: Projet) => void, signal?: AbortSignal): Promise<Projet> {
    const fr = projet.parametres.langue === "fr";
    let p: Projet = { ...cloner(projet), etat: "en_cours", erreur: undefined };
    // Une étape restée « en cours » ou « en erreur » reprend depuis le début.
    p.etapes = p.etapes.map((e) => (e.etat === "fait" ? e : { ...e, etat: "a_faire" }));
    suivi(p);

    for (let i = 0; i < p.etapes.length; i++) {
      if (p.etapes[i].etat === "fait") continue;
      p = marquer(p, i, "en_cours");
      suivi(p);
      try {
        await attendre(DUREE_ETAPE_MS, signal);
      } catch {
        p = { ...marquer(p, i, "a_faire"), etat: "interrompu" };
        suivi(p);
        return p;
      }
      const panne = (cle.cle.includes("panne") && i === 0) || (p.parametres.demarche.formulation.includes("#erreur") && i === 3);
      if (panne) {
        p = {
          ...marquer(p, i, "erreur"),
          etat: "erreur",
          erreur: fr ? "Erreur simulée par la maquette (le fournisseur n'a pas répondu)." : "Error simulated by the mock-up (the provider did not answer).",
        };
        suivi(p);
        return p;
      }
      p = marquer(p, i, "fait");
      p.fichiers = { ...p.fichiers, [p.etapes[i].cle]: `maquette ${new Date().toISOString()}` };
      p.usage = {
        tokens_entree: (p.usage?.tokens_entree ?? 0) + 12000,
        tokens_sortie: (p.usage?.tokens_sortie ?? 0) + 3000,
      };
      suivi(p);
    }

    p = { ...p, etat: "termine", rapport_html: rapportExemple(p) };
    suivi(p);
    return p;
  },

  async verifierCle(cle: CleApi) {
    await attendre(600);
    if (cle.cle.trim().length < 8 || cle.cle.includes("refusee")) {
      return { ok: false, message: "clé refusée par la maquette" };
    }
    return { ok: true };
  },
};
