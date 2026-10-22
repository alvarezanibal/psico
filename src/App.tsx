import { Component, Suspense, lazy, type ReactNode } from 'react'
import { Alert, Box, Button, Stack } from '@mui/material'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AuthGate } from './features/auth/Auth'
import { configured } from './lib/supabase'
import Layout, { SetupScreen } from './components/Layout'
import { PracticeDialogs } from './components/PracticeDialogs'
import { EmptyState, QueryState } from './components/common'

const Dashboard = lazy(() => import('./features/dashboard/Dashboard'))
const Patients = lazy(() => import('./features/patients/Patients'))
const PatientDetail = lazy(() => import('./features/patients/PatientDetail'))
const Calendar = lazy(() => import('./features/calendar/Calendar'))
const Sessions = lazy(() => import('./features/sessions/Sessions'))
const Accounts = lazy(() => import('./features/accounts/Accounts'))
const Settings = lazy(() => import('./features/settings/Settings'))

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <Stack spacing={2} sx={{ maxWidth: 600, mx: "auto", p: 4 }} ><Alert severity="error">No pudimos mostrar esta pantalla. Recargá la aplicación para volver a intentarlo.</Alert><Button onClick={() => window.location.reload()}>Recargar</Button></Stack>
    return this.props.children
  }
}
export default function App({ callbackError }: { callbackError: string | null }) {
  if (!configured) return <SetupScreen />
  return <ErrorBoundary><AuthGate callbackError={callbackError}><HashRouter><PracticeDialogs><Suspense fallback={<Box sx={{ p: 4 }} ><QueryState loading error={null} /></Box>}><Routes><Route element={<Layout />}>
    <Route index element={<Dashboard />} /><Route path="pacientes" element={<Patients />} /><Route path="pacientes/:id" element={<PatientDetail />} /><Route path="calendario" element={<Calendar />} /><Route path="sesiones" element={<Sessions />} /><Route path="cuentas" element={<Accounts />} /><Route path="configuracion" element={<Settings />} /><Route path="*" element={<EmptyState title="Esta página no está disponible" description="Volvé a Inicio desde el menú para continuar." />} />
  </Route></Routes></Suspense></PracticeDialogs></HashRouter></AuthGate></ErrorBoundary>
}
