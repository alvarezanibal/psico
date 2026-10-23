import { useDeferredValue, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AddRounded, BlockOutlined, CheckCircleOutlineRounded, KeyOutlined, SearchRounded } from '@mui/icons-material'
import { Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { EmptyState, PageHeading, QueryState } from '../../components/common'
import { dateLabel } from '../../lib/format'
import { usernamePattern } from '../../lib/access'
import { adminError, adminUsersOptions, manageUsers, type AdminRequest, type ManagedUser } from './api'

type Selection = { kind: 'create' } | { kind: 'password'; user: ManagedUser } | { kind: 'access'; user: ManagedUser } | null
export default function Users() {
  const users = useQuery(adminUsersOptions)
  const cache = useQueryClient()
  const [selection, setSelection] = useState<Selection>(null)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const term = useDeferredValue(search.trim().toLocaleLowerCase('es-AR'))
  const rows = (users.data || []).filter(user => (user.username + ' ' + user.display_name).toLocaleLowerCase('es-AR').includes(term))
  function saved(next: ManagedUser[], message: string) {
    cache.setQueryData(adminUsersOptions.queryKey, next); setSelection(null); setNotice(message)
  }
  return <>
    <PageHeading title="Usuarios" action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setSelection({ kind: 'create' })}>Nuevo usuario</Button>} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' }, gap: 2, mb: 3 }}>
      {[{ label: 'Usuarios', value: users.data?.length || 0 }, { label: 'Habilitados', value: users.data?.filter(user => user.active).length || 0 }, { label: 'Bloqueados', value: users.data?.filter(user => !user.active).length || 0 }].map(item => <Card key={item.label} sx={{ p: 2.5 }}><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{item.label}</Typography><Typography variant="h5">{item.value}</Typography></Card>)}
    </Box>
    <Card>
      <Box sx={{ p: 2.5 }}><TextField placeholder="Buscar por usuario o nombre" value={search} onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Buscar usuarios' }, input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} /></Box>
      {users.error && <Alert severity="error" sx={{ mx: 2.5, mb: 2 }} action={<Button color="inherit" onClick={() => void users.refetch()}>Reintentar</Button>}>{adminError(users.error)}</Alert>}
      {users.isLoading && <Box sx={{ px: 2.5, pb: 2.5 }}><QueryState loading error={null} /></Box>}
      {users.data && !users.error && (rows.length ? <TableContainer><Table><TableHead><TableRow><TableCell>Usuario</TableCell><TableCell>Nombre</TableCell><TableCell>Creado</TableCell><TableCell>Acceso</TableCell><TableCell align="right">Administrar</TableCell></TableRow></TableHead><TableBody>
        {rows.map(user => <TableRow key={user.user_id} hover><TableCell><Typography variant="body2" sx={{ fontWeight: 650 }}>{user.username}</Typography>{!user.managed_login && <Typography variant="caption" color="text.secondary">Cuenta anterior</Typography>}</TableCell><TableCell>{user.display_name}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateLabel(user.created_at)}</TableCell><TableCell><Chip variant="outlined" size="small" color={user.active ? 'success' : 'default'} label={user.active ? 'Habilitado' : 'Bloqueado'} /></TableCell><TableCell align="right"><Stack direction="row" sx={{ gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}><Button size="small" startIcon={<KeyOutlined />} onClick={() => setSelection({ kind: 'password', user })}>Contraseña</Button><Button size="small" color={user.active ? 'warning' : 'success'} startIcon={user.active ? <BlockOutlined /> : <CheckCircleOutlineRounded />} onClick={() => setSelection({ kind: 'access', user })}>{user.active ? 'Quitar acceso' : 'Habilitar'}</Button></Stack></TableCell></TableRow>)}
      </TableBody></Table></TableContainer> : <EmptyState title={search ? 'No encontramos coincidencias' : 'Agregá el primer usuario'} description={search ? 'Probá con otro usuario o nombre.' : 'Las cuentas se crean con usuario y contraseña, sin correo ni invitaciones.'} action={!search && <Button onClick={() => setSelection({ kind: 'create' })}>Crear usuario</Button>} />)}
    </Card>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Cada usuario conserva sus propios pacientes, turnos y cobros. Bloquear el acceso no elimina su historial.</Typography>
    {selection?.kind === 'create' && <CredentialDialog close={() => setSelection(null)} saved={saved} />}
    {selection?.kind === 'password' && <CredentialDialog user={selection.user} close={() => setSelection(null)} saved={saved} />}
    {selection?.kind === 'access' && <AccessDialog user={selection.user} close={() => setSelection(null)} saved={saved} />}
    <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert></Snackbar>
  </>
}
const credentials = z.object({
  username: z.string().trim().toLowerCase().regex(usernamePattern, 'Usá de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.'),
  display_name: z.string().trim().min(1, 'Ingresá el nombre.').max(100),
  password: z.string().min(12, 'Usá al menos 12 caracteres.').max(128),
  confirmation: z.string(),
}).refine(value => value.password === value.confirmation, { message: 'Las contraseñas no coinciden.', path: ['confirmation'] })
function CredentialDialog({ user, close, saved }: { user?: ManagedUser; close: () => void; saved: (users: ManagedUser[], message: string) => void }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(credentials), defaultValues: { username: user?.username || '', display_name: user?.display_name || '', password: '', confirmation: '' },
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AdminRequest | null>(null)
  const [frozen, setFrozen] = useState(false)
  const submit = handleSubmit(async values => {
    setError(''); setBusy(true)
    try {
      if (!pending.current) {
        pending.current = user ? { action: 'reset_password', user_id: user.user_id, password: values.password } :
          { action: 'create', username: values.username, display_name: values.display_name, password: values.password, request_id: crypto.randomUUID() }
        setFrozen(true)
      }
      // Credentials stay in this dialog, never in the query/mutation cache.
      const next = await manageUsers(pending.current)
      pending.current = null; reset()
      saved(next, user ? 'Contraseña actualizada. Compartila directamente con el usuario.' : 'Usuario creado. Ya puede ingresar con sus credenciales.')
    } catch (problem) { setError(adminError(problem)) } finally { setBusy(false) }
  })
  return <Dialog open onClose={busy ? undefined : close}><Box component="form" onSubmit={submit}><DialogTitle>{user ? 'Restablecer contraseña' : 'Nuevo usuario'}</DialogTitle><DialogContent><Stack spacing={2.5} sx={{ pt: 1 }}>
    <Typography variant="body2" color="text.secondary">{user ? 'El usuario ingresará con su nombre de usuario y la nueva contraseña.' : 'Creá una cuenta para gestionar pacientes, turnos y cobros. No hace falta un email.'}</Typography>
    {user && !user.managed_login && <Alert severity="info">Esta cuenta conserva su acceso anterior. Al confirmar, pasará a ingresar como <strong>{user.username}</strong> con la nueva contraseña.</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    {frozen && error && <Typography variant="caption" color="text.secondary">Podés reintentar los mismos datos. Para modificarlos, cerrá el diálogo y revisá primero si el usuario ya fue creado.</Typography>}
    <TextField label="Nombre de usuario" {...register('username')} error={!!errors.username} helperText={errors.username?.message} slotProps={{ input: { readOnly: !!user || busy || frozen }, htmlInput: { autoCapitalize: 'none', spellCheck: false, maxLength: 32 } }} autoComplete="off" />
    {!user && <TextField label="Nombre para mostrar" {...register('display_name')} error={!!errors.display_name} helperText={errors.display_name?.message} slotProps={{ input: { readOnly: busy || frozen } }} />}
    <TextField label={user ? 'Nueva contraseña' : 'Contraseña'} type="password" autoComplete="new-password" {...register('password')} error={!!errors.password} helperText={errors.password?.message || 'Entre 12 y 128 caracteres.'} slotProps={{ input: { readOnly: busy || frozen } }} />
    <TextField label="Repetir contraseña" type="password" autoComplete="new-password" {...register('confirmation')} error={!!errors.confirmation} helperText={errors.confirmation?.message} slotProps={{ input: { readOnly: busy || frozen } }} />
    <Typography variant="caption" color="text.secondary">Compartí las credenciales directamente con el usuario. No se envían correos.</Typography>
  </Stack></DialogContent><DialogActions><Button onClick={close} disabled={busy}>Cancelar</Button><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Guardando…' : frozen ? 'Reintentar' : user ? 'Cambiar contraseña' : 'Crear usuario'}</Button></DialogActions></Box></Dialog>
}
function AccessDialog({ user, close, saved }: { user: ManagedUser; close: () => void; saved: (users: ManagedUser[], message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    setBusy(true); setError('')
    try { const next = await manageUsers({ action: 'set_active', user_id: user.user_id, active: !user.active }); saved(next, user.active ? 'Acceso bloqueado.' : 'Acceso habilitado.') }
    catch (problem) { setError(adminError(problem)) } finally { setBusy(false) }
  }
  return <Dialog open onClose={busy ? undefined : close}><DialogTitle>{user.active ? 'Quitar acceso' : 'Habilitar acceso'}</DialogTitle><DialogContent><Stack spacing={2}><Typography><strong>{user.display_name}</strong> · {user.username}</Typography><Typography variant="body2" color="text.secondary">{user.active ? 'El usuario dejará de tener acceso a sus datos. Sus pacientes, sesiones y pagos se conservarán para cuando lo habilites de nuevo.' : 'El usuario podrá volver a ingresar y trabajar con sus datos.'}</Typography>{error && <Alert severity="error">{error}</Alert>}</Stack></DialogContent><DialogActions><Button onClick={close} disabled={busy}>Cancelar</Button><Button onClick={() => void confirm()} variant="contained" color={user.active ? 'warning' : 'success'} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</Button></DialogActions></Dialog>
}
