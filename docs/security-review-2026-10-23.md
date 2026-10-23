# Revisión de seguridad — 23/10/2026

Repositorio: `D:\dev\psico`, commit `4a5a561`.
Sitio: https://alvarezanibal.github.io/psico/.

No se encontró una vía anónima para consultar los datos en las comprobaciones realizadas. Se confirmó la falta de protección contra clickjacking en producción. También se identificaron un riesgo de aislamiento de sesiones condicionado al contenido que comparta el dominio y una limitación de recuperación ante compromiso de la cuenta visible en el código. No se confirmó una vulnerabilidad crítica o alta.

Se revisaron el frontend, las cinco migraciones SQL, las dos Edge Functions, administración, calendario, despliegue, dependencias y los siete commits disponibles localmente. Las comprobaciones remotas fueron acotadas y sin cambios de datos. No se usaron credenciales de usuarios, no se descargaron pacientes y no se ejecutaron pruebas de carga.

## 1. Falta de protección contra clickjacking

**Prioridad: media. Estado: ausencia de protección confirmada por HTTP; explotación interactiva no probada.**

La respuesta HTML de producción no incluye `Content-Security-Policy` ni `X-Frame-Options`. [index.html](../index.html) tampoco define una política CSP y el código no implementa una restricción de encuadre.

Otra página puede intentar mostrar la aplicación dentro de un `iframe` y superponer elementos para engañar al usuario sobre dónde hace clic. Si hay una sesión disponible dentro del marco, podría inducirse una acción administrativa, de agenda o de cobros. Esto depende del navegador y de sus restricciones al almacenamiento de terceros. No se afirma que un visitante anónimo pueda ejecutar esas acciones ni leer el contenido del marco.

