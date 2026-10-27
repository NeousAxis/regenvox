import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useTitre } from '../titre'

export default function Introuvable() {
  const { t } = useLanguage()
  useTitre(t('introuvable.titre'))
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
      <h1 className="font-serif text-3xl md:text-4xl font-bold text-dark">{t('introuvable.titre')}</h1>
      <p className="mt-4 text-dark-light">{t('introuvable.texte')}</p>
      <Link to="/" className="btn btn-primaire mt-8">
        {t('introuvable.retour')}
      </Link>
    </div>
  )
}
