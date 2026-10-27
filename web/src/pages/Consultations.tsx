// Liste des consultations réelles gardées sur cet appareil, et récupération avec une phrase de secours.
import { useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { useTitre } from '../titre'
import { Aide, MessageErreur, decritPar } from '../components/Champ'
import { ErreurServeur } from '../consultation/api'
import { IDENTIFIANT_VALIDE, normaliserPhrase } from '../consultation/chiffrement'
import { recupererConsultation } from '../consultation/operations'
import { listerConsultations } from '../consultation/stockage'
import type { ConsultationLocale } from '../consultation/types'

export default function Consultations() {
  const { t, formaterDate } = useLanguage()
  useTitre(t('cons.liste.titre'))
  const [liste, setListe] = useState<ConsultationLocale[] | null>(null)

  useEffect(() => {
    listerConsultations()
      .then(setListe)
      .catch(() => setListe([]))
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-dark">{t('cons.liste.titre')}</h1>
        <p className="mt-4 text-dark leading-relaxed">{t('cons.liste.intro')}</p>
      </div>
      {liste === null && <p role="status">{t('general.chargement')}</p>}
      {liste && liste.length === 0 && (
        <div className="rounded-2xl border border-mist bg-white p-6 space-y-3">
          <p className="text-dark">{t('cons.liste.vide')}</p>
          <Link to="/prospectives" className="btn btn-primaire">
            {t('action.mesTests')}
          </Link>
        </div>
      )}
      {liste && liste.length > 0 && (
        <ul className="space-y-3">
          {liste.map((c) => (
            <li key={c.id}>
              <Link to={`/consultation/${encodeURIComponent(c.id)}`} className="block rounded-2xl border border-mist bg-white p-5 hover:border-ocean">
                <p className="text-sm font-semibold text-ocean-dark">{c.questionnaire.organisation.nom}</p>
                <p className="font-serif text-xl font-bold text-dark">{c.questionnaire.titre}</p>
                <p className="mt-1 text-sm text-dark-light">
                  {t('cons.liste.ligne', { creee: formaterDate(c.cree_le), cloture: c.questionnaire.cloture_le.split('-').reverse().join('.'), n: c.reponses?.length ?? 0 })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Recuperer />
    </div>
  )
}

export function Recuperer() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const base = useId()
  const [code, setCode] = useState('')
  const [phrase, setPhrase] = useState('')
  const [montrer, setMontrer] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState<string | null>(null)

  const codeOk = IDENTIFIANT_VALIDE.test(code.trim())
  const phraseOk = normaliserPhrase(phrase) !== null

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    if (!codeOk || !phraseOk) {
      setMontrer(true)
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      const c = await recupererConsultation(code.trim(), phrase)
      navigate(`/consultation/${encodeURIComponent(c.id)}`)
    } catch (err) {
      const k: TranslationKey =
        err instanceof ErreurServeur
          ? err.code === 'phrase'
            ? 'cons.recuperer.phrase'
            : err.code === 'inconnue'
              ? 'cons.recuperer.inconnue'
              : err.code === 'trop_de_demandes'
                ? 'cons.echec.limite'
                : 'cons.erreur.serveur'
          : 'cons.recuperer.phrase'
      setEchec(t(k))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <section id="recuperer" aria-labelledby={`${base}-titre`} className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-5">
      <h2 id={`${base}-titre`} className="font-serif text-xl font-bold text-dark">{t('cons.recuperer.titre')}</h2>
      <p className="text-dark-light">{t('cons.recuperer.aide')}</p>
      <form onSubmit={(e) => void valider(e)} noValidate className="space-y-5">
        <div>
          <label htmlFor={`${base}-code`} className="font-semibold text-dark">{t('cons.secours.code')}</label>
          <input id={`${base}-code`} className="champ mt-2 font-mono" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={montrer && !codeOk} aria-describedby={decritPar(montrer && !codeOk && `${base}-code-err`)} />
          <MessageErreur id={`${base}-code-err`}>{montrer && !codeOk ? t('cons.recuperer.codeInvalide') : undefined}</MessageErreur>
        </div>
        <div>
          <label htmlFor={`${base}-phrase`} className="font-semibold text-dark">{t('cons.secours.phrase')}</label>
          <Aide id={`${base}-phrase-aide`}>{t('cons.recuperer.phraseAide')}</Aide>
          <input id={`${base}-phrase`} className="champ mt-2 font-mono tracking-wider" autoComplete="off" spellCheck={false} value={phrase} onChange={(e) => setPhrase(e.target.value)} aria-invalid={montrer && !phraseOk} aria-describedby={decritPar(`${base}-phrase-aide`, montrer && !phraseOk && `${base}-phrase-err`)} />
          <MessageErreur id={`${base}-phrase-err`}>{montrer && !phraseOk ? t('cons.recuperer.phraseInvalide') : undefined}</MessageErreur>
        </div>
        {echec && <p className="text-alerte font-medium" role="alert">{echec}</p>}
        <button type="submit" className="btn btn-primaire" disabled={envoi}>
          {envoi ? t('cons.recuperer.encours') : t('cons.recuperer.bouton')}
        </button>
      </form>
    </section>
  )
}

export function PageRecuperer() {
  const { t } = useLanguage()
  useTitre(t('cons.recuperer.titre'))
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <Recuperer />
    </div>
  )
}
