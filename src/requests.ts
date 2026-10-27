// Construction des messages « user » de chaque agent à partir de l'état du run.
import type { FormulateurOut, PersonaOut, PersonaSkeleton, SociologueOut, ContradicteurOut, GardienOut, FacilitateurOut } from "./schemas.js";

export interface CaseFile {
  id: string;
  // plateforme et organisation : cas créés depuis la plateforme web (textes adaptés par src/vocabulaire.ts).
  plateforme?: boolean;
  organisation?: { type: "commune" | "administration" | "ecole" | "entreprise" | "ong"; nom: string };
  // ville, ville_id et nationalites : seulement pour les quartiers d'une ville étrangère (étape quartiers).
  cible: { type: string; nom: string; canton: string; pays: string; description: string; ville?: string; ville_id?: string; nationalites?: { nationale: string; etrangere: string } };
  decideur: string;
  enjeu: string;
  objectif: string;
  angle_fourni?: string;
  horizon_mois: number;
  panel: { N: number; seed: number };
  acteurs_cles?: { groupe: string; activite_regex: string };
  contexte_factuel: string[]; // phrases sourcées, injectées telles quelles
  memoire_politique?: { periode: string; faits: string[]; constat: string; participation: string };
  votations: { vote_id: string; date: string; titre: string; resume_neutre: string; famille?: string }[];
  votations_etalonnage?: { vote_id: string; date: string; titre: string; resume_neutre: string; famille?: string }[];
  angle_controle?: { formulation: string; pourquoi: string };
  angle_controle2?: { formulation: string; pourquoi: string };
  sources?: { label: string; url: string }[];
}

export function userFormulateur(c: CaseFile) {
  return `Commune : ${c.cible.nom} (${c.cible.canton}, ${c.cible.pays}). ${c.cible.description}
Décideur : ${c.decideur}.
Enjeu : ${c.enjeu}
Objectif : ${c.objectif}
${c.angle_fourni ? `Angle proposé par le décideur (à garder en angle 1) : « ${c.angle_fourni} »` : "Aucun angle fourni par le décideur."}
Faits publics sur la commune :
${c.contexte_factuel.map((f) => "- " + f).join("\n")}
Produis 3 ou 4 angles au total.`;
}

export function userGardienAngles(c: CaseFile, f: FormulateurOut) {
  return `Contrôle doctrinal des angles produits par le Formulateur pour la commune de ${c.cible.nom}.
Enjeu : ${c.enjeu}
Objectif : ${c.objectif}
Sortie du Formulateur :
${JSON.stringify(f, null, 2)}
Contrôle chaque angle (cible = "angle N"). Vérifie en particulier le principe 6 : aucune formulation ne doit trancher les chemins à la place du terrain.`;
}

export function userPersona(c: CaseFile, s: PersonaSkeleton, f: FormulateurOut) {
  const lines = [
    `Ton profil :`,
    `- identifiant : ${s.id}`,
    `- âge : ${s.age} ans`,
    `- sexe : ${s.sexe}`,
    `- nationalité : ${s.nationalite === "suisse" ? "suisse" : "étrangère (résident·e en Suisse)"}`,
    `- activité : ${s.activite}`,
    `- ménage : ${s.menage}`,
    `- lieu de vie dans la commune : ${s.lieu_de_vie}`,
    `- sensibilité politique : ${s.parti_proche ? "proche de " + s.parti_proche : "non renseignée"}`,
    `- électeur ou électrice au niveau fédéral : ${s.electeur ? "oui" : "non"}`,
    ``,
    `Tu vis à ${c.cible.nom} (${c.cible.canton}). ${c.cible.description}`,
    `Faits publics sur la commune :`,
    ...c.contexte_factuel.map((x) => "- " + x),
    ...(c.memoire_politique
      ? [
          ``,
          `Culture politique de ta commune, ${c.memoire_politique.periode} :`,
          ...c.memoire_politique.faits.map((x) => "- " + x),
          c.memoire_politique.constat,
          c.memoire_politique.participation,
        ]
      : []),
    ``,
    `La commune réfléchit à la question suivante. Enjeu : ${c.enjeu} Objectif : ${c.objectif}`,
    `Voici les questions (angles) qui pourraient t'être posées si la commune lance une démarche participative :`,
    ...f.angles.map((a) => `${a.id}. ${a.formulation}`),
  ];
  if (s.electeur) {
    lines.push(``, `Votations fédérales passées (replace-toi à leur date, sans connaître le résultat ; la probabilité d'aller voter dépend de l'importance du jour de votation pour toi) :`);
    allVotes(c).forEach((v) => lines.push(`- ${v.vote_id} (${v.date}) : ${v.titre}. ${v.resume_neutre}`));
  } else {
    lines.push(``, `Tu n'es pas électeur fédéral : la liste "votes" doit être vide.`);
  }
  return lines.join("\n");
}

