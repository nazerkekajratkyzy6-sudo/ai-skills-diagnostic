import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { configured } from './lib/supabase'
import Home from './pages/Home'
import Diagnostic from './pages/Diagnostic'
import Result from './pages/Result'
import Login from './pages/Login'
import Setup from './pages/Setup'
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const Dashboard = lazy(() => import('./admin/Dashboard'))
const Schools = lazy(() => import('./admin/Schools'))
const SchoolDetail = lazy(() => import('./admin/SchoolDetail'))
const Campaigns = lazy(() => import('./admin/Campaigns'))
const CampaignEdit = lazy(() => import('./admin/CampaignEdit'))
const Results = lazy(() => import('./admin/Results'))
const SubmissionView = lazy(() => import('./admin/SubmissionView'))
const ParticipantView = lazy(() => import('./admin/ParticipantView'))
const Compare = lazy(() => import('./admin/Compare'))
const Settings = lazy(() => import('./admin/Settings'))
import { ToastHost, Loading } from './components'

export default function App() {
  if (!configured) {
    return (
      <div className="page"><div className="card" style={{ marginTop: 40 }}>
        <h1>AI Skills Diagnostic</h1>
        <div className="alert warn">
          VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY орнатылмаған. Нұсқаулықтың 2-қадамын қараңыз.<br />
          Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. См. шаг 2 инструкции.
        </div>
      </div></div>
    )
  }
  return (
    <>
    <ToastHost />
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/d/:schoolCode" element={<Diagnostic />} />
      <Route path="/p/:personalCode" element={<Diagnostic />} />
      <Route path="/r/:token" element={<Result />} />
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="schools" element={<Schools />} />
        <Route path="schools/:id" element={<SchoolDetail />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:id" element={<CampaignEdit />} />
        <Route path="results" element={<Results />} />
        <Route path="results/:id" element={<SubmissionView />} />
        <Route path="participants/:id" element={<ParticipantView />} />
        <Route path="compare" element={<Compare />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </>
  )
}
