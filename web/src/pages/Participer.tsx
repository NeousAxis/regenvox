// Page des contributeurs d'une consultation réelle, ouverte depuis le lien ou le QR code partagé par l'organisation.
// Le questionnaire est déchiffré ici avec la clé du lien (après le #) ; la réponse est chiffrée ici pour la clé de l'organisation.
import { useCallback, useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import Logo from '../components/Logo'
import { ErreurServeur } from '../consultation/api'
import { LIBELLES, TEXTES_PARTICIPANT, libelleValeur, remplir } from '../consultation/libelles'
import { envoyerReponse, lireLien, ouvrirQuestionnaire } from '../consultation/operations'
import { ENGAGEMENTS, FORMATS, POSITIONS } from '../consultation/types'
import type { CleCategorie, Format, Position, Question, Questionnaire, Reponse, ValeurReponse } from '../consultation/types'

type Etat =
  | { etape: 'chargement' }
  | { etape: 'erreur'; message: 'lienInvalide' | 'introuvable' | 'illisible' | 'reseau' }
  | { etape: 'fermee'; questionnaire: Questionnaire }
  | { etape: 'formulaire'; questionnaire: Questionnaire }
  | { etape: 'merci'; questionnaire: Questionnaire }

const cleRepondu = (id: string) => `regenvox.repondu.${id}`
const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Groupe({ legende, aide, children }: { legende: string; aide?: string; children: ReactNode }) {
  const id = useId()
  return (
    <fieldset className="space-y-2" aria-describedby={aide ? id : undefined}>
      <legend className="font-semibold text-dark leading-snug">{legende}</legend>
      {aide && (
        <p id={id} className="text-sm text-dark-light">
          {aide}
        </p>
      )}
      <div className="space-y-2">{children}</div>
    </fieldset>
  )
}

function Choix({ nom, valeur, choisi, type = 'radio', onChange, children }: { nom: string; valeur: string; choisi: boolean; type?: 'radio' | 'checkbox'; onChange: () => void; children: ReactNode }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${choisi ? 'border-ocean bg-sky/20' : 'border-mist bg-white hover:border-ocean/50'}`}>
      <input type={type} name={nom} value={valeur} checked={choisi} onChange={onChange} className="mt-1 h-4 w-4 shrink-0 accent-[#2A6D8A]" />
      <span className="text-dark leading-snug">{children}</span>
    </label>
  )
}

function Texte({ id, libelle, aide, valeur, onChange, obligatoire }: { id: string; libelle: string; aide: string; valeur: string; onChange: (v: string) => void; obligatoire?: string }) {
  return (
    <div>
      <label htmlFor={id} className="font-semibold text-dark leading-snug block">
        {libelle} {obligatoire && <span className="text-sm font-normal text-dark-light">({obligatoire})</span>}
      </label>
      <p id={`${id}-aide`} className="text-sm text-dark-light mt-1">
        {aide}
      </p>
      <textarea id={id} aria-describedby={`${id}-aide`} className="champ mt-2 min-h-24" maxLength={2000} value={valeur} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default function Participer() {
  const [etat, setEtat] = useState<Etat>({ etape: 'chargement' })
  const [lien] = useState(() => lireLien(window.location.hash))

  const charger = useCallback(async () => {
    if (!lien) {
      setEtat({ etape: 'erreur', message: 'lienInvalide' })
      return
    }
    setEtat({ etape: 'chargement' })
    try {
      const { questionnaire, ouverte } = await ouvrirQuestionnaire(lien.id, lien.cle)
      document.documentElement.lang = questionnaire.langue
      document.title = `${questionnaire.titre} | ${questionnaire.organisation.nom}`
      setEtat(ouverte ? { etape: 'formulaire', questionnaire } : { etape: 'fermee', questionnaire })
    } catch (e) {
      if (e instanceof ErreurServeur) setEtat({ etape: 'erreur', message: e.code === 'inconnue' || e.statut === 404 ? 'introuvable' : 'reseau' })
      else setEtat({ etape: 'erreur', message: 'illisible' })
    }
  }, [lien])

  useEffect(() => {
    void charger()
  }, [charger])

  // La langue de la page suit celle du lien tant que le questionnaire n'est pas lu.
  const langue = 'questionnaire' in etat ? etat.questionnaire.langue : navigator.language?.startsWith('en') ? 'en' : 'fr'
  const T = TEXTES_PARTICIPANT[langue]

  return (
    <div className="min-h-screen flex flex-col bg-[#F7FAFB]">
      <header className="bg-white border-b border-mist">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <Logo compact />
        </div>
      </header>
      <main id="contenu" className="flex-1 w-full max-w-2xl mx-auto px-4 py-8">
        {etat.etape === 'chargement' && <p role="status">{T.chargement}</p>}
        {etat.etape === 'erreur' && (
          <div className="rounded-2xl border border-alerte/30 bg-white p-6 space-y-4" role="alert">
            <p className="text-dark">{T[etat.message]}</p>
            {etat.message === 'reseau' && (
              <button type="button" className="btn btn-primaire" onClick={() => void charger()}>
                {T.reessayer}
              </button>
            )}
          </div>
        )}
        {etat.etape === 'fermee' && (
          <div className="rounded-2xl border border-mist bg-white p-6 space-y-2">
            <h1 className="font-serif text-2xl font-bold text-dark">{etat.questionnaire.titre}</h1>
            <p className="text-dark">{T.fermee}</p>
          </div>
        )}
        {etat.etape === 'formulaire' && lien && (
          <Formulaire questionnaire={etat.questionnaire} onEnvoye={() => setEtat({ etape: 'merci', questionnaire: etat.questionnaire })} />
        )}
        {etat.etape === 'merci' && (
          <div className="rounded-2xl border border-succes/40 bg-white p-6 space-y-4" role="status">
            <h1 className="font-serif text-2xl font-bold text-succes">{T.merciTitre}</h1>
            <p className="text-dark">{remplir(T.merciTexte, { organisation: etat.questionnaire.organisation.nom })}</p>
            <button type="button" className="btn btn-secondaire" onClick={() => setEtat({ etape: 'formulaire', questionnaire: etat.questionnaire })}>
              {T.nouvelle}
            </button>
          </div>
        )}
      </main>
      <footer className="text-center text-sm text-dark-light px-4 py-6">{T.pied}</footer>
    </div>
  )
}

function Formulaire({ questionnaire: q, onEnvoye }: { questionnaire: Questionnaire; onEnvoye: () => void }) {
  const T = TEXTES_PARTICIPANT[q.langue]
  const L = LIBELLES[q.langue]
  const org = q.organisation.nom
  const [categories, setCategories] = useState<Partial<Record<CleCategorie, string>>>({})
  const [position, setPosition] = useState<Position | undefined>()
  const [engagement, setEngagement] = useState<number | undefined>()
  const [format, setFormat] = useState<Format | undefined>()
  const [avis, setAvis] = useState('')
  const [freins, setFreins] = useState('')
  const [envie, setEnvie] = useState('')
  const [reponses, setReponses] = useState<Record<string, ValeurReponse>>({})
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dejaRepondu] = useState(() => {
    try {
      return window.localStorage.getItem(cleRepondu(q.id)) !== null
    } catch {
      return false
    }
  })
  const base = useId()
  const citer = (s: string) => (q.langue === 'fr' ? `«\u00a0${s}\u00a0»` : `“${s}”`)

  const manquantes = (qs: Question[]) =>
    qs.filter((x) => {
      if (!x.obligatoire) return false
      const v = reponses[x.id]
      return v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
    })

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    const manque = manquantes(q.questions)
    if (manque.length) {
      setMessage(remplir(T.manque, { liste: manque.map((x) => citer(x.intitule)).join(', ') }))
      return
    }
    setEnvoi(true)
    setMessage(null)
    const nettoyer = (s: string) => s.trim().slice(0, 2000) || undefined
    const reponse: Reponse = {
      version: 1,
      envoyee_le: aujourdhui(),
      categories,
      position,
      engagement,
      format,
      avis: nettoyer(avis),
      freins: nettoyer(freins),
      envie: nettoyer(envie),
      reponses: Object.fromEntries(Object.entries(reponses).map(([k, v]) => [k, typeof v === 'string' ? v.trim().slice(0, 4000) : v])),
    }
    try {
      await envoyerReponse(q, reponse)
      try {
        window.localStorage.setItem(cleRepondu(q.id), '1')
      } catch {
        // Sans conséquence.
      }
      window.scrollTo(0, 0)
      onEnvoye()
    } catch (err) {
      setMessage(err instanceof ErreurServeur && err.statut === 429 ? T.tropDeDemandes : err instanceof ErreurServeur && err.code === 'fermee' ? T.fermee : T.erreurEnvoi)
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={(e) => void envoyer(e)} className="space-y-8" noValidate>
      <div className="space-y-4">
        <p className="text-sm font-semibold tracking-wide uppercase text-ocean-dark">{remplir(T.proposePar, { organisation: org })}</p>
        <h1 className="font-serif text-3xl font-bold text-dark leading-tight">{q.titre}</h1>
        {q.introduction.split(/\n+/).map((p, i) => (
          <p key={i} className="text-dark leading-relaxed">
            {p}
          </p>
        ))}
        <div className="rounded-2xl border-l-4 border-ocean bg-white p-5">
          <p className="text-sm font-semibold text-ocean-dark">{T.formulationTitre}</p>
          <p className="mt-1 text-lg text-dark leading-relaxed">{citer(q.formulation)}</p>
        </div>
        <ul className="rounded-2xl bg-white border border-mist p-5 space-y-2 text-sm text-dark-light list-disc pl-9">
          {T.confidentialite.map((x, i) => (
            <li key={i}>{remplir(x, { organisation: org, jours: q.conservation_jours, cloture: q.cloture_le.split('-').reverse().join(q.langue === 'fr' ? '.' : '/') })}</li>
          ))}
          <li>{remplir(T.contact, { contact: q.contact })}</li>
        </ul>
        {dejaRepondu && (
          <p className="rounded-xl bg-peach/30 p-4 text-dark" role="note">
            {T.dejaRepondu}
          </p>
        )}
      </div>

      {q.categories.length > 0 && (
        <section aria-labelledby={`${base}-vous`} className="rounded-2xl bg-white border border-mist p-5 sm:p-6 space-y-6">
          <div>
            <h2 id={`${base}-vous`} className="font-serif text-xl font-bold text-dark">
              {T.sectionVous}
            </h2>
            <p className="text-sm text-dark-light mt-1">{T.sectionVousAide}</p>
          </div>
          {q.categories.map((c) => (
            <Groupe key={c.cle} legende={L.categorie[c.cle]}>
              {[...c.options, ''].map((o) => (
                <Choix key={o || 'aucune'} nom={`${base}-${c.cle}`} valeur={o} choisi={categories[c.cle] === o} onChange={() => setCategories((x) => ({ ...x, [c.cle]: o }))}>
                  {o ? libelleValeur(q.langue, c.cle, o) : T.preferePas}
                </Choix>
              ))}
            </Groupe>
          ))}
        </section>
      )}

      <section aria-labelledby={`${base}-demarche`} className="rounded-2xl bg-white border border-mist p-5 sm:p-6 space-y-6">
        <h2 id={`${base}-demarche`} className="font-serif text-xl font-bold text-dark">
          {T.sectionDemarche}
        </h2>
        <Groupe legende={T.position}>
          {POSITIONS.map((p) => (
            <Choix key={p} nom={`${base}-position`} valeur={p} choisi={position === p} onChange={() => setPosition(p)}>
              {L.position[p]}
            </Choix>
          ))}
        </Groupe>
        <Groupe legende={T.engagement}>
          {ENGAGEMENTS.map((n) => (
            <Choix key={n} nom={`${base}-engagement`} valeur={String(n)} choisi={engagement === n} onChange={() => setEngagement(n)}>
              {L.engagement[n]}
            </Choix>
          ))}
        </Groupe>
        <Groupe legende={T.format}>
          {FORMATS.map((f) => (
            <Choix key={f} nom={`${base}-format`} valeur={f} choisi={format === f} onChange={() => setFormat(f)}>
              {L.format[f]}
            </Choix>
          ))}
        </Groupe>
        <Texte id={`${base}-avis`} libelle={T.avis} aide={T.texteAide} valeur={avis} onChange={setAvis} />
        <Texte id={`${base}-freins`} libelle={T.freins} aide={T.texteAide} valeur={freins} onChange={setFreins} />
        <Texte id={`${base}-envie`} libelle={T.envie} aide={T.texteAide} valeur={envie} onChange={setEnvie} />
      </section>

      {q.questions.length > 0 && (
        <section aria-labelledby={`${base}-questions`} className="rounded-2xl bg-white border border-mist p-5 sm:p-6 space-y-6">
          <h2 id={`${base}-questions`} className="font-serif text-xl font-bold text-dark">
            {remplir(T.sectionQuestions, { organisation: org })}
          </h2>
          {q.questions.map((qu) => {
            const etiquette = `${qu.intitule} (${qu.obligatoire ? T.obligatoire : T.facultatif})`
            const v = reponses[qu.id]
            const fixer = (val: ValeurReponse) => setReponses((x) => ({ ...x, [qu.id]: val }))
            if (qu.type === 'texte') {
              return <Texte key={qu.id} id={`${base}-${qu.id}`} libelle={qu.intitule} obligatoire={qu.obligatoire ? T.obligatoire : T.facultatif} aide={T.texteAide} valeur={typeof v === 'string' ? v : ''} onChange={fixer} />
            }
            if (qu.type === 'echelle') {
              return (
                <Groupe key={qu.id} legende={etiquette} aide={q.langue === 'fr' ? `1\u00a0: ${T.echellePeu}, 5\u00a0: ${T.echelleTres}` : `1: ${T.echellePeu}, 5: ${T.echelleTres}`}>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className={`flex flex-col items-center rounded-xl border py-3 cursor-pointer ${v === n ? 'border-ocean bg-sky/20' : 'border-mist bg-white'}`}>
                        <input type="radio" name={`${base}-${qu.id}`} value={n} checked={v === n} onChange={() => fixer(n)} className="h-4 w-4 accent-[#2A6D8A]" />
                        <span className="mt-1 font-semibold text-dark">{n}</span>
                      </label>
                    ))}
                  </div>
                </Groupe>
              )
            }
            if (qu.type === 'choix_multiples') {
              const coches = Array.isArray(v) ? v : []
              return (
                <Groupe key={qu.id} legende={etiquette} aide={T.plusieurs}>
                  {(qu.options ?? []).map((o) => (
                    <Choix key={o} type="checkbox" nom={`${base}-${qu.id}`} valeur={o} choisi={coches.includes(o)} onChange={() => fixer(coches.includes(o) ? coches.filter((x) => x !== o) : [...coches, o])}>
                      {o}
                    </Choix>
                  ))}
                </Groupe>
              )
            }
            return (
              <Groupe key={qu.id} legende={etiquette}>
                {(qu.options ?? []).map((o) => (
                  <Choix key={o} nom={`${base}-${qu.id}`} valeur={o} choisi={v === o} onChange={() => fixer(o)}>
                    {o}
                  </Choix>
                ))}
              </Groupe>
            )
          })}
        </section>
      )}

      {message && (
        <p className="rounded-xl border border-alerte/40 bg-white p-4 text-alerte font-medium" role="alert">
          {message}
        </p>
      )}
      <button type="submit" className="btn btn-primaire w-full sm:w-auto" disabled={envoi}>
        {envoi ? T.envoi : T.envoyer}
      </button>
    </form>
  )
}
