// Administrateur du cadre : contrôles déterministes (aucun LLM). Une sortie qui échoue est renvoyée à l'agent avec la liste des erreurs.
import type { FormulateurOut, GardienOut, PersonaOut, FacilitateurOut, SociologueOut, ContradicteurOut, TraducteurOut, PersonaSkeleton, MobilisationOut } from "./schemas.js";

export interface AdminContext {
  angleFourni?: string;
  angleIds?: number[];
  voteIds?: string[];
  skeleton?: PersonaSkeleton;
  personas?: PersonaOut[];
  horizon?: number;
  allowedNumbers?: number[];
}

// Frontières de mots compatibles avec les accents (\b de JavaScript ignore é, è, à...).
const MOYENS_INTERDITS = /(?<!\p{L})(obligation\p{L}*|obligatoire\p{L}*|oblig[eé]\p{L}*|interdi\p{L}*|subvention\p{L}*|label\p{L}*|r[eéè]glement\p{L}*|taxe\p{L}*|imposer|impos[eé]\p{L}*|sanction\p{L}*)(?!\p{L})/iu;
const NOM_PROPRE_PERSONNE = /(?<!\p{L})(Monsieur|Madame|Mme|M\.)\s+\p{Lu}\p{Ll}+/u;
const TIRET_SEPARATEUR = /\s[—–]\s|\s-\s/;
const REFERENCE_NOMMEE = /(?<!\p{L})(étude|rapport|enquête|sondage)\s+(?:de |du |d'|des |de l')?\p{Lu}[\p{L}-]+.*?(?<!\d)(?:19|20)\d{2}(?!\d)/u;

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[«»"“”'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function checkFormulateur(o: FormulateurOut, ctx: AdminContext): string[] {
  const e: string[] = [];
  const ids = o.angles.map((a) => a.id);
  if (new Set(ids).size !== ids.length) e.push("Identifiants d'angles dupliqués.");
  ids.forEach((id, i) => id !== i + 1 && e.push(`Les angles doivent être numérotés 1..n dans l'ordre (trouvé ${id} en position ${i + 1}).`));
  if (o.angles.length < 3 || o.angles.length > 4) e.push(`Il faut 3 ou 4 angles (trouvé ${o.angles.length}).`);
  if (ctx.angleFourni) {
    const a1 = o.angles[0];
    if (a1.origine !== "decideur") e.push("L'angle 1 doit être l'angle fourni par le décideur (origine \"decideur\").");
    const same = norm(a1.formulation) === norm(ctx.angleFourni);
    if (!same && a1.risque_de_verrouillage.length < 40)
      e.push("L'angle du décideur a été modifié sans justification suffisante dans risque_de_verrouillage.");
  }
  o.angles.forEach((a) => {
    const m = a.formulation.match(MOYENS_INTERDITS);
    if (m && !(a.origine === "decideur" && ctx.angleFourni && norm(a.formulation) === norm(ctx.angleFourni)))
      e.push(`Angle ${a.id} : la formulation nomme un moyen (« ${m[0]} »), donc un chemin. Un angle nomme l'enjeu et/ou l'objectif, jamais les chemins.`);
    if (!a.formulation.trim().endsWith("?")) e.push(`Angle ${a.id} : un angle doit être une question ouverte (terminée par « ? »).`);
    if (NOM_PROPRE_PERSONNE.test(JSON.stringify(a))) e.push(`Angle ${a.id} : nom de personne détecté.`);
  });
  return e;
}

export function checkGardien(o: GardienOut): string[] {
  const e: string[] = [];
  o.verdicts.forEach((v) => {
    if (!v.aligne && v.principes_violes.length === 0) e.push(`Verdict « ${v.cible} » : non aligné mais aucun principe cité.`);
    if (v.aligne && v.principes_violes.length > 0) e.push(`Verdict « ${v.cible} » : aligné mais principes violés cités, incohérent.`);
  });
  if (o.decision === "reject" && o.verdicts.every((v) => v.aligne)) e.push("Décision reject alors que tous les verdicts sont alignés.");
  if (o.decision === "reject" && o.corrections_demandees.length === 0) e.push("Un reject doit lister les corrections demandées.");
  return e;
}

