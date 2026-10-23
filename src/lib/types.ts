export type SessionStatus = 'programada' | 'realizada' | 'cancelada' | 'ausente'
export type PaymentStatus = 'pendiente' | 'parcial' | 'pagada' | 'sin_cargo'
export interface Patient {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  active: boolean
  default_session_price: string
  default_duration_minutes: number
  balance: string
  pending_sessions: number
  last_session_at: string | null
  oldest_debt_at: string | null
  created_at: string
}
export interface AppointmentSeries {
  created_at: string
  id: string
  patient_id: string
  weekday: number
  local_time: string
  starts_on: string
  ends_on: string | null
  duration_minutes: number
  updated_at: string
}
export interface ScheduleInput {
  action: 'set' | 'stop'
  effective_from: string
  starts_on?: string
  weekday?: number
  local_time?: string
  duration_minutes?: number
  expected_series_id: string | null
  expected_updated_at: string | null
}
export const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export interface PracticeSession {
  series_id?: string | null
  original_date?: string | null
  virtual?: boolean
  id: string
  patient_id: string
  starts_at: string
  ends_at: string
  status: SessionStatus
  price: string
  cancellation_fee: string
  cancellation_reason: string
  eligible_charge: string
  paid_amount: string
  balance: string
  payment_status: PaymentStatus
  updated_at: string
}
export interface Payment {
  id: string
  patient_id: string
  paid_at: string
  amount: string
  method: 'efectivo' | 'transferencia' | 'otro'
  reference: string
  reversed_at: string | null
  reversal_reason: string | null
}
export interface DashboardSummary {
  total_debt: string
  debtors: number
  unpaid_sessions: number
  collected_month: string
  active_patients: number
  completed_month: number
}
export interface PaymentInput {
  patient_id: string
  paid_at: string
  amount: string
  method: Payment['method']
  reference: string
  allocations: { session_id: string; amount: string }[]
}
export const sessionLabels: Record<SessionStatus, string> = {
  programada: 'Programada', realizada: 'Realizada', cancelada: 'Cancelada', ausente: 'Ausente',
}
export const paymentLabels: Record<PaymentStatus, string> = {
  pendiente: 'Pendiente', parcial: 'Pago parcial', pagada: 'Pagada', sin_cargo: 'Sin cargo exigible',
}
export const fullName = (patient?: Pick<Patient, 'first_name' | 'last_name'>) => patient
  ? `${patient.first_name} ${patient.last_name}` : 'Paciente'
