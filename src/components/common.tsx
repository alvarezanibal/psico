import { Alert, Avatar, Box, Button, Card, Chip, Skeleton, Stack, Typography } from '@mui/material'
import { ArrowForwardRounded, CalendarMonthRounded, RefreshRounded } from '@mui/icons-material'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { initials, safeError } from '../lib/format'
import { fullName, paymentLabels, sessionLabels, type Patient, type PracticeSession } from '../lib/types'

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1.5, alignItems: { sm: 'center' }, mb: 2 }}>
    <Box><Typography variant="h5" component="h1">{title}</Typography>{description && <Typography variant="body2" sx={{ color: 'text.secondary', mt: .5 }}>{description}</Typography>}</Box>{action}
  </Stack>
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Stack spacing={1.5} sx={{ alignItems: "center", textAlign: "center", py: 7, px: 3 }} >
    <Avatar sx={{ width: 52, height: 52, bgcolor: 'action.hover', color: 'text.secondary', mb: .5 }}><CalendarMonthRounded /></Avatar>
    <Typography sx={{ fontWeight: 650 }} >{title}</Typography><Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 380 }} >{description}</Typography>{action}
  </Stack>
}
export function QueryState({ loading, error, retry }: { loading: boolean; error: unknown; retry?: () => unknown }) {
  if (error) return <Alert severity="error" action={retry ? <Button color="inherit" onClick={retry} startIcon={<RefreshRounded />}>Reintentar</Button> : undefined}>{safeError(error)}</Alert>
  if (loading) return <Stack spacing={2}>{[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={90} />)}</Stack>
  return null
}
export function PatientIdentity({ patient, link = true }: { patient?: Patient; link?: boolean }) {
  const content = <Stack direction="row" spacing={1.4} sx={{ alignItems: "center" }} ><Avatar sx={{ width: 36, height: 36, fontSize: '.75rem', fontWeight: 700, bgcolor: 'action.selected', color: 'primary.main' }}>{initials(patient?.first_name || 'P', patient?.last_name || '')}</Avatar><Box><Typography variant="body2" sx={{ fontWeight: 650 }} >{fullName(patient)}</Typography>{patient && !patient.active && <Typography variant="caption" sx={{ color: "text.secondary" }} >Archivado</Typography>}</Box></Stack>
  return patient && link ? <Box component={Link} to={`/pacientes/${patient.id}`} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>{content}</Box> : content
}
export function SessionChip({ session }: { session: PracticeSession }) {
  return <Chip size="small" label={sessionLabels[session.status]} color={session.status === 'realizada' ? 'success' : session.status === 'programada' ? 'primary' : 'default'} variant="outlined" />
}
export function PaymentChip({ session }: { session: PracticeSession }) {
  return <Chip size="small" label={paymentLabels[session.payment_status]} color={session.payment_status === 'pagada' ? 'success' : session.payment_status === 'parcial' ? 'warning' : 'default'} variant="outlined" />
}
export function SectionCard({ title, subtitle, to, children }: { title: string; subtitle?: string; to?: string; children: ReactNode }) {
  return <Card><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", p: 2.5, gap: 1 }} ><Box><Typography variant="h6">{title}</Typography>{subtitle && <Typography variant="caption" sx={{ color: "text.secondary" }} >{subtitle}</Typography>}</Box>{to && <Button component={Link} to={to} size="small" endIcon={<ArrowForwardRounded />} sx={{ whiteSpace: 'nowrap' }}>Ver todo</Button>}</Stack>{children}</Card>
}
