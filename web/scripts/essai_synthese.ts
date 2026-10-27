// Essai de l'anonymisation et de la synthèse (avec un faux modèle) : citations vérifiées, essais refusés puis repris.
import assert from 'node:assert/strict'
import { analyser, anonymiser, masquerCoordonnees, MASQUE, SEUIL_ANONYMAT } from '../src/consultation/analyse'
import { controlerLecture, synthetiser, sansTirets } from '../src/consultation/synthese'
import type { AppelModele } from '../src/consultation/synthese'
import type { Questionnaire, Reponse } from '../src/consultation/types'

const q: Questionnaire = {
  version: 1, id: 'x'.repeat(22), langue: 'fr', organisation: { type: 'commune', nom: 'Essai' }, titre: 'Essai', introduction: '', formulation: 'Comment faire ?',
  contact: 'c', cloture_le: '2026-12-01', conservation_jours: 30, cle_publique: '',
  categories: [{ cle: 'tranche_age', options: ['16-24', '25-34', '75+'] }, { cle: 'sexe', options: ['femme', 'homme'] }],
  questions: [{ id: 'q1', type: 'texte', intitule: 'Vision ?', obligatoire: false }, { id: 'q2', type: 'choix_multiples', intitule: 'Sujets', options: ['a', 'b'], obligatoire: false }],
}
const rep = (age: string, sexe: string, avis: string, vision: string): Reponse => ({ version: 1, envoyee_le: '2026-10-27', categories: { tranche_age: age, sexe }, position: 'interesse', engagement: 2, format: 'avis_en_ligne', avis, reponses: { q1: vision, q2: ['a', 'b'] } })

// Coordonnées retirées des textes libres, les années et petits nombres gardés.
assert.equal(masquerCoordonnees('Écrivez à jean@ex.ch ou au +41 79 123 45 67, en 2040 avec 12 fermes.'), 'Écrivez à [adresse masquée] ou au [numéro masqué], en 2040 avec 12 fermes.')

// Moins de 5 réponses : toutes les catégories sont masquées.
const peu = anonymiser(q, [rep('16-24', 'femme', 'a', 'b'), rep('75+', 'homme', 'c', 'd')])
assert.ok(peu.lignes.every((l) => l.categories.tranche_age === MASQUE && l.categories.sexe === MASQUE))

// 11 réponses : la personne de 75 ans et plus, seule, est masquée ; toute combinaison visible compte au moins 5 personnes.
const reponses = [
  ...Array.from({ length: 6 }, (_, i) => rep('16-24', 'femme', `Avis jeune ${i}`, `Vision jeune ${i}`)),
  ...Array.from({ length: 4 }, (_, i) => rep('25-34', i < 2 ? 'femme' : 'homme', `Avis adulte ${i}`, `Vision adulte ${i}`)),
  rep('75+', 'homme', 'Je suis le doyen du village, appelez le 021 555 66 77', 'Des bancs partout.'),
]
const a = anonymiser(q, reponses)
const combos = new Map<string, number>()
a.lignes.forEach((l) => combos.set(`${l.categories.tranche_age}|${l.categories.sexe}`, (combos.get(`${l.categories.tranche_age}|${l.categories.sexe}`) ?? 0) + 1))
for (const [k, n] of combos) if (!k.split('|').every((v) => v === MASQUE)) assert.ok(n >= SEUIL_ANONYMAT, `groupe ${k} de ${n}`)
assert.ok(!a.lignes.some((l) => l.categories.tranche_age === '75+'))
assert.ok(a.lignes.some((l) => l.avis?.includes('[numéro masqué]')))
assert.equal(new Set(a.lignes.map((l) => l.numero)).size, 11)

const an = analyser(q, reponses)
assert.equal(an.n, 11)
assert.equal(an.questions[1].options![0].n, 11)
assert.equal(an.scores[0].lignes.find((l) => l.option === '75+')!.reel, null) // moins de 5 : jamais chiffré

// Synthèse : une citation inventée est refusée, puis la réponse corrigée est acceptée.
const source = a.lignes.find((l) => l.avis?.startsWith('Avis jeune'))!
const lecture = (cite: string) => JSON.stringify({ segments: [{ nom: 'Les jeunes', position_dominante: 'interesse', objection_citee: cite, reponse_source: source.numero, racine: 'pratique', levier: 'Ouvrir des horaires du soir.' }], freins_participation: [], themes: [{ question_id: 'q1', themes: [{ theme: 'Jeunesse', nombre: 6, citation: source.reponses.q1 }] }], ecarts_avec_simulation: [], surprises: [] })
const essais: string[] = []
const appel: AppelModele = async (r) => {
  essais.push(`${r.step}:${r.attempt}`)
  if (r.step === 'lecture') return { texte: r.attempt === 1 ? lecture('Une phrase que personne n’a écrite') : '```json\n' + lecture(`« ${source.avis} »`) + '\n```', tokens_entree: 10, tokens_sortie: 5 }
  if (r.step === 'critique') return { texte: JSON.stringify({ attaques: [{ cible: 'representativite', critique: 'Les personnes âgées manquent presque entièrement parmi les réponses reçues.', impact: 'Prudence sur les conclusions.' }, { cible: 'donnees', critique: 'Onze réponses seulement : chaque groupe pèse lourd dans les parts calculées ici.', impact: 'Écarts fragiles.' }], notes_pour_rapport: ['Échantillon très petit.'] }), tokens_entree: 10, tokens_sortie: 5 }
  return { texte: JSON.stringify({ titre: 'Synthèse de la consultation — essai', synthese: 'Les jeunes répondent davantage — et ils sont plutôt favorables. Les personnes âgées sont presque absentes de cette consultation.', sections: [{ titre: 'Qui a répondu', contenu: 'Surtout des jeunes de 16 à 24 ans, et une seule personne âgée.' }, { titre: 'Accueil', contenu: 'Un accueil plutôt favorable de la démarche, sans opposition franche.' }, { titre: 'Limites', contenu: 'Onze réponses seulement : les écarts sont fragiles et à confirmer.' }] }), tokens_entree: 10, tokens_sortie: 5 }
}
const s = await synthetiser({ q, analyse: an, lignes: a.lignes }, appel)
assert.deepEqual(essais, ['lecture:1', 'lecture:2', 'critique:1', 'redaction:1'])
assert.equal(s.lecture.segments[0].reponse_source, source.numero)
assert.ok(!/[—–]/.test(s.redaction.titre + s.redaction.synthese), 'tirets retirés')
assert.equal(s.usage.tokens_entree, 40)
assert.deepEqual(controlerLecture(JSON.parse(lecture('inventé')), a.lignes, q).length, 1)
assert.equal(sansTirets('a — b – c - d'), 'a, b, c, d')
console.log('essai synthèse : tout est conforme')