// Formats de la phase de participation réelle, décrits de la même manière pour tous les personas.
export const FORMATS_PHASE2 = {
  invitation: "La commune envoie une invitation par courrier à tous les ménages et la relaie sur son site et ses réseaux.",
  avis_en_ligne: "Avis en ligne : un questionnaire de 10 minutes sur téléphone ou ordinateur, ouvert pendant un mois.",
  atelier_presentiel: "Atelier présentiel : 2 h 30 à la salle communale, un samedi matin ou un soir de semaine, animé par une équipe extérieure. On y imagine ensemble la commune dans quinze ans et les chemins pour y arriver ; la plateforme recueille les visions de chacun.",
  parcours_distance: "Parcours à distance : trois séquences en ligne de 20 minutes sur trois semaines, à faire quand on veut (imaginer la commune dans quinze ans, proposer des chemins, choisir des priorités).",
};

export function userMobilisation(c: CaseFile, s: PersonaSkeleton, f: FormulateurOut, p: PersonaOut) {
  return [
    `Ton profil : ${s.age} ans, ${s.sexe}, nationalité ${s.nationalite === "suisse" ? "suisse" : "étrangère"}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche de " + s.parti_proche : ""}. Identifiant : ${s.id}.`,
    `Ton portrait : ${p.portrait}`,
    `Tu vis à ${c.cible.nom}. Enjeu : ${c.enjeu} Objectif : ${c.objectif}`,
    ``,
    `Tes réactions précédentes aux angles :`,
    ...p.reactions.map((r) => {
      const a = f.angles.find((x) => x.id === r.angle_id);
      return `${r.angle_id}. « ${a?.formulation} » : position ${r.position} (intensité ${r.intensite}), engagement ${r.engagement} sur 4. Tu as dit : « ${r.citation.replace(/^[«"\s]+|[»"\s]+$/g, "")} » Freins : ${r.freins_participation.join(" ; ") || "aucun"}.`;
    }),
    ``,
    `La démarche participative porterait sur l'angle choisi. ${FORMATS_PHASE2.invitation}`,
    `Formats proposés :`,
    `- ${FORMATS_PHASE2.avis_en_ligne}`,
    `- ${FORMATS_PHASE2.atelier_presentiel}`,
    `- ${FORMATS_PHASE2.parcours_distance}`,
  ].join("\n");
}

export function userControle(c: CaseFile, s: PersonaSkeleton, p: PersonaOut, formulation: string) {
  return [
    `Ton profil : ${s.age} ans, ${s.sexe}, nationalité ${s.nationalite === "suisse" ? "suisse" : "étrangère"}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche de " + s.parti_proche : ""}. Identifiant : ${s.id}.`,
    `Ton portrait : ${p.portrait}`,
    ``,
    `Tu vis à ${c.cible.nom} (${c.cible.canton}). ${c.cible.description}`,
    `Faits publics sur la commune :`,
    ...c.contexte_factuel.map((x) => "- " + x),
    ...(c.memoire_politique ? [``, `Culture politique de ta commune, ${c.memoire_politique.periode} :`, ...c.memoire_politique.faits.map((x) => "- " + x), c.memoire_politique.constat] : []),
    ``,
    `Message de la commune : « ${formulation} »`,
  ].join("\n");
}

