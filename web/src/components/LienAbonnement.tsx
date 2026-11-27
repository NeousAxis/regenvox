// Lien vers la page Abonnement, avec les prix en vente lus sur le serveur (stripe.php) : un visiteur sans code
// voit tout de suite où et à quel prix s'abonner. Sans réponse du serveur, le lien reste, sans les prix.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { lireFormules, prixAffiche } from '../abonnement'

export default function LienAbonnement({ className = '' }: { className?: string }) {
  const { t, lang } = useLanguage()
  const [prix, setPrix] = useState<string[]>([])

  useEffect(() => {
    let actif = true
    lireFormules()
      .then((r) => actif && setPrix(r.ouvert ? r.formules.map((f) => prixAffiche(f, lang)).filter(Boolean) : []))
      .catch(() => {})
    return () => {
      actif = false
    }
  }, [lang])

  return (
    <Link to="/abonnement" className={`underline underline-offset-4 text-ocean-dark font-medium ${className}`}>
      {prix.length > 0 ? t('abo.lienPrix', { prix: prix.join(t('abo.ou')) }) : t('abo.lienCode')}
    </Link>
  )
}
