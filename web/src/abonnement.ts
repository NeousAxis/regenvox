// Abonnement payé en ligne : formules en vente, code tiré au sort dans le navigateur, passage au paiement Stripe.
// Le code ne quitte jamais cet appareil : Stripe ne reçoit que son empreinte (client_reference_id), que le serveur
// transforme en abonnement quand le paiement est confirmé (web/public/api/stripe.php).
import { SERVEUR_PAR_DEFAUT } from './consultation/api'

export const SERVEUR_STRIPE: string = import.meta.env.VITE_API_STRIPE || SERVEUR_PAR_DEFAUT.replace(/consultation\.php$/, 'stripe.php')

export interface Formule {
  id: string
  nom: string
  prix: string
  detail: string
  lien: string
  plafond_usd: number
  periode: 'mois' | 'total'
  approfondi: boolean
}

export async function lireFormules(): Promise<{ ouvert: boolean; formules: Formule[] }> {
  const r = await fetch(`${SERVEUR_STRIPE}?action=formules`, { cache: 'no-store' })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new Error('formules')
  return { ouvert: !!j.ouvert, formules: Array.isArray(j.formules) ? j.formules : [] }
}

// Même alphabet que scripts/code_consultation.ts : sans 0, 1, I, L, O, U, rien à confondre en le recopiant.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

export function nouveauCode(): string {
  const sortie: string[] = []
  const octets = new Uint8Array(1)
  // Tirage sans biais : on écarte les octets au-delà du dernier multiple de 30.
  while (sortie.length < 16) {
    crypto.getRandomValues(octets)
    if (octets[0] < 240) sortie.push(ALPHABET[octets[0] % ALPHABET.length])
  }
  return sortie.join('')
}

export const codeLisible = (code: string) => (code.replace(/\s+/g, '').toUpperCase().match(/.{1,4}/g) ?? []).join(' ')

export async function empreinteCode(code: string): Promise<string> {
  const brut = new TextEncoder().encode(code.replace(/\s+/g, '').toUpperCase())
  const h = await crypto.subtle.digest('SHA-256', brut)
  return Array.from(new Uint8Array(h), (o) => o.toString(16).padStart(2, '0')).join('')
}

// Adresse du paiement : le lien Stripe de la formule, avec l'empreinte du code.
export async function lienPaiement(formule: Formule, code: string, langue: 'fr' | 'en'): Promise<string> {
  const u = new URL(formule.lien)
  u.searchParams.set('client_reference_id', await empreinteCode(code))
  u.searchParams.set('locale', langue)
  return u.toString()
}

// Code en attente de paiement, gardé sur cet appareil pour la page de retour. Peut manquer (navigation privée) :
// c'est pourquoi la page fait noter le code avant de payer.
const CLE = 'regenvox.abonnement'
export interface CodeGarde { code: string; formule: string; le: string }

export function garderCode(c: CodeGarde): void {
  try {
    window.localStorage.setItem(CLE, JSON.stringify(c))
  } catch {
    /* stockage indisponible : le code noté par l'abonné suffit */
  }
}

export function codeGarde(): CodeGarde | null {
  try {
    const j = JSON.parse(window.localStorage.getItem(CLE) || 'null')
    return j && typeof j.code === 'string' && /^[2-9A-HJKMNP-TV-Z]{16}$/.test(j.code) ? j : null
  } catch {
    return null
  }
}

// Relais des abonnements : à côté du serveur de collecte, comme dans le moteur (moteur/navigateur/moteur.ts).
export const SERVEUR_IA: string = import.meta.env.VITE_API_IA || SERVEUR_PAR_DEFAUT.replace(/consultation\.php$/, 'ia.php')
