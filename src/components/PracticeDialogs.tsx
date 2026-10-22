import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { AutoFixHighRounded } from '@mui/icons-material'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePatients, usePracticeMutation, useSessions, savePatient, saveSession, recordPayment } from '../lib/api'
import { cents, dateLabel, decimal, localInput, localToday, money, safeError, toUtc } from '../lib/format'
import { fullName, sessionLabels, type Patient, type PaymentInput, type PracticeSession } from '../lib/types'
import { QueryState } from './common'

type DialogState = { type: 'patient'; patient?: Patient } | { type: 'session'; session?: PracticeSession; patientId?: string; day?: string } | { type: 'payment'; patientId?: string } | null
const DialogContext = createContext({
  editPatient: (_patient?: Patient) => {},
  editSession: (_session?: PracticeSession, _patientId?: string, _day?: string) => {},
  pay: (_patientId?: string) => {},
  notify: (_message: string) => {},
})
export const usePracticeDialogs = () => useContext(DialogContext)
export function PracticeDialogs({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const [message, setMessage] = useState('')
  const actions = useMemo(() => ({
    editPatient: (patient?: Patient) => setDialog({ type: 'patient', patient }),
    editSession: (session?: PracticeSession, patientId?: string, day?: string) => setDialog({ type: 'session', session, patientId, day }),
    pay: (patientId?: string) => setDialog({ type: 'payment', patientId }),
    notify: setMessage,
  }), [])
  function saved(message: string) { setDialog(null); setMessage(message) }
  return <DialogContext.Provider value={actions}>{children}
    {dialog?.type === 'patient' && <PatientForm patient={dialog.patient} close={() => setDialog(null)} saved={() => saved(dialog.patient ? 'Paciente actualizado.' : 'Paciente agregado.')} />}
    {dialog?.type === 'session' && <SessionForm session={dialog.session} patientId={dialog.patientId} day={dialog.day} close={() => setDialog(null)} saved={() => saved(dialog.session ? 'Sesión actualizada.' : 'Turno agendado.')} />}
    {dialog?.type === 'payment' && <PaymentForm patientId={dialog.patientId} close={() => setDialog(null)} saved={() => saved('Pago registrado. Los saldos están actualizados.')} />}
    <Snackbar open={Boolean(message)} autoHideDuration={5000} onClose={() => setMessage('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity="success" onClose={() => setMessage('')} variant="filled">{message}</Alert></Snackbar>
  </DialogContext.Provider>
}
const moneyField = z.string().refine(value => { try { cents(value); return true } catch { return false } }, 'Ingresá un importe válido, sin separadores de miles.')
const patientSchema = z.object({
  first_name: z.string().trim().min(1, 'Ingresá el nombre.').max(80),
  last_name: z.string().trim().min(1, 'Ingresá el apellido.').max(80),
  email: z.union([z.literal(''), z.email('Revisá el email.')]),
  phone: z.string().max(40, 'Hasta 40 caracteres.'),
  default_session_price: moneyField,
  default_duration_minutes: z.string().refine(v => /^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 240, 'Usá entre 5 y 240 minutos.'),
})
function PatientForm({ patient, close, saved }: { patient?: Patient; close: () => void; saved: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(patientSchema), defaultValues: {
    first_name: patient?.first_name || '', last_name: patient?.last_name || '', email: patient?.email || '', phone: patient?.phone || '',
    default_session_price: patient?.default_session_price || '30000', default_duration_minutes: String(patient?.default_duration_minutes || 50),
  } })
  const mutation = usePracticeMutation(async (values: z.infer<typeof patientSchema>) => savePatient({ ...values, default_session_price: decimal(cents(values.default_session_price)), default_duration_minutes: Number(values.default_duration_minutes) }, patient?.id))
  const submit = handleSubmit(async values => { try { await mutation.mutateAsync(values); saved() } catch { /* Displayed in the dialog. */ } })
  return <Dialog open onClose={mutation.isPending ? undefined : close}><Box component="form" onSubmit={submit}>
    <DialogTitle>{patient ? 'Editar paciente' : 'Nuevo paciente'}</DialogTitle><DialogContent><Stack spacing={2.5} sx={{ pt: 1 }} >
      {mutation.error && <Alert severity="error">{safeError(mutation.error)}</Alert>}
      <Typography variant="body2" sx={{ color: "text.secondary" }} >Los datos necesarios para acompañar tu gestión diaria.</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Nombre" {...register('first_name')} error={!!errors.first_name} helperText={errors.first_name?.message} autoFocus /><TextField label="Apellido" {...register('last_name')} error={!!errors.last_name} helperText={errors.last_name?.message} /></Stack>
      <TextField label="Email (opcional)" type="email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
      <TextField label="Teléfono (opcional)" type="tel" {...register('phone')} error={!!errors.phone} helperText={errors.phone?.message} />
      <Divider /><Typography variant="body2" sx={{ fontWeight: 650 }} >Sesión habitual</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Honorario (ARS)" {...register('default_session_price')} error={!!errors.default_session_price} helperText={errors.default_session_price?.message || 'Sin separadores de miles.'} slotProps={{ htmlInput: { inputMode: 'decimal' } }} /><TextField label="Duración (minutos)" {...register('default_duration_minutes')} error={!!errors.default_duration_minutes} helperText={errors.default_duration_minutes?.message} slotProps={{ htmlInput: { inputMode: 'numeric' } }} /></Stack>
      {patient && <Typography variant="caption" sx={{ color: "text.secondary" }} >Cambiar el honorario no modifica las sesiones ya registradas.</Typography>}
    </Stack></DialogContent><DialogActions><Button onClick={close} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" variant="contained" disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar paciente'}</Button></DialogActions>
  </Box></Dialog>
}
const sessionSchema = z.object({
  patient_id: z.uuid('Seleccioná un paciente.'),
  starts_at: z.string().min(1, 'Elegí fecha y hora.'),
  duration: z.string().refine(v => /^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 240, 'Usá entre 5 y 240 minutos.'),
  status: z.enum(['programada', 'realizada', 'cancelada', 'ausente']),
  price: moneyField, cancellation_fee: moneyField,
  cancellation_reason: z.string().max(300, 'Hasta 300 caracteres.'),
})
function SessionForm({ session, patientId, day, close, saved }: { session?: PracticeSession; patientId?: string; day?: string; close: () => void; saved: () => void }) {
  const patients = usePatients()
  const selected = patients.data?.find(p => p.id === (session?.patient_id || patientId))
  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm({ resolver: zodResolver(sessionSchema), defaultValues: {
    patient_id: session?.patient_id || patientId || '', starts_at: session ? localInput(session.starts_at) : `${day || localToday()}T09:00`,
    duration: session ? String(Math.round((Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60000)) : String(selected?.default_duration_minutes || 50),
    status: session?.status || 'programada', price: session?.price || selected?.default_session_price || '30000',
    cancellation_fee: session?.cancellation_fee || '0', cancellation_reason: session?.cancellation_reason || '',
  } })
  const status = useWatch({ control, name: 'status' })
  const fee = status === 'cancelada' || status === 'ausente'
  const [validationError, setValidationError] = useState('')
  const mutation = usePracticeMutation(async (values: z.infer<typeof sessionSchema>) => {
    const starts = toUtc(values.starts_at)
    await saveSession({ patient_id: values.patient_id, starts_at: starts, ends_at: new Date(Date.parse(starts) + Number(values.duration) * 60000).toISOString(), status: values.status, price: decimal(cents(values.price)), cancellation_fee: fee ? decimal(cents(values.cancellation_fee)) : '0.00', cancellation_reason: fee ? values.cancellation_reason : '', expected_updated_at: session?.updated_at }, session?.id)
  })
  const submit = handleSubmit(async values => {
    setValidationError('')
    if (fee && cents(values.cancellation_fee) > 0 && !values.cancellation_reason.trim()) { setValidationError('Indicá el motivo del cargo de cancelación o ausencia.'); return }
    try { await mutation.mutateAsync(values); saved() } catch { /* Displayed below. */ }
  })
  return <Dialog open onClose={mutation.isPending ? undefined : close}><Box component="form" onSubmit={submit}><DialogTitle>{session ? 'Editar sesión' : 'Agendar turno'}</DialogTitle><DialogContent><Stack spacing={2.5} sx={{ pt: 1 }} >
    <QueryState loading={patients.isLoading} error={patients.error} retry={patients.refetch} />
    {(mutation.error || validationError) && <Alert severity="error">{validationError || safeError(mutation.error)}</Alert>}
    <TextField label="Paciente" select {...register('patient_id', { onChange: event => {
      if (session) return
      const patient = patients.data?.find(p => p.id === event.target.value)
      if (patient) { setValue('price', patient.default_session_price); setValue('duration', String(patient.default_duration_minutes)) }
    } })} defaultValue={session?.patient_id || patientId || ''} error={!!errors.patient_id} helperText={errors.patient_id?.message} slotProps={{ select: { readOnly: !!session } }}>
      {(patients.data || []).filter(p => p.active || p.id === session?.patient_id).map(p => <MenuItem key={p.id} value={p.id}>{fullName(p)}</MenuItem>)}
    </TextField>
    {!patients.isLoading && !patients.data?.some(p => p.active) && !session && <Alert severity="info">Agregá o reactivá un paciente antes de agendar.</Alert>}
    <TextField label="Fecha y hora (Argentina)" type="datetime-local" {...register('starts_at')} error={!!errors.starts_at} helperText={errors.starts_at?.message} slotProps={{ inputLabel: { shrink: true } }} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Duración (minutos)" {...register('duration')} error={!!errors.duration} helperText={errors.duration?.message} /><TextField label="Honorario (ARS)" {...register('price')} error={!!errors.price} helperText={errors.price?.message} slotProps={{ htmlInput: { inputMode: 'decimal' } }} /></Stack>
    <TextField select label="Estado de la sesión" {...register('status')} defaultValue={session?.status || 'programada'}>{Object.entries(sessionLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
    {fee && <><Alert severity="info">Las cancelaciones y ausencias no generan deuda salvo que registres un cargo explícito.</Alert><TextField label="Cargo excepcional (ARS)" {...register('cancellation_fee')} error={!!errors.cancellation_fee} helperText={errors.cancellation_fee?.message} /><TextField label="Motivo del cargo" {...register('cancellation_reason')} error={!!errors.cancellation_reason} helperText={errors.cancellation_reason?.message} /></>}
    {session && cents(session.paid_amount) > 0 && <Alert severity="info">Esta sesión tiene pagos. Para corregir sus datos primero revertí el pago incorrecto.</Alert>}
  </Stack></DialogContent><DialogActions><Button onClick={close} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" variant="contained" disabled={mutation.isPending || patients.isLoading}>{mutation.isPending ? 'Guardando…' : session ? 'Guardar cambios' : 'Agendar turno'}</Button></DialogActions></Box></Dialog>
}
function PaymentForm({ patientId, close, saved }: { patientId?: string; close: () => void; saved: () => void }) {
  const patients = usePatients()
  const sessions = useSessions()
  const [selected, setSelected] = useState(patientId || '')
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(localInput(new Date().toISOString()))
  const [method, setMethod] = useState<PaymentInput['method']>('transferencia')
  const [reference, setReference] = useState('')
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [frozen, setFrozen] = useState(false)
  const request = useRef<{ key: string; data: PaymentInput } | null>(null)
  const eligible = (sessions.data || []).filter(s => s.patient_id === selected && cents(s.balance) > 0).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const patient = patients.data?.find(p => p.id === selected)
  const mutation = usePracticeMutation(async (input: { key: string; data: PaymentInput }) => recordPayment(input.data, input.key))
  let assigned = 0
  let validAllocation = true
  for (const value of Object.values(allocations)) { try { assigned += cents(value || '0') } catch { validAllocation = false } }
  function distribute(value: string) {
    const next: Record<string, string> = {}
    try {
      let remaining = cents(value)
      for (const item of eligible) { const part = Math.min(remaining, cents(item.balance)); next[item.id] = decimal(part); remaining -= part }
    } catch { /* Keep the form editable while the amount is incomplete. */ }
    setAllocations(next)
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try {
      if (!request.current) {
        if (!selected) throw new Error('Seleccioná un paciente.')
        const total = cents(amount)
        if (!validAllocation || total === 0 || assigned !== total) throw new Error('El importe recibido debe coincidir con el total asignado.')
        const parts = eligible.filter(s => cents(allocations[s.id] || '0') > 0).map(s => {
          const value = cents(allocations[s.id])
          if (value > cents(s.balance)) throw new Error('El importe asignado supera el saldo de una sesión.')
          return { session_id: s.id, amount: decimal(value) }
        })
        const paid = toUtc(paidAt)
        if (Date.parse(paid) > Date.now()) throw new Error('La fecha del pago no puede ser futura.')
        request.current = { key: crypto.randomUUID(), data: { patient_id: selected, amount: decimal(total), paid_at: paid, method, reference, allocations: parts } }
        setFrozen(true)
      }
      await mutation.mutateAsync(request.current)
      saved()
    } catch (problem) { setError(safeError(problem)) }
  }
  const busy = mutation.isPending
  return <Dialog open onClose={busy ? undefined : close} maxWidth="md"><Box component="form" onSubmit={submit}><DialogTitle>Registrar pago</DialogTitle><DialogContent><Stack spacing={2.5} sx={{ pt: 1 }} >
    <QueryState loading={patients.isLoading || sessions.isLoading} error={patients.error || sessions.error} retry={() => { void patients.refetch(); void sessions.refetch() }} />
    {error && <Alert severity="error">{error}</Alert>}
    {frozen && error && <Alert severity="info">Podés reintentar este mismo pago sin duplicarlo. Para cambiar sus datos, cerrá y revisá primero el historial de pagos.</Alert>}
    <TextField select label="Paciente" value={selected} disabled={busy || frozen} onChange={e => { setSelected(e.target.value); setAllocations({}); setAmount('') }} required>{(patients.data || []).filter(p => cents(p.balance) > 0 || p.id === patientId).map(p => <MenuItem key={p.id} value={p.id}>{fullName(p)} · {money(p.balance)}</MenuItem>)}</TextField>
    {patient && <Typography variant="body2" sx={{ color: "text.secondary" }} >Saldo pendiente: <Box component="strong" sx={{ color: "text.primary" }} >{money(patient.balance)}</Box> · {patient.pending_sessions} sesiones</Typography>}
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2 }} ><TextField label="Importe recibido (ARS)" value={amount} disabled={busy || frozen} onChange={e => { setAmount(e.target.value); distribute(e.target.value) }} slotProps={{ htmlInput: { inputMode: 'decimal' } }} required /><TextField label="Fecha y hora del pago" type="datetime-local" value={paidAt} onChange={e => setPaidAt(e.target.value)} required disabled={busy || frozen} slotProps={{ inputLabel: { shrink: true } }} /></Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2 }} ><TextField select label="Medio de pago" value={method} onChange={e => setMethod(e.target.value as PaymentInput['method'])} disabled={busy || frozen}><MenuItem value="transferencia">Transferencia</MenuItem><MenuItem value="efectivo">Efectivo</MenuItem><MenuItem value="otro">Otro</MenuItem></TextField><TextField label="Referencia (opcional)" value={reference} onChange={e => setReference(e.target.value)} disabled={busy || frozen} slotProps={{ htmlInput: { maxLength: 200 } }} /></Stack>
    <Divider /><Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }} ><Typography variant="body2" sx={{ fontWeight: 650 }} >Asignación a sesiones</Typography><Button size="small" startIcon={<AutoFixHighRounded />} onClick={() => distribute(amount)} disabled={!selected || !amount || busy || frozen}>Más antiguas primero</Button></Stack>
    <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Sesión</TableCell><TableCell align="right">Saldo</TableCell><TableCell align="right">Asignar (ARS)</TableCell></TableRow></TableHead><TableBody>{eligible.map(s => <TableRow key={s.id}><TableCell>{dateLabel(s.starts_at)}<Typography variant="caption" sx={{ display: "block", color: "text.secondary" }} >{dateLabel(s.starts_at, 'HH:mm')}</Typography></TableCell><TableCell align="right">{money(s.balance)}</TableCell><TableCell align="right"><TextField value={allocations[s.id] || ''} onChange={e => setAllocations(current => ({ ...current, [s.id]: e.target.value }))} disabled={busy || frozen} placeholder="0" sx={{ maxWidth: 145 }} slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': `Asignar a sesión del ${dateLabel(s.starts_at)}` } }} /></TableCell></TableRow>)}</TableBody></Table></TableContainer>
    {!eligible.length && <Typography variant="body2" sx={{ color: "text.secondary" }} >{selected ? 'Este paciente no tiene sesiones con saldo pendiente.' : 'Seleccioná un paciente para ver sus sesiones pendientes.'}</Typography>}
    <Stack direction="row" sx={{ justifyContent: "space-between" }} ><Typography variant="body2" sx={{ color: "text.secondary" }} >Total asignado</Typography><Typography sx={{ fontWeight: 700 }} >{validAllocation ? money(decimal(assigned)) : 'Revisá los importes'}</Typography></Stack>
    <Typography variant="caption" sx={{ color: "text.secondary" }} >Se admiten pagos parciales y agrupados. Los anticipos y excedentes no se registran en esta versión.</Typography>
  </Stack></DialogContent><DialogActions><Button onClick={close} disabled={busy}>Cancelar</Button><Button type="submit" variant="contained" disabled={busy || !eligible.length || !selected}>{busy ? 'Registrando…' : frozen ? 'Reintentar el mismo pago' : 'Confirmar pago'}</Button></DialogActions></Box></Dialog>
}
