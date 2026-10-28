// Nombre de participants attendu, par format : le niveau vient de l'estimation directe (étape niveau),
// les écarts entre formulations viennent du panel. Fourchette et fiabilité tirées des tests à l'aveugle publiés.
import path from "node:path";
import { runDir, readJson, okPath, exists } from "./store.js";
import type { NiveauOut } from "./schemas.js";
import { CALIBRATION } from "./calibration.js";

export interface EstimationParticipants {
  formats: { format: string; participants: number; bas: number; haut: number; raisonnement: string }[];
  par_formulation: { angle_id: number; formats: Record<string, number | null> }[];
  fiabilite: typeof CALIBRATION.demarches;
  fiabilite_petitions: typeof CALIBRATION.petitions;
  fiabilite_en_clair: string;
}

const nf = (x: number) => x.toLocaleString("fr-CH");
const surDix = (k: number, n: number) => (k * 2 === n ? "une fois sur deux" : `environ ${Math.round((k / n) * 10)} fois sur 10`);

// La fiabilité dite en mots simples, pour le rapport et pour le Traducteur, qui la reprend telle quelle.
export function fiabiliteEnClair(d = CALIBRATION.demarches, p = CALIBRATION.petitions): string {
  const sous = d.n - d.surestimations;
  const sens =
    Math.abs(d.surestimations - sous) <= d.n / 4
      ? `à peu près aussi souvent en trop (${d.surestimations} fois) qu'en moins (${sous} fois)`
      : d.surestimations > sous
        ? `plus souvent en trop (${d.surestimations} fois) qu'en moins (${sous} fois)`
        : `plus souvent en moins (${sous} fois) qu'en trop (${d.surestimations} fois)`;
  return [
    `Ce chiffre est-il fiable ? Nous avons testé cette estimation sur ${d.n} vraies démarches participatives déjà terminées (Lausanne, Genève, Medellín), sans lui montrer le résultat.`,
    `Dans ${d.dans_un_facteur_2} cas sur ${d.n}, soit ${surDix(d.dans_un_facteur_2, d.n)}, le vrai nombre de participants était dans la fourchette affichée, c'est-à-dire entre la moitié et le double du chiffre annoncé (pour 100 annoncés, entre 50 et 200).`,
    `Les autres fois, l'écart a été plus grand. Le pire cas : ${nf(d.pire_cas.estime)} participants annoncés, ${nf(d.pire_cas.reel)} venus.`,
    `L'estimation se trompe ${sens}.`,
    `Pour une pétition ou une collecte de signatures, elle est moins sûre : le vrai chiffre n'était dans la fourchette que dans ${p.dans_un_facteur_2} cas sur ${p.n}, soit ${surDix(p.dans_un_facteur_2, p.n)}.`,
  ].join(" ");
}

export function estimationParticipants(runId: string): EstimationParticipants | null {
  if (!exists(okPath(runId, "niveau", "main"))) return null;
  const niv = readJson<NiveauOut>(okPath(runId, "niveau", "main"));
  const mob = readJson<any>(path.join(runDir(runId), "metrics.json")).mobilisation;
  const formats = niv.formats.map((x) => ({ format: x.format, participants: x.participants, bas: Math.round(x.participants / 2), haut: x.participants * 2, raisonnement: x.raisonnement }));
  // L'estimation porte sur la formulation du décideur (angle 1) ; pour les autres, on applique l'écart mesuré par le panel.
  const ref = mob?.angles?.find((a: any) => a.angle_id === 1) ?? mob?.angles?.[0];
  const par_formulation = (mob?.angles ?? []).map((a: any) => ({
    angle_id: a.angle_id,
    formats: Object.fromEntries(formats.map((f) => {
      const p0 = ref?.formats?.[f.format]?.part;
      const p = a.formats?.[f.format]?.part;
      return [f.format, p0 > 0 && p != null ? Math.round((f.participants * p) / p0) : null];
    })),
  }));
  return { formats, par_formulation, fiabilite: CALIBRATION.demarches, fiabilite_petitions: CALIBRATION.petitions, fiabilite_en_clair: fiabiliteEnClair() };
}
