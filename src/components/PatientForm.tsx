import { useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { latestSeries, savePatient, usePracticeMutation, useSeries } from '../lib/api'
import { cents, decimal, localToday, safeError } from '../lib/format'
import { weekdayLabels, type Patient, type ScheduleInput } from '../lib/types'

const schema = z.object({
  first_name: z.string().trim().min(1, 'Ingresá el nombre.').max(80),
  last_name: z.string().trim().min(1, 'Ingresá el apellido.').max(80),
  email: z.union([z.literal(''), z.email('Revisá el email.')]), phone: z.string().max(40),
  default_session_price: z.string().refine(v => { try { cents(v); return true } catch { return false } }, 'Ingresá un importe válido.'),
  default_duration_minutes: z.string().refine(v => /^\d+$/.test(v) && Number(v)>=5 && Number(v)<=240, 'Usá entre 5 y 240 minutos.'),
})
export function PatientForm({ patient, close, saved }: { patient?: Patient; close: () => void; saved: () => void }) {
  const series = useSeries()
  const current = latestSeries(series.data || [], patient?.id)
  const [action, setAction] = useState<'keep' | 'set' | 'stop'>('keep')
  const [weekday, setWeekday] = useState('1')
  const [time, setTime] = useState('15:00')
  const [effective, setEffective] = useState(localToday)
  const [validation, setValidation] = useState('')
  const { register, handleSubmit, control, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: {
    first_name: patient?.first_name || '', last_name: patient?.last_name || '', email: patient?.email || '', phone: patient?.phone || '',
    default_session_price: patient?.default_session_price || '30000', default_duration_minutes: String(patient?.default_duration_minutes || 50),
  } })
  const duration = useWatch({ control, name: 'default_duration_minutes' })
  const mutation = usePracticeMutation(async (values: z.infer<typeof schema>) => {
    let schedule: ScheduleInput | undefined
    if (action !== 'keep') {
      if (series.isLoading || series.error) throw new Error('Falta configurar los horarios fijos. Aplicá la migración de agenda.')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effective) || effective < localToday() || (current && effective < current.starts_on)) {
        throw new Error('Ingresá una fecha desde hoy y posterior o igual al último cambio programado.')
      }
      if (action === 'set' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Ingresá un horario válido.')
      schedule = { action, effective_from: effective, weekday: Number(weekday), local_time: time,
        expected_series_id: current?.id || null, expected_updated_at: current?.updated_at || null }
    }
    await savePatient({ ...values, default_session_price: decimal(cents(values.default_session_price)), default_duration_minutes: Number(values.default_duration_minutes) }, patient?.id, schedule)
  })
  const submit = handleSubmit(async values => {
    setValidation('')
    try { await mutation.mutateAsync(values); saved() } catch (error) {
      if (error instanceof Error && /Ingresá|Falta configurar/.test(error.message)) setValidation(error.message)
    }
  })
  function selectAction(next: 'keep' | 'set' | 'stop') {
    setAction(next)
    if (current) { setWeekday(String(current.weekday)); setTime(current.local_time.slice(0, 5)) }
    setEffective(current && current.starts_on > localToday() ? current.starts_on : localToday())
  }
  return <Dialog open onClose={mutation.isPending ? undefined : close}><Box component="form" onSubmit={submit}>
    <DialogTitle>{patient ? 'Editar paciente' : 'Nuevo paciente'}</DialogTitle><DialogContent><Stack spacing={2.5} sx={{ pt: 1 }}>
      {(validation || mutation.error) && <Alert severity="error">{validation || safeError(mutation.error)}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Nombre" {...register('first_name')} error={!!errors.first_name} helperText={errors.first_name?.message} autoFocus /><TextField label="Apellido" {...register('last_name')} error={!!errors.last_name} helperText={errors.last_name?.message} /></Stack>
      <TextField label="Email (opcional)" type="email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
      <TextField label="Teléfono (opcional)" type="tel" {...register('phone')} error={!!errors.phone} helperText={errors.phone?.message} />
      <Divider /><Typography variant="body2" sx={{ fontWeight: 650 }}>Sesión habitual</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Honorario (ARS)" {...register('default_session_price')} error={!!errors.default_session_price} helperText={errors.default_session_price?.message || 'Sin separadores de miles.'} slotProps={{ htmlInput: { inputMode: 'decimal' } }} /><TextField label="Duración (minutos)" {...register('default_duration_minutes')} error={!!errors.default_duration_minutes} helperText={errors.default_duration_minutes?.message} slotProps={{ htmlInput: { inputMode: 'numeric' } }} /></Stack>
      {patient && <Typography variant="caption" color="text.secondary">Los cambios no modifican sesiones ya registradas.</Typography>}
      <Divider /><TextField select label="Horario fijo" value={action} onChange={e => selectAction(e.target.value as typeof action)} disabled={mutation.isPending || !!patient && !patient.active}>
        <MenuItem value="keep">{patient ? 'Conservar horario actual' : 'Sin horario fijo'}</MenuItem><MenuItem value="set">{patient ? 'Configurar o cambiar horario semanal' : 'Repetir todas las semanas'}</MenuItem>{current && <MenuItem value="stop">Quitar horario fijo desde una fecha</MenuItem>}
      </TextField>
      {current && <Typography variant="caption" color="text.secondary">{weekdayLabels[current.weekday]} {current.local_time.slice(0, 5)} · {current.duration_minutes} min · desde {current.starts_on.split('-').reverse().join('/')}{current.ends_on ? ` · hasta ${current.ends_on.split('-').reverse().join('/')}` : ' · sin fecha de fin'}</Typography>}
      {action !== 'keep' && <>
        {series.error && <Alert severity="error">Falta habilitar los horarios fijos en Supabase. Aplicá la migración de agenda.</Alert>}
        <TextField label={action === 'stop' ? 'Quitar desde' : 'Aplicar desde'} type="date" value={effective} onChange={e => setEffective(e.target.value)} required slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: current && current.starts_on > localToday() ? current.starts_on : localToday() } }} />
        {action === 'set' && <><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField select label="Día de la semana" value={weekday} onChange={e => setWeekday(e.target.value)}>{[1, 2, 3, 4, 5, 6, 0].map(d => <MenuItem key={d} value={String(d)}>{weekdayLabels[d]}</MenuItem>)}</TextField><TextField label="Hora (Argentina)" type="time" value={time} onChange={e => setTime(e.target.value)} required slotProps={{ inputLabel: { shrink: true } }} /></Stack><Typography variant="caption" color="text.secondary">Todas las semanas · {duration} minutos · sin fecha de fin. Cada fecha se puede mover o cancelar por separado.</Typography></>}
        {action === 'stop' && <Typography variant="caption" color="text.secondary">Se conserva el historial. Si hay turnos individuales desde esa fecha, hay que revisarlos antes de quitar la serie.</Typography>}
      </>}
    </Stack></DialogContent><DialogActions><Button onClick={close} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" variant="contained" disabled={mutation.isPending || action !== 'keep' && series.isLoading}>{mutation.isPending ? 'Guardando…' : 'Guardar paciente'}</Button></DialogActions>
  </Box></Dialog>
}