// Votations de l'étape scrutins (cases/<cas>/scrutins.json). Rôle et famille ne sont jamais montrés aux personas.
export interface Scrutin { vote_id: string; date: string; titre: string; resume_neutre: string; role: "analogue" | "hors_echantillon" | "prevision"; famille: string }

export function userScrutin(c: CaseFile, s: PersonaSkeleton, p: PersonaOut, votes: Scrutin[]) {
  const ord = (v: Scrutin) => parseInt(v.vote_id.slice(1, 5), 10);
  return [
    `Ton profil : ${s.age} ans, ${s.sexe}, nationalité ${s.nationalite === "suisse" ? "suisse" : "étrangère"}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche de " + s.parti_proche : ""}. Identifiant : ${s.id}.`,
    `Ton portrait : ${p.portrait}`,
    ``,
    `Tu vis à ${c.cible.nom} (${c.cible.canton}). ${c.cible.description}`,
    `Faits publics sur la commune :`,
    ...c.contexte_factuel.map((x) => "- " + x),
    ...(c.memoire_politique ? [``, `Culture politique de ta commune, ${c.memoire_politique.periode} :`, ...c.memoire_politique.faits.map((x) => "- " + x), c.memoire_politique.constat, c.memoire_politique.participation] : []),
    ``,
    `Votations fédérales (replace-toi à leur date, sans connaître le résultat) :`,
    ...[...votes].sort((a, b) => ord(a) - ord(b)).map((v) => `- ${v.vote_id} (${v.date}) : ${v.titre}. ${v.resume_neutre}`),
  ].join("\n");
}

// Étape scrutins2 (data/scrutins_v2.json) : mêmes votations pour toutes les communes, avec recommandations et mots d'ordre.
export interface ScrutinV2 { vote_id: string; date: string; jour: string; role: "analogue" | "hors_echantillon" | "prevision"; familles: { famille: string; sens: number }[]; titre: string; resume_neutre: string; campagne: string }

export function userScrutinV2(c: CaseFile, s: PersonaSkeleton, votes: ScrutinV2[]) {
  return [
    `Ton profil : ${s.age} ans, ${s.sexe}, nationalité ${s.nationalite === "suisse" ? "suisse" : "étrangère"}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche de " + s.parti_proche : ""}. Identifiant : ${s.id}.`,
    ``,
    `Tu vis à ${c.cible.nom} (canton ${c.cible.canton}, Suisse). ${c.cible.description}`,
    `Faits publics sur la commune :`,
    ...c.contexte_factuel.map((x) => "- " + x),
    ``,
    `Votations fédérales (replace-toi à leur date, sans connaître le résultat) :`,
    ...[...votes].sort((a, b) => a.jour.localeCompare(b.jour)).map((v) => `- ${v.vote_id} (${v.date}) : ${v.titre}. ${v.resume_neutre} ${v.campagne}`),
  ].join("\n");
}

// Test à l'aveugle sur des votations cantonales (data/cantonales_20260927.json) : seuls les objets du canton de la commune.
export interface Cantonale { vote_id: string; canton: string; date: string; titre: string; resume_neutre: string; campagne: string; objet_ogd: number }

export function userCantonales(c: CaseFile, s: PersonaSkeleton, votes: Cantonale[]) {
  return [
    `Ton profil : ${s.age} ans, ${s.sexe}, nationalité ${s.nationalite === "suisse" ? "suisse" : "étrangère"}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche de " + s.parti_proche : ""}. Identifiant : ${s.id}.`,
    ``,
    `Tu vis à ${c.cible.nom} (canton ${c.cible.canton}, Suisse). ${c.cible.description}`,
    `Faits publics sur la commune :`,
    ...c.contexte_factuel.map((x) => "- " + x),
    ``,
    `Votations cantonales (replace-toi à leur date, sans connaître le résultat) :`,
    ...votes.filter((v) => v.canton === c.cible.canton).map((v) => `- ${v.vote_id} (${v.date}) : ${v.titre}. ${v.resume_neutre} ${v.campagne}`),
  ].join("\n");
}

