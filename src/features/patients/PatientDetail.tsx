import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AddRounded, ArchiveOutlined, ArrowBackRounded, EditOutlined, PaymentsOutlined, UnarchiveOutlined } from '@mui/icons-material'
import { Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography } from '@mui/material'
import { savePatient, latestSeries, useSeries, usePatients, usePayments, usePracticeMutation, useSessions } from '../../lib/api'
import { cents, localToday, money, safeError } from '../../lib/format'
import { fullName, weekdayLabels } from '../../lib/types'
import { EmptyState, PageHeading, QueryState } from '../../components/common'
import { usePracticeDialogs } from '../../components/PracticeDialogs'
import { SessionTable } from '../../components/SessionTable'
import { PaymentHistory } from '../../components/PaymentHistory'

export default function PatientDetail() {
  const { id } = useParams()
  const patients = usePatients(), sessions = useSessions(), payments = usePayments()
  const series = useSeries()
  const { editPatient, editSession, pay, notify } = usePracticeDialogs()
  const [tab, setTab] = useState(0)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const patient = patients.data?.find(p => p.id === id)
  const archive = usePracticeMutation(async () => savePatient({ active: !patient!.active }, id))
  async function toggleArchive() {
    try { await archive.mutateAsync(); setArchiveOpen(false); notify(patient?.active ? 'Paciente archivado. Se conserva su historial y saldo.' : 'Paciente reactivado.') } catch { /* Displayed in dialog. */ }
  }
  if (patients.isLoading || patients.error) return <QueryState loading={patients.isLoading} error={patients.error} retry={patients.refetch} />
  if (!patient) return <EmptyState title="Paciente no disponible" description="El paciente no existe o no está disponible para esta cuenta." action={<Button component={Link} to="/pacientes">Volver a pacientes</Button>} />
  const history = (sessions.data || []).filter(s => s.patient_id === id).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  const fixed = latestSeries(series.data || [], patient.id)
  const receipts = (payments.data || []).filter(p => p.patient_id === id)
  return <><Button component={Link} to="/pacientes" startIcon={<ArrowBackRounded />} size="small" sx={{ mb: 2 }}>Pacientes</Button><PageHeading title={fullName(patient)} description={[patient.email, patient.phone].filter(Boolean).join(' · ') || 'Ficha de paciente'} action={<Stack direction="row" sx={{ gap: 1 }} ><Button variant="outlined" onClick={() => editPatient(patient)} startIcon={<EditOutlined />}>Editar</Button><Button variant="contained" onClick={() => pay(patient.id)} disabled={cents(patient.balance) === 0} startIcon={<PaymentsOutlined />}>Registrar pago</Button></Stack>} />
    {!patient.active && <Alert severity="info" sx={{ mb: 3 }}>Este paciente está archivado. Sus deudas y movimientos siguen disponibles.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' }, gap: 2, mb: 3 }}>{[{ label: 'Saldo pendiente', value: money(patient.balance) }, { label: 'Sesiones sin saldar', value: String(patient.pending_sessions) }, { label: 'Honorario habitual', value: money(patient.default_session_price) }].map(item => <Card key={item.label} sx={{ p: 2.5 }}><Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }} >{item.label}</Typography><Typography variant="h5">{item.value}</Typography></Card>)}</Box>
    <Card><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'center' }, justifyContent: "space-between", px: 2.5, pt: 1.5, gap: 1 }} ><Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="Historial del paciente"><Tab label="Sesiones" /><Tab label="Pagos y movimientos" /></Tabs>{patient.active && <Button size="small" startIcon={<AddRounded />} onClick={() => editSession(undefined, patient.id)}>Agendar turno</Button>}</Stack><Box sx={{ p: 2 }} ><QueryState loading={sessions.isLoading || payments.isLoading} error={sessions.error || payments.error} retry={() => { void sessions.refetch(); void payments.refetch() }} /></Box>{!sessions.isLoading && !payments.isLoading && !sessions.error && !payments.error && (tab === 0 ? <SessionTable sessions={history} patients={[patient]} showPatient={false} /> : <PaymentHistory payments={receipts} patients={[patient]} showPatient={false} />)}</Card>
    <Stack direction="row" sx={{ mt: 3, gap: 2, justifyContent: "space-between", alignItems: "center" }} ><Stack direction="row" spacing={1} sx={{ alignItems: "center" }} ><Chip size="small" label={patient.active ? 'Activo' : 'Archivado'} variant="outlined" /><Typography variant="caption" sx={{ color: "text.secondary" }} >Sesión habitual: {patient.default_duration_minutes} minutos{fixed && (!fixed.ends_on || fixed.ends_on >= localToday()) && ` · ${weekdayLabels[fixed.weekday]} ${fixed.local_time.slice(0, 5)}`}</Typography></Stack><Button size="small" color="inherit" startIcon={patient.active ? <ArchiveOutlined /> : <UnarchiveOutlined />} onClick={() => { archive.reset(); setArchiveOpen(true) }}>{patient.active ? 'Archivar paciente' : 'Reactivar paciente'}</Button></Stack>
    <Dialog open={archiveOpen} onClose={archive.isPending ? undefined : () => setArchiveOpen(false)}><DialogTitle>{patient.active ? 'Archivar paciente' : 'Reactivar paciente'}</DialogTitle><DialogContent><Typography variant="body2">{patient.active ? 'Se conservarán las sesiones registradas, pagos y deudas. El horario fijo dejará de repetirse. Los turnos individuales ya agendados se conservan y deben revisarse por separado.' : 'El paciente volverá a estar activo. Para retomar un horario fijo, configurá uno desde Editar paciente.'}</Typography>{archive.error && <Alert severity="error" sx={{ mt: 2 }}>{safeError(archive.error)}</Alert>}</DialogContent><DialogActions><Button disabled={archive.isPending} onClick={() => setArchiveOpen(false)}>Cancelar</Button><Button variant="contained" disabled={archive.isPending} onClick={() => void toggleArchive()}>Confirmar</Button></DialogActions></Dialog>
  </>
}
