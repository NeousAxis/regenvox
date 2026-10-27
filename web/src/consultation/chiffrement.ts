// Chiffrement de bout en bout des consultations RegenVox, entièrement dans le navigateur (WebCrypto).
// Le serveur ne reçoit que des boîtes illisibles :
// le questionnaire est chiffré avec la clé du lien, placée après le # de l'adresse et donc jamais envoyée au serveur ;
// chaque réponse est chiffrée pour la clé publique de l'initiateur, dont la clé privée reste sur son appareil ;
// la copie de secours (clé privée, jeton d'administration, clé du lien) est verrouillée par une phrase que seul l'initiateur garde.
// Le serveur peut donc tout rendre sur demande sans jamais pouvoir rien lire.

const sub = () => globalThis.crypto.subtle
const encodeur = new TextEncoder()
const decodeur = new TextDecoder()

export function versB64u(octets: Uint8Array): string {
  let bin = ''
  for (const o of octets) bin += String.fromCharCode(o)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function depuisB64u(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('encodage invalide')
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function aleatoire(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

// Identifiant de consultation : 16 octets aléatoires (22 caractères), impossible à deviner.
export const nouvelIdentifiant = () => versB64u(aleatoire(16))
export const IDENTIFIANT_VALIDE = /^[A-Za-z0-9_-]{22}$/

// Boîte chiffrée avec une clé symétrique (AES-GCM).
export interface Boite { v: 1; iv: string; ct: string }
// Boîte chiffrée pour une clé publique : clé éphémère ECDH, puis AES-GCM.
export interface BoitePublique { v: 1; epk: string; iv: string; ct: string }

// Les données associées lient chaque boîte à sa consultation : une boîte déplacée vers une autre consultation ne s'ouvre pas.
const associe = (contexte: string) => encodeur.encode(`regenvox:${contexte}`)

async function cleAes(brute: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return sub().importKey('raw', brute, { name: 'AES-GCM' }, false, usages)
}

async function sceller(cle: CryptoKey, donnees: unknown, contexte: string): Promise<Boite> {
  const iv = aleatoire(12)
  const ct = await sub().encrypt({ name: 'AES-GCM', iv, additionalData: associe(contexte) }, cle, encodeur.encode(JSON.stringify(donnees)))
  return { v: 1, iv: versB64u(iv), ct: versB64u(new Uint8Array(ct)) }
}

async function ouvrir<T>(cle: CryptoKey, boite: Boite, contexte: string): Promise<T> {
  if (!boite || boite.v !== 1) throw new Error('boîte inconnue')
  const clair = await sub().decrypt({ name: 'AES-GCM', iv: depuisB64u(boite.iv), additionalData: associe(contexte) }, cle, depuisB64u(boite.ct))
  return JSON.parse(decodeur.decode(clair)) as T
}

// Clé du lien : chiffre le questionnaire, que seules les personnes ayant le lien peuvent lire.
export const nouvelleCleLien = () => versB64u(aleatoire(32))

export async function chiffrerAvecCle(cleB64u: string, donnees: unknown, contexte: string): Promise<Boite> {
  return sceller(await cleAes(depuisB64u(cleB64u), ['encrypt']), donnees, contexte)
}

export async function dechiffrerAvecCle<T>(cleB64u: string, boite: Boite, contexte: string): Promise<T> {
  return ouvrir<T>(await cleAes(depuisB64u(cleB64u), ['decrypt']), boite, contexte)
}

// Paire de clés de l'initiateur (ECDH P-256). La clé privée est exportée une seule fois, pour la copie de secours.
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const

export async function nouvellePaire(): Promise<{ publique: string; privee: CryptoKey; priveePkcs8: string }> {
  const paire = (await sub().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair
  const publique = versB64u(new Uint8Array(await sub().exportKey('raw', paire.publicKey)))
  const priveePkcs8 = versB64u(new Uint8Array(await sub().exportKey('pkcs8', paire.privateKey)))
  // On garde une version non exportable : un script malveillant de la page ne pourrait pas la copier.
  return { publique, privee: await importerPrivee(priveePkcs8), priveePkcs8 }
}

export async function importerPrivee(pkcs8B64u: string): Promise<CryptoKey> {
  return sub().importKey('pkcs8', depuisB64u(pkcs8B64u), ECDH, false, ['deriveBits'])
}

async function cleDeReponse(secret: ArrayBuffer, contexte: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const base = await sub().importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return sub().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encodeur.encode(`regenvox-consultation:${contexte}`), info: encodeur.encode('regenvox-reponse-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

// Chiffre une réponse pour l'initiateur : seule sa clé privée peut l'ouvrir, pas même le contributeur ensuite.
export async function chiffrerPourInitiateur(publiqueB64u: string, donnees: unknown, contexte: string): Promise<BoitePublique> {
  const destinataire = await sub().importKey('raw', depuisB64u(publiqueB64u), ECDH, false, [])
  const ephemere = (await sub().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair
  const secret = await sub().deriveBits({ name: 'ECDH', public: destinataire }, ephemere.privateKey, 256)
  const boite = await sceller(await cleDeReponse(secret, contexte, ['encrypt']), donnees, contexte)
  const epk = versB64u(new Uint8Array(await sub().exportKey('raw', ephemere.publicKey)))
  return { v: 1, epk, iv: boite.iv, ct: boite.ct }
}

export async function dechiffrerReponse<T>(privee: CryptoKey, boite: BoitePublique, contexte: string): Promise<T> {
  if (!boite || boite.v !== 1 || typeof boite.epk !== 'string') throw new Error('boîte inconnue')
  const emetteur = await sub().importKey('raw', depuisB64u(boite.epk), ECDH, false, [])
  const secret = await sub().deriveBits({ name: 'ECDH', public: emetteur }, privee, 256)
  return ouvrir<T>(await cleDeReponse(secret, contexte, ['decrypt']), { v: 1, iv: boite.iv, ct: boite.ct }, contexte)
}

// Jeton d'administration : le serveur n'en garde que l'empreinte.
export const nouveauJeton = () => versB64u(aleatoire(32))

export async function empreinte(texte: string): Promise<string> {
  const h = new Uint8Array(await sub().digest('SHA-256', encodeur.encode(texte)))
  return [...h].map((o) => o.toString(16).padStart(2, '0')).join('')
}

// Phrase de secours : 24 caractères tirés au hasard (120 bits), en 6 groupes de 4.
// Alphabet sans lettres ambiguës (Crockford) : I, L, O et U n'y figurent pas.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LONGUEUR_PHRASE = 24

export function nouvellePhrase(): string {
  const octets = aleatoire(LONGUEUR_PHRASE)
  // 256 est un multiple de 32 : chaque caractère est équiprobable.
  const car = [...octets].map((o) => ALPHABET[o % 32]).join('')
  return car.match(/.{4}/g)!.join(' ')
}

// Accepte la phrase tapée avec ou sans espaces, en minuscules, avec O pour 0 ou I et L pour 1.
export function normaliserPhrase(saisie: string): string | null {
  const brut = saisie.toUpperCase().replace(/[\s.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  if (brut.length !== LONGUEUR_PHRASE || [...brut].some((c) => !ALPHABET.includes(c))) return null
  return brut.match(/.{4}/g)!.join(' ')
}

export const ITERATIONS_SECOURS = 310_000

// De la phrase, on tire deux secrets distincts : la clé qui verrouille la copie, et la preuve que l'on connaît la phrase.
// Le serveur garde l'empreinte de la preuve pour ne rendre la copie qu'à qui connaît la phrase ; il ne voit jamais la clé.
async function deriverSecours(phrase: string, id: string): Promise<{ cle: CryptoKey; preuve: string }> {
  const normalisee = normaliserPhrase(phrase)
  if (!normalisee) throw new Error('phrase de secours invalide')
  const base = await sub().importKey('raw', encodeur.encode(normalisee.replace(/ /g, '')), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(
    await sub().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encodeur.encode(`regenvox-secours-v1:${id}`), iterations: ITERATIONS_SECOURS }, base, 512),
  )
  return { cle: await cleAes(bits.slice(0, 32), ['encrypt', 'decrypt']), preuve: versB64u(bits.slice(32)) }
}

export interface ContenuSecours { privee: string; jeton: string; cle_lien: string }
export interface CopieSecours { preuve_empreinte: string; boite: Boite }

export async function scellerSecours(phrase: string, id: string, contenu: ContenuSecours): Promise<CopieSecours> {
  const { cle, preuve } = await deriverSecours(phrase, id)
  return { preuve_empreinte: await empreinte(preuve), boite: await sceller(cle, contenu, `secours:${id}`) }
}

export async function preuveSecours(phrase: string, id: string): Promise<string> {
  return (await deriverSecours(phrase, id)).preuve
}

export async function ouvrirSecours(phrase: string, id: string, boite: Boite): Promise<ContenuSecours> {
  const { cle } = await deriverSecours(phrase, id)
  return ouvrir<ContenuSecours>(cle, boite, `secours:${id}`)
}
