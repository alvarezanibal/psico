import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Card, CircularProgress, Container, Stack, TextField, Typography } from '@mui/material'
import { LockOutlined, SpaRounded } from '@mui/icons-material'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { db } from '../../lib/supabase'
import { safeError } from '../../lib/format'
import { appAccountSchema, loginIdentifier, type AppAccount } from '../../lib/access'

interface AuthValue { session: Session | null; account: AppAccount | null; logout: () => Promise<void> }
const AuthContext = createContext<AuthValue>({ session: null, account: null, logout: async () => {} })
export const useAuth = () => useContext(AuthContext)
type Access = 'loading' | 'signed_out' | 'blocked' | 'setup_required' | 'ready' | 'error'
const recoveryKey = 'consultorio-password-recovery'

export async function handleAuthCallback(): Promise<string | null> {
  const url = new URL(window.location.href)
  const error = url.searchParams.has('error') || url.hash.includes('error_description=')
  if (url.searchParams.get('recovery') === '1') sessionStorage.setItem(recoveryKey, '1')
  const code = url.searchParams.get('code')
  if (code) {
    const { error: problem } = await db().auth.exchangeCodeForSession(code)
    window.history.replaceState({}, '', url.pathname + '#/')
    if (problem) return 'El enlace venció o fue abierto en otro navegador. Solicitá ayuda al administrador.'
  } else if (error) {
    window.history.replaceState({}, '', url.pathname + '#/')
    return 'El enlace de acceso no es válido o venció.'
  }
  return null
}

async function readAccount(session: Session): Promise<{ account: AppAccount | null; needsSetup: boolean }> {
  const { data, error } = await db().rpc('current_app_account')
  if (!error) return { account: data ? appAccountSchema.parse(data) : null, needsSetup: false }
  // Keep the already-published professional account usable until the new SQL is applied.
  if (error.code !== 'PGRST202' && error.code !== '42883') throw error
  const [{ data: owner, error: ownerError }, { data: allowed, error: allowedError }] = await Promise.all([
    db().rpc('is_app_owner'), db().rpc('has_app_access'),
  ])
  if (ownerError || allowedError) throw ownerError || allowedError
  if (!owner) return { account: null, needsSetup: false }
  return { account: {
    user_id: session.user.id, username: session.user.email || 'profesional',
    display_name: 'Mi consultorio', role: 'professional', active: Boolean(allowed), managed_login: false,
  }, needsSetup: !allowed }
}

