// Calculs sur les vraies réponses, faits dans le navigateur de l'initiateur après déchiffrement :
// comptages, comparaison avec la simulation, et données brutes rendues anonymes avant tout partage ou envoi à une IA.
import { ENGAGEMENTS, FORMATS, POSITION_SCORE, POSITIONS } from './types'
import type { CleCategorie, Format, Position, Questionnaire, RepereSimulation, Reponse, TypeQuestion } from './types'

// Aucun groupe de moins de 5 personnes n'apparaît dans un document partagé.
export const SEUIL_ANONYMAT = 5
export const MASQUE = '•'

// Retire des textes libres ce qui permettrait de joindre quelqu'un : adresses électroniques, liens, numéros de téléphone.
export function masquerCoordonnees(texte: string, libelles = { adresse: '[adresse masquée]', lien: '[lien masqué]', numero: '[numéro masqué]' }): string {
  return texte
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, libelles.adresse)
    .replace(/\b(https?:\/\/|www\.)\S+/gi, libelles.lien)
    .replace(/(\+|\b00)?\d[\d\s./-]{6,}\d/g, (m) => ((m.match(/\d/g) ?? []).length >= 9 ? libelles.numero : m))
}

const moyenne = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export interface LigneComptage { option: string; n: number; part: number; part_reference?: number }
export interface CategorieAnalysee { cle: CleCategorie; lignes: LigneComptage[]; sans_reponse: number }
export interface ScoreCategorie { cle: CleCategorie; lignes: { option: string; n: number; reel: number | null; simule: number | null }[] }
export interface QuestionAnalysee {
  id: string
  type: TypeQuestion
  intitule: string
  n: number
  options?: LigneComptage[]
  distribution?: number[]
  moyenne?: number
}
export interface Analyse {
  n: number
  categories: CategorieAnalysee[]
  n_position: number
  positions: (LigneComptage & { option: Position })[]
  score_reel: number | null
  score_simule: number | null
  n_engagement: number
  engagement: LigneComptage[]
  n_format: number
  formats: (LigneComptage & { option: Format })[]
  scores: ScoreCategorie[]
  questions: QuestionAnalysee[]
}

function compter(valeurs: string[], options: readonly string[], reference?: Record<string, number>): LigneComptage[] {
  const total = valeurs.length
  return options.map((option) => {
    const n = valeurs.filter((v) => v === option).length
    return { option, n, part: total ? n / total : 0, part_reference: reference?.[option] }
  })
}

export function analyser(q: Questionnaire, reponses: Reponse[], sim?: RepereSimulation): Analyse {
  const categories: CategorieAnalysee[] = q.categories.map((c) => {
    const donnees = reponses.map((r) => r.categories[c.cle] ?? '').filter((v) => v !== '')
    return { cle: c.cle, lignes: compter(donnees, c.options, sim?.population[c.cle]), sans_reponse: reponses.length - donnees.length }
  })

  const avecPosition = reponses.filter((r) => r.position && POSITIONS.includes(r.position))
  const positions = compter(avecPosition.map((r) => r.position!), POSITIONS, sim?.positions) as Analyse['positions']
  const avecEngagement = reponses.filter((r) => typeof r.engagement === 'number' && r.engagement >= 0 && r.engagement <= 4)
  const engagement = compter(avecEngagement.map((r) => String(r.engagement)), ENGAGEMENTS.map(String), sim ? Object.fromEntries(sim.engagement.map((x, i) => [String(i), x])) : undefined)
  const avecFormat = reponses.filter((r) => r.format && FORMATS.includes(r.format))
  const formats = compter(avecFormat.map((r) => r.format!), FORMATS, sim?.formats as Record<string, number> | undefined) as Analyse['formats']

  const scores: ScoreCategorie[] = q.categories.map((c) => ({
    cle: c.cle,
    lignes: c.options.map((option) => {
      const groupe = avecPosition.filter((r) => r.categories[c.cle] === option)
      return {
        option,
        n: groupe.length,
        reel: groupe.length >= SEUIL_ANONYMAT ? moyenne(groupe.map((r) => POSITION_SCORE[r.position!])) : null,
        simule: sim?.score_par_categorie[c.cle]?.[option] ?? null,
      }
    }),
  }))

  const questions: QuestionAnalysee[] = q.questions.map((qu) => {
    const valeurs = reponses.map((r) => r.reponses[qu.id]).filter((v) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    const base: QuestionAnalysee = { id: qu.id, type: qu.type, intitule: qu.intitule, n: valeurs.length }
    if (qu.type === 'choix' || qu.type === 'choix_multiples') {
      const plats = valeurs.flatMap((v) => (Array.isArray(v) ? v : [String(v)]))
      // Pour les choix multiples, la part se calcule sur les personnes qui ont répondu, pas sur le nombre de cases cochées.
      base.options = (qu.options ?? []).map((option) => {
        const n = plats.filter((v) => v === option).length
        return { option, n, part: valeurs.length ? n / valeurs.length : 0 }
      })
    } else if (qu.type === 'echelle') {
      const notes = valeurs.map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 5)
      base.distribution = [1, 2, 3, 4, 5].map((x) => notes.filter((y) => y === x).length)
      base.moyenne = notes.length ? moyenne(notes) : undefined
    }
    return base
  })

  const scoreSimule = sim ? POSITIONS.reduce((s, p) => s + POSITION_SCORE[p] * (sim.positions[p] ?? 0), 0) : null
  return {
    n: reponses.length,
    categories,
    n_position: avecPosition.length,
    positions,
    score_reel: avecPosition.length ? moyenne(avecPosition.map((r) => POSITION_SCORE[r.position!])) : null,
    score_simule: scoreSimule,
    n_engagement: avecEngagement.length,
    engagement,
    n_format: avecFormat.length,
    formats,
    scores,
    questions,
  }
}

