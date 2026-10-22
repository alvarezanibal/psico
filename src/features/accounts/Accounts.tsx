import { useDeferredValue, useState } from 'react'
import { PaymentsOutlined, SearchRounded } from '@mui/icons-material'
import { Box, Button, Card, InputAdornment, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material'
import { usePatients, usePayments, useSummary } from '../../lib/api'
import { cents, dateLabel, money } from '../../lib/format'
import { fullName } from '../../lib/types'
import { EmptyState, PageHeading, PatientIdentity, QueryState } from '../../components/common'
import { usePracticeDialogs } from '../../components/PracticeDialogs'
import { PaymentHistory } from '../../components/PaymentHistory'

export default function Accounts() {
  const patients = usePatients(), payments = usePayments(), summary = useSummary()
  const { pay } = usePracticeDialogs()
  const [tab, setTab] = useState(0)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('balance')
  const [age, setAge] = useState('0')
  const term = useDeferredValue(search.toLocaleLowerCase('es-AR').trim())
  const rows = (patients.data || []).filter(p => cents(p.balance) > 0 && fullName(p).toLocaleLowerCase('es-AR').includes(term) && (!Number(age) || p.oldest_debt_at && Date.parse(p.oldest_debt_at) <= Date.now() - Number(age) * 86400000)).sort((a, b) => sort === 'balance' ? cents(b.balance) - cents(a.balance) : sort === 'sessions' ? b.pending_sessions - a.pending_sessions : (a.oldest_debt_at || '').localeCompare(b.oldest_debt_at || ''))
  const filteredPayments = (payments.data || []).filter(p => fullName(patients.data?.find(patient => patient.id === p.patient_id)).toLocaleLowerCase('es-AR').includes(term))
  const error = patients.error || payments.error || summary.error
  return <><PageHeading title="Cuentas corrientes" description="Sabé qué queda por cobrar y mantené cada pago en orden." action={<Button variant="contained" startIcon={<PaymentsOutlined />} onClick={() => pay()}>Registrar pago</Button>} />
    <QueryState loading={summary.isLoading} error={error} retry={() => { void patients.refetch(); void payments.refetch(); void summary.refetch() }} />
    {summary.data && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, gap: 2, mb: 3 }}>{[{ label: 'Deuda total', value: money(summary.data.total_debt) }, { label: 'Pacientes con deuda', value: String(summary.data.debtors) }, { label: 'Sesiones pendientes', value: String(summary.data.unpaid_sessions) }, { label: 'Cobrado este mes', value: money(summary.data.collected_month) }].map(item => <Card key={item.label} sx={{ p: 2.5 }}><Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }} >{item.label}</Typography><Typography variant="h5">{item.value}</Typography></Card>)}</Box>}
    <Card><Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2.5, pt: 1 }} aria-label="Cuentas corrientes"><Tab label="Saldos pendientes" /><Tab label="Historial de pagos" /></Tabs><Stack direction={{ xs: 'column', md: 'row' }} sx={{ p: 2.5, gap: 2 }} ><TextField placeholder="Buscar paciente" value={search} onChange={e => setSearch(e.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Buscar paciente en cuentas' }, input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />{tab === 0 && <><TextField label="Ordenar por" select value={sort} onChange={e => setSort(e.target.value)} sx={{ minWidth: 190 }}><MenuItem value="balance">Mayor deuda</MenuItem><MenuItem value="sessions">Más sesiones</MenuItem><MenuItem value="age">Más antigüedad</MenuItem></TextField><TextField label="Antigüedad" select value={age} onChange={e => setAge(e.target.value)} sx={{ minWidth: 160 }}><MenuItem value="0">Todas</MenuItem><MenuItem value="30">30 días o más</MenuItem><MenuItem value="60">60 días o más</MenuItem><MenuItem value="90">90 días o más</MenuItem></TextField></>}</Stack>
      <Box sx={{ px: 2.5 }} ><QueryState loading={patients.isLoading || payments.isLoading} error={null} /></Box>
      {!error && patients.data && payments.data && (tab === 0 ? rows.length ? <TableContainer><Table><TableHead><TableRow><TableCell>Paciente</TableCell><TableCell align="center">Sesiones pendientes</TableCell><TableCell align="right">Saldo adeudado</TableCell><TableCell>Última sesión</TableCell><TableCell>Deuda más antigua</TableCell><TableCell /></TableRow></TableHead><TableBody>{rows.map(p => <TableRow key={p.id} hover><TableCell><PatientIdentity patient={p} /></TableCell><TableCell align="center">{p.pending_sessions}</TableCell><TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(p.balance)}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{p.last_session_at ? dateLabel(p.last_session_at) : '—'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{p.oldest_debt_at ? dateLabel(p.oldest_debt_at) : '—'}</TableCell><TableCell align="right"><Button size="small" sx={{ whiteSpace: 'nowrap' }} onClick={() => pay(p.id)}>Registrar pago</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer> : <EmptyState title={search || age !== '0' ? 'Sin coincidencias' : 'Tus cuentas están al día'} description={search || age !== '0' ? 'Cambiá los filtros para encontrar otros saldos.' : 'Las sesiones cobrables con saldo pendiente aparecerán en esta lista, incluso si el paciente está archivado.'} /> : <PaymentHistory payments={filteredPayments} patients={patients.data} />)}
    </Card><Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 2 }} >Las sesiones parcialmente pagadas se cuentan una sola vez. Facturar no reduce la deuda.</Typography>
  </>
}
