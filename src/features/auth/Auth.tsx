import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Card, CircularProgress, Container, Stack, TextField, Typography } from '@mui/material'
import { ArrowBackRounded, LockOutlined, SpaRounded } from '@mui/icons-material'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { db } from '../../lib/supabase'
import { safeError } from '../../lib/format'

interface AuthValue { session: Session | null; logout: () => Promise<void> }
const AuthContext = createContext<AuthValue>({ session: null, logout: async () => {} })
export const useAuth = () => useContext(AuthContext)
type Access = 'loading' | 'signed_out' | 'blocked' | 'setup_required' | 'ready' | 'error'
const recoveryKey = 'consultorio-password-recovery'

export async function handleAuthCallback(): Promise<string | null> {
  const url = new URL(window.location.href)
  const error = url.searchParams.has('error') || url.hash.includes('error_description=')
  if (url.searchParams.get('recovery') === '1') sessionStorage.setItem(recoveryKey, '1')
  const code = url.searchParams.get('code')
  if (code) {
    const { error: exchangeError } = await db().auth.exchangeCodeForSession(code)
    window.history.replaceState({}, '', `${url.pathname}#/`)
    if (exchangeError) return 'El enlace venció o fue abierto en otro navegador. Solicitá uno nuevo desde este dispositivo.'
  } else if (error) {
    window.history.replaceState({}, '', `${url.pathname}#/`)
    return 'El enlace de acceso no es válido o venció. Solicitá uno nuevo.'
  }
  return null
}

