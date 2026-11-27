// Abonnement proposé dans la simulation elle-même, quand le test approfondi est choisi sans code : le client paie chez
// Stripe et revient sur sa simulation, code rempli et vérifié, test approfondi choisi, prêt à lancer.
import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { EMAIL_CONTACT } from '../liens'
import { garderCode, lienPaiement, lireFormules, nouveauCode, prixAffiche, type Formule } from '../abonnement'

export default function AbonnementSurPlace({ onJaiUnCode }: { onJaiUnCode: () => void }) {
  const { t, lang } = useLanguage()
  const [formules, setFormules] = useState<Formule[] | null>(null)
  const [depart, setDepart] = useState<string | null>(null)

  useEffect(() => {
    lireFormules().then((r) => setFormules(r.ouvert ? r.formules : []), () => setFormules([]))
  }, [])

  const payer = async (f: Formule) => {
    setDepart(f.id)
    // Le code est tiré ici, gardé sur l'appareil, puis rempli tout seul au retour dans la simulation.
    const code = nouveauCode()
    garderCode({ code, formule: f.id, le: new Date().toISOString(), retour: '/nouveau', profondeur: 'approfondi' })
    window.location.assign(await lienPaiement(f, code, lang === 'en' ? 'en' : 'fr'))
  }

  return (
    <div className="mt-3 rounded-xl border-2 border-ocean bg-mist/30 p-4 space-y-3" role="region" aria-labelledby="abo-place-t">
      <p id="abo-place-t" className="font-semibold text-dark">{t('abo.place.titre')}</p>
      <p className="text-sm text-dark-light leading-relaxed">{t('abo.place.texte')}</p>
      {formules === null && <p role="status" className="text-sm">{t('general.chargement')}</p>}
      {formules && formules.length === 0 && <p className="text-sm text-dark">{t('abo.ferme', { email: EMAIL_CONTACT })}</p>}
      {formules && formules.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {formules.map((f) => (
            <button key={f.id} type="button" className="btn btn-primaire" disabled={depart !== null} onClick={() => void payer(f)}>
              {depart === f.id ? t('abo.payer.depart') : t('abo.place.payer', { nom: f.nom, prix: prixAffiche(f, lang) })}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm">
        <button type="button" className="underline underline-offset-4 text-ocean-dark" onClick={onJaiUnCode}>
          {t('abo.place.code')}
        </button>
      </p>
    </div>
  )
}
