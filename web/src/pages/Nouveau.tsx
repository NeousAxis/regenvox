import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { moteur } from '../moteur'
import type { CleApi, ParametresTest, Projet, Territoire, TypeOrganisation } from '../moteur'
import { effacerBrouillon, enregistrerBrouillon, enregistrerProjet, lireBrouillon } from '../stockage'
import { lancer, retenirCle } from '../execution'
import { CANTONS, nomCanton } from '../cantons'
import { useTitre } from '../titre'
import { Aide, MessageErreur, decritPar } from '../components/Champ'
import RechercheCommune from '../components/RechercheCommune'
import type { Commune } from '../components/RechercheCommune'
import SaisieCle, { BlocRassurance, useSaisieCle, validerCle } from '../components/SaisieCle'

// Formulaire guidé en quatre étapes. Rien ne quitte le navigateur, sauf la clé
// envoyée au fournisseur choisi au moment de la vérifier et de lancer le test.

type Niveau = Territoire['niveau']
type PublicOng = '' | 'territoire' | 'membres'

interface GroupeSaisi {
  uid: string
  nom: string
  effectif: string
  age_min: string
  age_max: string
}

interface Brouillon {
  etape: number
  type: TypeOrganisation | ''
  nom: string
  publicOng: PublicOng
  niveau: Niveau | ''
  commune: Commune | null
  canton: string
  groupes: GroupeSaisi[]
  enjeu: string
  objectif: string
  formulation: string
  formats: string[]
  horizon: string
}

type Erreurs = Record<string, TranslationKey>

const TOTAL_ETAPES = 4
const TYPES: TypeOrganisation[] = ['commune', 'administration', 'ecole', 'entreprise', 'ong']
const FORMATS = ['avis_en_ligne', 'atelier_presentiel', 'parcours_distance', 'atelier_proche'] as const
const LONGUEUR_MAX = 2000

const BROUILLON_VIDE: Brouillon = {
  etape: 1,
  type: '',
  nom: '',
  publicOng: '',
  niveau: '',
  commune: null,
  canton: '',
  groupes: [],
  enjeu: '',
  objectif: '',
  formulation: '',
  formats: [],
  horizon: '12',
}

let compteurUid = 0
const nouvelUid = () => `g${Date.now().toString(36)}${(compteurUid++).toString(36)}`
const groupeVide = (): GroupeSaisi => ({ uid: nouvelUid(), nom: '', effectif: '', age_min: '', age_max: '' })

function brouillonInitial(): Brouillon {
  const b = lireBrouillon<Partial<Brouillon>>()
  if (!b || typeof b !== 'object') return BROUILLON_VIDE
  const fusion = { ...BROUILLON_VIDE, ...b }
  if (!Array.isArray(fusion.groupes)) fusion.groupes = []
  if (!Array.isArray(fusion.formats)) fusion.formats = []
  if (typeof fusion.etape !== 'number' || fusion.etape < 1 || fusion.etape > TOTAL_ETAPES) fusion.etape = 1
  return fusion
}

// Population : territoire ou groupes, selon le type d'organisation et le choix de l'ONG.
function modePopulation(b: Brouillon): 'territoire' | 'groupes' | null {
  switch (b.type) {
    case 'commune':
    case 'administration':
      return 'territoire'
    case 'ecole':
    case 'entreprise':
      return 'groupes'
    case 'ong':
      return b.publicOng === 'territoire' ? 'territoire' : b.publicOng === 'membres' ? 'groupes' : null
    default:
      return null
  }
}

function niveauxPossibles(type: Brouillon['type']): Niveau[] {
  if (type === 'commune') return ['commune']
  if (type === 'administration') return ['canton', 'suisse']
  if (type === 'ong') return ['commune', 'canton', 'suisse']
  return []
}

function niveauEffectif(b: Brouillon): Niveau | '' {
  const possibles = niveauxPossibles(b.type)
  if (possibles.length === 1) return possibles[0]
  return b.niveau && possibles.includes(b.niveau) ? b.niveau : ''
}

const entier = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null)

