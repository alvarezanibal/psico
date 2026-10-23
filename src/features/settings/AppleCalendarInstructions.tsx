import { useId, useState } from 'react'
import { Box, Tab, Tabs, Typography } from '@mui/material'

export function AppleCalendarInstructions({ linkVisible, linkEnabled }: { linkVisible: boolean; linkEnabled: boolean }) {
  const [device, setDevice] = useState<'iphone' | 'mac'>('iphone')
  const id = useId()
  const steps = device === 'iphone' ? [
    <>En tu iPhone/iPad, abrí la app <strong>Calendario de Apple</strong> y tocá <strong>Calendarios</strong>.</>,
    <>Elegí <strong>Agregar calendario → Agregar suscripción a calendario</strong>.</>,
    <>Pegá el enlace y tocá <strong>Buscar</strong> o <strong>Suscribirse</strong>.</>,
    <>Elegí un nombre, seleccioná <strong>iCloud</strong> en <strong>Cuenta</strong> y confirmá.</>,
  ] : [
    <>En tu Mac, abrí <strong>Calendario de Apple</strong> y elegí <strong>Archivo → Nueva suscripción a calendario</strong>.</>,
    <>Pegá el enlace y hacé clic en <strong>Suscribirse</strong>.</>,
    <>Elegí un nombre y seleccioná <strong>iCloud</strong> en <strong>Ubicación</strong>.</>,
    <>Hacé clic en <strong>Aceptar</strong>.</>,
  ]
  return <Box component="section" aria-label="Cómo agregar la agenda en Apple Calendar">
    <Typography component="h3" variant="subtitle2">Agregar a Apple Calendar</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{linkVisible ? 'Copiá el enlace de arriba y seguí estos pasos:' : linkEnabled ? 'Con tu enlace copiado, seguí estos pasos:' : 'Tocá Crear enlace privado y después Copiar enlace. Luego:'}</Typography>
    <Tabs value={device} onChange={(_event, value: 'iphone' | 'mac') => setDevice(value)} aria-label="Dispositivo" sx={{ mb: 1.5 }}>
      <Tab value="iphone" label="iPhone / iPad" id={`${id}-iphone-tab`} aria-controls={`${id}-iphone-panel`} />
      <Tab value="mac" label="Mac" id={`${id}-mac-tab`} aria-controls={`${id}-mac-panel`} />
    </Tabs>
    <Box role="tabpanel" id={`${id}-${device}-panel`} aria-labelledby={`${id}-${device}-tab`}>
      <Box component="ol" sx={{ m: 0, pl: 2.5, '& > li': { mb: 1 }, '& > li:last-child': { mb: 0 } }}>
        {steps.map((step, index) => <Typography component="li" variant="body2" key={index}>{step}</Typography>)}
      </Box>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>«Agregar» puede aparecer como «Añadir». Apple actualiza los turnos periódicamente.</Typography>
  </Box>
}