import { useLanguage } from '../i18n/LanguageContext'

export default function LanguageToggle() {
  const { lang, setLang, t } = useLanguage()

  const bouton = (code: 'fr' | 'en', libelle: string, nomComplet: string) => (
    <button
      type="button"
      onClick={() => setLang(code)}
      aria-pressed={lang === code}
      lang={code}
      aria-label={nomComplet}
      className={`min-w-10 px-3 py-1.5 rounded-full transition-colors ${
        lang === code ? 'bg-ocean-dark text-white' : 'text-dark-light hover:text-ocean-dark'
      }`}
    >
      {libelle}
    </button>
  )

  return (
    <div
      role="group"
      aria-label={t('general.langue')}
      className="inline-flex items-center rounded-full p-0.5 text-xs font-semibold bg-mist/60 border border-mist"
    >
      {bouton('fr', 'FR', 'Français')}
      {bouton('en', 'EN', 'English')}
    </div>
  )
}
