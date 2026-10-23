# Apple Calendar

La aplicación publica una suscripción iCalendar de solo lectura. Los cambios se hacen en la app; Apple consulta el enlace periódicamente. No se solicita la contraseña ni acceso a la cuenta Apple.

## 1. Supabase: migración

Con todas las migraciones anteriores aplicadas (incluidos usuarios administrados y turnos recurrentes), abrí **SQL Editor → New query** y ejecutá completo, una sola vez:

`supabase/migrations/202610230002_calendar_subscription.sql`

Agrega enlaces privados por profesional, controles de activación/revocación y un snapshot de agenda que solo puede consultar el servidor con un token válido. No altera precios, deudas, pagos ni horarios.

## 2. Supabase: función

En **Edge Functions → Deploy a new function → Via Editor**:

1. Nombre exacto: **calendar-feed**.
2. Reemplazá el contenido del editor por todo `supabase/functions/calendar-feed/index.ts` y desplegá.
3. En la configuración de **calendar-feed**, desactivá **Verify JWT / Enforce JWT verification**. Apple consulta el enlace sin sesión de Supabase: esta función autoriza mediante el token privado y comprueba en SQL que el profesional siga activo. No cambies otras funciones.
4. Conservá las claves de servidor que Supabase inyecta automáticamente. El handler admite `SUPABASE_SECRET_KEYS` o `SUPABASE_SERVICE_ROLE_KEY`. No hace falta agregar claves al frontend ni configurar correo, OAuth o contraseñas Apple.

Es un archivo autocontenido. No hace falta copiar runtime.d.ts ni instalar dependencias manualmente. Alternativa con CLI ya instalado/autenticado: `supabase functions deploy calendar-feed --project-ref TU_PROJECT_REF` (config.toml incluye verify_jwt=false para esta función).

## 3. Aplicación: crear el enlace

En **Configuración → Apple Calendar**, elegí si querés iniciales (predeterminado) o nombres completos, y presioná **Crear enlace privado**.

Copiá el enlace y agregalo como suscripción en iPhone o Mac siguiendo el paso siguiente. Solo se muestra al crearlo; no se guarda en localStorage ni en el cache de consultas. Generar otro invalida el anterior y requiere reemplazar la suscripción en Apple. Cambiar la preferencia de nombres conserva el mismo enlace.

El enlace da acceso de lectura a la agenda: tratálo como una credencial. La base guarda únicamente su hash. No lo publiques ni lo incluyas en capturas o mensajes de soporte.

## 4. Apple: suscribirse

- **iPhone/iPad:** Calendario → Calendarios → Agregar calendario → Agregar calendario de suscripción. Pegá el enlace, confirmá y elegí la cuenta iCloud si querés verlo en todos tus dispositivos.
- **Mac:** Calendario → Archivo → Nueva suscripción a calendario. Pegá el enlace, elegí iCloud y la frecuencia de actualización disponible.

Agregá una **suscripción mediante URL**, no una importación puntual del archivo .ics. Suscribirse nuevamente sin quitar la suscripción anterior puede mostrar duplicados aunque el feed tenga una sola ocurrencia. [Instrucciones de Apple](https://support.apple.com/en-us/102301).

La actualización depende de Apple y no es instantánea. En Mac se puede usar Ver → Actualizar calendarios y ajustar la actualización automática en la información de la suscripción. [Actualización de calendarios en Mac](https://support.apple.com/en-gb/guide/calendar/icl1024/mac).

## Comportamiento y límites

- Exporta sesiones manuales y series semanales sin horizonte artificial ni fecha de fin agregada. Un snapshot JSON evita truncamiento por el límite de filas de la API.
- Una fecha movida usa la identidad original de la serie/ocurrencia: el martes reemplaza al lunes; no se exporta una segunda sesión independiente. Cancelaciones llevan estado CANCELLED. Un cambio de serie corta la anterior y exporta la nueva.
- Archivar conserva los turnos individuales que la app mantiene: se incluyen como excepciones explícitas, incluso si quedaron fuera del período de repetición. No se revive la serie cerrada.
- Las iniciales/nombres son configurables; no se exportan importes, deudas, datos de contacto ni información clínica. Cada enlace consulta únicamente a su profesional. El rol administrador no concede acceso a estas operaciones.
- La cuenta deshabilitada o el enlace revocado responde 404 en las siguientes consultas. Apple puede conservar lo ya descargado; para retirarlo del dispositivo, eliminá la suscripción.
- El feed no crea sesiones ni deudas. Las claves privilegiadas quedan en el servidor. Los cambios de agenda incrementan una revisión para que Apple pueda reconocer modificaciones, incluso dentro del mismo segundo.
- La función no registra URLs, tokens ni contenido de la agenda. La infraestructura de transporte puede conservar registros de solicitudes; por eso el enlace se considera una credencial revocable.

Por pedido del usuario no se agregaron ni ejecutaron tests. Tipos del frontend/handler y build comprobados. La migración, la función desplegada y la suscripción en un dispositivo Apple quedan pendientes de activación/validación manual en el proyecto del usuario.

Referencias técnicas: [iCalendar RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), [zona horaria IANA](https://data.iana.org/time-zones/tzdb/southamerica), [claves de Edge Functions](https://supabase.com/docs/guides/functions/secrets).