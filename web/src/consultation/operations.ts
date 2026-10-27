// Opérations d'une consultation, du côté de l'initiateur et du contributeur.
import * as k from './chiffrement'
import { api, SERVEUR_PAR_DEFAUT } from './api'
import { enregistrerConsultation } from './stockage'
import { anonymiser } from './analyse'
import { MASQUAGE } from './libelles'
import { FORMATS, POSITIONS } from './types'
import type { ConsultationLocale, Questionnaire, RepereSimulation, Reponse } from './types'

export interface ParametresCreation {
  questionnaire: Omit<Questionnaire, 'version' | 'id' | 'cle_publique'>
  simulation?: RepereSimulation
  code?: string
  secondePhrase: boolean
  serveur?: string
}

export interface ResultatCreation {
  consultation: ConsultationLocale
  phrases: string[]
}

// Crée la consultation : clés et phrases de secours dans ce navigateur, boîtes chiffrées sur le serveur, tout le reste ici.
export async function creerConsultation(p: ParametresCreation): Promise<ResultatCreation> {
  const serveur = p.serveur ?? SERVEUR_PAR_DEFAUT
  const id = k.nouvelIdentifiant()
  const cle_lien = k.nouvelleCleLien()
  const jeton = k.nouveauJeton()
  const paire = await k.nouvellePaire()
  const questionnaire: Questionnaire = { ...p.questionnaire, version: 1, id, cle_publique: paire.publique }
  const phrases = [k.nouvellePhrase(), ...(p.secondePhrase ? [k.nouvellePhrase()] : [])]
  const contenu = { privee: paire.priveePkcs8, jeton, cle_lien }
  const secours = await Promise.all(phrases.map((ph) => k.scellerSecours(ph, id, contenu)))
  await api.creer(serveur, {
    id,
    code: p.code?.trim() || undefined,
    questionnaire: await k.chiffrerAvecCle(cle_lien, questionnaire, id),
    admin: await k.empreinte(jeton),
    cloture_le: questionnaire.cloture_le,
    conservation_jours: questionnaire.conservation_jours,
    secours,
    dossier: p.simulation ? await k.chiffrerPourInitiateur(paire.publique, { simulation: p.simulation }, `dossier:${id}`) : undefined,
  })
  const consultation: ConsultationLocale = {
    id,
    cree_le: new Date().toISOString(),
    serveur,
    questionnaire,
    cle_lien,
    jeton,
    privee: paire.privee,
    simulation: p.simulation,
  }
  await enregistrerConsultation(consultation)
  return { consultation, phrases }
}

// Lien à partager : la clé du lien est après le #, le navigateur ne l'envoie jamais au serveur.
export function lienDe(c: Pick<ConsultationLocale, 'id' | 'cle_lien'>, origine = window.location.origin): string {
  return `${origine}/participer#${c.id}.${c.cle_lien}`
}

