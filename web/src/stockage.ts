// Stockage local des projets RegenVox : tout reste sur l'appareil de l'utilisateur.
// IndexedDB pour les projets, fichier .regenvox.json pour les enregistrer où l'on veut,
// localStorage pour la clé API (seulement si l'utilisateur le demande),
// sessionStorage pour le brouillon du formulaire.
import type { CleApi, EtatEtape, Fournisseur, Groupe, ParametresTest, Projet, Territoire, TypeOrganisation } from './moteur'

const NOM_BASE = 'regenvox'
const VERSION_BASE = 1
const MAGASIN = 'projets'

export class ErreurStockage extends Error {
  constructor(message = 'stockage indisponible') {
    super(message)
    this.name = 'ErreurStockage'
  }
}

let basePromise: Promise<IDBDatabase> | null = null

function ouvrirBase(): Promise<IDBDatabase> {
  if (!basePromise) {
    basePromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new ErreurStockage())
        return
      }
      let requete: IDBOpenDBRequest
      try {
        requete = indexedDB.open(NOM_BASE, VERSION_BASE)
      } catch {
        reject(new ErreurStockage())
        return
      }
      requete.onupgradeneeded = () => {
        const db = requete.result
        if (!db.objectStoreNames.contains(MAGASIN)) {
          db.createObjectStore(MAGASIN, { keyPath: 'id' })
        }
      }
      requete.onsuccess = () => {
        const db = requete.result
        // Si une autre version de la page met la base à jour, on libère la connexion.
        db.onversionchange = () => {
          db.close()
          basePromise = null
        }
        resolve(db)
      }
      requete.onerror = () => reject(new ErreurStockage(requete.error?.message))
      requete.onblocked = () => reject(new ErreurStockage('base bloquée par un autre onglet'))
    })
    basePromise.catch(() => {
      basePromise = null
    })
  }
  return basePromise
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (magasin: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await ouvrirBase()
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(MAGASIN, mode)
    } catch (e) {
      reject(new ErreurStockage(e instanceof Error ? e.message : undefined))
      return
    }
    const requete = action(tx.objectStore(MAGASIN))
    tx.oncomplete = () => resolve(requete.result)
    tx.onerror = () => reject(new ErreurStockage(tx.error?.message))
    tx.onabort = () => reject(new ErreurStockage(tx.error?.message ?? 'transaction annulée'))
  })
}

let persistanceDemandee = false

// Demande au navigateur de ne pas effacer les projets quand l'espace disque manque.
function demanderPersistance(): void {
  if (persistanceDemandee) return
  persistanceDemandee = true
  try {
    void navigator.storage?.persist?.().catch(() => undefined)
  } catch {
    // Sans conséquence : le stockage reste utilisable.
  }
}

export async function listerProjets(): Promise<Projet[]> {
  const projets = await transaction<Projet[]>('readonly', (m) => m.getAll() as IDBRequest<Projet[]>)
  return projets.sort((a, b) => (a.cree_le < b.cree_le ? 1 : a.cree_le > b.cree_le ? -1 : 0))
}

export async function lireProjet(id: string): Promise<Projet | undefined> {
  return transaction<Projet | undefined>('readonly', (m) => m.get(id) as IDBRequest<Projet | undefined>)
}

export async function enregistrerProjet(projet: Projet): Promise<void> {
  demanderPersistance()
  await transaction('readwrite', (m) => m.put(projet))
}

export async function supprimerProjet(id: string): Promise<void> {
  await transaction('readwrite', (m) => m.delete(id))
}

// Fichiers .regenvox.json

