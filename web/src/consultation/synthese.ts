// Synthèse des vraies réponses, dans le même cadre que la prospective simulée : lecture des groupes et des objections
// (le Sociologue), relecture critique (le Contradicteur), puis rédaction (le Traducteur). Avec la clé de l'initiateur.
// L'IA ne reçoit que les données anonymes. Chaque citation est vérifiée mot pour mot : une citation introuvable est refusée.
import { z } from 'zod'
import { POSITIONS } from './types'
import type { CritiqueReelle, LectureReelle, Questionnaire, RedactionReelle, RepereSimulation, Synthese } from './types'
import { publier } from './analyse'
import type { Analyse, LigneAnonyme } from './analyse'

export type Niveau = 'opus' | 'sonnet' | 'haiku'
export interface DemandeModele { step: string; item: string; model: Niveau; attempt: number; system: string; user: string; response_path: string }
export type AppelModele = (r: DemandeModele) => Promise<{ texte: string; tokens_entree: number; tokens_sortie: number }>

const RACINES = ['economique', 'culturelle', 'pratique', 'identitaire', 'politique', 'information'] as const

const LectureOut = z.object({
  segments: z
    .array(
      z.object({
        nom: z.string().min(3).max(200),
        position_dominante: z.enum(POSITIONS),
        objection_citee: z.string().min(3).max(800),
        reponse_source: z.string().regex(/^R\d+$/),
        racine: z.enum(RACINES),
        levier: z.string().min(10).max(800),
      }),
    )
    .min(1)
    .max(8),
  freins_participation: z.array(z.object({ frein: z.string().min(3).max(400), nombre: z.number().int().min(1), levier: z.string().min(5).max(600) })).max(12),
  themes: z.array(z.object({ question_id: z.string(), themes: z.array(z.object({ theme: z.string().min(3).max(300), nombre: z.number().int().min(1), citation: z.string().min(3).max(800) })).max(8) })),
  ecarts_avec_simulation: z.array(z.string().min(10).max(900)).max(8),
  surprises: z.array(z.string().min(5).max(900)).max(8),
})

const CritiqueOut = z.object({
  attaques: z
    .array(z.object({ cible: z.enum(['lecture', 'representativite', 'comparaison', 'questions', 'donnees']), critique: z.string().min(40).max(1500), impact: z.string().min(10).max(800) }))
    .min(2)
    .max(10),
  notes_pour_rapport: z.array(z.string().min(10).max(900)).min(1).max(10),
})

const RedactionOut = z.object({
  titre: z.string().min(10).max(200),
  synthese: z.string().min(80).max(1500),
  sections: z.array(z.object({ titre: z.string().min(3).max(200), contenu: z.string().min(40).max(5000) })).min(3).max(9),
})

const JSON_SEUL = 'Tu réponds UNIQUEMENT par un objet JSON valide conforme au format demandé, sans texte avant ni après, sans balises markdown.'
const langueSortie = (q: Questionnaire) => (q.langue === 'en' ? 'Rédige tous les textes en anglais, sauf les citations, recopiées dans leur langue d\'origine.' : 'Rédige en français.')

const systemeLecture = (q: Questionnaire) => `Tu es le Sociologue du moteur RegenVox. Cette fois, tu ne lis pas un panel simulé : tu lis les réponses de vraies personnes à une consultation lancée par ${q.organisation.nom}.
Les réponses sont anonymes. Chaque ligne est une personne (numéro R…). Le signe « • » signale une catégorie masquée pour protéger l'anonymat : n'en déduis rien.
Ta tâche :
1. Regroupe les personnes en 1 à 8 segments qui partagent une position et une objection. Pour chacun : un nom descriptif (jamais un nom de personne), la position dominante, une objection citée MOT POUR MOT depuis un texte de la ligne indiquée dans "reponse_source" (avis, freins, envie ou réponse libre), sa racine (economique, culturelle, pratique, identitaire, politique, information) et un levier qui n'impose aucun chemin aux personnes.
2. Les freins à la participation, avec le nombre approximatif de personnes qui les expriment, et un levier pour chacun.
3. Pour chaque question à réponse libre, les thèmes qui reviennent (au plus 8), avec leur nombre approximatif et une citation MOT POUR MOT tirée des réponses à cette question.
4. Les écarts entre les vraies réponses et la simulation (chiffres fournis), en rappelant qu'un écart peut venir de qui a répondu plutôt que de la simulation.
5. Ce qui surprend.
Règles : n'invente rien ; ne cite que ce qui est écrit ; ne cherche pas à identifier qui que ce soit ; un petit nombre de réponses appelle de la prudence, dis-le. Le décideur peut nommer l'enjeu et l'objectif, jamais les chemins : les leviers ouvrent, ils n'imposent pas.
${langueSortie(q)}
${JSON_SEUL}
Format : {"segments": [{"nom": string, "position_dominante": "porteur"|"interesse"|"indifferent"|"reticent"|"opposant", "objection_citee": string, "reponse_source": "R001", "racine": string, "levier": string}], "freins_participation": [{"frein": string, "nombre": number, "levier": string}], "themes": [{"question_id": string, "themes": [{"theme": string, "nombre": number, "citation": string}]}], "ecarts_avec_simulation": [string], "surprises": [string]}`

