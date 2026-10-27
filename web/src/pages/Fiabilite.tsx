import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { useTitre } from '../titre'
import { URL_GITHUB } from '../liens'
import { CALIBRATION } from '../../../src/calibration'

// Ce que valent les chiffres de RegenVox : tous viennent des tests à l'aveugle publiés (src/calibration.ts,
// recalculé à partir des bilans), pour que l'utilisateur sache de combien un résultat peut se tromper.
export default function Fiabilite() {
  const { t, lang } = useLanguage()
  useTitre(t('fiab.titre'))
  const d = CALIBRATION.demarches
  const p = CALIBRATION.petitions
  const n = (x: number) => (lang === 'fr' ? String(x).replace('.', ',') : String(x))
  const vars = {
    n: d.n,
    median: n(d.facteur_median),
    dans2: d.dans_un_facteur_2,
    dans3: d.dans_un_facteur_3,
    max: n(Math.round(d.facteur_max * 10) / 10),
    sur: d.surestimations,
    pn: p.n,
    pdans2: p.dans_un_facteur_2,
    pdans3: p.dans_un_facteur_3,
    pmax: n(Math.round(p.facteur_max)),
  }
  const blocs: { titre: TranslationKey; textes: TranslationKey[] }[] = [
    { titre: 'fiab.comparer.titre', textes: ['fiab.comparer.1', 'fiab.comparer.2', 'fiab.comparer.3'] },
    { titre: 'fiab.nombre.titre', textes: ['fiab.nombre.1', 'fiab.nombre.2', 'fiab.nombre.3', 'fiab.nombre.4'] },
    { titre: 'fiab.petitions.titre', textes: ['fiab.petitions.1'] },
    { titre: 'fiab.limites.titre', textes: ['fiab.limites.1', 'fiab.limites.2', 'fiab.limites.3'] },
    { titre: 'fiab.lire.titre', textes: ['fiab.lire.1', 'fiab.lire.2', 'fiab.lire.3'] },
  ]
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 md:py-20">
      <h1 className="font-serif text-3xl md:text-4xl font-bold text-dark">{t('fiab.titre')}</h1>
      <p className="mt-4 text-lg text-dark-light leading-relaxed">{t('fiab.intro')}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-mist bg-white p-5">
          <p className="font-serif text-3xl font-bold text-ocean-dark">{t('fiab.chiffre1.valeur', vars)}</p>
          <p className="mt-2 text-sm text-dark-light leading-relaxed">{t('fiab.chiffre1.texte', vars)}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-white p-5">
          <p className="font-serif text-3xl font-bold text-ocean-dark">{t('fiab.chiffre2.valeur', vars)}</p>
          <p className="mt-2 text-sm text-dark-light leading-relaxed">{t('fiab.chiffre2.texte', vars)}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-white p-5">
          <p className="font-serif text-3xl font-bold text-ocean-dark">{t('fiab.chiffre3.valeur', vars)}</p>
          <p className="mt-2 text-sm text-dark-light leading-relaxed">{t('fiab.chiffre3.texte', vars)}</p>
        </div>
      </div>

      {blocs.map((b) => (
        <section key={b.titre} className="mt-12">
          <h2 className="font-serif text-2xl font-bold text-dark">{t(b.titre)}</h2>
          <div className="mt-4 space-y-4">
            {b.textes.map((k) => (
              <p key={k} className="text-dark leading-relaxed">{t(k, vars)}</p>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-12 text-sm text-dark-light">{t('fiab.maj', { date: CALIBRATION.genere_le.split('-').reverse().join('.') })}</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <a className="btn btn-secondaire" href={`${URL_GITHUB}/tree/main/tests_aveugles`} target="_blank" rel="noopener noreferrer">
          {t('fiab.github')}
          <span className="sr-only"> {t('general.nouvelOnglet')}</span>
        </a>
        <Link to="/nouveau" className="btn btn-primaire">{t('fiab.tester')}</Link>
      </div>
    </div>
  )
}
