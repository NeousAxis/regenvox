import { useLanguage } from '../i18n/LanguageContext'
import type { Etape } from '../moteur'

function Icone({ etat }: { etat: Etape['etat'] }) {
  if (etat === 'fait') {
    return (
      <span className="w-7 h-7 rounded-full bg-succes text-white flex items-center justify-center shrink-0">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m5 10.5 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (etat === 'en_cours') {
    return (
      <span className="w-7 h-7 rounded-full border-2 border-ocean-dark flex items-center justify-center shrink-0">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 text-ocean-dark tourne" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  if (etat === 'erreur') {
    return (
      <span className="w-7 h-7 rounded-full bg-alerte text-white flex items-center justify-center shrink-0 font-bold" aria-hidden="true">
        !
      </span>
    )
  }
  return <span className="w-7 h-7 rounded-full border-2 border-mist bg-white shrink-0" aria-hidden="true" />
}

export default function ListeEtapes({ etapes }: { etapes: Etape[] }) {
  const { t } = useLanguage()
  return (
    <ol className="space-y-1" aria-label={t('suivi.etapes')}>
      {etapes.map((e) => (
        <li
          key={e.cle}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${e.etat === 'en_cours' ? 'bg-mist/50' : ''}`}
          aria-current={e.etat === 'en_cours' ? 'step' : undefined}
        >
          <Icone etat={e.etat} />
          <span className={`flex-1 min-w-0 ${e.etat === 'a_faire' ? 'text-dark-light' : 'text-dark'} ${e.etat === 'en_cours' ? 'font-semibold' : ''}`}>
            {e.libelle}
          </span>
          <span className={`text-xs font-medium shrink-0 ${e.etat === 'erreur' ? 'text-alerte' : e.etat === 'fait' ? 'text-succes' : 'text-dark-light'}`}>
            {t(`etape.${e.etat}`)}
          </span>
        </li>
      ))}
    </ol>
  )
}
