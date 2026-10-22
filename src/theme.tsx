import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { createTheme, CssBaseline, ThemeProvider } from '@mui/material'

const ColorContext = createContext({ dark: false, toggle: () => {} })
export const useColorMode = () => useContext(ColorContext)
export function AppTheme({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('consultorio-theme') === 'dark' } catch { return false }
  })
  const theme = useMemo(() => createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: dark ? '#60A5FA' : '#2563EB' },
      secondary: { main: dark ? '#5EEAD4' : '#0F766E' },
      background: { default: dark ? '#0B172A' : '#F8FAFC', paper: dark ? '#14233B' : '#FFFFFF' },
      text: { primary: dark ? '#E8EFFA' : '#0F172A', secondary: dark ? '#A5B6CE' : '#64748B' },
      divider: dark ? '#2D4262' : '#E2E8F0',
      success: { main: dark ? '#6EE7B7' : '#15803D' },
      warning: { main: dark ? '#FCD34D' : '#A16207' },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Segoe UI", Inter, system-ui, -apple-system, sans-serif',
      h4: { fontWeight: 750, fontSize: '1.85rem', letterSpacing: '-.045em' },
      h5: { fontWeight: 700, letterSpacing: '-.03em' },
      h6: { fontWeight: 650, fontSize: '1.05rem' },
      button: { textTransform: 'none', fontWeight: 650, letterSpacing: 0 },
      body2: { lineHeight: 1.65 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 9, padding: '9px 17px' } } },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: { styleOverrides: { root: { border: `1px solid ${dark ? '#2D4262' : '#E2E8F0'}`, boxShadow: dark ? 'none' : '0 3px 15px #0f172a03' } } },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600, fontSize: '.72rem', borderRadius: 7 } } },
      MuiTableCell: { styleOverrides: { root: { borderColor: dark ? '#2D4262' : '#E2E8F0', padding: '16px 20px' }, head: { color: dark ? '#A5B6CE' : '#64748B', fontWeight: 650, fontSize: '.73rem', background: dark ? '#172842' : '#F8FAFC' } } },
      MuiDialog: { defaultProps: { fullWidth: true, maxWidth: 'sm' }, styleOverrides: { paper: { borderRadius: 18 } } },
      MuiDialogTitle: { styleOverrides: { root: { padding: '24px 24px 16px', fontWeight: 700 } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 24px' } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 10 } } },
    },
  }), [dark])
  function toggle() { setDark(value => { try { localStorage.setItem('consultorio-theme', !value ? 'dark' : 'light') } catch { /* Preference storage is optional. */ } return !value }) }
  return <ColorContext.Provider value={{ dark, toggle }}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></ColorContext.Provider>
}
