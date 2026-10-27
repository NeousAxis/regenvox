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
  return { formats, par_formulation, fiabilite: CALIBRATION.demarches, fiabilite_petitions: CALIBRATION.petitions };
}
