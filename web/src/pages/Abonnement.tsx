// Abonnement RegenVox : choix de la formule, code tiré au sort ici et noté avant de payer, puis paiement chez Stripe.
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useTitre } from '../titre'
import { EMAIL_CONTACT } from '../liens'
import { codeLisible, garderCode, lienPaiement, lireFormules, nouveauCode, type Formule } from '../abonnement'

export default function Abonnement() {
  const { t, lang } = useLanguage()
  useTitre(t('abo.titre'))
  const [etat, setEtat] = useState<{ ouvert: boolean; formules: Formule[] } | null | 'erreur'>(null)
  const [choix, setChoix] = useState<Formule | null>(null)

  useEffect(() => {
    lireFormules().then(setEtat, () => setEtat('erreur'))
  }, [])

  const formules = etat && etat !== 'erreur' && etat.ouvert ? etat.formules : []

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-dark">{t('abo.titre')}</h1>
        <p className="mt-4 text-dark leading-relaxed">{t('abo.intro')}</p>
        <p className="mt-3 text-dark-light leading-relaxed">{t('abo.ecoles', { email: EMAIL_CONTACT })}</p>
      </div>

      {etat === null && <p role="status">{t('general.chargement')}</p>}
      {etat !== null && formules.length === 0 && (
        <div className="rounded-2xl border border-mist bg-white p-6">
          <p className="text-dark">{t(etat === 'erreur' ? 'abo.erreur' : 'abo.ferme', { email: EMAIL_CONTACT })}</p>
        </div>
      )}

      {!choix && formules.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {formules.map((f) => (
            <li key={f.id} className="rounded-2xl border border-mist bg-white p-6 flex flex-col gap-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-dark">{f.nom}</h2>
                <p className="mt-1 text-xl font-semibold text-ocean-dark">{f.prix}</p>
                {f.detail && <p className="mt-2 text-dark-light leading-relaxed">{f.detail}</p>}
              </div>
              <ul className="space-y-2 text-dark leading-relaxed list-disc pl-5">
                <li>{t(f.periode === 'mois' ? 'abo.credit.mois' : 'abo.credit.total', { usd: f.plafond_usd.toLocaleString(lang === 'fr' ? 'fr-CH' : 'en-GB') })}</li>
                <li>{t(f.approfondi ? 'abo.approfondi.oui' : 'abo.approfondi.non')}</li>
                <li>{t('abo.consultation')}</li>
              </ul>
              <button type="button" className="btn btn-primaire mt-auto self-start" onClick={() => setChoix(f)}>
                {t('abo.choisir', { nom: f.nom })}
              </button>
            </li>
          ))}
        </ul>
      )}

      {choix && <Paiement formule={choix} onRetour={() => setChoix(null)} />}

      <div className="rounded-2xl bg-mist/40 p-6 space-y-2 text-dark-light leading-relaxed">
        <p>{t('abo.note.stripe')}</p>
        <p>{t('abo.note.code')}</p>
        <p>{t('abo.note.resilier', { email: EMAIL_CONTACT })}</p>
        <p>
          <Link to="/abonnement/merci" className="underline underline-offset-4 text-ocean-dark">
            {t('abo.dejaPaye')}
          </Link>
        </p>
      </div>
    </div>
  )
}

function Paiement({ formule, onRetour }: { formule: Formule; onRetour: () => void }) {
  const { t, lang } = useLanguage()
  const id = useId()
  const [code] = useState(nouveauCode)
  const [note, setNote] = useState(false)
  const [copie, setCopie] = useState<'ok' | 'non' | null>(null)
  const [depart, setDepart] = useState(false)

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(codeLisible(code))
      setCopie('ok')
    } catch {
      setCopie('non')
    }
  }

  const payer = async () => {
    setDepart(true)
    garderCode({ code, formule: formule.id, le: new Date().toISOString() })
    window.location.assign(await lienPaiement(formule, code, lang === 'en' ? 'en' : 'fr'))
  }

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-2xl border-2 border-ocean bg-white p-6 space-y-5">
      <div>
        <p className="text-sm font-semibold text-ocean-dark">{formule.nom}, {formule.prix}</p>
        <h2 id={`${id}-t`} className="font-serif text-2xl font-bold text-dark">{t('abo.code.titre')}</h2>
        <p className="mt-2 text-dark leading-relaxed">{t('abo.code.texte')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <output aria-label={t('abo.code.titre')} className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-dark bg-mist/40 rounded-xl px-4 py-3 select-all break-all">
          {codeLisible(code)}
        </output>
        <button type="button" className="btn btn-secondaire btn-petit" onClick={copier}>
          {t('abo.code.copier')}
        </button>
        <span role="status" className="text-sm text-dark-light">
          {copie === 'ok' ? t('abo.code.copie') : copie === 'non' ? t('abo.code.copieNon') : ''}
        </span>
      </div>
      <label className="flex items-start gap-3 text-dark">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={note} onChange={(e) => setNote(e.target.checked)} />
        <span>{t('abo.code.note')}</span>
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primaire" disabled={!note || depart} onClick={payer}>
          {depart ? t('abo.payer.depart') : t('abo.payer', { prix: formule.prix })}
        </button>
        <button type="button" className="btn btn-secondaire" onClick={onRetour} disabled={depart}>
          {t('abo.autreFormule')}
        </button>
      </div>
    </section>
  )
}