// Test à l'aveugle sur des pétitions réelles (data/mobilisations_textes.json), sans aucun chiffre de signatures.
export interface Petition { id: string; titre: string; texte: string; destinataire: string; portee: string; porteur: string; date_lancement: string }

export function userPetitions(c: CaseFile, s: PersonaSkeleton, petitions: Petition[]) {
  return [
    `Ton profil : ${s.age} ans, ${s.sexe}, nationalité ${s.nationalite === "suisse" ? "suisse" : "étrangère"}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche de " + s.parti_proche : ""}. Identifiant : ${s.id}.`,
    ``,
    `Tu vis à ${c.cible.nom} (canton ${c.cible.canton}, Suisse). ${c.cible.description}`,
    ``,
    `Pétitions (identifiant, titre, porteur, destinataire, portée, lancement, texte) :`,
    ...petitions.map((p) => `- ${p.id} : « ${p.titre} ». Portée par ${p.porteur}, adressée à ${p.destinataire} (${p.portee}), lancée le ${p.date_lancement}. ${p.texte}`),
  ].join("\n");
}

// Test à l'aveugle sur des démarches participatives passées d'une ville (data/lausanne_textes.json), sans aucun chiffre.
export interface Demarche { id: string; nom_demarche: string; annee: number; appel: string; format: string; qui_peut_participer: string | Record<string, string>; duree_phase_participation: string; participation_a_prevoir: string }

// Le champ peut être un objet (âge, résidence, nationalité, remarques) : on le met en phrase, sinon « [object Object] » arrive au persona.
const enPhrase = (x: string | Record<string, string>) => (typeof x === "string" ? x : Object.entries(x).map(([k, v]) => `${k} : ${v}`).join(" ; "));

export function userDemarches(c: CaseFile, s: PersonaSkeleton, demarches: Demarche[]) {
  return [
    `Ton profil aujourd'hui (octobre 2026) : ${s.age} ans, ${s.sexe}, nationalité ${s.nationalite === "suisse" ? "suisse" : "étrangère (résident·e en Suisse)"}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche de " + s.parti_proche : ""}. Identifiant : ${s.id}. Tu habites ${c.cible.nom} depuis au moins 2017.`,
    ``,
    `Ta ville : ${c.cible.nom} (canton ${c.cible.canton}, Suisse). ${c.cible.description}`,
    ``,
    `Démarches participatives de la ville :`,
    ...[...demarches].sort((a, b) => a.annee - b.annee).map((d) => `- ${d.id} (${d.annee}) : ${d.nom_demarche}. ${d.appel} Format : ${d.format}. Qui pouvait participer : ${enPhrase(d.qui_peut_participer)}. Durée : ${d.duree_phase_participation}. Ce qui compte comme participation : ${d.participation_a_prevoir}.`),
  ].join("\n");
}

// Démarche d'une ville étrangère dont la participation est publiée par quartier (data/<ville>_textes.json).
export interface DemarcheVille extends Omit<Demarche, "nom_demarche" | "participation_a_prevoir"> { nom: string; ou_voter: string; grandeur_a_prevoir: string }

export function userQuartier(c: CaseFile, s: PersonaSkeleton, d: DemarcheVille) {
  const p = (x: string) => x.trim().replace(/\.+$/, "");
  const nat = s.nationalite === "suisse" ? c.cible.nationalites!.nationale : c.cible.nationalites!.etrangere;
  return [
    `Ton profil aujourd'hui (octobre 2026) : ${s.age} ans, ${s.sexe}, nationalité ${nat}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche de " + s.parti_proche : ""}. Identifiant : ${s.id}. Tu habites ${c.cible.nom} (${c.cible.type} de ${c.cible.ville}) depuis au moins 2020.`,
    ``,
    `Là où tu habites : ${c.cible.description}`,
    ``,
    `Démarche participative de ta ville :`,
    `- ${d.id} (${d.annee}) : ${p(d.nom)}. ${p(d.appel)}. Format : ${p(d.format)}. Qui peut participer : ${p(enPhrase(d.qui_peut_participer))}. Où voter : ${p(d.ou_voter)}. Durée : ${p(d.duree_phase_participation)}. Ce qui compte comme participation : ${p(d.grandeur_a_prevoir)}.`,
  ].join("\n");
}