**Corrección:** entregar el documento con `Content-Security-Policy: frame-ancestors 'none'` y, por compatibilidad, `X-Frame-Options: DENY`. Configurarlo en la capa que entrega HTTP. `frame-ancestors` no funciona dentro de un `<meta>`; si el alojamiento no permite esas cabeceras, utilizar una capa de publicación que sí las permita. [Referencia de MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

**Verificación posterior:** comprobar las cabeceras en la URL final y verificar que el navegador rechace cargarla en un `iframe` desde otro origen, sin modificar datos.

## 2. La sesión comparte el origen de otros posibles sitios de GitHub Pages

**Prioridad: media si existe contenido menos confiable en ese origen. Estado: configuración confirmada; no se buscó ni demostró una vulnerabilidad en otro sitio.**

[src/lib/supabase.ts:13–14](../src/lib/supabase.ts) crea el cliente con `persistSession: true`, sin almacenamiento personalizado. El SDK utiliza almacenamiento local del navegador. La app está bajo el origen `https://alvarezanibal.github.io`.

El navegador aísla `localStorage` por origen, no por la ruta `/psico/`. JavaScript de otra aplicación de ese origen puede acceder al mismo almacenamiento. Un XSS o una dependencia comprometida en esa otra aplicación podría exponer los tokens del consultorio cuando el usuario la visite. Cambiar el nombre de la clave de almacenamiento no establece aislamiento. [Referencia de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

**Corrección:** publicar el consultorio en un origen exclusivo, con contenido de confianza equivalente. Actualizar las URLs de Auth y los orígenes permitidos de la función administrativa. Para proteger los tokens con cookies `HttpOnly` haría falta un backend que gestione la sesión y las peticiones a Supabase; no alcanza con una opción del frontend.

**Verificación posterior:** confirmar que el origen definitivo sea distinto del usado por las demás aplicaciones. Si se comprueba almacenamiento entre rutas, usar un valor ficticio y nunca copiar tokens reales.

## 3. Restablecer la contraseña no revoca el enlace privado del calendario

**Prioridad: media para recuperación ante incidentes. Estado: comportamiento confirmado en el código; no probado con una cuenta real.**

[supabase/functions/admin-users/index.ts:110–119](../supabase/functions/admin-users/index.ts) actualiza la contraseña y llama a `admin_note_password_reset`. Esa función, en [202610220002_admin_users.sql:143–150](../supabase/migrations/202610220002_admin_users.sql), actualiza metadatos y auditoría, sin revocar la suscripción.

[202610230002_calendar_subscription.sql:83–110](../supabase/migrations/202610230002_calendar_subscription.sql) comprueba el hash del enlace y que la cuenta profesional esté activa; no comprueba cambios de contraseña. El enlace continúa vigente hasta su revocación o rotación explícita. El snapshot incluye el historial de sesiones sin filtro temporal, con iniciales o nombres según la preferencia elegida.

Si alguien obtuvo el enlace —o comprometió la cuenta y generó uno—, cambiar la contraseña no le quita ese acceso de lectura. Deshabilitar la cuenta lo interrumpe, pero habilitarla nuevamente permite usar el mismo enlace si no se revocó. Es una limitación del procedimiento de recuperación, no una debilidad de la aleatoriedad del token. Las suscripciones persistentes son una función deliberada y documentada.

**Corrección:** incorporar una operación explícita para recuperar una cuenta comprometida que revoque sesiones y enlaces de calendario. También puede asociarse la revocación al cambio administrativo de contraseña, explicando que será necesario volver a suscribirse. Como procedimiento inmediato, ante un incidente desactivar o regenerar el enlace desde Configuración, además de cambiar la contraseña.

**Verificación posterior, en un entorno de prueba:** crear una suscripción, comprobarla, recuperar la cuenta y confirmar que el enlace anterior responda 404 incluso después de habilitarla nuevamente. Esta secuencia no se ejecutó en producción.

## Comprobaciones realizadas

La clave publicada es una `publishable key`, prevista para el navegador: su presencia no es una filtración administrativa. No se detectó una clave `sb_secret_` ni un JWT `service_role` en el bundle principal inspeccionado. Tampoco se encontró una referencia a sourcemap en ese archivo.

| Comprobación remota | Resultado |
| --- | --- |
| HTML de GitHub Pages | HTTP 200; HTTPS con HSTS |
| Configuración pública de Auth | `disable_signup: true`; email habilitado |
| 11 tablas/vistas, `HEAD` con clave pública y `limit=0` | Todas HTTP 401 |
| 7 RPC de cuenta, acceso, configuración y resumen sin sesión | Todas HTTP 401, código `42501` |
| `admin_list_accounts`, UUID ficticio y sin sesión | HTTP 401, código `42501` |
| `calendar_feed_snapshot`, token ficticio y sin sesión | HTTP 401, código `42501` |
| Esquema `private` mediante Data API | HTTP 406 |
| `admin-users`, acción `list` sin sesión | HTTP 401 |
| `calendar-feed`, un único token ficticio de 64 ceros | HTTP 404 |

Tablas/vistas: `profiles`, `patients`, `sessions`, `payments`, `payment_allocations`, `audit_log`, `appointment_series`, `session_balances`, `patient_balances`, `payment_history`, `agenda_session_balances`.

RPC: `current_app_account`, `has_account_access`, `is_app_admin`, `has_app_access`, `is_app_owner`, `calendar_subscription_status`, `dashboard_summary`.

Las consultas `HEAD` no descargaron registros. Los resultados comprueban el rechazo al acceso anónimo en esas rutas; no demuestran por sí solos aislamiento entre usuarios autenticados ni seguridad de todos los métodos de escritura.

En el código se observaron RLS con propietario y cuenta activa, vistas `security_invoker`, funciones privilegiadas con `search_path` fijado y controles de autorización/pertenencia, RPC administrativas reservadas a `service_role`, claves foráneas que vinculan propietarios y operaciones de cobro transaccionales. `admin-users` valida JWT y rol activo antes de usar privilegios: su `verify_jwt = false` no equivale a omitir autenticación. No se encontraron usos propios de `dangerouslySetInnerHTML`, `eval` o SQL dinámico en las búsquedas. El calendario guarda el hash del token y responde con `no-store`.

`pnpm audit --json` terminó correctamente: **0 vulnerabilidades conocidas**, 170 dependencias totales informadas. Esto describe la base consultada en esta fecha; no garantiza ausencia de fallos desconocidos. Los imports npm de las Edge Functions fijan versiones, pero no se resolvió por separado su árbol de dependencias en Deno.

La búsqueda de patrones de claves privadas, claves secretas Supabase, tokens GitHub, claves AWS y JWT en los siete commits locales no encontró coincidencias. En el historial de `.env` solo apareció `.env.example`; `.env.local` no está versionado. No se cubren formatos arbitrarios de credenciales, referencias remotas no descargadas ni el estado privado de GitHub Actions.

## Endurecimiento y límites de la revisión

**Revocación de JWT:** los helpers comprueban `auth.uid()`, rol y estado activo, pero no la vigencia de `session_id` en `auth.sessions`. Un JWT emitido puede continuar autorizando Data API hasta expirar después de cerrar sesión, aunque se revoquen sus refresh tokens. Es una propiedad documentada de Supabase; no se midió el intervalo real del proyecto. Si se requiere revocación inmediata, añadir comprobación de sesión o una marca de revocación en los helpers de las políticas. No se afirma que el restablecimiento deje vigentes indefinidamente los refresh tokens. [Documentación de Supabase](https://supabase.com/docs/guides/auth/sessions).

**CSP general:** además del encuadre, limitar scripts, conexiones, objetos y URL base. No se encontró un XSS explotable; se trata de una defensa adicional faltante. Comprobar compatibilidad con Vite, Emotion/MUI y Supabase antes de aplicarla.

**Política real de Auth:** comprobar en el proyecto alojado longitud mínima de contraseña, protección frente a contraseñas filtradas, límites de intentos y duración de sesiones. El mínimo de 12 caracteres de `admin-users` no demuestra ese mínimo en todos los endpoints de Auth. `config.toml` no define esa política completa ni configura automáticamente el proyecto remoto. No se intentó cambiar contraseñas para verificarlo.

**MFA e inactividad:** TOTP no es obligatorio por decisión explícita documentada en el repositorio; no se clasificó como error accidental. Conviene reevaluar MFA y reautenticación para operaciones administrativas. No hay bloqueo por inactividad humana en el frontend; faltan comprobar los límites reales de Auth. Las consultas periódicas de la app no equivalen a actividad humana.

**Validación autenticada pendiente:** con dos profesionales y un administrador de prueba, verificar lecturas/escrituras cruzadas, manipulación de propietarios y pacientes, RPC administrativas invocadas por profesionales, bloqueo con JWT previos y recuperación completa. Leer las migraciones no acredita el esquema realmente desplegado.

No se contó con conexión administrativa a PostgreSQL ni cuentas de prueba. No se comprobaron backups/restauración, permisos privados de GitHub, configuración completa del proveedor, carga ni explotación de interfaces autenticadas. No se modificó código de la aplicación, configuración remota, usuarios ni datos; se agregó únicamente este informe.
