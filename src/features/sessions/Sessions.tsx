import { useDeferredValue, useState } from 'react'
import { AddRounded } from '@mui/icons-material'
import { Box, Button, Card, MenuItem, Stack, TextField } from '@mui/material'
import { usePatients, useSessions } from '../../lib/api'
import { dateLabel } from '../../lib/format'
import { fullName, sessionLabels } from '../../lib/types'
import { PageHeading, QueryState } from '../../components/common'
import { usePracticeDialogs } from '../../components/PracticeDialogs'
import { SessionTable } from '../../components/SessionTable'

export default function Sessions() {
  const sessions = useSessions(), patients = usePatients()
  const { editSession } = usePracticeDialogs()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const term = useDeferredValue(search.trim().toLocaleLowerCase('es-AR'))
  const rows = (sessions.data || []).filter(s => {
    const day = dateLabel(s.starts_at, 'yyyy-MM-dd')
    return (status === 'all' || s.status === status) && (!from || day >= from) && (!to || day <= to) && fullName(patients.data?.find(p => p.id === s.patient_id)).toLocaleLowerCase('es-AR').includes(term)
  }).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  return <><PageHeading title="Sesiones" description="El historial de tus encuentros, con su estado y saldo." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => editSession()}>Agendar turno</Button>} /><Card><Stack direction={{ xs: 'column', lg: 'row' }} sx={{ p: 2.5, gap: 2 }} ><TextField placeholder="Buscar paciente" value={search} onChange={e => setSearch(e.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Buscar paciente en sesiones' } }} /><TextField select label="Estado" value={status} onChange={e => setStatus(e.target.value)}><MenuItem value="all">Todos</MenuItem>{Object.entries(sessionLabels).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField><TextField label="Desde" type="date" value={from} onChange={e => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="Hasta" type="date" value={to} onChange={e => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><Button onClick={() => { setSearch(''); setStatus('all'); setFrom(''); setTo('') }} sx={{ whiteSpace: 'nowrap' }}>Limpiar</Button></Stack><Box sx={{ px: 2.5 }} ><QueryState loading={sessions.isLoading || patients.isLoading} error={sessions.error || patients.error} retry={() => { void sessions.refetch(); void patients.refetch() }} /></Box>{sessions.data && patients.data && !sessions.error && !patients.error && <SessionTable sessions={rows} patients={patients.data} />}</Card></>
}