export function AuthGate({ children, callbackError }: { children: ReactNode; callbackError: string | null }) {
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<AppAccount | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [access, setAccess] = useState<Access>('loading')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [recovery, setRecovery] = useState(() => sessionStorage.getItem(recoveryKey) === '1')
  const cache = useQueryClient()
  const identity = useRef<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = db().auth.onAuthStateChange((event, next) => {
      if (identity.current !== (next?.user.id || null)) {
        cache.clear(); setAccount(null); setAccess('loading')
        identity.current = next?.user.id || null
      }
      setSession(next); setInitialized(true)
      if (event === 'PASSWORD_RECOVERY') { sessionStorage.setItem(recoveryKey, '1'); setRecovery(true) }
      if (event === 'SIGNED_OUT') { cache.clear(); sessionStorage.removeItem(recoveryKey); setRecovery(false) }
    })
    return () => subscription.unsubscribe()
  }, [cache])

  useEffect(() => {
    let active = true
    let checking = false
    if (!initialized) return
    if (!session) { setAccount(null); setAccess('signed_out'); return }
    setAccess('loading')
    async function check() {
      if (checking) return
      checking = true
      try {
        const result = await readAccount(session!)
        if (!active) return
        if (result.needsSetup) { setAccess('setup_required'); return }
        if (!result.account?.active) {
          await cache.cancelQueries()
          if (!active) return
          cache.clear(); setAccount(null); setAccess('blocked'); return
        }
        setAccount(result.account); setAccess('ready')
      } catch (problem) { if (active) { setError(safeError(problem)); setAccess('error') } }
      finally { checking = false }
    }
    const onFocus = () => { if (document.visibilityState === 'visible') void check() }
    void check()
    const timer = window.setInterval(onFocus, 30000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      active = false; window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [initialized, session, revision, cache])

  async function logout() {
    await cache.cancelQueries(); cache.clear()
    const { error: problem } = await db().auth.signOut()
    if (problem) { setError('No pudimos cerrar la sesión. Volvé a intentarlo.'); setAccess('error') }
  }
  if (access === 'ready' && account && !recovery) return <AuthContext.Provider value={{ session, account, logout }}>{children}</AuthContext.Provider>
  return <AuthFrame>
    {access === 'loading' && <Stack spacing={2} sx={{ alignItems: 'center', py: 5 }}><CircularProgress size={28} /><Typography color="text.secondary">Preparando tu espacio…</Typography></Stack>}
    {access === 'signed_out' && <Login initialError={callbackError} />}
    {access === 'blocked' && <Stack spacing={2}><Typography variant="h5">Acceso no habilitado</Typography><Alert severity="info">Tu cuenta no tiene acceso a la aplicación. Consultá al administrador para habilitarla.</Alert><Button onClick={() => setRevision(v => v + 1)}>Reintentar</Button><Button onClick={() => void logout()}>Volver al ingreso</Button></Stack>}
    {access === 'error' && <Stack spacing={2}><Alert severity="error">{error}</Alert><Button onClick={() => setRevision(v => v + 1)}>Reintentar</Button><Button onClick={() => void logout()}>Cerrar sesión</Button></Stack>}
    {access === 'setup_required' && <Stack spacing={2}><Typography variant="h5">Actualizá el acceso</Typography><Alert severity="info">Falta aplicar la actualización de acceso en Supabase. Seguí los pasos de configuración de usuarios.</Alert><Button variant="contained" onClick={() => setRevision(v => v + 1)}>Reintentar</Button><Button onClick={() => void logout()}>Cerrar sesión</Button></Stack>}
    {access === 'ready' && recovery && <PasswordForm onSaved={() => { sessionStorage.removeItem(recoveryKey); setRecovery(false) }} />}
  </AuthFrame>
}
function AuthFrame({ children }: { children: ReactNode }) {
  return <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', py: 5 }}><Container maxWidth="xs"><Stack direction="row" spacing={1.3} sx={{ alignItems: 'center', justifyContent: 'center', mb: 4 }}><Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 3, p: 1, display: 'flex' }}><SpaRounded /></Box><Typography variant="h5">consultorio<span style={{ color: '#2563EB' }}>.</span></Typography></Stack><Card sx={{ p: 3.5 }}>{children}</Card><Stack direction="row" sx={{ justifyContent: 'center', gap: .7, mt: 3, color: 'text.secondary' }}><LockOutlined sx={{ fontSize: 14 }} /><Typography variant="caption">Tu espacio privado de gestión</Typography></Stack></Container></Box>
}
function Login({ initialError }: { initialError: string | null }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError || '')
  const [help, setHelp] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const email = loginIdentifier(username)
      const { error: problem } = await db().auth.signInWithPassword({ email, password })
      if (problem) setError('No pudimos ingresar. Revisá tu usuario y contraseña.')
    } catch (problem) {
      setError(problem instanceof Error && problem.message.startsWith('Ingresá') ? problem.message : 'No pudimos conectar. Volvé a intentarlo.')
    } finally { setBusy(false) }
  }
  return <Stack component="form" onSubmit={submit} spacing={2.5}>
    <Box><Typography variant="h5" sx={{ mb: 1 }}>Qué bueno tenerte acá</Typography><Typography variant="body2" color="text.secondary">Ingresá a tu espacio con tu usuario y contraseña.</Typography></Box>
    {error && <Alert severity="error">{error}</Alert>}
    {help && <Alert severity="info">Pedile al administrador que restablezca tu contraseña. No se envían correos de recuperación para las cuentas nuevas.</Alert>}
    <TextField label="Usuario" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" helperText="Si tu cuenta ya existía, también podés ingresar con tu email habitual." slotProps={{ htmlInput: { maxLength: 254, autoCapitalize: 'none', spellCheck: false } }} />
    <TextField label="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
    <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Un momento…' : 'Ingresar'}</Button>
    <Button size="small" onClick={() => setHelp(!help)}>No recuerdo mi contraseña</Button>
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
    if (problem) setError('No pudimos actualizar la contraseña. Usá al menos 12 caracteres.')
    else onSaved()
  }
  return <Stack component="form" onSubmit={save} spacing={2.5}><Typography variant="h5">Nueva contraseña</Typography>{error && <Alert severity="error">{error}</Alert>}<TextField label="Nueva contraseña" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }} /><TextField label="Repetir contraseña" type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required /><Button type="submit" variant="contained" disabled={busy}>Guardar y continuar</Button></Stack>
}
