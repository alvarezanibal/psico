import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarMonthOutlined, ContentCopyOutlined } from '@mui/icons-material'
import { Alert, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import { useAuth } from '../auth/Auth'
import { db } from '../../lib/supabase'
import { safeError } from '../../lib/format'
import { AppleCalendarInstructions } from './AppleCalendarInstructions'

const statusSchema = z.object({ enabled: z.boolean(), include_names: z.boolean(), updated_at: z.string().nullable() })
const resultSchema = statusSchema.extend({ token: z.string().regex(/^[a-f0-9]{64}$/).nullable() })
type Action = 'create' | 'rotate' | 'update' | 'revoke'
function message(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (['PGRST202', '42P01', '42883'].includes(code)) return 'La conexión con Apple Calendar todavía no está habilitada en el servidor.'
  return safeError(error)
}
export function AppleCalendar() {
  const { session } = useAuth()
  const userId = session?.user.id
  const cache = useQueryClient()
  const key = ['practice', 'calendar-subscription', userId]
  const subscription = useQuery({ queryKey: key, enabled: !!userId, retry: false, queryFn: async () => {
    const { data, error } = await db().rpc('calendar_subscription_status')
    if (error) throw error
    return statusSchema.parse(data)
  } })
  const [includeNames, setIncludeNames] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<'rotate' | 'revoke' | null>(null)
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'info'; text: string } | null>(null)
  useEffect(() => { if (subscription.data) setIncludeNames(subscription.data.include_names) }, [subscription.data?.include_names])
  async function configure(action: Action) {
    if (!subscription.data || busy) return
    setBusy(true); setNotice(null)
    if (action !== 'update') setUrl('')
    try {
      await cache.cancelQueries({ queryKey: key })
      // Direct async state: the clear subscription token never enters mutation/query caches.
      const { data, error } = await db().rpc('configure_calendar_subscription', {
        p_action: action, p_include_names: includeNames, p_expected_updated_at: subscription.data.updated_at,
      })
      if (error) throw error
      const result = resultSchema.parse(data)
      cache.setQueryData(key, { enabled: result.enabled, include_names: result.include_names, updated_at: result.updated_at })
      if (action === 'create' || action === 'rotate') {
        if (!result.token) throw new Error('Missing subscription link')
        const link = new URL('/functions/v1/calendar-feed', import.meta.env.VITE_SUPABASE_URL)
        link.searchParams.set('token', result.token)
        setUrl(link.toString())
        setNotice({ severity: 'success', text: 'Enlace listo. Copialo y seguí los pasos de abajo.' })
      } else setNotice({ severity: 'success', text: action === 'revoke' ? 'Enlace desactivado.' : 'Preferencia guardada. Apple la recibirá al actualizar la suscripción.' })
      setConfirmation(null)
    } catch (error) {
      setNotice({ severity: 'error', text: message(error) })
      // Refresh status after an ambiguous response; do not retry a rotation silently.
      await subscription.refetch()
    } finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice({ severity: 'success', text: 'Enlace copiado. Pegalo en Calendario de Apple.' }) }
    catch { setNotice({ severity: 'info', text: 'Seleccioná el enlace y copialo manualmente.' }) }
  }
  const enabled = subscription.data?.enabled === true
  return <Card sx={{ p: 3 }}><Stack spacing={2}>
    <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}><CalendarMonthOutlined color="primary" /><Typography variant="h6" sx={{ flex: 1 }}>Apple Calendar</Typography>{subscription.data && <Chip size="small" label={enabled ? 'Enlace creado' : 'Sin enlace'} color={enabled ? 'success' : 'default'} variant="outlined" />}</Stack>
    <Typography variant="body2" color="text.secondary">Solo lectura. Los turnos se editan en esta app; Apple actualiza la suscripción periódicamente.</Typography>
    {subscription.isLoading && <Typography variant="body2" color="text.secondary">Consultando conexión…</Typography>}
    {subscription.error && <Alert severity="error" action={<Button color="inherit" onClick={() => void subscription.refetch()}>Reintentar</Button>}>{message(subscription.error)}</Alert>}
    {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}
    {subscription.data && <>
      <FormControlLabel control={<Switch checked={includeNames} onChange={e => setIncludeNames(e.target.checked)} disabled={busy} />} label="Mostrar nombres completos" />
      <Typography variant="caption" color="text.secondary">Por defecto se muestran iniciales. No se incluyen importes, deudas ni datos de contacto.</Typography>
      {enabled && includeNames !== subscription.data.include_names && <Button sx={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => void configure('update')}>Guardar preferencia</Button>}
      {url ? <>
        <TextField label="Enlace privado de suscripción" value={url} onFocus={event => event.target.select()} slotProps={{ input: { readOnly: true }, htmlInput: { spellCheck: false, autoComplete: 'off' } }} />
        <Typography variant="caption" color="text.secondary">Con este enlace se puede leer tu agenda. Guardalo en privado.</Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}><Button startIcon={<ContentCopyOutlined />} onClick={() => void copy()} disabled={busy}>Copiar enlace</Button></Stack>
      </> : enabled && <Typography variant="body2" color="text.secondary">El enlace creado sigue activo. Si necesitás uno nuevo, usá Generar otro enlace y reemplazá la suscripción en Apple.</Typography>}
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        {!enabled ? <Button variant="contained" disabled={busy} onClick={() => void configure('create')}>{busy ? 'Creando…' : 'Crear enlace privado'}</Button> : <><Button disabled={busy} onClick={() => { setNotice(null); setConfirmation('rotate') }}>Generar otro enlace</Button><Button color="error" disabled={busy} onClick={() => { setNotice(null); setConfirmation('revoke') }}>Desactivar enlace</Button></>}
      </Stack>
      <AppleCalendarInstructions linkVisible={Boolean(url)} linkEnabled={enabled} />
      <Button component="a" href="https://support.apple.com/es-es/102301" target="_blank" rel="noopener noreferrer" size="small" sx={{ alignSelf: 'flex-start' }}>Ver la guía de Apple en español</Button>
    </>}
  </Stack>
    <Dialog open={confirmation !== null} onClose={busy ? undefined : () => setConfirmation(null)}><DialogTitle>{confirmation === 'rotate' ? 'Reemplazar enlace privado' : 'Desactivar enlace'}</DialogTitle><DialogContent><Typography variant="body2">{confirmation === 'rotate' ? 'El enlace anterior dejará de funcionar. En Apple Calendar, quitá la suscripción anterior y agregá la nueva.' : 'Apple dejará de recibir actualizaciones. Para quitar lo ya descargado, eliminá esa suscripción en Calendario.'}</Typography></DialogContent><DialogActions><Button disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</Button><Button color={confirmation === 'revoke' ? 'error' : 'primary'} variant="contained" disabled={busy} onClick={() => { if (confirmation) void configure(confirmation) }}>{busy ? 'Guardando…' : confirmation === 'rotate' ? 'Crear nuevo enlace' : 'Desactivar'}</Button></DialogActions></Dialog>
  </Card>
}