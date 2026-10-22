import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { z } from 'npm:zod@4.6.7'

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,31}$/)
const password = z.string().min(12).max(128)
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('create'), username, display_name: z.string().trim().min(1).max(100), password, request_id: z.uuid() }).strict(),
  z.object({ action: z.literal('set_active'), user_id: z.uuid(), active: z.boolean() }).strict(),
  z.object({ action: z.literal('reset_password'), user_id: z.uuid(), password }).strict(),
])
interface Account {
  user_id: string; username: string; display_name: string
  active: boolean; managed_login: boolean; created_at: string
}
interface Creation { user_id: string; registered: boolean }
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const origins = new Set((Deno.env.get('ALLOWED_ORIGINS') ||
  'https://alvarezanibal.github.io,http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()))
const emailFor = (name: string) => name + '@accounts.consultorio.invalid'
function defaultKey(name: string): string | undefined {
  try {
    const value = JSON.parse(Deno.env.get(name) || '{}') as Record<string, unknown>
    return typeof value.default === 'string' ? value.default : undefined
  } catch { return undefined }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin')
  const cors: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store', 'Vary': 'Origin',
  }
  if (origin && origins.has(origin)) cors['Access-Control-Allow-Origin'] = origin
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
  if (origin && !origins.has(origin)) return reply({ error: 'Origen no permitido.' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405)
  try {
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Iniciá sesión para continuar.')
    const url = Deno.env.get('SUPABASE_URL')
    const anon = defaultKey('SUPABASE_PUBLISHABLE_KEYS') || Deno.env.get('SUPABASE_ANON_KEY')
    const secret = defaultKey('SUPABASE_SECRET_KEYS') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anon || !secret) throw new HttpError(503, 'Falta configurar el servicio de administración.')
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // Validate the signed token with Auth; never trust decoded claims or metadata.
    const { data: identity, error: identityError } = await caller.auth.getUser(authorization.slice(7))
    if (identityError || !identity.user) throw new HttpError(401, 'La sesión venció. Volvé a ingresar.')
    const { data: admin, error: roleError } = await caller.rpc('is_app_admin')
    if (roleError || admin !== true) throw new HttpError(403, 'Esta operación requiere una cuenta administradora.')
    if (Number(request.headers.get('content-length') || 0) > 8192) throw new HttpError(413, 'La solicitud es demasiado grande.')
    const text = await request.text()
    if (text.length > 8192) throw new HttpError(413, 'La solicitud es demasiado grande.')
    let raw: unknown
    try { raw = JSON.parse(text) } catch { throw new HttpError(400, 'Revisá los datos de la solicitud.') }
    const parsed = input.safeParse(raw)
    if (!parsed.success) throw new HttpError(400, 'Revisá el usuario, el nombre y la contraseña (entre 12 y 128 caracteres).')
    const body = parsed.data
    const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
    const actor = identity.user.id
    async function rpc<T>(name: string, values: Record<string, unknown>): Promise<T> {
      const { data, error } = await service.rpc(name, { p_actor: actor, ...values })
      if (error) {
        if (error.code === '42501') throw new HttpError(403, 'No tenés permiso para administrar usuarios.')
        if (error.code === 'P0001') throw new HttpError(409, error.message)
        if (error.code === '23505') throw new HttpError(409, 'Ese nombre de usuario ya está en uso.')
        throw new HttpError(503, 'No pudimos actualizar los usuarios. Volvé a intentarlo.')
      }
      return data as T
    }
    const list = () => rpc<Account[]>('admin_list_accounts', {})
    if (body.action === 'list') return reply({ users: await list() })
    if (body.action === 'create') {
      const find = () => rpc<Creation | null>('admin_find_creation', { p_username: body.username, p_request_id: body.request_id })
      let existing = await find()
      if (!existing) {
        const { data, error } = await service.auth.admin.createUser({
          email: emailFor(body.username), password: body.password, email_confirm: true,
          app_metadata: { managed_by: 'consultorio', creation_request_id: body.request_id },
        })
        if (error || !data.user) {
          existing = await find()
          if (!existing) throw new HttpError(503, 'No pudimos confirmar el alta. Reintentá con los mismos datos; revisá la contraseña si el problema continúa.')
        } else existing = { user_id: data.user.id, registered: false }
      }
      if (!existing.registered) await rpc('admin_register_account', {
        p_user_id: existing.user_id, p_username: body.username,
        p_display_name: body.display_name, p_request_id: body.request_id,
      })
      return reply({ users: await list() })
    }
    const accounts = await list()
    const target = accounts.find(account => account.user_id === body.user_id)
    if (!target || body.user_id === actor) throw new HttpError(404, 'Usuario no disponible.')
    if (body.action === 'set_active') {
      // One SQL transaction. Existing JWTs immediately lose all application access
      // through RLS and the privileged RPC authorization helper.
      await rpc('admin_set_account_active', { p_user_id: body.user_id, p_active: body.active })
      return reply({ users: await list() })
    }
    if (body.action === 'reset_password') {
      const { data: current, error: readError } = await service.auth.admin.getUserById(target.user_id)
      if (readError || !current.user) throw new HttpError(404, 'Usuario no disponible.')
      const { error } = await service.auth.admin.updateUserById(target.user_id, {
        password: body.password, email: emailFor(target.username), email_confirm: true,
        app_metadata: { ...current.user.app_metadata, managed_by: 'consultorio' },
      })
      if (error) throw new HttpError(503, 'No pudimos cambiar la contraseña. Volvé a intentarlo.')
      await rpc('admin_note_password_reset', { p_user_id: target.user_id })
      return reply({ users: await list() })
    }
    throw new HttpError(400, 'Operación no disponible.')
  } catch (error) {
    if (error instanceof HttpError) return reply({ error: error.message }, error.status)
    // Do not log credentials, request bodies, Auth payloads or internal errors.
    return reply({ error: 'No pudimos completar la operación. Volvé a intentarlo.' }, 500)
  }
})