// Votations d'étalonnage (anciennes) et de test (2018-2024), présentées ensemble dans l'ordre chronologique.
export function allVotes(c: CaseFile) {
  const ord = (id: string) => parseInt(id.slice(1, 5), 10);
  return [...(c.votations_etalonnage ?? []), ...c.votations].sort((a, b) => ord(a.vote_id) - ord(b.vote_id));
}

export function compactPersonas(ps: PersonaOut[], skels: PersonaSkeleton[]) {
  const sk = new Map(skels.map((s) => [s.id, s]));
  return ps.map((p) => {
    const s = sk.get(p.id)!;
    return {
      id: p.id,
      profil: `${s.age} ans, ${s.sexe}, ${s.nationalite}, ${s.activite}, ${s.menage}, ${s.lieu_de_vie}${s.parti_proche ? ", proche " + s.parti_proche : ""}`,
      portrait: p.portrait,
      influence: p.influence,
      reactions: p.reactions.map((r) => ({ angle: r.angle_id, position: r.position, intensite: r.intensite, engagement: r.engagement, citation: r.citation, freins: r.freins_participation, ce_qui_me_ferait_venir: r.ce_qui_me_ferait_venir })),
    };
  });
}

export function userFacilitateur(c: CaseFile, f: FormulateurOut, metrics: any) {
  const curves = metrics.angles.map((a: any) => ({
    angle_id: a.angle_id,
    formulation: f.angles.find((x) => x.id === a.angle_id)?.formulation,
    courbe_trimestrielle: a.diffusion.monthly.filter((m: any) => m.mois % 3 === 0),
    mois_mi_parcours: a.metrics.mois_mi_parcours,
    coporteurs_engages_fin: a.metrics.coporteurs,
    repartition_initiale: a.metrics.repartition_initiale,
  }));
  return `Commune : ${c.cible.nom}. Horizon : ${c.horizon_mois} mois. A = part de la population qui soutient la démarche (soutien, pas forcément engagement), O = opposition active, N = pas encore positionnée. Les co-porteurs engagés (prêts à venir agir) sont un sous-ensemble du soutien, indiqué séparément par angle : n'appelle jamais « co-porteurs » la part A.
Courbes calculées par le modèle (ne pas modifier) :
${JSON.stringify(curves, null, 1)}`;
}

export function userSociologue(c: CaseFile, f: FormulateurOut, ps: PersonaOut[], skels: PersonaSkeleton[], metrics: any) {
  return `Commune : ${c.cible.nom}. Enjeu : ${c.enjeu} Objectif : ${c.objectif}
Faits sourcés sur la commune (vérifiés, à distinguer de ce que disent les personas) :
${c.contexte_factuel.map((x) => "- " + x).join("\n")}
Angles :
${f.angles.map((a) => `${a.id}. ${a.formulation}`).join("\n")}
${metrics.controle ? `0. Angle témoin, à ne jamais recommander : ${metrics.controle.formulation}` : ""}
Métriques calculées par angle (resonance 0-10 = accueil initial ; soutien = part qui soutient la démarche à horizon, après propagation ; coporteurs = part qui soutient ET viendrait agir concrètement ; resistance = part d'opposition active ; participation = intentions de donner son avis en ligne ou de venir en atelier ; acteurs_cles = mêmes indicateurs pour les agriculteurs) :
${JSON.stringify(metrics.angles.map((a: any) => ({ angle_id: a.angle_id, ...a.metrics })), null, 1)}
${metrics.mobilisation ? `Mobilisation par format (probabilités déclarées de participer réellement, moyennes pondérées, converties en habitants de 16 ans et plus) : ${JSON.stringify(metrics.mobilisation.angles.map((a: any) => ({ angle_id: a.angle_id, formats: a.formats, effet_invitation: a.effet_invitation, agriculteurs: a.acteurs_cles })))} ; format préféré : ${JSON.stringify(metrics.mobilisation.formats_preferes)}` : ""}
${[metrics.controle, metrics.controle_objectif].filter(Boolean).map((t: any) => `Angle témoin (${t.pourquoi}) : « ${t.formulation} » : ${JSON.stringify(t.metrics)}`).join("\n")}
Réactions des ${ps.length} personas du panel :
${JSON.stringify(compactPersonas(ps, skels))}`;
}