const systemeCritique = (q: Questionnaire) => `Tu es le Contradicteur du moteur RegenVox. Tu relis la lecture des réponses d'une vraie consultation et tu cherches ce qui pourrait tromper le décideur.
Vérifie en particulier : qui a répondu et qui manque (comparé à la population), l'effet d'autosélection (les personnes déjà intéressées répondent plus), les petits effectifs, la sur-interprétation d'un écart avec la simulation, les questions qui orientaient la réponse, et les données elles-mêmes.
Chaque attaque nomme sa cible (lecture, representativite, comparaison, questions, donnees), explique la critique et son impact sur les décisions. Termine par les notes à faire figurer dans le rapport.
${langueSortie(q)}
${JSON_SEUL}
Format : {"attaques": [{"cible": string, "critique": string, "impact": string}], "notes_pour_rapport": [string]}`

const systemeRedaction = (q: Questionnaire) => `Tu es le Traducteur du moteur RegenVox. Tu écris la synthèse d'une vraie consultation pour ${q.organisation.nom}, à partir du seul dossier fourni.
Écris pour des personnes qui décident, sans jargon. Donne les chiffres du dossier tels quels, sans en inventer. Distingue ce que les gens ont dit de ce que l'on en déduit. Reprends les limites signalées par la relecture critique. Ne présente jamais une piste comme une décision : les chemins restent à construire avec les personnes.
N'utilise jamais de tiret pour séparer des idées : une virgule, deux points ou une nouvelle phrase.
Structure : un titre, une synthèse de quelques phrases, puis 3 à 9 sections (par exemple : qui a répondu, l'accueil de la démarche, ce qui retient et ce qui ferait venir, les réponses aux questions, ce que la simulation avait vu ou manqué, les limites, les suites possibles).
${langueSortie(q)}
${JSON_SEUL}
Format : {"titre": string, "synthese": string, "sections": [{"titre": string, "contenu": string}]}`

// Retire les balises éventuelles autour du JSON.
export function extraireJson(texte: string): unknown {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut < 0 || fin <= debut) throw new Error('réponse sans objet JSON')
  return JSON.parse(texte.slice(debut, fin + 1))
}

