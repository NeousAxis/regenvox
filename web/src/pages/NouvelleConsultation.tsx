// Création d'une consultation réelle à partir d'une prospective terminée : même formulation, mêmes catégories que le panel,
// et les questions de l'organisation. Les clés et les phrases de secours naissent ici, dans ce navigateur.
import { useId, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { translations } from '../i18n/translations'
import type { TranslationKey } from '../i18n/translations'
import { useProjet } from '../useProjet'
import type { Projet } from '../moteur'
import { useTitre } from '../titre'
import { EMAIL_CONTACT } from '../liens'
import { Aide, MessageErreur, decritPar } from '../components/Champ'
import { ErreurServeur } from '../consultation/api'
import { creerConsultation } from '../consultation/operations'
import type { ResultatCreation } from '../consultation/operations'
import { LIBELLES } from '../consultation/libelles'
import { anglesDe, angleRecommande, categoriesDe, lieuDe, prospectiveExploitable, repereSimulation } from '../consultation/simulation'
import type { CleCategorie, Langue, Question, TypeQuestion } from '../consultation/types'

const TYPES: TypeQuestion[] = ['texte', 'choix', 'choix_multiples', 'echelle']
const dansJours = (n: number) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10)
const nouvelId = () => Math.random().toString(36).slice(2, 8)
const remplirVars = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m)

interface QuestionEdition extends Omit<Question, 'options'> { options: string }

export default function NouvelleConsultation() {
  const { projetId = '' } = useParams()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { projet } = useProjet(projetId)
  useTitre(t('cons.nouvelle.titre'))

  if (projet === undefined) return <Cadre><p role="status">{t('general.chargement')}</p></Cadre>
  if (projet === null || !prospectiveExploitable(projet)) {
    return (
      <Cadre>
        <h1 className="font-serif text-3xl font-bold text-dark">{t('cons.nouvelle.titre')}</h1>
        <p className="mt-4 text-dark">{t('cons.nouvelle.impossible')}</p>
        <Link to="/prospectives" className="btn btn-secondaire mt-6">
          {t('action.mesTests')}
        </Link>
      </Cadre>
    )
  }
  return <Formulaire key={projet.id} projet={projet} onFini={(id) => navigate(`/consultation/${encodeURIComponent(id)}`)} />
}

