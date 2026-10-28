// Tableau de bord d'une consultation réelle : partager le lien, relever et déchiffrer les réponses sur cet appareil,
// produire le rapport (chiffres et données anonymes, puis synthèse avec la clé d'IA de l'organisation), clore ou effacer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { useTitre } from '../titre'
import QrCode from '../components/QrCode'
import SaisieCle, { BlocRassurance, useSaisieCle, validerCle } from '../components/SaisieCle'
import { MAQUETTE } from '../moteur'
import { appelPourSynthese } from '../moteur/navigateur/moteur'
import { cleDisponible, retenirCle } from '../execution'
import { api, ErreurServeur } from '../consultation/api'
import { analyser } from '../consultation/analyse'
import { csvConsultation, rapportConsultation } from '../consultation/rapport'
import { lienDe, releverReponses } from '../consultation/operations'
import { enregistrerConsultation, lireConsultation, oublierConsultation } from '../consultation/stockage'
import { synthetiser, syntheseMaquette } from '../consultation/synthese'
import type { EtapeSynthese } from '../consultation/synthese'
import type { ConsultationLocale } from '../consultation/types'

const SANDBOX = 'allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox'

function telecharger(nom: string, contenu: string, type: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'consultation'

export default function Consultation() {
  const { id = '' } = useParams()
  const { t, formaterDate } = useLanguage()
  const navigate = useNavigate()
  const [c, setC] = useState<ConsultationLocale | null | undefined>(undefined)
  const [etatServeur, setEtatServeur] = useState<{ nombre: number; ouverte: boolean } | 'absente' | 'injoignable' | null>(null)
  const [occupe, setOccupe] = useState<null | 'releve' | 'rapport' | 'synthese' | 'fermer' | 'effacer'>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null)
  const [confirmer, setConfirmer] = useState<null | 'fermer' | 'effacer' | 'oublier'>(null)
  const [etape, setEtape] = useState<EtapeSynthese | null>(null)
  const [copie, setCopie] = useState(false)
  const saisieCle = useSaisieCle()
  const [montrerErreursCle, setMontrerErreursCle] = useState(false)
  const controleur = useRef<AbortController | null>(null)
  const cadre = useRef<HTMLIFrameElement>(null)
  const [hauteur, setHauteur] = useState<number | null>(null)

  useTitre(c ? c.questionnaire.titre : t('cons.titre'))

  useEffect(() => {
    lireConsultation(id)
      .then((x) => setC(x ?? null))
      .catch(() => setC(null))
  }, [id])

  const actualiser = useCallback(async (x: ConsultationLocale) => {
    try {
      const r = await api.compter(x.serveur, x.id, x.jeton)
      setEtatServeur({ nombre: r.nombre, ouverte: r.ouverte })
    } catch (e) {
      setEtatServeur(e instanceof ErreurServeur && e.code === 'inconnue' ? 'absente' : 'injoignable')
    }
  }, [])

  useEffect(() => {
    if (c) void actualiser(c)
  }, [c?.id, actualiser]) // eslint-disable-line react-hooks/exhaustive-deps

  const lien = c ? lienDe(c) : ''
  const analyse = useMemo(() => (c?.reponses ? analyser(c.questionnaire, c.reponses, c.simulation) : null), [c])

  async function sauver(x: ConsultationLocale) {
    await enregistrerConsultation(x)
    setC(x)
  }

  function erreurTexte(e: unknown): string {
    if (e instanceof ErreurServeur) {
      if (e.code === 'reseau' || e.code === 'reponse_illisible') return t('cons.erreur.serveur')
      if (e.code === 'jeton') return t('cons.erreur.jeton')
      if (e.code === 'inconnue') return t('cons.erreur.absente')
    }
    return e instanceof Error && e.message ? e.message : t('cons.erreur.inconnue')
  }

  async function relever() {
    if (!c) return
    setOccupe('releve')
    setMessage(null)
    try {
      const x = await releverReponses(c)
      setC(x)
      setMessage({ type: 'ok', texte: t('cons.releve.ok', { n: x.reponses?.length ?? 0 }) + (x.illisibles ? ' ' + t('cons.releve.illisibles', { n: x.illisibles }) : '') })
      void actualiser(x)
    } catch (e) {
      setMessage({ type: 'erreur', texte: erreurTexte(e) })
    } finally {
      setOccupe(null)
    }
  }

  function html(x: ConsultationLocale, synthese = x.synthese, modele?: string) {
    return rapportConsultation({
      q: x.questionnaire,
      sim: x.simulation,
      analyse: analyser(x.questionnaire, x.reponses ?? [], x.simulation),
      synthese,
      lignes: x.lignes_anonymes ?? [],
      cases_masquees: x.cases_masquees ?? 0,
      // Le nom de l'IA est gardé avec la synthèse : un rapport refait plus tard le cite toujours.
      modele: modele ?? synthese?.modele,
    })
  }

  async function preparerRapport() {
    if (!c?.reponses) return
    setOccupe('rapport')
    try {
      await sauver({ ...c, rapport_html: html(c) })
    } finally {
      setOccupe(null)
    }
  }

  async function lancerSynthese() {
    if (!c?.reponses || !c.lignes_anonymes) return
    let cle = cleDisponible()
    if (!cle && !MAQUETTE) {
      if (Object.keys(validerCle(saisieCle.etat)).length) {
        setMontrerErreursCle(true)
        return
      }
      cle = await saisieCle.verifier()
      if (!cle) return
      retenirCle(cle)
    }
    setOccupe('synthese')
    setMessage(null)
    controleur.current = new AbortController()
    try {
      const ctx = { q: c.questionnaire, sim: c.simulation, analyse: analyser(c.questionnaire, c.reponses, c.simulation), lignes: c.lignes_anonymes }
      const s = MAQUETTE ? syntheseMaquette(ctx) : await synthetiser(ctx, await appelPourSynthese(cle!), setEtape, controleur.current.signal)
      const modele = MAQUETTE ? undefined : cle!.fournisseur === 'autre' ? cle!.modeles?.analyse : { anthropic: 'Anthropic', mistral: 'Mistral AI', openai: 'OpenAI' }[cle!.fournisseur]
      const sm = { ...s, modele }
      await sauver({ ...c, synthese: sm, rapport_html: html(c, sm, modele) })
      setMessage({ type: 'ok', texte: t('cons.synthese.ok') })
    } catch (e) {
      setMessage({ type: 'erreur', texte: erreurTexte(e) })
    } finally {
      setOccupe(null)
      setEtape(null)
    }
  }

  async function fermer() {
    if (!c) return
    setOccupe('fermer')
    setConfirmer(null)
    try {
      await api.fermer(c.serveur, c.id, c.jeton)
      await sauver({ ...c, ferme: true })
      void actualiser(c)
      setMessage({ type: 'ok', texte: t('cons.fermer.ok') })
    } catch (e) {
      setMessage({ type: 'erreur', texte: erreurTexte(e) })
    } finally {
      setOccupe(null)
    }
  }

  async function effacer() {
    if (!c) return
    setOccupe('effacer')
    setConfirmer(null)
    try {
      await api.supprimer(c.serveur, c.id, c.jeton)
      setEtatServeur('absente')
      setMessage({ type: 'ok', texte: t('cons.effacer.ok') })
    } catch (e) {
      setMessage({ type: 'erreur', texte: erreurTexte(e) })
    } finally {
      setOccupe(null)
    }
  }

  async function oublier() {
    if (!c) return
    await oublierConsultation(c.id)
    navigate('/consultations')
  }

  const mesurer = useCallback(() => {
    try {
      const doc = cadre.current?.contentDocument
      if (doc?.documentElement) setHauteur(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0) + 16)
    } catch {
      // Hauteur par défaut.
    }
  }, [])

  if (c === undefined) return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16"><p role="status">{t('general.chargement')}</p></div>
  if (c === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-4">
        <h1 className="font-serif text-3xl font-bold text-dark">{t('cons.introuvable.titre')}</h1>
        <p className="text-dark">{t('cons.introuvable.texte')}</p>
        <Link to="/consultations/recuperer" className="btn btn-primaire">
          {t('cons.recuperer.lien')}
        </Link>
      </div>
    )
  }

  const q = c.questionnaire
  const synthesePerimee = c.synthese && c.reponses && c.synthese.nombre_reponses !== c.reponses.length
  const statut: TranslationKey =
    etatServeur === 'absente' ? 'cons.statut.effacee' : etatServeur === 'injoignable' || etatServeur === null ? 'cons.statut.inconnu' : etatServeur.ouverte ? 'cons.statut.ouverte' : 'cons.statut.close'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <p className="text-sm font-semibold tracking-wide uppercase text-ocean-dark">{q.organisation.nom}</p>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-dark mt-1">{q.titre}</h1>
        <p className="mt-3 text-dark-light">
          {t(statut, { date: q.cloture_le.split('-').reverse().join('.') })}
          {typeof etatServeur === 'object' && etatServeur && ` · ${t('cons.reponsesRecues', { n: etatServeur.nombre })}`}
        </p>
        <p className="mt-2 text-dark italic">« {q.formulation} »</p>
      </div>

      {message && (
        <p className={`rounded-xl border p-4 font-medium ${message.type === 'ok' ? 'border-succes/40 text-succes bg-succes/5' : 'border-alerte/40 text-alerte bg-white'}`} role={message.type === 'ok' ? 'status' : 'alert'}>
          {message.texte}
        </p>
      )}

      {etatServeur !== 'absente' && (
        <section aria-labelledby="partage" className="rounded-2xl border border-mist bg-white p-5 sm:p-6">
          <h2 id="partage" className="font-serif text-xl font-bold text-dark">{t('cons.partage.titre')}</h2>
          <p className="mt-2 text-dark-light">{t('cons.partage.aide')}</p>
          <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_auto] items-start">
            <div className="space-y-3 min-w-0">
              <label htmlFor="lien" className="font-semibold text-dark">{t('cons.partage.lien')}</label>
              <input id="lien" readOnly className="champ font-mono text-sm" value={lien} onFocus={(e) => e.target.select()} />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-primaire btn-petit"
                  onClick={() => {
                    void navigator.clipboard?.writeText(lien).then(() => {
                      setCopie(true)
                      setTimeout(() => setCopie(false), 2500)
                    })
                  }}
                >
                  {copie ? t('cons.partage.copie') : t('cons.partage.copier')}
                </button>
                <a className="btn btn-secondaire btn-petit" href={lien} target="_blank" rel="noopener noreferrer">
                  {t('cons.partage.voir')}
                </a>
              </div>
              <p className="text-sm text-dark-light">{t('cons.partage.prudence')}</p>
            </div>
            <figure className="justify-self-center text-center">
              <QrCode texte={lien} titre={t('cons.partage.qr')} />
              <figcaption className="mt-2 text-sm text-dark-light max-w-[14rem]">{t('cons.partage.qr.aide')}</figcaption>
            </figure>
          </div>
        </section>
      )}

      <section aria-labelledby="reponses" className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-4">
        <h2 id="reponses" className="font-serif text-xl font-bold text-dark">{t('cons.reponses.titre')}</h2>
        <p className="text-dark-light">{t('cons.reponses.aide')}</p>
        {c.releve_le && <p className="text-dark">{t('cons.reponses.derniere', { date: formaterDate(c.releve_le), n: c.reponses?.length ?? 0 })}</p>}
        <button type="button" className="btn btn-primaire" onClick={() => void relever()} disabled={!!occupe || etatServeur === 'absente'}>
          {occupe === 'releve' ? t('cons.reponses.encours') : t('cons.reponses.relever')}
        </button>
      </section>

      {c.reponses && analyse && (
        <section aria-labelledby="rapport" className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-5">
          <h2 id="rapport" className="font-serif text-xl font-bold text-dark">{t('cons.rapport.titre')}</h2>
          <p className="text-dark-light">{t('cons.rapport.aide')}</p>
          {analyse.n > 0 && analyse.score_reel !== null && (
            <p className="text-dark">
              {t('cons.rapport.apercu', { n: analyse.n, reel: analyse.score_reel.toFixed(2).replace('.', ','), simule: analyse.score_simule === null ? '?' : analyse.score_simule.toFixed(2).replace('.', ',') })}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondaire" onClick={() => void preparerRapport()} disabled={!!occupe || analyse.n === 0}>
              {t('cons.rapport.sansIA')}
            </button>
            <button type="button" className="btn btn-secondaire" disabled={!c.lignes_anonymes?.length} onClick={() => telecharger(`${slug(q.titre)}_donnees_anonymes.csv`, csvConsultation(q, c.lignes_anonymes ?? []), 'text/csv;charset=utf-8')}>
              {t('cons.rapport.csv')}
            </button>
          </div>

          <div className="rounded-xl border border-mist p-4 space-y-4">
            <h3 className="font-semibold text-dark">{t('cons.synthese.titre')}</h3>
            <p className="text-dark-light">{t('cons.synthese.aide')}</p>
            {synthesePerimee && <p className="text-alerte">{t('cons.synthese.perimee')}</p>}
            {!cleDisponible() && !MAQUETTE && (
              <>
                <BlocRassurance />
                <SaisieCle
                  etat={saisieCle.etat}
                  modifier={saisieCle.modifier}
                  verification={saisieCle.verification}
                  verifieeOk={saisieCle.verifieeOk}
                  onVerifier={() => {
                    if (Object.keys(validerCle(saisieCle.etat)).length) {
                      setMontrerErreursCle(true)
                      return
                    }
                    void saisieCle.verifier()
                  }}
                  erreurs={montrerErreursCle ? validerCle(saisieCle.etat) : {}}
                  idFournisseur="synthese-fournisseur"
                  idCle="synthese-cle"
                />
              </>
            )}
            <div className="flex flex-wrap gap-3 items-center">
              <button type="button" className="btn btn-primaire" onClick={() => void lancerSynthese()} disabled={!!occupe || analyse.n === 0}>
                {occupe === 'synthese' ? t(`cons.synthese.etape.${etape ?? 'lecture'}` as TranslationKey) : t('cons.synthese.lancer')}
              </button>
              {occupe === 'synthese' && (
                <button type="button" className="btn btn-danger btn-petit" onClick={() => controleur.current?.abort()}>
                  {t('cons.synthese.interrompre')}
                </button>
              )}
            </div>
            {c.synthese && <p className="text-sm text-dark-light">{t('cons.synthese.usage', { entree: c.synthese.usage.tokens_entree, sortie: c.synthese.usage.tokens_sortie })}</p>}
          </div>

          {c.rapport_html && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-primaire"
                  onClick={() => {
                    try {
                      cadre.current?.contentWindow?.focus()
                      cadre.current?.contentWindow?.print()
                    } catch {
                      window.print()
                    }
                  }}
                >
                  {t('rapport.imprimer')}
                </button>
                <button type="button" className="btn btn-secondaire" onClick={() => telecharger(`${slug(q.titre)}_rapport.html`, c.rapport_html!, 'text/html;charset=utf-8')}>
                  {t('cons.rapport.html')}
                </button>
              </div>
              <iframe
                ref={cadre}
                title={t('cons.rapport.cadre')}
                sandbox={SANDBOX}
                srcDoc={c.rapport_html}
                onLoad={mesurer}
                className="w-full rounded-xl border border-mist bg-white"
                style={{ height: hauteur ?? 900 }}
              />
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="gestion" className="rounded-2xl border border-mist bg-white p-5 sm:p-6 space-y-4">
        <h2 id="gestion" className="font-serif text-xl font-bold text-dark">{t('cons.gestion.titre')}</h2>
        <p className="text-dark-light">{t('cons.gestion.secours')}</p>
        <div className="flex flex-wrap gap-3">
          {etatServeur !== 'absente' && typeof etatServeur === 'object' && etatServeur?.ouverte && (
            <button type="button" className="btn btn-secondaire" onClick={() => setConfirmer('fermer')} disabled={!!occupe}>
              {t('cons.fermer.bouton')}
            </button>
          )}
          {etatServeur !== 'absente' && (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmer('effacer')} disabled={!!occupe}>
              {t('cons.effacer.bouton')}
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={() => setConfirmer('oublier')} disabled={!!occupe}>
            {t('cons.oublier.bouton')}
          </button>
        </div>
        {confirmer && (
          <div className="rounded-xl border border-alerte/40 bg-alerte/5 p-4 space-y-3" role="alertdialog" aria-labelledby="confirmation">
            <p id="confirmation" className="text-dark">{t(`cons.${confirmer}.confirmation` as TranslationKey)}</p>
            <div className="flex gap-3">
              <button type="button" className="btn btn-danger btn-petit" onClick={() => void (confirmer === 'fermer' ? fermer() : confirmer === 'effacer' ? effacer() : oublier())}>
                {t(`cons.${confirmer}.oui` as TranslationKey)}
              </button>
              <button type="button" className="btn btn-secondaire btn-petit" onClick={() => setConfirmer(null)}>
                {t('cons.annuler')}
              </button>
            </div>
          </div>
        )}
      </section>

      <Link to="/consultations" className="btn btn-secondaire">
        {t('cons.liste.retour')}
      </Link>
    </div>
  )
}