export function checkPersona(o: PersonaOut, ctx: AdminContext): string[] {
  const e: string[] = [];
  const sk = ctx.skeleton!;
  if (o.id !== sk.id) e.push(`Identifiant ${o.id} différent du profil ${sk.id}.`);
  const got = o.reactions.map((r) => r.angle_id).sort();
  const want = [...(ctx.angleIds ?? [])].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) e.push(`Réactions attendues pour les angles ${want.join(", ")}, reçues pour ${got.join(", ")}.`);
  const cits = o.reactions.map((r) => norm(r.citation));
  if (cits.length > 1 && new Set(cits).size === 1) e.push("Toutes les citations sont identiques : chaque angle doit recevoir une réaction propre.");
  if (sk.electeur) {
    const vg = o.votes.map((v) => v.vote_id).sort();
    const vw = [...(ctx.voteIds ?? [])].sort();
    if (JSON.stringify(vg) !== JSON.stringify(vw))
      e.push(`Électeur : il faut une réponse pour chacune de ces votations : ${vw.join(", ")} (reçu : ${vg.join(", ") || "aucune"}). Pour une votation où tu n'avais pas encore l'âge de voter, réponds avec participe_proba 0.`);
  } else if (o.votes.length > 0) e.push("Ce profil n'est pas électeur fédéral : la liste votes doit être vide.");
  if (NOM_PROPRE_PERSONNE.test(JSON.stringify(o))) e.push("Nom de personne détecté (interdit, le cercle d'influence doit rester typologique).");
  const ageMatch = o.portrait.match(/(\d{2})\s*ans/);
  if (ageMatch && Math.abs(parseInt(ageMatch[1], 10) - sk.age) > 1) e.push(`Le portrait indique ${ageMatch[1]} ans alors que le profil a ${sk.age} ans : reste fidèle au profil.`);
  if (sk.nationalite === "etrangere" && /\bje suis suisse\b/i.test(o.portrait)) e.push("Le portrait se dit suisse alors que le profil est de nationalité étrangère.");
  return e;
}

export function checkScrutin(o: { id: string; votes: { vote_id: string }[] }, ctx: AdminContext): string[] {
  const e: string[] = [];
  if (o.id !== ctx.skeleton!.id) e.push(`Identifiant ${o.id} différent du profil ${ctx.skeleton!.id}.`);
  const vg = o.votes.map((v) => v.vote_id).sort();
  const vw = [...(ctx.voteIds ?? [])].sort();
  if (JSON.stringify(vg) !== JSON.stringify(vw)) e.push(`Il faut une réponse et une seule pour chacune de ces votations : ${vw.join(", ")} (reçu : ${vg.join(", ") || "aucune"}).`);
  return e;
}