export function AuthGate({ children, callbackError }: { children: ReactNode; callbackError: string | null }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [access, setAccess] = useState<Access>('loading')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [recovery, setRecovery] = useState(() => sessionStorage.getItem(recoveryKey) === '1')
  const cache = useQueryClient()
  useEffect(() => {
    const { data: { subscription } } = db().auth.onAuthStateChange((event, next) => {
      setSession(next); setInitialized(true)
      if (event === 'PASSWORD_RECOVERY') { sessionStorage.setItem(recoveryKey, '1'); setRecovery(true) }
      if (event === 'SIGNED_OUT') { cache.clear(); sessionStorage.removeItem(recoveryKey); setRecovery(false) }
    })
    return () => subscription.unsubscribe()
  }, [cache])
  useEffect(() => {
    let active = true
    if (!initialized) return
    if (!session) { setAccess('signed_out'); return }
    setAccess('loading')
    async function check() {
      try {
        const [{ data: owner, error: ownerError }, { data: allowed, error: accessError }] = await Promise.all([
          db().rpc('is_app_owner'), db().rpc('has_app_access'),
        ])
        if (ownerError || accessError) throw ownerError || accessError
        if (!active) return
        if (!owner) { setAccess('blocked'); return }
        setAccess(allowed ? 'ready' : 'setup_required')
      } catch (problem) { if (active) { setError(safeError(problem)); setAccess('error') } }
    }
    void check()
    return () => { active = false }
  }, [initialized, session, revision])
  async function logout() {
    await cache.cancelQueries()
    cache.clear()
    const { error: signOutError } = await db().auth.signOut()
    if (signOutError) throw signOutError
  }
  if (access === 'ready' && !recovery) return <AuthContext.Provider value={{ session, logout }}>{children}</AuthContext.Provider>
  return <AuthFrame>
    {access === 'loading' && <Stack spacing={2} sx={{ alignItems: "center", py: 5 }} ><CircularProgress size={28} /><Typography sx={{ color: "text.secondary" }} >Preparando tu espacio…</Typography></Stack>}
    {access === 'signed_out' && <Login initialError={callbackError} />}
    {access === 'blocked' && <Stack spacing={2}><Typography variant="h5">Acceso privado</Typography><Alert severity="warning">Esta cuenta no está habilitada para este consultorio.</Alert><Button onClick={() => void logout()}>Volver al ingreso</Button></Stack>}
    {access === 'error' && <Stack spacing={2}><Alert severity="error">{error}</Alert><Button onClick={() => setRevision(v => v + 1)}>Reintentar</Button><Button onClick={() => void logout()}>Cerrar sesión</Button></Stack>}
    {access === 'setup_required' && <Stack spacing={2}><Typography variant="h5">Actualizá el acceso</Typography><Alert severity="info">Tu cuenta está habilitada. Falta aplicar en Supabase la actualización para ingresar con email y contraseña.</Alert><Typography variant="body2">Ejecutá el archivo <strong>202610220001_password_only_access.sql</strong> en el SQL Editor de tu proyecto y presioná Reintentar.</Typography><Button variant="contained" onClick={() => setRevision(v => v + 1)}>Reintentar</Button><Button onClick={() => void logout()}>Cerrar sesión</Button></Stack>}
    {access === 'ready' && recovery && <PasswordForm onSaved={() => { sessionStorage.removeItem(recoveryKey); setRecovery(false) }} />}
  </AuthFrame>
}
function AuthFrame({ children }: { children: ReactNode }) {
  return <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', py: 5, background: theme => `radial-gradient(ellipse at 20% 10%, ${theme.palette.action.selected}, transparent 60%)` }}><Container maxWidth="xs"><Stack direction="row" spacing={1.3} sx={{ alignItems: "center", justifyContent: "center", mb: 4 }} ><Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 3, p: 1, display: 'flex' }}><SpaRounded /></Box><Typography variant="h5">consultorio<span style={{ color: '#2563EB' }}>.</span></Typography></Stack><Card sx={{ p: 3.5 }}>{children}</Card><Stack direction="row" sx={{ justifyContent: "center", gap: .7, mt: 3, color: "text.secondary" }} ><LockOutlined sx={{ fontSize: 14 }} /><Typography variant="caption">Tu espacio privado de gestión</Typography></Stack></Container></Box>
}
function Login({ initialError }: { initialError: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reset, setReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError || '')
  const [sent, setSent] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (reset) {
        const redirect = `${window.location.origin}${import.meta.env.BASE_URL}?recovery=1`
        const { error: problem } = await db().auth.resetPasswordForEmail(email, { redirectTo: redirect })
        if (problem) throw problem
        setSent(true)
      } else {
        const { error: problem } = await db().auth.signInWithPassword({ email, password })
        if (problem) { setError('No pudimos ingresar. Revisá tu email y contraseña.'); return }
      }
    } catch { setError('No pudimos conectar. Volvé a intentarlo en unos minutos.') } finally { setBusy(false) }
  }
  return <Stack component="form" onSubmit={submit} spacing={2.5}>
    <Box><Typography variant="h5" sx={{ mb: 1 }} >{reset ? 'Recuperá tu acceso' : 'Qué bueno tenerte acá'}</Typography><Typography variant="body2" sx={{ color: "text.secondary" }} >{reset ? 'Te enviaremos un enlace para cambiar tu contraseña.' : 'Ingresá para organizar tu día y llevar tus cuentas.'}</Typography></Box>
    {error && <Alert severity="error">{error}</Alert>}
    {sent && <Alert severity="success">Si el email corresponde a tu cuenta, recibirás un enlace. Abrilo en este mismo navegador.</Alert>}
    <TextField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
    {!reset && <TextField label="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />}
    <Button type="submit" variant="contained" disabled={busy || sent}>{busy ? 'Un momento…' : reset ? 'Enviar enlace' : 'Ingresar'}</Button>
    <Button size="small" startIcon={reset ? <ArrowBackRounded /> : undefined} onClick={() => { setReset(!reset); setError(''); setSent(false) }}>{reset ? 'Volver al ingreso' : 'Olvidé mi contraseña'}</Button>
  </Stack>
}
function PasswordForm({ onSaved }: { onSaved: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return }
    setBusy(true)
    const { error: problem } = await db().auth.updateUser({ password })
    setBusy(false)
    if (problem) setError('No pudimos actualizar la contraseña. Usá al menos 12 caracteres y revisá que el enlace siga vigente.')
    else onSaved()
  }
  return <Stack component="form" onSubmit={save} spacing={2.5}><Typography variant="h5">Nueva contraseña</Typography>{error && <Alert severity="error">{error}</Alert>}<TextField label="Nueva contraseña" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required slotProps={{ htmlInput: { minLength: 12 } }} /><TextField label="Repetir contraseña" type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required /><Button type="submit" variant="contained" disabled={busy}>Guardar y continuar</Button></Stack>
}
