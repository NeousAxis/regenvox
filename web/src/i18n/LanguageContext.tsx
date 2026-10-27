import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { translations } from './translations'
import type { TranslationKey } from './translations'

export type Language = 'fr' | 'en'
export type Variables = Record<string, string | number>

interface LanguageContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey, vars?: Variables) => string
  formaterDate: (iso: string) => string
  formaterNombre: (n: number) => string
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

const CLE_LANGUE = 'regenvox.langue'

// Le français est la langue par défaut ; le choix de l'utilisateur est retenu sur l'appareil.
function langueInitiale(): Language {
  try {
    const stockee = window.localStorage.getItem(CLE_LANGUE)
    if (stockee === 'fr' || stockee === 'en') return stockee
  } catch {
    // Stockage indisponible : français.
  }
  return 'fr'
}

// Typographie française : espace insécable avant les signes doubles et à l'intérieur des guillemets.
function typographieFr(s: string): string {
  return s
    .replace(/ ([:;?!»%])/g, ' $1')
    .replace(/« /g, '« ')
}

function remplir(s: string, vars?: Variables): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, nom: string) => (nom in vars ? String(vars[nom]) : m))
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(langueInitiale)

  useEffect(() => {
    document.documentElement.lang = lang
    try {
      window.localStorage.setItem(CLE_LANGUE, lang)
    } catch {
      // Sans conséquence.
    }
  }, [lang])

  const t = useCallback(
    (key: TranslationKey, vars?: Variables): string => {
      const brut = translations[lang][key] ?? translations.fr[key] ?? key
      const texte = remplir(brut, vars)
      return lang === 'fr' ? typographieFr(texte) : texte
    },
    [lang],
  )

  const formaterDate = useCallback(
    (iso: string): string => {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return iso
      return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CH' : 'en-GB', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(d)
    },
    [lang],
  )

  const formaterNombre = useCallback(
    (n: number): string => new Intl.NumberFormat(lang === 'fr' ? 'fr-CH' : 'en-GB').format(n),
    [lang],
  )

  const valeur = useMemo(() => ({ lang, setLang, t, formaterDate, formaterNombre }), [lang, t, formaterDate, formaterNombre])

  return <LanguageContext.Provider value={valeur}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
