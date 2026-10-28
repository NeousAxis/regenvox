// Ce que la consultation réelle reprend de la prospective simulée : les formulations testées, les catégories du panel,
// et les réactions pondérées du panel, pour comparer ensuite la réalité à la simulation.
import type { Projet } from '../moteur'
import { CLES_CATEGORIES, FORMATS, POSITION_SCORE, POSITIONS } from './types'
import type { Categorie, CleCategorie, Format, Position, RepereSimulation } from './types'

interface Squelette { id: string; age: number; tranche_age: string; sexe: string; nationalite: string; activite: string; menage: string; lieu_de_vie: string; poids: number }
interface Reaction { angle_id: number; position: Position; engagement: number }
interface PersonaSimule { id: string; reactions: Reaction[] }
interface Angle { id: number; formulation: string; origine: string }
interface SpecPanel {
  groupes?: { nom: string }[]
  tranches_age: { tranche: string; min: number; max: number }[]
  lieux_de_vie: { lieu: string }[]
}
interface Cas { enjeu: string; objectif: string; contexte_factuel: string[] }

export const MENAGES = ['vit chez ses parents', 'seul·e', 'en couple sans enfant', 'en couple avec enfants', 'parent seul avec enfants', 'en couple, enfants partis']
export const ACTIVITE_AGRICOLE = 'agriculteur·rice'
export const AUTRE = 'autre'

function lire<T>(p: Projet, chemin: string): T | undefined {
  const brut = p.fichiers[chemin]
  if (brut === undefined) return undefined
  try {
    return JSON.parse(brut) as T
  } catch {
    return undefined
  }
}

const valides = (p: Projet, etape: string) =>
  Object.keys(p.fichiers)
    .filter((k) => k.startsWith(`runs/${p.id}/validated/${etape}/`) && k.endsWith('.json'))
    .sort()

export function anglesDe(p: Projet): Angle[] {
  const f = lire<{ angles: Angle[] }>(p, `runs/${p.id}/validated/formulateur/main.json`)
  return f?.angles ?? []
}

export function angleRecommande(p: Projet): number | undefined {
  const k = valides(p, 'sociologue')[0]
  return k ? lire<{ angle_recommande?: { angle_id: number } }>(p, k)?.angle_recommande?.angle_id : undefined
}

function squelettes(p: Projet): Squelette[] {
  return lire<Squelette[]>(p, `runs/${p.id}/panel.json`) ?? []
}

function spec(p: Projet): SpecPanel | undefined {
  return lire<SpecPanel>(p, `cases/${p.id}/panel.json`)
}

// Le lieu dont parle la question par défaut : le village ou la ville selon la taille de la commune
// (une ville compte au moins 10 000 habitants, selon l'OFS, soit environ 8500 de 16 ans et plus), sinon le canton,
// la Suisse ou l'organisation elle-même.
export type Lieu = 'village' | 'ville' | 'canton' | 'suisse' | 'ecole' | 'entreprise' | 'organisation'
export function lieuDe(p: Projet): Lieu {
  const t = p.parametres.territoire
  if (t?.niveau === 'commune') {
    const adultes = lire<{ population_16_plus?: { valeur: number } }>(p, `cases/${p.id}/panel.json`)?.population_16_plus?.valeur ?? 0
    return adultes >= 8500 ? 'ville' : 'village'
  }
  if (t?.niveau === 'canton') return 'canton'
  if (t?.niveau === 'suisse') return 'suisse'
  const type = p.parametres.organisation.type
  return type === 'ecole' ? 'ecole' : type === 'entreprise' ? 'entreprise' : 'organisation'
}

// Une prospective terminée peut servir de base à une consultation réelle.
export function prospectiveExploitable(p: Projet): boolean {
  return p.etat === 'termine' && anglesDe(p).length > 0 && squelettes(p).length > 0 && valides(p, 'personas').length > 0 && !!spec(p)
}

// Valeur d'une personne simulée dans une catégorie, avec les mêmes libellés que les choix proposés aux contributeurs.
function valeur(s: Squelette, cle: CleCategorie, sp: SpecPanel): string {
  switch (cle) {
    case 'groupe':
      return s.tranche_age
    case 'tranche_age':
      return sp.tranches_age.find((t) => s.age >= t.min && s.age <= t.max)?.tranche ?? AUTRE
    case 'sexe':
      return s.sexe
    case 'nationalite':
      return s.nationalite
    case 'activite':
      return s.activite.startsWith('agriculteur') ? ACTIVITE_AGRICOLE : s.activite
    case 'menage':
      return s.menage
    case 'lieu_de_vie':
      return s.lieu_de_vie
  }
}

function uniques(xs: string[]): string[] {
  return [...new Set(xs)]
}

