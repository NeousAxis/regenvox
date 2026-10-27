import { useCallback, useId, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { moteur } from '../moteur'
import type { CleApi, Fournisseur } from '../moteur'
import { lireCleMemorisee, memoriserCle, oublierCle } from '../stockage'
import { URL_CLE_ANTHROPIC, URL_CLE_MISTRAL, URL_CLE_OPENAI, SERVICES_AUTRES } from '../liens'
import { Aide, MessageErreur, decritPar } from './Champ'

export interface EtatCle {
  fournisseur: Fournisseur | ''
  cle: string
  memoriser: boolean
  // Autres modèles : service compatible OpenAI, son adresse, et les deux modèles choisis dans sa liste.
  service: string
  adresse: string
  modelesDispo: string[]
  modeleRapide: string
  modeleAnalyse: string
}

const VIDE: Omit<EtatCle, 'fournisseur' | 'cle' | 'memoriser'> = { service: '', adresse: '', modelesDispo: [], modeleRapide: '', modeleAnalyse: '' }

// Choix par défaut dans la liste du service : un modèle léger pour les nombreux appels des habitants simulés,
// le plus capable pour les analyses. L'utilisateur peut changer les deux.
// La liste arrive dans l'ordre du service, souvent du plus récent au plus ancien : le premier qui convient l'emporte.
const EXCLUS = /(:batch|vision|-vl-|omni|coder|-code|embed|audio|image|tts|whisper|guard|moderation|realtime)/i
const LEGERS = [/deepseek-v[\d.]+-flash$/, /qwen[\d.]+-flash$/, /glm-[\d.]+-flash$/, /(mini|flash|turbo|small|lite|instant|nano|haiku|8b|air)/i, /chat/i]
const CAPABLES = [/kimi-k\d(\.\d)?(-pro)?$/, /deepseek-v[\d.]+-pro$/, /qwen[\d.]+-max$/, /glm-\d(\.\d)?$/, /reasoner/, /(max|pro|large|plus|k2|70b|405b|maverick|muse|opus|sonnet)/i]
function modelesParDefaut(liste: string[]) {
  const candidats = liste.filter((m) => !EXCLUS.test(m))
  const premier = (motifs: RegExp[], sauf = '') => {
    for (const r of motifs) {
      const m = candidats.find((x) => x !== sauf && r.test(x))
      if (m) return m
    }
    return undefined
  }
  const rapide = premier(LEGERS) ?? candidats[0] ?? liste[0] ?? ''
  const analyse = premier(CAPABLES, rapide) ?? candidats.find((m) => m !== rapide) ?? rapide
  return { rapide, analyse }
}

// Clé telle qu'elle part vers le moteur, avec l'adresse et les modèles pour « autres modèles ».
export function cleDepuisEtat(e: EtatCle): CleApi | null {
  if (!e.fournisseur) return null
  const cle: CleApi = { fournisseur: e.fournisseur, cle: e.cle.trim() }
  if (e.fournisseur === 'autre') {
    cle.adresse = e.adresse.trim()
    if (e.modeleRapide && e.modeleAnalyse) cle.modeles = { rapide: e.modeleRapide, analyse: e.modeleAnalyse }
  }
  return cle
}

export type Verification =
  | { statut: 'aucune' }
  | { statut: 'encours' }
  | { statut: 'ok'; pour: string }
  | { statut: 'ko'; pour: string; message?: string }
  | { statut: 'echec' }

export interface ErreursCle {
  fournisseur?: TranslationKey
  cle?: TranslationKey
  adresse?: TranslationKey
  modele?: TranslationKey
}

const signature = (e: EtatCle) => `${e.fournisseur}:${e.fournisseur === 'autre' ? e.adresse.trim() + ':' : ''}${e.cle.trim()}`

export function validerCle(e: EtatCle): ErreursCle {
  const erreurs: ErreursCle = {}
  if (!e.fournisseur) erreurs.fournisseur = 'erreur.fournisseur'
  const cle = e.cle.trim()
  if (!cle) erreurs.cle = 'erreur.cle'
  else if (/\s/.test(cle)) erreurs.cle = 'erreur.cle.espaces'
  if (e.fournisseur === 'autre') {
    if (!/^https:\/\/[^\s/]+\.[^\s]+$/.test(e.adresse.trim())) erreurs.adresse = 'erreur.adresse'
    else if (e.modelesDispo.length > 0 && (!e.modeleRapide || !e.modeleAnalyse)) erreurs.modele = 'erreur.modele'
  }
  return erreurs
}

// État de la saisie de la clé, partagé par le formulaire et la reprise d'un test.
export function useSaisieCle() {
  const [etat, setEtat] = useState<EtatCle>(() => {
    const memo = lireCleMemorisee()
    if (!memo) return { fournisseur: '', cle: '', memoriser: false, ...VIDE }
    const service = SERVICES_AUTRES.find((s) => s.adresse === memo.adresse)?.code ?? (memo.adresse ? 'perso' : '')
    return {
      fournisseur: memo.fournisseur, cle: memo.cle, memoriser: true, ...VIDE,
      service, adresse: memo.adresse ?? '',
      modelesDispo: memo.modeles ? [...new Set([memo.modeles.rapide, memo.modeles.analyse])] : [],
      modeleRapide: memo.modeles?.rapide ?? '', modeleAnalyse: memo.modeles?.analyse ?? '',
    }
  })
  const [verification, setVerification] = useState<Verification>({ statut: 'aucune' })
  const dernier = useRef(etat)
  dernier.current = etat

  const modifier = useCallback((maj: Partial<EtatCle>) => {
    setEtat((e) => ({ ...e, ...maj }))
  }, [])

  // Vérifie la clé auprès du fournisseur. Rend la clé si elle est acceptée.
  const verifier = useCallback(async (): Promise<CleApi | null> => {
    const courant = dernier.current
    if (Object.keys(validerCle(courant)).length > 0 || !courant.fournisseur) return null
    const cle = cleDepuisEtat(courant)!
    const sig = signature(courant)
    setVerification({ statut: 'encours' })
    try {
      const r = await moteur.verifierCle(cle)
      if (signature(dernier.current) !== sig) {
        setVerification({ statut: 'aucune' })
        return null
      }
      setVerification(r.ok ? { statut: 'ok', pour: sig } : { statut: 'ko', pour: sig, message: r.message })
      if (!r.ok) return null
      if (courant.fournisseur === 'autre' && r.modeles) {
        // Liste du service : on garde les choix déjà faits s'ils y figurent, sinon on propose les choix par défaut.
        const def = modelesParDefaut(r.modeles)
        const rapide = r.modeles.includes(courant.modeleRapide) ? courant.modeleRapide : def.rapide
        const analyse = r.modeles.includes(courant.modeleAnalyse) ? courant.modeleAnalyse : def.analyse
        setEtat((e) => ({ ...e, modelesDispo: r.modeles!, modeleRapide: rapide, modeleAnalyse: analyse }))
        return { ...cle, modeles: { rapide, analyse } }
      }
      return cle
    } catch (e) {
      console.error(e)
      setVerification({ statut: 'echec' })
      return null
    }
  }, [])

  // Applique le choix « Mémoriser la clé sur cet appareil ».
  const appliquerMemorisation = useCallback((cle: CleApi) => {
    if (dernier.current.memoriser) memoriserCle(cle)
    else oublierCle()
  }, [])

  const verifieeOk = verification.statut === 'ok' && verification.pour === signature(etat)
  const cleCourante = useCallback(() => cleDepuisEtat(dernier.current), [])

  return { etat, modifier, verification, verifier, verifieeOk, appliquerMemorisation, cleCourante }
}

interface Props {
  etat: EtatCle
  modifier: (maj: Partial<EtatCle>) => void
  verification: Verification
  verifieeOk: boolean
  onVerifier: () => void
  erreurs: ErreursCle
  idFournisseur: string
  idCle: string
}

export default function SaisieCle({ etat, modifier, verification, verifieeOk, onVerifier, erreurs, idFournisseur, idCle }: Props) {
  const { t } = useLanguage()
  const base = useId()
  const [visible, setVisible] = useState(false)
  const sig = signature(etat)
  const verifActuelle = (verification.statut === 'ok' || verification.statut === 'ko') && verification.pour !== sig ? null : verification

  const fournisseurs: { code: Fournisseur; nom: TranslationKey; desc: TranslationKey }[] = [
    { code: 'anthropic', nom: 'cle.anthropic', desc: 'cle.anthropic.desc' },
    { code: 'mistral', nom: 'cle.mistral', desc: 'cle.mistral.desc' },
    { code: 'openai', nom: 'cle.openai', desc: 'cle.openai.desc' },
    { code: 'autre', nom: 'cle.autre', desc: 'cle.autre.desc' },
  ]
  const service = SERVICES_AUTRES.find((s) => s.code === etat.service)

  const aideCle: TranslationKey =
    etat.fournisseur === 'anthropic' ? 'cle.cle.aide.anthropic' : etat.fournisseur === 'mistral' ? 'cle.cle.aide.mistral' : etat.fournisseur === 'openai' ? 'cle.cle.aide.openai' : etat.fournisseur === 'autre' ? 'cle.cle.aide.autre' : 'cle.cle.aide'

  return (
    <div className="space-y-6">
      <fieldset aria-describedby={decritPar(erreurs.fournisseur && `${base}-err-f`)}>
        <legend className="font-semibold text-dark mb-2">{t('cle.fournisseur.label')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {fournisseurs.map((f, i) => (
            <label
              key={f.code}
              className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                etat.fournisseur === f.code ? 'border-ocean-dark bg-mist/40' : 'border-mist hover:border-sky'
              }`}
            >
              <input
                id={i === 0 ? idFournisseur : undefined}
                type="radio"
                name={`${base}-fournisseur`}
                value={f.code}
                checked={etat.fournisseur === f.code}
                onChange={() => modifier({ fournisseur: f.code })}
                className="mt-1 w-5 h-5 accent-ocean-dark shrink-0"
                aria-invalid={erreurs.fournisseur ? true : undefined}
              />
              <span>
                <span className="block font-semibold">{t(f.nom)}</span>
                <span className="block text-sm text-dark-light">{t(f.desc)}</span>
              </span>
            </label>
          ))}
        </div>
        <MessageErreur id={`${base}-err-f`}>{erreurs.fournisseur && t(erreurs.fournisseur)}</MessageErreur>
      </fieldset>

      {etat.fournisseur === 'autre' && (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${base}-service`} className="block font-semibold text-dark">{t('cle.service.label')}</label>
            <Aide id={`${base}-service-aide`}>{t('cle.service.aide')}</Aide>
            <select
              id={`${base}-service`}
              className="champ mt-2"
              value={etat.service}
              aria-describedby={`${base}-service-aide`}
              onChange={(e) => {
                const s = SERVICES_AUTRES.find((x) => x.code === e.target.value)
                modifier({ service: e.target.value, adresse: s ? s.adresse : '', modelesDispo: [], modeleRapide: '', modeleAnalyse: '' })
              }}
            >
              <option value="">{t('cle.service.choisir')}</option>
              {SERVICES_AUTRES.map((s) => (
                <option key={s.code} value={s.code}>{s.code === 'openrouter' ? t('cle.service.openrouter') : s.nom}</option>
              ))}
              <option value="perso">{t('cle.service.perso')}</option>
            </select>
          </div>
          {etat.service === 'perso' && (
            <div>
              <label htmlFor={`${base}-adresse`} className="block font-semibold text-dark">{t('cle.adresse.label')}</label>
              <Aide id={`${base}-adresse-aide`}>{t('cle.adresse.aide')}</Aide>
              <input
                id={`${base}-adresse`}
                type="url"
                className="champ mt-2 font-mono"
                value={etat.adresse}
                placeholder="https://"
                onChange={(e) => modifier({ adresse: e.target.value, modelesDispo: [], modeleRapide: '', modeleAnalyse: '' })}
                aria-invalid={erreurs.adresse ? true : undefined}
                aria-describedby={decritPar(`${base}-adresse-aide`, erreurs.adresse && `${base}-err-a`)}
              />
            </div>
          )}
          <MessageErreur id={`${base}-err-a`}>{erreurs.adresse && t(erreurs.adresse)}</MessageErreur>
        </div>
      )}

      <div>
        <label htmlFor={idCle} className="block font-semibold text-dark">
          {t('cle.cle.label')}
        </label>
        <Aide id={`${base}-aide`}>{t(aideCle)}</Aide>
        <div className="mt-2 flex gap-2">
          <input
            id={idCle}
            type={visible ? 'text' : 'password'}
            className="champ font-mono"
            value={etat.cle}
            onChange={(e) => modifier({ cle: e.target.value })}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={erreurs.cle ? true : undefined}
            aria-describedby={decritPar(`${base}-aide`, erreurs.cle && `${base}-err-c`, verifActuelle && verifActuelle.statut !== 'aucune' && `${base}-verif`)}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="btn btn-secondaire btn-petit shrink-0"
            aria-label={visible ? t('cle.masquer.label') : t('cle.afficher.label')}
            aria-pressed={visible}
          >
            {visible ? t('cle.masquer') : t('cle.afficher')}
          </button>
        </div>
        <MessageErreur id={`${base}-err-c`}>{erreurs.cle && t(erreurs.cle)}</MessageErreur>
        <ul className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-6 text-sm">
          <li>
            <a className="lien" href={URL_CLE_ANTHROPIC} target="_blank" rel="noopener noreferrer">
              {t('cle.obtenir.anthropic')}
              <span className="sr-only"> {t('general.nouvelOnglet')}</span>
            </a>
          </li>
          <li>
            <a className="lien" href={URL_CLE_MISTRAL} target="_blank" rel="noopener noreferrer">
              {t('cle.obtenir.mistral')}
              <span className="sr-only"> {t('general.nouvelOnglet')}</span>
            </a>
          </li>
          <li>
            <a className="lien" href={URL_CLE_OPENAI} target="_blank" rel="noopener noreferrer">
              {t('cle.obtenir.openai')}
              <span className="sr-only"> {t('general.nouvelOnglet')}</span>
            </a>
          </li>
          {service && (
            <li>
              <a className="lien" href={service.cles} target="_blank" rel="noopener noreferrer">
                {t('cle.obtenir.autre', { service: service.nom })}
                <span className="sr-only"> {t('general.nouvelOnglet')}</span>
              </a>
            </li>
          )}
        </ul>
      </div>

      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={etat.memoriser}
            onChange={(e) => modifier({ memoriser: e.target.checked })}
            className="mt-1 w-5 h-5 accent-ocean-dark shrink-0"
            aria-describedby={`${base}-memo`}
          />
          <span>
            <span className="block font-medium">{t('cle.memoriser')}</span>
            <span id={`${base}-memo`} className="block text-sm text-dark-light">
              {t('cle.memoriser.aide')}
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-secondaire"
          onClick={onVerifier}
          disabled={verification.statut === 'encours'}
        >
          {verification.statut === 'encours' ? t('cle.verification') : t('cle.verifier')}
        </button>
        <div id={`${base}-verif`} role="status" aria-live="polite" className="text-sm">
          {verifieeOk && <span className="font-semibold text-succes">{t('cle.ok')}</span>}
          {verifActuelle?.statut === 'ko' && (
            <span className="font-medium text-alerte">
              {t('cle.ko')}
              {verifActuelle.message && <span className="block font-normal">{t('cle.ko.detail', { message: verifActuelle.message })}</span>}
            </span>
          )}
          {verifActuelle?.statut === 'echec' && <span className="font-medium text-alerte">{t('cle.echec')}</span>}
        </div>
      </div>

      {etat.fournisseur === 'autre' && etat.modelesDispo.length > 0 && (
        <fieldset className="space-y-4">
          <legend className="font-semibold text-dark">{t('cle.modeles.titre')}</legend>
          <Aide id={`${base}-modeles-aide`}>{t('cle.modeles.aide')}</Aide>
          {([['modeleRapide', 'cle.modele.rapide'], ['modeleAnalyse', 'cle.modele.analyse']] as const).map(([champ, libelle]) => (
            <div key={champ}>
              <label htmlFor={`${base}-${champ}`} className="block font-medium text-dark">{t(libelle)}</label>
              <select
                id={`${base}-${champ}`}
                className="champ mt-2 font-mono text-sm"
                value={etat[champ]}
                onChange={(e) => modifier({ [champ]: e.target.value } as Partial<EtatCle>)}
                aria-describedby={`${base}-modeles-aide`}
              >
                {[...etat.modelesDispo].sort().map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ))}
          <MessageErreur id={`${base}-err-m`}>{erreurs.modele && t(erreurs.modele)}</MessageErreur>
        </fieldset>
      )}
    </div>
  )
}

export function BlocRassurance() {
  const { t } = useLanguage()
  return (
    <div className="rounded-2xl bg-mist/40 border border-mist p-5 flex flex-col sm:flex-row gap-3 sm:gap-4">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="w-7 h-7 text-ocean-dark shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" strokeLinejoin="round" />
        <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <p className="font-semibold text-dark">{t('cle.rassurance.titre')}</p>
        <p className="mt-1 text-dark-light leading-relaxed">{t('cle.rassurance.texte')}</p>
      </div>
    </div>
  )
}
