import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { URL_GITHUB } from '../liens'
import { useTitre } from '../titre'

const PUBLICS: { titre: TranslationKey; texte: TranslationKey; icone: ReactNode }[] = [
  {
    titre: 'pourqui.commune.titre',
    texte: 'pourqui.commune.texte',
    icone: <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" />,
  },
  {
    titre: 'pourqui.administration.titre',
    texte: 'pourqui.administration.texte',
    icone: <path d="M3 21h18M4 10h16M12 3 3 8h18l-9-5ZM6 10v8M10 10v8M14 10v8M18 10v8" />,
  },
  {
    titre: 'pourqui.ecole.titre',
    texte: 'pourqui.ecole.texte',
    icone: <path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6" />,
  },
  {
    titre: 'pourqui.entreprise.titre',
    texte: 'pourqui.entreprise.texte',
    icone: <path d="M3 21h18M5 21V7h8v14M13 11h6v10M8 10h2M8 14h2M8 18h2M16 15h0M16 18h0" />,
  },
  {
    titre: 'pourqui.ong.titre',
    texte: 'pourqui.ong.texte',
    icone: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  },
]

const ETAPES: { titre: TranslationKey; texte: TranslationKey }[] = [
  { titre: 'comment.1.titre', texte: 'comment.1.texte' },
  { titre: 'comment.2.titre', texte: 'comment.2.texte' },
  { titre: 'comment.3.titre', texte: 'comment.3.texte' },
  { titre: 'comment.4.titre', texte: 'comment.4.texte' },
]

const CONTENU: TranslationKey[] = ['contenu.1', 'contenu.2', 'contenu.3', 'contenu.4', 'contenu.5', 'contenu.6']

const SOUVERAINETE: { titre: TranslationKey; texte: TranslationKey; icone: ReactNode }[] = [
  {
    titre: 'souv.1.titre',
    texte: 'souv.1.texte',
    icone: <path d="M4 5h16v11H4zM2 20h20M9 16v4M15 16v4" />,
  },
  {
    titre: 'souv.2.titre',
    texte: 'souv.2.texte',
    icone: <path d="M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7Zm1 3h0" />,
  },
  {
    titre: 'souv.3.titre',
    texte: 'souv.3.texte',
    icone: <path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" />,
  },
]

const PREUVES: { valeur: TranslationKey; texte: TranslationKey }[] = [
  { valeur: 'preuves.p1.valeur', texte: 'preuves.p1.texte' },
  { valeur: 'preuves.p2.valeur', texte: 'preuves.p2.texte' },
  { valeur: 'preuves.p3.valeur', texte: 'preuves.p3.texte' },
  { valeur: 'preuves.p4.valeur', texte: 'preuves.p4.texte' },
]

const LIMITES: TranslationKey[] = ['limites.1', 'limites.2', 'limites.3', 'limites.4']

function Icone({ children }: { children: ReactNode }) {
  return (
    <span className="w-12 h-12 rounded-2xl bg-mist/70 text-ocean-dark flex items-center justify-center mb-4">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  )
}

function EnTeteSection({ titre, intro, id }: { titre: string; intro?: string; id: string }) {
  return (
    <div className="max-w-2xl mb-10">
      <h2 id={id} className="font-serif text-3xl md:text-4xl font-bold text-dark text-balance">
        {titre}
      </h2>
      {intro && <p className="mt-4 text-lg text-dark-light leading-relaxed">{intro}</p>}
    </div>
  )
}