export function lireLien(fragment: string): { id: string; cle: string } | null {
  const m = fragment.replace(/^#/, '').match(/^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/)
  return m ? { id: m[1], cle: m[2] } : null
}

// Contributeur : lit le questionnaire avec la clé du lien.
export async function ouvrirQuestionnaire(id: string, cle: string, serveur = SERVEUR_PAR_DEFAUT): Promise<{ questionnaire: Questionnaire; ouverte: boolean }> {
  const r = await api.questionnaire(serveur, id)
  const questionnaire = await k.dechiffrerAvecCle<Questionnaire>(cle, r.questionnaire, id)
  if (questionnaire.id !== id) throw new Error('questionnaire incohérent')
  return { questionnaire, ouverte: r.ouverte }
}

// Contributeur : chiffre sa réponse dans son navigateur, pour la seule clé de l'initiateur.
export async function envoyerReponse(q: Questionnaire, reponse: Reponse, serveur = SERVEUR_PAR_DEFAUT): Promise<void> {
  await api.repondre(serveur, q.id, await k.chiffrerPourInitiateur(q.cle_publique, reponse, q.id))
}

// Initiateur : relève toutes les boîtes et les ouvre ici. Une boîte illisible (abîmée ou étrangère) est comptée, pas gardée.
export async function releverReponses(c: ConsultationLocale): Promise<ConsultationLocale> {
  const boites = await api.relever(c.serveur, c.id, c.jeton)
  const lues = await Promise.allSettled(boites.map((b) => k.dechiffrerReponse<Reponse>(c.privee, b, c.id)))
  const reponses = melanger(lues.filter((x): x is PromiseFulfilledResult<Reponse> => x.status === 'fulfilled' && reponseValide(x.value, c.questionnaire)).map((x) => x.value))
  const etat = await api.compter(c.serveur, c.id, c.jeton)
  const memes = c.reponses?.length === reponses.length && !!c.lignes_anonymes
  // De nouvelles réponses changent la numérotation anonyme : l'ancienne synthèse ne correspond plus et doit être refaite.
  const anonymes = memes ? { lignes: c.lignes_anonymes!, cases_masquees: c.cases_masquees ?? 0 } : anonymiser(c.questionnaire, reponses, MASQUAGE[c.questionnaire.langue])
  const maj: ConsultationLocale = {
    ...c,
    reponses,
    illisibles: boites.length - reponses.length,
    releve_le: new Date().toISOString(),
    ferme: !etat.ouverte,
    lignes_anonymes: anonymes.lignes,
    cases_masquees: anonymes.cases_masquees,
    ...(memes ? {} : { synthese: undefined, rapport_html: undefined }),
  }
  await enregistrerConsultation(maj)
  return maj
}

// Toute personne qui a le lien peut chiffrer n'importe quoi pour la clé de l'organisation : chaque champ est donc contrôlé,
// et une réponse mal formée est écartée comme illisible au lieu de bloquer le relevé.
const estTexte = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
const facultatif = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || ok(v)

export function reponseValide(r: unknown, q: Questionnaire): r is Reponse {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false
  const x = r as Record<string, unknown>
  if (x.version !== 1 || !estTexte(x.envoyee_le, 20)) return false
  const cats = x.categories
  if (!cats || typeof cats !== 'object' || Array.isArray(cats)) return false
  for (const [k, v] of Object.entries(cats)) {
    const def = q.categories.find((c) => c.cle === k)
    if (!def || typeof v !== 'string' || (v !== '' && !def.options.includes(v))) return false
  }
  if (!facultatif(x.position, (v) => (POSITIONS as readonly unknown[]).includes(v))) return false
  if (!facultatif(x.engagement, (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4)) return false
  if (!facultatif(x.format, (v) => (FORMATS as readonly unknown[]).includes(v))) return false
  for (const champ of ['avis', 'freins', 'envie']) if (!facultatif(x[champ], (v) => estTexte(v, 4000))) return false
  const reps = x.reponses
  if (!reps || typeof reps !== 'object' || Array.isArray(reps)) return false
  for (const [k, v] of Object.entries(reps)) {
    const qu = q.questions.find((y) => y.id === k)
    if (!qu) return false
    const ok =
      qu.type === 'texte' ? estTexte(v, 4000)
      : qu.type === 'echelle' ? Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5
      : qu.type === 'choix' ? typeof v === 'string' && (qu.options ?? []).includes(v)
      : Array.isArray(v) && v.length <= (qu.options ?? []).length && v.every((y) => typeof y === 'string' && (qu.options ?? []).includes(y))
    if (!ok) return false
  }
  return true
}

// Les réponses sont gardées dans un ordre tiré au hasard : l'ordre d'arrivée ne dit rien de qui a répondu quand.
function melanger<T>(xs: T[]): T[] {
  const copie = [...xs]
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copie[i], copie[j]] = [copie[j], copie[i]]
  }
  return copie
}

// Récupère une consultation sur un autre appareil, ou après la perte de celui-ci, avec son code et une phrase de secours.
// Le serveur rend la copie sans pouvoir la lire : seule la phrase l'ouvre, ici.
export async function recupererConsultation(id: string, phrase: string, serveur = SERVEUR_PAR_DEFAUT): Promise<ConsultationLocale> {
  const r = await api.secours(serveur, id, await k.preuveSecours(phrase, id))
  const contenu = await k.ouvrirSecours(phrase, id, r.boite)
  const privee = await k.importerPrivee(contenu.privee)
  const { questionnaire } = await ouvrirQuestionnaire(id, contenu.cle_lien, serveur)
  let simulation: RepereSimulation | undefined
  if (r.dossier) {
    try {
      simulation = (await k.dechiffrerReponse<{ simulation: RepereSimulation }>(privee, r.dossier, `dossier:${id}`)).simulation
    } catch {
      simulation = undefined
    }
  }
  const c: ConsultationLocale = { id, cree_le: new Date().toISOString(), serveur, questionnaire, cle_lien: contenu.cle_lien, jeton: contenu.jeton, privee, simulation }
  await enregistrerConsultation(c)
  return releverReponses(c).catch(() => c)
}
