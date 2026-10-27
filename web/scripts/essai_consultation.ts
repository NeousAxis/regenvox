// Essai de bout en bout du chiffrement et du serveur de collecte (lancé par scripts/essai_consultation.sh).
import assert from 'node:assert/strict'
import * as k from '../src/consultation/chiffrement'
import { api, ErreurServeur } from '../src/consultation/api'

const S = process.argv[2]
const echoue = async (p: Promise<unknown>, code: string) => {
  try { await p } catch (e) { assert.ok(e instanceof ErreurServeur, String(e)); assert.equal(e.code, code); return }
  assert.fail(`aurait dû échouer (${code})`)
}

const id = k.nouvelIdentifiant()
const cleLien = k.nouvelleCleLien()
const jeton = k.nouveauJeton()
const paire = await k.nouvellePaire()
const phrase = k.nouvellePhrase()
assert.match(phrase, /^([0-9A-HJKMNP-TV-Z]{4} ){5}[0-9A-HJKMNP-TV-Z]{4}$/)
assert.equal(k.normaliserPhrase(phrase.toLowerCase().replace(/ /g, '')), phrase)

const questionnaire = { titre: 'Essai', cle_publique: paire.publique }
const debut = Date.now()
const copie = await k.scellerSecours(phrase, id, { privee: paire.priveePkcs8, jeton, cle_lien: cleLien })
console.log(`dérivation de la phrase : ${Date.now() - debut} ms`)
const demain = new Date(Date.now() + 86400e3).toISOString().slice(0, 10)
await api.creer(S, { id, questionnaire: await k.chiffrerAvecCle(cleLien, questionnaire, id), admin: await k.empreinte(jeton), cloture_le: demain, conservation_jours: 30, secours: [copie] })
await echoue(api.creer(S, { id, questionnaire: await k.chiffrerAvecCle(cleLien, questionnaire, id), admin: await k.empreinte(jeton), cloture_le: demain, conservation_jours: 30, secours: [copie] }), 'existe')

const q = await api.questionnaire(S, id)
assert.equal(q.ouverte, true)
assert.deepEqual(await k.dechiffrerAvecCle(cleLien, q.questionnaire, id), questionnaire)
await assert.rejects(k.dechiffrerAvecCle(k.nouvelleCleLien(), q.questionnaire, id))

for (let i = 0; i < 3; i++) await api.repondre(S, id, await k.chiffrerPourInitiateur(paire.publique, { n: i, texte: 'réponse é' }, id))
// Une réponse chiffrée pour une autre consultation ne s'ouvre pas ici.
await api.repondre(S, id, await k.chiffrerPourInitiateur(paire.publique, { n: 99 }, 'autre-consultation-xxxx'))
await echoue(api.compter(S, id, k.nouveauJeton()), 'jeton')
assert.equal((await api.compter(S, id, jeton)).nombre, 4)
const boites = await api.relever(S, id, jeton)
assert.equal(boites.length, 4)
const lues = await Promise.allSettled(boites.map((b) => k.dechiffrerReponse<{ n: number }>(paire.privee, b, id)))
assert.deepEqual(lues.filter((x) => x.status === 'fulfilled').map((x) => (x as PromiseFulfilledResult<{ n: number }>).value.n).sort(), [0, 1, 2])
assert.equal(lues.filter((x) => x.status === 'rejected').length, 1)

// Secours : la bonne phrase rend la copie, une autre non.
await echoue(api.secours(S, id, await k.preuveSecours(k.nouvellePhrase(), id)), 'phrase')
const rendue = await api.secours(S, id, await k.preuveSecours(phrase, id))
const contenu = await k.ouvrirSecours(phrase, id, rendue.boite)
assert.deepEqual(contenu, { privee: paire.priveePkcs8, jeton, cle_lien: cleLien })
const privee2 = await k.importerPrivee(contenu.privee)
assert.equal((await k.dechiffrerReponse<{ n: number }>(privee2, boites[0], id)).n >= 0, true)

await api.fermer(S, id, jeton)
await echoue(api.repondre(S, id, await k.chiffrerPourInitiateur(paire.publique, { n: 5 }, id)), 'fermee')
assert.equal((await api.questionnaire(S, id)).ouverte, false)
await echoue(api.repondre(S, 'x'.repeat(22), await k.chiffrerPourInitiateur(paire.publique, {}, id)), 'inconnue')
await api.supprimer(S, id, jeton)
await echoue(api.questionnaire(S, id), 'inconnue')
console.log('essai consultation : tout est conforme')
