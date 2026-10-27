import { useEffect, useState } from 'react'
import { useProjet } from '../useProjet'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import type { CleApi } from '../moteur'
import { lireProjet, telechargerProjet } from '../stockage'
import { cleDisponible, enCoursAilleurs, interrompre, lancer, retenirCle, sauvegardeEnEchec } from '../execution'
import { EMAIL_CONTACT } from '../liens'
import { useTitre } from '../titre'
import ListeEtapes from '../components/ListeEtapes'
import SaisieCle, { BlocRassurance, useSaisieCle, validerCle } from '../components/SaisieCle'

type EtatAffiche = 'chargement' | 'en_cours' | 'ailleurs' | 'interrompu' | 'pret' | 'termine' | 'erreur'

export default function Suivi() {
  const { id = '' } = useParams()
  const { t, formaterDate, formaterNombre } = useLanguage()
  const location = useLocation()
  const stockageInitialOk = (location.state as { stockageOk?: boolean } | null)?.stockageOk !== false
  const { projet, setProjet, actif, stockageEchec } = useProjet(id)
  const [ailleurs, setAilleurs] = useState<boolean | null>(null)
  const [demandeCle, setDemandeCle] = useState(false)
  const [reprise, setReprise] = useState(false)
  const [montrerErreursCle, setMontrerErreursCle] = useState(false)
  const saisieCle = useSaisieCle()

  // Un projet « en cours » qui ne tourne pas ici tourne peut-être dans un autre onglet.
  useEffect(() => {
    if (actif || !projet || projet.etat !== 'en_cours') {
      setAilleurs(false)
      return
    }
    let annule = false
    let minuteur: ReturnType<typeof setTimeout> | undefined
    void enCoursAilleurs(id).then((a) => {
      if (annule) return
      setAilleurs(a)
      if (a) {
        minuteur = setTimeout(() => {
          lireProjet(id)
            .then((p) => {
              if (!annule && p) setProjet(p)
            })
            .catch(() => undefined)
        }, 3000)
      }
    })
    return () => {
      annule = true
      if (minuteur) clearTimeout(minuteur)
    }
  }, [id, actif, projet, setProjet])

  const etapesFaites = projet?.etapes.filter((e) => e.etat === 'fait').length ?? 0
  const totalEtapes = projet?.etapes.length ?? 0
  useTitre(projet ? `${t('suivi.titre')} (${etapesFaites}/${totalEtapes})` : t('suivi.titre'))

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
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link to="/prospectives" className="btn btn-primaire">
            {t('action.mesTests')}
          </Link>
          <Link to="/nouveau" className="btn btn-secondaire">
            {t('action.nouveau')}
          </Link>
        </div>
      </div>
    )
  }

  let affiche: EtatAffiche
  if (actif) affiche = 'en_cours'
  else if (projet.etat === 'en_cours' || projet.etat === 'interrompu') {
    if (projet.etat === 'en_cours' && ailleurs === null) affiche = 'chargement'
    else if (ailleurs) affiche = 'ailleurs'
    else affiche = projet.etapes.every((e) => e.etat === 'a_faire') ? 'pret' : 'interrompu'
  } else affiche = projet.etat

  const projetCourant = projet
  // Une étape restée « en cours » dans un test qui ne tourne plus est affichée « à faire ».
  const etapesAffichees =
    affiche === 'en_cours' || affiche === 'ailleurs' || affiche === 'chargement'
      ? projet.etapes
      : projet.etapes.map((e) => (e.etat === 'en_cours' ? { ...e, etat: 'a_faire' as const } : e))

  async function reprendre(cleFournie?: CleApi) {
    const cle = cleFournie ?? cleDisponible()
    if (!cle) {
      setDemandeCle(true)
      setTimeout(() => document.getElementById('cle-fournisseur')?.focus(), 50)
      return
    }
    setReprise(true)
    const r = await lancer(projetCourant, cle)
    setReprise(false)
    if (r === 'ailleurs') setAilleurs(true)
    else setDemandeCle(false)
  }

  async function verifierEtReprendre() {
    const erreurs = Object.keys(validerCle(saisieCle.etat))
    if (erreurs.length > 0) {
      setMontrerErreursCle(true)
      document.getElementById(erreurs[0] === 'fournisseur' ? 'cle-fournisseur' : 'cle-cle')?.focus()
      return
    }
    const { etat } = saisieCle
    const cle =
      saisieCle.verifieeOk && etat.fournisseur ? saisieCle.cleCourante() : await saisieCle.verifier()
    if (!cle) {
      document.getElementById('cle-cle')?.focus()
      return
    }
    saisieCle.appliquerMemorisation(cle)
    retenirCle(cle)
    await reprendre(cle)
  }

  function demanderInterruption() {
    if (window.confirm(t('suivi.interrompre.confirmer'))) interrompre(id)
  }

  const nomOrganisation = projet.parametres.organisation.nom
  const pourcentage = totalEtapes > 0 ? Math.round((etapesFaites / totalEtapes) * 100) : 0
  const sauvegardeKo = !stockageInitialOk || sauvegardeEnEchec()
  const usage = projet.usage
  const boutonsReprise = (libelle: string) => (
    <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-3">
      <button type="button" className="btn btn-primaire" onClick={() => void reprendre()} disabled={reprise}>
        {reprise ? t('suivi.reprise') : libelle}
      </button>
      {!demandeCle && (
        <button type="button" className="btn btn-secondaire" onClick={() => setDemandeCle(true)}>
          {t('suivi.autreCle')}
        </button>
      )}
    </div>
  )

  return (
    <div className="bg-mist/30 min-h-full">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-dark">{t('suivi.titre')}</h1>
        <p className="mt-2 text-dark-light">
          <span className="font-semibold text-dark">{t(`type.${projet.parametres.organisation.type}`)}</span> ·{' '}
          {t('suivi.pour', { organisation: nomOrganisation, date: formaterDate(projet.cree_le) })}
        </p>

        {/* État du test */}
        <div className="mt-8 space-y-6">
          {affiche === 'chargement' && <p role="status">{t('general.chargement')}</p>}

          {affiche === 'en_cours' && (
            <div className="rounded-2xl border-2 border-peach bg-peach/20 p-5 sm:p-6 flex gap-4">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="w-8 h-8 text-dark shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M3 8h18M8 21h8" strokeLinecap="round" />
              </svg>
              <div>
                <p className="font-bold text-dark text-lg leading-snug">{t('suivi.garder.titre')}</p>
                <p className="mt-2 text-dark leading-relaxed">{t('suivi.garder.texte')}</p>
              </div>
            </div>
          )}

          {affiche === 'ailleurs' && (
            <div className="rounded-2xl border border-sky bg-sky/20 p-5 sm:p-6">
              <p className="font-semibold text-dark">{t('etat.ailleurs')}</p>
              <p className="mt-2 text-dark leading-relaxed">{t('suivi.ailleurs.texte')}</p>
            </div>
          )}

          {(affiche === 'interrompu' || affiche === 'pret') && (
            <div className="rounded-2xl border border-mist bg-white p-5 sm:p-6">
              <p className="font-semibold text-dark">{t(affiche === 'pret' ? 'etat.pret' : 'etat.interrompu')}</p>
              <p className="mt-2 text-dark leading-relaxed">{t(affiche === 'pret' ? 'suivi.pret.texte' : 'suivi.interrompu.texte')}</p>
              {boutonsReprise(t(affiche === 'pret' ? 'suivi.demarrer' : 'suivi.reprendre'))}
            </div>
          )}

          {affiche === 'erreur' && (
            <div className="rounded-2xl border border-alerte/40 bg-alerte/5 p-5 sm:p-6" role="alert">
              <p className="font-semibold text-alerte">{t('etat.erreur')}</p>
              <p className="mt-2 text-dark leading-relaxed">{t('suivi.erreur.texte')}</p>
              {projet.erreur && <p className="mt-2 text-sm text-dark-light break-words">{t('suivi.erreur.detail', { erreur: projet.erreur })}</p>}
              {boutonsReprise(t('suivi.reessayer'))}
              <p className="mt-4">
                <a className="lien" href={`mailto:${EMAIL_CONTACT}?subject=RegenVox`}>
                  {t('suivi.contact')} ({EMAIL_CONTACT})
                </a>
              </p>
            </div>
          )}

          {affiche === 'termine' && (
            <div className="rounded-2xl border border-succes/40 bg-succes/5 p-5 sm:p-6">
              <p className="font-semibold text-succes text-lg">{t('suivi.termine.texte')}</p>
              <Link to={`/test/${encodeURIComponent(projet.id)}/rapport`} className="btn btn-primaire mt-4">
                {t('suivi.voirRapport')}
              </Link>
            </div>
          )}

          {/* Saisie de la clé pour reprendre */}
          {demandeCle && affiche !== 'en_cours' && affiche !== 'termine' && (
            <section aria-labelledby="reprise-cle" className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-5">
              <h2 id="reprise-cle" className="font-serif text-xl font-bold text-dark">
                {t('suivi.cle.titre')}
              </h2>
              <p className="text-dark leading-relaxed">{t('suivi.cle.demande')}</p>
              <BlocRassurance />
              <SaisieCle
                etat={saisieCle.etat}
                modifier={saisieCle.modifier}
                verification={saisieCle.verification}
                verifieeOk={saisieCle.verifieeOk}
                onVerifier={() => {
                  if (Object.keys(validerCle(saisieCle.etat)).length > 0) {
                    setMontrerErreursCle(true)
                    return
                  }
                  void saisieCle.verifier()
                }}
                erreurs={montrerErreursCle ? validerCle(saisieCle.etat) : {}}
                idFournisseur="cle-fournisseur"
                idCle="cle-cle"
              />
              <button
                type="button"
                className="btn btn-primaire"
                onClick={() => void verifierEtReprendre()}
                disabled={reprise || saisieCle.verification.statut === 'encours'}
              >
                {reprise ? t('suivi.reprise') : t('suivi.verifierEtReprendre')}
              </button>
            </section>
          )}

          {/* Étapes */}
          <section aria-labelledby="titre-etapes" className="rounded-2xl border border-mist bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titre-etapes" className="font-serif text-xl font-bold text-dark">
                {t('suivi.etapes')}
              </h2>
              <p className="text-sm font-medium text-dark-light" aria-live="polite">
                {t('suivi.progression', { fait: etapesFaites, total: totalEtapes })}
              </p>
            </div>
            <div
              className="mt-3 h-2.5 rounded-full bg-mist overflow-hidden"
              role="progressbar"
              aria-label={t('suivi.progression.label')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pourcentage}
              aria-valuetext={t('suivi.progression', { fait: etapesFaites, total: totalEtapes })}
            >
              <div className="h-full bg-ocean-dark rounded-full transition-all duration-500" style={{ width: `${pourcentage}%` }} />
            </div>
            <div className="mt-4">
              <ListeEtapes etapes={etapesAffichees} />
            </div>
            {affiche === 'en_cours' && (
              <button type="button" className="btn btn-danger btn-petit mt-5" onClick={demanderInterruption}>
                {t('suivi.interrompre')}
              </button>
            )}
          </section>

          {usage && (usage.tokens_entree > 0 || usage.tokens_sortie > 0) && (
            <p className="text-sm text-dark-light">
              {t('suivi.usage', { entree: formaterNombre(usage.tokens_entree), sortie: formaterNombre(usage.tokens_sortie) })}
            </p>
          )}

          <p className={`text-sm ${sauvegardeKo ? 'text-alerte font-medium' : 'text-dark-light'}`}>
            {sauvegardeKo ? t('suivi.sauvegarde.echec') : t('suivi.sauvegarde')}
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" className="btn btn-secondaire" onClick={() => telechargerProjet(projet)}>
              {t('action.enregistrer')}
            </button>
            <Link to="/prospectives" className="btn btn-secondaire">
              {t('action.mesTests')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
