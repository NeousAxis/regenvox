import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { MAQUETTE } from '../moteur'
import LanguageToggle from './LanguageToggle'
import Logo from './Logo'
import { EMAIL_CONTACT, URL_GITHUB, URL_REGENERE } from '../liens'


function RemonterEnHaut() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function Layout() {
  const { t } = useLanguage()
  const { pathname } = useLocation()
  const surFormulaire = pathname.startsWith('/nouveau')

  return (
    <div className="min-h-screen flex flex-col">
      <RemonterEnHaut />
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:text-dark focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
      >
        {t('general.evitement')}
      </a>

      {MAQUETTE && (
        <div className="bg-peach/40 text-dark text-center text-sm px-4 py-2" role="note">
          {t('general.maquette')}
        </div>
      )}

      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-mist pas-imprimer">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="rounded-lg" aria-label={`RegenVox, ${t('general.accueil')}`}>
            <Logo compact />
          </Link>
          <nav aria-label={t('general.nav')} className="flex items-center gap-2 sm:gap-4">
            <NavLink
              to="/prospectives"
              className={({ isActive }) =>
                `text-sm font-semibold px-2 py-2 rounded-lg ${isActive ? 'text-ocean-dark underline underline-offset-4' : 'text-dark-light hover:text-ocean-dark'}`
              }
            >
              {t('general.mesTests')}
            </NavLink>
            <LanguageToggle />
            {!surFormulaire && (
              <Link to="/nouveau" className="btn btn-primaire btn-petit hidden sm:inline-flex">
                {t('general.cta')}
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main id="contenu" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      <footer className="bg-dark text-white/85 sur-fond-sombre pas-imprimer">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-8 md:grid-cols-2">
          <div>
            <Logo clair />
            <p className="mt-4 text-white/80 leading-relaxed max-w-md">{t('pied.texte')}</p>
            <p className="mt-3 text-white/80 leading-relaxed max-w-md">{t('pied.donnees')}</p>
          </div>
          <ul className="space-y-3 md:justify-self-end">
            <li>
              <Link className="underline underline-offset-4 hover:text-sky" to="/fiabilite">
                {t('fiab.lien')}
              </Link>
            </li>
            <li>
              <a className="underline underline-offset-4 hover:text-sky" href={URL_GITHUB} target="_blank" rel="noopener noreferrer">
                {t('pied.code')}
                <span className="sr-only"> {t('general.nouvelOnglet')}</span>
              </a>
            </li>
            <li>
              <a className="underline underline-offset-4 hover:text-sky" href={URL_REGENERE} target="_blank" rel="noopener noreferrer">
                {t('pied.site')}
                <span className="sr-only"> {t('general.nouvelOnglet')}</span>
              </a>
            </li>
            <li>
              <a className="underline underline-offset-4 hover:text-sky" href={`mailto:${EMAIL_CONTACT}`}>
                {t('pied.contact')} ({EMAIL_CONTACT})
              </a>
            </li>
          </ul>
        </div>
        <div className="border-t border-white/10">
          <p className="max-w-6xl mx-auto px-4 sm:px-6 py-5 text-sm text-white/70">
            © {new Date().getFullYear()} Régénère Plus. RegenVox, {t('general.parRegenere')}, AGPL-3.0.
          </p>
        </div>
      </footer>
    </div>
  )
}
