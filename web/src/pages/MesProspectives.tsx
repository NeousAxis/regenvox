import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import type { Projet } from '../moteur'
import {
  ErreurImport,
  enregistrerProjet,
  lireFichierProjet,
  lireProjet,
  listerProjets,
  supprimerProjet,
  telechargerProjet,
} from '../stockage'
import { enCoursAilleurs, enCoursIci } from '../execution'
import { useTitre } from '../titre'

type EtatListe = 'en_cours' | 'ailleurs' | 'termine' | 'erreur' | 'interrompu'

interface Message {
  type: 'ok' | 'erreur'
  texte: string
  lien?: string
}

const STYLE_ETAT: Record<EtatListe, string> = {
  en_cours: 'bg-sky/30 text-dark',
  ailleurs: 'bg-sky/30 text-dark',
  termine: 'bg-succes/10 text-succes',
  erreur: 'bg-alerte/10 text-alerte',
  interrompu: 'bg-peach/30 text-dark',
}

const LIBELLE_ETAT: Record<EtatListe, TranslationKey> = {
  en_cours: 'etat.en_cours',
  ailleurs: 'etat.ailleurs',
  termine: 'etat.termine',
  erreur: 'etat.erreur',
  interrompu: 'etat.interrompu',
}

const lienProjet = (p: Projet) =>
  p.etat === 'termine' && p.rapport_html ? `/test/${encodeURIComponent(p.id)}/rapport` : `/test/${encodeURIComponent(p.id)}`

