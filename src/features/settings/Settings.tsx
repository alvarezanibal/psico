import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, Divider, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import { CheckCircleOutlineRounded, DarkModeOutlined, LockOutlined, PersonOutlineRounded } from '@mui/icons-material'
import { useAuth } from '../auth/Auth'
import { useColorMode } from '../../theme'
import { db } from '../../lib/supabase'
import { usePracticeMutation, useProfile } from '../../lib/api'
import { safeError } from '../../lib/format'
import { PageHeading, QueryState } from '../../components/common'
import { usePracticeDialogs } from '../../components/PracticeDialogs'

export default function Settings() {
  const { session, account } = useAuth()
  const { dark, toggle } = useColorMode()
  const { notify } = usePracticeDialogs()
  const [name, setName] = useState('')
  const profile = useProfile()
  useEffect(() => { if (profile.data) setName(profile.data.display_name) }, [profile.data])
  const mutation = usePracticeMutation(async () => {
    const { data, error } = await db().from('profiles').update({ display_name: name.trim() }).eq('user_id', session!.user.id).select('user_id').single()
    if (error) throw error
    return data
  })
  async function submit(event: React.FormEvent) { event.preventDefault(); try { await mutation.mutateAsync(); notify('Perfil actualizado.') } catch { /* Displayed below. */ } }
  return <><PageHeading title="Configuración" description="Tu cuenta, tus preferencias y la seguridad de tu espacio." /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.25fr 1fr' }, gap: 3 }}>
    <Card component="form" onSubmit={submit} sx={{ p: 3 }}><Stack direction="row" sx={{ gap: 1.5, alignItems: "center", mb: 3 }} ><PersonOutlineRounded color="primary" /><Typography variant="h6">Tu perfil</Typography></Stack><Stack spacing={2.5}><QueryState loading={profile.isLoading} error={profile.error} retry={profile.refetch} />{mutation.error && <Alert severity="error">{safeError(mutation.error)}</Alert>}<TextField label="Nombre del consultorio o profesional" value={name} onChange={e => setName(e.target.value)} required slotProps={{ htmlInput: { maxLength: 100 } }} /><TextField label={account?.managed_login ? "Usuario de acceso" : "Acceso actual"} value={account?.managed_login ? account.username : session?.user.email || ''} disabled /><Typography variant="caption" sx={{ color: "text.secondary" }} >Zona horaria: Argentina (Buenos Aires) · Moneda: pesos argentinos</Typography><Button type="submit" variant="contained" disabled={mutation.isPending || !name.trim() || !profile.data} sx={{ alignSelf: 'flex-start' }}>{mutation.isPending ? 'Guardando…' : 'Guardar cambios'}</Button></Stack></Card>
    <Stack spacing={3}><Card sx={{ p: 3 }}><Stack direction="row" sx={{ gap: 1.5, alignItems: "center", mb: 2 }} ><DarkModeOutlined color="primary" /><Typography variant="h6">A tu manera</Typography></Stack><FormControlLabel control={<Switch checked={dark} onChange={toggle} />} label="Tema oscuro" /><Typography variant="body2" sx={{ color: "text.secondary" }} >Recordamos tu preferencia en este dispositivo.</Typography></Card><Card sx={{ p: 3 }}><Stack direction="row" sx={{ gap: 1.5, alignItems: "center", mb: 2 }} ><LockOutlined color="primary" /><Typography variant="h6">Seguridad</Typography></Stack><Stack direction="row" sx={{ gap: 1, alignItems: "center" }} ><CheckCircleOutlineRounded fontSize="small" color="success" /><Typography variant="body2">Ingreso privado con usuario y contraseña</Typography></Stack><Divider sx={{ my: 2 }} /><Typography variant="body2" sx={{ color: "text.secondary" }} >Acceso privado para tu cuenta. Para restablecer la contraseña, consultá al administrador.</Typography></Card></Stack>
  </Box></>
}
