# Datos y operaciones de dinero

Migración inicial: `supabase/migrations/202610210001_core.sql`. Actualización de acceso: `supabase/migrations/202610220001_password_only_access.sql`, que retira la exigencia de TOTP manteniendo la única cuenta autorizada y RLS. Requiere PostgreSQL 15+ por las vistas `security_invoker`. Aplicar en orden; si la inicial ya se ejecutó, aplicar solo la actualización.

| Entidad | Uso |
|---|---|
| `private.app_owner` | UUID de la única cuenta habilitada; escritura administrativa |
| `profiles` | Nombre de la profesional/consultorio |
| `patients` | Contacto, estado activo, tarifa y duración habituales |
| `sessions` | Horarios UTC, estado, honorario histórico y cargo explícito de cancelación |
| `payments` | Recibo, fecha efectiva, medio, clave de idempotencia y eventual reversión |
| `payment_allocations` | Asignaciones positivas de un recibo a sesiones del mismo paciente y propietario |
| `audit_log` | Creación/edición de sesiones, registro/reversión de pagos |

No hay borrado físico desde la aplicación. Las FKs impiden romper las relaciones. Archivar no elimina deuda ni historia. `owner_id` protege los registros; no hay gestión de tenants u organizaciones.

## Fuente de verdad

`session_balances` resta las asignaciones de pagos vigentes al cargo elegible de cada sesión. Una realizada es exigible al terminar; una cancelada/ausente con cargo explícito lo es cuando pasó el horario del turno. Una programada no genera deuda. El estado de pago es `sin_cargo`, `pendiente`, `parcial` o `pagada` y nunca reemplaza el estado de la sesión.

`patient_balances` suma saldos positivos y cuenta cada sesión pendiente una sola vez. Incluye pacientes archivados. `dashboard_summary()` usa estas mismas vistas y suma pagos no revertidos por `paid_at` dentro del mes de Buenos Aires. Emitir una futura factura no cambiará estas cuentas.

Los campos monetarios usan `numeric(14,2)`; las vistas los exponen como texto para evitar redondeo al decodificar JSON. Se rechazan negativos, asignaciones nulas/cero, centavos inválidos y montos fuera del rango permitido.

## RPCs

- `save_session(p_data, p_id)`: valida paciente/estado/fechas/importes. Con `p_id = null` crea una sesión; para editar exige `expected_updated_at`, evitando sobrescribir otra ventana. Una sesión con pagos vigentes no puede cambiar sus horarios ni datos financieros; primero se corrige el pago erróneo. La tarifa del paciente solo se copia al crear el turno.
- `record_payment(p_data, p_idempotency_key)`: bloquea el paciente y sesiones, exige que el total recibido coincida con las asignaciones y que cada una no exceda el saldo elegible. Guarda recibo/asignaciones/auditoría en la misma transacción. La misma clave con el mismo JSON devuelve el recibo original; con otro JSON se rechaza. La UI conserva esa solicitud para reintentar tras un fallo.
- `reverse_payment(p_id, p_reason)`: bloquea el mismo paciente, marca una reversión auditable y conserva las asignaciones originales. Repetirla no revierte dos veces. El recibo deja de participar en saldos y en el mes original de cobro.

No se permiten anticipos, crédito a favor, devolución de efectivo ni borrar movimientos. Esas reglas deben definirse antes de agregarlas. La reversión se usa para errores de registro y puede reexpresar indicadores de meses pasados.

## Acceso

La identidad y la autorización de la única propietaria se comprueban en SQL, además de la UI. Por pedido del usuario, el segundo factor no es obligatorio actualmente. `authenticated` solo tiene SELECT sobre movimientos; las escrituras pasan por las funciones. Los helpers privilegiados tienen `search_path` fijo, permisos explícitos y consultas limitadas al dueño autenticado. Las relaciones usan claves compuestas para impedir cruces entre propietarios/pacientes. El esquema privado no debe agregarse a los esquemas expuestos por Data API.

Pendiente: aplicar la migración y verificar políticas, concurrencia e importes en una base real. No se escribieron ni ejecutaron tests en esta etapa.

## Extensión de usuarios

202610220002_admin_users.sql incorpora private.app_accounts y private.account_audit, preserva la cuenta original y redefine los helpers de acceso. Los profesionales activos mantienen aislamiento por owner_id; el administrador no pasa has_app_access. Las RPCs admin_* solo admiten service_role y verifican al administrador actor. La función admin-users verifica la sesión y el rol antes de usar esas RPCs. El bloqueo no elimina cuentas ni registros financieros. Ver docs/admin-users.md.
