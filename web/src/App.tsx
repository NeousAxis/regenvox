import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Fiabilite from './pages/Fiabilite'
import Layout from './components/Layout'
import Accueil from './pages/Accueil'
import Nouveau from './pages/Nouveau'
import Suivi from './pages/Suivi'
import Rapport from './pages/Rapport'
import MesProspectives from './pages/MesProspectives'
import Introuvable from './pages/Introuvable'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Accueil />} />
          <Route path="nouveau" element={<Nouveau />} />
          <Route path="prospectives" element={<MesProspectives />} />
          <Route path="fiabilite" element={<Fiabilite />} />
          <Route path="tests" element={<Navigate to="/prospectives" replace />} />
          <Route path="test/:id" element={<Suivi />} />
          <Route path="test/:id/rapport" element={<Rapport />} />
          <Route path="*" element={<Introuvable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
