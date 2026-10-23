import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { z } from 'npm:zod@4.6.7'

// Self-contained so deployment from the Supabase Dashboard needs only this file.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const snapshotSchema = z.object({
  revision: z.number().int().positive().max(2147483647), changed_at: z.string(),
  series: z.array(z.object({
    id: z.uuid(), weekday: z.number().int().min(0).max(6), local_time: z.string().regex(/^\d{2}:\d{2}:00$/),
    starts_on: day, ends_on: day.nullable(), first_on: day, until_at: z.string().nullable(),
    duration_minutes: z.number().int().min(5).max(240), label: z.string().max(400),
  })),
  sessions: z.array(z.object({
    id: z.uuid(), series_id: z.uuid().nullable(), original_date: day.nullable(),
    starts_at: z.string(), ends_at: z.string(), label: z.string().max(400),
    status: z.enum(['programada', 'realizada', 'cancelada', 'ausente']),
  })),
})
type Snapshot = z.infer<typeof snapshotSchema>
type Session = Snapshot['sessions'][number]
const zone = 'America/Argentina/Buenos_Aires'
const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const statusLabels = { programada: 'Programada', realizada: 'Realizada', cancelada: 'Cancelada', ausente: 'Ausente' }
const encoder = new TextEncoder()
function text(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}
function utc(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid calendar timestamp')
  const result = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  if (!/^\d{8}T\d{6}Z$/.test(result)) throw new Error('Unsupported calendar timestamp')
  return result
}
const local = (date: string, time: string) => date.replace(/-/g, '') + 'T' + time.replace(/:/g, '')
// RFC 5545: physical lines <=75 OCTETS, preserving Unicode code points.
function fold(line: string) {
  const parts: string[] = []
  let part = '', octets = 0
  for (const character of line) {
    const size = encoder.encode(character).length
    if (octets + size > 75) { parts.push(part); part = ' '; octets = 1 }
    part += character; octets += size
  }
  parts.push(part)
  return parts.join('\r\n')
}
function calendar(snapshot: Snapshot) {
  const stamp = utc(snapshot.changed_at)
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Consultorio//Agenda//ES', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Consultorio', 'X-WR-TIMEZONE:' + zone, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    // Current IANA Buenos Aires rules: UTC-03 without seasonal transitions.
    'BEGIN:VTIMEZONE', 'TZID:' + zone, 'X-LIC-LOCATION:' + zone, 'BEGIN:STANDARD',
    'DTSTART:20200101T000000', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03',
    'END:STANDARD', 'END:VTIMEZONE',
  ]
  const startEvent = (uid: string, label: string) => lines.push(
    'BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp, 'LAST-MODIFIED:' + stamp,
    'SEQUENCE:' + snapshot.revision, 'CLASS:PRIVATE', 'SUMMARY:' + text('Turno · ' + label),
  )
  const finishEvent = (cancelled = false) => lines.push(
    'STATUS:' + (cancelled ? 'CANCELLED' : 'CONFIRMED'), 'TRANSP:' + (cancelled ? 'TRANSPARENT' : 'OPAQUE'), 'END:VEVENT',
  )
  const children = new Map<string, Session[]>()
  for (const session of snapshot.sessions) {
    if ((session.series_id === null) !== (session.original_date === null)) throw new Error('Invalid recurrence identity')
    if (session.series_id) {
      const entries = children.get(session.series_id) || []
      entries.push(session); children.set(session.series_id, entries)
    }
  }
  const seenSeries = new Set<string>()
  for (const series of snapshot.series) {
    seenSeries.add(series.id)
    const instances = children.get(series.id) || []
    const dates = [...new Set(instances.map(s => s.original_date!))].sort()
    const hasRule = series.ends_on === null || series.first_on <= series.ends_on
    // An archived series can be empty but still have explicitly kept bookings.
    // Represent those with RDATE + overrides instead of reviving the weekly rule.
    if (!hasRule && !dates.length) continue
    const first = hasRule ? series.first_on : dates[0]
    const uid = series.id + '@consultorio-series'
    startEvent(uid, series.label)
    lines.push('DTSTART;TZID=' + zone + ':' + local(first, series.local_time), 'DURATION:PT' + series.duration_minutes + 'M')
    if (hasRule) {
      let rule = 'RRULE:FREQ=WEEKLY;BYDAY=' + weekdays[series.weekday]
      if (series.until_at) rule += ';UNTIL=' + utc(series.until_at)
      lines.push(rule)
    }
    const extraDates = dates.filter(d => d !== first && (!hasRule || d < series.first_on || series.ends_on !== null && d > series.ends_on))
    if (extraDates.length) lines.push('RDATE;TZID=' + zone + ':' + extraDates.map(d => local(d, series.local_time)).join(','))
    finishEvent()
    for (const session of instances) {
      startEvent(uid, session.label)
      lines.push('RECURRENCE-ID;TZID=' + zone + ':' + local(session.original_date!, series.local_time),
        'DTSTART:' + utc(session.starts_at), 'DTEND:' + utc(session.ends_at), 'DESCRIPTION:' + statusLabels[session.status])
      finishEvent(session.status === 'cancelada')
    }
  }
  for (const session of snapshot.sessions) {
    if (session.series_id) {
      if (!seenSeries.has(session.series_id)) throw new Error('Missing recurring series')
      continue // Already emitted as an override; never export it twice.
    }
    startEvent(session.id + '@consultorio-session', session.label)
    lines.push('DTSTART:' + utc(session.starts_at), 'DTEND:' + utc(session.ends_at), 'DESCRIPTION:' + statusLabels[session.status])
    finishEvent(session.status === 'cancelada')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
function defaultKey(name: string) {
  try {
    const keys = JSON.parse(Deno.env.get(name) || '{}') as Record<string, unknown>
    return typeof keys.default === 'string' ? keys.default : undefined
  } catch { return undefined }
}
const headers = {
  'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer',
}
Deno.serve(async (request: Request) => {
  const reply = (message: string, status: number) => new Response(request.method === 'HEAD' ? null : message, {
    status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  })
  if (!['GET', 'HEAD'].includes(request.method)) return reply('Método no permitido.', 405)
  const token = new URL(request.url).searchParams.get('token')
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return reply('Calendario no disponible.', 404)
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const secret = defaultKey('SUPABASE_SECRET_KEYS') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !secret) return reply('Servicio de calendario no configurado.', 503)
    const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await service.rpc('calendar_feed_snapshot', { p_token: token })
    if (error) return reply('No pudimos actualizar el calendario. Reintentá más tarde.', 503)
    if (data === null) return reply('Calendario no disponible.', 404)
    const snapshot = snapshotSchema.parse(data)
    const body = request.method === 'HEAD' ? null : calendar(snapshot)
    return new Response(body, { status: 200, headers: {
      ...headers, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="consultorio.ics"',
    } })
  } catch {
    // Never log request URLs/tokens, patient labels, snapshot data or raw errors.
    return reply('No pudimos actualizar el calendario. Reintentá más tarde.', 503)
  }
})