// Exécution des tests dans cet onglet. Le moteur tourne ici, dans le navigateur :
// tant qu'un test tourne, l'onglet doit rester ouvert. Le projet est enregistré
// localement à chaque changement, ce qui permet de le reprendre s'il est interrompu.
import { moteur } from './moteur'
import type { CleApi, Projet } from './moteur'
import { enregistrerProjet, lireCleMemorisee } from './stockage'

type Ecouteur = (projet: Projet, actif: boolean) => void

interface Execution {
  projet: Projet
  controleur: AbortController
}

const executions = new Map<string, Execution>()
const ecouteurs = new Map<string, Set<Ecouteur>>()

// Clé gardée en mémoire le temps de l'onglet, jamais écrite sans l'accord de l'utilisateur.
let cleSession: CleApi | null = null

export function retenirCle(cle: CleApi): void {
  cleSession = cle
}

export function cleDisponible(): CleApi | null {
  return cleSession ?? lireCleMemorisee()
}

function cloner(p: Projet): Projet {
  return typeof structuredClone === 'function' ? structuredClone(p) : (JSON.parse(JSON.stringify(p)) as Projet)
}

function notifier(id: string, projet: Projet, actif: boolean): void {
  ecouteurs.get(id)?.forEach((fn) => {
    try {
      fn(projet, actif)
    } catch (e) {
      console.error(e)
    }
  })
}

export function abonner(id: string, fn: Ecouteur): () => void {
  let ensemble = ecouteurs.get(id)
  if (!ensemble) {
    ensemble = new Set()
    ecouteurs.set(id, ensemble)
  }
  ensemble.add(fn)
  return () => {
    ensemble.delete(fn)
    if (ensemble.size === 0) ecouteurs.delete(id)
  }
}

export function enCoursIci(id: string): boolean {
  return executions.has(id)
}

export function projetActif(id: string): Projet | undefined {
  return executions.get(id)?.projet
}

// Les sauvegardes sont faites l'une après l'autre, dans l'ordre.
let fileSauvegarde: Promise<void> = Promise.resolve()
let derniereErreurSauvegarde: unknown = null

function sauver(projet: Projet): Promise<void> {
  fileSauvegarde = fileSauvegarde
    .then(() => enregistrerProjet(projet))
    .then(() => {
      derniereErreurSauvegarde = null
    })
    .catch((e: unknown) => {
      derniereErreurSauvegarde = e
      console.error('Sauvegarde locale impossible', e)
    })
  return fileSauvegarde
}

export function sauvegardeEnEchec(): boolean {
  return derniereErreurSauvegarde !== null
}

// Avertit avant de quitter la page tant qu'un test tourne.
function surDepart(e: BeforeUnloadEvent): void {
  e.preventDefault()
  e.returnValue = ''
}

function majAvertissementDepart(): void {
  window.removeEventListener('beforeunload', surDepart)
  if (executions.size > 0) window.addEventListener('beforeunload', surDepart)
}

const nomVerrou = (id: string) => `regenvox-test-${id}`

function verrousDisponibles(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.locks && typeof navigator.locks.request === 'function'
}

// Vrai si le test tourne dans un autre onglet de ce navigateur.
export async function enCoursAilleurs(id: string): Promise<boolean> {
  if (executions.has(id) || !verrousDisponibles()) return false
  try {
    const etat = await navigator.locks.query()
    return (etat.held ?? []).some((v) => v.name === nomVerrou(id))
  } catch {
    return false
  }
}

function messageErreur(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  return 'erreur inconnue'
}

export type ResultatLancement = 'lance' | 'deja_en_cours' | 'ailleurs'

// Lance ou reprend un test. La promesse se résout dès que le test a démarré.
export function lancer(projet: Projet, cle: CleApi): Promise<ResultatLancement> {
  const id = projet.id
  if (executions.has(id)) return Promise.resolve('deja_en_cours')

  const execution: Execution = {
    projet: { ...cloner(projet), etat: 'en_cours', erreur: undefined },
    controleur: new AbortController(),
  }
  executions.set(id, execution)

  const tourner = async () => {
    majAvertissementDepart()
    notifier(id, execution.projet, true)
    try {
      const fin = await moteur.executer(
        cloner(projet),
        cle,
        (p) => {
          const copie = cloner(p)
          execution.projet = copie
          void sauver(copie)
          notifier(id, copie, true)
        },
        execution.controleur.signal,
      )
      execution.projet = cloner(fin)
    } catch (e) {
      const abandon = execution.controleur.signal.aborted
      execution.projet = {
        ...execution.projet,
        etat: abandon ? 'interrompu' : 'erreur',
        erreur: abandon ? undefined : messageErreur(e),
        etapes: execution.projet.etapes.map((etape) =>
          etape.etat === 'en_cours' ? { ...etape, etat: abandon ? 'a_faire' : 'erreur' } : etape,
        ),
      }
    }
    if (execution.projet.etat === 'en_cours') {
      execution.projet = { ...execution.projet, etat: 'interrompu' }
    }
    executions.delete(id)
    majAvertissementDepart()
    await sauver(execution.projet)
    notifier(id, execution.projet, false)
  }

  if (!verrousDisponibles()) {
    void tourner()
    return Promise.resolve('lance')
  }

  // Le verrou empêche de lancer deux fois le même test dans deux onglets (et de payer deux fois).
  return new Promise<ResultatLancement>((resolve) => {
    navigator.locks
      .request(nomVerrou(id), { ifAvailable: true }, async (verrou) => {
        if (!verrou) {
          executions.delete(id)
          resolve('ailleurs')
          return
        }
        resolve('lance')
        await tourner()
      })
      .catch((e: unknown) => {
        console.error(e)
        if (executions.get(id) === execution && execution.projet.etat === 'en_cours') {
          // Le verrou a échoué avant le démarrage : on lance sans verrou.
          resolve('lance')
          void tourner()
        }
      })
  })
}

export function interrompre(id: string): void {
  executions.get(id)?.controleur.abort()
}
