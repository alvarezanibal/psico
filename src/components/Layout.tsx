import { useState } from 'react'
import { Avatar, Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography } from '@mui/material'
import { AccountBalanceWalletOutlined, CalendarMonthOutlined, ChevronRightRounded, DarkModeOutlined, DashboardOutlined, LightModeOutlined, LogoutRounded, ManageAccountsOutlined, MenuRounded, PeopleOutlineRounded, SettingsOutlined, SpaRounded, ViewAgendaOutlined } from '@mui/icons-material'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useColorMode } from '../theme'
import { useAuth } from '../features/auth/Auth'
import { dateLabel } from '../lib/format'
import { useProfile } from '../lib/api'

const links = [
  { to: '/', label: 'Inicio', icon: <DashboardOutlined /> },
  { to: '/calendario', label: 'Calendario', icon: <CalendarMonthOutlined /> },
  { to: '/pacientes', label: 'Pacientes', icon: <PeopleOutlineRounded /> },
  { to: '/sesiones', label: 'Sesiones', icon: <ViewAgendaOutlined /> },
  { to: '/cuentas', label: 'Cuentas corrientes', icon: <AccountBalanceWalletOutlined /> },
  { to: '/configuracion', label: 'Configuración', icon: <SettingsOutlined /> },
]
export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { dark, toggle } = useColorMode()
  const { account, logout } = useAuth()
  const isAdmin = account?.role === 'admin'
  const navigationLinks = isAdmin ? [{ to: '/usuarios', label: 'Usuarios', icon: <ManageAccountsOutlined /> }] : links
  const profile = useProfile()
  const location = useLocation()
  const active = navigationLinks.find(item => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))
  const navigation = <Stack sx={{ height: "100%", p: 2 }} >
    <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", px: 1.5, py: 2, mb: 4 }} ><Box sx={{ width: 35, height: 35, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2.5 }}><SpaRounded sx={{ fontSize: 23 }} /></Box><Typography sx={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "-.05em" }} >consultorio<span style={{ color: '#2563EB' }}>.</span></Typography></Stack>
    <List disablePadding>{navigationLinks.map(item => <ListItemButton key={item.to} component={NavLink} to={item.to} end={item.to === '/'} onClick={() => setMobileOpen(false)} sx={{ borderRadius: 2, my: .5, px: 1.7, minHeight: 46, color: 'text.secondary', '&.active': { bgcolor: 'action.selected', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}><ListItemIcon sx={{ minWidth: 36, color: 'text.secondary', '& svg': { fontSize: 21 } }}>{item.icon}</ListItemIcon><ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: '.84rem', fontWeight: 600 } } }} /></ListItemButton>)}</List>
    <Box sx={{ flex: 1 }} />
    <Divider /><Stack direction="row" spacing={1.1} sx={{ alignItems: "center", pt: 2 }} ><Avatar sx={{ bgcolor: 'secondary.main', width: 34, height: 34, fontSize: '.8rem' }}>{account?.username[0]?.toUpperCase() || 'M'}</Avatar><Box sx={{ flex: 1, minWidth: 0 }} ><Typography noWrap variant="body2" sx={{ fontWeight: 650 }} >{profile.data?.display_name || account?.display_name || 'Mi consultorio'}</Typography><Typography noWrap  variant="caption" sx={{ color: "text.secondary", display: "block" }} >{account?.username}</Typography></Box><Tooltip title="Cerrar sesión"><IconButton size="small" onClick={() => void logout()} aria-label="Cerrar sesión"><LogoutRounded sx={{ fontSize: 18 }} /></IconButton></Tooltip></Stack>
  </Stack>
  return <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
    <Box component="a" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }} sx={{ position: 'fixed', top: -80, left: 12, zIndex: 1600, bgcolor: 'background.paper', p: 1.5, '&:focus': { top: 10 } }}>Ir al contenido</Box>
    <Drawer variant="permanent" sx={{ width: 248, flexShrink: 0, display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: 248, boxSizing: 'border-box' } }}>{navigation}</Drawer>
    <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: 260 } }}>{navigation}</Drawer>
    <Box sx={{ flex: 1, minWidth: 0 }} >
      <Stack component="header" direction="row" sx={[{ height: 73, px: { xs: 2, lg: 4.5 }, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 0, zIndex: 10 }, { alignItems: "center", justifyContent: "space-between" }]} >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }} ><IconButton onClick={() => setMobileOpen(true)} sx={{ display: { md: 'none' } }} aria-label="Abrir menú"><MenuRounded /></IconButton><Typography variant="body2" sx={[{ display: { xs: 'none', sm: 'block' } }, { color: "text.secondary" }]} >{isAdmin ? 'Administración' : 'Mi consultorio'}</Typography><ChevronRightRounded sx={{ fontSize: 16, color: 'text.disabled', display: { xs: 'none', sm: 'block' } }} /><Typography variant="body2" sx={{ fontWeight: 600 }} >{active?.label || 'Paciente'}</Typography></Stack>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }} ><Typography variant="caption" sx={[{ display: { xs: 'none', sm: 'block' }, textTransform: 'capitalize' }, { color: "text.secondary" }]} >{dateLabel(new Date().toISOString(), "EEEE d 'de' MMMM")}</Typography><Tooltip title={dark ? 'Usar tema claro' : 'Usar tema oscuro'}><IconButton onClick={toggle} aria-label="Cambiar tema">{dark ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}</IconButton></Tooltip></Stack>
      </Stack>
      <Box component="main" id="main-content" tabIndex={-1} sx={{ p: { xs: 2, sm: 3, lg: 4.5 }, maxWidth: 1550, mx: 'auto' }}><Outlet /></Box>
    </Box>
  </Box>
}

export function SetupScreen() {
  const { dark, toggle } = useColorMode()
  return <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}><Box sx={{ maxWidth: 640 }} ><Stack direction="row" sx={{ gap: 1.5, alignItems: "center", mb: 5 }} ><SpaRounded color="primary" sx={{ fontSize: 38 }} /><Typography variant="h4">consultorio.</Typography><Box sx={{ flex: 1 }} /><IconButton onClick={toggle} aria-label="Cambiar tema">{dark ? <LightModeOutlined /> : <DarkModeOutlined />}</IconButton></Stack><Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 3, p: 3 }}><Typography variant="h6" sx={{ mb: 2 }} >Configuración inicial</Typography><Stack spacing={2}>{['Creá un proyecto Supabase y aplicá la migración incluida.', 'Creá tu cuenta privada y habilitala como propietaria del consultorio.', 'Copiá .env.example a .env.local y completá la URL y la clave pública.', 'Reiniciá el servidor e ingresá con tu email y contraseña.'].map((text, i) => <Stack direction="row" key={text} sx={{ gap: 1.5 }} ><Avatar sx={{ width: 25, height: 25, fontSize: '.75rem', bgcolor: 'action.selected', color: 'primary.main' }}>{i + 1}</Avatar><Typography variant="body2">{text}</Typography></Stack>)}</Stack><Button component="a" href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" variant="contained" sx={{ mt: 3 }}>Abrir Supabase</Button><Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 2 }} >Los pasos completos están en README.md y docs/deployment.md.</Typography></Box></Box></Box>
}
