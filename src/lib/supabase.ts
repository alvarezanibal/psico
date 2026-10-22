import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
function validUrl(value?: string) {
  if (!value || value.includes('your-project')) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  } catch { return false }
}
export const configured = Boolean(validUrl(url) && key && !key.startsWith('your-'))
export const supabase = configured ? createClient(url!, key!, {
  auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
}) : null
export function db() {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  return supabase
}