function validerEtape(etape: number, b: Brouillon): Erreurs {
  const e: Erreurs = {}
  if (etape === 1) {
    if (!b.type) e['org-type'] = 'erreur.type'
    if (!b.nom.trim()) e['org-nom'] = 'erreur.nom'
  }
  if (etape === 2) {
    if (b.type === 'ong' && !b.publicOng) e['pop-ong'] = 'erreur.ong'
    const mode = modePopulation(b)
    if (mode === 'territoire') {
      const niveau = niveauEffectif(b)
      if (!niveau) e['pop-niveau'] = 'erreur.niveau'
      if (niveau === 'commune' && !b.commune) e['commune'] = 'erreur.commune'
      if (niveau === 'canton' && !CANTONS.some((c) => c.sigle === b.canton)) e['pop-canton'] = 'erreur.canton'
    }
    if (mode === 'groupes') {
      if (b.groupes.length === 0) e['groupe-ajouter'] = 'erreur.groupes'
      for (const g of b.groupes) {
        if (!g.nom.trim()) e[`${g.uid}-nom`] = 'erreur.groupe.nom'
        const eff = entier(g.effectif)
        if (eff === null || eff < 1) e[`${g.uid}-effectif`] = 'erreur.groupe.effectif'
        const min = entier(g.age_min)
        const max = entier(g.age_max)
        if (min === null || min > 120) e[`${g.uid}-min`] = 'erreur.groupe.age'
        if (max === null || max > 120) e[`${g.uid}-max`] = 'erreur.groupe.age'
        else if (min !== null && min <= 120 && max < min) e[`${g.uid}-max`] = 'erreur.groupe.ages'
      }
    }
  }
  if (etape === 3) {
    if (b.enjeu.trim().length < 20) e['dem-enjeu'] = 'erreur.enjeu'
    if (b.objectif.trim().length < 10) e['dem-objectif'] = 'erreur.objectif'
    if (b.formulation.trim().length < 10) e['dem-formulation'] = 'erreur.formulation'
    if (b.formats.length === 0) e['dem-formats'] = 'erreur.formats'
    const h = entier(b.horizon)
    if (h === null || h < 1 || h > 120) e['dem-horizon'] = 'erreur.horizon'
  }
  return e
}

function construireParametres(b: Brouillon, langue: 'fr' | 'en'): ParametresTest {
  const p: ParametresTest = {
    langue,
    organisation: { type: b.type as TypeOrganisation, nom: b.nom.trim() },
    demarche: {
      enjeu: b.enjeu.trim(),
      objectif: b.objectif.trim(),
      formulation: b.formulation.trim(),
      formats: FORMATS.filter((f) => b.formats.includes(f)),
      horizon_mois: Number(b.horizon.trim()),
    },
  }
  if (modePopulation(b) === 'territoire') {
    const niveau = niveauEffectif(b) as Niveau
    if (niveau === 'commune') p.territoire = { niveau, commune_num: b.commune?.num }
    else if (niveau === 'canton') p.territoire = { niveau, canton: b.canton }
    else p.territoire = { niveau: 'suisse' }
  } else {
    p.groupes = b.groupes.map((g) => ({
      nom: g.nom.trim(),
      effectif: Number(g.effectif.trim()),
      age_min: Number(g.age_min.trim()),
      age_max: Number(g.age_max.trim()),
    }))
  }
  return p
}

