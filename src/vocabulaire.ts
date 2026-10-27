// Adaptation des messages aux tests lancés depuis la plateforme (cas marqués `plateforme: true`).
// Les messages ont été écrits pour une commune suisse avec votations passées : pour une administration, une école,
// une entreprise ou une ONG, et pour tout cas sans votations, on remplace les tournures exactes concernées.
// Les cas historiques (sans le marqueur) ne passent jamais ici : leurs requêtes restent identiques à l'octet près.
import type { CaseFile } from "./requests.js";

export type TypeOrganisation = "commune" | "administration" | "ecole" | "entreprise" | "ong";

interface Mots {
  emetteur: string; // qui lance la démarche, en sujet : « la commune », « l'association »
  aEmetteur: string; // « à la commune »
  deEmetteur: string; // « de la commune »
  laCible: string; // la population concernée : « la commune », « le canton », « l'école »
  surCible: string; // « sur la commune »
  taCible: string; // « de ta commune »
  tuVis: string; // phrase complète de situation
  personne: string; // « habitant » ou « membre »
  personnes: string;
  dePersonnes: string; // « d'habitants », « de membres »
  lieuDeVie: string; // libellé du lieu de vie dans le profil
  invitation: string; // canal d'invitation
  salle: string; // où se tient l'atelier
  population: string; // description de la population concernée
}

const maj = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function mots(c: CaseFile): Mots {
  const org = c.organisation ?? { type: "commune" as const, nom: c.cible.nom };
  const parGroupes = c.cible.type === "organisation";
  const emet: Record<TypeOrganisation, [string, string, string]> = {
    commune: ["la commune", "à la commune", "de la commune"],
    administration: c.cible.type === "suisse" ? ["la Confédération", "à la Confédération", "de la Confédération"] : ["le canton", "au canton", "du canton"],
    ecole: ["l'école", "à l'école", "de l'école"],
    entreprise: ["l'entreprise", "à l'entreprise", "de l'entreprise"],
    ong: ["l'association", "à l'association", "de l'association"],
  };
  const [emetteur, aEmetteur, deEmetteur] = emet[org.type];
  if (parGroupes) {
    const lieu = emetteur; // la population est celle de l'organisation elle-même
    return {
      emetteur, aEmetteur, deEmetteur,
      laCible: lieu, surCible: `sur ${lieu}`, taCible: `de ton organisation`,
      tuVis: `Tu fais partie de ${org.nom}. ${c.cible.description}`,
      personne: "membre", personnes: "membres", dePersonnes: "de membres",
      lieuDeVie: "lieu de vie",
      invitation: `${maj(emetteur)} envoie une invitation personnelle à chacun de ses membres et la relaie par ses canaux habituels.`,
      salle: `dans les locaux de ${org.nom}`,
      population: `les membres de ${org.nom}. ${c.cible.description}`,
    };
  }
  const t = c.cible.type;
  const laCible = t === "canton" ? "le canton" : t === "suisse" ? "la Suisse" : "la commune";
  return {
    emetteur, aEmetteur, deEmetteur,
    laCible,
    surCible: t === "canton" ? "sur le canton" : t === "suisse" ? "sur la Suisse" : "sur la commune",
    taCible: t === "canton" ? "de ton canton" : t === "suisse" ? "de ton pays" : "de ta commune",
    tuVis: t === "canton" ? `Tu vis dans le canton de ${c.cible.nom} (Suisse). ${c.cible.description}` : t === "suisse" ? `Tu vis en Suisse. ${c.cible.description}` : `Tu vis à ${c.cible.nom} (${c.cible.canton}). ${c.cible.description}`,
    personne: "habitant", personnes: "habitants", dePersonnes: "d'habitants",
    lieuDeVie: t === "canton" ? "lieu de vie dans le canton" : t === "suisse" ? "lieu de vie" : "lieu de vie dans la commune",
    invitation: `${maj(emetteur)} envoie une invitation par courrier à tous les ménages concernés et la relaie sur son site et ses réseaux.`,
    salle: t === "commune" ? "à la salle communale" : "dans une salle proche de chez toi",
    population: t === "canton" ? `canton de ${c.cible.nom} (Suisse). ${c.cible.description}` : t === "suisse" ? `Suisse. ${c.cible.description}` : `${c.cible.nom} (${c.cible.canton}, Suisse). ${c.cible.description}`,
  };
}

