# Horarios fijos y cambios de una fecha

## Activación

Con las migraciones anteriores aplicadas, abrí Supabase → SQL Editor → New query. Copiá y ejecutá completo, una sola vez:

`supabase/migrations/202610230001_recurring_appointments.sql`

No requiere otra Edge Function, claves nuevas ni cambios de Auth. El frontend debe incluir esta actualización. Hasta aplicar la migración, la agenda conserva sus sesiones manuales anteriores; no se pueden guardar horarios fijos.

## Uso

- **Nuevo/Editar paciente → Horario fijo → Repetir todas las semanas / Configurar horario semanal:** elegí fecha de inicio, día, hora y duración habitual. Se repite sin fecha de fin. El primer turno cae en el día elegido a partir de esa fecha.
- **Mover una fecha:** abrí el turno del calendario, dejá **Solo este turno**, cambiá fecha/hora y guardá. Si el lunes pasa al martes, desaparece el lunes de esa semana y aparece el martes. También funciona si se mueve a otra semana, incluso al navegar únicamente por la fecha original. Los demás lunes siguen iguales.
- **Cancelar una fecha:** cambiá su estado a Cancelada. Se muestra cancelada en su fecha, sin deuda por defecto; los siguientes turnos continúan. Una ausencia funciona de la misma manera.
- **Cambiar desde un turno en adelante:** en un turno fijo futuro todavía no registrado, elegí **Este y los siguientes**. La fecha/hora elegidas serán el primer turno de la nueva serie; la antigua se corta desde la fecha original (o antes si adelantaste el primer turno). Se conserva el historial anterior. Para otros cambios, editá el horario fijo desde el paciente.
- **Quitar la repetición:** editá el paciente y elegí **Quitar horario fijo desde una fecha**. Las modificaciones generales se admiten desde hoy. Si ya hay un cambio futuro programado, elegí una fecha igual o posterior a su inicio.

Los turnos manuales futuros del mismo paciente que ya coincidan exactamente con el día y hora de una nueva serie se vinculan a ella, conservando sus importes y estados. Si hay varios turnos manuales para la misma ocurrencia, se rechaza el alta de la serie hasta revisar esos duplicados.

## Historia y límites actuales

Consultar un mes o año no crea sesiones ni deudas. Una ocurrencia se registra cuando se edita o se marca su estado. Sesiones/Pagos mantienen el historial registrado; los turnos previstos se consultan en Calendario e Inicio. Los turnos previstos usan el honorario habitual vigente; una vez registrados conservan su precio.

Cambiar una serie no borra ni desplaza silenciosamente excepciones o sesiones ya registradas. Si existen ocurrencias individuales desde el corte, se rechaza el cambio general: revisalas y elegí una fecha posterior al último turno individual afectado. Los turnos pagados conservan las restricciones de edición existentes. Una edición concurrente o un reintento no puede crear dos sesiones para la misma clave; ante conflicto, actualizá la agenda.

Archivar corta la repetición, conservando el historial y los turnos individuales ya agendados, que deben revisarse por separado. Reactivar no reinicia automáticamente la serie. Las fechas y horas se interpretan en Buenos Aires. Cada profesional ve únicamente sus series y sesiones.

La serie y cada ocurrencia conservan identidad estable para exportar más adelante a Apple Calendar sin duplicar el turno original. La suscripción Apple todavía no está implementada.

Por pedido del usuario no se crearon ni ejecutaron tests. La migración no fue ejecutada contra Supabase desde este entorno; la compilación y la comprobación de tipos no validan SQL ni autorización en producción.