function Cadre({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">{children}</div>
}

function Formulaire({ projet: p, onFini }: { projet: Projet; onFini: (id: string) => void }) {
  const { t } = useLanguage()
  const langue: Langue = p.parametres.langue
  // Textes écrits dans la langue de la consultation, avec l'espace insécable française avant ? ! : ;
  const tl = (k: TranslationKey, v: Record<string, string> = {}) => {
    const brut = remplirVars(translations[langue][k], v)
    return langue === 'fr' ? brut.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0') : brut
  }
  const org = p.parametres.organisation.nom
  const angles = useMemo(() => anglesDe(p), [p])
  const recommande = angleRecommande(p)
  const categoriesDispo = useMemo(() => categoriesDe(p), [p])
  const base = useId()

  const [titre, setTitre] = useState(() => tl('cons.defaut.titre'))
  const [introduction, setIntroduction] = useState(() => tl('cons.defaut.intro', { organisation: org }))
  const [angleId, setAngleId] = useState<number>(() => recommande ?? angles.find((a) => a.origine === 'decideur')?.id ?? angles[0].id)
  const [contact, setContact] = useState('')
  const [cloture, setCloture] = useState(dansJours(30))
  const [conservation, setConservation] = useState(365)
  const [cles, setCles] = useState<Set<CleCategorie>>(() => new Set(categoriesDispo.map((c) => c.cle)))
  const [questions, setQuestions] = useState<QuestionEdition[]>(() => [{ id: nouvelId(), type: 'texte', intitule: tl(`cons.defaut.question.${lieuDe(p)}` as TranslationKey), options: '', obligatoire: false }])
  const [code, setCode] = useState('')
  const [secondePhrase, setSecondePhrase] = useState(false)
  const [montrerErreurs, setMontrerErreurs] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState<string | null>(null)
  const [cree, setCree] = useState<ResultatCreation | null>(null)
  const [note, setNote] = useState(false)

  const erreurs: Partial<Record<'titre' | 'contact' | 'cloture' | 'questions', TranslationKey>> = {}
  if (!titre.trim()) erreurs.titre = 'cons.erreur.titre'
  if (!contact.trim()) erreurs.contact = 'cons.erreur.contact'
  if (!cloture || cloture < dansJours(0) || cloture > dansJours(366)) erreurs.cloture = 'cons.erreur.cloture'
  if (questions.some((q) => !q.intitule.trim() || ((q.type === 'choix' || q.type === 'choix_multiples') && lignes(q.options).length < 2))) erreurs.questions = 'cons.erreur.questions'

  function lignes(s: string) {
    return [...new Set(s.split('\n').map((x) => x.trim()).filter(Boolean))]
  }

  function majQuestion(i: number, maj: Partial<QuestionEdition>) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...maj } : q)))
  }
  function deplacer(i: number, d: -1 | 1) {
    setQuestions((qs) => {
      const j = i + d
      if (j < 0 || j >= qs.length) return qs
      const copie = [...qs]
      ;[copie[i], copie[j]] = [copie[j], copie[i]]
      return copie
    })
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault()
    if (Object.keys(erreurs).length) {
      setMontrerErreurs(true)
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      const angle = angles.find((a) => a.id === angleId)!
      const r = await creerConsultation({
        questionnaire: {
          langue,
          organisation: p.parametres.organisation,
          titre: titre.trim(),
          introduction: introduction.trim(),
          formulation: angle.formulation,
          contact: contact.trim(),
          cloture_le: cloture,
          conservation_jours: conservation,
          categories: categoriesDispo.filter((c) => cles.has(c.cle)),
          questions: questions.map((q) => ({
            id: q.id,
            type: q.type,
            intitule: q.intitule.trim(),
            obligatoire: q.obligatoire,
            ...(q.type === 'choix' || q.type === 'choix_multiples' ? { options: lignes(q.options) } : {}),
          })),
        },
        simulation: repereSimulation(p, angleId),
        code,
        secondePhrase,
      })
      setCree(r)
      window.scrollTo(0, 0)
    } catch (err) {
      const k: TranslationKey =
        err instanceof ErreurServeur
          ? err.code === 'code'
            ? 'cons.echec.code'
            : err.code === 'reseau'
              ? 'cons.echec.reseau'
              : err.code === 'trop_de_demandes'
                ? 'cons.echec.limite'
                : err.code === 'reponse_illisible' || err.statut === 404
                  ? 'cons.echec.serveur'
                  : 'cons.echec.autre'
          : 'cons.echec.autre'
      setEchec(t(k, { email: EMAIL_CONTACT }))
    } finally {
      setEnvoi(false)
    }
  }

  if (cree) {
    const q = cree.consultation.questionnaire
    return (
      <Cadre>
        <h1 className="font-serif text-3xl font-bold text-dark">{t('cons.secours.titre')}</h1>
        <p className="mt-4 text-dark leading-relaxed pas-imprimer">{t('cons.secours.intro')}</p>
        <section className="mt-6 rounded-2xl border-2 border-dark p-6 space-y-4 bg-white" aria-labelledby={`${base}-feuille`}>
          <h2 id={`${base}-feuille`} className="font-serif text-xl font-bold text-dark">
            {t('cons.secours.feuille')}
          </h2>
          <dl className="grid sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-dark">
            <dt className="font-semibold">{t('cons.champ.organisation')}</dt>
            <dd>{q.organisation.nom}</dd>
            <dt className="font-semibold">{t('cons.champ.titre')}</dt>
            <dd>{q.titre}</dd>
            <dt className="font-semibold">{t('cons.secours.code')}</dt>
            <dd className="font-mono break-all">{cree.consultation.id}</dd>
            <dt className="font-semibold">{t('cons.secours.site')}</dt>
            <dd>{window.location.origin}/consultations/recuperer</dd>
            <dt className="font-semibold">{t('cons.secours.date')}</dt>
            <dd>{new Date().toLocaleDateString()}</dd>
          </dl>
          {cree.phrases.map((ph, i) => (
            <div key={ph} className="rounded-xl bg-mist/40 p-4">
              <p className="font-semibold text-dark">{cree.phrases.length > 1 ? t('cons.secours.phraseN', { n: i + 1 }) : t('cons.secours.phrase')}</p>
              <p className="mt-2 font-mono text-xl sm:text-2xl tracking-wider text-dark select-all">{ph}</p>
            </div>
          ))}
          <p className="text-sm text-dark-light">{t('cons.secours.regle')}</p>
        </section>
        <div className="mt-6 space-y-4 pas-imprimer">
          <button type="button" className="btn btn-secondaire" onClick={() => window.print()}>
            {t('cons.secours.imprimer')}
          </button>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} className="mt-1 h-4 w-4 accent-[#2A6D8A]" />
            <span className="text-dark">{t('cons.secours.confirme')}</span>
          </label>
          <button type="button" className="btn btn-primaire" disabled={!note} onClick={() => onFini(cree.consultation.id)}>
            {t('cons.secours.suite')}
          </button>
        </div>
      </Cadre>
    )
  }

  const L = LIBELLES[langue]
  const err = (k: keyof typeof erreurs) => (montrerErreurs && erreurs[k] ? t(erreurs[k]!) : undefined)
  return (
    <Cadre>
      <p className="text-sm font-semibold tracking-wide uppercase text-ocean-dark">{org}</p>
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-dark mt-1">{t('cons.nouvelle.titre')}</h1>
      <p className="mt-4 text-dark leading-relaxed">{t('cons.nouvelle.intro')}</p>
      <ul className="mt-4 list-disc pl-6 space-y-1 text-dark-light">
        <li>{t('cons.nouvelle.point1')}</li>
        <li>{t('cons.nouvelle.point2')}</li>
        <li>{t('cons.nouvelle.point3')}</li>
      </ul>

      <form onSubmit={(e) => void creer(e)} noValidate className="mt-8 space-y-8">
        <section className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-5">
          <h2 className="font-serif text-xl font-bold text-dark">{t('cons.nouvelle.presentation')}</h2>
          <div>
            <label htmlFor={`${base}-titre`} className="font-semibold text-dark">
              {t('cons.champ.titre')}
            </label>
            <input id={`${base}-titre`} className="champ mt-2" maxLength={200} value={titre} onChange={(e) => setTitre(e.target.value)} aria-invalid={!!err('titre')} aria-describedby={decritPar(err('titre') && `${base}-titre-err`)} />
            <MessageErreur id={`${base}-titre-err`}>{err('titre')}</MessageErreur>
          </div>
          <div>
            <label htmlFor={`${base}-intro`} className="font-semibold text-dark">
              {t('cons.champ.intro')}
            </label>
            <textarea id={`${base}-intro`} className="champ mt-2 min-h-28" maxLength={2000} value={introduction} onChange={(e) => setIntroduction(e.target.value)} />
          </div>
          <fieldset className="space-y-2">
            <legend className="font-semibold text-dark">{t('cons.champ.formulation')}</legend>
            <Aide id={`${base}-formulation-aide`}>{t('cons.champ.formulation.aide')}</Aide>
            {angles.map((a) => (
              <label key={a.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${angleId === a.id ? 'border-ocean bg-sky/20' : 'border-mist'}`}>
                <input type="radio" name={`${base}-angle`} checked={angleId === a.id} onChange={() => setAngleId(a.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#2A6D8A]" />
                <span className="text-dark">
                  « {a.formulation} »
                  {a.id === recommande && <span className="ml-2 text-sm font-semibold text-succes">{t('cons.champ.recommandee')}</span>}
                  {a.origine === 'decideur' && <span className="ml-2 text-sm text-dark-light">{t('cons.champ.votre')}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor={`${base}-contact`} className="font-semibold text-dark">
              {t('cons.champ.contact')}
            </label>
            <Aide id={`${base}-contact-aide`}>{t('cons.champ.contact.aide')}</Aide>
            <input id={`${base}-contact`} className="champ mt-2" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} aria-invalid={!!err('contact')} aria-describedby={decritPar(`${base}-contact-aide`, err('contact') && `${base}-contact-err`)} />
            <MessageErreur id={`${base}-contact-err`}>{err('contact')}</MessageErreur>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor={`${base}-cloture`} className="font-semibold text-dark">
                {t('cons.champ.cloture')}
              </label>
              <input id={`${base}-cloture`} type="date" className="champ mt-2" min={dansJours(0)} max={dansJours(366)} value={cloture} onChange={(e) => setCloture(e.target.value)} aria-invalid={!!err('cloture')} aria-describedby={decritPar(err('cloture') && `${base}-cloture-err`)} />
              <MessageErreur id={`${base}-cloture-err`}>{err('cloture')}</MessageErreur>
            </div>
            <div>
              <label htmlFor={`${base}-conservation`} className="font-semibold text-dark">
                {t('cons.champ.conservation')}
              </label>
              <select id={`${base}-conservation`} className="champ mt-2" value={conservation} onChange={(e) => setConservation(Number(e.target.value))}>
                {[90, 180, 365, 730].map((j) => (
                  <option key={j} value={j}>
                    {t(`cons.conservation.${j}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-4">
          <h2 className="font-serif text-xl font-bold text-dark">{t('cons.nouvelle.categories')}</h2>
          <p className="text-dark-light">{t('cons.nouvelle.categories.aide')}</p>
          {categoriesDispo.map((c) => (
            <label key={c.cle} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={cles.has(c.cle)}
                onChange={(e) => setCles((s) => {
                  const n = new Set(s)
                  if (e.target.checked) n.add(c.cle)
                  else n.delete(c.cle)
                  return n
                })}
                className="mt-1 h-4 w-4 accent-[#2A6D8A]"
              />
              <span className="text-dark">
                {L.categorie[c.cle]} <span className="text-sm text-dark-light">({c.options.length} {t('cons.nouvelle.choix')})</span>
              </span>
            </label>
          ))}
        </section>

        <section className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-5">
          <h2 className="font-serif text-xl font-bold text-dark">{t('cons.nouvelle.questions')}</h2>
          <p className="text-dark-light">{t('cons.nouvelle.questions.aide')}</p>
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-xl border border-mist p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-dark">{t('cons.question.n', { n: i + 1 })}</p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondaire btn-petit" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={t('cons.question.monter', { n: i + 1 })}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-secondaire btn-petit" onClick={() => deplacer(i, 1)} disabled={i === questions.length - 1} aria-label={t('cons.question.descendre', { n: i + 1 })}>
                    ↓
                  </button>
                  <button type="button" className="btn btn-danger btn-petit" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}>
                    {t('cons.question.retirer')}
                  </button>
                </div>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-dark">{t('cons.question.intitule')}</span>
                <input className="champ mt-1" maxLength={400} value={q.intitule} onChange={(e) => majQuestion(i, { intitule: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-dark">{t('cons.question.type')}</span>
                <select className="champ mt-1" value={q.type} onChange={(e) => majQuestion(i, { type: e.target.value as TypeQuestion })}>
                  {TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {t(`cons.type.${ty}` as TranslationKey)}
                    </option>
                  ))}
                </select>
              </label>
              {(q.type === 'choix' || q.type === 'choix_multiples') && (
                <label className="block">
                  <span className="text-sm font-semibold text-dark">{t('cons.question.options')}</span>
                  <textarea className="champ mt-1 min-h-24" value={q.options} onChange={(e) => majQuestion(i, { options: e.target.value })} />
                </label>
              )}
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={q.obligatoire} onChange={(e) => majQuestion(i, { obligatoire: e.target.checked })} className="h-4 w-4 accent-[#2A6D8A]" />
                <span className="text-dark">{t('cons.question.obligatoire')}</span>
              </label>
            </div>
          ))}
          <MessageErreur id={`${base}-questions-err`}>{err('questions')}</MessageErreur>
          {questions.length < 30 && (
            <button type="button" className="btn btn-secondaire" onClick={() => setQuestions((qs) => [...qs, { id: nouvelId(), type: 'texte', intitule: '', options: '', obligatoire: false }])}>
              {t('cons.question.ajouter')}
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-5">
          <h2 className="font-serif text-xl font-bold text-dark">{t('cons.nouvelle.acces')}</h2>
          <div>
            <label htmlFor={`${base}-code`} className="font-semibold text-dark">
              {t('cons.champ.code')}
            </label>
            <Aide id={`${base}-code-aide`}>{t('cons.champ.code.aide', { email: EMAIL_CONTACT })}</Aide>
            <input id={`${base}-code`} className="champ mt-2 font-mono" autoComplete="off" maxLength={60} value={code} onChange={(e) => setCode(e.target.value)} aria-describedby={`${base}-code-aide`} />
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={secondePhrase} onChange={(e) => setSecondePhrase(e.target.checked)} className="mt-1 h-4 w-4 accent-[#2A6D8A]" />
            <span className="text-dark">{t('cons.champ.seconde')}</span>
          </label>
        </section>

        {montrerErreurs && Object.keys(erreurs).length > 0 && (
          <p className="text-alerte font-medium" role="alert">
            {t('cons.erreur.resume')}
          </p>
        )}
        {echec && (
          <p className="rounded-xl border border-alerte/40 bg-white p-4 text-alerte font-medium" role="alert">
            {echec}
          </p>
        )}
        <button type="submit" className="btn btn-primaire" disabled={envoi}>
          {envoi ? t('cons.nouvelle.creation') : t('cons.nouvelle.creer')}
        </button>
      </form>
    </Cadre>
  )
}
