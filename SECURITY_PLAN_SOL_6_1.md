# Plan de correcciones de seguridad para Sol 6.1

Fecha: 23/10/2026. Base revisada: `4a5a561`, rama `main`.

Este documento es una especificación de implementación. La solicitud actual autoriza crear y subir el plan; las correcciones todavía no están implementadas. Leer primero [la revisión de seguridad](docs/security-review-2026-10-23.md) y las instrucciones vigentes de [IMPLEMENTATION_PLAN_SOL_6_1.md](IMPLEMENTATION_PLAN_SOL_6_1.md). Registrar el avance en el apartado de progreso de ese último archivo, sin abrir otro registro paralelo.

## Resultado esperado

Resolver la falta de protección contra clickjacking, separar la sesión de otros sitios que comparten el dominio de GitHub Pages y completar la recuperación de cuentas para invalidar enlaces de calendario y sesiones anteriores. Conservar pacientes, agenda, pagos, roles y experiencia habitual de trabajo.

El informe no confirmó exposición anónima de pacientes ni una vulnerabilidad crítica. No presentar los riesgos condicionados como ataques demostrados. Las comprobaciones autenticadas y la configuración privada de Supabase siguen pendientes.

## Instrucción inicial para Sol 6.1

> Leé SECURITY_PLAN_SOL_6_1.md, docs/security-review-2026-10-23.md y las instrucciones vigentes de IMPLEMENTATION_PLAN_SOL_6_1.md. Implementá las correcciones por fases, empezando por recuperación y autorización. Prepará una publicación con origen exclusivo y cabeceras HTTP. Conservá las reglas de dinero, la separación de profesionales y el TOTP opcional. No agregues frameworks ni suites de tests: documentá la matriz de validación y mantené pendiente lo que requiera cuentas o infraestructura no disponibles. Si falta acceso externo, completá el código, migraciones y procedimiento ejecutable que puedan prepararse localmente. No declares corregida la producción por haber compilado. Registrá cambios, verificaciones reales y pendientes en el registro de progreso existente.

## Límites y decisiones de implementación

- Mantener React/Vite/MUI/Supabase, HashRouter, idioma español argentino y zona horaria existente. No introducir un backend de sesiones nuevo para esta corrección.
- Conservar exactamente los roles `admin` y `professional`; las nuevas RPC administrativas no deben devolver pacientes, agenda ni movimientos al administrador.
- No reactivar el requisito de MFA sin un cambio explícito de la decisión vigente. Documentarlo como mejora posterior.
- Crear migraciones nuevas posteriores a `202610230002`; no editar ni reaplicar las migraciones históricas como solución de actualización.
- Mantener fuera del repositorio claves privadas, contraseñas, tokens, enlaces reales de calendario y volcados de datos.
- Conservar el pedido vigente de no escribir ni ejecutar suites de tests. Realizar typecheck/build cuando cambie código. La matriz de seguridad de este plan es un criterio de aceptación pendiente de ejecución en un entorno apropiado; no instalar infraestructura de testing para completar casillas.
- La alternativa de publicación propuesta es un proyecto estático exclusivo con soporte de cabeceras, por ejemplo Cloudflare Pages. No hace falta comprar un dominio: un hostname exclusivo del proyecto puede cumplir el aislamiento. Si ya hay otro proveedor disponible con ambas capacidades, usarlo. Documentar la decisión concreta antes de configurar producción.
- No considerar CORS, un nuevo nombre para la clave de localStorage o un cambio de ruta como sustitutos de aislamiento de origen y autorización en el servidor.

## Fase 1 — Recuperación de acceso y revocación

**Archivos principales:** nueva migración SQL; `supabase/functions/admin-users/index.ts`; `src/features/admin/api.ts`; `src/features/admin/Users.tsx`; `src/features/auth/Auth.tsx`; `src/lib/access.ts`; documentación administrativa y de Apple Calendar.

### 1.1. Contrato de producto

El restablecimiento administrativo de contraseña pasará a recuperar el acceso completo: cambiar credenciales, invalidar sesiones anteriores y desactivar el enlace privado del calendario. Antes de confirmar, explicar al administrador: “Se cerrarán las sesiones anteriores y se desactivará el enlace de Apple Calendar. El usuario deberá volver a ingresar y crear un nuevo enlace”.

No habilitar automáticamente una cuenta que ya estaba bloqueada. No permitir que un profesional invoque esta operación ni ampliar el panel para recuperar administradores. Documentar la recuperación de un administrador como un procedimiento del operador de Supabase.

### 1.2. Migración y autorización