// Remplacements exacts, dans l'ordre. Une tournure absente du texte est simplement ignorée.
function remplacements(c: CaseFile): [string, string][] {
  const m = mots(c);
  const sansVotations = !c.votations?.length;
  const r: [string, string][] = [
    // Messages système
    ["Tu incarnes un habitant réel et singulier", `Tu incarnes ${m.personne === "habitant" ? "un habitant" : "un membre"} réel et singulier`],
    ["Tu incarnes le même habitant", `Tu incarnes le même ${m.personne}`],
    ["ni pour faire plaisir à la commune", `ni pour faire plaisir ${m.aEmetteur}`],
    ["beaucoup d'habitants ne se sentent pas concernés", `beaucoup ${m.dePersonnes} ne se sentent pas concernés`],
    ["la culture politique de ta commune (décrite plus bas avec des chiffres réels)", `la culture ${m.taCible}`],
    ["la culture politique de ta commune", `la culture ${m.taCible}`],
    ["N'invente pas de chiffres sur la commune.", `N'invente pas de chiffres ${m.surCible}.`],
    ["si la commune lançait une démarche participative", `si ${m.emetteur} lançait une démarche participative`],
    ["La commune passe maintenant à la participation réelle.", `${maj(m.emetteur)} passe maintenant à la participation réelle.`],
    ["La commune t'adresse un message.", `${maj(m.emetteur)} t'adresse un message.`],
    ["Ce qu'un persona affirme sur la commune (nombre de fermes, lieux, commerces, institutions)", `Ce qu'un persona affirme ${m.surCible} (lieux, institutions, chiffres)`],
    ["comme un fait sur la commune", `comme un fait ${m.surCible}`],
    ["(opposition municipale, organisation agricole, juriste, économiste, militant écologiste, habitant sceptique, journaliste, statisticien)", `(opposition, représentant des personnes concernées, juriste, économiste, militant, ${m.personne} sceptique, journaliste, statisticien)`],
    ["Tu écris le rapport destiné au Conseil communal", `Tu écris le rapport destiné à ${c.decideur}`],
    ["Les effectifs d'habitants sont des ordres de grandeur : donne l'estimation prudente et précise qu'il s'agit d'un plafond pour le chiffre brut.", `Pour le nombre de participants, reprends telle quelle l'estimation_participants du dossier : le chiffre par format, sa fourchette (de la moitié au double) et sa fiabilité mesurée lors des tests à l'aveugle (nombre de cas testés, facteur médian, nombre de cas dans la fourchette). Les effectifs ${m.dePersonnes} déclarés par le panel sont des plafonds, pas des prévisions.`],
    ["Les effectifs d'habitants sont des ordres de grandeur", `Les effectifs ${m.dePersonnes} sont des ordres de grandeur`],
    ["ne les présente jamais comme des paroles d'habitants réels.", `ne les présente jamais comme des paroles ${m.dePersonnes} réels. N'emploie jamais le mot « persona » : écris « ${m.personnes} simulés ».`],
    // Messages des agents
    [`Commune : ${c.cible.nom} (${c.cible.canton}, ${c.cible.pays}). ${c.cible.description}`, `Organisation : ${c.organisation?.nom ?? c.cible.nom}. Population concernée : ${m.population}`],
    [`pour la commune de ${c.cible.nom}.`, `pour ${c.organisation?.nom ?? c.cible.nom}.`],
    [`Commune : ${c.cible.nom}.`, `Organisation : ${c.organisation?.nom ?? c.cible.nom}.`],
    ["Faits publics sur la commune :", c.cible.type === "organisation" ? `Faits déclarés ${m.surCible} :` : `Faits publics ${m.surCible} :`],
    ["Faits sourcés sur la commune", `Faits sourcés ${m.surCible}`],
    ["- lieu de vie dans la commune :", `- ${m.lieuDeVie} :`],
    [`Tu vis à ${c.cible.nom} (${c.cible.canton}). ${c.cible.description}`, m.tuVis],
    [`Tu vis à ${c.cible.nom}. Enjeu :`, `${m.tuVis.split(". ")[0]}. Enjeu :`],
    ["La commune réfléchit à la question suivante.", `${maj(m.emetteur)} réfléchit à la question suivante.`],
    ["si la commune lance une démarche participative", `si ${m.emetteur} lance une démarche participative`],
    ["La commune envoie une invitation par courrier à tous les ménages et la relaie sur son site et ses réseaux.", m.invitation],
    ["à la salle communale", m.salle],
    ["imagine ensemble la commune dans quinze ans", `imagine ensemble ${m.laCible} dans quinze ans`],
    ["imaginer la commune dans quinze ans", `imaginer ${m.laCible} dans quinze ans`],
    ["Message de la commune :", `Message ${m.deEmetteur} :`],
    ["converties en habitants", `converties en ${m.personnes}`],
  ];
  if (sansVotations) {
    r.push(
      ["Si tu es électeur ou électrice en Suisse, réponds aussi aux votations fédérales listées, en te replaçant à leur date, sans connaître le résultat : probabilité d'aller voter (0 à 1) et probabilité de voter oui si tu votes (0 à 1), avec ta raison. Pour une votation où tu n'avais pas encore l'âge de voter, réponds quand même avec participe_proba 0. Si tu n'es pas électeur, renvoie une liste \"votes\" vide.", "Renvoie toujours une liste \"votes\" vide."],
      ["Votations fédérales passées (replace-toi à leur date, sans connaître le résultat ; la probabilité d'aller voter dépend de l'importance du jour de votation pour toi) :", "Aucune votation à traiter : la liste \"votes\" doit être vide."],
      ["Tu n'es pas électeur fédéral : la liste \"votes\" doit être vide.", "La liste \"votes\" doit être vide."],
      ["Tu reçois les angles, les métriques de simulation, le backtest sur les votations passées, l'analyse du Sociologue", "Tu reçois les angles, les métriques de simulation, l'analyse du Sociologue"],
      ["fiabilité (backtest sur votations et limites)", "fiabilité et limites de la méthode (aucune votation passée ne sert ici de contrôle)"],
      [", avec une version corrigée par la surestimation de participation mesurée sur les votations", " (plafonds : lors des tests à l'aveugle, les panels ont surestimé la participation réelle d'un facteur 2 à 8)"],
    );
  }
  if (c.cible.type === "organisation") r.push(["- électeur ou électrice au niveau fédéral :", "- droit de vote fédéral :"]);
  return r;
}

export function adapter(texte: string, c: CaseFile): string {
  if (!c.plateforme) return texte;
  let t = texte;
  for (const [a, b] of remplacements(c)) t = t.split(a).join(b);
  // Sans votations passées, le backtest est vide : on retire la ligne qui le présente au Contradicteur.
  if (!c.votations?.length) t = t.replace(/^Backtest du panel sur des votations fédérales passées.*\n/m, "");
  return t;
}
