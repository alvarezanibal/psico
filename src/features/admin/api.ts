import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { db } from '../../lib/supabase'

const userSchema = z.object({
  user_id: z.uuid(), username: z.string(), display_name: z.string(),
  active: z.boolean(), managed_login: z.boolean(), created_at: z.string(),
})
export type ManagedUser = z.infer<typeof userSchema>
export type AdminRequest =
  | { action: 'list' }
  | { action: 'create'; username: string; display_name: string; password: string; request_id: string }
  | { action: 'set_active'; user_id: string; active: boolean }
  | { action: 'reset_password'; user_id: string; password: string }

export class AdminApiError extends Error {}
export const adminError = (error: unknown) => error instanceof AdminApiError
  ? error.message : 'No pudimos completar la operación. Volvé a intentarlo.'

export async function manageUsers(body: AdminRequest): Promise<ManagedUser[]> {
  const { data, error } = await db().functions.invoke('admin-users', { body })
  if (error) {
    const response = 'context' in error && error.context instanceof Response ? error.context : null
    if (response) {
      if (response.status === 404) throw new AdminApiError('Falta desplegar la función de usuarios en Supabase. Seguí la guía de configuración del administrador.')
      let details: unknown
      try { details = await response.json() } catch { /* No raw service errors in the UI. */ }
      const parsed = z.object({ error: z.string().max(400) }).safeParse(details)
      if (parsed.success) throw new AdminApiError(parsed.data.error)
    }
    throw new AdminApiError('No pudimos conectar con la administración de usuarios. Revisá la conexión y el despliegue de la función.')
  }
  const result = z.object({ users: z.array(userSchema) }).safeParse(data)
  if (!result.success) throw new AdminApiError('No pudimos leer la lista de usuarios.')
  return result.data.users
}
export const adminUsersOptions = queryOptions({
  queryKey: ['admin', 'users'], queryFn: () => manageUsers({ action: 'list' }),
})
