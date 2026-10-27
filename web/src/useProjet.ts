import { useEffect, useState } from 'react'
import type { Projet } from './moteur'
import { lireProjet } from './stockage'
import { abonner, enCoursIci, projetActif } from './execution'

// Charge un projet : celui qui tourne dans cet onglet, sinon celui du stockage local.
export function useProjet(id: string) {
  const [projet, setProjet] = useState<Projet | null | undefined>(() => projetActif(id))
  const [actif, setActif] = useState(() => enCoursIci(id))
  const [stockageEchec, setStockageEchec] = useState(false)

  useEffect(() => {
    let annule = false
    const enMemoire = projetActif(id)
    if (enMemoire) {
      setProjet(enMemoire)
      setActif(true)
    } else {
      setActif(false)
      lireProjet(id)
        .then((p) => {
          if (!annule) setProjet(p ?? null)
        })
        .catch(() => {
          if (!annule) {
            setStockageEchec(true)
            setProjet(null)
          }
        })
    }
    const desabonner = abonner(id, (p, a) => {
      setProjet(p)
      setActif(a)
    })
    return () => {
      annule = true
      desabonner()
    }
  }, [id])

  return { projet, setProjet, actif, stockageEchec }
}
