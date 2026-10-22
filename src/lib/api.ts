import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from './supabase'
import type { DashboardSummary, Patient, Payment, PaymentInput, PracticeSession } from './types'

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
export const sessionsOptions = queryOptions({ queryKey: ['practice', 'sessions'], queryFn: () => readAll<PracticeSession>('session_balances', 'starts_at') })
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
export const usePayments = () => useQuery(paymentsOptions)
export const useSummary = () => useQuery(summaryOptions)
export function usePracticeMutation<T>(mutationFn: (variables: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['practice'] }) })
}
export async function savePatient(data: Record<string, unknown>, id?: string) {
  const query = id ? db().from('patients').update(data).eq('id', id) : db().from('patients').insert(data)
  const { data: result, error } = await query.select('id').single()
  if (error) throw error
  return result
}
export async function saveSession(data: Record<string, unknown>, id?: string) {
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