1. Agregar el estado mínimo privado para una recuperación reanudable: identificador de operación, actor, usuario objetivo, estado pendiente/completado y fechas. Una recuperación pendiente debe impedir el acceso de la cuenta. Los clientes no tendrán permisos directos sobre ese estado.
2. Crear RPC administrativas para iniciar y completar la operación, solo ejecutables por `service_role`, con validación de administrador activo, usuario profesional objetivo y bloqueo por usuario. La identidad del actor debe seguir procediendo del JWT validado por el handler, nunca del cuerpo enviado por el navegador.
3. En la transacción inicial marcar la recuperación pendiente, revocar `private.calendar_subscriptions.token_hash`, actualizar revisión/fechas y registrar auditoría sin secretos. La ausencia de suscripción debe ser un caso válido. Repetir el mismo identificador debe recuperar el mismo estado sin iniciar otra operación; un identificador ya usado no puede cambiar de actor u objetivo. Impedir dos recuperaciones simultáneas del mismo usuario.
4. Agregar una comprobación central de sesión válida en un helper privado `security definer` con `search_path` fijo. Validar que el `session_id` del JWT corresponda a una fila de `auth.sessions` del mismo `auth.uid()`. Claims ausentes o malformados deben denegar acceso. No exponer esa tabla ni permitir al navegador consultar o alterar sesiones ajenas.
5. Usar el helper, el estado activo y la ausencia de recuperación pendiente desde `has_app_access`, `has_account_access`, `is_app_admin` y `current_app_account`, manteniendo las condiciones de propietario en RLS. Revisar `is_app_owner`, `private.require_access` y todos los caminos de escritura para evitar un bypass. El frontend debe retirar la sesión y el caché al detectar revocación; el control efectivo seguirá siendo SQL.
6. Incorporar un límite temporal privado de sesiones válidas, inicialmente sin efecto sobre sesiones existentes, si se necesita invalidar sesiones creadas durante la recuperación o durante la migración de origen. Compararlo con la creación de la sesión identificada por `session_id`, no solamente con `iat`: renovar un token de una sesión antigua no debe volver a habilitarla. Actualizar el límite al completar la recuperación. La sesión nueva debe iniciarse después de ese punto.
7. `calendar_feed_snapshot` debe seguir requiriendo profesional activo y token válido, y rechazar una cuenta con recuperación pendiente. No introducir un JWT obligatorio en el feed: Apple sigue autenticando mediante el enlace revocable.
8. Mantener permisos mínimos, RLS y las firmas que necesite el frontend anterior durante el despliegue. No agregar fallbacks que omitan los controles nuevos cuando falte una migración.

