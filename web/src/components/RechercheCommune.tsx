import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { decritPar } from './Champ'

export interface Commune {
  num: number
  nom: string
  canton: string
}

interface CommuneIndexee extends Commune {
  cle: string
}

const MAX_RESULTATS = 8

export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[-\s]+/g, ' ')
    .trim()
}

let chargement: Promise<CommuneIndexee[]> | null = null

function chargerCommunes(): Promise<CommuneIndexee[]> {
  if (!chargement) {
    chargement = fetch(`${import.meta.env.BASE_URL}communes_index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<unknown>
      })
      .then((donnees) => {
        if (!Array.isArray(donnees)) throw new Error('format')
        return donnees
          .filter(
            (c): c is Commune =>
              typeof c === 'object' && c !== null && typeof c.num === 'number' && typeof c.nom === 'string' && typeof c.canton === 'string',
          )
          .map((c) => ({ num: c.num, nom: c.nom, canton: c.canton, cle: normaliser(c.nom) }))
      })
    chargement.catch(() => {
      chargement = null
    })
  }
  return chargement
}

function chercher(communes: CommuneIndexee[], saisie: string): CommuneIndexee[] {
  const q = normaliser(saisie)
  if (!q) return []
  const debut: CommuneIndexee[] = []
  const mot: CommuneIndexee[] = []
  const dedans: CommuneIndexee[] = []
  for (const c of communes) {
    if (c.cle.startsWith(q)) debut.push(c)
    else if (c.cle.includes(' ' + q) || c.cle.includes("'" + q)) mot.push(c)
    else if (c.cle.includes(q)) dedans.push(c)
  }
  const tri = (a: CommuneIndexee, b: CommuneIndexee) => a.nom.localeCompare(b.nom, 'fr')
  return [...debut.sort(tri), ...mot.sort(tri), ...dedans.sort(tri)].slice(0, MAX_RESULTATS)
}

interface Props {
  id: string
  valeur: Commune | null
  onChange: (c: Commune | null) => void
  erreur?: string
  idErreur: string
}

export default function RechercheCommune({ id, valeur, onChange, erreur, idErreur }: Props) {
  const { t } = useLanguage()
  const base = useId()
  const idListe = `${base}-liste`
  const idAide = `${base}-aide`
  const idStatut = `${base}-statut`
  const [communes, setCommunes] = useState<CommuneIndexee[] | null>(null)
  const [echec, setEchec] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(-1)
  const champ = useRef<HTMLInputElement>(null)
  const boutonChanger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let annule = false
    chargerCommunes()
      .then((c) => {
        if (!annule) setCommunes(c)
      })
      .catch(() => {
        if (!annule) setEchec(true)
      })
    return () => {
      annule = true
    }
  }, [])

  const resultats = useMemo(() => (communes ? chercher(communes, saisie) : []), [communes, saisie])
  const listeVisible = ouvert && saisie.trim().length > 0 && communes !== null

  function choisir(c: Commune) {
    onChange({ num: c.num, nom: c.nom, canton: c.canton })
    setSaisie('')
    setOuvert(false)
    setActif(-1)
    requestAnimationFrame(() => boutonChanger.current?.focus())
  }

  function changer() {
    onChange(null)
    requestAnimationFrame(() => champ.current?.focus())
  }

  function surTouche(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOuvert(true)
      setActif((i) => (resultats.length ? (i + 1) % resultats.length : -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOuvert(true)
      setActif((i) => (resultats.length ? (i <= 0 ? resultats.length - 1 : i - 1) : -1))
    } else if (e.key === 'Enter') {
      if (listeVisible && resultats.length > 0) {
        e.preventDefault()
        choisir(resultats[actif >= 0 ? actif : 0])
      }
    } else if (e.key === 'Escape') {
      if (ouvert) {
        e.preventDefault()
        setOuvert(false)
        setActif(-1)
      }
    }
  }

  let statut = ''
  if (listeVisible) {
    statut =
      resultats.length === 0
        ? t('commune.aucune')
        : resultats.length === 1
          ? t('commune.resultat')
          : t('commune.resultats', { n: resultats.length })
  }

  if (valeur) {
    return (
      <div>
        <p className="block font-semibold text-dark mb-1.5">{t('commune.label')}</p>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-ocean-dark/40 bg-mist/30 px-4 py-3">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="w-5 h-5 text-succes shrink-0" fill="currentColor">
            <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1.2 11.4L5.3 9.9l1.3-1.3 2.2 2.2 4.6-4.6 1.3 1.3-5.9 5.9Z" />
          </svg>
          <p className="flex-1 min-w-0">
            <span className="sr-only">{t('commune.choisie')} : </span>
            <span className="font-semibold">{valeur.nom}</span> <span className="text-dark-light">({valeur.canton})</span>
          </p>
          <button ref={boutonChanger} type="button" onClick={changer} className="btn btn-secondaire btn-petit">
            {t('commune.changer')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="block font-semibold text-dark">
        {t('commune.label')}
      </label>
      <p id={idAide} className="mt-0.5 mb-2 text-sm text-dark-light">
        {t('commune.aide')}
      </p>
      <input
        ref={champ}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        className="champ"
        placeholder={t('commune.placeholder')}
        value={saisie}
        disabled={echec}
        aria-autocomplete="list"
        aria-expanded={listeVisible && resultats.length > 0}
        aria-controls={idListe}
        aria-activedescendant={listeVisible && actif >= 0 ? `${idListe}-${actif}` : undefined}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decritPar(idAide, erreur && idErreur)}
        onChange={(e) => {
          setSaisie(e.target.value)
          setOuvert(true)
          setActif(-1)
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={surTouche}
      />
      <ul
        id={idListe}
        role="listbox"
        aria-label={t('commune.label')}
        hidden={!(listeVisible && resultats.length > 0)}
        className="absolute z-20 left-0 right-0 mt-1 max-h-80 overflow-auto rounded-xl border border-mist bg-white shadow-xl py-1"
      >
        {resultats.map((c, i) => (
          <li
            key={c.num}
            id={`${idListe}-${i}`}
            role="option"
            aria-selected={i === actif}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choisir(c)}
            onMouseEnter={() => setActif(i)}
            className={`px-4 py-3 cursor-pointer flex justify-between gap-3 ${i === actif ? 'bg-mist' : ''}`}
          >
            <span className="font-medium">{c.nom}</span>
            <span className="text-dark-light text-sm">{c.canton}</span>
          </li>
        ))}
      </ul>
      {listeVisible && resultats.length === 0 && <p className="mt-2 text-sm text-dark-light">{t('commune.aucune')}</p>}
      {communes === null && !echec && <p className="mt-2 text-sm text-dark-light">{t('commune.chargement')}</p>}
      {echec && <p className="mt-2 text-sm font-medium text-alerte">{t('commune.echec')}</p>}
      <p id={idStatut} className="sr-only" role="status" aria-live="polite">
        {statut}
      </p>
    </div>
  )
}
