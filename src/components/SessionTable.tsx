import { Button, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { CheckCircleOutlineRounded, EditOutlined } from '@mui/icons-material'
import { useState } from 'react'
import { usePracticeMutation, saveSession } from '../lib/api'
import { dateLabel, money, safeError } from '../lib/format'
import type { Patient, PracticeSession } from '../lib/types'
import { EmptyState, PatientIdentity, PaymentChip, SessionChip } from './common'
import { usePracticeDialogs } from './PracticeDialogs'
import { Alert } from '@mui/material'

export function SessionTable({ sessions, patients, showPatient = true }: { sessions: PracticeSession[]; patients: Patient[]; showPatient?: boolean }) {
  const { editSession, notify } = usePracticeDialogs()
  const [busyId, setBusyId] = useState('')
  const complete = usePracticeMutation(async (session: PracticeSession) => saveSession({ ...session, status: 'realizada', cancellation_fee: '0.00', cancellation_reason: '', expected_updated_at: session.updated_at }, session.id))
  async function markDone(session: PracticeSession) {
    setBusyId(session.id)
    try { await complete.mutateAsync(session); notify('Sesión marcada como realizada.') } catch { /* Displayed below. */ } finally { setBusyId('') }
  }
  if (!sessions.length) return <EmptyState title="No hay sesiones para mostrar" description="Agendá un turno o ajustá los filtros para ver tus sesiones." />
  return <>{complete.error && <Alert severity="error" sx={{ m: 2 }}>{safeError(complete.error)}</Alert>}<TableContainer><Table><TableHead><TableRow><TableCell>Fecha y hora</TableCell>{showPatient && <TableCell>Paciente</TableCell>}<TableCell>Sesión</TableCell><TableCell>Cobro</TableCell><TableCell align="right">Honorario</TableCell><TableCell align="right">Saldo</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead><TableBody>
    {sessions.map(session => <TableRow key={session.id} hover><TableCell sx={{ whiteSpace: 'nowrap' }}><Typography variant="body2" sx={{ fontWeight: 600 }} >{dateLabel(session.starts_at)}</Typography><Typography variant="caption" sx={{ color: "text.secondary" }} >{dateLabel(session.starts_at, 'HH:mm')} — {dateLabel(session.ends_at, 'HH:mm')}</Typography></TableCell>{showPatient && <TableCell><PatientIdentity patient={patients.find(p => p.id === session.patient_id)} /></TableCell>}<TableCell><SessionChip session={session} /></TableCell><TableCell><PaymentChip session={session} /></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(session.status === 'cancelada' || session.status === 'ausente' ? session.cancellation_fee : session.price)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 650 }}>{money(session.balance)}</TableCell><TableCell align="right"><Stack direction="row" spacing={.5} sx={{ justifyContent: "flex-end", alignItems: "center" }} >
      {session.status === 'programada' && Date.parse(session.ends_at) <= Date.now() && <Tooltip title="Marcar realizada"><span><Button size="small" onClick={() => void markDone(session)} disabled={complete.isPending} sx={{ minWidth: 32, p: .75 }} aria-label="Marcar sesión realizada">{busyId === session.id ? '…' : <CheckCircleOutlineRounded fontSize="small" />}</Button></span></Tooltip>}
      <Tooltip title="Editar o reprogramar"><IconButton size="small" onClick={() => editSession(session)} aria-label={`Editar sesión del ${dateLabel(session.starts_at)}`}><EditOutlined sx={{ fontSize: 19 }} /></IconButton></Tooltip>
    </Stack></TableCell></TableRow>)}
  </TableBody></Table></TableContainer></>
}
