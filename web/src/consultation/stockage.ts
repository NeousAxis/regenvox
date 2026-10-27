// Consultations gardées sur l'appareil de l'initiateur (IndexedDB) : questionnaire, clés, réponses déchiffrées et rapport.
// La clé privée y est rangée comme clé non exportable : la page peut s'en servir, pas la copier.
import { MAGASIN_CONSULTATIONS, demanderPersistance, transaction } from '../stockage'
import type { ConsultationLocale } from './types'

export async function listerConsultations(): Promise<ConsultationLocale[]> {
  const liste = await transaction<ConsultationLocale[]>('readonly', (m) => m.getAll() as IDBRequest<ConsultationLocale[]>, MAGASIN_CONSULTATIONS)
  return liste.sort((a, b) => (a.cree_le < b.cree_le ? 1 : a.cree_le > b.cree_le ? -1 : 0))
}

export async function lireConsultation(id: string): Promise<ConsultationLocale | undefined> {
  return transaction<ConsultationLocale | undefined>('readonly', (m) => m.get(id) as IDBRequest<ConsultationLocale | undefined>, MAGASIN_CONSULTATIONS)
}

export async function enregistrerConsultation(c: ConsultationLocale): Promise<void> {
  demanderPersistance()
  await transaction('readwrite', (m) => m.put(c), MAGASIN_CONSULTATIONS)
}

export async function oublierConsultation(id: string): Promise<void> {
  await transaction('readwrite', (m) => m.delete(id), MAGASIN_CONSULTATIONS)
}