// Cohérence entre les probabilités de mobilisation et l'engagement déclaré par le même persona à l'étape précédente.
export function checkMobilisation(o: MobilisationOut, ctx: AdminContext & { persona?: PersonaOut }): string[] {
  const e: string[] = [];
  const sk = ctx.skeleton!;
  const p = ctx.persona!;
  if (o.id !== sk.id) e.push(`Identifiant ${o.id} différent du profil ${sk.id}.`);
  const got = o.angles.map((a) => a.angle_id).sort();
  const want = [...(ctx.angleIds ?? [])].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) e.push(`Probabilités attendues pour les angles ${want.join(", ")}, reçues pour ${got.join(", ")}.`);
  o.angles.forEach((a) => {
    const r = p.reactions.find((x) => x.angle_id === a.angle_id);
    if (!r) return;
    // Seuils volontairement bas : l'écart entre intention déclarée et probabilité réelle est ce qu'on cherche à mesurer,
    // une exigence de cohérence plus stricte pousserait les personas à surestimer leur venue.
    if (r.engagement >= 2 && a.avis_en_ligne < 0.05)
      e.push(`Angle ${a.angle_id} : tu avais dit que tu donnerais ton avis en ligne (engagement ${r.engagement}), mais ta probabilité d'avis en ligne est ${a.avis_en_ligne}. Mets-les en cohérence.`);
    if (r.engagement >= 3 && a.atelier_presentiel < 0.05)
      e.push(`Angle ${a.angle_id} : tu avais dit que tu viendrais à un atelier, mais ta probabilité d'atelier est ${a.atelier_presentiel}. Mets-les en cohérence.`);
    if (r.engagement === 0 && (a.atelier_presentiel > 0.3 || a.avis_en_ligne > 0.5))
      e.push(`Angle ${a.angle_id} : tu avais dit que tu ignorerais la démarche (engagement 0), tes probabilités de participation sont trop élevées pour ce que tu as dit.`);
    if (a.atelier_si_invite_par_un_proche + 0.1 < a.atelier_presentiel)
      e.push(`Angle ${a.angle_id} : être invité et accompagné par un proche réduit fortement ta probabilité de venir ; si c'est voulu, explique-le dans ce_qui_doublerait_ma_venue, sinon corrige.`);
  });
  const tuples = o.angles.map((a) => [a.avis_en_ligne, a.atelier_presentiel, a.parcours_distance].join("/"));
  const positions = new Set(p.reactions.map((r) => r.position));
  if (o.angles.length > 1 && new Set(tuples).size === 1 && positions.size > 1)
    e.push("Probabilités identiques pour tous les angles alors que tes réactions aux angles diffèrent : estime chaque angle séparément.");
  if (NOM_PROPRE_PERSONNE.test(JSON.stringify(o))) e.push("Nom de personne détecté.");
  return e;
}

// Dernier recours, après trois refus : on relève ou on abaisse les probabilités jusqu'aux seuils de checkMobilisation,
// sans rien inventer d'autre. Chaque correction est rendue publique dans les hypothèses du rapport.
export function corrigerMobilisation(o: MobilisationOut, persona: PersonaOut): { valeur: MobilisationOut; corrections: string[] } {
  const corrections: string[] = [];
  const angles = o.angles.map((a) => {
    const r = persona.reactions.find((x) => x.angle_id === a.angle_id);
    const b = { ...a };
    if (!r) return b;
    if (r.engagement >= 2 && b.avis_en_ligne < 0.05) {
      corrections.push(`angle ${a.angle_id} : avis en ligne ${b.avis_en_ligne} relevé à 0.05`);
      b.avis_en_ligne = 0.05;
    }
    if (r.engagement >= 3 && b.atelier_presentiel < 0.05) {
      corrections.push(`angle ${a.angle_id} : atelier ${b.atelier_presentiel} relevé à 0.05`);
      b.atelier_presentiel = 0.05;
    }
    if (r.engagement === 0 && b.atelier_presentiel > 0.3) {
      corrections.push(`angle ${a.angle_id} : atelier ${b.atelier_presentiel} abaissé à 0.3`);
      b.atelier_presentiel = 0.3;
    }
    if (r.engagement === 0 && b.avis_en_ligne > 0.5) {
      corrections.push(`angle ${a.angle_id} : avis en ligne ${b.avis_en_ligne} abaissé à 0.5`);
      b.avis_en_ligne = 0.5;
    }
    if (b.atelier_si_invite_par_un_proche + 0.1 < b.atelier_presentiel) {
      corrections.push(`angle ${a.angle_id} : atelier si invité ${b.atelier_si_invite_par_un_proche} relevé à ${b.atelier_presentiel}`);
      b.atelier_si_invite_par_un_proche = b.atelier_presentiel;
    }
    return b;
  });
  return { valeur: { ...o, angles }, corrections };
}

