import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppTheme } from './theme'
import { configured } from './lib/supabase'
import { handleAuthCallback } from './features/auth/Auth'
import App from './App'
import './styles.css'

const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, refetchInterval: 60000, retry: 1, refetchOnWindowFocus: true }, mutations: { retry: false } } })
async function start() {
  let callbackError: string | null = null
  if (configured) {
    try { callbackError = await handleAuthCallback() } catch { callbackError = 'No pudimos procesar el enlace de acceso. Solicitá uno nuevo.' }
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={cache}><AppTheme><App callbackError={callbackError} /></AppTheme></QueryClientProvider></React.StrictMode>)
}
void start()