La lectura de `auth.sessions` debe comprobarse con el esquema realmente disponible. Supabase documenta la validación de `session_id` para impedir el uso de JWT después del cierre de sesión; no exponer ni modificar indiscriminadamente tablas internas de Auth. [Referencia](https://supabase.com/docs/guides/auth/sessions).

### 1.3. Orquestación de la Edge Function

1. Agregar `request_id` al restablecimiento, generado una vez por el diálogo y conservado durante los reintentos. Guardar solo identificadores y estados en SQL; nunca la contraseña ni una huella derivada de ella.
2. Mantener validación del JWT, rol, CORS y Zod. Iniciar la recuperación mediante la RPC antes de cambiar la contraseña en Auth.
3. Cambiar la contraseña con la API administrativa existente. Confirmar el comportamiento de revocación de sesiones/refresh tokens en la versión desplegada de Supabase y conservar evidencia en un entorno de prueba. No inventar una llamada `signOut(user_id)` ni usar el token del administrador para cerrar la sesión del profesional.
4. Completar la recuperación solo después de que Auth confirme la operación. La última transacción debe conservar el bloqueo administrativo previo, establecer el corte final de sesiones válidas, finalizar auditoría y levantar únicamente el estado de recuperación pendiente. El enlace anterior permanece revocado.
5. Ante timeout o fallo parcial, mantener acceso bloqueado y enlace revocado, devolver un error accionable y permitir reanudar con la misma operación. No devolver éxito ni habilitar acceso si Auth quedó en estado incierto. Si la operación ya terminó, un reintento no debe volver a cambiar credenciales ni revocar una sesión recién iniciada.
6. Definir la recuperación operativa de una operación pendiente cuando se cierre el diálogo o se pierda la respuesta: identificarla sin secretos, permitir su reanudación autorizada y evitar que un intento nuevo la pise silenciosamente. No liberar un bloqueo automáticamente por antigüedad.

Auth y la base de aplicación no forman una única transacción. El orden anterior prioriza bloquear el acceso ante una interrupción. No mantener una transacción SQL abierta durante una llamada HTTP. Revisar la API y la implementación oficial de Auth, sin asumir que la rama `master` representa la versión del proyecto. [API administrativa](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [implementación de referencia](https://github.com/supabase/auth/blob/master/internal/api/admin.go).

**Aceptación:** después de una recuperación completa, JWT y refresh tokens antiguos no recuperan acceso, el enlace previo responde 404 incluso tras deshabilitar/habilitar la cuenta, un nuevo ingreso funciona para una cuenta habilitada y una nueva suscripción funciona. Un fallo intermedio no deja acceso abierto. No cambian pacientes, cobros ni permisos entre profesionales.

## Fase 2 — Cabeceras y origen exclusivo

**Archivos principales:** configuración del alojamiento; archivo de cabeceras si corresponde; `vite.config.ts`; `.env.example`; configuración/workflow de publicación; configuración de orígenes de `admin-users`; `docs/deployment.md`.

1. Elegir un hostname exclusivo para el consultorio y un mecanismo real de cabeceras HTTP. GitHub puede continuar alojando el repositorio aunque el frontend cambie de alojamiento. No mantener dos publicaciones operativas como solución definitiva.
2. Para Cloudflare Pages, preparar `public/_headers` para que Vite lo copie a `dist/_headers`, con reglas aplicables a todo el sitio. Ese archivo solo funciona cuando el proveedor lo interpreta; subirlo a GitHub Pages no demuestra que las cabeceras se apliquen. Si se agregan funciones del proveedor, comprobar sus respuestas por separado. [Documentación oficial](https://developers.cloudflare.com/pages/configuration/headers/).
3. Definir como mínimo `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y una política de referencia restrictiva. `frame-ancestors` debe ir en HTTP; no usar un `<meta>` ni JavaScript de escape de frames como corrección definitiva. [Referencia](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).
4. Preparar una CSP general a partir de los recursos realmente utilizados: `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`; restringir conexiones al proyecto Supabase concreto y agregar WebSocket únicamente si se utiliza. Ajustar imágenes, fuentes y estilos según el bundle real. No agregar comodines generales, `unsafe-eval` ni `unsafe-inline` para scripts. Si MUI/Emotion requiere una excepción de estilos, limitarla a estilos y documentarla; no inventar nonces estáticos como si fueran dinámicos.
5. Cuando se necesite ajustar la CSP general, usar Report-Only temporalmente sin quitar el bloqueo efectivo de encuadre. Pasar a enforcement después de revisar el flujo real. No enviar informes con datos de pacientes a terceros no configurados para ese fin.
6. Preparar `VITE_BASE_PATH=/` para un sitio en la raíz del nuevo origen; conservar HashRouter y manejar correctamente callback PKCE. Mantener URL y publishable key como únicas credenciales Supabase del bundle.
7. Separar los orígenes de desarrollo y producción de `admin-users`; quitar localhost de la lista productiva salvo necesidad real documentada. Si no está configurado un origen productivo válido, fallar con una indicación de configuración sin abrir CORS. CORS no reemplaza la autenticación ni impide clientes fuera del navegador.

**Aceptación:** el sitio real devuelve las cabeceras; un iframe de otro origen es rechazado; login, panel administrativo, diálogos, calendario, tema y callback siguen funcionando. La sesión se almacena en el origen exclusivo, sin compartir origen con otras aplicaciones. No basta cambiar `storageKey`: localStorage se separa por origen. [Referencia](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

## Fase 3 — Transición de producción y configuración de Auth

Esta fase requiere el destino concreto y acceso a la configuración externa. Si faltan, dejar preparado el procedimiento y señalar exactamente el dato o acceso pendiente; continuar las fases locales independientes. No poner valores ficticios en una configuración productiva activa.

1. Documentar el estado inicial y el orden de activación. Revisar la migración en un entorno aislado y disponer de una recuperación de configuración/backup apropiada antes de cambiar la base operativa.
2. Aplicar la nueva migración, desplegar el handler compatible y después el frontend. Prever una respuesta clara para clientes antiguos que no envíen `request_id`; nunca dejarlos usar una ruta antigua sin revocación. La migración inicial no debe invalidar todas las sesiones por accidente.
3. Publicar el nuevo sitio con las variables públicas, cabeceras y HTTPS. Actualizar Site URL y URLs de redirección de Auth con las rutas exactas, y `ALLOWED_ORIGINS` con el origen definitivo. Verificar login y callbacks antes de retirar el sitio previo.
4. Sustituir la app en GitHub Pages por una página mínima de traslado o desactivar esa publicación. No dejar disponible una interfaz operativa de login en el origen compartido ni restaurar su bundle en un despliegue futuro. Una página de traslado no debe cargar Supabase ni copiar tokens a URL, parámetros, fragmentos o mensajes entre ventanas.
5. Incluir un corte controlado de sesiones previas a la migración de origen mediante la capacidad de revocación preparada. El nuevo sitio debe pedir un inicio de sesión nuevo; no migrar localStorage entre dominios. Retirar los callbacks y CORS productivos del origen anterior al terminar. Esa retirada por sí sola no invalida JWT ni refresh tokens.
6. Actualizar README, guía de despliegue, instrucciones administrativas y avisos de recuperación. Explicar que Apple puede conservar eventos ya descargados y que revocar un enlace detiene futuras consultas, no borra copias existentes.
7. Comprobar en Supabase el mínimo de contraseña de 12 caracteres, las opciones de protección frente a contraseñas filtradas, los límites de intentos y las duraciones de sesión. Registrar las opciones efectivamente disponibles en el plan contratado. No atribuir al frontend o a `config.toml` cambios que deban hacerse en el proyecto alojado. No modificar la política vigente de MFA como parte de este trabajo.
8. Retirar o adaptar el workflow antiguo para que una ejecución manual futura no vuelva a publicar la app en el origen compartido. El cambio de hosting no requiere convertir el despliegue en automático.

**Vuelta atrás:** restaurar una versión compatible del frontend sobre el origen protegido. Conservar las nuevas columnas, auditoría, revocaciones y restricciones de SQL; no recuperar tokens revocados ni reabrir sesiones para resolver un error de publicación. Si una recuperación quedó pendiente, usar el procedimiento de reanudación. No marcar resuelto el aislamiento si se vuelve a servir la app operativa desde la URL compartida.

## Fase 4 — Verificación acotada y entrega

Cuando cambie código, ejecutar una vez por lote coherente `pnpm typecheck` y `pnpm build`. Ejecutar `pnpm audit --json` al cierre o si cambian dependencias, sin actualizar paquetes indiscriminadamente. Revisar SQL, permisos, `search_path`, conservación de propietario y ausencia de secretos en el diff y el bundle. Esas comprobaciones no acreditan la seguridad del esquema alojado.

Mantener esta matriz como validación funcional/de seguridad pendiente hasta poder realizarla con datos sintéticos y cuentas de prueba. No ejecutarla sobre pacientes reales ni crear una suite nueva bajo la restricción vigente de testing.

| Escenario | Resultado requerido |
| --- | --- |
| Anónimo en tablas, vistas y RPC protegidas | Denegación; registro público cerrado |
| Profesional A usa IDs de B para leer o escribir | Sin datos de B ni cambios; incluir RPC de agenda, cobros y calendario |
| Profesional invoca administración o falsifica actor | Denegación en servidor |
| Administrador consulta tablas de pacientes/cobros | Denegación pese a poder administrar cuentas |
| Recuperación con JWT y refresh token previos | Acceso anterior revocado; nuevo login autorizado solo si corresponde |
| Enlace de calendario anterior tras recuperación y reactivación | 404; nuevo enlace de esa cuenta funciona |
| Respuesta perdida, reintento y recuperación concurrente | Operación recuperable, sin doble cambio ni reapertura accidental |
| Cuenta previamente bloqueada | Continúa bloqueada tras cambiar contraseña |
| Logout y reutilización del JWT anterior | Denegación inmediata mediante validación de sesión |
| Cabeceras e iframe desde otro origen | Cabeceras presentes y encuadre bloqueado |
| Nuevo origen y retirada del anterior | Sin login operativo previo ni traslado de tokens; sesión nueva requerida |
| Flujo habitual de pacientes, turnos, pagos y Apple | Sin regresiones ni alteración de información histórica |

Conservar como evidencia solo fecha, commit, entorno, pasos, códigos de estado y resultado. No adjuntar tokens, nombres, contraseñas ni enlaces privados. Marcar cada escenario como comprobado, fallido o pendiente; no confundir una revisión estática con una prueba ejecutada.

## Entregables y criterio de finalización

- Migración nueva, handler y frontend coherentes, con recuperación reanudable y denegación efectiva de sesiones anteriores.
- Configuración de publicación versionada para cabeceras HTTP y origen exclusivo.
- Procedimiento concreto de actualización, retirada del sitio anterior y recuperación ante fallos.
- Documentación de las nuevas consecuencias del restablecimiento y de los ajustes reales de Auth.
- Registro de progreso actualizado con verificaciones realizadas y dependencias externas pendientes.

Separar “implementado en el repositorio”, “desplegado” y “verificado en producción”. La tarea completa no termina con el build: requiere las cabeceras del sitio final, aislamiento efectivo, revocación comprobada y validación de permisos. Si falta infraestructura o cuentas de prueba, entregar el código y el procedimiento preparados e indicar qué parte continúa pendiente, sin afirmar que el riesgo está resuelto.