export function checkFacilitateur(o: FacilitateurOut, ctx: AdminContext): string[] {
  const e: string[] = [];
  const got = o.angles.map((a) => a.angle_id).sort();
  const want = [...(ctx.angleIds ?? [])].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) e.push(`Lecture attendue pour les angles ${want.join(", ")}.`);
  o.angles.forEach((a) => a.evenements.forEach((ev) => ev.mois > (ctx.horizon ?? 24) && e.push(`Angle ${a.angle_id} : événement au mois ${ev.mois} au-delà de l'horizon.`)));
  return e;
}

export function checkSociologue(o: SociologueOut, ctx: AdminContext): string[] {
  const e: string[] = [];
  const byId = new Map((ctx.personas ?? []).map((p) => [p.id, p]));
  if (!(ctx.angleIds ?? []).includes(o.angle_recommande.angle_id)) e.push(`Angle recommandé ${o.angle_recommande.angle_id} inexistant.`);
  o.segments.forEach((s) => {
    s.persona_ids.forEach((id) => !byId.has(id) && e.push(`Segment « ${s.nom} » : persona ${id} inexistant.`));
    if (!s.persona_ids.includes(s.persona_source)) e.push(`Segment « ${s.nom} » : la source ${s.persona_source} n'appartient pas au segment.`);
    const src = byId.get(s.persona_source);
    if (src) {
      const corpus = src.reactions.map((r) => norm(r.citation)).join(" | ") + " | " + norm(src.portrait);
      if (!corpus.includes(norm(s.objection_citee)))
        e.push(`Segment « ${s.nom} » : la citation « ${s.objection_citee.slice(0, 80)} » n'existe pas mot pour mot chez ${s.persona_source}.`);
    }
  });
  o.freins_participation.forEach((f) => f.persona_ids.forEach((id) => !byId.has(id) && e.push(`Frein « ${f.frein} » : persona ${id} inexistant.`)));
  o.ambassadeurs_potentiels.forEach((a) => !byId.has(a.persona_id) && e.push(`Ambassadeur ${a.persona_id} inexistant.`));
  return e;
}

export function checkContradicteur(o: ContradicteurOut): string[] {
  const e: string[] = [];
  const cibles = new Set(o.attaques.map((a) => a.cible));
  if (cibles.size < 3) e.push("Les attaques doivent porter sur au moins trois cibles différentes.");
  o.attaques.forEach((a, i) => {
    if (a.source_element === "connaissance_generale_a_verifier" && REFERENCE_NOMMEE.test(a.element_verifiable))
      e.push(`Attaque ${i + 1} : référence nommée et datée non vérifiable (« ${a.element_verifiable.slice(0, 80)} »). Retire-la ou remplace-la par un fait général.`);
  });
  return e;
}

export function extractNumbers(text: string): number[] {
  const cleaned = text.replace(/(\d)['’   ](?=\d{3}\b)/g, "$1");
  return (cleaned.match(/\d+(?:[.,]\d+)?/g) ?? []).map((s) => parseFloat(s.replace(",", ".")));
}

export function checkTraducteur(o: TraducteurOut, ctx: AdminContext): string[] {
  const e: string[] = [];
  const text = [o.titre, o.synthese, ...o.sections.flatMap((s) => [s.titre, s.contenu])].join("\n");
  if (TIRET_SEPARATEUR.test(text)) e.push("Tiret utilisé comme séparateur : interdit, utiliser virgule, deux-points ou point.");
  const allowed = ctx.allowedNumbers ?? [];
  const bad = new Set<number>();
  for (const n of extractNumbers(text)) {
    if (n <= 12 && Number.isInteger(n)) continue; // dénombrements courants (angles, sections, mois)
    const ok = allowed.some((a) => Math.abs(a - n) <= 0.51 || Math.abs(a * 100 - n) <= 0.51);
    if (!ok) bad.add(n);
  }
  if (bad.size) e.push(`Chiffres absents du dossier (hallucination possible) : ${[...bad].slice(0, 12).join(", ")}.`);
  return e;
}
