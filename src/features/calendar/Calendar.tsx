import { useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { AddRounded, ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material'
import { Alert, Box, Button, Card, Chip, Divider, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { usePatients, useSessions } from '../../lib/api'
import { dateLabel, localToday, money, shiftDay } from '../../lib/format'
import { fullName, sessionLabels, type PracticeSession } from '../../lib/types'
import { PageHeading, QueryState } from '../../components/common'
import { SessionTable } from '../../components/SessionTable'
import { usePracticeDialogs } from '../../components/PracticeDialogs'

type View = 'day' | 'week' | 'month'
export default function Calendar() {
  const sessions = useSessions(), patients = usePatients()
  const { editSession } = usePracticeDialogs()
  const [day, setDay] = useState(localToday)
  const [view, setView] = useState<View>(() => window.matchMedia('(max-width: 600px)').matches ? 'day' : 'week')
  const anchor = new Date(`${day}T12:00:00`)
  const days = view === 'day' ? [anchor] : eachDayOfInterval({ start: startOfWeek(view === 'month' ? startOfMonth(anchor) : anchor, { weekStartsOn: 1 }), end: endOfWeek(view === 'month' ? endOfMonth(anchor) : anchor, { weekStartsOn: 1 }) })
  const dayStrings = days.map(d => format(d, 'yyyy-MM-dd'))
  const rows = sessions.data || []
  function onDay(session: PracticeSession, date: string) { return dateLabel(session.starts_at, 'yyyy-MM-dd') <= date && dateLabel(new Date(Date.parse(session.ends_at) - 1).toISOString(), 'yyyy-MM-dd') >= date }
  const overlapping = useMemo(() => {
    const ids = new Set<string>()
    const sorted = (sessions.data || []).filter(s => s.status === 'programada' || s.status === 'realizada').sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length && sorted[j].starts_at < sorted[i].ends_at; j++) { ids.add(sorted[i].id); ids.add(sorted[j].id) }
    return ids
  }, [sessions.data])
  const visibleOverlap = rows.some(s => overlapping.has(s.id) && dayStrings.some(d => onDay(s, d)))
  function move(direction: number) { setDay(view === 'month' ? format(addMonths(anchor, direction), 'yyyy-MM-dd') : shiftDay(day, direction * (view === 'week' ? 7 : 1))) }
  return <><PageHeading title="Calendario" description="Un lugar para organizar tus encuentros y planificar la semana." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => editSession(undefined, undefined, day)}>Agendar turno</Button>} />
    <QueryState loading={sessions.isLoading || patients.isLoading} error={sessions.error || patients.error} retry={() => { void sessions.refetch(); void patients.refetch() }} />
    {visibleOverlap && <Alert severity="warning" sx={{ mb: 2 }}>Hay turnos que se superponen en este período. Revisá sus horarios.</Alert>}
    <Card><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: "space-between", alignItems: { sm: 'center' }, gap: 2, p: 2.5 }} ><Stack direction="row" sx={{ alignItems: "center", gap: 1 }} ><Button size="small" variant="outlined" onClick={() => setDay(localToday())}>Hoy</Button><IconButton size="small" onClick={() => move(-1)} aria-label="Período anterior"><ChevronLeftRounded /></IconButton><IconButton size="small" onClick={() => move(1)} aria-label="Período siguiente"><ChevronRightRounded /></IconButton><Typography sx={[{ textTransform: 'capitalize', fontSize: '.95rem' }, { fontWeight: 650 }]} >{format(anchor, view === 'day' ? "d 'de' MMMM yyyy" : 'MMMM yyyy', { locale: es })}</Typography></Stack><ToggleButtonGroup exclusive value={view} size="small" onChange={(_, value: View | null) => value && setView(value)} aria-label="Vista de calendario"><ToggleButton value="day">Día</ToggleButton><ToggleButton value="week">Semana</ToggleButton><ToggleButton value="month">Mes</ToggleButton></ToggleButtonGroup></Stack><Divider />
      {view === 'day' ? <SessionTable sessions={rows.filter(s => onDay(s, day))} patients={patients.data || []} /> : <Box sx={{ overflowX: 'auto' }}><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', minWidth: view === 'month' ? 760 : 1000 }}>
        {days.map((date, index) => {
          const key = dayStrings[index]
          const events = rows.filter(s => onDay(s, key))
          const today = key === localToday()
          const inMonth = date.getMonth() === anchor.getMonth()
          return <Box key={key} sx={{ borderRight: index % 7 !== 6 ? 1 : 0, borderBottom: 1, borderColor: 'divider', minHeight: view === 'month' ? 155 : 470, bgcolor: today ? 'action.hover' : 'transparent', opacity: view === 'month' && !inMonth ? .55 : 1 }}>
            <Stack direction="row" sx={[{ borderBottom: view === 'week' ? 1 : 0, borderColor: 'divider' }, { justifyContent: "space-between", alignItems: "center", px: 1.5, py: 1.3 }]} ><Box><Typography variant="caption" sx={[{ textTransform: 'capitalize' }, { color: "text.secondary" }]} >{format(date, 'EEE', { locale: es })}</Typography><Typography sx={{ fontWeight: today ? 750 : 500, color: today ? 'primary.main' : 'text.primary', fontSize: view === 'week' ? '1.3rem' : '.9rem' }}>{date.getDate()}</Typography></Box><Tooltip title={`Agendar el ${format(date, 'dd/MM')}`}><IconButton size="small" aria-label={`Agendar el ${format(date, 'dd/MM')}`} onClick={() => editSession(undefined, undefined, key)}><AddRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip></Stack>
            <Stack spacing={1} sx={{ p: 1 }} >{events.map(session => <Tooltip key={session.id} title={`${fullName(patients.data?.find(p => p.id === session.patient_id))} · ${dateLabel(session.starts_at, 'HH:mm')}–${dateLabel(session.ends_at, 'HH:mm')} · ${sessionLabels[session.status]}`}><Box component="button" onClick={() => editSession(session)} sx={{ textAlign: 'left', width: '100%', cursor: 'pointer', border: 0, borderLeft: 3, borderColor: overlapping.has(session.id) ? 'warning.main' : session.status === 'realizada' ? 'success.main' : 'primary.main', bgcolor: 'action.selected', color: 'text.primary', p: 1.1, borderRadius: '3px 7px 7px 3px', fontFamily: 'inherit', opacity: session.status === 'cancelada' ? .6 : 1, '&:hover': { bgcolor: 'action.focus' } }}>
              <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }} >{dateLabel(session.starts_at, 'HH:mm')}{view === 'week' && ` — ${dateLabel(session.ends_at, 'HH:mm')}`}</Typography><Typography variant="body2" noWrap sx={{ fontSize: view === 'month' ? '.73rem' : '.79rem', fontWeight: 600 }} >{fullName(patients.data?.find(p => p.id === session.patient_id))}</Typography>{view === 'week' && <><Typography variant="caption" sx={{ color: "text.secondary", display: "block", my: .5 }} >{money(session.price)}</Typography><Typography variant="caption" sx={{ color: "text.secondary" }} >{overlapping.has(session.id) ? 'Revisar superposición' : sessionLabels[session.status]}</Typography>{session.payment_status === 'parcial' && <Chip label="Pago parcial" size="small" variant="outlined" sx={{ mt: .75, fontSize: '.6rem', height: 19 }} />}</>}
            </Box></Tooltip>)}{view === 'week' && !events.length && <Typography variant="caption" sx={{ color: "text.disabled", textAlign: "center", pt: 3 }} >Sin turnos</Typography>}</Stack>
          </Box>
        })}
      </Box></Box>}
    </Card><Stack direction="row" sx={{ gap: 2.5, mt: 2, flexWrap: "wrap" }} ><Typography variant="caption" sx={{ color: "text.secondary" }} >Horarios de Argentina · Agenda local</Typography><Typography variant="caption" sx={{ color: "text.secondary" }} >Seleccioná un turno para editarlo o actualizar su estado.</Typography></Stack>
  </>
}
