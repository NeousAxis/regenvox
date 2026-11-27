// Retour après le paiement Stripe : le code tiré au sort avant de payer s'ouvre dès que Stripe confirme le paiement
// au serveur (quelques secondes en général). On le vérifie ici, sans rien demander d'autre à l'abonné.
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useTitre } from '../titre'
import { EMAIL_CONTACT } from '../liens'
import { Aide } from '../components/Champ'
import { SERVEUR_IA, codeGarde, codeLisible, garderCode } from '../abonnement'
import { lireBrouillon, memoriserCle } from '../stockage'
import { etatAbonnement, type EtatAbonnement } from '../../../src/appels'

const ATTENTE_MAX_MS = 180000
const INTERVALLE_MS = 3000

type Etat = { quoi: 'attente' } | { quoi: 'actif'; abo: EtatAbonnement } | { quoi: 'introuvable' } | { quoi: 'expire' } | { quoi: 'erreur' }

export default function AbonnementMerci() {
  const { t, lang } = useLanguage()
  useTitre(t('abo.merci.titre'))
  const argent = (n: number, d: number) => n.toLocaleString(lang === 'fr' ? 'fr-CH' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: 2 })
  const id = useId()
  const garde = codeGarde()
  const [code, setCode] = useState(garde?.code ?? '')
  const [saisie, setSaisie] = useState('')
  const [etat, setEtat] = useState<Etat | null>(null)
  const navigate = useNavigate()
  // Paiement parti d'une simulation : on y retourne dès que le code est ouvert, code rempli et test approfondi choisi.
  const retour = useRef(garde?.retour && garde.code === code ? { vers: garde.retour, profondeur: garde.profondeur } : null)
  const simulationEnCours = !!lireBrouillon()

  useEffect(() => {
    if (etat?.quoi !== 'actif') return
    // Le code ouvert est gardé sur l'appareil : la simulation le retrouve tout seul.
    memoriserCle({ fournisseur: 'regenvox', cle: code })
    const r = retour.current
    if (!r) return
    retour.current = null
    if (garde) garderCode({ code: garde.code, formule: garde.formule, le: garde.le })
    const minuteur = setTimeout(() => navigate(r.vers, { replace: true, state: { profondeur: r.profondeur } }), 1500)
    return () => clearTimeout(minuteur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat?.quoi])

  useEffect(() => {
    if (!code) return
    let fini = false
    const debut = Date.now()
    setEtat({ quoi: 'attente' })
    const verifier = async () => {
      while (!fini) {
        try {
          const abo = await etatAbonnement(SERVEUR_IA, code)
          if (!fini) setEtat({ quoi: 'actif', abo })
          return
        } catch (e: any) {
          if (fini) return
          if (e?.relais === 'expire') return setEtat({ quoi: 'expire' })
          // Code pas encore connu : Stripe n'a peut-être pas fini de prévenir le serveur.
          if (e?.relais !== 'code' && e?.relais !== 'ferme') return setEtat({ quoi: 'erreur' })
          if (Date.now() - debut > ATTENTE_MAX_MS) return setEtat({ quoi: 'introuvable' })
          await new Promise((ok) => setTimeout(ok, INTERVALLE_MS))
        }
      }
    }
    verifier()
    return () => {
      fini = true
    }
  }, [code])

  const valider = (e: React.FormEvent) => {
    e.preventDefault()
    const c = saisie.replace(/\s+/g, '').toUpperCase()
    if (c.length === 16) setCode(c)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-dark">{t('abo.merci.titre')}</h1>

      {code && (
        <div className="rounded-2xl border border-mist bg-white p-6 space-y-4" aria-live="polite">
          <p className="text-dark-light">{t('abo.merci.votreCode')}</p>
          <p className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-dark select-all break-all">{codeLisible(code)}</p>
          {etat?.quoi === 'attente' && <p role="status" className="text-dark">{t('abo.merci.attente')}</p>}
          {etat?.quoi === 'actif' && (
            <>
              <p className="text-dark font-semibold">{t('abo.merci.actif', { nom: etat.abo.nom })}</p>
              <p className="text-dark-light">
                {t(etat.abo.periode === 'mois' ? 'abo.merci.credit.mois' : 'abo.merci.credit.total', { restant: argent(etat.abo.restant_usd, 2), plafond: argent(etat.abo.plafond_usd, 0) })}
                {etat.abo.expire ? ` ${t('abo.merci.jusquau', { date: etat.abo.expire.split('-').reverse().join('.') })}` : ''}
              </p>
              <p className="text-dark leading-relaxed">{t('abo.merci.utiliser')}</p>
              {garde?.retour && garde.code === code && <p role="status" className="text-dark font-semibold">{t('abo.merci.retour')}</p>}
              <div className="flex flex-wrap gap-3">
                <Link to="/nouveau" state={{ profondeur: 'approfondi' }} className="btn btn-primaire">{t(simulationEnCours ? 'abo.merci.reprendre' : 'abo.merci.test')}</Link>
                <Link to="/prospectives" className="btn btn-secondaire">{t('abo.merci.consultation')}</Link>
              </div>
            </>
          )}
          {etat?.quoi === 'introuvable' && <p className="text-dark">{t('abo.merci.introuvable', { email: EMAIL_CONTACT })}</p>}
          {etat?.quoi === 'expire' && <p className="text-dark">{t('abo.merci.expire', { email: EMAIL_CONTACT })}</p>}
          {etat?.quoi === 'erreur' && <p className="text-dark">{t('abo.merci.erreur', { email: EMAIL_CONTACT })}</p>}
        </div>
      )}

      <form onSubmit={valider} className="rounded-2xl bg-mist/40 p-6 space-y-3">
        <label htmlFor={`${id}-code`} className="block font-semibold text-dark">
          {t(code ? 'abo.merci.autreCode' : 'abo.merci.saisir')}
        </label>
        <Aide id={`${id}-aide`}>{t('abo.merci.saisirAide', { email: EMAIL_CONTACT })}</Aide>
        <div className="flex flex-wrap gap-2">
          <input
            id={`${id}-code`}
            aria-describedby={`${id}-aide`}
            className="flex-1 min-w-0 rounded-xl border border-mist bg-white px-3 py-2 font-mono uppercase"
            autoComplete="off"
            spellCheck={false}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
          />
          <button type="submit" className="btn btn-secondaire">{t('cle.code.verifier')}</button>
        </div>
      </form>
    </div>
  )
}