// Données brutes rendues anonymes : chaque combinaison de catégories doit être partagée par au moins 5 personnes.
// Sinon, la catégorie la plus détaillée est masquée pour les personnes concernées, jusqu'à ce que la règle soit tenue.
// Les lignes sont mélangées : leur ordre ne dit rien de l'ordre d'arrivée.
export interface LigneAnonyme {
  numero: string
  categories: Partial<Record<CleCategorie, string>>
  position?: Position
  engagement?: number
  format?: Format
  avis?: string
  freins?: string
  envie?: string
  reponses: Record<string, string>
}

export function anonymiser(q: Questionnaire, reponses: Reponse[], masquage?: Parameters<typeof masquerCoordonnees>[1]): { lignes: LigneAnonyme[]; cases_masquees: number } {
  const cles = q.categories.map((c) => c.cle)
  const tableau = reponses.map((r) => Object.fromEntries(cles.map((k) => [k, r.categories[k] ?? ''])) as Record<CleCategorie, string>)
  let masquees = 0
  const masquer = (i: number, k: CleCategorie) => {
    if (tableau[i][k] !== MASQUE) {
      tableau[i][k] = MASQUE
      masquees++
    }
  }

  if (reponses.length < SEUIL_ANONYMAT) {
    tableau.forEach((_, i) => cles.forEach((k) => masquer(i, k)))
  } else {
    // 1. Une valeur portée par moins de 5 personnes est masquée.
    for (const k of cles) {
      const effectifs = new Map<string, number>()
      tableau.forEach((l) => effectifs.set(l[k], (effectifs.get(l[k]) ?? 0) + 1))
      tableau.forEach((l, i) => {
        if ((effectifs.get(l[k]) ?? 0) < SEUIL_ANONYMAT) masquer(i, k)
      })
    }
    // 2. Puis les combinaisons trop rares.
    for (let tour = 0; tour < cles.length * 4; tour++) {
      const combinaisons = new Map<string, number[]>()
      tableau.forEach((l, i) => {
        const c = cles.map((k) => l[k]).join('\u0000')
        combinaisons.set(c, [...(combinaisons.get(c) ?? []), i])
      })
      const rares = [...combinaisons.values()].filter((idx) => idx.length < SEUIL_ANONYMAT).flat()
      if (!rares.length) break
      // On masque la catégorie qui a le plus de valeurs différentes parmi les personnes concernées.
      const diversite = (k: CleCategorie) => new Set(rares.map((i) => tableau[i][k]).filter((v) => v !== MASQUE)).size
      const k = [...cles].sort((a, b) => diversite(b) - diversite(a))[0]
      if (!k || diversite(k) === 0) {
        rares.forEach((i) => cles.forEach((kk) => masquer(i, kk)))
        break
      }
      rares.forEach((i) => masquer(i, k))
    }
  }

  const ordre = reponses.map((_, i) => i)
  for (let i = ordre.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ordre[i], ordre[j]] = [ordre[j], ordre[i]]
  }
  const largeur = String(reponses.length).length
  const texte = (s?: string) => (s ? masquerCoordonnees(s.trim(), masquage) : undefined)
  const lignes = ordre.map((i, rang) => {
    const r = reponses[i]
    return {
      numero: `R${String(rang + 1).padStart(Math.max(3, largeur), '0')}`,
      categories: tableau[i],
      position: r.position,
      engagement: r.engagement,
      format: r.format,
      avis: texte(r.avis),
      freins: texte(r.freins),
      envie: texte(r.envie),
      reponses: Object.fromEntries(
        q.questions.map((qu) => {
          const v = r.reponses[qu.id]
          return [qu.id, v === undefined ? '' : Array.isArray(v) ? v.join(' | ') : typeof v === 'string' ? masquerCoordonnees(v.trim(), masquage) : String(v)]
        }),
      ),
    }
  })
  return { lignes, cases_masquees: masquees }
}

// Fichier CSV des données anonymes (séparateur point-virgule et BOM, pour l'ouvrir directement dans un tableur).
export function versCsv(entetes: string[], lignes: string[][]): string {
  const cellule = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
  return '﻿' + [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n') + '\r\n'
}
