import { Box, Button, Card, Divider, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { AccountBalanceWalletOutlined, AddRounded, ArrowForwardRounded, CalendarMonthOutlined, CheckCircleOutlineRounded, PaymentsOutlined, PeopleOutlineRounded, TrendingUpRounded } from '@mui/icons-material'
import { usePatients, useAgenda, useSummary } from '../../lib/api'
import { cents, dateLabel, localToday, money } from '../../lib/format'
import { fullName } from '../../lib/types'
import { EmptyState, PageHeading, PatientIdentity, QueryState, SectionCard, SessionChip } from '../../components/common'
import { usePracticeDialogs } from '../../components/PracticeDialogs'

export default function Dashboard() {
  const patients = usePatients(), sessions = useAgenda(localToday(), localToday()), summary = useSummary()
  const { editSession, pay } = usePracticeDialogs()
  const today = (sessions.data || []).filter(s => dateLabel(s.starts_at, 'yyyy-MM-dd') === localToday())
  const debtors = [...(patients.data || [])].filter(p => cents(p.balance) > 0).sort((a, b) => cents(b.balance) - cents(a.balance)).slice(0, 5)
  const stats = summary.data
  const error = patients.error || sessions.error || summary.error
  return <>
    <PageHeading title="Inicio" action={<Stack direction="row" sx={{ gap: 1 }} ><Button variant="outlined" startIcon={<PaymentsOutlined />} onClick={() => pay()}>Registrar pago</Button><Button variant="contained" startIcon={<AddRounded />} onClick={() => editSession()}>Agendar turno</Button></Stack>} />
    <QueryState loading={summary.isLoading || patients.isLoading || sessions.isLoading} error={error} retry={() => { void summary.refetch(); void patients.refetch(); void sessions.refetch() }} />
    {stats && !error && <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', xl: 'repeat(4,1fr)' }, gap: 2, mb: 3 }}>
        {[
          { label: 'Pendiente de cobro', value: money(stats.total_debt), detail: 'Saldo de sesiones cobrables', icon: <AccountBalanceWalletOutlined />, accent: true },
          { label: 'Pacientes con deuda', value: String(stats.debtors), detail: 'Con al menos una sesión pendiente', icon: <PeopleOutlineRounded /> },
          { label: 'Sesiones sin saldar', value: String(stats.unpaid_sessions), detail: 'Incluye pagos parciales', icon: <CalendarMonthOutlined /> },
          { label: 'Cobrado este mes', value: money(stats.collected_month), detail: 'Según la fecha de cada pago', icon: <TrendingUpRounded /> },
        ].map(stat => <Card key={stat.label} sx={{ p: 2.5, ...(stat.accent ? { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' } : {}) }}><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }} ><Typography variant="body2" sx={[{ opacity: stat.accent ? .85 : 1 }, { color: stat.accent ? 'inherit' : 'text.secondary' }]} >{stat.label}</Typography><Box sx={{ bgcolor: stat.accent ? '#ffffff20' : 'action.hover', borderRadius: 2, p: .8, display: 'flex', color: stat.accent ? 'inherit' : 'primary.main', '& svg': { fontSize: 20 } }}>{stat.icon}</Box></Stack><Typography sx={{ fontSize: '1.9rem', letterSpacing: '-.05em', fontWeight: 750, mb: .75 }}>{stat.value}</Typography><Typography variant="caption" sx={[{ opacity: stat.accent ? .8 : 1 }, { color: stat.accent ? 'inherit' : 'text.secondary' }]} >{stat.detail}</Typography></Card>)}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.35fr) minmax(0,1fr)' }, gap: 3 }}>
        <SectionCard title="Agenda de hoy" subtitle={dateLabel(new Date().toISOString(), "EEEE d 'de' MMMM")} to="/calendario">
          <Divider />{!today.length ? <EmptyState title="Sin turnos hoy" description="No tenés turnos agendados para hoy. Podés agregar uno o mirar el resto de la semana." action={<Button onClick={() => editSession()} startIcon={<AddRounded />}>Agendar turno</Button>} /> : <Stack divider={<Divider />}>
            {today.map(s => <Stack key={s.id} direction="row" sx={{ gap: 2, alignItems: "center", p: 2.5 }} ><Box sx={{ minWidth: 54, borderRight: 2, borderColor: s.status === 'realizada' ? 'success.main' : 'primary.main', pr: 2 }}><Typography variant="body2" sx={{ fontWeight: 700 }} >{dateLabel(s.starts_at, 'HH:mm')}</Typography><Typography variant="caption" sx={{ color: "text.secondary" }} >{dateLabel(s.ends_at, 'HH:mm')}</Typography></Box><Box sx={{ flex: 1 }} ><Typography variant="body2" sx={{ fontWeight: 650 }} >{fullName(patients.data?.find(p => p.id === s.patient_id))}</Typography><Typography variant="caption" sx={{ color: "text.secondary" }} >{money(s.price)} · {Math.round((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000)} minutos</Typography></Box><Box sx={{ display: { xs: 'none', sm: 'block' } }}><SessionChip session={s} /></Box><Button size="small" aria-label="Abrir sesión" onClick={() => editSession(s)} sx={{ minWidth: 30 }}><ArrowForwardRounded fontSize="small" /></Button></Stack>)}
          </Stack>}
        </SectionCard>
        <SectionCard title="Mayores saldos pendientes" to="/cuentas"><Divider />{!debtors.length ? <EmptyState title="Sin saldos pendientes" description="Los pacientes con sesiones pendientes de pago van a aparecer acá." /> : <Stack divider={<Divider />}>{debtors.map(p => <Stack key={p.id} direction="row" sx={{ alignItems: "center", justifyContent: "space-between", p: 2.5, gap: 1 }} ><PatientIdentity patient={p} /><Box sx={{ textAlign: "right" }} ><Typography variant="body2" sx={{ fontWeight: 700 }} >{money(p.balance)}</Typography><Typography variant="caption" sx={{ color: "text.secondary" }} >{p.pending_sessions} {p.pending_sessions === 1 ? 'sesión pendiente' : 'sesiones pendientes'}</Typography></Box></Stack>)}</Stack>}</SectionCard>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)' }, gap: 2, mt: 3 }}>{[{ label: 'Pacientes activos', value: stats.active_patients, icon: <PeopleOutlineRounded color="primary" /> }, { label: 'Sesiones realizadas este mes', value: stats.completed_month, icon: <CheckCircleOutlineRounded color="success" /> }].map(stat => <Card key={stat.label} sx={{ p: 2.5 }}><Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }} >{stat.icon}<Typography variant="body2" sx={{ color: "text.secondary", flex: 1 }} >{stat.label}</Typography><Typography variant="h5">{stat.value}</Typography></Stack></Card>)}</Box>
      {!!debtors.length && <Box sx={{ mt: 3 }} ><SectionCard title="Cuentas por cobrar" to="/cuentas"><TableContainer><Table><TableHead><TableRow><TableCell>Paciente</TableCell><TableCell align="center">Sesiones pendientes</TableCell><TableCell align="right">Saldo</TableCell><TableCell /></TableRow></TableHead><TableBody>{debtors.map(p => <TableRow key={p.id}><TableCell><PatientIdentity patient={p} /></TableCell><TableCell align="center">{p.pending_sessions}</TableCell><TableCell align="right" sx={{ fontWeight: 650, whiteSpace: 'nowrap' }}>{money(p.balance)}</TableCell><TableCell align="right"><Button size="small" onClick={() => pay(p.id)}>Registrar pago</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer></SectionCard></Box>}
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 2 }} >Los turnos futuros y las cancelaciones sin cargo no generan deuda.</Typography>
    </>}
  </>
}
