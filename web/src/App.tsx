import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Participer from './pages/Participer'

// La plateforme (et le moteur, lourd) n'est chargée que pour l'organisation : la page des personnes consultées,
// ouverte sur un téléphone depuis un lien ou un QR code, reste légère.
const Layout = lazy(() => import('./components/Layout'))
const Accueil = lazy(() => import('./pages/Accueil'))
const Nouveau = lazy(() => import('./pages/Nouveau'))
const Suivi = lazy(() => import('./pages/Suivi'))
const Rapport = lazy(() => import('./pages/Rapport'))
const MesProspectives = lazy(() => import('./pages/MesProspectives'))
const Fiabilite = lazy(() => import('./pages/Fiabilite'))
const Introuvable = lazy(() => import('./pages/Introuvable'))
const NouvelleConsultation = lazy(() => import('./pages/NouvelleConsultation'))
const Consultation = lazy(() => import('./pages/Consultation'))
const Consultations = lazy(() => import('./pages/Consultations'))
const PageRecuperer = lazy(() => import('./pages/Consultations').then((m) => ({ default: m.PageRecuperer })))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
        <Routes>
          {/* Page des personnes consultées : sans la navigation de la plateforme. */}
          <Route path="participer" element={<Participer />} />
          <Route element={<Layout />}>
            <Route index element={<Accueil />} />
            <Route path="nouveau" element={<Nouveau />} />
            <Route path="prospectives" element={<MesProspectives />} />
            <Route path="fiabilite" element={<Fiabilite />} />
            <Route path="tests" element={<Navigate to="/prospectives" replace />} />
            <Route path="test/:id" element={<Suivi />} />
            <Route path="test/:id/rapport" element={<Rapport />} />
            <Route path="consultations" element={<Consultations />} />
            <Route path="consultations/recuperer" element={<PageRecuperer />} />
            <Route path="consultations/nouvelle/:projetId" element={<NouvelleConsultation />} />
            <Route path="consultation/:id" element={<Consultation />} />
            <Route path="*" element={<Introuvable />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