function enSlug(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function nomFichier(projet: Projet): string {
  const slug = enSlug(projet.parametres.organisation.nom) || 'regenvox'
  const date = /^\d{4}-\d{2}-\d{2}/.test(projet.cree_le)
    ? projet.cree_le.slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  return `${slug}_${date}.regenvox.json`
}

export function telechargerProjet(projet: Projet): void {
  const contenu = JSON.stringify(projet, null, 2)
  const blob = new Blob([contenu], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nomFichier(projet)
  lien.rel = 'noopener'
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export type CodeErreurImport = 'illisible' | 'format' | 'version' | 'trop_gros'

export class ErreurImport extends Error {
  code: CodeErreurImport
  constructor(code: CodeErreurImport) {
    super(code)
    this.name = 'ErreurImport'
    this.code = code
  }
}

const TAILLE_MAX_FICHIER = 100 * 1024 * 1024
const TYPES_ORGANISATION: TypeOrganisation[] = ['commune', 'administration', 'ecole', 'entreprise', 'ong']
const ETATS_PROJET: Projet['etat'][] = ['en_cours', 'termine', 'erreur', 'interrompu']
const ETATS_ETAPE: EtatEtape[] = ['a_faire', 'en_cours', 'fait', 'erreur']

type Brut = Record<string, unknown>

function estObjet(v: unknown): v is Brut {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function texte(v: unknown, max = 100_000): string {
  if (typeof v !== 'string' || v.length > max) throw new ErreurImport('format')
  return v
}

function nombre(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ErreurImport('format')
  return v
}

function validerTerritoire(v: unknown): Territoire {
  if (!estObjet(v)) throw new ErreurImport('format')
  const niveau = v.niveau
  if (niveau !== 'commune' && niveau !== 'canton' && niveau !== 'suisse') throw new ErreurImport('format')
  const t: Territoire = { niveau }
  if (v.commune_num !== undefined) t.commune_num = nombre(v.commune_num)
  if (v.canton !== undefined) t.canton = texte(v.canton, 10)
  return t
}

function validerGroupe(v: unknown): Groupe {
  if (!estObjet(v)) throw new ErreurImport('format')
  return {
    nom: texte(v.nom, 500),
    effectif: nombre(v.effectif),
    age_min: nombre(v.age_min),
    age_max: nombre(v.age_max),
  }
}

function validerParametres(v: unknown): ParametresTest {
  if (!estObjet(v) || !estObjet(v.organisation) || !estObjet(v.demarche)) throw new ErreurImport('format')
  const langue = v.langue === 'en' ? 'en' : 'fr'
  const type = v.organisation.type
  if (!TYPES_ORGANISATION.includes(type as TypeOrganisation)) throw new ErreurImport('format')
  const d = v.demarche
  if (!Array.isArray(d.formats)) throw new ErreurImport('format')
  const p: ParametresTest = {
    langue,
    organisation: { type: type as TypeOrganisation, nom: texte(v.organisation.nom, 500) },
    demarche: {
      enjeu: texte(d.enjeu),
      objectif: texte(d.objectif),
      formulation: texte(d.formulation),
      formats: d.formats.map((f) => texte(f, 100)),
      horizon_mois: nombre(d.horizon_mois),
    },
  }
  if (v.territoire !== undefined) p.territoire = validerTerritoire(v.territoire)
  if (v.groupes !== undefined) {
    if (!Array.isArray(v.groupes)) throw new ErreurImport('format')
    p.groupes = v.groupes.map(validerGroupe)
  }
  return p
}

// Contrôle la forme d'un projet lu dans un fichier et n'en garde que les champs connus.
export function validerProjet(v: unknown): Projet {
  if (!estObjet(v)) throw new ErreurImport('format')
  if (v.version !== 1) throw new ErreurImport(typeof v.version === 'number' ? 'version' : 'format')
  const id = texte(v.id, 200)
  if (!id.trim()) throw new ErreurImport('format')
  const etat = v.etat as Projet['etat']
  if (!ETATS_PROJET.includes(etat)) throw new ErreurImport('format')
  if (!Array.isArray(v.etapes) || !estObjet(v.fichiers)) throw new ErreurImport('format')

  const fichiers: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(v.fichiers)) {
    fichiers[cle] = texte(valeur, TAILLE_MAX_FICHIER)
  }

  const projet: Projet = {
    version: 1,
    id,
    cree_le: texte(v.cree_le, 100),
    parametres: validerParametres(v.parametres),
    etat,
    etapes: v.etapes.map((e) => {
      if (!estObjet(e) || !ETATS_ETAPE.includes(e.etat as EtatEtape)) throw new ErreurImport('format')
      return { cle: texte(e.cle, 200), libelle: texte(e.libelle, 500), etat: e.etat as EtatEtape }
    }),
    fichiers,
  }
  if (v.erreur !== undefined) projet.erreur = texte(v.erreur)
  if (v.rapport_html !== undefined) projet.rapport_html = texte(v.rapport_html, TAILLE_MAX_FICHIER)
  if (estObjet(v.usage)) {
    projet.usage = { tokens_entree: nombre(v.usage.tokens_entree), tokens_sortie: nombre(v.usage.tokens_sortie) }
  }
  return projet
}

export async function lireFichierProjet(fichier: File): Promise<Projet> {
  if (fichier.size > TAILLE_MAX_FICHIER) throw new ErreurImport('trop_gros')
  let donnees: unknown
  try {
    donnees = JSON.parse(await fichier.text())
  } catch {
    throw new ErreurImport('illisible')
  }
  const projet = validerProjet(donnees)
  // Un projet importé ne tourne nulle part : s'il était en cours, il est interrompu.
  if (projet.etat === 'en_cours') projet.etat = 'interrompu'
  return projet
}

// Clé API mémorisée sur l'appareil (uniquement si l'utilisateur l'a demandé)

const CLE_MEMORISEE = 'regenvox.cle'

export function lireCleMemorisee(): CleApi | null {
  try {
    const brut = window.localStorage.getItem(CLE_MEMORISEE)
    if (!brut) return null
    const v: unknown = JSON.parse(brut)
    if (!estObjet(v) || typeof v.cle !== 'string' || !v.cle) return null
    if (v.fournisseur !== 'anthropic' && v.fournisseur !== 'mistral' && v.fournisseur !== 'openai' && v.fournisseur !== 'autre') return null
    const cle: CleApi = { fournisseur: v.fournisseur as Fournisseur, cle: v.cle }
    if (typeof v.adresse === 'string') cle.adresse = v.adresse
    if (estObjet(v.modeles) && typeof v.modeles.rapide === 'string' && typeof v.modeles.analyse === 'string') cle.modeles = { rapide: v.modeles.rapide, analyse: v.modeles.analyse }
    return cle
  } catch {
    return null
  }
}

export function memoriserCle(cle: CleApi): void {
  try {
    window.localStorage.setItem(CLE_MEMORISEE, JSON.stringify({ fournisseur: cle.fournisseur, cle: cle.cle, adresse: cle.adresse, modeles: cle.modeles }))
  } catch {
    // Stockage refusé (navigation privée) : la clé reste seulement en mémoire.
  }
}

export function oublierCle(): void {
  try {
    window.localStorage.removeItem(CLE_MEMORISEE)
  } catch {
    // Rien à faire.
  }
}

// Brouillon du formulaire (jamais la clé), effacé à la fermeture de l'onglet

const BROUILLON = 'regenvox.brouillon'

export function lireBrouillon<T>(): T | null {
  try {
    const brut = window.sessionStorage.getItem(BROUILLON)
    return brut ? (JSON.parse(brut) as T) : null
  } catch {
    return null
  }
}

export function enregistrerBrouillon(valeur: unknown): void {
  try {
    window.sessionStorage.setItem(BROUILLON, JSON.stringify(valeur))
  } catch {
    // Sans conséquence.
  }
}

export function effacerBrouillon(): void {
  try {
    window.sessionStorage.removeItem(BROUILLON)
  } catch {
    // Sans conséquence.
  }
}
