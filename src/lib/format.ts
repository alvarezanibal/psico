import { addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const TIMEZONE = 'America/Argentina/Buenos_Aires'
const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function cents(value: string): number {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(normalized)) throw new Error('Ingresá un importe válido con hasta dos decimales.')
  const [whole, decimal = ''] = normalized.split('.')
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
  if (!Number.isSafeInteger(result)) throw new Error('El importe es demasiado grande.')
  return result
}
export function decimal(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('El importe no es válido.')
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`
}
export const money = (value: string) => currency.format(cents(value) / 100)
export const dateLabel = (value: string, pattern = 'dd/MM/yyyy') => formatInTimeZone(value, TIMEZONE, pattern, { locale: es })
export const localToday = () => formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd')
export const localInput = (value: string) => formatInTimeZone(value, TIMEZONE, "yyyy-MM-dd'T'HH:mm")
export const toUtc = (value: string) => fromZonedTime(value, TIMEZONE).toISOString()
export const shiftDay = (day: string, count: number) => format(addDays(new Date(`${day}T12:00:00`), count), 'yyyy-MM-dd')
export const initials = (first: string, last: string) => `${first[0] || ''}${last[0] || ''}`.toUpperCase()

export function safeError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === '42501') return 'No tenés acceso a esta operación. Verificá tu sesión y que tu cuenta esté habilitada.'
  if (code === 'P0001' && error && typeof error === 'object' && 'message' in error) return String(error.message)
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') return 'Falta configurar la base de datos. Revisá las migraciones y la guía de instalación.'
  if (code === '23505') return 'Este registro ya existe. Actualizá los datos antes de volver a intentarlo.'
  if (code === '23514' || code === '22003' || code === '22P02') return 'Revisá los importes, fechas y campos obligatorios.'
  if (error instanceof Error && /Ingresá|importe|Seleccioná|asignado|saldo|fecha/i.test(error.message)) return error.message
  return 'No pudimos completar la operación. Revisá tu conexión y volvé a intentarlo.'
}