function CarteChoix({
  nom,
  valeur,
  coche,
  onChoisir,
  titre,
  description,
  id,
  invalide,
}: {
  nom: string
  valeur: string
  coche: boolean
  onChoisir: () => void
  titre: string
  description?: string
  id?: string
  invalide?: boolean
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
        coche ? 'border-ocean-dark bg-mist/40' : 'border-mist hover:border-sky'
      }`}
    >
      <input
        id={id}
        type="radio"
        name={nom}
        value={valeur}
        checked={coche}
        onChange={onChoisir}
        className="mt-1 w-5 h-5 accent-ocean-dark shrink-0"
        aria-invalid={invalide ? true : undefined}
      />
      <span className="min-w-0">
        <span className="block font-semibold text-dark">{titre}</span>
        {description && <span className="block text-sm text-dark-light">{description}</span>}
      </span>
    </label>
  )
}

function ChampTexte({
  id,
  label,
  aide,
  valeur,
  onChange,
  erreur,
  multiligne,
  placeholder,
}: {
  id: string
  label: string
  aide?: ReactNode
  valeur: string
  onChange: (v: string) => void
  erreur?: string
  multiligne?: boolean
  placeholder?: string
}) {
  const proprietes = {
    id,
    className: 'champ mt-2',
    value: valeur,
    placeholder,
    maxLength: LONGUEUR_MAX,
    'aria-invalid': erreur ? true : undefined,
    'aria-describedby': decritPar(aide ? `${id}-aide` : undefined, erreur && `${id}-erreur`),
  }
  return (
    <div>
      <label htmlFor={id} className="block font-semibold text-dark">
        {label}
      </label>
      {aide && <Aide id={`${id}-aide`}>{aide}</Aide>}
      {multiligne ? (
        <textarea {...proprietes} rows={4} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...proprietes} type="text" onChange={(e) => onChange(e.target.value)} />
      )}
      <MessageErreur id={`${id}-erreur`}>{erreur}</MessageErreur>
    </div>
  )
}

function ChampNombre({
  id,
  label,
  valeur,
  onChange,
  erreur,
  aide,
  min,
  max,
  suffixe,
}: {
  id: string
  label: string
  valeur: string
  onChange: (v: string) => void
  erreur?: string
  aide?: string
  min: number
  max: number
  suffixe?: string
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block font-medium text-dark text-sm">
        {label}
      </label>
      {aide && (
        <p id={`${id}-aide`} className="text-xs text-dark-light">
          {aide}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          className="champ"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={decritPar(aide && `${id}-aide`, erreur && `${id}-erreur`)}
        />
        {suffixe && <span className="text-sm text-dark-light shrink-0">{suffixe}</span>}
      </div>
      <MessageErreur id={`${id}-erreur`}>{erreur}</MessageErreur>
    </div>
  )
}

export default function Nouveau() {
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const [b, setB] = useState<Brouillon>(brouillonInitial)
  const [montrer, setMontrer] = useState<Record<number, boolean>>({})
  const [cibleFocus, setCibleFocus] = useState<string | null>(null)
  const [lancement, setLancement] = useState(false)
  const [erreurLancement, setErreurLancement] = useState<string | null>(null)
  const [montrerErreursCle, setMontrerErreursCle] = useState(false)
  const saisieCle = useSaisieCle()
  const titreEtape = useRef<HTMLHeadingElement>(null)
  const etape = b.etape
  const etapePrecedente = useRef(etape)
  const nomsEtapes: TranslationKey[] = ['nouveau.etape1', 'nouveau.etape2', 'nouveau.etape3', 'nouveau.etape4']
  useTitre(`${t('nouveau.titre')} (${t(nomsEtapes[etape - 1])})`)

  // Le brouillon (sans la clé) est gardé le temps de l'onglet.
  useEffect(() => {
    enregistrerBrouillon(b)
  }, [b])

  // À chaque changement d'étape, le focus va sur le titre de l'étape.
  useEffect(() => {
    if (etapePrecedente.current === etape) return
    etapePrecedente.current = etape
    window.scrollTo(0, 0)
    titreEtape.current?.focus()
  }, [etape])

  // Focus sur le premier champ en erreur.
  useEffect(() => {
    if (!cibleFocus) return
    const el = document.getElementById(cibleFocus)
    if (el) {
      el.focus()
      el.scrollIntoView({ block: 'center' })
    }
    setCibleFocus(null)
  }, [cibleFocus])

  const maj = (m: Partial<Brouillon>) => setB((x) => ({ ...x, ...m }))
  const erreurs = validerEtape(etape, b)
  const visibles: Erreurs = montrer[etape] ? erreurs : {}
  const err = (cle: string) => (visibles[cle] ? t(visibles[cle]) : undefined)
  const erreursCle = validerCle(saisieCle.etat)
  const erreursCleVisibles = montrerErreursCle ? erreursCle : {}

  function choisirType(type: TypeOrganisation) {
    setB((x) => {
      const suivant: Brouillon = { ...x, type }
      if (!niveauxPossibles(type).includes(x.niveau as Niveau)) suivant.niveau = ''
      if (modePopulation(suivant) === 'groupes' && x.groupes.length === 0) suivant.groupes = [groupeVide()]
      return suivant
    })
  }

  function choisirPublicOng(publicOng: PublicOng) {
    setB((x) => {
      const suivant: Brouillon = { ...x, publicOng }
      if (publicOng === 'membres' && x.groupes.length === 0) suivant.groupes = [groupeVide()]
      return suivant
    })
  }

  function majGroupe(uid: string, m: Partial<GroupeSaisi>) {
    setB((x) => ({ ...x, groupes: x.groupes.map((g) => (g.uid === uid ? { ...g, ...m } : g)) }))
  }

  function ajouterGroupe() {
    const g = groupeVide()
    setB((x) => ({ ...x, groupes: [...x.groupes, g] }))
    setCibleFocus(`${g.uid}-nom`)
  }

  function retirerGroupe(uid: string) {
    setB((x) => ({ ...x, groupes: x.groupes.filter((g) => g.uid !== uid) }))
    setCibleFocus('groupe-ajouter')
  }

  function allerA(n: number) {
    maj({ etape: n })
  }

  function suivant() {
    const e = validerEtape(etape, b)
    const cles = Object.keys(e)
    if (cles.length > 0) {
      setMontrer((m) => ({ ...m, [etape]: true }))
      setCibleFocus(cles[0])
      return
    }
    allerA(Math.min(etape + 1, TOTAL_ETAPES))
  }

  async function lancerTest() {
    setErreurLancement(null)
    for (let n = 1; n < TOTAL_ETAPES; n++) {
      const e = Object.keys(validerEtape(n, b))
      if (e.length > 0) {
        setMontrer((m) => ({ ...m, [n]: true }))
        allerA(n)
        setTimeout(() => setCibleFocus(e[0]), 50)
        return
      }
    }
    const ec = Object.keys(erreursCle)
    if (ec.length > 0) {
      setMontrerErreursCle(true)
      setCibleFocus(ec[0] === 'fournisseur' ? 'cle-fournisseur' : 'cle-cle')
      return
    }

    setLancement(true)
    const { etat } = saisieCle
    const cle: CleApi | null =
      saisieCle.verifieeOk && etat.fournisseur ? saisieCle.cleCourante() : await saisieCle.verifier()
    if (!cle) {
      setLancement(false)
      setCibleFocus('cle-cle')
      return
    }
    saisieCle.appliquerMemorisation(cle)
    retenirCle(cle)

    let projet: Projet
    try {
      projet = moteur.creer(construireParametres(b, lang))
    } catch (e) {
      setErreurLancement(t('nouveau.erreurLancement', { message: e instanceof Error ? e.message : String(e) }))
      setLancement(false)
      return
    }

    let stockageOk = true
    try {
      await enregistrerProjet(projet)
    } catch {
      stockageOk = false
    }

    const resultat = await lancer(projet, cle)
    if (resultat === 'ailleurs') {
      setErreurLancement(t('nouveau.ailleurs'))
      setLancement(false)
      return
    }
    effacerBrouillon()
    navigate(`/test/${encodeURIComponent(projet.id)}`, { state: { stockageOk } })
  }

  const mode = modePopulation(b)
  const niveaux = niveauxPossibles(b.type)
  const niveau = niveauEffectif(b)
  const cantonsTries = [...CANTONS].sort((x, y) => x[lang].localeCompare(y[lang], lang))
  const aEnErreur = Object.keys(visibles).length > 0

  const descriptionPopulation = (): string => {
    if (mode === 'territoire') {
      if (niveau === 'commune') return b.commune ? `${b.commune.nom} (${b.commune.canton})` : ''
      if (niveau === 'canton') return t('recap.canton', { nom: `${nomCanton(b.canton, lang)} (${b.canton})` })
      if (niveau === 'suisse') return t('recap.suisse')
      return ''
    }
    const total = b.groupes.reduce((s, g) => s + (entier(g.effectif) ?? 0), 0)
    return b.groupes.length === 1 ? t('recap.groupe', { total }) : t('recap.groupes', { n: b.groupes.length, total })
  }

  return (
    <div className="bg-mist/30 min-h-full">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-dark">{t('nouveau.titre')}</h1>
        <p className="mt-2 text-dark-light">{t('nouveau.intro')}</p>

        {/* Progression */}
        <div className="mt-8">
          <p className="text-sm font-semibold text-dark">
            {t('nouveau.progression', { n: etape, total: TOTAL_ETAPES })}
            <span className="sm:hidden"> : {t(nomsEtapes[etape - 1])}</span>
          </p>
          <div
            className="mt-2 h-2.5 rounded-full bg-mist overflow-hidden"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={TOTAL_ETAPES}
            aria-valuenow={etape}
            aria-valuetext={`${t('nouveau.progression', { n: etape, total: TOTAL_ETAPES })}, ${t(nomsEtapes[etape - 1])}`}
            aria-label={t('nouveau.titre')}
          >
            <div className="h-full bg-ocean-dark rounded-full transition-all duration-300" style={{ width: `${(etape / TOTAL_ETAPES) * 100}%` }} />
          </div>
          <ol className="hidden sm:grid grid-cols-4 gap-2 mt-3 text-sm">
            {nomsEtapes.map((n, i) => (
              <li
                key={n}
                aria-current={i + 1 === etape ? 'step' : undefined}
                className={i + 1 === etape ? 'font-semibold text-ocean-dark' : i + 1 < etape ? 'text-dark' : 'text-dark-light'}
              >
                {i + 1}. {t(n)}
              </li>
            ))}
          </ol>
        </div>

        <form
          className="mt-8 rounded-2xl bg-white border border-mist shadow-sm p-5 sm:p-8"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (etape < TOTAL_ETAPES) suivant()
            else void lancerTest()
          }}
        >
          <h2 ref={titreEtape} tabIndex={-1} className="font-serif text-2xl font-bold text-dark focus:outline-none">
            {t(nomsEtapes[etape - 1])}
          </h2>

          {aEnErreur && (
            <div role="alert" className="mt-4 rounded-xl border border-alerte/40 bg-alerte/5 px-4 py-3 text-sm font-medium text-alerte">
              {t('nouveau.resumeErreurs')}
            </div>
          )}

          <div className="mt-6 space-y-7">
            {/* Étape 1 : qui êtes-vous */}
            {etape === 1 && (
              <>
                <fieldset aria-describedby={decritPar(visibles['org-type'] && 'org-type-erreur')}>
                  <legend className="font-semibold text-dark mb-2">{t('org.type.label')}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {TYPES.map((type, i) => (
                      <CarteChoix
                        key={type}
                        id={i === 0 ? 'org-type' : undefined}
                        nom="org-type"
                        valeur={type}
                        coche={b.type === type}
                        onChoisir={() => choisirType(type)}
                        titre={t(`type.${type}`)}
                        description={t(`org.type.${type}.desc`)}
                        invalide={!!visibles['org-type']}
                      />
                    ))}
                  </div>
                  <MessageErreur id="org-type-erreur">{err('org-type')}</MessageErreur>
                </fieldset>

                <ChampTexte
                  id="org-nom"
                  label={t('org.nom.label')}
                  aide={t('org.nom.aide')}
                  valeur={b.nom}
                  onChange={(v) => maj({ nom: v })}
                  erreur={err('org-nom')}
                />
              </>
            )}

            {/* Étape 2 : population */}
            {etape === 2 && (
              <>
                {b.type === 'ong' && (
                  <fieldset aria-describedby={decritPar('pop-ong-intro', visibles['pop-ong'] && 'pop-ong-erreur')}>
                    <legend className="font-semibold text-dark">{t('pop.ong.label')}</legend>
                    <p id="pop-ong-intro" className="mt-0.5 mb-2 text-sm text-dark-light">
                      {t('pop.intro.ong')}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <CarteChoix
                        id="pop-ong"
                        nom="pop-ong"
                        valeur="territoire"
                        coche={b.publicOng === 'territoire'}
                        onChoisir={() => choisirPublicOng('territoire')}
                        titre={t('pop.ong.territoire')}
                        description={t('pop.ong.territoire.desc')}
                        invalide={!!visibles['pop-ong']}
                      />
                      <CarteChoix
                        nom="pop-ong"
                        valeur="membres"
                        coche={b.publicOng === 'membres'}
                        onChoisir={() => choisirPublicOng('membres')}
                        titre={t('pop.ong.membres')}
                        description={t('pop.ong.membres.desc')}
                        invalide={!!visibles['pop-ong']}
                      />
                    </div>
                    <MessageErreur id="pop-ong-erreur">{err('pop-ong')}</MessageErreur>
                  </fieldset>
                )}

                {mode === 'territoire' && (
                  <>
                    <p className="text-dark-light">
                      {b.type === 'commune' ? t('pop.intro.commune') : t('pop.intro.administration')}
                    </p>

                    {niveaux.length > 1 && (
                      <fieldset aria-describedby={decritPar(visibles['pop-niveau'] && 'pop-niveau-erreur')}>
                        <legend className="font-semibold text-dark mb-2">{t('pop.niveau.label')}</legend>
                        <div className={`grid gap-3 ${niveaux.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                          {niveaux.map((n, i) => (
                            <CarteChoix
                              key={n}
                              id={i === 0 ? 'pop-niveau' : undefined}
                              nom="pop-niveau"
                              valeur={n}
                              coche={niveau === n}
                              onChoisir={() => maj({ niveau: n })}
                              titre={t(`pop.niveau.${n}`)}
                              invalide={!!visibles['pop-niveau']}
                            />
                          ))}
                        </div>
                        <MessageErreur id="pop-niveau-erreur">{err('pop-niveau')}</MessageErreur>
                      </fieldset>
                    )}

                    {niveau === 'commune' && (
                      <div>
                        <RechercheCommune
                          id="commune"
                          valeur={b.commune}
                          onChange={(c) => maj({ commune: c })}
                          erreur={err('commune')}
                          idErreur="commune-erreur"
                        />
                        <MessageErreur id="commune-erreur">{err('commune')}</MessageErreur>
                      </div>
                    )}

                    {niveau === 'canton' && (
                      <div>
                        <label htmlFor="pop-canton" className="block font-semibold text-dark">
                          {t('pop.canton.label')}
                        </label>
                        <select
                          id="pop-canton"
                          className="champ mt-2"
                          value={b.canton}
                          onChange={(e) => maj({ canton: e.target.value })}
                          aria-invalid={visibles['pop-canton'] ? true : undefined}
                          aria-describedby={decritPar(visibles['pop-canton'] && 'pop-canton-erreur')}
                        >
                          <option value="">{t('pop.canton.choisir')}</option>
                          {cantonsTries.map((c) => (
                            <option key={c.sigle} value={c.sigle}>
                              {c[lang]} ({c.sigle})
                            </option>
                          ))}
                        </select>
                        <MessageErreur id="pop-canton-erreur">{err('pop-canton')}</MessageErreur>
                      </div>
                    )}
                  </>
                )}

                {mode === 'groupes' && (
                  <section aria-labelledby="groupes-titre">
                    <h3 id="groupes-titre" className="font-semibold text-dark text-lg">
                      {t('groupes.titre')}
                    </h3>
                    <p className="mt-1 text-sm text-dark-light leading-relaxed">
                      {t(b.type === 'ecole' ? 'groupes.aide.ecole' : b.type === 'entreprise' ? 'groupes.aide.entreprise' : 'groupes.aide.ong')}
                    </p>
                    <ul className="mt-4 space-y-4">
                      {b.groupes.map((g, i) => (
                        <li key={g.uid} className="rounded-xl border border-mist p-4 sm:p-5">
                          <fieldset>
                            <legend className="sr-only">{t('groupe.titre', { n: i + 1 })}</legend>
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <p className="font-semibold text-dark" aria-hidden="true">
                                {t('groupe.titre', { n: i + 1 })}
                              </p>
                              {b.groupes.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => retirerGroupe(g.uid)}
                                  className="text-sm font-medium text-alerte underline underline-offset-4 px-1 py-1"
                                  aria-label={t('groupe.retirer.nom', { n: i + 1 })}
                                >
                                  {t('groupe.retirer')}
                                </button>
                              )}
                            </div>
                            <div className="space-y-4">
                              <div>
                                <label htmlFor={`${g.uid}-nom`} className="block font-medium text-dark text-sm">
                                  {t('groupe.nom')}
                                </label>
                                <input
                                  id={`${g.uid}-nom`}
                                  type="text"
                                  className="champ mt-1.5"
                                  value={g.nom}
                                  maxLength={200}
                                  placeholder={t(
                                    b.type === 'ecole'
                                      ? 'groupe.nom.placeholder.ecole'
                                      : b.type === 'entreprise'
                                        ? 'groupe.nom.placeholder.entreprise'
                                        : 'groupe.nom.placeholder.ong',
                                  )}
                                  onChange={(e) => majGroupe(g.uid, { nom: e.target.value })}
                                  aria-invalid={visibles[`${g.uid}-nom`] ? true : undefined}
                                  aria-describedby={decritPar(visibles[`${g.uid}-nom`] && `${g.uid}-nom-erreur`)}
                                />
                                <MessageErreur id={`${g.uid}-nom-erreur`}>{err(`${g.uid}-nom`)}</MessageErreur>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <div className="col-span-2 sm:col-span-1">
                                  <ChampNombre
                                    id={`${g.uid}-effectif`}
                                    label={t('groupe.effectif')}
                                    aide={t('groupe.effectif.aide')}
                                    valeur={g.effectif}
                                    onChange={(v) => majGroupe(g.uid, { effectif: v })}
                                    erreur={err(`${g.uid}-effectif`)}
                                    min={1}
                                    max={10000000}
                                  />
                                </div>
                                <ChampNombre
                                  id={`${g.uid}-min`}
                                  label={t('groupe.ageMin')}
                                  valeur={g.age_min}
                                  onChange={(v) => majGroupe(g.uid, { age_min: v })}
                                  erreur={err(`${g.uid}-min`)}
                                  min={0}
                                  max={120}
                                />
                                <ChampNombre
                                  id={`${g.uid}-max`}
                                  label={t('groupe.ageMax')}
                                  valeur={g.age_max}
                                  onChange={(v) => majGroupe(g.uid, { age_max: v })}
                                  erreur={err(`${g.uid}-max`)}
                                  min={0}
                                  max={120}
                                />
                              </div>
                            </div>
                          </fieldset>
                        </li>
                      ))}
                    </ul>
                    <button
                      id="groupe-ajouter"
                      type="button"
                      onClick={ajouterGroupe}
                      className="btn btn-secondaire mt-4"
                      aria-describedby={decritPar(visibles['groupe-ajouter'] && 'groupe-ajouter-erreur')}
                    >
                      <span aria-hidden="true">+</span> {t('groupe.ajouter')}
                    </button>
                    <MessageErreur id="groupe-ajouter-erreur">{err('groupe-ajouter')}</MessageErreur>
                  </section>
                )}
              </>
            )}

            {/* Étape 3 : démarche */}
            {etape === 3 && (
              <>
                <ChampTexte
                  id="dem-enjeu"
                  multiligne
                  label={t('dem.enjeu.label')}
                  aide={t('dem.enjeu.aide')}
                  valeur={b.enjeu}
                  onChange={(v) => maj({ enjeu: v })}
                  erreur={err('dem-enjeu')}
                />
                <ChampTexte
                  id="dem-objectif"
                  multiligne
                  label={t('dem.objectif.label')}
                  aide={t('dem.objectif.aide')}
                  valeur={b.objectif}
                  onChange={(v) => maj({ objectif: v })}
                  erreur={err('dem-objectif')}
                />
                <ChampTexte
                  id="dem-formulation"
                  multiligne
                  label={t('dem.formulation.label')}
                  aide={t('dem.formulation.aide')}
                  valeur={b.formulation}
                  onChange={(v) => maj({ formulation: v })}
                  erreur={err('dem-formulation')}
                />
                <fieldset aria-describedby={decritPar('dem-formats-aide', visibles['dem-formats'] && 'dem-formats-erreur')}>
                  <legend className="font-semibold text-dark">{t('dem.formats.label')}</legend>
                  <p id="dem-formats-aide" className="mt-0.5 mb-2 text-sm text-dark-light">
                    {t('dem.formats.aide')}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {FORMATS.map((f, i) => {
                      const coche = b.formats.includes(f)
                      return (
                        <label
                          key={f}
                          className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                            coche ? 'border-ocean-dark bg-mist/40' : 'border-mist hover:border-sky'
                          }`}
                        >
                          <input
                            id={i === 0 ? 'dem-formats' : undefined}
                            type="checkbox"
                            checked={coche}
                            onChange={(e) =>
                              maj({ formats: e.target.checked ? [...b.formats, f] : b.formats.filter((x) => x !== f) })
                            }
                            className="mt-1 w-5 h-5 accent-ocean-dark shrink-0"
                            aria-invalid={visibles['dem-formats'] ? true : undefined}
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-dark">{t(`format.${f}`)}</span>
                            <span className="block text-sm text-dark-light">{t(`format.${f}.desc`)}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  <MessageErreur id="dem-formats-erreur">{err('dem-formats')}</MessageErreur>
                </fieldset>
                <div className="max-w-xs">
                  <ChampNombre
                    id="dem-horizon"
                    label={t('dem.horizon.label')}
                    aide={t('dem.horizon.aide')}
                    valeur={b.horizon}
                    onChange={(v) => maj({ horizon: v })}
                    erreur={err('dem-horizon')}
                    min={1}
                    max={120}
                    suffixe={t('dem.horizon.unite')}
                  />
                </div>
              </>
            )}

            {/* Étape 4 : clé API */}
            {etape === 4 && (
              <>
                <p className="text-dark leading-relaxed">{t('cle.intro')}</p>
                <BlocRassurance />
                <SaisieCle
                  etat={saisieCle.etat}
                  modifier={saisieCle.modifier}
                  verification={saisieCle.verification}
                  verifieeOk={saisieCle.verifieeOk}
                  onVerifier={() => {
                    if (Object.keys(erreursCle).length > 0) {
                      setMontrerErreursCle(true)
                      return
                    }
                    void saisieCle.verifier()
                  }}
                  erreurs={erreursCleVisibles}
                  idFournisseur="cle-fournisseur"
                  idCle="cle-cle"
                />

                <section aria-labelledby="recap-titre" className="rounded-xl border border-mist p-5">
                  <h3 id="recap-titre" className="font-semibold text-dark text-lg">
                    {t('recap.titre')}
                  </h3>
                  <dl className="mt-3 divide-y divide-mist">
                    {(
                      [
                        ['recap.organisation', `${b.nom.trim()} (${b.type ? t(`type.${b.type}`) : ''})`, 1],
                        ['recap.population', descriptionPopulation(), 2],
                        ['recap.formulation', b.formulation.trim(), 3],
                        ['recap.formats', FORMATS.filter((f) => b.formats.includes(f)).map((f) => t(`format.${f}`)).join(', '), 3],
                        ['recap.horizon', `${b.horizon.trim()} ${t('dem.horizon.unite')}`, 3],
                      ] as [TranslationKey, string, number][]
                    ).map(([cle, valeur, n]) => (
                      <div key={cle} className="py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                        <dt className="text-sm font-semibold text-dark-light sm:w-32 shrink-0">{t(cle)}</dt>
                        <dd className="flex-1 min-w-0 text-dark">{valeur}</dd>
                        <dd className="shrink-0">
                          <button type="button" className="lien text-sm" onClick={() => allerA(n)}>
                            {t('recap.modifier')}
                            <span className="sr-only"> : {t(cle)}</span>
                          </button>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-sm text-dark-light">{t('recap.duree')}</p>
                </section>

                {erreurLancement && (
                  <div role="alert" className="rounded-xl border border-alerte/40 bg-alerte/5 px-4 py-3 text-alerte font-medium">
                    {erreurLancement}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="mt-10 pt-6 border-t border-mist flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
            {etape > 1 ? (
              <button type="button" className="btn btn-secondaire" onClick={() => allerA(etape - 1)} disabled={lancement}>
                {t('nouveau.precedent')}
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
            {etape < TOTAL_ETAPES ? (
              <button type="submit" className="btn btn-primaire">
                {t('nouveau.suivant')}
              </button>
            ) : (
              <button type="submit" className="btn btn-primaire text-base px-7" disabled={lancement} aria-busy={lancement}>
                {lancement ? t('nouveau.lancement') : t('nouveau.lancer')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
