import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Missions from './pages/Missions'
import Layers from './pages/Layers'
import ChangeDetection from './pages/ChangeDetection'
import Analytics from './pages/Analytics'
import Projects from './pages/Projects'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                index element={<Landing />} />
        <Route path="/login"           element={<Login />} />
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/missions"        element={<Missions />} />
        <Route path="/layers"          element={<Layers />} />
        <Route path="/change-detection" element={<ChangeDetection />} />
        <Route path="/analytics"       element={<Analytics />} />
        <Route path="/projects"        element={<Projects />} />
        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
