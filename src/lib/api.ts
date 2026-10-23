import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from './supabase'
import type { AppointmentSeries, DashboardSummary, Patient, Payment, PaymentInput, PracticeSession, ScheduleInput } from './types'

// Paginate all collections: Supabase's API caps individual responses.
async function readAll<T>(table: string, order: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await db().from(table).select('*').order(order).order('id').range(from, from + 499)
    if (error) throw error
    rows.push(...data as T[])
    if (data.length < 500) return rows
  }
}
export const patientsOptions = queryOptions({ queryKey: ['practice', 'patients'], queryFn: () => readAll<Patient>('patient_balances', 'last_name') })
export const sessionsOptions = queryOptions({ queryKey: ['practice', 'sessions'], queryFn: async () => {
  try { return await readAll<PracticeSession>('agenda_session_balances', 'starts_at') }
  catch (error) {
    if (missingMigration(error)) return readAll<PracticeSession>('session_balances', 'starts_at')
    throw error
  }
} })
export const paymentsOptions = queryOptions({ queryKey: ['practice', 'payments'], queryFn: () => readAll<Payment>('payment_history', 'paid_at') })
export const summaryOptions = queryOptions({ queryKey: ['practice', 'summary'], queryFn: async () => {
  const { data, error } = await db().rpc('dashboard_summary')
  if (error) throw error
  return data as DashboardSummary
} })
export const profileOptions = queryOptions({ queryKey: ['practice', 'profile'], queryFn: async () => {
  const { data, error } = await db().from('profiles').select('display_name').single()
  if (error) throw error
  return data as { display_name: string }
} })
export const useProfile = () => useQuery(profileOptions)
export const usePatients = () => useQuery(patientsOptions)
export const useSessions = () => useQuery(sessionsOptions)
function missingMigration(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(String(error.code))
}
export const seriesOptions = queryOptions({ queryKey: ['practice', 'series'], queryFn: () => readAll<AppointmentSeries>('appointment_series', 'starts_on') })
export function latestSeries(series: AppointmentSeries[], patientId?: string) {
  return series.filter(r => r.patient_id === patientId).sort((a, b) => b.starts_on.localeCompare(a.starts_on) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0]
}
export const useSeries = (enabled = true) => useQuery({ ...seriesOptions, enabled })
export function useAgenda(from: string, to: string) {
  return useQuery({ queryKey: ['practice', 'agenda', from, to], queryFn: async () => {
    const rows: PracticeSession[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db().rpc('agenda_occurrences', { p_from: from, p_to: to, p_offset: offset })
      if (error) {
        if (missingMigration(error)) {
          const legacy = await readAll<PracticeSession>('session_balances', 'starts_at')
          return legacy.filter(s => s.starts_at < new Date(to + 'T23:59:59.999-03:00').toISOString() && s.ends_at > new Date(from + 'T00:00:00-03:00').toISOString())
        }
        throw error
      }
      rows.push(...data as PracticeSession[])
      if (data.length < 500) return rows
    }
  } })
}
export const usePayments = () => useQuery(paymentsOptions)
export const useSummary = () => useQuery(summaryOptions)
export function usePracticeMutation<T>(mutationFn: (variables: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['practice'] }) })
}
export async function savePatient(data: Record<string, unknown>, id?: string, schedule?: ScheduleInput) {
  if (schedule) {
    const { data: result, error } = await db().rpc('save_patient_schedule', { p_data: data, p_id: id ?? null, p_schedule: schedule })
    if (error) throw error
    return { id: result as string }
  }
  const query = id ? db().from('patients').update(data).eq('id', id) : db().from('patients').insert(data)
  const { data: result, error } = await query.select('id').single()
  if (error) throw error
  return result
}
export async function changeSchedule(patientId: string, schedule: ScheduleInput) {
  const { error } = await db().rpc('change_patient_schedule', { p_patient_id: patientId, p_schedule: schedule })
  if (error) throw error
}
export async function saveSession(data: Record<string, unknown>, id?: string) {
  if (data.virtual) {
    const { error } = await db().rpc('save_recurring_occurrence', {
      p_series_id: data.series_id, p_original_date: data.original_date, p_data: data,
      p_expected_updated_at: data.expected_updated_at,
    })
    if (error) throw error
    return
  }
  const { error } = await db().rpc('save_session', { p_data: data, p_id: id ?? null })
  if (error) throw error
}
export async function recordPayment(data: PaymentInput, key: string) {
  const { error } = await db().rpc('record_payment', { p_data: data, p_idempotency_key: key })
  if (error) throw error
}
export async function reversePayment(id: string, reason: string) {
  const { error } = await db().rpc('reverse_payment', { p_id: id, p_reason: reason })
  if (error) throw error
}