const normaliser = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[«»“”"'’]/g, '')
    .replace(/[\s ]+/g, ' ')
    .replace(/[.…!?,;:]+$/g, '')
    .trim()

function textesDe(l: LigneAnonyme, questionsLibres: string[]): string[] {
  return [l.avis, l.freins, l.envie, ...questionsLibres.map((id) => l.reponses[id])].filter((x): x is string => !!x)
}

// Contrôles de l'Administrateur sur la lecture : chaque citation doit exister telle quelle.
export function controlerLecture(l: LectureReelle, lignes: LigneAnonyme[], q: Questionnaire): string[] {
  const erreurs: string[] = []
  const libres = q.questions.filter((x) => x.type === 'texte').map((x) => x.id)
  const parNumero = new Map(lignes.map((x) => [x.numero, x]))
  l.segments.forEach((s, i) => {
    const ligne = parNumero.get(s.reponse_source)
    if (!ligne) {
      erreurs.push(`Segment ${i + 1} : la réponse ${s.reponse_source} n'existe pas.`)
      return
    }
    const cite = normaliser(s.objection_citee)
    if (!textesDe(ligne, libres).some((t) => normaliser(t).includes(cite))) {
      erreurs.push(`Segment ${i + 1} : la citation « ${s.objection_citee.slice(0, 80)} » ne figure pas mot pour mot dans la réponse ${s.reponse_source}.`)
    }
  })
  for (const t of l.themes) {
    if (!libres.includes(t.question_id)) {
      erreurs.push(`Thèmes : la question ${t.question_id} n'est pas une question à réponse libre.`)
      continue
    }
    for (const th of t.themes) {
      const cite = normaliser(th.citation)
      if (!lignes.some((x) => x.reponses[t.question_id] && normaliser(x.reponses[t.question_id]).includes(cite))) {
        erreurs.push(`Thème « ${th.theme} » : la citation « ${th.citation.slice(0, 80)} » ne figure pas mot pour mot dans les réponses à la question ${t.question_id}.`)
      }
      if (th.nombre > lignes.length) erreurs.push(`Thème « ${th.theme} » : ${th.nombre} personnes, plus que les ${lignes.length} réponses.`)
    }
  }
  for (const f of l.freins_participation) if (f.nombre > lignes.length) erreurs.push(`Frein « ${f.frein} » : ${f.nombre} personnes, plus que les ${lignes.length} réponses.`)
  return erreurs
}

// Retire les tirets employés comme séparateurs, que l'IA glisse parfois malgré la consigne.
export const sansTirets = (s: string) => s.replace(/\s[—–-]\s/g, ', ').replace(/[—–]/g, ', ')

// Au-delà d'une certaine taille, on envoie un échantillon tiré au hasard, et on le dit à l'IA.
const TAILLE_MAX_DOSSIER = 350_000
export function echantillonner(lignes: LigneAnonyme[]): { lignes: LigneAnonyme[]; echantillon: boolean } {
  const court = (s?: string) => (s && s.length > 600 ? s.slice(0, 600) + '…' : s)
  const reduites = lignes.map((l) => ({ ...l, avis: court(l.avis), freins: court(l.freins), envie: court(l.envie), reponses: Object.fromEntries(Object.entries(l.reponses).map(([k, v]) => [k, court(v) ?? ''])) }))
  if (JSON.stringify(reduites).length <= TAILLE_MAX_DOSSIER) return { lignes: reduites, echantillon: false }
  const melange = [...reduites].sort(() => Math.random() - 0.5)
  const garde: LigneAnonyme[] = []
  let taille = 0
  for (const l of melange) {
    const t = JSON.stringify(l).length
    if (taille + t > TAILLE_MAX_DOSSIER) break
    garde.push(l)
    taille += t
  }
  return { lignes: garde.sort((a, b) => a.numero.localeCompare(b.numero)), echantillon: true }
}

function chiffres(a: Analyse) {
  const pct = (x?: number) => (x === undefined ? undefined : Math.round(x * 1000) / 10)
  return {
    nombre_reponses: a.n,
    position_face_a_la_formulation: a.positions.map((p) => ({ position: p.option, personnes: p.n, part_reelle_pct: pct(p.part), part_simulee_pct: pct(p.part_reference) })),
    score_moyen_de_soutien: { reel: a.score_reel, simule: a.score_simule, echelle: 'de -3 (opposition) à 3 (porteur)' },
    engagement: a.engagement.map((e) => ({ niveau: e.option, personnes: e.n, part_reelle_pct: pct(e.part), part_simulee_pct: pct(e.part_reference) })),
    format_prefere: a.formats.map((f) => ({ format: f.option, personnes: f.n, part_reelle_pct: pct(f.part), part_simulee_pct: pct(f.part_reference) })),
    // Mêmes tableaux que le rapport : les petits groupes y sont réunis, l'IA ne voit aucun groupe de moins de 5 personnes.
    qui_a_repondu: publier(a).map((c) => ({ categorie: c.cle, lignes: c.lignes.map((l) => ({ valeurs: l.autres ? `réunis : ${l.options.map((o) => o || 'sans réponse').join(', ')}` : l.options[0], personnes: l.n, part_dans_la_population_pct: pct(l.part_reference) })) })),
    score_par_categorie: publier(a).map((c) => ({ categorie: c.cle, lignes: c.scores.map((l) => ({ valeurs: l.autres ? `réunis : ${l.options.map((o) => o || 'sans réponse').join(', ')}` : l.options[0], personnes: l.n, reel: l.reel, simule: l.simule })) })),
    questions_fermees: a.questions.filter((x) => x.type !== 'texte').map((x) => ({ id: x.id, intitule: x.intitule, repondants: x.n, options: x.options?.map((o) => ({ option: o.option, personnes: o.n })), distribution_1_a_5: x.distribution, moyenne: x.moyenne })),
  }
}

interface Contexte { q: Questionnaire; sim?: RepereSimulation; analyse: Analyse; lignes: LigneAnonyme[] }

function dossierLecture({ q, sim, analyse, lignes }: Contexte): string {
  const { lignes: envoyees, echantillon } = echantillonner(lignes)
  return [
    `Organisation : ${q.organisation.nom}.`,
    sim ? `Enjeu : ${sim.enjeu}\nObjectif : ${sim.objectif}` : '',
    `Formulation présentée aux personnes : « ${q.formulation} »`,
    sim?.contexte.length ? `Faits publics sur le territoire :\n${sim.contexte.map((x) => '- ' + x).join('\n')}` : '',
    sim ? `La simulation (panel de ${sim.taille_panel} habitants simulés) avait testé cette formulation : ses parts figurent dans les chiffres ci-dessous sous « simulée ».` : 'Aucune simulation à comparer.',
    `Chiffres calculés sur toutes les réponses (ne pas modifier) :\n${JSON.stringify(chiffres(analyse))}`,
    `Questions posées par l'organisation : ${JSON.stringify(q.questions.map((x) => ({ id: x.id, type: x.type, intitule: x.intitule, options: x.options })))}`,
    echantillon ? `Réponses : échantillon tiré au hasard de ${envoyees.length} personnes sur ${lignes.length}, faute de place.` : `Réponses des ${lignes.length} personnes :`,
    JSON.stringify(envoyees),
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function etape<T>(
  appel: AppelModele,
  usage: Synthese['usage'],
  step: string,
  model: Niveau,
  system: string,
  user: string,
  schema: z.ZodType<T>,
  controle: (x: T) => string[] = () => [],
  signal?: AbortSignal,
): Promise<T> {
  let erreurs: string[] = []
  for (let essai = 1; essai <= 3; essai++) {
    if (signal?.aborted) throw new Error('Synthèse interrompue.')
    const message = erreurs.length
      ? `${user}\n\nIMPORTANT : ta réponse précédente a été refusée pour ces raisons. Corrige-les toutes :\n${erreurs.map((e) => '- ' + e).join('\n')}`
      : user
    const r = await appel({ step, item: 'consultation', model, attempt: essai, system, user: message, response_path: '' })
    usage.tokens_entree += r.tokens_entree
    usage.tokens_sortie += r.tokens_sortie
    let brut: unknown
    try {
      brut = extraireJson(r.texte)
    } catch (e) {
      erreurs = [`JSON illisible : ${e instanceof Error ? e.message : String(e)}`]
      continue
    }
    const v = schema.safeParse(brut)
    if (!v.success) {
      erreurs = v.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || 'racine'} : ${i.message}`)
      continue
    }
    erreurs = controle(v.data)
    if (!erreurs.length) return v.data
  }
  throw new Error(`L'étape « ${step} » n'a pas abouti après 3 essais : ${erreurs.slice(0, 3).join(' ')}`)
}

export type EtapeSynthese = 'lecture' | 'critique' | 'redaction'

export async function synthetiser(
  ctx: Contexte,
  appel: AppelModele,
  suivi?: (e: EtapeSynthese) => void,
  signal?: AbortSignal,
): Promise<Synthese> {
  const usage = { tokens_entree: 0, tokens_sortie: 0 }
  const { q } = ctx
  suivi?.('lecture')
  const lecture = await etape(appel, usage, 'lecture', 'opus', systemeLecture(q), dossierLecture(ctx), LectureOut, (x) => controlerLecture(x, ctx.lignes, q), signal)

  suivi?.('critique')
  const critique = await etape(
    appel,
    usage,
    'critique',
    'sonnet',
    systemeCritique(q),
    [
      `Organisation : ${q.organisation.nom}. Formulation : « ${q.formulation} »`,
      `Chiffres : ${JSON.stringify(chiffres(ctx.analyse))}`,
      ctx.sim ? `Composition de la population estimée par le panel : ${JSON.stringify(ctx.sim.population)}` : '',
      `Lecture du Sociologue : ${JSON.stringify(lecture)}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    CritiqueOut,
    () => [],
    signal,
  )

  suivi?.('redaction')
  const redaction = await etape(
    appel,
    usage,
    'redaction',
    'sonnet',
    systemeRedaction(q),
    `Dossier consolidé (seule source autorisée) :\n${JSON.stringify({ organisation: q.organisation.nom, formulation: q.formulation, chiffres: chiffres(ctx.analyse), lecture, critique, simulation: ctx.sim ? { taille_panel: ctx.sim.taille_panel } : null })}`,
    RedactionOut,
    () => [],
    signal,
  )

  const propre = (r: RedactionReelle): RedactionReelle => ({
    titre: sansTirets(r.titre),
    synthese: sansTirets(r.synthese),
    sections: r.sections.map((s) => ({ titre: sansTirets(s.titre), contenu: sansTirets(s.contenu) })),
  })
  return {
    faite_le: new Date().toISOString(),
    nombre_reponses: ctx.lignes.length,
    lecture: lecture as LectureReelle,
    critique: critique as CritiqueReelle,
    redaction: propre(redaction),
    usage,
  }
}

// Maquette (développement seulement) : une synthèse construite à partir des données, sans appel à une IA.
export function syntheseMaquette(ctx: Contexte): Synthese {
  const avecTexte = ctx.lignes.filter((l) => l.avis || l.freins)
  const fr = ctx.q.langue === 'fr'
  return {
    faite_le: new Date().toISOString(),
    nombre_reponses: ctx.lignes.length,
    lecture: {
      segments: avecTexte.slice(0, 2).map((l, i) => ({
        nom: fr ? `Groupe d'exemple ${i + 1}` : `Sample group ${i + 1}`,
        position_dominante: l.position ?? 'indifferent',
        objection_citee: (l.avis || l.freins)!,
        reponse_source: l.numero,
        racine: 'pratique',
        levier: fr ? 'Levier d’exemple produit par la maquette.' : 'Sample lever produced by the mock-up.',
      })),
      freins_participation: [],
      themes: [],
      ecarts_avec_simulation: [fr ? 'Écart d’exemple produit par la maquette.' : 'Sample gap produced by the mock-up.'],
      surprises: [],
    },
    critique: { attaques: [], notes_pour_rapport: [fr ? 'Note d’exemple : cette synthèse vient de la maquette, sans IA.' : 'Sample note: this synthesis comes from the mock-up, without AI.'] },
    redaction: {
      titre: fr ? 'Synthèse d’exemple (maquette)' : 'Sample synthesis (mock-up)',
      synthese: fr ? 'Ce texte est produit par la maquette de l’interface. Il ne contient aucune analyse : il sert à vérifier l’affichage du rapport.' : 'This text is produced by the interface mock-up. It contains no analysis: it only checks how the report is displayed.',
      sections: [
        { titre: fr ? 'Qui a répondu' : 'Who answered', contenu: fr ? `${ctx.lignes.length} réponses ont été relevées et déchiffrées sur cet appareil.` : `${ctx.lignes.length} answers were collected and decrypted on this device.` },
        { titre: fr ? 'Accueil de la démarche' : 'Reception of the process', contenu: fr ? 'Section d’exemple, sans analyse, pour vérifier la mise en page.' : 'Sample section, without analysis, to check the layout.' },
        { titre: fr ? 'Limites' : 'Limits', contenu: fr ? 'Section d’exemple, sans analyse, pour vérifier la mise en page.' : 'Sample section, without analysis, to check the layout.' },
      ],
    },
    usage: { tokens_entree: 0, tokens_sortie: 0 },
  }
}
