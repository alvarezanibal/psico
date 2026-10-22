import { z } from 'zod'

export const LOGIN_DOMAIN = 'accounts.consultorio.invalid'
export const usernamePattern = /^[a-z0-9][a-z0-9_.-]{2,31}$/
export const appAccountSchema = z.object({
  user_id: z.uuid(), username: z.string(), display_name: z.string(),
  role: z.enum(['admin', 'professional']), active: z.boolean(), managed_login: z.boolean(),
})
export type AppAccount = z.infer<typeof appAccountSchema>
export function loginIdentifier(value: string) {
  const identifier = value.trim().toLowerCase()
  // Preserve the original professional's email-based access during migration.
  if (identifier.includes('@')) return identifier
  if (!usernamePattern.test(identifier)) throw new Error('Ingresá un usuario de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.')
  return identifier + '@' + LOGIN_DOMAIN
}