// Catégories proposées aux contributeurs : celles du panel simulé, dans le même ordre que les données publiques.
export function categoriesDe(p: Projet): Categorie[] {
  const sp = spec(p)
  const sk = squelettes(p)
  if (!sp || !sk.length) return []
  if (sp.groupes?.length) {
    return [
      { cle: 'groupe', options: sp.groupes.map((g) => g.nom) },
      { cle: 'sexe', options: ['femme', 'homme'] },
      { cle: 'nationalite', options: ['suisse', 'etrangere'] },
      { cle: 'menage', options: MENAGES },
    ]
  }
  const activites = uniques(sk.map((s) => valeur(s, 'activite', sp)))
  const ordreActivites = [
    'en formation (apprentissage ou études)',
    'jeune employé·e ou apprenti·e en fin de formation',
    ...activites.filter((a) => !/formation|retraité|agricult/.test(a)),
    ACTIVITE_AGRICOLE,
    'retraité·e',
  ].filter((a) => activites.includes(a))
  const lieux = uniques([...sp.lieux_de_vie.map((l) => l.lieu), ...sk.map((s) => s.lieu_de_vie)])
  return [
    { cle: 'tranche_age', options: sp.tranches_age.map((t) => t.tranche) },
    { cle: 'sexe', options: ['femme', 'homme'] },
    { cle: 'nationalite', options: ['suisse', 'etrangere'] },
    { cle: 'activite', options: [...ordreActivites, AUTRE] },
    { cle: 'menage', options: MENAGES },
    ...(lieux.length > 1 ? [{ cle: 'lieu_de_vie' as const, options: lieux }] : []),
  ]
}

function normaliser<K extends string>(poids: Partial<Record<K, number>>): Partial<Record<K, number>> {
  const total = Object.values<number | undefined>(poids).reduce<number>((a, b) => a + (b ?? 0), 0)
  if (total <= 0) return poids
  return Object.fromEntries(Object.entries(poids).map(([k, v]) => [k, (v as number) / total])) as Partial<Record<K, number>>
}

// Réactions du panel à la formulation choisie, pondérées comme la population.
export function repereSimulation(p: Projet, angleId: number): RepereSimulation {
  const sp = spec(p)!
  const sk = squelettes(p)
  const parId = new Map(sk.map((s) => [s.id, s]))
  const cas = lire<Cas>(p, `cases/${p.id}/case.json`)
  const angle = anglesDe(p).find((a) => a.id === angleId)
  const personas = valides(p, 'personas').map((k) => lire<PersonaSimule>(p, k)).filter((x): x is PersonaSimule => !!x)
  const mobilisations = valides(p, 'mobilisation').map((k) => lire<{ id: string; format_prefere: Format }>(p, k)).filter((x) => !!x)

  const positions: Partial<Record<Position, number>> = {}
  const engagement = [0, 0, 0, 0, 0]
  const scores: Partial<Record<CleCategorie, Record<string, { somme: number; poids: number }>>> = {}
  const cles = categoriesDe(p).map((c) => c.cle)
  for (const pe of personas) {
    const s = parId.get(pe.id)
    const r = pe.reactions.find((x) => x.angle_id === angleId)
    if (!s || !r) continue
    positions[r.position] = (positions[r.position] ?? 0) + s.poids
    engagement[Math.max(0, Math.min(4, Math.round(r.engagement)))] += s.poids
    for (const cle of cles) {
      const v = valeur(s, cle, sp)
      const parCle = (scores[cle] ??= {})
      const acc = (parCle[v] ??= { somme: 0, poids: 0 })
      acc.somme += POSITION_SCORE[r.position] * s.poids
      acc.poids += s.poids
    }
  }
  const totalEng = engagement.reduce((a, b) => a + b, 0) || 1

  const formats: Partial<Record<Format, number>> = {}
  for (const m of mobilisations) {
    const s = parId.get(m!.id)
    if (s && (FORMATS as readonly string[]).includes(m!.format_prefere)) formats[m!.format_prefere] = (formats[m!.format_prefere] ?? 0) + s.poids
  }

  const population: RepereSimulation['population'] = {}
  for (const cle of CLES_CATEGORIES) {
    if (!cles.includes(cle)) continue
    const parts: Record<string, number> = {}
    for (const s of sk) {
      const v = valeur(s, cle, sp)
      parts[v] = (parts[v] ?? 0) + s.poids
    }
    population[cle] = normaliser(parts) as Record<string, number>
  }

  const score_par_categorie: RepereSimulation['score_par_categorie'] = {}
  for (const [cle, parValeur] of Object.entries(scores) as [CleCategorie, Record<string, { somme: number; poids: number }>][]) {
    score_par_categorie[cle] = Object.fromEntries(Object.entries(parValeur).map(([v, a]) => [v, a.poids ? a.somme / a.poids : 0]))
  }

  const pos = normaliser(positions)
  return {
    projet_id: p.id,
    angle_id: angleId,
    formulation: angle?.formulation ?? p.parametres.demarche.formulation,
    enjeu: cas?.enjeu ?? p.parametres.demarche.enjeu,
    objectif: cas?.objectif ?? p.parametres.demarche.objectif,
    contexte: cas?.contexte_factuel ?? [],
    positions: Object.fromEntries(POSITIONS.map((x) => [x, pos[x] ?? 0])) as Record<Position, number>,
    engagement: engagement.map((x) => x / totalEng),
    formats: normaliser(formats),
    population,
    score_par_categorie,
    taille_panel: personas.length,
  }
}