export default function MesProspectives() {
  const { t, formaterDate } = useLanguage()
  useTitre(t('tests.titre'))
  const [projets, setProjets] = useState<Projet[] | null>(null)
  const [ailleurs, setAilleurs] = useState<Set<string>>(new Set())
  const [stockageEchec, setStockageEchec] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const champFichier = useRef<HTMLInputElement>(null)

  const charger = useCallback(async () => {
    try {
      const liste = await listerProjets()
      const autres = new Set<string>()
      for (const p of liste) {
        if (p.etat === 'en_cours' && !enCoursIci(p.id) && (await enCoursAilleurs(p.id))) autres.add(p.id)
      }
      setAilleurs(autres)
      setProjets(liste)
      setStockageEchec(false)
    } catch {
      setStockageEchec(true)
      setProjets([])
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  // Tant qu'une prospective tourne, la liste se met à jour toute seule.
  const unEnCours = projets?.some((p) => p.etat === 'en_cours' || enCoursIci(p.id)) ?? false
  useEffect(() => {
    if (!unEnCours) return
    const minuteur = setInterval(() => void charger(), 5000)
    return () => clearInterval(minuteur)
  }, [unEnCours, charger])

  function etatDe(p: Projet): EtatListe {
    if (enCoursIci(p.id)) return 'en_cours'
    if (p.etat === 'en_cours') return ailleurs.has(p.id) ? 'ailleurs' : 'interrompu'
    return p.etat
  }

  async function supprimer(p: Projet) {
    const nom = p.parametres.organisation.nom
    if (enCoursIci(p.id) || ailleurs.has(p.id)) {
      setMessage({ type: 'erreur', texte: t('tests.enCours.supprimer') })
      return
    }
    if (!window.confirm(t('tests.supprimer.confirmer', { nom }))) return
    try {
      await supprimerProjet(p.id)
      setMessage({ type: 'ok', texte: t('tests.supprime', { nom }) })
    } catch {
      setMessage({ type: 'erreur', texte: t('tests.stockage.echec') })
    }
    await charger()
  }

  async function importer(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    setMessage(null)
    let projet: Projet
    try {
      projet = await lireFichierProjet(fichier)
    } catch (err) {
      const code = err instanceof ErreurImport ? err.code : 'illisible'
      setMessage({ type: 'erreur', texte: t(`tests.import.${code}`) })
      return
    }
    const nom = projet.parametres.organisation.nom
    try {
      if (enCoursIci(projet.id)) {
        setMessage({ type: 'erreur', texte: t('tests.enCours.supprimer') })
        return
      }
      const existant = await lireProjet(projet.id)
      if (existant && !window.confirm(t('tests.import.remplacer', { nom }))) return
      await enregistrerProjet(projet)
    } catch {
      setMessage({ type: 'erreur', texte: t('tests.import.stockage') })
      return
    }
    setMessage({ type: 'ok', texte: t('tests.import.ok', { nom }), lien: lienProjet(projet) })
    await charger()
  }

  return (
    <div className="bg-mist/30 min-h-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-dark">{t('tests.titre')}</h1>
            <p className="mt-3 text-dark-light leading-relaxed">{t('tests.intro')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link to="/nouveau" className="btn btn-primaire">
              {t('action.nouveau')}
            </Link>
            <button type="button" className="btn btn-secondaire" onClick={() => champFichier.current?.click()} aria-describedby="aide-fichier">
              {t('tests.ouvrirFichier')}
            </button>
          </div>
        </div>
        <p id="aide-fichier" className="mt-3 text-sm text-dark-light md:text-right">
          {t('tests.ouvrirFichier.aide')}
        </p>
        <input
          ref={champFichier}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void importer(e)}
        />

        <div role="status" aria-live="polite" className="mt-6">
          {message && (
            <div
              className={`rounded-xl px-4 py-3 font-medium ${
                message.type === 'ok' ? 'bg-succes/10 text-succes border border-succes/30' : 'bg-alerte/5 text-alerte border border-alerte/40'
              }`}
            >
              {message.texte}
              {message.lien && (
                <>
                  {' '}
                  <Link to={message.lien} className="lien">
                    {t('tests.ouvrir')}
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        {stockageEchec && (
          <p className="mt-6 rounded-xl border border-alerte/40 bg-alerte/5 px-4 py-3 text-alerte font-medium">{t('tests.stockage.echec')}</p>
        )}

        <div className="mt-6">
          {projets === null && <p role="status">{t('general.chargement')}</p>}
          {projets !== null && projets.length === 0 && !stockageEchec && (
            <p className="rounded-2xl border border-dashed border-earth/60 bg-white px-6 py-10 text-center text-dark-light">{t('tests.vide')}</p>
          )}
          {projets !== null && projets.length > 0 && (
            <ul className="space-y-4">
              {projets.map((p) => {
                const nom = p.parametres.organisation.nom
                const etat = etatDe(p)
                return (
                  <li key={p.id} className="rounded-2xl border border-mist bg-white p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-lg text-dark break-words">
                          <Link to={lienProjet(p)} className="hover:text-ocean-dark hover:underline underline-offset-4">
                            {nom}
                          </Link>
                        </h2>
                        <p className="mt-1 text-sm text-dark-light">
                          {t(`type.${p.parametres.organisation.type}`)} · {t('tests.cree', { date: formaterDate(p.cree_le) })}
                        </p>
                      </div>
                      <span className={`self-start shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STYLE_ETAT[etat]}`}>
                        {t(LIBELLE_ETAT[etat])}
                      </span>
                    </div>
                    <p className="mt-3 text-dark leading-relaxed line-clamp-2">{p.parametres.demarche.formulation}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        to={lienProjet(p)}
                        className="btn btn-primaire btn-petit"
                        aria-label={t('tests.action.label', { action: t('tests.ouvrir'), nom })}
                      >
                        {t('tests.ouvrir')}
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondaire btn-petit"
                        onClick={() => telechargerProjet(p)}
                        aria-label={t('tests.action.label', { action: t('tests.enregistrer'), nom })}
                      >
                        {t('tests.enregistrer')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-petit"
                        onClick={() => void supprimer(p)}
                        aria-label={t('tests.action.label', { action: t('tests.supprimer'), nom })}
                      >
                        {t('tests.supprimer')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
