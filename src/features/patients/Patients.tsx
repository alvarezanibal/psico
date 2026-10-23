import { useDeferredValue, useState } from 'react'
import { AddRounded, ArrowForwardRounded, EditOutlined, SearchRounded } from '@mui/icons-material'
import { Box, Button, Card, Chip, IconButton, InputAdornment, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { usePatients } from '../../lib/api'
import { money } from '../../lib/format'
import { fullName } from '../../lib/types'
import { EmptyState, PageHeading, PatientIdentity, QueryState } from '../../components/common'
import { usePracticeDialogs } from '../../components/PracticeDialogs'

export default function Patients() {
  const patients = usePatients()
  const { editPatient } = usePracticeDialogs()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const term = useDeferredValue(search.trim().toLocaleLowerCase('es-AR'))
  const rows = (patients.data || []).filter(p => (status === 'all' || p.active === (status === 'active')) && `${fullName(p)} ${p.email} ${p.phone}`.toLocaleLowerCase('es-AR').includes(term))
  return <><PageHeading title="Pacientes" action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => editPatient()}>Nuevo paciente</Button>} />
    <Card><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ p: 2.5, gap: 2 }} ><TextField placeholder="Buscar por nombre, email o teléfono" value={search} onChange={e => setSearch(e.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Buscar pacientes' }, input: { startAdornment: <InputAdornment position="start"><SearchRounded color="action" fontSize="small" /></InputAdornment> } }} /><TextField select label="Estado" value={status} onChange={e => setStatus(e.target.value)} sx={{ minWidth: 160, maxWidth: { sm: 180 } }}><MenuItem value="active">Activos</MenuItem><MenuItem value="inactive">Archivados</MenuItem><MenuItem value="all">Todos</MenuItem></TextField></Stack>
      <Box sx={{ px: 2.5 }} ><QueryState loading={patients.isLoading} error={patients.error} retry={patients.refetch} /></Box>
      {patients.data && !patients.error && (rows.length ? <TableContainer><Table><TableHead><TableRow><TableCell>Paciente</TableCell><TableCell>Contacto</TableCell><TableCell align="right">Honorario habitual</TableCell><TableCell align="right">Saldo pendiente</TableCell><TableCell>Estado</TableCell><TableCell /></TableRow></TableHead><TableBody>{rows.map(patient => <TableRow hover key={patient.id}><TableCell><PatientIdentity patient={patient} /></TableCell><TableCell><Typography variant="body2">{patient.email || 'Sin email'}</Typography><Typography variant="caption" sx={{ color: "text.secondary" }} >{patient.phone || 'Sin teléfono'}</Typography></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(patient.default_session_price)}<Typography variant="caption" sx={{ display: "block", color: "text.secondary" }} >{patient.default_duration_minutes} min</Typography></TableCell><TableCell align="right" sx={{ fontWeight: 650, whiteSpace: 'nowrap' }}>{money(patient.balance)}</TableCell><TableCell><Chip label={patient.active ? 'Activo' : 'Archivado'} size="small" variant="outlined" color={patient.active ? 'success' : 'default'} /></TableCell><TableCell><Stack direction="row"><Tooltip title="Editar paciente"><IconButton size="small" onClick={() => editPatient(patient)} aria-label={`Editar ${fullName(patient)}`}><EditOutlined fontSize="small" /></IconButton></Tooltip><Tooltip title="Ver ficha"><IconButton component={Link} to={`/pacientes/${patient.id}`} size="small" aria-label={`Ver ficha de ${fullName(patient)}`}><ArrowForwardRounded fontSize="small" /></IconButton></Tooltip></Stack></TableCell></TableRow>)}</TableBody></Table></TableContainer> : <EmptyState title={search ? 'No encontramos coincidencias' : 'Sin pacientes'} description={search ? 'Probá con otro nombre o cambiá el filtro de estado.' : 'Agregá tu primer paciente para empezar a organizar sus turnos y sus pagos.'} action={<Button onClick={() => editPatient()} startIcon={<AddRounded />}>Nuevo paciente</Button>} />)}
      <Box sx={{ px: 2.5, py: 1.5 }} ><Typography variant="caption" sx={{ color: "text.secondary" }} >{rows.length} {rows.length === 1 ? 'paciente' : 'pacientes'}</Typography></Box>
    </Card></>
}
