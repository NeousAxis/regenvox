import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { telechargerProjet } from '../stockage'
import { useTitre } from '../titre'
import { useProjet } from '../useProjet'
import { prospectiveExploitable } from '../consultation/simulation'

// Le rapport est affiché dans un cadre isolé : aucun script du rapport ne s'exécute
// (pas de allow-scripts). allow-same-origin permet seulement à la page de mesurer
// la hauteur du rapport et de lancer l'impression.
const SANDBOX = 'allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox'

export default function Rapport() {
  const { id = '' } = useParams()
  const { t } = useLanguage()
  const { projet, stockageEchec } = useProjet(id)
  const cadre = useRef<HTMLIFrameElement>(null)
  const [hauteur, setHauteur] = useState<number | null>(null)

  useTitre(projet ? t('rapport.pour', { organisation: projet.parametres.organisation.nom }) : t('rapport.titre'))

  const mesurer = useCallback(() => {
    try {
      const doc = cadre.current?.contentDocument
      if (!doc?.documentElement) return
      const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)
      if (h > 0) setHauteur(h + 16)
    } catch {
      // Cadre inaccessible : on garde la hauteur par défaut.
    }
  }, [])

  // Ajuste la hauteur du cadre quand son contenu ou la fenêtre change de taille.
  useEffect(() => {
    const iframe = cadre.current
    if (!iframe) return
    let observateur: ResizeObserver | null = null
    const surChargement = () => {
      mesurer()
      try {
        const doc = iframe.contentDocument
        if (doc?.documentElement && typeof ResizeObserver !== 'undefined') {
          observateur?.disconnect()
          observateur = new ResizeObserver(() => mesurer())
          observateur.observe(doc.documentElement)
        }
      } catch {
        // Sans conséquence.
      }
    }
    iframe.addEventListener('load', surChargement)
    window.addEventListener('resize', mesurer)
    surChargement()
    return () => {
      iframe.removeEventListener('load', surChargement)
      window.removeEventListener('resize', mesurer)
      observateur?.disconnect()
    }
  }, [mesurer, projet?.rapport_html])

  function imprimer() {
    try {
      const fenetre = cadre.current?.contentWindow
      if (!fenetre) throw new Error('cadre absent')
      fenetre.focus()
      fenetre.print()
    } catch {
      window.print()
    }
  }

  if (projet === undefined) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <p role="status">{t('general.chargement')}</p>
      </div>
    )
  }

  if (projet === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="font-serif text-3xl font-bold text-dark">{t('suivi.introuvable.titre')}</h1>
        <p className="mt-4 text-dark-light leading-relaxed">{stockageEchec ? t('suivi.stockage.echec') : t('suivi.introuvable.texte')}</p>
        <Link to="/prospectives" className="btn btn-primaire mt-8">
          {t('action.mesTests')}
        </Link>
      </div>
    )
  }

  if (!projet.rapport_html) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="font-serif text-3xl font-bold text-dark">{t('rapport.titre')}</h1>
        <p className="mt-4 text-dark-light leading-relaxed">{t('rapport.pasPret')}</p>
        <Link to={`/test/${encodeURIComponent(projet.id)}`} className="btn btn-primaire mt-8">
          {t('rapport.retourSuivi')}
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-mist/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-6 pas-imprimer">
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-dark">
          {t('rapport.pour', { organisation: projet.parametres.organisation.nom })}
        </h1>
        <div className="mt-5 flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <button type="button" className="btn btn-primaire" onClick={imprimer} aria-describedby="astuce-pdf">
            {t('rapport.imprimer')}
          </button>
          <button type="button" className="btn btn-secondaire" onClick={() => telechargerProjet(projet)}>
            {t('action.enregistrer')}
          </button>
          <Link to="/nouveau" className="btn btn-secondaire">
            {t('action.nouveau')}
          </Link>
        </div>
        <p id="astuce-pdf" className="mt-3 text-sm text-dark-light">
          {t('rapport.astuce')}
        </p>
        {prospectiveExploitable(projet) && (
          <section aria-labelledby="passer" className="mt-6 rounded-2xl border border-ocean/40 bg-white p-5 max-w-3xl">
            <h2 id="passer" className="font-serif text-xl font-bold text-dark">{t('cons.passer.titre')}</h2>
            <p className="mt-2 text-dark leading-relaxed">{t('cons.passer.texte')}</p>
            <Link to={`/consultations/nouvelle/${encodeURIComponent(projet.id)}`} className="btn btn-primaire mt-4">
              {t('cons.passer.bouton')}
            </Link>
          </section>
        )}
      </div>
      <div className="bg-white border-y border-mist">
        <iframe
          ref={cadre}
          title={t('rapport.cadre')}
          srcDoc={projet.rapport_html}
          sandbox={SANDBOX}
          className="block w-full border-0"
          style={{ height: hauteur ? `${hauteur}px` : '80vh', minHeight: '60vh' }}
        />
      </div>
    </div>
  )
}