export function userContradicteur(c: CaseFile, f: FormulateurOut, metrics: any, soc: SociologueOut, hypotheses: string[]) {
  return `Commune : ${c.cible.nom}. Enjeu : ${c.enjeu} Objectif : ${c.objectif}
Faits sourcés sur la commune (vérifiés par Régénère Plus, sources publiques) :
${c.contexte_factuel.map((x) => "- " + x).join("\n")}
Angles : ${JSON.stringify(f.angles.map((a) => ({ id: a.id, formulation: a.formulation, origine: a.origine })))}
Métriques : ${JSON.stringify(metrics.angles.map((a: any) => ({ angle_id: a.angle_id, ...a.metrics })))}
Backtest du panel sur des votations fédérales passées (écarts en points de pourcentage, comparés à deux références naïves : résultat cantonal et résultat suisse) : ${JSON.stringify(metrics.backtest)}
Composition du panel : ${JSON.stringify(metrics.panel_resume)}
Angles témoins (pour vérifier que le panel sait dire non) : ${JSON.stringify([metrics.controle, metrics.controle_objectif].filter(Boolean).map((t: any) => ({ formulation: t.formulation, pourquoi: t.pourquoi, metrics: t.metrics })))}
Mobilisation par format (probabilités déclarées par les personas de participer à l'avis en ligne, à l'atelier présentiel, au parcours à distance, et à l'atelier s'ils sont invités par un proche ; converties en habitants, avec une version corrigée par la surestimation de participation mesurée sur les votations) : ${JSON.stringify(metrics.mobilisation ?? "non mesurée")}
Hypothèses du modèle et du panel : ${JSON.stringify(hypotheses)}
Analyse du Sociologue : ${JSON.stringify(soc)}`;
}

export function userGardienFinal(c: CaseFile, f: FormulateurOut, soc: SociologueOut, contra: ContradicteurOut) {
  return `Contrôle doctrinal final pour ${c.cible.nom}.
Angles : ${JSON.stringify(f.angles.map((a) => ({ id: a.id, formulation: a.formulation })))}
Recommandation et leviers du Sociologue : ${JSON.stringify({ angle_recommande: soc.angle_recommande, segments: soc.segments.map((s) => ({ nom: s.nom, levier: s.levier })), freins: soc.freins_participation })}
Notes du Contradicteur : ${JSON.stringify(contra.notes_pour_rapport)}
Contrôle : la recommandation (cible = "recommandation"), les leviers proposés (cible = "leviers"). Un levier qui impose un chemin au terrain viole le principe 6.`;
}

export function userTraducteur(dossier: unknown) {
  return `Dossier consolidé (seule source autorisée) :
${JSON.stringify(dossier)}`;
}

export function withErrors(user: string, errors: string[] | undefined) {
  if (!errors?.length) return user;
  return `${user}

IMPORTANT : ta réponse précédente a été rejetée par l'Administrateur du cadre ou le Gardien pour ces raisons. Corrige-les toutes :
${errors.map((e) => "- " + e).join("\n")}`;
}

export type { GardienOut, FacilitateurOut };
