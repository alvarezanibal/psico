import { useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { reversePayment, usePracticeMutation } from '../lib/api'
import { dateLabel, money, safeError } from '../lib/format'
import type { Patient, Payment } from '../lib/types'
import { EmptyState, PatientIdentity } from './common'
import { usePracticeDialogs } from './PracticeDialogs'

export function PaymentHistory({ payments, patients, showPatient = true }: { payments: Payment[]; patients: Patient[]; showPatient?: boolean }) {
  const [selected, setSelected] = useState<Payment | null>(null)
  const [reason, setReason] = useState('')
  const { notify } = usePracticeDialogs()
  const mutation = usePracticeMutation(async () => reversePayment(selected!.id, reason.trim()))
  async function reverse(event: React.FormEvent) {
    event.preventDefault()
    try { await mutation.mutateAsync(); setSelected(null); notify('Pago revertido. El historial original se conserva.') } catch { /* Displayed in dialog. */ }
  }
  if (!payments.length) return <EmptyState title="Todavía no registraste pagos" description="Cuando registres un cobro, lo vas a encontrar acá con su fecha, importe y medio de pago." />
  return <><TableContainer><Table><TableHead><TableRow><TableCell>Fecha</TableCell>{showPatient && <TableCell>Paciente</TableCell>}<TableCell>Medio / referencia</TableCell><TableCell align="right">Importe</TableCell><TableCell>Estado</TableCell><TableCell /></TableRow></TableHead><TableBody>{[...payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map(payment => <TableRow key={payment.id} hover sx={{ opacity: payment.reversed_at ? .65 : 1 }}><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateLabel(payment.paid_at)}<Typography variant="caption" sx={{ display: "block", color: "text.secondary" }} >{dateLabel(payment.paid_at, 'HH:mm')}</Typography></TableCell>{showPatient && <TableCell><PatientIdentity patient={patients.find(p => p.id === payment.patient_id)} /></TableCell>}<TableCell><Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{payment.method}</Typography><Typography variant="caption" sx={[{ overflowWrap: 'anywhere' }, { color: "text.secondary" }]} >{payment.reference || 'Sin referencia'}</Typography></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 650, textDecoration: payment.reversed_at ? 'line-through' : undefined }}>{money(payment.amount)}</TableCell><TableCell><Chip label={payment.reversed_at ? 'Revertido' : 'Registrado'} color={payment.reversed_at ? 'default' : 'success'} variant="outlined" size="small" />{payment.reversal_reason && <Typography variant="caption" sx={{ display: "block", mt: 1 }} >{payment.reversal_reason}</Typography>}</TableCell><TableCell>{!payment.reversed_at && <Button size="small" color="inherit" onClick={() => { setSelected(payment); setReason(''); mutation.reset() }}>Revertir</Button>}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    <Dialog open={!!selected} onClose={mutation.isPending ? undefined : () => setSelected(null)}><Box component="form" onSubmit={reverse}><DialogTitle>Revertir un registro incorrecto</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }} ><Alert severity="warning">Se restablecerá la deuda correspondiente a este pago y se recalcularán los cobros de su mes original. El movimiento queda en el historial. Usá esta acción para corregir registros; no registra una devolución de dinero.</Alert>{selected && <Typography sx={{ fontWeight: 650 }} >{money(selected.amount)} · {dateLabel(selected.paid_at)}</Typography>}{mutation.error && <Alert severity="error">{safeError(mutation.error)}</Alert>}<TextField label="Motivo de la corrección" value={reason} onChange={e => setReason(e.target.value)} required autoFocus multiline minRows={2} slotProps={{ htmlInput: { maxLength: 300 } }} /></Stack></DialogContent><DialogActions><Button disabled={mutation.isPending} onClick={() => setSelected(null)}>Cancelar</Button><Button type="submit" color="warning" variant="contained" disabled={mutation.isPending || !reason.trim()}>{mutation.isPending ? 'Revirtiendo…' : 'Confirmar reversión'}</Button></DialogActions></Box></Dialog>
  </>
}