export default function Accueil() {
  const { t } = useLanguage()
  useTitre('')

  return (
    <>
      {/* En-tête */}
      <section className="gradient-hero text-white sur-fond-sombre" aria-labelledby="titre-accueil">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <p className="text-sky font-semibold text-sm tracking-widest uppercase">{t('hero.surtitre')}</p>
          <h1 id="titre-accueil" className="mt-4 font-serif text-4xl sm:text-5xl md:text-6xl font-bold leading-tight max-w-3xl text-balance">
            {t('hero.titre')}
          </h1>
          <p className="mt-6 text-lg md:text-xl text-white/90 leading-relaxed max-w-2xl">{t('hero.texte')}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link to="/nouveau" className="btn btn-clair text-base px-6 py-3">
              {t('general.cta')}
            </Link>
            <a href="#preuves" className="btn btn-contour-clair text-base px-6 py-3">
              {t('hero.cta2')}
            </a>
          </div>
          <p className="mt-6 text-sm text-white/80">{t('hero.rassurance')}</p>
        </div>
      </section>

      {/* Pour qui */}
      <section className="py-16 md:py-24" aria-labelledby="pour-qui">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <EnTeteSection id="pour-qui" titre={t('pourqui.titre')} intro={t('pourqui.intro')} />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PUBLICS.map((p) => (
              <li key={p.titre} className="rounded-2xl border border-mist bg-white p-6">
                <Icone>{p.icone}</Icone>
                <h3 className="font-semibold text-lg text-dark">{t(p.titre)}</h3>
                <p className="mt-2 text-dark-light leading-relaxed">{t(p.texte)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="py-16 md:py-24 bg-mist/40" aria-labelledby="comment">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <EnTeteSection id="comment" titre={t('comment.titre')} intro={t('comment.intro')} />
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ETAPES.map((e, i) => (
              <li key={e.titre} className="rounded-2xl bg-white p-6 border border-mist">
                <span className="w-10 h-10 rounded-full bg-ocean-dark text-white font-bold flex items-center justify-center" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold text-lg text-dark">
                  <span className="sr-only">{i + 1}. </span>
                  {t(e.titre)}
                </h3>
                <p className="mt-2 text-dark-light leading-relaxed">{t(e.texte)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Contenu du rapport */}
      <section className="py-16 md:py-24" aria-labelledby="contenu-rapport">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <EnTeteSection id="contenu-rapport" titre={t('contenu.titre')} intro={t('contenu.intro')} />
          <ul className="grid gap-x-10 gap-y-5 md:grid-cols-2">
            {CONTENU.map((c) => (
              <li key={c} className="flex gap-3">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="w-6 h-6 text-ocean-dark shrink-0 mt-0.5" fill="currentColor">
                  <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1.2 11.4L5.3 9.9l1.3-1.3 2.2 2.2 4.6-4.6 1.3 1.3-5.9 5.9Z" />
                </svg>
                <p className="text-dark leading-relaxed">{t(c)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Souveraineté */}
      <section className="py-16 md:py-24 bg-mist/40" aria-labelledby="souverainete">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <EnTeteSection id="souverainete" titre={t('souv.titre')} intro={t('souv.intro')} />
          <ul className="grid gap-5 md:grid-cols-3">
            {SOUVERAINETE.map((s) => (
              <li key={s.titre} className="rounded-2xl bg-white p-6 border border-mist">
                <Icone>{s.icone}</Icone>
                <h3 className="font-semibold text-lg text-dark">{t(s.titre)}</h3>
                <p className="mt-2 text-dark-light leading-relaxed">{t(s.texte)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Preuves */}
      <section id="preuves" className="py-16 md:py-24 scroll-mt-16" aria-labelledby="titre-preuves">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <EnTeteSection id="titre-preuves" titre={t('preuves.titre')} intro={t('preuves.intro')} />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PREUVES.map((p) => (
              <li key={p.valeur} className="rounded-2xl border border-mist bg-white p-6">
                <p className="font-serif text-4xl font-bold text-ocean-dark">{t(p.valeur)}</p>
                <p className="mt-3 text-dark-light leading-relaxed text-sm">{t(p.texte)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-2xl bg-peach/20 border border-peach/60 p-6 md:p-8">
            <h3 className="font-semibold text-lg text-dark">{t('limites.titre')}</h3>
            <ul className="mt-4 space-y-3">
              {LIMITES.map((l) => (
                <li key={l} className="flex gap-3">
                  <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-dark-light shrink-0" aria-hidden="true" />
                  <p className="text-dark leading-relaxed">{t(l)}</p>
                </li>
              ))}
            </ul>
            <p className="mt-5">
              <Link className="lien font-semibold" to="/fiabilite">{t('fiab.lien')}</Link>
            </p>
          </div>

          <p className="mt-8">
            <a className="lien" href={`${URL_GITHUB}/tree/main/tests_aveugles`} target="_blank" rel="noopener noreferrer">
              {t('preuves.lien')}
              <span className="sr-only"> {t('general.nouvelOnglet')}</span>
            </a>
          </p>
        </div>
      </section>

      {/* Code ouvert */}
      <section className="py-16 md:py-20 bg-dark text-white sur-fond-sombre" aria-labelledby="code-ouvert">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="max-w-2xl">
            <h2 id="code-ouvert" className="font-serif text-3xl md:text-4xl font-bold text-balance">
              {t('code.titre')}
            </h2>
            <p className="mt-4 text-white/85 leading-relaxed text-lg">{t('code.texte')}</p>
          </div>
          <a href={URL_GITHUB} target="_blank" rel="noopener noreferrer" className="btn btn-clair text-base px-6 py-3 self-start md:self-center">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
            </svg>
            {t('code.cta')}
            <span className="sr-only"> {t('general.nouvelOnglet')}</span>
          </a>
        </div>
      </section>

      {/* Appel final */}
      <section className="py-16 md:py-24" aria-labelledby="final">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 id="final" className="font-serif text-3xl md:text-4xl font-bold text-dark text-balance">
            {t('final.titre')}
          </h2>
          <p className="mt-4 text-lg text-dark-light leading-relaxed">{t('final.texte')}</p>
          <Link to="/nouveau" className="btn btn-primaire text-base px-7 py-3 mt-8">
            {t('general.cta')}
          </Link>
        </div>
      </section>
    </>
  )
}
