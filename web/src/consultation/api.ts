// Client du serveur de collecte (web/public/api/consultation.php). Rien de lisible n'y part : seulement des boîtes chiffrées,
// l'empreinte du jeton d'administration et celle de la preuve de la phrase de secours.
import type { Boite, BoitePublique, CopieSecours } from './chiffrement'

export const SERVEUR_PAR_DEFAUT: string = import.meta.env?.VITE_API_CONSULTATION || '/api/consultation.php'

export class ErreurServeur extends Error {
  code: string
  statut: number
  constructor(statut: number, code: string) {
    super(code)
    this.name = 'ErreurServeur'
    this.statut = statut
    this.code = code
  }
}

async function appeler<T>(serveur: string, action: string, corps?: unknown, parametres: Record<string, string> = {}): Promise<T> {
  const url = `${serveur}?${new URLSearchParams({ action, ...parametres })}`
  let r: Response
  try {
    r = await fetch(url, corps === undefined
      ? { method: 'GET', cache: 'no-store', credentials: 'omit' }
      : { method: 'POST', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  } catch {
    throw new ErreurServeur(0, 'reseau')
  }
  let v: { ok?: boolean; erreur?: string } & Record<string, unknown>
  try {
    v = await r.json()
  } catch {
    throw new ErreurServeur(r.status, 'reponse_illisible')
  }
  if (!r.ok || !v.ok) throw new ErreurServeur(r.status, typeof v.erreur === 'string' ? v.erreur : 'inconnue')
  return v as T
}

export interface Creation {
  id: string
  code?: string
  questionnaire: Boite
  admin: string
  cloture_le: string
  conservation_jours: number
  secours: CopieSecours[]
  dossier?: BoitePublique
}

export const api = {
  creer: (serveur: string, c: Creation) => appeler<{ ok: true }>(serveur, 'creer', c),
  questionnaire: (serveur: string, id: string) =>
    appeler<{ questionnaire: Boite; ouverte: boolean; cloture_le: string }>(serveur, 'questionnaire', undefined, { id }),
  repondre: (serveur: string, id: string, boite: BoitePublique) => appeler<{ ok: true }>(serveur, 'repondre', { id, boite }),
  compter: (serveur: string, id: string, jeton: string) =>
    appeler<{ nombre: number; ouverte: boolean; ferme: boolean; cloture_le: string }>(serveur, 'compter', { id, jeton }),
  async relever(serveur: string, id: string, jeton: string): Promise<BoitePublique[]> {
    const tout: BoitePublique[] = []
    let apres = ''
    for (let page = 0; page < 100; page++) {
      const r = await appeler<{ boites: BoitePublique[]; suite: string | null }>(serveur, 'relever', { id, jeton, apres })
      tout.push(...r.boites)
      if (!r.suite) break
      apres = r.suite
    }
    return tout
  },
  fermer: (serveur: string, id: string, jeton: string) => appeler<{ ok: true }>(serveur, 'fermer', { id, jeton }),
  supprimer: (serveur: string, id: string, jeton: string) => appeler<{ ok: true }>(serveur, 'supprimer', { id, jeton }),
  secours: (serveur: string, id: string, preuve: string) => appeler<{ boite: Boite; dossier: BoitePublique | null }>(serveur, 'secours', { id, preuve }),
}
